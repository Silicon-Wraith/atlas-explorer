// Pipeline preparation, binding validation and uniform packing (spec §9.1 "Pipelines", "Pipeline
// descriptors"; plan B06). Every pipeline is created asynchronously with layout 'auto' under one
// absolute bound per attempt; a timeout invalidates the attempt and late promises cannot revive it.
// bindings[i] is @group(0) @binding(i); a nonempty uniformLayout is one generated uniform binding.
import { BackendError, createPipelineSet } from '../backend.js';
import { deepFreeze } from '../../../shared/scene.js';
import { loadShaderSource, shaderCode } from './shaders.js';

export const PREPARATION_BOUND_MS = 60_000; // plan default
export const WORKGROUP_SIZE = Object.freeze([8, 8]); // every B06 compute entry point: @workgroup_size(8, 8, 1)
const invalid = message => { throw new BackendError('invalid-descriptor', message); };
const region = (x, y, width, height) => ({ origin: [x, y], size: [width, height] });
const probeLayout = { byteLength: 16, fields: [{ name: 'origin', type: 'vec2<u32>', offset: 0 }, { name: 'size', type: 'vec2<u32>', offset: 8 }] };
const compute = (pipelineId, entryPoint, outputSlot) => ({ pipelineId, kind: 'compute', sourceIds: [pipelineId], entryPoint, constants: {},
  bindings: [{ slot: 'u', type: 'uniform-buffer', access: 'read' }, { slot: outputSlot, type: 'storage-texture', access: 'write' }], uniformLayout: probeLayout });

export const PRESENT_PIPELINE_ID = 'present';
// The executable self-check set (B06). B08, B10 and B11 register product descriptors of their own.
export const SELF_CHECK_PIPELINE_SET = createPipelineSet({ id: 'b06-self-check', descriptors: [
  compute('probe', 'probe', 'probe_target'),
  compute('probe-display', 'probe_display', 'display'),
  compute('selfcheck-trace', 'selfcheck_trace', 'depth'),
  { pipelineId: PRESENT_PIPELINE_ID, kind: 'render', sourceIds: ['present'], vertexEntryPoint: 'present_vertex', fragmentEntryPoint: 'present_fragment', constants: {},
    bindings: [{ slot: 'u', type: 'uniform-buffer', access: 'read' }, { slot: 'display', type: 'texture', access: 'read' }],
    uniformLayout: { byteLength: 16, fields: [{ name: 'internal_size', type: 'vec2<u32>', offset: 0 }, { name: 'output_size', type: 'vec2<u32>', offset: 8 }] } },
] });
export const probeUniforms = region;

// Pipeline layouts against the granted limits (rev 4.4 ruling (a)); a set that cannot bind is a
// preparation failure, found before any compilation.
export function checkLayoutLimits(pipelineSet, limits = {}) {
  const limit = key => (Number.isFinite(limits[key]) ? limits[key] : Infinity);
  for (const descriptor of pipelineSet.descriptors) {
    const counts = type => descriptor.bindings.filter(binding => binding.type === type).length;
    const checks = [['storage-buffer', 'maxStorageBuffersPerShaderStage'], ['storage-texture', 'maxStorageTexturesPerShaderStage']];
    for (const [type, key] of checks) if (counts(type) > limit(key)) throw new BackendError('preparation-failed', `${descriptor.pipelineId}: ${counts(type)} ${type} bindings exceed ${key} = ${limits[key]}`);
    if (descriptor.uniformLayout.byteLength > limit('maxUniformBufferBindingSize')) throw new BackendError('preparation-failed', `${descriptor.pipelineId}: uniform layout exceeds maxUniformBufferBindingSize`);
    if (descriptor.kind === 'compute' && WORKGROUP_SIZE[0] * WORKGROUP_SIZE[1] > limit('maxComputeInvocationsPerWorkgroup')) throw new BackendError('preparation-failed', 'workgroup size exceeds maxComputeInvocationsPerWorkgroup');
  }
}

