import test from 'node:test';
import assert from 'node:assert/strict';
import { createGamepadInput, decodeSnapshot, shapeStick, shapeTrigger, GAMEPAD_DEFAULTS, STANDARD_MAPPING } from '../../src/space/gamepad.js';
import { createFlight, FLIGHT_SPEED_LIMITS } from '../../src/space/flight.js';
import { createSpaceGestures } from '../../src/space/gestures.js';
import { createHistory } from '../../src/shared/history.js';
import { createSpaceScene, sceneCodec } from '../../src/space/scene-adapter.js';
import { basis, dolly, equalCameras, flightStep, orbit, overview, pan, resetOrientation, setOrientation } from '../../src/space/camera.js';
import { getModel } from '../../src/space/models/registry.js';
import { createFakeClock } from '../support/fake-clock.mjs';

const near = (a, b, tolerance = 1e-11) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function nearCamera(a, b) {
  for (const field of ['positionLocal', 'focusLocal', 'orientationWxyz']) a[field].forEach((v, i) => near(v, b[field][i]));
}
function pad({ index = 0, id = `pad-${index}`, mapping = 'standard', connected = true, axes = [0, 0, 0, 0], pressed = [], values = {} } = {}) {
  return { index, id, mapping, connected, axes, timestamp: 0,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? Number(pressed.includes(i)) })) };
}
function setup(options = {}) {
  const clock = createFakeClock(), transitions = [], stops = [], analog = [], statuses = [], navigationStops = [];
  const history = createHistory({ initialScene: createSpaceScene({ model: 'sphere' }), codec: sceneCodec });
  const getCamera = () => history.snapshot().scene.camera;
  let flight, snapshots = [pad()], reads = 0;
  const gestures = createSpaceGestures({ history, setTimer: clock.schedule, clearTimer: clock.clear,
    onTransition: (transition, preview) => transitions.push({ transition, preview }),
    stopNavigation(reason) {
      navigationStops.push(reason);
      const explicit = ['escape', 'blur', 'hidden', 'stop-key', 'deactivate', 'history', 'disconnect', 'input-suspended'];
      flight?.stop(explicit.includes(reason) ? reason : 'history');
    } });
  const actualFlight = createFlight({ getCamera, setCamera: camera => gestures.flightUpdate(camera), clock,
    onStart: () => gestures.flightStart(), onStop: () => gestures.flightEnd() });
  flight = { ...actualFlight, get active() { return actualFlight.active; }, get speed() { return actualFlight.speed; },
    stop(reason) { stops.push(reason); return actualFlight.stop(reason); },
    setAnalogInput(input, rates) { analog.push(input); return actualFlight.setAnalogInput(input, rates); } };
  const input = createGamepadInput({ gestures, flight, getCamera, clock,
    cameraOps: { orbit, pan, dolly, resetOrientation, overview: () => overview(getModel('sphere', 1)) },
    getGamepads: () => { reads++; if (snapshots instanceof Error) throw snapshots; return snapshots; },
    onStatus: value => statuses.push(value), ...options });
  const h = { clock, history, gestures, flight, actualFlight, getCamera, input, analog, transitions, stops, statuses, navigationStops,
    setPads: value => { snapshots = value; }, reads: () => reads,
    sample(value = pad(), ms = 20) { snapshots = [value]; clock.advance(ms); input.poll(); },
    poll(ms = 20) { clock.advance(ms); input.poll(); },
    arm() { input.setEligible(true); input.poll(); },
    previews: () => transitions.filter(t => t.preview).length,
    commits: () => transitions.filter(t => t.transition.cause === 'commit').length };
  return h;
}

test('inputs inside the dead zone produce no motion', () => {
  assert.deepEqual(shapeStick(0.1, 0.1, 0.15), [0, 0]);
  assert.equal(shapeTrigger(0.05, 0.05), 0);
  assert.equal(decodeSnapshot(pad({ axes: [0.1, 0.1, -0.1, 0.1], values: { 6: 0.04, 7: 0.04 } })).status, 'ok');
  assert.ok(Object.values(decodeSnapshot(pad()).motion).every(v => v === 0));
});

