import {validateDomainV2, renderDomainV2} from './domain-v2.mjs';
import {validateReadingStructures} from './reading-structures.mjs';
import {validateDomainV5} from './domain-v5.mjs';
import {safeFile, read} from './checks.mjs';

const fail = message => { throw Error(`domain-model: ${message}`); };
const text = (value, name) => { if (typeof value !== 'string' || !value.trim()) fail(`${name} must be non-empty text`); };
const array = (value, name) => { if (!Array.isArray(value)) fail(`${name} must be an array`); };
const identity = (value, name) => { text(value, name); if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) fail(`Invalid ${name}: ${value}`); };
const own = (value, key) => Object.hasOwn(value, key);

export function validateDomainModel(model, manifest, root, {denied = ['private'], checkTest} = {}) {
  if (model?.schema_version === 'diagram-domain-model/v2') return validateDomainV2(model, manifest, root, {denied, checkTest});
  if (model?.schema_version === 'diagram-domain-model/v3') {
    const validated=validateDomainV2(model,manifest,root,{denied,checkTest});
    validateReadingStructures(model,manifest);
    return validated;
  }
  if (['diagram-domain-model/v4','diagram-domain-model/v5'].includes(model?.schema_version)) {
    const validated=validateDomainV2(model,manifest,root,{denied,checkTest});
    validateReadingStructures(model,manifest);
    if(model.schema_version==='diagram-domain-model/v5')validateDomainV5(model,manifest);
    return validated;
  }
  if (model?.schema_version !== 'diagram-domain-model/v1') fail('Unsupported model schema');
  text(model.title, 'title');
  for (const key of ['nodes', 'edges']) array(model[key], key);
  for (const key of ['groups', 'traces']) if (model[key] !== undefined) array(model[key], key);
  if (!manifest?.sources || typeof manifest.sources !== 'object' || Array.isArray(manifest.sources)) fail('Missing evidence sources');
  for (const [id, source] of Object.entries(manifest.sources)) {
    identity(id, 'evidence ID'); text(source.label, 'evidence label');
    text(source.path, 'evidence path'); safeFile(root, source.path, denied);
  }
  const ids = new Set(), nodes = new Map(), groups = new Set(), edges = new Map(), elements = {};
  const register = (item, name) => {
    identity(item.id, `${name} ID`);
    if (ids.has(item.id)) fail(`Duplicate ID: ${item.id}`);
    ids.add(item.id); text(item.label, `${name} label`);
    if (item.order !== undefined && !Number.isFinite(item.order)) fail(`Invalid order: ${item.id}`);
  };
  const evidence = item => {
    array(item.evidence, `evidence for ${item.id}`);
    if (!item.evidence.length) fail(`Missing evidence: ${item.id}`);
    for (const id of item.evidence) if (typeof id !== 'string' || !own(manifest.sources, id)) fail(`Unknown evidence: ${id}`);
    elements[item.id] = item.evidence;
    if (item.status !== undefined && !['modelled', 'unknown', 'proposed'].includes(item.status)) fail(`Invalid status: ${item.id}`);
    if (['unknown', 'proposed'].includes(item.status)) text(item.reason, `reason for ${item.id}`);
    for (const key of ['details', 'kind', 'origin']) if (item[key] !== undefined) text(item[key], `${key} for ${item.id}`);
  };
  for (const group of model.groups || []) { register(group, 'group'); groups.add(group.id); }
  for (const node of model.nodes) {
    register(node, 'node'); evidence(node); nodes.set(node.id, node);
    if (node.group !== undefined && !groups.has(node.group)) fail(`Unknown group: ${node.group}`);
  }
  for (const edge of model.edges) {
    register(edge, 'edge'); evidence(edge); edges.set(edge.id, edge);
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) fail(`Dangling edge: ${edge.id}`);
    if (!['directed', 'symmetric', 'undirected'].includes(edge.direction)) fail(`Invalid direction: ${edge.id}`);
  }
  for (const trace of model.traces || []) {
    register(trace, 'trace'); text(trace.description, `trace description for ${trace.id}`);
    for (const [key, index] of [['node_ids', nodes], ['edge_ids', edges]]) {
      array(trace[key], key);
      if (new Set(trace[key]).size !== trace[key].length) fail(`Duplicate trace reference: ${trace.id}`);
      for (const id of trace[key]) if (!index.has(id)) fail(`Unknown trace reference: ${id}`);
    }
    for (const id of trace.edge_ids) {
      const edge = edges.get(id);
      if (!trace.node_ids.includes(edge.from) || !trace.node_ids.includes(edge.to)) fail(`Trace omits endpoint: ${id}`);
    }
  }
  // Optional legacy mapping may agree, but must never override object evidence.
  for (const [id, refs] of Object.entries(manifest.elements || {})) {
    if (!own(elements, id) || JSON.stringify(refs) !== JSON.stringify(elements[id])) fail(`Conflicting evidence mapping: ${id}`);
  }
  for (const [id, inv] of Object.entries(manifest.invariants || {})) {
    identity(id, 'invariant ID'); text(inv.text, 'invariant text'); array(inv.sources, 'invariant sources'); array(inv.tests, 'invariant tests');
    for (const source of inv.sources) if (!own(manifest.sources, source)) fail(`Unknown invariant evidence: ${source}`);
    for (const test of inv.tests) {
      if (!checkTest) fail(`No test reference checker configured for ${id}`);
      const source = manifest.sources[test.source];
      if (!source || !checkTest({text: read(safeFile(root, source.path, denied)), reference: test})) fail(`Missing test symbol for ${id}: ${test.symbol}`);
    }
  }
  return {...manifest, elements, invariants: manifest.invariants || {}};
}

