// spikes/project0/session-utils.mjs — Node-side bounds shared by the probe (T5) and the runner (T6).
// Every timer is cleared when its operation settles, so a finished command never lingers until a deadline.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function bounded(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]);
  } finally { clearTimeout(timer); }
}

// Starts a resource (e.g. a browser launch) under an outer deadline. If the deadline wins, the invocation is latched as stopped
// and a late result is closed immediately, so it can never resume navigation or GPU work.
export function boundedStart(startFn, ms, message, close = r => r?.context?.close()) {
  let late = false;
  const started = startFn();
  started.then(r => { if (late) Promise.resolve(close(r)).catch(() => {}); }, () => {});
  return bounded(started, ms, message).catch(error => { late = true; throw error; });
}

export const ROUND_TRIP_MS = 10000;

// The one stop classifier (spec §7 plus harness deadlines), shared by the probe, G2, the runner and the campaign. A record with any
// stop reason ends its invocation, and the campaign never starts another GPU experiment after it.
export const STOPS = Object.freeze([
  ['unexpected device loss', r => r.metrics?.unplannedLosses > 0 || r.invalidations.some(x => /device lost/.test(x))],
  ['allocation cap exceeded', r => r.invalidations.some(x => /allocation cap exceeded/.test(x))],
  ['software execution detected', r => r.metrics?.software === 1 || r.invalidations.some(x => /software adapter/.test(x))],
  ['browser hang', r => r.invalidations.some(x => /browser hang/i.test(x))],
  ['submission stalled for 5 s', r => r.invalidations.some(x => /no observable progress for 5 s/.test(x))],
  ['harness readback timeout', r => r.invalidations.some(x => /harness readback timeout/.test(x))],
  ['harness timeout', r => r.invalidations.some(x => /harness timeout:/.test(x))],
  // T7 (Codex T7 r2, finding 6): the renderer latches this abort only for a rejected completion of current work, never for a retired generation. The
  // whole abort-kind token is matched (r3, finding 8): a longer kind sharing the prefix is not this stop.
  ['submission completion rejected', r => r.invalidations.some(x => /aborted: submission-failed(?![\w-])/.test(x))],
]);
export const stopReasons = record => STOPS.filter(([, test]) => test({ metrics: {}, invalidations: [], ...record })).map(([reason]) => reason);
export const stopReasonsOf = invalidations => stopReasons({ invalidations });

