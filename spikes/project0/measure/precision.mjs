// spikes/project0/measure/precision.mjs — A.10/A.11 interpretation, recomputed from raw results and frozen fixtures only.
// T12 fix round 1 (Codex T12 r1; task-T12-report.md "Fix round 1"; docs/reports/project0/t12-validation-prereg.md):
// - F1: `validated` also requires the supplemental primitive corpus (loaded only through its pinned hash) and the in-kernel captures of
//   trace_ff_list, each site within its preregistered bound and enough discriminating sites per class. Otherwise compensation is UNVALIDATED
//   and never interpreted.
// - F4: the assessment validates the record's registered timing descriptor and cost span itself; a failure is stored as timingError.
// - F3: only a raw marked complete is interpreted.
// - F5: each implementation's batch evidence is recomputed: the first size, every next size by BATCH_POLICY, and the maximum outstanding count.
// - Concern 2: extraBytes stays the signed difference of the two allocation peaks, reported with both breakdowns.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { comparePrecision } from '../reference/preparation.js';
import { decodeTrace } from './decode.mjs';
import { validateRecordTiming } from '../timing-contract.js';
import { PRECISION_CORPUS, BATCH_POLICY, nextBatch, maxOutstandingOf } from '../precision-config.js';
import { checkSupplement, checkCaptures, captureVerdict } from '../precision-validation/models.js';

export function medianOf(xs) { const v = [...xs].sort((a, b) => a - b), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; }
const summary = (xs, n, what) => {
  if (!Array.isArray(xs) || xs.length !== n || !xs.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0)) throw new Error(`${what}: exactly ${n} finite, nonnegative samples are required`);
  return { median: medianOf(xs), min: Math.min(...xs), max: Math.max(...xs), samples: xs.length };
};
const bytesOk = (x, what) => { if (!Number.isInteger(x) || x < 0) throw new Error(`${what} must be a nonnegative integer`); return x; };

// The supplemental corpus, only through its pin: any other bytes are an interpretation error, never "unvalidated".
let corpusCache = null;
export function loadCorpus(read = () => readFileSync(new URL(`../${PRECISION_CORPUS.path}`, import.meta.url))) {
  if (corpusCache) return corpusCache;
  const bytes = read(), hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== PRECISION_CORPUS.sha256) throw new Error(`supplemental validation corpus: ${PRECISION_CORPUS.path} hashes ${hash}, not the pinned ${PRECISION_CORPUS.sha256}`);
  return (corpusCache = JSON.parse(String(bytes)));
}

// F5: one implementation's runs at one distance, recomputed against the policy.
function batchEvidence(runs, total, what) {
  if (!Array.isArray(runs) || runs.length !== total) throw new Error(`${what}: batch evidence for exactly ${total} runs is required`);
  runs.forEach((r, i) => {
    if (!Number.isInteger(r?.batch) || !Array.isArray(r.batches) || !r.batches.length) throw new Error(`${what} run ${i}: batch size and batch rows are required`);
    const expected = i === 0 ? BATCH_POLICY.initialBatch : nextBatch(runs[i - 1].batches, runs[i - 1].batch);
    if (r.batch !== expected) throw new Error(`${what} run ${i}: batch policy requires ${expected} rays, not ${r.batch}`);
    const outstanding = maxOutstandingOf(r.batches);
    if (r.maxOutstanding !== outstanding) throw new Error(`${what} run ${i}: the recorded maximum outstanding ${r.maxOutstanding} differs from its batch rows (${outstanding})`);
    if (outstanding > BATCH_POLICY.maxOutstanding) throw new Error(`${what} run ${i}: more than ${BATCH_POLICY.maxOutstanding} batches outstanding (${outstanding})`);
  });
  const measured = runs.filter(r => r.measured);
  return { sizes: measured.map(r => r.batch), maxOutstanding: Math.max(...runs.map(r => r.maxOutstanding)) };
}

