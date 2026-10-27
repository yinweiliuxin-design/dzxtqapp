/* Online preview runtime. Runs the unmodified Worker API (concatenated above this file by build.cjs)
 * inside the browser: D1 is sql.js (asm.js build, no WebAssembly), R2 is IndexedDB, and /api/* fetches
 * from the app are answered locally. Everything stays in this browser; nothing is sent anywhere. */
const SVP_IDENTITY={admin:'preview-owner',user:'preview-user'};
const SVP_VERSION_KEY='svp-db-version',SVP_ROLE_KEY='svp-role';
const svpRole=(()=>{try{const r=localStorage.getItem(SVP_ROLE_KEY);return r==='user'||r==='anonymous'?r:'admin';}catch{return 'admin';}})();

function svpIdb(){
  return new Promise((resolve,reject)=>{const open=indexedDB.open('svp-backend',1);
    open.onupgradeneeded=()=>{open.result.createObjectStore('kv');open.result.createObjectStore('objects');};
    open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
}
let svpIdbPromise=null;
function svpStore(name,mode,work){
  svpIdbPromise||=svpIdb();
  return svpIdbPromise.then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(name,mode),req=work(tx.objectStore(name));
    tx.oncomplete=()=>resolve(req?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}));
}
const svpGet=(store,key)=>svpStore(store,'readonly',s=>s.get(key));
const svpPut=(store,key,value)=>svpStore(store,'readwrite',s=>s.put(value,key));
const svpDel=(store,key)=>svpStore(store,'readwrite',s=>s.delete(key));

// D1 over sql.js, mirroring tests/d1-sqlite.mjs (the adapter the local preview uses).
let svpSQL=null,svpDb=null,svpDirty=false,svpLoaded=null;
function svpD1(){
  function execute(sql,values){
    const statement=svpDb.prepare(sql);
    try{
      statement.bind(values.map(v=>typeof v==='boolean'?Number(v):v===undefined?null:v));
      const results=[];while(statement.step())results.push(statement.getAsObject());
      const write=!/^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/i.test(sql),changes=write?svpDb.getRowsModified():0;
      if(write)svpDirty=true;
      const last=svpDb.exec('SELECT last_insert_rowid()')[0]?.values[0][0]??0;
      return {success:true,results,meta:{changes,last_row_id:Number(last)}};
    }finally{statement.free();}
  }
  function prepared(sql,values=[]){
    return {sql,values,execute:()=>execute(sql,values),
      bind(...input){return prepared(sql,input);},
      async all(){return execute(sql,values);},
      async first(column){const row=execute(sql,values).results[0]||null;return column===undefined?row:row?.[column]??null;},
      async run(){return execute(sql,values);}};
  }
  return {prepare:prepared,
    async batch(statements){svpDb.exec('BEGIN IMMEDIATE');
      try{const results=statements.map(s=>s.execute());svpDb.exec('COMMIT');return results;}catch(error){svpDb.exec('ROLLBACK');throw error;}},
    async exec(sql){svpDb.exec(sql);svpDirty=true;}};
}
function svpMigrate(){
  svpDb.exec('CREATE TABLE IF NOT EXISTS __local_d1_migrations (tag TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const done=new Set((svpDb.exec('SELECT tag FROM __local_d1_migrations')[0]?.values||[]).map(r=>r[0]));
  for(const m of SVP_MIGRATIONS){
    if(done.has(m.tag))continue;
    svpDb.exec('BEGIN IMMEDIATE');
    try{svpDb.exec(m.sql);svpDb.run('INSERT INTO __local_d1_migrations (tag,hash,applied_at) VALUES (?,?,?)',[m.tag,m.hash,new Date().toISOString()]);svpDb.exec('COMMIT');svpDirty=true;}
    catch(error){svpDb.exec('ROLLBACK');throw error;}
  }
}
function svpVersion(){try{return localStorage.getItem(SVP_VERSION_KEY);}catch{return null;}}
async function svpOpen(){
  const bytes=await svpGet('kv','database');
  svpDb?.close();svpDb=bytes?new svpSQL.Database(bytes):new svpSQL.Database();
  svpDb.exec('PRAGMA foreign_keys=ON');svpMigrate();svpLoaded=svpVersion();
}
async function svpPersist(){
  if(!svpDirty)return;
  const bytes=svpDb.export();svpDb.exec('PRAGMA foreign_keys=ON');svpDirty=false;
  await svpPut('kv','database',bytes);
  const version=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  try{localStorage.setItem(SVP_VERSION_KEY,version);}catch{}
  svpLoaded=version;
}

// R2 over IndexedDB, mirroring the local preview's file-backed bucket.
const svpBucket={
  async put(key,value){const bytes=value instanceof Uint8Array?value:new Uint8Array(value instanceof ArrayBuffer?value:await new Response(value).arrayBuffer());await svpPut('objects',key,bytes);return {key,size:bytes.byteLength};},
  async head(key){const b=await svpGet('objects',key);return b?{size:b.byteLength}:null;},
  async get(key,options){const b=await svpGet('objects',key);if(!b)return null;
    if(options?.range){const {offset,length}=options.range;if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1)throw Error('Invalid object range');
      const end=Math.min(b.byteLength,offset+length);return {body:b.slice(offset,end),size:b.byteLength,range:{offset,length:Math.max(0,end-offset)}};}
    return {body:b,size:b.byteLength};},
  async delete(key){await svpDel('objects',key);}
};

