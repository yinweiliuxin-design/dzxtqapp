import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const module={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../dist/audio-engine.js',import.meta.url),'utf8'),{module,globalThis:{}});
const time=module.exports.audibleContextTime;
test('visual clock follows output timestamp rather than rendering or double subtracting latency',()=>{
 const c={currentTime:10,baseLatency:.01,outputLatency:.2,getOutputTimestamp:()=>({contextTime:9.75,performanceTime:1000})};assert.equal(time(c,1050),9.8);
});
test('timestamp is bounded at render clock and pre-start position never becomes negative',()=>{
 assert.equal(time({currentTime:2,getOutputTimestamp:()=>({contextTime:2.1,performanceTime:1000})},1020),2);
 assert.equal(time({currentTime:.01,baseLatency:.1,outputLatency:.2}),0);
});
test('unsupported, stale, zero and invalid timestamps use finite latency fallback',()=>{
 for(const getOutputTimestamp of [undefined,()=>{throw Error()},()=>({contextTime:0,performanceTime:0}),()=>({contextTime:1,performanceTime:5}),()=>({contextTime:NaN,performanceTime:1000})])assert.equal(time({currentTime:2,baseLatency:.02,outputLatency:.08,getOutputTimestamp},1010),1.9);
});
test('invalid latency data cannot generate NaN or an unbounded visual delay',()=>{
 assert.equal(time({currentTime:2,baseLatency:NaN,outputLatency:-1}),2);assert.equal(time({currentTime:2,outputLatency:900}),2);
});
