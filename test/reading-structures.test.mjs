import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateDomainModel} from '../src/domain-model.mjs';
import {validateReadingMap,visibleTree,visibleRelations,structureRoles,layoutVisible,nestedSvg,defaultExpanded} from '../src/nested-source.mjs';
import {createWorkbench} from '../src/workbench.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const example=path.join(root,'examples/source-structured');
const read=(name,at=example)=>JSON.parse(fs.readFileSync(path.join(at,name)));
const snapshot=()=>({model:read('model.json'),map:read('reading-map.json'),manifest:read('evidence.json')});
const find=(graph,id)=>{if(graph.id===id)return graph;for(const child of graph.children||[]){const hit=find(child,id);if(hit)return hit;}return null;};
const absolute=(graph)=>{const positions=new Map();const visit=(node,x=0,y=0)=>{const point={x:x+(node.x||0),y:y+(node.y||0),width:node.width,height:node.height};positions.set(node.id,point);for(const child of node.children||[])visit(child,point.x,point.y);};visit(graph);return positions;};

test('v3 four reviewed patterns validate without changing v2 or generating model edges',()=>{
  const {model,manifest}=snapshot();
  assert.equal(model.reading_structures.length,5);
  assert.deepEqual(new Set(model.reading_structures.map(s=>s.pattern)),new Set(['sequence','explanation','comparison','multiple']));
  assert.equal(validateDomainModel(model,manifest,example).elements.archive[0],'guide');
  const uncentered=structuredClone(model);uncentered.reading_structures[0].core_ids=[];uncentered.reading_structures[0].independent_ids=['intake','retrieval','isolated'];assert.doesNotThrow(()=>validateDomainModel(uncentered,manifest,example));
  const originalEdges=JSON.stringify(model.edges);
  const bad=(edit,re)=>{const copy=structuredClone(model);edit(copy);assert.throws(()=>validateDomainModel(copy,manifest,example),re);};
  bad(x=>delete x.reading_structures,/Missing reading_structures/);
  bad(x=>x.reading_structures[1].core_ids.pop(),/Too few cores|Member coverage mismatch/);
  bad(x=>x.reading_structures[3].supports[0].anchor_id='missing',/Invalid support role or anchor/);
  bad(x=>x.reading_structures[3].independent_ids.push('request'),/Member coverage mismatch/);
  bad(x=>x.reading_structures[3].reading_order.reverse().pop(),/Member coverage mismatch/);
  bad(x=>x.reading_structures[3].evidence=['missing'],/Invalid evidence/);
  bad(x=>x.reading_structures[3].rationale=' ',/Missing rationale/);
  bad(x=>x.reading_structures[3].extra='<script>',/Invalid fields/);
  bad(x=>x.reading_structures[3].scope_id='missing',/Invalid scope/);
  assert.equal(JSON.stringify(model.edges),originalEdges);
});

test('v3 maps four patterns to occurrences, preserves independent and missing mapped members',()=>{
  const {model,map,manifest}=snapshot();
  const digest=createHash('sha256').update(fs.readFileSync(path.join(example,'model.json'))).digest('hex');
  validateReadingMap(map,model,manifest,digest);
  assert.equal(structureRoles(map,model,'section:intake').get('section:intake/block:sorting').role,'core');
  assert.equal(structureRoles(map,model,'section:intake/block:sorting').get('section:intake/block:sorting/note:2').role,'example');
  assert.equal(structureRoles(map,model,'section:intake/block:sorting').get('section:intake/block:sorting/isolated:3').role,'independent');
  assert.equal(structureRoles(map,model,'section:intake/block:shared').get('section:intake/block:shared/request:extra').role,'condition');
  assert.equal(structureRoles(map,model,'section:retrieval/block:shared').get('section:retrieval/block:shared/note:extra').role,'core');
  const opened=new Set([...defaultExpanded(map),'section:intake','section:intake/block:sorting','section:intake/block:shared']);
  const tree=visibleTree(map,opened,model);
  const sequence=find(tree,'section:intake'),comparison=find(tree,'section:intake/block:sorting'),explanation=find(tree,'section:intake/block:shared');
  assert.ok(sequence.edges.some(e=>e.sources[0].includes('sorting')&&e.targets[0].includes('shared')));
  assert.ok(comparison.edges.some(e=>e.sources[0].includes('request')&&e.targets[0].includes('note')));
  assert.ok(explanation.edges.some(e=>e.sources[0].includes('note')&&e.targets[0].includes('request')));
  assert.ok(comparison.children.some(n=>n.id.endsWith('isolated:3')));
  const graphEdges=tree.edges.filter(e=>e.id.startsWith('ns-route-'));
  assert.ok(graphEdges.length>0);
  assert.ok(graphEdges.every(e=>e.sources[0].includes('-from')&&e.targets[0].includes('-to')&&e.labels?.[0]?.width>0));
  assert.ok(!graphEdges.some(e=>e.id.startsWith('ns-layout-')));
  const visible=new Set();const collect=node=>{visible.add(node.id);for(const child of node.children||[])collect(child);};collect(tree);
  const source=visibleRelations(map,model,visible,'source');
  assert.ok(source.routes.length>0&&source.routes.every(g=>g.origin==='source'));
});

