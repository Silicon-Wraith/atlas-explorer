// spikes/project0/gates-checked.js — the read-time evaluator for saved records. T1's evaluateGate (gates.js) and validateRecords (contract.js)
// are frozen and ignore timingMethod, so a saved record whose descriptor was deleted, malformed or contradicted would still pass. Every path
// that turns saved records into a verdict (T10 qualify, T13 report) calls evaluateGateChecked, never evaluateGate directly. No hardware.
import { evaluateGate, gatePlan } from './gates.js';
import { validateRecords } from './contract.js';
import { isVerifiedQualification, effectiveGatePlan, validateQualification, addedSlotsOf } from './qualification.mjs';
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
// E7 / G1-D (Codex design run 20261020T042650Z-8f9e): `qualification` is a context verified by qualification.mjs. Without one, the frozen
// evaluator decides every gate. With one, it still decides G2-G13; G1 is evaluated headed-only: the frozen validateRecords over the effective
// plan, exactly one record in the headed slot with a headed execution identity, invalidations kept, and the unchanged rules of the frozen
// gatePlan(fixtures).G1.headed. The missing headless trial is never synthesised, and the frozen verdict is never overridden.
export function evaluateGateChecked(gate, records, manifest, fixtures, { raws, qualification = null } = {}) {
  const evidenceIds = records.filter(row => row.gate === gate).map(row => row.id);
  const invalid = reasons => ({ gate, status: 'invalid/inconclusive', reasons, evidenceIds });
  try { validateEvidence(records, { raws }); }
  catch (error) { return invalid([error.message]); }
  // E7 fix round 1 (Codex run 20261020T044717Z-36ea, finding 1): the manifest and the context are bound here, before either branch: an E7
  // manifest without its context, a legacy manifest with one, or a removed, altered or extended reference/exclusion never evaluates.
  if (qualification !== null && qualification !== undefined && !isVerifiedQualification(qualification)) return invalid(['a verified qualification context is required for an amended evaluation']);
  try { validateQualification(manifest, qualification ?? null); }
  catch (error) { return invalid([`qualification: ${error.message}`]); }
  if (qualification === null || qualification === undefined) return evaluateGate(gate, records, manifest, fixtures);
  // G5-D (prereg §8.3): a profile that injects a slot validates every record once against the effective plan; an unchanged gate is then decided
  // by the frozen evaluator over its own records only, so a selected G5/qjulia-operational record can never make other evidence invalid
  // through the frozen plan's unknown-slot check. All of the frozen evaluator's invalidation, coverage and attribution checks still apply.
  const amending = addedSlotsOf(qualification).length > 0, plan = effectiveGatePlan(fixtures, qualification);
  if (amending) { try { validateRecords(records, manifest, plan); } catch (error) { return invalid([error.message]); } }
  if (gate === 'G5' && addedSlotsOf(qualification).some(k => k.startsWith('G5/'))) return evaluateAmended(gate, records, plan, evidenceIds, invalid);
  if (gate !== 'G1') return evaluateGate(gate, amending ? records.filter(row => row.gate === gate) : records, manifest, fixtures);
  try { validateRecords(records, manifest, plan); }
  catch (error) { return invalid([error.message]); }
  const rows = records.filter(row => row.gate === 'G1');
  if (rows.length !== 1 || rows[0].slot !== 'headed') return invalid(['missing required trials']);
  if (rows[0].identity?.mode !== 'headed') return invalid([`G1/headed: execution identity ${rows[0].identity?.mode} is not headed`]);
  if (rows[0].invalidations.length) return invalid([...rows[0].invalidations]);
  const reasons = [];
  for (const [key, [operation, a, b]] of Object.entries(gatePlan(fixtures).G1.headed)) {
    const value = rows[0].metrics[key];
    const passed = operation === 'eq' ? value === a : operation === 'le' ? value <= a : operation === 'ge' ? value >= a : value >= a && value <= b;
    if (!passed) reasons.push(`headed: ${key}=${value}`);
  }
  return { gate, status: reasons.length ? 'fail' : 'pass', reasons, evidenceIds };
}

// G5-D: the amended G5 over the effective plan (the unchanged frozen qjulia-plane rules and the profile's qjulia-operational rules): exactly
// one record per required slot, each with a headed execution identity, invalidations kept as invalid/inconclusive, then every rule.
function evaluateAmended(gate, records, plan, evidenceIds, invalid) {
  const rows = records.filter(row => row.gate === gate), expected = plan[gate];
  if (rows.length !== Object.keys(expected).length || Object.keys(expected).some(slot => rows.filter(r => r.slot === slot).length !== 1)) return invalid(['missing required trials']);
  const modes = rows.filter(r => r.identity?.mode !== 'headed');
  if (modes.length) return invalid(modes.map(r => `${gate}/${r.slot}: execution identity ${r.identity?.mode} is not headed`));
  const invalidations = rows.flatMap(row => row.invalidations);
  if (invalidations.length) return invalid(invalidations);
  const reasons = [];
  for (const row of rows) for (const [key, [operation, a, b]] of Object.entries(expected[row.slot])) {
    const value = row.metrics[key];
    const passed = operation === 'eq' ? value === a : operation === 'le' ? value <= a : operation === 'ge' ? value >= a : value >= a && value <= b;
    if (!passed) reasons.push(`${row.slot}: ${key}=${value}`);
  }
  return { gate, status: reasons.length ? 'fail' : 'pass', reasons, evidenceIds };
}
