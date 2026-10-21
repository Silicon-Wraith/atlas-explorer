// The WebGPU backend's ordering and failure rules over an in-memory device double (B06 fix round 1,
// Codex review r1 findings 1–9, F5, F8, F9). Headed acceptance stays in tests/space.mjs `recovery`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGpuDouble } from '../support/gpu-double.mjs';
import { createFakeClock } from '../support/fake-clock.mjs';
import { createWebGPUBackend } from '../../src/space/render/webgpu/backend.js';
import { SELF_CHECK_PIPELINE_SET } from '../../src/space/render/webgpu/pipelines.js';
import { BackendError, createAdmission, TRACKED_ALLOCATION_CAP } from '../../src/space/render/backend.js';

const code = expected => error => error instanceof BackendError && error.code === expected;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const LAYOUT = 'space-targets-v1';
function setup({ gpu: gpuOptions, ...options } = {}) {
  const gpu = createGpuDouble(gpuOptions), clock = createFakeClock(), phases = [];
  const backend = createWebGPUBackend({ canvas: gpu.canvas, clock, acquire: gpu.acquire, loadSource: gpu.loadSource, format: 'bgra8unorm', onPhase: entry => phases.push(entry), ...options });
  return { gpu, clock, phases, backend };
}
async function ready(options) {
  const context = setup(options);
  await context.backend.acquire();
  await context.backend.prepare({ epoch: context.backend.currentEpoch(), pipelineSet: SELF_CHECK_PIPELINE_SET });
  return context;
}
const identity = (backend, jobId = 'j') => ({ requestId: `r-${jobId}`, jobId, viewId: 'space', generation: { deviceEpoch: backend.currentEpoch(), viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 } });
const lease = (backend, jobId = 'j') => ({ admission: createAdmission({ epoch: backend.currentEpoch(), jobId }) });
const probe = (backend, handle, size = 1) => ({ identity: identity(backend), pipelineId: 'probe', pass: 'probe', region: { x: 0, y: 0, width: size, height: size },
  sample: { sequence: 'atlas-aa-v1', seed: 1, index: 0 }, bounds: { pixels: size * size, raySteps: 0, iterations: 0, normalFieldSamples: 0, shadowRays: 0, shadowSteps: 0, aoSamples: 0 },
  inputs: {}, outputs: { probe_target: handle }, uniforms: { origin: [0, 0], size: [size, size] } });
const targets = (backend, width = 2, height = width, output = { width, height }) => backend.configureTargets({ epoch: backend.currentEpoch(), layoutId: LAYOUT, internalSize: { width, height }, outputSize: output });
const readOf = (backend, source, region = { x: 0, y: 0, width: 1, height: 1 }) => backend.readback({ identity: identity(backend), source, region, fields: ['f'] }, lease(backend));
const entryOf = (backend, handle) => backend.diagnostics().inventory.find(item => item.id === handle.id);

test('an acquisition whose device is lost before it is published is never reported ready', async () => {
  const { gpu, backend } = setup();
  gpu.control.loseDuringAcquire = true;
  await assert.rejects(backend.acquire(), code('device-lost'));
  assert.equal(backend.currentEpoch(), 0); assert.equal(backend.diagnostics().state, 'unavailable');
  assert.equal(gpu.control.devices[0].destroyed, true, 'the lost candidate device is destroyed');
  const receipt = await backend.acquire();
  assert.ok(receipt.epoch >= 1); assert.equal(backend.diagnostics().state, 'ready');
  assert.notEqual(receipt.identity.attemptId, gpu.control.devices[0].attemptId);
});

test('a pending test-adapter loss closes admission and settles outstanding work interrupted even when its scope failed', async () => {
  const { gpu, backend } = await ready();
  const set = await targets(backend);
  gpu.control.errors.push({ op: 'createBindGroup', filter: 'validation', message: 'scoped validation failure' });
  gpu.control.fences.held = true; gpu.control.losses.held = true;
  const ticket = backend.submitBatch(probe(backend, set.handles.status), lease(backend));
  const settled = [];
  ticket.done.then(value => settled.push(value));
  const destroyed = backend.testAdapter.destroyDevice();
  gpu.control.fences.release(); await flush(); await flush();
  assert.deepEqual(settled, [], 'the ticket waits for the real loss path instead of settling failed');
  assert.throws(() => backend.submitBatch(probe(backend, set.handles.status), lease(backend)), code('unavailable'));
  assert.throws(() => backend.allocate({ name: 'model', bytes: 16, usage: 'storage' }), code('unavailable'));
  await assert.rejects(targets(backend), code('unavailable'));
  gpu.control.losses.release();
  assert.equal(await destroyed, true);
  const value = await ticket.done;
  assert.deepEqual({ outcome: value.outcome, reason: value.reason, queueCompletedAt: value.queueCompletedAt, elapsedMs: value.timing.elapsedMs }, { outcome: 'interrupted', reason: 'destroyed', queueCompletedAt: null, elapsedMs: null });
  assert.equal(settled.length, 1);
  assert.equal(backend.diagnostics().tracked, 0);
});

