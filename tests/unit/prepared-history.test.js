import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreparedSceneHistory } from '../../src/space/preparation/scene-history.js';
import { createPreparedScene } from '../../src/space/preparation/scene-adapter.js';
import { preparedFixture } from '../support/prepared-fixture.mjs';
const rig = () => { const f = preparedFixture(), scene = createPreparedScene({ world: f.world, pose: f.poseModel.create(), lightDirection: [1, 0, 0] }); return { f, scene, owner: createPreparedSceneHistory() }; };
test('before metadata only the latest pending file is retained then applied once over the configured default', () => {
  const { f, scene, owner } = rig(), b = { ...scene, camera: { ...scene.camera, positionLocalM: [.1, 0, 0] } }, c = { ...b, camera: { ...b.camera, positionLocalM: [.2, 0, 0] } };
  owner.restore(b); owner.restore(c); assert.equal(owner.snapshot().history, null); assert.deepEqual(owner.scene().camera.positionLocalM, [.2, 0, 0]);
  owner.seed(scene); owner.seed(scene); assert.equal(owner.snapshot().history.undoDepth, 1);
  owner.step('undo'); assert.deepEqual(owner.scene(), scene); owner.step('redo'); assert.deepEqual(owner.scene().camera.positionLocalM, [.2, 0, 0]);
  assert.equal(owner.acceptPose(f.poseModel.create(), 0), false);
});
test('settled accepted camera changes use Back Forward and branch truncation without content undo', () => {
  const { f, scene, owner } = rig(); owner.seed(scene);
  assert.equal(owner.acceptPose(f.poseModel.create(), owner.request), false);
  owner.acceptPose(f.poseModel.create({ positionLocalM: [.1, 0, 0] }), owner.request);
  owner.acceptPose(f.poseModel.create({ positionLocalM: [.2, 0, 0] }), owner.request);
  assert.equal(owner.snapshot().history.undoDepth, 0); assert.equal(owner.snapshot().history.camera.length, 3);
  owner.step('back'); assert.deepEqual(owner.scene().camera.positionLocalM, [.1, 0, 0]);
  owner.step('forward'); assert.deepEqual(owner.scene().camera.positionLocalM, [.2, 0, 0]); owner.step('back');
  owner.acceptPose(f.poseModel.create({ positionLocalM: [.3, 0, 0] }), owner.request);
  assert.equal(owner.snapshot().history.canForward, false);
});
test('whole scene restore has one exact undo redo while camera navigation stays separate and invalid input changes nothing', () => {
  const { f, scene, owner } = rig(); owner.seed(scene);
  const next = { ...scene, camera: { ...scene.camera, positionLocalM: [.1, 0, 0], verticalFovDegrees: 45 } };
  owner.restore(next); assert.equal(owner.snapshot().history.undoDepth, 1);
  owner.acceptPose(f.poseModel.create({ positionLocalM: [.2, 0, 0], verticalFovDegrees: 45 }), owner.request);
  owner.step('undo'); assert.deepEqual(owner.scene(), scene); owner.step('redo'); assert.deepEqual(owner.scene().camera, next.camera);
  const before = owner.snapshot(); assert.throws(() => owner.restore({ bad: true })); assert.deepEqual(owner.snapshot(), before);
});
test('prepared committed histories stay bounded at100 poses and100 whole scene edits', () => {
  const { f, scene, owner } = rig(); owner.seed(scene);
  for (let i = 1; i < 110; i++) owner.acceptPose(f.poseModel.create({ positionLocalM: [i / 1000, 0, 0] }), owner.request);
  assert.equal(owner.snapshot().history.camera.length, 100);
  for (let i = 0; i < 110; i++) owner.restore(scene);
  assert.equal(owner.snapshot().history.undoDepth, 100);
});
