import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeClock } from '../support/fake-clock.mjs';
import { createFakeBackend } from '../support/fake-backend.mjs';
import { createScheduler } from '../../src/shared/scheduler.js';
import { BackendError, createAdmission, createPipelineSet, createPickRequest, sampleJitter } from '../../src/space/render/backend.js';
import { packStatus, packLightingStatus } from '../../src/space/render/status.js';
import { createSpaceScene, sceneCodec } from '../../src/space/scene-adapter.js';
import { createSpaceRequest } from '../../src/space/render-adapter.js';
import { createSpaceRenderer, navigationDraftEligible } from '../../src/space/render/renderer.js';
import { stageDraftDiagnostics } from '../support/fake-space-backend.mjs';
import { productPipelineSet, appearancePipelineDescriptors } from '../../src/space/render/webgpu/appearance.js';
import { FIELD_IDS, POINT_INPUT_BYTES, POINT_RESULT_BYTES, RESULT_SENTINEL, decodePointResults,
  fieldPipelineDescriptors, mengerBoxData } from '../../src/space/render/webgpu/kernels.js';
import { effectiveParameters, escapeRadius } from '../../src/space/numerics/parameters.js';
import { encodeOrdinaryOrigin, reconstructHit, toLocal, lookAt } from '../../src/space/camera.js';
import { classifyCamera, getModel } from '../../src/space/models/registry.js';
import { bindSpaceNavigation, cameraStatus } from '../../src/space/navigation.js';

const versions = { kernelVersion: 'fixture-kernel-v1', tracingVersion: 'fixture-tracing-v1' };
const generation = (n = 1, appearanceRevision = n) => ({ deviceEpoch: 1, viewRevision: n, geometryRevision: n, appearanceRevision });
const identity = request => Object.fromEntries(['requestId', 'jobId', 'viewId', 'generation'].map(k => [k, request[k]]));
const scene = (patch = {}) => createSpaceScene({ model: 'sphere', ...patch });
const request = (s = scene(), g = generation(), profile = 'draft', size = { width: 16, height: 8 }) =>
  createSpaceRequest({ scene: s, purpose: 'interactive', ...size, profile, generation: g, viewId: 'space', versions });
const changed = (s, patch) => sceneCodec.validate({ ...s, ...patch });
const directScene = (samples = 1) => { const s = scene(); return changed(s, { appearance: { ...s.appearance, lightingQuality: 'direct' }, sampling: { ...s.sampling, targetSamples: samples } }); };
const read = slot => ({ slot, type: 'texture', access: 'read' });
const write = slot => ({ slot, type: 'storage-texture', access: 'write' });
const uniformLayout = { byteLength: 48, fields: [
  { name: 'origin', type: 'vec2<u32>', offset: 0 }, { name: 'size', type: 'vec2<u32>', offset: 8 },
  { name: 'sampleIndex', type: 'u32', offset: 16 }, { name: 'seed', type: 'u32', offset: 20 },
  { name: 'lightingStage', type: 'u32', offset: 24 }, { name: 'jitter', type: 'vec2<f32>', offset: 32 },
] };
const compute = (pipelineId, entryPoint, bindings, layout = uniformLayout) => ({ pipelineId, entryPoint, kind: 'compute', sourceIds: ['fixture-only'], constants: {}, bindings: [{ slot: 'u', type: 'uniform-buffer', access: 'read' }, ...bindings], uniformLayout: layout });
// Render-pass fixtures plus the real B08 point descriptors; the fake backend does not execute shaders.
const fixture = createPipelineSet({ id: 'b09-fixture', descriptors: [
  compute('probe', 'probe', [write('probe_target')], { byteLength: 16, fields: uniformLayout.fields.slice(0, 2) }),
  compute('trace', 'trace_band', [write('depth'), write('status')]),
  compute('normals', 'normals_band', [read('depth'), read('status'), write('normal')]),
  compute('shade', 'shade_band', [read('depth'), read('status'), read('normal'), write('sampleColor'), write('lightingStatus')]),
  ...['normals', 'depth', 'steps', 'termination'].map(mode => compute(`diagnostic-${mode}`, `diagnostic_${mode}`, [read('depth'), read('status'), read('normal'), write('sampleColor'), write('lightingStatus')])),
  compute('accumulate', 'accumulate_band', [read('sampleColor'), read('lightingStatus'), read('previous'), write('next'), { slot: 'accumulationFlags', type: 'storage-texture', access: 'read-write' }]),
  compute('display', 'display_band', [read('accumulation'), read('accumulationFlags'), write('display')]),
  ...appearancePipelineDescriptors().filter(d => d.pipelineId === 'display_draft_band'),
  ...fieldPipelineDescriptors(),
  { pipelineId: 'present', kind: 'render', sourceIds: ['fixture-only'], vertexEntryPoint: 'present_vertex', fragmentEntryPoint: 'present_fragment', constants: {}, bindings: [read('display')], uniformLayout: { byteLength: 0, fields: [] } },
] });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const words = values => new Uint8Array(Uint32Array.from(values).buffer);

async function rig({ pipelineSet = fixture, limits = {}, probe = 0x41544c53, statusWords, lightingWords, normals, recoveryWords, depths, classificationWords, holdConfiguration = false, holdReadbacks = false, rejectConfiguration = false, stalePickReadback = false, structural = false } = {}) {
  const clock = createFakeClock(), fake = createFakeBackend({ clock, limits });
  const hooks = {}, discarded = [], failed = [], auxiliaryJobs = [];
  const tickets = [], submissions = [], publications = [], presents = [], statuses = [], reports = [], plans = [], targets = [];
  let prepared = false, releaseConfiguration, releaseReadbacks;
  const readbacksBlocked = new Promise(resolve => { releaseReadbacks = resolve; });
  const blocked = new Promise(resolve => { releaseConfiguration = resolve; });
  const backend = { ...fake, currentEpoch: () => hooks.epoch ?? fake.currentEpoch(),
    async configureTargets(desc) {
      if (prepared && rejectConfiguration) throw new Error('injected configuration failure');
      const set = await fake.configureTargets(desc); targets.push(set);
      if (prepared && statusWords) fake.stage(set.handles.status, words(Array.from({ length: desc.internalSize.width * desc.internalSize.height }, (_, i) => statusWords[i % statusWords.length])));
      if (prepared && depths) fake.stage(set.handles.depth, new Uint8Array(Float32Array.from(Array.from({ length: desc.internalSize.width * desc.internalSize.height }, (_, i) => depths[i % depths.length])).buffer));
      if (prepared && lightingWords) fake.stage(set.handles.lightingStatus, words(Array.from({ length: desc.internalSize.width * desc.internalSize.height }, (_, i) => lightingWords[i % lightingWords.length])));
      if (prepared && normals) {
        const data = new Uint16Array(desc.internalSize.width * desc.internalSize.height * 4);
        for (let i = 0; i < data.length / 4; i++) data[i * 4 + 3] = normals[i % normals.length] ? 0x3c00 : 0;
        fake.stage(set.handles.normal, new Uint8Array(data.buffer));
      }
      if (prepared && holdConfiguration) await blocked;
      return set;
    },
  };
  for (const method of ['submitBatch', 'readback', 'present']) backend[method] = (desc, options) => {
    if (method === 'submitBatch') stageDraftDiagnostics(fake, desc, { statusWords, normals, recoveryWords });
    hooks.before?.(method, desc, options);
    if (method === 'readback' && desc.fields.includes('probe')) fake.stage(desc.source, words([probe]));
    if (method === 'readback' && desc.fields.includes('cameraClassification') && classificationWords) fake.stage(desc.source, words(classificationWords));
    const ticket = fake[method](desc, options);
    const replacement = hooks.after?.(method, desc, ticket);
    const record = { method, desc, admission: options.admission, ticket, pending: true };
    tickets.push(record); submissions.push(record);
    ticket.done.then(() => { record.pending = false; });
    if (replacement) return replacement;
    if (stalePickReadback && method === 'readback' && desc.fields.includes('depth')) return { ...ticket, result: ticket.result.then(result => ({ ...result, identity: { ...result.identity, requestId: 'obsolete-request' } })) };
    return prepared && holdReadbacks && method === 'readback'
      ? { ...ticket, result: ticket.result.then(async result => { await readbacksBlocked; return result; }) } : ticket;
  };
  const rawScheduler = createScheduler({ clock, makeAdmission: createAdmission, setTimer: clock.schedule, clearTimer: clock.clear });
  const scheduler = { ...rawScheduler,
    failed(admission, error) { failed.push({ admission, error }); return rawScheduler.failed(admission, error); },
    requestAuxiliary(view, args) {
      const job = rawScheduler.requestAuxiliary(view, args); auxiliaryJobs.push(job); return job;
    },
    request(view, args) {
      plans.push(args.plan);
      return rawScheduler.request(view, structural && prepared ? { ...args, plan: { request: args.plan.request, next: () => null, exhausted: () => false, advance() { assert.fail('structural plan cannot be admitted'); } } } : args);
    },
  };
  scheduler.discardAuxiliary = (admission, { reason }) => {
    const accepted = rawScheduler.discardAuxiliary(admission, { reason });
    discarded.push({ admission, reason, accepted }); return accepted;
  };
  let renderer;
  assert.doesNotThrow(() => { renderer = createSpaceRenderer({ backend, scheduler, clock, viewId: 'space', versions, pipelineSet }); }, 'the importable renderer must implement its constructor');
  renderer.onPublish(value => publications.push(value)); renderer.onPresent(value => presents.push(value));
  renderer.onStatus(value => statuses.push(value)); renderer.onReport(value => reports.push(value));
  const complete = async (order = 'oldest', elapsedMs = 8) => {
    await flush(); const pending = tickets.filter(item => item.pending);
    const item = order === 'newest' ? pending.at(-1) : pending[0];
    if (!item) return false;
    clock.advance(0.1); fake.complete(item.ticket, { elapsedMs }); await flush(); return item;
  };
  const until = async (predicate, order = 'oldest', limit = 20000) => {
    for (let i = 0; i < limit; i++) { await flush(); if (predicate()) return; await complete(order); }
    assert.fail('bounded fake-backend driver did not reach its condition');
  };
  const finish = async (job, order = 'oldest') => {
    let result; job.done.then(value => { result = value; }); await until(() => result !== undefined, order); return result;
  };
  const preparing = renderer.prepare(); await flush(); fake.finishPrepare();
  let receipt, failure; preparing.then(value => { receipt = value; }, error => { failure = error; });
  await until(() => receipt !== undefined || failure !== undefined);
  prepared = true;
  return { renderer, fake, backend, scheduler, clock, hooks, discarded, failed, auxiliaryJobs, tickets, submissions, publications, presents, statuses, reports, plans, targets, receipt, failure, complete, until, finish, releaseConfiguration, releaseReadbacks };
}
const batches = (h, jobId) => h.submissions.filter(x => x.method === 'submitBatch' && x.desc.identity.jobId === jobId).map(x => x.desc);
const auxiliaryResult = async (h, promise) => { let result; promise.then(value => { result = value; }); await h.until(() => result !== undefined); return result; };

const inventoryEntry = (h, handle) => h.fake.diagnostics().inventory.find(entry => entry.id === handle.id && entry.epoch === handle.epoch);
const pixelsIn = r => r.quality.internalSize.width * r.quality.internalSize.height;

test('a completed navigation draft publishes pending while a newer camera request waits', async () => {
  const h = await rig();
  let live = generation(), stream = 1;
  const options = { currentGeneration: () => live, currentNavigation: () => stream };
  const a = request(scene(), live), ja = h.renderer.render(a, options);
  await h.until(() => h.tickets.some(t => t.pending && t.desc.identity.jobId === ja.jobId));
  live = { ...live, viewRevision: live.viewRevision + 1, geometryRevision: live.geometryRevision + 1 };
  const b = request(scene(), live), jb = h.renderer.render(b, options);
  await h.until(() => h.publications.some(p => p.requestId === a.requestId));
  const old = h.publications.find(p => p.requestId === a.requestId);
  assert.equal(old.pending, true);
  assert.equal(old.kind, 'draft');
  assert.equal(old.identity.requestId, a.requestId);
  await h.finish(jb);
  assert.equal(h.publications.at(-1).requestId, b.requestId);
  assert.equal(h.publications.at(-1).pending, false);
  assert.equal((await ja.done).outcome, 'completed');
  h.renderer.destroy();
});

test('navigation invalidation rejects old drafts even when content returns to A', async () => {
  const h = await rig(); let live = generation(), stream = 1;
  const options = { currentGeneration: () => live, currentNavigation: () => stream };
  const a = request(scene(), live), job = h.renderer.render(a, options);
  await h.until(() => h.tickets.some(t => t.pending && t.desc.identity.jobId === job.jobId));
  stream += 2; live = { ...live, viewRevision: live.viewRevision + 2, geometryRevision: live.geometryRevision + 2 };
  const replacement = h.renderer.render(request(scene(), live), options);
  await h.finish(replacement);
  assert.equal(h.publications.some(p => p.requestId === a.requestId), false);
  h.renderer.destroy();
});

test('an older draft cannot overwrite a newer settled publication', async () => {
  const h = await rig(); let live = generation();
  const options = { currentGeneration: () => live, currentNavigation: () => 1 };
  const a = request(scene(), live), old = h.renderer.render(a, options);
  await h.until(() => h.tickets.some(t => t.pending && t.desc.identity.jobId === old.jobId));
  live = { ...live, viewRevision: live.viewRevision + 1, geometryRevision: live.geometryRevision + 1 };
  const settled = request(scene(), live, 'settled'), latest = h.renderer.render(settled, options);
  await h.finish(latest, 'newest');
  const index = h.publications.findIndex(p => p.requestId === settled.requestId);
  await h.finish(old);
  assert.ok(index >= 0);
  assert.ok(h.publications.slice(index).every(p => p.requestId === settled.requestId));
  h.renderer.destroy();
});

