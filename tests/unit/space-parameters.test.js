import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SceneError } from '../../src/shared/scene.js';
import { MAX_PARAMETER_DIGITS, ANCHOR_LIMITS, parseAnchorDecimal, parseDecimal, compareDecimal, inRange, toDouble, toBinary32, effectiveParameters, escapeRadius, sliceIsEmpty, nextUp32, nextDown32 } from '../../src/space/numerics/parameters.js';
import { SUPPORTED_DOMAINS, inSupportedDomain, VALIDATION_RECORD_FIELDS, PRECISION_CARRY_FORWARD_LIMITATIONS, createValidationRegistry } from '../../src/space/numerics/validation-domains.js';

const sceneError = (code, path) => error => error instanceof SceneError && error.code === code && error.path === path;
const invalid = path => sceneError('invalid-value', path);

test('decimal strings are parsed exactly and bounded before any rounding', () => {
  assert.deepEqual(parseDecimal('-0.2', 'C[0]'), { sign: -1, digits: '2', exponent: -1 });
  for (const bad of ['1e401', '0.' + '1'.repeat(65), '0x10', '', ' 1', '1_000', 'NaN']) assert.throws(() => parseDecimal(bad, 'kappa'), e => e.code === 'invalid-value');
  assert.equal(inRange('4.0000000000000000000000001', '-4', '4'), false, 'exact on the decimal');
  assert.equal(inRange('4', '-4', '4'), true); assert.equal(compareDecimal('0.10', '0.1'), 0);
});

test('decimal grammar, significant-digit budget and explicit exponent limits are inclusive', () => {
  assert.equal(MAX_PARAMETER_DIGITS, 64);
  assert.deepEqual(parseDecimal('00012.300e+02'), { sign: 1, digits: '123', exponent: 1 });
  assert.deepEqual(parseDecimal('-000.000'), { sign: -1, digits: '0', exponent: 0 });
  assert.equal(parseDecimal('9'.repeat(64)).digits.length, 64);
  assert.equal(parseDecimal('0.' + '0'.repeat(1000) + '1').exponent, -1001);
  for (const text of ['1e400', '1e-400', '1e' + '0'.repeat(1000) + '400', '0'.repeat(1000)]) assert.doesNotThrow(() => parseDecimal(text));
  for (const text of ['9'.repeat(65), '1' + '0'.repeat(64), '1e-401', '1e' + '9'.repeat(1000), '+1', '.1', '1.', '1e', '1E+', '1\n', '--1', 'Infinity', 1, null]) {
    assert.throws(() => parseDecimal(text, 'test'), invalid('test'), String(text));
  }
});

test('decimal ordering is exact for signs, zeros, exponent shifts and both range edges', () => {
  for (const [a, b, expected] of [
    ['-0', '0e400', 0], ['1e-400', '0', 1], ['-1e-400', '0', -1],
    ['-12', '-11.99999999999999999999999', -1], ['99', '100', -1],
    ['10e-1', '1', 0], ['1.01', '1.001', 1], ['4.00000000000000000000001', '4', 1],
  ]) {
    assert.equal(compareDecimal(a, b), expected, `${a} versus ${b}`);
    assert.equal(compareDecimal(b, a), expected === 0 ? 0 : -expected);
  }
  for (const text of ['-4', '4', '-3.999999999999999999999999', '3.999999999999999999999999']) assert.equal(inRange(text, '-4', '4'), true);
  for (const text of ['-4.000000000000000000000001', '4.000000000000000000000001']) assert.equal(inRange(text, '-4', '4'), false);
  assert.equal(toDouble('0.800000000000000000000001'), 0.8);
});

