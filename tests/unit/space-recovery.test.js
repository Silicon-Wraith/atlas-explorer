import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBackend } from '../support/fake-backend.mjs';
import { createFakeClock } from '../support/fake-clock.mjs';
import { createScheduler } from '../../src/shared/scheduler.js';
import { createAdmission, createPipelineSet } from '../../src/space/render/backend.js';
import { createSpaceRenderer } from '../../src/space/render/renderer.js';
import { createSpaceScene } from '../../src/space/scene-adapter.js';
import { createSpaceRequest } from '../../src/space/render-adapter.js';
import { createRecovery, RECOVERY_POLICY } from '../../src/space/recovery.js';

const versions = { kernelVersion: 'recovery-fixture-v1', tracingVersion: 'recovery-fixture-v1' };
const generation = epoch => ({ deviceEpoch: epoch, viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 });
const makeRequest = (epoch, scene = createSpaceScene({ model: 'sphere' }), size = { width: 8, height: 8 }, purpose = 'interactive') =>
  createSpaceRequest({ scene, ...size, profile: 'settled', generation: generation(epoch), viewId: 'space', purpose, versions });
const directScene = () => {
  const scene = createSpaceScene({ model: 'sphere' });
  return { ...scene, appearance: { ...scene.appearance, lightingQuality: 'direct' }, sampling: { ...scene.sampling, targetSamples: 1 } };
};
const read = slot => ({ slot, type: 'texture', access: 'read' });
const write = slot => ({ slot, type: 'storage-texture', access: 'write' });
const compute = (entryPoint, bindings) => ({ pipelineId: entryPoint, entryPoint, kind: 'compute', sourceIds: ['fake-only'],
  constants: {}, bindings, uniformLayout: { byteLength: 0, fields: [] } });
// B10 is deliberately absent: descriptors exercise orchestration, never shader numerics.
const pipelines = createPipelineSet({ id: 'b13-fixture', descriptors: [
  compute('probe', [write('probe_target')]),
  compute('trace_band', [write('depth'), write('status')]),
  compute('normals_band', [read('depth'), read('status'), write('normal')]),
  compute('shade_band', [read('depth'), read('status'), read('normal'), write('sampleColor'), write('lightingStatus')]),
  compute('accumulate_band', [read('sampleColor'), read('previous'), write('next')]),
  compute('display_band', [read('accumulation'), write('display')]),
] });
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };

async function rig({ cold = false, onNotice, budgets } = {}) {
  const clock = createFakeClock(), fake = createFakeBackend({ clock });
  const hooks = {}, tickets = [], targets = [], notices = [], publications = [], reports = [], transitions = [], submitted = [];
  const backend = { ...fake,
    async configureTargets(desc) {
      hooks.configuration?.(desc);
      const result = await fake.configureTargets(desc); targets.push(result);
      if (hooks.holdConfiguration) await hooks.holdConfiguration;
      return result;
    },
  };
  for (const method of ['submitBatch', 'readback', 'present']) backend[method] = (desc, options) => {
    if (method === 'readback' && desc.fields.includes('probe')) {
      fake.stage(desc.source, new Uint8Array(Uint32Array.of(hooks.probe ?? 0x41544c53).buffer));
    }
    const ticket = fake[method](desc, options);
    const entry = { method, desc, admission: options.admission, ticket, pending: true };
    tickets.push(entry); ticket.done.then(() => { entry.pending = false; });
    return hooks.ticket?.(entry) ?? ticket;
  };
  const raw = createScheduler({ clock, makeAdmission: createAdmission, setTimer: clock.schedule, clearTimer: clock.clear, budgets });
  const scheduler = { ...raw,
    interrupted(epoch) { transitions.push(['interrupted', epoch]); return raw.interrupted(epoch); },
    setEpoch(epoch) { transitions.push(['epoch', epoch]); return raw.setEpoch(epoch); },
  };
  const actual = createSpaceRenderer({ backend, scheduler, clock, viewId: 'space', versions, pipelineSet: pipelines });
  actual.onPublish(value => publications.push(value)); actual.onReport(value => reports.push(value));
  const renderer = { ...actual,
    render(request, options) {
      const job = actual.render(request, options);
      submitted.push(job); return job;
    },
  };
  const recovery = createRecovery({ backend, renderer, scheduler, clock, onNotice: notice => { notices.push(notice); onNotice?.(notice); } });
  const pump = async () => {
    await flush(); fake.finishPrepare(); await flush();
    const entry = tickets.find(value => value.pending);
    if (entry) fake.complete(entry.ticket, { elapsedMs: 1 });
    await flush();
  };
  const until = async predicate => {
    for (let i = 0; i < 1000; i++) { await flush(); if (predicate()) return; await pump(); }
    assert.fail('bounded fake-backend driver did not reach its condition');
  };
  const finish = async promise => {
    let settled = false, result, error;
    promise.then(value => { result = value; settled = true; }, value => { error = value; settled = true; });
    await until(() => settled); if (error) throw error; return result;
  };
  const destroy = () => { recovery.destroy(); actual.destroy(); fake.destroy(); };
  if (!cold) await finish(recovery.prepare());
  return { fake, backend, clock, hooks, tickets, targets, notices, publications, reports, transitions, submitted,
    renderer, scheduler, recovery, pump, until, finish, destroy };
}

