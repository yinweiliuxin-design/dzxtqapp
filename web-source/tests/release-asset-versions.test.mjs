import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const swSource=read('sw.js'),origin='https://release.fixture.invalid/';
function harness(){
 const handlers={},stores=new Map(),network=[];let online=true;
 const key=request=>typeof request==='string'?request:request.url;
 const caches={async keys(){return [...stores.keys()]},async open(name){if(!stores.has(name))stores.set(name,new Map());const rows=stores.get(name);return {async match(request){return rows.get(key(request))?.clone()},async put(request,response){rows.set(key(request),response.clone())}}},async delete(name){return stores.delete(name)}};
 const environment={URL,Response,caches,fetch:async request=>{network.push(key(request));if(!online)throw Error('fixture network offline');return new Response('CURRENT_NETWORK_BYTES')},self:{location:{href:origin+'sw.js'},addEventListener(type,handler){handlers[type]=handler},skipWaiting(){},clients:{claim(){}}}};
 vm.runInNewContext(swSource+'\nglobalThis.releaseInventory={VERSION,PREFIX,FILES:[...FILES],marker};',environment);
 async function request(url,mode='cors'){let result;handlers.fetch({request:{url,method:'GET',mode},respondWith(value){result=Promise.resolve(value)}});assert.ok(result,'Actual service worker must handle the tested URL');return (await result).text();}
 return {inventory:environment.releaseInventory,caches,stores,network,request,setOnline(value){online=value}};
}
function entryAssets(name){
 const values=[];for(const match of read(name).matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)){const url=new URL(match[1],origin);if(url.origin===new URL(origin).origin&&/\.(?:js|css)$/.test(url.pathname))values.push(url);}
 assert.ok(values.filter(url=>url.pathname.endsWith('.js')).length>10,'Entry must expose real script inventory');
 assert.ok(values.filter(url=>url.pathname.endsWith('.css')).length>10,'Entry must expose real stylesheet inventory');return values;
}

test('all entry JS/CSS cache versions match both offline module and service worker release',()=>{
 const {inventory}=harness(),offlineVersion=read('offline.js').match(/const VERSION=['"]([^'"]+)['"]/)?.[1];
 assert.ok(offlineVersion,'Offline version must be explicit');assert.equal(offlineVersion,inventory.VERSION);
 for(const entry of ['index.html','client.html'])for(const asset of entryAssets(entry))assert.deepEqual(asset.searchParams.getAll('v'),[inventory.VERSION],entry+' stale or missing version on '+asset.pathname);
});
test('offline manifest contains every necessary entry JS/CSS including the hotfix stylesheet',()=>{
 const {inventory}=harness(),files=new Set(inventory.FILES);
 for(const entry of ['index.html','client.html']){assert.ok(files.has(entry));for(const asset of entryAssets(entry))assert.ok(files.has(asset.pathname.slice(1)),entry+' asset missing from explicit offline preparation: '+asset.pathname);}
});
test('old complete cache cannot return old script bytes for a new version URL and remains usable offline',async()=>{
 const h=harness(),current=h.inventory.VERSION,old='20261025-v28-learning-1';assert.notEqual(current,old,'This regression must exercise a real version transition');
 const name=h.inventory.PREFIX+old+'-generation-upgrade-fixture',cache=await h.caches.open(name),files=[origin+'index.html',origin+'client.html',origin+'client.js',origin+'client.js?v='+old,origin+'style.css',origin+'style.css?v='+old];
 for(const url of files)await cache.put(url,new Response(url.endsWith('.html')?'OLD_OFFLINE_DOCUMENT':'OLD_CACHED_SCRIPT'));
 await cache.put(h.inventory.marker(old),new Response(JSON.stringify({schema:1,version:old,completedAt:'2026-10-25T00:00:00Z',files})));
 await h.caches.open('unrelated-fixture-cache');
 assert.equal(await h.request(origin+'client.js?v='+current),'CURRENT_NETWORK_BYTES');assert.deepEqual(h.network,[origin+'client.js?v='+current]);
 h.setOnline(false);const before=h.network.length;
 assert.equal(await h.request(origin+'client.js?v='+old),'OLD_CACHED_SCRIPT');assert.equal(h.network.length,before,'Old offline script should not require a network request');
 assert.equal(await h.request(origin+'?v='+current,'navigate'),'OLD_OFFLINE_DOCUMENT');
 await assert.rejects(h.request(origin+'client.js?v='+current),/fixture network offline/,'A new script URL must not silently substitute stale bytes');
 assert.deepEqual(await h.caches.keys(),[name,'unrelated-fixture-cache'],'Upgrade must preserve old offline content and unrelated storage');
});
