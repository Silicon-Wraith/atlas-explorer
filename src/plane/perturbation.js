import { smoothIteration } from './math.js';

// CPU counterpart of the GPU recurrence, with 64-bit mantissas. Reference
// iterations and pixel iterations are deliberately independent after rebasing.
export function prepareOrbit(orbit) {
  const prepared = new Float64Array(orbit.length);
  for (let i = 0; i < orbit.length; i += 4) {
    const scale = 2 ** orbit[i + 2];
    prepared[i] = orbit[i] * scale; prepared[i + 1] = orbit[i + 1] * scale;
  }
  return prepared;
}
export function perturbEscape(orbit, length, dcx, dcy, maxIterations, prepared = false) {
  let dx = 0, dy = 0, m = 0, stripe = .5;
  for (let n = 1; n <= maxIterations; n++) {
    const index = m * 4;
    const scale = prepared ? 1 : 2 ** orbit[index + 2];
    const zx = orbit[index] * scale, zy = orbit[index + 1] * scale;
    const nx = 2 * (zx * dx - zy * dy) + dx * dx - dy * dy + dcx;
    dy = 2 * (zx * dy + zy * dx) + 2 * dx * dy + dcy;
    dx = nx; m++;
    const next = m * 4, nextScale = prepared ? 1 : 2 ** orbit[next + 2];
    const x = orbit[next] * nextScale + dx, y = orbit[next + 1] * nextScale + dy;
    const r2 = x * x + y * y;
    // sin(3θ) = sin(θ) * (3 - 4 sin²(θ)); avoids two transcendental calls
    // per iteration while preserving the same orbit-stripe coloring.
    const sine = r2 ? y / Math.sqrt(r2) : 0;
    stripe = stripe * .72 + (.5 + .5 * sine * (3 - 4 * sine * sine)) * .28;
    if (r2 > 256) return [smoothIteration(n, r2), stripe];
    if (r2 < dx * dx + dy * dy || m >= length - 1) { dx = x; dy = y; m = 0; }
  }
  return [-1, .5];
}

export function normalize([r, i, exponent]) {
  const magnitude = Math.max(Math.abs(r), Math.abs(i));
  if (!magnitude) return [0, 0, 0];
  const shift = Math.floor(Math.log2(magnitude));
  return [r * 2 ** -shift, i * 2 ** -shift, exponent + shift];
}
export function addExtended(a, b) {
  if (!a[0] && !a[1]) return b;
  if (!b[0] && !b[1]) return a;
  const exponent = Math.max(a[2], b[2]);
  const sa = 2 ** Math.max(-1074, a[2] - exponent), sb = 2 ** Math.max(-1074, b[2] - exponent);
  return normalize([a[0] * sa + b[0] * sb, a[1] * sa + b[1] * sb, exponent]);
}
export function multiplyExtended(a, b) {
  return normalize([a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0], a[2] + b[2]]);
}
function logMagnitude(a) { return !a[0] && !a[1] ? -Infinity : Math.log2(Math.hypot(a[0], a[1])) + a[2]; }
export function perturbEscapeExtended(orbit, length, dc, maxIterations) {
  let delta = [0, 0, 0], m = 0, stripe = .5;
  for (let n = 1; n <= maxIterations; n++) {
    const ref = [orbit[m * 4], orbit[m * 4 + 1], orbit[m * 4 + 2]];
    const linear = multiplyExtended(ref, delta); linear[2]++;
    delta = addExtended(addExtended(linear, multiplyExtended(delta, delta)), dc); m++;
    const z = addExtended([orbit[m * 4], orbit[m * 4 + 1], orbit[m * 4 + 2]], delta);
    const logR = logMagnitude(z);
    stripe = stripe * .72 + (.5 + .5 * Math.sin(3 * Math.atan2(z[1], z[0]))) * .28;
    if (logR > 4) return [n + 1 - Math.log2(logR), stripe];
    if (logR < logMagnitude(delta) || m >= length - 1) { delta = z; m = 0; }
  }
  return [-1, .5];
}
