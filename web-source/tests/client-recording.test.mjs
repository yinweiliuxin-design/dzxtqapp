import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped orchestration functions, not a parallel implementation.
const source=readFileSync(new URL('../dist/client.js',import.meta.url),'utf8');
const from=source.indexOf('  function recordingPhrase()'),to=source.indexOf('  async function deleteMedia(',from);
assert.ok(from>=0&&to>from,'actual recording function boundaries exist');
const actual=source.slice(from,to)+'\nglobalThis.actualRecording={startRecord,stopRecord};';
const plain=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>{});return {promise,resolve,reject};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(options={}){
  const requests=[],videoRequests=[],permissionQueue=[],videoQueue=[],saved=[],notices=[],renders=[],intervals=new Map(),plays=[],stops=[],persisted=[];
  let now=1000,sequence=0,refreshes=0,selectedSong={id:'S001',title:'First melody'};
  function recorder(source='microphone',{failure=null}={}){const done=deferred();let finished=false;const run={source,stream:{id:'camera-stream'},finished:done.promise,stopCalls:0,stop(){run.stopCalls++;if(!finished){finished=true;if(failure)done.reject(failure);else done.resolve({blob:new Blob(['captured media'],{type:'audio/webm'}),duration:2.5,source});}return done.promise;},complete(){if(!finished){finished=true;done.resolve({blob:new Blob(['captured media'],{type:'audio/webm'}),duration:2.5,source});}},fail(error){if(!finished){finished=true;done.reject(error);}}};return run;}
  const preview={id:'camera-preview'};
  const context={page:'studio',capture:null,capturePending:false,captureGeneration:0,saving:false,recordTimer:null,captureRequestedKind:null,recordingError:'',lastSavedRecordingId:null,
    prefs:{source:'synth',recordingSource:'microphone',recordingFacing:'user',preset:'Acoustic',effects:{volume:.75},a4:440,lang:'zh',...options.prefs},
    workspace:{state:()=>({practiceSource:options.lesson?'guided':'catalog'})},lessons:{selectedLesson:()=>options.lesson,state:()=>({transport:{rate:options.lessonRate||1}})},
    crypto:{randomUUID:()=>`capture-${++sequence}`},performance:{now:()=>now},Date,Promise,Error,Blob,
    $:selector=>selector==='#camera-preview'?preview:null,
    T:value=>value,title:song=>song.title,song:()=>selectedSong,rangeModel:()=>({plan:[{start:0,end:2}]}),
    recordingFailure:error=>'capture failed: '+error.message,recordingText:key=>key,
    updateRecordingUI(){},render(){renders.push({pending:context.capturePending,saving:context.saving,capture:context.capture?.id||null});},
    persist(){persisted.push(plain(context.prefs));return true;},notify:message=>notices.push(message),
    finishPractice:()=>options.finishPracticeGate?.promise||Promise.resolve(),
    setInterval(fn,ms){const id=++sequence;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id),
    engine:{startCapture(captureSource,limits){requests.push({source:captureSource,limits:plain(limits)});const next=permissionQueue.shift();return next?.promise||Promise.resolve(recorder(captureSource));},setPreset(){},setEffects(){},play(plan,settings){plays.push({plan:plain(plan),settings:plain(settings)});return options.playGate?.promise||Promise.resolve({started:true});},stop(){stops.push(now);}},
    videoManager:{start(settings){videoRequests.push(settings);return videoQueue.shift()?.promise||Promise.resolve(recorder('microphone'));},cancel(){videoRequests.push({cancelled:true});}},
    SVMediaStore:{async put(row){saved.push(row);if(options.saveError)throw options.saveError;return options.saveGate?options.saveGate.promise:{persisted:true};}},
    async refreshMedia(){refreshes++;}
  };
  vm.createContext(context);vm.runInContext(actual,context,{filename:'client.js:actualRecording',timeout:1000});
  return {context,requests,videoRequests,saved,notices,renders,intervals,plays,stops,persisted,preview,recorder,
    start:(kind='recording',trackIndex)=>context.actualRecording.startRecord(kind,trackIndex),stop:()=>context.actualRecording.stopRecord(),
    deferPermission(){const gate=deferred();permissionQueue.push(gate);return gate;},deferVideo(){const gate=deferred();videoQueue.push(gate);return gate;},setClock:value=>now=value,setSong:value=>selectedSong=value,refreshes:()=>refreshes};
}

