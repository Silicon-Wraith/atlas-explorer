// CPU-only evidence built from the actual frozen input identities and offsets.
import { readFileSync } from 'node:fs';
import { createPerformanceAttempt } from './space-performance.mjs';

export const frozenPerformanceWorkload = JSON.parse(readFileSync(new URL('../reference/performance-workload.json', import.meta.url), 'utf8'));

export function passingPerformanceAttempt(lateness = {}, sceneId = 'bulb') {
  const attempt = createPerformanceAttempt(1);
  // Explicit intended record version/policy lets the RED tests exercise the old
  // classifier independently of the old attempt factory's missing metadata.
  attempt.schemaVersion = 5;
  attempt.measurement.timingPolicy = 'atlas.p3-timing-budget-v1';
  const phases = { orbit: { start: 1000, end: 31000 }, interaction: { start: 33000, end: 57100 }, stress: { start: 59000, end: 69000 } };
  const issued = [];
  for (const phase of ['orbit', 'interaction', 'stress']) {
    const inputs = phase === 'stress'
      ? Array.from({ length: frozenPerformanceWorkload.workloads.stress.editRule.count }, (_, index) => ({ requestIndex: index, requestTimeMs: index * frozenPerformanceWorkload.workloads.stress.editRule.spacingMs }))
      : frozenPerformanceWorkload.workloads[phase].cameraPoses[sceneId];
    for (const input of inputs) {
      const index = input.requestIndex, target = phases[phase].start + input.requestTimeMs;
      const issuedAt = target + (lateness[`${phase}:${index}`] ?? 0);
      issued.push({ phase, index, target, issuedAt, lateByMs: issuedAt - target });
    }
  }
  return { ...attempt, complete: true, coverage: true, targets: [{ passed: true }],
    timing: { invalidated: issued.some(input => input.lateByMs > 4) },
    trial: { measurement: structuredClone(attempt.measurement), timeOriginMs: 100000, phases, issued, timings: [], reports: [] },
    clockEvidence: { protocol: 'atlas.gpu-clocks-v1', state: 'measured', medianMHz: 210, band: 'lt270', sampleCount: 11, uuid: 'GPU-test' } };
}