test('binary32 conversions expose signed zero, ties and subnormal bit patterns', () => {
  for (const [text, expected] of [['-0', '80000000'], ['0', '00000000'], ['1', '3f800000'], ['-4', 'c0800000'], ['1.000000059604644775390625', '3f800000'], ['1e-45', '00000001'], ['-1e-400', '80000000']]) {
    assert.equal(toBinary32(text).bits, expected, text);
    assert.equal(toBinary32(text).requested, text);
  }
  assert.ok(Object.is(toBinary32('-0').value, -0));
});

test('effective parameter schemas preserve requests and reject invalid models, types and shapes', () => {
  for (let power = 2; power <= 8; power++) {
    const result = effectiveParameters('mandelbulb', { power: String(power) });
    assert.deepEqual(result.requested, { power: String(power) });
    assert.deepEqual(result.effective, { power });
    assert.equal(result.bits.power, toBinary32(String(power)).bits);
  }
  for (const depth of [1, 2]) assert.deepEqual(effectiveParameters('menger', { depth }), { requested: { depth }, effective: { depth }, bits: { depth: toBinary32(String(depth)).bits } });
  for (const id of ['sphere', 'box']) assert.deepEqual(effectiveParameters(id, {}), { requested: {}, effective: {}, bits: {} });
  for (const power of ['1', '9', '8.0', '8e0', '08', 8]) assert.throws(() => effectiveParameters('mandelbulb', { power }), invalid('parameters.power'));
  for (const depth of [0, 3, 1.5, '1']) assert.throws(() => effectiveParameters('menger', { depth }), invalid('parameters.depth'));
  for (const C of [[], ['0', '0', '0'], ['0', '0', '0', '0', '0'], [0, '0', '0', '0'], new Array(4)]) assert.throws(() => effectiveParameters('quaternion-julia', { C, kappa: '0' }), invalid(C.length === 4 ? 'parameters.C[0]' : 'parameters.C'));
  assert.throws(() => effectiveParameters('quaternion-julia', { C: ['0', '0', '0', '0'], kappa: '-4.00000000000000000001' }), invalid('parameters.kappa'));
  assert.throws(() => effectiveParameters('sphere', { radius: '1' }), error => error.code === 'unknown-field');
  assert.throws(() => effectiveParameters('mandelbulb', {}), error => error.code === 'missing-field');
  assert.throws(() => effectiveParameters('unknown', {}), error => error.code === 'unsupported-model');
  const parameters = { C: ['-0.200', '0.80', '0', '-0'], kappa: '00' };
  const result = effectiveParameters('quaternion-julia', parameters);
  parameters.C[0] = '4';
  assert.equal(result.requested.C[0], '-0.200', 'results own their request snapshot');
});

test('next binary32 neighbors handle signs, binade boundaries, subnormals and infinities', () => {
  const tiny = 2 ** -149, max = (2 - 2 ** -23) * 2 ** 127;
  assert.equal(nextUp32(0), tiny); assert.equal(nextUp32(-0), tiny);
  assert.equal(nextDown32(0), -tiny); assert.equal(nextDown32(-0), -tiny);
  assert.ok(Object.is(nextUp32(-tiny), -0)); assert.ok(Object.is(nextDown32(tiny), 0));
  assert.equal(nextUp32(1), 1 + 2 ** -23); assert.equal(nextDown32(1), 1 - 2 ** -24);
  assert.equal(nextUp32(-1), -1 + 2 ** -24); assert.equal(nextDown32(-1), -1 - 2 ** -23);
  assert.equal(nextUp32(max), Infinity); assert.equal(nextDown32(-max), -Infinity);
  assert.equal(nextDown32(Infinity), max); assert.equal(nextUp32(-Infinity), -max);
  assert.equal(nextUp32(Infinity), Infinity); assert.equal(nextDown32(-Infinity), -Infinity);
  assert.ok(Number.isNaN(nextUp32(NaN))); assert.ok(Number.isNaN(nextDown32(NaN)));
});

