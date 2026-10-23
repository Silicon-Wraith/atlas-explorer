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
    purpose = 'interactive', count = 1, serial = false, onAdvance, outputs = {}, wrap, navigationStream = null } = options;
  const request = requestData(jobId, viewId, epoch, purpose);
  const operations = Array.from({ length: count }, (_, i) => operation(request, `op${i}`,
    serial && i ? [`op${i - 1}`] : [], outputs));
  const plan = createJobPlan({ request, operations, onAdvance });
  const job = scheduler.request(viewId, { jobId, requestId: request.requestId, priority, kind, navigationStream,
    plan: wrap ? wrap(plan) : plan });
  return { job, plan, request };
}
function preparing(scheduler, jobId, options = {}) {
  let prepared = false, calls = 0;
  const queued = enqueue(scheduler, jobId, { ...options, wrap: plan => ({ request: plan.request,
    next() { calls++; return prepared ? plan.next() : null; },
    exhausted() { calls++; return prepared && plan.exhausted(); },
    advance(...args) { return plan.advance(...args); },
  }) });
  return { ...queued, prepare() { prepared = true; }, calls: () => calls };
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

test('r4-F3 Update with two owners waits for the other owner after the selected lease drains', async () => {
  const { scheduler } = setup();
  const selected = enqueue(scheduler, 'selected', { navigationStream: 7, count: 2, serial: true });
  const [a] = scheduler.admit();
  const other = enqueue(scheduler, 'other-owner', { navigationStream: 7, count: 2, serial: true });
  const [b] = scheduler.admit();
  scheduler.update('main');
  finish(scheduler, a);
  assert.equal(scheduler.snapshot().outstanding, 1, 'one lease is free but the other owner still drains');
  assert.equal(scheduler.admit().length, 0, 'Update cannot admit the selected continuation yet');
  await pending(selected.job.done); await pending(other.job.done);
  finish(scheduler, b);
  assert.equal((await other.job.done).outcome, 'cancelled');
  const [next] = scheduler.admit(); assert.equal(next.admission.jobId, 'selected');
  finish(scheduler, next); assert.equal((await selected.job.done).outcome, 'completed');
});

test('r4-F4 Update preparation waits until both cancelled owners have drained', async () => {
  const { scheduler } = setup();
  enqueue(scheduler, 'owner-a', { navigationStream: 7 }); const [a] = scheduler.admit();
  enqueue(scheduler, 'owner-b', { navigationStream: 7 }); const [b] = scheduler.admit();
  const selected = preparing(scheduler, 'selected', { navigationStream: 7 });
  scheduler.update('main');
  await pending(selected.job.preparation);
  finish(scheduler, a);
  await pending(selected.job.preparation);
  assert.deepEqual(scheduler.admit(), []);
  finish(scheduler, b);
  assert.equal(await settled(selected.job.preparation), true);
  selected.prepare(); scheduler.ready('selected', { epoch: 1 });
  const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, 'selected');
  finish(scheduler, entry); assert.equal((await selected.job.done).outcome, 'completed');
});

test('B15-REC-G a navigation stream admits two drafts and coalesces only its third pending slot', async () => {
  const { scheduler } = setup();
  const first = enqueue(scheduler, 'first', { count: 2, serial: true, navigationStream: 7 });
  const [a] = scheduler.admit();
  const second = enqueue(scheduler, 'second', { count: 2, serial: true, navigationStream: 7 });
  const admitted = scheduler.admit();
  assert.equal(admitted.length, 1, 'second live draft may run while the first waits on its dependency');
  const [b] = admitted;
  assert.equal(scheduler.snapshot().outstanding, 2);
  const third = enqueue(scheduler, 'third', { navigationStream: 7 });
  const fourth = enqueue(scheduler, 'fourth', { navigationStream: 7 });
  assert.equal((await third.job.done).outcome, 'superseded');
  await pending(fourth.job.preparation);
  assert.deepEqual(scheduler.admit(), []);
  finish(scheduler, a);
  const [present] = scheduler.admit();
  assert.equal(present.admission.jobId, first.job.jobId);
  finish(scheduler, present); assert.equal((await first.job.done).outcome, 'completed');
  assert.equal(await fourth.job.preparation, true);
  const [latest] = scheduler.admit(); assert.equal(latest.admission.jobId, 'fourth');
  finish(scheduler, b); finish(scheduler, latest);
  finish(scheduler, scheduler.admit()[0]);
  assert.equal((await second.job.done).outcome, 'completed');
  assert.equal(scheduler.snapshot().outstanding, 0);
});

