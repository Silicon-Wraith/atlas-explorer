import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../src/shared/history.js';
import { reduceCommand, changedDomains } from '../../src/shared/commands.js';
import { sceneCodec, createPlaneScene } from '../../src/plane/scene-adapter.js';
import { SceneError } from '../../src/shared/scene.js';

const A = { re: '-0.5', im: '0', zoom: 0 };
const B = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };
const C = { re: '0.276', im: '0.008', zoom: 2.4 };
const start = () => createHistory({ initialScene: createPlaneScene({ view: A }), codec: sceneCodec });
const cam = view => ({ type: 'setCamera', camera: view });
const palette = id => ({ type: 'setAppearance', patch: { palette: id } });

test('commands own their domains and changes are derived from the scenes', () => {
  const scene = createPlaneScene({ view: A });
  const result = reduceCommand(scene, palette('aurora'), sceneCodec);
  assert.deepEqual(result.changed, ['appearance']);
  assert.deepEqual(changedDomains(scene, reduceCommand(scene, { type: 'setIteration', patch: { detail: 3 } }, sceneCodec).scene), ['mathematics']);
  assert.throws(() => reduceCommand(scene, { type: 'paint' }, sceneCodec), error => error.code === 'unknown-command');
  assert.throws(() => reduceCommand(scene, palette('nope'), sceneCodec), error => error.code === 'invalid-value');
});

test('palette, navigate, undo palette preserves camera', () => {
  const history = start();
  history.apply([palette('aurora')]);
  history.apply([cam(B)], { kind: 'navigation' });
  const undone = history.undo();
  assert.equal(undone.after.appearance.palette, 'ember');
  assert.deepEqual(undone.after.camera, B);
  assert.deepEqual(undone.changed, ['appearance']);
  assert.equal(history.snapshot().camera.length, 2, 'content-only undo leaves camera history unchanged');
  assert.equal(history.redo().after.appearance.palette, 'aurora');
});

test('restore, undo, back and forward', () => {
  const history = start();
  const discovery = createPlaneScene({ view: B, settings: { palette: 'rose', detail: 3 } });
  history.apply([{ type: 'restoreScene', scene: discovery }], { kind: 'restore' });
  assert.equal(history.snapshot().scene.appearance.palette, 'rose');
  const undone = history.undo();
  assert.deepEqual(undone.after.camera, A);
  assert.equal(undone.after.appearance.palette, 'ember', 'whole-scene undo restores every domain');
  assert.deepEqual(history.snapshot().camera, { index: 2, length: 3 }, 'history reads A, B, A with the cursor on the last A');
  const back = history.back();
  assert.deepEqual(back.after.camera, B, 'Back restores B\'s camera');
  assert.equal(back.after.appearance.palette, 'ember', 'Back moves only the camera');
  assert.deepEqual(back.changed, ['camera']);
  assert.deepEqual(history.forward().after.camera, A);
  assert.equal(history.snapshot().camera.length, 3, 'Back and Forward record nothing');
  history.redo();
  assert.deepEqual(history.snapshot().scene.camera, B);
  assert.deepEqual(history.snapshot().camera, { index: 3, length: 4 }, 'whole-scene redo appends the restored pose');
});

test('a slider drag is one undo entry, its commit asks for no second render, and cancel restores', () => {
  const history = start();
  const id = history.begin({ kind: 'edit' });
  for (const phase of [0.2, 0.3, 0.4]) assert.equal(history.update(id, { type: 'setAppearance', patch: { phase } }).render, true);
  const committed = history.commit(id);
  assert.equal(committed.render, false);
  assert.equal(history.snapshot().undoDepth, 1);
  history.undo();
  assert.equal(history.snapshot().scene.appearance.phase, 0.11);
  const drag = history.begin({ kind: 'edit' });
  history.update(drag, { type: 'setAppearance', patch: { phase: 0.9 } });
  const cancelled = history.cancel(drag);
  assert.equal(cancelled.after.appearance.phase, 0.11);
  assert.equal(history.snapshot().undoDepth, 0);
  assert.throws(() => history.update(drag, { type: 'setAppearance', patch: { phase: 0.5 } }), error => error.code === 'stale-gesture');
});

test('a wheel burst is one camera-history entry and never an undo entry', () => {
  const history = start();
  history.apply([palette('aurora')]);
  history.undo();
  const id = history.begin({ kind: 'navigation' });
  for (const zoom of [0.1, 0.2, 0.3]) history.update(id, cam({ ...A, zoom }));
  history.commit(id);
  const snapshot = history.snapshot();
  assert.deepEqual(snapshot.camera, { index: 1, length: 2 });
  assert.equal(snapshot.undoDepth, 0);
  assert.equal(snapshot.redoDepth, 1, 'new camera navigation does not erase unrelated content redo');
});

