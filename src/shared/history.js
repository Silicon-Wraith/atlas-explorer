// Undo history and camera history for one workspace (spec §6, user decision 2026-10-20).
// Undo covers parameters, tracing, slices, appearance and whole-scene restorations;
// camera moves go to a separate back/forward history. The current camera-history entry
// always equals the committed camera under cameraEqual.
import { reduceCommand, changedDomains, withDomains, WHOLE_SCENE } from './commands.js';
import { SceneError, canonicalJson } from './scene.js';

const rethrowAsync = error => queueMicrotask(() => { throw error; });

// Display listeners cannot veto state changes. An optional error hook receives
// (error, transition); by default errors are rethrown after the caller returns.
// cameraEqual compares validated cameras for pose history only. Space supplies
// its equalCameras; the default preserves Plane's canonical-JSON comparison.
export function createHistory({
  initialScene, codec, undoLimit = 100, cameraLimit = 100, onListenerError = rethrowAsync,
  cameraEqual = (a, b) => canonicalJson(a) === canonicalJson(b),
}) {
  let scene = codec.validate(initialScene);
  let revision = 0, gestureCounter = 0, gesture = null;
  const undoStack = [], redoStack = [], listeners = new Set();
  const poses = [scene.camera];
  let poseIndex = 0;

  const snapshot = () => Object.freeze({
    scene, revision, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    canBack: poseIndex > 0, canForward: poseIndex < poses.length - 1,
    undoDepth: undoStack.length, redoDepth: redoStack.length,
    camera: Object.freeze({ index: poseIndex, length: poses.length }), gesture: gesture?.kind ?? null,
  });

  function emit(cause, before, { preview = false, render = true, forceRevision = false } = {}) {
    const changed = changedDomains(before, scene);
    if (forceRevision || (before !== scene && !codec.equal(before, scene))) revision++;
    // Ordinary no-ops need no render. History traversal always gets a fresh
    // execution identity, even when it restores an identical scene (spec §6).
    const transition = Object.freeze({ cause, before, after: scene, changed: Object.freeze(changed), preview, render: render && (forceRevision || changed.length > 0), revision, snapshot: snapshot() });
    for (const listener of listeners) {
      try { listener(transition); }
      catch (error) {
        try { onListenerError(error, transition); }
        catch (reportingError) { rethrowAsync(reportingError); }
      }
    }
    return transition;
  }

  function recordCamera(camera) {
    if (cameraEqual(poses[poseIndex], camera)) return;
    poses.splice(poseIndex + 1);
    poses.push(camera);
    if (poses.length > cameraLimit) poses.shift();
    poseIndex = poses.length - 1;
  }

  function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > undoLimit) undoStack.shift();
    redoStack.length = 0;
  }

  function settleGesture() {
    if (!gesture) return null;
    const { start, whole } = gesture;
    gesture = null;
    if (whole) {
      // Opening a complete scene is one whole-scene undo entry (spec §6),
      // including an identical restoration; camera duplicates are still suppressed.
      pushUndo({ kind: WHOLE_SCENE, before: start, after: scene });
      recordCamera(scene.camera);
    } else {
      const changed = changedDomains(start, scene);
      const content = changed.filter(domain => domain !== 'camera');
      if (content.length) pushUndo({ kind: 'domains', domains: content, before: start, after: scene });
      if (changed.includes('camera')) recordCamera(scene.camera);
    }
    // The last preview already showed this state: committing never asks for another render.
    return emit('commit', scene, { render: false });
  }

  function begin({ kind }) {
    settleGesture();
    gesture = { id: ++gestureCounter, kind, start: scene, whole: false };
    return gesture.id;
  }

  function requireGesture(id) {
    if (!gesture || gesture.id !== id) throw new SceneError('stale-gesture', `gesture ${id} is not active`);
  }

  function update(id, command) {
    requireGesture(id);
    const before = scene;
    const result = reduceCommand(scene, command, codec);
    if (result.ownedDomains.includes(WHOLE_SCENE)) gesture.whole = true;
    scene = result.scene;
    return emit('preview', before, { preview: true });
  }

  function commit(id) { requireGesture(id); return settleGesture(); }

  function cancel(id) {
    requireGesture(id);
    const before = scene;
    scene = gesture.start;
    gesture = null;
    return emit('cancel', before);
  }

  // One discrete action: several commands, one history group, one render.
  function apply(commands, { kind = 'edit' } = {}) {
    settleGesture();
    const start = scene;
    const id = begin({ kind });
    try { for (const command of commands) update(id, command); }
    catch (error) { const before = scene; scene = start; gesture = null; emit('cancel', before); throw error; }
    settleGesture();
    const changed = changedDomains(start, scene);
    return Object.freeze({ cause: 'apply', before: start, after: scene, changed: Object.freeze(changed), preview: false, render: changed.length > 0, revision, snapshot: snapshot() });
  }

  function step(from, to, cause, pick) {
    settleGesture();
    const entry = from.at(-1);
    if (!entry) return null;
    const before = scene;
    const target = pick(entry);
    const next = entry.kind === WHOLE_SCENE ? target : codec.validate(withDomains(scene, target, entry.domains));
    from.pop();
    to.push(entry);
    scene = next;
    if (entry.kind === WHOLE_SCENE) recordCamera(scene.camera);
    return emit(cause, before, { forceRevision: true });
  }

  const undo = () => step(undoStack, redoStack, 'undo', entry => entry.before);
  const redo = () => step(redoStack, undoStack, 'redo', entry => entry.after);

  function moveCamera(offset, cause) {
    settleGesture();
    const index = poseIndex + offset;
    if (index < 0 || index >= poses.length) return null;
    poseIndex = index;
    const before = scene;
    scene = reduceCommand(scene, { type: 'setCamera', camera: poses[index] }, codec).scene;
    return emit(cause, before, { forceRevision: true });
  }

  return Object.freeze({
    snapshot, begin, update, commit, cancel, apply, undo, redo,
    back: () => moveCamera(-1, 'back'), forward: () => moveCamera(1, 'forward'),
    commitActive: settleGesture,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
}
