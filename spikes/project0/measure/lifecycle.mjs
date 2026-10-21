// spikes/project0/measure/lifecycle.mjs — G13 from raw lifecycle observations; every join is checked, a driver error invalidates.
import { coverageValid } from '../metrics.js';
const FROZEN = JSON.stringify({ view: 'bulb-overview', profile: 'settled' });            // the frozen G13 pairing (T8)
const invalid = message => Object.assign(new Error(message), { invalidation: true });
export function metrics(gate, slot, raw, fx) {
  if (gate !== 'G13') throw new Error(`no metric derivation for ${gate}/${slot}`);
  if (raw?.error) throw invalid(`G13/${slot}: driver error: ${raw.error}`);
  if (slot === 'repeated') {
    if (!['stop', 'recover', 'ignore'].includes(raw.decision) || !Number.isInteger(raw.acquisitionsBefore) || !Number.isInteger(raw.acquisitionsAfter)) throw invalid('G13 repeated: malformed observation');
    return { automaticRetriesAfterRepeat: (raw.decision === 'stop' ? 0 : 1) + Math.max(0, raw.acquisitionsAfter - raw.acquisitionsBefore) };
  }
  if (!['intentional', 'injected'].includes(slot) || raw.kind !== slot) throw invalid(`no metric derivation for G13/${slot}`);
  if (JSON.stringify(raw.request) !== FROZEN) throw invalid('G13: not the frozen bulb-overview/settled request');
  const sub = raw.submittedBeforeLoss, loss = raw.loss;
  if (!sub || !loss) throw invalid('G13: the loss was not preceded by an observed submission of the request');
  if (sub.requestId !== raw.lostRequestId || sub.epoch !== loss.epoch || !Number.isInteger(sub.generation)) throw invalid('G13: the observed submission does not match the interrupted request and loss epoch');
  const expectedKind = slot === 'intentional' ? loss.injected === false && loss.reason === 'destroyed' : loss.injected === true;
  if (!expectedKind) throw invalid(`G13/${slot}: unexpected loss kind ${JSON.stringify(loss)}`);
  const p = fx.profiles.settled, f = raw.recovery?.frame;
  const complete = Boolean(f && f.counts && f.epoch === raw.recovery.epoch && f.requestId === raw.recovery.requestId && f.view === 'bulb-overview' && f.W === p.W && f.H === p.H && f.counts.total === p.W * p.H && coverageValid('bulb-overview', f.counts));
  return {
    interrupted: raw.interrupted ? 1 : 0, successes: raw.publicationsOfLost, requestPreserved: JSON.stringify(raw.preserved) === FROZEN ? 1 : 0,
    latePublications: raw.latePublications, validRecovery: raw.decision === 'recover' && complete && raw.recovery.epoch > loss.epoch ? 1 : 0,
  };
}
