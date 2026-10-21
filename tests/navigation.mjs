import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, drainGpuWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';
import { cleanupPages } from './support/workflow-cleanup.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('navigation');

await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const record = process.argv.includes('--record');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const report = [];
const reportPath = `artifacts/navigation-${record ? 'before' : 'report'}.json`;
const writeReport = entries => writeFile(reportPath, JSON.stringify(entries, null, 2));
async function closeDrained(page) {
  const failed = await cleanupPages({ pages: [page], drain: open => drainGpuWithin(open), report, writeReport,
    closeAll: () => closeWithin(page, 'page') });
  if (failed) throw new Error('page: GPU drain or report failed');
}
let server, browser;
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolve, reject) => {
      server.stdout.once('data', resolve); server.once('error', reject);
      server.once('exit', code => reject(new Error(`Preview server exited: ${code}`)));
    }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const backend of ['gpu', 'cpu']) {
    const page = boundContext(await within(browser.newPage({ viewport: { width: 1280, height: 720 } }), LIMITS.launch, 'newPage'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(kind => {
      if (kind === 'cpu') {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === 'webgl2' ? null : original.call(this, type, ...args);
        };
      }
      // Make the pending-frame interval observable on fast as well as slow machines.
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (...args) { setTimeout(() => post.apply(this, args), 100); };
    }, backend);
    await page.goto(url, { timeout: LIMITS.launch });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
    await idleWithin(page);
    const result = await within(page.evaluate(async () => {
      const canvas = document.querySelector('#fractal');
      const probe = document.createElement('canvas'); probe.width = 64; probe.height = 40;
      const context = probe.getContext('2d', { willReadFrequently: true });
      function sample() {
        context.drawImage(canvas, 0, 0, probe.width, probe.height);
        const rgba = context.getImageData(0, 0, probe.width, probe.height).data;
        let sum = 0;
        for (let i = 0; i < rgba.length; i += 4) sum += rgba[i] + rgba[i + 1] + rgba[i + 2];
        return sum / (probe.width * probe.height * 3);
      }
      const initialBrightness = sample(), initialRendered = atlas.rendered;
      const sizes = new Set(), brightness = [];
      let running = true;
      function observe() {
        if (!running) return;
        brightness.push(sample()); sizes.add(`${canvas.width}x${canvas.height}`);
        requestAnimationFrame(observe);
      }
      requestAnimationFrame(observe);
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -60, clientX: 640, clientY: 330, bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 700));
      await atlas.whenIdle();
      running = false;
      return { initialBrightness, minimumBrightness: Math.min(...brightness), frames: brightness.length, renderedPerWheel: atlas.rendered - initialRendered, sizes: [...sizes] };
    }), LIMITS.operation, 'wheel observation');
    report.push({ backend, ...result });
    console.log(backend, result);
    if (!record) {
      assert.ok(result.frames > 0, 'The observation must sample at least one animation frame');
      assert.equal(result.renderedPerWheel, 1, 'A wheel step should commit one image, without a second resolution change');
      assert.equal(result.sizes.length, 1, 'Navigation must keep the displayed pixel dimensions stable');
      assert.ok(result.minimumBrightness > result.initialBrightness * .5, 'The previous image must remain visible while the worker calculates');
      assert.deepEqual(errors, []);
      const burst = await within(page.evaluate(async () => {
        const surface = document.querySelector('#fractal-surface');
        const initial = atlas.view.zoom, count = atlas.rendered;
        for (let i = 0; i < 5; i++) {
          surface.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, clientX: 580, clientY: 360, bubbles: true, cancelable: true }));
          await new Promise(resolve => setTimeout(resolve, 15));
        }
        await atlas.whenIdle();
        return { zoom: atlas.view.zoom, expectedZoom: initial - 5 * 30 * .0015, commits: atlas.rendered - count, transform: document.querySelector('#fractal').style.transform };
      }), LIMITS.operation, 'wheel burst');
      assert.ok(Math.abs(burst.zoom - burst.expectedZoom) < 1e-10);
      assert.equal(burst.commits, 1, 'Only the latest requested view should be presented after a rapid wheel burst');
      assert.equal(burst.transform, '', 'The finished frame must replace the temporary preview');
      report.at(-1).burst = burst;
      // A translated/scaled canvas must not move the input surface: drag from an
      // exposed edge while the next image is pending, then release the pointer.
      await within(page.mouse.move(500, 360), LIMITS.operation, 'mouse.move'); await within(page.mouse.down(), LIMITS.operation, 'mouse.down');
      await within(page.mouse.move(560, 390, { steps: 3 }), LIMITS.operation, 'mouse.move');
      await within(page.mouse.up(), LIMITS.operation, 'mouse.up');
      await idleWithin(page);
      const afterDrag = await ev(page, () => ({ count: atlas.rendered, re: atlas.view.re, im: atlas.view.im }));
      await page.waitForTimeout(300);
      assert.equal(await ev(page, () => atlas.rendered), afterDrag.count, 'Pointer release must not trigger a second refinement render');
      assert.deepEqual(errors, []);
    }
    await page.screenshot({ path: `artifacts/navigation-${record ? 'before' : 'after'}-${backend}.png` });
    await closeDrained(page);
  }
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  throw error;
} finally {
  // Preserve the original failure if the suite deadline fires while pages are draining.
  try { await writeReport(report); } catch { /* cleanupPages retries after the drains. */ }
  const contexts = browser?.contexts() ?? [];
  const failed = await cleanupPages({
    pages: contexts.flatMap(context => context.pages()), drain: page => drainGpuWithin(page), report, writeReport,
    closeAll: async () => {
      for (const context of contexts) await closeWithin(context, 'context');
      await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
    },
  });
  if (failed) process.exitCode = 1;
}
