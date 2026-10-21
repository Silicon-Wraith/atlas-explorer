// spikes/project0/tests/timing-contract.test.mjs — T6 fix round 4: the timing method is checked when records are read, not only when they
// are written. Saved records reach a verdict only through evaluateGateChecked; a missing, malformed or contradictory descriptor never passes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGate } from '../gates.js';
import { evaluateGateChecked, validateEvidence } from '../gates-checked.js';
import { EXPECTED_TIMING, QUEUE_COMPLETION_WORKMS, CORRECTNESS_ONLY, notMeasured, validateRecordTiming, inspectTimingDescriptor } from '../timing-contract.js';

// The same record shape as T1's contract tests (a frozen file, copied here rather than imported).
const fixtures = {
  analytic: { sphere: { rays: Array(625) }, box: { rays: Array(651) }, 'menger-1': { rays: Array(1681) }, 'menger-2': { rays: Array(1681) } },
  arithmetic: { bulb: Array.from({ length: 4096 }, () => ({ eligible: true })), plane: Array.from({ length: 4096 }, () => ({ eligible: true })) }
};
const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40),
  implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), browserVersion: 'test-browser', browserExecutable: '/test/chrome', driver: 'test-driver', session: 'test-session', mode: 'headed' };
const QUEUE = { kind: 'queue-completion', clock: 'page.performance.now', unit: 'ms', field: 'workMs', start: 'before the first batch is prepared', end: 'after the final onSubmittedWorkDone promise resolves', readbackIncluded: false, timestampQueriesUsed: false };

function g3Evidence() {
  const manifest = { fixture: { fixtureHash: identity.fixtureHash, fixtureCommit: identity.fixtureCommit, specHash: identity.specHash }, trials: {} };
  const records = [], raws = {};
  for (const [slot, fixture] of Object.entries(fixtures.analytic)) {
    const id = `G3-${slot}`;
    manifest.trials[`G3/${slot}`] = { id, identity };
    records.push({ schema: 1, id, gate: 'G3', slot, identity, invalidations: [], artifacts: [{ path: `${id}.raw.json`, sha256: '1'.repeat(64) }],
      metrics: { rays: fixture.rays.length, statusErrors: 0, edgeErrors: 0, depthRatio: 0.5 }, timingMethod: { ...QUEUE } });
    raws[id] = { words: [], workMs: 12.5 };
  }
  return { records, manifest, raws };
}
const tamper = (change, index = 0) => { const e = g3Evidence(); change(e.records[index], e); return e; };

test('the canonical queue-completion descriptor is the one Codex defined, and G3 expects exactly it', () => {
  assert.deepEqual(QUEUE_COMPLETION_WORKMS, QUEUE);
  assert.deepEqual(EXPECTED_TIMING.G3, [QUEUE]);
  for (const gate of ['G4', 'G5', 'derivative-policy', 'probe']) assert.deepEqual(EXPECTED_TIMING[gate], [CORRECTNESS_ONLY], gate);
  assert.ok(Object.isFrozen(EXPECTED_TIMING) && Object.isFrozen(EXPECTED_TIMING.G3) && Object.isFrozen(EXPECTED_TIMING.G3[0]));
});

test('a valid G3 record set passes through the checked evaluator only with its raw payloads', () => {
  const { records, manifest, raws } = g3Evidence();
  assert.equal(evaluateGateChecked('G3', records, manifest, fixtures, { raws }).status, 'pass');
});

// T6 fix round 5 (Codex r6): a verdict needs a usable raw payload for every measured record. Before this round an omitted map and an
// undefined entry both returned `pass`.
test('read time: an omitted raws map, or a raws entry that is undefined or null, is invalid/inconclusive, never pass', () => {
  const omitted = g3Evidence();
  for (const args of [[], [{}], [{ raws: undefined }], [{ raws: null }], [{ raws: 'x' }]]) {
    const result = evaluateGateChecked('G3', omitted.records, omitted.manifest, omitted.fixtures ?? fixtures, ...args);
    assert.equal(result.status, 'invalid/inconclusive', JSON.stringify(args)); assert.match(result.reasons[0], /^timing method: .*raws/);
  }
  assert.throws(() => validateEvidence(omitted.records), /^Error: timing method: .*raws/);
  for (const entry of [undefined, null, 'x', 7]) {
    const { records, manifest, raws } = g3Evidence();
    raws[records[0].id] = entry;
    const result = evaluateGateChecked('G3', records, manifest, fixtures, { raws });
    assert.equal(result.status, 'invalid/inconclusive', String(entry)); assert.match(result.reasons[0], /no raw payload/);
  }
  // The shared validator never skips the raw check for a measured descriptor: undefined is not "not supplied".
  assert.throws(() => validateRecordTiming(g3Evidence().records[0], undefined), /no raw payload/);
  assert.throws(() => validateRecordTiming(g3Evidence().records[0]), /no raw payload/);
});