test('the radial curve squares the magnitude and preserves direction', () => {
  const result = shapeStick(0.3, 0.4, 0.15), magnitude = ((0.5 - 0.15) / 0.85) ** 2;
  near(result[0], 0.6 * magnitude); near(result[1], 0.8 * magnitude);
  near(Math.hypot(...shapeStick(1, 1, 0.15)), 1);
  near(shapeTrigger(0.525, 0.05), 0.25);
  assert.equal(shapeTrigger(5, 0.05), 1);
  assert.equal(shapeTrigger(-1, 0.05), 0);
});

test('non-finite or missing axes produce zero demand', () => {
  assert.deepEqual(shapeStick(NaN, undefined, 0.15), [0, 0]);
  assert.equal(shapeTrigger(Infinity, 0.05), 0);
  const broken = { connected: true, mapping: 'standard', axes: [NaN, Infinity], buttons: [{ value: NaN }] };
  assert.equal(decodeSnapshot(broken).status, 'ok');
  assert.ok(Object.values(decodeSnapshot(broken).motion).every(v => v === 0));
  assert.equal(decodeSnapshot(null).status, 'disconnected');
  assert.equal(decodeSnapshot(pad({ connected: false })).status, 'disconnected');
});

test('standard indices and axis signs implement push up to pitch up or move forward', () => {
  assert.ok(Object.isFrozen(STANDARD_MAPPING)); assert.ok(Object.isFrozen(STANDARD_MAPPING.axes));
  assert.deepEqual(STANDARD_MAPPING.axes, { leftX: 0, leftY: 1, rightX: 2, rightY: 3 });
  const up = decodeSnapshot(pad({ axes: [0, -1, 0, -1] })).motion;
  assert.equal(up.forward, 1); assert.equal(up.pitch, 1); assert.equal(up.orbitPitch, -1); assert.equal(up.dolly, -1);
  const right = decodeSnapshot(pad({ axes: [1, 0, 1, 0], pressed: [7, 12, 15] }));
  assert.equal(right.motion.strafe, 1); assert.equal(right.motion.yaw, -1); assert.equal(right.motion.orbitYaw, -1);
  assert.equal(right.motion.panX, 1); assert.equal(right.motion.panY, 1); assert.equal(right.motion.rise, 1);
  const buttons = decodeSnapshot(pad({ pressed: [0, 1, 3, 4, 5, 8, 9] })).buttons;
  for (const name of ['a', 'stop', 'reset', 'slower', 'faster', 'overview', 'toggleFlight']) assert.equal(buttons[name], true, name);
  const camera = createSpaceScene({ model: 'sphere' }).camera;
  assert.ok(basis(orbit(camera, 0, up.orbitPitch * 0.1)).forward[2] > basis(camera).forward[2]);
});

test('a non-standard mapping is reported as an unsupported layout and drives nothing', () => {
  const h = setup(); h.setPads([pad({ mapping: '', axes: [1, 1, 1, 1], pressed: [9] })]); h.arm(); h.poll();
  assert.equal(h.input.status().state, 'unsupported-layout'); assert.equal(h.previews(), 0); assert.equal(h.flight.active, false);
  assert.equal(decodeSnapshot(pad({ mapping: '' })).status, 'unsupported-layout');
});

test('a stick run is one camera-history entry', () => {
  const h = setup(); h.arm(); const before = h.getCamera();
  h.sample(pad({ axes: [1, 0, 0, 0] })); h.poll();
  assert.equal(h.gestures.openKind, 'gamepad'); assert.equal(h.history.snapshot().camera.length, 1);
  assert.notDeepEqual(h.getCamera(), before);
  h.sample(); h.poll(199); assert.equal(h.commits(), 0); h.poll(1);
  assert.equal(h.commits(), 1); assert.equal(h.history.snapshot().camera.length, 2);
  const after = h.getCamera(); h.gestures.undo(); assert.deepEqual(h.getCamera(), after);
  h.gestures.back(); assert.deepEqual(h.getCamera(), before);
});

