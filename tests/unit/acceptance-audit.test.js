import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { auditAcceptance, joinStrata, judgeFast } from '../../scripts/gate/acceptance.mjs';

const sha = n => n.toString(16).padStart(40, '0');
const base=sha(1), cutover=sha(2), candidate=sha(3), promotion=sha(4), wip=sha(5);
const hashes={unit:'a'.repeat(64),suites:'b'.repeat(64)};
function fixture({withWip=false, docs=false, historical=false}={}) {
  const commits=[cutover,...(withWip?[wip]:[]),candidate,promotion];
  const facts={
    [cutover]:{tree:sha(12),parents:[base],paths:[],committedAt:100},
    [wip]:{tree:sha(15),parents:[cutover],paths:['src/a.js'],committedAt:101},
    [candidate]:{tree:sha(13),parents:[withWip?wip:cutover],paths:['src/a.js'],committedAt:102},
    [promotion]:{tree:sha(13),parents:[cutover,candidate],paths:docs?['docs/reports/summary.md']:['src/a.js'],committedAt:103}};
  const records={};
  const full=commit=>{records[commit]={schema:'atlas.plane-gate',schemaVersion:1,commit,requiredIds:['unit','cleanup'],results:{unit:{state:'passed'},cleanup:{state:'passed'}},overall:{state:'passed'}};return commit;};
  const fast=commit=>{const ref='fast-'+commit;records[ref]={schema:'atlas.fast-check',schemaVersion:1,commit,tree:facts[commit].tree,startedAt:'2026-10-22T12:00:00.000Z',finishedAt:'2026-10-22T12:01:00.000Z',cleanBefore:true,cleanAfter:true,unchanged:true,manifests:{...hashes},unit:{state:'passed'},build:{state:'passed'},cleanup:'confirmed'};return ref;};
  const policy={schema:'atlas.acceptance-policy',schemaVersion:1,policyVersion:1,docsFastAllowlist:['docs/reports/summary.md'],outputSummaries:docs?['docs/reports/summary.md']:[]};
  const manifest={schema:'atlas.acceptance',schemaVersion:1,policyVersion:1,base,head:promotion,cutover,approval:{approvedBy:'user',date:'2026-10-21',source:'plan rev 4.9'},retrospective:[],docsFastAllowlist:[...policy.docsFastAllowlist],commits:[
    {commit:cutover,disposition:'merge-gated',gate:full(cutover)},
    ...(withWip?[{commit:wip,disposition:'wip',boundary:candidate,fast:fast(wip)}]:[]),
    {commit:candidate,disposition:'feature-gated',integrationBase:cutover,reviewedCandidate:candidate,gate:full(candidate)},
    {commit:promotion,disposition:docs?'docs-fast':'merge-tree-identical',candidate,integrationBase:cutover,parents:[cutover,candidate],tree:sha(13),candidateTree:sha(13),verifiedIntegration:cutover,fast:fast(promotion)}]};
  if(historical){commits.splice(commits.indexOf(wip),1);commits.unshift(wip);facts[wip].parents=[base];facts[wip].committedAt=99;facts[cutover].parents=[wip];facts[candidate].parents=[cutover];manifest.retrospective=[{commit:wip,disposition:'wip'}];}
  const isAncestor=(a,b,seen=new Set())=>a===b||!seen.has(b)&&(seen.add(b), (facts[b]?.parents??[]).some(p=>isAncestor(a,p,seen)));
  return {commits,facts,records,manifest,requiredIdsFor:()=>['unit','cleanup'],isAncestor,manifestsFor:()=>({...hashes}),approvedPolicyFor:()=>policy,approvedTransition:{cutover,retrospective:structuredClone(manifest.retrospective)},summaryValidFor:()=>true};
}
const row=(result,id)=>result.rows.find(r=>r.commit===id);
function baseline(options){const x=fixture(options);assert.equal(auditAcceptance(x).accepted,true,'accepted baseline');return x;}
function rejects(x,id,reason){const result=auditAcceptance(x);assert.equal(row(result,id).state,'unaccepted');assert.match(row(result,id).reason,reason);assert.equal(result.accepted,false);}

