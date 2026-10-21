import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaneRenderAdapter, createPlaneRequest, appearanceKeyOf, LeaseError } from '../../src/plane/render-adapter.js';
import { createRenderRequest, isPublishable, RUNTIME_ID } from '../../src/shared/render-request.js';
import { createPlaneScene, sceneCodec, toPlaneState } from '../../src/plane/scene-adapter.js';
import { createFakeRenderer, flush } from '../support/fake-renderer.mjs';

const A = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 } });
const B = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 1 } });
const deepA = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 30 } });
const auroraA = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 }, settings: { palette: 'aurora' } });
const auroraB = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 1 }, settings: { palette: 'aurora' } });
let clockValue = 0;
const clock = () => (clockValue += 5);
const generation = (geometryRevision, { deviceEpoch = 0, viewRevision = geometryRevision, appearanceRevision = 0 } = {}) => ({ deviceEpoch, viewRevision, geometryRevision, appearanceRevision });
const request = (scene, revision, purpose = 'interactive') => createPlaneRequest({ scene, purpose, width: 320, height: 180, generation: generation(revision) });
const hashOf = scene => sceneCodec.fingerprint(scene).sceneHash;

test('render requests are frozen, validated and publishable only while every revision matches', () => {
  const r = request(A, 1);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.output) && Object.isFrozen(r.generation));
  assert.match(r.sceneHash, /^fnv1a64:/);
  assert.ok(isPublishable(r, generation(1)));
  assert.ok(!isPublishable(r, generation(2)));
  assert.ok(!isPublishable(r, generation(1, { deviceEpoch: 1 })), 'a new device epoch rejects the request');
  assert.throws(() => createRenderRequest({ ...r, output: { width: 0, height: 1, purpose: 'interactive' } }), /positive/);
  assert.throws(() => createRenderRequest({ ...r, output: { width: 1, height: 1, purpose: 'poster' } }), /purpose/);
  assert.notEqual(request(A, 1).keys.geometryKey, createPlaneRequest({ scene: A, purpose: 'interactive', width: 640, height: 360, generation: generation(1) }).keys.geometryKey, 'resolution is part of the geometry key');
  assert.equal(appearanceKeyOf(toPlaneState(A).settings), r.keys.appearanceKey);
});

test('a-b-a late completion rejected', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let revision = 1, scene = A;
  const options = () => ({ currentGeneration: () => generation(revision), liveScene: () => scene });
  const first = adapter.render(request(A, 1), options());
  revision = 2; scene = B;
  const second = adapter.render(request(B, 2), options());
  revision = 3; scene = A;
  const third = adapter.render(request(A, 3), options());
  renderer.finishNext(); renderer.finishNext(); renderer.finishNext();
  const reports = await Promise.all([first, second, third]);
  assert.deepEqual(reports.map(report => report.outcome), ['superseded', 'superseded', 'completed']);
  assert.equal(reports[0].keys.geometryKey, reports[2].keys.geometryKey, 'the late A shares the key of the current A');
  assert.equal(reports[2].generation.geometryRevision, 3);
});

test('a renderer that ignores cancellation is never adopted', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let revision = 1;
  const pending = adapter.render(request(A, 1), { currentGeneration: () => generation(revision), liveScene: () => A });
  revision = 2;
  const colorsBefore = renderer.colors().length;
  renderer.finishNext({ ignoreCurrent: true });
  const report = await pending;
  assert.equal(report.outcome, 'superseded');
  assert.equal(renderer.colors().length, colorsBefore + 1, 'only the fake renderer\'s own drawing; the adapter adopted nothing (pixel safety is the renderers\' own pre-write check)');
  assert.equal(adapter.published, null);
});

test('appearance rebind reports current request', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let scene = A;
  const original = request(A, 1);
  const pending = adapter.render(original, { currentGeneration: () => generation(1, { viewRevision: scene === A ? 1 : 2, appearanceRevision: scene === A ? 0 : 1 }), liveScene: () => scene });
  scene = auroraA;
  renderer.finishNext();
  const report = await pending;
  assert.equal(report.outcome, 'completed');
  assert.equal(renderer.colors().at(-1).palette, 'aurora', 'the published image uses the live appearance');
  assert.equal(report.sceneHash, hashOf(auroraA), 'the report describes the published scene');
  assert.notEqual(report.requestId, original.requestId, 'a new publication request, not the original');
  assert.equal(report.geometryRequestId, original.requestId, 'the geometry\'s request is recorded as provenance');
  assert.equal(report.keys.appearanceKey, appearanceKeyOf(toPlaneState(auroraA).settings));
  assert.deepEqual(report.generation, generation(1, { viewRevision: 2, appearanceRevision: 1 }));
  assert.equal(report.appearanceRebound, true);
});

