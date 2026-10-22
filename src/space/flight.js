// No animation loop here: the workspace calls tick once per frame. Translation
// speed is camera-local units/second; pointer look is radians/pixel, not speed.
import { basis, equalCameras, flightStep } from './camera.js';

export const FLIGHT_SPEED_LIMITS = Object.freeze({ min: 0.000001, max: 1000000 });
const LOOK_RADIANS_PER_PIXEL = 0.003;
const MOVE_KEYS = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createFlight({ getCamera, setCamera, clock = () => performance.now(), onStart = () => {}, onStop = () => {} }) {
  const now = typeof clock === 'function' ? clock : () => clock.now();
  const keys = new Set();
  let analog = {}, analogLookRate = Math.PI / 2;
  let active = false, speed = 1, last = null, lookX = 0, lookY = 0;
  const clearInput = () => { keys.clear(); analog = {}; lookX = 0; lookY = 0; last = null; };
  function start() {
    if (active) return true;
    clearInput();
    if (onStart() === false) return false;
    last = now(); active = true;
    return true;
  }
  // Flight exit reasons: escape, blur, hidden, stop-key, deactivate, history,
  // disconnect, input-suspended.
  // The workspace maps gestures' richer action kinds to history (gestures.js).
  // The reason is notification metadata, forwarded without runtime validation;
  // every stop clears demands immediately regardless of the supplied reason.
  function stop(reason = 'stop-key') {
    const wasActive = active;
    active = false; clearInput();
    if (wasActive) onStop(reason);
    return wasActive;
  }
  const held = (...codes) => Number(codes.some(code => keys.has(code)));
  function tick(time = now()) {
    if (!active || !Number.isFinite(time)) return false;
    const elapsed = Math.min(100, Math.max(0, time - last)) / 1000;
    last = Math.max(time, last);
    if (!elapsed) return false;
    const input = {
      forward: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown') + (analog.forward ?? 0),
      strafe: held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft') + (analog.strafe ?? 0),
      rise: held('KeyE') - held('KeyQ') + (analog.rise ?? 0),
      yaw: -lookX * LOOK_RADIANS_PER_PIXEL / elapsed + (analog.yaw ?? 0) * analogLookRate,
      pitch: -lookY * LOOK_RADIANS_PER_PIXEL / elapsed + (analog.pitch ?? 0) * analogLookRate,
    };
    lookX = 0; lookY = 0;
    if (Object.values(input).every(value => value === 0)) return false;
    const camera = getCamera();
    // Cap the actual combined world direction, including a pitched forward and
    // world-Z rise. Normalizing just the key vector would allow faster diagonals.
    const turned = input.yaw || input.pitch ? flightStep(camera, { yaw: input.yaw, pitch: input.pitch }, 0, elapsed) : camera;
    const { forward, right } = basis(turned);
    const magnitude = Math.max(1, Math.hypot(...forward.map((x, i) => input.forward * x + input.strafe * right[i] + (i === 2 ? input.rise : 0))));
    for (const axis of ['forward', 'strafe', 'rise']) input[axis] /= magnitude;
    const next = flightStep(camera, input, speed, elapsed);
    if (equalCameras(camera, next)) return false;
    if (setCamera(next) === false) { stop('history'); return false; }
    return true;
  }
  return Object.freeze({
    start, toggle: () => active ? stop('stop-key') : start(), stop, tick,
    keyDown(code) { if (!active || !MOVE_KEYS.has(code)) return false; keys.add(code); return true; },
    keyUp(code) { return keys.delete(code); },
    pointerLook(dx, dy) {
      if (!active || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
      lookX += dx; lookY += dy; return true;
    },
    // Demands remain normalized; the optional angular rate lets the controller
    // honour lookRadPerSec without coupling turning to translation speed.
    setAnalogInput(input = {}, { lookRadPerSec = Math.PI / 2 } = {}) {
      if (!Number.isFinite(lookRadPerSec) || lookRadPerSec < 0) throw new RangeError('analog look rate must be finite and nonnegative');
      analogLookRate = lookRadPerSec;
      analog = Object.fromEntries(['forward', 'strafe', 'rise', 'yaw', 'pitch'].map(axis =>
        [axis, Number.isFinite(input?.[axis]) ? Math.max(-1, Math.min(1, input[axis])) : 0]));
    },
    setSpeed(localUnitsPerSecond) {
      if (!Number.isFinite(localUnitsPerSecond) || localUnitsPerSecond < FLIGHT_SPEED_LIMITS.min || localUnitsPerSecond > FLIGHT_SPEED_LIMITS.max) {
        throw new RangeError(`flight speed must be in [${FLIGHT_SPEED_LIMITS.min}, ${FLIGHT_SPEED_LIMITS.max}] local units per second`);
      }
      speed = localUnitsPerSecond;
    },
    get speed() { return speed; }, get active() { return active; },
  });
}
