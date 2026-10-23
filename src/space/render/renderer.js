import { buildSpaceBatch } from './frame-batch.js';
// Space pass orchestration. Resource ownership and execution identities stay here;
// the scheduler owns admission/outcomes and the backend owns queue completion.
import { deepFreeze, canonicalJson } from '../../shared/scene.js';
import { createScheduler } from '../../shared/scheduler.js';
import { createRenderRequest, isPublishable, RENDER_OUTCOMES, RUNTIME_ID } from '../../shared/render-request.js';
import { createReportBuilder, observed, UNAVAILABLE } from '../../shared/render-report.js';
import { createSpaceRequest, spaceWorkspaceFields } from '../render-adapter.js';
import { effectiveParameters } from '../numerics/parameters.js';
import { getModel } from '../models/registry.js';
import { admitPointModel, decodePointResults, encodePoints, mengerBoxData, pointBounds, pointRegion,
  pointsPipelineId, pointUniforms, sentinelResults, POINT_BATCH_PASS, POINT_RESULT_BYTES } from './webgpu/kernels.js';
import { encodeOrdinaryOrigin } from '../camera.js';
import { appearanceKey, accumulationKey, sampleKey } from './keys.js';
import { unpackStatus, POINT_STATUS, STATUS_LABELS } from './status.js';
import { createOutcomeMasks } from './outcome-masks.js';
import { createMaskProcessor } from './mask-processor.js';
import { RECOVERING_FAMILIES } from './webgpu/passes.js';
import { draftExecution as selectDraftExecution, qualifiedDraft } from './draft-execution.js';
import { draftSummaryBytes, validateDraftSummary, DRAFT_SUMMARY_VERSION } from './draft-summary.js';
import { createDraftRecords } from './draft-records.js';
import { assertBackend, BackendError, createAdmission, createBatch, createBatchGroup, createJobPlan, createPickRequest, createPipelineSet,
  sampleJitter, TARGET_LAYOUT_ID, TARGET_LAYOUT, LIGHTING_BOUNDS_DEFAULT } from './backend.js';

const WINDOW_LIMIT = 256, INITIAL_PIXELS = 32768, MIN_PIXELS = INITIAL_PIXELS / 4, PREPARATION_BOUND_MS = 60000;
const identity = request => Object.fromEntries(['requestId', 'jobId', 'viewId', 'generation'].map(key => [key, request[key]]));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); promise.catch(() => {}); return { promise, resolve, reject }; };
const sameIdentity = (a, b) => a && b && ['requestId', 'jobId', 'viewId'].every(key => a[key] === b[key]) && isPublishable(a, b.generation);
const sameSize = (a, b) => a.width === b.width && a.height === b.height;
const flatHandles = targets => Object.values(targets.handles).flat();
const stale = () => ({ stale: true });
// The per-sample geometry targets, kept, reused and cached together (B11c: the recovery word is geometry).
const GEOMETRY_TARGETS = Object.freeze(['depth', 'status', 'normal', 'recovery']);
let preparationId = 0, producerToken = 0;

