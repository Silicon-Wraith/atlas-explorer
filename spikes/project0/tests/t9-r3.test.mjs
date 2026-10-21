// spikes/project0/tests/t9-r3.test.mjs — T9 fix round 3 (Codex T9 r3, findings 3-5 and the pinned constants): the supervision bounds are pinned to
// the frozen workload; Node checks the frozen driver configuration and the recorded warm-up, not only duration ranges; G9's sources must be the
// very intervals its companions observed (a check exported for evidence-read time); G12 budgets its checkpoint exchange inside the cycle, never
// omits a phase silently and records every overrun; the integrity preflight's deadline latches, disposes late resources and stops after a failed
// first load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAbort } from '../gpu/abort.js';
import { gatePlan } from '../gates.js';
import { metricsFor } from '../measure/index.mjs';
import { validateSources } from '../measure/timing.mjs';
import { FROZEN, DRIVER, WINDOW_PLANS } from '../supervision-plan.js';
import { runIntegrityPreflight } from '../integrity-preflight.mjs';
import { G6_WINDOW_TIMING, G7_BURST_TIMING } from '../timing-contract.js';
const { runG12 } = await import('../browser/drivers/g12.js');
const { finalise } = await import('../run.mjs');

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('the supervision bounds are pinned to the frozen workload and the driver constants (reviewed amendment)', () => {
  assert.deepEqual(FROZEN, { burstDurationMs: fixtures.bursts.durationMs, quietMs: fixtures.bursts.quietMs, cycleCount: fixtures.stability.cycleCount, cycleMs: fixtures.stability.cycleMs, cycleCheckpoints: fixtures.stability.cycleCount });
  assert.equal(fixtures.bursts.requests.at(-1).offsetMs + fixtures.bursts.quietMs, FROZEN.burstDurationMs);
  const bound = name => Object.values(WINDOW_PLANS).flat().find(w => w.name === name);
  assert.equal(bound('G6/bulb-overview/0').boundMs, DRIVER.g6WindowSeconds * 1000 + 10000);
  assert.equal(bound('G7/0').boundMs, FROZEN.burstDurationMs + 12000);
  assert.equal(bound('G8/0').boundMs, 2 * DRIVER.g8WaitMs + DRIVER.g8DrainMs + DRIVER.g8SettleMs + 3000);
  assert.equal(bound('G10/bulb-overview').boundMs, DRIVER.g10TimeoutMs + 5000);
  assert.deepEqual(bound('G12/sequence'), { name: 'G12/sequence', boundMs: FROZEN.cycleCount * FROZEN.cycleMs + 60000, checkpointMs: FROZEN.cycleMs + 10000, checkpoints: FROZEN.cycleCount });
  assert.ok(bound('G2/navigation').boundMs > gatePlan(fixtures).G2['fresh-0'].navigationMs[2], 'the navigation window outlasts the gate\'s own limit');
  assert.deepEqual([DRIVER.warmupSeconds, DRIVER.g6WindowSeconds, DRIVER.lateLimitMs], [3, 30, 4]);
});

const frame = (i, t, view = 'bulb-overview') => ({ requestId: i, t, view, label: view, W: 640, H: 360, counts: { total: 230400, hit: 64512, miss: 165888, point: 0, steps: 0, failure: 0 } });
const g6 = (over = {}) => ({ windowStart: 1000, observedMs: 30010, warmupMs: 3005, config: { warmupSeconds: 3, windowSeconds: 30 }, frames: Array.from({ length: 950 }, (_, i) => frame(i + 1, 1000 + i * 31.5)), pendingMax: 1, outstandingMax: 2, integrity: { violations: [] }, ...over });
test('Node checks the frozen driver configuration and the recorded warm-up of every G6 and G7 trial', async () => {
  assert.equal((await metricsFor('G6', 'bulb-overview/0', g6(), fixtures)).published, 950);
  await assert.rejects(metricsFor('G6', 'bulb-overview/0', g6({ config: { warmupSeconds: 0.005, windowSeconds: 30 } }), fixtures), /G6: the driver configuration differs from the frozen one/);
  await assert.rejects(metricsFor('G6', 'bulb-overview/0', g6({ config: undefined }), fixtures), /G6: the driver configuration differs from the frozen one/);
  await assert.rejects(metricsFor('G6', 'bulb-overview/0', g6({ warmupMs: 12 }), fixtures), /G6: the warm-up covered 12 ms, not the frozen 3000 ms/);
  await assert.rejects(metricsFor('G6', 'bulb-overview/0', g6({ warmupMs: undefined }), fixtures), /G6: the warm-up covered undefined ms/);
});

