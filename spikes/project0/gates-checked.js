// spikes/project0/gates-checked.js — the read-time evaluator for saved records. T1's evaluateGate (gates.js) and validateRecords (contract.js)
// are frozen and ignore timingMethod, so a saved record whose descriptor was deleted, malformed or contradicted would still pass. Every path
// that turns saved records into a verdict (T10 qualify, T13 report) calls evaluateGateChecked, never evaluateGate directly. Pure.
import { evaluateGate } from './gates.js';
import { validateRecordTiming } from './timing-contract.js';

// Throws `timing method: ...` for the first record whose timing method is missing, malformed or not the one its gate expects. With `raws`
// ({ [record.id]: parsed raw payload }), a measured record's raw field is checked too, and a record absent from `raws` is refused.
export function validateEvidence(records, { raws } = {}) {
  for (const r of records) {
    const raw = raws === undefined ? undefined : Object.hasOwn(raws, r.id) ? raws[r.id] : null;
    validateRecordTiming(r, raw);
  }
}

// evaluateGate's own signature and result shape, plus the optional raw payloads. Fails closed: any timing-method error makes the gate
// `invalid/inconclusive` with that one reason, before evaluateGate runs. Otherwise the result is exactly evaluateGate's.
export function evaluateGateChecked(gate, records, manifest, fixtures, { raws } = {}) {
  try { validateEvidence(records, { raws }); }
  catch (error) {
    return { gate, status: 'invalid/inconclusive', reasons: [error.message], evidenceIds: records.filter(row => row.gate === gate).map(row => row.id) };
  }
  return evaluateGate(gate, records, manifest, fixtures);
}
