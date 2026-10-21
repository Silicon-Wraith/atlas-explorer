import test from 'node:test';
import assert from 'node:assert/strict';
import { createFence, awaitFence, CompletionError } from '../../src/plane/completion.js';
import { createPlaneRenderAdapter, createPlaneRequest } from '../../src/plane/render-adapter.js';
import { createPlaneScene } from '../../src/plane/scene-adapter.js';
import { createFakeRenderer, flush } from '../support/fake-renderer.mjs';

// A WebGL 2 fence as the completion primitive sees it (plan amendment G(3)): a fence cannot signal
// until control returns to the event loop, so every poll must follow a task yield.
function fenceGl({ statuses = ['TIMEOUT_EXPIRED', 'CONDITION_SATISFIED'], nullFence = false } = {}) {
  const calls = [];
  const gl = { SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 3, TIMEOUT_EXPIRED: 4, WAIT_FAILED: 5 };
  let fences = 0, poll = 0, lost = false, yielded = false, clock = 0;
  Object.assign(gl, {
    isContextLost: () => lost,
    fenceSync: (condition, flags) => { assert.equal(condition, gl.SYNC_GPU_COMMANDS_COMPLETE); assert.equal(flags, 0); calls.push('fence'); return nullFence ? null : { id: ++fences }; },
    flush: () => calls.push('flush'),
    clientWaitSync: (sync, flags, timeout) => {
      assert.equal(flags, 0); assert.equal(timeout, 0);
      assert.ok(yielded, 'every poll, the first included, follows a task yield'); yielded = false;
      calls.push(`poll ${sync.id}`);
      return gl[statuses[Math.min(poll++, statuses.length - 1)]];
    },
    deleteSync: sync => calls.push(`delete ${sync.id}`),
  });
  const options = { now: () => clock, yieldTask: async () => { calls.push('yield'); yielded = true; clock += 5; } };
  return { gl, calls, options, lose: () => { lost = true; } };
}
const fenceCalls = calls => calls.filter(call => call === 'fence').length;
const rejectsWith = (promise, code) => assert.rejects(promise, error => error instanceof CompletionError && error.code === code, code);

test('a publication fence is polled only after a task yield and resolves on completion', async () => {
  const { gl, calls, options } = fenceGl();
  const sync = createFence(gl);
  assert.deepEqual(sync, { id: 1 });
  assert.deepEqual(calls, ['fence', 'flush'], 'the fence is flushed so it can signal');
  const evidence = await awaitFence({ gl, sync, ms: 100, ...options });
  assert.deepEqual(evidence, { polls: 2, waitMs: 10 });
  assert.deepEqual(calls.slice(2), ['yield', 'poll 1', 'yield', 'poll 1']);
  assert.equal(createFence({}), undefined, 'a renderer without WebGL fences has no fence');
  assert.equal(createFence(undefined), undefined);
});

test('a null fence, a missing fence API, WAIT_FAILED, an unexpected status and the deadline reject with their codes', async () => {
  await rejectsWith(awaitFence({ gl: fenceGl().gl, sync: undefined, ms: 100 }), 'unavailable');
  const nulled = fenceGl({ nullFence: true });
  assert.equal(createFence(nulled.gl), null);
  await rejectsWith(awaitFence({ gl: nulled.gl, sync: null, ms: 100, ...nulled.options }), 'fence-failed');
  const failed = fenceGl({ statuses: ['WAIT_FAILED'] });
  await rejectsWith(awaitFence({ gl: failed.gl, sync: createFence(failed.gl), ms: 100, ...failed.options }), 'fence-failed');
  const bogus = fenceGl({ statuses: ['BOGUS'] }); bogus.gl.BOGUS = 0xffff;
  await rejectsWith(awaitFence({ gl: bogus.gl, sync: createFence(bogus.gl), ms: 100, ...bogus.options }), 'fence-failed');
  const stuck = fenceGl({ statuses: ['TIMEOUT_EXPIRED'] });
  await rejectsWith(awaitFence({ gl: stuck.gl, sync: createFence(stuck.gl), ms: 12, ...stuck.options }), 'timeout');
  assert.equal(stuck.calls.filter(call => call.startsWith('poll')).length, 2, 'two polls fit in the deadline, then it expires');
  await assert.rejects(awaitFence({ gl: stuck.gl, sync: createFence(stuck.gl), ms: Infinity }), RangeError);
});

test('a lost context or an invalidated publication rejects before the fence is polled', async () => {
  const lostGl = fenceGl();
  const sync = createFence(lostGl.gl);
  lostGl.lose();
  await rejectsWith(awaitFence({ gl: lostGl.gl, sync, ms: 100, ...lostGl.options }), 'interrupted');
  assert.ok(!lostGl.calls.some(call => call.startsWith('poll')), 'a lost context is never polled');
  const invalid = fenceGl();
  const still = () => { throw new CompletionError('this publication was superseded', 'superseded'); };
  await rejectsWith(awaitFence({ gl: invalid.gl, sync: createFence(invalid.gl), ms: 100, stillValid: still, ...invalid.options }), 'superseded');
  assert.ok(!invalid.calls.some(call => call.startsWith('poll')));
});

