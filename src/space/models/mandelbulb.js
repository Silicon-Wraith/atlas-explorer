// mandelbulb@1 (spec §11.1), binary64 product CPU evaluator.
//   z0 = 0, d0 = 0 (zero state); z_{n+1} = P_p(z_n) + x; d_{n+1} = p·|z_n|^(p-1)·d_n + 1.
//   Escape after each update when |z| > 2. Estimate (§10.4, log domain):
//   log2 DE = -1 + log2 r + log2(ln r) - log2 d, with d the derivative of the escaping iterate.
// P_p uses Z-polar coordinates: θ = acos(clamp(z/r, -1, 1)), φ = atan2(y, x) with φ = 0
// on the polar axis (x = y = 0), and P_p(z) = r^p·(sin pθ·cos pφ, sin pθ·sin pφ, cos pθ);
// the power map is zero at r = 0. Integer powers use repeated multiplication (portable
// and deterministic), not Math.pow. Transcendentals are the engine's Math functions.
import { ZERO, update } from '../numerics/derivative.js';
import { checkBudget, pointIsFinite, failureResult, notEscapedResult, escapedResult } from './field.js';

export const ESCAPE_RADIUS = 2;
const VOLUME = Object.freeze({ kind: 'sphere', radius: 2 });

function power(effective) {
  const p = effective?.power;
  if (!Number.isInteger(p) || p < 2 || p > 8) throw new RangeError('effective.power must be an integer from 2 to 8');
  return p;
}

// Returns [P_p(z), r^(p-1)] for |z| = r.
function powerMap([x, y, z], r, p) {
  if (r === 0) return [[0, 0, 0], 0];
  let rp1 = 1;
  for (let k = 1; k < p; k++) rp1 *= r;
  const rp = rp1 * r;
  const theta = Math.acos(Math.min(1, Math.max(-1, z / r)));
  const phi = x === 0 && y === 0 ? 0 : Math.atan2(y, x);
  const sinTheta = Math.sin(p * theta);
  return [[rp * (sinTheta * Math.cos(p * phi)), rp * (sinTheta * Math.sin(p * phi)), rp * Math.cos(p * theta)], rp1];
}

// The shared orbit loop; onStep receives each update's iterate and derivative.
function run(effective, point, { maxIterations } = {}, onStep = () => {}) {
  const p = power(effective);
  checkBudget(maxIterations);
  if (!pointIsFinite(point)) return failureResult(0);
  let z = [0, 0, 0], d = ZERO;
  for (let n = 1; n <= maxIterations; n++) {
    const r = Math.hypot(z[0], z[1], z[2]);
    // Domain guard: an unescaped iterate has |z| <= 2, so r^p <= 256 and every
    // operation below is finite for a finite parameter point.
    if (!(r <= ESCAPE_RADIUS)) return failureResult(n);
    const [mapped, rp1] = powerMap(z, r, p);
    d = update(d, p * rp1);
    z = [mapped[0] + point[0], mapped[1] + point[1], mapped[2] + point[2]];
    onStep(z, d);
    if (Math.hypot(z[0], z[1], z[2]) > ESCAPE_RADIUS) return escapedResult(n, z, d);
  }
  return notEscapedResult(maxIterations, z);
}

export function evaluate(effective, point, options) {
  return run(effective, point, options);
}

// [{components, d}] for every update performed, through escape or the budget.
export function trace(effective, point, options) {
  const steps = [];
  run(effective, point, options, (z, d) => steps.push(Object.freeze({ components: Object.freeze([...z]), d })));
  return steps;
}

export function enclosingVolume(effective) {
  power(effective);
  return VOLUME;
}
