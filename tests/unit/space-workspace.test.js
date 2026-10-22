// The Space workspace (plan B14): activation, deactivation, scene files and the controller frame
// order, on a fake DOM and the self-driving fake backend. No browser, GPU or Worker is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser, fakeShell } from '../support/fake-dom.mjs';
import { createDrivenFakeBackend } from '../support/fake-space-backend.mjs';
import { createFlight } from '../../src/space/flight.js';
import { createGamepadInput } from '../../src/space/gamepad.js';
import { encodeSceneFile, sceneCodec } from '../../src/space/scene-adapter.js';
import { orbit, overview } from '../../src/space/camera.js';
import { getModel } from '../../src/space/models/registry.js';
import { effectiveParameters } from '../../src/space/numerics/parameters.js';

const browser = installFakeBrowser();
const { createSpaceWorkspace } = await import('../../src/space/workspace.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const turn = () => new Promise(resolve => setImmediate(resolve));

function rig({ hold = false, env = {}, getGamepads = () => [] } = {}) {
  const document = browser.document, toasts = [], backends = [], frames = new Map();
  let frameId = 0, factoryCalls = 0;
  const backendFactory = ({ clock }) => {
    factoryCalls++;
    const backend = createDrivenFakeBackend({ clock, schedule: fn => setImmediate(fn) });
    if (hold) backend.control.holdAcquisition();
    backends.push(backend); return backend;
  };
  const space = createSpaceWorkspace({ shell: fakeShell(document, { toasts }), backendFactory, clock: () => performance.now(), env: {
    document, window: globalThis, requestFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelFrame: id => frames.delete(id),
    viewportSize: () => ({ width: 32, height: 16 }), getGamepads, ...env } });
  const runFrame = (time = performance.now()) => { const due = [...frames.values()]; frames.clear(); for (const fn of due) fn(time); return due.length; };
  // Bounded: frames and fake completions alternate until the workspace reports idle.
  async function settle(ms = 2500) {
    const deadline = performance.now() + ms;
    while (performance.now() < deadline) { runFrame(); await turn(); if (space.inspection.idle) return; }
    assert.fail(`the Space workspace did not settle: ${JSON.stringify(space.inspection.state)}`);
  }
  const canvas = () => document.querySelector('#space-canvas');
  const pointer = (type, values = {}) => canvas().dispatchEvent({ type, button: 0, pointerId: 1, clientX: 400, clientY: 300, target: canvas(), ...values });
  return { space, toasts, backends, frames, runFrame, settle, canvas, pointer, document, get factoryCalls() { return factoryCalls; } };
}

test('harness previews request drafts and commit closes one camera history entry with request creation evidence', async () => {
  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    const requests = [], frames = [], before = h.space.inspection.history.camera.length;
    assert.equal(typeof h.space.inspection.onRequest, 'function');
    const stop = h.space.inspection.onRequest(event => requests.push(event));
    h.space.inspection.onPublish(event => frames.push(event));
    const camera = h.space.inspection.scene.camera;
    h.space.inspection.requestCamera(orbit(camera, 0.1, 0), { phase: 'preview' });
    for (let i = 0; i < 80 && !frames.length; i++) { h.runFrame(); await turn(); }
    assert.equal(h.space.inspection.history.camera.length, before);
    assert.equal(frames[0]?.kind, 'draft');
    h.space.inspection.requestCamera(orbit(camera, 0.2, 0), { phase: 'commit' });
    await h.settle();
    assert.equal(h.space.inspection.history.camera.length, before + 1);
    assert.equal(h.space.inspection.history.gesture, null);
    assert.equal(requests.at(-1).request.quality.profile, 'settled');
    for (const event of requests) {
      assert.ok(Number.isFinite(event.createdAt));
      assert.equal(event.purpose, 'interactive');
      assert.equal(event.identity.requestId, event.request.requestId);
      assert.ok(Object.isFrozen(event));
      const publication = frames.find(frame => frame.requestId === event.identity.requestId);
      if (publication) assert.ok(event.createdAt <= publication.publishedAt);
    }
    stop();
    const count = requests.length;
    h.space.inspection.requestCamera(orbit(camera, 0.3, 0)); await h.settle();
    assert.equal(requests.length, count);
    assert.equal(h.space.inspection.lastPublication.quality.profile, 'settled');
    assert.throws(() => h.space.inspection.requestCamera(camera, { phase: 'typo' }), /phase/);
  } finally { h.space.destroy(); }
});