test('held deflection across a delayed frame remains one history entry', () => {
  const h = setup(); h.arm(); h.sample(pad({ axes: [1, 0, 0, 0] })); h.poll(5000);
  assert.equal(h.commits(), 0); assert.equal(h.gestures.openKind, 'gamepad');
  h.sample(pad(), 5000); assert.equal(h.commits(), 0);
  h.poll(200); assert.equal(h.commits(), 1);
});

test('equal-duration constant input at different frame rates produces equivalent movement', () => {
  for (const axes of [[1, 0, 0, 0], [0, 0, 0, -1], [0, 0, 1, 0]]) {
    const a = setup(), b = setup();
    for (const [h, step] of [[a, 10], [b, 50]]) { h.arm(); for (let t = 0; t < 1000; t += step) h.sample(pad({ axes }), step); }
    nearCamera(a.getCamera(), b.getCamera());
  }
});

test('one poll produces at most one preview and flight receives one update per frame', () => {
  const h = setup(); h.arm(); h.sample(pad({ axes: [0.8, -0.6, 0.6, -0.8], pressed: [12] }));
  assert.equal(h.previews(), 1);
  h.sample(pad({ pressed: [9] })); assert.equal(h.flight.active, true);
  h.sample(); const count = h.previews(), updates = h.analog.length;
  h.sample(pad({ axes: [0.5, -0.5, 0.5, -0.5], pressed: [7] }));
  assert.equal(h.previews(), count); assert.equal(h.analog.length, updates + 1);
  h.flight.tick(h.clock.now()); assert.equal(h.previews(), count + 1);
  assert.equal(h.gestures.openKind, 'flight');
});

test('orbit motion composes angular, exponential dolly and focus-height pan in one pose', () => {
  const h = setup(); h.arm(); const before = h.getCamera(), sample = pad({ axes: [1, 0, 0, -1], pressed: [12, 15] });
  let expected = orbit(before, -Math.PI / 20, 0); expected = dolly(expected, 2 ** -0.1);
  const height = 2 * Math.hypot(...expected.positionLocal.map((x, i) => x - expected.focusLocal[i])) * Math.tan(expected.verticalFovDegrees * Math.PI / 360);
  expected = pan(expected, height * 0.05, height * 0.05);
  h.sample(sample, 100); nearCamera(h.getCamera(), expected); assert.equal(h.previews(), 1);
});

test('disconnect mid-run commits the last preview and zeroes velocity', () => {
  for (const flying of [false, true]) {
    const h = setup(); h.arm();
    if (flying) { h.sample(pad({ pressed: [9] })); h.sample(); }
    h.sample(pad({ axes: [0, -1, 0, 0] })); h.flight.tick(h.clock.now());
    const camera = h.getCamera(), commits = h.commits();
    h.setPads([]); h.poll(); h.poll();
    assert.deepEqual(h.getCamera(), camera); assert.equal(h.commits(), commits + 1);
    assert.deepEqual(h.stops.filter(x => x === 'disconnect'), ['disconnect']);
    assert.equal(h.flight.active, false); assert.equal(h.input.status().state, 'waiting');
    h.flight.start(); h.clock.advance(100); h.flight.tick(); assert.deepEqual(h.getCamera(), camera);
  }
});

test('held controls across blur, workspace switching or controller replacement cause no resumed movement', () => {
  for (const reason of ['blur', 'deactivate', 'replacement']) {
    const h = setup(); h.arm(); h.sample(pad({ axes: [1, 0, 0, 0] }));
    if (reason === 'replacement') h.setPads([pad({ id: 'replacement', axes: [1, 0, 0, 0] })]);
    else { h.input.setEligible(false, reason); h.input.setEligible(true); }
    const before = h.getCamera(); h.poll(1000); h.poll(); assert.deepEqual(h.getCamera(), before);
    const id = reason === 'replacement' ? 'replacement' : 'pad-0';
    h.sample(pad({ id })); h.sample(pad({ id, axes: [1, 0, 0, 0] })); assert.notDeepEqual(h.getCamera(), before);
  }
});

