// spikes/project0/browser/drivers/g2.js — runs at module evaluation via main.js, so navigationMs is measured from navigation start.
import { session, renderOnce, failure } from './common.js';
import { observeIntegrity } from '../integrity.js';
import { G2_NAVIGATION_TIMING } from '../../timing-contract.js';   // navigationMs: navigation start to the first publication, page clock
import { pageSupervisor } from '../supervisor.js';
// Navigation to first publication is Node's window G2/navigation, armed before goto (T9 fix round 2): nothing is exchanged inside it, and the
// page closes it only after its first publication (or its failure), before the result.
export async function run(gate, fx, params, status, { sup = pageSupervisor() } = {}) {
  const statusLog = [], canvas = document.getElementById('view'), integrity = observeIntegrity(canvas);
  const say = text => { status(text); statusLog.push({ t: performance.now(), text, visible: document.getElementById('status').offsetParent !== null }); };
  say('preparing: acquiring GPU');
  let s = null;
  try {
    let frame;
    try { s = await session(fx, say); frame = await renderOnce(s.renderer, { view: 'bulb-overview', profile: 'draft' }); }
    finally { await sup.closeImplicit('G2/navigation'); }
    return { slots: [{ slot: 'pending', raw: { navigationMs: frame.t, statusLog, frame, outstandingMax: s.renderer.stats().outstandingMax, integrity: integrity.stop() }, timingMethod: G2_NAVIGATION_TIMING }], invalidations: [] };
  } catch (error) { return { slots: [{ slot: 'pending', raw: { error: failure(s, error), statusLog }, timingMethod: G2_NAVIGATION_TIMING }], invalidations: [failure(s, error)] }; }
  finally { s?.close(); }
}
