// Space-owned anchored camera arithmetic (Project 1 §5.2/§10.1; Project 0 A.1).
// No world position is reconstructed through a single binary64 Number.
import { SceneError, requireObject } from '../shared/scene.js';
import { CAMERA_KIND, CAMERA_LIMITS } from './scene-adapter.js';
import { ANCHOR_LIMITS, parseAnchorDecimal } from './numerics/parameters.js';

export const RECENTRE_BOUND_LOG2 = -40;
const PRECISION_LIMIT = Object.freeze({ unchanged: true, reason: 'precision-limit' });
const PICK_UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'precision-limit' });
const PITCH_LIMIT = 89 * Math.PI / 180;
const ZERO = Object.freeze({ n: 0n, e: 0 });

// Working storage is distinct from the 400-digit serialized anchor limit.
// A mantissa has at most 52 fractional binary places. At the minimum scale,
// (1 + 2^-52) * 2^-1074 * 2^-1074 needs 2200 decimal places. Aligning
// that product with 1e400 needs 2601 coefficient digits (anchors alone: 1200).
// Pick points admit any finite binary64 local component, so their products have
// leading position <=617 and need <=2818 digits. Division by scale aligns at
// most 2508 places in the denominator (<=804 coefficient digits), or 1743 in
// the numerator. Binary64 rounding adds <=1074 bits (324 digits): a conservative
// intermediate bound is below 4900 decimal digits. The existing 8192-digit
// ceiling covers these intermediates with room for carries, without a fixed-size
// allocation. Every power, shift, product and alignment checks its actual operands
// BEFORE allocation. No input controls an unchecked BigInt exponent.
const WORK_DIGITS = 8192;
const WORK_BITS = Math.floor(WORK_DIGITS * Math.log2(10));
const invalid = (message, path = '') => { throw new SceneError('invalid-value', message, path); };
const precision = (detail = 'working-budget') => {
  const error = new SceneError('precision-limit', 'camera arithmetic exceeds its representable range or working budget');
  error.detail = detail;
  throw error;
};
const abs = n => n < 0n ? -n : n;
const digits = n => abs(n).toString().length;
function budget(size) { if (!Number.isSafeInteger(size) || size > WORK_DIGITS || size < 0) precision(); }
function ten(exponent) { budget(exponent + 1); return 10n ** BigInt(exponent); }
function shift(n, bits) {
  if (!Number.isSafeInteger(bits) || bits < 0 || abs(n).toString(2).length + bits > WORK_BITS) precision();
  return n << BigInt(bits);
}
function times(a, b) { budget(digits(a) + digits(b)); return a * b; }
function decimal(n, e = 0) {
  if (n === 0n) return ZERO;
  budget(digits(n));
  while (n % 10n === 0n) { n /= 10n; e++; }
  return { n, e };
}
function plus(a, b) {
  if (!a.n) return b;
  if (!b.n) return a;
  const e = Math.min(a.e, b.e);
  budget(Math.max(digits(a.n) + a.e - e, digits(b.n) + b.e - e) + 1);
  return decimal(a.n * ten(a.e - e) + b.n * ten(b.e - e), e);
}
const minus = (a, b) => plus(a, { n: -b.n, e: b.e });
const multiply = (a, b) => decimal(times(a.n, b.n), a.e + b.e);
const magnitude = a => ({ n: abs(a.n), e: a.e });
const compare = (a, b) => { const d = minus(a, b).n; return d < 0n ? -1 : d > 0n ? 1 : 0; };
function anchorDecimal(text, path) {
  const { sign, digits: coefficient, exponent } = parseAnchorDecimal(text, path);
  return decimal(BigInt(sign) * BigInt(coefficient), exponent);
}
const binary64 = new DataView(new ArrayBuffer(8));
function exactNumber(value) {
  if (value === 0) return ZERO;
  binary64.setFloat64(0, value);
  const bits = binary64.getBigUint64(0), field = Number((bits >> 52n) & 2047n);
  let n = (bits & ((1n << 52n) - 1n)) + (field ? 1n << 52n : 0n);
  let e = field ? field - 1075 : -1074;
  while (!(n & 1n)) { n >>= 1n; e++; }
  if (bits >> 63n) n = -n;
  if (e >= 0) return decimal(shift(n, e));
  budget(digits(n) + Math.ceil(-e * Math.log10(5)) + 1);
  return decimal(n * 5n ** BigInt(-e), e);
}
function binaryPower(e) {
  if (e >= 0) return decimal(shift(1n, e));
  budget(Math.ceil(-e * Math.log10(5)) + 1);
  return decimal(5n ** BigInt(-e), e);
}
const exactScale = scale => multiply(exactNumber(scale.mantissa), binaryPower(scale.exponent));
const world = (point, field = 'positionLocal') => {
  const s = exactScale(point.scale);
  return point.anchor.map((a, i) => plus(anchorDecimal(a), multiply(s, exactNumber(point[field][i]))));
};

