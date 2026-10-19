// spikes/project0/browser/drivers/g8.js — replace in-flight stress work, after its exact submission was observed. A stop or failure ends
// the invocation: no further device is acquired. Dependencies are injected so this is tested in Node.
import { session, frameOf, sleep, failure, harnessTimeout } from './common.js';
import { observeIntegrity } from '../integrity.js';
import { G8_REPLACEMENT_TIMING } from '../../timing-contract.js';   // latencyMs: sphere request to its publication, page clock
import { pageSupervisor } from '../supervisor.js';

export async function runG8(fx, status, { open, canvas, integrity = observeIntegrity, waitMs = 5000, sup = pageSupervisor() }) {
  const draft = fx.profiles.draft;
  const slots = [];
  for (let rep = 0; rep < 10; rep++) {
    let s = null, off = null; const slot = String(rep);
    try {
      s = await open(); const frames = []; off = s.renderer.onPublish(p => frames.push(frameOf(p)));
      // each repetition is Node's declared window G8/<rep> (T9 fix round 2)
      const raw = await sup.window(`G8/${slot}`, async () => {
      const watch = integrity(canvas); let observed = null;
      try {
      const stressRequestId = s.renderer.render({ view: 'bulb-stress', profile: 'stress', label: 'bulb-stress' });
      const t0 = performance.now(); let stressSubmit = null;
      while (!(stressSubmit = s.events.list().find(e => e.type === 'submit' && e.requestId === stressRequestId && e.epoch === s.epoch)) && performance.now() - t0 < waitMs) { s.abort.throwIfAborted(); await sleep(1); }
      if (!stressSubmit) throw harnessTimeout(s.abort, `the stress request was never submitted within ${waitMs} ms`);   // expiry ends the invocation
      const sphereRequested = performance.now();
      const sphereId = s.renderer.render({ view: 'sphere', profile: 'draft', label: 'sphere' });
      while (!frames.some(f => f.requestId === sphereId) && performance.now() - sphereRequested < waitMs) { s.abort.throwIfAborted(); await sleep(1); }
      if (!frames.some(f => f.requestId === sphereId)) throw harnessTimeout(s.abort, `the sphere frame was not published within ${waitMs} ms`);
      await s.abort.race(Promise.race([s.device.queue.onSubmittedWorkDone(), sleep(2000)]));   // bounded drain: a stale stress result would publish now
      await s.abort.race(sleep(50)); s.abort.throwIfAborted();                              // a stop latched in the settle is this repetition's error
      const sphere = frames.find(f => f.requestId === sphereId); observed = watch.stop();
      return { stressRequestId, stressSubmit: stressSubmit ? { requestId: stressSubmit.requestId, epoch: stressSubmit.epoch, t: stressSubmit.t } : null, sphereRequestId: sphereId, sphereRequested, latencyMs: sphere.t - sphereRequested, sphere, stalePublications: frames.filter(f => f.label === 'bulb-stress').length, outstandingMax: s.renderer.stats().outstandingMax, integrity: observed };
      } finally { if (!observed) watch.stop(); }                                       // stopped exactly once
      });
      slots.push({ slot, timingMethod: G8_REPLACEMENT_TIMING, raw });
      // T9 fix rounds 1-2 (Codex T9 r1 finding 3, r2 finding 3): an invalid repetition (interference, a stale publication, an incomplete sphere
      // frame) ends G8 before the next acquisition, its raw kept
      const s0 = raw.sphere, problems = [...raw.integrity.violations, ...(raw.stalePublications ? [`${raw.stalePublications} stale publication${raw.stalePublications === 1 ? '' : 's'}`] : []),
        ...(s0?.counts && s0.view === 'sphere' && s0.W === draft.W && s0.H === draft.H && s0.counts.total === draft.W * draft.H ? [] : ['the sphere frame is incomplete'])];
      if (problems.length) return { slots, invalidations: [`trial invalid: G8/${slot}: ${problems.join('; ')}`] };
    } catch (error) { slots.push({ slot, raw: { error: failure(s, error) }, timingMethod: G8_REPLACEMENT_TIMING }); return { slots, invalidations: [failure(s, error)] }; }
    finally { off?.(); s?.close(); }
  }
  return { slots, invalidations: [] };
}

export function run(gate, fx, params, status) {
  return runG8(fx, status, { open: () => session(fx, status), canvas: document.getElementById('view'), sup: pageSupervisor() });
}
