import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  POINT_STATUS, RAY_STATUS, UNRESOLVED_REASON, STAGNATION, NORMAL_STATUS,
  LIGHTING_FAILURE_FLAGS, ESTIMATOR_CATEGORIES, STATUS_LABELS, LEGEND,
  packStatus, unpackStatus, packLightingStatus, unpackLightingStatus, wgslConstants,
} from '../../src/space/render/status.js';
import {
  PASSES, TARGET_LAYOUT, TRACKED_ALLOCATION_CAP, LIGHTING_BOUNDS_DEFAULT,
  BACKEND_METHODS, BackendError, createBatch, createAdmission, createPickRequest,
  createJobPlan, validatePipelineDescriptor, createPipelineSet, assertBackend, mix, sampleJitter,
} from '../../src/space/render/backend.js';
import * as statusModule from '../../src/space/render/status.js';
import * as backendModule from '../../src/space/render/backend.js';
import { createRenderRequest } from '../../src/shared/render-request.js';

const identity = () => ({ requestId: 'r1', jobId: 'j1', viewId: 'space', generation: {
  deviceEpoch: 1, viewRevision: 2, geometryRevision: 3, appearanceRevision: 4,
} });
const descriptor = () => ({
  pipelineId: 'trace-test', kind: 'compute', sourceIds: ['trace-test.wgsl'], entryPoint: 'trace_band',
  constants: { FIELD: 0 }, bindings: [{ slot: 'depth', type: 'storage-texture', access: 'write' }, { slot: 'params', type: 'uniform-buffer', access: 'read' }],
  uniformLayout: { byteLength: 16, fields: [{ name: 'power', type: 'u32', offset: 0 }] },
});
const batchInput = () => ({
  identity: identity(), pipelineId: 'trace-test', pass: 'trace',
  region: { x: 0, y: 0, width: 4, height: 2 }, sample: { sequence: 'atlas-aa-v1', seed: 1, index: 0 },
  bounds: { pixels: 8, raySteps: 512, iterations: 128, ...LIGHTING_BOUNDS_DEFAULT },
  inputs: {}, outputs: { depth: Object.freeze({ id: 'depth' }) }, uniforms: { power: 8 },
});
const invalid = fn => assert.throws(fn, error => error instanceof BackendError && error.code === 'invalid-descriptor');
const request = () => createRenderRequest({ ...identity(), sceneSnapshot: {}, sceneHash: 'scene',
  output: { width: 4, height: 2, purpose: 'interactive' }, quality: {},
  keys: { geometryKey: 'geometry', appearanceKey: 'appearance' },
});

test('status words pack and unpack every combination losslessly', () => {
  for (const status of Object.values(RAY_STATUS)) for (const reason of Object.values(UNRESOLVED_REASON))
    for (const subreason of Object.values(STAGNATION)) for (const steps of [0, 1, 2 ** 20 - 1]) {
      const value = { status, reason, subreason, steps };
      let packed;
      assert.doesNotThrow(() => { packed = packStatus(value); }, 'the importable implementation must pack a valid status');
      assert.equal(packed, (status + reason * 16 + subreason * 256 + steps * 4096) >>> 0);
      assert.deepEqual(unpackStatus(packed), value);
    }
});

test('a batch rejects an unknown pass, a region whose pixels disagree with its bounds, and bounds above the spec limits', () => {
  invalid(() => createBatch({ ...batchInput(), pass: 'bogus' }));
  for (const pixels of [7, 9]) invalid(() => createBatch({ ...batchInput(), bounds: { ...batchInput().bounds, pixels } }));
  for (const [name, value] of Object.entries({ raySteps: 1025, iterations: 513, normalFieldSamples: 8, shadowRays: 2, shadowSteps: 65, aoSamples: 6 })) {
    invalid(() => createBatch({ ...batchInput(), bounds: { ...batchInput().bounds, [name]: value } }));
  }
  assert.equal(createBatch(batchInput()).bounds.pixels, 8);
  // Rev 5.0 (B11b): the box and Menger one-sided normal fallback needs a seventh field sample (the centre value).
  assert.doesNotThrow(() => createBatch({ ...batchInput(), bounds: { ...batchInput().bounds, normalFieldSamples: 7 } }), 'seven normal field samples are within the bound');
});

