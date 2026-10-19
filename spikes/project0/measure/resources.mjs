// spikes/project0/measure/resources.mjs — G11 from raw observations; the same G11 rules (from T1's gatePlan) validate every G12 maintenance exercise.
// The rules live in resource-rules.js (pure .js), so the page's G12 maintenance check applies the very same ones (T9 fix round 1).
import { resourceMetrics } from './resource-rules.js';
export { resourceMetrics, maintenanceFailed, maintenanceProblems } from './resource-rules.js';
export function metrics(gate, slot, raw, fx) {
  if (gate !== 'G11' || slot !== '4k') throw new Error(`no metric derivation for ${gate}/${slot}`);
  return resourceMetrics(raw, fx);
}
