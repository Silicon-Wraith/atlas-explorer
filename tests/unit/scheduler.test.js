import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler, SCHEDULER_DEFAULTS, PRIORITIES } from '../../src/shared/scheduler.js';
import { createAdmission, createBatch, createJobPlan, createPipelineSet } from '../../src/space/render/backend.js';
import { createFakeClock } from '../support/fake-clock.mjs';
import { createFakeBackend } from '../support/fake-backend.mjs';
import { boundaryViolations } from '../support/import-boundary.mjs';

const test = (name, run) => nodeTest(name, { timeout: 10000 }, run);

function setup(options = {}) {
  const clock = createFakeClock();
  let scheduler;
  assert.doesNotThrow(() => {
    scheduler = createScheduler({ clock, makeAdmission: createAdmission,
      setTimer: clock.schedule, clearTimer: clock.clear, ...options });
  }, 'the scheduler must implement its injectable interface');
  scheduler.setEpoch(1);
  scheduler.registerView('main'); scheduler.registerView('other');
  return { scheduler, clock };
}
function requestData(jobId, viewId = 'main', epoch = 1, purpose = 'interactive') {
  return { jobId, requestId: `request-${jobId}`, viewId,
    generation: { deviceEpoch: epoch, viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 },
    sceneSnapshot: { camera: { x: 1 } }, output: { purpose },
  };
}
function batch(request, width = 8, outputs = {}) {
  const { jobId, requestId, viewId, generation } = request;
  return createBatch({ identity: { jobId, requestId, viewId, generation }, pipelineId: 'test', pass: 'probe',
    region: { x: 0, y: 0, width, height: 1 }, sample: { sequence: 'atlas-aa-v1', seed: 1, index: 0 },
    bounds: { pixels: width, raySteps: 1024, iterations: 512, normalFieldSamples: 6,
      shadowRays: 1, shadowSteps: 64, aoSamples: 5 }, inputs: {}, outputs, uniforms: {},
  });
}
function operation(request, id = 'op', dependsOn = [], outputs = {}) {
  return { id, dependsOn, kind: 'batch', batch: batch(request, 8, outputs) };
}
function enqueue(scheduler, jobId, options = {}) {
  const { viewId = 'main', epoch = 1, priority = 'navigation', kind = 'draft',
    purpose = 'interactive', count = 1, serial = false, onAdvance, outputs = {}, wrap } = options;
  const request = requestData(jobId, viewId, epoch, purpose);
  const operations = Array.from({ length: count }, (_, i) => operation(request, `op${i}`,
    serial && i ? [`op${i - 1}`] : [], outputs));
  const plan = createJobPlan({ request, operations, onAdvance });
  const job = scheduler.request(viewId, { jobId, requestId: request.requestId, priority, kind,
    plan: wrap ? wrap(plan) : plan });
  return { job, plan, request };
}
const finish = (scheduler, entry, evidence = {}) => scheduler.completed(entry.admission,
  { epoch: entry.admission.epoch, elapsedMs: 8, ...evidence });
async function pending(promise) {
  let settled = false; promise.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false, 'promise must remain pending');
}
async function settled(promise) {
  let result;
  promise.then(value => { result = value; });
  await Promise.resolve();
  assert.notEqual(result, undefined, 'promise must have settled from terminal evidence');
  return result;
}
const jobState = (scheduler, jobId) => scheduler.snapshot().jobs.find(job => job.jobId === jobId);
const viewState = (scheduler, viewId = 'main') => scheduler.snapshot().views.find(view => view.viewId === viewId);

test('at most two leases are outstanding per epoch across views, jobs and auxiliary submissions', async () => {
  const { scheduler } = setup();
  const first = enqueue(scheduler, 'first', { count: 2 });
  const second = enqueue(scheduler, 'second', { viewId: 'other' });
  const aux = scheduler.requestAuxiliary('main', { jobId: 'probe', priority: 'inspection',
    operation: operation(requestData('probe')) });
  const admitted = scheduler.admit(); assert.equal(admitted.length, 2);
  assert.deepEqual(admitted.map(entry => entry.admission.jobId), ['first', 'second']);
  assert.deepEqual(scheduler.admit(), []); assert.equal(scheduler.snapshot().outstanding, 2);
  assert.notEqual(admitted[0].admission, admitted[1].admission);
  finish(scheduler, admitted[1]);
  const next = scheduler.admit(); assert.equal(next.length, 1);
  assert.equal(next[0].admission.jobId, 'first');
  finish(scheduler, admitted[0]); finish(scheduler, next[0]);
  const [probe] = scheduler.admit(); assert.equal(probe.admission.jobId, 'probe');
  assert.equal(scheduler.snapshot().outstanding, 1); finish(scheduler, probe);
  assert.equal((await aux.done).outcome, 'completed');
  assert.equal((await first.job.done).outcome, 'completed');
  assert.equal((await second.job.done).outcome, 'completed');
});

test('a newer interactive request supersedes the pending one and never the running one', async () => {
  const { scheduler } = setup();
  const running = enqueue(scheduler, 'running', { count: 2 });
  const issued = scheduler.admit();
  const old = enqueue(scheduler, 'old'); const latest = enqueue(scheduler, 'latest');
  assert.equal((await old.job.done).outcome, 'superseded');
  await pending(running.job.done); assert.deepEqual(scheduler.admit(), []);
  finish(scheduler, issued[0]); finish(scheduler, issued[1]);
  assert.deepEqual(await settled(running.job.done), { outcome: 'completed', reason: null });
  const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, 'latest');
  finish(scheduler, entry); assert.equal((await latest.job.done).outcome, 'completed');
});