test('descriptor-only inspection is separate from verdicts: it checks shape and gate, not the raw value', () => {
  const { records } = g3Evidence();
  assert.deepEqual(inspectTimingDescriptor(records[0]), QUEUE);
  assert.throws(() => inspectTimingDescriptor({ ...records[0], timingMethod: CORRECTNESS_ONLY }), /^Error: timing method: G3\/sphere expects/);
  assert.throws(() => inspectTimingDescriptor({ ...records[0], timingMethod: undefined }), /missing/);
});

// Codex r5 finding 1: each of these returned `pass` from evaluateGate, because T1's frozen validateRecords ignores timingMethod.
const readCases = {
  'timingMethod deleted': r => { delete r.timingMethod; },
  'timingMethod a string': r => { r.timingMethod = 'queue-completion'; },
  'contradictory timestamp flag': r => { r.timingMethod.timestampQueriesUsed = true; },
  // Codex r5 finding 2: a completed G3 slot whose descriptor does not describe a queue-completion workMs measurement.
  'G3 with correctness-only': r => { r.timingMethod = { ...CORRECTNESS_ONLY }; },
  'G3 with not-measured and an arbitrary reason': r => { r.timingMethod = notMeasured('no timing'); },
  'queue-completion naming the wrong field, a GPU timestamp clock and seconds': r => { r.timingMethod = { ...QUEUE, field: 'gpuWorkSeconds', clock: 'gpu.timestamp', unit: 's' }; },
};
for (const [name, change] of Object.entries(readCases)) {
  test(`read time: ${name} is invalid/inconclusive, never pass`, () => {
    const { records, manifest, raws } = tamper(change);
    assert.equal(evaluateGate('G3', records, manifest, fixtures).status, 'pass', 'the frozen evaluator alone accepts it: this is why the wrapper exists');
    const result = evaluateGateChecked('G3', records, manifest, fixtures, { raws });
    assert.equal(result.status, 'invalid/inconclusive');
    assert.equal(result.reasons.length, 1); assert.match(result.reasons[0], /^timing method: /);
    assert.deepEqual(result.evidenceIds, records.map(r => r.id));
    assert.throws(() => validateEvidence(records, { raws }), /^Error: timing method: /);
  });
}

test('read time: a raw payload whose workMs is missing, negative or not a number is invalid', () => {
  for (const workMs of [undefined, -1, '12', null]) {
    const { records, manifest, raws } = g3Evidence();
    raws[records[1].id] = { words: [], ...(workMs === undefined ? {} : { workMs }) };
    const result = evaluateGateChecked('G3', records, manifest, fixtures, { raws });
    assert.equal(result.status, 'invalid/inconclusive', String(workMs)); assert.match(result.reasons[0], /workMs/);
  }
  const { records, manifest, raws } = g3Evidence();
  delete raws[records[2].id];
  assert.match(evaluateGateChecked('G3', records, manifest, fixtures, { raws }).reasons[0], /no raw payload/);
});

test('read time: a not-measured completed slot is accepted only beside its timing invalidation, and then the gate is still not a pass', () => {
  const { records, manifest, raws } = tamper(r => { r.timingMethod = notMeasured('timing method: missing (the producer must supply one)'); r.invalidations = ['timing method: missing (the producer must supply one)']; });
  validateEvidence(records, { raws });
  const result = evaluateGateChecked('G3', records, manifest, fixtures, { raws });
  assert.equal(result.status, 'invalid/inconclusive'); assert.deepEqual(result.reasons, ['timing method: missing (the producer must supply one)']);
  const other = tamper(r => { r.timingMethod = notMeasured('no timing'); r.invalidations = ['console error: x']; });
  assert.throws(() => validateEvidence(other.records, { raws: other.raws }), /not-measured/);
});

test('a gate with no registered expectation fails closed, and a correctness-only gate refuses a measured descriptor', () => {
  assert.throws(() => validateRecordTiming({ gate: 'G99', slot: 'x', timingMethod: QUEUE, invalidations: [] }), /^Error: timing method: no expected timing method registered for G99/);   // T9 registered G6, the former example
  assert.throws(() => validateRecordTiming({ gate: 'G4', slot: 'bulb-samples', timingMethod: QUEUE, invalidations: [] }), /^Error: timing method: G4\/bulb-samples expects/);
  validateRecordTiming({ gate: 'G4', slot: 'bulb-samples', timingMethod: CORRECTNESS_ONLY, invalidations: [] });
  validateRecordTiming({ gate: 'G6', slot: 'incomplete', timingMethod: notMeasured('incomplete: the session produced no result'), invalidations: ['incomplete: the session produced no result'] });
});