test('an invalidated navigation stream or live device epoch cannot publish even without a replacement request', async () => {
  for (const change of ['stream', 'epoch']) {
    const h = await rig(); let stream = 1, live = generation();
    const job = h.renderer.render(request(scene(), live), { currentNavigation: () => stream, currentGeneration: () => live });
    await h.until(() => h.tickets.some(t => t.pending && t.desc.identity.jobId === job.jobId));
    if (change === 'stream') stream++; else live = { ...live, deviceEpoch: live.deviceEpoch + 1 };
    await h.finish(job);
    assert.equal(h.publications.some(p => p.requestId === job.requestId), false, change);
    h.renderer.destroy();
  }
});

test('cancelling the newest navigation request fences its older pending drafts', async () => {
  const h = await rig(); let live = generation();
  try {
    const options = {currentGeneration:()=>live,currentNavigation:()=>1};
    const a = h.renderer.render(request(scene(), live), options);
    await h.until(()=>h.tickets.some(t=>t.pending&&t.desc.identity.jobId===a.jobId));
    live = generation(2, 1);
    const b = h.renderer.render(request(scene(), live), options);
    assert.equal(h.renderer.cancel(b.jobId).accepted, true);
    await h.finish(a); await h.finish(b);
    assert.equal(h.publications.length, 0);
  } finally {h.renderer.destroy();}
});

test('presentation completion rejects a cancelled request or invalidated navigation stream', async () => {
  for (const invalidation of ['cancel', 'stream']) {
    const h = await rig(); let stream = 1;
    try {
      const job = h.renderer.render(request(), {currentNavigation:()=>stream});
      await h.until(()=>h.tickets.some(t=>t.pending&&t.method==='present'&&t.desc.identity.jobId===job.jobId));
      assert.equal(h.publications.length, 1, 'the image was encoded before invalidation');
      if(invalidation==='cancel') h.renderer.cancel(job.jobId); else stream++;
      await h.finish(job);
      assert.equal(h.presents.length, 0, invalidation);
    } finally {h.renderer.destroy();}
  }
});

test('releaseObsolete preserves the live viewport cache after a different export fails', async () => {
  const h = await rig(), a = request(directScene(), generation(), 'settled');
  let live = a.generation;
  await h.finish(h.renderer.render(a, { currentGeneration: () => live }));
  const exporting = createSpaceRequest({ scene: scene({ model: 'box' }), purpose: 'export', width: 32, height: 16,
    profile: 'settled', generation: generation(9), viewId: 'space', versions });
  h.fake.testAdapter.failNextAllocation();
  assert.equal((await h.finish(h.renderer.render(exporting))).outcome, 'failed');
  const before = h.fake.diagnostics(), released = h.fake.log.filter(entry => entry.method === 'release').length;
  assert.deepEqual(h.renderer.releaseObsolete({ request: exporting }), { freed: 0, retiring: 0 });
  live = { ...live, viewRevision: 2, appearanceRevision: 2 };
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 }, 'an unsubmitted appearance edit preserves geometry');
  assert.deepEqual(h.fake.diagnostics(), before);
  assert.equal(h.fake.log.filter(entry => entry.method === 'release').length, released);
  const b = request(changed(a.sceneSnapshot, { appearance: { ...a.sceneSnapshot.appearance, palette: 'rose' } }), live, 'settled');
  assert.equal((await h.finish(h.renderer.render(b, { currentGeneration: () => live }))).outcome, 'completed');
  assert.equal(batches(h, b.jobId).filter(batch => ['trace', 'normals'].includes(batch.pass)).length, 0);
  assert.equal(h.publications.at(-1).geometryRequestId, a.requestId);
  h.renderer.destroy(); h.fake.destroy();
});

test('releaseObsolete keeps the cache when the live currentGeneration callback throws', async t => {
  const h = await rig(); t.after(() => { h.renderer.destroy(); h.fake.destroy(); });
  const a = request(directScene(), generation(), 'settled'); let throwing = false;
  const currentGeneration = () => { if (throwing) throw new Error('live generation temporarily unavailable'); return a.generation; };
  assert.equal((await h.finish(h.renderer.render(a, { currentGeneration }))).outcome, 'completed');
  const before = h.fake.diagnostics(), releases = h.fake.log.filter(value => value.method === 'release').length;
  throwing = true;
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 });
  assert.deepEqual(h.fake.diagnostics(), before);
  assert.equal(h.fake.log.filter(value => value.method === 'release').length, releases);
  throwing = false;
  const b = request(a.sceneSnapshot, a.generation, 'settled');
  assert.equal((await h.finish(h.renderer.render(b, { currentGeneration }))).outcome, 'completed');
  assert.ok(!batches(h, b.jobId).some(batch => ['trace', 'normals'].includes(batch.pass)));
  assert.equal(h.publications.at(-1).geometryRequestId, a.requestId);
});

test('releaseObsolete follows unsubmitted live geometry edits and keeps the published pick handles', async () => {
  const h = await rig({ depths: [7] }), a = request(directScene(), generation(), 'settled');
  let live = a.generation;
  await h.finish(h.renderer.render(a, { currentGeneration: () => live }));
  const { depth, status, normal, display } = h.targets.at(-1).handles;
  live = generation(3); // A -> B -> A can have the same key and a new revision.
  const exporting = createSpaceRequest({ scene: a.sceneSnapshot, purpose: 'export', width: a.output.width, height: a.output.height,
    profile: 'settled', generation: a.generation, viewId: 'space', versions });
  h.fake.testAdapter.failNextAllocation();
  assert.equal((await h.finish(h.renderer.render(exporting))).outcome, 'failed');
  const before = h.fake.diagnostics().tracked;
  const receipt = h.renderer.releaseObsolete({ request: exporting });
  assert.deepEqual(receipt, { freed: pixelsIn(a) * 12, retiring: 0 });
  assert.ok(Object.isFrozen(receipt));
  assert.equal(h.fake.diagnostics().tracked, before - receipt.freed);
  assert.equal(inventoryEntry(h, normal), undefined);
  for (const handle of [depth, status, display]) assert.equal(inventoryEntry(h, handle).state, 'live');
  const pick = createPickRequest({ identity: identity(a), pixel: [0, 0], dimensions: a.quality.internalSize, geometryRevision: 1, sampleIndex: 0 });
  assert.equal((await auxiliaryResult(h, h.renderer.pick(pick))).depth, 7);
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 });
  assert.equal(h.fake.log.filter(entry => entry.method === 'release' && entry.args[0] === normal).length, 1);
  h.renderer.destroy(); h.fake.destroy();
});

test('releaseObsolete checks the live request key and sample seed as well as its geometry revision', async () => {
  for (const change of ['key', 'seed', 'revision', 'epoch']) {
    const h = await rig(), a = request(directScene(), generation(), 'settled');
    let live = a.generation;
    await h.finish(h.renderer.render(a, { currentGeneration: () => live }));
    if (change === 'epoch') live = { ...live, deviceEpoch: 2 };
    else {
      const nextScene = change === 'key' ? scene({ model: 'box' }) : change === 'seed'
        ? changed(a.sceneSnapshot, { sampling: { ...a.sceneSnapshot.sampling, seed: a.sceneSnapshot.sampling.seed + 1 } }) : a.sceneSnapshot;
      const next = request(nextScene, change === 'revision' ? generation(2) : a.generation, 'settled');
      h.fake.testAdapter.failNextAllocation();
      assert.equal((await h.finish(h.renderer.render(next))).outcome, 'failed');
    }
    assert.deepEqual(h.renderer.releaseObsolete(), { freed: pixelsIn(a) * 12, retiring: 0 }, change);
    h.renderer.destroy(); h.fake.destroy();
  }
});

test('releaseObsolete drops only cache ownership while an active job still owns its geometry', async () => {
  const h = await rig(), r = request(directScene(), generation(), 'settled');
  let live = r.generation;
  const job = h.renderer.render(r, { currentGeneration: () => live });
  await h.until(() => batches(h, r.jobId).some(batch => batch.pass === 'shade'));
  const handles = ['depth', 'status', 'normal'].map(name => h.targets.at(-1).handles[name]);
  live = generation(2);
  const before = h.fake.diagnostics(), scheduled = h.scheduler.snapshot();
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 });
  assert.deepEqual(h.fake.diagnostics(), before);
  assert.deepEqual(h.scheduler.snapshot(), scheduled, 'cache release never cancels or consumes a lease');
  for (const handle of handles) assert.equal(inventoryEntry(h, handle).state, 'live');
  h.renderer.cancel(r.jobId);
  assert.equal((await h.finish(job)).outcome, 'cancelled');
  for (const handle of handles) assert.equal(inventoryEntry(h, handle), undefined, 'no cache owner survives the drop');
  h.renderer.destroy(); h.fake.destroy();
});

test('releaseObsolete reports retiring cache bytes until the outstanding ticket drains', async () => {
  const h = await rig(), r = request(directScene(), generation(), 'settled');
  let live = r.generation;
  const job = h.renderer.render(r, { currentGeneration: () => live });
  await h.until(() => batches(h, r.jobId).some(batch => batch.pass === 'shade'));
  h.scheduler.pause('space'); h.clock.advance(5000); await flush();
  assert.equal((await job.done).reason, 'watchdog');
  const handles = ['depth', 'status', 'normal'].map(name => h.targets.at(-1).handles[name]);
  live = generation(2);
  const before = h.fake.diagnostics(), outstanding = h.scheduler.snapshot().outstanding;
  assert.ok(before.retiring > 0, 'unrelated ticket-owned targets already retire');
  // B11c: the ticket holds depth, status and normal; the cached recovery word (4 B/px) is freed at once.
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: pixelsIn(r) * 4, retiring: pixelsIn(r) * 16 });
  assert.equal(h.fake.diagnostics().tracked, before.tracked - pixelsIn(r) * 4);
  assert.equal(h.fake.diagnostics().retiring, before.retiring + pixelsIn(r) * 16);
  assert.equal(h.scheduler.snapshot().outstanding, outstanding);
  for (const handle of handles) assert.equal(inventoryEntry(h, handle).state, 'retiring');
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 });
  let drained = false;
  const cancellation = h.renderer.cancel(r.jobId); cancellation.done.then(() => { drained = true; });
  await flush(); assert.equal(drained, false);
  await h.until(() => drained);
  assert.equal((await cancellation.done).submitted, 'drained');
  for (const handle of handles) assert.equal(inventoryEntry(h, handle), undefined);
  assert.equal((await job.done).outcome, 'budget-exceeded');
  h.renderer.destroy(); h.fake.destroy();
});

test('releaseObsolete separates freed bytes from a cache readback still held by mapping', async () => {
  const h = await rig(), r = request(directScene(), generation(), 'settled');
  let live = r.generation;
  const job = h.renderer.render(r, { currentGeneration: () => live });
  await h.until(() => h.tickets.some(item => item.pending && item.method === 'readback' && item.desc.fields[0] === 'status'));
  const readback = h.tickets.find(item => item.pending && item.method === 'readback' && item.desc.fields[0] === 'status');
  h.scheduler.pause('space'); h.clock.advance(5000); await flush();
  assert.equal((await job.done).reason, 'watchdog');
  live = generation(2);
  h.fake.complete(readback.ticket, { elapsedMs: 8 }); // Fence done; mapping copy-out is still queued.
  const status = readback.desc.source, before = h.fake.diagnostics().tracked;
  assert.equal(inventoryEntry(h, status).tickets, 0);
  assert.equal(inventoryEntry(h, status).mappings, 1);
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: pixelsIn(r) * 16, retiring: pixelsIn(r) * 4 });
  assert.equal(h.fake.diagnostics().tracked, before - pixelsIn(r) * 16);
  assert.equal(inventoryEntry(h, status).state, 'retiring');
  assert.equal(h.scheduler.snapshot().outstanding, 1, 'one region retains one lease through copy-out');
  await flush();
  assert.equal(inventoryEntry(h, status), undefined);
  assert.equal(h.fake.diagnostics().tracked, before - pixelsIn(r) * 20);
  assert.equal(h.scheduler.snapshot().outstanding, 0);
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 });
  h.renderer.destroy(); h.fake.destroy();
});

test('releaseObsolete is harmless before rendering and after loss or destruction', async () => {
  const h = await rig();
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 });
  await h.finish(h.renderer.render(request()));
  h.fake.lose({ reason: 'cache epoch lost' });
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 });
  assert.equal(h.fake.diagnostics().tracked, 0);
  h.renderer.destroy();
  assert.deepEqual(h.renderer.releaseObsolete(), { freed: 0, retiring: 0 });
});

test('job results preserve allocation error codes from configuration and admitted operations', async () => {
  for (const phase of ['configuration', 'trace', 'readback']) {
    const h = await rig();
    if (phase === 'configuration') h.fake.testAdapter.failNextAllocation();
    else h.hooks.before = (method, desc) => {
      if (phase === 'trace' ? desc.pass === 'trace' : method === 'readback' && desc.fields[0] === 'status') {
        h.fake.testAdapter.failNextAllocation(); h.hooks.before = undefined;
      }
    };
    const result = await h.finish(h.renderer.render(request(directScene(), generation(), 'settled')));
    assert.equal(result.outcome, 'failed');
    assert.equal(result.errorCode, 'allocation-failed', phase);
    assert.equal(result.report.outcome, 'failed');
    h.renderer.destroy(); h.fake.destroy();
  }
});

test('job results preserve preparation and copy-out error codes without parsing reason text', async () => {
  const bad = await rig({ probe: 0 });
  const job = bad.renderer.render(request());
  await flush(); bad.fake.finishPrepare();
  const preparation = await bad.finish(job);
  assert.equal(preparation.outcome, 'failed'); assert.equal(preparation.errorCode, 'preparation-failed');
  bad.renderer.destroy(); bad.fake.destroy();
  const h = await rig();
  h.hooks.after = (method, desc, ticket) => method === 'readback' && desc.fields[0] === 'draftDiagnostics'
    ? { ...ticket, result: ticket.result.then(() => { throw new BackendError('invalid-descriptor', 'opaque copy-out failure'); }) } : undefined;
  const result = await h.finish(h.renderer.render(request()));
  assert.equal(result.outcome, 'failed'); assert.equal(result.errorCode, 'invalid-descriptor');
  assert.equal(result.reason, 'opaque copy-out failure');
  h.renderer.destroy(); h.fake.destroy();
});

