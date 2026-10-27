import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../dist/instrument-profile.js', import.meta.url), 'utf8');
const context = { module: { exports: {} } };
vm.runInNewContext(source, context);
const UI = context.module.exports;
const langs = ['zh','en','ja','de'];
const allRoutes = ['home','library','practice','studio','performance','midi','tones','tuner','metronome','device','learn','lessons','community','shop','profile'];
const routesIn = html => [...html.matchAll(/data-go="([^"]+)"/g)].map(x => x[1]);

test('an explicit versioned selection is required, including after legacy preference migration', () => {
  for (const value of ['electric','acoustic']) {
    assert.equal(UI.valid(value), true);
    assert.equal(UI.hasChoice({ instrument:value, instrumentChoiceVersion:1 }), true);
    for (const version of [undefined,0,'1',true,2]) assert.equal(UI.hasChoice({ instrument:value, instrumentChoiceVersion:version }), false);
  }
  for (const value of [null,undefined,{},[],true,'Electric','piano','',1,'acoustic<script>']) {
    assert.equal(UI.valid(value), false);
    assert.equal(UI.hasChoice({ instrument:value, instrumentChoiceVersion:1 }), false);
  }
  for (const prefs of [null,undefined,false,'electric',{}, { preset:'Acoustic' }, { instrumentChoiceVersion:1 }]) assert.equal(UI.hasChoice(prefs), false);
});

test('initial chooser has no implicit choice, cannot continue, and cannot cancel required setup', () => {
  const html=UI.chooser({lang:'en',required:true});
  assert.equal((html.match(/aria-pressed="false"/g)||[]).length,2);
  assert.match(html,/data-action="commit-instrument" disabled/);
  assert.doesNotMatch(html,/data-action="cancel-instrument"|aria-pressed="true"/);
  assert.match(html,/role="group"/);
  assert.match(html,/No sign-in required/);
});

test('choice and confirmation remain separate and re-selection can be cancelled', () => {
  for(const selected of ['electric','acoustic']) {
    const html=UI.chooser({lang:'en',selected,required:false});
    assert.match(html,new RegExp('data-instrument="'+selected+'" aria-pressed="true"'));
    assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
    assert.match(html,/data-action="cancel-instrument"/);
    assert.doesNotMatch(html,/data-action="commit-instrument" disabled/);
    assert.match(html,/Changing instruments keeps your favourites/);
  }
  const forged=UI.chooser({lang:'<script>',selected:'electric" onclick="bad',required:false});
  assert.match(forged,/data-action="commit-instrument" disabled/);
  assert.doesNotMatch(forged,/<script>|onclick=|data-instrument="electric" onclick/);
});

test('instrument routes preserve all tools while acoustic practice is prioritised', () => {
  assert.deepEqual(Array.from(UI.navIds('electric')),allRoutes);
  const acoustic=Array.from(UI.navIds('acoustic'));
  assert.equal(new Set(acoustic).size,15);
  assert.deepEqual(acoustic.slice().sort(),allRoutes.slice().sort());
  assert.deepEqual(acoustic.slice(-3),['performance','midi','tones']);
  assert.ok(acoustic.indexOf('tuner') < acoustic.indexOf('device'));
  assert.deepEqual(routesIn(UI.homePanel({type:'acoustic'})),['tuner','practice','studio']);
  assert.deepEqual(routesIn(UI.homePanel({type:'electric'})),['device','tones','midi']);
  const modified=UI.navIds('acoustic');modified.push('admin');
  assert.equal(UI.navIds('acoustic').length,15);
  assert.deepEqual(Array.from(UI.navIds('invalid')),allRoutes);
});

test('all user facing panels have four complete dictionaries and explicit translation boundaries', () => {
  const keys=['chooseTitle','chooseDescription','electric','acoustic','change','continue','cancel','saved','memoryOnly','busy','inputs','creative','shared','current','selectionRequired'];
  for(const lang of langs) {
    for(const key of keys) assert.ok(UI.text(lang,key),lang+':'+key);
    for(const html of [UI.chooser({lang}),UI.homePanel({lang,type:'acoustic'}),UI.settingsPanel({lang,type:'electric'}),UI.acousticInputs({lang}),UI.pageHint({lang,type:'electric',page:'practice'})]) {
      assert.match(html,/^<(?:section|aside)[^>]+data-i18n-ignore/);
      assert.doesNotMatch(html,/>undefined<|>null<|<script|onerror=/);
    }
    assert.ok(UI.chooser({lang}).includes(UI.text(lang,'chooseTitle')));
    assert.ok(UI.settingsPanel({lang,type:'acoustic'}).includes(UI.text(lang,'acoustic')));
    assert.ok(UI.acousticInputs({lang}).includes(UI.text(lang,'inputs')));
  }
  assert.equal(new Set(langs.map(lang=>UI.text(lang,'chooseTitle'))).size,4);
  assert.equal(UI.text('fr','chooseTitle'),UI.text('en','chooseTitle'));
  assert.equal(UI.text('en','toString'),'');
  assert.equal(UI.text('__proto__','constructor'),'');
});

test('acoustic inputs offer manual routes and do not expose device pairing actions', () => {
  const html=UI.acousticInputs({lang:'en'});
  assert.deepEqual(routesIn(html),['tuner','practice','studio']);
  assert.equal((html.match(/<li>/g)||[]).length,3);
  assert.doesNotMatch(html,/data-action=|data-go="device"|data-go="midi"|autoplay/);
  assert.match(html,/only after you choose a feature and grant permission/);
});

test('page-specific hints state the actual microphone and MIDI limits', () => {
  assert.match(UI.pageHint({lang:'en',type:'electric',page:'practice'}),/Current play-along feedback uses the microphone/);
  assert.match(UI.pageHint({lang:'en',type:'electric',page:'studio'}),/BLE-MIDI carries note messages only/);
  assert.match(UI.pageHint({lang:'en',type:'acoustic',page:'lessons'}),/does not grade your movements/);
  assert.match(UI.pageHint({lang:'en',type:'acoustic',page:'midi'}),/not automatically converted to MIDI/);
  assert.match(UI.pageHint({lang:'en',type:'acoustic',page:'tones'}),/not the sound of your acoustic violin/);
  assert.equal(UI.pageHint({type:'electric',page:'midi'}),'');
  assert.equal(UI.pageHint({type:'acoustic',page:'unknown'}),'');
});

test('module loading and every rendering function remain pure even with unavailable browser APIs', () => {
  const browser={};
  for(const name of ['document','navigator','localStorage','sessionStorage','fetch','XMLHttpRequest','AudioContext','setTimeout']) {
    Object.defineProperty(browser,name,{get(){throw Error('Unexpected API access: '+name);}});
  }
  vm.runInNewContext(source,browser);
  const api=browser.SVInstrumentProfile;
  assert.ok(Object.isFrozen(api));
  for(const lang of langs) {
    api.chooser({lang});api.acousticInputs({lang});
    for(const type of ['electric','acoustic']) {
      api.homePanel({lang,type});api.settingsPanel({lang,type});api.navIds(type);api.art(type);
      for(const page of allRoutes) api.pageHint({lang,type,page});
    }
  }
});

test('original SVGs are self-contained and can repeat without duplicate IDs', () => {
  assert.notEqual(UI.art('electric'),UI.art('acoustic'));
  for(const type of ['electric','acoustic']) {
    const svg=UI.art(type);
    assert.match(svg,/^<svg[^>]+aria-hidden="true"/);
    assert.doesNotMatch(svg,/<image|<script|\bid=|\bhref=|https?:|onload=/);
    assert.match(svg,/svip-strings/);
  }
});
