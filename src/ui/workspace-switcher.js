// The workspace switcher (spec §13.1; plan B14): two retained investigations, one active view.
// Every switch takes a monotonically increasing activation token, deactivates the current workspace,
// then activates the next. Only the latest token may commit visibility, focus or publication; a
// workspace's own activate(token) ignores a token that is no longer current. A failed activation
// reports "<Name> unavailable: <reason>" and restores the previous workspace only while that
// activation is still the latest.
//   createWorkspaceSwitcher({root, workspaces: {plane, space}, initial: 'plane', toast?})
//     → {ready, switchTo(id) → Promise<{activeId, outcome, reason?}>, current(), destroy()}
const NAMES = Object.freeze({ plane: 'Plane', space: 'Space' });

export function createWorkspaceSwitcher({ root = document, workspaces, initial = 'plane', toast = () => {} }) {
  if (!workspaces?.[initial]) throw new TypeError(`unknown initial workspace ${initial}`);
  let token = 0, visible = null, stable = initial, destroyed = false;
  const body = root.body ?? root;
  const buttons = Object.keys(workspaces).map(id => [id, root.querySelector(`#switch-${id}`)]).filter(([, button]) => button);
  const listeners = buttons.map(([id, button]) => { const listener = () => { switchTo(id); }; button.addEventListener('click', listener); return [button, listener]; });

  function show(id) {
    visible = id;
    body.dataset.workspace = id;
    for (const [other, button] of buttons) { button.setAttribute('aria-pressed', String(other === id)); button.classList.toggle('active', other === id); }
  }
  async function switchTo(id, { restoring = false } = {}) {
    if (destroyed) return Object.freeze({ activeId: visible, outcome: 'destroyed' });
    if (!workspaces[id]) throw new RangeError(`unknown workspace ${id}`);
    const mine = ++token, previous = visible;
    if (previous && previous !== id) workspaces[previous].deactivate();
    show(id);
    let result;
    try { result = await workspaces[id].activate(mine); }
    catch (error) { result = { outcome: 'unavailable', reason: error?.message ?? String(error) }; }
    if (mine !== token || destroyed) return Object.freeze({ activeId: visible, outcome: 'superseded' });
    if (result?.outcome === 'activated') {
      stable = id;
      workspaces[id].focus?.();
      return Object.freeze({ activeId: id, outcome: 'activated' });
    }
    const reason = result?.reason ?? result?.outcome ?? 'unknown';
    toast(`${NAMES[id] ?? id} unavailable: ${reason}`);
    const fallback = stable !== id ? stable : Object.keys(workspaces).find(other => other !== id);
    if (restoring || !fallback) return Object.freeze({ activeId: id, outcome: 'unavailable', reason });
    const restored = await switchTo(fallback, { restoring: true });
    return Object.freeze({ activeId: restored.activeId, outcome: restored.outcome === 'activated' ? 'unavailable' : restored.outcome, reason });
  }
  const ready = switchTo(initial);
  return Object.freeze({
    ready, switchTo: id => switchTo(id), current: () => visible,
    destroy() {
      if (destroyed) return;
      destroyed = true; token++;
      for (const [button, listener] of listeners) button.removeEventListener('click', listener);
    },
  });
}