test('at most two leases are outstanding per epoch across views, jobs and auxiliary submissions', async () => {
  const { scheduler } = setup();
  const first = enqueue(scheduler, 'first', { count: 2 });
  const second = enqueue(scheduler, 'second', { viewId: 'other' });
  const aux = scheduler.requestAuxiliary('main', { jobId: 'probe', priority: 'inspection',
    operation: operation(requestData('probe')) });
  const admitted = scheduler.admit(); assert.equal(admitted.length, 2);
  assert.deepEqual(admitted.map(entry => entry.admission.jobId), ['first', 'first']);
  assert.deepEqual(scheduler.admit(), []); assert.equal(scheduler.snapshot().outstanding, 2);
  assert.notEqual(admitted[0].admission, admitted[1].admission);
  finish(scheduler, admitted[1]);
  const next = scheduler.admit(); assert.equal(next.length, 1);
  assert.equal(next[0].admission.jobId, 'second');
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

test('readiness: a request registered before ready is admitted after ready and retains its Update selection', async () => {
  const { scheduler, clock } = setup(); scheduler.pause('main');
  const selected = preparing(scheduler, 'selected', { count: 2, serial: true });
  scheduler.update('main'); const later = enqueue(scheduler, 'later');
  assert.equal(viewState(scheduler).updating, 'selected');
  assert.deepEqual(scheduler.admit(), []); await pending(selected.job.done);
  clock.advance(100); assert.equal(jobState(scheduler, 'selected').elapsedWorkMs, 0);
  await Promise.resolve(); selected.prepare();
  assert.equal(scheduler.ready('selected', { epoch: 1 }), true);
  assert.equal(scheduler.snapshot().outstanding, 0, 'readiness does not issue a lease');
  for (let i = 0; i < 2; i++) {
    const [entry] = scheduler.admit(); assert.ok(entry, 'prepared Update must become admissible');
    assert.equal(entry.admission.jobId, 'selected'); finish(scheduler, entry);
  }
  assert.equal((await settled(selected.job.done)).outcome, 'completed');
  assert.equal(viewState(scheduler).paused, true); assert.deepEqual(scheduler.admit(), []);
  await pending(later.job.done);
  scheduler.update('main'); finish(scheduler, scheduler.admit()[0]);
  assert.equal((await settled(later.job.done)).outcome, 'completed');
});

test('readiness: stale-epoch notifications are ignored even when a job ID is reused', async () => {
  const { scheduler } = setup(); const old = preparing(scheduler, 'reused');
  scheduler.setEpoch(2); old.prepare(); const before = scheduler.snapshot(), calls = old.calls();
  const events = []; scheduler.subscribe(event => events.push(event));
  for (const epoch of [1, 2]) assert.equal(scheduler.ready('reused', { epoch }), false);
  assert.deepEqual(scheduler.snapshot(), before); assert.equal(old.calls(), calls); assert.deepEqual(events, []);
  scheduler.interrupted(1); assert.equal((await settled(old.job.done)).outcome, 'interrupted');
  const current = preparing(scheduler, 'reused', { epoch: 2 }); current.prepare();
  const currentCalls = current.calls(), eventCount = events.length;
  assert.equal(scheduler.ready('reused', { epoch: 1 }), false);
  assert.equal(current.calls(), currentCalls); assert.equal(events.length, eventCount);
  assert.deepEqual(scheduler.admit(), []);
  assert.equal(scheduler.ready('reused', { epoch: 2 }), true);
  const [entry] = scheduler.admit(); assert.equal(entry.admission.epoch, 2); finish(scheduler, entry);
  assert.equal((await settled(current.job.done)).outcome, 'completed');
});

test('readiness: duplicates neither double-admit operations nor repeat ready events', async () => {
  const { scheduler } = setup(); const waiting = preparing(scheduler, 'waiting', { count: 2, serial: true });
  const events = []; scheduler.subscribe(event => { if (event.type === 'ready') events.push(event); });
  assert.equal(scheduler.ready('waiting', { epoch: 1 }), false); assert.deepEqual(events, []);
  waiting.prepare(); assert.equal(scheduler.ready('waiting', { epoch: 1 }), true);
  const calls = waiting.calls();
  for (let i = 0; i < 10; i++) assert.equal(scheduler.ready('waiting', { epoch: 1 }), false);
  assert.equal(waiting.calls(), calls, 'a reserved operation is never replaced by duplicate readiness');
  assert.deepEqual(events, [{ type: 'ready', epoch: 1, jobId: 'waiting', viewId: 'main' }]);
  const [first] = scheduler.admit(); assert.equal(first.operation.id, 'op0');
  for (let i = 0; i < 10; i++) assert.equal(scheduler.ready('waiting', { epoch: 1 }), false);
  assert.deepEqual(scheduler.admit(), []); assert.equal(scheduler.snapshot().outstanding, 1);
  finish(scheduler, first); const [last] = scheduler.admit(); assert.equal(last.operation.id, 'op1');
  finish(scheduler, last); assert.equal((await settled(waiting.job.done)).outcome, 'completed');
  assert.equal(scheduler.ready('waiting', { epoch: 1 }), false); assert.equal(events.length, 1);
});

test('readiness: a notification inspects only its job regardless of backlog size', () => {
  const { scheduler } = setup();
  const waiting = Array.from({ length: 1000 }, (_, i) => preparing(scheduler, `waiting${i}`, { purpose: 'export' }));
  const calls = waiting.map(job => job.calls()); waiting[500].prepare();
  assert.equal(scheduler.ready('waiting500', { epoch: 1 }), true);
  waiting.forEach((job, i) => assert.equal(job.calls() - calls[i], i === 500 ? 2 : 0));
  assert.equal(scheduler.snapshot().outstanding, 0);
  assert.equal(scheduler.ready('unknown', { epoch: 1 }), false);
});

test('readiness: a burst respects both lease limits with synchronous admission listeners and auxiliaries', async () => {
  for (const maxOutstanding of [1, 2]) {
    const { scheduler } = setup({ maxOutstanding }); const active = [], issued = [], jobs = [];
    function pump() {
      const entries = scheduler.admit(); active.push(...entries); issued.push(...entries);
      assert.ok(active.length <= maxOutstanding, 'readiness burst must respect the shared lease limit');
      assert.equal(scheduler.snapshot().outstanding, active.length);
    }
    const auxiliary = scheduler.requestAuxiliary('other', { jobId: 'auxiliary', priority: 'inspection',
      operation: operation(requestData('auxiliary', 'other')) });
    pump(); scheduler.subscribe(event => { if (event.type === 'ready') pump(); });
    for (let i = 0; i < 20; i++) {
      const job = preparing(scheduler, `burst${i}`, { purpose: 'export', count: 2 }); jobs.push(job);
      job.prepare(); assert.equal(scheduler.ready(job.job.jobId, { epoch: 1 }), true);
      for (let duplicate = 0; duplicate < 3; duplicate++) scheduler.ready(job.job.jobId, { epoch: 1 });
      // Observer exceptions are isolated, so assert the limit outside the callback too.
      assert.ok(active.length <= maxOutstanding); assert.equal(scheduler.snapshot().outstanding, active.length);
    }
    for (let i = 0; i < 41 && active.length; i++) { finish(scheduler, active.shift()); pump(); }
    assert.equal(issued.length, 41); assert.equal(active.length, 0);
    assert.equal(new Set(issued.map(entry => `${entry.admission.jobId}/${entry.operation.id}`)).size, 41);
    assert.equal((await settled(auxiliary.done)).outcome, 'completed');
    for (const job of jobs) assert.equal((await settled(job.job.done)).outcome, 'completed');
  }
});

test('readiness: hidden and paused requests wait for eligibility including hidden Update', () => {
  for (const mode of ['hidden', 'paused', 'hidden-update']) {
    const { scheduler } = setup();
    if (mode !== 'paused') scheduler.hidden('main', true);
    if (mode !== 'hidden') scheduler.pause('main');
    const waiting = preparing(scheduler, 'waiting');
    if (mode === 'hidden-update') scheduler.update('main');
    waiting.prepare(); assert.equal(scheduler.ready('waiting', { epoch: 1 }), true);
    assert.deepEqual(scheduler.admit(), []);
    if (mode !== 'paused') scheduler.hidden('main', false); else scheduler.resume('main');
    const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, 'waiting'); finish(scheduler, entry);
    if (mode === 'hidden-update') assert.equal(viewState(scheduler).paused, true);
  }
});

test('readiness: terminal jobs are never rechecked or revived', async () => {
  for (const outcome of ['cancelled', 'superseded', 'failed', 'budget-exceeded', 'watchdog', 'interrupted']) {
    const { scheduler, clock } = setup(); const waiting = preparing(scheduler, 'waiting', { count: 3 });
    if (outcome === 'cancelled') scheduler.cancel('waiting');
    else if (outcome === 'superseded') enqueue(scheduler, 'newer');
    else if (outcome === 'interrupted') scheduler.interrupted(1);
    else {
      waiting.prepare(); assert.equal(scheduler.ready('waiting', { epoch: 1 }), true);
      const entries = scheduler.admit();
      if (outcome === 'failed') scheduler.failed(entries[0].admission, new Error('failed'));
      else if (outcome === 'watchdog') { scheduler.hidden('main', true); clock.advance(5000); }
      else clock.advance(1000);
    }
    assert.equal((await settled(waiting.job.done)).outcome, outcome === 'watchdog' ? 'budget-exceeded' : outcome);
    waiting.prepare(); const before = scheduler.snapshot(), calls = waiting.calls(), events = [];
    scheduler.subscribe(event => events.push(event));
    assert.equal(scheduler.ready('waiting', { epoch: 1 }), false);
    assert.equal(waiting.calls(), calls); assert.deepEqual(scheduler.snapshot(), before); assert.deepEqual(events, []);
  }
});

test('readiness: watchdog stalls and instrument cadence still gate prepared work', () => {
  const { scheduler, clock } = setup();
  enqueue(scheduler, 'stuck', { count: 2, kind: 'settled' }); const issued = scheduler.admit();
  clock.advance(5000);
  const waiting = preparing(scheduler, 'waiting', { viewId: 'other' }); waiting.prepare();
  assert.equal(scheduler.ready('waiting', { epoch: 1 }), true); assert.deepEqual(scheduler.admit(), []);
  finish(scheduler, issued[0]); assert.deepEqual(scheduler.admit(), []);
  finish(scheduler, issued[1]); const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, 'waiting');
  finish(scheduler, entry);
  enqueue(scheduler, 'instrument1', { purpose: 'instrument', priority: 'inspection' });
  finish(scheduler, scheduler.admit()[0]);
  const instrument = preparing(scheduler, 'instrument2', { purpose: 'instrument', priority: 'inspection' });
  instrument.prepare(); assert.equal(scheduler.ready('instrument2', { epoch: 1 }), true);
  assert.deepEqual(scheduler.admit(), []); clock.advance(499); assert.deepEqual(scheduler.admit(), []);
  clock.advance(1); assert.equal(scheduler.admit()[0].admission.jobId, 'instrument2');
});

