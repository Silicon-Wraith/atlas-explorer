// The Space workspace (spec §13.1–13.3, §14, §15; plan B14). It owns one Space investigation: the
// scene and both histories (camera history uses semantic camera equality, T04a), navigation, flight
// and controller input (B12, B12b), and the viewport render loop. Viewport work is prepared, rendered
// and cancelled only through the recovery facade (B13 R3), with a live currentGeneration guard.
// Creating the workspace acquires nothing: the first activation creates the backend, acquires the
// device and prepares the complete product pipeline set with visible status, then verifies the
// prewarm (B11) before interaction is enabled.
//   createSpaceWorkspace({shell, backendFactory = createWebGPUBackend, clock, env?})
//     → {inspection (window.atlas.space), activate(token) → Promise<{outcome, reason?}>, deactivate(), focus(), destroy()}
// `env` injects the document, window, animation frames, the scheduler's timers, the Gamepad API, the
// viewport size and the input factories for tests; production uses the browser's.
import { createHistory } from '../shared/history.js';
import { createScheduler } from '../shared/scheduler.js';
import { PALETTES } from '../shared/palettes.js';
import { createSpaceScene, sceneCodec, encodeSceneFile, decodeSceneFile, VIEW_MODES, SPACE_MODELS } from './scene-adapter.js';
import { createSpaceRequest } from './render-adapter.js';
import { getModel, classifyCamera } from './models/registry.js';
import { effectiveParameters } from './numerics/parameters.js';
import { overview, resetOrientation, anchorAdd, setOrientation, basis } from './camera.js';
import { equalCameras } from './camera.js';
import { createSpaceGestures } from './gestures.js';
import { createFlight as defaultCreateFlight } from './flight.js';
import { createGamepadInput as defaultCreateGamepadInput, STANDARD_MAPPING } from './gamepad.js';
import { bindSpaceNavigation, cameraStatus } from './navigation.js';
import { createRecovery } from './recovery.js';
import { createSpaceRenderer, navigationContentKey } from './render/renderer.js';
import { createAdmission } from './render/backend.js';
import { createWebGPUBackend } from './render/webgpu/backend.js';
import { productPipelineSet, productPipelineDescriptors, verifyPrewarm, VIEW_MODE_LABELS } from './render/webgpu/appearance.js';
import { KERNEL_VERSION } from './render/webgpu/kernels.js';
import { TRACING_VERSION } from './render/webgpu/passes.js';
import { webgpuUnavailable } from './render/webgpu/availability.js';
import { deepFreeze } from '../shared/scene.js';
import { createSpaceDiagnostics } from './diagnostics-indicator.js';
import { draftExecution } from './render/draft-execution.js';

export const SPACE_VIEW_ID = 'space-main';
export const SPACE_PIXEL_BUDGET = 2_300_000; // the viewport's internal pixels at settled quality (about 88 B/px)
const VERSIONS = Object.freeze({ kernelVersion: KERNEL_VERSION, tracingVersion: TRACING_VERSION });
const FLIGHT_REASONS = new Set(['escape', 'blur', 'hidden', 'stop-key', 'deactivate', 'history', 'disconnect', 'input-suspended']);
const ESTIMATOR_TEXT = Object.freeze({ 'exact-distance': 'exact distance', heuristic: 'heuristic, exterior-only' });
const FAMILY_NAMES = Object.freeze({ sphere: 'Sphere (calibration)', box: 'Box (calibration)', menger: 'Menger sponge', mandelbulb: 'Mandelbulb', 'quaternion-julia': 'Quaternion Julia' });
const CHOICE_LABELS = Object.freeze({ 'release-and-retry': 'Release and retry', 'lower-resolution': 'Half resolution', 'fewer-samples': 'Fewer samples' });
const identityOf = request => ({ requestId: request.requestId, jobId: request.jobId, viewId: request.viewId, generation: { ...request.generation } });
const sameGeneration = (a, b) => a && b && ['deviceEpoch', 'viewRevision', 'geometryRevision', 'appearanceRevision'].every(key => a[key] === b[key]);
const message = error => error?.message ?? String(error);

function overviewFor(modelId, parameters) {
  return overview(getModel(modelId, 1), effectiveParameters(modelId, parameters).effective);
}
// A fresh investigation of `modelId`, seen from its overview (B05 note: Space starts at overview(bulb)).
export function freshSpaceScene(modelId = 'mandelbulb', keep = {}) {
  const base = createSpaceScene({ model: modelId, ...keep });
  return createSpaceScene({ model: modelId, ...keep, camera: overviewFor(modelId, base.parameters) });
}
function multiply([aw, ax, ay, az], [bw, bx, by, bz]) {
  return [aw * bw - ax * bx - ay * by - az * bz, aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw];
}
const axisAngle = (axis, angle) => { const s = Math.sin(angle / 2), n = Math.hypot(...axis); return [Math.cos(angle / 2), ...axis.map(v => v / n * s)]; };
const normalize = q => { const n = Math.hypot(...q); return q.map(v => v / n); };

