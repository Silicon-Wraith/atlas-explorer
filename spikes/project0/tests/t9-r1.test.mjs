// spikes/project0/tests/t9-r1.test.mjs — T9 fix round 1 (Codex T9 r1, findings 3-5): every completed trial is validated before the next acquisition
// and an invalid one ends the invocation with its raw evidence kept; a late G7 issuance is refused at once; G9 is bound to the identity and validity
// of its twelve source windows; every G12 maintenance exercise is checked against all the G11 rules before anything else runs; a software adapter
// is refused right after acquisition, before any preparation or submission, and its record is a classified stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAbort } from '../gpu/abort.js';
import { stopReasons, stopReasonsOf } from '../session-utils.mjs';
import { metricsFor } from '../measure/index.mjs';
import { g1Metrics } from '../measure/timing.mjs';
import { burstSchedule } from '../browser/paths.js';
const { runTiming, runBursts } = await import('../browser/drivers/timing.js');
const { runG8 } = await import('../browser/drivers/g8.js');
const { runG10 } = await import('../browser/drivers/g10.js');
const { runG12 } = await import('../browser/drivers/g12.js');
const { finalise } = await import('../run.mjs');

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const draft = fixtures.profiles.draft;
const overviewCounts = (W, H) => { const total = W * H, hit = Math.round(total * 0.28); return { total, hit, miss: total - hit, point: 0, steps: 0, failure: 0 }; };
const sphereCounts = { total: 230400, hit: 58700, miss: 171700, point: 0, steps: 0, failure: 0 };

// A renderer that submits after 1 ms and publishes 2 ms later (never for the stress view); `c` counts renders and acquisitions.
function fastSession(c = {}) {
  const abort = createAbort(), handlers = new Set(), log = []; let n = 0;
  const renderer = { abort,
    render({ view, profile, label = view }) {
      const id = ++n, p = fixtures.profiles[profile]; c.renders = (c.renders ?? 0) + 1; log.push({ type: 'request', requestId: id, t: performance.now() });
      setTimeout(() => { log.push({ type: 'submit', requestId: id, epoch: 1, t: performance.now() }); if (view !== 'bulb-stress') setTimeout(() => { const t = performance.now(); for (const h of [...handlers]) h({ requestId: id, generation: id, epoch: 1, view, label, W: p.W, H: p.H, counts: view === 'sphere' ? sphereCounts : overviewCounts(p.W, p.H), publishedMs: t }); }, 2); }, 1);
      return id;
    },
    onPublish(h) { handlers.add(h); return () => handlers.delete(h); }, stats: () => ({ outstandingMax: 2, bands: [] }), readTimestamps: async () => ({ method: 'timestamp-query', filled: 0 }) };
  return { abort, epoch: 1, renderer, events: { list: () => log.slice(), clear() { log.length = 0; } }, device: { queue: { onSubmittedWorkDone: async () => {} } },
    alloc: { inventory: () => ({ bytes: 1000, textures: 4, buffers: 5 }) }, watchdog: {}, losses: [], close() {} };
}
const quiet = () => ({ stop: () => ({ violations: [], events: [] }) });
// An integrity observer that reports `violation` on its `which`-th use (0-based) and is clean otherwise.
const interfered = (which, violation = 'window blurred at 5') => { let k = 0; return () => { const mine = k++ === which; return { stop: () => ({ violations: mine ? [violation] : [], events: [] }) }; }; };
// A compressed, two-burst schedule (offsets / 10) so the whole timing invocation runs in about a second.
const SCHEDULE = burstSchedule(fixtures).slice(0, 2 * fixtures.bursts.requestsPerBurst).map(r => ({ ...r, offsetMs: r.offsetMs / 10 }));
const timingDeps = (c, extra = {}) => ({ open: async () => { c.opened = (c.opened ?? 0) + 1; return fastSession(c); }, canvas: {}, integrity: quiet, longTasks: () => ({ take: () => [], harnessMeasures: () => 3 }),
  hzOf: async () => 60, warmupSeconds: 0.005, windowSeconds: 0.02, schedule: SCHEDULE, quietMs: 20, lateLimitMs: 1000, ...extra });   // a loaded test host's timer lateness is not under test here

