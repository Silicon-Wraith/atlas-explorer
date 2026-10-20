import { GpuRenderer, CpuRenderer } from './plane/renderer.js';
import { moveView, zoomView, viewTransform, precisionFor, validateView } from './plane/math.js';
import { PALETTES } from './plane/palettes.js';
import { PLACES } from './plane/places.js';
import { icon, installIcons } from './ui/icons.js';
import { createHistory } from './shared/history.js';
import { sceneCodec, createPlaneScene, toPlaneState, PLANE_INITIAL_SCENE, encodeShareHash, decodeShareHash, encodeSceneFile, decodeSceneFile, admitEnteredView } from './plane/scene-adapter.js';
import { createGestureArbiter } from './plane/gestures.js';

const $ = selector => document.querySelector(selector);
installIcons();
let canvas = $('#fractal');
let renderer;
// The scene history owns the one authoritative scene. `view` and `settings` are derived from it
// and are assigned only in adopt().
let sceneHistory, gestures, view, settings;
let activePlace = 'seahorse';
let busy = false, dirty = false, toastTimer, displayedView;
let rendered = 0, requestVersion = 0, cycle = false, tour = null, captureBusy = false;
let saved = [], savedTab = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}

try {
  const existing = JSON.parse(localStorage.getItem('atlas.discoveries') || '[]');
  saved = Array.isArray(existing) ? existing.filter(item => {
    try { validateView(item.view); return typeof item.name === 'string' && typeof item.id === 'string'; } catch { return false; }
  }) : [];
} catch { /* A privacy-restricted browser still supports exploration. */ }

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
  if (transition.changed.some(domain => domain !== 'camera')) syncControls();
  if (geometry) requestRender(interactive);
  else { updateReadouts(); renderer.color(settings); }
}

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
function historyStep(action) {
  stopTour();
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
  if (busy && renderer instanceof CpuRenderer) renderer.cancel();
  if (interactive && displayedView) {
    const { scale, x, y } = viewTransform(displayedView, view, innerWidth);
    if ([scale, x, y].every(Number.isFinite)) canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  updateReadouts();
  requestAnimationFrame(flushRender);
}
async function flushRender() {
  if (busy || !dirty || captureBusy) return;
  busy = true; dirty = false;
  const version = requestVersion;
  const snapshot = { ...view }, config = renderSettings();
  const [width, height] = dimensions();
  $('#render-status').textContent = 'Resolving the landscape…';
  document.body.dataset.rendering = 'true';
  try {
    await renderer.render(snapshot, config, width, height, false, () => version === requestVersion);
    renderer.color(settings);
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
function pointAt(clientX, clientY) {
  return [(clientX - innerWidth / 2) / innerWidth, (innerHeight / 2 - clientY) / innerWidth];
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
  if (cycle && !captureBusy) { gestures.animate({ type: 'setAppearance', patch: { phase: (settings.phase + dt * .025) % 1 } }); $('#phase').value = Math.round(settings.phase * 1000); styleRange($('#phase')); }
  if (tour && !captureBusy) {
    const elapsed = time - tour.started;
    if (elapsed > 18000) {
      tour.index = (tour.index + 1) % PLACES.length; tour.started = time; tour.lastFrame = 0;
      const place = PLACES[tour.index]; goTo(place, place.palette, place.id, { tourGesture: true });
      $('#tour-location').textContent = place.name;
    } else if (!busy && elapsed - tour.lastFrame > 90) {
      const step = (elapsed - tour.lastFrame) / 1000;
      tour.lastFrame = elapsed;
      gestures.automate('tour', { type: 'setCamera', camera: zoomView(view, view.zoom + Math.min(.2, step) * .07) }, true);
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

function bindCanvas() {
  const surface = $('#fractal-surface');
  surface.addEventListener('wheel', event => {
    event.preventDefault();
    const [x, y] = pointAt(event.clientX, event.clientY);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    navigateGrouped(zoomView(view, view.zoom - Math.max(-160, Math.min(160, delta)) * .0015, x, y));
  }, { passive: false });
  surface.addEventListener('dblclick', event => { const [x, y] = pointAt(event.clientX, event.clientY); navigate(zoomView(view, view.zoom + Math.log10(4), x, y), true, 'jump'); });
  const pointers = new Map();
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    stopTour(); gestures.settle(); canvas.focus({ preventScroll: true }); surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.classList.add('dragging');
  });
  surface.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      navigate(moveView(view, (old.x - event.clientX) / innerWidth, (event.clientY - old.y) / innerWidth), true, 'navigation-drag');
    } else if (pointers.size === 2) {
      const after = [...pointers.values()];
      const distance = values => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      const mid = values => ({ x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 });
      const previous = mid(before), current = mid(after);
      const [x, y] = pointAt(previous.x, previous.y);
      const next = zoomView(view, view.zoom + Math.log10(Math.max(1, distance(after)) / Math.max(1, distance(before))), x, y);
      navigate(moveView(next, (previous.x - current.x) / innerWidth, (current.y - previous.y) / innerWidth), true, 'navigation-drag');
    }
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(event, e => {
    pointers.delete(e.pointerId);
    if (!pointers.size) { canvas.classList.remove('dragging'); commitGesture('navigation-drag'); }
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); $('#render-status').textContent = 'Graphics paused'; toast('The graphics device paused. Restoring the view…');
  });
  canvas.addEventListener('webglcontextrestored', () => { renderer.destroy(); renderer = makeRenderer(); requestRender(); });
}
bindCanvas();
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

function renderPlaces() {
  $('#saved-count').textContent = saved.length;
  $('#destination-grid').classList.toggle('saved-places', savedTab);
  $('#destination-grid').replaceChildren();
  if (savedTab && !saved.length) {
    const empty = document.createElement('div'); empty.className = 'empty-saved'; empty.textContent = 'Find a place you love. Press B to keep it here.'; $('#destination-grid').append(empty); return;
  }
  (savedTab ? saved : PLACES).forEach((place, index) => {
    const button = document.createElement('button');
    button.className = `destination-card${place.id === activePlace ? ' active' : ''}`;
    button.dataset.place = place.id;
    const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.draggable = false;
    image.src = savedTab ? place.thumbnail || '/assets/seahorse.png' : `/assets/${place.id}.png`;
    // Thumbnails are real renders, generated by scripts/thumbnails.mjs.
    image.onerror = () => { image.style.display = 'none'; };
    button.append(image);
    const fields = [['place-number', String(index + 1).padStart(2, '0')], ['place-arrow', '↗'], ['place-name', place.name], ['place-description', place.description || 'YOUR OWN LITTLE INFINITY']];
    for (const [className, text] of fields) { const span = document.createElement('span'); span.className = className; span.textContent = text; button.append(span); }
    button.onclick = () => {
      stopTour();
      if (savedTab) {
        try { applyAction([{ type: 'restoreScene', scene: createPlaneScene({ view: place.view, settings: place.settings }) }], 'restore'); activePlace = place.id; renderPlaces(); }
        catch (error) { toast(`This discovery could not be opened: ${error.message}`); }
      } else goTo(place, place.palette, place.id);
    };
    if (savedTab) {
      const wrapper = document.createElement('div'); wrapper.className = 'saved-wrapper'; wrapper.append(button);
      const remove = document.createElement('button'); remove.className = 'delete-save'; remove.innerHTML = icon('close'); remove.setAttribute('aria-label', `Delete ${place.name}`);
      remove.onclick = () => { saved = saved.filter(item => item.id !== place.id); persistSaved(); renderPlaces(); toast('Discovery removed.'); };
      wrapper.append(remove); $('#destination-grid').append(wrapper);
    } else $('#destination-grid').append(button);
  });
}
function persistSaved() {
  try { localStorage.setItem('atlas.discoveries', JSON.stringify(saved)); return true; }
  catch { toast('Browser storage is unavailable or full. Use Capture → Save location to keep this view.'); return false; }
}
function saveDiscovery() {
  if (!rendered || busy || dirty) { toast('Let the current view finish, then save it.'); return; }
  const thumbnailCanvas = document.createElement('canvas'); thumbnailCanvas.width = 320; thumbnailCanvas.height = 160;
  thumbnailCanvas.getContext('2d').drawImage(canvas, 0, 0, 320, 160);
  const base = PLACES.find(p => p.id === activePlace)?.name || 'Discovery';
  const item = { id: crypto.randomUUID(), name: `${base} ${String(saved.length + 1).padStart(2, '0')}`, view: { ...view }, settings: { ...settings }, thumbnail: thumbnailCanvas.toDataURL('image/jpeg', .75) };
  saved.unshift(item);
  if (!persistSaved()) { saved.shift(); return; }
  renderPlaces(); toast('Discovery saved. Find it in Your discoveries.');
}
$('#bookmark-button').onclick = saveDiscovery;
for (const id of ['places-tab', 'saved-tab']) $(`#${id}`).onclick = () => {
  savedTab = id === 'saved-tab';
  for (const tab of ['places-tab', 'saved-tab']) { const active = tab === id; $(`#${tab}`).classList.toggle('active', active); $(`#${tab}`).setAttribute('aria-pressed', String(active)); }
  renderPlaces();
};

function showDialog(id) { stopTour(); $(id).showModal(); }
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
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
$('#share-button').onclick = async () => {
  commitGesture();
  const url = `${location.origin}${location.pathname}${encodeShareHash(sceneHistory.snapshot().scene)}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('View link copied. Every coordinate digit is included.'); }
  catch { toast('Your view is in the address bar. Copy that URL to share it.'); }
};
// A link opened during an investigation: a valid scene is a whole-scene restoration;
// anything else is reported and changes neither the scene nor either history.
addEventListener('hashchange', () => {
  const link = decodeShareHash(location.hash);
  if (link.kind === 'scene' && link.scene.workspace === 'plane') { stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene: link.scene }], 'restore'); renderPlaces(); }
  else if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Your view is unchanged.`);
});

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
$('#download-image').onclick = async () => {
  if (captureBusy) return;
  const button = $('#download-image'); button.disabled = true;
  $('#capture-status').textContent = 'Rendering your image…';
  stopTour();
  while (busy) await new Promise(resolve => setTimeout(resolve, 40));
  captureBusy = true;
  const snapshot = { ...view }, config = renderSettings();
  const width = $('#export-size').value === 'current' ? canvas.width : Number($('#export-size').value);
  const height = Math.max(1, Math.round(width * innerHeight / innerWidth));
  try {
    await renderer.render(snapshot, config, width, height, true);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image export is unavailable.');
    download(blob, `atlas-${Math.floor(snapshot.zoom)}-decades.png`);
    $('#capture-status').textContent = `Saved ${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} pixels. Save the location below to return here.`;
  } catch (error) { $('#capture-status').textContent = error.message; }
  finally { captureBusy = false; button.disabled = false; requestRender(); }
};

