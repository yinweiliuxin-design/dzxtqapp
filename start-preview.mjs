#!/usr/bin/env node
// 一键预览：构建并启动包含客户端、后台管理端、服务端接口和本地数据库的完整预览，然后打开浏览器。
// 用法：node start-preview.mjs [--port 18912] [--role admin|user|anonymous] [--instance 名称] [--no-open] [--reset]
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const app=path.join(root,'web-source');
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const flag=name=>args.includes('--'+name);
const roles={admin:'管理员 preview-owner',user:'普通账号 preview-user',anonymous:'未登录访客'};

function fail(message){console.error('\n'+message+'\n');process.exit(1);}

if(flag('help')||flag('h')){
  console.log(`Silvio 一键预览
  node start-preview.mjs              构建并启动，自动打开浏览器
  --port <端口>                       默认 18912，被占用时自动顺延
  --role admin|user|anonymous         预览身份，默认 admin（可进入后台）
  --instance <名称>                   使用独立的数据目录 web-source/.preview/<名称>
  --no-open                           不自动打开浏览器
  --reset                             启动前清空本次使用的预览数据目录`);
  process.exit(0);
}

const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<5))fail(`需要 Node.js 22.5 或更高版本（建议 24 LTS），当前为 ${process.versions.node}。\n下载：https://nodejs.org/`);
if(!fs.existsSync(path.join(app,'scripts','preview.mjs')))fail('找不到 web-source/scripts/preview.mjs，请在仓库根目录运行。');

const role=option('role')||'admin';
if(!roles[role])fail('--role 只能是 admin、user 或 anonymous。');
const instance=option('instance');
if(instance!==undefined&&!/^[a-zA-Z0-9_-]{1,64}$/.test(instance))fail('--instance 只能包含 1–64 个字母、数字、下划线或连字符。');
const dataDir=instance?path.join('.preview',instance):'.preview';
const wanted=Number(option('port')||18912);
if(!Number.isInteger(wanted)||wanted<1024||wanted>65535)fail('--port 需要 1024–65535 之间的整数。');

// node:sqlite 从 Node 22.13 / 23.4 起无需参数；更早的 22.x 需要 --experimental-sqlite。
const sqliteFlag=(major===22&&minor<13)||(major===23&&minor<4)?['--experimental-sqlite']:[];

if(flag('reset')){
  const data=path.join(app,dataDir);
  if(fs.existsSync(data)){fs.rmSync(data,{recursive:true,force:true});console.log('已清空本地预览数据：web-source/'+dataDir.replaceAll(path.sep,'/'));}
}

console.log('正在构建服务端与静态资源…');
const build=spawnSync(process.execPath,['scripts/build-worker.cjs'],{cwd:app,stdio:'inherit'});
if(build.status!==0)fail('构建失败，请查看上面的错误信息。');

function free(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
let port=wanted;
while(!(await free(port))){if(port>=wanted+20)fail(`端口 ${wanted}–${port} 都被占用，请用 --port 指定其他端口。`);port++;}

const child=spawn(process.execPath,[...sqliteFlag,'--disable-warning=ExperimentalWarning','scripts/preview.mjs'],{
  cwd:app,stdio:['ignore','pipe','inherit'],
  env:{...process.env,SV_PREVIEW_PORT:String(port),SV_PREVIEW_ROLE:role,...(instance?{SV_PREVIEW_INSTANCE:instance}:{})}
});

function openBrowser(url){
  const [cmd,cmdArgs]=process.platform==='win32'?['cmd',['/c','start','""',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
  const opener=spawn(cmd,cmdArgs,{stdio:'ignore',detached:true,windowsVerbatimArguments:process.platform==='win32'});
  opener.on('error',()=>console.log('未能自动打开浏览器，请手动访问上面的地址。'));
  opener.unref();
}

let started=false,buffer='';
child.stdout.setEncoding('utf8');
child.stdout.on('data',chunk=>{
  if(started){process.stdout.write(chunk);return;}
  buffer+=chunk;
  const line=buffer.split('\n').find(l=>l.trim().startsWith('{')&&l.includes('"preview"'));
  if(!line)return;
  started=true;
  const url=`http://127.0.0.1:${port}/`;
  console.log(`
Silvio V29 一键预览已启动
  App   ${url}
  后台  ${url}admin
  身份  ${roles[role]}（仅本机预览使用的测试身份）
  数据  web-source/${dataDir.replaceAll(path.sep,'/')}（重启后保留，加 --reset 清空）
  停止  在此窗口按 Ctrl+C
`);
  if(!flag('no-open'))openBrowser(url);
});

const stop=()=>{if(child.exitCode===null)child.kill('SIGTERM');};
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
child.on('exit',code=>{if(!started)console.error('预览服务未能启动。');process.exit(code??0);});
