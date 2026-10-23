// Independent IEEE-754 helpers. Binary32 emulation is one unfused evaluation,
// not a claim about a shader compiler's permitted reassociation.
const scratch = new DataView(new ArrayBuffer(8));
export const F32_MAX = (2 - 2 ** -23) * 2 ** 127;
export function bits(value) { scratch.setFloat32(0, value); return scratch.getUint32(0); }
export function fromBits(value) { scratch.setUint32(0, value); return scratch.getFloat32(0); }
export function nextUp(value) {
  value = Math.fround(value);
  if (Number.isNaN(value) || value === Infinity) return value;
  if (value === 0) return 2 ** -149;
  return fromBits(bits(value) + (value > 0 ? 1 : -1));
}
export function nextDown(value) { return -nextUp(-value); }
export function nextUp64(value) {
  if (Number.isNaN(value) || value === Infinity) return value;
  if (value === 0) return Number.MIN_VALUE;
  scratch.setFloat64(0, value);
  scratch.setBigUint64(0, scratch.getBigUint64(0) + (value > 0 ? 1n : -1n));
  return scratch.getFloat64(0);
}
const identity = value => value;
const arithmeticModes = Object.fromEntries(['f64', 'f32'].map(precision => {
  const round = precision === 'f32' ? Math.fround : identity;
  return [precision, { round, add: (a, b) => round(a + b), sub: (a, b) => round(a - b), mul: (a, b) => round(a * b),
    norm: values => round(Math.sqrt(values.reduce((sum, value) => round(sum + round(value * value)), 0))) }];
}));
export function arithmetic(precision = 'f64') {
  if (!Object.hasOwn(arithmeticModes, precision)) throw new RangeError('unknown reference precision');
  return arithmeticModes[precision];
}
export function derivativeUpdate(state, factor, addend, precision = 'f64') {
  if (!Number.isFinite(factor) || factor < 0 || ![0, 1].includes(addend)) return null;
  const round = precision === 'f32' ? Math.fround : identity;
  if (!state || !Number.isSafeInteger(state.exponent)) return null;
  if (factor === 0 || state.zero) return addend === 0 ? { zero: true, mantissa: 0, exponent: 0 } : { zero: false, mantissa: 1, exponent: 0 };
  const shift = Math.floor(Math.log2(factor));
  let exponent = state.exponent + shift;
  let mantissa = round(state.mantissa * (factor / 2 ** shift));
  // When the addend is below the working significand it rounds away normally.
  if (addend && exponent < 1074) {
    if (exponent < -1020) return { zero: false, mantissa: 1, exponent: 0 };
    mantissa = round(mantissa + 2 ** -exponent);
  }
  while (mantissa >= 2) { mantissa = round(mantissa / 2); exponent++; }
  while (mantissa < 1) { mantissa = round(mantissa * 2); exponent--; }
  return { zero: false, mantissa, exponent };
}
export function orbitResult(status, value, escapeIndex, derivative, history = {}) {
  const radius = Math.sqrt(value.reduce((sum, x) => sum + x * x, 0));
  const logEscapeRadius = status === 'escaped' ? Math.log(radius) : null;
  const estimateAvailable = status === 'escaped' && radius > 1 && derivative !== null && !derivative.zero;
  return { status, escapeIndex, value, derivative, logEscapeRadius, estimateAvailable,
    log2DE: estimateAvailable ? -1 + Math.log2(radius) + Math.log2(Math.log(radius)) - Math.log2(derivative.mantissa) - derivative.exponent : null, ...history };
}
