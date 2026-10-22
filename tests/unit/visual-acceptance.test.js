// B11b visual acceptance: the frozen fixture, the metrics, the thresholds and the face eligibility (plan rev 5.0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { overview } from '../../src/space/camera.js';
import { getModel } from '../../src/space/models/registry.js';
import { effectiveParameters } from '../../src/space/numerics/parameters.js';
import { createSpaceScene } from '../../src/space/scene-adapter.js';
import { loadVisualFixture, VA_BITS, sampleBits, orBits, vaMetrics, evaluateScene, faceEligibility, angleBetween, faceNormalTally, mergeTallies, VISUAL_THRESHOLDS } from '../support/visual-acceptance.mjs';

const B = VA_BITS;

test('the six frozen visual scenes store the product overview cameras and the frozen settings', () => {
  const fixture = loadVisualFixture();
  assert.deepEqual(fixture.settings, { width: 1280, height: 720, maxIterations: 128, maxSteps: 512, targetSamples: 8, sequence: 'atlas-aa-v1', seed: 1, profile: 'settled' });
  assert.deepEqual(fixture.views, ['shaded-full', 'shaded-direct', 'normals', 'termination']);
  assert.deepEqual(fixture.scenes.map(s => [s.id, s.class]), [['bulb', 'fractal'], ['quaternion', 'fractal'], ['sphere', 'analytic'], ['box', 'analytic'], ['menger-1', 'analytic'], ['menger-2', 'analytic']]);
  for (const scene of fixture.scenes) {
    const { effective } = effectiveParameters(scene.model, scene.parameters);
    assert.deepEqual(scene.camera, overview(getModel(scene.model, 1), effective), `${scene.id}: the stored camera is the product overview camera`);
    const base = createSpaceScene({ model: scene.model, parameters: scene.parameters });
    assert.equal(base.iteration.maxIterations, fixture.settings.maxIterations); assert.equal(base.tracing.maxSteps, fixture.settings.maxSteps);
    assert.deepEqual(base.sampling, { seed: 1, sequence: 'atlas-aa-v1', targetSamples: 8 }, `${scene.id}: the product sampling defaults`);
  }
  assert.deepEqual(fixture.scenes.find(s => s.id === 'quaternion').parameters, { C: ['-0.2', '0.8', '0', '0'], kappa: '0' });
  for (const scene of fixture.scenes) for (const crop of scene.crops) {
    assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 1280 && crop.y + crop.height <= 720, `${scene.id} ${crop.id}: inside the frame`);
  }
});

test('visual metrics are pixelwise unions over hits with mixed hit/miss samples and isolated failures', () => {
  const s0 = Uint16Array.from([sampleBits({ status: 0, normalAvailable: true }), sampleBits({ status: 1 }), sampleBits({ status: 0, normalAvailable: false }), sampleBits({ status: 2 })]);
  const s1 = Uint16Array.from([sampleBits({ status: 1 }), sampleBits({ status: 1 }), sampleBits({ status: 0, normalAvailable: true, ao: 'unresolved' }), sampleBits({ status: 0, normalAvailable: true, shadow: 'numerical' })]);
  const union = orBits([s0, s1]);
  assert.deepEqual([...union], [B.hit | B.miss, B.miss, B.hit | B.normalUnavailable | B.aoUnresolved, B.unresolved | B.hit | B.shadowNumerical]);
  assert.deepEqual(vaMetrics(union), { pixels: 4, hits: 3, nonMiss: 3, primaryUnresolved: 1, numericalFailures: 1, unavailableNormals: 1, lightingUnresolved: 1, shadowUnresolved: 0, aoUnresolved: 1, lightingNumericalFailures: 1 });
  // A miss never counts as an unavailable normal.
  assert.equal(sampleBits({ status: 1, normalAvailable: false }) & B.normalUnavailable, 0);
});