addEventListener('keydown', event => {
  if (event.target.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  const historyKey = (event.ctrlKey || event.metaKey) && !event.altKey
    ? (key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null)
    : event.altKey && !event.ctrlKey && !event.metaKey ? ({ arrowleft: 'back', arrowright: 'forward' })[key] : null;
  if (historyKey) { event.preventDefault(); historyStep(historyKey); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const actions = {
    '+': () => navigateGrouped(zoomView(view, view.zoom + Math.log10(2))), '=': () => navigateGrouped(zoomView(view, view.zoom + Math.log10(2))),
    '-': () => navigateGrouped(zoomView(view, view.zoom - Math.log10(2))),
    arrowleft: () => navigateGrouped(moveView(view, -.08, 0)), arrowright: () => navigateGrouped(moveView(view, .08, 0)),
    arrowup: () => navigateGrouped(moveView(view, 0, .08)), arrowdown: () => navigateGrouped(moveView(view, 0, -.08)),
    r: home, h: cinema, b: saveDiscovery, s: () => showDialog('#capture-dialog'), '?': () => showDialog('#help-dialog'),
    escape: () => { document.body.classList.remove('cinema'); stopTour(); },
  };
  if (actions[key]) { event.preventDefault(); actions[key](); }
});
addEventListener('resize', () => requestRender(true));
addEventListener('pagehide', () => renderer.destroy());

// Small inspection API for numerical and browser regression tests.
class IdleTimeoutError extends Error {
  constructor(ms, state) { super(`ATLAS did not become idle within ${ms} ms (${JSON.stringify(state)}).`); this.name = 'IdleTimeoutError'; this.code = 'ATLAS_IDLE_TIMEOUT'; }
}
window.atlas = {
  get graphics() { return { ...renderer.diagnostics }; },
  get view() { return { ...view }; }, get settings() { return renderSettings(); }, get renderer() { return renderer; },
  get rendered() { return rendered; }, goTo,
  get scene() { return sceneHistory.snapshot().scene; },
  get history() { const { scene, ...rest } = sceneHistory.snapshot(); return rest; },
  undo: () => historyStep('undo'), redo: () => historyStep('redo'), back: () => historyStep('back'), forward: () => historyStep('forward'),
  async whenIdle({ timeoutMs = 60000 } = {}) {
    const deadline = performance.now() + timeoutMs;
    while (busy || dirty || captureBusy) {
      if (performance.now() > deadline) throw new IdleTimeoutError(timeoutMs, { busy, dirty, captureBusy });
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  },
};
syncControls(); renderPlaces(); updateHistoryControls(); requestRender();
