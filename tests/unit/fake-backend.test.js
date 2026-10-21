import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBackend } from '../support/fake-backend.mjs';
import { createFakeClock } from '../support/fake-clock.mjs';
import { assertBackend, createAdmission, createBatch, createPipelineSet } from '../../src/space/render/backend.js';

const identity = epoch => ({ requestId: 'r1', jobId: 'j1', viewId: 'space', generation: {
  deviceEpoch: epoch, viewRevision: 1, geometryRevision: 1, appearanceRevision: 1,
} });
const lease = backend => ({ admission: createAdmission({ epoch: backend.currentEpoch(), jobId: 'j1' }) });
const pipelineSet = () => createPipelineSet({ id: 'test', descriptors: [{ pipelineId: 'probe-test', kind: 'compute',
  sourceIds: ['probe-test.wgsl'], entryPoint: 'probe', constants: {},
  bindings: [{ slot: 'status', type: 'storage-texture', access: 'write' }], uniformLayout: { byteLength: 0, fields: [] },
}] });
async function ready(options = {}) {
  const clock = options.clock ?? createFakeClock();
  const backend = createFakeBackend({ ...options, clock });
  assertBackend(backend); await backend.acquire();
  const prepared = backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: pipelineSet() }); backend.finishPrepare(); await prepared;
  return backend;
}
const resource = (backend, bytes = 16) => backend.allocate({ name: 'status', bytes, width: bytes / 4, height: 1, format: 'r32uint', bytesPerTexel: 4 });
const batch = (backend, handle, patch = {}) => createBatch({ identity: identity(backend.currentEpoch()), pipelineId: 'probe-test', pass: 'probe',
  region: { x: 0, y: 0, width: 1, height: 1 }, sample: { sequence: 'atlas-aa-v1', seed: 1, index: 0 },
  bounds: { pixels: 1, raySteps: 0, iterations: 0, normalFieldSamples: 0, shadowRays: 0, shadowSteps: 0, aoSamples: 0 },
  inputs: {}, outputs: { status: handle }, uniforms: {}, ...patch,
});
const code = expected => error => error.code === expected;

test('allocation beyond the cap fails before any resource exists and leaves accounting unchanged', async () => {
  const backend = await ready({ cap: 16 }), before = backend.diagnostics();
  assert.throws(() => resource(backend, 20), code('allocation-failed')); assert.deepEqual(backend.diagnostics(), before);
  assert.equal(backend.diagnostics().inventory.length, 0); resource(backend); assert.equal(backend.diagnostics().tracked, 16);
});

test('released bytes stay tracked while a ticket references the resource and leave when it settles', async () => {
  const backend = await ready(), handle = resource(backend), ticket = backend.submitBatch(batch(backend, handle), lease(backend));
  backend.release(handle); assert.equal(backend.diagnostics().tracked, 16); assert.equal(backend.diagnostics().retiring, 16);
  backend.complete(ticket, { elapsedMs: 8 }); assert.equal((await ticket.done).outcome, 'completed');
  assert.equal(backend.diagnostics().tracked, 0); assert.equal(backend.diagnostics().peak, 16);
});

test('a loss settles every outstanding ticket interrupted and a new acquisition advances the epoch', async () => {
  const backend = await ready(), epoch = backend.currentEpoch(), handle = resource(backend);
  const tickets = [backend.submitBatch(batch(backend, handle), lease(backend)), backend.present({ identity: identity(epoch), display: handle }, lease(backend))];
  let event, observedState, observedEpoch;
  backend.onLoss(value => { event = value; observedState = backend.diagnostics().state; observedEpoch = backend.currentEpoch(); });
  backend.lose({ reason: 'unknown' }); assert.equal(event.epoch, epoch);
  assert.equal(observedState, 'unavailable'); assert.equal(observedEpoch, 0);
  assert.equal(backend.log.some(entry => entry.method === 'listener-error'), false);
  for (const ticket of tickets) assert.equal((await ticket.done).outcome, 'interrupted');
  assert.equal(backend.complete(tickets[0], { elapsedMs: 1 }), false);
  assert.equal(backend.diagnostics().tracked, 0); assert.equal((await backend.acquire()).epoch, epoch + 1);
});

