// The WebGPU backend (spec §9, §8.3, §15, the §9.1 annex; plan B06). It owns the device, every
// resource, encoding, submission, completion, presentation and readback; shared and UI code see only
// the B00 contract (BACKEND_METHODS), opaque handles and frozen records — never a GPUDevice.
//   - Every queue submission consumes one single-use admission lease for the current epoch.
//   - One command buffer per operation; error scopes are pushed and popped synchronously around it.
//   - A ticket settles only once both error scopes and the queue fence have resolved: `failed` when a
//     scope captured an error (or the work never reached the queue), otherwise `completed`; loss
//     settles every outstanding ticket `interrupted`. Failed and interrupted tickets carry null timing.
//   - Observed loss makes the backend unavailable and zeroes the epoch before listeners run.
import { BackendError, createBatch, TARGET_LAYOUT_ID, TARGET_LAYOUT_V1, TRACKED_ALLOCATION_CAP } from '../backend.js';
import { deepFreeze, isPlainObject } from '../../../shared/scene.js';
import { acquireDevice, IDENTITY_FIELDS } from './device.js';
import { createTrackedAllocator } from './allocator.js';
import { packUniforms, preparePipelines, PREPARATION_BOUND_MS, PRESENT_PIPELINE_ID, validateBindings, WORKGROUP_SIZE } from './pipelines.js';
import { createPresenter } from './present.js';

const invalid = message => { throw new BackendError('invalid-descriptor', message); };
const count = (value, label, min = 0) => { if (!Number.isSafeInteger(value) || value < min) invalid(`${label} must be a safe integer >= ${min}`); return value; };
const alignUp = (value, alignment) => Math.ceil(value / alignment) * alignment;
function record(value, keys, label) {
  if (!isPlainObject(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) invalid(`${label} requires exactly ${keys.join(', ')}`);
}
function identity(value) {
  record(value, ['requestId', 'jobId', 'viewId', 'generation'], 'identity');
  record(value.generation, ['deviceEpoch', 'viewRevision', 'geometryRevision', 'appearanceRevision'], 'generation');
  for (const key of ['requestId', 'jobId', 'viewId']) if (typeof value[key] !== 'string' || !value[key].trim()) invalid(`${key} must be non-empty`);
  for (const revision of Object.values(value.generation)) count(revision, 'revision');
  return deepFreeze(structuredClone(value));
}
function area(value) {
  record(value, ['x', 'y', 'width', 'height'], 'region');
  for (const key of ['x', 'y']) count(value[key], key);
  for (const key of ['width', 'height']) count(value[key], key, 1);
  return deepFreeze({ ...value });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {}); // a caller may observe done before result; keep a rejection for later observers
  return { promise, resolve, reject };
}
const message = error => String(error?.message ?? error);
// Native usage is derived here (§9.1 Allocator): storage and uniform buffers support copy-out for
// readback; staging is map-read; target textures are storage-writable, sampled (read-only inputs use
// textureLoad, ruling (a)) and copyable to staging.
const BUFFER_USAGE = {
  storage: () => GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  uniform: () => GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC,
  staging: () => GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
};
const TEXTURE_USAGE = () => GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;

