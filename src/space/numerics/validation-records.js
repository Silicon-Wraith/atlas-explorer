// Product arithmetic validation records for the field kernels (plan B08; spec §10.5, §16.2). Pure: the
// caller supplies the per-stratum comparison results and the kernel's implementation hashes (this
// module imports no GPU code). A record exists only when every mandatory point stratum it covers
// passed; a failed, inconclusive or missing stratum withholds it and is reported, never pooled.
import { deepFreeze } from '../../shared/scene.js';
import { PRECISION_CARRY_FORWARD_LIMITATIONS } from './validation-domains.js';

export { createValidationRegistry, PRECISION_CARRY_FORWARD_LIMITATIONS } from './validation-domains.js';

// Pinned at registration (plan rev 4.6 B08): the logical matrix hash, the index-file hash, the
// generator and every reference source. Equal to scripts/gate/reference-evidence.mjs's approved
// identities (a unit test asserts it); a re-freeze needs new record IDs, never a silent retarget.
export const MATRIX_PINS = deepFreeze({
  matrixSha256: 'd17a04fc8b6c83a56c99a418947c4081bdc197fc2c75d49868e3534af58919b4',
  indexSha256: 'faa95f4fbfb667ce05932c09601f278cacc7969494b92f306ae3e20beefd74a0',
  generatorSha256: '05d171561dc77762e24a448b931c668ca321027132f56e6a3810dbe03817e05d',
  referenceSha256: {
    'f32.js': '77408939eba83d4cdf79584f04e5a1a1857995c789a40524a8849b5a340ae3fb',
    'complex.js': 'e69bcf7845b2ddaf35d1bdd40ab8e7c08c7fb198daf94782c495d5baef478bb2',
    'quaternion.js': '31708ad36542b79b2e8c0b07ea438d8ee8c207d83a9e4d39e1f233d3ad711bc3',
    'bulb.js': '2a0916987fc64b41e6a63e349d16ca0c0c18a3f685a05454723f3db10e4d85c0',
    'analytic.js': '5564f55629f0135c22622806189bae8a2a805d85e6ce46d8ac053144ac6f83ce',
    'menger.js': 'b7bd43ae70567dea59c5c88674b3250f4f44f18cfa99cb2ecf75d3b9141bc413',
    'camera.js': '0f0cbb8584e30d7942393c4d15801e022d7d20867e66b9335fb55527468956df',
    'trace.js': '1a027b9fde051cf3e9704a3442abdb94747888139a3d5dbef08ab5e945115e96',
    'anchors.mjs': '523f5236b3105769a9c789c4a0bab045c0e6a5fac97b67c51e35f4073e7724ad',
    'matrix.mjs': '05d171561dc77762e24a448b931c668ca321027132f56e6a3810dbe03817e05d',
  },
});
// B08 consumes the point strata; B10 consumes the ray strata and anchors.
export const POINT_STRATUM_KINDS = Object.freeze(['bulb-origin', 'bulb-polar', 'bulb-generic', 'quaternion-generic', 'quaternion-boundary', 'adversarial-point']);
export const BULB_POWERS = Object.freeze([2, 3, 4, 5, 6, 7, 8]);
export const POINT_BUDGETS = Object.freeze([64, 128, 256, 512]);
const KAPPAS = [0, 0.5, -0.5, 2, -2, 4, -4];
export const ADVERSARIAL_POINT_STRATUM = 'adversarial/points';
export const ARITHMETIC_PROFILE = 'surface-v1';
export const bulbRecordId = power => `mandelbulb@1/arithmetic/p${power}`;
export const QUATERNION_RECORD_ID = 'quaternion-julia@1/arithmetic';
export const ARITHMETIC_RECORD_IDS = Object.freeze([...BULB_POWERS.map(bulbRecordId), QUATERNION_RECORD_ID]);

