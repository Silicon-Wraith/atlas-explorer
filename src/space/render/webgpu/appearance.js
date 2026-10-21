// Appearance metadata (plan B11; spec §8.1 steps 4–6, §8.2, §7.6, §9.1 "Pipelines" and "Pipeline descriptors"):
// APPEARANCE_VERSION, the generated source hashes, the versioned binding table, the shade, diagnostic, accumulate
// and display descriptors (B00 schema, B06 ABI), their uniform dictionaries, the complete product pipeline set and
// verifyPrewarm, and a CPU reference of the per-sample flags and the display rule for the tests. No GPU API is
// touched here; the backend prepares and dispatches.
//
// Uniform names are the B09 renderer's dictionary (renderer.js batch()); shadeUniforms() and the others compute the
// same dictionary from explicit inputs, and a unit test asserts that they agree batch by batch.
import { createPipelineSet } from '../backend.js';
import { LEGEND, RAY_STATUS, unpackLightingStatus, unpackStatus } from '../status.js';
import { deepFreeze } from '../../../shared/scene.js';
import { VIEW_MODES } from '../../scene-adapter.js';
import { SELF_CHECK_PIPELINE_SET, PRESENT_PIPELINE_ID } from './pipelines.js';
import { fieldPipelineDescriptors } from './kernels.js';
import { TRACE_FIELD_IDS, TRACE_UNIFORM_LAYOUT, traceLayout, tracePipelineDescriptors, traceUniforms } from './passes.js';
import { APPEARANCE_HASHES } from './appearance-hashes.js';

export { APPEARANCE_HASHES };
export const APPEARANCE_VERSION = 'space-appearance-v1';
export const PRODUCT_PIPELINE_SET_ID = 'space-product-v1';
export const DIAGNOSTIC_MODES = Object.freeze(VIEW_MODES.filter(mode => mode !== 'shaded'));
export const VIEW_MODE_CODES = Object.freeze(Object.fromEntries(VIEW_MODES.map((mode, code) => [mode, code])));
// The labels a view-mode control shows; step count is computational cost, never estimator error (spec §8.2).
export const VIEW_MODE_LABELS = deepFreeze({ shaded: 'shaded', normals: 'normals', depth: 'depth', steps: 'computational cost', termination: 'termination reason' });
export const LIGHTING_STAGE_CODES = Object.freeze({ direct: 0, full: 1, diagnostic: 2 });
// accumulationFlags: the OR over the samples of one accumulation identity of these per-sample facts.
export const ACCUMULATION_FLAGS = Object.freeze({ primaryNumericalFailure: 1, primaryUnresolved: 2, unavailableNormal: 4,
  shadowUnresolved: 8, shadowNumericalFailure: 16, aoUnresolved: 32, aoNumericalFailure: 64 });
// Display-space bytes for the termination view (unresolved and numerical failure use LEGEND).
export const TERMINATION_COLOURS = deepFreeze({ hit: [200, 200, 200], miss: [24, 28, 40] });
const refuse = message => { throw new RangeError(message); };

