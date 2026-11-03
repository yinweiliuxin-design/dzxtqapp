import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Exercise the shipped files, not copies of them.
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const load=file=>{const module={exports:{}};vm.runInNewContext(read(file),{module});return module.exports;};
const model=load('dist/score-model.js'),tuner=load('dist/violin-tuner.js'),ui=load('dist/reliability-ui.js');
const seedBox={window:{}};vm.runInNewContext(read('dist/seed.js'),seedBox);const songs=seedBox.window.SV_SEED.songs;
const localeBox={};vm.runInNewContext(read('dist/i18n.js'),{window:localeBox});const L=localeBox.SVLocale;
const client=read('dist/client.js'),cjk=/[㐀-鿿]/;
const song=id=>songs.find(s=>s.id===id);
const names=s=>new Set(s.melody.split(/\s+/).map(t=>t.split(':')[0].replace(/-?\d+$/,'')).filter(n=>n!=='R'));

test('a pickup fills the end of bar 1 so later downbeats fall on bar lines',()=>{
  const score=model.createScore('D5:1 D5:1 B4:1 G4:1 A4:1 B4:1',{numerator:4,denominator:4,pickup:2});
  assert.equal(score.leadTicks,2*960);assert.equal(score.pickupTicks,2*960);
  assert.deepEqual([...score.events].map(n=>n.bar),[1,1,2,2,2,2]);
  assert.equal(score.events[2].startTick%score.ticksPerBar,0);
  const range=model.selectBars(score,1,0),plan=model.plan(range,60);
  assert.equal(range.startTick,score.leadTicks,'playback starts at the pickup, not with a silent bar');
  assert.equal(plan[0].start,0);assert.equal(plan[2].start,2);
  assert.equal(model.selectBars(score,2,2).events.length,4);
  for(const pickup of [0,4,undefined])assert.equal(model.createScore('A4:1',{numerator:4,denominator:4,pickup}).leadTicks,0);
  assert.throws(()=>model.createScore('A4:1',{pickup:-1}),/Invalid pickup/);
});

test('stock tunes carry their own meter and pickup, and their bars are complete',()=>{
  for(const s of songs){
    if(s.withheld)continue;
    assert.equal(s.practice?.kind,'excerpt',s.id);
    const [numerator,denominator]=s.practice.meter.split('/').map(Number);
    const score=model.createScore(s,{numerator,denominator,pickup:s.practice.pickup});
    if(s.catalogVersion!==2){const tail=score.totalTicks%score.ticksPerBar;assert.ok(tail===0||tail===score.leadTicks,s.id+' ends mid-bar');}
  }
  for(const id of ['S005','S010','S015','S017','S018'])assert.equal(song(id).practice.meter,'3/4',id);
  for(const id of ['S019','S024'])assert.equal(song(id).practice.meter,'6/8',id);
  assert.equal(song('S007').practice.pickup,2,'a gavotte starts on a half-bar upbeat');
  assert.equal(song('S012').withheld,'melody-unverified');
  execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/validate-catalog.cjs',import.meta.url))],{stdio:'ignore'});
});

