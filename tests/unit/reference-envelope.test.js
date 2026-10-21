// The rev 4.8 surface-v1 analytic envelope (plan B04 P1, spec §11.4): t⁻ is the first forward
// intersection with the object expanded outward by ρ — a sphere quadratic at radius 1 + ρ, local
// slabs with every half-extent inflated by ρ, and the union of the inflated Menger leaves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { expandedSphereEntry, expandedBoxEntry, sphereInterval, boxInterval, ROTATED_BOX } from '../reference/analytic.js';
import { expandedMengerEntry, mengerIntervals } from '../reference/menger.js';
import { normalize } from '../reference/camera.js';

const close = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} versus ${b}`);

test('the expanded sphere entry is the first forward root of the radius 1 + ρ quadratic', () => {
  close(expandedSphereEntry({ origin: [0, -4, 0], direction: [0, 1, 0] }, 0.01), 3 - 0.01);
  // Closest approach 0.6: t⁻ = 4 − √((1 + ρ)² − 0.36).
  close(expandedSphereEntry({ origin: [0.6, -4, 0], direction: [0, 1, 0] }, 0.1), 4 - Math.sqrt(1.21 - 0.36));
  // Grazing the original sphere from outside but inside the expansion: still an entry.
  close(expandedSphereEntry({ origin: [1.005, -4, 0], direction: [0, 1, 0] }, 0.01), 4 - Math.sqrt(1.01 ** 2 - 1.005 ** 2));
  assert.equal(expandedSphereEntry({ origin: [1.5, -4, 0], direction: [0, 1, 0] }, 0.01), null);
  assert.equal(expandedSphereEntry({ origin: [0, 0.995, 0], direction: [0, 1, 0] }, 0.01), 0, 'an origin inside the expansion enters at 0');
  assert.equal(expandedSphereEntry({ origin: [0, 4, 0], direction: [0, 1, 0] }, 0.01), null, 'no forward intersection behind the origin');
});

test('the expanded box entry uses local slabs with every half-extent inflated by ρ', () => {
  const c = Math.cos(ROTATED_BOX.rotationZ), s = Math.sin(ROTATED_BOX.rotationZ), rho = 0.02;
  const ex = [c, s, 0], ey = [-s, c, 0];
  const along = axisOffset => ({ origin: ex.map((v, i) => -4 * v + axisOffset * ey[i]), direction: ex });
  close(expandedBoxEntry(along(0), rho), 3 - rho);
  // A ray missing the box by less than ρ enters the expansion.
  close(expandedBoxEntry(along(0.5 + rho / 2), rho), 3 - rho);
  assert.equal(expandedBoxEntry(along(0.5 + 2 * rho), rho), null);
  const unrotated = { center: [0, 0, 0], half: [1, 1, 1], rotationZ: 0 };
  close(expandedBoxEntry({ origin: [0, -4, 0], direction: [0, 1, 0] }, 0.25, unrotated), 2.75);
  assert.equal(expandedBoxEntry({ origin: [0, 0, 0], direction: [0, 1, 0] }, 0.25, unrotated), 0);
});

test('the expanded Menger entry is the nearest entry over the union of inflated leaves', () => {
  // Depth 1 removes the central column along y: the inflated leaves close it only once ρ ≥ 1/3.
  const hole = { origin: [0, -4, 0], direction: [0, 1, 0] };
  assert.equal(expandedMengerEntry(hole, 1, 0.1), null);
  close(expandedMengerEntry(hole, 1, 0.4), 4 - 1.4);
  close(expandedMengerEntry({ origin: [2 / 3, -4, 2 / 3], direction: [0, 1, 0] }, 1, 0.01), 3 - 0.01);
  // Depth 2 hollows that leaf's centre column; a corner sub-leaf column is solid.
  assert.equal(expandedMengerEntry({ origin: [2 / 3, -4, 2 / 3], direction: [0, 1, 0] }, 2, 0.01), null);
  close(expandedMengerEntry({ origin: [8 / 9, -4, 8 / 9], direction: [0, 1, 0] }, 2, 0.01), 3 - 0.01);
  // Containment: the expansion is never entered after the original object, on the P1 oblique grid.
  const d = normalize([0.3, 1, 0.2]);
  for (const depth of [1, 2]) for (let i = 0; i < 41; i += 4) for (let j = 0; j < 41; j += 4) {
    const ray = { origin: [-1.2 + 2.4 * i / 40, -4, -1.2 + 2.4 * j / 40], direction: d };
    const first = mengerIntervals(ray, depth)[0], entry = expandedMengerEntry(ray, depth, 0.003);
    if (first) assert.ok(entry !== null && entry <= Math.max(0, first.enter), `${depth}/${i}/${j}`);
  }
});

test('expanded sphere and box entries contain the original object', () => {
  for (let k = 0; k < 25; k++) {
    const ray = { origin: [-1.2 + 0.1 * k, -4, 0.3], direction: [0, 1, 0] };
    const sphere = sphereInterval(ray, 1), box = boxInterval(ray);
    if (sphere) assert.ok(expandedSphereEntry(ray, 0.001) <= Math.max(0, sphere.enter));
    if (box && box.exit >= Math.max(0, box.enter)) assert.ok(expandedBoxEntry(ray, 0.001) <= Math.max(0, box.enter));
  }
});
