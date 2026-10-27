import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture({failAnalyser=false}={}){
  const contexts=[],timers=new Map();let timerId=0;
  class Node{
    constructor(context,type){this.context=context;this.type=type;this.connections=new Set();this.disconnects=0;context.nodes.push(this);}
    connect(target){this.connections.add(target);return target;}
    disconnect(){this.disconnects++;this.connections.clear();}
    getFloatTimeDomainData(data){for(let i=0;i<data.length;i++)data[i]=.2*Math.sin(2*Math.PI*440*i/this.context.sampleRate);}
  }
  class Context{
    constructor(){this.state='suspended';this.sampleRate=8000;this.currentTime=2;this.nodes=[];this.destination={kind:'speaker'};this.resumeCalls=0;this.closeCalls=0;contexts.push(this);}
    createMediaStreamSource(stream){const source=new Node(this,'source');source.stream=stream;return source;}
    createAnalyser(){if(failAnalyser)throw Error('analyser unavailable');return new Node(this,'analyser');}
    resume(){this.resumeCalls++;this.state='running';return Promise.resolve();}
    close(){this.closeCalls++;this.state='closed';return Promise.resolve();}
  }
  const module={exports:{}},sandbox={module,window:{AudioContext:Context},setInterval(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearInterval(id){timers.delete(id);}};
  vm.runInNewContext(fs.readFileSync(new URL('../dist/pitch.js',import.meta.url),'utf8'),sandbox);
  const track={stops:0,stop(){this.stops++;}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  return {pitch:module.exports,contexts,Context,timers,stream,track,tick(){for(const {fn} of [...timers.values()])fn();}};
}

test('shared pitch monitor constructs no second context, never resumes or connects the microphone to speakers',()=>{
  const h=fixture(),context=new h.Context();context.state='running';const observations=[];
  const monitor=h.pitch.monitor(h.stream,(frequency,meta)=>observations.push({frequency,meta}),{context});
  assert.equal(h.contexts.length,1);assert.equal(monitor.context,context);assert.equal(context.resumeCalls,0);assert.equal(h.timers.size,1);
  const source=context.nodes.find(node=>node.type==='source'),analyser=context.nodes.find(node=>node.type==='analyser');assert.deepEqual([...source.connections],[analyser]);assert.equal(analyser.connections.size,0);assert.equal(source.connections.has(context.destination),false);
  h.tick();assert.equal(observations.length,1);assert.ok(Math.abs(observations[0].frequency-440)<2);assert.equal(observations[0].meta.valid,true);assert.equal(observations[0].meta.audioTime,2);
  monitor.stop();monitor.stop();assert.equal(context.closeCalls,0);assert.equal(context.state,'running');assert.equal(context.resumeCalls,0);assert.equal(source.disconnects,1);assert.equal(analyser.disconnects,1);assert.equal(h.timers.size,0);assert.equal(h.track.stops,0);h.tick();assert.equal(observations.length,1);
});

test('legacy pitch monitor without options owns, resumes and closes its independent context exactly once',()=>{
  const h=fixture(),monitor=h.pitch.monitor(h.stream,()=>{}),context=h.contexts[0];assert.equal(h.contexts.length,1);assert.equal(context.resumeCalls,1);assert.equal(context.state,'running');assert.equal(h.timers.size,1);monitor.stop();monitor.stop();assert.equal(context.closeCalls,1);assert.equal(context.state,'closed');assert.equal(h.timers.size,0);assert.ok(context.nodes.every(node=>node.connections.size===0));
});

test('suspended or closed borrowed contexts reject before allocating nodes and are never resumed or closed by analysis',()=>{
  for(const state of ['suspended','closed','interrupted']){const h=fixture(),context=new h.Context();context.state=state;assert.throws(()=>h.pitch.monitor(h.stream,()=>{},{context}),/must be running/);assert.equal(context.nodes.length,0);assert.equal(context.resumeCalls,0);assert.equal(context.closeCalls,0);assert.equal(h.timers.size,0);}
});

test('shared monitor construction failure disconnects partial analysis nodes while preserving its running owner',()=>{
  const h=fixture({failAnalyser:true}),context=new h.Context();context.state='running';assert.throws(()=>h.pitch.monitor(h.stream,()=>{},{context}),/analyser unavailable/);assert.equal(context.nodes.length,1);assert.equal(context.nodes[0].disconnects,1);assert.equal(context.closeCalls,0);assert.equal(context.state,'running');assert.equal(h.timers.size,0);assert.equal(h.track.stops,0);
});

test('legacy monitor construction failure closes its own partially initialized context',()=>{
  const h=fixture({failAnalyser:true});assert.throws(()=>h.pitch.monitor(h.stream,()=>{}),/analyser unavailable/);const context=h.contexts[0];assert.equal(context.closeCalls,1);assert.equal(context.nodes[0].disconnects,1);assert.equal(h.timers.size,0);
});
