import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Runs the shipped viewport controller against browser boundary fixtures.
// This verifies the controller's decisions, not Safari's physical keyboard behavior.
const source=readFileSync(new URL('../dist/viewport.js',import.meta.url),'utf8');
function target(){
  const listeners=new Map();
  return {listeners,addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
    dispatch(name){for(const fn of listeners.get(name)||[])fn({type:name});}};
}
function element(tag,attributes={}){
  return {tag,attributes,matches(query){
    // Small independent matcher for tag, attribute and :not(attribute) selectors.
    return query.split(',').some(part=>{
      const excluded=[...part.matchAll(/:not\(\[([^=\]]+)=([^\]]+)\]\)/g)];
      if(excluded.some(([,key,value])=>attributes[key]===value))return false;
      const positive=part.replace(/:not\([^)]*\)/g,''),tagName=positive.match(/^[a-z]+/i)?.[0];
      if(tagName&&tagName!==tag)return false;
      return [...positive.matchAll(/\[([^=\]]+)=([^\]]+)\]/g)].every(([,key,value])=>attributes[key]===value);
    });
  }};
}
function harness(options={}){
  const properties=new Map(),writes=[],frames=new Map(),observers=[],effects=[];
  let nextFrame=1;
  const document={...target(),documentElement:{dataset:{},style:{setProperty(name,value){properties.set(name,value);writes.push([name,value]);}}},activeElement:element('body')};
  const header={height:options.headerHeight??68.2,getBoundingClientRect(){return {height:this.height};}};
  const nav={height:options.navHeight??83.4,display:options.navDisplay??'grid',getBoundingClientRect(){return {height:this.height};}};
  document.querySelector=selector=>selector==='.app-header'?(options.noHeader?null:header):selector==='.bottom-nav'?(options.noNav?null:nav):null;
  document.querySelectorAll=()=>[...(options.noHeader?[]:[header]),...(options.noNav?[]:[nav])];
  const viewport=options.noVisualViewport?undefined:{...target(),height:options.height??956,scale:1,offsetTop:0};
  const root={...target(),document,innerHeight:options.innerHeight??956,visualViewport:viewport,
    getComputedStyle:el=>({display:el.display??'block'}),
    requestAnimationFrame(fn){const id=nextFrame++;frames.set(id,fn);return id;}};
  if(!options.noResizeObserver)root.ResizeObserver=class{
    constructor(callback){this.callback=callback;this.observed=[];observers.push(this);}
    observe(node){this.observed.push(node);}
  };
  const forbidden=name=>{effects.push(name);throw Error('Unexpected browser side effect: '+name);};
  for(const name of ['fetch','localStorage','sessionStorage','navigator','AudioContext','setTimeout'])
    Object.defineProperty(root,name,{get(){return forbidden(name);}});
  const context={window:root,fetch:()=>forbidden('global fetch'),setTimeout:()=>forbidden('global timer')};
  vm.runInNewContext(source,context,{filename:'viewport.js'});
  return {root,document,viewport,header,nav,properties,writes,frames,observers,effects,
    flush(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();},
    focus(el){document.activeElement=el;document.dispatch('focusin');},
    blur(){document.activeElement=element('body');document.dispatch('focusout');},
    updateViewport(values){Object.assign(viewport,values);viewport.dispatch('resize');},
    property(name){return properties.get(name);}};
}

test('initial viewport and measured bars use real element heights without browser side effects',()=>{
  const h=harness({height:955.6,headerHeight:68.2,navHeight:83.4});
  assert.equal(h.property('--sv-visible-height'),'956px');
  assert.equal(h.property('--sv-header-height'),'69px');
  assert.equal(h.property('--sv-nav-height'),'84px');
  assert.equal(h.document.documentElement.dataset.keyboard,'closed');
  assert.deepEqual(h.observers[0].observed,[h.header,h.nav]);
  assert.equal(h.frames.size,0);
  assert.deepEqual(h.effects,[]);
});

test('resize, scroll, focus and observer bursts coalesce and measure the final layout',()=>{
  const h=harness();const initialWrites=h.writes.length;
  h.root.dispatch('resize');h.viewport.dispatch('scroll');h.document.dispatch('focusin');h.observers[0].callback();
  h.header.height=91.8;h.nav.height=105.1;h.viewport.height=819.7;
  assert.equal(h.frames.size,1);
  assert.equal(h.writes.length,initialWrites,'No layout writes happen before the animation frame');
  h.flush();
  assert.equal(h.property('--sv-header-height'),'92px');
  assert.equal(h.property('--sv-nav-height'),'106px');
  assert.equal(h.property('--sv-visible-height'),'820px');
  assert.equal(h.writes.length,initialWrites+3);
  h.observers[0].callback();assert.equal(h.frames.size,1,'A later resize is not lost');h.flush();
});