test('submission without a lease is refused', async () => {
  const backend = await ready(), handle = resource(backend), id = identity(backend.currentEpoch());
  for (const submit of [options => backend.submitBatch(batch(backend, handle), options),
    options => backend.readback({ identity: id, source: handle, region: { x: 0, y: 0, width: 1, height: 1 }, fields: ['status'] }, options),
    options => backend.present({ identity: id, display: handle }, options)]) {
    assert.throws(() => submit(), code('no-admission'));
    const admission = lease(backend); const ticket = submit(admission);
    assert.throws(() => submit(admission), code('no-admission')); backend.complete(ticket, { elapsedMs: 1 }); await ticket.done;
  }
});

test('completion order is under the test\'s control', async () => {
  const backend = await ready(), handle = resource(backend), order = [];
  const tickets = Array.from({ length: 3 }, (_, index) => {
    const ticket = backend.submitBatch(batch(backend, handle), lease(backend)); ticket.done.then(() => order.push(index)); return ticket;
  });
  backend.complete('newest', { elapsedMs: 3 }); await tickets[2].done;
  backend.complete('oldest', { elapsedMs: 4 }); await tickets[0].done;
  backend.complete('next', { elapsedMs: 5 }); await tickets[1].done;
  assert.deepEqual(order, [2, 0, 1]);
});

test('preparation is controllable, reports progress and submits no hidden queue work', async () => {
  const backend = createFakeBackend({ clock: createFakeClock() }); await backend.acquire();
  const events = [], preparation = backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: pipelineSet(), onProgress: value => events.push(value) });
  let settled = false; preparation.then(() => { settled = true; }); await Promise.resolve(); assert.equal(settled, false);
  backend.finishPrepare(); const receipt = await preparation;
  assert.deepEqual(receipt.preparedPipelineIds, ['probe-test']); assert.equal(receipt.pipelineSetId, 'test');
  assert.equal(events.at(-1).completed, 1); assert.equal(events.at(-1).total, 1);
  assert.equal(backend.log.filter(item => ['submitBatch', 'present', 'readback'].includes(item.method)).length, 0);
  const rejected = backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: pipelineSet() });
  backend.failPrepare('probe-test'); await assert.rejects(rejected, code('preparation-failed'));
  const failing = createFakeBackend({ clock: createFakeClock(), failPrepareAt: 'probe-test' }); await failing.acquire();
  const failed = failing.prepare({ epoch: failing.currentEpoch(), pipelineSet: pipelineSet() }); failing.finishPrepare(); await assert.rejects(failed, code('preparation-failed'));
});

test('old epoch and foreign job leases cannot submit and a stale descriptor cannot consume a valid lease', async () => {
  const backend = await ready(), old = lease(backend); backend.lose({ reason: 'test' }); await backend.acquire();
  const prepared = backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: pipelineSet() }); backend.finishPrepare(); await prepared;
  const handle = resource(backend), valid = lease(backend);
  assert.throws(() => backend.submitBatch(batch(backend, handle), old), code('stale-epoch'));
  assert.throws(() => backend.submitBatch(batch(backend, handle), { admission: createAdmission({ epoch: backend.currentEpoch(), jobId: 'other' }) }), code('no-admission'));
  assert.throws(() => backend.submitBatch(batch(backend, handle, { identity: identity(1) }), valid), code('stale-epoch'));
  const ticket = backend.submitBatch(batch(backend, handle), valid); backend.complete(ticket, { elapsedMs: 1 }); assert.equal((await ticket.done).outcome, 'completed');
});

