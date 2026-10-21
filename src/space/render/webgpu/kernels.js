// Field-kernel metadata (plan B08; spec §10.2–10.4, §11.1–11.3): KERNEL_VERSION, the generated source
// hashes, the point and derivative pipeline descriptors (B00 schema, B06 ABI), point-batch admission
// and the PointResult layout. No GPU API is touched here; the backend prepares and dispatches.
import { createPipelineSet } from '../backend.js';
import { POINT_STATUS, STATUS_LABELS } from '../status.js';
import { escapeRadius, sliceIsEmpty } from '../../numerics/parameters.js';
import { boxes } from '../../models/menger.js';
import { deepFreeze } from '../../../shared/scene.js';
import { KERNEL_HASHES } from './kernel-hashes.js';

export { KERNEL_HASHES };
// The product kernel. Its quaternion recurrence cites Project 0's selected G5-D formulation, which
// it implements independently; the citation identifies the formulation, not this implementation.
export const KERNEL_VERSION = 'space-fields-v1';
export const KERNEL_FORMULATION = deepFreeze({
  profile: 'project0-g5d-v1', form: 'g5d-plain-qsq-wrapper-prereg-v1',
  fragmentSha256: '290b4cc6ef4a608da0e44f3cdafb0ed52943e3c37aee9292167fb24a5a90a78c',
  record: 'docs/reports/project0/webgpu-g5d-decision.json',
});
export const KERNEL_SOURCE_IDS = Object.freeze(['fields', 'points']);
export const FIELD_IDS = Object.freeze(['sphere', 'box', 'menger', 'mandelbulb', 'quaternion-julia']);
export const DERIVATIVE_PIPELINE_ID = 'points-derivative';
export const pointsPipelineId = modelId => `points-${modelId}`;
// The points pass has no entry in B00's PASSES; a point batch is submitted as field evaluation
// under the trace family's pass name (flagged for a ruling in the B08 report).
export const POINT_BATCH_PASS = 'trace';

export const POINT_INPUT_BYTES = 16; // vec4<f32>: x, y, z, 0 (probes: grow, add, updates, 0)
export const POINT_RESULT_BYTES = 64;
export const RESULT_SENTINEL = 0xffffffff; // prefilled into result buffers: an unwritten result decodes as 'missing'
export const ESTIMATE_REASONS = Object.freeze(['available', 'not-escaped', 'zero-sensitivity', 'guard']);
export const APPLICABILITY = Object.freeze(['exterior', 'boundary', 'interior']);
export const POINT_UNIFORM_LAYOUT = deepFreeze({ byteLength: 64, fields: [
  { name: 'origin', type: 'vec2<u32>', offset: 0 }, { name: 'size', type: 'vec2<u32>', offset: 8 },
  { name: 'c', type: 'vec4<f32>', offset: 16 }, { name: 'end', type: 'u32', offset: 32 }, { name: 'pitch', type: 'u32', offset: 36 },
  { name: 'cap', type: 'u32', offset: 40 }, { name: 'power', type: 'u32', offset: 44 }, { name: 'kappa', type: 'f32', offset: 48 },
  { name: 'bound', type: 'f32', offset: 52 }, { name: 'depth', type: 'u32', offset: 56 }, { name: 'reserved', type: 'u32', offset: 60 },
] });
const MAX_ITERATIONS = 512;

