// Tracing, normals and pick metadata (plan B10; spec §11.4, §8.1 steps 2–3, §13.3, §9.1 "Pipeline
// descriptors"). TRACING_VERSION, the generated source hashes, the versioned binding table, the trace and
// normals pipeline descriptors (B00 schema, B06 ABI), uniform packing, the validation ray-list encoding
// and the CPU side of a pick. No GPU API is touched here; the backend prepares and dispatches.
//
// Uniform names are the B09 renderer's dictionary (renderer.js batch()), so the renderer drives these
// descriptors through its pass sequence; traceUniforms() is the same dictionary computed from explicit
// inputs, and a unit test asserts both agree batch by batch.
import { createPipelineSet } from '../backend.js';
import { STATUS_LABELS, unpackStatus } from '../status.js';
import { basis, encodeOrdinaryOrigin, reconstructHit } from '../../camera.js';
import { deepFreeze } from '../../../shared/scene.js';
import { admitPointModel, FIELD_IDS, KERNEL_HASHES, KERNEL_VERSION } from './kernels.js';
import { TRACING_HASHES } from './tracing-hashes.js';

export { TRACING_HASHES };
export const TRACING_VERSION = 'surface-v1/space-trace-v2'; // rev 5.0 (B11b): the one-sided normal fallback; space-trace-v1 was B10's
export const TRACE_FIELD_IDS = FIELD_IDS; // the product families, FIELD 0–4
// FIELD 5 is a constant exterior distance (u.c.x): validation only, for B04's two stagnation probes.
export const VALIDATION_FIELD_IDS = Object.freeze([...FIELD_IDS, 'constant']);
export const TRACE_RAY_BYTES = 64;    // vec4 high (w: explicit-interval flag), vec4 low, vec4 direction, vec4 interval
export const TRACE_RESULT_BYTES = 16; // packed status, depth bits, detail (1 = interior), steps
// B10-F3 (fix round 1): under the estimate-unavailable reason, the B00 subreason nibble carries the
// applicability detail (0 none, 1 interior); under stagnation it keeps the STAGNATION code. Layout unchanged.
export const ESTIMATE_DETAIL = Object.freeze({ none: 0, interior: 1 });
// Central differences take two samples per axis; rev 5.0 (B11b): the box and Menger one-sided fallback adds the centre
// value, evaluated at most once per pixel, so a normals batch declares at most seven.
export const NORMAL_FIELD_SAMPLES = 7;
const MAX_RAY_STEPS = 1024, MAX_ITERATIONS = 512;
const refuse = message => { throw new RangeError(message); };

// The byte layout of trace.wgsl's TraceUniforms (160 bytes). Each family's descriptor lists the common
// fields and only its own parameters; the bytes of the others stay zero.
const field = (name, type, offset) => ({ name, type, offset });
const COMMON_FIELDS = [
  field('origin', 'vec2<u32>', 0), field('size', 'vec2<u32>', 8), field('internalSize', 'vec2<u32>', 16), field('seed', 'u32', 24), field('sampleIndex', 'u32', 28),
  field('originHigh', 'vec3<f32>', 32), field('maxIterations', 'u32', 44), field('originLow', 'vec3<f32>', 48), field('maxSteps', 'u32', 60),
  field('forward', 'vec3<f32>', 64), field('alpha', 'f32', 76), field('right', 'vec3<f32>', 80), field('toleranceFloor', 'f32', 92),
  field('up', 'vec3<f32>', 96), field('stepMultiplier', 'f32', 108), field('toleranceFactor', 'f32', 112),
];
const PARAMETER_FIELDS = { C: field('C', 'vec4<f32>', 128), kappa: field('kappa', 'f32', 144), bound: field('bound', 'f32', 148), power: field('power', 'u32', 152), depth: field('depth', 'u32', 156) };
const FAMILY_PARAMETERS = deepFreeze({ sphere: [], box: [], menger: ['depth'], mandelbulb: ['power'], 'quaternion-julia': ['C', 'kappa', 'bound'], constant: ['C'] });
export const TRACE_UNIFORM_LAYOUT = deepFreeze({ byteLength: 160, fields: [...COMMON_FIELDS, ...Object.values(PARAMETER_FIELDS)] });
export function traceLayout(modelId) {
  if (!Object.hasOwn(FAMILY_PARAMETERS, modelId)) refuse(`unknown tracing field ${String(modelId)}`);
  return deepFreeze({ byteLength: 160, fields: [...COMMON_FIELDS, ...FAMILY_PARAMETERS[modelId].map(name => PARAMETER_FIELDS[name])] });
}