// The result transport and the phase-aware supervisor (T9 fix rounds 1 and 2, Codex T9 r1 finding 1 and r2 findings 1 and 4).
// - The transport is page.exposeBinding('p0Push'), installed *before* navigation. The page pushes its result, its heartbeats, its window
//   declarations, G12's cycle-boundary checkpoints and visible's capture requests; Node never evaluates in the page while it waits. (A binding's
//   reply is itself delivered by an evaluation, which is why the page awaits every reply before it opens a measured window.)
// - Node owns a fixed window plan per gate (WINDOW_PLANS): the measured windows' names, their order and each one's maximum duration. The page
//   can declare only the next window of the plan, and cannot extend its bound.
// - Outside a window the page heartbeats, and a silence longer than roundTripMs is a classified browser hang (responsiveness, independent of the
//   total deadline). Inside a window the page is deliberately silent, so a stall there is bounded only by that window's fixed bound; G12's
//   sequence window additionally expects a cycle-boundary checkpoint within its fixed gap. G2's navigation window is armed by Node before goto
//   (armWindow) and has no opening exchange; the page only closes it after its first publication.
// - A duplicate, out-of-order or unexpected declaration, a heartbeat, checkpoint or capture where none is allowed, or a result while a window is
//   open, is refused and ends the wait (`harness timeout: window protocol: ...`). The absolute invocation deadline (deadlineMs) stays in place.
// - A terminal failure (protocol, crash, close, expiry) takes precedence over a queued result, which is returned with it as incomplete evidence.
// The window plans and their bounds live in supervision-plan.js (pure, shared with the drivers and the evidence checks).
export { WINDOW_PLANS, windowPlan } from './supervision-plan.js';
import { windowPlan } from './supervision-plan.js';
const TRANSPORTS = new WeakMap();
// T9 fix round 3 (Codex T9 r3, findings 1 and 2):
// - Expiry is latched by the channel's own timer, independently of any consumer loop, and every deadline is also checked *before* a message is
//   processed, so a late close or checkpoint can never clear or refresh an expired window, gap or silence. The silence bound applies while a
//   result is awaited (between waits the page may legitimately be quiet, e.g. G2 between its fresh run and its warm reload).
// - A clean result (no error, no invalidation of its own) is accepted only once the whole plan has run: every window declared, opened and
//   closed in order, and G12's sequence closed with all its checkpoints. An early result must carry its own explicit invalidation.
// - G12's checkpoints must be cycles 0, 1, 2, … in order, no more than planned.
// - The supervision record (every window's open/close times and checkpoints, and whether the plan completed) is returned as evidence.
export async function installTransport(page, { gate, plan = windowPlan(gate), roundTripMs = ROUND_TRIP_MS } = {}) {
  if (typeof page?.exposeBinding !== 'function') return null;
  const ch = { plan, next: 0, lastId: 0, open: null, lastHeard: Date.now(), waiting: false, roundTripMs, results: [], checkpoints: [], captures: [], failure: null, wake: new Set(), timer: null, windows: [] };
  const notify = () => { for (const wake of [...ch.wake]) wake(); };
  const fail = reason => { if (!ch.failure) { ch.failure = reason; clearTimeout(ch.timer); } notify(); };
  const refuse = reason => { fail(`harness timeout: window protocol: ${reason}`); return { ok: false, reason }; };
  // The deadline in force now, if any: a window's bound and checkpoint gap, or (while a result is awaited) the silence bound outside windows.
  const due = () => {
    const o = ch.open;
    if (o) {
      const close = { at: o.openedAt + o.boundMs, reason: `browser hang: measured window ${o.name} did not close within ${o.boundMs} ms` };
      const gap = o.checkpointMs ? { at: o.lastCheckpointAt + o.checkpointMs, reason: `browser hang: no checkpoint within ${o.checkpointMs} ms in window ${o.name}` } : null;
      return gap && gap.at < close.at ? gap : close;
    }
    return ch.waiting && !ch.results.length ? { at: ch.lastHeard + ch.roundTripMs, reason: `browser hang: the page did not answer within ${ch.roundTripMs} ms` } : null;
  };
  const check = (now = Date.now()) => { const d = due(); if (!ch.failure && d && now >= d.at) fail(d.reason); return !ch.failure; };
  const rearm = () => {
    clearTimeout(ch.timer); ch.timer = null;
    const d = due(); if (ch.failure || !d) return;
    ch.timer = setTimeout(() => { check(); rearm(); }, Math.max(1, d.at - Date.now()));
    ch.timer.unref?.();                                                              // never keeps a finished process alive
  };
  const planComplete = () => {
    if (ch.open) return `window ${ch.open.name} is open`;
    const unfinished = ch.windows.find(w => w.checkpoints !== undefined && w.expectedCheckpoints !== undefined && w.checkpoints < w.expectedCheckpoints);
    if (unfinished) return `window ${unfinished.name} closed after ${unfinished.checkpoints} of ${unfinished.expectedCheckpoints} checkpoints`;
    const declared = ch.windows.filter(w => w.closedAt !== null).length;
    return declared < ch.plan.length ? `${declared} of ${ch.plan.length} windows` : null;
  };
  Object.assign(ch, { fail, check, rearm, planComplete });
  await page.exposeBinding('p0Push', (_source, message) => {
    const type = message?.type, now = Date.now();
    check(now);                                                                      // an expired deadline is latched before anything can clear it
    const open = ch.open;
    if (ch.failure) { if (type === 'result') ch.results.push(message.result); return type === 'capture' ? 0 : { ok: false, reason: ch.failure }; }
    try {
      if (type === 'result') {
        ch.results.push(message.result);
        const r = message.result, explicit = Boolean(r?.error) || (Array.isArray(r?.invalidations) && r.invalidations.length > 0), missing = planComplete();
        if (open) refuse(`result while window ${open.name} is open`);
        else if (missing && !explicit) refuse(`a clean result before the window plan completed (${missing})`);
        else { ch.lastHeard = now; notify(); }
        return true;
      }
      if (type === 'heartbeat') { if (open) return refuse(`heartbeat inside window ${open.name}`); ch.lastHeard = now; return true; }
      if (type === 'window-open') {
        const { id, name } = message, expected = ch.plan[ch.next];
        if (open) return refuse(`window ${open.name} is already open (declared ${name})`);
        if (!Number.isInteger(id) || id <= ch.lastId) return refuse(`declaration id ${id} is not after ${ch.lastId}`);
        if (!expected || expected.implicit || expected.name !== name) return refuse(`unexpected window ${name} (expected ${expected?.name ?? 'none'})`);
        ch.open = { ...expected, id, openedAt: now, lastCheckpointAt: now, cycles: 0 }; ch.next++; ch.lastId = id;
        ch.windows.push({ name, id, openedAt: now, closedAt: null, ...(expected.checkpoints !== undefined ? { checkpoints: 0, expectedCheckpoints: expected.checkpoints } : {}) });
        notify();
        return { ok: true };
      }
      if (type === 'window-close') {
        const { id, name } = message;
        if (!open || open.name !== name) return refuse(`close of ${name} without an open window${open ? ` (${open.name} is open)` : ''}`);
        if (id !== open.id) return refuse(`close of ${name} with id ${id}, opened as ${open.id}`);
        const w = ch.windows.findLast(x => x.name === name && x.closedAt === null); w.closedAt = now; w.complete = w.checkpoints === undefined || w.checkpoints === w.expectedCheckpoints;
        ch.open = null; ch.lastHeard = now; notify();
        return { ok: true };
      }
      if (type === 'checkpoint') {
        if (!open || !open.checkpointMs) return refuse(open ? `checkpoint inside window ${open.name}, which takes none` : 'checkpoint outside a window that takes them');
        const cycle = message.checkpoint?.cycle;
        if (cycle !== open.cycles) return refuse(open.cycles >= open.checkpoints && Number.isInteger(cycle) && cycle >= open.checkpoints ? `checkpoint for cycle ${cycle} beyond the planned ${open.checkpoints}` : `checkpoint for cycle ${JSON.stringify(cycle)}, expected cycle ${open.cycles}`);
        if (open.cycles >= open.checkpoints) return refuse(`checkpoint for cycle ${cycle} beyond the planned ${open.checkpoints}`);
        open.cycles++; ch.windows.at(-1).checkpoints = open.cycles;
        ch.checkpoints.push(message.checkpoint); open.lastCheckpointAt = now; notify();
        return true;
      }
      if (type === 'capture') {
        if (open) { refuse(`capture inside window ${open.name}`); return 0; }
        ch.lastHeard = now;
        return new Promise(ack => { ch.captures.push({ seq: message.seq, name: message.name, ack }); notify(); });
      }
      return refuse(`unknown message ${JSON.stringify(type)}`);
    } finally { rearm(); }
  });
  page.on?.('crash', () => fail('browser hang or crash: the page crashed'));
  page.on?.('close', () => fail('browser hang or crash: the page closed'));
  TRANSPORTS.set(page, ch);
  return ch;
}
// G2: Node opens the navigation window itself, before goto (and before the warm reload), so nothing is exchanged inside navigation-to-publication.
export function armWindow(page, name) {
  const ch = TRANSPORTS.get(page); if (!ch) return false;
  const w = ch.plan.find(x => x.name === name && x.implicit);
  if (!w || ch.open) { ch.fail(`harness timeout: window protocol: cannot arm ${name}`); return false; }
  const now = Date.now();
  ch.open = { ...w, id: 0, openedAt: now, lastCheckpointAt: now, cycles: 0 };
  ch.windows.push({ name, id: 0, openedAt: now, closedAt: null });
  ch.next = ch.plan.indexOf(w) + 1; ch.rearm();
  return true;
}
// The supervision record of one wait, persisted beside the evidence.
const supervisionOf = ch => ({ plan: ch.plan.map(w => w.name), windows: ch.windows.map(w => ({ ...w })), complete: !ch.failure && ch.planComplete() === null, failure: ch.failure });

