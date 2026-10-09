import ELK from 'elkjs/lib/elk.bundled.js';
import fs from 'node:fs';
import {compactLabel, renderSourceText} from './domain-v2-presentation.mjs';

const bad = message => { throw Error(`source-reading-map: ${message}`); };
const identifier = (value, label) => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(value)) bad(`Invalid ${label}`); };
const string = (value, label) => { if (typeof value !== 'string' || !value.trim()) bad(`Missing ${label}`); };
const list = (value, label) => { if (!Array.isArray(value)) bad(`Invalid ${label}`); };
const order = (value, label) => { if (!Number.isSafeInteger(value) || value < 0) bad(`Invalid ${label}`); };
const fields = (value, allowed, label) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) bad(`Invalid fields in ${label}`); };
const offset = (value, text, label) => { if (!Number.isSafeInteger(value) || value < 0 || value > Array.from(text).length) bad(`Invalid ${label}`); };

export function appendParagraphSelection(box,paragraph,spans,template,documentRef=document){
  const chars=Array.from(paragraph.text),ranges=(Array.isArray(spans)?spans:[spans]).map(span=>({start:span.start,end:span.end})).sort((a,b)=>a.start-b.start||a.end-b.end);
  const merged=[];
  for(const range of ranges){
    const previous=merged.at(-1);
    if(previous&&range.start<=previous.end)previous.end=Math.max(previous.end,range.end);
    else merged.push({...range});
  }
  if(template?.content?.querySelector('table')){
    if(template)box.append(template.content.cloneNode(true));
    const note=documentRef.createElement('p');note.append(documentRef.createTextNode('选中原文范围：'));
    merged.forEach((range,index)=>{
      if(index)note.append(documentRef.createTextNode('；'));
      const mark=documentRef.createElement('mark');mark.textContent=`${range.start}–${range.end} 字符`;mark.dataset.span=paragraph.id;mark.dataset.start=String(range.start);mark.dataset.end=String(range.end);note.append(mark);
    });
    note.append(documentRef.createTextNode('；完整安全表格见上方。'));box.append(note);
  }else{
    const pre=documentRef.createElement('div');pre.className='ns-mark';let cursor=0;
    for(const range of merged){
      pre.append(documentRef.createTextNode(chars.slice(cursor,range.start).join('')));
      const mark=documentRef.createElement('mark');mark.textContent=chars.slice(range.start,range.end).join('');mark.dataset.span=paragraph.id;mark.dataset.start=String(range.start);mark.dataset.end=String(range.end);pre.append(mark);cursor=range.end;
    }
    pre.append(documentRef.createTextNode(chars.slice(cursor).join('')));box.append(pre);
  }
}
export function groupParagraphSpans(spans){
  const grouped=new Map();
  for(const span of spans||[]){if(!grouped.has(span.paragraph_id))grouped.set(span.paragraph_id,[]);grouped.get(span.paragraph_id).push(span);}
  return [...grouped.values()];
}
export function activateNestedKey(event,MouseEventRef=MouseEvent){
  if(!['Enter',' '].includes(event.key))return false;
  const target=event.target.closest('[data-full-block],[data-toggle],[data-edges],[data-select]');
  if(!target||target.tagName==='BUTTON')return false; // Native buttons already synthesize one click.
  event.preventDefault();target.dispatchEvent(new MouseEventRef('click',{bubbles:true}));return true;
}
export function applyNestedViewport(canvas,svg,scale,panX,panY,resetScroll=false){
  if(resetScroll){canvas.scrollLeft=0;canvas.scrollTop=0;}
  if(svg)svg.style.transform=`translate(${panX}px, ${panY}px) scale(${scale})`;
}
export function validateReadingMap(map, model, manifest, modelHash) {
  fields(map, ['schema_version','title','model_sha256','root_id','author','source_release','metadata','containers','occurrences','paragraphs','edge_routes'], 'map');
  const v2=map.schema_version==='source-reading-map/v2';
  if (!v2 && map.schema_version !== 'source-reading-map/v1') bad('Unsupported schema');
  if(v2 && !['diagram-domain-model/v4','diagram-domain-model/v5'].includes(model.schema_version))bad('Map v2 requires domain v4 or v5');
  string(map.title, 'title');
  if (typeof map.model_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(map.model_sha256) || map.model_sha256 !== modelHash) bad('model_sha256 mismatch');
  fields(map.author, ['identity','model'], 'author'); string(map.author.identity, 'author.identity'); string(map.author.model, 'author.model');
  if(map.source_release !== undefined){fields(map.source_release,['artifact_revision_id','export_sha256','model_sha256','organization_sha256','transcription_sha256'],'source_release');string(map.source_release.artifact_revision_id,'artifact_revision_id');for(const key of ['export_sha256','model_sha256','organization_sha256','transcription_sha256'])if(typeof map.source_release[key]!=='string'|| !/^[a-f0-9]{64}$/.test(map.source_release[key]))bad(`Invalid source_release.${key}`);if(map.source_release.model_sha256!==modelHash)bad('source_release.model_sha256 mismatch');}
  if(map.metadata !== undefined){fields(map.metadata,['boundary_review_ref'],'metadata');if(map.metadata.boundary_review_ref!==undefined)string(map.metadata.boundary_review_ref,'boundary_review_ref');}
  for (const key of ['containers','occurrences','paragraphs','edge_routes']) list(map[key], key);
  if (!map.containers.length || !map.paragraphs.length) bad('Missing containers or paragraphs');
  const modelNodes = new Map(model.nodes.map(x => [x.id,x])), modelEdges = new Map(model.edges.map(x => [x.id,x]));
  const evidence = (ids, label) => { list(ids,label); if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(manifest.sources,id))) bad(`Invalid evidence for ${label}`); };
  const allIds = new Set(), containers = new Map(), occurrences = new Map(), paragraphs = new Map(), locators = new Set(), paragraphOrders = new Set();
  const unique = (id,label) => { identifier(id,label); if (allIds.has(id)) bad(`Duplicate ID: ${id}`); allIds.add(id); };
  for (const p of map.paragraphs) {
    fields(p,['id','locator','order','text','evidence','continues_from'],'paragraph'); unique(p.id,'paragraph ID'); string(p.locator,'paragraph locator'); string(p.text,'paragraph text'); order(p.order,'paragraph order'); evidence(p.evidence,p.id);
    if (locators.has(p.locator) || paragraphOrders.has(p.order)) bad(`Duplicate paragraph locator/order: ${p.id}`);
    locators.add(p.locator); paragraphOrders.add(p.order); paragraphs.set(p.id,p);
  }
  for(const p of map.paragraphs)if(p.continues_from!==undefined){identifier(p.continues_from,'continues_from');const previous=paragraphs.get(p.continues_from);if(!previous || previous.order>=p.order)bad(`Invalid continues_from: ${p.id}`);}
  const position = ref => { fields(ref,['paragraph_id','offset'],'range endpoint'); identifier(ref.paragraph_id,'range paragraph_id'); const p=paragraphs.get(ref.paragraph_id); if(!p) bad(`Unknown range paragraph: ${ref.paragraph_id}`); offset(ref.offset,p.text,'range offset'); return [p.order,ref.offset]; };
  const compare = (a,b) => a[0]-b[0] || a[1]-b[1];
  for (const c of map.containers) {
    fields(c,['id','parent_id','kind','title','object_id','order','evidence','summary','range'],'container'); unique(c.id,'container ID'); string(c.title,'container title'); order(c.order,'container order'); evidence(c.evidence,c.id);
    if (!['chapter','section','block'].includes(c.kind)) bad(`Invalid container kind: ${c.id}`);
    if (c.parent_id !== null) identifier(c.parent_id,'parent_id');
    if (c.kind === 'block' && !c.object_id) bad(`Block requires object_id: ${c.id}`);
    if (c.object_id !== undefined) {
      identifier(c.object_id,'object_id'); const item=modelNodes.get(c.object_id); if (!item) bad(`Unknown object_id: ${c.object_id}`);
      if (c.kind === 'block' && item.kind !== 'block') bad(`Block object must be model block: ${c.id}`);
      if (c.kind === 'section' && item.kind !== (v2?'section':'topic')) bad(`Section object mapping mismatch: ${c.id}`);
      if (c.kind === 'chapter' && (!v2 || item.kind!=='chapter')) bad(`Chapter object mapping mismatch: ${c.id}`);
    }
    if (c.summary !== undefined) { fields(c.summary,['text','origin','evidence'],'summary'); string(c.summary.text,'summary text'); if (!['source','interpretation'].includes(c.summary.origin)) bad(`Invalid summary origin: ${c.id}`); evidence(c.summary.evidence,`${c.id} summary`); }
    if (c.range !== undefined) { fields(c.range,['start','end'],'range'); if (compare(position(c.range.start),position(c.range.end)) >= 0) bad(`Invalid range order: ${c.id}`); }
    containers.set(c.id,c);
  }
  identifier(map.root_id,'root_id'); const root=containers.get(map.root_id);
  if (!root || root.kind !== 'chapter' || root.parent_id !== null) bad('Root must be chapter with null parent');
  if(v2 && root.object_id && root.object_id!==model.root_id)bad('Root object mapping mismatch');
  const siblingOrders = new Set();
  for (const c of map.containers) {
    if (c.id === map.root_id) continue;
    const parent=containers.get(c.parent_id); if (!parent) bad(`Unknown parent: ${c.id}`);
    if (c.kind === 'chapter' || parent.kind === 'block' || (!v2 && c.kind === 'block' && parent.kind !== 'section')) bad(`Invalid container nesting: ${c.id}`);
    if(v2 && c.object_id && (parent.object_id||parent.id===map.root_id)){
      const owner=modelNodes.get(parent.object_id||(parent.id===map.root_id?model.root_id:null));
      if(!(owner.children||[]).includes(c.object_id) && !(owner.related_element_ids||[]).includes(c.object_id))bad(`Unjustified container ownership: ${c.id}`);
    }
    const key=`${parent.id}/${c.order}`; if (siblingOrders.has(key)) bad(`Duplicate sibling order: ${c.id}`); siblingOrders.add(key);
  }
  const visited=new Set(), visiting=new Set();
  const walk=id=>{ if(visiting.has(id)) bad(`Container cycle: ${id}`); if(visited.has(id))return; visiting.add(id); for(const c of map.containers.filter(x=>x.parent_id===id))walk(c.id); visiting.delete(id);visited.add(id); };
  walk(map.root_id); if (visited.size!==containers.size){for(const c of map.containers)if(!visited.has(c.id))walk(c.id);bad('Unreachable containers');}
  for (const o of map.occurrences) {
    fields(o,['id','parent_id','object_id','order','spans'],'occurrence'); unique(o.id,'occurrence ID'); identifier(o.parent_id,'occurrence parent'); identifier(o.object_id,'occurrence object'); order(o.order,'occurrence order');
    const parent=containers.get(o.parent_id); if (!parent || (!v2&&parent.kind!=='block')) bad(`Occurrence requires block parent: ${o.id}`);
    if (!modelNodes.has(o.object_id)) bad(`Unknown occurrence object: ${o.object_id}`);
    const owner=modelNodes.get(parent.object_id||(parent.id===map.root_id?model.root_id:null));if(!owner||!(owner.children||[]).includes(o.object_id)&&!(owner.related_element_ids||[]).includes(o.object_id))bad(`Unjustified occurrence ownership: ${o.id}`);
    list(o.spans,`spans for ${o.id}`); if (!o.spans.length) bad(`Missing spans: ${o.id}`);
    let previous=null;
    for(const s of o.spans){ fields(s,['paragraph_id','start','end'],'span'); identifier(s.paragraph_id,'span paragraph'); const p=paragraphs.get(s.paragraph_id); if(!p)bad(`Unknown paragraph: ${s.paragraph_id}`); offset(s.start,p.text,'span start'); offset(s.end,p.text,'span end'); if(s.start>=s.end)bad(`Empty span: ${o.id}`); const at=[p.order,s.start]; if(previous && compare(previous,at)>0)bad(`Unordered spans: ${o.id}`); previous=[p.order,s.end]; }
    occurrences.set(o.id,o);
  }
  const endpoint = id => containers.get(id)?.object_id || (v2&&id===map.root_id?model.root_id:null) || occurrences.get(id)?.object_id;
  const routeKeys=new Set();
  for(const route of map.edge_routes){
    fields(route,['edge_id','from_id','to_id'],'edge_route'); identifier(route.edge_id,'route edge'); identifier(route.from_id,'route from'); identifier(route.to_id,'route to');
    const edge=modelEdges.get(route.edge_id); if(!edge)bad(`Unknown route edge: ${route.edge_id}`);
    if(endpoint(route.from_id)!==edge.from || endpoint(route.to_id)!==edge.to)bad(`Route endpoint mismatch: ${route.edge_id}`);
    const key=`${route.edge_id}/${route.from_id}/${route.to_id}`; if(routeKeys.has(key))bad(`Duplicate route: ${key}`);routeKeys.add(key);
  }
  return map;
}

