import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_CONVENTIONS, SPACE_MODELS, CAMERA_KIND, CAMERA_LIMITS, TRACING_PROFILE, TRACING_LIMITS, VIEW_MODES, SPACE_DEFAULTS, spaceModelCodecs, createSpaceSceneAdapter, sceneCodec, createSpaceScene, encodeSceneFile, decodeSceneFile, SPACE_INITIAL_SCENE } from '../../src/space/scene-adapter.js';
import { createSceneCodec, DEFAULT_MAX_SCENE_BYTES, SceneError } from '../../src/shared/scene.js';

const copy = value => JSON.parse(JSON.stringify(value));
const invalidAt = (fn, path, code = 'invalid-value') => assert.throws(fn, error => error instanceof SceneError && error.code === code && error.path === path);

test('a Space scene validates whole, rejects out-of-range values, and round-trips as a file', () => {
  const scene = createSpaceScene({ model: 'quaternion-julia' });
  assert.ok(scene, 'native creation returns a scene');
  assert.equal(scene.workspace, 'space'); assert.equal(scene.camera.kind, 'anchored-perspective-v1');
  const invalid = [
    { model: 'quaternion-julia', parameters: { C: ['5', '0', '0', '0'], kappa: '0' } },
    { model: 'quaternion-julia', parameters: { C: ['4.0000000000000000001', '0', '0', '0'], kappa: '0' } },
    { model: 'mandelbulb', parameters: { power: '9' } },
    { model: 'mandelbulb', parameters: { power: '8.0' } },
    { model: 'mandelbulb', iteration: { maxIterations: 513, bailoutPolicy: 'model-default' } },
    { model: 'menger', parameters: { depth: 3 } },
  ];
  for (const input of invalid) assert.throws(() => createSpaceScene(input), e => e.code === 'invalid-value');
  assert.throws(() => sceneCodec.validate({ ...scene, model: { id: 'mandelbulb', version: 2 } }), e => e.code === 'unsupported-model');
  const text = encodeSceneFile(scene);
  assert.ok(sceneCodec.equal(decodeSceneFile(text), scene));
  assert.equal(sceneCodec.fingerprint(decodeSceneFile(text)).sceneHash, sceneCodec.fingerprint(scene).sceneHash);
  assert.equal(createSpaceSceneAdapter({ maxSceneBytes: 64 }).sceneCodec.maxSceneBytes, 64);
});

test('all five model codecs compose with the shared envelope and preserve every requested digit', () => {
  assert.deepEqual(SPACE_MODELS, ['sphere', 'box', 'menger', 'mandelbulb', 'quaternion-julia'].map(id => ({ id, version: 1 })));
  assert.deepEqual(spaceModelCodecs.map(({ workspace, id, version }) => ({ workspace, id, version })), SPACE_MODELS.map(model => ({ workspace: 'space', ...model })));
  const combined = createSceneCodec({ modelCodecs: spaceModelCodecs });
  for (const { id } of SPACE_MODELS) {
    const scene = createSpaceScene({ model: id });
    assert.equal(scene.conventions, SPACE_CONVENTIONS);
    assert.ok(combined.equal(combined.parse(encodeSceneFile(scene)), scene));
    assert.ok(Object.isFrozen(scene) && Object.isFrozen(scene.camera.anchor));
  }
  const parameters = { C: ['-0.200000000000000000000000000001', '0.800', '-0', '00e+0'], kappa: '0.000' };
  const scene = createSpaceScene({ model: 'quaternion-julia', parameters });
  assert.deepEqual(decodeSceneFile(encodeSceneFile(scene)).parameters, parameters);
  assert.equal('effective' in scene.parameters, false);
  parameters.C[0] = '4'; assert.equal(scene.parameters.C[0], '-0.200000000000000000000000000001');
  assert.ok(Buffer.byteLength(sceneCodec.serialize(SPACE_INITIAL_SCENE)) < 4096);
});