test('native creation is scoped, partial initialization is destroyed, and asynchronous creation failure fails consuming tickets', async () => {
  const { gpu, backend } = await ready();
  const set = await targets(backend);
  await backend.submitBatch(probe(backend, set.handles.status), lease(backend)).done;
  await readOf(backend, set.handles.status).result;
  backend.release(backend.allocate({ name: 'model', bytes: 16, usage: 'storage' }));
  for (const label of ['uniforms:probe', 'readback-staging-0', 'model']) {
    const created = gpu.control.scopeDepthAtCreate.find(item => item.label === label);
    assert.ok(created && created.depth >= 2, `${label} is created inside validation and out-of-memory scopes (${JSON.stringify(created)})`);
  }
  const before = backend.diagnostics().tracked, count = gpu.control.natives.length;
  gpu.control.failInitialMapping = true;
  assert.throws(() => backend.allocate({ name: 'model', bytes: 16, usage: 'storage', data: Uint8Array.of(1) }), code('allocation-failed'));
  assert.equal(gpu.control.natives.length, count + 1); assert.equal(gpu.control.natives.at(-1).destroyed, true, 'a partially initialized buffer is destroyed');
  assert.equal(backend.diagnostics().tracked, before);
  gpu.control.errors.push({ op: 'createBuffer', filter: 'out-of-memory', message: 'injected out of memory' });
  const failing = backend.allocate({ name: 'model', bytes: 16, usage: 'storage' });
  await flush();
  assert.match(entryOf(backend, failing).failure, /injected out of memory/, 'the failed resource is visible in diagnostics');
  const consumer = await readOf(backend, failing, { x: 0, y: 0, width: 16, height: 1 });
  const done = await consumer.done;
  assert.equal(done.outcome, 'failed'); assert.match(done.reason, /injected out of memory/); assert.equal(done.timing.elapsedMs, null);
  await assert.rejects(consumer.result, code('unavailable'));
  // A staging buffer whose creation failed is never reused.
  const fresh = await ready(), small = await targets(fresh.backend);
  fresh.gpu.control.errors.push({ op: 'createBuffer', filter: 'out-of-memory', message: 'staging out of memory' });
  const first = readOf(fresh.backend, small.handles.status);
  assert.equal((await first.done).outcome, 'failed');
  await assert.rejects(first.result);
  const second = readOf(fresh.backend, small.handles.status);
  assert.equal((await second.done).outcome, 'completed'); assert.equal((await second.result).data.length, 4);
  assert.ok(fresh.backend.diagnostics().inventory.filter(item => item.name.startsWith('readback-staging')).every(item => item.failure === undefined));
});

test('a copy-out exception rejects the readback, ends ownership once, and a later readback succeeds', async () => {
  const { gpu, backend } = await ready();
  const set = await targets(backend);
  gpu.control.failGetMappedRange = true;
  const failed = readOf(backend, set.handles.status);
  assert.equal((await failed.done).outcome, 'completed');
  await assert.rejects(failed.result, error => code('unavailable')(error) && /copy-out/.test(error.message), 'not labelled device-lost while the device is available');
  assert.equal(entryOf(backend, set.handles.status).mappings, 0, 'mapping ownership ended');
  const later = readOf(backend, set.handles.status);
  assert.equal((await later.result).data.length, 4);
  assert.equal(backend.diagnostics().state, 'ready');
});

test('reconfiguration keeps earlier target handles caller-owned until release', async () => {
  const { backend } = await ready({ cap: 72 * 4 * 2 + 4096 });
  const first = await targets(backend), second = await targets(backend);
  assert.equal(entryOf(backend, first.handles.display).state, 'live');
  const presented = backend.present({ identity: identity(backend), display: first.handles.display }, lease(backend));
  assert.equal((await presented.done).outcome, 'completed', 'the previous image can still be presented');
  for (const handle of Object.values(first.handles).flat()) backend.release(handle);
  const ids = new Set(Object.values(second.handles).flat().map(handle => handle.id));
  assert.ok(backend.diagnostics().inventory.filter(item => item.name !== 'readback-staging-0' && !item.name.startsWith('uniforms')).every(item => ids.has(item.id)), 'released earlier targets are reclaimed');
});

test('configuration snapshots its sizes before awaiting', async () => {
  const { gpu, backend } = await ready();
  const internalSize = { width: 2, height: 2 }, outputSize = { width: 4, height: 4 };
  gpu.control.scopes.held = true;
  const pending = backend.configureTargets({ epoch: backend.currentEpoch(), layoutId: LAYOUT, internalSize, outputSize });
  internalSize.width = 7000; outputSize.width = 9000;
  gpu.control.scopes.release();
  const set = await pending;
  assert.deepEqual(set.internalSize, { width: 2, height: 2 }); assert.deepEqual(set.outputSize, { width: 4, height: 4 });
  assert.equal(set.descriptions.depth.width, 2); assert.equal(gpu.canvas.width, 4);
});

