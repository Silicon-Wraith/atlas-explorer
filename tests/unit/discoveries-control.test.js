import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryCards, writeMessage, outstandingMessage, EMPTY_MESSAGE } from '../../src/ui/discoveries.js';

const blob = new Blob(['x'], { type: 'image/jpeg' });
const record = (id, note = '') => ({ name: `Discovery ${id}`, note, thumbnail: { blob } });
const snapshot = (local, writes = []) => ({ workspace: 'plane', sources: { local: { label: 'This browser', nextCursor: null, total: null, ...local } }, writes });

test('cards show supported and unsupported discoveries with source-qualified keys', () => {
  const model = discoveryCards(snapshot({ status: 'ready', reason: '', total: 2, items: [
    { key: 'local:a', id: 'a', record: record('a', 'MY NOTE') },
    { key: 'local:b', id: 'b', unsupported: 'missing field sceneHash' },
  ] }));
  assert.deepEqual([model.loaded, model.total], [2, 2]);
  assert.deepEqual(model.cards.map(card => [card.key, card.openable, card.description]), [['local:a', true, 'MY NOTE'], ['local:b', false, 'CANNOT BE OPENED']]);
  assert.equal(model.cards[0].thumbnail, blob);
  assert.equal(model.empty, false);
});

test('every discovery stays reachable: a next page is offered and the count is the total', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ key: `local:${i}`, id: String(i), record: record(i) }));
  const model = discoveryCards(snapshot({ status: 'ready', reason: '', items, nextCursor: '50', total: 51 }));
  assert.deepEqual([model.loaded, model.total], [50, 51]);
  assert.deepEqual(model.more, [{ sourceId: 'local', label: 'This browser', loaded: 50, total: 51 }]);
  assert.deepEqual(discoveryCards(snapshot({ status: 'ready', reason: '', items, total: 50 })).more, []);
});

test('an empty, loading or unavailable source is presented honestly', () => {
  assert.equal(discoveryCards(snapshot({ status: 'ready', reason: '', items: [], total: 0 })).empty, true);
  assert.equal(EMPTY_MESSAGE, 'Find a place you love. Press B to keep it here.');
  const loading = discoveryCards(snapshot({ status: 'loading', reason: '', items: [] }));
  assert.deepEqual([loading.loading, loading.empty], [true, false], 'loading is not empty');
  const down = discoveryCards(snapshot({ status: 'unavailable', reason: 'did not respond in time', items: [] }));
  assert.deepEqual(down.unavailable, [{ sourceId: 'local', label: 'This browser', reason: 'did not respond in time' }]);
  assert.equal(down.empty, false, 'an unavailable source is not shown as an empty one');
});

test('outstanding and unknown writes are visible until resolved', () => {
  const writes = [{ writeId: 'w1', kind: 'save', status: 'checking' }, { writeId: 'w2', kind: 'remove', status: 'pending' }, { writeId: 'w3', kind: 'save', status: 'unknown' }, { writeId: 'w4', kind: 'save', status: 'committed' }];
  const model = discoveryCards(snapshot({ status: 'ready', reason: '', items: [], total: 0 }, writes));
  assert.deepEqual(model.outstanding.map(write => write.writeId), ['w1', 'w2']);
  assert.deepEqual(model.unknown.map(write => write.writeId), ['w3']);
  assert.equal(outstandingMessage(writes[0]), 'Saving a discovery — checking the result…');
  assert.equal(outstandingMessage(writes[1]), 'Removing a discovery…');
});

test('write messages never claim an outcome that was not observed', () => {
  assert.match(writeMessage({ status: 'committed' }, 'save'), /saved/);
  assert.match(writeMessage({ status: 'unknown' }, 'save'), /Check again/);
  assert.doesNotMatch(writeMessage({ status: 'unknown' }, 'remove'), /removed\./);
  assert.match(writeMessage({ status: 'failed', reason: 'QuotaExceededError' }, 'save'), /could not be saved \(QuotaExceededError\)/);
  assert.match(writeMessage({ status: 'aborted' }, 'remove'), /not removed/);
});

// T11 adaptation: the real controller (amendment D) can also hand the control a write that is still
// pending or checking (reconcile during observation), an unknown write left by teardown, no write at
// all (reconcile of an unrecorded id), and a failure without a reason. None of these may claim an outcome.
test('write messages cover every status the controller can report without claiming an outcome', () => {
  const claims = /\b(saved|removed)\.|was not|could not be (saved|removed)/;
  for (const verb of ['save', 'remove']) {
    for (const observation of [{ status: 'pending' }, { status: 'checking' }, { status: 'unknown', reason: 'the control was destroyed before the outcome was known' }, null, undefined, { status: 'surprising' }]) {
      const message = writeMessage(observation, verb);
      assert.ok(message.length > 0, `a message for ${JSON.stringify(observation)}`);
      assert.doesNotMatch(message, claims, `${verb} ${JSON.stringify(observation)} → ${message}`);
    }
    assert.match(writeMessage({ status: 'checking' }, verb), /still being checked/);
  }
  assert.equal(writeMessage({ status: 'failed', reason: '' }, 'remove'), 'The discovery could not be removed.');
  assert.equal(writeMessage({ status: 'failed' }, 'save'), 'The discovery could not be saved. Use Capture → Save location to keep this view.');
  assert.equal(writeMessage({ status: 'committed' }, 'remove'), 'Discovery removed.');
});
