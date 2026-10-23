import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceDiagnostics } from '../../src/space/diagnostics-indicator.js';
import { createFakeClock } from '../support/fake-clock.mjs';
import { createFakeDocument } from '../support/fake-dom.mjs';

function rig(rung = 'L6d') {
  const clock = createFakeClock(), document = createFakeDocument();
  const element = document.querySelector('#space-diagnostics'), value = document.querySelector('#space-diagnostics-value');
  const indicator = createSpaceDiagnostics({ element, value, rung, setTimer: clock.schedule, clearTimer: clock.clear });
  indicator.setActive(true);
  return { clock, element, value, indicator };
}

test('r4-F5 pending diagnostics stay hidden for 249 ms and appear at 250 ms', () => {
  const h = rig();
  h.indicator.update({ diagnosticsState: 'pending' });
  assert.equal(h.element.hidden, true);
  h.clock.advance(249); assert.equal(h.element.hidden, true);
  h.clock.advance(1); assert.equal(h.element.hidden, false); assert.equal(h.value.textContent, 'pending');
  assert.equal(h.element.classList.contains('space-alert'), false);
  h.indicator.update({ diagnosticsState: 'confirmed' }); assert.equal(h.element.hidden, true);
  h.indicator.destroy();
});

test('r4-F5 a confirmed draft cancels pending display and a later draft gets its own delay', () => {
  const h = rig();
  h.indicator.update({ diagnosticsState: 'pending' }); h.clock.advance(200);
  h.indicator.update({ diagnosticsState: 'confirmed' }); h.clock.advance(100);
  assert.equal(h.element.hidden, true);
  h.indicator.update({ diagnosticsState: 'pending' }); h.clock.advance(249);
  assert.equal(h.element.hidden, true);
  h.clock.advance(1); assert.equal(h.element.hidden, false);
  h.indicator.destroy(); h.clock.advance(1000); assert.equal(h.element.hidden, true);
});

test('r4-F5 diagnostic failure and interruption are visible immediately', () => {
  for (const rung of ['L6b', 'L6c', 'L6d']) for (const state of ['failed', 'interrupted']) {
    const h = rig(rung);
    h.indicator.update({ diagnosticsState: 'pending' });
    h.indicator.update({ diagnosticsState: state });
    assert.equal(h.value.textContent, state);
    assert.equal(h.element.hidden, false);
    assert.equal(h.element.classList.contains('space-alert'), true);
    h.clock.advance(300); assert.equal(h.value.textContent, state, 'old pending timer cannot overwrite failure');
    h.indicator.setActive(false); assert.equal(h.element.hidden, true);
    h.indicator.destroy();
  }
});

test('r4-F5 diagnostic L6a suppresses interrupted and every diagnostic-only state', () => {
  const h = rig(undefined);
  // Explicit comparison mode retains its original indicator behavior.
  h.indicator.destroy();
  const indicator = createSpaceDiagnostics({ element: h.element, value: h.value, rung: 'L6a', setTimer: h.clock.schedule, clearTimer: h.clock.clear });
  indicator.setActive(true);
  for (const state of ['interrupted', 'failed', 'pending']) {
    indicator.update({ diagnosticsState: state }); h.clock.advance(300);
    assert.equal(h.element.hidden, true);
  }
  indicator.destroy();
});

test('B15-R16-F6 default diagnostics expose GPU-gated failure and delayed pending', () => {
  const h = rig(); h.indicator.destroy();
  const indicator = createSpaceDiagnostics({ element: h.element, value: h.value, setTimer: h.clock.schedule, clearTimer: h.clock.clear });
  indicator.setActive(true);
  indicator.update({ diagnosticsState: 'pending' });
  h.clock.advance(249); assert.equal(h.element.hidden, true);
  h.clock.advance(1); assert.equal(h.element.hidden, false);
  indicator.update({ diagnosticsState: 'failed' });
  assert.equal(h.value.textContent, 'failed');
  indicator.destroy();
});

test('r4-F5 provisional diagnostics are visible synchronously before present submission', () => {
  const h = rig('L6c');
  h.indicator.update({ diagnosticsState: 'pending', provisional: true });
  assert.equal(h.element.hidden, false);
  assert.equal(h.value.textContent, 'Validating — provisional');
  h.indicator.destroy();
});
