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

test('B15-R23-Q1 the three subsequent B15 WIP commits have pinned recorder eligibility', async () => {
  const { parseFastOptions } = await import('../../scripts/record-fast-checks.mjs');
  for (const commit of ['3fb56c84523d0e3c85ac3bf6933b343889189bb5', '8a812be2669fbf461db5ec32f0e4f718606406b7', 'ac61cdd5ef3973d9d01a45d562d5c43976242a2c']) {
    assert.doesNotThrow(() => parseFastOptions(['--retrospective-wip', '--expected-commit', commit]));
    const { x } = approvedWipFixture({ commit });
    const result = row(auditAcceptance(x), commit);
    assert.equal(result.state, 'accounted-wip'); assert.equal(result.promotable, false);
    const entry = x.manifest.commits.find(e => e.commit === commit);
    x.records[entry.fast].wipEvidencePolicySha256 = '278c851cd93615e6c3763878b9c26f294c3f50bbdaa050bd31131bf2dbfe77ce';
    x.records[entry.fast].evidenceScope = 'wip-only';
    assert.equal(row(auditAcceptance(x), commit).state, 'unaccepted', 'old pins cannot enroll new SHAs');
  }
});

test('B15-R23-Q3 the failed round-14 WIP cannot be relabelled as passing WIP', () => {
  const { x, commit } = approvedWipFixture({ commit: '4ffda8835bee7c7a72949dffd7baf0aed352609c' });
  const result = row(auditAcceptance(x), commit);
  assert.equal(result.state, 'unaccepted');
  assert.equal(result.promotable, false);
  assert.equal(result.knownFailure.unit.cancelled, 1);
});

function round23ExceptionFixture() {
  const f = approvedWipFixture({ commit: '4ffda8835bee7c7a72949dffd7baf0aed352609c' });
  const { x, commit, entry, record } = f, known = x.wipEvidencePolicy.knownFailures.find(k => k.commit === commit);
  assert.ok(known, 'independently pinned Q3 policy exists');
  const child = known.firstPassingDescendant.commit;
  x.commits.splice(x.commits.indexOf(commit) + 1, 0, child);
  x.facts[child] = { tree: sha(91), parents: [commit], paths: ['tests/unit/repair.test.js'], committedAt: 102 };
  x.facts[candidate].parents = [child, cutover];
  const repaired = { ...structuredClone(record), commit: child, tree: x.facts[child].tree };
  x.records['repair-fast'] = repaired;
  x.manifest.commits.splice(2, 0, { commit: child, disposition: 'wip', boundary: candidate, fast: 'repair-fast' });
  record.unit = { state: 'failed', reason: 'failures: 1, cancelled: 1, exit: 1' };
  Object.assign(entry, { disposition: 'exception', exceptionId: 'B15-R23-Q3', promotable: false });
  x.manifest.historicalWipExceptionPins = { [commit]: digestPolicy(known) };
  x.historicalFailureEvidence = {
    [known.record.file]: { sha256: known.record.sha256, json: structuredClone(record) },
    [known.unitLog.file]: { sha256: known.unitLog.sha256, text: `${known.tests.map((name, i) => `not ok ${i + 1} - ${name}`).join('\n')}\n# tests 1088\n# pass 1086\n# fail 1\n# cancelled 1\n# skipped 0\n# todo 0\n` },
    [known.firstPassingDescendant.record.file]: { sha256: known.firstPassingDescendant.record.sha256, json: structuredClone(repaired) },
  };
  return { ...f, known, child };
}

test('B15-R23-Q3 exact failed and cancelled evidence is accepted only with a gated repair boundary', () => {
  const { x, commit, known } = round23ExceptionFixture();
  const result = auditAcceptance(x), failed = row(result, commit);
  assert.equal(result.accepted, true, JSON.stringify(result.rows));
  assert.equal(failed.state, 'accepted-by-exception'); assert.equal(failed.promotable, false);
  assert.equal(failed.knownFailure.unit.failed, 1); assert.equal(failed.knownFailure.unit.cancelled, 1);
  assert.equal(failed.failureEvidence.record.unit.state, 'failed');
  assert.equal(failed.exceptionPolicySha256, digestPolicy(known));
  assert.equal(failed.containment.boundary, candidate);
});