// ---- descriptors -------------------------------------------------------------------------------------------
const field = (name, type, offset) => ({ name, type, offset });
const binding = (slot, type, access) => ({ slot, type, access });
const UNIFORM = binding('u', 'uniform-buffer', 'read'), read = slot => binding(slot, 'texture', 'read'), write = slot => binding(slot, 'storage-texture', 'write');
const SHADE_BINDINGS = [UNIFORM, read('depth'), read('status'), read('normal'), write('sampleColor'), write('lightingStatus')];
const BOXES = binding('menger_boxes', 'storage-buffer', 'read');
// shade.wgsl ShadeUniforms: trace.wgsl's 160-byte TraceUniforms followed by the appearance members. Offset 60
// (WGSL max_steps) is the shadow-step cap for shade_band and the primary step budget for the diagnostics.
const APPEARANCE_FIELDS = { lightingStage: field('lightingStage', 'u32', 160), aoSamples: field('aoSamples', 'u32', 164), shadowRays: field('shadowRays', 'u32', 168) };
const COMMON_NAMES = new Set(['origin', 'size', 'internalSize', 'seed', 'sampleIndex', 'originHigh', 'maxIterations', 'originLow', 'maxSteps', 'forward', 'alpha', 'right', 'toleranceFloor', 'up', 'stepMultiplier', 'toleranceFactor']);
function appearanceLayout(modelId, { steps, extras }) {
  const trace = modelId ? traceLayout(modelId).fields : TRACE_UNIFORM_LAYOUT.fields.filter(f => COMMON_NAMES.has(f.name));
  return { byteLength: 176, fields: [...trace.map(f => (f.name === 'maxSteps' ? { ...f, name: steps } : { ...f })), ...extras.map(name => ({ ...APPEARANCE_FIELDS[name] }))] };
}
const adapter = modelId => (modelId === 'menger' ? 'menger-sample' : 'menger-absent');
const fieldIndex = modelId => TRACE_FIELD_IDS.indexOf(modelId);
const shadeDescriptor = modelId => ({ pipelineId: `shade_band:${modelId}`, kind: 'compute', sourceIds: ['fields', adapter(modelId), 'trace', 'shade'], entryPoint: 'shade_band',
  constants: { FIELD: fieldIndex(modelId) }, bindings: [...SHADE_BINDINGS, ...(modelId === 'menger' ? [BOXES] : [])],
  uniformLayout: appearanceLayout(modelId, { steps: 'shadowSteps', extras: ['lightingStage', 'aoSamples', 'shadowRays'] }) });
// diagnostic_depth needs the model's enclosing interval; the other diagnostics never evaluate the field.
const depthDescriptor = modelId => ({ pipelineId: `diagnostic_depth:${modelId}`, kind: 'compute', sourceIds: ['fields', adapter(modelId), 'trace', 'shade'], entryPoint: 'diagnostic_depth',
  constants: { FIELD: fieldIndex(modelId) }, bindings: [...SHADE_BINDINGS], uniformLayout: appearanceLayout(modelId, { steps: 'maxSteps', extras: ['lightingStage'] }) });
const diagnosticDescriptor = mode => ({ pipelineId: `diagnostic_${mode}`, kind: 'compute', sourceIds: ['fields', 'menger-absent', 'trace', 'shade'], entryPoint: `diagnostic_${mode}`,
  constants: { FIELD: 0 }, bindings: [...SHADE_BINDINGS], uniformLayout: appearanceLayout(null, { steps: 'maxSteps', extras: ['lightingStage'] }) });
const ACCUMULATE = { pipelineId: 'accumulate_band', kind: 'compute', sourceIds: ['accumulate'], entryPoint: 'accumulate_band', constants: {},
  bindings: [UNIFORM, read('status'), read('normal'), read('lightingStatus'), read('sampleColor'), read('previous'), write('next'), binding('accumulationFlags', 'storage-texture', 'read-write')],
  uniformLayout: { byteLength: 32, fields: [field('origin', 'vec2<u32>', 0), field('size', 'vec2<u32>', 8), field('sampleIndex', 'u32', 16)] } };
const DISPLAY = { pipelineId: 'display_band', kind: 'compute', sourceIds: ['display'], entryPoint: 'display_band', constants: {},
  bindings: [UNIFORM, read('accumulation'), read('accumulationFlags'), write('display')],
  uniformLayout: { byteLength: 32, fields: [field('origin', 'vec2<u32>', 0), field('size', 'vec2<u32>', 8), field('lightingStage', 'u32', 16), field('viewMode', 'u32', 20)] } };
const descriptors = () => [...TRACE_FIELD_IDS.map(shadeDescriptor), ...TRACE_FIELD_IDS.map(depthDescriptor),
  ...DIAGNOSTIC_MODES.filter(mode => mode !== 'depth').map(diagnosticDescriptor), ACCUMULATE, DISPLAY];
export const appearancePipelineDescriptors = () => deepFreeze(structuredClone(descriptors()));
export const appearancePipelineSet = () => createPipelineSet({ id: APPEARANCE_VERSION, descriptors: appearancePipelineDescriptors() });

