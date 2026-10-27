// Verifies the online preview build the way an Artifact serves it: static files only (no /api server),
// a strict CSP without eval or WebAssembly, and microphone/camera blocked by Permissions-Policy.
// The downloads capability is stubbed so saves can be counted. Needs Playwright.
// Usage: node tools/online-preview/verify.cjs [buildDir]
'use strict';
const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),os=require('os'),path=require('path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..','..','build','online-preview'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json'};
const csp="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'";
const apiHits=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://x');let p=decodeURIComponent(url.pathname);
  if(p.startsWith('/api/')){apiHits.push(req.method+' '+p);res.writeHead(404);res.end();return;}
  if(p==='/')p='/index.html';
  const file=path.join(root,p);if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':csp,'Permissions-Policy':'camera=(), microphone=(), bluetooth=(), midi=()'});
  fs.createReadStream(file).pipe(res);
});
const results=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));const ok=(v,m)=>{if(!v)throw Error(m);};
async function step(name,fn){try{const d=await fn();results.push({name,pass:true,detail:d??''});console.log('PASS',name,d?JSON.stringify(d):'');}catch(e){results.push({name,pass:false,detail:e.message.split('\n')[0]});console.log('FAIL',name,e.message.split('\n')[0]);}}

server.listen(0,'127.0.0.1',async()=>{
  const base=`http://127.0.0.1:${server.address().port}/`;
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},locale:'zh-CN',hasTouch:true,isMobile:true});
  await ctx.addInitScript(()=>{window.__saved=[];window.claude={use:async name=>name==='downloads'?{save:async({filename,data})=>{window.__saved.push({filename,bytes:data.size??data.byteLength});return {status:'saved'};}}:null};
    window.__media=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!window.__media.includes(this))window.__media.push(this);return play.apply(this,arguments);};});
  const p=await ctx.newPage();const errs=[],csps=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(/Content Security Policy|Refused to/.test(m.text()))csps.push(m.text().slice(0,160));});
  const reveal=async sel=>{const n=await p.evaluate(s=>{const el=document.querySelector(s);let d=el&&el.closest('details:not([open])'),i=0;while(d){d.querySelector(':scope>summary')?.setAttribute('data-v-open',String(i++));d=d.parentElement?.closest('details:not([open])');}return i;},sel).catch(()=>0);for(let i=n-1;i>=0;i--){await p.locator('[data-v-open="'+i+'"]').click();await wait(250);}};
  const click=async sel=>{await reveal(sel);await p.locator(sel).filter({visible:true}).first().click({timeout:6000});};
  const go=async h=>{await p.evaluate(x=>{location.hash=x},h);await wait(1200);};
  const notice=()=>p.evaluate(()=>document.querySelector('#notice')?.textContent||'');
  const audio=async(ms=1500)=>{let max=0,t0,t1,state;for(let i=0;i<6;i++){const s=await p.evaluate(()=>window.SVAudioEngine.status());if(!i)t0=s.contextTime;t1=s.contextTime;state=s.state;max=Math.max(max,s.outputRms||0);await wait(ms/6);}return {state,advanced:+(t1-t0).toFixed(2),peakRms:+max.toFixed(4)};};
  const saved=()=>p.evaluate(()=>window.__saved.slice());
  const session=()=>p.evaluate(async()=>(await (await fetch('/api/auth/session')).json()));

  await step('启动、国家、乐器、账号',async()=>{
    await p.goto(base,{waitUntil:'networkidle'});await wait(4000);
    await click('[data-action="commit-country"]');await wait(800);await click('[data-action="choose-instrument"]');await click('[data-action="commit-instrument"]');await wait(1000);
    await click('[data-account-action="verified"]');await wait(1500);const s=await session();ok(s.authenticated&&s.user.id==='preview-owner','会话 '+JSON.stringify(s));return {user:s.user.id};
  });
  await step('曲库搜索与收藏',async()=>{await go('library');await p.fill('#song-search','卡农');await wait(600);ok(await p.locator('#main [data-action="choose-song"][data-id="S006"]').count(),'搜索失败');await p.fill('#song-search','');await click('[data-action="favorite"][data-id="S001"]');await click('[data-action="category"][data-id="favorites"]');await wait(500);ok((await p.$$eval('#main [data-action="favorite"]',e=>e.map(x=>x.dataset.id))).includes('S001'),'收藏失败');await click('[data-action="category"][data-id="all"]');});
  await step('练习示范出声',async()=>{await click('[data-action="choose-song"][data-id="S004"]');await wait(1000);await click('#main [data-action="play"]');const a=await audio();await click('#main [data-action="stop"]');ok(a.state==='running'&&a.peakRms>0,JSON.stringify(a));return a;});
  await step('伴奏播放',async()=>{await go('performance');await click('[data-perf-track="warm"]');await click('[data-perf-action="play"]');await wait(1500);const m=await p.evaluate(()=>window.__media.filter(x=>!x.paused).map(x=>x.currentTime));await click('[data-perf-action="pause"]');ok(m.some(t=>t>0.5),'未播放 '+JSON.stringify(m));return {t:m[0]};});
  await step('动作跟练：课程与播放',async()=>{await go('lessons');const n=await p.locator('[data-lesson-select]').count();ok(n===6,'课程 '+n);await click('[data-lesson-select="open-strings"]');await wait(1000);await click('[data-lesson-action="play"]');const a=await audio(1500);ok(a.state==='running'&&a.advanced>0.5,JSON.stringify(a));return {lessons:n,...a};});
  await step('课程云进度',async()=>{await click('[data-lesson-action="cloud-read"]');await wait(1500);await click('[data-lesson-action="cloud-merge"]');await wait(1500);const r=await p.evaluate(async()=>{const x=await fetch('/api/me/lesson-progress');return {status:x.status,body:(await x.text()).slice(0,120)};});ok(r.status===200&&/open-strings/.test(r.body),JSON.stringify(r));return {status:r.status};});
  await step('学习路径',async()=>{await go('learn');const n=await p.locator('[data-cu-select]').count();await click('[data-lj-action="watch-next"]');ok(n===8,'阶段 '+n);return {stages:n};});
  await step('音色、预设、云备份、导出',async()=>{await go('tones');await click('[data-action="preset"][data-id="Warm"]');await click('[data-action="audition"]');const a=await audio(1000);await click('[data-action="stop-audio"]');
    await click('[data-action="save-preset"]');await p.fill('#preset-name','在线预览 · 暖木色');await click('[data-action="commit-preset"]');await wait(600);
    await click('[data-preset-cloud="refresh"]');await wait(1000);await click('[data-preset-cloud="save"]');await wait(1500);
    const cloud=await p.evaluate(async()=>JSON.stringify(await (await fetch('/api/presets')).json()));
    const before=(await saved()).length;await click('[data-action="export-presets"]');await wait(1500);const s=(await saved()).slice(before);
    ok(a.peakRms>0&&cloud.includes('在线预览')&&s.length===1,'音色 '+JSON.stringify({a,cloud:cloud.slice(0,80),s}));return {peakRms:a.peakRms,saved:s[0]};});
  await step('MIDI 导出（打包为 zip）与试听',async()=>{await click('[data-action="sound-tab"][data-id="midi"]');await click('[data-midi-action="add"]');await click('[data-midi-action="add"]');const before=(await saved()).length;await click('[data-midi-action="export"]');await wait(1500);const s=(await saved()).slice(before);
    await click('[data-midi-action="play"]');const a=await audio(1000);ok(s.length===1&&/\.zip$/.test(s[0].filename)&&a.state==='running','MIDI '+JSON.stringify({s,a}));return s[0];});
  await step('调音器：参考音可用，麦克风受限时给出提示',async()=>{await go('tuner');await click('[data-action="reference"]');const a=await audio(1000);await click('[data-action="start-tuner"]');await wait(1500);const n=await notice();ok(a.peakRms>0&&n,'调音器 '+JSON.stringify({a,n}));return {reference:a.peakRms,notice:n.slice(0,40)};});
  await step('录音：麦克风受限时给出提示',async()=>{await go('studio');await click('[data-action="record-audio"]');await wait(1500);const n=await notice();ok(n,'无提示');return {notice:n.slice(0,40)};});
  await step('节拍器',async()=>{await go('metronome');await click('[data-action="start-metro"]');const a=await audio(1200);await click('[data-action="stop-metro"]');ok(a.peakRms>0,JSON.stringify(a));return a;});
  await step('社区发帖',async()=>{await go('community');await click('[data-svc-action="new"]');await p.fill('[data-svc-field="title"]','在线预览投稿');await p.fill('[data-svc-field="text"]','手机上也能发帖。');await p.locator('dialog[open] [data-svc-field="rights"]').check();await click('dialog[open] [data-svc-action="submit"]');await wait(2000);
    const mine=await p.evaluate(async()=>(await (await fetch('/api/community/state')).json()).mine.map(x=>x.title));ok(mine.includes('在线预览投稿'),JSON.stringify(mine));return {mine};});
  await step('社区短视频上传',async()=>{
    const b64=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const g=c.getContext('2d',{alpha:false});const st=c.captureStream(30);const ac=new AudioContext();const o=ac.createOscillator();const d=ac.createMediaStreamDestination();o.connect(d);o.start();st.addTrack(d.stream.getAudioTracks()[0]);const rec=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8,opus'});const ch=[];rec.ondataavailable=e=>e.data.size&&ch.push(e.data);let f=0;const t=setInterval(()=>{g.fillStyle='hsl('+(f*9%360)+',55%,45%)';g.fillRect(0,0,320,240);f++;},33);rec.start(250);await new Promise(r=>setTimeout(r,2500));rec.stop();await new Promise(r=>rec.onstop=r);clearInterval(t);o.stop();ac.close();const a=new Uint8Array(await new Blob(ch).arrayBuffer());let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);});
    const f=path.join(os.tmpdir(),'svp-clip.webm');fs.writeFileSync(f,Buffer.from(b64,'base64'));
    await click('[data-svc-action="new"]');await p.fill('[data-svc-field="title"]','在线预览短视频');await p.fill('[data-svc-field="text"]','空弦长弓。');await p.locator('dialog[open] [data-svc-field="rights"]').check();
    await p.setInputFiles('dialog[open] [data-svc-field="video"]',f);await wait(2500);await click('dialog[open] [data-svc-action="attach-video"]');await wait(1000);await p.locator('dialog[open] [data-svc-field="rights"]').check();await click('dialog[open] [data-svc-action="submit"]');await wait(2000);
    const v=await p.evaluate(async()=>(await (await fetch('/api/community/state')).json()).mine.find(x=>x.title==='在线预览短视频'));ok(v&&v.attachments.length,'视频投稿 '+JSON.stringify(v));return {attachments:v.attachments.length};});
  await step('后台：身份、审核、九个页面',async()=>{
    const a=await ctx.newPage();const aerr=[];a.on('pageerror',e=>aerr.push(e.message));await a.goto(base+'admin.html',{waitUntil:'networkidle'});await wait(1500);
    const id=await a.evaluate(()=>document.querySelector('#admin-identity')?.textContent||'');
    await a.locator('[data-view="moderation"]').first().click();await wait(1200);let approved=0;
    for(let i=0;i<6;i++){const btn=a.locator('[data-act="review"][data-decision="approve"]').first();if(!await btn.count())break;await btn.click();await wait(700);const c=a.locator('dialog[open] button.primary').first();if(await c.count())await c.click();await wait(1200);approved++;}
    const views={};for(const v of ['overview','courses','moderation','reports','users','settings','catalog','audit','plans']){await a.locator('[data-view="'+v+'"]').first().click();await wait(600);views[v]=await a.evaluate(()=>document.querySelector('main')?.innerText.trim().split('\n')[0]||'');}
    await a.close();ok(/管理权限已确认/.test(id)&&approved>=2&&!aerr.length&&Object.values(views).every(Boolean),JSON.stringify({id:id.slice(0,30),approved,aerr,views}));return {approved,views:Object.keys(views).length};});
  await step('公开动态与视频播放',async()=>{await go('community');await click('[data-svc-action="tab"][data-tab="feed"]');await click('[data-svc-action="refresh"]');await wait(2500);
    const r=await p.evaluate(async()=>{const vids=[...document.querySelectorAll('#main video')];const v=vids[0];if(!v)return {videos:0};v.muted=true;await v.play().catch(()=>{});await new Promise(r=>setTimeout(r,1500));return {videos:vids.length,src:v.src.slice(0,5),time:v.currentTime,w:v.videoWidth};});
    ok(r.videos&&r.src==='blob:'&&r.time>0.3,JSON.stringify(r));return r;});
  await step('点赞与评论',async()=>{const like=p.locator('#main [data-svc-action="like"]').first();const b1=await like.textContent();await like.click();await wait(1200);const b2=await p.locator('#main [data-svc-action="like"]').first().textContent();await click('#main [data-svc-action="comment"]');await p.fill('dialog[open] [data-svc-field="comment"]','好听！');await click('dialog[open] [data-svc-action="send-comment"]');await wait(1500);
    const c=await p.evaluate(async()=>(await (await fetch('/api/community/state')).json()).myComments.length);await p.keyboard.press('Escape');ok(b1!==b2&&c>0,JSON.stringify({b1,b2,c}));return {like:b1+'→'+b2,comments:c};});
  await step('导出记录、CSV、作品包',async()=>{await go('profile');const before=(await saved()).length;await click('[data-action="export-data"]');await wait(1200);await click('[data-action="export-csv"]');await wait(1200);await click('[data-action="backup-export"]');await wait(4000);const s=(await saved()).slice(before);ok(s.length===3,JSON.stringify(s));return s.map(x=>x.filename);});
  await step('语言、主题、乐器、产品',async()=>{await p.selectOption('[data-pref="lang"]','en');await wait(800);const t=await p.textContent('#page-title');await p.selectOption('[data-pref="lang"]','zh');await wait(500);await go('shop');await click('[data-action="product-info"][data-id="air"]');await wait(400);const m=await p.evaluate(()=>document.querySelector('#modal')?.open);await p.keyboard.press('Escape');ok(/Settings/.test(t)&&m,JSON.stringify({t,m}));return {en:t};});
  await step('重新打开后数据仍在',async()=>{await p.reload({waitUntil:'networkidle'});await wait(3000);const r=await p.evaluate(async()=>(await (await fetch('/api/community/public')).json()).posts.map(x=>x.title));ok(r.includes('在线预览投稿')&&r.includes('在线预览短视频'),JSON.stringify(r));return {publicPosts:r};});
  await step('在线预览面板与身份切换',async()=>{await click('#svp-chip');ok(await p.locator('#svp-sheet').evaluate(d=>d.open),'面板未打开');await p.selectOption('#svp-role','anonymous');await p.waitForLoadState('load');await wait(2500);const s=await session();ok(!s.authenticated,'仍为登录 '+JSON.stringify(s));await p.evaluate(()=>window.SVPreview.setRole('admin'));await wait(2500);return {anonymous:true};});

  const summary={passed:results.filter(r=>r.pass).length,total:results.length,pageErrors:errs,cspViolations:csps,apiRequestsReachingServer:apiHits};
  fs.writeFileSync(path.join(os.tmpdir(),'svp-verify.json'),JSON.stringify({summary,results},null,2));
  console.log('\n'+JSON.stringify(summary));
  await b.close();server.close();process.exitCode=summary.passed===summary.total&&!errs.length&&!apiHits.length&&!csps.length?0:1;
});