function finite(value, path, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(`must be finite in [${min}, ${max}]`, path);
  return value;
}
function vector(value, path, max = CAMERA_LIMITS.localMagnitude) {
  if (!Array.isArray(value) || value.length !== 3) invalid('must contain three components', path);
  for (let i = 0; i < 3; i++) finite(value[i], `${path}[${i}]`);
  if (max !== null && Math.hypot(...value) > max) invalid('local Euclidean norm exceeds camera limit', path);
  return value;
}
function checkScale(scale) {
  requireObject(scale, 'scale', ['mantissa', 'exponent']);
  finite(scale.mantissa, 'scale.mantissa', 1, 2);
  if (scale.mantissa === 2) invalid('mantissa must be less than 2', 'scale.mantissa');
  finite(scale.exponent, 'scale.exponent', ...CAMERA_LIMITS.exponent);
  if (!Number.isInteger(scale.exponent)) invalid('exponent must be an integer', 'scale.exponent');
}
function checkAnchor(anchor) {
  if (!Array.isArray(anchor) || anchor.length !== 3) invalid('must contain three decimal strings', 'anchor');
  for (let i = 0; i < 3; i++) parseAnchorDecimal(anchor[i], `anchor[${i}]`);
}
function quaternion(q) {
  if (!Array.isArray(q) || q.length !== 4) invalid('must contain four components', 'orientationWxyz');
  for (let i = 0; i < 4; i++) finite(q[i], `orientationWxyz[${i}]`);
  const length = Math.hypot(...q);
  if (Math.abs(length - 1) > 1e-6) invalid('must be a unit quaternion within 1e-6', 'orientationWxyz');
  return q.map(x => x / length);
}
function checkCamera(c) {
  requireObject(c, 'camera', ['kind', 'anchor', 'scale', 'positionLocal', 'focusLocal', 'orientationWxyz', 'verticalFovDegrees']);
  if (c.kind !== CAMERA_KIND) invalid('unsupported camera kind', 'camera.kind');
  checkAnchor(c.anchor); checkScale(c.scale);
  vector(c.positionLocal, 'positionLocal'); vector(c.focusLocal, 'focusLocal'); quaternion(c.orientationWxyz);
  finite(c.verticalFovDegrees, 'verticalFovDegrees', ...CAMERA_LIMITS.fovDegrees);
}

// Scientific notation's explicit exponent is the LEADING position, never the
// normalized coefficient exponent (which can be -799). Every emitted anchor goes
// back through B02's parser. Only recentre is allowed to round a decimal tail.
function anchorText(value, round = false) {
  let { n, e } = value;
  const sign = n < 0n ? '-' : '';
  n = abs(n);
  if (round && digits(n) > ANCHOR_LIMITS.digits) {
    const dropped = digits(n) - ANCHOR_LIMITS.digits, divisor = ten(dropped);
    let kept = n / divisor;
    const remainder = n % divisor;
    if (2n * remainder > divisor || (2n * remainder === divisor && (kept & 1n))) kept++;
    ({ n, e } = decimal(kept, e + dropped));
  }
  const textDigits = n.toString(), leading = textDigits.length + e - 1;
  // Zero is the only admissible value below the anchor leading-position floor.
  // recentre still has to prove the aggregate error before accepting this drop.
  if (round && leading < ANCHOR_LIMITS.exponent[0]) return '0';
  const text = n === 0n ? '0' : `${sign}${textDigits[0]}${textDigits.length > 1 ? '.' + textDigits.slice(1) : ''}e${leading}`;
  try { parseAnchorDecimal(text); } catch (error) {
    if (error instanceof SceneError) precision(textDigits.length > ANCHOR_LIMITS.digits ? 'anchor-digits' : 'anchor-exponent');
    throw error;
  }
  return text;
}

