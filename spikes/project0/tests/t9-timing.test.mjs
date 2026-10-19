// spikes/project0/tests/t9-timing.test.mjs — T9: the timing-method registration of G1, G2, G6-G10, G12 and visible (T6 report, "Registration
// contract for T7-T9"), and the abort races added to the T9 drivers (controller ruling 3, the T8 pattern).
// - G2, G6-G10 and G12 carry durations that gate rules bound, so each has one measured page-clock descriptor naming the top-level raw value its
//   driver records; no gate duration uses GPU timestamp queries (readTimestamps feeds only the separate band diagnostics).
// - G1 and visible carry no timing measurement: correctness-only.
// A clean record of every gate, in its driver's slot shape, is written clean through the real finalise/writeRecord and accepted at read time with
// its raw payload; wrong descriptors are refused; the drivers attach the descriptor on success and failure paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import * as contract from '../timing-contract.js';
import { gatePlan } from '../gates.js';
import { validateEvidence } from '../gates-checked.js';
import { stopReasonsOf } from '../session-utils.mjs';
const { EXPECTED_TIMING, CORRECTNESS_ONLY, QUEUE_COMPLETION_WORKMS, notMeasured, validateRecordTiming, validateTimingMethod } = contract;
const { finalise } = await import('../run.mjs');
const { createAbort } = await import('../gpu/abort.js');
const { runG8 } = await import('../browser/drivers/g8.js');
const { runG10 } = await import('../browser/drivers/g10.js');
const { runG12 } = await import('../browser/drivers/g12.js');
const { runTiming, followPath } = await import('../browser/drivers/timing.js');

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const plan = gatePlan(fixtures);
async function scratch() { const b = resolve(ROOT, 'artifacts/runtime'); await mkdir(b, { recursive: true }); return mkdtemp(join(b, 'p0-t9-timing-test-')); }
const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40),
  implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), mode: 'headed', browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' };

const MEASURED = { G2: contract.G2_NAVIGATION_TIMING, G6: contract.G6_WINDOW_TIMING, G7: contract.G7_BURST_TIMING, G8: contract.G8_REPLACEMENT_TIMING,
  G9: contract.G9_LONG_TASK_TIMING, G10: contract.G10_SETTLED_TIMING, G12: contract.G12_WALL_TIMING };
const FIELDS = { G2: 'navigationMs', G6: 'observedMs', G7: 'observedMs', G8: 'latencyMs', G9: 'longestTaskMs', G10: 'elapsedMs', G12: 'wallMs' };

