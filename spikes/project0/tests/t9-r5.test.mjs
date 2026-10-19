// spikes/project0/tests/t9-r5.test.mjs — T9 fix round 5 (Codex T9 r6, item 5; E4.5): G2's preparation sensor. `offsetParent` is null for the
// fixed-position #status even while it is painted (CSSOM View), so every G2 slot recorded preparationVisible 0. The sensor is now a page-local
// visibility test (browser/visibility.js): computed display/visibility/opacity along the ancestor chain plus a non-empty client rect that
// intersects the viewport. The integrity preflight asserts it in real Chrome. Pure: fake elements and an injected session; no browser, no GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluatePreflight } from '../integrity-preflight.mjs';
import { metricsFor } from '../measure/index.mjs';
const vis = await import('../browser/visibility.js').catch(e => ({ missing: e.message }));
const { run: runG2 } = await import('../browser/drivers/g2.js');
const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));

// A fake element: computed style `cs`, client rect `rect`, an optional parent; offsetParent is always null (as for a fixed-position element).
const view = { innerWidth: 1280, innerHeight: 720, getComputedStyle: e => ({ display: 'block', visibility: 'visible', opacity: '1', position: 'static', contentVisibility: 'visible', ...e.cs }) };
const el = ({ cs = {}, rect = { left: 8, top: 8, right: 160, bottom: 24, width: 152, height: 16 }, parent = null, isConnected = true } = {}) =>
  ({ cs, offsetParent: null, parentElement: parent, isConnected, getBoundingClientRect: () => rect, ownerDocument: { defaultView: view } });
const fixed = (over = {}) => el({ cs: { position: 'fixed', ...over.cs }, ...over });

test('a visible fixed-position element counts as visible, although its offsetParent is null', () => {
  assert.equal(vis.missing, undefined, `browser/visibility.js: ${vis.missing}`);
  const status = fixed({ parent: el() });
  assert.equal(status.offsetParent, null);
  assert.equal(vis.elementVisible(status, { view }), true);
  assert.equal(vis.elementVisible(status), true, 'the element\'s own window is the default');
});

test('hidden elements do not count: display:none (own or ancestor), visibility:hidden, opacity 0, zero size, outside the viewport, detached', () => {
  assert.equal(vis.missing, undefined, `browser/visibility.js: ${vis.missing}`);
  const cases = {
    'display:none': fixed({ cs: { display: 'none' } }),
    'ancestor display:none': fixed({ parent: el({ cs: { display: 'none' } }) }),
    'visibility:hidden': fixed({ cs: { visibility: 'hidden' } }),
    'visibility:collapse': fixed({ cs: { visibility: 'collapse' } }),
    'opacity 0': fixed({ cs: { opacity: '0' } }),
    'ancestor opacity 0': fixed({ parent: el({ cs: { opacity: '0' } }) }),
    'ancestor content-visibility:hidden': fixed({ parent: el({ cs: { contentVisibility: 'hidden' } }) }),
    'zero width': fixed({ rect: { left: 8, top: 8, right: 8, bottom: 24, width: 0, height: 16 } }),
    'zero height': fixed({ rect: { left: 8, top: 8, right: 160, bottom: 8, width: 152, height: 0 } }),
    'left of the viewport': fixed({ rect: { left: -200, top: 8, right: -48, bottom: 24, width: 152, height: 16 } }),
    'below the viewport': fixed({ rect: { left: 8, top: 800, right: 160, bottom: 816, width: 152, height: 16 } }),
    detached: fixed({ isConnected: false }),
  };
  for (const [name, e] of Object.entries(cases)) assert.equal(vis.elementVisible(e, { view }), false, name);
  assert.equal(vis.elementVisible(null, { view }), false, 'no element');
});

