import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, fnv1a64, createSceneCodec, SceneError, DEFAULT_MAX_SCENE_BYTES, requireObject } from '../../src/shared/scene.js';

const toyCodec = {
  workspace: 'plane', id: 'toy', version: 1,
  validateModel(input) {
    const camera = requireObject(input.camera, 'camera', ['x']);
    if (typeof camera.x !== 'string') throw new SceneError('invalid-value', 'must be a string', 'camera.x');
    return { conventions: 'toy', parameters: {}, camera: { x: camera.x }, slices: [], iteration: {}, tracing: null, appearance: {}, sampling: {} };
  },
};
const codec = createSceneCodec({ modelCodecs: [toyCodec] });
const toy = (overrides = {}) => ({
  application: 'ATLAS', schema: 'atlas.scene', schemaVersion: 1, applicationVersion: 'test', workspace: 'plane',
  model: { id: 'toy', version: 1 }, conventions: 'toy', parameters: {}, camera: { x: '1' }, slices: [], iteration: {},
  tracing: null, appearance: {}, sampling: {}, provenance: { createdBy: 'atlas' }, ...overrides,
});

test('canonical JSON sorts keys, writes −0 as 0 and rejects non-finite numbers', () => {
  assert.equal(canonicalJson({ b: [1, { d: 2, c: -0 }], a: 'x' }), '{"a":"x","b":[1,{"c":0,"d":2}]}');
  assert.throws(() => canonicalJson({ a: NaN }), SceneError);
  assert.throws(() => canonicalJson({ a: Infinity }), SceneError);
  assert.throws(() => canonicalJson({ a: undefined }), SceneError);
  assert.throws(() => canonicalJson(new Date(0)), SceneError);
});

test('fnv1a64 matches independent known answers over UTF-8 bytes', () => {
  assert.equal(fnv1a64(''), 'fnv1a64:cbf29ce484222325');
  assert.equal(fnv1a64('a'), 'fnv1a64:af63dc4c8601ec8c');
  assert.equal(fnv1a64('foobar'), 'fnv1a64:85944171f73967e8');
  assert.equal(fnv1a64('é'), 'fnv1a64:0ac21707b7181e01');
  assert.equal(fnv1a64('∞ ATLAS'), 'fnv1a64:a6158a118c31f120');
});

test('validation returns a frozen defensive copy whose fingerprint ignores key order', () => {
  const input = toy();
  const scene = codec.validate(input);
  input.camera.x = 'changed';
  assert.equal(scene.camera.x, '1');
  assert.ok(Object.isFrozen(scene) && Object.isFrozen(scene.camera));
  const reordered = Object.fromEntries(Object.entries(toy()).reverse());
  assert.equal(codec.fingerprint(codec.validate(reordered)).sceneHash, codec.fingerprint(scene).sceneHash);
  assert.match(codec.fingerprint(scene).sceneHash, /^fnv1a64:[0-9a-f]{16}$/);
  assert.ok(codec.equal(scene, codec.parse(codec.serialize(scene))));
});

test('unknown, missing and unsupported envelope content is reported, never guessed', () => {
  const code = input => { try { codec.validate(input); return 'valid'; } catch (error) { return error.code; } };
  assert.equal(code(toy({ extra: 1 })), 'unknown-field');
  const missing = toy(); delete missing.sampling;
  assert.equal(code(missing), 'missing-field');
  assert.equal(code(toy({ schemaVersion: 2 })), 'unsupported-version');
  assert.equal(code(toy({ model: { id: 'toy', version: 2 } })), 'unsupported-model');
  assert.equal(code(toy({ schema: 'other' })), 'unsupported-format');
  assert.equal(code({ application: 'ATLAS', version: 1, view: {}, settings: {} }), 'unsupported-format');
  assert.equal(code(toy({ workspace: 'space' })), 'invalid-value');
  assert.equal(code(toy({ provenance: { createdBy: 'atlas', note: 'x' } })), 'unknown-field');
  assert.equal(code(toy({ provenance: { createdBy: 'atlas', bridgedFrom: toy({ provenance: { createdBy: 'atlas', bridgedFrom: toy() } }) } })), 'invalid-value');
  assert.equal(code(toy({ provenance: { createdBy: 'atlas', bridgedFrom: toy() } })), 'valid');
});

test('scene text is bounded before parsing and must be JSON', () => {
  assert.throws(() => codec.parse('x'.repeat(DEFAULT_MAX_SCENE_BYTES + 1)), error => error.code === 'too-large');
  assert.throws(() => codec.parse('é'.repeat(DEFAULT_MAX_SCENE_BYTES / 2 + 1)), error => error.code === 'too-large', 'the limit counts UTF-8 bytes');
  assert.throws(() => codec.parse('{'), error => error.code === 'invalid-json');
});

