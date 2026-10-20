// spikes/project0/measure/precision.mjs — A.10/A.11 interpretation, recomputed from raw results and frozen fixtures only.
import { comparePrecision } from '../reference/preparation.js';
import { decodeTrace } from './decode.mjs';

export function medianOf(xs) { const v = [...xs].sort((a, b) => a - b), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; }
const summary = (xs, n, what) => {
  if (!Array.isArray(xs) || xs.length !== n || !xs.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0)) throw new Error(`${what}: exactly ${n} finite, nonnegative samples are required`);
  return { median: medianOf(xs), min: Math.min(...xs), max: Math.max(...xs), samples: xs.length };
};
const bytesOk = (x, what) => { if (!Number.isInteger(x) || x < 0) throw new Error(`${what} must be a nonnegative integer`); return x; };

export function precisionMetrics(fx, raw) {
  const cases = fx.primitives;
  if (!Array.isArray(raw.primitives) || raw.primitives.length !== cases.length) throw new Error(`expected one result per frozen primitive case (${cases.length})`);
  const primitiveFailures = [];
  raw.primitives.forEach((got, i) => {
    const p = cases[i];
    for (const k of ['hi', 'lo', 'thenHi', 'thenLo']) if (typeof got?.[k] !== 'number' || !Number.isFinite(got[k])) throw new Error(`primitive case ${i}: ${k} must be finite`);
    const value = got.hi + got.lo;
    if (!(Math.abs(value - p.value) <= p.absoluteTolerance)) primitiveFailures.push(`${p.op}(${JSON.stringify(p.args)}): got ${value}, expected ${p.value}`);
    if ('thenAdd' in p && !(Math.abs(got.thenHi + got.thenLo - p.thenValue) <= p.absoluteTolerance)) primitiveFailures.push(`${p.op}: the low component was not retained (then ${got.thenHi + got.thenLo}, expected ${p.thenValue})`);
  });
  const validated = primitiveFailures.length === 0;
  if (!Array.isArray(raw.sets) || raw.sets.length !== fx.precision.results.length) throw new Error('one result set per frozen precision distance is required');
  const steps = fx.profiles.precision.steps, n = fx.costProtocol.measured; let firstStop = null;
  const rows = raw.sets.map((s, i) => {
    const set = fx.precision.results[i];
    if (s.distance !== set.distance) throw new Error('precision set order differs from the fixture');
    const baseline = decodeTrace(s.baseline.words, set.rows.length, { maxSteps: steps });
    const vsRequested = comparePrecision(set, baseline, 'requested'), vsBaselineInput = comparePrecision(set, baseline, 'baselineInput');
    if (firstStop === null && vsRequested.stopReasons.length) firstStop = { distance: set.distance, reasons: vsRequested.stopReasons };
    const row = { distance: set.distance, interpreted: firstStop === null, baseline: { vsRequested, vsBaselineInput },
      cost: { baseline: { workMs: summary(s.baseline.workMs, n, 'baseline work'), readMs: summary(s.baseline.readMs, n, 'baseline readback') }, compensated: { workMs: summary(s.compensated.workMs, n, 'compensated work'), readMs: summary(s.compensated.readMs, n, 'compensated readback') } },
      extraBytes: bytesOk(s.compensated.peakBytes, 'compensated peak bytes') - bytesOk(s.baseline.peakBytes, 'baseline peak bytes') };
    if (validated) { const comp = decodeTrace(s.compensated.words, set.rows.length, { maxSteps: steps }); row.compensated = { vsRequested: comparePrecision(set, comp, 'requested'), vsCompensatedInput: comparePrecision(set, comp, 'compensatedInput') }; }
    return row;
  });
  const threshold = rows.find(r => r.interpreted && r.baseline.vsRequested.thresholdExceeded === true)?.distance ?? null;
  return { validated, primitiveFailures, rows, observedDisagreementThreshold: threshold, firstStop };
}

// The complete precision assessment, derived from verified evidence and never from a saved flag. Execution invalidations are the
// record's own, unchanged; an environment or interpretation problem is stored separately; `interpretable` is derived.
export function assessPrecision({ fx, record, raw, selected }) {
  const executionInvalidations = [...record.invalidations];
  const complete = record.slot === 'precision' && executionInvalidations.length === 0;
  const envKeys = ['browserVersion', 'browserExecutable', 'driver', 'session'].filter(k => selected.some(s => s.identity[k] !== record.identity[k]));
  const headed = selected.filter(s => s.identity.mode === 'headed');
  const launchMismatch = record.identity.mode !== 'headed' || headed.length === 0 || headed.some(s => s.identity.launchHash !== record.identity.launchHash);
  const environmentError = envKeys.length || launchMismatch ? `precision did not run on the selected environment (${[...envKeys, ...(launchMismatch ? ['headed launch configuration'] : [])].join(', ')})` : null;
  const out = { executionInvalidations, complete, environmentError, interpretationError: null, interpretable: false };
  if (!complete || environmentError) return out;
  try { return { ...out, interpretable: true, ...precisionMetrics(fx, raw) }; }
  catch (e) { return { ...out, interpretationError: e.message }; }
}