test('focused text fields hide navigation only during significant unzoomed viewport occlusion',()=>{
  const h=harness();h.focus(element('input',{type:'text'}));h.flush();
  assert.equal(h.document.documentElement.dataset.keyboard,'closed');
  h.updateViewport({height:600});h.flush();
  assert.equal(h.document.documentElement.dataset.keyboard,'open');
  h.blur();h.flush();assert.equal(h.document.documentElement.dataset.keyboard,'closed');
  h.focus(element('textarea'));h.flush();assert.equal(h.document.documentElement.dataset.keyboard,'open');
  h.updateViewport({height:956});h.flush();assert.equal(h.document.documentElement.dataset.keyboard,'closed');
  assert.deepEqual(h.effects,[]);
});

test('pinch zoom remains distinguishable from keyboard occlusion',()=>{
  const h=harness();h.focus(element('input',{type:'email'}));
  h.updateViewport({height:460,scale:2});h.flush();
  assert.equal(h.document.documentElement.dataset.keyboard,'closed');
  assert.equal(h.property('--sv-visible-height'),'460px','Dialog bounds still follow the visual viewport');
  h.updateViewport({scale:1});h.flush();assert.equal(h.document.documentElement.dataset.keyboard,'open');
});

test('viewport offset and small browser chrome changes do not open the keyboard state',()=>{
  const h=harness();h.focus(element('input',{type:'search'}));
  h.updateViewport({height:860,offsetTop:0});h.flush();
  assert.equal(h.document.documentElement.dataset.keyboard,'closed');
  h.updateViewport({height:700,offsetTop:150});h.flush();
  assert.equal(h.document.documentElement.dataset.keyboard,'closed','Scrolled visual viewport offset must be discounted');
  h.updateViewport({offsetTop:0});h.flush();assert.equal(h.document.documentElement.dataset.keyboard,'open');
});

test('range, checkbox, radio, buttons and selects do not masquerade as a text keyboard',()=>{
  const h=harness();h.updateViewport({height:500});
  for(const el of [element('input',{type:'range'}),element('input',{type:'checkbox'}),element('input',{type:'radio'}),element('input',{type:'button'}),element('input',{type:'submit'}),element('button'),element('select')]){
    h.focus(el);h.flush();assert.equal(h.document.documentElement.dataset.keyboard,'closed',JSON.stringify(el.attributes));
  }
  h.focus(element('div',{contenteditable:'true'}));h.flush();
  assert.equal(h.document.documentElement.dataset.keyboard,'open');
});

test('desktop hidden navigation and missing shell elements yield zero reserved space',()=>{
  const desktop=harness({navDisplay:'none'});assert.equal(desktop.property('--sv-nav-height'),'0px');
  desktop.nav.display='grid';desktop.nav.height=77;desktop.observers[0].callback();desktop.flush();
  assert.equal(desktop.property('--sv-nav-height'),'77px');
  const empty=harness({noNav:true,noHeader:true});
  assert.equal(empty.property('--sv-nav-height'),'0px');assert.equal(empty.property('--sv-header-height'),'0px');
  assert.deepEqual(empty.observers[0].observed,[]);
});

test('browsers without optional viewport or observer APIs keep usable resize behavior',()=>{
  const h=harness({noVisualViewport:true,noResizeObserver:true,innerHeight:800});
  assert.equal(h.property('--sv-visible-height'),'800px');
  h.root.innerHeight=640;h.header.height=60;h.nav.height=76;h.root.dispatch('resize');h.flush();
  assert.equal(h.property('--sv-visible-height'),'640px');
  assert.equal(h.property('--sv-header-height'),'60px');assert.equal(h.property('--sv-nav-height'),'76px');
  h.focus(element('input',{type:'text'}));h.flush();assert.equal(h.document.documentElement.dataset.keyboard,'closed');
  assert.deepEqual(h.effects,[]);
});

test('non-document host exits without attempting subscriptions or side effects',()=>{
  vm.runInNewContext(source,{window:{addEventListener(){assert.fail('Must not subscribe without document');}}});
});
