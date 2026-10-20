// spikes/project0/measure/arith.mjs — G3/G4/G5 metrics from raw readbacks and the frozen fixtures.
import { compareArithmetic, compareRays } from '../metrics.js';
import { decodeTrace, decodeArith } from './decode.mjs';
import { compensationReport } from '../remediation/validate.mjs';
import { operationalMetrics, operationalObservation } from '../qualification/g5d-metrics.mjs';
const invalid = message => Object.assign(new Error(message), { invalidation: true });

// `context.identity` is the record's authenticated execution identity: it selects the shader expectation of historical G5-A evidence (G5-D §8.5).
export function metrics(gate, slot, raw, fx, { identity = null } = {}) {
  if (gate === 'G3') {
    const fixture = fx.analytic[slot]; if (!fixture) throw new Error(`G3: unknown analytic fixture ${slot}`);
    return compareRays(fixture.rays, decodeTrace(raw.words, fixture.rays.length, { maxSteps: fx.profiles.g3.steps }), fixture.L);
  }
  if (gate === 'G4' && slot === 'bulb-samples') {
    const p = fx.arithmeticProtocol.bulb;
    return compareArithmetic(fx.arithmetic.bulb, decodeArith(raw.words, fx.arithmetic.bulb.length, { minIndex: 1, cap: p.iterations, de: true }), p.tolerances);
  }
  if (gate === 'G5' && slot === 'qjulia-plane') {
    const p = fx.arithmeticProtocol.plane;
    const rows = decodeArith(raw.words, fx.arithmetic.plane.length, { minIndex: 0, cap: p.iterations, de: false }).map(({ id, status, index, logR }) => ({ id, status, index, logR }));
    return compareArithmetic(fx.arithmetic.plane, rows, p.tolerances);
  }
  if (gate === 'G5' && slot === 'qjulia-offplane') {
    const p = fx.arithmeticProtocol.offplane, expected = fx.arithmetic.offplane.orbit.flat();
    if (!Array.isArray(raw.orbit) || raw.orbit.length !== 32 || expected.length !== 32) throw new Error('off-plane orbit must have exactly 32 components');
    if (!raw.orbit.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('off-plane orbit components must be finite numbers');
    const componentRatio = offplaneRatio(raw.orbit, expected, p);
    // G5-A (prereg rev 2 §2.7): evidence that declares the compensated form, or carries supplementary readbacks, is validated here from its
    // raw words at every read. Legacy (attempt-1) evidence, which carries neither, keeps its original derivation; qualify.mjs requires the
    // compensated form for every G5 record launched with the remediation configuration. The frozen comparison is reported beside the verdict.
    if (raw.form !== undefined || raw.supplementary !== undefined) {
      const report = compensationReport(raw, fx, undefined, { identity });
      if (!report.validated) throw invalid(`compensation unvalidated: ${report.problems.join('; ')}; observations match model(s) ${report.matches.length ? report.matches.join(', ') : 'none'}; frozen off-plane comparison recorded separately: ${componentRatio > 1 ? 'numerical failure: ' : ''}componentRatio=${componentRatio}`);
    }
    return { components: 32, componentRatio };
  }
  // G5-D (prereg §4.4, §7.2): operational orbits through first escape or the 128-update budget, from qualification/g5d-metrics.mjs
  if (gate === 'G5' && slot === 'qjulia-operational') return operationalMetrics(raw, fx);
  throw new Error(`no metric derivation for ${gate}/${slot}`);
}

const offplaneRatio = (orbit, expected, p) => orbit.reduce((m, v, i) => Math.max(m, Math.abs(v - expected[i]) / (p.absoluteTolerance + p.relativeTolerance * Math.abs(expected[i]))), 0);
// Fix round 1 (finding 1; prereg rev 2 §2.7): a G5 record's observations, rederived from its raw whatever its saved status. The frozen
// comparison and the compensation verdict are separate fields: `numericalFailure` (componentRatio > 1) is never hidden by an unvalidated
// compensation, nor the reverse. `invalidation` is exactly what the metric derivation throws (null when it returns metrics).
// G5-D: the operational slot's observation also carries every recomputable part of a partial readback (collected batches, the forced-
// continuation diagnostic, per-band and S3 summaries, model agreement), whatever its completeness.
export function g5Observation(slot, raw, fx, { identity = null } = {}) {
  let derived = null, invalidation = null;
  try { derived = metrics('G5', slot, raw, fx, { identity }); } catch (e) { invalidation = e.message; }
  if (slot === 'qjulia-operational') { const { metrics: _m, invalidation: _i, problems: _p, ...o } = operationalObservation(raw, fx); return { slot, metrics: derived, invalidation, ...o }; }
  if (slot !== 'qjulia-offplane') return { slot, metrics: derived, invalidation };
  const p = fx.arithmeticProtocol.offplane, expected = fx.arithmetic.offplane.orbit.flat();
  const ok = Array.isArray(raw?.orbit) && raw.orbit.length === 32 && raw.orbit.every(v => typeof v === 'number' && Number.isFinite(v));
  const componentRatio = ok ? offplaneRatio(raw.orbit, expected, p) : null;
  const report = raw?.form !== undefined || raw?.supplementary !== undefined ? compensationReport(raw, fx, undefined, { identity }) : null;
  return { slot, componentRatio, numericalFailure: componentRatio === null ? null : componentRatio > 1,
    compensation: report ? { validated: report.validated, matches: report.matches, problems: report.problems } : null, metrics: derived, invalidation };
}
