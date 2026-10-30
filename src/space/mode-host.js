// Two retained Space investigations behind the existing outer activation seam.
export function createSpaceModeHost({ modes, initial = 'viewer', onState = () => {}, onMessage = () => {}, activationMs = 60000,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!modes?.[initial] || !modes.viewer || !modes.landscape) throw new TypeError('Viewer and landscape modes required');
  let selected = initial, visible = initial, active = false, destroyed = false, generation = 0, childSequence = 0, pending = null;
  const state = () => ({ selected, visible, active, pending: pending?.mode ?? null, destroyed });
  const notify = () => onState(state());
  async function select(mode) {
    if (!modes[mode]) throw new RangeError('Unknown Space mode');
    if (!active || destroyed) return { outcome: 'inactive' };
    const mine = ++generation;
    let task = pending;
    if (!task || task.mode !== mode) {
      task?.cancel();
      for (const [id, owner] of Object.entries(modes)) if (id !== mode) owner.deactivate();
      const token = ++childSequence; let timer, cancel;
      task = { mode, cancel: () => { clearTimer(timer); cancel?.({ outcome: 'superseded' }); } };
      const promise = Promise.race([
        Promise.resolve().then(() => modes[mode].activate(token)),
        new Promise(resolve => { timer = setTimer(() => { if (pending === task) modes[mode].deactivate(); resolve({ outcome: 'unavailable', reason: 'Space preparation did not finish within its activation deadline' }); }, activationMs); }),
        new Promise(resolve => { cancel = resolve; }),
      ]).catch(error => ({ outcome: 'unavailable', reason: error.message })).finally(() => clearTimer(timer));
      task.promise = promise; pending = task; notify();
    }
    const result = await task.promise;
    if (mine !== generation || !active || destroyed) return { outcome: 'superseded' };
    if (pending === task) pending = null;
    if (result?.outcome === 'activated') { selected = visible = mode; notify(); modes[mode].focus?.(); return { outcome: 'activated' }; }
    modes[mode].deactivate();
    if (mode === 'landscape') { onMessage(result?.reason ?? 'Landscape is unavailable'); return select('viewer'); }
    notify(); return result;
  }
  function deactivate() {
    generation++; active = false; pending?.cancel(); pending = null;
    for (const owner of Object.values(modes)) owner.deactivate(); notify();
  }
  function restart(mode) {
    if (!modes[mode]) throw new RangeError('Unknown Space mode');
    if (!active || destroyed) return Promise.resolve({ outcome: 'inactive' });
    generation++; pending?.cancel(); pending = null; modes[mode].deactivate();
    return select(mode);
  }
  const inspection = Object.freeze({ get state() { return state(); }, select });
  return Object.freeze({ inspection, select, restart,
    async activate() {
      if (destroyed) return { outcome: 'unavailable', reason: 'Space mode host was destroyed' };
      active = true;
      // Establish pending even for the visible retained mode: the child controls
      // first presentation and re-entry after its own asynchronous retirement.
      if (!pending) return select(selected);
      return select(pending.mode);
    },
    deactivate, focus() { if (active && !pending) modes[visible]?.focus?.(); },
    destroy() { if (destroyed) return; deactivate(); destroyed = true; return Promise.all(Object.values(modes).map(owner => owner.destroy())); },
  });
}
