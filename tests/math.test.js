import test from 'node:test';
import assert from 'node:assert/strict';
import { fixed, decimal, spanFixed, precisionFor, moveView, zoomView, viewTransform, floatExp, referenceOrbit, escapeTime, escapeTimeExact, validateView } from '../src/plane/math.js';
import { perturbEscape, perturbEscapeExtended, addExtended, multiplyExtended } from '../src/plane/perturbation.js';
import { paletteBytes, PALETTES } from '../src/plane/palettes.js';
import { classifyRenderer } from '../src/plane/graphics.js';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by ${Math.abs(actual - expected)}`);

test('renderer identification distinguishes software, reported hardware, and concealed devices', () => {
  assert.equal(classifyRenderer('ANGLE (Google, Vulkan SwiftShader Device (Subzero), SwiftShader driver)', true), 'software');
  assert.equal(classifyRenderer('llvmpipe (LLVM 18.1.8, 256 bits)', true), 'software');
  assert.equal(classifyRenderer('ANGLE (NVIDIA, NVIDIA RTX 6000 Ada Generation, OpenGL)', true), 'hardware');
  assert.equal(classifyRenderer('WebKit WebGL', false), 'unknown');
  assert.equal(classifyRenderer('ANGLE', true), 'unknown');
});

test('decimal parsing preserves long coordinates and scientific notation', () => {
  const input = '-0.743643887037158704752191506114774';
  assert.equal(decimal(fixed(input, 80), 80), input);
  assert.equal(decimal(fixed('1.23456e-70', 90), 90), `0.${'0'.repeat(69)}123456`);
  assert.equal(fixed('-.25', 4), -2500n);
  assert.throws(() => fixed('NaN', 40));
});
test('coordinate navigation remains distinct at 1e1000 magnification', () => {
  const view = { re: '-.75', im: '.1', zoom: 1000 };
  const moved = moveView(view, .1, -.2);
  const digits = precisionFor(view.zoom);
  assert.equal(fixed(moved.re, digits) - fixed(view.re, digits), spanFixed(1000, digits) / 10n);
  assert.equal(fixed(moved.im, digits) - fixed(view.im, digits), -spanFixed(1000, digits) / 5n);
  assert.notEqual(moved.re, decimal(fixed(view.re, digits), digits));
  assert.equal(precisionFor(10000), 10036);
});
test('cursor-centred zoom preserves the world point under the cursor', () => {
  for (const zoom of [0, 16, 100, 1000]) {
    const view = { re: '-.743643887037151', im: '.13182590420533', zoom };
    const x = .25, y = -.125;
    const next = zoomView(view, zoom + 2, x, y);
    const digits = precisionFor(zoom + 2);
    const worldX = fixed(view.re, digits) + spanFixed(view.zoom, digits) / 4n;
    const worldY = fixed(view.im, digits) - spanFixed(view.zoom, digits) / 8n;
    assert.equal(fixed(next.re, digits) + spanFixed(next.zoom, digits) / 4n, worldX);
    assert.equal(fixed(next.im, digits) - spanFixed(next.zoom, digits) / 8n, worldY);
  }
});
test('panning out and back preserves coordinates', () => {
  const view = { re: '-0.75', im: '0.1', zoom: 200 };
  const next = moveView(moveView(view, .123, -.456), -.123, .456);
  assert.equal(next.re, view.re); assert.equal(next.im, view.im);
});
test('image preview tracks pan and preserves the zoom anchor through 1e1000', () => {
  for (const zoom of [0, 16, 1000]) {
    const view = { re: '-.75', im: '.1', zoom };
    const pan = viewTransform(view, moveView(view, .1, -.2), 1000);
    near(pan.scale, 1); near(pan.x, -100); near(pan.y, -200);
    for (const step of [-.2, .2]) {
      const transform = viewTransform(view, zoomView(view, zoom + step, .25, -.125), 1000);
      // The world point under this off-centre pointer stays at the same pixel.
      near(transform.x + 250 * transform.scale, 250, 1e-7);
      near(transform.y + 125 * transform.scale, 125, 1e-7);
    }
  }
});
test('escape calculations classify known interior and exterior points', () => {
  for (const [re, im] of [[0, 0], [-1, 0], [-2, 0], [.25, 0]]) {
    assert.equal(escapeTime(re, im, 2000), -1);
    assert.equal(escapeTimeExact(String(re), String(im), 60, 2000), -1);
  }
  for (const [re, im] of [[1, 0], [2, 2], [-.75, .2], [.5, .5]]) {
    assert.ok(escapeTime(re, im) > 0);
    near(escapeTime(re, im), escapeTimeExact(String(re), String(im), 60), 1e-9);
  }
});
test('iteration limit controls unresolved classification', () => {
  assert.equal(escapeTime(-.75, .1, 10), -1);
  assert.ok(escapeTime(-.75, .1, 100) > 0);
});
test('float-exponent representation retains values below double underflow', () => {
  const digits = 1040;
  const [r, i, e] = floatExp(fixed('1e-1000', digits), fixed('-2e-1000', digits), digits);
  near(Math.log10(Math.hypot(r, i)) + e * Math.LOG10E * Math.LN2, -1000 + Math.log10(Math.sqrt(5)), 1e-10);
  assert.ok(r > 0 && i < 0 && e < -3000);
  assert.deepEqual(floatExp(0n, 0n, digits), [0, 0, 0]);
});
test('extended arithmetic preserves a tiny addend when the other operand is zero', () => {
  assert.deepEqual(addExtended([0, 0, 0], [1, -1, -4000]), [1, -1, -4000]);
  assert.deepEqual(multiplyExtended([1, 0, -2000], [1, 0, -2000]), [1, 0, -4000]);
});
test('perturbation and rebasing agree with independent direct iteration across a broad view', () => {
  const view = { re: '-.5', im: '0', zoom: 0 };
  const ref = referenceOrbit(view, 1000, Float64Array);
  for (let y = -7; y <= 7; y++) for (let x = -11; x <= 11; x++) {
    const dx = x * .137, dy = y * .131;
    const expected = escapeTime(-.5 + dx, dy, 1000);
    const actual = perturbEscape(ref.orbit, ref.length, dx, dy, 1000)[0];
    assert.equal(actual < 0, expected < 0);
    if (actual >= 0) near(actual, expected, .00001);
  }
});
test('deep perturbation agrees with exact BigInt iteration beyond double precision', () => {
  const view = { re: '-0.743643887037158704752191506114774', im: '0.131825904205311970493132056385139', zoom: 18 };
  const iterations = 12000, digits = precisionFor(view.zoom);
  const ref = referenceOrbit(view, iterations, Float64Array);
  const span = spanFixed(view.zoom, digits), cr = fixed(view.re, digits), ci = fixed(view.im, digits);
  let escaped = 0;
  for (const x of [-.43, -.27, .13, .37]) for (const y of [-.41, -.19, .17, .39]) {
    const dr = span * BigInt(Math.round(x * 100)) / 100n, di = span * BigInt(Math.round(y * 100)) / 100n;
    const expected = escapeTimeExact(cr + dr, ci + di, digits, iterations);
    const actual = perturbEscape(ref.orbit, ref.length, Number(dr) / 10 ** digits, Number(di) / 10 ** digits, iterations)[0];
    assert.equal(actual < 0, expected < 0);
    if (actual >= 0) { escaped++; near(actual, expected, .03); }
  }
  assert.ok(escaped > 0, 'Test must exercise escaping pixels, not just unresolved interior');
});
test('extended perturbation resolves exterior pixels at 1e1000', () => {
  // Just beyond the real-axis tip, escape requires about 1660 iterations.
  const view = { re: '-2', im: '0', zoom: 1000 }, iterations = 2100;
  const digits = precisionFor(view.zoom), ref = referenceOrbit(view, iterations, Float64Array);
  const offset = fixed('-1e-1000', digits);
  const expected = escapeTimeExact(fixed('-2', digits) + offset, 0n, digits, iterations);
  const actual = perturbEscapeExtended(ref.orbit, ref.length, floatExp(offset, 0n, digits), iterations)[0];
  assert.ok(expected > 1000);
  near(actual, expected, .001);
  assert.equal(perturbEscapeExtended(ref.orbit, ref.length, [0,0,0], iterations)[0], -1);
});
test('view validation rejects invalid coordinates and nonfinite zoom', () => {
  for (const view of [{ re: 'x', im: '0', zoom: 1 }, { re: '0', im: '0', zoom: Infinity }, { re: '5', im: '0', zoom: 1 }]) assert.throws(() => validateView(view));
  assert.equal(validateView({ re: '-2', im: '0', zoom: 1000 }).zoom, 1000);
});
test('all palettes produce opaque 24-bit RGB output and continuous endpoints', () => {
  for (const palette of PALETTES) {
    const bytes = paletteBytes(palette);
    assert.equal(bytes.length, 4096);
    assert.deepEqual(bytes.slice(0, 4), bytes.slice(-4));
    for (let i = 3; i < bytes.length; i += 4) assert.equal(bytes[i], 255);
  }
});

test('actual worker transports reference buffers and renders deep CPU tiles', async () => {
  const { Worker } = await import('node:worker_threads');
  const worker = new Worker(new URL('./worker-harness.js', import.meta.url));
  const call = payload => new Promise((resolve, reject) => {
    const handle = message => {
      if (message.error) { worker.off('message', handle); reject(new Error(message.error)); }
      else if (message.orbit || message.done) { worker.off('message', handle); resolve(message); }
    };
    worker.on('message', handle); worker.once('error', reject); worker.postMessage(payload);
  });
  try {
    const ref = await call({ type: 'reference', id: 1, view: { re: '-2', im: '0', zoom: 1000 }, iterations: 2100 });
    assert.ok(ref.orbit instanceof Float32Array); assert.equal(ref.length, 2101); assert.equal(ref.id, 1);
    for (const zoom of [275, 1000]) {
      const view = { re: '-2', im: '0', zoom }, iterations = 2100;
      const result = await call({ type: 'cpu', id: 2, view, iterations, width: 2, height: 2 });
      const digits = precisionFor(zoom), span = spanFixed(zoom, digits);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const cr = fixed('-2', digits) + span * BigInt(2 * x - 1) / 4n;
        const ci = span * BigInt(1 - 2 * y) / 4n;
        const expected = escapeTimeExact(cr, ci, digits, iterations);
        const actual = result.pixels[(y * 2 + x) * 4];
        assert.equal(actual < 0, expected < 0);
        if (actual >= 0) near(actual, expected, .001);
      }
    }
  } finally { await worker.terminate(); }
});
