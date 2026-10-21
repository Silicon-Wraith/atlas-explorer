// spikes/project0/browser/main.js — page entry. Dispatches by ?mode=; never touches navigator.gpu in preflight.
// Every mode ends by setting window.p0Result = {slots, invalidations} | {error}. Gate modes start at module
// evaluation, with no Node round-trip, so G2 measures from navigation start.
import { pageSupervisor } from './supervisor.js';
const params = new URLSearchParams(location.search);
const status = document.getElementById('status');
const say = text => { status.textContent = text; };
const mode = params.get('mode');
// The result is also pushed through Node's binding (installed before navigation), so Node never evaluates in the page while it waits.
const finish = result => { window.p0Result = result; say(`${mode}: ${result.error ? 'error' : 'done'}`); pageSupervisor().quiesce().catch(() => {}); if (typeof window.p0Push === 'function') Promise.resolve(window.p0Push({ type: 'result', result })).catch(() => {}); };
// Heartbeats outside measured windows let Node bound the page's responsiveness (T9 fix round 2). G2 never heartbeats: its navigation window, armed
// by Node before navigation, runs from navigation start to the first publication, and its result follows the window's close directly.
if (!(mode === 'gate' && params.get('gate') === 'G2')) pageSupervisor().startHeartbeats();
const fail = error => finish({ error: `${error.name}: ${error.message}` });

async function loadFixtures() {
  const response = await fetch(new URL('../fixtures.json', import.meta.url));
  if (!response.ok) throw new Error(`fixtures.json: HTTP ${response.status}`);
  return response.json();
}

if (mode === 'preflight') {
  finish({ slots: [{ slot: 'environment', raw: { isSecureContext, hasGpuObject: 'gpu' in navigator, userAgent: navigator.userAgent, devicePixelRatio, inner: [innerWidth, innerHeight], visibility: document.visibilityState } }], invalidations: [] });
} else if (mode === 'probe') {
  import('./probe.js').then(m => m.runProbe(params, say)).then(finish, fail);                                   // T5
} else if (mode === 'integrity-preflight') {
  import('./integrity-preflight.js').then(m => m.runIntegrityPreflight()).then(finish, fail);                     // T9 fix round 2: no GPU device
} else if (mode === 'gate') {
  Promise.all([loadFixtures(), import('./drivers/index.js')])                                                    // T6
    .then(([fixtures, drivers]) => drivers.runGateDriver(params.get('gate'), fixtures, params, say)).then(finish, fail);
} else {
  fail(new Error(`unknown mode ${mode}`));
}
