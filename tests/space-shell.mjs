// The headless Space shell checks (plan B14 Step 2; evidence `browser`, gpu: false). Headless
// Chromium with SwiftShader WebGL for Plane; WebGPU is removed from the page, so Space either reports
// itself unavailable or runs on the deterministic fake backend installed through the test seam
// (atlas.space.setBackend). The fake is routed into the page from tests/support (the application
// server never serves tests/). Every wait is bounded (tests/support/bounded.mjs).
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';
import { expectBackend, drainExpecting } from './support/expected-backend.mjs';
import { cleanupPages } from './support/workflow-cleanup.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('space-shell');
await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const reportPath = 'artifacts/space-shell-headless-report.json';
const report = [];
const writeReport = entries => writeFile(reportPath, JSON.stringify(entries, null, 2));
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, JSON.stringify(details).slice(0, 400)); };
export const PASS_UNAVAILABLE = 'Space reports unavailable without WebGPU and Plane keeps working';
export const PASS_ROUND_TRIP = 'Switching to Space and back preserves the Plane scene and both histories';

// The fake backend modules, served by a route from this checkout's tests/support.
async function routeFakes(page) {
  for (const name of ['fake-backend.mjs', 'fake-space-backend.mjs']) {
    const body = await readFile(resolve('tests/support', name), 'utf8');
    await page.route(`**/tests/support/${name}`, route => route.fulfill({ status: 200, contentType: 'text/javascript', body }));
  }
}
async function openPage(browser) {
  const page = expectBackend(boundContext(await within(browser.newPage({ viewport: { width: 1280, height: 720 } }), LIMITS.launch, 'newPage')), 'webgl');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined }); });
  await routeFakes(page);
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.deep });
  await idleWithin(page);
  return { page, errors };
}
async function closeDrained(page) {
  const failed = await cleanupPages({ pages: [page], drain: open => drainExpecting(open), report, writeReport, closeAll: () => closeWithin(page, 'page') });
  if (failed) throw new Error('page: GPU drain or report failed');
}

