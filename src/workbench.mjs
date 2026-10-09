#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync, spawn} from 'node:child_process';
import http from 'node:http';
import MarkdownIt from 'markdown-it';

import {safeFile, files, validateRefs, freshness, verifyOutputs, hash, read} from './checks.mjs';
import {coverageSummary, verifyRenderedCoverage} from './coverage.mjs';
import {getTarget} from './targets.mjs';
import {validateReadingMap,renderNestedSource} from './nested-source.mjs';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(read(p));
const put = (p, data) => {fs.mkdirSync(path.dirname(p), {recursive:true});fs.writeFileSync(p,data);};
const dump = (p,data) => put(p,JSON.stringify(data,null,2)+'\n');
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function engineFingerprint() {
  const paths=['package.json','README.md',...['src','bin','skills','templates'].flatMap(d=>files(path.join(packageRoot,d)).map(p=>path.relative(packageRoot,p)))].sort();
  return hash(JSON.stringify(paths.map(p=>[p,hash(fs.readFileSync(path.join(packageRoot,p)))])));
}
function destination(root,relative) {
  if(!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw Error(`Unsafe output directory: ${relative}`);
  const full=path.resolve(root,relative);
  if(full===root) throw Error('Output directory cannot be project root');
  let current=root;
  for(const part of path.relative(root,full).split(path.sep)) {
    current=path.join(current,part);
    if(fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error(`Symlink output directory: ${current}`);
  }
  return full;
}
function newTarget(root,relative,label) {
  if(!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw Error(`Unsafe ${label}: ${relative}`);
  const full=path.resolve(root,relative);
  if(full===root || !full.startsWith(root+path.sep)) throw Error(`Unsafe ${label}: ${relative}`);
  let current=root;
  for(const part of path.relative(root,full).split(path.sep)) {
    current=path.join(current,part);
    if(fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error(`Symlink ${label}: ${current}`);
  }
  return full;
}
const dslString=value=>String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
function initializeDomainProject({project,config,title}) {
  if (!project) throw Error('--project is required');
  const root=fs.realpathSync(path.resolve(project)), label=String(title||path.basename(root)).trim();
  if (!label || /[\r\n]/.test(label)) throw Error('--title must be non-empty and single line');
  const base='docs/model';
  const data={schema:1,target:'domain-model',model:`${base}/model.json`,evidence:`${base}/evidence.json`,review:`${base}/review.json`,output:'.diagrams',inputs:[],watch:[],portal:{title:label}};
  const model={schema_version:'diagram-domain-model/v1',title:label,nodes:[{id:'draft',label:'待建立的模型',status:'proposed',reason:'未审阅骨架；需要以项目来源替换。',evidence:['scope']}],edges:[],groups:[],traces:[]};
  const evidence={sources:{scope:{path:`${base}/scope.md`,label:'待核实的建模范围'}},invariants:{}};
  const artifacts=new Map([[config,JSON.stringify(data,null,2)+'\n'],[data.model,JSON.stringify(model,null,2)+'\n'],[data.evidence,JSON.stringify(evidence,null,2)+'\n'],[`${base}/scope.md`,`# ${label}\n\n未审阅骨架；未描述任何实际领域事实。请先明确绘图问题、受众、输入依据与待核项，再替换模型并进行真实语义审阅。\n`]]);
  const destinations=[...artifacts].map(([relative,content])=>[newTarget(root,relative,'initial model path'),content]);
  for (const [file] of destinations) if (fs.existsSync(file)) throw Error(`Cannot initialize: already exists at ${file}`);
  const created=[];
  try {
    for (const [file,content] of destinations) { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,content,{flag:'wx'}); created.push(file); }
  } catch (error) { for (const file of created.reverse()) fs.rmSync(file,{force:true}); throw error; }
  console.log(`Initialized an unreviewed domain-model scaffold at ${root}. Replace draft content with evidence before recording review.`);
  return {root,config:path.join(root,config)};
}
export async function initializeProject({project,config='diagram.config.json',title,target:targetName}={}) {
  const target = getTarget(targetName);
  if (!target.native) return initializeDomainProject({project, config, title});
  if(!project) throw Error('--project is required');
  const root=fs.realpathSync(path.resolve(project));
  const projectTitle=String(title||path.basename(root)).trim();
  if(!projectTitle) throw Error('--title must not be empty');
  if(/[\r\n]/.test(projectTitle)) throw Error('--title must be a single line');
  const targets={
    config:newTarget(root,config,'configuration path'),
    workspace:newTarget(root,'docs/architecture/workspace.dsl','initial model path'),
    evidence:newTarget(root,'docs/architecture/evidence.json','initial model path'),
    uml:newTarget(root,'docs/architecture/uml/model-state.puml','initial model path'),
    scope:newTarget(root,'docs/architecture/model-scope.md','initial model path'),
    toolchain:newTarget(root,'docs/architecture/toolchain.json','initial model path'),
    skill:newTarget(root,'.agents/skills/architecture-model/SKILL.md','initial skill path')
  };
  for(const [name,target] of Object.entries(targets)) if(fs.existsSync(target)) throw Error(`Cannot initialize: ${name} already exists at ${target}`);
  const inputs=['.agents/skills/architecture-model/SKILL.md'];
  if(fs.existsSync(path.join(root,'README.md'))) inputs.unshift('README.md');
  const configData={
    schema:1,
    workspace:'docs/architecture/workspace.dsl',
    uml:'docs/architecture/uml',
    evidence:'docs/architecture/evidence.json',
    toolchain:'docs/architecture/toolchain.json',
    review:'docs/architecture/review.json',
    output:'.architecture',
    deniedPaths:['private'],
    inputs,
    watch:[],
    portal:{title:`${projectTitle} · architecture model`,intro:'This model starts as an unreviewed scaffold. Replace the draft boundary with evidence-backed project facts before accepting it.'}
  };
  const quoted=dslString(projectTitle);
  const artifacts=new Map([
    [targets.config,JSON.stringify(configData,null,2)+'\n'],
    [targets.workspace,`workspace "${quoted}" "Draft current-state architecture model; statements need project evidence." {\n    model {\n        project = softwareSystem "${quoted}" "Draft project boundary; replace with evidence-backed responsibilities." {\n            tags "Draft"\n        }\n    }\n    views {\n        systemContext project "Context" {\n            include *\n            autolayout lr\n        }\n        styles {\n            element "Draft" {\n                background "#fff1cb"\n                color "#553d00"\n                stroke "#a87900"\n            }\n        }\n    }\n}\n`],
    [targets.evidence,JSON.stringify({sources:{scope:{path:'docs/architecture/model-scope.md',label:'Initial modelling scope (draft, not runtime evidence)'}},elements:{project:['scope']},invariants:{}},null,2)+'\n'],
    [targets.uml,`@startuml\n' @model project\ntitle Architecture-model lifecycle — ${projectTitle}\n[*] --> Draft : establish\nDraft --> Reviewed : evidence + semantic review\nReviewed --> NeedsReview : tracked input changes\nNeedsReview --> Reviewed : update + review\n@enduml\n`],
    [targets.scope,`# Architecture model scope\n\nStatus: draft scaffold. This document establishes no claim about ${projectTitle}'s runtime, deployment, data, or ownership.\n\nBefore recording a review, replace the draft boundary and this scope with evidence from the project. Configure \`watch\` in \`diagram.config.json\` for files whose changes can invalidate the model. Keep proposed designs and unknowns explicit.\n`],
    [targets.toolchain,read(path.join(packageRoot,'templates/toolchain.json'))],
    [targets.skill,`---\nname: architecture-model\ndescription: Maintain this repository's evidence-linked C4 and PlantUML architecture model with Diagram Workbench.\n---\n\n# Architecture model\n\nUse the \`diagram-workbench\` skill and this repository's pinned CLI.\n\nModes: **establish** creates an evidence-backed current-state model; **maintain** evaluates a change and updates the sources or records \`no-impact\`; **calibrate** compares the sources with project facts before repairing drift; **view** runs \`check\` before \`preview\`.\n\nThe initial scaffold is unreviewed. Do not use \`review\` until you have replaced its draft boundary with project evidence and configured the watched inputs. Keep facts, proposed designs and unknowns separate.\n`]
  ]);
  const created=[];
  try {
    for(const [target,content] of artifacts) {
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,content,{flag:'wx'});
      created.push(target);
    }
  } catch(error) {
    for(const target of created.reverse()) fs.rmSync(target,{force:true});
    throw error;
  }
  console.log(`Initialized an unreviewed architecture-model scaffold at ${root}. Install or invoke the pinned Diagram Workbench package, then establish the evidence-backed model before review/build/check.`);
  return {root,config:targets.config};
}
export async function createWorkbench({project, config: configPath='diagram.config.json'}) {
  if(!project) throw Error('--project is required');
  const root=fs.realpathSync(path.resolve(project));
  const configFile=safeFile(root,configPath,[]), config=json(configFile);
  if(config.schema!==1) throw Error('Unsupported project configuration schema');
  const target=getTarget(config.target);
  const denied=config.deniedPaths||['private'];
  const local=rel=>safeFile(root,rel,denied);
  if (!config[target.modelKey]) throw Error(`${target.id} requires ${target.modelKey}`);
  if(config.presentation !== undefined && config.presentation !== 'nested-source') throw Error('Unsupported presentation');
  if(config.presentation === 'nested-source' && (target.id !== 'domain-model' || !config.readingMap)) throw Error('nested-source requires domain-model and readingMap');
  if(config.readingMap && config.presentation !== 'nested-source') throw Error('readingMap requires nested-source presentation');
  // Software owns a workspace directory; a domain target declares one JSON file.
  const model=target.native ? path.dirname(local(config[target.modelKey])) : local(config[target.modelKey]);
  const area=destination(root,config.output||'.architecture');
  if(model===area || model.startsWith(area+path.sep) || area.startsWith(model+path.sep)) throw Error('Model and output directories must be separate');
  destination(root,config.review);
  if (target.native) destination(root,config.uml);
  if (config.coverage) local(config.coverage);
  if (config.coverage && config.portal?.supplementDiagrams?.length) throw Error('coverage mode cannot use portal.supplementDiagrams');
  const adapter=config.adapter ? await import(pathToFileURL(local(config.adapter))) : {};
  const port=config.preview?.port||8765, nativePort=config.preview?.nativePort||8766;
  if(![port,nativePort].every(p=>Number.isInteger(p)&&p>0&&p<65536)||port===nativePort) throw Error('Invalid preview ports');
  const page=(title,body,depth=0)=>renderPage(title,body,depth,config.portal?.navigation||[{href:'index.html',label:'结构与行为'},{href:'evidence.html',label:'来源与审查状态'},...(target.native ? [{href:'structurizr/index.html',label:'完整结构视图'}] : [])]);
function gitInfo(...args) {
  const p=spawnSync('git',args,{cwd:root,encoding:'utf8'});return p.status===0?p.stdout.trim():null;
}
function run(cmd,args,options={}) {
  const {includeStderr,...spawnOptions}=options;
  const p=spawnSync(cmd,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,...spawnOptions});
  if(p.error || p.status!==0) throw Error(`${path.basename(cmd)} failed (${p.status}): ${p.error||''}\n${p.stdout||''}\n${p.stderr||''}`);
  return p.stdout+(includeStderr?p.stderr:'');
}
function lock(){return json(local(config.toolchain));}
function java(){return path.join(area,'cache/java',lock().java.home,'bin/java');}
function native(args){return run(java(),['-Djava.awt.headless=true','-jar',path.join(area,'cache/structurizr.war'),...args]);}
function manifest(){return json(local(config.evidence));}
function inputs() {
  const originalManifest=manifest();
  const diagramPaths=target.native ? files(destination(root,config.uml)) : [];
  const diagrams={};
  for(const p of diagramPaths.filter(p=>p.endsWith('.puml'))) {
    const name=path.basename(p);
    if(diagrams[name]) throw Error(`Duplicate diagram basename: ${name}`);
    diagrams[name]=read(local(path.relative(root,p)));
  }
  const dsl=target.native ? read(local(config.workspace)) : null;
  const domainModel=target.native ? null : json(local(config.model));
  const validated=target.validateTargetModel({manifest:originalManifest,model:domainModel,dsl,diagrams,root,options:{denied,checkTest:adapter.checkTest},coverage:config.coverage ? json(local(config.coverage)) : null});
  const readingMap=config.presentation==='nested-source' ? validateReadingMap(json(local(config.readingMap)),domainModel,originalManifest,hash(fs.readFileSync(local(config.model)))) : null;
  if(readingMap && !['diagram-domain-model/v2','diagram-domain-model/v3','diagram-domain-model/v4','diagram-domain-model/v5'].includes(domainModel.schema_version)) throw Error('nested-source requires diagram-domain-model/v2, v3, v4 or v5');
  const {manifest:m,coverage}=validated;
  const selected=new Set([configPath, config[target.modelKey],config.evidence,...(target.native ? [config.toolchain] : []),...(config.inputs||[]),...(config.readingMap?[config.readingMap]:[])]);
  if (config.coverage) selected.add(config.coverage);
  if(config.adapter)selected.add(config.adapter);
  for(const source of Object.values(m.sources))selected.add(source.path);
  for(const p of diagramPaths)selected.add(path.relative(root,p));
  for(const watch of config.watch||[]) {
    const dir=destination(root,watch.directory);
    for(const p of files(dir)) if(!watch.extensions || watch.extensions.includes(path.extname(p)))selected.add(path.relative(root,p));
  }
  for(const entry of fs.readdirSync(root,{withFileTypes:true})) {
    if(entry.isFile() && (config.rootExtensions||[]).includes(path.extname(entry.name)))selected.add(entry.name);
  }
  const snapshots={};
  for(const rel of [...selected].sort())snapshots[rel]=hash(fs.readFileSync(local(rel)));
  snapshots.$engine=engineFingerprint();
  return {m,diagrams,dsl,model:domainModel,readingMap,coverage,snapshots};
}
function status(snapshot){return freshness(snapshot,fs.existsSync(path.join(root,config.review))?json(path.join(root,config.review)):null);}
function outputStatus(snapshot,coverage) {
  const receiptPath=path.join(area,'site/receipt.json');
  if(!fs.existsSync(receiptPath)) return {state:'not-built'};
  try {
    const receipt=json(receiptPath);
    if(receipt.target && receipt.target!==target.id) return {state:'invalid-output',reason:'Drawing target changed'};
    if(JSON.stringify(receipt.inputs)!==JSON.stringify(snapshot)) return {state:'stale-inputs'};
    verifyOutputs(path.join(area,'site'),receipt.outputs);
    if(JSON.stringify(receipt.coverage||null)!==JSON.stringify(coverageSummary(coverage))) return {state:'invalid-output',reason:'Coverage receipt changed'};
    return {state:'verified',builtAt:receipt.builtAt,engineVersion:receipt.engineVersion,...(coverage ? {coverage:coverageSummary(coverage)} : {})};
  } catch(error) { return {state:'invalid-output',reason:error.message}; }
}
function reportStatus() {
  const x=inputs(),model=status(x.snapshots);
  const report={schema:1,project:root,model:{state:model.state,changed:model.changed},output:outputStatus(x.snapshots,x.coverage)};
  if (x.coverage) report.coverage=coverageSummary(x.coverage);
  console.log(JSON.stringify(report,null,2));
  return report;
}
function verifyTools() {
  for(const name of ['structurizr','plantuml']) {
    const spec=lock()[name],p=path.join(area,'cache',spec.file);
    if(!fs.existsSync(p)||hash(fs.readFileSync(p))!==spec.sha256) throw Error(`Tool missing/hash mismatch: ${name}; run setup`);
  }
  if(!fs.existsSync(java())) throw Error('Isolated Java missing; run setup');
  return {pinned:lock(),javaVersion:run(java(),['--version']),graphvizVersion:run('dot',['-V'],{includeStderr:true})};
}
async function setup() {
  if (!target.native) { inputs(); console.log('domain-model uses the packaged SVG renderer; no native setup required.'); return; }
  if(process.platform!=='darwin'||process.arch!=='arm64') throw Error('Pinned bootstrap targets macOS arm64; supply reviewed platform lock before porting.');
  fs.mkdirSync(path.join(area,'cache'),{recursive:true});
  for(const name of ['java','structurizr','plantuml']) {
    const item=lock()[name],target=path.join(area,'cache',item.file);
    if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==item.sha256) {
      const temp=target+'.download';
      run('curl',['--fail','--location','--proto','=https','--tlsv1.2','--output',temp,item.url]);
      if(hash(fs.readFileSync(temp))!==item.sha256) {fs.rmSync(temp);throw Error(`Download checksum failed: ${name}`);}
      fs.renameSync(temp,target);
    }
  }
  if(!fs.existsSync(java())) {
    const temp=path.join(area,'cache/java.extract');fs.mkdirSync(temp,{recursive:true});
    run('tar',['-xzf',path.join(area,'cache',lock().java.file),'-C',temp]);
    fs.renameSync(temp,path.join(area,'cache/java'));
  }
  verifyTools();console.log('Pinned toolchain ready; subsequent build/check are offline.');
}
function renderPage(title,body,depth=0,navigation=[]){const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>body{font:16px/1.7 system-ui,sans-serif;color:#19314a;max-width:1160px;margin:40px auto;padding:0 24px;background:#f5f7fa}a{color:#175dab}section,article{background:white;border:1px solid #d9e1ea;border-radius:10px;padding:24px;margin:20px 0}h1,h2,h3{line-height:1.3}img,object{max-width:100%}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #bfcddd;padding:8px}pre{overflow:auto;background:#edf2f7;padding:16px}code{overflow-wrap:anywhere}.status{padding:16px;background:#fff1cb}.coverage-status{border-left:5px solid #175dab}.perspective{border-left:5px solid #2e75b6}.perspective.unknown{border-left-color:#ba7a00;background:#fff9e7}.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#e6f0fa;font-size:.85em}.unknown .badge{background:#fff1cb}details{margin:12px 0}summary{cursor:pointer}nav{display:flex;gap:20px;flex-wrap:wrap}</style><nav>${navigation.map(n=>`<a href="/${esc(n.href)}">${esc(n.label)}</a>`).join('')}</nav>${body}</html>`;return html.replace(/href="\/(?!\/)/g,`href="${"../".repeat(depth)}`);}
function docName(p){return hash(p).slice(0,16)+'.html';}
async function build() {
  fs.mkdirSync(area,{recursive:true});
  const x=inputs(),tools=target.native ? verifyTools() : {renderer:'builtin-svg/v1',nodeVersion:process.version},review=status(x.snapshots);
  const tmp=fs.mkdtempSync(path.join(area,'build-'));
  try {
    const site=path.join(tmp,'site'),runtime=path.join(tmp,'runtime');
    fs.mkdirSync(site,{recursive:true});fs.mkdirSync(path.join(runtime,'images'),{recursive:true});
    // Evidence snapshots use declared inputs; the consumer owns their publication scope.
    const docs=new Map(Object.values(x.m.sources).filter(s=>s.path.endsWith('.md')).map(s=>[s.path,s]));
    let n=0;
    for(const [rel,s] of docs) {
      const source=read(local(rel));
      const md=new MarkdownIt({html:false,linkify:false});
      const normal=md.renderer.rules.link_open||((tokens,i,o,e,self)=>self.renderToken(tokens,i,o));
      md.renderer.rules.link_open=(tokens,i,o,e,self)=>{
        const href=tokens[i].attrGet('href');
        if(href&&!/^(?:https?:|mailto:|#)/.test(href)) {
          const [p,anchor]=href.split('#'); const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(rel),p));
          tokens[i].attrSet('href',docs.has(resolved)?'/docs/'+docName(resolved)+(anchor?'#'+anchor:''):'/evidence.html');
          if(!docs.has(resolved))tokens[i].attrSet('title','源仓库引用；未包含在本地公开文档快照中');
        }
        return normal(tokens,i,o,e,self);
      };
      // Preserve stable anchors for linked headings; duplicate headings receive suffixes.
      const seen=new Map();
      md.renderer.rules.heading_open=(tokens,i,o,e,self)=>{
        const text=tokens[i+1].content;let id=text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-');
        const count=seen.get(id)||0;seen.set(id,count+1);if(count)id+='-'+count;
        tokens[i].attrSet('id',id);return self.renderToken(tokens,i,o);
      };
      put(path.join(site,'docs',docName(rel)),page(s.label,`<h1>${esc(s.label)}</h1><p>源：${esc(rel)} · 本次代码工作区快照</p><article>${md.render(source)}</article>`,1));
      const target=rel.startsWith('docs/decisions/')?'decisions':'pages';
      const nativeSource=source.replace(/(\[[^\]]+\]\()([^\s)]+)(\))/g,(all,start,href,end)=>{
        if(/^(?:https?:|mailto:)/.test(href))return all;
        const [p,anchor]=href.split('#');const resolved=p?path.posix.normalize(path.posix.join(path.posix.dirname(rel),p)):rel;
        return start+`http://127.0.0.1:${port}/`+(docs.has(resolved)?'docs/'+docName(resolved)+(anchor?'#'+anchor:''):'evidence.html')+end;
      });
      const nativeText=target==='decisions'?`# ${s.label}\n\nDate: ${path.basename(rel).slice(0,10)}\n\n## Status\n\nSource-defined (see original scope below)\n\n## Source snapshot\n\n${nativeSource}`:nativeSource;
      put(path.join(runtime,target,`${String(++n).padStart(4,'0')}-${path.basename(rel)}`),nativeText);
    }
    const objects=v=>`<pre>${esc(JSON.stringify(v,null,2))}</pre>`;
    const sourceLink = id => {
      const s=x.m.sources[id];return s?`<a href="${s.path.endsWith('.md')?'docs/'+docName(s.path):target.native ? 'evidence.html#source-'+id : 'docs/'+docName(s.path)}">${esc(s.label)}</a>`:esc(id);
    };
    const coverage=coverageSummary(x.coverage);
    const notice=`<p class="status${coverage?' coverage-status':''}">模型状态：<strong>${esc(review.state)}</strong>。这是声明输入的审阅快照；绘图检查不证明模型含义正确或建议适用。${coverage?` 覆盖状态：<strong>${esc(coverage.state)}</strong>（已建模 ${coverage.counts.modelled}；显式未知/不适用 ${coverage.counts.unknown+coverage.counts['not-applicable']}）。`:''}${review.changed.length?`有 ${review.changed.length} 个输入待复审。`:''}</p>`;
    if (!target.native) for (const source of Object.values(x.m.sources).filter(s => !s.path.endsWith('.md'))) {
      put(path.join(site,'docs',docName(source.path)),page(source.label,`<h1>${esc(source.label)}</h1><p>源：${esc(source.path)} · 声明输入快照</p><pre>${esc(read(local(source.path)))}</pre>`,1));
    }
    const renderSoftware=()=>{
    const renderedSvgs={};
    for(const [name,text] of Object.entries(x.diagrams)) {
      const file=path.join(tmp,name);put(file,text);
      run(java(),['-Djava.awt.headless=true','-jar',path.join(area,'cache/plantuml.jar'),'-failfast2','-tsvg','-charset','UTF-8','-o',path.join(runtime,'images'),file]);
      const svg=read(path.join(runtime,'images',name.replace('.puml','.svg')));
      if(!svg.includes('<svg') || svg.includes('Syntax Error?'))throw Error(`Invalid SVG: ${name}`);
      renderedSvgs[name]=svg;
    }
    verifyRenderedCoverage(x.coverage,x.diagrams,renderedSvgs);
    put(path.join(runtime,'workspace.dsl'),x.dsl);
    native(['validate','-workspace',path.join(runtime,'workspace.dsl')]);
    native(['export','-workspace',path.join(runtime,'workspace.dsl'),'-format','json','-output',runtime]);
    native(['export','-workspace',path.join(runtime,'workspace.dsl'),'-format','static','-output',path.join(site,'structurizr')]);
    fs.cpSync(path.join(runtime,'images'),path.join(site,'images'),{recursive:true});
    const graphCards=Object.keys(x.diagrams).filter(n=>!(config.portal?.supplementDiagrams||[]).includes(n)).map(n=>`<section><h2>${esc(x.diagrams[n].match(/^title (.+)$/m)?.[1]||n)}</h2><a href="images/${n.replace('.puml','.svg')}">打开原尺寸 SVG</a><br><img alt="${esc(n)}" src="images/${n.replace('.puml','.svg')}"></section>`).join('');
    const links=[...docs].map(([p,s])=>`<li><a href="docs/${docName(p)}">${esc(s.label)}</a></li>`).join('');
    const perspectiveCard=perspective=>{
      const evidence=perspective.evidence.map(ref=>sourceLink(ref.id)).join(' · ');
      const artifact=perspective.status==='modelled' ? (perspective.artifact.type==='structurizr'
        ? `<p><a href="structurizr/index.html">打开可缩放 C4 视图：${esc(perspective.artifact.viewKey)}</a></p>`
        : perspective.presentation==='embed'
          ? `<p><a href="images/${esc(perspective.artifact.file.replace('.puml','.svg'))}">打开原尺寸 SVG</a></p><img alt="${esc(perspective.artifact.file)}" src="images/${esc(perspective.artifact.file.replace('.puml','.svg'))}">`
          : `<p><a href="images/${esc(perspective.artifact.file.replace('.puml','.svg'))}">打开模型 SVG：${esc(perspective.artifact.file)}</a></p>`)
        : `<p><strong>显式未知：</strong>${esc(perspective.reason)}</p><p><strong>重新检查条件：</strong>${esc(perspective.revisitWhen)}</p>`;
      return `<article class="perspective${perspective.status==='modelled'?'':' unknown'}" data-perspective-id="${esc(perspective.id)}"><h3>${esc(perspective.question)}</h3><p><span class="badge">${esc(perspective.kind)} · ${esc(perspective.status)}</span></p>${artifact}<details><summary>证据与技术定位</summary><p>${evidence}</p></details></article>`;
    };
    const semanticPortal=()=>{
      const p=x.coverage.perspectives;
      const cards=pick=>p.filter(pick).map(perspectiveCard).join('');
      const section=(id,title,intro,pick)=>`<section id="${id}"><h2>${title}</h2><p>${intro}</p>${cards(pick)}</section>`;
      return `<h1>${esc(config.portal?.title||'结构、行为与证据')}</h1>${notice}<section id="purpose"><h2>1. 目的、受众、审查状态、覆盖状态</h2><p>${esc(config.portal?.intro||'这是面向项目作者和维护者的、由证据约束的当前态模型。')}</p><p>受众：${x.coverage.audiences.map(esc).join('、')}。覆盖合同：${esc(coverage.profile)}，状态：<strong>${esc(coverage.state)}</strong>。</p></section>${section('boundaries','2. 责任与仓库边界','先确定谁负责什么，以及事实从何处进入模型。',p=>p.section==='boundaries')}${section('domain','3. 核心领域对象及关系','再阅读当前有效的对象、身份和派生视图。',p=>p.section==='domain')}${section('behavior','4. 端到端行为','随后阅读从请求、设计到执行和人工交接的行为。',p=>p.section==='behavior'&&p.kind!=='state-lifecycle')}${section('lifecycle','5. 生命周期、失败与恢复','状态与恢复边界单独呈现，避免把 fail-closed 规则隐藏在主流程中。',p=>p.section==='behavior'&&p.kind==='state-lifecycle')}${section('assurance','6. 跨仓库谱系、证据与显式未知','最后检查追溯关系、证据入口，以及尚未建模为事实的边界。',p=>p.section==='assurance')}`;
    };
    put(path.join(site,'index.html'),page(config.portal?.title||'结构、行为与证据',x.coverage?semanticPortal():`<h1>${esc(config.portal?.title||'结构、行为与证据')}</h1>${notice}<section><h2>从问题进入模型</h2><p>${esc(config.portal?.intro||'责任和依赖 → C4；失败与恢复 → 状态图；调用与时序 → 时序图；领域关系 → 类图。')}</p><p><a href="structurizr/index.html">打开可缩放的 C4 结构视图</a> · 本机完整文档视图在 preview 命令给出的 Structurizr 地址。</p><ul>${links}</ul></section>${graphCards}`));
    return {pages:{},assets:{}};
    };
    const rendered=x.readingMap ? await renderNestedSource({model:x.model,manifest:x.m,readingMap:x.readingMap,page,esc,docName,notice}) : await target.renderTarget({model:x.model,manifest:x.m,page,esc,docName,notice,renderSoftware});
    for (const [relative,content] of Object.entries({...rendered.pages,...rendered.assets})) {
      const output=destination(site,relative);
      if (fs.existsSync(output) || relative==='evidence.html' || relative==='receipt.json') throw Error(`Target output collision: ${relative}`);
      put(output,content);
    }
    if(adapter.renderPages) {
      const resources=Object.fromEntries(Object.keys(x.snapshots).filter(p=>p!=='$engine').map(p=>[p,read(local(p))]));
      const pages=adapter.renderPages({resources,diagrams:x.diagrams,docs:[...docs.keys()],docName,esc,page});
      for(const [relative,body] of Object.entries(pages)) {
        if(!relative.endsWith('.html')||typeof body!=='string')throw Error('Adapter must return HTML page strings');
        const target=destination(site,relative);
        if(fs.existsSync(target)||['evidence.html'].includes(relative))throw Error(`Adapter page collision: ${relative}`);
        put(target,body);
      }
    }
    const elementRows=Object.entries(x.m.elements).map(([id,sources])=>`<tr><td>${esc(id)}</td><td>${sources.map(sourceLink).join(' · ')}</td></tr>`).join('');
    const invariantCards=Object.entries(x.m.invariants).map(([id,inv])=>`<article><h3>${esc(id)}</h3><p>${esc(inv.text)}</p><p>${inv.sources.map(sourceLink).join(' · ')}</p><ul>${inv.tests.map(test=>`<li>${esc(x.m.sources[test.source].path)} :: ${esc(test.symbol)}</li>`).join('')}</ul></article>`).join('');
    const sources=Object.entries(x.m.sources).map(([id,s])=>`<li id="source-${id}">${sourceLink(id)} — <code>${esc(s.path)}</code></li>`).join('');
    put(path.join(site,'evidence.html'),page('证据与新鲜度',`<h1>证据与新鲜度</h1>${notice}<p>reviewed-snapshot 仅表示对列出的输入做过显式审查。build 不会创建或刷新审查记录。阅读旧静态产物前仍须运行 check；静态页面不会自行发现后续源码改动。测试符号存在不等于测试通过。</p><section><h2>模型元素与来源</h2><table><tr><th>稳定 ID</th><th>来源</th></tr>${elementRows}</table></section><section><h2>关键合同与验证位置</h2>${invariantCards}</section><section><h2>来源清单</h2><ul>${sources}</ul></section><details><summary>本次源码指纹</summary>${objects(x.snapshots)}</details>`));
    const receipt={schema:x.coverage?3:2,target:target.id,engineVersion:json(path.join(packageRoot,'package.json')).version,builtAt:new Date().toISOString(),head:gitInfo('rev-parse','HEAD'),workingTree:gitInfo('status','--short'),review,...(x.coverage?{coverage}:{}),inputs:x.snapshots,tools,outputs:{}};
    for(const p of files(site))receipt.outputs[path.relative(site,p)]=hash(fs.readFileSync(p));
    dump(path.join(site,'receipt.json'),receipt);
    // Refuse a mixed snapshot if source changed during generation.
    if(JSON.stringify(inputs().snapshots)!==JSON.stringify(x.snapshots))throw Error('Inputs changed during build; previous site retained.');
    // Replace site and native workspace together; restore both on any rename failure.
    const backups=[];const installed=[];
    try {
      for(const name of ['site','runtime']) {
        const target=destination(area,name),previous=destination(area,'previous-'+name);
        fs.rmSync(previous,{recursive:true,force:true});
        if(fs.existsSync(target)){fs.renameSync(target,previous);backups.push([previous,target]);}
        fs.renameSync(path.join(tmp,name),target);installed.push(target);
      }
    } catch(error) {
      for(const p of installed)fs.rmSync(p,{recursive:true,force:true});
      for(const [previous,target] of backups.reverse())fs.renameSync(previous,target);
      throw error;
    }
    console.log(`Built ${path.join(area,'site')} (${review.state}); build does not approve the model.`);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
}
function check(){
  const x=inputs(),s=status(x.snapshots);
  if(s.state==='needs-review')throw Error(`needs-review:\n${s.changed.join('\n')}`);
  const receipt=json(path.join(area,'site/receipt.json'));
  if(receipt.target && receipt.target!==target.id) throw Error('Drawing target receipt changed');
  if(JSON.stringify(receipt.inputs)!==JSON.stringify(x.snapshots))throw Error('Generated snapshot stale; rebuild after review.');
  if(receipt.review.state!=='reviewed-snapshot')throw Error('Site predates review; rebuild.');
  if(JSON.stringify(receipt.coverage||null)!==JSON.stringify(coverageSummary(x.coverage)))throw Error('Coverage receipt stale; rebuild after review.');
  verifyOutputs(path.join(area,'site'),receipt.outputs);
  console.log('PASS: reviewed input snapshot, references, test symbols, output hashes. No runtime qualification implied.');
}
function review(args){
  const flag=n=>{const i=args.indexOf('--'+n);return i>=0?args[i+1]:null;};
  const reviewer=flag('reviewer'),decision=flag('decision'),note=flag('note');
  if(!reviewer||!['updated','no-impact'].includes(decision)||!note||note.length<20)throw Error('Explicit semantic review required: --reviewer NAME --decision updated|no-impact --note "scope, evidence, and conclusion (20+ characters)"');
  const x=inputs();dump(path.join(root,config.review),{schema:x.coverage?2:1,reviewer,decision,note,reviewedAt:new Date().toISOString(),head:gitInfo('rev-parse','HEAD'),...(x.coverage?{coverage:coverageSummary(x.coverage)}:{}),snapshot:x.snapshots});
  console.log('Review recorded; build/check still required. This records your assertion, not automatic semantic proof.');
}
function preview(){
  const site=path.join(area,'site');if(!fs.existsSync(site))throw Error('Build first');
  const s=status(inputs().snapshots);console.log('Current source status:',s.state);
  const server=http.createServer((req,res)=>{
    try {const rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\//,'')||'index.html';const p=safeFile(site,rel);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end('Not found');}
  });
  server.listen(port,'127.0.0.1',()=>console.log(`Reading portal: http://127.0.0.1:${port}`));
  server.on('error',e=>{console.error(e.message);process.exitCode=1;stop();});
  const child=target.native ? spawn(java(),['-Dserver.address=127.0.0.1',`-Dserver.port=${nativePort}`,'-Dstructurizr.readonly=true','-Dstructurizr.editable=false','-Dstructurizr.autosaveinterval=0','-Dstructurizr.autorefreshinterval=2000','-jar',path.join(area,'cache/structurizr.war'),'local',path.join(area,'runtime')],{cwd:root,stdio:['ignore','pipe','pipe']}) : null;
  if (child) {
  child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));
  console.log(`Structurizr local (once started): http://127.0.0.1:${nativePort}`);
  child.on('exit',()=>server.close());child.on('error',e=>{console.error(e);stop();});
  }
  function stop(){server.close();if(child && !child.killed)child.kill('SIGTERM');}
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
}
async function main(args) {
  const [command,...rest]=args;
  if(command==='setup')return setup();else if(command==='status')return reportStatus();else if(command==='build')return await build();else if(command==='check')return check();else if(command==='review')return review(rest);else if(command==='preview')return preview();else throw Error('Use setup|status|build|check|review|preview');
}
return {main, root};
}
