// spikes/project0/browser/drivers/precision.js — raw results only; Node interprets against the frozen fixtures.
// T12 adaptations (task-T12-report.md): the slot carries the registered timing method (timing-contract.js PRECISION_COST_TIMING) and its
// top-level span costProtocolMs; acquisition is inside the try, so its failure is the experiment's invalidation and `finally` always runs; the
// acquisition is cancelled by the abort, and preparation, compilation and pipeline creation race it (the T8/T9 abort pattern).
// T12 fix round 1 (Codex T12 r1; docs/reports/project0/t12-validation-prereg.md):
// - F1: the supplemental primitive cases (precision-validation/corpus-v1.json, fetched and hashed as used) run after the frozen ones in the same
//   dispatch, and trace_ff_list's own captures are read back once per distance, after its runs and outside every window;
// - F2: each measured evaluation runs inside its Node-owned window (supervision-plan.js WINDOW_PLANS.precision), so no binding reply or
//   heartbeat lands inside a workMs or readMs sample; warm-ups run outside windows;
// - F3: evidence accumulates outside the try and each evaluation is recorded the moment it returns; a failure returns the precision slot with
//   `complete: false`, its partial evidence and the original invalidation;
// - F5: each implementation's batch size follows BATCH_POLICY run by run; every run keeps its size, batch rows and maximum outstanding count;
// - concern 2: each implementation's allocations in its first measured run are recorded beside its peak.
// T12 fix round 2 (Codex T12 r2): each evaluation is recorded inside its window callback, so a refused or unanswered close cannot drop a completed
// sample (F3); the persistent capture storage is a child of the compensated allocator, so it counts in the compensated peak, while its
// diagnostic readback staging has its own allocator; both are reported, with each implementation's persistent layout (concern 2).
import { acquire as acquireDevice, destroy as destroyDevice, onLoss as onDeviceLoss } from '../../gpu/device.js';
import { prepare as prepareAll, upload, readBack, traceList, profileWords, source as fetchSource, compile as compileModule, dispatchOnce } from '../../gpu/webgpu.js';
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog as watchdogOf } from '../../gpu/watchdog.js';
import { createAbort } from '../../gpu/abort.js';
import { PRECISION_COST_TIMING } from '../../timing-contract.js';
import { PRECISION_CORPUS, BATCH_POLICY, nextBatch, maxOutstandingOf } from '../../precision-config.js';
import { precisionWindow } from '../../supervision-plan.js';
import { pageSupervisor } from '../supervisor.js';

export const PRECISION_TIMING = PRECISION_COST_TIMING;          // the registered descriptor itself, never a copy

const pair = v => (Array.isArray(v) ? v : [v, 0]);
const OP = { two_sum: 0, add_ff: 1, mul_ff_f32: 2 };
const hexOf = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');

// An allocator view that records every buffer it creates ({size, usage}) while the child allocator still accounts for it.
function logging(alloc, list) { const view = Object.create(alloc); view.buffer = (device, desc) => { list?.push({ size: desc.size, usage: desc.usage }); return alloc.buffer(device, desc); }; return view; }

async function ffTrace({ device, alloc, watchdog, abort, pipeline, barrier, capture, profile, originPairs, directions, n, batch }) {
  const owned = []; const keep = b => (owned.push(b), b);
  try {
    const o = keep(upload(device, alloc, new Float32Array(originPairs.flat()), GPUBufferUsage.STORAGE));
    const d = keep(upload(device, alloc, directions, GPUBufferUsage.STORAGE));
    const r = keep(alloc.buffer(device, { size: 16 * n, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
    const g1 = alloc.bindGroup(device.createBindGroup({ layout: pipeline.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: barrier } }] }));
    const batches = [], inflight = []; const t0 = performance.now();
    for (let s0 = 0; s0 < n; s0 += batch) {
      while (inflight.length >= 2) await abort.race(inflight.shift());
      abort.throwIfAborted();
      const count = Math.min(batch, n - s0);
      const u = upload(device, alloc, profileWords(profile, s0, count, 0), GPUBufferUsage.UNIFORM);
      const g0 = alloc.bindGroup(device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 2, resource: { buffer: o } }, { binding: 3, resource: { buffer: d } }, { binding: 4, resource: { buffer: r } }, { binding: 7, resource: { buffer: capture } }] }));
      const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, g0); pass.setBindGroup(1, g1); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
      const row = { start: s0, count, submitMs: performance.now(), doneMs: null };
      const done = watchdog.submitted(`ff:${s0}`, { s0 });
      device.queue.submit([enc.finish()]); batches.push(row);
      inflight.push(device.queue.onSubmittedWorkDone().then(() => { row.doneMs = performance.now(); done(); u.destroy(); }));
    }
    await abort.race(Promise.all(inflight));
    const workMs = performance.now() - t0;
    const { bytes, ms } = await readBack(device, alloc, r, 16 * n, abort, watchdog);
    return { words: new Uint32Array(bytes), workMs, readMs: ms, batches };
  } finally { for (const b of owned) b.destroy(); }
}

