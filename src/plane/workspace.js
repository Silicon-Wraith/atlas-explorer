// The Plane workspace (spec §4.1, §13.1): its lifecycle, controls and histories.
// Created once by the composition root (src/app.js) with the shell and the discoveries.
import { GpuRenderer, CpuRenderer } from './renderer.js';
import { zoomView, viewTransform, precisionFor } from './math.js';
import { PALETTES } from './palettes.js';
import { PLACES } from './places.js';
import { icon } from '../ui/icons.js';
import { createHistory } from '../shared/history.js';
import { createDiscoveryRecord } from '../shared/discoveries.js';
import { mountDiscoveriesControl, writeMessage } from '../ui/discoveries.js';
import { sceneCodec, toPlaneState, PLANE_INITIAL_SCENE, encodeShareHash, decodeShareHash, encodeSceneFile, decodeSceneFile, admitEnteredView } from './scene-adapter.js';
import { createGestureArbiter } from './gestures.js';
import { createPlaneRenderAdapter, createPlaneRequest } from './render-adapter.js';
import { startExport, EXPORT_LIMITS } from './export.js';
import { CompletionError } from './completion.js';
import { bindPlaneNavigation, navigationKey } from './navigation.js';

// A discovery's thumbnail must encode within this bound, or the save is refused (spec §13.10).
export const THUMBNAIL_ENCODE_MS = 5000;