test('priority order admits navigation before refinement before export', () => {
  const { scheduler } = setup({ maxOutstanding: 1 });
  scheduler.registerView('third');
  enqueue(scheduler, 'export', { priority: 'export', purpose: 'export' });
  enqueue(scheduler, 'refine', { viewId: 'other', priority: 'refinement', kind: 'settled' });
  enqueue(scheduler, 'navigate', { viewId: 'third' });
  for (const id of ['navigate', 'refine', 'export']) {
    const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, id); finish(scheduler, entry);
  }
});

test('a hidden or paused view is never admitted and its elapsed work stops', async () => {
  const { scheduler, clock } = setup();
  const { job } = enqueue(scheduler, 'timed', { count: 3, kind: 'settled' });
  scheduler.pause('main'); clock.advance(100); assert.deepEqual(scheduler.admit(), []);
  assert.equal(jobState(scheduler, 'timed').elapsedWorkMs, 0);
  scheduler.resume('main'); const issued = scheduler.admit(); clock.advance(100);
  scheduler.pause('main'); clock.advance(2000);
  scheduler.hidden('main', true); scheduler.resume('main'); clock.advance(2000);
  assert.equal(jobState(scheduler, 'timed').elapsedWorkMs, 100);
  assert.deepEqual(scheduler.admit(), []);
  finish(scheduler, issued[0]); scheduler.hidden('main', false); clock.advance(50);
  assert.equal(jobState(scheduler, 'timed').elapsedWorkMs, 150);
  finish(scheduler, issued[1]); const [last] = scheduler.admit(); finish(scheduler, last);
  assert.equal((await job.done).outcome, 'completed');
});

test('update admits exactly one frozen snapshot and returns to paused', async () => {
  const { scheduler } = setup(); scheduler.pause('main');
  const frozen = enqueue(scheduler, 'frozen', { count: 2, serial: true });
  assert.equal(Object.isFrozen(frozen.job.request.sceneSnapshot.camera), true);
  scheduler.update('main');
  // A later edit cannot replace even an as-yet unadmitted Update snapshot.
  const later = enqueue(scheduler, 'later');
  assert.throws(() => { frozen.job.request.sceneSnapshot.camera.x = 2; }, TypeError);
  const [first] = scheduler.admit(); assert.equal(first.admission.jobId, 'frozen');
  finish(scheduler, first);
  const [last] = scheduler.admit(); assert.equal(last.admission.jobId, 'frozen'); finish(scheduler, last);
  assert.equal((await frozen.job.done).outcome, 'completed');
  assert.equal(viewState(scheduler).paused, true); assert.deepEqual(scheduler.admit(), []);
  await pending(later.job.done);
  scheduler.update('main'); const [next] = scheduler.admit(); assert.equal(next.admission.jobId, 'later');
  finish(scheduler, next); assert.equal((await later.job.done).outcome, 'completed');
  assert.deepEqual(scheduler.admit(), []);
});

test('cancel reports none, drained or interrupted only on completion or loss evidence', async () => {
  const { scheduler, clock } = setup();
  const none = enqueue(scheduler, 'none'); const noWork = scheduler.cancel('none');
  assert.equal(noWork.accepted, true);
  assert.deepEqual(await noWork.done, { outcome: 'cancelled', submitted: 'none' });
  assert.equal((await none.job.done).submitted, 'none');
  const drained = enqueue(scheduler, 'drain', { count: 3 }); const entries = scheduler.admit();
  const cancellation = scheduler.cancel('drain'); assert.equal(cancellation.accepted, true);
  assert.equal(scheduler.cancel('drain').done, cancellation.done);
  await pending(cancellation.done); assert.deepEqual(scheduler.admit(), []);
  finish(scheduler, entries[0]); await pending(cancellation.done);
  clock.advance(5000); await pending(cancellation.done);
  assert.equal((await drained.job.done).outcome, 'budget-exceeded');
  finish(scheduler, entries[1]);
  assert.deepEqual(await cancellation.done, { outcome: 'cancelled', submitted: 'drained' });
  scheduler.setEpoch(2);
  const lost = enqueue(scheduler, 'lost', { epoch: 2 }); scheduler.admit();
  const lossCancel = scheduler.cancel('lost'); await pending(lossCancel.done);
  scheduler.interrupted(2);
  assert.deepEqual(await lossCancel.done, { outcome: 'cancelled', submitted: 'interrupted' });
  assert.equal((await lost.job.done).outcome, 'cancelled');
  assert.equal(scheduler.cancel('unknown').accepted, false);
});