test('Space defaults and limits equal the plan and the initial orientation looks at the origin with Z up', () => {
  assert.equal(CAMERA_KIND, 'anchored-perspective-v1');
  assert.deepEqual(CAMERA_LIMITS, { anchorDigits: 400, anchorExponent: [-400, 400], exponent: [-1074, 1023], localMagnitude: 2 ** 20, fovDegrees: [10, 120] });
  assert.equal(TRACING_PROFILE, 'surface-v1');
  assert.deepEqual(TRACING_LIMITS, { maxIterations: [1, 512], maxSteps: [1, 1024], targetSamples: [1, 64] });
  assert.deepEqual(VIEW_MODES, ['shaded', 'normals', 'depth', 'steps', 'termination']);
  const scene = SPACE_INITIAL_SCENE;
  assert.deepEqual(scene.model, { id: 'mandelbulb', version: 1 }); assert.deepEqual(scene.parameters, { power: '8' });
  assert.deepEqual(scene.camera.anchor, ['0', '0', '0']); assert.deepEqual(scene.camera.scale, { mantissa: 1, exponent: 0 });
  assert.deepEqual(scene.camera.positionLocal, [1.92, -1.44, 0.7]); assert.deepEqual(scene.camera.focusLocal, [0, 0, 0]);
  assert.equal(scene.camera.verticalFovDegrees, 60);
  assert.deepEqual(scene.iteration, { maxIterations: 128, bailoutPolicy: 'model-default' });
  assert.deepEqual(scene.tracing, { profile: 'surface-v1', maxSteps: 512, stepMultiplier: 0.9 });
  assert.deepEqual(scene.appearance, { material: 'neutral', palette: 'ember', lighting: 'inspection', lightingQuality: 'full', fog: { enabled: false }, viewMode: 'shaded' });
  assert.deepEqual(scene.sampling, { seed: 1, sequence: 'atlas-aa-v1', targetSamples: 8 });
  assert.deepEqual(scene.slices, []);
  const [w, x, y, z] = scene.camera.orientationWxyz;
  const forward = [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))];
  const right = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const length = Math.hypot(...scene.camera.positionLocal);
  forward.forEach((value, i) => assert.ok(Math.abs(value + scene.camera.positionLocal[i] / length) < 1e-14));
  assert.ok(Math.abs(right[2]) < 1e-14, 'upright right vector is horizontal');
  const up = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
  assert.ok(up[2] > 0, 'upright up vector points toward positive world Z');
  assert.ok(Math.abs(up[2] - 0.96) < 1e-14);
  assert.ok(Math.abs(Math.hypot(w, x, y, z) - 1) < 1e-14);
  assert.ok(Object.isFrozen(SPACE_DEFAULTS.camera.scale));
});

test('scene imports never fill missing fields, discard unknown fields or guess versions', () => {
  for (const field of Object.keys(SPACE_INITIAL_SCENE)) {
    const input = copy(SPACE_INITIAL_SCENE); delete input[field];
    const code = ['application', 'schema'].includes(field) ? 'unsupported-format' : field === 'schemaVersion' ? 'unsupported-version' : 'missing-field';
    invalidAt(() => decodeSceneFile(JSON.stringify(input)), field === 'schemaVersion' ? 'schemaVersion' : '', code);
  }
  for (const field of ['parameters', 'camera', 'iteration', 'tracing', 'appearance', 'sampling']) {
    const input = copy(SPACE_INITIAL_SCENE); input[field].unknown = 1;
    invalidAt(() => sceneCodec.validate(input), field, 'unknown-field');
    for (const key of Object.keys(SPACE_INITIAL_SCENE[field])) {
      const missing = copy(SPACE_INITIAL_SCENE); delete missing[field][key];
      invalidAt(() => sceneCodec.validate(missing), field, 'missing-field');
    }
  }
  for (const [key, value, code] of [['conventions', 'old', 'invalid-value'], ['workspace', 'plane', 'invalid-value'], ['schemaVersion', 2, 'unsupported-version'], ['model', { id: 'sphere', version: 2 }, 'unsupported-model']]) invalidAt(() => sceneCodec.validate({ ...SPACE_INITIAL_SCENE, [key]: value }), key, code);
  invalidAt(() => sceneCodec.validate({ ...SPACE_INITIAL_SCENE, model: { id: 'sphere', version: '1' } }), 'model.version');
  invalidAt(() => sceneCodec.validate({ ...SPACE_INITIAL_SCENE, slices: [{}] }), 'slices');
  assert.throws(() => decodeSceneFile('{'), error => error.code === 'invalid-json');
});

