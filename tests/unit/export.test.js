import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaneRenderAdapter, createPlaneRequest, LeaseError } from '../../src/plane/render-adapter.js';
import { startExport, EXPORT_STAGES } from '../../src/plane/export.js';
import { createPlaneScene, toPlaneState } from '../../src/plane/scene-adapter.js';
import { createFakeRenderer, flush } from '../support/fake-renderer.mjs';

const A = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 }, settings: { palette: 'ember' } });
const B = createPlaneScene({ view: { re: '-0.7', im: '0.1', zoom: 2 }, settings: { palette: 'aurora', detail: 4 } });
const clock = (() => { let t = 0; return () => (t += 1); })();
const generation = { deviceEpoch: 0, viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 };
const interactive = { currentGeneration: () => generation, liveScene: () => A };
const limits = { admissionMs: 200, renderMs: 200, encodeMs: 200 };
const exportOf = (scene, width = 1920, height = 1080) => createPlaneRequest({ scene, purpose: 'export', width, height, generation });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function renderTimeoutResult(done) {
  let timer;
  try {
    const result = await Promise.race([done, new Promise(resolve => { timer = setTimeout(() => resolve(null), 1000); })]);
    assert.notEqual(result, null, 'the render deadline must use renderMs, not admissionMs');
    return result;
  } finally {
    clearTimeout(timer);
  }
}
// Edits a test makes while the export holds the renderer: a palette change and a new view.
function edit(adapter) {
  assert.equal(adapter.recolor(B, generation).status, 'deferred');
  assert.throws(() => adapter.render(createPlaneRequest({ scene: B, purpose: 'interactive', width: 640, height: 360, generation }), { currentGeneration: () => generation, liveScene: () => B }), LeaseError);
}
function assertExportedA(renderer, result, request) {
  const exportRender = renderer.renders().at(-1);
  assert.deepEqual(exportRender.view, { re: '-0.5', im: '0', zoom: 0 }, "the export renders A's geometry");
  assert.deepEqual(exportRender.settings, toPlaneState(A).settings, 'all appearance and iteration settings belong to A');
  assert.deepEqual([exportRender.width, exportRender.height, exportRender.fullResolution], [request.output.width, request.output.height, true]);
  assert.ok(renderer.colors().length > 0, 'the exported image was colored');
  assert.ok(renderer.colors().every(settings => settings.palette === 'ember'), 'no B appearance reached the renderer during the lease');
  assert.equal(result.report.sceneHash, request.sceneHash);
  assert.equal(result.request, request);
  assert.equal(result.report.requestId, request.requestId);
  assert.deepEqual(result.report.requested, { width: request.output.width, height: request.output.height, quality: request.quality });
  assert.deepEqual(result.report.completed, { width: request.output.width, height: request.output.height });
  assert.equal('published' in result.report.timings, true);
  assert.equal(result.report.renderReportId, result.renderReport.reportId);
  assert.equal(result.report.outcome, result.outcome);
  assert.equal(result.deferredScene, B, 'the latest live edit is handed back on release');
}

test('export freezes before admission', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 320, height: 180, generation }), interactive);
  const request = exportOf(A);
  const stages = [];
  const { done } = startExport({ adapter, request, encode: async canvas => ({ bytes: `${canvas.width}x${canvas.height}` }), limits, hooks: { stage: name => stages.push(name) } });
  assert.equal(adapter.reserved, true, 'the renderer is reserved synchronously');
  assert.deepEqual(stages, ['reserved', 'admission']);
  edit(adapter);
  renderer.finishNext(); await flush(); await flush();
  renderer.finishNext();
  const result = await done;
  assert.equal(result.outcome, 'completed');
  assertExportedA(renderer, result, request);
  assert.deepEqual(result.blob, { bytes: '1920x1080' });
  assert.equal(adapter.reserved, false);
});

test('an edit while the export render is pending changes nothing', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const request = exportOf(A, 800, 450);
  let reached = false;
  const { done } = startExport({ adapter, request, encode: async () => ({ bytes: 'A' }), limits, hooks: { stage: name => { if (name === 'render-submitted') reached = true; } } });
  await flush(); await flush();
  assert.equal(reached, true, 'the export render was submitted');
  assert.equal(renderer.pending.length, 1, 'and is still pending');
  edit(adapter);
  renderer.finishNext();
  const result = await done;
  assert.equal(result.outcome, 'completed');
  assertExportedA(renderer, result, request);
});