test('a promotion is accepted as merge-tree-identical only when its tree object ID equals the gated candidate',()=>{
  const x=baseline();x.facts[promotion].tree=sha(44);rejects(x,promotion,/identical tree/);
});
test('each WIP boundary and fast-evidence rule rejects its own defect',()=>{
  const cases=[
    [x=>x.manifest.commits.find(r=>r.commit===wip).boundary='bad',/boundary SHA/],
    [x=>{const original=x.isAncestor;x.isAncestor=(a,b)=>a===wip&&b===candidate?false:original(a,b);},/descendant/],
    [x=>delete x.records[candidate],/fully gated/],
    [x=>delete x.records['fast-'+wip],/missing or incorrectly typed/],
  ];
  for(const [mutate,reason] of cases){const x=baseline({withWip:true});mutate(x);rejects(x,wip,reason);}
});
test('WIP cannot satisfy a promotion boundary and stale-target promotions fail',()=>{
  const x=baseline({withWip:true});x.manifest.commits.find(r=>r.commit===promotion).candidate=wip;rejects(x,promotion,/fully gated candidate/);
  const y=baseline();y.manifest.commits.at(-1).verifiedIntegration=base;rejects(y,promotion,/stale promotion/);
});
test('feature integration ancestry and candidate gate are independently required',()=>{
  const x=baseline();const ancestor=x.isAncestor;x.isAncestor=(a,b)=>a===cutover&&b===candidate?false:ancestor(a,b);rejects(x,candidate,/pinned integration ancestry/);
  const y=baseline();delete y.records[candidate];rejects(y,promotion,/fully gated candidate/);
});
test('the audit rejects a mismatched head and out-of-range disposition',()=>{
  const x=baseline();x.manifest.head=base;assert.ok(auditAcceptance(x).errors.includes('empty range or manifest head does not match audited head'));
  const y=baseline();y.manifest.commits.push({commit:sha(99),disposition:'wip'});assert.ok(auditAcceptance(y).errors.some(e=>e.includes('out-of-range disposition')));
});
test('unknown dispositions and unapproved retrospective classifications fail on the affected row',()=>{
  const x=baseline();x.manifest.commits.at(-1).disposition='unknown';rejects(x,promotion,/unknown disposition/);
  const y=baseline();y.manifest.retrospective=[{commit:base,disposition:'wip'}];assert.ok(auditAcceptance(y).errors.includes('unapproved cutover or retrospective classification'));
  const z=baseline({withWip:true,historical:true});z.manifest.commits.find(r=>r.commit===wip).disposition='feature-gated';rejects(z,wip,/differs from approved transition/);
  const legacy=baseline({withWip:true,historical:true});legacy.approvedTransition.retrospective=[];legacy.manifest.retrospective=[];rejects(legacy,wip,/unapproved retrospective classification/);
});
test('fast evidence binds the exact commit tree manifests clean state results and cleanup',()=>{
  const defects=[
    [r=>r.commit=base,/commit\/tree/],[r=>r.tree=sha(99),/commit\/tree/],
    [r=>r.manifests.unit='c'.repeat(64),/manifests/],
    [r=>r.cleanAfter=false,/clean unchanged/],[r=>r.unchanged=false,/clean unchanged/],
    [r=>r.unit.state='failed',/checks or cleanup/],[r=>r.build.state='failed',/checks or cleanup/],[r=>r.cleanup='unconfirmed',/checks or cleanup/],
  ];
  for(const [mutate,reason]of defects){const x=baseline();mutate(x.records['fast-'+promotion]);rejects(x,promotion,reason);}
});
test('a docs-fast commit cannot expand its own allowlist or omit fast checks or summary validation',()=>{
  const x=baseline({docs:true});x.manifest.docsFastAllowlist.push('docs/reports/new.md');x.facts[promotion].paths=['docs/reports/new.md'];rejects(x,promotion,/allowlist/);
  const y=baseline({docs:true});y.summaryValidFor=()=>false;rejects(y,promotion,/does not reproduce/);
  const z=baseline({docs:true});delete z.records['fast-'+promotion];rejects(z,promotion,/missing or incorrectly typed/);
});
test('docs-fast uses the manifest allowance and forbids policy requirements exceptions and consumed evidence',()=>{
  const x=baseline({docs:true});x.manifest.docsFastAllowlist=[];rejects(x,promotion,/allowlist/);
  for(const path of ['scripts/gate/acceptance-policy-1b1.json','docs/superpowers/plans/plan.md','docs/superpowers/specs/spec.md','docs/reports/project1b/gate-exceptions-1b1.json','artifacts/gates/run.json','src/app.js']){
    const y=baseline({docs:true});const policy=y.approvedPolicyFor();policy.docsFastAllowlist=[path];policy.outputSummaries=[path];y.manifest.docsFastAllowlist=[path];y.facts[promotion].paths=[path];rejects(y,promotion,/forbidden docs-fast/);
  }
});
test('the evidence join blocks missing conflicting inconclusive and diagnostic mandatory strata',()=>{
  const mandatory=[{matrixSha256:'m',id:'a'},{matrixSha256:'m',id:'b'}];
  const rows=mandatory.map(r=>({...r,role:'mandatory',state:'passed',passed:true}));
  assert.equal(joinStrata(mandatory,rows).accepted,true);
  const cases=[[rows.slice(0,1),1,/missing/],[[...rows,{...rows[0],state:'failed',passed:false}],0,/conflicting/],[rows.map(r=>({...r,state:'inconclusive'})),0,/failed or inconclusive/],[rows.map(r=>({...r,role:'diagnostic'})),0,/missing/]];
  for(const [evidence,index,reason]of cases){const result=joinStrata(mandatory,evidence);assert.equal(result.accepted,false);assert.match(result.rows[index].reason,reason);}
});
test('retrospective fast evidence requires the same-SHA contemporaneous ledger pass and true run timestamps',()=>{
  const x=baseline();const record=x.records['fast-'+promotion];record.recordedRetrospectively=true;
  const ledger={commit:promotion,unit:'passed',build:'passed',recordedAt:'2026-10-21T12:00:00.000Z',source:{sha256:'d'.repeat(64),line:10}};
  x.contemporaneousFastFor=()=>ledger;
  assert.equal(auditAcceptance(x).accepted,true);
  for(const bad of [null,{...ledger,commit:base},{...ledger,unit:'failed'},{...ledger,build:'unknown'},{...ledger,recordedAt:'2026-10-23T12:00:00.000Z'}]){
    x.contemporaneousFastFor=()=>bad;rejects(x,promotion,/contemporaneous/);
  }
  x.contemporaneousFastFor=()=>ledger;record.startedAt='invalid';rejects(x,promotion,/timestamp/);
});

