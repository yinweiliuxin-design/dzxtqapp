/* Optional manual lesson progress sync. Guest progress never uploads automatically. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SVLessonProgressCloud=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const PREFIX='smartvio-lesson-cloud-pending-v1:',copy=value=>JSON.parse(JSON.stringify(value));
 const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(value);
 function actorOf(value){return value?.mode==='signed-in'&&value.verified===true&&value.authenticated===true&&typeof value.user?.id==='string'&&value.user.id.trim()===value.user.id&&value.user.id.length>0&&value.user.id.length<=256&&!/[\u0000-\u0020\u007f]/.test(value.user.id)?value.user.id:null;}
 function progressOf(value){if(!value||!validId(value.id)||!Number.isFinite(value.position)||value.position<0||value.position>3600||!Number.isInteger(value.step)||value.step<0||value.step>4||typeof value.completed!=='boolean')throw Error('INVALID_PROGRESS');return {id:value.id,position:value.position,step:value.step,completed:value.completed};}
 function mergeProgress(local,remote){const a=progressOf(local),b=remote?progressOf(remote):null;if(!b)return a;if(a.id!==b.id)throw Error('LESSON_MISMATCH');return {...a,step:Math.max(a.step,b.step),position:b.step>a.step?b.position:a.position,completed:a.completed||b.completed};}
 function create(options={}){
  const env=options.environment||globalThis;let actor=null,generation=0,disposed=false,busy=false,phase='guest',error=null,loaded=false,records=new Map(),pending=new Map(),queuePersisted=true,controller=null,cancelPending=null;
  let storage;try{storage=options.storage===undefined?env.localStorage:options.storage;}catch{}
  const fail=(code,status=0,uncertain=false)=>Object.assign(Error(code),{code,status,uncertain});
  function currentActor(){try{return actorOf(options.getAccount?.());}catch{return null;}}
  const online=()=>env.navigator?.onLine!==false&&options.isOnline?.()!==false;
  function snapshot(){return {phase,error,busy,authenticated:!!actor,actorId:actor,loaded,pendingCount:pending.size,queuePersisted,records:[...records.values()].map(copy),pendingIds:[...pending.keys()]};}
  function emit(){if(!disposed)try{options.onChange?.(snapshot());}catch{}}
  function cancel(){generation++;controller?.abort();cancelPending?.();controller=null;cancelPending=null;busy=false;if(actor&&['reading','saving'].includes(phase))phase=loaded?'ready':'idle';}
  function queueKey(){return PREFIX+encodeURIComponent(actor);}
  function loadQueue(){pending=new Map();queuePersisted=true;if(!actor)return;try{const raw=storage?.getItem(queueKey());if(!raw)return;if(raw.length>262144)throw Error('Large queue');const value=JSON.parse(raw);if(value.schema!==1||value.actorId!==actor||!Array.isArray(value.entries)||value.entries.length>100)throw Error('Invalid queue');for(const entry of value.entries){const p=progressOf(entry);if(pending.has(p.id))throw Error('Duplicate pending lesson');pending.set(p.id,p);}}catch{pending=new Map();queuePersisted=false;}}
  function saveQueue(){try{if(!storage?.setItem)throw Error('No storage');if(pending.size)storage.setItem(queueKey(),JSON.stringify({schema:1,actorId:actor,entries:[...pending.values()]}));else storage.removeItem?.(queueKey());queuePersisted=true;}catch{queuePersisted=false;}}
  function accountChanged(value){if(disposed)return snapshot();const next=actorOf(value===undefined?(()=>{try{return options.getAccount?.();}catch{return null;}})():value);if(next===actor)return snapshot();cancel();actor=next;loaded=false;records=new Map();error=null;phase=actor?'idle':'guest';loadQueue();emit();return snapshot();}
  function align(){const actual=currentActor();if(actual!==actor)accountChanged();return actual;}
  function assertCurrent(id,sequence){if(disposed||sequence!==generation||actor!==id||currentActor()!==id)throw fail('CANCELLED');}
  function validRecord(row){const p=progressOf(row);if(!Number.isSafeInteger(row.version)||row.version<1)throw fail('INVALID_RESPONSE');return {...p,version:row.version,updatedAt:typeof row.updatedAt==='string'?row.updatedAt:null};}
  async function request(method,body,id,sequence){
   assertCurrent(id,sequence);const Controller=env.AbortController;controller=typeof Controller==='function'?new Controller():null;let timer=null,abortReject;
   const cancelled=new Promise((_,reject)=>{abortReject=()=>reject(fail('CANCELLED'));cancelPending=abortReject;});
   const timeout=new Promise((_,reject)=>{timer=env.setTimeout?.(()=>{controller?.abort();reject(fail('TIMEOUT',0,method==='PUT'));},Math.max(1,Math.min(30000,options.requestTimeoutMs||10000)));});
   const task=(async()=>{let response,value;try{response=await (options.fetch||env.fetch.bind(env))('/api/me/lesson-progress',{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','X-Account-Id':id,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),...(controller?{signal:controller.signal}:{})});}catch{throw fail('NETWORK',0,method==='PUT');}assertCurrent(id,sequence);
    try{value=await response.json();}catch{throw fail('INVALID_RESPONSE',response.status||0,method==='PUT');}assertCurrent(id,sequence);
    if(!response.ok||value?.ok!==true)throw fail(value?.error?.code||'HTTP_ERROR',response.status||0,method==='PUT'&&response.status>=500);
    if(value.viewer?.id!==id)throw fail('IDENTITY_MISMATCH',409,method==='PUT');return value;
   })();
   try{return await Promise.race([task,timeout,cancelled]);}finally{if(timer!==null)env.clearTimeout?.(timer);if(cancelPending===abortReject){cancelPending=null;controller=null;}}
  }
  async function readRows(id,sequence){const value=await request('GET',null,id,sequence);if(!Array.isArray(value.progress)||value.progress.length>100)throw fail('INVALID_RESPONSE');const map=new Map();for(const row of value.progress){const p=validRecord(row);if(map.has(p.id))throw fail('INVALID_RESPONSE');map.set(p.id,p);}assertCurrent(id,sequence);records=map;loaded=true;}
  function handleError(problem){error=problem.code||problem.message||'UNAVAILABLE';if(problem.code==='CANCELLED')return;loaded=false;if(['STALE_USER','IDENTITY_MISMATCH'].includes(problem.code)||problem.status===401||problem.status===403){records=new Map();phase='account-changed';}else phase=problem.uncertain?'uncertain':'error';}
  async function read(){const id=align();if(!id||disposed||busy)return false;if(!online()){phase=pending.size?'queued':'offline';emit();return false;}const sequence=++generation;busy=true;phase='reading';error=null;emit();try{await readRows(id,sequence);phase=pending.size?'pending':'ready';return true;}catch(problem){if(sequence===generation)handleError(problem);return false;}finally{if(sequence===generation){busy=false;emit();}}}
  function record(id){align();const value=loaded&&actor?records.get(id):null;return value?copy(value):null;}
  async function sync(id,local){
   const owner=align();if(!owner||disposed||busy)return {committed:false};if(!loaded){phase='read-required';emit();return {committed:false};}
   let desired;try{const manifest=options.getLesson?.(id);if(!manifest||!validId(id))throw fail('LESSON_UNAVAILABLE');desired=mergeProgress({...local,id},records.get(id));desired.position=Math.max(0,Math.min(manifest.duration,desired.position));if(!pending.has(id)&&pending.size>=100)throw fail('QUEUE_FULL');pending.set(id,desired);saveQueue();}catch(problem){handleError(problem);emit();return {committed:false};}
   if(!online()){phase='queued';emit();return {committed:false,queued:true,persisted:queuePersisted};}
   const sequence=++generation,version=records.get(id)?.version||0;busy=true;phase='saving';error=null;emit();
   try{const value=await request('PUT',{...desired,version},owner,sequence),saved=validRecord(value);assertCurrent(owner,sequence);if(saved.id!==id||saved.version!==version+1||saved.position!==desired.position||saved.step!==desired.step||saved.completed!==desired.completed)throw fail('INVALID_RESPONSE',0,true);records.set(id,saved);pending.delete(id);saveQueue();phase=pending.size?'pending':'ready';return {committed:true,actorId:owner,progress:copy(saved)};}
   catch(problem){if(sequence!==generation)return {committed:false};if(problem.status===409&&problem.code==='CONFLICT'){try{await readRows(owner,sequence);phase='conflict';error='CONFLICT';}catch(readError){handleError(readError);}}else handleError(problem);return {committed:false,conflict:phase==='conflict',uncertain:phase==='uncertain'};}
   finally{if(sequence===generation){busy=false;emit();}}
  }
  function clearPending(){align();if(!actor)return;cancel();pending=new Map();saveQueue();phase=loaded?'ready':'idle';emit();}
  return {read,sync,record,accountChanged,clearPending,cancel,state(){if(!disposed)align();return snapshot();},dispose(){cancel();disposed=true;actor=null;loaded=false;phase='guest';records.clear();pending.clear();}};
 }
 return Object.freeze({create,actorOf,progressOf,mergeProgress,PREFIX});
});