test('job results do not invent error codes for untyped failures or successful jobs', async () => {
  const bad = await rig({ rejectConfiguration: true });
  assert.equal((await bad.finish(bad.renderer.render(request()))).errorCode, undefined);
  bad.renderer.destroy(); bad.fake.destroy();
  const h = await rig();
  assert.equal((await h.finish(h.renderer.render(request()))).errorCode, undefined);
  h.renderer.destroy(); h.fake.destroy();
});

test('a draft replaces the published image only when complete and the retained image is marked pending meanwhile', async () => {
  const h = await rig(); const a = request(); await h.finish(h.renderer.render(a));
  assert.equal(h.publications.length, 1); const display = h.submissions.filter(x => x.method === 'present').at(-1).desc.display;
  const b = request(scene({ model: 'box' }), generation(2), 'draft', { width: 1024, height: 512 });
  const job = h.renderer.render(b); assert.deepEqual(h.statuses.at(-1), { pending: true, since: h.clock.now() });
  await h.complete(); assert.equal(h.publications.length, 1, 'partial trace cannot replace the image');
  assert.ok(!h.fake.log.some(x => x.method === 'release' && x.args[0] === display), 'the published handle remains caller-owned');
  const result = await h.finish(job); assert.equal(result.outcome, 'completed', result.reason);
  assert.deepEqual(h.publications.map(x => x.requestId), [a.requestId, b.requestId]);
  assert.equal(h.publications[1].pending, false);
  assert.ok(h.fake.log.some(x => x.method === 'release' && x.args[0] === display));
  h.renderer.destroy();
});

test('an appearance edit reuses geometry under the same geometry key and resets accumulation', async () => {
  const h = await rig(), a = request(directScene(), generation(), 'settled');
  await h.finish(h.renderer.render(a));
  const b = request(changed(a.sceneSnapshot, { appearance: { ...a.sceneSnapshot.appearance, palette: 'rose' } }), { ...a.generation, viewRevision: 2, appearanceRevision: 2 }, 'settled');
  assert.equal(a.keys.geometryKey, b.keys.geometryKey);
  await h.finish(h.renderer.render(b)); const work = batches(h, b.jobId);
  assert.equal(work.filter(x => ['trace', 'normals'].includes(x.pass)).length, 0);
  assert.equal(work.find(x => x.pass === 'accumulate').sample.index, 0);
  assert.equal(h.publications.at(-1).geometryRequestId, a.requestId);
  assert.notEqual(h.reports.at(-1).keys.appearanceKey, h.reports.at(-2).keys.appearanceKey);
  h.renderer.destroy();
});

test("geometry A → B → A returns A's key with a new revision and the late A completion is rejected", async () => {
  const h = await rig(), a = request(), b = request(scene({ model: 'box' }), generation(2)), again = request(scene(), generation(3));
  let current = a.generation;
  const first = h.renderer.render(a, { currentGeneration: () => current }); await flush();
  current = b.generation; const second = h.renderer.render(b, { currentGeneration: () => current });
  current = again.generation; const third = h.renderer.render(again, { currentGeneration: () => current });
  assert.equal(a.keys.geometryKey, again.keys.geometryKey); assert.notEqual(a.generation.geometryRevision, again.generation.geometryRevision);
  await h.finish(third, 'newest');
  assert.notEqual((await h.finish(first)).outcome, 'completed'); assert.notEqual((await h.finish(second)).outcome, 'completed');
  assert.deepEqual(h.publications.map(x => x.requestId), [again.requestId]); h.renderer.destroy();
});

test('direct-light samples never enter the accumulator for the shadowed appearance', async () => {
  const h = await rig(), r = request(scene(), generation(), 'settled'); await h.finish(h.renderer.render(r));
  const work = batches(h, r.jobId).filter(x => x.pass === 'accumulate');
  assert.deepEqual(work.map(x => x.uniforms.lightingStage), [0, ...Array(8).fill(1)]);
  assert.deepEqual(work.map(x => x.sample.index), [0, 0, 1, 2, 3, 4, 5, 6, 7]);
  assert.notEqual(h.publications[0].accumulationKey, h.publications[1].accumulationKey);
  assert.equal(h.publications.at(-1).samples, 8); h.renderer.destroy();
});

test('resize advances the geometry revision and the key', async () => {
  const h = await rig(), a = request(); await h.finish(h.renderer.render(a));
  const b = h.renderer.resize({ width: 24, height: 12 });
  assert.equal(b.generation.geometryRevision, a.generation.geometryRevision + 1);
  assert.equal(b.generation.viewRevision, a.generation.viewRevision + 1); assert.notEqual(b.keys.geometryKey, a.keys.geometryKey);
  assert.equal(h.statuses.at(-1).pending, true); await h.finish(h.renderer.render(b)); h.renderer.destroy();
});

test('a report counts terminations and lighting failures from the status words and marks GPU timing as queue-completion', async () => {
  const values = [
    { status: 0 }, { status: 1 }, { status: 2, reason: 1 }, { status: 2, reason: 2 },
    { status: 2, reason: 3 }, { status: 2, reason: 4, subreason: 1 }, { status: 2, reason: 4, subreason: 2 }, { status: 3 },
  ].map(value => packStatus({ reason: 0, subreason: 0, steps: 7, ...value }));
  const failure = { status: 3, reason: 0, subreason: 0 };
  const lightingWords = [{ shadow: failure, ao: null }, { shadow: null, ao: failure }, { shadow: failure, ao: failure }, { shadow: null, ao: null }].map(packLightingStatus);
  const h = await rig({ statusWords: values, lightingWords, normals: [false, true] });
  const r = request(directScene(), generation(), 'settled', { width: 8, height: 1 });
  const { report } = await h.finish(h.renderer.render(r));
  assert.deepEqual(report.rayTermination, { hit: 1, miss: 1, unresolved: { pointBudget: 1, estimateUnavailable: 1, rayStepBudget: 1, stagnation: { rayParameter: 1, fieldCoordinate: 1 } }, numericalFailure: 1 });
  // B11b measurement fix: an unavailable normal counts only where the same sample hit (pixel 0 of 0, 2, 4, 6).
  assert.deepEqual(report.lightingFailures, { shadow: 4, ao: 4, both: 2 }); assert.equal(report.unavailableNormals, 1);
  assert.equal(report.gpuTiming.completionMethod, 'queue-completion'); assert.ok(report.gpuTiming.queueElapsedMs > 0);
  assert.equal(report.timings.gpu, 'unavailable'); assert.equal(report.outcome, 'completed');
  assert.equal(report.estimator.category, 'exact-distance'); assert.equal(report.estimator.validationRecordId, null);
  assert.deepEqual(report.samples, { target: 1, completed: 1 }); h.renderer.destroy();
});

test('a report carries per-sample outcome metrics and pixelwise unions from the same full-light samples', async () => {
  const HIT = packStatus({ status: 0, reason: 0, subreason: 0, steps: 2 }), MISS = packStatus({ status: 1, reason: 0, subreason: 0, steps: 2 });
  const AO = packLightingStatus({ shadow: null, ao: { status: 2, reason: 1, subreason: 0 } }), SHADOW = packLightingStatus({ shadow: { status: 2, reason: 3, subreason: 0 }, ao: null });
  // Ordinal 0 is the direct sample (its own accumulation identity); ordinals 1 and 2 are full-light samples 0 and 1.
  const frames = [
    { status: [HIT, HIT, HIT, HIT], normal: [false, false, false, false], lighting: [0, 0, 0, 0] },
    { status: [HIT, MISS, HIT, HIT], normal: [true, false, true, false], lighting: [0, 0, 0, 0] },
    { status: [MISS, MISS, HIT, HIT], normal: [false, false, true, true], lighting: [0, 0, AO, SHADOW] },
  ];
  const h = await rig();
  let ordinal = 0;
  const normalBytes = flags => { const d = new Uint16Array(flags.length * 4); flags.forEach((f, i) => { d[4 * i + 3] = f ? 0x3c00 : 0; }); return new Uint8Array(d.buffer); };
  h.hooks.before = (method, desc) => {
    if (method === 'present') ordinal++;
    if (method !== 'readback' || !desc.identity?.jobId) return;
    const frame = frames[ordinal], field = desc.fields[0];
    if (field === 'status') h.fake.stage(desc.source, words(frame.status));
    if (field === 'normal') h.fake.stage(desc.source, normalBytes(frame.normal));
    if (field === 'lightingStatus') h.fake.stage(desc.source, words(frame.lighting));
  };
  const s = scene(), r = request(changed(s, { sampling: { ...s.sampling, targetSamples: 2 } }), generation(), 'settled', { width: 4, height: 1 });
  const { report } = await h.finish(h.renderer.render(r));
  assert.equal(report.outcome, 'completed');
  const masks = report.outcomeMasks;
  assert.ok(masks, 'the report retains the outcome masks');
  assert.equal(masks.accumulationKey, h.publications.at(-1).accumulationKey, 'the masks belong to the published accumulation identity');
  assert.notEqual(masks.accumulationKey, h.publications[0].accumulationKey, 'the direct sample is a different identity');
  assert.deepEqual(masks.samples.map(x => [x.sample, x.hits, x.unavailableNormals, x.lightingUnresolved]), [[0, 3, 1, 0], [1, 2, 0, 2]]);
  assert.deepEqual(masks.union, { samples: 2, pixels: 4, hits: 3, nonMiss: 3, primaryUnresolved: 0, numericalFailures: 0, unavailableNormals: 1, lightingUnresolved: 2, shadowUnresolved: 1, aoUnresolved: 1, lightingNumericalFailures: 0 });
  // B11b fix round 1: the reasons survive into the report, per sample and over the union.
  assert.equal(masks.reasons.samples.length, 2);
  assert.equal(masks.reasons.union.aoUnresolved.multiple + Object.entries(masks.reasons.union.aoUnresolved).filter(([k]) => k !== 'multiple').reduce((n, [, v]) => n + v, 0) >= 1, true, JSON.stringify(masks.reasons.union));
  assert.equal(Object.values(masks.reasons.union.shadowUnresolved).reduce((n, v) => n + v, 0) >= 1, true);
  // The legacy last-sample counts use the same joint hit/normal mask.
  assert.equal(report.unavailableNormals, 0); assert.deepEqual(report.lightingFailures, { shadow: 1, ao: 1, both: 0 });
  // A later request starts its own masks: nothing of this job's samples enters it.
  h.hooks.before = undefined;
  const again = request(changed(s, { sampling: { ...s.sampling, targetSamples: 1 }, appearance: { ...s.appearance, lightingQuality: 'direct' } }), generation(2), 'settled', { width: 4, height: 1 });
  const second = (await h.finish(h.renderer.render(again))).report.outcomeMasks;
  assert.equal(second.samples.length, 1); assert.equal(second.union.samples, 1);
  h.renderer.destroy();
});

// B11c (spec §11.4 rev 5.1): a recovering family (quaternion Julia) reads back the per-pixel recovery word with each
// sample's geometry, and the report keeps the recovery diagnostics per sample and over the union; other families do not.
test('a quaternion report keeps per-sample recovery diagnostics from a recovery readback; other families read none back', async () => {
  const { packRecoveryWord } = await import('../../src/space/render/webgpu/passes.js');
  const HIT = packStatus({ status: 0, reason: 0, subreason: 0, steps: 6 }), POINT = packStatus({ status: 2, reason: 1, subreason: 0, steps: 12 });
  const recovered = packRecoveryWord({ attempted: true, outcome: 'approximate hit', stop: 'none', midpoints: 2, encounters: 2 });
  const stopped = packRecoveryWord({ attempted: true, outcome: 'point-budget', stop: 'midpoint-limit', midpoints: 8, encounters: 6 });
  const h = await rig();
  const normalBytes = n => { const d = new Uint16Array(n * 4); for (let i = 0; i < n; i++) d[4 * i + 3] = 0x3c00; return new Uint8Array(d.buffer); };
  h.hooks.before = (method, desc) => {
    if (method !== 'readback' || !desc.identity?.jobId) return;
    const field = desc.fields[0];
    if (field === 'status') h.fake.stage(desc.source, words([HIT, POINT]));
    if (field === 'normal') h.fake.stage(desc.source, normalBytes(2));
    if (field === 'recovery') h.fake.stage(desc.source, words([recovered, stopped]));
  };
  const q = scene({ model: 'quaternion-julia' }), r = request(changed(q, { appearance: { ...q.appearance, lightingQuality: 'direct' }, sampling: { ...q.sampling, targetSamples: 2 } }), generation(), 'settled', { width: 2, height: 1 });
  const { report } = await h.finish(h.renderer.render(r));
  assert.equal(report.outcome, 'completed', report.reason);
  const recovery = report.outcomeMasks?.recovery;
  assert.ok(recovery, 'the quaternion report keeps the recovery diagnostics');
  assert.deepEqual(recovery.samples.map(x => [x.sample, x.attempts, x.outcomes['approximate hit'], x.stops['midpoint-limit'], x.midpoints, x.encounters]), [[0, 2, 1, 1, 10, 8], [1, 2, 1, 1, 10, 8]]);
  assert.deepEqual([recovery.union.samples, recovery.union.attempted], [2, 2]);
  const recoveryReads = jobId => h.submissions.filter(x => x.method === 'readback' && x.desc.identity.jobId === jobId && x.desc.fields[0] === 'recovery').length;
  assert.ok(recoveryReads(r.jobId) >= 2, 'one recovery readback per sample at least');
  h.hooks.before = undefined;
  const sphere = request(directScene(), generation(2), 'settled', { width: 2, height: 1 });
  const plain = (await h.finish(h.renderer.render(sphere))).report;
  assert.equal(recoveryReads(sphere.jobId), 0); assert.equal(plain.outcomeMasks.recovery, null);
  h.renderer.destroy();
});