test('an admission lease is consumed exactly once', () => {
  const admission = createAdmission({ epoch: 1, jobId: 'j1' });
  assert.equal(admission.epoch, 1); assert.equal(admission.jobId, 'j1');
  assert.equal(admission.consume(), true); assert.equal(admission.consume(), false);
  assert.ok(Object.isFrozen(admission));
});

test('assertBackend rejects an implementation missing release or onLoss', () => {
  const backend = Object.fromEntries(BACKEND_METHODS.map(name => [name, () => {}]));
  assert.equal(assertBackend(backend), backend);
  assert.ok(BACKEND_METHODS.includes('allocate'));
  for (const name of ['release', 'onLoss', 'allocate']) { const missing = { ...backend }; delete missing[name]; invalid(() => assertBackend(missing)); }
});

test('wgslConstants emits one const per enum member', () => {
  const enums = { POINT_STATUS, RAY_STATUS, UNRESOLVED_REASON, STAGNATION, NORMAL_STATUS, LIGHTING_FAILURE_FLAGS };
  const declarations = wgslConstants().trim().split('\n');
  assert.equal(declarations.length, Object.values(enums).reduce((count, value) => count + Object.keys(value).length, 0));
  for (const [group, values] of Object.entries(enums)) for (const [member, value] of Object.entries(values)) {
    const name = `${group}_${member.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}`;
    assert.equal(declarations.filter(line => line === `const ${name}: u32 = ${value}u;`).length, 1);
  }
});

test('sample jitter is deterministic, centred for sample 0, within half a pixel, and mix(42) is 4147330502', () => {
  assert.equal(mix(42), 4147330502);
  assert.deepEqual([0, 1, 0xffffffff].map(mix), [0, 824519298, 539535463]);
  const vectors = [
    [{ seed: 1, sampleIndex: 1, pixel: [0, 0] }, { dx: -0.46521759033203125, dy: 0.33879852294921875 }],
    [{ seed: 42, sampleIndex: 7, pixel: [17, 23] }, { dx: -0.04631805419921875, dy: -0.03531646728515625 }],
    [{ seed: 0xffffffff, sampleIndex: 63, pixel: [0xffffffff, 0xffffffff] }, { dx: 0.07982635498046875, dy: -0.09210968017578125 }],
  ];
  for (const [input, expected] of vectors) assert.deepEqual(sampleJitter(input), expected);
  for (const seed of [0, 1, 42, 0xffffffff]) for (let index = 0; index < 64; index++) {
    const input = { seed, sampleIndex: index, pixel: [91, 337] }, value = sampleJitter(input);
    assert.deepEqual(value, sampleJitter(input));
    if (index === 0) assert.deepEqual(value, { dx: 0, dy: 0 });
    assert.ok(value.dx > -0.5 && value.dx < 0.5 && value.dy > -0.5 && value.dy < 0.5);
  }
});

test('a pipeline set validates its descriptors and rejects an unknown binding type', () => {
  const input = descriptor(), set = createPipelineSet({ id: 'test', descriptors: [input] });
  assert.equal(validatePipelineDescriptor(input).pipelineId, 'trace-test');
  assert.ok(Object.isFrozen(set.descriptors[0].uniformLayout.fields[0]));
  input.constants.FIELD = 2; assert.equal(set.descriptors[0].constants.FIELD, 0);
  invalid(() => validatePipelineDescriptor({ ...descriptor(), bindings: [{ slot: 'depth', type: 'mystery', access: 'write' }] }));
  invalid(() => createPipelineSet({ id: 'test', descriptors: [descriptor(), descriptor()] }));
});

