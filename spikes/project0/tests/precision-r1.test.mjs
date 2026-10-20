// spikes/project0/tests/precision-r1.test.mjs — T12 fix round 1 (Codex T12 r1, run 20261020T172559Z-7d6c; task-T12-report.md "Fix round 1").
// F1 supplemental validation and negative controls; F2 the precision window plan and the driver's windows; F3 evidence kept on a late failure;
// F4 timing checked at assessment; F5 the batch policy and its evidence; F7 append-only history; concern 2 signed bytes with the breakdown.
// No browser and no GPU: the driver runs on a fake device with injected dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
globalThis.GPUBufferUsage ??= { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128 };
globalThis.GPUMapMode ??= { READ: 1 };
const { ROOT } = await import('../launch.mjs');
const { PRECISION_CORPUS, BATCH_POLICY, nextBatch, maxOutstandingOf, batchDurations } = await import('../precision-config.js');
const { corpusText, expectedSha256 } = await import('../precision-validation/generate.mjs');
const { primitiveCase, synthesizeCaptures, VARIANTS } = await import('../precision-validation/models.js');
const { WINDOW_PLANS, PRECISION, PRECISION_WINDOW_MS } = await import('../supervision-plan.js');
const { MAP_DEADLINE_MS } = await import('../gpu/webgpu.js');
const { createWatchdog } = await import('../gpu/watchdog.js');
const { createSupervisor } = await import('../browser/supervisor.js');
const { precisionMetrics, assessPrecision } = await import('../measure/precision.mjs');
const { PRECISION_COST_TIMING, QUEUE_COMPLETION_WORKMS } = await import('../timing-contract.js');
const { completeRaw, corpus } = await import('./precision-helpers.mjs');

const fx = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];
const echo = (set, variant) => set.rows.flatMap(r => { const p = r[variant].primary; const code = { hit: 0, miss: 1, unresolved: 2, failure: 3 }[p.status]; return [code, p.status === 'unresolved' ? (p.reason === 'point' ? 1 : 2) : 0, p.status === 'miss' ? 0 : f32bits(p.t), Math.max(1, p.steps)]; });
const sample = () => Array.from({ length: 10 }, (_, i) => 10 + i);
const base = (variant = 'correct') => ({ primitives: fx.primitives.map(c => primitiveCase(c, variant)), sets: fx.precision.results.map(set => ({ distance: set.distance, baseline: { words: echo(set, 'baselineInput'), workMs: sample(), readMs: sample(), peakBytes: 1000 }, compensated: { words: echo(set, 'compensatedInput'), workMs: sample(), readMs: sample(), peakBytes: 1500 } })) });
const rawOf = (variant = 'correct') => completeRaw(fx, base(variant), { variant });
const identity = { browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode: 'headed', launchHash: 'f'.repeat(64) };
const clean = { gate: 'precision', slot: 'precision', invalidations: [], identity, timingMethod: PRECISION_COST_TIMING };

// ---------- F1: the supplemental corpus, pinned and preregistered ----------
test('F1: the supplemental corpus is pinned: committed bytes, regeneration and expected-words hash all match the pin', async () => {
  const bytes = await readFile(new URL('../precision-validation/corpus-v1.json', import.meta.url), 'utf8');
  assert.equal(sha(bytes), PRECISION_CORPUS.sha256);
  assert.equal(corpusText(), bytes, 'regeneration is byte-identical');
  assert.equal(expectedSha256(JSON.parse(bytes)), PRECISION_CORPUS.expectedSha256);
  const note = await readFile(resolve(ROOT, 'docs/reports/project0/t12-validation-prereg.md'), 'utf8');
  for (const h of [PRECISION_CORPUS.sha256, PRECISION_CORPUS.expectedSha256]) assert.ok(note.includes(h), `the preregistration note states ${h}`);
  assert.ok(corpus.primitives.some(c => c.op === 'mul_ff_f32' && c.args[1] === 1 + 2 ** -23 && c.thenValue === 2 ** -46), 'the inexact (1+2^-23)^2 product, residual 2^-46');
  assert.ok(corpus.primitives.some(c => c.op === 'add_ff' && c.thenValue === 2 ** -25), 'an add_ff residual followed by cancellation');
});