test('undo during an active gesture commits the gesture first', () => {
  const history = start();
  history.apply([palette('aurora')]);
  const id = history.begin({ kind: 'navigation' });
  history.update(id, cam(B));
  const undone = history.undo();
  assert.equal(undone.after.appearance.palette, 'ember');
  assert.deepEqual(undone.after.camera, B, 'the in-progress camera move is kept');
  assert.equal(history.snapshot().camera.length, 2);
  assert.equal(history.snapshot().gesture, null);
});

test('a tour records its start and final pose and one content entry, never one per frame', () => {
  const history = start();
  const id = history.begin({ kind: 'tour' });
  for (let frame = 0; frame < 50; frame++) history.update(id, cam({ ...A, zoom: frame / 100 }));
  history.update(id, palette('ocean'));
  history.update(id, cam(C));
  history.commit(id);
  const snapshot = history.snapshot();
  assert.deepEqual(snapshot.camera, { index: 1, length: 2 });
  assert.equal(snapshot.undoDepth, 1);
  assert.deepEqual(history.back().after.camera, A);
});

test('both histories keep at most 100 entries and suppress consecutive identical poses', () => {
  const duplicate = start();
  duplicate.apply([cam(A)], { kind: 'navigation' });
  assert.deepEqual(duplicate.snapshot().camera, { index: 0, length: 1 });
  // Whole-scene restoration records the camera even when only the content changes.
  duplicate.apply([{ type: 'restoreScene', scene: createPlaneScene({ view: A, settings: { palette: 'aurora' } }) }]);
  assert.deepEqual(duplicate.snapshot().camera, { index: 0, length: 1 }, 'restoring the current pose must not append a duplicate');

  const history = start();
  for (let i = 1; i <= 101; i++) history.apply([{ type: 'setAppearance', patch: { phase: i / 1000 } }]);
  assert.equal(history.snapshot().undoDepth, 100);
  for (let i = 0; i < 100; i++) assert.ok(history.undo());
  assert.equal(history.snapshot().scene.appearance.phase, 0.001, 'the oldest edit is evicted, not the newest');
  assert.equal(history.undo(), null);

  for (let i = 1; i <= 100; i++) history.apply([cam({ ...A, zoom: i / 100 })], { kind: 'navigation' });
  assert.deepEqual(history.snapshot().camera, { index: 99, length: 100 });
  for (let i = 0; i < 99; i++) assert.ok(history.back());
  assert.equal(history.snapshot().scene.camera.zoom, 0.01, 'the initial pose is evicted before later poses');
  assert.equal(history.back(), null);
});

test('new navigation after Back discards every forward pose', () => {
  const history = start();
  history.apply([cam(B)], { kind: 'navigation' });
  history.apply([cam(C)], { kind: 'navigation' });
  history.back();
  const cursor = history.snapshot().camera.index;
  history.apply([cam(A)], { kind: 'navigation' });
  const snapshot = history.snapshot();
  assert.equal(snapshot.canForward, false);
  assert.deepEqual(snapshot.camera, { index: cursor + 1, length: cursor + 2 }, 'the new pose replaces the forward branch');
  assert.equal(snapshot.camera.length, snapshot.camera.index + 1);
  assert.equal(history.forward(), null);
  assert.deepEqual(history.back().after.camera, B, 'Back must not resurrect the discarded pose C');
  assert.deepEqual(history.forward().after.camera, A);
});

test('every undo, redo, back and forward receives a new revision', () => {
  const history = start();
  const revisions = [];
  history.subscribe(transition => revisions.push(transition.revision));
  history.apply([palette('aurora')]);
  history.apply([cam(B)], { kind: 'navigation' });
  const seen = [history.undo().revision, history.redo().revision, history.back().revision, history.forward().revision];
  assert.equal(new Set(seen).size, 4);
  for (let i = 1; i < revisions.length; i++) assert.ok(revisions[i] >= revisions[i - 1]);
  assert.equal(history.forward(), null, 'nothing beyond the last pose');
});

test('a failed command in an action leaves the scene and histories unchanged', () => {
  const history = start();
  const before = history.snapshot();
  assert.throws(() => history.apply([palette('aurora'), palette('nope')]), error => error.code === 'invalid-value');
  const after = history.snapshot();
  assert.ok(sceneCodec.equal(after.scene, before.scene));
  assert.equal(after.undoDepth, 0);
});

