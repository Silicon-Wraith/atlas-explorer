// B11b: identity-, pixel- and sample-indexed outcome masks (plan rev 5.0 B11b "Files/interfaces/tests").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutcomeMasks, OUTCOME_BITS, maskMetrics, reasonMetrics } from '../../src/space/render/outcome-masks.js';
import { packStatus, packLightingStatus } from '../../src/space/render/status.js';

const B = OUTCOME_BITS;
const HIT = packStatus({ status: 0, reason: 0, subreason: 0, steps: 3 }), MISS = packStatus({ status: 1, reason: 0, subreason: 0, steps: 3 });
const UNRESOLVED = packStatus({ status: 2, reason: 3, subreason: 0, steps: 512 }), FAILED = packStatus({ status: 3, reason: 0, subreason: 0, steps: 1 });
const AO_UNRESOLVED = packLightingStatus({ shadow: null, ao: { status: 2, reason: 1, subreason: 0 } });
const SHADOW_UNRESOLVED = packLightingStatus({ shadow: { status: 2, reason: 3, subreason: 0 }, ao: null });
const AO_FAILED = packLightingStatus({ shadow: null, ao: { status: 3, reason: 0, subreason: 0 } });
const u32 = values => new Uint8Array(Uint32Array.from(values).buffer);
const normals = flags => { const h = new Uint16Array(flags.length * 4); flags.forEach((f, i) => { h[4 * i + 2] = 0x3c00; h[4 * i + 3] = f ? 0x3c00 : 0; }); return new Uint8Array(h.buffer); };
const full = n => ({ x: 0, y: 0, width: n, height: 1 });
const identity = (sample, accumulationKey = 'acc-A') => ({ accumulationKey, sample });
function sample(masks, id, { status, normal, lighting }) {
  const n = status.length;
  masks.record(id, 'status', full(n), u32(status));
  masks.record(id, 'normal', full(n), normals(normal));
  masks.record(id, 'lightingStatus', full(n), u32(lighting ?? Array(n).fill(0)));
  return masks.end(id);
}

test('outcome masks count unavailable normals over hits only and lighting failures per sample', () => {
  const masks = createOutcomeMasks({ width: 6, height: 1 });
  const s = sample(masks, identity(0), { status: [HIT, MISS, HIT, UNRESOLVED, FAILED, HIT], normal: [false, false, true, false, false, true], lighting: [0, 0, AO_UNRESOLVED, 0, 0, AO_FAILED] });
  assert.deepEqual(s, { sample: 0, pixels: 6, hits: 3, nonMiss: 5, primaryUnresolved: 1, numericalFailures: 2, unavailableNormals: 1, lightingUnresolved: 1, shadowUnresolved: 0, aoUnresolved: 1, lightingNumericalFailures: 1 });
});

test('outcome-mask unions are pixelwise over the same samples, mixing hits and misses and isolated failures', () => {
  const masks = createOutcomeMasks({ width: 4, height: 1 });
  // Pixel 0: hit in sample 0, miss in sample 1 (an antialiased edge). Pixel 1: misses only. Pixel 2: an isolated AO
  // failure in sample 1 only. Pixel 3: an unavailable normal in sample 0 only, and a shadow failure in sample 1.
  sample(masks, identity(0), { status: [HIT, MISS, HIT, HIT], normal: [true, false, true, false] });
  sample(masks, identity(1), { status: [MISS, MISS, HIT, HIT], normal: [false, false, true, true], lighting: [0, 0, AO_UNRESOLVED, SHADOW_UNRESOLVED] });
  const snapshot = masks.snapshot();
  assert.equal(snapshot.accumulationKey, 'acc-A');
  assert.deepEqual(snapshot.samples.map(s => [s.hits, s.unavailableNormals, s.lightingUnresolved]), [[3, 1, 0], [2, 0, 2]]);
  assert.deepEqual(snapshot.union, { samples: 2, pixels: 4, hits: 3, nonMiss: 3, primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 1, lightingUnresolved: 2, shadowUnresolved: 1, aoUnresolved: 1, lightingNumericalFailures: 0 });
  const bits = masks.unionBits();
  assert.equal(bits[0], B.hit | B.miss); assert.equal(bits[1], B.miss);
  assert.equal(bits[2], B.hit | B.aoUnresolved); assert.equal(bits[3], B.hit | B.normalUnavailable | B.shadowUnresolved);
  assert.deepEqual(maskMetrics(bits, 2), snapshot.union, 'the metrics are a pure function of the union bits');
});