test('a loss during preparation, configuration, tracing and readback each settles the job interrupted and triggers one automatic recovery', async () => {
  for (const phase of ['preparation', 'configuration', 'tracing', 'readback']) {
    const h = await rig({ cold: phase === 'preparation' });
    if (phase === 'preparation') await h.backend.acquire();
    const request = makeRequest(h.backend.currentEpoch());
    let release;
    if (phase === 'configuration') h.hooks.holdConfiguration = new Promise(resolve => { release = resolve; });
    const live = { ...request.generation };
    const job = h.recovery.render(request, { currentGeneration: () => live }); await flush();
    if (phase === 'readback') await h.until(() => h.tickets.some(entry => entry.pending && entry.method === 'readback' && entry.desc.identity.jobId === job.jobId));
    if (phase === 'tracing') assert.ok(h.tickets.some(entry => entry.pending && entry.desc.pass === 'trace'));
    // The fake synchronously delivers loss and returns a boolean, unlike the real
    // test adapter's promise. Awaiting it alone cannot be used as recovery evidence.
    assert.equal(h.fake.testAdapter.destroyDevice(), true);
    assert.equal(h.recovery.state().automaticRecoveries, 1, phase);
    assert.equal(h.recovery.state().phase, 'recovering', phase);
    assert.equal((await job.done).outcome, 'interrupted', phase);
    release?.(); delete h.hooks.holdConfiguration;
    await h.until(() => h.recovery.state().phase === 'ready' && h.submitted.length === 2);
    const next = h.submitted[1];
    assert.notEqual(next.jobId, job.jobId); assert.notEqual(next.requestId, job.requestId);
    assert.deepEqual(next.request.sceneSnapshot, request.sceneSnapshot);
    assert.deepEqual(next.request.quality, request.quality);
    assert.equal(next.request.generation.deviceEpoch, 2);
    assert.equal((await h.finish(next.done)).outcome, 'completed');
    assert.ok(h.publications.some(value => value.requestId === next.requestId), `${phase}: the guarded restart must publish`);
    assert.deepEqual(live, request.generation, 'recovery rebinds its guard without editing the caller generation');
    assert.equal(live.deviceEpoch, 1);
    assert.equal(h.tickets.find(entry => entry.desc.pass === 'trace' && entry.desc.identity.jobId === next.jobId).desc.sample.index, 0);
    assert.ok(h.transitions.findIndex(value => value[0] === 'interrupted' && value[1] === 1) < h.transitions.findIndex(value => value[0] === 'epoch' && value[1] === 2));
    assert.equal(h.fake.log.filter(value => value.method === 'acquire').length, 2);
    h.destroy();
  }
});

test('a second loss stops automatic recovery even after more than 60 seconds', async () => {
  const h = await rig(); h.fake.lose(); await h.until(() => h.recovery.state().phase === 'ready');
  h.clock.advance(61000); h.scheduler.hidden('space', true); h.scheduler.hidden('space', false);
  h.fake.lose(); await flush();
  assert.equal(h.recovery.state().phase, 'stopped'); assert.equal(h.recovery.state().automaticRecoveries, 1);
  assert.equal(h.fake.log.filter(value => value.method === 'acquire').length, 2);
  assert.ok(h.notices.some(value => value.type === 'stopped')); h.destroy();
});

test('an explicit retry starts a new episode with one automatic recovery', async () => {
  const h = await rig(); assert.deepEqual(RECOVERY_POLICY, { maxAutomaticRecoveries: 1 });
  h.fake.lose(); await h.until(() => h.recovery.state().phase === 'ready'); h.fake.lose();
  await h.finish(h.recovery.retry()); assert.equal(h.recovery.state().automaticRecoveries, 0);
  h.fake.lose(); await h.until(() => h.recovery.state().phase === 'ready');
  assert.equal(h.recovery.state().automaticRecoveries, 1); h.fake.lose();
  assert.equal(h.recovery.state().phase, 'stopped'); assert.equal(h.backend.currentEpoch(), 0); h.destroy();
});