const binding = (slot, type, access) => ({ slot, type, access });
const BASE_BINDINGS = [binding('u', 'uniform-buffer', 'read'), binding('points', 'storage-buffer', 'read'), binding('results', 'storage-buffer', 'read-write')];
// bindings[i] is @group(0) @binding(i) (B00 ABI). `menger_boxes` is statically used by every
// evaluate_points variant (FIELD is an override), so every variant binds a box buffer.
export function fieldPipelineDescriptors() {
  const points = FIELD_IDS.map((modelId, field) => ({ pipelineId: pointsPipelineId(modelId), kind: 'compute', sourceIds: [...KERNEL_SOURCE_IDS],
    entryPoint: 'evaluate_points', constants: { FIELD: field }, bindings: [...BASE_BINDINGS, binding('menger_boxes', 'storage-buffer', 'read')], uniformLayout: structuredClone(POINT_UNIFORM_LAYOUT) }));
  const derivative = { pipelineId: DERIVATIVE_PIPELINE_ID, kind: 'compute', sourceIds: [...KERNEL_SOURCE_IDS], entryPoint: 'evaluate_derivative',
    constants: {}, bindings: [...BASE_BINDINGS], uniformLayout: structuredClone(POINT_UNIFORM_LAYOUT) };
  return deepFreeze([...points, derivative]);
}
export function fieldPipelineSet() {
  return createPipelineSet({ id: KERNEL_VERSION, descriptors: fieldPipelineDescriptors() });
}
// Flattened for validation records (B02 registry: implementationHashes is a map of strings).
export function implementationHashes() {
  return deepFreeze({ kernelVersion: KERNEL_VERSION, ...Object.fromEntries(Object.entries(KERNEL_HASHES.sources).map(([id, hash]) => [`${id}.wgsl`, hash])),
    ...KERNEL_HASHES.assembled, g5dFragmentSha256: KERNEL_FORMULATION.fragmentSha256 });
}

const refuse = message => { throw new RangeError(message); };
const binary32 = value => typeof value === 'number' && Number.isFinite(value) && Math.fround(value) === value;
function budget(cap) {
  if (!Number.isInteger(cap) || cap < 1 || cap > MAX_ITERATIONS) refuse(`the iteration budget must be an integer in [1, ${MAX_ITERATIONS}]`);
  return cap;
}

// Host-side admission of one point batch's model under effective inputs. Invalid inputs are refused
// here and never dispatched; the kernels recheck the same conditions and report numerical failure.
export function admitPointModel(modelId, effective, cap) {
  const field = FIELD_IDS.indexOf(modelId);
  if (field < 0) refuse(`unknown Space model ${String(modelId)}`);
  budget(cap);
  const base = { modelId, field, cap, power: 0, C: [0, 0, 0, 0], kappa: 0, bound: 2, depth: 0, emptySlice: false };
  if (modelId === 'mandelbulb') {
    if (!Number.isInteger(effective?.power) || effective.power < 2 || effective.power > 8) refuse('the bulb power must be an integer from 2 to 8');
    return deepFreeze({ ...base, power: effective.power });
  }
  if (modelId === 'quaternion-julia') {
    const { C, kappa } = effective ?? {};
    if (!Array.isArray(C) || C.length !== 4 || ![...C, kappa].every(value => binary32(value) && Math.abs(value) <= 4)) refuse('C and kappa must be effective binary32 values in [-4, 4]');
    const { bound } = escapeRadius([...C]);
    return deepFreeze({ ...base, C: [...C], kappa, bound, emptySlice: sliceIsEmpty(kappa, bound) });
  }
  if (modelId === 'menger') {
    if (effective?.depth !== 1 && effective?.depth !== 2) refuse('the Menger depth must be 1 or 2');
    return deepFreeze({ ...base, depth: effective.depth });
  }
  return deepFreeze(base);
}

function packPoints(points, check) {
  if (!Array.isArray(points)) refuse('points must be an array');
  const data = new Float32Array(points.length * 4);
  points.forEach((point, i) => {
    if (!Array.isArray(point) || point.length !== 3) refuse('a point is an array of three numbers');
    if (check && !point.every(binary32)) refuse(`point ${i} must contain three finite effective binary32 values`);
    data.set(point, 4 * i);
  });
  return new Uint8Array(data.buffer);
}
export const encodePoints = points => packPoints(points, true);
// Unchecked: exists only so the headed checks can exercise the in-kernel guards with non-finite bits.
export const encodeRawPoints = points => packPoints(points, false);

export function encodeDerivativeProbes(probes) {
  const data = new Float32Array(probes.length * 4);
  probes.forEach(({ grow, add, updates }, i) => {
    if (!binary32(grow) || grow < 0 || grow > 2 ** 20 || (add !== 0 && add !== 1) || !Number.isInteger(updates) || updates < 0 || updates > MAX_ITERATIONS) refuse('a derivative probe needs grow in [0, 2^20], add 0 or 1 and at most 512 updates');
    data.set([grow, add, updates, 0], 4 * i);
  });
  return new Uint8Array(data.buffer);
}

