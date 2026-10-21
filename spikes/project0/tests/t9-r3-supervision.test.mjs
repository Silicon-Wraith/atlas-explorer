// spikes/project0/tests/t9-r3-supervision.test.mjs — T9 fix round 3 (Codex T9 r3, findings 1 and 2): expiry is latched by the transport's own
// timer and checked before any message can clear or refresh a deadline, independently of the consumer loop (windows, checkpoint gaps, and silence
// while a result is awaited); a clean result is accepted only once the whole window plan has been completed; G12's checkpoints must be the
// expected cycles, in order, and complete; the supervision record is returned as evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installTransport, armWindow, waitResult, stopReasonsOf } from '../session-utils.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fakePage() {
  const handlers = {}; let binding = null;
  const page = { on: (e, fn) => { (handlers[e] ??= []).push(fn); }, exposeBinding: async (name, fn) => { binding = fn; }, evaluate: async () => { throw new Error('evaluated'); } };
  return { page, push: m => Promise.resolve(binding(null, m)) };
}
const G8 = n => Array.from({ length: n }, (_, i) => ({ name: `G8/${i}`, boundMs: 1000 }));

test('Codex reproduction: an armed 20 ms window closed after 35 ms is a classified stop, even though the close arrives before any wait', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G2', plan: [{ name: 'G2/navigation', boundMs: 20, implicit: true }] });
  armWindow(f.page, 'G2/navigation');
  await sleep(35);
  const reply = await f.push({ type: 'window-close', id: 0, name: 'G2/navigation' });
  assert.equal(reply.ok, false);
  await f.push({ type: 'result', result: { slots: [{ slot: 'pending' }], invalidations: [] } });
  const out = await waitResult(f.page, { gate: 'G2', runDir: '/x', deadlineMs: 1000 });
  assert.match(out.result.error, /^browser hang: measured window G2\/navigation did not close within 20 ms/);
  assert.deepEqual(stopReasonsOf([`page: ${out.result.error}`]), ['browser hang']);
});

test('a late close is caught by the check made before the message is processed, even if the expiry timer has not run yet', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G8', plan: [{ name: 'G8/0', boundMs: 20 }] });
  await f.push({ type: 'window-open', id: 1, name: 'G8/0' });
  const until = Date.now() + 30; while (Date.now() < until) { /* block the event loop: the timer cannot fire */ }
  assert.equal((await f.push({ type: 'window-close', id: 1, name: 'G8/0' })).ok, false);
  const out = await waitResult(f.page, { gate: 'G8', runDir: '/x', deadlineMs: 1000 });
  assert.match(out.result.error, /measured window G8\/0 did not close within 20 ms/);
});

test('a checkpoint gap that expired before the checkpoint arrived stays expired', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G12', plan: [{ name: 'G12/sequence', boundMs: 5000, checkpointMs: 20, checkpoints: 3 }] });
  await f.push({ type: 'window-open', id: 1, name: 'G12/sequence' });
  await sleep(35);
  await f.push({ type: 'checkpoint', checkpoint: { cycle: 0 } });
  const out = await waitResult(f.page, { gate: 'G12', runDir: '/x', deadlineMs: 1000, writeFn: async () => {} });
  assert.match(out.result.error, /^browser hang: no checkpoint within 20 ms in window G12\/sequence/);
});

test('silence while a result is awaited is latched even when the consumer is busy persisting a checkpoint', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G12', plan: [{ name: 'G12/sequence', boundMs: 5000, checkpointMs: 1000, checkpoints: 1 }] });
  await f.push({ type: 'window-open', id: 1, name: 'G12/sequence' });
  await f.push({ type: 'checkpoint', checkpoint: { cycle: 0 } });
  await f.push({ type: 'window-close', id: 1, name: 'G12/sequence' });
  setTimeout(() => { f.push({ type: 'heartbeat' }); f.push({ type: 'result', result: { slots: [{ slot: 'sequence' }], invalidations: [] } }); }, 60);   // silent 60 ms > 20
  const out = await waitResult(f.page, { gate: 'G12', runDir: '/x', deadlineMs: 5000, roundTripMs: 20, writeFn: () => sleep(90) });
  assert.match(out.result.error, /^browser hang: the page did not answer within 20 ms/);
});

