// The WebGPU backend (spec §9, §8.3, §15, the §9.1 annex; plan B06). It owns the device, every
// resource, encoding, submission, completion, presentation and readback; shared and UI code see only
// the B00 contract (BACKEND_METHODS), opaque handles and frozen records — never a GPUDevice.
//   - Every queue submission consumes one single-use admission lease for the current epoch.
//   - Every native creation and every command buffer runs inside synchronously pushed and popped
//     validation and out-of-memory scopes. A creation error captured later marks the resource failed
//     (diagnostics `failure`) and fails every ticket that consumes it.
//   - A ticket settles only once its resources' creation scopes, its own scopes and the queue fence
//     have resolved: `failed` when any captured an error (or the work never reached the queue),
//     otherwise `completed` with the timing observed at the fence. Loss settles every outstanding
//     ticket `interrupted`; while a test-adapter loss is pending nothing else settles and nothing is admitted.
//   - Observed loss makes the backend unavailable and zeroes the epoch before listeners run; a loss
//     observed before an acquisition is published refuses that acquisition.
//   - Target handles are caller-owned until release(): reconfiguration never releases the earlier set.
//   - Compute dispatch geometry is frozen ABI: @workgroup_size(8, 8, 1), ceil(region / 8) workgroups;
//     each pass carries its region in its own uniforms (the backend injects nothing).
import { BackendError, createBatchSubmission, TARGET_LAYOUT_ID, TARGET_LAYOUT, TRACKED_ALLOCATION_CAP } from '../backend.js';
import { deepFreeze, isPlainObject } from '../../../shared/scene.js';
import { acquireDevice, IDENTITY_FIELDS } from './device.js';
import { createTrackedAllocator } from './allocator.js';
import { packUniforms, preparePipelines, PREPARATION_BOUND_MS, PRESENT_PIPELINE_ID, validateBindings, WORKGROUP_SIZE } from './pipelines.js';
import { createPresenter } from './present.js';
import { draftSummaryBytes } from '../draft-summary.js';
import { draftExecution as selectDraftExecution } from '../draft-execution.js';

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
// A validated, frozen copy taken synchronously: later mutation of the caller's object changes nothing.
function size(value, label) {
  record(value, ['width', 'height'], label);
  return Object.freeze({ width: count(value.width, `${label}.width`, 1), height: count(value.height, `${label}.height`, 1) });
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
  storage: () => GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  uniform: () => GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC,
  staging: () => GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
};
const TEXTURE_USAGE = () => GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;

