#!/usr/bin/env node
// Verify the actual tgz in a new consumer. The fixture and review statement are synthetic.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'diagram-package-'));
const consumer=path.join(fixture,'consumer');
const cache=path.join(root,'.architecture/cache');
function run(command,args,options={}){
  return execFileSync(command,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],...options}).trim();
}
async function port(){
  const server=net.createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const value=server.address().port;
  server.close();
  await once(server,'close');
  return value;
}
let preview;
try {
  if(!fs.existsSync(cache))throw Error('Run setup --project . before smoke-package.');
  const archive=run('npm',['pack','--pack-destination',fixture,'--silent']);
  fs.cpSync(path.join(root,'examples/minimal'),consumer,{recursive:true});
  fs.mkdirSync(path.join(consumer,'.architecture'));
  fs.symlinkSync(cache,path.join(consumer,'.architecture/cache'));
  let webPort=await port(),nativePort=await port();
  while(nativePort===webPort)nativePort=await port();
  const configPath=path.join(consumer,'diagram.config.json');
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  config.preview={port:webPort,nativePort};
  fs.writeFileSync(configPath,JSON.stringify(config,null,2));
  run('npm',['install','--prefix',consumer,'--package-lock=false','--ignore-scripts','--no-audit',path.join(fixture,archive)]);
  const cli=path.join(consumer,'node_modules/diagram-workbench/bin/diagram-workbench.mjs');
  const invoke=(...args)=>run(process.execPath,[cli,...args,'--project',consumer]);
  invoke('review','--reviewer','package-fixture','--decision','updated','--note','Reviewed the fictional reading-list fixture files for this package smoke test.');
  invoke('build');
  invoke('check');
  preview=spawn(process.execPath,[cli,'preview','--project',consumer],{cwd:consumer,stdio:['ignore','pipe','pipe']});
  let output='';
  preview.stdout.on('data',chunk=>output+=chunk);
  preview.stderr.on('data',chunk=>output+=chunk);
  let ready=false;
  for(let i=0;i<120;i++){
    if(preview.exitCode!==null)break;
    try {
      const [web,native]=await Promise.all([
        fetch(`http://127.0.0.1:${webPort}/index.html`),
        fetch(`http://127.0.0.1:${nativePort}/`)
      ]);
      if(web.ok&&native.ok){ready=true;break;}
    } catch {}
    await delay(250);
  }
  if(!ready)throw Error('Packaged preview did not become ready: '+output.slice(-2000));
  console.log(`Package smoke OK: ${archive}; build/check/preview from installed tgz`);
} finally {
  if(preview && preview.exitCode===null){
    const exited=once(preview,'exit');
    preview.kill('SIGTERM');
    await Promise.race([exited,delay(10000)]);
    if(preview.exitCode===null)preview.kill('SIGKILL');
  }
  fs.rmSync(fixture,{recursive:true,force:true});
}
