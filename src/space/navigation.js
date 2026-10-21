// DOM input translates into Space camera operations; no renderer or GPU is owned
// here. B14 supplies the currently pickable publication through getPickContext.
import { canonicalJson } from '../shared/scene.js';
import { dolly, equalCameras, lookAt, orbit, pan, reconstructHit, toLocal } from './camera.js';
import { createPickRequest } from './render/backend.js';
import { STATUS_LABELS, RAY_STATUS } from './render/status.js';

export function cameraStatus({ cpu, effective }) {
  return {
    status: cpu?.status === 'exterior' && !cpu.stale && !cpu.unavailable &&
      effective?.status === 'exterior' && !effective.stale && !effective.unavailable ? 'exterior' : 'unresolved',
    detail: { cpu, effective },
  };
}

const editable = target => target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target?.tagName ?? '') ||
  Boolean(target?.closest?.('[contenteditable="true"], [role="dialog"]'));
const coincident = camera => camera.positionLocal.every((value, i) => value === camera.focusLocal[i]);
const focusHeight = camera => 2 * Math.hypot(...camera.positionLocal.map((x, i) => x - camera.focusLocal[i])) *
  Math.tan(camera.verticalFovDegrees * Math.PI / 360);
const same = (a, b) => canonicalJson(a) === canonicalJson(b);

