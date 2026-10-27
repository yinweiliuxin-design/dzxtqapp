/* Local-only workspace ZIP. No fetch, account, cookie or community access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SVWorkspaceBackup=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MiB=1024*1024,LIMITS=Object.freeze({packageBytes:80*MiB,mediaBytes:64*MiB,mediaCount:500,entries:512,storageBytes:5*MiB,storageEntryBytes:2*MiB});
 const KEYS=Object.freeze(['smartvio-mobile-state-v12-v1','sv12-prefs','smartvio-workspaces-v1','smartvio-midi-studio-v1','smartvio-learning-journey-v1','smartvio-learning-path-v1','smartvio-curriculum-progress-v1','smartvio-sync-lessons-progress-v1']);
 const CORE=KEYS[0],PREFS=KEYS[1],JOURNEY=KEYS[4],LEGACY=KEYS[5],CURRICULUM=KEYS[6],LESSONS=KEYS[7];
 class BackupError extends Error{constructor(code,message){super(message);this.name='WorkspaceBackupError';this.code=code;}}
 const fail=(code,message)=>new BackupError(code,message),own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k),object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),clone=v=>JSON.parse(JSON.stringify(v));
 const text=(v,max=200,empty=false)=>{if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw fail('INVALID_DATA','作品资料的文字格式无效。');return v;};
 const id=v=>{text(v,160);if(!/^[a-zA-Z0-9_-]{1,160}$/.test(v))throw fail('INVALID_DATA','作品编号无效。');return v;};
 const number=(v,min,max,integer=false)=>{if(!Number.isFinite(v)||v<min||v>max||integer&&!Number.isSafeInteger(v))throw fail('INVALID_DATA','作品资料数值无效。');return v;};
 const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)throw fail('INVALID_DATA','作品资料数组超过限制。');return v;};
 const unique=values=>{if(new Set(values).size!==values.length)throw fail('DUPLICATE_DATA','作品编号或字段重复。');return values;};
 const date=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw fail('INVALID_DATA','作品日期无效。');return v;};
 const checkAbort=signal=>{if(signal?.aborted)throw fail('CANCELLED','已取消，原资料保留。');};
 function parseJSON(bytes){try{return JSON.parse(typeof bytes==='string'?bytes:new TextDecoder('utf-8',{fatal:true}).decode(bytes),(key,value)=>{if(['__proto__','prototype','constructor'].includes(key))throw Error('Unsafe property');return value;});}catch{throw fail('INVALID_JSON','作品包资料无法解析。');}}
 const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let b=0;b<8;b++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
 function safePath(value){if(typeof value!=='string'||value.length>180||!value||!/^[A-Za-z0-9_./-]+$/.test(value)||value.startsWith('/')||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)))throw fail('INVALID_ZIP','作品包包含不安全路径。');return value;}
 function zip(entries){
  if(!Array.isArray(entries)||!entries.length||entries.length>LIMITS.entries)throw fail('PACKAGE_LIMIT','作品包文件数量超过限制。');
  const encoder=new TextEncoder(),names=new Set(),locals=[],centrals=[];let offset=0,centralSize=0;
  for(const entry of entries){safePath(entry.path);if(names.has(entry.path))throw fail('DUPLICATE_DATA','作品包路径重复。');names.add(entry.path);const name=encoder.encode(entry.path),data=entry.bytes;if(!(data instanceof Uint8Array))throw fail('INVALID_DATA','作品包文件数据无效。');const crc=crc32(data),header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);header.set(name,30);
   const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);locals.push(header,data);centrals.push(central);offset+=header.length+data.length;centralSize+=central.length;
  }
  if(offset+centralSize+22>LIMITS.packageBytes)throw fail('PACKAGE_LIMIT','作品包超过80MiB，请分批或单独下载媒体。');
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return [...locals,...centrals,end];
 }
 function unzip(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>LIMITS.packageBytes)throw fail('PACKAGE_LIMIT','作品包为空、损坏或超过80MiB。');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.length-22;
  const need=(at,n)=>{if(!Number.isSafeInteger(at)||at<0||at+n>bytes.length)throw fail('INVALID_ZIP','作品包文件被截断。');};
  if(view.getUint32(end,true)!==0x06054b50||view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+20,true))throw fail('INVALID_ZIP','只支持本应用标准单卷作品包。');
  const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true),size=view.getUint32(end+12,true);if(!count||count>LIMITS.entries||view.getUint16(end+8,true)!==count||start+size!==end)throw fail('INVALID_ZIP','作品包目录无效。');
  const entries=new Map();let at=start,localEnd=0,total=0;
  for(let i=0;i<count;i++){
   need(at,46);if(view.getUint32(at,true)!==0x02014b50)throw fail('INVALID_ZIP','作品包目录损坏。');
   const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),packed=view.getUint32(at+20,true),length=view.getUint32(at+24,true),n=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),disk=view.getUint16(at+34,true),local=view.getUint32(at+42,true);
   if(flags!==0x0800||method!==0||packed!==length||extra||comment||disk||view.getUint32(at+38,true)||local!==localEnd)throw fail('INVALID_ZIP','不支持加密、压缩、分卷或附加数据的作品包。');
   need(at+46,n);const path=safePath(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+n)));if(entries.has(path))throw fail('DUPLICATE_DATA','作品包文件重复。');
   need(local,30);const localName=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);if(view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method||view.getUint32(local+14,true)!==crc||view.getUint32(local+18,true)!==length||view.getUint32(local+22,true)!==length||localName!==n||localExtra)throw fail('INVALID_ZIP','作品包目录与文件不一致。');
   need(local+30,n+length);if(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(local+30,local+30+n))!==path)throw fail('INVALID_ZIP','作品包路径不一致。');localEnd=local+30+n+length;if(localEnd>start)throw fail('INVALID_ZIP','作品包文件重叠。');const data=bytes.subarray(local+30+n,localEnd);if(crc32(data)!==crc)throw fail('CHECKSUM_MISMATCH','作品包校验失败，原资料未修改。');entries.set(path,data);total+=length;at+=46+n;
  }
  if(at!==end||localEnd!==start||total>LIMITS.packageBytes)throw fail('INVALID_ZIP','作品包存在遗漏或额外文件。');return entries;
 }
 function fields(value,names){const out={};for(const name of names)if(own(value,name))out[name]=clone(value[name]);return out;}
 function effects(v){if(!object(v))throw fail('INVALID_DATA','音色参数无效。');const out={};for(const k of ['volume','reverb','delay','compression'])out[k]=number(v[k],0,1);return out;}
 function mobile(value){
  if(!object(value)||value.schema!==11)throw fail('INVALID_DATA','练习数据版本无效。');
  const sessions=array(value.sessions||[],200).map(v=>{if(!object(v))throw fail('INVALID_DATA','练习记录无效。');const r={id:id(v.id),at:date(v.at),duration:number(v.duration,0,3600),song:text(v.song,200),score:v.score==null?null:number(v.score,0,100)};if(v.songId!==undefined)r.songId=id(v.songId);for(const k of ['kind','scoringVersion','inputRoute'])if(v[k]!==undefined)r[k]=text(v[k],80);if(v.rangeTicks!==undefined){r.rangeTicks={start:number(v.rangeTicks.start,0,0x7fffffff,true),end:number(v.rangeTicks.end,1,0x7fffffff,true)};if(r.rangeTicks.end<=r.rangeTicks.start)throw fail('INVALID_DATA','练习范围无效。');}if(v.metrics!==undefined){r.metrics={};for(const k of ['pitchCoverage','validInputFraction'])r.metrics[k]=v.metrics[k]==null?null:number(v.metrics[k],0,1);}return r;});unique(sessions.map(v=>v.id));
  const presets=array(value.presets||[],100).map(v=>{if(!object(v))throw fail('INVALID_DATA','预设无效。');if(!['Acoustic','Warm','Bright','Electric','Bass','Piano','Organ','Strings','Pad'].includes(v.preset))throw fail('INVALID_DATA','音色无效。');const r={id:id(v.id),name:text(v.name,80),group:text(v.group||'',60,true),preset:v.preset,effects:effects(v.effects),inputGain:number(v.inputGain??1,0,2)};if(v.at!==undefined)r.at=date(v.at);return r;});unique(presets.map(v=>v.id));
  const projects=array(value.projects||[],100).map(v=>{if(!object(v))throw fail('INVALID_DATA','工程无效。');const r={id:id(v.id),name:text(v.name,80),bpm:number(v.bpm,30,240),barCount:number(v.barCount,1,128,true),trackIds:unique(array(v.trackIds,4).map(id)),kind:'local-browser-project'};if(v.at!==undefined)r.at=date(v.at);return r;});unique(projects.map(v=>v.id));
  const songs=array(value.songs||[],2000).filter(v=>v?.category==='custom').map(v=>{const r={id:id(v.id),title:text(v.title,200),author:text(v.author||'我的曲目',120),category:'custom',regions:['us','uk','de','jp','fr','cn'],melody:text(v.melody,16000),titles:{},rights:{status:'user-provided',evidence:'',territories:[]},published:false};if(r.melody.split(/\s+/).some(token=>{const [pitch,beats,...extra]=token.split(':');return extra.length||!/^(?:R|[A-G][#b]?-?\d)$/.test(pitch)||!Number.isFinite(Number(beats))||Number(beats)<=0||Number(beats)>64;}))throw fail('INVALID_DATA','自建曲目音符无效。');for(const l of ['zh','en','ja','de'])if(v.titles?.[l]!==undefined)r.titles[l]=text(v.titles[l],200,true);for(const k of ['legacyCatalogId','originalId'])if(v[k]!==undefined)r[k]=id(v[k]);return r;});unique(songs.map(v=>v.id));
  const practice=value.userPractice||{dailyGoal:20,completedLessons:[]};return {schema:11,revision:0,sessions,presets,projects,songs,userPractice:{dailyGoal:number(practice.dailyGoal,1,240,true),completedLessons:unique(array(practice.completedLessons,200).map(id))},posts:[],reports:[],audit:[]};
 }
 function musicPrefs(v){
  if(!object(v))throw fail('INVALID_DATA','练习设置无效。');const r={};
  for(const [k,min,max,integer]of [['bpm',30,240,true],['a4',400,480,false],['noiseGate',1,50,false],['semitone',-6,6,true],['from',1,32768,true],['to',0,32768,true],['barCount',1,128,true],['inputGain',0,2,false]])if(own(v,k))r[k]=number(v[k],min,max,integer);
  if(own(v,'song'))r.song=id(v.song);
  for(const [k,allowed]of Object.entries({preset:['Acoustic','Warm','Bright','Electric','Bass','Piano','Organ','Strings','Pad'],demoVoice:['violin-sample','clean-synth'],string:['G3','D4','A4','E5'],libraryScope:['all','regional','global'],libraryView:['grid','list'],source:['synth','microphone'],recordingMode:['audio','video'],recordingSource:['microphone','synth'],recordingFacing:['user','environment']}))if(own(v,k)){if(!allowed.includes(v[k]))throw fail('INVALID_DATA','练习设置选项无效。');r[k]=v[k];}
  if(own(v,'meter')){if(!/^(?:[1-9]|1[0-2])\/(?:2|4|8|16)$/.test(v.meter))throw fail('INVALID_DATA','拍号无效。');r.meter=v.meter;}
  if(v.effects!==undefined)r.effects=effects(v.effects);if(v.favorites!==undefined)r.favorites=unique(array(v.favorites,2000).map(id));if(v.personalSongMigrations!==undefined)r.personalSongMigrations=unique(array(v.personalSongMigrations,2000).map(id));
  if(v.levels!==undefined){if(array(v.levels,4).length!==4)throw fail('INVALID_DATA','四轨音量设置无效。');r.levels=v.levels.map(n=>number(n,0,1));}if(v.mutes!==undefined){if(array(v.mutes,4).length!==4)throw fail('INVALID_DATA','四轨静音设置无效。');r.mutes=v.mutes.map(b=>{if(typeof b!=='boolean')throw fail('INVALID_DATA','静音状态无效。');return b;});}for(const k of ['alignLoops','repeat'])if(v[k]!==undefined){if(typeof v[k]!=='boolean')throw fail('INVALID_DATA','工程设置无效。');r[k]=v[k];}return r;
 }
 function create(options={}){
  const env=options.environment||globalThis,media=options.mediaStore||env.SVMediaStore,BlobType=options.Blob||env.Blob||globalThis.Blob,crypto=options.crypto||env.crypto,validators=options.validators||env;let storage=options.storage;
  if(storage===undefined)try{storage=env.localStorage;}catch{storage=null;}
  const plans=new Map(),encoder=new TextEncoder();let busy=false;
  const hash=async bytes=>{if(!crypto?.subtle)throw fail('UNSUPPORTED','当前环境无法进行作品包校验。');const b=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(b)].map(n=>n.toString(16).padStart(2,'0')).join('');};
  const get=key=>{try{if(!storage?.getItem)throw Error();return storage.getItem(key);}catch{throw fail('STORAGE_UNAVAILABLE','无法读取本机资料。');}};
  const rawSnapshot=()=>KEYS.map(key=>({key,value:get(key)}));
  const ensureValidators=()=>{for(const [k,method]of [['SVMIDI','validateDocument'],['SVWorkspaces','valid'],['SVLearningJourney','validate'],['SVLearningPath','validate'],['SVCurriculum','validateProgress'],['SVLessons','validateProgress']])if(typeof validators[k]?.[method]!=='function')throw fail('UNSUPPORTED','作品资料验证模块尚未就绪，请刷新后重试。');};
  function sanitize(key,value){
   if(!KEYS.includes(key))throw fail('INVALID_DATA','作品包包含未允许的数据类型。');if(!object(value))throw fail('INVALID_DATA','作品数据无效。');
   if(key===CORE)return mobile(value);if(key===PREFS)return musicPrefs(value);
   if(key==='smartvio-midi-studio-v1'){const doc=validators.SVMIDI.validateDocument(value);delete doc.warnings;return doc;}
   if(key==='smartvio-workspaces-v1'){if(!validators.SVWorkspaces.valid(value))throw fail('INVALID_DATA','工作台设置无效。');const r=fields(value,['schema','practiceSource','soundTab','midiVoice','returnTo']);r.catalogPositions={};for(const [k,v]of Object.entries(value.catalogPositions))r.catalogPositions[k]={position:v.position,duration:v.duration};return r;}
   if(key===JOURNEY)return validators.SVLearningJourney.validate(value);
   if(key===LEGACY)return validators.SVLearningPath.validate(value);
   if(key===CURRICULUM){const ids=(options.curriculumStageIds||validators.SVCurriculumData?.stages?.map(s=>s.id)||['prepare','open-tone','fingers','cross-strings','first-phrase','vibrato-study','position-and-bow','expression']);const v=validators.SVCurriculum.validateProgress(value,ids),r=fields(v,['schema','level','lastStageId']);r.stages={};for(const [k,s]of Object.entries(v.stages))r.stages[k]=fields(s,['step','reviewed','completed']);return r;}
   const v=validators.SVLessons.validateProgress(value),r=fields(v,['schema','lastLessonId','reduceMotion']);r.lessons={};for(const [k,l]of Object.entries(v.lessons))r.lessons[k]=fields(l,['stage','position','completed']);return r;
  }
  function normalizedStorage(snapshot){
   ensureValidators();let total=0;return snapshot.filter(s=>s.value!==null).map(s=>{if(typeof s.value!=='string'||encoder.encode(s.value).length>LIMITS.storageEntryBytes)throw fail('STORAGE_LIMIT','本机资料过大，请分批导出。');const value=sanitize(s.key,parseJSON(s.value)),bytes=encoder.encode(JSON.stringify(value));total+=bytes.length;if(total>LIMITS.storageBytes)throw fail('STORAGE_LIMIT','作品包资料超过限制。');return {key:s.key,value,bytes};});
  }
  function meaningful(key,v){
   if(key===CORE)return ['sessions','presets','projects','songs'].some(k=>v[k].length)||v.userPractice.completedLessons.length>0;
   if(key===PREFS)return Boolean(v.favorites?.length);
   if(key==='smartvio-midi-studio-v1')return v.notes.length>0;
   if(key==='smartvio-workspaces-v1')return Object.values(v.catalogPositions).some(p=>p.position>0);
   if(key===JOURNEY)return v.reviewedStepIds.length||v.skippedStepIds.length||v.currentStepId!=='prepare'||v.phase!=='watch';
   if(key===LEGACY)return v.understoodStepIds.length||v.currentStepId!=='instrument';
   if(key===CURRICULUM)return Object.values(v.stages).some(s=>s.reviewed||s.completed||s.step>0);
   return Object.values(v.lessons).some(l=>l.completed||l.position>0||l.stage>0);
  }
  async function library(){
   if(!media?.list||!media?.pendingImport)throw fail('UNSUPPORTED','当前版本无法安全备份作品。');try{if(await media.pendingImport())throw fail('RECOVERY_REQUIRED','有未完成的恢复，请先恢复原资料。');}catch(error){if(error.code!=='UNAVAILABLE')throw error;}const rows=media.snapshotForBackup?await media.snapshotForBackup():await media.list(undefined,{includeShadowed:true});if(media.status?.().error?.code==='READ_FAILED')throw fail('READ_FAILED','媒体读取不完整，未生成作品包。');return rows;
  }
  function recordMetadata(row,index){
   if(!row||!['recording','video','loop','backing'].includes(row.kind)||row.completed!==true||!(row.blob instanceof BlobType)||row.blob.size<=0||row.blob.size>LIMITS.mediaBytes)throw fail('MEDIA_LIMIT','媒体无效或单个文件超过64MiB，请单独下载。');
   const r={id:text(row.id,160),kind:row.kind,completed:true,name:text(row.name,200,true),createdAt:date(row.createdAt),updatedAt:date(row.updatedAt),type:text(row.blob.type||row.type||'application/octet-stream',180),path:'media/'+index+'.bin'};
   if(row.kind==='loop')r.trackIndex=number(row.trackIndex,0,3,true);for(const k of ['duration','bpm','meter','loopBars','volume','sampleRate','channels'])if(row[k]!==undefined)r[k]=number(row[k],0,1e9);if(row.muted!==undefined){if(typeof row.muted!=='boolean')throw fail('INVALID_DATA','媒体静音状态无效。');r.muted=row.muted;}if(row.source!==undefined)r.source=text(row.source,80,true);return r;
  }
  function validateMedia(rows){if(rows.length>LIMITS.mediaCount)throw fail('PACKAGE_LIMIT','媒体数量超过500个，请分批备份。');const records=rows.map(recordMetadata);unique(records.map(r=>r.id));unique(records.filter(r=>r.kind==='loop').map(r=>r.trackIndex));return records;}
  function summary(data,records,warnings=[]){const core=data.find(d=>d.key===CORE)?.value;return {mediaCount:records.length,mediaBytes:records.reduce((n,r)=>n+(r.bytes||0),0),storageKeys:data.map(d=>d.key),projects:core?.projects.length||0,customSongs:core?.songs.length||0,sessions:core?.sessions.length||0,presets:core?.presets.length||0,midiNotes:data.find(d=>d.key==='smartvio-midi-studio-v1')?.value.notes.length||0,warnings,excluded:['account','cookies','community','cloud-drafts','identity-progress','language-country-instrument','offline-cache']};}
  function references(data,records){const core=data.find(d=>d.key===CORE)?.value,loops=new Set(records.filter(r=>r.kind==='loop').map(r=>r.id));return (core?.projects||[]).flatMap(p=>p.trackIds.filter(id=>!loops.has(id)).map(id=>({project:p.name,mediaId:id})));}
  async function preflightExport(){
   const snapshot=rawSnapshot(),data=normalizedStorage(snapshot),rows=await library(),records=validateMedia(rows).map((r,i)=>({...r,bytes:rows[i].blob.size})),missing=references(data,records);const info=summary(data,records,missing.length?['MISSING_PROJECT_MEDIA']:[]);
   info.missingMediaReferences=missing;if(records.reduce((n,r)=>n+r.bytes,0)+data.reduce((n,d)=>n+d.bytes.length,0)+1024*1024>LIMITS.packageBytes)throw fail('PACKAGE_LIMIT','作品包预计超过80MiB，请分批或单独导出。');return info;
  }
  async function exclusive(task){if(busy)throw fail('BUSY','作品包操作正在进行。');busy=true;try{if(env.navigator?.locks?.request)return await env.navigator.locks.request('smartvio-workspace-restore',{mode:'exclusive',ifAvailable:true},lock=>{if(!lock)throw fail('BUSY','其他页面正在处理作品包。');return task();});return await task();}finally{busy=false;}}
  async function exportPackage(settings={}){
   return exclusive(async()=>{checkAbort(settings.signal);const snapshot=rawSnapshot(),data=normalizedStorage(snapshot),rows=await library(),records=validateMedia(rows),entries=[],files=[];let total=0;
    const add=async(path,bytes)=>{total+=bytes.length;if(total+1024*1024>LIMITS.packageBytes)throw fail('PACKAGE_LIMIT','作品包超过80MiB，请分批或单独导出。');files.push({path,size:bytes.length,sha256:await hash(bytes)});entries.push({path,bytes});checkAbort(settings.signal);};
    for(let i=0;i<data.length;i++){data[i].path='state/'+i+'.json';await add(data[i].path,data[i].bytes);}
    for(let i=0;i<records.length;i++){const bytes=new Uint8Array(await rows[i].blob.arrayBuffer());records[i].bytes=bytes.length;await add(records[i].path,bytes);}
    if(JSON.stringify(rawSnapshot())!==JSON.stringify(snapshot))throw fail('SOURCE_CHANGED','备份期间资料发生变化，请停止其他操作后重试。');
    const fingerprint=values=>JSON.stringify(values.map(r=>[r.id,r.kind,r.updatedAt,r.blob.size,r.blob.type,r.trackIndex]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));if(fingerprint(await library())!==fingerprint(rows))throw fail('SOURCE_CHANGED','备份期间媒体库发生变化，请重试。');
    checkAbort(settings.signal);const manifest={format:'silvio-workspace',schema:1,createdAt:new Date().toISOString(),files,storage:data.map(d=>({key:d.key,path:d.path})),media:records,preferences:'musical-only; target language/country/instrument preserved'},parts=zip([{path:'manifest.json',bytes:encoder.encode(JSON.stringify(manifest))},...entries]),blob=new BlobType(parts,{type:'application/zip'}),missing=references(data,records);
    const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15);return {blob,filename:'Silvio-workspace-'+stamp+'.zip',summary:{...summary(data,records,missing.length?['MISSING_PROJECT_MEDIA']:[]),missingMediaReferences:missing,packageBytes:blob.size},checksumAlgorithm:'SHA-256'};
   });
  }
  async function destinationConflicts(){
   const snapshot=rawSnapshot(),data=normalizedStorage(snapshot),rows=await library(),conflicts=rows.map(r=>'media:'+r.id);if(media.status?.().persistentAvailable===false)throw fail('STORAGE_UNAVAILABLE','当前浏览器不能持久保存作品，请使用允许本机存储的浏览器恢复。');
   for(const d of data)if(meaningful(d.key,d.value))conflicts.push(d.key);
   const raw=snapshot.find(s=>s.key===CORE)?.value;if(raw){const v=parseJSON(raw);if(['posts','reports','audit','orders','codes'].some(k=>Array.isArray(v[k])&&v[k].length)||v.binding)conflicts.push('private-local-data');}
   return {snapshot,conflicts:unique([...new Set(conflicts)])};
  }
  async function preflightImport(blob,settings={}){
   return exclusive(async()=>{checkAbort(settings.signal);ensureValidators();if(!(blob instanceof BlobType)||blob.size>LIMITS.packageBytes)throw fail('PACKAGE_LIMIT','请选择不超过80MiB的作品包。');const entries=unzip(new Uint8Array(await blob.arrayBuffer()));checkAbort(settings.signal);const manifestBytes=entries.get('manifest.json');if(!manifestBytes||manifestBytes.length>LIMITS.storageEntryBytes)throw fail('INVALID_MANIFEST','作品包缺少清单。');const manifest=parseJSON(manifestBytes);
    if(!object(manifest)||manifest.format!=='silvio-workspace'||manifest.schema!==1||!Array.isArray(manifest.files)||!Array.isArray(manifest.storage)||!Array.isArray(manifest.media))throw fail('INVALID_MANIFEST','作品包版本或清单无效。');if(manifest.files.length+1!==entries.size||manifest.media.length>LIMITS.mediaCount||manifest.storage.length>KEYS.length)throw fail('INVALID_MANIFEST','作品包文件清单不完整。');
    const filePaths=unique(manifest.files.map(f=>safePath(f.path)));for(const f of manifest.files){checkAbort(settings.signal);if(f.path==='manifest.json'||!Number.isSafeInteger(f.size)||f.size<0||!/^[a-f0-9]{64}$/.test(f.sha256||'')||!entries.has(f.path)||entries.get(f.path).length!==f.size||await hash(entries.get(f.path))!==f.sha256)throw fail('CHECKSUM_MISMATCH','作品包校验失败，原资料未修改。');}
    let storageBytes=0;const data=manifest.storage.map(s=>{if(!KEYS.includes(s.key)||!/^state\/\d+\.json$/.test(s.path)||!filePaths.includes(s.path))throw fail('INVALID_MANIFEST','作品包资料清单无效。');const bytes=entries.get(s.path);if(bytes.length>LIMITS.storageEntryBytes||(storageBytes+=bytes.length)>LIMITS.storageBytes)throw fail('STORAGE_LIMIT','作品资料超过限制。');return {key:s.key,path:s.path,value:sanitize(s.key,parseJSON(bytes))};});unique(data.map(d=>d.key));unique(data.map(d=>d.path));
    const records=manifest.media.map((m,i)=>{if(!/^media\/\d+\.bin$/.test(m.path)||!filePaths.includes(m.path))throw fail('INVALID_MANIFEST','媒体文件缺失。');const bytes=entries.get(m.path);if(m.bytes!==bytes.length)throw fail('CHECKSUM_MISMATCH','媒体长度不一致。');const row={...m,blob:new BlobType([bytes],{type:m.type})};const clean=recordMetadata(row,i);if(clean.id!==m.id||clean.path!==m.path)throw fail('INVALID_MANIFEST','媒体路径无效。');return {...clean,blob:row.blob};});unique(records.map(r=>r.id));unique(records.filter(r=>r.kind==='loop').map(r=>r.trackIndex));unique([...data.map(d=>d.path),...records.map(r=>r.path)]);if(data.length+records.length!==manifest.files.length)throw fail('INVALID_MANIFEST','作品包含未分类文件。');
    const missing=references(data,records),destination=await destinationConflicts();checkAbort(settings.signal);const id=crypto.randomUUID?.()||'restore_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);plans.clear();plans.set(id,{id,data,records,snapshot:destination.snapshot,createdAt:Date.now(),missing});const info=summary(data,records.map(r=>({...r,bytes:r.blob.size})),missing.length?['MISSING_PROJECT_MEDIA']:[]);
    return {id,summary:{...info,packageBytes:blob.size,missingMediaReferences:missing},conflicts:destination.conflicts,canRestore:!destination.conflicts.length&&!missing.length,requiresConfirmation:true,mode:'empty-workspace-only',scope:data.map(d=>d.key),mediaCount:records.length};
   });
  }
  function localWrite(changes,to){if(!storage?.setItem||!storage?.removeItem)throw fail('STORAGE_UNAVAILABLE','无法保存恢复资料。');for(const c of changes){const expected=to==='after'?c.before:c.after,current=get(c.key);if(current!==(to==='after'?c.before:c.after)&&current!==c.before&&current!==c.after)throw fail('RECOVERY_CONFLICT','其他页面修改了本机资料，请关闭其他页面后恢复。');const value=c[to];if(value===null)storage.removeItem(c.key);else storage.setItem(c.key,value);if(get(c.key)!==value)throw fail('STORAGE_WRITE_FAILED','恢复资料保存未确认。');}}
  async function rollback(journal){
   if(!journal||journal.schema!==1||!Array.isArray(journal.storageChanges)||journal.storageChanges.some(c=>!KEYS.includes(c.key))||new Set(journal.storageChanges.map(c=>c.key)).size!==journal.storageChanges.length)throw fail('RECOVERY_REQUIRED','恢复日志异常，请保留本机资料。');
   // Check every key before changing any. Never overwrite a third party/tab edit.
   for(const c of journal.storageChanges){const current=get(c.key);if(current!==c.before&&current!==c.after)throw fail('RECOVERY_CONFLICT','检测到恢复以外的新资料，未自动覆盖。');}
   try{localWrite(journal.storageChanges,'before');await media.rollbackImportBatch(journal.token);}catch(error){throw fail(error.code==='RECOVERY_CONFLICT'?error.code:'RECOVERY_REQUIRED','恢复尚未完成，原始快照仍保留，请释放存储空间并重新打开。');}
   return {recovered:true,pending:false,rolledBack:true};
  }
  async function restore(planId,settings={}){
   return exclusive(async()=>{const plan=plans.get(planId);if(!plan||Date.now()-plan.createdAt>15*60*1000)throw fail('PLAN_EXPIRED','请重新选择作品包并检查。');if(settings.confirmed!==true)throw fail('CONFIRMATION_REQUIRED','请先确认列出的恢复范围。');checkAbort(settings.signal);const dest=await destinationConflicts();if(dest.conflicts.length)throw fail('DESTINATION_NOT_EMPTY','当前已有作品或学习进度，请先备份并在空作品库恢复。');if(plan.missing.length)throw fail('MISSING_MEDIA','工程引用的媒体不完整，无法完整恢复。');if(JSON.stringify(dest.snapshot)!==JSON.stringify(plan.snapshot))throw fail('DESTINATION_CHANGED','检查后本机资料发生变化，请重新检查。');
    const changes=plan.data.map(d=>{const before=get(d.key);let value=d.value;if(d.key===PREFS)value={...(before?parseJSON(before):{}),...d.value};return {key:d.key,before,after:JSON.stringify(value)};});let prepared=false;
    try{await media.prepareImportBatch({token:plan.id,records:plan.records,storageChanges:changes});prepared=true;checkAbort(settings.signal);for(const c of changes)if(get(c.key)!==c.before)throw fail('DESTINATION_CHANGED','本机资料已由其他页面修改。');localWrite(changes,'after');checkAbort(settings.signal);for(const c of changes)if(get(c.key)!==c.after)throw fail('DESTINATION_CHANGED','保存期间资料发生变化。');await media.commitImportBatch(plan.id);plans.delete(planId);return {restored:true,committed:true,mediaCount:plan.records.length,storageKeys:changes.map(c=>c.key),reloadRequired:true};}
    catch(error){if(prepared){const journal=await media.pendingImport();if(journal){try{await rollback(journal);}catch(recovery){throw recovery;}}}throw error;}
   });
  }
  async function recover(){return exclusive(async()=>{let journal;try{if(!media?.pendingImport)throw fail('UNSUPPORTED','恢复检查模块不可用。');journal=await media.pendingImport();}catch(error){if(error.code==='UNAVAILABLE')return {checked:true,recovered:false,pending:false,available:false,unsupported:true};return {checked:false,blocked:true,recovered:false,pending:null,available:false,errorCode:error.code||'RECOVERY_UNAVAILABLE'};}if(!journal)return {checked:true,recovered:false,pending:false,available:true};return {...await rollback(journal),checked:true};});}
  return Object.freeze({preflightExport,exportPackage,preflightImport,restore,recover,cancel:id=>plans.delete(id),status:()=>({busy,plans:plans.size}),limits:LIMITS,keys:KEYS.slice()});
 }
 return Object.freeze({create,KEYS,LIMITS,BackupError,zip,unzip,crc32});
});