test('corrected melodies, keys and spellings',()=>{
  assert.match(song('S003').melody,/^E5:1 C#5:1 C#5:2 D5:1 B4:1 B4:2 A4:1 B4:1 C#5:1 D5:1 E5:1 E5:1 E5:2 /,'Lightly Row');
  assert.match(song('S001').melody,/^A4:1 A4:1 E5:1 E5:1 F#5:1 F#5:1 E5:2/,'Twinkle starts on the open A string');
  const dMajor=new Set(['D','E','F#','G','A','B','C#']);
  for(const id of ['S002','S004','S060','S063'])for(const n of names(song(id)))assert.ok(dMajor.has(n),id+' uses '+n+' outside D major');
  assert.ok(names(song('S032')).has('Bb')&&!names(song('S032')).has('A#'));
  for(const n of ['A#','D#'])assert.ok(!names(song('S040')).has(n),'S040 '+n);
  assert.ok(names(song('S057')).has('F#')&&!names(song('S057')).has('Gb'));
  assert.ok(names(song('S018')).has('F')&&!names(song('S018')).has('F#'),'Scarborough Fair is Dorian');
  assert.match(song('S060').practice.adaptation,/移高大二度/);assert.match(song('S063').practice.adaptation,/移低小二度/);
});

test('withheld tunes are not offered, and old selections fall back to an available tune',()=>{
  assert.match(client,/function songAvailable\(s\)\{return !s\.withheld&&\(/);
  assert.match(client,/const song=\(\)=>svState\.songs\.find\(s=>s\.id===prefs\.song&&!s\.withheld\)\|\|svState\.songs\.find\(s=>!s\.withheld\)/);
  assert.match(client,/createScore\(song\(\),\{numerator,denominator,pickup:practicePickup\(song\(\)\)\}\)/);
});

test('an unsteady tuner reading is shown as approximate and never as in tune',()=>{
  let now=0;const model=tuner.create({now:()=>now});
  const s=model.update(439.4,{valid:true,confidence:.6,rms:.1,peak:.2,gate:.008});
  assert.equal(s.state,'uncertain');assert.equal(s.reliable,false);assert.equal(s.cents,null);assert.equal(s.frequency,439.4);
  now+=20;assert.equal(model.update(440,{valid:false,reason:'ambiguous-octave',rms:.1,gate:.008}).frequency,null,'octave ambiguity shows no number');
  const nodes={};const doc={getElementById:id=>(nodes[id]??={textContent:'',style:{},value:0}),querySelector:()=>null};
  ui.updateTuner(s,doc,'zh');
  assert.equal(nodes['tuner-hz'].textContent,'约 439.4 Hz · 读数不稳定，仅供参考');
  assert.equal(nodes['tuner-cents'].textContent,'—');assert.match(nodes['tuner-feedback'].textContent,/不要揉弦/);
  ui.updateTuner({...s,actualInputSettings:{sampleRate:48000,echoCancellation:false}},doc,'en');
  assert.equal(nodes['tuner-input-settings'].textContent,'Input status · Sample rate 48000 Hz · Echo cancellation off');
  assert.equal(ui.gateLabel(8),'−42 dB');assert.equal(ui.gateLabel(1),'−60 dB');
  const view=ui.tunerView({lang:'zh',a4:440,gate:8});
  assert.match(view,/−50 音分/);assert.match(view,/−42 dB/);assert.doesNotMatch(view,/输入状态 —/);
});

test('every language has the same tuner copy keys',()=>{
  const keys=lang=>Object.keys(ui.copy(lang)).sort();
  for(const lang of ['en','ja','de'])assert.deepEqual(keys(lang),keys('zh'),lang);
});

test('navigation kickers and literal T() labels are translated in every language',()=>{
  const kickers=[...client.matchAll(/\['[\w-]+','[^']+','[^']+','[^']+','[^']+','[^']+','[\w-]+','([A-Z][A-Z&.,·' ]{4,})'\]/g)].map(m=>m[1]);
  assert.ok(kickers.length>=15);
  for(const k of kickers){assert.match(L.text(k,'zh'),cjk,'zh kicker '+k);assert.notEqual(L.text(k,'ja'),k,'ja kicker '+k);}
  const labels=new Set([...client.matchAll(/\bT\('([^'\\]+)'\)/g)].map(m=>m[1]).filter(t=>cjk.test(t)));
  assert.ok(labels.size>=40);
  for(const t of labels){
    for(const lang of ['en','de'])assert.doesNotMatch(L.text(t,lang),cjk,lang+': '+t);
    if(t!=='拍')assert.notEqual(L.text(t,'ja'),t,'ja: '+t);
  }
});

test('visible version text comes from the release manifest',()=>{
  const release=JSON.parse(read('release.json'));
  assert.doesNotMatch(client,/' · V\d\d'/);assert.match(client,/window\.SVRelease\.label/);
  assert.match(read('dist/release.js'),new RegExp('"label":"'+release.label.replace('.','\\.')+'"'));
  const report=read('dist/reports/release-current.html');
  assert.match(report,/src="\.\.\/release\.js"/);assert.match(report,new RegExp(release.label.replace('.','\\.')));
  assert.doesNotMatch(client,/feasibility-20261015/);
});