test('the watchdog fires on the injected timer while a hidden view holds a lease, settles budget-exceeded and never says cancelled', async () => {
  const { scheduler, clock } = setup();
  const backend = createFakeBackend({ clock }); await backend.acquire();
  const preparation = backend.prepare({ epoch: 1, pipelineSet: createPipelineSet({ id: 'test', descriptors: [{
    pipelineId: 'test', kind: 'compute', sourceIds: ['test.wgsl'], entryPoint: 'main', constants: {},
    bindings: [{ slot: 'status', type: 'storage-texture', access: 'write' }], uniformLayout: { byteLength: 0, fields: [] },
  }] }) }); backend.finishPrepare(); await preparation;
  const handle = backend.allocate({ name: 'status', bytes: 32, width: 8, height: 1, format: 'r32uint', bytesPerTexel: 4 });
  const { job } = enqueue(scheduler, 'stuck', { kind: 'settled', outputs: { status: handle } });
  const [entry] = scheduler.admit(); const ticket = backend.submitBatch(entry.operation.batch, { admission: entry.admission });
  backend.release(handle); scheduler.hidden('main', true);
  clock.advance(4999); await pending(job.done); clock.advance(1);
  assert.deepEqual(await job.done, { outcome: 'budget-exceeded', reason: 'watchdog', continuation: 'lower-cost' });
  assert.equal(backend.diagnostics().tracked, 32); assert.equal(backend.diagnostics().retiring, 32);
  assert.equal(scheduler.snapshot().outstanding, 1); assert.equal(scheduler.snapshot().stalled, true);
  const cancellation = scheduler.cancel('stuck'); await pending(cancellation.done);
  scheduler.hidden('main', false); const waiting = enqueue(scheduler, 'waiting'); assert.deepEqual(scheduler.admit(), []);
  backend.complete(ticket, { elapsedMs: 5000 }); const result = await ticket.done;
  finish(scheduler, entry, { elapsedMs: result.timing.elapsedMs });
  assert.equal(backend.diagnostics().tracked, 0);
  assert.equal((await cancellation.done).submitted, 'drained');
  assert.equal((await job.done).outcome, 'budget-exceeded');
  const [retry] = scheduler.admit(); assert.ok(retry, 'terminal evidence reopens admission');
  assert.equal(retry.admission.jobId, 'waiting'); finish(scheduler, retry);
  assert.equal((await settled(waiting.job.done)).outcome, 'completed');
});

test('a draft exceeding 1 s of unpaused work settles budget-exceeded with a continuation', async () => {
  const { scheduler, clock } = setup(); const { job } = enqueue(scheduler, 'budget', { count: 3 });
  scheduler.admit(); clock.advance(500); scheduler.pause('main'); clock.advance(2000);
  await pending(job.done); scheduler.resume('main'); clock.advance(501);
  assert.deepEqual(await job.done, { outcome: 'budget-exceeded', reason: 'elapsed-work', continuation: 'resume' });
  assert.deepEqual(scheduler.admit(), []); assert.equal(scheduler.snapshot().outstanding, 2);
});

test('batch bounds adapt toward 8 ms from completion evidence and never exceed the hard bounds', async () => {
  const { scheduler } = setup({ maxOutstanding: 1 }); const observations = [];
  const { job, plan } = enqueue(scheduler, 'adaptive', { count: 3, serial: true,
    onAdvance(op, evidence, pendingOperations) {
      observations.push({ op, evidence });
      return pendingOperations.map(item => {
        const width = Math.max(1, Math.floor(item.batch.region.width * evidence.targetMs / evidence.elapsedMs));
        return { ...item, batch: createBatch({ ...item.batch, region: { ...item.batch.region, width },
          bounds: { ...item.batch.bounds, pixels: width } }) };
      });
    },
  });
  const [first] = scheduler.admit(); assert.equal(first.operation.batch.bounds.pixels, 8);
  finish(scheduler, first, { elapsedMs: 32, timestampMs: 24 });
  assert.equal(observations[0].op, first.operation);
  assert.deepEqual(observations[0].evidence, { epoch: 1, elapsedMs: 32, timestampMs: 24, targetMs: 8 });
  const [second] = scheduler.admit(); assert.equal(second.operation.batch.bounds.pixels, 2);
  finish(scheduler, second, { elapsedMs: 4 });
  const [third] = scheduler.admit(); assert.equal(third.operation.batch.bounds.pixels, 4);
  for (const entry of [first, second, third]) {
    assert.equal(entry.operation.batch.bounds.raySteps, 1024); assert.equal(entry.operation.batch.bounds.iterations, 512);
    assert.throws(() => createBatch({ ...entry.operation.batch, bounds: { ...entry.operation.batch.bounds, iterations: 513 } }));
  }
  finish(scheduler, third); assert.equal(plan.exhausted(), true); assert.equal((await job.done).outcome, 'completed');
});

test('a completion from an older epoch is ignored', async () => {
  const { scheduler } = setup(); let advances = 0;
  const old = enqueue(scheduler, 'old', { onAdvance: () => { advances++; } }); const [entry] = scheduler.admit();
  scheduler.setEpoch(2); const current = enqueue(scheduler, 'current', { viewId: 'other', epoch: 2 });
  const [next] = scheduler.admit(); const before = scheduler.snapshot();
  assert.equal(finish(scheduler, entry), false); assert.deepEqual(scheduler.snapshot(), before); assert.equal(advances, 0);
  scheduler.interrupted(1); assert.equal((await old.job.done).outcome, 'interrupted');
  assert.equal(scheduler.snapshot().outstanding, 1); finish(scheduler, next);
  assert.equal((await current.job.done).outcome, 'completed');
});

test('a job settles completed when its plan is exhausted', async () => {
  const { scheduler } = setup(); const { job, plan } = enqueue(scheduler, 'complete', { count: 3, serial: true });
  for (let i = 0; i < 3; i++) {
    const [entry] = scheduler.admit(); assert.equal(entry.operation.id, `op${i}`);
    await pending(job.done); finish(scheduler, entry);
    assert.equal(plan.exhausted(), i === 2);
  }
  assert.deepEqual(await job.done, { outcome: 'completed', reason: null });
  assert.equal(jobState(scheduler, 'complete'), undefined);
});