test('an immediate recolor produces a current publication report', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  assert.deepEqual(adapter.recolor(auroraA, generation(0)), { status: 'applied', report: null }, 'nothing published yet');
  const original = request(A, 1);
  const pending = adapter.render(original, { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.finishNext();
  assert.equal((await pending).requestId, original.requestId);
  const { status, report } = adapter.recolor(auroraA, generation(1, { viewRevision: 2, appearanceRevision: 1 }));
  assert.equal(status, 'applied');
  assert.equal(report.sceneHash, hashOf(auroraA));
  assert.equal(report.geometryRequestId, original.requestId);
  assert.equal(report.outcome, 'completed');
  assert.equal(adapter.published.sceneHash, hashOf(auroraA));
  // T08 fix round 1: a recolor while a different geometry is live never claims that geometry; it
  // republishes the retained geometry (A) with the live appearance, which is what the canvas shows.
  const retained = adapter.recolor(B, generation(2)).report;
  assert.equal(retained.geometryRequestId, original.requestId, 'a different geometry is never claimed by a recolor');
  assert.equal(retained.sceneHash, hashOf({ ...A, appearance: B.appearance }));
  assert.equal(adapter.published.sceneHash, retained.sceneHash);
});

test('successive recolors keep the geometry origin', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const original = request(A, 1);
  const pending = adapter.render(original, { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.finishNext(); await pending;
  const roseA = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 }, settings: { palette: 'rose' } });
  const first = adapter.recolor(auroraA, generation(1, { viewRevision: 2, appearanceRevision: 1 })).report;
  const second = adapter.recolor(roseA, generation(1, { viewRevision: 3, appearanceRevision: 2 })).report;
  assert.equal(first.geometryRequestId, original.requestId);
  assert.equal(second.geometryRequestId, original.requestId, 'not the previous recolor\'s request');
  assert.equal(second.sceneHash, hashOf(roseA));
});

test('identities from two runtimes sharing one store never collide', () => {
  const one = createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation: generation(1), runtimeId: 'runtime-one' });
  const two = createPlaneRequest({ scene: B, purpose: 'interactive', width: 10, height: 10, generation: generation(1), runtimeId: 'runtime-two' });
  assert.notEqual(one.requestId, two.requestId);
  assert.notEqual(one.jobId, two.jobId);
  assert.match(request(A, 1).requestId, new RegExp(RUNTIME_ID), 'the default namespace is this runtime\'s');
});

test('reports mark unavailable and inapplicable facts instead of inventing them', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const pending = adapter.render(request(A, 1), { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.diagnostics.device = '';
  renderer.finishNext();
  const report = await pending;
  assert.equal(report.environment.device, 'unavailable', 'an empty device string is unavailable, never invented');
  assert.deepEqual(report.environment.backend, { value: 'FAKE · DIRECT', source: 'renderer.mode' });
  assert.equal(report.rayTermination, 'inapplicable');
  assert.equal(report.estimator, 'inapplicable');
  assert.equal(report.timings.gpu, 'unavailable');
  assert.ok(report.timings.completed >= report.timings.admitted);
  assert.deepEqual(report.completed, { width: 320, height: 180 });
  assert.equal(report.iterations, 1024);
  assert.equal(report.appearanceRebound, false);
});

test('a failed render is reported as failed and a replaced renderer interrupts its old job', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const options = { currentGeneration: () => generation(1, { deviceEpoch: adapter.epoch }), liveScene: () => A };
  const failing = adapter.render(request(A, 1), options);
  renderer.failNext('Cannot allocate rendering surface.');
  assert.deepEqual([(await failing).outcome, (await failing).reason], ['failed', 'Cannot allocate rendering surface.']);
  const old = adapter.render(request(deepA, 1), options);
  adapter.replaceRenderer(createFakeRenderer({ gl: false }));
  renderer.finishNext({ ignoreCurrent: true });
  const report = await old;
  assert.equal(report.outcome, 'interrupted', 'a job on a replaced renderer is interrupted, never adopted');
  assert.equal(report.environment.backend.value, renderer.mode, 'observe the original renderer, not its replacement');
  assert.equal(report.environment.device.value, renderer.diagnostics.device);
  assert.equal(report.implementation, 'plane-webgl2-v1');
  assert.equal(adapter.epoch, 1);
});