test('a clean timing invocation: 9 G6 and 3 G7 trials, then G9 bound to its twelve source windows in order', async () => {
  const c = {}, out = await runTiming(fixtures, () => {}, timingDeps(c));
  assert.deepEqual(out.invalidations, []); assert.equal(c.opened, 12);
  const g9 = out.slots.at(-1);
  assert.equal(g9.gate, 'G9');
  assert.deepEqual(g9.raw.sources.map(x => `${x.gate}/${x.slot}`), [...['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'].flatMap(v => [0, 1, 2].map(i => `G6/${v}/${i}`)), 'G7/0', 'G7/1', 'G7/2']);
  assert.ok(g9.raw.sources.every(x => x.valid === true && x.windowEnd > x.windowStart));
  // fix round 2 (Codex T9 r2): the shortened run's observations are never accepted by Node, whatever the driver was told
  await assert.rejects(metricsFor('G9', 'warmed', g9.raw, fixtures), /G9: source window G6\/bulb-overview\/0 lasted [\d.]+ ms; the frozen G6 window is 30000 ms/);
});

test('an integrity violation in the first G6 trial ends the invocation: one acquisition, its raw kept, no G9 slot', async () => {
  const c = {}, out = await runTiming(fixtures, () => {}, timingDeps(c, { integrity: interfered(0) }));
  assert.equal(c.opened, 1); assert.deepEqual(out.slots.map(s => `${s.gate}/${s.slot}`), ['G6/bulb-overview/0']);
  assert.deepEqual(out.slots[0].raw.integrity.violations, ['window blurred at 5']); assert.ok(out.slots[0].raw.frames.length > 0, 'the raw evidence is kept');
  assert.match(out.invalidations[0], /^trial invalid: G6\/bulb-overview\/0: window blurred at 5$/);
});

test('an integrity violation in a G7 trial ends the invocation before the next acquisition, and no G9 slot is produced', async () => {
  const c = {}, out = await runTiming(fixtures, () => {}, timingDeps(c, { integrity: interfered(10) }));   // uses 0-8 are G6, 9 is G7/0, 10 is G7/1
  assert.equal(c.opened, 11); assert.equal(out.slots.at(-1).gate, 'G7'); assert.equal(out.slots.at(-1).slot, '1');
  assert.ok(!out.slots.some(s => s.gate === 'G9'));
  assert.match(out.invalidations[0], /^trial invalid: G7\/1: window blurred at 5$/);
});

test('runBursts refuses a request that would fire more than 4 ms late at once: nothing further is issued and every timer is cancelled', async () => {
  const abort = createAbort(); let renders = 0, n = 0; const log = [];
  const s = { abort, renderer: { render: () => { renders++; log.push({ type: 'request', requestId: ++n, t: performance.now() }); return n; } } };
  const now = () => performance.now() + (renders >= 3 ? 50 : 0);                    // from the fourth request on, every fire is 50 ms late (limit 20 here)
  const before = process.getActiveResourcesInfo().filter(x => x === 'Timeout').length;
  const error = await runBursts(s, burstSchedule(fixtures).slice(0, 20), { log: { list: () => log }, now, lateLimitMs: 20 }).then(() => null, e => e);   // the frozen 8 ms spacing: a deterministic order
  assert.match(error?.message ?? '', /^G7 schedule deviation: request 3 fired \d+\.\d+ ms late \(limit 20 ms\)/);
  assert.equal(error.scheduleDeviation.id, 3); assert.equal(error.issued.length, 3);
  const at = renders; await new Promise(r => setTimeout(r, 100));
  assert.equal(renders, at); assert.equal(renders, 3);
  assert.ok(process.getActiveResourcesInfo().filter(x => x === 'Timeout').length <= before, 'burst timers were cancelled');
});

test('a late G7 issuance ends the timing invocation with the trial\'s partial evidence and an explicit, classified deviation', async () => {
  const c = {}; let late = false;                                                   // 70 ms after the first G7 acquisition: inside its quiet period
  const out = await runTiming(fixtures, () => {}, timingDeps(c, { open: async () => { c.opened = (c.opened ?? 0) + 1; if (c.opened === 10) setTimeout(() => { late = true; }, 70); return fastSession(c); },
    now: () => performance.now() + (late ? 50 : 0), lateLimitMs: 20 }));
  assert.equal(c.opened, 10); const last = out.slots.at(-1);
  assert.equal(`${last.gate}/${last.slot}`, 'G7/0'); assert.ok(last.raw.deviation && last.raw.issued.length < SCHEDULE.length);
  assert.match(out.invalidations[0], /^G7 schedule deviation: request \d+ fired .* late \(limit 20 ms\) \(cause: unknown\); not accepted as execution of the frozen schedule$/);
  assert.ok(!out.slots.some(s => s.gate === 'G9'));
});

