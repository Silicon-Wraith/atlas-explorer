// Coordinates are decimal fixed point with an adaptive BigInt denominator.
// A floating-point number is never used to store the centre of a deep view.
export const LOG2_10 = Math.log2(10);
export const INITIAL_VIEW = Object.freeze({ re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 });

export function precisionFor(zoom) {
  return Math.max(40, Math.ceil(zoom) + 36);
}

export function fixed(value, digits) {
  const match = String(value).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match || !(match[2] || match[3])) throw new Error('Enter a valid decimal coordinate.');
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  const power = digits + Number(exponent) - fraction.length;
  if (!Number.isSafeInteger(power)) throw new Error('Coordinate exponent is too large.');
  const coefficient = BigInt((whole || '0') + fraction) * (sign === '-' ? -1n : 1n);
  return power >= 0 ? coefficient * 10n ** BigInt(power) : coefficient / 10n ** BigInt(-power);
}

export function decimal(value, digits) {
  const sign = value < 0n ? '-' : '';
  const str = (value < 0n ? -value : value).toString().padStart(digits + 1, '0');
  const fraction = str.slice(-digits).replace(/0+$/, '');
  return `${sign}${str.slice(0, -digits)}${fraction ? `.${fraction}` : ''}`;
}

export function spanFixed(zoom, digits) {
  const exponent = Math.floor(zoom);
  const coefficient = BigInt(Math.round(3.4 * 10 ** (exponent - zoom) * 1e15));
  const power = digits - exponent - 15;
  return power >= 0 ? coefficient * 10n ** BigInt(power) : coefficient / 10n ** BigInt(-power);
}

function fractionOf(value, factor) {
  return value * BigInt(Math.round(factor * 1e12)) / 1_000_000_000_000n;
}

// x/y are offsets from the viewport centre in units of viewport width.
export function moveView(view, dx, dy) {
  const digits = precisionFor(view.zoom);
  const span = spanFixed(view.zoom, digits);
  return { ...view, re: decimal(fixed(view.re, digits) + fractionOf(span, dx), digits), im: decimal(fixed(view.im, digits) + fractionOf(span, dy), digits) };
}

export function zoomView(view, zoom, x = 0, y = 0) {
  zoom = Math.max(-0.6, zoom);
  if (!Number.isFinite(zoom)) return view;
  const digits = precisionFor(Math.max(view.zoom, zoom));
  const difference = spanFixed(view.zoom, digits) - spanFixed(zoom, digits);
  return { re: decimal(fixed(view.re, digits) + fractionOf(difference, x), digits), im: decimal(fixed(view.im, digits) + fractionOf(difference, y), digits), zoom };
}

// Reproject a completed image while the next view is calculated. Subtract exact
// coordinates before converting the small, viewport-relative offsets to Number.
export function viewTransform(previous, next, width) {
  const digits = precisionFor(Math.max(previous.zoom, next.zoom));
  const span = spanFixed(next.zoom, digits);
  const ratio = difference => Number(difference * 1_000_000_000_000n / span) / 1e12;
  return {
    scale: 10 ** (next.zoom - previous.zoom),
    x: ratio(fixed(previous.re, digits) - fixed(next.re, digits)) * width,
    y: ratio(fixed(next.im, digits) - fixed(previous.im, digits)) * width,
  };
}

// A complex mantissa plus a separate binary exponent never underflows at deep zoom.
export function floatExp(re, im, digits) {
  const ar = re < 0n ? -re : re;
  const ai = im < 0n ? -im : im;
  const largest = ar > ai ? ar : ai;
  if (!largest) return [0, 0, 0];
  const bits = largest.toString(2).length;
  const shift = Math.max(0, bits - 53);
  const logUnit = digits * LOG2_10;
  const exponent = Math.floor(bits - 1 - logUnit);
  const scale = 2 ** (shift - logUnit - exponent);
  // Division truncates toward zero, avoiding a negative-zero rounding bias.
  const divisor = 1n << BigInt(shift);
  return [Number(re / divisor) * scale, Number(im / divisor) * scale, exponent];
}

export function referenceOrbit(view, iterations, ArrayType = Float32Array) {
  const digits = precisionFor(view.zoom);
  const unit = 10n ** BigInt(digits);
  const cr = fixed(view.re, digits), ci = fixed(view.im, digits);
  const orbit = new ArrayType((iterations + 1) * 4);
  let zr = 0n, zi = 0n, length = 1;
  const escape = 256n * unit * unit;
  for (let n = 1; n <= iterations; n++) {
    const rr = zr * zr, ii = zi * zi;
    zi = (2n * zr * zi) / unit + ci;
    zr = (rr - ii) / unit + cr;
    const [r, i, e] = floatExp(zr, zi, digits);
    orbit[n * 4] = r; orbit[n * 4 + 1] = i; orbit[n * 4 + 2] = e;
    length = n + 1;
    if (zr * zr + zi * zi > escape) break;
  }
  return { orbit: orbit.slice(0, length * 4), length, digits };
}

export function interior(re, im) {
  const q = (re - .25) ** 2 + im * im;
  return q * (q + re - .25) <= .25 * im * im || (re + 1) ** 2 + im * im <= .0625;
}

export function smoothIteration(n, magnitudeSquared) {
  return n + 1 - Math.log2(Math.log(magnitudeSquared) / (2 * Math.LN2));
}

export function escapeTime(re, im, iterations = 1000) {
  if (interior(re, im)) return -1;
  let zr = 0, zi = 0;
  for (let n = 1; n <= iterations; n++) {
    const next = zr * zr - zi * zi + re;
    zi = 2 * zr * zi + im; zr = next;
    const mag = zr * zr + zi * zi;
    if (mag > 256) return smoothIteration(n, mag);
  }
  return -1;
}

// Independent high-precision oracle, also used by the non-WebGL renderer.
export function escapeTimeExact(re, im, digits, iterations = 1000) {
  const unit = 10n ** BigInt(digits);
  const cr = typeof re === 'bigint' ? re : fixed(re, digits);
  const ci = typeof im === 'bigint' ? im : fixed(im, digits);
  let zr = 0n, zi = 0n;
  const escape = 256n * unit * unit;
  for (let n = 1; n <= iterations; n++) {
    const next = (zr * zr - zi * zi) / unit + cr;
    zi = 2n * zr * zi / unit + ci; zr = next;
    if (zr * zr + zi * zi > escape) {
      const [r, i, e] = floatExp(zr, zi, digits);
      return n + 1 - Math.log2((Math.log(Math.hypot(r, i)) + e * Math.LN2) / Math.LN2);
    }
  }
  return -1;
}

export function validateView(input) {
  if (!input || typeof input.re !== 'string' || typeof input.im !== 'string' || !Number.isFinite(input.zoom) || input.zoom < -.6) throw new Error('Invalid location.');
  const digits = precisionFor(input.zoom);
  const limit = 4n * 10n ** BigInt(digits);
  for (const coordinate of [input.re, input.im]) {
    const value = fixed(coordinate, digits);
    if (value < -limit || value > limit) throw new Error('Coordinates must be between −4 and 4.');
  }
  return { re: input.re, im: input.im, zoom: input.zoom };
}
