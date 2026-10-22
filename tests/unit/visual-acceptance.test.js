// B11b visual acceptance: the frozen fixture, the metrics, the thresholds and the face eligibility (plan rev 5.0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { overview } from '../../src/space/camera.js';
import { getModel } from '../../src/space/models/registry.js';
import { effectiveParameters } from '../../src/space/numerics/parameters.js';
import { createSpaceScene } from '../../src/space/scene-adapter.js';
import { loadVisualFixture, VA_BITS, sampleBits, orBits, vaMetrics, evaluateScene, faceEligibility, angleBetween, faceNormalTally, mergeTallies, VISUAL_THRESHOLDS,
  VISUAL_ACCEPTANCE_PASS, REQUIRED_VISUAL_SCENES, DIAGNOSTIC_VISUAL_SCENES, VISUAL_DIAGNOSTIC_LABEL, visualVerdict } from '../support/visual-acceptance.mjs';
import { readFileSync } from 'node:fs';

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

test('visual reason metrics keep the reason of every unresolved primary, shadow and AO outcome per pixel class', async () => {
  const { vaReasonCode, vaReasonLanes, vaReasonMetrics, orBits32 } = await import('../support/visual-acceptance.mjs');
  // Codes per class: primary bits 0-2, shadow 3-5, AO 6-8 (1 point-budget ... 6 unspecified).
  assert.deepEqual([[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [4, 0], [0, 0]].map(([r, s]) => vaReasonCode(r, s)), [1, 2, 3, 4, 5, 6, 6]);
  const s0 = vaReasonLanes(Uint32Array.from([0, 1, 1, 1 << 6, 2, 3 << 3]), 3), s1 = vaReasonLanes(Uint32Array.from([0, 5, 1, 2 << 6]), 3);
  const zero = { 'point-budget': 0, 'estimate-unavailable': 0, 'ray-step-budget': 0, 'stagnation/ray-parameter': 0, 'stagnation/field-coordinate': 0, unspecified: 0, multiple: 0 };
  assert.deepEqual(vaReasonMetrics(orBits32([s0, s1])), { primaryUnresolved: { ...zero, 'point-budget': 1, 'stagnation/field-coordinate': 1, multiple: 1 },
    shadowUnresolved: { ...zero, 'ray-step-budget': 1 }, aoUnresolved: { ...zero, 'point-budget': 1, 'estimate-unavailable': 1, multiple: 1 } });
});

test('the stencil direction check rejects NaN, infinite and zero normals and NaN angles', async () => {
  const { stencilDirectionError } = await import('../support/visual-acceptance.mjs');
  assert.equal(stencilDirectionError([1, 5e-4, 0], [1, 0, 0], 1e-3), null);
  assert.match(stencilDirectionError([1, 0.01, 0], [1, 0, 0], 1e-3).reason, /angle/);
  for (const bad of [[NaN, 0, 1], [Infinity, 0, 0], [0, 0, 0]]) assert.match(stencilDirectionError(bad, [1, 0, 0], 1e-3).reason, /non-finite|zero/, JSON.stringify(bad));
  assert.match(stencilDirectionError([1, 0, 0], [NaN, 0, 0], 1e-3).reason, /angle|non-finite/);
});

test('a lighting-only pixel shown magenta counts as magenta as well as a lost indication', async () => {
  const { classifyFlaggedPixel } = await import('../support/visual-acceptance.mjs');
  const tint = [41, 34, 18, 255], plain = [0, 0, 0, 255], magenta = [255, 0, 255, 255];
  assert.deepEqual(classifyFlaggedPixel({ got: magenta, expected: tint, plain, lightingOnly: true }), { lost: true, magenta: true, tinted: false });
  assert.deepEqual(classifyFlaggedPixel({ got: tint, expected: tint, plain, lightingOnly: true }), { lost: false, magenta: false, tinted: true });
  assert.deepEqual(classifyFlaggedPixel({ got: plain, expected: plain, plain, lightingOnly: true }), { lost: true, magenta: false, tinted: false }, 'an invisible tint is lost');
  // A primary-unresolved pixel is expected magenta: not a lighting-as-magenta failure.
  assert.deepEqual(classifyFlaggedPixel({ got: magenta, expected: magenta, plain, lightingOnly: false }), { lost: false, magenta: false, tinted: false });
});

// B11c: the page's own recovery metrics (from [pixel, word] pairs) equal the renderer masks' on the same samples.
test('the visual check reads recovery words independently and agrees with the outcome masks', async () => {
  const { vaRecoveryMetrics } = await import('../support/visual-acceptance.mjs');
  const { createOutcomeMasks } = await import('../../src/space/render/outcome-masks.js');
  const { packRecoveryWord } = await import('../../src/space/render/webgpu/passes.js');
  const { packStatus } = await import('../../src/space/render/status.js');
  const word = (outcome, midpoints, encounters, stop = 'none') => packRecoveryWord({ attempted: true, outcome, stop, midpoints, encounters });
  const HIT = packStatus({ status: 0, reason: 0, subreason: 0, steps: 4 }), POINT = packStatus({ status: 2, reason: 1, subreason: 0, steps: 9 });
  const frames = [{ status: [HIT, POINT, HIT], recovery: [word('approximate hit', 1, 1), word('point-budget', 3, 2, 'evaluation-cap'), 0] },
    { status: [POINT, HIT, HIT], recovery: [word('point-budget', 8, 9, 'midpoint-limit'), 0, 0] }];
  const masks = createOutcomeMasks({ width: 3, height: 1 }, { recovery: true }), region = { x: 0, y: 0, width: 3, height: 1 };
  const u32 = v => new Uint8Array(Uint32Array.from(v).buffer), normals = new Uint8Array(new Uint16Array([0, 0, 0x3c00, 0x3c00, 0, 0, 0x3c00, 0x3c00, 0, 0, 0x3c00, 0x3c00]).buffer);
  frames.forEach((f, sample) => {
    const id = { accumulationKey: 'k', sample };
    masks.record(id, 'status', region, u32(f.status)); masks.record(id, 'normal', region, normals);
    masks.record(id, 'lightingStatus', region, u32([0, 0, 0])); masks.record(id, 'recovery', region, u32(f.recovery)); masks.end(id);
  });
  const pairs = frames.map(f => Uint32Array.from(f.recovery.flatMap((w, i) => (w ? [i, w] : []))));
  assert.deepEqual(vaRecoveryMetrics(pairs, 3), masks.snapshot().recovery);
});

// Plan rev 5.2 (user decision 2026-10-22): the quaternion is deferred from required visual acceptance to diagnostic
// evidence; five scenes gate, and the quaternion's thresholds are unchanged and still reported.
const vaRow = (id, sceneClass, failures = [], union = { hits: 100, lightingUnresolved: 0 }) => ({
  id, class: sceneClass, failures, union, reasons: { union: { 'ao:point-budget': failures.length ? 4897 : 0 } }, recovery: id === 'quaternion' ? { union: { attempted: 162, recovered: 162 } } : null,
  thresholds: evaluateScene({ sceneClass, union: { hits: union.hits, nonMiss: union.hits, primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 0, lightingUnresolved: union.lightingUnresolved, lightingNumericalFailures: 0 }, lightingAsMagenta: 0, lostIndication: 0 }),
});
const clean = () => [vaRow('bulb', 'fractal'), vaRow('sphere', 'analytic'), vaRow('box', 'analytic'), vaRow('menger-1', 'analytic'), vaRow('menger-2', 'analytic')];

test('rev 5.2: five scenes are required and the quaternion is diagnostic, deferred to 1b.2', () => {
  assert.deepEqual([...REQUIRED_VISUAL_SCENES], ['bulb', 'sphere', 'box', 'menger-1', 'menger-2']);
  assert.deepEqual([...DIAGNOSTIC_VISUAL_SCENES], ['quaternion']);
  assert.equal(VISUAL_DIAGNOSTIC_LABEL, 'deferred to 1b.2 (user decision 2026-10-22)');
  assert.deepEqual([...REQUIRED_VISUAL_SCENES, ...DIAGNOSTIC_VISUAL_SCENES].sort(), loadVisualFixture().scenes.map(s => s.id).sort(), 'every rendered scene is either required or diagnostic');
  assert.equal(VISUAL_THRESHOLDS.fractal.lightingUnresolved, 0.10, 'the quaternion threshold is not relaxed');
  const manifest = JSON.parse(readFileSync(new URL('../suites.manifest.json', import.meta.url), 'utf8'));
  const passes = manifest.suites.find(entry => entry.id === 'space-rendering').requiredPasses;
  assert.ok(passes.includes(VISUAL_ACCEPTANCE_PASS), 'the manifest names the five-scene pass');
  assert.equal(VISUAL_ACCEPTANCE_PASS, 'Five frozen scenes meet visual acceptance; the quaternion is reported as diagnostic');
  assert.ok(!passes.some(name => /^Six frozen scenes/.test(name)));
});

test('rev 5.2: a quaternion failure does not fail the required pass, and its numbers stay in the report', () => {
  const quaternion = vaRow('quaternion', 'fractal', ['thresholds: lightingUnresolved 5226/39085'], { hits: 39085, lightingUnresolved: 5226 });
  assert.equal(quaternion.thresholds.passed, false, 'the quaternion still fails its unchanged 10% ceiling');
  const verdict = visualVerdict([clean()[0], quaternion, ...clean().slice(1)]);
  assert.equal(verdict.passed, true);
  assert.deepEqual(verdict.required.map(s => s.id), ['bulb', 'sphere', 'box', 'menger-1', 'menger-2']);
  assert.deepEqual(verdict.requiredFailures, []);
  assert.equal(verdict.diagnostic.label, VISUAL_DIAGNOSTIC_LABEL);
  assert.deepEqual(verdict.diagnostic.scenes.map(s => s.id), ['quaternion']);
  const q = verdict.diagnostic.scenes[0];
  assert.equal(q.passed, false); assert.deepEqual(q.failures, ['thresholds: lightingUnresolved 5226/39085']);
  const row = q.thresholds.find(r => r.metric === 'lightingUnresolved');
  assert.deepEqual([row.numerator, row.denominator, row.passed], [5226, 39085, false]);
  assert.ok(Math.abs(row.fraction - 0.1337) < 5e-5);
  assert.equal(q.reasons['ao:point-budget'], 4897); assert.deepEqual(q.recovery, { attempted: 162, recovered: 162 });
  assert.match(JSON.stringify(verdict), /5226\/39085/);
});

test('rev 5.2: a required-scene failure still fails the pass, and a missing required scene fails closed', () => {
  const rows = clean(); rows[0] = vaRow('bulb', 'fractal', ['thresholds: lightingUnresolved 20/100'], { hits: 100, lightingUnresolved: 20 });
  const verdict = visualVerdict(rows);
  assert.equal(verdict.passed, false); assert.deepEqual(verdict.requiredFailures, ['bulb: thresholds: lightingUnresolved 20/100']);
  const missing = visualVerdict(clean().slice(1));
  assert.equal(missing.passed, false); assert.deepEqual(missing.requiredFailures, ['bulb: not measured']);
  assert.throws(() => visualVerdict([...clean(), vaRow('extra', 'analytic')]), /neither required nor diagnostic/);
});
