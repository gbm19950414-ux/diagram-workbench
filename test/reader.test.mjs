import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,bundleIdentity,modelFromSite,validateModel,installModel,readInstalledModel} from '../src/reader-model.mjs';
import {serveReader,startReader,validateBundle} from '../src/reader-runtime.mjs';
import {readerPage} from '../src/reader-page.mjs';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src');
function fixture(t) {
 const cleanups=[];const root=fs.mkdtempSync(path.join(os.tmpdir(),'semantic-reader-'));t.after(async()=>{for(const cleanup of cleanups.reverse())await cleanup();fs.rmSync(root,{recursive:true,force:true});});const site=path.join(root,'site');fs.mkdirSync(site);
 fs.writeFileSync(path.join(site,'index.html'),'<html><body>原模型<script>window.location.hash="#open=chapter"</script></body></html>');fs.writeFileSync(path.join(site,'evidence.html'),'原文证据');
 const outputs=Object.fromEntries(['index.html','evidence.html'].map(n=>[n,digest(fs.readFileSync(path.join(site,n)))]));
 fs.writeFileSync(path.join(site,'receipt.json'),JSON.stringify({schema:2,target:'domain-model',review:{state:'reviewed-snapshot'},outputs}));
 const model=modelFromSite({site,modelId:'example',title:'示例模型',revision:'r1'}),resources=path.join(root,'resources');fs.mkdirSync(resources);fs.writeFileSync(path.join(resources,'initial.json'),JSON.stringify(model));
 for(const n of ['reader-runtime.mjs','reader-model.mjs','reader-page.mjs'])fs.copyFileSync(path.join(source,n),path.join(resources,n));
 const files=Object.fromEntries(fs.readdirSync(resources).map(n=>[n,digest(fs.readFileSync(path.join(resources,n)))]));const bundle={schema:'semantic-reader-bundle/v1',library_id:'example',files,models:['initial.json']};bundle.bundle_id=bundleIdentity(bundle);fs.writeFileSync(path.join(resources,'bundle.json'),JSON.stringify(bundle));
 return {root,site,model,resources,stateDir:path.join(root,'state'),cleanups};
}
const operation=(state,route,body,headers={})=>fetch(state.url+'/_reader/'+route,{method:'POST',headers:{Origin:state.url,'X-Reader-Token':state.token,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('export retains exact published files and rejects changed, unreviewed, extra or symlink files',t=>{
 const {root,site,model}=fixture(t);const buffers=validateModel(model);assert.equal(buffers.get('index.html').toString(),fs.readFileSync(path.join(site,'index.html'),'utf8'));
 fs.writeFileSync(path.join(site,'index.html'),'changed');assert.throws(()=>modelFromSite({site,modelId:'example',title:'示例',revision:'r1'}),/发布内容/);
 fs.writeFileSync(path.join(site,'index.html'),buffers.get('index.html'));fs.writeFileSync(path.join(site,'extra.txt'),'extra');assert.throws(()=>modelFromSite({site,modelId:'example',title:'示例',revision:'r1'}),/发布清单/);fs.rmSync(path.join(site,'extra.txt'));
 fs.symlinkSync(path.join(site,'index.html'),path.join(site,'alias'));assert.throws(()=>modelFromSite({site,modelId:'example',title:'示例',revision:'r1'}),/符号链接/);fs.rmSync(path.join(site,'alias'));
 const receipt=JSON.parse(fs.readFileSync(path.join(site,'receipt.json')));receipt.review.state='needs-review';fs.writeFileSync(path.join(site,'receipt.json'),JSON.stringify(receipt));assert.throws(()=>modelFromSite({site,modelId:'example',title:'示例',revision:'r1'}),/已审/);
});
test('import is idempotent, rejects tampering/traversal/revision conflicts and preserves existing versions',t=>{
 const {root,model,site}=fixture(t),library=path.join(root,'library');assert.equal(installModel(library,model).reused,false);assert.equal(installModel(library,model).reused,true);
 const before=fs.readdirSync(library);const bad=structuredClone(model);bad.files[0].data=Buffer.from('bad').toString('base64');assert.throws(()=>installModel(library,bad),/校验/);
 const traversal=structuredClone(model);traversal.files[0].path='../outside';assert.throws(()=>installModel(library,traversal),/路径/);assert.deepEqual(fs.readdirSync(library),before);
 const conflict=modelFromSite({site,modelId:model.model_id,title:'新标题',revision:model.revision});assert.throws(()=>installModel(library,conflict),/不同内容/);
 const next=modelFromSite({site,modelId:model.model_id,title:model.title,revision:'r2'});installModel(library,next);assert.equal(fs.readdirSync(library).length,2);
 const installed=readInstalledModel(path.join(library,model.content_id));assert.equal(installed.model.revision,'r1');fs.writeFileSync(path.join(installed.site,'index.html'),'bad');assert.throws(()=>readInstalledModel(path.join(library,model.content_id)),/校验/);
});
test('packaged resources are relocatable and checked before running',t=>{
 const {root,resources}=fixture(t);assert.ok(validateBundle(resources).bundle_id);const moved=path.join(root,'带 空格');fs.renameSync(resources,moved);assert.ok(validateBundle(moved).bundle_id);
 fs.appendFileSync(path.join(moved,'reader-page.mjs'),'//bad');assert.throws(()=>validateBundle(moved),/改变/);
});
test('server opens original files, imports new versions, protects writes and stores separate positions',async t=>{
 const f=fixture(t),active=await serveReader(f);f.cleanups.push(async()=>{active.server.closeAllConnections();await active.close();});const {state}=active;
 const page=await fetch(state.url).then(r=>r.text());assert.match(page,/语义模型阅读器/);assert.match(page,/导入模型版本/);
 assert.equal(await fetch(state.url+'/models/'+f.model.content_id+'/index.html').then(r=>r.text()),fs.readFileSync(path.join(f.site,'index.html'),'utf8'));
 assert.equal((await operation(state,'view',{content_id:f.model.content_id,hash:'#open=a'},{'X-Reader-Token':'wrong'})).status,403);
 assert.equal((await operation(state,'view',{content_id:f.model.content_id,hash:'#open=a'},{Origin:'http://attacker.invalid'})).status,403);
 assert.equal((await operation(state,'view',{content_id:f.model.content_id,hash:'#open=a'})).status,200);
 const next=modelFromSite({site:f.site,modelId:'example',title:'示例模型',revision:'r2'});const imported=await operation(state,'import',next).then(r=>r.json());assert.equal(imported.reused,false);assert.equal(imported.models.length,2);
 assert.equal((await operation(state,'import',next).then(r=>r.json())).reused,true);await operation(state,'view',{content_id:next.content_id,hash:'#open=b'});
 const views=JSON.parse(fs.readFileSync(path.join(f.stateDir,'views.json')));assert.equal(views[f.model.content_id],'#open=a');assert.equal(views[next.content_id],'#open=b');
 assert.equal((await fetch(state.url+'/models/'+f.model.content_id+'/%2e%2e%2fservice.json')).status,400);
 const changed=structuredClone(next);changed.files[0].sha256='0'.repeat(64);assert.equal((await operation(state,'import',changed)).status,400);assert.equal(fs.readdirSync(path.join(f.stateDir,'models')).length,2);
});
test('independent launch reuses healthy instance, survives parent exit and restarts after stop or stale state',async t=>{
 const f=fixture(t),options={...f,open:false};const first=await startReader(options);f.cleanups.push(async()=>{try{const state=JSON.parse(fs.readFileSync(path.join(f.stateDir,'service.json')));await operation(state,'stop',{});}catch{}for(let i=0;i<40&&fs.existsSync(path.join(f.stateDir,'service.json'));i++)await new Promise(r=>setTimeout(r,50));});
 const repeated=await startReader(options);assert.equal(repeated.instance,first.instance);assert.equal(repeated.reused,true);
 const concurrent=await Promise.all([startReader(options),startReader(options)]);assert.ok(concurrent.every(s=>s.instance===first.instance));
 await operation(first,'stop',{});for(let i=0;i<20;i++){try{await fetch(first.url,{signal:AbortSignal.timeout(100)});}catch{break;}await new Promise(r=>setTimeout(r,50));}
 fs.writeFileSync(path.join(f.stateDir,'service.json'),JSON.stringify({...first,instance:'stale'}));
 const restarted=await startReader(options);assert.notEqual(restarted.instance,first.instance);assert.equal(restarted.reused,false);assert.equal(restarted.url,first.url);await operation(restarted,'stop',{});
});
test('browser UI keeps model titles safe, imports by picker and saves model-specific hash',()=>{
 const page=readerPage({token:'test',models:[{title:'</script><img src=x>',revision:'r1',model_id:'x',content_id:'a'}],views:{a:'#open=a'}});
 assert.ok(!page.includes('</script><img'));assert.match(page,/type="file"/);assert.match(page,/hashchange/);assert.match(page,/data\.views\[id\]/);assert.match(page,/停止服务/);
});

test('moving the application starts a correct new instance without replacing an occupied service',async t=>{
 const f=fixture(t),first=await startReader({...f,open:false});const relocated=path.join(f.root,'移动后的 阅读包');fs.renameSync(f.resources,relocated);
 const moved=await startReader({...f,resources:relocated,open:false});
 f.cleanups.push(async()=>{for(const state of [first,moved]){try{await operation(state,'stop',{});}catch{}}for(let i=0;i<40&&fs.existsSync(path.join(f.stateDir,'service.json'));i++)await new Promise(r=>setTimeout(r,50));});
 assert.notEqual(moved.instance,first.instance);assert.notEqual(moved.url,first.url);
 assert.equal((await fetch(first.url+'/_reader/health').then(r=>r.json())).instance,first.instance);
 assert.equal((await fetch(moved.url+'/_reader/health').then(r=>r.json())).bundle_path,fs.realpathSync(relocated));
 const reused=await startReader({...f,resources:relocated,open:false});assert.equal(reused.instance,moved.instance);
});
