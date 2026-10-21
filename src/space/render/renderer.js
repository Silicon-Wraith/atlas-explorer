// Space pass orchestration. Resource ownership and execution identities stay here;
// the scheduler owns admission/outcomes and the backend owns queue completion.
import { deepFreeze } from '../../shared/scene.js';
import { createScheduler } from '../../shared/scheduler.js';
import { createRenderRequest, isPublishable, RENDER_OUTCOMES, RUNTIME_ID } from '../../shared/render-request.js';
import { createReportBuilder, observed, UNAVAILABLE } from '../../shared/render-report.js';
import { createSpaceRequest, spaceWorkspaceFields } from '../render-adapter.js';
import { effectiveParameters } from '../numerics/parameters.js';
import { getModel } from '../models/registry.js';
import { basis, encodeOrdinaryOrigin } from '../camera.js';
import { appearanceKey, accumulationKey, sampleKey } from './keys.js';
import { unpackStatus, unpackLightingStatus, STATUS_LABELS } from './status.js';
import { assertBackend, BackendError, createAdmission, createBatch, createJobPlan, createPickRequest, createPipelineSet,
  sampleJitter, TARGET_LAYOUT_ID, TARGET_LAYOUT_V1, LIGHTING_BOUNDS_DEFAULT } from './backend.js';

const WINDOW_LIMIT = 256, INITIAL_PIXELS = 32768, MIN_PIXELS = INITIAL_PIXELS / 4, PREPARATION_BOUND_MS = 60000;
const identity = request => Object.fromEntries(['requestId', 'jobId', 'viewId', 'generation'].map(key => [key, request[key]]));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); promise.catch(() => {}); return { promise, resolve, reject }; };
const sameIdentity = (a, b) => a && b && ['requestId', 'jobId', 'viewId'].every(key => a[key] === b[key]) && isPublishable(a, b.generation);
const sameSize = (a, b) => a.width === b.width && a.height === b.height;
const flatHandles = targets => Object.values(targets.handles).flat();
const stale = () => ({ stale: true });
let preparationId = 0;

// admit() transfers leases for the entire scheduler, not just the calling view.
// All Space views sharing it therefore share one dispatcher. A second subscriber
// must never consume (and fail) a lease belonging to the first renderer.
const dispatchers = new WeakMap();
function registerDispatcher(scheduler, viewId, dispatch) {
  let dispatcher = dispatchers.get(scheduler);
  if (!dispatcher) {
    const views = new Map();
    let pumping = false, again = false, epoch = scheduler.snapshot().epoch;
    const pump = () => {
      if (!views.size) return;
      if (pumping) { again = true; return; }
      pumping = true; again = false;
      try {
        // One bounded admission call; submission follows immediately, with no
        // animation frame, input cadence or timer in between.
        for (const { operation, admission } of scheduler.admit()) {
          const owner = views.get((operation.batch ?? operation.descriptor).identity.viewId);
          if (owner) owner(operation, admission);
          else scheduler.failed(admission, new Error('no renderer owns the admitted view'));
        }
      } finally {
        pumping = false;
        if (again) { again = false; queueMicrotask(pump); }
      }
    };
    dispatcher = { views, pump, get epoch() { return epoch; },
      unsubscribe: scheduler.subscribe(event => { epoch = event.epoch; pump(); }) };
    dispatchers.set(scheduler, dispatcher);
  }
  if (dispatcher.views.has(viewId)) throw new TypeError('a scheduler view already has a renderer');
  dispatcher.views.set(viewId, dispatch);
  return { pump: dispatcher.pump, get epoch() { return dispatcher.epoch; }, detach() {
    dispatcher.views.delete(viewId);
    if (dispatcher.views.size) return false;
    dispatcher.unsubscribe(); dispatchers.delete(scheduler); return true;
  } };
}

function emptyCounts() {
  return { rayTermination: { hit: 0, miss: 0, unresolved: { pointBudget: 0, estimateUnavailable: 0, rayStepBudget: 0, stagnation: { rayParameter: 0, fieldCoordinate: 0 } }, numericalFailure: 0 },
    unavailableNormals: 0, lightingFailures: { shadow: 0, ao: 0, both: 0 } };
}
function countReadback(counts, field, bytes) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (field === 'normal') {
    for (let i = 6; i < bytes.byteLength; i += 8) if ((data.getUint16(i, true) & 0x7fff) === 0) counts.unavailableNormals++;
  } else for (let i = 0; i < bytes.byteLength; i += 4) {
    const word = data.getUint32(i, true);
    if (field === 'lightingStatus') {
      const { shadow, ao } = unpackLightingStatus(word);
      if (shadow) counts.lightingFailures.shadow++; if (ao) counts.lightingFailures.ao++; if (shadow && ao) counts.lightingFailures.both++;
    } else {
      const { status, reason, subreason } = unpackStatus(word), rays = counts.rayTermination;
      if (status === 0) rays.hit++;
      else if (status === 1) rays.miss++;
      else if (status === 3) rays.numericalFailure++;
      else if (status === 2 && reason >= 1 && reason <= 3) rays.unresolved[['', 'pointBudget', 'estimateUnavailable', 'rayStepBudget'][reason]]++;
      else if (status === 2 && reason === 4 && [1, 2].includes(subreason)) rays.unresolved.stagnation[subreason === 1 ? 'rayParameter' : 'fieldCoordinate']++;
      else throw new BackendError('invalid-descriptor', 'invalid ray status readback');
    }
  }
}