test('B15-R23-Q3 exception rejects missing pins contradictory evidence and unrepaired boundaries', () => {
  for (const mutate of [
    f => delete f.x.manifest.historicalWipExceptionPins,
    f => f.x.manifest.historicalWipExceptionPins[f.commit] = '0'.repeat(64),
    f => f.x.manifest.wipEvidencePolicySha256 = '0'.repeat(64),
    f => f.known.rule += ' unapproved change',
    f => f.entry.exceptionId = 'B15-P17-2',
    f => f.entry.promotable = true,
    f => f.entry.disposition = 'wip',
    f => { f.entry.disposition = 'feature-gated'; f.entry.gate = candidate; },
    f => delete f.x.historicalFailureEvidence[f.known.unitLog.file],
    f => f.x.historicalFailureEvidence[f.known.record.file].sha256 = '0'.repeat(64),
    f => f.x.historicalFailureEvidence[f.known.record.file].json.unit.state = 'passed',
    f => f.x.historicalFailureEvidence[f.known.unitLog.file].text = f.x.historicalFailureEvidence[f.known.unitLog.file].text.replace('# cancelled 1', '# cancelled 0'),
    f => f.x.historicalFailureEvidence[f.known.firstPassingDescendant.record.file].json.build.state = 'failed',
    f => f.x.facts[f.child].parents = [cutover],
    f => delete f.entry.boundary,
    f => f.entry.boundary = f.commit,
    f => f.x.records[candidate].results.unit.state = 'failed',
    f => f.x.manifest.commits.find(e => e.commit === candidate).reviewedCandidate = f.commit,
    f => f.x.facts[candidate].parents = [f.commit, cutover],
    f => f.x.facts[promotion].parents = [cutover, f.commit],
    f => f.x.manifest.commits.find(e => e.commit === promotion).candidate = f.commit,
  ]) {
    const f = round23ExceptionFixture(); mutate(f);
    assert.equal(row(auditAcceptance(f.x), f.commit).state, 'unaccepted', String(mutate));
  }
});

test('B15-R23-Q1 prior passing records remain scoped and Q3 cannot use the passing WIP recorder', async () => {
  const { parseFastOptions } = await import('../../scripts/record-fast-checks.mjs');
  const { x, record } = approvedWipFixture({ commit: 'b4ffb02ef0d148f8e1f9b8020a79fc559ffb97f7' });
  record.evidenceScope = 'wip-only';
  record.wipEvidencePolicySha256 = '278c851cd93615e6c3763878b9c26f294c3f50bbdaa050bd31131bf2dbfe77ce';
  assert.equal(auditAcceptance(x).accepted, true);
  for (const commit of ['4ffda8835bee7c7a72949dffd7baf0aed352609c', sha(99)])
    assert.throws(() => parseFastOptions(['--retrospective-wip', '--expected-commit', commit]), /approved/);
});