test('retrospective ledger references verify bytes excerpts exact SHA association and explicit fast pass', async () => {
  const {readContemporaneousFast}=await import('../../scripts/gate/fast-evidence.mjs');
  const {mkdir,mkdtemp,writeFile,rm}=await import('node:fs/promises');
  const {resolve}=await import('node:path');
  const {createHash}=await import('node:crypto');
  const hash=s=>createHash('sha256').update(s).digest('hex');
  await mkdir('artifacts/runtime',{recursive:true});const root=await mkdtemp(resolve('artifacts/runtime/fast-ledger-'));
  try{
    const text=`Promotion ${promotion}: fast checks 945 + build; integration unchanged.\n`;
    await writeFile(resolve(root,'progress.md'),text);
    const entry={commit:promotion,unit:'passed',build:'passed',recordedAt:'2026-10-21T12:00:00Z',source:{file:'progress.md',sha256:hash(text),startLine:1,endLine:1,excerpt:text.trim()}};
    const run=async()=>{
      const bytes=JSON.stringify({schema:'atlas.contemporaneous-fast-index',schemaVersion:1,entries:[entry]});await writeFile(resolve(root,'index.json'),bytes);
      return readContemporaneousFast([{file:'index.json',sha256:hash(bytes)}],{root,resolveCommit:s=>s===promotion?promotion:null});
    };
    assert.equal((await run()).get(promotion).unit,'passed');
    entry.source.sha256='0'.repeat(64);await assert.rejects(run,/hash/);
    entry.source.sha256=hash(text);entry.commit=base;await assert.rejects(run,/same.SHA|same.commit/);
    entry.commit=promotion;entry.source.excerpt='invented pass';await assert.rejects(run,/excerpt/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('retrospective recorder requires pinned ledger input and an exact target checkout', async () => {
  const {parseFastOptions}=await import('../../scripts/record-fast-checks.mjs');
  assert.throws(()=>parseFastOptions(['--retrospective']),/expected.commit|ledger/);
  const args=['--checkout','artifacts/old','--expected-commit',promotion,'--retrospective','--ledger-index','artifacts/index.json','--ledger-sha256','a'.repeat(64),'--output-root','artifacts/evidence'];
  const result=parseFastOptions(args);assert.equal(result.retrospective,true);assert.equal(result.expectedCommit,promotion);assert.equal(result.checkout,'artifacts/old');
});

async function fastLedgerFixture(run) {
  const {readContemporaneousFast}=await import('../../scripts/gate/fast-evidence.mjs');
  const {mkdir,mkdtemp,writeFile,rm}=await import('node:fs/promises');
  const {resolve}=await import('node:path');
  const hash=s=>createHash('sha256').update(s).digest('hex');
  await mkdir('artifacts/runtime',{recursive:true});
  const root=await mkdtemp(resolve('artifacts/runtime/fast-clauses-'));
  const load=async(text,{commit=promotion,pin,recordedAt='2026-10-21T12:00:00Z',...loaderOptions}={})=>{
    await writeFile(resolve(root,'progress.md'),text);
    const entry={commit,unit:'passed',build:'passed',recordedAt,source:{file:'progress.md',sha256:hash(text),startLine:1,endLine:text.split('\n').length,excerpt:text}};
    const bytes=JSON.stringify({schema:'atlas.contemporaneous-fast-index',schemaVersion:1,entries:[entry]});
    await writeFile(resolve(root,'index.json'),bytes);
    return readContemporaneousFast([{file:'index.json',sha256:pin??hash(bytes)}],{root,resolveCommit:s=>[promotion,candidate,commit].includes(s)?s:null,...loaderOptions});
  };
  try {await run(load);} finally {await rm(root,{recursive:true,force:true});}
}

test('the fast-evidence loader rejects failed pending and held wording even beside a passing phrase',async()=>{
  await fastLedgerFixture(async load=>{
    assert.equal((await load(`Promotion ${promotion}: fast checks 945 + build.`)).size,1);
    for(const outcome of ['failed','pending','held']) {
      await assert.rejects(load(`Promotion ${promotion}: fast checks 945 + build ${outcome}.`),/explicitly record passing fast checks/);
    }
  });
});

test('the fast-evidence loader verifies the index pin before accepting valid source evidence',async()=>{
  await fastLedgerFixture(async load=>{
    const text=`Promotion ${promotion}: fast checks 945 + build.`;
    assert.equal((await load(text)).size,1);
    await assert.rejects(load(text,{pin:'0'.repeat(64)}),/index hash mismatch/);
    await assert.rejects(load(text,{pin:'not-a-hash'}),/index hash mismatch/);
  });
});

test('the fast-evidence loader binds passing checks to their named commit clause',async()=>{
  await fastLedgerFixture(async load=>{
    const mixed=`Commit ${promotion} (wip); Candidate ${candidate} (feat merged); fast checks 766 + build.`;
    await assert.rejects(load(mixed),/same.SHA.*association/);
    assert.equal((await load(mixed,{commit:candidate})).size,1);
    await assert.rejects(load(`Candidate ${candidate}; references commit ${promotion}; fast checks 945 + build.`),/same.SHA.*association/);
    for(const separator of ['. ','\n']) {
      await assert.rejects(load(`Commit ${promotion} (wip)${separator}fast checks 945 + build.`),/same.SHA.*association/);
    }
    const two=`Candidate ${candidate} gate PASSED; promotion ${promotion}: parents ${candidate}; tree identical; fast checks 945 + build. Candidate ${candidate}: fast checks 766 + build pending.`;
    assert.equal((await load(two)).size,1,'a different candidate\'s pending checks do not invalidate this promotion');
    await assert.rejects(load(two,{commit:candidate}),/explicitly record passing fast checks/);
  });
});


test('a historical fast-evidence pin cannot hide its retrospective status',()=>{
  const x=baseline();x.manifest.commits.at(-1).requiresRetrospectiveFast=true;
  rejects(x,promotion,/must be recordedRetrospectively/);
});

const approvedDocsCommit='f8d73e1a2a350e8056e29f9aae4c728daeee68e0';
const approvedDocsMerge='4df8c4b5ee5fb929db5b99521d328836fc35fa32';
function historicalDocsFixture({merge=false}={}) {
  const x=fixture(),commit=merge?approvedDocsMerge:approvedDocsCommit;
  const parents=merge?[base,sha(6)]:[base];
  x.commits.unshift(commit);
  x.facts[cutover].parents=[commit];
  x.facts[commit]={tree:sha(30),committedAt:99,parents,
    paths:['docs/superpowers/specs/design.md'],
    pathsByParent:parents.map(parent=>({parent,paths:['docs/superpowers/specs/design.md']}))};
  x.manifest.commits.unshift({commit,disposition:'historical-docs-only'});
  x.historicalDocsPolicy=JSON.parse(readFileSync(new URL('../../scripts/gate/acceptance-policy-1b1.json',import.meta.url))).historicalDocsOnly;
  const digest=policy=>createHash('sha256').update(JSON.stringify(policy??null)).digest('hex');
  x.manifest.historicalDocsOnlyPolicySha256=digest(x.historicalDocsPolicy);
  return {x,commit,digest};
}
function historicalDocsBaseline(options){
  const result=historicalDocsFixture(options);
  assert.equal(auditAcceptance(result.x).accepted,true,'approved historical docs-only baseline');
  return result;
}

test('historical-docs-only rejects a listed SHA when any changed path is outside the approved docs directories',()=>{
  for(const path of ['src/app.js','docs/reports/report.md','docs/superpowers-elsewhere/plan.md','docs/codesign-elsewhere/log.md','scripts/gate/acceptance-policy-1b1.json']){
    const {x,commit}=historicalDocsBaseline();
    x.facts[commit].paths.push(path);x.facts[commit].pathsByParent[0].paths.push(path);
    rejects(x,commit,/outside approved docs directories/);
  }
});

test('historical-docs-only allows both superpowers and codesign paths for a listed SHA',()=>{
  const {x,commit}=historicalDocsBaseline();
  x.facts[commit].paths.push('docs/codesign/project1-log.md');
  x.facts[commit].pathsByParent[0].paths.push('docs/codesign/project1-log.md');
  assert.equal(auditAcceptance(x).accepted,true,'spec/plan and codesign changes are both approved');
});

test('historical-docs-only rejects unlisted docs-only commits prefixes and self-enrollment',()=>{
  const {x,commit,digest}=historicalDocsBaseline(),unlisted=sha(70);
  x.commits[0]=unlisted;x.facts[unlisted]=x.facts[commit];delete x.facts[commit];
  x.facts[cutover].parents=[unlisted];x.manifest.commits[0].commit=unlisted;
  rejects(x,unlisted,/not approved|unapproved/);
  // Neither the live manifest nor a policy read from the audited commit can enroll it.
  x.manifest.historicalDocsOnly={approval:{approvedBy:'user'},commits:[unlisted]};
  x.approvedPolicyFor=()=>({historicalDocsOnly:x.manifest.historicalDocsOnly});
  rejects(x,unlisted,/not approved|unapproved/);
  x.historicalDocsPolicy.commits.push(unlisted);
  x.manifest.historicalDocsOnlyPolicySha256=digest(x.historicalDocsPolicy);
  rejects(x,unlisted,/not approved|unapproved/);
  const prefix=historicalDocsBaseline();prefix.x.manifest.commits[0].commit=prefix.commit.slice(0,7);
  assert.equal(auditAcceptance(prefix.x).accepted,false);
});

test('historical-docs-only compares a merge with its first parent only',()=>{
  const {x,commit}=historicalDocsBaseline({merge:true});
  // Code inherited unchanged from the first parent may differ from the second.
  x.facts[commit].pathsByParent[1].paths.push('src/only-on-first-parent.js');
  x.facts[commit].paths.push('src/only-on-first-parent.js');
  x.facts[commit].pathsByParent.reverse();
  const result=auditAcceptance(x);
  assert.equal(result.accepted,true,'second-parent code differences do not disqualify the merge');
  const first=x.facts[commit].pathsByParent.find(diff=>diff.parent===x.facts[commit].parents[0]);
  assert.deepEqual(row(result,commit).pathsByParent,[first],'record only the checked first-parent diff');
  x.facts[commit].pathsByParent=[first];
  assert.equal(auditAcceptance(x).accepted,true,'second-parent evidence is not required');
});

test('historical-docs-only rejects a merge whose first-parent diff touches code',()=>{
  const {x,commit}=historicalDocsBaseline({merge:true});
  x.facts[commit].pathsByParent[1].paths.push('src/only-on-first-parent.js');
  assert.equal(auditAcceptance(x).accepted,true,'accepted first-parent baseline');
  // Includes code resolved in the merge: every non-docs path must equal parent 1.
  x.facts[commit].pathsByParent[0].paths.push('src/conflict-resolved.js');
  rejects(x,commit,/outside approved docs directories/);
});

test('historical-docs-only requires an unambiguous first-parent diff',()=>{
  for(const mutate of [
    f=>f.pathsByParent.shift(),
    f=>f.pathsByParent[1].parent=f.parents[0],
    f=>delete f.pathsByParent,
  ]){
    const y=historicalDocsBaseline({merge:true});mutate(y.x.facts[y.commit]);
    rejects(y.x,y.commit,/first.parent/);
  }
  const unchanged=historicalDocsBaseline({merge:true});
  unchanged.x.facts[unchanged.commit].pathsByParent[0].paths=[];
  assert.equal(auditAcceptance(unchanged.x).accepted,true,'an unchanged parent still has an explicit diff');
});

test('historical-docs-only requires the pinned policy and user approval provenance',()=>{
  for(const mutate of [
    x=>x.historicalDocsPolicy.approval.approvedBy='commit author',
    x=>x.historicalDocsPolicy.approval.date='2026-10-23',
    x=>x.historicalDocsPolicy.commits.push(sha(70)),
    x=>x.historicalDocsPolicy.commits[0]=approvedDocsCommit.slice(0,7),
    x=>x.historicalDocsPolicy.allowedPathPrefixes=['docs/'],
    x=>x.historicalDocsPolicy.parentComparison='any-parent',
    x=>x.manifest.historicalDocsOnlyPolicySha256='0'.repeat(64),
    x=>delete x.historicalDocsPolicy,
  ]){
    const {x,commit}=historicalDocsBaseline();mutate(x);rejects(x,commit,/unapproved historical-docs-only policy/);
  }
});

const implementationWip='d5fe295c9a6bb85dd46e969b34836e4715d2706b';
const designWip='35c81df7e5f556605b6b8493369cd54aa6108515';
const lowerBoundCommit='4693328af8a8f77c0d88b971752d426b644330a9';
const digestPolicy=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const wipPolicy=()=>JSON.parse(readFileSync(new URL('../../scripts/gate/acceptance-policy-1b1.json',import.meta.url))).wipEvidence??{};
function approvedWipFixture({docs=false,commit=docs?designWip:implementationWip,merge=false}={}) {
  const x=fixture({withWip:true});
  x.commits[x.commits.indexOf(wip)]=commit;
  x.facts[commit]=x.facts[wip];delete x.facts[wip];
  x.facts[candidate].parents=[commit,cutover];
  if(merge)x.facts[commit].parents=[cutover,sha(6)];
  const entry=x.manifest.commits.find(e=>e.commit===wip);entry.commit=commit;
  const record=x.records[entry.fast];record.commit=commit;record.recordedRetrospectively=true;
  entry.requiresRetrospectiveFast=true;
  x.wipEvidencePolicy=wipPolicy();x.manifest.wipEvidencePolicySha256=digestPolicy(x.wipEvidencePolicy);
  if(docs){
    entry.disposition='docs-only-wip';delete entry.fast;delete entry.requiresRetrospectiveFast;
    x.facts[commit].paths=['docs/superpowers/specs/design.md','docs/codesign/log.md'];
    x.facts[commit].pathsByParent=x.facts[commit].parents.map(parent=>({parent,paths:[...x.facts[commit].paths]}));
  }
  return {x,commit,entry,record};
}
function approvedWipBaseline(options){
  const f=approvedWipFixture(options);assert.equal(auditAcceptance(f.x).accepted,true,'approved round-9 WIP baseline');return f;
}

test('approved implementation WIP accepts retrospective fast checks alone and remains non-promotable',()=>{
  const {x,commit}=approvedWipFixture();const result=auditAcceptance(x);
  assert.equal(result.accepted,true);assert.equal(row(result,commit).state,'accounted-wip');
  assert.equal(row(result,commit).promotable,false);
});

test('a failing approved WIP re-run fails even without a contemporaneous requirement',()=>{
  for(const check of ['unit','build']) {
    const {x,commit,record}=approvedWipBaseline();record[check].state='failed';
    rejects(x,commit,/checks or cleanup did not pass/);
  }
});

test('the WIP-only retrospective approval is pinned and does not cover other SHAs or promotions',()=>{
  const {x,record,commit}=approvedWipBaseline();
  record.evidenceScope='wip-only';record.wipEvidencePolicySha256=x.manifest.wipEvidencePolicySha256;
  assert.equal(auditAcceptance(x).accepted,true);
  assert.equal(judgeFast(commit,record,x.facts[commit],hashes,null).state,'invalid','WIP evidence cannot be used as promotion fast evidence');
  for(const mutate of [
    f=>f.x.manifest.wipEvidencePolicySha256='0'.repeat(64),
    f=>{f.x.wipEvidencePolicy.implementationWipCommits.push(wip);f.x.manifest.wipEvidencePolicySha256=digestPolicy(f.x.wipEvidencePolicy);},
    f=>f.record.recordedRetrospectively=false,
    f=>f.record.recordedRetrospectively='true',
    f=>f.record.startedAt='invalid',
    f=>f.record.finishedAt='2026-10-21T12:00:00Z',
    f=>f.record.startedAt='1970-01-01T00:00:00Z',
  ]) {const f=approvedWipBaseline();mutate(f);assert.equal(auditAcceptance(f.x).accepted,false);}
  const unlisted=approvedWipFixture({commit:sha(99)});rejects(unlisted.x,unlisted.commit,/contemporaneous/);
});

test('approved docs-only WIP requires a descendant fully gated merge and remains non-promotable',()=>{
  const {x,commit}=approvedWipBaseline({docs:true});const result=auditAcceptance(x);
  assert.equal(row(result,commit).promotable,false);assert.equal(row(result,commit).state,'accounted-wip');
  for(const mutate of [
    f=>delete f.x.records[candidate],
    f=>f.x.facts[candidate].parents=[f.commit],
    f=>f.entry.boundary=cutover,
    f=>delete f.entry.boundary,
  ]){const f=approvedWipBaseline({docs:true});mutate(f);assert.equal(auditAcceptance(f.x).accepted,false);}
});

test('an unlisted docs-only WIP commit fails and cannot self-enroll or use a SHA prefix',()=>{
  const f=approvedWipBaseline({docs:true});
  for(const commit of [sha(99),designWip.slice(0,7)]){
    const other=approvedWipFixture({docs:true,commit});assert.equal(auditAcceptance(other.x).accepted,false);
  }
  f.x.wipEvidencePolicy.docsOnlyWipCommits.push(sha(99));f.x.manifest.wipEvidencePolicySha256=digestPolicy(f.x.wipEvidencePolicy);
  rejects(f.x,f.commit,/unapproved.*policy/);
});

test('docs-only WIP checks first-parent paths including code resolved in merges',()=>{
  const {x,commit}=approvedWipBaseline({docs:true,merge:true});
  x.facts[commit].pathsByParent[1].paths.push('src/second-parent.js');
  assert.equal(auditAcceptance(x).accepted,true);
  x.facts[commit].pathsByParent.reverse();assert.equal(auditAcceptance(x).accepted,true);
  for(const path of ['src/conflict-resolved.js','docs/reports/a.md','docs/superpowers-other/a.md']){
    const f=approvedWipBaseline({docs:true,merge:true});f.x.facts[f.commit].pathsByParent[0].paths.push(path);
    rejects(f.x,f.commit,/outside approved docs directories/);
  }
  x.facts[commit].pathsByParent=[];rejects(x,commit,/first.parent/);
});

test('the retrospective WIP recorder accepts only a pinned approved full SHA without a ledger',async()=>{
  const {parseFastOptions}=await import('../../scripts/record-fast-checks.mjs');
  let options,error;
  try{options=parseFastOptions(['--retrospective-wip','--expected-commit',implementationWip]);}catch(e){error=e;}
  assert.equal(error,undefined,'approved WIP recorder mode is available');
  assert.equal(options.retrospective,true);assert.equal(options.retrospectiveWip,true);
  for(const commit of [sha(99),implementationWip.slice(0,7),designWip,lowerBoundCommit]){
    assert.throws(()=>parseFastOptions(['--retrospective-wip','--expected-commit',commit]),/approved|full.SHA/);
  }
});

test('undated contemporaneous passes record commit time with the explicit lower-bound basis',async()=>{
  await fastLedgerFixture(async load=>{
    const recordedAt='2026-10-21T12:00:00.000Z',commit=lowerBoundCommit;
    const options={commit,recordedAt,wipEvidencePolicy:wipPolicy(),commitTimeFor:()=>Date.parse(recordedAt)/1000};
    const entry=(await load(`Promotion ${commit}: fast checks 873 + build.`,options)).get(commit);
    assert.equal(entry.timestampBasis,'commit-time-lower-bound');assert.equal(entry.recordedAt,recordedAt);
    await assert.rejects(load(`Promotion ${commit}: fast checks 873 + build.`,{...options,commitTimeFor:()=>Date.parse(recordedAt)/1000+1}),/commit time/);
    await assert.rejects(load(`Promotion ${commit}: fast checks 873 + build.`,{...options,commitTimeFor:undefined}),/commit time/);
  });
});