test('a pending draft retains its own camera size and scene after more than 64 newer requests', async () => {
  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    const requests = [], publications = [], camera = h.space.inspection.scene.camera;
    h.space.inspection.onRequest(event => requests.push(event.request));
    h.space.inspection.onPublish(event => publications.push(event));
    h.backends[0].control.pause();
    h.space.inspection.requestCamera(orbit(camera, 0.01, 0), { phase: 'preview' });
    for (let i = 0; i < 80 && !h.backends[0].control.heldTickets(); i++) { h.runFrame(); await turn(); }
    assert.ok(h.backends[0].control.heldTickets(), 'the oldest draft is already in flight');
    const first = requests[0];
    for (let i = 1; i <= 65; i++) {
      h.space.inspection.requestCamera(orbit(camera, 0.01 + i * 0.001, 0), { phase: 'preview' });
      h.runFrame(); await turn();
    }
    assert.ok(requests.length > 64, 'exercise request-history eviction');
    assert.notDeepEqual(first.sceneSnapshot.camera, requests.at(-1).sceneSnapshot.camera);
    h.backends[0].control.resume();
    for (let i = 0; i < 400 && !publications.some(p => p.requestId === first.requestId); i++) { h.runFrame(); await turn(); }
    const pending = publications.find(p => p.requestId === first.requestId);
    assert.ok(pending, 'the oldest completed draft publishes');
    assert.equal(pending.pending, true);
    assert.deepEqual(pending.camera, first.sceneSnapshot.camera);
    assert.deepEqual(pending.internalSize, first.quality.internalSize);
    assert.deepEqual(pending.output, { width: first.output.width, height: first.output.height });
    assert.equal(pending.sceneHash, first.sceneHash);
    assert.equal(pending.model, first.sceneSnapshot.model.id);
    assert.deepEqual(pending.request, first, 'the publication carries its complete immutable request');
    assert.equal(Object.isFrozen(pending.request.sceneSnapshot.camera), true);
    assert.throws(() => { pending.request.output.width = 999; }, TypeError);
  } finally { h.backends[0]?.control.resume(); h.space.destroy(); }
});

test('deactivation commits the last preview exactly once and a later capture-loss callback cannot cancel it', async () => {
  const h = rig();
  try {
    assert.equal((await h.space.activate(1)).outcome, 'activated');
    await h.settle();
    const start = h.space.inspection.history, before = h.space.inspection.scene.camera;
    h.pointer('pointerdown'); h.pointer('pointermove', { clientX: 430 }); h.pointer('pointermove', { clientX: 470, clientY: 320 });
    const previewed = h.space.inspection.scene.camera;
    assert.notDeepEqual(previewed, before, 'the drag previewed a new pose');
    h.space.deactivate();
    const committed = h.space.inspection.history;
    assert.equal(committed.camera.length, start.camera.length + 1, 'one camera-history entry');
    assert.equal(committed.undoDepth, start.undoDepth, 'no undo entry for navigation');
    assert.equal(committed.gesture, null, 'no gesture remains open');
    h.pointer('lostpointercapture'); h.pointer('pointercancel'); h.pointer('pointerup');
    h.space.deactivate();
    const after = h.space.inspection.history;
    assert.deepEqual(h.space.inspection.scene.camera, previewed, 'the committed pose is the last preview');
    assert.equal(after.camera.length, committed.camera.length, 'later capture-loss callbacks change nothing');
    assert.equal(after.camera.index, committed.camera.index);
  } finally { h.space.destroy(); }
});

