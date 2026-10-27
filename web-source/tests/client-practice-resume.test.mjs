import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../dist/client.js',import.meta.url),'utf8');
const start=source.indexOf('  const practicePositionKey='),end=source.indexOf('  function recordingPhrase()',start);
assert.ok(start>0&&end>start);const actual=source.slice(start,end)+'\nglobalThis.practice={startPractice,finishPractice,key:practicePositionKey};';
const model={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(new URL('../dist/workspace-state.js',import.meta.url),'utf8'),model);
function harness(){
  let now=1000;const rows=new Map(),plays=[],sessions=[],notices=[],controls=new Map(),timers=new Map();let timerId=0,playGate=null,micGate=null;
  const workspace=model.module.exports.create({storage:{getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)}});
  const plan=[{i:0,start:0,end:2,freq:440},{i:1,start:2,end:4,freq:494},{i:2,start:4,end:6,freq:523}];
  const context={workspace,run:null,runId:0,loopRequest:0,loopsPlaying:false,tuner:false,metro:false,chord:null,audioPending:0,page:'practice',
    prefs:{song:'S001',bpm:60,meter:'4/4',from:1,to:0,semitone:0,repeat:false,a4:440,preset:'Acoustic',effects:{volume:.75},demoVoice:'clean-synth'},
    performance:{now:()=>now},document:{querySelectorAll:()=>[]},$:id=>{if(!controls.has(id))controls.set(id,{style:{},textContent:''});return controls.get(id);},seconds:n=>String(n),song:()=>({id:context.prefs.song}),
    isPracticePage:()=>['practice','lessons'].includes(context.page),rangeModel:()=>({range:{startTick:0,endTick:2880,score:{barCount:2}},plan:plan.map(n=>({...n}))}),
    action:async value=>{sessions.push(value);return true;},notify:message=>notices.push(message),queueMicrotask,maybeBeginnerGuide(){},
    engine:{stop(){},stopTuner(){},setPreset(){},setEffects(){},play(notes,settings){plays.push({notes:JSON.parse(JSON.stringify(notes)),settings});return playGate||Promise.resolve({started:true});},startTuner:()=>micGate||Promise.resolve({started:true})},
    SVScoreModel:{createCoverage:value=>({plan:value}),coverageResult:()=>({validInputFraction:0}),observeCoverage(){}},SVPitch:{freqToNote:()=>null},
    setInterval:fn=>{timers.set(++timerId,fn);return timerId;},clearInterval:id=>timers.delete(id)
  };
  vm.createContext(context);vm.runInContext(actual,context);return {context,workspace,plays,sessions,notices,controls,advance(ms){now+=ms;},setPlayGate(value){playGate=value;},setMicGate(value){micGate=value;},api:context.practice};
}
test('catalog source remembers exact seconds and clips resumed audio to that position',async()=>{
  const h=harness();await h.api.startPractice('synth');h.advance(3000);await h.api.finishPractice();assert.equal(h.workspace.position(h.api.key(),6),3);
  await h.api.startPractice('synth');assert.deepEqual(h.plays[1].notes.map(n=>[n.i,n.start,n.end]),[[1,0,1],[2,1,3]]);h.plays[1].settings.onPosition(1,.5,3);assert.equal(h.controls.get('#play-clock').textContent,'3.5');assert.equal(h.sessions[0].duration,3);
});
test('different piece or tempo does not borrow another piece resume position',async()=>{
  const h=harness();await h.api.startPractice('synth');h.advance(3000);await h.api.finishPractice();h.context.prefs.song='S002';await h.api.startPractice('synth');assert.equal(h.plays.at(-1).notes[0].i,0);await h.api.finishPractice();h.context.prefs.song='S001';h.context.prefs.bpm=80;await h.api.startPractice('synth');assert.equal(h.plays.at(-1).notes[0].i,0);
});
test('finishing the whole phrase starts from the beginning on the next play',async()=>{
  const h=harness();await h.api.startPractice('synth');h.advance(6000);await h.api.finishPractice();assert.equal(h.workspace.position(h.api.key(),6),0);await h.api.startPractice('synth');assert.equal(h.plays.at(-1).notes[0].start,0);
});
test('late microphone permission cannot reactivate a departed practice source',async()=>{
  const h=harness();let resolve;h.setMicGate(new Promise(r=>resolve=r));const pending=h.api.startPractice('microphone');await Promise.resolve();await Promise.resolve();h.context.page='studio';await h.api.finishPractice();resolve({started:true});await pending;assert.equal(h.context.run,null);assert.equal(h.plays.length,0);assert.equal(h.sessions.length,0);assert.equal(h.context.audioPending,0);
});