test('a job plan reserves ready operations once and remains unexhausted while dependencies are outstanding', () => {
  const batch = createBatch(batchInput()), operations = [
    { id: 'a', dependsOn: [], kind: 'batch', batch },
    { id: 'b', dependsOn: [], kind: 'batch', batch },
    { id: 'c', dependsOn: ['a', 'b'], kind: 'presentation', descriptor: { identity: identity(), display: batch.outputs.depth } },
  ];
  const plan = createJobPlan({ request: request(), operations });
  const a = plan.next(), b = plan.next();
  assert.equal(a.id, 'a'); assert.equal(b.id, 'b'); assert.equal(plan.next(), null); assert.equal(plan.exhausted(), false);
  plan.advance(b, { epoch: 1, elapsedMs: 8 }); assert.equal(plan.next(), null);
  plan.advance(a, { epoch: 1, elapsedMs: 8 }); const c = plan.next(); assert.equal(c.id, 'c');
  assert.equal(plan.next(), null); assert.equal(plan.exhausted(), false);
  plan.advance(c, { epoch: 1, elapsedMs: 8 }); assert.equal(plan.exhausted(), true);
  invalid(() => plan.advance(c, { epoch: 1, elapsedMs: 8 }));
});

test('lighting status round-trips simultaneous unresolved and numerical failures without conflating them', () => {
  const failures = [null];
  for (const status of [RAY_STATUS.unresolved, RAY_STATUS.numericalFailure])
    for (const reason of Object.values(UNRESOLVED_REASON)) for (const subreason of Object.values(STAGNATION))
      failures.push({ status, reason, subreason });
  for (const shadow of failures) for (const ao of failures) {
    const word = packLightingStatus({ shadow, ao });
    const expected = (shadow ? 1 | shadow.status << 2 | shadow.reason << 4 | shadow.subreason << 8 : 0)
      | (ao ? 2 | ao.status << 12 | ao.reason << 14 | ao.subreason << 18 : 0);
    assert.equal(word, expected >>> 0); assert.equal(word >>> 22, 0);
    assert.deepEqual(unpackLightingStatus(word), { shadow, ao });
  }
});

test('the status vocabulary and legend preserve the spec labels verbatim', () => {
  assert.deepEqual(POINT_STATUS, { escaped: 0, notEscaped: 1, numericalFailure: 2 });
  assert.deepEqual(STATUS_LABELS.point, ['escaped', 'not escaped within iteration budget', 'numerical failure']);
  assert.deepEqual(STATUS_LABELS.ray, ['approximate hit', 'miss', 'unresolved', 'numerical failure']);
  assert.deepEqual(STATUS_LABELS.reason, ['none', 'point-budget', 'estimate-unavailable', 'ray-step-budget', 'stagnation']);
  assert.deepEqual(STATUS_LABELS.subreason, ['none', 'ray-parameter', 'field-coordinate']);
  assert.deepEqual(LEGEND, { unresolved: [1, 0, 1], numericalFailure: [1, 0, 0], unavailableNormal: [0.5, 0.5, 0.5] });
  assert.deepEqual(ESTIMATOR_CATEGORIES, ['exact-distance', 'heuristic']);
  assert.ok(Object.isFrozen(LEGEND.unresolved));
  assert.throws(() => packStatus({ status: 0, reason: 0, subreason: 0, steps: 2 ** 20 }), RangeError);
  assert.throws(() => packLightingStatus({ shadow: { status: RAY_STATUS.hit, reason: 0, subreason: 0 }, ao: null }), RangeError);
});

test('the target layout counts both accumulation images and the recovery word and totals 76 bytes per pixel', () => {
  // B11c (rev 5.1): space-targets-v2 adds the per-pixel quaternion-primary recovery word (r32uint), a geometry target.
  assert.equal(backendModule.TARGET_LAYOUT_ID, 'space-targets-v2');
  assert.deepEqual(TARGET_LAYOUT, {
    depth: { format: 'r32float', bytesPerTexel: 4, count: 1 }, status: { format: 'r32uint', bytesPerTexel: 4, count: 1 },
    recovery: { format: 'r32uint', bytesPerTexel: 4, count: 1 },
    normal: { format: 'rgba16float', bytesPerTexel: 8, count: 1 }, sampleColor: { format: 'rgba16float', bytesPerTexel: 8, count: 1 },
    lightingStatus: { format: 'r32uint', bytesPerTexel: 4, count: 1 }, accumulationFlags: { format: 'r32uint', bytesPerTexel: 4, count: 1 },
    accumulation: { format: 'rgba32float', bytesPerTexel: 16, count: 2 }, display: { format: 'rgba8unorm', bytesPerTexel: 4, count: 1 },
    retained: { format: 'rgba8unorm', bytesPerTexel: 4, count: 1 },
  });
  const bytes = Object.values(TARGET_LAYOUT).reduce((sum, item) => sum + item.bytesPerTexel * item.count, 0);
  assert.equal(bytes, 76); assert.equal(bytes * 3840 * 2160, 630374400); assert.equal(TRACKED_ALLOCATION_CAP, 2 ** 30);
  assert.deepEqual(PASSES, ['probe', 'trace', 'normals', 'shade', 'accumulate', 'display']);
});