test('whenIdle is bounded', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  assert.equal(await adapter.whenIdle({ timeoutMs: 10 }), true);
  adapter.render(request(A, 1), { currentGeneration: () => generation(1), liveScene: () => A });
  assert.equal(await adapter.whenIdle({ timeoutMs: 10 }), false);
  renderer.finishNext(); await flush();
  assert.equal(await adapter.whenIdle({ timeoutMs: 10 }), true);
  assert.throws(() => { adapter.reserveExclusive(request(A, 2, 'export')); adapter.reserveExclusive(request(A, 2, 'export')); }, LeaseError);
});

test('a lost renderer admits nothing until it is replaced', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const generationNow = () => generation(1, { deviceEpoch: adapter.epoch });
  adapter.invalidate();
  assert.equal(adapter.unavailable, true);
  assert.throws(() => adapter.render(request(A, 1), { currentGeneration: generationNow, liveScene: () => A }), LeaseError);
  assert.deepEqual(adapter.recolor(auroraA, generationNow()), { status: 'unavailable', report: null });
  assert.throws(() => adapter.reserveExclusive(request(A, 1, 'export')), LeaseError);
  assert.equal(renderer.renders().length + renderer.colors().length, 0, 'the lost renderer was never used');
  const replacement = createFakeRenderer();
  adapter.replaceRenderer(replacement);
  assert.equal(adapter.unavailable, false);
  const live = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 32, height: 16, generation: generationNow() }), { currentGeneration: generationNow, liveScene: () => A });
  replacement.finishNext();
  assert.equal((await live).outcome, 'completed');
});

