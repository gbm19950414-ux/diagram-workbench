import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,bundleIdentity,relativeFile,installModel,readInstalledModel,MAX_MODEL_BYTES} from './reader-model.mjs';
import {readerPage} from './reader-page.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=filename=>JSON.parse(fs.readFileSync(filename,'utf8'));
function atomicJSON(filename,data) {const temp=filename+'.'+crypto.randomUUID();fs.writeFileSync(temp,JSON.stringify(data)+'\n',{mode:0o600});fs.renameSync(temp,filename);}
export function validateBundle(resources) {
  const bundle=json(path.join(resources,'bundle.json'));
  if (bundle.schema!=='semantic-reader-bundle/v1' || !/^[a-zA-Z0-9][\w.-]{0,99}$/.test(bundle.library_id)) throw Error('阅读包身份不受支持');
  for (const [name,hash] of Object.entries(bundle.files)) {
    const file=path.join(resources,relativeFile(name));
    if (fs.realpathSync(file)!==path.join(fs.realpathSync(resources),name) || digest(fs.readFileSync(file))!==hash) throw Error('阅读包文件缺失或已改变：'+name);
  }
  if(bundleIdentity(bundle)!==bundle.bundle_id)throw Error('阅读包清单校验失败');
  return bundle;
}
function stateRoot(bundle) {return path.join(os.homedir(),'Library','Application Support','Semantic Model Reader',bundle.library_id);}
async function health(state,bundle,resources) {
  if (!state || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(state.url)) return null;
  try {const response=await fetch(state.url+'/_reader/health',{signal:AbortSignal.timeout(1200)});if(!response.ok)return null;const info=await response.json();return info.bundle_id===bundle.bundle_id && info.bundle_path===resources && info.instance===state.instance?info:null;}catch{return null;}
}
function modelsAt(library) {
  return fs.readdirSync(library,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^[a-f0-9]{64}$/.test(e.name)).map(e=>readInstalledModel(path.join(library,e.name)));
}
export async function serveReader({resources,stateDir,port=0}) {
  resources=fs.realpathSync(resources);const bundle=validateBundle(resources);stateDir=stateDir||stateRoot(bundle);fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
  const library=path.join(stateDir,'models');fs.mkdirSync(library,{recursive:true,mode:0o700});
  for (const filename of bundle.models) installModel(library,json(path.join(resources,relativeFile(filename))));
  let models=modelsAt(library), views={};const viewFile=path.join(stateDir,'views.json');
  if(fs.existsSync(viewFile)){try{views=json(viewFile);}catch{views={};}}
  const token=crypto.randomBytes(32).toString('hex'),instance=crypto.randomUUID();let url,importing=false;
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const listed=()=>models.map(({model:m})=>({model_id:m.model_id,title:m.title,revision:m.revision,content_id:m.content_id}));
  const logFile=path.join(stateDir,'reader.log');
  const log=message=>fs.appendFileSync(logFile,new Date().toISOString()+' '+message+'\n');
  const server=http.createServer(async(req,res)=>{
    try {
      if (req.headers.host!==new URL(url).host) {send(res,403,{error:'请求地址不属于此阅读器'});return;}
      const request=new URL(req.url,url),pathname=decodeURIComponent(request.pathname);
      if(req.method==='POST') {
        if(req.headers.origin!==url || req.headers['x-reader-token']!==token) {send(res,403,{error:'操作来源校验失败'});return;}
        if(!['/_reader/import','/_reader/view','/_reader/stop'].includes(pathname)){send(res,404,{error:'未知操作'});return;}
        let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_MODEL_BYTES*1.5+65536){send(res,413,{error:'导入文件过大'});req.destroy();return;}chunks.push(chunk);}
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
        if(pathname==='/_reader/import') {
          if(importing){send(res,409,{error:'已有导入正在进行，请稍后重试'});return;}importing=true;
          try{const result=installModel(library,body);models=modelsAt(library);log('import '+result.content_id+' reused='+result.reused);send(res,200,{...result,models:listed()});}finally{importing=false;}return;
        }
        if(pathname==='/_reader/view') {
          if(!models.some(m=>m.model.content_id===body.content_id)||typeof body.hash!=='string'||body.hash.length>50000||(body.hash&&!body.hash.startsWith('#')))throw Error('阅读位置格式无效');
          views[body.content_id]=body.hash;atomicJSON(viewFile,views);send(res,200,{saved:true});return;
        }
        send(res,200,{stopped:true});setImmediate(()=>server.close());return;
      }
      if(req.method!=='GET'){send(res,405,{error:'不支持的操作'});return;}
      if(pathname==='/_reader/health'){send(res,200,{schema:1,bundle_id:bundle.bundle_id,bundle_path:resources,instance,url});return;}
      if(pathname==='/_reader/diagnostics'){send(res,200,{url,runtime:process.version,state_dir:stateDir,bundle_path:resources,log:fs.readFileSync(logFile,'utf8').slice(-5000)});return;}
      if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(readerPage({token,models:listed(),views}));return;}
      if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
      const route=pathname.match(/^\/models\/([a-f0-9]{64})\/(.+)$/);if(!route){send(res,404,{error:'页面不存在'});return;}
      const record=models.find(m=>m.model.content_id===route[1]);if(!record){send(res,404,{error:'版本不存在'});return;}
      const name=relativeFile(route[2]), declared=record.model.files.find(f=>f.path===name);
      if(!declared){send(res,404,{error:'文件不属于此发布版本'});return;}
      const filename=path.join(record.site,name);
      if(fs.realpathSync(filename)!==path.join(fs.realpathSync(record.site),name))throw Error('发布文件路径改变');
      const bytes=fs.readFileSync(filename);if(digest(bytes)!==declared.sha256)throw Error('发布文件已改变，请重新导入原发布包');
      res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(name)]||'application/octet-stream');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'");res.end(bytes);
    }catch(error){log('error '+error.message);if(!res.headersSent)send(res,400,{error:error.message});else res.end();}
  });
  async function listen(candidate) {await new Promise((resolve,reject)=>{const onError=e=>{server.off('listening',onListen);reject(e);};const onListen=()=>{server.off('error',onError);resolve();};server.once('error',onError);server.once('listening',onListen);server.listen(candidate,'127.0.0.1');});}
  try{await listen(port);}catch(error){if(port&&error.code==='EADDRINUSE')await listen(0);else throw error;}
  url='http://127.0.0.1:'+server.address().port;
  const state={url,pid:process.pid,instance,token,bundle_id:bundle.bundle_id,bundle_path:resources};atomicJSON(path.join(stateDir,'service.json'),state);log('ready '+url);
  server.on('close',()=>{try{const saved=json(path.join(stateDir,'service.json'));if(saved.instance===instance)fs.rmSync(path.join(stateDir,'service.json'));}catch{}log('stopped '+instance);});
  return {server,state,close:()=>new Promise(resolve=>server.close(resolve))};
}
export async function startReader({resources,stateDir,open=true}) {
  resources=fs.realpathSync(resources);const bundle=validateBundle(resources);stateDir=stateDir||stateRoot(bundle);fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
  const stateFile=path.join(stateDir,'service.json'),lock=path.join(stateDir,'launch.lock');let locked=false;
  for(let attempt=0;attempt<80;attempt++) {
    try{fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner'),String(process.pid));locked=true;break;}catch(error){
      if(error.code!=='EEXIST')throw error;
      try{const pid=Number(fs.readFileSync(path.join(lock,'owner'),'utf8'));if(!Number.isSafeInteger(pid)||pid<1)throw Error('invalid');try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){fs.rmSync(lock,{recursive:true,force:true});continue;}}}catch{if(Date.now()-fs.statSync(lock).mtimeMs>15000){fs.rmSync(lock,{recursive:true,force:true});continue;}}
      await pause(125);
    }
  }
  if(!locked)throw Error('另一启动正在运行，请稍后重试。');
  let state,reused=false;
  try {
    if(fs.existsSync(stateFile)){try{state=json(stateFile);}catch{state=null;}}
    if(await health(state,bundle,resources)){reused=true;}else{
      const logfile=fs.openSync(path.join(stateDir,'reader.log'),'a');
      const command=[path.join(resources,'reader-runtime.mjs'),'serve','--resources',resources,'--state-dir',stateDir,'--port',String(state?.url?.match(/:(\d+)$/)?.[1]||0)];
      const child=spawn(process.execPath,command,{detached:true,stdio:['ignore',logfile,logfile],cwd:resources});fs.closeSync(logfile);child.unref();let spawnError;child.on('error',e=>spawnError=e);
      for(let attempt=0;attempt<100;attempt++){if(spawnError)throw spawnError;await pause(100);try{state=json(stateFile);}catch{continue;}if(await health(state,bundle,resources))break;}
      if(!await health(state,bundle,resources))throw Error('服务未能启动，请查看 '+path.join(stateDir,'reader.log'));
    }
  }finally{fs.rmSync(lock,{recursive:true,force:true});}
  if(open){const result=spawnSync('/usr/bin/open',[state.url]);if(result.status!==0)throw Error('服务已运行，但浏览器未打开：'+state.url);}
  return {...state,reused,state_dir:stateDir};
}
async function cli() {
  const args=process.argv.slice(2),command=args.shift();const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  const resources=option('--resources')||path.dirname(fileURLToPath(import.meta.url)),stateDir=option('--state-dir');
  if(command==='start'){console.log(JSON.stringify(await startReader({resources,stateDir,open:!args.includes('--no-open')})));}
  else if(command==='serve'){const active=await serveReader({resources,stateDir,port:Number(option('--port')||0)});for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>active.server.close());}
  else throw Error('Use start|serve --resources DIRECTORY [--state-dir DIRECTORY] [--no-open]');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(error=>{console.error(error.message);process.exitCode=1;});
