// Space input owns gestures; shared history owns validated scenes and both stacks.
import { equalCameras } from './camera.js';

export const SPACE_KINDS = Object.freeze(['orbit-drag', 'pan-drag', 'wheel-dolly', 'key-nudge', 'flight', 'focus', 'gamepad']);
const DRAGS = ['orbit-drag', 'pan-drag', 'gamepad'];
const GROUPS = ['wheel-dolly', 'key-nudge'];

// stopNavigation(reason) receives lifecycle reasons (escape, blur, hidden,
// deactivate, history), handoff reasons (pointer, flight), scene-replacement,
// or the caller's discrete action kind (e.g. appearance, parameters, focus,
// overview). This vocabulary is intentionally broader than flight.stop's.
// The workspace maps action/handoff kinds and scene-replacement to 'history'
// when calling flight.stop, preserving explicit flight exit reasons otherwise.
// Every apply stops navigation and settles its preview BEFORE executing commands,
// including content-only edits, empty commands and semantic camera no-ops.
// This keeps discrete editing separate from a running flight history entry.
export function createSpaceGestures({ history, onTransition = () => {}, stopNavigation = () => {},
  groupQuietMs = 200, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let open = null, timer = null, timerVersion = 0, stopping = false;
  const current = () => history.snapshot().scene.camera;
  const owns = kind => open !== null && open.kind === kind && history.snapshot().gesture === kind;
  function clearGroup() {
    timerVersion++;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function close(kind, cancel = false) {
    if (!open || (kind && kind !== open.kind)) return false;
    clearGroup();
    const previous = open, active = owns(previous.kind);
    open = null; // A transition listener may stop input; it cannot close this twice.
    if (active) {
      let transition;
      try { transition = history[cancel ? 'cancel' : 'commit'](previous.id); }
      catch (error) { if (error.code === 'stale-gesture') return false; throw error; }
      onTransition(transition, false);
    }
    return active;
  }
  function begin(kind) {
    close();
    open = { kind, id: history.begin({ kind }) };
  }
  function preview(kind, camera) {
    if (equalCameras(current(), camera)) return false;
    if (!owns(kind)) begin(kind);
    let transition;
    try { transition = history.update(open.id, { type: 'setCamera', camera }); }
    catch (error) {
      if (error.code !== 'stale-gesture') throw error;
      // A caller may have committed directly on history and opened another run
      // with the same kind. The old token must neither update nor close it.
      open = null; clearGroup(); return false;
    }
    onTransition(transition, true);
    return true;
  }
  function drag(kind, camera) {
    if (!DRAGS.includes(kind)) throw new RangeError(`unknown Space drag: ${kind}`);
    if (owns('flight')) return false;
    // A pointer may have been pressed before the controller's first preview,
    // then moved later. Its delayed drag must not take over the controller run.
    if (kind !== 'gamepad' && owns('gamepad')) return false;
    return preview(kind, camera);
  }
  function grouped(kind, camera) {
    if (!GROUPS.includes(kind)) throw new RangeError(`unknown Space group: ${kind}`);
    if (open && (owns('flight') || DRAGS.includes(open.kind))) return false;
    const changed = preview(kind, camera);
    if (!owns(kind)) return false;
    clearGroup();
    const version = timerVersion, id = open.id;
    timer = setTimer(() => {
      if (version !== timerVersion || open?.id !== id) return;
      timer = null; close(kind);
    }, groupQuietMs);
    return changed;
  }
  // Workspace stopNavigation stops flight and releases capture. That release may
  // call back into settle; finish the outer operation without recursive stopping.
  function settle(reason = 'history') {
    if (!stopping) {
      stopping = true;
      try { stopNavigation(reason); } finally { stopping = false; }
    }
    clearGroup(); close();
  }
  function apply(commands, kind = 'edit') {
    settle(commands.some(command => command.type === 'restoreScene') ? 'scene-replacement' : kind);
    // Semantic equality belongs at this Space boundary, never in cache identity.
    if (commands.length && commands.every(command => command.type === 'setCamera' && equalCameras(current(), command.camera))) return false;
    if (!commands.length) return false;
    const transition = history.apply(commands, { kind });
    onTransition(transition, false);
    return transition;
  }
  function step(action) {
    settle('history');
    const transition = history[action]();
    if (transition) onTransition(transition, false);
    return transition;
  }
  return Object.freeze({
    drag, dragCommit: kind => close(kind), dragCancel: kind => close(kind, true), grouped,
    flightStart() {
      if (open && owns(open.kind)) return owns('flight');
      begin('flight'); return true;
    },
    flightUpdate(camera) { return owns('flight') ? preview('flight', camera) : false; },
    flightEnd: () => close('flight'),
    focusApply(camera) {
      if (equalCameras(current(), camera)) return false;
      return apply([{ type: 'setCamera', camera }], 'focus');
    },
    apply, undo: () => step('undo'), redo: () => step('redo'), back: () => step('back'), forward: () => step('forward'), settle,
    get openKind() { return open && owns(open.kind) ? open.kind : null; },
  });
}
