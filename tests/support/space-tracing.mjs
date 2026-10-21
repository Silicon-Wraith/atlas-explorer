// Ray-stratum comparison against B04's frozen matrix (plan B10; P1, P2). Node-side only: loads the ray
// shards (analytic, adversarial, overview, detail ladders) through the pinned index — a partial view whose
// loaded shards' byte lengths, SHA-256 and declared IDs assembleMatrix verifies, never whole-matrix
// qualification — and compares decoded GPU results with the frozen expectations.
// Rules (P2 and the P1 overview text; no tolerance, floor or eligibility rule is introduced here):
//   - analytic rays: status exact on every case; depth (relative 1e-3, floor 1e-6, P1 `depth`) on the
//     reference-eligible hits; eligible counts recounted and checked against the frozen counts and floors;
//   - adversarial rays: status, reason, subreason and the interior detail exactly; depth recorded only;
//   - overview: B04's compareOverview (20D <= |E|; on surface-bearing rows 20G >= 19|H| with
//     |t - t_ref| <= 2τ(t_ref), a missing hit failing; numerical failure anywhere is a hard failure), plus
//     the recount of |E| and |H| against the frozen counts and floors and, on κ = ±4 rows, all 1024 misses;
//   - detail ladders (diagnostic, ladder-v1): agreement iff 20D <= |E| and large depth errors (> 1 %,
//     a missing hit counting as one) are at most 5 % of eligible hits; below 512 eligible or 128 hits the
//     row is inconclusive; requested-input and effective-input comparisons are recorded separately;
//   - usability: every class within ±5 points of B04's binary64 prediction and no numerical failure.
// A numerical failure anywhere is reported; a stratum that is not frozen is inconclusive.
import { readFileSync } from 'node:fs';
import { assembleMatrix, compareOverview } from '../reference/matrix.mjs';
import { verifyMatrixPins } from './space-numerics.mjs';
import { MATRIX_PINS, RAY_STRATUM_KINDS } from '../../src/space/numerics/validation-records.js';

const referenceDir = new URL('../reference/', import.meta.url);

export function loadPinnedRayStrata({ kinds = RAY_STRATUM_KINDS } = {}) {
  if (!Array.isArray(kinds) || kinds.some(kind => !RAY_STRATUM_KINDS.includes(kind))) throw new Error('B10 loads ray strata and anchors only');
  const index = verifyMatrixPins(readFileSync(new URL('space-matrix.json', referenceDir)));
  const view = assembleMatrix(index, path => readFileSync(new URL(path, referenceDir)), { kinds: [...kinds] });
  if (view.complete !== false) throw new Error('a ray-strata load must be a partial view');
  return { ...view, indexSha256: MATRIX_PINS.indexSha256, tolerances: index.matrixTemplate.tolerances, rules: index.matrixTemplate.rules,
    anchors: index.matrixTemplate.anchors,
    shards: index.shards.filter(shard => kinds.includes(shard.kind)).map(({ path, kind, byteLength, sha256 }) => ({ path, kind, byteLength, sha256 })) };
}

const RAY_STATUSES = ['approximate hit', 'miss', 'unresolved', 'numerical failure'];
const hitOf = c => c.expected.status === 'approximate hit' && c.expected.t > 0;
export function depthAllowance(tolerance, expected) { return Math.max(tolerance.floor ?? 0, tolerance.value * Math.abs(expected)); }
// The frozen eligible counts must be what the frozen cases say, and must meet the stratum's floors.
function recount(stratum) {
  const eligible = stratum.cases.filter(c => c.referenceEligible), hits = eligible.filter(hitOf);
  const counts = { reference: eligible.length, positiveHits: hits.length };
  const mismatch = Object.entries(counts).filter(([key, value]) => stratum.eligible?.[key] !== undefined && stratum.eligible[key] !== value).map(([key]) => key);
  const belowFloor = Object.entries(stratum.floor ?? {}).filter(([key, floor]) => !((counts[key] ?? 0) >= floor)).map(([key]) => key);
  return { counts, mismatch, belowFloor, eligible, hits };
}
function verdict(stratum, { valid, failures, numericalFailures, recounted }) {
  const conclusive = stratum.state === 'frozen' && recounted.belowFloor.length === 0 && recounted.mismatch.length === 0;
  const passed = conclusive && valid && failures === 0 && numericalFailures === 0;
  return { state: !conclusive ? 'inconclusive' : passed ? 'passed' : 'failed', passed };
}

