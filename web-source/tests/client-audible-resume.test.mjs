import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the production start/stop flow with an independently controlled output
// callback and wall clock. A device may render ahead of the samples users hear.
const source=fs.readFileSync(new URL('../dist/client.js',import.meta.url),'utf8');
const start=source.indexOf('  const practicePositionKey='),end=source.indexOf('  function recordingPhrase()',start);
assert.ok(start>0&&end>start);
const actual=source.slice(start,end)+'\nglobalThis.practice={startPractice,finishPractice,key:practicePositionKey};';
const model={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../dist/workspace-state.js',import.meta.url),'utf8'),model);
function harness(){
 let now=1000,timerId=0;const rows=new Map(),plays=[],sessions=[],controls=new Map(),timers=new Map();
 const workspace=model.module.exports.create({storage:{getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)}});
 const plan=[{i:0,start:0,end:2,freq:440},{i:1,start:2,end:4,freq:494},{i:2,start:4,end:6,freq:523}];
 const context={workspace,run:null,runId:0,loopRequest:0,loopsPlaying:false,tuner:false,metro:false,chord:null,audioPending:0,page:'practice',
  prefs:{song:'S001',bpm:60,meter:'4/4',from:1,to:0,semitone:0,repeat:false,a4:440,preset:'Acoustic',effects:{volume:.75},demoVoice:'clean-synth'},
  performance:{now:()=>now},document:{querySelectorAll:()=>[]},$:id=>{if(!controls.has(id))controls.set(id,{style:{},textContent:''});return controls.get(id);},seconds:n=>String(n),song:()=>({id:context.prefs.song}),
  isPracticePage:()=>['practice','lessons'].includes(context.page),rangeModel:()=>({range:{startTick:0,endTick:2880,score:{barCount:2}},plan:plan.map(n=>({...n}))}),
  action:async v=>{sessions.push(v);return true;},notify(){},queueMicrotask,maybeBeginnerGuide(){},
  engine:{stop(){},stopTuner(){},setPreset(){},setEffects(){},play(notes,settings){plays.push({notes:JSON.parse(JSON.stringify(notes)),settings});settings.onPosition(-1,0,notes.at(-1).end);return Promise.resolve({started:true});},startTuner:()=>Promise.resolve({started:true})},
  SVScoreModel:{createCoverage:v=>({plan:v}),coverageResult:()=>({validInputFraction:0}),observeCoverage(){}},SVPitch:{freqToNote:()=>null},
  setInterval:fn=>{timers.set(++timerId,fn);return timerId;},clearInterval:id=>timers.delete(id)
 };
 vm.createContext(context);vm.runInContext(actual,context);
 return {context,workspace,plays,sessions,controls,advance(ms){now+=ms;},heard(index,seconds){plays.at(-1).settings.onPosition(index,seconds,plays.at(-1).notes.at(-1).end);},api:context.practice};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} is not ${b}`);

test('200 ms output delay saves heard position and resumes the unheard end of the note',async()=>{
 const h=harness();await h.api.startPractice('synth');h.advance(2000);h.heard(0,1.8);await h.api.finishPractice();
 close(h.workspace.position(h.api.key(),6),1.8);close(h.sessions[0].duration,1.8);
 await h.api.startPractice('synth');const notes=h.plays.at(-1).notes;assert.equal(notes[0].i,0);close(notes[0].end,.2);close(notes[1].start,.2);
 h.advance(1000);h.heard(1,.8);await h.api.finishPractice();close(h.workspace.position(h.api.key(),6),2.6);close(h.sessions[1].duration,.8);
});
test('stopping during pre-output silence keeps position zero and creates no listening session',async()=>{
 const h=harness();await h.api.startPractice('synth');h.advance(200);await h.api.finishPractice();
 assert.equal(h.workspace.position(h.api.key(),6),0);assert.equal(h.sessions.length,0);
 await h.api.startPractice('synth');assert.equal(h.plays.at(-1).notes[0].start,0);assert.equal(h.plays.at(-1).notes[0].end,2);
});
test('loop crossing accumulates audible duration while storing the position within the current loop',async()=>{
 const h=harness();h.context.prefs.repeat=true;await h.api.startPractice('synth');assert.equal(h.plays[0].settings.loop,true);
 h.advance(6000);h.heard(2,5.8);h.advance(400);h.heard(0,.2);h.advance(1200);h.heard(0,1.4);await h.api.finishPractice();
 close(h.sessions[0].duration,7.4);close(h.workspace.position(h.api.key(),6),1.4);
 h.context.prefs.repeat=false;await h.api.startPractice('synth');close(h.plays.at(-1).notes[0].end,.6);
});
test('audible completion saves the end and next playback starts at the beginning',async()=>{
 const h=harness();await h.api.startPractice('synth');h.advance(6200);h.heard(-1,6);await h.api.finishPractice();
 assert.equal(h.workspace.position(h.api.key(),6),0);assert.equal(h.sessions[0].duration,6);
 await h.api.startPractice('synth');assert.equal(h.plays.at(-1).notes[0].start,0);
});
test('microphone practice retains its own elapsed clock rather than output latency',async()=>{
 const h=harness();await h.api.startPractice('microphone');h.advance(1800);await h.api.finishPractice();
 assert.equal(h.plays.length,0);close(h.workspace.position(h.api.key(),6),1.8);close(h.sessions[0].duration,1.8);assert.equal(h.sessions[0].inputRoute,'microphone');
});
