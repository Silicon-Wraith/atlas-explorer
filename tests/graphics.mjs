import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const report = [];
let server;
try {
  try { await fetch(url); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve); server.once('error', reject);
      server.once('exit', code => reject(new Error(`Preview server exited: ${code}`)));
    });
  }
  for (const [name, args] of [
    ['hardware-vulkan', ['--enable-gpu', '--use-angle=vulkan', ...(process.argv.includes('--compositor') ? ['--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan'] : [])]],
  ]) {
    let browser;
    const entry = { name, browser: process.argv.includes('--chrome') ? 'installed Chrome' : 'Chromium headless shell', headed: process.argv.includes('--headed'), args, messages: [], errors: [] }; report.push(entry);
    try {
      browser = await chromium.launch({ ...(process.argv.includes('--chrome') ? { channel: 'chrome', chromiumSandbox: true } : {}), headless: !process.argv.includes('--headed'), timeout: 15000, args: ['--disable-dev-shm-usage', ...args] });
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('console', message => {
        if (['error', 'warning', 'info'].includes(message.type())) entry.messages.push(message.text());
        if (message.type() === 'error' || message.text().includes('CONTEXT_LOST_WEBGL')) entry.errors.push(message.text());
      });
      page.on('pageerror', error => entry.errors.push(error.message));
      await page.goto(url, { timeout: 15000 });
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 30000 });
      entry.graphics = await page.evaluate(() => {
        const gl = atlas.renderer.gl;
        if (!gl) return { mode: atlas.renderer.mode, diagnostics: atlas.renderer.diagnostics };
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          mode: atlas.renderer.mode,
          renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
          vendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
          version: gl.getParameter(gl.VERSION), error: gl.getError(),
        };
      });
      assert.match(entry.graphics.mode, /^GPU/);
      assert.equal(entry.graphics.error, 0);
      entry.samples = await page.evaluate(async () => {
        const { GpuRenderer } = await import('/src/renderer.js');
        const { fixed, spanFixed, precisionFor, escapeTimeExact } = await import('/src/math.js');
        const renderer = new GpuRenderer(document.createElement('canvas'));
        const view = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4 };
        await renderer.render(view, { palette: 'ember', phase: .11, frequency: 1, relief: 1, iterations: 1500 }, 16, 12);
        const field = renderer.readField(), digits = precisionFor(view.zoom), span = spanFixed(view.zoom, digits);
        const result = [];
        for (const [x,y] of [[1,1],[5,2],[11,4],[2,8],[13,9],[6,10]]) {
          const re = fixed(view.re,digits) + span * BigInt(2*x+1-16) / 32n;
          const im = fixed(view.im,digits) + span * BigInt(2*y+1-12) / 32n;
          result.push({x,y,actual:field[(y*16+x)*4],expected:escapeTimeExact(re,im,digits,1500)});
        }
        renderer.destroy(); return result;
      });
      for (const sample of entry.samples) assert.ok(Math.abs(sample.actual - sample.expected) < .5, JSON.stringify(sample));
      if (process.argv.includes('--benchmark')) entry.benchmarks = await page.evaluate(async () => {
        const { GpuRenderer, CpuRenderer } = await import('/src/renderer.js');
        const views = [
          { re: '-0.743735546648121901421502749766284274', im: '0.13180188244022899880486875943155304', zoom: 9.178000000000004 },
          { re: '-0.74373554655981392496378600769218837122', im: '0.13180188254868144746747814705787405605', zoom: 11.242000000000006 },
        ];
        const results = [];
        for (const Backend of [CpuRenderer, GpuRenderer]) {
          const renderer = new Backend(document.createElement('canvas'));
          try {
            for (const view of views) {
              const settings = { palette: 'ember', phase: .11, frequency: 1, relief: 1, iterations: 1024 + Math.max(0, Math.ceil((view.zoom - 3) * 32)) };
              const start = performance.now();
              await renderer.render(view, settings, 1280, 720);
              const field = renderer.gl ? renderer.readField() : renderer.data;
              const milliseconds = performance.now()-start;
              const values = Array.from({ length: field.length / 4 }, (_, index) => field[index * 4]);
              results.push({ backend: Backend.name, zoom: view.zoom, width: renderer.canvas.width, height: renderer.canvas.height, workers: renderer.diagnostics.workers, milliseconds, escaped: values.filter(x => x > 0).length, glError: renderer.gl?.getError() });
            }
          } finally { renderer.destroy(); }
        }
        return results;
      });
      for (const result of entry.benchmarks || []) {
        assert.equal(result.width, 1280); assert.equal(result.height, 720);
        assert.ok(result.escaped > 0);
        if (result.backend === 'GpuRenderer') assert.equal(result.glError, 0);
      }
      if (process.argv.includes('--benchmark')) {
        for (const [name, view] of [
          ['zoom-9', { re: '-0.743735546648121901421502749766284274', im: '0.13180188244022899880486875943155304', zoom: 9.178000000000004 }],
          ['zoom-11', { re: '-0.74373554655981392496378600769218837122', im: '0.13180188254868144746747814705787405605', zoom: 11.242000000000006 }],
        ]) {
          await page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, view);
          await page.screenshot({ path: `artifacts/hardware-${name}.png` });
        }
      }
      assert.deepEqual(entry.errors, []);
      await page.screenshot({ path: `artifacts/${name}.png` });
    } catch (error) { entry.error = error.message; process.exitCode = 1; }
    finally { await browser?.close(); }
    console.log(JSON.stringify({ ...entry, error: entry.error?.split('\n').slice(0, 3).join('\n') }, null, 2));
  }
} finally {
  await writeFile(process.env.ATLAS_GRAPHICS_REPORT || 'artifacts/graphics-report.json', JSON.stringify(report, null, 2));
  server?.kill('SIGTERM');
}
