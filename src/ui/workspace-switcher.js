// The workspace switcher (spec §13.1, §15; plan B14): two retained investigations, one active view.
// Every switch takes a monotonically increasing activation token and deactivates the visible workspace
// and any superseded pending one (closing input admission, invalidating pending activation), then
// activates the next. The visible workspace stays on screen while the next one prepares (spec §15:
// "the current view stays"): `body[data-workspace-pending]` marks the pending activation so the shell
// can show its preparation status, and only the latest token's successful activation commits
// visibility and focus. A failed activation reports "<Name> unavailable: <reason>" and reactivates the
// previous workspace, which never left the screen, only while that activation is still the latest; a
// cancelled activation (its first render was cancelled) reactivates it without a report.
//   createWorkspaceSwitcher({root, workspaces: {plane, space}, initial: 'plane', toast?})
//     → {ready, switchTo(id) → Promise<{activeId, outcome, reason?}>, current(), pending(), destroy()}
const NAMES = Object.freeze({ plane: 'Plane', space: 'Space' });

export function createWorkspaceSwitcher({ root = document, workspaces, initial = 'plane', toast = () => {} }) {
  if (!workspaces?.[initial]) throw new TypeError(`unknown initial workspace ${initial}`);
  let token = 0, visible = null, pendingId = null, stable = initial, destroyed = false;
  const body = root.body ?? root;
  const buttons = Object.keys(workspaces).map(id => [id, root.querySelector(`#switch-${id}`)]).filter(([, button]) => button);
  const listeners = buttons.map(([id, button]) => { const listener = () => { switchTo(id); }; button.addEventListener('click', listener); return [button, listener]; });

  function show(id) {
    visible = id;
    body.dataset.workspace = id;
    for (const [other, button] of buttons) { button.setAttribute('aria-pressed', String(other === id)); button.classList.toggle('active', other === id); }
  }
  function markPending(id) {
    pendingId = id;
    if (id && id !== visible) body.dataset.workspacePending = id; else delete body.dataset.workspacePending;
  }
  async function switchTo(id, { restoring = false } = {}) {
    if (destroyed) return Object.freeze({ activeId: visible, outcome: 'destroyed' });
    if (!workspaces[id]) throw new RangeError(`unknown workspace ${id}`);
    const mine = ++token;
    // The visible workspace and any superseded pending one: input closes, pending activation is invalidated.
    for (const other of new Set([visible, pendingId])) if (other && other !== id) workspaces[other].deactivate();
    if (visible === null) show(id);
    markPending(id);
    let result;
    try { result = await workspaces[id].activate(mine); }
    catch (error) { result = { outcome: 'unavailable', reason: error?.message ?? String(error) }; }
    if (mine !== token || destroyed) return Object.freeze({ activeId: visible, outcome: 'superseded' });
    markPending(null);
    if (result?.outcome === 'activated') {
      stable = id;
      show(id);
      workspaces[id].focus?.();
      return Object.freeze({ activeId: id, outcome: 'activated' });
    }
    // A cancelled activation (B14-r3 F11) is not a failure: nothing is reported, and the previous
    // workspace, which never left the screen, is reactivated.
    const cancelled = result?.outcome === 'cancelled';
    const reason = cancelled ? 'cancelled' : result?.reason ?? result?.outcome ?? 'unknown';
    if (!cancelled) toast(`${NAMES[id] ?? id} unavailable: ${reason}`);
    const fallback = stable !== id ? stable : Object.keys(workspaces).find(other => other !== id);
    const failed = cancelled ? 'cancelled' : 'unavailable';
    if (restoring || !fallback) return Object.freeze({ activeId: id, outcome: failed, reason });
    const restored = await switchTo(fallback, { restoring: true });
    return Object.freeze({ activeId: restored.activeId, outcome: restored.outcome === 'activated' ? failed : restored.outcome, reason });
  }
  const ready = switchTo(initial);
  return Object.freeze({
    ready, switchTo: id => switchTo(id), current: () => visible, pending: () => pendingId,
    destroy() {
      if (destroyed) return;
      destroyed = true; token++; markPending(null);
      for (const [button, listener] of listeners) button.removeEventListener('click', listener);
    },
  });
}