export function compareAnalyticStratum(stratum, results, tolerances) {
  const recounted = recount(stratum), failures = [];
  let numericalFailures = 0, valid = Array.isArray(results) && results.length === stratum.cases.length, worstDepth = 0, depthCompared = 0;
  stratum.cases.forEach((c, i) => {
    const a = results?.[i];
    if (!RAY_STATUSES.includes(a?.status)) { valid = false; failures.push({ id: c.id, quantity: 'result', expected: c.expected.status, actual: a?.status ?? 'absent' }); return; }
    if (a.status === 'numerical failure') numericalFailures++;
    if (a.status !== c.expected.status) failures.push({ id: c.id, quantity: 'status', expected: c.expected.status, actual: a.status, t: a.t });
    if (c.referenceEligible && hitOf(c) && a.status === 'approximate hit') {
      depthCompared++;
      const ratio = Math.abs(a.t - c.expected.t) / depthAllowance(tolerances.depth, c.expected.t);
      worstDepth = Math.max(worstDepth, ratio);
      if (!(ratio <= 1)) failures.push({ id: c.id, quantity: 'depth', expected: c.expected.t, actual: a.t, ratio });
    }
  });
  const v = verdict(stratum, { valid, failures: failures.length, numericalFailures, recounted });
  return { id: stratum.id, kind: stratum.kind, role: stratum.role, ...v, eligible: recounted.counts, floor: stratum.floor, belowFloor: recounted.belowFloor,
    countMismatch: recounted.mismatch, cases: stratum.cases.length, depthCompared, worstDepthRatio: worstDepth, numericalFailures, failureCount: failures.length,
    depthFailures: failures.filter(f => f.quantity === 'depth').length, statusFailures: failures.filter(f => f.quantity === 'status').length,
    failures: failures.slice(0, 20), excluded: stratum.excluded?.length ?? 0 };
}

export function compareAdversarialRays(stratum, results) {
  const rows = [], failures = [];
  let numericalFailures = 0, valid = Array.isArray(results) && results.length === stratum.cases.length;
  stratum.cases.forEach((c, i) => {
    const e = c.expected, a = results?.[i];
    if (!RAY_STATUSES.includes(a?.status)) { valid = false; failures.push({ id: c.id, quantity: 'result', actual: a?.status ?? 'absent' }); return; }
    if (a.status === 'numerical failure' && e.status !== 'numerical failure') numericalFailures++;
    const checks = { status: [e.status, a.status], reason: [e.reason ?? null, a.reason ?? null], subreason: [e.subreason ?? null, a.subreason ?? null], detail: [e.detail ?? null, a.detail ?? null] };
    for (const [quantity, [expected, actual]] of Object.entries(checks)) if (expected !== actual) failures.push({ id: c.id, quantity, expected, actual });
    rows.push({ id: c.id, expected: { status: e.status, reason: e.reason ?? null, subreason: e.subreason ?? null, detail: e.detail ?? null, t: e.t },
      actual: { status: a.status, reason: a.reason ?? null, subreason: a.subreason ?? null, detail: a.detail ?? null, t: a.t, steps: a.steps }, depthDifference: a.t - e.t });
  });
  const conclusive = stratum.state === 'frozen' && stratum.cases.length === (stratum.floor?.semantic ?? 0);
  const passed = conclusive && valid && failures.length === 0 && numericalFailures === 0;
  return { id: stratum.id, kind: stratum.kind, role: stratum.role, state: !conclusive ? 'inconclusive' : passed ? 'passed' : 'failed', passed,
    eligible: stratum.eligible, floor: stratum.floor, cases: stratum.cases.length, numericalFailures, failureCount: failures.length, failures, rows };
}