const svpEnv={DB:null,BUCKET:svpBucket,ADMIN_USER_IDS:JSON.stringify([SVP_IDENTITY.admin]),CATALOG_SOURCE,LESSON_SOURCE,LESSON_MEDIA_PATHS};
const svpReady=(async()=>{svpSQL=await initSqlJs({});await svpOpen();svpEnv.DB=svpD1();await svpPersist();})();
svpReady.catch(error=>console.error('Online preview backend failed to start',error));

// The Worker reads Origin and the hosting identity header; browsers forbid setting those on a Request,
// so the request handed to the Worker carries its own Headers object.
class SvpRequest extends Request{
  constructor(url,init,headers){super(url,init);Object.defineProperty(this,'svpHeaders',{value:headers});}
  get headers(){return this.svpHeaders;}
}
let svpQueue=Promise.resolve();
function svpSerial(work){const run=svpQueue.then(work,work);svpQueue=run.catch(()=>{});return run;}
const svpFetch=window.fetch.bind(window);
async function svpHandle(input,init){
  const source=input instanceof Request?input:null,url=new URL(source?source.url:String(input),location.href);
  const method=String(init?.method||source?.method||'GET').toUpperCase();
  const headers=new Headers(init?.headers||source?.headers||undefined);
  let body=init&&'body' in init?init.body:source&&!['GET','HEAD'].includes(method)?await source.arrayBuffer():undefined;
  if(body instanceof Blob){if(!headers.has('Content-Type')&&body.type)headers.set('Content-Type',body.type);body=await body.arrayBuffer();}
  else if(typeof body==='string'){body=new TextEncoder().encode(body).buffer;}
  else if(ArrayBuffer.isView(body)){body=body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength);}
  if(['GET','HEAD'].includes(method))body=undefined;
  if(body!==undefined&&body!==null)headers.set('Content-Length',String(body.byteLength));
  headers.set('Origin',location.origin);headers.set('Sec-Fetch-Site','same-origin');
  for(const name of ['oai-authenticated-user-id','oai-authenticated-user-email','oai-authenticated-user-name'])headers.delete(name);
  if(SVP_IDENTITY[svpRole])headers.set('oai-authenticated-user-id',SVP_IDENTITY[svpRole]);
  await svpReady;
  return svpSerial(async()=>{
    if(svpVersion()!==svpLoaded)await svpOpen();
    const request=new SvpRequest(url.href,{method,body,signal:init?.signal||source?.signal},headers);
    try{return (await handleAPI(request,svpEnv))||new Response('Not found',{status:404});}
    finally{await svpPersist();}
  });
}
window.fetch=function(input,init){
  let url;try{url=new URL(input instanceof Request?input.url:String(input),location.href);}catch{return svpFetch(input,init);}
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return svpFetch(input,init);
  return svpHandle(input,init);
};