test('polling while ineligible only refreshes status and suspension commits and stops exactly once', () => {
  const h = setup(); h.poll(); assert.equal(h.reads(), 1); assert.equal(h.previews(), 0); h.arm();
  h.sample(pad({ axes: [1, 0, 0, 0] })); h.input.setEligible(false, 'modal');
  h.input.setEligible(false, 'hidden'); const count = h.reads(); h.poll(2000);
  assert.equal(h.reads(), count + 1); assert.equal(h.commits(), 1); assert.deepEqual(h.stops, ['input-suspended']);
  h.input.setEligible(true); h.sample(); const before = h.getCamera();
  h.sample(pad({ axes: [1, 0, 0, 0] }), 10); nearCamera(h.getCamera(), orbit(before, -Math.PI / 200, 0));
});

test('ineligible polls report connection, replacement, unsupported layout and API failures without navigation', () => {
  const h = setup(), before = h.getCamera(); h.setPads([]); h.poll();
  assert.equal(h.input.status().state, 'waiting');
  h.sample(pad({ index: 2, axes: [1, 0, 0, 0], pressed: [9] }));
  assert.deepEqual(h.input.status(), { state: 'connected', id: 'pad-2', index: 2 });
  assert.deepEqual(h.statuses.at(-1), h.input.status());
  h.setPads([pad({ index: 0 }), pad({ index: 2 })]); h.poll();
  assert.equal(h.input.status().index, 2, 'new connections do not steal the selected pad while suspended');
  h.setPads([pad({ index: 0 })]); h.poll(); assert.equal(h.input.status().index, 0);
  h.setPads([]); h.poll(); assert.equal(h.input.status().state, 'waiting');
  h.sample(pad({ mapping: '' })); assert.equal(h.input.status().state, 'unsupported-layout');
  h.setPads(Object.assign(new Error('denied'), { name: 'SecurityError' })); h.poll();
  assert.equal(h.input.status().state, 'unavailable');
  assert.deepEqual(h.getCamera(), before); assert.equal(h.transitions.length, 0);
  assert.equal(h.flight.active, false); assert.equal(h.analog.length, 0); assert.deepEqual(h.stops, []);
  assert.deepEqual(h.statuses.map(s => s.state), ['connected', 'connected', 'waiting', 'unsupported-layout', 'unavailable']);
});

test('status polling during suspension cannot arm held controls or stop independently restarted keyboard flight', () => {
  const h = setup(); h.arm(); h.sample(pad({ axes: [1, 0, 0, 0] })); h.input.setEligible(false, 'blur');
  h.sample(); // Neutral observed while ineligible does not arm the controller.
  const suspended = h.getCamera();
  h.sample(pad({ axes: [1, 0, 0, 0] })); h.poll();
  assert.deepEqual(h.getCamera(), suspended);
  h.sample(pad({ pressed: [9] })); assert.equal(h.flight.active, false);
  h.flight.start(); h.flight.keyDown('KeyW');
  h.sample(pad({ pressed: [1, 5] })); assert.equal(h.flight.active, true); assert.equal(h.flight.speed, 1);
  h.setPads([]); h.poll(); assert.equal(h.input.status().state, 'waiting');
  assert.equal(h.flight.active, true); assert.deepEqual(h.stops, ['input-suspended']);
  h.flight.stop('escape'); h.sample(); const before = h.getCamera();
  h.input.setEligible(true); h.sample(pad({ axes: [1, 0, 0, 0] })); h.poll();
  assert.deepEqual(h.getCamera(), before); assert.equal(h.commits(), 2);
  h.sample(); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.notDeepEqual(h.getCamera(), before);
});

test('left trigger descends along world Z in flight and opposing triggers cancel', () => {
  const h = setup(); h.arm(); h.sample(pad({ pressed: [9] })); h.sample();
  h.flight.setSpeed(2); const before = h.getCamera();
  h.sample(pad({ pressed: [6] }), 100); h.flight.tick(h.clock.now());
  const after = h.getCamera();
  near(after.positionLocal[0], before.positionLocal[0]); near(after.positionLocal[1], before.positionLocal[1]);
  near(after.positionLocal[2], before.positionLocal[2] - 0.2);
  assert.equal(h.analog.at(-1).rise, -1);
  const previews = h.previews(); h.sample(pad({ pressed: [6, 7] }), 100); h.flight.tick(h.clock.now());
  assert.equal(h.analog.at(-1).rise, 0); assert.deepEqual(h.getCamera(), after); assert.equal(h.previews(), previews);
});

