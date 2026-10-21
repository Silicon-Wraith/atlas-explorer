import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationKey, pointAt, bindPlaneNavigation } from '../../src/plane/navigation.js';
import { moveView, zoomView } from '../../src/plane/math.js';

const view = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };

test('navigation keys produce exactly the views the previous handlers produced', () => {
  assert.deepEqual(navigationKey('+', view), zoomView(view, view.zoom + Math.log10(2)));
  assert.deepEqual(navigationKey('=', view), zoomView(view, view.zoom + Math.log10(2)));
  assert.deepEqual(navigationKey('-', view), zoomView(view, view.zoom - Math.log10(2)));
  assert.deepEqual(navigationKey('arrowleft', view), moveView(view, -.08, 0));
  assert.deepEqual(navigationKey('arrowdown', view), moveView(view, 0, -.08));
  assert.equal(navigationKey('b', view), null);
});

test('pointer offsets are measured from the centre in viewport widths', () => {
  assert.deepEqual(pointAt(500, 250, 1000, 500), [0, 0]);
  assert.deepEqual(pointAt(1000, 0, 1000, 500), [0.5, 0.25]);
});

test('reset forgets a captured drag, so further movement cannot navigate', () => {
  const listeners = {}, released = [], moves = [];
  const surface = { addEventListener: (type, fn) => { listeners[type] = fn; }, setPointerCapture() {}, releasePointerCapture: id => released.push(id) };
  const canvas = { focus() {}, classList: { add() {}, remove() {} } };
  const navigation = bindPlaneNavigation({ surface, getCanvas: () => canvas, getView: () => view, onPointerStart() {}, grouped() {}, drag: next => moves.push(next), dragEnd() {}, jump() {} });
  globalThis.innerWidth = 1000; globalThis.innerHeight = 500;
  listeners.pointerdown({ button: 0, pointerId: 7, clientX: 100, clientY: 100 });
  listeners.pointermove({ pointerId: 7, clientX: 110, clientY: 100 });
  assert.equal(moves.length, 1);
  assert.equal(navigation.reset(), 1);
  assert.deepEqual(released, [7]);
  listeners.pointermove({ pointerId: 7, clientX: 150, clientY: 100 });
  assert.equal(moves.length, 1, 'movement after reset does not navigate');
});

// Plan amendment G(1), carried from T05 fix round 1: only the first pointer of a drag settles earlier
// activity (a second finger joins the open drag or pinch and never commits it early), the release of
// the last tracked pointer ends the drag exactly once, and a pointer forgotten by reset() — whose
// capture release the browser answers with lostpointercapture — neither navigates nor ends a drag.
test('only the first pointer settles earlier activity, and a forgotten pointer cannot end a drag', () => {
  const listeners = {}, starts = [], moves = [], ends = [];
  const surface = { addEventListener: (type, fn) => { listeners[type] = fn; }, setPointerCapture() {}, releasePointerCapture() {} };
  const canvas = { focus() {}, classList: { add() {}, remove() {} } };
  const navigation = bindPlaneNavigation({ surface, getCanvas: () => canvas, getView: () => view, onPointerStart: first => starts.push(first), grouped() {}, drag: next => moves.push(next), dragEnd: () => ends.push('end'), jump() {} });
  globalThis.innerWidth = 1000; globalThis.innerHeight = 500;
  listeners.pointerdown({ button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  listeners.pointermove({ pointerId: 1, clientX: 120, clientY: 100 });
  listeners.pointerdown({ button: 0, pointerId: 2, clientX: 300, clientY: 100 });
  assert.deepEqual(starts, [true, false], 'the first pointer settles; a joining finger does not');
  listeners.pointermove({ pointerId: 2, clientX: 320, clientY: 100 });
  assert.equal(moves.length, 2, 'a second finger pinches within the same drag');
  assert.ok(moves[1].zoom > view.zoom, 'spreading the fingers zooms in');
  listeners.pointerup({ pointerId: 1 });
  assert.deepEqual(ends, [], 'the drag continues while a pointer remains');
  listeners.pointerup({ pointerId: 2 });
  assert.deepEqual(ends, ['end'], 'the last release ends the drag once');
  listeners.pointerdown({ button: 0, pointerId: 3, clientX: 100, clientY: 100 });
  assert.equal(navigation.reset(), 1);
  listeners.lostpointercapture({ pointerId: 3 });
  listeners.pointerup({ pointerId: 3 });
  assert.deepEqual(ends, ['end'], 'a forgotten pointer ends nothing');
  assert.deepEqual(starts, [true, false, true], 'after a reset the next pointer is a first pointer again');
});
