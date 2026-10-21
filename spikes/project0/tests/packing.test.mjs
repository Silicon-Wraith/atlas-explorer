// spikes/project0/tests/packing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { packBoxes, vec4 } from '../browser/packing.js';
import { menger } from '../reference/geometry.js';

test('Menger boxes pack as (centre, half-size) with no NaN, for 20 and 400 boxes', () => {
  for (const [depth, count] of [[1, 20], [2, 400]]) {
    const boxes = menger(depth), packed = packBoxes(boxes);
    assert.equal(packed.length, 4 * count);
    assert.ok(packed.every(Number.isFinite));
    boxes.forEach((b, i) => { assert.deepEqual([...packed.subarray(4 * i, 4 * i + 3)], b.c.map(Math.fround)); assert.equal(packed[4 * i + 3], Math.fround(b.h[0])); });
  }
  assert.throws(() => packBoxes([{ c: [0, 0, 0], h: [1, 0.5, 0.25] }]), /cubic/);
});

test('vec4 pads flat xyz triples', () => {
  assert.deepEqual([...vec4(new Float32Array([1, 2, 3, 4, 5, 6]))], [1, 2, 3, 0, 4, 5, 6, 0]);
});