// Exact integer-ratio -> binary rounding, nearest with ties to even. This is used
// for local re-expression and direct f32 rounding of the exact coordinate/tail.
function ratio(a, b = { n: 1n, e: 0 }) {
  let n = abs(a.n), d = abs(b.n);
  if (!d) precision();
  const e = a.e - b.e;
  if (e >= 0) { budget(digits(n) + e); n *= ten(e); }
  else { budget(digits(d) - e); d *= ten(-e); }
  return { n, d, negative: (a.n < 0n) !== (b.n < 0n) };
}
function floorLog2(n, d) {
  let e = n.toString(2).length - d.toString(2).length;
  if (e >= 0 ? n < shift(d, e) : shift(n, -e) < d) e--;
  return e;
}
function rounded(a, b, precisionBits = 53, minExponent = -1074, maxExponent = 1023) {
  if (!a.n) return 0;
  let { n, d, negative } = ratio(a, b);
  const leading = floorLog2(n, d);
  if (leading > maxExponent) precision('local-range');
  const e = Math.max(minExponent, leading - precisionBits + 1);
  if (e < 0) n = shift(n, -e); else d = shift(d, e);
  let q = n / d;
  const remainder = n % d;
  if (2n * remainder > d || (2n * remainder === d && (q & 1n))) q++;
  if (q && q.toString(2).length - 1 + e > maxExponent) precision('local-range');
  const value = Number(q) * 2 ** e;
  return negative ? -value : value;
}
function ceilLog2(value) {
  if (!value.n) return null;
  const { n, d } = ratio(magnitude(value)), e = floorLog2(n, d);
  const exact = e >= 0 ? n === shift(d, e) : shift(n, -e) === d;
  return exact ? e : e + 1;
}

export function anchorAdd(anchor, scale, local) {
  checkAnchor(anchor); checkScale(scale); vector(local, 'local');
  try { return world({ anchor, scale, positionLocal: local }).map(value => anchorText(value)); }
  catch (error) { if (error.code === 'precision-limit') return { ...PRECISION_LIMIT }; throw error; }
}

export function recentre(camera) {
  checkCamera(camera);
  const length = Math.hypot(...camera.positionLocal);
  if (length === 0 || (length >= 2 ** -10 && length <= 1024)) return { camera, recentred: false, driftBoundLog2: null, exact: true };
  try {
    const oldPosition = world(camera), oldFocus = world(camera, 'focusLocal'), scale = exactScale(camera.scale);
    const anchor = oldPosition.map(value => anchorText(value, true));
    const focusLocal = oldFocus.map((value, i) => rounded(minus(value, anchorDecimal(anchor[i])), scale));
    if (Math.hypot(...focusLocal) > CAMERA_LIMITS.localMagnitude) precision('local-range');
    const rebased = { ...camera, anchor, positionLocal: [0, 0, 0], focusLocal };
    const position = world(rebased), focus = world(rebased, 'focusLocal');
    let positionError = ZERO, focusError = ZERO;
    for (let i = 0; i < 3; i++) {
      positionError = plus(positionError, magnitude(minus(position[i], oldPosition[i])));
      focusError = plus(focusError, magnitude(minus(focus[i], oldFocus[i])));
    }
    const error = plus(positionError, focusError);
    const bound = multiply(scale, binaryPower(RECENTRE_BOUND_LOG2));
    if (compare(error, bound) > 0) precision(compare(positionError, bound) > 0 ? 'anchor-digits' : 'focus-re-expression');
    if (!coincident(camera) && coincident(rebased)) precision('focus-re-expression');
    // Conservative power-of-two upper bound on the measured L1 sum. Admission
    // uses the exact scaled bound above; a log rounded upward can be up to 1 bit
    // looser than that bound and must not be used to repeat the admission test.
    return { camera: rebased, recentred: true, driftBoundLog2: ceilLog2(error), exact: error.n === 0n };
  } catch (error) {
    if (error.code === 'precision-limit') return { camera, ...PRECISION_LIMIT, recentred: false, detail: error.detail };
    throw error;
  }
}

