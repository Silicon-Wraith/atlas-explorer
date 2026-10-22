// The workspace switcher (plan B14): monotonic activation tokens, deactivate-before-activate, and
// failure recovery that only the current activation may commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser, fakeShell, stubDiscoveries } from '../support/fake-dom.mjs';
import { createDrivenFakeBackend } from '../support/fake-space-backend.mjs';
import { orbit } from '../../src/space/camera.js';

const browser = installFakeBrowser();
const { createWorkspaceSwitcher } = await import('../../src/ui/workspace-switcher.js');
const { createSpaceWorkspace } = await import('../../src/space/workspace.js');
const { createPlaneWorkspace } = await import('../../src/plane/workspace.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
// A scripted workspace recording the calls the switcher makes.
function scripted(name, log, { results = [] } = {}) {
  let active = false;
  return {
    get active() { return active; },
    activate(token) {
      log.push(`${name}.activate:${token}`);
      const next = results.shift();
      if (!next) { active = true; return Promise.resolve({ outcome: 'activated' }); }
      return next.promise.then(result => { if (result.outcome === 'activated') active = true; return result; });
    },
    deactivate() { log.push(`${name}.deactivate`); active = false; },
    destroy() {},
  };
}

test('a fresh start activates Plane and never calls the Space backend factory', async () => {
  const toasts = [], shell = fakeShell(browser.document, { toasts });
  let factoryCalls = 0;
  const plane = createPlaneWorkspace({ shell, discoveries: stubDiscoveries() });
  const space = createSpaceWorkspace({ shell, backendFactory: () => { factoryCalls++; throw new Error('not reached'); }, clock: () => performance.now(),
    env: { requestFrame: () => 0, cancelFrame() {}, viewportSize: () => ({ width: 8, height: 4 }), getGamepads: () => [] } });
  const switcher = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane, space }, initial: 'plane', toast: shell.toast });
  try {
    await switcher.ready;
    assert.equal(switcher.current(), 'plane');
    assert.equal(browser.document.body.dataset.workspace, 'plane', 'Plane is the visible workspace');
    assert.equal(factoryCalls, 0, 'no Space device is acquired at a fresh start');
    assert.equal(space.inspection.state.active, false);
  } finally { switcher.destroy(); space.destroy(); plane.destroy(); }
});

test('switching deactivates the current workspace before activating the next and both keep their histories', async () => {
  const log = [];
  const plane = scripted('plane', log), space = scripted('space', log);
  const switcher = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane, space }, initial: 'plane' });
  await switcher.ready;
  assert.deepEqual(log, ['plane.activate:1']);
  log.length = 0;
  assert.deepEqual(await switcher.switchTo('space'), { activeId: 'space', outcome: 'activated' });
  assert.deepEqual(log, ['plane.deactivate', 'space.activate:2'], 'deactivation precedes activation');
  log.length = 0;
  await switcher.switchTo('plane');
  assert.deepEqual(log, ['space.deactivate', 'plane.activate:3']);
  switcher.destroy();

  // The real workspaces keep their scenes and both histories across a round trip.
  const shell = fakeShell(browser.document);
  const realPlane = createPlaneWorkspace({ shell, discoveries: stubDiscoveries() });
  const frames = new Map(); let id = 0;
  const realSpace = createSpaceWorkspace({ shell, backendFactory: ({ clock }) => createDrivenFakeBackend({ clock }), clock: () => performance.now(),
    env: { requestFrame: fn => { frames.set(++id, fn); return id; }, cancelFrame: n => frames.delete(n), viewportSize: () => ({ width: 32, height: 16 }), getGamepads: () => [] } });
  const real = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane: realPlane, space: realSpace }, initial: 'plane' });
  try {
    await real.ready;
    realPlane.inspection.goTo({ re: '-0.75', im: '0.1', zoom: 2 });
    realPlane.inspection.goTo({ re: '-0.74', im: '0.11', zoom: 2.5 });
    const planeScene = realPlane.inspection.scene, planeHistory = realPlane.inspection.history;
    assert.equal((await real.switchTo('space')).outcome, 'activated');
    realSpace.inspection.requestCamera(orbit(realSpace.inspection.scene.camera, 0.3, 0));
    realSpace.inspection.editParameter('parameters.power', '6');
    const spaceScene = realSpace.inspection.scene, spaceHistory = realSpace.inspection.history;
    await real.switchTo('plane');
    assert.equal(realPlane.inspection.scene, planeScene, 'the Plane scene is preserved');
    assert.deepEqual(realPlane.inspection.history, planeHistory, 'Plane undo and camera histories are preserved');
    await real.switchTo('space');
    assert.equal(realSpace.inspection.scene, spaceScene, 'the Space scene is preserved');
    assert.deepEqual(realSpace.inspection.history, spaceHistory, 'Space undo and camera histories are preserved');
    assert.equal(spaceHistory.undoDepth, 1); assert.equal(spaceHistory.camera.length, 2);
  } finally { real.destroy(); realSpace.destroy(); realPlane.destroy(); }
});

