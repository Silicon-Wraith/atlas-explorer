// Project 1a workflows in a real browser (SwiftShader WebGL, headless): native scenes,
// undo and camera history, startup and invalid links, the immutable export and a context loss
// during one (T08). GREEN only: never part of a RED run.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';
import { cleanupWorkflow } from './support/workflow-cleanup.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('workflow');
await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const reportPath = 'artifacts/workflow-report.json';
const report = [], errors = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const INITIAL = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };
let server, browser, context;
const contexts = [];

async function open(context, hash = '') {
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${url}/${hash}`, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  return page;
}
const state = page => ev(page, () => ({ scene: atlas.scene, history: atlas.history, rendered: atlas.rendered }));
// Every keyboard and mouse call is bounded (T00 fix round 1; the no-launch suite checks this statically).
const press = (page, key) => within(page.keyboard.press(key), LIMITS.operation, `keyboard.press ${key}`);
const VIEW_B = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4.2 };
const VIEW_C = { re: '0.276', im: '0.008', zoom: 2.4 };
const VIEW_D = { re: '-1.762', im: '0', zoom: 1.6 };

// Installed on every context that runs the export checks: while `__holdWorkers` is set, messages
// to workers (reference orbits, CPU tiles) are queued until `__releaseWorkers()`.
const holdWorkersScript = () => {
  const post = Worker.prototype.postMessage;
  window.__heldWorkerMessages = [];
  Worker.prototype.postMessage = function (...args) {
    if (window.__holdWorkers) { window.__heldWorkerMessages.push(() => post.apply(this, args)); return; }
    return post.apply(this, args);
  };
  window.__releaseWorkers = () => { window.__holdWorkers = false; const held = window.__heldWorkerMessages.splice(0); held.forEach(send => send()); return held.length; };
};

// One export of the current viewport of `view`. With `withEdits`, three phases are witnessed
// before the page edits the live scene: admission held by a hook; the export render pending on a
// held worker message (the view is switched away and back first, so the export misses the
// renderer's reference cache, and nothing has been published); encoding held by a hook.
async function exportViewport(page, view, withEdits) {
  if (withEdits) await within(page.evaluate(async other => { atlas.goTo(other); await atlas.whenIdle(); }, VIEW_C), LIMITS.deep, 'move away to empty the reference cache');
  await ev(page, ({ target, edits }) => {
    window.__exportStages = [];
    const holds = {};
    window.__releaseExport = name => holds[name]?.();
    atlas.setExportHooks({
      stage(name) { window.__exportStages.push(name); },
      hold: name => (edits && (name === 'admission' || name === 'encoding') ? new Promise(resolve => { holds[name] = resolve; }) : undefined),
    });
    document.querySelector('#export-size').value = 'current';
    atlas.goTo(target);
    window.__holdWorkers = edits;
    document.querySelector('#download-image').click();
  }, { target: view, edits: withEdits });
  if (withEdits) {
    await page.waitForFunction(() => window.__exportStages.includes('admission'), null, { timeout: LIMITS.operation });
    await ev(page, other => { document.querySelector('[data-palette="aurora"]').click(); atlas.goTo(other); window.__releaseExport('admission'); }, VIEW_C);
    await page.waitForFunction(() => window.__exportStages.includes('render-submitted') && window.__heldWorkerMessages.length > 0, null, { timeout: LIMITS.operation });
    const pending = await ev(page, () => ({ stages: [...window.__exportStages], lastExport: atlas.lastExport }));
    assert.ok(!pending.stages.includes('encoding'), 'the export render is still pending on its held worker message');
    await ev(page, other => { document.querySelector('[data-palette="rose"]').click(); atlas.goTo(other); return window.__releaseWorkers(); }, VIEW_D);
    await page.waitForFunction(() => window.__exportStages.includes('encoding'), null, { timeout: LIMITS.deep });
    await ev(page, other => { document.querySelector('[data-palette="ocean"]').click(); atlas.goTo(other); window.__releaseExport('encoding'); }, VIEW_D);
  }
  await page.waitForFunction(() => window.__exportStages.includes('finished'), null, { timeout: LIMITS.deep });
  const result = await ev(page, () => ({ lastExport: atlas.lastExport, scene: atlas.scene, stages: window.__exportStages }), undefined, 'export result');
  await ev(page, () => atlas.setExportHooks(null));
  await idleWithin(page, LIMITS.deep);
  return result;
}

// The same export with and without edits during admission, rendering and encoding must decode to
// identical RGBA pixels (compared in the page), and must report the scene captured at the click.
// The export's pixels are read back, so this comparison is truthful about the image itself.
async function checkExportImmutability(page, label) {
  await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_B), LIMITS.deep, 'go to B');
  const exportedScene = await ev(page, () => atlas.scene);
  const baseline = await exportViewport(page, VIEW_B, false);
  await ev(page, async () => { window.__baselineImage = await atlas.lastExportImageData(); }, undefined, 'decode baseline', LIMITS.deep);
  const raced = await exportViewport(page, VIEW_B, true);
  assert.deepEqual(raced.stages, ['reserved', 'admission', 'render-submitted', 'encoding', 'finished'], `${label}: every stage was reached`);
  for (const result of [baseline, raced]) {
    assert.equal(result.lastExport.outcome, 'completed', label);
    assert.equal(result.lastExport.report.outcome, 'completed');
    assert.equal(result.lastExport.renderReport.outcome, 'completed');
    assert.deepEqual(result.lastExport.scene, exportedScene, `${label}: the export reports the scene captured at the click`);
  }
  const pixels = await ev(page, async () => {
    const before = window.__baselineImage, after = await atlas.lastExportImageData();
    let differing = 0;
    for (let i = 0; i < before.data.length; i++) if (before.data[i] !== after.data[i]) differing++;
    return { width: [before.width, after.width], height: [before.height, after.height], samples: after.data.length / 4, differing };
  }, undefined, 'compare pixels', LIMITS.deep);
  assert.equal(pixels.width[0], pixels.width[1]); assert.equal(pixels.height[0], pixels.height[1]);
  assert.ok(pixels.samples > 0);
  assert.equal(pixels.differing, 0, `${label}: edits during admission, rendering and encoding changed the exported pixels`);
  assert.deepEqual(raced.scene.camera, VIEW_D, 'the live scene kept the later edits');
  assert.equal(raced.scene.appearance.palette, 'ocean');
}

// A context loss while encoding is held, in both orders of restoration and lease release. The
// loss and restoration events are witnessed; the export is interrupted, no render is adopted and
// no report is published while the renderer is lost (application-side facts: atlas.rendered and
// atlas.lastReport), the replacement waits for the lease, and live rendering resumes on one WebGL
// renderer shared by the workspace and the adapter (never a silent CPU fallback).
async function checkContextLossDuringExport(page, restoreFirst) {
  await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_B), LIMITS.deep, 'go to B');
  await ev(page, () => {
    window.__contextEvents = [];
    if (!window.__contextListening) {
      window.__contextListening = true;
      const canvas = document.querySelector('#fractal');
      canvas.addEventListener('webglcontextlost', () => window.__contextEvents.push('lost'));
      canvas.addEventListener('webglcontextrestored', () => window.__contextEvents.push('restored'));
    }
    window.__exportStages = [];
    const holds = {};
    window.__releaseExport = name => holds[name]?.();
    atlas.setExportHooks({ stage(name) { window.__exportStages.push(name); }, hold: name => (name === 'encoding' ? new Promise(resolve => { holds[name] = resolve; }) : undefined) });
    document.querySelector('#export-size').value = 'current';
    document.querySelector('#download-image').click();
  });
  await page.waitForFunction(() => window.__exportStages.includes('encoding'), null, { timeout: LIMITS.deep });
  await ev(page, () => { window.__loseContext = atlas.renderer.gl.getExtension('WEBGL_lose_context'); window.__loseContext.loseContext(); });
  await page.waitForFunction(() => window.__contextEvents.includes('lost'), null, { timeout: LIMITS.operation });
  if (restoreFirst) {
    await ev(page, () => window.__loseContext.restoreContext());
    await page.waitForFunction(() => window.__contextEvents.includes('restored'), null, { timeout: LIMITS.operation });
  }
  const beforeRelease = await ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null }));
  await ev(page, () => window.__releaseExport('encoding'));
  await page.waitForFunction(() => window.__exportStages.includes('finished'), null, { timeout: LIMITS.deep });
  await ev(page, () => atlas.setExportHooks(null));
  if (!restoreFirst) {
    await page.waitForTimeout(500);
    const gap = await ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null, events: [...window.__contextEvents] }));
    assert.deepEqual(gap, { ...beforeRelease, events: ['lost'] }, 'nothing is adopted or published while the context is lost');
    await ev(page, () => window.__loseContext.restoreContext());
    await page.waitForFunction(() => window.__contextEvents.includes('restored'), null, { timeout: LIMITS.operation });
  }
  await page.waitForFunction(count => atlas.rendered > count, beforeRelease.rendered, { timeout: LIMITS.deep });
  const after = await ev(page, () => ({ outcome: atlas.lastExport.outcome, report: atlas.lastExport.report.outcome, deviceLost: atlas.lastExport.report.deviceLost, consistent: atlas.rendererConsistent, webgl: !!atlas.renderer.gl, exportButtonBusy: document.querySelector('#download-image').disabled, events: window.__contextEvents }));
  assert.deepEqual(after, { outcome: 'interrupted', report: 'interrupted', deviceLost: true, consistent: true, webgl: true, exportButtonBusy: false, events: ['lost', 'restored'] });
}

try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  contexts.push(context);
  await context.addInitScript(holdWorkersScript);
  const page = await open(context);

  const fresh = await state(page);
  assert.equal(fresh.scene.workspace, 'plane');
  assert.deepEqual(fresh.scene.camera, INITIAL);
  assert.equal(fresh.history.canBack, false);
  assert.equal(fresh.history.canUndo, false);
  pass('Fresh start opens Plane at the default view');

  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await idleWithin(page);
  const zoomed = await state(page);
  assert.equal(zoomed.scene.appearance.palette, 'aurora');
  await press(page, 'Control+z');
  const undone = await state(page);
  assert.equal(undone.scene.appearance.palette, 'ember');
  assert.deepEqual(undone.scene.camera, zoomed.scene.camera, 'undoing the palette keeps the camera');
  assert.equal(undone.rendered, zoomed.rendered, 'an appearance undo recolors without recalculating');
  pass('Palette edit, navigation and undo keep the camera');

  const urlBefore = page.url();
  await ev(page, () => { window.__atlasPageMarker = 'still-here'; });
  await press(page, 'Alt+ArrowLeft');
  await idleWithin(page);
  assert.equal(page.url(), urlBefore, 'Alt+Left must not navigate the browser');
  assert.equal(await ev(page, () => window.__atlasPageMarker), 'still-here', 'the page was not reloaded or replaced');
  const back = await state(page);
  assert.deepEqual(back.scene.camera, INITIAL);
  assert.equal(back.scene.appearance.palette, 'ember', 'Back moves only the camera');
  await press(page, 'Alt+ArrowRight');
  await idleWithin(page);
  assert.deepEqual((await state(page)).scene.camera, zoomed.scene.camera);
  pass('Camera back and forward restore poses without touching content');

  const beforeEntry = await state(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('1e1000000000000'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('0');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  assert.match(await page.locator('#coordinate-error').textContent(), /budget/);
  assert.equal(await page.locator('#input-re').inputValue(), '1e1000000000000', 'the requested text is preserved');
  await press(page, 'Escape');
  const afterEntry = await state(page);
  assert.deepEqual(afterEntry.scene, beforeEntry.scene);
  assert.deepEqual(afterEntry.history, beforeEntry.history, 'neither history changes');
  pass('An oversized coordinate is rejected before it is expanded');

  const beforeDrag = await state(page);
  await page.locator('#phase').scrollIntoViewIfNeeded();
  const slider = await page.locator('#phase').boundingBox();
  await within(page.mouse.move(slider.x + slider.width * 0.2, slider.y + slider.height / 2), LIMITS.operation, 'mouse.move');
  await within(page.mouse.down(), LIMITS.operation, 'mouse.down');
  await within(page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 6 }), LIMITS.operation, 'mouse.move');
  await within(page.mouse.up(), LIMITS.operation, 'mouse.up');
  const afterDrag = await state(page);
  assert.notEqual(afterDrag.scene.appearance.phase, beforeDrag.scene.appearance.phase);
  assert.equal(afterDrag.history.undoDepth, beforeDrag.history.undoDepth + 1, 'one drag is one undo entry');
  await ev(page, () => document.activeElement?.blur());
  await press(page, 'Control+z');
  assert.equal((await state(page)).scene.appearance.phase, beforeDrag.scene.appearance.phase);
  pass('A slider drag is one undo entry');

  const beforeWheel = await state(page);
  await within(page.evaluate(async () => {
    const surface = document.querySelector('#fractal-surface');
    for (let i = 0; i < 5; i++) {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, clientX: 640, clientY: 360, bubbles: true, cancelable: true }));
      await new Promise(resolveStep => setTimeout(resolveStep, 15));
    }
    await new Promise(resolveQuiet => setTimeout(resolveQuiet, 400));
    await atlas.whenIdle();
  }), LIMITS.operation, 'wheel burst');
  const afterWheel = await state(page);
  assert.ok(afterWheel.scene.camera.zoom > beforeWheel.scene.camera.zoom);
  assert.equal(afterWheel.history.camera.length, beforeWheel.history.camera.index + 2, 'a wheel burst is one camera-history entry');
  assert.equal(afterWheel.history.undoDepth, beforeWheel.history.undoDepth, 'navigation never adds an undo entry');
  pass('A wheel burst is one camera-history entry');

  const before = await state(page);
  await ev(page, () => { location.hash = '#scene=@@@'; });
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('visible'), null, { timeout: LIMITS.operation });
  assert.match(await page.locator('#toast').textContent(), /unchanged/);
  const after = await state(page);
  assert.deepEqual(after.scene, before.scene);
  assert.deepEqual(after.history, before.history, 'neither history changes');
  pass('An invalid link during an investigation changes nothing');

  await checkExportImmutability(page, 'WebGL');
  pass('An edit during a WebGL export does not change the exported image');
  await checkContextLossDuringExport(page, true);
  await checkContextLossDuringExport(page, false);
  pass('A context loss during an export interrupts it and live rendering resumes');

  const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  contexts.push(cpuContext);
  await cpuContext.addInitScript(holdWorkersScript);
  await cpuContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  const cpu = await open(cpuContext);
  assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
  await checkExportImmutability(cpu, 'CPU');
  pass('An edit during a CPU export does not change the exported image');

  const earlier = await open(context, '#re=-2&im=0&z=40&palette=rose');
  assert.deepEqual((await state(earlier)).scene.camera, INITIAL);
  assert.match(await earlier.locator('#toast').textContent(), /earlier ATLAS format/);
  pass('An earlier-format link opens fresh-start Plane with a notice');

  // Pointer lifecycle (fix round 1, Codex findings 2 and 1). A held mouse drag, then Back: the drag
  // settles as a pose, the previous pose is restored, and the still-held pointer navigates no more.
  const beforeHold = await state(page);
  await within(page.mouse.move(600, 420), LIMITS.operation, 'mouse.move'); await within(page.mouse.down(), LIMITS.operation, 'mouse.down');
  await within(page.mouse.move(650, 450, { steps: 5 }), LIMITS.operation, 'mouse.move');
  await idleWithin(page);
  assert.notEqual((await state(page)).scene.camera.re, beforeHold.scene.camera.re, 'the held drag is previewing');
  await press(page, 'Alt+ArrowLeft');
  await idleWithin(page);
  const restored = await state(page);
  assert.deepEqual(restored.scene.camera, beforeHold.scene.camera, 'Back settles the held drag as a pose and restores the one before it');
  assert.equal(restored.history.canForward, true, 'the settled drag is the forward pose');
  await within(page.mouse.move(700, 500, { steps: 5 }), LIMITS.operation, 'mouse.move');
  await idleWithin(page);
  assert.deepEqual((await state(page)).scene.camera, beforeHold.scene.camera, 'the still-held pointer no longer navigates');
  await within(page.mouse.up(), LIMITS.operation, 'mouse.up');
  await idleWithin(page);
  const released = await state(page);
  assert.deepEqual(released.scene.camera, beforeHold.scene.camera, 'release changes nothing');
  assert.deepEqual(released.history.camera, restored.history.camera, 'release records no pose');
  assert.equal(released.history.canForward, true, 'the forward branch survives');
  assert.equal(released.history.undoDepth, beforeHold.history.undoDepth);
  pass('Back stops captured navigation and keeps the forward branch');

  // A second finger joining a drag continues the same gesture: one camera-history entry at release.
  const touchContext = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true }), LIMITS.launch, 'newContext'));
  contexts.push(touchContext);
  const touchPage = await open(touchContext);
  const touch = await within(touchContext.newCDPSession(touchPage), LIMITS.operation, 'newCDPSession');
  const touchEvent = (type, touchPoints) => within(touch.send('Input.dispatchTouchEvent', { type, touchPoints }), LIMITS.operation, `touch ${type}`);
  const beforePinch = await state(touchPage);
  await touchEvent('touchStart', [{ x: 600, y: 500, id: 1 }]);
  await touchEvent('touchMove', [{ x: 640, y: 520, id: 1 }]);
  await touchEvent('touchStart', [{ x: 640, y: 520, id: 1 }, { x: 800, y: 520, id: 2 }]);
  await touchEvent('touchMove', [{ x: 620, y: 520, id: 1 }, { x: 840, y: 520, id: 2 }]);
  await touchEvent('touchEnd', []);
  await idleWithin(touchPage);
  const afterPinch = await state(touchPage);
  assert.notEqual(afterPinch.scene.camera.re, beforePinch.scene.camera.re, 'the first finger dragged');
  assert.ok(afterPinch.scene.camera.zoom > beforePinch.scene.camera.zoom, 'the second finger pinched');
  assert.equal(afterPinch.history.camera.length, beforePinch.history.camera.length + 1, 'a drag that gains a finger is one camera-history entry');
  assert.equal(afterPinch.history.undoDepth, beforePinch.history.undoDepth, 'navigation never adds an undo entry');
  await within(touch.detach(), LIMITS.operation, 'touch.detach');
  pass('A second finger joins the drag without committing it');

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  process.exitCode = 1;
  console.error(error);
} finally {
  // Under SwiftShader the GPU draws are queued: render() and atlas.whenIdle() return before the
  // frames are computed (about a second each at this size), and closing the browser waits for that
  // backlog, which overran the 5 s cleanup bound (T05 report). A one-pixel readback drains each
  // page's queue first (gl.finish does not, under ANGLE on SwiftShader), under the deep-render bound.
  // A drain that fails is recorded in the report and fails the suite; the bounded closes still run
  // (fix round 1, Codex finding 3; tests in tests/unit/no-launch.test.js).
  const failed = await cleanupWorkflow({
    pages: contexts.flatMap(open => open.pages()),
    drain: open => ev(open, () => {
      const gl = window.atlas?.renderer?.gl; if (!gl) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }, undefined, 'drain GPU work', LIMITS.deep),
    report, writeReport: entries => writeFile(reportPath, JSON.stringify(entries, null, 2)),
    closeAll: async () => { for (const open of contexts) await closeWithin(open, 'context'); await closeWithin(browser, 'browser'); server?.kill('SIGTERM'); },
  });
  if (failed) process.exitCode = 1;
}
