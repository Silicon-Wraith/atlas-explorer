// Plan B08: the point-stratum comparison rules, the matrix pins and the arithmetic validation records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { APPROVED_REFERENCE_IDENTITIES } from '../../scripts/gate/reference-evidence.mjs';
import { createValidationRegistry, PRECISION_CARRY_FORWARD_LIMITATIONS } from '../../src/space/numerics/validation-records.js';
import { MATRIX_PINS, POINT_STRATUM_KINDS, ARITHMETIC_RECORD_IDS, QUATERNION_RECORD_ID, buildArithmeticRecords, requiredStrata, PRIOR_MATRIX_PINS, PRIOR_RECORD_IDS, MATRIX_FREEZE, TRACING_RECORD_IDS, TRACING_IDENTITY, PRIOR_TRACING_IDENTITY_RECORD_IDS } from '../../src/space/numerics/validation-records.js';
import { comparePointStratum, loadPinnedPointStrata, verifyMatrixPins } from '../support/space-numerics.mjs';

const index = readFileSync(new URL('../reference/space-matrix.json', import.meta.url));
const template = JSON.parse(index).matrixTemplate;
const TOL = template.tolerances;

test('the matrix pins equal the approved gate identities and the committed index', () => {
  assert.equal(MATRIX_PINS.matrixSha256, APPROVED_REFERENCE_IDENTITIES.matrixSha256);
  assert.equal(MATRIX_PINS.indexSha256, APPROVED_REFERENCE_IDENTITIES.indexSha256);
  assert.equal(MATRIX_PINS.generatorSha256, APPROVED_REFERENCE_IDENTITIES.generatorSha256);
  assert.equal(createHash('sha256').update(index).digest('hex'), MATRIX_PINS.indexSha256);
  assert.deepEqual(MATRIX_PINS.referenceSha256, template.referenceSha256);
  assert.doesNotThrow(() => verifyMatrixPins(index));
  const tampered = Buffer.from(index.toString().replace('"seed":1', '"seed":2'));
  assert.throws(() => verifyMatrixPins(tampered), /index SHA-256/);
});

test('the rev 4.8 re-freeze gives every repinned record a new ID and keeps the prior identities', () => {
  assert.equal(MATRIX_FREEZE, 'matrix-rev4.8');
  assert.equal(PRIOR_MATRIX_PINS.matrixSha256, 'd17a04fc8b6c83a56c99a418947c4081bdc197fc2c75d49868e3534af58919b4');
  assert.equal(PRIOR_MATRIX_PINS.indexSha256, 'faa95f4fbfb667ce05932c09601f278cacc7969494b92f306ae3e20beefd74a0');
  assert.notEqual(MATRIX_PINS.matrixSha256, PRIOR_MATRIX_PINS.matrixSha256);
  assert.deepEqual(PRIOR_RECORD_IDS.arithmetic, ['2', '3', '4', '5', '6', '7', '8'].map(p => `mandelbulb@1/arithmetic/p${p}`).concat('quaternion-julia@1/arithmetic'));
  assert.equal(PRIOR_RECORD_IDS.tracing.length, 11); assert.equal(PRIOR_RECORD_IDS.geometric.length, 18); assert.ok(PRIOR_RECORD_IDS.tracing.includes('sphere@1/tracing'));
  const prior = new Set([...PRIOR_RECORD_IDS.arithmetic, ...PRIOR_RECORD_IDS.tracing]);
  for (const id of ARITHMETIC_RECORD_IDS) { assert.ok(id.endsWith(`/${MATRIX_FREEZE}`), id); assert.ok(!prior.has(id), id); }
  for (const id of TRACING_RECORD_IDS) { assert.ok(id.endsWith(`/${MATRIX_FREEZE}/${TRACING_IDENTITY}`), id); assert.ok(!prior.has(id), id); }
});