test('deactivate closes admission and invalidates pending picks and activation', async () => {
  const pending = rig({ hold: true });
  try {
    const activation = pending.space.activate(1);
    await sleep(5);
    assert.equal(pending.backends.length, 1, 'activation creates the backend');
    pending.space.deactivate();
    pending.backends[0].control.releaseAcquisition();
    assert.equal((await activation).outcome, 'superseded', 'a pending activation is invalidated');
    assert.equal(pending.space.inspection.state.active, false);
    assert.equal(pending.space.inspection.state.eligible, false);
  } finally { pending.space.destroy(); }

  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    assert.ok(h.space.inspection.pickContext(), 'a settled publication is pickable while active');
    const history = h.space.inspection.history, camera = h.space.inspection.scene.camera;
    h.backends[0].control.pause();
    h.canvas().dispatchEvent({ type: 'dblclick', clientX: 400, clientY: 300, target: h.canvas() });
    await sleep(5);
    h.space.deactivate();
    assert.equal(h.space.inspection.pickContext(), null, 'no pick context while inactive');
    h.backends[0].control.resume();
    await sleep(30);
    assert.deepEqual(h.space.inspection.scene.camera, camera, 'a pick resolving after deactivation moves nothing');
    assert.deepEqual(h.space.inspection.history.camera, history.camera);
    const submitted = h.space.inspection.state.submitted;
    h.space.inspection.requestCamera(orbit(camera, 0.2, 0));
    for (let i = 0; i < 5; i++) { h.runFrame(); await sleep(0); }
    assert.equal(h.space.inspection.state.submitted, submitted, 'no render is admitted while inactive');
    assert.equal(h.space.inspection.state.hidden, true, 'the view is marked hidden in the scheduler');
  } finally { h.space.destroy(); }
});

test('activate issues at most one request when the publication is stale and does not restart a stopped tour', async () => {
  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    h.canvas().dispatchEvent({ type: 'keydown', code: 'KeyF', target: h.canvas() });
    assert.equal(h.space.inspection.state.flight, true, 'flight started');
    h.space.deactivate();
    assert.equal(h.space.inspection.state.flight, false, 'deactivation stopped flight');
    h.space.inspection.requestCamera(orbit(h.space.inspection.scene.camera, 0.3, 0.1));
    const submitted = h.space.inspection.state.submitted;
    assert.equal((await h.space.activate(2)).outcome, 'activated');
    assert.equal(h.space.inspection.state.submitted, submitted + 1, 'one current-state request for a stale publication');
    assert.equal(h.space.inspection.state.flight, false, 'activation does not restart flight');
    await h.settle();
    h.space.deactivate();
    const settled = h.space.inspection.state.submitted;
    await h.space.activate(3);
    for (let i = 0; i < 5; i++) { h.runFrame(); await sleep(0); }
    assert.equal(h.space.inspection.state.submitted, settled, 'no request when the publication is current');
  } finally { h.space.destroy(); }
});

function openFile(h, text) {
  const input = h.document.querySelector('#space-open-scene');
  input.files = [{ size: Buffer.byteLength(text), text: async () => text, name: 'scene.json' }];
  input.dispatchEvent({ type: 'change', target: input });
  return sleep(10);
}

test('opening an invalid scene file reports and changes nothing', async () => {
  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    const scene = h.space.inspection.scene, history = h.space.inspection.history;
    await openFile(h, '{"application":"atlas","schema":"atlas.scene"');
    assert.match(h.document.querySelector('#space-file-status').textContent, /\S/, 'the problem is reported');
    assert.equal(h.space.inspection.scene, scene, 'the scene is unchanged');
    assert.deepEqual(h.space.inspection.history, history, 'both histories are unchanged');
    const plane = JSON.stringify({ ...JSON.parse(encodeSceneFile(scene)), workspace: 'plane' });
    await openFile(h, plane);
    assert.equal(h.space.inspection.scene, scene, 'a scene for another workspace changes nothing');
    assert.deepEqual(h.space.inspection.history, history);
  } finally { h.space.destroy(); }
});

