import { bulbOrbit } from './bulb.js';
import { quaternionOrbit, quaternionBound } from './quaternion.js';
import { sphereDistance, boxDistance, enclosingSphereInterval, enclosingBoxInterval } from './analytic.js';
import { mengerDistance } from './menger.js';
import { nextUp64, F32_MAX } from './f32.js';

export function modelRadius(model, effective = {}) {
  if (model === 'mandelbulb') return 2;
  if (model === 'quaternion-julia') return quaternionBound(effective.C);
  if (model === 'menger') return nextUp64(Math.sqrt(3));
  return 2; // Project 0 A.2 enclosing sphere for sphere and rotated box.
}
export function fieldFor(model, effective, cap = 128, precision = 'f64') {
  if (model === 'mandelbulb') return p => bulbOrbit(p, effective.power, cap, { precision });
  if (model === 'quaternion-julia') {
    const bound = quaternionBound(effective.C);
    return p => quaternionOrbit([...p, effective.kappa], effective.C, cap, { bound, precision });
  }
  if (model === 'menger') return p => mengerDistance(p, effective.depth);
  if (model === 'sphere') return p => sphereDistance(p);
  if (model === 'box') return p => boxDistance(p);
  throw new RangeError(`unknown reference model ${model}`);
}
export function enclosingInterval(model, effective, ray) {
  if (model === 'quaternion-julia' && Math.abs(effective.kappa) > quaternionBound(effective.C)) return null;
  if (model === 'menger') return enclosingBoxInterval(ray);
  return enclosingSphereInterval(ray, modelRadius(model, effective));
}
export function traceRay(ray, profile, field, interval) {
  let t = 0, steps = 0;
  const result = (status, reason = null, subreason = null, detail = null) => ({ status, reason, subreason, t, steps, ...(detail ? { detail } : {}) });
  const finite3 = a => Array.isArray(a) && a.length === 3 && a.every(x => Number.isFinite(x) && Math.abs(x) < 1e150);
  if (!finite3(ray?.origin) || !finite3(ray?.direction) || Math.abs(Math.hypot(...ray.direction) - 1) > 1e-6) return result('numerical failure');
  if (interval?.invalid) return result('numerical failure');
  if (interval === null) return result('miss');
  if (!interval || !Number.isFinite(interval.enter) || !Number.isFinite(interval.exit)) return result('numerical failure');
  const round = profile.precision === 'f32' ? Math.fround : x => x;
  const limit = profile.precision === 'f32' ? F32_MAX : Number.MAX_VALUE;
  if (ray.origin.some(v => Math.abs(v) > limit) || Math.max(0, interval.enter) > limit) return result('numerical failure');
  const origin = ray.origin.map(round), direction = ray.direction.map(round);
  t = round(Math.max(0, interval.enter));
  if (interval.exit < t) return result('miss');
  const alpha = 2 * Math.tan((profile.verticalFovDegrees ?? 60) * Math.PI / 360) / (profile.height ?? 720);
  const cap = profile.maxSteps ?? 512, multiplier = profile.stepMultiplier ?? 0.9;
  if (!Number.isInteger(cap) || cap < 1 || cap > 4096 || !(multiplier > 0 && multiplier <= 1) || !(alpha > 0 && Number.isFinite(alpha))) return result('numerical failure');
  const position = distance => {
    if (direction.some(v => Math.abs(v) > 0 && distance > limit / Math.abs(v))) return null;
    const offsets = direction.map(v => round(distance * v));
    if (origin.some((v, i) => Math.abs(v + offsets[i]) > limit)) return null;
    return origin.map((v, i) => round(v + offsets[i]));
  };
  let point = position(t);
  for (steps = 1; steps <= cap; steps++) {
    if (!finite3(point)) return result('numerical failure');
    const evaluation = field(point);
    if (!evaluation || evaluation.status === 'numerical failure') return result('numerical failure');
    if (evaluation.status === 'not escaped within iteration budget') return result('unresolved', 'point-budget');
    if (evaluation.applicability === 'interior') return result('unresolved', 'estimate-unavailable', null, 'interior');
    const analytic = Object.hasOwn(evaluation, 'distance');
    if (analytic && (!Number.isFinite(evaluation.distance) || evaluation.distance < 0)) return result('numerical failure');
    if (!analytic && (evaluation.status !== 'escaped' || !evaluation.estimateAvailable)) return result('unresolved', 'estimate-unavailable');
    const tolerance = profile.tolerance ?? (profile.name === 'ladder-v1' ? (profile.hitFactor ?? 0.005) * alpha * t : Math.max(1e-6, 0.5 * alpha * t) * (profile.toleranceScale ?? 1));
    if (!(tolerance >= 0 && Number.isFinite(tolerance))) return result('numerical failure');
    const log2DE = analytic ? (evaluation.distance === 0 ? -Infinity : Math.log2(evaluation.distance)) : evaluation.log2DE;
    if ((!analytic && !Number.isFinite(log2DE)) || log2DE > 1023) return result('unresolved', 'estimate-unavailable');
    if ((analytic && evaluation.distance === 0) || log2DE < Math.log2(tolerance)) return result('approximate hit');
    // No clamp or forced minimum. Underflow belongs to stagnation, never a hit.
    const distance = analytic ? evaluation.distance : 2 ** log2DE;
    if (distance > limit / multiplier || distance > (limit - t) / multiplier) return result('numerical failure');
    const candidate = round(t + round(multiplier * distance));
    if (candidate > interval.exit) return result('miss');
    if (!(candidate > t)) return result('unresolved', 'stagnation', 'ray-parameter');
    const next = position(candidate);
    if (!next) return result('numerical failure');
    if (next.every((v, i) => v === point[i])) return result('unresolved', 'stagnation', 'field-coordinate');
    t = candidate; point = next;
  }
  steps = cap; return result('unresolved', 'ray-step-budget');
}
export function traceModel(model, effective, ray, profile = {}) {
  return traceRay(ray, profile, fieldFor(model, effective, profile.maxIterations ?? 128, profile.precision ?? 'f64'), enclosingInterval(model, effective, ray));
}
