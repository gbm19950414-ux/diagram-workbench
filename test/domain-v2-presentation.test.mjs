import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compactLabel, renderSourceText} from '../src/domain-v2-presentation.mjs';
import {renderDomainModel} from '../src/domain-model.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

test('compact labels mechanically show first paragraph with explicit omission',()=>{
  const raw='首段说明。\n\n<table><tr><td>原表</td></tr></table>';
  assert.deepEqual(compactLabel(raw),{text:'首段说明。…〔已省略〕',omitted:true});
  assert.equal(compactLabel('一'.repeat(100),20).text,'一'.repeat(20)+'…〔已省略〕');
  assert.equal(compactLabel('短标题').text,'短标题');
  assert.equal(compactLabel('说明\n| 周一 | 周三 |').text,'说明…〔已省略〕');
});

test('source text renders pipe and strict HTML tables without executing untrusted markup',()=>{
  const html=renderSourceText('说明\n<table><tr><td rowspan="4" colspan="2"> 周一 </td><td>  </td></tr><tr><td><eq>3 \\times 5</eq></td></tr></table>');
  assert.match(html,/<td rowspan="4" colspan="2"> 周一 <\/td><td>  <\/td>/);
  assert.match(html,/3 \\times 5/);
  assert.doesNotMatch(html,/<eq>/);
  const pipe=renderSourceText('原印周日格未给组数。\n| 周日 | 周三 |\n| --- | --- |\n| 375×5 |  |');
  assert.match(pipe,/<table>/);assert.match(pipe,/<td>375×5<\/td>/);assert.match(pipe,/<td><\/td>/);
  assert.doesNotMatch(pipe,/375×5×2/);
  const unsafe=renderSourceText('<table onclick="run()"><tr><td>x</td></tr></table>\n<script>alert(1)</script>\n<img src=x onerror=run()>');
  assert.doesNotMatch(unsafe,/<table onclick|<script>|<img src/);
  assert.match(unsafe,/&lt;table onclick/);assert.match(unsafe,/&lt;script&gt;/);
  const badCell=renderSourceText('<table><tr><td><img src=x onerror=run()></td></tr></table>');
  assert.doesNotMatch(badCell,/<table>|<img/);assert.match(badCell,/&lt;img/);
});

test('v2 cards, relation lists, SVG and details use compact titles while retaining exact tables',()=>{
  const dir=path.join(root,'examples/domain-hierarchical');
  const model=JSON.parse(fs.readFileSync(path.join(dir,'model.json')));
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json')));
  const long='原文规定应逐项保留。'.repeat(12)+'\n\n<table><tr><td rowspan="2">1</td><td>  </td></tr><tr><td>375×5</td></tr></table>';
  model.nodes.find(n=>n.id==='request').label=long;
  model.nodes.find(n=>n.id==='queue').label='另一个长说明。\n\n| 周日 | 周三 |\n| --- | --- |\n| 375×5 |  |';
  manifest.sources.guide.excerpt=long;
  model.edges.find(e=>e.id==='compare').label='比较原文表格。\n\n| A | B |\n| --- | --- |\n| 甲 | 乙 |';
  const html=renderDomainModel({model,manifest,page:(_,body)=>body,esc,docName:x=>x,notice:''}).pages['index.html'];
  assert.match(html,/<button data-navigate="request">[^<]*已省略[^<]*<\/button>/);
  const card=html.match(/<h4><button data-navigate="request">[\s\S]*?查看详情与依据<\/button>/)?.[0];
  assert.ok(card);assert.ok(!card.includes('<table>'));
  assert.match(html,/data-select="compare">[^<]*比较原文表格。…〔已省略〕/);
  assert.match(html,/<template data-full-text="request">[\s\S]*?<td rowspan="2">1<\/td><td>  <\/td>/);
  assert.match(html,/<template data-excerpt="guide">[\s\S]*?<td rowspan="2">1<\/td>/);
  assert.match(html,/<template data-full-text="queue">[\s\S]*?<table>/);
  assert.doesNotMatch(card,/此层暂无来源有据的摘要/);
  assert.match(html,/>动作<\/text>/);
});

test('details text and nested fields stay in closed safe templates, including both table forms',()=>{
  const dir=path.join(root,'examples/domain-hierarchical');
  const model=JSON.parse(fs.readFileSync(path.join(dir,'model.json')));
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json')));
  model.nodes.find(n=>n.id==='request').details='完整说明\n<table><tr><td rowspan="4">1</td><td>  </td></tr></table>';
  model.nodes.find(n=>n.id==='queue').details='原印\n| 周日 | 周三 |\n| --- | --- |\n| 375×5 |  |';
  model.nodes.find(n=>n.id==='note').details={rationale:'<script>alert(1)</script>',source_revision:'r2'};
  const html=renderDomainModel({model,manifest,page:(_,body)=>body,esc,docName:x=>x,notice:''}).pages['index.html'];
  const request=html.match(/<template data-item-details="request">([\s\S]*?)<\/template>/)?.[1];
  const queue=html.match(/<template data-item-details="queue">([\s\S]*?)<\/template>/)?.[1];
  const note=html.match(/<template data-item-details="note">([\s\S]*?)<\/template>/)?.[1];
  assert.ok(request);assert.match(request,/<td rowspan="4">1<\/td><td>  <\/td>/);
  assert.ok(queue);assert.match(queue,/<table>/);assert.match(queue,/<td>375×5<\/td>\s*<td><\/td>/);
  assert.ok(note);assert.match(note,/来源修订/);assert.match(note,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(note,/<script>alert/);
  assert.match(html,/summary.textContent='更多说明'/);
  assert.match(html,/\['id','label','evidence','children','summary','origin','from','to','direction','order','details'\]/);
});