// The frozen stratum IDs each record covers (B04's generator fixes them).
export function requiredStrata(recordId) {
  if (recordId === QUATERNION_RECORD_ID) {
    const ids = [];
    for (let c = 0; c < 6; c++) for (const k of KAPPAS) for (const n of POINT_BUDGETS) ids.push(`quaternion/c${c}/k${k}/n${n}`);
    for (let c = 0; c < 24; c++) for (const k of KAPPAS) for (const n of POINT_BUDGETS) ids.push(`boundary/c${c}/k${k}/n${n}`);
    return [...ids, ADVERSARIAL_POINT_STRATUM];
  }
  const power = BULB_POWERS.find(p => bulbRecordId(p) === recordId);
  if (power === undefined) throw new RangeError(`unknown arithmetic record ${recordId}`);
  return [...POINT_BUDGETS.flatMap(n => ['origin', 'polar', 'generic'].map(kind => `bulb/p${power}/n${n}/${kind}`)), ADVERSARIAL_POINT_STRATUM];
}

const DOMAINS = {
  mandelbulb: { points: 'origin; polar axis (0, 0, ±2^j), j = -8..3; 8^3 cell centres over [-1.2, 1.2]^3', inputs: 'effective-binary32', strata: 'point strata of the frozen P1 matrix' },
  'quaternion-julia': { points: '8 x 8 x 4 cell centres over [-1.5, 1.5]^3 in the kappa slice; supported-boundary starts (origin, six ±0.25 axis points, (0.25, -0.5, 0.75))', inputs: 'effective-binary32', strata: 'point strata of the frozen P1 matrix' },
};
const unique = values => [...new Map(values.map(value => [JSON.stringify(value), value])).values()];

export function buildArithmeticRecords({ results, implementationHashes }) {
  if (!Array.isArray(results)) throw new TypeError('results must be an array of stratum comparisons');
  const byId = new Map();
  for (const result of results) {
    if (result?.role !== 'mandatory') throw new RangeError(`arithmetic records consume mandatory point strata only (${result?.id})`);
    if (byId.has(result.id)) throw new RangeError(`duplicate stratum result ${result.id}`);
    byId.set(result.id, result);
  }
  const records = [], withheld = [];
  for (const recordId of ARITHMETIC_RECORD_IDS) {
    const ids = requiredStrata(recordId);
    const failing = ids.filter(id => byId.get(id)?.passed !== true || byId.get(id)?.state !== 'passed');
    if (failing.length) { withheld.push({ recordId, failing }); continue; }
    const covered = ids.map(id => byId.get(id));
    const quaternion = recordId === QUATERNION_RECORD_ID, modelId = quaternion ? 'quaternion-julia' : 'mandelbulb';
    const power = quaternion ? null : BULB_POWERS.find(p => bulbRecordId(p) === recordId);
    const parameterRows = covered.filter(row => row.id !== ADVERSARIAL_POINT_STRATUM);
    records.push(deepFreeze({
      recordId, modelId, evidenceClass: 'arithmetic', implementationHashes: { ...implementationHashes },
      referenceHashes: { ...MATRIX_PINS.referenceSha256, generator: MATRIX_PINS.generatorSha256, matrixIndex: MATRIX_PINS.indexSha256 },
      matrixHash: MATRIX_PINS.matrixSha256, profile: ARITHMETIC_PROFILE,
      testedParameters: quaternion ? { C: unique(parameterRows.map(row => row.C)), kappa: unique(parameterRows.map(row => row.kappa)) } : { power: [power] },
      testedSamplingConditions: { maxIterations: [...POINT_BUDGETS] },
      testedDomain: DOMAINS[modelId],
      coverage: { scope: 'point strata loaded through the pinned index (a partial view); not whole-matrix qualification', strata: covered.length,
        rows: covered.map(row => ({ id: row.id, eligible: row.eligible, floor: row.floor, compared: row.compared, excluded: row.excluded })) },
      inconclusive: covered.filter(row => row.state === 'inconclusive').map(row => row.id),
      limitations: [...PRECISION_CARRY_FORWARD_LIMITATIONS],
    }));
  }
  return { records, withheld };
}