test('readiness: an empty prepared plan settles without a lease', async () => {
  const { scheduler } = setup(); const empty = preparing(scheduler, 'empty', { count: 0 });
  await pending(empty.job.done); empty.prepare();
  const events = []; scheduler.subscribe(event => events.push(event));
  assert.equal(scheduler.ready('empty', { epoch: 1 }), true);
  assert.deepEqual(await settled(empty.job.done), { outcome: 'completed', reason: null });
  assert.deepEqual(scheduler.admit(), []); assert.equal(scheduler.snapshot().outstanding, 0);
  assert.deepEqual(events, [{ type: 'settled', epoch: 1, jobId: 'empty', viewId: 'main' }]);
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
  const handle = backend.allocateImage({ name: 'status', bytes: 32, width: 8, height: 1, format: 'r32uint', bytesPerTexel: 4 });
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
  const handle = backend.allocateImage({ name: 'display', bytes: 32, width: 8, height: 1, format: 'rgba8unorm', bytesPerTexel: 4 });
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

test('discard: refuses main, foreign and fabricated leases without changing state', async () => {
  const { scheduler } = setup(); const owner = enqueue(scheduler, 'owner');
  const auxiliary = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request, 'pick') });
  const [main, pick] = scheduler.admit();
  const foreign = setup(); foreign.scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request) });
  const [foreignPick] = foreign.scheduler.admit();
  const before = scheduler.snapshot(), events = []; scheduler.subscribe(event => events.push(event));
  for (const admission of [main.admission, foreignPick.admission, undefined, null, {}, { ...pick.admission },
    createAdmission({ epoch: 1, jobId: 'owner' }), createAdmission({ epoch: 2, jobId: 'owner' }),
    createAdmission({ epoch: 1, jobId: 'wrong' })]) {
    assert.equal(scheduler.discardAuxiliary(admission, { reason: 'rejected' }), false);
  }
  assert.deepEqual(scheduler.snapshot(), before); assert.deepEqual(events, []);
  await pending(owner.job.done); await pending(auxiliary.done);
  finish(scheduler, main); finish(scheduler, pick); finish(foreign.scheduler, foreignPick);
});