test('the visual thresholds are the plan table, with the 10% fractal lighting ceiling', () => {
  assert.deepEqual(VISUAL_THRESHOLDS.fractal, { primaryUnresolved: 0.001, numericalFailures: 0, unavailableNormals: 0.01, lightingUnresolved: 0.10, lightingAsMagenta: 0, lostIndication: 0 });
  assert.deepEqual(VISUAL_THRESHOLDS.analytic, { primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 0.001, lightingUnresolved: 0.01, lightingAsMagenta: 0, lostIndication: 0 });
  const union = { pixels: 2000, hits: 1000, nonMiss: 1000, primaryUnresolved: 1, numericalFailures: 0, unavailableNormals: 10, lightingUnresolved: 100 };
  const at = evaluateScene({ sceneClass: 'fractal', union, lightingAsMagenta: 0, lostIndication: 0 });
  assert.equal(at.passed, true, JSON.stringify(at.rows));
  const over = evaluateScene({ sceneClass: 'fractal', union: { ...union, lightingUnresolved: 101 }, lightingAsMagenta: 0, lostIndication: 0 });
  assert.deepEqual(over.rows.filter(r => !r.passed).map(r => [r.metric, r.numerator, r.denominator]), [['lightingUnresolved', 101, 1000]]);
  const analytic = evaluateScene({ sceneClass: 'analytic', union: { ...union, primaryUnresolved: 1, unavailableNormals: 1, lightingUnresolved: 10 }, lightingAsMagenta: 1, lostIndication: 0 });
  assert.deepEqual(analytic.rows.filter(r => !r.passed).map(r => r.metric), ['primaryUnresolved', 'lightingAsMagenta']);
});

test('smooth analytic face interiors are identified geometrically, excluding edges and competing features', () => {
  const margin = 0.01, c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const world = local => [c * local[0] - s * local[1], s * local[0] + c * local[1], local[2]];
  // Rotated box: the +x face centre is eligible with the rotated normal; a point near its edge is not.
  const face = faceEligibility('box', world([1 + 1e-4, 0.1, 0.05]), margin);
  assert.equal(face.eligible, true); assert.ok(angleBetween(face.normal, [c, s, 0]) < 1e-12);
  assert.equal(faceEligibility('box', world([1 + 1e-4, 0.495, 0.05]), margin).eligible, false);
  assert.equal(faceEligibility('box', world([1.001, 0.1, 0.249]), margin).reason, 'edge');
  // Menger depth 1: an outer face, a hole wall, and the mouth of a hole (no face: a competing wall is nearer).
  const outer = faceEligibility('menger', [1 + 1e-4, 0.6, 0.6], margin, 1);
  assert.deepEqual([outer.eligible, outer.normal], [true, [1, 0, 0]]);
  const wall = faceEligibility('menger', [1 / 3 - 1e-4, 0, 0.6], margin, 1);
  assert.deepEqual([wall.eligible, wall.normal], [true, [-1, 0, 0]]);
  assert.equal(faceEligibility('menger', [0, 0, 1 + 1e-4], margin, 1).reason, 'competing-feature');
  assert.equal(faceEligibility('menger', [1 + 1e-4, 1 / 3 + 0.005, 0.6], margin, 1).reason, 'edge');
  // Depth 2 has the finer lattice: (y, z) = (0.6, 0.6) is over a depth-2 hole (sub-cell (2, 1, 1) is removed), while
  // (0.45, 0.45) lies on the face of the solid sub-cell (2, 0, 0).
  assert.equal(faceEligibility('menger', [1 + 1e-4, 0.6, 0.6], margin, 2).reason, 'competing-feature');
  assert.deepEqual(faceEligibility('menger', [1 + 1e-4, 0.45, 0.45], margin, 2).normal, [1, 0, 0]);
  // The sphere: every hit is a smooth surface point.
  assert.deepEqual(faceEligibility('sphere', [0, 0, 1.001], margin).normal, [0, 0, 1]);
});

