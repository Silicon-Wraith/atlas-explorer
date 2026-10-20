import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('browser');

await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const hardware = process.argv.includes('--hardware');
const reportPath = `artifacts/${hardware ? 'hardware-' : ''}browser-report.json`;
let server, browser;
const report = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const errors = [];
function watchErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
}
async function idle(page) {
  // Let browser input/resize events reach the render queue before waiting on it.
  await page.waitForTimeout(400);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && document.body.dataset.rendering === 'false', null, { timeout: 60000 });
  await idleWithin(page);
}
async function checkLayout(page) {
  const problems = await ev(page, () => {
    const issues = [];
    for (const selector of ['.topbar', '.navigation', '.navigation-hint', '.panel', '.destinations']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < 0 || rect.right > innerWidth + 1 || rect.top < 0 || rect.bottom > innerHeight + 1) issues.push(`${selector} outside viewport`);
    }
    const panel = document.querySelector('.panel').getBoundingClientRect();
    for (const selector of ['.destination-tabs', '.navigation']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top) issues.push(`${selector} overlaps panel`);
    }
    return issues;
  });
  assert.deepEqual(problems, []);
}

// Runs inside the browser; the exact recurrence is independent of both renderers.
async function numericalProbe(backend) {
  const { GpuRenderer, CpuRenderer } = await import('/src/renderer.js');
  const { fixed, spanFixed, precisionFor, escapeTimeExact } = await import('/src/math.js');
  const { colorPixel, paletteBytes, PALETTES } = await import('/src/palettes.js');
  const renderer = new (backend === 'gpu' ? GpuRenderer : CpuRenderer)(document.createElement('canvas'));
  const cases = [
    { re: '-.5', im: '.1', zoom: 0, iterations: 700 },
    { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4, iterations: 1500 },
    { re: '-0.743643887037151', im: '0.13182590420533', zoom: 15.5, iterations: 4500 },
    { re: '-0.743735546648121901421502749766284274', im: '0.13180188244022899880486875943155304', zoom: 9.178000000000004, iterations: 1222 },
    { re: '-0.74373554655981392496378600769218837122', im: '0.13180188254868144746747814705787405605', zoom: 11.242000000000006, iterations: 1288 },
    { re: '-2', im: '0', zoom: 1000, iterations: 2100 },
  ];
  const result = [];
  try {
    for (const view of cases) {
      const width = view.zoom === 9.178000000000004 ? 320 : 16, height = width === 320 ? 96 : 12;
      await renderer.render(view, { palette: 'ember', phase: .11, frequency: 1, relief: 1, iterations: view.iterations }, width, height);
      const field = backend === 'gpu' ? renderer.readField() : renderer.data;
      if (backend === 'cpu') {
        // Check the actual painted canvas, including rows from earlier worker tiles.
        const rgba = renderer.context.getImageData(0, 0, width, height).data;
        const palette = paletteBytes(PALETTES[0]);
        for (let index = 0; index < field.length; index += 4) {
          const expected = [...colorPixel(field[index], field[index + 1], palette, .11, 1, 1), 255];
          if (expected.some((channel, offset) => channel !== rgba[index + offset])) throw new Error(`CPU paint mismatch at ${index / 4}`);
        }
      }
      const digits = precisionFor(view.zoom), span = spanFixed(view.zoom, digits);
      const re = fixed(view.re, digits), im = fixed(view.im, digits);
      let maximumError = 0, mismatches = 0, samples = 0;
      const points = width === 320 ? [[1, 1], [65, 18], [130, 35], [180, 51], [240, 77], [315, 94]] : [[1, 1], [5, 2], [11, 4], [2, 8], [13, 9], [6, 10]];
      for (const [x, y] of points) {
        const cr = re + span * BigInt(2 * x + 1 - width) / BigInt(2 * width);
        const ci = im + span * BigInt(2 * y + 1 - height) / BigInt(2 * width);
        const row = backend === 'gpu' ? y : height - y - 1;
        const expected = escapeTimeExact(cr, ci, digits, view.iterations), actual = field[(row * width + x) * 4];
        if ((expected < 0) !== (actual < 0) || !Number.isFinite(actual)) mismatches++;
        if (expected >= 0 && actual >= 0) maximumError = Math.max(maximumError, Math.abs(expected - actual));
        samples++;
      }
      result.push({ zoom: view.zoom, maximumError, mismatches, samples });
    }
  } finally { renderer.destroy(); }
  return result;
}
function checkNumerical(results) {
  assert.equal(results.length, 6, 'all six numerical views must be sampled');
  for (const result of results) {
    assert.equal(result.samples, 6, JSON.stringify(result));
    assert.equal(result.mismatches, 0, JSON.stringify(result));
    assert.ok(result.maximumError < .5, JSON.stringify(result));
  }
}
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', ...(hardware ? ['--enable-gpu', '--use-angle=vulkan'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
  const context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  watchErrors(page);
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  assert.match(await page.title(), /ATLAS/);
  assert.match(await page.locator('#engine-status').textContent(), hardware ? /^GPU/ : /SOFTWARE WEBGL/);
  assert.equal(await ev(page, () => atlas.graphics.acceleration), hardware ? 'hardware' : 'software');
  await page.screenshot({ path: 'artifacts/atlas-desktop.png', animations: 'disabled' });
  await checkLayout(page);
  const graphics = await ev(page, () => {
    const gl = atlas.renderer.gl, info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) };
  });
  pass('Desktop WebGL startup and unobstructed controls', { graphics });

  await page.getByRole('button', { name: 'Show graphics details', exact: true }).click();
  assert.match(await page.locator('#graphics-device').textContent(), hardware ? /NVIDIA|AMD|Intel|Apple/i : /SwiftShader/);
  assert.match(await page.locator('#graphics-summary').textContent(), hardware ? /hardware graphics device/ : /software on the CPU/);
  await within(page.keyboard.press('Escape'), LIMITS.operation, 'keyboard.press');
  pass('WebGL acceleration is labeled accurately and exposes its actual renderer');

  const before = await ev(page, () => ({ count: atlas.rendered, image: document.querySelector('canvas').toDataURL() }));
  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  const after = await ev(page, () => ({ count: atlas.rendered, image: document.querySelector('canvas').toDataURL() }));
  assert.equal(before.count, after.count); assert.notEqual(before.image, after.image);
  pass('Instant palette changes without recalculating the fractal');

  const oldView = await ev(page, () => atlas.view);
  await within(page.mouse.move(720, 440), LIMITS.operation, 'mouse.move'); await within(page.mouse.wheel(0, -120), LIMITS.operation, 'mouse.wheel');
  await page.waitForTimeout(400); await idleWithin(page);
  assert.ok((await ev(page, () => atlas.view.zoom)) > oldView.zoom);
  await within(page.mouse.move(600, 420), LIMITS.operation, 'mouse.move'); await within(page.mouse.down(), LIMITS.operation, 'mouse.down'); await within(page.mouse.move(650, 450, { steps: 5 }), LIMITS.operation, 'mouse.move'); await within(page.mouse.up(), LIMITS.operation, 'mouse.up');
  await idle(page);
  assert.notEqual((await ev(page, () => atlas.view.re)), oldView.re);
  pass('Wheel zoom and pointer drag');

  await within(page.keyboard.press('b'), LIMITS.operation, 'keyboard.press');
  await page.getByRole('button', { name: /Your discoveries/ }).click();
  await page.waitForFunction(() => document.querySelector('#saved-count').textContent === '1', null, { timeout: LIMITS.operation });
  assert.equal(await page.locator('.saved-wrapper').count(), 1);
  await page.reload({ timeout: LIMITS.launch }); await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.equal(await page.locator('#saved-count').textContent(), '1');
  pass('Bookmarks persist across reloads');

  await page.getByRole('button', { name: 'Cinema mode', exact: true }).click();
  assert.ok(await within(page.locator('body').evaluate(el => el.classList.contains('cinema')), LIMITS.operation, 'locator evaluate'));
  await within(page.keyboard.press('Escape'), LIMITS.operation, 'keyboard.press');
  await page.getByRole('button', { name: 'Controls and about', exact: true }).click();
  assert.ok(await within(page.locator('#help-dialog').evaluate(el => el.open), LIMITS.operation, 'locator evaluate'));
  await within(page.keyboard.press('Escape'), LIMITS.operation, 'keyboard.press');
  pass('Cinema mode, keyboard shortcuts, and accessible help dialog');

  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('-2'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('40');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  await idleWithin(page, LIMITS.deep);
  assert.equal((await ev(page, () => atlas.view.zoom)), 40);
  assert.match(await page.locator('#engine-status').textContent(), /EXTENDED/);
  pass('Arbitrary coordinate navigation enters extended GPU mode');

  await page.getByRole('button', { name: /Share view/ }).click();
  assert.match(page.url(), /#re=-2/);
  const sharedPage = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage')); watchErrors(sharedPage); await sharedPage.goto(page.url(), { timeout: LIMITS.launch });
  await sharedPage.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.equal(await ev(sharedPage, () => atlas.view.zoom), 40);
  await closeWithin(sharedPage, 'sharedPage'); pass('Shared URL restores precision and settings');

  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.locator('#export-size').selectOption('current');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  const downloaded = await within(downloadPromise, LIMITS.deep, 'PNG download'); await within(downloaded.saveAs('artifacts/export-test.png'), LIMITS.operation, 'PNG save');
  assert.match(downloaded.suggestedFilename(), /\.png$/);
  const png = await readFile('artifacts/export-test.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
  pass('PNG export', { width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

  const locationDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save location (.json)', exact: true }).click();
  await within((await within(locationDownload, LIMITS.operation, 'location download')).saveAs('artifacts/export-test.json'), LIMITS.operation, 'location save');
  const savedLocation = JSON.parse(await readFile('artifacts/export-test.json', 'utf8'));
  assert.deepEqual(savedLocation.view, await ev(page, () => atlas.view));
  await within(page.keyboard.press('Escape'), LIMITS.operation, 'keyboard.press');
  await within(page.evaluate(async () => { atlas.goTo({ re: '-.5', im: '0', zoom: 0 }); await atlas.whenIdle(); }), LIMITS.operation, 'move away before import');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.locator('#import-location').setInputFiles('artifacts/export-test.json');
  await idle(page);
  assert.deepEqual(await ev(page, () => atlas.view), savedLocation.view);
  assert.equal(await within(page.locator('#capture-dialog').evaluate(el => el.open), LIMITS.operation, 'locator evaluate'), false);
  pass('JSON location export and import preserve exact coordinates');

  const numerical = await within(page.evaluate(numericalProbe, 'gpu'), LIMITS.deep, 'GPU numerical probe');
  checkNumerical(numerical);
  pass('GPU escape values agree with independent BigInt oracle', { numerical });

  await within(page.evaluate(async () => { atlas.goTo({ re: '-.743643887037151', im: '.13182590420533', zoom: 3.85 }); await atlas.whenIdle(); }), LIMITS.operation, 'return to Seahorse valley');
  await page.setViewportSize({ width: 1280, height: 720 });
  await idle(page);
  await checkLayout(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  assert.ok(await within(page.locator('#coordinate-dialog').evaluate(el => el.open), LIMITS.operation, 'locator evaluate'));
  await within(page.keyboard.press('Escape'), LIMITS.operation, 'keyboard.press');
  await page.screenshot({ path: 'artifacts/atlas-laptop.png', animations: 'disabled' });
  pass('Laptop layout keeps exact-coordinate navigation accessible');

  const response = await within(page.evaluate(async () => {
    const start = performance.now(), initial = atlas.view.zoom;
    for (let i = 0; i < 6; i++) {
      document.querySelector('#zoom-in').click();
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    await atlas.whenIdle();
    atlas.renderer.gl.finish();
    return { elapsedMs: performance.now() - start, initial, final: atlas.view.zoom, width: atlas.renderer.canvas.width, height: atlas.renderer.canvas.height };
  }), LIMITS.deep, 'repeated GPU navigation');
  assert.ok(Math.abs(response.final - response.initial - 6 * Math.log10(2)) < 1e-10);
  assert.equal(response.width, 1280); assert.equal(response.height, 720);
  pass('Repeated GPU navigation reaches the latest view and full resolution', { response });
  await page.getByRole('button', { name: /Take a journey/ }).click();
  await page.waitForFunction(() => !document.querySelector('#tour-status').hidden && atlas.view.zoom > 3.85, null, { timeout: LIMITS.operation });
  await within(page.keyboard.press('+'), LIMITS.operation, 'keyboard.press');
  assert.ok(await within(page.locator('#tour-status').evaluate(el => el.hidden), LIMITS.operation, 'locator evaluate'));
  await idle(page);
  pass('Journey animates and manual navigation stops it');

  const mobileContext = boundContext(await within(browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }), LIMITS.launch, 'newContext'));
  const mobile = boundContext(await within(mobileContext.newPage(), LIMITS.launch, 'newPage')); watchErrors(mobile);
  await mobile.goto(url, { timeout: LIMITS.launch }); await idle(mobile);
  await mobile.screenshot({ path: 'artifacts/atlas-mobile.png', animations: 'disabled' });
  await checkLayout(mobile);
  assert.ok(await ev(mobile, () => document.documentElement.scrollWidth <= innerWidth));
  await mobile.getByRole('button', { name: 'Abyss palette', exact: true }).tap();
  assert.equal(await ev(mobile, () => atlas.settings.palette), 'ocean');
  await mobile.getByRole('button', { name: 'Explorer settings', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Go to', exact: true }).tap();
  assert.ok(await within(mobile.locator('#coordinate-dialog').evaluate(el => el.open), LIMITS.operation, 'locator evaluate'));
  await mobile.locator('#coordinate-dialog').getByRole('button', { name: 'Close', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Explorer settings', exact: true }).tap();
  await idle(mobile);
  const touch = await within(mobileContext.newCDPSession(mobile), LIMITS.operation, 'newCDPSession');
  const touchEvent = (type, touchPoints) => within(touch.send('Input.dispatchTouchEvent', { type, touchPoints }), LIMITS.operation, `touch ${type}`);
  const beforeTouch = await ev(mobile, () => atlas.view);
  await touchEvent('touchStart', [{ x: 100, y: 380, id: 1 }]);
  await touchEvent('touchMove', [{ x: 140, y: 400, id: 1 }]);
  await touchEvent('touchEnd', []);
  await idle(mobile);
  assert.notEqual(await ev(mobile, () => atlas.view.re), beforeTouch.re);
  const beforePinch = await ev(mobile, () => atlas.view.zoom);
  await touchEvent('touchStart', [{ x: 130, y: 380, id: 1 }, { x: 230, y: 380, id: 2 }]);
  await touchEvent('touchMove', [{ x: 100, y: 380, id: 1 }, { x: 260, y: 380, id: 2 }]);
  await touchEvent('touchEnd', []);
  await idle(mobile);
  assert.ok(Math.abs(await ev(mobile, () => atlas.view.zoom) - beforePinch - Math.log10(1.6)) < 1e-8);
  assert.equal(await ev(mobile, () => visualViewport.scale), 1);
  await within(touch.detach(), LIMITS.operation, 'touch.detach');
  pass('Mobile layout, settings, touch drag, and cursor-centered pinch zoom');
  await closeWithin(mobileContext, 'mobileContext');
  await closeWithin(context, 'context');

  // Exercise actual startup fallback, including a context that lacks float targets.
  for (const unavailable of ['webgl2', 'float-targets']) {
    const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 } }), LIMITS.launch, 'newContext'));
    await cpuContext.addInitScript(kind => {
      if (kind === 'webgl2') {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === 'webgl2' ? null : original.call(this, type, ...args);
        };
      } else {
        const original = WebGL2RenderingContext.prototype.getExtension;
        WebGL2RenderingContext.prototype.getExtension = function (name) {
          return name === 'EXT_color_buffer_float' ? null : original.call(this, name);
        };
      }
    }, unavailable);
    const cpu = boundContext(await within(cpuContext.newPage(), LIMITS.launch, 'newPage')); watchErrors(cpu);
    const started = performance.now();
    await cpu.goto(url, { timeout: LIMITS.launch }); await idle(cpu);
    const startupMs = performance.now() - started;
    assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
    await cpu.getByRole('button', { name: 'Controls and about', exact: true }).click();
    await cpu.getByRole('button', { name: 'Graphics details', exact: true }).click();
    assert.equal(await ev(cpu, () => atlas.graphics.acceleration), 'cpu');
    assert.match(await cpu.locator('#graphics-reason').textContent(), unavailable === 'webgl2' ? /WebGL 2 context creation failed/ : /EXT_color_buffer_float is missing/);
    await within(cpu.keyboard.press('Escape'), LIMITS.operation, 'keyboard.press');
    assert.ok(await ev(cpu, () => atlas.renderer.data.some((value, index) => index % 4 === 0 && value > 0)));
    if (unavailable === 'webgl2') {
      await cpu.screenshot({ path: 'artifacts/atlas-cpu.png', animations: 'disabled' });
      const cpuNumerical = await within(cpu.evaluate(numericalProbe, 'cpu'), LIMITS.deep, 'CPU numerical probe');
      checkNumerical(cpuNumerical);
      pass('CPU worker escape values agree with independent BigInt oracle', { numerical: cpuNumerical });
      const cpuBefore = await ev(cpu, () => ({ count: atlas.rendered, image: atlas.renderer.canvas.toDataURL() }));
      await cpu.getByRole('button', { name: 'Aurora palette', exact: true }).click();
      const cpuAfter = await ev(cpu, () => ({ count: atlas.rendered, image: atlas.renderer.canvas.toDataURL() }));
      assert.equal(cpuBefore.count, cpuAfter.count); assert.notEqual(cpuBefore.image, cpuAfter.image);
      const responsiveness = await within(cpu.evaluate(async () => {
        const gaps = [], started = performance.now(), initialZoom = atlas.view.zoom;
        let last = started;
        const timer = setInterval(() => { const now = performance.now(); gaps.push(now - last); last = now; }, 16);
        // Each new request cancels a worker still calculating an older view.
        for (let i = 0; i < 5; i++) {
          document.querySelector('#zoom-in').click();
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        await atlas.whenIdle();
        clearInterval(timer);
        return { elapsedMs: performance.now() - started, maximumTimerGapMs: Math.max(...gaps), timerTicks: gaps.length, initialZoom, finalZoom: atlas.view.zoom, width: atlas.renderer.canvas.width };
      }), LIMITS.deep, 'CPU responsiveness');
      assert.ok(Math.abs(responsiveness.finalZoom - responsiveness.initialZoom - 5 * Math.log10(2)) < 1e-10);
      assert.equal(responsiveness.width, 960);
      assert.ok(responsiveness.timerTicks > 3);
      assert.ok(responsiveness.maximumTimerGapMs < 1000, JSON.stringify(responsiveness));
      pass('CPU palette caching, render cancellation, and responsive navigation', { responsiveness });
    }
    pass(`Automatic CPU fallback when ${unavailable} is unavailable`, { startupMs });
    await closeWithin(cpuContext, 'cpuContext');
  }

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  throw error;
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