test('model identity is validated by type and matched exactly, never coerced', () => {
  const code = input => { try { codec.validate(input); return 'valid'; } catch (error) { return `${error.code}@${error.path}`; } };
  assert.equal(code(toy({ model: { id: 'toy', version: '1' } })), 'invalid-value@model.version');
  assert.equal(code(toy({ model: { id: 'toy', version: [1] } })), 'invalid-value@model.version');
  assert.equal(code(toy({ model: { id: 'toy', version: 1.5 } })), 'invalid-value@model.version');
  assert.equal(code(toy({ model: { id: ['toy'], version: 1 } })), 'invalid-value@model.id');
  assert.equal(code(toy({ model: { id: 'toy@1', version: 1 } })), 'unsupported-model@model');
  assert.equal(code(toy({ model: { id: 'toy', version: 1 } })), 'valid');
});

test('admission rejects a scene whose canonical serialization exceeds the byte budget', () => {
  for (const limit of [1000, DEFAULT_MAX_SCENE_BYTES]) {
    const bounded = limit === DEFAULT_MAX_SCENE_BYTES ? codec : createSceneCodec({ modelCodecs: [toyCodec], maxSceneBytes: limit });
    const size = x => bounded.serialize(bounded.validate(toy({ camera: { x } }))).length;
    const pad = limit - size('');
    assert.equal(size('x'.repeat(pad)), limit, `exactly ${limit}`);
    assert.throws(() => bounded.validate(toy({ camera: { x: 'x'.repeat(pad + 1) } })), error => error.code === 'too-large', `${limit} + 1`);
    assert.throws(() => bounded.validate(toy({ camera: { x: 'é'.repeat(pad / 2 + 1) } })), error => error.code === 'too-large', 'the budget counts UTF-8 bytes');
  }
});

test('the byte limit is a codec option: a safe positive integer, defaulting to 2,000,000', () => {
  assert.equal(DEFAULT_MAX_SCENE_BYTES, 2_000_000);
  assert.equal(codec.maxSceneBytes, DEFAULT_MAX_SCENE_BYTES, 'omitting the option uses the default');
  assert.equal(createSceneCodec({ modelCodecs: [toyCodec], maxSceneBytes: undefined }).maxSceneBytes, DEFAULT_MAX_SCENE_BYTES);
  const small = createSceneCodec({ modelCodecs: [toyCodec], maxSceneBytes: 1000 });
  assert.equal(small.maxSceneBytes, 1000);
  assert.ok(Object.isFrozen(small));
  assert.throws(() => { small.maxSceneBytes = 5; }, TypeError);
  for (const value of [0, -1, 1.5, NaN, Infinity, -Infinity, 2 ** 53, '1000', null, 1000n, {}]) {
    assert.throws(() => createSceneCodec({ modelCodecs: [toyCodec], maxSceneBytes: value }), RangeError, String(value));
  }
});

test('a configured limit bounds scene text exactly, in UTF-8 bytes, and stays out of the fingerprint', () => {
  const limit = 1000;
  const small = createSceneCodec({ modelCodecs: [toyCodec], maxSceneBytes: limit });
  const base = small.serialize(small.validate(toy({ camera: { x: '' } })));
  const textOf = bytes => base.replace('"x":""', `"x":"${'x'.repeat(bytes - base.length)}"`);
  assert.equal(small.parse(textOf(limit)).camera.x.length, limit - base.length, 'exactly the limit is accepted');
  assert.throws(() => small.parse(`${textOf(limit)} `), error => error.code === 'too-large', 'one byte more is rejected');
  assert.throws(() => small.parse('é'.repeat(limit / 2 + 1)), error => error.code === 'too-large', 'the limit counts UTF-8 bytes');
  const scene = small.validate(toy());
  assert.equal(small.fingerprint(scene).sceneHash, codec.fingerprint(codec.validate(toy())).sceneHash, 'the limit never enters the fingerprint');
});

test('a bridged scene shares one allowance: the inner scene fits but the whole scene does not', () => {
  const limit = 1000;
  const small = createSceneCodec({ modelCodecs: [toyCodec], maxSceneBytes: limit });
  const base = small.serialize(small.validate(toy({ camera: { x: '' } }))).length;
  const inner = toy({ camera: { x: 'x'.repeat(limit - base) } });
  assert.equal(small.serialize(small.validate(inner)).length, limit, 'the inner scene alone fits exactly');
  const outer = toy({ provenance: { createdBy: 'atlas', bridgedFrom: inner } });
  assert.throws(() => small.validate(outer), error => error.code === 'too-large');
  assert.ok(createSceneCodec({ modelCodecs: [toyCodec], maxSceneBytes: 2 * limit }).validate(outer), 'a larger limit admits it');
  const over = toy({ provenance: { createdBy: 'atlas', bridgedFrom: toy({ camera: { x: 'x'.repeat(limit - base + 1) } }) } });
  assert.throws(() => small.validate(over), error => error.code === 'too-large', 'an inner scene over the limit is rejected');
});
