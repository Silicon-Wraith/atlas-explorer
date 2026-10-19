// spikes/project0/browser/drivers/lifecycle.js — G13. Real loss events are delivered unchanged; injection happens only after the exact
// request has been observed submitted; recovery only on action 'recover', in a normal (abortable) session. The loss exemption is armed
// immediately before the deliberate loss and consumed by it; any other loss, stall or timeout ends the invocation at once.
// Dependencies are injected, so the whole sequence is tested against fake sessions in Node.
import { injectLoss as realInject, onLoss as realOnLoss } from '../../gpu/device.js';
import { Lifecycle } from '../../gpu/lifecycle.js';
import { invalidationFor } from '../../gpu/abort.js';
import { session, renderOnce as realRenderOnce, sleep as realSleep, harnessTimeout } from './common.js';
import { CORRECTNESS_ONLY } from '../../timing-contract.js';   // the timing-method contract: every G13 rule is a count or flag; the raw `t` stamps are not timing evidence

export const REQUEST = Object.freeze({ view: 'bulb-overview', profile: 'settled' });   // the frozen G13 pairing (A.6 view, settled profile)

export async function runLifecycle({ open, onLoss, injectLoss, renderOnce, sleep }) {
  let unexpected = null;
  const waitFor = async (get, ms, what) => { const t0 = Date.now(); let v; while (!(v = get())) { if (unexpected) throw new Error(`device lost: unexpected loss (${unexpected.reason}) at epoch ${unexpected.epoch}`); if (Date.now() - t0 > ms) throw harnessTimeout(null, `timed out waiting for ${what} within ${ms} ms`); await sleep(1); } return v; };
  const settle = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), sleep(ms)]);   // bounded drain, never an unbounded wait
  const slots = []; let acquisitions = 0;
  const acquire = async () => { acquisitions++; return open(); };
  for (const type of ['intentional', 'injected']) {
    let active = type, s = null, off = () => {};
    const raw = { kind: type, request: { ...REQUEST }, lostRequestId: null, submittedBeforeLoss: null, loss: null, decision: null, interrupted: false, preserved: null, publicationsOfLost: 0, latePublications: 0, recovery: null };
    try {
      s = await acquire();
      const lc = new Lifecycle({ epoch: s.epoch });
      let decision = null, armed = false;
      off = onLoss(event => {
        if (!armed) { unexpected ??= event; return; }                                  // a loss nobody armed is a stop, not a test event
        armed = false;
        if (active === type && raw.loss === null) raw.loss = structuredClone(event);    // only the armed loss of this slot is recorded
        decision = lc.lost(event);
      });
      const arm = () => { armed = true; s.armExpectedLoss(); };
      const job = lc.begin(REQUEST);
      const lostId = raw.lostRequestId = s.renderer.render(REQUEST);
      const offPub = s.renderer.onPublish(p => { if (p.requestId === lostId) { if (lc.accept(job, p.epoch)) raw.publicationsOfLost++; else raw.latePublications++; } });
      const sub = await waitFor(() => s.events.list().find(e => e.type === 'submit' && e.requestId === lostId && e.epoch === s.epoch), 10000, 'the request\'s first submission');
      raw.submittedBeforeLoss = { requestId: sub.requestId, generation: sub.generation, epoch: sub.epoch, batch: sub.batch, t: sub.t };   // the exact event
      arm();
      if (type === 'intentional') s.device.destroy(); else injectLoss();
      await waitFor(() => decision, 10000, 'the loss notification');
      raw.decision = decision.action; raw.interrupted = decision.interrupted === job && job.state === 'interrupted'; raw.preserved = structuredClone(job.request);
      await settle(s.device.queue.onSubmittedWorkDone(), 2000);                       // late completions arrive against a retired epoch
      offPub(); s.close();
      if (decision.action === 'recover') {
        s = await acquire(); lc.recovered(s.epoch);
        const again = lc.begin(job.request);
        const frame = await renderOnce(s.renderer, again.request, { timeoutMs: 30000 });   // races the recovery session's abort
        raw.recovery = { epoch: s.epoch, requestId: frame.requestId, frame };
      }
      slots.push({ slot: type, raw: structuredClone(raw), timingMethod: CORRECTNESS_ONLY });                            // a snapshot: later events cannot alter it
      if (type === 'injected' && decision.action === 'recover') {
        active = 'repeated';
        const before = acquisitions; decision = null;
        lc.begin(REQUEST); arm(); injectLoss();
        await waitFor(() => decision, 10000, 'the repeated loss notification');
        const repeated = decision.action;
        if (repeated === 'recover') { s.close(); s = await acquire(); }                  // what a broken policy would do — counted
        await sleep(200);
        slots.push({ slot: 'repeated', raw: { decision: repeated, acquisitionsBefore: before, acquisitionsAfter: acquisitions }, timingMethod: CORRECTNESS_ONLY });
      }
    } catch (error) {
      // An unexpected loss, stall or harness timeout ends the invocation: keep the failure, never advance to the next loss type.
      if (!slots.some(x => x.slot === active)) slots.push({ slot: active, raw: { ...(active === 'repeated' ? {} : structuredClone(raw)), error: error.message }, timingMethod: CORRECTNESS_ONLY });
      off(); s?.close();
      return { slots, invalidations: [s?.abort?.invalidation?.() ?? (error.abort ? invalidationFor(error.abort) : /device lost|no observable progress|harness readback timeout|harness timeout:/.test(error.message) ? error.message : `driver error: ${error.message}`)] };
    } finally { off(); s?.close(); }
  }
  return { slots, invalidations: [] };
}

export function run(gate, fx, params, status) {
  return runLifecycle({ open: () => session(fx, status), onLoss: realOnLoss, injectLoss: realInject, renderOnce: realRenderOnce, sleep: realSleep });
}
