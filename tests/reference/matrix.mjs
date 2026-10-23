// Deterministic CPU-only fixture preparation. No wall clock, randomness or product imports.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { nextUp, nextDown, bits, derivativeUpdate } from './f32.js';
import { bulbOrbit } from './bulb.js';
import { quaternionOrbit, quaternionBound, admitsRequestedComponent } from './quaternion.js';
import { sphereInterval, boxInterval, ROTATED_BOX, entryNearEdge, sphereDistance, boxDistance, expandedSphereEntry, expandedBoxEntry } from './analytic.js';
import { mengerIntervals, expandedMengerEntry } from './menger.js';
import { overviewCamera, yawCamera, rayFor, normalize, lookCamera } from './camera.js';
import { traceRay, traceModel, modelRadius } from './trace.js';
import { prepareAnchor, anchorSeed, detailCamera } from './anchors.mjs';

const directory = new URL('./', import.meta.url);
export const BUDGETS = [64, 128, 256, 512];
export const KAPPAS = [0, 0.5, -0.5, 2, -2, 4, -4];
export const PARAMETERS = [[-0.2, 0.8, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0], [-0.2, 0.8, 0.15, -0.1], [0.25, -0.5, 0.5, -0.25], [-0.4, 0.2, -0.3, 0.6]];
const referenceNames = ['f32.js', 'complex.js', 'quaternion.js', 'bulb.js', 'analytic.js', 'menger.js', 'camera.js', 'trace.js', 'anchors.mjs', 'matrix.mjs'];
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export function serialize(value) {
  return JSON.stringify(value, (key, v) => { if (typeof v === 'number' && !Number.isFinite(v)) throw new RangeError(`nonfinite fixture value: ${key}`); return v; }) + '\n';
}
const read = name => readFileSync(new URL(name, directory));
export { overview as overviewStratum, pointAdversarial, rayAdversarial };
// Shard bytes are canonical JSON arrays; the index preserves the original logical order.
function shardKey(row) { return row.kind === 'detail-ladder' ? `detail-${row.parameters.anchorId.split('/')[0]}` : row.kind; }
export function createMatrixIndex(matrix) {
  const groups = new Map(), ids = new Set();
  for (const row of matrix.strata) {
    if (ids.has(row.id)) throw new Error(`duplicate stratum ID: ${row.id}`);
    ids.add(row.id);
    const key = shardKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const shards = new Map(), descriptors = [];
  for (const [key, rows] of groups) {
    const path = `space-matrix/${key}.json`, bytes = serialize(rows);
    shards.set(path, bytes);
    descriptors.push({ path, kind: rows[0].kind, ...(rows[0].kind === 'detail-ladder' ? { model: key.slice(7) } : {}),
      byteLength: Buffer.byteLength(bytes), sha256: sha256(bytes), stratumIds: rows.map(row => row.id) });
  }
  return { index: { schema: 'atlas.space-matrix-index', version: 1,
    matrixTemplate: { ...matrix, strata: [] }, stratumOrder: matrix.strata.map(row => row.id), shards: descriptors,
    matrixSha256: sha256(serialize(matrix)) }, shards };
}
export function assembleMatrix(index, readShard, { kinds } = {}) {
  if (index?.schema !== 'atlas.space-matrix-index' || index.version !== 1 ||
      index.matrixTemplate?.schema !== 'atlas.space-matrix' || index.matrixTemplate.version !== 1 ||
      !Array.isArray(index.matrixTemplate.strata) || index.matrixTemplate.strata.length ||
      !Array.isArray(index.stratumOrder) || !Array.isArray(index.shards) || !/^[a-f0-9]{64}$/.test(index.matrixSha256)) throw new Error('invalid matrix index');
  const declared = new Set(), paths = new Set();
  for (const shard of index.shards) {
    if (!/^space-matrix\/[a-z0-9-]+\.json$/.test(shard.path) || paths.has(shard.path) ||
        !Number.isSafeInteger(shard.byteLength) || shard.byteLength < 1 || !/^[a-f0-9]{64}$/.test(shard.sha256) ||
        !Array.isArray(shard.stratumIds)) throw new Error('invalid shard descriptor');
    paths.add(shard.path);
    for (const id of shard.stratumIds) {
      if (typeof id !== 'string' || declared.has(id)) throw new Error('duplicate or invalid stratum IDs');
      declared.add(id);
    }
  }
  const order = new Set(index.stratumOrder);
  if (order.size !== index.stratumOrder.length || order.size !== declared.size || [...order].some(id => !declared.has(id))) throw new Error('matrix stratum IDs differ');
  if (kinds && (!Array.isArray(kinds) || kinds.some(kind => !index.shards.some(s => s.kind === kind)))) throw new Error('unknown shard kind');
  const selected = index.shards.filter(s => !kinds || kinds.includes(s.kind)), rows = new Map();
  for (const shard of selected) {
    const bytes = readShard(shard.path);
    if (bytes === undefined || bytes === null || Buffer.byteLength(bytes) !== shard.byteLength) throw new Error(`shard byte length mismatch: ${shard.path}`);
    if (sha256(bytes) !== shard.sha256) throw new Error(`shard hash mismatch: ${shard.path}`);
    const values = JSON.parse(bytes);
    if (!Array.isArray(values) || serialize(values.map(row => row.id)) !== serialize(shard.stratumIds) ||
        values.some(row => row.kind !== shard.kind || `space-matrix/${shardKey(row)}.json` !== shard.path)) throw new Error(`shard IDs or grouping mismatch: ${shard.path}`);
    for (const row of values) rows.set(row.id, row);
  }
  const strata = index.stratumOrder.filter(id => rows.has(id)).map(id => rows.get(id));
  if (selected.length !== index.shards.length) return { schema: 'atlas.space-matrix-view', version: 1, complete: false,
    matrixSha256: index.matrixSha256, metadata: index.matrixTemplate, strata };
  const matrix = { ...index.matrixTemplate, strata };
  if (sha256(serialize(matrix)) !== index.matrixSha256) throw new Error('assembled matrix hash mismatch');
  return matrix;
}
export function loadMatrix(options = {}) {
  return assembleMatrix(JSON.parse(read('space-matrix.json')), read, options);
}
export function compareOverview(row, results) {
  if (row.kind !== 'fractal-overview' || row.profile !== 'surface-v1') throw new RangeError('overview surface-v1 row required');
  const profile = row.inputs.profile, alpha = 2 * Math.tan((profile.verticalFovDegrees ?? 60) * Math.PI / 360) / profile.height;
  let eligible = 0, hits = 0, disagreements = 0, goodDepths = 0, numericalFailures = 0;
  let valid = Array.isArray(results) && results.length === row.cases.length;
  for (const [i, c] of row.cases.entries()) {
    const actual = results?.[i];
    if (actual?.status === 'numerical failure' || c.expected.status === 'numerical failure' || c.reference?.status === 'numerical failure') numericalFailures++;
    if (!['approximate hit', 'miss', 'unresolved', 'numerical failure'].includes(actual?.status) ||
        (actual.status === 'approximate hit' && (!Number.isFinite(actual.t) || actual.t < 0))) valid = false;
    if (!c.referenceEligible) continue;
    eligible++; disagreements += Number(actual?.status !== c.expected.status);
    if (c.expected.status === 'approximate hit' && c.expected.t > 0) {
      hits++;
      const tau = Math.max(1e-6, 0.5 * alpha * c.expected.t);
      goodDepths += Number(actual?.status === 'approximate hit' && Number.isFinite(actual.t) && actual.t > 0 && Math.abs(actual.t - c.expected.t) <= 2 * tau);
    }
  }
  const statusPassed = eligible > 0 && 20 * disagreements <= eligible;
  const depthPassed = !row.surfaceBearing || (hits > 0 && 20 * goodDepths >= 19 * hits);
  return { passed: valid && numericalFailures === 0 && statusPassed && depthPassed, eligible, hits, disagreements,
    goodDepths, numericalFailures, statusPassed, depthPassed, depthRequired: row.surfaceBearing };
}
const tolerance = (kind, value, section, floor) => ({ kind, value, ...(floor === undefined ? {} : { floor }), analysisRef: `tolerance-analysis.md#${section}` });
export const TOLERANCES = {
  status: tolerance('exact', 0, 'status'), escapeIndex: tolerance('exact', 0, 'status'),
  component0: tolerance('relative', 1e-4, 'components', 1e-6), component1: tolerance('relative', 1e-4, 'components', 1e-6),
  component2: tolerance('relative', 1e-4, 'components', 1e-6), component3: tolerance('relative', 1e-4, 'components', 1e-6),
  logEscapeRadius: tolerance('relative', 1e-4, 'radius'), log2DE: tolerance('absolute', 2 ** -10, 'distance'),
  depth: tolerance('relative', 1e-3, 'depth', 1e-6),
  // Rev 4.8: surface-v1 analytic depth lies in [max(0, t-) - delta, t* + delta], delta the `depth` allowance.
  analyticEnvelope: tolerance('surface-v1-expanded-object-envelope', 1e-3, 'depth', 1e-6),
  overviewStatus: tolerance('absolute-fraction', 0.05, 'overview'), overviewDepth: tolerance('surface-v1-tau-multiple', 2, 'overview'),
  usabilityDistribution: tolerance('absolute-fraction', 0.05, 'coverage'),
};
const allowance = (quantity, value) => { const t = TOLERANCES[quantity]; return t.kind === 'relative' ? Math.max(t.floor ?? 0, t.value * Math.abs(value)) : t.value; };
// Rev 4.8 (user-approved 2026-10-21, post-discovery): the two mandatory analytic depth checks and the
// profiles they run under. analytic-inspection-v1 scales the whole surface-v1 tolerance, floor included.
const ANALYTIC_ALPHA = 2 * Math.tan(Math.PI / 6) / 720;
export const PROFILES = Object.freeze({
  'surface-v1': { tolerance: 'max(1e-6, 0.5*alpha*t)', toleranceFloor: 1e-6, toleranceFactor: 0.5, alpha: '2*tan(verticalFov/2)/height', stepMultiplier: 0.9 },
  'analytic-inspection-v1': { derivedFrom: 'surface-v1', toleranceScale: 0.1, tolerance: '0.1*max(1e-6, 0.5*alpha*t) = max(1e-7, 0.05*alpha*t)',
    toleranceFloor: 1e-7, toleranceFactor: 0.05, alpha: '2*tan(verticalFov/2)/height', stepMultiplier: 0.9, caps: 'unchanged from surface-v1',
    sampling: { height: 720, verticalFovDegrees: 60, maxSteps: 512, rays: 'the unchanged P1 analytic reference rays, exclusions and eligibility' },
    use: 'analytic ray depth inspection only; never an ordinary render profile', amendment: '2026-10-21 rev 4.8' },
});
export const ANALYTIC_CHECKS = Object.freeze([
  { id: 'surface-envelope', profile: 'surface-v1', quantity: 'analyticEnvelope', criterion: 'max(0, tMinus) - delta <= t <= tStar + delta',
    rho: 'tau_surface(tStar) = max(1e-6, 0.5*alpha*tStar)', delta: 'max(1e-6, 1e-3*|tStar|)',
    tMinus: 'first forward intersection with the object expanded outward by rho: sphere radius 1 + rho (quadratic); box half-extents + rho (local slabs); union of Menger leaves with half-extents + rho (local slabs)' },
  { id: 'inspection-relative', profile: 'analytic-inspection-v1', quantity: 'depth', criterion: '|t - tStar| <= max(1e-6, 1e-3*|tStar|)' },
]);
export function matrixHeader({ seed = 1 } = {}) {
  if (seed !== 1) throw new RangeError('P1 has one frozen seed: 1 (enumeration only)');
  return { schema: 'atlas.space-matrix', version: 1, frozenAt: '2026-10-21', seed,
    generatorSha256: sha256(read('matrix.mjs')), referenceSha256: Object.fromEntries(referenceNames.map(name => [name, sha256(read(name))])),
    analysis: { path: 'tests/reference/tolerance-analysis.md', sha256: sha256(read('tolerance-analysis.md')) },
    tolerances: TOLERANCES, profiles: PROFILES,
    rules: {
      analytic: { checks: ANALYTIC_CHECKS, required: 'both checks, on every analytic stratum', sampling: { height: 720, verticalFovDegrees: 60, maxSteps: 512, stepMultiplier: 0.9 },
        status: 'exact on every case under both profiles', depthDomain: 'reference-eligible positive hits (unchanged)', numericalFailureMax: 0,
        envelopeFixture: 'case.envelope = {rho, delta, tMinus} on every eligible positive hit', amendment: 'user-approved 2026-10-21, rev 4.8, post-discovery' }, arithmeticInputs: 'effective-binary32', continuousFloor: 'escaped and all continuous quantities available and quarter-tolerance stable',
      rayInputs: 'camera/pixel strata inherit stratum.inputs; rayFor(stratum.camera, ...case.pixel, 1280, 720) passes through (i + 0.5, j + 0.5); case.inputs contains overrides; absent expected reason/subreason means null; steps are not compared',
      screen: 'each relevant effective binary32 input individually nextDown/nextUp, including all four C and all four q0 components',
      overview: { width: 1280, height: 720, cells: [32, 32], pixels: { first: [376, 96], step: [17, 17], last: [903, 623] },
        projectedHalfExtent: 272.13442056664366, cameraDistanceRadii: 2.5, verticalFovDegrees: 60, maxIterations: 128, maxSteps: 512,
        referenceToleranceScale: 0.1, eligibility: 'same resolved status; positive hits have t > 0; depth difference recorded, never screened',
        surfaceBearing: 'bulbs and quaternion |kappa| <= 0.5 except C = (2,0,0,0); no hit floor does not assert an empty slice',
        referenceFloor: 820, positiveHitFloor: 64, statusDisagreementMax: 0.05, depthToleranceTauMultiple: 2,
        depthSuccessFractionMin: 0.95, depthRequired: 'surface-bearing only', missingHit: 'failed depth comparison', numericalFailureMax: 0 },
      bulbGenericFloors: { default: 410, power7: 400, candidates: 512, amendmentApproved: '2026-10-21' },
      referenceConvergence: 'overview: same resolved status only; detail ladder: same resolved status and relative positive-hit depth delta <= 1e-3',
      ladder: { pixels: { first: [624, 344], last: [655, 375] }, width: 1280, height: 720, maxIterations: 128, maxSteps: 512, factors: [0.005, 0.0005], distances: Array.from({ length: 8 }, (_, i) => 10 ** (-i - 1)),
        statusDisagreementMax: 0.05, largeDepthError: 0.01, largeDepthErrorFractionMax: 0.05, anchorDeltaFractionMax: 0.001 },
      anchorSelection: 'central seed ray at overview azimuth and opposite azimuth; no adaptive replacement',
      qualification: 'CPU preparation only; mandatory inconclusive blocks GPU qualification; no product validation is registered' },
  };
}
export function finalizeStratum(stratum) {
  const meets = Object.entries(stratum.floor).every(([key, min]) => Number.isFinite(stratum.eligible[key]) && stratum.eligible[key] >= min);
  return { ...stratum, state: meets && stratum.assertionsPassed !== false ? 'frozen' : 'inconclusive' };
}
export function matrixIsQualifiable(matrix) {
  return matrix?.complete !== false && Array.isArray(matrix?.strata) && matrix.strata.every(s => s.role === 'diagnostic' || (s.state === 'frozen' && finalizeStratum(s).state === 'frozen'));
}
function stratum(id, kind, parameters, cases, floor, eligible, excluded = [], extra = {}) {
  return compactRayStratum(finalizeStratum({ id, role: 'mandatory', kind, profile: 'surface-v1', parameters, cases, floor, eligible, excluded, ...extra }));
}
function compactRayStratum(row) {
  if (!['fractal-overview', 'detail-ladder'].includes(row.kind) || row.inputs) return row;
  const { ray, ...inputs } = row.cases[0].inputs;
  const comparison = result => Object.fromEntries(Object.entries(result).filter(([key, value]) => key !== 'steps' && value !== null));
  return { ...row, inputs, cases: row.cases.map(c => ({ ...c, inputs: {}, expected: comparison(c.expected), reference: comparison(c.reference),
    ...(c.requestedExpected ? { requestedExpected: comparison(c.requestedExpected) } : {}) })) };
}
function pointExpected(result) {
  return { status: result.status, escapeIndex: result.escapeIndex, value: result.value ?? null,
    logEscapeRadius: result.logEscapeRadius ?? null, log2DE: result.log2DE ?? null, estimateAvailable: result.estimateAvailable ?? false,
    derivative: result.derivative ?? null };
}
function quantities(result, quaternion) {
  const resultQuantities = { status: result.status, escapeIndex: result.escapeIndex };
  if (result.status === 'escaped') {
    if (quaternion) for (let i = 0; i < 4; i++) resultQuantities[`component${i}`] = result.value[i];
    resultQuantities.logEscapeRadius = result.logEscapeRadius;
    if (result.estimateAvailable) resultQuantities.log2DE = result.log2DE;
  }
  return resultQuantities;
}
function screen(inputs, evaluate, quaternion) {
  const base = evaluate(inputs), q = quantities(base, quaternion), failures = new Map();
  for (let index = 0; index < inputs.length; index++) for (const [direction, adjacent] of [['down', nextDown], ['up', nextUp]]) {
    const changed = [...inputs]; changed[index] = adjacent(inputs[index]);
    const neighbour = evaluate(changed), nq = quantities(neighbour, quaternion);
    if (base.status !== neighbour.status || base.escapeIndex !== neighbour.escapeIndex) {
      for (const key of Object.keys(q)) if (!failures.has(key)) failures.set(key, `input-${index}-${direction}: status/escape-index changed`);
    }
    for (const [key, value] of Object.entries(q)) {
      if (key === 'status' || key === 'escapeIndex') continue;
      if (nq[key] === undefined || Math.abs(value - nq[key]) > allowance(key, value) / 4) {
        if (!failures.has(key)) failures.set(key, `input-${index}-${direction}: quarter-tolerance exceeded or estimate unavailable`);
      }
    }
  }
  const continuous = base.status === 'escaped' && base.estimateAvailable && failures.size === 0;
  return { base, q, failures, continuous };
}
function grid(nx, ny, nz, lo, hi) {
  const values = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) values.push([i, j, k].map((v, axis) => lo + (hi - lo) * (v + 0.5) / [nx, ny, nz][axis]));
  return values;
}
function generic(id, model, parameters, cap, starts) {
  const quaternion = model === 'quaternion-julia', empty = quaternion && Math.abs(parameters.kappa) > quaternionBound(parameters.C);
  const eligible = { continuous: 0, nonInitial: 0, status: 0, escapeIndex: 0, logEscapeRadius: 0, log2DE: 0, semantic: 0 };
  if (quaternion) for (let i = 0; i < 4; i++) eligible[`component${i}`] = 0;
  const denominators = Object.fromEntries(Object.keys(eligible).map(k => [k, 0]));
  const excluded = [], cases = [];
  for (let index = 0; index < starts.length; index++) {
    const requested = starts[index], p = requested.map(Math.fround), caseId = `${id}/${index}`;
    const inputs = quaternion ? [...p, parameters.kappa, ...parameters.C] : p;
    const evaluate = values => quaternion ? quaternionOrbit(values.slice(0, 4), values.slice(4), cap, { precision: 'f64' }) : bulbOrbit(values, parameters.power, cap, { precision: 'f64' });
    if (empty) {
      const base = evaluate(inputs);
      cases.push({ id: caseId, inputs: { requested, effective: p, effectiveBits: p.map(bits), parameters, cap }, expected: { ...pointExpected(base), emptySlice: true, rayStatus: 'miss' } });
      eligible.semantic += Number(base.status === 'escaped' && base.escapeIndex === 0); denominators.semantic++;
      continue;
    }
    const { base, q, failures, continuous } = screen(inputs, evaluate, quaternion);
    for (const key of Object.keys(q)) { denominators[key]++; if (!failures.has(key)) eligible[key]++; }
    denominators.continuous++; denominators.nonInitial += Number(base.status === 'escaped' && base.escapeIndex > 0);
    if (continuous) { eligible.continuous++; if (base.escapeIndex > 0) eligible.nonInitial++; }
    for (const [quantity, reason] of failures) excluded.push({ id: caseId, reason, quantity });
    if (!base.estimateAvailable) excluded.push({ id: caseId, reason: base.status === 'escaped' ? 'estimate-unavailable' : 'no-escape-continuous-quantities', quantity: 'continuous' });
    cases.push({ id: caseId, inputs: { requested, effective: p, effectiveBits: p.map(bits), parameters, cap }, expected: pointExpected(base),
      eligibleQuantities: Object.keys(q).filter(key => !failures.has(key)), continuousEligible: continuous });
  }
  const floor = empty ? { semantic: 256, continuous: 0 } : { continuous: quaternion ? 205 : parameters.power === 7 ? 400 : 410, ...(quaternion && Math.abs(parameters.kappa) <= 0.5 ? { nonInitial: 64 } : {}) };
  return stratum(id, quaternion ? 'quaternion-generic' : 'bulb-generic', { ...parameters, cap }, cases, floor, eligible, excluded, { denominators });
}
function boundaryParameters() {
  const corners = Array.from({ length: 16 }, (_, mask) => Array.from({ length: 4 }, (_, i) => mask & (1 << i) ? 4 : -4));
  const faces = Array.from({ length: 8 }, (_, i) => Array.from({ length: 4 }, (_, j) => Math.floor(i / 2) === j ? (i % 2 ? 4 : -4) : 0));
  return [...corners, ...faces];
}
const boundaryStarts = [[0, 0, 0], [0.25, 0, 0], [-0.25, 0, 0], [0, 0.25, 0], [0, -0.25, 0], [0, 0, 0.25], [0, 0, -0.25], [0.25, -0.5, 0.75]];
function boundary(id, C, kappa, cap) {
  const bound = quaternionBound(C);
  const cases = boundaryStarts.map((point, index) => ({ id: `${id}/${index}`, inputs: { effective: point, parameters: { C, kappa }, cap },
    expected: { ...pointExpected(quaternionOrbit([...point, kappa], C, cap, { bound, precision: 'f64' })), admitted: true, bound, emptySlice: Math.abs(kappa) > bound } }));
  const raw = Math.max(2, (1 + Math.sqrt(1 + 4 * Math.hypot(...C))) / 2);
  const passed = bound >= raw && cases.every(c => c.expected.status !== 'numerical failure' && (!c.expected.emptySlice || c.expected.escapeIndex === 0));
  return stratum(id, 'quaternion-boundary', { C, kappa, cap }, cases, { semantic: 8 }, { semantic: passed ? 8 : 0 }, [], { assertionsPassed: passed,
    rejectionCases: Array.from({ length: 10 }, (_, i) => ({ field: i < 8 ? `C.${Math.floor(i / 2)}` : 'kappa', requested: `${i % 2 ? '' : '-'}4.000000000000000000000000000000000000000000000000000000000000001`, expected: admitsRequestedComponent(`${i % 2 ? '' : '-'}4.000000000000000000000000000000000000000000000000000000000000001`) ? 'admitted' : 'out-of-range' })) });
}
function pointAdversarial() {
  const cases = [];
  const q = (id, q0, C, cap = 128, assertions = {}) => cases.push({ id, inputs: { model: 'quaternion-julia', q0, C, cap }, expected: { ...pointExpected(quaternionOrbit(q0, C, cap)), ...assertions } });
  const b = (id, p, power = 8, cap = 128) => cases.push({ id, inputs: { model: 'mandelbulb', p, power, cap }, expected: pointExpected(bulbOrbit(p, power, cap)) });
  q('zero-sensitivity', [0, 0, 0, 0], [2, 0, 0, 0], 128);
  let derivative = { zero: true, mantissa: 0, exponent: 0 }; for (let i = 0; i < 44; i++) derivative = derivativeUpdate(derivative, 8, 1, 'f32');
  cases.push({ id: 'derivative-update-44', inputs: { recurrence: 'D=8D+1', initial: 0, updates: 44 }, expected: { derivative, exceedsF32ScalarRange: true } });
  q('initialization-escape', [3, 0, 0, 0], [0, 0, 0, 0]);
  q('strict-empty-positive', [0, 0, 0, 4], [0, 0, 0, 0], 128, { emptySlice: true, rayStatus: 'miss' });
  q('strict-empty-negative', [0, 0, 0, -4], [0, 0, 0, 0], 128, { emptySlice: true, rayStatus: 'miss' });
  q('equal-bound-not-empty', [0, 0, 0, 2], [0, 0, 0, 0], 128, { emptySlice: false });
  q('four-component-positive', [0.25, 0.5, 0.125, -0.25], [-0.2, 0.8, 0.15, -0.1], 1);
  q('four-component-negative', [-0.75, 0.25, -0.5, 0.125], [0.25, -0.5, 0.5, -0.25], 1);
  q('j-only-parameter', [0.5, 0, 0.5, 0], [0, 0, 0.5, 0], 1);
  q('k-only-parameter', [0.5, 0, 0, 0.5], [0, 0, 0, 0.5], 1);
  b('bulb-origin', [0, 0, 0]); b('bulb-axis-positive', [0, 0, 1]); b('bulb-axis-negative', [0, 0, -1]);
  q('quaternion-fixed-origin', [0, 0, 0, 0], [0, 0, 0, 0]);
  q('bound-corner', [0.25, -0.5, 0.75, 0.5], [4, -4, 4, -4]);
  for (const [id, model, token] of [['invalid-bulb-coordinate', 'mandelbulb', 'NaN'], ['invalid-quaternion-coordinate', 'quaternion-julia', 'Infinity'],
    ['invalid-bulb-power', 'mandelbulb', 9], ['invalid-quaternion-parameter', 'quaternion-julia', '4.0000000000000000001'], ['invalid-iteration-budget', 'mandelbulb', 0]]) {
    cases.push({ id, inputs: { model, invalidValue: token, interpretation: id }, expected: { status: 'numerical failure', admission: 'reject' } });
  }
  return stratum('adversarial/points', 'adversarial-point', {}, cases, { semantic: 20 }, { semantic: cases.length });
}
function rayAdversarial() {
  const cases = [];
  const add = (id, model, effective, ray, profile = {}) => cases.push({ id, inputs: { model, effective, ray, profile }, expected: traceModel(model, effective, ray, { name: 'surface-v1', height: 720, ...profile }) });
  add('sphere-interior', 'sphere', {}, { origin: [0, 0, 0], direction: [1, 0, 0] });
  add('sphere-boundary', 'sphere', {}, { origin: [1, 0, 0], direction: [1, 0, 0] });
  add('box-interior', 'box', {}, { origin: [0, 0, 0], direction: [1, 0, 0] });
  add('sphere-origin-through', 'sphere', {}, { origin: [-3, 0, 0], direction: [1, 0, 0] });
  add('bulb-polar-axis', 'mandelbulb', { power: 8 }, { origin: [0, 0, 3], direction: [0, 0, -1] });
  add('bulb-origin-through', 'mandelbulb', { power: 8 }, { origin: [-3, 0, 0], direction: [1, 0, 0] });
  add('sphere-grazing', 'sphere', {}, { origin: [1, -4, 0], direction: [0, 1, 0] });
  add('quaternion-inside-start', 'quaternion-julia', { C: [0, 0, 0, 0], kappa: 0 }, { origin: [0, 0, 0], direction: [1, 0, 0] });
  add('ray-step-budget', 'sphere', {}, { origin: [-3, 0, 0], direction: [1, 0, 0] }, { maxSteps: 1 });
  add('invalid-ray-direction', 'sphere', {}, { origin: [0, 0, 0], direction: [0, 0, 0] });
  for (const coordinate of [false, true]) {
    const ray = { origin: [coordinate ? 1 : 0, 0, 0], direction: [1, 0, 0] }, interval = { enter: coordinate ? 2 ** -26 : 1, exit: 2 };
    const distance = coordinate ? 2 ** -26 / 0.9 : 2 ** -30, profile = { precision: 'f32', tolerance: 0, maxSteps: 512 };
    cases.push({ id: coordinate ? 'stagnation-field-coordinate' : 'stagnation-ray-parameter', inputs: { ray, interval, profile, constantExteriorDistance: distance },
      expected: traceRay(ray, profile, () => ({ distance, applicability: 'exterior' }), interval) });
  }
  return stratum('adversarial/rays', 'adversarial-ray', {}, cases, { semantic: 12 }, { semantic: cases.length });
}
function analyticRays(kind) {
  const cases = [], excluded = []; let positiveHits = 0;
  const nx = kind === 'sphere' ? 25 : kind === 'box' ? 31 : 41, ny = kind === 'sphere' ? 25 : kind === 'box' ? 21 : 41;
  const depth = kind === 'menger-1' ? 1 : 2;
  const expandedEntry = (ray, rho) => kind === 'sphere' ? expandedSphereEntry(ray, rho) : kind === 'box' ? expandedBoxEntry(ray, rho) : expandedMengerEntry(ray, depth, rho);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = kind === 'box' ? -1.5 + i / 10 : -1.2 + 2.4 * i / (nx - 1), z = kind === 'box' ? -0.5 + j / 20 : -1.2 + 2.4 * j / (ny - 1);
    const ray = { origin: [x, -4, z], direction: kind.startsWith('menger') ? normalize([0.3, 1, 0.2]) : [0, 1, 0] };
    let interval, edge;
    if (kind === 'sphere') { interval = sphereInterval(ray, 1); edge = Math.abs(Math.hypot(x, z) - 1) < 0.02; }
    else if (kind === 'box') { interval = boxInterval(ray); edge = entryNearEdge(ray, interval, ROTATED_BOX); }
    else { interval = mengerIntervals(ray, depth)[0] ?? null; edge = interval ? entryNearEdge(ray, interval, interval.box) : false; }
    const hit = interval && interval.exit >= Math.max(0, interval.enter), t = hit ? Math.max(0, interval.enter) : null, id = `${kind}/${i}/${j}`;
    if (edge) excluded.push({ id, reason: kind === 'sphere' ? 'A.4 tangent margin 0.02' : 'A.4 face-edge margin 0.001', quantity: 'depth' });
    else if (hit && t > 0) positiveHits++;
    const c = { id, inputs: { ray, model: kind.startsWith('menger') ? 'menger' : kind, effective: kind.startsWith('menger') ? { depth } : {} },
      expected: { status: hit ? 'approximate hit' : 'miss', t }, referenceEligible: !edge };
    if (!edge && hit && t > 0) {
      // Rev 4.8 surface-v1 envelope: rho = tau_surface(t*), delta = the depth allowance, t- from the expansion.
      const rho = Math.max(1e-6, 0.5 * ANALYTIC_ALPHA * t), delta = allowance('depth', t), tMinus = expandedEntry(ray, rho);
      if (tMinus === null || !(tMinus <= t)) throw new Error(`${id}: the expansion must contain the object`);
      c.envelope = { rho, delta, tMinus };
    }
    cases.push(c);
  }
  return stratum(`analytic/${kind}`, 'analytic-ray', {}, cases, { reference: kind === 'sphere' ? 500 : kind === 'box' ? 521 : 1345, positiveHits: 64 }, { reference: cases.length - excluded.length, positiveHits }, excluded,
    { checks: ANALYTIC_CHECKS.map(check => check.id), cpuPreflight: analyticPreflight(cases) });
}
// Binary64 traces of both checks (CPU evidence only; never a GPU result and never a screen).
function analyticPreflight(cases) {
  const run = (scale, check) => {
    let statusFailures = 0, depthFailures = 0, numericalFailures = 0, worst = 0;
    for (const c of cases) {
      const profile = { name: 'surface-v1', height: 720, maxSteps: 512, ...(scale === 1 ? {} : { toleranceScale: scale }) };
      const r = traceModel(c.inputs.model, c.inputs.effective, c.inputs.ray, profile);
      numericalFailures += Number(r.status === 'numerical failure'); statusFailures += Number(r.status !== c.expected.status);
      if (!c.envelope) continue;
      const { delta, tMinus } = c.envelope, hit = r.status === 'approximate hit';
      const ok = check === 'surface-envelope' ? hit && r.t >= Math.max(0, tMinus) - delta && r.t <= c.expected.t + delta : hit && Math.abs(r.t - c.expected.t) <= delta;
      depthFailures += Number(!ok);
      if (hit) worst = Math.max(worst, check === 'surface-envelope' ? Math.max((Math.max(0, tMinus) - r.t) / delta, (r.t - c.expected.t) / delta, 0) : Math.abs(r.t - c.expected.t) / delta);
    }
    return { statusFailures, depthFailures, numericalFailures, worstExcessOverDelta: worst };
  };
  const inspectionDisplacement = Math.max(0, ...cases.filter(c => c.envelope).map(c => {
    const kind = c.id.split('/')[0], rho = 0.1 * c.envelope.rho;
    const entry = kind === 'sphere' ? expandedSphereEntry(c.inputs.ray, rho) : kind === 'box' ? expandedBoxEntry(c.inputs.ray, rho) : expandedMengerEntry(c.inputs.ray, c.inputs.effective.depth, rho);
    return (c.expected.t - Math.max(0, entry)) / c.envelope.delta;
  }));
  return { scope: 'binary64 reference tracer; CPU preflight, not GPU qualification', 'surface-envelope': run(1, 'surface-envelope'),
    'inspection-relative': run(0.1, 'inspection-relative'), inspectionStoppingDisplacementOverDelta: inspectionDisplacement };
}
function convergence(primary, tighter) {
  if (!['approximate hit', 'miss'].includes(primary.status) || primary.status !== tighter.status) return 'unresolved or status disagreement';
  if (primary.status === 'approximate hit' && (!(primary.t > 0) || Math.abs(primary.t - tighter.t) / primary.t > 1e-3)) return 'depth convergence exceeded';
  return null;
}
function overview(id, model, effective) {
  const camera = overviewCamera(modelRadius(model, effective)), cases = [], excluded = [];
  let positiveHits = 0;
  const profile = { name: 'surface-v1', height: 720, maxIterations: 128, maxSteps: 512 };
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    const pixel = [376 + 17 * i, 96 + 17 * j], ray = rayFor(camera, ...pixel, 1280, 720), caseId = `${id}/${i}/${j}`;
    const primary = traceModel(model, effective, ray, profile), tighter = traceModel(model, effective, ray, { ...profile, toleranceScale: 0.1 });
    const reason = !['approximate hit', 'miss'].includes(primary.status) || primary.status !== tighter.status ? 'unresolved or status disagreement' : null;
    if (reason) excluded.push({ id: caseId, reason, quantity: 'status' }); else if (primary.status === 'approximate hit' && primary.t > 0) positiveHits++;
    cases.push({ id: caseId, inputs: { model, effective, ray, profile }, pixel, expected: primary, reference: tighter, depthDifference: tighter.t - primary.t, referenceEligible: !reason });
  }
  const surfaceBearing = model === 'mandelbulb' || (Math.abs(effective.kappa) <= 0.5 && !effective.C.every((v, i) => v === (i === 0 ? 2 : 0)));
  return stratum(id, 'fractal-overview', { model, ...effective }, cases, { reference: 820, positiveHits: surfaceBearing ? 64 : 0 }, { reference: cases.length - excluded.length, positiveHits }, excluded, { camera, surfaceBearing, assertionsPassed: cases.every(c => c.expected.status !== 'numerical failure' && c.reference.status !== 'numerical failure') });
}
export function generateAnchors() {
  const models = [...Array.from({ length: 7 }, (_, i) => ['mandelbulb', { power: i + 2 }, `bulb-${i + 2}`]),
    ['quaternion-julia', { C: PARAMETERS[0].map(Math.fround), kappa: 0 }, 'quaternion-default'],
    ['quaternion-julia', { C: PARAMETERS[3].map(Math.fround), kappa: 0.5 }, 'quaternion-offplane']];
  return models.flatMap(([model, effective, label]) => [0, 1].map(side => {
    const seedRay = anchorSeed(model, effective, side);
    return { id: `${label}/anchor-${side}`, model, effective, seedRay, ...prepareAnchor(model, effective, seedRay) };
  }));
}
function detail(anchor, exponent) {
  const distance = 10 ** -exponent, camera = detailCamera(anchor, distance), cases = [], excluded = [];
  const profile = { name: 'ladder-v1', height: 720, maxIterations: 128, maxSteps: 512 }, id = `detail/${anchor.id}/1e-${exponent}`;
  let positiveHits = 0;
  const requested = anchor.model === 'mandelbulb' ? anchor.effective : { C: anchor.id.startsWith('quaternion-default') ? PARAMETERS[0] : PARAMETERS[3], kappa: anchor.effective.kappa };
  for (let j = 344; j <= 375; j++) for (let i = 624; i <= 655; i++) {
    const ray = rayFor(camera, i, j, 1280, 720), caseId = `${id}/${i}/${j}`;
    const primary = traceModel(anchor.model, anchor.effective, ray, profile), tighter = traceModel(anchor.model, anchor.effective, ray, { ...profile, hitFactor: 0.0005 });
    const requestedResult = anchor.model === 'mandelbulb' ? primary : traceModel(anchor.model, requested, ray, profile);
    const reason = !anchor.convergence.converged || anchor.convergence.deltaT > 1e-3 * distance ? 'anchor convergence insufficient at distance' : convergence(primary, tighter);
    if (reason) excluded.push({ id: caseId, reason, quantity: 'depth' }); else if (primary.status === 'approximate hit') positiveHits++;
    cases.push({ id: caseId, inputs: { model: anchor.model, effective: anchor.effective, requested, ray, profile }, pixel: [i, j], expected: primary, reference: tighter, requestedExpected: requestedResult, referenceEligible: !reason });
  }
  return stratum(id, 'detail-ladder', { anchorId: anchor.id, distance }, cases, { reference: 512, positiveHits: 128 }, { reference: cases.length - excluded.length, positiveHits }, excluded, { role: 'diagnostic', profile: 'ladder-v1', camera, claim: 'CPU reference eligibility only; no GPU depth claim' });
}
export function* generateStrata({ seed = 1, partition = 'all' } = {}) {
  if (!['all', 'points', 'rays'].includes(partition)) throw new RangeError('unknown matrix partition');
  if (seed !== 1) throw new RangeError('frozen enumeration seed is 1');
  if (partition !== 'rays') {
  for (let power = 2; power <= 8; power++) for (const cap of BUDGETS) {
    const prefix = `bulb/p${power}/n${cap}`;
    const semantic = (name, points) => stratum(`${prefix}/${name}`, `bulb-${name}`, { power, cap }, points.map((p, i) => ({ id: `${prefix}/${name}/${i}`, inputs: { effective: p, power, cap }, expected: pointExpected(bulbOrbit(p, power, cap)) })), { semantic: points.length }, { semantic: points.length });
    yield semantic('origin', [[0, 0, 0]]);
    yield semantic('polar', Array.from({ length: 24 }, (_, i) => [0, 0, (i % 2 ? -1 : 1) * 2 ** (Math.floor(i / 2) - 8)]));
    yield generic(`${prefix}/generic`, 'mandelbulb', { power }, cap, grid(8, 8, 8, -1.2, 1.2));
  }
  for (let ci = 0; ci < PARAMETERS.length; ci++) for (const kappa of KAPPAS) for (const cap of BUDGETS) {
    yield generic(`quaternion/c${ci}/k${kappa}/n${cap}`, 'quaternion-julia', { C: PARAMETERS[ci].map(Math.fround), kappa }, cap, grid(8, 8, 4, -1.5, 1.5));
  }
  for (const [ci, C] of boundaryParameters().entries()) for (const kappa of KAPPAS) for (const cap of BUDGETS) yield boundary(`boundary/c${ci}/k${kappa}/n${cap}`, C, kappa, cap);
  yield pointAdversarial();
  }
  if (partition === 'points') return;
  yield rayAdversarial();
  for (const model of ['sphere', 'box', 'menger-1', 'menger-2']) yield analyticRays(model);
  for (let power = 2; power <= 8; power++) yield overview(`overview/bulb/p${power}`, 'mandelbulb', { power });
  for (let ci = 0; ci < PARAMETERS.length; ci++) for (const kappa of KAPPAS) yield overview(`overview/quaternion/c${ci}/k${kappa}`, 'quaternion-julia', { C: PARAMETERS[ci].map(Math.fround), kappa });
  for (const anchor of generateAnchors()) for (let exponent = 1; exponent <= 8; exponent++) yield detail(anchor, exponent);
}
export function generateMatrix({ seed = 1, strata } = {}) {
  return { ...matrixHeader({ seed }), strata: strata ? strata.map(s => compactRayStratum(finalizeStratum(s))) : [...generateStrata({ seed })], anchors: generateAnchors() };
}
const countKeys = ['hit', 'miss', 'point-budget', 'estimate-unavailable', 'ray-step-budget', 'stagnation:ray-parameter', 'stagnation:field-coordinate', 'numericalFailure'];
function countsFor(model, effective, camera, width, height, quality, rowStart = 0, rowEnd = height) {
  const counts = Object.fromEntries(countKeys.map(key => [key, 0]));
  const profile = { name: 'surface-v1', height, maxIterations: quality.maxIterations, maxSteps: quality.maxSteps, verticalFovDegrees: camera.verticalFovDegrees };
  for (let j = rowStart; j < rowEnd; j++) for (let i = 0; i < width; i++) {
    const result = traceModel(model, effective, rayFor(camera, i, j, width, height), profile);
    const key = result.status === 'approximate hit' ? 'hit' : result.status === 'miss' ? 'miss' : result.status === 'numerical failure' ? 'numericalFailure' : result.reason === 'stagnation' ? `stagnation:${result.subreason}` : result.reason;
    counts[key]++;
  }
  return counts;
}
export function generateUsability() {
  // B02's default camera is 2.5 units away; P3's separate overview is 2.5 radii.
  const effective = { C: PARAMETERS[0].map(Math.fround), kappa: 0 }, camera = lookCamera([1.92, -1.44, 0.7]);
  const settings = { model: 'quaternion-julia', effective, camera, width: 160, height: 90, profile: 'surface-v1', maxIterations: 128, maxSteps: 512, precision: 'f64' };
  const counts = countsFor(settings.model, effective, camera, 160, 90, settings);
  return { rays: 14400, settings, distribution: { hit: counts.hit, miss: counts.miss, unresolved: Object.fromEntries(countKeys.slice(2, -1).map(k => [k, counts[k]])), numericalFailure: counts.numericalFailure }, acceptance: { perClassAbsoluteFraction: 0.05, numericalFailureMax: 0 } };
}
function effectiveScene(scene) {
  return scene.id === 'bulb' ? { power: Number(scene.parameters.power) } : scene.id === 'quaternion' ? { C: scene.parameters.C.map(x => Math.fround(Number(x))), kappa: Math.fround(Number(scene.parameters.kappa)) } : { depth: scene.parameters.depth };
}
function sceneJSON(record) {
  const model = record.model.split('@')[0];
  return { application: 'ATLAS', schema: 'atlas.scene', schemaVersion: 1, applicationVersion: '1.0.0', workspace: 'space', model: { id: model, version: 1 },
    conventions: 'atlas-space-rh-zup-abcd-v1', parameters: structuredClone(record.parameters), camera: overviewCamera(modelRadius(model, effectiveScene(record))), slices: [],
    iteration: { maxIterations: record.maxIterations, bailoutPolicy: 'model-default' }, tracing: { profile: 'surface-v1', maxSteps: record.maxSteps, stepMultiplier: 0.9 },
    appearance: { material: 'neutral', palette: 'ember', lighting: 'inspection', lightingQuality: record.lightingQuality, fog: { enabled: false }, viewMode: 'shaded' },
    sampling: { ...record.sampling, targetSamples: record.targetSamples }, provenance: { createdBy: 'atlas' } };
}
export function materializePerformance(input, predictions) {
  const result = structuredClone(input);
  result.workloads.orbit.cameraPoses = {}; result.workloads.interaction.cameraPoses = {}; result.coverageCheckpoints.materialized = {};
  for (const scene of result.scenes) {
    scene.scene = sceneJSON(scene);
    const base = scene.scene.camera;
    result.workloads.orbit.cameraPoses[scene.id] = Array.from({ length: 1875 }, (_, k) => ({ requestIndex: k, requestTimeMs: 16 * k, camera: yawCamera(base, 0.5 * (16 * k) / 1000) }));
    result.workloads.interaction.cameraPoses[scene.id] = Array.from({ length: 400 }, (_, k) => ({ requestIndex: k + 1, requestTimeMs: 60 * (k + 1), camera: yawCamera(base, 14.992 + 0.5 * (60 * (k + 1)) / 1000) }));
    const checkpoint = (kind, orbitIndex, quality) => ({ id: `${scene.id}/${kind}/${orbitIndex}`, sceneId: scene.id, kind, orbitIndex,
      camera: result.workloads.orbit.cameraPoses[scene.id][orbitIndex].camera, quality: structuredClone(quality), predictionId: `${scene.id}/${kind}/${orbitIndex}` });
    result.coverageCheckpoints.materialized[scene.id] = [...result.coverageCheckpoints.orbitIndices.map(k => checkpoint('orbit', k, result.coverageCheckpoints.orbitQuality)), checkpoint('settled', 1874, result.coverageCheckpoints.settledQuality)];
  }
  result.materialization.formats['coverageCheckpoints.materialized'].settledOrbitIndex = 1874;
  result.predictionArtifact.sha256 = predictions ? sha256(serialize(predictions)) : null;
  const owned = new Set(['scenes.bulb.scene', 'scenes.quaternion.scene', 'scenes.menger.scene', 'workloads.orbit.cameraPoses', 'workloads.interaction.cameraPoses', 'coverageCheckpoints.materialized', 'predictionArtifact.sha256']);
  result.unresolved = result.unresolved.filter(item => !owned.has(item.field));
  const checkpoints = Object.values(result.coverageCheckpoints.materialized).flat();
  const complete = predictions?.schema === 'atlas.performance-predictions' && predictions.version === 1 && predictions.checkpoints?.length === 15 && checkpoints.every(checkpoint => {
    const prediction = predictions.checkpoints.find(p => p.id === checkpoint.predictionId);
    return prediction && prediction.sceneId === checkpoint.sceneId && serialize(prediction.quality) === serialize(checkpoint.quality) &&
      prediction.rays === result.output.width * result.output.height * checkpoint.quality.scale ** 2 &&
      countKeys.every(k => Number.isSafeInteger(prediction.counts?.[k]) && prediction.counts[k] >= 0) &&
      countKeys.reduce((sum, k) => sum + prediction.counts[k], 0) === prediction.rays;
  });
  if (!complete) result.unresolved.push({ field: 'predictionArtifact.sha256', reason: 'A complete prediction for every frozen checkpoint is required.', owner: 'B04' });
  result.readyForAcceptance = result.unresolved.length === 0;
  return result;
}
export function predictCheckpoint(scene, checkpoint, output, { rowStart = 0, rowEnd, counts: supplied } = {}) {
  const width = output.width * checkpoint.quality.scale, height = output.height * checkpoint.quality.scale;
  const counts = supplied ?? countsFor(scene.model.split('@')[0], effectiveScene(scene), checkpoint.camera, width, height, checkpoint.quality, rowStart, rowEnd ?? height);
  const rays = width * height;
  return { id: checkpoint.predictionId, sceneId: scene.id, width, height, rays, quality: checkpoint.quality, precision: 'f64', inputPrecision: 'effective-binary32', profile: 'surface-v1', counts,
    acceptance: { perClassAbsoluteFraction: 0.01, numericalFailureMax: 0, totalMustEqual: rays, analysisRef: 'tolerance-analysis.md#coverage',
      ranges: Object.fromEntries(countKeys.map(key => [key, key === 'numericalFailure' ? [0, 0] : [Math.max(0, Math.ceil(counts[key] - 0.01 * rays)), Math.min(rays, Math.floor(counts[key] + 0.01 * rays))]])) } };
}
function predictionsFor(manifest) {
  const checkpoints = [];
  for (const scene of manifest.scenes) for (const checkpoint of manifest.coverageCheckpoints.materialized[scene.id]) {
    checkpoints.push(predictCheckpoint(scene, checkpoint, manifest.output));
    console.log(`P3 ${checkpoint.id}: ${JSON.stringify(checkpoints.at(-1).counts)}`);
  }
  return { schema: 'atlas.performance-predictions', version: 1, referenceSha256: matrixHeader().referenceSha256, checkpoints };
}
function write(name, value) { writeFileSync(new URL(name, directory), serialize(value)); }
async function main() {
  const flags = new Set(process.argv.slice(2));
  if ([...flags].some(flag => !['--preflight', '--p3', '--write', '--check'].includes(flag))) throw new Error('usage: matrix.mjs [--preflight] [--p3] [--write | --check]');
  if (flags.has('--p3')) {
    const initial = JSON.parse(read('performance-workload.json'));
    const materialized = materializePerformance(initial), predictions = predictionsFor(materialized), manifest = materializePerformance(initial, predictions);
    if (flags.has('--check')) {
      if (serialize(manifest) !== read('performance-workload.json').toString() || serialize(predictions) !== read('performance-predictions.json').toString()) throw new Error('P3 regeneration mismatch');
    } else { write('performance-predictions.json', predictions); write('performance-workload.json', manifest); }
    console.log(`prediction SHA-256 ${sha256(serialize(predictions))}\nmanifest SHA-256 ${sha256(serialize(manifest))}`);
    return;
  }
  const strata = [];
  for (const s of generateStrata()) { strata.push(s); console.log(`${s.id}\t${s.role}\t${Object.entries(s.floor).map(([k, floor]) => `${k}=${s.eligible[k]}/${floor}`).join(' ')}\t${s.state}`); }
  const matrix = generateMatrix({ strata });
  const usability = generateUsability();
  if (flags.has('--check')) {
    if (serialize(matrix) !== serialize(loadMatrix()) || serialize(usability) !== read('quaternion-usability.json').toString()) throw new Error('P1 regeneration mismatch');
  } else if (flags.has('--write') || !flags.has('--preflight')) {
    const { index, shards } = createMatrixIndex(matrix);
    mkdirSync(new URL('space-matrix/', directory), { recursive: true });
    for (const [path, bytes] of shards) writeFileSync(new URL(path, directory), bytes);
    write('space-matrix.json', index); write('quaternion-usability.json', usability);
    if (serialize(loadMatrix()) !== serialize(matrix)) throw new Error('written matrix assembly differs');
  }
  const failed = strata.filter(s => s.role === 'mandatory' && s.state !== 'frozen');
  console.log(`P1 mandatory inconclusive ${failed.length}; qualification ${matrixIsQualifiable(matrix) ? 'eligible for GPU comparison' : 'BLOCKED'}; matrix SHA-256 ${sha256(serialize(matrix))}`);
  if (failed.length) process.exitCode = 2;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