test('suspension clears analog and keyboard flight demands and commits one flight entry', () => {
  const h = setup(); h.arm(); h.sample(pad({ pressed: [9] })); h.sample();
  h.flight.keyDown('KeyW'); h.sample(pad({ axes: [0, -1, 0.5, -0.5], pressed: [7] })); h.flight.tick(h.clock.now());
  const before = h.getCamera(); h.input.setEligible(false, 'parameter-edit'); h.input.setEligible(false, 'modal');
  assert.deepEqual(h.stops, ['input-suspended']); assert.equal(h.commits(), 1); assert.equal(h.flight.active, false);
  h.flight.start(); h.clock.advance(100); h.flight.tick(); assert.deepEqual(h.getCamera(), before);
});

test('connection requires neutral motion and released action buttons including the discovery press', () => {
  const h = setup(); h.setPads([pad({ axes: [1, 0, 0, 0], pressed: [9] })]); h.arm(); h.poll();
  assert.equal(h.flight.active, false); assert.equal(h.previews(), 0);
  h.sample(pad({ pressed: [9] })); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.equal(h.previews(), 0);
  h.sample(); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.equal(h.previews(), 1);
});

test('opposing held triggers or D-pad buttons cannot falsely re-arm', () => {
  for (const pressed of [[6, 7], [12, 13], [14, 15]]) {
    const h = setup(); h.setPads([pad({ pressed })]); h.arm();
    h.sample(pad({ axes: [1, 0, 0, 0] })); assert.equal(h.previews(), 0);
    h.sample(); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.equal(h.previews(), 1);
  }
});

test('overview and reset stop flight and commit the run before the jump', () => {
  for (const [button, kind] of [[8, 'overview'], [3, 'orientation-reset']]) {
    const h = setup(); h.arm(); h.sample(pad({ pressed: [9] })); h.sample();
    h.sample(pad({ axes: [0, -1, 1, 0] })); h.flight.tick(h.clock.now());
    if (button === 3) h.gestures.flightUpdate(setOrientation(h.getCamera(), [1, 0, 0, 0]));
    const before = h.getCamera(), index = h.transitions.length;
    h.sample(pad({ pressed: [button], axes: [1, 0, 0, 0] }));
    assert.equal(h.flight.active, false); assert.equal(h.navigationStops.at(-1), kind);
    assert.equal(h.transitions[index].transition.cause, 'commit');
    assert.equal(h.history.snapshot().camera.length, 3);
    assert.ok(equalCameras(h.getCamera(), button === 8 ? overview(getModel('sphere', 1)) : resetOrientation(before)));
    const after = h.getCamera(); h.poll(); assert.deepEqual(h.getCamera(), after);
  }
});

test('buttons act on rising edges and a held bumper changes speed once', () => {
  const h = setup(); h.arm(); h.sample(pad({ pressed: [5] })); h.poll(); assert.equal(h.flight.speed, 2);
  h.sample(); h.sample(pad({ pressed: [4] })); assert.equal(h.flight.speed, 1);
  h.flight.setSpeed(FLIGHT_SPEED_LIMITS.max); h.sample(); h.sample(pad({ pressed: [5] })); assert.equal(h.flight.speed, FLIGHT_SPEED_LIMITS.max);
  h.flight.setSpeed(FLIGHT_SPEED_LIMITS.min); h.sample(); h.sample(pad({ pressed: [4] })); assert.equal(h.flight.speed, FLIGHT_SPEED_LIMITS.min);
  h.sample(); h.sample(pad({ pressed: [9] })); h.poll(); assert.equal(h.flight.active, true);
  h.sample(); h.sample(pad({ pressed: [9] })); h.poll(); assert.equal(h.flight.active, false);
});

