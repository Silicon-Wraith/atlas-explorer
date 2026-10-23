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
const LAYOUT = 'space-targets-v2';
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
  assert.ok(backend.diagnostics().inventory.filter(item => item.name !== 'readback-staging-0' && !item.name.startsWith('uniforms') && item.state !== 'pooled').every(item => ids.has(item.id)), 'released earlier targets are pooled, never caller-live');
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

const draftGroup = (backend, handles) => {
  const base = probe(backend, handles[0]);
  return { identity: base.identity, region: base.region, sample: base.sample,
    passes: ['trace', 'normals', 'shade', 'accumulate', 'display'].map((pass, i) => ({ ...base, pass, outputs: { probe_target: handles[i] } })) };
};
test('B15-R10-F2 backend groups submit once and retain every resource and uniform until their fence', async () => {
  const { gpu, backend } = await ready();
  try {
    const set = await targets(backend), handles = [set.handles.status, set.handles.recovery, set.handles.depth, set.handles.lightingStatus, set.handles.accumulationFlags];
    gpu.control.fences.held = true;
    const before = gpu.control.submissions.length, options = lease(backend); let ticket;
    const input = draftGroup(backend, handles);
    input.passes = input.passes.map((batch, i) => ({ ...batch, uniforms: { ...batch.uniforms, origin: [i, 0] } }));
    assert.doesNotThrow(() => { ticket = backend.submitBatch(input, options); });
    input.passes[0].uniforms.origin[0] = 999;
    assert.equal(options.admission.consume(), false); assert.equal(gpu.control.submissions.length, before + 1);
    assert.equal(gpu.control.submissions.at(-1), 1, 'one command buffer');
    const commands = gpu.control.commandBuffers.at(-1).commands;
    assert.equal(commands.length, 5);
    for (const [i, command] of commands.entries()) {
      assert.equal(command.ended, true); assert.deepEqual(command.dimensions, [1, 1]);
      const buffer = command.group.descriptor.entries.find(e => e.resource.buffer)?.resource.buffer;
      assert.equal(new DataView(buffer.data.buffer).getUint32(0, true), i, 'ordered immutable per-member uniform snapshots');
    }
    const uniforms = backend.diagnostics().inventory.filter(e => e.name.startsWith('uniforms:'));
    assert.equal(uniforms.length, 5); assert.ok(uniforms.every(e => e.state === 'retiring'));
    for (const handle of handles) { backend.release(handle); assert.equal(entryOf(backend, handle).state, 'retiring'); }
    gpu.control.fences.release(); assert.equal((await ticket.done).outcome, 'completed');
    for (const handle of handles) assert.equal(entryOf(backend, handle)?.state, 'pooled');
    assert.ok(backend.diagnostics().inventory.every(e => !e.name.startsWith('uniforms:')));
  } finally { backend.destroy(); }
});

test('B15-R10-F2 invalid later group members consume no lease and submit no partial work', async () => {
  const { gpu, backend } = await ready();
  try {
    const set = await targets(backend), input = draftGroup(backend, Array(5).fill(set.handles.status));
    const before = backend.diagnostics().tracked, submissions = gpu.control.submissions.length, options = lease(backend);
    input.passes[4] = { ...input.passes[4], pipelineId: 'unprepared-final-pass' };
    assert.throws(() => backend.submitBatch(input, options), code('preparation-failed'));
    assert.equal(options.admission.consume(), true); assert.equal(gpu.control.submissions.length, submissions);
    assert.equal(backend.diagnostics().tracked, before);
  } finally { backend.destroy(); }
});

test('B15-R10-F2 group loss and captured failure settle the entire ticket and release all snapshots', async () => {
  for (const outcome of ['interrupted', 'failed']) {
    const { gpu, backend } = await ready();
    try {
      const set = await targets(backend), handle = set.handles.status;
      gpu.control.fences.held = true;
      if (outcome === 'failed') gpu.control.errors.push({ op: 'createBindGroup', filter: 'validation', message: 'group binding failed' });
      const ticket = backend.submitBatch(draftGroup(backend, Array(5).fill(handle)), lease(backend));
      backend.release(handle);
      if (outcome === 'interrupted') backend.testAdapter.injectLoss({ reason: 'group lost' });
      gpu.control.fences.release();
      const result = await ticket.done;
      assert.equal(result.outcome, outcome); assert.equal(result.timing.elapsedMs, null);
      assert.equal(entryOf(backend, handle)?.state, outcome === 'interrupted' ? undefined : 'pooled');
      assert.ok(backend.diagnostics().inventory.every(e => !e.name.startsWith('uniforms:')));
    } finally { backend.destroy(); }
  }
});