test('batch snapshots preserve opaque handles and reject malformed identities, slots, samples and uniforms', () => {
  const input = batchInput(), batch = createBatch(input);
  input.identity.generation.viewRevision++; input.uniforms.power = 2;
  assert.equal(batch.identity.generation.viewRevision, 2); assert.equal(batch.uniforms.power, 8);
  assert.equal(batch.outputs.depth, input.outputs.depth); assert.ok(Object.isFrozen(batch.bounds));
  for (const patch of [
    { identity: { ...identity(), epoch: 1 } }, { identity: { ...identity(), jobId: '' } },
    { identity: { ...identity(), generation: { ...identity().generation, deviceEpoch: -1 } } },
    { sample: { sequence: 'unknown', seed: 1, index: 0 } }, { sample: { sequence: 'atlas-aa-v1', seed: 1, index: 64 } },
    { inputs: { depth: null } }, { uniforms: { power: NaN } }, { region: { x: -1, y: 0, width: 4, height: 2 } },
  ]) invalid(() => createBatch({ ...batchInput(), ...patch }));
});

test('pick requests freeze the full identity and reject out-of-image pixels and mismatched revisions', () => {
  const input = { identity: identity(), pixel: [3, 1], dimensions: { width: 4, height: 2 }, geometryRevision: 3, sampleIndex: 0 };
  const pick = createPickRequest(input); assert.ok(Object.isFrozen(pick.pixel)); assert.deepEqual(pick.identity, identity());
  for (const patch of [{ pixel: [4, 1] }, { pixel: [0.5, 1] }, { geometryRevision: 2 }, { sampleIndex: 64 }])
    invalid(() => createPickRequest({ ...input, ...patch }));
});

test('pipeline validation rejects duplicate slots, overlapping uniform fields and invalid access', () => {
  const desc = descriptor();
  for (const patch of [
    { bindings: [desc.bindings[0], desc.bindings[0]] },
    { bindings: [{ slot: 'depth', type: 'texture', access: 'write' }] },
    { uniformLayout: { byteLength: 16, fields: [{ name: 'x', type: 'vec4<f32>', offset: 0 }, { name: 'y', type: 'u32', offset: 4 }] } },
    { uniformLayout: { byteLength: 16, fields: [{ name: 'x', type: 'u32', offset: 16 }] } },
  ]) invalid(() => validatePipelineDescriptor({ ...desc, ...patch }));
});

test('job plans reject cycles, foreign identities and unreserved or unsuccessful advancement', () => {
  const batch = createBatch(batchInput()), a = { id: 'a', dependsOn: [], kind: 'batch', batch };
  invalid(() => createJobPlan({ request: request(), operations: [{ ...a, dependsOn: ['missing'] }] }));
  invalid(() => createJobPlan({ request: request(), operations: [{ ...a, dependsOn: ['b'] }, { ...a, id: 'b', dependsOn: ['a'] }] }));
  invalid(() => createJobPlan({ request: request(), operations: [{ ...a, batch: createBatch({ ...batchInput(), identity: { ...identity(), requestId: 'other' } }) }] }));
  const plan = createJobPlan({ request: request(), operations: [a] });
  invalid(() => plan.advance(a, { epoch: 1, elapsedMs: 8 }));
  const reserved = plan.next();
  for (const completion of [{ outcome: 'failed' }, { outcome: 'completed' }, { epoch: 2, elapsedMs: 1 }, { epoch: 1 }, { elapsedMs: 1 }, { epoch: 1, elapsedMs: -1 }, { epoch: 1, elapsedMs: 1, timestampMs: NaN }, { epoch: 1, elapsedMs: 1, targetMs: 0 }]) invalid(() => plan.advance(reserved, completion));
  assert.equal(plan.exhausted(), false);
});