test('export holds lease through encoding', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const encoding = deferred();
  const request = exportOf(A, 800, 450);
  const stages = [];
  const { done } = startExport({ adapter, request, encode: () => encoding.promise, limits: { ...limits, encodeMs: 1000 }, hooks: { stage: name => stages.push(name) } });
  await flush();
  renderer.finishNext(); await flush(); await flush();
  assert.equal(stages.at(-1), 'encoding');
  const colorsBefore = renderer.colors().length;
  edit(adapter);
  assert.equal(adapter.reserved, true, 'the lease covers encoding');
  assert.equal(renderer.colors().length, colorsBefore, 'nothing recolored the canvas being encoded');
  encoding.resolve({ bytes: 'A' });
  const result = await done;
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(result.blob, { bytes: 'A' });
  assertExportedA(renderer, result, request);
  assert.equal(result.renderReport.outcome, 'completed');
  assert.notEqual(result.report.reportId, result.renderReport.reportId, 'the job report is not the render-stage report');
});

test('an export render that never finishes retires the renderer and reports interrupted', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({}), limits: { ...limits, admissionMs: 5000, renderMs: 20 } });
  const result = await renderTimeoutResult(done);
  assert.deepEqual([result.outcome, result.report.outcome], ['interrupted', 'interrupted']);
  assert.equal(result.report.completed, null);
  assert.equal('published' in result.report.timings, false);
  assert.match(result.reason, /retired/);
  assert.equal(adapter.retired, true);
  assert.equal(adapter.reserved, false);
  assert.throws(() => adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive), LeaseError, 'a retired renderer is never reused');
  adapter.replaceRenderer(createFakeRenderer());
  assert.equal(adapter.retired, false);
});

test('an admission timeout is an interrupted export with its own report', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive);
  const request = exportOf(A, 100, 50);
  const { done } = startExport({ adapter, request, encode: async () => ({}), limits: { ...limits, admissionMs: 20 } });
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome], ['interrupted', 'interrupted']);
  assert.equal(result.report.requestId, request.requestId);
  assert.equal(renderer.renders().length, 1, 'the export never rendered');
  assert.equal(adapter.retired, true);
  assert.equal(adapter.reserved, false);
  assert.match(result.reason, /did not drain in time/);
  assert.throws(() => adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive), LeaseError, 'an admission timeout cannot leave a usable renderer');
});

test('an encoding failure is a failed export whose report says failed', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  for (const encode of [async () => null, async () => { throw new Error('encoder crashed'); }]) {
    const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode, limits });
    await flush(); renderer.finishNext();
    const result = await done;
    assert.deepEqual([result.outcome, result.report.outcome], ['failed', 'failed']);
    assert.equal(result.renderReport.outcome, 'completed', 'the render stage itself completed');
    assert.deepEqual(result.report.completed, { width: 100, height: 50 });
    assert.equal('published' in result.report.timings, false);
    assert.equal(adapter.reserved, false);
  }
});

test('a device loss while encoding interrupts the export, discards the image and releases the lease', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const encoding = deferred();
  const stages = [];
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: () => encoding.promise, limits: { ...limits, encodeMs: 1000 }, hooks: { stage: name => stages.push(name) } });
  await flush(); renderer.finishNext(); await flush(); await flush();
  assert.equal(stages.at(-1), 'encoding');
  adapter.invalidate();
  assert.throws(() => adapter.replaceRenderer(createFakeRenderer()), LeaseError, 'no replacement while the export holds the lease');
  encoding.resolve({ bytes: 'stale' });
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome, result.blob], ['interrupted', 'interrupted', undefined]);
  assert.equal(adapter.reserved, false);
  assert.throws(() => adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive), LeaseError, 'releasing the lease does not restore a lost renderer');
  const replacement = createFakeRenderer();
  adapter.replaceRenderer(replacement);
  const live = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation: { ...generation, deviceEpoch: adapter.epoch } }), { currentGeneration: () => ({ ...generation, deviceEpoch: adapter.epoch }), liveScene: () => A });
  replacement.finishNext();
  assert.equal((await live).outcome, 'completed', 'live rendering resumes on the replacement');
});

test('a device loss during the export render interrupts it', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({ bytes: 'x' }), limits });
  await flush(); await flush();
  adapter.invalidate();
  renderer.finishNext();
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome], ['interrupted', 'interrupted']);
  assert.equal(renderer.colors().length, 0, 'the cooperative renderer must not draw after device loss');
  assert.equal(result.report.reason, result.renderReport.reason, 'a stopped render keeps its own classification');
  assert.equal(adapter.reserved, false);
});

