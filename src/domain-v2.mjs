import {compactLabel, renderSourceText} from './domain-v2-presentation.mjs';
import {safeFile, read} from './checks.mjs';

const fail = message => { throw Error(`domain-model: ${message}`); };
const text = (value, name) => { if (typeof value !== 'string' || !value.trim()) fail(`${name} must be non-empty text`); };
const array = (value, name) => { if (!Array.isArray(value)) fail(`${name} must be an array`); };
const id = (value, name) => { text(value, name); if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) fail(`Invalid ${name}: ${value}`); };
const owns = (value, key) => Object.hasOwn(value, key);

export function validateDomainV2(model, manifest, root, {denied = ['private'], checkTest} = {}) {
  if (!['diagram-domain-model/v2','diagram-domain-model/v3','diagram-domain-model/v4','diagram-domain-model/v5'].includes(model?.schema_version)) fail('Unsupported model schema');
  const v5=model.schema_version==='diagram-domain-model/v5';
  const v4=v5||model.schema_version==='diagram-domain-model/v4';
  text(model.title, 'title'); id(model.root_id, 'root ID');
  for (const key of ['nodes', 'edges', 'reading_order']) array(model[key], key);
  for (const key of ['groups', 'traces']) if (model[key] !== undefined) array(model[key], key);
  if (!manifest?.sources || typeof manifest.sources !== 'object' || Array.isArray(manifest.sources)) fail('Missing evidence sources');
  for (const [key, source] of Object.entries(manifest.sources)) {
    id(key, 'evidence ID'); text(source?.label, 'evidence label'); text(source?.path, 'evidence path');
    safeFile(root, source.path, denied);
    for (const field of ['excerpt', 'location']) if (source[field] !== undefined && typeof source[field] !== 'string') fail(`Invalid evidence ${field}: ${key}`);
  }
  const ids = new Set(), nodes = new Map(), edges = new Map(), elements = {};
  const register = (item, name) => {
    id(item?.id, `${name} ID`); if (ids.has(item.id)) fail(`Duplicate ID: ${item.id}`);
    ids.add(item.id); text(item.label, `${name} label`);
    if (item.order !== undefined && !Number.isFinite(item.order)) fail(`Invalid order: ${item.id}`);
  };
  const evidence = item => {
    array(item.evidence, `evidence for ${item.id}`); if (!item.evidence.length) fail(`Missing evidence: ${item.id}`);
    for (const ref of item.evidence) if (!owns(manifest.sources, ref)) fail(`Unknown evidence: ${ref}`);
    elements[item.id] = item.evidence;
    if (item.status !== undefined && !['modelled', 'unknown', 'proposed'].includes(item.status)) fail(`Invalid status: ${item.id}`);
    if (['unknown', 'proposed'].includes(item.status)) text(item.reason, `reason for ${item.id}`);
    if (item.details !== undefined && typeof item.details !== 'string' && !(item.details && typeof item.details === 'object' && !Array.isArray(item.details))) fail(`Invalid details: ${item.id}`);
    for (const field of ['kind', 'origin']) if (item[field] !== undefined) text(item[field], `${field} for ${item.id}`);
  };
  for (const node of model.nodes) {
    register(node, 'node'); evidence(node); nodes.set(node.id, node);
    if (node.origin !== undefined && !['source','interpretation','organization'].includes(node.origin)) fail(`Invalid origin: ${node.id}`);
    if (node.role !== undefined && !['mainline','supporting'].includes(node.role)) fail(`Invalid role: ${node.id}`);
    if (node.children !== undefined) array(node.children, `children for ${node.id}`);
    if (node.related_element_ids !== undefined) array(node.related_element_ids, `related_element_ids for ${node.id}`);
    if (node.summary !== undefined) {
      array(node.summary, `summary for ${node.id}`); const local = new Set();
      for (const item of node.summary) {
        id(item?.id, `summary ID for ${node.id}`); if (local.has(item.id)) fail(`Duplicate summary ID: ${node.id}/${item.id}`); local.add(item.id);
        text(item.text, `summary text for ${node.id}/${item.id}`);
        if (!['source','interpretation'].includes(item.origin)) fail(`Invalid summary origin: ${node.id}/${item.id}`);
        array(item.evidence, `summary evidence for ${node.id}/${item.id}`); if (!item.evidence.length) fail(`Missing summary evidence: ${node.id}/${item.id}`);
        for (const ref of item.evidence) if (!owns(manifest.sources, ref)) fail(`Unknown evidence: ${ref}`);
      }
    }
  }
  if (!nodes.has(model.root_id)) fail(`Missing root: ${model.root_id}`);
  if (nodes.get(model.root_id).kind !== 'chapter') fail('Root must be chapter');
  for (const node of model.nodes) {
    const seen = new Set();
    for (const child of node.children || []) {
      if (!nodes.has(child)) fail(`Unknown child: ${node.id}/${child}`);
      if (child === node.id) fail(`Self child: ${node.id}`);
      if (seen.has(child)) fail(`Duplicate child: ${node.id}/${child}`); seen.add(child);
    }
    if ((v4?['chapter','section','topic','block']:['chapter','topic','block']).includes(node.kind) && node.children === undefined) fail(`Missing children: ${node.id}`);
    if (node.related_element_ids !== undefined) {
      if (!(v4?['chapter','section','block']:['block']).includes(node.kind)) fail(`Related elements require block: ${node.id}`);
      if (new Set(node.related_element_ids).size !== node.related_element_ids.length) fail(`Duplicate related element: ${node.id}`);
      for (const ref of node.related_element_ids) {
        if (!nodes.has(ref)) fail(`Unknown related element: ${node.id}/${ref}`);
        if ((nodes.get(ref).children || []).length || (node.children || []).includes(ref)) fail(`Invalid related element: ${node.id}/${ref}`);
      }
    }
  }
  const visited = new Set(), visiting = new Set();
  function walk(nodeId) {
    if (visiting.has(nodeId)) fail(`Hierarchy cycle: ${nodeId}`);
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const child of nodes.get(nodeId).children || []) walk(child);
    visiting.delete(nodeId); visited.add(nodeId);
  }
  walk(model.root_id);
  if (visited.size !== nodes.size) fail(`Unreachable nodes: ${model.nodes.filter(n => !visited.has(n.id)).map(n => n.id).join(', ')}`);
  const structural = new Set(v4?['chapter','section','block']:[]);
  const leafIds = new Set(model.nodes.filter(n => !(n.children || []).length && !structural.has(n.kind)).map(n => n.id));
  if (new Set(model.reading_order).size !== model.reading_order.length || model.reading_order.some(x => !leafIds.has(x)) || model.reading_order.length !== leafIds.size) fail('reading_order must list every leaf exactly once');
  for (const edge of model.edges) {
    register(edge, 'edge'); evidence(edge); edges.set(edge.id, edge);
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) fail(`Dangling edge: ${edge.id}`);
    if (!['directed','symmetric','undirected'].includes(edge.direction)) fail(`Invalid direction: ${edge.id}`);
    if (!['source','interpretation'].includes(edge.origin)) fail(`Invalid edge origin: ${edge.id}`);
    if (edge.supporting_edge_ids !== undefined) array(edge.supporting_edge_ids, `supporting_edge_ids for ${edge.id}`);
    if (edge.scope_note !== undefined) text(edge.scope_note, `scope_note for ${edge.id}`);
    if (v4) {
      const types=['conditions','exception_to','replaces','supports','precedes','quantifies','example_of','qualifies','causes','contrasts_with','elaborates'];
      const labels={conditions:'条件',exception_to:'例外',replaces:'替代',supports:'支持',precedes:'先于',quantifies:'量化',example_of:'示例',qualifies:'限定',causes:'导致',contrasts_with:'对照',elaborates:'阐释'};
      if(!types.includes(edge.type)||edge.label!==labels[edge.type])fail(`Invalid relation type or label: ${edge.id}`);
      if(edge.direction!==(edge.type==='contrasts_with'?'symmetric':'directed'))fail(`Invalid relation direction: ${edge.id}`);
      if(edge.uncertainty!==undefined)text(edge.uncertainty,`uncertainty for ${edge.id}`);
    }
    if (edge.origin === 'interpretation') {
      text(edge.rationale, `rationale for ${edge.id}`); if(!v4)text(edge.uncertainty, `uncertainty for ${edge.id}`);
      array(edge.premises, `premises for ${edge.id}`); if (!edge.premises.length) fail(`Missing premises: ${edge.id}`);
      for (const premise of edge.premises) {
        if (!premise || typeof premise !== 'object' || Array.isArray(premise) || !Object.keys(premise).length) fail(`Invalid premise: ${edge.id}`);
        if(v4 && (!premise.source || !premise.object_id || !premise.content_revision || !premise.field_path || !owns(manifest.sources,premise.source)))fail(`Invalid premise source identity: ${edge.id}`);
      }
    }
  }
  for (const edge of model.edges) {
    if (new Set(edge.supporting_edge_ids || []).size !== (edge.supporting_edge_ids || []).length) fail(`Duplicate supporting edge: ${edge.id}`);
    for (const ref of edge.supporting_edge_ids || []) if (!edges.has(ref) || ref === edge.id) fail(`Invalid supporting edge: ${edge.id}/${ref}`);
    if (edge.origin === 'source' && (edge.supporting_edge_ids || []).some(ref => edges.get(ref).origin !== 'source')) fail(`Source roll-up cites interpretation: ${edge.id}`);
    const aggregate=v4?['chapter','section','topic','block'].includes(nodes.get(edge.from).kind)||['chapter','section','topic','block'].includes(nodes.get(edge.to).kind):(nodes.get(edge.from).children || []).length || (nodes.get(edge.to).children || []).length;
    if(v4){
      const descendants=id=>{const found=new Set(),walk=id=>{for(const child of nodes.get(id)?.children||[]){found.add(child);walk(child);}};walk(id);for(const ref of nodes.get(id)?.related_element_ids||[])found.add(ref);return found;};
      for(const [field,endpoint] of [['from_element_ids',edge.from],['to_element_ids',edge.to]]){
        const node=nodes.get(endpoint),higher=['chapter','section','topic','block'].includes(node.kind);
        if(higher){array(edge[field],`${field} for ${edge.id}`);if(!edge[field].length||new Set(edge[field]).size!==edge[field].length)fail(`Invalid ${field}: ${edge.id}`);
          const allowed=descendants(endpoint);for(const ref of edge[field])if(!leafIds.has(ref)||!allowed.has(ref))fail(`Out-of-scope ${field}: ${edge.id}/${ref}`);
        }else if(edge[field]!==undefined){array(edge[field],`${field} for ${edge.id}`);if(edge[field].length!==1||edge[field][0]!==endpoint)fail(`Invalid ${field}: ${edge.id}`);}
      }
      if(!v5&&edge.supporting_edge_ids?.length){
        const signature=e=>[e.type,e.direction,JSON.stringify([...(e.from_element_ids||[e.from])].sort()),JSON.stringify([...(e.to_element_ids||[e.to])].sort())].join('|');
        for(const ref of edge.supporting_edge_ids)if(signature(edges.get(ref))!==signature(edge))fail(`Roll-up mismatch: ${edge.id}/${ref}`);
      }
    }
    if (!v5 && edge.origin === 'source' && aggregate && !(edge.supporting_edge_ids || []).length) fail(`Source aggregate lacks supporting edges: ${edge.id}`);
    if (!v4 && (edge.supporting_edge_ids || []).length) text(edge.scope_note, `scope_note for ${edge.id}`);
  }
  const supported=new Set(), supporting=new Set();
  function checkSupport(edgeId) {
    if (supporting.has(edgeId)) fail(`Supporting edge cycle: ${edgeId}`);
    if (supported.has(edgeId)) return;
    supporting.add(edgeId); for (const ref of edges.get(edgeId).supporting_edge_ids || []) checkSupport(ref);
    supporting.delete(edgeId); supported.add(edgeId);
  }
  for (const edgeId of edges.keys()) checkSupport(edgeId);
  for (const trace of model.traces || []) {
    register(trace, 'trace'); text(trace.description, `trace description for ${trace.id}`);
    for (const [field, index] of [['node_ids', nodes], ['edge_ids', edges]]) {
      array(trace[field], field);
      if (new Set(trace[field]).size !== trace[field].length) fail(`Duplicate trace reference: ${trace.id}`);
      for (const ref of trace[field]) if (!index.has(ref)) fail(`Unknown trace reference: ${ref}`);
    }
    for (const ref of trace.edge_ids) if (!trace.node_ids.includes(edges.get(ref).from) || !trace.node_ids.includes(edges.get(ref).to)) fail(`Trace omits endpoint: ${ref}`);
  }
  for (const [key, refs] of Object.entries(manifest.elements || {})) if (!owns(elements, key) || JSON.stringify(refs) !== JSON.stringify(elements[key])) fail(`Conflicting evidence mapping: ${key}`);
  for (const [key, inv] of Object.entries(manifest.invariants || {})) {
    id(key, 'invariant ID'); text(inv.text, 'invariant text'); array(inv.sources, 'invariant sources'); array(inv.tests, 'invariant tests');
    for (const ref of inv.sources) if (!owns(manifest.sources, ref)) fail(`Unknown invariant evidence: ${ref}`);
    for (const test of inv.tests) {
      if (!checkTest) fail(`No test reference checker configured for ${key}`);
      const source = manifest.sources[test.source];
      if (!source || !checkTest({text: read(safeFile(root, source.path, denied)), reference: test})) fail(`Missing test symbol for ${key}: ${test.symbol}`);
    }
  }
  return {...manifest, elements, invariants: manifest.invariants || {}};
}