test('discard: ignores non-current epochs and old admissions after job ID reuse', async () => {
  for (const nextEpoch of [0, 2]) {
    const { scheduler } = setup(); const request = requestData('reused');
    const old = scheduler.requestAuxiliary('main', { jobId: 'reused', priority: 'inspection', operation: operation(request) });
    const [entry] = scheduler.admit(); scheduler.setEpoch(nextEpoch);
    const before = scheduler.snapshot();
    assert.equal(scheduler.discardAuxiliary(entry.admission, { reason: 'late rejection' }), false);
    assert.deepEqual(scheduler.snapshot(), before); await pending(old.done);
    scheduler.interrupted(1); assert.equal((await settled(old.done)).outcome, 'interrupted');
    scheduler.setEpoch(2);
    const current = scheduler.requestAuxiliary('main', { jobId: 'reused', priority: 'inspection', operation: operation(requestData('reused', 'main', 2)) });
    const [replacement] = scheduler.admit(); const currentState = scheduler.snapshot();
    assert.equal(scheduler.discardAuxiliary(entry.admission, { reason: 'old admission' }), false);
    assert.deepEqual(scheduler.snapshot(), currentState); await pending(current.done);
    finish(scheduler, replacement); assert.equal((await settled(current.done)).outcome, 'completed');
  }
});