const defaultCorpus = async abort => {
  const response = await abort.race(fetch(new URL(`../../${PRECISION_CORPUS.path}`, import.meta.url)));
  if (!response.ok) throw new Error(`${PRECISION_CORPUS.path}: HTTP ${response.status}`);
  return abort.race(response.arrayBuffer());
};

// `deps` is for the Node tests only (a fake device and injected services); the page passes none.
export async function run(gate, fx, params, status, deps = {}) {
  const d = { acquire: acquireDevice, destroy: destroyDevice, onLoss: onDeviceLoss, prepare: prepareAll, compile: compileModule, source: fetchSource, createWatchdog: watchdogOf,
    supervisor: pageSupervisor(), loadCorpus: defaultCorpus, ...deps };
  const abort = createAbort();
  const off = d.onLoss(info => abort.abort({ kind: 'device-lost', message: info.reason }));
  const watchdog = d.createWatchdog({ onStall: stall => abort.abort({ kind: 'stall', outstanding: stall.outstanding }) });
  const shared = createAllocator({ capBytes: fx.resources.capBytes });            // session-wide cap; children attribute costs
  // F3: the evidence lives outside the try; every evaluation is recorded the moment it returns.
  const evidence = { complete: false, primitives: null, supplement: null, validationBytes: null, sets: [], costProtocolMs: 0 };
  let costStart = null;
  try {
    const { device } = await abort.race(d.acquire({ cancelled: () => abort.aborted }));
    const corpusBytes = await d.loadCorpus(abort), corpus = JSON.parse(new TextDecoder().decode(corpusBytes));
    const corpusSha256 = hexOf(await abort.race(crypto.subtle.digest('SHA-256', corpusBytes)));
    const pipelines = await abort.race(d.prepare(device, shared, status));
    const module = await abort.race((async () => d.compile(device, (await d.source('./fields.wgsl')) + (await d.source('./trace.wgsl')) + (await d.source('./compensated.wgsl')), 'compensated'))());
    const { rays: captureRays, steps: captureSteps } = corpus.capture;
    const ff = shared.pipeline(await abort.race(device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'trace_ff_list', constants: { FIELD: 3, CAPTURE_RAYS: captureRays, CAPTURE_STEPS: captureSteps } } })));
    const prim = shared.pipeline(await abort.race(device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'primitives', constants: { FIELD: 3 } } })));
    // 1. Primitive cases: the frozen ones in fixture order, then the supplemental corpus in its order. Validation-only resources live in their
    //    own child allocator and are released before costing.
    const cases = [...fx.primitives, ...corpus.primitives];
    const validation = shared.child();
    const vBarrier = upload(device, validation, new Float32Array([1, 0, 0, 0]), GPUBufferUsage.UNIFORM);
    const pin = new Float32Array(8 * cases.length);
    cases.forEach((c, i) => { const a = pair(c.args[0]), b = pair(c.args[1]), t = c.thenAdd ? pair(c.thenAdd) : [0, 0]; pin.set([a[0], a[1], b[0], b[1], OP[c.op], t[0], t[1], 0], 8 * i); });
    const pinB = upload(device, validation, pin, GPUBufferUsage.STORAGE), poutB = validation.buffer(device, { size: 16 * cases.length, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    await dispatchOnce(device, watchdog, abort, enc => {
      const pass = enc.beginComputePass(); pass.setPipeline(prim);
      pass.setBindGroup(0, device.createBindGroup({ layout: prim.getBindGroupLayout(0), entries: [{ binding: 5, resource: { buffer: pinB } }, { binding: 6, resource: { buffer: poutB } }] }));
      pass.setBindGroup(1, device.createBindGroup({ layout: prim.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: vBarrier } }] }));
      pass.dispatchWorkgroups(cases.length); pass.end();
    }, 'primitives');
    const pout = new Float32Array((await readBack(device, validation, poutB, 16 * cases.length, abort, watchdog)).bytes);
    evidence.validationBytes = validation.inventory().peakBytes; validation.destroyAll();
    const results = cases.map((_, i) => ({ hi: pout[4 * i], lo: pout[4 * i + 1], thenHi: pout[4 * i + 2], thenLo: pout[4 * i + 3] }));
    evidence.primitives = results.slice(0, fx.primitives.length);
    evidence.supplement = { corpusSha256, primitives: results.slice(fx.primitives.length) };
    // 2. Per distance: matched baseline and compensated runs, each with its own allocator for incremental bytes; measured runs in windows.
    costStart = performance.now();
    for (const [di, set] of fx.precision.results.entries()) {
      status(`precision d=${set.distance}`);
      const n = set.rows.length;
      const dir3 = new Float32Array(3 * n), dir4 = new Float32Array(4 * n), org3 = new Float32Array(3 * n);
      set.rows.forEach((row, i) => { dir3.set(row.effectiveDirection, 3 * i); dir4.set([...row.effectiveDirection, 0], 4 * i); org3.set(set.roundedOrigin, 3 * i); });
      const result = { distance: set.distance, complete: false, baseline: { workMs: [], readMs: [], runs: [], allocations: [] }, compensated: { workMs: [], readMs: [], runs: [], allocations: [] } };
      evidence.sets.push(result);
      // Each implementation's own child allocator; the compensated one also holds the resources only it needs (the barrier). The capture
      // buffer is validation evidence, accounted in its own child allocator and reported as captureBytes.
      // Fix round 2: the capture storage is persistent storage of the timed compensated kernel, so it is a child of compAlloc (its peak); the
      // capture readback's staging buffer is diagnostic and is accounted in its own sibling allocator.
      const baseAlloc = shared.child(), compAlloc = shared.child(), capStorage = compAlloc.child(), capStage = shared.child();
      const barrier = upload(device, compAlloc, new Float32Array([1, 0, 0, 0]), GPUBufferUsage.UNIFORM);
      const capture = capStorage.buffer(device, { size: 64 * captureRays * captureSteps, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      result.baseline.persistent = [];
      result.compensated.persistent = [{ role: 'barrier uniform', size: barrier.size }, { role: 'capture storage', size: capture.size }];
      const batch = { baseline: BATCH_POLICY.initialBatch, compensated: BATCH_POLICY.initialBatch };
      const record = (impl, k, measured, out) => {
        const r = result[impl], size = batch[impl];
        r.runs.push({ k, measured, batch: size, batches: out.batches.map(b => ({ start: b.start, count: b.count, submitMs: b.submitMs, doneMs: b.doneMs })), maxOutstanding: maxOutstandingOf(out.batches) });
        if (measured) { r.workMs.push(out.workMs); r.readMs.push(out.readMs); }
        r.words = Array.from(out.words);
        batch[impl] = nextBatch(out.batches, size);
      };
      for (let k = 0; k < fx.costProtocol.warmups + fx.costProtocol.measured; k++) {
        const measured = k >= fx.costProtocol.warmups, first = k === fx.costProtocol.warmups, sample = k - fx.costProtocol.warmups;
        const inWindow = (impl, fn) => (measured ? d.supervisor.window(precisionWindow(di, sample, impl), fn) : fn());
        // Fix round 2 (F3): the evaluation is recorded inside the window callback, after its work and readback and before the close.
        const evaluate = (impl, fn) => inWindow(impl, async () => { const out = await fn(); record(impl, k, measured, out); return out; });
        await evaluate('baseline', () => traceList({ device, alloc: logging(baseAlloc, first ? result.baseline.allocations : null), watchdog, abort, pipelines, field: 'bulb', profile: fx.profiles.precision, origins: org3, directions: dir3, batch: batch.baseline, label: `precision-base:${set.distance}` }));
        await evaluate('compensated', () => ffTrace({ device, alloc: logging(compAlloc, first ? result.compensated.allocations : null), watchdog, abort, pipeline: ff, barrier, capture, profile: fx.profiles.precision, originPairs: set.originPairs, directions: dir4, n, batch: batch.compensated }));
      }
      result.captureWords = Array.from(new Uint32Array((await readBack(device, capStage, capture, 64 * captureRays * captureSteps, abort, watchdog)).bytes));
      result.baseline.peakBytes = baseAlloc.inventory().peakBytes; result.compensated.peakBytes = compAlloc.inventory().peakBytes;
      result.captureStorageBytes = capStorage.inventory().peakBytes; result.captureStagingBytes = capStage.inventory().peakBytes;
      baseAlloc.destroyAll(); compAlloc.destroyAll(); capStage.destroyAll();
      result.complete = true;
    }
    evidence.costProtocolMs = performance.now() - costStart;
    abort.throwIfAborted();
    evidence.complete = true;
    return { slots: [{ slot: 'precision', raw: evidence, timingMethod: PRECISION_TIMING }], invalidations: [] };
  } catch (error) {
    const invalidation = abort.invalidation() ?? `driver error: ${error.message}`;
    if (evidence.primitives === null) return { slots: [], invalidations: [invalidation] };     // nothing was measured: finalise records an incomplete slot
    evidence.costProtocolMs = costStart === null ? 0 : performance.now() - costStart;
    return { slots: [{ slot: 'precision', raw: { ...evidence, complete: false, error: error.message }, timingMethod: PRECISION_TIMING }], invalidations: [invalidation] };
  } finally { off(); watchdog.dispose(); shared.destroyAll(); d.destroy(); }
}
