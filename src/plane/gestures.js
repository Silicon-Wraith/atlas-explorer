// Gesture ownership for one workspace's history (spec §6). Direct gestures (a slider drag, a
// pointer drag or pinch, a wheel burst or key-repeat run) and automated motion (the tour, the
// palette animation) have explicit owners:
// - a direct gesture stops automated motion before its first preview;
// - automated motion never begins while a direct gesture is open, so it cannot commit one;
// - the palette animation joins whichever gesture is open, otherwise it opens its own;
// - discrete actions and history steps settle the open gesture first.
export const DIRECT_KINDS = Object.freeze(['slider', 'navigation-drag', 'navigation-grouped']);

export function createGestureArbiter({ history, onTransition, stopAutomated = () => {}, groupQuietMs = 200, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let open = null, timer = null;
  const isOpen = () => open !== null && history.snapshot().gesture === open.kind;
  const begin = kind => { open = { id: history.begin({ kind }), kind }; return open.id; };
  const clearGroupTimer = () => { if (timer !== null) { clearTimer(timer); timer = null; } };

  function preview(kind, command, interactive = false) {
    if (DIRECT_KINDS.includes(kind)) stopAutomated(kind);
    if (!(isOpen() && open.kind === kind)) begin(kind);
    onTransition(history.update(open.id, command), interactive);
  }
  // A wheel step or repeated key: one gesture, committed after `groupQuietMs` without input.
  function grouped(command, interactive = true) {
    preview('navigation-grouped', command, interactive);
    clearGroupTimer();
    timer = setTimer(() => { timer = null; commit('navigation-grouped'); }, groupQuietMs);
  }
  // Automated motion (a tour frame). Returns false, and does nothing, while a direct gesture is open.
  function automate(kind, command, interactive = false) {
    if (isOpen() && DIRECT_KINDS.includes(open.kind)) return false;
    if (!(isOpen() && open.kind === kind)) begin(kind);
    onTransition(history.update(open.id, command), interactive);
    return true;
  }
  function animate(command) {
    if (!isOpen()) begin('animation');
    onTransition(history.update(open.id, command), false);
  }
  function commit(kind) {
    if (!open || (kind && open.kind !== kind)) return;
    if (open.kind === 'navigation-grouped') clearGroupTimer();
    if (isOpen()) onTransition(history.commit(open.id), false);
    open = null;
  }
  function settle() {
    clearGroupTimer();
    if (isOpen()) onTransition(history.commit(open.id), false);
    open = null;
  }
  function apply(commands, kind, interactive = false) {
    settle();
    onTransition(history.apply(commands, { kind }), interactive);
  }
  // undo, redo, back, forward → the transition, or null when there is nothing to do.
  function step(action, interactive = false) {
    settle();
    const transition = history[action]();
    if (transition) onTransition(transition, interactive);
    return transition;
  }
  return Object.freeze({ preview, grouped, automate, animate, commit, settle, apply, step, get openKind() { return isOpen() ? open.kind : null; } });
}
