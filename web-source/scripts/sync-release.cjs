'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json')));
if(!/^\d+\.\d+\.\d+$/.test(release.version)||!/^\d{8}-[A-Za-z0-9.-]+$/.test(release.assetsVersion)||!/^V\d+(?:\.\d+)?$/.test(release.label)||release.reportPath!=='reports/release-current.html')throw Error('Invalid release manifest');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));pkg.version=release.version;fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(path.join(dist,'release.js'),"'use strict';\nwindow.SVRelease=Object.freeze("+JSON.stringify(release)+");\n");
for(const file of ['index.html','client.html']){
 let html=fs.readFileSync(path.join(dist,file),'utf8');
 const addScript=(name,before)=>{if(!html.includes('src="'+name+'?'))html=html.replace('<script src="'+before+'?', '<script src="'+name+'?v='+release.assetsVersion+'"></script><script src="'+before+'?')};
 addScript('release.js','seed.js');addScript('violin-tuner.js','score-model.js');addScript('workspace-backup.js','audio-engine.js');addScript('lesson-progress-cloud.js','lesson-client.js');addScript('reliability-ui.js','client.js');
 if(!html.includes('href="reliability-v29.css?'))html=html.replace('</head>','<link rel="stylesheet" href="reliability-v29.css?v='+release.assetsVersion+'"></head>');
 html=html.replace(/((?:src|href)="[^"]+\.(?:js|css)\?v=)[^"]+/g,(_,prefix)=>prefix+release.assetsVersion).replace(/Studio · V[\d.]+/g,'Studio · '+release.label);
 fs.writeFileSync(path.join(dist,file),html);
}
for(const file of ['sw.js','offline.js']){
 let code=fs.readFileSync(path.join(dist,file),'utf8').replace(/const VERSION='[^']+'/,"const VERSION='"+release.assetsVersion+"'");
 if(file==='sw.js')for(const name of ['release.js','violin-tuner.js','workspace-backup.js','lesson-progress-cloud.js','reliability-ui.js','reliability-v29.css'])if(!code.includes("'"+name+"'")&&!code.includes(JSON.stringify(name)))code=code.replace('const FILES=Object.freeze([','const FILES=Object.freeze([\n  '+JSON.stringify(name)+',');
 fs.writeFileSync(path.join(dist,file),code);
}
console.log(JSON.stringify(release));