const A = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 } });
const auroraA = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 }, settings: { palette: 'aurora' } });
let clockValue = 0;
const clock = () => (clockValue += 5);
const generation = { deviceEpoch: 0, viewRevision: 1, geometryRevision: 1, appearanceRevision: 0 };
const request = (scene, purpose = 'interactive', deviceEpoch = 0) => createPlaneRequest({ scene, purpose, width: 320, height: 180, generation: { ...generation, deviceEpoch } });
async function published(adapter, renderer, deviceEpoch = 0) {
  const pending = adapter.render(request(A, 'interactive', deviceEpoch), { currentGeneration: () => ({ ...generation, deviceEpoch }), liveScene: () => A });
  renderer.finishNext();
  return pending;
}

test('completion confirms the current publication by the fence created at that publication', async () => {
  const renderer = createFakeRenderer();
  const fence = fenceGl();
  renderer.gl = fence.gl;
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const report = await published(adapter, renderer);
  assert.equal(fenceCalls(fence.calls), 1, 'the fence was created when the image was published, before anyone asked');
  const evidence = await adapter.completion(report, { timeoutMs: 100, ...fence.options });
  assert.deepEqual(evidence, { reportId: report.reportId, requestId: report.requestId, deviceEpoch: 0, source: 'queue-completion', clock: 'page-performance-now', completedAt: evidence.completedAt, polls: 2, waitMs: 10 });
  assert.ok(Object.isFrozen(evidence));
  assert.equal(fenceCalls(fence.calls), 1, 'completion inserts no fence of its own');
  assert.equal(typeof evidence.completedAt, 'number');
});

test('a fence is created at every publication and the superseded one is deleted', async () => {
  const renderer = createFakeRenderer();
  const fence = fenceGl();
  renderer.gl = fence.gl;
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const first = await published(adapter, renderer);
  const recolored = adapter.recolor(auroraA, { ...generation, appearanceRevision: 1 });
  assert.equal(fenceCalls(fence.calls), 2, 'a recolor is a publication with its own fence');
  assert.ok(fence.calls.includes('delete 1'), 'the superseded fence was deleted on a healthy context');
  await rejectsWith(adapter.completion(first, { timeoutMs: 100, ...fence.options }), 'superseded');
  const lease = adapter.reserveExclusive(request(A, 'export'));
  const rendering = lease.render({ timeoutMs: 1000 }); await flush(); renderer.finishNext();
  const exported = await rendering;
  lease.release();
  assert.equal(fenceCalls(fence.calls), 3, 'the export render is a publication with its own fence');
  assert.ok(fence.calls.includes('delete 2'));
  await rejectsWith(adapter.completion(recolored.report, { timeoutMs: 100, ...fence.options }), 'superseded');
  assert.equal((await adapter.completion(exported, { timeoutMs: 100, ...fence.options })).reportId, exported.reportId);
});

test('a publication superseded while its fence is awaited is rejected, never swapped for the newer one', async () => {
  const renderer = createFakeRenderer();
  const fence = fenceGl({ statuses: ['TIMEOUT_EXPIRED', 'TIMEOUT_EXPIRED', 'CONDITION_SATISFIED'] });
  renderer.gl = fence.gl;
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const report = await published(adapter, renderer);
  const pending = adapter.completion(report, { timeoutMs: 100, ...fence.options });
  adapter.recolor(auroraA, { ...generation, appearanceRevision: 1 });
  await rejectsWith(pending, 'superseded');
  assert.ok(!fence.calls.includes('poll 1'), 'the superseded fence was not polled after the yield');
});

test('a lost context drops its fence untouched and completion reports the interruption; a retirement deletes it', async () => {
  const renderer = createFakeRenderer();
  const fence = fenceGl();
  renderer.gl = fence.gl;
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const report = await published(adapter, renderer);
  adapter.invalidate();
  assert.ok(!fence.calls.includes('delete 1'), 'a fence from before the loss is never handed back to the context');
  await rejectsWith(adapter.completion(report, { timeoutMs: 100, ...fence.options }), 'interrupted');
  assert.ok(!fence.calls.some(call => call.startsWith('poll')));
  const next = createFakeRenderer();
  const nextFence = fenceGl();
  next.gl = nextFence.gl;
  adapter.replaceRenderer(next);
  assert.ok(!fence.calls.includes('delete 1'), 'nor after the replacement');
  const after = await published(adapter, next, 1);
  assert.equal(after.generation.deviceEpoch, 1);
  const lease = adapter.reserveExclusive(request(A, 'export'));
  lease.retire(); lease.release();
  assert.ok(nextFence.calls.includes('delete 1'), 'a retirement on a healthy context deletes the dropped fence');
  await rejectsWith(adapter.completion(after, { timeoutMs: 100, ...nextFence.options }), 'interrupted');
});

test('the CPU fallback completes synchronously after its paint', async () => {
  const renderer = createFakeRenderer({ gl: false });
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const report = await published(adapter, renderer);
  const evidence = await adapter.completion(report, { timeoutMs: 100 });
  assert.equal(evidence.source, 'synchronous-paint');
  assert.equal(evidence.polls, 0);
  assert.equal(evidence.reportId, report.reportId);
});
