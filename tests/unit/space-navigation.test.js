import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../src/shared/history.js';
import { createSpaceScene, sceneCodec } from '../../src/space/scene-adapter.js';
import { basis, equalCameras, orbit, reconstructHit, toLocal, lookAt } from '../../src/space/camera.js';
import { classifyCamera, getModel } from '../../src/space/models/registry.js';
import { createPickRequest } from '../../src/space/render/backend.js';
import { createSpaceGestures } from '../../src/space/gestures.js';
import { createFlight } from '../../src/space/flight.js';
import { bindSpaceNavigation, cameraStatus } from '../../src/space/navigation.js';
import { createFakeClock } from '../support/fake-clock.mjs';

// Like 1a navigation.test.js: only event listeners and capture, no browser globals.
function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    listenerCount() { return [...listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0); },
    emit(type, values = {}) {
      const event = { button: 0, pointerId: 7, clientX: 411, clientY: 321, deltaY: 40, deltaMode: 0,
        target: this, preventDefault() {}, ...values };
      return Promise.all([...listeners.get(type) ?? []].map(fn => fn(event)));
    },
  };
}
function setup({ camera, pick } = {}) {
  const history = createHistory({ initialScene: createSpaceScene({ model: 'sphere', ...(camera ? { camera } : {}) }), codec: sceneCodec });
  const clock = createFakeClock(), transitions = [], statuses = [], released = [], requests = [];
  const window = target(), document = { ...target(), hidden: false, defaultView: window };
  const surface = { ...target(), ownerDocument: document, focus() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 802, height: 602 }),
    releasePointerCapture(id) { released.push({ id, gesture: history.snapshot().gesture }); surface.emit('lostpointercapture', { pointerId: id }); } };
  let flight, navigation, contextOverride;
  const gestures = createSpaceGestures({ history, onTransition: t => transitions.push(t),
    setTimer: clock.schedule, clearTimer: clock.clear, stopNavigation(reason) { flight?.stop(reason); navigation?.reset(); } });
  const getCamera = () => history.snapshot().scene.camera;
  flight = createFlight({ getCamera, setCamera: c => gestures.flightUpdate(c), clock: clock.now,
    onStart: () => gestures.flightStart(), onStop: () => gestures.flightEnd() });
  const getPickContext = () => contextOverride !== undefined ? contextOverride : {
    identity: { requestId: `request-${history.snapshot().revision}`, jobId: `job-${history.snapshot().revision}`, viewId: 'space',
      generation: { deviceEpoch: 1, viewRevision: history.snapshot().revision, geometryRevision: history.snapshot().revision, appearanceRevision: 0 } },
    dimensions: { width: 401, height: 301 }, geometryRevision: history.snapshot().revision, sampleIndex: 2,
  };
  const hit = (request, overrides = {}) => ({ identity: request.identity, status: 'approximate hit', depth: 1,
    sample: { camera: getCamera(), pixel: request.pixel, jitter: { dx: 0, dy: 0 }, dimensions: request.dimensions }, ...overrides });
  navigation = bindSpaceNavigation({ surface, gestures, flight, getCamera, getPickContext,
    pick: request => { requests.push(request); return pick ? pick(request, hit) : Promise.resolve(hit(request)); }, onStatus: s => statuses.push(s) });
  return { history, clock, transitions, statuses, released, requests, window, document, surface, gestures, flight, navigation,
    getCamera, getPickContext, hit, context(value) { contextOverride = value; } };
}
function drag(h) {
  h.surface.emit('pointerdown');
  h.surface.emit('pointermove', { clientX: 450 });
  h.surface.emit('pointermove', { clientX: 470 });
}

test('an orbit drag is one camera-history entry and undo does not move the camera', () => {
  const h = setup(), before = h.getCamera();
  drag(h);
  assert.equal(h.history.snapshot().gesture, 'orbit-drag');
  assert.equal(h.history.snapshot().camera.length, 1);
  assert.equal(equalCameras(before, h.getCamera()), false);
  h.surface.emit('pointerup');
  assert.equal(h.history.snapshot().camera.length, 2);
  assert.equal(h.history.snapshot().undoDepth, 0);
  const after = h.getCamera(); h.gestures.undo();
  assert.deepEqual(h.getCamera(), after);
  assert.equal(h.transitions.filter(t => t.cause === 'commit').length, 1);
});

