import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {safeFile,validateRefs as refs,freshness,verifyOutputs} from '../src/checks.mjs';
import {validateCoverage,coverageSummary,verifyRenderedCoverage} from '../src/coverage.mjs';

const validateRefs=(m,d,diagrams,root)=>refs(m,d,diagrams,root,{checkTest:({text,reference})=>text.includes(`def ${reference.symbol}(`)});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'architecture-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'source.py'),'def contract_test():\n    pass\n');return dir;}
function manifest(){return {sources:{code:{path:'source.py'}},elements:{system:['code']},invariants:{contract:{sources:['code'],tests:[{source:'code',symbol:'contract_test'}]}}};}
test('cross-view references reject nonexistent elements and invariant names',t=>{
  const dir=fixture(t),m=manifest(),dsl='system = softwareSystem "System"';
  validateRefs(m,dsl,{'ok.puml':"@startuml\n' @model system\n' @invariant contract\n@enduml"},dir);
  assert.throws(()=>validateRefs(m,dsl,{'bad.puml':"@startuml\n' @model absent\n@enduml"},dir),/Unknown UML/);
  assert.throws(()=>validateRefs(m,dsl,{'bad.puml':"@startuml\n' @invariant absent\n@enduml"},dir),/Unknown invariant/);
  m.invariants.contract.tests[0].symbol='removed';assert.throws(()=>validateRefs(m,dsl,{},dir),/Missing test symbol/);
});
test('missing evidence, deleted sources, traversal, private paths and symlinks fail closed',t=>{
  const dir=fixture(t),m=manifest();m.elements.system=['missing'];
  assert.throws(()=>validateRefs(m,'system = softwareSystem "S"',{},dir),/Unknown evidence/);
  for(const rel of ['../source.py','private/source.py','/tmp/source.py','missing.py'])assert.throws(()=>safeFile(dir,rel));
  fs.symlinkSync(path.join(dir,'source.py'),path.join(dir,'alias.py'));assert.throws(()=>safeFile(dir,'alias.py'),/Symlink/);
  fs.rmSync(path.join(dir,'source.py'));assert.throws(()=>safeFile(dir,'source.py'),/Missing/);
});
test('additions, changes and deletions need explicit review; rendering cannot refresh it',()=>{
  const old={a:'one'},review={reviewer:'test',decision:'updated',note:'read source and tests',snapshot:old};
  assert.equal(freshness(old,review).state,'reviewed-snapshot');
  for(const changed of [{a:'two'},{a:'one',b:'new'},{}]){
    assert.equal(freshness(changed,review).state,'needs-review');
    const fakeBuildReceipt={inputs:changed,review};
    assert.equal(freshness(fakeBuildReceipt.inputs,review).state,'needs-review');
  }
  assert.equal(freshness(old,null).state,'needs-review');
  assert.equal(freshness({a:'two'},{...review,decision:'no-impact',snapshot:{a:'two'}}).state,'reviewed-snapshot');
  assert.equal(freshness(old,{...review,note:''}).state,'needs-review');
});
test('receipt checks reject tampered, missing and unexpected generated outputs',t=>{
  const dir=fixture(t),p=path.join(dir,'source.py'),outputs={'source.py':crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')};
  verifyOutputs(dir,outputs);fs.writeFileSync(p,'tampered');assert.throws(()=>verifyOutputs(dir,outputs),/Output changed/);
  fs.rmSync(p);assert.throws(()=>verifyOutputs(dir,outputs),/Output set/);
});

function coverageFixture() {
  const manifest={sources:{decision:{path:'decision.md',type:'decision'},schema:{path:'schema.json',type:'schema'},external:{path:'facts.json',type:'external-facts'}},elements:{},invariants:{}};
  const dsl='system = softwareSystem "System"\nviews {\n systemContext system "context" { include * }\n container system "containers" { include * }\n}';
  const diagrams={
    'domain.puml':'@startuml\nclass Case\n@enduml',
    'sequence.puml':'@startuml\nparticipant A\nA -> B: request\n@enduml',
    'state.puml':'@startuml\n[*] --> Ready\nstate Ready\n@enduml',
    'lineage.puml':'@startuml\nrectangle Source\nSource --> Product\n@enduml'
  };
  const evidence=[{id:'decision',type:'decision'}];
  return {manifest,dsl,diagrams,coverage:{schema:1,profile:'software-current-state',audiences:['project-author','maintainer-agent'],perspectives:[
    {id:'boundary',section:'boundaries',question:'Who owns the boundary?',kind:'c4-system-context',status:'modelled',artifact:{type:'structurizr',viewKey:'context'},evidence,presentation:'link'},
    {id:'containers',section:'boundaries',question:'Which containers coordinate work?',kind:'c4-container',status:'modelled',artifact:{type:'structurizr',viewKey:'containers'},evidence,presentation:'link'},
    {id:'domain',section:'domain',question:'Which objects are current?',kind:'domain-class',status:'modelled',artifact:{type:'plantuml',file:'domain.puml'},evidence:[{id:'schema',type:'schema'}],presentation:'embed'},
    {id:'sequence',section:'behavior',question:'How does work flow?',kind:'sequence',status:'modelled',artifact:{type:'plantuml',file:'sequence.puml'},evidence,presentation:'embed',concerns:['failure']},
    {id:'lifecycle',section:'behavior',question:'How does recovery work?',kind:'state-lifecycle',status:'modelled',artifact:{type:'plantuml',file:'state.puml'},evidence,presentation:'embed',concerns:['recovery']},
    {id:'lineage',section:'assurance',question:'Which facts are traceable?',kind:'data-lineage',status:'modelled',artifact:{type:'plantuml',file:'lineage.puml'},evidence:[{id:'external',type:'external-facts'}],presentation:'embed'},
    {id:'runtime',section:'assurance',question:'What is deployed?',kind:'runtime-deployment',status:'unknown',evidence,reason:'No authoritative runtime topology exists.',revisitWhen:'An operated deployment record is approved.',presentation:'link'}
  ]}};
}
test('coverage profile validates required perspectives, evidence types, unknowns and rendered diagrams',()=>{
  const {coverage,manifest,dsl,diagrams}=coverageFixture();
  const valid=validateCoverage(coverage,{manifest,dsl,diagrams});
  assert.equal(coverageSummary(valid).state,'complete-with-unknowns');
  assert.equal(coverageSummary(valid).counts.modelled,6);
  verifyRenderedCoverage(valid,diagrams,Object.fromEntries(Object.keys(diagrams).map(name=>[name,'<svg></svg>'])));
  assert.throws(()=>validateCoverage({...coverage,perspectives:coverage.perspectives.filter(p=>p.kind!=='sequence')},{manifest,dsl,diagrams}),/requires a modelled sequence/);
  const badUnknown=structuredClone(coverage);delete badUnknown.perspectives.at(-1).reason;
  assert.throws(()=>validateCoverage(badUnknown,{manifest,dsl,diagrams}),/runtime.reason/);
  const duplicate=structuredClone(coverage);duplicate.perspectives[1].id='boundary';
  assert.throws(()=>validateCoverage(duplicate,{manifest,dsl,diagrams}),/duplicate perspective id/);
  const badView=structuredClone(coverage);badView.perspectives[0].artifact.viewKey='missing';
  assert.throws(()=>validateCoverage(badView,{manifest,dsl,diagrams}),/missing C4 view/);
  const badUml=structuredClone(coverage);badUml.perspectives[2].artifact.file='missing.puml';
  assert.throws(()=>validateCoverage(badUml,{manifest,dsl,diagrams}),/missing UML/);
  const badType=structuredClone(coverage);badType.perspectives[0].evidence=[{id:'decision',type:'schema'}];
  assert.throws(()=>validateCoverage(badType,{manifest,dsl,diagrams}),/has type decision/);
  const wrongKind=structuredClone(coverage);wrongKind.perspectives[2].kind='sequence';
  assert.throws(()=>validateCoverage(wrongKind,{manifest,dsl,diagrams}),/renders as domain-class/);
});
test('coverage UML classification does not mistake prose containing current-state for a lifecycle',()=>{
  const {coverage,manifest,dsl,diagrams}=coverageFixture();
  diagrams['sequence.puml']='@startuml\ntitle Current-state request path\nparticipant A\nA -> B: request\n@enduml';
  assert.equal(validateCoverage(coverage,{manifest,dsl,diagrams}).perspectives.find(p=>p.id==='sequence').kind,'sequence');
});
test('coverage UML classification does not mistake a sequence participant label for a lineage declaration',()=>{
  const {coverage,manifest,dsl,diagrams}=coverageFixture();
  diagrams['sequence.puml']='@startuml\nparticipant "Execution package" as A\nA -> B: request\n@enduml';
  assert.equal(validateCoverage(coverage,{manifest,dsl,diagrams}).perspectives.find(p=>p.id==='sequence').kind,'sequence');
});
