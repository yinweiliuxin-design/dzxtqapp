// 一键预览功能验收：用 Chromium 模拟手机，配合生成的 440 Hz 麦克风信号和虚拟摄像头，
// 逐项操作客户端、服务端接口与后台。需要 Playwright：npm i -D playwright && npx playwright install chromium
// 用法：node tools/acceptance.cjs            自动启动独立预览实例（数据在 web-source/.preview/acceptance），结束后关闭
//      node tools/acceptance.cjs <地址>     对已运行的预览执行（会在其中写入测试投稿和作品）
const {chromium}=require('playwright');
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'silvio-acceptance-'));
const results=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function step(name,fn){
  try{const detail=await fn();results.push({name,pass:true,detail:detail??''});console.log('PASS',name,detail?JSON.stringify(detail):'');}
  catch(e){results.push({name,pass:false,detail:e.message.split('\n')[0]});console.log('FAIL',name,e.message.split('\n')[0]);}
}
const ok=(v,m)=>{if(!v)throw Error(m);};

function sineWav(file,hz=440,seconds=20,rate=48000){
  const n=rate*seconds,buf=Buffer.alloc(44+n*2);
  buf.write('RIFF',0);buf.writeUInt32LE(36+n*2,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);
  buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++)buf.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*hz*i/rate)),44+i*2);
  fs.writeFileSync(file,buf);
}

function launchPreview(){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(__dirname,'..','start-preview.mjs'),'--no-open','--port','18960','--instance','acceptance','--reset'],{stdio:['ignore','pipe','inherit']});
    let text='';child.stdout.setEncoding('utf8');
    child.stdout.on('data',c=>{text+=c;const m=text.match(/App\s+(http:\/\/127\.0\.0\.1:\d+\/)/);if(m)resolve({child,url:m[1]});});
    child.on('exit',code=>reject(Error('预览未能启动，退出码 '+code)));
  });
}

