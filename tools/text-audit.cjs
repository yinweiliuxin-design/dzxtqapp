// 界面文字检查：每个页面 × 四种语言 × 电子 / 原声两种乐器，收集屏幕上能看到的文字和读屏标签，标出
// 漏翻译（英、德文里出现中文，日文里出现简体字，中文里夹着英文句子或英文小标题）、过期版本号、
// 面向开发的说明和术语、重复 ID、无名按钮、坏图和 320px 窄屏横向溢出。
// 需要 Playwright：npm i -D playwright && npx playwright install chromium
// 用法：node tools/text-audit.cjs             自动启动独立预览实例（web-source/.preview/text-audit），结束后关闭
//      node tools/text-audit.cjs <地址>      对已运行的预览执行
// 结果写入 docs/文字检查结果.json；有问题时退出码为 1。
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.join(__dirname,'..'),release=JSON.parse(fs.readFileSync(path.join(root,'web-source','release.json'),'utf8'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const major=Number(release.label.match(/\d+/)[0]);
const pages=['home','library','practice','lessons','learn','studio','tones','midi','performance','tuner','metronome','device','community','shop','profile'];
const countries={en:0,ja:2,de:3,zh:4};
// Characters that exist only in Simplified Chinese; they must not appear in the Japanese UI.
const SIMPLIFIED='这们个设练习录调选择页课进说时么吗还对开关闭请让给从过见后为网络连导删击显';
// Product and format names that stay in Latin script in every language.
const LATIN_OK=/^(Silvio|VELLEN|MIDI|USB|BLE-MIDI|Hz|dB|A4|PDF|CSV|SMF|WAV|WebM|MP4|iOS|Android|Google|Apple|Microsoft)$/;

function launchPreview(){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(root,'start-preview.mjs'),'--no-open','--port','18961','--instance','text-audit','--reset'],{stdio:['ignore','pipe','inherit']});
    let text='';child.stdout.setEncoding('utf8');
    child.stdout.on('data',c=>{text+=c;const m=text.match(/App\s+(http:\/\/127\.0\.0\.1:\d+\/)/);if(m)resolve({child,url:m[1]});});
    child.on('exit',code=>reject(Error('预览未能启动，退出码 '+code)));
  });
}

(async()=>{
  let preview=null,base=process.argv[2];
  if(!base){preview=await launchPreview();base=preview.url;}
  const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const findings=[],seen=new Set(),add=(flag,lang,page,text)=>{const key=flag+'|'+lang+'|'+text;if(seen.has(key))return;seen.add(key);findings.push({flag,lang,page,text});};
  try{
    for(const lang of ['zh','en','ja','de'])for(const instrument of [0,1]){
      const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',permissions:['microphone','camera']});
      const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
      await p.goto(base,{waitUntil:'networkidle'});await wait(3000);
      await p.locator('[data-action="choose-country"]').nth(countries[lang]).click();await wait(300);await p.click('[data-action="commit-country"]');await wait(800);
      await p.locator('[data-action="choose-instrument"]').nth(instrument).click();await p.click('[data-action="commit-instrument"]');await wait(800);
      const guest=p.locator('[data-account-action="guest"]').filter({visible:true});if(await guest.count())await guest.first().click();await wait(800);
      for(const id of pages){
        await p.evaluate(h=>{location.hash=h;},id);await wait(1100);
        const data=await p.evaluate(()=>{
          const texts=new Set();const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
          while((n=walker.nextNode())){const el=n.parentElement;if(!el||el.closest('script,style,svg,noscript,[data-user-content]'))continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;const r=el.getBoundingClientRect();if(!r.width&&!r.height)continue;const t=n.nodeValue.replace(/\s+/g,' ').trim();if(t)texts.add(t);}
          for(const el of document.querySelectorAll('[aria-label],[placeholder],[title],img[alt]'))for(const a of ['aria-label','placeholder','title','alt']){const v=el.getAttribute(a);if(v&&v.trim())texts.add(v.trim());}
          texts.add(document.title);
          const ids={};for(const el of document.querySelectorAll('[id]'))ids[el.id]=(ids[el.id]||0)+1;
          return {texts:[...texts],dupIds:Object.entries(ids).filter(([,c])=>c>1).map(([k,c])=>k+'×'+c),
            brokenImages:[...document.images].filter(i=>i.complete&&i.naturalWidth===0&&i.getBoundingClientRect().width>0).map(i=>i.getAttribute('src')),
            unnamedButtons:[...document.querySelectorAll('button')].filter(el=>el.getClientRects().length&&!(el.textContent.trim()||el.getAttribute('aria-label')||el.title)).map(el=>el.outerHTML.slice(0,90))};
        });
        for(const t of data.texts){
          if((lang==='en'||lang==='de')&&/[㐀-鿿]/.test(t))add('漏翻译（中文）',lang,id,t);
          if(lang==='ja'&&new RegExp('['+SIMPLIFIED+']').test(t))add('日文里的简体字',lang,id,t);
          if(lang==='zh'){
            const words=t.match(/[A-Za-z][A-Za-z'’-]+/g)||[];const english=words.filter(w=>!LATIN_OK.test(w));
            if(english.length>=3&&/[A-Za-z]{2,}(?:\s*[·,.&'’!?]\s*|\s+)[A-Za-z]{2,}(?:\s*[·,.&'’!?]\s*|\s+)[A-Za-z]{2,}/.test(t))add('中文里的英文',lang,id,t);
          }
          // A bare major (V29) is fine when it is the current one; any other label or package version must be current.
          for(const v of t.match(/\bV\d+(?:\.\d+)?\b|\b0\.\d+\.\d+\b/g)||[]){
            const stale=/^V\d+$/.test(v)?Number(v.slice(1))<major:v!==release.label&&v!==release.version;
            if(stale){add('过期版本号',lang,id,t);break;}
          }
          if(/开发候选|验证产品信息布局|竞品|可行性|開発用|Entwicklungs|development (draft|candidate)/i.test(t))add('面向开发的说明',lang,id,t);
          if(/\b(GATT|UUID|CAS|D1|R2|DSP|IndexedDB|blob|JSON|WebView|undefined|null|NaN)\b/.test(t))add('开发术语',lang,id,t);
        }
        for(const d of data.dupIds)add('重复 ID',lang,id,d);
        for(const d of data.brokenImages)add('图片无法加载',lang,id,d);
        for(const d of data.unnamedButtons)add('按钮没有名称',lang,id,d);
        await p.setViewportSize({width:320,height:700});await wait(300);
        const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
        if(overflow)add('320px 横向溢出',lang,id,id);
        await p.setViewportSize({width:390,height:844});await wait(150);
      }
      for(const e of errors)add('页面脚本错误',lang,'*',e);
      await ctx.close();console.log('已检查',lang,instrument?'原声琴':'电子琴');
    }
  }finally{await browser.close();preview?.child.kill('SIGTERM');}
  const out=path.join(root,'docs','文字检查结果.json');
  fs.writeFileSync(out,JSON.stringify({version:release.label,checkedAt:new Date().toISOString(),pages:pages.length,languages:4,instruments:2,problems:findings.length,findings},null,1)+'\n');
  for(const f of findings)console.log('['+f.flag+']',f.lang,f.page,'·',f.text.slice(0,120));
  console.log(findings.length?'发现 '+findings.length+' 处问题，详见 '+path.relative(root,out):'没有发现问题（'+pages.length+' 个页面 × 4 种语言 × 2 种乐器）');
  process.exitCode=findings.length?1:0;
})().catch(e=>{console.error(e);process.exit(2);});
