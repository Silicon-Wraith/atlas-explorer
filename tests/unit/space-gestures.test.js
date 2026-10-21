import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../src/shared/history.js';
import { createSpaceScene, sceneCodec } from '../../src/space/scene-adapter.js';
import { dolly, equalCameras, flightStep, orbit, overview, resetOrientation, setOrientation } from '../../src/space/camera.js';
import { getModel } from '../../src/space/models/registry.js';
import { createSpaceGestures, SPACE_KINDS } from '../../src/space/gestures.js';
import { createFlight, FLIGHT_SPEED_LIMITS } from '../../src/space/flight.js';
import { createFakeClock } from '../support/fake-clock.mjs';

function setup() {
  const history = createHistory({ initialScene: createSpaceScene({ model: 'sphere' }), codec: sceneCodec });
  const clock = createFakeClock(), transitions = [], stops = [];
  let flight;
  const gestures = createSpaceGestures({ history, setTimer: clock.schedule, clearTimer: clock.clear,
    onTransition: value => transitions.push(value), stopNavigation(reason) { stops.push(reason); flight?.stop(reason); } });
  const getCamera = () => history.snapshot().scene.camera;
  flight = createFlight({ getCamera, setCamera: camera => gestures.flightUpdate(camera), clock: clock.now,
    onStart: () => gestures.flightStart(), onStop: () => gestures.flightEnd() });
  return { history, clock, transitions, stops, gestures, flight, getCamera };
}

test('Space declares its own gesture kinds', () => {
  assert.deepEqual(SPACE_KINDS, ['orbit-drag', 'pan-drag', 'wheel-dolly', 'key-nudge', 'flight', 'focus']);
});

test('a wheel burst groups within 200 ms', () => {
  const h = setup();
  h.gestures.grouped('wheel-dolly', dolly(h.getCamera(), 0.8));
  h.clock.advance(199);
  h.gestures.grouped('wheel-dolly', dolly(h.getCamera(), 0.8));
  assert.equal(h.history.snapshot().gesture, 'wheel-dolly');
  assert.equal(h.history.snapshot().camera.length, 1);
  h.clock.advance(199);
  assert.equal(h.history.snapshot().camera.length, 1);
  h.clock.advance(1);
  assert.equal(h.history.snapshot().camera.length, 2);
  assert.equal(h.history.snapshot().gesture, null);
  assert.equal(h.transitions.filter(t => t.cause === 'commit').length, 1);
  assert.equal(h.transitions.at(-1).render, false);
});

test('back, forward, undo, redo and scene replacement stop flight and settle an open gesture', () => {
  for (const action of ['back', 'forward', 'undo', 'redo', 'scene-replacement']) {
    const h = setup();
    h.gestures.apply([{ type: 'setAppearance', patch: { palette: 'ocean' } }], 'appearance');
    h.gestures.undo();
    h.flight.start(); h.flight.keyDown('KeyW'); h.flight.tick(100);
    assert.equal(h.history.snapshot().gesture, 'flight');
    const before = h.getCamera();
    if (action === 'scene-replacement') h.gestures.apply([{ type: 'restoreScene', scene: createSpaceScene({ model: 'box' }) }], action);
    else h.gestures[action]();
    assert.equal(h.flight.active, false, action);
    assert.equal(h.history.snapshot().gesture, null, action);
    assert.ok(h.stops.includes(action === 'scene-replacement' ? action : 'history'), action);
    if (action === 'undo' || action === 'redo') assert.ok(equalCameras(h.getCamera(), before), action);
    const after = h.getCamera(); h.flight.tick(200);
    assert.deepEqual(h.getCamera(), after, action);
  }
});

test('a flight tick after the gesture closed does not move the camera', () => {
  const h = setup();
  h.flight.start(); h.flight.keyDown('KeyW'); h.flight.tick(100);
  assert.equal(h.history.snapshot().gesture, 'flight');
  h.gestures.settle('deactivate');
  const camera = h.getCamera(), length = h.history.snapshot().camera.length;
  h.flight.tick(200);
  assert.equal(h.gestures.flightUpdate(orbit(camera, 0.1, 0)), false);
  assert.deepEqual(h.getCamera(), camera);
  assert.equal(h.history.snapshot().camera.length, length);
  assert.equal(h.flight.active, false);
});