test('target replacement is transactional and counts each actual internal dimension', async () => {
  const backend = await ready({ cap: 1000 }), input = { epoch: backend.currentEpoch(), layoutId: 'space-targets-v1', internalSize: { width: 2, height: 2 }, outputSize: { width: 4, height: 4 } };
  const targets = await backend.configureTargets(input); assert.equal(backend.diagnostics().tracked, 72 * 4);
  assert.equal(targets.handles.accumulation.length, 2); assert.equal(targets.descriptions.display.width, 2);
  const before = backend.diagnostics(); backend.testAdapter.failNextAllocation();
  await assert.rejects(backend.configureTargets(input), code('allocation-failed')); assert.deepEqual(backend.diagnostics(), before);
  await assert.rejects(backend.configureTargets({ ...input, internalSize: { width: 4, height: 4 } }), code('allocation-failed'));
  const ticket = backend.present({ identity: identity(backend.currentEpoch()), display: targets.handles.display }, lease(backend));
  backend.complete(ticket, { elapsedMs: 2 }); assert.equal((await ticket.done).outcome, 'completed');
  await backend.configureTargets(input); assert.equal(backend.diagnostics().tracked, 288);
});

test('readback stages exact region bytes and keeps mapping ownership after queue completion', async () => {
  const backend = await ready(), handle = backend.allocate({ name: 'pixels', bytes: 32, width: 4, height: 2, format: 'r32uint', bytesPerTexel: 4 });
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i); backend.stage(handle, bytes); bytes.fill(255);
  const read = backend.readback({ identity: identity(backend.currentEpoch()), source: handle, region: { x: 1, y: 0, width: 2, height: 2 }, fields: ['status'] }, lease(backend));
  backend.release(handle); backend.complete(read, { elapsedMs: 4 });
  assert.equal(backend.diagnostics().retiring, 32); assert.ok(backend.diagnostics().tracked >= 32 + 512);
  assert.equal((await read.done).outcome, 'completed');
  const result = await read.result; assert.deepEqual(Array.from(result.data), [...Array.from({ length: 8 }, (_, i) => i + 4), ...Array.from({ length: 8 }, (_, i) => i + 20)]);
  assert.equal(backend.diagnostics().retiring, 0); assert.equal(backend.diagnostics().tracked, 512);
  const staging = backend.diagnostics().inventory.filter(item => item.name.startsWith('readback-staging'));
  assert.equal(staging.length, 1); assert.equal(staging[0].bytesPerRow, 256);
});

test('readbacks enforce 256 rows and two staging buffers and loss rejects outstanding copy-out', async () => {
  const backend = await ready(), handle = backend.allocate({ name: 'status', bytes: 4 * 257, width: 1, height: 257, bytesPerTexel: 4, format: 'r32uint' });
  const desc = { identity: identity(backend.currentEpoch()), source: handle, region: { x: 0, y: 0, width: 1, height: 1 }, fields: ['status'] };
  assert.throws(() => backend.readback({ ...desc, region: { ...desc.region, height: 257 } }, lease(backend)), code('invalid-descriptor'));
  const a = backend.readback(desc, lease(backend)), b = backend.readback(desc, lease(backend));
  assert.throws(() => backend.readback(desc, lease(backend)), code('allocation-failed'));
  const aFailure = assert.rejects(a.result, code('device-lost')), bFailure = assert.rejects(b.result, code('device-lost'));
  backend.complete(a, { elapsedMs: 1 }); backend.lose({ reason: 'unknown' });
  await Promise.all([aFailure, bFailure]); assert.equal((await b.done).outcome, 'interrupted'); assert.equal(backend.diagnostics().tracked, 0);
});

test('retained owners and all ticket references must end before retiring bytes leave accounting', async () => {
  const backend = await ready(), handle = resource(backend); backend.retain(handle, 'published');
  const tickets = [backend.submitBatch(batch(backend, handle), lease(backend)), backend.present({ identity: identity(backend.currentEpoch()), display: handle }, lease(backend))];
  backend.release(handle); backend.complete(tickets[0], { elapsedMs: 1 }); await tickets[0].done;
  assert.equal(backend.diagnostics().tracked, 16); backend.complete(tickets[1], { elapsedMs: 2 }); await tickets[1].done;
  assert.equal(backend.diagnostics().tracked, 16); backend.retire('published'); assert.equal(backend.diagnostics().tracked, 0);
});

