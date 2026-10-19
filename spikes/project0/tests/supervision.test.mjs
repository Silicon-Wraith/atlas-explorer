// spikes/project0/tests/supervision.test.mjs — T9 fix round 2 (Codex T9 r2, findings 1, 2 and 4): the phase-aware Node supervisor and the page's
// side of the protocol. Node owns a fixed window plan per gate (names, order, bounds); outside windows the page heartbeats and Node bounds its
// silence (responsiveness, independent of the total deadline); a declared window may be silent only up to its own fixed bound; declarations that
// are duplicate, out of order or unexpected are refused; a terminal failure takes precedence over a queued result, which is kept as evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installTransport, armWindow, waitResult, windowPlan, stopReasonsOf } from '../session-utils.mjs';
import { createSupervisor } from '../browser/supervisor.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fakePage() {
  const handlers = {}; let binding = null; const c = { evaluates: 0 };
  const page = { on: (e, fn) => { (handlers[e] ??= []).push(fn); }, exposeBinding: async (name, fn) => { binding = fn; }, evaluate: async () => { c.evaluates++; } };
  return { page, c, push: m => Promise.resolve(binding(null, m)), emit: e => (handlers[e] ?? []).forEach(fn => fn()) };
}
const PLAN = [{ name: 'G8/0', boundMs: 80 }, { name: 'G8/1', boundMs: 80 }];

test('responsiveness: a silent page outside any window is a classified hang at the round-trip bound, independent of the total deadline', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G6' });
  const t0 = Date.now();
  const out = await waitResult(f.page, { gate: 'G6', runDir: '/x', deadlineMs: 60000, roundTripMs: 50 });
  assert.match(out.result.error, /^browser hang: the page did not answer within 50 ms/); assert.ok(Date.now() - t0 < 1000);
  assert.deepEqual(stopReasonsOf([`page: ${out.result.error}`]), ['browser hang']); assert.equal(f.c.evaluates, 0);
});

test('heartbeats outside windows keep a page alive past the round-trip bound', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G6' });
  const beat = setInterval(() => f.push({ type: 'heartbeat' }), 15);
  setTimeout(() => { clearInterval(beat); f.push({ type: 'result', result: { slots: [], invalidations: [] } }); }, 200);
  const out = await waitResult(f.page, { gate: 'G6', runDir: '/x', deadlineMs: 60000, roundTripMs: 50 });
  assert.deepEqual(out.result, { slots: [], invalidations: [] });
});

test('a declared window may be silent up to its own fixed bound, not beyond; open and close are acknowledged', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G8', plan: PLAN });
  const replies = [];
  setTimeout(async () => {
    replies.push(await f.push({ type: 'window-open', id: 1, name: 'G8/0' }));
    await sleep(60);                                                              // silent beyond roundTripMs (20), within the window bound (80)
    replies.push(await f.push({ type: 'window-close', id: 1, name: 'G8/0' }));
    f.push({ type: 'result', result: { slots: [{ slot: '0' }], invalidations: [] } });
  }, 5);
  const out = await waitResult(f.page, { gate: 'G8', runDir: '/x', deadlineMs: 60000, roundTripMs: 20 });
  assert.deepEqual(out.result.slots, [{ slot: '0' }]); assert.deepEqual(replies, [{ ok: true }, { ok: true }]);
  const g = fakePage(); await installTransport(g.page, { gate: 'G8', plan: PLAN });
  setTimeout(() => g.push({ type: 'window-open', id: 1, name: 'G8/0' }), 5);       // never closed
  const t0 = Date.now();
  const late = await waitResult(g.page, { gate: 'G8', runDir: '/x', deadlineMs: 60000, roundTripMs: 20 });
  assert.match(late.result.error, /^browser hang: measured window G8\/0 did not close within 80 ms/); assert.ok(Date.now() - t0 < 1000);
});