export function createWebGPUBackend({ canvas, clock, acquire = acquireDevice, enableTimestamps = false, preparationBoundMs = PREPARATION_BOUND_MS, loadSource, onPhase, cap = TRACKED_ALLOCATION_CAP } = {}) {
  const now = typeof clock === 'function' ? clock : clock?.now?.bind(clock);
  if (typeof now !== 'function') throw new TypeError('createWebGPUBackend requires an injected clock');
  if (!canvas) throw new TypeError('createWebGPUBackend requires a canvas');
  if (onPhase !== undefined && typeof onPhase !== 'function') throw new TypeError('onPhase must be a function');
  // GPU timestamps are a separate measurement (§9.1 Batches); B06 does not implement them and never
  // reports timestampMs. Requesting them is refused rather than silently ignored.
  if (enableTimestamps) throw new BackendError('unavailable', 'GPU timestamp measurement is not implemented in B06');
  let state = 'unavailable', epoch = 0, lastEpoch = 0, attempt = null, acquiring = false, targets = null, nextTicket = 0;
  const pipelines = new Map(), pending = new Set(), mappings = new Set(), preparations = new Set(), listeners = new Set(), stagingPool = [], errors = [];
  const allocator = createTrackedAllocator({ cap, clock: now, factory: {
    create(desc) {
      const { device } = attempt;
      if (desc.width !== undefined) return device.createTexture({ label: desc.name, size: [desc.width, desc.height], format: desc.format, usage: TEXTURE_USAGE() });
      const usage = BUFFER_USAGE[desc.usage]?.();
      if (!usage) throw new Error(`no native usage for ${desc.usage}`);
      const buffer = device.createBuffer({ label: desc.name, size: desc.bytes, usage, mappedAtCreation: desc.data !== undefined });
      // Initial contents through mappedAtCreation: copied, unmapped before returning; no queue work.
      if (desc.data !== undefined) { new Uint8Array(buffer.getMappedRange()).set(desc.data); buffer.unmap(); }
      return buffer;
    },
    destroy(native) { native.destroy(); },
  } });

  // Long-task attribution on the production path (B01 Q2): every backend phase reports its interval.
  function phase(name, start, detail = {}) {
    if (!onPhase) return;
    try { onPhase(Object.freeze({ phase: name, start, end: now(), epoch, ...detail })); } catch { /* an observer never disturbs the backend */ }
  }
  function available() { if (state !== 'ready') throw new BackendError('unavailable', `backend is ${state}`); }
  function checkEpoch(value) { available(); if (value !== epoch) throw new BackendError('stale-epoch', `epoch ${value} is not the current epoch ${epoch}`); }
  const entry = (handle, allowRetiring = false) => allocator.lookup(handle, { allowRetiring });
  function scoped(device, what) {
    device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
    let thrown = null, value;
    try { value = what(); } catch (error) { thrown = error; }
    const oom = device.popErrorScope(), validation = device.popErrorScope();
    const captured = Promise.all([validation, oom]).then(([v, o]) => v ?? o ?? null, error => error);
    return { value, thrown, captured };
  }

  function admissionFor(id, options) {
    checkEpoch(id.generation.deviceEpoch);
    const admission = options?.admission;
    if (!admission || typeof admission.consume !== 'function') throw new BackendError('no-admission');
    if (admission.epoch !== epoch) throw new BackendError('stale-epoch', 'admission belongs to another epoch');
    if (admission.jobId !== id.jobId) throw new BackendError('no-admission', 'admission belongs to another job');
    return () => { if (admission.consume() !== true) throw new BackendError('no-admission', 'admission already consumed'); };
  }
  function makeTicket(id, handles, extra = {}) {
    const done = deferred();
    const ticket = Object.freeze({ id: `webgpu-ticket-${++nextTicket}`, identity: id, submittedAt: now(), done: done.promise, ...(extra.result ? { result: extra.result.promise } : {}) });
    const item = { ticket, done, attempt, epoch, ...extra };
    for (const handle of new Set(handles)) allocator.hold(handle, item, 'ticket');
    pending.add(item);
    return item;
  }
  function endMapping(item, error) {
    if (!mappings.delete(item)) return;
    allocator.unhold(item.mapping); item.staging.busy = false;
    if (error) item.result.reject(error);
  }
  function settle(item, outcome, reason, timing = {}) {
    if (!pending.has(item)) return false;
    // A resolved fence after loss (or during a test-adapter destroy) does not establish successful work.
    if (outcome === 'completed' && (state !== 'ready' || item.attempt !== attempt || item.attempt.lossPending)) { outcome = 'interrupted'; reason = 'device-lost'; }
    pending.delete(item);
    const completed = outcome === 'completed';
    const value = deepFreeze({ outcome, reason, queueCompletedAt: completed ? now() : null, timing: { method: 'queue-completion', elapsedMs: completed ? timing.elapsedMs : null } });
    allocator.unhold(item);
    item.done.resolve(value);
    if (item.result) { if (completed) mapAndCopy(item); else endMapping(item, new BackendError(outcome === 'interrupted' ? 'device-lost' : 'unavailable', reason)); }
    return true;
  }
  // One command buffer under synchronous error scopes. Work that throws before submission never entered
  // the queue and fails at once; otherwise the ticket waits for both scopes and the fence.
  function submit(item, label, encode) {
    const { device } = attempt, started = now();
    const { thrown, captured } = scoped(device, () => {
      const encoder = device.createCommandEncoder({ label });
      encode(encoder);
      device.queue.submit([encoder.finish()]);
    });
    phase(`submit:${label}`, started, { ticket: item.ticket.id });
    if (thrown) { captured.then(() => {}); settle(item, 'failed', `${label}: ${message(thrown)}`); return; }
    const fence = device.queue.onSubmittedWorkDone();
    Promise.all([captured, fence]).then(([error]) => {
      if (error) settle(item, 'failed', `${label}: ${message(error)}`);
      else settle(item, 'completed', null, { elapsedMs: now() - item.ticket.submittedAt });
    }, error => settle(item, 'interrupted', `device-lost: ${message(error)}`));
  }
  function mapAndCopy(item) {
    const { staging, bytes, rowBytes, bytesPerRow, rows } = item.copy, buffer = entry(staging.handle, true).native;
    buffer.mapAsync(GPUMapMode.READ, 0, bytes).then(() => {
      if (!mappings.has(item)) return;
      if (state !== 'ready' || item.attempt !== attempt) { endMapping(item, new BackendError('device-lost')); return; }
      const mapped = new Uint8Array(buffer.getMappedRange(0, bytes)), data = new Uint8Array(rowBytes * rows);
      for (let row = 0; row < rows; row++) data.set(mapped.subarray(row * bytesPerRow, row * bytesPerRow + rowBytes), row * rowBytes);
      buffer.unmap();
      // The mapping ends (and staging is free) before the result resolves; the bytes belong to the caller.
      endMapping(item);
      item.result.resolve(Object.freeze({ identity: item.ticket.identity, region: item.region, fields: item.fields, data }));
    }, error => endMapping(item, new BackendError('device-lost', `mapAsync: ${message(error)}`)));
  }

  function invalidate(reason, text, terminal) {
    if (state === 'destroyed') return false;
    const lostEpoch = epoch, hadDevice = state === 'ready', retired = attempt;
    state = terminal ? 'destroyed' : 'unavailable'; epoch = 0; attempt = null; targets = null; pipelines.clear(); stagingPool.length = 0;
    for (const preparation of [...preparations]) preparation.reject(new BackendError('device-lost', text));
    preparations.clear();
    for (const item of [...pending]) settle(item, 'interrupted', reason);
    for (const item of [...mappings]) endMapping(item, new BackendError('device-lost', text));
    allocator.destroyAll();
    if (retired) {
      retired.presenter.unconfigure();
      try { retired.device.destroy(); } catch { /* already lost */ }
      retired.resolveLost?.();
    }
    if (hadDevice && !terminal) {
      const event = deepFreeze({ epoch: lostEpoch, reason, message: text });
      for (const listener of [...listeners]) { try { listener(event); } catch (error) { errors.push({ kind: 'listener', at: now(), message: message(error) }); } }
    }
    if (terminal) listeners.clear();
    return hadDevice;
  }
  // The device.lost observer: only the current attempt's loss counts; retired attempts are ignored.
  function observeLoss({ attemptId, reason, message: text }) {
    if (!attempt || attempt.attemptId !== attemptId) return;
    invalidate(reason || 'unknown', text || reason || 'unknown', false);
  }

  const backend = {
    async acquire() {
      if (state === 'destroyed') throw new BackendError('unavailable', 'terminal teardown');
      if (state === 'ready' || acquiring) throw new BackendError('unavailable', 'device already acquired');
      acquiring = true;
      const started = now();
      let result;
      try { result = await acquire({ onLost: observeLoss }); }
      catch (error) { throw new BackendError('unavailable', `acquisition failed: ${message(error)}`); }
      finally { acquiring = false; }
      if (state === 'destroyed') { try { result.device.destroy(); } catch { /* ignore */ } throw new BackendError('unavailable', 'terminal teardown'); }
      const { device } = result;
      let presenter;
      try { presenter = createPresenter({ device, canvas }); }
      catch (error) { try { device.destroy(); } catch { /* ignore */ } throw new BackendError('unavailable', `canvas configuration failed: ${message(error)}`); }
      epoch = ++lastEpoch; state = 'ready';
      attempt = { attemptId: result.attemptId, device, presenter, limits: result.limits, lossPending: false };
      attempt.lost = new Promise(resolve => { attempt.resolveLost = resolve; });
      allocator.setEpoch(epoch);
      const current = attempt;
      device.addEventListener?.('uncapturederror', event => { if (current === attempt) errors.push({ kind: 'uncaptured', at: now(), message: message(event.error) }); });
      phase('acquire', started);
      return deepFreeze({ epoch, identity: { attemptId: result.attemptId, ...Object.fromEntries(IDENTITY_FIELDS.map(field => [field, result.identity[field]])), isFallbackAdapter: result.isFallbackAdapter },
        limits: result.limits, adapterLimits: result.adapterLimits, requestedLimits: result.requestedLimits, features: result.features.granted, canvasFormat: presenter.format });
    },
    async prepare({ epoch: requestedEpoch, pipelineSet, onProgress } = {}) {
      checkEpoch(requestedEpoch);
      const current = attempt, started = now(), abort = deferred();
      preparations.add(abort);
      try {
        const result = await Promise.race([preparePipelines({ device: current.device, pipelineSet, onProgress, boundMs: preparationBoundMs, loadSource, format: current.presenter.format, limits: current.limits }), abort.promise]);
        if (current !== attempt) throw new BackendError('device-lost', 'the device was lost during preparation');
        for (const [id, prepared] of result.pipelines) pipelines.set(id, prepared);
        return deepFreeze({ epoch, pipelineSetId: pipelineSet.id, preparedPipelineIds: [...result.preparedPipelineIds] });
      } finally { preparations.delete(abort); phase('prepare', started, { pipelineSetId: pipelineSet?.id }); }
    },
    // Production buffers only: {name, bytes, usage: 'storage' | 'uniform', data?}. No queue work, no lease.
    allocate(desc) {
      available();
      if (!isPlainObject(desc) || Object.keys(desc).some(key => !['name', 'bytes', 'usage', 'data'].includes(key))) invalid('allocate takes exactly {name, bytes, usage, data?}');
      if (!['storage', 'uniform'].includes(desc.usage)) invalid('buffer usage must be storage or uniform');
      count(desc.bytes, 'buffer bytes', 1);
      if (desc.bytes % 4) invalid('buffer bytes must be a multiple of four');
      if (desc.data !== undefined && (!(desc.data instanceof Uint8Array) || desc.data.byteLength > desc.bytes)) invalid('initial data must be a Uint8Array no longer than bytes');
      const { limits } = attempt;
      if (desc.bytes > limits.maxBufferSize) throw new BackendError('allocation-failed', `${desc.bytes} bytes exceed maxBufferSize ${limits.maxBufferSize}`);
      const bindingLimit = desc.usage === 'storage' ? 'maxStorageBufferBindingSize' : 'maxUniformBufferBindingSize';
      if (desc.bytes > limits[bindingLimit]) throw new BackendError('allocation-failed', `${desc.bytes} bytes exceed ${bindingLimit} ${limits[bindingLimit]}`);
      const description = { name: desc.name, bytes: desc.bytes, usage: desc.usage, ...(desc.data === undefined ? {} : { data: new Uint8Array(desc.data) }) };
      const { device } = attempt, current = attempt;
      const { value: handle, thrown, captured } = scoped(device, () => allocator.allocate(description));
      if (thrown) throw thrown;
      // An asynchronous driver failure is recorded; the handle's later use fails its own error scope.
      captured.then(error => { if (error && current === attempt) errors.push({ kind: 'allocation', at: now(), name: desc.name, message: message(error) }); });
      return handle;
    },
    // Transactional: every byte reserved first; creation errors captured; the old usable set survives failure.
    async configureTargets({ epoch: requestedEpoch, layoutId, internalSize, outputSize } = {}) {
      checkEpoch(requestedEpoch);
      if (layoutId !== TARGET_LAYOUT_ID) invalid('unknown target layoutId');
      for (const size of [internalSize, outputSize]) { record(size, ['width', 'height'], 'size'); count(size.width, 'width', 1); count(size.height, 'height', 1); }
      const maxDimension = attempt.limits.maxTextureDimension2D;
      if (Math.max(internalSize.width, internalSize.height, outputSize.width, outputSize.height) > maxDimension) throw new BackendError('allocation-failed', `target dimensions exceed maxTextureDimension2D ${maxDimension}`);
      const started = now(), current = attempt, names = [], descs = [];
      for (const [name, layout] of Object.entries(TARGET_LAYOUT_V1)) for (let index = 0; index < layout.count; index++) {
        names.push([name, index, layout.count]);
        descs.push({ name: layout.count === 1 ? name : `${name}-${index}`, width: internalSize.width, height: internalSize.height, format: layout.format, bytesPerTexel: layout.bytesPerTexel, bytes: internalSize.width * internalSize.height * layout.bytesPerTexel });
      }
      try {
        const { value: created, thrown, captured } = scoped(current.device, () => allocator.transaction(descs));
        if (thrown) { await captured; throw thrown; }
        const error = await captured;
        if (current !== attempt) throw new BackendError('device-lost', 'the device was lost during configuration');
        if (error) { created.forEach(handle => allocator.release(handle)); throw new BackendError('allocation-failed', `target creation failed: ${message(error)}`); }
        const handles = {}, descriptions = {};
        names.forEach(([name, index, total], position) => {
          const description = Object.freeze({ ...descs[position] });
          if (total === 1) { handles[name] = created[position]; descriptions[name] = description; }
          else { (handles[name] ??= [])[index] = created[position]; (descriptions[name] ??= [])[index] = description; }
        });
        for (const name of Object.keys(handles)) if (Array.isArray(handles[name])) { Object.freeze(handles[name]); Object.freeze(descriptions[name]); }
        const replacement = Object.freeze({ epoch, layoutId, internalSize: Object.freeze({ ...internalSize }), outputSize: Object.freeze({ ...outputSize }), handles: Object.freeze(handles), descriptions: Object.freeze(descriptions) });
        const previous = targets; targets = replacement;
        current.presenter.resize(outputSize);
        if (previous) for (const value of Object.values(previous.handles)) for (const handle of [value].flat()) allocator.release(handle);
        return replacement;
      } finally { phase('configure', started); }
    },
    submitBatch(input, options) {
      const batch = createBatch(input), consume = admissionFor(batch.identity, options);
      const prepared = pipelines.get(batch.pipelineId);
      if (!prepared) throw new BackendError('preparation-failed', `pipeline ${batch.pipelineId} is not prepared`);
      if (prepared.descriptor.kind !== 'compute') invalid('submitBatch requires a compute pipeline; present uses the render pipeline');
      validateBindings(batch, prepared.descriptor, handle => entry(handle));
      const handles = [...new Set([...Object.values(batch.inputs), ...Object.values(batch.outputs)])];
      for (const handle of handles) {
        const { description } = entry(handle);
        if (description.width !== undefined && (batch.region.x + batch.region.width > description.width || batch.region.y + batch.region.height > description.height)) invalid('batch region outside resource');
      }
      const groups = [Math.ceil(batch.region.width / WORKGROUP_SIZE[0]), Math.ceil(batch.region.height / WORKGROUP_SIZE[1])];
      if (Math.max(...groups) > attempt.limits.maxComputeWorkgroupsPerDimension) invalid('batch region needs more workgroups than maxComputeWorkgroupsPerDimension; subdivide it');
      const layout = prepared.descriptor.uniformLayout;
      // The uniform snapshot is a counted allocation, reserved before the lease is consumed.
      const uniforms = layout.byteLength ? allocator.allocate({ name: `uniforms:${batch.pipelineId}`, bytes: layout.byteLength, usage: 'uniform', data: packUniforms(layout, batch.uniforms) }) : null;
      try { consume(); } catch (error) { if (uniforms) allocator.release(uniforms); throw error; }
      const item = makeTicket(batch.identity, uniforms ? [...handles, uniforms] : handles, { batch });
      if (uniforms) allocator.release(uniforms); // retiring at once; the ticket holds it
      submit(item, batch.pipelineId, encoder => {
        const entries = prepared.descriptor.bindings.map((binding, index) => {
          if (binding.type === 'uniform-buffer' && layout.byteLength) return { binding: index, resource: { buffer: entry(uniforms, true).native } };
          const native = entry(batch.inputs[binding.slot] ?? batch.outputs[binding.slot]).native;
          return { binding: index, resource: binding.type.endsWith('buffer') ? { buffer: native } : native.createView() };
        });
        const bindGroup = attempt.device.createBindGroup({ label: batch.pipelineId, layout: prepared.pipeline.getBindGroupLayout(0), entries });
        const pass = encoder.beginComputePass({ label: batch.pipelineId });
        pass.setPipeline(prepared.pipeline); pass.setBindGroup(0, bindGroup); pass.dispatchWorkgroups(groups[0], groups[1]); pass.end();
      });
      return item.ticket;
    },
    // One bounded region (≤ 256 rows) into a pooled staging buffer (≤ 2) with 256-byte row pitch.
    readback(desc, options) {
      record(desc, ['identity', 'source', 'region', 'fields'], 'readback');
      const id = identity(desc.identity), consume = admissionFor(id, options), region = area(desc.region), source = entry(desc.source);
      if (region.height > 256) invalid('readback is limited to 256 rows');
      if (!Array.isArray(desc.fields) || !desc.fields.length || new Set(desc.fields).size !== desc.fields.length || desc.fields.some(field => typeof field !== 'string' || !field)) invalid('readback fields must be non-empty unique strings');
      const image = source.description.width !== undefined;
      const bpt = image ? source.description.bytesPerTexel : 1, width = image ? source.description.width : source.description.bytes, height = image ? source.description.height : 1;
      if (region.x + region.width > width || region.y + region.height > height) invalid('readback region outside source');
      if (!image && (region.x % 4 || region.width % 4)) invalid('buffer readback offsets and widths are multiples of four bytes');
      const rowBytes = region.width * bpt, bytesPerRow = alignUp(rowBytes, 256), bytes = bytesPerRow * region.height;
      if (bytes > attempt.limits.maxBufferSize) throw new BackendError('allocation-failed', 'readback requires horizontal subdivision');
      let staging = stagingPool.find(slot => !slot.busy && slot.bytes >= bytes);
      if (!staging) {
        const idle = stagingPool.find(slot => !slot.busy);
        if (stagingPool.length >= 2 && !idle) throw new BackendError('allocation-failed', 'both staging buffers are busy');
        if (idle) { allocator.release(idle.handle); stagingPool.splice(stagingPool.indexOf(idle), 1); }
        staging = { handle: allocator.allocate({ name: `readback-staging-${stagingPool.length}`, bytes, bytesPerRow, usage: 'staging' }), bytes, busy: false };
        stagingPool.push(staging);
      }
      consume();
      staging.busy = true;
      const item = makeTicket(id, [desc.source, staging.handle], { result: deferred(), staging, region, fields: Object.freeze([...desc.fields]),
        copy: { staging, bytes, rowBytes, bytesPerRow, rows: image ? region.height : 1 }, mapping: {} });
      // Mapping ownership survives queue completion: source and staging stay held until copy-out ends.
      allocator.hold(desc.source, item.mapping, 'mapping'); allocator.hold(staging.handle, item.mapping, 'mapping'); mappings.add(item);
      const target = entry(staging.handle).native;
      submit(item, 'readback', encoder => {
        if (image) encoder.copyTextureToBuffer({ texture: source.native, origin: { x: region.x, y: region.y, z: 0 } }, { buffer: target, offset: 0, bytesPerRow, rowsPerImage: region.height }, { width: region.width, height: region.height, depthOrArrayLayers: 1 });
        else encoder.copyBufferToBuffer(source.native, region.x, target, 0, region.width);
      });
      return item.ticket;
    },
    present(desc, options) {
      record(desc, ['identity', 'display'], 'presentation');
      const id = identity(desc.identity), consume = admissionFor(id, options), display = entry(desc.display);
      const prepared = pipelines.get(PRESENT_PIPELINE_ID);
      if (!prepared || prepared.descriptor.kind !== 'render') throw new BackendError('preparation-failed', 'the presentation pipeline is not prepared');
      if (display.description.format !== 'rgba8unorm') invalid('present requires an rgba8unorm display texture');
      const output = attempt.presenter.size(), internal = display.description;
      const uniforms = allocator.allocate({ name: 'uniforms:present', bytes: 16, usage: 'uniform', data: packUniforms(prepared.descriptor.uniformLayout, { internal_size: [internal.width, internal.height], output_size: [output.width, output.height] }) });
      try { consume(); } catch (error) { allocator.release(uniforms); throw error; }
      const item = makeTicket(id, [desc.display, uniforms]);
      allocator.release(uniforms);
      submit(item, 'present', encoder => attempt.presenter.encode(encoder, { pipeline: prepared.pipeline, display: display.native, uniforms: entry(uniforms, true).native }));
      return item.ticket;
    },
    release(handle) { allocator.release(handle); },
    onLoss(callback) { if (typeof callback !== 'function') invalid('loss callback must be a function'); listeners.add(callback); return () => listeners.delete(callback); },
    currentEpoch: () => epoch,
    diagnostics() { return deepFreeze({ state, epoch, ...allocator.diagnostics() }); },
    destroy() { invalidate('destroyed', 'terminal teardown', true); },
  };
  // Declared separately from the production interface (B00): a real loss without terminal teardown,
  // an injected loss through the same invalidation path, and an injected allocation failure.
  // uncapturedErrors() is an observation only (flagged for review).
  backend.testAdapter = Object.freeze({
    destroyDevice() {
      if (!attempt) return Promise.resolve(false);
      const current = attempt;
      current.lossPending = true; // the fence of work outstanding at destroy() must not read as success
      current.device.destroy();
      return current.lost.then(() => true);
    },
    injectLoss({ reason = 'unknown', message: text } = {}) { return invalidate(reason, text ?? reason, false); },
    failNextAllocation() { allocator.failNextAllocation(); },
    uncapturedErrors: () => deepFreeze(errors.map(item => ({ ...item }))),
  });
  return Object.freeze(backend);
}