test('the rev 5.0 tracing identity gives tracing and geometric records new IDs and keeps the rev 4.8 ones', () => {
  // B11b: the one-sided normal fallback changes the tracing hashes (not the kernel hashes), so the records that pin
  // tracing evidence are renamed; arithmetic records keep their IDs; the rev 4.8 tracing evidence is never retargeted.
  assert.equal(TRACING_IDENTITY, 'space-trace-v2');
  assert.deepEqual(PRIOR_TRACING_IDENTITY_RECORD_IDS.tracing, PRIOR_RECORD_IDS.tracing.map(id => `${id}/${MATRIX_FREEZE}`));
  assert.deepEqual(PRIOR_TRACING_IDENTITY_RECORD_IDS.geometric, PRIOR_RECORD_IDS.geometric.map(id => `${id}/${MATRIX_FREEZE}`));
  assert.deepEqual(TRACING_RECORD_IDS, PRIOR_TRACING_IDENTITY_RECORD_IDS.tracing.map(id => `${id}/${TRACING_IDENTITY}`));
  assert.ok(ARITHMETIC_RECORD_IDS.every(id => !id.includes(TRACING_IDENTITY)));
});

test('point strata load through the pinned index as a partial view, never as whole-matrix qualification', () => {
  const view = loadPinnedPointStrata({ kinds: ['bulb-origin', 'adversarial-point'] });
  assert.equal(view.complete, false);
  assert.equal(view.matrixSha256, MATRIX_PINS.matrixSha256);
  assert.deepEqual([...new Set(view.strata.map(s => s.kind))].sort(), ['adversarial-point', 'bulb-origin']);
  assert.throws(() => loadPinnedPointStrata({ kinds: ['fractal-overview'] }), /point strata only/);
  assert.deepEqual([...POINT_STRATUM_KINDS].sort(), ['adversarial-point', 'bulb-generic', 'bulb-origin', 'bulb-polar', 'quaternion-boundary', 'quaternion-generic']);
});

const generic = () => ({ id: 'g', kind: 'quaternion-generic', role: 'mandatory', state: 'frozen', floor: { continuous: 2 }, eligible: { continuous: 2 },
  cases: [
    { id: 'g/0', expected: { status: 'escaped', escapeIndex: 3, value: [3, 0.5, 0, 1e-8], logEscapeRadius: 1.2, log2DE: -2, estimateAvailable: true, derivative: { zero: false, mantissa: 1.5, exponent: 3 } },
      eligibleQuantities: ['status', 'escapeIndex', 'component0', 'component1', 'component2', 'component3', 'logEscapeRadius', 'log2DE'] },
    { id: 'g/1', expected: { status: 'escaped', escapeIndex: 7, value: [1, 2, 3, 4], logEscapeRadius: 2, log2DE: 1, estimateAvailable: true, derivative: { zero: false, mantissa: 1, exponent: 0 } },
      eligibleQuantities: ['status', 'escapeIndex', 'component0', 'component1', 'component2', 'component3', 'logEscapeRadius', 'log2DE'] },
    { id: 'g/2', expected: { status: 'escaped', escapeIndex: 9, value: [1, 2, 3, 4], logEscapeRadius: 2, log2DE: 1, estimateAvailable: true, derivative: { zero: false, mantissa: 1, exponent: 0 } },
      eligibleQuantities: [] },
  ] });
const actualFor = c => ({ ...structuredClone(c.expected) });

