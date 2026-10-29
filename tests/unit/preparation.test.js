import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, fnv1a64 } from '../../src/shared/scene.js';
import { createWorldRecord, worldReference, createPreparationRequest, createPreparedArtifact, createPreparationResult,
  representationKey, assertResultForRequest, assertPreparationReceipt } from '../../src/space/preparation/contract.js';
import { createResourceLease, createPreparationSession } from '../../src/space/preparation/lifecycle.js';

const hash = '0'.repeat(64), producer = { instanceId: 'native-start-nonce', epoch: 3 };
const worldInput = () => ({ id: 'fixed-world', generator: { id: 'generator', version: '1' }, parameters: { frequency: 64 },
  assets: [{ role: 'math', sha256: hash }], lineage: [{ id: 'parent', parent: null }, { id: 'child', parent: 'parent' }] });
const world = createWorldRecord(worldInput()), reference = worldReference(world);
const box = { min: [-1, -1, -1], max: [1, 1, 1] };
const spec = (intent = 'interaction') => ({ world: reference, bounds: box, intent, requirements: { maxErrorM: .01, bodyDiameterM: intent === 'view' ? null : 1 } });
const request = (patch = {}) => createPreparationRequest({ schema: 'atlas.preparation.request', schemaVersion: 1,
  identity: { runtimeId: 'page', epoch: 0, requestId: 'page:1' }, producer, ...spec(), ...patch });
function artifact(intent = 'interaction', classification = 'surface') {
  const solid = classification === 'surface', empty = classification === 'empty-air';
  return createPreparedArtifact({ schema: 'atlas.preparation.artifact', schemaVersion: 1, world: reference, bounds: box,
    transform: { originM: [0, 0, 0], metresPerUnit: 1 }, intent, classification,
    classificationBasis: { kind: 'constructed-approximation', method: 'synthetic-composed-volume', evidenceId: 'synthetic', volumeM3: empty ? 0 : solid ? 4 : 8 },
    qualification: { kind: 'empirical', toleranceM: .01, referenceSamples: 16, meshSamples: 16, limits: ['finite test fixture'], evidenceId: 'synthetic', denseValidation: false },
    representation: { builder: { id: 'builder', version: '1', sourceDigests: [{ role: 'source', sha256: hash }] },
      sampling: { cells: 256, stepM: 1 / 256, tileWidthM: 1, rtinToleranceM: .001, coordinateType: 'float32-local-metres-per-unit' },
      dependencies: [], features: ['parent', 'child'] },
    buffers: ['vertices', 'surface-indices', ...(intent === 'interaction' ? ['solid-indices'] : [])].map(role => ({ role, byteLength: solid ? 12 : 0, sha256: hash })),
  });
}
const result = (q, a = artifact()) => createPreparationResult({ schema: 'atlas.preparation.result', schemaVersion: 1,
  identity: q.identity, producer: q.producer, status: 'prepared', reason: null, artifact: a });
const receipt = (a, lease) => ({ renderRevision: representationKey(a), collisionRevision: a.intent === 'view' ? null : representationKey(a), collisionKind: a.intent === 'view' ? null : a.classification, lease });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness({ intent = 'interaction', classification = 'surface', produceGate, prepareGate, badReceipt = false, stale = false, releaseError = false } = {}) {
  const releases = [], events = [], built = deferred(), producing = deferred();
  const session = createPreparationSession({ runtimeId: 'page', producer });
  const a = artifact(intent, classification);
  const ticket = session.start(spec(intent), {
    async produce(q) {
      producing.resolve(); if (produceGate) await produceGate.promise;
      const payload = createResourceLease({ owner: 'transfer', bytes: 12 }, { test: true }, () => releases.push('payload'));
      const r = result(q, a);
      return { result: stale ? { ...r, producer: { ...r.producer, epoch: r.producer.epoch - 1 } } : r, payload };
    },
    async prepare(value, data, signal) {
      events.push({ intent: value.intent, data, signal }); built.resolve(); if (prepareGate) await prepareGate.promise;
      const lease = createResourceLease({ owner: 'consumer', bytes: 24 }, {}, () => { releases.push('resources'); if (releaseError) throw new Error('free failed'); });
      return { ...receipt(value, lease), ...(badReceipt ? { collisionRevision: 'wrong' } : {}) };
    },
  });
  return { session, ticket, a, releases, events, built, producing };
}

test('preparation world identity is independent of body requirements and owns immutable inputs', () => {
  const input = worldInput(), w = createWorldRecord(input); input.parameters.frequency = 2;
  assert.equal(w.parameters.frequency, 64); assert.equal(w.definitionKey, world.definitionKey);
  assert.equal(request().world.definitionKey, request({ requirements: { maxErrorM: .01, bodyDiameterM: .1 } }).world.definitionKey);
  assert.notEqual(createWorldRecord({ ...worldInput(), parameters: { frequency: 65 } }).definitionKey, w.definitionKey);
  assert.throws(() => worldReference({ ...w, definitionKey: 'forged' }), /key mismatch/);
  assert.throws(() => createWorldRecord({ ...worldInput(), lineage: [{ id: 'child', parent: 'absent' }] }), /preceding parents/);
});

