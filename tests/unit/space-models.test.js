import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveParameters, escapeRadius } from '../../src/space/numerics/parameters.js';
import { SUPPORTED_DOMAINS } from '../../src/space/numerics/validation-domains.js';
import { ESTIMATOR_CATEGORIES } from '../../src/space/render/status.js';
import { toNumber, isZero } from '../../src/space/numerics/derivative.js';
import * as analytic from '../../src/space/models/analytic.js';
import * as menger from '../../src/space/models/menger.js';
import * as mandelbulb from '../../src/space/models/mandelbulb.js';
import * as quaternionJulia from '../../src/space/models/quaternion-julia.js';
import { MODEL_RECORDS, getModel, classifyCamera } from '../../src/space/models/registry.js';
import { boundaryViolations, scanSource } from '../support/import-boundary.mjs';

const close = (actual, expected, relative = 2 ** -46) => assert.ok(Math.abs(actual - expected) <= relative * Math.abs(expected), `${actual} ≉ ${expected}`);

// --- The plan's named assertions (B03 Step 1) ---------------------------------

test('the power-8 axis orbit from (0, 0, 1) gives iterates 0, 1, 2, 257 and derivatives 0, 1, 9, 9217', () => {
  const power8 = effectiveParameters('mandelbulb', { power: '8' }).effective;
  const steps = mandelbulb.trace(power8, [0, 0, 1], { maxIterations: 3 });
  assert.deepEqual(steps.map(s => s.components[2]), [1, 2, 257]); assert.deepEqual(steps.map(s => toNumber(s.d)), [1, 9, 9217]);
  assert.deepEqual(steps.map(s => [s.components[0], s.components[1]]), [[0, 0], [0, 0], [0, 0]], 'φ = 0 on the polar axis');
});

test('quaternion Julia with q0 = 0 and C = (2, 0, 0, 0) escapes at update 2 with an unavailable estimate', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['2', '0', '0', '0'], kappa: '0' }).effective;
  const result = quaternionJulia.evaluate(effective, [0, 0, 0], { maxIterations: 128 });
  assert.equal(result.kind, 'fractal'); assert.equal(result.status, 'escaped'); assert.equal(result.index, 2);
  assert.deepEqual(result.estimate, { available: false, log2DE: null, reason: 'zero-sensitivity' });
});

test('on the invariant plane the quaternion recurrence equals the complex recurrence exactly', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '0' }).effective;
  const [ca, cb] = effective.C;                      // the effective binary32 values, widened to doubles
  let a = 0.3, b = -0.1; const steps = quaternionJulia.trace(effective, [0.3, -0.1, 0], { maxIterations: 20 });
  assert.equal(steps.length, 20);
  for (const step of steps) { [a, b] = [a * a - b * b + ca, 2 * a * b + cb]; assert.deepEqual(step.components, [a, b, 0, 0]); }
});

test('a nonzero κ or an off-plane C keeps all four components', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0.15', '-0.1'], kappa: '0.5' }).effective;
  const r = quaternionJulia.evaluate(effective, [0.1, 0.2, 0.3], { maxIterations: 8 });
  assert.equal(r.orbit.components.length, 4); assert.notEqual(r.orbit.components[3], 0);
});

test('calibration objects report exact distances and applicability without fabricating an escape status', () => {
  assert.deepEqual(analytic.sphere.evaluate({}, [0, 0, 2]), { kind: 'analytic', validity: 'valid', distance: 1, applicability: 'exterior' });
  assert.deepEqual(analytic.sphere.evaluate({}, [0, 0, 1]), { kind: 'analytic', validity: 'valid', distance: 0, applicability: 'boundary' });
  assert.equal(analytic.sphere.evaluate({}, [0, 0, 0.5]).applicability, 'interior');
  assert.ok(!('status' in analytic.sphere.evaluate({}, [0, 0, 2])) && !('index' in analytic.sphere.evaluate({}, [0, 0, 2])));
  assert.equal(menger.boxes(1).length, 20); assert.equal(menger.boxes(2).length, 400);
  assert.equal(menger.evaluate({ depth: 1 }, [0, 0, 0]).applicability, 'exterior', 'the centre is removed at depth 1');
  assert.equal(menger.evaluate({ depth: 1 }, [0.9, 0.9, 0.9]).applicability, 'interior');
});