test('late callbacks from the lost epoch are ignored after recovery', async () => {
  const h = await rig(), request = makeRequest(1);
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  h.hooks.ticket = entry => entry.method === 'readback' && entry.desc.identity.jobId === request.jobId
    ? { ...entry.ticket, result: entry.ticket.result.then(async value => { await blocked; return value; }) } : entry.ticket;
  const job = h.recovery.render(request);
  await h.until(() => h.tickets.some(entry => entry.pending && entry.method === 'readback' && entry.desc.identity.jobId === job.jobId));
  const old = h.tickets.find(entry => entry.pending);
  h.fake.complete(old.ticket, { elapsedMs: 1 }); await flush();
  h.fake.lose(); assert.equal((await job.done).outcome, 'interrupted');
  await h.until(() => h.recovery.state().phase === 'ready');
  await h.finish(h.submitted.at(-1).done);
  const before = h.recovery.state();
  const publications = h.publications.length;
  release(); await flush();
  assert.equal(h.fake.complete(old.ticket), false);
  assert.equal(h.scheduler.completed(old.admission, { epoch: 1, elapsedMs: 1 }), false);
  h.recovery.onLoss({ epoch: 1, reason: 'late', message: 'late callback' }); await flush();
  assert.deepEqual(h.recovery.state(), before);
  assert.equal(h.publications.length, publications);
  assert.ok(h.publications.every(value => value.requestId !== request.requestId)); h.destroy();
});

test('allocation failure releases obsolete generations before offering a lower-cost choice and never changes the request', async t => {
  let atNotice;
  const h = await rig({ onNotice: notice => {
    if (notice.type === 'allocation-failed') atNotice = h.fake.diagnostics();
  } });
  t.after(h.destroy);
  const viewport = makeRequest(1, directScene()); let live = viewport.generation;
  await h.finish(h.recovery.render(viewport, { currentGeneration: () => live }).done);
  const normal = h.targets.at(-1).handles.normal, published = h.publications.at(-1);
  live = { ...live, geometryRevision: 2 }; // The edit has not yet been submitted.
  const request = makeRequest(1, viewport.sceneSnapshot, { width: 16, height: 16 }, 'export');
  const before = structuredClone(request), tracked = h.fake.diagnostics().tracked;
  h.fake.testAdapter.failNextAllocation();
  const result = await h.finish(h.recovery.render(request).done);
  assert.equal(result.outcome, 'failed'); assert.equal(result.errorCode, 'allocation-failed');
  const notices = h.notices.filter(value => value.type === 'allocation-failed'); assert.equal(notices.length, 1);
  const notice = notices[0];
  assert.deepEqual(notice.choices, ['release-and-retry', 'lower-resolution', 'fewer-samples']);
  assert.equal(notice.request, request); assert.equal(notice.released, 8 * 8 * 8); assert.equal(notice.retiring, 0);
  assert.ok(!Object.hasOwn(notice, 'releaseUnavailable')); assert.ok(Object.isFrozen(notice));
  assert.equal(atNotice.tracked, tracked - notice.released, 'release precedes the choice notification');
  assert.ok(!atNotice.inventory.some(value => value.id === normal.id));
  assert.equal(h.publications.at(-1), published);
  assert.deepEqual(request, before); assert.equal(h.submitted.length, 2, 'no silent retry or lower-cost render');
});

test('a failed configuration keeps the previous target set and the previous publication', async () => {
  const h = await rig(); await h.finish(h.recovery.render(makeRequest(1)).done);
  const previous = h.targets.at(-1), published = h.publications.at(-1), before = h.publications.length;
  h.fake.testAdapter.failNextAllocation(); const request = makeRequest(1, undefined, { width: 16, height: 16 });
  assert.equal((await h.finish(h.recovery.render(request).done)).outcome, 'failed');
  assert.equal(h.targets.at(-1), previous); assert.equal(h.publications.length, before); assert.equal(h.publications.at(-1), published);
  assert.ok(h.fake.diagnostics().inventory.some(value => value.id === previous.handles.display.id));
  assert.ok(!h.fake.log.some(value => value.method === 'release' && value.args[0] === previous.handles.display)); h.destroy();
});

test('cancellation during retirement keeps bytes tracked until the ticket settles', async () => {
  const h = await rig({ budgets: { settledMs: 2 } });
  const job = h.recovery.render(makeRequest(1)); await flush();
  const ticket = h.tickets.find(value => value.pending), handle = ticket.desc.outputs.depth;
  h.clock.advance(2); await flush(); assert.equal((await job.done).outcome, 'budget-exceeded');
  const inventory = () => h.fake.diagnostics().inventory.find(value => value.id === handle.id);
  assert.equal(inventory().state, 'retiring'); assert.equal(inventory().tickets, 1);
  const cancellation = h.recovery.cancel(job.jobId); assert.equal(cancellation.accepted, true);
  let settled = false; cancellation.done.then(() => { settled = true; }); await flush();
  assert.equal(settled, false); assert.ok(inventory());
  h.fake.complete(ticket.ticket, { elapsedMs: 1 }); await flush();
  assert.deepEqual(await cancellation.done, { outcome: 'cancelled', submitted: 'drained' });
  assert.equal(inventory(), undefined); assert.equal((await job.done).outcome, 'budget-exceeded');
  const unknown = h.recovery.cancel('unknown'); assert.equal(unknown.accepted, false); assert.equal(await unknown.done, null); h.destroy();
});