test('an encoder rejection after a device loss is interrupted, not failed', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let reject;
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: () => new Promise((_, fail) => { reject = fail; }), limits: { ...limits, encodeMs: 1000 } });
  await flush(); renderer.finishNext(); await flush(); await flush();
  adapter.invalidate();
  reject(new Error('canvas lost'));
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome, result.blob], ['interrupted', 'interrupted', undefined]);
});

test('a loss during the export render followed by an ordinary rejection is interrupted', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({ bytes: 'x' }), limits });
  await flush(); await flush();
  adapter.invalidate();
  renderer.failNext('GL_OUT_OF_MEMORY');
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome, result.renderReport.outcome], ['interrupted', 'interrupted', 'interrupted']);
  assert.match(result.reason, /lost/);
});

test('a loss followed by a non-cooperative completion is interrupted and never recolored', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({ bytes: 'x' }), limits });
  await flush(); await flush();
  adapter.invalidate();
  const colorsBefore = renderer.colors().length;
  renderer.finishNext({ ignoreCurrent: true });
  const result = await done;
  assert.equal(renderer.colors().length, colorsBefore + 1, 'only the fake renderer\'s own drawing; the adapter colored nothing');
  assert.deepEqual([result.outcome, result.renderReport.outcome, result.blob], ['interrupted', 'interrupted', undefined]);
});

test('an encoding timeout without a device loss reports the timeout, not a loss', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: () => new Promise(() => {}), limits: { ...limits, encodeMs: 20 } });
  await flush(); renderer.finishNext();
  const result = await done;
  assert.equal(result.outcome, 'interrupted');
  assert.match(result.reason, /image encoding exceeded its time limit/);
  assert.doesNotMatch(result.reason, /lost/);
  assert.equal(result.report.deviceLost, false);
  assert.equal(result.report.retired, true);
  assert.equal('published' in result.report.timings, false);
  assert.equal(adapter.retired, true);
});

test('cancelInteractive cannot cancel admission, export rendering or encoding', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const initial = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive);
  const encoding = deferred();
  const stages = [];
  const { done } = startExport({ adapter, request: exportOf(A), encode: () => encoding.promise, limits, hooks: { stage: name => stages.push(name) } });
  adapter.cancelInteractive();
  assert.equal(stages.at(-1), 'admission');
  assert.equal(renderer.pending.length, 1, 'the interactive render still drains normally');
  assert.equal(renderer.calls.filter(call => call.op === 'cancel').length, 0);
  renderer.finishNext();
  assert.equal((await initial).outcome, 'completed');
  await flush();
  assert.equal(stages.at(-1), 'render-submitted');
  adapter.cancelInteractive();
  assert.equal(renderer.pending.length, 1, 'the export render was not cancelled');
  assert.equal(renderer.calls.filter(call => call.op === 'cancel').length, 0);
  renderer.finishNext(); await flush();
  assert.equal(stages.at(-1), 'encoding');
  adapter.cancelInteractive();
  assert.equal(renderer.calls.filter(call => call.op === 'cancel').length, 0);
  assert.equal(adapter.reserved, true);
  encoding.resolve({ bytes: 'A' });
  assert.equal((await done).outcome, 'completed');
  assert.equal(adapter.reserved, false);
  const next = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive);
  adapter.cancelInteractive();
  assert.equal(renderer.pending.length, 0, 'cancellation resumes after release and removes pending work');
  assert.equal((await next).outcome, 'superseded');
});

