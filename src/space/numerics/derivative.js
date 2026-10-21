// Range-safe running derivative (spec §10.4). A derivative is either the explicit
// zero state or a positive normalized state D = m·2^e with 0.5 <= m < 1 (binary64)
// and an integer exponent. No update materializes the scalar D, so the state
// cannot overflow or underflow within any supported budget.
//
// Exactness: whenever the plain binary64 evaluation of grow·D + add stays in the
// normal range, update() returns exactly that value — round(round(grow·D) + add),
// two roundings, unfused — because scaling by a power of two is exact and each
// rounding happens at the same 53-bit precision. Outside that range the state keeps
// the same relative precision while the scalar would overflow or lose bits.

export const ZERO = Object.freeze({ zero: true });

const TWO_1000 = 2 ** 1000, TWO_M1000 = 2 ** -1000;

// x·2^k with at most one rounding, at the end (all steps scale in one direction).
function ldexp(x, k) {
  while (k > 1000) { x *= TWO_1000; k -= 1000; }
  while (k < -1000) { x *= TWO_M1000; k += 1000; }
  return x * 2 ** k;
}

// x > 0 finite → [m, e] with x = m·2^e exactly, 0.5 <= m < 1.
function frexp(x) {
  let e = Math.floor(Math.log2(x)) + 1, m = ldexp(x, -e);
  while (m >= 1) { m /= 2; e++; }
  while (m < 0.5) { m *= 2; e--; }
  return [m, e];
}

function state(m, e) { return Object.freeze({ zero: false, m, e }); }

function nonnegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a finite nonnegative number`);
  return value;
}

function checked(d) {
  if (d === ZERO) return d;
  if (d === null || typeof d !== 'object') throw new TypeError('a derivative state is the zero state or {zero: false, m, e}');
  if (d.zero === true) return ZERO;
  if (d.zero !== false || typeof d.m !== 'number' || !(d.m >= 0.5 && d.m < 1) || !Number.isSafeInteger(d.e)) {
    throw new TypeError('a nonzero derivative state needs 0.5 <= m < 1 and an integer exponent');
  }
  return d;
}

export function fromNumber(x) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw new RangeError('a derivative must be a finite nonnegative number');
  if (x === 0) return ZERO;
  const [m, e] = frexp(x);
  return state(m, e);
}

export function isZero(d) { return checked(d) === ZERO; }

// D' = grow·D + add; grow and add are finite nonnegative binary64 scalars.
export function update(d, grow, { add = 1 } = {}) {
  d = checked(d); nonnegative(grow, 'grow'); nonnegative(add, 'add');
  if (d === ZERO || grow === 0) return fromNumber(add);
  // round(grow·D) as (pm, pe): normalizing grow first keeps the product in [0.25, 1).
  const [gm, ge] = frexp(grow);
  let pm = gm * d.m, pe = ge + d.e;
  if (pm < 0.5) { pm *= 2; pe--; }
  if (add === 0) return state(pm, pe);
  const [am, ae] = frexp(add);
  const top = Math.max(pe, ae);
  // A term more than 64 binary places below the other is under half an ulp of it.
  if (top - ae > 64) return state(pm, pe);
  if (top - pe > 64) return state(am, ae);
  // Both scaled terms are >= 2^-65: the scaling is exact and the sum rounds once.
  const [m, shift] = frexp(ldexp(pm, pe - top) + ldexp(am, ae - top));
  return state(m, top + shift);
}

export function log2(d) {
  d = checked(d);
  return d === ZERO ? null : Math.log2(d.m) + d.e;
}

// The materialized scalar: Infinity when it exceeds binary64, 0 when it is below it.
export function toNumber(d) {
  d = checked(d);
  return d === ZERO ? 0 : ldexp(d.m, d.e);
}