test('a watchdog budget-exceeded offers a continuation and does not claim cancellation', async () => {
  const h = await rig(); const job = h.recovery.render(makeRequest(1)); await flush();
  h.clock.advance(5000); await flush(); const result = await job.done;
  assert.equal(result.outcome, 'budget-exceeded'); assert.equal(result.reason, 'watchdog');
  const choice = h.recovery.onBudgetExceeded({ ...job, ...result });
  assert.equal(choice.continuation, 'lower-cost'); assert.equal(h.scheduler.snapshot().stalled, true);
  assert.ok(h.scheduler.snapshot().outstanding > 0); assert.equal(h.fake.diagnostics().state, 'ready');
  assert.equal(h.notices.filter(value => value.type === 'cancelled').length, 0);
  const lower = makeRequest(1, undefined, { width: 4, height: 4 });
  const next = choice.accept(lower); assert.notEqual(next.jobId, job.jobId); assert.notEqual(next.requestId, job.requestId);
  assert.equal(next.request.generation.deviceEpoch, 1);
  assert.equal(h.scheduler.snapshot().jobs.find(value => value.jobId === next.jobId).elapsedWorkMs, 0);
  assert.equal((await h.finish(next.done)).outcome, 'completed'); assert.equal((await job.done).outcome, 'budget-exceeded'); h.destroy();
});

test('recovery never modifies the scene or either history', async () => {
  const h = await rig(), scene = createSpaceScene({ model: 'sphere' });
  const investigation = { scene, undoHistory: [scene, { label: 'prior edit' }], cameraHistory: [scene.camera, { label: 'prior camera' }] };
  const before = structuredClone(investigation), request = makeRequest(1, scene), original = structuredClone(request);
  const job = h.recovery.render(request); await flush(); h.fake.lose(); await job.done;
  await h.until(() => h.recovery.state().phase === 'ready'); await h.finish(h.submitted.at(-1).done);
  h.fake.testAdapter.failNextAllocation();
  const exporting = makeRequest(2, scene, { width: 16, height: 16 }, 'export');
  assert.equal((await h.finish(h.recovery.render(exporting).done)).errorCode, 'allocation-failed');
  h.fake.lose(); await h.finish(h.recovery.retry()); await h.finish(h.submitted.at(-1).done);
  assert.deepEqual(investigation, before); assert.equal(investigation.scene, scene);
  assert.deepEqual(request, original); assert.deepEqual(h.submitted.at(-1).request.sceneSnapshot, scene); h.destroy();
});

test('a loss during automatic preparation stops the episode and late preparation cannot revive it', async () => {
  const h = await rig(); h.fake.lose(); await flush();
  assert.equal(h.recovery.state().phase, 'recovering'); assert.equal(h.backend.currentEpoch(), 2);
  h.fake.lose(); await flush();
  assert.equal(h.recovery.state().phase, 'stopped');
  h.fake.finishPrepare(); await flush();
  assert.equal(h.recovery.state().phase, 'stopped');
  assert.equal(h.fake.log.filter(value => value.method === 'acquire').length, 2);
  assert.equal(h.recovery.state().automaticRecoveries, 1); h.destroy();
});

test('a probe mismatch stops recovery as preparation-failed and retains the consumed allowance', async () => {
  const h = await rig(); h.hooks.probe = 0; h.fake.lose();
  await h.until(() => h.recovery.state().phase === 'stopped');
  assert.equal(h.notices.at(-1).reason, 'preparation-failed');
  assert.equal(h.recovery.state().automaticRecoveries, 1);
  await assert.rejects(h.recovery.prepare(), { code: 'unavailable' });
  h.hooks.probe = 0x41544c53;
  await h.finish(h.recovery.retry()); assert.equal(h.recovery.state().automaticRecoveries, 0); h.destroy();
});

test('a render internal probe failure reports preparation-failed and stops recovery until explicit retry', async t => {
  const h = await rig({ cold: true }); t.after(h.destroy);
  h.hooks.probe = 0;
  const request = makeRequest(1), job = h.recovery.render(request);
  const result = await h.finish(job.done);
  assert.equal(result.outcome, 'failed'); assert.equal(result.errorCode, 'preparation-failed');
  assert.equal(h.recovery.state().phase, 'stopped'); assert.equal(h.recovery.state().automaticRecoveries, 0);
  const notice = h.notices.find(value => value.type === 'failed');
  assert.equal(notice.request, request); assert.equal(notice.result, result); assert.equal(notice.state.phase, 'stopped');
  assert.ok(!h.notices.some(value => value.type === 'allocation-failed'));
  assert.equal(h.publications.length, 0);
  assert.throws(() => h.recovery.render(makeRequest(1)), { code: 'unavailable' });
  h.hooks.probe = 0x41544c53;
  await h.finish(h.recovery.retry());
  assert.equal(h.recovery.state().phase, 'ready');
  assert.equal((await h.finish(h.submitted.at(-1).done)).outcome, 'completed');
  assert.equal((await job.done).errorCode, 'preparation-failed', 'retry does not revive the failed job');
});