test('pointerdown during a controller run refuses capture and preserves its single history entry', async () => {
  for (const button of [0, 2]) {
    const h = setup(), captures = [], focuses = [];
    h.surface.setPointerCapture = id => captures.push(id);
    h.surface.focus = () => focuses.push(true);
    h.gestures.drag('gamepad', orbit(h.getCamera(), 0.1, 0));
    const before = h.getCamera(), transitions = h.transitions.length;
    await h.surface.emit('pointerdown', { button });
    assert.deepEqual(captures, []); assert.deepEqual(focuses, []);
    for (const type of ['pointermove', 'pointerup', 'pointercancel']) await h.surface.emit(type, { clientX: 500, button });
    assert.equal(h.gestures.openKind, 'gamepad'); assert.deepEqual(h.getCamera(), before);
    assert.equal(h.transitions.length, transitions); assert.equal(h.history.snapshot().camera.length, 1);
    h.gestures.drag('gamepad', orbit(before, 0.1, 0)); h.gestures.dragCommit('gamepad');
    assert.equal(h.history.snapshot().camera.length, 2);
    assert.equal(h.transitions.filter(t => t.cause === 'commit').length, 1);
  }
});

test('a pointer pressed before controller ownership cannot displace the run with a delayed move', async () => {
  for (const button of [0, 2]) {
    const h = setup(); await h.surface.emit('pointerdown', { button });
    h.gestures.drag('gamepad', orbit(h.getCamera(), 0.1, 0));
    const before = h.getCamera(), transitions = h.transitions.length;
    await h.surface.emit('pointermove', { clientX: 500 }); await h.surface.emit('pointerup');
    assert.equal(h.gestures.openKind, 'gamepad'); assert.deepEqual(h.getCamera(), before);
    assert.equal(h.transitions.length, transitions); assert.equal(h.history.snapshot().camera.length, 1);
    h.gestures.dragCommit('gamepad'); assert.equal(h.history.snapshot().camera.length, 2);
  }
});

test('pointerup commits and pointercancel restores the pre-gesture pose', () => {
  for (const event of ['pointerup', 'pointercancel']) {
    const h = setup(), before = h.getCamera();
    drag(h); h.surface.emit(event);
    assert.equal(h.history.snapshot().camera.length, event === 'pointerup' ? 2 : 1);
    assert.equal(equalCameras(h.getCamera(), before), event === 'pointercancel');
    assert.equal(h.history.snapshot().gesture, null);
    assert.equal(h.released.length, 1);
    const after = h.getCamera(); h.surface.emit('pointermove', { clientX: 550 });
    assert.deepEqual(h.getCamera(), after);
  }
});

test('window blur commits the last preview and releases input', () => {
  const h = setup(); drag(h); const preview = h.getCamera();
  h.window.emit('blur');
  assert.equal(h.history.snapshot().camera.length, 2);
  assert.deepEqual(h.getCamera(), preview);
  assert.deepEqual(h.released, [{ id: 7, gesture: null }]);
  h.surface.emit('pointermove', { clientX: 700 });
  assert.deepEqual(h.getCamera(), preview);
});

test('a flight run commits on escape, blur and visibility loss with one entry and zero velocity afterwards', () => {
  for (const exit of ['escape', 'blur', 'hidden']) {
    const h = setup();
    h.surface.emit('keydown', { code: 'KeyF' }); h.surface.emit('keydown', { code: 'KeyW' });
    h.flight.tick(100); h.flight.tick(200);
    assert.equal(h.history.snapshot().gesture, 'flight');
    assert.equal(h.history.snapshot().camera.length, 1);
    if (exit === 'escape') h.window.emit('keydown', { code: 'Escape' });
    if (exit === 'blur') h.window.emit('blur');
    if (exit === 'hidden') { h.document.hidden = true; h.document.emit('visibilitychange'); }
    assert.equal(h.flight.active, false, exit);
    assert.equal(h.history.snapshot().camera.length, 2, exit);
    const stopped = h.getCamera(); h.flight.tick(300);
    assert.deepEqual(h.getCamera(), stopped);
    h.clock.advance(300); h.flight.start(); h.flight.tick(400);
    assert.deepEqual(h.getCamera(), stopped);
  }
});