// Each finite f32 is exactly an integer multiple of 2^-149. For B >= 2,
// B >= R(C) iff (B^2 - B)^2 >= sum(C_i^2). This integer oracle needs
// neither a floating sqrt nor the production bound algorithm.
const f32Units = value => {
  const view = new DataView(new ArrayBuffer(4)); view.setFloat32(0, Math.abs(value));
  const word = view.getUint32(0), exponent = (word >>> 23) & 255, fraction = word & 0x7fffff;
  return exponent === 0 ? BigInt(fraction) : BigInt(fraction | 0x800000) << BigInt(exponent - 1);
};

test('outward escape bounds dominate the real radius by an exact integer oracle', () => {
  const unit = 1n << 149n;
  const cases = [[0, 0, 0, 0], [2 ** -149, 0, 0, 0], [2, 0, 0, 0], [nextUp32(2), 0, 0, 0]];
  for (let corner = 0; corner < 16; corner++) cases.push(Array.from({ length: 4 }, (_, i) => corner & (1 << i) ? 4 : -4));
  let seed = 0x12345678;
  for (let i = 0; i < 512; i++) cases.push(Array.from({ length: 4 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.fround(seed / 2 ** 32 * 8 - 4);
  }));
  for (const C of cases) {
    const { value, bound } = escapeRadius(C), b = f32Units(bound);
    const normSquared = C.reduce((sum, c) => sum + f32Units(c) ** 2n, 0n);
    assert.equal(value, Math.fround(value)); assert.equal(bound, Math.fround(bound));
    assert.ok(bound >= 2 && bound < 3.3723);
    assert.ok((b * b - b * unit) ** 2n >= normSquared * unit * unit, JSON.stringify(C));
    assert.equal(sliceIsEmpty(4, bound), true); assert.equal(sliceIsEmpty(-4, bound), true);
    assert.equal(sliceIsEmpty(bound, bound), false);
    assert.equal(sliceIsEmpty(nextUp32(bound), bound), true);
  }
});

test('supported ranges are independent of validation coverage and report violation paths', () => {
  assert.deepEqual(Object.keys(SUPPORTED_DOMAINS).sort(), ['box', 'mandelbulb', 'menger', 'quaternion-julia', 'sphere']);
  for (const [id, parameters] of [['sphere', {}], ['box', {}], ['menger', { depth: 2 }], ['mandelbulb', { power: '7' }], ['quaternion-julia', { C: ['-4', '4', '0', '0'], kappa: '4' }]]) assert.deepEqual(inSupportedDomain(id, parameters), { ok: true, violations: [] });
  const result = inSupportedDomain('quaternion-julia', { C: ['0', '-4.000000000000001', '0', '0'], kappa: '0' });
  assert.equal(result.ok, false); assert.equal(result.violations[0].path, 'parameters.C[1]'); assert.equal(typeof result.violations[0].reason, 'string');
  assert.equal(inSupportedDomain('unknown', {}).ok, false);
  assert.deepEqual(createValidationRegistry().list(), [], 'supported inputs acquire no historical or product evidence');
});

function validationRecord() {
  return { recordId: 'q-arithmetic', modelId: 'quaternion-julia', evidenceClass: 'arithmetic', implementationHashes: { kernel: 'sha256:aaa' }, referenceHashes: { reference: 'sha256:bbb', generator: 'sha256:ccc' }, matrixHash: 'sha256:ddd', profile: 'surface-v1', testedParameters: { C: [[0, 0, 0, 0], [1, 0, 0, 0]], kappa: [0] }, testedSamplingConditions: { maxIterations: [64, 128], heights: [720] }, testedDomain: { points: 'named-set' }, coverage: { eligible: 12 }, inconclusive: [], limitations: ['historical limitation retained verbatim'] };
}