test('B15-R16-F7 post-cutover B15 WIP and eligible docs have pinned retrospective classes', async () => {
  const { parseFastOptions } = await import('../../scripts/record-fast-checks.mjs');
  for (const commit of [
    '440e09a4c9eb161563ae493e4f159706461a9da5', '50b882dde81b6a5d5c0cb1dc7503950ed905a73d',
    '694e8f97abc86057ea1ba6f24502cbfd552109c9', 'a049262b44b6fa91b3229b98bddf1e9eb039fdef',
    'f350f13a65b7b2fae463a96aad1c10867337c41a', '8d694468385a77e2a16b716a3ee5b12e415c5677',
  ]) {
    assert.doesNotThrow(() => parseFastOptions(['--retrospective-wip', '--expected-commit', commit]));
    const { x } = approvedWipFixture({ commit });
    assert.equal(auditAcceptance(x).accepted, true, commit);
    assert.equal(row(auditAcceptance(x), commit).promotable, false);
  }
  for (const commit of [
    '27dc54536b5769c549de1c0b8deebdbfa76aa02e', '547a648af5b06fd9afaf4c1d8dfbb2c0d994c975',
    '5227ea36e6728da9c322db8a3a7d728efa38c847', 'beae4086be8f6244a30bd0039e74b5fcfd9971d6',
  ]) {
    const { x } = approvedWipFixture({ docs: true, commit });
    assert.equal(auditAcceptance(x).accepted, true, commit);
    x.facts[commit].pathsByParent[0].paths.push('AGENTS.md.bak');
    rejects(x, commit, /outside approved docs directories/);
  }
  const excluded = '2f91343fe82e08a915b7de81bfd87c46baa0e35c';
  assert.throws(() => parseFastOptions(['--retrospective-wip', '--expected-commit', excluded]), /approved/);
  const protocol = '4bba5c39f0d01ab5d2999390c1d2abfd79b6caf5';
  assert.equal(wipPolicy().docsOnlyWipCommits.includes(protocol), true);
  const { x } = approvedWipFixture({ docs: true, commit: protocol });
  assert.equal(auditAcceptance(x).accepted, true);
});

test('B15-R16-F7 prior typed WIP records keep only their original eligible SHA scope', () => {
  const { x, record, commit } = approvedWipFixture();
  record.evidenceScope = 'wip-only';
  record.wipEvidencePolicySha256 = '432605cffc42acb7d6e34623f19a4f4540863bc59934b68a018c7664e177b4cd';
  assert.equal(auditAcceptance(x).accepted, true, 'existing passing typed evidence survives the policy extension');
  for (const target of ['440e09a4c9eb161563ae493e4f159706461a9da5', '2f91343fe82e08a915b7de81bfd87c46baa0e35c']) {
    const newer = approvedWipFixture({ commit: target });
    Object.assign(newer.record, { evidenceScope: record.evidenceScope, wipEvidencePolicySha256: record.wipEvidencePolicySha256 });
    assert.equal(auditAcceptance(newer.x).accepted, false);
  }
  record.unit.state = 'failed';
  rejects(x, commit, /checks or cleanup did not pass/);
});
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

test('R16-C6 docs-only WIP admits exact protocol paths without admitting lookalikes or code', () => {
  const commit = '4bba5c39f0d01ab5d2999390c1d2abfd79b6caf5';
  const { x } = approvedWipFixture({ docs: true, commit });
  x.facts[commit].pathsByParent[0].paths = ['AGENTS.md', 'CLAUDE.md'];
  assert.equal(auditAcceptance(x).accepted, true);
  assert.equal(row(auditAcceptance(x), commit).promotable, false);
  for (const path of ['AGENTS.md.bak', 'CLAUDE.md/x', 'nested/AGENTS.md', 'README.md', 'scripts/gate/acceptance.mjs']) {
    x.facts[commit].pathsByParent[0].paths = ['AGENTS.md', path];
    rejects(x, commit, /outside approved docs/);
  }
});

test('R16-C7 known failure retains named tests and repair provenance and cannot be relabelled passed', () => {
  const commit = '2f91343fe82e08a915b7de81bfd87c46baa0e35c';
  const { x, entry, record } = approvedWipFixture({ commit });
  record.unit = { state: 'failed', reason: 'failures: 2, cancelled: 0, exit: 1' };
  let result = row(auditAcceptance(x), commit);
  assert.equal(result.state, 'unaccepted');
  assert.equal(result.promotable, false);
  assert.equal(result.knownFailure?.tests.length, 2);
  assert.equal(result.knownFailure?.firstPassingDescendant.commit, 'd7cf20dd35b43e0f01a52ef09293dd1dacc03c0e');
  // Neither a replacement passing record nor a manifest disposition can erase history.
  record.unit.state = 'passed';
  assert.equal(row(auditAcceptance(x), commit).state, 'unaccepted');
  entry.disposition = 'merge-gated'; entry.gate = 'fabricated-pass';
  x.records[entry.gate] = { ...x.records[x.manifest.commits.find(e => e.commit === candidate).gate], commit };
  result = row(auditAcceptance(x), commit);
  assert.equal(result.state, 'unaccepted'); assert.equal(result.knownFailure.tests.length, 2);
});

