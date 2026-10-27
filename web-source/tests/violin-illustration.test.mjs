import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../dist/instrument-profile.js',import.meta.url),'utf8');
const context={module:{exports:{}}};
vm.runInNewContext(source,context);
const art=context.module.exports.art;

test('real-proportion violin artwork is self-contained and safe to repeat',()=>{
  for(const type of ['electric','acoustic'])for(let i=0;i<3;i++){
    const markup=art(type);
    assert.match(markup,/viewBox="0 0 320 680"/);
    assert.match(markup,/aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(markup,/<image|<script|<foreignObject|\bid=|\bhref=|url\(|https?:|onload=/i);
    for(const part of ['neck','pegbox','scroll','fingerboard','bridge','tailpiece','fine-tuners','chinrest','bow'])assert.ok(markup.includes('data-part="'+part+'"'),part);
    assert.deepEqual([...markup.matchAll(/data-violin-string="([GDAE])"/g)].map(m=>m[1]),['G','D','A','E']);
    assert.deepEqual([...markup.matchAll(/data-peg="([0-3])"/g)].map(m=>m[1]),['0','1','2','3']);
  }
});

test('electronic and acoustic instrument identities remain physically distinct',()=>{
  const electric=art('electric'),acoustic=art('acoustic');
  assert.match(electric,/data-part="open-frame"/);assert.match(electric,/fill-rule="evenodd"/);
  assert.doesNotMatch(electric,/data-part="f-holes"/);
  assert.match(acoustic,/data-part="acoustic-body"/);assert.match(acoustic,/data-part="f-holes"/);
  assert.match(acoustic,/class="svvi-grain"/);assert.doesNotMatch(acoustic,/data-part="open-frame"/);
  assert.equal(art('unknown'),electric);
});

test('new instrument materials do not introduce motion or browser side effects',()=>{
  const css=fs.readFileSync(new URL('../dist/violin-illustration.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/@import|url\(|animation:|position:\s*fixed/);
  let effects=0;const blocked=()=>{effects++;throw Error('Unexpected side effect');};
  const browser={fetch:blocked,setTimeout:blocked,navigator:{mediaDevices:{getUserMedia:blocked}}};
  vm.runInNewContext(source,browser);
  assert.match(browser.SVInstrumentProfile.art('electric'),/open-frame-v25/);
  assert.match(browser.SVInstrumentProfile.art('acoustic'),/acoustic-v25/);
  assert.equal(effects,0);
});