test('queue timing is observed at the fence, not after the error scopes, in both resolution orders', async () => {
  for (const order of ['fence-first', 'scopes-first']) {
    const { gpu, clock, backend } = await ready();
    const set = await targets(backend);
    gpu.control.fences.held = true; gpu.control.scopes.held = true;
    const start = clock.now();
    const ticket = backend.submitBatch(probe(backend, set.handles.status), lease(backend));
    const settled = []; ticket.done.then(value => settled.push(value));
    const [firstGate, secondGate] = order === 'fence-first' ? [gpu.control.fences, gpu.control.scopes] : [gpu.control.scopes, gpu.control.fences];
    clock.advance(5); firstGate.release(); await flush();
    assert.deepEqual(settled, [], `${order}: nothing settles until both resolve`);
    clock.advance(95); secondGate.release(); await flush();
    const fenceAt = start + (order === 'fence-first' ? 5 : 100);
    assert.equal(settled[0].outcome, 'completed');
    assert.equal(settled[0].queueCompletedAt, fenceAt, order); assert.equal(settled[0].timing.elapsedMs, fenceAt - start, order);
  }
});

test('every backend operation reports a phase interval, including failure exits', async () => {
  const { gpu, phases, backend } = setup();
  gpu.control.loseDuringAcquire = true;
  await assert.rejects(backend.acquire());
  await backend.acquire();
  await backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: SELF_CHECK_PIPELINE_SET });
  const set = await targets(backend);
  backend.release(backend.allocate({ name: 'model', bytes: 16, usage: 'storage' }));
  assert.throws(() => backend.allocate({ name: 'odd', bytes: 6, usage: 'storage' }));
  assert.throws(() => backend.submitBatch(probe(backend, set.handles.status), {}));
  await backend.submitBatch(probe(backend, set.handles.status), lease(backend)).done;
  await readOf(backend, set.handles.status).result;
  await backend.present({ identity: identity(backend), display: set.handles.display }, lease(backend)).done;
  const names = new Set(phases.map(entry => entry.phase));
  for (const name of ['acquire', 'prepare', 'configure', 'allocate', 'submit', 'readback', 'readback-copy', 'present']) assert.ok(names.has(name), `phase ${name} recorded`);
  for (const name of ['acquire', 'allocate', 'submit']) assert.ok(phases.some(entry => entry.phase === name && entry.failed === true), `failure exit of ${name} recorded`);
  assert.ok(phases.every(entry => Number.isFinite(entry.start) && entry.end >= entry.start));
});

test('the cap option cannot exceed 1 GiB and GPU timestamps are refused rather than ignored', () => {
  const gpu = createGpuDouble(), base = { canvas: gpu.canvas, clock: createFakeClock(), acquire: gpu.acquire, format: 'bgra8unorm' };
  assert.throws(() => createWebGPUBackend({ ...base, cap: TRACKED_ALLOCATION_CAP + 1 }), RangeError);
  assert.doesNotThrow(() => createWebGPUBackend({ ...base, cap: 1024 }));
  assert.throws(() => createWebGPUBackend({ ...base, enableTimestamps: true }), code('unavailable'));
});

test('a readback needing horizontal subdivision is refused before its lease is consumed', async () => {
  const { backend } = await ready({ gpu: { limits: { maxBufferSize: 4096 } } });
  const set = await targets(backend, 1024, 2);
  const options = lease(backend);
  assert.throws(() => backend.readback({ identity: identity(backend), source: set.handles.status, region: { x: 0, y: 0, width: 1024, height: 2 }, fields: ['f'] }, options), code('allocation-failed'));
  assert.equal(options.admission.consume(), true, 'the lease was not consumed; the caller subdivides with one lease per region');
});

test('a pipeline rejection while a loss is pending waits for the loss and reports device-lost', async () => {
  const { gpu, backend } = setup();
  await backend.acquire();
  gpu.control.rejectPipelines = true; gpu.control.losses.held = true;
  const preparing = backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: SELF_CHECK_PIPELINE_SET });
  const outcome = [];
  preparing.then(() => outcome.push('resolved'), error => outcome.push(error.code));
  const destroyed = backend.testAdapter.destroyDevice();
  await flush(); await flush();
  assert.deepEqual(outcome, [], 'the rejection is held until the loss is observed, not reported preparation-failed');
  gpu.control.losses.release();
  await destroyed; await flush();
  assert.deepEqual(outcome, ['device-lost']);
  assert.equal(backend.diagnostics().state, 'unavailable'); assert.equal(backend.currentEpoch(), 0);
});