test('a newly connected controller does not steal control and an unselected disconnect changes status only', () => {
  const h = setup(); h.setPads([null, pad({ index: 3 }), pad({ index: 2 })]); h.arm(); assert.equal(h.input.status().index, 2);
  h.setPads([pad({ index: 0, axes: [1, 0, 0, 0] }), pad({ index: 2 })]); h.poll(); assert.equal(h.input.status().index, 2);
  h.setPads([pad({ index: 2, axes: [1, 0, 0, 0] })]); h.poll();
  assert.equal(h.gestures.openKind, 'gamepad'); assert.equal(h.stops.length, 0); assert.equal(h.commits(), 0);
  h.setPads([pad({ index: 0, axes: [1, 0, 0, 0] })]); const before = h.getCamera(); h.poll();
  assert.equal(h.input.status().index, 0); assert.deepEqual(h.getCamera(), before); assert.equal(h.commits(), 1);
});

test('selection prefers the lowest standard layout and status notifications are deduplicated', () => {
  const h = setup(); h.setPads([pad({ mapping: '' }), pad({ index: 4 }), pad({ index: 2 })]); h.arm();
  assert.deepEqual(h.input.status(), { state: 'connected', id: 'pad-2', index: 2 });
  const count = h.statuses.length; h.poll(); assert.equal(h.statuses.length, count);
  const status = h.input.status(); try { status.state = 'bad'; } catch {}
  assert.equal(h.input.status().state, 'connected');
});

test('a pointer drag owns the camera and controller orbit input is ignored until re-armed', () => {
  for (const kind of ['orbit-drag', 'pan-drag', 'wheel-dolly', 'key-nudge']) {
    const h = setup(); h.arm();
    h.gestures[kind.includes('drag') ? 'drag' : 'grouped'](kind, orbit(h.getCamera(), 0.1, 0));
    const before = h.getCamera(); h.sample(pad({ axes: [1, 0, 0, 0] }));
    assert.equal(h.gestures.openKind, kind); assert.deepEqual(h.getCamera(), before);
    h.gestures.settle(); h.poll(); assert.deepEqual(h.getCamera(), before);
    h.sample(); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.equal(h.gestures.openKind, 'gamepad');
  }
});

test('refused drag or flight begin disarms without a retry storm or corrupting the owner', () => {
  for (const action of ['drag', 'flight']) {
    let attempts = 0, owner = null;
    const h = setup(action === 'drag' ? { gestures: { get openKind() { return owner; }, drag() { attempts++; return false; }, dragCommit() {} } }
      : { flight: { active: false, setAnalogInput() {}, start() { attempts++; return false; }, stop() {}, speed: 1 } });
    h.arm(); const active = action === 'drag' ? pad({ axes: [1, 0, 0, 0] }) : pad({ pressed: [9] });
    h.sample(active); for (let i = 0; i < 10; i++) h.poll();
    assert.equal(attempts, 1); assert.equal(h.previews(), 0); assert.equal(owner, null);
    h.sample(); h.sample(active); assert.equal(attempts, 2);
  }
});

test('desktop flight accepts controller demands but every observed mode change requires re-arming', () => {
  const h = setup(); h.arm(); h.flight.start(); const before = h.getCamera();
  h.sample(pad({ axes: [0, -1, 0, 0] })); h.flight.tick(h.clock.now()); assert.deepEqual(h.getCamera(), before);
  h.sample(); h.sample(pad({ axes: [0, -1, 0, 0] })); h.flight.tick(h.clock.now()); assert.notDeepEqual(h.getCamera(), before);
  h.flight.stop('escape'); const after = h.getCamera(); h.poll(); assert.deepEqual(h.getCamera(), after);
  h.sample(); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.notDeepEqual(h.getCamera(), after);
});

test('external settlement of a controller run requires neutral even when no other owner remains', () => {
  const h = setup(); h.arm(); h.sample(pad({ axes: [1, 0, 0, 0] }));
  h.gestures.settle('escape'); const before = h.getCamera(); h.poll(); h.poll();
  assert.deepEqual(h.getCamera(), before); assert.equal(h.commits(), 1);
  h.sample(); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.notDeepEqual(h.getCamera(), before);
});