test('a focus whose pick is stale or unresolved starts no gesture and leaves the camera where it was', async () => {
  // Complete hit-shaped data makes the status/stale checks independently necessary.
  for (const patch of [{ stale: true }, { status: 'unresolved' }, { status: 'miss' }, { status: 'numerical failure' }]) {
    const h = setup({ pick: async (request, hit) => hit(request, patch) }), before = h.getCamera();
    await h.surface.emit('dblclick');
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.getCamera(), before);
    assert.equal(h.history.snapshot().camera.length, 1);
    assert.equal(h.transitions.length, 0);
  }
});

test('a valid pick is one camera-only jump', async () => {
  const h = setup(), before = h.getCamera();
  await h.surface.emit('dblclick');
  assert.equal(h.requests.length, 1);
  const request = h.requests[0];
  assert.deepEqual(createPickRequest(request), request);
  assert.deepEqual(request.pixel, [200, 150], 'CSS offsets are mapped to internal pixels');
  const hit = reconstructHit(before, request.pixel, { dx: 0, dy: 0 }, 1, 401, 301);
  assert.ok(equalCameras(h.getCamera(), lookAt(before, toLocal(before, hit))));
  assert.equal(h.history.snapshot().camera.length, 2);
  assert.equal(h.history.snapshot().undoDepth, 0);
  assert.deepEqual(h.transitions.filter(t => t.cause === 'apply').map(t => t.changed), [['camera']]);
});

test('reset releases captured pointers so later moves cannot navigate', () => {
  const h = setup(); drag(h);
  assert.equal(h.navigation.reset(), 1);
  assert.equal(h.released.length, 1);
  assert.equal(h.released[0].gesture, null, 'commit precedes capture release');
  const before = h.getCamera();
  h.surface.emit('pointermove', { clientX: 600 }); h.surface.emit('pointerup');
  assert.deepEqual(h.getCamera(), before);
  assert.equal(h.history.snapshot().camera.length, 2);
  assert.equal(h.navigation.reset(), 0);
});

test('the camera status is unresolved when either evaluator is unresolved or the effective result is stale', () => {
  const cpu = classifyCamera(getModel('sphere', 1), {}, [3, 0, 0], 32);
  assert.equal(cpu.status, 'exterior');
  assert.equal(cameraStatus({ cpu, effective: { status: 'exterior' } }).status, 'exterior');
  for (const [c, e] of [[{ status: 'unresolved' }, { status: 'exterior' }], [cpu, { status: 'unresolved' }],
    [cpu, { status: 'exterior', stale: true }], [cpu, null]]) {
    const status = cameraStatus({ cpu: c, effective: e });
    assert.equal(status.status, 'unresolved');
    assert.deepEqual(status.detail, { cpu: c, effective: e });
  }
});

test('a precision-limit pick is unresolved and starts no focus gesture', async () => {
  const h = setup({ pick: async () => ({ unavailable: true, reason: 'precision-limit' }) }), before = h.getCamera();
  await h.surface.emit('dblclick');
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.getCamera(), before);
  assert.equal(h.transitions.length, 0);
  assert.equal(h.statuses.at(-1)?.status, 'unresolved');
});

test('unavailable reconstructHit and toLocal outcomes start no focus gesture', async () => {
  for (const operation of ['reconstructHit', 'toLocal']) {
    const camera = { ...createSpaceScene({ model: 'sphere' }).camera,
      ...(operation === 'reconstructHit' ? { scale: { mantissa: 1, exponent: -1074 } } : {}) };
    const depth = operation === 'reconstructHit' ? Number.MAX_VALUE : 2 ** 22;
    const reconstructed = reconstructHit(camera, [200, 150], { dx: 0, dy: 0 }, depth, 401, 301);
    if (operation === 'reconstructHit') assert.equal(reconstructed.unavailable, true);
    else { assert.ok(reconstructed.positionLocal); assert.equal(toLocal(camera, reconstructed).unavailable, true); }
    const h = setup({ camera, pick: async (request, hit) => hit(request, { depth }) });
    await h.surface.emit('dblclick');
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.getCamera(), camera);
    assert.equal(h.transitions.length, 0);
    assert.equal(h.statuses.at(-1)?.status, 'unresolved');
  }
});

