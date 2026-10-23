import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { scheduleAbsolute } from '../support/timing.mjs';
import { classifyAttempt, classifyTrials, createPerformanceAttempt, startAttempt, capturePerformanceAttempt, timedCamera, timedStress } from '../space-performance.mjs';
import { assessPerformanceTiming } from '../support/performance-timing.mjs';
import { passingPerformanceAttempt, frozenPerformanceWorkload } from '../support/performance-trial-fixture.mjs';

test('B15-P21-1 three anomalies above 4 ms through exactly 8 ms are tolerated across the whole attempt', () => {
  const attempt = passingPerformanceAttempt({ 'orbit:0': 4.1, 'interaction:1': 4.1, 'stress:0': 8 });
  assert.equal(attempt.trial.issued.length, 2315);
  assert.equal(attempt.timing.invalidated, true, 'the strict timer still reports an anomaly');
  assert.equal(classifyAttempt(attempt).state, 'passed');
});

test('B15-P21-1 a fourth anomaly across phases is inconclusive even with a clean cached summary', () => {
  const attempt = passingPerformanceAttempt({ 'orbit:0': 4.1, 'orbit:1': 4.1, 'interaction:1': 4.1, 'stress:0': 4.1 });
  attempt.timing.invalidated = false;
  assert.equal(classifyAttempt(attempt).state, 'inconclusive', 'derive the shared allowance from raw inputs');
});

test('B15-P21-1 one issuance above 8 ms is inconclusive without rounding or an epsilon', () => {
  const attempt = passingPerformanceAttempt({ 'orbit:0': 8.0001 });
  attempt.timing.invalidated = false;
  assert.equal(classifyAttempt(attempt).state, 'inconclusive');
});

test('B15-P21-1 exactly 4 ms is not an anomaly and exactly 8 ms is tolerated', () => {
  const attempt = passingPerformanceAttempt({ 'orbit:0': 4, 'orbit:1': 4, 'orbit:2': 4, 'orbit:3': 4, 'interaction:1': 4.0001, 'interaction:2': 4.1, 'stress:0': 8 });
  assert.equal(classifyAttempt(attempt).state, 'passed');
  assert.equal(assessPerformanceTiming(attempt.trial).lateOver4Count, 3);
});

test('B15-P21-1 missing duplicate malformed early and retargeted input observations cannot pass', () => {
  for (const mutate of [
    t => t.issued.pop(),
    t => t.issued[1] = { ...t.issued[0] },
    t => t.issued[0].issuedAt = NaN,
    t => { t.issued[0].issuedAt--; t.issued[0].lateByMs = 0; },
    t => { t.issued[0].target++; t.issued[0].issuedAt++; },
    t => t.issued[0].lateByMs = 1,
    t => delete t.issued,
    t => delete t.phases.orbit,
  ]) {
    const attempt = passingPerformanceAttempt(); mutate(attempt.trial);
    assert.equal(classifyAttempt(attempt).state, 'inconclusive', String(mutate));
  }
});

test('B15-P21-1 old record versions and timing policies cannot pass or pool with fresh trials', () => {
  const passing = passingPerformanceAttempt();
  for (const mutate of [
    a => a.schemaVersion = 4,
    a => delete a.schemaVersion,
    a => delete a.measurement.timingPolicy,
    a => a.measurement.timingPolicy = 'strict-over-4-ms',
    a => delete a.trial.measurement.timingPolicy,
  ]) {
    const legacy = structuredClone(passing); mutate(legacy);
    assert.equal(classifyAttempt(legacy).state, 'inconclusive');
    assert.equal(classifyTrials([passing, passing, passing, legacy]).state, 'inconclusive');
    legacy.applicationFailure = 'cadence below target';
    assert.equal(classifyTrials([passing, passing, passing, legacy]).state, 'failed');
  }
});

test('B15-P21-1 version and policy are recorded before work starts', () => {
  const attempt = createPerformanceAttempt(1);
  assert.equal(attempt.schemaVersion, 5);
  assert.equal(attempt.measurement.timingPolicy, 'atlas.p3-timing-budget-v1');
});