test('equalCameras suppresses a new equal dolly object at the representation floor', () => {
  const h = setup();
  const camera = { ...h.getCamera(), positionLocal: [Number.MIN_VALUE, 0, 0], focusLocal: [0, 0, 0] };
  h.gestures.apply([{ type: 'setCamera', camera }], 'camera');
  const stalled = dolly(h.getCamera(), 0.9);
  assert.notEqual(stalled, h.getCamera());
  assert.ok(equalCameras(stalled, h.getCamera()));
  const revision = h.history.snapshot().revision;
  assert.equal(h.gestures.grouped('wheel-dolly', stalled), false);
  assert.equal(h.history.snapshot().gesture, null);
  assert.equal(h.history.snapshot().revision, revision);
});

test('key repeats group, switching kinds clears the prior timer, and cancellation restores the camera', () => {
  const h = setup(), before = h.getCamera();
  h.gestures.grouped('key-nudge', orbit(before, 0.1, 0));
  h.clock.advance(100);
  h.gestures.grouped('key-nudge', orbit(h.getCamera(), 0.1, 0));
  h.gestures.drag('pan-drag', dolly(h.getCamera(), 0.8));
  h.clock.advance(1000);
  assert.equal(h.history.snapshot().gesture, 'pan-drag');
  assert.equal(h.history.snapshot().camera.length, 2);
  h.gestures.dragCancel('pan-drag');
  assert.ok(equalCameras(h.getCamera(), orbit(orbit(before, 0.1, 0), 0.1, 0)));
  assert.equal(h.history.snapshot().camera.length, 2);
});

test('a rejected flight start cannot steal a pointer drag', () => {
  const h = setup();
  h.gestures.drag('orbit-drag', orbit(h.getCamera(), 0.1, 0));
  assert.equal(h.flight.start(), false);
  assert.equal(h.flight.active, false);
  assert.equal(h.history.snapshot().gesture, 'orbit-drag');
});

test('flight clamps elapsed time, uses explicit local speed, and clears input on every stop', () => {
  for (const reason of ['escape', 'blur', 'hidden', 'stop-key', 'deactivate', 'history']) {
    const h = setup(), before = h.getCamera();
    h.flight.setSpeed(2); h.flight.start(); h.flight.keyDown('KeyW');
    h.flight.tick(1000);
    assert.ok(equalCameras(h.getCamera(), flightStep(before, { forward: 1 }, 2, 0.1)), reason);
    assert.equal(h.flight.speed, 2);
    h.flight.stop(reason);
    const stopped = h.getCamera();
    h.flight.keyDown('KeyW'); h.flight.pointerLook(10, 10); h.flight.tick(1100);
    assert.deepEqual(h.getCamera(), stopped, reason);
    h.clock.advance(1100); h.flight.start(); h.flight.tick(1200);
    assert.deepEqual(h.getCamera(), stopped, 'a restart has no held keys or residual look');
    h.flight.stop(reason);
    assert.equal(h.history.snapshot().camera.length, 2);
  }
});

test('flight is idle without demands, caps diagonal movement, and validates speed', () => {
  const h = setup(), before = h.getCamera();
  h.flight.start(); h.flight.tick(50);
  assert.deepEqual(h.getCamera(), before);
  h.flight.keyDown('KeyW'); h.flight.keyDown('KeyD'); h.flight.tick(150);
  const travel = Math.hypot(...h.getCamera().positionLocal.map((x, i) => x - before.positionLocal[i]));
  assert.ok(Math.abs(travel - h.flight.speed * 0.1) < 1e-12);
  for (const speed of [NaN, Infinity, -1, 0, FLIGHT_SPEED_LIMITS.max * 2]) assert.throws(() => h.flight.setSpeed(speed), RangeError);
});

test('pointer look is consumed by a single flight tick and speed does not scale the turn', () => {
  const a = setup(), b = setup();
  a.flight.setSpeed(1); b.flight.setSpeed(10);
  for (const h of [a, b]) { h.flight.start(); h.flight.pointerLook(30, -20); h.flight.tick(50); }
  assert.ok(equalCameras(a.getCamera(), b.getCamera()));
  assert.notDeepEqual(a.getCamera().orientationWxyz, createSpaceScene({ model: 'sphere' }).camera.orientationWxyz);
  const turned = a.getCamera(); a.flight.tick(100);
  assert.deepEqual(a.getCamera(), turned);
});