test('preparation failure remains visible and an explicit retry performs the probe again', async () => {
  const h = await rig({ cold: true });
  const promise = h.recovery.prepare(); await flush(); h.fake.failPrepare('fixture');
  await assert.rejects(promise, { code: 'preparation-failed' });
  assert.equal(h.recovery.state().phase, 'stopped');
  await h.finish(h.recovery.retry());
  assert.ok(h.tickets.some(value => value.method === 'readback' && value.desc.fields.includes('probe')));
  assert.equal(h.recovery.state().phase, 'ready'); h.destroy();
});

test('a preparation timeout is stopped and its late completion cannot publish readiness', async () => {
  const h = await rig({ cold: true }); const promise = h.recovery.prepare(); await flush();
  h.clock.advance(60000); await assert.rejects(promise, { code: 'preparation-failed' });
  const before = h.recovery.state(); h.fake.finishPrepare(); await flush();
  assert.deepEqual(h.recovery.state(), before); assert.equal(h.tickets.length, 0); h.destroy();
});

test('destroy detaches recovery without reclaiming caller-owned leases or starting another attempt', async () => {
  const h = await rig(); const job = h.recovery.render(makeRequest(1)); await flush();
  const before = h.fake.diagnostics(); h.recovery.destroy(); h.recovery.destroy();
  assert.deepEqual(h.fake.diagnostics(), before);
  h.fake.lose(); await flush(); assert.equal((await job.done).outcome, 'interrupted');
  assert.equal(h.fake.log.filter(value => value.method === 'acquire').length, 1);
  assert.equal(h.recovery.state().phase, 'stopped');
  await assert.rejects(h.recovery.retry(), { code: 'unavailable' }); h.destroy();
});

test('destroy during recovery prevents late preparation from restarting the viewport', async () => {
  const h = await rig(); const job = h.recovery.render(makeRequest(1)); await flush();
  h.fake.lose(); await job.done; await flush(); h.recovery.destroy();
  const count = h.notices.length;
  for (let i = 0; i < 5; i++) await h.pump();
  assert.equal(h.recovery.state().phase, 'stopped'); assert.equal(h.submitted.length, 1);
  assert.equal(h.notices.length, count); h.destroy();
});

test('elapsed-work continuation submits a fresh plan once with the same request settings', async () => {
  const h = await rig({ budgets: { settledMs: 2 } });
  const request = makeRequest(1), job = h.recovery.render(request); await flush();
  h.clock.advance(2); const result = await job.done;
  const choice = h.recovery.onBudgetExceeded({ ...job, ...result }); assert.equal(choice.continuation, 'resume');
  const next = choice.accept(); assert.equal(choice.accept(), next);
  assert.notEqual(next.jobId, job.jobId); assert.notEqual(next.requestId, job.requestId);
  assert.deepEqual(next.request.quality, request.quality); assert.deepEqual(next.request.output, request.output);
  assert.deepEqual(next.request.sceneSnapshot, request.sceneSnapshot);
  assert.equal((await h.finish(next.done)).outcome, 'completed'); assert.equal((await job.done).outcome, 'budget-exceeded'); h.destroy();
});

test('a continuation cannot restore a replaced request or an unsubmitted camera revision', async () => {
  for (const replacement of ['request', 'revision']) {
    const h = await rig({ budgets: { settledMs: 2 } }), request = makeRequest(1);
    let current = request.generation;
    const job = h.recovery.render(request, { currentGeneration: () => current }); await flush(); h.clock.advance(2);
    const choice = h.recovery.onBudgetExceeded({ ...job, ...await job.done });
    if (replacement === 'request') h.recovery.render(makeRequest(1));
    else current = { ...current, viewRevision: current.viewRevision + 1 };
    assert.throws(() => choice.accept(), { code: 'stale-epoch' }); h.destroy();
  }
});

test('a lower-cost continuation requires an actual explicit cost reduction', async () => {
  const h = await rig(), job = h.recovery.render(makeRequest(1)); await flush(); h.clock.advance(5000);
  const choice = h.recovery.onBudgetExceeded({ ...job, ...await job.done });
  assert.throws(() => choice.accept(), /lower-cost/);
  assert.throws(() => choice.accept(makeRequest(1)), /lower-cost/);
  assert.equal(h.submitted.length, 1); h.destroy();
});