// Raw payloads in the drivers' shapes, clean.
const ACTIVE = 'VENDOR= 0x10de [Google Inc. (NVIDIA)], DEVICE=0x26b1 [ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA RTX 6000 Ada Generation (0x000026B1)), NVIDIA-580.173.2.0)], DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.173.2.0 *ACTIVE*';
const gpuText = ['Graphics Feature Status', '*   WebGPU: Hardware accelerated', '', 'GPU0                            :', ACTIVE, ''].join('\n');
const draft = fixtures.profiles.draft, settled = fixtures.profiles.settled, ok = { violations: [], events: [] };
const overview = (requestId, t, W = draft.W, H = draft.H) => { const total = W * H, hit = Math.round(total * 0.28); return { requestId, t, view: 'bulb-overview', label: 'bulb-overview', W, H, counts: { total, hit, miss: total - hit, point: 0, steps: 0, failure: 0 } }; };
const sphere = (requestId, t) => ({ requestId, t, view: 'sphere', label: 'sphere', W: draft.W, H: draft.H, counts: { total: 230400, hit: 58700, miss: 171700, point: 0, steps: 0, failure: 0 } });
function g7raw(start = 1000) {   // fix round 3: placed at its G9 source interval when it is a companion
  const issued = fixtures.bursts.requests.map((r, i) => {
    const scheduledMs = start + r.offsetMs, firedMs = scheduledMs + 0.5, requestedMs = firedMs + 0.1;
    return { id: r.id, burst: r.burst, index: r.index, requestId: i + 1, scheduledMs, firedMs, requestedMs, submittedMs: requestedMs + 0.2, completedMs: requestedMs + 30, publishedMs: null, lateByMs: 0.5, lateCause: null };
  });
  const finals = issued.filter(r => r.index === 19);
  finals.forEach((r, b) => { r.publishedMs = r.requestedMs + 40 + b; r.completedMs = r.publishedMs - 1; });
  return { issued, frames: finals.map(r => overview(r.requestId, r.publishedMs)), outstandingMax: 2, integrity: ok, windowStart: start, observedMs: fixtures.bursts.durationMs + 5, warmupMs: 3005, config: { warmupSeconds: 3, quietMs: 1000, lateLimitMs: 4 } };
}
const R = fixtures.resources, textures = R.entries.filter(e => e.kind === 'texture').length;
const good = { tableBytes: R.tableBytes, before: { bytes: 1, textures: 0, buffers: 1 }, after: { bytes: 1, textures: 0, buffers: 1 }, peakBytes: R.tableBytes + 1, written: Array(textures).fill(true), checks: Array.from({ length: R.readback.x.length * R.readback.y.length * textures }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160, cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] };
const RAW = {
  G1: () => ({ adapterInfo: { vendor: 'nvidia', architecture: 'lovelace', device: '0x26b1', description: 'NVIDIA RTX 6000 Ada Generation', isFallbackAdapter: false, fallbackSource: 'adapter.info.isFallbackAdapter' }, probeOk: true }),
  G2: () => ({ navigationMs: 900, statusLog: [{ t: 5, text: 'preparing: acquiring GPU', visible: true }], frame: overview(1, 900), outstandingMax: 2, integrity: ok, emptyProfile: 1, freshProcess: 1 }),
  G6: (start = 1000) => ({ windowStart: start, observedMs: 30012, warmupMs: 3005, config: { warmupSeconds: 3, windowSeconds: 30 }, frames: Array.from({ length: 950 }, (_, i) => overview(i + 1, start + i * 31.5)), pendingMax: 1, outstandingMax: 2, integrity: ok, refreshHz: 60, timestamps: 'timestamp-query', diagnostics: {} }),
  G7: g7raw,
  G8: () => ({ stressRequestId: 1, stressSubmit: { requestId: 1, epoch: 1, t: 1000 }, sphereRequestId: 2, sphereRequested: 1050, latencyMs: 150, sphere: sphere(2, 1200), stalePublications: 0, outstandingMax: 2, integrity: ok }),
  G9: () => ({ windows: 12, sources: [...['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'].flatMap(v => [0, 1, 2].map(i => ({ gate: 'G6', slot: `${v}/${i}` }))), ...['0', '1', '2'].map(slot => ({ gate: 'G7', slot }))]
  .map((x, i) => ({ ...x, windowStart: i * 34000, windowEnd: i * 34000 + (x.gate === 'G6' ? 30012 : 23045), valid: true })),
    longTasks: [{ ms: 30, start: 1, kind: 'application' }], harnessMeasures: 24, longestTaskMs: 30 }),   // fix round 1: G9 names its source windows
  G10: () => ({ requestedMs: 100, elapsedMs: 900, frame: overview(1, 1000, settled.W, settled.H), prepared: 1, outstandingMax: 2, integrity: ok }),
  G12: () => ({ cycles: 60, wallMs: 600000, deadlineMisses: 0, unhandled: 0, unplannedLosses: 0, baseline: { bytes: 1000, textures: 4, buffers: 5 }, final: { bytes: 1000, textures: 4, buffers: 5 }, baselinePrepared: 1, returned1280: 1, outstandingMax: 2, integrity: ok, maintenance: Array(7).fill(good), cycleLog: Array.from({ length: 60 }, (_, cycle) => ({ cycle, c0: cycle * 10000, overrun: false, phases: ['bulb-overview', 'sphere', 'bulb-detail-0.005'].map((view, k) => ({ view, plannedStartMs: cycle * 10000 + [0, 3000, 4000][k], plannedEndMs: cycle * 10000 + [3000, 4000, 7000][k], startMs: cycle * 10000 + [0, 3000, 4000][k], endMs: cycle * 10000 + [3000, 4000, 7000][k], skipped: false })), checkpointSentMs: cycle * 10000 + 7800, checkpointRepliedMs: cycle * 10000 + 7805, endedMs: cycle * 10000 + 10000 })) }),
};
const SLOT = { G1: 'headed', G2: 'fresh-0', G6: 'bulb-overview/0', G7: '0', G8: '0', G9: 'warmed', G10: 'bulb-overview', G12: 'sequence' };
const descriptorOf = gate => MEASURED[gate] ?? CORRECTNESS_ONLY;