test('shared scheduler imports nothing from src/space', async () => {
  assert.deepEqual(await boundaryViolations(['src/shared/scheduler.js'], [/^src\/shared\//]), []);
});

// Added tests: performance invariants and unspecified seams needed by B09/B13/B14.
test('added: a free slot admits a draft immediately ahead of lower-priority pending work', () => {
  const { scheduler, clock } = setup();
  enqueue(scheduler, 'export', { purpose: 'export', priority: 'export', count: 3 });
  const issued = scheduler.admit();
  enqueue(scheduler, 'draft'); finish(scheduler, issued[0]);
  const [draft] = scheduler.admit(); assert.equal(draft.admission.jobId, 'draft'); assert.equal(clock.now(), 0);
});

test('added: admission and completion inspect bounded ready work regardless of queue or history size', () => {
  const { scheduler } = setup(); let calls = 0;
  const wrap = plan => ({ request: plan.request,
    next() { calls++; return plan.next(); },
    advance(...args) { calls++; return plan.advance(...args); },
    exhausted() { calls++; return plan.exhausted(); },
  });
  for (let i = 0; i < 1000; i++) {
    scheduler.registerView(`view${i}`);
    enqueue(scheduler, `job${i}`, { viewId: `view${i}`, count: 2, serial: true, wrap });
  }
  calls = 0; const entries = scheduler.admit(); assert.equal(entries.length, 2); assert.ok(calls <= 8, `admit used ${calls} plan calls`);
  calls = 0; finish(scheduler, entries[0]); assert.ok(calls <= 4, `completed used ${calls} plan calls`);
  assert.equal(scheduler.admit().length, 1);
  const history = setup();
  for (let i = 0; i < 1000; i++) { enqueue(history.scheduler, `past${i}`); finish(history.scheduler, history.scheduler.admit()[0]); }
  assert.equal(history.scheduler.snapshot().jobs.length, 0);
});

test('added: settled latency starts at request while queued time is not charged as work', () => {
  const { scheduler, clock } = setup(); scheduler.pause('main');
  enqueue(scheduler, 'settled', { kind: 'settled' }); clock.advance(700);
  assert.equal(jobState(scheduler, 'settled').requestedAt, 0);
  scheduler.resume('main'); scheduler.admit(); clock.advance(30);
  const state = jobState(scheduler, 'settled');
  assert.equal(state.admittedAt, 700); assert.equal(state.elapsedMs, 730); assert.equal(state.elapsedWorkMs, 30);
});

test('added: auxiliary cancellation shares its owner drain and does not advance the plan', async () => {
  const { scheduler } = setup(); let advances = 0;
  const owner = enqueue(scheduler, 'owner', { onAdvance: () => { advances++; } });
  const aux = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request, 'pick') });
  const entries = scheduler.admit(); assert.equal(entries.length, 2);
  const cancellation = scheduler.cancel('owner');
  finish(scheduler, entries[0]); await pending(cancellation.done);
  finish(scheduler, entries[1]); assert.equal(advances, 0);
  assert.equal((await cancellation.done).submitted, 'drained');
  assert.equal((await owner.job.done).outcome, 'cancelled'); assert.equal((await aux.done).outcome, 'cancelled');
});

test('added: failed work settles failed and never advances, duplicate or foreign evidence is ignored', async () => {
  const { scheduler } = setup(); let advances = 0;
  const { job } = enqueue(scheduler, 'failure', { onAdvance: () => { advances++; } }); const [entry] = scheduler.admit();
  assert.equal(scheduler.completed(createAdmission({ epoch: 1, jobId: 'failure' }), { epoch: 1, elapsedMs: 1 }), false);
  assert.equal(finish(scheduler, entry, { epoch: 2 }), false);
  for (const elapsedMs of [-1, NaN, Infinity]) assert.throws(() => finish(scheduler, entry, { elapsedMs }));
  scheduler.failed(entry.admission, new Error('submission failed'));
  assert.deepEqual(await job.done, { outcome: 'failed', reason: 'submission failed' });
  assert.equal(finish(scheduler, entry), false); assert.equal(advances, 0);
});

test('added: watchdog stall clears only after every outstanding lease has terminal evidence', async () => {
  const { scheduler, clock } = setup(); const { job } = enqueue(scheduler, 'progress', { count: 3, kind: 'settled' });
  const entries = scheduler.admit(); clock.advance(4000); finish(scheduler, entries[0]);
  const [last] = scheduler.admit(); clock.advance(4999); await pending(job.done);
  clock.advance(1); assert.equal((await job.done).reason, 'watchdog');
  const retry = enqueue(scheduler, 'retry');
  const aux = scheduler.requestAuxiliary('other', { jobId: 'aux', priority: 'inspection', operation: operation(requestData('aux', 'other')) });
  finish(scheduler, entries[1]); assert.equal(scheduler.snapshot().stalled, true);
  assert.deepEqual(scheduler.admit(), []); await pending(retry.job.done); await pending(aux.done);
  scheduler.setEpoch(1); assert.deepEqual(scheduler.admit(), []);
  scheduler.failed(last.admission, new Error('terminal failure'));
  assert.equal(scheduler.snapshot().stalled, false);
  const admitted = scheduler.admit(); assert.equal(admitted.length, 2);
  admitted.forEach(entry => finish(scheduler, entry));
  assert.equal((await settled(retry.job.done)).outcome, 'completed'); assert.equal((await settled(aux.done)).outcome, 'completed');
  assert.equal((await job.done).reason, 'watchdog');
});