test('registry matching is closed over all hashes, parameters, sampling and domain fields', () => {
  const registry = createValidationRegistry(), record = validationRecord(); registry.register(record);
  const query = { modelId: record.modelId, evidenceClass: record.evidenceClass, implementationHashes: record.implementationHashes, profile: record.profile, effective: { C: [0, 0, 0, 0], kappa: 0 }, sampling: { maxIterations: 128, height: 720 }, domain: { points: 'named-set' } };
  assert.equal(registry.lookup(query).recordId, record.recordId);
  for (const patch of [
    { modelId: 'mandelbulb' }, { evidenceClass: 'tracing' }, { profile: 'ladder-v1' },
    { implementationHashes: {} }, { implementationHashes: { ...record.implementationHashes, extra: 'sha256:eee' } },
    { effective: { C: [0, 1, 0, 0], kappa: 0 } }, { effective: { C: [0, 0, 0, 0] } },
    { effective: { ...query.effective, extra: 1 } }, { sampling: { height: 720 } },
    { sampling: { ...query.sampling, targetSamples: 8 } }, { sampling: { maxIterations: 96, height: 720 } },
    { domain: {} }, { domain: null }, { domain: { ...query.domain, anchor: 'elsewhere' } },
  ]) assert.equal(registry.lookup({ ...query, ...patch }), null, JSON.stringify(patch));
  assert.equal(registry.lookup({ ...query, effective: { C: [1, 0, 0, 0], kappa: 0 } }).recordId, record.recordId);
  assert.equal(registry.lookup({}), null);
});

test('registered records are validated, copied, frozen and retain their evidence metadata', () => {
  const registry = createValidationRegistry(), input = validationRecord();
  assert.deepEqual(Object.keys(input).sort(), [...VALIDATION_RECORD_FIELDS].sort());
  registry.register(input); input.testedParameters.C[0][0] = 4; input.limitations[0] = 'changed';
  const listed = registry.list();
  assert.equal(listed[0].testedParameters.C[0][0], 0);
  assert.equal(listed[0].limitations[0], 'historical limitation retained verbatim');
  assert.ok(Object.isFrozen(listed[0].testedParameters.C[0]));
  assert.throws(() => { listed[0].profile = 'other'; }, TypeError);
  assert.throws(() => registry.register(validationRecord()), /recordId/);
  for (const field of VALIDATION_RECORD_FIELDS) {
    const record = validationRecord(); delete record[field];
    assert.throws(() => createValidationRegistry().register(record), sceneError('missing-field', 'record'), field);
  }
  for (const [patch, path, code = 'invalid-value'] of [[{ evidenceClass: 'historical' }, 'evidenceClass'], [{ implementationHashes: {} }, 'implementationHashes'], [{ referenceHashes: {} }, 'referenceHashes'], [{ matrixHash: '' }, 'matrixHash'], [{ testedDomain: {} }, 'testedDomain'], [{ testedParameters: { C: [] } }, 'testedParameters.C'], [{ extra: true }, 'record', 'unknown-field']]) assert.throws(() => createValidationRegistry().register({ ...validationRecord(), ...patch }), sceneError(code, path));
});

test('anchor parsing bounds explicit exponents and normalized leading positions independently', { timeout: 1000 }, () => {
  assert.deepEqual(ANCHOR_LIMITS, { digits: 400, exponent: [-400, 400] });
  assert.deepEqual(parseAnchorDecimal('00012.300e+02'), { sign: 1, digits: '123', exponent: 1 });
  assert.deepEqual(parseAnchorDecimal('-000.000'), { sign: -1, digits: '0', exponent: 0 });
  for (const [text, k] of [
    ['1e400', 400], ['1e-400', -400], ['0001', 0], ['00010e399', 400],
    ['0.' + '0'.repeat(399) + '1', -400],
    ['0.' + '0'.repeat(799) + '1e400', -400],
    ['0.' + '0'.repeat(399) + '1'.repeat(400), -400],
    ['0'.repeat(100_000) + '10e399', 400],
  ]) {
    const parsed = parseAnchorDecimal(text);
    assert.ok(parsed, 'anchor parser returns normalized decimal parts');
    assert.equal(parsed.digits.length + parsed.exponent - 1, k);
  }
  assert.equal(parseAnchorDecimal('0.' + '0'.repeat(399) + '1'.repeat(400)).exponent, -799);
  assert.doesNotThrow(() => parseAnchorDecimal('0.' + '0'.repeat(100_000)), 'zero bypasses only the leading-position check');
  for (const text of ['1e401', '1e-401', '0e401', '10e400', '00010e400',
    '0.' + '0'.repeat(400) + '1', '0.' + '0'.repeat(800) + '1e400',
    '1e99999999999999999999', '0.' + '0'.repeat(100_000) + '1', '1'.repeat(401),
    '+1', '.1', '1.', '1\n', null]) assert.throws(() => parseAnchorDecimal(text, 'camera.anchor[0]'), invalid('camera.anchor[0]'));
});

