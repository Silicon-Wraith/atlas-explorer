// Committed scene/history only. Live gesture poses stay in the prepared runtime.
import { createHistory } from '../../shared/history.js';
import { canonicalJson } from '../../shared/scene.js';
import { worldReference } from './contract.js';
import { sceneCodec, cameraFromPreparedPose, equalPreparedCameras } from './scene-adapter.js';

export function createPreparedSceneHistory({ onChange = () => {} } = {}) {
  let history = null, pending = null, request = 0;
  const scene = () => pending ?? history?.snapshot().scene ?? null;
  const notify = () => onChange(snapshot());
  function snapshot() {
    const state = history?.snapshot();
    const { scene: omitted, ...info } = state ?? {};
    return { scene: scene(), request, history: state ? info : null };
  }
  return Object.freeze({ snapshot, scene, get request() { return request; },
    seed(initial) {
      if (history) return;
      history = createHistory({ initialScene: initial, codec: sceneCodec, cameraEqual: equalPreparedCameras });
      if (pending) { history.apply([{ type: 'restoreScene', scene: pending }], { kind: 'restore' }); pending = null; }
      notify();
    },
    restore(input) {
      const next = sceneCodec.validate(input);
      if (history) history.apply([{ type: 'restoreScene', scene: next }], { kind: 'restore' }); else pending = next;
      request++; notify(); return request;
    },
    acceptPose(pose, expectedRequest) {
      if (!history || expectedRequest !== request) return false;
      if (canonicalJson(pose.world) !== canonicalJson(worldReference(scene().parameters.world))) throw new Error('Accepted pose belongs to a different world');
      const camera = cameraFromPreparedPose(pose);
      if (equalPreparedCameras(scene().camera, camera)) return false;
      history.apply([{ type: 'setCamera', camera }], { kind: 'navigation' }); notify(); return true;
    },
    step(action) {
      if (!['back', 'forward', 'undo', 'redo'].includes(action)) throw new RangeError('Unknown prepared history action');
      if (!history) return null;
      const transition = history[action]();
      if (!transition) return null;
      request++; notify(); return request;
    },
  });
}
