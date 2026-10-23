// Deterministic test adapter for the §9 boundary. It performs no rendering and makes no
// physical-device claims. Queue completion and readback copy-out are separate events.
import { deepFreeze, isPlainObject } from '../../src/shared/scene.js';
import { BackendError, createBatchSubmission, createPipelineSet, TARGET_LAYOUT_ID, TARGET_LAYOUT, TRACKED_ALLOCATION_CAP } from '../../src/space/render/backend.js';

const invalid = message => { throw new BackendError('invalid-descriptor', message); };
const count = (value, label, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min) invalid(`${label} must be a safe integer >= ${min}`);
  return value;
};
function record(value, keys, label) {
  if (!isPlainObject(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) invalid(`${label} requires ${keys.join(', ')}`);
}
function string(value, label) { if (typeof value !== 'string' || !value.trim()) invalid(`${label} must be non-empty`); return value; }
function identity(value) {
  record(value, ['requestId', 'jobId', 'viewId', 'generation'], 'identity');
  record(value.generation, ['deviceEpoch', 'viewRevision', 'geometryRevision', 'appearanceRevision'], 'generation');
  for (const key of ['requestId', 'jobId', 'viewId']) string(value[key], key);
  for (const [key, revision] of Object.entries(value.generation)) count(revision, key);
  return deepFreeze(structuredClone(value));
}
function area(value) {
  record(value, ['x', 'y', 'width', 'height'], 'region');
  for (const key of ['x', 'y', 'width', 'height']) count(value[key], key, key === 'x' || key === 'y' ? 0 : 1);
  count(value.x + value.width, 'right'); count(value.y + value.height, 'bottom');
  return deepFreeze({ ...value });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // A caller may observe done before result, including during loss. Retain rejection
  // for later observers without generating an unrelated unhandled-rejection failure.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

export function createFakeBackend({ clock, cap = TRACKED_ALLOCATION_CAP, limits = {}, failPrepareAt = null } = {}) {
  const now = typeof clock === 'function' ? clock : clock?.now;
  if (typeof now !== 'function') throw new TypeError('fake backend requires an injected clock');
  count(cap, 'cap');
  if (!isPlainObject(limits)) invalid('limits must be an object');
  for (const [key, value] of Object.entries(limits)) count(value, key, 1);
  const observedLimits = deepFreeze({ ...limits });
  let state = 'unavailable', epoch = 0, lastEpoch = 0, attempt = 0;
  let tracked = 0, peak = 0, nextHandle = 0, nextTicket = 0, failAllocation = false, targets = null;
  const resources = new Map(), allHandles = new WeakSet(), pending = new Set(), ticketRecords = new WeakMap();
  const mappings = new Set(), stagingPool = [], preparations = [], pipelines = new Map(), listeners = new Set();
  const log = [];

  function available() { if (state !== 'ready') throw new BackendError('unavailable', `backend is ${state}`); }
  function checkEpoch(value) { available(); if (value !== epoch) throw new BackendError('stale-epoch'); }
  function lookup(handle, allowRetiring = false) {
    const resource = resources.get(handle);
    if (!resource || resource.epoch !== epoch || (!allowRetiring && resource.retiring)) invalid('resource is foreign, retired or released');
    return resource;
  }
  function reclaim(resource) {
    if (resource.retiring && resource.tickets.size === 0 && resource.mappings.size === 0 && resource.owners.size === 0) {
      resources.delete(resource.handle); tracked -= resource.bytes;
    }
  }
  function release(handle) {
    if (!allHandles.has(handle)) invalid('unknown resource handle');
    const resource = resources.get(handle); if (!resource) return;
    resource.retiring = true; reclaim(resource);
  }
  function reservation(bytes) {
    count(bytes, 'allocation bytes');
    if (tracked + bytes > cap) throw new BackendError('allocation-failed', 'tracked allocation cap exceeded');
    if (failAllocation) { failAllocation = false; throw new BackendError('allocation-failed', 'injected allocation failure'); }
  }
  function allocationDescription(desc) {
    if (!isPlainObject(desc)) invalid('allocation description must be an object');
    string(desc.name, 'allocation name'); count(desc.bytes, 'allocation bytes', 1);
    if (desc.width !== undefined || desc.height !== undefined) {
      count(desc.width, 'allocation width', 1); count(desc.height, 'allocation height', 1);
      if (limits.maxTextureDimension2D && Math.max(desc.width, desc.height) > limits.maxTextureDimension2D) throw new BackendError('allocation-failed', 'texture dimensions exceed limit');
    } else if (limits.maxBufferSize && desc.bytes > limits.maxBufferSize) throw new BackendError('allocation-failed', 'buffer exceeds maxBufferSize');
    if (desc.bytesPerTexel !== undefined) {
      count(desc.bytesPerTexel, 'bytesPerTexel', 1);
      if (desc.width * desc.height * desc.bytesPerTexel > desc.bytes) invalid('allocation smaller than its declared image');
    }
    if (desc.format !== undefined) string(desc.format, 'format');
    const bindingLimit = desc.usage === 'storage' ? limits.maxStorageBufferBindingSize : desc.usage === 'uniform' ? limits.maxUniformBufferBindingSize : undefined;
    if (bindingLimit && desc.bytes > bindingLimit) throw new BackendError('allocation-failed', 'buffer exceeds binding size limit');
    const { data, ...metadata } = desc;
    return deepFreeze(structuredClone(metadata));
  }
  function createResource(desc, initialData = null) {
    const handle = Object.freeze({ id: `fake-resource-${++nextHandle}`, epoch }); allHandles.add(handle);
    const resource = { ...desc, epoch, handle, retiring: false, tickets: new Set(), mappings: new Set(), owners: new Set(), staged: initialData };
    resources.set(handle, resource); tracked += desc.bytes; peak = Math.max(peak, tracked); return handle;
  }
  // The production buffer form is exactly {name, bytes, usage, data?} (§9.1 Allocator). A texture-
  // shaped description is refused here; logical images are the fake-only allocateImage control.
  function allocate(desc) {
    available();
    if (!isPlainObject(desc) || Object.keys(desc).some(key => !['name', 'bytes', 'usage', 'data'].includes(key))) invalid('invalid buffer allocation descriptor');
    if (!['storage', 'uniform'].includes(desc.usage)) invalid('buffer usage must be storage or uniform');
    count(desc.bytes, 'buffer bytes', 1);
    if (desc.bytes % 4) invalid('buffer bytes must be a multiple of four');
    if (desc.data !== undefined && (!(desc.data instanceof Uint8Array) || desc.data.byteLength > desc.bytes)) invalid('initial data must be Uint8Array with length <= bytes');
    const description = allocationDescription(desc); reservation(description.bytes);
    // Keep bytes outside frozen metadata. Only initial data needs host storage; absent
    // and trailing bytes read as zero. No lease or queue work is involved in creation.
    const initialData = desc.data === undefined ? null : new Uint8Array(desc.data);
    return createResource(description, initialData);
  }
  // Fake-only control (B06 carry-forward): a logical image {name, bytes, width, height, format?,
  // bytesPerTexel?} for exercising readback and region checks without a target set.
  function allocateImage(desc) {
    available();
    if (!isPlainObject(desc) || desc.width === undefined || desc.height === undefined || desc.usage !== undefined || desc.data !== undefined) invalid('allocateImage requires {name, bytes, width, height, format?, bytesPerTexel?}');
    const description = allocationDescription(desc); reservation(description.bytes);
    return createResource(description);
  }
  function admissionFor(id, options) {
    checkEpoch(id.generation.deviceEpoch);
    const admission = options?.admission;
    if (!admission || typeof admission.consume !== 'function') throw new BackendError('no-admission');
    if (admission.epoch !== epoch) throw new BackendError('stale-epoch');
    if (admission.jobId !== id.jobId) throw new BackendError('no-admission', 'admission belongs to another job');
    return () => { if (admission.consume() !== true) throw new BackendError('no-admission'); };
  }
  function makeTicket(id, handles, extra = {}) {
    const done = deferred();
    const ticket = Object.freeze({ id: `fake-ticket-${++nextTicket}`, identity: id, submittedAt: now(), done: done.promise,
      ...(extra.result ? { result: extra.result.promise } : {}),
    });
    const item = { ticket, done, resources: [...new Set(handles)].map(handle => lookup(handle)), ...extra };
    item.resources.forEach(resource => resource.tickets.add(item)); pending.add(item); ticketRecords.set(ticket, item);
    return item;
  }
  function select(ticket) {
    // 'next' is the FIFO alias for 'oldest'; 'newest' reverses completion order.
    if (['next', 'oldest', 'newest'].includes(ticket)) {
      const items = [...pending]; return ticket === 'newest' ? items.at(-1) : items[0];
    }
    return ticket && typeof ticket === 'object' ? ticketRecords.get(ticket) : undefined;
  }
  function endMapping(item, error) {
    if (!mappings.delete(item)) return;
    for (const resource of item.resources) { resource.mappings.delete(item); reclaim(resource); }
    item.staging.busy = false;
    if (error) item.result.reject(error);
  }
  function copyOut(item) {
    if (!mappings.has(item)) return;
    if (state !== 'ready' || epoch !== item.ticket.identity.generation.deviceEpoch) { endMapping(item, new BackendError('device-lost')); return; }
    const { region, fields, source } = item.readback;
    const bpt = source.bytesPerTexel ?? 1, width = source.width ?? source.bytes / bpt, rowBytes = region.width * bpt;
    const bytes = new Uint8Array(rowBytes * region.height);
    if (source.staged) for (let row = 0; row < region.height; row++) {
      const offset = ((region.y + row) * width + region.x) * bpt;
      bytes.set(source.staged.subarray(offset, offset + rowBytes), row * rowBytes);
    }
    // These bytes belong to the caller. Mapping ends before result resolves.
    endMapping(item);
    item.result.resolve(Object.freeze({ identity: item.ticket.identity, region, fields, data: bytes }));
  }
  function settle(item, outcome, reason, timing = {}) {
    if (!item || !pending.has(item)) return false;
    // Defensive fence guard: ordinary invalidation already settles/removes pending
    // tickets; keep this if a future completion path reaches settle during retirement.
    if (outcome === 'completed' && (state !== 'ready' || item.ticket.identity.generation.deviceEpoch !== epoch)) { outcome = 'interrupted'; reason = 'device-lost'; }
    pending.delete(item);
    const completed = outcome === 'completed';
    const value = deepFreeze({ outcome, reason, queueCompletedAt: completed ? now() : null,
      timing: { method: 'queue-completion', elapsedMs: completed ? timing.elapsedMs : null,
        ...(completed && timing.timestampMs !== undefined ? { timestampMs: timing.timestampMs } : {}),
      },
    });
    for (const resource of item.resources) { resource.tickets.delete(item); reclaim(resource); }
    item.done.resolve(value);
    if (item.result) {
      if (completed) queueMicrotask(() => {
        try { copyOut(item); } catch (error) { endMapping(item, error); }
      });
      else endMapping(item, new BackendError(outcome === 'interrupted' ? 'device-lost' : 'unavailable', reason));
    }
    return true;
  }
  function invalidate(reason, message, terminal) {
    if (state === 'destroyed') return false;
    const lostEpoch = epoch, hadDevice = state === 'ready';
    state = terminal ? 'destroyed' : 'unavailable'; epoch = 0; pipelines.clear(); targets = null;
    for (const preparation of preparations.splice(0)) preparation.result.reject(new BackendError('device-lost', message));
    for (const item of [...pending]) settle(item, 'interrupted', reason);
    for (const item of [...mappings]) endMapping(item, new BackendError('device-lost', message));
    resources.clear(); tracked = 0; stagingPool.length = 0;
    if (hadDevice && !terminal) {
      const event = deepFreeze({ epoch: lostEpoch, reason, message });
      for (const listener of [...listeners]) {
        try { listener(event); } catch (error) { log.push({ method: 'listener-error', at: now(), message: String(error) }); }
      }
    }
    if (terminal) listeners.clear(); return hadDevice;
  }
  function progress(preparation, stage, completed) {
    preparation.onProgress?.(deepFreeze({ stage, completed, total: preparation.pipelineSet.descriptors.length }));
  }
  function finishPrepare() {
    const preparation = preparations.shift(); if (!preparation) return false;
    if (epoch !== preparation.epoch || state !== 'ready') { preparation.result.reject(new BackendError('device-lost')); return false; }
    try {
      let completed = 0;
      for (const descriptor of preparation.pipelineSet.descriptors) {
        if (failPrepareAt === descriptor.pipelineId || failPrepareAt === completed) throw new BackendError('preparation-failed', `injected failure at ${descriptor.pipelineId}`);
        progress(preparation, descriptor.pipelineId, ++completed);
        if (epoch !== preparation.epoch || state !== 'ready') throw new BackendError('device-lost');
      }
      for (const descriptor of preparation.pipelineSet.descriptors) pipelines.set(descriptor.pipelineId, descriptor);
      preparation.result.resolve(deepFreeze({ epoch, pipelineSetId: preparation.pipelineSet.id, preparedPipelineIds: preparation.pipelineSet.descriptors.map(desc => desc.pipelineId) }));
    } catch (error) { preparation.result.reject(error); }
    return true;
  }
  function validateBindings(batch, pipeline) {
    const expected = new Set(pipeline.bindings.map(binding => binding.slot));
    for (const slot of [...Object.keys(batch.inputs), ...Object.keys(batch.outputs)]) if (!expected.has(slot)) invalid(`unknown slot ${slot}`);
    for (const binding of pipeline.bindings) {
      // The generated uniform buffer has no caller-provided resource handle.
      if (binding.type === 'uniform-buffer' && pipeline.uniformLayout.byteLength > 0) {
        if (Object.hasOwn(batch.inputs, binding.slot) || Object.hasOwn(batch.outputs, binding.slot)) invalid('generated uniform slot must not carry a handle');
        continue;
      }
      if (binding.access !== 'write' && !Object.hasOwn(batch.inputs, binding.slot)) invalid(`missing input ${binding.slot}`);
      if (binding.access !== 'read' && !Object.hasOwn(batch.outputs, binding.slot)) invalid(`missing output ${binding.slot}`);
      if (binding.access === 'read' && Object.hasOwn(batch.outputs, binding.slot)) invalid(`read-only output ${binding.slot}`);
      if (binding.access === 'write' && Object.hasOwn(batch.inputs, binding.slot)) invalid(`write-only input ${binding.slot}`);
      if (binding.access === 'read-write' && batch.inputs[binding.slot] !== batch.outputs[binding.slot]) invalid('read-write slots require the same input and output handle');
      if (['storage-buffer', 'uniform-buffer'].includes(binding.type)) {
        const resource = lookup(batch.inputs[binding.slot]);
        if (resource.usage !== (binding.type === 'storage-buffer' ? 'storage' : 'uniform')) invalid('buffer usage does not match binding');
      }
    }
    const fields = pipeline.uniformLayout.fields;
    if (Object.keys(batch.uniforms).length !== fields.length) invalid('uniform fields do not match layout');
    for (const field of fields) {
      const value = batch.uniforms[field.name];
      const length = field.type.startsWith('vec') ? Number(field.type[3]) : field.type === 'mat4x4<f32>' ? 16 : 1;
      const values = length === 1 ? [value] : value;
      if (!Array.isArray(values) || values.length !== length) invalid('uniform value does not match its type');
      for (const component of values) {
        if (typeof component !== 'number' || !Number.isFinite(component)) invalid('uniform component must be finite');
        if (field.type.includes('u32') && (!Number.isInteger(component) || component < 0 || component > 0xffffffff)) invalid('invalid u32 uniform');
        if (field.type.includes('i32') && (!Number.isInteger(component) || component < -2147483648 || component > 2147483647)) invalid('invalid i32 uniform');
        if (field.type.includes('f32') && !Number.isFinite(Math.fround(component))) invalid('uniform overflows f32');
      }
    }
  }
  const api = {
    async acquire() {
      if (state === 'destroyed') throw new BackendError('unavailable', 'terminal teardown');
      // Acquisition is not a reset operation. Call loss/teardown explicitly before replacing a device.
      if (state === 'ready') throw new BackendError('unavailable', 'device already acquired');
      attempt++; epoch = ++lastEpoch; state = 'ready';
      // limits are the granted limits; adapterLimits and requestedLimits mirror the WebGPU backend (B06).
      return deepFreeze({ epoch, identity: { attemptId: `fake-attempt-${attempt}`, vendor: 'unavailable', architecture: 'unavailable', device: 'unavailable', description: 'unavailable', isFallbackAdapter: 'unavailable' }, limits: observedLimits, adapterLimits: observedLimits, requestedLimits: {}, features: [] });
    },
    prepare({ epoch: requestedEpoch, pipelineSet, onProgress }) {
      checkEpoch(requestedEpoch);
      if (onProgress !== undefined && typeof onProgress !== 'function') invalid('onProgress must be a function');
      const preparation = { epoch, pipelineSet: createPipelineSet(pipelineSet), onProgress, result: deferred() };
      preparations.push(preparation);
      try { progress(preparation, 'preparing', 0); } catch (error) { preparations.splice(preparations.indexOf(preparation), 1); preparation.result.reject(error); }
      return preparation.result.promise;
    },
    async configureTargets({ epoch: requestedEpoch, layoutId, internalSize, outputSize }) {
      checkEpoch(requestedEpoch); if (layoutId !== TARGET_LAYOUT_ID) invalid('unknown target layoutId');
      for (const size of [internalSize, outputSize]) { record(size, ['width', 'height'], 'size'); count(size.width, 'width', 1); count(size.height, 'height', 1); }
      const descriptions = {}, flat = [];
      for (const [name, layout] of Object.entries(TARGET_LAYOUT)) {
        const entries = Array.from({ length: layout.count }, (_, index) => allocationDescription({ name: layout.count === 1 ? name : `${name}-${index}`,
          width: internalSize.width, height: internalSize.height, format: layout.format, bytesPerTexel: layout.bytesPerTexel,
          bytes: internalSize.width * internalSize.height * layout.bytesPerTexel,
        }));
        descriptions[name] = layout.count === 1 ? entries[0] : entries; flat.push(...entries);
      }
      reservation(flat.reduce((sum, desc) => sum + desc.bytes, 0));
      const handles = {};
      for (const [name, value] of Object.entries(descriptions)) handles[name] = Array.isArray(value) ? Object.freeze(value.map(desc => createResource(desc))) : createResource(value);
      const replacement = deepFreeze({ epoch, layoutId, internalSize: { ...internalSize }, outputSize: { ...outputSize }, handles, descriptions });
      // Target handles are caller-owned until release() (B06 r1 finding 5): a replacement never releases
      // the earlier set, so a published previous image can still be presented.
      targets = replacement;
      return replacement;
    },
    submitBatch(input, options) {
      const submission = createBatchSubmission(input), consume = admissionFor(submission.identity, options);
      const handles = [], uniformDescriptions = [];
      for (const batch of submission.passes ?? [submission]) {
        const pipeline = pipelines.get(batch.pipelineId); if (!pipeline) throw new BackendError('preparation-failed', `pipeline ${batch.pipelineId} is not prepared`);
        if (pipeline.kind !== 'compute') invalid('submitBatch requires a compute pipeline; present uses a render pipeline');
        validateBindings(batch, pipeline);
        const memberHandles = [...Object.values(batch.inputs), ...Object.values(batch.outputs)];
        handles.push(...memberHandles);
        for (const handle of memberHandles) {
          const resource = lookup(handle);
          if (resource.width && (batch.region.x + batch.region.width > resource.width || batch.region.y + batch.region.height > resource.height)) invalid('batch region outside resource');
        }
        const bytes = pipeline.uniformLayout.byteLength;
        if (bytes) uniformDescriptions.push(allocationDescription({ name: 'uniforms', bytes }));
      }
      reservation(uniformDescriptions.reduce((sum, desc) => sum + desc.bytes, 0));
      let staging, source;
      if (submission.draft?.summary) {
        source = lookup(submission.draft.summary);
        staging = stagingPool.find(slot => !slot.busy && lookup(slot.handle).bytes >= source.bytes);
        if (!staging) {
          const replace = stagingPool.find(slot => !slot.busy);
          if (!replace && stagingPool.length === 2) throw new BackendError('allocation-failed', 'both staging buffers are busy');
          reservation(source.bytes);
          if (replace) { release(replace.handle); stagingPool.splice(stagingPool.indexOf(replace), 1); }
          staging = { handle: createResource({ name: `readback-staging-${stagingPool.length}`, bytes: source.bytes }), busy: false };
          stagingPool.push(staging);
        }
      }
      consume();
      const uniforms = uniformDescriptions.map(desc => createResource(desc));
      const item = makeTicket(submission.identity, [...handles, ...uniforms, ...(staging ? [staging.handle] : [])], { batch: submission,
        ...(staging ? { result: deferred(), staging, readback: { source, region: { x: 0, y: 0, width: source.bytes, height: 1 }, fields: Object.freeze(['draftSummary']) } } : {}) });
      if (staging) { staging.busy = true; mappings.add(item); item.resources.forEach(resource => resource.mappings.add(item)); }
      uniforms.forEach(release); return item.ticket;
    },
    readback(desc, options) {
      record(desc, ['identity', 'source', 'region', 'fields'], 'readback');
      const id = identity(desc.identity), consume = admissionFor(id, options), region = area(desc.region), source = lookup(desc.source);
      if (region.height > 256) invalid('readback is limited to 256 rows');
      if (!Array.isArray(desc.fields) || !desc.fields.length || new Set(desc.fields).size !== desc.fields.length) invalid('readback fields must be non-empty and unique');
      desc.fields.forEach(field => string(field, 'field'));
      const bpt = source.bytesPerTexel ?? 1, width = source.width ?? source.bytes / bpt, height = source.height ?? 1;
      if (region.x + region.width > width || region.y + region.height > height) invalid('readback region outside source');
      const bytesPerRow = Math.ceil(region.width * bpt / 256) * 256, bytes = bytesPerRow * region.height;
      if (limits.maxBufferSize && bytes > limits.maxBufferSize) throw new BackendError('allocation-failed', 'readback requires horizontal subdivision');
      let staging = stagingPool.find(entry => !entry.busy && lookup(entry.handle).bytes >= bytes);
      let replace;
      if (!staging) {
        // Reuse/replace an idle undersized slot before growing the pool to two.
        replace = stagingPool.find(entry => !entry.busy);
        if (stagingPool.length >= 2 && !replace) throw new BackendError('allocation-failed', 'both staging buffers are busy');
        reservation(bytes);
      }
      consume();
      if (!staging) {
        if (replace) { release(replace.handle); stagingPool.splice(stagingPool.indexOf(replace), 1); }
        staging = { handle: createResource({ name: `readback-staging-${stagingPool.length}`, bytes, bytesPerRow }), busy: false }; stagingPool.push(staging);
      }
      staging.busy = true;
      const item = makeTicket(id, [desc.source, staging.handle], { result: deferred(), staging,
        readback: { source, region, fields: Object.freeze([...desc.fields]) },
      });
      mappings.add(item); item.resources.forEach(resource => resource.mappings.add(item)); return item.ticket;
    },
    present(desc, options) {
      record(desc, ['identity', 'display'], 'presentation'); const id = identity(desc.identity), consume = admissionFor(id, options);
      lookup(desc.display); consume(); return makeTicket(id, [desc.display]).ticket;
    },
    release,
    onLoss(callback) { if (typeof callback !== 'function') invalid('loss callback must be a function'); listeners.add(callback); return () => listeners.delete(callback); },
    currentEpoch: () => epoch,
    diagnostics() {
      return deepFreeze({ state, epoch, tracked, peak, retiring: [...resources.values()].reduce((sum, resource) => sum + (resource.retiring ? resource.bytes : 0), 0),
        inventory: [...resources.values()].map(resource => ({ id: resource.handle.id, epoch: resource.epoch, name: resource.name, bytes: resource.bytes,
          ...(resource.width === undefined ? {} : { width: resource.width, height: resource.height }),
          ...(resource.usage === undefined ? {} : { usage: resource.usage }),
          ...(resource.format === undefined ? {} : { format: resource.format }), ...(resource.bytesPerRow === undefined ? {} : { bytesPerRow: resource.bytesPerRow }),
          state: resource.retiring ? 'retiring' : 'live', tickets: resource.tickets.size, mappings: resource.mappings.size, owners: resource.owners.size,
        })),
      });
    },
    destroy() { invalidate('destroyed', 'terminal teardown', true); },
    allocate,
    allocateImage,
    retain(handle, owner) { available(); string(owner, 'owner'); lookup(handle).owners.add(owner); },
    retire(owner) { for (const resource of resources.values()) { resource.owners.delete(owner); reclaim(resource); } },
    stage(handle, bytes) {
      available(); const resource = lookup(handle);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== resource.bytes) invalid('stage requires exactly allocation.bytes Uint8Array bytes');
      if (resource.tickets.size || resource.mappings.size) invalid('cannot overwrite a resource owned by outstanding work');
      resource.staged = new Uint8Array(bytes);
    },
    finishPrepare,
    failPrepare(stage) {
      const preparation = preparations.shift(); if (!preparation) return false;
      preparation.result.reject(new BackendError('preparation-failed', `preparation failed at ${stage}`)); return true;
    },
    complete(ticket, timing = {}) {
      const item = select(ticket); if (!item || !pending.has(item)) return false;
      const elapsedMs = timing.elapsedMs ?? now() - item.ticket.submittedAt;
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || (timing.timestampMs !== undefined && (!Number.isFinite(timing.timestampMs) || timing.timestampMs < 0))) invalid('completion timing must be finite and nonnegative');
      return settle(item, 'completed', null, { ...timing, elapsedMs });
    },
    fail(ticket, error) { return settle(select(ticket), 'failed', error?.message ?? String(error)); },
    lose({ reason = 'unknown', message = reason } = {}) { return invalidate(reason, message, false); },
  };
  // Test controls live outside BACKEND_METHODS; every public call, including failed calls,
  // is logged before it takes effect. Observing diagnostics is itself an observable call.
  const backend = { log };
  for (const [method, fn] of Object.entries(api)) backend[method] = (...args) => { log.push({ method, at: now(), args }); return fn(...args); };
  backend.testAdapter = Object.freeze({
    destroyDevice() { log.push({ method: 'testAdapter.destroyDevice', at: now() }); return backend.lose({ reason: 'destroyed' }); },
    injectLoss(value) { log.push({ method: 'testAdapter.injectLoss', at: now() }); return backend.lose(value); },
    failNextAllocation() { log.push({ method: 'testAdapter.failNextAllocation', at: now() }); failAllocation = true; },
  });
  return Object.freeze(backend);
}
