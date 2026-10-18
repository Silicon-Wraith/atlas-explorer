import { GpuRenderer, CpuRenderer } from './renderer.js';
import { INITIAL_VIEW, moveView, zoomView, viewTransform, precisionFor, validateView } from './math.js';
import { PALETTES } from './palettes.js';
import { PLACES } from './places.js';
import { icon, installIcons } from './icons.js';

const $ = selector => document.querySelector(selector);
installIcons();
let canvas = $('#fractal');
let renderer;
let view = { ...INITIAL_VIEW };
let settings = { palette: 'ember', phase: .11, frequency: 1, relief: 1, detail: 1, iterations: 1024 };
let activePlace = 'seahorse';
let busy = false, dirty = false, toastTimer, displayedView;
let rendered = 0, requestVersion = 0, cycle = false, tour = null, captureBusy = false;
let saved = [], savedTab = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const detailLevels = [512, 1024, 2048, 4096, 8192, 16384];

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

function loadHash() {
  if (location.hash.length < 2) return;
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    if (!params.has('re')) return;
    view = validateView({ re: params.get('re'), im: params.get('im'), zoom: Number(params.get('z')) });
    settings = validatedSettings(Object.fromEntries(params), settings);
    activePlace = '';
  } catch { toast('That location link could not be read. Opening Seahorse valley.'); }
}

function validatedSettings(input = {}, defaults = settings) {
  const result = { ...defaults };
  if (PALETTES.some(p => p.id === input.palette)) result.palette = input.palette;
  for (const [key, min, max] of [['phase', 0, 1], ['frequency', .2, 2.5], ['relief', 0, 1], ['detail', 0, 5]]) {
    if (input[key] !== undefined && Number.isFinite(Number(input[key]))) result[key] = Math.min(max, Math.max(min, Number(input[key])));
  }
  result.detail = Math.round(result.detail);
  return result;
}
loadHash();

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
  return { ...settings, iterations: detailLevels[settings.detail] + Math.max(0, Math.ceil((view.zoom - 3) * 32)) };
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
function goTo(next, palette, place = '') {
  view = validateView(next); activePlace = place;
  if (Number.isInteger(next.detail)) settings.detail = Math.min(5, Math.max(0, next.detail));
  if (palette) settings.palette = palette;
  syncControls(); renderPlaces(); requestRender();
}
function navigate(next, interactive = true) {
  stopTour(); activePlace = ''; view = next; requestRender(interactive);
  document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
}
function pointAt(clientX, clientY) {
  return [(clientX - innerWidth / 2) / innerWidth, (innerHeight / 2 - clientY) / innerWidth];
}

