// spikes/project0/browser/drivers/smoke.js — development check of the viewport path (not a gate).
import { session, renderOnce, failure } from './common.js';
import { CORRECTNESS_ONLY } from '../../timing-contract.js';   // the timing-method contract: smoke makes no timing claim (its per-frame ms are development observations)
export async function run(gate, fixtures, params, status) {
  const s = await session(fixtures, status), out = [];
  try {
    for (const [view, profile] of [['sphere', 'draft'], ['bulb-overview', 'draft'], ['bulb-detail-0.05', 'draft'], ['bulb-stress', 'stress']]) {
      const t0 = performance.now(); const frame = await renderOnce(s.renderer, { view, profile });
      out.push({ view, profile, ms: frame.t - t0, frame, outstandingMax: s.renderer.stats().outstandingMax, submits: s.renderer.stats().submits });
    }
    return { slots: [{ slot: 'smoke', raw: { out }, timingMethod: CORRECTNESS_ONLY }], invalidations: [] };
  } catch (error) { return { slots: [{ slot: 'smoke', raw: { out, error: error.message }, timingMethod: CORRECTNESS_ONLY }], invalidations: [failure(s, error)] }; }
  finally { s.close(); }
}