test('late grouped timers cannot commit a newer gesture', () => {
  const h = setup(), callbacks = [];
  const g = createSpaceGestures({ history: h.history, setTimer: fn => { callbacks.push(fn); return callbacks.length; }, clearTimer() {} });
  g.grouped('wheel-dolly', dolly(h.getCamera(), 0.8));
  g.settle();
  g.grouped('wheel-dolly', dolly(h.getCamera(), 0.8));
  assert.equal(callbacks.length, 2);
  callbacks[0]();
  assert.equal(h.history.snapshot().gesture, 'wheel-dolly');
  callbacks[1]();
  assert.equal(h.history.snapshot().gesture, null);
});

test('a replaced same-kind flight gesture rejects the old flight tick', () => {
  const h = setup(); h.flight.start(); h.flight.keyDown('KeyW'); h.flight.tick(100);
  const replacement = h.history.begin({ kind: 'flight' }), before = h.getCamera();
  assert.doesNotThrow(() => h.flight.tick(200));
  assert.equal(h.flight.active, false);
  assert.deepEqual(h.getCamera(), before);
  assert.equal(h.history.snapshot().gesture, 'flight', 'old owner cannot close the replacement');
  h.history.cancel(replacement);
});

test('overview and constrained orientation jumps stop flight and use camera history only', () => {
  const h = setup();
  h.gestures.apply([{ type: 'setAppearance', patch: { palette: 'ocean' } }], 'appearance');
  h.flight.start(); h.flight.keyDown('KeyW'); h.flight.tick(100);
  const initialLength = h.history.snapshot().camera.length;
  const overviewCamera = overview(getModel('sphere', 1), {});
  h.gestures.apply([{ type: 'setCamera', camera: overviewCamera }], 'overview');
  assert.equal(h.flight.active, false);
  assert.equal(h.history.snapshot().camera.length, initialLength + 2, 'flight commit and overview are distinct poses');
  const oriented = setOrientation(h.getCamera(), [1, 0, 0, 0], { lockAxis: 'z' });
  h.gestures.apply([{ type: 'setCamera', camera: oriented }], 'orientation');
  h.gestures.apply([{ type: 'setCamera', camera: resetOrientation(h.getCamera()) }], 'orientation-reset');
  const after = h.getCamera(); h.gestures.undo();
  assert.deepEqual(h.getCamera(), after);
  assert.equal(h.history.snapshot().scene.appearance.palette, 'ember');
});

test('drags and grouped input cannot steal an open flight or pointer drag', () => {
  const h = setup(); h.flight.start(); h.flight.keyDown('KeyW'); h.flight.tick(100);
  const preview = h.getCamera(), count = h.transitions.length;
  for (const kind of ['orbit-drag', 'pan-drag']) assert.equal(h.gestures.drag(kind, orbit(preview, 0.1, 0)), false);
  for (const kind of ['wheel-dolly', 'key-nudge']) assert.equal(h.gestures.grouped(kind, dolly(preview, 0.8)), false);
  assert.equal(h.history.snapshot().gesture, 'flight');
  assert.equal(h.gestures.openKind, 'flight');
  assert.equal(h.transitions.length, count);
  assert.deepEqual(h.getCamera(), preview);
  h.flight.tick(200); assert.equal(h.flight.active, true);
  h.flight.stop('escape');
  for (const owner of ['orbit-drag', 'pan-drag']) {
    h.gestures.drag(owner, orbit(h.getCamera(), 0.1, 0));
    const camera = h.getCamera();
    for (const kind of ['wheel-dolly', 'key-nudge']) assert.equal(h.gestures.grouped(kind, dolly(camera, 0.8)), false);
    h.clock.advance(1000);
    assert.equal(h.history.snapshot().gesture, owner);
    assert.deepEqual(h.getCamera(), camera);
    h.gestures.dragCommit(owner);
  }
});

test('a sign-negated setCamera is a semantic no-op with no history or transition', () => {
  const h = setup(), before = h.getCamera(), snapshot = h.history.snapshot();
  const camera = { ...before, orientationWxyz: before.orientationWxyz.map(x => -x) };
  assert.notDeepEqual(camera, before); assert.ok(equalCameras(camera, before));
  assert.equal(h.gestures.apply([{ type: 'setCamera', camera }], 'camera'), false);
  assert.deepEqual(h.history.snapshot(), snapshot);
  assert.equal(h.transitions.length, 0);
});

