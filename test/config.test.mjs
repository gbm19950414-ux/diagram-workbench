import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createWorkbench,initializeProject} from '../src/workbench.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(t){
  const project=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'diagram-config-')));
  fs.cpSync(path.join(root,'examples/minimal'),project,{recursive:true,filter:p=>!p.includes('/.architecture')});
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));return project;
}
test('config rejects absolute and escaping paths before any source mutation',async t=>{
  const project=fixture(t),configFile=path.join(project,'diagram.config.json');
  await assert.rejects(createWorkbench({project,config:configFile}),/Unsafe source/);
  await assert.rejects(createWorkbench({project,config:'../config.json'}),/Unsafe source/);
  const original=JSON.parse(fs.readFileSync(configFile));
  for(const field of ['workspace','uml','review','output']){
    fs.writeFileSync(configFile,JSON.stringify({...original,[field]:'../escape'}));
    await assert.rejects(createWorkbench({project}),/Unsafe/);
  }
});
test('review works for a non-git consumer and schema rejects unsupported configuration',async t=>{
  const project=fixture(t),workbench=await createWorkbench({project});
  await workbench.main(['review','--reviewer','fixture','--decision','updated','--note','Synthetic fixture reviewed against its own specification only.']);
  const review=JSON.parse(fs.readFileSync(path.join(project,'docs/architecture/review.json')));
  assert.ok(review.snapshot.$engine);assert.equal(review.head,null);
  fs.writeFileSync(path.join(project,'diagram.config.json'),'{"schema":999}');
  await assert.rejects(createWorkbench({project}),/Unsupported/);
});
test('symlinked output and missing test checker fail without accepting a review',async t=>{
  const project=fixture(t);
  fs.symlinkSync(os.tmpdir(),path.join(project,'.architecture'));
  await assert.rejects(createWorkbench({project}),/Symlink output/);
  fs.unlinkSync(path.join(project,'.architecture'));
  const evidencePath=path.join(project,'docs/architecture/evidence.json');
  const manifest=JSON.parse(fs.readFileSync(evidencePath));
  manifest.invariants.example={text:'Example',sources:['spec'],tests:[{source:'spec',symbol:'anything'}]};
  fs.writeFileSync(evidencePath,JSON.stringify(manifest));
  const workbench=await createWorkbench({project});
  await assert.rejects(workbench.main(['review','--reviewer','fixture','--decision','updated','--note','This assertion must not be accepted without its test checker.']),/No test reference checker/);
  assert.equal(fs.existsSync(path.join(project,'docs/architecture/review.json')),false);
});
test('a changed packaged engine invalidates a consumer review before checking artifacts',async t=>{
  const project=fixture(t),workbench=await createWorkbench({project});
  await workbench.main(['review','--reviewer','fixture','--decision','updated','--note','Synthetic review used only to test changed packaged tool instructions.']);
  const copy=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'diagram-engine-')));
  t.after(()=>fs.rmSync(copy,{recursive:true,force:true}));
  for(const rel of ['src','bin','skills','README.md','package.json'])fs.cpSync(path.join(root,rel),path.join(copy,rel),{recursive:true});
  fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'));
  fs.appendFileSync(path.join(copy,'README.md'),'\nChanged engine instructions.\n');
  const replacement=await import(pathToFileURL(path.join(copy,'src/workbench.mjs')));
  const other=await replacement.createWorkbench({project});
  await assert.rejects(other.main(['check']),/needs-review:[\s\S]*\$engine/);
});
test('init creates an explicitly unreviewed scaffold and status reports it without a renderer',async t=>{
  const project=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'diagram-init-')));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.writeFileSync(path.join(project,'README.md'),'# Consumer\n');
  const initialized=await initializeProject({project,title:'Consumer'});
  assert.equal(initialized.root,project);
  assert.ok(fs.existsSync(path.join(project,'docs/architecture/workspace.dsl')));
  assert.ok(fs.existsSync(path.join(project,'.agents/skills/architecture-model/SKILL.md')));
  const workbench=await createWorkbench({project});
  const report=await workbench.main(['status']);
  assert.equal(report.model.state,'needs-review');
  assert.equal(report.output.state,'not-built');
  await assert.rejects(initializeProject({project}),/already exists/);
});
test('init rejects a multi-line title before writing an initial model',async t=>{
  const project=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'diagram-init-title-')));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  await assert.rejects(initializeProject({project,title:'Consumer\n!include remote'}),/single line/);
  assert.equal(fs.existsSync(path.join(project,'diagram.config.json')),false);
});