test('ELK routes real edges with sections and labels; SVG uses returned geometry and no interpretation in source-only',async()=>{
  const {model,map}=snapshot(),opened=new Set([...defaultExpanded(map),'section:intake','section:intake/block:sorting','section:intake/block:shared']);
  const layout=await layoutVisible(map,opened,model),svg=nestedSvg(map,model,layout,opened),positions=absolute(layout);
  assert.ok(layout.edges.length>=5);
  for(const edge of layout.edges){
    assert.ok(edge.sections?.length>0,edge.id);
    assert.ok(Number.isFinite(edge.labels?.[0]?.x)&&Number.isFinite(edge.labels?.[0]?.y),edge.id);
    const offset=positions.get(edge.container)||{x:0,y:0},p=edge.sections[0].startPoint;assert.ok(svg.includes(`M ${offset.x+p.x} ${offset.y+p.y}`),`route uses ELK section in its container: ${edge.id}`);
    const caption=edge.labels[0],leafBoxes=[...positions].filter(([id])=>id.includes('/block:sorting/')||id.includes('/block:shared/')).map(([,box])=>box);
    for(const box of leafBoxes)assert.ok(offset.x+caption.x+caption.width<=box.x||box.x+box.width<=offset.x+caption.x||offset.y+caption.y+caption.height<=box.y||box.y+box.height<=offset.y+caption.y,`edge label overlaps a leaf: ${edge.id}`);
  }
  const a=positions.get('section:intake/block:sorting'),b=positions.get('section:intake/block:shared');
  assert.ok(a&&b&&a.y!==b.y);
  assert.match(svg,/ns-node occurrence core/);assert.match(svg,/ns-node occurrence independent/);
  assert.match(svg,/ns-edge interpretation/);assert.doesNotMatch(svg,/项目解释 · compared with/);
  assert.ok(!svg.includes('ns-layout-'));
  const sourceLayout=await layoutVisible(map,opened,model,'source'),sourceSvg=nestedSvg(map,model,sourceLayout,opened,'source');
  assert.ok(sourceLayout.edges.length<layout.edges.length);assert.doesNotMatch(sourceSvg,/ns-edge interpretation/);assert.doesNotMatch(sourceSvg,/speculation:4/);
});

test('comparison keeps both symmetric endpoints as equal cores without inventing direction or overlaps',async()=>{
  const {model,map}=snapshot(),structure=model.reading_structures.find(item=>item.scope_id==='sorting');
  structure.core_ids=['request','queue','note'];structure.supports=[];structure.reading_order=['request','queue','note','isolated'];
  const opened=new Set([...defaultExpanded(map),'section:intake','section:intake/block:sorting']);
  const input=visibleTree(map,opened,model,'source'),comparison=find(input,'section:intake/block:sorting');
  assert.equal(comparison.layoutOptions['elk.direction'],'RIGHT');
  const role=structureRoles(map,model,comparison.id);
  const queueId='section:intake/block:sorting/queue:1',noteId='section:intake/block:sorting/note:2';
  assert.equal(role.get(queueId).role,'core');assert.equal(role.get(noteId).role,'core');
  const visible=new Set();const collect=node=>{visible.add(node.id);for(const child of node.children||[])collect(child);};collect(input);
  const symmetric=visibleRelations(map,model,visible,'source').routes.find(group=>group.edgeIds.includes('compare'));
  assert.equal(symmetric.direction,'symmetric');assert.equal(symmetric.from,queueId);assert.equal(symmetric.to,noteId);
  const layout=await layoutVisible(map,opened,model,'source'),positions=absolute(layout),svg=nestedSvg(map,model,layout,opened,'source');
  const comparisonBoxes=[...positions].filter(([id])=>id.startsWith(`${comparison.id}/`)).map(([,box])=>box);
  for(let i=0;i<comparisonBoxes.length;i++)for(let j=i+1;j<comparisonBoxes.length;j++){
    const a=comparisonBoxes[i],b=comparisonBoxes[j];
    assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`comparison cards overlap: ${i}/${j}`);
  }
  const edge=layout.edges.find(item=>item.id===symmetric.id),container=positions.get(edge.container),label=edge.labels[0];
  for(const box of comparisonBoxes)assert.ok(container.x+label.x+label.width<=box.x||box.x+box.width<=container.x+label.x||container.y+label.y+label.height<=box.y||box.y+box.height<=container.y+label.y,`symmetric label overlaps a card`);
  const rendered=svg.match(/<g class="ns-edge[^>]*data-edges="compare"[^>]*>[\s\S]*?<\/g>/)?.[0];
  assert.ok(rendered,'symmetric source route is drawn');assert.doesNotMatch(rendered,/marker-end=/);
  assert.match(svg,new RegExp(`class="ns-node occurrence core" data-select="${queueId}"`));
  assert.match(svg,new RegExp(`class="ns-node occurrence core" data-select="${noteId}"`));
});