test('release returns the latest of successive live edits without applying them to the export', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const admission = deferred(), encoding = deferred();
  const latest = createPlaneScene({ view: { re: '-1', im: '0.2', zoom: 4 }, settings: { palette: 'aurora', phase: 0.8, frequency: 2, relief: 0, detail: 5 } });
  const request = exportOf(A, 800, 450);
  const { done } = startExport({ adapter, request, encode: () => encoding.promise, limits, hooks: { hold: name => name === 'admission' ? admission.promise : undefined } });
  assert.equal(adapter.recolor(B, generation).status, 'deferred');
  assert.equal(renderer.colors().length, 0);
  admission.resolve(); await flush();
  assert.equal(renderer.pending.length, 1);
  assert.equal(adapter.recolor(A, generation).status, 'deferred');
  renderer.finishNext(); await flush();
  const colorsBefore = renderer.colors().length;
  assert.equal(adapter.recolor(latest, generation).status, 'deferred');
  assert.equal(renderer.colors().length, colorsBefore);
  encoding.resolve({ bytes: 'A' });
  const result = await done;
  assert.equal(result.outcome, 'completed');
  assert.equal(result.deferredScene, latest, 'release hands back the last edit, not the first');
  assert.ok(renderer.colors().every(settings => settings.palette === 'ember'));
  assert.equal(renderer.colors().length, colorsBefore, 'release does not recolor the export');
  const next = startExport({ adapter, request, encode: async () => ({}), limits });
  await flush(); renderer.finishNext();
  assert.equal((await next.done).deferredScene, null, 'the deferred scene is consumed once');
});

test('export job and render reports observe the completed export backend and device', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const initial = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive);
  renderer.finishNext();
  const initialReport = await initial;
  const request = exportOf(B, 640, 360);
  const { done } = startExport({ adapter, request, encode: async () => ({ bytes: 'B' }), limits });
  await flush(); renderer.finishNext();
  const result = await done;
  assert.equal(result.outcome, 'completed');
  assert.notEqual(renderer.mode, initialReport.environment.backend.value);
  assert.notEqual(renderer.diagnostics.device, initialReport.environment.device.value);
  for (const report of [result.report, result.renderReport]) {
    assert.equal(report.requestId, request.requestId);
    assert.deepEqual(report.environment.backend, { value: 'FAKE · DEEP ZOOM', source: 'renderer.mode' });
    assert.deepEqual(report.environment.device, { value: '15 fake workers', source: 'WebGL renderer string' });
  }
  assert.equal(initialReport.environment.backend.value, 'FAKE · DIRECT', 'the earlier report stays immutable');
  assert.equal(initialReport.environment.device.value, '1 fake workers');
});

test('the lease render itself rejects a lost epoch before coloring a non-cooperative completion', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  // Exercise T06 directly: the export job must not mask a broken lease epoch guard.
  const lease = adapter.reserveExclusive(exportOf(A));
  try {
    assert.deepEqual(await lease.admit({ timeoutMs: limits.admissionMs }), { ok: true });
    const rendering = lease.render({ timeoutMs: limits.renderMs });
    adapter.invalidate();
    renderer.finishNext({ ignoreCurrent: true });
    const report = await rendering;
    assert.equal(report.outcome, 'interrupted');
    assert.equal(renderer.colors().length, 1, 'only the non-cooperative fake drew; the lease did not recolor');
    assert.equal(lease.current(), false);
    assert.equal(lease.lost(), true);
  } finally {
    lease.release();
  }
  assert.equal(adapter.unavailable, true, 'release does not restore the lost renderer');
});

test('an admission hold timeout retires the renderer without submitting an export', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A), encode: async () => ({}), limits: { ...limits, admissionMs: 20 }, hooks: { hold: () => new Promise(() => {}) } });
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome, result.blob], ['interrupted', 'interrupted', undefined]);
  assert.match(result.reason, /admission exceeded its time limit/);
  assert.equal(renderer.renders().length, 0);
  assert.equal(adapter.retired, true);
  assert.equal(adapter.reserved, false);
});

test('an admission timeout retains its cause when the device is also lost', async () => {
  for (const holdAdmission of [false, true]) {
    const renderer = createFakeRenderer();
    const adapter = createPlaneRenderAdapter({ renderer, clock });
    if (!holdAdmission) adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive);
    const { done } = startExport({ adapter, request: exportOf(A), encode: async () => ({}), limits: { ...limits, admissionMs: 20 }, hooks: holdAdmission ? { hold: () => new Promise(() => {}) } : {} });
    await flush();
    adapter.invalidate();
    const result = await done;
    assert.deepEqual([result.outcome, result.report.outcome, result.blob], ['interrupted', 'interrupted', undefined]);
    assert.match(result.reason, holdAdmission ? /admission exceeded its time limit/ : /interactive render did not drain in time/);
    assert.doesNotMatch(result.reason, /lost/);
    assert.equal(result.report.reason, result.reason);
    assert.equal(result.report.deviceLost, true);
    assert.equal(result.report.retired, true);
    assert.equal('published' in result.report.timings, false);
    assert.equal(adapter.retired, true);
    assert.equal(adapter.reserved, false);
  }
});