test('camera classification is exterior only with positive analytic distance or an available fractal estimate', () => {
  const bulb = getModel('mandelbulb', 1); const power8 = effectiveParameters('mandelbulb', { power: '8' }).effective;
  assert.equal(classifyCamera(bulb, power8, [1.92, -1.44, 0.7], 128).status, 'exterior');
  assert.equal(classifyCamera(bulb, power8, [0, 0, 0], 128).status, 'unresolved');
  assert.equal(classifyCamera(getModel('sphere', 1), {}, [0, 0, 0.5], 128).status, 'unresolved');
  assert.equal(classifyCamera(getModel('sphere', 1), {}, [0, 0, 1], 128).status, 'unresolved', 'a boundary start is not exterior');
});

test('space models and numerics import no DOM or GPU code', async () => {
  // boundaryViolations(roots, allowed): resolves every static import and re-export specifier of every
  // file under `roots` to a canonical path (dynamic imports are violations), checks it against
  // `allowed`, then walks the permitted dependencies transitively and flags any source that
  // mentions document, navigator, window, GPUDevice or navigator.gpu.
  const allowed = [/^src\/space\/models\//, /^src\/space\/numerics\//, /^src\/shared\/scene\.js$/, /^src\/space\/render\/status\.js$/];
  const violations = await boundaryViolations(['src/space/models', 'src/space/numerics'], allowed);
  assert.deepEqual(violations, []);
  assert.ok((await boundaryViolations(['tests/fixtures/boundary/imports-renderer'], allowed)).length > 0, 'a renderer import fails the checker');
  assert.ok((await boundaryViolations(['tests/fixtures/boundary/imports-shell'], allowed)).length > 0, 'a UI import fails the checker');
  assert.ok((await boundaryViolations(['tests/fixtures/boundary/dynamic-import'], allowed)).length > 0, 'an unsupported dynamic import fails the checker');
});

// --- Supporting assertions -----------------------------------------------------

test('the boundary scanner separates code from comments, strings, templates and regular expressions', () => {
  const scan = scanSource([
    "import a from './a.js'; import { b,\n c } from \"../b.js\"; import './side.js';",
    "export * from './star.js'; export { d } from './d.js'; export { e };",
    "// import x from './comment.js'; document",
    "/* window */ const s = 'import y from \"./string.js\"';",
    'const t = `${1 + 2} import z from "./template.js"`; const r = /import\\(/g; const q = 4 / 2 / 1;',
    'const m = import.meta.url; obj.import(1); const n = navigator.gpu;',
  ].join('\n'));
  assert.deepEqual(scan.static, ['./a.js', '../b.js', './side.js', './star.js', './d.js']);
  assert.equal(scan.dynamic, 0); assert.deepEqual(scan.globals, ['navigator']);
  assert.equal(scanSource("const x = await import('./x.js');").dynamic, 1);
  assert.deepEqual(scanSource("const k = 'window';").globals, ['window'], 'a string naming a browser global is flagged');
});

test('the Mandelbulb estimate is evaluated in the log domain and matches ½·ln(r)·r/d where that is representable', () => {
  const power8 = effectiveParameters('mandelbulb', { power: '8' }).effective;
  const outside = mandelbulb.evaluate(power8, [1.92, -1.44, 0.7], { maxIterations: 128 });
  const r = Math.hypot(1.92, -1.44, 0.7);
  assert.equal(outside.status, 'escaped'); assert.equal(outside.index, 1); assert.equal(outside.orbit.radius, r);
  assert.equal(outside.logR, Math.log(r), 'logR is the natural logarithm'); assert.equal(outside.estimate.available, true); assert.equal(outside.estimate.reason, null);
  close(outside.estimate.log2DE, Math.log2(0.5 * Math.log(r) * r / 1));
  const axis = mandelbulb.evaluate(power8, [0, 0, 1], { maxIterations: 128 });
  assert.equal(axis.index, 3); assert.deepEqual(axis.orbit.components, [0, 0, 257]);
  close(axis.estimate.log2DE, Math.log2(0.5 * Math.log(257) * 257 / 9217));
  const origin = mandelbulb.evaluate(power8, [0, 0, 0], { maxIterations: 64 });
  assert.deepEqual(origin, { kind: 'fractal', status: 'not-escaped', index: 64, logR: null, estimate: { available: false, log2DE: null, reason: 'not-escaped' }, orbit: { radius: 0, components: [0, 0, 0] } });
  const huge = mandelbulb.evaluate(power8, [1.5e308, 1.5e308, 0], { maxIterations: 8 });
  assert.equal(huge.status, 'escaped'); assert.equal(huge.index, 1); assert.equal(huge.orbit.radius, Infinity, 'the materialized norm overflows');
  assert.equal(huge.estimate.available, true, 'an overflowing norm does not block the log-domain estimate');
  close(huge.logR, Math.log(1.5e308) + Math.LN2 / 2); assert.ok(Number.isFinite(huge.estimate.log2DE));
  const power2 = effectiveParameters('mandelbulb', { power: '2' }).effective;
  assert.equal(mandelbulb.evaluate(power2, [0, 0, 1], { maxIterations: 8 }).index, 3, 'power 2: 0 → 1 → 2 → 5');
});

test('every escape-time point status is distinct and invalid inputs are numerical failures, not misses', () => {
  const power8 = effectiveParameters('mandelbulb', { power: '8' }).effective;
  const quat = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '0' }).effective;
  for (const [model, effective] of [[mandelbulb, power8], [quaternionJulia, quat]]) {
    for (const bad of [[NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity]]) {
      assert.deepEqual(model.evaluate(effective, bad, { maxIterations: 16 }), { kind: 'fractal', status: 'numerical-failure', index: 0, logR: null, estimate: { available: false, log2DE: null, reason: 'guard' }, orbit: { radius: null, components: null } });
      assert.deepEqual(model.trace(effective, bad, { maxIterations: 16 }), []);
    }
    for (const budget of [0, 513, 1.5, '8', undefined]) assert.throws(() => model.evaluate(effective, [0, 0, 0], { maxIterations: budget }), RangeError);
    assert.throws(() => model.evaluate(effective, [0, 0], { maxIterations: 8 }), TypeError);
  }
  assert.throws(() => mandelbulb.evaluate({ power: 9 }, [0, 0, 0], { maxIterations: 8 }), RangeError);
  assert.throws(() => quaternionJulia.evaluate({ C: [0, 0, 0, 0], kappa: 4.5 }, [0, 0, 0], { maxIterations: 8 }), RangeError);
});

