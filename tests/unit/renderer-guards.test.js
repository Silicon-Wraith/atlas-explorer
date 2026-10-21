import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The production renderers run only in a browser. These checks pin, in their source, that each
// one asks `isCurrent()` before it writes anything visible — the guard the render adapter relies
// on for pixel safety (the adapter itself only refuses to adopt a stale completion).
const source = readFileSync(new URL('../../src/plane/renderer.js', import.meta.url), 'utf8');
const method = (className, name) => {
  const start = source.indexOf(`export class ${className}`);
  const body = source.slice(start, source.indexOf('\nexport class', start + 1) === -1 ? undefined : source.indexOf('\nexport class', start + 1));
  const at = body.indexOf(`  async ${name}(`);
  assert.ok(at >= 0, `${className}.${name} exists`);
  return body.slice(at, body.indexOf('\n  }\n', at));
};

test('GpuRenderer checks isCurrent before it resizes, draws or colors', () => {
  const render = method('GpuRenderer', 'render');
  const guard = render.indexOf('if (!isCurrent()) throw superseded();');
  assert.ok(guard > 0, 'the guard exists');
  for (const write of ['this.resize(width, height);', 'gl.drawArrays(', 'this.color(settings);']) {
    assert.ok(render.indexOf(write) > guard, `${write} happens after the guard`);
  }
});

test('CpuRenderer checks isCurrent before it adopts or paints a frame', () => {
  const render = method('CpuRenderer', 'render');
  const guard = render.indexOf('if (!isCurrent()) { reject(superseded()); return; }');
  assert.ok(guard > 0, 'the guard exists');
  for (const write of ['this.data = frame;', 'this.color(this.settings);']) {
    assert.ok(render.indexOf(write) > guard, `${write} happens after the guard`);
  }
});

// T08 fix round 1 (Codex finding 4): objects invalidated by a context loss are never passed back to
// the restored context (that raises INVALID_OPERATION, which the suites' GPU drain rejects).
test('GpuRenderer disposes loss-aware: no GL deletion for a renderer whose context was lost', () => {
  const start = source.indexOf('export class GpuRenderer');
  const body = source.slice(start, source.indexOf('\nexport class', start + 1));
  const at = body.indexOf('  destroy()');
  const destroy = body.slice(at, body.indexOf('\n  }\n', at));
  const guard = destroy.indexOf('if (this.lost) return;');
  assert.ok(guard > 0, 'destroy stops before the GL deletions once the context was lost');
  assert.ok(destroy.indexOf('this.worker.terminate();') < guard, 'the worker is stopped whatever the context state');
  assert.ok(destroy.indexOf('this.reject?.(') < guard, 'pending work is settled whatever the context state');
  for (const call of ['gl.deleteProgram(', 'gl.deleteTexture(', 'gl.deleteFramebuffer(']) assert.ok(destroy.indexOf(call) > guard, `${call} happens after the guard`);
  assert.match(body, /canvas\.addEventListener\('webglcontextlost', \(\) => \{ this\.lost = true; \}, \{ once: true \}\);/, 'the loss is recorded on the renderer itself');
});
