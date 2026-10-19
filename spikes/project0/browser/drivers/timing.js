// spikes/project0/browser/drivers/timing.js — G6 (9 trials), G7 (3 trials) and G9 (their 12 windows). A spec §7 stop or any trial failure
// ends the invocation: completed slots and the current failure are returned, and no further device is acquired. Dependencies are
// injected so this is tested in Node.
import { session, frameOf, sleep, failure } from './common.js';
import { posesAt, burstSchedule } from '../paths.js';
import { observeIntegrity, observeLongTasks, refreshHz } from '../integrity.js';
import * as events from '../events.js';
import { G6_WINDOW_TIMING, G7_BURST_TIMING, G9_LONG_TASK_TIMING } from '../../timing-contract.js';
const TIMING = { G6: G6_WINDOW_TIMING, G7: G7_BURST_TIMING };   // each slot's producer-supplied timing method (T9 registration)

const VIEWS = ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'];
export const LATE_LIMIT_MS = 4;                    // the frozen issuance-deviation limit for the G7 burst schedule

export async function followPath(s, fx, view, profile, seconds, override = {}) {
  const frames = [], t0 = performance.now(); let pending = 0, pendingMax = 0, off = null, endMs = null;
  try {
    await s.abort.race(new Promise(resolve => {
      const issue = () => {
        const now = performance.now(), t = (now - t0) / 1000;
        if (t >= seconds) { endMs = now; return resolve(); }
        pending++; pendingMax = Math.max(pendingMax, pending);
        s.renderer.render({ view, profile, camera: posesAt(fx, view, t), label: view, override });
      };
      off = s.renderer.onPublish(p => { if (p.label === view) { pending--; frames.push(frameOf(p)); issue(); } });
      issue();
    }));
  } finally { off?.(); }
  return { windowStart: t0, observedMs: endMs - t0, frames, pendingMax };   // observedMs: the measured path's span on the page clock
}

// Queue-completion and timestamp-query statistics are reported separately, each with its own sample count; never mixed.
export function bandDiagnostics(stats) {
  const pct = (xs, p) => xs.length ? xs[Math.ceil(p * xs.length) - 1] : null;
  const queue = stats.bands.filter(b => b.doneMs !== null).map(b => b.doneMs - b.submitMs).sort((a, b) => a - b);
  const gpu = stats.bands.map(b => b.gpuMs).filter(Number.isFinite).sort((a, b) => a - b);
  const max = queue.at(-1) ?? null;
  return { queueCompletion: { samples: queue.length, p99: pct(queue, 0.99), max }, timestampQuery: { samples: gpu.length, p99: pct(gpu, 0.99), max: gpu.at(-1) ?? null },
    warning: max !== null && max > 30 ? `queue-completion band duration ${max.toFixed(1)} ms exceeds the 30 ms warning` : null };
}

// The burst schedule. Every timer belongs to this invocation and is cancelled on abort; a callback that fires early re-arms for its
// absolute target, so a request is never issued before its frozen offset.
export async function runBursts(s, schedule, { log = events, now = () => performance.now() } = {}) {
  const timers = new Set(), issued = [], t0 = now() + 50;
  try {
    await s.abort.race(Promise.all(schedule.map(r => new Promise(resolve => {
      const target = t0 + r.offsetMs;
      const fire = () => {
        if (s.abort.aborted) return resolve();
        const t = now();
        if (t < target) { timers.add(setTimeout(fire, target - t)); return; }
        const requestId = s.renderer.render({ view: 'bulb-overview', profile: 'draft', camera: r.camera, label: 'bulb-overview' });
        const requestedMs = log.list().findLast(e => e.type === 'request' && e.requestId === requestId).t;   // function-entry time
        issued.push({ id: r.id, burst: r.burst, index: r.index, requestId, scheduledMs: target, firedMs: t, requestedMs }); resolve();
      };
      timers.add(setTimeout(fire, Math.max(0, target - now())));
    }))));
  } finally { for (const id of timers) clearTimeout(id); }
  return { t0, issued };
}

