import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function load(name){const module={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../dist/'+name,import.meta.url),'utf8'),{module,URL});return module.exports;}
const art=load('violin-art.js'),ui=load('lesson-client.js'),data=load('lesson-data.js');
test('selected acoustic body is distinct from the owner electric frame while both keep four strings',()=>{
 for(const type of ['acoustic','electric']){const markup=art.svg({variant:'learning',instrumentType:type,showBow:true});assert.match(markup,new RegExp('data-instrument="'+type+'"'));assert.equal((markup.match(/class="sva-string"/g)||[]).length,4);assert.match(markup,/sva-bow-hair/);assert.match(markup,/sva-bow-hand/);if(type==='acoustic'){assert.match(markup,/class="sva-f-hole"/);assert.match(markup,/class="sva-purfling"/)}else assert.doesNotMatch(markup,/class="sva-f-hole"/);}
});
test('bow movement retains its contact plane and reverses continuously with the note progress',()=>{
 const down=[0,.25,.5,.75,1].map(t=>art.pose({string:'A',finger:1,midi:71,bow:'down'},t)),up=[0,.25,.5,.75,1].map(t=>art.pose({string:'A',finger:1,midi:71,bow:'up'},t));assert.deepEqual(down.map(v=>v.bowY),[0,0,0,0,0]);assert.deepEqual(down.map(v=>v.bowX),up.map(v=>v.bowX).reverse());assert.ok(down.every(v=>Number.isFinite(v.fingerY)&&v.pressed));assert.equal(art.pose({string:'A',finger:0,midi:69},.5).pressed,false);
});
test('left hand coordinates retain fretless semitone spacing and stay on the selected string',()=>{
 for(const [i,string]of ['G','D','A','E'].entries()){const open=[55,62,69,76][i],first=art.pose({string,finger:1,midi:open+2}),second=art.pose({string,finger:2,midi:open+4}),third=art.pose({string,finger:3,midi:open+5});assert.equal(first.stringIndex,i);assert.ok(first.fingerY<second.fingerY&&second.fingerY<third.fingerY);assert.ok(second.fingerY-first.fingerY>third.fingerY-second.fingerY);}
});
test('all six teaching stages preserve the selected instrument and all language captions',()=>{
 for(const step of ['prepare','hold','tune','open','fingers','melody'])for(const lang of ['zh','en','ja','de'])for(const type of ['acoustic','electric']){const markup=art.teaching({step,lang,instrumentType:type});assert.match(markup,new RegExp('data-instrument="'+type+'"'));assert.match(markup,/st-caption/);assert.doesNotMatch(markup,/<script|<iframe|onload=|(?:href|src)=/i);if(step==='hold')assert.match(markup,/st-person/);if(step==='fingers')assert.match(markup,/st-finger-sequence|st-board/);}
});
test('lesson view takes acoustic selection through mount instead of defaulting back to electric',async()=>{
 const events=new Map(),lesson=data.lessons[0],host={classList:{add(){}},addEventListener(n,fn){events.set(n,fn)},removeEventListener(n){events.delete(n)},querySelector(){return null},querySelectorAll(){return []},contains(){return true},innerHTML:''};
 let state={position:0,index:0,loop:{start:0,end:lesson.duration},feedback:{}},onState;
 const transport={load(m){state={...state,manifest:m};onState(state)},pause(){},bindVideo(){},state(){return state},async seek(n){state.position=n},async setRate(){},dispose(){}};
 const environment={document:{addEventListener(){},removeEventListener(){}},location:{href:'https://local.invalid/'},navigator:{onLine:true},matchMedia:()=>({matches:false}),performance:{now:()=>0},SVViolinArt:art};
 const controller=ui.create({environment,storage:{getItem(){return null},setItem(){}},engine:{stopTuner(){}},transportAPI:{create(o){onState=o.onState;return transport}},fetch:async()=>({ok:true,json:async()=>({ok:true,lessons:[lesson]})})});
 controller.mount(host,{instrumentType:'acoustic',lang:'en'});for(let i=0;i<10;i++)await Promise.resolve();await controller.choose(lesson.id);assert.match(host.innerHTML,/data-instrument="acoustic"/);assert.doesNotMatch(host.innerHTML,/data-instrument="electric"/);controller.dispose();
});