test('the first settled direct-light image and full-quality completion are separate milestones', async () => {
  const h = await rig(), r = request(scene(), generation(), 'settled');
  const start = h.clock.now(), job = h.renderer.render(r); await h.until(() => h.publications.length === 1);
  assert.equal(h.publications[0].kind, 'settled-first'); const first = h.clock.now() - start;
  const { report } = await h.finish(job);
  assert.ok(report.milestones.settledFirstImageMs <= first); assert.ok(report.milestones.fullQualityMs > first);
  assert.equal(h.presents.length, 9); assert.ok(h.presents.every(x => x.evidence === 'presenter-queue-completion')); h.renderer.destroy();
});

test('a loss during tracing settles interrupted and publishes nothing', async () => {
  const h = await rig(), job = h.renderer.render(request()); await flush();
  assert.ok(batches(h, job.jobId).some(x => x.pass === 'trace')); h.fake.lose({ reason: 'injected' });
  const result = await h.finish(job); assert.equal(result.outcome, 'interrupted'); assert.deepEqual(h.publications, []);
  assert.equal(result.report.rayTermination, 'unavailable'); h.renderer.destroy();
});

test('accumulation order is ascending sample index whatever the completion order', async () => {
  const sums = [];
  for (const order of ['oldest', 'newest']) {
    const h = await rig(), r = request(directScene(8), generation(), 'settled', { width: 1024, height: 384 });
    await h.finish(h.renderer.render(r), order);
    const perPixel = Array.from({ length: r.output.width * r.output.height }, () => []);
    const accumulated = new Float32Array(perPixel.length);
    for (const b of batches(h, r.jobId).filter(x => x.pass === 'accumulate')) {
      for (let y = b.region.y; y < b.region.y + b.region.height; y++) for (let x = b.region.x; x < b.region.x + b.region.width; x++) {
        const i = y * r.output.width + x; perPixel[i].push(b.sample.index);
        // Independent arithmetic oracle: additions sensitive to order, indexed by geometry jitter.
        const jitter = sampleJitter({ seed: b.sample.seed, sampleIndex: b.sample.index, pixel: [x, y] });
        const value = Math.fround([1e8, 1, -1e8, 0.25][b.sample.index % 4] + jitter.dx);
        accumulated[i] = Math.fround(accumulated[i] + value);
      }
    }
    for (const indices of perPixel) assert.deepEqual(indices, [0, 1, 2, 3, 4, 5, 6, 7]);
    sums.push(Buffer.from(accumulated.buffer)); h.renderer.destroy();
  }
  assert.deepEqual(sums[0], sums[1]);
});

test('every submission carries a consumed admission lease', async () => {
  const h = await rig(); await h.finish(h.renderer.render(request()));
  assert.ok(h.submissions.some(x => x.method === 'readback')); assert.ok(h.submissions.some(x => x.method === 'present'));
  const leases = new Set(); for (const item of h.submissions) { assert.equal(item.admission.consume(), false); leases.add(item.admission); }
  assert.equal(leases.size, h.submissions.length); assert.ok(h.reports.at(-1).allocation.outstandingBatchesMax <= 2); h.renderer.destroy();
});

test('a pick for an older geometry revision or other dimensions is stale', async () => {
  const h = await rig(), r = request(scene(), generation(), 'settled'); const job = h.renderer.render(r);
  await h.until(() => h.publications.length === 1);
  const base = { identity: identity(r), pixel: [0, 0], dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: 0 };
  for (const patch of [{ dimensions: { width: 2, height: 2 } }, { identity: { ...identity(r), generation: generation(0) }, geometryRevision: 0 }, { sampleIndex: 63 }]) {
    const before = h.submissions.length;
    assert.deepEqual(await auxiliaryResult(h, h.renderer.pick(createPickRequest({ ...base, ...patch }))), { stale: true });
    assert.equal(h.submissions.length, before, 'an invalid sample issues no auxiliary work');
  }
  await h.finish(job);
  assert.deepEqual(await auxiliaryResult(h, h.renderer.pick(createPickRequest(base))), { stale: true }, 'sample zero is stale after the published sample advances'); h.renderer.destroy();
});

test('the model is resolved from each request', async () => {
  const h = await rig();
  for (const [n, model] of ['sphere', 'mandelbulb', 'quaternion-julia'].entries()) {
    const r = request(scene({ model }), generation(n + 1)); const { report } = await h.finish(h.renderer.render(r));
    assert.equal(report.model.id, model); assert.equal(report.estimator.category, model === 'sphere' ? 'exact-distance' : 'heuristic');
    assert.deepEqual(report.parameters.requested, r.sceneSnapshot.parameters);
  }
  h.renderer.destroy();
});

test('a direct-only one-sample settled request completes at its first image without secondary-light submissions', async () => {
  const h = await rig(), r = request(directScene(), generation(), 'settled'), result = await h.finish(h.renderer.render(r));
  assert.equal(result.outcome, 'completed'); assert.equal(h.publications.length, 1);
  assert.equal(result.report.milestones.settledFirstImageMs, result.report.milestones.fullQualityMs);
  for (const b of batches(h, r.jobId)) { assert.equal(b.bounds.shadowRays, 0); assert.equal(b.bounds.aoSamples, 0); }
  h.renderer.destroy();
});

test('classifyEffectiveCamera rejects a stale identity', async () => {
  const h = await rig(), a = request(), b = request(scene({ model: 'box' }), generation(2));
  const first = h.renderer.render(a); await flush(); const second = h.renderer.render(b);
  const classifications = () => h.submissions.filter(value => value.desc.pipelineId === 'points-sphere').length;
  const before = classifications(); assert.deepEqual(await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(a)), { stale: true });
  assert.equal(classifications(), before); await h.finish(second); await h.finish(first);
  let classification; h.renderer.classifyEffectiveCamera(b).then(value => { classification = value; });
  await h.until(() => classification); assert.equal(classification.status, 'unresolved'); h.renderer.destroy();
});

test('preparation forwards the receipt only after an admitted ATLS readback and rejects a mismatch', async () => {
  const good = await rig(); assert.deepEqual(good.receipt, { epoch: 1, pipelineSetId: fixture.id, preparedPipelineIds: fixture.descriptors.map(x => x.pipelineId) });
  assert.deepEqual(good.submissions.map(x => x.method), ['submitBatch', 'readback']); good.renderer.destroy();
  const bad = await rig({ probe: 0 }); assert.equal(bad.failure.code, 'preparation-failed'); assert.equal(bad.receipt, undefined); bad.renderer.destroy();
});

test('diagnostic modes bypass decorative lighting', async () => {
  const h = await rig();
  for (const [i, mode] of ['normals', 'depth', 'steps', 'termination'].entries()) {
    const s = directScene(), r = request(changed(s, { appearance: { ...s.appearance, viewMode: mode, lightingQuality: 'full' } }), generation(i + 1), 'settled');
    await h.finish(h.renderer.render(r)); const shade = batches(h, r.jobId).filter(x => x.pass === 'shade');
    assert.ok(shade.length); assert.ok(shade.every(x => x.pipelineId === `diagnostic-${mode}` && x.bounds.shadowRays === 0 && x.bounds.aoSamples === 0));
  }
  h.renderer.destroy();
});

test('readbacks subdivide horizontally before admission under the granted maxBufferSize', async () => {
  const h = await rig({ limits: { maxBufferSize: 1024 } }); const r = request(directScene(), generation(), 'settled', { width: 1024, height: 2 });
  assert.equal((await h.finish(h.renderer.render(r))).outcome, 'completed');
  const reads = h.submissions.filter(x => x.method === 'readback' && x.desc.identity.jobId === r.jobId);
  assert.ok(reads.some(x => x.desc.region.x > 0));
  for (const { desc } of reads) assert.ok(Math.ceil(desc.region.width * (desc.fields[0] === 'normal' ? 8 : 4) / 256) * 256 * desc.region.height <= 1024);
  h.renderer.destroy();
});

test('cancellation drains tickets and releases obsolete working targets without releasing the published display', async () => {
  const h = await rig(); await h.finish(h.renderer.render(request())); const published = h.submissions.filter(x => x.method === 'present').at(-1).desc.display;
  const job = h.renderer.render(request(scene({ model: 'box' }), generation(2))); await flush();
  const cancelling = h.renderer.cancel(job.jobId); assert.equal(cancelling.accepted, true); let drained = false; cancelling.done.then(() => { drained = true; });
  await flush(); assert.equal(drained, false); await h.finish(job); assert.equal((await cancelling.done).submitted, 'drained');
  assert.ok(!h.fake.log.some(x => x.method === 'release' && x.args[0] === published));
  h.renderer.destroy(); h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
});

test('pending status is synchronous and settled timing includes configuration delay', async () => {
  const h = await rig({ holdConfiguration: true }), r = request(directScene(), generation(), 'settled');
  const start = h.clock.now(), job = h.renderer.render(r); h.clock.advance(50); h.releaseConfiguration();
  const { report } = await h.finish(job); assert.ok(report.milestones.settledFirstImageMs >= 50);
  assert.ok(report.timings.admitted >= 50); assert.ok(report.timings.published >= h.publications[0].publishedAt - start); h.renderer.destroy();
});

test('the P3 settled plan bounds pending windows, samples and adaptation replacement frequency', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../reference/performance-workload.json', import.meta.url), 'utf8'));
  const h = await rig(), s = sceneCodec.parse(JSON.stringify(manifest.scenes[0].scene));
  const r = request(s, generation(), 'settled', { width: 1280, height: 720 }), job = h.renderer.render(r);
  let result; job.done.then(value => { result = value; });
  for (let i = 0; !result && i < 20000; i++) {
    await h.complete(i % 2 ? 'oldest' : 'newest', [17, 35].includes(i) ? 24 : 8);
    const plan = h.plans.find(x => x.request.jobId === r.jobId);
    if (plan) {
      const d = plan.diagnostics(); assert.ok(d.pendingCount <= 256); assert.ok(d.pendingSamples.length <= 1);
      assert.ok(d.replacements <= Math.floor(d.completions / 8) + d.boundaryReplacements);
    }
  }
  assert.equal(result?.outcome, 'completed'); assert.equal(h.publications.at(-1).samples, 8); h.renderer.destroy();
});

test('Update selects a paused request before asynchronous target configuration completes', async () => {
  const h = await rig({ holdConfiguration: true });
  h.scheduler.pause('space');
  const job = h.renderer.render(request(directScene(), generation(), 'settled'));
  h.scheduler.update('space');
  const view = h.scheduler.snapshot().views.find(value => value.viewId === 'space');
  assert.equal(view.updating, job.jobId, 'the frozen request must already be selectable while its resources are preparing');
  assert.equal(h.scheduler.snapshot().outstanding, 0, 'readiness is not admission');
  h.scheduler.hidden('space', true);
  h.releaseConfiguration(); await flush();
  assert.equal(h.scheduler.snapshot().outstanding, 0, 'ready work must still obey view eligibility');
  h.scheduler.hidden('space', false);
  assert.ok(batches(h, job.jobId).some(value => value.pass === 'trace'), 'an eligible lease is submitted synchronously');
  assert.equal((await h.finish(job)).outcome, 'completed');
  assert.equal(h.scheduler.snapshot().views.find(value => value.viewId === 'space').paused, true);
  h.renderer.destroy();
});


test('sustained slow evidence bounds subdivision and completes a long sample stream', async () => {
  const h = await rig(), r = request(directScene(8), generation(), 'settled', { width: 1024, height: 384 });
  const job = h.renderer.render(r); let result;
  job.done.then(value => { result = value; });
  // A fourfold maximum subdivision is 48 tiles per pass, eight passes per sample.
  const maximum = 8 * (8 * 48 + 1);
  for (let i = 0; !result && i <= maximum; i++) {
    await h.complete(i % 2 ? 'oldest' : 'newest', 80);
    const d = h.plans.find(plan => plan.request.jobId === r.jobId).diagnostics();
    assert.ok(d.pendingCount <= 256); assert.ok(d.pendingSamples.length <= 1);
    assert.ok(d.replacements <= Math.floor(d.completions / 8) + d.boundaryReplacements);
  }
  assert.equal(result?.outcome, 'completed', 'slow evidence must not turn a bounded image into unbounded tiny operations');
  const d = h.plans.find(plan => plan.request.jobId === r.jobId).diagnostics();
  assert.ok(d.completions > 1000, 'exercise a long, continuously slow completion stream');
  assert.ok(d.completions <= maximum);
  assert.ok(d.replacements > d.boundaryReplacements, 'the stream exercises adaptation within windows');
  const accumulation = batches(h, r.jobId).filter(value => value.pass === 'accumulate');
  for (let sample = 0; sample < 8; sample++) {
    const tiles = accumulation.filter(value => value.sample.index === sample);
    const coverage = new Uint8Array(r.output.width * r.output.height);
    for (const { region } of tiles) for (let y = region.y; y < region.y + region.height; y++) for (let x = region.x; x < region.x + region.width; x++) coverage[y * r.output.width + x]++;
    assert.ok(coverage.every(count => count === 1), 'every sample covers each pixel exactly once across window replacements');
  }
  h.renderer.destroy();
});