const stagesOf = requestId => {
  const ev = events.list();
  return { submittedMs: ev.find(e => e.type === 'submit' && e.requestId === requestId)?.t ?? null, completedMs: ev.find(e => e.type === 'complete' && e.requestId === requestId)?.t ?? null };
};

export async function runTiming(fx, status, { open, canvas, integrity = observeIntegrity, longTasks = observeLongTasks, hzOf = refreshHz }) {
  const lt = longTasks(), slots = [], tasksSeen = [];
  const hz = await hzOf(); let windows = 0;
  const stop = (slot, gate, s, error) => { slots.push({ slot, gate, raw: { error: failure(s, error) }, timingMethod: TIMING[gate] }); return { slots, invalidations: [failure(s, error)] }; };
  for (const view of VIEWS) for (let trial = 0; trial < 3; trial++) {
    const slot = `${view}/${trial}`; let s = null;
    try {
      s = await open();
      await followPath(s, fx, view, 'draft', 3);                                           // warm-up, discarded
      const watch = integrity(canvas);
      const r = await followPath(s, fx, view, 'draft', 30);
      const observed = watch.stop();
      tasksSeen.push(...lt.take(r.windowStart, r.windowStart + 30000)); windows++;
      const raw = await events.harness(async () => { const ts = await s.renderer.readTimestamps(); return { ...r, outstandingMax: s.renderer.stats().outstandingMax, integrity: observed, refreshHz: hz, timestamps: ts.method, diagnostics: bandDiagnostics(s.renderer.stats()) }; });
      slots.push({ slot, gate: 'G6', raw, timingMethod: G6_WINDOW_TIMING });
    } catch (error) { return stop(slot, 'G6', s, error); }
    finally { s?.close(); }
  }
  const schedule = burstSchedule(fx);
  for (let trial = 0; trial < 3; trial++) {
    let s = null, off = null; const slot = String(trial);
    try {
      s = await open();
      await followPath(s, fx, 'bulb-overview', 'draft', 3);
      const frames = []; off = s.renderer.onPublish(p => frames.push(frameOf(p)));
      const watch = integrity(canvas);
      const { t0, issued } = await runBursts(s, schedule);
      await s.abort.race(sleep(fx.bursts.quietMs));
      const observed = watch.stop(), end = performance.now();
      const tasks = lt.take(t0, end); tasksSeen.push(...tasks); windows++;
      const raw = await events.harness(async () => {
        await s.renderer.readTimestamps();
        const withStages = issued.sort((a, b) => a.id - b.id).map(r => {
          const late = r.firedMs - r.scheduledMs;
          const cause = late <= LATE_LIMIT_MS ? null : tasks.some(x => x.kind !== 'unattributed' && x.start < r.firedMs && x.start + x.ms > r.scheduledMs) ? 'application' : 'unknown';
          return { ...r, ...stagesOf(r.requestId), publishedMs: frames.find(f => f.requestId === r.requestId)?.t ?? null, lateByMs: late, lateCause: cause };
        });
        return { windowStart: t0, observedMs: end - t0, issued: withStages, frames, outstandingMax: s.renderer.stats().outstandingMax, integrity: observed, refreshHz: hz, diagnostics: bandDiagnostics(s.renderer.stats()) };
      });
      slots.push({ slot, gate: 'G7', raw, timingMethod: G7_BURST_TIMING });
    } catch (error) { off?.(); return stop(slot, 'G7', s, error); }
    finally { off?.(); s?.close(); }
  }
  slots.push({ slot: 'warmed', gate: 'G9', raw: { windows, longTasks: tasksSeen, harnessMeasures: lt.harnessMeasures(), longestTaskMs: Math.max(0, ...tasksSeen.map(x => x.ms)) }, timingMethod: G9_LONG_TASK_TIMING });
  return { slots, invalidations: [] };
}

export function run(gate, fx, params, status) {
  return runTiming(fx, status, { open: () => session(fx, status), canvas: document.getElementById('view') });
}