// The versioned binding table (ruling (a), as B08 and B10 do): per entry source, slot → WGSL variable; per
// descriptor, its slots in @binding order. Slots are module-local.
export const APPEARANCE_BINDINGS = deepFreeze({
  version: 'space-appearance-bindings-v1',
  wgsl: {
    shade: { u: 'u', depth: 'depth_in', status: 'status_in', normal: 'normal_in', sampleColor: 'color_out', lightingStatus: 'lighting_out', menger_boxes: 'menger_boxes' },
    accumulate: { u: 'u', status: 'status_in', normal: 'normal_in', lightingStatus: 'lighting_in', sampleColor: 'color_in', previous: 'previous_in', next: 'next_out', accumulationFlags: 'flags' },
    display: { u: 'u', accumulation: 'accumulation_in', accumulationFlags: 'flags_in', display: 'display_out' },
  },
  descriptors: Object.fromEntries(descriptors().map(d => [d.pipelineId, d.bindings.map(b => b.slot)])),
});

// The complete product set: everything the B09 renderer looks up for every model and view mode (probe and
// present, the point kernels, tracing, normals, shading, the diagnostics, accumulation and display). B06's
// self-check extras, B08's derivative probe and B10's validation pipelines are not product pipelines.
export function productPipelineDescriptors() {
  const selfCheck = SELF_CHECK_PIPELINE_SET.descriptors.filter(d => d.pipelineId === 'probe' || d.pipelineId === PRESENT_PIPELINE_ID);
  const points = fieldPipelineDescriptors().filter(d => d.entryPoint === 'evaluate_points');
  return deepFreeze(structuredClone([...selfCheck, ...points, ...tracePipelineDescriptors(), ...descriptors()]));
}
export const productPipelineSet = () => createPipelineSet({ id: PRODUCT_PIPELINE_SET_ID, descriptors: productPipelineDescriptors() });

// B14 enables interaction only when every required pipeline was prepared. Identifiers only: GPU pipeline
// objects stay inside the backend.
export function verifyPrewarm({ requiredPipelineIds, preparedPipelineIds } = {}) {
  for (const list of [requiredPipelineIds, preparedPipelineIds]) {
    if (!Array.isArray(list) || list.some(id => typeof id !== 'string' || !id)) throw new TypeError('verifyPrewarm takes arrays of nonempty pipeline identifiers');
  }
  const prepared = new Set(preparedPipelineIds), missing = requiredPipelineIds.filter(id => !prepared.has(id));
  return deepFreeze({ ok: missing.length === 0, missing });
}

export function appearanceImplementationHashes() {
  return deepFreeze({ appearanceVersion: APPEARANCE_VERSION, ...Object.fromEntries(Object.entries(APPEARANCE_HASHES.sources).map(([id, hash]) => [`${id}.wgsl`, hash])), ...APPEARANCE_HASHES.assembled });
}

