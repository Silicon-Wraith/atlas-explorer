// spikes/project0/remediation/exact.js — exact dyadic arithmetic for the G5-A CPU models (prereg rev 2 §2.5). A value is m·2^e with a
// BigInt m; addition and multiplication are exact, and R rounds once to binary32, round-to-nearest ties-to-even. F(a,b,c) is a correctly
// rounded fused multiply-add computed exactly (never a binary64 multiply-add followed by Math.fround). Overflow throws, and every
// rounding that produces a subnormal or flushes a nonzero value to zero is counted in RANGE, so callers can prove the range assumptions.
const D = (m, e) => ({ m: BigInt(m), e });
export const ZERO = D(0, 0), ONE = D(1, 0);
export const RANGE = { subnormalOrUnderflow: 0 };
export const neg = a => D(-a.m, a.e);
export function add(a, b) {
  if (a.m === 0n) return b;
  if (b.m === 0n) return a;
  const e = Math.min(a.e, b.e);
  return D((a.m << BigInt(a.e - e)) + (b.m << BigInt(b.e - e)), e);
}
export const sub = (a, b) => add(a, neg(b));
export const mul = (a, b) => D(a.m * b.m, a.e + b.e);
const bitlen = m => (m < 0n ? -m : m).toString(2).length;
export const isZero = a => a.m === 0n;
export const compare = (a, b) => { const d = sub(a, b).m; return d < 0n ? -1 : d > 0n ? 1 : 0; };

export function R(a) {
  if (a.m === 0n) return ZERO;
  const s = a.m < 0n ? -1n : 1n;
  let m = a.m * s;
  const top = a.e + bitlen(m) - 1;                 // exponent of the leading bit
  const q = Math.max(top - 23, -149);              // quantum exponent of the binary32 result
  if (q > a.e) {
    const sh = BigInt(q - a.e), r = m & ((1n << sh) - 1n), half = 1n << (sh - 1n);
    m >>= sh;
    if (r > half || (r === half && (m & 1n))) m += 1n;
  } else m <<= BigInt(a.e - q);
  if (bitlen(m) - 1 + q > 127) throw new Error('binary32 overflow in an exact model');
  if (m === 0n || bitlen(m) - 1 + q < -126) RANGE.subnormalOrUnderflow++;
  return m === 0n ? ZERO : D(s * m, q);
}
export const F = (a, b, c) => R(add(mul(a, b), c));      // fused: one rounding of the exact a·b + c
export const U = (a, b, c) => R(add(R(mul(a, b)), c));   // unfused: the product rounded first

// binary32 bit patterns <-> exact values. Zeros of either sign map to ZERO (the supplementary comparisons normalise ±0, §2.6).
export function fromBits(word) {
  const w = word >>> 0, sign = w >>> 31, ex = (w >>> 23) & 0xff, frac = w & 0x7fffff;
  if (ex === 0xff) throw new Error(`nonfinite binary32 input ${w.toString(16)}`);
  const m = ex === 0 ? BigInt(frac) : BigInt(frac | 0x800000), e = ex === 0 ? -149 : ex - 150;
  return m === 0n ? ZERO : D(sign ? -m : m, e);
}
export function toBits(a) {
  if (a.m === 0n) return 0;
  const s = a.m < 0n ? 1 : 0;
  let m = a.m < 0n ? -a.m : a.m, e = a.e;
  while (bitlen(m) < 24 && e > -149) { m <<= 1n; e--; }
  while (bitlen(m) > 24) { if (m & 1n) throw new Error('toBits: not a binary32 value'); m >>= 1n; e++; }
  if (e === -149 && bitlen(m) < 24) return ((s << 31) | Number(m)) >>> 0;     // subnormal
  const ex = e + 150;
  if (ex < 1 || ex > 254) throw new Error('toBits: exponent out of range');
  return ((s << 31) | (ex << 23) | (Number(m) & 0x7fffff)) >>> 0;
}
export function fromNumber(x) {                          // x must already be a binary32 value
  if (Math.fround(x) !== x) throw new Error(`fromNumber: ${x} is not a binary32 value`);
  return fromBits(new Uint32Array(Float32Array.of(x).buffer)[0]);
}
export function toNumber(a) { const u = new Uint32Array([toBits(a)]); return new Float32Array(u.buffer)[0]; }
export const hex = word => (word >>> 0).toString(16).padStart(8, '0');
// the exact identity high + low = exact operation, checked without any rounding
export const isExactSum = (high, low, exact) => sub(add(high, low), exact).m === 0n;
