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