test('a context loss during an interactive render interrupts it', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const original = request(A, 1);
  const first = adapter.render(original, { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.finishNext(); await first;
  assert.equal(adapter.published, original, 'a completed frame exists before the loss');
  const pending = adapter.render(request(B, 2), { currentGeneration: () => generation(2, { deviceEpoch: adapter.epoch }), liveScene: () => B });
  adapter.invalidate();
  assert.equal(adapter.published, null, 'the loss immediately forgets the previous publication');
  renderer.finishNext();
  const report = await pending;
  assert.equal(report.outcome, 'interrupted');
  assert.equal(adapter.published, null);
});

test('interactive reports observe the backend and device of each completed render', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const first = adapter.render(request(A, 1), { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.finishNext();
  const firstReport = await first;
  const firstMode = renderer.mode, firstDevice = renderer.diagnostics.device;
  const next = createPlaneRequest({ scene: deepA, purpose: 'interactive', width: 640, height: 360, generation: generation(2) });
  const second = adapter.render(next, { currentGeneration: () => generation(2), liveScene: () => deepA });
  renderer.finishNext();
  const secondReport = await second;
  assert.equal(firstReport.outcome, 'completed');
  assert.equal(secondReport.outcome, 'completed');
  assert.notEqual(renderer.mode, firstMode, 'the shader path changed');
  assert.notEqual(renderer.diagnostics.device, firstDevice, 'the worker count changed with the size');
  assert.deepEqual(
    [secondReport.environment.backend.value, secondReport.environment.device.value],
    [renderer.mode, renderer.diagnostics.device],
  );
  assert.deepEqual([firstReport.environment.backend.value, firstReport.environment.device.value], [firstMode, firstDevice]);
});

test('lease reports observe the backend and device of each completed render', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const first = adapter.render(request(A, 1), { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.finishNext(); await first;
  const firstMode = renderer.mode, firstDevice = renderer.diagnostics.device;
  const next = createPlaneRequest({ scene: deepA, purpose: 'export', width: 640, height: 360, generation: generation(2) });
  const lease = adapter.reserveExclusive(next);
  try {
    assert.deepEqual(await lease.admit({ timeoutMs: 1000 }), { ok: true });
    const pending = lease.render({ timeoutMs: 1000 });
    renderer.finishNext();
    const report = await pending;
    assert.equal(report.outcome, 'completed');
    assert.notEqual(renderer.mode, firstMode, 'the shader path changed');
    assert.notEqual(renderer.diagnostics.device, firstDevice, 'the worker count changed with the size');
    const expected = [renderer.mode, renderer.diagnostics.device];
    assert.deepEqual([report.environment.backend.value, report.environment.device.value], expected);
    const jobReport = lease.jobReport.finish('completed');
    assert.deepEqual([jobReport.environment.backend.value, jobReport.environment.device.value], expected);
  } finally { lease.release(); }
});

test('a non-cooperative interactive completion after a loss is interrupted and never adopted', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const pending = adapter.render(request(A, 1), { currentGeneration: () => generation(1, { deviceEpoch: 0 }), liveScene: () => A });
  const before = renderer.colors().length;
  adapter.invalidate();
  renderer.finishNext({ ignoreCurrent: true });
  assert.equal((await pending).outcome, 'interrupted');
  assert.equal(renderer.colors().length, before + 1, 'only the fake renderer draws; the adapter never recolors');
  assert.equal(adapter.published, null);
});

test('cancelInteractive supersedes pending work and leaves an export lease alone', async () => {
  const renderer = createFakeRenderer({ gl: false });
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const pending = adapter.render(request(A, 1), { currentGeneration: () => generation(1), liveScene: () => A });
  adapter.cancelInteractive();
  assert.equal(renderer.pending.length, 0, 'cancellation rejects and removes pending work');
  assert.equal((await pending).outcome, 'superseded');
  assert.equal(renderer.colors().length, 0);
  assert.equal(adapter.published, null);
  const lease = adapter.reserveExclusive(request(A, 2, 'export'));
  try {
    const exporting = lease.render({ timeoutMs: 1000 });
    const cancels = renderer.calls.filter(call => call.op === 'cancel').length;
    adapter.cancelInteractive();
    assert.equal(renderer.calls.filter(call => call.op === 'cancel').length, cancels, 'the export is not cancelled');
    assert.equal(renderer.pending.length, 1);
    renderer.finishNext();
    assert.equal((await exporting).outcome, 'completed');
  } finally { lease.release(); }
});

test('throwing freshness callbacks cannot escape renderer completion', async () => {
  for (const callback of ['currentGeneration', 'isCurrent']) {
    const renderer = createFakeRenderer();
    const adapter = createPlaneRenderAdapter({ renderer, clock });
    const options = { currentGeneration: () => generation(1), liveScene: () => A };
    options[callback] = () => { throw new Error(`${callback} unavailable`); };
    const pending = adapter.render(request(A, 1), options);
    assert.doesNotThrow(() => renderer.finishNext(), `${callback} must not escape into a worker callback`);
    assert.equal((await pending).outcome, 'superseded');
    assert.equal(renderer.colors().length, 0);
    assert.equal(adapter.published, null);
  }
});

// T08 fix round 1 (Codex finding 2): the adapter's publication is the authoritative provenance of
// the image on the canvas, and every non-null report describes that image.
test('a recolor during pending navigation publishes the retained geometry with the live appearance', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let revision = 1, scene = A, appearanceRevision = 0;
  const options = () => ({ currentGeneration: () => generation(revision, { appearanceRevision }), liveScene: () => scene });
  const first = adapter.render(request(A, 1), options());
  renderer.finishNext();
  const reportA = await first;
  revision = 2; scene = B;
  const second = adapter.render(request(B, 2), options());
  // The palette is edited while B is still rendering: the canvas still shows A's geometry.
  scene = auroraB; appearanceRevision = 1;
  const recolored = adapter.recolor(auroraB, generation(2, { appearanceRevision: 1 }));
  assert.equal(recolored.status, 'applied');
  assert.notEqual(recolored.report, null, 'the retained image was recolored, so its provenance is republished');
  assert.equal(recolored.report.geometryRequestId, reportA.requestId);
  assert.equal(recolored.report.sceneHash, hashOf({ ...A, appearance: auroraB.appearance }), 'the publication names the retained geometry with the live appearance');
  assert.equal(recolored.report.appearanceRebound, true);
  assert.equal(adapter.publication?.report, recolored.report);
  assert.deepEqual(adapter.publication.request.sceneSnapshot.camera, A.camera);
  assert.equal(adapter.publication.request.sceneSnapshot.appearance.palette, 'aurora');
  assert.equal(renderer.colors().at(-1).palette, 'aurora');
  // B is superseded before it draws: the retained image and its truthful publication stand.
  revision = 3;
  renderer.finishNext();
  assert.equal((await second).outcome, 'superseded');
  assert.equal(adapter.publication?.report, recolored.report, 'a render superseded before it drew leaves the truthful publication in place');
  // A failure, by contrast, may have resized the canvas before it was raised (fix round 2, finding 1).
  const third = adapter.render(request(B, 3), options());
  renderer.failNext('shader failure');
  assert.equal((await third).outcome, 'failed');
  assert.equal(adapter.publication, null, 'a failed render leaves nothing describable');
});

test('the publication describes the export image, and a loss, a retirement or a replacement clears it', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const interactive = { currentGeneration: () => generation(1), liveScene: () => A };
  const first = adapter.render(request(A, 1), interactive);
  renderer.finishNext();
  const reportA = await first;
  assert.equal(adapter.publication?.report, reportA);
  assert.equal(adapter.publication.request.output.purpose, 'interactive');
  const lease = adapter.reserveExclusive(request(A, 1, 'export'));
  const rendering = lease.render({ timeoutMs: 1000 }); await flush(); renderer.finishNext();
  const exported = await rendering;
  assert.equal(adapter.publication?.report, exported, 'the canvas now shows the export image');
  assert.equal(adapter.publication.request.output.purpose, 'export');
  lease.retire(); lease.release();
  assert.equal(adapter.publication, null, 'a retired renderer has no describable image');
  adapter.replaceRenderer(createFakeRenderer());
  const again = adapter.render(request(A, 1), interactive);
  adapter.renderer.finishNext();
  assert.equal((await again).outcome, 'completed');
  assert.notEqual(adapter.publication, null);
  adapter.invalidate();
  assert.equal(adapter.publication, null, 'a lost context has no describable image');
  adapter.replaceRenderer(createFakeRenderer());
  assert.equal(adapter.publication, null, 'a replacement starts without a publication');
});

