import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateDomainModel} from '../src/domain-model.mjs';
import {validateReadingMap,visibleTree,visibleRelations,defaultExpanded,layoutVisible,nestedSvg,occurrenceRole,summaryText} from '../src/nested-source.mjs';
import {createWorkbench} from '../src/workbench.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const example=path.join(root,'examples/source-minimal-v4');
const read=(name,dir=example)=>JSON.parse(fs.readFileSync(path.join(dir,name)));
const fixture=()=>({model:read('model.json'),map:read('reading-map.json'),manifest:read('evidence.json'),digest:createHash('sha256').update(fs.readFileSync(path.join(example,'model.json'))).digest('hex')});

test('v4 validates direct section and chapter elements, partial roles and typed relation identity',()=>{
 const {model,map,manifest,digest}=fixture();
 assert.doesNotThrow(()=>validateDomainModel(model,manifest,example));
 assert.doesNotThrow(()=>validateReadingMap(map,model,manifest,digest));
 assert.equal(occurrenceRole(map.occurrences.find(o=>o.id==='o-bell-ref'),map,model),'related');
 assert.equal(summaryText(map.containers[1],model),'');
 const implicit=structuredClone(map);delete implicit.containers[0].object_id;assert.doesNotThrow(()=>validateReadingMap(implicit,model,manifest,digest));
 const reject=(edit,re)=>{const copy=structuredClone(model);edit(copy);assert.throws(()=>validateDomainModel(copy,manifest,example),re);};
 reject(m=>m.edges[0].type='invented',/Invalid relation type/);
 reject(m=>m.edges[0].label='because',/Invalid relation type/);
 reject(m=>m.edges[1].direction='directed',/Invalid relation direction/);
 reject(m=>m.edges[3].from_element_ids=['log'],/Out-of-scope/);
 reject(m=>m.edges[2].premises[0].content_revision='',/Invalid premise source identity/);
 reject(m=>m.reading_order.push('s1'),/reading_order/);
 const rollup=structuredClone(model);rollup.edges.push({id:'support-edge',from:'bell',to:'log',type:'conditions',label:'条件',direction:'directed',origin:'source',evidence:['ledger']});rollup.edges.push({id:'source-rollup',from:'s1',to:'s2',type:'conditions',label:'条件',direction:'directed',origin:'source',evidence:['ledger'],from_element_ids:['bell'],to_element_ids:['log'],supporting_edge_ids:['support-edge']});assert.doesNotThrow(()=>validateDomainModel(rollup,manifest,example));rollup.edges.at(-1).to_element_ids=['bell'];assert.throws(()=>validateDomainModel(rollup,manifest,example),/Out-of-scope|Roll-up mismatch/);
 const empty=structuredClone(model);delete empty.reading_structures;assert.doesNotThrow(()=>validateDomainModel(empty,manifest,example));
 const wrong=structuredClone(map);wrong.occurrences.find(o=>o.id==='o-bell-ref').object_id='clock';assert.throws(()=>validateReadingMap(wrong,model,manifest,digest),/Unjustified occurrence ownership/);
});

