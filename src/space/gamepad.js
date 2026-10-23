// Snapshot input only: B14 polls before flight.tick; ineligible polls refresh
// connection status only. No DOM listeners, timer or animation loop live here.
import { dolly, equalCameras, orbit, pan, resetOrientation } from './camera.js';
import { FLIGHT_SPEED_LIMITS } from './flight.js';

export const GAMEPAD_DEFAULTS = Object.freeze({
  stickDeadZone: 0.15, triggerDeadZone: 0.05, lookRadPerSec: Math.PI / 2,
  panFocusHeightsPerSec: 0.5, dollyDoublingsPerSec: 1, neutralCommitMs: 200, maxElapsedMs: 100,
});
export const STANDARD_MAPPING = Object.freeze({
  axes: Object.freeze({ leftX: 0, leftY: 1, rightX: 2, rightY: 3 }),
  buttons: Object.freeze({ a: 0, stop: 1, reset: 3, slower: 4, faster: 5, leftTrigger: 6, rightTrigger: 7,
    overview: 8, toggleFlight: 9, up: 12, down: 13, left: 14, right: 15 }),
  labels: Object.freeze({ a: 'A', stop: 'B', reset: 'Y', slower: 'LB', faster: 'RB', leftTrigger: 'LT',
    rightTrigger: 'RT', overview: 'Back/View', toggleFlight: 'Start/Menu', up: 'D-pad up', down: 'D-pad down',
    left: 'D-pad left', right: 'D-pad right' }),
  signs: Object.freeze({ orbitYaw: -1, orbitPitch: 1, dolly: 1, panX: 1, forward: -1, strafe: 1, yaw: -1, pitch: -1 }),
});
const finite = value => Number.isFinite(value) ? value : 0;
const clamp = value => Math.max(-1, Math.min(1, value));
function checkDeadZone(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('dead zone must be in [0, 1)');
}
export function shapeStick(x, y, deadZone = GAMEPAD_DEFAULTS.stickDeadZone) {
  checkDeadZone(deadZone); x = finite(x); y = finite(y);
  const r = Math.hypot(x, y);
  if (r <= deadZone) return [0, 0];
  // Scaling also preserves direction if two finite components overflow hypot.
  const scale = Math.max(Math.abs(x), Math.abs(y)), norm = Math.hypot(x / scale, y / scale);
  const magnitude = ((Math.min(r, 1) - deadZone) / (1 - deadZone)) ** 2;
  return [x / scale / norm * magnitude, y / scale / norm * magnitude];
}
export function shapeTrigger(value, deadZone = GAMEPAD_DEFAULTS.triggerDeadZone) {
  checkDeadZone(deadZone); value = Math.max(0, Math.min(1, finite(value)));
  return value <= deadZone ? 0 : ((value - deadZone) / (1 - deadZone)) ** 2;
}

const emptyMotion = () => ({ orbitYaw: 0, orbitPitch: 0, dolly: 0, panX: 0, panY: 0, forward: 0, strafe: 0, rise: 0, yaw: 0, pitch: 0 });
const ACTIONS = ['a', 'stop', 'reset', 'slower', 'faster', 'overview', 'toggleFlight'];
function readSnapshot(gamepad, defaults) {
  const buttons = Object.fromEntries(ACTIONS.map(name => [name, false]));
  const status = !gamepad?.connected ? 'disconnected' : gamepad.mapping === 'standard' ? 'ok' : 'unsupported-layout';
  if (status !== 'ok') return { status, motion: emptyMotion(), buttons, neutral: false };
  const { axes: indices, buttons: indicesB, signs } = STANDARD_MAPPING;
  const axis = name => gamepad.axes?.[indices[name]];
  const pressed = name => gamepad.buttons?.[indicesB[name]]?.pressed === true;
  const [lx, ly] = shapeStick(axis('leftX'), axis('leftY'), defaults.stickDeadZone);
  const [rx, ry] = shapeStick(axis('rightX'), axis('rightY'), defaults.stickDeadZone);
  const lt = shapeTrigger(gamepad.buttons?.[indicesB.leftTrigger]?.value, defaults.triggerDeadZone);
  const rt = shapeTrigger(gamepad.buttons?.[indicesB.rightTrigger]?.value, defaults.triggerDeadZone);
  for (const name of ACTIONS) buttons[name] = pressed(name);
  const [up, down, left, right] = ['up', 'down', 'left', 'right'].map(name => Number(pressed(name)));
  return { status, buttons,
    motion: { orbitYaw: lx * signs.orbitYaw, orbitPitch: ly * signs.orbitPitch, dolly: ry * signs.dolly,
      panX: clamp(rx * signs.panX + right - left), panY: up - down,
      forward: ly * signs.forward, strafe: lx * signs.strafe, rise: rt - lt, yaw: rx * signs.yaw, pitch: ry * signs.pitch },
    // Neutral is measured before opposing controls cancel each other.
    neutral: [lx, ly, rx, ry, lt, rt, up, down, left, right].every(value => value === 0),
  };
}
export function decodeSnapshot(gamepad) {
  const { status, motion, buttons } = readSnapshot(gamepad, GAMEPAD_DEFAULTS);
  return { status, motion, buttons };
}