test('a shared scheduler dispatches each lease to the renderer that owns its view', async () => {
  const h = await rig(), publications = [];
  const other = createSpaceRenderer({ backend: h.backend, scheduler: h.scheduler, clock: h.clock, viewId: 'other', versions, pipelineSet: fixture });
  other.onPublish(value => publications.push(value));
  let prepared;
  other.prepare().then(value => { prepared = value; }); await flush(); h.fake.finishPrepare();
  await h.until(() => prepared);
  const a = request(directScene(), generation(), 'settled', { width: 1024, height: 256 });
  const b = createSpaceRequest({ scene: directScene(), purpose: 'interactive', width: 1024, height: 256, profile: 'settled', generation: generation(), viewId: 'other', versions });
  const jobs = [h.renderer.render(a), other.render(b)];
  assert.equal((await h.finish(jobs[0], 'newest')).outcome, 'completed');
  assert.equal((await h.finish(jobs[1])).outcome, 'completed');
  assert.deepEqual(h.publications.map(value => value.requestId), [a.requestId]);
  assert.deepEqual(publications.map(value => value.requestId), [b.requestId]);
  const leases = new Set(h.submissions.map(value => value.admission));
  assert.equal(leases.size, h.submissions.length);
  h.renderer.destroy();
  const next = createSpaceRequest({ scene: scene({ model: 'box' }), purpose: 'interactive', width: 16, height: 8, profile: 'draft', generation: generation(2), viewId: 'other', versions });
  assert.equal((await h.finish(other.render(next))).outcome, 'completed', 'destroying one view must preserve the other view and its backend');
  other.destroy(); h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
});

test('outstanding accounting retires completion before synchronous replenishment and includes readback copy-out', async () => {
  const h = await rig({ holdReadbacks: true }), r = request(directScene(), generation(), 'settled', { width: 1024, height: 256 });
  let peak = 0;
  const unsubscribe = h.scheduler.subscribe(() => { peak = Math.max(peak, h.scheduler.snapshot().outstanding); });
  const job = h.renderer.render(r);
  await h.until(() => h.tickets.filter(value => value.pending && value.method === 'readback').length === 2);
  await h.complete('newest'); await h.complete('oldest');
  assert.equal(h.tickets.filter(value => value.pending).length, 0, 'both queue fences have completed');
  assert.equal(h.scheduler.snapshot().outstanding, 2, 'leases remain outstanding while readback copy-out is pending');
  h.releaseReadbacks();
  const result = await h.finish(job, 'newest');
  assert.equal(result.outcome, 'completed'); assert.equal(peak, 2);
  assert.equal(result.report.allocation.outstandingBatchesMax, peak, 'replenishment cannot double-count the retired lease');
  assert.equal(h.scheduler.snapshot().outstanding, 0);
  assert.ok(h.submissions.filter(value => value.method === 'readback').every(value => !value.pending));
  unsubscribe(); h.renderer.destroy();
});

test('a fresh pick returns depth and the exact camera, pixel and sample jitter through auxiliary admission', async () => {
  const h = await rig({ statusWords: [packStatus({ status: 0, reason: 0, subreason: 0, steps: 5 })], depths: [3.25] });
  const r = request(scene(), generation(), 'settled'), job = h.renderer.render(r);
  await h.until(() => h.publications.length === 1);
  const pick = createPickRequest({ identity: identity(r), pixel: [2, 1], dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: 0 });
  const before = h.submissions.length; let result;
  h.renderer.pick(pick).then(value => { result = value; });
  await h.until(() => result);
  assert.deepEqual(result, { identity: identity(r), status: 'approximate hit', depth: 3.25,
    sample: { camera: r.sceneSnapshot.camera, pixel: [2, 1], jitter: sampleJitter({ seed: r.quality.sampling.seed, sampleIndex: 0, pixel: [2, 1] }), dimensions: r.quality.internalSize } });
  const reads = h.submissions.slice(before).filter(value => value.method === 'readback' && value.desc.region.width === 1 && value.desc.region.height === 1);
  assert.deepEqual(reads.map(value => value.desc.fields), [['status'], ['depth']]);
  assert.ok(reads.every(value => value.admission.consume() === false));
  assert.equal((await h.finish(job)).outcome, 'completed'); h.renderer.destroy();
});

test('a fresh effective camera classification evaluates and reads back through auxiliary admission', async () => {
  const h = await rig({ classificationWords: pointResultWords() }), r = request(scene(), generation(), 'settled');
  const job = h.renderer.render(r); await flush(); let result;
  h.renderer.classifyEffectiveCamera(r).then(value => { result = value; });
  await h.until(() => result);
  assert.deepEqual(result, { identity: identity(r), status: 'exterior', detail: { source: 'evaluate_points', result: { status: 'valid', distance: 1, applicability: 'exterior' } } });
  const evaluated = h.submissions.find(value => value.desc.pipelineId === 'points-sphere');
  const readback = h.submissions.find(value => value.method === 'readback' && value.desc.fields.includes('cameraClassification'));
  assert.equal(evaluated.admission.consume(), false); assert.equal(readback.admission.consume(), false);
  assert.deepEqual(evaluated.desc.identity, identity(r)); assert.deepEqual(readback.desc.identity, identity(r));
  assert.ok(h.submissions.indexOf(evaluated) < h.submissions.indexOf(readback));
  assert.equal((await h.finish(job)).outcome, 'completed'); h.renderer.destroy();
});


test('late configuration readiness cannot revive cancelled, lost or destroyed requests', async () => {
  for (const action of ['cancel', 'loss', 'destroy']) {
    const h = await rig({ holdConfiguration: true }), r = request(directScene(), generation(), 'settled');
    const job = h.renderer.render(r); await flush();
    assert.equal(h.scheduler.snapshot().jobs.length, 1);
    if (action === 'cancel') {
      const cancellation = h.renderer.cancel(job.jobId);
      assert.equal(cancellation.accepted, true);
      assert.deepEqual(await cancellation.done, { outcome: 'cancelled', submitted: 'none' });
    } else if (action === 'loss') h.fake.lose({ reason: 'configuration pending' });
    else h.renderer.destroy();
    assert.equal((await job.done).outcome, action === 'cancel' ? 'cancelled' : 'interrupted');
    h.releaseConfiguration(); await flush();
    assert.equal(h.submissions.filter(value => value.desc.identity.jobId === r.jobId).length, 0);
    assert.equal(h.publications.length, 0); assert.equal(h.scheduler.snapshot().outstanding, 0);
    assert.equal(h.scheduler.snapshot().jobs.length, 0);
    h.renderer.destroy(); h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
  }
});

test('configuration failure retires the early scheduler registration and reports failure', async () => {
  const h = await rig({ rejectConfiguration: true }), r = request(directScene(), generation(), 'settled');
  const result = await h.finish(h.renderer.render(r));
  assert.equal(result.outcome, 'failed'); assert.match(result.reason, /configuration failure/);
  assert.equal(result.report.outcome, 'failed'); assert.equal(result.report.rayTermination, 'unavailable');
  assert.equal(h.scheduler.snapshot().jobs.length, 0); assert.equal(h.scheduler.snapshot().outstanding, 0);
  assert.equal(h.submissions.filter(value => value.desc.identity.jobId === r.jobId).length, 0);
  h.renderer.destroy();
});

test('a scheduler view has exactly one renderer dispatch owner', async () => {
  const h = await rig();
  assert.throws(() => createSpaceRenderer({ backend: h.backend, scheduler: h.scheduler, clock: h.clock, viewId: 'space', versions, pipelineSet: fixture }), /already has a renderer/);
  assert.equal((await h.finish(h.renderer.render(request()))).outcome, 'completed');
  h.renderer.destroy(); h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
});

test('a stale auxiliary readback is rejected without failing the settled render', async () => {
  const h = await rig({ stalePickReadback: true }), r = request(scene(), generation(), 'settled');
  const job = h.renderer.render(r); await h.until(() => h.publications.length === 1);
  let result;
  h.renderer.pick(createPickRequest({ identity: identity(r), pixel: [0, 0], dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: 0 })).then(value => { result = value; });
  await h.until(() => result);
  assert.deepEqual(result, { stale: true }); assert.equal((await h.finish(job)).outcome, 'completed');
  h.renderer.destroy();
});


// B09-F1: a pick identifies the displayed snapshot, including after job cleanup.
test('F1 completed draft and settled publications retain their exact pick geometry', async () => {
  for (const profile of ['draft', 'settled']) {
    const h = await rig({ depths: [4.5], statusWords: [0] });
    const r = request(profile === 'draft' ? directScene() : directScene(2), generation(), profile);
    h.hooks.before = (method, desc) => {
      if (method === 'submitBatch' && desc.pass === 'trace' && desc.identity.jobId === r.jobId) {
        const size = r.quality.internalSize;
        h.fake.stage(desc.outputs.depth, new Uint8Array(Float32Array.from({ length: size.width * size.height }, () => 4.5 + desc.sample.index).buffer));
      }
    };
    await h.finish(h.renderer.render(r));
    const publication = h.publications.at(-1), expectedSample = profile === 'draft' ? 0 : 1;
    assert.equal(publication.sampleIndex, expectedSample);
    let result;
    h.renderer.pick(createPickRequest({ identity: identity(r), pixel: [0, 0], dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: expectedSample })).then(value => { result = value; });
    await h.until(() => result);
    assert.equal(result.status, 'approximate hit'); assert.equal(result.depth, 4.5 + expectedSample);
    assert.deepEqual(result.sample.jitter, sampleJitter({ seed: r.quality.sampling.seed, sampleIndex: expectedSample, pixel: [0, 0] }));
    const configure = h.backend.configureTargets; let release;
    const waiting = new Promise(resolve => { release = resolve; });
    h.backend.configureTargets = async desc => { await waiting; return configure(desc); };
    const replacement = h.renderer.render(request(scene({ model: 'box' }), generation(2)));
    result = undefined;
    h.renderer.pick(createPickRequest({ identity: identity(r), pixel: [0, 0], dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: expectedSample })).then(value => { result = value; });
    await h.until(() => result); assert.equal(result.depth, 4.5 + expectedSample, 'the retained published identity remains pickable while its replacement prepares');
    release(); await h.finish(replacement);
    h.renderer.destroy(); h.fake.destroy();
  }
});

test('F1 retained published geometry survives refinement and is invalidated during a replaced pick', async () => {
  const h = await rig({ depths: [2.5] }), r = request(directScene(3), generation(), 'settled');
  const job = h.renderer.render(r); await h.until(() => h.publications.length === 1);
  const firstTrace = batches(h, r.jobId).find(value => value.pass === 'trace');
  const pinned = [firstTrace.outputs.status, firstTrace.outputs.depth];
  await flush();
  assert.ok(batches(h, r.jobId).filter(value => value.pass === 'trace' && value.sample.index === 1).every(value => !Object.values(value.outputs).some(handle => pinned.includes(handle))));
  let result;
  const pick = createPickRequest({ identity: identity(r), pixel: [0, 0], dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: 0 });
  h.renderer.pick(pick).then(value => { result = value; }); await h.until(() => result);
  assert.equal(result.depth, 2.5);
  await h.finish(job);
  const latest = { ...pick, sampleIndex: 2 }; result = undefined;
  h.hooks.after = (method, desc, ticket) => {
    if (method === 'readback' && desc.fields.includes('depth')) return { ...ticket, result: ticket.result.then(async value => { await blocked; return value; }) };
  };
  let release; const blocked = new Promise(resolve => { release = resolve; });
  h.renderer.pick(latest).then(value => { result = value; }); await h.complete();
  const replacement = request(scene({ model: 'box' }), generation(2)); await h.finish(h.renderer.render(replacement));
  release(); await h.until(() => result); assert.deepEqual(result, { stale: true });
  const before = h.submissions.length;
  assert.deepEqual(await h.renderer.pick(latest), { stale: true }); assert.equal(h.submissions.length, before);
  h.renderer.destroy(); h.fake.destroy();
});

test('F1 refinement never writes the published depth or status handles between publications', async () => {
  const h = await rig(), r = request(directScene(4), generation(), 'settled');
  let publishedGeometry = [], observed = 0;
  const violations = [], refinementSamples = new Set();
  h.renderer.onPublish(publication => {
    const trace = batches(h, r.jobId).find(batch => batch.pass === 'trace' && batch.sample.index === publication.sampleIndex);
    assert.ok(trace, 'every publication has traced geometry');
    publishedGeometry = [trace.outputs.depth, trace.outputs.status];
  });
  h.hooks.before = (method, desc) => {
    if (method !== 'submitBatch' || !publishedGeometry.length || !['trace', 'normals'].includes(desc.pass)) return;
    observed++; refinementSamples.add(desc.sample.index);
    for (const handle of Object.values(desc.outputs)) if (publishedGeometry.includes(handle)) {
      violations.push({ sample: desc.sample.index, pass: desc.pass, handle });
    }
  };
  assert.equal((await h.finish(h.renderer.render(r))).outcome, 'completed');
  assert.deepEqual(h.publications.map(value => value.sampleIndex), [0, 1, 2, 3]);
  assert.deepEqual([...refinementSamples], [1, 2, 3], 'observe actual submissions across both geometry sets and reuse');
  assert.ok(observed >= 6, 'trace and normals run after each earlier publication');
  assert.deepEqual(violations, [], 'refinement must not overwrite geometry still used by the published image');
  h.renderer.destroy(); h.fake.destroy();
});

