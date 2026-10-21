// Plan B11 (spec §4.1): palette definitions and interpolation are shared (src/shared/palettes.js); Plane
// re-exports them and keeps its own colorPixel. The fixture was captured from src/plane/palettes.js before
// the move (edeb410), so the comparison is against Plane's former output, not against the new module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as shared from '../../src/shared/palettes.js';
import * as plane from '../../src/plane/palettes.js';
import { boundaryViolations } from '../support/import-boundary.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/palette-bytes-1024.json', import.meta.url), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test("the shared palette bytes equal Plane's former output byte for byte", () => {
  assert.equal(fixture.size, 1024);
  assert.deepEqual(shared.PALETTES.map(p => p.id), fixture.palettes.map(p => p.id), 'every palette, in order');
  for (const [i, captured] of fixture.palettes.entries()) {
    const former = new Uint8Array(Buffer.from(captured.base64, 'base64'));
    assert.equal(sha256(former), captured.sha256, `${captured.id}: fixture integrity`);
    for (const module of [shared, plane]) {
      const bytes = module.paletteBytes(module.PALETTES[i], 1024);
      assert.ok(bytes instanceof Uint8Array && bytes.length === 4096, captured.id);
      assert.ok(Buffer.from(bytes).equals(Buffer.from(former)), `${captured.id}: byte-identical to the pre-move output`);
    }
  }
  // Other sizes go through the same arithmetic (the default size is 1024).
  assert.deepEqual(shared.paletteBytes(shared.PALETTES[0]), shared.paletteBytes(shared.PALETTES[0], 1024));
});

test('Plane re-exports the shared palette definitions and interpolation and keeps its own colorPixel', () => {
  assert.equal(plane.PALETTES, shared.PALETTES);
  assert.equal(plane.paletteBytes, shared.paletteBytes);
  assert.equal(plane.interpolatePalette, shared.interpolatePalette);
  assert.deepEqual(Object.keys(plane).sort(), ['PALETTES', 'colorPixel', 'interpolatePalette', 'paletteBytes']);
  assert.deepEqual(Object.keys(shared).sort(), ['PALETTES', 'interpolatePalette', 'paletteBytes']);
  assert.equal(typeof plane.colorPixel, 'function');
  assert.ok(!('colorPixel' in shared), 'colorPixel stays Plane-owned');
  // colorPixel's results are unchanged (values captured from the pre-move module at edeb410).
  assert.deepEqual(plane.colorPixel(-1, 0, plane.paletteBytes(plane.PALETTES[0], 1024), 0, 1, 0), [4, 8, 14]);
  assert.deepEqual(plane.colorPixel(100, 0.5, plane.paletteBytes(plane.PALETTES[0], 1024), 0.25, 1.5, 0.4), [13, 45, 63]);
  assert.deepEqual(plane.colorPixel(3.7, 0.1, plane.paletteBytes(plane.PALETTES[3], 1024), 0.9, 0.6, 1), [22, 13, 33]);
});

test('interpolatePalette is the unrounded stop blend that paletteBytes rounds', () => {
  for (const palette of shared.PALETTES) {
    const bytes = shared.paletteBytes(palette, 64);
    for (let i = 0; i < 64; i++) {
      const colour = shared.interpolatePalette(palette, i / 63);
      assert.equal(colour.length, 3);
      assert.deepEqual(colour.map(Math.round), [...bytes.subarray(4 * i, 4 * i + 3)], `${palette.id} ${i}`);
    }
    const stops = palette.stops.map(hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16)));
    assert.deepEqual(shared.interpolatePalette(palette, 0), stops[0]);
    assert.deepEqual(shared.interpolatePalette(palette, 1), stops.at(-1));
  }
  assert.throws(() => shared.interpolatePalette(shared.PALETTES[0], Number.NaN), RangeError);
  assert.throws(() => shared.interpolatePalette(shared.PALETTES[0], 1.5), RangeError);
});

test('no src/space module imports src/plane', async () => {
  // Rev 4.4 (B02 ruling 10): Space never depends on Plane. Only import edges are judged here: the WebGPU
  // backend under src/space/render/webgpu legitimately names navigator, which the scanner reports as a
  // 'global' finding, so global findings are excluded (other tests own the DOM/GPU-name boundaries).
  const allowed = [/^src\/space\//, /^src\/shared\//];
  const imports = list => list.filter(violation => violation.kind !== 'global');
  assert.deepEqual(imports(await boundaryViolations(['src/space'], allowed)), []);
  const planted = imports(await boundaryViolations(['tests/fixtures/boundary/imports-plane'], allowed));
  assert.ok(planted.some(violation => violation.kind === 'import' && violation.resolved === 'src/plane/palettes.js'), 'a Plane import fails the checker');
});