const adapter = modelId => (modelId === 'menger' ? 'menger-sample' : 'menger-absent');
const binding = (slot, type, access) => ({ slot, type, access });
const UNIFORM = binding('u', 'uniform-buffer', 'read'), BOXES = binding('menger_boxes', 'storage-buffer', 'read');
const withBoxes = (modelId, bindings) => (modelId === 'menger' ? [...bindings, BOXES] : bindings);
const fieldIndex = modelId => VALIDATION_FIELD_IDS.indexOf(modelId);
function descriptor(pipelineId, entryPoint, entrySource, modelId, bindings) {
  return { pipelineId, kind: 'compute', sourceIds: ['fields', adapter(modelId), 'trace', entrySource], entryPoint,
    constants: { FIELD: fieldIndex(modelId) }, bindings: withBoxes(modelId, [UNIFORM, ...bindings]), uniformLayout: structuredClone(traceLayout(modelId)) };
}
const traceDescriptor = modelId => descriptor(`trace_band:${modelId}`, 'trace_band', 'trace-band', modelId,
  [binding('depth', 'storage-texture', 'write'), binding('status', 'storage-texture', 'write')]);
const normalsDescriptor = modelId => descriptor(`normals_band:${modelId}`, 'normals_band', 'normals', modelId,
  [binding('depth', 'texture', 'read'), binding('status', 'texture', 'read'), binding('normal', 'storage-texture', 'write')]);
const raysDescriptor = modelId => descriptor(`trace-rays:${modelId}`, 'trace_rays', 'trace-rays', modelId,
  [binding('rays', 'storage-buffer', 'read'), binding('results', 'storage-buffer', 'read-write')]);
const productDescriptors = () => [...TRACE_FIELD_IDS.map(traceDescriptor), ...TRACE_FIELD_IDS.map(normalsDescriptor)];
const validationDescriptors = () => [...VALIDATION_FIELD_IDS.map(raysDescriptor), traceDescriptor('constant'), normalsDescriptor('constant')];
// The renderer's product set: trace_band:<model> and normals_band:<model> (renderer.js pipeline() looks them up).
export const tracePipelineDescriptors = () => deepFreeze(productDescriptors());
export const tracePipelineSet = () => createPipelineSet({ id: TRACING_VERSION, descriptors: tracePipelineDescriptors() });
// Validation only (the headed `rendering` group): the ray-list entry for every field, and the constant field.
export const validationPipelineDescriptors = () => deepFreeze(validationDescriptors());
export const validationPipelineSet = () => createPipelineSet({ id: `${TRACING_VERSION}/validation`, descriptors: validationPipelineDescriptors() });

// The versioned binding table (ruling (a), as B08 and B11 do): bindings[i] is @group(0) @binding(i) of the
// entry source. `menger_boxes` is declared by every tracing entry source (the fields.wgsl contract) at the
// last slot, but only the Menger variants statically use it, so only their descriptors list it. Slots are
// module-local; points.wgsl keeps its own @binding(3) (B08 ruling 3), and B10's slots are its own choice.
export const TRACING_BINDINGS = deepFreeze({
  version: 'space-trace-bindings-v1',
  wgsl: {
    trace_band: { u: 'u', depth: 'depth_out', status: 'status_out', menger_boxes: 'menger_boxes' },
    normals_band: { u: 'u', depth: 'depth_in', status: 'status_in', normal: 'normal_out', menger_boxes: 'menger_boxes' },
    trace_rays: { u: 'u', rays: 'rays', results: 'ray_results', menger_boxes: 'menger_boxes' },
  },
  descriptors: Object.fromEntries([...productDescriptors(), ...validationDescriptors()].map(d => [d.pipelineId, d.bindings.map(b => b.slot)])),
});

// Flattened for validation records (B02 registry: implementationHashes is a map of strings).
export function tracingImplementationHashes() {
  return deepFreeze({ tracingVersion: TRACING_VERSION, kernelVersion: KERNEL_VERSION, 'fields.wgsl': KERNEL_HASHES.sources.fields,
    ...Object.fromEntries(Object.entries(TRACING_HASHES.sources).map(([id, hash]) => [`${id}.wgsl`, hash])), ...TRACING_HASHES.assembled });
}