export function precisionMetrics(fx, raw) {
  const cases = fx.primitives;
  if (!Array.isArray(raw.primitives) || raw.primitives.length !== cases.length) throw new Error(`expected one result per frozen primitive case (${cases.length})`);
  const frozenFailures = [];
  raw.primitives.forEach((got, i) => {
    const p = cases[i];
    for (const k of ['hi', 'lo', 'thenHi', 'thenLo']) if (typeof got?.[k] !== 'number' || !Number.isFinite(got[k])) throw new Error(`primitive case ${i}: ${k} must be finite`);
    const value = got.hi + got.lo;
    if (!(Math.abs(value - p.value) <= p.absoluteTolerance)) frozenFailures.push(`${p.op}(${JSON.stringify(p.args)}): got ${value}, expected ${p.value}`);
    if ('thenAdd' in p && !(Math.abs(got.thenHi + got.thenLo - p.thenValue) <= p.absoluteTolerance)) frozenFailures.push(`${p.op}: the low component was not retained (then ${got.thenHi + got.thenLo}, expected ${p.thenValue})`);
  });
  if (raw.complete !== true) throw new Error('the precision raw is not complete: a stopped experiment is never interpreted');
  // F1: the supplemental corpus and the in-kernel captures.
  const corpus = loadCorpus();
  if (raw.supplement?.corpusSha256 !== PRECISION_CORPUS.sha256) throw new Error(`supplemental validation corpus: the page used ${raw.supplement?.corpusSha256 ?? 'none'}, not the pinned ${PRECISION_CORPUS.sha256}`);
  const supplementFailures = checkSupplement(raw.supplement.primitives, corpus);
  if (!Array.isArray(raw.sets) || raw.sets.length !== fx.precision.results.length) throw new Error('one result set per frozen precision distance is required');
  const captures = captureVerdict(raw.sets.map((s, i) => checkCaptures(s.captureWords, fx.precision.results[i], corpus.capture)), corpus.capture);
  const primitiveFailures = [...frozenFailures, ...supplementFailures, ...captures.failures.map(x => `capture ${x}`), ...(captures.failureCount > captures.failures.length ? [`capture: ${captures.failureCount - captures.failures.length} further failures`] : []), ...captures.insufficient];
  const validated = primitiveFailures.length === 0;
  const steps = fx.profiles.precision.steps, n = fx.costProtocol.measured, total = fx.costProtocol.warmups + n; let firstStop = null;
  const rows = raw.sets.map((s, i) => {
    const set = fx.precision.results[i];
    if (s.distance !== set.distance) throw new Error('precision set order differs from the fixture');
    const baseline = decodeTrace(s.baseline.words, set.rows.length, { maxSteps: steps });
    const vsRequested = comparePrecision(set, baseline, 'requested'), vsBaselineInput = comparePrecision(set, baseline, 'baselineInput');
    if (firstStop === null && vsRequested.stopReasons.length) firstStop = { distance: set.distance, reasons: vsRequested.stopReasons };
    const cost = { baseline: { workMs: summary(s.baseline.workMs, n, 'baseline work'), readMs: summary(s.baseline.readMs, n, 'baseline readback') }, compensated: { workMs: summary(s.compensated.workMs, n, 'compensated work'), readMs: summary(s.compensated.readMs, n, 'compensated readback') } };
    cost.baseline.batch = batchEvidence(s.baseline.runs, total, `distance ${set.distance} baseline`);
    cost.compensated.batch = batchEvidence(s.compensated.runs, total, `distance ${set.distance} compensated`);
    const baselinePeak = bytesOk(s.baseline.peakBytes, 'baseline peak bytes'), compensatedPeak = bytesOk(s.compensated.peakBytes, 'compensated peak bytes');
    const row = { distance: set.distance, interpreted: firstStop === null, baseline: { vsRequested, vsBaselineInput }, cost, extraBytes: compensatedPeak - baselinePeak,
      bytes: { baselinePeak, compensatedPeak, extraBytes: compensatedPeak - baselinePeak, baselineAllocations: s.baseline.allocations ?? [], compensatedAllocations: s.compensated.allocations ?? [], captureBytes: bytesOk(s.captureBytes, 'capture bytes') } };
    if (validated) { const comp = decodeTrace(s.compensated.words, set.rows.length, { maxSteps: steps }); row.compensated = { vsRequested: comparePrecision(set, comp, 'requested'), vsCompensatedInput: comparePrecision(set, comp, 'compensatedInput') }; }
    return row;
  });
  const threshold = rows.find(r => r.interpreted && r.baseline.vsRequested.thresholdExceeded === true)?.distance ?? null;
  return { validated, primitiveFailures, validation: { frozenFailures, supplementFailures, captures }, rows, observedDisagreementThreshold: threshold, firstStop };
}

// The complete precision assessment, derived from verified evidence and never from a saved flag. Execution invalidations are the
// record's own, unchanged; an environment, timing or interpretation problem is stored separately; `interpretable` is derived.
export function assessPrecision({ fx, record, raw, selected }) {
  const executionInvalidations = [...record.invalidations];
  const complete = record.slot === 'precision' && executionInvalidations.length === 0;
  const envKeys = ['browserVersion', 'browserExecutable', 'driver', 'session'].filter(k => selected.some(s => s.identity[k] !== record.identity[k]));
  const headed = selected.filter(s => s.identity.mode === 'headed');
  const launchMismatch = record.identity.mode !== 'headed' || headed.length === 0 || headed.some(s => s.identity.launchHash !== record.identity.launchHash);
  const environmentError = envKeys.length || launchMismatch ? `precision did not run on the selected environment (${[...envKeys, ...(launchMismatch ? ['headed launch configuration'] : [])].join(', ')})` : null;
  const out = { executionInvalidations, complete, environmentError, timingError: null, interpretationError: null, interpretable: false };
  if (!complete || environmentError) return out;
  // F4: the reviewed read-time timing contract, applied to the saved record and its raw (the descriptor and the cost span).
  try { validateRecordTiming(record, raw); } catch (e) { out.timingError = e.message; }
  let metrics = null;
  try { metrics = precisionMetrics(fx, raw); } catch (e) { out.interpretationError = e.message; }
  if (out.timingError || out.interpretationError) return out;
  return { ...out, interpretable: true, ...metrics };
}