test('an open pointer gesture also rejects controller flight start without displacement', () => {
  const h = setup(); h.arm(); h.gestures.drag('orbit-drag', orbit(h.getCamera(), 0.1, 0));
  h.sample(pad({ pressed: [9] })); assert.equal(h.flight.active, false); assert.equal(h.gestures.openKind, 'orbit-drag');
  h.gestures.dragCommit('orbit-drag'); h.poll(); assert.equal(h.flight.active, false);
  h.sample(); h.sample(pad({ pressed: [9] })); assert.equal(h.flight.active, true);
});

test('controller stop is honoured while disarmed and requires neutral before new motion', () => {
  const h = setup(); h.arm(); h.flight.start();
  h.sample(pad({ axes: [0, -1, 0, 0], pressed: [1] }));
  assert.equal(h.flight.active, false); assert.equal(h.stops.at(-1), 'stop-key');
  h.sample(pad({ axes: [0, -1, 0, 0] })); assert.equal(h.previews(), 0);
});

test('a missing API or a throwing getGamepads reports unavailable and keyboard navigation still works', () => {
  for (const error of [null, Object.assign(new Error('denied'), { name: 'SecurityError' }), new Error('broken')]) {
    const h = setup(error ? { getGamepads: () => { throw error; } } : { getGamepads: undefined }); h.arm();
    assert.equal(h.input.status().state, 'unavailable');
    h.flight.start(); h.flight.keyDown('KeyW'); const before = h.getCamera(); h.poll(); h.flight.tick(h.clock.now());
    assert.notDeepEqual(h.getCamera(), before); assert.equal(h.flight.active, true);
  }
});

test('an API failure during a selected run commits once and requires neutral on recovery', () => {
  const h = setup(); h.arm(); h.sample(pad({ axes: [1, 0, 0, 0] }));
  const before = h.getCamera(); h.setPads(new Error('denied')); h.poll(); h.poll();
  assert.equal(h.commits(), 1); assert.deepEqual(h.stops, ['input-suspended']);
  h.sample(pad({ axes: [1, 0, 0, 0] })); assert.deepEqual(h.getCamera(), before);
  h.sample(); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.notDeepEqual(h.getCamera(), before);
});

test('Gamepad.timestamp is never used to suppress held motion', () => {
  const h = setup(), snapshot = pad({ axes: [1, 0, 0, 0] });
  Object.defineProperty(snapshot, 'timestamp', { get() { throw new Error('timestamp was read'); } });
  h.arm(); h.sample(snapshot); const before = h.getCamera(); h.poll(); assert.notDeepEqual(h.getCamera(), before);
});

test('neutral observation resets on renewed motion and triggers count as held motion in orbit mode', () => {
  const h = setup(); h.arm(); h.sample(pad({ axes: [1, 0, 0, 0] })); h.sample(); h.poll(150);
  h.sample(pad({ pressed: [6] })); h.poll(500); assert.equal(h.commits(), 0);
  h.sample(); h.poll(199); assert.equal(h.commits(), 0); h.poll(1); assert.equal(h.commits(), 1);
});

test('empty snapshots invite connection and a layout change loses eligibility without guessing axes', () => {
  const h = setup(); h.setPads([]); h.arm(); assert.equal(h.input.status().state, 'waiting');
  h.sample(); h.sample(pad({ axes: [1, 0, 0, 0] })); const before = h.getCamera();
  h.sample(pad({ mapping: '', axes: [1, 0, 0, 0] }));
  assert.equal(h.input.status().state, 'unsupported-layout'); assert.equal(h.commits(), 1);
  h.sample(pad({ axes: [1, 0, 0, 0] })); assert.deepEqual(h.getCamera(), before);
});

test('elapsed time is clamped and repeated, non-finite or backwards polls do not move the baseline', () => {
  const h = setup({ defaults: { maxElapsedMs: 40 } }); h.arm(); const before = h.getCamera();
  h.sample(pad({ axes: [1, 0, 0, 0] }), 1000); nearCamera(h.getCamera(), orbit(before, -Math.PI / 2 * 0.04, 0));
  const after = h.getCamera(); for (const now of [1000, 900, NaN, Infinity]) h.input.poll(now);
  assert.deepEqual(h.getCamera(), after); h.input.poll(1010); nearCamera(h.getCamera(), orbit(after, -Math.PI / 2 * 0.01, 0));
});