// G9's sources against their companions' own observations.
function companions() {
  const out = []; let t = 1000;
  for (const v of ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005']) for (let i = 0; i < 3; i++) { out.push({ gate: 'G6', slot: `${v}/${i}`, raw: { windowStart: t, observedMs: 30012 }, invalidations: [] }); t += 34000; }
  for (let i = 0; i < 3; i++) { out.push({ gate: 'G7', slot: String(i), raw: { windowStart: t, observedMs: 23045 }, invalidations: [] }); t += 28000; }
  return out;
}
const sourcesOf = cs => cs.map(c => ({ gate: c.gate, slot: c.slot, windowStart: c.raw.windowStart, windowEnd: c.raw.windowStart + c.raw.observedMs, valid: true }));
const lookup = cs => (gate, slot) => cs.find(c => c.gate === gate && c.slot === slot) ?? null;
test('validateSources: each G9 source must be its companion\'s observed interval, and the companion valid (exported for evidence-read time)', () => {
  const cs = companions();
  assert.deepEqual(validateSources({ sources: sourcesOf(cs) }, lookup(cs)), []);
  const moved = sourcesOf(cs).map(x => ({ ...x, windowStart: x.windowStart + 999000, windowEnd: x.windowEnd + 999000 }));   // Codex: claims at 1000000
  assert.match(validateSources({ sources: moved }, lookup(cs))[0], /^G9: source window G6\/bulb-overview\/0 is \[1000000, 1030012\), but its companion observed \[1000, 31012\)/);
  const endOnly = sourcesOf(cs); endOnly[11].windowEnd += 1;
  assert.match(validateSources({ sources: endOnly }, lookup(cs))[0], /^G9: source window G7\/2 is .* but its companion observed/);
  const invalid = companions(); invalid[3].invalidations = ['metrics: x'];
  assert.match(validateSources({ sources: sourcesOf(invalid) }, lookup(invalid))[0], /^G9: source window G6\/bulb-detail-0.05\/0 is invalid \(metrics: x\)/);
  assert.match(validateSources({ sources: sourcesOf(cs) }, () => null)[0], /^G9: source window G6\/bulb-overview\/0 has no companion record/);
});

test('finalise applies validateSources: G9 claiming intervals its companions never observed is invalid', async () => {
  const cs = companions(), moved = sourcesOf(cs).map(x => ({ ...x, windowStart: x.windowStart + 999000, windowEnd: x.windowEnd + 999000 }));
  const records = await finalise({ gate: 'timing', mode: 'headed', campaign: 'dev', runDir: '/unused/run', identity: {}, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures, experiment: true,
    outcome: { result: { slots: [...cs.map(c => ({ slot: c.slot, gate: c.gate, raw: c.raw, timingMethod: c.gate === 'G6' ? G6_WINDOW_TIMING : G7_BURST_TIMING })), { slot: 'warmed', gate: 'G9', raw: { sources: moved }, timingMethod: { kind: 'correctness-only' } }], invalidations: [] } },
    write: async (dir, rec) => rec });
  assert.ok(records.at(-1).invalidations.some(x => /^G9: source window G6\/bulb-overview\/0 is \[1000000, 1030012\), but its companion observed \[1000, 31012\)/.test(x)), JSON.stringify(records.at(-1).invalidations));
});

// G12's cycle schedule. A fake path that really takes its time (fix round 4: like the real followPath, it returns only once its full duration has
// elapsed on the page clock; a bare timer may wake early); a checkpoint exchange whose reply takes `replyMs`.
function g12Run({ replyMs, cycleMs = 120, cycles = 3 }) {
  const fx = { ...fixtures, stability: { ...fixtures.stability, cycleCount: cycles, cycleMs, phaseOffsetsMs: [0, 0.3 * cycleMs, 0.5 * cycleMs, 0.7 * cycleMs, cycleMs], resourceEvery: 100 } };
  const log = [], abort = createAbort(), handlers = new Set(), ev = []; let n = 0;
  const s = { abort, epoch: 1, renderer: { abort, render() { const id = ++n; setTimeout(() => ev.push({ type: 'submit', requestId: id }), 1); return id; }, onPublish(h) { handlers.add(h); return () => handlers.delete(h); }, stats: () => ({ outstandingMax: 2, bands: [] }) },
    events: { list: () => ev.slice(), clear() { ev.length = 0; } }, device: { queue: { onSubmittedWorkDone: async () => {} } }, alloc: { inventory: () => ({ bytes: 1, textures: 0, buffers: 1 }) }, watchdog: {}, losses: [], close() {} };
  const sup = { window: async (name, fn) => fn(), checkpoint: async cp => { log.push({ type: 'sent', cycle: cp.cycle, t: performance.now() }); await sleep(replyMs); log.push({ type: 'replied', cycle: cp.cycle, t: performance.now() }); } };
  const R = fixtures.resources;
  return runG12(fx, () => {}, { open: async () => s, canvas: { width: 1280, height: 720 }, integrity: () => ({ stop: () => ({ violations: [], events: [] }) }), target: {}, sup,
    prepareResourceCheck: async () => ({}), followPath: async (sess, f, view, profile, seconds) => { const t0 = performance.now(); while ((performance.now() - t0) / 1000 < seconds) await sleep(1); }, renderOnce: async () => ({}),
    exerciseResources: async () => ({ tableBytes: R.tableBytes, before: { bytes: 1, textures: 0, buffers: 1 }, after: { bytes: 1, textures: 0, buffers: 1 }, peakBytes: R.tableBytes + 1, written: Array(7).fill(true), checks: Array.from({ length: 63 }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160, cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] }) })
    .then(out => ({ out, log, fx }));
}

test('G12 budgets the checkpoint exchange inside the cycle: every phase of every cycle runs, in order, for its planned span, and no deadline is missed', async () => {
  const { out, log } = await g12Run({ replyMs: 10 });
  assert.deepEqual(out.invalidations, []);
  const raw = out.slots[0].raw;
  assert.equal(raw.cycleLog.length, 3); assert.equal(raw.deadlineMisses, 0);
  for (const c of raw.cycleLog) {
    assert.deepEqual(c.phases.map(p => p.view), ['bulb-overview', 'sphere', 'bulb-detail-0.005']);
    assert.ok(c.phases.every(p => !p.skipped && p.endMs - p.startMs >= 0.9 * (p.plannedEndMs - p.plannedStartMs)), JSON.stringify(c.phases));
    assert.ok(c.checkpointRepliedMs <= c.c0 + 120, `cycle ${c.cycle}: the exchange finished before the boundary`);
    assert.equal(c.overrun, false);
  }
  for (const cp of log.filter(x => x.type === 'replied')) assert.ok(cp.t <= raw.cycleLog[cp.cycle].c0 + 120 + 2);
});

test('Codex reproduction: an exchange that overruns the boundary is a recorded deadline miss, and the next cycle\'s phases are never silently omitted', async () => {
  const { out } = await g12Run({ replyMs: 70, cycleMs: 100, cycles: 2 });             // the idle time after the maintenance point is 30 ms
  const raw = out.slots[0].raw;
  assert.equal(raw.cycleLog.length, 2);
  assert.ok(raw.cycleLog[0].overrun, 'cycle 0 overran its boundary');
  for (const c of raw.cycleLog) assert.deepEqual(c.phases.map(p => p.view), ['bulb-overview', 'sphere', 'bulb-detail-0.005'], 'every phase is recorded, run or skipped');
  const skipped = raw.cycleLog.flatMap(c => c.phases.filter(p => p.skipped)).length;
  assert.equal(raw.deadlineMisses, raw.cycleLog.filter(c => c.overrun || c.phases.some(p => p.skipped)).length);
  assert.ok(raw.deadlineMisses >= 1 && raw.deadlineMisses >= (skipped ? 1 : 0));
});

test('Node recomputes G12\'s deadline misses from the cycle log and refuses a log with missing or reordered phases', async () => {
  const { out, fx } = await g12Run({ replyMs: 70, cycleMs: 100, cycles: 2 });
  const raw = out.slots[0].raw;
  const R = fixtures.resources, good = { tableBytes: R.tableBytes, before: { bytes: 1, textures: 0, buffers: 1 }, after: { bytes: 1, textures: 0, buffers: 1 }, peakBytes: R.tableBytes + 1, written: Array(7).fill(true), checks: Array.from({ length: 63 }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160, cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] };
  const full = { ...raw, integrity: { violations: [] }, maintenance: Array(1 + Math.floor(fx.stability.cycleCount / fx.stability.resourceEvery)).fill(good) };
  assert.equal((await metricsFor('G12', 'sequence', full, fx)).deadlineMisses, raw.deadlineMisses);
  await assert.rejects(metricsFor('G12', 'sequence', { ...full, deadlineMisses: 0 }, fx), /G12: deadlineMisses 0, but the cycle log records \d+/);
  const reordered = structuredClone(full); reordered.cycleLog[1].phases.reverse();
  await assert.rejects(metricsFor('G12', 'sequence', reordered, fx), /G12: cycle 1 phases are bulb-detail-0.005, sphere, bulb-overview/);
  await assert.rejects(metricsFor('G12', 'sequence', { ...full, cycleLog: full.cycleLog.slice(1) }, fx), /G12: the cycle log has 1 cycles, not 2/);
});

// The preflight's own deadline (Codex T9 r3, finding 5): fakes, no browser.
function preflightDeps({ launchMs = 0, pageMs = 0, serverMs = 0, firstError = null } = {}) {
  const c = { serverStops: 0, launches: 0, closes: 0, pageCloses: 0, gotos: 0, reloads: 0, written: null };
  const page = { on() {}, exposeBinding: async () => {}, evaluate: async () => {}, goto: async () => { c.gotos++; }, reload: async () => { c.reloads++; }, bringToFront: async () => {}, close: async () => { c.pageCloses++; } };
  const raw = { sameTaskRevert: { violations: ['unexpected backing 800x720 at 1'] }, undeliveredAtStop: { violations: ['unexpected backing 640x720 at 1'] }, allowedResizes: { violations: [], events: [1, 2, 3].map(() => ({ deliberate: true })) }, transport: 'p0Push', statusVisibility: { position: 'fixed', offsetParentNull: true, visible: true, controls: { visibleFixed: true, displayNone: false, visibilityHidden: false, zeroSize: false, opacityZero: false, offscreen: false } } };   // fix round 5: the status visibility sensor
  let waits = 0;
  return { c, deps: {
    startServer: () => sleep(serverMs).then(() => ({ url: 'http://x', stop: async () => { c.serverStops++; } })),
    launchChrome: () => { c.launches++; return sleep(launchMs).then(() => ({ context: { newPage: () => sleep(pageMs).then(() => page), close: async () => { c.closes++; } }, requestedArgs: [], profile: '/p' })); },
    effectiveCommandLine: async () => 'chrome --enable-gpu', newRunDir: async () => '/unused/run', implementationIdentity: async () => ({ implementationCommit: 'x' }),
    installTransport: async () => ({}), waitResult: async () => ({ result: waits++ === 0 && firstError ? { error: firstError } : { slots: [{ raw }] } }),
    writeFile: async (p, data) => { c.written = JSON.parse(data); } } };
}
test('the preflight passes with both loads (fakes), and a failed first load is never reloaded', async () => {
  const ok = preflightDeps();
  const r = await runIntegrityPreflight({ deps: ok.deps, totalMs: 2000 });
  assert.equal(r.pass, true, JSON.stringify(r.record.errors)); assert.equal(ok.c.reloads, 1); assert.equal(ok.c.closes, 1); assert.equal(ok.c.serverStops, 1);
  const bad = preflightDeps({ firstError: 'browser hang: the page did not answer within 10000 ms' });
  const r2 = await runIntegrityPreflight({ deps: bad.deps, totalMs: 2000 });
  assert.equal(r2.pass, false); assert.equal(bad.c.reloads, 0); assert.ok(r2.record.errors.some(e => /first load: browser hang/.test(e)));
  assert.equal(bad.c.written.pass, false);
});

test('a launch, a page or a server that arrives after the preflight deadline is disposed at once and never used', async () => {
  for (const [opts, check] of [
    [{ launchMs: 120 }, c => { assert.equal(c.closes, 1, 'the late browser is closed'); assert.equal(c.gotos, 0); }],
    [{ pageMs: 120 }, c => { assert.equal(c.pageCloses, 1, 'the late page is closed'); assert.equal(c.gotos, 0); assert.equal(c.closes, 1); }],
    [{ serverMs: 120 }, c => { assert.equal(c.serverStops, 1, 'the late server is stopped'); assert.equal(c.launches, 0); }]]) {
    const f = preflightDeps(opts);
    const r = await runIntegrityPreflight({ deps: f.deps, totalMs: 40 });
    assert.equal(r.pass, false); assert.ok(r.record.errors.some(e => /browser hang: the integrity preflight exceeded 40 ms/.test(e)), JSON.stringify(r.record.errors));
    await sleep(200);
    check(f.c); assert.equal(f.c.reloads, 0);
  }
});