// Starts ineligible: B14 supplies activation/preparation/focus/editing eligibility.
// cameraOps.overview() must close over the current model and effective parameters;
// other cameraOps have the signatures in camera.js. No scene state is stored here.
export function createGamepadInput({ getGamepads, gestures, flight, getCamera, cameraOps = {},
  clock = () => performance.now(), defaults = {}, onStatus = () => {} }) {
  const config = { ...GAMEPAD_DEFAULTS, ...defaults };
  checkDeadZone(config.stickDeadZone); checkDeadZone(config.triggerDeadZone);
  for (const name of ['lookRadPerSec', 'panFocusHeightsPerSec', 'dollyDoublingsPerSec', 'neutralCommitMs', 'maxElapsedMs']) {
    if (!Number.isFinite(config[name]) || config[name] < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  }
  const now = typeof clock === 'function' ? clock : () => clock.now();
  const ops = { orbit, pan, dolly, resetOrientation, ...cameraOps };
  let eligible = false, destroyed = false, selected = null, armed = false, run = false;
  let previousButtons = {}, last = null, neutralSince = null, mode = flight.active;
  let analogLive = false, polling = false, pendingAnalog = null;
  let currentStatus = Object.freeze({ state: typeof getGamepads === 'function' ? 'waiting' : 'unavailable', id: null, index: null });
  function report(state, entry = null) {
    const status = { state, id: entry?.id ?? null, index: entry?.index ?? null };
    if (Object.keys(status).every(key => status[key] === currentStatus[key])) return;
    currentStatus = Object.freeze(status); onStatus(currentStatus);
  }
  function analog(input) {
    if (polling) pendingAnalog = input;
    else flight.setAnalogInput(input, { lookRadPerSec: config.lookRadPerSec });
    analogLive = Object.values(input).some(value => value !== 0);
  }
  function disarm() {
    armed = false; neutralSince = null;
    if (analogLive) analog({});
  }
  function commit() {
    if (!run) return;
    run = false; neutralSince = null;
    gestures.dragCommit('gamepad');
  }
  function stop(reason) {
    commit(); flight.stop(reason); disarm();
    mode = flight.active; last = null;
  }
  function releaseSelection(reason) {
    // Suspension already stopped navigation. Status-only polls must not stop a
    // keyboard flight that was independently restarted while we were ineligible.
    if (selected && eligible) stop(reason);
    selected = null; previousButtons = {}; disarm(); last = null;
  }
  function step(time) {
    let gamepads;
    try { gamepads = typeof getGamepads === 'function' ? getGamepads() : null; }
    catch { gamepads = null; }
    if (gamepads == null) { releaseSelection('input-suspended'); report('unavailable'); return; }
    const entries = Array.from(gamepads, (pad, slot) => ({ pad, id: pad?.id ?? '',
      index: Number.isInteger(pad?.index) && pad.index >= 0 ? pad.index : slot }))
      .filter(entry => entry.pad?.connected).sort((a, b) => a.index - b.index);
    let entry = selected && entries.find(value => value.index === selected.index && value.id === selected.id && value.pad.mapping === 'standard');
    if (selected && !entry) releaseSelection('disconnect');
    if (!entry) {
      entry = entries.find(value => value.pad.mapping === 'standard');
      if (!entry) { report(entries.length ? 'unsupported-layout' : 'waiting', entries[0]); return; }
      selected = { id: entry.id, index: entry.index }; disarm(); previousButtons = {}; last = null;
    }
    report('connected', entry);
    if (!eligible || destroyed) return;
    const elapsed = last === null ? 0 : Math.min(config.maxElapsedMs, Math.max(0, time - last)) / 1000;
    last = last === null ? time : Math.max(last, time);
    const sample = readSnapshot(entry.pad, config), { motion, buttons } = sample;
    const rising = name => buttons[name] && !previousButtons[name];
    const edges = Object.fromEntries(ACTIONS.map(name => [name, rising(name)]));
    previousButtons = buttons;
    if (mode !== flight.active) { commit(); disarm(); mode = flight.active; }
    if (run && gestures.openKind !== 'gamepad') { run = false; disarm(); }
    // Stop is a safety action even while waiting for neutral or another owner.
    if (edges.stop) { stop('stop-key'); return; }
    const owner = gestures.openKind;
    if (owner && owner !== 'gamepad' && !(owner === 'flight' && flight.active)) { disarm(); return; }
    if (!armed) {
      if (sample.neutral && !Object.values(buttons).some(Boolean)) armed = true;
      return; // Discovery/re-arming never navigates.
    }
    if (edges.overview || edges.reset) {
      const operation = edges.overview ? ops.overview : ops.resetOrientation;
      // Overview's model-bound callback is supplied by the workspace.
      if (typeof operation !== 'function') return;
      disarm(); run = false; neutralSince = null;
      const kind = edges.overview ? 'overview' : 'orientation-reset';
      // settle stops navigation before computing and applying the jump. apply
      // itself also settles by B12 contract, including a semantic no-op jump.
      gestures.settle(kind);
      const camera = edges.overview ? operation() : operation(getCamera());
      gestures.apply([{ type: 'setCamera', camera }], kind);
      mode = flight.active; return;
    }
    if (edges.toggleFlight) {
      if (flight.active) stop('stop-key');
      else { commit(); flight.start(); disarm(); mode = flight.active; }
      return; // A refused start needs neutral before another attempt.
    }
    if (edges.slower || edges.faster) {
      const speed = flight.speed * (edges.slower ? 0.5 : 1) * (edges.faster ? 2 : 1);
      flight.setSpeed(Math.max(FLIGHT_SPEED_LIMITS.min, Math.min(FLIGHT_SPEED_LIMITS.max, speed)));
    }
    if (flight.active) {
      analog(Object.fromEntries(['forward', 'strafe', 'rise', 'yaw', 'pitch'].map(name => [name, motion[name]])));
      return; // Flight.tick is the sole flight camera writer.
    }
    if (sample.neutral) {
      if (run) {
        neutralSince ??= last;
        if (last - neutralSince >= config.neutralCommitMs) commit();
      }
      return;
    }
    neutralSince = null;
    if (!elapsed) return;
    const camera = getCamera(); let next = camera;
    if (motion.orbitYaw || motion.orbitPitch) next = ops.orbit(next, motion.orbitYaw * config.lookRadPerSec * elapsed, motion.orbitPitch * config.lookRadPerSec * elapsed);
    if (motion.dolly) next = ops.dolly(next, 2 ** (motion.dolly * config.dollyDoublingsPerSec * elapsed));
    if (motion.panX || motion.panY) {
      const height = 2 * Math.hypot(...next.positionLocal.map((x, i) => x - next.focusLocal[i])) * Math.tan(next.verticalFovDegrees * Math.PI / 360);
      const distance = height * config.panFocusHeightsPerSec * elapsed;
      next = ops.pan(next, motion.panX * distance, motion.panY * distance);
    }
    if (equalCameras(camera, next)) return;
    // B12 drag can replace an open group: openKind above prevents that. A false
    // acceptance is not ownership; disarm until neutral instead of retrying a
    // held control every frame. No local run/history state is opened on refusal.
    if (gestures.drag('gamepad', next) === false) { run = false; disarm(); return; }
    run = true;
  }
  return Object.freeze({
    poll(time = now()) {
      if (destroyed || !Number.isFinite(time)) return;
      polling = true; pendingAnalog = null;
      try { step(time); }
      finally {
        polling = false;
        if (pendingAnalog !== null) flight.setAnalogInput(pendingAnalog, { lookRadPerSec: config.lookRadPerSec });
        pendingAnalog = null;
      }
    },
    setEligible(value, reason = 'input-suspended') {
      if (destroyed || eligible === Boolean(value)) return;
      eligible = Boolean(value);
      // The caller's detailed eligibility reason is workspace metadata. Flight
      // receives the explicit B12b vocabulary, not arbitrary DOM reason strings.
      if (!eligible) stop('input-suspended');
      else { disarm(); last = null; mode = flight.active; }
      previousButtons = {};
    },
    status: () => currentStatus,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (eligible || run || analogLive) stop('input-suspended');
      eligible = false; selected = null; previousButtons = {};
    },
  });
}