test('duplicate, out-of-order and unexpected declarations, and traffic inside a window, are refused and end the wait as a classified stop', async () => {
  const cases = [
    [[{ type: 'window-open', id: 1, name: 'G8/1' }], /unexpected window G8\/1 \(expected G8\/0\)/],
    [[{ type: 'window-open', id: 1, name: 'G8/0' }, { type: 'window-open', id: 2, name: 'G8/1' }], /window G8\/0 is already open/],
    [[{ type: 'window-open', id: 2, name: 'G8/0' }, { type: 'window-close', id: 2, name: 'G8/0' }, { type: 'window-open', id: 2, name: 'G8/1' }], /declaration id 2 is not after 2/],
    [[{ type: 'window-close', id: 1, name: 'G8/0' }], /close of G8\/0 without an open window/],
    [[{ type: 'window-open', id: 1, name: 'G8/0' }, { type: 'heartbeat' }], /heartbeat inside window G8\/0/],
    [[{ type: 'window-open', id: 1, name: 'G8/0' }, { type: 'checkpoint', checkpoint: {} }], /checkpoint inside window G8\/0, which takes none/],
    [[{ type: 'window-open', id: 1, name: 'G8/0' }, { type: 'window-open', id: 2, name: 'G8/1' }].slice(0, 1).concat([{ type: 'window-close', id: 9, name: 'G8/0' }]), /close of G8\/0 with id 9, opened as 1/],
  ];
  for (const [messages, why] of cases) {
    const f = fakePage(); await installTransport(f.page, { gate: 'G8', plan: PLAN }); const replies = [];
    for (const m of messages) replies.push(await f.push(m));
    assert.equal(replies.at(-1)?.ok ?? replies.at(-1), false, JSON.stringify(replies));
    const out = await waitResult(f.page, { gate: 'G8', runDir: '/x', deadlineMs: 1000, roundTripMs: 500 });
    assert.match(out.result.error, /^harness timeout: window protocol: /); assert.match(out.result.error, why);
    assert.deepEqual(stopReasonsOf([`page: ${out.result.error}`]), ['harness timeout']);
  }
});

test('G12: inside the sequence window the cycle-boundary checkpoints are expected within a Node-owned gap', async () => {
  const plan = [{ name: 'G12/sequence', boundMs: 5000, checkpointMs: 50 }];
  const f = fakePage(); await installTransport(f.page, { gate: 'G12', plan }); const writes = [];
  setTimeout(async () => { await f.push({ type: 'window-open', id: 1, name: 'G12/sequence' }); for (let c = 0; c < 4; c++) { await sleep(20); await f.push({ type: 'checkpoint', checkpoint: { cycle: c } }); } }, 5);
  const t0 = Date.now();
  const out = await waitResult(f.page, { gate: 'G12', runDir: '/x', deadlineMs: 60000, roundTripMs: 20, writeFn: async p => writes.push(p) });
  assert.match(out.result.error, /^browser hang: no checkpoint within 50 ms in window G12\/sequence/); assert.ok(Date.now() - t0 < 1500);
  assert.deepEqual(out.lastCheckpoint, { cycle: 3 }); assert.equal(writes.length, 4);
});

test('G2: Node arms the navigation window before goto; the page closes it after its first publication, with no opening exchange', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G2' });
  assert.deepEqual(windowPlan('G2').map(w => w.name), ['G2/navigation']);
  armWindow(f.page, 'G2/navigation');
  setTimeout(async () => { await f.push({ type: 'window-close', id: 0, name: 'G2/navigation' }); f.push({ type: 'result', result: { slots: [{ slot: 'pending' }] } }); }, 80);   // silent 80 ms > roundTripMs
  const out = await waitResult(f.page, { gate: 'G2', runDir: '/x', deadlineMs: 60000, roundTripMs: 30 });
  assert.deepEqual(out.result.slots, [{ slot: 'pending' }]);
  armWindow(f.page, 'G2/navigation');                                                 // the warm reload re-arms it
  setTimeout(async () => { await f.push({ type: 'window-close', id: 0, name: 'G2/navigation' }); f.push({ type: 'result', result: { slots: [{ slot: 'warm' }] } }); }, 10);
  assert.deepEqual((await waitResult(f.page, { gate: 'G2', runDir: '/x', deadlineMs: 60000, roundTripMs: 30 })).result.slots, [{ slot: 'warm' }]);
  const g = fakePage(); await installTransport(g.page, { gate: 'G2', plan: [{ name: 'G2/navigation', boundMs: 60, implicit: true }] }); armWindow(g.page, 'G2/navigation');
  assert.match((await waitResult(g.page, { gate: 'G2', runDir: '/x', deadlineMs: 60000, roundTripMs: 30 })).result.error, /measured window G2\/navigation did not close within 60 ms/);
});

