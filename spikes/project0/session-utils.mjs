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
const G6_VIEWS = ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'];
// Fixed bounds, owned here: G6 is a 30 s path (+10 s), G7 the frozen 23.04 s burst schedule with its quiet period (+12 s), G8 a stress wait and a
// sphere publication of at most 5 s each plus a 2 s drain (+3 s), G10 one settled frame within its 20 s deadline (+5 s), G12 sixty 10 s cycles
// (+60 s) with a checkpoint at most 20 s apart, and G2 navigation to first publication within 45 s.
export const WINDOW_PLANS = Object.freeze({
  timing: [...G6_VIEWS.flatMap(v => [0, 1, 2].map(i => ({ name: `G6/${v}/${i}`, boundMs: 40000 }))), ...[0, 1, 2].map(i => ({ name: `G7/${i}`, boundMs: 35000 }))],
  G8: Array.from({ length: 10 }, (_, i) => ({ name: `G8/${i}`, boundMs: 15000 })),
  G10: G6_VIEWS.map(v => ({ name: `G10/${v}`, boundMs: 25000 })),
  G12: [{ name: 'G12/sequence', boundMs: 660000, checkpointMs: 20000 }],
  G2: [{ name: 'G2/navigation', boundMs: 45000, implicit: true }],
});
export const windowPlan = gate => (WINDOW_PLANS[gate] ?? []).map(w => ({ ...w }));
const TRANSPORTS = new WeakMap();
export async function installTransport(page, { gate, plan = windowPlan(gate) } = {}) {
  if (typeof page?.exposeBinding !== 'function') return null;
  const ch = { plan, next: 0, lastId: 0, open: null, lastHeard: Date.now(), results: [], checkpoints: [], captures: [], failure: null, wake: new Set() };
  const notify = () => { for (const wake of [...ch.wake]) wake(); };
  const fail = reason => { ch.failure ??= reason; notify(); };
  const refuse = reason => { fail(`harness timeout: window protocol: ${reason}`); return { ok: false, reason }; };
  ch.fail = fail;
  await page.exposeBinding('p0Push', (_source, message) => {
    const type = message?.type, now = Date.now(), open = ch.open;
    if (ch.failure) return type === 'capture' ? 0 : { ok: false, reason: ch.failure };
    if (type === 'result') {
      ch.results.push(message.result);
      if (open) refuse(`result while window ${open.name} is open`); else { ch.lastHeard = now; notify(); }
      return true;
    }
    if (type === 'heartbeat') { if (open) return refuse(`heartbeat inside window ${open.name}`); ch.lastHeard = now; return true; }
    if (type === 'window-open') {
      const { id, name } = message, expected = ch.plan[ch.next];
      if (open) return refuse(`window ${open.name} is already open (declared ${name})`);
      if (!Number.isInteger(id) || id <= ch.lastId) return refuse(`declaration id ${id} is not after ${ch.lastId}`);
      if (!expected || expected.implicit || expected.name !== name) return refuse(`unexpected window ${name} (expected ${expected?.name ?? 'none'})`);
      ch.open = { ...expected, id, openedAt: now, lastCheckpointAt: now }; ch.next++; ch.lastId = id; notify();
      return { ok: true };
    }
    if (type === 'window-close') {
      const { id, name } = message;
      if (!open || open.name !== name) return refuse(`close of ${name} without an open window${open ? ` (${open.name} is open)` : ''}`);
      if (id !== open.id) return refuse(`close of ${name} with id ${id}, opened as ${open.id}`);
      ch.open = null; ch.lastHeard = now; notify();
      return { ok: true };
    }
    if (type === 'checkpoint') {
      if (!open || !open.checkpointMs) return refuse(open ? `checkpoint inside window ${open.name}, which takes none` : 'checkpoint outside a window that takes them');
      ch.checkpoints.push(message.checkpoint); open.lastCheckpointAt = now; notify();
      return true;
    }
    if (type === 'capture') {
      if (open) { refuse(`capture inside window ${open.name}`); return 0; }
      ch.lastHeard = now;
      return new Promise(ack => { ch.captures.push({ seq: message.seq, name: message.name, ack }); notify(); });
    }
    return refuse(`unknown message ${JSON.stringify(type)}`);
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
  ch.open = { ...w, id: 0, openedAt: Date.now(), lastCheckpointAt: Date.now() };
  return true;
}

// Waits for the page's next result under the supervisor's bounds, with no page evaluation: checkpoints are persisted as they arrive (the last
// one is kept), capture requests are served by screenshotting #view (each bounded), and the first terminal failure ends the wait.
export async function waitResult(page, { gate, runDir, deadlineMs, roundTripMs = ROUND_TRIP_MS, writeFn = writeFile }) {
  const ch = TRANSPORTS.get(page), captures = []; let lastCheckpoint = null, written = 0;
  const done = result => ({ result, captures, lastCheckpoint });
  if (!ch) return done({ error: `harness timeout: no result transport was installed before navigation (${gate})` });
  const start = Date.now(), deadline = start + deadlineMs;
  ch.lastHeard = Math.max(ch.lastHeard, start);
  for (;;) {
    while (ch.checkpoints.length) { const cp = ch.checkpoints.shift(); lastCheckpoint = cp; await writeFn(resolve(runDir, `checkpoint-${written++}.json`), JSON.stringify(cp)); }
    while (ch.captures.length && !ch.failure) {
      const request = ch.captures.shift();
      try {
        const png = await bounded(page.locator('#view').screenshot(), roundTripMs, 'browser hang: canvas capture');
        captures.push({ name: request.name, png }); request.ack(request.seq); ch.lastHeard = Date.now();
      } catch (e) { request.ack(0); ch.fail(e.message); }
    }
    const now = Date.now(), open = ch.open;
    if (!ch.failure) {
      if (now >= deadline) ch.fail(`browser hang: no result within the ${deadlineMs} ms outer deadline`);
      else if (open && now >= open.openedAt + open.boundMs) ch.fail(`browser hang: measured window ${open.name} did not close within ${open.boundMs} ms`);
      else if (open?.checkpointMs && now >= open.lastCheckpointAt + open.checkpointMs) ch.fail(`browser hang: no checkpoint within ${open.checkpointMs} ms in window ${open.name}`);
      else if (!open && !ch.results.length && now >= ch.lastHeard + roundTripMs) ch.fail(`browser hang: the page did not answer within ${roundTripMs} ms`);
    }
    if (ch.failure) { const r = ch.results.shift(); return done(r && typeof r === 'object' ? { ...r, error: ch.failure } : { error: ch.failure }); }
    if (ch.results.length) return done(ch.results.shift());
    const due = Math.min(deadline, open ? Math.min(open.openedAt + open.boundMs, open.checkpointMs ? open.lastCheckpointAt + open.checkpointMs : Infinity) : ch.lastHeard + roundTripMs);
    await new Promise(r => { const wake = () => { clearTimeout(timer); ch.wake.delete(wake); r(); }; const timer = setTimeout(wake, Math.max(1, due - Date.now())); ch.wake.add(wake); });
  }
}