// T08 fix round 2 (Codex r2 finding 1): a failed render may have resized the canvas or reallocated
// the field before failing (GpuRenderer.resize), so the retained image's validity is no longer
// established: the publication is cleared rather than left describing an image that may be gone.
test('a failed render that may have changed the canvas clears the publication, interactive and export', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const interactive = { currentGeneration: () => generation(1), liveScene: () => A };
  const first = adapter.render(request(A, 1), interactive);
  renderer.finishNext();
  assert.equal((await first).outcome, 'completed');
  assert.notEqual(adapter.publication, null);
  const second = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 640, height: 360, generation: generation(2) }), { currentGeneration: () => generation(2), liveScene: () => A });
  renderer.canvas.width = 640; renderer.canvas.height = 360; // the allocation resized the canvas, then failed
  renderer.failNext('Cannot allocate rendering surface.');
  assert.equal((await second).outcome, 'failed');
  assert.equal(adapter.publication, null, 'a destructive failure leaves nothing describable');
  assert.equal(adapter.published, null);
  const again = adapter.render(request(A, 3), { currentGeneration: () => generation(3), liveScene: () => A });
  renderer.finishNext();
  assert.equal((await again).outcome, 'completed');
  const lease = adapter.reserveExclusive(createPlaneRequest({ scene: A, purpose: 'export', width: 1920, height: 1080, generation: generation(3) }));
  const rendering = lease.render({ timeoutMs: 1000 }); await flush();
  renderer.canvas.width = 1920; renderer.canvas.height = 1080;
  renderer.failNext('Cannot allocate rendering surface.');
  assert.equal((await rendering).outcome, 'failed');
  lease.release();
  assert.equal(adapter.publication, null, 'a failed export render leaves nothing describable either');
  const superseded = adapter.render(request(B, 4), { currentGeneration: () => generation(5), liveScene: () => B });
  renderer.finishNext();
  assert.equal((await superseded).outcome, 'superseded');
});