test('preparation rejects unsupported versions, unknown fields, missing classification and invalid numerical data', () => {
  for (const patch of [{ schemaVersion: 2 }, { fixtureIndex: 0 }, { bounds: { min: [0, 0, 0], max: [0, 1, 1] } }, { requirements: { maxErrorM: NaN, bodyDiameterM: 1 } }]) assert.throws(() => createPreparationRequest({ ...request(), ...patch }));
  const a = structuredClone(artifact()); delete a.classification;
  assert.throws(() => createPreparedArtifact(a), /classification/);
  assert.throws(() => createPreparedArtifact({ ...artifact(), classification: 'unknown' }), /classification/);
  assert.throws(() => createPreparedArtifact({ ...artifact(), classificationBasis: { ...artifact().classificationBasis, method: '' } }), /method/);
  assert.throws(() => createPreparationRequest({ ...request({ intent: 'view' }), requirements: { maxErrorM: .01, bodyDiameterM: 1 } }), /no interaction body/);
});

test('preparation keys include the full representation policy but exclude qualification mode and request identity', () => {
  const a = artifact(), key = representationKey(a);
  assert.equal(representationKey({ ...a, qualification: { ...a.qualification, denseValidation: true, referenceSamples: 32 } }), key);
  for (const field of ['cells', 'stepM', 'tileWidthM', 'rtinToleranceM']) {
    const r = structuredClone(a); r.representation.sampling[field] *= 2;
    assert.notEqual(representationKey(r), key, field);
  }
  const r = structuredClone(a); r.representation.dependencies.push({ role: 'retained-parent-reference', sha256: '1'.repeat(64) });
  assert.notEqual(representationKey(r), key);
  assert.notEqual(representationKey({ ...a, transform: { ...a.transform, metresPerUnit: 2 } }), key);
  assert.throws(() => createPreparedArtifact({ ...a, fixtureIndex: 0 }), /exactly/);
});

test('preparation preserves actual containing bounds and compares declared tolerance, not sampled errors', () => {
  const q = request({ bounds: { min: [-.5, -.5, -.5], max: [.5, .5, .5] } });
  assert.deepEqual(assertResultForRequest(result(q), q).artifact.bounds, box);
  assert.throws(() => assertResultForRequest(result(request()), request({ bounds: { min: [-2, -1, -1], max: [1, 1, 1] } })), /coverage/);
  const strict = request({ requirements: { maxErrorM: .001, bodyDiameterM: 1 } });
  assert.throws(() => assertResultForRequest(result(strict), strict), /declared tolerance/);
});

test('preparation rejects stale consumer and producer epochs even with a reused request ID', () => {
  const q = request(), r = result(q);
  assert.throws(() => assertResultForRequest({ ...r, identity: { ...q.identity, epoch: 1 } }, q), /stale/);
  assert.throws(() => assertResultForRequest({ ...r, producer: { ...q.producer, instanceId: 'old-start' } }, q), /stale/);
  assert.throws(() => assertResultForRequest({ ...r, producer: { ...q.producer, epoch: 2 } }, q), /stale/);
});

test('preparation requires geometry for surfaces and explicit consistent empty/full occupancy', () => {
  const a = artifact(); assert.throws(() => createPreparedArtifact({ ...a, buffers: a.buffers.map(b => ({ ...b, byteLength: 0 })) }), /geometry/);
  assert.throws(() => createPreparedArtifact({ ...a, classification: 'empty-air' }), /zero composed volume/);
  assert.throws(() => createPreparedArtifact({ ...a, classification: 'full-solid' }), /full composed box/);
  assert.equal(artifact('interaction', 'empty-air').classification, 'empty-air');
  assert.equal(artifact('interaction', 'full-solid').classification, 'full-solid');
});

test('preparation view receipts cannot acquire interaction coverage or omit render revision', () => {
  const a = artifact('view'), lease = createResourceLease({ owner: 'view', bytes: 0 }, {}, () => {});
  assert.doesNotThrow(() => assertPreparationReceipt(receipt(a, lease), a));
  assert.throws(() => assertPreparationReceipt({ ...receipt(a, lease), collisionRevision: representationKey(a) }, a), /view cannot/);
  assert.throws(() => assertPreparationReceipt({ ...receipt(a, lease), renderRevision: 'wrong' }, a), /render revision/);
});

test('preparation grants readiness only after consumer work and retains resources until retirement', async () => {
  const gate = deferred(), h = harness({ prepareGate: gate });
  await h.built.promise; assert.equal(h.ticket.snapshot().state, 'prepared'); assert.equal(h.ticket.snapshot().interactionEligible, false);
  gate.resolve(); const ready = await h.ticket.done;
  assert.equal(ready.state, 'interaction-ready'); assert.equal(ready.interactionEligible, true); assert.deepEqual(h.releases, []);
  await Promise.all([h.ticket.retire(), h.ticket.retire()]);
  assert.deepEqual(h.releases, ['resources', 'payload']); assert.equal(h.ticket.snapshot().interactionEligible, false);
  assert.equal((await h.session.shutdown()).cleanup, true);
});

