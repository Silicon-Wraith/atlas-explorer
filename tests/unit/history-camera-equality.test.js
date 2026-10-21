import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../src/shared/history.js';
import { canonicalJson } from '../../src/shared/scene.js';
import { createPlaneScene, sceneCodec as planeCodec } from '../../src/plane/scene-adapter.js';
import { createSpaceScene, sceneCodec as spaceCodec } from '../../src/space/scene-adapter.js';
import { equalCameras } from '../../src/space/camera.js';

const initialSpace = () => createSpaceScene({ model: 'sphere' });
const spaceHistory = initialScene => createHistory({ initialScene, codec: spaceCodec, cameraEqual: equalCameras });
const negated = camera => ({ ...camera, orientationWxyz: camera.orientationWxyz.map(value => -value) });
const moved = camera => ({ ...camera, positionLocal: [camera.positionLocal[0] + 1, ...camera.positionLocal.slice(1)] });
const setCamera = camera => ({ type: 'setCamera', camera });
const restore = scene => ({ type: 'restoreScene', scene });

test('Space whole-scene restore suppresses a sign-negated camera but records a different pose', () => {
  const initial = initialSpace();
  const history = spaceHistory(initial);
  const equivalent = { ...initial, camera: negated(initial.camera) };
  assert.equal(equalCameras(initial.camera, equivalent.camera), true);
  assert.notEqual(canonicalJson(initial.camera), canonicalJson(equivalent.camera));

  const restored = history.apply([restore(equivalent)]);
  assert.deepEqual(restored.snapshot.camera, { index: 0, length: 1 });
  assert.equal(restored.snapshot.undoDepth, 1, 'a complete restoration remains an undoable edit');
  assert.deepEqual(restored.after.camera, equivalent.camera, 'stored scene values are not rewritten');
  assert.notEqual(spaceCodec.serialize(restored.after), spaceCodec.serialize(initial), 'scene identity stays canonical');

  const different = { ...equivalent, camera: moved(equivalent.camera) };
  assert.equal(equalCameras(equivalent.camera, different.camera), false);
  history.apply([restore(different)]);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 2 });
  assert.equal(history.snapshot().undoDepth, 2);
  assert.deepEqual(history.back().after.camera, initial.camera);
  assert.deepEqual(history.forward().after.camera, different.camera);
});

test('Space gesture commit suppresses a sign-negated final pose after intermediate movement', () => {
  const initial = initialSpace();
  const history = spaceHistory(initial);
  const id = history.begin({ kind: 'orbit-drag' });
  history.update(id, setCamera(moved(initial.camera)));
  history.update(id, setCamera(negated(initial.camera)));
  assert.deepEqual(history.snapshot().camera, { index: 0, length: 1 }, 'previews never record poses');
  const committed = history.commit(id);
  assert.deepEqual(committed.snapshot.camera, { index: 0, length: 1 });
  assert.deepEqual(committed.after.camera, negated(initial.camera));
  assert.equal(committed.snapshot.undoDepth, 0);
  assert.equal(committed.render, false);

  const next = history.begin({ kind: 'orbit-drag' });
  history.update(next, setCamera(moved(initial.camera)));
  history.commit(next);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 2 });
  assert.equal(history.snapshot().undoDepth, 0);
});

test('Space whole-scene undo compares the restored camera with the current pose semantically', () => {
  const initial = initialSpace();
  const history = spaceHistory(initial);
  const discovery = {
    ...initial, camera: moved(initial.camera),
    appearance: { ...initial.appearance, palette: 'ocean' },
  };
  history.apply([restore(discovery)]);
  history.apply([setCamera(negated(initial.camera))]);
  const before = history.snapshot();
  assert.deepEqual(before.camera, { index: 2, length: 3 });

  const undone = history.undo();
  assert.deepEqual(undone.after, initial);
  assert.deepEqual(undone.snapshot.camera, before.camera, 'undo must not append the sign-equivalent camera');
  assert.equal(undone.snapshot.undoDepth, 0);
  assert.equal(undone.snapshot.redoDepth, 1);
  assert.ok(undone.revision > before.revision);
  assert.equal(undone.render, true);
});