test('opening a valid file is one undo entry and one camera entry', async () => {
  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    const current = h.space.inspection.scene, history = h.space.inspection.history;
    const effective = effectiveParameters('mandelbulb', { power: '5' }).effective;
    const camera = orbit(overview(getModel('mandelbulb', 1), effective), 0.4, 0.1);
    const target = sceneCodec.validate({ ...current, parameters: { power: '5' }, camera });
    await openFile(h, encodeSceneFile(target));
    const after = h.space.inspection.history;
    assert.equal(sceneCodec.fingerprint(h.space.inspection.scene).sceneHash, sceneCodec.fingerprint(target).sceneHash);
    assert.equal(after.undoDepth, history.undoDepth + 1, 'one undo entry');
    assert.equal(after.camera.length, history.camera.length + 1, 'one camera entry');
    h.space.inspection.undo();
    assert.equal(sceneCodec.fingerprint(h.space.inspection.scene).sceneHash, sceneCodec.fingerprint(current).sceneHash, 'undo restores the previous scene');
  } finally { h.space.destroy(); }
});

test('the frame callback polls the controller once before the flight tick and stops polling when ineligible', async () => {
  const log = [];
  const pad = { id: 'Scripted pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const h = rig({
    getGamepads: () => { log.push('getGamepads'); return [pad]; },
    env: {
      createFlight: options => { const flight = createFlight(options); return { ...flight, tick: time => { log.push('tick'); return flight.tick(time); }, get active() { return flight.active; }, get speed() { return flight.speed; } }; },
      createGamepadInput: options => { const input = createGamepadInput(options); return { ...input, poll: time => { log.push('poll'); return input.poll(time); } }; },
    },
  });
  try {
    await h.space.activate(1); await h.settle();
    log.length = 0;
    h.runFrame(1000);
    const poll = log.indexOf('poll'), tick = log.indexOf('tick');
    assert.equal(log.filter(entry => entry === 'poll').length, 1, 'one poll per frame');
    assert.equal(log.filter(entry => entry === 'tick').length, 1, 'one flight tick per frame');
    assert.ok(poll >= 0 && poll < tick, `the poll precedes the tick: ${log.join(',')}`);
    assert.ok(h.frames.size >= 1, 'the frame loop keeps running while controller input is eligible, even when idle');
    globalThis.dispatchEvent({ type: 'blur' });
    assert.equal(h.space.inspection.state.eligible, false, 'blur suspends controller input');
    log.length = 0;
    for (let i = 0; i < 4; i++) h.runFrame(1100 + i * 16);
    assert.equal(log.filter(entry => entry === 'poll').length, 0, 'no polling while ineligible');
  } finally { h.space.destroy(); }
});

test('a fresh Space investigation opens the bulb overview with its estimator category', () => {
  const h = rig();
  try {
    const scene = h.space.inspection.scene;
    assert.equal(scene.model.id, 'mandelbulb');
    assert.deepEqual(scene.camera, overview(getModel('mandelbulb', 1), effectiveParameters('mandelbulb', scene.parameters).effective));
    assert.equal(h.factoryCalls, 0, 'creating the workspace acquires nothing');
    assert.equal(h.document.querySelector('#space-estimator').textContent, 'heuristic, exterior-only');
  } finally { h.space.destroy(); }
});

test('a device loss before the first publication resubmits the current request once recovered', async () => {
  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    const submitted = h.space.inspection.state.submitted;
    h.space.inspection.requestCamera(orbit(h.space.inspection.scene.camera, 0.25, 0));
    h.space.inspection.injectLoss();
    await h.settle();
    assert.equal(h.space.inspection.state.phase, 'ready');
    assert.ok(h.space.inspection.state.submitted >= submitted + 1, 'the current request was submitted after recovery');
    assert.equal(h.space.inspection.lastPublication.requestId === undefined, false);
    assert.deepEqual(h.space.inspection.lastPublication.camera, h.space.inspection.scene.camera, 'the publication shows the current camera');
  } finally { h.space.destroy(); }
});