// An injected scheduler is dedicated to Space rendering: every submitting view
// must have a registered Space renderer. Admission cannot be peeked at or returned,
// so a foreign dispatcher must use a different scheduler. Injected infrastructure
// remains caller-owned; destroying this renderer releases only its own resources.
export function createSpaceRenderer({ backend, scheduler, clock, viewId, versions, pipelineSet }) {
  assertBackend(backend);
  const now = typeof clock === 'function' ? clock : clock?.now;
  if (typeof now !== 'function') throw new TypeError('renderer requires a clock');
  const setTimer = clock?.schedule ?? ((fn, ms) => setTimeout(fn, ms)), clearTimer = clock?.clear ?? (id => clearTimeout(id));
  const ownsScheduler = !scheduler;
  scheduler ??= createScheduler({ clock: now, makeAdmission: createAdmission, setTimer, clearTimer });
  if (!scheduler.snapshot().views.some(view => view.viewId === viewId)) scheduler.registerView(viewId);
  const pipelines = createPipelineSet(pipelineSet);
  const listeners = Object.fromEntries(['Publish', 'Present', 'Report', 'Status'].map(name => [name, new Set()]));
  const jobs = new Map(), owners = new Map(), auxiliary = new Map();
  const submittedJobs = new Set(), submittedRequests = new Set();
  let current = null, interactive = null, published = null, geometryCache = null, destroyed = false;
  let preparation = null, prepared = null, acquisition = null, acquiring = null, serial = 0, auxSerial = 0;
  const emit = (name, value) => { for (const listener of listeners[name]) { try { listener(deepFreeze(value)); } catch { /* isolate observers */ } } };
  const subscribe = name => listener => { if (typeof listener !== 'function') throw new TypeError('listener must be a function'); listeners[name].add(listener); return () => listeners[name].delete(listener); };
  function hold(handles) { for (const handle of handles) owners.set(handle, (owners.get(handle) ?? 0) + 1); }
  function release(handles) {
    for (const handle of handles) {
      const count = owners.get(handle); if (!count) continue;
      if (count > 1) owners.set(handle, count - 1);
      else { owners.delete(handle); backend.release(handle); }
    }
  }
  function forgetGeometry() { if (geometryCache) release(geometryCache.handles); geometryCache = null; }
  function fresh(record) {
    try { return !destroyed && current === record && !record.result && !record.cancelled && record.request.viewId === viewId &&
      record.request.generation.deviceEpoch === backend.currentEpoch() && isPublishable(record.request, record.currentGeneration()); }
    catch { return false; }
  }
  function publishedCurrent(snapshot) {
    return !destroyed && snapshot && published === snapshot && snapshot.request.viewId === viewId &&
      snapshot.request.generation.deviceEpoch === backend.currentEpoch();
  }
  function classifiable(record) {
    if (!record) return false;
    if (!record.result) return fresh(record);
    try { return record.result.outcome === 'completed' && !destroyed && current === record && !record.cancelled &&
      record.request.viewId === viewId && record.request.generation.deviceEpoch === backend.currentEpoch() &&
      isPublishable(record.request, record.currentGeneration()); } catch { return false; }
  }
  function pending() { if (published) emit('Status', { pending: true, since: now() }); }
  function finish(record, result) {
    if (record.result) return;
    if (!RENDER_OUTCOMES.includes(result.outcome)) throw new RangeError('unknown job outcome');
    if (record.internal) {
      record.result = result; release(record.handles); jobs.delete(record.request.jobId);
      record.done.resolve(result); return;
    }
    record.builder.mark('completed');
    const fields = spaceWorkspaceFields({ request: record.request, counts: record.publishedCounts,
      samplesCompleted: record.samplesCompleted, milestones: record.milestones,
      allocation: { peak: backend.diagnostics().peak, outstandingBatchesMax: record.outstandingMax },
      gpuTiming: { completionMethod: 'queue-completion', queueElapsedMs: record.queueElapsedMs,
        ...(record.timestampCount === record.completionCount && record.timestampCount ? { timestampMs: record.timestampMs } : {}) },
    });
    const report = record.builder.finish(result.outcome, { reason: result.reason ?? '', completed: record.samplesCompleted ? {
      ...record.request.quality.internalSize, iteration: record.request.quality.iteration, tracing: record.request.quality.tracing,
      samples: record.samplesCompleted, lighting: record.publishedQuality.lighting,
    } : null, details: { ...fields, geometryRequestId: record.geometryRequestId, appearanceRebound: record.geometryRequestId !== record.request.requestId,
      ...(result.continuation ? { continuation: result.continuation } : {}), ...(result.submitted ? { submitted: result.submitted } : {}),
    } });
    record.result = Object.freeze({ ...result, report });
    release(record.handles); record.handles = []; jobs.delete(record.request.jobId);
    emit('Report', report); record.done.resolve(record.result);
  }
  function fail(record, error) {
    record.error = error;
    finish(record, { outcome: error.code === 'device-lost' || record.request.generation.deviceEpoch !== backend.currentEpoch() ? 'interrupted' : 'failed', reason: error.message });
    // Preparation/configuration failed before a lease existed. Retire the waiting
    // scheduler record as well; failed(admission) cannot describe unissued work.
    if (record.scheduled) scheduler.cancel(record.request.jobId);
  }
  function pipeline(pass, record, stage) {
    const entry = pass === 'probe' ? 'probe' : pass === 'classify' ? 'evaluate_points' : pass === 'shade' && stage === 'diagnostic'
      ? `diagnostic_${record.request.sceneSnapshot.appearance.viewMode}` : `${pass}_band`;
    const candidates = pipelines.descriptors.filter(item => item.kind === 'compute' && item.entryPoint === entry);
    // Until the product families are assembled, fixtures may use one descriptor per
    // entry. A family-specific descriptor is explicit, never guessed from FIELD.
    const selected = candidates.find(item => item.pipelineId === `${entry}:${record.model?.id}`) ?? (candidates.length === 1 ? candidates[0] : null);
    if (!selected) throw new BackendError('preparation-failed', `missing or ambiguous pipeline for ${entry}`);
    return selected;
  }
  function stageQuality(request, ordinal) {
    const quality = request.quality;
    if (ordinal === 0 && quality.lighting.stage === 'full') return { ...quality,
      lighting: { ...quality.lighting, stage: 'direct', shadowRays: 0, shadowSteps: 0, aoSamples: 0 } };
    return quality;
  }
  function batch(record, pass, region, sample, quality, extra = {}) {
    const descriptor = pipeline(pass, record, quality.lighting.stage), handles = record.targets?.handles ?? {};
    const alias = { ...handles, probe_target: handles.status,
      previous: handles.accumulation?.[sample & 1], next: handles.accumulation?.[(sample + 1) & 1],
      accumulation: handles.accumulation?.[(sample + 1) & 1], display: record.displayHandle, ...extra.handles };
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
      sampleIndex: sample, seed: sampling.seed, lightingStage: quality.lighting.stage === 'full' ? 1 : quality.lighting.stage === 'diagnostic' ? 2 : 0,
      jitter: [jitter.dx, jitter.dy], maxIterations: quality.iteration.maxIterations, maxSteps: quality.tracing.maxSteps,
      stepMultiplier: quality.tracing.stepMultiplier, toleranceFloor: quality.tracing.toleranceFloor,
      power: effective.power, C: effective.C, kappa: effective.kappa, depth: effective.depth, ...extra.uniforms };
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
    return createBatch({ identity: identity(record.request), pipelineId: descriptor.pipelineId, pass: pass === 'classify' ? 'probe' : pass,
      region, sample: { sequence: sampling.sequence, seed: sampling.seed, index: sample },
      bounds: { pixels: region.width * region.height, iterations: quality.iteration.maxIterations, raySteps: quality.tracing.maxSteps,
        normalFieldSamples: quality.lighting.normalFieldSamples, shadowRays: quality.lighting.shadowRays,
        shadowSteps: quality.lighting.shadowSteps, aoSamples: quality.lighting.aoSamples }, inputs, outputs, uniforms });
  }
  function publish(record, meta, display) {
    if (!fresh(record)) return false;
    const geometry = { sample: meta.sample, status: record.targets.handles.status, depth: record.targets.handles.depth };
    const handles = [display, geometry.status, geometry.depth], old = published; hold(handles);
    published = { request: record.request, record, display, geometry, handles }; if (old) release(old.handles);
    record.builder.mark('published'); record.samplesCompleted = meta.sample + 1;
    record.publishedCounts = structuredClone(record.counts); record.publishedQuality = meta.quality;
    const elapsed = now() - record.requestedAt;
    if (!record.request.quality.preview && meta.ordinal === 0) record.milestones.settledFirstImageMs = elapsed;
    if (meta.last) record.milestones.fullQualityMs = elapsed;
    const appearance = appearanceKey(record.request.sceneSnapshot, meta.quality);
    emit('Publish', { kind: record.request.quality.preview ? 'draft' : meta.ordinal === 0 ? 'settled-first' : 'refinement',
      requestId: record.request.requestId, geometryRequestId: record.geometryRequestId, samples: meta.sample + 1, sampleIndex: meta.sample, pending: false,
      appearanceKey: appearance, accumulationKey: accumulationKey(record.request.keys.geometryKey, appearance, record.request.quality.sampling),
      quality: meta.quality, publishedAt: now(), rayTermination: record.publishedCounts.rayTermination });
    emit('Status', { pending: false }); return true;
  }

  function makePlan(record) {
    const request = record.request, target = request.quality.sampling.targetSamples;
    const full = request.quality.lighting.stage === 'full';
    const sampleCount = full ? target + 1 : target;
    let ordinal = 0, phaseIndex = 0, x = 0, y = 0, sequence = 0, pixels = INITIAL_PIXELS;
    let windowIds = [], windowLeft = 0, phaseEnded = false, completions = 0, replacements = 0, boundaries = 0, lastReplacement = 0;
    const metadata = new Map(), remaining = new Set();
    const phases = ['trace', 'normals', 'shade', 'accumulate', 'display', 'status', 'normal', 'lightingStatus', 'present'];
    function meta() {
      const sample = full && ordinal > 0 ? ordinal - 1 : ordinal;
      return { ordinal, sample, quality: stageQuality(request, ordinal), last: ordinal === sampleCount - 1 };
    }
    function skipGeometry() {
      return record.geometry && record.geometry.sample === meta().sample && record.geometry.sampleKey === sampleKey(request.keys.geometryKey, request.quality.sampling, meta().sample);
    }
    function nextWindow(dependencies = []) {
      if (ordinal >= sampleCount) return [];
      while (phaseIndex < 2 && skipGeometry()) phaseIndex++;
      const phase = phases[phaseIndex], m = meta(), operations = [];
      if (phase === 'trace' && x === 0 && y === 0) {
        record.targets = { ...record.targets, handles: { ...record.targets.handles, ...record.geometrySets[m.sample % record.geometrySets.length] } };
      }
      record.displayHandle = record.targets.handles[ordinal % 2 === 0 ? 'display' : 'retained'];
      const size = request.quality.internalSize;
      phaseEnded = false;
      do {
        const id = `${request.jobId}/${++sequence}`;
        let op;
        if (phase === 'present') { op = { id, dependsOn: dependencies, kind: 'presentation', descriptor: { identity: identity(request), display: record.displayHandle } }; phaseEnded = true; }
        else {
          const readback = ['status', 'normal', 'lightingStatus'].includes(phase), bpt = readback ? TARGET_LAYOUT_V1[phase].bytesPerTexel : 0;
          const maxBuffer = acquisition?.limits?.maxBufferSize ?? 2 ** 28;
          const maxWidth = readback ? Math.floor(maxBuffer / 256) * 256 / bpt : size.width;
          const tileWidth = Math.min(size.width, pixels, maxWidth);
          const width = Math.min(size.width - x, tileWidth);
          if (width < 1) throw new BackendError('allocation-failed', 'a single aligned readback row exceeds maxBufferSize');
          const rows = Math.min(size.height - y, Math.max(1, Math.floor(pixels / tileWidth)),
            readback ? Math.min(256, Math.floor(maxBuffer / (Math.ceil(tileWidth * bpt / 256) * 256))) : 256);
          const region = { x, y, width, height: rows };
          op = readback ? { id, dependsOn: dependencies, kind: 'readback', descriptor: { identity: identity(request), source: record.targets.handles[phase], region, fields: [phase] } }
            : { id, dependsOn: dependencies, kind: 'batch', batch: batch(record, phase, region, m.sample, m.quality) };
          x += width;
          if (x === size.width) { x = 0; y += rows; }
          if (y === size.height) phaseEnded = true;
        }
        metadata.set(id, { ...m, phase }); remaining.add(id); operations.push(op);
      } while (!phaseEnded && operations.length < WINDOW_LIMIT);
      windowIds = operations.map(op => op.id); windowLeft = operations.length;
      return operations;
    }
    function phaseComplete() {
      const phase = phases[phaseIndex], m = meta();
      if (phase === 'normals') {
        record.geometry = { sample: m.sample, sampleKey: sampleKey(request.keys.geometryKey, request.quality.sampling, m.sample), serial: record.geometrySerial };
        record.geometryRequestId = request.requestId;
        // Only centre geometry is reusable as the first sample of a fresh sequence.
        // Later AA samples are not relabelled sample zero on appearance edits.
        if (m.sample === 0 && fresh(record)) {
          forgetGeometry(); const handles = ['depth', 'status', 'normal'].map(name => record.targets.handles[name]); hold(handles);
          geometryCache = { ...record.geometry, handles, request, geometryRequestId: record.geometryRequestId };
        }
      }
      if (phase === 'present') {
        ordinal++; phaseIndex = 0; record.counts = emptyCounts();
      } else phaseIndex++;
      x = 0; y = 0;
    }
    const initial = nextWindow();
    const plan = createJobPlan({ request, operations: initial, onAdvance(operation, evidence, pendingOperations) {
      completions++; remaining.delete(operation.id); windowLeft--;
      if (windowLeft === 0) {
        if (phaseEnded) phaseComplete();
        const next = nextWindow(windowIds);
        if (!next.length) return undefined;
        boundaries++; replacements++; lastReplacement = completions; return [...pendingOperations, ...next];
      }
      if (evidence.elapsedMs >= 0.5 * evidence.targetMs && evidence.elapsedMs <= 2 * evidence.targetMs || completions - lastReplacement < 8) return undefined;
      if (evidence.elapsedMs < 0.5 * evidence.targetMs) { pixels = Math.min(INITIAL_PIXELS * 8, pixels * 2); return undefined; }
      // A long slow stream must not recursively reduce every later pass to single
      // pixels. The tile budget bottoms at one quarter of its initial value;
      // row/edge rounding and readback limits may still require smaller regions.
      pixels = Math.max(MIN_PIXELS, Math.floor(pixels / 2));
      if (pendingOperations.length >= WINDOW_LIMIT - 1) return undefined;
      const candidate = pendingOperations.find(op => {
        if (op.kind !== 'batch') return false;
        const { width, height } = op.batch.region;
        return height > 1 ? Math.floor(height / 2) * width >= MIN_PIXELS : Math.floor(width / 2) >= MIN_PIXELS;
      });
      if (!candidate) return undefined;
      const region = candidate.batch.region, vertical = region.height > 1, dimension = vertical ? 'height' : 'width', axis = vertical ? 'y' : 'x';
      const firstRegion = { ...region, [dimension]: Math.floor(region[dimension] / 2) };
      const secondRegion = { ...region, [axis]: region[axis] + firstRegion[dimension], [dimension]: region[dimension] - firstRegion[dimension] };
      const m = metadata.get(candidate.id), childId = `${request.jobId}/${++sequence}`;
      const child = { ...candidate, id: childId, batch: batch(record, candidate.batch.pass, firstRegion, m.sample, m.quality) };
      const barrier = { ...candidate, dependsOn: [childId], batch: batch(record, candidate.batch.pass, secondRegion, m.sample, m.quality) };
      metadata.set(childId, m); remaining.add(childId); windowIds.push(childId); windowLeft++;
      replacements++; lastReplacement = completions;
      return pendingOperations.flatMap(op => op === candidate ? [child, barrier] : [op]);
    } });
    record.metadata = metadata;
    return Object.freeze({ ...plan, diagnostics: () => Object.freeze({ pendingCount: remaining.size,
      pendingSamples: [...new Set([...remaining].map(id => { const m = metadata.get(id); return `${m.quality.lighting.stage}:${m.sample}`; }))],
      completions, replacements, boundaryReplacements: boundaries }) });
  }

  const dispatcher = registerDispatcher(scheduler, viewId, dispatch), pump = dispatcher.pump;
  function dispatch(operation, admission) {
    const descriptor = operation.batch ?? operation.descriptor, aux = auxiliary.get(operation.id), record = aux?.record ?? jobs.get(descriptor.identity.jobId);
    if (!record) { scheduler.failed(admission, new Error('renderer does not own admitted job')); return; }
    const meta = record.metadata?.get(operation.id);
    record.builder?.mark('admitted'); record.builder?.mark('submitted');
    record.outstanding = (record.outstanding ?? 0) + 1; record.outstandingMax = Math.max(record.outstandingMax ?? 0, record.outstanding);
    let counted = true;
    const retire = () => { if (counted) { counted = false; record.outstanding--; } };
    const discardAuxiliary = reason => {
      retire();
      try {
        return scheduler.discardAuxiliary(admission, { reason });
      } finally {
        // A false return means this lease is already retired or stale. Local
        // ownership must still settle; never retry, fabricate completion evidence
        // or fail the main job. Cleanup also covers synchronous notifications.
        auxiliary.delete(operation.id); aux.done.resolve(stale());
      }
    };
    let ticket;
    try {
      if (aux && !aux.valid()) throw new BackendError('stale-epoch', 'auxiliary snapshot replaced before submission');
      if (!record.internal && !aux && !fresh(record)) {
        // The lease exists but no backend work has entered the queue. Cancelling
        // first makes a pre-submission rejection terminal drain evidence, without
        // turning the stale job into a failed job or drawing an obsolete image.
        scheduler.cancel(record.request.jobId);
        throw new BackendError('stale-epoch', 'request superseded before submission');
      }
      if (operation.kind === 'batch') {
        if (operation.batch.pass === 'trace') {
          record.geometry = null; record.geometrySerial = ++serial;
          if (geometryCache?.handles.some(handle => handle === record.targets.handles.depth)) forgetGeometry();
        }
        ticket = backend.submitBatch(operation.batch, { admission });
      } else if (operation.kind === 'readback') ticket = backend.readback(operation.descriptor, { admission });
      else {
        ticket = backend.present(operation.descriptor, { admission });
        if (!record.internal && fresh(record)) publish(record, meta, operation.descriptor.display);
      }
    } catch (error) {
      retire();
      if (aux) discardAuxiliary(error.message);
      else { record.error = error; scheduler.failed(admission, error); }
      aux?.done.resolve(stale());
      if (aux) auxiliary.delete(operation.id);
      return;
    }
    // Keep the lease until mapping copy-out finishes as well as queue completion.
    // A staging buffer cannot be reused while its result is still being copied.
    (async () => {
      try {
        const completion = await ticket.done;
        if (completion.outcome === 'interrupted') {
          retire();
          scheduler.interrupted(descriptor.identity.generation.deviceEpoch);
          aux?.done.resolve(stale()); return;
        }
        if (completion.outcome === 'failed') {
          retire();
          if (aux) discardAuxiliary(completion.reason);
          else scheduler.failed(admission, new Error(completion.reason));
          aux?.done.resolve(stale()); return;
        }
        if (!record.internal && !record.result) {
          // A completed queue fence remains timing evidence even if subsequent
          // copy-out rejects. Later inspections do not rewrite a settled report.
          record.queueElapsedMs += completion.timing.elapsedMs; record.completionCount++;
          if (completion.timing.timestampMs !== undefined) { record.timestampCount++; record.timestampMs += completion.timing.timestampMs; }
        }
        let result;
        if (ticket.result) {
          result = await ticket.result;
          if (!sameIdentity(result.identity, descriptor.identity)) {
            if (aux) {
              discardAuxiliary('readback identity mismatch'); return;
            }
            else throw new BackendError('invalid-descriptor', 'readback identity mismatch');
          }
          record.builder?.mark('readback');
          if (record.internal) {
            if (result.data.byteLength !== 4 || new DataView(result.data.buffer, result.data.byteOffset, 4).getUint32(0, true) !== 0x41544c53) throw new BackendError('preparation-failed', 'ATLS probe mismatch');
          } else if (!aux && !record.result) {
            const field = operation.descriptor.fields[0], expected = operation.descriptor.region.width * operation.descriptor.region.height * TARGET_LAYOUT_V1[field].bytesPerTexel;
            if (result.data.byteLength !== expected) throw new BackendError('invalid-descriptor', 'incomplete status readback');
            countReadback(record.counts, field, result.data);
          }
        }
        if (operation.kind === 'presentation' && fresh(record)) emit('Present', { identity: identity(record.request), queueCompletedAt: completion.queueCompletedAt, evidence: 'presenter-queue-completion' });
        // completed() notifies the dispatcher synchronously. Copy-out is finished;
        // remove this ticket before a replacement lease can increment the count.
        retire();
        scheduler.completed(admission, { epoch: descriptor.identity.generation.deviceEpoch, elapsedMs: completion.timing.elapsedMs,
          ...(completion.timing.timestampMs === undefined ? {} : { timestampMs: completion.timing.timestampMs }) });
        aux?.done.resolve(result ?? completion);
      } catch (error) {
        retire();
        if (aux) discardAuxiliary(error.message);
        else { record.error = error; scheduler.failed(admission, error); }
        aux?.done.resolve(stale());
      }
      finally { retire(); if (aux) auxiliary.delete(operation.id); pump(); }
    })();
  }
  const unsubscribeLoss = backend.onLoss(event => {
    prepared = null; preparation = null; published = null; geometryCache = null; owners.clear();
    scheduler.interrupted(event.epoch); scheduler.setEpoch(0);
    for (const record of jobs.values()) if (!record.scheduled) finish(record, { outcome: 'interrupted', reason: 'device-lost' });
    emit('Status', { phase: 'interrupted', epoch: event.epoch });
  });
  function schedule(record, plan, priority, kind) {
    record.scheduled = scheduler.request(viewId, { jobId: record.request.jobId, requestId: record.request.requestId, priority, kind, plan });
    record.scheduled.done.then(result => finish(record, result)); pump();
  }
  async function acquire() {
    if (backend.currentEpoch()) return;
    acquiring ??= backend.acquire().then(receipt => { acquisition = receipt; }).finally(() => { acquiring = null; });
    await acquiring;
  }
  async function prepare() {
    if (destroyed) throw new BackendError('unavailable', 'renderer destroyed');
    if (prepared?.epoch === backend.currentEpoch()) return prepared;
    if (preparation) return preparation;
    const attempt = deferred(), token = {}; preparation = attempt.promise;
    let active = true, preparationRecord;
    const timer = setTimer(() => {
      active = false; if (preparationRecord?.scheduled) scheduler.cancel(preparationRecord.request.jobId);
      attempt.reject(new BackendError('preparation-failed', 'preparation timed out'));
    }, PREPARATION_BOUND_MS);
    emit('Status', { phase: 'preparing' });
    (async () => {
      try {
        await acquire();
        const epoch = backend.currentEpoch(); if (dispatcher.epoch !== epoch) scheduler.setEpoch(epoch);
        const receipt = await backend.prepare({ epoch, pipelineSet: pipelines, onProgress: progress => { if (active) emit('Status', { phase: 'preparing', ...progress }); } });
        if (!active || destroyed || epoch !== backend.currentEpoch()) throw new BackendError('device-lost');
        const targets = await backend.configureTargets({ epoch, layoutId: TARGET_LAYOUT_ID, internalSize: { width: 1, height: 1 }, outputSize: { width: 1, height: 1 } });
        hold(flatHandles(targets));
        if (!active || destroyed || epoch !== backend.currentEpoch()) { release(flatHandles(targets)); throw new BackendError('device-lost'); }
        const id = `${RUNTIME_ID}-space-prepare-${++preparationId}`;
        const request = createRenderRequest({ requestId: id, jobId: id, viewId, sceneSnapshot: {}, sceneHash: 'preparation',
          output: { width: 1, height: 1, purpose: 'swatch' }, quality: {}, generation: { deviceEpoch: epoch, viewRevision: 0, geometryRevision: 0, appearanceRevision: 0 },
          keys: { geometryKey: 'preparation', appearanceKey: 'preparation' } });
        const record = { request, internal: true, targets, handles: flatHandles(targets), done: deferred(), token };
        preparationRecord = record; jobs.set(id, record);
        const quality = { internalSize: { width: 1, height: 1 }, sampling: { sequence: 'atlas-aa-v1', seed: 0 }, iteration: { maxIterations: 0 }, tracing: { maxSteps: 0 },
          lighting: { stage: 'direct', ...LIGHTING_BOUNDS_DEFAULT, shadowRays: 0, shadowSteps: 0, aoSamples: 0 } };
        const probe = { id: `${id}/probe`, dependsOn: [], kind: 'batch', batch: batch(record, 'probe', { x: 0, y: 0, width: 1, height: 1 }, 0, quality) };
        const readback = { id: `${id}/read`, dependsOn: [probe.id], kind: 'readback', descriptor: { identity: identity(request), source: targets.handles.status, region: probe.batch.region, fields: ['probe'] } };
        schedule(record, createJobPlan({ request, operations: [probe, readback] }), 'inspection', 'settled');
        const result = await record.done.promise;
        if (result.outcome !== 'completed') throw record.error ?? new BackendError(result.outcome === 'interrupted' ? 'device-lost' : 'preparation-failed', result.reason);
        if (!active || destroyed || epoch !== backend.currentEpoch()) throw new BackendError('device-lost');
        prepared = receipt; emit('Status', { phase: 'prepared', epoch }); attempt.resolve(receipt);
      } catch (error) {
        if (preparationRecord && !preparationRecord.scheduled) finish(preparationRecord, { outcome: 'failed', reason: error.message });
        attempt.reject(error);
      }
      finally { active = false; clearTimer(timer); if (preparation === attempt.promise) preparation = null; }
    })();
    return attempt.promise;
  }
  function render(request, { currentGeneration = () => request.generation } = {}) {
    if (destroyed) throw new BackendError('unavailable', 'renderer destroyed');
    if (request.viewId !== viewId) throw new TypeError('request belongs to another view');
    if (submittedJobs.has(request.jobId) || submittedRequests.has(request.requestId)) throw new TypeError('execution identity already submitted');
    const model = getModel(request.sceneSnapshot.model.id, request.sceneSnapshot.model.version);
    submittedJobs.add(request.jobId); submittedRequests.add(request.requestId);
    pending();
    const record = { request, model, currentGeneration: typeof currentGeneration === 'function' ? currentGeneration : () => currentGeneration,
      effective: effectiveParameters(model.id, request.sceneSnapshot.parameters).effective,
      requestedAt: now(), builder: createReportBuilder(request, { implementation: versions, clock: now,
        environment: () => ({ backend: observed('Space backend interface', 'renderer backend contract'), device: acquisition?.identity ?? UNAVAILABLE }) }),
      done: deferred(), handles: [], geometryRequestId: request.requestId, geometrySerial: 0, samplesCompleted: 0,
      milestones: {}, counts: emptyCounts(), queueElapsedMs: 0, completionCount: 0, timestampCount: 0, timestampMs: 0, outstanding: 0, outstandingMax: 0 };
    if (request.output.purpose === 'interactive') {
      // Every earlier interactive request was already cancelled by its successor.
      // Avoid scanning a burst of registrations whose done microtasks are pending.
      if (interactive && !interactive.result) cancel(interactive.request.jobId);
      interactive = record;
    }
    current = record;
    jobs.set(request.jobId, record);
    let readyPlan = null;
    const waitingPlan = Object.freeze({ request,
      next: () => readyPlan?.next() ?? null,
      exhausted: () => readyPlan?.exhausted() ?? false,
      advance: (operation, evidence) => readyPlan.advance(operation, evidence),
      diagnostics: () => readyPlan?.diagnostics() ?? Object.freeze({ pendingCount: 0, pendingSamples: [], completions: 0, replacements: 0, boundaryReplacements: 0 }),
    });
    function register() {
      if (record.scheduled || record.result) return;
      const epoch = backend.currentEpoch();
      if (!epoch || request.generation.deviceEpoch !== epoch) throw new BackendError('device-lost');
      if (dispatcher.epoch !== epoch) scheduler.setEpoch(epoch);
      schedule(record, waitingPlan, request.output.purpose === 'export' ? 'export' : request.output.purpose === 'swatch' ? 'swatch' : request.quality.preview ? 'navigation' : 'refinement', request.quality.profile);
      if (record.cancelled) scheduler.cancel(request.jobId).done.then(record.cancellation?.resolve);
    }
    // Update must be able to select this immutable request before any asynchronous
    // pipeline/target work. A cold backend first needs a valid acquired epoch.
    if (backend.currentEpoch()) { try { register(); } catch (error) { fail(record, error); } }
    (async () => {
      try {
        if (record.result) return;
        await acquire(); register();
        if (prepared?.epoch !== backend.currentEpoch()) { record.builder.mark('preparing'); await prepare(); record.builder.mark('prepared'); }
        if (record.result) return;
        if (request.generation.deviceEpoch !== backend.currentEpoch()) throw new BackendError('device-lost');
        // Configuration is the only pre-admission dependency. Never wait for a
        // timer/frame after the resources needed by this immutable plan exist.
        const description = { epoch: request.generation.deviceEpoch, layoutId: TARGET_LAYOUT_ID,
          internalSize: request.quality.internalSize, outputSize: { width: request.output.width, height: request.output.height } };
        const geometryNames = ['depth', 'status', 'normal'];
        let spare = null;
        if (request.quality.sampling.targetSamples > 1) {
          // The annex allocates complete target sets. Keep only the spare geometry
          // before allocating working targets, bounding the transient allocation.
          const extra = await backend.configureTargets(description), all = flatHandles(extra); hold(all);
          if (record.result || destroyed) { release(all); return; }
          spare = Object.fromEntries(geometryNames.map(name => [name, extra.handles[name]]));
          const kept = Object.values(spare); release(all.filter(handle => !kept.includes(handle)));
          record.handles.push(...kept);
        }
        const targets = await backend.configureTargets(description);
        hold(flatHandles(targets));
        if (record.result || destroyed) { release(flatHandles(targets)); return; }
        record.handles.push(...flatHandles(targets)); record.targets = targets;
        if (geometryCache && geometryCache.request.generation.deviceEpoch === request.generation.deviceEpoch && geometryCache.request.keys.geometryKey === request.keys.geometryKey &&
          geometryCache.request.generation.geometryRevision === request.generation.geometryRevision &&
          geometryCache.sampleKey === sampleKey(request.keys.geometryKey, request.quality.sampling, 0) && geometryCache.handles.every(handle => owners.has(handle))) {
          const handles = { ...targets.handles };
          for (const [i, name] of ['depth', 'status', 'normal'].entries()) {
            release([handles[name]]); record.handles = record.handles.filter(handle => handle !== handles[name]); handles[name] = geometryCache.handles[i];
          }
          hold(geometryCache.handles); record.handles.push(...geometryCache.handles); record.targets = { ...targets, handles };
          record.geometry = { ...geometryCache }; record.geometrySerial = geometryCache.serial; record.geometryRequestId = geometryCache.geometryRequestId;
        }
        record.geometrySets = [Object.fromEntries(geometryNames.map(name => [name, record.targets.handles[name]])), ...(spare ? [spare] : [])];
        readyPlan = makePlan(record);
        scheduler.ready(request.jobId, { epoch: request.generation.deviceEpoch });
      } catch (error) { fail(record, error); record.cancellation?.resolve({ outcome: 'cancelled', submitted: 'none' }); }
    })();
    return Object.freeze({ jobId: request.jobId, requestId: request.requestId, viewId, request, done: record.done.promise });
  }
  function cancel(jobId) {
    const record = jobs.get(jobId); if (!record || record.internal) return scheduler.cancel(jobId);
    record.cancelled = true;
    if (record.scheduled) return scheduler.cancel(jobId);
    record.cancellation ??= deferred();
    return { accepted: true, done: record.cancellation.promise };
  }
  async function auxiliaryOperation(record, value, valid) {
    // Callers validate immediately before requesting each operation. Dispatch
    // rechecks after any admission wait; it must not submit a replaced snapshot.
    if (!record.scheduled) return stale();
    const operation = { id: `${record.request.jobId}/aux-${++auxSerial}`, dependsOn: [], ...value }, done = deferred();
    auxiliary.set(operation.id, { done, record, valid });
    try {
      const submitted = scheduler.requestAuxiliary(viewId, { jobId: record.request.jobId, priority: 'inspection', operation });
      submitted.done.then(result => { if (result.outcome !== 'completed') { auxiliary.delete(operation.id); done.resolve(stale()); } });
      pump(); return await done.promise;
    } catch { auxiliary.delete(operation.id); return stale(); }
  }
  async function pick(value) {
    let input; try { input = createPickRequest(value); } catch { return stale(); }
    const snapshot = published, record = snapshot?.record, geometry = snapshot?.geometry;
    if (!record || !publishedCurrent(snapshot) || !geometry || !sameIdentity(input.identity, identity(record.request)) ||
      input.geometryRevision !== record.request.generation.geometryRevision || !sameSize(input.dimensions, record.request.quality.internalSize) || input.sampleIndex !== geometry.sample) return stale();
    const handles = [geometry.status, geometry.depth]; hold(handles);
    try {
      const results = [];
      for (let i = 0; i < 2; i++) {
        const result = await auxiliaryOperation(record, { kind: 'readback', descriptor: { identity: input.identity, source: handles[i],
          region: { x: input.pixel[0], y: input.pixel[1], width: 1, height: 1 }, fields: [i ? 'depth' : 'status'] } }, () => publishedCurrent(snapshot));
        if (result.stale || !publishedCurrent(snapshot)) return stale(); results.push(result);
      }
      const word = new DataView(results[0].data.buffer, results[0].data.byteOffset, 4).getUint32(0, true);
      const depth = new DataView(results[1].data.buffer, results[1].data.byteOffset, 4).getFloat32(0, true);
      return deepFreeze({ identity: input.identity, status: STATUS_LABELS.ray[unpackStatus(word).status], depth,
        sample: { camera: record.request.sceneSnapshot.camera, pixel: input.pixel,
          jitter: sampleJitter({ seed: record.request.quality.sampling.seed, sampleIndex: input.sampleIndex, pixel: input.pixel }), dimensions: input.dimensions } });
    } catch { return stale(); } finally { release(handles); }
  }
  async function classifyEffectiveCamera(request) {
    const record = current;
    if (!classifiable(record) || !sameIdentity(identity(request), identity(record.request))) return stale();
    const origin = encodeOrdinaryOrigin(request.sceneSnapshot.camera);
    if (origin.unavailable) return { identity: identity(request), status: 'unresolved', detail: origin };
    const handles = [];
    try {
      // Point transport is high.xyz, low.xyz, kappa, padding. Classification ABI:
      // result word 0 is 1 only for proven exterior; zero/unknown stays unresolved.
      const bytes = new Uint8Array(Float32Array.from([...origin.highF32, ...origin.lowF32, record.effective.kappa ?? 0, 0]).buffer);
      const points = backend.allocate({ name: 'camera-points', bytes: 32, usage: 'storage', data: bytes }); handles.push(points); hold([points]);
      const results = backend.allocate({ name: 'camera-results', bytes: 16, usage: 'storage' }); handles.push(results); hold([results]);
      const evaluated = await auxiliaryOperation(record, { kind: 'batch', batch: batch(record, 'classify', { x: 0, y: 0, width: 1, height: 1 }, 0, request.quality, { handles: { points, results } }) }, () => classifiable(record));
      if (evaluated.stale || !classifiable(record)) return stale();
      const result = await auxiliaryOperation(record, { kind: 'readback', descriptor: { identity: identity(request), source: results,
        region: { x: 0, y: 0, width: 16, height: 1 }, fields: ['cameraClassification'] } }, () => classifiable(record));
      if (result.stale || !classifiable(record)) return stale();
      const data = new DataView(result.data.buffer, result.data.byteOffset, result.data.byteLength);
      return deepFreeze({ identity: identity(request), status: data.getUint32(0, true) === 1 ? 'exterior' : 'unresolved', detail: { source: 'evaluate_points', code: data.getUint32(4, true) } });
    } catch { return stale(); }
    finally { release(handles); }
  }
  return Object.freeze({ prepare, render, pick, classifyEffectiveCamera, cancel,
    resize({ width, height }) {
      const previous = current?.request; if (!previous || sameSize(previous.output, { width, height })) return null;
      const generation = { ...previous.generation, viewRevision: previous.generation.viewRevision + 1, geometryRevision: previous.generation.geometryRevision + 1 };
      const next = createSpaceRequest({ scene: previous.sceneSnapshot, purpose: previous.output.purpose, width, height, profile: previous.quality.profile, generation, viewId, versions });
      pending(); cancel(previous.jobId); current = null; forgetGeometry(); return next;
    },
    onPublish: subscribe('Publish'), onPresent: subscribe('Present'), onReport: subscribe('Report'), onStatus: subscribe('Status'),
    destroy() {
      if (destroyed) return; destroyed = true;
      unsubscribeLoss();
      for (const record of jobs.values()) { scheduler.cancel(record.request.jobId); finish(record, { outcome: 'interrupted', reason: 'destroyed' }); }
      for (const aux of auxiliary.values()) scheduler.cancel(aux.record.request.jobId);
      forgetGeometry(); if (published) release(published.handles); published = null;
      dispatcher.detach();
      if (ownsScheduler) { scheduler.interrupted(dispatcher.epoch); scheduler.setEpoch(0); }
      for (const set of Object.values(listeners)) set.clear();
    },
  });
}
