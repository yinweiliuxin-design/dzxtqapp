// Fail before packaging if editable frontend assets changed after the Worker build.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dist=path.resolve(__dirname,'../dist'),manifest=JSON.parse(fs.readFileSync(path.join(dist,'.openai/build-provenance.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),actual={};
function visit(dir,relative=''){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(!relative&&['server','.openai'].includes(entry.name))continue;
  const name=relative+entry.name,file=path.join(dir,entry.name);
  if(entry.isSymbolicLink())throw Error('Asset symlink '+name);
  if(entry.isDirectory())visit(file,name+'/');else actual[name]=sha(fs.readFileSync(file));
 }
}
visit(dist);
const expected=Object.keys(manifest.assets).sort(),files=Object.keys(actual).sort();
if(JSON.stringify(files)!==JSON.stringify(expected))throw Error('Asset inventory differs from Worker build; rebuild before packaging.');
for(const file of files)if(actual[file]!==manifest.assets[file])throw Error('Stale Worker asset: '+file);
if(sha(fs.readFileSync(path.join(dist,'server/index.js')))!==manifest.workerSha256)throw Error('Worker hash mismatch.');
console.log(JSON.stringify({status:'PASS',assets:files.length,workerSha256:manifest.workerSha256}));
