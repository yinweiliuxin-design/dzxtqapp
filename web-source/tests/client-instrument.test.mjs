import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the shipped client orchestration. Only browser / device boundaries are mocked.
const source=readFileSync(new URL('../dist/client.js',import.meta.url),'utf8');
const profileSource=readFileSync(new URL('../dist/instrument-profile.js',import.meta.url),'utf8');
const profileContext={module:{exports:{}}};vm.runInNewContext(profileSource,profileContext);
const instrumentUI=profileContext.module.exports;
function between(first,last){const from=source.indexOf(first),to=source.indexOf(last,from);assert.ok(from>=0&&to>from,'shipped source boundaries: '+first);return source.slice(from,to);}
const actual=between('  function instrumentBusy(){','  const actions={')+
  '\nglobalThis.actualInstrument={instrumentBusy,requireElectric,renderInstrumentChoice,showInstrumentChoice,dismissInstrumentChoice,commitInstrumentChoice,actions:{'+
  between("    'instrument-settings'()","    'skip-startup'()")+
  between("    async 'connect-ble-midi'()","    'recorder-mode'(el)")+'}};';
const plain=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>{});return {promise,resolve,reject};}

function harness(options={}){
  const events=[],notices=[],writes=[],renders=[],focuses=[],permissionRequests=[];
  const performanceState={recording:false,capturePending:false,captureSaving:false,...options.performanceState};
  const midiState={active:false,pending:false,...options.midiState};
  const lessonState={micPending:false,...options.lessonState};
  const bridgeState={ble:{connected:false,name:'Test violin'},native:{connected:false},lastWrite:null,...options.bridgeState};
  const prefs={instrument:'electric',instrumentChoiceVersion:1,lang:'en',region:'us',appMode:'offline',favorites:['S001','CUSTOM_2'],song:'CUSTOM_2',tutorialAuto:false,
    effects:{volume:.7,reverb:.2},recordingMode:'video',recordingSource:'microphone',...options.prefs};
  const originalPrefs=plain(prefs),rows=new Map([['sv12-prefs',JSON.stringify(prefs)],['sv-account-guest','true'],['lesson-progress','{"first-phrase":2}']]);
  const originalStored=rows.get('sv12-prefs');
  function node(name){return {name,isConnected:true,disabled:false,focus(){focuses.push(name);},setAttribute(key,value){this[key]=value;}};}
  const main=node('main'),returnFocus=node('settings-button'),choiceButtons=[node('electric'),node('acoustic'),node('commit')];
  function makeLayer(){return {dataset:{required:String(options.required??false)},innerHTML:'',setAttribute(key,value){this[key]=value;},
    querySelectorAll:()=>choiceButtons,
    querySelector(selector){if(selector.includes('data-instrument="electric"'))return choiceButtons[0];if(selector.includes('data-instrument="acoustic"'))return choiceButtons[1];return choiceButtons[0];},
    remove(){events.push('remove-layer');layer=null;}};}
  let layer=options.layer===false?null:makeLayer();
  const media=[{id:'take-1',blob:new Blob(['private-local-take'])}],svState={sessions:[{id:'practice-1',duration:42}],projects:[{id:'project-1'}],presets:[{id:'preset-1'}],userPractice:{completedLessons:['hold']}};
  const context={instrumentUI,prefs,media,svState,viewer:null,accountChoice:'guest',
    instrumentChoiceConfirmed:options.confirmed??true,instrumentDraft:options.draft??'acoustic',instrumentChanging:false,instrumentGeneration:7,instrumentReturnFocus:returnFocus,
    capture:null,capturePending:false,saving:false,audioPending:false,tuner:true,metro:true,chord:'C',loopsPlaying:true,bleDecodeState:{running:0x90},
    document:{activeElement:returnFocus,createElement:()=>makeLayer(),body:{append(value){layer=value;events.push('append-layer');}}},
    $:selector=>selector==='#instrument-layer'?layer:selector==='#main'?main:null,
    isElectric:()=>prefs.instrument==='electric',IT:key=>instrumentUI.text(prefs.lang,key),
    notify(value){notices.push(value);},setBackgroundInert(value){events.push('inert:'+value);},closeModal(){events.push('close-modal');},
    render(){renders.push({instrument:prefs.instrument,confirmed:context.instrumentChoiceConfirmed,changing:context.instrumentChanging});},
    continueAfterWelcome(){events.push('continue-welcome');},
    async finishPractice(){events.push('finish-practice');if(options.practiceGate)await options.practiceGate.promise;},
    engine:{stopTuner(){events.push('stop-tuner');},stop(){events.push('stop-engine');}},
    performanceStudio:{state:()=>performanceState,pause(){events.push('pause-performance');}},
    midiStudio:{captureStatus:()=>midiState,async stop(){events.push('stop-midi');if(options.midiStopGate)await options.midiStopGate.promise;},
      async startExternalCapture(label){permissionRequests.push(['capture-midi',label]);if(options.midiCaptureGate)await options.midiCaptureGate.promise;},
      stopExternalCapture(reason){events.push('stop-external:'+reason);}},
    lessons:{state:()=>lessonState,unmount(){events.push('unmount-lessons');}},
    deviceBridge:{status:()=>bridgeState,cancel(){events.push('cancel-bridge');bridgeState.ble.connected=false;bridgeState.native.connected=false;},disconnect(){events.push('disconnect-bridge');},
      async connectBleMidi(){permissionRequests.push(['connect-ble']);if(options.bleGate)await options.bleGate.promise;else bridgeState.ble.connected=true;},
      async connectNative(){permissionRequests.push(['connect-native']);if(options.nativeGate)await options.nativeGate.promise;else bridgeState.native.connected=true;},
      async storePreset(value){permissionRequests.push(['store-preset',plain(value)]);bridgeState.lastWrite={status:'pending'};try{const result=options.writeGate?await options.writeGate.promise:{persisted:true};bridgeState.lastWrite={status:result.persisted?'confirmed':'failed'};return result;}catch(error){bridgeState.lastWrite={status:'failed'};throw error;}}},
    updateDeviceStatus(){events.push('update-device');},
    localStorage:{setItem(key,value){writes.push({key,value});if(options.storageError)throw Error('Storage denied');rows.set(key,value);}},
    Promise,Error,JSON,Object
  };
  vm.createContext(context);vm.runInContext(actual,context,{filename:'client.js:actualInstrument',timeout:1000});
  return {context,events,notices,writes,renders,focuses,permissionRequests,performanceState,midiState,lessonState,bridgeState,prefs,originalPrefs,originalStored,rows,media,svState,choiceButtons,
    layer:()=>layer,api:context.actualInstrument,commit:()=>context.actualInstrument.commitInstrumentChoice(),
    action:(name,dataset={})=>context.actualInstrument.actions[name]({dataset})};
}

