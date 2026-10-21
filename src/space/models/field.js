// Shared input checks and FieldResult construction for the Space CPU evaluators.
// The CPU evaluators run in binary64 (the GPU kernels are binary32); this code
// claims nothing about agreement with any GPU path or about detail ranges.
import { ZERO, log2 as derivativeLog2 } from '../numerics/derivative.js';

// The explicit iteration limit of spec §7.6 ("explicit limits <= 512 iterations").
export const MAX_ITERATIONS = 512;

export function checkBudget(maxIterations) {
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > MAX_ITERATIONS) {
    throw new RangeError(`maxIterations must be an integer in [1, ${MAX_ITERATIONS}]`);
  }
  return maxIterations;
}

// Shape errors are programming errors and throw; a well-formed point with a
// non-finite component is a field-domain failure, reported as data.
export function pointIsFinite(point) {
  if (!Array.isArray(point) || point.length !== 3 || point.some(x => typeof x !== 'number')) {
    throw new TypeError('a field point is an array of three numbers');
  }
  return point.every(Number.isFinite);
}

// The Euclidean norm and its natural logarithm without overflow: when the
// materialized norm overflows, ln r is still evaluated from a scaled norm.
export function norm(components) {
  const radius = Math.hypot(...components);
  if (Number.isFinite(radius)) return { radius, lnRadius: Math.log(radius), log2Radius: Math.log2(radius) };
  const scale = Math.max(...components.map(Math.abs));
  const lnRadius = Math.log(scale) + Math.log(Math.hypot(...components.map(x => x / scale)));
  return { radius, lnRadius, log2Radius: lnRadius / Math.LN2 };
}

const freeze = Object.freeze;

export function failureResult(index = 0) {
  return freeze({ kind: 'fractal', status: 'numerical-failure', index, logR: null,
    estimate: freeze({ available: false, log2DE: null, reason: 'guard' }), orbit: freeze({ radius: null, components: null }) });
}

export function notEscapedResult(index, components) {
  return freeze({ kind: 'fractal', status: 'not-escaped', index, logR: null,
    estimate: freeze({ available: false, log2DE: null, reason: 'not-escaped' }),
    orbit: freeze({ radius: Math.hypot(...components), components: freeze([...components]) }) });
}

// Escaped at `index` with iterate norm r > the escape radius and derivative d:
// log2 DE = -1 + log2 r + log2(ln r) - log2 d (spec §10.4), never materializing DE.
export function escapedResult(index, components, d) {
  const { radius, lnRadius, log2Radius } = norm(components);
  const orbit = freeze({ radius, components: freeze([...components]) });
  const unavailable = reason => freeze({ kind: 'fractal', status: 'escaped', index, logR: lnRadius, estimate: freeze({ available: false, log2DE: null, reason }), orbit });
  if (d === ZERO) return unavailable('zero-sensitivity');
  // Guards: the logarithm of ln r needs ln r > 0 (r > 1); every escape radius is >= 2.
  if (!(lnRadius > 0) || !Number.isFinite(lnRadius)) return unavailable('guard');
  const log2DE = -1 + log2Radius + Math.log2(lnRadius) - derivativeLog2(d);
  if (!Number.isFinite(log2DE)) return unavailable('guard');
  return freeze({ kind: 'fractal', status: 'escaped', index, logR: lnRadius, estimate: freeze({ available: true, log2DE, reason: null }), orbit });
}

export function analyticResult(distance, applicability) {
  return freeze({ kind: 'analytic', validity: 'valid', distance, applicability });
}

export const ANALYTIC_FAILURE = freeze({ kind: 'analytic', validity: 'numerical-failure', distance: null, applicability: null });
