// Point-stratum comparison against B04's frozen matrix (plan B08; P1). Node-side only: loads the point
// shards through the pinned index (partial view, shard bytes and IDs verified by assembleMatrix) and
// compares decoded GPU results against the binary64 references with the frozen, analysed tolerances.
// Rules (flagged in the B08 report for a Codex ruling):
//   - every quantity listed in a generic case's eligibleQuantities must agree (status and escape
//     index exactly; components, ln R and log2 DE within their tolerances); when status and index are
//     eligible and the reference escaped, estimate availability must agree on both sides;
//   - semantic cases (origin, polar axis, boundary, empty slices, adversarial) compare status, index,
//     availability, every available continuous quantity, the zero state and log2 D; bulb axis values
//     must keep x = y = 0 exactly (φ = 0);
//   - a numerical failure (on any case, eligible or excluded), a missing or malformed result or a
//     wrong result count is a hard failure; disagreements on excluded quantities are diagnostic only;
//   - a stratum that is not frozen or whose eligible counts are below its floor is inconclusive.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assembleMatrix } from '../reference/matrix.mjs';
import { MATRIX_PINS, POINT_STRATUM_KINDS } from '../../src/space/numerics/validation-records.js';

const referenceDir = new URL('../reference/', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyMatrixPins(indexBytes) {
  if (sha256(indexBytes) !== MATRIX_PINS.indexSha256) throw new Error(`matrix index SHA-256 ${sha256(indexBytes)} is not the pinned ${MATRIX_PINS.indexSha256}`);
  const index = JSON.parse(indexBytes);
  if (index.matrixSha256 !== MATRIX_PINS.matrixSha256) throw new Error('logical matrix SHA-256 differs from the pin');
  if (index.matrixTemplate?.generatorSha256 !== MATRIX_PINS.generatorSha256) throw new Error('generator SHA-256 differs from the pin');
  if (!isDeepStrictEqual(index.matrixTemplate.referenceSha256, { ...MATRIX_PINS.referenceSha256 })) throw new Error('reference SHA-256 map differs from the pin');
  return index;
}

export function loadPinnedPointStrata({ kinds = POINT_STRATUM_KINDS } = {}) {
  if (!Array.isArray(kinds) || kinds.some(kind => !POINT_STRATUM_KINDS.includes(kind))) throw new Error('B08 loads point strata only');
  const index = verifyMatrixPins(readFileSync(new URL('space-matrix.json', referenceDir)));
  const view = assembleMatrix(index, path => readFileSync(new URL(path, referenceDir)), { kinds: [...kinds] });
  if (view.complete !== false) throw new Error('a point-strata load must be a partial view');
  return { ...view, indexSha256: MATRIX_PINS.indexSha256, tolerances: index.matrixTemplate.tolerances,
    shards: index.shards.filter(shard => kinds.includes(shard.kind)).map(({ path, kind, byteLength, sha256: hash }) => ({ path, kind, byteLength, sha256: hash })) };
}

const STATUS = ['escaped', 'not escaped within iteration budget', 'numerical failure'];
function allowance(tolerance, expected) {
  if (tolerance.kind === 'absolute') return tolerance.value;
  if (tolerance.kind === 'relative') return Math.max(tolerance.floor ?? 0, tolerance.value * Math.abs(expected));
  throw new RangeError(`unsupported point tolerance ${tolerance.kind}`);
}
const log2Derivative = d => Math.log2(d.mantissa) + d.exponent;

export function comparePointStratum(stratum, results, tolerances) {
  const compared = {}, worst = {}, failures = [];
  let numericalFailures = 0, diagnosticDisagreements = 0, valid = Array.isArray(results) && results.length === stratum.cases.length;
  const fail = (id, quantity, expected, actual) => failures.push({ id, quantity, expected, actual });
  const count = quantity => { compared[quantity] = (compared[quantity] ?? 0) + 1; };
  const exact = (id, quantity, expected, actual) => { count(quantity); if (!Object.is(expected, actual) && expected !== actual) fail(id, quantity, expected, actual); };
  const near = (id, quantity, toleranceName, expected, actual) => {
    count(quantity);
    if (typeof actual !== 'number' || !Number.isFinite(actual)) return fail(id, quantity, expected, actual);
    const allow = allowance(tolerances[toleranceName], expected), ratio = Math.abs(actual - expected) / allow;
    worst[quantity] = Math.max(worst[quantity] ?? 0, ratio);
    if (!(ratio <= 1)) fail(id, quantity, expected, actual);
  };
  stratum.cases.forEach((c, i) => {
    const e = c.expected, a = results?.[i];
    if (!a || !STATUS.includes(a.status)) { valid = false; return fail(c.id, 'result', e.status, a?.status ?? 'absent'); }
    if (a.status === 'numerical failure' && e.status !== 'numerical failure') { numericalFailures++; return fail(c.id, 'numerical failure', e.status, a.status); }
    if (Array.isArray(c.eligibleQuantities)) {
      const eligible = new Set(c.eligibleQuantities);
      if (!eligible.has('status') && a.status !== e.status) diagnosticDisagreements++;
      else if (!eligible.has('escapeIndex') && a.escapeIndex !== e.escapeIndex) diagnosticDisagreements++;
      for (const quantity of c.eligibleQuantities) {
        if (quantity === 'status') exact(c.id, quantity, e.status, a.status);
        else if (quantity === 'escapeIndex') exact(c.id, quantity, e.escapeIndex, a.escapeIndex);
        else if (/^component[0-3]$/.test(quantity)) near(c.id, quantity, quantity, e.value[Number(quantity.at(-1))], a.value?.[Number(quantity.at(-1))]);
        else if (quantity === 'logEscapeRadius') near(c.id, quantity, quantity, e.logEscapeRadius, a.logEscapeRadius);
        else if (quantity === 'log2DE') near(c.id, quantity, quantity, e.log2DE, a.estimateAvailable ? a.log2DE : null);
        else throw new RangeError(`unknown eligible quantity ${quantity}`);
      }
      if (eligible.has('status') && eligible.has('escapeIndex') && e.status === 'escaped') exact(c.id, 'estimateAvailable', e.estimateAvailable, a.estimateAvailable);
      return;
    }
    // The derivative-only adversarial case (D = 8D + 1 from zero): the state alone.
    if (e.status === undefined && e.derivative) {
      exact(c.id, 'derivativeZero', e.derivative.zero, a.derivative?.zero);
      exact(c.id, 'derivativeExponent', e.derivative.exponent, a.derivative?.exponent);
      if (a.derivative && !a.derivative.zero) near(c.id, 'log2Derivative', 'log2DE', log2Derivative(e.derivative), log2Derivative(a.derivative));
      if (e.exceedsF32ScalarRange !== undefined) exact(c.id, 'exceedsF32ScalarRange', e.exceedsF32ScalarRange, (a.derivative?.exponent ?? 0) > 127);
      return;
    }
    // Semantic case: never screened, compared on every quantity it carries.
    exact(c.id, 'status', e.status, a.status);
    if (e.admission !== undefined) exact(c.id, 'admission', e.admission, a.admission);
    if (e.status === 'numerical failure') return;
    exact(c.id, 'escapeIndex', e.escapeIndex, a.escapeIndex);
    exact(c.id, 'estimateAvailable', e.estimateAvailable, a.estimateAvailable);
    if (Array.isArray(e.value)) {
      e.value.forEach((v, k) => near(c.id, `component${k}`, `component${k}`, v, a.value?.[k]));
      if (e.value.length === 3 && e.value[0] === 0 && e.value[1] === 0) { exact(c.id, 'azimuth', 0, a.value?.[0]); exact(c.id, 'azimuth', 0, a.value?.[1]); }
    }
    if (e.logEscapeRadius !== null && e.logEscapeRadius !== undefined) near(c.id, 'logEscapeRadius', 'logEscapeRadius', e.logEscapeRadius, a.logEscapeRadius);
    if (e.log2DE !== null && e.log2DE !== undefined) near(c.id, 'log2DE', 'log2DE', e.log2DE, a.estimateAvailable ? a.log2DE : null);
    if (e.derivative) {
      exact(c.id, 'derivativeZero', e.derivative.zero, a.derivative?.zero);
      if (!e.derivative.zero && a.derivative && !a.derivative.zero) near(c.id, 'log2Derivative', 'log2DE', log2Derivative(e.derivative), log2Derivative(a.derivative));
    }
  });
  const belowFloor = Object.entries(stratum.floor ?? {}).filter(([key, floor]) => !((stratum.eligible?.[key] ?? 0) >= floor)).map(([key]) => key);
  const conclusive = stratum.state === 'frozen' && belowFloor.length === 0;
  const passed = conclusive && valid && failures.length === 0 && numericalFailures === 0;
  return { id: stratum.id, kind: stratum.kind, role: stratum.role, state: !conclusive ? 'inconclusive' : passed ? 'passed' : 'failed', passed,
    eligible: stratum.eligible, floor: stratum.floor, belowFloor, cases: stratum.cases.length, compared, worst, failureCount: failures.length,
    failures: failures.slice(0, 20), numericalFailures, diagnosticDisagreements, excluded: stratum.excluded?.length ?? 0, valid };
}

// Binary64 references for the bulb power map P_p(c) (spec §11.1), used by the fix-round-1 probes.
// bulbMapTrig is the spec text (θ, φ from atan2); bulbMapComplex is the algebraically identical
// (z + iρ)^p, ((x + iy)/ρ)^p form, scaled by max(|x|, |y|) so tiny transverse components survive.
export function bulbMapTrig([x, y, z], p) {
  const r = Math.hypot(x, y, z), rho = Math.hypot(x, y);
  if (r === 0) return [0, 0, 0];
  if (rho === 0) return [0, 0, z ** p];
  const theta = Math.atan2(rho, z), phi = Math.atan2(y, x), rp = r ** p;
  return [rp * Math.sin(p * theta) * Math.cos(p * phi), rp * Math.sin(p * theta) * Math.sin(p * phi), rp * Math.cos(p * theta)];
}
export function bulbMapComplex([x, y, z], p) {
  if (x === 0 && y === 0) return [0, 0, z ** p];
  const s = Math.max(Math.abs(x), Math.abs(y)), xs = x / s, ys = y / s, rhoS = Math.hypot(xs, ys), rho = s * rhoS;
  const mul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  let w = [1, 0], q = [1, 0];
  for (let k = 0; k < p; k++) { w = mul(w, [z, rho]); q = mul(q, [xs / rhoS, ys / rhoS]); }
  return [w[1] * q[0], w[1] * q[1], w[0]];
}