test('discard: settles one auxiliary without failing or closing its owner', async () => {
  const { scheduler } = setup(); let advances = 0;
  const owner = enqueue(scheduler, 'owner', { kind: 'settled', count: 2, serial: true, onAdvance: () => { advances++; } });
  const pick = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request, 'pick') });
  const [main, entry] = scheduler.admit();
  assert.equal(scheduler.discardAuxiliary(entry.admission, { reason: 'pre-queue rejection' }), true);
  const result = await settled(pick.done);
  assert.deepEqual(result, { outcome: 'failed', reason: 'pre-queue rejection' }); assert.equal(Object.isFrozen(result), true);
  assert.equal(scheduler.snapshot().outstanding, 1); assert.equal(advances, 0); await pending(owner.job.done);
  const classify = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request, 'classify') });
  const [classification] = scheduler.admit(); assert.equal(classification.operation.id, 'classify');
  assert.equal(scheduler.discardAuxiliary(classification.admission, { reason: 'failure after queue fence' }), true);
  assert.deepEqual(await settled(classify.done), { outcome: 'failed', reason: 'failure after queue fence' });
  assert.equal(advances, 0); await pending(owner.job.done);
  finish(scheduler, main); finish(scheduler, scheduler.admit()[0]);
  assert.deepEqual(await settled(owner.job.done), { outcome: 'completed', reason: null });
  assert.equal(advances, 2); assert.equal(scheduler.snapshot().outstanding, 0); assert.deepEqual(scheduler.snapshot().jobs, []);
});

test('discard: a discarded auxiliary is not watchdog progress', async () => {
  const { scheduler, clock } = setup();
  const owner = enqueue(scheduler, 'owner', { kind: 'settled' });
  const pick = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request, 'pick') });
  const [, entry] = scheduler.admit(); clock.advance(4000);
  assert.equal(scheduler.discardAuxiliary(entry.admission, { reason: 'rejected' }), true);
  assert.equal((await settled(pick.done)).outcome, 'failed');
  clock.advance(999); await pending(owner.job.done);
  clock.advance(1); assert.equal((await owner.job.done).reason, 'watchdog');
});

test('discard: preserves a completed owner and leaves sibling auxiliaries usable', async () => {
  for (const requestedAfterCompletion of [false, true]) {
    const { scheduler } = setup(); const owner = enqueue(scheduler, 'owner', { kind: 'settled' });
    const [main] = scheduler.admit();
    if (requestedAfterCompletion) finish(scheduler, main);
    const pick = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request, 'pick') });
    const sibling = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request, 'sibling') });
    if (!requestedAfterCompletion) finish(scheduler, main);
    const ownerResult = await settled(owner.job.done), [first, second] = scheduler.admit();
    assert.equal(scheduler.discardAuxiliary(first.admission, { reason: 'copy-out rejected' }), true);
    assert.equal((await settled(pick.done)).outcome, 'failed'); await pending(sibling.done);
    assert.equal(scheduler.snapshot().outstanding, 1); assert.equal(await owner.job.done, ownerResult);
    const later = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request, 'later') });
    const [last] = scheduler.admit(); finish(scheduler, second); finish(scheduler, last);
    assert.equal((await settled(sibling.done)).outcome, 'completed'); assert.equal((await settled(later.done)).outcome, 'completed');
    assert.deepEqual(await owner.job.done, { outcome: 'completed', reason: null });
    assert.deepEqual(scheduler.snapshot().jobs, []);
  }
});

test('discard: cancellation drains only after every lease has terminal evidence', async () => {
  for (const discardFirst of [false, true]) {
    const { scheduler } = setup(); const owner = enqueue(scheduler, 'owner', { count: 2, serial: true });
    const aux = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request) });
    const [main, auxiliary] = scheduler.admit(); const cancellation = scheduler.cancel('owner');
    const discard = () => assert.equal(scheduler.discardAuxiliary(auxiliary.admission, { reason: 'rejected after cancel' }), true);
    if (discardFirst) discard(); else finish(scheduler, main);
    await pending(cancellation.done); await pending(owner.job.done); await pending(aux.done);
    assert.equal(scheduler.snapshot().outstanding, 1); assert.deepEqual(scheduler.admit(), []);
    if (discardFirst) finish(scheduler, main); else discard();
    assert.deepEqual(await settled(cancellation.done), { outcome: 'cancelled', submitted: 'drained' });
    for (const done of [owner.job.done, aux.done]) assert.deepEqual(await settled(done), { outcome: 'cancelled', reason: 'cancelled', submitted: 'drained' });
    assert.equal(scheduler.snapshot().outstanding, 0); assert.deepEqual(scheduler.snapshot().jobs, []);
  }
});

