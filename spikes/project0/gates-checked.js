// spikes/project0/gates-checked.js — the read-time evaluator for saved records. T1's evaluateGate (gates.js) and validateRecords (contract.js)
// are frozen and ignore timingMethod, so a saved record whose descriptor was deleted, malformed or contradicted would still pass. Every path
// that turns saved records into a verdict (T10 qualify, T13 report) calls evaluateGateChecked, never evaluateGate directly. Pure.
import { evaluateGate } from './gates.js';
import { validateRecordTiming } from './timing-contract.js';

// Throws `timing method: ...` for the first record whose timing method is missing, malformed, not the one its gate expects, or (for a measured
// descriptor) not backed by a usable raw payload. `raws` ({ [record.id]: parsed raw payload }) is required: an omitted or non-object map is
// refused for every gate, and an absent, undefined or null entry is refused for a measured record.
export function validateEvidence(records, { raws } = {}) {
  if (raws === undefined || raws === null || typeof raws !== 'object' || Array.isArray(raws)) throw new Error('timing method: the raws map (record id -> parsed raw payload) is required for a verdict');
  for (const r of records) validateRecordTiming(r, Object.hasOwn(raws, r?.id) ? raws[r.id] : undefined);
}

// evaluateGate's own arguments and result shape, plus the required raw payloads. Fails closed: any timing-method error, including a missing
// raws map or raw payload, makes the gate `invalid/inconclusive` with that one reason, before evaluateGate runs. Otherwise the result is
// exactly evaluateGate's.
export function evaluateGateChecked(gate, records, manifest, fixtures, { raws } = {}) {
  try { validateEvidence(records, { raws }); }
  catch (error) {
    return { gate, status: 'invalid/inconclusive', reasons: [error.message], evidenceIds: records.filter(row => row.gate === gate).map(row => row.id) };
  }
  return evaluateGate(gate, records, manifest, fixtures);
}
