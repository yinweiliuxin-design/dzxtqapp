import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../dist/violin-art.js',import.meta.url),'utf8');
function load(){const module={exports:{}};vm.runInNewContext(source,{module,globalThis:{}});return module.exports;}

test('multiple violin instances keep every paint reference local even with identical or hostile requested IDs',()=>{
  const art=load(),instances=['splash','learning','tutorial','mini'].map(variant=>art.svg({id:'same id"/><script>alert(1)</script>',variant}));
  const allIds=new Set();
  for(const markup of instances){
    const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
    assert.ok(ids.length>=5);for(const id of ids){assert.match(id,/^[A-Za-z][A-Za-z0-9_-]+$/);assert.equal(allIds.has(id),false);allIds.add(id);}
    for(const ref of markup.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(ref[1]),'gradient belongs to its own SVG');
    assert.doesNotMatch(markup,/<script|onload=|(?:href|src)=/i);
  }
});

test('accessible title is escaped while decorative figures stay out of the accessibility tree',()=>{
  const art=load(),markup=art.svg({title:'Violin </title><script>alert("x")</script>',decorative:false});
  assert.match(markup,/role="img" aria-labelledby="([^"]+)-title"/);
  assert.match(markup,/Violin &lt;\/title&gt;&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup,/<script/);
  assert.match(art.svg({decorative:true}),/aria-hidden="true"/);
});

test('artwork is available in a browser global without requesting hardware, audio, network or timers',()=>{
  let effects=0;const blocked=()=>{effects++;throw Error('Unexpected artwork side effect');};
  const context={setTimeout:blocked,fetch:blocked,AudioContext:blocked,navigator:{mediaDevices:{getUserMedia:blocked}}};
  context.globalThis=context;vm.runInNewContext(source,context);
  for(const variant of ['splash','learning','tutorial','mini']){
    const markup=context.SVViolinArt.svg({variant,showBow:true});
    assert.match(markup,/data-sv-violin="open-frame-v18"/);assert.match(markup,/fill-rule="evenodd"/);assert.match(markup,/class="sva-fingerboard"/);
    assert.equal([...markup.matchAll(/class="sva-string"/g)].length,4);
  }
  assert.equal(effects,0);
});
