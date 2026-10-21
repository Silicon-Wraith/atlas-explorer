// spikes/project0/tests/watchdog.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWatchdog } from '../gpu/watchdog.js';

test('five seconds without progress stops further submissions and names the outstanding work', () => {
  let t = 0; const wd = createWatchdog({ stallMs: 5000, now: () => t, every: null });
  const doneA = wd.submitted('a', { gate: 'G6', generation: 1 }); wd.submitted('b', { gate: 'G6', generation: 1 });
  t = 3000; doneA(); wd.check(); assert.equal(wd.stopped, false);      // progress at 3 s resets the clock
  t = 7999; wd.check(); assert.equal(wd.stopped, false);
  t = 8001; wd.check(); assert.equal(wd.stopped, true);
  assert.deepEqual(wd.stall.outstanding.map(o => o.id), ['b']);
  assert.throws(() => wd.submitted('c', {}), /watchdog stopped/);
});

test('an idle watchdog with nothing outstanding never stalls', () => {
  let t = 0; const wd = createWatchdog({ stallMs: 5000, now: () => t, every: null });
  t = 60000; wd.check(); assert.equal(wd.stopped, false);
});
