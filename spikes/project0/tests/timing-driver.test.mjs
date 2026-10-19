// spikes/project0/tests/timing-driver.test.mjs — a stop ends the invocation; burst timers never outlive an abort or fire early.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { createAbort } = await import('../gpu/abort.js');
const { runTiming, runBursts } = await import('../browser/drivers/timing.js');
const { runG8 } = await import('../browser/drivers/g8.js');
const { runG10 } = await import('../browser/drivers/g10.js');
const { runG12 } = await import('../browser/drivers/g12.js');
const { stopReasonsOf } = await import('../session-utils.mjs');
const fx = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));

function stalledSession() {
  const abort = createAbort();
  setTimeout(() => abort.abort({ kind: 'stall', outstanding: [{ id: 'band:1' }] }), 20);
  return { abort, epoch: 1, renderer: { render: () => 1, onPublish: () => () => {}, stats: () => ({ outstandingMax: 1, bands: [] }), readTimestamps: async () => ({ method: 'queue-completion' }) }, events: { list: () => [] }, device: { queue: { onSubmittedWorkDone: () => new Promise(() => {}) } }, close() {} };
}
const quiet = { integrity: () => ({ stop: () => ({ violations: [], events: [] }) }), longTasks: () => ({ take: () => [], harnessMeasures: () => 0 }), hzOf: async () => 60, canvas: {} };

test('an abort in the first G6 trial ends the timing invocation after one acquisition', async () => {
  let opened = 0;
  const out = await runTiming(fx, () => {}, { ...quiet, open: async () => { opened++; return stalledSession(); } });
  assert.equal(opened, 1);
  assert.equal(out.slots.length, 1); assert.match(out.slots[0].raw.error, /no observable progress for 5 s/);
  assert.match(out.invalidations[0], /no observable progress for 5 s/);
});

test('an abort in the first G8 repetition ends G8 after one acquisition', async () => {
  let opened = 0;
  const out = await runG8(fx, () => {}, { open: async () => { opened++; return stalledSession(); }, canvas: {}, integrity: quiet.integrity });
  assert.equal(opened, 1); assert.equal(out.slots.length, 1); assert.match(out.invalidations[0], /no observable progress/);
});

test('an abort during a burst cancels every pending timer; nothing renders afterwards', async () => {
  const abort = createAbort(); let renders = 0, n = 0; const log = [];
  const s = { abort, renderer: { render: () => { renders++; log.push({ type: 'request', requestId: ++n, t: performance.now() }); return n; } } };
  const before = process.getActiveResourcesInfo().filter(x => x === 'Timeout').length;
  setTimeout(() => abort.abort({ kind: 'device-lost', message: 'unknown' }), 300);
  await assert.rejects(runBursts(s, fx.bursts.requests, { log: { list: () => log } }), /aborted: device-lost/);
  const atAbort = renders;
  await new Promise(r => setTimeout(r, 400));
  assert.equal(renders, atAbort, 'no request may be issued after the abort');
  assert.ok(renders < 400);
  assert.ok(process.getActiveResourcesInfo().filter(x => x === 'Timeout').length <= before + 1, 'burst timers were cancelled');
});

test('an early timer callback re-arms for its absolute target instead of issuing early', async () => {
  const abort = createAbort(); const log = []; let n = 0; let fake = 0;
  const s = { abort, renderer: { render: () => { log.push({ type: 'request', requestId: ++n, t: fake }); return n; } } };
  const schedule = [{ id: 0, burst: 0, index: 0, offsetMs: 30, camera: {} }];
  const now = () => fake; const p = runBursts(s, schedule, { log: { list: () => log }, now });
  fake = 60;                                        // the clock read at the first callback is before target? target = 0 + 50 + 30 = 80
  await new Promise(r => setTimeout(r, 120)); fake = 81; await new Promise(r => setTimeout(r, 60));
  const { issued } = await p;
  assert.equal(issued.length, 1); assert.ok(issued[0].firedMs >= issued[0].scheduledMs);
});

// A session whose renderer never publishes and whose events never show a submission.
function silentSession(c) {
  const abort = createAbort();
  return { abort, epoch: 1, renderer: { abort, render: () => ++c.renders, onPublish: () => () => {}, stats: () => ({ outstandingMax: 1, bands: [] }) }, events: { list: () => [], clear() {} },
    device: { queue: { onSubmittedWorkDone: async () => {} } }, alloc: { inventory: () => ({ bytes: 0, textures: 0, buffers: 0 }) }, watchdog: {}, losses: [], close() { c.closes++; } };
}

test('G8: a stress request never observed submitted is a harness timeout that ends G8 after one acquisition', async () => {
  const c = { renders: 0, closes: 0 }; let opened = 0;
  const out = await runG8(fx, () => {}, { open: async () => { opened++; return silentSession(c); }, canvas: {}, integrity: quiet.integrity, waitMs: 30 });
  assert.equal(opened, 1); assert.equal(c.renders, 1, 'no sphere request after the expiry'); assert.equal(c.closes, 1);
  assert.deepEqual(stopReasonsOf(out.invalidations), ['harness timeout']);
});

test('G10: a publication deadline is a harness timeout: one render attempt, the failed view recorded, a recognised stop', async () => {
  const c = { renders: 0, closes: 0 };
  const out = await runG10(fx, () => {}, { open: async () => silentSession(c), canvas: {}, integrity: quiet.integrity, timeoutMs: 30 });
  assert.equal(c.renders, 1); assert.equal(c.closes, 1);
  assert.deepEqual(out.slots.map(x => x.slot), ['bulb-overview']);
  assert.match(out.slots[0].raw.error, /harness timeout: no publication within 30 ms/);
  assert.deepEqual(stopReasonsOf(out.invalidations), ['harness timeout']);
});

test('G12: a maintenance readback timeout ends the sequence: no further rendering or maintenance, the evidence kept, the session closed', async () => {
  const c = { renders: 0, closes: 0 }, s = silentSession(c); let follows = 0, exercises = 0, once = 0;
  const failed = { errors: ['harness readback timeout: mapping did not complete within 50 ms'] };
  const out = await runG12(fx, () => {}, { open: async () => s, canvas: {}, integrity: quiet.integrity, target: {},
    prepareResourceCheck: async () => ({}), followPath: async () => { follows++; }, renderOnce: async () => { once++; return {}; },
    exerciseResources: async () => { exercises++; return failed; } });
  assert.equal(exercises, 1); assert.equal(follows, 1, 'only the baseline path ran before the maintenance'); assert.equal(once, 1); assert.equal(c.renders, 0);
  assert.equal(c.closes, 1);
  assert.deepEqual(out.slots[0].raw.maintenance, [failed], 'the failed maintenance record is preserved');
  assert.deepEqual(stopReasonsOf(out.invalidations), ['harness readback timeout']);
});