test('adaptive replacement of pending operations preserves reserved work and dependencies', () => {
  const a = { id: 'a', dependsOn: [], kind: 'batch', batch: createBatch(batchInput()) };
  let adapted = false;
  const plan = createJobPlan({ request: request(), operations: [a, { ...a, id: 'b', dependsOn: ['a'] }, { ...a, id: 'c', dependsOn: ['b'] }],
    onAdvance(operation, completion, pending) {
      if (operation.id !== 'a') return;
      assert.deepEqual(completion, { epoch: 1, elapsedMs: 16, timestampMs: 3, targetMs: 8 }); adapted = true;
      return [{ ...a, id: 'b-first', dependsOn: ['a'] }, { ...pending[0], dependsOn: ['b-first'] }, pending[1]];
    },
  });
  const first = plan.next(); plan.advance(first, { epoch: 1, elapsedMs: 16, timestampMs: 3, targetMs: 8 }); assert.equal(adapted, true);
  for (const id of ['b-first', 'b', 'c']) { const op = plan.next(); assert.equal(op.id, id); assert.equal(plan.next(), null); plan.advance(op, { epoch: 1, elapsedMs: 8 }); }
  assert.equal(plan.exhausted(), true);
});

test('the P3 manifest freezes rules and permits owner-tracked materialization', () => {
  const manifest = JSON.parse(readFileSync(new URL('../reference/performance-workload.json', import.meta.url), 'utf8'));
  assert.equal(manifest.protocol, 'P3');
  assert.equal(manifest.readyForAcceptance, manifest.unresolved.length === 0);
  for (const entry of manifest.unresolved) {
    assert.ok(typeof entry.field === 'string' && entry.field.length);
    assert.ok(typeof entry.reason === 'string' && entry.reason.length);
    assert.match(entry.owner, /^B\d\d$/);
  }
  assert.deepEqual(manifest.output, { width: 1280, height: 720 });
  assert.deepEqual(manifest.scenes.map(scene => scene.id), ['bulb', 'quaternion', 'menger']);
  assert.deepEqual(manifest.scenes.map(scene => scene.parameters), [{ power: '8' }, { C: ['-0.2', '0.8', '0', '0'], kappa: '0' }, { depth: 2 }]);
  for (const scene of manifest.scenes) {
    assert.equal(scene.lightingQuality, 'full'); assert.equal(scene.targetSamples, 8);
    assert.equal(scene.maxIterations, 128); assert.equal(scene.maxSteps, 512); assert.equal(scene.sampling.seed, 1);
    assert.ok(scene.scene !== null || manifest.unresolved.some(entry => entry.field === `scenes.${scene.id}.scene`));
  }
  assert.equal(manifest.trials.requiredPassing, 3); assert.equal(manifest.trials.maxAttempts, 5);
  assert.equal(manifest.trials.suiteTimeoutMs, 600000);
  assert.deepEqual(manifest.targets, { completedDraftsPerSecondMin: 30, consecutiveDraftIntervalP95Ms: 50, interactionP95Ms: 100, stressReplacementMs: 250, applicationMainThreadTaskMaxMs: 50, firstSettledImageMs: 2000 });
  assert.equal(manifest.timing.lateIssuanceThresholdMs, 4);
  assert.deepEqual(manifest.inspection.commands, ['atlas.space.requestCamera(pose)', 'atlas.space.editParameter(path, value)']);
  assert.deepEqual(manifest.workloads.orbit.requestRule, { firstIndex: 0, lastIndex: 1874, spacingMs: 16 });
  assert.equal(manifest.workloads.orbit.durationMs, 30000); assert.equal(manifest.workloads.orbit.radiansPerSecond, 0.5);
  assert.deepEqual(manifest.workloads.interaction.requestRule, { firstIndex: 1, lastIndex: 400, spacingMs: 60 });
  assert.equal(manifest.workloads.interaction.startYawRadians, 14.992);
  assert.deepEqual(manifest.workloads.stress.editRule, { count: 40, firstTimeMs: 0, spacingMs: 250, firstValue: 'alternate' });
  assert.deepEqual(manifest.workloads.stress.alternations, {
    bulb: { path: 'parameters.power', base: '8', alternate: '7' },
    quaternion: { path: 'parameters.kappa', base: '0', alternate: '0.5' },
    menger: { path: 'parameters.depth', base: 2, alternate: 1 },
  });
  assert.deepEqual(manifest.coverageCheckpoints.orbitIndices, [0, 625, 1250, 1874]);
  assert.equal(manifest.coverageCheckpoints.execution, 'replay-outside-timed-workload');
  assert.deepEqual(manifest.screenshotCheckpoints, ['settled-image-per-scene']);
  assert.equal(manifest.warmup.firstTrial, 'cold-after-fresh-page-load');
  assert.equal(manifest.warmup.subsequentTrials, 'same-page-without-reload');
  assert.equal(manifest.materialization.owner, 'B04'); assert.equal(manifest.materialization.codecValidationOwner, 'B09');
});

