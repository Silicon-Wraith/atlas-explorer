// spikes/project0/tests/precision-t12.test.mjs — T12 adaptations to the reviewed changes since the plan (task-T12-report.md):
// 1. the timing-method contract (T6 fix rounds 3-5): precision is registered with one measured descriptor, which the driver attaches; a clean
//    precision record is written clean and accepted at read time, and wrong descriptors or a missing raw measurement are refused;
// 2. the selection (E10): precision verifies the recorded G5-D decision from its evidence and the recorded user selection, never a mechanical
//    'WebGPU selected' that no decision file holds;
// 3. the driver's acquisition failure is the experiment's invalidation, never an unhandled rejection that leaves the watchdog running.
// No browser and no GPU: the driver test runs with a navigator that has no `gpu`, so acquire() fails before any adapter request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { EXPECTED_TIMING, PRECISION_COST_TIMING, CORRECTNESS_ONLY, QUEUE_COMPLETION_WORKMS, validateRecordTiming, validateTimingMethod } from '../timing-contract.js';
import { validateEvidence } from '../gates-checked.js';
import { assessPrecision } from '../measure/precision.mjs';
import { completeRaw } from './precision-helpers.mjs';
import { existsSync } from 'node:fs';
const { finalise } = await import('../run.mjs');

const fx = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
async function scratch() { const b = resolve(ROOT, 'artifacts/runtime'); await mkdir(b, { recursive: true }); return mkdtemp(join(b, 'p0-precision-t12-test-')); }
const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40),
  implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), mode: 'headed', browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' };
const common = dir => ({ gate: 'precision', mode: 'headed', campaign: 'precision', runDir: dir, identity, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures: fx, experiment: true });

// The driver's raw shape (browser/drivers/precision.js): a perfect echo of the CPU references, as in precision.test.mjs.
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];
const echo = (set, variant) => set.rows.flatMap(r => { const p = r[variant].primary; const code = { hit: 0, miss: 1, unresolved: 2, failure: 3 }[p.status]; return [code, p.status === 'unresolved' ? (p.reason === 'point' ? 1 : 2) : 0, p.status === 'miss' ? 0 : f32bits(p.t), Math.max(1, p.steps)]; });
const goodPrims = () => fx.primitives.map(p => { const v = p.value; const hi = Math.fround(v), lo = Math.fround(v - hi); return { hi, lo, thenHi: p.thenValue ?? 0, thenLo: 0 }; });
const sample = () => Array.from({ length: 10 }, (_, i) => 10 + i);
// T12 fix round 1: the complete raw also carries the supplement, captures and batch evidence (tests/precision-helpers.mjs).
const driverRaw = () => completeRaw(fx, { primitives: goodPrims(), sets: fx.precision.results.map(set => ({ distance: set.distance, baseline: { words: echo(set, 'baselineInput'), workMs: sample(), readMs: sample(), peakBytes: 1000 }, compensated: { words: echo(set, 'compensatedInput'), workMs: sample(), readMs: sample(), peakBytes: 1500 } })) });

test('precision is registered with one measured page-clock descriptor (the existing rows are pinned by their own tests)', () => {
  assert.deepEqual(EXPECTED_TIMING.precision, [PRECISION_COST_TIMING]);
  assert.ok(Object.isFrozen(EXPECTED_TIMING.precision) && Object.isFrozen(EXPECTED_TIMING.precision[0]) && Object.isFrozen(PRECISION_COST_TIMING));
  assert.doesNotThrow(() => validateTimingMethod(PRECISION_COST_TIMING));
  assert.equal(PRECISION_COST_TIMING.clock, 'page.performance.now'); assert.equal(PRECISION_COST_TIMING.unit, 'ms');
  assert.equal(PRECISION_COST_TIMING.field, 'costProtocolMs');
  assert.equal(PRECISION_COST_TIMING.readbackIncluded, true, 'the named span contains every readback');
  assert.equal(PRECISION_COST_TIMING.timestampQueriesUsed, false);
  // The descriptor states the two nested sample kinds exactly as the driver measures them.
  for (const words of [/workMs/, /readMs/, /onSubmittedWorkDone/, /readback excluded/i, /mapAsync/]) assert.match(`${PRECISION_COST_TIMING.start} ${PRECISION_COST_TIMING.end}`, words);
});