test('every active recording, permission, pending save and device-write state prevents instrument switching',async()=>{
  const guards=[['instrumentChanging',h=>h.context.instrumentChanging=true],['capture',h=>h.context.capture={id:'take'}],['capturePending',h=>h.context.capturePending=true],
    ['saving',h=>h.context.saving=true],['audioPending',h=>h.context.audioPending=true],['performance recording',h=>h.performanceState.recording=true],
    ['performance permission',h=>h.performanceState.capturePending=true],['performance save',h=>h.performanceState.captureSaving=true],
    ['MIDI capture',h=>h.midiState.active=true],['MIDI permission',h=>h.midiState.pending=true],['lesson microphone',h=>h.lessonState.micPending=true],
    ['device preset write',h=>h.bridgeState.lastWrite={status:'pending'}]];
  for(const [name,activate] of guards){const h=harness();assert.equal(h.api.instrumentBusy(),false);activate(h);assert.equal(h.api.instrumentBusy(),true,name);await h.commit();assert.deepEqual(h.prefs,h.originalPrefs,name);assert.equal(h.writes.length,0,name);assert.equal(h.events.length,0,name);assert.deepEqual(h.notices,[instrumentUI.text('en','busy')],name);}
});

test('a confirmed change keeps guest mode, preferences, progress, recordings and state object identities',async()=>{
  const h=harness(),prefsRef=h.prefs,fxRef=h.prefs.effects,favoritesRef=h.prefs.favorites,mediaRef=h.media[0].blob,svRef=h.svState;
  await h.commit();
  assert.equal(h.context.prefs,prefsRef);assert.equal(h.prefs.effects,fxRef);assert.equal(h.prefs.favorites,favoritesRef);assert.equal(h.context.media[0].blob,mediaRef);assert.equal(h.context.svState,svRef);
  assert.deepEqual(h.prefs,{...h.originalPrefs,instrument:'acoustic',instrumentChoiceVersion:1});
  assert.equal(h.context.viewer,null);assert.equal(h.context.accountChoice,'guest');assert.equal(h.prefs.appMode,'offline');
  assert.equal(h.rows.get('sv-account-guest'),'true');assert.equal(h.rows.get('lesson-progress'),'{"first-phrase":2}');
  assert.deepEqual(plain(h.svState),{sessions:[{id:'practice-1',duration:42}],projects:[{id:'project-1'}],presets:[{id:'preset-1'}],userPractice:{completedLessons:['hold']}});
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].key,'sv12-prefs');assert.deepEqual(JSON.parse(h.rows.get('sv12-prefs')),h.prefs);
  assert.equal(h.context.instrumentChoiceConfirmed,true);assert.equal(h.context.instrumentGeneration,8);assert.equal(h.context.instrumentChanging,false);assert.equal(h.layer(),null);
  assert.deepEqual(h.notices,[instrumentUI.text('en','saved')]);assert.equal(h.permissionRequests.length,0);
});

