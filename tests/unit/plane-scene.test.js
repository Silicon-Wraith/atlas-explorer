import test from 'node:test';
import assert from 'node:assert/strict';
import { moveView, validateView, INITIAL_VIEW } from '../../src/plane/math.js';
import { MAX_SCENE_BYTES } from '../../src/shared/scene.js';
import {
  sceneCodec, createPlaneScene, toPlaneState, planeIterations, planeDependencies, PLANE_INITIAL_SCENE,
  encodeShareHash, decodeShareHash, encodeSceneFile, decodeSceneFile, DECIMAL_BUDGET_DIGITS, admitEnteredView,
} from '../../src/plane/scene-adapter.js';

const errorCode = fn => { try { fn(); return 'valid'; } catch (error) { return error.code; } };
const withScene = (scene, patch) => JSON.parse(JSON.stringify({ ...JSON.parse(sceneCodec.serialize(scene)), ...patch }));

test('a Plane scene preserves exact coordinate strings and derives iterations from the named policy', () => {
  const view = { re: '-0.743643887037158704752191506114774', im: '1.23456e-70', zoom: 15.5 };
  const scene = createPlaneScene({ view, settings: { palette: 'aurora', detail: 3 } });
  assert.equal(scene.camera.re, view.re);
  assert.equal(scene.camera.im, '1.23456e-70');
  const state = toPlaneState(sceneCodec.parse(sceneCodec.serialize(scene)));
  assert.deepEqual(state.view, view);
  assert.equal(state.settings.iterations, 4096 + 400);
  assert.equal(planeIterations(1, 3.85), 1024 + 28);
  assert.deepEqual(toPlaneState(PLANE_INITIAL_SCENE).view, { ...INITIAL_VIEW });
  assert.deepEqual(toPlaneState(PLANE_INITIAL_SCENE).settings, { palette: 'ember', phase: 0.11, frequency: 1, relief: 1, detail: 1, iterations: 1052 });
});

test('pan outside the entry range round-trips as a native scene', () => {
  const panned = moveView({ re: '0', im: '0', zoom: 0 }, 2, 0);
  assert.equal(panned.re, '6.8');
  assert.throws(() => validateView(panned), 'the coordinate-entry dialog keeps its bounds');
  const scene = createPlaneScene({ view: panned });
  assert.equal(sceneCodec.parse(sceneCodec.serialize(scene)).camera.re, '6.8');
});

test('decimal expansion beyond the resource budget is classified without materializing it', () => {
  const start = performance.now();
  for (const re of ['1e1000000000000', '1e-1000000000000', `0.${'1'.repeat(DECIMAL_BUDGET_DIGITS + 1)}`]) {
    assert.equal(errorCode(() => createPlaneScene({ view: { re, im: '0', zoom: 0 } })), 'resource-limit', re.slice(0, 20));
  }
  assert.equal(errorCode(() => createPlaneScene({ view: { re: '0', im: '0', zoom: 1e9 } })), 'resource-limit');
  assert.equal(errorCode(() => createPlaneScene({ view: { re: '1e200000', im: '0', zoom: 199964 } })), 'resource-limit', 'the combined precision and exponent expansion is bounded');
  assert.ok(performance.now() - start < 1000, 'the check must not expand powers of ten');
  assert.equal(errorCode(() => createPlaneScene({ view: { re: '-2', im: '0', zoom: 10000 } })), 'valid');
});

test('coordinate entry rejects an oversized decimal before anything materializes it', () => {
  let materialized = 0;
  const spy = view => { materialized++; return validateView(view); };
  for (const view of [{ re: '1e1000000000000', im: '0', zoom: 0 }, { re: '0', im: `1e-${'9'.repeat(12)}`, zoom: 0 }, { re: '0', im: '0', zoom: 1e9 }]) {
    assert.equal(errorCode(() => admitEnteredView(view, spy)), 'resource-limit');
  }
  assert.equal(materialized, 0, 'validateView was never reached');
  assert.deepEqual(admitEnteredView({ re: '-2', im: '0', zoom: 40 }, spy), { re: '-2', im: '0', zoom: 40 });
  assert.throws(() => admitEnteredView({ re: '5', im: '0', zoom: 1 }, spy), /coordinate/i, 'the entry dialog keeps its mathematical bounds after the preflight');
  assert.equal(materialized, 2);
});

test('invalid values are reported, never clamped, and nothing is inherited', () => {
  const base = PLANE_INITIAL_SCENE;
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { appearance: { ...base.appearance, phase: 1.5 } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { appearance: { ...base.appearance, palette: 'nope' } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { iteration: { policy: 'plane-detail-zoom-v1', detail: 2.5 } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { camera: { re: '0', im: '0', zoom: -0.7 } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { camera: { re: 'x', im: '0', zoom: 0 } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { appearance: { palette: 'ember', phase: 0.1, frequency: 1 } }))), 'missing-field');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { tracing: { profile: 'surface-v1' } }))), 'invalid-value');
});

test('share links round-trip every digit; earlier, tampered and oversized links are unsupported', () => {
  const scene = createPlaneScene({ view: { re: '-2', im: '0', zoom: 40 }, settings: { palette: 'rose', phase: 0.25, frequency: 2, relief: 0, detail: 4 } });
  const hash = encodeShareHash(scene);
  assert.match(hash, /^#scene=[A-Za-z0-9_-]+$/);
  const decoded = decodeShareHash(hash);
  assert.equal(decoded.kind, 'scene');
  assert.ok(sceneCodec.equal(decoded.scene, scene));
  assert.deepEqual(decodeShareHash(''), { kind: 'none' });
  assert.equal(decodeShareHash('#re=-2&im=0&z=40&palette=ember').error.code, 'earlier-format');
  assert.equal(decodeShareHash('#somewhere').error.code, 'unrecognized-link');
  assert.equal(decodeShareHash(`${hash.slice(0, -4)}!!!!`).error.code, 'invalid-link');
  assert.equal(decodeShareHash(`${hash.slice(0, 12)}`).kind, 'unsupported');
  assert.equal(decodeShareHash(`#scene=${'A'.repeat(Math.ceil(MAX_SCENE_BYTES * 4 / 3) + 8)}`).error.code, 'too-large');
});

test('scene files round-trip; an earlier location file is rejected as an unsupported format', () => {
  const scene = createPlaneScene({ view: { re: '0.276', im: '0.008', zoom: 2.4 }, settings: { palette: 'ocean' } });
  const text = encodeSceneFile(scene);
  assert.equal(JSON.parse(text).schema, 'atlas.scene');
  assert.ok(sceneCodec.equal(decodeSceneFile(text), scene));
  const earlier = JSON.stringify({ application: 'ATLAS', version: 1, view: { re: '0', im: '0', zoom: 0 }, settings: {} });
  assert.equal(errorCode(() => decodeSceneFile(earlier)), 'unsupported-format');
  assert.equal(errorCode(() => decodeSceneFile('not json')), 'invalid-json');
});

test('geometry and appearance dependencies separate a palette edit from a camera edit', () => {
  const a = createPlaneScene({ view: INITIAL_VIEW });
  const palette = createPlaneScene({ view: INITIAL_VIEW, settings: { palette: 'aurora' } });
  const moved = createPlaneScene({ view: { ...INITIAL_VIEW, zoom: 4 } });
  assert.equal(planeDependencies(a).geometry, planeDependencies(palette).geometry);
  assert.notEqual(planeDependencies(a).appearance, planeDependencies(palette).appearance);
  assert.notEqual(planeDependencies(a).geometry, planeDependencies(moved).geometry);
});