// getPickContext() -> {identity, geometryRevision, dimensions, sampleIndex} | null.
// It must describe the currently eligible published geometry and return null
// when inactive/pending. Re-read after await: equal camera values alone cannot
// detect replacement by a newer scene, epoch, appearance or activation.
export function bindSpaceNavigation({ surface, gestures, flight, getCamera, pick,
  getPickContext = () => null, onStatus = () => {} }) {
  const document = surface.ownerDocument ?? globalThis.document;
  const window = document?.defaultView ?? globalThis.window;
  const listeners = [], pointers = new Map();
  let destroyed = false, resetting = false, inputVersion = 0;
  function listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener?.(type, handler, options));
  }
  const rect = () => surface.getBoundingClientRect?.() ?? { left: 0, top: 0, width: surface.clientWidth, height: surface.clientHeight };
  const unresolved = reason => onStatus({ status: 'unresolved', reason });
  function canMove() {
    if (!coincident(getCamera())) return true;
    onStatus({ status: 'unresolved', reason: 'coincident-camera', actions: ['overview'] });
    return false;
  }
  function release(id) { try { surface.releasePointerCapture?.(id); } catch { /* capture already lost */ } }
  function reset(reason = 'deactivate') {
    if (resetting) return 0;
    resetting = true; inputVersion++;
    const captured = [...pointers.keys()];
    pointers.clear(); // Synchronous lostpointercapture must not cancel the commit.
    try {
      flight.stop(reason);
      gestures.settle(reason);
      for (const id of captured) release(id);
    } finally { resetting = false; }
    return captured.length;
  }
  listen(surface, 'pointerdown', event => {
    if (destroyed || editable(event.target) || pointers.size || ![0, 2].includes(event.button)) return;
    inputVersion++;
    const kind = flight.active ? 'flight' : event.button === 2 || event.shiftKey ? 'pan-drag' : 'orbit-drag';
    if (kind !== 'flight' && !canMove()) return;
    if (gestures.openKind && gestures.openKind !== 'flight') gestures.settle('pointer');
    surface.focus?.({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, kind });
    surface.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
  });
  listen(surface, 'pointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer || destroyed) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer.x = event.clientX; pointer.y = event.clientY;
    if ((!dx && !dy) || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    inputVersion++;
    if (pointer.kind === 'flight') { flight.pointerLook(dx, dy); return; }
    const bounds = rect(), camera = getCamera();
    if (!(bounds.height > 0) || !canMove()) return;
    const next = pointer.kind === 'pan-drag'
      ? pan(camera, -dx * focusHeight(camera) / bounds.height, dy * focusHeight(camera) / bounds.height)
      : orbit(camera, -dx * 2 * Math.PI / bounds.height, dy * Math.PI / bounds.height);
    gestures.drag(pointer.kind, next);
  });
  function finishPointer(event, cancel) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId); inputVersion++;
    if (pointer.kind !== 'flight') gestures[cancel ? 'dragCancel' : 'dragCommit'](pointer.kind);
    release(event.pointerId);
  }
  listen(surface, 'pointerup', event => finishPointer(event, false));
  listen(surface, 'pointercancel', event => finishPointer(event, true));
  listen(surface, 'lostpointercapture', event => finishPointer(event, false));
  listen(surface, 'contextmenu', event => event.preventDefault?.());
  listen(surface, 'wheel', event => {
    if (destroyed || editable(event.target) || flight.active || pointers.size) return;
    event.preventDefault?.(); inputVersion++;
    if (!canMove()) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect().height : 1);
    if (!Number.isFinite(delta) || delta === 0) return;
    gestures.grouped('wheel-dolly', dolly(getCamera(), Math.exp(Math.max(-160, Math.min(160, delta)) * 0.002)));
  }, { passive: false });

  function keyDown(event) {
    const code = event.code;
    if (code === 'Escape') { event.preventDefault?.(); reset('escape'); return; }
    if (destroyed || editable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (code === 'KeyF') {
      if (event.repeat) return;
      event.preventDefault?.(); inputVersion++;
      if (!flight.active) { if (!canMove()) return; gestures.settle('flight'); }
      flight.toggle(); return;
    }
    if (flight.active) {
      if (flight.keyDown(code)) { event.preventDefault?.(); inputVersion++; }
      return;
    }
    if (pointers.size) return;
    const camera = getCamera();
    const operations = {
      ArrowLeft: () => pan(camera, -0.08 * focusHeight(camera), 0),
      ArrowRight: () => pan(camera, 0.08 * focusHeight(camera), 0),
      ArrowUp: () => pan(camera, 0, 0.08 * focusHeight(camera)),
      ArrowDown: () => pan(camera, 0, -0.08 * focusHeight(camera)),
      Equal: () => dolly(camera, 0.5), NumpadAdd: () => dolly(camera, 0.5),
      Minus: () => dolly(camera, 2), NumpadSubtract: () => dolly(camera, 2),
    };
    if (!Object.hasOwn(operations, code)) return;
    event.preventDefault?.(); inputVersion++;
    if (canMove()) gestures.grouped('key-nudge', operations[code]());
  }
  listen(surface, 'keydown', keyDown);
  // Escape and releases also work after focus moved away from the viewport.
  listen(window, 'keydown', event => { if (event.code === 'Escape' && !event.defaultPrevented) reset('escape'); });
  listen(surface, 'keyup', event => flight.keyUp(event.code));
  listen(window, 'keyup', event => flight.keyUp(event.code));
  listen(window, 'blur', () => reset('blur'));
  listen(document, 'visibilitychange', () => { if (document.hidden || document.visibilityState === 'hidden') reset('hidden'); });

  listen(surface, 'dblclick', async event => {
    if (destroyed || editable(event.target) || flight.active || pointers.size) return;
    const version = ++inputVersion, camera = getCamera(), bounds = rect();
    let request;
    try {
      const context = getPickContext();
      if (!context || typeof pick !== 'function') { unresolved('pick-unavailable'); return; }
      if (!(bounds.width > 0 && bounds.height > 0)) return;
      const pixel = [Math.floor((event.clientX - bounds.left) * context.dimensions.width / bounds.width),
        Math.floor((event.clientY - bounds.top) * context.dimensions.height / bounds.height)];
      // CSS borders can map to exactly width/height. Pick the nearest edge pixel.
      pixel[0] = Math.max(0, Math.min(context.dimensions.width - 1, pixel[0]));
      pixel[1] = Math.max(0, Math.min(context.dimensions.height - 1, pixel[1]));
      request = createPickRequest({ ...context, pixel });
      const result = await pick(request);
      if (destroyed || version !== inputVersion) return;
      const currentContext = getPickContext();
      if (!currentContext || !same(createPickRequest({ ...currentContext, pixel }), request) || !equalCameras(camera, getCamera())) return;
      if (result?.unavailable) { unresolved(result.reason); return; }
      if (!result || result.stale || result.status !== STATUS_LABELS.ray[RAY_STATUS.hit]) { unresolved(result?.status ?? 'stale-pick'); return; }
      if (!same(result.identity, request.identity)) return;
      const sample = result.sample;
      if (!sample || !same(sample.pixel, request.pixel) || !same(sample.dimensions, request.dimensions)) { unresolved('stale-sample'); return; }
      const hit = reconstructHit(sample.camera, sample.pixel, sample.jitter, result.depth, sample.dimensions.width, sample.dimensions.height);
      if (hit.unavailable) { unresolved(hit.reason); return; }
      const local = toLocal(getCamera(), hit);
      if (local.unavailable) { unresolved(local.reason); return; }
      gestures.focusApply(lookAt(getCamera(), local));
    } catch {
      // Rejected readback, invalid sample data and unrepresentable picks all leave
      // the pose alone. No history gesture is opened until the complete check.
      if (!destroyed && version === inputVersion) unresolved('pick-unavailable');
    }
  });
  canMove();
  return Object.freeze({
    reset,
    destroy() {
      if (destroyed) return;
      destroyed = true; reset('deactivate');
      for (const remove of listeners) remove();
      listeners.length = 0;
    },
  });
}