test('one-shot performance defaults to microphone independently from the loop synth preference',async()=>{
  assert.match(source,/recordingSource:'microphone'/);
  const h=harness();await h.start();assert.deepEqual(h.requests,[{source:'microphone',limits:{}}]);assert.equal(h.context.capture.source,'microphone');assert.equal(h.context.prefs.source,'synth');assert.equal(h.plays.length,0);assert.equal(h.intervals.size,1);await h.stop();assert.equal(h.saved.length,1);assert.equal(h.saved[0].source,'microphone');assert.equal(h.saved[0].kind,'recording');assert.equal(h.intervals.size,0);
});

test('recording the current guided lesson uses the same title, notes and chosen lesson speed',async()=>{
  const lesson={title:{zh:'A弦慢练',en:'Slow A string'},events:[{midi:69,start:0,end:1},{midi:71,start:1,end:2}]};
  const h=harness({lesson,lessonRate:.5,prefs:{recordingSource:'synth'}});
  await h.start();assert.equal(h.context.capture.name,'录音 · A弦慢练');
  assert.deepEqual(h.plays[0].plan.map(n=>[n.start,n.end]),[[0,2],[2,4]]);assert.equal(h.plays[0].plan[0].freq,440);assert.ok(h.plays[0].plan[1].freq>490&&h.plays[0].plan[1].freq<495);
  lesson.title.zh='Later lesson';lesson.events[0].midi=60;await h.stop();assert.equal(h.saved[0].name,'录音 · A弦慢练');assert.equal(h.plays[0].plan[0].freq,440);
});

