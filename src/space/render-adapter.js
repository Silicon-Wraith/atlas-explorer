import { deepFreeze } from '../shared/scene.js';
import { createRenderRequest, RUNTIME_ID } from '../shared/render-request.js';
import { UNAVAILABLE } from '../shared/render-report.js';
import { sceneCodec } from './scene-adapter.js';
import { effectiveParameters } from './numerics/parameters.js';
import { getModel } from './models/registry.js';
import { resolveQuality } from './render/profiles.js';
import { geometryKey, appearanceKey } from './render/keys.js';

let nextRequest = 0;
export function createSpaceRequest({ scene, purpose = 'interactive', width, height, profile, generation, viewId, versions }) {
  const sceneSnapshot = sceneCodec.validate(scene), quality = resolveQuality(sceneSnapshot, profile, { width, height });
  const id = `${RUNTIME_ID}-space-${++nextRequest}`;
  return createRenderRequest({ requestId: `request-${id}`, jobId: `job-${id}`, viewId, sceneSnapshot,
    sceneHash: sceneCodec.fingerprint(sceneSnapshot).sceneHash, output: { width, height, purpose }, quality, generation,
    keys: { geometryKey: geometryKey(sceneSnapshot, quality, { width, height, ...versions }), appearanceKey: appearanceKey(sceneSnapshot, quality) },
  });
}

// An additive extension only. Never supply `timings`: shared lifecycle marks are
// owned by createReportBuilder and remain meaningful for Plane and Space alike.
export function spaceWorkspaceFields({ request, counts, samplesCompleted = 0, milestones, allocation, gpuTiming } = {}) {
  const scene = request?.sceneSnapshot;
  const model = scene && getModel(scene.model.id, scene.model.version);
  return deepFreeze({
    rayTermination: counts?.rayTermination ?? UNAVAILABLE,
    unavailableNormals: counts?.unavailableNormals ?? UNAVAILABLE,
    lightingFailures: counts?.lightingFailures ?? UNAVAILABLE,
    estimator: model ? { category: model.estimator.category, derivationVersion: model.estimator.derivationVersion, validationRecordId: null, inconclusive: [] } : UNAVAILABLE,
    parameters: scene ? effectiveParameters(scene.model.id, scene.parameters) : UNAVAILABLE,
    samples: { target: request?.quality.sampling.targetSamples ?? UNAVAILABLE, completed: samplesCompleted },
    milestones: { settledFirstImageMs: milestones?.settledFirstImageMs ?? UNAVAILABLE, fullQualityMs: milestones?.fullQualityMs ?? UNAVAILABLE },
    allocation: allocation ?? { peak: UNAVAILABLE, outstandingBatchesMax: UNAVAILABLE },
    gpuTiming: gpuTiming ?? { completionMethod: 'queue-completion', queueElapsedMs: UNAVAILABLE },
    preview: request?.quality.preview ?? UNAVAILABLE,
  });
}
