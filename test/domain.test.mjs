import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorkbench, initializeProject} from '../src/workbench.mjs';
import {getTarget} from '../src/targets.mjs';
import {validateDomainModel, selectDomainView, layoutDomain, domainHighlights, domainController} from '../src/domain-model.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(t) {
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'domain-test-')));
  fs.cpSync(path.join(root,'examples/domain-model'),dir,{recursive:true,filter:p=>!p.includes('/.diagrams')&&!p.endsWith('/review.json')});
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const model=JSON.parse(fs.readFileSync(path.join(dir,'model.json'))),manifest=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json')));
  return {dir,model,manifest};
}
const save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v));

test('drawing targets default to original software behavior and reject unknown selections',()=>{
  assert.equal(getTarget().id,'software-architecture'); assert.equal(getTarget().native,true);
  assert.equal(getTarget('domain-model').native,false);
  assert.throws(()=>getTarget('training'),/Unknown drawing target/);
});

test('neutral IDs, object evidence, directions, unknowns and saved traces are validated',t=>{
  const {dir,model,manifest}=fixture(t);
  const checked=validateDomainModel(model,manifest,dir);
  assert.deepEqual(checked.elements.begin,['spec']);
  const change=fn=>{const copy=structuredClone(model);fn(copy);return copy;};
  for (const [invalid,pattern] of [
    [change(x=>x.nodes.push({...x.nodes[0]})),/Duplicate ID/],
    [change(x=>x.edges[0].to='missing'),/Dangling edge/],
    [change(x=>x.edges[0].direction='cause'),/Invalid direction/],
    [change(x=>x.nodes[0].evidence=[]),/Missing evidence/],
    [change(x=>x.edges[0].evidence=['missing']),/Unknown evidence/],
    [change(x=>delete x.nodes[4].reason),/reason/],
    [change(x=>x.traces[0].edge_ids=['invented']),/Unknown trace reference/],
    [change(x=>x.traces[0].node_ids=['ready','done']),/Trace omits endpoint/]
  ]) assert.throws(()=>validateDomainModel(invalid,manifest,dir),pattern);
  assert.throws(()=>validateDomainModel(model,{...manifest,elements:{begin:['other']}},dir),/Conflicting evidence mapping/);
});

test('group views retain one-hop endpoints, isolated nodes and symmetric relationships',t=>{
  const {model}=fixture(t),view=selectDomainView(model,'notes');
  assert.deepEqual(view.nodes.map(n=>n.id),['ready','note','isolated']);
  assert.deepEqual(view.edges.map(e=>e.id),['compare']);
  assert.equal(view.owned.has('ready'),false); assert.equal(view.owned.has('isolated'),true);
  assert.deepEqual(selectDomainView(model).nodes,model.nodes);
});

test('layout preserves all nodes and source order through cycles and ID renames',t=>{
  const {model}=fixture(t),layout=layoutDomain(selectDomainView(model));
  assert.equal(layout.positions.size,5);
  assert.ok(layout.positions.get('done').y>layout.positions.get('running').y);
  const renamed=structuredClone(model);
  for(const n of renamed.nodes)n.id='renamed.'+n.id;
  for(const e of renamed.edges){e.from='renamed.'+e.from;e.to='renamed.'+e.to;}
  const changed=layoutDomain(selectDomainView(renamed));
  for(const [id,pos]of layout.positions)assert.deepEqual(changed.positions.get('renamed.'+id),pos);
  assert.equal(layoutDomain({nodes:[],edges:[],owned:new Set()}).positions.size,0);
});

test('selection and saved trace highlighting use declared IDs without inventing a path',t=>{
  const {model}=fixture(t);
  assert.deepEqual([...domainHighlights(model,'isolated','').related],['isolated']);
  const selected=domainHighlights(model,'compare','');
  assert.deepEqual([...selected.related],['compare','ready','note']);
  const traced=domainHighlights(model,null,'case1');
  assert.equal(traced.traced.has('retry'),false); assert.equal(traced.traced.has('finish'),true);
  assert.equal(domainHighlights(model,null,'not-a-case').traced.size,0);
});

