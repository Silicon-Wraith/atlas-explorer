// spikes/project0/tests/arith-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsFor } from '../measure/index.mjs';
import { gatePlan } from '../gates.js';
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];
const eligible = n => Array.from({ length: n }, (_, id) => ({ id, eligible: true, reference: { status: 'budget', index: null, logR: null, de: null } }));
const fixtures = {
  profiles: { g3: { steps: 512 } },
  arithmeticProtocol: { bulb: { iterations: 64, tolerances: { logR: 1e-4, de: 1e-3 } }, plane: { iterations: 128, tolerances: { logR: 1e-5 } }, offplane: { iterations: 8, absoluteTolerance: 1e-6, relativeTolerance: 1e-5 } },
  analytic: { sphere: { L: 1, rays: [{ id: 0, reference: { status: 'hit', t: 3, excluded: false } }, { id: 1, reference: { status: 'miss', t: null, excluded: false } }] } },
  arithmetic: { bulb: eligible(4096), plane: eligible(4096), offplane: { orbit: Array.from({ length: 8 }, (_, n) => [n, -n, 0.5, 0]) } },
};

test('G3 metrics have exactly the gatePlan keys and measure depth error in units of 1e-4·L', async () => {
  const m = await metricsFor('G3', 'sphere', { words: [0, 0, f32bits(3.00001), 4, 1, 0, 0, 1] }, fixtures);
  assert.deepEqual(Object.keys(m).sort(), ['depthRatio', 'edgeErrors', 'rays', 'statusErrors']);
  assert.ok(m.depthRatio > 0.09 && m.depthRatio < 0.11);
});

test('G4/G5 metrics match the plan keys; a short readback is refused', async () => {
  const plan = gatePlan({ analytic: {}, arithmetic: { bulb: eligible(4096), plane: eligible(4096) } });
  const words = Array.from({ length: 4 * 4096 }, (_, i) => (i % 4 === 0 ? 1 : 0));
  assert.deepEqual(Object.keys(await metricsFor('G4', 'bulb-samples', { words }, fixtures)).sort(), Object.keys(plan.G4['bulb-samples']).sort());
  assert.deepEqual(Object.keys(await metricsFor('G5', 'qjulia-plane', { words }, fixtures)).sort(), Object.keys(plan.G5['qjulia-plane']).sort());
  await assert.rejects(metricsFor('G4', 'bulb-samples', { words: words.slice(4) }, fixtures), /readback length/);
});

test('G5 off-plane uses abs + rel tolerance over exactly 32 finite components', async () => {
  const orbit = fixtures.arithmetic.offplane.orbit.flat(), actual = orbit.map((v, i) => (i === 5 ? v + 2e-6 : v));
  const m = await metricsFor('G5', 'qjulia-offplane', { orbit: actual }, fixtures);
  assert.equal(m.components, 32);
  assert.ok(Math.abs(m.componentRatio - 2e-6 / (1e-6 + 1e-5 * 1)) < 1e-9);
  await assert.rejects(metricsFor('G5', 'qjulia-offplane', { orbit: actual.slice(1) }, fixtures), /32 components/);
  await assert.rejects(metricsFor('G5', 'qjulia-offplane', { orbit: actual.map((v, i) => (i ? v : null)) }, fixtures), /finite/);
});

test('an unregistered gate has no derivation', async () => {
  await assert.rejects(metricsFor('G99', 'x', {}, fixtures), /no metric derivation for G99/);
});