test('focus rechecks execution identity even when the camera values are unchanged', async () => {
  let resolve;
  const h = setup({ pick: request => new Promise(done => { resolve = () => done(h.hit(request)); }) });
  const before = h.getCamera(), pending = h.surface.emit('dblclick');
  assert.equal(h.requests.length, 1);
  const current = h.getPickContext();
  h.context({ ...current, identity: { ...current.identity, requestId: 'replacement' } });
  resolve(); await pending;
  assert.deepEqual(h.getCamera(), before);
  assert.equal(h.transitions.length, 0);
});

test('focus uses the returned sample camera, pixel, jitter and dimensions', async () => {
  const initial = createSpaceScene({ model: 'sphere' }).camera;
  const sample = { camera: orbit(initial, 0.15, 0), pixel: [200, 150], jitter: { dx: 0.25, dy: -0.3 }, dimensions: { width: 401, height: 301 } };
  const h = setup({ pick: async (request, hit) => hit(request, { sample }) });
  await h.surface.emit('dblclick');
  const point = reconstructHit(sample.camera, sample.pixel, sample.jitter, 1, 401, 301);
  assert.equal(h.history.snapshot().camera.length, 2);
  assert.ok(equalCameras(h.getCamera(), lookAt(initial, toLocal(initial, point))));
});

test('reset, destroy and newer input invalidate a pending focus', async () => {
  for (const action of ['reset', 'destroy', 'input']) {
    let resolve;
    const h = setup({ pick: request => new Promise(done => { resolve = () => done(h.hit(request)); }) });
    const pending = h.surface.emit('dblclick');
    assert.equal(h.requests.length, 1);
    if (action === 'input') h.surface.emit('wheel'); else h.navigation[action]();
    const before = h.getCamera(), count = h.transitions.length;
    resolve(); await pending;
    assert.deepEqual(h.getCamera(), before);
    assert.equal(h.transitions.length, count);
  }
});

test('an identical focus result starts no gesture', async () => {
  const camera = { ...createSpaceScene({ model: 'sphere' }).camera, positionLocal: [0, 0, 2], focusLocal: [0, 0, 0], orientationWxyz: [1, 0, 0, 0] };
  const h = setup({ camera, pick: async (request, hit) => hit(request, { depth: 2 }) });
  await h.surface.emit('dblclick');
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.getCamera(), camera);
  assert.equal(h.transitions.length, 0);
});

test('secondary-button and Shift drags pan, wheel dollies, and key repeats nudge', () => {
  for (const values of [{ button: 2 }, { shiftKey: true }]) {
    const h = setup(), before = h.getCamera();
    h.surface.emit('pointerdown', values); h.surface.emit('pointermove', { clientX: 470 });
    assert.equal(h.history.snapshot().gesture, 'pan-drag');
    assert.deepEqual(h.getCamera().orientationWxyz, before.orientationWxyz);
    assert.notDeepEqual(h.getCamera().focusLocal, before.focusLocal);
    h.surface.emit('pointerup'); assert.equal(h.history.snapshot().camera.length, 2);
  }
  const h = setup(); h.surface.emit('wheel'); h.surface.emit('wheel');
  assert.equal(h.history.snapshot().gesture, 'wheel-dolly'); h.clock.advance(200);
  h.surface.emit('keydown', { code: 'ArrowRight' }); h.surface.emit('keydown', { code: 'ArrowRight', repeat: true });
  assert.equal(h.history.snapshot().gesture, 'key-nudge'); h.clock.advance(200);
  assert.equal(h.history.snapshot().camera.length, 3);
});

