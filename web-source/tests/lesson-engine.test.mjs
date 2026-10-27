import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function read(file){const module={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),{module,globalThis:{},setInterval,clearInterval});return module.exports;}
const api=read('lesson-engine.js'),data=read('lesson-data.js');
const plain=value=>JSON.parse(JSON.stringify(value));
const lesson=()=>plain(data.lessons[2]);
const hz=midi=>440*2**((midi-69)/12),valid={valid:true,confidence:.96};
function harness(config={}){
  const calls=[],states=[],errors=[],intervals=new Map(),listeners=new Map();let time=0,sequence=0,stops=0;
  const context={currentTime:0,state:'running'};
  const audio={stop(){stops++;},async ready(){return config.ready?config.ready():context;},async play(plan,settings){const call={plan,settings};calls.push(call);if(config.play)return config.play(call);settings.onPosition?.(0,0,plan.at(-1).end);return {started:true};}};
  const environment={document:{hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},setInterval:fn=>{intervals.set(++sequence,fn);return sequence;},clearInterval:id=>intervals.delete(id)};
  const engine=api.create({audioEngine:audio,environment,now:()=>time,onState:s=>states.push(s),onError:e=>errors.push(e)});
  engine.load(lesson());return {engine,calls,states,errors,environment,intervals,listeners,context,stops:()=>stops,advance:ms=>time+=ms,tick:seconds=>{if(engine.state().mode==='listen'){context.currentTime=seconds;for(const fn of [...intervals.values()])fn();}else calls.at(-1).settings.onPosition(0,seconds,99);},sample(midi,ms=80,meta=valid){time+=ms;return engine.ingestPitch(hz(midi),meta);}};
}
function video(){const listeners=new Map();let frame=null;return {paused:true,ended:false,currentTime:0,playbackRate:1,muted:false,preservesPitch:false,playsInline:false,plays:0,pauses:0,async play(){this.paused=false;this.plays++;},pause(){this.paused=true;this.pauses++;listeners.get('pause')?.();},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),requestVideoFrameCallback(fn){frame=fn;return 1;},cancelVideoFrameCallback(){frame=null;},tick(at){this.currentTime=at;const f=frame;frame=null;f?.();},end(){this.ended=true;this.pause();listeners.get('ended')?.();},listeners};}

