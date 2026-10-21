// spikes/project0/tests/decode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTrace, decodeArith } from '../measure/decode.mjs';
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];

test('a well-formed trace decodes onto the T1 vocabulary', () => {
  const words = [0, 0, f32bits(3), 3, 1, 0, 0, 1, 2, 2, f32bits(4), 512, 2, 1, f32bits(1), 7];
  assert.deepEqual(decodeTrace(words, 4, { maxSteps: 512 }), [
    { id: 0, status: 'hit', reason: null, t: 3, steps: 3 }, { id: 1, status: 'miss', reason: null, t: null, steps: 1 },
    { id: 2, status: 'unresolved', reason: 'steps', t: 4, steps: 512 }, { id: 3, status: 'unresolved', reason: 'point', t: 1, steps: 7 }]);
});

test('malformed readback is refused, never compared', () => {
  const ok = [0, 0, f32bits(3), 3];
  assert.throws(() => decodeTrace(ok.slice(0, 3), 1, { maxSteps: 512 }), /readback length/);
  for (const bad of [null, 1.5, -1, 2 ** 32, NaN, '7']) assert.throws(() => decodeTrace([bad, 0, 0, 1], 1, { maxSteps: 512 }), /invalid readback word/);
  assert.throws(() => decodeTrace([7, 0, 0, 1], 1, { maxSteps: 512 }), /unknown ray status code/);
  assert.throws(() => decodeTrace([0, 2, f32bits(3), 3], 1, { maxSteps: 512 }), /reason on a resolved/);
  assert.throws(() => decodeTrace([2, 0, f32bits(3), 3], 1, { maxSteps: 512 }), /unresolved ray without a reason/);
  assert.throws(() => decodeTrace([0, 0, f32bits(3), 513], 1, { maxSteps: 512 }), /steps out of range/);
  assert.throws(() => decodeTrace([0, 0, f32bits(NaN), 3], 1, { maxSteps: 512 }), /non-finite depth/);
  assert.throws(() => decodeTrace([0, 0, f32bits(3), 0], 1, { maxSteps: 512 }), /hit after zero steps/);
});

test('arithmetic decoding checks status, index bounds and value finiteness', () => {
  assert.deepEqual(decodeArith([0, 3, f32bits(1), f32bits(0.5)], 1, { minIndex: 1, cap: 64, de: true }), [{ id: 0, status: 'escaped', index: 3, logR: 1, de: 0.5 }]);
  assert.deepEqual(decodeArith([1, 0, 0, 0], 1, { minIndex: 0, cap: 128, de: false }), [{ id: 0, status: 'budget', index: null, logR: null, de: null }]);
  assert.throws(() => decodeArith([0, 65, f32bits(1), f32bits(1)], 1, { minIndex: 1, cap: 64, de: true }), /escape index out of range/);
  assert.throws(() => decodeArith([0, 3, f32bits(Infinity), 0], 1, { minIndex: 1, cap: 64, de: true }), /non-finite/);
  assert.throws(() => decodeArith([1, 4, 0, 0], 1, { minIndex: 0, cap: 128, de: false }), /budget result carries data/);
  assert.throws(() => decodeArith([9, 0, 0, 0], 1, { minIndex: 0, cap: 128, de: false }), /unknown arithmetic status code/);
});