test('loaded coincident cameras offer Overview and do not navigate', () => {
  const camera = { ...createSpaceScene({ model: 'sphere' }).camera, positionLocal: [0, 0, 0], focusLocal: [0, 0, 0] };
  const h = setup({ camera }); drag(h); h.surface.emit('wheel');
  assert.deepEqual(h.getCamera(), camera);
  assert.equal(h.history.snapshot().gesture, null);
  assert.deepEqual(h.statuses.at(-1)?.actions, ['overview']);
});

test('destroy removes listeners and input fields do not start navigation', () => {
  const h = setup();
  for (const target of [h.surface, h.window, h.document]) assert.ok(target.listenerCount() > 0);
  h.surface.emit('keydown', { code: 'KeyF', target: { tagName: 'INPUT' } });
  assert.equal(h.flight.active, false);
  h.surface.emit('keydown', { code: 'ArrowLeft', target: { isContentEditable: true } });
  assert.equal(h.history.snapshot().gesture, null);
  drag(h); h.navigation.destroy();
  for (const target of [h.surface, h.window, h.document]) assert.equal(target.listenerCount(), 0);
  assert.equal(h.history.snapshot().camera.length, 2);
  const before = h.getCamera(); h.surface.emit('wheel'); h.surface.emit('keydown', { code: 'KeyF' });
  assert.deepEqual(h.getCamera(), before); assert.equal(h.flight.active, false);
});

test('focus rejects a mismatched returned identity, missing sample and rejected promise', async () => {
  for (const pick of [
    async (request, hit) => hit(request, { identity: { ...request.identity, jobId: 'another-job' } }),
    async (request, hit) => hit(request, { sample: null }),
    async () => { throw new Error('lost readback'); },
  ]) {
    const h = setup({ pick }), before = h.getCamera();
    await h.surface.emit('dblclick');
    assert.equal(h.requests.length, 1);
    assert.equal(h.transitions.length, 0);
    assert.deepEqual(h.getCamera(), before);
  }
});

test('all history actions commit a captured preview before releasing its pointer', () => {
  for (const action of ['back', 'forward', 'undo', 'redo', 'scene-replacement']) {
    const h = setup(); drag(h);
    if (action === 'scene-replacement') h.gestures.apply([{ type: 'restoreScene', scene: createSpaceScene({ model: 'box' }) }], action);
    else h.gestures[action]();
    assert.deepEqual(h.released, [{ id: 7, gesture: null }], action);
    const after = h.getCamera(); h.surface.emit('pointermove', { clientX: 700 }); h.surface.emit('pointercancel');
    assert.deepEqual(h.getCamera(), after, action);
  }
});

test('focus rejects mismatched sample pixels and dimensions even with a valid identity and depth', async () => {
  for (const patch of [{ pixel: [0, 0] }, { dimensions: { width: 403, height: 301 } }]) {
    const h = setup({ pick: async (request, hit) => hit(request, { sample: { ...hit(request).sample, ...patch } }) });
    const before = h.getCamera();
    await h.surface.emit('dblclick');
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.getCamera(), before);
    assert.equal(h.transitions.length, 0);
    assert.equal(h.statuses.at(-1)?.reason, 'stale-sample');
  }
});

test('held F cannot toggle flight repeatedly and double-click during flight never requests a pick', async () => {
  const h = setup();
  h.surface.emit('keydown', { code: 'KeyF' });
  h.surface.emit('keydown', { code: 'KeyF', repeat: true });
  assert.equal(h.flight.active, true);
  const before = h.getCamera();
  await h.surface.emit('dblclick');
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.getCamera(), before);
  assert.equal(h.history.snapshot().gesture, 'flight');
});

test('F commits a wheel burst before starting flight', () => {
  const h = setup(); h.surface.emit('wheel');
  const preview = h.getCamera();
  assert.equal(h.history.snapshot().gesture, 'wheel-dolly');
  h.surface.emit('keydown', { code: 'KeyF' });
  assert.equal(h.flight.active, true);
  assert.equal(h.history.snapshot().gesture, 'flight');
  assert.equal(h.history.snapshot().camera.length, 2);
  assert.deepEqual(h.getCamera(), preview);
  h.clock.advance(200);
  assert.equal(h.history.snapshot().gesture, 'flight', 'the old wheel timer cannot close flight');
});