test('F2 every auxiliary rejection uses discardAuxiliary without failing its owner', async () => {
  for (const operation of ['pick', 'classify']) for (const failure of ['submit', 'ticket', 'copy-out']) {
    const h = await rig(), r = request(scene(), generation(), 'settled');
    const job = h.renderer.render(r); await h.until(() => h.publications.length === 1);
    const isAux = (method, desc) => operation === 'pick'
      ? method === 'readback' && desc.region.width === 1 && desc.region.height === 1
      : failure === 'copy-out' ? method === 'readback' && desc.fields.includes('cameraClassification') : desc.pipelineId === 'points-sphere';
    h.hooks.before = (method, desc) => { if (isAux(method, desc) && failure === 'submit') throw new Error('injected auxiliary rejection'); };
    h.hooks.after = (method, desc, ticket) => {
      if (!isAux(method, desc)) return;
      if (failure === 'ticket') return { ...ticket, done: ticket.done.then(() => ({ outcome: 'failed', reason: 'injected after fence', timing: { elapsedMs: null } })) };
      if (failure === 'copy-out') return { ...ticket, result: ticket.result.then(() => { throw new Error('injected copy-out rejection'); }) };
    };
    let result;
    const pending = operation === 'pick' ? h.renderer.pick(createPickRequest({ identity: identity(r), pixel: [0, 0], dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: 0 })) : h.renderer.classifyEffectiveCamera(r);
    pending.then(value => { result = value; }); await h.until(() => result);
    if (operation === 'pick') assert.deepEqual(result, { stale: true });
    else {
      assert.equal(result.status, 'unresolved'); assert.equal(result.stale, undefined);
      assert.match(result.detail.error.message, /injected/);
    }
    assert.equal(h.discarded.length, 1, `${operation}/${failure}`);
    assert.equal((await h.auxiliaryJobs.at(-1).done).outcome, 'failed', 'the rejected auxiliary owns the failed outcome');
    assert.equal(h.failed.length, 0); const completed = await h.finish(job); assert.equal(completed.outcome, 'completed');
    const completedFences = h.submissions.filter(value => value.desc.identity.jobId === r.jobId).length - (failure === 'ticket' ? 1 : 0);
    assert.equal(completed.report.gpuTiming.queueElapsedMs, completedFences * 8, 'completed auxiliary fences retain their timing even when copy-out is rejected');
    h.renderer.destroy(); h.fake.destroy();
  }
});

test('F2 discard refuses main-job leases without changing their plan or accounting', async () => {
  const h = await rig(), r = request(directScene(2), generation(), 'settled');
  const job = h.renderer.render(r); await flush();
  const main = h.tickets.find(value => value.pending && value.desc.identity.jobId === r.jobId);
  assert.ok(main);
  const before = h.scheduler.snapshot(), plan = h.plans.find(value => value.request.jobId === r.jobId), diagnostics = plan.diagnostics();
  assert.equal(h.scheduler.discardAuxiliary(main.admission, { reason: 'main lease is not auxiliary' }), false);
  assert.deepEqual(h.scheduler.snapshot(), before); assert.deepEqual(plan.diagnostics(), diagnostics);
  assert.equal((await h.finish(job)).outcome, 'completed');
  h.renderer.destroy(); h.fake.destroy();
});

test('F2 discarding an auxiliary does not postpone the outstanding main lease watchdog', async () => {
  const h = await rig(), r = request(directScene(2), generation(), 'settled');
  const job = h.renderer.render(r); await flush();
  h.hooks.after = (method, desc, ticket) => desc.pipelineId === 'points-sphere'
    ? { ...ticket, done: ticket.done.then(() => ({ outcome: 'failed', reason: 'auxiliary fence failed' })) } : undefined;
  const pending = h.renderer.classifyEffectiveCamera(r); await flush();
  const auxiliary = h.tickets.find(value => value.pending && value.desc.pipelineId === 'points-sphere');
  assert.ok(auxiliary); assert.equal(h.scheduler.snapshot().outstanding, 2);
  h.scheduler.pause('space'); // The lease watchdog continues while elapsed-work accounting is paused.
  h.clock.advance(4000); h.fake.complete(auxiliary.ticket, { elapsedMs: 8 }); await flush();
  const unresolved = await pending;
  assert.equal(unresolved.status, 'unresolved'); assert.equal(unresolved.detail.error.message, 'auxiliary fence failed');
  assert.equal(h.scheduler.snapshot().outstanding, 1);
  h.clock.advance(1000); await flush();
  assert.equal(h.scheduler.snapshot().stalled, true, 'discard is terminal drain evidence, not progress that resets the watchdog');
  const result = await job.done;
  assert.equal(result.outcome, 'budget-exceeded'); assert.equal(result.reason, 'watchdog');
  h.renderer.destroy(); h.fake.destroy();
});

test('F2 discarded auxiliary cancellation waits for the main fence and observed loss wins a partial drain', async () => {
  for (const loss of [false, true]) {
    const h = await rig(), r = request(directScene(2), generation(), 'settled');
    const job = h.renderer.render(r); await flush();
    h.hooks.after = (method, desc, ticket) => desc.pipelineId === 'points-sphere'
      ? { ...ticket, done: ticket.done.then(() => ({ outcome: 'failed', reason: 'rejected after cancellation' })) } : undefined;
    const pending = h.renderer.classifyEffectiveCamera(r); await flush();
    const auxiliary = h.tickets.find(value => value.pending && value.desc.pipelineId === 'points-sphere');
    const main = h.tickets.find(value => value.pending && value !== auxiliary);
    assert.ok(auxiliary); assert.ok(main);
    let cancelled, auxiliaryOutcome;
    const cancellation = h.renderer.cancel(r.jobId); cancellation.done.then(value => { cancelled = value; });
    h.auxiliaryJobs.at(-1).done.then(value => { auxiliaryOutcome = value; });
    h.fake.complete(auxiliary.ticket, { elapsedMs: 8 }); await flush();
    assert.deepEqual(await pending, { stale: true }); assert.equal(h.discarded.length, 1);
    assert.equal(cancelled, undefined); assert.equal(auxiliaryOutcome, undefined);
    assert.equal(h.scheduler.snapshot().outstanding, 1);
    if (loss) h.fake.lose({ reason: 'loss during partial drain' }); else h.fake.complete(main.ticket, { elapsedMs: 8 });
    await flush();
    assert.deepEqual(cancelled, { outcome: 'cancelled', submitted: loss ? 'interrupted' : 'drained' });
    assert.equal((await job.done).outcome, 'cancelled');
    assert.equal(auxiliaryOutcome.outcome, 'cancelled'); assert.equal(auxiliaryOutcome.submitted, cancelled.submitted);
    assert.equal(h.scheduler.snapshot().outstanding, 0); assert.deepEqual(h.scheduler.snapshot().jobs, []);
    assert.equal(h.failed.length, 0); h.renderer.destroy(); h.fake.destroy();
  }
});

test('F2 a false discard after duplicate retirement or loss still releases local auxiliary ownership', async () => {
  for (const loss of [false, true]) {
    const h = await rig(), r = request(directScene(2), generation(), 'settled');
    const job = h.renderer.render(r); await flush();
    const buffers = [];
    h.hooks.before = (method, desc, { admission }) => {
      if (desc.pipelineId !== 'points-sphere') return;
      buffers.push(desc.inputs.points, desc.outputs.results);
      if (loss) h.fake.lose({ reason: 'loss before auxiliary submission' });
      else assert.equal(h.scheduler.discardAuxiliary(admission, { reason: 'already rejected' }), true);
      throw new Error('late auxiliary rejection');
    };
    const result = await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(r));
    if (loss) assert.deepEqual(result, { stale: true });
    else { assert.equal(result.status, 'unresolved'); assert.equal(result.detail.error.message, 'late auxiliary rejection'); }
    assert.equal(h.discarded.at(-1).accepted, false, 'the real scheduler refuses the now-retired lease');
    assert.equal(h.failed.length, 0);
    assert.equal((await h.finish(job)).outcome, loss ? 'interrupted' : 'completed');
    assert.equal(h.scheduler.snapshot().outstanding, 0); assert.deepEqual(h.scheduler.snapshot().jobs, []);
    if (!loss) for (const handle of buffers) assert.ok(h.fake.log.some(value => value.method === 'release' && value.args[0] === handle));
    h.renderer.destroy(); h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
  }
});

test('F11 a queued auxiliary rechecks its snapshot at dispatch before backend submission', async () => {
  const h = await rig(), r = request(); await h.finish(h.renderer.render(r));
  h.scheduler.pause('space');
  const before = h.submissions.length;
  const pending = h.renderer.pick(createPickRequest({ identity: identity(r), pixel: [0, 0], dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: 0 }));
  await flush(); assert.equal(h.submissions.length, before);
  h.hooks.epoch = 0; h.scheduler.resume('space');
  assert.deepEqual(await auxiliaryResult(h, pending), { stale: true });
  assert.equal(h.submissions.length, before, 'a snapshot invalidated during the admission wait must not reach the backend');
  assert.equal(h.scheduler.snapshot().outstanding, 0); assert.equal(h.failed.length, 0);
  h.renderer.destroy(); h.fake.destroy();
});

async function structuralPlan(size) {
  const h = await rig({ structural: true });
  const r = request(directScene(), generation(), 'settled', size);
  h.renderer.render(r); await flush();
  return { h, r, plan: h.plans.find(value => value.request.jobId === r.jobId) };
}
const advance = (plan, op, elapsedMs = 8) => plan.advance(op, { epoch: 1, elapsedMs, targetMs: 8 });

test('F3 4K phases span bounded windows with exact coverage', async () => {
  const { h, r, plan } = await structuralPlan({ width: 3840, height: 2160 });
  const rows = new Map(), windows = new Map(); let lastPhase, lastBoundary;
  for (let i = 0; !plan.exhausted() && i < 15000; i++) {
    const op = plan.next(); assert.ok(op);
    const phase = op.batch?.pass ?? op.descriptor.fields?.[0] ?? 'present';
    const before = plan.diagnostics(); assert.ok(before.pendingCount <= 256); assert.ok(before.pendingSamples.length <= 1);
    if (phase !== 'present') {
      if (phase !== lastPhase || before.boundaryReplacements !== lastBoundary) windows.set(phase, (windows.get(phase) ?? 0) + 1);
      if (!rows.has(phase)) rows.set(phase, Array.from({ length: r.output.height }, () => []));
      const a = op.batch?.region ?? op.descriptor.region;
      for (let y = a.y; y < a.y + a.height; y++) rows.get(phase)[y].push([a.x, a.x + a.width]);
    }
    lastPhase = phase; lastBoundary = before.boundaryReplacements;
    advance(plan, op, 20);
    assert.ok(plan.diagnostics().pendingCount <= 256, 'appended windows obey the hard limit');
  }
  assert.equal(plan.exhausted(), true); assert.equal(rows.size, 8);
  for (const [phase, bands] of rows) {
    assert.ok(windows.get(phase) >= 2, `${phase} spans multiple windows`);
    for (const intervals of bands) {
      let end = 0;
      for (const [a, b] of intervals.sort((a, b) => a[0] - b[0])) { assert.equal(a, end, `${phase} has no holes or overlaps`); end = b; }
      assert.equal(end, r.output.width);
    }
  }
  h.renderer.destroy(); h.fake.destroy();
});

test('F3 adaptation respects both band edges after eight completions', async () => {
  for (const [elapsed, replacements] of [[20, 1], [15.2, 0], [3.2, 0], [4.8, 0]]) {
    const { h, plan } = await structuralPlan({ width: 1024, height: 1024 });
    for (let i = 0; i < 8; i++) advance(plan, plan.next(), i === 7 ? elapsed : 8);
    assert.equal(plan.diagnostics().replacements, replacements, `eighth completion at ${elapsed / 8}x`);
    let next;
    do { next = plan.next(); if (next.batch.pass === 'trace') advance(plan, next); } while (next.batch.pass === 'trace');
    assert.equal(next.batch.bounds.pixels, 32768, 'normal tiles have an independent workload estimate');
    h.renderer.destroy(); h.fake.destroy();
  }
});

test('F3 fast evidence caps tile growth and narrow readbacks never exceed 256 rows', async () => {
  const { h, plan } = await structuralPlan({ width: 4096, height: 2048 });
  let op;
  do { op = plan.next(); if (op.batch.pass === 'trace') advance(plan, op, 1); } while (op.batch.pass === 'trace');
  assert.equal(op.batch.bounds.pixels, 32768, 'fast trace evidence cannot enlarge another pass');
  h.renderer.destroy(); h.fake.destroy();
  const narrow = await rig();
  const r = request(directScene(), generation(), 'settled', { width: 1, height: 1024 });
  assert.equal((await narrow.finish(narrow.renderer.render(r))).outcome, 'completed');
  const reads = narrow.submissions.filter(value => value.method === 'readback' && value.desc.identity.jobId === r.jobId);
  assert.equal(reads.length, 12); assert.ok(reads.every(value => value.desc.region.height <= 256));
  narrow.renderer.destroy(); narrow.fake.destroy();
});

test('F4 stale identity at presentation cannot publish even without predecessor cancellation', async () => {
  for (const changedIdentity of ['request', 'generation', 'epoch']) {
    const h = await rig(); const r = request(directScene(), generation(), 'settled'); let live = r.generation, nextJob;
    h.hooks.after = (method, desc) => {
      if (method !== 'present' || desc.identity.jobId !== r.jobId) return;
      if (changedIdentity === 'generation') live = generation(2);
      else if (changedIdentity === 'epoch') h.hooks.epoch = 0;
      else {
        const next = createSpaceRequest({ scene: directScene(), purpose: 'export', width: 16, height: 8, profile: 'settled', generation: generation(), viewId: 'space', versions });
        nextJob = h.renderer.render(next);
      }
    };
    const result = await h.finish(h.renderer.render(r, { currentGeneration: () => live }));
    assert.equal(result.outcome, 'completed', 'submitted presentation can complete without publishing its stale identity');
    assert.ok(h.submissions.some(value => value.method === 'present' && value.desc.identity.jobId === r.jobId));
    assert.ok(!h.publications.some(value => value.requestId === r.requestId), changedIdentity);
    if (nextJob) await h.finish(nextJob);
    h.renderer.destroy(); h.fake.destroy();
  }
});