// One absolute bound, armed once. Progress events {stage, completed, total}: 'preparing' first,
// then each pipelineId as it completes. Resolves {preparedPipelineIds, pipelines: Map(id → {descriptor,
// pipeline, messages})}; `pipelines` stays inside the backend.
export function preparePipelines({ device, pipelineSet, onProgress, boundMs = PREPARATION_BOUND_MS, loadSource = loadShaderSource, format, limits = {} }) {
  const set = createPipelineSet(pipelineSet);
  if (onProgress !== undefined && typeof onProgress !== 'function') invalid('onProgress must be a function');
  checkLayoutLimits(set, limits);
  if (set.descriptors.some(descriptor => descriptor.kind === 'render') && typeof format !== 'string') invalid('render pipelines need the canvas format');
  const total = set.descriptors.length;
  let completed = 0, invalidated = false, timer;
  const emit = stage => { if (!invalidated) onProgress?.(deepFreeze({ stage, completed, total })); };
  emit('preparing');
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { invalidated = true; reject(new BackendError('preparation-failed', `preparation did not finish within ${boundMs} ms (${completed} of ${total})`)); }, boundMs);
  });
  const work = (async () => {
    const codes = await Promise.all(set.descriptors.map(descriptor => shaderCode(descriptor.sourceIds, loadSource)));
    if (invalidated) return null;
    // Scopes are pushed and popped synchronously around each creation, so concurrent work cannot interleave.
    const pending = set.descriptors.map((descriptor, index) => {
      device.pushErrorScope('validation');
      const module = device.createShaderModule({ code: codes[index], label: descriptor.pipelineId });
      const stage = (entryPoint, extra = {}) => ({ module, entryPoint, constants: { ...descriptor.constants }, ...extra });
      const created = descriptor.kind === 'compute'
        ? device.createComputePipelineAsync({ label: descriptor.pipelineId, layout: 'auto', compute: stage(descriptor.entryPoint) })
        : device.createRenderPipelineAsync({ label: descriptor.pipelineId, layout: 'auto', vertex: stage(descriptor.vertexEntryPoint),
          fragment: stage(descriptor.fragmentEntryPoint, { targets: [{ format }] }), primitive: { topology: 'triangle-list' } });
      const scope = device.popErrorScope();
      return (async () => {
        let pipeline = null, failure = null;
        try { pipeline = await created; } catch (error) { failure = `${error?.name ?? 'Error'}: ${error?.message ?? error}${error?.reason ? ` (${error.reason})` : ''}`; }
        const scoped = await scope;
        const messages = (await module.getCompilationInfo()).messages.map(message => ({ type: message.type, line: message.lineNum, text: message.message }));
        const errors = messages.filter(message => message.type === 'error');
        if (scoped) failure = `${failure ? `${failure}; ` : ''}validation: ${scoped.message}`;
        if (errors.length) failure = `${failure ? `${failure}; ` : ''}compilation: ${JSON.stringify(errors)}`;
        if (failure) throw new BackendError('preparation-failed', `${descriptor.pipelineId}: ${failure}`);
        if (invalidated) return null;
        completed++; emit(descriptor.pipelineId);
        return [descriptor.pipelineId, Object.freeze({ descriptor, pipeline, messages: Object.freeze(messages) })];
      })();
    });
    return Promise.all(pending);
  })();
  work.catch(() => {}); // a late failure after a timeout is not an unhandled rejection
  return Promise.race([work, timeout]).then(results => {
    if (invalidated || !results) throw new BackendError('preparation-failed', 'preparation attempt invalidated');
    invalidated = true; // nothing late may report progress for a settled attempt
    return { preparedPipelineIds: Object.freeze(set.descriptors.map(descriptor => descriptor.pipelineId)), pipelines: new Map(results) };
  }, error => { invalidated = true; throw error instanceof BackendError ? error : new BackendError('preparation-failed', String(error?.message ?? error)); })
    .finally(() => clearTimeout(timer));
}