// Waits for the page's next result under the supervisor's bounds, with no page evaluation: checkpoints are persisted as they arrive (the last
// one is kept), capture requests are served by screenshotting #view (each bounded), and the first terminal failure ends the wait.
export async function waitResult(page, { gate, runDir, deadlineMs, roundTripMs = ROUND_TRIP_MS, writeFn = writeFile }) {
  const ch = TRANSPORTS.get(page), captures = []; let lastCheckpoint = null, written = 0;
  if (!ch) return { result: { error: `harness timeout: no result transport was installed before navigation (${gate})` }, captures, lastCheckpoint, supervision: null };
  const start = Date.now(), deadline = start + deadlineMs;
  ch.roundTripMs = roundTripMs; ch.lastHeard = Math.max(ch.lastHeard, start); ch.waiting = true; ch.rearm();
  const done = result => { ch.waiting = false; ch.rearm(); return { result, captures, lastCheckpoint, supervision: supervisionOf(ch) }; };
  for (;;) {
    while (ch.checkpoints.length) { const cp = ch.checkpoints.shift(); lastCheckpoint = cp; await writeFn(resolve(runDir, `checkpoint-${written++}.json`), JSON.stringify(cp)); }
    while (ch.captures.length && !ch.failure) {
      const request = ch.captures.shift();
      try {
        const png = await bounded(page.locator('#view').screenshot(), roundTripMs, 'browser hang: canvas capture');
        captures.push({ name: request.name, png }); request.ack(request.seq); ch.lastHeard = Date.now(); ch.rearm();
      } catch (e) { request.ack(0); ch.fail(e.message); }
    }
    ch.check();
    if (!ch.failure && Date.now() >= deadline) ch.fail(`browser hang: no result within the ${deadlineMs} ms outer deadline`);
    if (ch.failure) { const r = ch.results.shift(); return done(r && typeof r === 'object' ? { ...r, error: ch.failure } : { error: ch.failure }); }
    if (ch.results.length) return done(ch.results.shift());
    await new Promise(r => { const wake = () => { clearTimeout(timer); ch.wake.delete(wake); r(); }; const timer = setTimeout(wake, Math.max(1, deadline - Date.now())); ch.wake.add(wake); });
  }
}