test('storage denial applies the chosen instrument for this visit and never claims a durable save',async()=>{
  const h=harness({storageError:true});await h.commit();
  assert.equal(h.prefs.instrument,'acoustic');assert.equal(h.prefs.instrumentChoiceVersion,0);assert.equal(h.context.instrumentChoiceConfirmed,true);
  assert.equal(h.rows.get('sv12-prefs'),h.originalStored);assert.equal(h.prefs.appMode,'offline');assert.equal(h.layer(),null);
  assert.deepEqual(h.notices,[instrumentUI.text('en','memoryOnly')]);assert.equal(h.renders.at(-1).instrument,'acoustic');
  assert.equal(instrumentUI.hasChoice(JSON.parse(h.rows.get('sv12-prefs'))),true); // Old saved choice is left intact.
  assert.equal(JSON.parse(h.rows.get('sv12-prefs')).instrument,'electric');
});

test('required first-run completion continues onboarding without introducing login or losing existing locale',async()=>{
  const h=harness({confirmed:false,required:true,prefs:{instrumentChoiceVersion:0,lang:'ja',region:'jp',appMode:'full'}});await h.commit();
  assert.ok(h.events.includes('continue-welcome'));assert.equal(h.prefs.lang,'ja');assert.equal(h.prefs.region,'jp');assert.equal(h.prefs.appMode,'full');assert.equal(h.context.viewer,null);
  assert.equal(h.permissionRequests.length,0);assert.equal(h.context.instrumentChoiceConfirmed,true);
});

test('an invalid draft or a missing selection dialog cannot commit or clean up any media',async()=>{
  for(const draft of ['','piano','Electric',{},true]){const h=harness({draft});await h.commit();assert.equal(h.writes.length,0);assert.deepEqual(h.events,[]);assert.deepEqual(h.prefs,h.originalPrefs);}
  for(const draft of [null,undefined]){const h=harness();h.context.instrumentDraft=draft;await h.commit();assert.equal(h.writes.length,0);assert.deepEqual(h.events,[]);}
  const missing=harness({layer:false});await missing.commit();assert.equal(missing.writes.length,0);assert.deepEqual(missing.events,[]);
});