export function selectDomainView(model, group = '') {
  if (!group) return {nodes: model.nodes, edges: model.edges, owned: new Set(model.nodes.map(n => n.id))};
  const owned = new Set(model.nodes.filter(n => n.group === group).map(n => n.id));
  const edges = model.edges.filter(e => owned.has(e.from) || owned.has(e.to));
  const included = new Set([...owned, ...edges.flatMap(e => [e.from, e.to])]);
  return {nodes: model.nodes.filter(n => included.has(n.id)), edges, owned};
}

// Components and strongly connected components keep cycles stable without
// reinterpreting source order as execution order or changing arrow direction.
export function layoutDomain(view) {
  const order = new Map(view.nodes.map((n, i) => [n.id, [n.order ?? i, i]]));
  const compare = (a, b) => order.get(a)[0] - order.get(b)[0] || order.get(a)[1] - order.get(b)[1];
  const adjacency = new Map(view.nodes.map(n => [n.id, []]));
  for (const edge of view.edges) {
    adjacency.get(edge.from).push(edge.to);
    if (edge.direction !== 'directed') adjacency.get(edge.to).push(edge.from);
  }
  let sequence = 0;
  const low = new Map(), index = new Map(), stack = [], stacked = new Set(), sccs = [];
  function visit(id) {
    index.set(id, sequence); low.set(id, sequence++); stack.push(id); stacked.add(id);
    for (const next of adjacency.get(id)) {
      if (!index.has(next)) { visit(next); low.set(id, Math.min(low.get(id), low.get(next))); }
      else if (stacked.has(next)) low.set(id, Math.min(low.get(id), index.get(next)));
    }
    if (low.get(id) === index.get(id)) {
      const component = []; let item;
      do { item = stack.pop(); stacked.delete(item); component.push(item); } while (item !== id);
      sccs.push(component.sort(compare));
    }
  }
  for (const id of [...adjacency.keys()].sort(compare)) if (!index.has(id)) visit(id);
  sccs.sort((a, b) => compare(a[0], b[0]));
  const membership = new Map(sccs.flatMap((ids, i) => ids.map(id => [id, i])));
  const links = sccs.map(() => new Set()), undirected = sccs.map(() => new Set()), indegree = sccs.map(() => 0);
  for (const edge of view.edges) {
    const a = membership.get(edge.from), b = membership.get(edge.to);
    if (a === b) continue;
    if (!links[a].has(b)) { links[a].add(b); indegree[b]++; }
    undirected[a].add(b); undirected[b].add(a);
  }
  const ranks = sccs.map(() => 0), queue = indegree.flatMap((v, i) => v === 0 ? [i] : []);
  for (let i = 0; i < queue.length; i++) for (const next of links[queue[i]]) {
    ranks[next] = Math.max(ranks[next], ranks[queue[i]] + 1);
    if (--indegree[next] === 0) queue.push(next);
  }
  let top = 48, width = 680;
  const positions = new Map(), seen = new Set();
  for (let i = 0; i < sccs.length; i++) {
    if (seen.has(i)) continue;
    const component = [i]; seen.add(i);
    for (let j = 0; j < component.length; j++) for (const next of undirected[component[j]]) if (!seen.has(next)) { seen.add(next); component.push(next); }
    component.sort((a, b) => compare(sccs[a][0], sccs[b][0]));
    const lanes = new Map();
    for (const scc of component) for (const id of sccs[scc]) {
      const rank = ranks[scc], lane = lanes.get(rank) || 0;
      positions.set(id, {x: 48 + rank * 330, y: top + lane * 150, width: 230, height: 104});
      lanes.set(rank, lane + 1); width = Math.max(width, 388 + rank * 330);
    }
    top += Math.max(...lanes.values(), 1) * 150 + 60;
  }
  return {positions, width, height: Math.max(200, top)};
}