(async()=>{
  sineWav(path.join(out,'a4.wav'));
  let preview=null,base=process.argv[2];
  if(!base){preview=await launchPreview();base=preview.url;}
  const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(out,'a4.wav')]});
  const ctx=await b.newContext({viewport:{width:390,height:844},locale:'zh-CN',hasTouch:true,isMobile:true,permissions:['microphone','camera'],acceptDownloads:true});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  const reveal=async sel=>{
    // A user taps a collapsed section's summary before its controls; do the same.
    const closed=await p.evaluate(s=>{const el=document.querySelector(s);let d=el&&el.closest('details:not([open])'),n=0;while(d){const sm=d.querySelector(':scope>summary');if(sm){sm.setAttribute('data-acc-open',String(n++));}d=d.parentElement&&d.parentElement.closest('details:not([open])');}return n;},sel).catch(()=>0);
    for(let i=closed-1;i>=0;i--){await p.locator('[data-acc-open="'+i+'"]').click({timeout:5000});await wait(300);}
    if(closed)await p.evaluate(()=>document.querySelectorAll('[data-acc-open]').forEach(e=>e.removeAttribute('data-acc-open')));};
  const click=async(sel,opts)=>{await reveal(sel);
    try{await p.locator(sel).filter({visible:true}).first().click({timeout:5000,...opts});}catch(e0){
    const pt=await p.evaluate(s=>{const el=[...document.querySelectorAll(s)].find(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');if(!el||el.disabled)return null;document.documentElement.style.scrollBehavior='auto';el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return (h===el||el.contains(h))?{x,y}:null;},sel).catch(()=>null);
    if(pt){await p.mouse.click(pt.x,pt.y);return;}
    const d=await p.evaluate(s=>{const el=document.querySelector(s);if(!el)return {exists:false,hash:location.hash};el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();const h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {exists:true,disabled:el.disabled,hidden:el.hidden||getComputedStyle(el).display==='none'||getComputedStyle(el).visibility,rect:[r.x|0,r.y|0,r.width|0,r.height|0],hit:h===el||el.contains(h),cover:h&&!(h===el||el.contains(h))?h.outerHTML.slice(0,160):null,hash:location.hash};},sel).catch(x=>({evalErr:x.message}));
    await p.screenshot({path:path.join(out,'fail-'+sel.replace(/[^a-z0-9]+/gi,'_').slice(0,40)+'.png')}).catch(()=>{});
    throw Error('click '+sel+' '+JSON.stringify(d));}};
  await ctx.addInitScript(()=>{window.__media=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!window.__media.includes(this))window.__media.push(this);return play.apply(this,arguments);};});
  const mediaPlaying=async()=>{const a=await p.evaluate(()=>window.__media.map(m=>m.currentTime));await wait(1200);const b2=await p.evaluate(()=>window.__media.map(m=>({t:m.currentTime,paused:m.paused,muted:m.muted,vol:m.volume})));return b2.map((m,i)=>({...m,advanced:+(m.t-(a[i]||0)).toFixed(2)})).filter(m=>!m.paused);};
  const go=async h=>{await p.evaluate(x=>{location.hash=x},h);await wait(1200);};
  const notice=()=>p.evaluate(()=>document.querySelector('#notice')?.textContent||'');
  const audio=async(ms=1500)=>{let max=0,t0,t1,state;for(let i=0;i<6;i++){const s=await p.evaluate(()=>window.SVAudioEngine.status());if(i===0)t0=s.contextTime;t1=s.contextTime;state=s.state;max=Math.max(max,s.outputRms||0);await wait(ms/6);}return {state,advanced:+(t1-t0).toFixed(2),peakRms:+max.toFixed(4)};};
  const download=async sel=>{const [d]=await Promise.all([p.waitForEvent('download',{timeout:20000}),click(sel)]);const f=path.join(out,'dl-'+d.suggestedFilename());await d.saveAs(f);return {file:d.suggestedFilename(),bytes:fs.statSync(f).size,path:f};};
  const mediaCount=()=>p.evaluate(async()=>{const s=window.SVMediaStore;for(const k of ['list','listMedia','all','getAll']){if(typeof s?.[k]==='function'){const r=await s[k]();return Array.isArray(r)?r.length:(r?.length??-1);}}return 'api:'+Object.keys(s||{}).join(',');});

  await step('开机动画与国家语言选择',async()=>{
    await p.goto(base,{waitUntil:'networkidle'});
    ok(await p.locator('[data-action="skip-startup"]').isVisible(),'没有跳过动画按钮');
    await click('[data-action="skip-startup"]');await wait(600);
    ok(await p.locator('[data-action="choose-country"]').count()===6,'国家选项不是 6 个');
    await click('[data-action="commit-country"]');await wait(800);
    return {countries:6};
  });
  await step('选择乐器（电子/原声）',async()=>{
    ok(await p.locator('[data-action="choose-instrument"]').count()===2,'乐器选项不是 2 个');
    await click('[data-action="choose-instrument"]');await click('[data-action="commit-instrument"]');await wait(1000);
    return {instrument:'electric'};
  });
  await step('账号：使用已验证账号登录',async()=>{
    await click('[data-account-action="verified"]');await wait(1800);
    const s=await p.evaluate(async()=>(await (await fetch('/api/auth/session',{credentials:'same-origin'})).json()));
    ok(s.authenticated&&s.user.id==='preview-owner','会话未登录');
    return {user:s.user.id};
  });

  await step('首页',async()=>{await go('home');ok(await p.locator('#main [data-go="tuner"]').count(),'无调音器入口');ok(await p.locator('#main [data-action="choose-song"]').count()>=6,'曲目卡片缺失');return {title:await p.textContent('#page-title')};});

  await step('曲库：搜索、分类、收藏',async()=>{
    await go('library');
    await p.fill('#song-search','卡农');await wait(700);
    const found=await p.locator('#main [data-action="choose-song"][data-id="S006"]').count();ok(found,'搜索“卡农”没有找到 D大调卡农');
    await p.fill('#song-search','');await wait(500);
    await click('[data-action="category"][data-id="beginner"]');await wait(600);
    const beginner=await p.$$eval('#main [data-action="favorite"]',e=>e.length);
    await click('[data-action="favorite"][data-id="S001"]');await wait(400);
    await click('[data-action="category"][data-id="favorites"]');await wait(600);
    const fav=await p.$$eval('#main [data-action="favorite"]',e=>e.map(x=>x.dataset.id));
    ok(fav.includes('S001'),'收藏后不在“我的收藏”');
    await click('[data-action="category"][data-id="all"]');await wait(400);
    return {search:'卡农→S006',beginner,favorites:fav};
  });

  await step('练习：示范聆听出声',async()=>{
    await click('[data-action="choose-song"][data-id="S004"]');await wait(1200);
    ok((await p.textContent('#page-title')).includes('练习'),'未进入练习页');
    await click('#main [data-action="play"]');const a=await audio();
    await click('#main [data-action="stop"]');
    ok(a.state==='running'&&a.advanced>0.5&&a.peakRms>0,'音频没有输出 '+JSON.stringify(a));return a;
  });
  await step('练习：麦克风跟奏',async()=>{
    await click('#main [data-action="mic-practice"]');await wait(2500);const n=await notice();
    const live=await p.evaluate(()=>document.querySelector('#practice-live')?.textContent?.replace(/\s+/g,' ').slice(0,80)||'');
    await click('#main [data-action="stop"]');
    ok(!/失败|错误|无法/.test(n),'提示：'+n);return {live};
  });

  await step('伴奏与弦乐：播放伴奏',async()=>{
    await go('performance');await click('[data-perf-track="warm"]');await wait(400);
    await click('[data-perf-action="play"]');await wait(500);const m=await mediaPlaying();await click('[data-perf-action="pause"]');
    ok(m.some(x=>x.advanced>0.5&&!x.muted&&x.vol>0),'伴奏未播放 '+JSON.stringify(m));return m[0];
  });
  await step('伴奏与弦乐：弦乐按键与音阶',async()=>{
    await click('[data-perf-note="A4"]');await click('[data-perf-chord="G"]');await click('[data-perf-action="scale"]');const a=await audio(1200);await click('[data-perf-action="off"]');
    ok(a.peakRms>0,'无声音输出');return a;
  });

  await step('动作跟练：课程列表来自服务端并可播放',async()=>{
    await go('lessons');const n=await p.locator('[data-lesson-select]').count();ok(n===6,'课程数 '+n);
    await click('[data-lesson-select="open-strings"]');await wait(1200);
    await click('[data-lesson-action="play"]');const a=await audio(1800);
    const seek=await p.$eval('[data-lesson-input="seek"]',e=>Number(e.value));
    await click('[data-lesson-action="replay"]').catch(()=>{});
    ok(a.state==='running'&&a.advanced>0.5,'课程示范未播放 '+JSON.stringify(a));return {lessons:n,...a,seek};
  });
  await step('动作跟练：账号云进度读写',async()=>{
    await click('[data-lesson-action="cloud-read"]');await wait(1800);const n2=await notice();
    await click('[data-lesson-action="cloud-merge"]');await wait(2000);const n1=await notice();
    const r=await p.evaluate(async()=>{const x=await fetch('/api/me/lesson-progress',{credentials:'same-origin'});return {status:x.status,body:(await x.text()).slice(0,160)};});
    ok(r.status===200&&/settle|open-strings|lessons/.test(r.body),'云进度接口 '+r.status+' '+r.body);return {merge:n1.slice(0,40),read:n2.slice(0,40),api:r.status};
  });

  await step('学习：六步主线与八阶段',async()=>{
    await go('learn');const stages=await p.locator('[data-cu-select]').count();await click('[data-lj-action="watch-next"]');await wait(600);
    const tab=await p.$eval('#lj-tab-try',e=>e.getAttribute('aria-selected')||e.className);
    await click('[data-cu-select="open-tone"]');await wait(800);
    const detail=await p.evaluate(()=>document.querySelector('#main').textContent.includes('让一根弦唱四拍'));
    ok(stages===8&&detail,'阶段数 '+stages+' 详情 '+detail);return {tryTab:tab,stages,detail};
  });

  let before;
  await step('创作：麦克风录音并保存',async()=>{
    await go('studio');before=await mediaCount();
    await click('[data-action="recorder-mode"][data-mode="audio"]');
    await click('[data-action="record-audio"]');await wait(3000);await click('[data-action="stop-record"]');await wait(2500);
    const after=await mediaCount();ok(typeof after==='number'&&after>before,'录音未保存 '+before+'→'+after);return {media:before+'→'+after};
  });
  await step('创作：摄像头视频录制并保存',async()=>{
    const m0=await mediaCount();
    await click('[data-action="recorder-mode"][data-mode="video"]');await wait(800);
    await click('[data-action="record-video"]');await wait(3000);await click('[data-action="stop-record"]');await wait(3000);
    const m1=await mediaCount();ok(m1>m0,'视频未保存 '+m0+'→'+m1);
    await click('[data-action="recorder-mode"][data-mode="audio"]');return {media:m0+'→'+m1};
  });
  await step('创作：四轨录制与播放',async()=>{
    const l0=await mediaCount();await reveal('[data-pref="barCount"]');await p.locator('[data-pref="barCount"]').selectOption({index:0});await wait(400);const t0=Date.now();await click('[data-action="record-loop"][data-track="0"]');await wait(800);const status=await p.textContent('#record-status');let l1=l0;for(let i=0;i<40&&l1<=l0;i++){await wait(250);l1=await mediaCount();}const stoppedAfter=(Date.now()-t0)/1000;
    ok(/自动停止/.test(status)&&stoppedAfter>2.5&&stoppedAfter<6,'1 小节（80 BPM 4/4，约 3 秒）未自动停止：'+stoppedAfter+'s '+status);
    await click('[data-action="play-loops"]');const a=await audio(1200);await click('[data-action="stop-loops"]');
    ok(a.state==='running'&&l1>l0,'四轨 '+l0+'→'+l1+' '+JSON.stringify(a));return {tracks:l0+'→'+l1,autoStopSeconds:+stoppedAfter.toFixed(1),...a};
  });

  await step('声音工作台：切换音色、试听、保存与导出预设',async()=>{
    await go('tones');await click('[data-action="preset"][data-id="Warm"]');await wait(400);
    const preset=await p.evaluate(()=>window.SVAudioEngine.status().preset);
    await click('[data-action="audition"]');const a=await audio(1200);await click('[data-action="stop-audio"]');
    await click('[data-action="save-preset"]');await wait(500);await p.fill('#preset-name','验收 · 暖木色');await click('[data-action="commit-preset"]');await wait(800);
    const saved=await p.evaluate(()=>document.querySelector('#main').textContent.includes('验收 · 暖木色'));ok(saved,'预设未保存');
    const d=await download('[data-action="export-presets"]');
    ok(/warm/i.test(String(preset))&&a.peakRms>0&&d.bytes>20,'预设 '+preset+' '+JSON.stringify(a));return {preset,peakRms:a.peakRms,export:d.file};
  });
  await step('声音工作台：预设云备份',async()=>{
    await click('[data-preset-cloud="refresh"]');await wait(1500);await click('[data-preset-cloud="save"]');await wait(1800);await click('[data-preset-cloud="refresh"]');await wait(1200);
    const r=await p.evaluate(async()=>{const x=await fetch('/api/presets',{credentials:'same-origin'});return {status:x.status,body:await x.json()};});
    ok(r.status===200&&r.body.ok&&JSON.stringify(r.body).includes('验收'),'云备份读取 '+r.status+' '+JSON.stringify(r.body).slice(0,200));return {status:r.status,hasBackup:!!(r.body.backup||r.body.presets)};
  });
  await step('MIDI：添加音符、导出 .mid、再导入、试听',async()=>{
    await click('[data-action="sound-tab"][data-id="midi"]');await wait(600);
    await click('[data-midi-action="add"]');await click('[data-midi-action="add"]');await wait(300);
    const d=await download('[data-midi-action="export"]');ok(d.bytes>20,'导出为空');
    const chooser=p.waitForEvent('filechooser',{timeout:6000});await click('[data-midi-action="import"]');const fc=await chooser;await fc.setFiles(d.path);await wait(1200);
    await click('[data-midi-action="play"]');const a=await audio(1200);
    return {export:d.file+' '+d.bytes+'B',notice:(await notice()).slice(0,40),playing:a.state};
  });

  await step('调音器：A 弦 440 Hz 输入判准',async()=>{
    await go('tuner');await click('[data-action="tuner-string"][data-id="A4"]');await click('[data-action="start-tuner"]');
    let s={};for(let i=0;i<30;i++){await wait(300);s=await p.evaluate(()=>({note:document.querySelector('#tuner-note')?.textContent?.trim(),hz:document.querySelector('#tuner-hz')?.textContent?.trim(),feedback:document.querySelector('#tuner-feedback')?.textContent?.trim().slice(0,40),state:document.querySelector('[data-tuner-state]')?.dataset.tunerState}));if(/in-tune|tuned/.test(s.state||''))break;}
    ok(/A4|A/.test(s.note||'')&&/4[34]\d/.test(s.hz||''),'读数 '+JSON.stringify(s));return s;
  });
  await step('调音器：参考音',async()=>{await click('[data-action="reference"]');const a=await audio(1200);ok(a.peakRms>0,'参考音无输出');return a;});

  await step('节拍器：启动、调速、停止',async()=>{
    await go('metronome');await click('[data-action="tempo-up"]');await wait(200);
    const bpm=await p.evaluate(()=>document.querySelector('#main')?.textContent.match(/\b(\d{2,3})\s*BPM/)?.[1]);
    await click('[data-action="start-metro"]');const a=await audio(1500);await click('[data-action="stop-metro"]');
    ok(a.state==='running'&&a.peakRms>0&&bpm==='85','节拍器 '+bpm+' '+JSON.stringify(a));return {bpm,...a};
  });

  await step('设备：MIDI 端口检测与蓝牙入口（真实琴需实机）',async()=>{
    await go('device');await click('[data-action="detect-midi"]');await wait(1200);const n1=await notice();
    await click('[data-action="connect-ble-midi"]');await wait(1200);const n2=await notice();
    ok(n1&&n2&&/[\u4e00-\u9fff]/.test(n1)&&!/Permission|not granted|Requested device/i.test(n1+n2),'设备提示缺失或含浏览器英文原文：'+n1+' / '+n2);return {midi:n1.slice(0,50),ble:n2.slice(0,50)};
  });

  await step('社区：发布投稿并在“我的投稿”中出现',async()=>{
    await go('community');await click('[data-svc-action="new"]');await wait(600);
    await p.fill('[data-svc-field="title"]','一键预览验收');await p.fill('[data-svc-field="text"]','今天练了 D 弦长弓四拍，音色比昨天稳。');
    await p.check('[data-svc-field="rights"]').catch(()=>{});
    await click('[data-svc-action="submit"]');await wait(2500);const n=await notice();
    await click('[data-svc-action="tab"][data-tab="mine"]');await wait(1500);
    const mine=await p.evaluate(()=>document.querySelector('#main').textContent.includes('一键预览验收'));
    ok(mine,'我的投稿里没有 '+n);return {notice:n.slice(0,40)};
  });
  await step('社区：上传短视频并加入投稿',async()=>{
    const b64=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const g=c.getContext('2d',{alpha:false});const st=c.captureStream(30);const ac=new AudioContext();const osc=ac.createOscillator();osc.frequency.value=293.66;const dst=ac.createMediaStreamDestination();osc.connect(dst);osc.start();st.addTrack(dst.stream.getAudioTracks()[0]);const rec=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8,opus'});const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);let f=0;const t=setInterval(()=>{g.fillStyle='hsl('+(f*9%360)+',55%,45%)';g.fillRect(0,0,320,240);g.fillStyle='#fff';g.font='36px sans-serif';g.fillText('D 弦 '+f,90,130);f++;},33);rec.start(250);await new Promise(r=>setTimeout(r,3000));rec.stop();await new Promise(r=>rec.onstop=r);clearInterval(t);osc.stop();ac.close();const ab=new Uint8Array(await new Blob(chunks).arrayBuffer());let s='';for(let i=0;i<ab.length;i+=32768)s+=String.fromCharCode(...ab.subarray(i,i+32768));return btoa(s);});
    const f=path.join(out,'clip.webm');fs.writeFileSync(f,Buffer.from(b64,'base64'));
    await click('[data-svc-action="new"]');await wait(600);
    await p.fill('[data-svc-field="title"]','空弦短视频');await p.fill('[data-svc-field="text"]','D 弦空弦，四拍一弓。');
    await p.locator('dialog[open] [data-svc-field="rights"]').check();
    const up=p.waitForResponse(r=>r.url().includes('/api/community/videos')&&r.request().method()==='POST',{timeout:20000});
    await p.setInputFiles('dialog[open] [data-svc-field="video"]',f);const ur=await up;ok(ur.status()<300,'视频上传 '+ur.status());await wait(1500);
    const marked=await p.evaluate(()=>{const label=document.querySelector('dialog[open] [data-svc-field="rights"]')?.closest('label');return {needed:!!label?.classList.contains('svc-check-needed'),hint:label?.querySelector('.svc-check-hint')?.textContent||'',list:document.querySelector('dialog[open] .svc-video-operations')?.textContent||'',attachButton:!!document.querySelector('dialog[open] [data-svc-action="attach-video"]')};});
    ok(marked.needed&&marked.hint&&!marked.attachButton&&/已加入草稿/.test(marked.list),'权属确认未标记或仍提供加入按钮 '+JSON.stringify(marked));
    await p.locator('dialog[open] [data-svc-field="rights"]').check();await click('dialog[open] [data-svc-action="submit"]');
    let st;for(let i=0;i<20;i++){await wait(800);st=await p.evaluate(async()=>{const r=await fetch('/api/community/state',{credentials:'same-origin'});const j=await r.json();return (j.mine||[]).map(x=>({title:x.title,status:x.status,attachments:(x.attachments||[]).map(a=>a.type||a.kind)}));});if(st.some(x=>x.title==='空弦短视频'))break;}
    const v=st.find(x=>x.title==='空弦短视频');ok(v&&v.attachments.length,'服务端投稿缺少视频 '+JSON.stringify(st));return {webmBytes:fs.statSync(f).size,rightsHint:marked.hint,...v};
  });
  await step('后台：管理员审核并发布投稿',async()=>{
    const a=await ctx.newPage();await a.goto(base+'admin',{waitUntil:'networkidle'});await wait(1500);
    const id=await a.evaluate(()=>document.querySelector('#admin-identity')?.textContent||'');
    await a.locator('[data-view="moderation"]').first().click();await wait(1500);
    const queue=await a.evaluate(()=>document.querySelector('main')?.textContent.includes('一键预览验收'));
    let approved=0;for(let i=0;i<8;i++){const btn=a.locator('[data-act="review"][data-decision="approve"]').first();if(!await btn.count())break;await btn.click();await wait(800);const conf=a.locator('dialog[open] button.primary, dialog[open] [data-act="confirm"], dialog[open] button[type="submit"]').first();if(await conf.count()){await conf.click();}await wait(1500);approved++;}
    await a.locator('[data-view="courses"]').first().click();await wait(1200);
    const courses=await a.evaluate(()=>document.querySelector('main')?.textContent.includes('先放松'));
    await a.close();
    ok(/管理权限已确认|confirmed/.test(id)&&queue,'后台 '+id.slice(0,40)+' queue='+queue);return {identity:'admin',queue,approved,courses};
  });
  await step('社区：审核通过后公开可见',async()=>{
    const r=await p.evaluate(async()=>{const x=await fetch('/api/community/public');const j=await x.json();return (j.posts||[]).map(p=>p.title);});
    await go('community');await click('[data-svc-action="refresh"]');await wait(1200);
    ok(r.includes('一键预览验收'),'公开列表 '+JSON.stringify(r));
    const v=await p.evaluate(async()=>{const j=await (await fetch('/api/community/public')).json();const post=(j.posts||[]).find(x=>x.title==='空弦短视频');const att=(post?.attachments||[]).find(a=>/video/.test(a.type||a.kind||a.mime||'')||a.url);if(!att)return {att:post?.attachments};const url=att.url||att.src;const x=await fetch(url,{headers:{Range:'bytes=0-15'}});const el=document.createElement('video');el.muted=true;el.src=url;const ready=await new Promise(r=>{el.onloadeddata=()=>r(true);el.onerror=()=>r(false);setTimeout(()=>r(false),8000);});return {url,status:x.status,type:x.headers.get('content-type'),decoded:ready,size:[el.videoWidth,el.videoHeight]};});
    ok((v.status===206||v.status===200)&&v.decoded,'公开视频不可播放 '+JSON.stringify(v));return {publicPosts:r,video:v};
  });

  await step('社区：点赞与评论',async()=>{
    await click('[data-svc-action="tab"][data-tab="feed"]');await wait(1200);
    const like=p.locator('#main [data-svc-action="like"]').first();const before=await like.textContent();await like.click();await wait(1500);
    const after=await p.locator('#main [data-svc-action="like"]').first().textContent();
    await click('#main [data-svc-action="comment"]');await wait(800);
    await p.fill('dialog[open] [data-svc-field="comment"]','长弓很稳，加油！');await click('dialog[open] [data-svc-action="send-comment"]');await wait(2000);
    const mine=await p.evaluate(async()=>(await (await fetch('/api/community/state',{credentials:'same-origin'})).json()).myComments?.length||0);
    await p.keyboard.press('Escape');
    ok(before!==after&&mine>0,'点赞 '+before+'→'+after+' 评论 '+mine);return {like:before+'→'+after,comments:mine};
  });
  await step('后台：九个管理页面',async()=>{
    const a=await ctx.newPage();const errors=[];a.on('pageerror',e=>errors.push(e.message));
    await a.goto(base+'admin',{waitUntil:'networkidle'});await wait(1000);const views={};
    for(const v of ['overview','courses','moderation','reports','users','settings','catalog','audit','plans']){await a.locator('[data-view="'+v+'"]').first().click();await wait(800);views[v]=(await a.evaluate(()=>document.querySelector('main')?.innerText.trim().split('\n')[0]||''));}
    await a.close();ok(!errors.length&&Object.values(views).every(Boolean),'后台 '+JSON.stringify({views,errors}));return views;
  });

  await step('设置：导出练习记录与 CSV',async()=>{
    await go('profile');const d1=await download('[data-action="export-data"]');const d2=await download('[data-action="export-csv"]');
    ok(d1.bytes>50&&d2.bytes>10,'导出为空');return {json:d1.file,csv:d2.file};
  });
  let pkg,exported;
  await step('设置：导出完整作品包（含录音录像）',async()=>{
    exported=await mediaCount();pkg=await download('[data-action="backup-export"]');ok(pkg.bytes>1000,'作品包太小 '+pkg.bytes);return {file:pkg.file,bytes:pkg.bytes,media:exported};
  });
  await step('设置：准备离线资源',async()=>{
    await click('[data-action="prepare-offline"]');let s='';for(let i=0;i<40;i++){await wait(500);s=await p.evaluate(()=>document.querySelector('#offline-status')?.textContent||'');if(/就绪|ready/i.test(s))break;}
    ok(/就绪/.test(s),'离线状态 '+s);return {status:s};
  });
  await step('离线：断网后重新打开仍可用',async()=>{
    await ctx.setOffline(true);await p.reload({waitUntil:'load'});await wait(2500);await go('tuner');
    const t=await p.textContent('#page-title');await ctx.setOffline(false);ok(/调音/.test(t),'断网打开失败 '+t);return {title:t};
  });
  await step('设置：切换语言与深色主题',async()=>{
    await go('profile');await p.selectOption('[data-pref="lang"]','en');await wait(1000);const t=await p.textContent('#page-title');
    await p.selectOption('[data-pref="theme"]',{index:1});await wait(600);
    const dark=await p.evaluate(()=>document.documentElement.dataset.theme||document.body.className);
    await p.selectOption('[data-pref="lang"]','zh');await p.selectOption('[data-pref="theme"]',{index:0});await wait(600);
    ok(/Settings/.test(t)&&/dark/.test(dark),'语言/主题 '+t+' '+dark);return {en:t,theme:dark};
  });
  await step('设置：切换为原声小提琴',async()=>{
    await click('[data-action="instrument-settings"]');await wait(800);
    await p.locator('[data-action="choose-instrument"]').nth(1).click();await click('[data-action="commit-instrument"]');await wait(1200);
    await go('home');const mic=await p.locator('header [data-go="tuner"], header button[aria-label*="麦克风"], header .device-status').first().getAttribute('aria-label').catch(()=>null);
    return {header:mic};
  });
  await step('产品探索',async()=>{await go('shop');await click('[data-action="product-info"][data-id="air"]');await wait(600);const open=await p.evaluate(()=>document.querySelector('#modal')?.open);ok(open,'详情未打开');await p.keyboard.press('Escape');return {modal:open};});

  await step('作品包：在全新浏览器中恢复',async()=>{
    ok(pkg,'没有作品包');
    const c2=await b.newContext({viewport:{width:390,height:844},locale:'zh-CN',hasTouch:true,isMobile:true});const q=await c2.newPage();
    await q.goto(base,{waitUntil:'networkidle'});await wait(3800);await q.click('[data-action="commit-country"]');await wait(600);
    await q.locator('[data-action="choose-instrument"]').first().click();await q.click('[data-action="commit-instrument"]');await wait(800);
    const g=q.locator('[data-account-action="guest"]');if(await g.count())await g.click();await wait(600);
    await q.evaluate(()=>{location.hash='profile'});await wait(1200);
    const ch=q.waitForEvent('filechooser',{timeout:6000});await q.locator('[data-action="backup-import"]').first().click();(await ch).setFiles(pkg.path);await wait(2500);
    const confirm=q.locator('[data-action="backup-restore"]').first();if(await confirm.count()){await confirm.click();await wait(4000);}
    await q.waitForLoadState('load');await wait(1500);const m=await q.evaluate(async()=>{const s=window.SVMediaStore;for(const k of ['list','listMedia','all','getAll'])if(typeof s?.[k]==='function'){const r=await s[k]();return r.length;}return 'api:'+Object.keys(s||{}).join(',');});
    const n=await q.evaluate(()=>document.querySelector('#notice')?.textContent||'');await c2.close();
    ok(m===exported,'恢复后媒体数 '+m+'，导出时 '+exported+' '+n);return {exported,restored:m};
  });

  await step('账号：切回访客',async()=>{
    await go('profile');await click('[data-account-action="open"]');await wait(800);await click('dialog[open] [data-account-action="guest"]');await wait(1200);
    await go('community');const signIn=await p.locator('[data-svc-action="sign-in"]').count();ok(signIn,'访客模式仍可发帖');return {guestReadOnly:true};
  });

  fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({base,at:new Date().toISOString(),passed:results.filter(r=>r.pass).length,total:results.length,results,pageErrors:errs},null,2));
  console.log(`\n${results.filter(r=>r.pass).length}/${results.length} passed; page errors: ${errs.length}`,errs.slice(0,5));
  await b.close();
  if(preview)preview.child.kill('SIGTERM');
  console.log('结果：'+path.join(out,'acceptance.json'));
  process.exitCode=results.every(r=>r.pass)&&!errs.length?0:1;
})();
