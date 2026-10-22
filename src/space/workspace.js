// The Space workspace (spec §13.1–13.3, §14, §15; plan B14). It owns one Space investigation: the
// scene and both histories (camera history uses semantic camera equality, T04a), navigation, flight
// and controller input (B12, B12b), and the viewport render loop. Viewport work is prepared, rendered
// and cancelled only through the recovery facade (B13 R3), with a live currentGeneration guard.
// Creating the workspace acquires nothing: the first activation creates the backend, acquires the
// device and prepares the complete product pipeline set with visible status, then verifies the
// prewarm (B11) before interaction is enabled.
//   createSpaceWorkspace({shell, backendFactory = createWebGPUBackend, clock, env?})
//     → {inspection (window.atlas.space), activate(token) → Promise<{outcome, reason?}>, deactivate(), focus(), destroy()}
// `env` injects the document, window, animation frames, the Gamepad API, the viewport size and the
// input factories for tests; production uses the browser's.
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
import { createSpaceRenderer } from './render/renderer.js';
import { createAdmission } from './render/backend.js';
import { createWebGPUBackend } from './render/webgpu/backend.js';
import { productPipelineSet, productPipelineDescriptors, verifyPrewarm, VIEW_MODE_LABELS } from './render/webgpu/appearance.js';
import { KERNEL_VERSION } from './render/webgpu/kernels.js';
import { TRACING_VERSION } from './render/webgpu/passes.js';

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
  const requests = new Map(), publishListeners = new Set(), presentListeners = new Set();
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
    if (transition.render) {
      viewRevision++;
      if (changed.some(domain => domain !== 'appearance')) geometryRevision++;
      if (changed.includes('appearance')) appearanceRevision++;
      requestRender(transition.preview ? 'draft' : 'settled');
    } else if (transition.cause === 'commit' && lastProfile === 'draft') requestRender('settled');
    if (!transition.preview) refreshCameraStatus();
    if (changed.some(domain => domain !== 'camera')) syncPanel();
    updateHistoryControls();
  }
  function requestRender(profile) {
    wantProfile = profile; dirty = true;
    wantFrame();
  }
  function ready() { return Boolean(recovery) && recovery.state().phase === 'ready' && prewarm?.ok; }
  // The one viewport submission path: live scene, current size, through the facade. Refused while
  // inactive (admission closed), recovering or stopped; the dirty request is kept for later.
  function submit() {
    if (!active || !ready() || destroyed) return false;
    const size = requestedSize();
    if (lastSize && (size.width !== lastSize.width || size.height !== lastSize.height)) { viewRevision++; geometryRevision++; }
    let snapshot = scene();
    if (cost.sampleCap) snapshot = sceneCodec.validate({ ...snapshot, sampling: { ...snapshot.sampling, targetSamples: Math.min(cost.sampleCap, snapshot.sampling.targetSamples) } });
    const request = createSpaceRequest({ scene: snapshot, purpose: 'interactive', ...size, profile: wantProfile, generation: liveGeneration(), viewId: SPACE_VIEW_ID, versions: VERSIONS });
    return submitRequest(request, size);
  }
  function submitRequest(request, size = { width: request.output.width, height: request.output.height }) {
    let job;
    try { job = recovery.render(request, { currentGeneration: liveGeneration }); }
    catch (error) { if (error?.code === 'unavailable') return false; showRecovery(`Rendering failed: ${message(error)}`); return false; }
    dirty = false; lastProfile = request.quality.profile; lastRequest = request; lastSize = size; submitted++;
    track(job);
    return true;
  }
  function track(job) {
    if (!job) return;
    currentJob = job; requests.set(job.requestId, job.request);
    if (requests.size > 64) requests.delete(requests.keys().next().value);
    job.done.then(result => {
      if (currentJob === job) currentJob = null;
      if (result.outcome === 'failed' && result.errorCode !== 'allocation-failed') showRecovery(`The view could not be rendered: ${result.reason}`);
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
    const raw = backendOverride ?? backendFactory({ canvas, clock: now });
    backend = Object.freeze({ ...raw, async acquire(...args) { const receipt = await raw.acquire(...args); acquisition = receipt; return receipt; } });
    scheduler = createScheduler({ clock: now, makeAdmission: createAdmission, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id) });
    renderer = createSpaceRenderer({ backend, scheduler, clock: now, viewId: SPACE_VIEW_ID, versions: VERSIONS, pipelineSet: productPipelineSet() });
    renderer.onPublish(publication => onPublish(publication));
    renderer.onPresent(event => { for (const listener of presentListeners) { try { listener(event); } catch { /* isolate observers */ } } });
    renderer.onReport(report => { lastReport = report; });
    renderer.onStatus(status => { if (typeof status.pending === 'boolean') pendingStatus = status.pending; updateIndicators(); });
    recovery = createRecovery({ backend, renderer, scheduler, clock: now, onNotice: notice => onNotice(notice) });
  }
  function onPublish(publication) {
    const request = requests.get(publication.requestId);
    lastPublication = Object.freeze({ ...publication, sceneHash: request?.sceneHash ?? null, camera: request?.sceneSnapshot.camera ?? null,
      model: request?.sceneSnapshot.model.id ?? null, internalSize: request ? { ...request.quality.internalSize } : null, output: request ? { width: request.output.width, height: request.output.height } : null });
    for (const listener of publishListeners) { try { listener(lastPublication); } catch { /* isolate observers */ } }
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
        if (notice.reason === 'repeated-device-loss') showRecovery('Rendering stopped after repeated graphics device loss. The scene is kept; retry when ready.', true);
        else if (prewarm) showRecovery(`Rendering stopped: ${notice.message ?? notice.reason}`, true);
        break;
      case 'allocation-failed': showAllocationFailure(notice); break;
      case 'budget-exceeded': showBudget(notice); break;
      case 'failed': showRecovery(`The view could not be rendered: ${notice.result?.reason ?? 'failed'}`); break;
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
    if (active) return Object.freeze({ outcome: 'activated' });
    if (!ready()) {
      try {
        if (unavailableReason && !recovery) unavailableReason = null;
        preparing ??= prepare().finally(() => { preparing = null; });
        await preparing;
      } catch (error) {
        if (activation !== token || destroyed) return Object.freeze({ outcome: 'superseded' });
        unavailableReason = message(error);
        showUnavailable(unavailableReason);
        return Object.freeze({ outcome: 'unavailable', reason: unavailableReason });
      }
    }
    if (activation !== token || destroyed) return Object.freeze({ outcome: 'superseded' });
    if (active) return Object.freeze({ outcome: 'activated' });
    enable();
    return Object.freeze({ outcome: 'activated' });
  }
  // Admission closes first, then picks and pending activation are invalidated; navigation settles
  // (the open gesture commits exactly once, flight stops, the controller is suspended), capture and
  // keyboard focus are released and the global listeners detached. Submitted batches drain; the view
  // is marked hidden in the scheduler, never preempted.
  function deactivate() {
    activation = null;
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
  function pickContext() {
    if (!active || !eligibleForPicks() || pendingStatus || !lastPublication) return null;
    const request = requests.get(lastPublication.requestId);
    if (!request) return null;
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
  function showUnavailable(reason) { text('#space-unavailable', `Space unavailable: ${reason}`); setHidden('#space-unavailable', false); showPreparation(''); }
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
    return !dirty && !currentJob && history.snapshot().gesture === null;
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
    requestCamera: pose => jump(sceneCodec.validate({ ...scene(), camera: pose }).camera, 'harness'),
    editParameter, selectFamily, cancelCurrent: () => (currentJob && recovery ? recovery.cancel(currentJob.jobId) : null),
    overview: showOverview, resetOrientation: resetView, undo: () => historyStep('undo'), redo: () => historyStep('redo'), back: () => historyStep('back'), forward: () => historyStep('forward'),
    saveScene, openSceneText, restoreFullCost,
    onPublish(listener) { publishListeners.add(listener); return () => publishListeners.delete(listener); },
    onPresent(listener) { presentListeners.add(listener); return () => presentListeners.delete(listener); },
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
      publishListeners.clear(); presentListeners.clear();
    },
  });
}
