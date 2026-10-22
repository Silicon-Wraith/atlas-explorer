import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleAbsolute } from '../support/timing.mjs';
import { classifyAttempt, classifyTrials } from '../space-performance.mjs';

test('waits are rounded up and scheduled against absolute targets', async () => {
  let now = 0; const waits = [], called = [];
  const result = await scheduleAbsolute({ clock: () => now, setTimer(fn, delay) { waits.push(delay); now += delay; queueMicrotask(fn); } }, [0.1, 2.2, 5.1], (_, index) => { called.push(index); now += 0.4; });
  assert.deepEqual(waits, [1, 1, 3]);
  assert.deepEqual(called, [0, 1, 2]);
  assert.equal(result.invalidated, false);
  assert.equal(result.lateByMs.length, 3);
});

test('a late issuance is recorded as a timing anomaly and an established application failure stays failed', async () => {
  let now = 0;
  const timing = await scheduleAbsolute({ clock: () => now, setTimer(fn, ms) { now += ms + 6; queueMicrotask(fn); } }, [10], () => {});
  assert.equal(timing.invalidated, true);
  assert.equal(classifyAttempt({ timing, applicationFailure: 'draft cadence below 30/s' }).state, 'failed');
  assert.equal(classifyAttempt({ timing }).state, 'inconclusive');
  assert.equal(classifyAttempt({ timing, harnessFailure: { demonstrated: true, evidence: 'injected harness-only timer failure' } }).state, 'excluded');
});

test('three passing trials cannot rescue an earlier application failure accompanied by late issuance', () => {
  const passing = { complete: true, coverage: true, targets: [{ passed: true }], timing: { invalidated: false } };
  const failure = { ...passing, applicationFailure: 'settled target exceeded', timing: { invalidated: true } };
  assert.equal(classifyTrials([failure, passing, passing, passing]).state, 'failed');
  assert.equal(classifyTrials([passing, passing]).state, 'inconclusive');
  assert.equal(classifyTrials([passing, passing, passing]).state, 'passed');
});

