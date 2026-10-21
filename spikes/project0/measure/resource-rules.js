// spikes/project0/measure/resource-rules.js — the G11 rules applied to one A.8 resource exercise, shared by Node (measure/resources.mjs, G11 and
// G12's maintenance records) and the page (G12's maintenance check, T9 fix round 1). `.js` and pure, so the browser can import it; it uses
// T1's own rule definitions (gatePlan) and changes no frozen evaluator. Moved unchanged from measure/resources.mjs, plus maintenanceProblems.
import { gatePlan } from '../gates.js';
export function resourceMetrics(raw, fx) {
  if (raw.errors?.length) throw Object.assign(new Error(raw.errors.join('; ')), { invalidation: true });
  const R = fx.resources, textures = R.entries.filter(e => e.kind === 'texture').length, selected = R.readback.x.length * R.readback.y.length * textures;
  if (!Array.isArray(raw.written) || raw.written.length !== textures) throw new Error('A.8: the write workload is incomplete');
  if (!Array.isArray(raw.checks) || raw.checks.length !== selected || !raw.checks.every(c => typeof c.ok === 'boolean')) throw new Error(`A.8: expected ${selected} selected checks`);
  for (const k of ['before', 'after']) if (!raw[k] || !['bytes', 'textures', 'buffers'].every(f => Number.isInteger(raw[k][f]))) throw new Error(`A.8: malformed ${k} inventory`);
  if (!Number.isInteger(raw.cancel?.before) || !Number.isInteger(raw.cancel?.after)) throw new Error('A.8: malformed cancellation observation');
  const same = (a, b) => a.bytes === b.bytes && a.textures === b.textures && a.buffers === b.buffers;
  return {
    tableBytes: raw.tableBytes, peakBytes: raw.peakBytes, texturesWritten: raw.written.filter(Boolean).length, selectedChecks: raw.checks.length,
    mismatches: raw.checks.filter(c => !c.ok).length + (raw.bandOk ? 0 : 1), fullBandBytes: raw.fullBandBytes,
    cancelled: raw.cancel.before === 2 && raw.cancel.after === 0 ? 1 : 0, released: same(raw.before, raw.after) ? 1 : 0, outstandingMax: raw.outstandingMax,
  };
}
// A maintenance exercise is checked against *every* G11 rule, using T1's own rule definitions. Missing or nonfinite metrics throw
// (invalid evidence); a measured violation of any rule returns true (a maintenance failure).
export function maintenanceFailed(raw, fx, rules = gatePlan(fx).G11['4k']) {
  const m = resourceMetrics(raw, fx);
  for (const [key, [op, a, b]] of Object.entries(rules)) {
    const v = m[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`A.8 maintenance: ${key} is missing or nonfinite`);
    const ok = op === 'eq' ? v === a : op === 'le' ? v <= a : op === 'ge' ? v >= a : v >= a && v <= b;
    if (!ok) return true;
  }
  return false;
}
// Every reason one exercise fails: its own errors, a malformed or nonfinite observation, or each violated G11 rule with its value. Empty when
// it passes. The page stops on any reason (G12); maintenanceFailed above is the Node evaluators' boolean form of the same rules.
export function maintenanceProblems(raw, fx, rules = gatePlan(fx).G11['4k']) {
  if (!raw || typeof raw !== 'object') return ['A.8: no maintenance result'];
  if (raw.errors?.length) return [...raw.errors];
  let m;
  try { m = resourceMetrics(raw, fx); } catch (e) { return [e.message]; }
  const problems = [];
  for (const [key, [op, a, b]] of Object.entries(rules)) {
    const v = m[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) { problems.push(`${key} is missing or nonfinite`); continue; }
    const ok = op === 'eq' ? v === a : op === 'le' ? v <= a : op === 'ge' ? v >= a : v >= a && v <= b;
    if (!ok) problems.push(`${key} ${v} (rule ${op} ${op === 'range' ? `${a}..${b}` : a})`);
  }
  return problems;
}
