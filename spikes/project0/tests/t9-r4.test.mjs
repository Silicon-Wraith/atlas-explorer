// spikes/project0/tests/t9-r4.test.mjs — T9 fix round 4 (Codex T9 r4, finding 1): Node validates G12's recorded schedule instead of trusting its
// flags. Every scheduling field must be finite; the planned intervals must be the frozen cycle grid (fixtures.stability.cycleMs, phaseOffsetsMs);
// the actual phases and checkpoint exchanges must be ordered and cover their spans; overruns are derived from the checkpoint reply times against
// the cycle boundaries, and a flag, a deadline-miss count or a wall time that contradicts the timestamps invalidates. Pure: metricsFor on built
// raws, and the G12 driver with injected fakes only (no browser, no server, no GPU).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAbort } from '../gpu/abort.js';
import { metricsFor } from '../measure/index.mjs';
const { runG12 } = await import('../browser/drivers/g12.js');

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const S = fixtures.stability, OFF = S.phaseOffsetsMs, VIEWS = S.phases.slice(0, 3);
const R = fixtures.resources, textures = R.entries.filter(e => e.kind === 'texture').length;
const good = { tableBytes: R.tableBytes, before: { bytes: 1, textures: 0, buffers: 1 }, after: { bytes: 1, textures: 0, buffers: 1 }, peakBytes: R.tableBytes + 1, written: Array(textures).fill(true), checks: Array.from({ length: R.readback.x.length * R.readback.y.length * textures }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160, cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] };

// A clean 60-cycle sequence on the page clock, starting at `origin`: each phase starts just after its planned start and ends just after its planned
// end, the checkpoint exchange runs in the idle time after the maintenance point, and the cycle ends just after its boundary.
function g12Raw(origin = 2500.25) {
  const cycleLog = Array.from({ length: S.cycleCount }, (_, cycle) => {
    const c0 = origin + cycle * S.cycleMs;
    const phases = VIEWS.map((view, k) => ({ view, plannedStartMs: c0 + OFF[k], plannedEndMs: c0 + OFF[k + 1], startMs: c0 + OFF[k] + 0.5, endMs: c0 + OFF[k + 1] + 0.4, skipped: false }));
    return { cycle, c0, phases, overrun: false, checkpointSentMs: c0 + OFF[3] + 800, checkpointRepliedMs: c0 + OFF[3] + 805, endedMs: c0 + S.cycleMs + 0.3 };
  });
  return { cycles: S.cycleCount, wallMs: cycleLog.at(-1).endedMs - origin, deadlineMisses: 0, unhandled: 0, unplannedLosses: 0, baseline: { bytes: 1000, textures: 4, buffers: 5 }, final: { bytes: 1000, textures: 4, buffers: 5 },
    baselinePrepared: 1, returned1280: 1, outstandingMax: 2, integrity: { violations: [], events: [] }, maintenance: Array(1 + Math.floor(S.cycleCount / S.resourceEvery)).fill(good), cycleLog };
}
const g12 = raw => metricsFor('G12', 'sequence', raw, fixtures);
const edit = fn => { const raw = g12Raw(); fn(raw, raw.cycleLog); return raw; };

test('a complete, consistent G12 schedule is accepted with no deadline miss', async () => {
  assert.equal((await g12(g12Raw())).deadlineMisses, 0);
  assert.equal((await g12(g12Raw(0))).deadlineMisses, 0);
});