function historicalExceptionFixture() {
  const f = approvedWipFixture({ commit: '2f91343fe82e08a915b7de81bfd87c46baa0e35c' });
  const { x, commit, entry, record } = f, known = x.wipEvidencePolicy.knownFailures[0];
  const child = known.firstPassingDescendant.commit, boundary = known.containment.featureBoundary, promoted = known.containment.promotion;
  const rename = value => JSON.parse(JSON.stringify(value).replaceAll(candidate, boundary).replaceAll(promotion, promoted));
  x.facts = rename(x.facts); x.records = rename(x.records); x.commits = rename(x.commits); x.manifest = rename(x.manifest);
  x.isAncestor = (a, b, seen = new Set()) => a === b || !seen.has(b) && (seen.add(b), (x.facts[b]?.parents ?? []).some(p => x.isAncestor(a, p, seen)));
  x.commits.splice(x.commits.indexOf(commit) + 1, 0, child);
  x.facts[child] = { tree: sha(91), parents: [commit], paths: ['tests/unit/repair.test.js'], committedAt: 102 };
  x.facts[boundary].parents = [child, cutover];
  x.facts[boundary].tree = x.facts[promoted].tree = known.containment.tree;
  const promote = x.manifest.commits.find(e => e.commit === promoted);
  promote.tree = promote.candidateTree = known.containment.tree;
  x.records[promote.fast].tree = known.containment.tree;
  const repaired = { ...structuredClone(record), commit: child, tree: x.facts[child].tree };
  x.records['repair-fast'] = repaired;
  x.manifest.commits.splice(2, 0, { commit: child, disposition: 'wip', boundary, fast: 'repair-fast' });
  const failed = x.records[entry.fast]; failed.unit = { state: 'failed', reason: 'failures: 2, cancelled: 0, exit: 1' };
  const exception = x.manifest.commits.find(e => e.commit === commit);
  Object.assign(exception, { disposition: 'exception', exceptionId: 'B15-P17-2', promotable: false });
  x.manifest.historicalWipExceptionSha256 = digestPolicy(known);
  x.historicalFailureEvidence = {
    [known.record.file]: { sha256: known.record.sha256, json: structuredClone(failed) },
    [known.unitLog.file]: { sha256: known.unitLog.sha256, text: `${known.tests.map((name, i) => `not ok ${i + 1} - ${name}`).join('\n')}\n# tests 758\n# pass 756\n# fail 2\n# cancelled 0\n# skipped 0\n# todo 0\n` },
    [known.firstPassingDescendant.record.file]: { sha256: known.firstPassingDescendant.record.sha256, json: structuredClone(repaired) },
    [known.containment.gate.file]: { sha256: known.containment.gate.sha256, json: structuredClone(x.records[boundary]) },
  };
  return { x, commit, known, exception, child, boundary, promoted };
}

test('B15-P17-2 pinned historical failure is accepted only by exception and never promotable', () => {
  const { x, commit } = historicalExceptionFixture(), result = auditAcceptance(x), failed = row(result, commit);
  assert.equal(failed.state, 'accepted-by-exception');
  assert.equal(result.accepted, true);
  assert.equal(failed.disposition, 'exception'); assert.equal(failed.promotable, false);
  assert.equal(failed.knownFailure.unit.state, 'failed'); assert.equal(failed.knownFailure.tests.length, 2);
  assert.equal(failed.failureEvidence.record.unit.state, 'failed');
  assert.equal(failed.failureEvidence.record.startedAt, x.records[x.manifest.commits.find(e => e.commit === commit).fast].startedAt);
});

