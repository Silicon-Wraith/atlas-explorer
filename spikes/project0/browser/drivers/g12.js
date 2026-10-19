// spikes/project0/browser/drivers/g12.js — the A.9 ten-minute sequence with fixed deadlines, bounded waits and checkpoints. A failed
// maintenance exercise or an expired wait ends the sequence at once, keeping the failed evidence. Dependencies are injected so the
// stop paths are tested in Node.
import { session, renderOnce as realRenderOnce, sleep, failure, harnessTimeout } from './common.js';
import { followPath as realFollowPath } from './timing.js';
import { prepareResourceCheck as realPrepare, exerciseResources as realExercise } from './resources.js';
import { observeIntegrity } from '../integrity.js';
import { G12_WALL_TIMING } from '../../timing-contract.js';   // wallMs: the 60-cycle span, page clock
import { maintenanceProblems } from '../../measure/resource-rules.js';
import { pageSupervisor } from '../supervisor.js';   // the G11 rules, shared with Node (T9 fix round 1)
export async function runG12(fx, status, { open, canvas, integrity: observe = observeIntegrity, followPath = realFollowPath, renderOnce = realRenderOnce,
  prepareResourceCheck = realPrepare, exerciseResources = realExercise, stressWaitMs = 5000, target = globalThis, sup = pageSupervisor() }) {
  const cfg = fx.stability;
  let unhandled = 0; const onErr = () => unhandled++; target.addEventListener?.('error', onErr); target.addEventListener?.('unhandledrejection', onErr);
  const maintenance = []; let s = null, integrity = null;
  target.p0Checkpoints = [];
  try {
    s = await open();
    // Deliberate resizes go through the integrity observer once it runs, so they are not interference (T9 fix round 1, finding 2).
    const setBacking = ([w, h]) => { if (integrity?.resize) integrity.resize([w, h]); else { canvas.width = w; canvas.height = h; } };
    const draftAt = () => ({ W: canvas.width * cfg.internalScale, H: canvas.height * cfg.internalScale });
    // Baseline: prepare and cache every pipeline the sequence uses, exercise once, return to 1280x720, drain, record.
    const prepared = await prepareResourceCheck(s.device, s.alloc);
    // Every maintenance result is kept and checked at once against every G11 rule (T9 fix round 1, finding 4): its own errors (e.g. a harness
    // readback timeout), a malformed result, a content or band mismatch, an inventory that did not return, and so on. Any failure, or an abort,
    // ends the sequence before anything else runs.
    const maintain = async () => {
      const raw = await exerciseResources(s.device, s.alloc, s.watchdog, s.abort, fx, prepared, status);
      maintenance.push(raw);
      s.abort.throwIfAborted();
      const problems = maintenanceProblems(raw, fx);
      if (problems.length) throw new Error(`G12 maintenance failed the G11 rules: ${problems.join('; ')}`);
    };
    await followPath(s, fx, 'bulb-overview', 'draft', 1);
    await renderOnce(s.renderer, { view: 'sphere', profile: 'draft' });
    await maintain();
    setBacking(cfg.baselineBacking); await followPath(s, fx, 'bulb-overview', 'draft', 1, draftAt());
    await s.abort.race(s.device.queue.onSubmittedWorkDone()); await s.abort.race(sleep(200));   // every wait races the session abort (T8 pattern)
    const baseline = s.alloc.inventory();
    // The ten-minute sequence is Node's declared window G12/sequence (T9 fix round 2): heartbeats stop and every reply is awaited before it opens;
    // inside it the only exchange is the cycle-boundary checkpoint, whose reply is awaited (bounded, raced against the abort) before the next
    // cycle starts, under Node's fixed checkpoint gap. Absolute cycle deadlines are kept: time spent in the exchange counts towards the cycle.
    const sequence = await sup.window('G12/sequence', async () => {
    integrity = observe(canvas, { allowedBacking: [cfg.baselineBacking, ...cfg.resizeBacking] });
    const [, toSphere, toDetail, toMaintenance] = cfg.phaseOffsetsMs;
    const start = performance.now(); let deadlineMisses = 0; const cycleLog = [];
    // T9 fix round 3 (Codex T9 r3, finding 3): the checkpoint exchange is budgeted inside the cycle's own idle time, after the maintenance point and
    // before the boundary, so it can never consume the next cycle's motion. Every phase is recorded, run or skipped (no time left), with its
    // planned and measured span; a cycle with a skipped phase or whose exchange ended after its boundary is an overrun, counted as a deadline miss.
    for (let c = 0; c < cfg.cycleCount; c++) {
      const c0 = start + c * cfg.cycleMs, boundary = c0 + cfg.cycleMs, entry = { cycle: c, c0, phases: [], overrun: false };
      const phase = async (view, fromMs, untilMs) => {
        const startMs = performance.now(), seconds = (untilMs - startMs) / 1000;
        if (seconds <= 0) { entry.phases.push({ view, plannedStartMs: fromMs, plannedEndMs: untilMs, startMs, endMs: startMs, skipped: true }); return; }
        await followPath(s, fx, view, 'draft', seconds, draftAt());
        entry.phases.push({ view, plannedStartMs: fromMs, plannedEndMs: untilMs, startMs, endMs: performance.now(), skipped: false });
      };
      await phase('bulb-overview', c0, c0 + toSphere);
      await phase('sphere', c0 + toSphere, c0 + toDetail);
      await phase('bulb-detail-0.005', c0 + toDetail, c0 + toMaintenance);
      const stressId = s.renderer.render({ view: 'bulb-stress', profile: 'stress', label: 'bulb-stress', override: draftAt() });
      const w0 = performance.now();
      while (!s.events.list().some(e => e.type === 'submit' && e.requestId === stressId)) { s.abort.throwIfAborted(); if (performance.now() - w0 > stressWaitMs) throw harnessTimeout(s.abort, `the stress request was never submitted within ${stressWaitMs} ms`); await sleep(1); }
      await renderOnce(s.renderer, { view: 'sphere', profile: 'draft', override: draftAt() });
      setBacking(cfg.resizeBacking[c % cfg.resizeBacking.length]);
      if ((c + 1) % cfg.resourceEvery === 0) await maintain();
      s.events.clear();
      const checkpoint = { cycle: c, t: performance.now(), deadlineMisses, unhandled, losses: s.losses.length, inventory: s.alloc.inventory(), maintenanceErrors: maintenance.flatMap(m => m.errors ?? []) };
      target.p0Checkpoints.push(checkpoint);
      entry.checkpointSentMs = performance.now();
      await sup.checkpoint(checkpoint, s.abort);                                      // inside this cycle's idle time; the reply precedes the next cycle
      entry.checkpointRepliedMs = performance.now();
      if (performance.now() > boundary) entry.overrun = true; else await s.abort.race(sleep(boundary - performance.now()));
      entry.endedMs = performance.now();
      if (entry.overrun || entry.phases.some(p => p.skipped)) deadlineMisses++;
      cycleLog.push(entry);
    }
    const wallMs = performance.now() - start;
    setBacking(cfg.baselineBacking); await followPath(s, fx, 'bulb-overview', 'draft', 1, draftAt());
    await s.abort.race(s.device.queue.onSubmittedWorkDone()); await s.abort.race(sleep(200)); s.abort.throwIfAborted();   // a stop in the final drain is the sequence's error
    const final = s.alloc.inventory(), observed = integrity.stop();
    return { wallMs, deadlineMisses, final, observed, cycleLog };
    });
    const { wallMs, deadlineMisses, final, observed, cycleLog } = sequence;
    return { slots: [{ slot: 'sequence', raw: { cycles: target.p0Checkpoints.length, wallMs, deadlineMisses, unhandled, unplannedLosses: s.losses.length, baseline, final, baselinePrepared: 1, returned1280: canvas.width === 1280 && canvas.height === 720 ? 1 : 0, outstandingMax: s.renderer.stats().outstandingMax, integrity: observed, maintenance, cycleLog }, timingMethod: G12_WALL_TIMING }], invalidations: [] };
  } catch (error) {
    return { slots: [{ slot: 'sequence', raw: { error: failure(s, error), cycles: target.p0Checkpoints.length, maintenance, unplannedLosses: s?.losses.length ?? 0 }, timingMethod: G12_WALL_TIMING }], invalidations: [failure(s, error)] };
  } finally { target.removeEventListener?.('error', onErr); target.removeEventListener?.('unhandledrejection', onErr); s?.close(); }
}
export function run(gate, fx, params, status) {
  return runG12(fx, status, { open: () => session(fx, status), canvas: document.getElementById('view'), target: window, sup: pageSupervisor() });
}
