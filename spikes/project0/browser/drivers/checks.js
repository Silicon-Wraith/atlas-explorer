// spikes/project0/browser/drivers/checks.js — G3/G4/G5 and policy drivers: raw readbacks only, never a verdict.
import { acquire, destroy, onLoss } from '../../gpu/device.js';
import { prepare, upload, readBack, traceList, dispatchOnce, TRACE_LIST_TIMING } from '../../gpu/webgpu.js';
import { CORRECTNESS_ONLY } from '../../timing-contract.js';   // the timing-method contract: no timing measured
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog } from '../../gpu/watchdog.js';
import { experiment } from '../../gpu/abort.js';
import { packBoxes, packRows } from '../packing.js';

export async function arith(device, alloc, watchdog, abort, pipelines, entry, inputs, cap, rows) {
  const n = inputs.length / 4, p = pipelines[entry];
  const owned = [];
  try {
    const uniform = upload(device, alloc, new Uint32Array([n, cap, 0, 0]), GPUBufferUsage.UNIFORM); owned.push(uniform);
    const input = upload(device, alloc, inputs, GPUBufferUsage.STORAGE); owned.push(input);
    const output = alloc.buffer(device, { size: Math.max(16, 16 * rows), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }); owned.push(output);
    // layout 'auto' contains only statically used bindings: qjulia_offplane does not use binding 0.
    const entries = [{ binding: 1, resource: { buffer: input } }, { binding: 2, resource: { buffer: output } }];
    if (entry !== 'qjulia_offplane') entries.unshift({ binding: 0, resource: { buffer: uniform } });
    const bind = alloc.bindGroup(device.createBindGroup({ layout: p.getBindGroupLayout(0), entries }));
    await dispatchOnce(device, watchdog, abort, enc => { const pass = enc.beginComputePass(); pass.setPipeline(p); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(entry === 'qjulia_offplane' ? 1 : Math.ceil(n / 64)); pass.end(); }, entry);
    return new Uint32Array((await readBack(device, alloc, output, 16 * rows, abort, watchdog)).bytes);
  } finally { for (const b of owned) b.destroy(); }
}

export async function run(gate, fx, params, status) {
  const { abort, watchdog, alloc } = experiment({ capBytes: fx.resources.capBytes, createAllocator, createWatchdog });
  const off = onLoss(info => abort.abort({ kind: 'device-lost', message: `${info.reason}${info.injected ? ' (injected)' : ''}` }));
  const slots = [];
  try {
    const { device } = await acquire();
    const pipelines = await prepare(device, alloc, status);
    if (gate === 'G3') {
      for (const [slot, fixture] of Object.entries(fx.analytic)) {
        const field = slot.startsWith('menger') ? 'menger' : slot;
        const boxes = fixture.boxes.length ? packBoxes(fixture.boxes) : new Float32Array(4);
        const { words, workMs } = await traceList({ device, alloc, watchdog, abort, pipelines, field, profile: fx.profiles.g3, origins: Float32Array.from(fixture.effectiveOrigins), directions: Float32Array.from(fixture.effectiveDirections), boxes, label: `G3/${slot}` });
        slots.push({ slot, raw: { words: Array.from(words.subarray(0, 4 * fixture.rays.length)), workMs }, timingMethod: TRACE_LIST_TIMING });
      }
    } else if (gate === 'G4') {
      const words = await arith(device, alloc, watchdog, abort, pipelines, 'bulb_samples', packRows(fx.arithmetic.bulb, s => [...s.input, 0]), fx.arithmeticProtocol.bulb.iterations, fx.arithmetic.bulb.length);
      slots.push({ slot: 'bulb-samples', raw: { words: Array.from(words) }, timingMethod: CORRECTNESS_ONLY });
    } else if (gate === 'G5') {
      const plane = await arith(device, alloc, watchdog, abort, pipelines, 'qjulia_plane', packRows(fx.arithmetic.plane, s => s.input), fx.arithmeticProtocol.plane.iterations, fx.arithmetic.plane.length);
      slots.push({ slot: 'qjulia-plane', raw: { words: Array.from(plane) }, timingMethod: CORRECTNESS_ONLY });
      const { q, C } = fx.arithmetic.offplane;
      const orbit = new Float32Array((await arith(device, alloc, watchdog, abort, pipelines, 'qjulia_offplane', Float32Array.from([...q, ...C]), 0, 8)).buffer);
      slots.push({ slot: 'qjulia-offplane', raw: { orbit: Array.from(orbit) }, timingMethod: CORRECTNESS_ONLY });
    } else if (gate === 'derivative-policy') {
      const words = await arith(device, alloc, watchdog, abort, pipelines, 'derivative_policy', packRows(fx.derivativePolicy, v => [v.grow, v.dr, 0, 0]), 0, fx.derivativePolicy.length);
      slots.push({ slot: 'vectors', raw: { fits: fx.derivativePolicy.map((_, i) => words[4 * i]) }, timingMethod: CORRECTNESS_ONLY });
    } else throw new Error(`checks.js has no driver for ${gate}`);
    return { slots, invalidations: [] };
  } catch (error) {
    return { slots, invalidations: [abort.invalidation() ?? `driver error: ${error.message}`] };
  } finally { off(); watchdog.dispose(); alloc.destroyAll(); destroy(); }
}