test('native scene creation uses defaults only for omitted sections', () => {
  for (const field of ['parameters', 'camera', 'iteration', 'tracing', 'appearance', 'sampling']) {
    invalidAt(() => createSpaceScene({ model: 'mandelbulb', [field]: {} }), field, 'missing-field');
    invalidAt(() => createSpaceScene({ model: 'mandelbulb', [field]: null }), field);
  }
  assert.throws(() => createSpaceScene({ model: 'unknown' }), error => error.code === 'unsupported-model');
  invalidAt(() => createSpaceScene({ model: { id: 'sphere', version: 1 } }), 'model');
});

test('camera anchors have their own 400-digit budget and are preserved without Number conversion', () => {
  const anchor = ['0.' + '1'.repeat(400), '-2.0000e-320', '3e400'];
  const camera = { ...SPACE_DEFAULTS.camera, anchor };
  const scene = createSpaceScene({ model: 'sphere', camera });
  assert.deepEqual(decodeSceneFile(encodeSceneFile(scene)).camera.anchor, anchor);
  anchor[0] = '4'; assert.equal(scene.camera.anchor[0], '0.' + '1'.repeat(400));
  for (const bad of ['0.' + '1'.repeat(401), ' 1', '0x10', 'NaN', '1\n', 0]) invalidAt(() => createSpaceScene({ model: 'sphere', camera: { ...camera, anchor: [bad, '0', '0'] } }), 'camera.anchor[0]');
});

test('camera validation includes inclusive scale exponents, local norms, FOV and quaternion tolerance', () => {
  const make = patch => createSpaceScene({ model: 'sphere', camera: { ...SPACE_DEFAULTS.camera, ...patch } });
  for (const exponent of [-1074, 1023]) assert.equal(make({ scale: { mantissa: 1, exponent } }).camera.scale.exponent, exponent);
  for (const exponent of [-1075, 1024, 0.5, Infinity]) invalidAt(() => make({ scale: { mantissa: 1, exponent } }), 'camera.scale.exponent');
  for (const mantissa of [0, 0.999, 2, NaN]) invalidAt(() => make({ scale: { mantissa, exponent: 0 } }), 'camera.scale.mantissa');
  for (const field of ['positionLocal', 'focusLocal']) {
    assert.doesNotThrow(() => make({ [field]: [2 ** 20, 0, 0] }));
    for (const [v, path] of [[[Infinity, 0, 0], `${field}[0]`], [[2 ** 20, 2 ** 20, 0], field], [[0, 0], field], [new Array(3), `${field}[0]`]]) invalidAt(() => make({ [field]: v }), `camera.${path}`);
  }
  for (const verticalFovDegrees of [10, 120]) assert.doesNotThrow(() => make({ verticalFovDegrees }));
  for (const verticalFovDegrees of [9.99, 120.01, NaN, '60']) invalidAt(() => make({ verticalFovDegrees }), 'camera.verticalFovDegrees');
  assert.deepEqual(make({ orientationWxyz: [-1, 0, 0, 0] }).camera.orientationWxyz, [-1, 0, 0, 0], 'no orientation canonicalization');
  assert.doesNotThrow(() => make({ orientationWxyz: [1 + 0.5e-6, 0, 0, 0] }));
  invalidAt(() => make({ orientationWxyz: [1 + 2e-6, 0, 0, 0] }), 'camera.orientationWxyz');
  invalidAt(() => make({ kind: 'perspective-v1' }), 'camera.kind');
});

