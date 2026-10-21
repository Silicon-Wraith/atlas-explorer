// Project 1a workflows in a real browser (SwiftShader WebGL, headless): native scenes,
// undo and camera history, startup and invalid links, the immutable export and a context loss
// during one (T08). GREEN only: never part of a RED run.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';
import { expectBackend, drainExpecting } from './support/expected-backend.mjs';
import { cleanupWorkflow } from './support/workflow-cleanup.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('workflow');
await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const reportPath = 'artifacts/workflow-report.json';
const report = [], errors = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const INITIAL = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };
let server, browser, context;
const contexts = [];

async function open(context, hash = '', backend = 'webgl') {
  const page = expectBackend(boundContext(await within(context.newPage(), LIMITS.launch, 'newPage')), backend);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${url}/${hash}`, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  return page;
}
const state = page => ev(page, () => ({ scene: atlas.scene, history: atlas.history, rendered: atlas.rendered }));
// Every keyboard and mouse call is bounded (T00 fix round 1; the no-launch suite checks this statically).
const press = (page, key) => within(page.keyboard.press(key), LIMITS.operation, `keyboard.press ${key}`);
const VIEW_B = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4.2 };
const VIEW_C = { re: '0.276', im: '0.008', zoom: 2.4 };
const VIEW_D = { re: '-1.762', im: '0', zoom: 1.6 };

// Installed on every context that runs the export checks: while `__holdWorkers` is set, messages
// to workers (reference orbits, CPU tiles) are queued until `__releaseWorkers()`.
const holdWorkersScript = () => {
  const post = Worker.prototype.postMessage;
  window.__heldWorkerMessages = [];
  Worker.prototype.postMessage = function (...args) {
    if (window.__holdWorkers) { window.__heldWorkerMessages.push(() => post.apply(this, args)); return; }
    return post.apply(this, args);
  };
  window.__releaseWorkers = () => { window.__holdWorkers = false; const held = window.__heldWorkerMessages.splice(0); held.forEach(send => send()); return held.length; };
};
const goToIdle = (page, view) => within(page.evaluate(async target => { atlas.goTo(target); await atlas.whenIdle(); }, view), LIMITS.deep, 'go to view');
// A device-loss check starts from a confirmed state: the view rendered, its publication's GPU
// completion confirmed, and any earlier recovery episode closed by that confirmation (otherwise the
// next loss would rightly pause automatic recovery).
async function settledAt(page, view) {
  await goToIdle(page, view);
  await ev(page, () => atlas.whenDrawn({ timeoutMs: 60000 }), undefined, 'confirm the publication', LIMITS.deep);
  await page.waitForFunction(() => atlas.recovery.attempts === 0 && !atlas.recovery.paused, null, { timeout: LIMITS.deep });
}
const waitStage = (page, name, ms = LIMITS.operation) => page.waitForFunction(stage => window.__exportStages.includes(stage), name, { timeout: ms });
// Export observers for the next export: stages are recorded; `holds` names stages released by
// `__releaseExport(name)`; `throwAt` makes the observer throw at that stage; `limits` shortens the
// export's deadlines (a test seam of atlas.setExportHooks).
const armExport = (page, options = {}) => ev(page, ({ holds = [], throwAt = null, limits = null }) => {
  window.__exportStages = [];
  const pending = {};
  window.__releaseExport = name => pending[name]?.();
  atlas.setExportHooks({
    stage(name) { window.__exportStages.push(name); if (name === throwAt) throw new Error(`observer failed at ${name}`); },
    hold: name => (holds.includes(name) ? new Promise(resolve => { pending[name] = resolve; }) : undefined),
    limits,
  });
  document.querySelector('#export-size').value = 'current';
}, options);
const exportResult = page => ev(page, () => ({ lastExport: atlas.lastExport, scene: atlas.scene, stages: window.__exportStages }), undefined, 'export result');
// Context loss, witnessed on the canvas. The extension is requested afresh each time: a restored
// context invalidates the extension objects of its lost incarnation.
const loseContext = page => ev(page, () => { window.__loseContext = atlas.renderer.gl.getExtension('WEBGL_lose_context'); window.__loseContext.loseContext(); });
const restoreContext = page => ev(page, () => window.__loseContext.restoreContext());
const waitEvents = (page, events, ms = LIMITS.operation) => page.waitForFunction(expected => JSON.stringify(window.__contextEvents) === expected, JSON.stringify(events), { timeout: ms });
const watchContext = page => ev(page, () => {
  window.__contextEvents = [];
  if (!window.__contextListening) {
    window.__contextListening = true;
    const canvas = document.querySelector('#fractal');
    canvas.addEventListener('webglcontextlost', () => window.__contextEvents.push('lost'));
    canvas.addEventListener('webglcontextrestored', () => window.__contextEvents.push('restored'));
  }
});
// Application-side facts while the renderer is lost, plus a witness that the renderer object was
// not replaced (`atlas.renderer.__witness` is set on it before the loss).
const lostState = page => ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null, witness: atlas.renderer.__witness ?? null, state: atlas.device.state, webgl: !!atlas.renderer.gl, events: [...window.__contextEvents] }));

// One export of the current viewport of `view`. With `withEdits`, three phases are witnessed
// before the page edits the live scene: admission held by a hook; the export render pending on a
// held worker message (the view is switched away and back first, so the export misses the
// renderer's reference cache, and nothing has been published); encoding held by a hook.
async function exportViewport(page, view, withEdits) {
  if (withEdits) await goToIdle(page, VIEW_C);
  await armExport(page, { holds: withEdits ? ['admission', 'encoding'] : [] });
  await ev(page, ({ target, edits }) => { atlas.goTo(target); window.__holdWorkers = edits; document.querySelector('#download-image').click(); }, { target: view, edits: withEdits });
  if (withEdits) {
    await waitStage(page, 'admission');
    await ev(page, other => { document.querySelector('[data-palette="aurora"]').click(); atlas.goTo(other); window.__releaseExport('admission'); }, VIEW_C);
    await page.waitForFunction(() => window.__exportStages.includes('render-submitted') && window.__heldWorkerMessages.length > 0, null, { timeout: LIMITS.operation });
    const pending = await ev(page, () => ({ stages: [...window.__exportStages], lastExport: atlas.lastExport }));
    assert.ok(!pending.stages.includes('encoding'), 'the export render is still pending on its held worker message');
    await ev(page, other => { document.querySelector('[data-palette="rose"]').click(); atlas.goTo(other); return window.__releaseWorkers(); }, VIEW_D);
    await waitStage(page, 'encoding', LIMITS.deep);
    await ev(page, other => { document.querySelector('[data-palette="ocean"]').click(); atlas.goTo(other); window.__releaseExport('encoding'); }, VIEW_D);
  }
  await waitStage(page, 'finished', LIMITS.deep);
  const result = await exportResult(page);
  await ev(page, () => atlas.setExportHooks(null));
  await idleWithin(page, LIMITS.deep);
  return result;
}

// The same export with and without edits during admission, rendering and encoding must decode to
// identical RGBA pixels (compared in the page), and must report the scene captured at the click.
// The export's pixels are read back, so this comparison is truthful about the image itself.
async function checkExportImmutability(page, label) {
  await goToIdle(page, VIEW_B);
  const exportedScene = await ev(page, () => atlas.scene);
  const baseline = await exportViewport(page, VIEW_B, false);
  await ev(page, async () => { window.__baselineImage = await atlas.lastExportImageData(); }, undefined, 'decode baseline', LIMITS.deep);
  const raced = await exportViewport(page, VIEW_B, true);
  assert.deepEqual(raced.stages, ['reserved', 'admission', 'render-submitted', 'encoding', 'finished'], `${label}: every stage was reached`);
  for (const result of [baseline, raced]) {
    assert.equal(result.lastExport.outcome, 'completed', label);
    assert.equal(result.lastExport.report.outcome, 'completed');
    assert.equal(result.lastExport.renderReport.outcome, 'completed');
    assert.deepEqual(result.lastExport.hookErrors, [], `${label}: the stage observers raised nothing`);
    assert.deepEqual(result.lastExport.scene, exportedScene, `${label}: the export reports the scene captured at the click`);
  }
  const pixels = await ev(page, async () => {
    const before = window.__baselineImage, after = await atlas.lastExportImageData();
    let differing = 0;
    for (let i = 0; i < before.data.length; i++) if (before.data[i] !== after.data[i]) differing++;
    return { width: [before.width, after.width], height: [before.height, after.height], samples: after.data.length / 4, differing };
  }, undefined, 'compare pixels', LIMITS.deep);
  assert.equal(pixels.width[0], pixels.width[1]); assert.equal(pixels.height[0], pixels.height[1]);
  assert.ok(pixels.samples > 0);
  assert.equal(pixels.differing, 0, `${label}: edits during admission, rendering and encoding changed the exported pixels`);
  assert.deepEqual(raced.scene.camera, VIEW_D, 'the live scene kept the later edits');
  assert.equal(raced.scene.appearance.palette, 'ocean');
}

// A stage observer that throws is isolated from the export and collected as a diagnostic error
// (plan amendment F, finalized in T08 fix round 1), so a broken test hook cannot pass unnoticed.
async function checkObserverErrorsCollected(page) {
  await goToIdle(page, VIEW_B);
  await armExport(page, { throwAt: 'encoding' });
  await ev(page, () => document.querySelector('#download-image').click());
  await waitStage(page, 'finished', LIMITS.deep);
  const result = await exportResult(page);
  await ev(page, () => atlas.setExportHooks(null));
  await idleWithin(page, LIMITS.deep);
  assert.equal(result.lastExport.outcome, 'completed', 'the observer did not change the export outcome');
  assert.deepEqual(result.stages, ['reserved', 'admission', 'render-submitted', 'encoding', 'finished']);
  assert.deepEqual(result.lastExport.hookErrors, [{ stage: 'encoding', message: 'observer failed at encoding' }]);
}

// atlas.whenDrawn: GPU completion of one publication (queue completion by a fence created at the
// publication; the CPU fallback paints synchronously). It is not a render, and a publication
// superseded before its fence signals is rejected rather than silently replaced by the newer one.
async function checkWhenDrawn(page, backend) {
  await goToIdle(page, VIEW_B);
  const drawn = await ev(page, async () => {
    const before = atlas.rendered, device = atlas.device;
    const evidence = await atlas.whenDrawn({ timeoutMs: 60000 });
    return { evidence, reportId: atlas.lastReport.reportId, requestId: atlas.lastReport.requestId, rendered: atlas.rendered, before, device };
  }, undefined, 'whenDrawn', LIMITS.deep);
  assert.equal(drawn.evidence.reportId, drawn.reportId, `${backend}: the evidence names the current publication`);
  assert.equal(drawn.evidence.requestId, drawn.requestId);
  assert.equal(drawn.evidence.deviceEpoch, drawn.device.deviceEpoch);
  assert.equal(drawn.evidence.source, backend === 'webgl' ? 'queue-completion' : 'synchronous-paint');
  assert.equal(drawn.evidence.clock, 'page-performance-now');
  assert.equal(drawn.rendered, drawn.before, 'whenDrawn renders nothing');
  if (backend === 'webgl') assert.ok(drawn.evidence.polls >= 1, 'a fence was polled after a yield');
  const superseded = await ev(page, async () => {
    const report = atlas.lastReport;
    const pending = atlas.whenDrawn({ report, timeoutMs: 60000 });
    document.querySelector('[data-palette="rose"]').click();
    const outcome = await pending.then(evidence => ({ resolved: evidence.reportId }), error => ({ code: error.code, message: error.message }));
    return { outcome, recolored: atlas.lastReport.reportId !== report.reportId, reportId: report.reportId };
  }, undefined, 'supersession', LIMITS.deep);
  assert.equal(superseded.recolored, true, 'the palette edit published a new report');
  if (backend === 'webgl') assert.equal(superseded.outcome.code, 'superseded', `${backend}: ${JSON.stringify(superseded.outcome)}`);
  else assert.equal(superseded.outcome.resolved, superseded.reportId, 'a synchronous paint completed before the edit');
  const recolored = await ev(page, async () => ({ evidence: await atlas.whenDrawn({ timeoutMs: 60000 }), reportId: atlas.lastReport.reportId }), undefined, 'whenDrawn after recolor', LIMITS.deep);
  assert.equal(recolored.evidence.reportId, recolored.reportId, `${backend}: a recolor is a publication with its own completion`);
  // One deadline for submission and completion: an exhausted bound rejects (it never grants fresh
  // time to the fence or the paint), and the bound itself must be positive and finite.
  const deadlines = await ev(page, async other => {
    const outcome = promise => promise.then(() => 'resolved', error => error.code ?? error.name);
    const invalid = await outcome(atlas.whenDrawn({ timeoutMs: 0 }));
    atlas.goTo(other);
    const exhausted = await outcome(atlas.whenDrawn({ timeoutMs: 5 }));
    await atlas.whenIdle();
    return { invalid, exhausted };
  }, VIEW_C, 'whenDrawn deadlines', LIMITS.deep);
  assert.equal(deadlines.invalid, 'RangeError');
  assert.ok(['ATLAS_IDLE_TIMEOUT', 'timeout'].includes(deadlines.exhausted), `${backend}: a bound exhausted by submission rejects (${deadlines.exhausted})`);
}

// Saving a discovery while an export holds the renderer is refused: the canvas shows the export,
// and a deferred appearance edit would pair the live settings with the export's pixels.
async function checkSaveDuringExport(page) {
  await goToIdle(page, VIEW_B);
  await armExport(page, { holds: ['encoding'] });
  await ev(page, () => document.querySelector('#download-image').click());
  await waitStage(page, 'encoding', LIMITS.deep);
  const refused = await ev(page, () => {
    const count = () => JSON.parse(localStorage.getItem('atlas.discoveries') || '[]').length;
    const before = count();
    document.querySelector('[data-palette="aurora"]').click();
    document.querySelector('#bookmark-button').click();
    return { before, after: count(), toast: document.querySelector('#toast').textContent, palette: atlas.scene.appearance.palette };
  });
  assert.equal(refused.after, refused.before, 'no discovery was saved during the lease');
  assert.match(refused.toast, /finish/);
  assert.equal(refused.palette, 'aurora', 'the live scene kept the edit');
  await ev(page, () => window.__releaseExport('encoding'));
  await waitStage(page, 'finished', LIMITS.deep);
  await ev(page, () => atlas.setExportHooks(null));
  await idleWithin(page, LIMITS.deep);
  const accepted = await ev(page, () => {
    const count = () => JSON.parse(localStorage.getItem('atlas.discoveries') || '[]').length;
    const before = count();
    document.querySelector('#bookmark-button').click();
    return { before, after: count(), toast: document.querySelector('#toast').textContent };
  });
  assert.equal(accepted.after, accepted.before + 1, `once the live scene is rendered a save is accepted: ${accepted.toast}`);
}

// A context loss while encoding is held, in both orders of restoration and lease release. The
// loss and restoration events are witnessed; the export is interrupted; while the renderer is lost
// nothing is adopted, published or replaced (application-side facts: atlas.rendered, atlas.lastReport,
// the renderer witness); live edits made meanwhile only change the live scene; the replacement waits
// for the lease; and live rendering resumes on one WebGL renderer shared by the workspace and the
// adapter (never a silent CPU fallback), rendering the edited scene.
async function checkContextLossDuringExport(page, restoreFirst) {
  await settledAt(page, VIEW_B);
  await watchContext(page);
  await armExport(page, { holds: ['encoding'] });
  await ev(page, () => { atlas.renderer.__witness = 'before-loss'; document.querySelector('#download-image').click(); });
  await waitStage(page, 'encoding', LIMITS.deep);
  const epochBefore = await ev(page, () => atlas.device.deviceEpoch);
  await loseContext(page);
  await waitEvents(page, ['lost']);
  const lost = await lostState(page);
  assert.deepEqual({ report: lost.report, state: lost.state }, { report: null, state: 'lost' }, 'a lost context has no publication to describe');
  await ev(page, other => { document.querySelector('[data-palette="aurora"]').click(); atlas.goTo(other); }, VIEW_C);
  if (restoreFirst) {
    await restoreContext(page);
    await waitEvents(page, ['lost', 'restored']);
    await page.waitForTimeout(300);
    assert.deepEqual(await lostState(page), { ...lost, events: ['lost', 'restored'] }, 'restoration during the lease replaces nothing until release');
  }
  await ev(page, () => window.__releaseExport('encoding'));
  await waitStage(page, 'finished', LIMITS.deep);
  await ev(page, () => atlas.setExportHooks(null));
  if (!restoreFirst) {
    await page.waitForTimeout(500);
    assert.deepEqual(await lostState(page), lost, 'nothing is adopted, published or replaced while the context is lost');
    await restoreContext(page);
    await waitEvents(page, ['lost', 'restored']);
  }
  await page.waitForFunction(count => atlas.rendered > count, lost.rendered, { timeout: LIMITS.deep });
  await idleWithin(page, LIMITS.deep);
  const after = await ev(page, () => ({ outcome: atlas.lastExport.outcome, report: atlas.lastExport.report.outcome, deviceLost: atlas.lastExport.report.deviceLost, retired: atlas.lastExport.report.retired, hookErrors: atlas.lastExport.hookErrors, consistent: atlas.rendererConsistent, webgl: !!atlas.renderer.gl, state: atlas.device.state, epoch: atlas.device.deviceEpoch, exportButtonBusy: document.querySelector('#download-image').disabled, restartOffered: !document.querySelector('#restart-export').hidden, events: window.__contextEvents, camera: atlas.scene.camera, palette: atlas.scene.appearance.palette }));
  const { epoch, ...rest } = after;
  assert.deepEqual(rest, { outcome: 'interrupted', report: 'interrupted', deviceLost: true, retired: false, hookErrors: [], consistent: true, webgl: true, state: 'ready', exportButtonBusy: false, restartOffered: true, events: ['lost', 'restored'], camera: VIEW_C, palette: 'aurora' });
  assert.ok(epoch > epochBefore, 'the replacement advanced the device epoch');
}

// A lease timeout while the context is still lost retires the renderer but must not replace it
// until restoration: a replacement on a lost context would silently fall back to the CPU.
async function checkLeaseTimeoutWhileLost(page) {
  await settledAt(page, VIEW_B);
  await watchContext(page);
  await armExport(page, { holds: ['encoding'], limits: { encodeMs: 400 } });
  await ev(page, () => { atlas.renderer.__witness = 'before-loss'; document.querySelector('#download-image').click(); });
  await waitStage(page, 'encoding', LIMITS.deep);
  await loseContext(page);
  await waitEvents(page, ['lost']);
  const lost = await lostState(page);
  await waitStage(page, 'finished', LIMITS.operation);
  await page.waitForTimeout(500);
  const gap = await ev(page, () => ({ outcome: atlas.lastExport.outcome, reason: atlas.lastExport.reason, retired: atlas.lastExport.report.retired, deviceLost: atlas.lastExport.report.deviceLost, adapterRetired: atlas.device.state }));
  assert.equal(gap.outcome, 'interrupted'); assert.match(gap.reason, /time limit/);
  assert.deepEqual({ retired: gap.retired, deviceLost: gap.deviceLost }, { retired: true, deviceLost: true }, 'the timeout keeps its cause and records the loss');
  assert.deepEqual(await lostState(page), lost, 'a retired renderer is not replaced while the context is lost');
  await ev(page, () => atlas.setExportHooks(null));
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored']);
  await page.waitForFunction(count => atlas.rendered > count, lost.rendered, { timeout: LIMITS.deep });
  await idleWithin(page, LIMITS.deep);
  assert.deepEqual(await ev(page, () => ({ state: atlas.device.state, consistent: atlas.rendererConsistent, webgl: !!atlas.renderer.gl, restartOffered: !document.querySelector('#restart-export').hidden })), { state: 'ready', consistent: true, webgl: true, restartOffered: true });
}

// Loss, restoration while the lease is held, a second loss, then release: the restoration seen
// earlier does not license a replacement on the context lost since.
async function checkSecondLossBeforeRelease(page) {
  await settledAt(page, VIEW_B);
  await watchContext(page);
  await armExport(page, { holds: ['encoding'] });
  await ev(page, () => { atlas.renderer.__witness = 'before-loss'; document.querySelector('#download-image').click(); });
  await waitStage(page, 'encoding', LIMITS.deep);
  await loseContext(page);
  await waitEvents(page, ['lost']);
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored']);
  await loseContext(page);
  await waitEvents(page, ['lost', 'restored', 'lost']);
  const lost = await lostState(page);
  assert.deepEqual({ witness: lost.witness, state: lost.state }, { witness: 'before-loss', state: 'lost' });
  await ev(page, () => window.__releaseExport('encoding'));
  await waitStage(page, 'finished', LIMITS.deep);
  await ev(page, () => atlas.setExportHooks(null));
  await page.waitForTimeout(500);
  assert.deepEqual(await lostState(page), lost, 'release after a second loss replaces nothing');
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored', 'lost', 'restored']);
  await page.waitForFunction(count => atlas.rendered > count, lost.rendered, { timeout: LIMITS.deep });
  await idleWithin(page, LIMITS.deep);
  assert.deepEqual(await ev(page, () => ({ state: atlas.device.state, consistent: atlas.rendererConsistent, webgl: !!atlas.renderer.gl, outcome: atlas.lastExport.outcome })), { state: 'ready', consistent: true, webgl: true, outcome: 'interrupted' });
}

// An interrupted export keeps its request and snapshot; the offered restart exports exactly that
// snapshot at the retained dimensions, whatever the live scene has become since (spec §14).
async function checkExportRestart(page) {
  const retained = await ev(page, () => ({ lastExport: atlas.lastExport, offered: !document.querySelector('#restart-export').hidden }));
  assert.equal(retained.lastExport.outcome, 'interrupted'); assert.equal(retained.offered, true, 'a restart is offered');
  await goToIdle(page, VIEW_D);
  await armExport(page);
  await ev(page, () => document.querySelector('#restart-export').click());
  await waitStage(page, 'finished', LIMITS.deep);
  const result = await ev(page, () => ({ lastExport: atlas.lastExport, scene: atlas.scene, offered: !document.querySelector('#restart-export').hidden, stages: window.__exportStages }));
  await ev(page, () => atlas.setExportHooks(null));
  await idleWithin(page, LIMITS.deep);
  assert.deepEqual(result.stages, ['reserved', 'admission', 'render-submitted', 'encoding', 'finished']);
  assert.equal(result.lastExport.outcome, 'completed');
  assert.equal(result.lastExport.restartOf, retained.lastExport.requestId, 'the restart names the interrupted job');
  assert.notEqual(result.lastExport.requestId, retained.lastExport.requestId, 'a restart is a new request');
  assert.deepEqual(result.lastExport.scene, retained.lastExport.scene, 'the retained snapshot was exported, not the live scene');
  assert.deepEqual(result.lastExport.report.requested, retained.lastExport.report.requested, 'the retained dimensions were kept');
  assert.deepEqual(result.scene.camera, VIEW_D, 'the live scene is untouched');
  assert.equal(result.offered, false, 'a completed restart withdraws the offer');
}

// After a loss the view is recovered automatically once; the recovery counts as successful only when
// its publication's GPU completion (or CPU paint) is confirmed, never on the application-side return.
// A loss before that confirmation stops automatic retries: the renderer is replaced but nothing
// renders — queued desired state, tour frames and other automatic requests included — until the
// explorer resumes explicitly (spec §14, charter §3.10). `rendered` and `whenIdle` stay app-side.
const pausedState = page => ev(page, () => ({ rendered: atlas.rendered, recovery: atlas.recovery, state: atlas.device.state, webgl: !!atlas.renderer.gl, consistent: atlas.rendererConsistent, resumeOffered: !document.querySelector('#resume-rendering').hidden, status: document.querySelector('#render-status').textContent, tourActive: !document.querySelector('#tour-status').hidden }));
async function resumeAndConfirm(page, renderedBefore) {
  await ev(page, () => document.querySelector('#resume-rendering').click());
  await page.waitForFunction(count => atlas.rendered > count, renderedBefore, { timeout: LIMITS.deep });
  await idleWithin(page, LIMITS.deep);
  const confirmed = await ev(page, async () => { const evidence = await atlas.whenDrawn({ timeoutMs: 60000 }); return { evidence: evidence.source, recovery: atlas.recovery, resumeOffered: !document.querySelector('#resume-rendering').hidden }; }, undefined, 'confirm recovery', LIMITS.deep);
  assert.deepEqual(confirmed, { evidence: 'queue-completion', recovery: { attempts: 0, paused: false }, resumeOffered: false }, 'a confirmed completion ends the recovery episode');
}
async function checkRepeatedLossPausesRecovery(page) {
  await settledAt(page, VIEW_B);
  await watchContext(page);
  const before = await ev(page, () => ({ rendered: atlas.rendered, recovery: atlas.recovery }));
  assert.deepEqual(before.recovery, { attempts: 0, paused: false });

  // Phase 1: the application-side return of the recovery render does not end the episode. The second
  // loss is raised in the same task that observed the return, before any completion poll could run.
  await loseContext(page);
  await waitEvents(page, ['lost']);
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored']);
  const submitted = await ev(page, async count => {
    while (atlas.rendered <= count) await new Promise(resolve => setTimeout(resolve, 5));
    const recovery = atlas.recovery;
    window.__loseContext = atlas.renderer.gl.getExtension('WEBGL_lose_context'); window.__loseContext.loseContext();
    return { rendered: atlas.rendered, recovery };
  }, before.rendered, 'recovery submitted', LIMITS.deep);
  assert.deepEqual(submitted.recovery, { attempts: 1, paused: false }, 'the application-side return leaves the recovery unconfirmed');
  await waitEvents(page, ['lost', 'restored', 'lost']);
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored', 'lost', 'restored']);
  await page.waitForTimeout(500);
  let paused = await pausedState(page);
  assert.deepEqual({ ...paused, status: undefined }, { rendered: submitted.rendered, recovery: { attempts: 1, paused: true }, state: 'ready', webgl: true, consistent: true, resumeOffered: true, status: undefined, tourActive: false }, 'a loss before the recovery is confirmed pauses automatic rendering');
  assert.match(paused.status, /paused/i);
  await resumeAndConfirm(page, submitted.rendered);

  // Phase 2: desired state queued during the recovery (a user navigation while the recovery render is
  // pending on its held reference orbit) stays queued through the pause; nothing renders until resume.
  await watchContext(page);
  const beforeQueue = await ev(page, () => ({ rendered: atlas.rendered }));
  await ev(page, () => { window.__holdWorkers = true; });
  await loseContext(page);
  await waitEvents(page, ['lost']);
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored']);
  await page.waitForFunction(() => window.__heldWorkerMessages.length > 0, null, { timeout: LIMITS.operation });
  const recovering = await ev(page, other => { atlas.goTo(other); return { rendered: atlas.rendered, recovery: atlas.recovery, state: atlas.device.state }; }, VIEW_C);
  assert.deepEqual(recovering, { rendered: beforeQueue.rendered, recovery: { attempts: 1, paused: false }, state: 'ready' }, 'the recovery render is pending and newer work is queued');
  await loseContext(page);
  await waitEvents(page, ['lost', 'restored', 'lost']);
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored', 'lost', 'restored']);
  await page.waitForTimeout(500);
  paused = await pausedState(page);
  const released = await ev(page, () => window.__releaseWorkers());
  assert.deepEqual({ ...paused, status: undefined }, { rendered: beforeQueue.rendered, recovery: { attempts: 1, paused: true }, state: 'ready', webgl: true, consistent: true, resumeOffered: true, status: undefined, tourActive: false }, 'queued work does not render while paused');
  assert.ok(released >= 1, 'the stale recovery request was held');
  await resumeAndConfirm(page, beforeQueue.rendered);
  assert.deepEqual((await state(page)).scene.camera, VIEW_C, 'the queued navigation rendered on resume');

  // Phase 3: a running tour keeps requesting frames while paused; those automatic requests never
  // clear the pause. Only the explicit resume does.
  await watchContext(page);
  const beforeTour = await ev(page, () => ({ rendered: atlas.rendered }));
  await ev(page, () => { window.__holdWorkers = true; document.querySelector('#tour-button').click(); });
  await page.waitForFunction(() => window.__heldWorkerMessages.length > 0, null, { timeout: LIMITS.operation });
  await loseContext(page);
  await waitEvents(page, ['lost']);
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored']);
  await page.waitForTimeout(300);
  await loseContext(page);
  await waitEvents(page, ['lost', 'restored', 'lost']);
  await restoreContext(page);
  await waitEvents(page, ['lost', 'restored', 'lost', 'restored']);
  await page.waitForTimeout(600);
  paused = await pausedState(page);
  assert.deepEqual({ ...paused, status: undefined }, { rendered: beforeTour.rendered, recovery: { attempts: 1, paused: true }, state: 'ready', webgl: true, consistent: true, resumeOffered: true, status: undefined, tourActive: true }, 'tour frames do not clear the pause');
  await ev(page, () => { document.querySelector('#stop-tour').click(); window.__releaseWorkers(); });
  await page.waitForTimeout(200);
  assert.equal((await pausedState(page)).recovery.paused, true, 'stopping the tour is not a resume either');
  await resumeAndConfirm(page, beforeTour.rendered);
}

try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  contexts.push(context);
  await context.addInitScript(holdWorkersScript);
  const page = await open(context);

  const fresh = await state(page);
  assert.equal(fresh.scene.workspace, 'plane');
  assert.deepEqual(fresh.scene.camera, INITIAL);
  assert.equal(fresh.history.canBack, false);
  assert.equal(fresh.history.canUndo, false);
  pass('Fresh start opens Plane at the default view');

  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await idleWithin(page);
  const zoomed = await state(page);
  assert.equal(zoomed.scene.appearance.palette, 'aurora');
  await press(page, 'Control+z');
  const undone = await state(page);
  assert.equal(undone.scene.appearance.palette, 'ember');
  assert.deepEqual(undone.scene.camera, zoomed.scene.camera, 'undoing the palette keeps the camera');
  assert.equal(undone.rendered, zoomed.rendered, 'an appearance undo recolors without recalculating');
  pass('Palette edit, navigation and undo keep the camera');

  const urlBefore = page.url();
  await ev(page, () => { window.__atlasPageMarker = 'still-here'; });
  await press(page, 'Alt+ArrowLeft');
  await idleWithin(page);
  assert.equal(page.url(), urlBefore, 'Alt+Left must not navigate the browser');
  assert.equal(await ev(page, () => window.__atlasPageMarker), 'still-here', 'the page was not reloaded or replaced');
  const back = await state(page);
  assert.deepEqual(back.scene.camera, INITIAL);
  assert.equal(back.scene.appearance.palette, 'ember', 'Back moves only the camera');
  await press(page, 'Alt+ArrowRight');
  await idleWithin(page);
  assert.deepEqual((await state(page)).scene.camera, zoomed.scene.camera);
  pass('Camera back and forward restore poses without touching content');

  const beforeEntry = await state(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('1e1000000000000'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('0');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  assert.match(await page.locator('#coordinate-error').textContent(), /budget/);
  assert.equal(await page.locator('#input-re').inputValue(), '1e1000000000000', 'the requested text is preserved');
  await press(page, 'Escape');
  const afterEntry = await state(page);
  assert.deepEqual(afterEntry.scene, beforeEntry.scene);
  assert.deepEqual(afterEntry.history, beforeEntry.history, 'neither history changes');
  pass('An oversized coordinate is rejected before it is expanded');

  const beforeDrag = await state(page);
  await page.locator('#phase').scrollIntoViewIfNeeded();
  const slider = await page.locator('#phase').boundingBox();
  await within(page.mouse.move(slider.x + slider.width * 0.2, slider.y + slider.height / 2), LIMITS.operation, 'mouse.move');
  await within(page.mouse.down(), LIMITS.operation, 'mouse.down');
  await within(page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 6 }), LIMITS.operation, 'mouse.move');
  await within(page.mouse.up(), LIMITS.operation, 'mouse.up');
  const afterDrag = await state(page);
  assert.notEqual(afterDrag.scene.appearance.phase, beforeDrag.scene.appearance.phase);
  assert.equal(afterDrag.history.undoDepth, beforeDrag.history.undoDepth + 1, 'one drag is one undo entry');
  await ev(page, () => document.activeElement?.blur());
  await press(page, 'Control+z');
  assert.equal((await state(page)).scene.appearance.phase, beforeDrag.scene.appearance.phase);
  pass('A slider drag is one undo entry');

  const beforeWheel = await state(page);
  await within(page.evaluate(async () => {
    const surface = document.querySelector('#fractal-surface');
    for (let i = 0; i < 5; i++) {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, clientX: 640, clientY: 360, bubbles: true, cancelable: true }));
      await new Promise(resolveStep => setTimeout(resolveStep, 15));
    }
    await new Promise(resolveQuiet => setTimeout(resolveQuiet, 400));
    await atlas.whenIdle();
  }), LIMITS.operation, 'wheel burst');
  const afterWheel = await state(page);
  assert.ok(afterWheel.scene.camera.zoom > beforeWheel.scene.camera.zoom);
  assert.equal(afterWheel.history.camera.length, beforeWheel.history.camera.index + 2, 'a wheel burst is one camera-history entry');
  assert.equal(afterWheel.history.undoDepth, beforeWheel.history.undoDepth, 'navigation never adds an undo entry');
  pass('A wheel burst is one camera-history entry');

  const before = await state(page);
  await ev(page, () => { location.hash = '#scene=@@@'; });
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('visible'), null, { timeout: LIMITS.operation });
  assert.match(await page.locator('#toast').textContent(), /unchanged/);
  const after = await state(page);
  assert.deepEqual(after.scene, before.scene);
  assert.deepEqual(after.history, before.history, 'neither history changes');
  pass('An invalid link during an investigation changes nothing');

  await checkExportImmutability(page, 'WebGL');
  pass('An edit during a WebGL export does not change the exported image');
  await checkObserverErrorsCollected(page);
  pass('Export observer errors are collected without changing the export');
  await checkWhenDrawn(page, 'webgl');
  await checkSaveDuringExport(page);
  pass('Saving a discovery during an export is refused');
  await checkContextLossDuringExport(page, true);
  await checkContextLossDuringExport(page, false);
  pass('A context loss during an export interrupts it and live rendering resumes');
  await checkExportRestart(page);
  pass('An interrupted export restarts with its retained request');
  await checkLeaseTimeoutWhileLost(page);
  await checkSecondLossBeforeRelease(page);
  pass('A lease timeout or a second loss never replaces the renderer while the context is lost');
  await checkRepeatedLossPausesRecovery(page);
  pass('Repeated loss stops automatic recovery until the explorer resumes');

  const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  contexts.push(cpuContext);
  await cpuContext.addInitScript(holdWorkersScript);
  await cpuContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  const cpu = await open(cpuContext, '', 'cpu');
  assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
  await checkExportImmutability(cpu, 'CPU');
  pass('An edit during a CPU export does not change the exported image');
  await checkWhenDrawn(cpu, 'cpu');
  pass('A drawn publication is confirmed by its fence on WebGL and by its paint on the CPU');

  const earlier = await open(context, '#re=-2&im=0&z=40&palette=rose');
  assert.deepEqual((await state(earlier)).scene.camera, INITIAL);
  assert.match(await earlier.locator('#toast').textContent(), /earlier ATLAS format/);
  pass('An earlier-format link opens fresh-start Plane with a notice');

  // Pointer lifecycle (fix round 1, Codex findings 2 and 1). A held mouse drag, then Back: the drag
  // settles as a pose, the previous pose is restored, and the still-held pointer navigates no more.
  const beforeHold = await state(page);
  await within(page.mouse.move(600, 420), LIMITS.operation, 'mouse.move'); await within(page.mouse.down(), LIMITS.operation, 'mouse.down');
  await within(page.mouse.move(650, 450, { steps: 5 }), LIMITS.operation, 'mouse.move');
  await idleWithin(page);
  assert.notEqual((await state(page)).scene.camera.re, beforeHold.scene.camera.re, 'the held drag is previewing');
  await press(page, 'Alt+ArrowLeft');
  await idleWithin(page);
  const restored = await state(page);
  assert.deepEqual(restored.scene.camera, beforeHold.scene.camera, 'Back settles the held drag as a pose and restores the one before it');
  assert.equal(restored.history.canForward, true, 'the settled drag is the forward pose');
  await within(page.mouse.move(700, 500, { steps: 5 }), LIMITS.operation, 'mouse.move');
  await idleWithin(page);
  assert.deepEqual((await state(page)).scene.camera, beforeHold.scene.camera, 'the still-held pointer no longer navigates');
  await within(page.mouse.up(), LIMITS.operation, 'mouse.up');
  await idleWithin(page);
  const released = await state(page);
  assert.deepEqual(released.scene.camera, beforeHold.scene.camera, 'release changes nothing');
  assert.deepEqual(released.history.camera, restored.history.camera, 'release records no pose');
  assert.equal(released.history.canForward, true, 'the forward branch survives');
  assert.equal(released.history.undoDepth, beforeHold.history.undoDepth);
  pass('Back stops captured navigation and keeps the forward branch');

  // A second finger joining a drag continues the same gesture: one camera-history entry at release.
  const touchContext = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true }), LIMITS.launch, 'newContext'));
  contexts.push(touchContext);
  const touchPage = await open(touchContext);
  const touch = await within(touchContext.newCDPSession(touchPage), LIMITS.operation, 'newCDPSession');
  const touchEvent = (type, touchPoints) => within(touch.send('Input.dispatchTouchEvent', { type, touchPoints }), LIMITS.operation, `touch ${type}`);
  const beforePinch = await state(touchPage);
  await touchEvent('touchStart', [{ x: 600, y: 500, id: 1 }]);
  await touchEvent('touchMove', [{ x: 640, y: 520, id: 1 }]);
  await touchEvent('touchStart', [{ x: 640, y: 520, id: 1 }, { x: 800, y: 520, id: 2 }]);
  await touchEvent('touchMove', [{ x: 620, y: 520, id: 1 }, { x: 840, y: 520, id: 2 }]);
  await touchEvent('touchEnd', []);
  await idleWithin(touchPage);
  const afterPinch = await state(touchPage);
  assert.notEqual(afterPinch.scene.camera.re, beforePinch.scene.camera.re, 'the first finger dragged');
  assert.ok(afterPinch.scene.camera.zoom > beforePinch.scene.camera.zoom, 'the second finger pinched');
  assert.equal(afterPinch.history.camera.length, beforePinch.history.camera.length + 1, 'a drag that gains a finger is one camera-history entry');
  assert.equal(afterPinch.history.undoDepth, beforePinch.history.undoDepth, 'navigation never adds an undo entry');
  await within(touch.detach(), LIMITS.operation, 'touch.detach');
  pass('A second finger joins the drag without committing it');

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  process.exitCode = 1;
  console.error(error);
} finally {
  // Every page is drained through T00b's shared fence-and-readback drain before the bounded closes,
  // with the backend each page was opened on (drainExpecting). A drain that fails is recorded in the
  // report and fails the suite; the bounded closes still run (T05 fix round 1, Codex finding 3;
  // tests in tests/unit/no-launch.test.js).
  const failed = await cleanupWorkflow({
    pages: contexts.flatMap(open => open.pages()),
    drain: page => drainExpecting(page),
    report, writeReport: entries => writeFile(reportPath, JSON.stringify(entries, null, 2)),
    closeAll: async () => { for (const open of contexts) await closeWithin(open, 'context'); await closeWithin(browser, 'browser'); server?.kill('SIGTERM'); },
  });
  if (failed) process.exitCode = 1;
}
