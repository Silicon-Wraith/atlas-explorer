// spikes/project0/tests/precision-r2.test.mjs — T12 fix round 2 (Codex T12 r2, run 20261020T175344Z-8ea2; task-T12-report.md "Fix round 2").
// F3: a sample whose evaluation completed survives a refused or unanswered window close. F5: every run and every batch row is validated
// (identity, flags, ordering, coverage), including the final run. Concern 2: the persistent capture storage counts in the compensated peak,
// separately from its diagnostic readback staging, with the persistent layout reported. No browser and no GPU (a fake device).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
globalThis.GPUBufferUsage ??= { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128 };
globalThis.GPUMapMode ??= { READ: 1 };
const { createWatchdog } = await import('../gpu/watchdog.js');
const { createSupervisor } = await import('../browser/supervisor.js');
const { precisionMetrics } = await import('../measure/precision.mjs');
const { primitiveCase } = await import('../precision-validation/models.js');
const { completeRaw, corpus } = await import('./precision-helpers.mjs');
const { run } = await import('../browser/drivers/precision.js');

const fx = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];
const echo = (set, variant) => set.rows.flatMap(r => { const p = r[variant].primary; const code = { hit: 0, miss: 1, unresolved: 2, failure: 3 }[p.status]; return [code, p.status === 'unresolved' ? (p.reason === 'point' ? 1 : 2) : 0, p.status === 'miss' ? 0 : f32bits(p.t), Math.max(1, p.steps)]; });
const sample = () => Array.from({ length: 10 }, (_, i) => 10 + i);
const rawOf = () => completeRaw(fx, { primitives: fx.primitives.map(c => primitiveCase(c)), sets: fx.precision.results.map(set => ({ distance: set.distance, baseline: { words: echo(set, 'baselineInput'), workMs: sample(), readMs: sample(), peakBytes: 1000 }, compensated: { words: echo(set, 'compensatedInput'), workMs: sample(), readMs: sample(), peakBytes: 1500 } })) });