test('anchor admission bounds imported scenes and preserves ordinary requested strings', { timeout: 1000 }, () => {
  const sceneFor = anchor => ({ ...SPACE_INITIAL_SCENE, camera: { ...SPACE_INITIAL_SCENE.camera, anchor: [anchor, '0', '0'] } });
  for (const anchor of ['0', '-1.5', '2.5e-3', '1.2345678901234567890', '1e400', '1e-400', '00010e399', '0.' + '0'.repeat(399) + '1']) {
    const decoded = decodeSceneFile(JSON.stringify(sceneFor(anchor)));
    assert.equal(decoded.camera.anchor[0], anchor);
    assert.equal(decodeSceneFile(encodeSceneFile(decoded)).camera.anchor[0], anchor);
  }
  for (const anchor of ['1e401', '1e-401', '10e400', '00010e400', '0.' + '0'.repeat(400) + '1', '1e99999999999999999999', '0.' + '0'.repeat(100_000) + '1']) {
    invalidAt(() => decodeSceneFile(JSON.stringify(sceneFor(anchor))), 'camera.anchor[0]');
    invalidAt(() => createSpaceScene({ model: 'mandelbulb', camera: sceneFor(anchor).camera }), 'camera.anchor[0]');
    invalidAt(() => encodeSceneFile(sceneFor(anchor)), 'camera.anchor[0]');
  }
});

test('orientation signs and coincident focus are preserved for navigation to interpret', () => {
  const camera = SPACE_DEFAULTS.camera;
  const positive = createSpaceScene({ model: 'sphere', camera });
  const negative = createSpaceScene({ model: 'sphere', camera: { ...camera, orientationWxyz: camera.orientationWxyz.map(value => -value) } });
  assert.notEqual(sceneCodec.serialize(positive), sceneCodec.serialize(negative));
  assert.deepEqual(decodeSceneFile(encodeSceneFile(negative)).camera.orientationWxyz, camera.orientationWxyz.map(value => -value));
  let coincident;
  assert.doesNotThrow(() => { coincident = createSpaceScene({ model: 'sphere', camera: { ...camera, focusLocal: [...camera.positionLocal] } }); });
  assert.deepEqual(coincident.camera.focusLocal, coincident.camera.positionLocal);
});

test('fog requires the boolean false rather than a false-like value', () => {
  for (const enabled of [0, '', null]) invalidAt(() => createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, fog: { enabled } } }), 'appearance.fog');
});

test('Menger defaults to the numeric depth-one selector without rewriting explicit depth two', () => {
  assert.deepEqual(createSpaceScene({ model: 'menger' }).parameters, { depth: 1 });
  const scene = createSpaceScene({ model: 'menger', parameters: { depth: 2 } });
  assert.deepEqual(decodeSceneFile(encodeSceneFile(scene)).parameters, { depth: 2 });
});

test('quality, sampling and appearance validate their entire schemas without clamping', () => {
  for (const [section, field, range] of [['iteration', 'maxIterations', [1, 512]], ['tracing', 'maxSteps', [1, 1024]], ['sampling', 'targetSamples', [1, 64]], ['sampling', 'seed', [0, 0xffffffff]]]) {
    for (const value of range) assert.equal(createSpaceScene({ model: 'sphere', [section]: { ...SPACE_DEFAULTS[section], [field]: value } })[section][field], value);
    for (const value of [range[0] - 1, range[1] + 1, 1.5, '1', NaN]) invalidAt(() => createSpaceScene({ model: 'sphere', [section]: { ...SPACE_DEFAULTS[section], [field]: value } }), `${section}.${field}`);
  }
  for (const [section, field, value] of [['iteration', 'bailoutPolicy', 'custom'], ['tracing', 'profile', 'ladder-v1'], ['tracing', 'stepMultiplier', 1], ['sampling', 'sequence', 'random'], ['appearance', 'palette', 'missing'], ['appearance', 'material', 'gold'], ['appearance', 'lighting', 'studio']]) invalidAt(() => createSpaceScene({ model: 'sphere', [section]: { ...SPACE_DEFAULTS[section], [field]: value } }), `${section}.${field}`);
  for (const viewMode of VIEW_MODES) assert.equal(createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, viewMode } }).appearance.viewMode, viewMode);
  for (const palette of ['ember', 'aurora', 'ocean', 'rose', 'mono', 'acid']) assert.equal(createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, palette } }).appearance.palette, palette);
  invalidAt(() => createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, fog: { enabled: false, density: 1 } } }), 'appearance.fog', 'unknown-field');
});