function family(modelId, effective, maxIterations) {
  if (modelId === 'constant') {
    const distance = effective?.distance;
    if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0 || Math.fround(distance) !== distance) refuse('the constant field needs a binary32 distance >= 0');
    return { C: [distance, 0, 0, 0] };
  }
  const model = admitPointModel(modelId, effective, maxIterations);
  return Object.fromEntries(FAMILY_PARAMETERS[modelId].map(name => [name, name === 'C' ? [...model.C] : model[name]]));
}
function profileFields(profile) {
  const { maxIterations, maxSteps, stepMultiplier, toleranceFloor, toleranceFactor } = profile ?? {};
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > MAX_ITERATIONS) refuse(`maxIterations must be an integer in [1, ${MAX_ITERATIONS}]`);
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_RAY_STEPS) refuse(`maxSteps must be an integer in [1, ${MAX_RAY_STEPS}]`);
  if (!(stepMultiplier > 0 && stepMultiplier <= 1)) refuse('stepMultiplier must be in (0, 1]');
  for (const [name, value] of Object.entries({ toleranceFloor, toleranceFactor })) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) refuse(`${name} must be finite and >= 0`);
  return { maxIterations, maxSteps, stepMultiplier, toleranceFloor, toleranceFactor };
}
function regionFields(region, internalSize) {
  const { x, y, width, height } = region ?? {};
  if (![x, y, width, height, internalSize?.width, internalSize?.height].every(Number.isSafeInteger) || width < 1 || height < 1 || x < 0 || y < 0
    || x + width > internalSize.width || y + height > internalSize.height) refuse('the region must lie inside the internal size');
  return { origin: [x, y], size: [width, height], internalSize: [internalSize.width, internalSize.height] };
}

// Trace and normals uniforms for one batch region (the renderer computes the same dictionary). The origin
// is B05's ordinary transport: high = RN32(world), low = RN32(world − high); the kernel's field input is
// (high + t·d) + low. α = 2·tan(fov/2)/H_internal; τ(t) = max(toleranceFloor, toleranceFactor·α·t).
// Jitter is computed per pixel in the kernel from (seed, sampleIndex, pixel), exactly as sampleJitter.
export function traceUniforms({ modelId, camera, effective, region, internalSize, sampling, profile }) {
  const origin = encodeOrdinaryOrigin(camera);
  if (origin.unavailable) refuse(origin.reason);
  const { forward, right, up } = basis(camera), limits = profileFields(profile);
  const { seed, sampleIndex } = sampling ?? {};
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(sampleIndex) || sampleIndex < 0 || sampleIndex > 63) refuse('sampling needs a u32 seed and a sample index in [0, 63]');
  return { ...regionFields(region, internalSize), seed, sampleIndex, originHigh: origin.highF32, originLow: origin.lowF32, forward, right, up,
    alpha: 2 * Math.tan(camera.verticalFovDegrees * Math.PI / 360) / internalSize.height, ...limits, ...family(modelId, effective, limits.maxIterations) };
}
export const normalsUniforms = traceUniforms;
// B00 batch bounds: the ray-step and iteration budgets; normals also declare their seven field samples (six stencil
// endpoints plus the box and Menger one-sided fallback's lazily evaluated centre; rev 5.0 B00 amendment).
export function traceBounds(region, profile, pass = 'trace') {
  return { pixels: region.width * region.height, raySteps: profile.maxSteps, iterations: profile.maxIterations,
    normalFieldSamples: pass === 'normals' ? NORMAL_FIELD_SAMPLES : 0, shadowRays: 0, shadowSteps: 0, aoSamples: 0 };
}

