// Space-owned portable descriptors. No backend API or GPU handles cross into shared/.
import { deepFreeze, isPlainObject } from '../../shared/scene.js';

export const PASSES = Object.freeze(['probe', 'trace', 'normals', 'shade', 'accumulate', 'display']);
export const TARGET_LAYOUT_ID = 'space-targets-v1';
export const TARGET_LAYOUT_V1 = deepFreeze({
  depth: { format: 'r32float', bytesPerTexel: 4, count: 1 },
  status: { format: 'r32uint', bytesPerTexel: 4, count: 1 },
  normal: { format: 'rgba16float', bytesPerTexel: 8, count: 1 },
  sampleColor: { format: 'rgba16float', bytesPerTexel: 8, count: 1 },
  lightingStatus: { format: 'r32uint', bytesPerTexel: 4, count: 1 },
  accumulationFlags: { format: 'r32uint', bytesPerTexel: 4, count: 1 },
  accumulation: { format: 'rgba32float', bytesPerTexel: 16, count: 2 },
  display: { format: 'rgba8unorm', bytesPerTexel: 4, count: 1 },
  retained: { format: 'rgba8unorm', bytesPerTexel: 4, count: 1 },
});
export const TRACKED_ALLOCATION_CAP = 2 ** 30;
// Settled defaults and 1b.1 ceilings. Direct lighting keeps normal samples but has
// zero shadow/AO work; raising a ceiling requires a recorded plan amendment.
// normalFieldSamples: rev 5.0 (B11b) — six stencil samples plus the box and Menger one-sided fallback's centre value.
export const LIGHTING_BOUNDS_DEFAULT = Object.freeze({ normalFieldSamples: 7, shadowRays: 1, shadowSteps: 64, aoSamples: 5 });
export const BACKEND_METHODS = Object.freeze(['acquire', 'prepare', 'allocate', 'configureTargets', 'submitBatch', 'readback', 'present', 'release', 'onLoss', 'currentEpoch', 'diagnostics', 'destroy']);
const ERROR_CODES = ['allocation-failed', 'device-lost', 'preparation-failed', 'invalid-descriptor', 'stale-epoch', 'no-admission', 'unavailable'];
export class BackendError extends Error {
  constructor(code, message = code) {
    super(message);
    if (!ERROR_CODES.includes(code)) throw new RangeError(`unknown backend error code ${code}`);
    this.name = 'BackendError'; this.code = code;
  }
}
const invalid = message => { throw new BackendError('invalid-descriptor', message); };
function object(value, name, keys) {
  if (!isPlainObject(value)) invalid(`${name} must be a plain object`);
  if (keys && (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key)))) invalid(`${name} requires exactly ${keys.join(', ')}`);
  return value;
}
function string(value, name) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${name} must be a non-empty string`);
  return value;
}
function count(value, name, max = Number.MAX_SAFE_INTEGER, min = 0) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(`${name} must be an integer in [${min}, ${max}]`);
  return value;
}
function name(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) invalid('slot or field name must be an identifier');
  return value;
}
// Descriptors own their data; opaque resource tokens retain reference identity. Freezing
// a slots wrapper before deepFreeze intentionally avoids traversing backend-owned tokens.
function handle(value) {
  if (value === null || typeof value !== 'object') invalid('resource handle must be an opaque object');
  return value;
}
function slots(value) {
  object(value, 'slots');
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, value]) => [name(key), handle(value)])));
}
function data(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!Array.isArray(value) && !isPlainObject(value)) invalid('descriptor data must contain finite JSON values');
  if (seen.has(value)) invalid('descriptor data must be acyclic');
  seen.add(value);
  const result = Array.isArray(value) ? value.map(item => data(item, seen)) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, data(item, seen)]));
  seen.delete(value); return result;
}
const REVISIONS = ['deviceEpoch', 'viewRevision', 'geometryRevision', 'appearanceRevision'];
function identity(value) {
  object(value, 'identity', ['requestId', 'jobId', 'viewId', 'generation']);
  object(value.generation, 'generation', REVISIONS);
  return deepFreeze({ requestId: string(value.requestId, 'requestId'), jobId: string(value.jobId, 'jobId'), viewId: string(value.viewId, 'viewId'),
    generation: Object.fromEntries(REVISIONS.map(key => [key, count(value.generation[key], key)])),
  });
}
function region(value) {
  object(value, 'region', ['x', 'y', 'width', 'height']);
  const result = { x: count(value.x, 'x'), y: count(value.y, 'y'), width: count(value.width, 'width', Number.MAX_SAFE_INTEGER, 1), height: count(value.height, 'height', Number.MAX_SAFE_INTEGER, 1) };
  count(result.x + result.width, 'region right'); count(result.y + result.height, 'region bottom'); count(result.width * result.height, 'pixels');
  return result;
}
function sample(value) {
  object(value, 'sample', ['sequence', 'seed', 'index']);
  if (value.sequence !== 'atlas-aa-v1') invalid('unknown sampling sequence');
  return { sequence: value.sequence, seed: count(value.seed, 'seed', 0xffffffff), index: count(value.index, 'index', 63) };
}
export function createBatch(value) {
  object(value, 'batch', ['identity', 'pipelineId', 'pass', 'region', 'sample', 'bounds', 'inputs', 'outputs', 'uniforms']);
  if (!PASSES.includes(value.pass)) invalid(`unknown pass ${value.pass}`);
  const area = region(value.region);
  const maxima = { pixels: area.width * area.height, raySteps: 1024, iterations: 512, ...LIGHTING_BOUNDS_DEFAULT };
  object(value.bounds, 'bounds', Object.keys(maxima));
  const bounds = Object.fromEntries(Object.entries(maxima).map(([key, max]) => [key, count(value.bounds[key], key, max)]));
  if (bounds.pixels !== maxima.pixels) invalid('bounds.pixels must equal width × height');
  object(value.uniforms, 'uniforms');
  return deepFreeze({ identity: identity(value.identity), pipelineId: string(value.pipelineId, 'pipelineId'), pass: value.pass,
    region: area, sample: sample(value.sample), bounds, inputs: slots(value.inputs), outputs: slots(value.outputs), uniforms: data(value.uniforms),
  });
}
export function createPickRequest(value) {
  object(value, 'pick', ['identity', 'pixel', 'dimensions', 'geometryRevision', 'sampleIndex']);
  const id = identity(value.identity);
  object(value.dimensions, 'dimensions', ['width', 'height']);
  const dimensions = { width: count(value.dimensions.width, 'width', Number.MAX_SAFE_INTEGER, 1), height: count(value.dimensions.height, 'height', Number.MAX_SAFE_INTEGER, 1) };
  if (!Array.isArray(value.pixel) || value.pixel.length !== 2) invalid('pixel must be [x, y]');
  const pixel = [count(value.pixel[0], 'x', dimensions.width - 1), count(value.pixel[1], 'y', dimensions.height - 1)];
  if (value.geometryRevision !== id.generation.geometryRevision) invalid('pick geometryRevision must match identity');
  return deepFreeze({ identity: id, pixel, dimensions, geometryRevision: value.geometryRevision, sampleIndex: count(value.sampleIndex, 'sampleIndex', 63) });
}
export function createAdmission({ epoch, jobId }) {
  count(epoch, 'epoch', Number.MAX_SAFE_INTEGER, 1); string(jobId, 'jobId');
  let consumed = false;
  return Object.freeze({ epoch, jobId, consume() { if (consumed) return false; consumed = true; return true; } });
}

// bindings[i] names the WGSL variable at @group(0) @binding(i). Uniform fields
// are packed by byte offset (matrices column-major). A nonempty uniformLayout
// supplies exactly one generated uniform binding; it is absent from handle slots.
// Empty layouts permit ordinary, explicitly allocated uniform input handles.
// Auto-layout bind groups are created from their own prepared pipeline's layout.
const BINDING_ACCESS = {
  'uniform-buffer': ['read'], 'storage-buffer': ['read', 'read-write'],
  texture: ['read'], 'storage-texture': ['read', 'write', 'read-write'], sampler: ['read'],
};
const UNIFORM_TYPES = { f32: [4, 4], u32: [4, 4], i32: [4, 4] };
for (const scalar of ['f32', 'u32', 'i32']) for (const size of [2, 3, 4]) UNIFORM_TYPES[`vec${size}<${scalar}>`] = [size * 4, size === 2 ? 8 : 16];
UNIFORM_TYPES['mat4x4<f32>'] = [64, 16];
export function validatePipelineDescriptor(value) {
  if (!['compute', 'render'].includes(value?.kind)) invalid('pipeline kind must be compute or render');
  const entries = value.kind === 'compute' ? ['entryPoint'] : ['vertexEntryPoint', 'fragmentEntryPoint'];
  object(value, 'pipeline descriptor', ['pipelineId', 'kind', 'sourceIds', ...entries, 'constants', 'bindings', 'uniformLayout']);
  string(value.pipelineId, 'pipelineId'); entries.forEach(key => name(value[key]));
  if (!Array.isArray(value.sourceIds) || !value.sourceIds.length) invalid('sourceIds must be non-empty');
  value.sourceIds.forEach(id => string(id, 'sourceId'));
  if (new Set(value.sourceIds).size !== value.sourceIds.length) invalid('duplicate sourceId');
  object(value.constants, 'constants');
  for (const [key, constant] of Object.entries(value.constants)) {
    name(key); if (typeof constant !== 'boolean' && !(typeof constant === 'number' && Number.isFinite(constant))) invalid('pipeline constants must be finite numbers or booleans');
  }
  if (!Array.isArray(value.bindings)) invalid('bindings must be an array');
  const used = new Set();
  for (const binding of value.bindings) {
    object(binding, 'binding', ['slot', 'type', 'access']); name(binding.slot);
    if (used.has(binding.slot)) invalid('duplicate binding slot'); used.add(binding.slot);
    if (!Object.hasOwn(BINDING_ACCESS, binding.type) || !BINDING_ACCESS[binding.type].includes(binding.access)) invalid('unknown binding type or invalid access');
  }
  object(value.uniformLayout, 'uniformLayout', ['byteLength', 'fields']);
  const { byteLength, fields } = value.uniformLayout;
  count(byteLength, 'uniform byteLength'); if (byteLength % 16) invalid('uniform byteLength must be a multiple of 16');
  if (!Array.isArray(fields)) invalid('uniform fields must be an array');
  if (byteLength > 0 && value.bindings.filter(binding => binding.type === 'uniform-buffer').length !== 1) invalid('uniform layout requires exactly one generated uniform-buffer binding');
  const names = new Set(), ranges = [];
  for (const field of fields) {
    object(field, 'uniform field', ['name', 'type', 'offset']); name(field.name);
    if (names.has(field.name)) invalid('duplicate uniform field'); names.add(field.name);
    const type = UNIFORM_TYPES[field.type]; if (!Object.hasOwn(UNIFORM_TYPES, field.type)) invalid('unknown uniform type');
    const [bytes, alignment] = type, start = count(field.offset, 'uniform offset'), end = start + bytes;
    if (start % alignment || end > byteLength || ranges.some(([lo, hi]) => start < hi && end > lo)) invalid('misaligned, overlapping or out-of-range uniform field');
    ranges.push([start, end]);
  }
  return deepFreeze(data(value));
}
export function createPipelineSet({ id, descriptors }) {
  string(id, 'pipelineSet id'); if (!Array.isArray(descriptors) || !descriptors.length) invalid('pipeline set must contain descriptors');
  const snapshots = descriptors.map(validatePipelineDescriptor);
  if (new Set(snapshots.map(item => item.pipelineId)).size !== snapshots.length) invalid('duplicate pipelineId');
  return deepFreeze({ id, descriptors: snapshots });
}
function operation(value, requestIdentity) {
  const payload = value?.kind === 'batch' ? 'batch' : 'descriptor';
  object(value, 'operation', ['id', 'dependsOn', 'kind', payload]); string(value.id, 'operation id');
  if (!Array.isArray(value.dependsOn) || new Set(value.dependsOn).size !== value.dependsOn.length) invalid('dependsOn must contain unique operation ids');
  value.dependsOn.forEach(id => string(id, 'dependency'));
  let descriptor;
  if (value.kind === 'batch') descriptor = createBatch(value.batch);
  else if (value.kind === 'readback') {
    const desc = object(value.descriptor, 'readback', ['identity', 'source', 'region', 'fields']), area = region(desc.region);
    if (area.height > 256) invalid('readback is limited to 256 rows');
    if (!Array.isArray(desc.fields) || !desc.fields.length || new Set(desc.fields).size !== desc.fields.length) invalid('readback fields must be non-empty and unique');
    desc.fields.forEach(name);
    descriptor = Object.freeze({ identity: identity(desc.identity), source: handle(desc.source), region: deepFreeze(area), fields: Object.freeze([...desc.fields]) });
  } else if (value.kind === 'presentation') {
    const desc = object(value.descriptor, 'presentation', ['identity', 'display']);
    descriptor = Object.freeze({ identity: identity(desc.identity), display: handle(desc.display) });
  } else invalid('unknown operation kind');
  const actual = descriptor.identity;
  if (['requestId', 'jobId', 'viewId'].some(key => actual[key] !== requestIdentity[key]) || REVISIONS.some(key => actual.generation[key] !== requestIdentity.generation[key])) invalid('operation identity must match request');
  return Object.freeze({ id: value.id, kind: value.kind, dependsOn: Object.freeze([...value.dependsOn]), [payload]: descriptor });
}
function graph(operations) {
  const byId = new Map(operations.map(op => [op.id, op]));
  if (byId.size !== operations.length) invalid('duplicate operation id');
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    if (!byId.has(id)) invalid(`missing dependency ${id}`);
    if (visiting.has(id)) invalid('operation dependencies must be acyclic');
    visiting.add(id); byId.get(id).dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  }
  byId.forEach((_, id) => visit(id)); return byId;
}
// next() reserves, including across asynchronous submissions. advance() accepts only
// successful completion. onAdvance(op, evidence, pending) may return a replacement pending
// list; original pending ids must survive as completion barriers when bands subdivide.
export function createJobPlan({ request, operations, onAdvance }) {
  object(request, 'request'); const id = identity(Object.fromEntries(['requestId', 'jobId', 'viewId', 'generation'].map(key => [key, request[key]])));
  if (!Array.isArray(operations)) invalid('operations must be an array');
  if (onAdvance !== undefined && typeof onAdvance !== 'function') invalid('onAdvance must be a function');
  const snapshot = deepFreeze(data(request));
  let items = operations.map(op => operation(op, id)), byId = graph(items);
  const reserved = new Set(), completed = new Set();
  return Object.freeze({ request: snapshot,
    next() {
      const op = items.find(item => !reserved.has(item.id) && !completed.has(item.id) && item.dependsOn.every(dep => completed.has(dep)));
      if (!op) return null; reserved.add(op.id); return op;
    },
    advance(op, completion) {
      if (byId.get(op?.id) !== op || !reserved.has(op.id)) invalid('advance requires the reserved operation exactly once');
      object(completion, 'completion');
      if (Object.keys(completion).some(key => !['epoch', 'elapsedMs', 'timestampMs', 'targetMs'].includes(key))) invalid('advance requires completion evidence, never an outcome');
      if (completion.epoch !== id.generation.deviceEpoch) invalid('completion epoch mismatch');
      if (!Number.isFinite(completion.elapsedMs) || completion.elapsedMs < 0) invalid('elapsedMs must be finite and nonnegative');
      if (completion.timestampMs !== undefined && (!Number.isFinite(completion.timestampMs) || completion.timestampMs < 0)) invalid('timestampMs must be finite and nonnegative');
      if (completion.targetMs !== undefined && (!Number.isFinite(completion.targetMs) || completion.targetMs <= 0)) invalid('targetMs must be finite and positive');
      const pending = items.filter(item => !reserved.has(item.id) && !completed.has(item.id));
      const replacements = onAdvance?.(op, deepFreeze(data(completion)), Object.freeze(pending));
      if (replacements !== undefined) {
        if (!Array.isArray(replacements)) invalid('onAdvance must return pending operations or undefined');
        const next = replacements.map(item => operation(item, id));
        if (pending.some(item => !next.some(candidate => candidate.id === item.id))) invalid('subdivision must preserve pending completion barriers');
        const kept = items.filter(item => reserved.has(item.id) || completed.has(item.id));
        const combined = [...kept, ...next], validated = graph(combined);
        const ancestors = operationId => {
          const found = new Set(), visit = target => {
            for (const dependency of validated.get(target).dependsOn) if (!found.has(dependency)) { found.add(dependency); visit(dependency); }
          };
          visit(operationId); return found;
        };
        for (const previous of pending) {
          const dependencies = ancestors(previous.id);
          if (previous.dependsOn.some(dependency => !dependencies.has(dependency))) invalid('subdivision cannot bypass a dependency');
        }
        items = combined; byId = validated;
      }
      reserved.delete(op.id); completed.add(op.id);
    },
    exhausted() { return completed.size === items.length; },
  });
}
export function mix(value) {
  value >>>= 0;
  for (let i = 0; i < 2; i++) value = Math.imul(value ^ (value >>> 16), 0x045d9f3b) >>> 0;
  return value;
}
export function sampleJitter({ seed, sampleIndex, pixel }) {
  count(seed, 'seed', 0xffffffff); count(sampleIndex, 'sampleIndex', 63);
  if (!Array.isArray(pixel) || pixel.length !== 2) invalid('pixel must be [x, y]');
  const [x, y] = pixel; count(x, 'pixel x', 0xffffffff); count(y, 'pixel y', 0xffffffff);
  if (sampleIndex === 0) return { dx: 0, dy: 0 };
  const h = mix(seed ^ mix(sampleIndex ^ mix(x ^ mix(y))));
  return { dx: ((h & 0xffff) + 0.5) / 65536 - 0.5, dy: (((h >>> 16) & 0xffff) + 0.5) / 65536 - 0.5 };
}
export function assertBackend(impl) {
  for (const method of BACKEND_METHODS) if (typeof impl?.[method] !== 'function') invalid(`invalid backend implementation: missing method ${method}()`);
  return impl;
}
