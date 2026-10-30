import { installCollisionWorker } from './space/preparation/collision-worker.js';
import { loadPreparedPhysics } from './preparation-bootstrap.js';
installCollisionWorker({ loadPhysics: loadPreparedPhysics });
