import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bin=path.join(root,'bin/diagram-workbench.mjs');

for(const fixture of ['domain-model','domain-training','domain-hierarchical'])test(`standalone ${fixture} consumer preview needs no native service`,async t=>{
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'domain-integration-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.cpSync(path.join(root,'examples',fixture),dir,{recursive:true,filter:p=>!p.includes('/.diagrams')&&!p.endsWith('/review.json')});
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const configPath=path.join(dir,'diagram.config.json'),config=JSON.parse(fs.readFileSync(configPath));config.preview={port,nativePort:port===8766?8767:8766};fs.writeFileSync(configPath,JSON.stringify(config));
  const cli=(...args)=>spawnSync(process.execPath,[bin,...args,'--project',dir],{cwd:os.tmpdir(),encoding:'utf8'});
  for(const args of [['setup'],['review','--reviewer','fixture','--decision','updated','--note','Reviewed the fictional fixture to validate rendering and links, not a real training rule.'],['build'],['check']]){
    const r=cli(...args);assert.equal(r.status,0,r.stdout+r.stderr);
  }
  let output='';const child=spawn(process.execPath,[bin,'preview','--project',dir],{stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  try {
    let html;
    for(let i=0;i<60;i++){try{const response=await fetch(`http://127.0.0.1:${port}/`);if(response.ok){html=await response.text();break;}}catch{}await delay(100);}
    assert.ok(html,output);assert.match(html,fixture==='domain-hierarchical'?/hierarchy-layer/:/domain-group/);assert.doesNotMatch(output,/Structurizr local/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/${fixture==='domain-hierarchical'?'images/hierarchy-archive-all.svg':'images/model.svg'}`)).status,200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing`)).status,404);
  }finally{const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([exited,delay(5000)]);assert.notEqual(child.exitCode,null);}
});