// Ordinary transport rounds the exact represented coordinate directly, then its
// exact remainder: high = RN32(world), low = RN32(world - high). Both operations
// are nearest/ties-even. No intermediate DD rounding affects midpoint decisions.
// The bound is an absolute L1 world-space error, not a field-accuracy guarantee.
// Public zero-error bounds use null with exact:true; nonzero bounds are integer
// ceilings with exact:false. These results can enter reports without infinities.
const MAX_F32 = exactNumber(3.4028234663852886e38);
const F32_OVERFLOW_MIDPOINT = plus(MAX_F32, binaryPower(103));
export function encodeOrdinaryOrigin(camera) {
  checkCamera(camera);
  try {
    const origin = world(camera), highF32 = [], lowF32 = [];
    let totalError = ZERO;
    for (const value of origin) {
      // Guard f32 range before rounding either component.
      // Finite rounding extends half an ulp above max f32. The midpoint itself
      // rounds to infinity; a value just below it still has a finite high + low.
      if (compare(magnitude(value), F32_OVERFLOW_MIDPOINT) >= 0) precision();
      const high = rounded(value, undefined, 24, -149, 127);
      const remainder = minus(value, exactNumber(high));
      if (compare(magnitude(remainder), MAX_F32) > 0) precision();
      const low = rounded(remainder, undefined, 24, -149, 127);
      highF32.push(high); lowF32.push(low);
      totalError = plus(totalError, magnitude(minus(remainder, exactNumber(low))));
    }
    return { highF32, lowF32, errorBoundLog2: ceilLog2(totalError), exact: totalError.n === 0n };
  } catch (error) {
    if (error.code === 'precision-limit') return { unavailable: true, reason: 'origin-out-of-range' };
    throw error;
  }
}

const subtract = (a, b) => a.map((x, i) => x - b[i]);
const length = v => Math.hypot(...v);
const unit = v => {
  // Scale first: a subnormal norm can round to one component's magnitude and
  // direct division by that rounded norm would not produce a unit vector.
  const largest = Math.max(...v.map(Math.abs)), scaled = v.map(x => x / largest);
  const n = length(scaled);
  return scaled.map(x => x / n);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clampPitch = pitch => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
function rotatedBasis(q) {
  const [w, x, y, z] = quaternion(q);
  return {
    right: [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    up: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    forward: [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))],
  };
}
export function basis(camera) { checkCamera(camera); return rotatedBasis(camera.orientationWxyz); }
function dimension(value, path) {
  finite(value, path, 1, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(value)) invalid('must be a positive integer', path);
}
export function angularPixelSize(camera, height) {
  checkCamera(camera); dimension(height, 'height');
  return 2 * Math.tan(camera.verticalFovDegrees * Math.PI / 360) / height;
}
export function rayDirection(camera, i, j, width, height, jitter = { dx: 0, dy: 0 }) {
  checkCamera(camera); dimension(width, 'width'); dimension(height, 'height');
  // Sample point: (i + 0.5 + dx, j + 0.5 + dy), with j and dy downward.
  // Fractional indices also describe the geometric centre of even images.
  finite(i, 'i', -0.5, width - 0.5); finite(j, 'j', -0.5, height - 0.5);
  finite(jitter?.dx, 'jitter.dx', -0.5, 0.5); finite(jitter?.dy, 'jitter.dy', -0.5, 0.5);
  const { forward, right, up } = rotatedBasis(camera.orientationWxyz);
  const h = Math.tan(camera.verticalFovDegrees * Math.PI / 360);
  const sx = (2 * ((i + 0.5 + jitter.dx) / width) - 1) * h * (width / height);
  const sy = (1 - 2 * ((j + 0.5 + jitter.dy) / height)) * h;
  return unit(forward.map((x, axis) => x + sx * right[axis] + sy * up[axis]));
}