async function finalised(gate, slots, { experiment = false } = {}) {
  const dir = await scratch();
  try {
    const records = await finalise({ gate, mode: 'headed', campaign: 'dev', runDir: dir, identity, launchInfo: {}, chromeGpuText: gpuText, invalidations: [], fixtures, experiment, outcome: { result: { slots, invalidations: [] } } });
    const saved = [], raws = {};
    for (const rec of records) { const s = JSON.parse(await readFile(join(dir, `${rec.id}.json`), 'utf8')); saved.push(s); raws[s.id] = JSON.parse(await readFile(join(dir, `${rec.id}.raw.json`), 'utf8')); }
    return { records, saved, raws };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('the T9 rows: one measured page-clock descriptor per timing gate, correctness-only for G1 and visible; earlier rows unchanged', () => {
  for (const [gate, d] of Object.entries(MEASURED)) {
    assert.deepEqual(EXPECTED_TIMING[gate], [d], gate);
    assert.ok(Object.isFrozen(EXPECTED_TIMING[gate]) && Object.isFrozen(EXPECTED_TIMING[gate][0]) && Object.isFrozen(d), gate);
    assert.doesNotThrow(() => validateTimingMethod(d), gate);
    assert.equal(d.field, FIELDS[gate], gate); assert.equal(d.clock, 'page.performance.now', gate); assert.equal(d.unit, 'ms', gate);
    assert.equal(d.timestampQueriesUsed, false, gate); assert.notEqual(d.kind, 'timestamp-query', gate);
    assert.equal(d.readbackIncluded, gate !== 'G9', gate);                  // every publication follows its counts readback; long tasks do not
  }
  for (const gate of ['G1', 'visible']) assert.deepEqual(EXPECTED_TIMING[gate], [CORRECTNESS_ONLY], gate);
  assert.deepEqual(EXPECTED_TIMING.G3, [QUEUE_COMPLETION_WORKMS]);
  for (const gate of ['G4', 'G5', 'derivative-policy', 'probe', 'smoke', 'G11', 'G13']) assert.deepEqual(EXPECTED_TIMING[gate], [CORRECTNESS_ONLY], gate);
});

test('a clean record of every T9 gate is written clean, with exactly its gatePlan keys, and accepted at read time with its raw payload', async () => {
  for (const gate of Object.keys(RAW)) {
    // fix round 2: G9 is bound to its twelve companion records of the same invocation, so it is finalised after clean G6 and G7 companions
    const companions = gate !== 'G9' ? [] : RAW.G9().sources.map(x => ({ slot: x.slot, gate: x.gate, raw: RAW[x.gate](x.windowStart), timingMethod: MEASURED[x.gate] }));   // fix round 3: each companion observed exactly its source interval
    const all = await finalised(gate === 'G9' ? 'timing' : gate, [...companions, { slot: SLOT[gate], gate, raw: RAW[gate](), timingMethod: descriptorOf(gate) }]);
    for (const c of all.records.slice(0, -1)) assert.deepEqual(c.invalidations, [], `${c.gate}/${c.slot}: ${JSON.stringify(c.invalidations)}`);
    const records = all.records.slice(-1), saved = all.saved.slice(-1), raws = all.raws;
    assert.equal(records.length, 1, gate);
    const [rec] = records;
    assert.deepEqual(rec.invalidations, [], `${gate}: ${JSON.stringify(rec.invalidations)}`);
    assert.deepEqual(Object.keys(rec.metrics).sort(), Object.keys(plan[gate][SLOT[gate]]).sort(), gate);
    assert.deepEqual(rec.timingMethod, descriptorOf(gate), gate); assert.deepEqual(saved[0].timingMethod, descriptorOf(gate), gate);
    assert.doesNotThrow(() => validateEvidence(saved, { raws }), gate);
  }
  const visible = await finalised('visible', [{ slot: 'captures', raw: { out: {} }, timingMethod: CORRECTNESS_ONLY }], { experiment: true });
  assert.deepEqual(visible.records[0].invalidations, []); assert.deepEqual(visible.records[0].timingMethod, CORRECTNESS_ONLY);
  assert.doesNotThrow(() => validateEvidence(visible.saved, { raws: visible.raws }));
});

test('wrong descriptors are refused: correctness-only or queue-completion on a timing gate, another gate\'s descriptor, a timestamp-query claim, a flipped readback flag, a missing raw field', () => {
  for (const [gate, d] of Object.entries(MEASURED)) {
    const record = tm => ({ gate, slot: SLOT[gate], timingMethod: tm, invalidations: [] }), raw = RAW[gate]();
    assert.doesNotThrow(() => validateRecordTiming(record(d), raw), gate);
    const other = Object.entries(MEASURED).find(([g, x]) => g !== gate && x.field !== d.field)[1];
    for (const wrong of [CORRECTNESS_ONLY, QUEUE_COMPLETION_WORKMS, other, { ...d, kind: 'timestamp-query', timestampQueriesUsed: true }, { ...d, clock: 'gpu.timestamp' }, { ...d, readbackIncluded: !d.readbackIncluded }])
      assert.throws(() => validateRecordTiming(record(wrong), { ...raw, workMs: 1, [other.field]: 1 }), new RegExp(`^Error: timing method: ${gate}/${SLOT[gate]} expects ${d.kind} of ${d.field} \\(page\\.performance\\.now, ms\\), not `), `${gate}: ${JSON.stringify(wrong)}`);
    assert.throws(() => validateRecordTiming(record(notMeasured('no timing')), raw), /a completed slot may be not-measured only beside a timing-method invalidation/, gate);
    const { [d.field]: _, ...without } = raw;
    assert.throws(() => validateRecordTiming(record(d), without), new RegExp(`${d.field} must be a finite nonnegative number`), gate);
    assert.throws(() => validateRecordTiming(record(d), { ...raw, [d.field]: -1 }), /finite nonnegative/, gate);
  }
  for (const gate of ['G1', 'visible'])
    assert.throws(() => validateRecordTiming({ gate, slot: 'x', timingMethod: contract.G10_SETTLED_TIMING, invalidations: [] }, { elapsedMs: 1 }), /expects correctness-only/, gate);
});

test('a measured gate\'s failure slot keeps its driver invalidation and stop classification; the absent measurement adds a timing invalidation', async () => {
  const { records } = await finalised('G8', [{ slot: '0', raw: { error: 'harness timeout: the sphere frame was not published within 5000 ms' }, invalidations: ['harness timeout: the sphere frame was not published within 5000 ms'], timingMethod: contract.G8_REPLACEMENT_TIMING }]);
  const inv = records[0].invalidations;
  assert.ok(inv.includes('harness timeout: the sphere frame was not published within 5000 ms'), JSON.stringify(inv));
  assert.ok(inv.some(x => /^timing method: G8\/0: latencyMs must be a finite nonnegative number/.test(x)), JSON.stringify(inv));
  assert.deepEqual(stopReasonsOf(inv), ['harness timeout']);
  assert.equal(records[0].timingMethod.kind, 'not-measured');
});

// Fakes in the shape the drivers use: a renderer that submits after 1 ms and publishes 2 ms later (never for the stress view).
const COUNTS = { 'bulb-overview': f => overview(0, 0, f.W, f.H).counts, sphere: () => sphere(0, 0).counts };
function fastSession({ settleAbort = null } = {}) {
  const abort = createAbort(), handlers = new Set(), log = []; let n = 0;
  const renderer = { abort,
    render({ view, profile, label = view }) {
      const id = ++n, p = fixtures.profiles[profile]; log.push({ type: 'request', requestId: id, t: performance.now() });
      setTimeout(() => { log.push({ type: 'submit', requestId: id, epoch: 1, t: performance.now() }); if (view !== 'bulb-stress') setTimeout(() => { const t = performance.now(); for (const h of [...handlers]) h({ requestId: id, generation: id, epoch: 1, view, label, W: p.W, H: p.H, counts: (COUNTS[view] ?? COUNTS['bulb-overview'])(p), publishedMs: t }); }, 2); }, 1);
      return id;
    },
    onPublish(h) { handlers.add(h); return () => handlers.delete(h); }, stats: () => ({ outstandingMax: 2, bands: [] }), readTimestamps: async () => ({ method: 'timestamp-query', filled: 0 }) };
  return { abort, epoch: 1, renderer, events: { list: () => log.slice(), clear() { log.length = 0; } },
    device: { queue: { onSubmittedWorkDone: async () => { if (settleAbort) setTimeout(() => abort.abort(settleAbort), 5); } } }, alloc: { inventory: () => ({ bytes: 1000, textures: 4, buffers: 5 }) }, watchdog: {}, losses: [], close() {} };
}
const quietIntegrity = () => ({ stop: () => ({ violations: [], events: [] }) });

test('G8 slots carry the G8 descriptor and the page-measured latencyMs (sphere publish minus sphereRequested)', async () => {
  const out = await runG8(fixtures, () => {}, { open: async () => fastSession(), canvas: {}, integrity: quietIntegrity });
  assert.deepEqual(out.invalidations, []); assert.equal(out.slots.length, 10);
  for (const s of out.slots) {
    assert.deepEqual(s.timingMethod, contract.G8_REPLACEMENT_TIMING);
    assert.equal(s.raw.latencyMs, s.raw.sphere.t - s.raw.sphereRequested);
    assert.doesNotThrow(() => validateRecordTiming({ gate: 'G8', slot: s.slot, timingMethod: s.timingMethod, invalidations: [] }, s.raw));
  }
});

test('G8: a stall latched during the post-publication settle is the slot\'s error, not a clean repetition (the abort is checked before recording)', async () => {
  let opened = 0;
  const out = await runG8(fixtures, () => {}, { open: async () => { opened++; return fastSession({ settleAbort: { kind: 'stall', outstanding: [{ id: 'band:9' }] } }); }, canvas: {}, integrity: quietIntegrity });
  assert.equal(opened, 1); assert.equal(out.slots.length, 1);
  assert.match(out.slots[0].raw.error, /no observable progress for 5 s/);
  assert.deepEqual(out.slots[0].timingMethod, contract.G8_REPLACEMENT_TIMING);
  assert.deepEqual(stopReasonsOf(out.invalidations), ['submission stalled for 5 s']);
});

test('G10 slots carry the G10 descriptor and elapsedMs (settled publish minus requestedMs); a deadline slot carries it too', async () => {
  const out = await runG10(fixtures, () => {}, { open: async () => fastSession(), canvas: {}, integrity: quietIntegrity });
  assert.deepEqual(out.slots.map(s => s.slot), ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005']);
  for (const s of out.slots) { assert.deepEqual(s.timingMethod, contract.G10_SETTLED_TIMING); assert.equal(s.raw.elapsedMs, s.raw.frame.t - s.raw.requestedMs); }
  const silent = fastSession(); silent.renderer.render = () => 1;                   // never publishes
  const failed = await runG10(fixtures, () => {}, { open: async () => silent, canvas: {}, integrity: quietIntegrity, timeoutMs: 20 });
  assert.deepEqual(failed.slots[0].timingMethod, contract.G10_SETTLED_TIMING); assert.equal(failed.slots[0].raw.elapsedMs, undefined);
});

test('followPath records observedMs, the page-clock span from windowStart to the publication that ends the path', async () => {
  const r = await followPath(fastSession(), fixtures, 'bulb-overview', 'draft', 0.05);
  assert.ok(r.observedMs >= 50 && Number.isFinite(r.observedMs), String(r.observedMs));
  assert.ok(r.frames.at(-1).t <= r.windowStart + r.observedMs);
});

test('the timing invocation\'s stop slot carries its gate\'s descriptor', async () => {
  const s = fastSession(); setTimeout(() => s.abort.abort({ kind: 'stall', outstanding: [] }), 20);
  const out = await runTiming(fixtures, () => {}, { open: async () => s, canvas: {}, integrity: quietIntegrity, longTasks: () => ({ take: () => [], harnessMeasures: () => 0 }), hzOf: async () => 60 });
  assert.equal(out.slots.length, 1); assert.equal(out.slots[0].gate, 'G6');
  assert.deepEqual(out.slots[0].timingMethod, contract.G6_WINDOW_TIMING);
});

// A one-cycle G12 schedule (the stop paths do not depend on the cycle count): the injected path and maintenance return at once.
const shortG12 = { ...fixtures, stability: { ...fixtures.stability, cycleCount: 1, cycleMs: 40, phaseOffsetsMs: [0, 10, 20, 30, 40], resourceEvery: 1 } };
const g12deps = s => ({ open: async () => s, canvas: { width: 1280, height: 720 }, integrity: quietIntegrity, target: {},
  prepareResourceCheck: async () => ({}), followPath: async () => {}, renderOnce: async () => ({}), exerciseResources: async () => ({ ...good }) });

test('G12: a clean short sequence carries the G12 descriptor and wallMs; a stall latched in the final drain is the sequence\'s error', async () => {
  const out = await runG12(shortG12, () => {}, g12deps(fastSession()));
  assert.deepEqual(out.invalidations, []);
  assert.deepEqual(out.slots[0].timingMethod, contract.G12_WALL_TIMING); assert.ok(out.slots[0].raw.wallMs >= 0);
  const s = fastSession(); let drains = 0;
  s.device.queue.onSubmittedWorkDone = async () => { if (++drains === 2) setTimeout(() => s.abort.abort({ kind: 'stall', outstanding: [] }), 5); };
  const stopped = await runG12(shortG12, () => {}, g12deps(s));
  assert.match(stopped.slots[0].raw.error, /no observable progress for 5 s/);
  assert.deepEqual(stopped.slots[0].timingMethod, contract.G12_WALL_TIMING);
  assert.deepEqual(stopReasonsOf(stopped.invalidations), ['submission stalled for 5 s']);
});