test('added: notification and snapshot data are immutable and terminal jobs are removed', async () => {
  const { scheduler } = setup(); const events = [];
  const unsubscribe = scheduler.subscribe(event => { events.push(event); });
  const { job } = enqueue(scheduler, 'observable'); const before = scheduler.snapshot();
  assert.equal(Object.isFrozen(before), true); assert.equal(Object.isFrozen(before.jobs[0]), true);
  assert.equal(Object.isFrozen(job), true);
  finish(scheduler, scheduler.admit()[0]); await job.done;
  assert.equal(before.jobs.length, 1); assert.equal(scheduler.snapshot().jobs.length, 0);
  assert.ok(events.length > 0); assert.ok(events.every(Object.isFrozen));
  const count = events.length; unsubscribe(); scheduler.pause('main'); assert.equal(events.length, count);
});

test('added: defaults and all priorities are frozen and invalid options are rejected', () => {
  assert.deepEqual(SCHEDULER_DEFAULTS, { maxOutstanding: 2, batchTargetMs: 8, watchdogMs: 5000,
    budgets: { draftMs: 1000, settledMs: 10000, exportMs: 120000 }, instrumentHz: 2 });
  assert.deepEqual(PRIORITIES, ['navigation', 'inspection', 'refinement', 'export', 'swatch']);
  assert.equal(Object.isFrozen(SCHEDULER_DEFAULTS.budgets), true); assert.equal(Object.isFrozen(PRIORITIES), true);
  for (const options of [{ maxOutstanding: 3 }, { maxOutstanding: 0 }, { batchTargetMs: 0 }, { watchdogMs: Infinity },
    { budgets: { draftMs: -1 } }, { instrumentHz: 3 }]) {
    const clock = createFakeClock();
    assert.throws(() => createScheduler({ clock, makeAdmission: createAdmission, setTimer: clock.schedule, clearTimer: clock.clear, ...options }));
  }
});

test('added: settled and export work use their own budgets without changing the request', async () => {
  for (const [kind, purpose, budget] of [['settled', 'interactive', 10000], ['draft', 'export', 120000]]) {
    const { scheduler, clock } = setup({ watchdogMs: 200000 });
    const { job } = enqueue(scheduler, 'budgeted', { kind, purpose }); const frozen = job.request;
    scheduler.admit(); clock.advance(budget - 1); await pending(job.done); clock.advance(2);
    assert.equal((await job.done).outcome, 'budget-exceeded'); assert.equal(job.request, frozen);
    assert.equal(job.request.output.purpose, purpose); assert.equal(jobState(scheduler, 'budgeted').elapsedWorkMs, budget);
  }
});

test('added: an empty plan completes without a lease and dependency waits never imply exhaustion', async () => {
  const { scheduler } = setup(); const empty = enqueue(scheduler, 'empty', { count: 0 });
  assert.equal((await empty.job.done).outcome, 'completed'); assert.deepEqual(scheduler.admit(), []);
  const waiting = enqueue(scheduler, 'waiting', { count: 2, serial: true });
  const [first] = scheduler.admit(); assert.deepEqual(scheduler.admit(), []); await pending(waiting.job.done);
  finish(scheduler, first); const [last] = scheduler.admit(); finish(scheduler, last);
  assert.equal((await waiting.job.done).outcome, 'completed');
});

test('added: instruments start at most twice a second and their continuation batches are unthrottled', () => {
  const { scheduler, clock } = setup();
  enqueue(scheduler, 'instrument1', { purpose: 'instrument', priority: 'inspection', count: 2, serial: true });
  enqueue(scheduler, 'instrument2', { purpose: 'instrument', priority: 'inspection' });
  enqueue(scheduler, 'instrument3', { purpose: 'instrument', priority: 'inspection' });
  const [first] = scheduler.admit(); assert.equal(first.admission.jobId, 'instrument1'); finish(scheduler, first);
  const [continuation] = scheduler.admit(); assert.equal(continuation.admission.jobId, 'instrument1'); finish(scheduler, continuation);
  assert.deepEqual(scheduler.admit(), []); clock.advance(499); assert.deepEqual(scheduler.admit(), []);
  clock.advance(1); const [second] = scheduler.admit(); assert.equal(second.admission.jobId, 'instrument2'); finish(scheduler, second);
  assert.deepEqual(scheduler.admit(), []); clock.advance(500);
  assert.equal(scheduler.admit()[0].admission.jobId, 'instrument3');
});

test('added: cancelling an auxiliary-only job stops pending submissions and waits for issued work', async () => {
  const { scheduler } = setup({ maxOutstanding: 1 });
  const first = scheduler.requestAuxiliary('main', { jobId: 'auxiliary', priority: 'inspection', operation: operation(requestData('auxiliary'), 'first') });
  const second = scheduler.requestAuxiliary('main', { jobId: 'auxiliary', priority: 'inspection', operation: operation(requestData('auxiliary'), 'second') });
  const [issued] = scheduler.admit(); const cancellation = scheduler.cancel('auxiliary');
  assert.deepEqual(scheduler.admit(), []); await pending(cancellation.done); assert.equal((await second.done).submitted, 'none');
  finish(scheduler, issued); assert.equal((await first.done).submitted, 'drained');
  assert.deepEqual(await cancellation.done, { outcome: 'cancelled', submitted: 'drained' });
});