test('discard: evidence before cancellation remains failed and counts as submitted drain', async () => {
  const { scheduler } = setup(); const owner = preparing(scheduler, 'owner');
  const aux = scheduler.requestAuxiliary('main', { jobId: 'owner', priority: 'inspection', operation: operation(owner.request) });
  const [entry] = scheduler.admit();
  assert.equal(scheduler.discardAuxiliary(entry.admission, { reason: 'submission rejected' }), true);
  const result = await settled(aux.done); await pending(owner.job.done);
  const cancellation = scheduler.cancel('owner');
  assert.deepEqual(await settled(cancellation.done), { outcome: 'cancelled', submitted: 'drained' });
  assert.equal((await settled(owner.job.done)).outcome, 'cancelled'); assert.equal(await aux.done, result);
  assert.deepEqual(result, { outcome: 'failed', reason: 'submission rejected' });
});

test('discard: auxiliary-only cancellation drains with discarded leases', async () => {
  const { scheduler } = setup(); const request = requestData('auxiliary');
  const jobs = ['pick', 'classify', 'unissued'].map(id => scheduler.requestAuxiliary('main', {
    jobId: 'auxiliary', priority: 'inspection', operation: operation(request, id),
  }));
  const entries = scheduler.admit(); const cancellation = scheduler.cancel('auxiliary');
  assert.equal((await settled(jobs[2].done)).submitted, 'none');
  assert.equal(scheduler.discardAuxiliary(entries[0].admission, { reason: 'rejected' }), true);
  await pending(cancellation.done); await pending(jobs[0].done);
  assert.equal(scheduler.discardAuxiliary(entries[1].admission, { reason: 'rejected' }), true);
  assert.deepEqual(await settled(cancellation.done), { outcome: 'cancelled', submitted: 'drained' });
  for (const job of jobs.slice(0, 2)) assert.equal((await settled(job.done)).submitted, 'drained');
  assert.deepEqual(scheduler.snapshot().jobs, []);
});

test('discard: observed loss takes precedence including a partially drained cancellation', async () => {
  for (const cancelling of [false, true]) for (const discardBeforeLoss of [false, true]) {
    const { scheduler } = setup(); const owner = enqueue(scheduler, 'owner', { priority: 'refinement', kind: 'settled' });
    const auxiliaries = ['pick', 'classify'].map(id => scheduler.requestAuxiliary('main', {
      jobId: 'owner', priority: 'inspection', operation: operation(owner.request, id),
    }));
    const entries = scheduler.admit(), cancellation = cancelling ? scheduler.cancel('owner') : null;
    if (discardBeforeLoss) {
      assert.equal(scheduler.discardAuxiliary(entries[0].admission, { reason: 'earlier rejection' }), true);
      if (cancelling) await pending(cancellation.done);
    }
    scheduler.interrupted(1); const before = scheduler.snapshot(), events = []; scheduler.subscribe(event => events.push(event));
    for (const entry of entries) assert.equal(scheduler.discardAuxiliary(entry.admission, { reason: 'late rejection' }), false);
    assert.deepEqual(scheduler.snapshot(), before); assert.deepEqual(events, []);
    if (cancelling) {
      assert.deepEqual(await settled(cancellation.done), { outcome: 'cancelled', submitted: 'interrupted' });
      for (const job of [owner.job, ...auxiliaries]) assert.deepEqual(await settled(job.done), { outcome: 'cancelled', reason: 'cancelled', submitted: 'interrupted' });
    } else {
      assert.deepEqual(await settled(owner.job.done), { outcome: 'interrupted', reason: 'device-lost' });
      assert.deepEqual(await settled(auxiliaries[1].done), { outcome: 'interrupted', reason: 'device-lost' });
      assert.equal((await settled(auxiliaries[0].done)).outcome, discardBeforeLoss ? 'failed' : 'interrupted');
    }
    assert.equal(scheduler.snapshot().outstanding, 0); assert.deepEqual(scheduler.admit(), []);
  }
});

test('discard: requires a diagnostic reason but accepts unrecognized nonempty strings', async () => {
  const { scheduler } = setup();
  const aux = scheduler.requestAuxiliary('main', { jobId: 'aux', priority: 'inspection', operation: operation(requestData('aux')) });
  const [entry] = scheduler.admit(); const before = scheduler.snapshot(), events = []; scheduler.subscribe(event => events.push(event));
  for (const options of [undefined, null, {}, { reason: undefined }, { reason: null }, { reason: '' }, { reason: ' \n ' }, { reason: 7 }, { reason: new Error('rejected') }]) {
    assert.throws(() => scheduler.discardAuxiliary(entry.admission, options), TypeError);
    assert.deepEqual(scheduler.snapshot(), before); await pending(aux.done);
  }
  assert.deepEqual(events, []);
  const reason = 'backend-specific diagnostic not in an enum';
  assert.equal(scheduler.discardAuxiliary(entry.admission, { reason }), true);
  assert.deepEqual(await settled(aux.done), { outcome: 'failed', reason });
});

