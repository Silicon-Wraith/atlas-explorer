// spikes/project0/browser/drivers/g10.js — settled single frames. A publication deadline is a harness timeout: it latches the session
// abort, the failed view keeps its record, and no further view is rendered. Dependencies are injected so this is tested in Node.
import { session, renderOnce, failure } from './common.js';
import { observeIntegrity } from '../integrity.js';
import { G10_SETTLED_TIMING } from '../../timing-contract.js';   // elapsedMs: settled request to its publication, page clock
import { pageSupervisor } from '../supervisor.js';
import { DRIVER } from '../../supervision-plan.js';
export async function runG10(fx, status, { open, canvas, integrity = observeIntegrity, timeoutMs = DRIVER.g10TimeoutMs, sup = pageSupervisor() }) {
  const slots = []; let s = null;
  try {
    s = await open();
    for (const view of ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005']) {
      let frame = null, error = null, observed = null, requestedMs = null;
      await sup.window(`G10/${view}`, async () => {                                     // Node's declared window G10/<view> (T9 fix round 2)
        const watch = integrity(canvas); requestedMs = performance.now();
        try { frame = await renderOnce(s.renderer, { view, profile: 'settled' }, { timeoutMs }); } catch (e) { error = failure(s, e); }
        observed = watch.stop();
      });
      slots.push({ slot: view, timingMethod: G10_SETTLED_TIMING, raw: { requestedMs, ...(frame ? { elapsedMs: frame.t - requestedMs } : {}), frame, prepared: 1, outstandingMax: s.renderer.stats().outstandingMax, integrity: observed, ...(error ? { error } : {}) } });
      if (s.abort.aborted) return { slots, invalidations: [s.abort.invalidation()] };    // a stop ends the invocation, recognisably
      // T9 fix round 1 (Codex T9 r1, finding 3): an invalid view ends G10 before the next view is rendered, its raw kept
      if (observed.violations.length) return { slots, invalidations: [`trial invalid: G10/${view}: ${observed.violations.join('; ')}`] };
    }
  } catch (error) { slots.push({ slot: 'bulb-overview', raw: { error: failure(s, error) }, timingMethod: G10_SETTLED_TIMING }); return { slots, invalidations: [failure(s, error)] }; }
  finally { s?.close(); }
  return { slots, invalidations: [] };
}
export function run(gate, fx, params, status) {
  return runG10(fx, status, { open: () => session(fx, status), canvas: document.getElementById('view'), sup: pageSupervisor() });
}
