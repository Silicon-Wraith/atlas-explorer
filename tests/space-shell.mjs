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
export const PASS_LINKS = 'A share link received while Space is active restores Plane or is reported';
export const PASS_HELD = 'Plane held during Space preparation is inert to the keyboard and stays until Space first presents';
// B14-F2 (spec §15): what is on screen while a switch is pending.
const SAMPLE_SCREEN = `() => ({ workspace: document.body.dataset.workspace ?? null, pending: document.body.dataset.workspacePending ?? null,
  plane: getComputedStyle(document.querySelector('#fractal-surface')).display,
  status: (() => { const el = document.querySelector('#space-preparation'), style = getComputedStyle(el);
    return { text: el.textContent, shown: !el.hidden && style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().height > 0 }; })() })`;

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
    const result = await ev(page, async sample => {
      const toast = document.querySelector('#toast');
      const start = { workspace: atlas.workspaces.current(), scene: JSON.stringify(atlas.scene), rendered: atlas.rendered };
      const screen = (0, eval)(sample), pendingSwitch = atlas.workspaces.switchTo('space'), during = screen();
      const switched = await pendingSwitch;
      return { start, switched, during, after: screen(), toast: toast.textContent, visible: document.body.dataset.workspace, unavailable: document.querySelector('#space-unavailable').textContent,
        spaceState: atlas.space.state, gpu: 'gpu' in navigator && navigator.gpu !== undefined };
    }, SAMPLE_SCREEN, 'switch to Space without WebGPU', LIMITS.deep);
    assert.equal(result.start.workspace, 'plane', 'a fresh start opens Plane');
    assert.deepEqual([result.during.workspace, result.during.pending], ['plane', 'space'], 'Plane stays visible while Space is attempted');
    assert.notEqual(result.during.plane, 'none', 'the Plane image stays on screen');
    assert.equal(result.after.pending, null, 'no pending activation after the failure');
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
    const result = await ev(page, async sample => {
      const { createDrivenFakeBackend } = await import('/tests/support/fake-space-backend.mjs');
      const fake = createDrivenFakeBackend({ clock: () => performance.now() });
      fake.control.holdAcquisition();
      atlas.space.setBackend(fake);
      atlas.goTo({ re: '-0.743643887037151', im: '0.13182590420533', zoom: 3 });
      await atlas.whenIdle({ timeoutMs: 60000 });
      document.querySelector('[data-palette="aurora"]')?.click();
      await atlas.whenIdle({ timeoutMs: 60000 });
      const plane = { scene: JSON.stringify(atlas.scene), history: JSON.stringify(atlas.history) };
      const screen = (0, eval)(sample), pendingSwitch = atlas.workspaces.switchTo('space');
      await new Promise(done => setTimeout(done, 100));
      const during = screen();
      fake.control.releaseAcquisition();
      const toSpace = await pendingSwitch, afterSwitch = screen();
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
      return { plane, planeAfter, space, spaceAfter, toSpace, toPlane, during, afterSwitch, spaceHistory: atlas.space.history, final: atlas.workspaces.current() };
    }, SAMPLE_SCREEN, 'round trip on the fake backend', LIMITS.deep);
    assert.equal(result.toSpace.outcome, 'activated', 'Space activates on the fake backend');
    assert.deepEqual([result.during.workspace, result.during.pending], ['plane', 'space'], `Plane stays visible while Space acquires: ${JSON.stringify(result.during)}`);
    assert.notEqual(result.during.plane, 'none', 'the Plane image stays on screen during preparation');
    assert.ok(result.during.status.shown && /Preparing/.test(result.during.status.text), `the preparation status is visible over Plane: ${JSON.stringify(result.during.status)}`);
    assert.deepEqual([result.afterSwitch.workspace, result.afterSwitch.pending], ['space', null], 'Space is shown once activated');
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

  {
    const { page, errors } = await openPage(browser);
    const result = await ev(page, async () => {
      const { createDrivenFakeBackend } = await import('/tests/support/fake-space-backend.mjs');
      const { encodeShareHash } = await import('/src/plane/scene-adapter.js');
      atlas.space.setBackend(createDrivenFakeBackend({ clock: () => performance.now() }));
      const waitFor = async (predicate, ms = 10000) => { const end = performance.now() + ms; while (!predicate()) { if (performance.now() > end) return false; await new Promise(done => setTimeout(done, 25)); } return true; };
      atlas.goTo({ re: '-0.743643887037151', im: '0.13182590420533', zoom: 3 });
      await atlas.whenIdle({ timeoutMs: 60000 });
      const linked = JSON.stringify(atlas.scene), hash = encodeShareHash(atlas.scene);
      atlas.goTo({ re: '-0.75', im: '0.1', zoom: 2 });
      await atlas.whenIdle({ timeoutMs: 60000 });
      const toSpace = await atlas.workspaces.switchTo('space');
      await atlas.space.whenIdle({ timeoutMs: 60000 });
      const spaceBefore = { scene: JSON.stringify(atlas.space.scene), history: JSON.stringify(atlas.space.history) };
      location.hash = hash;
      const switched = await waitFor(() => atlas.workspaces.current() === 'plane' && JSON.stringify(atlas.scene) === linked);
      await atlas.whenIdle({ timeoutMs: 60000 });
      const valid = { switched, current: atlas.workspaces.current(), restored: JSON.stringify(atlas.scene) === linked,
        spaceKept: JSON.stringify(atlas.space.scene) === spaceBefore.scene && JSON.stringify(atlas.space.history) === spaceBefore.history };
      await atlas.workspaces.switchTo('space');
      await atlas.space.whenIdle({ timeoutMs: 60000 });
      const before = { plane: JSON.stringify(atlas.scene), planeHistory: JSON.stringify(atlas.history), space: JSON.stringify(atlas.space.scene), spaceHistory: JSON.stringify(atlas.space.history) };
      const toast = document.querySelector('#toast');
      location.hash = '#scene=%%%not-a-link';
      const reported = await waitFor(() => /Your view is unchanged\./.test(toast.textContent));
      const after = { plane: JSON.stringify(atlas.scene), planeHistory: JSON.stringify(atlas.history), space: JSON.stringify(atlas.space.scene), spaceHistory: JSON.stringify(atlas.space.history) };
      return { toSpace, valid, invalid: { reported, toast: toast.textContent, current: atlas.workspaces.current(), unchanged: JSON.stringify(before) === JSON.stringify(after) } };
    }, undefined, 'share links while Space is active', LIMITS.deep);
    assert.equal(result.toSpace.outcome, 'activated');
    assert.equal(result.valid.switched, true, `a supported Plane link switched to Plane: ${JSON.stringify(result.valid)}`);
    assert.equal(result.valid.restored, true, 'the linked Plane scene is restored');
    assert.equal(result.valid.spaceKept, true, 'the Space investigation is retained');
    assert.equal(result.invalid.reported, true, `an invalid link is reported: ${result.invalid.toast}`);
    assert.equal(result.invalid.current, 'space', 'an invalid link does not switch workspaces');
    assert.equal(result.invalid.unchanged, true, 'an invalid link changes neither investigation nor any history');
    assert.deepEqual(errors, [], `no runtime errors: ${errors.join(' | ')}`);
    pass(PASS_LINKS, result);
    await closeDrained(page);
  }

  {
    // B14-r2 F2 and F9: the held Plane is inert (no keyboard focus or activation) and Space is shown
    // only on its first presentation; switching back restores Plane input.
    const { page, errors } = await openPage(browser);
    await ev(page, async () => {
      const { createDrivenFakeBackend } = await import('/tests/support/fake-space-backend.mjs');
      const fake = createDrivenFakeBackend({ clock: () => performance.now() });
      fake.control.holdAcquisition(); fake.control.holdPresentation();
      atlas.space.setBackend(fake); globalThis.__fake = fake;
      document.querySelector('#cycle-button').focus();
      globalThis.__toSpace = atlas.workspaces.switchTo('space').then(result => { globalThis.__switched = result; return result; });
      await new Promise(done => setTimeout(done, 100));
    }, undefined, 'hold Space preparation', LIMITS.deep);
    const PLANE = '#fractal-surface, #control-panel, #destinations, #tour-status, #share-button, #export-button, #cinema-button, #settings-button, #exit-cinema, .intro, .navigation:not(.space-navigation), .navigation-hint, .statusbar';
    const inPlane = () => page.evaluate(selector => { const el = document.activeElement; return el && el !== document.body ? Boolean(el.closest(selector)) : false; }, PLANE);
    const held = { focusedInPlane: [await inPlane()] };
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); held.focusedInPlane.push(await inPlane()); }
    await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    Object.assign(held, await ev(page, () => ({ cycle: document.querySelector('#cycle-button').getAttribute('aria-pressed'), inert: document.querySelector('#control-panel').inert,
      workspace: document.body.dataset.workspace, switched: globalThis.__switched ?? null })));
    const presenting = await ev(page, async () => {
      globalThis.__fake.control.releaseAcquisition();
      const end = performance.now() + 10000;
      while (globalThis.__fake.control.heldPresentations() === 0 && performance.now() < end) await new Promise(done => setTimeout(done, 20));
      const before = { workspace: document.body.dataset.workspace, switched: globalThis.__switched ?? null, prepared: atlas.space.state.prepared, held: globalThis.__fake.control.heldPresentations() };
      globalThis.__fake.control.releasePresentation();
      const switched = await globalThis.__toSpace;
      return { before, switched, after: document.body.dataset.workspace, published: Boolean(atlas.space.lastPublication) };
    }, undefined, 'first Space presentation', LIMITS.deep);
    const restored = await ev(page, async () => { await atlas.workspaces.switchTo('plane'); return { inert: document.querySelector('#control-panel').inert, workspace: document.body.dataset.workspace }; });
    assert.deepEqual(held.focusedInPlane.filter(Boolean), [], `keyboard focus never entered the held Plane: ${JSON.stringify(held.focusedInPlane)}`);
    assert.notEqual(held.cycle, 'true', 'keyboard activation did not start the palette animation');
    assert.equal(held.inert, true, 'the held Plane controls are inert');
    assert.deepEqual([held.workspace, held.switched], ['plane', null], 'Plane stays while Space acquires');
    assert.equal(presenting.before.prepared, true, 'Space finished preparing');
    assert.deepEqual([presenting.before.workspace, presenting.before.switched], ['plane', null], `Plane stays until Space presents: ${JSON.stringify(presenting.before)}`);
    assert.deepEqual([presenting.switched.outcome, presenting.after, presenting.published], ['activated', 'space', true], 'Space is shown on its first presentation');
    assert.deepEqual([restored.inert, restored.workspace], [false, 'plane'], 'returning to Plane restores its input');
    assert.deepEqual(errors, [], `no runtime errors: ${errors.join(' | ')}`);
    pass(PASS_HELD, { held, presenting, restored });
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
