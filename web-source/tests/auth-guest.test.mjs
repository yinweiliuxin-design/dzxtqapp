/* Isolated SQLite/API checks. Sites' trusted header injection is a deployment
 * boundary, not an OAuth implementation or a claim of live provider sign-in. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { handleAPI } from '../worker/community.mjs';
import { createD1,applyMigrations } from './d1-sqlite.mjs';

const origin='https://guest.test',at='2026-10-16T00:00:00.000Z';
function env(){const DB=createD1();applyMigrations(DB,fileURLToPath(new URL('../drizzle/',import.meta.url)));return {DB,ADMIN_USER_IDS:'["owner"]'};}
function req(path,options={}){return new Request(origin+path,options);}
async function json(environment,path,options){const response=await handleAPI(req(path,options),environment);return {status:response.status,data:await response.json(),headers:response.headers};}
function addUser(environment,id='alice'){environment.DB.sqlite.prepare('INSERT INTO community_users (id,created_at,updated_at) VALUES (?,?,?)').run(id,at,at);}
function addPost(environment,status='published',attachments=[]){const id=randomUUID();environment.DB.sqlite.prepare('INSERT INTO community_posts (id,user_id,client_request_id,request_hash,title,text,status,attachments_json,created_at,updated_at,mutation_token) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'alice',randomUUID(),'hash','Song '+status,'Body '+status,status,JSON.stringify(attachments),at,at,'token');return id;}
function addComment(environment,postId,status='published'){const id=randomUUID();environment.DB.sqlite.prepare('INSERT INTO community_comments (id,post_id,user_id,client_request_id,request_hash,text,status,created_at,updated_at,mutation_token) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,postId,'alice',randomUUID(),'hash','Comment '+status,status,at,at,'token');return id;}
const writeHeaders={'Content-Type':'application/json',Origin:origin};

test('auth configuration is database-independent and external providers are genuinely reserved',async()=>{
  const r=await json({},'/api/auth/config');assert.equal(r.status,200);assert.equal(r.data.identityAuthority,'sites');assert.equal(r.data.optionalLogin,true);assert.equal(r.data.guest.canBrowseCommunity,true);assert.equal(r.data.guest.canPublishCommunity,false);
  assert.deepEqual(r.data.providers.map(p=>p.id),['chatgpt','google','apple','microsoft','email']);
  for(const provider of r.data.providers.slice(1)){assert.equal(provider.status,'reserved');assert.equal(provider.configured,false);assert.equal(provider.available,false);assert.equal(provider.signInPath,null);}
  assert.equal(r.data.providers[0].available,true);assert.match(r.data.signInPath,/^\/signin-with-chatgpt\?return_to=/);assert.match(r.headers.get('Cache-Control'),/no-store/);
});
test('anonymous session cannot be invented by email, query, account header, cookie or bearer',async()=>{
  const r=await json({},'/api/auth/session?userId=owner&email=someone@example.test',{headers:{'oai-authenticated-user-email':'owner@example.test','X-Account-Id':'owner',Authorization:'Bearer arbitrary',Cookie:'smartvio-user=owner'}});
  assert.equal(r.status,200);assert.equal(r.data.authenticated,false);assert.equal(r.data.user,null);assert(!JSON.stringify(r.data).includes('owner'));
});
test('session reveals minimal trusted identity without contact, admin, membership or a DB write',async()=>{
  const environment=env();try{const r=await json(environment,'/api/auth/session',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'private@example.test','oai-authenticated-user-full-name':'PRIVATE NAME'}});assert.equal(r.status,200);assert.deepEqual(r.data.user,{id:'owner',displayName:'琴友'});assert.equal(r.data.authenticated,true);assert(!JSON.stringify(r.data).includes('PRIVATE'));assert(!JSON.stringify(r.data).includes('isAdmin'));assert.equal(environment.DB.sqlite.prepare('SELECT COUNT(*) n FROM community_users').get().n,0);}finally{environment.DB.close();}
});
test('auth rejects malformed identities and unsupported mutation/session routes',async()=>{
  assert.equal((await json({},'/api/auth/session',{headers:{'oai-authenticated-user-id':'invalid id'}})).status,401);
  for(const path of ['/api/auth/config','/api/auth/session'])assert.equal((await json({},path,{method:'POST',headers:writeHeaders,body:'{"id":"owner"}'})).status,405);
  assert.equal((await json({},'/api/auth/google/callback?code=fake')).status,404);
});
test('auth return paths are fixed same-origin platform routes; injected return URLs are ignored',async()=>{
  const r=await json({},'/api/auth/config?return_to=https://attacker.test/&provider=google');for(const path of [r.data.signInPath,r.data.signOutPath]){const route=new URL(path,origin);assert.equal(route.origin,origin);assert.equal(route.searchParams.get('return_to'),'/#account');assert(!path.includes('attacker'));}assert(!JSON.stringify(r.data).includes('clientSecret'));
});
test('anonymous and explicit guest feed contain only published posts and published comments',async()=>{
  const environment=env();try{addUser(environment);const publicId=addPost(environment);for(const status of ['draft','pending','hidden','rejected','deleted']){const id=addPost(environment,status);addComment(environment,id);}addComment(environment,publicId);for(const status of ['pending','hidden','deleted'])addComment(environment,publicId,status);
    for(const path of ['/api/community/state','/api/community/public']){const r=await json(environment,path);assert.equal(r.status,200);assert.equal(r.data.viewer,null);assert.deepEqual(r.data.mine,[]);assert.deepEqual(r.data.myComments,[]);assert.deepEqual(r.data.posts.map(p=>p.id),[publicId]);assert.equal(r.data.posts[0].comments.length,1);assert.equal(r.data.posts[0].comments[0].status,'published');assert.equal(r.data.posts[0].isOwn,false);assert.equal(r.data.posts[0].likedByMe,false);assert(!JSON.stringify(r.data).includes('clientRequestId'));assert(!JSON.stringify(r.data).includes('userId'));}
    assert.equal(environment.DB.sqlite.prepare('SELECT COUNT(*) n FROM community_users').get().n,1);
  }finally{environment.DB.close();}
});
test('explicit public view strips a hosted identity and never creates its profile or returns mine',async()=>{
  const environment=env();try{addUser(environment);addPost(environment,'draft');addPost(environment);const before=environment.DB.sqlite.prepare('SELECT COUNT(*) n FROM community_users').get().n;for(const identity of ['alice','owner','unregistered-visitor']){const r=await json(environment,'/api/community/public',{headers:{'oai-authenticated-user-id':identity}});assert.equal(r.status,200);assert.equal(r.data.viewer,null);assert.deepEqual(r.data.mine,[]);assert.equal(r.data.posts.length,1);assert.equal(r.data.posts[0].isOwn,false);}assert.equal(environment.DB.sqlite.prepare('SELECT COUNT(*) n FROM community_users').get().n,before);assert.equal((await json(environment,'/api/community/public',{method:'POST',headers:writeHeaders,body:'{}'})).status,405);}finally{environment.DB.close();}
});
test('anonymous cloud mutations, drafts, uploads, private video status and admin remain denied',async()=>{
  const environment=env();try{for(const path of ['/api/community/action','/api/community/media','/api/community/videos','/api/presets','/api/admin/action']){const r=await json(environment,path,{method:'POST',headers:{...writeHeaders,'X-Account-Id':'owner'},body:JSON.stringify({type:'post-save',userId:'owner',role:'admin',accountMode:'signed-in'})});assert.equal(r.status,401,path);}
    for(const path of ['/api/identity','/api/presets','/api/admin/state','/api/community/videos/'+randomUUID()+'/status'])assert.equal((await json(environment,path)).status,401,path);
    assert.equal(environment.DB.sqlite.prepare('SELECT COUNT(*) n FROM community_users').get().n,0);assert.equal(environment.DB.sqlite.prepare('SELECT COUNT(*) n FROM community_posts').get().n,0);
  }finally{environment.DB.close();}
});
test('anonymous image bytes are shared only while a published post links them',async()=>{
  const environment=env();try{addUser(environment);const imageId=randomUUID(),key='image-test',bytes=Uint8Array.of(1,2,3);environment.BUCKET={get:async requested=>requested===key?{body:bytes}:null};environment.DB.sqlite.prepare('INSERT INTO community_media (id,user_id,object_key,mime,size,created_at,mutation_token) VALUES (?,?,?,?,?,?,?)').run(imageId,'alice',key,'image/png',3,at,'token');const path='/api/community/media/'+imageId;
    assert.equal((await handleAPI(req(path),environment)).status,401);const postId=addPost(environment,'published',[{kind:'media',mediaId:imageId}]);const r=await handleAPI(req(path),environment);assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);assert.equal((await handleAPI(req(path,{method:'HEAD'}),environment)).status,200);environment.DB.sqlite.prepare("UPDATE community_posts SET status='hidden' WHERE id=?").run(postId);assert.equal((await handleAPI(req(path),environment)).status,401);assert.equal(environment.DB.sqlite.prepare('SELECT COUNT(*) n FROM community_users').get().n,1);
  }finally{environment.DB.close();}
});
test('anonymous video GET and HEAD require a published reference and a ready non-withdrawn object',async()=>{
  const environment=env();try{addUser(environment);const id=randomUUID(),key='video-test',bytes=Uint8Array.of(1,2,3,4);environment.BUCKET={get:async requested=>requested===key?{body:bytes}:null,head:async requested=>requested===key?{size:4}:null};environment.DB.sqlite.prepare('INSERT INTO community_videos (id,user_id,object_key,mime,size,duration_ms,width,height,state,request_hash,created_at,updated_at,mutation_token,upload_token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'alice',key,'video/mp4',4,1000,64,64,'ready','a'.repeat(64),at,at,'token','upload-token');const path='/api/community/videos/'+id;assert.equal((await handleAPI(req(path),environment)).status,401);const post=addPost(environment,'published',[{kind:'video',mediaId:id}]);const r=await handleAPI(req(path),environment);assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);assert.equal((await handleAPI(req(path,{method:'HEAD'}),environment)).status,200);environment.DB.sqlite.prepare("UPDATE community_posts SET status='hidden' WHERE id=?").run(post);assert.equal((await handleAPI(req(path),environment)).status,401);environment.DB.sqlite.prepare("UPDATE community_posts SET status='published' WHERE id=?").run(post);environment.DB.sqlite.prepare("UPDATE community_videos SET state='cancelled',cleanup_pending=1 WHERE id=?").run(id);assert.equal((await handleAPI(req(path),environment)).status,410);
  }finally{environment.DB.close();}
});