export function createWebGPUBackend({ canvas, clock, acquire = acquireDevice, enableTimestamps = false, preparationBoundMs = PREPARATION_BOUND_MS, loadSource, onPhase, cap = TRACKED_ALLOCATION_CAP, format, draftExecution } = {}) {
  const draftConfig = selectDraftExecution(draftExecution);
  const now = typeof clock === 'function' ? clock : clock?.now?.bind(clock);
  if (typeof now !== 'function') throw new TypeError('createWebGPUBackend requires an injected clock');
  if (!canvas) throw new TypeError('createWebGPUBackend requires a canvas');
  if (onPhase !== undefined && typeof onPhase !== 'function') throw new TypeError('onPhase must be a function');
  // Tests may lower the cap; nothing may raise the mandatory 1 GiB tracked-allocation cap (§8.3).
  if (!Number.isSafeInteger(cap) || cap < 0 || cap > TRACKED_ALLOCATION_CAP) throw new RangeError(`cap must be an integer in [0, ${TRACKED_ALLOCATION_CAP}]`);
  // GPU timestamps are a separate measurement (§9.1 Batches); B06 does not implement them and never
  // reports timestampMs. Requesting them is refused rather than silently ignored.
  if (enableTimestamps) throw new BackendError('unavailable', 'GPU timestamp measurement is not implemented in B06');
  let rawPending = 0;
  let state = 'unavailable', epoch = 0, lastEpoch = 0, attempt = null, acquiring = false, nextTicket = 0;
  const pipelines = new Map(), pending = new Set(), mappings = new Set(), preparations = new Set(), listeners = new Set(), stagingPool = [], errors = [];
  const lostAttempts = new Set(), creations = new WeakMap();
  const allocator = createTrackedAllocator({ cap, clock: now, factory: {
    create(desc) {
      const { device } = attempt;
      if (desc.width !== undefined) return device.createTexture({ label: desc.name, size: [desc.width, desc.height], format: desc.format, usage: TEXTURE_USAGE() });
      const usage = BUFFER_USAGE[desc.usage]?.();
      if (!usage) throw new Error(`no native usage for ${desc.usage}`);
      const buffer = device.createBuffer({ label: desc.name, size: desc.bytes, usage, mappedAtCreation: desc.data !== undefined });
      // Initial contents through mappedAtCreation: copied, unmapped before returning; no queue work.
      // A failure after creation destroys the partially initialized buffer before it is reported.
      if (desc.data !== undefined) {
        try { new Uint8Array(buffer.getMappedRange()).set(desc.data); buffer.unmap(); }
        catch (error) { try { buffer.destroy(); } catch { /* already invalid */ } throw error; }
      }
      return buffer;
    },
    destroy(native) { native.destroy(); },
  } });

  // Long-task attribution on the production path (B01 Q2): every backend operation reports its
  // interval, including failure exits (`failed: true`).
  function phase(name, start, detail = {}) {
    if (!onPhase) return;
    try { onPhase(Object.freeze({ phase: name, start, end: now(), epoch, ...detail })); } catch { /* an observer never disturbs the backend */ }
  }
  function timed(name, fn) {
    const start = now();
    let failed = true;
    try { const value = fn(); failed = false; return value; } finally { phase(name, start, failed ? { failed: true } : {}); }
  }
  async function timedAsync(name, fn) {
    const start = now();
    let failed = true;
    try { const value = await fn(); failed = false; return value; } finally { phase(name, start, failed ? { failed: true } : {}); }
  }
  function available() {
    if (state !== 'ready') throw new BackendError('unavailable', `backend is ${state}`);
    if (attempt.lossPending) throw new BackendError('unavailable', 'device loss is pending');
  }
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
  // Native creation under its own scopes. The returned handles carry their creation status: a later
  // captured error marks them failed (visible in diagnostics) and fails each consuming ticket.
  function createScoped(what) {
    const current = attempt;
    const { value, thrown, captured } = scoped(current.device, what);
    if (thrown) { captured.then(() => {}); throw thrown; }
    const handles = Array.isArray(value) ? value : [value];
    const status = captured.then(error => {
      if (!error) return null;
      const reason = `resource creation failed: ${message(error)}`;
      if (current === attempt) { handles.forEach(handle => allocator.markFailed(handle, reason)); errors.push({ kind: 'creation', at: now(), message: reason }); }
      return reason;
    });
    handles.forEach(handle => creations.set(handle, status));
    return { value, status };
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
    const done = deferred(), unique = [...new Set(handles)];
    const ticket = Object.freeze({ id: `webgpu-ticket-${++nextTicket}`, identity: id, submittedAt: now(), done: done.promise, ...(extra.result ? { result: extra.result.promise } : {}) });
    const item = { ticket, done, attempt, epoch, handles: unique, ...extra };
    for (const handle of unique) allocator.hold(handle, item, 'ticket');
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
    // While a loss is pending, only the loss path settles: a fence or scope resolving in that interval
    // establishes neither success nor failure.
    if (outcome !== 'interrupted' && item.attempt.lossPending) return false;
    if (outcome === 'completed' && (state !== 'ready' || item.attempt !== attempt)) { outcome = 'interrupted'; reason = 'device-lost'; }
    pending.delete(item);
    const completed = outcome === 'completed';
    const value = deepFreeze({ outcome, reason, queueCompletedAt: completed ? timing.at : null, timing: { method: 'queue-completion', elapsedMs: completed ? timing.at - item.ticket.submittedAt : null } });
    allocator.unhold(item);
    item.done.resolve(value);
    if (item.result) {
      if (completed) mapAndCopy(item);
      else endMapping(item, new BackendError(outcome === 'interrupted' ? 'device-lost' : 'unavailable', reason));
    }
    return true;
  }
  // One command buffer under synchronous error scopes. Work that throws before submission never entered
  // the queue and fails at once; otherwise the ticket waits for its resources' creation status, its
  // scopes and the fence. Queue timing is taken when the fence resolves, not when the scopes do.
  function submit(item, label, encode) {
    const { device } = attempt;
    const creation = Promise.all(item.handles.map(handle => creations.get(handle) ?? null)).then(list => list.find(Boolean) ?? null);
    const { thrown, captured } = scoped(device, () => {
      const encoder = device.createCommandEncoder({ label });
      encode(encoder);
      device.queue.submit([encoder.finish()]);
      item.queuedAt = now();
    });
    if (thrown) { captured.then(() => {}); settle(item, 'failed', `${label}: ${message(thrown)}`); return; }
    let fenceAt = null;
    const fence = device.queue.onSubmittedWorkDone().then(() => { fenceAt = now(); });
    Promise.all([creation, captured, fence]).then(([created, error]) => {
      if (created || error) settle(item, 'failed', `${label}: ${created ?? message(error)}`);
      else settle(item, 'completed', null, { at: fenceAt });
    }, error => settle(item, 'interrupted', `device-lost: ${message(error)}`));
  }
  // Map, copy out with row padding stripped, unmap; ownership ends exactly once, before the result.
  function mapAndCopy(item) {
    const { staging, bytes, rowBytes, bytesPerRow, rows } = item.copy;
    const lostCode = () => (state !== 'ready' || item.attempt !== attempt ? 'device-lost' : 'unavailable');
    let buffer;
    try { buffer = entry(staging.handle, true).native; } catch (error) { endMapping(item, new BackendError(lostCode(), `readback staging: ${message(error)}`)); return; }
    // The phase covers the synchronous copy-out only; the asynchronous map wait is not CPU work.
    buffer.mapAsync(GPUMapMode.READ, 0, bytes).then(() => {
      const start = now();
      if (!mappings.has(item) || item.attempt.lossPending) return; // the loss path ends this mapping
      if (state !== 'ready' || item.attempt !== attempt) { endMapping(item, new BackendError('device-lost')); return; }
      let data = null, failure = null;
      try {
        const mapped = new Uint8Array(buffer.getMappedRange(0, bytes));
        data = new Uint8Array(rowBytes * rows);
        for (let row = 0; row < rows; row++) data.set(mapped.subarray(row * bytesPerRow, row * bytesPerRow + rowBytes), row * rowBytes);
      } catch (error) { failure = error; } finally { try { buffer.unmap(); } catch { /* not mapped */ } }
      phase('readback-copy', start, failure ? { failed: true } : {});
      if (failure) { endMapping(item, new BackendError(lostCode(), `readback copy-out failed: ${message(failure)}`)); return; }
      endMapping(item);
      item.result.resolve(Object.freeze({ identity: item.ticket.identity, region: item.region, fields: item.fields, data }));
    }, error => {
      phase('readback-copy', now(), { failed: true });
      if (item.attempt.lossPending) return;
      endMapping(item, new BackendError(lostCode(), `mapAsync: ${message(error)}`));
    });
  }

  function invalidate(reason, text, terminal) {
    if (state === 'destroyed') return false;
    const lostEpoch = epoch, hadDevice = state === 'ready', retired = attempt;
    if (retired) retired.lossPending = false; // the loss path itself now settles everything
    state = terminal ? 'destroyed' : 'unavailable'; epoch = 0; attempt = null; pipelines.clear(); stagingPool.length = 0;
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
  // The device.lost observer: the current attempt's loss invalidates; a loss of an attempt not yet
  // published is latched so that acquisition refuses it; retired attempts change nothing.
  function observeLoss({ attemptId, reason, message: text }) {
    if (!attempt || attempt.attemptId !== attemptId) { lostAttempts.add(attemptId); return; }
    invalidate(reason || 'unknown', text || reason || 'unknown', false);
  }
  // At most two staging buffers; one whose creation failed is never reused (released once idle).
  function stagingFor(bytes, bytesPerRow) {
    for (const slot of stagingPool.filter(item => item.failed && !item.busy)) { allocator.release(slot.handle); stagingPool.splice(stagingPool.indexOf(slot), 1); }
    let staging = stagingPool.find(slot => !slot.busy && !slot.failed && slot.bytes >= bytes);
    if (staging) return staging;
    const idle = stagingPool.find(slot => !slot.busy);
    if (stagingPool.length >= 2 && !idle) throw new BackendError('allocation-failed', 'both staging buffers are busy');
    if (idle) { allocator.release(idle.handle); stagingPool.splice(stagingPool.indexOf(idle), 1); }
    const { value: handle, status } = createScoped(() => allocator.allocate({ name: `readback-staging-${stagingPool.length}`, bytes, bytesPerRow, usage: 'staging' }));
    staging = { handle, bytes, busy: false, failed: false };
    status.then(error => { if (error) staging.failed = true; });
    stagingPool.push(staging);
    return staging;
  }

  const backend = {
    acquire: () => timedAsync('acquire', async () => {
      if (state === 'destroyed') throw new BackendError('unavailable', 'terminal teardown');
      if (state === 'ready' || acquiring) throw new BackendError('unavailable', 'device already acquired');
      acquiring = true;
      let result;
      try { result = await acquire({ onLost: observeLoss }); }
      catch (error) { throw new BackendError('unavailable', `acquisition failed: ${message(error)}`, { cause: error }); }
      finally { acquiring = false; }
      const { device } = result;
      const discard = () => { try { device.destroy(); } catch { /* ignore */ } };
      if (state === 'destroyed') { discard(); throw new BackendError('unavailable', 'terminal teardown'); }
      if (lostAttempts.has(result.attemptId)) { discard(); throw new BackendError('device-lost', 'the device was lost before acquisition completed'); }
      let presenter;
      try { presenter = createPresenter({ device, canvas, format }); }
      catch (error) { discard(); throw new BackendError('unavailable', `canvas configuration failed: ${message(error)}`); }
      epoch = ++lastEpoch; state = 'ready';
      attempt = { attemptId: result.attemptId, device, presenter, limits: result.limits, lossPending: false };
      attempt.lost = new Promise(resolve => { attempt.resolveLost = resolve; });
      allocator.setEpoch(epoch);
      const current = attempt;
      device.addEventListener?.('uncapturederror', event => { if (current === attempt) errors.push({ kind: 'uncaptured', at: now(), message: message(event.error) }); });
      return deepFreeze({ epoch, identity: { attemptId: result.attemptId, ...Object.fromEntries(IDENTITY_FIELDS.map(field => [field, result.identity[field]])), isFallbackAdapter: result.isFallbackAdapter },
        limits: result.limits, adapterLimits: result.adapterLimits, requestedLimits: result.requestedLimits, features: result.features.granted, canvasFormat: presenter.format });
    }),
    prepare: ({ epoch: requestedEpoch, pipelineSet, onProgress } = {}) => timedAsync('prepare', async () => {
      checkEpoch(requestedEpoch);
      const current = attempt, abort = deferred();
      preparations.add(abort);
      try {
        let result;
        try { result = await Promise.race([preparePipelines({ device: current.device, pipelineSet, onProgress, boundMs: preparationBoundMs, loadSource, format: current.presenter.format, limits: current.limits }), abort.promise]); }
        catch (error) {
          // Loss takes precedence over a preparation failure: wait for the loss path, which rejects device-lost.
          if (current.lossPending) await abort.promise;
          if (current !== attempt) throw new BackendError('device-lost', 'the device was lost during preparation');
          throw error;
        }
        if (current.lossPending) await abort.promise; // rejected by the loss path
        if (current !== attempt) throw new BackendError('device-lost', 'the device was lost during preparation');
        for (const [id, prepared] of result.pipelines) pipelines.set(id, prepared);
        return deepFreeze({ epoch, pipelineSetId: pipelineSet.id, preparedPipelineIds: [...result.preparedPipelineIds] });
      } finally { preparations.delete(abort); }
    }),
    // Production buffers only: {name, bytes, usage: 'storage' | 'uniform', data?}. No queue work, no lease.
    allocate: desc => timed('allocate', () => {
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
      return createScoped(() => allocator.allocate(description)).value;
    }),
    // Transactional: every byte reserved first; creation errors captured; nothing earlier is released.
    configureTargets: ({ epoch: requestedEpoch, layoutId, internalSize: requestedInternal, outputSize: requestedOutput, signal } = {}) => timedAsync('configure', async () => {
      checkEpoch(requestedEpoch);
      if (signal?.aborted) throw new BackendError('unavailable', 'target configuration superseded');
      if (layoutId !== TARGET_LAYOUT_ID) invalid('unknown target layoutId');
      const internalSize = size(requestedInternal, 'internalSize'), outputSize = size(requestedOutput, 'outputSize');
      const maxDimension = attempt.limits.maxTextureDimension2D;
      if (Math.max(internalSize.width, internalSize.height, outputSize.width, outputSize.height) > maxDimension) throw new BackendError('allocation-failed', `target dimensions exceed maxTextureDimension2D ${maxDimension}`);
      const current = attempt, names = [], descs = [];
      for (const [name, layout] of Object.entries(TARGET_LAYOUT)) for (let index = 0; index < layout.count; index++) {
        names.push([name, index, layout.count]);
        descs.push(Object.freeze({ name: layout.count === 1 ? name : `${name}-${index}`, width: internalSize.width, height: internalSize.height, format: layout.format, bytesPerTexel: layout.bytesPerTexel, bytes: internalSize.width * internalSize.height * layout.bytesPerTexel }));
      }
      // The complete layout is the family-requirements key (all current families include recovery).
      // Partial releases can be reused individually, including the non-geometry spare at 4K.
      const pool = JSON.stringify([layoutId, outputSize, TARGET_LAYOUT]);
      // A set served wholly from the pool creates nothing, so it has no creation error to await.
      const reused = allocator.canReuse(descs, pool);
      const { value: created, status } = reused
        ? { value: allocator.transaction(descs, { pool }), status: Promise.resolve(null) }
        : createScoped(() => allocator.transaction(descs, { pool }));
      // An abandoned fresh set may carry an unobserved creation error: never pool it. A pooled set
      // was validated when first created and returns to the pool.
      const abandon = () => created.forEach(handle => allocator.release(handle, { discard: !reused }));
      signal?.addEventListener('abort', abandon, { once: true });
      let error;
      try { error = await Promise.race([status, current.lost]); } finally { signal?.removeEventListener('abort', abandon); }
      if (current.lossPending) { await current.lost; throw new BackendError('device-lost', 'the device was lost during configuration'); }
      if (current !== attempt) throw new BackendError('device-lost', 'the device was lost during configuration');
      if (signal?.aborted) throw new BackendError('unavailable', 'target configuration superseded');
      if (error) { abandon(); throw new BackendError('allocation-failed', `target ${error}`); }
      const handles = {}, descriptions = {};
      names.forEach(([name, index, total], position) => {
        if (total === 1) { handles[name] = created[position]; descriptions[name] = descs[position]; }
        else { (handles[name] ??= [])[index] = created[position]; (descriptions[name] ??= [])[index] = descs[position]; }
      });
      for (const name of Object.keys(handles)) if (Array.isArray(handles[name])) { Object.freeze(handles[name]); Object.freeze(descriptions[name]); }
      current.presenter.resize(outputSize);
      return Object.freeze({ epoch, layoutId, internalSize, outputSize, handles: Object.freeze(handles), descriptions: Object.freeze(descriptions) });
    }),
    submitBatch: (input, options) => timed('submit', () => {
      const submission = createBatchSubmission(input);
      checkEpoch(submission.identity.generation.deviceEpoch);
      // Only injected L0/L1 omit application leases; ordinary operations always require one.
      const consume = submission.draft && !draftConfig.leases ? () => {} : admissionFor(submission.identity, options);
      // Validate every member, including uniform packing, before allocating or
      // consuming the sole lease. A bad final member cannot submit a prefix.
      const members = (submission.passes ?? [submission]).map(batch => {
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
        const data = packUniforms(layout, batch.uniforms);
        return { batch, prepared, handles, groups, layout, data };
      });
      const uniformDescriptions = members.filter(member => member.layout.byteLength).map(({ batch, layout, data }) =>
        ({ name: `uniforms:${batch.pipelineId}`, bytes: layout.byteLength, usage: 'uniform', data }));
      const draft = submission.draft, summaryBytes = draft ? draftSummaryBytes(draft.recovery) : 0;
      let presentation = null, staging = null;
      if (draft) {
        if (draft.mode !== draftConfig.mode) invalid('draft submission does not match the injected execution rung');
        if (submission.region.x || submission.region.y) invalid('combined draft operation requires a complete frame');
        const display = entry(draft.display);
        if (display.description.format !== 'rgba8unorm' || display.description.width !== submission.region.width || display.description.height !== submission.region.height) invalid('combined draft display dimensions');
        if (draft.summary && (entry(draft.summary).description.bytes !== summaryBytes || entry(draft.summary).description.usage !== 'storage')) invalid('draft summary storage size');
        if (draft.mode !== 'compute') {
          const prepared = pipelines.get(draft.summary ? 'present_draft' : PRESENT_PIPELINE_ID);
          if (!prepared) throw new BackendError('preparation-failed', 'draft presentation pipeline missing');
          const output = attempt.presenter.size(), internal = display.description;
          const values = { internal_size: [internal.width, internal.height], output_size: [output.width, output.height],
            producerToken: draft.producerToken, summaryWords: summaryBytes / 4, mode: draft.mode === 'provisional' ? 2 : ['gated', 'async'].includes(draft.mode) ? 1 : 0 };
          const layout = prepared.descriptor.uniformLayout;
          uniformDescriptions.push({ name: 'uniforms:present-draft', bytes: layout.byteLength, usage: 'uniform',
            data: packUniforms(layout, Object.fromEntries(layout.fields.map(field => [field.name, values[field.name]]))) });
          presentation = { prepared, display };
        }
      }
      // Reserve all snapshots transactionally; hold all group resources until its
      // one ticket settles, including creation scopes and cancellation/loss drain.
      const uniforms = uniformDescriptions.length ? createScoped(() => allocator.transaction(uniformDescriptions)).value : [];
      try { if (draft?.summary) staging = stagingFor(summaryBytes, summaryBytes); consume(); }
      catch (error) { uniforms.forEach(handle => allocator.release(handle)); throw error; }
      if (staging) staging.busy = true;
      const handles = [...members.flatMap(member => member.handles), ...uniforms, ...(draft ? [draft.display] : []), ...(staging ? [staging.handle] : [])];
      const encode = encoder => {
        if (draft?.summary) encoder.clearBuffer(entry(draft.summary).native);
        let uniformIndex = 0;
        for (const { batch, prepared, groups, layout } of members) {
          const uniform = layout.byteLength ? uniforms[uniformIndex++] : null;
          const entries = prepared.descriptor.bindings.map((binding, index) => {
            if (binding.type === 'uniform-buffer' && layout.byteLength) return { binding: index, resource: { buffer: entry(uniform, true).native } };
            const native = entry(batch.inputs[binding.slot] ?? batch.outputs[binding.slot]).native;
            return { binding: index, resource: binding.type.endsWith('buffer') ? { buffer: native } : native.createView() };
          });
          const bindGroup = attempt.device.createBindGroup({ label: batch.pipelineId, layout: prepared.pipeline.getBindGroupLayout(0), entries });
          const pass = encoder.beginComputePass({ label: batch.pipelineId });
          pass.setPipeline(prepared.pipeline); pass.setBindGroup(0, bindGroup); pass.dispatchWorkgroups(groups[0], groups[1]); pass.end();
        }
        if (staging) encoder.copyBufferToBuffer(entry(draft.summary).native, 0, entry(staging.handle).native, 0, summaryBytes);
        if (presentation) attempt.presenter.encode(encoder, { pipeline: presentation.prepared.pipeline, display: presentation.display.native,
          uniforms: entry(uniforms.at(-1), true).native, ...(draft.summary ? { summary: entry(draft.summary).native } : {}) });
      };
      if (draft && !draftConfig.tickets) {
        // Bounded L0 has the common benchmark fence but no application ticket,
        // scopes, admission or diagnostic readback. The driver owns both frame slots.
        if (rawPending >= 2) { uniforms.forEach(handle => allocator.release(handle)); invalid('bounded L0 depth exceeded'); }
        const startedAt = now(), current = attempt; rawPending++;
        try {
          const encoder = current.device.createCommandEncoder({ label: 'diagnostic-L0' }); encode(encoder);
          current.device.queue.submit([encoder.finish()]);
          const done = current.device.queue.onSubmittedWorkDone().then(() => {
            if (current !== attempt) throw new BackendError('device-lost');
            return { outcome: 'completed', queueCompletedAt: now(), timing: { method: 'benchmark-fence', elapsedMs: now() - startedAt } };
          }).finally(() => { rawPending--; uniforms.forEach(handle => allocator.release(handle)); });
          return Object.freeze({ identity: submission.identity, diagnostic: 'bounded-L0', done });
        } catch (error) { rawPending--; uniforms.forEach(handle => allocator.release(handle)); throw error; }
      }
      const item = makeTicket(submission.identity, handles, { batch: submission, ...(staging ? {
        result: deferred(), staging, mapping: {}, region: { x: 0, y: 0, width: summaryBytes, height: 1 }, fields: Object.freeze(['draftSummary']),
        copy: { staging, bytes: summaryBytes, rowBytes: summaryBytes, bytesPerRow: summaryBytes, rows: 1 },
      } : {}) });
      if (staging) {
        allocator.hold(draft.summary, item.mapping, 'mapping'); allocator.hold(staging.handle, item.mapping, 'mapping'); mappings.add(item);
      }
      uniforms.forEach(handle => allocator.release(handle)); // retiring; the ticket owns them
      submit(item, submission.passes ? 'draft-group' : submission.pipelineId, encode);
      return draft && draft.mode !== 'compute' ? Object.freeze({ ...item.ticket, presentationSubmittedAt: item.queuedAt ?? null }) : item.ticket;
    }),
    // One bounded region (≤ 256 rows) into a pooled staging buffer (≤ 2) with 256-byte row pitch. A
    // region whose staging would exceed maxBufferSize is refused before its lease is consumed: the
    // caller subdivides horizontally, one lease per region.
    readback: (desc, options) => timed('readback', () => {
      record(desc, ['identity', 'source', 'region', 'fields'], 'readback');
      const id = identity(desc.identity), consume = admissionFor(id, options), region = area(desc.region), source = entry(desc.source);
      if (region.height > 256) invalid('readback is limited to 256 rows');
      if (!Array.isArray(desc.fields) || !desc.fields.length || new Set(desc.fields).size !== desc.fields.length || desc.fields.some(field => typeof field !== 'string' || !field)) invalid('readback fields must be non-empty unique strings');
      const image = source.description.width !== undefined;
      const bpt = image ? source.description.bytesPerTexel : 1, width = image ? source.description.width : source.description.bytes, height = image ? source.description.height : 1;
      if (region.x + region.width > width || region.y + region.height > height) invalid('readback region outside source');
      if (!image && (region.x % 4 || region.width % 4)) invalid('buffer readback offsets and widths are multiples of four bytes');
      const rowBytes = region.width * bpt, bytesPerRow = alignUp(rowBytes, 256), bytes = bytesPerRow * region.height;
      if (bytes > attempt.limits.maxBufferSize) throw new BackendError('allocation-failed', 'readback requires horizontal subdivision by the caller');
      const staging = stagingFor(bytes, bytesPerRow);
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
    }),
    present: (desc, options) => timed('present', () => {
      record(desc, ['identity', 'display'], 'presentation');
      const id = identity(desc.identity), consume = admissionFor(id, options), display = entry(desc.display);
      const prepared = pipelines.get(PRESENT_PIPELINE_ID);
      if (!prepared || prepared.descriptor.kind !== 'render') throw new BackendError('preparation-failed', 'the presentation pipeline is not prepared');
      if (display.description.format !== 'rgba8unorm') invalid('present requires an rgba8unorm display texture');
      const output = attempt.presenter.size(), internal = display.description;
      const uniforms = createScoped(() => allocator.allocate({ name: 'uniforms:present', bytes: 16, usage: 'uniform', data: packUniforms(prepared.descriptor.uniformLayout, { internal_size: [internal.width, internal.height], output_size: [output.width, output.height] }) })).value;
      try { consume(); } catch (error) { allocator.release(uniforms); throw error; }
      const item = makeTicket(id, [desc.display, uniforms]);
      allocator.release(uniforms);
      submit(item, 'present', encoder => attempt.presenter.encode(encoder, { pipeline: prepared.pipeline, display: display.native, uniforms: entry(uniforms, true).native }));
      return item.ticket;
    }),
    release(handle) { allocator.release(handle); },
    onLoss(callback) { if (typeof callback !== 'function') invalid('loss callback must be a function'); listeners.add(callback); return () => listeners.delete(callback); },
    currentEpoch: () => epoch,
    diagnostics() { return deepFreeze({ state, epoch, ...allocator.diagnostics() }); },
    destroy() { invalidate('destroyed', 'terminal teardown', true); },
  };
  // Declared separately from the production interface (B00): a real loss without terminal teardown,
  // an injected loss through the same invalidation path, an injected allocation failure, and an
  // observation of uncaptured and creation errors (production visibility is the resource `failure`
  // field and the failed consuming ticket).
  backend.testAdapter = Object.freeze({
    destroyDevice() {
      if (!attempt) return Promise.resolve(false);
      const current = attempt;
      // From here until the loss is observed, nothing is admitted and only the loss path settles work.
      current.lossPending = true;
      current.device.destroy();
      return current.lost.then(() => true);
    },
    injectLoss({ reason = 'unknown', message: text } = {}) { return invalidate(reason, text ?? reason, false); },
    failNextAllocation() { allocator.failNextAllocation(); },
    uncapturedErrors: () => deepFreeze(errors.map(item => ({ ...item }))),
  });
  return Object.freeze(backend);
}