test('a point stratum passes only when every eligible quantity agrees within its frozen tolerance', () => {
  const row = generic(), results = row.cases.map(actualFor);
  results[0].value[0] *= 1 + 0.9e-4; results[0].value[3] = 9e-7; results[0].log2DE += 2 ** -11; results[1].logEscapeRadius *= 1 + 0.9e-4;
  results[2].escapeIndex = 10; // excluded from every comparison: recorded as a diagnostic disagreement only
  const ok = comparePointStratum(row, results, TOL);
  assert.equal(ok.passed, true, JSON.stringify(ok.failures));
  assert.equal(ok.compared.escapeIndex, 2); assert.equal(ok.diagnosticDisagreements, 1);
  for (const [mutate, quantity] of [
    [r => { r[0].value[0] *= 1 + 1.1e-4; }, 'component0'], [r => { r[0].value[3] = 1.2e-6; }, 'component3'], [r => { r[0].value[2] = 0.5; }, 'component2'],
    [r => { r[1].escapeIndex = 8; }, 'escapeIndex'], [r => { r[1].status = 'not escaped within iteration budget'; }, 'status'],
    [r => { r[0].log2DE += 2 ** -9; }, 'log2DE'], [r => { r[0].log2DE = null; r[0].estimateAvailable = false; }, 'log2DE'],
    [r => { r[1].logEscapeRadius *= 1 + 1.1e-4; }, 'logEscapeRadius'],
  ]) {
    const changed = row.cases.map(actualFor); mutate(changed);
    const result = comparePointStratum(row, changed, TOL);
    assert.equal(result.passed, false, quantity); assert.ok(result.failures.some(f => f.quantity === quantity), `${quantity}: ${JSON.stringify(result.failures)}`);
  }
});

test('a numerical failure, a missing result or a wrong count is a hard failure, including on excluded cases', () => {
  const row = generic();
  for (const mutate of [r => { r[2].status = 'numerical failure'; }, r => { r[2].status = 'missing'; }, r => r.pop()]) {
    const results = row.cases.map(actualFor); mutate(results);
    assert.equal(comparePointStratum(row, results, TOL).passed, false);
  }
  const inconclusive = { ...generic(), state: 'inconclusive' };
  assert.equal(comparePointStratum(inconclusive, inconclusive.cases.map(actualFor), TOL).state, 'inconclusive', 'an inconclusive frozen stratum can never pass');
  const short = { ...generic(), eligible: { continuous: 1 } };
  assert.equal(comparePointStratum(short, short.cases.map(actualFor), TOL).state, 'inconclusive', 'eligible counts below the floor are inconclusive');
});

test('semantic cases compare status, index, availability, the zero state and exact polar-axis azimuth', () => {
  const polar = { id: 'p', kind: 'bulb-polar', role: 'mandatory', state: 'frozen', floor: { semantic: 1 }, eligible: { semantic: 1 },
    cases: [{ id: 'p/0', inputs: { effective: [0, 0, 0.5] }, expected: { status: 'not escaped within iteration budget', escapeIndex: null, value: [0, 0, 0.25], logEscapeRadius: null, log2DE: null, estimateAvailable: false, derivative: { zero: false, mantissa: 1.25, exponent: 0 } } }] };
  const good = [{ ...structuredClone(polar.cases[0].expected), value: [0, 0, 0.25 * (1 + 1e-5)] }];
  assert.equal(comparePointStratum(polar, good, TOL).passed, true);
  assert.equal(comparePointStratum(polar, [{ ...good[0], value: [1e-30, 0, 0.25] }], TOL).passed, false, 'φ = 0 on the axis: no trigonometric remnant');
  assert.equal(comparePointStratum(polar, [{ ...good[0], derivative: { zero: true, mantissa: 0, exponent: 0 } }], TOL).passed, false);
  assert.equal(comparePointStratum(polar, [{ ...good[0], derivative: { zero: false, mantissa: 1.25, exponent: 1 } }], TOL).passed, false);
  const zero = { ...polar, kind: 'adversarial-point', cases: [{ id: 'zero-sensitivity', inputs: {}, expected: { status: 'escaped', escapeIndex: 2, value: [6, 0, 0, 0], logEscapeRadius: Math.log(6), log2DE: null, estimateAvailable: false, derivative: { zero: true, mantissa: 0, exponent: 0 } } }] };
  const z = [structuredClone(zero.cases[0].expected)];
  assert.equal(comparePointStratum(zero, z, TOL).passed, true);
  assert.equal(comparePointStratum(zero, [{ ...z[0], estimateAvailable: true, log2DE: 3 }], TOL).passed, false, 'an unavailable estimate must be unavailable on both sides');
});