$('#palette-grid').innerHTML = PALETTES.map(p => `<button class="palette-swatch" data-palette="${p.id}" title="${p.name}" aria-label="${p.name} palette" aria-pressed="false" style="background:linear-gradient(145deg,${p.stops.slice(1,6).join(',')})"></button>`).join('');
$('#palette-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-palette]');
  if (!button) return;
  settings.palette = button.dataset.palette; syncControls(); renderer.color(settings);
});
$('#phase').addEventListener('input', event => { settings.phase = event.target.value / 1000; styleRange(event.target); renderer.color(settings); });
$('#frequency').addEventListener('input', event => { settings.frequency = event.target.value / 100; syncControls(); renderer.color(settings); });
$('#detail').addEventListener('input', event => { settings.detail = Number(event.target.value); styleRange(event.target); requestRender(); });
$('#relief').addEventListener('change', event => { settings.relief = Number(event.target.checked); renderer.color(settings); });
$('#cycle-button').onclick = () => {
  cycle = !cycle; $('#cycle-button').setAttribute('aria-pressed', String(cycle));
  if (cycle && !tour) requestAnimationFrame(animate);
};
let lastAnimation = 0;
function animate(time) {
  const dt = Math.min(.08, (time - (lastAnimation || time)) / 1000); lastAnimation = time;
  if (cycle) { settings.phase = (settings.phase + dt * .025) % 1; $('#phase').value = Math.round(settings.phase * 1000); styleRange($('#phase')); if (!captureBusy) renderer.color(settings); }
  if (tour && !captureBusy) {
    const elapsed = time - tour.started;
    if (elapsed > 18000) {
      tour.index = (tour.index + 1) % PLACES.length; tour.started = time; tour.lastFrame = 0;
      const place = PLACES[tour.index]; goTo(place, place.palette, place.id);
      $('#tour-location').textContent = place.name;
    } else if (!busy && elapsed - tour.lastFrame > 90) {
      const step = (elapsed - tour.lastFrame) / 1000;
      tour.lastFrame = elapsed;
      view = zoomView(view, view.zoom + Math.min(.2, step) * .07); requestRender(true);
    }
  }
  if (cycle || tour) requestAnimationFrame(animate); else lastAnimation = 0;
}
function startTour() {
  if (tour) { stopTour(); return; }
  tour = { index: 1, started: performance.now(), lastFrame: 0 };
  goTo(PLACES[1], PLACES[1].palette, PLACES[1].id);
  $('#tour-status').hidden = false; $('#tour-location').textContent = PLACES[1].name;
  $('#tour-button').innerHTML = `${icon('pause')} Pause the journey <span class="arrow">↗</span>`;
  if (reducedMotion) toast('Journey started. Use Pause at any time to stop motion.');
  if (!cycle) requestAnimationFrame(animate);
}
function stopTour() {
  tour = null; $('#tour-status').hidden = true;
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
    navigate(zoomView(view, view.zoom - Math.max(-160, Math.min(160, delta)) * .0015, x, y));
  }, { passive: false });
  surface.addEventListener('dblclick', event => { const [x, y] = pointAt(event.clientX, event.clientY); navigate(zoomView(view, view.zoom + Math.log10(4), x, y)); });
  const pointers = new Map();
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    stopTour(); canvas.focus({ preventScroll: true }); surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.classList.add('dragging');
  });
  surface.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      navigate(moveView(view, (old.x - event.clientX) / innerWidth, (event.clientY - old.y) / innerWidth));
    } else if (pointers.size === 2) {
      const after = [...pointers.values()];
      const distance = values => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      const mid = values => ({ x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 });
      const previous = mid(before), current = mid(after);
      const [x, y] = pointAt(previous.x, previous.y);
      const next = zoomView(view, view.zoom + Math.log10(Math.max(1, distance(after)) / Math.max(1, distance(before))), x, y);
      navigate(moveView(next, (previous.x - current.x) / innerWidth, (current.y - previous.y) / innerWidth));
    }
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(event, e => {
    pointers.delete(e.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); $('#render-status').textContent = 'Graphics paused'; toast('The graphics device paused. Restoring the view…');
  });
  canvas.addEventListener('webglcontextrestored', () => { renderer.destroy(); renderer = makeRenderer(); requestRender(); });
}
bindCanvas();
$('#zoom-in').onclick = () => navigate(zoomView(view, view.zoom + Math.log10(2)));
$('#zoom-out').onclick = () => navigate(zoomView(view, view.zoom - Math.log10(2)));
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
      if (savedTab) { settings = validatedSettings(place.settings); goTo(place.view, settings.palette, place.id); }
      else goTo(place, place.palette, place.id);
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
    const next = validateView({ re: $('#input-re').value.trim(), im: $('#input-im').value.trim(), zoom: Number($('#input-zoom').value) });
    goTo(next); $('#coordinate-dialog').close();
  } catch (error) { $('#coordinate-error').textContent = error.message; }
};
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
$('#share-button').onclick = async () => {
  const params = new URLSearchParams({ re: view.re, im: view.im, z: String(view.zoom), palette: settings.palette, phase: String(settings.phase), frequency: String(settings.frequency), relief: String(settings.relief), detail: String(settings.detail) });
  const url = `${location.origin}${location.pathname}#${params}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('View link copied. Every coordinate digit is included.'); }
  catch { toast('Your view is in the address bar. Copy that URL to share it.'); }
};
addEventListener('hashchange', () => { loadHash(); syncControls(); renderPlaces(); requestRender(); });

function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const locationData = () => ({ application: 'ATLAS', version: 1, view: { ...view }, settings: { ...settings } });
$('#download-location').onclick = () => { download(new Blob([JSON.stringify(locationData(), null, 2)], { type: 'application/json' }), 'atlas-discovery.json'); $('#capture-status').textContent = 'Location saved, including all coordinate digits.'; };
$('#import-location').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('This location file is too large.');
    const data = JSON.parse(await file.text()); const next = validateView(data.view);
    settings = validatedSettings(data.settings); goTo(next); $('#capture-dialog').close(); toast('Welcome back to your discovery.');
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
  if (event.target.matches('input, textarea, select') || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  const actions = {
    '+': () => navigate(zoomView(view, view.zoom + Math.log10(2))), '=': () => navigate(zoomView(view, view.zoom + Math.log10(2))),
    '-': () => navigate(zoomView(view, view.zoom - Math.log10(2))),
    arrowleft: () => navigate(moveView(view, -.08, 0)), arrowright: () => navigate(moveView(view, .08, 0)),
    arrowup: () => navigate(moveView(view, 0, .08)), arrowdown: () => navigate(moveView(view, 0, -.08)),
    r: home, h: cinema, b: saveDiscovery, s: () => showDialog('#capture-dialog'), '?': () => showDialog('#help-dialog'),
    escape: () => { document.body.classList.remove('cinema'); stopTour(); },
  };
  if (actions[key]) { event.preventDefault(); actions[key](); }
});
addEventListener('resize', () => requestRender(true));
addEventListener('pagehide', () => renderer.destroy());

// Small inspection API for numerical and browser regression tests.
window.atlas = {
  get graphics() { return { ...renderer.diagnostics }; },
  get view() { return { ...view }; }, get settings() { return renderSettings(); }, get renderer() { return renderer; },
  get rendered() { return rendered; }, goTo,
  async whenIdle() { while (busy || dirty || captureBusy) await new Promise(resolve => setTimeout(resolve, 30)); },
};
syncControls(); renderPlaces(); requestRender();
