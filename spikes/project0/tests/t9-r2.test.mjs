// spikes/project0/tests/t9-r2.test.mjs — T9 fix round 2 (Codex T9 r2, findings 2 and 3; the browser preflight's verdict): G12 awaits each
// cycle-boundary checkpoint reply before its next measured cycle; G9 is bound to non-overlapping source windows of the frozen durations and to
// the validity of its companion records; shortened observations are refused at the evidence boundary whatever the driver was told; G6 and G8
// trials stop on incomplete frames or stale publications; the integrity preflight's verdict is fail-closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAbort } from '../gpu/abort.js';
import { metricsFor } from '../measure/index.mjs';
import { evaluatePreflight } from '../integrity-preflight.mjs';
const { runTiming } = await import('../browser/drivers/timing.js');
const { runG8 } = await import('../browser/drivers/g8.js');
const { runG12 } = await import('../browser/drivers/g12.js');
const { finalise } = await import('../run.mjs');
import { burstSchedule } from '../browser/paths.js';

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const overviewCounts = (W, H) => { const total = W * H, hit = Math.round(total * 0.28); return { total, hit, miss: total - hit, point: 0, steps: 0, failure: 0 }; };
const sphereCounts = { total: 230400, hit: 58700, miss: 171700, point: 0, steps: 0, failure: 0 };
function fastSession(c = {}, { stale = false, incomplete = null } = {}) {
  const abort = createAbort(), handlers = new Set(), log = []; let n = 0;
  const renderer = { abort,
    render({ view, profile, label = view }) {
      const id = ++n, p = fixtures.profiles[profile]; c.renders = (c.renders ?? 0) + 1; log.push({ type: 'request', requestId: id, t: performance.now() });
      setTimeout(() => {
        log.push({ type: 'submit', requestId: id, epoch: 1, t: performance.now() });
        if (view !== 'bulb-stress' || stale) setTimeout(() => {
          const t = performance.now(), counts = view === 'sphere' ? sphereCounts : overviewCounts(p.W, p.H);
          for (const h of [...handlers]) h({ requestId: id, generation: id, epoch: 1, view, label, W: p.W, H: p.H, counts: incomplete === view ? { ...counts, total: counts.total - 1, miss: counts.miss - 1 } : counts, publishedMs: t });
        }, view === 'bulb-stress' ? 6 : 2);
      }, 1);
      return id;
    },
    onPublish(h) { handlers.add(h); return () => handlers.delete(h); }, stats: () => ({ outstandingMax: 2, bands: [] }), readTimestamps: async () => ({ method: 'timestamp-query', filled: 0 }) };
  return { abort, epoch: 1, renderer, events: { list: () => log.slice(), clear() { log.length = 0; } }, device: { queue: { onSubmittedWorkDone: async () => {} } },
    alloc: { inventory: () => ({ bytes: 1000, textures: 4, buffers: 5 }) }, watchdog: {}, losses: [], close() {} };
}
const quiet = () => ({ stop: () => ({ violations: [], events: [] }) });
const SCHEDULE = burstSchedule(fixtures).slice(0, 2 * fixtures.bursts.requestsPerBurst).map(r => ({ ...r, offsetMs: r.offsetMs / 10 }));
const shortened = (c, extra = {}) => ({ open: async () => { c.opened = (c.opened ?? 0) + 1; return fastSession(c); }, canvas: {}, integrity: quiet, longTasks: () => ({ take: () => [], harnessMeasures: () => 3 }),
  hzOf: async () => 60, warmupSeconds: 0.005, windowSeconds: 0.02, schedule: SCHEDULE, quietMs: 20, lateLimitMs: 1000, ...extra });