test('discard: duplicate and already retired leases cannot release another slot or change outcomes', async () => {
  for (const terminal of ['completed', 'failed', 'discarded']) {
    const { scheduler } = setup();
    const aux = scheduler.requestAuxiliary('main', { jobId: 'aux', priority: 'inspection', operation: operation(requestData('aux')) });
    const [entry] = scheduler.admit();
    if (terminal === 'completed') finish(scheduler, entry);
    else if (terminal === 'failed') scheduler.failed(entry.admission, new Error('original failure'));
    else assert.equal(scheduler.discardAuxiliary(entry.admission, { reason: 'original rejection' }), true);
    const original = await settled(aux.done);
    const current = enqueue(scheduler, 'current'); const [main] = scheduler.admit(); const before = scheduler.snapshot(), events = [];
    scheduler.subscribe(event => events.push(event));
    assert.equal(scheduler.discardAuxiliary(entry.admission, { reason: 'duplicate' }), false);
    assert.equal(scheduler.discardAuxiliary(entry.admission), false, 'retired leases are refused before reason validation');
    assert.equal(finish(scheduler, entry), false); assert.equal(scheduler.failed(entry.admission, new Error('late failure')), false);
    assert.deepEqual(scheduler.snapshot(), before); assert.deepEqual(events, []); assert.equal(await aux.done, original);
    finish(scheduler, main); assert.equal((await settled(current.job.done)).outcome, 'completed');
  }
});

test('discard: watchdog outcomes stay settled and the stall clears only after all leases drain', async () => {
  const { scheduler, clock } = setup(); const owner = preparing(scheduler, 'owner', { kind: 'settled' });
  const auxiliaries = ['pick', 'classify'].map(id => scheduler.requestAuxiliary('main', {
    jobId: 'owner', priority: 'inspection', operation: operation(owner.request, id),
  }));
  const [first, last] = scheduler.admit(); clock.advance(5000);
  const result = { outcome: 'budget-exceeded', reason: 'watchdog', continuation: 'lower-cost' };
  for (const job of [owner.job, ...auxiliaries]) assert.deepEqual(await settled(job.done), result);
  const waiting = enqueue(scheduler, 'waiting');
  assert.equal(scheduler.discardAuxiliary(first.admission, { reason: 'late fence failure' }), true);
  assert.equal(scheduler.snapshot().stalled, true); assert.deepEqual(scheduler.admit(), []);
  const cancellation = scheduler.cancel('owner'); await pending(cancellation.done);
  assert.equal(scheduler.discardAuxiliary(last.admission, { reason: 'late fence failure' }), true);
  assert.deepEqual(await settled(cancellation.done), { outcome: 'cancelled', submitted: 'drained' });
  assert.equal(scheduler.snapshot().stalled, false);
  for (const job of [owner.job, ...auxiliaries]) assert.deepEqual(await job.done, result);
  finish(scheduler, scheduler.admit()[0]); assert.equal((await settled(waiting.job.done)).outcome, 'completed');
  clock.advance(5000); assert.equal(scheduler.snapshot().stalled, false); assert.deepEqual(scheduler.snapshot().jobs, []);
});

test('discard: releases slots atomically for synchronous listeners at both lease limits', async () => {
  for (const maxOutstanding of [1, 2]) {
    const { scheduler } = setup({ maxOutstanding }); const owner = preparing(scheduler, 'owner', { count: 3, serial: true });
    const auxiliaries = Array.from({ length: 5 }, (_, i) => scheduler.requestAuxiliary('main', {
      jobId: 'owner', priority: 'inspection', operation: operation(owner.request, `aux${i}`),
    }));
    const active = [], issued = [], events = []; let previous;
    const pump = () => { const entries = scheduler.admit(); active.push(...entries); issued.push(...entries); };
    pump(); owner.prepare(); assert.equal(scheduler.ready('owner', { epoch: 1 }), true);
    scheduler.subscribe(event => {
      if (event.type !== 'discarded') return;
      events.push({ event, duplicate: scheduler.discardAuxiliary(previous.admission, { reason: 'duplicate' }) }); pump();
    });
    for (let i = 0; active.length && i < 8; i++) {
      previous = active.shift();
      if (previous.operation.id.startsWith('aux')) {
        assert.equal(scheduler.discardAuxiliary(previous.admission, { reason: 'rejected' }), true);
        if (issued.length < 8) assert.ok(active.length > 0, 'discard notification lets a listener use the freed slot');
      } else finish(scheduler, previous);
      pump(); assert.ok(active.length <= maxOutstanding); assert.equal(scheduler.snapshot().outstanding, active.length);
    }
    assert.equal(events.length, 5); assert.ok(events.every(({ event, duplicate }) => Object.isFrozen(event) && duplicate === false));
    assert.equal(issued.length, 8); assert.equal(new Set(issued.map(entry => entry.operation.id)).size, 8); assert.equal(active.length, 0);
    assert.equal((await settled(owner.job.done)).outcome, 'completed');
    for (const auxiliary of auxiliaries) assert.equal((await settled(auxiliary.done)).outcome, 'failed');
    assert.deepEqual(scheduler.snapshot().jobs, []);
  }
});


