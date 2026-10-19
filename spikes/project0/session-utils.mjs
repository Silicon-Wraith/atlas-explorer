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
]);
export const stopReasons = record => STOPS.filter(([, test]) => test({ metrics: {}, invalidations: [], ...record })).map(([reason]) => reason);
export const stopReasonsOf = invalidations => stopReasons({ invalidations });

// Polls the page with each round trip bounded; enforces the outer deadline even if the page never answers; serves presented-canvas
// capture requests (window.p0Capture) by screenshotting #view; keeps the last checkpoint.
export async function waitResult(page, { gate, runDir, deadlineMs, roundTripMs = ROUND_TRIP_MS, pollMs = gate === 'G12' ? 15000 : 1000, writeFn = writeFile }) {
  const start = Date.now(), captures = []; let checkpoints = 0, handled = 0, lastCheckpoint = null;
  for (;;) {
    let state;
    try { state = await bounded(page.evaluate(n => ({ result: window.p0Result ?? null, checkpoints: (window.p0Checkpoints || []).slice(n), capture: window.p0Capture ?? null }), checkpoints), roundTripMs, `browser hang: the page did not answer within ${roundTripMs} ms`); }
    catch (e) { return { result: { error: e.message.startsWith('browser hang') ? e.message : `browser hang or crash: ${e.message}` }, captures, lastCheckpoint }; }
    for (const cp of state.checkpoints) { lastCheckpoint = cp; await writeFn(resolve(runDir, `checkpoint-${checkpoints++}.json`), JSON.stringify(cp)); }
    if (state.capture && state.capture.seq > handled) {
      try {
        const png = await bounded(page.locator('#view').screenshot(), roundTripMs, 'browser hang: canvas capture');
        captures.push({ name: state.capture.name, png }); handled = state.capture.seq;
        await bounded(page.evaluate(seq => { window.p0CaptureAck = seq; }, handled), roundTripMs, 'browser hang: capture acknowledgement');
      } catch (e) { return { result: { error: e.message }, captures, lastCheckpoint }; }
    }
    if (state.result) return { result: state.result, captures, lastCheckpoint };
    if (Date.now() - start > deadlineMs) return { result: { error: `browser hang: no result within the ${deadlineMs} ms outer deadline` }, captures, lastCheckpoint };
    await new Promise(r => setTimeout(r, pollMs));
  }
}
