import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialGrid } from '../../src/space/preparation/spatial-grid.js';

const D = .0265625, origin = [1414.9757562519364, 79.21086912557448, 1040.6400501279961];
const axes = [[0, .16538701891281857, -.9862287432310676], [-.8721772490151933, .4824532290228802, .08090567412540195], [.4891899899837377, .860166272170984, .14424679517820585]];
const create = () => createSpatialGrid({ origin, axes, diameter: D });
const offset = (c, signs) => c.map((x, k) => x + .25 * D * axes.reduce((sum, axis, i) => sum + signs[i] * axis[k], 0));

test('PC2 grid preserves home and the canonical fine dependency in absolute metres', () => {
  const g = create(), fine = [1414.969281874518, 79.1994849165704, 1040.6381410370243], half = .01328125;
  assert.deepEqual(g.center([0, 0, 0]), origin);
  const b = g.bounds([0, 0, 0]);
  assert.ok(fine.every((x, i) => x - half >= b.min[i] && x + half <= b.max[i]));
  assert.equal(g.key(g.parse('0,0,0')), '0,0,0');
});

test('PC2 grid bounds body endpoints at all rounded-cell corners including finite-domain faces', () => {
  const g = create(); let checked = 0;
  for (let i = -3; i <= 9; i++) for (let j = -3; j <= 3; j++) for (let k = -2; k <= 2; k++) {
    const address = [i, j, k], c = g.center(address);
    assert.deepEqual(g.nearest(c), address);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const start = offset(c, [x, y, z]);
      // Stronger than a speed-limited vector: push each world component outward.
      const end = start.map((v, axis) => v + Math.sign(v - c[axis]) * g.maxStep);
      assert.ok(g.contains(address, start, end), `address ${address}, corner ${x},${y},${z}`);
      checked++;
    }
  }
  assert.equal(checked, 455 * 8);
  assert.ok(g.enclosure + .05 + g.config.floatSlack < 1);
});

test('PC2 grid resolves exact three-axis rounding ties consistently at world-scale coordinates', () => {
  const g = create();
  assert.deepEqual(g.nearest(offset(origin, [1, 1, 1])), [1, 1, 1]);
  assert.deepEqual(g.nearest(offset(origin, [-1, -1, -1])), [0, 0, 0]);
  assert.equal(g.key(g.parse('-0,0,0')), '0,0,0');
  const edge = offset(g.center([9, 3, 2]), [1, 1, 1]);
  assert.equal(g.nearest(edge), null);
  assert.ok(g.covering(edge).some(a => a.join(',') === '9,3,2'));
});

test('PC2 grid refuses unsupported addresses and uncovered sweeps without clamping', () => {
  const g = create();
  for (const a of [[10, 0, 0], [0, 0, 3], [.5, 0, 0], [0, 0]]) assert.throws(() => g.center(a), /domain/);
  assert.throws(() => g.parse('0,0,NaN'), /invalid/);
  assert.equal(g.nearest(origin.map(x => x + 100)), null);
  assert.deepEqual(g.covering(origin, origin.map(x => x + 100)), []);
  assert.throws(() => g.contains([0, 0, 0], origin, origin, NaN), /radius/);
});

test('PC2 grid enclosure is distinct from terrain clearance and owns configuration inputs', () => {
  const input = { origin: [...origin], axes: axes.map(a => [...a]), diameter: D };
  const g = createSpatialGrid(input); input.origin[0] = 0; input.axes[0][0] = 9;
  assert.deepEqual(g.center([0, 0, 0]), origin); assert.ok(g.contains([0, 0, 0], origin));
  assert.equal(Object.hasOwn(g, 'clearTerrain'), false);
  assert.throws(() => createSpatialGrid({ origin, axes: [[1, 0, 0], [1, 0, 0], [0, 0, 1]], diameter: D }), /orthonormal/);
  assert.throws(() => createSpatialGrid({ origin, axes, diameter: D, spacing: .75 }), /maximum step/);
});