test('navigation admission keeps two active stream drafts through dependency waits and supersedes only pending drafts', async () => {
  const { scheduler } = setup();
  const active = enqueue(scheduler, 'active', { navigationStream: 7, count: 2, serial: true });
  const [first] = scheduler.admit();
  const second = enqueue(scheduler, 'second-active', { navigationStream: 7 });
  const [secondLease] = scheduler.admit();
  const skipped = enqueue(scheduler, 'skipped', { navigationStream: 7 });
  const newest = enqueue(scheduler, 'newest', { navigationStream: 7 });
  assert.equal((await skipped.job.done).outcome, 'superseded');
  assert.deepEqual(scheduler.admit(), [], 'a dependency wait must not start a third draft of this stream');
  await pending(newest.job.preparation);
  finish(scheduler, first);
  const next = scheduler.admit(); assert.equal(next.length, 1); assert.equal(next[0].admission.jobId, 'active');
  finish(scheduler, next[0]); assert.equal((await active.job.done).outcome, 'completed');
  assert.equal(await newest.job.preparation, true);
  const [last] = scheduler.admit(); assert.equal(last.admission.jobId, 'newest'); finish(scheduler, last);
  assert.equal((await newest.job.done).outcome, 'completed');
  finish(scheduler, secondLease); assert.equal((await second.job.done).outcome, 'completed');
});

test('oldest ready job retains admission precedence within its priority', () => {
  const { scheduler } = setup({ maxOutstanding: 1 });
  enqueue(scheduler, 'oldest', { viewId: 'main', count: 3, serial: true });
  enqueue(scheduler, 'younger', { viewId: 'other' });
  for (const expected of ['oldest', 'oldest', 'oldest', 'younger']) {
    const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, expected); finish(scheduler, entry);
  }
});

test('navigation streams in one view have independent pending slots and cancellation waits for retirement', async () => {
  const { scheduler } = setup();
  const a = enqueue(scheduler, 'a', { navigationStream: 1, count: 2, serial: true });
  const [issued] = scheduler.admit();
  const b = enqueue(scheduler, 'b', { navigationStream: 2 });
  const [other] = scheduler.admit(); assert.equal(other.admission.jobId, 'b');
  const newest = enqueue(scheduler, 'pending-a', { navigationStream: 1 });
  finish(scheduler, other); assert.equal((await b.job.done).outcome, 'completed');
  const cancel = scheduler.cancel(a.job.jobId);
  const [last] = scheduler.admit(); assert.equal(last.admission.jobId, newest.job.jobId);
  await pending(cancel.done);
  finish(scheduler, issued); assert.equal((await cancel.done).submitted, 'drained');
  finish(scheduler, last);
  assert.equal((await newest.job.done).outcome, 'completed');
});

test('Update pins a waiting stream request through active cancellation and newer input', async () => {
  const { scheduler } = setup();
  enqueue(scheduler, 'active', { navigationStream: 1, count: 2, serial: true });
  const [issued] = scheduler.admit();
  const selected = preparing(scheduler, 'selected', { navigationStream: 1 });
  scheduler.update('main');
  const latest = enqueue(scheduler, 'latest', { navigationStream: 1 });
  assert.equal(await selected.job.preparation, true, 'the second frame slot was available before Update');
  assert.deepEqual(scheduler.admit(), [], 'Update admission still waits for the other owner to drain');
  finish(scheduler, issued);
  assert.equal(await settled(selected.job.preparation), true, 'Update preparation wakes only after the previous lease retires');
  selected.prepare(); scheduler.ready('selected', { epoch: 1 });
  const [entry] = scheduler.admit(); assert.equal(entry.admission.jobId, 'selected'); finish(scheduler, entry);
  assert.equal((await selected.job.done).outcome, 'completed'); await pending(latest.job.done);
  assert.deepEqual(scheduler.admit(), [], 'Update returns to paused');
  scheduler.resume('main'); const [last] = scheduler.admit(); assert.equal(last.admission.jobId, 'latest'); finish(scheduler, last);
});