// Quaternion from a right-handed rotation matrix whose columns are r, u, -f.
function orientation(forward, fallbackRight) {
  let right = cross(forward, [0, 0, 1]);
  if (length(right) < 1e-14) {
    // At a pole, retain the previous horizontal heading; no NaN or arbitrary roll.
    right = [fallbackRight[0], fallbackRight[1], 0];
    if (length(right) < 1e-14) right = [1, 0, 0];
  }
  right = unit(right);
  const up = unit(cross(right, forward)), back = forward.map(x => -x);
  const m = [right, up, back];
  const at = (row, col) => m[col][row], trace = at(0, 0) + at(1, 1) + at(2, 2);
  let q;
  if (trace > 0) {
    const s = 2 * Math.sqrt(1 + trace);
    q = [s / 4, (at(2, 1) - at(1, 2)) / s, (at(0, 2) - at(2, 0)) / s, (at(1, 0) - at(0, 1)) / s];
  } else {
    let i = 0;
    if (at(1, 1) > at(i, i)) i = 1;
    if (at(2, 2) > at(i, i)) i = 2;
    const j = (i + 1) % 3, k = (j + 1) % 3;
    const s = 2 * Math.sqrt(Math.max(0, 1 + at(i, i) - at(j, j) - at(k, k)));
    q = [(at(k, j) - at(j, k)) / s, 0, 0, 0];
    q[i + 1] = s / 4; q[j + 1] = (at(j, i) + at(i, j)) / s; q[k + 1] = (at(k, i) + at(i, k)) / s;
  }
  return quaternion(q);
}
const coincident = camera => camera.positionLocal.every((x, i) => x === camera.focusLocal[i]);
// Navigation is transactional: coincident, non-finite or over-limit results
// return the input camera. B12 may recentre first and retry; it must retain the
// refusal detail (focus re-expression is not a claim about fractal depth).
function moved(camera, patch) {
  const candidate = { ...camera, ...patch };
  if (coincident(candidate)) return camera;
  for (const key of ['positionLocal', 'focusLocal']) {
    if (candidate[key].some(x => !Number.isFinite(x)) || length(candidate[key]) > CAMERA_LIMITS.localMagnitude) return camera;
  }
  return candidate;
}
export function lookAt(camera, focusLocal) {
  checkCamera(camera); vector(focusLocal, 'focusLocal');
  const delta = subtract(focusLocal, camera.positionLocal);
  if (length(delta) === 0) return camera;
  return { ...camera, focusLocal: [...focusLocal], orientationWxyz: orientation(unit(delta), rotatedBasis(camera.orientationWxyz).right) };
}
export function resetOrientation(camera) { return lookAt(camera, camera.focusLocal); }
export function orbit(camera, dYaw, dPitch) {
  checkCamera(camera); finite(dYaw, 'dYaw'); finite(dPitch, 'dPitch');
  if (coincident(camera)) return camera;
  const offset = subtract(camera.positionLocal, camera.focusLocal), distance = length(offset);
  let heading = Math.atan2(offset[1], offset[0]);
  if (offset[0] === 0 && offset[1] === 0) {
    const { right } = rotatedBasis(camera.orientationWxyz);
    const horizontal = [right[0], right[1], 0];
    const r = length(horizontal) < 1e-14 ? [1, 0, 0] : unit(horizontal);
    heading = Math.atan2(-r[0], r[1]);
  }
  const yaw = heading + dYaw % (2 * Math.PI);
  const pitch = clampPitch(Math.atan2(offset[2], Math.hypot(offset[0], offset[1])) + dPitch);
  const v = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  const result = moved(camera, { positionLocal: v.map((x, i) => camera.focusLocal[i] + distance * x) });
  return result === camera ? camera : lookAt(result, camera.focusLocal);
}
// Pan dx/dy are camera-local distances along right/up; B12 converts pixels or
// focus heights to these units. Pan preserves a deliberately rolled orientation.
export function pan(camera, dx, dy) {
  checkCamera(camera); finite(dx, 'dx'); finite(dy, 'dy');
  const { right, up } = rotatedBasis(camera.orientationWxyz);
  const displacement = right.map((x, i) => x * dx + up[i] * dy);
  return moved(camera, {
    positionLocal: camera.positionLocal.map((x, i) => x + displacement[i]),
    focusLocal: camera.focusLocal.map((x, i) => x + displacement[i]),
  });
}
// Factor multiplies focus distance (<1 approaches; >1 recedes). Zero or a
// positive factor that rounds onto the focus is refused by moved(). Negative
// factors are invalid. Externally supplied coincident cameras remain no-ops.
export function dolly(camera, factor) {
  checkCamera(camera); finite(factor, 'factor', 0);
  if (coincident(camera) || factor === 1) return camera;
  const offset = subtract(camera.positionLocal, camera.focusLocal);
  return moved(camera, { positionLocal: offset.map((x, i) => camera.focusLocal[i] + factor * x) });
}