test('a resumed plan preserves the live generation guard against subsequent camera edits', async () => {
  const h = await rig({ budgets: { settledMs: 2 } }), request = makeRequest(1);
  let current = request.generation;
  const job = h.recovery.render(request, { currentGeneration: () => current }); await flush(); h.clock.advance(2);
  const choice = h.recovery.onBudgetExceeded({ ...job, ...await job.done });
  const next = choice.accept(); current = { ...current, viewRevision: current.viewRevision + 1 };
  assert.equal((await h.finish(next.done)).outcome, 'cancelled');
  assert.ok(!h.publications.some(value => value.requestId === next.requestId)); h.destroy();
});

test('a real failed export preserves compatible live viewport geometry and reports zero released and retiring bytes', async t => {
  const h = await rig(); t.after(h.destroy);
  const viewport = makeRequest(1, directScene()); let live = viewport.generation;
  await h.finish(h.recovery.render(viewport, { currentGeneration: () => live }).done);
  live = { ...live, viewRevision: 2, appearanceRevision: 2 };
  const before = h.fake.diagnostics(), published = h.publications.at(-1);
  const releases = h.fake.log.filter(value => value.method === 'release').length;
  const exporting = makeRequest(1, createSpaceScene({ model: 'box' }), { width: 16, height: 16 }, 'export');
  const original = structuredClone(exporting);
  h.fake.testAdapter.failNextAllocation();
  const result = await h.finish(h.recovery.render(exporting).done);
  assert.equal(result.outcome, 'failed'); assert.equal(result.errorCode, 'allocation-failed');
  const notices = h.notices.filter(value => value.type === 'allocation-failed'); assert.equal(notices.length, 1);
  assert.equal(notices[0].request, exporting); assert.equal(notices[0].released, 0); assert.equal(notices[0].retiring, 0);
  assert.ok(!Object.hasOwn(notices[0], 'releaseUnavailable'));
  assert.deepEqual(h.fake.diagnostics().inventory, before.inventory);
  assert.equal(h.fake.diagnostics().tracked, before.tracked);
  assert.equal(h.fake.log.filter(value => value.method === 'release').length, releases);
  assert.equal(h.publications.at(-1), published); assert.deepEqual(exporting, original);
});

test('real allocation failures report freed cache bytes separately from bytes held by tickets and mappings', async t => {
  for (const stage of ['shade', 'readback']) {
    const h = await rig(); t.after(h.destroy);
    const viewport = makeRequest(1, directScene()); let live = viewport.generation;
    const job = h.recovery.render(viewport, { currentGeneration: () => live });
    const pending = () => h.tickets.find(entry => entry.pending && entry.desc.identity.jobId === job.jobId &&
      (stage === 'shade' ? entry.desc.pass === 'shade' : entry.method === 'readback' && entry.desc.fields[0] === 'status'));
    await h.until(() => pending()); const ticket = pending();
    h.scheduler.pause('space'); h.clock.advance(5000); await flush();
    assert.equal((await job.done).reason, 'watchdog');
    live = { ...live, geometryRevision: 2 };
    const before = h.fake.diagnostics(), outstanding = h.scheduler.snapshot().outstanding;
    const handles = ['depth', 'status', 'normal'].map(name => h.targets.at(-1).handles[name]);
    const inventory = handle => h.fake.diagnostics().inventory.find(value => value.id === handle.id && value.epoch === handle.epoch);
    if (stage === 'shade') assert.ok(before.retiring > 0, 'unrelated resources already retire before the cache release');
    const exporting = makeRequest(1, viewport.sceneSnapshot, { width: 16, height: 16 }, 'export');
    const original = structuredClone(exporting);
    h.fake.testAdapter.failNextAllocation();
    const result = await h.recovery.render(exporting).done; await flush(); // Keep the old ticket outstanding.
    assert.equal(result.outcome, 'failed'); assert.equal(result.errorCode, 'allocation-failed');
    const notices = h.notices.filter(value => value.type === 'allocation-failed'); assert.equal(notices.length, 1);
    const notice = notices[0], freed = stage === 'shade' ? 0 : 8 * 8 * 12, retiring = stage === 'shade' ? 8 * 8 * 16 : 8 * 8 * 4;
    assert.equal(notice.request, exporting); assert.equal(notice.released, freed, stage); assert.equal(notice.retiring, retiring, stage);
    assert.ok(!Object.hasOwn(notice, 'releaseUnavailable'));
    assert.equal(h.fake.diagnostics().tracked, before.tracked - freed);
    assert.equal(h.fake.diagnostics().retiring, before.retiring + retiring);
    assert.equal(h.scheduler.snapshot().outstanding, outstanding);
    assert.equal(inventory(handles[1]).state, 'retiring'); assert.deepEqual(exporting, original);
    // A second real failure cannot count the same retiring cache ownership again.
    h.fake.testAdapter.failNextAllocation();
    assert.equal((await h.recovery.render(makeRequest(1, viewport.sceneSnapshot, exporting.output, 'export')).done).errorCode, 'allocation-failed');
    await flush();
    assert.equal(h.notices.at(-1).released, 0); assert.equal(h.notices.at(-1).retiring, 0);
    h.fake.complete(ticket.ticket, { elapsedMs: 1 });
    if (stage === 'readback') {
      assert.equal(inventory(handles[1]).tickets, 0); assert.equal(inventory(handles[1]).mappings, 1);
      assert.equal(inventory(handles[1]).state, 'retiring', 'the completed fence does not end copy-out ownership');
    }
    await flush();
    for (const handle of handles) assert.equal(inventory(handle), undefined);
    assert.equal(h.scheduler.snapshot().outstanding, 0); assert.equal((await job.done).outcome, 'budget-exceeded');
  }
});