test('a twelve-member multiple-centre scope keeps all source cards separate',async()=>{
  const {model,map}=snapshot(),block=model.nodes.find(node=>node.id==='sorting'),template=model.nodes.find(node=>node.id==='request'),structure=model.reading_structures.find(item=>item.scope_id==='sorting');
  const added=[];
  for(let index=0;index<8;index++){
    const id=`synthetic:${index}`;added.push(id);
    model.nodes.push({...template,id,label:`Fictional measurement ${index+1}: ${index+2} × 5`});
    block.children.push(id);model.reading_order.push(id);
    map.occurrences.push({id:`section:intake/block:sorting/synthetic:${index}`,parent_id:'section:intake/block:sorting',object_id:id,order:2000+index,spans:[{paragraph_id:map.paragraphs[0].id,start:0,end:1}]});
  }
  structure.pattern='multiple';structure.core_ids=[...structure.core_ids,added[0]];
  structure.supports=[{node_id:'note',anchor_id:'request',role:'example'},{node_id:'isolated',anchor_id:'queue',role:'detail'},...added.slice(1).map((id,index)=>({node_id:id,anchor_id:structure.core_ids[index%3],role:'parameter'}))];
  structure.independent_ids=[];structure.reading_order=[...structure.core_ids,...structure.supports.map(item=>item.node_id)];
  const opened=new Set([...defaultExpanded(map),'section:intake','section:intake/block:sorting']),layout=await layoutVisible(map,opened,model,'source'),positions=absolute(layout);
  const leaves=[...positions].filter(([id])=>id.startsWith('section:intake/block:sorting/')&&id!=='section:intake/block:sorting/speculation:4').map(([,box])=>box);
  assert.equal(leaves.length,12);
  for(let i=0;i<leaves.length;i++)for(let j=i+1;j<leaves.length;j++){
    const a=leaves[i],b=leaves[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`overlap ${i}/${j}`);
  }
  assert.equal(structureRoles(map,model,'section:intake/block:sorting').size,12);
});

test('sequence anchors unconnected supports off its core axis while reverse source direction stays intact',async()=>{
  const {model,map}=snapshot(),structure=model.reading_structures.find(item=>item.scope_id==='sorting');
  structure.pattern='sequence';structure.core_ids=['request','queue'];structure.supports=[{node_id:'note',anchor_id:'request',role:'example'},{node_id:'isolated',anchor_id:'queue',role:'parameter'}];structure.independent_ids=[];structure.reading_order=['request','note','queue','isolated'];
  model.edges.push({id:'reverse',label:'Synthetic reverse relation',from:'queue',to:'request',direction:'directed',origin:'source',evidence:['guide']});
  map.edge_routes=[{edge_id:'reverse',from_id:'section:intake/block:sorting/queue:1',to_id:'section:intake/block:sorting/request:0'}];
  const opened=new Set([...defaultExpanded(map),'section:intake','section:intake/block:sorting']),input=visibleTree(map,opened,model,'source');
  const local=find(input,'section:intake/block:sorting');assert.equal(local.edges.length,3);
  assert.ok(local.edges.some(edge=>edge.sources[0].endsWith('request:0')&&edge.targets[0].endsWith('note:2')));
  assert.ok(local.edges.some(edge=>edge.sources[0].endsWith('queue:1')&&edge.targets[0].endsWith('isolated:3')));
  const semantic=visibleRelations(map,model,new Set(['chapter:library','section:collection','section:intake','section:intake/block:sorting',...local.children.map(node=>node.id)]),'source').routes;
  assert.equal(semantic.length,1);assert.equal(semantic[0].from,map.edge_routes[0].from_id);assert.equal(semantic[0].to,map.edge_routes[0].to_id);
  const layout=await layoutVisible(map,opened,model,'source'),boxes=absolute(layout),get=suffix=>boxes.get(`section:intake/block:sorting/${suffix}`),request=get('request:0'),queue=get('queue:1'),note=get('note:2'),isolated=get('isolated:3');
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),offAxis=(a,b,c)=>Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
  assert.ok(request.y<queue.y,'core sequence follows reviewed order');
  assert.ok(distance(note,request)<distance(note,queue),'first support stays near its anchor');
  assert.ok(distance(isolated,queue)<distance(isolated,request),'second support stays near its anchor');
  assert.ok(offAxis(request,queue,note)>1000&&offAxis(request,queue,isolated)>1000,'supports are not on the core axis');
  const svg=nestedSvg(map,model,layout,opened,'source');assert.match(svg,/data-edges="reverse"/);assert.match(svg,/marker-end="url\(#ns-arrow\)"/);
});