const elk = new ELK();
const layoutOptions={'elk.algorithm':'layered','elk.direction':'DOWN','elk.edgeRouting':'ORTHOGONAL','elk.spacing.nodeNode':'42','elk.layered.spacing.nodeNodeBetweenLayers':'64','elk.spacing.edgeNode':'22','elk.spacing.edgeEdge':'16','elk.hierarchyHandling':'INCLUDE_CHILDREN'};
const childrenOf=(map,parent)=>[...map.containers.filter(c=>c.parent_id===parent),...map.occurrences.filter(o=>o.parent_id===parent)].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
export const sourceKindName=kind=>({assertion:'断言',action:'动作',condition:'条件',exception:'例外',reason:'理由',parameter:'参数',example:'示例',unresolved:'待核'})[kind]||kind||'要素';
export function shortRelationLabel(value,limit=48){
  const raw=String(value??''),lead=raw.split(/\n\s*\n|<table\b|\n\s*\|/i)[0].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()||'表格原文';
  const chars=Array.from(lead),short=chars.slice(0,limit).join('');
  return short+(chars.length>limit||lead!==raw.trim().replace(/\s+/g,' ')?'…':'');
}
export function relationValueLabel(value){
  if(value==='possible')return '可选';
  if(typeof value==='string')return value;
  if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['amount','unit','basis','scope'].includes(key))&&['amount','unit'].every(key=>typeof value[key]==='string'||typeof value[key]==='number')){
    return `${value.amount} ${value.unit}${value.basis?` · 基准：${value.basis}`:''}${value.scope?` · 范围：${value.scope}`:''}`;
  }
  return JSON.stringify(value);
}
export function sourceReferencePresentation(ref,source){
  const hasValue=Object.hasOwn(ref,'value'),value=hasValue?relationValueLabel(ref.value):null;
  return {value,linkLabel:source?(hasValue&&source.label.trim()===value.trim()?'查看来源':shortRelationLabel(source.label,48)):null};
}
export function nearestSourceSection(map,id){
  const items=new Map([...map.containers,...map.occurrences].map(item=>[item.id,item]));
  let at=items.get(id);
  while(at){if(at.kind==='section')return at.id;at=items.get(at.parent_id);}
  return null;
}
export function sectionBlockIds(map,sectionId){
  if(!map.containers.some(item=>item.id===sectionId&&item.kind==='section'))return [];
  return map.containers.filter(item=>item.kind==='block'&&nearestSourceSection(map,item.id)===sectionId).map(item=>item.id);
}
export function setSectionBlocksExpanded(map,expanded,sectionId,open){
  const next=new Set(expanded);
  for(const id of sectionBlockIds(map,sectionId)){if(open)next.add(id);else next.delete(id);}
  return next;
}
export function relationIdentityCounts(model){
  const counts={explicit:0,inferred:0,project:0,rollup:0};
  for(const edge of model.edges||[]){
    if(edge.origin==='interpretation'||edge.basis==='project_interpretation')counts.project++;
    else if(edge.basis==='explicit')counts.explicit++;
    else if(edge.basis==='inferred_from_source')counts.inferred++;
    else if(edge.relation_form==='source_rollup'||edge.basis==='source_rollup')counts.rollup++;
  }
  return counts;
}
export function relationBasisName(edge){
  if(edge.origin==='interpretation'||edge.basis==='project_interpretation')return '补充推测';
  if(edge.relation_form==='source_rollup'||edge.basis==='source_rollup')return '来源汇总';
  if(edge.basis==='inferred_from_source')return '来源隐含';
  if(edge.basis==='explicit')return '原文明示';
  return edge.origin==='source'?'来源关系':'推测关系';
}
export const relationFormName=form=>({source_atomic:'来源原子',source_native:'来源原生',source_rollup:'来源汇总',project_inference:'项目推测'})[form]||'来源关系';
const relationCaption=(group,edgeIndex)=>{
  if(group.relationForm){const edge=edgeIndex.get(group.edgeIds[0]),name=edge?.label||group.type||'关系';return name+(group.edgeIds.length>1?` · ${group.edgeIds.length}条`:'')+(group.partial?' · 部分成员':'');}
  if(group.collapsed)return `底层关系汇总 · ${group.edgeIds.length}条`;
  if(group.edgeIds.length!==1)return `含${group.edgeIds.length}条关系`;
  const edge=edgeIndex.get(group.edgeIds[0]),short=Array.from(edge?.label||'').slice(0,17).join('');
  return short+(Array.from(edge?.label||'').length>17?'…':'');
};
export function visibleRelations(map,model,visibleIds,layer='all'){
  const items=new Map([...map.containers,...map.occurrences].map(item=>[item.id,item]));
  const visible=new Set(visibleIds),edgeIndex=new Map(model.edges.map(edge=>[edge.id,edge])),nodeIndex=new Map((model.nodes||[]).map(node=>[node.id,node]));
  const proxy=id=>{let at=id;while(at&&!visible.has(at))at=items.get(at)?.parent_id;return at;};
  const routes=[],internals=new Map(),collapsed=new Map(),v5=model.schema_version==='diagram-domain-model/v5';
  const scopeLeaves=id=>{const found=new Set(),seen=new Set(),walk=at=>{if(seen.has(at))return;seen.add(at);const node=nodeIndex.get(at);if(!node)return;if(!(node.children||[]).length&&!['chapter','section','topic','block'].includes(node.kind))found.add(at);for(const child of node.children||[])walk(child);for(const related of node.related_element_ids||[])walk(related);};walk(id);return found;};
  const partial=edge=>v5&&['from','to'].some(side=>{const ids=edge[`${side}_element_ids`];return ids?.length&&scopeLeaves(edge[side]).size>ids.length;});
  const directPairVisible=pair=>map.edge_routes.some(route=>{if(route.edge_id!==pair.edge_id||!visible.has(route.from_id)||!visible.has(route.to_id))return false;const edge=edgeIndex.get(route.edge_id);if(!edge||layer==='source'&&edge.origin==='interpretation')return false;const from=items.get(route.from_id)?.object_id,to=items.get(route.to_id)?.object_id;return from===pair.from&&to===pair.to||edge.direction==='symmetric'&&from===pair.to&&to===pair.from;});
  const exposedRollups=new Set(v5?model.edges.filter(edge=>edge.relation_form==='source_rollup'&&edge.endpoint_pairs?.length&&edge.endpoint_pairs.every(directPairVisible)).map(edge=>edge.id):[]);
  const represented=new Map();
  if(v5)for(const route of map.edge_routes){
    const edge=edgeIndex.get(route.edge_id);
    if(edge?.relation_form!=='source_rollup'||exposedRollups.has(edge.id)||layer==='source'&&edge.origin==='interpretation')continue;
    const from=proxy(route.from_id),to=proxy(route.to_id);if(!from||!to)continue;
    for(const id of edge.supporting_edge_ids||[]){if(!represented.has(id))represented.set(id,[]);represented.get(id).push({from,to,direction:edge.direction});}
  }
  for(const route of map.edge_routes){
    const edge=edgeIndex.get(route.edge_id);if(!edge||exposedRollups.has(edge.id)||(layer==='source'&&edge.origin==='interpretation'))continue;
    const from=proxy(route.from_id),to=proxy(route.to_id);if(!from||!to)continue;
    const folded=from!==route.from_id||to!==route.to_id;
    if(v5&&folded&&edge.relation_form==='source_atomic'&&(represented.get(edge.id)||[]).some(pair=>pair.from===from&&pair.to===to||pair.direction==='symmetric'&&pair.from===to&&pair.to===from))continue;
    const identity=v5?[edge.type,edge.relation_form,JSON.stringify(edge.qualifiers||[])].join('\0'):'';
    if(folded&&from===to){if(!internals.has(from))internals.set(from,v5?{at:from,edgeIds:new Set()}:{at:from,edgeIds:new Set(),origin:edge.origin,direction:edge.direction,type:edge.type,relationForm:edge.relation_form});internals.get(from).edgeIds.add(edge.id);continue;}
    if(folded){const key=[from,to,edge.origin,edge.direction,identity].join('\0');if(!collapsed.has(key))collapsed.set(key,{from,to,origin:edge.origin,direction:edge.direction,type:edge.type,relationForm:edge.relation_form,edgeIds:[],collapsed:true,partial:false});const group=collapsed.get(key);group.partial ||= partial(edge);if(!group.edgeIds.includes(edge.id))group.edgeIds.push(edge.id);}
    else routes.push({from,to,origin:edge.origin,direction:edge.direction,type:edge.type,relationForm:edge.relation_form,edgeIds:[edge.id],collapsed:false,partial:partial(edge)});
  }
  routes.push(...collapsed.values());
  return {routes:routes.map((group,index)=>({...group,id:`ns-route-${index}`,caption:relationCaption(group,edgeIndex)})),internals};
}
export function structureRoles(map,model,parentId){
  const item=map.containers.find(container=>container.id===parentId);if(!item)return new Map();
  const scope=item.object_id||(parentId===map.root_id?model.root_id:null);
  const structure=model.reading_structures?.find(value=>value.scope_id===scope);
  if(!structure)return new Map();
  const children=childrenOf(map,parentId),roles=new Map(),byObject=new Map();
  for(const child of children){const key=child.object_id;if(!key)continue;if(!byObject.has(key))byObject.set(key,[]);byObject.get(key).push(child.id);}
  const set=(ids,role,anchor=null)=>{for(const id of ids)for(const shown of byObject.get(id)||[])roles.set(shown,{role,anchor,pattern:structure.pattern,structureId:structure.id,rank:(structure.reading_order||[]).indexOf(id)});};
  set(structure.core_ids||[],'core');for(const support of structure.supports||[])set([support.node_id],support.role,support.anchor_id);set(structure.independent_ids||[],'independent');
  return roles;
}
export const readingRoleName=role=>({core:'核心',independent:'独立',condition:'条件',parameter:'参数',reason:'理由',example:'示例',detail:'细节',exception:'例外'})[role]||'';
export function occurrenceRole(item,map,model){
  if(item.kind)return null;
  const parent=map.containers.find(c=>c.id===item.parent_id),owner=model.nodes.find(n=>n.id===(parent?.object_id||(parent?.id===map.root_id?model.root_id:null)));
  return (owner?.related_element_ids||[]).includes(item.object_id)?'related':'member';
}
export function sourceOrdinal(item,map){
  const refs=item.range?[item.range.start.paragraph_id]:item.spans?.map(s=>s.paragraph_id)||map.occurrences.filter(o=>o.parent_id===item.id).flatMap(o=>o.spans.map(s=>s.paragraph_id));
  const orders=refs.map(id=>map.paragraphs.find(p=>p.id===id)?.order).filter(Number.isInteger).sort((a,b)=>a-b);
  return orders[0]??(item.kind==='chapter'||item.kind==='section'?item.order:undefined);
}
export function fullBlockView(map,model,id){
  const block=model.nodes.find(n=>n.id===id&&n.kind==='block');if(!block)return null;
  const located=ids=>ids.map(objectId=>({node:model.nodes.find(n=>n.id===objectId),appearances:map.occurrences.filter(o=>o.object_id===objectId)}));
  return {block,locations:map.containers.filter(c=>c.kind==='block'&&c.object_id===id),members:located(block.children||[]),related:located(block.related_element_ids||[])};
}
export function summaryText(item,model,layer='all'){
  if(['diagram-domain-model/v4','diagram-domain-model/v5'].includes(model?.schema_version))return '';
  if(item.summary)return layer==='source'&&item.summary.origin==='interpretation'?'':item.summary.text;
  const source=model?.nodes.find(n=>n.id===item.object_id);
  return (source?.summary||[]).filter(x=>layer==='all'||x.origin==='source').map(x=>x.text).join('；');
}
export function titleLines(item,model){
  const raw=String(item.title||model?.nodes.find(n=>n.id===item.object_id)?.label||item.object_id||'');
  let first=raw.split(/\n\s*\n/)[0].split(/<table\b|\n\s*\|/i)[0].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  if(!first)first='表格原文';
  const perLine=item.kind==='chapter'?18:item.kind==='section'?16:item.kind==='block'?13:11;
  const chars=Array.from(first),omitted=chars.length>perLine*2||first!==raw.trim().replace(/\s+/g,' '),show=chars.slice(0,perLine*2);
  if(omitted){if(show.length>=perLine*2)show[show.length-1]='…';else show.push('…');}
  const lines=[];for(let at=0;at<show.length;at+=perLine)lines.push(show.slice(at,at+perLine).join(''));
  return lines.length?lines:[''];
}
export function headerHeight(item,model,layer='all'){
  if(!item.kind)return 77;
  const perLine=item.kind==='chapter'?22:item.kind==='section'?18:16;
  const lines=Math.ceil(Array.from(summaryText(item,model,layer)).length/perLine);
  return Math.max(item.kind==='chapter'?115:item.kind==='section'?105:94,65+(titleLines(item,model).length-1)*18+lines*18+38);
}
export function defaultExpanded(map){const opened=new Set([map.root_id]);for(const c of map.containers){if(c.kind!=='section')continue;const hasNestedSection=map.containers.some(x=>x.parent_id===c.id&&x.kind==='section');if(hasNestedSection&&(map.schema_version==='source-reading-map/v2'||!map.containers.some(x=>x.parent_id===c.id&&x.kind==='block')))opened.add(c.id);}return opened;}
export function visibleTree(map, expanded=defaultExpanded(map),model=null,layer='all') {
  const index=new Map([...map.containers,...map.occurrences].map(x=>[x.id,x]));
  const nodes=new Map();
  const make=(id)=>{const item=index.get(id),layoutRoles=structureRoles(map,model||{root_id:null},id),ordered=childrenOf(map,id).filter(x=>layer!=='source'||x.kind||model?.nodes.find(n=>n.id===x.object_id)?.origin!=='interpretation').sort((a,b)=>{
    const x=layoutRoles.get(a.id),y=layoutRoles.get(b.id),rank=value=>value?.role==='core'?0:value?.role==='independent'?2:value?1:3;
    return rank(x)-rank(y)||(x?.rank??a.order)-(y?.rank??b.order)||a.id.localeCompare(b.id);
  }),child=map.containers.some(x=>x.id===id) && expanded.has(id) ? ordered.map(x=>make(x.id)):[];
    const role=structureRoles(map,model||{root_id:null},id),mapped=child.filter(x=>role.has(x.id)),pattern=role.get(mapped[0]?.id)?.pattern;
    const orgEdges=[];const cores=mapped.filter(x=>role.get(x.id).role==='core');
    if(pattern==='sequence')for(let i=1;i<cores.length;i++)orgEdges.push({id:`ns-layout-${id}-${i}`,sources:[cores[i-1].id],targets:[cores[i].id],layoutOptions:{'elk.layered.priority.direction':'10'}});
    if(pattern)for(const node of mapped){const r=role.get(node.id),anchor=mapped.find(x=>index.get(x.id)?.object_id===r.anchor);if(anchor)orgEdges.push({id:`ns-layout-${id}-${orgEdges.length}`,sources:[anchor.id],targets:[node.id],layoutOptions:{'elk.layered.priority.direction':'10'}});}
    const result={id,width:item.kind==='chapter'?310:item.kind==='section'?268:item.kind==='block'?230:194,height:headerHeight(item,model,layer),...(child.length?{children:child}:{}),...(orgEdges.length?{edges:orgEdges}:{}),layoutOptions:{'elk.padding':`[top=${headerHeight(item,model,layer)+16},left=24,bottom=24,right=24]`,'elk.spacing.nodeNode':item.kind==='chapter'?'170':'42',...(pattern?{'elk.direction':pattern==='sequence'||pattern==='comparison'?'RIGHT':'DOWN'}:{})}};
    nodes.set(id,result);return result;};
  const root=make(map.root_id),relations=visibleRelations(map,model||{edges:[]},nodes.keys(),layer);
  const edges=relations.routes.map(group=>{const from=nodes.get(group.from),to=nodes.get(group.to),source=`${group.id}-from`,target=`${group.id}-to`;
    from.ports??=[];to.ports??=[];from.ports.push({id:source,width:6,height:6});to.ports.push({id:target,width:6,height:6});
    return {id:group.id,sources:[source],targets:[target],labels:[{text:group.caption,width:Math.min(220,Math.max(48,Array.from(group.caption).length*12+16)),height:24}]};});
  return {id:'reading-root',children:[root],edges,layoutOptions};
}
export async function layoutVisible(map,expanded,model=null,layer='all') { return elk.layout(visibleTree(map,expanded,model,layer)); }