test('destroy is idempotent and prevents reads, transitions and resurrection', () => {
  const h = setup(); h.arm(); h.sample(pad({ axes: [1, 0, 0, 0] })); h.input.destroy();
  const reads = h.reads(), changes = h.transitions.length, stops = h.stops.length;
  h.input.destroy(); h.input.setEligible(true); h.poll();
  assert.equal(h.reads(), reads); assert.equal(h.transitions.length, changes); assert.equal(h.stops.length, stops);
  assert.equal(h.commits(), 1); assert.equal(h.gestures.openKind, null);
});

test('equal camera results open no gesture including a sign-negated orientation', () => {
  const h = setup({ cameraOps: { orbit: camera => ({ ...camera, orientationWxyz: camera.orientationWxyz.map(v => -v) }) } });
  h.arm(); h.sample(pad({ axes: [1, 0, 0, 0] })); assert.equal(h.previews(), 0); assert.equal(h.gestures.openKind, null);
});

test('analog flight combines keyboard input with capped world translation and speed-independent look', () => {
  const h = setup(); assert.equal(typeof h.actualFlight.setAnalogInput, 'function'); h.flight.start(); h.flight.keyDown('KeyW');
  h.flight.setAnalogInput({ forward: 1, strafe: 1, rise: 1, yaw: 0.5, pitch: -0.25 });
  const before = h.getCamera(); h.flight.tick(100); const after = h.getCamera();
  near(Math.hypot(...after.positionLocal.map((x, i) => x - before.positionLocal[i])), 0.1);
  const expected = flightStep(before, { yaw: Math.PI / 4, pitch: -Math.PI / 8 }, 0, 0.1);
  after.orientationWxyz.forEach((x, i) => near(x, expected.orientationWxyz[i]));
  const fast = setup(); fast.flight.setSpeed(100); fast.flight.start(); fast.flight.setAnalogInput({ yaw: 0.5, pitch: -0.25 }); fast.flight.tick(100);
  assert.deepEqual(fast.getCamera().orientationWxyz, after.orientationWxyz);
});

test('analog flight sanitizes and clamps demands and stop clears all input', () => {
  const h = setup(); assert.equal(typeof h.actualFlight.setAnalogInput, 'function'); h.flight.start();
  h.flight.setAnalogInput({ forward: NaN, strafe: Infinity, rise: undefined, yaw: NaN }); const before = h.getCamera();
  h.flight.tick(100); assert.deepEqual(h.getCamera(), before);
  h.flight.setAnalogInput({ rise: 99, yaw: -99 }); h.flight.tick(200);
  const expected = flightStep(before, { rise: 1, yaw: -Math.PI / 2 }, 1, 0.1); nearCamera(h.getCamera(), expected);
  h.flight.keyDown('KeyW'); h.flight.pointerLook(10, 10); h.flight.stop('disconnect');
  const after = h.getCamera(); h.flight.start(); h.flight.tick(100); assert.deepEqual(h.getCamera(), after);
});

test('custom dead zones, neutral interval and look rate are honoured', () => {
  assert.deepEqual(GAMEPAD_DEFAULTS, { stickDeadZone: 0.15, triggerDeadZone: 0.05, lookRadPerSec: Math.PI / 2,
    panFocusHeightsPerSec: 0.5, dollyDoublingsPerSec: 1, neutralCommitMs: 200, maxElapsedMs: 100 });
  const h = setup({ defaults: { stickDeadZone: 0.5, neutralCommitMs: 50, lookRadPerSec: 3 } }); h.arm();
  h.sample(pad({ axes: [0.4, 0, 0, 0] })); assert.equal(h.previews(), 0);
  h.sample(pad({ axes: [1, 0, 0, 0] })); h.sample(); h.poll(50); assert.equal(h.commits(), 1);
  h.sample(pad({ pressed: [9] })); h.sample(); const before = h.getCamera(); h.sample(pad({ axes: [0, 0, 1, 0] }), 100);
  h.flight.tick(h.clock.now()); nearCamera(h.getCamera(), flightStep(before, { yaw: -3 }, 1, 0.1));
});
