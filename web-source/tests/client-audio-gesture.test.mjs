import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/client.js',import.meta.url),'utf8');
const start=source.indexOf('  const audibleActions=new Set('),end=source.indexOf("  document.addEventListener('click',unlockFromClick,true);",start);
assert.ok(start>=0&&end>start,'actual capture listener boundary exists');
const captureSource=source.slice(start,end)+';globalThis.click=unlockFromClick;';
const actionStart=source.indexOf("    async 'audio-test'()"),actionEnd=source.indexOf("    'audio-help'()",actionStart);
assert.ok(actionStart>0&&actionEnd>actionStart);
const actionSource='({'+source.slice(actionStart,actionEnd).trim().replace(/,$/,'')+'})["audio-test"]';
function harness({throwUnlock=false,rejectUnlock=false,referenceError=null,frozen=false,noSignal=false}={}){
 const calls=[],feedback=[],timers=[];let time=1;
 const context={page:'practice',workspace:{state:()=>({practiceSource:'catalog'})},lessons:{pause(){calls.push('lesson-paused');}},navigationId:1,prefs:{a4:440},audioTestRequest:0,Promise,Number,Set,Error,
  soundCopy:()=>({checking:'checking',ready:'ready',blocked:'blocked',silent:'silent',stopped:'stopped'}),
  audioFeedback:(message,failed=false)=>feedback.push({message,failed}),
  setTimeout:fn=>{timers.push(fn);return timers.length;},
  engine:{unlock(value){calls.push(value);if(throwUnlock)throw Error('sync-block');return rejectUnlock?Promise.reject(Error('async-block')):Promise.resolve();},
   async reference(hz){calls.push(hz);if(referenceError)throw Error(referenceError);return {started:true};},
   status:()=>({state:'running',contextTime:frozen?1:time++,activeVoices:1,outputRms:noSignal?0:.02,error:null})}};
 vm.createContext(context);vm.runInContext(captureSource,context,{timeout:500});const play=vm.runInContext(actionSource,context,{timeout:500});
 const event=(dataset,disabled=false)=>({target:{closest:()=>({dataset,disabled})}});
 return {context,calls,feedback,timers,event,click:context.click,play:()=>play(),async complete(){for(let i=0;i<5&&!timers.length;i++)await new Promise(setImmediate);assert.ok(timers.length);timers.shift()();await Promise.resolve();}};
}
for(const dataset of [{action:'play'},{action:'reference'},{action:'start-tuner'},{action:'mic-practice'},{action:'audio-test'},{midiAction:'play'},{perfAction:'scale'},{perfNote:'A4'},{perfChord:'C'}])test('capture requests explicit gesture retry '+JSON.stringify(dataset),()=>{const h=harness();h.click(h.event(dataset));assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{gesture:true}]);});
test('native backing play does not require unrelated WebAudio unlock',()=>{const h=harness();h.click(h.event({perfAction:'play'}));assert.equal(h.calls.length,0);});
test('help, stop and disabled buttons do not unlock or auto-play',()=>{const h=harness();for(const d of [{action:'audio-help'},{action:'stop'},{perfAction:'off'}])h.click(h.event(d));h.click(h.event({action:'play'},true));assert.equal(h.calls.length,0);});
test('synchronous and asynchronous unlock errors are visible without escaping the listener',async()=>{for(const options of [{throwUnlock:true},{rejectUnlock:true}]){const h=harness(options);h.click(h.event({action:'play'}));await Promise.resolve();assert.equal(h.feedback.length,1);assert.equal(h.feedback[0].failed,true);}});
test('test sound confirms advancing clock and actual nonzero signal',async()=>{const h=harness(),pending=h.play();await h.complete();await pending;assert.deepEqual(h.calls,[440]);assert.equal(h.feedback.at(-1).message,'ready');});
test('running with a frozen clock does not report success',async()=>{const h=harness({frozen:true}),pending=h.play();const rejection=assert.rejects(pending,/blocked/);await h.complete();await rejection;assert.equal(h.feedback.at(-1).message,'blocked');});
test('zero signal is not reported as heard or successful',async()=>{const h=harness({noSignal:true}),pending=h.play();await h.complete();await pending;assert.deepEqual(h.feedback.at(-1),{message:'silent',failed:true});});
test('late test feedback does not overwrite a different page',async()=>{const h=harness(),pending=h.play();await Promise.resolve();h.context.navigationId++;await h.complete();await pending;assert.equal(h.feedback.at(-1).message,'checking');});
test('permission failure remains an error with a retry message',async()=>{const h=harness({referenceError:'permission denied'});await assert.rejects(h.play(),/permission denied/);assert.deepEqual(h.feedback.at(-1),{message:'permission denied',failed:true});});
test('lesson sound test pauses its synchronized transport before the reference tone',async()=>{const h=harness();h.context.page='lessons';const pending=h.play();await h.complete();await pending;assert.deepEqual(h.calls,['lesson-paused',440]);});
test('lesson play and replay explicitly unlock audio from the user gesture, pause does not',()=>{const h=harness();for(const action of ['play','replay'])h.click(h.event({lessonAction:action}));assert.equal(h.calls.length,2);h.click({target:{closest:()=>({dataset:{lessonAction:'play'},getAttribute:()=> 'true'})}});assert.equal(h.calls.length,2);});