export function nestedSvg(map,model,layout,expanded,layer='all',esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))) {
  const items=new Map([...map.containers,...map.occurrences].map(x=>[x.id,x])); const positions=new Map(); const frames=[],labels=[];
  const visit=(node,ox=0,oy=0,depth=0)=>{
    const x=ox+(node.x||0),y=oy+(node.y||0); if(node.id!=='reading-root'){
      const item=items.get(node.id),role=occurrenceRole(item,map,model),readingRole=structureRoles(map,model,item.parent_id).get(node.id)?.role,sourceOrder=sourceOrdinal(item,map),title=item.title||model.nodes.find(n=>n.id===item.object_id)?.label||item.object_id;
      positions.set(node.id,{x,y,width:node.width,height:node.height,item,depth});
      const open=expanded.has(node.id), count=childrenOf(map,node.id).length, visibleTitle=titleLines(item,model);const summary=summaryText(item,model,layer),summaryChars=Array.from(summary),lineWidth=item.kind==='chapter'?22:item.kind==='section'?18:16,summaryLines=[];for(let at=0;at<summaryChars.length;at+=lineWidth)summaryLines.push(summaryChars.slice(at,at+lineWidth).join(''));
      const object=model.nodes.find(n=>n.id===item.object_id),v5=model.schema_version==='diagram-domain-model/v5',typeLabel=item.kind==='block'&&v5?(object?.content_types||[]).map(id=>model.content_types.entries.find(entry=>entry.id===id)?.label||id).join('、'):'';
      const accessibleTitle=(v5&&item.kind==='block'?'知识块 · ':v5&&!item.kind?sourceKindName(object?.kind)+' · ':'')+(readingRole?readingRoleName(readingRole)+' · ':'')+(role==='related'?'关联引用 · ':'')+title+(v5&&item.kind==='block'?` · 内容类型 ${typeLabel}`:'');
      frames.push(`<rect class="ns-frame ${esc(item.kind||'occurrence')} ${role==='related'?'related':''} ${readingRole==='core'?'core':readingRole==='independent'?'independent':readingRole?'support':''}" data-frame="${esc(node.id)}" x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="10"/>`);labels.push(`<g class="ns-node ${esc(item.kind||'occurrence')} ${esc(readingRole||'')}" data-select="${esc(node.id)}" role="button" tabindex="0" aria-label="${esc(accessibleTitle)}"><text class="ns-kind" x="${x+13}" y="${y+22}">${esc(v5?(item.kind?item.kind==='block'?typeLabel:`${count} 项`:sourceKindName(object?.kind)+(role==='related'?' · 跨节引用':'')):model.schema_version==='diagram-domain-model/v4'?(item.kind?count+' 项':(role==='related'?'跨节引用':readingRole?readingRoleName(readingRole):'')):(item.kind==='chapter'?'原书章':item.kind==='section'?'原书节':item.kind==='block'?'项目块':role==='related'?'关联引用':'成员出现')+(readingRole?' · '+readingRoleName(readingRole):'')+(sourceOrder!==undefined?' · 原文序 '+sourceOrder:''))}</text>${visibleTitle.map((line,i)=>`<text x="${x+13}" y="${y+50+i*18}">${esc(line)}</text>`).join('')}${summaryLines.map((line,i)=>`<text class="ns-summary" x="${x+13}" y="${y+72+(visibleTitle.length-1)*18+i*18}">${esc(line)}</text>`).join('')}${count?`<g data-toggle="${esc(node.id)}" role="button" tabindex="0" aria-label="${open?'收起':'展开'} ${esc(title)}"><rect class="ns-toggle" x="${x+node.width-36}" y="${y+10}" width="26" height="26" rx="5"/><text x="${x+node.width-30}" y="${y+30}">${open?'−':'+'}</text></g>`:''}</g>`);
    }
    for(const child of node.children||[])visit(child,x,y,depth+1);
  }; visit(layout);
  const {routes,internals}=visibleRelations(map,model,positions.keys(),layer);
  const routeIndex=new Map(routes.map(group=>[group.id,group]));
  const edgeLayouts=[];
  const collectEdges=(node,ox=0,oy=0)=>{
    const x=ox+(node.x||0),y=oy+(node.y||0);
    for(const edge of node.edges||[])if(routeIndex.has(edge.id)){
      const container=edge.container&&positions.get(edge.container);
      edgeLayouts.push({edge,x:container?.x??x,y:container?.y??y});
    }
    for(const child of node.children||[])collectEdges(child,x,y);
  };collectEdges(layout);
  const paths=edgeLayouts.map(({edge,x,y})=>{
    const group=routeIndex.get(edge.id),ids=group.edgeIds.join(',');
    const d=(edge.sections||[]).map(section=>{
      const points=[section.startPoint,...section.bendPoints||[],section.endPoint].filter(Boolean);
      return points.map((point,index)=>`${index?'L':'M'} ${x+point.x} ${y+point.y}`).join(' ');
    }).join(' ');
    if(!d)throw Error(`ELK omitted route sections: ${edge.id}`);
    const label=edge.labels?.[0],caption=group.caption,labelWidth=label?.width||Math.min(220,Math.max(48,Array.from(caption).length*12+16));
    const labelMarkup=label&&Number.isFinite(label.x)&&Number.isFinite(label.y)?`<rect x="${x+label.x-5}" y="${y+label.y-2}" width="${labelWidth+10}" height="${label.height+4}" rx="5" fill="white" stroke="#a4baca"/><text x="${x+label.x+labelWidth/2}" y="${y+label.y+16}" text-anchor="middle">${esc(caption)}</text>`:'';
    return `<g class="ns-edge ${group.origin==='interpretation'?'interpretation':''}" data-edges="${esc(ids)}" role="button" tabindex="0" aria-label="${esc((group.origin==='interpretation'?'推测关系 · ':'来源关系 · ')+caption)}"><path d="${d}"${group.direction==='directed'?' marker-end="url(#ns-arrow)"':''}/><path class="hit" d="${d}"/>${labelMarkup}</g>`;
  }).join('');
  const badges=[...internals.values()].map(group=>{const p=positions.get(group.at),x=p.x+12,y=p.y+headerHeight(p.item,model,layer)-32,v5=model.schema_version==='diagram-domain-model/v5',label=v5?`内含${group.edgeIds.size}条关系`:`内部${group.edgeIds.size}条关系`;return `<g class="${v5?'ns-internal':`ns-edge internal ${group.origin==='interpretation'?'interpretation':''}`}" data-edges="${esc([...group.edgeIds].join(','))}" role="button" tabindex="0" aria-label="${esc(label+(v5?'，打开查看每条真实关系':''))}"><rect x="${x}" y="${y}" width="${v5?140:Math.max(140,Array.from(label).length*13)}" height="25" rx="12" fill="#dceaf6" stroke="#376485"/><text x="${x+8}" y="${y+18}">${esc(label)}</text></g>`;}).join('');
  const width=Math.max(360,Math.ceil(layout.width||360)),height=Math.max(240,Math.ceil(layout.height||240));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="原书结构与模型关系"><style>.ns-frame{fill:#fff;stroke:#526e86;stroke-width:2}.ns-frame.chapter{fill:#e6f1fc;stroke-width:3}.ns-frame.section{fill:#eef7ff}.ns-frame.block{fill:#fff9e9}.ns-frame.related{stroke-dasharray:5 3}.ns-frame.core{stroke:#176197;stroke-width:3}.ns-frame.support{stroke:#7b6f58}.ns-frame.independent{stroke:#8b97a2;stroke-dasharray:4 4}.ns-node .ns-toggle{fill:#dbe9f9;stroke:#195890}.ns-node text{font:15px system-ui;fill:#173650}.ns-node .ns-summary{font:12px system-ui;fill:#173650}.ns-node .ns-kind{font-size:12px}.ns-node .ns-toggle{fill:#dbe9f9;stroke:#195890}.ns-edge path{fill:none;stroke:#376485;stroke-width:2}.ns-edge.interpretation path:not(.hit){stroke:#a45d42;stroke-dasharray:6 4}.ns-edge.interpretation text{fill:#8a452e}.ns-node.core>text:not(.ns-kind){font-weight:700}.ns-node.independent>text{fill:#556575}.ns-selected{filter:drop-shadow(0 0 5px #d48620)}.ns-on-path{stroke:#d48620;stroke-width:3.5}.ns-edge .hit{stroke:transparent;stroke-width:18}.ns-edge text{font:12px system-ui;fill:#173650;paint-order:stroke;stroke:#fff;stroke-width:5px}.ns-internal text{font:12px system-ui;fill:#173650}.ns-node,.ns-edge,.ns-internal{cursor:pointer}.ns-node:focus,.ns-edge:focus,.ns-internal:focus{outline:3px solid #116dd8}</style><defs><marker id="ns-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#376485"/></marker></defs>${frames.join('')}${paths}${badges}${labels.join('')}</svg>`;
}

function safeJson(data){return JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028|\u2029/g,c=>c==='\u2028'?'\\u2028':'\\u2029');}
export async function renderNestedSource({model,manifest,readingMap:map,page,esc,docName,notice}){
  const initial=defaultExpanded(map); const layout=await layoutVisible(map,initial,model);const svg=nestedSvg(map,model,layout,initial,'all',esc);
  const sources=Object.fromEntries(Object.entries(manifest.sources).map(([id,s])=>[id,{label:s.label,href:'docs/'+docName(s.path),excerpt:s.excerpt||'',location:s.location||''}]));
  const data=safeJson({map,model,sources});
  const relationCounts=relationIdentityCounts(model);
  const sectionOptions=map.containers.filter(item=>item.kind==='section').map(item=>`<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('');
  const templates=map.paragraphs.map(p=>`<template data-paragraph="${esc(p.id)}">${renderSourceText(p.text)}</template>`).join('')+model.nodes.map(n=>`<template data-object-text="${esc(n.id)}">${renderSourceText(n.label)}${n.details?`<details><summary>更多说明</summary>${renderSourceText(typeof n.details==='string'?n.details:JSON.stringify(n.details,null,2))}</details>`:''}</template>`).join('')+model.edges.map(e=>`<template data-edge-text="${esc(e.id)}">${renderSourceText(e.label)}${e.details?`<details><summary>更多说明</summary>${renderSourceText(typeof e.details==='string'?e.details:JSON.stringify(e.details,null,2))}</details>`:''}</template>`).join('');
  const leaf=(item,depth=0)=>{
    const role=structureRoles(map,model,item.parent_id).get(item.id)?.role;
    const object=model.nodes.find(node=>node.id===item.object_id);
    const title=compactLabel(item.title||object?.label||item.object_id,50).text;
    const prefix=map.schema_version==='source-reading-map/v2'?'':(role?readingRoleName(role)+' · ':'')+(occurrenceRole(item,map,model)==='related'?'关联引用 · ':'');
    const blockTypes=item.kind==='block'&&model.schema_version==='diagram-domain-model/v5'?(object?.content_types||[]).map(id=>model.content_types.entries.find(entry=>entry.id===id)?.label||id).join('、'):'';
    const typeHint=model.schema_version==='diagram-domain-model/v5'?(item.kind==='block'?blockTypes:!item.kind?sourceKindName(object?.kind):''):'';
    const accessibleType=typeHint?(item.kind==='block'?'知识块 · ':'')+typeHint+' · ':'';
    const mobileKind=typeHint?`<span class="ns-mobile-kind" aria-hidden="true">${esc(typeHint)}</span>`:'';
    return `<li style="--depth:${depth}"><button data-select="${esc(item.id)}" type="button"${typeHint?` aria-label="${esc(accessibleType+title)}"`:''}>${mobileKind}${esc(prefix+title)}</button>${map.containers.some(x=>x.id===item.id)?`<button data-toggle="${esc(item.id)}" type="button" aria-label="展开或收起 ${esc(item.title)}">▸</button>`:''}<ul>${childrenOf(map,item.id).map(x=>leaf(x,depth+1)).join('')}</ul></li>`;
  };
  const body=`<div class="ns-head"><h1>${esc(map.title)}</h1><details class="ns-review"><summary>审阅快照与阅读限制</summary>${notice}</details></div><style>body{max-width:none;margin:0;padding:8px 12px}body>nav{font-size:13px;line-height:1.2}body>nav a{padding:2px 0}body>section{padding:8px;margin:4px 0}.ns-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.ns-head h1{font-size:20px;margin:2px 0}.ns-review{font-size:12px;margin:0}.ns-review .status{margin:0;padding:4px}.ns-toolbar{margin:2px 0}.ns-toolbar button,.ns-toolbar select{padding:3px 7px}.ns-toolbar label{max-width:100%}.ns-toolbar select{max-width:min(100%,24rem)}#ns-location{margin:2px 0;font-size:13px}.ns-shell{display:grid;grid-template-columns:minmax(160px,210px) minmax(0,1fr);gap:16px}.ns-tree{display:block;position:sticky;top:10px;align-self:start;max-height:70vh;overflow:auto;border:1px solid #c6d5e2;border-radius:8px;padding:8px;background:#fff}#ns-location{position:sticky;top:0;background:#f5f7fa;z-index:4;padding:4px 8px;border-bottom:1px solid #c6d5e2}.ns-toolbar{display:flex;gap:8px;flex-wrap:wrap}.ns-canvas{overflow:auto;height:calc(100vh - 170px);min-height:360px;background:#f6f9fc;border:1px solid #c6d5e2;border-radius:8px;touch-action:none}.ns-canvas svg{display:block;max-width:none;transform-origin:0 0}.ns-aside{display:none;position:fixed;right:16px;top:70px;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 90px);overflow:auto;background:white;border:2px solid #526e86;border-radius:9px;padding:14px;z-index:12;box-shadow:0 8px 26px #17365055}.ns-aside.open{display:block}.ns-tree ul{list-style:none;padding-left:18px}.ns-tree li{margin:5px 0}.ns-tree button{max-width:100%;white-space:normal;text-align:left}.ns-mobile-kind{display:none}.ns-relations li{margin:6px 0}.ns-relations .inferred{color:#8a452e;border-left:3px dashed #a45d42;padding-left:6px}.ns-relations .ns-badge{display:inline-block;font-size:12px;background:#fff0e7;border:1px dashed #a45d42;border-radius:4px;padding:1px 4px;margin-right:5px}.ns-legend{font-size:12px;margin:4px 0}.ns-legend span{margin-right:14px}.ns-legend .inferred{color:#8a452e}.ns-full{overflow-wrap:anywhere}.ns-full table{max-width:100%;overflow:auto}.ns-source{border-left:3px solid #40759a;padding-left:10px}.ns-mark{white-space:pre-wrap}.ns-mark mark{background:#ffda6b}.ns-hidden{display:none!important}@media(max-width:700px){.ns-shell{display:block}.ns-canvas{display:none}.ns-aside{position:static;width:auto;max-height:none}.ns-tree{display:block!important;position:static;top:auto;max-height:none;overflow:visible}.ns-mobile-kind{display:inline-block;font-size:12px;color:#174a6c;border:1px solid #a9bfd0;border-radius:4px;padding:0 3px;margin-right:4px}body{padding:0 12px;margin:16px auto;overflow-wrap:anywhere}}</style><section><div class="ns-toolbar"><button type="button" id="ns-back">返回</button><button type="button" id="ns-fit">全景</button><button type="button" id="ns-focus">聚焦</button><button type="button" id="ns-in">放大</button><button type="button" id="ns-out">缩小</button><button type="button" id="ns-export">导出 SVG</button><label>当前原书小节 <select id="ns-section"><option value="">请选择小节</option>${sectionOptions}</select></label><button type="button" id="ns-expand-section">展开本节知识块</button><button type="button" id="ns-collapse-section">收起本节知识块</button><span id="ns-section-status" role="status"></span><label>内容层 <select id="ns-layer"><option value="all">来源与推测</option><option value="source">仅来源</option></select></label></div><p id="ns-location" aria-live="polite"></p><div class="ns-shell"><nav class="ns-tree" aria-label="原书目录"><h2>原书目录</h2><ul>${leaf(map.containers.find(c=>c.id===map.root_id))}</ul></nav><div><p class="ns-legend"><span>━━ 来源关系</span><span class="inferred">┄┄ 补充推测关系</span>${model.schema_version==='diagram-domain-model/v5'?`<span>原文明示 ${relationCounts.explicit} 条</span><span>来源隐含 ${relationCounts.inferred} 条</span><span>${relationCounts.project?`补充推测 ${relationCounts.project} 条`:"本版本无补充推测关系"}</span>${relationCounts.rollup?`<span>来源汇总 ${relationCounts.rollup} 条</span>`:""}`:""}<span>粗体：核心；灰字：独立</span></p><div id="ns-canvas" class="ns-canvas">${svg}</div><div class="ns-relations"><h2>当前关系</h2><ul id="ns-relation-list"></ul></div></div><aside id="ns-detail" class="ns-aside" aria-live="polite"></aside></div></section>${templates}<script type="application/json" id="ns-data">${data}</script><script src="elk.bundled.js"></script><script>const layoutOptions=${JSON.stringify(layoutOptions)};const childrenOf=${childrenOf.toString()};const sourceKindName=${sourceKindName.toString()};const shortRelationLabel=${shortRelationLabel.toString()};const relationValueLabel=${relationValueLabel.toString()};const sourceReferencePresentation=${sourceReferencePresentation.toString()};const groupParagraphSpans=${groupParagraphSpans.toString()};const nearestSourceSection=${nearestSourceSection.toString()};const sectionBlockIds=${sectionBlockIds.toString()};const setSectionBlocksExpanded=${setSectionBlocksExpanded.toString()};const relationIdentityCounts=${relationIdentityCounts.toString()};const relationBasisName=${relationBasisName.toString()};const relationFormName=${relationFormName.toString()};const relationCaption=${relationCaption.toString()};const visibleRelations=${visibleRelations.toString()};const structureRoles=${structureRoles.toString()};const readingRoleName=${readingRoleName.toString()};const occurrenceRole=${occurrenceRole.toString()};const sourceOrdinal=${sourceOrdinal.toString()};const titleLines=${titleLines.toString()};const fullBlockView=${fullBlockView.toString()};const appendParagraphSelection=${appendParagraphSelection.toString()};const activateNestedKey=${activateNestedKey.toString()};const applyNestedViewport=${applyNestedViewport.toString()};const summaryText=${summaryText.toString()};const headerHeight=${headerHeight.toString()};const defaultExpanded=${defaultExpanded.toString()};const visibleTree=${visibleTree.toString()};const nestedSvg=${nestedSvg.toString()};(${nestedController.toString()})(visibleTree,nestedSvg,defaultExpanded);</script>`;
  return {pages:{'index.html':page(map.title,body)},assets:{'images/nested-initial.svg':svg,'elk.bundled.js':fs.readFileSync(new URL('../node_modules/elkjs/lib/elk.bundled.js',import.meta.url),'utf8')}};
}

export function nestedController(visibleTree,nestedSvg,defaultExpanded){
  const data=JSON.parse(document.getElementById('ns-data').textContent),{map,model,sources}=data;
  const items=new Map([...map.containers,...map.occurrences].map(x=>[x.id,x])),edges=new Map(model.edges.map(x=>[x.id,x])),nodes=new Map(model.nodes.map(x=>[x.id,x]));
  const canvas=document.getElementById('ns-canvas'),detail=document.getElementById('ns-detail'),tree=document.querySelector('.ns-tree'),layerControl=document.getElementById('ns-layer'),sectionControl=document.getElementById('ns-section');
  const minimal=map.schema_version==='source-reading-map/v2',v5=model.schema_version==='diagram-domain-model/v5';
  let expanded=defaultExpanded(map),selected='',sectionScope='',layer='all',scale=1,panX=0,panY=0,drag=null,historyReady=false;
  const add=(tag,text,parent)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;};
  const evidence=(ids,parent)=>{if(!ids?.length)return;const fold=add('details','',parent);add('summary',`追溯信息与来源链接（${ids.length}）`,fold);const ul=add('ul','',fold);for(const id of ids){const s=sources[id],li=add('li','',ul),a=add('a',s?.label||id,li);a.href=s?.href||'evidence.html';if(s?.location)add('span',` · ${s.location}`,li);if(s?.excerpt)add('p',s.excerpt,li);}};
  const showParagraph=(spans,parent,includeEvidence=true)=>{const list=Array.isArray(spans)?spans:[spans],p=map.paragraphs.find(x=>x.id===list[0]?.paragraph_id);if(!p)return;const box=add('div','',parent);box.className='ns-source';add('h4',`${p.locator} · 原文序 ${p.order}`,box);const template=document.querySelector(`template[data-paragraph="${CSS.escape(p.id)}"]`);appendParagraphSelection(box,p,list,template,document);const related=[map.paragraphs.find(x=>x.id===p.continues_from),...map.paragraphs.filter(x=>x.continues_from===p.id)].filter(Boolean).sort((a,b)=>a.order-b.order);for(const part of related){const more=add('details','',box);add('summary',`${part.order<p.order?'前文':'后续'}接续 · ${part.locator}`,more);const t=document.querySelector(`template[data-paragraph="${CSS.escape(part.id)}"]`);if(t)more.append(t.content.cloneNode(true));}if(includeEvidence)evidence(p.evidence,box);};
  const save=()=>{const q=new URLSearchParams();q.set('open',[...expanded].join(','));if(selected)q.set('select',selected);if(sectionScope)q.set('section',sectionScope);if(layer==='source')q.set('layer','source');q.set('zoom',String(scale));q.set('pan',`${panX},${panY}`);history.pushState(null,'',`#${q}`);};
  const filterSourceSelection=()=>{const item=items.get(selected);if(item&&!item.kind&&nodes.get(item.object_id)?.origin==='interpretation')selected='';if(selected.startsWith('object:')&&nodes.get(selected.slice(7))?.origin==='interpretation')selected='';if(selected.startsWith('edges:')){const ids=selected.slice(6).split(',').filter(id=>edges.get(id)?.origin==='source');selected=ids.length?`edges:${ids.join(',')}`:'';}};
  const renderSectionControls=()=>{const blocks=sectionBlockIds(map,sectionScope);sectionControl.value=sectionScope;sectionControl.disabled=Boolean(items.has(selected)&&nearestSourceSection(map,selected));document.getElementById('ns-expand-section').disabled=!blocks.length;document.getElementById('ns-collapse-section').disabled=!blocks.length;document.getElementById('ns-section-status').textContent=sectionScope?`本节 ${blocks.length} 个知识块`:'选择原书小节后批量操作';};
  const restore=()=>{const q=new URLSearchParams(location.hash.slice(1));expanded=new Set((q.get('open')||[...defaultExpanded(map)].join(',')).split(',').filter(x=>items.get(x)?.kind));expanded.add(map.root_id);selected=q.get('select')||'';sectionScope=map.containers.some(item=>item.kind==='section'&&item.id===q.get('section'))?q.get('section'):'';if(items.has(selected))sectionScope=nearestSourceSection(map,selected)||'';layer=q.get('layer')==='source'?'source':'all';if(layer==='source')filterSourceSelection();layerControl.value=layer;const storedZoom=q.has('zoom');scale=Number(q.get('zoom'))||1;const pan=(q.get('pan')||'0,0').split(',').map(Number);panX=pan[0]||0;panY=pan[1]||0;render(!storedZoom);};
  const breadcrumb=id=>{const names=[];let at=items.get(id);while(at){names.unshift(minimal&&!at.kind?`原文位置 ${sourceOrdinal(at,map)??at.order}`:at.title||nodes.get(at.object_id)?.label||at.object_id);at=items.get(at.parent_id);}return names.join(' › ');};
  const select=id=>{const item=items.get(id);if(layer==='source'&&item&&!item.kind&&nodes.get(item.object_id)?.origin==='interpretation')return;if(id.startsWith('object:')&&layer==='source'&&nodes.get(id.slice(7))?.origin==='interpretation')return;selected=id;sectionScope=items.has(id)?nearestSourceSection(map,id)||'':'';renderSectionControls();paintDetail();paintSelection();document.getElementById('ns-location').textContent=id.startsWith('full:')?`完整知识块 · ${nodes.get(id.slice(5))?.label||id.slice(5)}`:id.startsWith('object:')?`对象 · ${shortRelationLabel(nodes.get(id.slice(7))?.label||id.slice(7))}`:items.has(id)?breadcrumb(id):'关系 · 原端点见侧栏';save();};
  const renderFullBlock=id=>{
    const view=fullBlockView(map,model,id),block=view?.block;if(!block){add('p','未知知识块。',detail);return;}
    add('h2',`完整知识块 · ${block.label}`,detail);add('p',`冻结模型ID：${block.id}`,detail);
    const text=document.querySelector(`template[data-object-text="${CSS.escape(id)}"]`);if(text)detail.append(text.content.cloneNode(true));
    for(const item of (block.summary||[]).filter(x=>layer==='all'||x.origin==='source')){add('h3',item.origin==='interpretation'?'项目解释摘要':'来源摘要',detail);add('p',item.text,detail);evidence(item.evidence,detail);}
    evidence(block.evidence,detail);
    const locations=view.locations;
    add('h3','本块在小样中的出现位置',detail);if(!locations.length)add('p','本小样范围外',detail);
    else for(const c of locations){const button=add('button',breadcrumb(c.id),detail);button.type='button';button.dataset.select=c.id;}
    const show=(entries,title,related)=>{add('h3',title,detail);if(!entries.length){add('p','无声明对象。',detail);return;}const ul=add('ul','',detail);for(const entry of entries){const child=entry.node,childId=child.id;if(layer==='source'&&child?.origin==='interpretation')continue;const li=add('li','',ul);add('strong',child?.label||childId,li);add('span',` · ${childId}${related?' · 关联引用，非本块成员':''}`,li);const appearances=entry.appearances;if(!appearances.length)add('p','本小样范围外',li);else{const places=add('ul','',li);for(const o of appearances){const row=add('li','',places),button=add('button',breadcrumb(o.id),row);button.type='button';button.dataset.select=o.id;}}}};
    show(view.members,'冻结模型成员',false);show(view.related,'显式关联引用',true);
  };
  const paintV5Detail=()=>{
    detail.replaceChildren();detail.classList.toggle('open',Boolean(selected));if(!selected)return;
    const close=add('button','关闭说明',detail);close.type='button';close.id='ns-close-detail';
    const audit=add('details','',detail);add('summary','ID、修订与技术信息',audit);
    const refList=(refs,title,parent)=>{if(!refs?.length)return;if(title)add('h4',title,parent);for(const ref of refs){const row=add('div','',parent);row.className='ns-source-ref';const source=ref.source?sources[ref.source]:null,{value,linkLabel}=sourceReferencePresentation(ref,source);if(source){const link=add('a',linkLabel,row);link.href=source.href;if(linkLabel!==source.label)link.title=source.label;if(source.location)add('span',` · ${source.location}`,row);}if(value!==null){const short=shortRelationLabel(value,80);if(short!==value){const fold=add('details','',row);add('summary',short,fold);add('p',value,fold);}else add('p',value,row);}add('p',`${ref.object_id} ${ref.field_path} · ${ref.content_revision}`,audit);}};
    const objectButton=(id,parent)=>{const node=nodes.get(id),button=add('button',shortRelationLabel(node?.label||id),parent);button.type='button';button.dataset.object=id;button.setAttribute('aria-label',`${sourceKindName(node?.kind)} · ${shortRelationLabel(node?.label||id)}，查看对象正文与证据`);return button;};
    const item=items.get(selected);
    if(item){
      const object=nodes.get(item.object_id),occurrence=!item.kind;
      add('h2',occurrence?'要素':item.title,detail);
      if(occurrence){add('p',`类型：${sourceKindName(object?.kind)}${occurrenceRole(item,map,model)==='related'?' · 关联引用，非本块成员':''}`,detail);add('h3','已发布要素正文',detail);const template=document.querySelector(`template[data-object-text="${CSS.escape(object.id)}"]`);if(template)detail.append(template.content.cloneNode(true));for(const spans of groupParagraphSpans(item.spans||[])){add('h3','原文证据',detail);showParagraph(spans,detail,false);}}
      else if(item.kind==='block'){
        const names=(object?.content_types||[]).map(id=>model.content_types.entries.find(entry=>entry.id===id)?.label||id);add('p',`内容类型：${names.join('、')}`,detail);
        refList(object?.focus_refs,'共同焦点',detail);if(object?.focus_rationale)add('p',object.focus_rationale,detail);
        const button=add('button','查看块的全部成员',detail);button.type='button';button.dataset.fullBlock=item.object_id;
      }else if(item.range){const start=map.paragraphs.find(p=>p.id===item.range.start.paragraph_id),end=map.paragraphs.find(p=>p.id===item.range.end.paragraph_id);if(start&&end){const fold=add('details','',detail);add('summary','查看本节原文',fold);for(const p of map.paragraphs.filter(p=>p.order>=start.order&&p.order<end.order).sort((a,b)=>a.order-b.order))showParagraph({paragraph_id:p.id,start:0,end:Array.from(p.text).length},fold);}}
      evidence([...new Set([...(object?.evidence||[]),...(item.evidence||[]),...(item.spans||[]).flatMap(span=>map.paragraphs.find(p=>p.id===span.paragraph_id)?.evidence||[])])],detail);
      add('p',`映射 ${item.id} · 对象 ${item.object_id||'无'}`,audit);return;
    }
    if(selected.startsWith('full:')){const view=fullBlockView(map,model,selected.slice(5));if(view){add('h2',view.block.label,detail);add('p',`内容类型：${(view.block.content_types||[]).map(id=>model.content_types.entries.find(entry=>entry.id===id)?.label||id).join('、')}`,detail);for(const group of [{title:'成员',entries:view.members},{title:'关联引用，非本块成员',entries:view.related}]){add('h3',group.title,detail);for(const entry of group.entries){const row=add('p',`${sourceKindName(entry.node?.kind)} · ${entry.node?.label||''}`,detail);if(!entry.appearances.length)add('span',' · 本小样范围外',row);for(const at of entry.appearances){const button=add('button',breadcrumb(at.id),row);button.type='button';button.dataset.select=at.id;}}}evidence(view.block.evidence,detail);}return;}
    if(selected.startsWith('object:')){const id=selected.slice(7),object=nodes.get(id);if(!object)return;add('h2',object.kind==='block'?'知识块':sourceKindName(object.kind),detail);const template=document.querySelector(`template[data-object-text="${CSS.escape(id)}"]`);if(template)detail.append(template.content.cloneNode(true));else add('p',object.label,detail);if(object.kind==='block'){const button=add('button','查看块的全部成员',detail);button.type='button';button.dataset.fullBlock=id;}evidence(object.evidence,detail);add('p',`对象 ${id} · 来源修订 ${object.source_revision||'无'}`,audit);return;}
    const ids=(selected.startsWith('edges:')?selected.slice(6).split(','):edges.has(selected)?[selected]:[]).filter(id=>edges.has(id)&&(layer==='all'||edges.get(id).origin==='source'));
    if(!ids.length)return;
    if(ids.length>1){
      add('h2',`内含${ids.length}条关系`,detail);
      const list=add('ul','',detail);
      for(const id of ids){const edge=edges.get(id),row=add('li','',list),arrow=edge.direction==='symmetric'?'↔':'→';
        const caption=`${edge.origin==='interpretation'?'推测':'来源'} · ${edge.label||edge.type}：${shortRelationLabel(nodes.get(edge.from)?.label||edge.from,28)} ${arrow} ${shortRelationLabel(nodes.get(edge.to)?.label||edge.to,28)}`;
        const button=add('button',caption,row);button.type='button';button.dataset.edges=id;button.setAttribute('aria-label',`${caption}，查看端点、限定与证据`);
      }
      return;
    }
    const edge=edges.get(ids[0]),box=add('article','',detail),arrow=edge.direction==='symmetric'?'↔':'→';
    add('h2',`${edge.label||edge.type} · ${edge.origin==='interpretation'?'推测':'来源'}`,detail);
    add('p',`关系来源：${relationBasisName(edge)} · 关系身份：${relationFormName(edge.relation_form)}`,box);
    const endpoints=add('p','端点：',box);objectButton(edge.from,endpoints);add('span',` ${arrow} `,endpoints);objectButton(edge.to,endpoints);
    const members=side=>edge[`${side}_element_ids`]||[edge[side]];
    for(const side of ['from','to']){const list=members(side);if(list.length>1||list[0]!==edge[side]){add('h3',`${side==='from'?'起点':'终点'}成员（${list.length}）`,box);const ul=add('ul','',box);for(const id of list){const row=add('li','',ul);objectButton(id,row);}}}
    if(edge.endpoint_pairs?.length){add('h3',`原子端点对（${edge.endpoint_pairs.length}）`,box);const pairList=add('ul','',box);for(const pair of edge.endpoint_pairs){const pairBox=add('li','',pairList);objectButton(pair.from,pairBox);add('span',` ${arrow} `,pairBox);objectButton(pair.to,pairBox);const button=add('button','查看原子关系',pairBox);button.type='button';button.dataset.edges=pair.edge_id;for(const qualifier of edges.get(pair.edge_id)?.qualifiers||pair.qualifiers||[]){if((edge.qualifiers||[]).some(value=>JSON.stringify(value)===JSON.stringify(qualifier)))continue;add('p',`${{from:'起点',to:'终点',relation:'关系'}[qualifier.applies_to]} · ${{condition:'条件',time:'时间',modality:'模态',scope:'范围'}[qualifier.dimension]}`,pairBox);refList([qualifier.source_ref],'',pairBox);}}}
    if(edge.overall_effect)add('p',edge.overall_effect,box);if(edge.rationale)add('p',`${edge.basis==='inferred_from_source'?'来源隐含依据':'理由'}：${edge.rationale}`,box);if(edge.scope_note)add('p',`范围：${edge.scope_note}`,box);if(edge.uncertainty)add('p',`不确定性：${edge.uncertainty}`,box);
    refList(edge.premises,'来源依据',box);if(edge.qualifiers?.length){add('h3','限定',box);for(const q of edge.qualifiers){const line=add('div',`${{from:'起点',to:'终点',relation:'关系'}[q.applies_to]} · ${{condition:'条件',time:'时间',modality:'模态',scope:'范围'}[q.dimension]}`,box);refList([q.source_ref],'',line);}}
    if(edge.supporting_edge_ids?.length){add('p',`来源汇总引用：${edge.supporting_edge_ids.length} 条原子关系`,box);const fold=add('details','',box);add('summary',`组成关系（${edge.supporting_edge_ids.length}）`,fold);for(const id of edge.supporting_edge_ids){const button=add('button',id,fold);button.type='button';button.dataset.edges=id;}}
    evidence(edge.evidence,box);add('p',`关系 ${edge.id} · ${edge.type} · ${edge.from}/${edge.to}`,audit);

  };
  const paintMinimalDetail=()=>{
    detail.replaceChildren();detail.classList.toggle('open',Boolean(selected));
    if(!selected)return;
    const close=add('button','关闭说明',detail);close.type='button';close.id='ns-close-detail';
    const fold=add('details','',detail),audit=add('summary','ID、修订与技术信息',fold);audit.title='审阅用字段';
    const item=items.get(selected);
    if(item){
      const object=nodes.get(item.object_id),isOccurrence=!item.kind;
      const heading=isOccurrence?'要素':item.title;
      add('h2',heading||'原文出现',detail);
      if(item.kind){
        const count=map.containers.filter(x=>x.parent_id===item.id).length+map.occurrences.filter(x=>x.parent_id===item.id).length;
        add('p',`${count} 项`,detail);
        if(item.range){const start=map.paragraphs.find(p=>p.id===item.range.start.paragraph_id),end=map.paragraphs.find(p=>p.id===item.range.end.paragraph_id);if(start&&end){const source=add('details','',detail);add('summary','查看本节原文',source);for(const p of map.paragraphs.filter(p=>p.order>=start.order&&p.order<end.order).sort((a,b)=>a.order-b.order))showParagraph({paragraph_id:p.id,start:0,end:Array.from(p.text).length},source);}}
      }else{
        if(occurrenceRole(item,map,model)==='related')add('p','跨节关联引用',detail);
        add('h3','已发布要素正文',detail);
        const published=document.querySelector(`template[data-object-text="${CSS.escape(object.id)}"]`);
        if(published)detail.append(published.content.cloneNode(true));
        else add('p',object?.label||'',detail);
        add('h3','原文证据',detail);
        for(const spans of groupParagraphSpans(item.spans||[]))showParagraph(spans,detail,false);
      }
      if(item.kind==='block'){const button=add('button','查看块的全部成员',detail);button.type='button';button.dataset.fullBlock=item.object_id;}
      evidence([...new Set([...(object?.evidence||[]),...(item.evidence||[]),...(item.spans||[]).flatMap(span=>map.paragraphs.find(p=>p.id===span.paragraph_id)?.evidence||[])])],detail);
      add('p',`映射 ${item.id} · 对象 ${item.object_id||'无'} · 来源修订 ${object?.source_revision||'无'}`,fold);
      return;
    }
    const blockId=selected.startsWith('full:')?selected.slice(5):null;
    if(blockId){const view=fullBlockView(map,model,blockId);if(view){add('h2',view.block.label,detail);for(const group of [{title:'成员',entries:view.members},{title:'跨节引用',entries:view.related}]){add('h3',group.title,detail);for(const entry of group.entries){const row=add('p',entry.node?.label||'',detail);for(const at of entry.appearances){const button=add('button',breadcrumb(at.id),row);button.type='button';button.dataset.select=at.id;}}}evidence(view.block.evidence,detail);add('p',`块 ${blockId}`,fold);}return;}
    const routeIds=selected.startsWith('edges:')?selected.slice(6).split(','):edges.has(selected)?[selected]:[];
    if(routeIds.length){
      add('h2',`${routeIds.length} 条关系`,detail);
      for(const id of routeIds){const e=edges.get(id);if(!e||(layer==='source'&&e.origin==='interpretation'))continue;
        const box=add('article','',detail);add('h3',`${e.label}${e.origin==='interpretation'?' · 推测':''}`,box);
        add('p',`${nodes.get(e.from)?.label||e.from} ${e.direction==='symmetric'?'↔':'→'} ${nodes.get(e.to)?.label||e.to}`,box);
        if(e.scope_note)add('p',`范围：${e.scope_note}`,box);
        if(e.origin==='interpretation'&&e.rationale)add('p',`推测说明：${e.rationale}`,box);
        if(e.uncertainty)add('p',`不确定性：${e.uncertainty}`,box);
        if(e.premises?.length){const premise=add('details','',box);add('summary','推测前提与来源定位',premise);for(const p of e.premises)add('p',`${p.source||''} · ${p.object_id||''} · ${p.field_path||''} · ${p.content_revision||''}`,premise);}
        evidence(e.evidence,box);add('p',`关系 ${e.id} · 类型 ${e.type||''} · 端点 ${e.from}/${e.to}`,fold);
      }return;
    }
  };
  const paintDetail=()=>{
    if(v5){paintV5Detail();return;}
    if(minimal){paintMinimalDetail();return;}
    detail.replaceChildren();detail.classList.toggle('open',Boolean(selected));if(selected){const close=add('button','关闭说明',detail);close.type='button';close.id='ns-close-detail';}if(selected.startsWith('full:')){renderFullBlock(selected.slice(5));return;}const item=items.get(selected);if(item){add('h2',item.title||nodes.get(item.object_id)?.label||item.object_id,detail);add('p',breadcrumb(item.id),detail);if(item.kind){const ranges=item.range?[item.range.start.paragraph_id]:map.occurrences.filter(o=>o.parent_id===item.id).flatMap(o=>o.spans.map(s=>s.paragraph_id));const sourceOrder=ranges.map(id=>map.paragraphs.find(p=>p.id===id)?.order).filter(Number.isInteger).sort((a,b)=>a-b)[0];add('p',`${item.kind==='block'?'项目组织的知识块':'原书目录'}${sourceOrder!==undefined?` · 原文序 ${sourceOrder}`:''}`,detail);}if(item.summary && (layer==='all'||item.summary.origin==='source')){add('h3',item.summary.origin==='interpretation'?'项目解释摘要':'来源摘要',detail);add('p',item.summary.text,detail);evidence(item.summary.evidence,detail);}if(item.range)add('p',`原文范围：${item.range.start.paragraph_id}:${item.range.start.offset} → ${item.range.end.paragraph_id}:${item.range.end.offset}`,detail);if(!item.kind){add('p',occurrenceRole(item,map,model)==='related'?'关联引用（非本块成员）':'冻结模型成员',detail);}const readingRole=structureRoles(map,model,item.parent_id).get(item.id)?.role;if(readingRole)add('p',`阅读组织：${readingRoleName(readingRole)}`,detail);const ownStructure=model.reading_structures?.find(s=>s.scope_id===(item.object_id||(item.id===map.root_id?model.root_id:null)));if(ownStructure){const names={sequence:'阅读序列',explanation:'核心主张',comparison:'比较',multiple:'多中心'};add('p',`本范围阅读结构：${names[ownStructure.pattern]} · ${ownStructure.rationale}`,detail);evidence(ownStructure.evidence,detail);}if(item.kind==='block'||!item.kind){const blockId=item.kind==='block'?item.object_id:items.get(item.parent_id)?.object_id;const button=add('button','打开完整知识块',detail);button.type='button';button.dataset.fullBlock=blockId;}if(item.object_id){const object=nodes.get(item.object_id);add('p',`模型对象：${object?.id||item.object_id}${item.kind==='section'?'（仅关系端点映射）':''}`,detail);if(object){add('h3','完整模型对象',detail);const t=document.querySelector(`template[data-object-text="${CSS.escape(object.id)}"]`);if(t)detail.append(t.content.cloneNode(true));else add('p',object.label,detail);if(object.summary)for(const sum of object.summary.filter(x=>layer==='all'||x.origin==='source')){add('h4',sum.origin==='interpretation'?'项目解释摘要':'来源摘要',detail);add('p',sum.text,detail);evidence(sum.evidence,detail);}evidence(object.evidence,detail);}}evidence(item.evidence,detail);for(const spans of groupParagraphSpans(item.spans||[]))showParagraph(spans,detail);if(item.range){const start=map.paragraphs.find(p=>p.id===item.range.start.paragraph_id),end=map.paragraphs.find(p=>p.id===item.range.end.paragraph_id);if(start&&end){const fold=add('details','',detail);add('summary','此节完整原文范围',fold);for(const p of map.paragraphs.filter(p=>p.order>=start.order&&p.order<end.order).sort((a,b)=>a.order-b.order))showParagraph({paragraph_id:p.id,start:0,end:Array.from(p.text).length},fold);}}return;}
    const routeIds=selected.startsWith('edges:')?selected.slice(6).split(','):edges.has(selected)?[selected]:[];if(routeIds.length){add('h2',`含 ${routeIds.length} 条原关系`,detail);for(const id of routeIds){const e=edges.get(id);if(!e || (layer==='source'&&e.origin==='interpretation'))continue;const box=add('article','',detail);add('h3',`${e.origin==='interpretation'?'项目解释 · ':''}${e.label}`,box);add('p',`${nodes.get(e.from)?.label||e.from} ${e.direction==='directed'?'→':e.direction==='symmetric'?'↔':'—'} ${nodes.get(e.to)?.label||e.to}`,box);add('p',`原端点：${e.from} / ${e.to} · ${e.direction}`,box);for(const key of ['scope_note','rationale','uncertainty'])if(e[key])add('p',`${key==='scope_note'?'适用范围':key==='rationale'?'解释理由':'不确定性'}：${e[key]}`,box);if(e.premises?.length)add('p',`前提：${JSON.stringify(e.premises)}`,box);const t=document.querySelector(`template[data-edge-text="${CSS.escape(e.id)}"]`);if(t)box.append(t.content.cloneNode(true));evidence(e.evidence,box);}return;}add('p','选择章、节、知识块、对象或关系查看全文与证据。',detail);
  };
  const applyTransform=(resetScroll=false)=>applyNestedViewport(canvas,canvas.querySelector('svg'),scale,panX,panY,resetScroll);
  const fit=()=>{const svg=canvas.querySelector('svg');if(!svg)return;const width=Number(svg.getAttribute('width'))||1,height=Number(svg.getAttribute('height'))||1;scale=Math.min(1,Math.max(.2,Math.min((canvas.clientWidth-20)/width,(Math.max(canvas.clientHeight,420)-20)/height)));panX=Math.max(0,(canvas.clientWidth-width*scale)/2);panY=Math.max(0,(Math.max(canvas.clientHeight,420)-height*scale)/2);applyTransform(true);};
  const routeGroups=()=>{const visible=new Set([...canvas.querySelectorAll('[data-select]')].map(x=>x.dataset.select)),grouped=visibleRelations(map,model,visible,layer);return [...grouped.routes,...[...grouped.internals.values()].map(group=>({from:group.at,to:group.at,internal:true,edgeIds:[...group.edgeIds],caption:v5?`内含${group.edgeIds.size}条关系`:`内部 ${group.edgeIds.size} 条关系`}))];};
  const renderRelations=()=>{const list=document.getElementById('ns-relation-list');list.replaceChildren();const short=id=>{const item=items.get(id),value=item?.title||nodes.get(item?.object_id)?.label||id;return Array.from(value).length>34?Array.from(value).slice(0,34).join('')+'…':value;};for(const g of routeGroups()){const li=add('li','',list),arrow=g.direction==='directed'?'→':g.direction==='symmetric'?'↔':'—',internal=v5&&g.internal,button=add('button',internal?`${short(g.from)}：${g.caption}`:`${g.caption}：${short(g.from)} ${arrow} ${short(g.to)}`,li);if(g.origin==='interpretation'){li.className='inferred';const badge=add('span','推测',li);badge.className='ns-badge';li.insertBefore(badge,button);}button.type='button';button.setAttribute('aria-label',internal?`${button.textContent}，打开查看每条真实关系`:`${g.origin==='interpretation'?'推测关系':'来源关系'} · ${button.textContent}`);button.dataset.edges=g.edgeIds.join(',');}if(!list.children.length)add('li','此范围无已映射关系。',list);};
  const renderTree=()=>{for(const li of tree.querySelectorAll('li')){const button=li.querySelector(':scope > [data-select]'),id=button?.dataset.select;if(!id)continue;let parent=items.get(id)?.parent_id,hidden=false;while(parent){if(!expanded.has(parent))hidden=true;parent=items.get(parent)?.parent_id;}if(layer==='source'&&!items.get(id)?.kind&&nodes.get(items.get(id)?.object_id)?.origin==='interpretation')hidden=true;li.hidden=hidden;const toggle=li.querySelector(':scope > [data-toggle]');if(toggle)toggle.textContent=expanded.has(id)?'▾':'▸';}};
  const paintSelection=()=>{for(const element of canvas.querySelectorAll('.ns-selected,.ns-on-path'))element.classList.remove('ns-selected','ns-on-path');if(!selected)return;let at=items.has(selected)?selected:null;while(at){const frame=[...canvas.querySelectorAll('[data-frame]')].find(x=>x.dataset.frame===at);if(frame)frame.classList.add('ns-on-path');at=items.get(at)?.parent_id;}for(const element of canvas.querySelectorAll('[data-frame],[data-edges]')){if(element.dataset.frame===selected||selected.startsWith('edges:')&&element.dataset.edges?.split(',').some(id=>selected.slice(6).split(',').includes(id)))element.classList.add('ns-selected');}};
  const render=async(autoFit=false)=>{const layout=await new ELK().layout(visibleTree(map,expanded,model,layer));canvas.innerHTML=nestedSvg(map,model,layout,expanded,layer);paintSelection();if(autoFit)fit();else applyTransform();renderTree();renderRelations();renderSectionControls();paintDetail();const root=items.get(map.root_id);document.getElementById('ns-location').textContent=selected?(selected.startsWith('full:')?`完整知识块 · ${nodes.get(selected.slice(5))?.label||selected.slice(5)}`:selected.startsWith('object:')?`对象 · ${shortRelationLabel(nodes.get(selected.slice(7))?.label||selected.slice(7))}`:breadcrumb(selected)||'关系 · 原端点见侧栏'):root.title;};
  const toggle=async id=>{expanded.has(id)?expanded.delete(id):expanded.add(id);await render(true);save();};
  document.addEventListener('click',e=>{const t=e.target.closest('#ns-close-detail,[data-full-block],[data-toggle],[data-edges],[data-object],[data-select]');if(!t)return;if(t.id==='ns-close-detail'){selected='';sectionScope='';renderSectionControls();paintDetail();save();return;}if(t.dataset.fullBlock){select('full:'+t.dataset.fullBlock);return;}if(t.dataset.toggle){toggle(t.dataset.toggle);return;}if(t.dataset.edges){select('edges:'+t.dataset.edges);return;}if(t.dataset.object){select('object:'+t.dataset.object);return;}if(t.dataset.select)select(t.dataset.select);});
  document.addEventListener('keydown',activateNestedKey);
  sectionControl.addEventListener('change',()=>{sectionScope=sectionControl.value;renderSectionControls();save();});
  for(const [id,open] of [['ns-expand-section',true],['ns-collapse-section',false]])document.getElementById(id).addEventListener('click',async()=>{const blockIds=sectionBlockIds(map,sectionScope);if(!blockIds.length)return;expanded=setSectionBlocksExpanded(map,expanded,sectionScope,open);await render(false);save();});
  layerControl.addEventListener('change',()=>{layer=layerControl.value;if(layer==='source')filterSourceSelection();render();save();});
  document.getElementById('ns-back').onclick=()=>history.back();document.getElementById('ns-fit').onclick=()=>{fit();save();};document.getElementById('ns-focus').onclick=async()=>{if(!selected||!items.has(selected))return;let frame=canvas.querySelector(`[data-frame="${CSS.escape(selected)}"]`);if(!frame){let at=items.get(selected)?.parent_id;while(at){expanded.add(at);at=items.get(at)?.parent_id;}await render(false);frame=canvas.querySelector(`[data-frame="${CSS.escape(selected)}"]`);}if(!frame)return;const box=frame.getBBox(),canvasRect=canvas.getBoundingClientRect(),drawerRect=detail.classList.contains('open')?detail.getBoundingClientRect():null,usableWidth=drawerRect&&drawerRect.left<canvasRect.right?Math.max(220,Math.min(canvas.clientWidth,drawerRect.left-canvasRect.left-12)):canvas.clientWidth;scale=Math.min(1.6,Math.max(.6,Math.min(usableWidth*.65/box.width,canvas.clientHeight*.65/box.height)));panX=usableWidth/2-(box.x+box.width/2)*scale;panY=canvas.clientHeight/2-(box.y+box.height/2)*scale;applyTransform(true);save();};document.getElementById('ns-in').onclick=()=>{scale=Math.min(4,scale*1.2);applyTransform();save();};document.getElementById('ns-out').onclick=()=>{scale=Math.max(.35,scale/1.2);applyTransform();save();};document.getElementById('ns-export').onclick=()=>{const svg=canvas.querySelector('svg');if(!svg)return;const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nested-source.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  canvas.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(.35,Math.min(4,scale*(e.deltaY>0?.9:1.1)));applyTransform();},{passive:false});canvas.addEventListener('pointerdown',e=>{if(e.target.closest('[data-select],[data-edges]'))return;drag={x:e.clientX,y:e.clientY,px:panX,py:panY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;panX=drag.px+e.clientX-drag.x;panY=drag.py+e.clientY-drag.y;applyTransform();});canvas.addEventListener('pointerup',()=>{if(drag){drag=null;save();}});
  window.addEventListener('popstate',restore);window.addEventListener('hashchange',restore);restore();
}