// B14-F1: a pending scene edit or a generation mismatch makes picking unavailable, never a hit on old geometry.
test('a pending parameter edit makes the pick context unavailable until the new geometry publishes', async () => {
  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    const before = h.space.inspection.pickContext();
    assert.ok(before, 'a settled publication is pickable');
    assert.equal(h.space.inspection.editParameter('parameters.power', '6').ok, true);
    assert.equal(h.space.inspection.state.dirty, true, 'the edit is pending');
    assert.equal(h.space.inspection.pickContext(), null, 'no pick context while the edit is pending');
    h.runFrame();
    assert.equal(h.space.inspection.state.dirty, false, 'the edit was submitted');
    if (h.space.inspection.lastPublication.requestId === before.identity.requestId) {
      assert.equal(h.space.inspection.pickContext(), null, 'the old publication is not pickable against the new generation');
    }
    await h.settle();
    const after = h.space.inspection.pickContext();
    assert.ok(after, 'the new publication is pickable');
    assert.notEqual(after.identity.requestId, before.identity.requestId);
    assert.ok(after.geometryRevision > before.geometryRevision);
  } finally { h.space.destroy(); }
});

test('a pick readback resolving between an edit and the next frame moves nothing', async () => {
  const h = rig();
  try {
    await h.space.activate(1); await h.settle();
    h.backends[0].control.setPickDepth(1.5);
    // Control: without an edit, the scripted surface is a hit and focus moves the camera.
    const start = h.space.inspection.scene.camera;
    h.canvas().dispatchEvent({ type: 'dblclick', clientX: 400, clientY: 300, target: h.canvas() });
    const deadline = performance.now() + 1000;
    while (h.space.inspection.scene.camera === start && performance.now() < deadline) await turn();
    assert.notDeepEqual(h.space.inspection.scene.camera, start, 'a current pick focuses');
    await h.settle();
    const camera = h.space.inspection.scene.camera, cameraHistory = h.space.inspection.history.camera;
    h.backends[0].control.pause();
    h.canvas().dispatchEvent({ type: 'dblclick', clientX: 400, clientY: 300, target: h.canvas() });
    await sleep(5);
    assert.equal(h.space.inspection.editParameter('parameters.power', '6').ok, true);
    h.backends[0].control.resume();
    await sleep(30);
    assert.deepEqual(h.space.inspection.scene.camera, camera, 'the pick on superseded geometry did not move the camera');
    assert.deepEqual(h.space.inspection.history.camera, cameraHistory, 'no camera-history entry');
  } finally { h.space.destroy(); }
});

// B14-F7: a successful activation clears the reason of an earlier failed one.
test('a successful activation after a failed one clears the unavailable reason', async () => {
  const h = rig({ env: {} });
  try {
    const first = h.space.activate(1);
    h.backends[0]?.control.failNextAcquisition(Object.assign(new Error('injected acquisition failure'), { code: 'no-webgpu' }));
    assert.equal((await first).outcome, 'unavailable');
    assert.match(h.space.inspection.state.unavailable ?? '', /injected acquisition failure/);
    assert.equal((await h.space.activate(2)).outcome, 'activated');
    assert.equal(h.space.inspection.state.unavailable, null, 'no stale unavailable reason after success');
    assert.equal(h.space.inspection.state.phase, 'ready');
  } finally { h.space.destroy(); }
});


test('the unavailable UI adds enablement guidance only for absent WebGPU or adapter', async () => {
  for (const code of ['no-webgpu', 'no-adapter', 'device-refused']) {
    const h = rig();
    try {
      const activating = h.space.activate(1);
      h.backends[0].control.failNextAcquisition(Object.assign(new Error('original acquisition reason'), {code}));
      assert.equal((await activating).outcome, 'unavailable');
      const text = h.document.querySelector('#space-unavailable').textContent;
      assert.match(text, /original acquisition reason/);
      if (code === 'device-refused') assert.doesNotMatch(text, /graphics acceleration|dev:gpu/);
      else { assert.match(text, /npm run dev:gpu/); assert.match(text, /chrome:\/\/gpu/); }
      assert.doesNotMatch(text, /5195|this Linux workstation/);
      assert.equal(h.space.inspection.state.active, false);
    } finally { h.space.destroy(); }
  }
});
