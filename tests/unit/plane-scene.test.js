import test from 'node:test';
import assert from 'node:assert/strict';
import { moveView, validateView, INITIAL_VIEW } from '../../src/plane/math.js';
import { DEFAULT_MAX_SCENE_BYTES } from '../../src/shared/scene.js';
import {
  sceneCodec, createPlaneScene, toPlaneState, planeIterations, planeDependencies, PLANE_INITIAL_SCENE,
  encodeShareHash, decodeShareHash, encodeSceneFile, decodeSceneFile, DECIMAL_BUDGET_DIGITS, admitEnteredView,
  createPlaneSceneAdapter,
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
  assert.equal(decodeShareHash(`#scene=${'A'.repeat(Math.ceil(DEFAULT_MAX_SCENE_BYTES * 4 / 3) + 8)}`).error.code, 'too-large');
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

const linkFor = text => `#scene=${Buffer.from(text, 'utf8').toString('base64url')}`;

test('coerced model identities are rejected through files and links', () => {
  for (const model of [{ id: 'plane-mandelbrot', version: '1' }, { id: 'plane-mandelbrot', version: [1] }, { id: ['plane-mandelbrot'], version: 1 }]) {
    const text = JSON.stringify(withScene(PLANE_INITIAL_SCENE, { model }));
    assert.equal(errorCode(() => decodeSceneFile(text)), 'invalid-value', `file ${JSON.stringify(model)}`);
    const decoded = decodeShareHash(linkFor(text));
    assert.equal(decoded.kind, 'unsupported', `link ${JSON.stringify(model)}`);
    assert.equal(decoded.error.code, 'invalid-value', `link ${JSON.stringify(model)}`);
  }
  assert.equal(decodeShareHash(linkFor(sceneCodec.serialize(PLANE_INITIAL_SCENE))).kind, 'scene');
});

// A scene whose canonical serialization is exactly `bytes` long: a coordinate with a long
// run of leading zeros in its exponent is lexically valid and costs one byte per zero.
function sceneOfSize(bytes) {
  const base = createPlaneScene({ view: { re: '0e0', im: '0', zoom: 0 } });
  const zeros = bytes - sceneCodec.serialize(base).length;
  return { re: `0e${'0'.repeat(zeros + 1)}`, im: '0', zoom: 0 };
}

test('every admitted scene exports to a file and a link that both reopen, up to the default byte budget', () => {
  assert.equal(sceneCodec.maxSceneBytes, DEFAULT_MAX_SCENE_BYTES, 'the named exports use the default limit');
  const scene = createPlaneScene({ view: sceneOfSize(DEFAULT_MAX_SCENE_BYTES) });
  const canonical = sceneCodec.serialize(scene);
  assert.equal(canonical.length, DEFAULT_MAX_SCENE_BYTES);
  const file = encodeSceneFile(scene);
  assert.ok(Buffer.byteLength(file, 'utf8') <= DEFAULT_MAX_SCENE_BYTES, 'the exported file fits the import limit');
  assert.ok(sceneCodec.equal(decodeSceneFile(file), scene));
  const decoded = decodeShareHash(encodeShareHash(scene));
  assert.equal(decoded.kind, 'scene');
  assert.ok(sceneCodec.equal(decoded.scene, scene));
  assert.match(encodeSceneFile(PLANE_INITIAL_SCENE), /^\{\n {2}"/, 'a scene that fits is still pretty-printed');
  assert.ok(sceneCodec.equal(decodeSceneFile(encodeSceneFile(PLANE_INITIAL_SCENE)), PLANE_INITIAL_SCENE));
});

const LIMIT = 4096;
const small = createPlaneSceneAdapter({ maxSceneBytes: LIMIT });

test('the Plane adapter factory binds every operation to one configured codec', () => {
  assert.ok(Object.isFrozen(small));
  assert.deepEqual(Object.keys(small).sort(), ['createPlaneScene', 'decodeSceneFile', 'decodeShareHash', 'encodeSceneFile', 'encodeShareHash', 'sceneCodec']);
  assert.equal(small.sceneCodec.maxSceneBytes, LIMIT);
  assert.equal(createPlaneSceneAdapter().sceneCodec.maxSceneBytes, DEFAULT_MAX_SCENE_BYTES, 'omitting the option uses the default');
  for (const value of [0, -1, 1.5, NaN, Infinity, 2 ** 53, '4096', null]) {
    assert.throws(() => createPlaneSceneAdapter({ maxSceneBytes: value }), RangeError, String(value));
  }
  const { createPlaneScene: create, encodeShareHash: link, decodeShareHash: unlink } = small;
  const scene = create({ view: INITIAL_VIEW });
  assert.ok(small.sceneCodec.equal(unlink(link(scene)).scene, scene), 'the methods do not depend on this');
  assert.equal(small.sceneCodec.fingerprint(scene).sceneHash, sceneCodec.fingerprint(PLANE_INITIAL_SCENE).sceneHash, 'the limit stays out of scene data and fingerprints');
});

test('a small configured limit: the exact limit round-trips through file and link, one byte more is rejected', () => {
  const scene = small.createPlaneScene({ view: sceneOfSize(LIMIT) });
  assert.equal(small.sceneCodec.serialize(scene).length, LIMIT);
  const file = small.encodeSceneFile(scene);
  assert.equal(file, small.sceneCodec.serialize(scene), 'pretty output over the limit falls back to the canonical form');
  assert.ok(small.sceneCodec.equal(small.decodeSceneFile(file), scene));
  const decoded = small.decodeShareHash(small.encodeShareHash(scene));
  assert.equal(decoded.kind, 'scene');
  assert.ok(small.sceneCodec.equal(decoded.scene, scene));
  const fits = small.createPlaneScene({ view: sceneOfSize(LIMIT - 400) });
  assert.match(small.encodeSceneFile(fits), /^\{\n {2}"[^]*\}\n$/, 'pretty output within the limit is kept');
  const view = sceneOfSize(LIMIT + 1);
  assert.equal(errorCode(() => small.createPlaneScene({ view })), 'too-large');
  const input = withScene(PLANE_INITIAL_SCENE, { camera: { ...view } });
  assert.equal(errorCode(() => small.sceneCodec.validate(input)), 'too-large');
  assert.equal(errorCode(() => small.decodeSceneFile(JSON.stringify(input))), 'too-large');
  assert.equal(small.decodeShareHash(linkFor(JSON.stringify(input))).error.code, 'too-large');
  assert.equal(small.decodeShareHash(linkFor(`${file} `)).error.code, 'too-large', 'link text one byte over the limit');
  assert.equal(errorCode(() => small.decodeSceneFile(`${file} `)), 'too-large', 'file text one byte over the limit');
  assert.equal(errorCode(() => small.decodeSceneFile(`"${'é'.repeat(LIMIT / 2)}"`)), 'too-large', 'the limit counts UTF-8 bytes');
  assert.equal(small.decodeShareHash(`#scene=${'A'.repeat(Math.ceil(LIMIT * 4 / 3) + 8)}`).error.code, 'too-large', 'the link guard derives from the limit');
  assert.notEqual(decodeShareHash(`#scene=${'A'.repeat(Math.ceil(LIMIT * 4 / 3) + 8)}`).error.code, 'too-large', 'the default adapter has its own guard');
});

test('a small configured limit rejects import text within the limit whose canonical form grows past it', () => {
  const text = small.sceneCodec.serialize(small.createPlaneScene({ view: sceneOfSize(LIMIT - 2) })).replace('"zoom":0', '"zoom":1e3');
  assert.equal(Buffer.byteLength(text, 'utf8'), LIMIT);
  assert.equal(errorCode(() => small.decodeSceneFile(text)), 'too-large');
  assert.equal(small.decodeShareHash(linkFor(text)).error.code, 'too-large');
  assert.equal(decodeSceneFile(text).camera.zoom, 1000, 'the default adapter admits it');
});

test('two adapters with different limits are independent; the smaller refuses to export a larger scene', () => {
  const large = createPlaneSceneAdapter({ maxSceneBytes: 2 * LIMIT });
  const scene = large.createPlaneScene({ view: sceneOfSize(LIMIT + 1) });
  assert.ok(large.sceneCodec.equal(large.decodeSceneFile(large.encodeSceneFile(scene)), scene));
  assert.equal(large.decodeShareHash(large.encodeShareHash(scene)).kind, 'scene');
  assert.equal(errorCode(() => small.encodeSceneFile(scene)), 'too-large');
  assert.equal(errorCode(() => small.encodeShareHash(scene)), 'too-large');
  assert.equal(errorCode(() => small.decodeSceneFile(large.encodeSceneFile(scene))), 'too-large');
  assert.equal(small.decodeShareHash(large.encodeShareHash(scene)).error.code, 'too-large');
  assert.equal(small.sceneCodec.maxSceneBytes, LIMIT, 'constructing another adapter does not change this one');
  assert.equal(sceneCodec.maxSceneBytes, DEFAULT_MAX_SCENE_BYTES);
});

test('a bridged scene whose inner scene fits but whose whole form exceeds the limit is rejected', () => {
  const inner = JSON.parse(small.sceneCodec.serialize(small.createPlaneScene({ view: sceneOfSize(LIMIT - 200) })));
  const outer = withScene(PLANE_INITIAL_SCENE, { provenance: { createdBy: 'atlas', bridgedFrom: inner } });
  assert.ok(sceneCodec.serialize(sceneCodec.validate(outer)).length > LIMIT);
  assert.equal(errorCode(() => small.sceneCodec.validate(outer)), 'too-large');
  assert.equal(errorCode(() => small.decodeSceneFile(sceneCodec.serialize(sceneCodec.validate(outer)))), 'too-large');
  const large = createPlaneSceneAdapter({ maxSceneBytes: 2 * LIMIT });
  const bridged = large.sceneCodec.validate(outer);
  assert.ok(large.sceneCodec.equal(large.decodeSceneFile(large.encodeSceneFile(bridged)), bridged), 'one allowance for the whole document');
  assert.equal(errorCode(() => small.encodeSceneFile(bridged)), 'too-large');
  assert.equal(errorCode(() => small.encodeShareHash(bridged)), 'too-large');
});
