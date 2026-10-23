// Injected diagnostic configurations. The application passes no override and uses L6b.
// A named rung is the only switch: callers cannot assemble unreviewed combinations.
export const DRAFT_LADDER_VERSION = 'rec-g-ladder-v1';
export const DRAFT_RUNGS = Object.freeze(['L0', 'L1', 'L2', 'L3', 'L4', 'L5a', 'L5b', 'L5c', 'L5d', 'L6a', 'L6b', 'L6c', 'L6d']);
export function draftExecution(rung = 'L6b') {
  if (!DRAFT_RUNGS.includes(rung)) throw new RangeError(`unknown diagnostic draft rung ${rung}`);
  const level = Number(rung[1]), variant = rung[2] ?? null;
  return Object.freeze({ rung, level, variant, lifecycle: level === 6, scheduler: level >= 3, leases: level >= 2, tickets: level >= 1,
    summary: level >= 4, mode: level < 4 ? 'unchecked' : level === 4 ? 'audit' : { a: 'compute', b: 'gated', c: 'provisional', d: 'async' }[variant] });
}

// The versioned candidate envelope is bounded by the frozen P3 draft footprint and
// numerical budgets (including stress edits), not raw queue-fence elapsed time.
// The executor qualifies actual <=8 ms active work for every registered family.
export const DRAFT_ENVELOPE_VERSION = 'rec-g-p3-envelope-v1';
export function qualifiedDraft(request, effective, limits = {}) {
  const q = request.quality, size = q?.internalSize, family = request.sceneSnapshot?.model?.id;
  if (!q?.preview || request.output?.purpose !== 'interactive' || !size || size.width > 640 || size.height > 360 ||
      q.iteration.maxIterations > 64 || q.tracing.maxSteps > 256 || q.sampling.targetSamples !== 1 ||
      q.lighting.shadowRays || q.lighting.shadowSteps || q.lighting.aoSamples || q.lighting.stage === 'full') return false;
  const side = (limits.maxComputeWorkgroupsPerDimension ?? 65535) * 8;
  if (size.width > side || size.height > side || size.width > (limits.maxTextureDimension2D ?? 8192) || size.height > (limits.maxTextureDimension2D ?? 8192)) return false;
  if (family === 'sphere' || family === 'box') return true;
  if (family === 'mandelbulb') return effective.power === 7 || effective.power === 8;
  if (family === 'menger') return effective.depth === 1 || effective.depth === 2;
  if (family === 'quaternion-julia') return (effective.kappa === 0 || effective.kappa === 0.5) &&
    effective.C?.every((value, i) => Math.abs(value - [-0.2, 0.8, 0, 0][i]) < 1e-7);
  return false;
}