// G9's source windows at the frozen durations: nine 30 s G6 windows, then three G7 windows of the frozen burst duration, in order, disjoint.
function frozenSources() {
  let t = 1000; const out = [];
  for (const v of ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005']) for (let i = 0; i < 3; i++) { out.push({ gate: 'G6', slot: `${v}/${i}`, windowStart: t, windowEnd: t + 30012, valid: true }); t += 34000; }
  for (let i = 0; i < 3; i++) { out.push({ gate: 'G7', slot: String(i), windowStart: t, windowEnd: t + fixtures.bursts.durationMs + 5, valid: true }); t += 28000; }
  return out;
}
const g9 = (over = {}) => ({ windows: 12, longTasks: [{ ms: 60, start: 1010, kind: 'application' }], harnessMeasures: 3, sources: frozenSources(), ...over });

test('G9 accepts disjoint source windows of the frozen durations, and refuses overlapping, shortened or overlong ones', async () => {
  assert.equal((await metricsFor('G9', 'warmed', g9(), fixtures)).applicationOver50, 1);
  const tiny = frozenSources().map(x => ({ ...x, windowStart: 1000, windowEnd: 1001 }));                    // Codex: twelve overlapping 1 ms windows
  await assert.rejects(metricsFor('G9', 'warmed', g9({ sources: tiny }), fixtures), /G9: source window G6\/bulb-overview\/0 lasted 1 ms; the frozen G6 window is 30000 ms/);
  const overlap = frozenSources(); overlap[1].windowStart = overlap[0].windowEnd - 1; overlap[1].windowEnd = overlap[1].windowStart + 30012;
  await assert.rejects(metricsFor('G9', 'warmed', g9({ sources: overlap }), fixtures), /G9: source window G6\/bulb-overview\/1 overlaps the previous window/);
  const shortG7 = frozenSources(); shortG7[10].windowEnd = shortG7[10].windowStart + 2304;
  await assert.rejects(metricsFor('G9', 'warmed', g9({ sources: shortG7 }), fixtures), /G9: source window G7\/1 lasted 2304 ms; the frozen G7 window is at least 23040 ms/);
  const long = frozenSources(); long[0].windowEnd = long[0].windowStart + 45000;
  await assert.rejects(metricsFor('G9', 'warmed', g9({ sources: long }), fixtures), /G9: source window G6\/bulb-overview\/0 lasted 45000 ms/);
});

test('G6 and G7 refuse a shortened observation at the evidence boundary', async () => {
  const frame = (i, t) => ({ requestId: i, t, view: 'bulb-overview', label: 'bulb-overview', W: 640, H: 360, counts: overviewCounts(640, 360) });
  const g6 = observedMs => ({ windowStart: 1000, observedMs, warmupMs: 3005, config: { warmupSeconds: 3, windowSeconds: 30 }, frames: Array.from({ length: 950 }, (_, i) => frame(i + 1, 1000 + i * 31.5)), pendingMax: 1, outstandingMax: 2, integrity: { violations: [] } });
  assert.equal((await metricsFor('G6', 'bulb-overview/0', g6(30010), fixtures)).published, 950);
  await assert.rejects(metricsFor('G6', 'bulb-overview/0', g6(20), fixtures), /G6: the measured path covered 20 ms, not the frozen 30000 ms/);
  const issued = fixtures.bursts.requests.map((r, i) => { const s = 1000 + r.offsetMs; return { id: r.id, burst: r.burst, index: r.index, requestId: i + 1, scheduledMs: s, firedMs: s + 0.5, requestedMs: s + 0.6, submittedMs: s + 0.8, completedMs: s + 30, publishedMs: r.index === 19 ? s + 40 : null, lateByMs: 0.5, lateCause: null }; });
  issued.filter(r => r.index === 19).forEach(r => { r.completedMs = r.publishedMs - 1; });
  const g7 = observedMs => ({ windowStart: 1000, observedMs, warmupMs: 3005, config: { warmupSeconds: 3, quietMs: 1000, lateLimitMs: 4 }, issued, frames: issued.filter(r => r.index === 19).map(r => frame(r.requestId, r.publishedMs)), outstandingMax: 2, integrity: { violations: [] } });
  assert.equal((await metricsFor('G7', '0', g7(23100), fixtures)).requests, 400);
  await assert.rejects(metricsFor('G7', '0', g7(500), fixtures), /G7: the burst window covered 500 ms, not the frozen 23040 ms/);
});

test('a shortened timing invocation can never yield accepted evidence: its G6 and G9 records are invalid at finalise', async () => {
  const c = {}, out = await runTiming(fixtures, () => {}, shortened(c));
  assert.deepEqual(out.invalidations, []);                                             // the driver itself ran to completion
  const records = await finalise({ gate: 'timing', mode: 'headed', campaign: 'dev', runDir: '/unused/run', identity: {}, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures, experiment: false,
    outcome: { result: out }, write: async (dir, rec) => rec });
  const byId = Object.fromEntries(records.map(r => [`${r.gate}/${r.slot}`, r]));
  assert.ok(byId['G6/bulb-overview/0'].invalidations.some(x => /the measured path covered .* not the frozen 30000 ms/.test(x)), JSON.stringify(byId['G6/bulb-overview/0'].invalidations));
  assert.ok(byId['G9/warmed'].invalidations.length > 0);
  assert.ok(byId['G9/warmed'].invalidations.some(x => /G9: source window G6\/bulb-overview\/0 is invalid/.test(x)), JSON.stringify(byId['G9/warmed'].invalidations));
});

test('finalise binds G9 to its companion records: a missing or invalid companion invalidates G9, even when G9\'s own raw is clean', async () => {
  const records = await finalise({ gate: 'timing', mode: 'headed', campaign: 'dev', runDir: '/unused/run', identity: {}, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures, experiment: false,
    outcome: { result: { slots: [{ slot: 'bulb-overview/0', gate: 'G6', raw: { windowStart: 1000, observedMs: 30010, frames: [], pendingMax: 1, outstandingMax: 2 }, timingMethod: undefined },
      { slot: 'warmed', gate: 'G9', raw: g9(), timingMethod: { kind: 'long-task-timing' } }], invalidations: [] } }, write: async (dir, rec) => rec });
  const g9r = records.find(r => r.gate === 'G9');
  assert.ok(g9r.invalidations.some(x => /^G9: source window G6\/bulb-overview\/0 is invalid \(metrics: no integrity observation/.test(x)), JSON.stringify(g9r.invalidations));
  assert.ok(g9r.invalidations.some(x => /^G9: source window G6\/bulb-overview\/1 has no companion record/.test(x)));
});

test('G6: an incomplete frame in the measured window ends the invocation before the next acquisition, its raw kept', async () => {
  const c = {};
  const out = await runTiming(fixtures, () => {}, shortened(c, { open: async () => { c.opened = (c.opened ?? 0) + 1; return fastSession(c, { incomplete: 'bulb-overview' }); } }));
  assert.equal(c.opened, 1); assert.equal(out.slots.length, 1);
  assert.match(out.invalidations[0], /^trial invalid: G6\/bulb-overview\/0: \d+ incomplete frames? in the window/);
  assert.ok(out.slots[0].raw.frames.length > 0);
});

test('G8: a stale stress publication or an incomplete sphere frame ends G8 before the next acquisition, its raw kept', async () => {
  for (const [opts, why] of [[{ stale: true }, /^trial invalid: G8\/0: 1 stale publication/], [{ incomplete: 'sphere' }, /^trial invalid: G8\/0: the sphere frame is incomplete/]]) {
    let opened = 0;
    const out = await runG8(fixtures, () => {}, { open: async () => { opened++; return fastSession({}, opts); }, canvas: {}, integrity: quiet });
    assert.equal(opened, 1, JSON.stringify(opts)); assert.equal(out.slots.length, 1); assert.ok(out.slots[0].raw.sphere);
    assert.match(out.invalidations[0], why);
  }
});

test('G12 awaits each cycle-boundary checkpoint reply before its next measured cycle, under a bounded wait', async () => {
  const log = [];
  const sup = { window: async (name, fn) => { log.push(`open ${name}`); try { return await fn(); } finally { log.push(`close ${name}`); } },
    checkpoint: async cp => { log.push(`checkpoint ${cp.cycle}`); await sleep(30); log.push(`replied ${cp.cycle}`); } };
  const shortG12 = { ...fixtures, stability: { ...fixtures.stability, cycleCount: 3, cycleMs: 40, phaseOffsetsMs: [0, 10, 20, 30, 40], resourceEvery: 10 } };
  const good = fixtures.resources;
  const out = await runG12(shortG12, () => {}, { open: async () => fastSession(), canvas: { width: 1280, height: 720 }, integrity: quiet, target: {}, sup,
    prepareResourceCheck: async () => ({}), followPath: async (s, fx, view) => { log.push(`follow ${view}`); }, renderOnce: async () => ({}),
    exerciseResources: async () => ({ tableBytes: good.tableBytes, before: { bytes: 1, textures: 0, buffers: 1 }, after: { bytes: 1, textures: 0, buffers: 1 }, peakBytes: good.tableBytes + 1,
      written: Array(7).fill(true), checks: Array.from({ length: 63 }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160, cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] }) });
  assert.deepEqual(out.invalidations, []);
  const open = log.indexOf('open G12/sequence');
  for (const c of [0, 1]) {
    const replied = log.indexOf(`replied ${c}`), next = log.findIndex((x, k) => k > log.indexOf(`checkpoint ${c}`) && x.startsWith('follow'));
    assert.ok(replied > 0 && replied < next, `cycle ${c}: the reply precedes the next cycle (${log.join(', ')})`);
  }
  assert.ok(open >= 0 && log.indexOf('replied 2') < log.indexOf('close G12/sequence'));
  assert.equal(out.slots[0].raw.cycles, 3);
});

// The browser preflight's verdict (integrity-preflight.mjs) is computed from the page's raw observations and fails closed.
const pageRun = (over = {}) => ({ sameTaskRevert: { violations: ['unexpected backing 800x720 at 12'] }, undeliveredAtStop: { violations: ['unexpected backing 640x720 at 13'] },
  allowedResizes: { violations: [], events: [{ type: 'backing', value: '1920x1080', deliberate: true }, { type: 'backing', value: '960x540', deliberate: true }, { type: 'backing', value: '1280x720', deliberate: true }] },
  transport: 'p0Push', statusVisibility: { position: 'fixed', offsetParentNull: true, visible: true, controls: { visibleFixed: true, displayNone: false, visibilityHidden: false, zeroSize: false, opacityZero: false, offscreen: false } }, ...over });   // fix round 5: the status visibility sensor
test('the integrity preflight passes only when every assertion holds, on both loads, through the binding', () => {
  const ok = evaluatePreflight({ first: pageRun(), reload: pageRun(), evaluates: 0 });
  assert.equal(ok.pass, true, JSON.stringify(ok.assertions));
  assert.deepEqual(ok.assertions.map(a => a.name), ['same-task resize and restore is a violation', 'stop() drains undelivered mutations', 'deliberate allowed resizes are clean', 'the binding delivers before navigation', 'the binding delivers after a reload', 'no Node evaluation while waiting', 'the fixed-position #status reports visible; hidden controls do not']);   // fix round 5: one assertion added
  for (const bad of [{ first: pageRun({ sameTaskRevert: { violations: [] } }), reload: pageRun() }, { first: pageRun({ undeliveredAtStop: { violations: [] } }), reload: pageRun() },
    { first: pageRun({ allowedResizes: { violations: ['unexpected backing 1920x720 at 3'], events: [] } }), reload: pageRun() }, { first: pageRun(), reload: null }, { first: null, reload: null },
    { first: pageRun(), reload: pageRun(), evaluates: 1 }, { first: pageRun({ transport: 'none' }), reload: pageRun() }])
    assert.equal(evaluatePreflight({ evaluates: 0, ...bad }).pass, false, JSON.stringify(bad).slice(0, 120));
});
