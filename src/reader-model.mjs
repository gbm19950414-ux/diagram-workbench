import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const digest = data => crypto.createHash('sha256').update(data).digest('hex');
export const bundleIdentity = b => digest(JSON.stringify([b.schema,b.library_id,b.files,b.models,b.runtime||null,b.producer||null]));
export const MAX_MODEL_BYTES = 128 * 1024 * 1024;
const fail = message => { throw new Error(message); };
export function relativeFile(name) {
  if (typeof name !== 'string' || !name || name.length > 1000 || /[\\\x00-\x1f]/.test(name) || path.posix.isAbsolute(name) || name.split('/').some(x => !x || ['.', '..'].includes(x))) fail('模型包包含不安全的文件路径');
  return name;
}
export function fileList(root) {
  return fs.readdirSync(root, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    const file=path.join(root,entry.name);
    if (entry.isSymbolicLink()) fail('模型目录不允许符号链接');
    if (entry.isDirectory()) return fileList(file);
    if (!entry.isFile()) fail('模型目录包含特殊文件');
    return [file];
  });
}
function identity(model) {
  if (model.schema !== 'semantic-reader-model/v1' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model.model_id)) fail('模型包身份无效');
  for (const field of ['title','revision']) if (typeof model[field] !== 'string' || !model[field].trim() || model[field].length>200) fail(`模型包缺少${field}`);
  if (!Array.isArray(model.files) || model.files.length<2 || model.files.length>10000) fail('模型文件清单无效');
}
function contentIdentity(model) {
  return digest(JSON.stringify([model.schema,model.model_id,model.title,model.revision,model.files.map(f=>[f.path,f.sha256])]));
}
export function validateModel(model) {
  identity(model);
  const names=new Set(), buffers=new Map(); let total=0;
  for (const f of model.files) {
    relativeFile(f.path);
    if (names.has(f.path)) fail('模型包重复文件'); names.add(f.path);
    if (typeof f.data!=='string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data)) fail('模型包文件编码错误');
    const bytes=Buffer.from(f.data,'base64'); total+=bytes.length;
    if (total>MAX_MODEL_BYTES || digest(bytes)!==f.sha256) fail('模型包文件校验失败');
    buffers.set(f.path,bytes);
  }
  if (!names.has('index.html') || !names.has('receipt.json')) fail('模型包缺少入口或发布收据');
  const receipt=JSON.parse(buffers.get('receipt.json').toString('utf8'));
  if (receipt.target!=='domain-model' || receipt.review?.state!=='reviewed-snapshot' || !receipt.outputs || typeof receipt.outputs!=='object') fail('只接受具有已审快照收据的领域阅读工件');
  const actual=[...names].filter(n=>n!=='receipt.json').sort(),declared=Object.keys(receipt.outputs).sort();
  if (JSON.stringify(actual)!==JSON.stringify(declared)) fail('模型包与发布清单不一致');
  for (const [n,h] of Object.entries(receipt.outputs)) if (digest(buffers.get(n))!==h) fail('模型包与发布内容不一致');
  if (contentIdentity(model)!==model.content_id) fail('模型包内容身份校验失败');
  return buffers;
}
export function modelFromSite({site,modelId,title,revision}) {
  const root=fs.realpathSync(path.resolve(site)), files=fileList(root).map(p=>({path:relativeFile(path.relative(root,p).split(path.sep).join('/')),sha256:digest(fs.readFileSync(p)),data:fs.readFileSync(p).toString('base64')})).sort((a,b)=>a.path.localeCompare(b.path));
  const model={schema:'semantic-reader-model/v1',model_id:modelId,title,revision,files};
  model.content_id=contentIdentity(model); validateModel(model); return model;
}
export function writeModel(file,model) {
  validateModel(model); fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(model)+'\n',{flag:'wx'});
}
export function installModel(library,model) {
  const buffers=validateModel(model); fs.mkdirSync(library,{recursive:true,mode:0o700});
  for (const entry of fs.readdirSync(library,{withFileTypes:true})) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
    const existing=JSON.parse(fs.readFileSync(path.join(library,entry.name,'model.json'),'utf8'));
    if (existing.model_id===model.model_id && existing.revision===model.revision && existing.content_id!==model.content_id) fail('这个模型版本已存在不同内容，请发布新的版本号');
  }
  const final=path.join(library,model.content_id);
  if (fs.existsSync(final)) { readInstalledModel(final); return {content_id:model.content_id,reused:true}; }
  const temporary=fs.mkdtempSync(path.join(library,'.import-'));
  try {
    for (const [name,bytes] of buffers) {const f=path.join(temporary,'site',name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,bytes);}
    const stored={...model,files:model.files.map(({data,...f})=>f)};
    fs.writeFileSync(path.join(temporary,'model.json'),JSON.stringify(stored)+'\n');
    fs.renameSync(temporary,final);
  } catch (error) {fs.rmSync(temporary,{recursive:true,force:true});throw error;}
  return {content_id:model.content_id,reused:false};
}
export function readInstalledModel(directory) {
  const stored=JSON.parse(fs.readFileSync(path.join(directory,'model.json'),'utf8'));
  const model={...stored,files:stored.files.map(f=>({...f,data:fs.readFileSync(path.join(directory,'site',relativeFile(f.path))).toString('base64')}))};
  validateModel(model);return {model:stored,site:path.join(directory,'site')};
}