const svgStyles = `.node rect{fill:#fff;stroke:#8096aa;stroke-width:1.5}.node text{fill:#19314a;font:15px system-ui,sans-serif}.node .kind{fill:#536c82;font-size:12px}.edge path{fill:none;stroke:#5c7387;stroke-width:1.8}.edge text{fill:#374f66;font:12px system-ui,sans-serif;paint-order:stroke;stroke:#f7fafc;stroke-width:5px}.node.related rect{stroke-dasharray:5 3}.node.unknown rect,.node.proposed rect{fill:#fff8df}.edge.interpretation path{stroke-dasharray:6 4}.edge.selected path:not(.hit),.edge.trace path:not(.hit){stroke:#b84d00;stroke-width:3.5}.node.selected rect,.node.trace rect{stroke:#b84d00;stroke-width:3}.edge.dim,.node.dim{opacity:.25}.node:focus,.edge:focus{outline:none}.node:focus rect,.edge:focus path:not(.hit){stroke:#116dd8;stroke-width:4}.edge .hit{stroke:transparent;stroke-width:18;cursor:pointer}.node,.edge{cursor:pointer}`;

function graphSvg(view, prefix, esc) {
  const {positions, width, height} = layoutDomain(view);
  const wrap = (s, size = 13) => Array.from(s).reduce((lines, ch, i) => { const at = Math.floor(i / size); lines[at] = (lines[at] || '') + ch; return lines; }, []);
  const edges = view.edges.map((e, i) => {
    const a = positions.get(e.from), b = positions.get(e.to);
    let d, tx, ty;
    if (e.from === e.to) {
      d = `M ${a.x + 180} ${a.y} C ${a.x + 280} ${a.y - 52},${a.x + 280} ${a.y + 65},${a.x + 230} ${a.y + 65}`;
      tx = a.x + 244; ty = a.y - 12;
    } else if (a.x === b.x) {
      const bend = a.x + 264 + (i % 3) * 18;
      d = `M ${a.x + 230} ${a.y + 52} C ${bend} ${a.y + 52},${bend} ${b.y + 52},${b.x + 230} ${b.y + 52}`;
      tx = bend - 12; ty = a.y + (b.y - a.y) * .28 + 42;
    } else {
      const forward = b.x > a.x, ax = a.x + (forward ? 230 : 0), bx = b.x + (forward ? 0 : 230), mid = (ax + bx) / 2;
      d = `M ${ax} ${a.y + 52} C ${mid} ${a.y + 52},${mid} ${b.y + 52},${bx} ${b.y + 52}`;
      tx = mid; ty = (a.y + b.y) / 2 + 39 + (i % 2) * 14;
    }
    return `<g class="edge ${e.origin === 'interpretation' ? 'interpretation' : ''}" data-object="${esc(e.id)}" data-select="${esc(e.id)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" role="button" tabindex="0" aria-label="${esc(e.origin === 'interpretation' ? '推测 · ' : '')}${esc(e.label)}"><title>${esc(e.origin === 'interpretation' ? '推测 · ' : '')}${esc(e.label)} · ${esc(e.direction)}</title><path d="${d}"${e.direction === 'directed' ? ` marker-end="url(#${prefix}-arrow)"` : ''}/><path class="hit" d="${d}"/><text x="${tx}" y="${ty}" text-anchor="middle">${esc(Array.from(e.label).slice(0, 18).join(''))}</text></g>`;
  }).join('');
  const nodes = view.nodes.map(n => {
    const p = positions.get(n.id), wrapped = wrap(n.label), lines = wrapped.slice(0, 3);
    if (wrapped.length > 3) lines[2] = Array.from(lines[2]).slice(0, 12).join('') + '…';
    return `<g class="node ${view.owned.has(n.id) ? '' : 'related'} ${['unknown','proposed'].includes(n.status) ? n.status : ''}" data-object="${esc(n.id)}" data-select="${esc(n.id)}"${n.children ? ` data-navigate="${esc(n.id)}"` : ''} role="button" tabindex="0" aria-label="${esc(n.label)}"><title>${esc(n.label)}</title><rect x="${p.x}" y="${p.y}" width="230" height="104" rx="10"/><text class="kind" x="${p.x + 14}" y="${p.y + 20}">${esc((view.owned.has(n.id) ? '' : '关联分组 · ') + (n.status === 'unknown' ? '待核 · ' : n.status === 'proposed' ? '提案 · ' : '') + (n.kind || '要素'))}</text><text x="${p.x + 14}" y="${p.y + 44}">${lines.map((line, i) => `<tspan x="${p.x + 14}" dy="${i ? 21 : 0}">${esc(line)}</tspan>`).join('')}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="领域模型图"><style>${svgStyles}</style><defs><marker id="${prefix}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#5c7387"/></marker></defs>${edges}${nodes}</svg>`;
}

export function domainHighlights(model, selected, traceId) {
  const saved=model.traces?.find(t=>t.id===traceId);
  const traced=new Set(saved ? [...saved.node_ids,...saved.edge_ids] : []);
  const related=new Set(selected ? [selected] : []);
  for (const edge of model.edges) if ([edge.id,edge.from,edge.to].includes(selected)) for (const id of [edge.id,edge.from,edge.to]) related.add(id);
  return {saved,traced,related};
}

// Serialized into the page. It consumes saved IDs only; no domain decisions.
export function domainController(highlights) {
  const data = JSON.parse(document.getElementById('domain-data').textContent);
  const root = document.getElementById('domain-view'), group = document.getElementById('domain-group'), trace = document.getElementById('domain-trace');
  const objects = new Map([...data.model.nodes, ...data.model.edges].map(x => [x.id, x]));
  let selected = null;
  function update() {
    for (const figure of root.querySelectorAll('[data-view]')) figure.hidden = figure.dataset.view !== group.value;
    const {saved,traced:traceIds,related} = highlights(data.model,selected,trace.value);
    for (const element of root.querySelectorAll('[data-object]')) {
      const id = element.dataset.object;
      element.classList.toggle('selected', related.has(id));
      element.classList.toggle('trace', traceIds.has(id));
      element.classList.toggle('dim', Boolean(selected || saved) && !related.has(id) && !traceIds.has(id));
      element.setAttribute('aria-pressed', String(id === selected));
    }
    document.getElementById('trace-description').textContent = saved ? saved.description : '轨迹来自已保存的决策记录；页面不计算新决策。';
  }
  function choose(id) {
    const item = objects.get(id); if (!item) return;
    selected = id;
    const detail = document.getElementById('domain-detail'); detail.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = item.label; detail.append(heading);
    for (const [key, value] of Object.entries(item).filter(([k]) => !['evidence', 'label'].includes(k))) {
      const line = document.createElement('p'); line.textContent = `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`; detail.append(line);
    }
    const evidence = document.createElement('ul');
    for (const id of item.evidence) {
      const li = document.createElement('li'), link = document.createElement('a');
      link.href = data.sources[id].href; link.textContent = data.sources[id].label; li.append(link); evidence.append(li);
    }
    detail.append(evidence); update();
  }
  root.addEventListener('click', e => { const item = e.target.closest('[data-object]'); if (item) choose(item.dataset.object); });
  root.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key) && e.target.closest('g[data-object]')) { e.preventDefault(); choose(e.target.closest('[data-object]').dataset.object); } });
  group.addEventListener('change', () => { selected = null; document.getElementById('domain-detail').textContent = '选择节点或关系查看完整字段和依据。'; update(); });
  function resetSelection() { selected = null; document.getElementById('domain-detail').textContent = '选择节点或关系查看完整字段和依据。'; update(); }
  trace.addEventListener('change', resetSelection);
  document.getElementById('domain-clear').addEventListener('click', () => { trace.value = ''; resetSelection(); });
  document.getElementById('domain-export').addEventListener('click', () => {
    const svg = [...root.querySelectorAll('[data-view]')].find(f => !f.hidden).querySelector('svg');
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], {type: 'image/svg+xml'}));
    link.href = url; link.download = 'model.svg'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  update();
  // Browser form restoration does not dispatch change; refresh after pageshow.
  window.addEventListener('pageshow', () => window.requestAnimationFrame(update));
}

