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

// The result transport (T9 fix round 1, Codex T9 r1 finding 1): installed with page.exposeBinding *before* navigation, so the page can push
// its result, its bounded checkpoints and its presented-canvas capture requests (window.p0Push) outside its measured windows, and Node never
// evaluates in the page while a gate runs. A capture request is answered through the binding's reply once Node has screenshotted #view.
// A page without exposeBinding (a test fake) gets no transport, and waitResult then fails closed.
const TRANSPORTS = new WeakMap();
export async function installTransport(page) {
  if (typeof page?.exposeBinding !== 'function') return null;
  const ch = { results: [], checkpoints: [], captures: [], failure: null, wake: new Set() };
  const notify = () => { for (const wake of [...ch.wake]) wake(); };
  await page.exposeBinding('p0Push', (_source, message) => {
    const type = message?.type;
    if (type === 'result') { ch.results.push(message.result); notify(); return true; }
    if (type === 'checkpoint') { ch.checkpoints.push(message.checkpoint); notify(); return true; }
    if (type === 'capture') return new Promise(ack => { ch.captures.push({ seq: message.seq, name: message.name, ack }); notify(); });
    return false;
  });
  page.on?.('crash', () => { ch.failure ??= 'browser hang or crash: the page crashed'; notify(); });
  page.on?.('close', () => { ch.failure ??= 'browser hang or crash: the page closed'; notify(); });
  TRANSPORTS.set(page, ch);
  return ch;
}

// Waits for the page's next pushed result under the Node-owned outer deadline, with no page evaluation: checkpoints are persisted as they
// arrive (the last one is kept), capture requests are served by screenshotting #view (each bounded), and a crash or close ends the wait at
// once. Results are consumed in order, so a reload's result is the next wait's.
export async function waitResult(page, { gate, runDir, deadlineMs, roundTripMs = ROUND_TRIP_MS, writeFn = writeFile }) {
  const ch = TRANSPORTS.get(page), captures = []; let lastCheckpoint = null, written = 0;
  const done = result => ({ result, captures, lastCheckpoint });
  if (!ch) return done({ error: `harness timeout: no result transport was installed before navigation (${gate})` });
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    while (ch.checkpoints.length) { const cp = ch.checkpoints.shift(); lastCheckpoint = cp; await writeFn(resolve(runDir, `checkpoint-${written++}.json`), JSON.stringify(cp)); }
    while (ch.captures.length) {
      const request = ch.captures.shift();
      try {
        const png = await bounded(page.locator('#view').screenshot(), roundTripMs, 'browser hang: canvas capture');
        captures.push({ name: request.name, png }); request.ack(request.seq);
      } catch (e) { request.ack(0); return done({ error: e.message }); }
    }
    if (ch.results.length) return done(ch.results.shift());
    if (ch.failure) return done({ error: ch.failure });
    const left = deadline - Date.now();
    if (left <= 0) return done({ error: `browser hang: no result within the ${deadlineMs} ms outer deadline` });
    await new Promise(r => { const wake = () => { clearTimeout(timer); ch.wake.delete(wake); r(); }; const timer = setTimeout(wake, left); ch.wake.add(wake); });
  }
}