test('configured adapters bind file admission and export to the same byte allowance', () => {
  const length = Buffer.byteLength(sceneCodec.serialize(SPACE_INITIAL_SCENE));
  const adapter = createSpaceSceneAdapter({ maxSceneBytes: length });
  assert.ok(Object.isFrozen(adapter));
  assert.deepEqual(Object.keys(adapter).sort(), ['sceneCodec', 'createSpaceScene', 'encodeSceneFile', 'decodeSceneFile'].sort());
  assert.equal(createSpaceSceneAdapter().sceneCodec.maxSceneBytes, DEFAULT_MAX_SCENE_BYTES);
  const { createSpaceScene: create, encodeSceneFile: encode, decodeSceneFile: decode } = adapter;
  const scene = create({ model: 'mandelbulb' }), text = encode(scene);
  assert.equal(text, sceneCodec.serialize(scene), 'pretty form falls back to canonical at the byte limit');
  assert.ok(adapter.sceneCodec.equal(decode(text), scene));
  assert.equal(adapter.sceneCodec.fingerprint(scene).sceneHash, sceneCodec.fingerprint(SPACE_INITIAL_SCENE).sceneHash);
  assert.throws(() => decode(text + ' '), error => error.code === 'too-large');
  const smaller = createSpaceSceneAdapter({ maxSceneBytes: length - 1 });
  for (const operation of [() => smaller.createSpaceScene({ model: 'mandelbulb' }), () => smaller.decodeSceneFile(text), () => smaller.encodeSceneFile(scene)]) assert.throws(operation, error => error.code === 'too-large');
  for (const limit of [0, -1, 1.5, Infinity, NaN, '4096', null, 2 ** 53]) assert.throws(() => createSpaceSceneAdapter({ maxSceneBytes: limit }), RangeError);
  assert.match(encodeSceneFile(scene), /^\{\n {2}"/, 'default allowance keeps pretty output');
});
test('the camera representation is validated: exact anchor strings, bounded scale, finite locals', () => {
  const camera = SPACE_INITIAL_SCENE.camera;
  for (const patch of [{ anchor: [0, 0, 0] }, { scale: { mantissa: 0.25, exponent: 2000 } }, { scale: { mantissa: 3, exponent: 0 } }, { positionLocal: [NaN, 0, 0] }, { positionLocal: [2 ** 21, 0, 0] }, { verticalFovDegrees: 5 }, { orientationWxyz: [1, 1, 0, 0] }])
    assert.throws(() => createSpaceScene({ model: 'sphere', camera: { ...camera, ...patch } }), e => e.code === 'invalid-value', JSON.stringify(patch));
});
test('fog validates only as disabled and the view mode is one of the five', () => {
  assert.throws(() => createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, fog: { enabled: true, density: 1 } } }), e => e.code === 'invalid-value');
  assert.throws(() => createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, viewMode: 'orbit' } }), e => e.code === 'invalid-value');
  assert.throws(() => createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, lightingQuality: 'soft' } }), e => e.code === 'invalid-value');
  assert.equal(createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, lightingQuality: 'direct' } }).appearance.lightingQuality, 'direct');
});