test('a crash or close latched beside a queued result takes precedence; the result is kept as incomplete evidence', async () => {
  for (const event of ['crash', 'close']) {
    const f = fakePage(); await installTransport(f.page, { gate: 'G6' });
    await f.push({ type: 'result', result: { slots: [{ slot: 'bulb-overview/0', raw: { n: 1 } }], invalidations: [] } });
    f.emit(event);
    const out = await waitResult(f.page, { gate: 'G6', runDir: '/x', deadlineMs: 1000 });
    assert.match(out.result.error, new RegExp(`browser hang or crash: the page ${event === 'crash' ? 'crashed' : 'closed'}`));
    assert.deepEqual(out.result.slots, [{ slot: 'bulb-overview/0', raw: { n: 1 } }]);
  }
});

test('a result pushed while a window is open is a protocol failure that keeps the result', async () => {
  const f = fakePage(); await installTransport(f.page, { gate: 'G8', plan: PLAN });
  await f.push({ type: 'window-open', id: 1, name: 'G8/0' });
  await f.push({ type: 'result', result: { slots: [{ slot: '0' }] } });
  const out = await waitResult(f.page, { gate: 'G8', runDir: '/x', deadlineMs: 1000 });
  assert.match(out.result.error, /window protocol: result while window G8\/0 is open/); assert.deepEqual(out.result.slots, [{ slot: '0' }]);
});

// The page's side.
function fakeBinding({ delayMs = 5, refuse = null } = {}) {
  const log = []; let pending = 0;
  const push = async m => { log.push(`send ${m.type}${m.name ? ` ${m.name}` : ''}`); pending++; await sleep(delayMs); pending--; log.push(`reply ${m.type}`); return m.type === refuse ? { ok: false, reason: 'refused' } : m.type.startsWith('window') ? { ok: true } : true; };
  return { log, push, pending: () => pending };
}

test('page: a window stops heartbeats and awaits every outstanding reply before opening; the open is acknowledged before the measurement starts; the close follows it', async () => {
  const b = fakeBinding({ delayMs: 15 }); const sup = createSupervisor({ push: () => b.push, heartbeatMs: 5 });
  sup.startHeartbeats(); await sleep(12);
  let pendingAtStart = null;
  await sup.window('G8/0', async () => { pendingAtStart = b.pending(); b.log.push('measure'); await sleep(20); b.log.push('measured'); });
  const i = b.log.indexOf('send window-open G8/0');
  assert.equal(pendingAtStart, 0, 'no binding reply may be outstanding inside the window');
  assert.ok(b.log.slice(i).indexOf('reply window-open') < b.log.slice(i).indexOf('measure'));
  assert.deepEqual(b.log.slice(b.log.indexOf('measure'), b.log.indexOf('reply window-close') + 1), ['measure', 'measured', 'send window-close G8/0', 'reply window-close']);
  assert.ok(!b.log.slice(0, i).some((x, k) => x === 'send heartbeat' && !b.log.slice(k).includes('reply heartbeat')), 'every heartbeat was answered before the open');
  await sleep(20); assert.ok(b.log.slice(b.log.indexOf('reply window-close')).includes('send heartbeat'), 'heartbeats resume after the close');
  sup.quiesce();
});

test('page: a refused open throws before the measurement; an unanswered reply is a bounded harness timeout; the window\'s own error wins over its close', async () => {
  const refused = createSupervisor({ push: () => fakeBinding({ refuse: 'window-open' }).push });
  let ran = false;
  await assert.rejects(refused.window('G8/0', async () => { ran = true; }), /harness timeout: window protocol: open of G8\/0 refused \(refused\)/); assert.equal(ran, false);
  const silent = createSupervisor({ push: () => () => new Promise(() => {}), replyMs: 30 });
  await assert.rejects(silent.window('G8/0', async () => {}), /harness timeout: the window G8\/0 open was not answered within 30 ms/);
  const ok = createSupervisor({ push: () => fakeBinding().push });
  await assert.rejects(ok.window('G8/0', async () => { throw new Error('stall'); }), /^Error: stall$/);
  await assert.rejects(ok.checkpoint({ cycle: 0 }, { race: p => p }).then(() => { throw new Error('ok'); }), /ok/);
  const none = createSupervisor({ push: () => undefined });                          // no transport (Node fails closed): the page runs unsupervised
  assert.equal(await none.window('G8/0', async () => 7), 7);
});
