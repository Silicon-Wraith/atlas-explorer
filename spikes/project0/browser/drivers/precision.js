// spikes/project0/browser/drivers/precision.js — raw results only; Node interprets against the frozen fixtures.
// T12 adaptations (task-T12-report.md): the slot carries the registered timing method (timing-contract.js PRECISION_COST_TIMING) and its
// top-level span costProtocolMs; acquisition is inside the try, so its failure is the experiment's invalidation and `finally` always runs; the
// acquisition is cancelled by the abort, and preparation, compilation and pipeline creation race it (the T8/T9 abort pattern).
import { acquire, destroy, onLoss } from '../../gpu/device.js';
import { prepare, upload, readBack, traceList, profileWords, source, compile, dispatchOnce } from '../../gpu/webgpu.js';
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog } from '../../gpu/watchdog.js';
import { createAbort } from '../../gpu/abort.js';
import { PRECISION_COST_TIMING } from '../../timing-contract.js';

export const PRECISION_TIMING = PRECISION_COST_TIMING;          // the registered descriptor itself, never a copy

const pair = v => (Array.isArray(v) ? v : [v, 0]);
const OP = { two_sum: 0, add_ff: 1, mul_ff_f32: 2 };

async function ffTrace({ device, alloc, watchdog, abort, pipeline, barrier, profile, originPairs, directions, n }) {
  const owned = []; const keep = b => (owned.push(b), b);
  try {
    const o = keep(upload(device, alloc, new Float32Array(originPairs.flat()), GPUBufferUsage.STORAGE));
    const d = keep(upload(device, alloc, directions, GPUBufferUsage.STORAGE));
    const r = keep(alloc.buffer(device, { size: 16 * n, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
    const g1 = alloc.bindGroup(device.createBindGroup({ layout: pipeline.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: barrier } }] }));
    const inflight = []; const t0 = performance.now();
    for (let s0 = 0; s0 < n; s0 += 512) {
      while (inflight.length >= 2) await abort.race(inflight.shift());
      abort.throwIfAborted();
      const count = Math.min(512, n - s0);
      const u = upload(device, alloc, profileWords(profile, s0, count, 0), GPUBufferUsage.UNIFORM);
      const g0 = alloc.bindGroup(device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 2, resource: { buffer: o } }, { binding: 3, resource: { buffer: d } }, { binding: 4, resource: { buffer: r } }] }));
      const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, g0); pass.setBindGroup(1, g1); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
      const done = watchdog.submitted(`ff:${s0}`, { s0 });
      device.queue.submit([enc.finish()]);
      inflight.push(device.queue.onSubmittedWorkDone().then(() => { done(); u.destroy(); }));
    }
    await abort.race(Promise.all(inflight));
    const workMs = performance.now() - t0;
    const { bytes, ms } = await readBack(device, alloc, r, 16 * n, abort, watchdog);
    return { words: new Uint32Array(bytes), workMs, readMs: ms };
  } finally { for (const b of owned) b.destroy(); }
}