test('v4 initial layout folds leaf sections while retaining root direct elements',async()=>{
 const {model,map}=fixture(),initial=defaultExpanded(map);
 assert.deepEqual([...initial],['root']);
 const layout=await layoutVisible(map,initial,model),svg=nestedSvg(map,model,layout,initial);
 const visible=[...svg.matchAll(/data-frame="([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(new Set(visible),new Set(['root','sec1','sec2','o-alone']));
 assert.doesNotMatch(svg,/data-frame="o-bell"|data-frame="o-log"|data-frame="o-weather"/);
 const expanded=new Set([...initial,'sec1','sec2']),full=await layoutVisible(map,expanded,model),fullSvg=nestedSvg(map,model,full,expanded);
 for(const id of ['o-bell','o-clock','o-weather','o-log','o-bell-ref','o-alone'])assert.match(fullSvg,new RegExp(`data-frame="${id}"`));
 const nestedModel=structuredClone(model),nestedMap=structuredClone(map);
 delete nestedModel.reading_structures;
 nestedModel.nodes.push({id:'subsection',label:'校准细目',kind:'section',origin:'organization',children:['clock'],evidence:['ledger']});
 nestedModel.nodes.find(n=>n.id==='s1').children=['bell','subsection','weather'];
 nestedMap.containers.push({id:'subsec',parent_id:'sec1',kind:'section',title:'校准细目',object_id:'subsection',order:3,evidence:['ledger']});
 nestedMap.occurrences.find(o=>o.id==='o-clock').parent_id='subsec';
 const nestedOpen=defaultExpanded(nestedMap);
 assert.deepEqual(new Set(nestedOpen),new Set(['root','sec1']));
 const nestedLayout=await layoutVisible(nestedMap,nestedOpen,nestedModel),nestedSvgText=nestedSvg(nestedMap,nestedModel,nestedLayout,nestedOpen);
 assert.match(nestedSvgText,/data-frame="subsec"/);
 assert.match(nestedSvgText,/data-frame="o-bell"/);
 assert.doesNotMatch(nestedSvgText,/data-frame="o-clock"|data-frame="o-log"/);
});

test('v4 nested layout retains direct members, symmetric relation, loop and isolated item',async()=>{
 const {model,map}=fixture(),expanded=new Set([...defaultExpanded(map),'sec1','sec2']);
 const graph=visibleTree(map,expanded,model),ids=new Set();const visit=n=>{ids.add(n.id);for(const c of n.children||[])visit(c);};visit(graph);
 for(const id of ['o-bell','o-clock','o-weather','o-log','o-bell-ref','o-alone'])assert.ok(ids.has(id),id);
 const routes=visibleRelations(map,model,ids).routes;
 assert.equal(routes.find(r=>r.edgeIds.includes('compare')).direction,'symmetric');
 assert.ok(routes.some(r=>r.edgeIds.includes('loop')));
 const layout=await layoutVisible(map,expanded,model),svg=nestedSvg(map,model,layout,expanded);
 assert.match(svg,/data-frame="o-alone"/);assert.match(svg,/data-frame="o-bell-ref"/);
 assert.match(svg,/ns-frame occurrence related/);assert.match(svg,/data-edges="overview"/);
 const symmetric=svg.match(/<g class="ns-edge[^>]*data-edges="compare"[^>]*>[\s\S]*?<\/g>/)?.[0];assert.ok(symmetric);assert.doesNotMatch(symmetric,/marker-end=/);
 const source=await layoutVisible(map,expanded,model,'source');assert.doesNotMatch(nestedSvg(map,model,source,expanded,'source'),/ns-edge interpretation/);
 const noEdges=structuredClone(model),noRoutes=structuredClone(map);noEdges.edges=[];noRoutes.edge_routes=[];const empty=await layoutVisible(noRoutes,expanded,noEdges);assert.match(nestedSvg(noRoutes,noEdges,empty,expanded),/data-frame=\"o-alone\"/);
});

test('v4 public review, build and check retain prior site on invalid map',async t=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'minimal-v4-')));fs.cpSync(example,dir,{recursive:true});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const wb=await createWorkbench({project:dir});
 await wb.main(['review','--reviewer','synthetic-fixture','--decision','updated','--note','Original fictional v4 interface fixture.']);
 await wb.main(['build']);await wb.main(['check']);
 const site=path.join(dir,'.diagrams/site'),html=fs.readFileSync(path.join(site,'index.html'),'utf8'),old=fs.readFileSync(path.join(site,'receipt.json'));
 assert.match(html,/第一节 校准钟声/);assert.match(html,/o-bell-ref/);assert.match(html,/paintMinimalDetail/);assert.match(html,/ID、修订与技术信息/);
 assert.match(html,/已发布要素正文/);assert.match(html,/原文证据/);
 assert.match(html,/isOccurrence\?'要素':item\.title/);
 assert.match(html,/template data-object-text="bell"/);assert.match(html,/值班员在日出前校准铜钟。/);
 assert.match(html,/published\.content\.cloneNode\(true\)/);
 assert.match(html,/elk\.bundled\.js/);
 const bad=read('reading-map.json',dir);bad.occurrences[0].parent_id='missing';fs.writeFileSync(path.join(dir,'reading-map.json'),JSON.stringify(bad));
 await assert.rejects(wb.main(['build']),/Occurrence requires block parent/);
 assert.deepEqual(fs.readFileSync(path.join(site,'receipt.json')),old);
});
