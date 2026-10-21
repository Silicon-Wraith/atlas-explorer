// spikes/project0/tests/smoke-timing.test.mjs — T7: the smoke experiment's timing-method registration (T6 report, "Registration contract for
// T7–T9"). smoke records carry CORRECTNESS_ONLY: a clean smoke record is written clean and accepted at read time; the row never admits a
// measured descriptor, and an incomplete smoke session is still not-measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { EXPECTED_TIMING, CORRECTNESS_ONLY, QUEUE_COMPLETION_WORKMS, validateRecordTiming } from '../timing-contract.js';
import { validateEvidence } from '../gates-checked.js';
const { finalise } = await import('../run.mjs');

async function scratch() { const b = resolve(ROOT, 'artifacts/runtime'); await mkdir(b, { recursive: true }); return mkdtemp(join(b, 'p0-smoke-timing-test-')); }
const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40),
  implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), mode: 'headed', browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' };
const frame = { requestId: 1, generation: 1, epoch: 1, view: 'sphere', label: 'sphere', W: 640, H: 360, counts: { total: 230400, hit: 1, miss: 230399, point: 0, steps: 0, failure: 0, normalUnavailable: 0 }, t: 12 };
const common = dir => ({ gate: 'smoke', mode: 'headed', campaign: 'dev', runDir: dir, identity, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures: {}, experiment: true });

test('smoke is registered as correctness-only (the existing rows are pinned by timing-contract.test.mjs)', () => {
  assert.deepEqual(EXPECTED_TIMING.smoke, [CORRECTNESS_ONLY]);
  assert.ok(Object.isFrozen(EXPECTED_TIMING.smoke) && Object.isFrozen(EXPECTED_TIMING.smoke[0]));
});

test('a clean smoke record (the smoke driver\'s slot shape) is written clean and accepted at read time with its raw payload', async () => {
  const dir = await scratch();
  try {
    const raw = { out: [{ view: 'sphere', profile: 'draft', ms: 40, frame, outstandingMax: 2, submits: 30 }] };
    const [rec] = await finalise({ ...common(dir), outcome: { result: { slots: [{ slot: 'smoke', raw, timingMethod: CORRECTNESS_ONLY }], invalidations: [] } } });
    assert.equal(rec.gate, 'smoke'); assert.equal(rec.slot, 'smoke'); assert.equal(rec.experiment, true);
    assert.deepEqual(rec.invalidations, []); assert.deepEqual(rec.metrics, {}); assert.deepEqual(rec.timingMethod, CORRECTNESS_ONLY);
    const saved = JSON.parse(await readFile(join(dir, `${rec.id}.json`), 'utf8'));
    assert.deepEqual(saved.timingMethod, CORRECTNESS_ONLY); assert.deepEqual(saved.invalidations, []);
    const savedRaw = JSON.parse(await readFile(join(dir, `${rec.id}.raw.json`), 'utf8'));
    assert.doesNotThrow(() => validateEvidence([saved], { raws: { [saved.id]: savedRaw } }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the smoke driver\'s failure branch keeps its driver invalidation and adds no timing-method invalidation', async () => {
  const dir = await scratch();
  try {
    const [rec] = await finalise({ ...common(dir), outcome: { result: { slots: [{ slot: 'smoke', raw: { out: [], error: 'boom' }, timingMethod: CORRECTNESS_ONLY }], invalidations: ['driver error: boom'] } } });
    assert.deepEqual(rec.invalidations, ['driver error: boom']); assert.deepEqual(rec.timingMethod, CORRECTNESS_ONLY);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the smoke row refuses a missing or measured descriptor, and an incomplete smoke session is not-measured', async () => {
  assert.throws(() => validateRecordTiming({ gate: 'smoke', slot: 'smoke', timingMethod: QUEUE_COMPLETION_WORKMS, invalidations: [] }, { workMs: 1 }), /^Error: timing method: smoke\/smoke expects correctness-only/);
  const dir = await scratch();
  try {
    const [missing] = await finalise({ ...common(dir), outcome: { result: { slots: [{ slot: 'smoke', raw: { out: [] } }], invalidations: [] } } });
    assert.ok(missing.invalidations.some(x => /^timing method: missing/.test(x)), JSON.stringify(missing.invalidations));
    assert.equal(missing.timingMethod.kind, 'not-measured');
    const [incomplete] = await finalise({ ...common(dir), outcome: null });
    assert.equal(incomplete.slot, 'incomplete'); assert.equal(incomplete.timingMethod.kind, 'not-measured');
    assert.ok(!incomplete.invalidations.some(x => /^timing method: /.test(x)), JSON.stringify(incomplete.invalidations));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