test('adversarial derivative and admission cases compare the state and the refusal', () => {
  const row = { id: 'adversarial/points', kind: 'adversarial-point', role: 'mandatory', state: 'frozen', floor: { semantic: 2 }, eligible: { semantic: 2 }, cases: [
    { id: 'derivative-update-44', inputs: {}, expected: { derivative: { zero: false, mantissa: 1.1428570747375488, exponent: 129 }, exceedsF32ScalarRange: true } },
    { id: 'invalid-bulb-power', inputs: {}, expected: { status: 'numerical failure', admission: 'reject' } }] };
  const good = [{ status: 'not escaped within iteration budget', derivative: { zero: false, mantissa: 1.1428570747375488, exponent: 129 } }, { status: 'numerical failure', admission: 'reject' }];
  assert.equal(comparePointStratum(row, good, TOL).passed, true);
  assert.equal(comparePointStratum(row, [{ ...good[0], derivative: { zero: false, mantissa: 1.1428570747375488, exponent: 128 } }, good[1]], TOL).passed, false);
  assert.equal(comparePointStratum(row, [good[0], { status: 'numerical failure', admission: 'admitted' }], TOL).passed, false, 'a dispatched invalid input is not a refusal');
});

const summary = (id, kind, passed, extra = {}) => ({ id, kind, role: 'mandatory', state: passed ? 'passed' : 'failed', passed, eligible: { continuous: 500 }, floor: { continuous: 410 }, compared: { status: 512 }, failures: passed ? [] : [{ id: `${id}/1`, quantity: 'status' }], excluded: 12, ...extra });
const allPassed = () => {
  const rows = [];
  for (let p = 2; p <= 8; p++) for (const n of [64, 128, 256, 512]) for (const kind of ['origin', 'polar', 'generic']) rows.push(summary(`bulb/p${p}/n${n}/${kind}`, `bulb-${kind}`, true, { model: 'mandelbulb', power: p, cap: n }));
  for (const id of requiredStrata(QUATERNION_RECORD_ID).filter(id => id !== 'adversarial/points')) {
    const [, c, k, n] = /^\w+\/c(\d+)\/k(-?[\d.]+)\/n(\d+)$/.exec(id);
    rows.push(summary(id, id.startsWith('boundary') ? 'quaternion-boundary' : 'quaternion-generic', true, { model: 'quaternion-julia', C: [Number(c), 0, 0, 0], kappa: Number(k), cap: Number(n) }));
  }
  rows.push(summary('adversarial/points', 'adversarial-point', true, { cases: [{ id: 'bulb-origin', model: 'mandelbulb', power: 8, passed: true }, { id: 'zero-sensitivity', model: 'quaternion-julia', passed: true }] }));
  return rows;
};
const hashes = { kernelVersion: 'space-fields-v1', 'fields.wgsl': 'a'.repeat(64), 'points.wgsl': 'b'.repeat(64), 'fields+points': 'c'.repeat(64) };