test('quaternion escape is tested at initialization and after each update against the outward-rounded bound', () => {
  const two = effectiveParameters('quaternion-julia', { C: ['2', '0', '0', '0'], kappa: '0' }).effective;
  const { bound } = escapeRadius(two.C);
  assert.ok(bound > 2 && bound < 2 + 2 ** -16, 'R(C) = 2 is rounded outward (B02: two outward steps per operation)');
  const steps = quaternionJulia.trace(two, [0, 0, 0], { maxIterations: 128 });
  assert.deepEqual(steps.map(s => s.components), [[2, 0, 0, 0], [6, 0, 0, 0]]);
  assert.ok(steps.every(s => isZero(s.d)), 'sensitivity is zero from update 1');
  assert.equal(quaternionJulia.evaluate(two, [2.000001, 0, 0], { maxIterations: 8 }).index, 1, 'a norm between R(C) and its outward bound is not escaped at initialization');
  const outside = quaternionJulia.evaluate(two, [3, 0, 0], { maxIterations: 128 });
  assert.equal(outside.status, 'escaped'); assert.equal(outside.index, 0, 'escape at initialization');
  close(outside.estimate.log2DE, Math.log2(0.5 * Math.log(3) * 3 / 1));
  const empty = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '-4' }).effective;
  const r = quaternionJulia.evaluate(empty, [0, 0, 0], { maxIterations: 128 });
  assert.equal(r.index, 0); assert.deepEqual(r.orbit.components, [0, 0, 0, empty.kappa], 'the slice coordinate κ is the fourth component');
  assert.deepEqual(quaternionJulia.trace(empty, [0, 0, 0], { maxIterations: 128 }), []);
  const q = quaternionJulia.trace(effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0.15', '-0.1'], kappa: '0.5' }).effective, [0.1, 0.2, 0.3], { maxIterations: 1 })[0];
  const C = [-0.2, 0.8, 0.15, -0.1].map(Math.fround), [a, b, c, d] = [0.1, 0.2, 0.3, Math.fround(0.5)];
  assert.deepEqual(q.components, [a * a - b * b - c * c - d * d + C[0], 2 * a * b + C[1], 2 * a * c + C[2], 2 * a * d + C[3]], 'the full q² + C');
  close(toNumber(q.d), 2 * Math.hypot(a, b, c, d));
});