// A batch covers points [first, first + count) of a grid `pitch` points wide; first is row-aligned.
export function pointRegion({ first, count, pitch }) {
  if (![first, count, pitch].every(Number.isSafeInteger) || first < 0 || count < 1 || pitch < 1 || first % pitch) refuse('a point region needs a row-aligned first index, a positive count and pitch');
  return { x: 0, y: first / pitch, width: Math.min(pitch, count), height: Math.ceil(count / pitch) };
}
export function pointUniforms(model, span) {
  const region = pointRegion(span);
  return { origin: [region.x, region.y], size: [region.width, region.height], c: [...model.C], end: span.first + span.count, pitch: span.pitch,
    cap: model.cap, power: model.power, kappa: model.kappa, bound: model.bound, depth: model.depth, reserved: 0 };
}
// B00 batch bounds for a point batch: no ray steps, the model's iteration budget.
export function pointBounds(model, span) {
  const region = pointRegion(span);
  return { pixels: region.width * region.height, raySteps: 0, iterations: model.cap, normalFieldSamples: 0, shadowRays: 0, shadowSteps: 0, aoSamples: 0 };
}

export function sentinelResults(count) {
  return new Uint8Array(new Uint32Array(count * (POINT_RESULT_BYTES / 4)).fill(RESULT_SENTINEL).buffer);
}

// One decoded record per point, in the reference consumer vocabulary (B04 tolerance-analysis.md
// "Consumer interface"); the derivative mantissa is normalized to [1, 2) as there.
export function decodePointResults(bytes, count, modelId) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < count * POINT_RESULT_BYTES) refuse('result bytes are shorter than the point count');
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * POINT_RESULT_BYTES), analytic = ['sphere', 'box', 'menger'].includes(modelId);
  const components = modelId === 'quaternion-julia' ? 4 : 3, out = [];
  for (let i = 0; i < count; i++) {
    const o = i * POINT_RESULT_BYTES, u32 = k => view.getUint32(o + 4 * k, true), f32 = k => view.getFloat32(o + 4 * k, true);
    const code = u32(0);
    if (code === RESULT_SENTINEL || code > POINT_STATUS.numericalFailure) { out.push({ status: 'missing', code }); continue; }
    const status = STATUS_LABELS.point[code];
    if (status === 'numerical failure') { out.push({ status, index: u32(1), escapeIndex: null, value: null, logEscapeRadius: null, log2DE: null, estimateAvailable: false, derivative: null }); continue; }
    if (analytic) { out.push({ status: 'valid', distance: f32(12), applicability: APPLICABILITY[u32(13)] ?? 'invalid' }); continue; }
    const escaped = status === 'escaped', available = escaped && u32(2) === 0;
    const zero = u32(3) === 1;
    out.push({ status, escapeIndex: escaped ? u32(1) : null, index: u32(1), value: Array.from({ length: components }, (_, k) => f32(4 + k)),
      logEscapeRadius: escaped ? f32(8) : null, estimateAvailable: available, log2DE: available ? f32(9) : null,
      estimateReason: ESTIMATE_REASONS[u32(2)] ?? 'invalid', derivative: zero ? { zero: true, mantissa: 0, exponent: 0 } : { zero: false, mantissa: f32(10), exponent: view.getInt32(o + 44, true) } });
  }
  return out;
}

// Menger boxes as [lo.xyz, 0, hi.xyz, 0] binary32 rows. Faces come from one lattice
// b(k) = (2k − S)/S, S = 3^depth, rounded once, so neighbouring boxes share bit-identical faces.
export function mengerBoxData(depth) {
  const S = 3 ** depth, face = k => Math.fround((2 * k - S) / S), list = boxes(depth), data = new Float32Array(list.length * 8);
  list.forEach(({ centre }, i) => {
    const k = centre.map(c => Math.round((c * S + S - 1) / 2));
    data.set([...k.map(face), 0, ...k.map(index => face(index + 1)), 0], 8 * i);
  });
  return new Uint8Array(data.buffer);
}
