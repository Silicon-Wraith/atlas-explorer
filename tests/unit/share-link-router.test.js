// B14-F3 (spec §14 share links): a link received while Plane is not the active workspace is never
// silently lost. A supported Plane scene switches to Plane and restores it as a whole scene; an invalid or
// unsupported link is reported and changes neither investigation nor any history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser, fakeShell, stubDiscoveries } from '../support/fake-dom.mjs';
import { createDrivenFakeBackend } from '../support/fake-space-backend.mjs';
import { encodeShareHash } from '../../src/plane/scene-adapter.js';

const browser = installFakeBrowser();
const { createWorkspaceSwitcher } = await import('../../src/ui/workspace-switcher.js');
const { createShareLinkRouter } = await import('../../src/ui/share-link-router.js');
const { createSpaceWorkspace } = await import('../../src/space/workspace.js');
const { createPlaneWorkspace } = await import('../../src/plane/workspace.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function rig({ hold = false } = {}) {
  const toasts = [], shell = fakeShell(browser.document, { toasts });
  let backend;
  const plane = createPlaneWorkspace({ shell, discoveries: stubDiscoveries() });
  const space = createSpaceWorkspace({ shell, backendFactory: ({ clock }) => { backend = createDrivenFakeBackend({ clock }); if (hold) backend.control.holdAcquisition(); return backend; },
    clock: () => performance.now(), env: { requestFrame: () => 0, cancelFrame() {}, viewportSize: () => ({ width: 8, height: 4 }), getGamepads: () => [] } });
  const switcher = createWorkspaceSwitcher({ root: browser.document, workspaces: { plane, space }, initial: 'plane', toast: shell.toast });
  const router = createShareLinkRouter({ plane, switcher, report: shell.toast });
  const link = hash => { location.hash = hash; globalThis.dispatchEvent({ type: 'hashchange' }); };
  const destroy = () => { router.destroy(); switcher.destroy(); space.destroy(); plane.destroy(); location.hash = ''; };
  return { plane, space, switcher, router, toasts, link, destroy, get backend() { return backend; } };
}
const snapshot = h => ({ plane: JSON.stringify(h.plane.inspection.scene), planeHistory: JSON.stringify(h.plane.inspection.history),
  space: JSON.stringify(h.space.inspection.scene), spaceHistory: JSON.stringify(h.space.inspection.history) });

test('a supported Plane link received while Space is active switches to Plane and restores its scene', async () => {
  const h = rig();
  try {
    await h.switcher.ready;
    h.plane.inspection.goTo({ re: '-0.75', im: '0.1', zoom: 2 });
    const linked = h.plane.inspection.scene, hash = encodeShareHash(linked);
    h.plane.inspection.goTo({ re: '-0.74', im: '0.11', zoom: 2.5 });
    assert.equal((await h.switcher.switchTo('space')).outcome, 'activated');
    const space = snapshot(h);
    h.link(hash);
    await sleep(10);
    assert.equal(h.switcher.current(), 'plane', 'the explorer switched to Plane');
    assert.equal(h.plane.isActive(), true);
    assert.deepEqual(h.plane.inspection.scene, linked, 'the linked scene is restored as a whole scene');
    assert.equal(JSON.stringify(h.space.inspection.scene), space.space, 'the Space investigation is retained');
    assert.equal(JSON.stringify(h.space.inspection.history), space.spaceHistory);
  } finally { h.destroy(); }
});

test('an invalid link received while Space is active is reported and changes nothing', async () => {
  const h = rig();
  try {
    await h.switcher.ready;
    await h.switcher.switchTo('space');
    const before = snapshot(h);
    h.link('#scene=%%%not-base64url');
    await sleep(10);
    assert.ok(h.toasts.some(text => /Your view is unchanged\.$/.test(text)), `reported: ${h.toasts.join(' | ')}`);
    assert.equal(h.switcher.current(), 'space', 'Space stays the active workspace');
    assert.deepEqual(snapshot(h), before, 'neither investigation nor any history changed');
  } finally { h.destroy(); }
});

test('a supported link received while Space is still preparing restores Plane and supersedes the preparation', async () => {
  const h = rig({ hold: true });
  try {
    await h.switcher.ready;
    h.plane.inspection.goTo({ re: '-0.7', im: '0.2', zoom: 1.5 });
    const linked = h.plane.inspection.scene, hash = encodeShareHash(linked);
    h.plane.inspection.goTo({ re: '-0.74', im: '0.11', zoom: 2.5 });
    const toSpace = h.switcher.switchTo('space');
    await sleep(5);
    assert.equal(h.plane.isActive(), false, 'Plane input is closed during preparation');
    h.link(hash);
    await sleep(10);
    h.backend.control.releaseAcquisition();
    assert.equal((await toSpace).outcome, 'superseded');
    await sleep(10);
    assert.equal(h.switcher.current(), 'plane');
    assert.deepEqual(h.plane.inspection.scene, linked);
    assert.equal(h.space.inspection.state.active, false);
  } finally { h.destroy(); }
});

test('while Plane is active the router leaves links to Plane: one restoration, one undo entry', async () => {
  const h = rig();
  try {
    await h.switcher.ready;
    h.plane.inspection.goTo({ re: '-0.75', im: '0.1', zoom: 2 });
    const linked = h.plane.inspection.scene, hash = encodeShareHash(linked);
    h.plane.inspection.goTo({ re: '-0.74', im: '0.11', zoom: 2.5 });
    const depth = h.plane.inspection.history.undoDepth;
    h.link(hash);
    await sleep(10);
    assert.deepEqual(h.plane.inspection.scene, linked);
    assert.equal(h.plane.inspection.history.undoDepth, depth + 1, 'exactly one restoration');
    h.link('#scene=%%%');
    await sleep(10);
    assert.equal(h.toasts.filter(text => /Your view is unchanged/.test(text)).length, 1, 'reported once');
  } finally { h.destroy(); }
});