test('cancel forwards both scheduler variants unchanged and device loss settles an outstanding drain interrupted', async () => {
  const h = await rig(), job = h.recovery.render(makeRequest(1)); await flush();
  const cancellation = h.recovery.cancel(job.jobId);
  assert.equal(h.recovery.cancel(job.jobId).done, cancellation.done);
  h.fake.lose(); assert.deepEqual(await cancellation.done, { outcome: 'cancelled', submitted: 'interrupted' });
  assert.equal((await job.done).outcome, 'cancelled');
  await h.until(() => h.recovery.state().phase === 'ready'); assert.equal(h.submitted.length, 1);
  const unknown = h.recovery.cancel('retired'); assert.equal(unknown.accepted, false); assert.equal(await unknown.done, null); h.destroy();
});

test('a hidden viewport preserves its pause and recovery allowance across workspace switches', async () => {
  const h = await rig(); h.scheduler.hidden('space', true); h.fake.lose();
  await flush(); h.fake.finishPrepare(); await flush();
  assert.equal(h.scheduler.snapshot().views[0].hidden, true);
  assert.equal(h.scheduler.snapshot().outstanding, 0);
  assert.equal(h.recovery.state().automaticRecoveries, 1);
  h.scheduler.hidden('space', false); await h.until(() => h.recovery.state().phase === 'ready');
  await h.recovery.retry(); assert.equal(h.recovery.state().automaticRecoveries, 1);
  h.fake.lose(); assert.equal(h.recovery.state().phase, 'stopped'); h.destroy();
});

test('cold cancellation is accepted before scheduler registration and prevents a later automatic restart', async t => {
  const h = await rig({ cold: true }); t.after(h.destroy);
  const job = h.recovery.render(makeRequest(1));
  assert.ok(!h.scheduler.snapshot().jobs.some(value => value.jobId === job.jobId));
  const cancellation = h.recovery.cancel(job.jobId);
  assert.equal(cancellation.accepted, true);
  assert.equal(h.recovery.cancel(job.jobId).done, cancellation.done);
  assert.deepEqual(await h.finish(cancellation.done), { outcome: 'cancelled', submitted: 'none' });
  assert.equal((await job.done).outcome, 'cancelled');
  assert.ok(!h.tickets.some(value => value.desc.identity.jobId === job.jobId));
  h.fake.lose(); await h.until(() => h.recovery.state().phase === 'ready');
  assert.equal(h.submitted.length, 1, 'an accepted cancellation also clears the facade restart intent');
});

test('recovery itself interrupts the lost epoch before installing another epoch without a renderer loss observer', async t => {
  const clock = createFakeClock(), fake = createFakeBackend({ clock }); await fake.acquire();
  const raw = createScheduler({ clock, makeAdmission: createAdmission, setTimer: clock.schedule, clearTimer: clock.clear });
  raw.registerView('space'); raw.setEpoch(1);
  const request = makeRequest(1), transitions = [];
  const job = raw.request('space', { jobId: request.jobId, requestId: request.requestId, kind: 'settled', priority: 'refinement',
    plan: { request, next: () => null, exhausted: () => false, advance() { assert.fail('unissued plan'); } } });
  const scheduler = { ...raw,
    interrupted(epoch) { transitions.push(['interrupted', epoch]); return raw.interrupted(epoch); },
    setEpoch(epoch) { transitions.push(['epoch', epoch]); return raw.setEpoch(epoch); },
  };
  // No B09 observer and no automatic backend delivery: only this direct handler
  // can supply loss evidence to the real scheduler.
  const backend = { ...fake, onLoss: () => () => {} };
  const renderer = { onStatus: () => () => {}, prepare: () => fake.acquire() };
  const recovery = createRecovery({ backend, renderer, scheduler, clock });
  t.after(() => { recovery.destroy(); raw.interrupted(1); fake.destroy(); });
  fake.lose(); assert.equal(raw.snapshot().epoch, 1);
  assert.equal(recovery.onLoss({ epoch: 1, reason: 'test', message: 'observed loss' }), 'recover');
  assert.deepEqual(transitions, [['interrupted', 1], ['epoch', 0]]);
  assert.deepEqual(await job.done, { outcome: 'interrupted', reason: 'device-lost' });
  await flush(); assert.equal(recovery.state().phase, 'ready');
  assert.deepEqual(transitions, [['interrupted', 1], ['epoch', 0], ['epoch', 2]]);
});

