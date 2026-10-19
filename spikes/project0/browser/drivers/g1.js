// spikes/project0/browser/drivers/g1.js — the dispatch runs on the device created from the very adapter whose identity is judged.
import { acquire, destroy, onLoss } from '../../gpu/device.js';
import { prepare } from '../../gpu/webgpu.js';
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog } from '../../gpu/watchdog.js';
import { experiment } from '../../gpu/abort.js';
import { arith } from './checks.js';
import { packRows } from '../packing.js';
import { CORRECTNESS_ONLY } from '../../timing-contract.js';   // G1 has no timing measurement (T9 timing-method registration)
import { softwareReason } from '../probe.js';                 // T5's software-adapter test, shared
export async function run(gate, fx, params, status) {
  const { abort, watchdog, alloc } = experiment({ capBytes: fx.resources.capBytes, createAllocator, createWatchdog });
  const off = onLoss(info => abort.abort({ kind: 'device-lost', message: info.reason }));
  let info = null, probeOk = false, probeError = null, software = null;
  try {
    // acquisition and preparation race the abort (a loss ends the probe even if a browser promise never settles), as checks.js's waits do
    const acquired = await abort.race(acquire({ cancelled: () => abort.aborted })); info = acquired.info;   // a late device after an abort is destroyed, never current
    // T9 fix round 1 (Codex T9 r1, finding 5): spec §7 software execution is refused straight after acquisition, before any preparation or
    // submission, with its own classified invalidation.
    software = softwareReason(info);
    if (software) return { slots: [{ slot: params.get('runMode'), raw: { adapterInfo: info, probeOk: false, software }, timingMethod: CORRECTNESS_ONLY }], invalidations: [`software adapter: ${software}`] };
    const pipelines = await abort.race(prepare(acquired.device, alloc, status));
    const words = await arith(acquired.device, alloc, watchdog, abort, pipelines, 'bulb_samples', packRows(fx.arithmetic.bulb, s => [...s.input, 0]), fx.arithmeticProtocol.bulb.iterations, fx.arithmetic.bulb.length);
    probeOk = words.length === 4 * fx.arithmetic.bulb.length && [...words].every((w, i) => i % 4 !== 0 || w <= 2);
  } catch (e) { probeError = abort.invalidation() ?? e.message; }
  finally { off(); watchdog.dispose(); alloc.destroyAll(); destroy(); }
  return { slots: [{ slot: params.get('runMode'), raw: { adapterInfo: info, probeOk, ...(probeError ? { probeError } : {}) }, timingMethod: CORRECTNESS_ONLY }], invalidations: abort.aborted ? [abort.invalidation()] : [] };
}