let server, browser;
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    const port = new URL(url).port || '5173';
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', port], { stdio: 'pipe', env: { ...process.env, PORT: port } });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolveReady, reject) => {
      server.stdout.once('data', resolveReady); server.once('error', reject);
      server.once('exit', code => reject(new Error(`Preview server exited: ${code}`)));
    }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  {
    const { page, errors } = await openPage(browser);
    const result = await ev(page, async () => {
      const toast = document.querySelector('#toast');
      const start = { workspace: atlas.workspaces.current(), scene: JSON.stringify(atlas.scene), rendered: atlas.rendered };
      const switched = await atlas.workspaces.switchTo('space');
      return { start, switched, toast: toast.textContent, visible: document.body.dataset.workspace, unavailable: document.querySelector('#space-unavailable').textContent,
        spaceState: atlas.space.state, gpu: 'gpu' in navigator && navigator.gpu !== undefined };
    }, undefined, 'switch to Space without WebGPU', LIMITS.deep);
    assert.equal(result.start.workspace, 'plane', 'a fresh start opens Plane');
    assert.deepEqual([result.switched.activeId, result.switched.outcome], ['plane', 'unavailable']);
    assert.match(result.toast, /^Space unavailable: /, 'the reason is reported');
    assert.equal(result.visible, 'plane', 'Plane is visible again');
    assert.match(result.unavailable, /^Space unavailable: /);
    assert.equal(result.spaceState.active, false);
    // Plane keeps working: a wheel step commits one frame and its scene changes.
    const wheel = await ev(page, async () => {
      const before = { rendered: atlas.rendered, zoom: atlas.view.zoom };
      document.querySelector('#fractal').dispatchEvent(new WheelEvent('wheel', { deltaY: -60, clientX: 640, clientY: 330, bubbles: true, cancelable: true }));
      await new Promise(done => setTimeout(done, 400)); await atlas.whenIdle({ timeoutMs: 60000 });
      return { before, after: { rendered: atlas.rendered, zoom: atlas.view.zoom }, history: atlas.history };
    }, undefined, 'Plane wheel after unavailable Space', LIMITS.deep);
    assert.ok(wheel.after.rendered > wheel.before.rendered, 'Plane rendered again');
    assert.ok(wheel.after.zoom > wheel.before.zoom, 'Plane zoomed in');
    assert.deepEqual(errors, [], `no runtime errors: ${errors.join(' | ')}`);
    pass(PASS_UNAVAILABLE, { switched: result.switched, toast: result.toast, wheel, nativeGpuHidden: !result.gpu });
    await closeDrained(page);
  }

  {
    const { page, errors } = await openPage(browser);
    const result = await ev(page, async () => {
      const { createDrivenFakeBackend } = await import('/tests/support/fake-space-backend.mjs');
      atlas.space.setBackend(createDrivenFakeBackend({ clock: () => performance.now() }));
      atlas.goTo({ re: '-0.743643887037151', im: '0.13182590420533', zoom: 3 });
      await atlas.whenIdle({ timeoutMs: 60000 });
      document.querySelector('[data-palette="aurora"]')?.click();
      await atlas.whenIdle({ timeoutMs: 60000 });
      const plane = { scene: JSON.stringify(atlas.scene), history: JSON.stringify(atlas.history) };
      const toSpace = await atlas.workspaces.switchTo('space');
      await atlas.space.whenIdle({ timeoutMs: 60000 });
      const camera = atlas.space.scene.camera;
      atlas.space.requestCamera({ ...camera, positionLocal: camera.positionLocal.map(x => x * 1.25) });
      atlas.space.editParameter('parameters.power', '6');
      await atlas.space.whenIdle({ timeoutMs: 60000 });
      const space = { scene: JSON.stringify(atlas.space.scene), history: JSON.stringify(atlas.space.history), published: atlas.space.lastPublication?.sceneHash ?? null };
      const toPlane = await atlas.workspaces.switchTo('plane');
      await atlas.whenIdle({ timeoutMs: 60000 });
      const planeAfter = { scene: JSON.stringify(atlas.scene), history: JSON.stringify(atlas.history) };
      await atlas.workspaces.switchTo('space');
      await atlas.space.whenIdle({ timeoutMs: 60000 });
      const spaceAfter = { scene: JSON.stringify(atlas.space.scene), history: JSON.stringify(atlas.space.history) };
      await atlas.workspaces.switchTo('plane');
      await atlas.whenIdle({ timeoutMs: 60000 });
      return { plane, planeAfter, space, spaceAfter, toSpace, toPlane, spaceHistory: atlas.space.history, final: atlas.workspaces.current() };
    }, undefined, 'round trip on the fake backend', LIMITS.deep);
    assert.equal(result.toSpace.outcome, 'activated', 'Space activates on the fake backend');
    assert.equal(result.planeAfter.scene, result.plane.scene, 'the Plane scene is preserved');
    assert.equal(result.planeAfter.history, result.plane.history, 'both Plane histories are preserved');
    assert.equal(result.spaceAfter.scene, result.space.scene, 'the Space scene is preserved');
    assert.equal(result.spaceAfter.history, result.space.history, 'both Space histories are preserved');
    assert.deepEqual([result.spaceHistory.undoDepth, result.spaceHistory.camera.length], [1, 2], 'one undo entry and one camera entry in Space');
    assert.ok(result.space.published, 'Space published the edited scene on the fake backend');
    assert.equal(result.final, 'plane');
    assert.deepEqual(errors, [], `no runtime errors: ${errors.join(' | ')}`);
    pass(PASS_ROUND_TRIP, { toSpace: result.toSpace, toPlane: result.toPlane, spaceHistory: result.spaceHistory });
    await closeDrained(page);
  }
  await writeReport(report);
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  await writeReport(report).catch(() => {});
  process.exitCode = 1;
  console.error(error);
} finally {
  if (browser) await closeWithin(browser, 'browser').catch(() => {});
  server?.kill('SIGTERM');
}
