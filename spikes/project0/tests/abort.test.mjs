// spikes/project0/tests/abort.test.mjs — a stalled queue or mapping must end the experiment promptly, never hang.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.GPUBufferUsage ??= { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128 };
globalThis.GPUMapMode ??= { READ: 1 };
const { createAbort, experiment } = await import('../gpu/abort.js');
const { createAllocator } = await import('../gpu/alloc.js');
const { createWatchdog } = await import('../gpu/watchdog.js');
const { traceList, readBack, dispatchOnce } = await import('../gpu/webgpu.js');

const never = () => new Promise(() => {});
function stuckDevice({ queue = true, map = true } = {}) {
  let submits = 0, unmaps = 0;
  const pass = { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} };
  return { submits: () => submits, device: {
    createBuffer: d => ({ size: d.size, destroy() {}, mapAsync: map ? never : async () => {}, getMappedRange: () => new ArrayBuffer(d.size), unmap() { unmaps++; } }),
    createBindGroup: () => ({}), createCommandEncoder: () => ({ beginComputePass: () => pass, copyBufferToBuffer() {}, finish: () => ({}) }),
    queue: { submit() { submits++; }, writeBuffer() {}, onSubmittedWorkDone: queue ? never : async () => {} } }, unmaps: () => unmaps };
}
const pipelines = { 'trace_list/sphere': { getBindGroupLayout: () => ({}) } };
const profile = { k: 1, floor: 1e-6, factor: 0, H: 720, steps: 512, iterations: 0 };

test('a never-completing queue is stopped by the watchdog within its bound, and traceList rejects', async () => {
  const { abort, watchdog, alloc } = experiment({ capBytes: 2 ** 30, createAllocator, createWatchdog, stallMs: 80 });
  const stuck = stuckDevice();
  const t0 = Date.now();
  await assert.rejects(traceList({ device: stuck.device, alloc, watchdog, abort, pipelines, field: 'sphere', profile, origins: new Float32Array(3 * 2000), directions: new Float32Array(3 * 2000) }), /aborted: stall/);
  assert.ok(Date.now() - t0 < 2000, 'must not wait for the GPU promise');
  assert.equal(stuck.submits(), 2, 'no submission after the outstanding limit and the stall');
  assert.match(abort.invalidation(), /no observable progress for 5 s/);
  assert.equal(alloc.inventory().bytes, 0, 'every buffer is released without awaiting a drain');
  watchdog.dispose();
});

test('a mapping that never resolves after successful queue work is a bounded harness readback timeout, with no external abort', async () => {
  const { abort, watchdog, alloc } = experiment({ capBytes: 2 ** 30, createAllocator, createWatchdog, stallMs: 30 });
  const stuck = stuckDevice({ queue: false });                                          // queue work completes; the map never does
  const t0 = Date.now();
  await assert.rejects(readBack(stuck.device, alloc, {}, 16, abort, watchdog, 60), /harness readback timeout/);
  assert.ok(Date.now() - t0 < 1000); assert.equal(alloc.inventory().bytes, 0);
  assert.equal(stuck.unmaps(), 1, 'the timed-out mapping is cancelled with unmap()');
  watchdog.dispose();
});

test('a registered single dispatch that never completes is stopped by the watchdog', async () => {
  const { abort, watchdog } = experiment({ capBytes: 2 ** 30, createAllocator, createWatchdog, stallMs: 30 });
  const stuck = stuckDevice();
  await assert.rejects(dispatchOnce(stuck.device, watchdog, abort, () => {}, 'primitives'), /aborted: stall/);
  assert.match(abort.invalidation(), /primitives/);
  watchdog.dispose();
});

test('destroyAll releases child allocations recursively', () => {
  const parent = createAllocator({ capBytes: 2 ** 30 }), child = parent.child(), dev = { createBuffer: d => ({ ...d, destroy() {} }) };
  child.buffer(dev, { size: 16 }); parent.buffer(dev, { size: 32 });
  parent.destroyAll();
  assert.equal(parent.inventory().bytes, 0); assert.equal(child.inventory().bytes, 0);
});

test('a never-resolving mapping is ended by an abort', async () => {
  const abort = createAbort(), stuck = stuckDevice({ queue: false });
  const p = readBack(stuck.device, createAllocator({ capBytes: 2 ** 30 }), {}, 16, abort, undefined, 60000);
  setTimeout(() => abort.abort({ kind: 'device-lost', message: 'unknown' }), 20);
  await assert.rejects(p, /aborted: device-lost/);
});

test('a session-wide cap applies across child allocators, while each child attributes its own bytes', () => {
  const session = createAllocator({ capBytes: 1000 }), a = session.child(), b = session.child();
  const dev = { createBuffer: d => ({ ...d, destroy() {} }) };
  a.buffer(dev, { size: 600 });
  assert.throws(() => b.buffer(dev, { size: 600 }), /allocation cap exceeded/);
  assert.equal(a.inventory().bytes, 600); assert.equal(b.inventory().bytes, 0); assert.equal(session.inventory().bytes, 600);
});