// ---- uniforms (the renderer's dictionary, computed from explicit inputs) -----------------------------------
const FAMILY_NAMES = ['C', 'kappa', 'bound', 'power', 'depth'];
function stageCode(stage) {
  if (!Object.hasOwn(LIGHTING_STAGE_CODES, stage)) refuse(`unknown lighting stage ${String(stage)}`);
  return LIGHTING_STAGE_CODES[stage];
}
// shade_band:<model>. `lighting` is the request's resolved lighting quality (renderer stageQuality: the direct
// sample of a full request has stage 'direct' and zero shadow and AO work).
export function shadeUniforms({ modelId, camera, effective, region, internalSize, sampling, profile, lighting }) {
  const { maxSteps, ...trace } = traceUniforms({ modelId, camera, effective, region, internalSize, sampling, profile });
  const { stage, shadowRays, shadowSteps, aoSamples } = lighting ?? {};
  if (![shadowRays, shadowSteps, aoSamples].every(Number.isInteger)) refuse('lighting needs integer shadowRays, shadowSteps and aoSamples');
  return { ...trace, shadowSteps, lightingStage: stageCode(stage), aoSamples, shadowRays };
}
// diagnostic_<mode>; only depth carries the model's family parameters.
export function diagnosticUniforms({ modelId, viewMode, camera, effective, region, internalSize, sampling, profile }) {
  if (!DIAGNOSTIC_MODES.includes(viewMode)) refuse(`unknown diagnostic view mode ${String(viewMode)}`);
  const trace = traceUniforms({ modelId, camera, effective, region, internalSize, sampling, profile });
  if (viewMode !== 'depth') for (const name of FAMILY_NAMES) delete trace[name];
  return { ...trace, lightingStage: LIGHTING_STAGE_CODES.diagnostic };
}
const regionFields = ({ x, y, width, height }) => ({ origin: [x, y], size: [width, height] });
export function accumulateUniforms({ region, sampleIndex }) {
  if (!Number.isInteger(sampleIndex) || sampleIndex < 0 || sampleIndex > 63) refuse('sampleIndex must be an integer in [0, 63]');
  return { ...regionFields(region), sampleIndex };
}
export function displayUniforms({ region, lightingStage, viewMode }) {
  if (!Object.values(LIGHTING_STAGE_CODES).includes(lightingStage) || !Object.values(VIEW_MODE_CODES).includes(viewMode)) refuse('display needs a lighting stage and a view mode code');
  return { ...regionFields(region), lightingStage, viewMode };
}

// ---- CPU reference of accumulate.wgsl sample_flags and display.wgsl (tests) ------------------------------------
export function sampleFlags({ statusWord, normalAvailable, lightingWord }) {
  const { status } = unpackStatus(statusWord), { shadow, ao } = unpackLightingStatus(lightingWord), F = ACCUMULATION_FLAGS;
  let flags = 0;
  if (status === RAY_STATUS.numericalFailure) flags |= F.primaryNumericalFailure;
  if (status === RAY_STATUS.unresolved) flags |= F.primaryUnresolved;
  if (status === RAY_STATUS.hit && !normalAvailable) flags |= F.unavailableNormal;
  if (shadow) flags |= shadow.status === RAY_STATUS.numericalFailure ? F.shadowNumericalFailure : F.shadowUnresolved;
  if (ao) flags |= ao.status === RAY_STATUS.numericalFailure ? F.aoNumericalFailure : F.aoUnresolved;
  return flags;
}
export function displayLegend(flags, viewMode) {
  const F = ACCUMULATION_FLAGS;
  if (flags & (F.primaryNumericalFailure | F.shadowNumericalFailure | F.aoNumericalFailure)) return 'numericalFailure';
  if (flags & (F.primaryUnresolved | F.shadowUnresolved | F.aoUnresolved)) return 'unresolved';
  if (flags & F.unavailableNormal && (viewMode === VIEW_MODE_CODES.shaded || viewMode === VIEW_MODE_CODES.normals)) return 'unavailableNormal';
  return null;
}
// Legend colours are display-space values written exactly: round half up to k/255.
export const legendBytes = colour => [...colour.map(v => Math.floor(Math.min(1, Math.max(0, v)) * 255 + 0.5)), 255];
export const srgbEncode = v => { const c = Math.min(1, Math.max(0, v)); return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055; };
// The expected display bytes for an accumulated pixel. Legend overrides are exact; a mean is the binary64
// reference of the binary32 shader arithmetic (a GPU byte may differ by one where rounding is at a half).
export function expectedDisplay({ sum, flags, lightingStage, viewMode }) {
  const legend = displayLegend(flags, viewMode);
  if (legend) return legendBytes(LEGEND[legend]);
  if (!(sum[3] >= 1) || !sum.slice(0, 3).every(Number.isFinite)) return legendBytes(LEGEND.unresolved);
  const mean = sum.slice(0, 3).map(v => v / sum[3]);
  const display = lightingStage === LIGHTING_STAGE_CODES.diagnostic ? mean.map(v => Math.min(1, Math.max(0, v))) : mean.map(srgbEncode);
  return [...display.map(v => Math.round(v * 255)), 255];
}
