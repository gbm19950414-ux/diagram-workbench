import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const read = p => fs.readFileSync(p, 'utf8');
export function safeFile(base, relative, denied=['private']) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(x => x==='..') || denied.some(p => relative===p || relative.startsWith(p+'/') || (!p.includes('/') && relative.split(/[\\/]/).includes(p)))) throw Error(`Unsafe source: ${relative}`);
  const full = path.resolve(base,relative);
  if (!full.startsWith(path.resolve(base)+path.sep)) throw Error(`Outside root: ${relative}`);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw Error(`Missing source: ${relative}`);
  if (fs.realpathSync(full)!==path.resolve(fs.realpathSync(base),relative)) throw Error(`Symlink source: ${relative}`);
  return full;
}
export function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => {
    const p=path.join(dir,e.name);
    if(e.isSymbolicLink()) throw Error(`Symlink input: ${p}`);
    return e.isDirectory() && !['__pycache__','.git','node_modules'].includes(e.name) ? files(p) : e.isFile()?[p]:[];
  }).sort();
}
export function validateRefs(m, dsl, diagrams, base, {denied=['private'], checkTest}={}) {
  const ids = new Set([...dsl.matchAll(/^\s*([A-Za-z][\w]*)\s*=\s*(?:person|softwareSystem|container|component|deploymentNode)\b/gm)].map(x=>x[1]));
  for(const [id,source] of Object.entries(m.sources)) safeFile(base,source.path,denied);
  for(const [id,sources] of Object.entries(m.elements)) {
    if(!ids.has(id)) throw Error(`Unknown model element: ${id}`);
    for(const source of sources) if(!m.sources[source]) throw Error(`Unknown evidence: ${source}`);
  }
  for(const id of ids) if(!m.elements[id]) throw Error(`Missing evidence mapping: ${id}`);
  for(const [id, inv] of Object.entries(m.invariants)) {
    for(const source of inv.sources) if(!m.sources[source]) throw Error(`Unknown invariant evidence: ${source}`);
    for(const test of inv.tests) {
      const source=m.sources[test.source];
      if(!checkTest) throw Error(`No test reference checker configured for ${id}`);
      if(!source || !checkTest({text:read(safeFile(base,source.path,denied)),reference:test})) throw Error(`Missing test symbol for ${id}: ${test.symbol}`);
    }
  }
  for(const [name,text] of Object.entries(diagrams)) {
    if(!text.includes('@startuml') || !text.includes('@enduml')) throw Error(`Incomplete UML: ${name}`);
    for(const match of text.matchAll(/^' @model (.+)$/gm)) for(const id of match[1].trim().split(/\s+/)) if(!ids.has(id)) throw Error(`Unknown UML model ref: ${id}`);
    for(const match of text.matchAll(/^' @invariant (.+)$/gm)) for(const id of match[1].trim().split(/\s+/)) if(!m.invariants[id]) throw Error(`Unknown invariant: ${id}`);
  }
  return ids;
}
export function freshness(current,review) {
  if(!review || !['updated','no-impact'].includes(review.decision) || !review.reviewer || !review.note?.trim()) return {state:'needs-review',changed:Object.keys(current)};
  const changed=[...new Set([...Object.keys(current),...Object.keys(review.snapshot||{})])].filter(k=>current[k]!==review.snapshot?.[k]);
  return {state:changed.length?'needs-review':'reviewed-snapshot',changed};
}
export function verifyOutputs(base,outputs) {
  const actual=files(base).filter(p=>p!==path.join(base,'receipt.json')).map(p=>path.relative(base,p)).sort();
  if(JSON.stringify(actual)!==JSON.stringify(Object.keys(outputs).sort()))throw Error('Output set changed');
  for(const [p,h] of Object.entries(outputs))if(hash(fs.readFileSync(safeFile(base,p)))!==h)throw Error(`Output changed: ${p}`);
}