test('the face-normal tally requires zero unavailable eligible normals and 1e-3 rad on 99% of eligible hits', () => {
  const eligible = { eligible: true, normal: [1, 0, 0] };
  const good = Array.from({ length: 99 }, (_, i) => ({ pixel: i, sample: 0, eligibility: eligible, normal: [1, 5e-4, 0] }));
  const pass = mergeTallies([faceNormalTally([...good, { pixel: 99, sample: 0, eligibility: eligible, normal: [1, 0.01, 0] }, { pixel: 100, sample: 0, eligibility: { eligible: false, reason: 'edge' }, normal: null }])]);
  assert.deepEqual([pass.eligible, pass.withinLimit, pass.unavailable, pass.passed, pass.reasons], [100, 99, 0, true, { edge: 1 }]);
  const fail = mergeTallies([faceNormalTally([...good, { pixel: 99, sample: 1, eligibility: eligible, normal: null }])]);
  assert.deepEqual([fail.unavailable, fail.passed], [1, false]);
  assert.equal(mergeTallies([faceNormalTally([{ pixel: 0, sample: 0, eligibility: eligible, normal: [1, 0.002, 0] }, { pixel: 1, sample: 0, eligibility: eligible, normal: [1, 0, 0] }])]).passed, false);
});

test('the one-sided stencil prediction is central on faces away from edges, one-sided within ε of a face and unavailable across a thin gap', async () => {
  const { predictStencilNormal } = await import('../support/visual-acceptance.mjs');
  // Menger depth 1, an outer +x face: with ε below the stand-off every axis is central.
  const face = predictStencilNormal('menger', [1.001, 0.6, 0.6], 0.0005, 1);
  assert.deepEqual([face.expected, face.modes], ['available', ['central', 'central', 'central']]);
  assert.ok(angleBetween(face.normal, [1, 0, 0]) < 1e-12);
  // Within ε of the face the −x endpoint is interior: x takes the forward difference against the centre.
  const near = predictStencilNormal('menger', [1.004, 0.6, 0.6], 0.01, 1);
  assert.deepEqual([near.expected, near.modes], ['available', ['forward', 'central', 'central']]);
  assert.ok(angleBetween(near.normal, [1, 0, 0]) < 1e-12);
  // A concave edge of the z tunnel at z = 0.6 (solid cells (2, 1, 2) and (1, 2, 2) beyond x, y = 1/3): two one-sided
  // axes, and the normal of the nearer wall. On the exact diagonal the one-sided differences cancel (a zero gradient,
  // so the prediction is ambiguous and the GPU normal unavailable).
  const corner = predictStencilNormal('menger', [1 / 3 - 0.004, 1 / 3 - 0.006, 0.6], 0.01, 1);
  assert.deepEqual([corner.expected, corner.modes], ['available', ['backward', 'backward', 'central']]);
  assert.ok(angleBetween(corner.normal, [-1, 0, 0]) < 1e-12);
  assert.equal(predictStencilNormal('menger', [1 / 3 - 0.004, 1 / 3 - 0.004, 0.6], 0.01, 1).expected, 'ambiguous');
  // Inside the z tunnel (|x|, |y| < 1/3), ε wider than the gap to both walls along x: both endpoints interior.
  assert.equal(predictStencilNormal('menger', [0.02, 0.01, 0.5], 0.4, 1).reason, 'both-interior');
  // The rotated box within ε of its +x face (one-sided x) and an interior centre (unavailable).
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6), world = l => [c * l[0] - s * l[1], s * l[0] + c * l[1], l[2]];
  const boxFace = predictStencilNormal('box', world([1.003, 0.1, 0.1]), 0.01);
  assert.deepEqual([boxFace.expected, boxFace.modes[0] !== 'central'], ['available', true]);
  assert.ok(angleBetween(boxFace.normal, [c, s, 0]) < 1e-12);
  assert.equal(predictStencilNormal('box', world([0.5, 0.1, 0.0]), 0.01).expected, 'unavailable');
});