test('adaptive subdivision cannot bypass existing dependency barriers', () => {
  const batch = createBatch(batchInput());
  const plan = createJobPlan({ request: request(), operations: [
    { id: 'a', dependsOn: [], kind: 'batch', batch }, { id: 'b', dependsOn: ['a'], kind: 'batch', batch },
  ], onAdvance(_operation, _completion, pending) { return pending.map(op => ({ ...op, dependsOn: [] })); } });
  const operation = plan.next(); invalid(() => plan.advance(operation, { epoch: 1, elapsedMs: 8 }));
  assert.equal(plan.next(), null); assert.equal(plan.exhausted(), false);
});

test('AO failure reduction is canonical and independent of sample order', () => {
  assert.equal(typeof statusModule.reduceLightingFailures, 'function');
  const reduce = statusModule.reduceLightingFailures;
  const failures = [null, { status: 2, reason: 4, subreason: 2 }, { status: 2, reason: 1, subreason: 2 }, { status: 2, reason: 1, subreason: 1 }];
  assert.equal(reduce([]), null); assert.equal(reduce([null, null]), null);
  for (const samples of [failures, [...failures].reverse(), [...failures.slice(2), ...failures.slice(0, 2)]]) {
    assert.deepEqual(reduce(samples), { status: 2, reason: 1, subreason: 1 });
    assert.deepEqual(reduce([...samples, { status: 3, reason: 4, subreason: 2 }]), { status: 3, reason: 0, subreason: 0 });
  }
  assert.throws(() => reduce([{ status: RAY_STATUS.hit, reason: 0, subreason: 0 }]), RangeError);
});

test('pipeline entry points and storage access are validated by pipeline kind', () => {
  const { entryPoint, ...base } = descriptor();
  const render = { ...base, kind: 'render', vertexEntryPoint: 'vertex_main', fragmentEntryPoint: 'fragment_main' };
  assert.doesNotThrow(() => validatePipelineDescriptor(render));
  invalid(() => validatePipelineDescriptor({ ...render, entryPoint }));
  invalid(() => validatePipelineDescriptor({ ...descriptor(), vertexEntryPoint: 'vertex_main' }));
  invalid(() => validatePipelineDescriptor({ ...base, kind: 'render', vertexEntryPoint: 'vertex_main' }));
  const noUniform = { ...descriptor(), uniformLayout: { byteLength: 0, fields: [] } };
  invalid(() => validatePipelineDescriptor({ ...noUniform, bindings: [{ slot: 'buffer', type: 'storage-buffer', access: 'write' }] }));
  assert.doesNotThrow(() => validatePipelineDescriptor({ ...noUniform, bindings: [{ slot: 'buffer', type: 'storage-buffer', access: 'read-write' }] }));
});

test('a uniform layout identifies one generated binding and preserves vec3 size and alignment', () => {
  const base = descriptor();
  invalid(() => validatePipelineDescriptor({ ...base, bindings: [base.bindings[0]] }));
  invalid(() => validatePipelineDescriptor({ ...base, bindings: [...base.bindings, { slot: 'second', type: 'uniform-buffer', access: 'read' }] }));
  const fields = [{ name: 'basis', type: 'vec3<f32>', offset: 0 }, { name: 'cap', type: 'u32', offset: 12 }];
  assert.doesNotThrow(() => validatePipelineDescriptor({ ...base, uniformLayout: { byteLength: 16, fields } }));
  invalid(() => validatePipelineDescriptor({ ...base, uniformLayout: { byteLength: 32, fields: [{ ...fields[0], offset: 4 }] } }));
});