export function selectHierarchyView(model, nodeId, layer = 'all') {
  const parent = model.nodes.find(n => n.id === nodeId);
  if (!parent) fail(`Unknown view: ${nodeId}`);
  const visible = n => layer === 'all' || n.origin !== 'interpretation';
  const owned = new Set((parent.children || []).filter(id => visible(model.nodes.find(n => n.id === id))));
  const edges = model.edges.filter(e => (layer === 'all' || e.origin === 'source') &&
    (owned.has(e.from) || owned.has(e.to)) && visible(model.nodes.find(n => n.id === e.from)) && visible(model.nodes.find(n => n.id === e.to)));
  const included = new Set([...owned, ...(parent.related_element_ids || []).filter(id => visible(model.nodes.find(n => n.id === id))), ...edges.flatMap(e => [e.from, e.to])]);
  return {nodes: model.nodes.filter(n => included.has(n.id)), edges, owned};
}

const kindNames = {chapter:'章节',topic:'主题',block:'知识块',assertion:'论述',action:'动作',condition:'条件',parameter:'参数',example:'示例',record:'记录',idea:'想法',constraint:'约束',unknown:'待核'};
const basisNames = {explicit:'原文明示',contextual:'上下文支持',inferred:'来源推断',inferred_from_source:'来源推断',interpretation:'项目解释',project_interpretation:'项目解释'};
const readable = {source_revision:'来源修订',field_path:'来源字段',content_revision:'内容修订',basis:'依据类型',source:'来源有据',interpretation:'推测 · 项目解释',organization:'阅读组织',mainline:'主干',supporting:'支撑',scope_note:'范围说明',rationale:'理由',premises:'前提',uncertainty:'不确定性',details:'说明',reason:'状态原因',status:'状态',kind:'类型',role:'阅读角色',supporting_edge_ids:'所依据关系',related_element_ids:'显式关联要素',object_id:'来源对象',field:'字段',revision:'修订'};
function edgeLabel(e, nodes) { return `${compactLabel(nodes.get(e.from).label, 30).text} ${e.direction === 'directed' ? '→' : e.direction === 'symmetric' ? '↔' : '—'} ${compactLabel(nodes.get(e.to).label, 30).text}：${compactLabel(e.label, 36).text}${e.origin === 'interpretation' ? '（推测）' : '（来源有据）'}`; }
function renderDetailsContent(value, esc) {
  if (typeof value === 'string') return `<div class="source-text">${renderSourceText(value)}</div>`;
  if (Array.isArray(value)) return `<ul>${value.map(item => `<li>${renderDetailsContent(item, esc)}</li>`).join('')}</ul>`;
  if (value && typeof value === 'object') return `<dl>${Object.entries(value).map(([key, item]) => `<dt>${esc(readable[key] || key)}</dt><dd>${renderDetailsContent(item, esc)}</dd>`).join('')}</dl>`;
  return esc(String(value));
}