test('B15-P17-2 exception fails closed on missing pins evidence repair or containment', () => {
  const mutations = [
    f => delete f.x.manifest.historicalWipExceptionSha256,
    f => f.x.manifest.historicalWipExceptionSha256 = '0'.repeat(64),
    f => f.x.manifest.wipEvidencePolicySha256 = '0'.repeat(64),
    f => f.known.rule += ' self-enrollment',
    f => f.exception.exceptionId = 'another-exception',
    f => f.exception.promotable = true,
    f => f.exception.disposition = 'wip',
    f => { f.exception.disposition = 'feature-gated'; f.exception.gate = f.boundary; },
    f => delete f.x.historicalFailureEvidence[f.known.unitLog.file],
    f => f.x.historicalFailureEvidence[f.known.record.file].sha256 = '0'.repeat(64),
    f => f.x.historicalFailureEvidence[f.known.record.file].json.unit.state = 'passed',
    f => f.x.historicalFailureEvidence[f.known.record.file].json.tree = sha(99),
    f => f.x.historicalFailureEvidence[f.known.record.file].json.finishedAt = 'invalid',
    f => f.x.historicalFailureEvidence[f.known.unitLog.file].text = '# tests 758\n# pass 758\n# fail 0\n',
    f => f.x.historicalFailureEvidence[f.known.firstPassingDescendant.record.file].json.build.state = 'failed',
    f => f.x.historicalFailureEvidence[f.known.containment.gate.file].json.results.unit.state = 'failed',
    f => f.x.facts[f.child].parents = [cutover],
    f => f.x.facts[f.boundary].parents = [f.commit, cutover],
    f => f.x.facts[f.promoted].tree = sha(99),
    f => f.x.manifest.commits.find(e => e.commit === f.promoted).candidate = f.commit,
    f => f.x.records[f.x.manifest.commits.find(e => e.commit === f.promoted).fast].unit.state = 'failed',
  ];
  for (const mutate of mutations) {
    const f = historicalExceptionFixture(); mutate(f);
    assert.equal(row(auditAcceptance(f.x), f.commit).state, 'unaccepted', String(mutate));
  }
});

test('B15-P17-2 evidence reader hashes actual bytes and preserves missing and corrupt inputs', async () => {
  const { readHistoricalFailureEvidence } = await import('../../scripts/audit-gates-1b1.mjs');
  const policy = wipPolicy(), known = policy.knownFailures[0], json = Buffer.from('{"unit":{"state":"failed"}}\n');
  const evidence = await readHistoricalFailureEvidence(policy, async file => {
    if (file === known.firstPassingDescendant.record.file) throw Error('missing');
    if (file === known.containment.gate.file) return Buffer.from('invalid JSON');
    return file === known.unitLog.file ? Buffer.from('not ok 1 - original failure\n') : json;
  });
  assert.equal(evidence[known.record.file].sha256, createHash('sha256').update(json).digest('hex'));
  assert.notEqual(evidence[known.record.file].sha256, known.record.sha256, 'the reader cannot attest the policy hash without checking bytes');
  assert.equal(evidence[known.record.file].json.unit.state, 'failed');
  assert.match(evidence[known.unitLog.file].text, /original failure/);
  assert.match(evidence[known.firstPassingDescendant.record.file].error, /missing/);
  assert.ok(evidence[known.containment.gate.file].error);
});

const round25WipCommits = [
  'a593d97dcc2160884adcf78e27a4bd800faf1bea',
  'cdd2a2514af18e7618b36c631b115144d3570cdf',
  'b7b3664d6f437b4eadc4818157d1cc79e144a6b2',
];
const round23PolicyPin = '4c21f98da7f850710b488352e6b3fac5a98a23135e0b7281148e91b88525f404';