export function compareOverviewStratum(stratum, results) {
  const recounted = recount(stratum), b04 = compareOverview(stratum, results);
  const extra = [];
  if (b04.eligible !== recounted.counts.reference || b04.hits !== recounted.counts.positiveHits) extra.push('compareOverview recount differs');
  const kappa = stratum.parameters?.kappa;
  if (Math.abs(kappa ?? 0) === 4) {
    const notMiss = results.filter(r => r?.status !== 'miss').length;
    if (notMiss) extra.push(`empty slice: ${notMiss} of ${results.length} rays are not misses`);
  }
  const conclusive = stratum.state === 'frozen' && recounted.belowFloor.length === 0 && recounted.mismatch.length === 0;
  const passed = conclusive && b04.passed && extra.length === 0;
  const disagreements = stratum.cases.flatMap((c, i) => (c.referenceEligible && results[i]?.status !== c.expected.status ? [{ id: c.id, expected: c.expected.status, actual: results[i]?.status, reason: results[i]?.reason, t: results[i]?.t }] : []));
  const depthMisses = stratum.cases.flatMap((c, i) => {
    if (!c.referenceEligible || !hitOf(c)) return [];
    const a = results[i], alpha = 2 * Math.tan(Math.PI / 6) / stratum.inputs.profile.height, tau = Math.max(1e-6, 0.5 * alpha * c.expected.t);
    return a?.status === 'approximate hit' && Math.abs(a.t - c.expected.t) <= 2 * tau ? [] : [{ id: c.id, expected: c.expected.t, actual: a?.status === 'approximate hit' ? a.t : a?.status, tau }];
  });
  return { ...b04, b04Passed: b04.passed, id: stratum.id, kind: stratum.kind, role: stratum.role, state: !conclusive ? 'inconclusive' : passed ? 'passed' : 'failed', passed,
    surfaceBearing: stratum.surfaceBearing, parameters: stratum.parameters, eligible: recounted.counts, floor: stratum.floor, belowFloor: recounted.belowFloor,
    countMismatch: recounted.mismatch, extra, disagreementsSample: disagreements.slice(0, 8), depthMissesSample: depthMisses.slice(0, 8), depthMisses: depthMisses.length };
}

function ladderSide(stratum, results, key) {
  let eligible = 0, hits = 0, disagreements = 0, largeErrors = 0;
  stratum.cases.forEach((c, i) => {
    const expected = c[key];
    if (!c.referenceEligible || !expected) return;
    const a = results[i];
    eligible++; disagreements += Number(a?.status !== expected.status);
    if (expected.status === 'approximate hit' && expected.t > 0) {
      hits++;
      largeErrors += Number(!(a?.status === 'approximate hit' && Math.abs(a.t - expected.t) <= 0.01 * expected.t));
    }
  });
  return { eligible, hits, disagreements, largeErrors, statusAgreement: eligible > 0 && 20 * disagreements <= eligible, depthAgreement: hits > 0 && 20 * largeErrors <= hits };
}
export function compareLadderStratum(stratum, results) {
  const recounted = recount(stratum);
  const numericalFailures = results.filter(r => r?.status === 'numerical failure').length;
  const valid = Array.isArray(results) && results.length === stratum.cases.length && results.every(r => RAY_STATUSES.includes(r?.status));
  const effective = ladderSide(stratum, results, 'expected'), requested = ladderSide(stratum, results, 'requestedExpected');
  const conclusive = stratum.state === 'frozen' && recounted.belowFloor.length === 0 && recounted.mismatch.length === 0;
  const agreement = effective.statusAgreement && effective.depthAgreement;
  const terminations = {};
  for (const r of results) { const key = r?.status === 'unresolved' ? `unresolved:${r.reason}${r.subreason ? `:${r.subreason}` : ''}` : r?.status; terminations[key] = (terminations[key] ?? 0) + 1; }
  return { id: stratum.id, kind: stratum.kind, role: stratum.role, profile: stratum.profile, anchorId: stratum.parameters.anchorId, distance: stratum.parameters.distance,
    outcome: !valid ? 'invalid' : !conclusive ? 'inconclusive' : agreement ? 'agreement' : 'exceedance', valid, eligible: recounted.counts, floor: stratum.floor,
    belowFloor: recounted.belowFloor, countMismatch: recounted.mismatch, effective, requested, numericalFailures, terminations };
}