test('ticket failures keep identity and truthful timing and reclaim released resources', async () => {
  const clock = createFakeClock(10), backend = await ready({ clock }), handle = resource(backend);
  const ticket = backend.submitBatch(batch(backend, handle), lease(backend)); assert.equal(ticket.submittedAt, 10);
  clock.advance(7); backend.complete(ticket, { elapsedMs: 7, timestampMs: 2 });
  assert.deepEqual(await ticket.done, { outcome: 'completed', reason: null, queueCompletedAt: 17, timing: { method: 'queue-completion', elapsedMs: 7, timestampMs: 2 } });
  assert.deepEqual(ticket.identity, identity(backend.currentEpoch()));
  const failed = backend.submitBatch(batch(backend, handle), lease(backend)); backend.release(handle); backend.fail(failed, new Error('validation'));
  const result = await failed.done; assert.equal(result.outcome, 'failed'); assert.equal(result.reason, 'validation'); assert.equal(result.queueCompletedAt, null); assert.equal(result.timing.elapsedMs, null);
  assert.equal(backend.diagnostics().tracked, 0);
});

test('loss invalidates preparation and terminal destroy suppresses recovery and listener faults', async () => {
  const backend = await ready(), epoch = backend.currentEpoch(), pending = backend.prepare({ epoch, pipelineSet: pipelineSet() });
  const rejected = assert.rejects(pending, code('device-lost')); let called = 0;
  backend.onLoss(() => { throw new Error('observer'); }); const unsubscribe = backend.onLoss(() => { called++; });
  backend.testAdapter.destroyDevice(); await rejected; assert.equal(called, 1); assert.equal(backend.finishPrepare(), false);
  unsubscribe(); const receipt = await backend.acquire(); assert.equal(receipt.epoch, epoch + 1);
  assert.equal(receipt.identity.vendor, 'unavailable'); backend.destroy(); backend.destroy();
  assert.equal(backend.diagnostics().state, 'destroyed'); await assert.rejects(backend.acquire(), code('unavailable'));
  assert.equal(called, 1); assert.equal(backend.diagnostics().tracked, 0);
});

test('fake clock orders equal deadlines, clears timers and runs due work deterministically', () => {
  const clock = createFakeClock(5), calls = [];
  clock.schedule(() => { calls.push('first'); clock.schedule(() => calls.push('nested'), 0); }, 10);
  const cancelled = clock.schedule(() => calls.push('cancelled'), 5); clock.clear(cancelled);
  clock.schedule(() => calls.push('second'), 10); clock.advance(9); assert.deepEqual(calls, []);
  clock.advance(1); assert.deepEqual(calls, ['first', 'second', 'nested']); assert.equal(clock.now(), 15);
  clock.schedule(() => calls.push('due'), 0); clock.runDue(); assert.equal(calls.at(-1), 'due');
  assert.throws(() => clock.advance(-1), RangeError); assert.throws(() => clock.schedule(() => {}, Infinity), RangeError);
});

test('uniform uploads are snapshotted, separately allocated and held until each ticket settles', async () => {
  const backend = await ready(), set = pipelineSet();
  const descriptor = { ...set.descriptors[0], bindings: [...set.descriptors[0].bindings, { slot: 'params', type: 'uniform-buffer', access: 'read' }], uniformLayout: { byteLength: 16, fields: [{ name: 'value', type: 'u32', offset: 0 }] } };
  const prepared = backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: createPipelineSet({ id: 'uniforms', descriptors: [descriptor] }) });
  backend.finishPrepare(); await prepared;
  const handle = resource(backend), uniforms = { value: 7 }, input = batch(backend, handle, { uniforms });
  const first = backend.submitBatch(input, lease(backend)); uniforms.value = 99;
  const second = backend.submitBatch(batch(backend, handle, { uniforms }), lease(backend));
  assert.equal(input.uniforms.value, 7); assert.equal(backend.diagnostics().tracked, 48);
  assert.equal(backend.diagnostics().inventory.filter(item => item.name === 'uniforms').length, 2);
  assert.equal(backend.diagnostics().retiring, 32);
  backend.complete(second, { elapsedMs: 2 }); await second.done; assert.equal(backend.diagnostics().tracked, 32);
  backend.complete(first, { elapsedMs: 3 }); await first.done; assert.equal(backend.diagnostics().tracked, 16);
  assert.throws(() => backend.submitBatch(batch(backend, handle, { uniforms: { value: -1 } }), lease(backend)), code('invalid-descriptor'));
});

