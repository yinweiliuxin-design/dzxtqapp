'use strict';
// Applies catalog/stock-corrections-*.json to dist/seed.js. Safe to run more than once.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),file=path.join(root,'dist/seed.js'),context={window:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
const model={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'dist/score-model.js'),'utf8'),{module:model});
const seed=context.window.SV_SEED,corrections=JSON.parse(fs.readFileSync(path.join(root,'catalog/stock-corrections-20261103.json'),'utf8'));
if(seed.schema!==11||corrections.correctionVersion!==1)throw Error('Unexpected catalog schema');
const changed=[];
for(const entry of corrections.songs){
  const song=seed.songs.find(s=>s.id===entry.id);if(!song)throw Error('Missing song '+entry.id);
  const before=JSON.stringify(song);
  if(entry.transpose){
    if(!song.practice)throw Error('Transpose needs existing practice metadata '+entry.id);
    if(song.practice.adaptation!==entry.adaptation){
      song.melody=song.melody.split(/\s+/).map(token=>{const [pitch,beats]=token.split(':');return (pitch==='R'?'R':model.exports.transposeName(pitch,entry.transpose))+':'+beats;}).join(' ');
      song.practice.adaptation=entry.adaptation;
    }
  }
  if(entry.melody)song.melody=entry.melody;
  if(entry.meter){
    const practice=song.practice||{kind:'excerpt',label:corrections.stockLabel};
    practice.meter=entry.meter;
    if(entry.pickup)practice.pickup=entry.pickup;else delete practice.pickup;
    song.practice=practice;
  }
  if(entry.withheld)song.withheld=entry.withheld;else delete song.withheld;
  if(JSON.stringify(song)!==before)changed.push(entry.id);
}
fs.writeFileSync(file,'window.SV_SEED='+JSON.stringify(seed)+';\n');
console.log(JSON.stringify({changed:changed.length,ids:changed}));