export const USABILITY_CLASSES = ['hit', 'miss', 'point-budget', 'estimate-unavailable', 'ray-step-budget', 'stagnation:ray-parameter', 'stagnation:field-coordinate', 'numericalFailure'];
export function terminationCounts(results) {
  const counts = Object.fromEntries(USABILITY_CLASSES.map(key => [key, 0]));
  for (const r of results) {
    if (r.status === 'approximate hit') counts.hit++;
    else if (r.status === 'miss') counts.miss++;
    else if (r.status === 'numerical failure') counts.numericalFailure++;
    else if (r.status === 'unresolved') counts[r.reason === 'stagnation' ? `stagnation:${r.subreason}` : r.reason]++;
    else throw new RangeError(`invalid ray status ${r.status}`);
  }
  return counts;
}
export function compareUsability(prediction, results) {
  const counts = terminationCounts(results), total = prediction.rays;
  if (results.length !== total) return { passed: false, reason: `expected ${total} rays, got ${results.length}` };
  const p = prediction.distribution;
  const predicted = { hit: p.hit, miss: p.miss, ...p.unresolved, numericalFailure: p.numericalFailure };
  const rows = USABILITY_CLASSES.map(key => ({ class: key, predicted: predicted[key], gpu: counts[key], differencePoints: 100 * (counts[key] - predicted[key]) / total }));
  const within = rows.every(row => Math.abs(row.gpu - row.predicted) <= prediction.acceptance.perClassAbsoluteFraction * total);
  return { passed: within && counts.numericalFailure <= prediction.acceptance.numericalFailureMax, rows, counts, total };
}

// The analytic unit-sphere disc in a camera frame (binary64): a pixel centre's ray hits iff its closest
// approach to the origin is below 1. A pixel lies within one pixel of the edge when the angular distance
// between its ray and the silhouette cone is below the local angular pixel size.
// `centreDirection` (default: rayDirection) measures the local pixel size between unjittered pixel
// centres, so a jittered sample's band is still one pixel wide.
export function sphereSilhouette({ origin, rayDirection, centreDirection = rayDirection, width, height }) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], length = v => Math.sqrt(dot(v, v));
  const distance = length(origin), toCentre = origin.map(v => -v / distance), beta = Math.asin(1 / distance), mask = [];
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const d = rayDirection(i, j), here = centreDirection(i, j), next = centreDirection(i + (i + 1 < width ? 1 : -1), j);
    const theta = Math.acos(Math.min(1, Math.max(-1, dot(d, toCentre)))), pixelAngle = Math.acos(Math.min(1, dot(here, next)));
    mask.push({ hit: theta < beta, edge: Math.abs(theta - beta) < pixelAngle, theta, beta });
  }
  return mask;
}
export function angleBetween(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(...cross), dot);
}

// The report row for one analytic comparison: the comparator's complete counts plus a short failure sample.
export function analyticReportRow({ failures, ...row }) {
  return { ...row, firstFailures: failures.slice(0, 5) };
}