test('Validation records are registered only for passed mandatory strata', () => {
  const { records, withheld } = buildArithmeticRecords({ results: allPassed(), implementationHashes: hashes });
  assert.deepEqual(records.map(r => r.recordId), ARITHMETIC_RECORD_IDS);
  assert.deepEqual(withheld, []);
  const registry = createValidationRegistry();
  for (const record of records) {
    assert.equal(record.evidenceClass, 'arithmetic'); assert.equal(record.matrixHash, MATRIX_PINS.matrixSha256);
    assert.deepEqual(record.limitations, PRECISION_CARRY_FORWARD_LIMITATIONS); assert.deepEqual(record.inconclusive, []);
    assert.deepEqual(record.implementationHashes, hashes);
    registry.register(record);
  }
  const query = power => ({ modelId: 'mandelbulb', evidenceClass: 'arithmetic', implementationHashes: hashes, profile: 'surface-v1', effective: { power }, sampling: { maxIterations: 128 }, domain: records[0].testedDomain });
  assert.equal(registry.lookup(query(8))?.recordId, 'mandelbulb@1/arithmetic/p8/matrix-rev4.8');
  assert.equal(registry.lookup({ ...query(8), evidenceClass: 'tracing' }), null, 'arithmetic evidence never matches tracing');
  assert.equal(registry.lookup({ ...query(8), sampling: { maxIterations: 100 } }), null, 'untested budgets do not match');

  const failed = allPassed(); failed[failed.findIndex(r => r.id === 'bulb/p7/n512/generic')] = summary('bulb/p7/n512/generic', 'bulb-generic', false, { model: 'mandelbulb', power: 7, cap: 512 });
  const partial = buildArithmeticRecords({ results: failed, implementationHashes: hashes });
  assert.ok(!partial.records.some(r => r.recordId === 'mandelbulb@1/arithmetic/p7/matrix-rev4.8'));
  assert.deepEqual(partial.withheld.map(w => [w.recordId, w.failing]), [['mandelbulb@1/arithmetic/p7/matrix-rev4.8', ['bulb/p7/n512/generic']]]);
  const inconclusive = allPassed(); inconclusive.find(r => r.kind === 'quaternion-boundary').state = 'inconclusive';
  assert.ok(!buildArithmeticRecords({ results: inconclusive, implementationHashes: hashes }).records.some(r => r.modelId === 'quaternion-julia'));
  const adversarial = allPassed(); adversarial.at(-1).cases[1].passed = false; adversarial.at(-1).passed = false; adversarial.at(-1).state = 'failed';
  const blocked = buildArithmeticRecords({ results: adversarial, implementationHashes: hashes });
  assert.deepEqual(blocked.records, [], 'a failed mandatory adversarial stratum withholds every record');
  const missing = allPassed().filter(r => r.id !== 'bulb/p3/n64/polar');
  assert.ok(!buildArithmeticRecords({ results: missing, implementationHashes: hashes }).records.some(r => r.recordId === 'mandelbulb@1/arithmetic/p3/matrix-rev4.8'), 'a missing stratum is never treated as passed');
  assert.throws(() => buildArithmeticRecords({ results: [{ ...allPassed()[0], role: 'diagnostic' }], implementationHashes: hashes }), /mandatory/);
});

test('the complex-power bulb map equals the spec formula, keeps the axis exact and survives underflowing normalization', async () => {
  const { bulbMapTrig, bulbMapComplex } = await import('../support/space-numerics.mjs');
  const grid = Array.from({ length: 7 }, (_, i) => -0.9 + 1.8 * (i + 0.5) / 7);
  for (let p = 2; p <= 8; p++) {
    for (const x of grid) for (const y of grid) for (const z of grid) {
      const a = bulbMapComplex([x, y, z], p), b = bulbMapTrig([x, y, z], p), scale = Math.hypot(x, y, z) ** p;
      a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) <= 1e-12 * scale, `p${p} (${x}, ${y}, ${z}) component ${k}`));
    }
    for (const z of [0.5, -0.5, 1, -1]) assert.deepEqual(bulbMapComplex([0, 0, z], p), [0, 0, z ** p]);
    const tiny = bulbMapComplex([2 ** -600, 2 ** -600, 0.5], p);
    assert.ok(tiny.every(Number.isFinite));
    assert.ok(Math.abs(tiny[0]) + Math.abs(tiny[1]) > 0 || p % 4 === 2, `p${p}: the transverse components are not lost to underflow`);
  }
});
