'use strict';
// Host-side browser protocol simulation. This is not Android WebView/phone validation.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/bridge.js'),'utf8');
function harness(options={}){
 const messages=[],notices=[],listeners={},nativeCalls=[],bytes=options.bytes||Buffer.from('Silvio MIDI/audio export'),nonce='test-navigation-nonce';let transfer=[],offset=0,closed=false;
 class Anchor{constructor(){this.tagName='A';this.href='blob:https://smartvio-studio-mobile.politecalf5.chatgpt.site/id';this.download='my-recording.webm'}hasAttribute(n){return n==='download'}click(){nativeCalls.push('default-click')}}
 const port={start(){},close(){closed=true},postMessage(raw){const m=JSON.parse(raw);messages.push(m);if(m.type==='abort')return;queueMicrotask(()=>{
  let result={nonce,id:m.id,status:'ok'};
  if(options.fail===m.type)result={...result,status:'error',message:'simulated failure'};
  else if(m.type==='chunk'){const b=Buffer.from(m.data,'base64');assert.equal(m.offset,offset);assert.ok(b.length<=48*1024);transfer.push(b);offset+=b.length;result.offset=options.wrongOffset?offset+1:offset;}
  port.onmessage({data:JSON.stringify(result)});
 })}};
 class Reader{readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onload()}).catch(e=>{this.error=e;this.onerror()})}}
 const document={createElement(){return {style:{},setAttribute(){},remove(){},set textContent(v){notices.push(v)}}},documentElement:{appendChild(){}},addEventListener(t,cb){listeners['doc:'+t]=cb},removeEventListener(t){delete listeners['doc:'+t]}};
 const window={addEventListener(t,cb){listeners[t]=cb},removeEventListener(t){delete listeners[t]}};
 vm.runInNewContext(source,{__SILVIO_NONCE__:nonce,window,document,HTMLAnchorElement:Anchor,FileReader:Reader,Uint8Array,Promise,Math,Date,Error,JSON,fetch:async()=>({ok:options.httpOk!==false,blob:async()=>new Blob([bytes],{type:'audio/webm'})}),btoa:s=>Buffer.from(s,'binary').toString('base64'),setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t},clearTimeout});
 const connect=(value=nonce)=>listeners.message?.({data:JSON.stringify({type:'silvio-export-channel',nonce:value}),ports:[port]});
 async function waitFor(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,2))}throw Error('bridge did not complete')}
 return {Anchor,messages,notices,connect,port,window,nativeCalls,waitFor,bytes,get transferred(){return Buffer.concat(transfer)},get closed(){return closed}};
}
test('chunked Blob download preserves bytes and nonce',async()=>{const h=harness({bytes:Buffer.alloc(125000,73)});h.connect();new h.Anchor().click();await h.waitFor(()=>h.messages.some(m=>m.type==='end'));assert.deepEqual(h.transferred,h.bytes);assert.ok(h.messages.every(m=>m.nonce==='test-navigation-nonce'));assert.equal(h.messages.filter(m=>m.type==='chunk').length,3);h.window.__silvioExportCleanup()});
test('wrong handshake nonce cannot create an export',async()=>{const h=harness();h.connect('wrong');new h.Anchor().click();await h.waitFor(()=>h.notices.length);assert.equal(h.messages.length,0);h.window.__silvioExportCleanup()});
test('native begin rejection aborts without sending chunks',async()=>{const h=harness({fail:'begin'});h.connect();new h.Anchor().click();await h.waitFor(()=>h.messages.some(m=>m.type==='abort'));assert.equal(h.messages.some(m=>m.type==='chunk'),false);h.window.__silvioExportCleanup()});
test('out of order native acknowledgement aborts export',async()=>{const h=harness({wrongOffset:true});h.connect();new h.Anchor().click();await h.waitFor(()=>h.messages.some(m=>m.type==='abort'));assert.equal(h.messages.some(m=>m.type==='end'),false);h.window.__silvioExportCleanup()});
test('double tap does not open concurrent transfers',async()=>{const h=harness();h.connect();new h.Anchor().click();new h.Anchor().click();await h.waitFor(()=>h.messages.some(m=>m.type==='end'));assert.equal(h.messages.filter(m=>m.type==='begin').length,1);h.window.__silvioExportCleanup()});
test('ordinary anchor download keeps browser behavior',()=>{const h=harness();h.connect();const a=new h.Anchor();a.href='https://example.org/audio.wav';a.click();assert.equal(h.nativeCalls.length,1);assert.equal(h.messages.length,0);h.window.__silvioExportCleanup()});
test('cleanup closes port and restores original anchor behavior',()=>{const h=harness();h.connect();h.window.__silvioExportCleanup();assert.equal(h.closed,true);new h.Anchor().click();assert.equal(h.nativeCalls.length,1)});
test('read failure reports error and never opens native save',async()=>{const h=harness({httpOk:false});h.connect();new h.Anchor().click();await h.waitFor(()=>h.notices.length);assert.equal(h.messages.some(m=>m.type==='begin'),false);h.window.__silvioExportCleanup()});