export function navigationContentKey(scene, output) {
  const {camera, ...content} = scene;
  return canonicalJson({content, output});
}
export function navigationDraftEligible({record, current, interactive, viewId, epoch, destroyed}) {
  try {
    return !destroyed && !record.result && !record.cancelled && record.navigation !== null &&
      record.request.output.purpose === 'interactive' && record.request.quality.preview &&
      current === interactive && !interactive?.cancelled && record.request.viewId === viewId &&
      record.request.generation.deviceEpoch === epoch &&
      record.navigation === record.currentNavigation() &&
      record.navigation === interactive?.navigation &&
      record.navigationContent === interactive?.navigationContent &&
      record.navigationContent === record.currentNavigationContent() &&
      record.currentGeneration().deviceEpoch === epoch &&
      record.currentGeneration().viewRevision >= record.request.generation.viewRevision &&
      record.currentGeneration().geometryRevision >= record.request.generation.geometryRevision &&
      record.request.generation.appearanceRevision === record.currentGeneration().appearanceRevision;
  } catch { return false; }
}

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
// An injected scheduler is dedicated to Space rendering: every submitting view
// must have a registered Space renderer. Admission cannot be peeked at or returned,
// so a foreign dispatcher must use a different scheduler. Injected infrastructure
// remains caller-owned; destroying this renderer releases only its own resources.
// groupDrafts=false is an injected diagnostic/test comparison path; product callers
// use grouping. It changes submission boundaries, never draft quality or diagnostics.
export function createSpaceRenderer({ backend, scheduler, clock, viewId, versions, pipelineSet, groupDrafts = true, draftExecution, maskWork, maskProcessor }) {
  const masksService = maskProcessor ?? createMaskProcessor();
  const draftConfig = selectDraftExecution(draftExecution);
  if (!draftConfig.lifecycle) throw new RangeError('L0–L5 use the diagnostic ladder driver; the product renderer supports L6 variants only');
  assertBackend(backend);
  const now = typeof clock === 'function' ? clock : clock?.now;
  if (typeof now !== 'function') throw new TypeError('renderer requires a clock');
  const setTimer = clock?.schedule ?? ((fn, ms) => setTimeout(fn, ms)), clearTimer = clock?.clear ?? (id => clearTimeout(id));
  const ownsScheduler = !scheduler;
  scheduler ??= createScheduler({ clock: now, makeAdmission: createAdmission, setTimer, clearTimer });
  if (!scheduler.snapshot().views.some(view => view.viewId === viewId)) scheduler.registerView(viewId);
  const pipelines = createPipelineSet(pipelineSet);
  const listeners = Object.fromEntries(['Publish', 'Present', 'Report', 'Status', 'PublicationUpdate', 'PublicationRecord', 'Provisional', 'Restoration'].map(name => [name, new Set()]));
  const jobs = new Map(), owners = new Map(), auxiliary = new Map(), tileLearning = new Map(), excessiveDraftWork = new Set();
  const submittedJobs = new Set(), submittedRequests = new Set();
  let current = null, interactive = null, published = null, geometryCache = null, destroyed = false;
  let preparation = null, prepared = null, acquisition = null, acquiring = null, serial = 0, auxSerial = 0;
  let requestOrder = 0, displayOrder = -1;
  let targetConfiguration = Promise.resolve();
  async function configure(record, description) {
    const previous = targetConfiguration, lane = deferred();
    targetConfiguration = lane.promise;
    try {
      await previous;
      // Recheck after every asynchronous wait, before any reservation. A waiting newest-wins
      // request owns no targets, and an aborted configure drains its scopes before the next one.
      // A finished or cancelled record is already on a terminal path. A record that is merely
      // no longer executable must be ended here, as dispatch would end it, or it waits forever.
      if (record.result || record.cancelled || destroyed) return null;
      if (!executable(record)) { cancel(record.request.jobId); return null; }
      return await backend.configureTargets({ ...description, signal: record.configuration.signal });
    } finally { lane.resolve(); }
  }
  const emit = (name, value) => { for (const listener of listeners[name]) { try { listener(deepFreeze(value)); } catch { /* isolate observers */ } } };
  const subscribe = name => listener => { if (typeof listener !== 'function') throw new TypeError('listener must be a function'); listeners[name].add(listener); return () => listeners[name].delete(listener); };
  const frameRecords = createDraftRecords({ clock: now, onUpdate: update => emit('PublicationUpdate', update) });
  function hold(handles) { for (const handle of handles) owners.set(handle, (owners.get(handle) ?? 0) + 1); }
  function release(handles) {
    for (const handle of handles) {
      const count = owners.get(handle); if (!count) continue;
      if (count > 1) owners.set(handle, count - 1);
      else { owners.delete(handle); backend.release(handle); }
    }
  }
  function forgetGeometry() { if (geometryCache) release(geometryCache.handles); geometryCache = null; }
  function compatibleGeometry(request, generation = request.generation) {
    return geometryCache && geometryCache.request.generation.deviceEpoch === request.generation.deviceEpoch &&
      request.generation.deviceEpoch === generation.deviceEpoch && generation.deviceEpoch === backend.currentEpoch() &&
      geometryCache.request.generation.geometryRevision === request.generation.geometryRevision &&
      request.generation.geometryRevision === generation.geometryRevision && geometryCache.request.keys.geometryKey === request.keys.geometryKey &&
      geometryCache.sampleKey === sampleKey(request.keys.geometryKey, request.quality.sampling, 0) &&
      geometryCache.handles.every(handle => owners.has(handle));
  }
  function fresh(record) {
    try { return !destroyed && current === record && !record.result && !record.cancelled && record.request.viewId === viewId &&
      (!record.request.quality.preview || record.navigation === null || record.navigation === record.currentNavigation() && record.navigationContent === record.currentNavigationContent()) &&
      record.request.generation.deviceEpoch === backend.currentEpoch() && isPublishable(record.request, record.currentGeneration()); }
    catch { return false; }
  }
  // The caller owns the monotonic navigation stream. This exception is opt-in:
  // shared isPublishable and all settled/inspection paths remain strict.
  const navigationDraft = record => navigationDraftEligible({record, current, interactive, viewId, epoch: backend.currentEpoch(), destroyed});
  const executable = record => fresh(record) || navigationDraft(record);
  const publishable = record => executable(record) && record.order >= displayOrder && (!published || record.order >= published.record.order);
  function publishedCurrent(snapshot) {
    return !destroyed && snapshot && published === snapshot && snapshot.record.order === displayOrder && snapshot.request.viewId === viewId &&
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
    record.configuration?.abort();
    if (record.internal) {
      record.result = result; release(record.handles); jobs.delete(record.request.jobId);
      record.done.resolve(result); return;
    }
    if (record.frame && result.outcome !== 'completed') rejectFrame(record, result.reason ?? result.outcome);
    record.masks?.close?.('render job finished');
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
    } : null, details: { ...fields,
      diagnosticReadback: record.request.quality.preview ? { format: record.recg ? DRAFT_SUMMARY_VERSION : 'draft-diagnostics-v1',
        ...(record.recg ? { bytes: draftSummaryBytes(RECOVERING_FAMILIES.includes(record.model.id)), evidence: 'aggregate; per-pixel masks not retained' } : { bytesPerPixel: (record.diagnosticStride ?? (RECOVERING_FAMILIES.includes(record.model.id) ? 3 : 2)) * 4 }),
        secondaryFlags: 'exactly zero: direct/diagnostic draft shading evaluates no secondary rays' } : { format: 'separate-textures' },
      operations: { completed: record.completionCount, byPass: structuredClone(record.operationMetrics ?? {}) },
      outcomeMasks: record.publishedMasks ?? UNAVAILABLE, geometryRequestId: record.geometryRequestId, appearanceRebound: record.geometryRequestId !== record.request.requestId,
      ...(record.summary ? { outcomeAggregates: record.summary } : {}),
      ...(record.frame ? { draftRecord: { frameId: record.frame.frameId, presentationSubmittedAt: record.frame.presentationSubmittedAt,
        confirmationAt: record.confirmationAt ?? UNAVAILABLE, diagnosticsState: record.diagnosticsState ?? 'pending' } } : {}),
      ...(result.continuation ? { continuation: result.continuation } : {}), ...(result.submitted ? { submitted: result.submitted } : {}),
    } });
    record.result = Object.freeze({ ...result, ...(record.error?.code === undefined ? {} : { errorCode: record.error.code }), report });
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
    const entry = pass === 'reduce' ? 'reduce_draft_summary' : pass === 'display' && record.recg ? (draftConfig.summary ? 'display_summary_band' : 'display_band')
      : pass === 'display' && record.request.quality.preview ? 'display_draft_band' : pass === 'probe' ? 'probe' : pass === 'shade' && stage === 'diagnostic'
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
    return buildSpaceBatch({ descriptor, record, pass, region, sample, quality, extra });
  }
  function validatePublication(record, meta) {
    if (record.validatedOrdinal === meta.ordinal) return;
    // The Worker validates and closes the sample before its last readback lease
    // completes. Presentation consumes only that acknowledged snapshot. The
    // explicitly injected maskWork diagnostic seam yields CPU slices instead.
    if (record.recg) {
      if (!record.summary) throw new BackendError('invalid-descriptor', 'draft summary not validated');
      record.validatedMasks = UNAVAILABLE;
    } else {
      if (!record.masks.closed(maskIdentity(record, meta))) throw new BackendError('invalid-descriptor', 'outcome masks not validated');
      record.counts = record.masks.counts(); record.validatedMasks = record.masks.snapshot();
    }
    record.validatedOrdinal = meta.ordinal;
  }
  function acceptPublication(record, meta) {
    record.builder.mark('published'); record.samplesCompleted = meta.sample + 1;
    record.publishedCounts = structuredClone(record.counts); record.publishedQuality = meta.quality;
    // B11b: the sample's outcome masks close here (every readback of this ordinal completed before its presentation).
    record.publishedMasks = record.validatedMasks;
    const elapsed = now() - record.requestedAt;
    if (!record.request.quality.preview && meta.ordinal === 0) record.milestones.settledFirstImageMs = elapsed;
    if (meta.last) record.milestones.fullQualityMs = elapsed;
  }
  function publicationData(record, meta) {
    const appearance = appearanceKey(record.request.sceneSnapshot, meta.quality);
    return { kind: record.request.quality.preview ? 'draft' : meta.ordinal === 0 ? 'settled-first' : 'refinement',
      request: record.request, requestId: record.request.requestId, identity: identity(record.request), createdAt: record.requestedAt,
      sceneHash: record.request.sceneHash, camera: record.request.sceneSnapshot.camera,
      model: record.request.sceneSnapshot.model.id, internalSize: { ...meta.quality.internalSize },
      output: { width: record.request.output.width, height: record.request.output.height },
      geometryRequestId: record.geometryRequestId, samples: meta.sample + 1, sampleIndex: meta.sample, pending: !fresh(record),
      appearanceKey: appearance, accumulationKey: accumulationKey(record.request.keys.geometryKey, appearance, record.request.quality.sampling),
      quality: meta.quality, publishedAt: now(), rayTermination: record.publishedCounts?.rayTermination ?? null };
  }
  function publish(record, meta, display, { emitPublication = true, presentationEvidence } = {}) {
    if (!publishable(record)) return false;
    const geometry = { sample: meta.sample, status: record.targets.handles.status, depth: record.targets.handles.depth };
    const handles = [display, geometry.status, geometry.depth], old = published; hold(handles);
    published = { request: record.request, record, display, geometry, handles }; if (old) release(old.handles);
    acceptPublication(record, meta);
    const snapshot = published, active = current, event = { ...publicationData(record, meta), ...presentationEvidence };
    if (emitPublication) emit('Publish', event);
    // A synchronous subscriber may stop refinement after this complete image. Its
    // accepted status is unchanged; a subscriber's replacement request owns its own status.
    if (published === snapshot && current === active) emit('Status', { pending: event.pending, diagnosticsState: 'confirmed' });
    return true;
  }
  function beginFrame(record, meta, ticket) {
    const event = frameRecords.begin({ ...publicationData(record, meta), presentationSubmittedAt: ticket.presentationSubmittedAt ?? now(), eligible: true });
    record.frame = event; record.diagnosticsState = 'pending';
    frameRecords.displayed(event.frameId); displayOrder = record.order;
    emit('PublicationRecord', event);
    if (draftConfig.mode === 'async') emit('Publish', event);
    if (draftConfig.mode === 'provisional') emit('Provisional', event);
    emit('Status', { diagnosticsState: 'pending', provisional: draftConfig.mode === 'provisional' });
  }
  function rejectFrame(record, reason) {
    if (!record.frame) return;
    const update = frameRecords.reject(record.frame.frameId, record.frame.identity, String(reason));
    if (!update) return;
    record.diagnosticsState = update.diagnosticsState;
    if (!update.historical && record.order === displayOrder) {
      emit('Status', { diagnosticsState: 'failed', reason: String(reason) });
      restoreFrame(record);
    }
  }
  function restoreFrame(record) {
    const snapshot = published;
    if (!snapshot || destroyed || record.request.generation.deviceEpoch !== backend.currentEpoch()) return;
    const frameId = record.frame.frameId, jobId = `${record.request.jobId}/restore-${++auxSerial}`;
    const id = { ...identity(record.request), jobId, requestId: `${record.request.requestId}/restore` };
    const operation = { id: jobId, kind: 'presentation', dependsOn: [], descriptor: { identity: id, display: snapshot.display } }, done = deferred();
    const valid = () => !destroyed && backend.currentEpoch() === id.generation.deviceEpoch && frameRecords.displayedFrame() === frameId && displayOrder === record.order;
    hold([snapshot.display]);
    auxiliary.set(operation.id, { record, done, valid, restoration: frameId });
    try {
      const job = scheduler.requestAuxiliary(viewId, { jobId, priority: 'inspection', operation });
      job.done.finally(() => { auxiliary.delete(operation.id); release([snapshot.display]); });
      pump();
    } catch { auxiliary.delete(operation.id); release([snapshot.display]); }
  }

  // The outcome-mask identity of one ordinal: its accumulation key (the direct sample of a full request has its own)
  // and its sample index within that accumulation.
  function maskIdentity(record, meta) {
    const key = accumulationKey(record.request.keys.geometryKey, appearanceKey(record.request.sceneSnapshot, meta.quality), record.request.quality.sampling);
    return { accumulationKey: key, sample: meta.sample };
  }
  function draftWorkKey(record) { return canonicalJson({ family: record.model.id, effective: record.effective, quality: record.request.quality }); }
  function makeDraftPlan(record) {
    const request = record.request, region = { x: 0, y: 0, ...request.quality.internalSize };
    const m = { ordinal: 0, sample: 0, quality: request.quality, last: true, phase: 'draft-group' };
    const reuse = record.geometry?.sample === 0 && record.geometry.sampleKey === sampleKey(request.keys.geometryKey, request.quality.sampling, 0);
    record.displayHandle = record.targets.handles.display;
    const passes = [...(reuse ? [] : ['trace', 'normals']), 'shade', 'accumulate', 'display', ...(draftConfig.summary ? ['reduce'] : [])]
      .map(pass => batch(record, pass, region, 0, request.quality));
    const grouped = createBatchGroup({ identity: identity(request), region, sample: passes[0].sample, passes,
      draft: { mode: draftConfig.mode, summary: record.draftSummary ?? null, producerToken: record.producerToken,
        recovery: record.diagnosticStride === 3, display: record.displayHandle } });
    const computeId = `${request.jobId}/compute`, presentId = `${request.jobId}/present`;
    const operations = [{ id: computeId, dependsOn: [], kind: 'batch', batch: grouped },
      ...(draftConfig.mode === 'compute' ? [{ id: presentId, dependsOn: [computeId], kind: 'presentation', descriptor: { identity: identity(request), display: record.displayHandle } }] : [])];
    record.metadata = new Map(operations.map(op => [op.id, m]));
    let completions = 0;
    const plan = createJobPlan({ request, operations, onAdvance(op, evidence) {
      completions++;
      if (op.id !== computeId) return;
      if (evidence.timestampMs > evidence.targetMs) {
        excessiveDraftWork.add(draftWorkKey(record));
        if (excessiveDraftWork.size > 256) excessiveDraftWork.delete(excessiveDraftWork.values().next().value);
      }
      if (!reuse) {
        record.geometry = { sample: 0, sampleKey: sampleKey(request.keys.geometryKey, request.quality.sampling, 0), serial: record.geometrySerial };
        record.geometryRequestId = request.requestId;
        if (fresh(record)) {
          forgetGeometry(); const handles = GEOMETRY_TARGETS.map(name => record.targets.handles[name]); hold(handles);
          geometryCache = { ...record.geometry, handles, request, geometryRequestId: record.geometryRequestId };
        }
      }
    } });
    return Object.freeze({ ...plan, diagnostics: () => ({ fixed: true, pendingCount: operations.length - completions, completions, replacements: 0, boundaryReplacements: 0, pendingSamples: completions === operations.length ? [] : ['direct:0'] }) });
  }
  function makePlan(record) {
    if (record.recg) return makeDraftPlan(record);
    const request = record.request, target = request.quality.sampling.targetSamples;
    // B11c: a recovering family (spec §11.4 rev 5.1, quaternion Julia) also reads back each sample's recovery words.
    const recovers = RECOVERING_FAMILIES.includes(record.model?.id);
    const maskOptions = { recovery: recovers, strict: true,
      valid: () => !destroyed && !record.result && !record.cancelled && request.generation.deviceEpoch === backend.currentEpoch() };
    // maskWork is the explicit CPU diagnostic/test seam. Product callers use the
    // Worker service; unavailable/crashed Workers fail closed, never scan on main.
    record.masks = maskWork && !maskProcessor
      ? createOutcomeMasks(request.quality.internalSize, { ...maskOptions, work: maskWork })
      : masksService.open(request.quality.internalSize, maskOptions);
    const full = request.quality.lighting.stage === 'full';
    const sampleCount = full ? target + 1 : target;
    let ordinal = 0, phaseIndex = 0, x = 0, y = 0, rowHeight = 0, sequence = 0;
    let windowIds = [], windowLeft = 0, phaseEnded = false, completions = 0, replacements = 0, boundaries = 0, lastReplacement = 0;
    let comparison = null;
    const metadata = new Map(), remaining = new Set();
    const grouped = request.quality.preview && groupDrafts;
    const groupPhase = skipGeometry() ? 'draft-reuse' : 'draft-group';
    const phases = grouped ? [groupPhase, 'draftDiagnostics', 'present']
      : ['trace', 'normals', 'shade', 'accumulate', 'display',
        ...(request.quality.preview ? ['draftDiagnostics'] : ['status', ...(recovers ? ['recovery'] : []), 'normal', 'lightingStatus']), 'present'];
    const workload = (phase, quality) => canonicalJson({ epoch: request.generation.deviceEpoch, family: record.model.id, effective: record.effective, profile: quality.profile, phase, width: quality.internalSize.width, iteration: quality.iteration, tracing: quality.tracing, lighting: quality.lighting, viewMode: request.sceneSnapshot.appearance.viewMode });
    function tileBatch(phase, region, m) {
      if (!phase.startsWith('draft-')) return batch(record, phase, region, m.sample, m.quality);
      const passes = (phase === 'draft-reuse' ? ['shade', 'accumulate', 'display'] : ['trace', 'normals', 'shade', 'accumulate', 'display'])
        .map(pass => batch(record, pass, region, m.sample, m.quality));
      return createBatchGroup({ identity: identity(request), region, sample: passes[0].sample, passes });
    }
    function meta() {
      const sample = full && ordinal > 0 ? ordinal - 1 : ordinal;
      return { ordinal, sample, quality: stageQuality(request, ordinal), last: ordinal === sampleCount - 1 };
    }
    function skipGeometry() {
      return record.geometry && record.geometry.sample === meta().sample && record.geometry.sampleKey === sampleKey(request.keys.geometryKey, request.quality.sampling, meta().sample);
    }
    function nextWindow(dependencies = []) {
      if (ordinal >= sampleCount) return [];
      while (!grouped && phaseIndex < 2 && skipGeometry()) phaseIndex++;
      const phase = phases[phaseIndex], m = meta(), operations = [];
      if (['trace', 'draft-group'].includes(phase) && x === 0 && y === 0) {
        record.targets = { ...record.targets, handles: { ...record.targets.handles, ...record.geometrySets[m.sample % record.geometrySets.length] } };
      }
      record.displayHandle = record.targets.handles[ordinal % 2 === 0 ? 'display' : 'retained'];
      const size = request.quality.internalSize;
      phaseEnded = false;
      do {
        const id = `${request.jobId}/${++sequence}`;
        let op, learning = null;
        if (phase === 'present') { op = { id, dependsOn: dependencies, kind: 'presentation', descriptor: { identity: identity(request), display: record.displayHandle } }; phaseEnded = true; }
        else if (phase === 'draftDiagnostics') {
          op = { id, dependsOn: dependencies, kind: 'readback', descriptor: { identity: identity(request), source: record.draftDiagnostics,
            region: { x: 0, y: 0, width: size.width * size.height * record.diagnosticStride * 4, height: 1 }, fields: ['draftDiagnostics'] } };
          phaseEnded = true;
        } else {
          const readback = ['status', 'recovery', 'normal', 'lightingStatus'].includes(phase), bpt = readback ? TARGET_LAYOUT[phase].bytesPerTexel : 0;
          // Texture copies retain their separate row/alignment limits. Compute is
          // sized only from this workload's completed evidence and device limits.
          const pixels = tileLearning.get(workload(phase, m.quality))?.pixels ?? INITIAL_PIXELS;
          const maxComputeSide = (acquisition?.limits?.maxComputeWorkgroupsPerDimension ?? 65535) * 8;
          const maxBuffer = acquisition?.limits?.maxBufferSize ?? 2 ** 28;
          const maxWidth = readback ? Math.floor(maxBuffer / 256) * 256 / bpt : maxComputeSide;
          const tileWidth = Math.min(size.width, readback ? maxWidth : Math.min(pixels, maxWidth));
          const width = Math.min(size.width - x, tileWidth);
          if (width < 1) throw new BackendError('allocation-failed', 'a single aligned readback row exceeds maxBufferSize');
          const nominalRows = readback ? Math.min(256, Math.floor(maxBuffer / (Math.ceil(tileWidth * bpt / 256) * 256)))
            : Math.min(Math.max(1, Math.floor(pixels / tileWidth)), maxComputeSide);
          if (x === 0) rowHeight = Math.min(size.height - y, nominalRows);
          const rows = rowHeight, region = { x, y, width, height: rows };
          if (!readback && width === tileWidth && rows === nominalRows) learning = { pixels, area: width * rows };
          op = readback ? { id, dependsOn: dependencies, kind: 'readback', descriptor: { identity: identity(request), source: record.targets.handles[phase], region, fields: [phase] } }
            : { id, dependsOn: dependencies, kind: 'batch', batch: tileBatch(phase, region, m) };
          x += width;
          if (x === size.width) { x = 0; y += rows; }
          if (y === size.height) phaseEnded = true;
        }
        metadata.set(id, { ...m, phase, learning }); remaining.add(id); operations.push(op);
      } while (!phaseEnded && operations.length < WINDOW_LIMIT);
      windowIds = operations.map(op => op.id); windowLeft = operations.length;
      return operations;
    }
    function phaseComplete() {
      const phase = phases[phaseIndex], m = meta();
      if (phase === 'normals' || phase === 'draft-group') {
        record.geometry = { sample: m.sample, sampleKey: sampleKey(request.keys.geometryKey, request.quality.sampling, m.sample), serial: record.geometrySerial };
        record.geometryRequestId = request.requestId;
        // Only centre geometry is reusable as the first sample of a fresh sequence.
        // Later AA samples are not relabelled sample zero on appearance edits.
        if (m.sample === 0 && fresh(record)) {
          forgetGeometry(); const handles = GEOMETRY_TARGETS.map(name => record.targets.handles[name]); hold(handles);
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
      // Fence latency includes queue/service overhead: it is an upper bound, not
      // per-pixel shader time. Use the minimum of four comparable observations,
      // never extrapolate a clipped edge or a subdivided tile, and ignore old-size
      // completions after a sizing decision. A 0.5–2x band prevents timing jitter
      // from continually resizing tiles. Persist decisions across windows/jobs.
      const elapsed = evidence.timestampMs ?? evidence.elapsedMs;
      let sustainedSlow = false;
      if (operation.kind === 'batch') {
        const m = metadata.get(operation.id), key = workload(m.phase, m.quality), previous = tileLearning.get(key);
        const method = evidence.timestampMs === undefined ? 'queue-completion' : 'timestamp';
        if (m.learning) {
          const comparisonKey = `${key}:${m.learning.area}:${method}`;
          if (comparison?.key !== comparisonKey) comparison = { key: comparisonKey, times: [] };
          comparison.times.push(elapsed); if (comparison.times.length > 4) comparison.times.shift();
          sustainedSlow = comparison.times.length === 4 && Math.min(...comparison.times) > 2 * evidence.targetMs;
        }
        if (m.learning && m.learning.pixels === (previous?.pixels ?? INITIAL_PIXELS)) {
          const comparable = previous?.area === m.learning.area && previous?.method === method;
          const observations = (comparable ? previous.observations : 0) + 1;
          const minimumMs = Math.min(comparable ? previous.minimumMs : Infinity, Math.max(0.001, elapsed));
          let pixels = m.learning.pixels;
          if (observations >= 4 && (minimumMs <= evidence.targetMs / 2 || minimumMs > 2 * evidence.targetMs)) {
            pixels = Math.min(INITIAL_PIXELS * 8, Math.max(MIN_PIXELS, Math.floor(m.learning.area * evidence.targetMs / minimumMs)));
          }
          tileLearning.delete(key); tileLearning.set(key, { pixels, area: m.learning.area, method,
            observations: observations >= 4 ? 0 : observations, minimumMs: observations >= 4 ? Infinity : minimumMs });
          if (tileLearning.size > 256) tileLearning.delete(tileLearning.keys().next().value);
        }
      }
      if (windowLeft === 0) {
        if (phaseEnded) phaseComplete();
        const next = nextWindow(windowIds);
        if (!next.length) return undefined;
        boundaries++; replacements++; lastReplacement = completions; return [...pendingOperations, ...next];
      }
      if (!sustainedSlow || completions - lastReplacement < 8) return undefined;
      // A long slow stream must not recursively reduce every later pass to single
      // pixels. The tile budget bottoms at one quarter of its initial value;
      // row/edge rounding and readback limits may still require smaller regions.
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
      const child = { ...candidate, id: childId, batch: tileBatch(m.phase, firstRegion, m) };
      const barrier = { ...candidate, dependsOn: [childId], batch: tileBatch(m.phase, secondRegion, m) };
      metadata.set(candidate.id, { ...m, learning: null }); metadata.set(childId, { ...m, learning: null }); remaining.add(childId); windowIds.push(childId); windowLeft++;
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
    if (!record.internal && !aux && !record.result) {
      const key = operation.kind === 'batch' ? descriptor.passes ? meta.phase : descriptor.pass : operation.kind === 'readback' ? `readback:${descriptor.fields[0]}` : 'present';
      record.operationMetrics ??= {};
      const metric = record.operationMetrics[key] ??= { submitted: 0, pixelsOrBytes: 0, maxRegionHeight: 0 };
      metric.submitted++; metric.pixelsOrBytes += descriptor.region ? descriptor.region.width * descriptor.region.height : 0;
      metric.maxRegionHeight = Math.max(metric.maxRegionHeight, descriptor.region?.height ?? 0);
    }
    record.outstanding = (record.outstanding ?? 0) + 1; record.outstandingMax = Math.max(record.outstandingMax ?? 0, record.outstanding);
    let counted = true;
    const retire = () => { if (counted) { counted = false; record.outstanding--; } };
    const discardAuxiliary = error => {
      const reason = String(error?.message ?? error);
      retire();
      try {
        return scheduler.discardAuxiliary(admission, { reason });
      } finally {
        // A false return means this lease is already retired or stale. Local
        // ownership must still settle; never retry, fabricate completion evidence
        // or fail the main job. Cleanup also covers synchronous notifications.
        auxiliary.delete(operation.id);
        if (aux.propagateErrors) aux.done.reject(error instanceof Error ? error : new Error(reason));
        else aux.done.resolve(stale());
      }
    };
    let ticket, didPresent = false;
    try {
      if (aux && !aux.valid()) throw new BackendError('stale-epoch', 'auxiliary snapshot replaced before submission');
      if (!record.internal && !aux && (!executable(record) || ((operation.kind === 'presentation' || operation.batch?.draft?.mode && operation.batch.draft.mode !== 'compute') && !publishable(record)))) {
        // The lease exists but no backend work has entered the queue. Cancelling
        // first makes a pre-submission rejection terminal drain evidence, without
        // turning the stale job into a failed job or drawing an obsolete image.
        scheduler.cancel(record.request.jobId);
        throw new BackendError('stale-epoch', 'request superseded before submission');
      }
      if (operation.kind === 'batch') {
        if (operation.batch.pass === 'trace' || operation.batch.passes?.[0].pass === 'trace') {
          record.geometry = null; record.geometrySerial = ++serial;
          if (geometryCache?.handles.some(handle => handle === record.targets.handles.depth)) forgetGeometry();
        }
        if (operation.batch.draft?.mode === 'provisional') emit('Status', { diagnosticsState: 'pending', provisional: true });
        ticket = backend.submitBatch(operation.batch, { admission });
        if (operation.batch.draft && operation.batch.draft.mode !== 'compute' && ticket.presentationSubmittedAt !== null) {
          beginFrame(record, meta, ticket); didPresent = true;
        }
      } else if (operation.kind === 'readback') ticket = backend.readback(operation.descriptor, { admission });
      else {
        if (!record.internal && !aux) validatePublication(record, meta);
        ticket = backend.present(operation.descriptor, { admission });
        if (aux?.restoration) emit('Restoration', { frameId: aux.restoration, identity: descriptor.identity, submittedAt: now() });
        else if (!record.internal) { frameRecords.supersedeDisplay(); displayOrder = record.order; didPresent = publish(record, meta, operation.descriptor.display); }
      }
    } catch (error) {
      retire();
      if (aux) discardAuxiliary(error);
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
          if (record.frame) rejectFrame(record, completion.reason);
          retire();
          if (aux) discardAuxiliary(completion.reason);
          else scheduler.failed(admission, new Error(completion.reason));
          aux?.done.resolve(stale()); return;
        }
        if (operation.batch?.draft?.mode && operation.batch.draft.mode !== 'compute' && didPresent) {
          emit('Present', { identity: identity(record.request), frameId: record.frame.frameId, queueCompletedAt: completion.queueCompletedAt, evidence: 'presenter-queue-completion' });
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
              discardAuxiliary(new BackendError('stale-epoch', 'readback identity mismatch')); return;
            }
            else throw new BackendError('invalid-descriptor', 'readback identity mismatch');
          }
          record.builder?.mark('readback');
          if (record.internal) {
            if (result.data.byteLength !== 4 || new DataView(result.data.buffer, result.data.byteOffset, 4).getUint32(0, true) !== 0x41544c53) throw new BackendError('preparation-failed', 'ATLS probe mismatch');
          } else if (!aux && !record.result) {
            const field = operation.batch?.draft ? 'draftSummary' : operation.descriptor.fields[0];
            if (field === 'draftSummary') {
              record.summary = validateDraftSummary(result.data, { pixels: descriptor.region.width * descriptor.region.height,
                recovery: record.diagnosticStride === 3, producerToken: record.producerToken });
              record.counts = record.summary.counts;
            } else if (field === 'draftDiagnostics') {
              const region = { x: 0, y: 0, ...record.request.quality.internalSize };
              await record.masks.ingestDraft(maskIdentity(record, meta), region, result.data);
            } else {
              const expected = operation.descriptor.region.width * operation.descriptor.region.height * TARGET_LAYOUT[field].bytesPerTexel;
              if (result.data.byteLength !== expected) throw new BackendError('invalid-descriptor', 'incomplete status readback');
              const region = operation.descriptor.region;
              await record.masks.ingest(maskIdentity(record, meta), field, region, result.data);
            }
          }
        }
        if (record.frame && !aux && record.diagnosticsState === 'pending' && record.summary) {
          validatePublication(record, meta);
          const update = frameRecords.confirm(record.frame.frameId, record.frame.identity, { rayTermination: record.counts.rayTermination,
            outcomeAggregates: record.summary, completion: { outcome: 'completed', queueCompletedAt: completion.queueCompletedAt } });
          if (update) {
            record.diagnosticsState = 'confirmed'; record.confirmationAt = update.confirmationAt;
            acceptPublication(record, meta);
            const ordinary = draftConfig.mode === 'gated' || draftConfig.mode === 'provisional';
            const presentationEvidence = ordinary ? { historical: update.historical, eligible: record.frame.eligible,
              presentationSubmittedAt: record.frame.presentationSubmittedAt, completion: update.completion,
              confirmationAt: update.confirmationAt } : undefined;
            if (!record.cancelled && !record.result) {
              if (!update.historical) publish(record, meta, record.displayHandle, { emitPublication: draftConfig.mode !== 'async', presentationEvidence });
              // Navigation supersession changes the current image, not the fact
              // that this admitted presentation completed and validated. Keep
              // other invalidation fences; retain no historical image handles.
              else if (ordinary && executable(record)) emit('Publish', { ...publicationData(record, meta), ...presentationEvidence });
            }
          }
        }
        if (operation.kind === 'presentation' && didPresent && !record.cancelled && executable(record)) emit('Present', { identity: identity(record.request), queueCompletedAt: completion.queueCompletedAt, evidence: 'presenter-queue-completion' });
        // completed() notifies the dispatcher synchronously. Copy-out is finished;
        // remove this ticket before a replacement lease can increment the count.
        retire();
        scheduler.completed(admission, { epoch: descriptor.identity.generation.deviceEpoch, elapsedMs: completion.timing.elapsedMs,
          ...(completion.timing.timestampMs === undefined ? {} : { timestampMs: completion.timing.timestampMs }) });
        aux?.done.resolve(result ?? completion);
      } catch (error) {
        if (record.frame) rejectFrame(record, error.message ?? error);
        retire();
        if (aux) discardAuxiliary(error);
        else { record.error = error; scheduler.failed(admission, error); }
        aux?.done.resolve(stale());
      }
      finally { retire(); if (aux) auxiliary.delete(operation.id); pump(); }
    })();
  }
  const unsubscribeLoss = backend.onLoss(event => {
    if (!maskProcessor) masksService.reset('device lost');
    else for (const record of jobs.values()) record.masks?.close?.('device lost');
    frameRecords.interrupt(event.epoch);
    for (const record of jobs.values()) if (record.frame && record.diagnosticsState === 'pending' && record.request.generation.deviceEpoch === event.epoch) record.diagnosticsState = 'interrupted';
    prepared = null; preparation = null; published = null; geometryCache = null; owners.clear(); tileLearning.clear(); excessiveDraftWork.clear();
    scheduler.interrupted(event.epoch); scheduler.setEpoch(0);
    for (const record of jobs.values()) if (!record.scheduled) finish(record, { outcome: 'interrupted', reason: 'device-lost' });
    emit('Status', { phase: 'interrupted', epoch: event.epoch });
  });
  function schedule(record, plan, priority, kind) {
    record.scheduled = scheduler.request(viewId, { jobId: record.request.jobId, requestId: record.request.requestId, priority, kind, plan, navigationStream: record.navigation ?? null });
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
  function render(request, { currentGeneration = () => request.generation, currentNavigation = null, currentNavigationContent = null, requestedAt = now() } = {}) {
    if (destroyed) throw new BackendError('unavailable', 'renderer destroyed');
    if (request.viewId !== viewId) throw new TypeError('request belongs to another view');
    if (submittedJobs.has(request.jobId) || submittedRequests.has(request.requestId)) throw new TypeError('execution identity already submitted');
    const model = getModel(request.sceneSnapshot.model.id, request.sceneSnapshot.model.version);
    submittedJobs.add(request.jobId); submittedRequests.add(request.requestId);
    pending();
    const navigation = currentNavigation?.() ?? null;
    if (navigation !== null && (!Number.isSafeInteger(navigation) || navigation < 0)) throw new TypeError('navigation stream must be a nonnegative integer');
    if (!Number.isFinite(requestedAt) || requestedAt > now()) throw new TypeError('requestedAt must be a finite creation time no later than now');
    const navigationContent = navigationContentKey(request.sceneSnapshot, request.output);
    const record = { request, model, order: ++requestOrder, navigation, currentNavigation, navigationContent,
      currentNavigationContent: currentNavigationContent ?? (() => navigationContent),
      currentGeneration: typeof currentGeneration === 'function' ? currentGeneration : () => currentGeneration,
      effective: effectiveParameters(model.id, request.sceneSnapshot.parameters).effective,
      requestedAt, builder: createReportBuilder(request, { implementation: versions, clock: now,
        environment: () => ({ backend: observed('Space backend interface', 'renderer backend contract'), device: acquisition?.identity ?? UNAVAILABLE }) }),
      done: deferred(), configuration: new AbortController(), handles: [], geometryRequestId: request.requestId, geometrySerial: 0, samplesCompleted: 0,
      milestones: {}, counts: emptyCounts(), queueElapsedMs: 0, completionCount: 0, timestampCount: 0, timestampMs: 0, outstanding: 0, outstandingMax: 0 };
    if (request.output.purpose === 'interactive') {
      // Running drafts may finish within this navigation stream. The scheduler
      // still coalesces unissued requests; invalidated streams stop admission.
      for (const previous of jobs.values()) {
        if (previous.request.output.purpose !== 'interactive' || previous.result) continue;
        if (!(navigation !== null && previous.navigation === navigation && previous.navigationContent === navigationContent && previous.request.quality.preview &&
          previous.request.generation.deviceEpoch === request.generation.deviceEpoch &&
          previous.request.generation.appearanceRevision === request.generation.appearanceRevision)) cancel(previous.request.jobId);
      }
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
        if (!await record.scheduled.preparation || record.result) return;
        if (request.generation.deviceEpoch !== backend.currentEpoch()) throw new BackendError('device-lost');
        // Configuration is the only pre-admission dependency. Never wait for a
        // timer/frame after the resources needed by this immutable plan exist.
        const description = { epoch: request.generation.deviceEpoch, layoutId: TARGET_LAYOUT_ID,
          internalSize: request.quality.internalSize, outputSize: { width: request.output.width, height: request.output.height } };
        const geometryNames = GEOMETRY_TARGETS;
        let spare = null;
        if (request.quality.sampling.targetSamples > 1) {
          // The annex allocates complete target sets. Keep only the spare geometry
          // before allocating working targets, bounding the transient allocation.
          const extra = await configure(record, description);
          if (!extra) return;
          const all = flatHandles(extra); hold(all);
          if (record.result || destroyed) { release(all); return; }
          spare = Object.fromEntries(geometryNames.map(name => [name, extra.handles[name]]));
          const kept = Object.values(spare); release(all.filter(handle => !kept.includes(handle)));
          record.handles.push(...kept);
        }
        const targets = await configure(record, description);
        if (!targets) return;
        hold(flatHandles(targets));
        if (record.result || destroyed) { release(flatHandles(targets)); return; }
        record.handles.push(...flatHandles(targets)); record.targets = targets;
        if (compatibleGeometry(request)) {
          const handles = { ...targets.handles };
          for (const [i, name] of GEOMETRY_TARGETS.entries()) {
            release([handles[name]]); record.handles = record.handles.filter(handle => handle !== handles[name]); handles[name] = geometryCache.handles[i];
          }
          hold(geometryCache.handles); record.handles.push(...geometryCache.handles); record.targets = { ...targets, handles };
          record.geometry = { ...geometryCache }; record.geometrySerial = geometryCache.serial; record.geometryRequestId = geometryCache.geometryRequestId;
        }
        record.geometrySets = [Object.fromEntries(geometryNames.map(name => [name, record.targets.handles[name]])), ...(spare ? [spare] : [])];
        // B11 (B10 report D2): Menger field evaluation reads the job's box buffer (kernels.js mengerBoxData rows,
        // 640 B at depth 1, 12,800 B at depth 2), bound as `menger_boxes` and released with the job.
        if (model.id === 'menger') {
          const data = mengerBoxData(record.effective.depth);
          const boxes = backend.allocate({ name: `menger-boxes-${record.effective.depth}`, bytes: data.byteLength, usage: 'storage', data });
          hold([boxes]); record.handles.push(boxes); record.mengerBoxes = boxes;
        }
        if (request.quality.preview) {
          if (request.quality.lighting.stage === 'full' || request.quality.lighting.shadowRays || request.quality.lighting.aoSamples) throw new BackendError('invalid-descriptor', 'packed draft diagnostics require zero secondary-ray work');
          record.diagnosticStride = RECOVERING_FAMILIES.includes(model.id) ? 3 : 2;
          record.recg = groupDrafts && qualifiedDraft(request, record.effective, acquisition?.limits) && !excessiveDraftWork.has(draftWorkKey(record)) &&
            pipelines.descriptors.some(d => d.pipelineId === 'reduce_draft_summary');
          if (record.recg) {
            if (producerToken >= 0x7fffffff) throw new BackendError('unavailable', 'draft producer token space exhausted');
            record.producerToken = ++producerToken;
            if (draftConfig.summary) {
              record.draftSummary = backend.allocate({ name: DRAFT_SUMMARY_VERSION, bytes: draftSummaryBytes(record.diagnosticStride === 3), usage: 'storage' });
              hold([record.draftSummary]); record.handles.push(record.draftSummary);
            }
          }
          const bytes = request.quality.internalSize.width * request.quality.internalSize.height * record.diagnosticStride * 4;
          record.draftDiagnostics = backend.allocate({ name: 'draft-diagnostics-v1', bytes, usage: 'storage' });
          hold([record.draftDiagnostics]); record.handles.push(record.draftDiagnostics);
        }
        readyPlan = makePlan(record);
        scheduler.ready(request.jobId, { epoch: request.generation.deviceEpoch });
      } catch (error) { fail(record, error); record.cancellation?.resolve({ outcome: 'cancelled', submitted: 'none' }); }
    })();
    return Object.freeze({ jobId: request.jobId, requestId: request.requestId, viewId, request, done: record.done.promise });
  }
  function cancel(jobId) {
    const record = jobs.get(jobId); if (!record || record.internal) return scheduler.cancel(jobId);
    record.cancelled = true;
    record.masks?.close?.('render job cancelled');
    record.configuration.abort();
    if (draftConfig.mode === 'provisional' && record.frame) rejectFrame(record, 'cancelled');
    if (record.scheduled) return scheduler.cancel(jobId);
    record.cancellation ??= deferred();
    return { accepted: true, done: record.cancellation.promise };
  }
  async function auxiliaryOperation(record, value, valid, propagateErrors = false) {
    // Callers validate immediately before requesting each operation. Dispatch
    // rechecks after any admission wait; it must not submit a replaced snapshot.
    if (!record.scheduled) return stale();
    const operation = { id: `${record.request.jobId}/aux-${++auxSerial}`, dependsOn: [], ...value }, done = deferred();
    auxiliary.set(operation.id, { done, record, valid, propagateErrors });
    try {
      const submitted = scheduler.requestAuxiliary(viewId, { jobId: record.request.jobId, priority: 'inspection', operation });
      submitted.done.then(result => {
        if (result.outcome === 'completed') return;
        auxiliary.delete(operation.id);
        if (propagateErrors && !['cancelled', 'superseded', 'interrupted'].includes(result.outcome)) done.reject(new Error(result.reason ?? result.outcome));
        else done.resolve(stale());
      });
      pump(); return await done.promise;
    } catch (error) {
      auxiliary.delete(operation.id);
      if (propagateErrors) throw error;
      return stale();
    }
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
    const handles = [];
    try {
      const origin = encodeOrdinaryOrigin(request.sceneSnapshot.camera);
      if (origin.unavailable) return { identity: identity(request), status: 'unresolved', detail: origin };
      const model = admitPointModel(record.model.id, record.effective, record.request.quality.iteration.maxIterations);
      const span = { first: 0, count: 1, pitch: 1 }, sampling = record.request.quality.sampling;
      // B08 consumes one vec4<f32>, with kappa in uniforms. highF32 is the
      // exact represented world position rounded directly to binary32 by B05;
      // collapsing the anchor to Number or re-adding low can double-round ties.
      const bytes = encodePoints([origin.highF32]);
      const allocate = (name, data) => {
        const handle = backend.allocate({ name, bytes: data.byteLength, usage: 'storage', data });
        handles.push(handle); hold([handle]); return handle;
      };
      const points = allocate('camera-points', bytes), results = allocate('camera-results', sentinelResults(1));
      // Every points variant statically binds MengerBox (32 bytes minimum).
      // Classification owns its buffer even after the render job has released
      // its model resources, and retains all three buffers through copy-out.
      const boxes = allocate('camera-menger-boxes', model.modelId === 'menger' ? mengerBoxData(model.depth) : new Uint8Array(32));
      const pointBatch = createBatch({ identity: identity(record.request), pipelineId: pointsPipelineId(model.modelId), pass: POINT_BATCH_PASS,
        region: pointRegion(span), sample: { sequence: sampling.sequence, seed: sampling.seed, index: 0 },
        bounds: pointBounds(model, span), uniforms: pointUniforms(model, span),
        inputs: { points, results, menger_boxes: boxes }, outputs: { results } });
      const evaluated = await auxiliaryOperation(record, { kind: 'batch', batch: pointBatch }, () => classifiable(record), true);
      if (evaluated.stale || !classifiable(record)) return stale();
      const result = await auxiliaryOperation(record, { kind: 'readback', descriptor: { identity: identity(request), source: results,
        region: { x: 0, y: 0, width: POINT_RESULT_BYTES, height: 1 }, fields: ['cameraClassification'] } }, () => classifiable(record), true);
      if (result.stale || !classifiable(record)) return stale();
      const data = new DataView(result.data.buffer, result.data.byteOffset, result.data.byteLength);
      const point = decodePointResults(result.data, 1, model.modelId)[0];
      // Match the CPU camera predicate (§13.3): escape alone is insufficient
      // without a usable estimate; analytic validity alone does not mean exterior.
      const exterior = data.getUint32(0, true) === POINT_STATUS.escaped && (point.status === 'valid'
        ? point.applicability === 'exterior' && Number.isFinite(point.distance) && point.distance > 0
        : point.status === 'escaped' && point.estimateAvailable && Number.isFinite(point.log2DE));
      return deepFreeze({ identity: identity(request), status: exterior ? 'exterior' : 'unresolved', detail: { source: 'evaluate_points', result: point } });
    } catch (error) {
      // A failed inspection is visible while its snapshot is still current.
      // Only actual invalidation, loss or backend unavailability is retryable staleness.
      if (!classifiable(record) || ['stale-epoch', 'device-lost', 'unavailable'].includes(error?.code)) return stale();
      return deepFreeze({ identity: identity(request), status: 'unresolved', detail: {
        error: { code: String(error?.code ?? error?.name ?? 'Error'), message: String(error?.message ?? error) },
      } });
    }
    finally { release(handles); }
  }
  // Synchronous per-call accounting, in bytes. Consult the live viewport even if
  // an export most recently rendered (or failed). Appearance-only edits leave
  // geometry reusable; an unsubmitted geometry/epoch change does not.
  function releaseObsolete() {
    const receipt = { freed: 0, retiring: 0 };
    if (!geometryCache) return Object.freeze(receipt);
    const live = interactive ?? current;
    if (live) {
      let generation;
      try { generation = live.currentGeneration(); } catch { return Object.freeze(receipt); }
      // Without a live generation there is no evidence that the cache is obsolete.
      if (!generation || compatibleGeometry(live.request, generation)) return Object.freeze(receipt);
    }
    // Shared publication, job and pick owners stay live, and are counted in
    // neither field. Diagnostics describe only the known handles we relinquish;
    // unrelated staging buffers and already-retiring resources are excluded.
    const relinquished = geometryCache.handles.filter(handle => owners.get(handle) === 1);
    const matches = (entry, handle) => entry.id === handle.id && entry.epoch === handle.epoch;
    const before = backend.diagnostics().inventory.filter(entry => relinquished.some(handle => matches(entry, handle)));
    forgetGeometry();
    const after = backend.diagnostics().inventory;
    for (const entry of before) {
      const remaining = after.find(value => matches(value, entry));
      if (!remaining) receipt.freed += entry.bytes;
      else if (remaining.state === 'retiring') receipt.retiring += entry.bytes;
    }
    return Object.freeze(receipt);
  }
  return Object.freeze({ prepare, render, pick, classifyEffectiveCamera, cancel, releaseObsolete,
    resize({ width, height }) {
      const previous = current?.request; if (!previous || sameSize(previous.output, { width, height })) return null;
      const generation = { ...previous.generation, viewRevision: previous.generation.viewRevision + 1, geometryRevision: previous.generation.geometryRevision + 1 };
      const next = createSpaceRequest({ scene: previous.sceneSnapshot, purpose: previous.output.purpose, width, height, profile: previous.quality.profile, generation, viewId, versions });
      pending(); cancel(previous.jobId); current = null; forgetGeometry(); return next;
    },
    onPublish: subscribe('Publish'), onPresent: subscribe('Present'), onReport: subscribe('Report'), onStatus: subscribe('Status'),
    onPublicationUpdate: subscribe('PublicationUpdate'), onPublicationRecord: subscribe('PublicationRecord'), onProvisional: subscribe('Provisional'), onRestoration: subscribe('Restoration'),
    destroy() {
      if (destroyed) return; destroyed = true;
      if (!maskProcessor) masksService.destroy();
      frameRecords.interrupt(backend.currentEpoch(), 'destroyed');
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
