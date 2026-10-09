import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {digest,bundleIdentity,fileList,modelFromSite,writeModel,validateModel} from './reader-model.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const escapeXML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function inspectRuntime(runtime,license) {
  if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('首版阅读包构建支持macOS arm64');
  const version=spawnSync(runtime,['--version'],{encoding:'utf8'});
  if(version.status!==0||!/^v(2[2-9]|[3-9]\d)\./.test(version.stdout.trim()))throw Error('阅读运行时需要独立Node22或更高版本');
  const deps=spawnSync('/usr/bin/otool',['-L',runtime],{encoding:'utf8'});
  if(deps.status!==0)throw Error('无法检查运行时依赖');
  const libraries=deps.stdout.split('\n').slice(1).map(l=>l.trim().split(' (')[0]).filter(Boolean);
  if(libraries.some(l=>!l.startsWith('/usr/lib/')&&!l.startsWith('/System/Library/')))throw Error('运行时依赖外部目录；请使用独立Node发行版');
  if(!fs.readFileSync(license,'utf8').includes('Node.js'))throw Error('请提供对应Node发行版的官方许可证');
  return {version:version.stdout.trim(),sha256:digest(fs.readFileSync(runtime)),dependencies:libraries,license_sha256:digest(fs.readFileSync(license))};
}
export function buildReaderPackage({catalogFile,runtime,runtimeLicense,outputDir}) {
  const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
  if(catalog.schema!=='semantic-reader-catalog/v1'||!/^[a-zA-Z0-9][\w.-]{0,99}$/.test(catalog.library_id)||!Array.isArray(catalog.models)||!catalog.models.length)throw Error('阅读库配置无效');
  const runtimeInfo=inspectRuntime(runtime,runtimeLicense);
  const output=path.resolve(outputDir);if(fs.existsSync(output))throw Error('目标已存在，使用新目录保留旧阅读包');
  fs.mkdirSync(path.dirname(output),{recursive:true});const temp=fs.mkdtempSync(path.join(path.dirname(output),'.reader-build-'));
  try {
    const app=path.join(temp,'语义模型阅读器.app'),contents=path.join(app,'Contents'),resources=path.join(contents,'Resources');
    fs.mkdirSync(path.join(resources,'runtime'),{recursive:true});fs.mkdirSync(path.join(contents,'MacOS'),{recursive:true});fs.mkdirSync(path.join(resources,'models'));
    const models=[],records=[],ids=new Set(),versions=new Set();
    for(const entry of catalog.models) {
      const model=entry.package?JSON.parse(fs.readFileSync(path.resolve(path.dirname(catalogFile),entry.package),'utf8')):modelFromSite({site:path.resolve(path.dirname(catalogFile),entry.site),modelId:entry.model_id,title:entry.title,revision:entry.revision});
      validateModel(model);if(ids.has(model.content_id))throw Error('阅读库重复模型');ids.add(model.content_id);
      const version=model.model_id+'\0'+model.revision;if(versions.has(version))throw Error('阅读库模型版本冲突');versions.add(version);
      const name='models/'+model.content_id+'.json';writeModel(path.join(resources,name),model);models.push(name);records.push({model_id:model.model_id,title:model.title,revision:model.revision,content_id:model.content_id});
    }
    fs.copyFileSync(runtime,path.join(resources,'runtime/node'));fs.chmodSync(path.join(resources,'runtime/node'),0o755);
    fs.copyFileSync(runtimeLicense,path.join(resources,'runtime/NODE-LICENSE.txt'));
    for(const filename of ['reader-runtime.mjs','reader-model.mjs','reader-page.mjs'])fs.copyFileSync(path.join(here,filename),path.join(resources,filename));
    const manifest={schema:'semantic-reader-bundle/v1',library_id:catalog.library_id,producer:{name:'diagram-workbench',version:JSON.parse(fs.readFileSync(path.join(here,'../package.json'),'utf8')).version},runtime:runtimeInfo,models,files:Object.fromEntries(fileList(resources).map(p=>[path.relative(resources,p).split(path.sep).join('/'),digest(fs.readFileSync(p))]))};
    manifest.bundle_id=bundleIdentity(manifest);fs.writeFileSync(path.join(resources,'bundle.json'),JSON.stringify(manifest,null,2)+'\n');
    const launcher=`#!/bin/sh\nRES="$(cd "$(dirname "$0")/../Resources" && pwd)"\nwhile :; do\n  if OUTPUT=$("$RES/runtime/node" "$RES/reader-runtime.mjs" start --resources "$RES" 2>&1); then\n    exit 0\n  fi\n  BUTTON=$(/usr/bin/osascript - "$OUTPUT" <<'APPLESCRIPT'\non run argv\n  set resultDialog to display alert "语义模型阅读器未能打开" message (item 1 of argv) buttons {"取消", "重试"} default button "重试"\n  return button returned of resultDialog\nend run\nAPPLESCRIPT\n)\n  [ "$BUTTON" = "重试" ] || exit 1\ndone\n`;
    fs.writeFileSync(path.join(contents,'MacOS','SemanticReader'),launcher,{mode:0o755});
    fs.writeFileSync(path.join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>SemanticReader</string><key>CFBundleIdentifier</key><string>local.semantic.reader.${escapeXML(catalog.library_id.replace(/_/g,'-'))}</string><key>CFBundleName</key><string>语义模型阅读器</string><key>CFBundleDisplayName</key><string>语义模型阅读器</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/></dict></plist>`);
    fs.copyFileSync(path.join(here,'../docs/reader.md'),path.join(temp,'使用说明.md'));
    fs.writeFileSync(path.join(temp,'交付清单.json'),JSON.stringify({schema:'semantic-reader-delivery/v1',bundle_id:manifest.bundle_id,library_id:catalog.library_id,runtime:runtimeInfo,models:records},null,2)+'\n');
    fs.renameSync(temp,output);return {output,app:path.join(output,'语义模型阅读器.app'),bundle_id:manifest.bundle_id,models:records,runtime:runtimeInfo};
  }catch(error){fs.rmSync(temp,{recursive:true,force:true});throw error;}
}
export async function readerCLI(args) {
  const command=args.shift();const option=name=>{const i=args.indexOf(name);if(i<0)return undefined;const value=args[i+1];if(!value||value.startsWith('--'))throw Error('缺少参数 '+name);args.splice(i,2);return value;};
  if(args.includes('--help')){console.log('reader-model --site SITE --model-id ID --title TITLE --revision REV --output FILE\nreader-package --catalog CATALOG_JSON --runtime NODE --runtime-license LICENSE --output-dir NEW_DIRECTORY');return;}
  let result;
  if(command==='reader-model') {
    const site=option('--site'),modelId=option('--model-id'),title=option('--title'),revision=option('--revision'),output=option('--output');
    if(args.length||![site,modelId,title,revision,output].every(Boolean))throw Error('reader-model需要site、model-id、title、revision和output');
    const model=modelFromSite({site,modelId,title,revision});writeModel(output,model);result={output:path.resolve(output),content_id:model.content_id};
  }else if(command==='reader-package') {
    const catalogFile=option('--catalog'),runtime=option('--runtime'),runtimeLicense=option('--runtime-license'),outputDir=option('--output-dir');
    if(args.length||![catalogFile,runtime,runtimeLicense,outputDir].every(Boolean))throw Error('reader-package需要catalog、runtime、runtime-license和output-dir');
    result=buildReaderPackage({catalogFile:path.resolve(catalogFile),runtime:path.resolve(runtime),runtimeLicense:path.resolve(runtimeLicense),outputDir});
  }else throw Error('未知阅读包命令');
  console.log(JSON.stringify(result,null,2));return result;
}