test('B15-R10-F2 group snapshot allocation failure rolls back before consuming admission', async () => {
  const { gpu, backend } = await ready();
  try {
    const set = await targets(backend), options = lease(backend), before = backend.diagnostics().tracked;
    backend.testAdapter.failNextAllocation();
    assert.throws(() => backend.submitBatch(draftGroup(backend, Array(5).fill(set.handles.status)), options), code('allocation-failed'));
    assert.equal(options.admission.consume(), true); assert.equal(gpu.control.submissions.length, 0);
    assert.equal(backend.diagnostics().tracked, before);
  } finally { backend.destroy(); }
});

test('B15-R11-F1 a third uniform allocation failure rolls back the entire group transaction', async () => {
  const { gpu, backend } = await ready();
  try {
    const set = await targets(backend), options = lease(backend), baseline = backend.diagnostics().tracked;
    const device = gpu.control.devices[0], createBuffer = device.createBuffer;
    const allocated = []; let attempts = 0;
    device.createBuffer = descriptor => {
      if (descriptor.label.startsWith('uniforms:') && ++attempts === 3) throw new Error('third uniform failed');
      const buffer = createBuffer(descriptor); allocated.push(buffer); return buffer;
    };
    assert.throws(() => backend.submitBatch(draftGroup(backend, Array(5).fill(set.handles.status)), options), code('allocation-failed'));
    assert.equal(attempts, 3); assert.equal(allocated.length, 2);
    assert.equal(backend.diagnostics().tracked, baseline, 'earlier uniforms must not leak tracked bytes');
    assert.ok(allocated.every(buffer => buffer.destroyed), 'earlier native uniforms must also be destroyed');
    assert.equal(options.admission.consume(), true, 'failure precedes lease consumption');
    assert.equal(gpu.control.submissions.length, 0);
  } finally { backend.destroy(); }
});

test('B15-R11-F1 rejected admission releases every reserved group uniform without submitting', async () => {
  const { gpu, backend } = await ready();
  try {
    const set = await targets(backend), baseline = backend.diagnostics().tracked;
    const options = lease(backend), nativeCount = gpu.control.natives.length;
    let consumed = 0;
    options.admission = { ...options.admission, consume() {
      consumed++;
      assert.equal(backend.diagnostics().tracked, baseline + 5 * 16, 'all five snapshots are reserved before consume');
      return false;
    } };
    assert.throws(() => backend.submitBatch(draftGroup(backend, Array(5).fill(set.handles.status)), options), code('no-admission'));
    assert.equal(consumed, 1);
    const uniforms = gpu.control.natives.slice(nativeCount);
    assert.equal(uniforms.length, 5);
    assert.equal(backend.diagnostics().tracked, baseline, 'consume rejection must roll back all snapshots');
    assert.ok(uniforms.every(buffer => buffer.destroyed));
    assert.equal(gpu.control.submissions.length, 0);
  } finally { backend.destroy(); }
});

test('B15 r14 released target sets remain tracked and reuse native memory with fresh handles', async () => {
  const {gpu, backend} = await ready();
  try {
    const first = await targets(backend), bytes = backend.diagnostics().tracked;
    Object.values(first.handles).flat().forEach(h => backend.release(h));
    assert.equal(backend.diagnostics().tracked, bytes, 'idle pool bytes remain charged');
    const count = gpu.control.natives.filter(n => n.kind === 'texture').length;
    const second = await targets(backend);
    assert.equal(gpu.control.natives.filter(n => n.kind === 'texture').length, count, 'no new native textures');
    assert.notEqual(second.handles.status, first.handles.status, 'released handles cannot become valid again');
    backend.release(first.handles.status);
    assert.ok(entryOf(backend, second.handles.status));
    assert.throws(() => backend.submitBatch(probe(backend, first.handles.status), lease(backend)), code('invalid-descriptor'));
    await backend.testAdapter.destroyDevice();
    assert.equal(backend.diagnostics().tracked, 0);
    await backend.acquire(); await targets(backend);
    assert.ok(gpu.control.natives.filter(n => n.kind === 'texture').length > count, 'new epoch uses new memory');
  } finally { backend.destroy(); }
});

test('B15 r14 superseded configuration releases its reservation before validation resolves', async () => {
  const {gpu, backend} = await ready();
  const controller = new AbortController();
  try {
    gpu.control.scopes.held = true;
    const pending = backend.configureTargets({epoch:backend.currentEpoch(),layoutId:LAYOUT,internalSize:{width:640,height:360},outputSize:{width:1280,height:720},signal:controller.signal});
    await flush(); assert.ok(backend.diagnostics().tracked > 0);
    controller.abort();
    assert.equal(backend.diagnostics().tracked, 0, 'cancelled reservation released synchronously');
    gpu.control.scopes.release();
    await assert.rejects(pending, /superseded/);
  } finally { gpu.control.scopes.release(); backend.destroy(); }
});