test('added: a failed cancelling ticket proves only its own terminal drain', async () => {
  const { scheduler } = setup(); const { job } = enqueue(scheduler, 'failure', { count: 2 });
  const [first, last] = scheduler.admit(); const cancellation = scheduler.cancel('failure');
  scheduler.failed(first.admission, new Error('failed')); await pending(cancellation.done); await pending(job.done);
  scheduler.failed(last.admission, new Error('failed'));
  assert.deepEqual(await settled(cancellation.done), { outcome: 'cancelled', submitted: 'drained' });
  assert.equal((await settled(job.done)).outcome, 'cancelled');
});

test('added: hidden Update waits for visibility and a cancelled Update does not select a later edit', async () => {
  const { scheduler } = setup(); scheduler.pause('main'); scheduler.hidden('main', true);
  const chosen = enqueue(scheduler, 'chosen'); scheduler.update('main'); const later = enqueue(scheduler, 'later');
  assert.deepEqual(scheduler.admit(), []); scheduler.cancel('chosen');
  assert.equal((await chosen.job.done).outcome, 'cancelled'); scheduler.hidden('main', false);
  assert.deepEqual(scheduler.admit(), []); await pending(later.job.done);
  scheduler.update('main'); const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, 'later');
  finish(scheduler, entry); assert.equal((await later.job.done).outcome, 'completed');
});

test('added: out-of-order completions map to their exact reserved operations', () => {
  const { scheduler } = setup(); const seen = [];
  enqueue(scheduler, 'parallel', { count: 2, onAdvance: (op, evidence) => { seen.push([op.id, evidence.elapsedMs]); } });
  const [first, second] = scheduler.admit();
  finish(scheduler, second, { elapsedMs: 2 }); finish(scheduler, first, { elapsedMs: 7 });
  assert.deepEqual(seen, [['op1', 2], ['op0', 7]]);
  assert.equal(finish(scheduler, first), false); assert.equal(seen.length, 2);
});

test('added: all five priorities share the lease pool, with inspection ahead of refinement and swatch last', () => {
  const { scheduler } = setup();
  for (const priority of [...PRIORITIES].reverse()) scheduler.requestAuxiliary('main', { jobId: priority,
    priority, operation: operation(requestData(priority)) });
  const order = [];
  for (let i = 0; i < 3; i++) {
    const issued = scheduler.admit(); order.push(...issued.map(entry => entry.admission.jobId));
    for (const entry of issued) finish(scheduler, entry);
  }
  assert.deepEqual(order, PRIORITIES);
});

test('added: resuming or pausing an unadmitted Update cannot orphan its selected job', async () => {
  for (const action of ['resume', 'pause']) {
    const { scheduler } = setup(); scheduler.pause('main');
    const selected = enqueue(scheduler, 'selected'); scheduler.update('main');
    const later = enqueue(scheduler, 'later'); scheduler[action]('main');
    assert.equal((await selected.job.done).outcome, 'cancelled');
    if (action === 'pause') { assert.deepEqual(scheduler.admit(), []); scheduler.resume('main'); }
    const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, 'later');
    finish(scheduler, entry); assert.equal((await later.job.done).outcome, 'completed');
  }
});

test('added: readback and presentation use real backend leases from the same pool', async () => {
  const { scheduler, clock } = setup(); const backend = createFakeBackend({ clock }); await backend.acquire();
  const handle = backend.allocate({ name: 'display', bytes: 32, width: 8, height: 1, format: 'rgba8unorm', bytesPerTexel: 4 });
  const id = requestData('aux');
  const identity = { jobId: id.jobId, requestId: id.requestId, viewId: id.viewId, generation: id.generation };
  const readback = { id: 'readback', dependsOn: [], kind: 'readback', descriptor: { identity, source: handle,
    region: { x: 0, y: 0, width: 8, height: 1 }, fields: ['rgba'] } };
  const presentation = { id: 'present', dependsOn: [], kind: 'presentation', descriptor: { identity, display: handle } };
  const jobs = [readback, presentation, presentation].map(operation => scheduler.requestAuxiliary('main', {
    jobId: 'aux', priority: 'inspection', operation,
  }));
  const entries = scheduler.admit(); assert.equal(entries.length, 2); assert.deepEqual(scheduler.admit(), []);
  const tickets = entries.map(entry => backend[entry.operation.kind === 'readback' ? 'readback' : 'present'](
    entry.operation.descriptor, { admission: entry.admission }));
  assert.equal(entries[0].admission.consume(), false); assert.equal(entries[1].admission.consume(), false);
  backend.complete(tickets[1], { elapsedMs: 3 }); await tickets[1].done; finish(scheduler, entries[1], { elapsedMs: 3 });
  const [last] = scheduler.admit(); const ticket = backend.present(last.operation.descriptor, { admission: last.admission });
  backend.complete(tickets[0], { elapsedMs: 8 }); await tickets[0].done; await tickets[0].result; finish(scheduler, entries[0]);
  backend.complete(ticket, { elapsedMs: 2 }); await ticket.done; finish(scheduler, last, { elapsedMs: 2 });
  assert.deepEqual((await Promise.all(jobs.map(job => job.done))).map(result => result.outcome), ['completed', 'completed', 'completed']);
  assert.equal(scheduler.snapshot().outstanding, 0); backend.release(handle);
});

