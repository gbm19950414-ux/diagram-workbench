import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {validateReadingMap,defaultExpanded,layoutVisible,nestedSvg,occurrenceRole,sourceOrdinal,titleLines,fullBlockView,appendParagraphSelection,groupParagraphSpans,activateNestedKey,applyNestedViewport,nestedController} from '../src/nested-source.mjs';
import {createWorkbench} from '../src/workbench.mjs';
import {renderSourceText} from '../src/domain-v2-presentation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const json=p=>JSON.parse(fs.readFileSync(p));
const save=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
function fixture(t){const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'nested-source-')));fs.cpSync(path.join(root,'examples/source-nested'),dir,{recursive:true,filter:p=>!p.includes('.diagrams')&&!p.endsWith('review.json')});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const model=json(path.join(dir,'model.json')),map=json(path.join(dir,'reading-map.json')),manifest=json(path.join(dir,'evidence.json')),digest=createHash('sha256').update(fs.readFileSync(path.join(dir,'model.json'))).digest('hex');return {dir,model,map,manifest,digest};}
test('paragraph detail merges exact Unicode ranges and keeps native tables intact',()=>{
  const element=tag=>({tag,children:[],dataset:{},append(...parts){this.children.push(...parts);},set textContent(value){this.text=String(value);},get textContent(){return this.text??this.children.map(x=>x.textContent).join('');}});
  const documentRef={createElement:element,createTextNode:value=>({tag:'#text',textContent:String(value)})};
  let cloned=0;
  const templateFor=value=>({content:{querySelector(selector){assert.equal(selector,'table');return /<table(?:\s|>)/.test(renderSourceText(value))?{}:null;},cloneNode(){cloned++;return element('safe-template');}}});
  const text='前甲🙂乙丙后尾',paragraph={id:'p',text},spans=[{start:1,end:2},{start:1,end:2},{start:2,end:4},{start:4,end:5},{start:6,end:7}];
  const prose=element('box');appendParagraphSelection(prose,paragraph,spans,templateFor(text),documentRef);
  assert.equal(cloned,0);assert.equal(prose.children.length,1);assert.equal(prose.children[0].textContent,text);
  const marks=prose.children[0].children.filter(child=>child.tag==='mark');
  assert.deepEqual(marks.map(mark=>[mark.textContent,mark.dataset.start,mark.dataset.end]),[['甲🙂乙丙','1','5'],['尾','6','7']]);
  assert.deepEqual(groupParagraphSpans([{paragraph_id:'p',start:1,end:2},{paragraph_id:'q',start:0,end:1},{paragraph_id:'p',start:3,end:4}]),[[{paragraph_id:'p',start:1,end:2},{paragraph_id:'p',start:3,end:4}],[{paragraph_id:'q',start:0,end:1}]]);
  const pipe='| 周五 | 古籍修复演示 | 15:00 | 仅限预约 |',pipeBox=element('box');
  assert.doesNotMatch(renderSourceText(pipe),/<table/);
  appendParagraphSelection(pipeBox,{id:'pipe',text:pipe},{start:2,end:4},templateFor(pipe),documentRef);
  assert.equal(pipeBox.children.length,1);assert.equal(pipeBox.children[0].textContent,pipe);
  assert.equal(pipeBox.children[0].children[1].textContent,'周五');
  assert.equal(cloned,0);
  for(const value of ['<table><tr><td>原值</td></tr></table>','| 项 | 值 |\n| --- | --- |\n| 周日 | 375×5 |']){
    assert.match(renderSourceText(value),/<table/);
    const valueLength=Array.from(value).length,box=element('box');appendParagraphSelection(box,{id:'table',text:value},[{start:0,end:2},{start:3,end:valueLength}],templateFor(value),documentRef);
    assert.equal(box.children.length,2);assert.equal(box.children[0].tag,'safe-template');assert.equal(box.children[1].children.filter(child=>child.tag==='mark').length,2);
    assert.equal(box.children[1].textContent,`选中原文范围：0–2 字符；3–${valueLength} 字符；完整安全表格见上方。`);
    assert.ok(!box.children[1].textContent.includes(value));assert.doesNotMatch(box.children[1].textContent,/<table|<tr|<td/);
  }
  assert.equal(cloned,2);
});
test('v5, minimal-v4 and legacy detail renderers group paragraph occurrences',()=>{
  const controller=nestedController.toString(),calls=[...controller.matchAll(/groupParagraphSpans\(item\.spans\|\|\[\]\)/g)].map(match=>match.index);
  assert.equal(calls.length,3);
  const modes=['const paintV5Detail=','const paintMinimalDetail=','const paintDetail='].map(marker=>controller.indexOf(marker));
  assert.ok(calls[0]>modes[0]&&calls[0]<modes[1]);assert.ok(calls[1]>modes[1]&&calls[1]<modes[2]);assert.ok(calls[2]>modes[2]);
  assert.match(controller,/appendParagraphSelection\(box,p,list,template,document\)/);
});
test('native toggle buttons receive one browser keyboard click; SVG controls dispatch one explicit click',()=>{
  let prevented=0,dispatched=0;
  const button={tagName:'BUTTON',dispatchEvent(){dispatched++;}},svg={tagName:'g',dispatchEvent(event){assert.equal(event.type,'click');dispatched++;}};
  const event=target=>({key:'Enter',target:{closest(){return target;}},preventDefault(){prevented++;}});
  class Click{constructor(type,options){this.type=type;this.bubbles=options.bubbles;}}
  assert.equal(activateNestedKey(event(button),Click),false);assert.equal(dispatched,0);assert.equal(prevented,0);
  assert.equal(activateNestedKey(event(svg),Click),true);assert.equal(dispatched,1);assert.equal(prevented,1);
});
test('focus and full-view centering clear stale canvas scroll while ordinary pan preserves it',()=>{
  const canvas={scrollLeft:48,scrollTop:227,clientHeight:552},svg={style:{}};
  const scale=.6,panX=102.6,panY=-262.8,frameY=(50.8-panY)/scale,frameHeight=452.4;
  const frameTop=()=>frameY*scale+panY-canvas.scrollTop;
  assert.ok(frameTop()<0,'the recorded stale scroll clips the selected frame');
  applyNestedViewport(canvas,svg,scale,panX,panY);
  assert.equal(canvas.scrollTop,227);assert.equal(canvas.scrollLeft,48);
  applyNestedViewport(canvas,svg,scale,panX,panY,true);
  assert.equal(canvas.scrollTop,0);assert.equal(canvas.scrollLeft,0);
  assert.ok(frameTop()>0&&frameTop()+frameHeight<canvas.clientHeight,'selected frame fits after scroll reset');
  assert.equal(svg.style.transform,'translate(102.6px, -262.8px) scale(0.6)');
  const controller=nestedController.toString();
  assert.match(controller,/const fit=\(\)=>[\s\S]*?applyTransform\(true\);\};/);
  assert.match(controller,/getElementById\('ns-focus'\)[\s\S]*?applyTransform\(true\);save\(\);\};/);
});
test('reading map validates nested source, shared objects, loops and source identity',t=>{
  const f=fixture(t);validateReadingMap(f.map,f.model,f.manifest,f.digest);
  assert.equal(f.map.containers.filter(c=>c.object_id==='shared').length,2);
  assert.deepEqual([...defaultExpanded(f.map)].sort(),['chapter:library','section:collection']);
  const note=f.map.occurrences.find(o=>o.object_id==='note');assert.equal(occurrenceRole(note,f.map,f.model),'related');assert.equal(sourceOrdinal(note,f.map),9);
  const block=f.map.containers.find(c=>c.object_id==='sorting');assert.ok(titleLines(block,f.model).length<=2);assert.ok(titleLines(block,f.model).every(x=>Array.from(x).length<=13));
  const request=f.map.occurrences.find(o=>o.object_id==='request');assert.ok(titleLines(request,f.model).every(x=>Array.from(x).length<=11));assert.equal(titleLines(request,f.model).length,2);
  const full=fullBlockView(f.map,f.model,'shared');assert.equal(full.locations.length,2);assert.ok(full.members.some(x=>x.node.id==='offmap'&&x.appearances.length===0));assert.ok(full.related.some(x=>x.node.id==='queue'&&x.appearances.length>0));
  const bad=(edit,re)=>{const m=structuredClone(f.map);edit(m);assert.throws(()=>validateReadingMap(m,f.model,f.manifest,f.digest),re);};
  bad(m=>m.model_sha256='0'.repeat(64),/model_sha256 mismatch/);
  bad(m=>m.containers[2].parent_id='section:intake',/Container cycle/);
  bad(m=>m.containers[2].summary.evidence=['missing'],/evidence/);
  bad(m=>m.occurrences[0].spans[0].end=10000,/span end/);
  bad(m=>m.edge_routes[0].to_id=m.edge_routes[0].from_id,/Route endpoint mismatch/);
  const withoutRelated=structuredClone(f.model);withoutRelated.nodes.find(n=>n.id==='sorting').related_element_ids=['isolated'];assert.throws(()=>validateReadingMap(f.map,withoutRelated,f.manifest,f.digest),/Unjustified occurrence ownership/);
  bad(m=>m.paragraphs[0].continues_from='missing',/continues_from/);
  bad(m=>m.paragraphs[0].unexpected='<script>',/Invalid fields/);
});
test('ELK compound layout keeps root and two branches; source filter removes interpretation',async t=>{
  const f=fixture(t),opened=defaultExpanded(f.map),layout=await layoutVisible(f.map,opened,f.model);
  const svg=nestedSvg(f.map,f.model,layout,opened);
  assert.match(svg,/chapter:library/);assert.match(svg,/section:collection/);assert.match(svg,/section:intake/);assert.match(svg,/section:retrieval/);
  assert.doesNotMatch(svg,/section:intake\/block:sorting/);
  assert.match(svg,/内部\d+条关系/);assert.match(svg,/底层关系汇总/);assert.doesNotMatch(svg,/compared with|might bypass/);assert.doesNotMatch(svg,/class="ns-edge internal[^>]*><path/);
  const expanded=new Set([...opened,'section:intake','section:intake/block:sorting']);const detailed=nestedSvg(f.map,f.model,await layoutVisible(f.map,expanded,f.model),expanded);assert.match(detailed,/compared with/);assert.match(detailed,/关联引用 · 原文序 9/);assert.match(detailed,/ns-frame occurrence related/);const source=nestedSvg(f.map,f.model,await layoutVisible(f.map,opened,f.model,'source'),opened,'source');assert.doesNotMatch(source,/项目解释/);
});
test('public lifecycle fingerprints map/config and failed build keeps prior site',async t=>{
  const f=fixture(t),wb=await createWorkbench({project:f.dir});
  await wb.main(['review','--reviewer','synthetic-fixture','--decision','updated','--note','Synthetic reading-map interface check, not a semantic claim.']);
  await wb.main(['build']);await wb.main(['check']);
  const site=path.join(f.dir,'.diagrams/site'),html=fs.readFileSync(path.join(site,'index.html'),'utf8'),receipt=fs.readFileSync(path.join(site,'receipt.json'));
  assert.match(html,/elk\.bundled\.js/);assert.match(html,/data-frame="chapter:library"/);assert.match(html,/ns-summary/);assert.match(html,/完整知识块/);assert.match(html,/本小样范围外/);assert.match(html,/追溯信息与来源链接/);assert.match(html,/data-paragraph="p4"/);assert.match(html,/const groupParagraphSpans=function groupParagraphSpans/);const script=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));const controller=script.indexOf('(function nestedController');assert.ok(controller>0);const sandbox={};vm.runInNewContext(script.slice(0,controller)+'globalThis.helpers={visibleTree,nestedSvg,defaultExpanded,groupParagraphSpans};',sandbox);const opened=sandbox.helpers.defaultExpanded(f.map);assert.equal(sandbox.helpers.visibleTree(f.map,opened).children[0].children[0].children[0].id,'section:intake');assert.deepEqual(JSON.parse(JSON.stringify(sandbox.helpers.groupParagraphSpans([{paragraph_id:'p4',start:0,end:1},{paragraph_id:'p4',start:2,end:3}]))),[[{paragraph_id:'p4',start:0,end:1},{paragraph_id:'p4',start:2,end:3}]]);assert.match(html,/<table><tr><td rowspan="2">/);assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  let map=json(path.join(f.dir,'reading-map.json'));map.containers[0].summary.text+='!';save(path.join(f.dir,'reading-map.json'),map);
  await assert.rejects(wb.main(['check']),/needs-review/);
  await wb.main(['review','--reviewer','synthetic-fixture','--decision','updated','--note','Synthetic reading-map content changed; interface rechecked.']);
  await wb.main(['build']);await wb.main(['check']);
  const old=fs.readFileSync(path.join(site,'receipt.json'));
  map=json(path.join(f.dir,'reading-map.json'));map.edge_routes[0].to_id='missing';save(path.join(f.dir,'reading-map.json'),map);
  await assert.rejects(wb.main(['build']),/Route endpoint mismatch/);
  assert.deepEqual(fs.readFileSync(path.join(site,'receipt.json')),old);
  const config=json(path.join(f.dir,'diagram.config.json'));config.portal.title+=' updated';save(path.join(f.dir,'diagram.config.json'),config);
  await assert.rejects(wb.main(['check']),/Route endpoint mismatch/);
  assert.notDeepEqual(old,receipt);
});