test('the box and the Menger union classify boundary, interior and shared faces exactly for their binary64 geometry', () => {
  assert.deepEqual(analytic.sphere.evaluate({}, [0, 0, 0.5]), { kind: 'analytic', validity: 'valid', distance: -0.5, applicability: 'interior' }, 'the sphere is signed');
  assert.deepEqual(analytic.box.evaluate({}, [0, 0, 0.25]), { kind: 'analytic', validity: 'valid', distance: 0, applicability: 'boundary' });
  assert.deepEqual(analytic.box.evaluate({}, [0, 0, 0.5]), { kind: 'analytic', validity: 'valid', distance: 0.25, applicability: 'exterior' });
  assert.deepEqual(analytic.box.evaluate({}, [0, 0, 0]), { kind: 'analytic', validity: 'valid', distance: 0, applicability: 'interior' }, 'exterior-only: interior zero');
  const c = Math.sqrt(3) / 2;
  close(analytic.box.evaluate({}, [2 * c, 1, 0]).distance, 1, 2 ** -48);
  assert.equal(analytic.box.evaluate({}, [0.9 * c, 0.45, 0]).applicability, 'interior', 'the box is rotated by π/6 about z');
  assert.equal(analytic.box.evaluate({}, [0, 0.55, 0]).applicability, 'interior', 'outside the unrotated box, inside the rotated one');
  assert.equal(analytic.box.evaluate({}, [0.95, -0.2, 0]).applicability, 'exterior', 'inside the unrotated box, beyond the rotated local y half-extent');
  for (const bad of [[NaN, 0, 0], [0, 0, Infinity]]) {
    assert.deepEqual(analytic.sphere.evaluate({}, bad), { kind: 'analytic', validity: 'numerical-failure', distance: null, applicability: null });
    assert.equal(menger.evaluate({ depth: 2 }, bad).validity, 'numerical-failure');
  }
  const depth1 = menger.boxes(1);
  assert.ok(depth1.every(b => b.half.every(h => h === 1 / 3)));
  assert.ok(depth1.every(b => b.centre.filter(x => x === 0).length <= 1), 'at most one middle index');
  assert.equal(new Set(menger.boxes(2).map(b => b.centre.join())).size, 400);
  assert.ok(Object.isFrozen(menger.boxes(2)));
  close(menger.evaluate({ depth: 1 }, [0, 0, 0]).distance, Math.SQRT2 / 3, 2 ** -50);
  assert.deepEqual(menger.evaluate({ depth: 1 }, [1, 0.5, 0.5]), { kind: 'analytic', validity: 'valid', distance: 0, applicability: 'boundary' }, 'an outer face');
  assert.deepEqual(menger.evaluate({ depth: 1 }, [2 / 3, 2 / 3, 1 / 3]), { kind: 'analytic', validity: 'valid', distance: 0, applicability: 'interior' }, 'a face shared by two kept boxes is inside the union');
  assert.equal(menger.evaluate({ depth: 1 }, [1, 2 / 3, 1 / 3]).applicability, 'boundary', 'a shared face meeting the outer face');
  assert.equal(menger.evaluate({ depth: 1 }, [1 / 3, 1 / 3, 0]).applicability, 'boundary', 'an edge of the removed centre tunnel');
  assert.equal(menger.evaluate({ depth: 2 }, [0.9, 0.9, 0.9]).applicability, 'interior');
  assert.equal(menger.evaluate({ depth: 2 }, [2 / 3, 2 / 3, 2 / 3]).applicability, 'exterior', 'the centre of a depth-1 corner box is removed at depth 2');
  assert.equal(menger.evaluate({ depth: 1 }, [2 / 3, 2 / 3, 2 / 3]).applicability, 'interior');
  assert.throws(() => menger.evaluate({ depth: 3 }, [0, 0, 0]), RangeError); assert.throws(() => menger.boxes(0), RangeError);
});