test('six original four-language exercises retain optional vibrato and unreviewed status',()=>{
  assert.equal(data.lessons.length,6);assert.equal(data.lessons[5].level,'optional');
  for(const item of data.lessons){api.validateManifest(item);assert.equal(item.rights.status,'original');assert.equal(item.reviewStatus,'draft');for(const lang of ['zh','en','ja','de']){assert.ok(item.title[lang]);assert.ok(item.summary[lang]);for(const step of item.steps){assert.ok(step.title[lang]);assert.ok(step.text[lang]);}}}
  assert.equal(data.lessons.slice(0,5).some(item=>item.events.some(event=>event.vibrato)),false);
  assert.ok(data.lessons[5].events.some(event=>event.vibrato));
});
test('annotation pitches agree with four violin strings and first-position reference',()=>{
  const open={G:55,D:62,A:69,E:76},offset=[0,2,4,5,7];
  for(const item of data.lessons)for(const event of item.events)assert.equal(event.midi,open[event.string]+offset[event.finger]);
});
test('manifest rejects overlap, duplicate IDs and out-of-range annotations',()=>{
  for(const mutate of [l=>l.events[1].start=0,l=>l.events[1].id=l.events[0].id,l=>l.events[0].finger=5,l=>l.events[0].string='B',l=>l.events[0].midi=120,l=>l.events[0].vibrato='yes']){const l=lesson();mutate(l);assert.throws(()=>api.validateManifest(l),{code:'INVALID_LESSON'});}
});
test('movement guide rejects upper-position pitches and false open-string fingering',()=>{
  for(const [midi,finger] of [[81,4],[69,1],[71,0]]){const l=lesson();l.events[0].midi=midi;l.events[0].finger=finger;assert.throws(()=>api.validateManifest(l),{code:'INVALID_LESSON'});}
});
test('video anchors support piecewise forward/inverse rubato mappings',()=>{
  const anchors=[{time:0,scoreTime:0},{time:3,scoreTime:2},{time:5,scoreTime:6}];
  assert.equal(api.mapTime(4,anchors),4);assert.equal(api.mapTime(1.5,anchors),1);assert.equal(api.mapTime(4,anchors,true),4);assert.equal(api.mapTime(1,anchors,true),1.5);
  assert.throws(()=>api.validateAnchors([{time:1,scoreTime:2},{time:1,scoreTime:3}]),{code:'INVALID_ANCHORS'});
});
test('audio clock drives playback and selected violin samples',async()=>{
  const h=harness();assert.equal((await h.engine.play()).started,true);assert.equal(h.calls[0].settings.voice,'violin-sample');assert.equal(h.calls[0].plan[0].freq,440);h.tick(2.4);assert.equal(h.engine.state().position,2.4);assert.equal(h.engine.state().event.finger,1);h.engine.dispose();
});
test('pause retains position and resuming crops only remaining note duration',async()=>{
  const h=harness();await h.engine.play();h.tick(1.5);h.engine.pause();assert.equal(h.engine.state().playing,false);await h.engine.play();assert.equal(h.calls[1].plan[0].start,0);assert.equal(h.calls[1].plan[0].end,.5);h.tick(.25);assert.equal(h.engine.state().position,1.75);h.engine.dispose();
});
test('rate preserves pitch and scales score position using authoritative time',async()=>{
  const h=harness();await h.engine.setRate(.5);await h.engine.play();assert.equal(h.calls[0].plan[0].end,4);assert.equal(h.calls[0].plan[0].freq,440);h.tick(3);assert.equal(h.engine.state().position,1.5);await h.engine.setRate(1.25);assert.equal(h.calls[1].plan[0].end,.4);h.tick(.2);assert.equal(h.engine.state().position,1.75);h.engine.dispose();
});
test('seek cancels old callbacks and keeps stable event identity',async()=>{
  const h=harness();await h.engine.play();const old=h.calls[0];await h.engine.seek(5);old.settings.onPosition(0,20,20);assert.equal(h.engine.state().position,5);assert.equal(h.engine.state().event.id,'first-fingers-note-3');assert.equal(h.calls[1].plan[0].i,2);h.engine.dispose();
});
test('A–B continuous loop is scheduled as one audio loop',async()=>{
  const h=harness();await h.engine.setLoop({enabled:true,start:2,end:6});await h.engine.play();assert.equal(h.calls[0].settings.loop,true);assert.equal(h.calls[0].plan.at(-1).end,4);h.tick(3.9);assert.equal(h.engine.state().position,5.9);h.tick(.1);assert.equal(h.engine.state().position,2.1);h.engine.dispose();
});
test('seek within A–B plays partial section then restarts full loop',async()=>{
  const h=harness();await h.engine.setLoop({enabled:true,start:2,end:6});await h.engine.seek(4);await h.engine.play();assert.equal(h.calls[0].settings.loop,false);h.calls[0].settings.onEnd();await Promise.resolve();assert.equal(h.calls[1].settings.loop,true);assert.equal(h.engine.state().position,2);h.engine.dispose();
});
test('pending sound load cannot start a paused lesson',async()=>{
  let resolve;const h=harness({play:()=>new Promise(r=>resolve=r)});const start=h.engine.play();assert.equal(h.engine.state().pending,true);h.engine.pause();resolve({started:false,cancelled:true});assert.equal((await start).cancelled,true);assert.equal(h.engine.state().playing,false);h.engine.dispose();
});
test('stale rejected playback does not replace a newly loaded lesson',async()=>{
  let reject;const h=harness({play:()=>new Promise((r,j)=>reject=j)});const start=h.engine.play();h.engine.load(data.lessons[1]);reject(Error('old resource'));assert.equal((await start).cancelled,true);assert.equal(h.engine.state().error,null);assert.equal(h.errors.length,0);h.engine.dispose();
});
test('current playback error is surfaced and leaves no playing state',async()=>{
  const h=harness({play:async()=>{throw Error('sample missing');}});await assert.rejects(h.engine.play(),/sample missing/);assert.equal(h.engine.state().playing,false);assert.equal(h.engine.state().pending,false);assert.equal(h.errors.length,1);h.engine.dispose();
});
test('background visibility pauses and removes handlers on disposal',async()=>{
  const h=harness();await h.engine.play();h.environment.document.hidden=true;h.listeners.get('visibilitychange')();assert.equal(h.engine.state().playing,false);h.engine.dispose();assert.equal(h.listeners.size,0);assert.throws(()=>h.engine.load(lesson()),{code:'DISPOSED'});
});
test('listen uses shared audio clock with no voices and reports only confident monophonic pitch',async()=>{
  const h=harness();await h.engine.setMode('listen');await h.engine.play();assert.equal(h.calls.length,0);h.tick(.2);h.engine.ingestPitch(440,{valid:false,confidence:.99});assert.equal(h.engine.state().feedback.status,'uncertain');h.engine.ingestPitch(440,valid);assert.equal(h.engine.state().feedback.status,'in-tune');assert.equal(h.engine.state().feedback.cents,0);h.engine.dispose();
});
test('manual latency compensation applies to rhythm reference',async()=>{
  const h=harness();h.engine.setLatency(120);await h.engine.setMode('listen');await h.engine.play();h.tick(.2);h.engine.ingestPitch(440,valid);assert.equal(h.engine.state().feedback.rhythmMs,80);h.engine.dispose();
});
test('pitch gate rejects octave, low periodicity and missing validity',()=>{
  const event=lesson().events[0];assert.equal(api.assessPitch(880,valid,event).status,'high');assert.equal(api.assessPitch(440,{valid:true,confidence:.84},event).status,'uncertain');assert.equal(api.assessPitch(440,{confidence:1},event).status,'uncertain');assert.equal(api.assessPitch(0,valid,event).status,'uncertain');assert.equal(api.assessPitch(440*2**(-36/1200),valid,event).status,'low');
});
test('wait mode emits no sound and advances only after consecutive stable pitch',async()=>{
  const h=harness();await h.engine.setMode('wait');await h.engine.play();assert.equal(h.calls.length,0);h.sample(69);h.sample(69);h.sample(69);assert.equal(h.engine.state().index,0);h.sample(69);assert.equal(h.engine.state().index,1);assert.equal(h.engine.state().feedback.status,'matched');h.engine.dispose();
});
test('incorrect or uncertain frequency resets wait hold',async()=>{
  const h=harness();await h.engine.setMode('wait');await h.engine.play();h.sample(69);h.sample(69);h.sample(69,80,{valid:false,confidence:.3});h.sample(69);h.sample(69);assert.equal(h.engine.state().index,0);h.sample(69);h.sample(69);assert.equal(h.engine.state().index,1);h.engine.dispose();
});
test('long analysis gaps never count as a stable held note',async()=>{
  const h=harness();await h.engine.setMode('wait');await h.engine.play();h.sample(69);h.sample(69,2000);assert.equal(h.engine.state().index,0);h.sample(69);h.sample(69);h.sample(69);assert.equal(h.engine.state().index,1);h.engine.dispose();
});
test('repeated notes require a release, so one sustained note cannot finish the exercise',async()=>{
  const h=harness(),l=lesson();l.events[1].midi=69;l.events[1].finger=0;h.engine.load(l);await h.engine.setMode('wait');await h.engine.play();for(let i=0;i<12;i++)h.sample(69);assert.equal(h.engine.state().index,1);assert.equal(h.engine.state().feedback.status,'release');for(let i=0;i<3;i++)h.sample(69,80,{valid:false,confidence:0});for(let i=0;i<4;i++)h.sample(69);assert.equal(h.engine.state().index,2);h.engine.dispose();
});
test('wait can finish without mandatory camera, login or demo audio',async()=>{
  const h=harness(),l=lesson();l.events=l.events.slice(0,2);l.duration=4;h.engine.load(l);await h.engine.setMode('wait');await h.engine.play();for(let i=0;i<4;i++)h.sample(69);for(let i=0;i<4;i++)h.sample(71);assert.equal(h.engine.state().completed,true);assert.equal(h.engine.state().playing,false);assert.equal(h.engine.state().position,4);assert.equal(h.calls.length,0);h.engine.dispose();
});
test('video frame clock uses anchors and playback rate preserves audio pitch',async()=>{
  const h=harness(),l=lesson(),v=video();l.media={kind:'video',url:'/lesson.mp4',anchors:[{time:0,scoreTime:0},{time:4,scoreTime:2},{time:8,scoreTime:8}]};h.engine.load(l);h.engine.bindVideo(v);await h.engine.setRate(.75);await h.engine.play();assert.equal(h.calls.length,0);assert.equal(v.preservesPitch,true);assert.equal(v.playbackRate,.75);v.tick(6);assert.equal(h.engine.state().position,5);await h.engine.seek(2);assert.equal(v.currentTime,4);h.engine.dispose();assert.equal(v.listeners.size,0);
});
test('video pause-then-ended event still completes lesson',async()=>{
  const h=harness(),l=lesson(),v=video();l.media={kind:'video',url:'/lesson.mp4'};h.engine.load(l);h.engine.bindVideo(v);await h.engine.play();v.end();assert.equal(h.engine.state().completed,true);h.engine.dispose();
});
test('video loop returns to mapped A and wait mode keeps video silent and paused',async()=>{
  const h=harness(),l=lesson(),v=video();l.media={kind:'video',url:'/lesson.mp4',anchors:[{time:0,scoreTime:0},{time:8,scoreTime:4}]};h.engine.load(l);h.engine.bindVideo(v);await h.engine.setLoop({enabled:true,start:1,end:3});await h.engine.play();v.tick(6);assert.equal(v.currentTime,2);await h.engine.setMode('wait');assert.equal(v.paused,true);assert.equal(v.muted,true);assert.equal(h.calls.length,0);h.engine.dispose();
});
test('invalid rate, loop and latency inputs are rejected without changing saved values',async()=>{
  const h=harness();await assert.rejects(h.engine.setRate(2),{code:'INVALID_VALUE'});await assert.rejects(h.engine.setLoop({enabled:true,start:2,end:2}),{code:'INVALID_LOOP'});assert.throws(()=>h.engine.setLatency(-1),{code:'INVALID_VALUE'});assert.equal(h.engine.state().rate,1);assert.equal(h.engine.state().loop.enabled,false);h.engine.dispose();
});
test('synthetic waveform through actual YIN monitor math can drive wait, silence cannot',async()=>{
  const pitch=read('pitch.js'),h=harness(),wave=new Float32Array(4096),sampleRate=22050;
  for(let i=0;i<wave.length;i++)wave[i]=.12*Math.sin(2*Math.PI*440*i/sampleRate)+.025*Math.sin(2*Math.PI*880*i/sampleRate);
  const estimate=pitch.estimatePitch(wave,sampleRate);assert.equal(estimate.valid,true);assert.ok(Math.abs(estimate.frequency-440)<2);
  await h.engine.setMode('wait');await h.engine.play();for(let i=0;i<4;i++){h.advance(80);h.engine.ingestPitch(estimate.frequency,estimate);}assert.equal(h.engine.state().index,1);
  const silence=pitch.estimatePitch(new Float32Array(4096),sampleRate);for(let i=0;i<20;i++){h.advance(80);h.engine.ingestPitch(silence.frequency,silence);}assert.equal(h.engine.state().index,1);assert.equal(h.engine.state().feedback.status,'uncertain');h.engine.dispose();
});
test('late video play resolution does not pause a newer successful run',async()=>{
  const h=harness(),l=lesson(),v=video();l.media={kind:'video',url:'/lesson.mp4'};h.engine.load(l);h.engine.bindVideo(v);
  let resolveFirst,calls=0;v.play=function(){this.paused=false;return ++calls===1?new Promise(resolve=>resolveFirst=resolve):Promise.resolve();};
  const first=h.engine.play();await h.engine.seek(2);assert.equal(h.engine.state().playing,true);resolveFirst();assert.equal((await first).cancelled,true);assert.equal(h.engine.state().playing,true);assert.equal(v.paused,false);h.engine.dispose();
});
test('loading another lesson releases the previous video and frame callbacks',async()=>{
  const h=harness(),l=lesson(),v=video();l.media={kind:'video',url:'/lesson.mp4'};h.engine.load(l);h.engine.bindVideo(v);await h.engine.play();h.engine.load(data.lessons[1]);assert.equal(v.paused,true);assert.equal(v.listeners.size,0);assert.equal(h.engine.state().videoBound,false);v.tick(20);assert.equal(h.engine.state().position,0);h.engine.dispose();
});
test('new lesson resets wait mode but retains user latency calibration',async()=>{
  const h=harness();h.engine.setLatency(85);await h.engine.setMode('wait');await h.engine.play();h.engine.load(data.lessons[1]);assert.equal(h.engine.state().mode,'demo');assert.equal(h.engine.state().latencyMs,85);await h.engine.play();assert.equal(h.calls.length,1);assert.equal(h.calls[0].settings.voice,'violin-sample');h.engine.dispose();
});
test('inactive lesson visibility handler does not stop another app audio feature',()=>{
  const h=harness(),before=h.stops();h.environment.document.hidden=true;h.listeners.get('visibilitychange')();assert.equal(h.stops(),before);h.engine.dispose();
});
test('silent timeline remains available when audio play rejects muted volume',async()=>{
  const h=harness({play:async()=>{throw Error('Master volume is muted');}});await h.engine.setMode('listen');await h.engine.setRate(.5);await h.engine.play();h.tick(4);assert.equal(h.engine.state().position,2);assert.equal(h.calls.length,0);assert.equal(h.intervals.size,1);h.engine.pause();assert.equal(h.intervals.size,0);h.engine.dispose();
});
test('silent audio clock loops and completes without leaked interval',async()=>{
  const h=harness();await h.engine.setMode('listen');await h.engine.setLoop({enabled:true,start:2,end:6});await h.engine.play();h.tick(5);assert.equal(h.engine.state().position,3);await h.engine.setLoop({enabled:false,start:2,end:6});h.tick(25);assert.equal(h.engine.state().completed,true);assert.equal(h.intervals.size,0);h.engine.dispose();
});
test('cancelling pending silent context readiness never starts an interval',async()=>{
  let resolve;const h=harness({ready:()=>new Promise(r=>resolve=r)});await h.engine.setMode('listen');const start=h.engine.play();h.engine.pause();resolve(h.context);assert.equal((await start).cancelled,true);assert.equal(h.intervals.size,0);h.engine.dispose();
});