test('a clean result is refused unless the whole window plan was completed (Codex: ten G8 slots, no windows declared)', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G8', plan: G8(10) });
  await f.push({ type: 'result', result: { slots: Array.from({ length: 10 }, (_, i) => ({ slot: String(i) })), invalidations: [] } });
  const out = await waitResult(f.page, { gate: 'G8', runDir: '/x', deadlineMs: 1000 });
  assert.match(out.result.error, /^harness timeout: window protocol: a clean result before the window plan completed \(0 of 10 windows\)/);
  assert.equal(out.result.slots.length, 10, 'the slots are kept as evidence');
  assert.equal(out.supervision.complete, false);
});

test('a result that stops early is accepted only with its own explicit invalidation; a completed plan is accepted and recorded', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G8', plan: G8(2) });
  await f.push({ type: 'window-open', id: 1, name: 'G8/0' }); await f.push({ type: 'window-close', id: 1, name: 'G8/0' });
  await f.push({ type: 'result', result: { slots: [{ slot: '0' }], invalidations: ['trial invalid: G8/0: window blurred at 5'] } });
  const early = await waitResult(f.page, { gate: 'G8', runDir: '/x', deadlineMs: 1000 });
  assert.equal(early.result.error, undefined); assert.deepEqual(early.result.invalidations, ['trial invalid: G8/0: window blurred at 5']);
  const g = fakePage(); await installTransport(g.page, { gate: 'G8', plan: G8(2) });
  for (const [id, name] of [[1, 'G8/0'], [2, 'G8/1']]) { await g.push({ type: 'window-open', id, name }); await g.push({ type: 'window-close', id, name }); }
  await g.push({ type: 'result', result: { slots: [{ slot: '0' }, { slot: '1' }], invalidations: [] } });
  const done = await waitResult(g.page, { gate: 'G8', runDir: '/x', deadlineMs: 1000 });
  assert.equal(done.result.error, undefined);
  assert.equal(done.supervision.complete, true);
  assert.deepEqual(done.supervision.windows.map(w => [w.name, w.complete]), [['G8/0', true], ['G8/1', true]]);
  assert.ok(done.supervision.windows.every(w => Number.isFinite(w.openedAt) && w.closedAt >= w.openedAt));
});

test('G12: checkpoints must be the expected cycles, in order, no more than planned, and all present before a clean result', async () => {
  const plan = [{ name: 'G12/sequence', boundMs: 5000, checkpointMs: 1000, checkpoints: 3 }];
  for (const [cycles, why] of [[[0, 0], /checkpoint for cycle 0, expected cycle 1/], [[1], /checkpoint for cycle 1, expected cycle 0/], [[0, 1, 2, 3], /checkpoint for cycle 3 beyond the planned 3/], [['x'], /checkpoint for cycle "x", expected cycle 0/]]) {
    const f = fakePage(); await installTransport(f.page, { gate: 'G12', plan });
    await f.push({ type: 'window-open', id: 1, name: 'G12/sequence' });
    for (const cycle of cycles) await f.push({ type: 'checkpoint', checkpoint: { cycle } });
    const out = await waitResult(f.page, { gate: 'G12', runDir: '/x', deadlineMs: 1000, writeFn: async () => {} });
    assert.match(out.result.error, why);
  }
  const f = fakePage(); await installTransport(f.page, { gate: 'G12', plan });
  await f.push({ type: 'window-open', id: 1, name: 'G12/sequence' });
  await f.push({ type: 'checkpoint', checkpoint: { cycle: 0 } });
  await f.push({ type: 'window-close', id: 1, name: 'G12/sequence' });                // closed after 1 of 3 cycles
  await f.push({ type: 'result', result: { slots: [{ slot: 'sequence' }], invalidations: [] } });
  const out = await waitResult(f.page, { gate: 'G12', runDir: '/x', deadlineMs: 1000, writeFn: async () => {} });
  assert.match(out.result.error, /a clean result before the window plan completed \(window G12\/sequence closed after 1 of 3 checkpoints\)/);
});