test('F1: negative controls: eliminating the TwoProduct residual, the split or the TwoSum residual each fails validation; a correct or contracted kernel passes', () => {
  for (const variant of ['correct', 'contracted']) { const m = precisionMetrics(fx, rawOf(variant)); assert.equal(m.validated, true, `${variant}: ${m.primitiveFailures.slice(0, 3).join('; ')}`); }
  for (const variant of ['twoProductResidualZero', 'splitIdentity', 'twoSumResidualZero']) {
    const m = precisionMetrics(fx, rawOf(variant));
    assert.equal(m.validated, false, variant);
    assert.ok(m.validation.supplementFailures.length > 0, `${variant}: the supplemental primitives fail`);
    assert.ok(m.validation.captures.failureCount > 0, `${variant}: the in-kernel captures fail`);
    assert.ok(!('compensated' in m.rows[0]), `${variant}: an unvalidated compensation is never interpreted`);
  }
  // Codex's reproduction: the frozen six cases alone do not detect a lost TwoProduct residual or split.
  for (const variant of ['twoProductResidualZero', 'splitIdentity']) assert.deepEqual(precisionMetrics(fx, rawOf(variant)).validation.frozenFailures, [], variant);
  assert.deepEqual(VARIANTS, ['correct', 'contracted', 'twoSumResidualZero', 'twoProductResidualZero', 'splitIdentity']);
});

test('F1: captures that cannot discriminate, or are malformed, never validate', () => {
  const none = rawOf(); for (const s of none.sets) s.captureWords = s.captureWords.map(() => 0);
  const m = precisionMetrics(fx, none);
  assert.equal(m.validated, false); assert.ok(m.primitiveFailures.some(x => /discriminating mul sites, fewer than the preregistered/.test(x)), m.primitiveFailures.join('; '));
  const short = rawOf(); short.sets[0].captureWords.pop(); assert.throws(() => precisionMetrics(fx, short), /capture: expected/);
  const flag = rawOf(); const fl = new Float32Array(Uint32Array.from(flag.sets[0].captureWords).buffer); fl[3] = 3; flag.sets[0].captureWords = Array.from(new Uint32Array(fl.buffer));
  assert.throws(() => precisionMetrics(fx, flag), /flag 3 is not 0, 1 or 2/);
  const pin = rawOf(); pin.supplement.corpusSha256 = '0'.repeat(64); assert.throws(() => precisionMetrics(fx, pin), /supplemental validation corpus/);
  const absent = rawOf(); delete absent.supplement; assert.throws(() => precisionMetrics(fx, absent), /supplemental validation corpus/);
  const fewer = rawOf(); fewer.supplement.primitives.pop(); assert.throws(() => precisionMetrics(fx, fewer), /one result per supplemental primitive case/);
});

// ---------- F2: the window plan ----------
test('F2: the precision window plan is fixed by Node: one window per measured evaluation, bounds derived from the bounded submissions', () => {
  assert.equal(PRECISION.distances, fx.precision.results.length); assert.equal(PRECISION.measured, fx.costProtocol.measured);
  assert.ok(fx.precision.results.every(s => s.rows.length === PRECISION.rays));
  assert.equal(PRECISION.mapDeadlineMs, MAP_DEADLINE_MS); assert.equal(PRECISION.stallMs, 5000);
  assert.equal(PRECISION_WINDOW_MS, Math.ceil(PRECISION.rays / BATCH_POLICY.minBatch) * PRECISION.stallMs + PRECISION.stallMs + PRECISION.mapDeadlineMs + PRECISION.marginMs);
  const names = fx.precision.results.flatMap((_, d) => Array.from({ length: fx.costProtocol.measured }, (_, k) => ['baseline', 'compensated'].map(i => `precision/${d}/${k}/${i}`)).flat());
  assert.deepEqual(WINDOW_PLANS.precision.map(w => w.name), names);
  assert.ok(WINDOW_PLANS.precision.every(w => w.boundMs === PRECISION_WINDOW_MS && Object.isFrozen(w)));
});

