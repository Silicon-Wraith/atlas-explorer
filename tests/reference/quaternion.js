import { arithmetic, derivativeUpdate, orbitResult, nextUp, nextUp64 } from './f32.js';

// Upward interval evaluation of R, including its final binary32 conversion.
// C=0 and all cases whose bound is exactly 2 keep that exact lower bound.
export function quaternionBound(C) {
  if (!Array.isArray(C) || C.length !== 4 || C.some(x => !Number.isFinite(x) || Math.abs(x) > 4)) return null;
  let squared = 0;
  for (const x of C) squared = nextUp64(squared + nextUp64(x * x));
  const norm = nextUp64(Math.sqrt(squared));
  const discriminant = nextUp64(1 + nextUp64(4 * norm));
  const raw = nextUp64(nextUp64(1 + nextUp64(Math.sqrt(discriminant))) / 2);
  if (raw <= 2) return 2;
  const nearest = Math.fround(raw);
  return nearest >= raw ? nearest : nextUp(nearest);
}
export function componentsAgree(actual, expected, relative = 1e-4, floor = 1e-6) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((v, i) => Number.isFinite(v) && Math.abs(v - expected[i]) <= Math.max(floor, relative * Math.abs(expected[i])));
}
export function quaternionOrbit(q0, C, cap, { bound, precision = 'f64', history = false } = {}) {
  const fail = () => ({ status: 'numerical failure', escapeIndex: null, estimateAvailable: false, log2DE: null });
  if (!Array.isArray(q0) || q0.length !== 4 || !Array.isArray(C) || C.length !== 4 || !Number.isInteger(cap) || cap < 1 || cap > 512 ||
      [...q0, ...C].some(x => !Number.isFinite(x)) || C.some(x => Math.abs(x) > 4)) return fail();
  const { round, add, sub, mul, norm } = arithmetic(precision);
  // Prevent the norm's sum of squares overflowing, before executing it.
  const coordinateLimit = precision === 'f32' ? 2 ** 62 : 2 ** 510;
  if (q0.some(x => Math.abs(x) > coordinateLimit)) return fail();
  const parameter = C.map(round);
  bound ??= quaternionBound(parameter);
  if (!(Number.isFinite(bound) && bound >= 2 && bound <= 4)) return fail();
  let q = q0.map(round), derivative = { zero: false, mantissa: 1, exponent: 0 };
  const orbit = history ? [[...q]] : null;
  for (let n = 0; n <= cap; n++) {
    const radius = norm(q);
    if (radius > bound) return orbitResult('escaped', q, n, derivative, history ? { orbit } : {});
    if (n === cap) return orbitResult('not escaped within iteration budget', q, null, derivative, history ? { orbit } : {});
    derivative = derivative && derivativeUpdate(derivative, mul(2, radius), 0, precision);
    const [a, b, c, d] = q;
    q = [add(sub(sub(sub(mul(a, a), mul(b, b)), mul(c, c)), mul(d, d)), parameter[0]),
      add(mul(mul(2, a), b), parameter[1]), add(mul(mul(2, a), c), parameter[2]), add(mul(mul(2, a), d), parameter[3])];
    if (history) orbit.push([...q]);
  }
}

// Exact requested-decimal admission beside the binary32 boundary fixtures.
// This is a small reference predicate, not a production scene codec.
export function admitsRequestedComponent(text) {
  if (typeof text !== 'string') return false;
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return false;
  const digits = match[2] + (match[3] ?? ''), exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (digits.length > 128 || !Number.isSafeInteger(exponent) || Math.abs(exponent) > 512) return false;
  const integer = BigInt(digits);
  return exponent >= 0 ? integer * 10n ** BigInt(exponent) <= 4n : integer <= 4n * 10n ** BigInt(-exponent);
}