test('guided recording accepts a published plain-string title without using unrelated library music',async()=>{
  const h=harness({lesson:{title:'Published phrase',events:[{midi:62,start:0,end:2}]},prefs:{recordingSource:'synth'}});await h.start();assert.equal(h.context.capture.name,'录音 · Published phrase');assert.ok(h.plays[0].plan[0].freq>293&&h.plays[0].plan[0].freq<294);await h.stop();
});
test('loop capture keeps its independent input source and bounded two-minute limit',async()=>{
  const h=harness({prefs:{source:'microphone',recordingSource:'synth'}});await h.start('loop',2);assert.deepEqual(h.requests,[{source:'microphone',limits:{maxDurationMs:120000}}]);assert.equal(h.context.capture.trackIndex,2);assert.equal(h.context.prefs.recordingSource,'synth');assert.equal(h.plays.length,0);await h.stop();assert.equal(h.saved[0].kind,'loop');assert.equal(h.saved[0].name,'循环轨 3 · First melody');assert.equal(h.context.lastSavedRecordingId,null);
});
test('explicit synth one-shot plays once while a synth loop repeats',async()=>{
  for(const kind of ['recording','loop']){const h=harness({prefs:{recordingSource:'synth'}});await h.start(kind,0);assert.equal(h.requests[0].source,'synth');assert.equal(h.plays.length,1);assert.equal(h.plays[0].settings.loop,kind==='loop');await h.stop();}
});
test('video forwards the chosen camera and preview while always recording microphone input',async()=>{
  const h=harness({prefs:{recordingFacing:'environment',recordingSource:'synth'}});assert.equal(h.videoRequests.length,0);await h.start('video');assert.equal(h.requests.length,0);assert.equal(h.videoRequests.length,1);assert.equal(h.videoRequests[0].facingMode,'environment');assert.equal(h.videoRequests[0].preview,h.preview);assert.equal(h.context.capture.source,'microphone');assert.equal(h.context.prefs.recordingMode,'video');assert.equal(h.plays.length,0);await h.stop();assert.equal(h.saved[0].kind,'video');assert.equal(h.saved[0].source,'microphone');
});
test('finished automatically saves an audio or video take once and later stop cannot duplicate it',async()=>{
  for(const kind of ['recording','video']){const h=harness();await h.start(kind);const run=h.context.capture.recorder;run.complete();await flush();assert.equal(h.saved.length,1);assert.equal(run.stopCalls,1);assert.equal(h.context.capture,null);assert.equal(h.context.saving,false);assert.equal(h.intervals.size,0);assert.equal(h.context.lastSavedRecordingId,h.saved[0].id);await h.stop();assert.equal(h.saved.length,1);assert.equal(h.refreshes(),1);}
});
test('concurrent explicit stop, finished and repeated stop serialize one pending save',async()=>{
  const saveGate=deferred(),h=harness({saveGate});await h.start();const run=h.context.capture.recorder,pending=h.stop();await flush();assert.equal(h.context.saving,true);assert.equal(h.saved.length,1);await h.stop();await h.start();assert.equal(h.requests.length,1);assert.equal(run.stopCalls,1);saveGate.resolve({persisted:true});await pending;assert.equal(h.saved.length,1);assert.equal(h.context.saving,false);assert.equal(h.intervals.size,0);
});
test('capture source, name and creation time remain the original take snapshots',async()=>{
  const h=harness();await h.start();const snapshot=h.context.capture;h.context.prefs.recordingSource='synth';h.setSong({id:'S002',title:'Changed song'});h.setClock(6000);await h.stop();assert.equal(h.saved[0].source,'microphone');assert.equal(h.saved[0].name,'录音 · First melody');assert.equal(h.saved[0].createdAt,snapshot.createdAt);assert.equal(h.saved[0].completed,true);assert.ok(h.saved[0].blob.size>0);
});
test('denied permission restores idle state and permits an explicit retry without saving',async()=>{
  const h=harness(),permission=h.deferPermission(),pending=h.start();await flush();assert.equal(h.context.capturePending,true);permission.reject(Error('microphone permission denied'));await assert.rejects(pending,/capture failed: microphone permission denied/);assert.equal(h.saved.length,0);assert.equal(h.context.capturePending,false);assert.equal(h.context.captureRequestedKind,null);assert.equal(h.context.capture,null);assert.equal(h.intervals.size,0);assert.match(h.context.recordingError,/permission denied/);await h.start();assert.equal(h.requests.length,2);assert.equal(h.context.recordingError,'');await h.stop();
});
test('cancelled late microphone resolution is stopped without saving or clearing a newer take',async()=>{
  const h=harness(),permission=h.deferPermission(),first=h.start();await flush();await h.stop();assert.equal(h.context.capturePending,false);await h.start();const active=h.context.capture,activeTimer=h.context.recordTimer,stopCount=h.stops.length,late=h.recorder();permission.resolve(late);await first;assert.equal(late.stopCalls,1);assert.equal(h.context.capture,active);assert.equal(h.context.recordTimer,activeTimer);assert.equal(h.context.capturePending,false);assert.equal(h.intervals.size,1);assert.equal(h.stops.length,stopCount);assert.equal(h.saved.length,0);await h.stop();assert.equal(h.saved.length,1);assert.equal(h.saved[0].id,active.id);
});
test('cancelled late permission rejection cannot alter a newer take or its error state',async()=>{
  const h=harness(),permission=h.deferPermission(),first=h.start();await flush();await h.stop();await h.start();const active=h.context.capture,stopCount=h.stops.length;permission.reject(Error('old permission rejected'));await first;assert.equal(h.context.capture,active);assert.equal(h.context.recordingError,'');assert.equal(h.context.capturePending,false);assert.equal(h.stops.length,stopCount);assert.equal(h.intervals.size,1);await h.stop();
});
test('cancelling a pending video request explicitly cancels the camera manager and releases late media',async()=>{
  const h=harness(),permission=h.deferVideo(),pending=h.start('video');await flush();await h.stop();assert.equal(h.videoRequests.filter(value=>value.cancelled).length,1);assert.equal(h.context.capturePending,false);const late=h.recorder();permission.resolve(late);await pending;assert.equal(late.stopCalls,1);assert.equal(h.context.capture,null);assert.equal(h.saved.length,0);assert.equal(h.intervals.size,0);
});
test('navigation before permission settles closes granted capture without saving',async()=>{
  const h=harness(),permission=h.deferPermission(),pending=h.start();await flush();h.context.page='home';const late=h.recorder();permission.resolve(late);await pending;assert.equal(late.stopCalls,1);assert.equal(h.saved.length,0);assert.equal(h.context.capture,null);assert.equal(h.context.capturePending,false);assert.equal(h.intervals.size,0);
});
test('stop failure still stops playback, clears timers and saving state without a fabricated saved row',async()=>{
  const h=harness(),permission=h.deferPermission(),pending=h.start();await flush();const broken=h.recorder('microphone',{failure:Error('encoder stopped')});permission.resolve(broken);await pending;await assert.rejects(h.stop(),/stopFailed/);await flush();assert.equal(h.saved.length,0);assert.equal(h.context.capture,null);assert.equal(h.context.saving,false);assert.equal(h.context.capturePending,false);assert.equal(h.context.recordTimer,null);assert.equal(h.intervals.size,0);assert.equal(h.stops.length,1);assert.equal(h.context.recordingError,'stopFailed');
});
test('storage failure releases recording resources and never announces durable success',async()=>{
  const h=harness({saveError:Error('quota')});await h.start();await assert.rejects(h.stop(),/stopFailed/);assert.equal(h.context.capture,null);assert.equal(h.context.saving,false);assert.equal(h.intervals.size,0);assert.equal(h.stops.length,1);assert.equal(h.refreshes(),0);assert.ok(!h.notices.includes('savedLocal'));assert.equal(h.context.lastSavedRecordingId,null);
});
test('memory-only media is reported honestly and remains a completed take',async()=>{
  const saveGate=deferred(),h=harness({saveGate});await h.start();const pending=h.stop();await flush();saveGate.resolve({persisted:false});await pending;assert.ok(h.notices.includes('savedMemory'));assert.ok(!h.notices.includes('savedLocal'));assert.equal(h.saved[0].completed,true);assert.equal(h.context.lastSavedRecordingId,h.saved[0].id);
});
test('busy and invalid starts do not request permissions or create media',async()=>{
  const h=harness();await h.start('invalid');assert.equal(h.requests.length,0);await h.start();await h.start('video');await h.start('loop',1);assert.equal(h.requests.length,1);assert.equal(h.videoRequests.length,0);assert.equal(h.intervals.size,1);await h.stop();
});
test('failed synth playback during capture startup is an error and cannot autosave a failed take',async()=>{
  const playGate=deferred(),h=harness({playGate,prefs:{recordingSource:'synth'}}),pending=h.start();await flush();assert.ok(h.context.capture);playGate.reject(Error('audio activation failed'));await assert.rejects(pending,/capture failed: audio activation failed/);await flush();assert.equal(h.saved.length,0);assert.equal(h.context.capture,null);assert.equal(h.context.capturePending,false);assert.equal(h.context.saving,false);assert.equal(h.intervals.size,0);assert.match(h.context.recordingError,/audio activation failed/);
});
test('cancel before practice cleanup completes prevents the old permission request and preserves a new start',async()=>{
  const finishPracticeGate=deferred(),h=harness({finishPracticeGate}),first=h.start();assert.equal(h.context.capturePending,true);await h.stop();const second=h.start();finishPracticeGate.resolve();await Promise.all([first,second]);assert.equal(h.requests.length,1);assert.ok(h.context.capture);assert.equal(h.context.capturePending,false);assert.equal(h.intervals.size,1);await h.stop();assert.equal(h.saved.length,1);
});
test('unexpected recorder failure automatically returns to idle without saving or leaking a timer',async()=>{
  const h=harness();await h.start();h.context.capture.recorder.fail(Error('input disconnected'));await flush();assert.equal(h.context.capture,null);assert.equal(h.context.saving,false);assert.equal(h.saved.length,0);assert.equal(h.intervals.size,0);assert.equal(h.stops.length,1);assert.equal(h.context.recordingError,'stopFailed');assert.ok(h.notices.includes('stopFailed'));
});