// Batch slots against the prepared descriptor (the B00 ABI, as the fake checks it). `resolve(handle)`
// returns the allocator entry (throws for foreign, retired or released handles).
export function validateBindings(batch, descriptor, resolve) {
  const expected = new Set(descriptor.bindings.map(binding => binding.slot));
  for (const slot of [...Object.keys(batch.inputs), ...Object.keys(batch.outputs)]) if (!expected.has(slot)) invalid(`unknown slot ${slot}`);
  const generated = descriptor.uniformLayout.byteLength > 0;
  for (const binding of descriptor.bindings) {
    if (binding.type === 'uniform-buffer' && generated) {
      if (Object.hasOwn(batch.inputs, binding.slot) || Object.hasOwn(batch.outputs, binding.slot)) invalid('generated uniform slot must not carry a handle');
      continue;
    }
    if (binding.access !== 'write' && !Object.hasOwn(batch.inputs, binding.slot)) invalid(`missing input ${binding.slot}`);
    if (binding.access !== 'read' && !Object.hasOwn(batch.outputs, binding.slot)) invalid(`missing output ${binding.slot}`);
    if (binding.access === 'read' && Object.hasOwn(batch.outputs, binding.slot)) invalid(`read-only output ${binding.slot}`);
    if (binding.access === 'write' && Object.hasOwn(batch.inputs, binding.slot)) invalid(`write-only input ${binding.slot}`);
    if (binding.access === 'read-write' && batch.inputs[binding.slot] !== batch.outputs[binding.slot]) invalid('read-write slots require the same input and output handle');
    const entry = resolve(batch.inputs[binding.slot] ?? batch.outputs[binding.slot]);
    const image = entry.description.width !== undefined;
    if (binding.type === 'sampler') invalid('sampler bindings have no allocation path in 1b.1');
    if (['storage-buffer', 'uniform-buffer'].includes(binding.type)) {
      if (image || entry.description.usage !== (binding.type === 'storage-buffer' ? 'storage' : 'uniform')) invalid(`buffer usage does not match binding ${binding.slot}`);
    } else if (!image) invalid(`binding ${binding.slot} needs a texture`);
  }
  packUniforms(descriptor.uniformLayout, batch.uniforms);
}

const COMPONENTS = type => (type.startsWith('vec') ? Number(type[3]) : type === 'mat4x4<f32>' ? 16 : 1);
// Little-endian at each field's byte offset; matrices column-major as given. Validates every value.
export function packUniforms(layout, values) {
  const bytes = new Uint8Array(layout.byteLength), view = new DataView(bytes.buffer);
  if (Object.keys(values).length !== layout.fields.length) invalid('uniform fields do not match layout');
  for (const field of layout.fields) {
    if (!Object.hasOwn(values, field.name)) invalid(`missing uniform ${field.name}`);
    const length = COMPONENTS(field.type), value = values[field.name], list = length === 1 ? [value] : value;
    if (!Array.isArray(list) || list.length !== length) invalid(`uniform ${field.name} does not match its type`);
    list.forEach((component, index) => {
      if (typeof component !== 'number' || !Number.isFinite(component)) invalid('uniform component must be finite');
      const offset = field.offset + 4 * index;
      if (field.type.includes('u32')) { if (!Number.isInteger(component) || component < 0 || component > 0xffffffff) invalid('invalid u32 uniform'); view.setUint32(offset, component, true); }
      else if (field.type.includes('i32')) { if (!Number.isInteger(component) || component < -2147483648 || component > 2147483647) invalid('invalid i32 uniform'); view.setInt32(offset, component, true); }
      else { if (!Number.isFinite(Math.fround(component))) invalid('uniform overflows f32'); view.setFloat32(offset, component, true); }
    });
  }
  return bytes;
}