test('conversion helpers reject invalid text and overflow while preserving underflow bits', () => {
  for (const convert of [toDouble, toBinary32]) {
    for (const text of ['abc', '0x10', ' 1', '+1', '1.', '1'.repeat(65), '1e400', '-1e400']) assert.throws(() => convert(text), invalid(''));
  }
  for (const text of ['3.5e38', '-3.5e38']) {
    assert.ok(Number.isFinite(toDouble(text)));
    assert.throws(() => toBinary32(text), invalid(''));
  }
  assert.equal(toBinary32('-1e-400').bits, '80000000');
  assert.equal(toBinary32('1e-45').bits, '00000001');
});

test('binary32 requests use the defined double rounding even above an exact midpoint', () => {
  const text = '1.000000059604644776257986737988403547205962240695953369140625';
  const denominator = 10n ** BigInt(text.split('.')[1].length), numerator = BigInt(text.replace('.', ''));
  assert.ok(numerator * (1n << 24n) > ((1n << 24n) + 1n) * denominator, 'exact decimal is above the f32 midpoint');
  assert.equal(toBinary32(text).double, 1 + 2 ** -24, 'binary64 rounds onto the midpoint');
  assert.equal(toBinary32(text).bits, '3f800000', 'the second conversion ties to even, rather than direct decimal-to-f32 rounding');
});

test('escape radius rejects malformed, non-binary32 and unsupported components with paths', () => {
  for (const input of [null, [], [0, 0, 0]]) assert.throws(() => escapeRadius(input), invalid('effectiveC'));
  for (const c of [0.1, 5, -5, Infinity, NaN, '0']) assert.throws(() => escapeRadius([c, 0, 0, 0]), invalid('effectiveC[0]'));
  assert.throws(() => escapeRadius([0, 0, 0, 5]), invalid('effectiveC[3]'));
});

test('escape radius pins two outward steps at every operation by the corner bit patterns', () => {
  const { value, bound } = escapeRadius([4, 4, 4, 4]);
  assert.equal(toBinary32(String(value)).bits, '4057d375');
  assert.equal(toBinary32(String(bound)).bits, '4057d381');
});

test('supported domain metadata distinguishes discrete sets from inclusive decimal intervals', () => {
  assert.deepEqual(SUPPORTED_DOMAINS.mandelbulb.power, { kind: 'set', values: ['2', '3', '4', '5', '6', '7', '8'] });
  assert.deepEqual(SUPPORTED_DOMAINS.menger.depth, { kind: 'set', values: [1, 2] });
  const interval = { kind: 'interval', min: '-4', max: '4' };
  assert.deepEqual(SUPPORTED_DOMAINS['quaternion-julia'], { C: [interval, interval, interval, interval], kappa: interval });
  assert.ok(Object.isFrozen(SUPPORTED_DOMAINS['quaternion-julia'].C[0]));
  for (const [id, key] of [['mandelbulb', 'power'], ['menger', 'depth']]) {
    for (const value of SUPPORTED_DOMAINS[id][key].values) assert.equal(inSupportedDomain(id, { [key]: value }).ok, true);
  }
  for (const text of ['-4.000000000000001', '-4', '0', '4', '4.000000000000001']) {
    const expected = inRange(text, interval.min, interval.max);
    for (let index = 0; index < 4; index++) {
      const C = ['0', '0', '0', '0']; C[index] = text;
      assert.equal(inSupportedDomain('quaternion-julia', { C, kappa: '0' }).ok, expected);
    }
    assert.equal(inSupportedDomain('quaternion-julia', { C: ['0', '0', '0', '0'], kappa: text }).ok, expected);
  }
});