test('a block-to-ancestor-topic route uses the ancestor container coordinate system',async()=>{
  const {model,map}=snapshot();
  model.edges.push({id:'ancestor',label:'Synthetic scope interpretation',from:'sorting',to:'intake',direction:'directed',origin:'interpretation',rationale:'Fixture only.',uncertainty:'Fixture only.',premises:[{source:'guide'}],evidence:['guide']});
  map.edge_routes.push({edge_id:'ancestor',from_id:'section:intake/block:sorting',to_id:'section:intake'});
  const opened=new Set([...defaultExpanded(map),'section:intake','section:intake/block:sorting']),input=visibleTree(map,opened,model),layout=await layoutVisible(map,opened,model),positions=absolute(layout);
  const route=input.edges.find(edge=>edge.labels?.[0]?.text.startsWith('Synthetic scope'));
  assert.ok(route);const laid=layout.edges.find(edge=>edge.id===route.id),container=positions.get(laid.container),start=laid.sections[0].startPoint;
  assert.equal(laid.container,'section:intake');assert.ok(container.x>0&&container.y>0);
  const svg=nestedSvg(map,model,layout,opened);
  assert.ok(svg.includes(`M ${container.x+start.x} ${container.y+start.y}`));
  assert.match(svg,/data-edges="ancestor"/);
  assert.match(svg,/aria-label="推测关系/);
});

test('v3 public review/build/check and failed build preserve previous site',async t=>{
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'structured-reading-')));
  fs.cpSync(example,dir,{recursive:true});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const wb=await createWorkbench({project:dir});
  await wb.main(['review','--reviewer','synthetic-fixture','--decision','updated','--note','Synthetic v3 interface and geometry check only.']);
  await wb.main(['build']);await wb.main(['check']);
  const site=path.join(dir,'.diagrams/site'),html=fs.readFileSync(path.join(site,'index.html'),'utf8'),receipt=fs.readFileSync(path.join(site,'receipt.json'));
  assert.match(html,/本范围阅读结构/);assert.match(html,/推测关系/);assert.match(html,/ns-route-/);
  const changed=read('model.json',dir);changed.reading_structures[0].rationale+=' Revised synthetic rationale.';
  fs.writeFileSync(path.join(dir,'model.json'),JSON.stringify(changed));
  const changedMap=read('reading-map.json',dir);changedMap.model_sha256=createHash('sha256').update(fs.readFileSync(path.join(dir,'model.json'))).digest('hex');fs.writeFileSync(path.join(dir,'reading-map.json'),JSON.stringify(changedMap));
  await assert.rejects(wb.main(['check']),/needs-review/);
  await wb.main(['review','--reviewer','synthetic-fixture','--decision','updated','--note','Synthetic v3 rationale changed; fixture only.']);
  await wb.main(['build']);await wb.main(['check']);
  const updated=fs.readFileSync(path.join(site,'receipt.json'));
  const invalid=read('model.json',dir);invalid.reading_structures[0].core_ids.push('missing');fs.writeFileSync(path.join(dir,'model.json'),JSON.stringify(invalid));
  await assert.rejects(wb.main(['build']),/Member coverage mismatch/);
  assert.notDeepEqual(updated,receipt);assert.deepEqual(fs.readFileSync(path.join(site,'receipt.json')),updated);
});
