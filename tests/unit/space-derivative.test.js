import test from 'node:test';
import assert from 'node:assert/strict';
import { ZERO, fromNumber, update, log2, toNumber, isZero } from '../../src/space/numerics/derivative.js';

test('the derivative recurrence 8D + 1 overflows binary32 at update 44 but the range-safe state does not', () => {
  let d = ZERO; for (let n = 1; n <= 44; n++) d = update(d, 8);
  assert.ok(log2(d) > 128 && Number.isFinite(log2(d)));
  let scalar = 0, first = 0; for (let n = 1; n <= 60 && !first; n++) { scalar = Math.fround(8 * scalar + 1); if (!Number.isFinite(scalar)) first = n; }
  assert.equal(first, 44);
  assert.equal(log2(ZERO), null); assert.equal(toNumber(update(ZERO, 8)), 1);
});

test('the zero state is explicit and frozen; nonzero states are normalized with 0.5 <= m < 1 and an integer exponent', () => {
  assert.ok(Object.isFrozen(ZERO)); assert.deepEqual(ZERO, { zero: true }); assert.ok(isZero(ZERO));
  assert.equal(fromNumber(0), ZERO, 'zero converts to the zero state'); assert.equal(toNumber(ZERO), 0);
  for (const x of [1, 0.5, 0.75, 3, 9217, Number.MAX_VALUE, Number.MIN_VALUE, 2 ** -1022, 2 ** -1030 * 3, 1 / 3]) {
    const d = fromNumber(x);
    assert.equal(d.zero, false); assert.ok(Object.isFrozen(d)); assert.ok(!isZero(d));
    assert.ok(d.m >= 0.5 && d.m < 1, `mantissa of ${x}`); assert.ok(Number.isInteger(d.e));
    assert.equal(toNumber(d), x, `${x} round-trips exactly`);
  }
  assert.deepEqual(fromNumber(1), { zero: false, m: 0.5, e: 1 });
  assert.deepEqual(fromNumber(Number.MIN_VALUE), { zero: false, m: 0.5, e: -1073 });
  assert.equal(fromNumber(-0), ZERO, 'signed zero is zero');
  for (const bad of [-1, -Number.MIN_VALUE, NaN, Infinity, -Infinity, '1', null]) assert.throws(() => fromNumber(bad), RangeError, String(bad));
});

test('updates equal the binary64 evaluation of grow * D + add wherever that evaluation stays in the normal range', () => {
  let seed = 12345; const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < 2000; i++) {
    const D = random() * 2 ** Math.floor(random() * 200 - 100), grow = random() * 1024, add = random() < 0.5 ? 1 : random() * 4;
    const expected = grow * D + add;
    assert.equal(toNumber(update(fromNumber(D), grow, { add })), expected, `D=${D} grow=${grow} add=${add}`);
  }
  assert.equal(toNumber(update(fromNumber(9), 8 * 2 ** 7)), 9217);
  assert.equal(update(fromNumber(5), 0, { add: 0 }), ZERO, 'an exactly zero result is the zero state');
  assert.equal(update(ZERO, 4, { add: 0 }), ZERO, 'zero sensitivity stays zero');
  assert.equal(toNumber(update(fromNumber(3), 2, { add: 0 })), 6);
  for (const bad of [-1, NaN, Infinity]) {
    assert.throws(() => update(fromNumber(1), bad), RangeError);
    assert.throws(() => update(fromNumber(1), 2, { add: bad }), RangeError);
  }
  assert.throws(() => update({ zero: false, m: 2, e: 0 }, 2), TypeError, 'an unnormalized state is rejected');
  assert.throws(() => update(7, 2), TypeError);
});

test('the range-safe state represents values beyond binary64 and converts conservatively', () => {
  let d = fromNumber(1); for (let n = 0; n < 1100; n++) d = update(d, 2, { add: 0 });
  assert.equal(d.e, 1101); assert.equal(d.m, 0.5); assert.equal(log2(d), 1100);
  assert.equal(toNumber(d), Infinity, 'materializing the scalar overflows; the state does not');
  let tiny = fromNumber(1); for (let n = 0; n < 1100; n++) tiny = update(tiny, 0.5, { add: 0 });
  assert.equal(log2(tiny), -1100); assert.equal(toNumber(tiny), 0, 'below binary64, conversion underflows to zero');
  assert.equal(isZero(tiny), false, 'a representationally tiny positive derivative is not the zero state');
  const big = update(d, 8); assert.equal(log2(big), 1103, 'adding 1 to 2^1100 is below the mantissa resolution');
  assert.equal(toNumber(fromNumber(Number.MAX_VALUE)), Number.MAX_VALUE);
});
