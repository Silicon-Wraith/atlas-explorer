// spikes/project0/remediation/evidence-rules.mjs — read-time rules for evidence produced under the remediation launch configuration
// (WebGPU remediation prereg rev 2), applied by qualify.mjs recompute to every clean record whose saved launch carries the developer flag:
//  - G5 records must declare the compensated form (§2.7: no silent fallback to the original arithmetic);
//  - every acquisition of the invocation is recorded, and its granted features follow the unchanged request policy (§3.5): G1 and the
//    arithmetic/checks path request none, the common rendering/session path requests only timestamp-query, granted = requested ∩ available;
//  - where attempt 1 holds a comparable acquired-device record (same gate, mode and acquisition role), the granted sets must be equal; where it
//    holds none, the comparison is recorded as unavailable and nothing is inferred.
import { DEVELOPER_FLAG } from '../launch.mjs';
import { COMPENSATED_FORM } from './validate.mjs';
import { isVerifiedQualification } from '../qualification.mjs';

export const NO_FEATURE_GATES = Object.freeze(['G1', 'G3', 'G4', 'G5']);
export const roleOf = gate => (NO_FEATURE_GATES.includes(gate) ? (gate === 'G1' ? 'g1' : 'checks') : 'session');
export const requestedFor = gate => (roleOf(gate) === 'session' ? ['timestamp-query'] : []);
export const BASELINE_MANIFEST = 'docs/reports/project0/webgpu-1-manifest.json';
const sorted = a => [...a].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
export const underRemediation = launchInfo => Array.isArray(launchInfo?.requestedArgs) && launchInfo.requestedArgs.includes(DEVELOPER_FLAG);

export function acquisitionProblems(gate, acquisitions) {
  if (!Array.isArray(acquisitions) || !acquisitions.length) return ['no acquisition record (available and granted features must be recorded for every acquisition)'];
  const problems = [], want = requestedFor(gate);
  acquisitions.forEach((a, i) => {
    if (!a || !Array.isArray(a.requestedFeatures) || !Array.isArray(a.features) || !Array.isArray(a.grantedFeatures)) { problems.push(`acquisition ${i}: requested, available or granted features are not recorded`); return; }
    if (!same(a.requestedFeatures, want)) problems.push(`acquisition ${i}: requested ${JSON.stringify(a.requestedFeatures)}, the policy for ${gate} is ${JSON.stringify(want)}`);
    const expected = a.requestedFeatures.filter(f => a.features.includes(f));
    if (!same(a.grantedFeatures, expected)) problems.push(`acquisition ${i}: granted ${JSON.stringify(a.grantedFeatures)}, but requested ∩ available is ${JSON.stringify(expected)}`);
  });
  return problems;
}

// The granted set an attempt-1 record actually recorded for its acquired device, or null when it recorded none (never inferred).
export function recordedGranted(raw) {
  if (Array.isArray(raw?.acquisitions) && raw.acquisitions.length) return raw.acquisitions.map(a => a?.grantedFeatures).every(Array.isArray) ? sorted([...new Set(raw.acquisitions.flatMap(a => a.grantedFeatures))]) : null;
  if (raw?.adapterInfo && Array.isArray(raw.adapterInfo.grantedFeatures)) return sorted(raw.adapterInfo.grantedFeatures);
  return null;
}
// One row per remediation record: equal, differs, or unavailable (attempt 1 never acquired a device for that gate, mode and role).
export function featureComparison(record, raw, baseline) {
  const row = { id: record.id, gate: record.gate, slot: record.slot, mode: record.identity?.mode ?? null, role: roleOf(record.gate), remediation: recordedGranted(raw) };
  const candidates = (baseline?.records ?? []).filter(b => b.gate === record.gate && (b.identity?.mode ?? null) === row.mode)
    .map(b => ({ id: b.id, granted: recordedGranted(baseline.raws?.[b.id]) })).filter(b => b.granted !== null);
  if (!candidates.length) return { ...row, status: 'unavailable', baseline: null };
  const differs = candidates.filter(b => row.remediation === null || !same(b.granted, row.remediation));
  return { ...row, status: differs.length ? 'differs' : 'equal', baseline: candidates };
}

// G5-D prereg §8.4: the G5 arithmetic contract is selected by the authenticated profile, never by the developer flag alone. The E7 profile
// (historical webgpu-remediation) and evidence without a profile keep the G5-A compensated rule; project0-g5d-v1 requires its plain form.
export function requiredG5Form(qualification = null) {
  if (qualification === null || qualification === undefined) return COMPENSATED_FORM;
  if (!isVerifiedQualification(qualification)) throw new Error('the G5 arithmetic contract needs a verified qualification context (loadQualification)');
  return qualification.doc.kernel?.form ?? COMPENSATED_FORM;
}
export function remediationRecordProblems(record, raw, launchInfo, baseline, qualification = null) {
  if (!underRemediation(launchInfo)) return [];
  const problems = [], form = requiredG5Form(qualification);
  if (record.gate === 'G5' && raw?.form !== form) problems.push(form === COMPENSATED_FORM ? `G5 evidence under the remediation configuration must declare the compensated form (found ${JSON.stringify(raw?.form ?? null)})`
    : `G5 evidence under ${qualification.id} must declare its plain form ${form} (found ${JSON.stringify(raw?.form ?? null)})`);
  problems.push(...acquisitionProblems(record.gate, raw?.acquisitions));
  const cmp = featureComparison(record, raw, baseline);
  if (cmp.status === 'differs') problems.push(`granted features ${JSON.stringify(cmp.remediation)} differ from attempt 1's comparable record(s) ${JSON.stringify(cmp.baseline)}`);
  return problems;
}
