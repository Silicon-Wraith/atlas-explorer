// spikes/project0/browser/drivers/g12.js — the A.9 ten-minute sequence with fixed deadlines, bounded waits and checkpoints. A failed
// maintenance exercise or an expired wait ends the sequence at once, keeping the failed evidence. Dependencies are injected so the
// stop paths are tested in Node.
import { session, renderOnce as realRenderOnce, sleep, failure, harnessTimeout } from './common.js';
import { followPath as realFollowPath } from './timing.js';
import { prepareResourceCheck as realPrepare, exerciseResources as realExercise } from './resources.js';
import { observeIntegrity } from '../integrity.js';
import { G12_WALL_TIMING } from '../../timing-contract.js';   // wallMs: the 60-cycle span, page clock
export async function runG12(fx, status, { open, canvas, integrity: observe = observeIntegrity, followPath = realFollowPath, renderOnce = realRenderOnce,
  prepareResourceCheck = realPrepare, exerciseResources = realExercise, stressWaitMs = 5000, target = globalThis }) {
  const cfg = fx.stability;
  let unhandled = 0; const onErr = () => unhandled++; target.addEventListener?.('error', onErr); target.addEventListener?.('unhandledrejection', onErr);
  const maintenance = []; let s = null, integrity = null;
  target.p0Checkpoints = [];
  try {
    s = await open();
    const setBacking = ([w, h]) => { canvas.width = w; canvas.height = h; };
    const draftAt = () => ({ W: canvas.width * cfg.internalScale, H: canvas.height * cfg.internalScale });
    // Baseline: prepare and cache every pipeline the sequence uses, exercise once, return to 1280x720, drain, record.
    const prepared = await prepareResourceCheck(s.device, s.alloc);
    // Every maintenance result is kept; an error (e.g. a harness readback timeout) or an abort ends the sequence before anything else runs.
    const maintain = async () => {
      const raw = await exerciseResources(s.device, s.alloc, s.watchdog, s.abort, fx, prepared, status);
      maintenance.push(raw);
      s.abort.throwIfAborted();
      if (raw.errors.length) throw new Error(raw.errors.join('; '));
    };
    await followPath(s, fx, 'bulb-overview', 'draft', 1);
    await renderOnce(s.renderer, { view: 'sphere', profile: 'draft' });
    await maintain();
    setBacking(cfg.baselineBacking); await followPath(s, fx, 'bulb-overview', 'draft', 1, draftAt());
    await s.abort.race(s.device.queue.onSubmittedWorkDone()); await s.abort.race(sleep(200));   // every wait races the session abort (T8 pattern)
    const baseline = s.alloc.inventory();
    integrity = observe(canvas, { allowedBacking: [cfg.baselineBacking, ...cfg.resizeBacking] });
    const [, toSphere, toDetail, toMaintenance] = cfg.phaseOffsetsMs;
    const start = performance.now(); let deadlineMisses = 0;
    for (let c = 0; c < cfg.cycleCount; c++) {
      const c0 = start + c * cfg.cycleMs;
      const phase = async (view, untilMs) => { const seconds = (untilMs - performance.now()) / 1000; if (seconds > 0) await followPath(s, fx, view, 'draft', seconds, draftAt()); };
      await phase('bulb-overview', c0 + toSphere);
      await phase('sphere', c0 + toDetail);
      await phase('bulb-detail-0.005', c0 + toMaintenance);
      const stressId = s.renderer.render({ view: 'bulb-stress', profile: 'stress', label: 'bulb-stress', override: draftAt() });
      const w0 = performance.now();
      while (!s.events.list().some(e => e.type === 'submit' && e.requestId === stressId)) { s.abort.throwIfAborted(); if (performance.now() - w0 > stressWaitMs) throw harnessTimeout(s.abort, `the stress request was never submitted within ${stressWaitMs} ms`); await sleep(1); }
      await renderOnce(s.renderer, { view: 'sphere', profile: 'draft', override: draftAt() });
      setBacking(cfg.resizeBacking[c % cfg.resizeBacking.length]);
      if ((c + 1) % cfg.resourceEvery === 0) await maintain();
      s.events.clear();
      if (performance.now() > c0 + cfg.cycleMs) deadlineMisses++; else await s.abort.race(sleep(c0 + cfg.cycleMs - performance.now()));
      target.p0Checkpoints.push({ cycle: c, t: performance.now(), deadlineMisses, unhandled, losses: s.losses.length, inventory: s.alloc.inventory(), maintenanceErrors: maintenance.flatMap(m => m.errors) });
    }
    const wallMs = performance.now() - start;
    setBacking(cfg.baselineBacking); await followPath(s, fx, 'bulb-overview', 'draft', 1, draftAt());
    await s.abort.race(s.device.queue.onSubmittedWorkDone()); await s.abort.race(sleep(200)); s.abort.throwIfAborted();   // a stop in the final drain is the sequence's error
    const final = s.alloc.inventory();
    return { slots: [{ slot: 'sequence', raw: { cycles: target.p0Checkpoints.length, wallMs, deadlineMisses, unhandled, unplannedLosses: s.losses.length, baseline, final, baselinePrepared: 1, returned1280: canvas.width === 1280 && canvas.height === 720 ? 1 : 0, outstandingMax: s.renderer.stats().outstandingMax, integrity: integrity.stop(), maintenance }, timingMethod: G12_WALL_TIMING }], invalidations: [] };
  } catch (error) {
    return { slots: [{ slot: 'sequence', raw: { error: failure(s, error), cycles: target.p0Checkpoints.length, maintenance, unplannedLosses: s?.losses.length ?? 0 }, timingMethod: G12_WALL_TIMING }], invalidations: [failure(s, error)] };
  } finally { target.removeEventListener?.('error', onErr); target.removeEventListener?.('unhandledrejection', onErr); s?.close(); }
}
export function run(gate, fx, params, status) {
  return runG12(fx, status, { open: () => session(fx, status), canvas: document.getElementById('view'), target: window });
}
