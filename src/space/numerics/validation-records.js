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