const queryFor = record => ({ modelId: record.modelId, evidenceClass: record.evidenceClass, implementationHashes: record.implementationHashes, profile: record.profile,
  effective: { C: [0, 0, 0, 0], kappa: 0 }, sampling: { maxIterations: 128, height: 720 }, domain: record.testedDomain });

test('non-aliased domain arrays identify an exact input set rather than its members', () => {
  const record = { ...validationRecord(), testedDomain: { points: ['a', 'b'] } };
  const registry = createValidationRegistry(); registry.register(record);
  assert.equal(registry.lookup(queryFor(record))?.recordId, record.recordId);
  for (const points of ['a', ['a'], ['b', 'a']]) assert.equal(registry.lookup({ ...queryFor(record), domain: { points } }), null);
});

test('registry rejects ambiguous aliases, unsupported models and malformed evidence metadata', () => {
  for (const [patch, path] of [
    [{ testedSamplingConditions: { heights: [720], height: [720] } }, 'testedSamplingConditions'],
    [{ testedDomain: { distances: [0.1], distance: 0.1 } }, 'testedDomain'],
    [{ modelId: 'unknown' }, 'modelId'], [{ limitations: [0] }, 'limitations'],
    [{ limitations: 'text' }, 'limitations'], [{ inconclusive: {} }, 'inconclusive'],
  ]) assert.throws(() => createValidationRegistry().register({ ...validationRecord(), ...patch }), invalid(path));
});

test('precision carry-forward limitations are frozen verbatim from the binding plan paragraph', async () => {
  const plan = await readFile(new URL('../../docs/superpowers/plans/2026-10-20-project1b1-render-and-recover-plan.md', import.meta.url), 'utf8');
  const paragraph = plan.split('## Precision carry-forward (binding)\n\n')[1].split('Every 1b.1 validation record')[0].replace(/\s+/g, ' ').trim();
  assert.equal(PRECISION_CARRY_FORWARD_LIMITATIONS.join(' '), paragraph);
  assert.equal(PRECISION_CARRY_FORWARD_LIMITATIONS.length, 5);
  assert.ok(Object.isFrozen(PRECISION_CARRY_FORWARD_LIMITATIONS));
});

