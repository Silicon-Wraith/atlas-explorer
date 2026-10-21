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

// --- Fix round 1 (Codex B03 r1) ------------------------------------------------

test('malformed and sparse points are rejected by every evaluator', () => {
  const power8 = effectiveParameters('mandelbulb', { power: '8' }).effective;
  const quat = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '0' }).effective;
  const evaluators = [
    p => mandelbulb.evaluate(power8, p, { maxIterations: 1 }), p => mandelbulb.trace(power8, p, { maxIterations: 1 }),
    p => quaternionJulia.evaluate(quat, p, { maxIterations: 1 }), p => quaternionJulia.trace(quat, p, { maxIterations: 1 }),
    p => analytic.sphere.evaluate({}, p), p => analytic.box.evaluate({}, p), p => menger.evaluate({ depth: 1 }, p), p => menger.evaluate({ depth: 2 }, p),
    p => classifyCamera(getModel('mandelbulb', 1), power8, p, 8),
  ];
  const sparse = [Array(3), [0, , 0], [, 0, 0], [0, 0, ,], [0, 0, undefined], [0, '0', 0], [0, 0], [0, 0, 0, 0], null, 'abc', { 0: 0, 1: 0, 2: 0, length: 3 }];
  for (const evaluate of evaluators) {
    for (const bad of sparse) assert.throws(() => evaluate(bad), TypeError, `${JSON.stringify(bad)} is malformed`);
    assert.doesNotThrow(() => evaluate([0, 0, NaN]), 'a numeric NaN component is a field-domain failure, not a shape error');
  }
});

test('the boundary scanner handles postfix operators, control-statement regexes and escapes, and fails closed', () => {
  assert.deepEqual(scanSource('let x = 1; x++ / 2; import "node:fs"; const r = /foo/;').static, ['node:fs']);
  assert.equal(scanSource('let x = 1; x++ / 2; import(name); const r = /foo/;').dynamic, 1);
  assert.deepEqual(scanSource('let x = 1; x++ / 2; document.body; const r = /foo/;').globals, ['document']);
  assert.deepEqual(scanSource('let x = 1; x-- / 2; window.x; const r = /foo/;').globals, ['window']);
  assert.deepEqual(scanSource('const s = "doc\\u0075ment";').globals, ['document'], 'string escapes are decoded');
  assert.deepEqual(scanSource("const s = 'nav\\x69gator';").globals, ['navigator']);
  assert.deepEqual(scanSource('const s = `GPU\\u{44}evice`;').globals, ['GPUDevice']);
  assert.deepEqual(scanSource("if (ok) /'/.test(s); import './after.js';").static, ['./after.js'], 'a regex after a control-statement condition');
  assert.deepEqual(scanSource("const q = (a + b) / 2; import './after.js'; const t = a / b / c;").static, ['./after.js'], 'division after a parenthesized expression');
  assert.deepEqual(scanSource('const τ = 1; const n = τ / 2;').globals, [], 'non-ASCII identifiers');
  for (const unsupported of ['doc\\u0075ment.body;', 'function f() {}\n/x/.test(y);', "import x, y;"]) {
    assert.throws(() => scanSource(unsupported), SyntaxError, unsupported);
  }
});