test('B15 r14 pool never reuses retained or mapping-held targets and keys output dimensions', async () => {
  const {gpu, backend}=await ready();
  try {
    const first=await targets(backend);gpu.control.maps.held=true;
    const read=readOf(backend,first.handles.status);await read.done;await flush();
    for(const [name,handles] of Object.entries(first.handles))if(name!=='display')for(const h of [handles].flat())backend.release(h);
    const before=gpu.control.natives.filter(n=>n.kind==='texture').length;
    const second=await targets(backend);
    assert.equal(gpu.control.natives.filter(n=>n.kind==='texture').length,before+2,'held status and retained display need distinct memory');
    assert.equal(entryOf(backend,first.handles.status).state,'retiring');
    assert.equal(entryOf(backend,first.handles.display).state,'live');
    gpu.control.maps.release();await read.result;
    assert.equal(entryOf(backend,first.handles.status).state,'pooled');
    for(const h of Object.values(second.handles).flat())backend.release(h);
    const count=gpu.control.natives.filter(n=>n.kind==='texture').length;
    await targets(backend,2,2,{width:4,height:4});
    assert.equal(gpu.control.natives.filter(n=>n.kind==='texture').length,count+11,'different output size is a distinct set key');
  } finally {gpu.control.maps.release();backend.destroy();}
});

test('B15 r14 4K spare geometry and working sets reuse partial pool under the tracked cap', async () => {
  const {backend}=await ready({gpu:{limits:{maxStorageBufferBindingSize:256*2**20}}});
  const geometry=new Set(['depth','status','normal','recovery']);
  try {
    const draft=await targets(backend,640,360,{width:1280,height:720});
    Object.values(draft.handles).flat().forEach(h=>backend.release(h));
    const spare=await targets(backend,3840,2160);
    for(const [name,handles] of Object.entries(spare.handles))if(!geometry.has(name))for(const h of [handles].flat())backend.release(h);
    const work=await targets(backend,3840,2160);
    assert.ok(backend.diagnostics().tracked >= 3840*2160*96);
    assert.ok(backend.diagnostics().peak <= TRACKED_ALLOCATION_CAP);
    // The successful resize now evicts the old draft cache. Supply a current-key idle
    // texture and enough explicit pressure to exercise reserve's eviction separately.
    backend.release(work.handles.accumulation[0]);
    const padding=backend.allocate({name:'pressure-padding',bytes:16*2**20,usage:'storage'});
    const before=backend.diagnostics().tracked;
    // A normal allocation evicts idle textures first; live and retained targets survive.
    const buffer=backend.allocate({name:'pressure',bytes:256*2**20,usage:'storage'});
    assert.ok(backend.diagnostics().tracked<=TRACKED_ALLOCATION_CAP);
    assert.ok(backend.diagnostics().tracked<before+256*2**20);
    assert.equal(entryOf(backend,work.handles.display).state,'live');
    backend.release(buffer);backend.release(padding);
  } finally {backend.destroy();}
});

test('B15 r14 a superseded configuration served from the pool returns its textures to the pool', async () => {
  const {gpu, backend} = await ready();
  try {
    const first = await targets(backend);
    Object.values(first.handles).flat().forEach(h => backend.release(h));
    const textures = () => gpu.control.natives.filter(n => n.kind === 'texture' && !n.destroyed).length, before = textures();
    const controller = new AbortController();
    const pending = backend.configureTargets({epoch:backend.currentEpoch(),layoutId:LAYOUT,internalSize:{width:2,height:2},outputSize:{width:2,height:2},signal:controller.signal});
    controller.abort();
    await assert.rejects(pending, /superseded/);
    assert.equal(textures(), before, 'no healthy pooled texture was destroyed');
    assert.equal(backend.diagnostics().inventory.filter(e => e.width && e.state === 'pooled').length, 11);
    const again = gpu.control.natives.filter(n => n.kind === 'texture').length;
    await targets(backend);
    assert.equal(gpu.control.natives.filter(n => n.kind === 'texture').length, again, 'the next configuration still reuses the set');
  } finally { backend.destroy(); }
});

test('B15 r14b a configuration served from the pool is still error-scoped (spec §9.1 Configuration)', async () => {
  const {gpu, backend} = await ready();
  try {
    const first = await targets(backend);
    Object.values(first.handles).flat().forEach(h => backend.release(h));
    const created = gpu.control.natives.filter(n => n.kind === 'texture').length;
    gpu.control.scopes.held = true;
    let settled = false;
    const pending = targets(backend).then(value => { settled = true; return value; });
    await flush(); await flush();
    assert.equal(settled, false, 'the pool-served configure awaits its error scope like a fresh one');
    gpu.control.scopes.release();
    await pending;
    assert.equal(gpu.control.natives.filter(n => n.kind === 'texture').length, created, 'still served from the pool');
  } finally { gpu.control.scopes.release(); backend.destroy(); }
});