test('added: pending owner auxiliaries supersede together while issued auxiliaries require explicit cancellation', async () => {
  for (const submitted of [false, true]) {
    const { scheduler } = setup({ maxOutstanding: 1 });
    const owner = enqueue(scheduler, 'owner', { priority: 'refinement' });
    const auxiliary = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request) });
    const issued = submitted ? scheduler.admit()[0] : null;
    enqueue(scheduler, 'latest');
    if (submitted) {
      await pending(owner.job.done); assert.deepEqual(scheduler.admit(), []); finish(scheduler, issued);
      assert.equal((await settled(auxiliary.done)).outcome, 'completed');
      await pending(owner.job.done);
      const cancellation = scheduler.cancel('owner');
      assert.equal((await settled(cancellation.done)).submitted, 'drained');
      assert.equal((await settled(owner.job.done)).outcome, 'cancelled');
    } else {
      assert.equal((await owner.job.done).outcome, 'superseded'); assert.equal((await auxiliary.done).outcome, 'superseded');
    }
    assert.equal(scheduler.admit()[0].admission.jobId, 'latest');
  }
});

test('r1: continuous 16 ms input does not starve 24 ms or 32 ms drafts', async () => {
  for (const count of [6, 8]) {
    const { scheduler, clock } = setup(); let gpuFree = 0, completed = 0, cancelled = 0;
    function pump() {
      for (const entry of scheduler.admit()) {
        gpuFree = Math.max(gpuFree, clock.now()) + 4;
        clock.schedule(() => { finish(scheduler, entry, { elapsedMs: 4 }); pump(); }, gpuFree - clock.now());
      }
    }
    for (let frame = 0; frame < 125; frame++) {
      const { job } = enqueue(scheduler, `frame${frame}`, { count, serial: true });
      job.done.then(result => { if (result.outcome === 'completed') completed++; if (result.outcome === 'cancelled') cancelled++; });
      pump(); clock.advance(16);
    }
    await Promise.resolve();
    assert.equal(cancelled, 0); assert.ok(completed >= 60, `${count * 4} ms drafts completed ${completed / 2}/s`);
  }
});

test('r1: an auxiliary failure before cancellation preserves failed outcome and drains remaining leases', async () => {
  const { scheduler } = setup(); const owner = enqueue(scheduler, 'owner', { count: 3, priority: 'refinement' });
  const aux = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request) });
  const [auxiliary, remaining] = scheduler.admit();
  scheduler.failed(auxiliary.admission, new Error('readback failed'));
  assert.equal((await settled(aux.done)).outcome, 'failed');
  assert.equal((await settled(owner.job.done)).outcome, 'failed');
  const cancellation = scheduler.cancel('owner'); await pending(cancellation.done); assert.deepEqual(scheduler.admit(), []);
  finish(scheduler, remaining);
  assert.deepEqual(await settled(cancellation.done), { outcome: 'cancelled', submitted: 'drained' });
  assert.equal((await owner.job.done).outcome, 'failed');
});

test('r1: watchdog leaves unissued jobs waiting and admits them after drain', async () => {
  const { scheduler, clock } = setup();
  const active = enqueue(scheduler, 'active', { count: 2, kind: 'settled' }); const issued = scheduler.admit();
  scheduler.pause('other'); const waiting = enqueue(scheduler, 'waiting', { viewId: 'other' });
  const aux = scheduler.requestAuxiliary('other', { jobId: 'aux', priority: 'inspection', operation: operation(requestData('aux', 'other')) });
  clock.advance(5000);
  assert.equal((await settled(active.job.done)).reason, 'watchdog');
  assert.equal(jobState(scheduler, 'waiting')?.outcome, null); await pending(waiting.job.done); await pending(aux.done);
  finish(scheduler, issued[0]); assert.equal(scheduler.snapshot().stalled, true);
  finish(scheduler, issued[1]); assert.equal(scheduler.snapshot().stalled, false);
  assert.deepEqual(scheduler.admit(), []); scheduler.resume('other');
  const admitted = scheduler.admit(); assert.equal(admitted.length, 2); admitted.forEach(entry => finish(scheduler, entry));
  assert.equal((await settled(waiting.job.done)).outcome, 'completed'); assert.equal((await settled(aux.done)).outcome, 'completed');
});

test('r1: failure from a non-current epoch is ignored without freeing or settling its lease', async () => {
  const { scheduler } = setup(); const old = enqueue(scheduler, 'old'); const [entry] = scheduler.admit();
  scheduler.setEpoch(2); const current = enqueue(scheduler, 'current', { viewId: 'other', epoch: 2 });
  const [next] = scheduler.admit(); const before = scheduler.snapshot();
  assert.equal(scheduler.failed(entry.admission, new Error('late failure')), false);
  assert.deepEqual(scheduler.snapshot(), before); await pending(old.job.done);
  scheduler.interrupted(1); assert.equal((await settled(old.job.done)).outcome, 'interrupted');
  finish(scheduler, next); assert.equal((await settled(current.job.done)).outcome, 'completed');
});

test('r1: epochs cannot decrease even after the unavailable epoch', () => {
  const { scheduler } = setup(); scheduler.setEpoch(3);
  assert.throws(() => scheduler.setEpoch(2), RangeError); assert.equal(scheduler.snapshot().epoch, 3);
  scheduler.setEpoch(0); assert.throws(() => scheduler.setEpoch(1), RangeError);
  scheduler.setEpoch(4); assert.equal(scheduler.snapshot().epoch, 4);
});