test('boundary violations fail closed when a source cannot be scanned', async () => {
  const violations = await boundaryViolations(['tests/fixtures/boundary/unscannable'], [/^src\//]);
  assert.deepEqual(violations.map(v => v.kind), ['unparsed']);
});

// The Z-polar power map without spherical transcendentals: with ρ = ‖(x, y)‖,
// (sin pθ, cos pθ)·r^p = (Im, Re) of (z + iρ)^p and (cos pφ, sin pφ)·ρ^p = (Re, Im) of (x + iy)^p.
function algebraicStep([x, y, z], p, c) {
  const pow = (re, im) => { let a = 1, b = 0; for (let k = 0; k < p; k++) [a, b] = [a * re - b * im, a * im + b * re]; return [a, b]; };
  const rho = Math.hypot(x, y), [zr, zi] = pow(z, rho);
  if (rho === 0) return [c[0], c[1], zr + c[2]];
  const [ar, ai] = pow(x, y), scale = rho ** p;
  return [zi * ar / scale + c[0], zi * ai / scale + c[1], zr + c[2]];
}

test('Mandelbulb off-axis orbits match an algebraic Z-polar power map for every power 2–8', () => {
  const power2 = effectiveParameters('mandelbulb', { power: '2' }).effective;
  const second = mandelbulb.trace(power2, [3 / 16, 4 / 16, 5 / 16], { maxIterations: 2 })[1].components;
  [17 / 128, 7 / 16, 5 / 16].forEach((value, i) => assert.ok(Math.abs(second[i] - value) <= 2 ** -50, `component ${i}: ${second[i]}`));
  for (let p = 2; p <= 8; p++) {
    const effective = effectiveParameters('mandelbulb', { power: String(p) }).effective;
    for (const c of [[0.3, -0.2, 0.25], [-0.45, 0.35, -0.1], [0.12, 0.61, 0.4]]) {
      const steps = mandelbulb.trace(effective, c, { maxIterations: 4 });
      let z = [0, 0, 0];
      for (const [n, step] of steps.entries()) {
        z = algebraicStep(z, p, c);
        z.forEach((value, i) => assert.ok(Math.abs(step.components[i] - value) <= 1e-12 * Math.max(1, Math.abs(value)), `p=${p} c=${c} update ${n + 1} component ${i}`));
      }
      assert.ok(steps.length >= 2, 'each orbit has at least two updates');
      assert.ok(steps.some(s => s.components[0] !== c[0] && s.components[1] !== c[1]), 'the azimuth contributes');
    }
  }
});

test('Mandelbulb negative polar-axis orbits follow the exact axis limit (0, 0, z^p) within rounding', () => {
  for (let p = 2; p <= 8; p++) {
    const effective = effectiveParameters('mandelbulb', { power: String(p) }).effective;
    for (const s of [2 ** -3, 0.5, 1, 1.5, 2, 4]) {
      const point = [0, 0, -s], result = mandelbulb.evaluate(effective, point, { maxIterations: 16 });
      const steps = mandelbulb.trace(effective, point, { maxIterations: 16 });
      let z = 0, index = 0;
      for (let n = 1; n <= 16; n++) { z = z ** p - s; index = n; if (Math.abs(z) > 2) break; }
      assert.equal(result.index, Math.abs(z) > 2 ? index : 16, `p=${p} s=${s}: escape index`);
      assert.equal(result.status, Math.abs(z) > 2 ? 'escaped' : 'not-escaped');
      let w = 0;
      for (const step of steps) {
        w = w ** p - s;
        const scale = Math.max(1, Math.abs(w));
        assert.ok(Math.abs(step.components[0]) <= 1e-12 * scale && Math.abs(step.components[1]) <= 1e-12 * scale, `p=${p} s=${s}: off-axis remnant is rounding only`);
        assert.ok(Math.abs(step.components[2] - w) <= 1e-12 * scale, `p=${p} s=${s}: axis value`);
      }
    }
  }
});

test('a multi-update off-plane quaternion orbit matches the Hamilton product and evolves all four components', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0.15', '-0.1'], kappa: '0.5' }).effective;
  const C = effective.C, hamilton = ([a, b, c, d], [e, f, g, h]) => [a * e - b * f - c * g - d * h, a * f + b * e + c * h - d * g, a * g - b * h + c * e + d * f, a * h + b * g - c * f + d * e];
  const steps = quaternionJulia.trace(effective, [0.1, 0.2, 0.3], { maxIterations: 6 });
  assert.equal(steps.length, 6);
  let q = [0.1, 0.2, 0.3, effective.kappa];
  const fourth = [];
  for (const step of steps) {
    q = hamilton(q, q).map((value, i) => value + C[i]);
    q.forEach((value, i) => assert.ok(Math.abs(step.components[i] - value) <= 1e-14, `component ${i}`));
    fourth.push(step.components[3]);
  }
  assert.ok(new Set(fourth).size === 6 && fourth.every(value => value !== effective.kappa), 'the fourth component evolves and is never reset to κ');
});

test('camera classification derives exterior from the full predicate and rejects inconsistent results', () => {
  const fake = result => ({ evaluate: () => result });
  for (const distance of [0, -1, NaN, Infinity, null]) {
    const c = classifyCamera(fake({ kind: 'analytic', validity: 'valid', distance, applicability: 'exterior' }), {}, [0, 0, 0], 8);
    assert.equal(c.status, 'unresolved', `distance ${distance}`); assert.equal(c.detail.reason, 'inconsistent-result');
  }
  const escaped = log2DE => fake({ kind: 'fractal', status: 'escaped', index: 1, logR: 1, estimate: { available: true, log2DE, reason: null }, orbit: { radius: 3, components: [3, 0, 0] } });
  for (const bad of [NaN, Infinity, null]) assert.equal(classifyCamera(escaped(bad), {}, [0, 0, 0], 8).detail.reason, 'inconsistent-result');
  assert.equal(classifyCamera(escaped(-3), {}, [0, 0, 0], 8).status, 'exterior');
  assert.equal(classifyCamera(fake({ kind: 'other' }), {}, [0, 0, 0], 8).detail.reason, 'inconsistent-result');
});

// --- Fix round 2 (Codex B03 r2) ------------------------------------------------

test('member names spelled like keywords never open a regex or a control condition', () => {
  const tail = " / 2; document.body; import './after.js'; import(name); const r = /foo/;";
  const expectDetected = (source, label) => {
    let scan = null;
    try { scan = scanSource(source); } catch { /* reported below as an assertion */ }
    assert.ok(scan, `${label}: ordinary static syntax must be scanned, not rejected`);
    assert.deepEqual(scan.globals, ['document'], `${label}: globals`);
    assert.deepEqual(scan.static, ['./after.js'], `${label}: static imports`);
    assert.equal(scan.dynamic, 1, `${label}: dynamic imports`);
  };
  for (const keyword of ['if', 'while', 'for', 'with']) {
    for (const access of ['obj.', 'obj?.', 'this.#']) expectDetected(`${access}${keyword}(ok)${tail}`, `${access}${keyword}(…)`);
  }
  for (const keyword of ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await', 'else', 'do']) {
    for (const access of ['obj.', 'obj?.']) expectDetected(`${access}${keyword}${tail}`, `${access}${keyword}`);
  }
});

test('control-statement keywords still allow a regex after their condition', () => {
  for (const statement of ['if (ok)', 'while (ok)', 'for (;;)', 'for (const x of y)', 'with (o)', 'for await (const x of y)']) {
    let scan = null;
    try { scan = scanSource(`${statement} /'/.test(s); import './after.js'; document.body;`); } catch { /* asserted below */ }
    assert.ok(scan, `${statement}: scanned`);
    assert.deepEqual(scan.static, ['./after.js'], statement); assert.deepEqual(scan.globals, ['document'], statement);
  }
  assert.deepEqual(scanSource("const v = await (p) / 2; import './after.js';").static, ['./after.js'], 'await (…) outside for-await is division');
  assert.deepEqual(scanSource("f(...void /'/); import './after.js';").static, ['./after.js'], 'a keyword after a spread is still a keyword');
});