test('F4 staleness before dispatch cancels exactly and stale-epoch picks issue no leases', async () => {
  const h = await rig(), r = request(directScene(), generation(), 'settled'); let live = r.generation;
  const job = h.renderer.render(r, { currentGeneration: () => live }); await flush(); live = generation(2);
  assert.equal((await h.finish(job)).outcome, 'cancelled'); assert.equal(h.publications.length, 0);
  const next = request(directScene(), generation(3)); await h.finish(h.renderer.render(next));
  h.hooks.epoch = 0; const before = h.submissions.length;
  assert.deepEqual(await h.renderer.pick(createPickRequest({ identity: identity(next), pixel: [0, 0], dimensions: next.quality.internalSize, geometryRevision: 3, sampleIndex: 0 })), { stale: true });
  assert.equal(h.submissions.length, before); assert.equal(h.discarded.length, 0, 'a stale pick must be rejected before admission'); h.renderer.destroy(); h.fake.destroy();
});

test('F5 no refinement batch writes the currently published display', async () => {
  const h = await rig(), r = request(scene(), generation(), 'settled'); let display; const violations = [];
  h.renderer.onPublish(() => { display = h.submissions.filter(value => value.method === 'present').at(-1).desc.display; });
  h.hooks.before = (method, desc) => { if (method === 'submitBatch' && display && Object.values(desc.outputs).includes(display)) violations.push(desc.pass); };
  assert.equal((await h.finish(h.renderer.render(r))).outcome, 'completed'); assert.deepEqual(violations, []);
  h.renderer.destroy(); h.fake.destroy();
});

test('F6 same-size resize is null and render never reuses an execution identity', async () => {
  const h = await rig(); assert.equal(h.renderer.resize({ width: 16, height: 8 }), null);
  const r = request(); await h.finish(h.renderer.render(r));
  assert.equal(h.renderer.resize(r.output), null);
  assert.throws(() => h.renderer.render(r), /already/);
  const next = request();
  assert.throws(() => h.renderer.render({ ...next, jobId: r.jobId }), /already/);
  assert.throws(() => h.renderer.render({ ...next, requestId: r.requestId }), /already/);
  h.renderer.destroy(); h.fake.destroy();
});

test('F7 one-sample full light refines sample zero before the full-quality milestone', async () => {
  const h = await rig(), s = scene(), r = request(changed(s, { sampling: { ...s.sampling, targetSamples: 1 } }), generation(), 'settled');
  const result = await h.finish(h.renderer.render(r));
  assert.deepEqual(h.publications.map(value => value.quality.lighting.stage), ['direct', 'full']);
  assert.deepEqual(batches(h, r.jobId).filter(value => value.pass === 'accumulate').map(value => value.sample.index), [0, 0]);
  assert.equal(result.report.completed.lighting.stage, 'full');
  assert.ok(result.report.milestones.fullQualityMs > result.report.milestones.settledFirstImageMs);
  h.renderer.destroy(); h.fake.destroy();
});

test('F8 renderer teardown preserves injected backend and scheduler ownership', async () => {
  const h = await rig(); await h.finish(h.renderer.render(request()));
  const foreign = h.backend.allocate({ name: 'owner-resource', bytes: 16, usage: 'storage' });
  const epoch = h.backend.currentEpoch(); h.renderer.destroy();
  assert.equal(h.backend.currentEpoch(), epoch); assert.equal(h.scheduler.snapshot().epoch, epoch);
  assert.ok(!h.fake.log.some(value => value.method === 'release' && value.args[0] === foreign));
  assert.ok(!h.fake.log.some(value => value.method === 'destroy'));
  h.scheduler.registerView('external');
  h.backend.release(foreign); h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
});

// B09c uses the complete product descriptors. Only GPU execution is simulated:
// synthetic PointResult words let us exercise every status, including malformed results.
function pointResultWords({ status = 0, estimate = 0, log2DE = -2, distance = 1, applicability = 0 } = {}) {
  const data = new ArrayBuffer(64), u = new Uint32Array(data), f = new Float32Array(data);
  u[0] = status; u[1] = 17; u[2] = estimate; f[9] = log2DE; f[12] = distance; u[13] = applicability;
  return [...u];
}
const productPoints = h => h.submissions.filter(s => s.desc.pipelineId?.startsWith('points-'));
const classificationAllocations = h => h.fake.log.filter(e => e.method === 'allocate' && e.args[0].name.startsWith('camera-')).map(e => e.args[0]);

test('B09c every product family submits the B08 point ABI with exact effective camera coordinates', async () => {
  for (const model of FIELD_IDS) for (const depth of model === 'menger' ? [1, 2] : [null]) {
    const h = await rig({ pipelineSet: productPipelineSet(), classificationWords: pointResultWords() });
    const base = scene({ model, ...(depth ? { parameters: { depth } } : {}),
      ...(model === 'quaternion-julia' ? { parameters: { C: ['0.1', '-0.2', '0.3', '-0.4'], kappa: '0.7' } } : {}) });
    // Just above an f32 midpoint: collapsing the decimal anchor to Number first loses the side of the tie.
    const camera = { ...base.camera, anchor: ['1.0000000596046447753906250001', '0', '0'],
      positionLocal: [0, 0, 0], focusLocal: [0, 0, -1] };
    const r = request(changed(base, { camera }), generation(), 'settled');
    assert.equal((await h.finish(h.renderer.render(r))).outcome, 'completed');
    const result = await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(r));
    assert.equal(result.status, 'exterior', `${model}: classification must submit instead of returning stale`);
    const [submitted] = productPoints(h), b = submitted.desc, allocations = classificationAllocations(h);
    assert.equal(productPoints(h).length, 1); assert.equal(b.pipelineId, `points-${model}`); assert.equal(b.pass, 'probe');
    const descriptor = productPipelineSet().descriptors.find(d => d.pipelineId === b.pipelineId);
    assert.deepEqual(descriptor.bindings.map(b => b.slot), ['u', 'points', 'results', 'menger_boxes']);
    assert.deepEqual(Object.keys(b.inputs).sort(), ['menger_boxes', 'points', 'results']);
    assert.deepEqual(Object.keys(b.outputs), ['results']); assert.equal(b.inputs.results, b.outputs.results);
    const input = allocations.find(a => a.name === 'camera-points'), output = allocations.find(a => a.name === 'camera-results');
    assert.equal(input.bytes, POINT_INPUT_BYTES); assert.equal(output.bytes, POINT_RESULT_BYTES);
    assert.deepEqual([...new Float32Array(input.data.buffer, input.data.byteOffset, 4)], [1 + 2 ** -23, 0, 0, 0]);
    assert.deepEqual([...new Uint32Array(output.data.buffer, output.data.byteOffset, 16)], Array(16).fill(RESULT_SENTINEL));
    const effective = effectiveParameters(model, r.sceneSnapshot.parameters).effective;
    assert.deepEqual(b.uniforms, { origin: [0, 0], size: [1, 1], c: effective.C ?? [0, 0, 0, 0],
      end: 1, pitch: 1, cap: r.quality.iteration.maxIterations, power: effective.power ?? 0,
      kappa: effective.kappa ?? 0, bound: effective.C ? escapeRadius(effective.C).bound : 2, depth: effective.depth ?? 0, reserved: 0 });
    assert.deepEqual(b.bounds, { pixels: 1, iterations: r.quality.iteration.maxIterations, raySteps: 0,
      normalFieldSamples: 0, shadowRays: 0, shadowSteps: 0, aoSamples: 0 });
    const boxes = allocations.find(a => a.name === 'camera-menger-boxes');
    assert.deepEqual(boxes.data, model === 'menger' ? mengerBoxData(depth) : new Uint8Array(32));
    const readback = h.submissions.find(s => s.desc.fields?.includes('cameraClassification'));
    assert.deepEqual(readback.desc.region, { x: 0, y: 0, width: 64, height: 1 });
    assert.notEqual(readback.admission, submitted.admission);
    assert.equal(submitted.admission.consume(), false); assert.equal(readback.admission.consume(), false);
    assert.equal(h.scheduler.snapshot().outstanding, 0);
    h.renderer.destroy();
    assert.ok(h.fake.diagnostics().inventory.every(entry => !entry.name.startsWith('camera-')), 'classification releases its own buffers');
    h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
  }
});

test('B09c product point statuses require usable exterior evidence and retain failure detail', async () => {
  for (const model of FIELD_IDS) {
    const h = await rig({ pipelineSet: productPipelineSet() }), r = request(scene({ model }));
    await h.finish(h.renderer.render(r));
    const analytic = ['sphere', 'box', 'menger'].includes(model);
    const cases = [
      [{}, 'exterior'], [{ status: 1 }, 'unresolved'], [{ status: 2 }, 'unresolved'],
      [{ status: RESULT_SENTINEL }, 'unresolved'], [{ status: 99 }, 'unresolved'],
      ...(analytic ? [
        [{ applicability: 1, distance: 0 }, 'unresolved'], [{ applicability: 2, distance: -1 }, 'unresolved'],
        [{ applicability: 3 }, 'unresolved'], [{ distance: 0 }, 'unresolved'], [{ distance: -1 }, 'unresolved'],
        [{ distance: NaN }, 'unresolved'], [{ distance: Infinity }, 'unresolved'],
      ] : [
        [{ estimate: 1 }, 'unresolved'], [{ estimate: 2 }, 'unresolved'], [{ estimate: 3 }, 'unresolved'],
        [{ estimate: 99 }, 'unresolved'], [{ log2DE: NaN }, 'unresolved'], [{ log2DE: Infinity }, 'unresolved'],
      ]),
    ];
    for (const [patch, expected] of cases) {
      const bytes = words(pointResultWords(patch));
      h.hooks.before = (method, desc) => { if (method === 'readback' && desc.fields.includes('cameraClassification')) h.fake.stage(desc.source, bytes); };
      const result = await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(r));
      assert.equal(result.status, expected, `${model}: ${JSON.stringify(patch)}`);
      assert.deepEqual(result.detail.result, decodePointResults(bytes, 1, model)[0]);
      assert.deepEqual(result.identity, identity(r));
      assert.equal(cameraStatus({ cpu: { status: 'exterior' }, effective: result }).status, expected);
    }
    // No shader write must remain missing, never a zero-initialized analytic exterior.
    h.hooks.before = undefined;
    const missing = await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(r));
    assert.equal(missing.status, 'unresolved'); assert.equal(missing.detail.result.status, 'missing');
    h.renderer.destroy();
    assert.ok(h.fake.diagnostics().inventory.every(entry => !entry.name.startsWith('camera-')), 'classification releases its own buffers');
    h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
  }
});

test('B09c product classification owns all three buffers through copy-out and replacement', async () => {
  for (const replace of [false, true]) {
    const h = await rig({ pipelineSet: productPipelineSet(), classificationWords: pointResultWords() });
    const r = request(scene({ model: 'menger', parameters: { depth: 2 } }));
    await h.finish(h.renderer.render(r));
    const baseline = h.fake.diagnostics().tracked;
    let releaseCopy, mapping = false;
    const gate = new Promise(resolve => { releaseCopy = resolve; });
    h.hooks.after = (method, desc, ticket) => method === 'readback' && desc.fields.includes('cameraClassification')
      ? { ...ticket, result: ticket.result.then(async value => { mapping = true; await gate; return value; }) } : undefined;
    let result; h.renderer.classifyEffectiveCamera(r).then(value => { result = value; });
    await h.until(() => mapping || result !== undefined);
    assert.equal(mapping, true, 'product classification reaches copy-out');
    const b = productPoints(h).at(-1).desc, handles = [b.inputs.points, b.outputs.results, b.inputs.menger_boxes];
    assert.equal(result, undefined); assert.equal(h.scheduler.snapshot().outstanding, 1);
    assert.ok(handles.every(handle => inventoryEntry(h, handle)?.state === 'live'));
    let replacement;
    if (replace) replacement = h.renderer.render(request(scene(), generation(2)));
    releaseCopy(); await h.until(() => result !== undefined);
    assert.equal(replace ? result.stale : result.status, replace ? true : 'exterior');
    for (const handle of handles) assert.equal(inventoryEntry(h, handle), undefined);
    if (replacement) await h.finish(replacement); else assert.equal(h.fake.diagnostics().tracked, baseline);
    h.renderer.destroy();
    assert.ok(h.fake.diagnostics().inventory.every(entry => !entry.name.startsWith('camera-')), 'classification releases its own buffers');
    h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
  }
});

test('B09c product classification rejection discards only its auxiliary lease', async () => {
  for (const stage of ['points', 'readback']) for (const failure of ['submit', 'ticket', 'copy-out']) {
    if (stage === 'points' && failure === 'copy-out') continue;
    const h = await rig({ pipelineSet: productPipelineSet(), classificationWords: pointResultWords() });
    const r = request(scene({ model: 'menger' }), generation(), 'settled'), job = h.renderer.render(r);
    await h.until(() => h.publications.length === 1);
    const matches = (method, desc) => stage === 'points' ? desc.pipelineId === 'points-menger' : method === 'readback' && desc.fields.includes('cameraClassification');
    h.hooks.before = (method, desc) => { if (matches(method, desc) && failure === 'submit') throw new Error('B09c submission rejected'); };
    h.hooks.after = (method, desc, ticket) => !matches(method, desc) ? undefined : failure === 'ticket'
      ? { ...ticket, done: ticket.done.then(() => ({ outcome: 'failed', reason: 'B09c ticket rejected' })) }
      : failure === 'copy-out' ? { ...ticket, result: ticket.result.then(() => { throw new Error('B09c copy-out rejected'); }) } : undefined;
    const result = await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(r));
    assert.equal(result.status, 'unresolved'); assert.equal(result.stale, undefined);
    assert.match(result.detail.error.message, /B09c .* rejected/);
    assert.equal(h.discarded.length, 1, `${stage}/${failure}: the product batch must reach admission`);
    assert.equal(h.failed.length, 0); assert.equal((await h.finish(job)).outcome, 'completed');
    assert.equal(h.scheduler.snapshot().outstanding, 0);
    h.renderer.destroy();
    assert.ok(h.fake.diagnostics().inventory.every(entry => !entry.name.startsWith('camera-')), 'classification releases its own buffers');
    h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
  }
});

