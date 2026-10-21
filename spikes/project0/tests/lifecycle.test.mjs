// spikes/project0/tests/lifecycle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Lifecycle } from '../gpu/lifecycle.js';

test('a loss of the current epoch interrupts the job and preserves its request exactly', () => {
  let t = 0; const lc = new Lifecycle({ epoch: 7, now: () => t });
  const job = lc.begin({ view: 'bulb-overview', profile: 'settled' });
  const r = lc.lost({ epoch: 7, reason: 'destroyed', injected: false });
  assert.equal(r.action, 'recover'); assert.equal(r.interrupted, job); assert.equal(job.state, 'interrupted');
  assert.deepEqual(job.request, { view: 'bulb-overview', profile: 'settled' });
  assert.equal(lc.accept(job, 7), false); assert.equal(lc.accept(job, 8), false);
  lc.recovered(9);
  assert.equal(lc.accept(lc.begin(job.request), 9), true);
});

test('a loss reported for a different epoch is ignored, not treated as the current device', () => {
  const lc = new Lifecycle({ epoch: 3, now: () => 0 });
  lc.begin({ a: 1 });
  assert.equal(lc.lost({ epoch: 2, reason: 'destroyed' }).action, 'ignore');
});

test('a second loss inside the window stops automatic retry; an interrupted job never succeeds', () => {
  let t = 0; const lc = new Lifecycle({ epoch: 1, now: () => t, windowMs: 60000 });
  const job = lc.begin({ a: 1 }); assert.equal(lc.lost({ epoch: 1, injected: true }).action, 'recover');
  assert.throws(() => lc.succeed(job), /interrupted/);
  lc.recovered(3); t = 1000; lc.begin({ a: 1 });
  assert.equal(lc.lost({ epoch: 3, injected: true }).action, 'stop');
  assert.equal(lc.stats().stopped, true);
  assert.throws(() => lc.begin({ a: 1 }), /stopped/);
});
