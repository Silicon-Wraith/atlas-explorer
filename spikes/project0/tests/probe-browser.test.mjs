// Browser probe driver under mocked WebGPU: software adapters stop it, loss interrupts preparation, no work after an abort.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runProbe } from '../browser/probe.js';
import { injectLoss } from '../gpu/device.js';

const HW = { vendor: 'nvidia', architecture: 'ada', device: '', description: 'RTX', isFallbackAdapter: false };
function install({ info = HW, pipeline, fetchImpl } = {}) {
  const log = { buffers: 0 };
  const device = {
    limits: {}, destroyed: false,
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createComputePipelineAsync: pipeline ?? (async () => ({ getBindGroupLayout: () => ({}) })),
    createBuffer: () => { log.buffers++; return { destroy() {}, mapAsync: async () => {}, unmap() {},
      getMappedRange: () => Uint32Array.from({ length: 1024 }, (_, i) => i < 1000 ? 3 * i + 1 : 0xdeadbeef).buffer }; },
    createBindGroup: () => ({}), queue: { writeBuffer() {}, submit() {}, onSubmittedWorkDone: async () => {} },
    createCommandEncoder: () => ({ beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }), copyBufferToBuffer() {}, finish: () => ({}) }),
    addEventListener() {},
    destroy() { device.destroyed = true; device.resolveLost({ reason: 'destroyed' }); },
  };
  device.lost = new Promise(r => { device.resolveLost = r; });
  const adapter = { features: new Set(['timestamp-query']), info, requestDevice: async () => device };
  Object.defineProperty(globalThis, 'navigator', { value: { gpu: { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'bgra8unorm' } }, configurable: true, writable: true });
  globalThis.GPUBufferUsage = { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, COPY_SRC: 8, MAP_READ: 16 };
  globalThis.GPUMapMode = { READ: 1 };
  globalThis.fetch = fetchImpl ?? (async () => ({ ok: true, text: async () => '// wgsl' }));
  return { log, device };
}
const run = () => runProbe(new URLSearchParams('runMode=headless'), () => {});

test('a hardware adapter completes the probe', async () => {
  install();
  const out = await run();
  assert.equal(out.slots[0].raw.ok, true); assert.deepEqual(out.invalidations, []);
});

test('SwiftShader and fallback adapters are software execution: they stop before any allocation', async () => {
  for (const info of [{ ...HW, vendor: 'google', architecture: 'swiftshader' }, { ...HW, isFallbackAdapter: true }]) {
    const { log } = install({ info });
    const out = await run();
    assert.ok(out.invalidations.some(x => /software adapter/.test(x)), JSON.stringify(info));
    assert.equal(out.metrics.software, 1); assert.equal(out.slots[0].raw.ok, false); assert.equal(log.buffers, 0);
  }
});

test('an unknown adapter identity is not hardware evidence', async () => {
  install({ info: { vendor: '', architecture: '', device: '', description: '', isFallbackAdapter: null } });
  const out = await run();
  assert.equal(out.slots[0].raw.ok, false); assert.match(out.slots[0].raw.error, /identity unknown/);
});

test('device loss interrupts a pipeline creation that never settles, and nothing is allocated afterwards', async () => {
  const { log } = install({ pipeline: () => new Promise(() => {}) });
  const p = run(); setTimeout(injectLoss, 30);
  const out = await p;
  assert.ok(out.invalidations.some(x => /device lost/.test(x))); assert.equal(log.buffers, 0);
});

test('device loss interrupts a fetch that never settles', async () => {
  const { log } = install({ fetchImpl: () => new Promise(() => {}) });
  const p = run(); setTimeout(injectLoss, 30);
  const out = await p;
  assert.ok(out.invalidations.some(x => /device lost/.test(x))); assert.equal(log.buffers, 0);
});

test('loss during pipeline creation that later resolves still allocates nothing', async () => {
  let resolvePipeline; const { log } = install({ pipeline: () => new Promise(r => { resolvePipeline = r; }) });
  const p = run(); setTimeout(injectLoss, 30);
  const out = await p; resolvePipeline({ getBindGroupLayout: () => ({}) }); await new Promise(r => setTimeout(r, 20));
  assert.ok(out.invalidations.some(x => /device lost/.test(x))); assert.equal(log.buffers, 0);
});
