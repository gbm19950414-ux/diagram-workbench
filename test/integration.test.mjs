import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bin=path.join(root,'bin/diagram-workbench.mjs');
const packageVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('independent consumer: native render, drift, failures, adapter and preview',async t=>{
  const project=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'diagram-integration-')));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.cpSync(path.join(root,'examples/minimal'),project,{recursive:true,filter:p=>!p.includes('/.architecture')});
  const cache=process.env.DIAGRAM_WORKBENCH_TEST_CACHE||path.join(root,'.architecture/cache');
  assert.ok(fs.existsSync(cache),'Run setup --project . first');
  fs.mkdirSync(path.join(project,'.architecture'));
  fs.symlinkSync(cache,path.join(project,'.architecture/cache'));
  const configFile=path.join(project,'diagram.config.json');
  const config=JSON.parse(fs.readFileSync(configFile));
  const port=await freePort();let nativePort=await freePort();while(nativePort===port)nativePort=await freePort();
  config.preview={port,nativePort};
  config.adapter='adapter.mjs';
  const adapter=path.join(project,'adapter.mjs');
  fs.writeFileSync(adapter,"export function renderPages({resources,page}) {return {'extra.html':page('Extra','<p>'+resources['README.md'].length+'</p>')}}\n");
  fs.writeFileSync(configFile,JSON.stringify(config));
  // Deliberately invoke the CLI from outside the consumer.
  const cli=(...args)=>spawnSync(process.execPath,[bin,...args,'--project',project],{cwd:os.tmpdir(),encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,HTTP_PROXY:'http://127.0.0.1:1',HTTPS_PROXY:'http://127.0.0.1:1'}});
  const okay=(...args)=>{const r=cli(...args);assert.equal(r.status,0,r.stdout+r.stderr);return r;};
  const fail=(pattern,...args)=>{const r=cli(...args);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);return r;};
  const review=()=>okay('review','--reviewer','fixture','--decision','updated','--note','Synthetic fixture assertion: reviewed against the fictional example only.');
  okay('build');fail(/needs-review/,'check');review();okay('build');okay('check');
  const site=path.join(project,'.architecture/site'),receiptPath=path.join(site,'receipt.json');
  assert.ok(fs.existsSync(path.join(site,'extra.html')));
  assert.ok(fs.existsSync(path.join(site,'images/request.svg')));
  const receipt=JSON.parse(fs.readFileSync(receiptPath));assert.equal(receipt.engineVersion,packageVersion);assert.ok(receipt.inputs.$engine);
  const modelStatus=JSON.parse(okay('status').stdout);assert.equal(modelStatus.model.state,'reviewed-snapshot');assert.equal(modelStatus.output.state,'verified');
  const spec=path.join(project,'README.md'),original=fs.readFileSync(spec);
  fs.appendFileSync(spec,'\nA synthetic comment.\n');fail(/needs-review/,'check');okay('build');fail(/needs-review/,'check');
  fs.writeFileSync(spec,original);okay('build');okay('check');
  const note=path.join(project,'notes/new.md');fs.mkdirSync(path.dirname(note));fs.writeFileSync(note,'new');fail(/needs-review/,'check');
  review();fs.unlinkSync(note);fail(/needs-review/,'check');review();okay('build');okay('check');
  const before=fs.readFileSync(receiptPath),runtimeBefore=fs.readFileSync(path.join(project,'.architecture/runtime/workspace.dsl'));
  const dsl=path.join(project,'docs/architecture/workspace.dsl'),originalDsl=fs.readFileSync(dsl);
  fs.appendFileSync(dsl,'\nINVALID DSL TOKEN\n');fail(/failed/,'build');assert.deepEqual(fs.readFileSync(receiptPath),before);assert.deepEqual(fs.readFileSync(path.join(project,'.architecture/runtime/workspace.dsl')),runtimeBefore);fs.writeFileSync(dsl,originalDsl);
  // Fail the second half of the replacement transaction, after the new site was installed.
  const blockedBackup=path.join(project,'.architecture/previous-runtime');
  fs.rmSync(blockedBackup,{recursive:true,force:true});fs.symlinkSync(cache,blockedBackup);
  fail(/Symlink output/,'build');assert.deepEqual(fs.readFileSync(receiptPath),before);assert.deepEqual(fs.readFileSync(path.join(project,'.architecture/runtime/workspace.dsl')),runtimeBefore);fs.unlinkSync(blockedBackup);
  fs.unlinkSync(spec);fail(/Missing source/,'build');assert.deepEqual(fs.readFileSync(receiptPath),before);fs.writeFileSync(spec,original);
  fs.appendFileSync(adapter,'\n// Changed adapter\n');fail(/needs-review/,'check');
  const savedAdapter=fs.readFileSync(adapter);fs.writeFileSync(adapter,"export function renderPages(){return {'../escape.html':'bad'}}");fail(/Unsafe output/,'build');assert.deepEqual(fs.readFileSync(receiptPath),before);assert.equal(fs.existsSync(path.join(project,'escape.html')),false);fs.writeFileSync(adapter,savedAdapter);
  review();okay('build');okay('check');
  const index=path.join(site,'index.html'),originalIndex=fs.readFileSync(index);fs.appendFileSync(index,'tamper');fail(/Output changed/,'check');fs.writeFileSync(index,originalIndex);
  fs.mkdirSync(path.join(site,'unexpected'));fs.writeFileSync(path.join(site,'unexpected/receipt.json'),'{}');fail(/Output set/,'check');fs.rmSync(path.join(site,'unexpected'),{recursive:true});okay('check');
  let output='';const child=spawn(process.execPath,[bin,'preview','--project',project],{cwd:os.tmpdir(),stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  try {
    let ready=false;
    for(let i=0;i<180;i++){try{const a=await fetch(`http://127.0.0.1:${port}/index.html`);const b=await fetch(`http://127.0.0.1:${nativePort}/`);if(a.ok&&b.ok){ready=true;break;}}catch{}await delay(250);}
    assert.ok(ready,output);assert.match(await (await fetch(`http://127.0.0.1:${port}/extra.html`)).text(),/Extra/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing`)).status,404);
  } finally {
    const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([exited,delay(10000)]);
    assert.notEqual(child.exitCode,null,'Preview must stop both servers');
  }
});

test('coverage consumer: semantic portal, review invalidation and failed render retention',async t=>{
  const project=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'diagram-coverage-')));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.cpSync(path.join(root,'examples/minimal'),project,{recursive:true,filter:p=>!p.includes('/.architecture')});
  const cache=process.env.DIAGRAM_WORKBENCH_TEST_CACHE||path.join(root,'.architecture/cache');
  assert.ok(fs.existsSync(cache),'Run setup --project . first');
  fs.mkdirSync(path.join(project,'.architecture'));fs.symlinkSync(cache,path.join(project,'.architecture/cache'));
  const configPath=path.join(project,'diagram.config.json'),config=JSON.parse(fs.readFileSync(configPath));
  config.coverage='docs/architecture/coverage.json';delete config.portal.supplementDiagrams;fs.writeFileSync(configPath,JSON.stringify(config));
  fs.writeFileSync(path.join(project,'docs/architecture/workspace.dsl'),`workspace "Coverage fixture" "Fictional fixture" {
  model {
    author = person "Author"
    system = softwareSystem "System" {
      registry = container "Registry"
    }
    author -> system "asks"
    registry -> author "reports"
  }
  views {
    systemContext system "context" {
      include *
      autolayout lr
    }
    container system "containers" {
      include *
      autolayout lr
    }
  }
}`);
  fs.writeFileSync(path.join(project,'docs/architecture/evidence.json'),JSON.stringify({sources:{spec:{path:'README.md',label:'Fixture specification',type:'spec'}},elements:{author:['spec'],system:['spec'],registry:['spec']},invariants:{}}));
  const uml=path.join(project,'docs/architecture/uml');
  fs.rmSync(path.join(uml,'request.puml'));
  fs.writeFileSync(path.join(uml,'domain.puml'),'@startuml\nclass Case\n@enduml\n');
  fs.writeFileSync(path.join(uml,'sequence.puml'),'@startuml\nparticipant A\nA -> B: request\n@enduml\n');
  fs.writeFileSync(path.join(uml,'state.puml'),'@startuml\n[*] --> Ready\nstate Ready\n@enduml\n');
  fs.writeFileSync(path.join(uml,'lineage.puml'),'@startuml\nrectangle Source\nSource --> Product\n@enduml\n');
  const evidence=[{id:'spec',type:'spec'}];
  const perspective=(id,section,question,kind,artifact,presentation='embed',extra={})=>({id,section,question,kind,status:'modelled',artifact,evidence,presentation,...extra});
  const coverage={schema:1,profile:'software-current-state',audiences:['project-author','maintainer-agent'],perspectives:[
    perspective('boundary','boundaries','Who owns the boundary?','c4-system-context',{type:'structurizr',viewKey:'context'},'link'),
    perspective('containers','boundaries','Which containers coordinate work?','c4-container',{type:'structurizr',viewKey:'containers'},'link'),
    perspective('domain','domain','Which objects are current?','domain-class',{type:'plantuml',file:'domain.puml'}),
    perspective('sequence','behavior','How does work flow?','sequence',{type:'plantuml',file:'sequence.puml'},'embed',{concerns:['failure']}),
    perspective('lifecycle','behavior','How does recovery work?','state-lifecycle',{type:'plantuml',file:'state.puml'},'embed',{concerns:['recovery']}),
    perspective('lineage','assurance','Which facts are traceable?','data-lineage',{type:'plantuml',file:'lineage.puml'}),
    {id:'runtime',section:'assurance',question:'What is deployed?','kind':'runtime-deployment',status:'unknown',evidence,reason:'No authoritative deployment record.',revisitWhen:'An operated topology is approved.',presentation:'link'}
  ]};
  fs.writeFileSync(path.join(project,'docs/architecture/coverage.json'),JSON.stringify(coverage));
  const cli=(...args)=>spawnSync(process.execPath,[bin,...args,'--project',project],{cwd:os.tmpdir(),encoding:'utf8',maxBuffer:8*1024*1024});
  const okay=(...args)=>{const result=cli(...args);assert.equal(result.status,0,result.stdout+result.stderr);return result;};
  const fail=(pattern,...args)=>{const result=cli(...args);assert.notEqual(result.status,0);assert.match(result.stderr,pattern);return result;};
  fail(/needs-review/,'check');
  okay('review','--reviewer','fixture','--decision','updated','--note','Reviewed fictional coverage questions, evidence, unknown runtime and recovery boundaries.');
  okay('build');okay('check');
  const site=path.join(project,'.architecture/site'),index=fs.readFileSync(path.join(site,'index.html'),'utf8'),receipt=fs.readFileSync(path.join(site,'receipt.json'));
  assert.match(index,/1\. 目的、受众、审查状态、覆盖状态/);assert.match(index,/6\. 跨仓库谱系、证据与显式未知/);
  assert.equal((index.match(/data-perspective-id=/g)||[]).length,7);assert.match(index,/complete-with-unknowns/);
  const stored=JSON.parse(receipt),reviewRecord=JSON.parse(fs.readFileSync(path.join(project,'docs/architecture/review.json')));assert.equal(stored.coverage.state,'complete-with-unknowns');assert.equal(reviewRecord.coverage.state,'complete-with-unknowns');
  coverage.perspectives[3].question='How does changed work flow?';fs.writeFileSync(path.join(project,'docs/architecture/coverage.json'),JSON.stringify(coverage));
  fail(/needs-review/,'check');okay('build');fail(/needs-review/,'check');const retainedReceipt=fs.readFileSync(path.join(site,'receipt.json'));
  okay('review','--reviewer','fixture','--decision','updated','--note','Reviewed updated fictional coverage wording before rebuilding the fixture portal.');
  coverage.perspectives[3].artifact.file='state.puml';fs.writeFileSync(path.join(project,'docs/architecture/coverage.json'),JSON.stringify(coverage));
  fail(/renders as state-lifecycle/,'build');assert.deepEqual(fs.readFileSync(path.join(site,'receipt.json')),retainedReceipt);
});
