// A reading structure is reviewed organization, never a model relation.
const fail = message => { throw Error(`reading-structure: ${message}`); };
const id = (value,label) => { if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value))fail(`Invalid ${label}`); };
const exact = (value,keys,label) => { if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))fail(`Invalid fields in ${label}`); };
const unique = (values,label) => { if(!Array.isArray(values)||new Set(values).size!==values.length)fail(`Invalid ${label}`); for(const value of values)id(value,label); };
const same = (a,b) => a.length===b.length && a.every(value=>b.includes(value));

export function validateReadingStructures(model,manifest){
  const v4=['diagram-domain-model/v4','diagram-domain-model/v5'].includes(model.schema_version);
  if(v4 && model.reading_structures===undefined)return [];
  if(!Array.isArray(model.reading_structures))fail('Missing reading_structures');
  const nodes=new Map(model.nodes.map(node=>[node.id,node])), seenIds=new Set(), seenScopes=new Set();
  for(const item of model.reading_structures){
    const s=v4?{core_ids:[],supports:[],independent_ids:[],reading_order:[],evidence:[],...item}:item;
    if(v4){if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(key=>!['id','scope_id','pattern','core_ids','supports','independent_ids','reading_order','evidence','rationale'].includes(key)))fail('Invalid fields in structure');}
    else exact(s,['id','scope_id','pattern','core_ids','supports','independent_ids','reading_order','evidence','rationale'],'structure');
    id(s.id,'structure ID');id(s.scope_id,'scope ID');
    if(seenIds.has(s.id)||seenScopes.has(s.scope_id))fail(`Duplicate structure or scope: ${s.id}`);
    seenIds.add(s.id);seenScopes.add(s.scope_id);
    const scope=nodes.get(s.scope_id);
    if(!scope||!(v4?['chapter','section','topic','block']:['chapter','topic','block']).includes(scope.kind))fail(`Invalid scope: ${s.scope_id}`);
    if(!['sequence','explanation','comparison','multiple'].includes(s.pattern))fail(`Invalid pattern: ${s.id}`);
    unique(s.core_ids,`core_ids: ${s.id}`);unique(s.independent_ids,`independent_ids: ${s.id}`);unique(s.reading_order,`reading_order: ${s.id}`);
    if(!Array.isArray(s.supports))fail(`Invalid supports: ${s.id}`);
    const supportIds=[];
    for(const support of s.supports){
      exact(support,['node_id','anchor_id','role'],'support');id(support.node_id,'support node');id(support.anchor_id,'support anchor');
      if(!['condition','parameter','reason','example','detail','exception'].includes(support.role)||!s.core_ids.includes(support.anchor_id))fail(`Invalid support role or anchor: ${s.id}`);
      supportIds.push(support.node_id);
    }
    unique(supportIds,`support IDs: ${s.id}`);
    if(s.pattern==='sequence'&&s.core_ids.length<2||s.pattern==='comparison'&&s.core_ids.length<2||s.pattern==='explanation'&&s.core_ids.length<1)fail(`Too few cores: ${s.id}`);
    const members=[...(scope.children||[]),...(scope.related_element_ids||[])].filter(member=>{
      const node=nodes.get(member);
      return node && ((v4?['chapter','section','topic','block']:['topic','block']).includes(node.kind)||node.origin==='source');
    });
    const assigned=[...s.core_ids,...supportIds,...s.independent_ids];
    if(new Set(assigned).size!==assigned.length||(v4?assigned.some(id=>!members.includes(id))||s.reading_order.some(id=>!members.includes(id))||s.reading_order.some(id=>!assigned.includes(id)):!same(assigned,members)||!same(s.reading_order,members)))fail(`Member coverage mismatch: ${s.id}`);
    if(v4){if(s.rationale!==undefined && (typeof s.rationale!=='string'||!s.rationale.trim()))fail(`Invalid rationale: ${s.id}`);}
    else if(typeof s.rationale!=='string'||!s.rationale.trim())fail(`Missing rationale: ${s.id}`);
    unique(s.evidence,`evidence: ${s.id}`);
    if((!v4&&!s.evidence.length)||s.evidence.some(ref=>!Object.hasOwn(manifest.sources,ref)))fail(`Invalid evidence: ${s.id}`);
  }
  return model.reading_structures;
}