test('a late activation cannot reactivate a hidden workspace', async () => {
  const log = [], pending = deferred();
  const plane = scripted('plane', log), space = scripted('space', log, { results: [pending] });
  const switcher = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane, space }, initial: 'plane' });
  await switcher.ready;
  const toSpace = switcher.switchTo('space');
  await sleep(0);
  assert.deepEqual(await switcher.switchTo('plane'), { activeId: 'plane', outcome: 'activated' });
  pending.resolve({ outcome: 'superseded' });
  assert.equal((await toSpace).outcome, 'superseded');
  assert.equal(switcher.current(), 'plane', 'Plane stays active');
  assert.equal(browser.document.body.dataset.workspace, 'plane', 'Plane stays visible');
  assert.equal(plane.active, true); assert.equal(space.active, false);
  switcher.destroy();

  // The real Space workspace: acquisition resolves after the switch back; Plane keeps focus.
  const shell = fakeShell(browser.document);
  const realPlane = createPlaneWorkspace({ shell, discoveries: stubDiscoveries() });
  let backend;
  const realSpace = createSpaceWorkspace({ shell, backendFactory: ({ clock }) => { backend = createDrivenFakeBackend({ clock }); backend.control.holdAcquisition(); return backend; },
    clock: () => performance.now(), env: { requestFrame: () => 0, cancelFrame() {}, viewportSize: () => ({ width: 8, height: 4 }), getGamepads: () => [] } });
  const real = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane: realPlane, space: realSpace }, initial: 'plane' });
  try {
    await real.ready;
    const late = real.switchTo('space');
    await sleep(5);
    await real.switchTo('plane');
    browser.document.querySelector('#fractal').focus();
    backend.control.releaseAcquisition();
    assert.equal((await late).outcome, 'superseded');
    await sleep(20);
    assert.equal(real.current(), 'plane');
    assert.equal(realSpace.inspection.state.active, false, 'the late activation did not activate Space');
    assert.equal(browser.document.activeElement, browser.document.querySelector('#fractal'), 'Plane keeps focus');
  } finally { real.destroy(); realSpace.destroy(); realPlane.destroy(); }
});

test('a backend acquisition failure restores Plane only when that activation is still current', async () => {
  const toasts = [];
  const shell = fakeShell(browser.document, { toasts });
  let backend, hold = false;
  const realPlane = createPlaneWorkspace({ shell, discoveries: stubDiscoveries() });
  let planeActivations = 0;
  const plane = { activate: token => { planeActivations++; return realPlane.activate(token); }, deactivate: () => realPlane.deactivate(), destroy: () => realPlane.destroy() };
  const space = createSpaceWorkspace({ shell, backendFactory: ({ clock }) => {
    backend = createDrivenFakeBackend({ clock });
    if (hold) backend.control.holdAcquisition();
    backend.control.failNextAcquisition(Object.assign(new Error('navigator.gpu is unavailable in this browser'), { code: 'no-webgpu' }));
    return backend;
  }, clock: () => performance.now(), env: { requestFrame: () => 0, cancelFrame() {}, viewportSize: () => ({ width: 8, height: 4 }), getGamepads: () => [] } });
  const switcher = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane, space }, initial: 'plane', toast: shell.toast });
  try {
    await switcher.ready;
    const result = await switcher.switchTo('space');
    assert.deepEqual([result.activeId, result.outcome], ['plane', 'unavailable']);
    assert.ok(toasts.some(text => /^Space unavailable: .*navigator\.gpu is unavailable/.test(text)), `reported: ${toasts.join(' | ')}`);
    assert.equal(switcher.current(), 'plane'); assert.equal(browser.document.body.dataset.workspace, 'plane');

    // A failure that arrives after the explorer already switched elsewhere restores nothing.
    toasts.length = 0; hold = true;
    const late = switcher.switchTo('space');
    await sleep(5);
    await switcher.switchTo('plane');
    planeActivations = 0;
    backend.control.releaseAcquisition();
    assert.equal((await late).outcome, 'superseded');
    await sleep(10);
    assert.equal(planeActivations, 0, 'no second restoration of Plane');
    assert.equal(toasts.filter(text => text.startsWith('Space unavailable')).length, 0, 'a stale failure is not announced');
    assert.equal(switcher.current(), 'plane');
  } finally { switcher.destroy(); space.destroy(); plane.destroy(); }
});

