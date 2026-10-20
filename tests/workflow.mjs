// Project 1a workflows in a real browser (SwiftShader WebGL, headless): native scenes,
// undo and camera history, startup and invalid links. GREEN only: never part of a RED run.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

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

try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
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

  const earlier = await open(context, '#re=-2&im=0&z=40&palette=rose');
  assert.deepEqual((await state(earlier)).scene.camera, INITIAL);
  assert.match(await earlier.locator('#toast').textContent(), /earlier ATLAS format/);
  pass('An earlier-format link opens fresh-start Plane with a notice');

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  // Under SwiftShader the GPU draws are queued: render() and atlas.whenIdle() return before the
  // frames are computed (about a second each at this size), and closing the browser waits for that
  // backlog, which overran the 5 s cleanup bound (T05 report). A one-pixel readback drains each
  // page's queue first (gl.finish does not, under ANGLE on SwiftShader), under the deep-render bound
  // and failure-tolerant: a page that cannot drain is reported and cleanup proceeds under its own bounds.
  for (const open of context?.pages() ?? []) {
    try {
      await ev(open, () => {
        const gl = window.atlas?.renderer?.gl; if (!gl) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      }, undefined, 'drain GPU work', LIMITS.deep);
    } catch (error) { console.error(`drain GPU work: ${error.message}`); }
  }
  await closeWithin(context, 'context');
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