export async function run(gate, fx, params, status) {
  const abort = createAbort();
  const off = onLoss(info => abort.abort({ kind: 'device-lost', message: info.reason }));
  const watchdog = createWatchdog({ onStall: stall => abort.abort({ kind: 'stall', outstanding: stall.outstanding }) });
  const shared = createAllocator({ capBytes: fx.resources.capBytes });            // session-wide cap; children attribute costs
  try {
    const { device } = await abort.race(acquire({ cancelled: () => abort.aborted }));
    const pipelines = await abort.race(prepare(device, shared, status));
    const module = await abort.race((async () => compile(device, (await source('./fields.wgsl')) + (await source('./trace.wgsl')) + (await source('./compensated.wgsl')), 'compensated'))());
    const ff = shared.pipeline(await abort.race(device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'trace_ff_list', constants: { FIELD: 3 } } })));
    const prim = shared.pipeline(await abort.race(device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'primitives', constants: { FIELD: 3 } } })));
    // 1. Primitive cases, in fixture order. Validation-only resources live in their own child allocator and are released before costing.
    const validation = shared.child();
    const vBarrier = upload(device, validation, new Float32Array([1, 0, 0, 0]), GPUBufferUsage.UNIFORM);
    const pin = new Float32Array(8 * fx.primitives.length);
    fx.primitives.forEach((c, i) => { const a = pair(c.args[0]), b = pair(c.args[1]), t = c.thenAdd ? pair(c.thenAdd) : [0, 0]; pin.set([a[0], a[1], b[0], b[1], OP[c.op], t[0], t[1], 0], 8 * i); });
    const pinB = upload(device, validation, pin, GPUBufferUsage.STORAGE), poutB = validation.buffer(device, { size: 16 * fx.primitives.length, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    await dispatchOnce(device, watchdog, abort, enc => {
      const pass = enc.beginComputePass(); pass.setPipeline(prim);
      pass.setBindGroup(0, device.createBindGroup({ layout: prim.getBindGroupLayout(0), entries: [{ binding: 5, resource: { buffer: pinB } }, { binding: 6, resource: { buffer: poutB } }] }));
      pass.setBindGroup(1, device.createBindGroup({ layout: prim.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: vBarrier } }] }));
      pass.dispatchWorkgroups(fx.primitives.length); pass.end();
    }, 'primitives');
    const pout = new Float32Array((await readBack(device, validation, poutB, 16 * fx.primitives.length, abort, watchdog)).bytes);
    const validationBytes = validation.inventory().peakBytes; validation.destroyAll();
    const primitives = fx.primitives.map((_, i) => ({ hi: pout[4 * i], lo: pout[4 * i + 1], thenHi: pout[4 * i + 2], thenLo: pout[4 * i + 3] }));
    // 2. Per distance: matched baseline and compensated runs, each with its own allocator for incremental bytes.
    const sets = [], costStart = performance.now();
    for (const set of fx.precision.results) {
      status(`precision d=${set.distance}`);
      const n = set.rows.length;
      const dir3 = new Float32Array(3 * n), dir4 = new Float32Array(4 * n), org3 = new Float32Array(3 * n);
      set.rows.forEach((row, i) => { dir3.set(row.effectiveDirection, 3 * i); dir4.set([...row.effectiveDirection, 0], 4 * i); org3.set(set.roundedOrigin, 3 * i); });
      const result = { distance: set.distance, baseline: { workMs: [], readMs: [] }, compensated: { workMs: [], readMs: [] } };
      // Each implementation's own child allocator; the compensated one also holds the resources only it needs (the barrier).
      const baseAlloc = shared.child(), compAlloc = shared.child();
      const barrier = upload(device, compAlloc, new Float32Array([1, 0, 0, 0]), GPUBufferUsage.UNIFORM);
      for (let k = 0; k < fx.costProtocol.warmups + fx.costProtocol.measured; k++) {
        const b = await traceList({ device, alloc: baseAlloc, watchdog, abort, pipelines, field: 'bulb', profile: fx.profiles.precision, origins: org3, directions: dir3, label: `precision-base:${set.distance}` });
        const c = await ffTrace({ device, alloc: compAlloc, watchdog, abort, pipeline: ff, barrier, profile: fx.profiles.precision, originPairs: set.originPairs, directions: dir4, n });
        if (k >= fx.costProtocol.warmups) { result.baseline.workMs.push(b.workMs); result.baseline.readMs.push(b.readMs); result.compensated.workMs.push(c.workMs); result.compensated.readMs.push(c.readMs); }
        result.baseline.words = Array.from(b.words); result.compensated.words = Array.from(c.words);
      }
      result.baseline.peakBytes = baseAlloc.inventory().peakBytes; result.compensated.peakBytes = compAlloc.inventory().peakBytes;
      baseAlloc.destroyAll(); compAlloc.destroyAll();
      sets.push(result);
    }
    const costProtocolMs = performance.now() - costStart;
    abort.throwIfAborted();
    return { slots: [{ slot: 'precision', raw: { primitives, sets, validationBytes, costProtocolMs }, timingMethod: PRECISION_TIMING }], invalidations: [] };
  } catch (error) { return { slots: [], invalidations: [abort.invalidation() ?? `driver error: ${error.message}`] }; }
  finally { off(); watchdog.dispose(); shared.destroyAll(); destroy(); }
}
