import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../dist/learning-path.js',import.meta.url),'utf8');
const module={exports:{}};vm.runInNewContext(source,{module,globalThis:{}});const learning=module.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const ids=['instrument','tuner','beat','phrase','record','next'];
const initial=()=>({schema:1,pathVersion:1,currentStepId:'instrument',understoodStepIds:[],reduceMotion:false});
function events(){const listeners=new Map();return {listeners,addEventListener(type,fn){const set=listeners.get(type)||new Set();set.add(fn);listeners.set(type,set);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},emit(type,value){for(const fn of [...(listeners.get(type)||[])])fn(value);},count(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);}};}
function harness({raw,denied=false,readDenied=false,reduced=false,storageAbsent=false}={}){
  const rows=new Map([['sv12-beginner-v2:visitor','{"step":6,"completed":true}'],['smartvio-lessons','["old-lesson-1"]']]);
  if(raw!==undefined)rows.set(learning.STORAGE_KEY,raw);
  const writes=[],reads=[],doc={...events(),hidden:false},mq={...events(),matches:reduced};
  const scene={attrs:{},setAttribute(name,value){this.attrs[name]=value;}},motion={attrs:{},disabled:false,textContent:'',setAttribute(name,value){this.attrs[name]=value;}},host={...events(),innerHTML:'',contains:()=>true,querySelector(selector){return selector==='[data-lp-scene]'?scene:selector==='[data-lp-action="motion"]'?motion:null;},click(action,step){const target={dataset:step?{lpStep:step}:{lpAction:action},closest:()=>target};this.emit('click',{target,preventDefault(){}});}};
  let permissionCalls=0,timerCalls=0;
  const environment={document:doc,matchMedia:()=>mq,location:{hash:''},setTimeout(){timerCalls++;throw Error('No timers in learning illustrations');},navigator:{mediaDevices:{getUserMedia(){permissionCalls++;throw Error('No automatic permissions');}},requestMIDIAccess(){permissionCalls++;throw Error('No automatic permissions');},bluetooth:{requestDevice(){permissionCalls++;throw Error('No automatic permissions');}}}};
  const storage=storageAbsent?null:{getItem(key){reads.push(key);if(readDenied)throw Error('denied');return rows.get(key)??null;},setItem(key,value){if(denied)throw Error('quota exceeded');writes.push({key,value});rows.set(key,value);},removeItem(key){if(denied)throw Error('denied');rows.delete(key);}};
  const path=learning.createPath({environment,storage});
  return {path,host,scene,motion,rows,writes,reads,doc,mq,environment,permissionCalls:()=>permissionCalls,timerCalls:()=>timerCalls};
}
test('new path has six stable IDs, four complete plain-language lessons and isolated progress',()=>{
  const steps=learning.steps();assert.deepEqual(plain(steps.map(step=>step.id)),ids);
  for(const step of steps)for(const lang of ['zh','en','ja','de']){assert.ok(step.title[lang].length>3);assert.ok(step.goal[lang].length>10);assert.equal(step.instructions[lang].length,2);}
  const h=harness();h.path.mount(h.host);assert.deepEqual(plain(h.path.state()),initial());assert.deepEqual(h.reads,[learning.STORAGE_KEY]);assert.equal(h.writes.length,0);assert.match(h.host.innerHTML,/我看懂了/);assert.match(h.host.innerHTML,/不是实测结果/);assert.equal(h.permissionCalls(),0);assert.equal(h.timerCalls(),0);
});
test('manual navigation never marks understanding or legacy lessons as completed',()=>{
  const h=harness();h.path.mount(h.host);const legacy=[h.rows.get('sv12-beginner-v2:visitor'),h.rows.get('smartvio-lessons')];
  for(let i=1;i<6;i++)h.host.click('next');assert.equal(h.path.state().currentStepId,'next');assert.deepEqual(plain(h.path.state().understoodStepIds),[]);
  h.host.click('', 'tuner');h.host.click('understood');assert.deepEqual(plain(h.path.state().understoodStepIds),['tuner']);h.host.click('understood');assert.deepEqual(plain(h.path.state().understoodStepIds),[]);
  assert.deepEqual([h.rows.get('sv12-beginner-v2:visitor'),h.rows.get('smartvio-lessons')],legacy);assert.ok(h.writes.every(row=>row.key===learning.STORAGE_KEY));
  const restored=learning.createPath({storage:{getItem:key=>h.rows.get(key)}});assert.equal(restored.state().currentStepId,'tuner');
});
test('four-language controls and every original illustration render without external media',()=>{
  const h=harness();const labels={zh:'去应用里试试',en:'Try it in the app',ja:'アプリで試す',de:'In der App ausprobieren'};
  for(const [lang,label]of Object.entries(labels)){h.path.mount(h.host,{lang});for(const id of ids){h.path.setStep(id);assert.ok(h.host.innerHTML.includes(label));assert.match(h.host.innerHTML,/<svg viewBox="0 0 360 190"/);assert.doesNotMatch(h.host.innerHTML,/<(?:img|video|iframe)|https?:|<script|onload=/i);assert.ok(h.host.innerHTML.includes(learning.steps().find(step=>step.id===id).title[lang]));}}
  assert.equal(h.permissionCalls(),0);assert.equal(h.timerCalls(),0);h.path.dispose();
});
test('state validation rejects corrupt versions, unknown IDs, duplicates and unsafe storage keys',()=>{
  for(const value of [null,{}, {...initial(),pathVersion:2},{...initial(),currentStepId:'unknown'},{...initial(),understoodStepIds:['beat','beat']},{...initial(),understoodStepIds:['old-lesson-1']},{...initial(),reduceMotion:'false'}])assert.throws(()=>learning.validate(value));
  assert.deepEqual(plain(learning.validate({...initial(),understoodStepIds:['record','instrument']})).understoodStepIds,['instrument','record']);
  assert.throws(()=>learning.createPath({storageKey:'sv12-beginner-v2:visitor'}));
  const h=harness();const state=h.path.state();state.understoodStepIds.push('record');assert.deepEqual(plain(h.path.state().understoodStepIds),[]);assert.throws(()=>h.path.setStep('missing'));
});
test('corrupt, oversized and unreadable progress is preserved until explicit reset',()=>{
  for(const raw of ['{bad json','x'.repeat(8193),JSON.stringify({...initial(),pathVersion:99})]){const h=harness({raw});h.path.mount(h.host,{lang:'en'});h.host.click('next');h.host.click('understood');assert.equal(h.rows.get(learning.STORAGE_KEY),raw);assert.equal(h.writes.length,0);assert.equal(h.path.status().restoreFailed,true);assert.match(h.host.innerHTML,/Original data was kept/);assert.equal(h.path.clear().committed,true);h.host.click('next');assert.equal(h.path.status().restoreFailed,false);assert.equal(h.writes.length,1);}
  const denied=harness({readDenied:true});denied.path.mount(denied.host);denied.host.click('next');assert.equal(denied.writes.length,0);assert.equal(denied.path.status().restoreFailed,true);
});
test('quota denial and unavailable storage retain in-memory navigation without false saved claims',()=>{
  for(const options of [{denied:true},{storageAbsent:true}]){const h=harness(options);h.path.mount(h.host,{lang:'en'});h.host.click('next');h.host.click('understood');assert.equal(h.path.state().currentStepId,'tuner');assert.deepEqual(plain(h.path.state().understoodStepIds),['tuner']);assert.match(h.host.innerHTML,/may be lost on reload/);assert.doesNotMatch(h.host.innerHTML,/Learning progress is saved/);assert.equal(h.path.clear().committed,false);assert.equal(h.path.state().currentStepId,'tuner');}
});
test('pause, replay, OS preference and user reduced motion are independent of completion',()=>{
  const h=harness();h.path.mount(h.host,{lang:'en'});assert.equal(h.path.status().motion,'playing');h.host.click('motion');assert.equal(h.path.status().motion,'paused');h.host.click('replay');assert.equal(h.path.status().motion,'playing');assert.match(h.host.innerHTML,/data-replay="1"/);
  h.doc.hidden=true;h.doc.emit('visibilitychange',{});assert.equal(h.scene.attrs['data-motion'],'paused');h.doc.hidden=false;h.doc.emit('visibilitychange',{});assert.equal(h.scene.attrs['data-motion'],'playing');
  h.mq.emit('change',{matches:true});assert.equal(h.path.status().motion,'reduced');h.host.click('replay');assert.equal(h.path.status().motion,'reduced');h.mq.emit('change',{matches:false});h.host.click('reduce');assert.equal(h.path.state().reduceMotion,true);assert.equal(h.path.status().motion,'reduced');assert.deepEqual(plain(h.path.state().understoodStepIds),[]);
});
test('real entry only navigates after a click, forwards exact targets and never activates hardware',async()=>{
  const h=harness(),calls=[];h.path.mount(h.host,{lang:'en',onNavigate:(page,meta)=>calls.push({page,meta})});assert.equal(calls.length,0);
  for(const step of learning.steps()){h.path.setStep(step.id);h.host.click('try');await Promise.resolve();await Promise.resolve();assert.equal(calls.at(-1).page,step.realOperation.page);assert.equal(calls.at(-1).meta.target,step.realOperation.target);assert.equal(calls.at(-1).meta.stepId,step.id);}
  assert.equal(calls.length,6);assert.equal(h.permissionCalls(),0);assert.deepEqual(plain(h.path.state().understoodStepIds),[]);
});
test('pending navigation cannot start after unmount or disturb a later mount',async()=>{
  const h=harness();let release,called=0;h.path.mount(h.host,{beforeNavigate:()=>new Promise(resolve=>release=resolve),onNavigate:()=>called++});h.host.click('try');assert.equal(h.path.status().navigating,true);h.path.unmount();assert.equal(h.host.count(),0);assert.equal(h.doc.count(),0);assert.equal(h.mq.count(),0);assert.equal(h.scene.attrs['data-motion'],'paused');
  h.path.mount(h.host,{lang:'de'});release(true);await Promise.resolve();await Promise.resolve();assert.equal(called,0);assert.equal(h.path.status().navigating,false);assert.match(h.host.innerHTML,/Schritt für Schritt/);h.path.dispose();assert.equal(h.host.count()+h.doc.count()+h.mq.count(),0);assert.throws(()=>h.path.mount(h.host));assert.throws(()=>h.path.setStep('beat'));
});
test('navigation rejection is translated and a rejected guard does not invoke the real entry',async()=>{
  const h=harness();let called=0;h.path.mount(h.host,{lang:'en',beforeNavigate:async()=>false,onNavigate:()=>called++});h.host.click('try');await new Promise(setImmediate);assert.equal(called,0);assert.equal(h.path.status().navigating,false);
  h.path.mount(h.host,{lang:'en',onNavigate:async()=>{throw Error('unavailable');}});h.host.click('try');await new Promise(setImmediate);assert.match(h.host.innerHTML,/This entry is unavailable/);assert.deepEqual(plain(h.path.state().understoodStepIds),[]);
});
test('pause and resume preserve the current SVG rather than rebuilding and resetting its animation',()=>{
  const h=harness();h.path.mount(h.host,{lang:'en'});h.path.setStep('tuner');let markup=h.host.innerHTML,domWrites=0;Object.defineProperty(h.host,'innerHTML',{get:()=>markup,set:value=>{domWrites++;markup=value;},configurable:true});
  h.host.click('motion');assert.equal(domWrites,0,'pause must not replace the live illustration');assert.equal(h.scene.attrs['data-motion'],'paused');assert.equal(h.motion.attrs['aria-pressed'],'true');assert.equal(h.motion.textContent,'Play animation');assert.equal(h.path.status().motion,'paused');
  h.host.click('motion');assert.equal(domWrites,0,'resume keeps the frozen frame and running CSS timeline');assert.equal(h.scene.attrs['data-motion'],'playing');assert.equal(h.motion.attrs['aria-pressed'],'false');assert.equal(h.motion.textContent,'Pause animation');
  h.host.click('replay');assert.equal(domWrites,1,'only explicit replay rebuilds the scene');assert.match(markup,/data-replay="1"/);assert.equal(h.path.status().motion,'playing');assert.deepEqual(plain(h.path.state().understoodStepIds),[]);assert.equal(h.timerCalls(),0);assert.equal(h.permissionCalls(),0);
});
test('V18 artwork release marker and understanding progress are visible without migrating legacy records or awarding completion',()=>{
  const h=harness();h.path.mount(h.host,{lang:'zh'});assert.equal(learning.VERSION,1);assert.equal(learning.STORAGE_KEY,'smartvio-learning-path-v1');assert.equal(h.path.status().release,'20261016-v18-1');assert.match(h.host.innerHTML,/data-lp-release="20261016-v18-1"/);assert.match(h.host.innerHTML,/role="progressbar"[^>]+aria-valuenow="0"/);assert.match(h.host.innerHTML,/class="lp-bow"/);
  h.host.click('next');assert.match(h.host.innerHTML,/aria-valuenow="0"/);h.host.click('understood');assert.match(h.host.innerHTML,/aria-valuenow="1"/);h.host.click('understood');assert.match(h.host.innerHTML,/aria-valuenow="0"/);assert.equal(h.rows.get('sv12-beginner-v2:visitor'),'{"step":6,"completed":true}');assert.equal(h.rows.get('smartvio-lessons'),'["old-lesson-1"]');
});
test('pause stays paused across background transitions and cannot bypass reduced motion',()=>{
  const h=harness();h.path.mount(h.host,{lang:'de'});h.host.click('motion');h.doc.hidden=true;h.doc.emit('visibilitychange',{});h.doc.hidden=false;h.doc.emit('visibilitychange',{});assert.equal(h.scene.attrs['data-motion'],'paused');assert.equal(h.motion.textContent,'Animation abspielen');h.path.unmount();h.path.mount(h.host,{lang:'ja'});assert.equal(h.path.status().motion,'paused');h.mq.emit('change',{matches:true});h.host.click('motion');assert.equal(h.path.status().motion,'reduced');assert.deepEqual(plain(h.path.state().understoodStepIds),[]);h.path.dispose();assert.equal(h.doc.count()+h.mq.count()+h.host.count(),0);
});

test('shared electric-violin artwork integrates without changing learning state or pause controls',()=>{
  const artModule={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../dist/violin-art.js',import.meta.url),'utf8'),{module:artModule,globalThis:{}});
  const h=harness();h.environment.SVViolinArt=artModule.exports;h.path.mount(h.host,{lang:'en'});
  assert.match(h.host.innerHTML,/data-sv-violin="open-frame-v18"/);assert.match(h.host.innerHTML,/class="sva-fingerboard"/);assert.doesNotMatch(h.host.innerHTML,/class="lp-wood"/);
  assert.deepEqual(plain(h.path.state()),initial());h.host.click('motion');assert.equal(h.scene.attrs['data-motion'],'paused');h.host.click('replay');assert.equal(h.path.status().motion,'playing');
  assert.equal(h.permissionCalls(),0);assert.equal(h.timerCalls(),0);
});
