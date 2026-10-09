// The v5 wire is validated independently of the earlier high-level roll-up rule.
// In particular, a reviewed native or inferred container relation needs no leaf edge.
const fail = message => { throw Error(`domain-model/v5: ${message}`); };
const nonempty = (value,label) => { if(typeof value!=='string'||!value.trim())fail(`Missing ${label}`); };
const unique = (value,label) => { if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length)fail(`Invalid ${label}`); };
const hex = value => typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const types = new Map([['plan_process','方案/过程'],['concept_principle','概念/原理'],['parameter_constraint','参数/约束'],['argument_explanation','论证/解释'],['comparison','比较'],['example','案例']]);
const containers = new Set(['chapter','section','topic','block']);
const elementKinds = new Set(['assertion','action','condition','exception','reason','parameter','example','unresolved']);
const same = (a,b) => a.length===b.length&&a.every(value=>b.includes(value));

export function validateDomainV5(model,manifest){
  const registry=model.content_types;
  if(!registry||registry.schema_version!=='semantic-content-types/v1'||!hex(registry.sha256)||!Array.isArray(registry.entries))fail('Invalid content type registry');
  const entries=new Map();
  for(const entry of registry.entries){
    if(!entry||!types.has(entry.id)||entry.label!==types.get(entry.id)||entries.has(entry.id))fail(`Invalid content type entry: ${entry?.id}`);
    entries.set(entry.id,entry);
  }
  if(entries.size!==types.size)fail('Incomplete content type registry');
  const nodes=new Map(model.nodes.map(node=>[node.id,node])),edges=new Map(model.edges.map(edge=>[edge.id,edge]));
  const reference=(ref,label)=>{
    if(!ref||typeof ref!=='object'||Array.isArray(ref)||!ref.object_id||!hex(ref.content_revision)||typeof ref.field_path!=='string'||!/^\/(?:[^~]|~[01])*$/.test(ref.field_path))fail(`Invalid source reference: ${label}`);
    if(ref.source!==undefined&&!Object.hasOwn(manifest.sources,ref.source))fail(`Unknown source reference evidence: ${label}`);
  };
  const references=(refs,label)=>{unique(refs,label);for(const ref of refs)reference(ref,label);};
  for(const node of model.nodes){
    if(!containers.has(node.kind)&&!elementKinds.has(node.kind))fail(`Invalid element kind: ${node.id}`);
    if(node.kind!=='block')continue;
    unique(node.content_types,`content_types: ${node.id}`);
    for(const type of node.content_types)if(!entries.has(type))fail(`Unknown content type: ${node.id}/${type}`);
    if(!Array.isArray(node.focus_refs)||!node.focus_refs.length)fail(`Missing focus_refs: ${node.id}`);
    for(const ref of node.focus_refs)reference(ref,`focus_refs: ${node.id}`);
    if(node.focus_rationale!==undefined)nonempty(node.focus_rationale,`focus_rationale: ${node.id}`);
  }
  const members=(edge,side)=>{
    const endpoint=edge[side],node=nodes.get(endpoint),declared=edge[`${side}_element_ids`];
    if(containers.has(node.kind)){unique(declared,`${side}_element_ids: ${edge.id}`);return declared;}
    if(declared!==undefined&&(!Array.isArray(declared)||declared.length!==1||declared[0]!==endpoint))fail(`Invalid ${side}_element_ids: ${edge.id}`);
    return [endpoint];
  };
  const qualifiers=(items,label)=>{
    if(items===undefined)return;
    if(!Array.isArray(items))fail(`Invalid qualifiers: ${label}`);
    for(const item of items){
      if(!item||!['from','to','relation'].includes(item.applies_to)||!['condition','time','modality','scope'].includes(item.dimension))fail(`Invalid qualifier: ${label}`);
      reference(item.source_ref,`qualifier: ${label}`);
    }
  };
  const atomic=[];
  for(const edge of model.edges){
    const form=edge.relation_form;
    if(!['source_atomic','source_native','source_rollup','project_inference'].includes(form))fail(`Invalid relation_form: ${edge.id}`);
    qualifiers(edge.qualifiers,edge.id);
    if(form==='source_atomic'){
      if(containers.has(nodes.get(edge.from).kind)||containers.has(nodes.get(edge.to).kind)||edge.supporting_edge_ids?.length||edge.origin==='interpretation'&&edge.basis!=='project_interpretation')fail(`Invalid source_atomic: ${edge.id}`);
      atomic.push(edge);continue;
    }
    const from=members(edge,'from'),to=members(edge,'to');
    if(!containers.has(nodes.get(edge.from).kind)&&!containers.has(nodes.get(edge.to).kind))fail(`Organization relation requires a container: ${edge.id}`);
    if(form==='source_native'){
      if(edge.origin!=='source'||!['explicit','inferred_from_source'].includes(edge.basis)||edge.supporting_edge_ids?.length)fail(`Invalid source_native identity: ${edge.id}`);
      references(edge.premises,`premises: ${edge.id}`);nonempty(edge.scope_note,`scope_note: ${edge.id}`);
      continue;
    }
    if(form==='project_inference'){
      if(edge.origin!=='interpretation'||edge.basis!=='project_interpretation'||edge.supporting_edge_ids?.length)fail(`Invalid project_inference identity: ${edge.id}`);
      references(edge.premises,`premises: ${edge.id}`);
      for(const field of ['overall_effect','rationale','scope_note'])nonempty(edge[field],`${field}: ${edge.id}`);
      continue;
    }
    if(edge.origin!=='source'||edge.basis!=='source_rollup')fail(`Invalid source_rollup identity: ${edge.id}`);
    unique(edge.supporting_edge_ids,`supporting_edge_ids: ${edge.id}`);
    const expected=[];
    for(const ref of edge.supporting_edge_ids){
      const source=edges.get(ref);
      if(!source||source.relation_form!=='source_atomic'||source.type!==edge.type||source.direction!==edge.direction||source.origin!=='source')fail(`Roll-up source mismatch: ${edge.id}/${ref}`);
      let pair={edge_id:ref,from:source.from,to:source.to};
      if(!from.includes(pair.from)||!to.includes(pair.to)){
        if(edge.direction!=='symmetric'||!from.includes(pair.to)||!to.includes(pair.from))fail(`Roll-up endpoint mismatch: ${edge.id}/${ref}`);
        pair={edge_id:ref,from:source.to,to:source.from};
      }
      expected.push(pair);
    }
    for(const qualifier of edge.qualifiers||[])if(expected.some(pair=>!(edges.get(pair.edge_id).qualifiers||[]).some(value=>JSON.stringify(value)===JSON.stringify(qualifier))))fail(`Roll-up qualifier not shared by every constituent: ${edge.id}`);
    if(!Array.isArray(edge.endpoint_pairs)||edge.endpoint_pairs.length!==expected.length||!edge.endpoint_pairs.every(pair=>{
      const item=expected.find(value=>value.edge_id===pair.edge_id),source=edges.get(pair.edge_id);
      return item&&item.from===pair.from&&item.to===pair.to&&['type','direction','origin','basis','qualifiers'].every(field=>pair[field]===undefined||JSON.stringify(pair[field])===JSON.stringify(source[field]));
    }))fail(`Invalid endpoint_pairs: ${edge.id}`);
    if(!same(from,[...new Set(expected.map(pair=>pair.from))])||!same(to,[...new Set(expected.map(pair=>pair.to))]))fail(`Roll-up member union mismatch: ${edge.id}`);
    if(edge.premises!==undefined){if(!Array.isArray(edge.premises))fail(`Invalid premises: ${edge.id}`);for(const ref of edge.premises)reference(ref,`premises: ${edge.id}`);}
  }
  for(const edge of model.edges.filter(value=>value.relation_form==='source_native')){
    const from=members(edge,'from'),to=members(edge,'to');
    if(from.length!==1||to.length!==1)continue;
    if(atomic.some(source=>source.origin==='source'&&source.type===edge.type&&source.direction===edge.direction&&((source.from===from[0]&&source.to===to[0])||(edge.direction==='symmetric'&&source.from===to[0]&&source.to===from[0]))))fail(`Native relation duplicates atomic edge: ${edge.id}`);
  }
}
