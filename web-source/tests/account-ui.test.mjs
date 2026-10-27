import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/account.js',import.meta.url),'utf8');
const context={module:{exports:{}}};vm.runInNewContext(source,context);const api=context.module.exports;
const config={ok:true,schemaVersion:1,identityAuthority:'sites',providers:[{id:'chatgpt',configured:true,available:true},{id:'google',configured:false,available:false}]};
const signed={ok:true,authenticated:true,user:{id:'site:user:1',displayName:'A violin player'}};
const anonymous={ok:true,authenticated:false,user:null};
const turn=()=>new Promise(setImmediate);
function harness(options={}){
 const requests=[],events=[],storage=new Map(Object.entries(options.storage||{})),timers=new Map(),children=[];let timerId=0,nextSession=options.session||anonymous,nextConfig=config;
 const doc={activeElement:null,body:{appendChild(node){children.push(node);node.ownerDocument=doc;}},createElement:tag=>new Node(tag)};
 class Node{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.handlers=new Map();this.nodes=[];this.open=false;this.dataset={};this.disabled=false;this.attributes={};this._html='';this.scrollTop=0;}
  set innerHTML(value){this._html=value;this.nodes=[];for(const match of value.matchAll(/<(button|a)\b([^>]+)>([\s\S]*?)<\/(?:button|a)>/g)){const [,tag,attrs]=match,node=new Node(tag),action=attrs.match(/data-account-action="([^"]+)"/),provider=attrs.match(/data-account-provider="([^"]+)"/),href=attrs.match(/href="([^"]*)"/);node.disabled=/\sdisabled(?:\s|$)/.test(attrs);if(action)node.dataset.accountAction=action[1];if(provider)node.dataset.accountProvider=provider[1];if(href)node.href=href[1];node.parentNode=this;this.nodes.push(node);}}
  get innerHTML(){return this._html;}
  addEventListener(name,handler){this.handlers.set(name,handler);}
  removeEventListener(name,handler){if(this.handlers.get(name)===handler)this.handlers.delete(name);}
  setAttribute(name,value){this.attributes[name]=value;if(name==='open')this.open=true;}
  removeAttribute(name){delete this.attributes[name];if(name==='open')this.open=false;}
  querySelector(selector){const action=selector.match(/data-account-action="?([^"\]]+)/),provider=selector.match(/data-account-provider="?([^"\]]+)/);return this.nodes.find(node=>action?node.dataset.accountAction===action[1]:provider?node.dataset.accountProvider===provider[1]:false)||null;}
  querySelectorAll(){return this.nodes.filter(node=>!node.disabled&&(node.tagName==='BUTTON'||node.href));}
  contains(node){return node===this||this.nodes.includes(node);}
  focus(){doc.activeElement=this;this.focused=(this.focused||0)+1;}
  showModal(){this.open=true;}
  close(){this.open=false;this.handlers.get('close')?.();}
  remove(){this.removed=true;const index=children.indexOf(this);if(index>=0)children.splice(index,1);}
  closest(){return this;}
 }
 const env={document:doc,AbortController,location:{pathname:'/studio',search:'?v=test',hash:'#practice'},localStorage:{getItem(key){if(options.storageDenied)throw Error('blocked');return storage.get(key)||null;},setItem(key,value){if(options.storageDenied)throw Error('blocked');storage.set(key,value);}},setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},async fetch(path,settings){requests.push({path,settings});if(options.deferred)return new Promise(resolve=>events.push({path,resolve}));if(options.networkError)throw Error('offline');return {ok:!options.httpError,json:async()=>path.endsWith('config')?nextConfig:nextSession};}};
 if(options.noFetch)delete env.fetch;
 const changes=[],host=new Node(),opener=new Node('button');opener.focus();let lang=options.lang||'en';
 const account=api.createAccount({environment:env,getContext:()=>({lang,brand:options.brand||'Silvio'}),onChange:state=>changes.push(state)});
 const dialog=()=>children.at(-1);
 function event(target,extra={}){return {target,prevented:false,preventDefault(){this.prevented=true;},...extra};}
 function click(action,node=dialog()){const button=node.querySelector(`[data-account-action="${action}"]`);assert(button,`missing ${action}`);const e=event(button);node.handlers.get('click')?.(e);return e;}
 function key(value,shiftKey=false){const e=event(dialog(),{key:value,shiftKey});dialog().handlers.get('keydown')?.(e);return e;}
 function resolveRequests(session=nextSession,conf=nextConfig){for(const request of events.splice(0))request.resolve({ok:true,json:async()=>request.path.endsWith('config')?conf:session});}
 return {account,env,doc,host,requests,events,storage,timers,children,changes,opener,dialog,click,key,resolveRequests,setSession(value){nextSession=value;},setConfig(value){nextConfig=value;},setLang(value){lang=value;}};
}
test('default guest has no network, redirect, account obligation or password fields',()=>{
 const h=harness();assert.equal(h.account.state().mode,'guest');assert.equal(h.account.choiceMade(),false);h.account.mount(h.host);assert.equal(h.requests.length,0);assert.match(h.host.innerHTML,/Make music without signing up/);assert.doesNotMatch(h.host.innerHTML,/<input|password/i);assert.equal(h.account.state().authenticated,false);h.account.dispose();
});
test('hosted identity alone does not opt the app out of guest mode',async()=>{
 const h=harness({session:signed});await h.account.refresh();assert.equal(h.account.state().verified,true);assert.equal(h.account.state().mode,'guest');assert.equal(h.account.state().user,null);assert.equal(h.account.choiceMade(),false);assert.equal(h.requests.length,2);h.account.dispose();
});
test('explicit account activation rechecks server identity, persists only preference and signals continuation once',async()=>{
 const h=harness({session:signed});let count=0;h.account.open({onContinue:()=>count++});await h.account.refresh();const old=h.requests.length;assert.equal(await h.account.useVerified(),true);assert.equal(h.requests.length,old+2);assert.equal(h.account.state().mode,'signed-in');assert.equal(h.account.state().user.id,signed.user.id);assert.equal(h.storage.get(api.STORAGE_KEY),'account');assert.equal(h.storage.size,1);assert.equal(h.account.isOpen(),false);assert.equal(count,1);h.account.close();assert.equal(count,1);h.account.dispose();
});
test('local account preference cannot impersonate a signed-in user',async()=>{
 const h=harness({storage:{[api.STORAGE_KEY]:'account'},session:anonymous});await h.account.refresh();assert.equal(h.account.state().mode,'guest');assert.equal(h.account.state().authenticated,false);assert.equal(h.account.state().user,null);assert.equal(await h.account.useVerified(),false);assert.equal(h.account.state().mode,'guest');h.account.dispose();
});
test('server revocation on account activation never enables community publication',async()=>{
 const h=harness({session:signed});h.account.open();await h.account.refresh();h.setSession(anonymous);assert.equal(await h.account.useVerified(),false);assert.equal(h.account.choiceMade(),false);assert.equal(h.account.state().mode,'guest');assert.equal(h.account.isOpen(),true);assert.equal(h.account.state().error,true);h.account.dispose();
});
for(const method of ['guest','close','escape','cancel','native'])test(`${method} completes optional welcome exactly once and remembers guest before callback`,async()=>{
 const h=harness({deferred:true});const completed=[];h.account.open({onContinue:state=>completed.push({state,made:h.account.choiceMade()})});await turn();if(method==='guest')h.click('guest');if(method==='close')h.click('close');if(method==='escape')assert(h.key('Escape').prevented);if(method==='cancel'){const e={preventDefault(){}};h.dialog().handlers.get('cancel')(e);}if(method==='native')h.dialog().close();assert.equal(h.account.isOpen(),false);assert.equal(h.account.choiceMade(),true);assert.equal(h.storage.get(api.STORAGE_KEY),'guest');assert.equal(completed.length,1);assert.equal(completed[0].made,true);assert.equal(completed[0].state.mode,'guest');h.resolveRequests(signed);await h.account.refresh();assert.equal(h.account.isOpen(),false);assert.equal(h.account.state().mode,'guest');assert.equal(completed.length,1);h.account.dispose();
});
test('guest preference restores without another onboarding prompt and changing account mode retains unrelated data',async()=>{
 const saved={'recording:take':'untouched','sv-practice-history':'[]',[api.STORAGE_KEY]:'guest'},h=harness({storage:saved,session:signed});assert.equal(h.account.choiceMade(),true);await h.account.refresh();assert.equal(h.account.state().mode,'guest');await h.account.useVerified();assert.equal(h.account.state().mode,'signed-in');h.account.continueGuest();assert.equal(h.account.state().mode,'guest');assert.equal(h.storage.get('recording:take'),'untouched');assert.equal(h.storage.get('sv-practice-history'),'[]');assert.equal(h.storage.size,3);h.account.dispose();
});
test('storage denial preserves usable guest and account choices for this visit',async()=>{
 const h=harness({storageDenied:true,session:signed});h.account.open();await h.account.refresh();h.account.continueGuest();assert.equal(h.account.choiceMade(),true);assert.equal(h.account.state().persisted,false);assert.equal(h.account.state().mode,'guest');assert.equal(await h.account.useVerified(),true);assert.equal(h.account.state().mode,'signed-in');assert.equal(h.account.state().persisted,false);assert.match(h.account.renderCard(),/saved for this visit only/);h.account.dispose();
});
test('future Google Apple Microsoft and email entries never navigate, request credentials or call providers',async()=>{
 const h=harness();h.account.open();await h.account.refresh();for(const provider of api.PROVIDERS){const node=h.dialog().querySelector(`[data-account-provider="${provider}"]`);assert.equal(node.disabled,true);assert.equal(node.href,undefined);h.dialog().handlers.get('click')({target:node});}assert.equal(h.requests.length,2);assert(h.requests.every(req=>req.path.startsWith('/api/auth/')));assert.doesNotMatch(h.dialog().innerHTML,/<input|type="password"|accounts\.google|appleid\.apple|login\.microsoft/i);assert.match(h.dialog().innerHTML,/Not configured/);h.account.dispose();
});
test('native sign-in remains a top-level anchor with safe current return path and preference only',async()=>{
 const h=harness();h.account.open();await h.account.refresh();assert.equal(h.account.signInPath(),'/signin-with-chatgpt?return_to=%2Fstudio%3Fv%3Dtest%23practice');assert.match(h.dialog().innerHTML,/target="_top"/);const click=h.click('signin');assert.equal(click.prevented,false);assert.equal(h.storage.get(api.STORAGE_KEY),'account');assert.equal(h.account.state().mode,'guest');assert.equal(h.requests.length,2);h.account.dispose();
});
test('current onboarding can return to learn and unsafe cross-origin return targets are rejected',async()=>{
 const h=harness();h.account.open({returnTo:'/studio?v=18#learn'});await h.account.refresh();assert.equal(h.account.signInPath(),'/signin-with-chatgpt?return_to=%2Fstudio%3Fv%3D18%23learn');for(const value of ['https://evil.test','//evil.test','/\\evil.test','/%2fexample.test','/%5cevil.test','/x%0aLocation:bad','/%malformed'])assert.equal(api.safeReturnPath(value),'/');assert.equal(api.safeReturnPath('/app?x=1#practice'),'/app?x=1#practice');h.account.dispose();
});
test('network failure removes prior signed-in claims and leaves guest continuation enabled',async()=>{
 const h=harness({session:signed,storage:{[api.STORAGE_KEY]:'account'}});await h.account.refresh();assert.equal(h.account.state().mode,'signed-in');h.env.fetch=async()=>{throw Error('offline');};await h.account.refresh();assert.equal(h.account.state().mode,'guest');assert.equal(h.account.state().user,null);assert.equal(h.account.state().error,true);h.account.open();assert.equal(h.dialog().querySelector('[data-account-action="guest"]').disabled,false);h.account.continueGuest();assert.equal(h.account.isOpen(),false);h.account.dispose();
});
test('concurrent verification is shared, bounded and a timeout cannot preserve identity',async()=>{
 const h=harness({deferred:true,storage:{[api.STORAGE_KEY]:'account'}});const first=h.account.refresh(),second=h.account.refresh();await turn();assert.equal(h.requests.length,2);assert.equal(h.timers.size,1);const timer=[...h.timers.values()][0];assert.equal(timer.delay,8000);timer.fn();await Promise.all([first,second]);assert.equal(h.account.state().mode,'guest');assert.equal(h.account.state().error,true);assert.equal(h.timers.size,0);h.resolveRequests(signed);await turn();assert.equal(h.account.state().mode,'guest');h.account.dispose();
});
test('missing fetch does not leave a permanently stuck shared request and repeated retries finish',async()=>{
 const h=harness({noFetch:true});await h.account.refresh();assert.equal(h.account.state().error,true);assert.equal(h.account.state().loading,false);await h.account.refresh();assert.equal(h.account.state().loading,false);h.account.continueGuest();assert.equal(h.account.choiceMade(),true);h.account.dispose();
});
test('dispose cancels pending transport deadline and late responses never emit or recreate dialog',async()=>{
 const h=harness({deferred:true});h.account.open();const pending=h.account.refresh();await turn();assert.equal(h.timers.size,1);const changes=h.changes.length;h.account.dispose();await pending;assert.equal(h.timers.size,0);assert.equal(h.children.length,0);h.resolveRequests(signed);await turn();assert.equal(h.changes.length,changes);assert.equal(h.account.open(),false);assert.equal(h.account.isOpen(),false);
});
test('dialog traps keyboard focus, Escape returns focus and repeated opening creates only one dialog',async()=>{
 const h=harness();h.account.open();await h.account.refresh();const dialog=h.dialog(),nodes=dialog.querySelectorAll();assert.equal(h.doc.activeElement.dataset.accountAction,'guest');nodes.at(-1).focus();assert.equal(h.key('Tab').prevented,true);assert.equal(h.doc.activeElement,nodes[0]);nodes[0].focus();assert.equal(h.key('Tab',true).prevented,true);assert.equal(h.doc.activeElement,nodes.at(-1));h.account.open();assert.equal(h.children.length,1);h.key('Escape');assert.equal(h.doc.activeElement,h.opener);h.account.dispose();
});
test('onboarding continuation can set focus after dismissal without the dialog taking it back',async()=>{
 const h=harness();h.account.open({onContinue:()=>h.host.focus()});await h.account.refresh();h.account.continueGuest();assert.equal(h.doc.activeElement,h.host);h.account.dispose();
});
test('all four languages explain optional login, reserved providers and guest controls while escaping display data',async()=>{
 const words={zh:'以访客身份继续',en:'Continue as guest',ja:'ゲストとして続ける',de:'Als Gast fortfahren'};
 for(const [lang,word]of Object.entries(words)){const h=harness({lang,brand:'<img src=x onerror=alert(1)>',session:{...signed,user:{id:'real',displayName:'<script>steal()</script>'}}});h.account.open();await h.account.refresh();assert.equal(h.dialog().lang,lang);assert(h.dialog().innerHTML.includes(word));assert.doesNotMatch(h.dialog().innerHTML,/<script>|<img src=x/);assert.match(h.dialog().innerHTML,/&lt;script&gt;/);assert.equal(h.dialog().querySelectorAll().filter(node=>node.dataset.accountProvider).length,0);h.account.dispose();}
});
test('card lifecycle attaches one action handler and a verified account can return to guest without sign-out navigation',async()=>{
 const h=harness({session:signed});h.account.mount(h.host);h.account.mount(h.host);assert.equal(h.host.handlers.size,1);await h.account.useVerified();assert.match(h.host.innerHTML,/A violin player/);assert.match(h.host.innerHTML,/Switch to guest/);h.click('guest',h.host);assert.equal(h.account.state().mode,'guest');assert.doesNotMatch(h.host.innerHTML,/A violin player/);h.account.unmount();assert.equal(h.host.handlers.size,0);h.account.dispose();
});
test('malformed identities and untrusted provider configuration cannot enable login or publication',async()=>{
 for(const user of [null,{id:''},{id:2},{displayName:'Only a label'}])assert.equal(api.normaliseSession({ok:true,authenticated:true,user}).authenticated,false);
 const h=harness();h.setConfig({ok:true,identityAuthority:'external',providers:[{id:'chatgpt',configured:true,available:true,signInPath:'https://evil.test'}]});h.account.open();await h.account.refresh();assert.equal(h.account.state().error,true);assert.equal(h.account.state().mode,'guest');assert.equal(h.dialog().querySelector('[data-account-action="signin"]'),null);h.account.dispose();
});