test('signed zero has distinct effective bits but canonical registry equality', () => {
  const parameters = { C: ['0', '0', '0', '0'], kappa: '-0' };
  const negative = effectiveParameters('quaternion-julia', parameters);
  const positive = effectiveParameters('quaternion-julia', { ...parameters, kappa: '0' });
  assert.equal(negative.bits.kappa, '80000000'); assert.equal(positive.bits.kappa, '00000000');
  assert.ok(Object.is(negative.effective.kappa, -0));
  const record = validationRecord(), registry = createValidationRegistry(); registry.register(record);
  assert.equal(registry.lookup({ ...queryFor(record), effective: negative.effective })?.recordId, record.recordId);
});
test('effective binary32 values carry their bit patterns beside the requested strings', () => {
  const e = toBinary32('0.8');
  assert.deepEqual(e, { requested: '0.8', double: 0.8, value: Math.fround(0.8), bits: '3f4ccccd' });
  const q = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '0' });
  assert.deepEqual(q.requested.C, ['-0.2', '0.8', '0', '0']);
  assert.deepEqual(q.effective.C, [-0.2, 0.8, 0, 0].map(Math.fround)); assert.equal(q.bits.C[1], '3f4ccccd');
});
test('R(C) is computed from the effective C with outward rounding, and the default gives 2', () => {
  const r = escapeRadius([Math.fround(-0.2), Math.fround(0.8), 0, 0]);
  assert.equal(r.value, 2); assert.ok(r.bound >= 2 && r.bound < 2.00001);
  const big = escapeRadius([4, 4, 4, 4]);                       // ‖C‖ = 8 → (1 + √33)/2 ≈ 3.3722813
  assert.ok(big.bound > big.value && big.bound < 3.3723 && big.bound > 3.3722);
  assert.equal(sliceIsEmpty(4, big.bound), true, 'κ = ±4 is always an empty slice in the supported box');
  assert.equal(sliceIsEmpty(2, 2), false, 'strict comparison'); assert.equal(sliceIsEmpty(2.5, 2), true);
});
test('a validation lookup matches only the evidence class and domain it was recorded for', () => {
  const registry = createValidationRegistry();
  const hashes = { kernel: 'sha256:aaa', tracing: 'sha256:bbb' };
  const base = { modelId: 'mandelbulb', implementationHashes: hashes, referenceHashes: { generator: 'sha256:ccc' }, matrixHash: 'sha256:ddd', profile: 'surface-v1', testedParameters: { power: [8] }, testedSamplingConditions: { maxIterations: [64, 128], heights: [720] }, coverage: {}, inconclusive: [], limitations: [] };
  registry.register({ ...base, recordId: 'bulb-p8-arith', evidenceClass: 'arithmetic', testedDomain: { points: 'grid-8-1.2' } });
  registry.register({ ...base, recordId: 'bulb-p8-geo', evidenceClass: 'geometric', testedDomain: { anchor: 'A1', distances: [0.1, 0.01] } });
  registry.register({ ...base, recordId: 'bulb-p8-trace', evidenceClass: 'tracing', testedDomain: { rays: 'adversarial-v1' } });
  const sampling = { maxIterations: 128, height: 720 };
  const arith = (extra = {}) => ({ modelId: 'mandelbulb', evidenceClass: 'arithmetic', implementationHashes: hashes, profile: 'surface-v1', effective: { power: 8 }, sampling, domain: { points: 'grid-8-1.2' }, ...extra });
  assert.ok(registry.lookup(arith()));
  assert.equal(registry.lookup(arith({ effective: { power: 7 } })), null);
  assert.equal(registry.lookup(arith({ implementationHashes: { ...hashes, kernel: 'sha256:zzz' } })), null, 'a changed implementation has no record');
  assert.equal(registry.lookup(arith({ sampling: { ...sampling, maxIterations: 256 } })), null);
  assert.equal(registry.lookup(arith({ domain: { points: 'grid-16-1.2' } })), null, 'another point set is not covered');
  assert.equal(registry.lookup(arith({ domain: undefined })), null, 'an omitted domain never matches');
  assert.equal(registry.lookup({ ...arith(), evidenceClass: 'tracing', domain: { rays: 'overview-v1' } }), null, 'another tracing domain is not covered');
  assert.equal(registry.list().length, 3, 'list shows historical records without claiming applicability');
  assert.ok(registry.lookup({ modelId: 'mandelbulb', evidenceClass: 'geometric', implementationHashes: hashes, profile: 'surface-v1', effective: { power: 8 }, sampling, domain: { anchor: 'A1', distance: 0.1 } }));
  assert.equal(registry.lookup({ modelId: 'mandelbulb', evidenceClass: 'geometric', implementationHashes: hashes, profile: 'surface-v1', effective: { power: 8 }, sampling, domain: { anchor: 'A2', distance: 0.1 } }), null, 'another camera patch is not covered');
});