test('destroy before the recovery microtask prevents any additional acquisition', async t => {
  const h = await rig(); t.after(h.destroy);
  const acquired = () => h.fake.log.filter(value => value.method === 'acquire').length;
  const before = acquired(); h.fake.lose(); h.recovery.destroy();
  await flush();
  assert.equal(acquired(), before, 'a destroyed recovery must not call renderer.prepare');
  assert.equal(h.backend.currentEpoch(), 0); assert.equal(h.recovery.state().phase, 'stopped');
});

test('an interrupted non-viewport job is reported once and only the viewport restarts automatically', async t => {
  const h = await rig(); t.after(h.destroy);
  const viewport = h.recovery.render(makeRequest(1)); await h.finish(viewport.done);
  const job = h.recovery.render(makeRequest(1, undefined, undefined, 'export')); await flush();
  h.fake.lose(); assert.equal((await job.done).outcome, 'interrupted');
  await h.until(() => h.recovery.state().phase === 'ready');
  assert.equal(h.submitted.filter(value => value.request.output.purpose === 'export').length, 1);
  const next = h.submitted.at(-1);
  assert.equal(next.request.output.purpose, 'interactive');
  assert.equal(h.notices.filter(value => value.type === 'interrupted' && value.request.jobId === job.jobId).length, 1);
  assert.equal((await h.finish(next.done)).outcome, 'completed');
  assert.ok(h.publications.some(value => value.requestId === next.requestId));
});

test('a policy cannot permit two automatic recovery attempts', async t => {
  const h = await rig(); let extra; t.after(() => { extra?.destroy(); h.destroy(); });
  assert.throws(() => { extra = createRecovery({ backend: h.backend, renderer: h.renderer, scheduler: h.scheduler,
    clock: h.clock, policy: { maxAutomaticRecoveries: 2 } }); }, RangeError);
});

test('render is unavailable while recovering and while stopped', async t => {
  const h = await rig(); t.after(h.destroy); h.fake.lose();
  assert.equal(h.recovery.state().phase, 'recovering');
  assert.throws(() => h.recovery.render(makeRequest(2)), { code: 'unavailable' });
  assert.equal(h.submitted.length, 0);
  await h.until(() => h.recovery.state().phase === 'ready'); h.fake.lose();
  assert.equal(h.recovery.state().phase, 'stopped');
  assert.throws(() => h.recovery.render(makeRequest(3)), { code: 'unavailable' });
});

test('duplicate budget notifications share one choice and cannot submit an export twice', async t => {
  const h = await rig({ budgets: { exportMs: 2 } }); t.after(h.destroy);
  const job = h.recovery.render(makeRequest(1, undefined, undefined, 'export')); await flush();
  h.clock.advance(2); const result = await job.done; await flush();
  const automatic = h.notices.find(value => value.type === 'budget-exceeded' && value.request.jobId === job.jobId);
  assert.ok(automatic);
  const choice = h.recovery.onBudgetExceeded({ ...job, ...result });
  assert.equal(h.notices.filter(value => value.type === 'budget-exceeded' && value.request.jobId === job.jobId).length, 1);
  assert.equal(choice.accept, automatic.accept);
  assert.equal(h.recovery.onBudgetExceeded({ ...job, ...result }), choice);
  const resumed = automatic.accept();
  assert.equal(choice.accept(), resumed); assert.equal(h.submitted.length, 2);
  assert.equal((await h.finish(resumed.done)).outcome, 'completed');
});

test('budget choices forward the scheduler continuation instead of deriving it from the reason', async t => {
  const h = await rig(); t.after(h.destroy);
  for (const [reason, continuation] of [['watchdog', 'resume'], ['elapsed-work', 'lower-cost']]) {
    const request = makeRequest(1);
    const choice = h.recovery.onBudgetExceeded({ jobId: request.jobId, request, outcome: 'budget-exceeded', reason, continuation });
    assert.equal(choice.continuation, continuation);
  }
  const request = makeRequest(1);
  assert.throws(() => h.recovery.onBudgetExceeded({ jobId: request.jobId, request, outcome: 'budget-exceeded', continuation: 'guess' }), TypeError);
});

test('prepare returns the shared automatic recovery attempt without starting another acquisition', async t => {
  const h = await rig(); t.after(h.destroy); h.fake.lose();
  let failure;
  const first = h.recovery.prepare(), second = h.recovery.prepare();
  first.catch(error => { failure = error; }); second.catch(error => { failure = error; });
  await flush();
  assert.equal(failure, undefined, 'awaiting automatic recovery must not reject unavailable');
  assert.equal(first, second);
  const receipt = await h.finish(first);
  assert.equal(receipt.epoch, 2); assert.equal(h.recovery.state().phase, 'ready');
  assert.equal(h.fake.log.filter(value => value.method === 'acquire').length, 2);
});
