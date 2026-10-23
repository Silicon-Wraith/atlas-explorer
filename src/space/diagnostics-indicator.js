// Space diagnostics should not flash on every draft. Provisional pixels need
// their signal synchronously; failures and loss also bypass the pending delay.
import { draftExecution } from './render/draft-execution.js';
export function createSpaceDiagnostics({ element, value, rung = draftExecution().rung, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const enabled = ['L6b', 'L6c', 'L6d'].includes(rung);
  let status = null, active = false, timer = null, pendingVisible = false, destroyed = false;
  function cancelPending() {
    if (timer !== null) clearTimer(timer);
    timer = null; pendingVisible = false;
  }
  function render() {
    const state = status?.diagnosticsState;
    const alert = state === 'failed' || state === 'interrupted';
    const visible = enabled && active && !destroyed && (alert || (state === 'pending' && (status.provisional || pendingVisible)));
    if (element) { element.hidden = !visible; element.classList.toggle('space-alert', alert); }
    if (value) value.textContent = visible ? (state === 'pending' && status.provisional ? 'Validating — provisional' : state) : '';
  }
  render();
  return Object.freeze({
    update(next) {
      if (destroyed) return;
      const wasPending = status?.diagnosticsState === 'pending';
      status = next;
      if (status?.diagnosticsState !== 'pending' || status.provisional) cancelPending();
      else if (enabled && (!wasPending || (timer === null && !pendingVisible))) {
        timer = setTimer(() => { timer = null; pendingVisible = true; render(); }, 250);
      }
      render();
    },
    setActive(next) { active = next; render(); },
    destroy() { destroyed = true; cancelPending(); render(); },
  });
}