test('each back, forward, undo and redo transition reaches the workspace exactly once', () => {
  const h = setup();
  h.gestures.apply([{ type: 'setAppearance', patch: { palette: 'ocean' } }], 'appearance');
  h.gestures.focusApply(orbit(h.getCamera(), 0.1, 0));
  for (const action of ['back', 'forward', 'undo', 'redo']) {
    const count = h.transitions.length;
    const transition = h.gestures[action]();
    assert.equal(h.transitions.length, count + 1, action);
    assert.equal(h.transitions.at(-1), transition);
    assert.equal(transition.cause, action);
  }
});

test('openKind reports no ownership after external history begins a different gesture', () => {
  const h = setup(); h.gestures.drag('orbit-drag', orbit(h.getCamera(), 0.1, 0));
  assert.equal(h.gestures.openKind, 'orbit-drag');
  const id = h.history.begin({ kind: 'external-edit' });
  assert.equal(h.gestures.openKind, null);
  h.history.cancel(id);
});

test('flight rejects early and repeated timestamps without losing look or moving its time baseline backward', () => {
  const h = setup(); h.clock.advance(100);
  const before = h.getCamera(); h.flight.start(); h.flight.keyDown('KeyW'); h.flight.pointerLook(5, 0);
  for (const now of [100, 95, 95]) {
    assert.doesNotThrow(() => h.flight.tick(now));
    assert.deepEqual(h.getCamera(), before);
  }
  assert.equal(h.flight.tick(105), true);
  const travel = Math.hypot(...h.getCamera().positionLocal.map((x, i) => x - before.positionLocal[i]));
  assert.ok(Math.abs(travel - 0.005 * h.flight.speed) < 1e-12, 'only time after the start baseline contributes');
  assert.notDeepEqual(h.getCamera().orientationWxyz, before.orientationWxyz, 'pending look survived zero elapsed time');
});

test('the same pointer look turns by the same angle at different frame intervals', () => {
  const a = setup(), b = setup();
  for (const h of [a, b]) { h.flight.start(); h.flight.pointerLook(30, -10); }
  a.flight.tick(10); b.flight.tick(90);
  assert.ok(equalCameras(a.getCamera(), b.getCamera()));
});

test('E and Q rise and descend along world Z and stop moving on key release', () => {
  for (const [code, direction] of [['KeyE', 1], ['KeyQ', -1]]) {
    const h = setup(), before = h.getCamera(); h.flight.setSpeed(2);
    h.flight.start(); h.flight.keyDown(code); h.flight.tick(100);
    const after = h.getCamera();
    assert.deepEqual(after.positionLocal.slice(0, 2), before.positionLocal.slice(0, 2));
    assert.ok(Math.abs(after.positionLocal[2] - before.positionLocal[2] - direction * 0.2) < 1e-12);
    h.flight.keyUp(code); h.flight.tick(200);
    assert.deepEqual(h.getCamera(), after);
  }
});

test('a stalled flight step leaves the run active without a camera preview', () => {
  const h = setup();
  h.gestures.apply([{ type: 'setCamera', camera: { ...h.getCamera(), positionLocal: [0, 0, 0], focusLocal: [0, 0, 0] } }], 'camera');
  h.flight.start(); h.flight.keyDown('KeyW');
  const before = h.getCamera(), count = h.transitions.length;
  assert.equal(h.flight.tick(100), false);
  assert.equal(h.flight.active, true);
  assert.equal(h.gestures.openKind, 'flight');
  assert.equal(h.transitions.length, count);
  assert.deepEqual(h.getCamera(), before);
});

test('every discrete apply stops flight before applying content edits or semantic no-ops', () => {
  for (const kind of ['appearance', 'parameters', 'camera']) {
    const h = setup(); h.flight.start(); h.flight.keyDown('KeyW'); h.flight.tick(100);
    const commands = kind === 'appearance' ? [{ type: 'setAppearance', patch: { palette: 'ocean' } }]
      : kind === 'parameters' ? [{ type: 'setParameters', parameters: {} }]
        : [{ type: 'setCamera', camera: h.getCamera() }];
    h.gestures.apply(commands, kind);
    assert.equal(h.flight.active, false);
    assert.equal(h.stops.at(-1), kind);
    assert.equal(h.history.snapshot().gesture, null);
    assert.equal(h.history.snapshot().camera.length, 2);
  }
});