test('B15-R25 the three final B15 WIP commits have pinned non-promotable eligibility', async () => {
  const { parseFastOptions } = await import('../../scripts/record-fast-checks.mjs');
  const { WIP_EVIDENCE_POLICY_SHA256 } = await import('../../scripts/gate/acceptance.mjs');
  for (const commit of round25WipCommits) {
    assert.doesNotThrow(() => parseFastOptions(['--retrospective-wip', '--expected-commit', commit]), commit);
    const { x, record } = approvedWipFixture({ commit });
    record.evidenceScope = 'wip-only'; record.wipEvidencePolicySha256 = WIP_EVIDENCE_POLICY_SHA256;
    assert.equal(auditAcceptance(x).accepted, true);
    assert.equal(row(auditAcceptance(x), commit).state, 'accounted-wip');
    assert.equal(row(auditAcceptance(x), commit).promotable, false);
    assert.equal(judgeFast(commit, record, x.facts[commit], hashes, null).state, 'invalid', 'WIP-only evidence never substitutes for promotion evidence');
    record.wipEvidencePolicySha256 = round23PolicyPin;
    rejects(x, commit, /WIP.*policy pin/, 'the old policy cannot enroll these SHAs');
    assert.throws(() => parseFastOptions(['--retrospective-wip', '--expected-commit', commit.slice(0, 7)]), /approved/);
  }
  const policy = wipPolicy(), amendment = policy.amendments.find(a => a.id === 'B15-R25');
  assert.deepEqual(amendment.addedImplementationWipCommits, round25WipCommits);
  assert.deepEqual(amendment.decidedBy, ['Claude', 'Codex']);
  assert.match(amendment.authority, /delegation.*user informed/i);
  assert.match(amendment.source, /progress\.md/);
  assert.equal(digestPolicy(policy), WIP_EVIDENCE_POLICY_SHA256);
  const seed = JSON.parse(readFileSync(new URL('../../docs/reports/project1b/acceptance-manifest-v1.json', import.meta.url)));
  assert.equal(seed.wipEvidencePolicySha256, WIP_EVIDENCE_POLICY_SHA256);
});

test('B15-R25 prior policy records retain exactly their old SHA scope and failures stay excluded', async () => {
  const policy = wipPolicy(), prior = policy.priorImplementationRecordPolicies.find(p => p.sha256 === round23PolicyPin);
  assert.ok(prior, 'preserve the existing round-23 record pin when extending the policy');
  assert.equal(prior.commits.length, 43);
  assert.deepEqual(prior.commits, policy.implementationWipCommits.filter(c => !round25WipCommits.includes(c)));
  for (const commit of prior.commits) {
    const { x, record } = approvedWipFixture({ commit });
    record.evidenceScope = 'wip-only'; record.wipEvidencePolicySha256 = round23PolicyPin;
    assert.equal(auditAcceptance(x).accepted, true, commit);
    record.unit.state = 'failed'; rejects(x, commit, /checks or cleanup did not pass/);
  }
  const { parseFastOptions } = await import('../../scripts/record-fast-checks.mjs');
  for (const commit of ['2f91343fe82e08a915b7de81bfd87c46baa0e35c', '4ffda8835bee7c7a72949dffd7baf0aed352609c', sha(99)])
    assert.throws(() => parseFastOptions(['--retrospective-wip', '--expected-commit', commit]), /approved/);
  for (const commit of round25WipCommits) for (const mutate of [
    f => { f.record.build.state = 'failed'; },
    f => { f.record.cleanBefore = false; },
    f => { f.record.startedAt = 'invalid'; },
    f => { delete f.x.records[candidate]; },
  ]) {
    const f = approvedWipFixture({ commit }); mutate(f);
    assert.equal(auditAcceptance(f.x).accepted, false, 'enrollment preserves exact-commit checks and the full boundary gate');
  }
});