test('B15-P21-1 capture persists all raw timestamps and both strict and policy timing verdicts', async () => {
  const attempt = passingPerformanceAttempt({ 'orbit:0': 4.1, 'interaction:1': 4.1, 'stress:0': 8 });
  const trial = structuredClone(attempt.trial);
  let saved;
  await capturePerformanceAttempt(attempt, async () => {}, async () => trial, {
    startMonitor: () => ({ stop: async () => ({ raw: '', errors: [], cleanup: { state: 'confirmed' } }) }),
    persist: async () => { saved = JSON.parse(JSON.stringify(attempt)); },
  });
  assert.deepEqual(saved.trial.issued, trial.issued, 'no timestamp correction or sample removal');
  assert.equal(saved.timing.expectedInputCount, 2315);
  assert.equal(saved.timing.observedInputCount, 2315);
  assert.equal(saved.timing.lateOver4Count, 3);
  assert.equal(saved.timing.maxLateByMs, 8);
  assert.equal(saved.timing.strictInvalidated, true);
  assert.equal(saved.timing.policyInvalidated, false);
});

test('B15-P21-1 application and demonstrated harness failures retain precedence over timing', () => {
  const attempt = passingPerformanceAttempt({ 'orbit:0': 9 });
  attempt.harnessFailure = { demonstrated: true, evidence: 'injected harness timer fault' };
  assert.equal(classifyAttempt(attempt).state, 'excluded');
  attempt.applicationFailure = 'application terminal failure';
  assert.equal(classifyAttempt(attempt).state, 'failed');
  delete attempt.applicationFailure;
  attempt.targets = [{ passed: false }];
  assert.equal(classifyAttempt(attempt).state, 'failed');
  assert.equal(classifyTrials([attempt, passingPerformanceAttempt(), passingPerformanceAttempt(), passingPerformanceAttempt()]).state, 'failed');
});

test('B15-P21-1 policy schedule matches every materialized frozen scene', () => {
  for (const scene of frozenPerformanceWorkload.scenes) {
    const attempt = passingPerformanceAttempt({}, scene.id);
    assert.equal(classifyAttempt(attempt).state, 'passed', scene.id);
    assert.deepEqual(assessPerformanceTiming(attempt.trial), {
      timingPolicy: 'atlas.p3-timing-budget-v1', expectedInputCount: 2315, observedInputCount: 2315,
      lateOver4Count: 0, maxLateByMs: 0, strictInvalidated: false, policyInvalidated: false, evidenceError: null, rearms: 0,
    });
  }
});

test('B15-P21-1 the serialized page collectors preserve all 2315 raw input observations', async () => {
  let now = 1000;
  const raw = [], measurement = createPerformanceAttempt(1).measurement;
  const context = { measurement, performance: { timeOrigin: 100000, now: () => now }, setTimeout,
    atlas: { space: { ...Object.fromEntries(['onRequest', 'onPublish', 'onPublicationUpdate', 'onPresent', 'onReport'].map(name => [name, () => () => {}])),
      requestCamera() {}, editParameter() { return { ok: true }; } } },
    __p3Schedule: async (_clock, targets, callback) => {
      const timing = { rearms: 0, lateByMs: [], invalidated: false };
      for (const [index, target] of targets.entries()) {
        const late = targets.length > 1 && index === 0 ? (context.__p3.phase === 'stress' ? 8 : 4.1) : 0;
        now = target + late;
        const time = { target, issuedAt: now, lateByMs: now - target };
        if (targets.length > 1) raw.push({ phase: context.__p3.phase, index: context.__p3.phase === 'interaction' ? index + 1 : index, ...time });
        timing.lateByMs.push(time.lateByMs); timing.invalidated ||= time.lateByMs > 4;
        callback(time, index);
      }
      return timing;
    },
  };
  runInNewContext(`(${startAttempt.toString()})(measurement)`, context);
  for (const phase of ['orbit', 'interaction']) {
    context.input = { phase, poses: frozenPerformanceWorkload.workloads[phase].cameraPoses.bulb };
    await runInNewContext(`(${timedCamera.toString()})(input)`, context);
    now += 1000;
  }
  const stress = frozenPerformanceWorkload.workloads.stress;
  context.input = { ...stress.editRule, durationMs: stress.durationMs, alternation: stress.alternations.bulb };
  await runInNewContext(`(${timedStress.toString()})(input)`, context);
  const trial = JSON.parse(JSON.stringify(context.__p3));
  assert.deepEqual(trial.issued, raw);
  assert.equal(trial.issued.length, 2315);
  assert.ok(trial.timings.every(t => t.invalidated), 'each phase retains the strict helper verdict');
  assert.equal(assessPerformanceTiming(trial).policyInvalidated, false);
  assert.equal(assessPerformanceTiming(trial).lateOver4Count, 3);
});

