// spikes/project0/measure/arith.mjs — G3/G4/G5 metrics from raw readbacks and the frozen fixtures.
import { compareArithmetic, compareRays } from '../metrics.js';
import { decodeTrace, decodeArith } from './decode.mjs';

export function metrics(gate, slot, raw, fx) {
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
    let componentRatio = 0;
    raw.orbit.forEach((v, i) => { componentRatio = Math.max(componentRatio, Math.abs(v - expected[i]) / (p.absoluteTolerance + p.relativeTolerance * Math.abs(expected[i]))); });
    return { components: 32, componentRatio };
  }
  throw new Error(`no metric derivation for ${gate}/${slot}`);
}
