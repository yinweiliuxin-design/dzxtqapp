import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../dist/learning-journey.js',import.meta.url),'utf8');
const module={exports:{}};vm.runInNewContext(source,{module,globalThis:{}});const learning=module.exports;
const plain=value=>JSON.parse(JSON.stringify(value)),ids=['prepare','hold','tune','open','fingers','melody'];
const initial=()=>({schema:1,currentStepId:'prepare',phase:'watch',reviewedStepIds:[],skippedStepIds:[],reduceMotion:false});
function events(){const listeners=new Map();return {listeners,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},emit(type,value){for(const fn of [...(listeners.get(type)||[])])fn(value);},count(){return [...listeners.values()].reduce((n,s)=>n+s.size,0);}};}
function harness({raw,denied=false,readDenied=false,noStorage=false,reduced=false}={}){
  const rows=new Map([['smartvio-learning-path-v1','{"schema":1,"currentStepId":"next"}'],['smartvio-curriculum-v1','legacy curriculum'],['smartvio-lessons','old lesson progress']]);
  if(raw!==undefined)rows.set(learning.STORAGE_KEY,raw);
  const writes=[],reads=[],doc={...events(),hidden:false},mq={...events(),matches:reduced};let permissionCalls=0,timers=0;
  const scene={attrs:{},setAttribute(k,v){this.attrs[k]=v;}},motion={attrs:{},disabled:false,textContent:'',setAttribute(k,v){this.attrs[k]=v;}};
  const host={...events(),innerHTML:'',contains:()=>true,querySelector(s){return s==='[data-lj-scene]'?scene:s==='[data-lj-action="motion"]'?motion:null;},click(action,step,phase){const target={dataset:step?{ljStep:step}:phase?{ljPhase:phase}:{ljAction:action},closest:()=>target};this.emit('click',{target,preventDefault(){}});},key(phase,key){const target={dataset:{ljPhase:phase},closest:()=>target};this.emit('keydown',{target,key,preventDefault(){}});}};
  const storage=noStorage?null:{getItem(key){reads.push(key);if(readDenied)throw Error('read denied');return rows.get(key)??null;},setItem(key,value){if(denied)throw Error('quota');writes.push({key,value});rows.set(key,value);},removeItem(key){if(denied)throw Error('denied');rows.delete(key);}};
  const environment={document:doc,matchMedia:()=>mq,location:{hash:''},setTimeout(){timers++;throw Error('No animation timers');},navigator:{mediaDevices:{getUserMedia(){permissionCalls++;throw Error('No implicit permissions');}},requestMIDIAccess(){permissionCalls++;throw Error('No implicit permissions');}}};
  return {journey:learning.createJourney({environment,storage}),host,scene,motion,rows,writes,reads,doc,mq,environment,permissionCalls:()=>permissionCalls,timers:()=>timers};
}
test('six-step journey starts independently without reading or replacing legacy progress',()=>{
  const h=harness();h.journey.mount(h.host);assert.deepEqual(plain(h.journey.state()),initial());assert.deepEqual(h.reads,[learning.STORAGE_KEY]);assert.equal(h.writes.length,0);assert.deepEqual(plain(learning.steps().map(s=>s.id)),ids);assert.match(h.host.innerHTML,/选琴与准备/);assert.match(h.host.innerHTML,/不代表演奏考试通过/);assert.equal(h.permissionCalls(),0);assert.equal(h.timers(),0);
});
test('navigation, phases and skipped steps are not converted to confirmed learning',()=>{
  const h=harness();h.journey.mount(h.host);h.host.click('watch-next');assert.equal(h.journey.state().phase,'try');h.host.click('try-next');assert.equal(h.journey.state().phase,'review');assert.deepEqual(plain(h.journey.state().reviewedStepIds),[]);h.host.click('skip');assert.equal(h.journey.state().currentStepId,'hold');assert.deepEqual(plain(h.journey.state().skippedStepIds),['prepare']);assert.deepEqual(plain(h.journey.state().reviewedStepIds),[]);
  h.journey.setStep('prepare');h.journey.setPhase('review');h.host.click('review-next');assert.deepEqual(plain(h.journey.state().reviewedStepIds),['prepare']);assert.deepEqual(plain(h.journey.state().skippedStepIds),[]);assert.equal(h.journey.state().currentStepId,'hold');
});
test('review confirmation saves the next step and reloads without destroying prior course stores',()=>{
  const h=harness(),legacy=[...h.rows];h.journey.mount(h.host);for(const id of ids){h.journey.setStep(id);h.journey.setPhase('review');h.host.click('review-next');}
  assert.deepEqual(plain(h.journey.state().reviewedStepIds),ids);assert.equal(h.journey.state().currentStepId,'melody');assert.match(h.host.innerHTML,/六步都已回顾/);assert.equal(h.writes.every(row=>row.key===learning.STORAGE_KEY),true);for(const[k,v]of legacy)assert.equal(h.rows.get(k),v);
  const restored=learning.createJourney({storage:{getItem:key=>h.rows.get(key)}});assert.deepEqual(plain(restored.state()),plain(h.journey.state()));h.host.click('undo');assert.equal(h.journey.state().reviewedStepIds.length,5);const copy=h.journey.state();copy.reviewedStepIds.push('melody');assert.equal(h.journey.state().reviewedStepIds.length,5);
});
test('all four languages and both instrument illustrations are available for every step',()=>{
  const h=harness();for(const lang of ['zh','en','ja','de'])for(const instrumentType of ['electric','acoustic']){h.journey.mount(h.host,{lang,instrumentType});for(const step of learning.steps()){h.journey.setStep(step.id);assert.ok(h.host.innerHTML.includes(step.title[lang]));assert.ok(step.instructions.every(i=>i[lang].length>12));assert.ok(h.host.innerHTML.includes('visuals/violin-'+instrumentType+'-v27.svg'));assert.doesNotMatch(h.host.innerHTML,/<(?:script|iframe|video)|https?:\/\//i);}}
  assert.equal(h.permissionCalls(),0);assert.equal(h.timers(),0);
});
test('legacy references point to existing curriculum, lesson and guide IDs but never migrate completion',()=>{
  function readApi(name){const m={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../dist/'+name,import.meta.url),'utf8'),{module:m,globalThis:{}});return m.exports;}
  const curriculum=readApi('curriculum-data.js'),lessons=readApi('lesson-data.js'),guide=readApi('learning-path.js');
  for(const step of learning.steps()){for(const id of step.legacyReferences.curriculum)assert.ok(curriculum.stages.some(s=>s.id===id),id);for(const id of step.legacyReferences.lesson)assert.ok(lessons.lessons.some(s=>s.id===id),id);for(const id of step.legacyReferences.buttonGuide)assert.ok(guide.steps().some(s=>s.id===id),id);}
  const h=harness();assert.deepEqual(plain(h.journey.state().reviewedStepIds),[]);
});
test('validations reject conflicting states, unknown phases and unsafe storage keys',()=>{
  for(const v of [null,{}, {...initial(),schema:2},{...initial(),currentStepId:'unknown'},{...initial(),phase:'exam'}, {...initial(),reduceMotion:'false'},{...initial(),reviewedStepIds:['hold','hold']},{...initial(),reviewedStepIds:['hold'],skippedStepIds:['hold']},{...initial(),skippedStepIds:['old-lesson']}])assert.throws(()=>learning.validate(v));
  assert.throws(()=>learning.createJourney({storageKey:'smartvio-learning-path-v1'}));assert.throws(()=>learning.createJourney({storageKey:'smartvio-learning-journey-v1:../../bad'}));const h=harness();assert.throws(()=>h.journey.setStep('bad'));assert.throws(()=>h.journey.setPhase('bad'));assert.throws(()=>h.journey.setLanguage('fr'));
});
test('corrupt or denied persisted records remain unchanged until explicit clear',()=>{
  for(const raw of ['{bad','x'.repeat(8193),JSON.stringify({...initial(),schema:99})]){const h=harness({raw});h.journey.mount(h.host,{lang:'en'});h.journey.setStep('tune');h.host.click('skip');assert.equal(h.rows.get(learning.STORAGE_KEY),raw);assert.equal(h.writes.length,0);assert.equal(h.journey.status().restoreFailed,true);assert.match(h.host.innerHTML,/Original data was preserved/);assert.equal(h.journey.clear().committed,true);h.journey.setStep('hold');assert.equal(h.writes.length,1);}
  const h=harness({readDenied:true});h.journey.setStep('hold');assert.equal(h.writes.length,0);assert.equal(h.journey.status().restoreFailed,true);
});
test('unavailable or quota-limited storage permits learning without pretending to save',()=>{
  for(const opts of [{denied:true},{noStorage:true}]){const h=harness(opts);h.journey.mount(h.host,{lang:'en'});h.journey.setPhase('review');h.host.click('review-next');assert.equal(h.journey.state().currentStepId,'hold');assert.match(h.host.innerHTML,/cannot be saved/);assert.doesNotMatch(h.host.innerHTML,/Progress saved in/);assert.equal(h.journey.clear().committed,false);assert.equal(h.journey.state().currentStepId,'hold');}
});
test('pausing and resuming keep the same animated DOM; replay and reduced motion are explicit',()=>{
  const h=harness();h.journey.mount(h.host,{lang:'en'});h.journey.setStep('open');let markup=h.host.innerHTML,writes=0;Object.defineProperty(h.host,'innerHTML',{get:()=>markup,set:v=>{writes++;markup=v;}});
  h.host.click('motion');assert.equal(writes,0);assert.equal(h.scene.attrs['data-motion'],'paused');h.host.click('motion');assert.equal(writes,0);assert.equal(h.scene.attrs['data-motion'],'playing');h.host.click('replay');assert.equal(writes,1);assert.match(markup,/data-replay="1"/);
  h.doc.hidden=true;h.doc.emit('visibilitychange',{});assert.equal(h.scene.attrs['data-motion'],'paused');h.doc.hidden=false;h.doc.emit('visibilitychange',{});assert.equal(h.scene.attrs['data-motion'],'playing');h.mq.emit('change',{matches:true});assert.equal(h.journey.status().motion,'reduced');h.host.click('replay');assert.equal(h.journey.status().motion,'reduced');h.mq.emit('change',{matches:false});h.host.click('reduce');assert.equal(h.journey.state().reduceMotion,true);assert.equal(h.journey.status().motion,'reduced');assert.equal(h.timers(),0);
});
test('phase tabs support arrow, Home and End keys without confirming a step',()=>{
  const h=harness();h.journey.mount(h.host);h.host.key('watch','ArrowRight');assert.equal(h.journey.state().phase,'try');h.host.key('try','End');assert.equal(h.journey.state().phase,'review');h.host.key('review','Home');assert.equal(h.journey.state().phase,'watch');h.host.key('watch','ArrowLeft');assert.equal(h.journey.state().phase,'review');assert.deepEqual(plain(h.journey.state().reviewedStepIds),[]);
});
test('real feature entry passes exact lesson and return context only after a click',async()=>{
  const h=harness(),calls=[];h.journey.mount(h.host,{onNavigate:(page,meta)=>calls.push({page,meta})});assert.equal(calls.length,0);
  for(const step of learning.steps()){h.journey.setStep(step.id);h.journey.setPhase('try');h.host.click('open');await Promise.resolve();assert.equal(calls.at(-1).page,step.entry.page);assert.equal(calls.at(-1).meta.stepId,step.id);assert.equal(calls.at(-1).meta.returnTo,'learn');assert.equal(calls.at(-1).meta.lessonId,step.entry.lessonId);}
  h.journey.setPhase('review');h.host.click('record');await Promise.resolve();assert.equal(calls.at(-1).page,'studio');assert.equal(calls.at(-1).meta.returnTo,'learn');assert.equal(h.permissionCalls(),0);assert.deepEqual(plain(h.journey.state().reviewedStepIds),[]);
});
test('pending navigation cannot survive unmount, change of step, explicit reset or disposal',async()=>{
  for(const action of ['unmount','step','clear','dispose']){const h=harness();let release,called=0;h.journey.mount(h.host,{beforeNavigate:()=>new Promise(r=>release=r),onNavigate:()=>called++});h.host.click('open');assert.equal(h.journey.status().navigating,true);if(action==='step')h.journey.setStep('hold');else h.journey[action]();release(true);await new Promise(setImmediate);assert.equal(called,0,action);assert.equal(h.journey.status().navigating,false);}
});
test('guard rejection and failed navigation leave useful localized feedback and no fake progress',async()=>{
  const h=harness();let called=0;h.journey.mount(h.host,{lang:'en',beforeNavigate:async()=>false,onNavigate:()=>called++});h.host.click('open');await new Promise(setImmediate);assert.equal(called,0);assert.equal(h.journey.status().navigating,false);h.journey.mount(h.host,{lang:'de',onNavigate:async()=>{throw Error('failed');}});h.host.click('open');await new Promise(setImmediate);assert.match(h.host.innerHTML,/Die Funktion konnte nicht geöffnet werden/);assert.deepEqual(plain(h.journey.state().reviewedStepIds),[]);
});
test('mounting repeatedly does not accumulate listeners and disposal releases all event hooks',()=>{
  const h=harness();h.journey.mount(h.host);h.journey.mount(h.host);assert.equal(h.host.count(),2);assert.equal(h.doc.count(),1);assert.equal(h.mq.count(),1);h.journey.dispose();assert.equal(h.host.count()+h.doc.count()+h.mq.count(),0);assert.throws(()=>h.journey.mount(h.host));assert.throws(()=>h.journey.setStep('hold'));assert.throws(()=>h.journey.setPhase('try'));
});