// A fake device and the driver's injectable dependencies; `log` records submits, maps and supervisor traffic in one order.
function harness({ hang = () => false, onStatus = () => {}, slowMs = 0 } = {}) {
  const log = []; let loss = null, ticks = 0;
  const pass = { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} };
  const device = {
    createBuffer: d => ({ size: d.size, usage: d.usage, destroy() {}, mapAsync: async () => { log.push({ type: 'map' }); }, getMappedRange: () => new ArrayBuffer(d.size), unmap() {} }),
    createBindGroup: () => ({}), createComputePipelineAsync: async desc => ({ desc, getBindGroupLayout: () => ({}) }),
    createCommandEncoder: () => ({ beginComputePass: () => pass, copyBufferToBuffer() {}, finish: () => ({}) }),
    queue: { submit() { log.push({ type: 'submit' }); }, writeBuffer() {}, onSubmittedWorkDone: () => (hang(++ticks) ? new Promise(() => {}) : new Promise(r => setTimeout(r, slowMs))) },
  };
  const push = message => { log.push({ type: message.type, name: message.name }); const reply = new Promise(r => setTimeout(() => { log.push({ type: `${message.type}-reply`, name: message.name }); r(message.type === 'checkpoint' ? true : { ok: true }); }, 1)); return reply; };
  const supervisor = createSupervisor({ push: () => push, heartbeatMs: 2, replyMs: 1000 });
  const deps = {
    acquire: async () => ({ device }), onLoss: h => { loss = h; return () => { loss = null; }; }, destroy: () => {},
    prepare: async () => ({ 'trace_list/bulb': { getBindGroupLayout: () => ({}) } }), compile: async () => ({}), source: async () => '',
    createWatchdog: o => createWatchdog({ ...o, stallMs: 2000, every: 10 }), supervisor,   // fix round 2: 100 ms could expire under a loaded full-suite run
    loadCorpus: async () => { const b = await readFile(new URL('../precision-validation/corpus-v1.json', import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  };
  return { log, deps, supervisor, status: s => onStatus(s, () => loss?.({ epoch: 1, reason: 'unknown', message: '', injected: false })) };
}
const { run, PRECISION_TIMING } = await import('../browser/drivers/precision.js');

test('F2/F5: every measured evaluation runs inside its declared window, in plan order, with no heartbeat or binding reply inside; batches follow the policy', async () => {
  const h = harness(); h.supervisor.startHeartbeats();
  const result = await run('precision', fx, new URLSearchParams(), h.status, h.deps);
  await h.supervisor.quiesce();
  assert.deepEqual(result.invalidations, []);
  const raw = result.slots[0].raw;
  assert.equal(raw.complete, true); assert.equal(result.slots[0].timingMethod, PRECISION_TIMING);
  assert.ok(h.log.filter(e => e.type === 'heartbeat').length > 10, 'heartbeats ran outside the windows, so the check below is not vacuous');
  const opens = h.log.filter(e => e.type === 'window-open').map(e => e.name);
  assert.deepEqual(opens, WINDOW_PLANS.precision.map(w => w.name));
  let inside = null, counts = null;
  for (const e of h.log) {
    if (e.type === 'window-open') { assert.equal(inside, null); inside = e.name; counts = { submit: 0, map: 0 }; continue; }
    if (e.type === 'window-open-reply' && e.name === inside) continue;
    if (e.type === 'window-close') { assert.equal(e.name, inside); assert.ok(counts.submit > 0 && counts.map > 0, `${inside} measured its work and its readback`); inside = null; continue; }
    if (inside) { assert.ok(['submit', 'map'].includes(e.type), `${e.type} inside ${inside}`); counts[e.type]++; }
  }
  // F5: each implementation's runs: the first at the initial size, every next size by the policy, at most two outstanding.
  for (const s of raw.sets) for (const impl of ['baseline', 'compensated']) {
    const runs = s[impl].runs;
    assert.equal(runs.length, fx.costProtocol.warmups + fx.costProtocol.measured);
    assert.equal(runs[0].batch, BATCH_POLICY.initialBatch);
    runs.forEach((r, i) => { assert.ok(r.batches.length > 0); assert.equal(r.maxOutstanding, maxOutstandingOf(r.batches)); assert.ok(r.maxOutstanding <= 2); if (i) assert.equal(r.batch, nextBatch(runs[i - 1].batches, runs[i - 1].batch)); });
    assert.ok(s[impl].allocations.length > 0, 'the allocation breakdown of a measured run');
  }
  assert.equal(raw.supplement.corpusSha256, PRECISION_CORPUS.sha256);
  assert.equal(raw.supplement.primitives.length, corpus.primitives.length);
  assert.ok(raw.sets.every(s => s.captureWords.length === corpus.capture.rays * corpus.capture.steps * 16));
});

// ---------- F3: evidence survives a late failure ----------
test('F3: a device loss after the first distance keeps the primitives, the supplement and every completed evaluation, as an explicitly incomplete precision slot', async () => {
  const h = harness({ onStatus: (s, lose) => { if (s === `precision d=${fx.precision.results[1].distance}`) lose(); } });
  const result = await run('precision', fx, new URLSearchParams(), h.status, h.deps);
  assert.deepEqual(result.invalidations, ['device lost: unknown']);
  const [slot] = result.slots; assert.equal(slot.slot, 'precision'); assert.equal(slot.timingMethod, PRECISION_TIMING);
  const raw = slot.raw;
  assert.equal(raw.complete, false); assert.equal(raw.primitives.length, fx.primitives.length); assert.equal(raw.supplement.primitives.length, corpus.primitives.length);
  assert.ok(Number.isFinite(raw.costProtocolMs) && raw.costProtocolMs >= 0);
  assert.equal(raw.sets[0].complete, true); assert.equal(raw.sets[0].baseline.workMs.length, 10); assert.equal(raw.sets[0].compensated.workMs.length, 10);
  assert.ok(raw.sets.length <= 2 && (raw.sets.length < 2 || raw.sets[1].complete === false));
  assert.equal(assessPrecision({ fx, record: { ...clean, invalidations: result.invalidations }, raw, selected: [{ identity }] }).interpretable, false);
});

test('F3: a stalled compensated evaluation keeps the baseline evaluation that preceded it', async () => {
  let armed = false, at = null;
  const h = harness({ hang: tick => armed && (at ??= tick) === tick });
  const sup = h.deps.supervisor, window = sup.window.bind(sup);
  h.deps.supervisor = { ...sup, window: (name, fn) => { if (name === 'precision/0/2/compensated') armed = true; return window(name, fn); } };
  const result = await run('precision', fx, new URLSearchParams(), h.status, h.deps);
  assert.match(result.invalidations[0], /^no observable progress for 5 s/);
  const s0 = result.slots[0].raw.sets[0];
  assert.equal(s0.complete, false); assert.equal(s0.baseline.workMs.length, 3, 'measured baseline samples 0-2'); assert.equal(s0.compensated.workMs.length, 2, 'compensated samples 0-1');
  assert.equal(result.slots[0].raw.complete, false);
});

// ---------- F4: timing at assessment ----------
test('F4: assessment refuses a record without its registered timing descriptor or its cost span, beside unchanged execution invalidations', () => {
  const selected = [{ identity }];
  assert.equal(assessPrecision({ fx, record: clean, raw: rawOf(), selected }).interpretable, true);
  const cases = [[{ ...clean, timingMethod: undefined }, rawOf()], [{ ...clean, timingMethod: QUEUE_COMPLETION_WORKMS }, rawOf()]];
  for (const v of [undefined, -1, Infinity, '12']) { const r = rawOf(); if (v === undefined) delete r.costProtocolMs; else r.costProtocolMs = v; cases.push([clean, r]); }
  for (const [record, raw] of cases) {
    const a = assessPrecision({ fx, record, raw, selected });
    assert.equal(a.interpretable, false); assert.match(a.timingError, /^timing method: /); assert.deepEqual(a.executionInvalidations, []);
  }
  const partial = rawOf(); partial.complete = false;
  const a = assessPrecision({ fx, record: clean, raw: partial, selected });
  assert.equal(a.interpretable, false); assert.match(a.interpretationError, /not complete/);
});

// ---------- F5: the batch policy ----------
test('F5: nextBatch keeps a size inside the band, otherwise sizes for about 10 ms, clamped to powers of two in [64, 4096]', () => {
  const rows = (count, n, ms) => Array.from({ length: n }, (_, i) => ({ start: i * count, count, submitMs: i * ms, doneMs: (i + 1) * ms }));
  assert.equal(nextBatch(rows(512, 8, 10), 512), 512);
  assert.equal(nextBatch(rows(512, 8, 40), 512), 128);                       // 0.078 ms per ray: 128 rays is 10 ms
  assert.equal(nextBatch(rows(512, 8, 1), 512), 4096);
  assert.equal(nextBatch(rows(512, 8, 5000), 512), 64);
  assert.deepEqual(batchDurations([{ submitMs: 0, doneMs: 10 }, { submitMs: 1, doneMs: 25 }]), [10, 15]);   // the second waits for the first
  assert.equal(maxOutstandingOf([{ submitMs: 0, doneMs: 10 }, { submitMs: 1, doneMs: 25 }, { submitMs: 11, doneMs: 30 }]), 2);
  assert.throws(() => nextBatch([], 512), /every batch needs/);
});

test('F5: interpretation recomputes the batch evidence: a size off the policy, a misreported or excessive outstanding count is refused', () => {
  const off = rawOf(); off.sets[0].compensated.runs[4].batch = 256; assert.throws(() => precisionMetrics(fx, off), /batch policy/);
  const lie = rawOf(); lie.sets[0].baseline.runs[0].maxOutstanding = 2; assert.throws(() => precisionMetrics(fx, lie), /maximum outstanding/);
  const three = rawOf(); const b = three.sets[0].baseline.runs[0].batches; b[1].submitMs = 1; b[2].submitMs = 2; three.sets[0].baseline.runs[0].maxOutstanding = 3;
  assert.throws(() => precisionMetrics(fx, three), /more than 2 batches outstanding/);
  const m = precisionMetrics(fx, rawOf());
  assert.deepEqual(m.rows[0].cost.baseline.batch, { sizes: Array(10).fill(512), maxOutstanding: 1 });
});

// ---------- Concern 2: signed bytes with the breakdown ----------
test('concern 2: extraBytes stays signed, the difference of the two allocation peaks, reported with each breakdown', () => {
  const r = rawOf(); r.sets[0].baseline.peakBytes = 262544; r.sets[0].compensated.peakBytes = 196656;
  r.sets[0].baseline.allocations = [{ size: 65536, usage: 136 }]; r.sets[0].compensated.allocations = [{ size: 32, usage: 136 }];
  const row = precisionMetrics(fx, r).rows[0];
  assert.equal(row.extraBytes, -65888);
  // fix round 2 (Codex r2, concern 2): captureBytes is replaced by the storage and staging figures, and the persistent layouts are reported
  assert.deepEqual(row.bytes, { baselinePeak: 262544, compensatedPeak: 196656, extraBytes: -65888, baselinePersistent: [], compensatedPersistent: [], baselineAllocations: [{ size: 65536, usage: 136 }], compensatedAllocations: [{ size: 32, usage: 136 }], captureStorageBytes: corpus.capture.rays * corpus.capture.steps * 64, captureStagingBytes: corpus.capture.rays * corpus.capture.steps * 64 });
});

// ---------- F7: append-only history ----------
const { verifySelection } = await import('../precision.mjs');
const recorded = JSON.parse(await readFile(resolve(ROOT, 'docs/reports/project0/webgpu-g5d-decision.json'), 'utf8'));
test('F7: an appended history still reproduces the selection; an edited history does not', async () => {
  const history = await readFile(resolve(ROOT, recorded.history), 'utf8');
  const withHistory = text => {
    const read = p => (p === recorded.history ? Promise.resolve(Buffer.from(text)) : readFile(resolve(ROOT, p)));
    return { read, close: async values => ({ ...structuredClone(recorded), historySha256: sha(await read(values.history)) }), loadQ: async () => ({}),
      load: async () => ({ manifest: { requestedArgs: [...recorded.requestedArgs] }, records: [] }), fixtures: async () => fx };
  };
  const appended = await verifySelection(withHistory(`${history}\n## A later progress note\n\nAppended after closure.\n`));
  assert.equal(appended.selection.historySha256, recorded.historySha256);
  assert.equal(appended.selection.historyAppended, true);
  await assert.rejects(verifySelection(withHistory(history.replace(/inconclusive/, 'selected'))), /history .* is not an append-only extension/);
});
