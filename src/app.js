// Composition root: the shell, durable storage, the discovery source and controller, and
// the Plane workspace (spec §4.1). A fresh start opens Plane (user decision, 2026-10-20).
import { createShell } from './ui/shell.js';
import { createPlaneWorkspace } from './plane/workspace.js';
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
window.atlas = plane.inspection;
// Teardown order (plan amendment E(1)): the workspace (its Discoveries control first, then the
// renderer), then the controller, then the storage connection.
addEventListener('pagehide', () => { plane.destroy(); discoveries.destroy(); opened.then(db => db.close(), () => {}); });
