import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECENTRE_BOUND_LOG2, anchorAdd, recentre, encodeOrdinaryOrigin, basis, rayDirection,
  angularPixelSize, orbit, pan, dolly, lookAt, setOrientation, resetOrientation,
  overview, equalCameras, flightStep, reconstructHit, toLocal,
} from '../../src/space/camera.js';
import { SPACE_DEFAULTS, CAMERA_LIMITS, createSpaceScene, encodeSceneFile, decodeSceneFile } from '../../src/space/scene-adapter.js';
import { parseAnchorDecimal, effectiveParameters } from '../../src/space/numerics/parameters.js';
import { getModel } from '../../src/space/models/registry.js';
import { SceneError, deepFreeze, canonicalJson } from '../../src/shared/scene.js';
import { boundaryViolations } from '../support/import-boundary.mjs';

const camera = patch => ({ ...structuredClone(SPACE_DEFAULTS.camera), ...patch });
const A = ['0.6570552405982646', '-0.49279143044869844', '0.23955138980145063'];
const limit = { unchanged: true, reason: 'precision-limit' };
const unavailable = { unavailable: true, reason: 'precision-limit' };
const refused = (camera, detail) => ({ camera, ...limit, recentred: false, detail });
const norm = v => Math.hypot(...v);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const unit = v => v.map(x => x / norm(v));
const near = (a, b, tolerance = 2e-14) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} (bound ${tolerance})`);
const nearVector = (a, b, tolerance) => a.forEach((x, i) => near(x, b[i], tolerance));
const valid = c => createSpaceScene({ model: 'sphere', camera: c }).camera;
const invalid = fn => assert.throws(fn, e => e instanceof SceneError && e.code === 'invalid-value');

// Independent rational oracle: binary64 is decoded from its bits, decimal anchors
// from the shared admission parser. No production arithmetic or reference imports.
const abs = x => x < 0n ? -x : x;
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function Q(n, d = 1n) {
  const g = gcd(abs(n), d);
  return { n: n / g, d: d / g };
}
const add = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
const neg = a => ({ n: -a.n, d: a.d });
const diff = (a, b) => add(a, neg(b));
const mul = (a, b) => Q(a.n * b.n, a.d * b.d);
const magnitude = a => ({ n: abs(a.n), d: a.d });
const le = (a, b) => a.n * b.d <= b.n * a.d;
const pow2 = e => e < 0 ? Q(1n, 1n << BigInt(-e)) : Q(1n << BigInt(e));
function numberQ(x) {
  assert.ok(Number.isFinite(x));
  const bytes = new DataView(new ArrayBuffer(8)); bytes.setFloat64(0, x);
  const bits = bytes.getBigUint64(0), exponent = Number((bits >> 52n) & 2047n);
  const n = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  return mul(Q(bits >> 63n ? -n : n), pow2(exponent ? exponent - 1075 : -1074));
}
function decimalQ(text) {
  const { sign, digits, exponent } = parseAnchorDecimal(text);
  return exponent < 0 ? Q(BigInt(sign) * BigInt(digits), 10n ** BigInt(-exponent))
    : Q(BigInt(sign) * BigInt(digits) * 10n ** BigInt(exponent));
}
const scaleQ = c => mul(numberQ(c.scale.mantissa), pow2(c.scale.exponent));
const world = (c, field = 'positionLocal') => c.anchor.map((a, i) => add(decimalQ(a), mul(scaleQ(c), numberQ(c[field][i]))));
const l1 = values => values.reduce((s, x) => add(s, magnitude(x)), Q(0n));
const error = (a, b) => l1(a.map((x, i) => diff(x, b[i])));
function checkRecentre(before, result) {
  assert.ok(result && result.camera && !result.unchanged, 'recentre must return a rebased camera');
  assert.equal(result.recentred, true);
  const total = add(error(world(before), world(result.camera)), error(world(before, 'focusLocal'), world(result.camera, 'focusLocal')));
  assert.ok(le(total, mul(scaleQ(before), pow2(-40))), 'aggregate position plus focus error is bounded exactly');
  assert.equal(result.exact, total.n === 0n);
  if (total.n) {
    assert.ok(le(total, pow2(result.driftBoundLog2)), 'reported drift bound encloses the exact error');
    assert.ok(!le(total, pow2(result.driftBoundLog2 - 1)), 'reported bound is the least enclosing power of two');
  } else assert.equal(result.driftBoundLog2, null);
  assert.ok(norm(result.camera.positionLocal) <= 1024);
  valid(result.camera);
  return total;
}
function eulerQ(x, y, z) {
  const [cx, cy, cz] = [x, y, z].map(a => Math.cos(a / 2));
  const [sx, sy, sz] = [x, y, z].map(a => Math.sin(a / 2));
  return [cx * cy * cz + sx * sy * sz, sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz];
}
function eulerOf(c) {
  const { right: r, up: u, forward: f } = basis(c);
  return [Math.atan2(u[2], -f[2]), Math.asin(-r[2]), Math.atan2(r[1], r[0])];
}
function upright(c) {
  const b = basis(c);
  near(b.right[2], 0); assert.ok(b.up[2] > 0);
  near(norm(b.forward), 1); near(dot(b.right, b.forward), 0);
  return b;
}

test('anchor arithmetic preserves the represented point within the recentre bound', () => {
  const c = camera({ anchor: A, scale: { mantissa: 1, exponent: -20 }, positionLocal: [3000, 0, 0] });
  assert.equal(RECENTRE_BOUND_LOG2, -40);
  const result = recentre(c);
  assert.ok(result?.camera, 'recentre must implement the anchored camera result');
  assert.equal(checkRecentre(c, result).n, 0n);
  assert.equal(result.driftBoundLog2, null);
});

test('recentring beyond the anchor digit limit returns the camera unchanged with a precision-limit result', () => {
  const c = deepFreeze(camera({ anchor: ['1'.repeat(400), '0', '0'], scale: { mantissa: 1, exponent: -1000 }, positionLocal: [3000, 0, 0] }));
  const result = recentre(c);
  assert.deepEqual(result, refused(c, 'anchor-digits')); assert.equal(result.camera, c);
});

test('the ordinary origin is encoded as binary32 high and low parts in the declared order', () => {
  const c = camera({ anchor: ['1.23456789012345678901234567890', '-0.987654321098765432109876543210', '0'], positionLocal: [0, 0, 0] });
  const result = encodeOrdinaryOrigin(c);
  assert.equal(result.unavailable, undefined); assert.notEqual(result.lowF32[0], 0);
  world(c).forEach((exact, i) => {
    assert.equal(result.highF32[i], Math.fround(Number(c.anchor[i])));
    const remainder = diff(exact, numberQ(result.highF32[i]));
    // These ordinary-size rational operands convert safely for this oracle.
    assert.equal(result.lowF32[i], Math.fround(Number(remainder.n) / Number(remainder.d)));
    const encoded = add(numberQ(result.highF32[i]), numberQ(result.lowF32[i]));
    assert.ok(le(magnitude(diff(encoded, exact)), mul(magnitude(exact), pow2(-46))));
    assert.ok(le(magnitude(diff(numberQ(result.highF32[i] + result.lowF32[i]), exact)), mul(magnitude(exact), pow2(-46))));
    assert.equal(result.highF32[i], Math.fround(result.highF32[i]));
    assert.equal(result.lowF32[i], Math.fround(result.lowF32[i]));
  });
  const encoded = result.highF32.map((x, i) => add(numberQ(x), numberQ(result.lowF32[i])));
  assert.ok(le(error(encoded, world(c)), pow2(result.errorBoundLog2)));
  assert.ok(!le(error(encoded, world(c)), pow2(result.errorBoundLog2 - 1)));
});

test('an origin whose remainder is out of binary32 range is unavailable and the camera unchanged', () => {
  // Even rounding this anchor to binary64 leaves a residual above max f32.
  const text = '1.23456789012345678901234567890e100';
  assert.ok(!le(magnitude(diff(decimalQ(text), numberQ(Number(text)))), numberQ(3.4028234663852886e38)));
  for (const anchor of [text, '1e400']) {
    const c = deepFreeze(camera({ anchor: [anchor, '0', '0'], positionLocal: [0, 0, 0] }));
    const before = structuredClone(c), result = encodeOrdinaryOrigin(c);
    assert.deepEqual(result, { unavailable: true, reason: 'origin-out-of-range' });
    assert.deepEqual(c, before);
  }
});

test('a serialized orientation with roll is reconstructed exactly by basis', () => {
  const c = camera({ orientationWxyz: eulerQ(0, 0, Math.PI / 3) });
  const restored = decodeSceneFile(encodeSceneFile(createSpaceScene({ model: 'sphere', camera: c }))).camera;
  assert.deepEqual(restored.orientationWxyz, c.orientationWxyz);
  nearVector(basis(restored).forward, [0, 0, -1]);
  nearVector(basis(restored).right, [0.5, Math.sqrt(3) / 2, 0]);
  nearVector(basis(restored).up, [-Math.sqrt(3) / 2, 0.5, 0]);
});

test('the basis matches Project 0 A.1 for the bulb overview', () => {
  const c = overview(getModel('mandelbulb', 1), { power: 8 });
  nearVector(basis(c).forward, [-0.768, 0.576, -0.28], 1e-3);
  nearVector(basis(c).right, [0.6, 0.8, 0]);
  nearVector(basis(c).up, [-0.224, 0.168, 0.96]);
});

test('ray directions use pixel centres, the vertical field of view and the sample jitter', () => {
  const c = camera(), { forward: f, right: r, up: u } = basis(c), W = 1280, H = 720;
  const h = Math.tan(Math.PI / 6);
  // An even-sized image has no central pixel. Fractional index (639.5,359.5)
  // denotes the geometric centre under the specified i+0.5 convention.
  nearVector(rayDirection(c, 639.5, 359.5, W, H), f);
  const sx = (1 / W - 1) * h * W / H, sy = (1 - 1 / H) * h;
  nearVector(rayDirection(c, 0, 0, W, H), unit(f.map((x, i) => x + sx * r[i] + sy * u[i])));
  nearVector(rayDirection(c, 639.5, 359.5, W, H, { dx: 0.5, dy: 0 }), unit(f.map((x, i) => x + h / H * r[i])));
  nearVector(rayDirection(c, 639.5, 359.5, W, H, { dx: 0, dy: 0.5 }), unit(f.map((x, i) => x - h / H * u[i])));
  near(angularPixelSize(c, H), 2 * h / H);
  const wide = camera({ verticalFovDegrees: 120 });
  near(angularPixelSize(wide, H), 2 * Math.tan(Math.PI / 3) / H);
});

test('orbit keeps the focus and the distance and stays upright', () => {
  const c = camera({ focusLocal: [0.3, -0.2, 0.1] }), result = orbit(c, 0.3, -0.2);
  assert.deepEqual(result.focusLocal, c.focusLocal);
  assert.deepEqual(result.anchor, c.anchor);
  near(norm(sub(result.positionLocal, c.focusLocal)), norm(sub(c.positionLocal, c.focusLocal)));
  nearVector(upright(result).forward, unit(sub(c.focusLocal, result.positionLocal)));
  valid(result);
});

test('dolly approaches but never reaches the focus', () => {
  const c = camera({ positionLocal: [0.6, 0, 0], focusLocal: [0.3, 0, 0] });
  assert.equal(dolly(c, 0), c);
  assert.equal(dolly(c, Number.MIN_VALUE), c);
  for (const factor of [0, Number.MIN_VALUE, 0.1, 1, 2]) {
    const result = dolly(c, factor);
    assert.ok(dot(sub(result.positionLocal, c.focusLocal), sub(c.positionLocal, c.focusLocal)) > 0);
    assert.deepEqual(result.focusLocal, c.focusLocal); valid(result);
  }
  near(norm(sub(dolly(c, 0.5).positionLocal, c.focusLocal)), norm(sub(c.positionLocal, c.focusLocal)) * 0.5);
  for (const factor of [0.4, 0.25, 0.9]) {
    let close = c;
    for (let step = 0; step < 1000; step++) close = dolly(close, factor);
    assert.ok(close.positionLocal[0] > close.focusLocal[0], 'retain a distinct focus at the representation floor');
    assert.deepEqual(dolly(close, factor), close, 'a stalled dolly preserves the pose');
    assert.ok(dolly(close, 2).positionLocal[0] > close.positionLocal[0], 'dolly-out still moves');
  }
  invalid(() => dolly(c, -1)); invalid(() => dolly(c, Infinity));
});

test('flight is upright: yaw about world Z, pitch clamped, no roll', () => {
  const c = lookAt(camera({ positionLocal: [0, 0, 0] }), [1, 0, 0]);
  const result = flightStep(c, { forward: 1, strafe: 0, rise: 0, yaw: Math.PI / 2, pitch: 0 }, 2, 1);
  nearVector(upright(result).forward, [0, 1, 0]);
  nearVector(result.positionLocal, [0, 2, 0]); valid(result);
  for (const pitch of [-100, 100]) {
    const tilted = flightStep(c, { pitch }, 0, 1);
    near(Math.asin(upright(tilted).forward[2]), Math.sign(pitch) * 89 * Math.PI / 180);
  }
});

test('overview places the camera at 2.5 radii', () => {
  for (const [id, parameters] of [['sphere', {}], ['box', {}], ['menger', { depth: 2 }], ['mandelbulb', { power: '8' }], ['quaternion-julia', { C: ['4', '4', '4', '4'], kappa: '0' }]]) {
    const model = getModel(id, 1), effective = effectiveParameters(id, parameters).effective;
    const volume = model.enclosingVolume(effective);
    const radius = volume.kind === 'sphere' ? volume.radius : norm(volume.max);
    const c = overview(model, effective);
    near(norm(c.positionLocal), 2.5 * radius);
    nearVector(unit(c.positionLocal), [0.768, -0.576, 0.28]);
    assert.deepEqual(c.focusLocal, [0, 0, 0]); assert.deepEqual(c.anchor, ['0', '0', '0']);
    upright(c); valid(c);
  }
});

test('setOrientation with a locked axis changes only the other two', () => {
  const before = [0.2, -0.3, 0.4], requested = [-0.4, 0.5, -0.6];
  const c = camera({ orientationWxyz: eulerQ(...before) });
  for (const [axis, index] of ['x', 'y', 'z'].map((x, i) => [x, i])) {
    const result = setOrientation(c, eulerQ(...requested), { lockAxis: axis });
    nearVector(eulerOf(result), requested.map((x, i) => i === index ? before[i] : x));
    assert.deepEqual(result.positionLocal, c.positionLocal); assert.deepEqual(result.focusLocal, c.focusLocal); valid(result);
  }
  nearVector(eulerOf(setOrientation(c, eulerQ(...requested), { lockAxis: null })), requested);
  invalid(() => setOrientation(c, eulerQ(...requested), { lockAxis: 'w' }));
});

test("reconstructHit's error is bounded by origin transport, direction rounding and depth quantization together", () => {
  const c = camera({ anchor: A, scale: { mantissa: 1.25, exponent: -2 }, positionLocal: [2, -1, 0.5] });
  const pixel = [517, 311], jitter = { dx: 0.31, dy: -0.27 }, W = 1280, H = 720;
  const d = rayDirection(c, pixel[0], pixel[1], W, H, jitter), d32 = d.map(Math.fround);
  const depthExact = 3.125 + 2 ** -40, depth = Math.fround(depthExact);
  const transport = encodeOrdinaryOrigin(c), exactOrigin = world(c);
  const gpuOrigin = transport.highF32.map((h, i) => add(numberQ(h), numberQ(transport.lowF32[i])));
  const originError = error(gpuOrigin, exactOrigin);
  assert.ok(le(originError, pow2(transport.errorBoundLog2)));
  const directionError = l1(d.map((x, i) => mul(numberQ(depth), diff(numberQ(d32[i]), numberQ(x)))));
  const directionBound = mul(numberQ(depth), mul(Q(3n), pow2(-25)));
  assert.ok(le(directionError, directionBound));
  const depthError = l1(d.map(x => mul(numberQ(x), diff(numberQ(depth), numberQ(depthExact)))));
  const depthBound = mul(l1(d.map(numberQ)), pow2(-23)); // half an f32 ulp at depth in [2,4)
  assert.ok(le(depthError, depthBound));
  const hit = reconstructHit(c, pixel, jitter, depth, W, H), hitWorld = world(hit);
  const exactRayAtDepth = exactOrigin.map((x, i) => add(x, mul(numberQ(depth), numberQ(d[i]))));
  const reconstructionError = error(hitWorld, exactRayAtDepth);
  assert.ok(le(reconstructionError, pow2(-48)), 'CPU local re-expression has its own error bound');
  const exactHit = exactOrigin.map((x, i) => add(x, mul(numberQ(depthExact), numberQ(d[i]))));
  const transportedHit = gpuOrigin.map((x, i) => add(x, mul(numberQ(depth), numberQ(d32[i]))));
  const sum = add(add(originError, directionError), depthError);
  assert.ok(le(error(transportedHit, exactHit), sum));
  assert.ok(le(error(hitWorld, transportedHit), add(add(originError, directionError), reconstructionError)));
  assert.ok(le(error(hitWorld, exactHit), add(depthError, reconstructionError)));
  assert.ok(!le(error(transportedHit, exactHit), depthError), 'depth quantization alone is insufficient for this fixture');
  nearVector(toLocal(c, hit), hit.positionLocal);
});

test('anchorAdd is exact, parser-admitted, and reports digit and admissible-range overflow', () => {
  const c = camera({ anchor: A, scale: { mantissa: 1 + 2 ** -52, exponent: -20 }, positionLocal: [3000.125, -0.125, 0] });
  const result = anchorAdd(c.anchor, c.scale, c.positionLocal);
  assert.ok(Array.isArray(result)); result.forEach(parseAnchorDecimal);
  assert.equal(error(result.map(decimalQ), world(c)).n, 0n);
  assert.deepEqual(anchorAdd(['9'.repeat(400) + 'e1', '0', '0'], { mantissa: 1, exponent: 4 }, [1, 0, 0]), limit);
  assert.deepEqual(anchorAdd(['1e400', '0', '0'], { mantissa: 1, exponent: -1000 }, [1, 0, 0]), limit);
});

test('exact operand budgets cover 2200 decimal places and a 2601-digit aligned coefficient', () => {
  const product = mul(mul(numberQ(1 + 2 ** -52), pow2(-1074)), numberQ(Number.MIN_VALUE));
  assert.equal(product.d, 1n << 2200n);
  const coefficient = product.n * 5n ** 2200n;
  const aligned = 10n ** 2600n + coefficient;
  assert.equal(aligned.toString().length, 2601);
  assert.deepEqual(anchorAdd(['1e400', '0', '0'], { mantissa: 1 + 2 ** -52, exponent: -1074 }, [Number.MIN_VALUE, 0, 0]), limit);
  const c = camera({ anchor: ['1e400', '0', '0'], scale: { mantissa: 1 + 2 ** -52, exponent: -1074 }, positionLocal: [Number.MIN_VALUE, 0, 0], focusLocal: [0, 0, 0] });
  // A bounded tail drop may not collapse the focus. With a distinct surviving
  // focus, the same exact 2200-place displacement is admitted under the bound.
  assert.deepEqual(recentre(c), refused(c, 'focus-re-expression'));
  const separated = { ...c, focusLocal: [1, 0, 0] };
  checkRecentre(separated, recentre(separated));
});

test('recentre checks the aggregate discarded tail rather than each small digit', () => {
  const c = camera({ anchor: ['1.' + '1'.repeat(399) + 'e388', '0', '0'], scale: { mantissa: 1.1, exponent: 0 }, positionLocal: [3000 + 2 ** -40, 0, 0], focusLocal: [0, 0, 0] });
  const bound = mul(scaleQ(c), pow2(-40));
  const increment = mul(scaleQ(c), numberQ(c.positionLocal[0]));
  // Candidate anchors here have spacing 1e-11; every individual tail digit is
  // <= 1e-12 (< the bound), but the complete remainder is > the bound.
  const ticks = increment.n * 10n ** 11n / increment.d;
  const tail = diff(increment, Q(ticks, 10n ** 11n));
  assert.ok(le(Q(1n, 10n ** 12n), bound));
  assert.ok(!le(tail, bound)); assert.ok(le(tail, Q(2n, 10n ** 12n)));
  assert.deepEqual(recentre(c), refused(c, 'anchor-digits'));
});

test('recentre includes focus re-expression error and refuses an unbounded subtraction', () => {
  const c = camera({ positionLocal: [3000, 0, 0], focusLocal: [-(2 ** 19) + 2 ** -34, 0, 0] });
  const exactFocus = diff(numberQ(c.focusLocal[0]), numberQ(3000));
  assert.ok(!le(magnitude(diff(numberQ(c.focusLocal[0] - 3000), exactFocus)), pow2(-40)));
  assert.deepEqual(recentre(c), refused(c, 'focus-re-expression'));
  const tooFar = camera({ positionLocal: [2 ** 20, 0, 0], focusLocal: [-(2 ** 20), 0, 0] });
  assert.deepEqual(recentre(tooFar), refused(tooFar, 'local-range'));
});

test('recentre covers both thresholds, accepted decimal rounding, and idempotence', () => {
  for (const p of [2 ** -10, 1024, 0]) {
    const c = camera({ positionLocal: [p, 0, 0] });
    const result = recentre(c); assert.equal(result.camera, c); assert.equal(result.driftBoundLog2, null);
  }
  for (const p of [2 ** -11, 1025]) {
    const c = camera({ anchor: A, positionLocal: [p, 0, 0] });
    const result = recentre(c); checkRecentre(c, result);
    assert.equal(recentre(result.camera).camera, result.camera);
  }
  const c = camera({ anchor: ['0.' + '1'.repeat(400), '0', '0'], scale: { mantissa: 1, exponent: -1000 }, positionLocal: [3000, 0, 0] });
  const result = recentre(c), total = checkRecentre(c, result);
  assert.ok(total.n > 0n, 'an admissible rounded anchor is accepted with verified nonzero drift');
});

test('transport rounds exact residuals at midpoint ties and includes the scaled local origin', () => {
  const c = camera({ anchor: ['1.000000059604644775390625000001', '0', '0'], positionLocal: [0, 0, 0] });
  assert.equal(encodeOrdinaryOrigin(c).highF32[0], 1 + 2 ** -23);
  const moved = camera({ anchor: ['1', '0', '0'], scale: { mantissa: 1.5, exponent: 2 }, positionLocal: [2, 0, 0] });
  assert.equal(encodeOrdinaryOrigin(moved).highF32[0], 13);
  const cancelled = camera({ anchor: ['1', '0', '0'], positionLocal: [-1, 0, 0] });
  assert.equal(encodeOrdinaryOrigin(cancelled).errorBoundLog2, null);
});

test('transport reports absolute underflow error instead of promising relative accuracy for subnormals', () => {
  const c = camera({ anchor: ['1e-46', '-1e-400', '0'], positionLocal: [0, 0, 0] });
  const result = encodeOrdinaryOrigin(c);
  assert.ok(result.highF32.every(x => x === 0)); assert.ok(result.lowF32.every(x => x === 0));
  assert.ok(le(l1(world(c)), pow2(result.errorBoundLog2)));
  assert.ok(!le(magnitude(world(c)[0]), mul(magnitude(world(c)[0]), pow2(-46))));
});

test('transport admits finite rounding just above max f32 and rejects the overflow midpoint', () => {
  const max = ((1n << 24n) - 1n) << 104n, halfUlp = 1n << 103n;
  for (const sign of [1n, -1n]) {
    for (const extra of [1n, halfUlp - 1n]) {
      const c = camera({ anchor: [String(sign * (max + extra)), '0', '0'], positionLocal: [0, 0, 0] });
      const result = encodeOrdinaryOrigin(c);
      assert.equal(result.highF32[0], Number(sign * max));
      assert.ok(Number.isFinite(result.lowF32[0]));
      const actualError = magnitude(diff(add(numberQ(result.highF32[0]), numberQ(result.lowF32[0])), world(c)[0]));
      if (actualError.n) assert.ok(le(actualError, pow2(result.errorBoundLog2)));
      else assert.equal(result.errorBoundLog2, null);
    }
    const c = camera({ anchor: [String(sign * (max + halfUlp)), '0', '0'], positionLocal: [0, 0, 0] });
    assert.deepEqual(encodeOrdinaryOrigin(c), { unavailable: true, reason: 'origin-out-of-range' });
  }
});

test('basis normalizes quaternions within B02 norm tolerance without changing serialized components', () => {
  const c = deepFreeze(camera({ orientationWxyz: SPACE_DEFAULTS.camera.orientationWxyz.map(x => x * (1 + 5e-7)) }));
  valid(c); nearVector(basis(c).forward, basis(camera()).forward);
  near(norm(basis(c).forward), 1); assert.deepEqual(c.orientationWxyz, SPACE_DEFAULTS.camera.orientationWxyz.map(x => x * (1 + 5e-7)));
  invalid(() => basis(camera({ orientationWxyz: [1.00001, 0, 0, 0] })));
  invalid(() => setOrientation(camera(), [0, 0, 0, 0], { lockAxis: null }));
});

test('equalCameras compares world position, focus and rotation including q and minus q', () => {
  const c = camera(); assert.ok(equalCameras(c, camera({ orientationWxyz: c.orientationWxyz.map(x => -x) })));
  assert.ok(equalCameras(c, camera({ orientationWxyz: c.orientationWxyz.map(x => x * (1 + 5e-7)) })));
  assert.ok(equalCameras(c, camera({ anchor: ['00', '-0', '0e400'], scale: { mantissa: 1, exponent: -1 }, positionLocal: c.positionLocal.map(x => 2 * x) })));
  const shifted = camera({ anchor: ['1', '0', '0'], positionLocal: [0, 0, 0], focusLocal: [1, 0, 0] });
  assert.ok(equalCameras(shifted, camera({ positionLocal: [1, 0, 0], focusLocal: [2, 0, 0] })));
  assert.equal(equalCameras(c, camera({ verticalFovDegrees: 61 })), false);
  assert.equal(equalCameras(c, camera({ focusLocal: [0, 0, 1e-30] })), false);
  assert.equal(equalCameras(c, camera({ anchor: ['1e-400', '0', '0'] })), false);
  assert.equal(equalCameras(c, camera({ orientationWxyz: eulerQ(0, 0, 0.01) })), false);
});

test('coincident focus is a safe no-op for lookAt orbit dolly resetOrientation and flightStep', () => {
  const c = deepFreeze(camera({ focusLocal: [1.92, -1.44, 0.7] }));
  for (const result of [lookAt(c, c.positionLocal), orbit(c, 1, 1), dolly(c, 0.5), resetOrientation(c), flightStep(c, { forward: 1, yaw: 1, pitch: 1 }, 3, 0.1)]) {
    assert.equal(result, c); valid(result);
  }
  const nondegenerate = camera(); assert.equal(lookAt(nondegenerate, nondegenerate.positionLocal), nondegenerate);
});

test('ray handedness is rightward for increasing i and upward for decreasing j', () => {
  const c = camera({ orientationWxyz: eulerQ(0.2, 0.3, 0.4) }), b = basis(c);
  assert.ok(dot(rayDirection(c, 10, 5, 11, 11), b.right) > 0);
  assert.ok(dot(rayDirection(c, 5, 0, 11, 11), b.up) > 0);
  const cross = [b.right[1] * b.up[2] - b.right[2] * b.up[1], b.right[2] * b.up[0] - b.right[0] * b.up[2], b.right[0] * b.up[1] - b.right[1] * b.up[0]];
  nearVector(cross, b.forward.map(x => -x));
});

test('orbit clamps pitch at both 89 degree limits and positive yaw rotates about world Z', () => {
  const c = lookAt(camera({ positionLocal: [1, 0, 0] }), [0, 0, 0]);
  nearVector(orbit(c, Math.PI / 2, 0).positionLocal, [0, 1, 0]);
  for (const sign of [-1, 1]) {
    const result = orbit(c, 0, sign * 100);
    near(Math.asin(result.positionLocal[2]), sign * 89 * Math.PI / 180);
    upright(result); valid(result);
  }
});

test('pan translates position and focus in camera local units and reset restores upright aim', () => {
  const c = camera({ orientationWxyz: eulerQ(0.2, 0.3, 0.4) }), b = basis(c);
  const result = pan(c, 0.25, -0.5), displacement = b.right.map((x, i) => 0.25 * x - 0.5 * b.up[i]);
  nearVector(sub(result.positionLocal, c.positionLocal), displacement);
  nearVector(result.focusLocal, displacement);
  assert.deepEqual(result.orientationWxyz, c.orientationWxyz);
  const reset = resetOrientation(result);
  nearVector(upright(reset).forward, unit(sub(reset.focusLocal, reset.positionLocal))); valid(reset);
});

test('flight uses local speed and time, camera forward and strafe, and world Z rise', () => {
  const c = lookAt(camera({ scale: { mantissa: 1, exponent: -1 }, positionLocal: [0, 0, 0] }), [1, 0, 0]);
  const moved = flightStep(c, { forward: 1, strafe: 1, rise: 1 }, 2, 0.25);
  nearVector(moved.positionLocal, [0.5, -0.5, 0.5]);
  nearVector(sub(moved.focusLocal, moved.positionLocal), [1, 0, 0]);
  assert.equal(flightStep(c, { forward: 1, yaw: 1 }, 2, 0), c);
  invalid(() => flightStep(c, {}, -1, 1)); invalid(() => flightStep(c, {}, 1, -1));
});

test('toLocal preserves tiny differences next to large anchors and reports out-of-local-range points', () => {
  const c = camera({ anchor: ['1e100', '0', '0'], scale: { mantissa: 1, exponent: -100 }, positionLocal: [0, 0, 0] });
  const point = { anchor: c.anchor, scale: { mantissa: 1, exponent: -101 }, positionLocal: [2, 4, 6] };
  assert.deepEqual(toLocal(c, point), [1, 2, 3]);
  const nearOne = camera({ anchor: ['1', '0', '0'], scale: { mantissa: 1, exponent: -100 }, positionLocal: [0, 0, 0] });
  const movedAnchor = anchorAdd(nearOne.anchor, nearOne.scale, [1, 0, 0]);
  assert.deepEqual(toLocal(nearOne, { anchor: movedAnchor, scale: nearOne.scale, positionLocal: [0, 0, 0] }), [1, 0, 0]);
  let failedPick;
  assert.doesNotThrow(() => { failedPick = toLocal(c, { anchor: ['2e100', '0', '0'], scale: c.scale, positionLocal: [0, 0, 0] }); });
  assert.deepEqual(failedPick, unavailable);
});

test('navigation preserves admitted cameras at local and scale limits', () => {
  const c = camera({ positionLocal: [2 ** 20, 0, 0] });
  assert.equal(dolly(c, Number.MAX_VALUE), c);
  assert.equal(pan(c, Number.MAX_VALUE, Number.MAX_VALUE), c);
  const tiny = camera({ scale: { mantissa: 1, exponent: -1074 } });
  assert.equal(flightStep(tiny, { forward: 1 }, Number.MAX_VALUE, 1), tiny);
  valid(orbit(c, 0.1, 0.1));
});

test('camera entry points reject malformed values with SceneError invalid-value', () => {
  invalid(() => anchorAdd(['1e401', '0', '0'], { mantissa: 1, exponent: 0 }, [0, 0, 0]));
  invalid(() => anchorAdd(['0', '0', '0'], { mantissa: 2, exponent: 0 }, [0, 0, 0]));
  invalid(() => anchorAdd(['0', '0', '0'], { mantissa: 1, exponent: 1024 }, [0, 0, 0]));
  invalid(() => anchorAdd(['0', '0', '0'], { mantissa: 1, exponent: 0 }, [2 ** 20, 2 ** 20, 0]));
  invalid(() => rayDirection(camera(), 0, 0, 0, 10));
  invalid(() => rayDirection(camera(), 0, 0, 10, 10, { dx: NaN, dy: 0 }));
  invalid(() => angularPixelSize(camera(), -1));
  invalid(() => orbit(camera(), Infinity, 0));
  invalid(() => reconstructHit(camera(), [0, 0], { dx: 0, dy: 0 }, -1, 10, 10));
  invalid(() => basis(camera({ verticalFovDegrees: CAMERA_LIMITS.fovDegrees[1] + 1 })));
});

test('camera functions do not mutate inputs', () => {
  const c = deepFreeze(camera()), saved = structuredClone(c);
  for (const result of [orbit(c, 0.1, 0.1), pan(c, 0.1, 0.1), dolly(c, 0.8), lookAt(c, [0.1, 0.2, 0.3]), setOrientation(c, eulerQ(0.1, 0.2, 0.3), { lockAxis: null }), resetOrientation(c), flightStep(c, { forward: 1 }, 1, 0.1)]) valid(result);
  anchorAdd(c.anchor, c.scale, c.positionLocal); recentre(c); basis(c); encodeOrdinaryOrigin(c);
  const hit = reconstructHit(c, [1, 2], { dx: 0, dy: 0 }, 1, 10, 10); toLocal(c, hit);
  assert.deepEqual(c, saved);
});

test('camera dependencies exclude DOM GPU and reference code and shared never imports Space', async () => {
  assert.deepEqual(await boundaryViolations(['src/space/camera.js'], [
    /^src\/space\/(camera|scene-adapter)\.js$/, /^src\/space\/numerics\/parameters\.js$/,
    /^src\/shared\/scene\.js$/, /^src\/plane\/palettes\.js$/,
  ]), []); // B02's palette dependency remains until the scheduled B11 move.
  assert.deepEqual(await boundaryViolations(['src/shared'], [/^src\/shared\//]), []);
});

test('anchor emission admits normalized exponents down to minus 799 and lexical leading zeros', () => {
  const anchor = ['1.' + '1'.repeat(399) + 'e-400', '0001', '1e400'];
  const result = anchorAdd(anchor, { mantissa: 1, exponent: 0 }, [0, 0, 0]);
  assert.ok(Array.isArray(result));
  assert.equal(parseAnchorDecimal(result[0]).exponent, -799);
  assert.equal(error(result.map(decimalQ), anchor.map(decimalQ)).n, 0n);
  assert.equal(parseAnchorDecimal(result[1]).digits, '1');
});

test('recentre rounds points below the anchor floor to zero with an exact scaled bound', () => {
  const tiny = camera({ scale: { mantissa: 1, exponent: -1074 }, positionLocal: [Number.MIN_VALUE, 0, 0], focusLocal: [1, 0, 0] });
  const result = recentre(tiny); checkRecentre(tiny, result);
  assert.deepEqual(result.camera.anchor, ['0', '0', '0']);
  const belowFloor = camera({ anchor: ['1e-400', '0', '0'], scale: { mantissa: 1, exponent: -1074 }, positionLocal: [-(2 ** -256), 0, 0], focusLocal: [1, 0, 0] });
  assert.ok(le(magnitude(world(belowFloor)[0]), decimalQ('1e-400')));
  const rounded = recentre(belowFloor); checkRecentre(belowFloor, rounded);
  assert.deepEqual(rounded.camera.anchor, ['0', '0', '0']);
});

test('lookAt handles subnormal focus offsets and both vertical poles without NaN', () => {
  const c = camera({ positionLocal: [0, 0, 0] });
  nearVector(basis(lookAt(c, [Number.MIN_VALUE, Number.MIN_VALUE, 0])).forward, [Math.SQRT1_2, Math.SQRT1_2, 0]);
  for (const z of [-1, 1]) {
    const result = lookAt(c, [0, 0, z]);
    nearVector(basis(result).forward, [0, 0, z]); valid(result);
    valid(orbit(result, 1, 0)); valid(flightStep(result, { yaw: 1 }, 0, 0.1));
  }
});

test('axis locks remain finite at Euler singularities and unlocked orientation retains full rotation', () => {
  for (const y of [-Math.PI / 2, Math.PI / 2]) {
    const q = eulerQ(0.3, y, 0.5), c = camera({ orientationWxyz: q });
    nearVector(basis(setOrientation(camera(), q)).forward, basis(c).forward);
    for (const lockAxis of ['x', 'y', 'z']) valid(setOrientation(c, q, { lockAxis }));
  }
});

test('picking uses B00 array pixels and reports a precision limit when local reconstruction cannot fit', () => {
  const tiny = camera({ scale: { mantissa: 1, exponent: -1074 } });
  let failedPick;
  assert.doesNotThrow(() => { failedPick = reconstructHit(tiny, [5, 5], { dx: 0, dy: 0 }, 1, 11, 11); });
  assert.deepEqual(failedPick, unavailable);
  invalid(() => reconstructHit(camera(), { x: 5, y: 5 }, { dx: 0, dy: 0 }, 1, 11, 11));
  const c = camera({ anchor: ['1e100', '0', '0'], scale: { mantissa: 1, exponent: -100 } });
  const hit = reconstructHit(c, [5, 5], { dx: 0, dy: 0 }, 2 ** -100, 11, 11);
  assert.deepEqual(hit.anchor, c.anchor);
  nearVector(sub(toLocal(c, hit), c.positionLocal), basis(c).forward);
});


test('pan refuses to round a distinct focus onto the position', () => {
  const c = camera({ positionLocal: [0.3, 0, 0], focusLocal: [0.3 + 2 ** -54, 0, 0], orientationWxyz: [1, 0, 0, 0] });
  assert.notEqual(c.positionLocal[0], c.focusLocal[0]);
  assert.equal(pan(c, 1000, 0), c);
});

test('flight refuses to round a distinct focus onto the position', () => {
  const c = lookAt(camera({ positionLocal: [0.3, 0, 0] }), [0.3 + 2 ** -54, 0, 0]);
  assert.equal(flightStep(c, { forward: 1 }, 1000, 1), c);
});

test('overview matches every field of the frozen P3 bulb, quaternion and Menger cameras', () => {
  // Exact scene camera values copied from performance-workload.json at 3041978.
  // No reference code is imported, and no expected field comes from production defaults.
  const fixtures = [
    ['mandelbulb', { power: '8' }, [3.8400000000000007, -2.8800000000000003, 1.4000000000000001]],
    ['quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '0' }, [3.8400000000000007, -2.8800000000000003, 1.4000000000000001]],
    ['menger', { depth: 2 }, [3.3255375505322453, -2.4941531628991838, 1.2124355652982144]],
  ];
  for (const [id, parameters, positionLocal] of fixtures) {
    const frozenP3Camera = {
      kind: 'anchored-perspective-v1', anchor: ['0', '0', '0'],
      scale: { mantissa: 1, exponent: 0 }, positionLocal, focusLocal: [0, 0, 0],
      orientationWxyz: [0.7155417527999327, 0.5366563145999496, 0.2683281572999748, 0.35777087639996635],
      verticalFovDegrees: 60,
    };
    const actual = overview(getModel(id, 1), effectiveParameters(id, parameters).effective);
    assert.deepEqual(actual, frozenP3Camera, id);
    assert.ok(equalCameras(actual, frozenP3Camera), id);
  }
});

test('flight preserves a nonunit focus distance while turning and translating', () => {
  const c = lookAt(camera({ positionLocal: [0, 0, 0] }), [3, -4, 2]);
  const result = flightStep(c, { forward: 0.4, yaw: 0.3, pitch: -0.2 }, 2, 0.2);
  near(norm(sub(result.focusLocal, result.positionLocal)), Math.sqrt(29));
  nearVector(unit(sub(result.focusLocal, result.positionLocal)), basis(result).forward);
});

test('flight rise follows world Z on a pitched camera', () => {
  const c = lookAt(camera({ positionLocal: [0, 0, 0] }), [3, 4, 5]);
  assert.ok(Math.abs(basis(c).up[0]) > 0.1, 'camera up differs from world up');
  const result = flightStep(c, { rise: 1 }, 2, 0.25);
  nearVector(result.positionLocal, [0, 0, 0.5]);
  near(norm(sub(result.focusLocal, result.positionLocal)), Math.sqrt(50));
});

test('lookAt at a pole retains the previous right vector horizontal heading', () => {
  const c = camera({ positionLocal: [0, 0, 3] });
  const right = basis(c).right, horizontal = unit([right[0], right[1], 0]);
  const down = lookAt(c, [0, 0, 0]);
  nearVector(basis(down).right, horizontal);
  nearVector(basis(down).forward, [0, 0, -1]);
});

test('pan refuses a focus-only local range overflow', () => {
  const c = camera({ positionLocal: [0, 0, 0], focusLocal: [2 ** 20 - 0.5, 0, 0], orientationWxyz: [1, 0, 0, 0] });
  assert.equal(pan(c, 1, 0), c);
});

test('orbit at either pole retains heading while applying only the pitch clamp and requested yaw', () => {
  for (const sign of [-1, 1]) {
    const c = lookAt(camera({ positionLocal: [0, 0, sign * 3] }), [0, 0, 0]);
    const right = basis(c).right;
    for (const yaw of [0, 0.3]) {
      const result = orbit(c, yaw, 0);
      const r = [Math.cos(yaw) * right[0] - Math.sin(yaw) * right[1], Math.sin(yaw) * right[0] + Math.cos(yaw) * right[1], 0];
      const h = 3 * Math.cos(89 * Math.PI / 180);
      nearVector(result.positionLocal, [h * r[1], -h * r[0], sign * 3 * Math.sin(89 * Math.PI / 180)]);
      nearVector(basis(result).right, r);
      near(norm(result.positionLocal), 3);
      assert.deepEqual(result.focusLocal, c.focusLocal);
    }
  }
});

test('camera error bounds serialize explicitly and recentred distinguishes a rebase from a no-op', () => {
  const still = recentre(camera());
  assert.equal(still.recentred, false);
  const rebased = recentre(camera({ positionLocal: [3000, 0, 0] }));
  assert.equal(rebased.recentred, true);
  for (const result of [still, rebased]) {
    assert.equal(result.driftBoundLog2, null); assert.equal(result.exact, true);
    assert.deepEqual(JSON.parse(canonicalJson(result)), result);
  }
  const exactOrigin = encodeOrdinaryOrigin(camera({ positionLocal: [0, 0, 0] }));
  assert.equal(exactOrigin.errorBoundLog2, null); assert.equal(exactOrigin.exact, true);
  assert.deepEqual(JSON.parse(canonicalJson(exactOrigin)), exactOrigin);
  const roundedOrigin = encodeOrdinaryOrigin(camera({ anchor: A, positionLocal: [0, 0, 0] }));
  assert.equal(roundedOrigin.exact, false); assert.ok(Number.isInteger(roundedOrigin.errorBoundLog2));
  assert.deepEqual(JSON.parse(canonicalJson(roundedOrigin)), roundedOrigin);
});

test('recentre reports anchor exponent refusal separately from focus re-expression', () => {
  const outside = camera({ anchor: ['9'.repeat(400) + 'e1', '0', '0'], positionLocal: [3000, 0, 0] });
  assert.deepEqual(recentre(outside), refused(outside, 'anchor-exponent'));
  const collapse = camera({ scale: { mantissa: 1, exponent: -1074 }, positionLocal: [Number.MIN_VALUE, 0, 0], focusLocal: [0, 0, 0] });
  assert.deepEqual(recentre(collapse), refused(collapse, 'focus-re-expression'));
});

test('local flight speed remains usable at the minimum scale and is independent of scale', () => {
  assert.equal(0.3 * 2 ** -1074, 0, 'world-speed binary64 underflows');
  for (const exponent of [-1074, -1000, 0, 1023]) {
    const c = lookAt(camera({ scale: { mantissa: 1, exponent }, positionLocal: [0, 0, 0] }), [3, 0, 0]);
    const result = flightStep(c, { forward: 1 }, 0.3, 1);
    nearVector(result.positionLocal, [0.3, 0, 0]);
    assert.deepEqual(result.scale, c.scale); assert.deepEqual(result.anchor, c.anchor);
    assert.equal(error(world(result), world(c)).n === 0n, false);
  }
});