test('a second pointer cannot move or close the first captured drag', () => {
  const h = setup(); drag(h);
  const preview = h.getCamera();
  h.surface.emit('pointerdown', { pointerId: 8 });
  h.surface.emit('pointermove', { pointerId: 8, clientX: 600 });
  h.surface.emit('pointerup', { pointerId: 8 });
  assert.deepEqual(h.getCamera(), preview);
  assert.equal(h.history.snapshot().gesture, 'orbit-drag');
  assert.equal(h.released.length, 0);
  h.surface.emit('pointerup');
  assert.equal(h.history.snapshot().camera.length, 2);
});

test('browser-initiated lost capture commits exactly the last drag preview', () => {
  const h = setup(); drag(h); const preview = h.getCamera();
  h.surface.emit('lostpointercapture');
  assert.deepEqual(h.getCamera(), preview);
  assert.equal(h.history.snapshot().camera.length, 2);
  assert.equal(h.history.snapshot().gesture, null);
  assert.equal(h.transitions.filter(t => t.cause === 'commit').length, 1);
  h.surface.emit('pointercancel'); h.surface.emit('pointermove', { clientX: 600 });
  assert.deepEqual(h.getCamera(), preview);
});

test('pan follows grab directions in the camera basis and orbit preserves distance with signed turns', () => {
  const h = setup(), before = h.getCamera(), { right, up } = basis(before);
  h.surface.emit('pointerdown', { button: 2 });
  h.surface.emit('pointermove', { clientX: 441, clientY: 341 });
  const delta = h.getCamera().focusLocal.map((x, i) => x - before.focusLocal[i]);
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  assert.ok(dot(delta, right) < 0, 'dragging right moves the camera left');
  assert.ok(dot(delta, up) > 0, 'dragging down moves the camera up');
  h.surface.emit('pointerup');
  const o = setup(), start = o.getCamera();
  o.surface.emit('pointerdown'); o.surface.emit('pointermove', { clientX: 441, clientY: 341 });
  const offset = c => c.positionLocal.map((x, i) => x - c.focusLocal[i]);
  const a = offset(start), b = offset(o.getCamera());
  assert.ok(Math.atan2(b[1], b[0]) < Math.atan2(a[1], a[0]), 'rightward orbit has negative yaw');
  assert.ok(Math.atan2(b[2], Math.hypot(b[0], b[1])) > Math.atan2(a[2], Math.hypot(a[0], a[1])), 'downward orbit raises elevation');
  assert.ok(Math.abs(Math.hypot(...a) - Math.hypot(...b)) < 1e-12);
  assert.deepEqual(o.getCamera().focusLocal, start.focusLocal);
});

test('wheel distance is bounded in both directions after pixel, line and page conversion', () => {
  for (const sign of [-1, 1]) {
    const limit = setup(); limit.surface.emit('wheel', { deltaY: sign * 160 });
    for (const event of [{ deltaY: sign * 100000 }, { deltaY: sign * 10, deltaMode: 1 }, { deltaY: sign, deltaMode: 2 }]) {
      const h = setup(); h.surface.emit('wheel', event);
      assert.ok(equalCameras(h.getCamera(), limit.getCamera()));
    }
  }
});

test('a missing pick context reports unresolved without requesting a pick or changing history', async () => {
  const h = setup(), before = h.getCamera(); h.context(null);
  await h.surface.emit('dblclick');
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.getCamera(), before);
  assert.equal(h.transitions.length, 0);
  assert.deepEqual(h.statuses.at(-1), { status: 'unresolved', reason: 'pick-unavailable' });
});

test('double-click at viewport borders clamps to the nearest valid internal pixel', async () => {
  for (const [clientX, clientY, pixel] of [[812, 622, [400, 300]], [10, 20, [0, 0]], [812, 20, [400, 0]], [10, 622, [0, 300]]]) {
    const h = setup();
    await h.surface.emit('dblclick', { clientX, clientY });
    assert.equal(h.requests.length, 1, 'border clicks still request depth');
    assert.deepEqual(h.requests[0].pixel, pixel);
    assert.equal(h.history.snapshot().camera.length, 2);
  }
});
