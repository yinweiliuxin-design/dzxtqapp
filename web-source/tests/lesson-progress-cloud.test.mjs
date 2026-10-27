import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const module={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../dist/lesson-progress-cloud.js',import.meta.url),'utf8'),{module});const Cloud=module.exports;
const clone=value=>JSON.parse(JSON.stringify(value)),signed=id=>({mode:'signed-in',verified:true,authenticated:true,user:{id,displayName:id}}),row=(id='original-open',more={})=>({id,position:2,step:1,completed:false,version:1,updatedAt:'2026-10-26T00:00:00Z',...more});
const response=(status,value)=>({ok:status>=200&&status<300,status,json:async()=>clone(value)}),flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function harness({initial=signed('alice'),timeout=10000,initialRows=[]}={}){
 let account=initial,session='alice',override=null,getAccountCalls=0;const calls=[],changes=[],rows=new Map(),stores=new Map([['alice',new Map(initialRows.map(r=>[r.id,clone(r)]))],['bob',new Map()]]),environment={AbortController,setTimeout,clearTimeout,navigator:{onLine:true}};
 const storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
 const fetch=async(path,init)=>{const call={path,...init,body:init.body?JSON.parse(init.body):null};calls.push(call);if(override){const result=await override(call);if(result!==undefined)return result;}
  const map=stores.get(session)||new Map();if(init.method==='GET')return response(200,{ok:true,viewer:{id:session},progress:[...map.values()]});
  if(init.headers['X-Account-Id']!==session)return response(409,{ok:false,error:{code:'STALE_USER'}});
  const incoming=call.body,current=map.get(incoming.id);if((current?.version||0)!==incoming.version)return response(409,{ok:false,error:{code:'CONFLICT'}});
  const saved={...incoming,version:incoming.version+1,updatedAt:'2026-10-26T00:01:00Z'};map.set(saved.id,saved);stores.set(session,map);return response(200,{ok:true,viewer:{id:session},...saved});
 };
 const api=Cloud.create({environment,storage,getAccount(){getAccountCalls++;return account;},getLesson:id=>({id,duration:20}),fetch,requestTimeoutMs:timeout,onChange:state=>changes.push(clone(state))});
 return {api,environment,rows,calls,changes,stores,getAccountCalls:()=>getAccountCalls,setAccount(value,{notify=true,server=true}={}){account=value;if(server)session=value?.user?.id||'';if(notify)api.accountChanged(value);},setSession(value){session=value;},setOverride(value){override=value;}};
}
test('constructor does not touch a possibly uninitialised account closure and guests make no cloud requests',async()=>{
 const h=harness({initial:{mode:'guest',verified:true,authenticated:false,user:null}});assert.equal(h.getAccountCalls(),0);assert.equal(await h.api.read(),false);assert.equal((await h.api.sync('original-open',{position:1,step:0,completed:false})).committed,false);assert.equal(h.calls.length,0);assert.equal(h.api.state().phase,'guest');
});
test('unverified or merely authenticated browser sessions cannot bypass explicit signed-in app mode',async()=>{
 for(const account of [{...signed('alice'),verified:false},{...signed('alice'),mode:'guest'},{...signed('alice'),authenticated:false},signed('a\nb')]){const h=harness({initial:account});await h.api.read();assert.equal(h.calls.length,0);assert.equal(h.api.state().authenticated,false);}
});
test('manual read binds the actual server viewer and never uploads or modifies local lesson progress',async()=>{
 const h=harness({initialRows:[row()]});assert.equal(await h.api.read(),true);assert.equal(h.calls.length,1);assert.equal(h.calls[0].method,'GET');assert.equal(h.calls[0].credentials,'same-origin');assert.equal(h.calls[0].headers['X-Account-Id'],'alice');assert.equal(h.api.record('original-open').position,2);const value=h.api.record('original-open');value.position=99;assert.equal(h.api.record('original-open').position,2);assert.equal(h.rows.size,0);
});
test('manual sync is blocked until this account has explicitly read its cloud version',async()=>{
 const h=harness();const result=await h.api.sync('original-open',{position:4,step:2,completed:false});assert.equal(result.committed,false);assert.equal(h.api.state().phase,'read-required');assert.equal(h.calls.length,0);assert.equal(h.rows.size,0);
});
test('explicit merge sync sends the expected actor and CAS version and confirms only matching results',async()=>{
 const h=harness({initialRows:[row('original-open',{completed:true,version:3})]});await h.api.read();const result=await h.api.sync('original-open',{position:6,step:2,completed:false});assert.equal(result.committed,true);assert.deepEqual(h.calls[1].body,{id:'original-open',position:6,step:2,completed:true,version:3});assert.equal(h.calls[1].headers['X-Account-Id'],'alice');assert.equal(result.progress.version,4);assert.equal(h.api.state().pendingCount,0);
});
test('merge keeps the cloud position for a later completed stage and uses local position when stages match',()=>{
 assert.deepEqual(clone(Cloud.mergeProgress({id:'original-open',position:9,step:1,completed:false},row('original-open',{position:2,step:3,completed:true}))),{id:'original-open',position:2,step:3,completed:true});assert.equal(Cloud.mergeProgress({id:'original-open',position:4,step:3,completed:false},row('original-open',{position:2,step:3})).position,4);assert.throws(()=>Cloud.mergeProgress({id:'original-open',position:4,step:0,completed:false},row('other-lesson')),/MISMATCH/);
});
test('account switch cancels a late read and never exposes the prior account record',async()=>{
 const h=harness();let resolve;h.setOverride(call=>call.method==='GET'?new Promise(done=>resolve=done):undefined);const read=h.api.read();await flush();h.setAccount(signed('bob'));assert.equal(h.calls[0].signal.aborted,true);resolve(response(200,{ok:true,viewer:{id:'alice'},progress:[row()]}));await read;assert.equal(h.api.state().actorId,'bob');assert.equal(h.api.state().records.length,0);assert.equal(h.api.state().loaded,false);
});
test('missing or mismatched server viewer fails closed and cannot be used for a write',async()=>{
 for(const viewer of [undefined,{id:'bob'}]){const h=harness();h.setOverride(()=>response(200,{ok:true,viewer,progress:[row()]}));assert.equal(await h.api.read(),false);assert.equal(h.api.state().phase,'account-changed');assert.equal(h.api.record('original-open'),null);await h.api.sync('original-open',{position:3,step:0,completed:false});assert.equal(h.calls.some(c=>c.method==='PUT'),false);}
});
test('a server session change between read and write is rejected by X-Account-Id rather than writing to the new owner',async()=>{
 const h=harness({initialRows:[row()]});await h.api.read();h.setSession('bob');const result=await h.api.sync('original-open',{position:8,step:2,completed:false});assert.equal(result.committed,false);assert.equal(h.calls[1].headers['X-Account-Id'],'alice');assert.equal(h.stores.get('bob').size,0);assert.equal(h.api.state().phase,'account-changed');assert.equal(h.api.state().records.length,0);
});
test('CAS conflict rereads the latest cloud state but does not automatically retry a write',async()=>{
 const h=harness({initialRows:[row()]});await h.api.read();h.stores.get('alice').set('original-open',row('original-open',{version:2,step:3,position:5}));const result=await h.api.sync('original-open',{position:8,step:2,completed:false});assert.equal(result.conflict,true);assert.deepEqual(h.calls.map(c=>c.method),['GET','PUT','GET']);assert.equal(h.api.state().phase,'conflict');assert.equal(h.api.record('original-open').version,2);assert.equal(h.stores.get('alice').get('original-open').position,5);
});
test('offline pending intent is owner-scoped, durable, and requires another manual sync after reconnect',async()=>{
 const h=harness();await h.api.read();h.environment.navigator.onLine=false;const result=await h.api.sync('original-open',{position:7,step:2,completed:false});assert.equal(result.queued,true);assert.equal(result.persisted,true);assert.equal(h.calls.length,1);assert.equal(h.api.state().pendingCount,1);const key=Cloud.PREFIX+'alice';assert.equal(JSON.parse(h.rows.get(key)).actorId,'alice');h.setAccount(signed('bob'));assert.equal(h.api.state().pendingCount,0);assert.ok(h.rows.has(key));h.setAccount(signed('alice'));assert.equal(h.api.state().pendingCount,1);assert.equal(h.calls.length,1);h.environment.navigator.onLine=true;await h.api.read();assert.deepEqual(h.calls.map(c=>c.method),['GET','GET']);await h.api.sync('original-open',{position:7,step:2,completed:false});assert.equal(h.api.state().pendingCount,0);assert.equal(h.rows.has(key),false);
});
test('uncertain write result retains the owner intent and requires a fresh read without automatic upload',async()=>{
 const h=harness();await h.api.read();h.setOverride(call=>{if(call.method==='PUT')throw Error('lost response');});const result=await h.api.sync('original-open',{position:5,step:1,completed:false});assert.equal(result.uncertain,true);assert.equal(h.api.state().loaded,false);assert.equal(h.api.state().pendingCount,1);h.setOverride(null);await h.api.read();assert.deepEqual(h.calls.map(c=>c.method),['GET','PUT','GET']);assert.equal(h.api.state().pendingCount,1);
});
test('request timeout aborts and late success cannot populate a cloud read',async()=>{
 const h=harness({timeout:10});let resolve;h.setOverride(()=>new Promise(done=>resolve=done));const read=h.api.read();await new Promise(done=>setTimeout(done,25));assert.equal(await read,false);assert.equal(h.calls[0].signal.aborted,true);assert.equal(h.api.state().loaded,false);resolve(response(200,{ok:true,viewer:{id:'alice'},progress:[row()]}));await flush();assert.equal(h.api.state().records.length,0);h.api.dispose();
});
test('unverified server progress, duplicate IDs and nonmatching confirmations never claim success',async()=>{
 for(const progress of [[row('original-open',{position:Infinity})],[row(),row()],[row('bad/lesson')]]){const h=harness();h.setOverride(()=>response(200,{ok:true,viewer:{id:'alice'},progress}));assert.equal(await h.api.read(),false);assert.equal(h.api.state().loaded,false);}
 const h=harness();await h.api.read();h.setOverride(call=>call.method==='PUT'?response(200,{ok:true,viewer:{id:'alice'},...row('original-open',{position:1,step:0,version:9})}):undefined);const result=await h.api.sync('original-open',{position:5,step:1,completed:false});assert.equal(result.committed,false);assert.equal(result.uncertain,true);
});
test('read failure invalidates adoption and sync permissions even after an older successful read',async()=>{
 const h=harness({initialRows:[row()]});await h.api.read();h.setOverride(()=>response(503,{ok:false,error:{code:'DB_UNAVAILABLE'}}));assert.equal(await h.api.read(),false);assert.equal(h.api.record('original-open'),null);const before=h.calls.length;await h.api.sync('original-open',{position:7,step:3,completed:false});assert.equal(h.calls.length,before);
});
test('corrupt pending queue is preserved without exposing its content or claiming it was persisted',()=>{
 const h=harness();h.rows.set(Cloud.PREFIX+'alice','{bad');h.api.accountChanged();assert.equal(h.api.state().queuePersisted,false);assert.equal(h.api.state().pendingCount,0);assert.equal(h.rows.get(Cloud.PREFIX+'alice'),'{bad');
});
test('clearing pending progress does not delete another account queue or issue cloud writes',async()=>{
 const h=harness();await h.api.read();h.environment.navigator.onLine=false;await h.api.sync('original-open',{position:4,step:1,completed:false});const a=h.rows.get(Cloud.PREFIX+'alice');h.setAccount(signed('bob'));h.api.clearPending();assert.equal(h.rows.get(Cloud.PREFIX+'alice'),a);assert.equal(h.calls.length,1);
});