test('B15-P21-1 partial collection preserves raw anomalies but remains non-accepting', async () => {
  const attempt = passingPerformanceAttempt({ 'orbit:0': 9 });
  attempt.trial.issued = attempt.trial.issued.slice(0, 10);
  let persisted;
  await capturePerformanceAttempt(attempt, async () => { throw Error('incomplete workload'); }, async () => attempt.trial, {
    startMonitor: () => ({ stop: async () => ({ raw: '', errors: [], cleanup: { state: 'confirmed' } }) }),
    persist: async () => { persisted = structuredClone(attempt); },
  });
  assert.equal(persisted.trial.issued.length, 10);
  assert.equal(persisted.timing.observedInputCount, 10);
  assert.equal(persisted.timing.lateOver4Count, 1);
  assert.equal(persisted.timing.maxLateByMs, 9);
  assert.equal(persisted.timing.strictInvalidated, true);
  assert.equal(persisted.timing.policyInvalidated, true);
  assert.equal(classifyAttempt(persisted).state, 'inconclusive');
});

test('B15-P17-1 every P3 attempt records frozen scheduling and enabled instrumentation before work', () => {
  const attempt = createPerformanceAttempt(1);
  assert.deepEqual(attempt.measurement, {
    schedulingMode: 'absolute-ceil-timeout-v1', leadTimeMs: 0,
    timingPolicy: 'atlas.p3-timing-budget-v1',
    instrumentation: { longTaskObserver: true, gpuClockMonitor: true, messageChannelStallProbe: false, busySpin: false },
  });
  assert.equal(attempt.complete, false);
  assert.deepEqual(JSON.parse(JSON.stringify(attempt)).measurement, attempt.measurement, 'partial attempts retain the measurement contract');
  const context = { performance: { timeOrigin: 123 }, measurement: attempt.measurement,
    atlas: { space: Object.fromEntries(['onRequest', 'onPublish', 'onPublicationUpdate', 'onPresent', 'onReport'].map(name => [name, () => () => {}])) } };
  runInNewContext(`(${startAttempt.toString()})(measurement)`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.__p3.measurement)), attempt.measurement, 'the actual serialized page collector retains the same configuration');
});

test('B15-P17-1 diagnostic scheduling and probes cannot pass or pool with acceptance trials', () => {
  const passing = passingPerformanceAttempt();
  for (const change of [
    a => a.measurement.schedulingMode = 'early-wake-spin',
    a => a.measurement.leadTimeMs = 2,
    a => a.measurement.instrumentation.messageChannelStallProbe = true,
    a => a.measurement.instrumentation.busySpin = true,
    a => delete a.measurement,
  ]) {
    const diagnostic = structuredClone(passing); change(diagnostic);
    assert.equal(classifyAttempt(diagnostic).state, 'inconclusive');
    assert.equal(classifyTrials([passing, passing, passing, diagnostic]).state, 'inconclusive');
    diagnostic.applicationFailure = 'invalid diagnostic confirmation';
    assert.equal(classifyAttempt(diagnostic).state, 'failed', 'application failure precedence is unchanged');
  }
});

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
  const passing = passingPerformanceAttempt();
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

test('B15-P19-1 P3 counts historical validated cadence only at publication emission within the orbit window', async () => {
  const { measureAttempt } = await import('../space-performance.mjs'), { trial, workload } = trialFixture();
  for (const p of trial.publications.filter(p => p.kind === 'draft')) {
    Object.assign(p, { sampleIndex: 0, historical: false, eligible: true, presentationSubmittedAt: p.publishedAt - 3,
      completion: { outcome: 'completed', queueCompletedAt: p.publishedAt - 2 }, confirmationAt: p.publishedAt - 1 });
  }
  for (let i = 0; i < 450; i++) trial.publications[i].historical = true;
  // One historical notification is emitted after the window, despite earlier
  // presentation and confirmation. Neither earlier timestamp can backdate it.
  trial.publications[0].publishedAt = 30001;
  const measured = measureAttempt(trial, workload);
  assert.equal(measured.applicationFailure, null);
  assert.equal(measured.metrics.drafts, 899);
  assert.equal(measured.metrics.draftsPerSecond, 899 / 30);
  assert.equal(measured.metrics.draftIntervalP95Ms, 30);
  assert.equal(measured.metrics.completedDrafts, 900, 'completion remains a separate observation');
  trial.publications.push({ ...trial.publications[1], historical: false });
  assert.match(measureAttempt(trial, workload).applicationFailure, /invalid diagnostic confirmation/, 'duplicates cannot inflate published cadence');
});