test('model records are keyed id@version and carry tagged domains, estimator categories and enclosing volumes', () => {
  assert.deepEqual(Object.keys(MODEL_RECORDS).sort(), ['box@1', 'mandelbulb@1', 'menger@1', 'quaternion-julia@1', 'sphere@1']);
  assert.ok(Object.isFrozen(MODEL_RECORDS));
  for (const [key, record] of Object.entries(MODEL_RECORDS)) {
    assert.equal(key, `${record.id}@${record.version}`); assert.equal(getModel(record.id, record.version), record);
    assert.equal(record.supportedParameters, SUPPORTED_DOMAINS[record.id], 'B02 tagged descriptors, not copies');
    assert.ok(ESTIMATOR_CATEGORIES.includes(record.estimator.category));
    assert.equal(typeof record.estimator.derivationVersion, 'string'); assert.equal(typeof record.evaluate, 'function');
    assert.ok(!('validation' in record), 'records embed no validation claim');
  }
  assert.equal(MODEL_RECORDS['sphere@1'].estimator.semantics, 'signed');
  for (const id of ['box', 'menger', 'mandelbulb', 'quaternion-julia']) assert.equal(MODEL_RECORDS[`${id}@1`].estimator.semantics, 'exterior-only');
  assert.equal(MODEL_RECORDS['mandelbulb@1'].estimator.category, 'heuristic'); assert.equal(MODEL_RECORDS['menger@1'].estimator.category, 'exact-distance');
  assert.equal(typeof MODEL_RECORDS['mandelbulb@1'].trace, 'function'); assert.ok(!('trace' in MODEL_RECORDS['sphere@1']));
  const power = p => effectiveParameters('mandelbulb', { power: p }).effective;
  for (const p of ['2', '5', '8']) assert.deepEqual(MODEL_RECORDS['mandelbulb@1'].enclosingVolume(power(p)), { kind: 'sphere', radius: 2 });
  assert.deepEqual(MODEL_RECORDS['sphere@1'].enclosingVolume({}), { kind: 'sphere', radius: 2 });
  assert.deepEqual(MODEL_RECORDS['box@1'].enclosingVolume({}), { kind: 'sphere', radius: 2 });
  assert.deepEqual(MODEL_RECORDS['menger@1'].enclosingVolume({ depth: 2 }), { kind: 'box', min: [-1, -1, -1], max: [1, 1, 1] });
  const quat = effectiveParameters('quaternion-julia', { C: ['4', '4', '4', '4'], kappa: '0' }).effective;
  assert.deepEqual(MODEL_RECORDS['quaternion-julia@1'].enclosingVolume(quat), { kind: 'sphere', radius: escapeRadius(quat.C).bound });
  assert.throws(() => getModel('mandelbulb', 2), error => error.code === 'unsupported-model');
  assert.throws(() => getModel('torus', 1), error => error.code === 'unsupported-model');
});

test('camera classification details its reason and never treats an unavailable estimate as exterior', () => {
  const quat = getModel('quaternion-julia', 1);
  const zeroSensitivity = effectiveParameters('quaternion-julia', { C: ['2', '0', '0', '0'], kappa: '0' }).effective;
  const z = classifyCamera(quat, zeroSensitivity, [0, 0, 0], 128);
  assert.equal(z.status, 'unresolved'); assert.equal(z.detail.reason, 'zero-sensitivity'); assert.equal(z.detail.result.status, 'escaped');
  const e = classifyCamera(getModel('sphere', 1), {}, [0, 0, 2], 128);
  assert.deepEqual(e, { status: 'exterior', detail: { reason: 'exterior', result: analytic.sphere.evaluate({}, [0, 0, 2]) } });
  assert.equal(classifyCamera(getModel('menger', 1), { depth: 1 }, [0, 0, 0], 128).status, 'exterior');
  assert.equal(classifyCamera(getModel('box', 1), {}, [0, 0, 0], 128).detail.reason, 'interior');
  assert.equal(classifyCamera(getModel('sphere', 1), {}, [0, 0, NaN], 128).detail.reason, 'numerical-failure');
  const bulb = getModel('mandelbulb', 1), power8 = effectiveParameters('mandelbulb', { power: '8' }).effective;
  assert.equal(classifyCamera(bulb, power8, [0, 0, 0], 128).detail.reason, 'not-escaped');
  assert.equal(classifyCamera(bulb, power8, [0, 0, 0], 128).detail.result.index, 128, 'the budget is the iteration budget');
  for (const budget of [0, 513, 2.5]) assert.throws(() => classifyCamera(bulb, power8, [0, 0, 0], budget), RangeError);
});
