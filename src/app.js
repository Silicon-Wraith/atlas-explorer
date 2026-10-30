// Composition root: the shell, durable storage, the discovery source and controller, and the two
// workspaces behind the switcher (spec §4.1, §13.1; plan B14): two retained investigations, one active
// view. A fresh start opens Plane (user decision, 2026-10-20) and acquires no Space device; the first
// switch to Space acquires it.
import { createShell } from './ui/shell.js';
import { createPlaneWorkspace } from './plane/workspace.js';
import { createSpaceWorkspace } from './space/workspace.js';
import { createPreparedWorldWorkspace } from './space/preparation/workspace.js';
import { createSpaceModeHost } from './space/mode-host.js';
import { preparationWorkerUrl, loadPreparedPhysics } from './preparation-bootstrap.js';
import { createWorkspaceSwitcher } from './ui/workspace-switcher.js';
import { createShareLinkRouter } from './ui/share-link-router.js';
import { openPersistence } from './shared/persistence.js';
import { createLocalDiscoverySource, createDiscoveriesController } from './shared/discoveries.js';
import { sceneCodec } from './plane/scene-adapter.js';

const shell = createShell(document);

// Storage opens in the background; exploration never waits for it. Until it opens every
// call waits for it, and if it cannot open every call reports why. A connection closed behind
// ATLAS (another tab updating the database, or the browser) is reported once, and the
// Discoveries control re-reads so it shows the source as unavailable with that reason.
const opened = openPersistence({ onClosed: () => { shell.toast('Browser storage was closed behind ATLAS. Reload this page to save or open discoveries again.'); discoveries.refresh(); } });
opened.catch(error => console.info('Discoveries are unavailable:', error.message));
const store = {
  listDiscoveries: async query => (await opened).listDiscoveries(query),
  countDiscoveries: async query => (await opened).countDiscoveries(query),
  getDiscovery: async (id, options) => (await opened).getDiscovery(id, options),
  getWriteMarker: async (writeId, options) => (await opened).getWriteMarker(writeId, options),
  commit: async (batch, options) => (await opened).commit(batch, options),
};
const local = createLocalDiscoverySource({ store, sceneCodec });
const discoveries = createDiscoveriesController({ sources: [local], sceneCodec });

const plane = createPlaneWorkspace({ shell, discoveries, sourceId: local.id });
const viewer = createSpaceWorkspace({ shell });
function landscapeUnavailable(reason, { restartRequired = false } = {}) { const element = shell.$('#space-mode-error'); element.textContent = reason; element.hidden = false; shell.$('#landscape-retry').hidden = restartRequired; }
const landscape = createPreparedWorldWorkspace({ shell, workerUrl: preparationWorkerUrl, loadPhysics: loadPreparedPhysics, onUnavailable: landscapeUnavailable,
  onRestoreRequested: () => switcher.current() === 'space' ? space.restart('landscape') : Promise.resolve({ outcome: 'inactive' }) });
const space = createSpaceModeHost({ modes: { viewer, landscape }, onState(state) {
  const mode = state.visible ?? state.selected; document.body.dataset.spaceMode = mode;
  if (state.pending) document.body.dataset.spaceModePending = state.pending; else delete document.body.dataset.spaceModePending;
  for (const id of ['viewer', 'landscape']) shell.$('#space-mode-' + id).setAttribute('aria-pressed', String(mode === id));
  for (const selector of ['#space-canvas', '#space-panel', '.space-navigation']) shell.$(selector).inert = mode !== 'viewer' || !!state.pending || !state.active;
  shell.$('#landscape-canvas').inert = mode !== 'landscape' || !!state.pending || !state.active;
  if (state.pending === 'landscape') { shell.$('#space-mode-error').hidden = true; shell.$('#landscape-retry').hidden = true; }
  if (mode === 'viewer' && state.pending !== 'landscape') shell.$('#landscape-status').hidden = true;
}, onMessage: landscapeUnavailable });
for (const id of ['viewer', 'landscape']) shell.$('#space-mode-' + id).addEventListener('click', () => { space.select(id); });
shell.$('#landscape-retry').addEventListener('click', () => { landscape.inspection.retry(); });
const switcher = createWorkspaceSwitcher({ root: document, workspaces: { plane, space }, initial: 'plane', toast: shell.toast });
// Share links that arrive while Plane is inactive (Space active or preparing) are routed, never lost (spec §14).
const links = createShareLinkRouter({ plane, switcher, report: shell.toast });
// window.atlas stays Plane's inspection (the Plane suites read it); Space and the switcher hang off it.
window.atlas = plane.inspection;
window.atlas.space = viewer.inspection;
window.atlas.landscape = landscape.inspection;
window.atlas.spaceModes = space.inspection;
window.atlas.workspaces = Object.freeze({ switchTo: id => switcher.switchTo(id), current: () => switcher.current(), pending: () => switcher.pending(), ready: switcher.ready });
// Teardown order (plan amendment E(1)): the link router and the switcher, the workspaces (Plane's Discoveries control
// first, then its renderer; then Space's device), then the controller, then the storage connection.
addEventListener('pagehide', () => { links.destroy(); switcher.destroy(); plane.destroy(); space.destroy(); discoveries.destroy(); opened.then(db => db.close(), () => {}); });