test('domain target builds and checks without any DSL, Java, Graphviz or toolchain lock',async t=>{
  const {dir,model}=fixture(t),wb=await createWorkbench({project:dir});
  await wb.main(['setup']);
  await wb.main(['build']); await assert.rejects(wb.main(['check']),/needs-review/);
  await wb.main(['review','--reviewer','fixture','--decision','updated','--note','Checked this fictional fixture against its supplied specification, including the isolated unknown.']);
  await wb.main(['build']); await wb.main(['check']);
  const site=path.join(dir,'.diagrams/site'),receipt=JSON.parse(fs.readFileSync(path.join(site,'receipt.json')));
  assert.equal(receipt.target,'domain-model');assert.equal(receipt.tools.renderer,'builtin-svg/v1');
  assert.equal(fs.existsSync(path.join(site,'structurizr')),false);
  const html=fs.readFileSync(path.join(site,'index.html'),'utf8');
  assert.match(html,/domainController/);assert.match(html,/aria-live="polite"/);assert.match(html,/@media\(max-width:700px\)/);
  assert.match(html,/data-object="isolated"/);assert.match(html,/node_ids/);
  const svg=fs.readFileSync(path.join(site,'images/model.svg'),'utf8');
  const comparison=svg.match(/<g class="edge [^>]*data-object="compare"[\s\S]*?<\/g>/)[0];
  assert.doesNotMatch(comparison,/marker-end/);
  const originalReceipt=fs.readFileSync(path.join(site,'receipt.json'));
  model.nodes[0].label='Changed source meaning';save(path.join(dir,'model.json'),model);
  await assert.rejects(wb.main(['check']),/needs-review/);
  model.edges[0].to='absent';save(path.join(dir,'model.json'),model);
  await assert.rejects(wb.main(['build']),/Dangling edge/);
  assert.deepEqual(fs.readFileSync(path.join(site,'receipt.json')),originalReceipt);
});

test('generated content escapes labels and source JSON and immutable receipts detect tampering',async t=>{
  const {dir,model,manifest}=fixture(t);
  model.nodes[0].label='</script><script>alert(1)</script>';
  fs.writeFileSync(path.join(dir,'source.json'),'["<img src=x onerror=alert(1)>"]');
  manifest.sources.spec.path='source.json';save(path.join(dir,'model.json'),model);save(path.join(dir,'evidence.json'),manifest);
  const wb=await createWorkbench({project:dir});
  await wb.main(['review','--reviewer','fixture','--decision','updated','--note','Synthetic escaping test only; this is not a real semantic acceptance.']);
  await wb.main(['build']);await wb.main(['check']);
  const site=path.join(dir,'.diagrams/site'),html=fs.readFileSync(path.join(site,'index.html'),'utf8');
  assert.doesNotMatch(html,/<script>alert\(1\)/);assert.match(html,/\\u003c\/script/);
  const receipt=JSON.parse(fs.readFileSync(path.join(site,'receipt.json')));
  const doc=Object.keys(receipt.outputs).find(p=>p.startsWith('docs/'));
  assert.ok(doc); assert.match(fs.readFileSync(path.join(site,doc),'utf8'),/&lt;img/);
  fs.appendFileSync(path.join(site,'images/model.svg'),'tampered');await assert.rejects(wb.main(['check']),/Output changed/);
});

test('domain init creates only an unreviewed model, and rejects collisions and escaping paths',async t=>{
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'domain-init-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  await initializeProject({project:dir,target:'domain-model',title:'Non-software model'});
  const config=JSON.parse(fs.readFileSync(path.join(dir,'diagram.config.json')));
  assert.equal(config.target,'domain-model');assert.equal(config.workspace,undefined);
  assert.equal(fs.existsSync(path.join(dir,config.review)),false);
  const wb=await createWorkbench({project:dir});const status=await wb.main(['status']);assert.equal(status.model.state,'needs-review');
  await assert.rejects(initializeProject({project:dir,target:'domain-model'}),/already exists/);
  await assert.rejects(initializeProject({project:dir,target:'domain-model',config:'../escape.json'}),/Unsafe/);
});

// Minimal DOM event harness for the exported browser controller. In particular,
// DOMTokenList.toggle treats an omitted/undefined force as a toggle.
test('initial view is undimmed and saved trace controls clear stale selection', t=>{
  const {model}=fixture(t);
  function element(dataset={}) {
    const tokens=new Set();
    return {dataset,hidden:false,value:'',textContent:'',events:{},attributes:{},
      classList:{contains:k=>tokens.has(k),toggle(k,force){const on=force===undefined?!tokens.has(k):Boolean(force);if(on)tokens.add(k);else tokens.delete(k);return on;}},
      setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.events[k]=fn;}
    };
  }
  const items=[...model.nodes,...model.edges].map(x=>element({object:x.id}));
  const views=['','flow','notes'].map(view=>element({view}));
  const ids=Object.fromEntries(['domain-data','domain-view','domain-group','domain-trace','trace-description','domain-detail','domain-clear','domain-export'].map(id=>[id,element()]));
  ids['domain-data'].textContent=JSON.stringify({model,sources:{}});
  ids['domain-view'].querySelectorAll=s=>s==='[data-view]'?views:items;
  const previous=globalThis.document, previousWindow=globalThis.window;
  t.after(()=>{globalThis.document=previous;globalThis.window=previousWindow;});
  const windowEvents={};let nextFrame;
  globalThis.window={addEventListener:(name,fn)=>{windowEvents[name]=fn;},requestAnimationFrame:fn=>{nextFrame=fn;}};
  globalThis.document={getElementById:id=>ids[id]};
  domainController(domainHighlights);
  assert.equal(items.some(x=>x.classList.contains('dim')),false);
  assert.deepEqual(views.filter(x=>!x.hidden).map(x=>x.dataset.view),['']);
  // A fresh page renders before the browser silently restores select values.
  windowEvents.pageshow({persisted:false});
  ids['domain-group'].value='notes';ids['domain-trace'].value='case1';
  assert.deepEqual(views.filter(x=>!x.hidden).map(x=>x.dataset.view),['']);
  nextFrame();
  assert.deepEqual(views.filter(x=>!x.hidden).map(x=>x.dataset.view),['notes']);
  assert.equal(items.find(x=>x.dataset.object==='finish').classList.contains('trace'),true);
  assert.equal(items.some(x=>x.attributes['aria-pressed']==='true'),false);
  // A bfcache return also refreshes from whatever controls the browser preserved.
  ids['domain-group'].value='';ids['domain-trace'].value='';
  windowEvents.pageshow({persisted:true});nextFrame();
  assert.deepEqual(views.filter(x=>!x.hidden).map(x=>x.dataset.view),['']);
  assert.equal(items.some(x=>x.classList.contains('trace')),false);
  ids['domain-trace'].value='case1';ids['domain-detail'].textContent='stale detail';ids['domain-trace'].events.change();
  assert.equal(items.find(x=>x.dataset.object==='finish').classList.contains('trace'),true);
  assert.equal(items.find(x=>x.dataset.object==='retry').classList.contains('dim'),true);
  assert.notEqual(ids['domain-detail'].textContent,'stale detail');
  ids['domain-clear'].events.click();
  assert.equal(items.some(x=>x.classList.contains('dim')||x.classList.contains('trace')),false);
  ids['domain-group'].value='notes';ids['domain-group'].events.change();
  assert.deepEqual(views.filter(x=>!x.hidden).map(x=>x.dataset.view),['notes']);
});