test('r1: observed loss closes admission and requests until a new epoch, and is idempotent', async () => {
  const { scheduler, clock } = setup(); const { job } = enqueue(scheduler, 'lost'); scheduler.admit();
  assert.equal(scheduler.interrupted(1), true); assert.equal((await settled(job.done)).outcome, 'interrupted');
  assert.deepEqual(scheduler.admit(), []); assert.equal(scheduler.interrupted(1), false);
  assert.throws(() => enqueue(scheduler, 'rejected'), /epoch/);
  assert.throws(() => scheduler.requestAuxiliary('main', { jobId: 'aux', priority: 'inspection', operation: operation(requestData('aux')) }), /epoch/);
  clock.advance(6000); assert.equal(scheduler.snapshot().outstanding, 0);
  scheduler.setEpoch(2); const recovered = enqueue(scheduler, 'recovered', { epoch: 2, kind: 'settled' });
  assert.equal(scheduler.admit().length, 1); clock.advance(5000); assert.equal(scheduler.snapshot().stalled, true);
  assert.equal(scheduler.interrupted(2), true); assert.equal(scheduler.snapshot().stalled, false);
  assert.equal((await settled(recovered.job.done)).reason, 'watchdog'); assert.deepEqual(scheduler.admit(), []);
});

test('r1: a hidden view receives no lease and its outstanding watchdog rearms while hidden', async () => {
  const { scheduler, clock } = setup(); scheduler.hidden('main', true);
  const { job } = enqueue(scheduler, 'hidden', { count: 2, kind: 'settled' });
  assert.deepEqual(scheduler.admit(), []); clock.advance(6000); await pending(job.done);
  scheduler.hidden('main', false); const entries = scheduler.admit(); scheduler.hidden('main', true);
  clock.advance(4000); finish(scheduler, entries[0]);
  clock.advance(4999); await pending(job.done); clock.advance(1);
  assert.equal((await settled(job.done)).reason, 'watchdog'); assert.equal(scheduler.snapshot().outstanding, 1);
});

test('r1: admission factory rejects wrong identities and reused leases before reserving a slot', () => {
  for (const wrong of ['epoch', 'jobId']) {
    let invalid = true;
    const { scheduler } = setup({ makeAdmission: id => createAdmission(invalid ? { ...id, [wrong]: wrong === 'epoch' ? 2 : 'wrong' } : id) });
    enqueue(scheduler, 'owner'); assert.throws(() => scheduler.admit(), /admission/);
    assert.equal(scheduler.snapshot().outstanding, 0); invalid = false; assert.equal(scheduler.admit().length, 1);
  }
  let reuse = true; const lease = createAdmission({ epoch: 1, jobId: 'owner' });
  const { scheduler } = setup({ maxOutstanding: 1, makeAdmission: id => reuse ? lease : createAdmission(id) });
  enqueue(scheduler, 'owner', { count: 2 }); const [first] = scheduler.admit(); finish(scheduler, first);
  assert.throws(() => scheduler.admit(), /admission/); assert.equal(scheduler.snapshot().outstanding, 0);
  reuse = false; assert.equal(scheduler.admit().length, 1);
  const concurrent = setup({ makeAdmission: () => lease }); const owner = enqueue(concurrent.scheduler, 'owner'); concurrent.scheduler.admit();
  concurrent.scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request) });
  assert.throws(() => concurrent.scheduler.admit(), /admission/); assert.equal(concurrent.scheduler.snapshot().outstanding, 1);
});

test('r1: a factory failure after one valid lease cannot strand the earlier admission', () => {
  let calls = 0;
  const { scheduler } = setup({ makeAdmission: id => {
    if (++calls === 1) return createAdmission(id);
    throw new Error('factory failure');
  } });
  enqueue(scheduler, 'owner', { count: 2 });
  let entries; assert.doesNotThrow(() => { entries = scheduler.admit(); });
  assert.equal(entries.length, 1); assert.equal(scheduler.snapshot().outstanding, 1);
  assert.throws(() => scheduler.admit(), /factory failure/);
  finish(scheduler, entries[0]); assert.equal(scheduler.snapshot().outstanding, 0);
});

test('r1: Update on an unpaused view selects pending before running and returns to paused', async () => {
  const { scheduler } = setup({ maxOutstanding: 1 });
  const running = enqueue(scheduler, 'running', { count: 2, serial: true }); const [issued] = scheduler.admit();
  assert.equal(viewState(scheduler).pending, null);
  const newest = enqueue(scheduler, 'newest', { count: 2, serial: true });
  scheduler.update('main'); assert.equal(viewState(scheduler).updating, 'newest'); assert.equal(viewState(scheduler).paused, true);
  finish(scheduler, issued); await pending(running.job.done);
  for (let i = 0; i < 2; i++) {
    const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, 'newest'); finish(scheduler, entry);
  }
  assert.equal((await settled(newest.job.done)).outcome, 'completed'); assert.equal(viewState(scheduler).paused, true);
  assert.deepEqual(scheduler.admit(), []); await pending(running.job.done);
  // With nothing pending, Update resumes the older running snapshot.
  scheduler.update('main'); assert.equal(viewState(scheduler).updating, 'running');
  const [last] = scheduler.admit(); finish(scheduler, last); assert.equal((await settled(running.job.done)).outcome, 'completed');
  scheduler.resume('main'); scheduler.update('main'); assert.equal(viewState(scheduler).paused, true);
  assert.equal(viewState(scheduler).updating, null);
});
