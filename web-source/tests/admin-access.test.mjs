import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const project=fileURLToPath(new URL('../',import.meta.url));
execFileSync(process.execPath,['scripts/build-worker.cjs'],{cwd:project,stdio:'pipe'});
const {default:worker}=await import('../dist/server/index.js');
const origin='https://smartvio.test',env={ADMIN_USER_IDS:JSON.stringify(['owner'])};
const request=(route,options={})=>new Request(origin+route,options);
const fetch=(route,options={},environment=env)=>worker.fetch(request(route,options),environment,{});
const owner={headers:{'oai-authenticated-user-id':'owner'}};
const ordinary={headers:{'oai-authenticated-user-id':'visitor'}};
const documents=['/admin','/admin/','/admin.html','/%61dmin','/admin%2f','/admin%2ehtml','/%61dmin%2ehtml','/admin?return_to=https://attacker.example/'];

test('public entry and visitor auth configuration remain available without a hosted login',async()=>{
  const response=await fetch('/');assert.equal(response.status,200);
  const html=gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
  assert.match(html,/name="viewport"/);assert.match(html,/client\.js/);
  const session=await fetch('/api/auth/session');assert.equal(session.status,200);assert.equal((await session.json()).authenticated,false);
  const config=await fetch('/api/auth/config');assert.equal(config.status,200);assert.equal((await config.json()).guest.enabled,true);
});

test('admin document aliases and encoded names require top-level platform sign-in',async()=>{
  for(const route of documents){
    const response=await fetch(route);assert.equal(response.status,302,route);
    const target=new URL(response.headers.get('Location'),origin);
    assert.equal(target.origin,origin);assert.equal(target.pathname,'/signin-with-chatgpt');
    assert.equal(target.searchParams.get('return_to'),'/admin');
    assert.match(response.headers.get('Cache-Control'),/private, no-store/);
    assert.equal(await response.text(),'');
  }
  const response=await fetch('/admin',{method:'HEAD'});assert.equal(response.status,302);assert.equal(await response.text(),'');
});

test('query, email, application roles, cookies and arbitrary bearer tokens do not unlock admin assets',async()=>{
  const fake={headers:{'oai-authenticated-user-email':'owner@example.test','X-Account-Id':'owner',Authorization:'Bearer arbitrary',Cookie:'smartvio-role=admin'}};
  const response=await fetch('/admin.html?userId=owner&role=admin&accountMode=registered',fake);
  assert.equal(response.status,302);
  for(const route of ['/admin.js','/admin.css','/%61dmin.js','/admin%2ecss']){
    const asset=await fetch(route,fake);assert.equal(asset.status,401,route);
    assert.match(asset.headers.get('Cache-Control'),/no-store/);assert.doesNotMatch(await asset.text(),/SVCommunity|admin-root/);
  }
});

test('signed-in non-admins receive 403 for every admin page and shell asset',async()=>{
  for(const route of [...documents,'/admin.js','/admin.css']){
    const response=await fetch(route,ordinary);assert.equal(response.status,403,route);
    assert.match(response.headers.get('Vary'),/oai-authenticated-user-id/);
    assert.equal(await response.text(),'Administrator access required.');
  }
});

test('administrator allowlist is mandatory and malformed trusted identities fail closed',async()=>{
  for(const config of [undefined,'[]','null','{}','["owner", ""]']){
    const response=await fetch('/admin',owner,{ADMIN_USER_IDS:config});assert.equal(response.status,503);
  }
  const response=await fetch('/admin',{headers:{'oai-authenticated-user-id':'invalid actor'}});assert.equal(response.status,302);
});

test('allowlisted administrators can load protected documents and assets with private cache headers',async()=>{
  for(const route of [...documents,'/admin.js','/admin.css']){
    const response=await fetch(route,owner);assert.equal(response.status,200,route);
    assert.match(response.headers.get('Cache-Control'),/private, no-store/);
    assert.match(response.headers.get('Vary'),/Cookie/);
    assert(gunzipSync(Buffer.from(await response.arrayBuffer())).length>0);
  }
  const response=await fetch('/admin',{method:'HEAD',...owner});assert.equal(response.status,200);assert.equal(await response.text(),'');
});

test('bad path encoding cannot bypass admin protection or turn into an asset request',async()=>{
  for(const route of ['/admin%','/%E0%A4','/%00admin','/admin%5c.html'])assert.equal((await fetch(route)).status,400,route);
  for(const route of ['/%2561dmin.html','//admin.html','/not-admin.html'])assert.equal((await fetch(route)).status,404,route);
});

test('admin APIs retain authentication and role checks after the client becomes public',async()=>{
  assert.equal((await fetch('/api/admin/state')).status,401);
  assert.equal((await fetch('/api/admin/state',ordinary)).status,403);
  const blocked=await fetch('/api/admin/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"type":"settings-save","role":"admin"}'});
  assert.equal(blocked.status,401);
});
