import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function load(name){const module={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../dist/'+name,import.meta.url),'utf8'),{module});return module.exports;}
const tuner=load('violin-tuner.js'),pitch=load('pitch.js');
const hz=(target,a4=440)=>a4*2**(({G3:55,D4:62,A4:69,E5:76}[target]-69)/12);
const meta=(extra={})=>({valid:true,confidence:.99,rms:.15,peak:.25,gate:.008,...extra});
function fixture(settings={}){let now=0;const model=tuner.create({now:()=>now,...settings});return {model,advance(ms=40){now+=ms;},setTime(value){now=value;},hold(frequency,analysis=meta(),count=12){let value;for(let i=0;i<count;i++){value=model.update(frequency,analysis);now+=40;}return value;}};}
test('all four target strings and A4 references compute directions from the target, across semitone boundaries',()=>{
 for(const target of ['G3','D4','A4','E5'])for(const a4 of [400,440,442,480])for(const cents of [-100,-60,-10,10,60,100]){
  const h=fixture({target,a4}),frequency=hz(target,a4)*2**(cents/1200),s=h.hold(frequency);
  assert.equal(s.direction,cents<0?'tighten':'loosen');assert.equal(s.state,cents<0?'low':'high');assert.ok(Math.abs(s.cents-cents)<.1);assert.equal(s.targetHz,hz(target,a4));assert.notEqual(s.state,'in-tune');
 }
});
test('near target is listening until a continuous stable window; initial readings are never green',()=>{
 const h=fixture();let s=h.model.update(440,meta());assert.equal(s.state,'listening');assert.equal(s.stable,false);assert.equal(s.direction,'none');
 for(let i=0;i<8;i++){h.advance();s=h.model.update(440,meta());assert.notEqual(s.state,'in-tune');}
 h.advance();s=h.model.update(440,meta());assert.equal(s.state,'in-tune');assert.equal(s.stable,true);assert.equal(s.direction,'hold');
});
test('silence, uncertainty, missing metadata, clipping, other strings and octaves clear prior green state',()=>{
 for(const [frequency,analysis,name]of [[0,meta({valid:false,reason:'below-noise-gate',rms:0}),'no-input'],[440,meta({valid:false,reason:'ambiguous-octave'}),'uncertain'],[440,{},'uncertain'],[440,meta({clipping:true}),'overload'],[440,meta({peak:1}),'overload'],[hz('D4'),meta(),'wrong-string'],[880,meta(),'wrong-string'],[220,meta(),'wrong-string']]){
  const h=fixture();assert.equal(h.hold(440).state,'in-tune');const s=h.model.update(frequency,analysis);assert.equal(s.state,name);assert.equal(s.stable,false);assert.equal(s.cents,null);assert.equal(s.direction,'none');
 }
});
test('stale callbacks and large analysis gaps cannot accumulate a stable hold',()=>{
 const h=fixture();assert.equal(h.hold(440).state,'in-tune');h.advance(501);let s=h.model.snapshot();assert.equal(s.state,'no-input');assert.equal(s.frequency,null);assert.equal(s.cents,null);
 for(let i=0;i<10;i++){h.advance(200);s=h.model.update(440,meta());assert.notEqual(s.state,'in-tune');}
});
test('jitter and target changes reset stability; reference changes recompute pitch',()=>{
 const h=fixture();for(let i=0;i<20;i++){h.advance();const s=h.model.update(440*2**((i%2?4:-4)/1200),meta());assert.notEqual(s.state,'in-tune');}
 assert.equal(h.hold(440).state,'in-tune');let s=h.model.setTarget('E5');assert.equal(s.cents,null);assert.equal(s.stable,false);assert.ok(Math.abs(s.targetHz-659.255)<.01);
 s=h.model.setReference(442);assert.ok(Math.abs(s.targetHz-hz('E5',442))<1e-9);assert.equal(s.state,'waiting');
 assert.throws(()=>h.model.setTarget('B4'));assert.throws(()=>h.model.setReference(0));
});
test('reference suppression clears readings, ignores speaker tone and starts a fresh stable window afterwards',()=>{
 const h=fixture();h.hold(440);let s=h.model.suppressFor(2000);assert.equal(s.state,'reference');
 for(let i=0;i<10;i++){h.advance(100);s=h.model.update(440,meta());assert.equal(s.state,'reference');assert.equal(s.stable,false);}
 h.advance(1001);s=h.model.update(440,meta());assert.equal(s.state,'listening');assert.equal(s.stable,false);assert.equal(h.hold(440).state,'in-tune');
});
test('clock rewind resets stale state rather than preserving green or a future suppression forever',()=>{
 const h=fixture();h.hold(440);h.setTime(-100);let s=h.model.snapshot();assert.equal(s.state,'waiting');assert.equal(s.stable,false);
 h.model.suppressFor(1000);h.setTime(-200);s=h.model.snapshot();assert.equal(s.state,'waiting');assert.equal(s.cents,null);
});
test('noise gate has an actual retrievable state and detector reports gate and overload metadata',()=>{
 assert.equal(pitch.setGate(.02),.02);assert.equal(pitch.getGate(),.02);const wave=Float32Array.from({length:4096},(_,i)=>.01*Math.sin(2*Math.PI*440*i/48000));const result=pitch.estimatePitch(wave,48000);assert.equal(result.reason,'below-noise-gate');assert.equal(result.gate,.02);assert.ok(result.peak>0);assert.equal(result.clipping,false);pitch.setGate(.008);
});
test('model snapshots are copies and preserve supported actual microphone settings for the UI',()=>{
 const h=fixture(),s=h.model.update(440,meta({inputSettings:{sampleRate:48000,noiseSuppression:false}}));assert.equal(s.actualInputSettings.sampleRate,48000);s.actualInputSettings.sampleRate=1;assert.equal(h.model.snapshot().actualInputSettings.sampleRate,48000);
});
test('strong close nonharmonic tones are uncertain instead of green',()=>{
 const waveform=Float32Array.from({length:4096},(_,i)=>.2*Math.sin(2*Math.PI*440*i/48000)+.17*Math.sin(2*Math.PI*487*i/48000));const analysis=pitch.estimatePitch(waveform,48000);assert.equal(analysis.valid,false);const h=fixture();assert.notEqual(h.hold(analysis.frequency,analysis).state,'in-tune');
});
test('two equal peak samples in a pure sine are not mistaken for a clipping plateau',()=>{
 const sampleRate=48000,frequency=sampleRate/22,wave=Float32Array.from({length:4096},(_,i)=>.25*Math.sin(2*Math.PI*i/22));const result=pitch.estimatePitch(wave,sampleRate);assert.equal(result.clipping,false);assert.equal(result.valid,true);assert.ok(Math.abs(result.frequency-frequency)<1);
});
test('generated waveform matrix preserves ordinary single tones and rejects tested octave, double-tone, noise and clipping ambiguities',()=>{
 let seed=7;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296-.5;};
 for(const sampleRate of [44100,48000])for(const target of ['G3','D4','A4','E5'])for(const kind of ['sine','harmonic','weak','quiet','clipped','noisy','noise','double']){
  const frequency=hz(target),wave=Float32Array.from({length:4096},(_,i)=>{const w=2*Math.PI*frequency*i/sampleRate;return kind==='sine'?.25*Math.sin(w):kind==='harmonic'?.12*Math.sin(w)+.22*Math.sin(2*w)+.08*Math.sin(3*w):kind==='weak'?.002*Math.sin(w)+.25*Math.sin(2*w)+.002*Math.sin(3*w):kind==='quiet'?.004*Math.sin(w):kind==='clipped'?Math.max(-.2,Math.min(.2,1.2*Math.sin(w))):kind==='noisy'?.2*Math.sin(w)+.1*random():kind==='noise'?.3*random():.2*Math.sin(w)+.2*Math.sin(1.5*w);});
  const result=pitch.estimatePitch(wave,sampleRate),accepted=['sine','harmonic','noisy'].includes(kind);assert.equal(result.valid,accepted,target+' '+sampleRate+' '+kind);if(kind==='sine')assert.ok(Math.abs(1200*Math.log2(result.frequency/frequency))<1);
 }
});
