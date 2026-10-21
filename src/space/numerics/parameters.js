// Requested decimal values stay textual. Admission precedes binary64/binary32
// conversion; neither conversion is an exact-decimal range check.
import { SceneError, requireObject, deepFreeze } from '../../shared/scene.js';

export const MAX_PARAMETER_DIGITS = 64;
export const ANCHOR_LIMITS = deepFreeze({ digits: 400, exponent: [-400, 400] });
const invalid = (message, path) => { throw new SceneError('invalid-value', message, path); };
const isDigit = char => char >= '0' && char <= '9';

// A bounded accumulator, even for very long runs of leading zeros. Significant
// digits count from the first nonzero through the end of the mantissa (including
// trailing zeros). The explicit e/E exponent is bounded; the returned exponent
// includes the decimal point and normalization and can therefore exceed that bound.
function parseBoundedDecimal(text, path, maxDigits) {
  if (typeof text !== 'string') invalid('must be a decimal string', path);
  let i = text[0] === '-' ? 1 : 0;
  const sign = i ? -1 : 1;
  let digits = '', fractionDigits = 0;
  function consumeDigits(fraction) {
    const start = i;
    while (isDigit(text[i])) {
      if (digits.length || text[i] !== '0') {
        if (digits.length === maxDigits) invalid(`at most ${maxDigits} significant digits are supported`, path);
        digits += text[i];
      }
      if (fraction) fractionDigits++;
      i++;
    }
    if (i === start) invalid('must match -?digits[.digits][e[+-]digits]', path);
  }
  consumeDigits(false);
  if (text[i] === '.') { i++; consumeDigits(true); }
  let exponent = 0;
  if (text[i] === 'e' || text[i] === 'E') {
    i++;
    const exponentSign = text[i] === '-' ? -1 : 1;
    if (text[i] === '-' || text[i] === '+') i++;
    const start = i;
    while (isDigit(text[i])) {
      exponent = exponent * 10 + Number(text[i++]);
      if (exponent > 400) invalid('the explicit decimal exponent must be in [-400, 400]', path);
    }
    if (i === start) invalid('the exponent needs digits', path);
    exponent *= exponentSign;
  }
  if (i !== text.length) invalid('must be a decimal string without whitespace', path);
  if (!digits) return { sign, digits: '0', exponent: 0 };
  exponent -= fractionDigits;
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return { sign, digits, exponent };
}

export function parseDecimal(text, path = '') {
  return parseBoundedDecimal(text, path, MAX_PARAMETER_DIGITS);
}

// B05 consumes the same admission rule as scene import. For a nonzero anchor,
// k is its leading decimal position, after removing leading/trailing zeros.
// With <=400 digits and k in [-400,400], the normalized exponent is [-799,400].
// Storage is bounded by maxDigits even when the input contains many leading zeros;
// neither a Number anchor nor a BigInt power of ten is ever materialized here.
export function parseAnchorDecimal(text, path = '') {
  const parsed = parseBoundedDecimal(text, path, ANCHOR_LIMITS.digits);
  if (parsed.digits !== '0') {
    const k = parsed.digits.length + parsed.exponent - 1;
    if (k < ANCHOR_LIMITS.exponent[0] || k > ANCHOR_LIMITS.exponent[1]) invalid('the anchor leading decimal position must be in [-400, 400]', path);
  }
  return parsed;
}

export function compareDecimal(a, b) {
  const left = parseDecimal(a), right = parseDecimal(b);
  if (left.digits === '0') return right.digits === '0' ? 0 : -right.sign;
  if (right.digits === '0') return left.sign;
  if (left.sign !== right.sign) return left.sign;
  const leftOrder = left.digits.length + left.exponent, rightOrder = right.digits.length + right.exponent;
  if (leftOrder !== rightOrder) return (leftOrder < rightOrder ? -1 : 1) * left.sign;
  // Padding is at most 64 digits, never proportional to an exponent.
  const width = Math.max(left.digits.length, right.digits.length);
  const ld = left.digits.padEnd(width, '0'), rd = right.digits.padEnd(width, '0');
  return ld === rd ? 0 : (ld < rd ? -1 : 1) * left.sign;
}

export function inRange(text, lo, hi) {
  return compareDecimal(text, lo) >= 0 && compareDecimal(text, hi) <= 0;
}

// Conversions reject overflow; underflow (including signed zero) stays defined.
// effectiveParameters additionally admits each model's exact requested domain.
export function toDouble(text) {
  parseDecimal(text);
  const value = Number(text);
  if (!Number.isFinite(value)) invalid('the decimal must convert to a finite binary64 value', '');
  return value;
}