// G2's status log, with an injected document, integrity observer and session (the session fails at once, so nothing real starts).
const g2Status = async status => {
  const doc = { getElementById: id => (id === 'status' ? status : { width: 1280, height: 720 }) };
  const out = await runG2('G2', fixtures, {}, () => {}, { sup: { closeImplicit: async () => {} }, doc, view, integrity: () => ({ stop: () => ({ violations: [], events: [] }) }),
    open: async () => { throw new Error('no GPU in this test'); } });
  return out.slots[0].raw.statusLog;
};

test('G2 records the fixed-position #status as visible while preparing, and a hidden one as not visible', async () => {
  const shown = await g2Status(fixed({ parent: el() }));
  assert.equal(shown[0].text, 'preparing: acquiring GPU');
  assert.equal(shown[0].visible, true, 'a painted fixed-position #status is visible');
  for (const hidden of [fixed({ cs: { display: 'none' } }), fixed({ cs: { visibility: 'hidden' } }), fixed({ rect: { left: 8, top: 8, right: 8, bottom: 8, width: 0, height: 0 } })])
    assert.equal((await g2Status(hidden))[0].visible, false, JSON.stringify(hidden.cs));
  // The frozen evaluator's input is unchanged: a visible preparation entry before the first publication still gives preparationVisible 1.
  const frame = { requestId: 1, view: 'bulb-overview', W: fixtures.profiles.draft.W, H: fixtures.profiles.draft.H, t: 900, counts: { total: fixtures.profiles.draft.W * fixtures.profiles.draft.H, hit: 64000, miss: fixtures.profiles.draft.W * fixtures.profiles.draft.H - 64000, point: 0, steps: 0, failure: 0 } };
  const m = await metricsFor('G2', 'warm', { navigationMs: 900, statusLog: shown, frame, outstandingMax: 2, integrity: { violations: [] } }, fixtures);
  assert.equal(m.preparationVisible, 1);
});

// The preflight's new assertion: real Chrome must report the real fixed-position #status visible, with offsetParent null (the defect's premise),
// and every hidden control not visible.
const statusVisibility = (over = {}) => { const { controls = {}, ...rest } = over;
  return { position: 'fixed', offsetParentNull: true, visible: true, ...rest, controls: { visibleFixed: true, displayNone: false, visibilityHidden: false, zeroSize: false, opacityZero: false, offscreen: false, ...controls } }; };
const pageRun = (over = {}) => ({ sameTaskRevert: { violations: ['unexpected backing 800x720 at 12'] }, undeliveredAtStop: { violations: ['unexpected backing 640x720 at 13'] },
  allowedResizes: { violations: [], events: [1, 2, 3].map(() => ({ type: 'backing', deliberate: true })) }, transport: 'p0Push', statusVisibility: statusVisibility(), ...over });

test('the integrity preflight asserts the status visibility sensor on both loads, fail-closed', () => {
  const ok = evaluatePreflight({ first: pageRun(), reload: pageRun(), evaluates: 0 });
  assert.equal(ok.pass, true, JSON.stringify(ok.assertions));
  assert.ok(ok.assertions.some(a => a.name === 'the fixed-position #status reports visible; hidden controls do not' && a.ok));
  for (const bad of [{ visible: false }, { position: 'static' }, { offsetParentNull: false }, { controls: { visibleFixed: false } }, { controls: { displayNone: true } },
    { controls: { visibilityHidden: true } }, { controls: { zeroSize: true } }, { controls: { opacityZero: true } }, { controls: { offscreen: true } }]) {
    assert.equal(evaluatePreflight({ first: pageRun({ statusVisibility: statusVisibility(bad) }), reload: pageRun(), evaluates: 0 }).pass, false, JSON.stringify(bad));
    assert.equal(evaluatePreflight({ first: pageRun(), reload: pageRun({ statusVisibility: statusVisibility(bad) }), evaluates: 0 }).pass, false, `reload ${JSON.stringify(bad)}`);
  }
  assert.equal(evaluatePreflight({ first: pageRun({ statusVisibility: undefined }), reload: pageRun(), evaluates: 0 }).pass, false, 'missing observation');
});
