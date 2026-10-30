// The local experimental dependency belongs to this fixture, outside Space core.
import { installCollisionWorker } from '/src/space/preparation/collision-worker.js';
installCollisionWorker({ loadPhysics: async () => (await import('/native/rapier.mjs')).default });