const extensionFrom=source.indexOf('  const extension='),extensionTo=source.indexOf('  function confirmDialog(',extensionFrom);
const downloadFrom=source.indexOf("    'download-media'(el)"),downloadTo=source.indexOf("    'delete-media'(el)",downloadFrom);
const renameFrom=source.indexOf("    async 'save-media-name'(el)"),renameTo=source.indexOf("    'record-loop':",renameFrom);
assert.ok(extensionFrom>=0&&extensionTo>extensionFrom&&downloadFrom>=0&&downloadTo>downloadFrom&&renameFrom>=0&&renameTo>renameFrom,'actual media naming boundaries exist');
const mediaActions=source.slice(extensionFrom,extensionTo)+'\nglobalThis.actualMedia={'+source.slice(downloadFrom,downloadTo)+source.slice(renameFrom,renameTo)+'};';
function mediaHarness({name='Evening practice',type='audio/webm'}={}){
  const row={id:'take-1',name,kind:type.startsWith('video/')?'video':'recording',blob:new Blob(['unchanged capture bytes'],{type})},downloads=[],writes=[];
  const input={value:name},context={media:[row],capture:null,capturePending:false,saving:false,Error,String,
    brand:()=>'Silvio',recordingText:key=>key,$:selector=>selector==='#media-name'?input:null,
    download:(filename,blob)=>downloads.push({filename,blob}),SVMediaStore:{async put(value){writes.push(value);return {persisted:true};}},
    async refreshMedia(){if(writes.length)context.media=[writes.at(-1)];},closeModal(){},render(){},notify(){}};
  vm.createContext(context);vm.runInContext(mediaActions,context,{filename:'client.js:actualMedia',timeout:1000});
  return {row,context,downloads,writes,input,download:id=>context.actualMedia['download-media']({dataset:{id:id||row.id}}),rename:()=>context.actualMedia['save-media-name']({dataset:{id:row.id}})};
}
test('download uses the genuine media container extension and leaves the original Blob unchanged',()=>{
  for(const [type,expected] of [['audio/mp4','m4a'],['audio/mp4;codecs=mp4a.40.2','m4a'],['video/mp4','mp4'],['video/mp4;codecs=avc1.42E01E','mp4'],['audio/webm;codecs=opus','webm'],['video/webm','webm'],['audio/ogg','ogg'],['audio/wav','wav']]){const h=mediaHarness({type});h.download();assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].filename,'Evening practice.'+expected);assert.equal(h.downloads[0].blob,h.row.blob);assert.equal(h.downloads[0].blob.type,type.toLowerCase());}
});
test('download sanitizes path delimiters, control characters and trailing dots into a single filename',()=>{
  const h=mediaHarness({name:'..\\..//take:\u0000\u0001\u007f"<>|?* ..  ',type:'video/mp4'});h.download();const {filename,blob}=h.downloads[0];assert.doesNotMatch(filename,/[\\/:*?"<>|\u0000-\u001f\u007f]/);assert.doesNotMatch(filename,/^[.\s]/);assert.doesNotMatch(filename.slice(0,-4),/[.\s]$/);assert.ok(filename.endsWith('.mp4'));assert.equal(blob,h.row.blob);
});
test('empty sanitized names fall back to the localized brand and downloads ignore missing media',()=>{
  const h=mediaHarness({name:'.../// \u0000....',type:'audio/mp4'});h.download('missing');assert.equal(h.downloads.length,0);h.download();assert.equal(h.downloads[0].filename,'Silvio-recording.m4a');assert.equal(h.downloads[0].blob,h.row.blob);
});
test('renaming a saved take updates the downloaded filename while preserving its media bytes',async()=>{
  const h=mediaHarness({type:'audio/mp4'});h.input.value='  春のうた · Take 2  ';await h.rename();assert.equal(h.writes.length,1);assert.equal(h.writes[0].name,'春のうた · Take 2');assert.equal(h.writes[0].blob,h.row.blob);h.download();assert.equal(h.downloads[0].filename,'春のうた · Take 2.m4a');assert.equal(h.downloads[0].blob,h.row.blob);
});
test('download bounds the saved name length without changing the original saved title',()=>{
  const name='Violin'.repeat(25),h=mediaHarness({name,type:'audio/mp4'});h.download();assert.ok(h.downloads[0].filename.length<=104);assert.equal(h.row.name,name);assert.equal(h.downloads[0].blob,h.row.blob);
});