// ---- Tracing and geometric records (plan B10; P2). Same rules: a record exists only when every
// mandatory stratum it covers passed; geometric ladder records are diagnostic and claim only the
// distances at which the ladder-v1 criteria held, recording exceedance and inconclusive distances.
export const RAY_STRATUM_KINDS = Object.freeze(['analytic-ray', 'adversarial-ray', 'fractal-overview', 'detail-ladder']);
export const ADVERSARIAL_RAY_STRATUM = 'adversarial/rays';
// P2's quaternion usability experiment, prediction tests/reference/quaternion-usability.json (B04).
export const USABILITY_STRATUM = 'usability/quaternion-default';
export const TRACING_PROFILE = 'surface-v1';
export const LADDER_PROFILE = 'ladder-v1';
export const tracingBulbRecordId = power => `mandelbulb@1/tracing/p${power}`;
export const TRACING_RECORD_IDS = Object.freeze(['sphere@1/tracing', 'box@1/tracing', 'menger@1/tracing', ...BULB_POWERS.map(tracingBulbRecordId), 'quaternion-julia@1/tracing']);
const QUATERNION_CS = 6;

export function requiredTracingStrata(recordId) {
  if (recordId === 'sphere@1/tracing') return ['analytic/sphere', ADVERSARIAL_RAY_STRATUM];
  if (recordId === 'box@1/tracing') return ['analytic/box', ADVERSARIAL_RAY_STRATUM];
  if (recordId === 'menger@1/tracing') return ['analytic/menger-1', 'analytic/menger-2', ADVERSARIAL_RAY_STRATUM];
  if (recordId === 'quaternion-julia@1/tracing') {
    const ids = [];
    for (let c = 0; c < QUATERNION_CS; c++) for (const k of KAPPAS) ids.push(`overview/quaternion/c${c}/k${k}`);
    return [...ids, USABILITY_STRATUM, ADVERSARIAL_RAY_STRATUM];
  }
  const power = BULB_POWERS.find(p => tracingBulbRecordId(p) === recordId);
  if (power === undefined) throw new RangeError(`unknown tracing record ${recordId}`);
  return [`overview/bulb/p${power}`, ADVERSARIAL_RAY_STRATUM];
}
const TRACING_DOMAINS = {
  sphere: { rays: 'P1 sphere reference rays (Project 0 A.4, re-expressed independently)', height: 720, verticalFovDegrees: 60 },
  box: { rays: 'P1 rotated-box reference rays (Project 0 A.4, re-expressed independently)', height: 720, verticalFovDegrees: 60 },
  menger: { rays: 'P1 Menger depth 1 and 2 reference rays (41 x 41, oblique direction)', height: 720, verticalFovDegrees: 60 },
  overview: { camera: 'upright overview camera at 2.5R along the Project 0 A.6 direction, focus at the origin', verticalFovDegrees: 60, frame: [1280, 720],
    pixels: '(376 + 17u, 96 + 17v), u, v = 0..31, rays through (i + 0.5, j + 0.5)' },
  usability: { camera: 'quaternion default view, positionLocal (1.92, -1.44, 0.7)', frame: [160, 90] },
};
function recordModel(recordId) { return recordId.slice(0, recordId.indexOf('@')); }