export function createSpaceWorkspace({ shell, backendFactory = createWebGPUBackend, clock = () => performance.now(), env = {} }) {
  const { $, toast } = shell;
  const now = typeof clock === 'function' ? clock : () => clock.now();
  const doc = env.document ?? globalThis.document, win = env.window ?? globalThis;
  const requestFrame = env.requestFrame ?? (fn => win.requestAnimationFrame(fn)), cancelFrame = env.cancelFrame ?? (id => win.cancelAnimationFrame(id));
  const getGamepads = Object.hasOwn(env, 'getGamepads') ? env.getGamepads : globalThis.navigator?.getGamepads?.bind(globalThis.navigator);
  const makeFlight = env.createFlight ?? defaultCreateFlight, makeGamepad = env.createGamepadInput ?? defaultCreateGamepadInput;
  const canvas = $('#space-canvas'), root = $('#space-workspace'), panel = $('#space-panel');
  const diagnostics = createSpaceDiagnostics({ element: $('#space-diagnostics'), value: $('#space-diagnostics-value'),
    rung: env.draftExecution, setTimer: env.setTimer, clearTimer: env.clearTimer });

  // ---- scene, histories, gestures and input -----------------------------------------------------
  const history = createHistory({ initialScene: freshSpaceScene('mandelbulb'), codec: sceneCodec, cameraEqual: equalCameras });
  const scene = () => history.snapshot().scene;
  const getCamera = () => scene().camera;
  let navigation = null, flight = null, gamepad = null;
  const gestures = createSpaceGestures({ history, onTransition: (transition, interactive) => onTransition(transition, interactive),
    // B12-F6: action/handoff kinds and scene replacement map to the flight reason 'history'.
    stopNavigation(reason) { const mapped = FLIGHT_REASONS.has(reason) ? reason : 'history'; flight?.stop(mapped); navigation?.reset(mapped); } });
  flight = makeFlight({ getCamera, setCamera: camera => gestures.flightUpdate(camera), clock: now,
    onStart: () => gestures.flightStart(), onStop: () => gestures.flightEnd() });
  gamepad = makeGamepad({ getGamepads, gestures, flight, getCamera, clock: now,
    cameraOps: { overview: () => overviewFor(scene().model.id, scene().parameters) }, onStatus: status => showControllerStatus(status) });

  // ---- rendering state --------------------------------------------------------------------------
  let backend = null, backendOverride = null, scheduler = null, renderer = null, recovery = null, acquisition = null;
  let preparing = null, prewarm = null, unavailableReason = null, phase = 'idle';
  let active = false, activation = null, destroyed = false, frame = null, eligibleNow = false, windowFocused = true, editing = false;
  let viewRevision = 0, geometryRevision = 0, appearanceRevision = 0;
  let dirty = true, wantProfile = 'settled', lastProfile = null, lastRequest = null, lastSize = null, currentJob = null, submitted = 0;
  let lastPublication = null, lastReport = null, pendingStatus = false, allocationFailure = null, budgetNotice = null;
  let cost = { scale: 1, sampleCap: null };
  let cpuCamera = null, effectiveCamera = null;
  // B14-r2 F2: an activation commits only on a presentation of the current generation made while that
  // activation is current; `reveal` is its waiter, settled by a presentation, a failure or deactivation.
  let reveal = null, lastPresented = null, revealed = false;
  const requests = new Map(), renderJobs = new Set(), publishListeners = new Set(), publicationUpdateListeners = new Set(), presentListeners = new Set(), requestListeners = new Set(), reportListeners = new Set();
  let navigationStream = 0, navigationOpen = false, navigationContentCache = null;
  const liveGeneration = () => ({ deviceEpoch: backend?.currentEpoch() ?? 0, viewRevision, geometryRevision, appearanceRevision });

  function viewportSize() {
    if (env.viewportSize) return env.viewportSize();
    const rect = canvas.getBoundingClientRect?.() ?? { width: 0, height: 0 };
    const cssWidth = rect.width || win.innerWidth || 1, cssHeight = rect.height || win.innerHeight || 1;
    let ratio = Math.min(win.devicePixelRatio || 1, 1.5);
    ratio = Math.min(ratio, Math.sqrt(SPACE_PIXEL_BUDGET / (cssWidth * cssHeight)));
    return { width: Math.max(1, Math.round(cssWidth * ratio)), height: Math.max(1, Math.round(cssHeight * ratio)) };
  }
  function requestedSize() {
    const size = viewportSize();
    return { width: Math.max(1, Math.round(size.width * cost.scale)), height: Math.max(1, Math.round(size.height * cost.scale)) };
  }

  function onTransition(transition) {
    if (!transition) return;
    const changed = transition.changed;
    // A monotonic stream identity prevents A → B → A from reviving an old draft.
    // Only camera previews and their final commit share a stream. Content edits,
    // discrete camera jumps and lifecycle changes invalidate it immediately.
    if (transition.preview && changed.every(domain => domain === 'camera')) {
      if (!navigationOpen) navigationStream++;
      navigationOpen = true;
    } else if (transition.cause === 'commit' && navigationOpen) navigationOpen = false;
    else if (transition.render) { navigationStream++; navigationOpen = false; }
    if (transition.render) {
      viewRevision++;
      if (changed.some(domain => domain !== 'appearance')) geometryRevision++;
      if (changed.includes('appearance')) appearanceRevision++;
      requestRender(transition.preview ? 'draft' : 'settled');
    } else if (transition.cause === 'commit' && (lastProfile === 'draft' || wantProfile === 'draft')) requestRender('settled');
    if (!transition.preview) refreshCameraStatus();
    if (changed.some(domain => domain !== 'camera')) syncPanel();
    updateHistoryControls();
  }
  function requestRender(profile) {
    navigationContentCache = null;
    wantProfile = profile; dirty = true;
    wantFrame();
  }
  function ready() { return Boolean(recovery) && recovery.state().phase === 'ready' && prewarm?.ok; }
  function renderScene() {
    const snapshot = scene();
    return cost.sampleCap ? sceneCodec.validate({ ...snapshot, sampling: { ...snapshot.sampling, targetSamples: Math.min(cost.sampleCap, snapshot.sampling.targetSamples) } }) : snapshot;
  }
  function liveNavigationContent() {
    // Cache until the next edit/resize/submission, avoiding layout reads and
    // canonical serialization for every admitted GPU operation.
    return navigationContentCache ??= navigationContentKey(renderScene(), { ...requestedSize(), purpose: 'interactive' });
  }
  // The one viewport submission path: live scene, current size, through the facade. Refused while
  // inactive (admission closed), recovering or stopped; the dirty request is kept for later.
  function submit() {
    if (!active || !ready() || destroyed) return false;
    const size = requestedSize();
    if (lastSize && (size.width !== lastSize.width || size.height !== lastSize.height)) { viewRevision++; geometryRevision++; }
    const snapshot = renderScene();
    const createdAt = now();
    const request = createSpaceRequest({ scene: snapshot, purpose: 'interactive', ...size, profile: wantProfile, generation: liveGeneration(), viewId: SPACE_VIEW_ID, versions: VERSIONS });
    return submitRequest(request, size, createdAt);
  }
  function submitRequest(request, size = { width: request.output.width, height: request.output.height }, createdAt = now()) {
    navigationContentCache = null;
    const event = deepFreeze({ identity: identityOf(request), purpose: request.output.purpose, createdAt, request });
    for (const listener of requestListeners) { try { listener(event); } catch { /* isolate observers */ } }
    let job;
    try { job = recovery.render(request, { currentGeneration: liveGeneration, currentNavigation: () => navigationStream, currentNavigationContent: liveNavigationContent, requestedAt: createdAt }); }
    catch (error) { if (error?.code === 'unavailable') return false; showRecovery(`Rendering failed: ${message(error)}`); return false; }
    dirty = false; lastProfile = request.quality.profile; lastRequest = request; lastSize = size; submitted++;
    track(job);
    return true;
  }
  function track(job) {
    if (!job) return;
    renderJobs.add(job.jobId);
    currentJob = job; requests.set(job.requestId, job.request);
    if (requests.size > 64) requests.delete(requests.keys().next().value);
    job.done.then(result => {
      renderJobs.delete(job.jobId);
      if (currentJob === job) currentJob = null;
      // B14-r3 F11: cancelling the render the first presentation waits for cancels the activation
      // (a replacement render settles 'superseded' and keeps the wait for its own presentation).
      if (result.outcome === 'cancelled' && reveal && !currentJob) settleReveal({ outcome: 'cancelled' });
      if (result.outcome === 'failed' && result.errorCode !== 'allocation-failed') { failReveal(`the view could not be rendered: ${result.reason}`); showRecovery(`The view could not be rendered: ${result.reason}`); }
      updateIndicators();
    });
  }
  function stale() { return dirty || !lastRequest || !sameGeneration(lastRequest.generation, liveGeneration()) || (!currentJob && !lastPublication); }

  // ---- the frame loop: one controller poll, then the flight tick, then at most one submission ----
  function wantFrame() { if (active && !destroyed && frame === null) frame = requestFrame(onFrame); }
  function onFrame(time) {
    frame = null;
    if (!active || destroyed) return;
    if (eligibleNow && doc.querySelector?.('dialog[open]')) updateEligibility('dialog');
    if (eligibleNow) gamepad.poll(time);
    flight.tick(time);
    if (dirty) submit();
    updateIndicators();
    if (eligibleNow || flight.active || dirty) wantFrame();
  }
  function computeEligible() {
    return active && Boolean(prewarm?.ok) && !doc.hidden && windowFocused && !editing && !doc.querySelector?.('dialog[open]');
  }
  function updateEligibility(reason = 'input-suspended') {
    const next = computeEligible();
    if (next !== eligibleNow) { eligibleNow = next; gamepad.setEligible(next, reason); }
    if (next) wantFrame();
  }

  // ---- backend, renderer and recovery (first activation only) -------------------------------------
  function ensureStack() {
    if (recovery) return;
    const raw = backendOverride ?? backendFactory({ canvas, clock: now, draftExecution: env.draftExecution });
    backend = Object.freeze({ ...raw, async acquire(...args) { const receipt = await raw.acquire(...args); acquisition = receipt; return receipt; } });
    scheduler = createScheduler({ clock: now, makeAdmission: createAdmission, setTimer: env.setTimer ?? ((fn, ms) => setTimeout(fn, ms)), clearTimer: env.clearTimer ?? (id => clearTimeout(id)) });
    renderer = createSpaceRenderer({ backend, scheduler, clock: now, viewId: SPACE_VIEW_ID, versions: VERSIONS, pipelineSet: productPipelineSet(), draftExecution: env.draftExecution });
    const publicDraftUpdates = draftExecution(env.draftExecution).mode === 'async';
    renderer.onPublish(publication => onPublish(publication));
    renderer.onPublicationUpdate(update => {
      // Gated/provisional originals stay on the renderer diagnostic channel.
      // Forward every async update, including historical ones, so consumers
      // still detect unknown, duplicate and conflicting pairs.
      if (publicDraftUpdates) {
        if (lastPublication?.frameId === update.frameId) lastPublication = Object.freeze({ ...lastPublication, ...update });
        for (const listener of publicationUpdateListeners) { try { listener(update); } catch { /* isolate observers */ } }
      }
      updateIndicators();
    });
    renderer.onPresent(event => { onPresentation(event); for (const listener of presentListeners) { try { listener(event); } catch { /* isolate observers */ } } });
    renderer.onReport(report => { lastReport = report; for (const listener of reportListeners) { try { listener(report); } catch { /* isolate observers */ } } });
    renderer.onStatus(status => {
      if (typeof status.pending === 'boolean') pendingStatus = status.pending;
      if (status.diagnosticsState) diagnostics.update(status);
      if (status.phase === 'interrupted') diagnostics.update({ diagnosticsState: 'interrupted' });
      updateIndicators();
    });
    recovery = createRecovery({ backend, renderer, scheduler, clock: now, onNotice: notice => onNotice(notice) });
  }
  function onPresentation(event) {
    if (sameGeneration(event.identity?.generation, liveGeneration())) lastPresented = event.identity;
    if (reveal && active && activation === reveal.token && sameGeneration(lastPresented?.generation, liveGeneration())) settleReveal({ outcome: 'activated' });
  }
  function settleReveal(result) { const waiter = reveal; reveal = null; waiter?.resolve(Object.freeze(result)); }
  function failReveal(reason) { if (reveal) settleReveal({ outcome: 'unavailable', reason }); }
  function presented() { return !dirty && Boolean(lastPresented) && sameGeneration(lastPresented.generation, liveGeneration()); }
  function onPublish(publication) {
    const request = publication.request;
    // The renderer owns the published request even after this bounded history
    // evicts it. In particular, a delayed pending draft keeps its own metadata.
    if (!publication.historical) lastPublication = publication;
    for (const listener of publishListeners) { try { listener(publication); } catch { /* isolate observers */ } }
    // Historical validation is an accounting notification, never a change to
    // current publication, picking eligibility, visibility or diagnostic state.
    if (publication.historical) return;
    if (publication.kind === 'settled-first' && request) classifyEffective(request);
    hideUnavailable();
    updateIndicators();
  }
  function onNotice(notice) {
    switch (notice.type) {
      case 'preparing': {
        const progress = notice.progress;
        if (progress?.completed !== undefined && progress.completed === progress.total) break;
        showPreparation(progress?.total ? `Preparing Space pipelines… ${progress.completed ?? 0} of ${progress.total}` : 'Preparing Space pipelines…');
        break;
      }
      case 'recovering': showRecovery('The graphics device was lost. Recovering once…'); break;
      case 'ready': if (prewarm) showPreparation(''); break;
      case 'recovered':
        showPreparation(''); showRecovery('');
        if (notice.job) { track(notice.job); lastRequest = notice.job.request; }
        else { dirty = true; wantFrame(); }
        break;
      case 'stopped':
        failReveal(`rendering stopped: ${notice.message ?? notice.reason}`);
        if (notice.reason === 'repeated-device-loss') showRecovery('Rendering stopped after repeated graphics device loss. The scene is kept; retry when ready.', true);
        else if (prewarm) showRecovery(`Rendering stopped: ${notice.message ?? notice.reason}`, true);
        break;
      // Both need the viewer's explicit choice, which lives in the Space panel: Space is shown to offer it.
      case 'allocation-failed': showAllocationFailure(notice); settleReveal({ outcome: 'activated', presented: false }); break;
      case 'budget-exceeded': showBudget(notice); settleReveal({ outcome: 'activated', presented: false }); break;
      case 'failed': failReveal(`the view could not be rendered: ${notice.result?.reason ?? 'failed'}`); showRecovery(`The view could not be rendered: ${notice.result?.reason ?? 'failed'}`); break;
      default: break;
    }
    updateIndicators();
  }
  async function prepare() {
    ensureStack();
    showPreparation('Preparing Space pipelines…');
    const state = recovery.state().phase;
    const receipt = state === 'stopped' ? await recovery.retry() : await recovery.prepare();
    if (!receipt) throw new Error(recovery.state().phase === 'stopped' ? 'preparation stopped' : 'preparation was superseded');
    const required = productPipelineDescriptors().map(descriptor => descriptor.pipelineId);
    const verified = verifyPrewarm({ requiredPipelineIds: required, preparedPipelineIds: [...(receipt.preparedPipelineIds ?? [])] });
    prewarm = Object.freeze({ ...verified, preparedAt: now() });
    if (!verified.ok) throw new Error(`pipelines missing after preparation: ${verified.missing.join(', ')}`);
    showPreparation('');
    updateGraphicsDiagnostics();
    return receipt;
  }

  // ---- activation contract ------------------------------------------------------------------------
  const globalListeners = [];
  function listen(target, type, listener, options) { target?.addEventListener?.(type, listener, options); globalListeners.push([target, type, listener, options]); }
  function attach() {
    listen(win, 'focus', () => { windowFocused = true; updateEligibility('focus'); });
    listen(win, 'blur', () => { windowFocused = false; updateEligibility('blur'); });
    listen(doc, 'visibilitychange', () => updateEligibility('hidden'));
    listen(win, 'resize', onResize);
    listen(win, 'keydown', onKeyDown);
    listen(win, 'gamepadconnected', onGamepadEvent); listen(win, 'gamepaddisconnected', onGamepadEvent);
    listen(panel, 'focusin', onPanelFocus); listen(panel, 'focusout', onPanelFocus);
    for (const dialog of doc.querySelectorAll?.('dialog') ?? []) listen(dialog, 'close', () => updateEligibility('dialog'));
    // Interaction with the viewport implies a focused window (headed browsers may not report focus).
    listen(canvas, 'pointerdown', () => { if (!windowFocused) { windowFocused = true; updateEligibility('focus'); } });
  }
  function detach() { for (const [target, type, listener, options] of globalListeners.splice(0)) target?.removeEventListener?.(type, listener, options); }
  function onPanelFocus() {
    const focused = doc.activeElement;
    const next = Boolean(focused && panel?.contains?.(focused) && /^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName ?? ''));
    if (next !== editing) { editing = next; updateEligibility('editing'); }
  }
  function onGamepadEvent() {
    // Connection events refresh status only; an eligible frame loop does the polling.
    if (eligibleNow) wantFrame(); else gamepad.poll(now());
  }
  function onResize() {
    if (!active) return;
    const size = requestedSize();
    if (lastSize && size.width === lastSize.width && size.height === lastSize.height) return;
    navigationStream++; navigationOpen = false;
    if (dirty || !lastRequest || !ready()) { requestRender(wantProfile); return; }
    const next = renderer.resize(size);
    if (!next) { requestRender('settled'); return; }
    viewRevision = next.generation.viewRevision; geometryRevision = next.generation.geometryRevision;
    submitRequest(next, size);
  }
  function onKeyDown(event) {
    if (!active || event.defaultPrevented) return;
    const target = event.target;
    if (target?.closest?.('input, textarea, select') || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '') || doc.querySelector?.('dialog[open]')) return;
    const key = String(event.key ?? '').toLowerCase();
    const step = (event.ctrlKey || event.metaKey) && !event.altKey ? (key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null)
      : event.altKey && !event.ctrlKey && !event.metaKey ? ({ arrowleft: 'back', arrowright: 'forward' })[key] : null;
    if (step) { event.preventDefault?.(); historyStep(step); }
  }
  function enable() {
    active = true;
    scheduler.hidden(SPACE_VIEW_ID, false);
    navigation = bindSpaceNavigation({ surface: canvas, gestures, flight, getCamera, pick: request => renderer.pick(request),
      getPickContext: pickContext, onStatus: status => showNavigationStatus(status) });
    attach();
    windowFocused = doc.hasFocus?.() ?? true;
    hideUnavailable();
    updateEligibility('activate');
    updateGraphicsDiagnostics();
    // At most one current-state request, and only when the publication is stale.
    if (stale()) submit();
    wantFrame();
  }
  async function activate(token) {
    if (destroyed) return Object.freeze({ outcome: 'unavailable', reason: 'the Space workspace was destroyed' });
    activation = token;
    // Already shown: a repeated selection is immediate. Still waiting for the first presentation: the
    // newer selection takes over the wait (B14-r3 F10) and the earlier one settles as superseded.
    if (active && revealed) return Object.freeze({ outcome: 'activated' });
    if (active) return awaitReveal(token);
    if (!ready()) {
      try {
        if (unavailableReason && !recovery) unavailableReason = null;
        preparing ??= prepare().finally(() => { preparing = null; });
        await preparing;
      } catch (error) {
        if (activation !== token || destroyed) return Object.freeze({ outcome: 'superseded' });
        unavailableReason = webgpuUnavailable(message(error), error.cause?.code ?? error.code);
        showUnavailable(unavailableReason);
        return Object.freeze({ outcome: 'unavailable', reason: unavailableReason });
      }
    }
    if (activation !== token || destroyed) return Object.freeze({ outcome: 'superseded' });
    if (active) return awaitReveal(token);
    enable();
    return awaitReveal(token);
  }
  // B14-r2 F2: the switcher reveals Space only on the current activation's first current presentation
  // (or, Fx4, on an allocation or budget choice that needs the Space panel). The outcome is
  // 'activated', 'superseded' (a newer selection or a deactivation), 'cancelled' (the render it waited
  // for was cancelled, F11) or 'unavailable' (a failure before the first presentation).
  async function awaitReveal(token) {
    let outcome;
    if (presented()) outcome = Object.freeze({ outcome: 'activated' });
    else {
      settleReveal({ outcome: 'superseded' });
      outcome = await new Promise(resolve => { reveal = { token, resolve }; });
    }
    if (activation !== token || destroyed || outcome.outcome === 'superseded') return Object.freeze({ outcome: 'superseded' });
    if (outcome.outcome === 'cancelled') { deactivate(); return outcome; }
    if (outcome.outcome !== 'activated') {
      deactivate();
      unavailableReason = outcome.reason;
      showUnavailable(unavailableReason);
      return outcome;
    }
    revealed = true;
    unavailableReason = null; // B14-F7: a successful activation clears an earlier failure's reason
    hideUnavailable();
    return Object.freeze({ outcome: 'activated' });
  }
  // Admission closes first, then picks and pending activation are invalidated; navigation settles
  // (the open gesture commits exactly once, flight stops, the controller is suspended), capture and
  // keyboard focus are released and the global listeners detached. Submitted batches drain; the view
  // is marked hidden in the scheduler, never preempted.
  function deactivate() {
    navigationStream++; navigationOpen = false;
    activation = null; revealed = false;
    settleReveal({ outcome: 'superseded' });
    if (!active) return;
    active = false;
    if (frame !== null) { cancelFrame(frame); frame = null; }
    const view = navigation; navigation = null;
    view?.destroy();
    flight.stop('deactivate');
    gestures.settle('deactivate');
    eligibleNow = false; gamepad.setEligible(false, 'deactivate');
    scheduler?.hidden(SPACE_VIEW_ID, true);
    const focused = doc.activeElement;
    if (focused && (focused === canvas || root?.contains?.(focused))) focused.blur?.();
    detach();
    updateIndicators();
  }
  // B14-F1: a pending scene edit (dirty) or a publication from another generation is not pickable;
  // a pick then reports unavailable instead of hitting superseded geometry.
  function pickContext() {
    if (!active || !eligibleForPicks() || pendingStatus || dirty || !lastPublication || lastPublication.diagnosticsState && lastPublication.diagnosticsState !== 'confirmed') return null;
    const request = lastPublication.request;
    if (!request || !sameGeneration(request.generation, liveGeneration())) return null;
    return { identity: identityOf(request), geometryRevision: request.generation.geometryRevision, dimensions: { ...request.quality.internalSize }, sampleIndex: lastPublication.sampleIndex };
  }
  const eligibleForPicks = () => ready();

  // ---- camera exterior status (§13.3) ---------------------------------------------------------------
  function classifyCpu(value) {
    try {
      const model = getModel(value.model.id, value.model.version);
      const effective = effectiveParameters(model.id, value.parameters).effective;
      const world = anchorAdd(value.camera.anchor, value.camera.scale, value.camera.positionLocal);
      if (!Array.isArray(world)) return Object.freeze({ status: 'unresolved', unavailable: true, detail: { reason: world.reason ?? 'precision-limit' } });
      return classifyCamera(model, effective, world.map(Number), value.iteration.maxIterations);
    } catch (error) { return Object.freeze({ status: 'unresolved', unavailable: true, detail: { reason: message(error) } }); }
  }
  function refreshCameraStatus() {
    const value = scene();
    cpuCamera = { camera: value.camera, model: value.model.id, parameters: value.parameters, result: classifyCpu(value) };
    if (!effectiveCamera || !equalCameras(effectiveCamera.camera, value.camera) || effectiveCamera.model !== value.model.id) effectiveCamera = null;
    showCameraStatus();
  }
  function classifyEffective(request) {
    const value = scene();
    if (!equalCameras(request.sceneSnapshot.camera, value.camera)) return;
    const pending = { camera: request.sceneSnapshot.camera, model: request.sceneSnapshot.model.id, result: null };
    effectiveCamera = pending; showCameraStatus();
    Promise.resolve().then(() => renderer.classifyEffectiveCamera(request)).then(result => {
      if (effectiveCamera !== pending) return;
      pending.result = result ?? { stale: true }; showCameraStatus();
    }, error => { if (effectiveCamera === pending) { pending.result = { status: 'unresolved', unavailable: true, error: message(error) }; showCameraStatus(); } });
  }
  function currentCameraStatus() {
    if (!cpuCamera) refreshCameraStatus();
    const effective = effectiveCamera?.result ?? undefined;
    return cameraStatus({ cpu: cpuCamera.result, effective });
  }

  // ---- panel, indicators and controls ---------------------------------------------------------------
  const text = (selector, value) => { const element = $(selector); if (element) element.textContent = value; };
  function setHidden(selector, hidden) { const element = $(selector); if (element) element.hidden = hidden; }
  function showPreparation(value) { text('#space-preparation', value); setHidden('#space-preparation', !value); }
  function showUnavailable(reason, code) { text('#space-unavailable', `Space unavailable: ${webgpuUnavailable(reason, code)}`); setHidden('#space-unavailable', false); showPreparation(''); }
  function hideUnavailable() { setHidden('#space-unavailable', true); }
  function showRecovery(value, retry = false) { text('#space-recovery', value); setHidden('#space-recovery', !value); setHidden('#space-retry', !retry); }
  function showNavigationStatus(status) {
    if (status?.status === 'unresolved' && status.reason && !['coincident-camera'].includes(status.reason)) text('#space-navigation-status', `Focus unavailable: ${status.reason}`);
    else if (status?.reason === 'coincident-camera') text('#space-navigation-status', 'The camera coincides with its focus. Use Overview.');
  }
  function showControllerStatus(status = gamepad?.status()) {
    if (!status) return;
    const value = { waiting: 'Press a controller button to connect', connected: `Controller: ${status.id}`,
      'unsupported-layout': `${status.id || 'Controller'}: layout not supported in this release`, unavailable: 'controllers unavailable' }[status.state] ?? status.state;
    text('#space-controller-status', value);
  }
  function showCameraStatus() {
    if (!cpuCamera) return;
    const status = currentCameraStatus(), checking = cpuCamera.result.status === 'exterior' && effectiveCamera && !effectiveCamera.result;
    text('#space-camera-status', checking ? 'checking the camera exterior status…' : status.status === 'exterior' ? 'camera outside the surface' : 'camera exterior status unresolved — use Overview or Reset orientation');
    $('#space-camera-status')?.classList.toggle('unresolved', status.status !== 'exterior' && !checking);
  }
  function showAllocationFailure(notice) {
    const request = notice.request;
    allocationFailure = Object.freeze({ reason: notice.reason, released: notice.released, retiring: notice.retiring, choices: [...notice.choices],
      request: Object.freeze({ requestId: request.requestId, width: request.output.width, height: request.output.height,
        internalWidth: request.quality.internalSize.width, internalHeight: request.quality.internalSize.height, samples: request.quality.sampling.targetSamples }) });
    const box = $('#space-allocation');
    if (!box) return;
    box.replaceChildren();
    const note = doc.createElement('p');
    note.textContent = `There was not enough graphics memory for this view (${notice.reason}). ${notice.released} bytes were released and ${notice.retiring} are retiring. Choose a lower-cost view, or retry:`;
    box.append(note);
    for (const choice of notice.choices) {
      const button = doc.createElement('button'); button.className = 'mini-button space-choice'; button.dataset.choice = choice; button.textContent = CHOICE_LABELS[choice] ?? choice;
      button.onclick = () => chooseLowerCost(choice);
      box.append(button);
    }
    box.hidden = false;
  }
  function chooseLowerCost(choice) {
    const samples = allocationFailure?.request.samples ?? scene().sampling.targetSamples;
    if (choice === 'lower-resolution') cost = { ...cost, scale: cost.scale / 2 };
    if (choice === 'fewer-samples') cost = { ...cost, sampleCap: Math.max(1, Math.floor(samples / 2)) };
    allocationFailure = null; setHidden('#space-allocation', true);
    showCost();
    viewRevision++; geometryRevision++;
    requestRender('settled');
  }
  function showCost() {
    const reduced = cost.scale !== 1 || cost.sampleCap;
    text('#space-cost', reduced ? `Reduced cost:${cost.scale !== 1 ? ` ${cost.scale}× resolution` : ''}${cost.sampleCap ? ` ${cost.sampleCap} samples` : ''}` : '');
    setHidden('#space-cost-row', !reduced);
  }
  function restoreFullCost() { cost = { scale: 1, sampleCap: null }; showCost(); viewRevision++; geometryRevision++; requestRender('settled'); }
  function showBudget(notice) {
    budgetNotice = notice;
    const box = $('#space-budget'); if (!box) return;
    box.replaceChildren();
    const note = doc.createElement('p'); note.textContent = `This view exceeded its work budget (${notice.reason}).`;
    const button = doc.createElement('button'); button.className = 'mini-button'; button.dataset.choice = notice.continuation; button.textContent = notice.continuation === 'resume' ? 'Continue refining' : 'Continue at lower cost';
    button.onclick = () => {
      box.hidden = true;
      try { if (notice.continuation === 'resume') { const job = notice.accept(); track(job); } else requestRender('draft'); } catch (error) { showRecovery(`Could not continue: ${message(error)}`); }
      budgetNotice = null;
    };
    box.append(note, button); box.hidden = false;
  }
  function updateIndicators() {
    diagnostics.setActive(active);
    const pending = Boolean(currentJob) || dirty || pendingStatus;
    text('#space-pending', active && pending ? 'refining…' : '');
    setHidden('#space-pending', !(active && pending));
  }
  function updateHistoryControls() {
    const snapshot = history.snapshot();
    for (const [id, enabled] of [['#space-undo', snapshot.canUndo], ['#space-redo', snapshot.canRedo], ['#space-back', snapshot.canBack], ['#space-forward', snapshot.canForward]]) {
      const button = $(id); if (button) button.disabled = !enabled;
    }
  }
  function updateGraphicsDiagnostics() {
    if (!backend) { text('#graphics-space-backend', 'Space has not acquired a graphics device.'); text('#graphics-space-inventory', '—'); return; }
    const identity = acquisition?.identity, field = value => typeof value === 'object' && value ? value.value ?? 'unavailable' : value ?? 'unavailable';
    text('#graphics-space-backend', identity ? `WebGPU · ${['vendor', 'architecture', 'device', 'description'].map(key => `${key} ${field(identity[key])}`).join(' · ')}` : `WebGPU · ${backend.diagnostics().state}`);
    const diagnostics = backend.diagnostics(), inventory = diagnostics.inventory ?? [];
    const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`;
    text('#graphics-space-inventory', `${inventory.length} tracked resources · ${mb(diagnostics.tracked ?? 0)} tracked · peak ${mb(diagnostics.peak ?? 0)} · epoch ${diagnostics.epoch}`);
  }

  function fillSelect(selector, entries) {
    const select = $(selector); if (!select || select.dataset?.filled) return;
    for (const [value, label] of entries) { const option = doc.createElement('option'); option.value = value; option.textContent = label; select.append(option); }
    if (select.dataset) select.dataset.filled = 'true';
  }
  fillSelect('#space-family', SPACE_MODELS.map(model => [model.id, FAMILY_NAMES[model.id] ?? model.id]));
  fillSelect('#space-view-mode', VIEW_MODES.map(mode => [mode, VIEW_MODE_LABELS[mode] ?? mode]));
  fillSelect('#space-palette', PALETTES.map(palette => [palette.id, palette.name]));
  const PARAMETER_INPUTS = { '#space-power': 'parameters.power', '#space-depth': 'parameters.depth', '#space-c0': 'parameters.C.0', '#space-c1': 'parameters.C.1',
    '#space-c2': 'parameters.C.2', '#space-c3': 'parameters.C.3', '#space-kappa': 'parameters.kappa', '#space-iterations': 'iteration.maxIterations', '#space-steps': 'tracing.maxSteps' };
  function syncPanel() {
    const value = scene(), model = getModel(value.model.id, value.model.version), parameters = value.parameters;
    const set = (selector, v) => { const element = $(selector); if (element && doc.activeElement !== element) element.value = String(v); };
    set('#space-family', value.model.id);
    for (const family of ['mandelbulb', 'menger', 'quaternion-julia']) setHidden(`#space-params-${family}`, family !== value.model.id);
    if (parameters.power !== undefined) set('#space-power', parameters.power);
    if (parameters.depth !== undefined) set('#space-depth', parameters.depth);
    if (parameters.C) parameters.C.forEach((component, i) => set(`#space-c${i}`, component));
    if (parameters.kappa !== undefined) set('#space-kappa', parameters.kappa);
    set('#space-iterations', value.iteration.maxIterations); set('#space-steps', value.tracing.maxSteps);
    set('#space-view-mode', value.appearance.viewMode); set('#space-palette', value.appearance.palette);
    const lighting = $('#space-lighting'); if (lighting) lighting.checked = value.appearance.lightingQuality === 'full';
    text('#space-estimator', ESTIMATOR_TEXT[model.estimator.category] ?? model.estimator.category);
    text('#space-family-name', FAMILY_NAMES[value.model.id] ?? value.model.id);
  }
  // A harness and panel edit: decimal strings stay strings; invalid input is reported inline and the
  // scene is never clamped or changed. One discrete edit is one undo entry.
  function editParameter(path, raw) {
    const value = scene(), error = $('#space-parameter-error');
    try {
      let commands;
      const integer = text => { const s = String(text).trim(); if (!/^\d+$/.test(s)) throw new Error('must be a whole number'); return Number(s); };
      if (path === 'model') return selectFamily(String(raw));
      if (path.startsWith('parameters.')) {
        const [, name, index] = path.split('.'), parameters = structuredClone(value.parameters);
        if (name === 'C') { if (index === undefined) parameters.C = [...raw].map(String); else parameters.C[Number(index)] = String(raw).trim(); }
        else if (name === 'depth') parameters.depth = integer(raw);
        else parameters[name] = String(raw).trim();
        commands = [{ type: 'setParameters', parameters }];
      } else if (path === 'iteration.maxIterations') commands = [{ type: 'setIteration', patch: { maxIterations: integer(raw) } }];
      else if (path === 'tracing.maxSteps') commands = [{ type: 'setTracing', tracing: { ...value.tracing, maxSteps: integer(raw) } }];
      else if (path.startsWith('appearance.')) commands = [{ type: 'setAppearance', patch: { [path.slice('appearance.'.length)]: raw } }];
      else throw new Error(`unknown parameter ${path}`);
      gestures.apply(commands, 'parameters');
      if (error) error.textContent = '';
      syncPanel();
      return Object.freeze({ ok: true });
    } catch (failure) {
      const description = `${path.replace(/^parameters\./, '')}: ${message(failure)}`;
      if (error) error.textContent = description;
      return Object.freeze({ ok: false, error: description });
    }
  }
  function selectFamily(id) {
    const value = scene();
    if (id === value.model.id) return Object.freeze({ ok: true });
    const next = freshSpaceScene(id, { appearance: value.appearance, sampling: value.sampling, tracing: value.tracing });
    gestures.apply([{ type: 'restoreScene', scene: next }], 'family');
    syncPanel(); refreshCameraStatus();
    return Object.freeze({ ok: true });
  }
  function jump(camera, kind) {
    gestures.settle(kind);
    return gestures.apply([{ type: 'setCamera', camera }], kind);
  }
  function requestCamera(pose, { phase = 'commit' } = {}) {
    if (!['preview', 'commit'].includes(phase)) throw new RangeError('camera phase must be preview or commit');
    const camera = sceneCodec.validate({ ...scene(), camera: pose }).camera;
    if (phase === 'preview') return gestures.drag('orbit-drag', camera);
    if (gestures.openKind === 'orbit-drag') {
      gestures.drag('orbit-drag', camera);
      return gestures.dragCommit('orbit-drag');
    }
    return jump(camera, 'harness');
  }
  const showOverview = () => jump(overviewFor(scene().model.id, scene().parameters), 'overview');
  const resetView = () => jump(resetOrientation(getCamera()), 'orientation-reset');
  function rotate(kind, degrees) {
    const camera = getCamera(), { forward, right } = basis(camera), angle = degrees * Math.PI / 180;
    const axis = kind === 'heading' ? [0, 0, 1] : kind === 'tilt' ? right : forward;
    const q = normalize(multiply(axisAngle(axis, angle), camera.orientationWxyz));
    const lock = $('#space-axis-lock')?.value || null;
    return jump(setOrientation(camera, q, { lockAxis: ['x', 'y', 'z'].includes(lock) ? lock : null }), 'orientation');
  }
  function historyStep(step) { gestures[step](); syncPanel(); refreshCameraStatus(); }
  function download(blob, name) {
    if (env.download) { env.download(blob, name); return; }
    const url = URL.createObjectURL(blob), link = doc.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function saveScene() {
    gestures.settle('save');
    const textValue = encodeSceneFile(scene());
    download(new Blob([textValue], { type: 'application/json' }), 'atlas-space-scene.json');
    text('#space-file-status', 'Scene saved, including every parameter digit.');
    return textValue;
  }
  function openSceneText(textValue) {
    const status = $('#space-file-status');
    try {
      const next = decodeSceneFile(textValue);
      if (next.workspace !== 'space') throw new Error('this file holds a scene for another workspace');
      gestures.apply([{ type: 'restoreScene', scene: next }], 'restore');
      syncPanel(); refreshCameraStatus();
      if (status) status.textContent = 'Scene opened.';
      return Object.freeze({ ok: true });
    } catch (error) {
      const reason = `This scene file could not be opened: ${message(error)}`;
      if (status) status.textContent = reason;
      return Object.freeze({ ok: false, error: reason });
    }
  }
  async function openSceneFile(file) {
    if (!file) return;
    if (file.size > sceneCodec.maxSceneBytes) { text('#space-file-status', 'This scene file is too large.'); return; }
    openSceneText(await file.text());
  }

  // Panel bindings (DOM elements live in index.html; tests supply a fake document).
  const on = (selector, type, handler) => $(selector)?.addEventListener?.(type, handler);
  for (const [selector, path] of Object.entries(PARAMETER_INPUTS)) {
    on(selector, 'change', event => editParameter(path, event.target.value));
    on(selector, 'keydown', event => { if (event.key === 'Enter') editParameter(path, event.target.value); });
  }
  on('#space-family', 'change', event => selectFamily(event.target.value));
  on('#space-view-mode', 'change', event => editParameter('appearance.viewMode', event.target.value));
  on('#space-palette', 'change', event => editParameter('appearance.palette', event.target.value));
  on('#space-lighting', 'change', event => editParameter('appearance.lightingQuality', event.target.checked ? 'full' : 'direct'));
  on('#space-flight-speed', 'change', event => {
    try { flight.setSpeed(Number(event.target.value)); text('#space-parameter-error', ''); }
    catch (error) { text('#space-parameter-error', `flight speed: ${message(error)}`); }
  });
  on('#space-overview', 'click', () => showOverview());
  on('#space-reset-orientation', 'click', () => resetView());
  for (const [suffix, kind, degrees] of [['heading-left', 'heading', 15], ['heading-right', 'heading', -15], ['tilt-up', 'tilt', 15], ['tilt-down', 'tilt', -15], ['roll-left', 'roll', -15], ['roll-right', 'roll', 15]]) {
    on(`#space-${suffix}`, 'click', () => rotate(kind, degrees));
  }
  for (const step of ['undo', 'redo', 'back', 'forward']) on(`#space-${step}`, 'click', () => historyStep(step));
  on('#space-save-scene', 'click', () => saveScene());
  on('#space-open-scene', 'change', event => { const input = event.target; openSceneFile(input.files?.[0]).finally(() => { try { input.value = ''; } catch { /* read-only in some fakes */ } }); });
  on('#space-retry', 'click', () => { showRecovery('Retrying…'); recovery?.retry().catch(error => showRecovery(`Retry failed: ${message(error)}`, true)); });
  on('#space-restore-cost', 'click', () => restoreFullCost());
  text('#space-mapping', `Left stick orbit · right stick dolly and pan · D-pad pan · ${STANDARD_MAPPING.labels.toggleFlight} flight · ${STANDARD_MAPPING.labels.stop} stop · ${STANDARD_MAPPING.labels.overview} overview · ${STANDARD_MAPPING.labels.reset} reset · ${STANDARD_MAPPING.labels.slower}/${STANDARD_MAPPING.labels.faster} speed`);
  syncPanel(); updateHistoryControls(); refreshCameraStatus(); showControllerStatus(); showCost(); updateGraphicsDiagnostics();

  // ---- inspection (window.atlas.space) --------------------------------------------------------------
  const idle = () => {
    if (preparing) return false;
    if (!active) return !scheduler || scheduler.snapshot().outstanding === 0;
    const state = recovery?.state().phase;
    if (state === 'recovering' || state === 'preparing') return false;
    if (state !== 'ready') return true;
    return !dirty && !currentJob && renderJobs.size === 0 && scheduler.snapshot().outstanding === 0 && history.snapshot().gesture === null;
  };
  class SpaceIdleTimeout extends Error { constructor(ms, state) { super(`Space did not become idle within ${ms} ms (${JSON.stringify(state)}).`); this.name = 'SpaceIdleTimeout'; this.code = 'ATLAS_IDLE_TIMEOUT'; } }
  const inspection = Object.freeze({
    get scene() { return scene(); },
    get sceneHash() { return sceneCodec.fingerprint(scene()).sceneHash; },
    get history() { const { scene: omitted, ...rest } = history.snapshot(); return rest; },
    get lastReport() { return lastReport; },
    get lastPublication() { return lastPublication; },
    get cameraStatus() { return currentCameraStatus(); },
    get backendDiagnostics() { return backend ? backend.diagnostics() : null; },
    get idle() { return idle(); },
    get state() {
      return Object.freeze({ active, phase: unavailableReason && !ready() ? 'unavailable' : recovery?.state().phase ?? phase, prepared: Boolean(prewarm?.ok), prewarm,
        eligible: eligibleNow, submitted, dirty, pending: pendingStatus, flight: flight.active, gesture: history.snapshot().gesture,
        hidden: scheduler?.snapshot().views.find(view => view.viewId === SPACE_VIEW_ID)?.hidden ?? !active,
        deviceEpoch: backend?.currentEpoch() ?? 0, backendCreated: Boolean(backend), viewport: viewportSize(), cost: { ...cost }, allocationFailure,
        budget: budgetNotice ? { reason: budgetNotice.reason, continuation: budgetNotice.continuation } : null, recovery: recovery?.state() ?? null, controller: gamepad.status(),
        unavailable: unavailableReason });
    },
    async whenIdle({ timeoutMs = 60000 } = {}) {
      const deadline = now() + timeoutMs;
      while (!idle()) {
        if (now() > deadline) throw new SpaceIdleTimeout(timeoutMs, inspection.state);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    },
    pickContext,
    requestCamera,
    editParameter, selectFamily, cancelCurrent() {
      navigationStream++; navigationOpen = false;
      return currentJob && recovery ? recovery.cancel(currentJob.jobId) : null;
    },
    overview: showOverview, resetOrientation: resetView, undo: () => historyStep('undo'), redo: () => historyStep('redo'), back: () => historyStep('back'), forward: () => historyStep('forward'),
    saveScene, openSceneText, restoreFullCost,
    onPublish(listener) { publishListeners.add(listener); return () => publishListeners.delete(listener); },
    onPublicationUpdate(listener) { publicationUpdateListeners.add(listener); return () => publicationUpdateListeners.delete(listener); },
    onPresent(listener) { presentListeners.add(listener); return () => presentListeners.delete(listener); },
    // Workspace submissions, including workspace resize requests. Direct renderer
    // calls and internal recovery replays are outside this subscription.
    onRequest(listener) { if (typeof listener !== 'function') throw new TypeError('listener must be a function'); requestListeners.add(listener); return () => requestListeners.delete(listener); },
    onReport(listener) { if (typeof listener !== 'function') throw new TypeError('listener must be a function'); reportListeners.add(listener); return () => reportListeners.delete(listener); },
    // Test seams: a backend before the first activation, and the backend test adapter.
    setBackend(fake) { if (backend || recovery) throw new Error('the Space backend is already in use'); backendOverride = fake; },
    injectLoss() { if (!backend) throw new Error('no Space backend'); return backend.testAdapter.injectLoss({ reason: 'unknown', message: 'injected through the B14 test seam' }); },
    injectAllocationFailure() { if (!backend) throw new Error('no Space backend'); backend.testAdapter.failNextAllocation(); },
  });

  return Object.freeze({
    inspection, activate, deactivate,
    focus() { if (active) canvas.focus?.({ preventScroll: true }); },
    destroy() {
      if (destroyed) return;
      deactivate(); destroyed = true;
      gamepad.destroy();
      recovery?.destroy(); renderer?.destroy(); backend?.destroy();
      diagnostics.destroy();
      publishListeners.clear(); publicationUpdateListeners.clear(); presentListeners.clear(); requestListeners.clear(); reportListeners.clear();
    },
  });
}