test('B09c a product publication supports B12 focus picking and camera exterior status', async () => {
  const h = await rig({ pipelineSet: productPipelineSet(), classificationWords: pointResultWords(), statusWords: [packStatus({ status: 0, reason: 0, subreason: 0, steps: 5 })], depths: [1.5] });
  const r = request(directScene(), generation(), 'settled'); await h.finish(h.renderer.render(r));
  const effective = await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(r));
  const cpu = classifyCamera(getModel('sphere', 1), {}, encodeOrdinaryOrigin(r.sceneSnapshot.camera).highF32, r.quality.iteration.maxIterations);
  assert.equal(cameraStatus({ cpu, effective }).status, 'exterior');
  const listeners = new Map(), focus = [], statuses = [], picks = [];
  const surface = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 160, height: 80 }) };
  const navigation = bindSpaceNavigation({ surface, getCamera: () => r.sceneSnapshot.camera,
    gestures: { focusApply: camera => focus.push(camera), settle() {} }, flight: { active: false, stop() {} },
    getPickContext: () => ({ identity: identity(r), dimensions: r.quality.internalSize, geometryRevision: 1, sampleIndex: 0 }),
    pick: async request => { const value = await h.renderer.pick(request); picks.push(value); return value; }, onStatus: value => statuses.push(value) });
  await auxiliaryResult(h, listeners.get('dblclick')({ clientX: 81, clientY: 41, target: surface }).then(() => true));
  assert.equal(picks.length, 1); assert.equal(picks[0].status, 'approximate hit'); assert.equal(picks[0].depth, 1.5);
  const { camera, pixel, jitter, dimensions } = picks[0].sample;
  assert.deepEqual(pixel, [8, 4]); assert.deepEqual(jitter, sampleJitter({ seed: r.quality.sampling.seed, sampleIndex: 0, pixel }));
  const hit = reconstructHit(camera, pixel, jitter, 1.5, dimensions.width, dimensions.height);
  assert.deepEqual(focus, [lookAt(camera, toLocal(camera, hit))]); assert.deepEqual(statuses, []);
  const ids = batches(h, r.jobId).map(b => b.pipelineId);
  for (const id of ['trace_band:sphere', 'normals_band:sphere', 'shade_band:sphere', 'accumulate_band', 'display_band', 'points-sphere']) assert.ok(ids.includes(id), id);
  navigation.destroy(); h.renderer.destroy();
  assert.ok(h.fake.diagnostics().inventory.every(entry => !entry.name.startsWith('camera-')), 'classification releases its own buffers');
  h.fake.destroy(); assert.equal(h.fake.diagnostics().tracked, 0);
});

test('B09c F1 classification errors are unresolved with their cause instead of stale', async () => {
  for (const failure of ['descriptor', 'allocation', 'admission', 'copy-out', 'decode']) {
    const set = productPipelineSet();
    const pipelineSet = failure === 'descriptor' ? createPipelineSet({ ...set,
      descriptors: set.descriptors.filter(d => d.pipelineId !== 'points-sphere') }) : set;
    const h = await rig({ pipelineSet }), r = request();
    await h.finish(h.renderer.render(r));
    if (failure === 'allocation') h.backend.allocate = () => { throw new BackendError('allocation-failed', 'classification allocation refused'); };
    if (failure === 'admission') h.scheduler.requestAuxiliary = () => { throw new RangeError('classification admission refused'); };
    if (['copy-out', 'decode'].includes(failure)) h.hooks.after = (method, desc, ticket) =>
      method === 'readback' && desc.fields.includes('cameraClassification') ? { ...ticket, result: ticket.result.then(value => {
        if (failure === 'copy-out') throw new Error('classification copy-out refused');
        return { ...value, data: new Uint8Array(16) };
      }) } : undefined;
    const result = await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(r));
    assert.equal(result.status, 'unresolved', `${failure} must be visible, not stale`);
    assert.equal(result.stale, undefined); assert.deepEqual(result.identity, identity(r));
    assert.equal(result.detail.error.code, { descriptor: 'preparation-failed', allocation: 'allocation-failed',
      admission: 'RangeError', 'copy-out': 'Error', decode: 'RangeError' }[failure]);
    assert.match(result.detail.error.message, failure === 'descriptor' ? /pipeline/ : failure === 'decode' ? /shorter/ : /classification .* refused/);
    assert.equal(h.failed.length, 0); assert.equal(h.scheduler.snapshot().outstanding, 0);
    assert.ok(h.fake.diagnostics().inventory.every(entry => !entry.name.startsWith('camera-')));
    h.renderer.destroy(); h.fake.destroy();
  }
});

test('B09c F2 draft classification uses 64 iterations when the scene permits an escape at 88', async () => {
  // B04 bulb/p2/n128/generic/218: independently evaluate the same effective point.
  const point = [-0.15, -0.15, -0.45].map(Math.fround), model = getModel('mandelbulb', 1), effective = { power: 2 };
  const limited = classifyCamera(model, effective, point, 64), full = classifyCamera(model, effective, point, 128);
  assert.equal(limited.status, 'unresolved'); assert.equal(limited.detail.result.index, 64);
  assert.equal(full.status, 'exterior'); assert.equal(full.detail.result.index, 88);
  const base = scene({ model: 'mandelbulb', parameters: { power: '2' } });
  const s = changed(base, { camera: { ...base.camera, positionLocal: point }, iteration: { ...base.iteration, maxIterations: 128 } });
  const h = await rig({ pipelineSet: productPipelineSet() });
  h.hooks.before = (method, batch) => {
    if (method !== 'submitBatch' || batch.pipelineId !== 'points-mandelbulb') return;
    // Simulate the field at the SUBMITTED cap, so C18 changes the returned status.
    const evaluation = model.evaluate(effective, point, { maxIterations: batch.uniforms.cap });
    const result = pointResultWords({ status: evaluation.status === 'escaped' ? 0 : 1,
      estimate: evaluation.estimate.available ? 0 : 1, log2DE: evaluation.estimate.log2DE ?? 0 });
    result[1] = evaluation.index; h.fake.stage(batch.outputs.results, words(result));
  };
  for (const [i, profile] of ['draft', 'settled'].entries()) {
    const r = request(s, generation(i + 1), profile); await h.finish(h.renderer.render(r));
    const result = await auxiliaryResult(h, h.renderer.classifyEffectiveCamera(r));
    assert.equal(result.status, profile === 'draft' ? 'unresolved' : 'exterior');
    assert.equal(result.detail.result.index, profile === 'draft' ? 64 : 88);
    const batch = productPoints(h).at(-1).desc;
    assert.equal(r.sceneSnapshot.iteration.maxIterations, 128);
    assert.equal(batch.uniforms.cap, r.quality.iteration.maxIterations);
    assert.equal(batch.bounds.iterations, r.quality.iteration.maxIterations);
  }
  h.renderer.destroy(); h.fake.destroy();
});


test('each pending draft guard independently rejects changed content appearance current request and newest stream', () => {
  function fixture() {
    let liveContent = 'unchanged';
    const record = {navigation:1,navigationContent:'unchanged',currentNavigationContent:()=>liveContent,
      currentNavigation:()=>1,currentGeneration:()=>generation(2,1),
      request:{output:{purpose:'interactive'},quality:{preview:true},viewId:'space',generation:generation(1,1)}};
    const interactive = {navigation:1,navigationContent:'unchanged',cancelled:false};
    return {record,interactive,current:interactive,viewId:'space',epoch:1,destroyed:false,setContent:value=>{liveContent=value;}};
  }
  const defects = {
    'content changed without another submission':x=>x.setContent('changed'),
    'newest content differs':x=>{x.interactive.navigationContent='changed';},
    'appearance revision changed':x=>{x.record.currentGeneration=()=>generation(2,2);},
    'another purpose became current':x=>{x.current={};},
    'newest request belongs to another stream':x=>{x.interactive.navigation=2;},
    'live stream was invalidated':x=>{x.record.currentNavigation=()=>2;},
    'newest request was cancelled':x=>{x.interactive.cancelled=true;},
    'live epoch changed':x=>{x.record.currentGeneration=()=>({...generation(2,1),deviceEpoch:2});},
  };
  for(const [name,mutate] of Object.entries(defects)) {
    const x=fixture();assert.equal(navigationDraftEligible(x),true,`valid baseline: ${name}`);
    mutate(x);assert.equal(navigationDraftEligible(x),false,name);
  }
});


test('draft diagnostics use one packed readback with exact status normal and recovery counts', async () => {
  for (const model of ['mandelbulb', 'quaternion-julia', 'menger']) {
    const status = [0, 1, packStatus({ status: 2, reason: 4, subreason: 2, steps: 9 }), 3];
    // B15-R8-F5: valid, varied nonzero recovery words (approximate hit at the hit, numerical failure at the failure).
    const recoveryWords = [3 | 2 << 4 | 1 << 8, 0, 0, 5 | 3 << 4 | 2 << 8];
    const h = await rig({ statusWords: status, normals: [false, false, true, true], recoveryWords });
    // The draft profile renders at half resolution: an 8×1 output has 4×1 internal pixels, one per scripted word.
    const r = request(scene({ model }), generation(), 'draft', { width: 8, height: 1 });
    assert.equal(pixelsIn(r), status.length, 'one internal pixel per scripted status word');
    const { report } = await h.finish(h.renderer.render(r)); assert.equal(report.outcome, 'completed', report.reason);
    const reads = h.submissions.filter(s => s.method === 'readback' && s.desc.identity.jobId === r.jobId);
    assert.equal(reads.length, 1, 'one buffer transfer replaces every draft diagnostic texture transfer');
    assert.deepEqual(reads[0].desc.fields, ['draftDiagnostics']);
    assert.equal(reads[0].desc.region.height, 1); assert.equal(reads[0].desc.region.width, pixelsIn(r) * (model === 'quaternion-julia' ? 12 : 8));
    assert.deepEqual([report.rayTermination.hit, report.rayTermination.miss, report.rayTermination.numericalFailure, report.rayTermination.unresolved.stagnation.fieldCoordinate], [1, 1, 1, 1]);
    assert.equal(report.unavailableNormals, 1); assert.equal(report.outcomeMasks.union.hits, 1);
    assert.deepEqual(report.lightingFailures, { shadow: 0, ao: 0, both: 0 });
    assert.match(report.diagnosticReadback.secondaryFlags, /zero.*direct|direct.*zero/);
    if (model !== 'quaternion-julia') assert.equal(report.outcomeMasks.recovery, null);
    else {
      assert.deepEqual(report.outcomeMasks.recovery.samples, [{ sample: 0, attempts: 2,
        outcomes: { 'approximate hit': 1, 'numerical failure': 1, 'estimate-unavailable': 0, 'point-budget': 0 },
        stops: { 'midpoint-limit': 0, 'parameter-collapse': 0, 'coordinate-collapse': 0, 'evaluation-cap': 0 }, midpoints: 8, encounters: 5 }], 'exact packed recovery values and counts');
      assert.equal(report.outcomeMasks.recovery.union.attempted, 2);
      assert.equal(report.outcomeMasks.recovery.union.outcomes['approximate hit'], 1); assert.equal(report.outcomeMasks.recovery.union.outcomes['numerical failure'], 1);
    }
    h.renderer.destroy();
  }
});

test('tile learning persists by workload and pass and permits compute regions taller than 256 rows', async () => {
  const h = await rig();
  async function renderFast(model, revision) {
    const r = request(scene({ model }), generation(revision), 'draft', { width: 1280, height: 720 });
    let result; h.renderer.render(r).done.then(value => { result = value; });
    for (let i = 0; !result && i < 1000; i++) {
      await flush(); const pending = h.tickets.find(t => t.pending);
      const work = (pending?.desc.bounds?.pixels ?? 32768) / 32768;
      await h.complete('oldest', work * (pending?.desc.pass === 'normals' ? 8 : 1));
    }
    assert.equal(result?.outcome, 'completed', result?.reason); return r;
  }
  await renderFast('mandelbulb', 1);
  const warm = await renderFast('mandelbulb', 2), warmBatches = batches(h, warm.jobId);
  assert.ok(warmBatches.some(b => b.pass === 'trace' && b.region.height > 256), 'learning survives phase and job boundaries without a compute row cap');
  assert.ok(warmBatches.filter(b => b.pass === 'normals').every(b => b.bounds.pixels <= 32768), 'trace evidence never sizes the normal workload');
  for (const pass of ['trace', 'normals', 'shade', 'accumulate', 'display']) {
    const covered = new Uint8Array(pixelsIn(warm));
    for (const b of warmBatches.filter(b => b.pass === pass)) for (let y = b.region.y; y < b.region.y + b.region.height; y++) for (let x = b.region.x; x < b.region.x + b.region.width; x++) covered[y * warm.quality.internalSize.width + x]++;
    assert.ok(covered.every(n => n === 1), `${pass} covers each pixel once`);
  }
  const cold = await renderFast('menger', 3);
  assert.ok(batches(h, cold.jobId).filter(b => b.pass === 'trace').every(b => b.bounds.pixels <= 32768), 'a different family starts from its own calibration');
  h.renderer.destroy();
});

test('pending navigation requests allocate targets only after the active draft retires', async () => {
  const h = await rig(); let live = generation(); const opts = { currentGeneration: () => live, currentNavigation: () => 1 };
  const first = h.renderer.render(request(scene(), live), opts);
  await h.until(() => h.tickets.some(t => t.pending && t.desc.identity.jobId === first.jobId));
  const allocated = h.targets.length, skipped = [];
  for (let i = 2; i <= 12; i++) { live = generation(i, 1); skipped.push(h.renderer.render(request(scene(), live), opts)); await flush(); }
  assert.equal(h.targets.length, allocated, 'pending drafts have no working allocations');
  for (const job of skipped.slice(0, -1)) assert.equal((await job.done).outcome, 'superseded');
  await h.finish(first); assert.equal((await h.finish(skipped.at(-1))).outcome, 'completed');
  assert.equal(h.targets.length, allocated + 1); h.renderer.destroy();
});