// Axis lock convention: fixed world XYZ Euler angles, R = Rz(z) Ry(y) Rx(x).
// Preserve the current locked angle, use the requested other two. At gimbal lock
// canonicalize x=0 and solve z; full (unlocked) orientation never passes via Euler.
// Control labels: tilt(x), roll(y), heading(z). For upright y=0, x=90 degrees
// plus forward elevation and z is the right-vector heading. These coordinates
// are coupled off upright; at y=+/-90 degrees x/z are not independent physical
// locks. Locks apply to the canonical coordinates, not to a unique Euler triple.
function euler(q) {
  const { right: r, up: u, forward: f } = rotatedBasis(q);
  const y = Math.asin(Math.max(-1, Math.min(1, -r[2])));
  return Math.abs(Math.cos(y)) > 1e-12
    ? [Math.atan2(u[2], -f[2]), y, Math.atan2(r[1], r[0])]
    : [0, y, Math.atan2(-u[0], u[1])];
}
function fromEuler([x, y, z]) {
  const [cx, cy, cz] = [x, y, z].map(a => Math.cos(a / 2));
  const [sx, sy, sz] = [x, y, z].map(a => Math.sin(a / 2));
  return quaternion([cx * cy * cz + sx * sy * sz, sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz]);
}
export function setOrientation(camera, wxyz, { lockAxis = null } = {}) {
  checkCamera(camera); const q = quaternion(wxyz);
  if (![null, 'x', 'y', 'z'].includes(lockAxis)) invalid('unknown locked axis', 'lockAxis');
  if (lockAxis === null) return { ...camera, orientationWxyz: q };
  const requested = euler(q), current = euler(camera.orientationWxyz), index = ['x', 'y', 'z'].indexOf(lockAxis);
  requested[index] = current[index];
  return { ...camera, orientationWxyz: fromEuler(requested) };
}
function nextUpPositive(value) {
  if (!(value > 0) || !Number.isFinite(value)) return value;
  binary64.setFloat64(0, value);
  binary64.setBigUint64(0, binary64.getBigUint64(0) + 1n);
  return binary64.getFloat64(0);
}
export function overview(model, effective) {
  if (!model || typeof model.enclosingVolume !== 'function') invalid('overview requires a model record', 'model');
  const volume = model.enclosingVolume(effective);
  let centre = [0, 0, 0], radius;
  if (volume.kind === 'sphere') { radius = volume.radius; centre = volume.centre ?? centre; }
  else if (volume.kind === 'box') {
    vector(volume.min, 'volume.min'); vector(volume.max, 'volume.max');
    centre = volume.min.map((x, i) => (x + volume.max[i]) / 2);
    // Round the computed box half-diagonal outward to enclose its corners.
    radius = nextUpPositive(length(volume.max.map((x, i) => (x - volume.min[i]) / 2)));
  } else invalid('unsupported enclosing volume', 'model');
  finite(radius, 'radius', Number.MIN_VALUE, CAMERA_LIMITS.localMagnitude / 2.5);
  const direction = [1.92, -1.44, 0.7], directionLength = length(direction);
  const c = {
    kind: CAMERA_KIND, anchor: ['0', '0', '0'], scale: { mantissa: 1, exponent: 0 },
    // Preserve the frozen P3 convention: normalize, multiply by 2.5, then radius.
    positionLocal: direction.map((x, i) => centre[i] + (x / directionLength) * 2.5 * radius),
    focusLocal: [...centre], orientationWxyz: [1, 0, 0, 0], verticalFovDegrees: 60,
  };
  return lookAt(c, centre);
}
export function equalCameras(a, b) {
  checkCamera(a); checkCamera(b);
  if (a.verticalFovDegrees !== b.verticalFovDegrees) return false;
  for (const field of ['positionLocal', 'focusLocal']) {
    const left = world(a, field), right = world(b, field);
    if (left.some((x, i) => compare(x, right[i]) !== 0)) return false;
  }
  const left = quaternion(a.orientationWxyz), right = quaternion(b.orientationWxyz);
  // History/change detection only, never cache keys or stored-scene identity.
  // Only rotation comparison has a roundoff allowance (eight binary64 epsilons).
  // Coordinates/focus compare exactly, so a deep movement is never suppressed.
  return [1, -1].some(sign => left.every((x, i) => Math.abs(x - sign * right[i]) <= 8 * Number.EPSILON));
}