export function buildTracingRecords({ results, implementationHashes }) {
  if (!Array.isArray(results)) throw new TypeError('results must be an array of stratum comparisons');
  const byId = new Map();
  for (const result of results) {
    if (result?.role !== 'mandatory') throw new RangeError(`tracing records consume mandatory ray strata only (${result?.id})`);
    if (byId.has(result.id)) throw new RangeError(`duplicate stratum result ${result.id}`);
    byId.set(result.id, result);
  }
  const records = [], withheld = [];
  for (const recordId of TRACING_RECORD_IDS) {
    const ids = requiredTracingStrata(recordId);
    const failing = ids.filter(id => byId.get(id)?.passed !== true || byId.get(id)?.state !== 'passed');
    if (failing.length) { withheld.push({ recordId, failing }); continue; }
    const covered = ids.map(id => byId.get(id)), modelId = recordModel(recordId);
    const power = modelId === 'mandelbulb' ? BULB_POWERS.find(p => tracingBulbRecordId(p) === recordId) : null;
    const overviewRows = covered.filter(row => row.kind === 'fractal-overview');
    const testedParameters = modelId === 'mandelbulb' ? { power: [power] } : modelId === 'quaternion-julia'
      ? { C: unique(overviewRows.map(row => row.parameters.C)), kappa: unique(overviewRows.map(row => row.parameters.kappa)) }
      : modelId === 'menger' ? { depth: [1, 2] } : {};
    const testedDomain = modelId === 'mandelbulb' ? { ...TRACING_DOMAINS.overview } : modelId === 'quaternion-julia'
      ? { ...TRACING_DOMAINS.overview, usability: TRACING_DOMAINS.usability } : { ...TRACING_DOMAINS[modelId] };
    records.push(deepFreeze({
      recordId, modelId, evidenceClass: 'tracing', implementationHashes: { ...implementationHashes },
      referenceHashes: { ...MATRIX_PINS.referenceSha256, generator: MATRIX_PINS.generatorSha256, matrixIndex: MATRIX_PINS.indexSha256 },
      matrixHash: MATRIX_PINS.matrixSha256, profile: TRACING_PROFILE,
      testedParameters, testedSamplingConditions: { maxIterations: [128], maxSteps: [512] }, testedDomain,
      coverage: { scope: 'ray strata loaded through the pinned index (a partial view); not whole-matrix qualification', strata: covered.length,
        rows: covered.map(row => ({ id: row.id, state: row.state, eligible: row.eligible ?? null, floor: row.floor ?? null, excluded: row.excluded ?? null,
          ...(row.kind === 'fractal-overview' ? { disagreements: row.disagreements ?? null, hits: row.hits ?? null, goodDepths: row.goodDepths ?? null, surfaceBearing: row.surfaceBearing ?? null } : {}) })) },
      inconclusive: covered.filter(row => row.state === 'inconclusive').map(row => row.id),
      limitations: [...PRECISION_CARRY_FORWARD_LIMITATIONS,
        'A heuristic marcher\'s miss does not prove that the mathematical ray misses the set; a small DE certifies nothing (spec §11.4). These are preregistered engineering thresholds, not geometric error bounds.'],
    }));
  }
  return { records, withheld };
}

// One diagnostic record per anchor (testedDomain per anchor), listing only the agreeing distances.
export function buildGeometricRecords({ ladders, anchors, implementationHashes }) {
  if (!Array.isArray(ladders) || !Array.isArray(anchors)) throw new TypeError('ladders and anchors must be arrays');
  const records = [], withheld = [];
  for (const anchor of anchors) {
    const rows = ladders.filter(row => row.anchorId === anchor.id);
    if (rows.some(row => row.role !== 'diagnostic' || row.profile !== LADDER_PROFILE)) throw new RangeError(`${anchor.id}: geometric records consume diagnostic ladder-v1 rows only`);
    const agreeing = rows.filter(row => row.outcome === 'agreement').map(row => row.distance);
    const modelId = anchor.model, recordId = `${modelId}@1/geometric/${anchor.id}`;
    if (!agreeing.length) { withheld.push({ recordId, outcomes: rows.map(row => ({ distance: row.distance, outcome: row.outcome })) }); continue; }
    records.push(deepFreeze({
      recordId, modelId, evidenceClass: 'geometric', implementationHashes: { ...implementationHashes },
      referenceHashes: { ...MATRIX_PINS.referenceSha256, generator: MATRIX_PINS.generatorSha256, matrixIndex: MATRIX_PINS.indexSha256 },
      matrixHash: MATRIX_PINS.matrixSha256, profile: LADDER_PROFILE,
      testedParameters: modelId === 'mandelbulb' ? { power: [anchor.effective.power] } : { C: [anchor.effective.C], kappa: [anchor.effective.kappa] },
      testedSamplingConditions: { maxIterations: [128], maxSteps: [512] },
      testedDomain: { anchorId: anchor.id, anchor: [...anchor.anchor], pixels: 'the central 32 x 32 rays of a 1280 x 720 frame', distances: agreeing },
      coverage: { scope: 'diagnostic detail ladder (evidence, not a pass); no claim at exceeded or inconclusive distances',
        rows: rows.map(row => ({ id: row.id, distance: row.distance, outcome: row.outcome, eligible: row.eligible, effective: row.effective, requested: row.requested })) },
      inconclusive: rows.filter(row => row.outcome === 'inconclusive').map(row => row.id),
      limitations: [...PRECISION_CARRY_FORWARD_LIMITATIONS, 'Ladder agreement at a distance is diagnostic evidence for this anchor and camera patch only; "threshold exceeded" rows are evidence, not passes.'],
    }));
  }
  return { records, withheld };
}
