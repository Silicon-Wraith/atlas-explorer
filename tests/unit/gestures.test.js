import test from 'node:test';
import assert from 'node:assert/strict';
import { createGestureArbiter } from '../../src/plane/gestures.js';
import { createHistory } from '../../src/shared/history.js';
import { sceneCodec, createPlaneScene } from '../../src/plane/scene-adapter.js';

const A = { re: '-0.5', im: '0', zoom: 0 };
const phase = value => ({ type: 'setAppearance', patch: { phase: value } });
const camera = zoom => ({ type: 'setCamera', camera: { ...A, zoom } });

function setup() {
  const history = createHistory({ initialScene: createPlaneScene({ view: A }), codec: sceneCodec });
  const transitions = [], timers = [];
  const state = { tour: false };
  const arbiter = createGestureArbiter({
    history, onTransition: transition => transitions.push(transition),
    stopAutomated: () => { if (state.tour) { state.tour = false; arbiter.commit('tour'); } },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
  });
  const tourFrame = zoom => (state.tour ? arbiter.automate('tour', camera(zoom), true) : false);
  return { history, arbiter, transitions, timers, state, tourFrame };
}

test('a slider drag during a tour stays one undo entry', () => {
  const { history, arbiter, state, tourFrame } = setup();
  state.tour = true;
  tourFrame(0.1); tourFrame(0.2);
  for (const [index, value] of [0.3, 0.4, 0.5].entries()) {
    arbiter.preview('slider', phase(value));
    assert.equal(tourFrame(0.3 + index / 10), false, 'the tour stopped before the slider\'s first preview');
  }
  arbiter.commit('slider');
  const snapshot = history.snapshot();
  assert.equal(snapshot.undoDepth, 1, 'one slider entry; the tour moved only the camera');
  assert.deepEqual(snapshot.camera, { index: 1, length: 2 }, 'one camera entry for the tour');
  history.undo();
  assert.equal(history.snapshot().scene.appearance.phase, 0.11, 'undo removes the whole drag');
});

test('cycling during a slider drag stays one entry', () => {
  const { history, arbiter } = setup();
  arbiter.preview('slider', phase(0.3));
  for (let frame = 0; frame < 20; frame++) arbiter.animate({ type: 'setAppearance', patch: { frequency: 1 + frame / 100 } });
  arbiter.preview('slider', phase(0.4));
  assert.equal(arbiter.openKind, 'slider', 'the animation joined the drag instead of committing it');
  arbiter.commit('slider');
  assert.equal(history.snapshot().undoDepth, 1);
});

test('automated motion never commits an unfinished direct gesture', () => {
  const { history, arbiter } = setup();
  arbiter.preview('navigation-drag', camera(0.5), true);
  assert.equal(arbiter.automate('tour', camera(0.9), true), false);
  assert.equal(arbiter.openKind, 'navigation-drag');
  assert.equal(history.snapshot().scene.camera.zoom, 0.5);
});

test('a wheel burst commits once after the quiet period, and Back settles an open drag first', () => {
  const { history, arbiter, timers } = setup();
  for (const zoom of [0.1, 0.2, 0.3]) arbiter.grouped(camera(zoom));
  assert.deepEqual(timers.map(timer => timer.ms), [200, 200, 200]);
  timers.at(-1).fn();
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 2 });
  arbiter.preview('navigation-drag', camera(0.8), true);
  const back = arbiter.step('back', true);
  assert.deepEqual(back.after.camera.zoom, 0.3, 'the drag was committed as a pose, then Back restored the previous one');
  assert.equal(arbiter.openKind, null);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 3 });
});

test('a discrete action settles the open gesture and renders from its transition', () => {
  const { history, arbiter, transitions } = setup();
  arbiter.preview('slider', phase(0.2));
  arbiter.apply([{ type: 'setAppearance', patch: { palette: 'aurora' } }], 'edit');
  assert.equal(history.snapshot().undoDepth, 2);
  assert.deepEqual(transitions.map(transition => transition.cause), ['preview', 'commit', 'apply']);
  assert.equal(arbiter.step('redo'), null, 'nothing to redo');
});