test('Space whole-scene redo compares the restored camera with the current pose semantically', () => {
  const initial = initialSpace();
  const history = spaceHistory(initial);
  const discovery = {
    ...initial, camera: moved(initial.camera),
    appearance: { ...initial.appearance, palette: 'ocean' },
  };
  history.apply([restore(discovery)]);
  history.undo();
  assert.deepEqual(history.snapshot().camera, { index: 2, length: 3 }, 'undo records a genuinely different pose');
  history.apply([setCamera(negated(discovery.camera))]);
  const before = history.snapshot();
  assert.deepEqual(before.camera, { index: 3, length: 4 });
  assert.equal(before.redoDepth, 1, 'camera movement preserves content redo');

  const redone = history.redo();
  assert.deepEqual(redone.after, discovery);
  assert.deepEqual(redone.snapshot.camera, before.camera, 'redo must not append the sign-equivalent camera');
  assert.equal(redone.snapshot.undoDepth, 1);
  assert.equal(redone.snapshot.redoDepth, 0);
  assert.ok(redone.revision > before.revision);
  assert.equal(redone.render, true);
});

test('Space sign-negated restore and its undo and redo preserve the forward camera branch', () => {
  const initial = initialSpace();
  const history = spaceHistory(initial);
  const middle = moved(initial.camera), last = moved(middle);
  history.apply([setCamera(middle)]);
  history.apply([setCamera(last)]);
  history.back();
  const restored = { ...initial, camera: negated(middle), appearance: { ...initial.appearance, palette: 'ocean' } };
  history.apply([restore(restored)]);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 3 });
  assert.equal(history.snapshot().canForward, true);
  history.undo();
  history.redo();
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 3 });
  assert.deepEqual(history.forward().after.camera, last);
  assert.deepEqual(history.back().after.camera, middle);
  assert.equal(history.snapshot().scene.appearance.palette, 'ocean', 'traversal changes only the camera');

  history.apply([restore(initial)]);
  assert.deepEqual(history.snapshot().camera, { index: 2, length: 3 });
  assert.equal(history.snapshot().canForward, false, 'a different pose discards the forward branch');
  assert.equal(history.forward(), null);
  assert.deepEqual(history.back().after.camera, middle);
  assert.deepEqual(history.forward().after.camera, initial.camera);
});

test('Space history reuses exact represented camera equality across scale changes and tiny moves', () => {
  const initial = initialSpace();
  const history = spaceHistory(initial);
  const equivalent = {
    ...initial.camera, scale: { mantissa: 1, exponent: 1 },
    positionLocal: initial.camera.positionLocal.map(value => value / 2),
    focusLocal: initial.camera.focusLocal.map(value => value / 2),
  };
  assert.equal(equalCameras(initial.camera, equivalent), true);
  assert.notEqual(canonicalJson(initial.camera), canonicalJson(equivalent));
  history.apply([setCamera(equivalent)]);
  assert.deepEqual(history.snapshot().camera, { index: 0, length: 1 });

  const different = { ...equivalent, anchor: ['1e-100', '0', '0'] };
  assert.equal(equalCameras(equivalent, different), false, 'even sub-binary64 world displacement is distinct');
  history.apply([setCamera(different)]);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 2 });
});

test('the default comparator retains canonical JSON equality for Plane decimal spellings', () => {
  const initial = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 } });
  const history = createHistory({ initialScene: initial, codec: planeCodec });
  const equivalent = createPlaneScene({ view: { re: '-0.50', im: '0.0', zoom: 0 } });
  assert.equal(Number(initial.camera.re), Number(equivalent.camera.re));
  assert.equal(Number(initial.camera.im), Number(equivalent.camera.im));
  assert.notEqual(canonicalJson(initial.camera), canonicalJson(equivalent.camera));
  history.apply([restore(equivalent)]);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 2 }, 'decimal spellings remain distinct');
  history.apply([setCamera({ zoom: 0, im: '0.0', re: '-0.50' })]);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 2 }, 'object key order remains irrelevant');
  assert.deepEqual(history.back().after.camera, initial.camera);
  assert.deepEqual(history.forward().after.camera, equivalent.camera);
  assert.deepEqual(history.undo().snapshot.camera, { index: 2, length: 3 });
  assert.deepEqual(history.redo().snapshot.camera, { index: 3, length: 4 });
  assert.deepEqual(history.snapshot().scene, equivalent);
});

test('Space history without a comparator retains the canonical JSON default', () => {
  const initial = initialSpace();
  const history = createHistory({ initialScene: initial, codec: spaceCodec });
  const equivalent = negated(initial.camera);
  assert.equal(equalCameras(initial.camera, equivalent), true);
  history.apply([restore({ ...initial, camera: equivalent })]);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 2 });
  assert.deepEqual(history.undo().snapshot.camera, { index: 2, length: 3 });
  assert.deepEqual(history.redo().snapshot.camera, { index: 3, length: 4 });
});
