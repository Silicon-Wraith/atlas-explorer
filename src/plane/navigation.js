// Plane pointer, wheel, touch and key navigation (unchanged behaviour, spec §4.3).
// It computes the next view; the workspace decides how each move enters history.
import { moveView, zoomView } from './math.js';

// x/y offsets from the viewport centre in units of viewport width.
export function pointAt(clientX, clientY, width = innerWidth, height = innerHeight) {
  return [(clientX - width / 2) / width, (height / 2 - clientY) / width];
}

// The view a navigation key leads to, or null for any other key.
export function navigationKey(key, view) {
  switch (key) {
    case '+': case '=': return zoomView(view, view.zoom + Math.log10(2));
    case '-': return zoomView(view, view.zoom - Math.log10(2));
    case 'arrowleft': return moveView(view, -.08, 0);
    case 'arrowright': return moveView(view, .08, 0);
    case 'arrowup': return moveView(view, 0, .08);
    case 'arrowdown': return moveView(view, 0, -.08);
    default: return null;
  }
}

// onPointerStart(first): every pointer press, with `first` true when the pointer set was empty — the
// first pointer settles earlier activity, a further finger joins the open drag or pinch (plan
// amendment G(1)); grouped: wheel steps; drag: pointer and pinch moves; dragEnd: the last tracked
// pointer released; jump: double-click.
// → { reset() → the number of pointers forgotten }
export function bindPlaneNavigation({ surface, getCanvas, getView, onPointerStart, grouped, drag, dragEnd, jump }) {
  surface.addEventListener('wheel', event => {
    event.preventDefault();
    const view = getView();
    const [x, y] = pointAt(event.clientX, event.clientY);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    grouped(zoomView(view, view.zoom - Math.max(-160, Math.min(160, delta)) * .0015, x, y));
  }, { passive: false });
  surface.addEventListener('dblclick', event => { const view = getView(); const [x, y] = pointAt(event.clientX, event.clientY); jump(zoomView(view, view.zoom + Math.log10(4), x, y)); });
  const pointers = new Map();
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    onPointerStart(pointers.size === 0); getCanvas().focus({ preventScroll: true }); surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); getCanvas().classList.add('dragging');
  });
  surface.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const view = getView();
    const before = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      drag(moveView(view, (old.x - event.clientX) / innerWidth, (event.clientY - old.y) / innerWidth));
    } else if (pointers.size === 2) {
      const after = [...pointers.values()];
      const distance = values => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      const mid = values => ({ x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 });
      const previous = mid(before), current = mid(after);
      const [x, y] = pointAt(previous.x, previous.y);
      const next = zoomView(view, view.zoom + Math.log10(Math.max(1, distance(after)) / Math.max(1, distance(before))), x, y);
      drag(moveView(next, (previous.x - current.x) / innerWidth, (current.y - previous.y) / innerWidth));
    }
  });
  // Only a tracked pointer ends the drag: a pointer forgotten by reset() (whose capture release the
  // browser answers with lostpointercapture) neither navigates nor commits anything.
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(type, event => {
    if (!pointers.delete(event.pointerId)) return;
    if (!pointers.size) { getCanvas().classList.remove('dragging'); dragEnd(); }
  });
  // A history step (undo, redo, back, forward; T05 fix round 1's stopPointers): forget active
  // pointers and release their capture, so later movement of a still-pressed pointer cannot resume
  // navigation and its release records no pose.
  return Object.freeze({
    reset() {
      const captured = [...pointers.keys()];
      pointers.clear();
      for (const pointerId of captured) { try { surface.releasePointerCapture(pointerId); } catch { /* already released */ } }
      getCanvas().classList.remove('dragging');
      return captured.length;
    },
  });
}