// <video>/<img> sources that point at the API cannot reach a server here; load them through the API above.
function svpMedia(el){
  const raw=el.getAttribute('src');if(!raw||raw.startsWith('blob:')||raw.startsWith('data:'))return;
  let url;try{url=new URL(raw,location.href);}catch{return;}
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return;
  el.removeAttribute('src');el.dataset.svpSrc=raw;
  window.fetch(url.href).then(r=>r.ok?r.blob():Promise.reject(Error('HTTP '+r.status))).then(blob=>{
    if(el.dataset.svpSrc!==raw||el.getAttribute('src'))return;
    el.src=URL.createObjectURL(blob);
  }).catch(()=>{el.dispatchEvent(new Event('error'));});
}
const svpMediaSelector='video[src],audio[src],img[src],source[src]';
new MutationObserver(records=>{for(const r of records){
  if(r.type==='attributes'){svpMedia(r.target);continue;}
  for(const n of r.addedNodes){if(n.nodeType!==1)continue;if(n.matches(svpMediaSelector))svpMedia(n);n.querySelectorAll?.(svpMediaSelector).forEach(svpMedia);}
}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});

// Files the app saves through <a download> go through the viewer's downloads capability.
// Formats outside its allowlist (.mid, .wav …) are wrapped in a .zip.
const SVP_ALLOWED=/\.(gif|png|jpe?g|webp|mp4|webm|mov|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx|zip|fig)$/i;
const svpCrcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function svpZip(name,bytes){
  let crc=0xffffffff;for(const b of bytes)crc=svpCrcTable[(crc^b)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
  const file=new TextEncoder().encode(name),local=new DataView(new ArrayBuffer(30)),central=new DataView(new ArrayBuffer(46)),end=new DataView(new ArrayBuffer(22));
  local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(6,0x0800,true);local.setUint32(14,crc,true);local.setUint32(18,bytes.length,true);local.setUint32(22,bytes.length,true);local.setUint16(26,file.length,true);
  central.setUint32(0,0x02014b50,true);central.setUint16(4,20,true);central.setUint16(6,20,true);central.setUint16(8,0x0800,true);central.setUint32(16,crc,true);central.setUint32(20,bytes.length,true);central.setUint32(24,bytes.length,true);central.setUint16(28,file.length,true);
  const centralOffset=30+file.length+bytes.length;
  end.setUint32(0,0x06054b50,true);end.setUint16(8,1,true);end.setUint16(10,1,true);end.setUint32(12,46+file.length,true);end.setUint32(16,centralOffset,true);
  return new Blob([local,file,bytes,central,file,end],{type:'application/zip'});
}
async function svpDownloads(){try{return window.claude?.use?await window.claude.use('downloads'):null;}catch{return null;}}
function svpNotice(text){const el=document.getElementById('notice');if(!el)return;el.textContent=text;el.style.display='block';setTimeout(()=>{el.style.display='none';},4200);}
async function svpSave(anchor){
  let name=anchor.getAttribute('download')||anchor.download||'download';
  const blobPromise=fetch(anchor.href).then(r=>r.blob());
  const downloads=await svpDownloads();
  if(!downloads){svpNotice('这个预览环境不能保存文件。');return;}
  let data=await blobPromise;
  if(!SVP_ALLOWED.test(name)){data=svpZip(name,new Uint8Array(await data.arrayBuffer()));name=name.replace(/\.[^.]*$/,'')+'.zip';}
  try{await downloads.save({filename:name,data});}
  catch(error){if(error?.code!=='declined')svpNotice('文件没有保存：'+(error?.message||error?.code||'未知原因'));}
}
const svpClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){
  if(this.hasAttribute('download')&&window.claude?.use){svpSave(this);return;}
  return svpClick.call(this);
};
document.addEventListener('click',event=>{
  const anchor=event.target.closest?.('a[download]');
  if(anchor&&window.claude?.use){event.preventDefault();svpSave(anchor);}
},true);

// Small "online preview" sheet: what runs here, what does not, and the admin entry.
window.SVPreview={role:svpRole,ready:svpReady,
  async reset(){await svpReady;svpIdbPromise?.then(db=>db.close());svpIdbPromise=null;
    await new Promise(r=>{const del=indexedDB.deleteDatabase('svp-backend');del.onsuccess=del.onerror=del.onblocked=()=>r();});
    try{localStorage.removeItem(SVP_VERSION_KEY);}catch{}location.reload();},
  setRole(role){try{localStorage.setItem(SVP_ROLE_KEY,role);}catch{}location.reload();}};