// shell: { $, toast, showDialog } (src/ui/shell.js); discoveries: the headless controller
// (src/shared/discoveries.js); sourceId: the source this workspace saves to.
// → { inspection (window.atlas), activate(token), deactivate(), destroy() } (B14 activation contract)
export function createPlaneWorkspace({ shell, discoveries, sourceId = 'local' }) {
  const { $, toast, showDialog: openDialog } = shell;
  let canvas = $('#fractal');
  let renderer;
  // The scene history owns the one authoritative scene. `view` and `settings` are derived from it
  // and are assigned only in adopt().
  let sceneHistory, gestures, view, settings;
  // Pointer, wheel, touch and key navigation (src/plane/navigation.js); its reset() ends captured
  // pointer navigation on every history step: a held pointer navigates no more.
  let navigation = null;
  let activePlace = 'seahorse';
  let busy = false, dirty = false, displayedView;
  let rendered = 0, requestVersion = 0, cycle = false, tour = null;
  // The render adapter is the only caller of the renderer's render() and color() (spec §7.4, §14),
  // and its publication is the authoritative provenance of the image on the canvas (atlas.lastReport).
  // `lastExport` is the last export job; an interrupted one keeps its request for a restart.
  let adapter, lastExport = null, exportHooks = {}, recoveryHooks = {}, pendingReplacement = false;
  let geometryRevision = 0, appearanceRevision = 0;
  // Device lifecycle (spec §14, charter §3.10): `contextLost` spans the lost → restored events of the
  // canvas; a loss stays `lossPending` until the replacement that follows it; after a loss the view is
  // rendered again automatically at most once, and the recovery counts as successful only when the
  // completion signal confirms its publication (GPU queue completion or CPU paint, confirmRecovery),
  // never on the application-side return. A repeated loss before that pauses rendering: queued desired
  // state is kept but nothing is submitted, and only an explicit action of the explorer (Resume
  // rendering, or their own navigation or edit) clears the pause — automatic requests (tour frames,
  // resize, the render after an export, recovery itself) run under `automatedRequests` and never do.
  let contextLost = false, lossPending = false, recoveryAttempts = 0, renderingPaused = false, automatedRequests = 0;
  function automated(action) { automatedRequests++; try { return action(); } finally { automatedRequests--; } }
  let savedTab = false;
  // B14 activation: while inactive no interactive render is flushed (the request stays dirty and is
  // flushed once on activation), the global listeners are detached and automation is stopped. An
  // export holding its lease completes under T07/T08's rules regardless.
  let active = true;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function adoptScene(scene) {
    const state = toPlaneState(scene);
    view = state.view;
    const { iterations, ...appearanceAndDetail } = state.settings;
    settings = appearanceAndDetail;
  }

  // Startup: a native share link opens its scene; anything else opens fresh-start Plane.
  function startupScene() {
    const link = decodeShareHash(location.hash);
    if (link.kind === 'scene' && link.scene.workspace === 'plane') { activePlace = ''; return link.scene; }
    if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Opening Seahorse valley.`);
    return PLANE_INITIAL_SCENE;
  }
  sceneHistory = createHistory({ initialScene: startupScene(), codec: sceneCodec });
  adoptScene(sceneHistory.snapshot().scene);
  sceneHistory.subscribe(() => updateHistoryControls());

  // Every scene change arrives here: derive view and settings, then render or recolor.
  function adopt(transition, interactive = false) {
    if (!transition) return;
    adoptScene(transition.after);
    if (!transition.render) return;
    const geometry = transition.changed.some(domain => domain !== 'appearance');
    if (geometry) geometryRevision++;
    if (transition.changed.includes('appearance')) appearanceRevision++;
    if (transition.changed.some(domain => domain !== 'camera')) syncControls();
    if (geometry) requestRender(interactive);
    else {
      updateReadouts();
      // A recolor of published geometry is itself a publication with its own report (the adapter's
      // publication). During an export lease or a lost context the edit is only recorded; the live
      // scene is rendered after.
      adapter.recolor(transition.after, generation());
      if (adapter.publication) confirmRecovery(adapter.publication.report);
    }
  }
  // A recovery episode ends only on completion evidence for a publication of the recovered device: the
  // GPU may still be executing the recovery draw when adapter.render() returns, and a loss caused by
  // that draw must count against the episode. A publication superseded before its fence signals hands
  // over to the next one: every later publication — an interactive render, a recolor, an export render
  // — asks again while an episode is open. The evidence is the fact, whoever observes it: the app's
  // own confirmation and a caller's atlas.whenDrawn() close the episode alike (T08 fix round 2b), so a
  // caller holding completion evidence never sees the episode still open behind it.
  function recovered(evidence) {
    if (recoveryAttempts && evidence.deviceEpoch === adapter.epoch) recoveryAttempts = 0;
  }
  function confirmRecovery(report) {
    if (!recoveryAttempts) return;
    // `recoveryHooks.hold` is a test seam: it holds the app's own confirmation until released, so a
    // check can observe an unconfirmed recovery deterministically instead of racing the GPU.
    Promise.resolve(recoveryHooks.hold?.())
      .then(() => adapter.completion(report, { timeoutMs: 120000, now: () => performance.now() }))
      .then(recovered, () => { /* superseded, interrupted or late: the episode stays open */ });
  }
  const generation = () => ({ deviceEpoch: adapter.epoch, viewRevision: sceneHistory.snapshot().revision, geometryRevision, appearanceRevision });

  gestures = createGestureArbiter({ history: sceneHistory, onTransition: (transition, interactive) => adopt(transition, interactive), stopAutomated: () => stopTour() });
  const preview = (kind, command, interactive) => gestures.preview(kind, command, interactive);
  const commitGesture = kind => gestures.commit(kind);
  const applyAction = (commands, kind, interactive = false) => gestures.apply(commands, kind, interactive);
  // A wheel burst or key-repeat run: one camera-history entry after a quiet period.
  function navigateGrouped(next) {
    activePlace = '';
    gestures.grouped({ type: 'setCamera', camera: next });
    document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
  }
  // A history step stops the tour and active pointer navigation first (spec §6; plan amendment G(1)):
  // the open gesture is settled by the arbiter, so a held drag becomes the pose that Back then leaves.
  function historyStep(action) {
    stopTour(); navigation?.reset();
    const transition = gestures.step(action, action === 'back' || action === 'forward');
    if (transition) { activePlace = ''; renderPlaces(); }
  }
  function updateHistoryControls() {
    const snapshot = sceneHistory.snapshot();
    for (const [id, enabled] of [['#undo-button', snapshot.canUndo], ['#redo-button', snapshot.canRedo], ['#back-button', snapshot.canBack], ['#forward-button', snapshot.canForward]]) {
      const button = $(id); if (button) button.disabled = !enabled;
    }
  }

  function makeRenderer() {
    try { return new GpuRenderer(canvas); }
    catch (error) {
      console.info('Using the CPU renderer:', error.message);
      const replacement = canvas.cloneNode(false); canvas.replaceWith(replacement); canvas = replacement;
      toast('Using the CPU renderer. Deep views take a little longer.');
      return new CpuRenderer(canvas, error);
    }
  }
  renderer = makeRenderer();
  adapter = createPlaneRenderAdapter({ renderer, clock: () => performance.now() });

  function updateGraphicsDetails() {
    const info = renderer.diagnostics;
    $('#graphics-summary').textContent = {
      hardware: 'Your browser reports a hardware graphics device for WebGL rendering.',
      software: 'Your browser is running WebGL in software on the CPU.',
      unknown: 'WebGL is running, but the browser has not disclosed a recognizable graphics device.',
      cpu: 'Fractal calculations are running in the CPU fallback.',
    }[info.acceleration];
    $('#graphics-device').textContent = info.device;
    $('#graphics-reason').textContent = info.reason || 'WebGL 2 and floating-point rendering initialized successfully.';
    $('#graphics-attempted-row').hidden = !info.attemptedDevice;
    $('#graphics-attempted').textContent = info.attemptedDevice || '';
    $('#graphics-guidance').textContent = info.acceleration === 'cpu' || info.acceleration === 'software'
      ? 'Check your browser’s graphics acceleration setting and graphics diagnostics. Rendering runs on the computer where this browser is open.'
      : 'ATLAS calculates new images when you navigate or change the detail setting. A still view does not continuously recalculate the fractal.';
    $('#engine-status').title = `${info.device}\n${info.reason || info.acceleration}\nClick for graphics details`;
  }
  updateGraphicsDetails();

  function renderSettings() {
    return toPlaneState(sceneHistory.snapshot().scene).settings;
  }
  function dimensions() {
    const width = innerWidth, height = innerHeight;
    let ratio = Math.min(devicePixelRatio || 1, 1.6);
    const budget = view.zoom >= 28 ? 1100000 : 2300000;
    ratio = Math.min(ratio, Math.sqrt(budget / (width * height)));
    return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
  }
  function requestRender(interactive = false) {
    dirty = true; requestVersion++;
    if (renderingPaused && !automatedRequests) { renderingPaused = false; $('#resume-rendering').hidden = true; }
    if (busy && renderer instanceof CpuRenderer) adapter.cancelInteractive();
    if (interactive && displayedView) {
      const { scale, x, y } = viewTransform(displayedView, view, innerWidth);
      if ([scale, x, y].every(Number.isFinite)) canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
    updateReadouts();
    requestAnimationFrame(flushRender);
  }
  // The one call site of adapter.render: `busy` serializes interactive renders (the adapter's
  // precondition); an export lease, a retired renderer or a lost context defers the flush until the
  // export finishes or the renderer is replaced (both request a render).
  async function flushRender() {
    if (!active || busy || !dirty || renderingPaused || adapter.reserved || adapter.retired || adapter.unavailable) return;
    busy = true; dirty = false;
    const version = requestVersion;
    const snapshot = { ...view };
    const [width, height] = dimensions();
    const request = createPlaneRequest({ scene: sceneHistory.snapshot().scene, purpose: 'interactive', width, height, generation: generation() });
    $('#render-status').textContent = 'Resolving the landscape…';
    document.body.dataset.rendering = 'true';
    try {
      const report = await adapter.render(request, { isCurrent: () => version === requestVersion, currentGeneration: generation, liveScene: () => sceneHistory.snapshot().scene });
      // Superseded: a newer request follows (the finally block schedules it). Interrupted: the
      // context was lost or the renderer replaced; the replacement requests the next render.
      if (report.outcome === 'superseded' || report.outcome === 'interrupted') return;
      if (report.outcome !== 'completed') throw new Error(report.reason);
      confirmRecovery(report);
      displayedView = snapshot;
      canvas.style.transform = '';
      rendered++;
      document.body.dataset.ready = 'true';
      $('#engine-status').textContent = renderer.mode;
      updateGraphicsDetails();
      $('#render-status').textContent = 'Ready to explore';
      $('#resolution-status').textContent = `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} · RGB`;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      $('#render-status').textContent = 'Render interrupted';
      toast('This view could not finish rendering. Try reducing the level of detail.');
    } finally {
      busy = false;
      document.body.dataset.rendering = 'false';
      if (dirty || version !== requestVersion) requestAnimationFrame(flushRender);
    }
  }
  function updateReadouts() {
    const superscript = value => String(value).replace(/[-\d]/g, c => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' })[c]);
    $('#zoom-value').textContent = view.zoom < 6 ? (10 ** view.zoom).toLocaleString('en-US', { maximumFractionDigits: view.zoom < 1 ? 1 : 0 }) : `${(10 ** (view.zoom - Math.floor(view.zoom))).toFixed(2)} · 10${superscript(Math.floor(view.zoom))}`;
    for (const key of ['re', 'im']) {
      const text = view[key];
      $(`#coordinate-${key}`).textContent = (text.startsWith('-') ? '−' + text.slice(1) : '+' + text);
      $(`#coordinate-${key}`).title = text;
    }
    $('#precision-status').textContent = `${precisionFor(view.zoom)} DIGITS`;
    $('#detail-value').textContent = renderSettings().iterations.toLocaleString();
  }
  function syncControls() {
    $('#phase').value = Math.round(settings.phase * 1000);
    $('#frequency').value = Math.round(settings.frequency * 100);
    $('#detail').value = settings.detail;
    $('#relief').checked = !!settings.relief;
    $('#frequency-value').textContent = `${settings.frequency.toFixed(1)}×`;
    document.querySelectorAll('input[type=range]').forEach(styleRange);
    const palette = PALETTES.find(p => p.id === settings.palette);
    $('#palette-name').textContent = palette.name;
    $('#palette-description').textContent = palette.description;
    document.querySelectorAll('.palette-swatch').forEach(button => {
      const active = button.dataset.palette === settings.palette;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    updateReadouts();
  }
  function styleRange(input) {
    input.style.setProperty('--range', `${(input.value - input.min) / (input.max - input.min) * 100}%`);
  }
  // A jump to a place or entered coordinate: its camera goes to camera history and any
  // palette or detail it carries is one undoable content change.
  // The lexical and resource preflight runs before validateView materializes anything.
  function goTo(next, palette, place = '', { tourGesture = false } = {}) {
    const target = admitEnteredView(next);
    const commands = [{ type: 'setCamera', camera: { re: target.re, im: target.im, zoom: target.zoom } }];
    if (Number.isInteger(next.detail)) commands.push({ type: 'setIteration', patch: { detail: Math.min(5, Math.max(0, next.detail)) } });
    if (palette) commands.push({ type: 'setAppearance', patch: { palette } });
    activePlace = place;
    if (tourGesture) for (const command of commands) gestures.automate('tour', command);
    else applyAction(commands, 'jump');
    renderPlaces();
  }
  function navigate(next, interactive = true, kind = 'navigation') {
    stopTour(); activePlace = '';
    if (kind === 'jump') applyAction([{ type: 'setCamera', camera: next }], 'jump', interactive);
    else preview(kind, { type: 'setCamera', camera: next }, interactive);
    document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
  }

  $('#palette-grid').innerHTML = PALETTES.map(p => `<button class="palette-swatch" data-palette="${p.id}" title="${p.name}" aria-label="${p.name} palette" aria-pressed="false" style="background:linear-gradient(145deg,${p.stops.slice(1,6).join(',')})"></button>`).join('');
  $('#palette-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-palette]');
    if (!button) return;
    applyAction([{ type: 'setAppearance', patch: { palette: button.dataset.palette } }], 'edit');
  });
  // One slider drag is one gesture: `input` previews, `change` (release) commits.
  $('#phase').addEventListener('input', event => { styleRange(event.target); preview('slider', { type: 'setAppearance', patch: { phase: event.target.value / 1000 } }); });
  $('#frequency').addEventListener('input', event => { preview('slider', { type: 'setAppearance', patch: { frequency: event.target.value / 100 } }); });
  $('#detail').addEventListener('input', event => { styleRange(event.target); preview('slider', { type: 'setIteration', patch: { detail: Number(event.target.value) } }); });
  for (const id of ['#phase', '#frequency', '#detail']) $(id).addEventListener('change', () => commitGesture('slider'));
  $('#relief').addEventListener('change', event => { applyAction([{ type: 'setAppearance', patch: { relief: Number(event.target.checked) } }], 'edit'); });
  $('#cycle-button').onclick = () => {
    cycle = !cycle; $('#cycle-button').setAttribute('aria-pressed', String(cycle));
    if (!cycle) commitGesture('animation');
    if (cycle && !tour) requestAnimationFrame(animate);
  };
  let lastAnimation = 0;
  function animate(time) {
    const dt = Math.min(.08, (time - (lastAnimation || time)) / 1000); lastAnimation = time;
    if (cycle && !adapter.reserved) { gestures.animate({ type: 'setAppearance', patch: { phase: (settings.phase + dt * .025) % 1 } }); $('#phase').value = Math.round(settings.phase * 1000); styleRange($('#phase')); }
    if (tour && !adapter.reserved) {
      const elapsed = time - tour.started;
      if (elapsed > 18000) {
        tour.index = (tour.index + 1) % PLACES.length; tour.started = time; tour.lastFrame = 0;
        const place = PLACES[tour.index]; automated(() => goTo(place, place.palette, place.id, { tourGesture: true }));
        $('#tour-location').textContent = place.name;
      } else if (!busy && elapsed - tour.lastFrame > 90) {
        const step = (elapsed - tour.lastFrame) / 1000;
        tour.lastFrame = elapsed;
        automated(() => gestures.automate('tour', { type: 'setCamera', camera: zoomView(view, view.zoom + Math.min(.2, step) * .07) }, true));
      }
    }
    if (cycle || tour) requestAnimationFrame(animate); else lastAnimation = 0;
  }
  function startTour() {
    if (tour) { stopTour(); return; }
    gestures.settle();
    tour = { index: 1, started: performance.now(), lastFrame: 0 };
    goTo(PLACES[1], PLACES[1].palette, PLACES[1].id, { tourGesture: true });
    $('#tour-status').hidden = false; $('#tour-location').textContent = PLACES[1].name;
    $('#tour-button').innerHTML = `${icon('pause')} Pause the journey <span class="arrow">↗</span>`;
    if (reducedMotion) toast('Journey started. Use Pause at any time to stop motion.');
    if (!cycle) requestAnimationFrame(animate);
  }
  function stopTour() {
    const running = tour;
    tour = null;
    if (running) commitGesture('tour');
    $('#tour-status').hidden = true;
    $('#tour-button').innerHTML = `${icon('play')} Take a journey <span class="arrow">↗</span>`;
  }
  $('#tour-button').onclick = startTour;
  $('#stop-tour').onclick = stopTour;

  // Pointer, wheel, touch and key navigation (identical arithmetic, spec §4.3). The first pointer
  // settles earlier activity; a further finger joins the open drag or pinch (plan amendment G(1)).
  navigation = bindPlaneNavigation({
    surface: $('#fractal-surface'), getCanvas: () => canvas, getView: () => view,
    onPointerStart(first) { stopTour(); if (first) gestures.settle(); },
    drag: next => navigate(next, true, 'navigation-drag'),
    dragEnd: () => commitGesture('navigation-drag'),
    grouped: navigateGrouped,
    jump: next => navigate(next, true, 'jump'),
  });
  // A lost context invalidates every earlier render and any export holding the renderer; nothing
  // renders, recolors or exports until the replacement, which waits for the restoration of the
  // current loss and for an export lease to end (recover()).
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); contextLost = true; lossPending = true; adapter.invalidate();
    $('#render-status').textContent = 'Graphics paused'; toast('The graphics device paused. Restoring the view…');
  });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; recover(); });
  $('#zoom-in').onclick = () => navigate(zoomView(view, view.zoom + Math.log10(2)), true, 'jump');
  $('#zoom-out').onclick = () => navigate(zoomView(view, view.zoom - Math.log10(2)), true, 'jump');
  $('#undo-button').onclick = () => historyStep('undo');
  $('#redo-button').onclick = () => historyStep('redo');
  $('#back-button').onclick = () => historyStep('back');
  $('#forward-button').onclick = () => historyStep('forward');
  const home = () => { stopTour(); goTo(PLACES[0], settings.palette, 'origin'); };
  $('#home-button').onclick = home;
  $('#brand-home').onclick = event => { event.preventDefault(); home(); };
  function cinema() { document.body.classList.toggle('cinema'); }
  $('#cinema-button').onclick = cinema;
  $('#settings-button').onclick = () => {
    document.body.classList.toggle('controls-expanded');
    $('#settings-button').setAttribute('aria-expanded', String(document.body.classList.contains('controls-expanded')));
  };
  $('#exit-cinema').onclick = cinema;
  $('#gallery-toggle').onclick = () => {
    document.body.classList.toggle('gallery-collapsed');
    const label = document.body.classList.contains('gallery-collapsed') ? 'Expand places' : 'Collapse places';
    $('#gallery-toggle').setAttribute('aria-label', label); $('#gallery-toggle').title = label;
  };

  // The Discoveries control (spec §13.10) owns the "Your discoveries" tab: it lists, pages, opens
  // and removes records through the controller, and shows outstanding writes. Opening a discovery
  // is a whole-scene restoration.
  const control = mountDiscoveriesControl({
    grid: $('#destination-grid'), countElement: $('#saved-count'), controller: discoveries, sourceId,
    isActive: () => savedTab, activeKey: () => activePlace,
    onOpen(record, key) {
      stopTour(); applyAction([{ type: 'restoreScene', scene: record.sceneSnapshot }], 'restore');
      activePlace = key; renderPlaces();
    },
    toast,
  });
  function renderPlaces() {
    if (savedTab) { control.render(); return; }
    $('#destination-grid').classList.remove('saved-places');
    $('#destination-grid').replaceChildren();
    PLACES.forEach((place, index) => {
      const button = document.createElement('button');
      button.className = `destination-card${place.id === activePlace ? ' active' : ''}`;
      button.dataset.place = place.id;
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.draggable = false;
      image.src = `/assets/${place.id}.png`;
      // Thumbnails are real renders, generated by scripts/thumbnails.mjs.
      image.onerror = () => { image.style.display = 'none'; };
      button.append(image);
      const fields = [['place-number', String(index + 1).padStart(2, '0')], ['place-arrow', '↗'], ['place-name', place.name], ['place-description', place.description]];
      for (const [className, text] of fields) { const span = document.createElement('span'); span.className = className; span.textContent = text; button.append(span); }
      button.onclick = () => { stopTour(); goTo(place, place.palette, place.id); };
      $('#destination-grid').append(button);
    });
    control.render();
  }
  // Saving a discovery (spec §13.10, §14). The thumbnail is the canvas, so it is captured only when
  // the canvas shows a publication of the live scene — not an export image, a lost or retired device,
  // or geometry still rendering (plan amendment I(2)); that check and the capture are synchronous, so
  // a later edit cannot pair live settings with older pixels. The thumbnail must encode within
  // THUMBNAIL_ENCODE_MS. The record, its thumbnail, the publication's report and the write marker are
  // committed together by the local source; the toast claims only what the write observed. An open
  // gesture (a held drag, a tour, the palette animation) is never settled here: saving changes no
  // scene and records no history entry (spec §4.3, §6).
  async function saveDiscovery() {
    const scene = sceneHistory.snapshot().scene;
    const publication = adapter.publication;
    const settled = rendered && !busy && !dirty && !adapter.reserved && !adapter.unavailable && !adapter.retired && publication && sceneCodec.equal(publication.request.sceneSnapshot, scene);
    if (!settled) { toast('Let the current view finish, then save it.'); return; }
    const report = publication.report;
    const thumbnailCanvas = document.createElement('canvas'); thumbnailCanvas.width = 320; thumbnailCanvas.height = 160;
    thumbnailCanvas.getContext('2d').drawImage(canvas, 0, 0, 320, 160);
    const base = PLACES.find(p => p.id === activePlace)?.name || 'Discovery';
    const count = Object.values(discoveries.snapshot().sources).reduce((total, source) => total + (Number.isInteger(source.total) ? source.total : source.items.length), 0);
    let timer;
    const blob = await Promise.race([
      new Promise(resolve => thumbnailCanvas.toBlob(resolve, 'image/jpeg', .75)),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), THUMBNAIL_ENCODE_MS); }),
    ]).finally(() => clearTimeout(timer));
    if (!blob) { toast('This browser could not create a thumbnail. Use Capture → Save location to keep this view.'); return; }
    let observation;
    try {
      const record = createDiscoveryRecord({ scene, name: `${base} ${String(count + 1).padStart(2, '0')}`, thumbnail: { sourceReportId: report.reportId, mediaType: 'image/jpeg', blob }, id: crypto.randomUUID(), createdAt: new Date().toISOString(), sceneCodec });
      observation = await discoveries.save(sourceId, record, { report });
    } catch (error) { observation = { status: 'failed', reason: error?.message ?? String(error) }; }
    toast(writeMessage(observation, 'save'));
  }
  $('#bookmark-button').onclick = saveDiscovery;
  for (const id of ['places-tab', 'saved-tab']) $(`#${id}`).onclick = () => {
    savedTab = id === 'saved-tab';
    for (const tab of ['places-tab', 'saved-tab']) { const active = tab === id; $(`#${tab}`).classList.toggle('active', active); $(`#${tab}`).setAttribute('aria-pressed', String(active)); }
    renderPlaces();
  };

  function showDialog(id) { stopTour(); openDialog(id); }
  $('#engine-status').onclick = () => showDialog('#graphics-dialog');
  $('#graphics-button').onclick = () => { $('#help-dialog').close(); showDialog('#graphics-dialog'); };
  $('#help-button').onclick = () => showDialog('#help-dialog');
  $('#export-button').onclick = () => showDialog('#capture-dialog');
  $('#coordinates-button').onclick = () => {
    $('#input-re').value = view.re; $('#input-im').value = view.im; $('#input-zoom').value = view.zoom;
    $('#coordinate-error').textContent = ''; showDialog('#coordinate-dialog');
  };
  $('#coordinate-form').onsubmit = event => {
    event.preventDefault();
    try {
      const next = admitEnteredView({ re: $('#input-re').value.trim(), im: $('#input-im').value.trim(), zoom: Number($('#input-zoom').value) });
      goTo(next); $('#coordinate-dialog').close();
    } catch (error) { $('#coordinate-error').textContent = error.message; }
  };
  $('#share-button').onclick = async () => {
    commitGesture();
    const url = `${location.origin}${location.pathname}${encodeShareHash(sceneHistory.snapshot().scene)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); toast('View link copied. Every coordinate digit is included.'); }
    catch { toast('Your view is in the address bar. Copy that URL to share it.'); }
  };
  // A link opened during an investigation: a valid scene is a whole-scene restoration;
  // anything else is reported and changes neither the scene nor either history.
  // `openShareHash` is also the shell link router's restore path for a link that arrived while Plane
  // was inactive (B14-F3); the router calls it only after Plane is active again.
  const openShareHash = hash => {
    const link = decodeShareHash(hash);
    if (link.kind === 'scene' && link.scene.workspace === 'plane') { stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene: link.scene }], 'restore'); renderPlaces(); }
    else if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Your view is unchanged.`);
  };
  const onHashChange = () => openShareHash(location.hash);

  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  $('#download-location').onclick = () => {
    commitGesture();
    download(new Blob([encodeSceneFile(sceneHistory.snapshot().scene)], { type: 'application/json' }), 'atlas-scene.json');
    $('#capture-status').textContent = 'Location saved, including all coordinate digits.';
  };
  $('#import-location').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      // The bound adapter's limit (plan amendment A): the file is refused before it is read.
      if (file.size > sceneCodec.maxSceneBytes) throw new Error('This location file is too large.');
      const scene = decodeSceneFile(await file.text());
      stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene }], 'restore'); renderPlaces();
      $('#capture-dialog').close(); toast('Welcome back to your discovery.');
    } catch (error) { $('#capture-status').textContent = error.message || 'Could not open this location.'; }
    event.target.value = '';
  };
  // Only once the current loss has been restored and no export holds the renderer: the adapter
  // accepts the new renderer before the old one is disposed, so the workspace and the adapter always
  // refer to the same renderer, and a replacement never happens on a lost context (which would fall
  // back to the CPU silently). → false when it had to wait.
  function replaceRenderer() {
    if (adapter.reserved || contextLost) { pendingReplacement = true; return false; }
    pendingReplacement = false;
    const previous = renderer, next = makeRenderer();
    adapter.replaceRenderer(next);
    renderer = next;
    previous.destroy();
    updateGraphicsDetails();
    return true;
  }
  // Recovery after a loss, a retirement, or a restoration deferred by an export: replace the renderer,
  // then render the live scene automatically at most once per loss; a repeated loss before that render
  // completes pauses automatic rendering until the explorer resumes (spec §14, charter §3.10).
  function recover() {
    if (!replaceRenderer()) return;
    if (lossPending) {
      lossPending = false;
      if (recoveryAttempts >= 1) { pauseRendering(); return; }
      recoveryAttempts++;
    }
    if (!renderingPaused) automated(() => requestRender());
  }
  function pauseRendering() {
    renderingPaused = true;
    $('#render-status').textContent = 'Rendering paused after repeated graphics loss';
    $('#resume-rendering').hidden = false;
    toast('The graphics device was lost again. Press Resume rendering to continue.');
  }
  // The explicit resume: one fresh automatic attempt, confirmed like the first.
  $('#resume-rendering').onclick = () => { recoveryAttempts = 1; requestRender(); };

  // One export job: the renderer is reserved synchronously (startExport), before any asynchronous
  // wait (spec §14). Later edits change only the live scene; the lease ends with a render of the live
  // scene, which also applies any deferred appearance edit. An interrupted job keeps its request and
  // snapshot and a restart is offered; `restartOf` names the job a restart repeats.
  function runExport(request, { restartOf = null } = {}) {
    const limits = { ...EXPORT_LIMITS, ...exportHooks.limits }; // the limits override is a test seam
    const { done } = startExport({ adapter, request, hooks: exportHooks, limits, encode: target => new Promise(resolve => target.toBlob(resolve, 'image/png')) });
    const button = $('#download-image'); button.disabled = true; $('#restart-export').hidden = true;
    $('#capture-status').textContent = 'Rendering your image…';
    done.then(result => {
      lastExport = { ...result, restartOf };
      if (result.outcome === 'completed') {
        download(result.blob, `atlas-${Math.floor(request.sceneSnapshot.camera.zoom)}-decades.png`);
        $('#capture-status').textContent = `Saved ${result.report.completed.width.toLocaleString()} × ${result.report.completed.height.toLocaleString()} pixels. Save the location below to return here.`;
      } else {
        $('#capture-status').textContent = result.reason || 'Image export is unavailable.';
        if (result.outcome === 'interrupted') $('#restart-export').hidden = false;
      }
      // A renderer retired by a timeout, a context lost during the lease, or a restoration deferred by
      // it: recover now, or as soon as the context is restored.
      if (adapter.retired || adapter.unavailable || pendingReplacement) recover();
      else if (adapter.publication) confirmRecovery(adapter.publication.report); // the export image is a publication too
    }).finally(() => { button.disabled = false; automated(() => requestRender()); });
  }
  const exportUnavailable = () => {
    if (!(adapter.reserved || adapter.retired || adapter.unavailable)) return false;
    $('#capture-status').textContent = 'The graphics device is not available yet. Try again in a moment.';
    return true;
  };
  // The complete export request is captured in this handler, before any asynchronous wait.
  $('#download-image').onclick = () => {
    if (exportUnavailable()) return;
    stopTour(); commitGesture();
    const scene = sceneHistory.snapshot().scene;
    const width = $('#export-size').value === 'current' ? canvas.width : Number($('#export-size').value);
    const height = Math.max(1, Math.round(width * innerHeight / innerWidth));
    runExport(createPlaneRequest({ scene, purpose: 'export', width, height, generation: generation() }));
  };
  // The retained snapshot and dimensions of the interrupted job, under a new request identity.
  $('#restart-export').onclick = () => {
    const retained = lastExport?.outcome === 'interrupted' ? lastExport.request : null;
    if (!retained || exportUnavailable()) return;
    stopTour();
    runExport(createPlaneRequest({ scene: retained.sceneSnapshot, purpose: 'export', width: retained.output.width, height: retained.output.height, generation: generation() }), { restartOf: retained.requestId });
  };

  const onKeyDown = event => {
    if (event.target.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    const historyKey = (event.ctrlKey || event.metaKey) && !event.altKey
      ? (key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null)
      : event.altKey && !event.ctrlKey && !event.metaKey ? ({ arrowleft: 'back', arrowright: 'forward' })[key] : null;
    if (historyKey) { event.preventDefault(); historyStep(historyKey); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const next = navigationKey(key, view);
    if (next) { event.preventDefault(); navigateGrouped(next); return; }
    const actions = {
      r: home, h: cinema, b: saveDiscovery, s: () => showDialog('#capture-dialog'), '?': () => showDialog('#help-dialog'),
      escape: () => { document.body.classList.remove('cinema'); stopTour(); },
    };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  };
  // A new size is a new geometry dependency: earlier renders are no longer publishable.
  const onResize = () => { geometryRevision++; automated(() => requestRender(true)); };
  const globalListeners = [['keydown', onKeyDown], ['resize', onResize], ['hashchange', onHashChange]];
  for (const [type, listener] of globalListeners) addEventListener(type, listener);
  let hiddenSize = null;
  // Both idempotent. deactivate: stop the tour and the palette animation (each commits its open
  // gesture once), forget captured pointers, settle any open gesture, release keyboard focus and
  // detach the global listeners. activate: re-attach them and flush at most one current-state render
  // when the image is stale (an edit or a resize while hidden); stopped automation stays stopped.
  function deactivate() {
    if (!active) return;
    active = false;
    stopTour();
    if (cycle) { cycle = false; $('#cycle-button').setAttribute('aria-pressed', 'false'); commitGesture('animation'); }
    navigation?.reset();
    gestures.settle();
    if (document.activeElement === canvas) canvas.blur?.();
    for (const [type, listener] of globalListeners) removeEventListener(type, listener);
    hiddenSize = `${innerWidth}x${innerHeight}`;
  }
  function activate() {
    if (active) return Object.freeze({ outcome: 'activated' });
    active = true;
    for (const [type, listener] of globalListeners) addEventListener(type, listener);
    if (hiddenSize !== `${innerWidth}x${innerHeight}`) { geometryRevision++; dirty = true; }
    if (dirty) automated(() => requestRender());
    return Object.freeze({ outcome: 'activated' });
  }

  // Small inspection API for numerical and browser regression tests.
  class IdleTimeoutError extends Error {
    constructor(ms, state) { super(`ATLAS did not become idle within ${ms} ms (${JSON.stringify(state)}).`); this.name = 'IdleTimeoutError'; this.code = 'ATLAS_IDLE_TIMEOUT'; }
  }
  // Application-side idleness: no render in flight, no export lease, a usable renderer, and no
  // queued work — unless rendering is paused, or the workspace is hidden (B14), when queued work
  // waits for the explorer by design.
  async function whenIdle({ timeoutMs = 60000 } = {}) {
    const deadline = performance.now() + timeoutMs;
    while (busy || (dirty && !renderingPaused && active) || adapter.reserved || adapter.unavailable) {
      if (performance.now() > deadline) throw new IdleTimeoutError(timeoutMs, { busy, dirty, exporting: adapter.reserved, unavailable: adapter.unavailable });
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  const inspection = {
    get graphics() { return { ...renderer.diagnostics }; },
    get view() { return { ...view }; }, get settings() { return renderSettings(); }, get renderer() { return adapter.renderer; },
    // The report of the image on the canvas (the adapter's publication), or null when nothing
    // describable is shown: after a loss, a retirement or a replacement, until the next publication.
    get lastReport() { return adapter.publication?.report ?? null; },
    get lastExport() { return lastExport && { outcome: lastExport.outcome, reason: lastExport.reason, requestId: lastExport.request.requestId, sceneHash: lastExport.request.sceneHash, scene: lastExport.request.sceneSnapshot, report: lastExport.report, renderReport: lastExport.renderReport ?? null, hookErrors: lastExport.hookErrors, restartOf: lastExport.restartOf }; },
    // The device lifecycle now (plan amendment H): backend, epoch and state, updated on loss,
    // retirement and replacement. 'lost' lasts from the loss until the replacement.
    get device() { return Object.freeze({ backend: adapter.renderer.gl ? 'webgl' : 'cpu', deviceEpoch: adapter.epoch, state: contextLost || adapter.unavailable ? 'lost' : adapter.retired ? 'retired' : 'ready' }); },
    get recovery() { return Object.freeze({ attempts: recoveryAttempts, paused: renderingPaused }); },
    // Test seams for the export race checks: the decoded image of the last export, stage hooks
    // (next exports only), and whether the workspace and the adapter share one renderer.
    async lastExportImageData() {
      if (!lastExport?.blob) return null;
      const bitmap = await createImageBitmap(lastExport.blob);
      const target = new OffscreenCanvas(bitmap.width, bitmap.height), context = target.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    },
    get rendererConsistent() { return renderer === adapter.renderer; },
    setExportHooks(hooks) { exportHooks = hooks || {}; },
    setRecoveryHooks(hooks) { recoveryHooks = hooks || {}; },
    // `rendered`, `lastReport` and `whenIdle` are application-side facts (a render was adopted and
    // its report published); they do not claim that the GPU has finished drawing (plan amendment G).
    get rendered() { return rendered; }, goTo,
    get scene() { return sceneHistory.snapshot().scene; },
    get history() { const { scene, ...rest } = sceneHistory.snapshot(); return rest; },
    undo: () => historyStep('undo'), redo: () => historyStep('redo'), back: () => historyStep('back'), forward: () => historyStep('forward'),
    whenIdle,
    // GPU completion of one publication (plan amendment G(3)): under one deadline, wait for the
    // application to submit its work, capture the publication, then await its fence. With `report`,
    // that publication alone is awaited. Rejects with a CompletionError ('superseded', 'interrupted',
    // 'timeout', …) rather than switching to a newer publication.
    async whenDrawn({ timeoutMs = 60000, report = null } = {}) {
      if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) throw new RangeError('whenDrawn needs a positive finite bound');
      const deadline = performance.now() + timeoutMs;
      let target = report;
      if (!target) {
        await whenIdle({ timeoutMs });
        target = adapter.publication?.report;
        if (!target) throw Object.assign(new Error('nothing has been published'), { name: 'CompletionError', code: 'none' });
      }
      // The remaining budget, never fresh time: an exhausted bound rejects before the fence or paint,
      // and the absolute deadline holds through this return — late evidence is a timeout to the caller
      // (it still closes a recovery episode: the completion is a fact, only its delivery was late).
      const evidence = await adapter.completion(target, { timeoutMs: deadline - performance.now(), now: () => performance.now() });
      recovered(evidence);
      if (performance.now() > deadline) throw new CompletionError(`GPU completion did not arrive within ${timeoutMs} ms`, 'timeout');
      return evidence;
    },
  };
  // Storage opens in the background: this filter starts the first listing and never waits for it.
  discoveries.setWorkspace('plane');
  syncControls(); renderPlaces(); updateHistoryControls(); requestRender();
  // Teardown order (plan amendment E(1)): the control before the controller that owns it (the
  // composition root destroys the controller after this), then the renderer.
  return Object.freeze({ inspection, activate, deactivate, isActive: () => active, openShareHash, focus: () => canvas.focus?.({ preventScroll: true }),
    destroy: () => { deactivate(); control.destroy(); adapter.renderer.destroy(); } });
}