test('a throwing subscriber cannot change or hide a transition', () => {
  const errors = [], observed = [];
  const failure = new Error('display listener failed');
  const history = createHistory({
    initialScene: createPlaneScene({ view: A }), codec: sceneCodec,
    onListenerError: (error, transition) => errors.push({ error, transition }),
  });
  history.apply([palette('aurora')]);
  history.apply([cam(B)], { kind: 'navigation' });
  history.subscribe(() => { throw failure; });
  history.subscribe(transition => observed.push(transition));

  let undone;
  assert.doesNotThrow(() => { undone = history.undo(); }, 'a listener must not hide undo');
  assert.equal(undone.after.appearance.palette, 'ember');
  assert.deepEqual(undone.after.camera, B);
  assert.equal(undone.snapshot.undoDepth, 0);
  assert.equal(undone.snapshot.redoDepth, 1);
  assert.equal(undone.render, true);
  assert.equal(observed.at(-1), undone);

  let back;
  assert.doesNotThrow(() => { back = history.back(); }, 'a listener must not hide Back');
  assert.deepEqual(back.after.camera, A);
  assert.deepEqual(back.snapshot.camera, { index: 0, length: 2 });
  assert.equal(back.render, true);
  assert.equal(observed.at(-1), back);

  const id = history.begin({ kind: 'edit' });
  assert.doesNotThrow(() => history.update(id, { type: 'setAppearance', patch: { phase: 0.6 } }));
  let committed;
  assert.doesNotThrow(() => { committed = history.commit(id); }, 'a listener must not hide commit');
  assert.equal(committed.after.appearance.phase, 0.6);
  assert.equal(committed.snapshot.undoDepth, 1);
  assert.equal(committed.snapshot.gesture, null);
  assert.equal(committed.render, false);
  assert.equal(observed.at(-1), committed);

  let applied;
  assert.doesNotThrow(() => { applied = history.apply([palette('ocean')]); }, 'a listener must not roll back apply');
  assert.equal(applied.after.appearance.palette, 'ocean');
  assert.equal(applied.snapshot.undoDepth, 2);
  assert.equal(applied.render, true);
  assert.equal(history.snapshot().scene, applied.after);
  assert.equal(observed.at(-1).after, applied.after);
  assert.deepEqual(observed.map(transition => transition.cause), ['undo', 'back', 'preview', 'commit', 'preview', 'commit']);
  assert.equal(errors.length, observed.length);
  assert.ok(errors.every(({ error }) => error === failure));
  assert.deepEqual(errors.map(({ transition }) => transition), observed, 'later listeners still receive each transition');
});

test('subscriber error reporting failures are deferred without hiding transitions', () => {
  const failure = new Error('display listener failed');
  const reportingFailure = new Error('listener error hook failed');
  const pending = [];
  const originalQueueMicrotask = globalThis.queueMicrotask;
  globalThis.queueMicrotask = callback => pending.push(callback);
  try {
    for (const onListenerError of [undefined, () => { throw reportingFailure; }]) {
      const history = createHistory({ initialScene: createPlaneScene({ view: A }), codec: sceneCodec, onListenerError });
      history.subscribe(() => { throw failure; });
      let applied;
      assert.doesNotThrow(() => { applied = history.apply([palette('aurora')]); });
      assert.equal(applied.after.appearance.palette, 'aurora');
      assert.equal(applied.snapshot.undoDepth, 1);
      assert.equal(pending.length, 2, 'preview and commit errors are both reported after the caller receives its transition');
      for (const callback of pending.splice(0)) assert.throws(callback, error => error === (onListenerError ? reportingFailure : failure));
    }
  } finally { globalThis.queueMicrotask = originalQueueMicrotask; }
});

test('commands reject codec changes outside their owned domains', () => {
  const scene = createPlaneScene({ view: A });
  const changingMathematics = {
    validate: input => sceneCodec.validate({ ...input, iteration: { ...input.iteration, detail: 3 } }),
  };
  assert.throws(() => reduceCommand(scene, palette('aurora'), changingMathematics), error => error.code === 'command-domain-violation');
  const changingAppearance = {
    validate: input => sceneCodec.validate({ ...input, appearance: { ...input.appearance, palette: 'aurora' } }),
  };
  assert.throws(() => reduceCommand(scene, { type: 'setIteration', patch: { detail: 3 } }, changingAppearance), error => error.code === 'command-domain-violation');
});

test('commands reject a validated scene from a different workspace', () => {
  const scene = createPlaneScene({ view: A });
  const codec = { validate: input => ({ ...sceneCodec.validate(input), workspace: 'space' }) };
  assert.throws(() => reduceCommand(scene, { type: 'restoreScene', scene }, codec), error => error.code === 'workspace-mismatch');
});