test('the driver attaches the registered descriptor object itself', async () => {
  const driver = await import('../browser/drivers/precision.js');
  assert.equal(driver.PRECISION_TIMING, PRECISION_COST_TIMING);
});

test('a clean precision record (the driver\'s slot shape) is written clean, accepted at read time, and interpretable', async () => {
  const dir = await scratch();
  try {
    const raw = driverRaw();
    const [rec] = await finalise({ ...common(dir), outcome: { result: { slots: [{ slot: 'precision', raw, timingMethod: PRECISION_COST_TIMING }], invalidations: [] } } });
    assert.equal(rec.gate, 'precision'); assert.equal(rec.slot, 'precision'); assert.equal(rec.experiment, true);
    assert.deepEqual(rec.invalidations, []); assert.deepEqual(rec.metrics, {}); assert.deepEqual(rec.timingMethod, PRECISION_COST_TIMING);
    const saved = JSON.parse(await readFile(join(dir, `${rec.id}.json`), 'utf8'));
    const savedRaw = JSON.parse(await readFile(join(dir, `${rec.id}.raw.json`), 'utf8'));
    assert.doesNotThrow(() => validateEvidence([saved], { raws: { [saved.id]: savedRaw } }));
    const assessed = assessPrecision({ fx, record: saved, raw: savedRaw, selected: [{ identity }] });
    assert.equal(assessed.interpretable, true); assert.equal(assessed.validated, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the precision row refuses other descriptors and a missing or invalid span, and finalise fails closed', async () => {
  const rec = tm => ({ gate: 'precision', slot: 'precision', timingMethod: tm, invalidations: [] });
  assert.throws(() => validateRecordTiming(rec(CORRECTNESS_ONLY), driverRaw()), /^Error: timing method: precision\/precision expects page-clock of costProtocolMs/);
  assert.throws(() => validateRecordTiming(rec(QUEUE_COMPLETION_WORKMS), { ...driverRaw(), workMs: 1 }), /expects page-clock of costProtocolMs/);
  assert.throws(() => validateRecordTiming(rec({ ...PRECISION_COST_TIMING, readbackIncluded: false }), driverRaw()), /expects page-clock of costProtocolMs/);
  for (const bad of [undefined, null, -1, '12', Infinity]) {
    const raw = driverRaw(); if (bad === undefined) delete raw.costProtocolMs; else raw.costProtocolMs = bad;
    assert.throws(() => validateRecordTiming(rec(PRECISION_COST_TIMING), raw), /costProtocolMs must be a finite nonnegative number/);
  }
  assert.throws(() => validateRecordTiming(rec(PRECISION_COST_TIMING), null), /no raw payload holds costProtocolMs/);
  const dir = await scratch();
  try {
    const [missing] = await finalise({ ...common(dir), outcome: { result: { slots: [{ slot: 'precision', raw: driverRaw() }], invalidations: [] } } });
    assert.ok(missing.invalidations.some(x => /^timing method: missing/.test(x)), JSON.stringify(missing.invalidations));
    assert.equal(missing.timingMethod.kind, 'not-measured');
    assert.equal(assessPrecision({ fx, record: missing, raw: driverRaw(), selected: [{ identity }] }).interpretable, false);
    const [incomplete] = await finalise({ ...common(dir), outcome: null });
    assert.equal(incomplete.slot, 'incomplete'); assert.equal(incomplete.timingMethod.kind, 'not-measured');
    assert.ok(!incomplete.invalidations.some(x => /^timing method: /.test(x)), JSON.stringify(incomplete.invalidations));
    assert.equal(assessPrecision({ fx, record: incomplete, raw: {}, selected: [{ identity }] }).interpretable, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the driver turns an acquisition failure into its invalidation, without leaving its watchdog running', async () => {
  const had = Object.hasOwn(globalThis, 'navigator'), before = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });   // no navigator.gpu: no adapter is requested
  try {
    const { run } = await import('../browser/drivers/precision.js');
    const result = await run('precision', fx, new URLSearchParams(), () => {});
    assert.deepEqual(result, { slots: [], invalidations: ['driver error: navigator.gpu is absent'] });
  } finally { if (had) globalThis.navigator = before; else delete globalThis.navigator; }
});

// The selection (E10). T12 fix round 1 (Codex r1 finding 6): the unit tests inject the campaign, profile and fixture loaders, so they need no
// local campaign evidence; the real reproduction is an integration test that states its evidence prerequisite and is skipped without it.
const { verifySelection, SELECTION } = await import('../precision.mjs');
const recorded = JSON.parse(await readFile(resolve(ROOT, 'docs/reports/project0/webgpu-g5d-decision.json'), 'utf8'));
const selectedRecords = [{ id: 'G4-x', campaign: 'webgpu-g5d', identity: { ...identity } }];
const loaders = { close: async () => structuredClone(recorded), loadQ: async () => ({ doc: {} }), load: async () => ({ manifest: { requestedArgs: [...recorded.requestedArgs] }, records: selectedRecords }), fixtures: async () => fx };
const evidenceManifest = JSON.parse(await readFile(resolve(ROOT, recorded.manifest), 'utf8'));
const evidencePresent = existsSync(resolve(ROOT, 'artifacts/project0', evidenceManifest.runDirs[0]));

test('integration: the G5-D decision reproduces from its saved evidence (mechanically inconclusive), and WebGPU is selected by the recorded E10 user decision',
  { skip: !evidencePresent && `the webgpu-g5d campaign evidence (artifacts/project0/${evidenceManifest.runDirs[0]}, not in git) is not present` }, async () => {
  const v = await verifySelection();
  assert.equal(v.args, 'remediation');
  assert.deepEqual(v.manifest.requestedArgs, recorded.requestedArgs);
  assert.equal(v.selection.basis, 'user decision E10');
  assert.equal(v.selection.mechanicalOutcome, 'inconclusive');
  assert.equal(v.selection.decisionFile, 'docs/reports/project0/webgpu-g5d-decision.json');
  assert.ok(v.records.length > 0 && v.records.every(r => r.identity.mode === 'headed' && r.campaign === 'webgpu-g5d'));
});

test('the selection, with injected loaders, returns the selected launch configuration, records and basis', async () => {
  const v = await verifySelection(loaders);
  assert.equal(v.args, 'remediation'); assert.equal(v.records, selectedRecords); assert.equal(v.fx, fx);
  assert.equal(v.selection.basis, 'user decision E10'); assert.equal(v.selection.mechanicalOutcome, 'inconclusive');
});

test('the selection is refused when the decision does not reproduce, the E10 record or the platform decision is absent, the manifest changed, or no launch configuration matches', async () => {
  await assert.rejects(verifySelection({ ...loaders, close: async () => ({ ...structuredClone(recorded), decision: { ...recorded.decision, outcome: 'WebGPU selected' } }) }), /does not reproduce from its evidence/);
  const reading = (path, edit) => p => readFile(resolve(ROOT, p)).then(b => (p === path ? Buffer.from(edit(String(b))) : b));
  await assert.rejects(verifySelection({ ...loaders, read: reading(SELECTION.decisions, t => t.replace(SELECTION.heading, '## E10 — something else')) }), /E10 user selection is not recorded/);
  await assert.rejects(verifySelection({ ...loaders, read: reading(SELECTION.platform, t => t.replace(SELECTION.selected, '**Selected backend: none.**')) }), /platform decision does not record WebGPU/);
  await assert.rejects(verifySelection({ ...loaders, read: reading(recorded.manifest, t => `${t} `) }), /the manifest changed after the decision was recorded/);
  await assert.rejects(verifySelection({ ...loaders, launch: { attempt1: ['--enable-gpu'] } }), /no current launch configuration equals the selected configuration's flags/);
  // production verification still rejects missing evidence: a loader that cannot find the campaign is an error, never a skip
  await assert.rejects(verifySelection({ ...loaders, load: async () => { throw new Error('ENOENT: no such run directory'); } }), /ENOENT/);
});
