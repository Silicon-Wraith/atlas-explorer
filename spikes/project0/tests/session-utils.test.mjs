// spikes/project0/tests/session-utils.test.mjs — Node bounds: no lingering timers, never-answering pages, late launches closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bounded, boundedStart, waitResult, stopReasons } from '../session-utils.mjs';
const timers = () => process.getActiveResourcesInfo().filter(x => x === 'Timeout').length;

test('an operation that finishes immediately leaves no live timer behind', async () => {
  const before = timers();
  assert.equal(await bounded(Promise.resolve(7), 3600000, 'x'), 7);
  assert.equal(timers(), before);
  await assert.rejects(bounded(Promise.reject(new Error('boom')), 3600000, 'x'), /boom/);
  assert.equal(timers(), before);
});

test('a page whose evaluate() never answers is a hang within the round-trip bound', async () => {
  const t0 = Date.now();
  const out = await waitResult({ evaluate: () => new Promise(() => {}) }, { gate: 'G6', runDir: '/x', deadlineMs: 60000, roundTripMs: 50, pollMs: 10 });
  assert.match(out.result.error, /did not answer within 50 ms/); assert.ok(Date.now() - t0 < 1000);
});

test('the outer deadline holds while the page answers without a result; the last checkpoint is kept', async () => {
  let n = 0; const writes = [];
  const page = { evaluate: async () => ({ result: null, checkpoints: n++ === 0 ? [{ cycle: 0 }] : [], capture: null }) };
  const out = await waitResult(page, { gate: 'G12', runDir: '/x', deadlineMs: 50, roundTripMs: 50, pollMs: 10, writeFn: async p => writes.push(p) });
  assert.match(out.result.error, /outer deadline/); assert.deepEqual(out.lastCheckpoint, { cycle: 0 }); assert.equal(writes.length, 1);
});

test('a launch that resolves after its deadline is closed immediately and cannot be used', async () => {
  let closed = 0, resolveLaunch;
  const launch = () => new Promise(r => { resolveLaunch = r; });
  await assert.rejects(boundedStart(launch, 30, 'browser hang: launch', r => { closed++; r.used = false; }), /browser hang: launch/);
  const late = { used: true }; resolveLaunch(late); await new Promise(r => setImmediate(r));
  assert.equal(closed, 1); assert.equal(late.used, false);
});

test('the shared stop classifier covers spec §7 and every harness deadline', () => {
  assert.deepEqual(stopReasons({ invalidations: ['driver error: harness readback timeout: mapping did not complete within 5000 ms'] }), ['harness readback timeout']);
  assert.deepEqual(stopReasons({ invalidations: ['harness timeout: no publication within 20000 ms'] }), ['harness timeout']);
  assert.deepEqual(stopReasons({ invalidations: ['harness readback timeout: x'] }), ['harness readback timeout'], 'the two harness forms stay distinct');
  assert.deepEqual(stopReasons({ invalidations: ['no observable progress for 5 s: [x]', 'device lost: unknown'] }), ['unexpected device loss', 'submission stalled for 5 s']);
  assert.deepEqual(stopReasons({ metrics: { software: 1 }, invalidations: [] }), ['software execution detected']);
  assert.deepEqual(stopReasons({ invalidations: ['page error: TypeError'] }), []);
});