// Validation ray lists: `count` rays in a grid `pitch` wide; camera fields are unused (zero) and α is explicit.
export function traceRaysUniforms({ modelId, effective, count, pitch, profile }) {
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(pitch) || count < 1 || pitch < 1) refuse('a ray list needs positive count and pitch');
  const limits = profileFields(profile), alpha = profile.alpha;
  if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha < 0) refuse('alpha must be finite and >= 0');
  const rows = Math.ceil(count / pitch), zero = [0, 0, 0];
  return { origin: [0, 0], size: [Math.min(pitch, count), rows], internalSize: [pitch, rows], seed: 0, sampleIndex: 0, originHigh: zero, originLow: zero,
    forward: zero, right: zero, up: zero, alpha, ...limits, ...family(modelId, effective, limits.maxIterations) };
}
export function encodeRays(rays) {
  if (!Array.isArray(rays) || !rays.length) refuse('rays must be a nonempty array');
  const data = new Float32Array(rays.length * (TRACE_RAY_BYTES / 4));
  rays.forEach(({ origin, direction, interval }, i) => {
    if (!Array.isArray(origin) || origin.length !== 3 || !Array.isArray(direction) || direction.length !== 3) refuse(`ray ${i} needs a 3-component origin and direction`);
    // A non-finite or invalid ray is encoded as given: the kernel reports it as a numerical failure.
    const high = origin.map(Math.fround), low = origin.map((v, k) => Math.fround(v - high[k]));
    data.set([...high, interval ? 1 : 0, ...low, 0, ...direction.map(Math.fround), 0, interval ? Math.fround(interval.enter) : 0, interval ? Math.fround(interval.exit) : 0, 0, 0], 16 * i);
  });
  return new Uint8Array(data.buffer);
}
const label = (table, code) => (code ? STATUS_LABELS[table][code] : null);
const decodeWord = word => {
  const s = unpackStatus(word), reason = label('reason', s.reason), estimate = reason === 'estimate-unavailable';
  return { status: STATUS_LABELS.ray[s.status] ?? 'invalid', reason, subreason: estimate ? null : label('subreason', s.subreason),
    detail: estimate && s.subreason === ESTIMATE_DETAIL.interior ? 'interior' : null, steps: s.steps };
};
export function decodeRayResults(bytes, count) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < count * TRACE_RESULT_BYTES) refuse('result bytes are shorter than the ray count');
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * TRACE_RESULT_BYTES), out = [];
  for (let i = 0; i < count; i++) {
    const word = view.getUint32(16 * i, true);
    if (word === 0xffffffff) { out.push({ status: 'missing' }); continue; }
    const decoded = decodeWord(word), detail = view.getUint32(16 * i + 8, true) === 1 ? 'interior' : null;
    // The word's code and the ray list's detail word must agree; a disagreement decodes as invalid.
    out.push({ ...decoded, t: view.getFloat32(16 * i + 4, true), detail, ...(decoded.detail === detail ? {} : { status: 'invalid' }) });
  }
  return out;
}
export function decodeStatusWords(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, i) => decodeWord(view.getUint32(4 * i, true)));
}
export function decodeDepths(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, i) => view.getFloat32(4 * i, true));
}
export function halfToNumber(h) {
  const sign = h & 0x8000 ? -1 : 1, exponent = (h >> 10) & 0x1f, fraction = h & 0x3ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 31) return fraction ? Number.NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}
// rgba16float normals, w = availability (B09 counts (half & 0x7fff) === 0 as unavailable).
export function decodeNormals(bytes, count) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < count * 8) refuse('normal bytes are shorter than the count');
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 8);
  return Array.from({ length: count }, (_, i) => {
    const h = k => view.getUint16(8 * i + 2 * k, true);
    return (h(3) & 0x7fff) === 0 ? { available: false, normal: [0, 0, 0] } : { available: true, normal: [0, 1, 2].map(k => halfToNumber(h(k))) };
  });
}

// The CPU side of a pick (spec §13.3; B05): the renderer's pick (B09) returns one pinned geometry sample's
// depth and status with that sample's camera, pixel and jitter, or {stale: true} when epoch, request,
// geometry revision, dimensions or sample identity no longer match. The anchored hit is reconstructed in
// controlled precision from that sample, never from a binary32 world position. A precision-limit
// reconstruction is an unresolved pick: it starts no gesture and changes no camera.
export function resolvePick(pick) {
  if (!pick || pick.stale) return { status: 'stale' };
  if (pick.status !== 'approximate hit') return { status: 'unresolved', reason: 'no-hit', rayStatus: pick.status };
  const { camera, pixel, jitter, dimensions } = pick.sample;
  const point = reconstructHit(camera, pixel, jitter, pick.depth, dimensions.width, dimensions.height);
  if (point.unavailable) return { status: 'unresolved', reason: point.reason, rayStatus: pick.status };
  return { status: 'resolved', point, depth: pick.depth, rayStatus: pick.status };
}