test('outcome masks accept tiles in any order within a sample and refuse an incomplete or misordered sample', () => {
  const masks = createOutcomeMasks({ width: 2, height: 2 });
  const id = identity(0), tile = (y, values) => ({ region: { x: 0, y, width: 2, height: 1 }, values });
  for (const field of ['lightingStatus', 'normal', 'status']) for (const { region, values } of [tile(1, [HIT, MISS]), tile(0, [HIT, HIT])]) {
    masks.record(id, field, region, field === 'status' ? u32(values) : field === 'normal' ? normals([true, false]) : u32([0, 0]));
  }
  assert.equal(masks.end(id).hits, 3);
  assert.throws(() => masks.end(identity(1)), /incomplete/);
  const partial = createOutcomeMasks({ width: 2, height: 2 });
  partial.record(identity(0), 'status', { x: 0, y: 0, width: 2, height: 1 }, u32([HIT, HIT]));
  assert.throws(() => partial.end(identity(0)), /incomplete/);
  assert.throws(() => partial.record(identity(0), 'status', { x: 1, y: 1, width: 2, height: 1 }, u32([HIT, HIT])), /outside/);
  assert.throws(() => partial.record(identity(0), 'status', full(2), u32([HIT])), /bytes/);
});

test('a new accumulation identity or sample zero resets the union, and a stale identity is refused', () => {
  const masks = createOutcomeMasks({ width: 2, height: 1 });
  sample(masks, identity(0, 'direct'), { status: [HIT, HIT], normal: [false, false] });
  assert.equal(masks.snapshot().union.unavailableNormals, 2);
  // The full-light accumulation starts again at sample 0: nothing of the direct identity survives.
  sample(masks, identity(0, 'full'), { status: [HIT, MISS], normal: [true, false] });
  assert.deepEqual([masks.snapshot().accumulationKey, masks.snapshot().union.unavailableNormals, masks.snapshot().samples.length], ['full', 0, 1]);
  // A readback for another identity, a skipped sample or a repeated sample never enters the union.
  assert.throws(() => masks.record(identity(1, 'direct'), 'status', full(2), u32([HIT, HIT])), /stale/);
  assert.throws(() => masks.record(identity(2, 'full'), 'status', full(2), u32([HIT, HIT])), /order/);
  assert.throws(() => masks.record(identity(0, 'full'), 'status', full(2), u32([HIT, HIT])), /order/);
  sample(masks, identity(1, 'full'), { status: [HIT, HIT], normal: [true, true] });
  assert.equal(masks.snapshot().union.hits, 2);
  // Reset: an explicit reset forgets everything.
  masks.reset();
  assert.equal(masks.snapshot(), null);
});

test('outcome masks keep reason and subreason bits per pixel class, per sample and in the union', () => {
  const masks = createOutcomeMasks({ width: 4, height: 1 });
  const POINT = packStatus({ status: 2, reason: 1, subreason: 0, steps: 2 }), STAGNANT = packStatus({ status: 2, reason: 4, subreason: 2, steps: 9 });
  const AO_ESTIMATE = packLightingStatus({ shadow: null, ao: { status: 2, reason: 2, subreason: 0 } });
  const BOTH = packLightingStatus({ shadow: { status: 2, reason: 4, subreason: 1 }, ao: { status: 2, reason: 1, subreason: 0 } });
  // Sample 0: pixel 0 point-budget primary; pixel 1 AO point-budget; pixel 2 shadow step-cap; pixel 3 a numerical AO
  // failure (no reason). Sample 1: pixel 0 stagnation (field coordinate); pixel 1 AO estimate-unavailable; pixel 2
  // shadow stagnation (ray parameter) and AO point-budget.
  sample(masks, identity(0), { status: [POINT, HIT, HIT, HIT], normal: [false, true, true, true], lighting: [0, AO_UNRESOLVED, SHADOW_UNRESOLVED, AO_FAILED] });
  sample(masks, identity(1), { status: [STAGNANT, HIT, HIT, HIT], normal: [false, true, true, true], lighting: [0, AO_ESTIMATE, BOTH, 0] });
  const zero = { 'point-budget': 0, 'estimate-unavailable': 0, 'ray-step-budget': 0, 'stagnation/ray-parameter': 0, 'stagnation/field-coordinate': 0, unspecified: 0, multiple: 0 };
  const { reasons } = masks.snapshot();
  assert.deepEqual(reasons.samples[0], { primaryUnresolved: { ...zero, 'point-budget': 1 }, shadowUnresolved: { ...zero, 'ray-step-budget': 1 }, aoUnresolved: { ...zero, 'point-budget': 1 } });
  assert.deepEqual(reasons.samples[1], { primaryUnresolved: { ...zero, 'stagnation/field-coordinate': 1 }, shadowUnresolved: { ...zero, 'stagnation/ray-parameter': 1 },
    aoUnresolved: { ...zero, 'point-budget': 1, 'estimate-unavailable': 1 } });
  // The union counts pixels per reason (a pixel failing for two reasons counts under both and under `multiple`).
  assert.deepEqual(reasons.union, { primaryUnresolved: { ...zero, 'point-budget': 1, 'stagnation/field-coordinate': 1, multiple: 1 },
    shadowUnresolved: { ...zero, 'ray-step-budget': 1, 'stagnation/ray-parameter': 1, multiple: 1 }, aoUnresolved: { ...zero, 'point-budget': 2, 'estimate-unavailable': 1, multiple: 1 } });
  assert.deepEqual(reasonMetrics(masks.unionReasons()), reasons.union, 'the union reasons are a pure function of the per-pixel reason bits');
});
