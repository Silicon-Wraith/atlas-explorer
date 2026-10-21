// spikes/project0/tests/t8-timing.test.mjs — T8: the timing-method registration of G11 and G13 (T6 report, "Registration contract for T7–T9").
// Both gates are correctness-only: no G11 or G13 rule bounds a duration (gates.js), and neither raw payload has a top-level duration field. A
// clean record of either gate is written clean through the real finalise/writeRecord and accepted at read time with its raw payload; the rows
// never admit a measured descriptor; a slot with no descriptor is invalidated; an incomplete session is not-measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { EXPECTED_TIMING, CORRECTNESS_ONLY, QUEUE_COMPLETION_WORKMS, notMeasured, validateRecordTiming } from '../timing-contract.js';
import { validateEvidence } from '../gates-checked.js';
const { finalise } = await import('../run.mjs');

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
async function scratch() { const b = resolve(ROOT, 'artifacts/runtime'); await mkdir(b, { recursive: true }); return mkdtemp(join(b, 'p0-t8-timing-test-')); }
const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40),
  implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), mode: 'headed', browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' };
const common = (gate, dir) => ({ gate, mode: 'headed', campaign: 'dev', runDir: dir, identity, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures, experiment: false });
const MEASURED = { ...QUEUE_COMPLETION_WORKMS, field: 'peakBytes' };   // a well-formed measured descriptor naming a field that exists in G11's raw

// The G11 driver's raw shape (resources.js exerciseResources), clean: the brief's `good` observation.
const g11 = () => ({ tableBytes: 405995520, before: { bytes: 100, textures: 0, buffers: 1 }, after: { bytes: 100, textures: 0, buffers: 1 }, peakBytes: 406000000,
  written: Array(7).fill(true), checks: Array.from({ length: 63 }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160,
  cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] });
// The G13 driver's raw shapes (lifecycle.js runLifecycle), clean.
const frame = { requestId: 9, generation: 1, epoch: 6, view: 'bulb-overview', label: 'bulb-overview', W: 1280, H: 720, counts: { total: 921600, hit: 250000, miss: 671600, point: 0, steps: 0, failure: 0 }, t: 5 };
const g13 = kind => ({ kind, request: { view: 'bulb-overview', profile: 'settled' }, lostRequestId: 1, preserved: { view: 'bulb-overview', profile: 'settled' },
  submittedBeforeLoss: { requestId: 1, generation: 1, epoch: 4, batch: 1, t: 1 }, loss: { epoch: 4, reason: kind === 'intentional' ? 'destroyed' : 'unknown', message: '', injected: kind === 'injected' },
  decision: 'recover', interrupted: true, publicationsOfLost: 0, latePublications: 0, recovery: { epoch: 6, requestId: 9, frame } });
const repeated = () => ({ decision: 'stop', acquisitionsBefore: 3, acquisitionsAfter: 3 });

// One finalise per fresh run directory: record ids are stamped with the directory name.
async function once(gate, outcome) {
  const dir = await scratch();
  try { return await finalise({ ...common(gate, dir), outcome }); } finally { await rm(dir, { recursive: true, force: true }); }
}