test('changing instruments drains practice before stopping playback and cancelling stale device operations',async()=>{
  const gate=deferred(),h=harness({practiceGate:gate});const pending=h.commit();
  assert.equal(h.context.instrumentChanging,true);assert.deepEqual(h.events,['finish-practice']);assert.equal(h.prefs.instrument,'electric');assert.equal(h.writes.length,0);
  assert.ok(h.choiceButtons.every(button=>button.disabled));
  gate.resolve();await pending;
  assert.deepEqual(h.events.slice(0,7),['finish-practice','stop-tuner','stop-engine','pause-performance','stop-midi','unmount-lessons','cancel-bridge']);
  assert.equal(h.context.bleDecodeState,null);for(const key of ['tuner','metro','loopsPlaying'])assert.equal(h.context[key],false);assert.equal(h.context.chord,null);
  assert.equal(h.permissionRequests.length,0);assert.ok(!h.events.includes('disconnect-bridge'));
});

test('confirming the same instrument still stops playback but preserves its device connection and parser state',async()=>{
  const h=harness({draft:'electric',bridgeState:{ble:{connected:true,name:'Current violin'}}}),parser=h.context.bleDecodeState;await h.commit();
  assert.equal(h.bridgeState.ble.connected,true);assert.equal(h.context.bleDecodeState,parser);assert.ok(!h.events.includes('cancel-bridge'));assert.ok(!h.events.includes('disconnect-bridge'));
  for(const event of ['stop-tuner','stop-engine','pause-performance','stop-midi','unmount-lessons'])assert.ok(h.events.includes(event),event);
});

test('overlapping commits cannot create a second write or skip the pending MIDI stop',async()=>{
  const gate=deferred(),h=harness({midiStopGate:gate});const first=h.commit();await flush();
  assert.equal(h.context.instrumentChanging,true);assert.equal(h.writes.length,0);await h.commit();assert.equal(h.writes.length,0);
  gate.resolve();await first;assert.equal(h.writes.length,1);assert.equal(h.events.filter(x=>x==='stop-midi').length,1);assert.equal(h.events.filter(x=>x==='cancel-bridge').length,1);
  assert.equal(h.notices.filter(x=>x===instrumentUI.text('en','busy')).length,1);
});

test('cleanup errors keep the current instrument and dialog available for a deliberate retry',async()=>{
  for(const key of ['practiceGate','midiStopGate']){const gate=deferred(),h=harness({[key]:gate});const pending=h.commit();gate.reject(Error('Cleanup failed'));await assert.rejects(pending,/Cleanup failed/);
    assert.equal(h.context.instrumentChanging,false);assert.equal(h.prefs.instrument,'electric');assert.equal(h.writes.length,0);assert.ok(h.layer());assert.deepEqual(h.notices,[]);assert.ok(!h.events.includes('cancel-bridge'));}
});

test('opening and cancelling instrument selection do not persist a draft or auto-connect hardware',async()=>{
  const h=harness({layer:false,confirmed:false});assert.equal(h.api.showInstrumentChoice(true),true);assert.equal(h.context.instrumentDraft,null);assert.equal(h.layer().dataset.required,'true');
  h.action('choose-instrument',{instrument:'acoustic'});assert.equal(h.context.instrumentDraft,'acoustic');assert.equal(h.prefs.instrument,'electric');assert.equal(h.writes.length,0);
  h.action('cancel-instrument');assert.ok(h.layer()); // Mandatory first choice cannot be dismissed.
  h.layer().dataset.required='false';h.action('cancel-instrument');assert.equal(h.layer(),null);assert.equal(h.context.instrumentDraft,null);assert.equal(h.prefs.instrument,'electric');
  assert.equal(h.permissionRequests.length,0);assert.equal(h.focuses.at(-1),'settings-button');
  const chosen=harness({layer:false});assert.equal(chosen.api.showInstrumentChoice(false),true);assert.equal(chosen.context.instrumentDraft,'electric');
});

