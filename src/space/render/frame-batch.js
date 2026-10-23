// Shared renderer/diagnostic descriptor construction: identical shaders, uniforms and work bounds.
import { createBatch, sampleJitter, BackendError } from './backend.js';
import { escapeRadius } from '../numerics/parameters.js';
import { VIEW_MODES } from '../scene-adapter.js';
import { basis, encodeOrdinaryOrigin } from '../camera.js';
const identity = request => Object.fromEntries(['requestId', 'jobId', 'viewId', 'generation'].map(key => [key, request[key]]));
export function buildSpaceBatch({ descriptor, record, pass, region, sample, quality, extra = {} }) {
    const handles = record.targets?.handles ?? {};
    const alias = { ...handles, probe_target: handles.status,
      previous: handles.accumulation?.[sample & 1], next: handles.accumulation?.[(sample + 1) & 1],
      accumulation: handles.accumulation?.[(sample + 1) & 1], display: record.displayHandle, draftDiagnostics: record.draftDiagnostics, summary: record.draftSummary, menger_boxes: record.mengerBoxes, ...extra.handles };
    const inputs = {}, outputs = {};
    for (const binding of descriptor.bindings) {
      if (binding.type === 'uniform-buffer' && descriptor.uniformLayout.byteLength) continue;
      const handle = alias[binding.slot];
      if (!handle || Array.isArray(handle)) throw new BackendError('invalid-descriptor', `no renderer binding for ${binding.slot}`);
      if (binding.access !== 'write') inputs[binding.slot] = handle;
      if (binding.access !== 'read') outputs[binding.slot] = handle;
    }
    const sampling = quality.sampling, jitter = sampleJitter({ seed: sampling.seed, sampleIndex: sample, pixel: [region.x, region.y] });
    const effective = record.effective ?? {}, camera = record.request.sceneSnapshot.camera;
    const fields = { origin: [region.x, region.y], size: [region.width, region.height], internalSize: Object.values(quality.internalSize),
      diagnosticStride: record.diagnosticStride, producerToken: record.producerToken, sampleIndex: sample, seed: sampling.seed, lightingStage: quality.lighting.stage === 'full' ? 1 : quality.lighting.stage === 'diagnostic' ? 2 : 0,
      jitter: [jitter.dx, jitter.dy], maxIterations: quality.iteration.maxIterations, maxSteps: quality.tracing.maxSteps,
      stepMultiplier: quality.tracing.stepMultiplier, toleranceFloor: quality.tracing.toleranceFloor,
      // B10: τ(t) = max(toleranceFloor, toleranceFactor·α·t), and the quaternion's outward-rounded B02 R(C).
      toleranceFactor: quality.tracing.toleranceFactor, bound: effective.C ? escapeRadius(effective.C).bound : undefined,
      power: effective.power, C: effective.C, kappa: effective.kappa, depth: effective.depth,
      // B11: the shading stage's secondary-ray work (B00 bounds) and the view mode code (scene-adapter VIEW_MODES order).
      shadowSteps: quality.lighting.shadowSteps, shadowRays: quality.lighting.shadowRays, aoSamples: quality.lighting.aoSamples,
      viewMode: record.request.sceneSnapshot.appearance ? VIEW_MODES.indexOf(record.request.sceneSnapshot.appearance.viewMode) : undefined, ...extra.uniforms };
    // Camera transport is evaluated only when a descriptor asks for it. No world
    // position is collapsed into a Number; B05 supplies high/low binary32 parts.
    if (camera && descriptor.uniformLayout.fields.some(field => ['originHigh', 'originLow', 'forward', 'right', 'up', 'alpha'].includes(field.name))) {
      const origin = encodeOrdinaryOrigin(camera); if (origin.unavailable) throw new BackendError('invalid-descriptor', origin.reason);
      Object.assign(fields, { originHigh: origin.highF32, originLow: origin.lowF32, ...basis(camera),
        alpha: 2 * Math.tan(camera.verticalFovDegrees * Math.PI / 360) / quality.internalSize.height });
    }
    const uniforms = Object.fromEntries(descriptor.uniformLayout.fields.map(field => {
      if (fields[field.name] === undefined) throw new BackendError('invalid-descriptor', `no renderer uniform for ${field.name}`);
      return [field.name, fields[field.name]];
    }));
    return createBatch({ identity: identity(record.request), pipelineId: descriptor.pipelineId, pass,
      region, sample: { sequence: sampling.sequence, seed: sampling.seed, index: sample },
      bounds: { pixels: region.width * region.height, iterations: quality.iteration.maxIterations, raySteps: quality.tracing.maxSteps,
        normalFieldSamples: quality.lighting.normalFieldSamples, shadowRays: quality.lighting.shadowRays,
        shadowSteps: quality.lighting.shadowSteps, aoSamples: quality.lighting.aoSamples }, inputs, outputs, uniforms });
}
