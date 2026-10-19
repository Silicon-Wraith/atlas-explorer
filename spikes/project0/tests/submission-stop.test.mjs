// spikes/project0/tests/submission-stop.test.mjs — T7 fix round 2 (Codex T7 r2, finding 6): the renderer's `submission-failed` abort is a
// classified stop in the one shared classifier (STOPS, session-utils.mjs; T10's ABORTS derives from it). A retired generation's rejected
// completion never latches the abort, so it produces no such invalidation and no stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stopReasons, stopReasonsOf } from '../session-utils.mjs';
import { createAbort } from '../gpu/abort.js';

test('a current submission failure is a classified stop', () => {
  const abort = createAbort();
  abort.abort({ kind: 'submission-failed', message: 'band completion rejected: OperationError' });
  assert.equal(abort.invalidation(), 'aborted: submission-failed');
  assert.deepEqual(stopReasonsOf([abort.invalidation()]), ['submission completion rejected']);
  assert.deepEqual(stopReasons({ invalidations: ['driver error: x', 'aborted: submission-failed'] }), ['submission completion rejected']);
});

test('without the abort (a retired generation\'s failure is only an event) there is no stop; other aborted forms stay unclassified', () => {
  const abort = createAbort();
  assert.equal(abort.invalidation(), null);
  assert.deepEqual(stopReasonsOf([]), []);
  assert.deepEqual(stopReasonsOf(['aborted: something-else']), []);
  assert.deepEqual(stopReasonsOf(['page error: TypeError']), []);
});