test('invalid bindings, foreign handles and in-flight staging writes are refused before submission', async () => {
  const backend = await ready(), other = await ready(), handle = resource(backend), foreign = resource(other);
  assert.throws(() => backend.submitBatch(batch(backend, foreign), lease(backend)), code('invalid-descriptor'));
  const admission = lease(backend);
  assert.throws(() => backend.submitBatch(batch(backend, handle, { outputs: { mystery: handle } }), admission), code('invalid-descriptor'));
  const ticket = backend.submitBatch(batch(backend, handle), admission);
  assert.throws(() => backend.stage(handle, new Uint8Array(16)), code('invalid-descriptor'));
  backend.complete(ticket, { elapsedMs: 1 }); await ticket.done;
  backend.stage(handle, new Uint8Array(16)); assert.ok(backend.log.some(entry => entry.method === 'stage'));
});

test('the fake supports a 4K logical target set without allocating host pixel arrays', async () => {
  const backend = await ready(), targets = await backend.configureTargets({ epoch: backend.currentEpoch(), layoutId: 'space-targets-v1', internalSize: { width: 3840, height: 2160 }, outputSize: { width: 3840, height: 2160 } });
  assert.equal(backend.diagnostics().tracked, 597196800);
  for (const value of Object.values(targets.handles)) for (const handle of Array.isArray(value) ? value : [value]) backend.release(handle);
  assert.equal(backend.diagnostics().tracked, 0); assert.equal(backend.diagnostics().inventory.length, 0);
  assert.equal(backend.diagnostics().peak, 597196800);
});

test('byte-buffer readback uses byte offsets and returns an owned copy', async () => {
  const backend = await ready(), handle = backend.allocate({ name: 'model', bytes: 8, usage: 'storage' });
  backend.stage(handle, Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]));
  const desc = { identity: identity(backend.currentEpoch()), source: handle, region: { x: 2, y: 0, width: 3, height: 1 }, fields: ['model'] };
  const first = backend.readback(desc, lease(backend)); backend.complete(first, { elapsedMs: 1 });
  const bytes = (await first.result).data; assert.deepEqual(Array.from(bytes), [2, 3, 4]); bytes.fill(0);
  const second = backend.readback(desc, lease(backend)); backend.complete(second, { elapsedMs: 1 });
  assert.deepEqual(Array.from((await second.result).data), [2, 3, 4]);
});

test('acquiring a ready backend is refused without changing the epoch or resources', async () => {
  const backend = await ready(); resource(backend); const before = backend.diagnostics();
  await assert.rejects(backend.acquire(), code('unavailable')); assert.deepEqual(backend.diagnostics(), before);
});

test('a model buffer allocated with initial data reads back its bytes and is counted', async () => {
  const backend = await ready(), source = Buffer.from([3, 1, 4, 1]); // Buffer is a Uint8Array; slice() would alias it.
  let handle;
  assert.doesNotThrow(() => { handle = backend.allocate({ name: 'model', bytes: 8, usage: 'storage', data: source }); });
  source.fill(255); assert.equal(backend.diagnostics().tracked, 8);
  assert.equal(backend.log.filter(entry => ['submitBatch', 'readback', 'present'].includes(entry.method)).length, 0);
  const read = backend.readback({ identity: identity(backend.currentEpoch()), source: handle, region: { x: 0, y: 0, width: 8, height: 1 }, fields: ['model'] }, lease(backend));
  backend.complete(read, { elapsedMs: 1 });
  assert.deepEqual(Array.from((await read.result).data), [3, 1, 4, 1, 0, 0, 0, 0]);
  assert.equal(backend.log.filter(entry => ['submitBatch', 'present'].includes(entry.method)).length, 0);
  backend.release(handle); assert.equal(backend.diagnostics().inventory.some(entry => entry.name === 'model'), false);
});