test('late BLE connection success after a switch does not announce an electric connection in acoustic mode',async()=>{
  const gate=deferred(),h=harness({bleGate:gate});const connecting=h.action('connect-ble-midi');assert.deepEqual(h.permissionRequests,[['connect-ble']]);
  await h.commit();h.bridgeState.ble.connected=true; // An intentionally stale platform reply; client must not announce it.
  gate.resolve();await connecting;
  assert.deepEqual(h.notices,[instrumentUI.text('en','saved')]);assert.equal(h.prefs.instrument,'acoustic');assert.equal(h.events.at(-1),'update-device');
});

test('late connection errors are ignored after an instrument generation changes, current errors remain visible',async()=>{
  for(const [action,gateKey] of [['connect-ble-midi','bleGate'],['connect-native','nativeGate']]){
    const gate=deferred(),h=harness({[gateKey]:gate});const connecting=h.action(action);await h.commit();gate.reject(Error('Old chooser rejected'));await connecting;
    assert.equal(h.prefs.instrument,'acoustic');assert.deepEqual(h.notices,[instrumentUI.text('en','saved')]);assert.equal(h.events.at(-1),'update-device');
    const currentGate=deferred(),current=harness({[gateKey]:currentGate});const failure=current.action(action);currentGate.reject(Error('Current chooser rejected'));await assert.rejects(failure,/Current chooser rejected/);
    assert.equal(current.events.at(-1),'update-device');assert.deepEqual(current.notices,[]);
  }
});

test('hardware actions cannot connect, write presets or capture BLE MIDI in acoustic or changing states',async()=>{
  for(const mode of ['acoustic','changing'])for(const action of ['connect-ble-midi','connect-native','capture-ble-midi','store-preset-device']){
    const h=harness({prefs:{instrument:mode==='acoustic'?'acoustic':'electric'},bridgeState:{ble:{connected:true,name:'Connected'}}});h.context.instrumentChanging=mode==='changing';
    await h.action(action);assert.deepEqual(h.permissionRequests,[],mode+':'+action);assert.equal(h.writes.length,0);assert.deepEqual(h.notices,[instrumentUI.text('en','selectionRequired')]);
  }
});

test('a pending hardware preset write blocks changes until acknowledgement and unconfirmed writes do not claim success',async()=>{
  const gate=deferred(),h=harness({writeGate:gate});const writing=h.action('store-preset-device');assert.equal(h.bridgeState.lastWrite.status,'pending');await h.commit();assert.equal(h.prefs.instrument,'electric');assert.equal(h.writes.length,0);
  gate.resolve({persisted:true});await writing;assert.ok(h.notices.some(message=>message==='设备已确认预设持久保存。'));await h.commit();assert.equal(h.prefs.instrument,'acoustic');
  const rejectedGate=deferred(),rejected=harness({writeGate:rejectedGate});const unconfirmed=rejected.action('store-preset-device');rejectedGate.resolve({persisted:false});await assert.rejects(unconfirmed,/设备尚未确认/);assert.deepEqual(rejected.notices,[]);
});

test('BLE capture requires an actual connected device and successful current pairing reports its real status',async()=>{
  const h=harness();await assert.rejects(h.action('capture-ble-midi'),/请先连接真实蓝牙/);assert.deepEqual(h.permissionRequests,[]);
  await h.action('connect-ble-midi');assert.ok(h.notices.some(message=>message.startsWith('蓝牙 MIDI 已连接')));
  await h.action('capture-ble-midi');assert.deepEqual(h.permissionRequests.at(-1),['capture-midi','Bluetooth MIDI · Test violin']);
});