// B14-F2 (spec §15: first-use preparation is visible and the current view stays): the current workspace
// stays visible while the next one prepares; only the latest successful activation commits visibility.
test('Plane stays visible while Space prepares and Space becomes visible only once activated', async () => {
  const log = [], pending = deferred();
  const plane = scripted('plane', log), space = scripted('space', log, { results: [pending] });
  const switcher = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane, space }, initial: 'plane' });
  const body = browser.document.body;
  try {
    await switcher.ready;
    const toSpace = switcher.switchTo('space');
    await sleep(0);
    assert.equal(body.dataset.workspace, 'plane', 'Plane stays visible during preparation');
    assert.equal(switcher.current(), 'plane');
    assert.equal(body.dataset.workspacePending, 'space', 'the pending activation is marked for the preparation status');
    assert.equal(plane.active, false, 'Plane input is closed while Space prepares');
    pending.resolve({ outcome: 'activated' });
    assert.deepEqual(await toSpace, { activeId: 'space', outcome: 'activated' });
    assert.equal(body.dataset.workspace, 'space', 'Space is visible once it can present');
    assert.equal(body.dataset.workspacePending, undefined, 'no pending activation remains');
  } finally { switcher.destroy(); }
});

test('switching back during preparation never shows Space and reactivates Plane', async () => {
  const log = [], pending = deferred(), seen = [];
  const plane = scripted('plane', log), space = scripted('space', log, { results: [pending] });
  const switcher = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane, space }, initial: 'plane' });
  const body = browser.document.body;
  try {
    await switcher.ready;
    const toSpace = switcher.switchTo('space');
    await sleep(0); seen.push(body.dataset.workspace);
    log.length = 0;
    assert.deepEqual(await switcher.switchTo('plane'), { activeId: 'plane', outcome: 'activated' });
    seen.push(body.dataset.workspace);
    assert.ok(log.includes('space.deactivate'), 'the pending Space activation is invalidated');
    assert.ok(log.includes('plane.activate:3'), 'Plane is reactivated');
    pending.resolve({ outcome: 'superseded' });
    assert.equal((await toSpace).outcome, 'superseded');
    seen.push(body.dataset.workspace);
    assert.deepEqual(seen, ['plane', 'plane', 'plane'], 'Space was never shown');
    assert.equal(body.dataset.workspacePending, undefined);
    assert.equal(plane.active, true);
  } finally { switcher.destroy(); }
});

test('a failed first-use preparation leaves Plane visible and reports the failure', async () => {
  const toasts = [], shell = fakeShell(browser.document, { toasts });
  let backend;
  const realPlane = createPlaneWorkspace({ shell, discoveries: stubDiscoveries() });
  const space = createSpaceWorkspace({ shell, backendFactory: ({ clock }) => {
    backend = createDrivenFakeBackend({ clock }); backend.control.holdAcquisition();
    backend.control.failNextAcquisition(Object.assign(new Error('the adapter was refused'), { code: 'no-webgpu' }));
    return backend;
  }, clock: () => performance.now(), env: { requestFrame: () => 0, cancelFrame() {}, viewportSize: () => ({ width: 8, height: 4 }), getGamepads: () => [] } });
  const switcher = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane: realPlane, space }, initial: 'plane', toast: shell.toast });
  const body = browser.document.body;
  try {
    await switcher.ready;
    const toSpace = switcher.switchTo('space');
    await sleep(5);
    assert.equal(body.dataset.workspace, 'plane', 'Plane stays visible while Space acquires its device');
    backend.control.releaseAcquisition();
    const result = await toSpace;
    assert.deepEqual([result.activeId, result.outcome], ['plane', 'unavailable']);
    assert.equal(body.dataset.workspace, 'plane');
    assert.equal(body.dataset.workspacePending, undefined);
    assert.ok(toasts.some(text => /^Space unavailable: .*adapter was refused/.test(text)), `reported: ${toasts.join(' | ')}`);
    assert.equal(realPlane.isActive(), true, 'Plane is active again');
  } finally { switcher.destroy(); space.destroy(); realPlane.destroy(); }
});