test('production allocation validates usage, alignment and data before accounting or resource creation', async () => {
  const backend = await ready(), before = backend.diagnostics();
  for (const desc of [{ usage: 'vertex' }, { bytes: 7 }, { data: [1] }, { data: new Uint8Array(9) }]) {
    assert.throws(() => backend.allocate({ name: 'model', bytes: 8, usage: 'storage', ...desc }), code('invalid-descriptor'));
    assert.deepEqual(backend.diagnostics(), before);
  }
  const uniform = backend.allocate({ name: 'constant', bytes: 16, usage: 'uniform' });
  assert.equal(backend.diagnostics().tracked, 16); backend.release(uniform);
});

test('read-write slots require one handle and render pipelines cannot be submitted as compute batches', async () => {
  const backend = await ready();
  const compute = { ...pipelineSet().descriptors[0], bindings: [{ slot: 'state', type: 'storage-buffer', access: 'read-write' }] };
  const { entryPoint, ...base } = compute;
  const render = { ...base, pipelineId: 'present-test', kind: 'render', vertexEntryPoint: 'vs', fragmentEntryPoint: 'fs', bindings: [] };
  let set;
  assert.doesNotThrow(() => { set = createPipelineSet({ id: 'rw', descriptors: [compute, render] }); });
  const preparation = backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: set }); backend.finishPrepare(); await preparation;
  const a = backend.allocate({ name: 'a', bytes: 16, usage: 'storage' }), b = backend.allocate({ name: 'b', bytes: 16, usage: 'storage' });
  const input = batch(backend, a, { inputs: { state: a }, outputs: { state: b } });
  assert.throws(() => backend.submitBatch(input, lease(backend)), code('invalid-descriptor'));
  const ticket = backend.submitBatch(batch(backend, a, { inputs: { state: a }, outputs: { state: a } }), lease(backend));
  backend.complete(ticket, { elapsedMs: 1 }); await ticket.done;
  assert.throws(() => backend.submitBatch(batch(backend, a, { pipelineId: 'present-test', outputs: {} }), lease(backend)), code('invalid-descriptor'));
});

test('uniform bindings distinguish generated fields from explicitly allocated input buffers', async () => {
  const backend = await ready(), handle = resource(backend);
  const binding = { slot: 'params', type: 'uniform-buffer', access: 'read' };
  const base = { ...pipelineSet().descriptors[0], bindings: [...pipelineSet().descriptors[0].bindings, binding] };
  const prepare = async descriptor => {
    const pending = backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: createPipelineSet({ id: 'uniform-bindings', descriptors: [descriptor] }) });
    backend.finishPrepare(); await pending;
  };
  await prepare(base);
  assert.throws(() => backend.submitBatch(batch(backend, handle), lease(backend)), code('invalid-descriptor'));
  const uniform = backend.allocate({ name: 'params', bytes: 16, usage: 'uniform' });
  const explicit = backend.submitBatch(batch(backend, handle, { inputs: { params: uniform } }), lease(backend));
  backend.complete(explicit, { elapsedMs: 1 }); await explicit.done;
  await prepare({ ...base, uniformLayout: { byteLength: 16, fields: [{ name: 'count', type: 'u32', offset: 0 }] } });
  assert.throws(() => backend.submitBatch(batch(backend, handle, { inputs: { params: uniform }, uniforms: { count: 1 } }), lease(backend)), code('invalid-descriptor'));
  const generated = backend.submitBatch(batch(backend, handle, { uniforms: { count: 1 } }), lease(backend));
  backend.complete(generated, { elapsedMs: 1 }); assert.equal((await generated.done).outcome, 'completed');
});