const binary32 = new DataView(new ArrayBuffer(4));
function bits32(value) { binary32.setFloat32(0, value); return binary32.getUint32(0); }
function fromBits32(bits) { binary32.setUint32(0, bits); return binary32.getFloat32(0); }

export function toBinary32(text) {
  // Ordinary-profile semantics deliberately use two stages, including double rounding.
  const double = toDouble(text), value = Math.fround(double);
  if (!Number.isFinite(value)) invalid('the decimal must convert to a finite binary32 value', '');
  return { requested: text, double, value, bits: bits32(value).toString(16).padStart(8, '0') };
}

export function effectiveParameters(modelId, parameters) {
  let requested;
  if (modelId === 'mandelbulb') {
    requireObject(parameters, 'parameters', ['power']);
    if (typeof parameters.power !== 'string' || !/^[2-8]$/.test(parameters.power) || parameters.power.length !== 1) invalid('must be an integer string from "2" to "8"', 'parameters.power');
    requested = { power: parameters.power };
  } else if (modelId === 'quaternion-julia') {
    requireObject(parameters, 'parameters', ['C', 'kappa']);
    if (!Array.isArray(parameters.C) || parameters.C.length !== 4) invalid('must contain four decimal strings', 'parameters.C');
    const component = (text, path) => {
      parseDecimal(text, path);
      if (!inRange(text, '-4', '4')) invalid('must be in [-4, 4] before rounding', path);
      return text;
    };
    requested = { C: Array.from({ length: 4 }, (_, i) => component(parameters.C[i], `parameters.C[${i}]`)), kappa: component(parameters.kappa, 'parameters.kappa') };
  } else if (modelId === 'menger') {
    requireObject(parameters, 'parameters', ['depth']);
    if (parameters.depth !== 1 && parameters.depth !== 2) invalid('must be 1 or 2', 'parameters.depth');
    requested = { depth: parameters.depth };
  } else if (modelId === 'sphere' || modelId === 'box') {
    requireObject(parameters, 'parameters', []); requested = {};
  } else throw new SceneError('unsupported-model', `unknown Space model ${String(modelId)}`, 'model');

  const effective = {}, bits = {};
  for (const [key, value] of Object.entries(requested)) {
    if (Array.isArray(value)) {
      const converted = value.map(toBinary32);
      effective[key] = converted.map(item => item.value); bits[key] = converted.map(item => item.bits);
    } else {
      const converted = toBinary32(String(value)); effective[key] = converted.value; bits[key] = converted.bits;
    }
  }
  return deepFreeze({ requested, effective, bits });
}

export function nextUp32(x) {
  const value = Math.fround(x);
  if (Number.isNaN(value) || value === Infinity) return value;
  if (value === 0) return 2 ** -149;
  return fromBits32(bits32(value) + (value > 0 ? 1 : -1));
}

export function nextDown32(x) {
  const value = Math.fround(x);
  if (Number.isNaN(value) || value === -Infinity) return value;
  if (value === 0) return -(2 ** -149);
  return fromBits32(bits32(value) + (value > 0 ? -1 : 1));
}

export function escapeRadius(effectiveC) {
  if (!Array.isArray(effectiveC) || effectiveC.length !== 4) invalid('must contain four effective binary32 components', 'effectiveC');
  for (let i = 0; i < 4; i++) {
    const c = effectiveC[i];
    if (!Number.isFinite(c) || Math.fround(c) !== c || Math.abs(c) > 4) invalid('must be a binary32 value in [-4, 4]', `effectiveC[${i}]`);
  }
  // All intermediates are nonnegative and every operation is monotone. Outward
  // rounding at EVERY product, sum, sqrt and final division propagates an upper
  // bound, including squared subnormals. Two successors cover rounding and the
  // binary64 sqrt evaluation before conversion. Inputs are already exact f32.
  const outward = x => nextUp32(nextUp32(Math.fround(x)));
  function radius(round) {
    let squares = round(effectiveC[0] * effectiveC[0]);
    for (let i = 1; i < 4; i++) squares = round(squares + round(effectiveC[i] * effectiveC[i]));
    const norm = round(Math.sqrt(squares));
    const discriminant = round(1 + round(4 * norm));
    return Math.max(2, round(round(1 + round(Math.sqrt(discriminant))) / 2));
  }
  return { value: radius(Math.fround), bound: radius(outward) };
}

export function sliceIsEmpty(effectiveKappa, bound) {
  return Math.abs(effectiveKappa) > bound;
}
