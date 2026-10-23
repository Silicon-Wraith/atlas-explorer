import { deepFreeze } from '../../shared/scene.js';
import { MAX_OUTPUT_DIMENSION } from '../../shared/render-request.js';
import { sceneCodec } from '../scene-adapter.js';
import { LIGHTING_BOUNDS_DEFAULT } from './backend.js';

export const PROFILES = deepFreeze({
  draft: { scale: 0.5, maxIterations: 64, maxSteps: 256, lighting: 'direct', samples: 1, budgetMs: 1000 },
  settled: { scale: 1, maxIterations: 'scene', maxSteps: 'scene', lighting: 'scene', samples: 'scene', budgetMs: 10000 },
});

export function resolveQuality(scene, profile, { width, height }) {
  sceneCodec.validate(scene);
  if (!Object.hasOwn(PROFILES, profile)) throw new RangeError(`unknown Space profile: ${profile}`);
  for (const value of [width, height]) if (!Number.isInteger(value) || value < 1 || value > MAX_OUTPUT_DIMENSION) throw new RangeError('invalid output dimension');
  const settings = PROFILES[profile], preview = profile === 'draft';
  const stage = scene.appearance.viewMode !== 'shaded' ? 'diagnostic' : preview ? 'direct' : scene.appearance.lightingQuality;
  return deepFreeze({
    profile, preview, internalSize: { width: Math.max(1, Math.floor(width * settings.scale)), height: Math.max(1, Math.floor(height * settings.scale)) },
    iteration: { ...scene.iteration, maxIterations: preview ? Math.min(64, scene.iteration.maxIterations) : scene.iteration.maxIterations },
    tracing: { ...scene.tracing, maxSteps: preview ? 256 : scene.tracing.maxSteps, toleranceFloor: 1e-6, toleranceFactor: 0.5 },
    // Rev 5.0 (B11b): box and Menger add the one-sided analytic-interior fallback and its centre sample.
    normals: ['box', 'menger'].includes(scene.model.id) ? { method: 'central-differences-one-sided-analytic-v1', epsilonFactor: 0.5, fieldSamples: 7 }
      : { method: 'central-differences', epsilonFactor: 0.5, fieldSamples: 6 },
    lighting: { stage, ...LIGHTING_BOUNDS_DEFAULT, ...(stage === 'full' ? {} : { shadowRays: 0, shadowSteps: 0, aoSamples: 0 }) },
    sampling: { ...scene.sampling, targetSamples: preview ? 1 : scene.sampling.targetSamples },
    sampleMapping: 'pixel-centres-jittered-primary-rays-v1', orbitAttributes: [], budgetMs: settings.budgetMs,
  });
}
