import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Extract the actual object method between explicit sibling action signatures.
// This leaves nested template strings intact and tolerates whitespace changes.
// A renamed/reordered boundary fails explicitly instead of testing copied code.
const source=readFileSync(new URL('../dist/client.js',import.meta.url),'utf8');
const start=[...source.matchAll(/\basync\s+(['"])load-project\1\s*\(\s*el\s*\)\s*\{/g)];
assert.equal(start.length,1,'one actual load-project action must exist');
const tail=source.slice(start[0].index),next=/\basync\s+(['"])play-project\1\s*\(/.exec(tail);
assert.ok(next,'the explicit next action boundary must exist');
const property=tail.slice(0,next.index).trim();
assert.match(property,/},$/,'only the complete method property is extracted');
const actualMethod='({'+property.slice(0,-1)+'})["load-project"]';
const plain=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness({rows=[{id:'track-a'},{id:'track-b'}],gate,readError=false,...flags}={}){
  const reads=[],modals=[],buttons=[],persisted=[];
  const project={id:'project-a',name:'<QA violin>',bpm:96,barCount:4,trackIds:['track-a','track-b']};
  const context={capture:null,capturePending:false,saving:false,navigationId:7,page:'studio',...flags,
    svState:{projects:[project]},prefs:{bpm:55,barCount:2,unchanged:'keep'},
    SVMediaStore:{list(kind,options){reads.push({kind,options:plain(options)});return gate?gate.promise:Promise.resolve(rows);},status(){return {error:readError?{code:'READ_FAILED'}:null};}},
    persist(){persisted.push(plain(context.prefs));return true;},modal(value){modals.push(value);},
    E:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
    button(label,action,icon,style,attributes){buttons.push({label,action,attributes});return '<button '+attributes+'>'+label+'</button>';}
  };
  const load=vm.runInNewContext(actualMethod,context,{filename:'client.js:load-project'});
  return {context,project,reads,modals,buttons,persisted,load:(id='project-a')=>load({dataset:{id}}),assertUnchanged(){assert.deepEqual(plain(context.prefs),{bpm:55,barCount:2,unchanged:'keep'});assert.equal(modals.length,0);assert.equal(persisted.length,0);}};
}

for(const [name,flags]of [['recording',{capture:{id:'active-recording'}}],['permission pending',{capturePending:true}],['saving',{saving:true}]]){
  test('load-project refuses '+name+' before reading media or changing parameters',async()=>{const h=harness(flags);await assert.rejects(h.load(),/停止.*保存/);assert.equal(h.reads.length,0);h.assertUnchanged();});
}
for(const [name,change]of [['navigation generation',context=>context.navigationId++],['page departure',context=>context.page='profile']]){
  test('load-project discards pending media read after '+name,async()=>{const gate=deferred(),h=harness({gate}),pending=h.load();assert.equal(h.reads.length,1);change(h.context);gate.resolve([{id:'track-a'},{id:'track-b'}]);await pending;h.assertUnchanged();});
}
for(const [name,change]of [['recording starts',context=>context.capture={id:'new-recording'}],['permission request starts',context=>context.capturePending=true],['saving starts',context=>context.saving=true]]){
  test('load-project discards pending media read when '+name,async()=>{const gate=deferred(),h=harness({gate}),pending=h.load();change(h.context);gate.resolve([{id:'track-a'},{id:'track-b'}]);await pending;h.assertUnchanged();});
}
test('load-project ignores an unknown project without media or UI effects',async()=>{const h=harness();await h.load('missing-project');assert.equal(h.reads.length,0);h.assertUnchanged();});
test('load-project does not apply settings or imply missing media when storage read failed',async()=>{const h=harness({readError:true});await assert.rejects(h.load(),/音频读取失败/);h.assertUnchanged();});
test('load-project preserves settings when the actual media-store promise rejects',async()=>{const gate=deferred(),h=harness({gate}),pending=h.load(),rejected=assert.rejects(pending,/blocked transaction/);gate.reject(Error('blocked transaction'));await rejected;h.assertUnchanged();});
test('load-project applies saved parameters once and enables playback only with every referenced media present',async()=>{const h=harness();await h.load();assert.deepEqual(h.reads,[{kind:'loop',options:{includeShadowed:true}}]);assert.deepEqual(plain(h.context.prefs),{bpm:96,barCount:4,unchanged:'keep'});assert.equal(h.persisted.length,1);assert.equal(h.modals.length,1);assert.match(h.modals[0],/所有轨道音频均已.*找到/);assert.match(h.modals[0],/&lt;QA violin&gt;/);assert.equal(h.buttons[0].action,'play-project');assert.doesNotMatch(h.buttons[0].attributes,/disabled/);assert.deepEqual(h.project.trackIds,['track-a','track-b']);});
test('load-project identifies missing media and disables the real playback button',async()=>{const h=harness({rows:[{id:'track-a'}]});await h.load();assert.equal(h.modals.length,1);assert.match(h.modals[0],/1 条媒体缺失/);assert.match(h.modals[0],/工程只有引用，没有云端音频/);assert.match(h.buttons[0].attributes,/disabled/);assert.equal(h.persisted.length,1);assert.deepEqual(h.project.trackIds,['track-a','track-b'],'missing references are retained, not replaced with fake media');});