function trialFixture() {
  const quality={profile:'draft',internalSize:{width:1,height:1},iteration:{maxIterations:128},tracing:{maxSteps:512},lighting:{stage:'full'}};
  const trial={requests:[],publications:[],presentations:[],reports:[],issued:Array.from({length:40},(_,index)=>({phase:'stress',index})),longTasks:[],observerError:null,phases:{orbit:{start:0,end:30000},interaction:{start:31000,end:55000},stress:{start:55001,end:65001}}};
  const add=(id,phase,createdAt,publishedAt,profile='draft')=>{
    const identity={requestId:id},q={...quality,profile};trial.requests.push({identity,phase,createdAt,quality:q});
    const rayTermination={hit:1,miss:0,numericalFailure:0,unresolved:{pointBudget:0,estimateUnavailable:0,rayStepBudget:0,stagnation:{rayParameter:0,fieldCoordinate:0}}};
    trial.publications.push({identity,requestId:id,kind:profile==='draft'?'draft':'settled-first',quality:q,internalSize:q.internalSize,rayTermination,publishedAt,samples:1});
    trial.reports.push({requestId:id,outcome:'completed',completed:{width:1,height:1,samples:1,lighting:{stage:'full'}},observedAt:publishedAt+1,timings:{completed:publishedAt-createdAt+1,readback:2,published:publishedAt-createdAt}});
  };
  for(let i=0;i<900;i++)add('d'+i,'orbit',i*30,i*30+10);
  add('settled','orbit',29984,30020,'settled');
  trial.publications.push({...trial.publications.at(-1),kind:'refinement',samples:8,publishedAt:30080});trial.reports.at(-1).completed.samples=8;trial.reports.at(-1).observedAt=30090;
  add('interaction','interaction',31000,31050);
  for(let i=0;i<39;i++)add('s'+i,'stress',55001+i*250,55030+i*250,'settled');
  const workload={workloads:{orbit:{durationMs:30000},stress:{editRule:{count:40}}},targets:{completedDraftsPerSecondMin:30,consecutiveDraftIntervalP95Ms:50,interactionP95Ms:100,stressReplacementMs:250,applicationMainThreadTaskMaxMs:50,firstSettledImageMs:2000}};
  return {trial,workload};
}
test('P3 permits superseded stress edits and reports maximum published replacement latency', async()=>{
  const {measureAttempt}=await import('../space-performance.mjs');const {trial,workload}=trialFixture();
  const result=measureAttempt(trial,workload);
  assert.equal(result.targets.find(t=>t.name==='P3 stress replacement').passed,true);
  assert.equal(result.metrics.supersededStressInputs,1);assert.equal(result.metrics.stressMaxMs,29);
});
test('P3 requires completed full quality before interaction and reports completion readback and settled contention separately', async()=>{
  const {measureAttempt}=await import('../space-performance.mjs');const {trial,workload}=trialFixture();
  let result=measureAttempt(trial,workload);assert.equal(result.applicationFailure,null);
  assert.equal(result.metrics.completedDrafts,900);assert.equal(result.metrics.completedDraftDurationsMs[0],11);assert.equal(result.metrics.readbacks.length,941);
  trial.publications.find(p=>p.kind==='refinement').publishedAt=32000;
  result=measureAttempt(trial,workload);assert.match(result.applicationFailure,/full quality.*before interaction/);
  trial.publications=trial.publications.filter(p=>p.kind!=='refinement');assert.match(measureAttempt(trial,workload).applicationFailure,/full quality/);
});
test('checkpoint failures always persist classification and failed targets skip replay',async()=>{
  const {finishAttemptEvidence}=await import('../space-performance.mjs');let calls=0,persisted;
  const failed={complete:true,targets:[{passed:false}]};await finishAttemptEvidence(failed,async()=>calls++,async()=>{persisted=structuredClone(failed);});
  assert.equal(calls,0);assert.equal(persisted.classification.state,'failed');
  const missing={complete:true,targets:[{passed:true}]};await finishAttemptEvidence(missing,async()=>{throw Error('checkpoint timeout');},async()=>{persisted=structuredClone(missing);});
  assert.equal(persisted.classification.state,'inconclusive');assert.match(persisted.coverageError,/checkpoint timeout/);
});

test('cold prewarm acceptance requires first operation empty isolated caches all pipelines and the time bound', async()=>{
  const {assessColdPrewarm}=await import('../support/space-prewarm.mjs');
  const make=()=>({cache:{verifiedEmptyBeforeLaunch:true},firstOperation:'product-prewarm',preparationMs:123,boundMs:60000,required:['trace','shade'],prepared:['trace','shade'],uncaptured:[],outcome:'completed'});
  assert.equal(assessColdPrewarm(make()).passed,true);
  for(const change of [x=>x.firstOperation='render',x=>x.cache=null,x=>x.prepared.pop(),x=>x.preparationMs=60001,x=>x.uncaptured.push('GPU error')]){const x=make();change(x);assert.equal(assessColdPrewarm(x).passed,false);}
});

test('B15-REC-G P3 measurement excludes a pending draft confirmed beyond the orbit window and still checks report throughput',async()=>{
  const {measureAttempt}=await import('../space-performance.mjs'),{trial,workload}=trialFixture();
  const first=trial.publications[0],counts=first.rayTermination;
  Object.assign(first,{frameId:'late-frame',diagnosticsState:'pending',eligible:true,presentationSubmittedAt:first.publishedAt,rayTermination:null});
  trial.publicationUpdates=[{frameId:first.frameId,identity:first.identity,diagnosticsState:'confirmed',observedAt:30001,confirmationAt:30001,acceptanceAt:30001,historical:true,rayTermination:counts,completion:{outcome:'completed',queueCompletedAt:20}}];
  trial.reports[0].observedAt=30002;
  const result=measureAttempt(trial,workload);
  assert.equal(result.applicationFailure,null);assert.equal(result.metrics.drafts,899);assert.equal(result.metrics.completedDrafts,899);
  assert.equal(result.targets[0].passed,false);assert.equal(first.rayTermination,null);
  trial.publicationUpdates=[];
  assert.match(measureAttempt(trial,workload).applicationFailure,/missing diagnostic confirmation/);
});