// Rates: yaw/pitch radians per second; translation axes are dimensionless,
// speed is CAMERA-LOCAL units per second (world speed = speed * scale).
// Translation uses the updated forward/right;
// rise is world Z. No diagonal normalization or elapsed-time clamp here (B12 owns
// input response and its 100 ms elapsed clamp). Focus distance follows the turn.
export function flightStep(camera, input, speed, dtSeconds) {
  checkCamera(camera); finite(speed, 'speed', 0); finite(dtSeconds, 'dtSeconds', 0);
  const axes = {};
  for (const key of ['forward', 'strafe', 'rise', 'yaw', 'pitch']) axes[key] = finite(input?.[key] ?? 0, key);
  if (coincident(camera) || dtSeconds === 0) return camera;
  const oldBasis = rotatedBasis(camera.orientationWxyz);
  const yawDelta = axes.yaw * dtSeconds, pitchDelta = axes.pitch * dtSeconds;
  if (!Number.isFinite(yawDelta) || !Number.isFinite(pitchDelta)) return camera;
  const yaw = Math.atan2(oldBasis.forward[1], oldBasis.forward[0]) + yawDelta % (2 * Math.PI);
  const pitch = clampPitch(Math.atan2(oldBasis.forward[2], Math.hypot(...oldBasis.forward.slice(0, 2))) + pitchDelta);
  const forward = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  const q = orientation(forward, oldBasis.right), right = rotatedBasis(q).right;
  const movement = forward.map((x, i) => axes.forward * x + axes.strafe * right[i] + (i === 2 ? axes.rise : 0));
  if (movement.some(x => !Number.isFinite(x))) return camera;
  const travel = speed * dtSeconds;
  if (!Number.isFinite(travel)) return camera;
  const positionLocal = camera.positionLocal.map((x, i) => x + travel * movement[i]);
  const distance = length(subtract(camera.focusLocal, camera.positionLocal));
  return moved(camera, { positionLocal, focusLocal: positionLocal.map((x, i) => x + distance * forward[i]), orientationWxyz: q });
}

// Point shape: {anchor: decimal[3], scale: {mantissa,exponent}, positionLocal: [3]}.
// A point's local components may be any finite doubles; the camera's local norm
// limit applies when toLocal prepares it for lookAt. Depth is ordinary WORLD ray
// distance, pixel is B00's [x,y]; it is never a camera-local depth or a world f32.
// If re-expression cannot fit a binary64 local or camera focus, return
// {unavailable:true, reason:'precision-limit'}. B10/B12 treat it as an unresolved
// pick: no gesture and no camera change. Invalid inputs still throw SceneError.
export function reconstructHit(camera, pixel, jitter, depth, width, height) {
  checkCamera(camera); finite(depth, 'depth', 0);
  if (!Array.isArray(pixel) || pixel.length !== 2) invalid('pixel must be [x,y]', 'pixel');
  const direction = rayDirection(camera, pixel[0], pixel[1], width, height, jitter);
  try {
    const s = exactScale(camera.scale), t = exactNumber(depth);
    const positionLocal = camera.positionLocal.map((x, i) => rounded(plus(multiply(s, exactNumber(x)), multiply(t, exactNumber(direction[i]))), s));
    return { anchor: [...camera.anchor], scale: { ...camera.scale }, positionLocal };
  } catch (error) { if (error.code === 'precision-limit') return { ...PICK_UNAVAILABLE }; throw error; }
}
export function toLocal(camera, anchoredPoint) {
  checkCamera(camera);
  requireObject(anchoredPoint, 'anchoredPoint', ['anchor', 'scale', 'positionLocal']);
  checkAnchor(anchoredPoint.anchor); checkScale(anchoredPoint.scale); vector(anchoredPoint.positionLocal, 'positionLocal', null);
  try {
    const s = exactScale(camera.scale);
    const local = world(anchoredPoint).map((value, i) => rounded(minus(value, anchorDecimal(camera.anchor[i])), s));
    if (length(local) > CAMERA_LIMITS.localMagnitude) precision('local-range');
    return local;
  } catch (error) { if (error.code === 'precision-limit') return { ...PICK_UNAVAILABLE }; throw error; }
}