test('Codex counterexample 1: a checkpoint reply at 10,050 ms against the 10,000 ms boundary with overrun false is refused, as is its deadline count', async () => {
  // The page clock starts the sequence at 0; the late reply ends cycle 0 at 10,050 ms, and cycle 1 starts after it. Nothing else is inconsistent.
  const raw = g12Raw(0), [c0, c1] = raw.cycleLog;
  c0.checkpointRepliedMs = 10050; c0.endedMs = 10050.2; c1.phases[0].startMs = 10050.3;
  assert.equal(raw.cycleLog[0].checkpointRepliedMs, 10050); assert.equal(raw.cycleLog[0].c0 + S.cycleMs, 10000); assert.equal(raw.cycleLog[0].overrun, false);
  await assert.rejects(g12(raw), /G12: cycle 0's checkpoint replied at 10050 ms, after its boundary at 10000 ms, but overrun is false/);
  // The flag set but the count left at 0: refused by the derived count.
  const flagged = structuredClone(raw); flagged.cycleLog[0].overrun = true;
  await assert.rejects(g12(flagged), /G12: deadlineMisses 0, but the cycle log records 1/);
  // Genuine overrun evidence, consistently recorded, is kept: one miss.
  const genuine = structuredClone(flagged); genuine.deadlineMisses = 1;
  assert.equal((await g12(genuine)).deadlineMisses, 1);
});

test('an overrun flag the timestamps do not support is refused', async () => {
  await assert.rejects(g12(edit((raw, log) => { log[3].overrun = true; raw.deadlineMisses = 1; })), /G12: cycle 3's checkpoint replied at [\d.]+ ms, before its boundary at [\d.]+ ms, but overrun is true/);
});

test('Codex counterexample 2: every cycle and checkpoint timing field removed and every phase span [0, 0] is refused', async () => {
  const stripped = edit((raw, log) => log.forEach(c => { for (const k of ['c0', 'checkpointSentMs', 'checkpointRepliedMs', 'endedMs']) delete c[k];
    c.phases.forEach(p => { delete p.plannedStartMs; delete p.plannedEndMs; p.startMs = 0; p.endMs = 0; }); }));
  assert.equal(stripped.cycleLog[0].overrun, false); assert.equal(stripped.deadlineMisses, 0);
  await assert.rejects(g12(stripped), /G12: cycle 0 c0 must be a finite number/);
  // Each scheduling field on its own.
  for (const k of ['c0', 'checkpointSentMs', 'checkpointRepliedMs', 'endedMs'])
    await assert.rejects(g12(edit((raw, log) => { delete log[7][k]; })), new RegExp(`G12: cycle 7 ${k} must be a finite number`), k);
  for (const k of ['plannedStartMs', 'plannedEndMs', 'startMs', 'endMs'])
    await assert.rejects(g12(edit((raw, log) => { log[7].phases[1][k] = NaN; })), new RegExp(`G12: cycle 7 sphere ${k} must be a finite number`), k);
  await assert.rejects(g12(edit((raw, log) => { delete log[7].phases[1].skipped; })), /G12: cycle 7 sphere does not record whether it was skipped/);
  await assert.rejects(g12(edit(raw => { delete raw.wallMs; })), /G12 wallMs must be a finite number/);
  // Timing fields present, but the phases' actual spans [0, 0].
  await assert.rejects(g12(edit((raw, log) => log.forEach(c => c.phases.forEach(p => { p.startMs = 0; p.endMs = 0; })))), /G12: cycle 0 bulb-overview started at 0 ms, before/);
});

test('the planned intervals must be the frozen cycle grid', async () => {
  await assert.rejects(g12(edit((raw, log) => { log[5].c0 += 1; log[5].phases.forEach(p => { p.plannedStartMs += 1; p.plannedEndMs += 1; }); })), /G12: cycle 5 starts at [\d.]+ ms, not at the frozen origin [\d.]+ ms/);
  await assert.rejects(g12(edit((raw, log) => { log[5].phases[1].plannedEndMs += 500; })), /G12: cycle 5 sphere is planned for \[[\d.]+, [\d.]+\), not the frozen \[[\d.]+, [\d.]+\)/);
  await assert.rejects(g12(edit((raw, log) => { log[5].phases[0].plannedStartMs -= 1000; })), /G12: cycle 5 bulb-overview is planned for/);
  // A uniformly stretched schedule (an 11 s cycle) is a different workload.
  const stretched = g12Raw(); stretched.cycleLog.forEach((c, i) => { const d = i * 1000; c.c0 += d; c.checkpointSentMs += d; c.checkpointRepliedMs += d; c.endedMs += d; c.phases.forEach(p => { p.plannedStartMs += d; p.plannedEndMs += d; p.startMs += d; p.endMs += d; }); });
  await assert.rejects(g12(stretched), /G12: cycle 1 starts at/);
  // A shortened sequence is not the frozen schedule.
  const short = g12Raw(); short.cycleLog = short.cycleLog.slice(0, 59); short.cycles = 59; short.wallMs = short.cycleLog.at(-1).endedMs - 2500.25;
  await assert.rejects(g12(short), /G12: the sequence ran 59 cycles, not the frozen 60/);
});

test('the actual phases and the checkpoint exchange must be ordered and cover their spans', async () => {
  await assert.rejects(g12(edit((raw, log) => { log[4].phases[0].startMs = log[4].c0 - 1; })), /G12: cycle 4 bulb-overview started at [\d.]+ ms, before/);
  await assert.rejects(g12(edit((raw, log) => { log[4].phases[1].startMs = log[4].phases[0].endMs - 1; })), /G12: cycle 4 sphere started at [\d.]+ ms, before/);
  await assert.rejects(g12(edit((raw, log) => { log[4].phases[2].endMs = log[4].phases[2].startMs - 1; })), /G12: cycle 4 bulb-detail-0.005 ended at [\d.]+ ms, before/);
  await assert.rejects(g12(edit((raw, log) => { log[4].phases[2].endMs = log[4].phases[2].plannedEndMs - 100; })), /G12: cycle 4 bulb-detail-0.005 ran until [\d.]+ ms, before its planned end/);
  await assert.rejects(g12(edit((raw, log) => { log[4].checkpointSentMs = log[4].phases[2].endMs - 1; })), /G12: cycle 4's checkpoint was sent at [\d.]+ ms, before/);
  await assert.rejects(g12(edit((raw, log) => { log[4].checkpointRepliedMs = log[4].checkpointSentMs - 1; })), /G12: cycle 4's checkpoint replied at [\d.]+ ms, before it was sent/);
  await assert.rejects(g12(edit((raw, log) => { log[4].endedMs = log[4].checkpointRepliedMs - 1; })), /G12: cycle 4 ended at [\d.]+ ms, before/);
  await assert.rejects(g12(edit((raw, log) => { log[4].endedMs = log[4].c0 + S.cycleMs - 1; log[5].phases[0].startMs = log[5].c0 - 0.5; })), /G12: cycle 4 ended at [\d.]+ ms, before its boundary/);
  await assert.rejects(g12(edit((raw, log) => { log[5].phases[0].startMs = log[4].endedMs - 1; })), /G12: cycle 5 bulb-overview started at [\d.]+ ms, before/);
});

test('a skipped phase must be justified by the clock, and its count is derived', async () => {
  // A skip with time left before its planned end is refused.
  await assert.rejects(g12(edit((raw, log) => { const p = log[2].phases[1]; p.skipped = true; p.endMs = p.startMs; raw.deadlineMisses = 1; })), /G12: cycle 2 sphere was skipped at [\d.]+ ms, before its planned end/);
  // A justified skip (the cycle started after the phase's planned end) with a zero span is accepted and counted.
  const justified = edit((raw, log) => {
    log[1].checkpointRepliedMs = log[1].c0 + S.cycleMs + OFF[1] + 10; log[1].endedMs = log[1].checkpointRepliedMs + 0.2; log[1].overrun = true;
    const [p0, p1] = log[2].phases; p0.startMs = p0.endMs = log[1].endedMs + 0.1; p0.skipped = true; p1.startMs = p0.startMs + 0.1; raw.deadlineMisses = 2;
  });
  assert.equal((await g12(justified)).deadlineMisses, 2);
  justified.deadlineMisses = 1;
  await assert.rejects(g12(justified), /G12: deadlineMisses 1, but the cycle log records 2/);
  const spanned = structuredClone(justified); spanned.deadlineMisses = 2; spanned.cycleLog[2].phases[0].endMs += 0.05;
  await assert.rejects(g12(spanned), /G12: cycle 2 bulb-overview was skipped but records a span/);
});

test('the wall time must be the recorded sequence span', async () => {
  await assert.rejects(g12(edit(raw => { raw.wallMs -= 1000; })), /G12: wallMs [\d.]+ is not the recorded span [\d.]+ ms \(cycle 0 start to cycle 59 end\)/);
  await assert.rejects(g12(edit(raw => { raw.wallMs += 1000; })), /G12: wallMs [\d.]+ is not the recorded span/);
});

// The driver's own record, with fakes only (no browser): a path that really takes its time, a checkpoint reply that takes `replyMs`.
const sleep = ms => new Promise(r => setTimeout(r, ms));
function g12Run({ replyMs, cycleMs = 100, cycles = 3 }) {
  const fx = { ...fixtures, stability: { ...S, cycleCount: cycles, cycleMs, phaseOffsetsMs: [0, 0.3 * cycleMs, 0.5 * cycleMs, 0.7 * cycleMs, cycleMs], resourceEvery: 100 } };
  const abort = createAbort(), ev = []; let n = 0;
  const s = { abort, epoch: 1, renderer: { abort, render() { const id = ++n; setTimeout(() => ev.push({ type: 'submit', requestId: id }), 1); return id; }, onPublish() { return () => {}; }, stats: () => ({ outstandingMax: 2, bands: [] }) },
    events: { list: () => ev.slice(), clear() { ev.length = 0; } }, device: { queue: { onSubmittedWorkDone: async () => {} } }, alloc: { inventory: () => ({ bytes: 1, textures: 0, buffers: 1 }) }, watchdog: {}, losses: [], close() {} };
  const sup = { window: async (name, fn) => fn(), checkpoint: async () => { await sleep(replyMs); } };
  // Like the real followPath, the fake returns only once its full duration has elapsed on the page clock.
  const followPath = async (sess, f, view, profile, seconds) => { const t0 = performance.now(); while ((performance.now() - t0) / 1000 < seconds) await sleep(1); };
  return runG12(fx, () => {}, { open: async () => s, canvas: { width: 1280, height: 720 }, integrity: () => ({ stop: () => ({ violations: [], events: [] }) }), target: {}, sup,
    prepareResourceCheck: async () => ({}), followPath, renderOnce: async () => ({}), exerciseResources: async () => ({ ...good }) }).then(out => ({ out, fx }));
}

test('the driver derives each overrun from its recorded reply time, ends every on-time cycle at its boundary, and its wall time is the recorded span; Node accepts it', async () => {
  for (const replyMs of [5, 45]) {
    const { out, fx } = await g12Run({ replyMs });
    assert.deepEqual(out.invalidations, []);
    const raw = out.slots[0].raw, log = raw.cycleLog;
    for (const c of log) {
      const boundary = c.c0 + fx.stability.cycleMs;
      assert.equal(c.overrun, c.checkpointRepliedMs > boundary, `cycle ${c.cycle}`);
      if (!c.overrun) assert.ok(c.endedMs >= boundary, `cycle ${c.cycle} ended at ${c.endedMs}, before ${boundary}`);
    }
    assert.equal(raw.wallMs, log.at(-1).endedMs - log[0].c0);
    if (replyMs === 45) assert.ok(raw.deadlineMisses >= 1, 'a 45 ms reply against 30 ms of idle time overruns');
    const full = { ...raw, maintenance: Array(1 + Math.floor(fx.stability.cycleCount / fx.stability.resourceEvery)).fill(good) };
    assert.equal((await metricsFor('G12', 'sequence', full, fx)).deadlineMisses, raw.deadlineMisses);
  }
});
