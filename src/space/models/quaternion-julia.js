// quaternion-julia@1 (spec §11.2), binary64 product CPU evaluator.
//   q = (a, b, c, d) = a + bi + cj + dk; q0 = (x, y, z, κ); q_{n+1} = q_n² + C with
//   q² = (a² - b² - c² - d², 2ab, 2ac, 2ad), all four components kept and never
//   projected back into the slice. Sensitivity d0 = 1, d_{n+1} = 2‖q_n‖·d_n (range-safe).
//   Escape when ‖q‖ > R(C), tested at initialization and after each update, against
//   B02's outward-rounded bound computed from the effective C.
// Evaluation order is left to right, ((a·a - b·b) - c·c) - d·d + C0, so that on the
// invariant plane (κ = 0, C = (Cr, Ci, 0, 0), z = 0) every iterate equals the binary64
// complex recurrence exactly.
import { fromNumber, update } from '../numerics/derivative.js';
import { escapeRadius } from '../numerics/parameters.js';
import { checkBudget, pointIsFinite, failureResult, notEscapedResult, escapedResult } from './field.js';

function parameters(effective) {
  const kappa = effective?.kappa;
  if (typeof kappa !== 'number' || !Number.isFinite(kappa) || Math.fround(kappa) !== kappa || Math.abs(kappa) > 4) {
    throw new RangeError('effective.kappa must be a binary32 value in [-4, 4]');
  }
  return { C: effective.C, kappa, bound: escapeRadius(effective.C).bound };
}

const qnorm = q => Math.hypot(q[0], q[1], q[2], q[3]);

function run(effective, point, { maxIterations } = {}, onStep = () => {}) {
  const { C, kappa, bound } = parameters(effective);
  checkBudget(maxIterations);
  if (!pointIsFinite(point)) return failureResult(0);
  let q = [point[0], point[1], point[2], kappa], d = fromNumber(1);
  if (qnorm(q) > bound) return escapedResult(0, q, d);
  for (let n = 1; n <= maxIterations; n++) {
    const r = qnorm(q);
    // Domain guard: an unescaped iterate has ‖q‖ <= R(C) < 3.4, so q² + C is finite.
    if (!(r <= bound)) return failureResult(n);
    d = update(d, 2 * r, { add: 0 });
    const [a, b, c, k] = q;
    q = [a * a - b * b - c * c - k * k + C[0], 2 * a * b + C[1], 2 * a * c + C[2], 2 * a * k + C[3]];
    onStep(q, d);
    if (qnorm(q) > bound) return escapedResult(n, q, d);
  }
  return notEscapedResult(maxIterations, q);
}

export function evaluate(effective, point, options) {
  return run(effective, point, options);
}

// [{components, d}] for every update performed (not the initial q0), through escape or the budget.
export function trace(effective, point, options) {
  const steps = [];
  run(effective, point, options, (q, d) => steps.push(Object.freeze({ components: Object.freeze([...q]), d })));
  return steps;
}

// A world-space sphere of radius R(C) (outward-rounded) suffices when |κ| <= R(C),
// since ‖q0‖ >= ‖(x, y, z)‖; the strict empty-slice case (sliceIsEmpty) is handled
// before tracing, and this volume is still returned for it.
export function enclosingVolume(effective) {
  return Object.freeze({ kind: 'sphere', radius: parameters(effective).bound });
}