test('adaptive replacement must retain every original pending operation id', () => {
  const batch = createBatch(batchInput());
  const plan = createJobPlan({ request: request(), operations: [
    { id: 'a', dependsOn: [], kind: 'batch', batch }, { id: 'b', dependsOn: ['a'], kind: 'batch', batch },
  ], onAdvance() { return []; } });
  const reserved = plan.next(); invalid(() => plan.advance(reserved, { epoch: 1, elapsedMs: 1 }));
  assert.equal(plan.exhausted(), false); assert.equal(plan.next(), null);
});

test('B15-R10-F2 BatchGroup snapshots members and rejects mismatched identities regions samples and pass order', () => {
  assert.equal(typeof backendModule.createBatchGroup, 'function');
  const base = batchInput();
  const member = pass => ({ ...base, pass, bounds: { ...base.bounds, shadowRays: 0, shadowSteps: 0, aoSamples: 0 } });
  const input = { identity: base.identity, region: base.region, sample: { ...base.sample, index: 0 },
    passes: ['trace', 'normals', 'shade', 'accumulate', 'display'].map(pass => ({ ...member(pass), sample: { ...base.sample, index: 0 } })) };
  const group = backendModule.createBatchGroup(input);
  assert.ok(Object.isFrozen(group.passes)); assert.ok(Object.isFrozen(group.passes[0].uniforms));
  input.passes[0].uniforms = { changed: true }; assert.notDeepEqual(group.passes[0].uniforms, input.passes[0].uniforms);
  for (const patch of [{ identity: { ...base.identity, jobId: 'foreign' } }, { region: { ...base.region, x: 1 } }, { sample: { ...base.sample, index: 1 } }]) {
    invalid(() => backendModule.createBatchGroup({ ...group, passes: group.passes.map((p, i) => i === 1 ? { ...p, ...patch } : p) }));
  }
  invalid(() => backendModule.createBatchGroup({ ...group, passes: [...group.passes].reverse() }));
  invalid(() => backendModule.createBatchGroup({ ...group, passes: group.passes.slice(1) }));
  assert.equal(backendModule.createBatchGroup({ ...group, passes: group.passes.slice(2) }).passes.length, 3);
  const op = { id: 'group', dependsOn: [], kind: 'batch', batch: group };
  invalid(() => createJobPlan({ request: request(), operations: [op] }));
  const plan = createJobPlan({ request: { ...request(), quality: { preview: true } }, operations: [op] });
  const reserved = plan.next(); assert.equal(reserved.batch.passes.length, 5); assert.equal(plan.next(), null);
  plan.advance(reserved, { epoch: 1, elapsedMs: 8, targetMs: 8 }); assert.equal(plan.exhausted(), true);
});

test('B15-R10-F3 BackendError preserves the acquisition cause without changing its boundary code', () => {
  const cause = Object.assign(new Error('adapter unavailable'), { code: 'no-adapter' });
  const error = new BackendError('unavailable', 'acquisition failed', { cause });
  assert.equal(error.cause, cause); assert.equal(error.code, 'unavailable');
});

const draftGroupInput = () => {
  const base = batchInput();
  base.bounds = { ...base.bounds, shadowRays: 0, shadowSteps: 0, aoSamples: 0 };
  return { identity: base.identity, region: base.region, sample: base.sample,
    passes: ['trace', 'normals', 'shade', 'accumulate', 'display'].map(pass => ({ ...base, pass })) };
};
test('B15-R11-F1 draft groups reject a matching nonzero sample in every member', () => {
  const input = draftGroupInput();
  input.sample = { ...input.sample, index: 1 };
  input.passes = input.passes.map(pass => ({ ...pass, sample: input.sample }));
  invalid(() => backendModule.createBatchGroup(input));
});

test('B15-R11-F1 draft groups reject each kind of secondary-ray work', () => {
  for (const field of ['shadowRays', 'shadowSteps', 'aoSamples']) {
    const input = draftGroupInput();
    input.passes[2] = { ...input.passes[2], bounds: { ...input.passes[2].bounds, [field]: 1 } };
    invalid(() => backendModule.createBatchGroup(input));
  }
});