test('no-op commands and cancelled no-op gestures do not render or advance revision', () => {
  const history = start();
  for (const command of [cam(A), palette('ember')]) {
    const before = history.snapshot();
    const id = history.begin({ kind: 'edit' });
    const preview = history.update(id, command);
    assert.deepEqual(preview.changed, []);
    assert.equal(preview.render, false, 'an unchanged preview needs no render');
    assert.equal(preview.revision, before.revision);
    const cancelled = history.cancel(id);
    assert.deepEqual(cancelled.changed, []);
    assert.equal(cancelled.render, false);
    assert.equal(cancelled.revision, before.revision);
    const applied = history.apply([command]);
    assert.deepEqual(applied.changed, []);
    assert.equal(applied.render, false);
    assert.equal(applied.revision, before.revision);
    assert.equal(applied.snapshot.undoDepth, 0);
    assert.deepEqual(applied.snapshot.camera, { index: 0, length: 1 });
  }

  const before = history.snapshot();
  const id = history.begin({ kind: 'edit' });
  const preview = history.update(id, palette('aurora'));
  assert.equal(preview.render, true);
  assert.ok(preview.revision > before.revision);
  const cancelled = history.cancel(id);
  assert.equal(cancelled.render, true, 'cancelling a changed preview must restore the displayed scene');
  assert.ok(cancelled.revision > preview.revision);
  assert.equal(cancelled.after, before.scene);
});

test('undo and redo of an identical restoration still render with fresh revisions', () => {
  const initialScene = createPlaneScene({ view: A });
  // A valid codec may reuse an already validated scene instead of returning another copy.
  const codec = {
    ...sceneCodec,
    validate(input) {
      const validated = sceneCodec.validate(input);
      return sceneCodec.equal(initialScene, validated) ? initialScene : validated;
    },
  };
  const history = createHistory({ initialScene, codec });
  history.apply([palette('aurora')]);
  history.undo();
  assert.equal(history.snapshot().redoDepth, 1);
  const restored = history.apply([{ type: 'restoreScene', scene: history.snapshot().scene }]);
  assert.equal(restored.snapshot.undoDepth, 1, 'opening a complete scene is one whole-scene undo entry (§6)');
  assert.equal(restored.snapshot.redoDepth, 0);
  const undone = history.undo();
  assert.equal(undone.before, undone.after);
  assert.deepEqual(undone.changed, []);
  assert.ok(undone.revision > restored.revision, 'undo always receives a new view revision (§6)');
  assert.equal(undone.render, true);
  const redone = history.redo();
  assert.equal(redone.before, redone.after);
  assert.ok(redone.revision > undone.revision);
  assert.equal(redone.render, true);
  assert.deepEqual(history.snapshot().camera, { index: 0, length: 1 });
});

test('a rejected undo leaves the scene and both histories untouched', () => {
  let reject = false;
  const codec = {
    ...sceneCodec,
    validate(input) {
      if (reject) throw new SceneError('invalid-value', 'coupled domain constraints');
      return sceneCodec.validate(input);
    },
  };
  const history = createHistory({ initialScene: createPlaneScene({ view: A }), codec });
  history.apply([palette('aurora')]);
  history.apply([cam(B)], { kind: 'navigation' });
  const before = history.snapshot();
  reject = true;
  assert.throws(() => history.undo(), error => error.code === 'invalid-value');
  assert.deepEqual(history.snapshot(), before, 'a rejected undo must leave both stacks unchanged');
  reject = false;
  const undone = history.undo();
  assert.equal(undone.after.appearance.palette, 'ember');
  assert.deepEqual(undone.after.camera, B);
  assert.equal(undone.snapshot.undoDepth, 0);
  assert.equal(undone.snapshot.redoDepth, 1);
});

test('a rejected redo leaves the scene and both histories untouched', () => {
  let reject = false;
  const codec = {
    ...sceneCodec,
    validate(input) {
      if (reject) throw new SceneError('invalid-value', 'coupled domain constraints');
      return sceneCodec.validate(input);
    },
  };
  const history = createHistory({ initialScene: createPlaneScene({ view: A }), codec });
  history.apply([palette('aurora')]);
  history.apply([cam(B)], { kind: 'navigation' });
  history.undo();
  const before = history.snapshot();
  reject = true;
  assert.throws(() => history.redo(), error => error.code === 'invalid-value');
  assert.deepEqual(history.snapshot(), before, 'a rejected redo must leave both stacks unchanged');
  reject = false;
  const redone = history.redo();
  assert.equal(redone.after.appearance.palette, 'aurora');
  assert.deepEqual(redone.after.camera, B);
  assert.equal(redone.snapshot.undoDepth, 1);
  assert.equal(redone.snapshot.redoDepth, 0);
});
