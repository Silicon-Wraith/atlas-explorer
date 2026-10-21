// spikes/project0/tests/mapping-callers.test.mjs — every mapping caller is bounded: queue work succeeds, the map never resolves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
globalThis.GPUBufferUsage ??= { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128 };
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, TEXTURE_BINDING: 4, STORAGE_BINDING: 8 };
globalThis.GPUMapMode ??= { READ: 1 };
const { exerciseResources } = await import('../browser/drivers/resources.js');
const { storageCapture } = await import('../browser/drivers/visible.js');
const { createAllocator } = await import('../gpu/alloc.js');
const { createWatchdog } = await import('../gpu/watchdog.js');
const { createAbort } = await import('../gpu/abort.js');
const fx = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));

function mapNeverDevice() {
  const pass = { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} };
  return {
    createBuffer: d => ({ size: d.size, destroy() {}, mapAsync: () => new Promise(() => {}), getMappedRange: () => new ArrayBuffer(d.size), unmap() {} }),
    createTexture: d => ({ ...d, createView: () => ({}), destroy() {} }), createBindGroup: () => ({}),
    createCommandEncoder: () => ({ beginComputePass: () => pass, copyTextureToBuffer() {}, copyBufferToBuffer() {}, finish: () => ({}) }),
    queue: { submit() {}, writeBuffer() {}, onSubmittedWorkDone: async () => {} },
  };
}

test('the A.8 resource check: a never-resolving selected-texel mapping is a bounded harness timeout, with every allocation released', async () => {
  const alloc = createAllocator({ capBytes: fx.resources.capBytes }), watchdog = createWatchdog({ every: null }), abort = createAbort();
  const prepared = { pipelines: Object.fromEntries(['r32float', 'rgba16float', 'r32uint', 'rgba32float', 'rgba8unorm'].map(f => [f, { getBindGroupLayout: () => ({}) }])) };
  const t0 = Date.now();
  const raw = await exerciseResources(mapNeverDevice(), alloc, watchdog, abort, fx, prepared, () => {}, { mapDeadlineMs: 50 });
  assert.ok(Date.now() - t0 < 5000);
  assert.ok(raw.errors.some(e => /harness readback timeout/.test(e)), JSON.stringify(raw.errors));
  assert.deepEqual([raw.after.bytes, raw.after.textures, raw.after.buffers], [raw.before.bytes, raw.before.textures, raw.before.buffers]);
});

test('the visible storage capture: its copy is registered and its mapping is bounded', async () => {
  const alloc = createAllocator({ capBytes: 2 ** 30 }), abort = createAbort(); let registered = 0;
  const watchdog = { submitted: () => { registered++; return () => {}; } };
  const s = { device: mapNeverDevice(), alloc, abort, watchdog, renderer: { targets: { W: 64, H: 4, display: {} } } };
  await assert.rejects(storageCapture(s, { mapDeadlineMs: 50 }), /harness readback timeout/);
  assert.equal(registered, 1); assert.equal(alloc.inventory().bytes, 0);
});
