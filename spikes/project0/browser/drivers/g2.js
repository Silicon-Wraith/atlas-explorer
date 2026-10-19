// spikes/project0/browser/drivers/g2.js — runs at module evaluation via main.js, so navigationMs is measured from navigation start.
import { session, renderOnce, failure } from './common.js';
import { observeIntegrity } from '../integrity.js';
import { G2_NAVIGATION_TIMING } from '../../timing-contract.js';   // navigationMs: navigation start to the first publication, page clock
export async function run(gate, fx, params, status) {
  const statusLog = [], canvas = document.getElementById('view'), integrity = observeIntegrity(canvas);
  const say = text => { status(text); statusLog.push({ t: performance.now(), text, visible: document.getElementById('status').offsetParent !== null }); };
  say('preparing: acquiring GPU');
  let s = null;
  try {
    s = await session(fx, say);
    const frame = await renderOnce(s.renderer, { view: 'bulb-overview', profile: 'draft' });
    return { slots: [{ slot: 'pending', raw: { navigationMs: frame.t, statusLog, frame, outstandingMax: s.renderer.stats().outstandingMax, integrity: integrity.stop() }, timingMethod: G2_NAVIGATION_TIMING }], invalidations: [] };
  } catch (error) { return { slots: [{ slot: 'pending', raw: { error: failure(s, error), statusLog }, timingMethod: G2_NAVIGATION_TIMING }], invalidations: [failure(s, error)] }; }
  finally { s?.close(); }
}