function harness({ close = () => ({ ok: true }), replyMs = 1000 } = {}) {
  const pass = { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} };
  const device = {
    createBuffer: d => ({ size: d.size, usage: d.usage, destroy() {}, mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(d.size), unmap() {} }),
    createBindGroup: () => ({}), createComputePipelineAsync: async desc => ({ desc, getBindGroupLayout: () => ({}) }),
    createCommandEncoder: () => ({ beginComputePass: () => pass, copyBufferToBuffer() {}, finish: () => ({}) }),
    queue: { submit() {}, writeBuffer() {}, onSubmittedWorkDone: () => new Promise(r => setTimeout(r, 0)) },
  };
  const push = message => (message.type === 'window-close' ? close(message) : Promise.resolve({ ok: true }));
  return {
    acquire: async () => ({ device }), onLoss: () => () => {}, destroy: () => {},
    prepare: async () => ({ 'trace_list/bulb': { getBindGroupLayout: () => ({}) } }), compile: async () => ({}), source: async () => '',
    createWatchdog: o => createWatchdog({ ...o, stallMs: 1000, every: 10 }), supervisor: createSupervisor({ push: () => push, heartbeatMs: 1000, replyMs }),
    loadCorpus: async () => { const b = await readFile(new URL('../precision-validation/corpus-v1.json', import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  };
}

// ---------- F3 ----------
for (const [what, close, replyMs, message] of [
  ['refused', m => Promise.resolve(m.name === 'precision/0/0/baseline' ? { ok: false, reason: 'refused by the test' } : { ok: true }), 1000, /window protocol: close of precision\/0\/0\/baseline refused/],
  ['unanswered', m => (m.name === 'precision/0/0/baseline' ? new Promise(() => {}) : Promise.resolve({ ok: true })), 50, /the window precision\/0\/0\/baseline close was not answered/],
]) {
  test(`F3: a ${what} window close keeps the completed measured sample and invalidates the experiment`, async () => {
    const result = await run('precision', fx, new URLSearchParams(), () => {}, harness({ close, replyMs }));
    assert.equal(result.invalidations.length, 1); assert.match(result.invalidations[0], message);
    const raw = result.slots[0].raw, s0 = raw.sets[0];
    assert.equal(raw.complete, false); assert.equal(s0.complete, false);
    assert.equal(s0.baseline.workMs.length, 1, 'the sample measured inside the window is kept'); assert.equal(s0.baseline.readMs.length, 1);
    assert.equal(s0.baseline.runs.length, fx.costProtocol.warmups + 1); assert.equal(s0.baseline.runs.at(-1).measured, true);
    assert.equal(s0.compensated.workMs.length, 0);
  });
}

// ---------- F5 ----------
const mutate = (fn) => { const r = rawOf(); fn(r.sets[0].baseline.runs, r); return r; };
const last = runs => runs.at(-1);
test('F5: malformed, duplicated, misidentified or incomplete batch evidence is refused, in every run including the final one', () => {
  const cases = {
    'final run with a malformed batch': runs => { last(runs).batches = [{ start: 999999, count: -1, submitMs: -2, doneMs: null }]; },
    'every start zero': runs => { for (const r of runs) for (const b of r.batches) b.start = 0; },
    'every run k 0 and unmeasured': runs => { for (const r of runs) { r.k = 0; r.measured = false; } },
    'a duplicated run': runs => { runs[5] = structuredClone(runs[4]); },
    'a measured flag on a warm-up': runs => { runs[0].measured = true; },
    'coverage short of the ray count': runs => { last(runs).batches.pop(); },
    'coverage beyond the ray count': runs => { const b = last(runs).batches; b.push({ ...b.at(-1), start: b.at(-1).start + b.at(-1).count }); },
    'a count that is not the batch size': runs => { last(runs).batches[0].count = 100; },
    'done before submit': runs => { last(runs).batches[2].doneMs = last(runs).batches[2].submitMs - 1; },
    'a negative time': runs => { runs[3].batches[0].submitMs = -1; },
    'a missing completion': runs => { last(runs).batches[1].doneMs = null; },
    'submissions out of order': runs => { const b = last(runs).batches; b[3].submitMs = b[2].submitMs - 1; },
    'a fractional count': runs => { last(runs).batches[0].count = 511.5; },
  };
  for (const [name, fn] of Object.entries(cases)) assert.throws(() => precisionMetrics(fx, mutate(fn)), /batch evidence|batch policy|maximum outstanding|more than 2/, name);
  assert.doesNotThrow(() => precisionMetrics(fx, rawOf()));
});

// ---------- Concern 2 ----------
test('concern 2: the persistent capture storage is in the compensated peak; its readback staging is reported separately; the layout is recorded', async () => {
  const result = await run('precision', fx, new URLSearchParams(), () => {}, harness());
  assert.deepEqual(result.invalidations, []);
  const s0 = result.slots[0].raw.sets[0], storage = 64 * corpus.capture.rays * corpus.capture.steps;
  assert.equal(storage, 8192);
  assert.equal(s0.captureStorageBytes, storage); assert.equal(s0.captureStagingBytes, storage);
  assert.ok(!('captureBytes' in s0), 'the old combined figure, which mixed storage and staging, is gone');
  assert.deepEqual(s0.compensated.persistent, [{ role: 'barrier uniform', size: 16 }, { role: 'capture storage', size: storage }]);
  assert.deepEqual(s0.baseline.persistent, []);
  assert.equal(s0.baseline.peakBytes, 262544); assert.equal(s0.compensated.peakBytes, 204848);   // Codex r2's fully accounted mock trace
  const row = precisionMetrics(fx, (() => { const r = rawOf(); Object.assign(r.sets[0], { captureStorageBytes: storage, captureStagingBytes: storage }); r.sets[0].baseline.peakBytes = 262544; r.sets[0].compensated.peakBytes = 204848; return r; })()).rows[0];
  assert.equal(row.extraBytes, -57696);
  assert.equal(row.bytes.captureStorageBytes, storage); assert.equal(row.bytes.captureStagingBytes, storage);
});

test('concern 2: interpretation requires the storage and staging figures', () => {
  const missing = rawOf(); delete missing.sets[0].captureStorageBytes; assert.throws(() => precisionMetrics(fx, missing), /capture storage bytes must be a nonnegative integer/);
  const staging = rawOf(); staging.sets[3].captureStagingBytes = -1; assert.throws(() => precisionMetrics(fx, staging), /capture staging bytes must be a nonnegative integer/);
});