test('an export render timeout retains its cause when the device is also lost', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A), encode: async () => ({}), limits: { ...limits, admissionMs: 5000, renderMs: 20 } });
  await flush();
  assert.equal(renderer.pending.length, 1);
  adapter.invalidate();
  const result = await renderTimeoutResult(done);
  assert.deepEqual([result.outcome, result.report.outcome, result.renderReport.outcome, result.blob], ['interrupted', 'interrupted', 'interrupted', undefined]);
  assert.match(result.reason, /export render exceeded its time limit/);
  assert.equal(result.report.reason, result.renderReport.reason);
  assert.equal(result.report.deviceLost, true);
  assert.equal(result.report.retired, true);
  assert.equal('published' in result.report.timings, false);
  assert.equal(adapter.retired, true);
  assert.equal(adapter.reserved, false);
});

test('an encoding timeout retains its cause when the device is also lost', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A), encode: () => new Promise(() => {}), limits: { ...limits, encodeMs: 20 } });
  await flush(); renderer.finishNext(); await flush();
  adapter.invalidate();
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome, result.renderReport.outcome, result.blob], ['interrupted', 'interrupted', 'completed', undefined]);
  assert.match(result.reason, /image encoding exceeded its time limit/);
  assert.equal(result.report.reason, result.reason);
  assert.equal(result.report.deviceLost, true);
  assert.equal(result.report.retired, true);
  assert.equal('published' in result.report.timings, false);
  assert.equal(adapter.retired, true);
  assert.equal(adapter.reserved, false);
});

for (const throwingStage of EXPORT_STAGES) {
  test(`a throwing ${throwingStage} stage hook cannot interrupt export or leak its lease`, async () => {
    const renderer = createFakeRenderer();
    const adapter = createPlaneRenderAdapter({ renderer, clock });
    const stages = [];
    let job;
    assert.doesNotThrow(() => {
      job = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({ bytes: 'A' }), limits, hooks: { stage: name => {
        stages.push(name);
        if (name === throwingStage) throw new Error(`diagnostic ${name} failed`);
      } } });
    }, 'diagnostic hooks cannot escape startExport');
    // Observe done immediately so a hook rejection is captured before the next turn.
    const settled = job.done.then(result => ({ result }), error => ({ error }));
    await flush();
    if (renderer.pending.length) renderer.finishNext();
    const { result, error } = await settled;
    assert.equal(adapter.reserved, false, 'a throwing stage hook cannot leak the lease');
    assert.equal(error, undefined, 'diagnostic hooks cannot reject done');
    assert.equal(result.outcome, 'completed', 'diagnostic hooks cannot change the export outcome');
    assert.deepEqual(stages, EXPORT_STAGES);
    let next;
    assert.doesNotThrow(() => {
      next = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive);
    }, 'live rendering is usable after a throwing hook');
    renderer.finishNext();
    assert.equal((await next).outcome, 'completed');
  });
}

for (const rejection of ['oops', undefined, null]) {
  test(`an encoder rejection with ${String(rejection)} preserves its reason in the job report`, async () => {
    const renderer = createFakeRenderer();
    const adapter = createPlaneRenderAdapter({ renderer, clock });
    const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => { throw rejection; }, limits });
    await flush(); renderer.finishNext();
    const result = await done;
    assert.deepEqual([result.outcome, result.report.outcome], ['failed', 'failed']);
    assert.equal(result.reason, String(rejection));
    assert.equal(result.report.reason, result.reason);
    assert.equal('published' in result.report.timings, false);
    assert.equal(adapter.reserved, false);
  });
}

test('a device loss after the render report completes interrupts export before encoding', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const color = renderer.color;
  renderer.color = settings => {
    color(settings);
    // Device loss is delivered after the lease's final color, before startExport resumes.
    if (renderer.colors().length === 2) queueMicrotask(() => adapter.invalidate());
  };
  let encoded = false;
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => { encoded = true; return {}; }, limits });
  await flush(); renderer.finishNext();
  const result = await done;
  assert.equal(result.renderReport.outcome, 'completed');
  assert.equal(result.outcome, 'interrupted');
  assert.match(result.reason, /lost/);
  assert.equal(result.report.deviceLost, true);
  assert.equal(result.report.retired, false);
  assert.equal(encoded, false);
  assert.equal(result.blob, undefined);
  assert.equal('published' in result.report.timings, false);
  assert.equal(adapter.reserved, false);
});
