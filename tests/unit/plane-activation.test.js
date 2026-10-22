// Plane's activation contract (plan B14): deactivate() stops automation, settles navigation and
// detaches its global listeners; activate() re-attaches them and never restarts a stopped tour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser, fakeShell, stubDiscoveries } from '../support/fake-dom.mjs';

const browser = installFakeBrowser();
const { createPlaneWorkspace } = await import('../../src/plane/workspace.js');

function rig() {
  const toasts = [];
  const plane = createPlaneWorkspace({ shell: fakeShell(browser.document, { toasts }), discoveries: stubDiscoveries() });
  return { plane, toasts, $: selector => browser.document.querySelector(selector) };
}
const key = (value, extra = {}) => globalThis.dispatchEvent({ type: 'keydown', key: value, target: browser.document.body, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra });

test('Plane deactivate stops a tour and detaches its keyboard listener', () => {
  const { plane, $ } = rig();
  try {
    assert.equal(typeof plane.activate, 'function', 'Plane exposes activate()');
    assert.equal(typeof plane.deactivate, 'function', 'Plane exposes deactivate()');
    const attached = globalThis.listenerCount('keydown');
    $('#tour-button').click();
    assert.equal($('#tour-status').hidden, false, 'the tour started');
    plane.deactivate();
    assert.equal($('#tour-status').hidden, true, 'deactivation stopped the tour');
    assert.equal(globalThis.listenerCount('keydown'), attached - 1, 'the keyboard listener is detached');
    const before = plane.inspection.scene;
    key('r');
    assert.equal(plane.inspection.scene, before, 'a key press while hidden changes nothing');
    plane.deactivate();
    assert.equal(globalThis.listenerCount('keydown'), attached - 1, 'deactivate is idempotent');
    assert.equal(plane.activate(2).outcome, 'activated');
    assert.equal(globalThis.listenerCount('keydown'), attached, 'activation re-attaches the listener');
    assert.equal($('#tour-status').hidden, true, 'activation does not restart the stopped tour');
    plane.activate(3);
    assert.equal(globalThis.listenerCount('keydown'), attached, 'activate is idempotent');
  } finally { plane.destroy(); }
});

test('Plane deactivate stops the palette animation and commits it once; activate does not restart it', () => {
  const { plane, $ } = rig();
  try {
    $('#cycle-button').click();
    assert.equal($('#cycle-button').getAttribute('aria-pressed'), 'true');
    const undoDepth = plane.inspection.history.undoDepth;
    plane.deactivate();
    assert.equal($('#cycle-button').getAttribute('aria-pressed'), 'false', 'the palette animation stopped');
    assert.ok(plane.inspection.history.undoDepth <= undoDepth + 1, 'at most one undo entry for the animation');
    plane.activate(2);
    assert.equal($('#cycle-button').getAttribute('aria-pressed'), 'false', 'activation does not restart the palette animation');
  } finally { plane.destroy(); }
});

test('Plane hidden resizes and hash changes are ignored until activation', () => {
  const { plane } = rig();
  try {
    const resize = globalThis.listenerCount('resize'), hash = globalThis.listenerCount('hashchange');
    plane.deactivate();
    assert.equal(globalThis.listenerCount('resize'), resize - 1);
    assert.equal(globalThis.listenerCount('hashchange'), hash - 1);
    plane.activate(2);
    assert.equal(globalThis.listenerCount('resize'), resize);
    assert.equal(globalThis.listenerCount('hashchange'), hash);
  } finally { plane.destroy(); }
});