// This function is serialized into the page. All semantic choices are precomputed.
export function hierarchyController() {
  const data = JSON.parse(document.getElementById('domain-v2-data').textContent);
  const nodes = new Map(data.model.nodes.map(n => [n.id,n]));
  const edges = new Map(data.model.edges.map(e => [e.id,e]));
  const scope = document.getElementById('hierarchy-scope'), layer = document.getElementById('hierarchy-layer'), mode = document.getElementById('hierarchy-mode');
  const detail = document.getElementById('domain-detail'), crumbs = document.getElementById('hierarchy-crumbs');
  const state = {path:[data.model.root_id], layer:'all', mode:'local', selected:''};
  const fullText = new Map([...document.querySelectorAll('template[data-full-text]')].map(t=>[t.dataset.fullText,t]));
  const excerpts = new Map([...document.querySelectorAll('template[data-excerpt]')].map(t=>[t.dataset.excerpt,t]));
  const extraDetails = new Map([...document.querySelectorAll('template[data-item-details]')].map(t=>[t.dataset.itemDetails,t]));
  const format = (value, field='') => Array.isArray(value) ? value.map(v=>format(v)).join('；') : value && typeof value==='object' ? Object.entries(value).map(([k,v])=>`${data.labels[k]||k}：${format(v,k)}`).join('，') : field==='kind' ? (data.kindNames[value]||String(value)) : field==='basis' ? (data.basisNames[value]||String(value)) : String(value);
  const evidence = ids => {
    const ul=document.createElement('ul');
    for(const id of ids) {
      const source=data.sources[id], li=document.createElement('li'), link=document.createElement('a');
      link.href=source.href; link.textContent=source.label; li.append(link);
      if(source.location){const p=document.createElement('p');p.textContent=`位置：${source.location}`;li.append(p);}
      if(excerpts.has(id)){const details=document.createElement('details'), summary=document.createElement('summary');summary.textContent='展开原文摘录';details.append(summary,excerpts.get(id).content.cloneNode(true));li.append(details);}
      ul.append(li);
    }
    return ul;
  };
  function choose(key) {
    detail.replaceChildren(); state.selected=key;
    let item, kind;
    if(key.startsWith('summary:')) { const [,owner,id]=key.split(':'); item=nodes.get(decodeURIComponent(owner))?.summary?.find(s=>s.id===decodeURIComponent(id)); kind='summary'; }
    else if(nodes.has(key)){item=nodes.get(key);kind='node';}
    else if(edges.has(key)){item=edges.get(key);kind='edge';}
    if(!item || (state.layer==='source' && item.origin==='interpretation')) {detail.textContent='选择卡片、摘要、要素或关系查看证据。';state.selected='';return;}
    const heading=document.createElement('h2');heading.textContent=kind==='summary'?'摘要证据':(data.previews[key]||item.label);detail.append(heading);
    if(kind!=='summary' && data.omitted[key] && fullText.has(key)){const disclosure=document.createElement('details'), summary=document.createElement('summary');summary.textContent='展开完整文本与表格';disclosure.append(summary,fullText.get(key).content.cloneNode(true));detail.append(disclosure);}
    const origin=document.createElement('p');origin.textContent=`身份：${item.origin==='interpretation'?'推测 · 项目解释':item.origin==='organization'||['chapter','topic','block'].includes(item.kind)?'阅读组织':'来源有据'}`;detail.append(origin);
    if(kind==='summary'){const p=document.createElement('p');p.textContent=item.text;detail.append(p);}
    else {
      for(const [key,value] of Object.entries(item)) {
        if(['id','label','evidence','children','summary','origin','from','to','direction','order','details'].includes(key)) continue;
        if(value==='' || (Array.isArray(value)&&!value.length)) continue;
        const p=document.createElement('p');p.textContent=`${data.labels[key]||key}：${format(value,key)}`;detail.append(p);
      }
    }
    if(kind!=='summary' && extraDetails.has(key)){const disclosure=document.createElement('details'), summary=document.createElement('summary');summary.textContent='更多说明';disclosure.append(summary,extraDetails.get(key).content.cloneNode(true));detail.append(disclosure);}
    const h=document.createElement('h3');h.textContent='原文依据';detail.append(h,evidence(item.evidence));
  }
  function decode() {
    const params=new URLSearchParams(location.hash.slice(1));
    const candidate=(params.get('path')||'').split(',').filter(Boolean);
    const valid=[data.model.root_id];
    for(const id of candidate.slice(1)) {if(nodes.get(valid.at(-1))?.children?.includes(id) && (params.get('layer')!=='source'||nodes.get(id).origin!=='interpretation')) valid.push(id);else break;}
    state.path=valid;
    state.layer=params.get('layer')==='source'?'source':'all';state.mode=params.get('mode')==='full'?'full':'local';
    state.selected=params.get('selected')||'';
  }
  function save() {const q=new URLSearchParams({path:state.path.join(','),layer:state.layer,mode:state.mode});if(state.selected)q.set('selected',state.selected);history.pushState(null,'',`#${q}`);render();}
  function render() {
    const current=state.path.at(-1), currentNode=nodes.get(current);
    layer.value=state.layer;mode.value=state.mode;
    for(const panel of scope.querySelectorAll('[data-panel]')) panel.hidden=!(panel.dataset.layer===state.layer && panel.dataset.mode===state.mode && (state.mode==='full' || panel.dataset.panel===current));
    crumbs.replaceChildren();
    state.path.forEach((id,i)=>{const button=document.createElement('button');button.type='button';button.textContent=data.previews[id]||nodes.get(id).label;button.disabled=i===state.path.length-1;button.addEventListener('click',()=>{state.path=state.path.slice(0,i+1);state.selected='';save();});crumbs.append(button);if(i<state.path.length-1)crumbs.append(' › ');});
    document.getElementById('hierarchy-back').disabled=state.path.length===1;
    document.getElementById('hierarchy-title').textContent=data.previews[current]||currentNode.label;
    if(state.selected) choose(state.selected);else if(!(currentNode.children||[]).length) choose(current);else detail.textContent='选择卡片、摘要、要素或关系查看证据。';
  }
  scope.addEventListener('click',event=>{
    const navigate=event.target.closest('[data-navigate]');
    if(navigate){const next=navigate.dataset.navigate;if(nodes.get(state.path.at(-1))?.children?.includes(next)){state.path.push(next);state.selected='';save();return;}}
    const item=event.target.closest('[data-select]');if(item){state.selected=item.dataset.select;save();}
  });
  scope.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('g[data-select]')){event.preventDefault();state.selected=event.target.dataset.select;save();}});
  document.getElementById('hierarchy-back').addEventListener('click',()=>{if(state.path.length>1){state.path.pop();state.selected='';save();}});
  document.getElementById('hierarchy-root').addEventListener('click',()=>{state.path=[data.model.root_id];state.selected='';save();});
  layer.addEventListener('change',()=>{
    state.layer=layer.value;
    if(state.layer==='source'){const first=state.path.findIndex((id,i)=>i>0&&nodes.get(id)?.origin==='interpretation');if(first>0)state.path=state.path.slice(0,first);}
    state.selected='';save();
  });
  mode.addEventListener('change',()=>{state.mode=mode.value;state.selected='';save();});
  document.getElementById('hierarchy-export').addEventListener('click',()=>{
    const panel=[...scope.querySelectorAll('[data-panel]')].find(p=>!p.hidden), svg=panel?.querySelector('svg');if(!svg)return;
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
    const link=document.createElement('a');link.href=url;link.download='domain-view.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  addEventListener('popstate',()=>{decode();render();});
  addEventListener('hashchange',()=>{decode();render();});
  addEventListener('pageshow',()=>requestAnimationFrame(()=>{decode();render();}));
  decode();render();
}

export function renderDomainV2({model, manifest, page, esc, docName, notice}, graphSvg) {
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const items=[...model.nodes,...model.edges];
  const previews=Object.fromEntries(items.map(item=>[item.id,compactLabel(item.label).text]));
  const omitted=Object.fromEntries(items.map(item=>[item.id,compactLabel(item.label).omitted]));
  const assets={}; let serial=0;
  const layers=['all','source'];
  const visible=(node,layer)=>layer==='all'||node.origin!=='interpretation';
  function summaries(node,layer) {
    const items=(node.summary||[]).filter(s=>layer==='all'||s.origin==='source');
    return items.length?`<ul class="hierarchy-summary">${items.map(s=>`<li><button data-select="summary:${esc(encodeURIComponent(node.id))}:${esc(encodeURIComponent(s.id))}">${esc(compactLabel(s.text, 110).text)} <span>${s.origin==='interpretation'?'推测 · 项目解释':'来源有据'}</span></button></li>`).join('')}</ul>`:(['chapter','topic','block'].includes(node.kind)?'<p>此层暂无来源有据的摘要。</p>':'');
  }
  function relationList(view) {
    return `<ul class="relation-list">${view.edges.map(e=>`<li><button data-select="${esc(e.id)}">${esc(edgeLabel(e,nodes))}</button></li>`).join('')||'<li>本范围没有声明的关系。</li>'}</ul>`;
  }
  function cards(node,layer) {
    const children=(node.children||[]).map(id=>nodes.get(id)).filter(n=>visible(n,layer));
    const group=(role,label)=>{
      const list=children.filter(n=>role==='mainline'?n.role!=='supporting':n.role==='supporting');
      if(!list.length)return '';
      return `<section class="hierarchy-card-group"><h3>${label}</h3><div class="hierarchy-cards">${list.map(n=>`<article><h4><button data-navigate="${esc(n.id)}">${esc(previews[n.id])}</button></h4><p class="identity">${n.origin==='interpretation'?'推测 · 项目解释':n.origin==='organization'||['chapter','topic','block'].includes(n.kind)?'阅读组织':'来源有据'}</p>${summaries(n,layer)}<button data-select="${esc(n.id)}">查看详情与依据</button></article>`).join('')}</div></section>`;
    };
    return group('mainline',node.kind==='chapter'?'主干':'知识块与要素')+group('supporting','支撑');
  }
  const panels=[];
  for(const node of model.nodes) for(const layer of layers) {
    const view=selectHierarchyView(model,node.id,layer);
    const graphView={...view,nodes:view.nodes.map(n=>({...n,label:compactLabel(n.label,40).text,kind:kindNames[n.kind]||n.kind})),edges:view.edges.map(e=>({...e,label:compactLabel(e.label,36).text}))};
    const svg=graphSvg(graphView,`v2-${serial++}`,esc), asset=`images/hierarchy-${encodeURIComponent(node.id)}-${layer}.svg`;assets[asset]=svg;
    const related=view.nodes.filter(n=>!view.owned.has(n.id));
    const descendants=new Set();const collect=id=>{const n=nodes.get(id);if(!(n.children||[]).length){if(visible(n,layer))descendants.add(id);}else for(const c of n.children)collect(c);};collect(node.id);
    const localOrder=model.reading_order.filter(id=>descendants.has(id));
    panels.push(`<div data-panel="${esc(node.id)}" data-layer="${layer}" data-mode="local" hidden><p class="identity">${node.origin==='organization'||['chapter','topic','block'].includes(node.kind)?'阅读组织':node.origin==='interpretation'?'推测 · 项目解释':'来源有据'}</p>${summaries(node,layer)}${cards(node,layer)}<h3>局部关系</h3><p>仅显示本层直接子项已声明的关系；虚线和“推测”表示项目解释。</p><p><a href="${asset}" download>下载本范围 SVG</a></p><div class="domain-viewport">${svg}</div><div class="domain-list"><ul>${view.nodes.map(n=>`<li>${view.owned.has(n.id)?'成员':'关联端点'}：<button data-${view.owned.has(n.id)&&nodes.get(node.id).children?.includes(n.id)?'navigate':'select'}="${esc(n.id)}">${esc(previews[n.id])}</button></li>`).join('')||'<li>本范围没有直接子项。</li>'}</ul></div>${related.length?`<h4>关联端点（非本块成员）</h4><ul>${related.map(n=>`<li><button data-select="${esc(n.id)}">${esc(previews[n.id])}</button></li>`).join('')}</ul>`:''}<h4>关系与依据</h4>${relationList(view)}<details><summary>原文顺序（${localOrder.length} 个要素）</summary><ol>${localOrder.map(id=>`<li><button data-select=\"${esc(id)}\">${esc(previews[id])}</button></li>`).join('')}</ol></details></div>`);
  }
  for(const layer of layers) {
    const allNodes=model.nodes.filter(n=>visible(n,layer));
    const allIds=new Set(allNodes.map(n=>n.id));
    const edges=model.edges.filter(e=>(layer==='all'||e.origin==='source')&&allIds.has(e.from)&&allIds.has(e.to));
    const view={nodes:allNodes,edges,owned:allIds};
    const graphView={...view,nodes:view.nodes.map(n=>({...n,label:compactLabel(n.label,40).text,kind:kindNames[n.kind]||n.kind})),edges:view.edges.map(e=>({...e,label:compactLabel(e.label,36).text}))};
    const svg=graphSvg(graphView,`v2-full-${layer}`,esc);assets[`images/full-${layer}.svg`]=svg;
    const sequence=model.reading_order.filter(id=>allIds.has(id));
    const full=`<div data-panel="${esc(model.root_id)}" data-layer="${layer}" data-mode="full" hidden><h3>完整模型（可选）</h3><p>全部层级与关系；叶要素阅读顺序由来源声明，与关系方向分开。</p><a href="images/full-${layer}.svg" download>下载完整 SVG</a><div class="domain-viewport">${svg}</div><h4>原文顺序</h4><ol>${sequence.map(id=>`<li><button data-select="${esc(id)}">${esc(previews[id])}</button></li>`).join('')}</ol>${relationList(view)}</div>`;
    panels.push(full);
  }
  const sources=Object.fromEntries(Object.entries(manifest.sources).map(([key,s])=>[key,{label:s.label,href:'docs/'+docName(s.path),location:s.location}]));
  const data=JSON.stringify({model,sources,labels:readable,kindNames,basisNames,previews,omitted}).replace(/</g,'\\u003c');
  const body=`<h1>${esc(model.title)}</h1>${notice}<style>body{overflow-wrap:anywhere;overflow-x:hidden}button{font:inherit;cursor:pointer;border:1px solid #9daebd;border-radius:6px;background:#fff;color:#174973;padding:5px 10px;white-space:normal;text-align:left}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid #116dd8}[hidden]{display:none!important}.hierarchy-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.hierarchy-controls label{display:grid}.hierarchy-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.hierarchy-cards article{margin:0;padding:14px}.hierarchy-summary{padding-left:20px}.hierarchy-summary button{width:100%}.hierarchy-summary span,.identity{font-size:.88em;color:#394f63}.domain-viewport{max-width:100%;overflow:auto;background:#f7fafc;border:1px solid #ccd6df;border-radius:8px}.domain-viewport svg{display:block;max-width:none}.domain-list{display:none}.relation-list button{width:100%}.source-text{max-width:100%;overflow-wrap:anywhere;overflow-x:auto}.source-text table{border-collapse:collapse;display:table;max-width:none;width:max-content}.source-text th,.source-text td{border:1px solid #bfcddd;padding:5px 8px;white-space:pre-wrap;vertical-align:top}.source-table{max-width:100%;overflow-x:auto}#domain-detail details{margin:10px 0}#domain-detail blockquote{border-left:3px solid #708eaa;padding-left:12px;white-space:pre-wrap}#hierarchy-crumbs{display:flex;flex-wrap:wrap;gap:4px;align-items:center}@media(max-width:700px){body{margin:16px auto;padding:0 12px}section,article{padding:14px}.domain-viewport{display:none}.domain-list{display:block}.hierarchy-controls>*{width:100%}}</style><section><nav id="hierarchy-crumbs" aria-label="层级路径"></nav><div class="hierarchy-controls"><button id="hierarchy-back">返回上层</button><button id="hierarchy-root">返回章节</button><label>关系层<select id="hierarchy-layer"><option value="all">来源与推测</option><option value="source">仅来源有据</option></select></label><label>查看方式<select id="hierarchy-mode"><option value="local">局部阅读</option><option value="full">完整模型</option></select></label><button id="hierarchy-export">导出当前 SVG</button></div><h2 id="hierarchy-title"></h2><p>层级卡片属于阅读组织；来源有据与推测分别标明。完整模型需主动选择。</p><div id="hierarchy-scope">${panels.join('')}</div></section><section id="domain-detail" aria-live="polite">选择卡片、摘要、要素或关系查看证据。</section>${items.map(item=>`<template data-full-text="${esc(item.id)}"><div class="source-text">${renderSourceText(item.label)}</div></template>`).join('')}${items.filter(item=>item.details !== undefined && (typeof item.details !== 'string' || item.details.trim())).map(item=>`<template data-item-details="${esc(item.id)}">${renderDetailsContent(item.details,esc)}</template>`).join('')}${Object.entries(manifest.sources).filter(([,source])=>source.excerpt).map(([id,source])=>`<template data-excerpt="${esc(id)}"><div class="source-text">${renderSourceText(source.excerpt)}</div></template>`).join('')}<script type="application/json" id="domain-v2-data">${data}</script><script>(${hierarchyController.toString()})();</script>`;
  return {pages:{'index.html':page(model.title,body)},assets};
}
