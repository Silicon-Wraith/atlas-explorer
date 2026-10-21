import { canonicalJson, fnv1a64 } from '../../shared/scene.js';
import { effectiveParameters } from '../numerics/parameters.js';

const hash = value => fnv1a64(canonicalJson(value));
const sequence = sampling => ({ sequence: sampling.sequence, seed: sampling.seed });

export function geometryKey(scene, quality, { width, height, kernelVersion, tracingVersion }) {
  for (const [name, value] of Object.entries({ kernelVersion, tracingVersion })) if (typeof value !== 'string' || !value) throw new TypeError(`${name} is required`);
  const { effective, bits } = effectiveParameters(scene.model.id, scene.parameters);
  return hash({ model: scene.model, kernelVersion, tracingVersion, effective, bits, camera: scene.camera,
    slices: scene.slices, internalSize: quality.internalSize, outputSize: { width, height },
    sampleMapping: quality.sampleMapping, iteration: quality.iteration, tracing: quality.tracing,
    normals: quality.normals, orbitAttributes: quality.orbitAttributes });
}
export function appearanceKey(scene, quality) {
  // lightingQuality is the requested target. The resolved stage is the actual input.
  const { lightingQuality, ...appearance } = scene.appearance;
  return hash({ appearance, lighting: quality.lighting });
}
export function sampleKey(geometry, sampling, sampleIndex) {
  if (!Number.isInteger(sampleIndex) || sampleIndex < 0 || sampleIndex > 63) throw new RangeError('invalid sample index');
  return hash({ geometry, sampling: sequence(sampling), sampleIndex });
}
export function accumulationKey(geometry, appearance, sampling) {
  return hash({ geometry, appearance, sampling: sequence(sampling) });
}