async function writtenClean(gate, slots, expected) {
  const dir = await scratch();
  try {
    const records = await finalise({ ...common(gate, dir), outcome: { result: { slots, invalidations: [] } } });
    assert.deepEqual(records.map(r => r.slot), slots.map(s => s.slot));
    const saved = [], raws = {};
    for (const [i, rec] of records.entries()) {
      assert.equal(rec.gate, gate); assert.equal(rec.experiment, false);
      assert.deepEqual(rec.invalidations, [], `${gate}/${rec.slot}: ${JSON.stringify(rec.invalidations)}`);
      assert.deepEqual(rec.metrics, expected[i]); assert.deepEqual(rec.timingMethod, CORRECTNESS_ONLY);
      const s = JSON.parse(await readFile(join(dir, `${rec.id}.json`), 'utf8'));
      assert.deepEqual(s.timingMethod, CORRECTNESS_ONLY); assert.deepEqual(s.invalidations, []);
      saved.push(s); raws[s.id] = JSON.parse(await readFile(join(dir, `${rec.id}.raw.json`), 'utf8'));
    }
    assert.doesNotThrow(() => validateEvidence(saved, { raws }));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('G11 and G13 are registered as correctness-only (the earlier rows are pinned by timing-contract.test.mjs and smoke-timing.test.mjs)', () => {
  for (const gate of ['G11', 'G13']) {
    assert.deepEqual(EXPECTED_TIMING[gate], [CORRECTNESS_ONLY], gate);
    assert.ok(Object.isFrozen(EXPECTED_TIMING[gate]) && Object.isFrozen(EXPECTED_TIMING[gate][0]), gate);
  }
});

test('a clean G11 record (the G11 driver\'s slot shape) is written clean and accepted at read time with its raw payload', async () => {
  await writtenClean('G11', [{ slot: '4k', raw: g11(), timingMethod: CORRECTNESS_ONLY }],
    [{ tableBytes: 405995520, peakBytes: 406000000, texturesWritten: 7, selectedChecks: 63, mismatches: 0, fullBandBytes: 3932160, cancelled: 1, released: 1, outstandingMax: 2 }]);
});

test('clean G13 records (intentional, injected, repeated) are written clean and accepted at read time with their raw payloads', async () => {
  const clean = { interrupted: 1, successes: 0, requestPreserved: 1, latePublications: 0, validRecovery: 1 };
  await writtenClean('G13', [{ slot: 'intentional', raw: g13('intentional'), timingMethod: CORRECTNESS_ONLY }, { slot: 'injected', raw: g13('injected'), timingMethod: CORRECTNESS_ONLY },
    { slot: 'repeated', raw: repeated(), timingMethod: CORRECTNESS_ONLY }], [clean, clean, { automaticRetriesAfterRepeat: 0 }]);
});

test('the G11 and G13 rows refuse a measured or not-measured descriptor on a completed slot', () => {
  const cases = [['G11', '4k', g11()], ['G13', 'intentional', g13('intentional')], ['G13', 'injected', g13('injected')], ['G13', 'repeated', repeated()]];
  for (const [gate, slot, raw] of cases) {
    assert.throws(() => validateRecordTiming({ gate, slot, timingMethod: QUEUE_COMPLETION_WORKMS, invalidations: [] }, { ...raw, workMs: 1 }), new RegExp(`^Error: timing method: ${gate}/${slot} expects correctness-only`));
    assert.throws(() => validateRecordTiming({ gate, slot, timingMethod: MEASURED, invalidations: [] }, raw), new RegExp(`^Error: timing method: ${gate}/${slot} expects correctness-only`));
    assert.throws(() => validateRecordTiming({ gate, slot, timingMethod: notMeasured('no timing'), invalidations: [] }, raw), /a completed slot may be not-measured only beside a timing-method invalidation/);
    assert.throws(() => validateRecordTiming({ gate, slot, timingMethod: { kind: 'correctness-only', clock: 'page.performance.now' }, invalidations: [] }, raw), /unexpected field clock/);
  }
});

test('a wrong G11 or G13 descriptor reaching finalise is invalidated and recorded not-measured, never written clean', async () => {
  for (const [gate, slot, raw] of [['G11', '4k', g11()], ['G13', 'intentional', g13('intentional')], ['G13', 'repeated', repeated()]]) {
    for (const timingMethod of [undefined, QUEUE_COMPLETION_WORKMS, MEASURED]) {
      const [rec] = await once(gate, { result: { slots: [{ slot, raw, timingMethod }], invalidations: [] } });
      assert.ok(rec.invalidations.some(x => /^timing method: /.test(x)), `${gate}/${slot} ${JSON.stringify(timingMethod)}: ${JSON.stringify(rec.invalidations)}`);
      assert.ok(!rec.invalidations.some(x => /no expected timing method registered/.test(x)), `${gate} must be registered: ${JSON.stringify(rec.invalidations)}`);
      assert.equal(rec.timingMethod.kind, 'not-measured');
    }
  }
});

test('the drivers\' failure shapes keep their own invalidations and add no timing-method invalidation; an incomplete session is not-measured', async () => {
  // G11: an observation that recorded an error (e.g. the allocator's refusal) is invalidated by its metrics, not by its timing method.
  const [g11rec] = await once('G11', { result: { slots: [{ slot: '4k', raw: { ...g11(), errors: ['allocation cap exceeded: 1 + 2 > 3'] }, timingMethod: CORRECTNESS_ONLY }], invalidations: [] } });
  assert.deepEqual(g11rec.invalidations, ['metrics: allocation cap exceeded: 1 + 2 > 3']); assert.deepEqual(g11rec.timingMethod, CORRECTNESS_ONLY);
  // G13: the catch slot (raw + error) beside the driver's invalidation.
  const [g13rec] = await once('G13', { result: { slots: [{ slot: 'intentional', raw: { ...g13('intentional'), recovery: null, error: 'device lost: unexpected loss (unknown) at epoch 3' }, timingMethod: CORRECTNESS_ONLY }], invalidations: ['device lost: unexpected loss (unknown) at epoch 3'] } });
  assert.equal(g13rec.invalidations[0], 'device lost: unexpected loss (unknown) at epoch 3');
  assert.ok(g13rec.invalidations.some(x => /^metrics: G13\/intentional: driver error: /.test(x)), JSON.stringify(g13rec.invalidations));
  assert.ok(!g13rec.invalidations.some(x => /^timing method: /.test(x)), JSON.stringify(g13rec.invalidations)); assert.deepEqual(g13rec.timingMethod, CORRECTNESS_ONLY);
  for (const gate of ['G11', 'G13']) {
    const [incomplete] = await once(gate, null);
    assert.equal(incomplete.slot, 'incomplete'); assert.equal(incomplete.timingMethod.kind, 'not-measured');
    assert.ok(!incomplete.invalidations.some(x => /^timing method: /.test(x)), JSON.stringify(incomplete.invalidations));
  }
});