export function renderDomainModel({model, manifest, page, esc, docName, notice}) {
  if (['diagram-domain-model/v2','diagram-domain-model/v3','diagram-domain-model/v4','diagram-domain-model/v5'].includes(model.schema_version)) return renderDomainV2({model, manifest, page, esc, docName, notice}, graphSvg);
  const views = [{id: '', label: '全部分组'}, ...(model.groups || [])];
  const nodeNames = new Map(model.nodes.map(n => [n.id, n.label]));
  const assets = {};
  const figures = views.map((group, i) => {
    const view = selectDomainView(model, group.id);
    const svg = graphSvg(view, 'view-' + i, esc);
    const assetPath = i ? `images/view-${i}.svg` : 'images/model.svg';
    assets[assetPath] = svg;
    const listing = view.nodes.map(node => {
      const outgoing = view.edges.filter(e => e.from === node.id || (e.direction !== 'directed' && e.to === node.id));
      return `<li><button type="button" data-object="${esc(node.id)}">${esc(node.label)}</button>${node.status === 'unknown' ? ' <span>待核</span>' : node.status === 'proposed' ? ' <span>提案</span>' : ''}${view.owned.has(node.id) ? '' : ' <span>关联分组</span>'}<ul>${outgoing.map(e => `<li><button type="button" data-object="${esc(e.id)}">${esc(e.label)} ${e.direction === 'directed' ? '→' : e.direction === 'symmetric' ? '↔' : '—'} ${esc(nodeNames.get(e.from === node.id ? e.to : e.from))}</button></li>`).join('') || '<li>无出向关系</li>'}</ul></li>`;
    }).join('');
    return `<div data-view="${esc(group.id)}"${i ? ' hidden' : ''}><p>${view.nodes.length} 个节点 · ${view.edges.length} 条关系。箭头表示模型关系方向；排列不新增执行顺序。</p><p><a href="${assetPath}" download="model.svg">下载本视图 SVG</a> · <a href="${assetPath}">打开本视图 SVG</a>（完整模型，无选择高亮）</p><div class="domain-viewport">${svg}</div><div class="domain-list"><ul>${listing}</ul></div><details><summary>本视图全部关系与依据</summary><ul>${view.edges.map(e => `<li><button type="button" data-object="${esc(e.id)}">${esc(nodeNames.get(e.from))} ${e.direction === 'directed' ? '→' : e.direction === 'symmetric' ? '↔' : '—'} ${esc(nodeNames.get(e.to))}：${esc(e.label)}</button></li>`).join('') || '<li>无关系；要素仍完整显示。</li>'}</ul></details></div>`;
  }).join('');
  const sources = Object.fromEntries(Object.entries(manifest.sources).map(([id, s]) => [id, {label: s.label, href: 'docs/' + docName(s.path)}]));
  const data = JSON.stringify({model, sources}).replace(/</g, '\\u003c');
  const body = `<h1>${esc(model.title)}</h1>${notice}<style>body{overflow-wrap:anywhere}.domain-controls{display:flex;flex-wrap:wrap;gap:14px;align-items:center}.domain-controls label{display:grid;gap:4px}.domain-controls select{max-width:100%;min-height:36px}button{font:inherit;cursor:pointer;border:1px solid #9daebd;border-radius:5px;background:#fff;color:#174973;padding:5px 10px;max-width:100%;white-space:normal;text-align:left;overflow-wrap:anywhere}button:focus-visible,select:focus-visible{outline:3px solid #116dd8}.domain-viewport{max-width:100%;overflow:auto;background:#f7fafc;border:1px solid #ccd6df;border-radius:8px}.domain-viewport svg{display:block;max-width:none}.domain-list{display:none}.domain-list li{margin:8px 0}.domain-list .selected,.domain-list .trace{background:#ffedcf}.domain-list .dim{opacity:.5}[hidden]{display:none!important}#domain-detail{overflow-wrap:anywhere}#domain-detail p{white-space:pre-wrap}.domain-controls>*{min-width:0}@media(max-width:700px){body{margin:16px auto;padding:0 12px}section,article{padding:14px}.domain-viewport{display:none}.domain-list{display:block}.domain-controls label{width:100%}.domain-list ul{padding-left:18px}}</style><section id="domain-view"><div class="domain-controls"><label>查看范围<select id="domain-group">${views.map(g => `<option value="${esc(g.id)}">${esc(g.label)}</option>`).join('')}</select></label><label>已保存决策轨迹<select id="domain-trace"><option value="">不选轨迹</option>${(model.traces || []).map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</select></label><button id="domain-clear" type="button">清除高亮</button><button id="domain-export" type="button">导出当前 SVG</button></div><p id="trace-description"></p><p>虚线节点：关联分组；虚线关系：项目解释。待核与提案节点带文字标识；详细状态与原因见依据。</p>${figures}</section><section id="domain-detail" aria-live="polite">选择节点或关系查看完整字段和依据。</section><script type="application/json" id="domain-data">${data}</script><script>(${domainController.toString()})(${domainHighlights.toString()});</script>`;
  return {pages: {'index.html': page(model.title, body)}, assets};
}