test('B15-O2 reclaim bounds idle bytes while 4K partial reuse preserves held geometry under the total cap', async () => {
  const {gpu, backend} = await ready();
  const geometry = new Set(['depth', 'status', 'normal', 'recovery']);
  try {
    const spare = await targets(backend, 3840, 2160);
    const held = Object.entries(spare.handles).filter(([name]) => geometry.has(name)).flatMap(([, handles]) => [handles].flat());
    for (const [name, handles] of Object.entries(spare.handles)) if (!geometry.has(name)) for (const handle of [handles].flat()) {
      backend.release(handle);
      const idle = backend.diagnostics().inventory.filter(e => e.state === 'pooled');
      assert.ok(idle.reduce((sum, e) => sum + e.bytes, 0) <= 256 * 2**20, 'reclaim trims bytes immediately');
      assert.ok(idle.length <= 44);
    }
    const idleCount = backend.diagnostics().inventory.filter(e => e.state === 'pooled').length;
    assert.ok(idleCount > 0 && idleCount < 7, 'some 4K working textures survive, some are trimmed');
    const before = gpu.control.natives.filter(n => n.kind === 'texture').length;
    const work = await targets(backend, 3840, 2160);
    assert.equal(gpu.control.natives.filter(n => n.kind === 'texture').length - before, 11 - idleCount);
    assert.ok(backend.diagnostics().peak <= TRACKED_ALLOCATION_CAP);
    assert.ok(held.every(h => entryOf(backend, h)?.state === 'live'), 'spare geometry never evicted');
    Object.values(work.handles).flat().forEach(h => backend.release(h));
    held.forEach(h => backend.release(h));
    assert.ok(backend.diagnostics().tracked <= 256 * 2**20, 'fully idle 4K cache stays bounded');
  } finally { backend.destroy(); }
});

test('B15-O2 successful 4K to 720p configure evicts incompatible idle keys and late releases cannot refill them', async () => {
  const {gpu, backend} = await ready();
  try {
    const large = await targets(backend, 3840, 2160);
    gpu.control.maps.held = true;
    const read = readOf(backend, large.handles.status); await read.done; await flush();
    for (const [name, handles] of Object.entries(large.handles)) if (name !== 'display') for (const handle of [handles].flat()) backend.release(handle);
    const status = entryOf(backend, large.handles.status);
    assert.equal(status.state, 'retiring'); assert.equal(entryOf(backend, large.handles.display).state, 'live');
    const small = await targets(backend, 1280, 720);
    assert.equal(backend.diagnostics().inventory.filter(e => e.state === 'pooled' && e.width === 3840).length, 0);
    assert.equal(entryOf(backend, large.handles.status).state, 'retiring', 'mapping survives resize');
    assert.equal(entryOf(backend, large.handles.display).state, 'live', 'caller-held display survives resize');
    gpu.control.maps.release(); await read.result;
    backend.release(large.handles.display);
    assert.equal(entryOf(backend, large.handles.status), undefined); assert.equal(entryOf(backend, large.handles.display), undefined);
    Object.values(small.handles).flat().forEach(h => backend.release(h));
    assert.ok(backend.diagnostics().inventory.filter(e => e.state === 'pooled').every(e => e.width === 1280));
    const before = gpu.control.natives.filter(n => n.kind === 'texture').length;
    await targets(backend, 1280, 720);
    assert.equal(gpu.control.natives.filter(n => n.kind === 'texture').length, before, 'current-size cache still works');
  } finally { gpu.control.maps.release(); backend.destroy(); }
});

test('B15-O2 a failed output-size configuration preserves the prior idle key', async () => {
  const {gpu, backend} = await ready();
  try {
    const first = await targets(backend);
    Object.values(first.handles).flat().forEach(h => backend.release(h));
    gpu.control.scopes.held = true;
    gpu.control.errors.push({ op: 'createTexture', filter: 'out-of-memory', message: 'new output rejected' });
    const failed = targets(backend, 2, 2, { width: 4, height: 4 });
    const rejected = assert.rejects(failed, /new output rejected/);
    assert.equal(backend.diagnostics().inventory.filter(e => e.state === 'pooled').length, 11, 'scope still pending');
    gpu.control.scopes.release(); await rejected;
    assert.equal(backend.diagnostics().inventory.filter(e => e.state === 'pooled').length, 11, 'failed configure did not activate its key');
    const before = gpu.control.natives.filter(n => n.kind === 'texture').length;
    await targets(backend);
    assert.equal(gpu.control.natives.filter(n => n.kind === 'texture').length, before);
  } finally { gpu.control.scopes.release(); backend.destroy(); }
});
