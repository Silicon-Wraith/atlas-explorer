// spikes/project0/tests/session-utils.test.mjs — Node bounds: no lingering timers, never-answering pages, late launches closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bounded, boundedStart, waitResult, installTransport, stopReasons } from '../session-utils.mjs';
const timers = () => process.getActiveResourcesInfo().filter(x => x === 'Timeout').length;

test('an operation that finishes immediately leaves no live timer behind', async () => {
  const before = timers();
  assert.equal(await bounded(Promise.resolve(7), 3600000, 'x'), 7);
  assert.equal(timers(), before);
  await assert.rejects(bounded(Promise.reject(new Error('boom')), 3600000, 'x'), /boom/);
  assert.equal(timers(), before);
});

// T9 fix round 1 (Codex T9 r1, finding 1): waitResult no longer polls the page with evaluate(); the page pushes through a binding installed
// before navigation (tests/transport.test.mjs). These two tests keep their intent against the push transport.
test('a page that never pushes a result is a classified hang at the Node-owned deadline, with no evaluate call', async () => {
  let binding = null, evaluates = 0;
  const page = { exposeBinding: async (name, fn) => { binding = fn; }, evaluate: async () => { evaluates++; }, on() {} };
  await installTransport(page);
  const t0 = Date.now();
  const out = await waitResult(page, { gate: 'G6', runDir: '/x', deadlineMs: 50 });
  assert.match(out.result.error, /^browser hang: no result within the 50 ms outer deadline/); assert.ok(Date.now() - t0 < 1000); assert.equal(evaluates, 0);
  assert.ok(binding);
});

test('the outer deadline holds while the page pushes only checkpoints; the last checkpoint is kept', async () => {
  let binding = null; const writes = [];
  const page = { exposeBinding: async (name, fn) => { binding = fn; }, on() {} };
  await installTransport(page);
  binding(null, { type: 'checkpoint', checkpoint: { cycle: 0 } });
  const out = await waitResult(page, { gate: 'G12', runDir: '/x', deadlineMs: 50, writeFn: async p => writes.push(p) });
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