const sources = () => [...['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'].flatMap(v => [0, 1, 2].map(i => ({ gate: 'G6', slot: `${v}/${i}` }))), ...['0', '1', '2'].map(slot => ({ gate: 'G7', slot }))]
  .map((x, i) => ({ ...x, windowStart: i * 34000, windowEnd: i * 34000 + (x.gate === 'G6' ? 30012 : 23045), valid: true }));   // fix round 2: the frozen durations
test('G9 refuses windows that are missing, invalid, of the wrong identity or order, or tasks outside every source window', async () => {
  const raw = (over = {}) => ({ windows: 12, longTasks: [{ ms: 60, start: 10, kind: 'application' }], harnessMeasures: 3, sources: sources(), ...over });
  assert.equal((await metricsFor('G9', 'warmed', raw(), fixtures)).applicationOver50, 1);
  await assert.rejects(metricsFor('G9', 'warmed', raw({ sources: undefined }), fixtures), /G9: the twelve source windows are not recorded/);
  const invalid = sources(); invalid[4].valid = false;
  await assert.rejects(metricsFor('G9', 'warmed', raw({ sources: invalid }), fixtures), /G9: source window G6\/bulb-detail-0.05\/1 is not valid/);
  const swapped = sources(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  await assert.rejects(metricsFor('G9', 'warmed', raw({ sources: swapped }), fixtures), /G9: source window 0 is G6\/bulb-overview\/1, expected G6\/bulb-overview\/0/);
  await assert.rejects(metricsFor('G9', 'warmed', raw({ longTasks: [{ ms: 60, start: 31000, kind: 'application' }] }), fixtures), /G9: a long task at 31000 lies outside every source window/);
});

test('G8: an integrity violation in a repetition ends G8 before the next acquisition, its raw kept', async () => {
  const c = {}; let opened = 0;
  const out = await runG8(fixtures, () => {}, { open: async () => { opened++; return fastSession(c); }, canvas: {}, integrity: interfered(1) });
  assert.equal(opened, 2); assert.deepEqual(out.slots.map(s => s.slot), ['0', '1']);
  assert.deepEqual(out.slots[1].raw.integrity.violations, ['window blurred at 5']); assert.ok(out.slots[1].raw.sphere);
  assert.match(out.invalidations[0], /^trial invalid: G8\/1: window blurred at 5$/);
});

test('G10: an integrity violation in a view ends G10 before the next view is rendered, its raw kept', async () => {
  const c = {};
  const out = await runG10(fixtures, () => {}, { open: async () => fastSession(c), canvas: {}, integrity: interfered(0) });
  assert.equal(c.renders, 1); assert.deepEqual(out.slots.map(s => s.slot), ['bulb-overview']); assert.ok(out.slots[0].raw.frame);
  assert.match(out.invalidations[0], /^trial invalid: G10\/bulb-overview: window blurred at 5$/);
});

// G12: each maintenance result is checked against every G11 rule at once (Codex reproduction: failed checks with an empty errors array).
const R = fixtures.resources, textures = R.entries.filter(e => e.kind === 'texture').length;
const good = () => ({ tableBytes: R.tableBytes, before: { bytes: 1, textures: 0, buffers: 1 }, after: { bytes: 1, textures: 0, buffers: 1 }, peakBytes: R.tableBytes + 1, written: Array(textures).fill(true), checks: Array.from({ length: R.readback.x.length * R.readback.y.length * textures }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160, cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] });
const shortG12 = { ...fixtures, stability: { ...fixtures.stability, cycleCount: 2, cycleMs: 40, phaseOffsetsMs: [0, 10, 20, 30, 40], resourceEvery: 1 } };
async function g12With(results) {
  const c = {}, s = fastSession(c); let follows = 0, exercises = 0, once = 0;
  const out = await runG12(shortG12, () => {}, { open: async () => s, canvas: { width: 1280, height: 720 }, integrity: quiet, target: {},
    prepareResourceCheck: async () => ({}), followPath: async () => { follows++; }, renderOnce: async () => { once++; return {}; },
    exerciseResources: async () => results[Math.min(exercises++, results.length - 1)] });
  return { out, c, follows, exercises, once };
}
test('G12: a content mismatch, an inventory mismatch or a malformed maintenance result ends the sequence at once, the result kept', async () => {
  const mismatch = good(); mismatch.checks[5] = { ok: false };
  const leaked = good(); leaked.after = { bytes: 2, textures: 0, buffers: 2 };
  const band = good(); band.bandOk = false;
  const malformed = good(); delete malformed.checks;
  for (const [bad, why] of [[mismatch, /mismatches 1/], [leaked, /released 0/], [band, /mismatches 1/], [malformed, /expected 63 selected checks/]]) {
    const { out, c, follows, exercises, once } = await g12With([bad]);
    assert.equal(exercises, 1); assert.equal(follows, 1, 'only the baseline path ran before the maintenance'); assert.equal(once, 1); assert.equal(c.renders ?? 0, 0);
    assert.deepEqual(out.slots[0].raw.maintenance, [bad]);
    assert.match(out.invalidations[0], /^driver error: G12 maintenance failed the G11 rules: /); assert.match(out.invalidations[0], why);
  }
  const later = await g12With([good(), mismatch]);                                   // the first cycle's maintenance fails: no second cycle
  assert.equal(later.exercises, 2); assert.equal(later.out.slots[0].raw.maintenance.length, 2);
  assert.equal(later.out.slots[0].raw.cycles, 0, 'the failing cycle\'s checkpoint is not reached');
  assert.match(later.out.invalidations[0], /G12 maintenance failed the G11 rules/);
});

// G1: a software adapter is refused straight after acquisition.
const SOFTWARE = { vendor: 'google', architecture: 'swiftshader', device: '', description: 'SwiftShader Device (Subzero)', isFallbackAdapter: true };
test('g1Metrics records an explicit software-adapter invalidation, independent of corroboration errors, and the record is a classified stop', async () => {
  const r = g1Metrics({ adapterInfo: SOFTWARE, chromeGpuText: '', probeOk: false });
  assert.equal(r.metrics.software, 1); assert.ok(r.invalidations.some(x => /^software adapter: isFallbackAdapter is true/.test(x)), JSON.stringify(r.invalidations));
  const [record] = await finalise({ gate: 'G1', mode: 'headed', campaign: 'dev', runDir: '/unused/run', identity: {}, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures, experiment: false,
    outcome: { result: { slots: [{ slot: 'headed', raw: { adapterInfo: SOFTWARE, probeOk: false }, timingMethod: { kind: 'correctness-only' } }], invalidations: [] } }, write: async (dir, rec) => rec });
  assert.ok(stopReasons(record).includes('software execution detected'), JSON.stringify(record.invalidations));
});

test('the G1 driver refuses a software adapter before any preparation or submission', async () => {
  const c = { compiles: 0, submits: 0, pipelines: 0, destroyed: 0 };
  const device = { lost: new Promise(() => {}), addEventListener() {}, limits: {}, features: new Set(), destroy() { c.destroyed++; },
    createShaderModule() { c.compiles++; return { getCompilationInfo: async () => ({ messages: [] }) }; }, createComputePipelineAsync: async () => { c.pipelines++; return {}; }, queue: { submit() { c.submits++; }, onSubmittedWorkDone: async () => {} } };
  const adapter = { info: SOFTWARE, features: new Set(), requestDevice: async () => device };
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { gpu: { requestAdapter: async () => adapter } }, configurable: true, writable: true });
  try {
    const { run } = await import('../browser/drivers/g1.js');
    const out = await run('G1', fixtures, new URLSearchParams('runMode=headed'), () => {});
    assert.deepEqual([c.compiles, c.pipelines, c.submits], [0, 0, 0]); assert.equal(c.destroyed, 1);
    assert.equal(out.slots[0].slot, 'headed'); assert.equal(out.slots[0].raw.probeOk, false); assert.match(out.slots[0].raw.software, /isFallbackAdapter is true/);
    assert.deepEqual(stopReasonsOf(out.invalidations), ['software execution detected']);
    assert.match(out.invalidations[0], /^software adapter: isFallbackAdapter is true/);
  } finally { if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator; }
});

test('visible: the presented capture is acknowledged through the binding\'s reply; a missing or silent transport is a harness timeout', async () => {
  const { presentedCapture } = await import('../browser/drivers/visible.js');
  const saved = globalThis.window; const s = { abort: createAbort() };
  try {
    globalThis.window = { p0Push: async m => m.seq };
    await presentedCapture(s, 'sphere', 1);
    globalThis.window = {};
    await assert.rejects(presentedCapture({ abort: createAbort() }, 'sphere', 1), /harness timeout: no presented-capture transport/);
    globalThis.window = { p0Push: () => new Promise(() => {}) };
    const a = createAbort();
    await assert.rejects(presentedCapture({ abort: a }, 'sphere', 2, { timeoutMs: 30 }), /harness[- ]timeout/);
    assert.equal(a.invalidation(), 'harness timeout: presented capture sphere was not acknowledged within 30 ms');   // what the driver records via failure()
    assert.deepEqual(stopReasonsOf([a.invalidation()]), ['harness timeout']);
  } finally { if (saved === undefined) delete globalThis.window; else globalThis.window = saved; }
});