test('preparation view and full-solid readiness carry no body-clearance assertion', async () => {
  for (const options of [{ intent: 'view' }, { classification: 'full-solid' }, { classification: 'empty-air' }]) {
    const h = harness(options), state = await h.ticket.done;
    assert.equal(state.interactionEligible, options.intent !== 'view');
    assert.equal(Object.hasOwn(state, 'bodyClear'), false);
    await h.session.shutdown();
  }
});

test('preparation cancellation drains a late producer without running consumer preparation', async () => {
  const gate = deferred(), h = harness({ produceGate: gate }); await h.producing.promise;
  const cancelled = h.ticket.cancel(); assert.equal(h.ticket.snapshot().state, 'cancelled'); gate.resolve(); await cancelled;
  assert.deepEqual(h.events, []); assert.deepEqual(h.releases, ['payload']); await h.session.shutdown();
});

test('preparation cancellation during consumer work waits before releasing its input', async () => {
  const gate = deferred(), h = harness({ prepareGate: gate }); await h.built.promise;
  const cancelled = h.ticket.cancel(); assert.equal(h.events[0].signal.aborted, true); assert.deepEqual(h.releases, []);
  gate.resolve(); await cancelled; assert.equal(h.ticket.snapshot().interactionEligible, false);
  assert.deepEqual(h.releases, ['resources', 'payload']); await h.session.shutdown();
});

test('preparation invalid revisions and old producers fail safely and release accepted resources', async () => {
  for (const options of [{ badReceipt: true }, { stale: true }]) {
    const h = harness(options); assert.equal((await h.ticket.done).state, 'failed');
    assert.equal(h.ticket.snapshot().interactionEligible, false);
    assert.deepEqual(h.releases, options.stale ? ['payload'] : ['resources', 'payload']); await h.session.shutdown();
  }
});

test('preparation unsupported unresolved failed and cancelled results grant no coverage', async () => {
  for (const status of ['unsupported', 'unresolved', 'failed', 'cancelled']) {
    const session = createPreparationSession({ runtimeId: 'page', producer });
    const ticket = session.start(spec(), { produce: async q => ({ result: { ...result(q), status, reason: 'explicit reason', artifact: null }, payload: null }), prepare: () => assert.fail('cannot prepare nonartifact') });
    const state = await ticket.done; assert.equal(state.state, status); assert.equal(state.interactionEligible, false); await session.shutdown();
  }
});

test('preparation cleanup errors remain observable and prevent further admission', async () => {
  const h = harness({ releaseError: true }); await h.ticket.done; await h.ticket.retire();
  assert.equal(h.ticket.snapshot().cleanupFailed, true); assert.deepEqual(h.releases, ['resources', 'payload']);
  assert.throws(() => h.session.start(spec(), {}), /cleanup failed/);
  await assert.rejects(h.session.shutdown(), /resource release failed/);
});

test('preparation recovery invalidates old work and bounded shutdown reports unfinished ownership', async () => {
  const gate = deferred(), h = harness({ produceGate: gate }); await h.producing.promise;
  await assert.rejects(h.session.recover({ timeoutMs: 1 }), /ownership unconfirmed/);
  assert.equal(h.session.diagnostics().cleanupUnconfirmed, true);
  assert.throws(() => h.session.start(spec(), {}), /unconfirmed/);
  gate.resolve(); await h.ticket.done; assert.deepEqual(h.events, []);
  assert.equal((await h.session.shutdown()).live, 0);
});

test('preparation shutdown invalidates ready leases synchronously and drains pending work', async () => {
  const gate = deferred(), h = harness({ prepareGate: gate }); await h.built.promise;
  const closing = h.session.shutdown(); assert.equal(h.ticket.snapshot().interactionEligible, false);
  gate.resolve(); const closed = await closing; assert.equal(closed.cleanup, true); assert.equal(closed.live, 0);
  assert.deepEqual(h.releases, ['resources', 'payload']); assert.throws(() => h.session.start(spec(), {}), /closed/);
});

test('preparation leases release exactly once even when retirement rejects', async () => {
  let calls = 0; const lease = createResourceLease({ owner: 'test', bytes: 0 }, {}, () => { calls++; throw new Error('release'); });
  const first = lease.release(); assert.equal(first, lease.release()); await assert.rejects(first, /release/); assert.equal(calls, 1);
});

test('preparation canonical byte identity specifies integer floats, negative zero, exponents and Unicode keys', () => {
  assert.equal(canonicalJson({ b: 64.0, a: -0 }), '{"a":0,"b":64}');
  assert.equal(canonicalJson({ tiny: 1e-7, large: 1e21 }), '{"large":1e+21,"tiny":1e-7}');
  assert.equal(canonicalJson({ '\ue000': 1, '\ud83d\ude00': 2 }), '{"😀":2,"":1}');
  assert.equal(fnv1a64(canonicalJson({ b: 64.0, a: -0 })), fnv1a64(canonicalJson({ a: 0, b: 64 })));
});
