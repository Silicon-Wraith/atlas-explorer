import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftRecords } from '../../src/space/render/draft-records.js';
const identity = (n, epoch = 1) => ({ requestId: `r${n}`, jobId: `j${n}`, viewId: 'space', generation: { deviceEpoch: epoch, viewRevision: n, geometryRevision: n, appearanceRevision: 1 } });
const event = (n, epoch = 1) => ({ identity: identity(n, epoch), requestId: `r${n}`, camera: { pose: n }, quality: { sampling: { seed: 1 } }, sampleIndex: 0, presentationSubmittedAt: n, eligible: true });

test('r4-F3 loss interrupts only the lost epoch with a newer epoch already pending', () => {
  const updates = [], records = createDraftRecords({ clock: () => 30, onUpdate: u => updates.push(u) });
  const old = records.begin(event(1, 7)), next = records.begin(event(2, 8));
  records.displayed(next.frameId);
  assert.deepEqual(records.interrupt(7).map(u => u.frameId), [old.frameId]);
  assert.equal(records.pending(), 1);
  assert.equal(records.displayedFrame(), next.frameId);
  assert.equal(records.confirm(old.frameId, old.identity, {}), false);
  assert.equal(records.confirm(next.frameId, next.identity, {}).diagnosticsState, 'confirmed');
  assert.deepEqual(updates.map(u => [u.identity.generation.deviceEpoch, u.diagnosticsState]), [[7, 'interrupted'], [8, 'confirmed']]);
});

test('r4-F4 pruning completed history preserves an older pending record', () => {
  const records = createDraftRecords({ clock: () => 30, historyLimit: 2 });
  const pending = records.begin(event(1));
  for (let n = 2; n <= 8; n++) {
    const frame = records.begin(event(n)); records.displayed(frame.frameId);
    records.confirm(frame.frameId, frame.identity, {});
  }
  assert.equal(records.pending(), 1);
  let confirmed;
  assert.doesNotThrow(() => { confirmed = records.confirm(pending.frameId, pending.identity, {}); }, 'pending records must survive pruning');
  assert.equal(confirmed.diagnosticsState, 'confirmed');
  assert.equal(records.pending(), 0);
});

test('r4-F4 confirmation rejects a backward clock without consuming the pending record', () => {
  let time = 9;
  const updates = [], records = createDraftRecords({ clock: () => time, onUpdate: u => updates.push(u) });
  const frame = records.begin(event(10)); records.displayed(frame.frameId);
  assert.throws(() => records.confirm(frame.frameId, frame.identity, {}), /invalid confirmation clock/);
  assert.equal(records.pending(), 1); assert.deepEqual(updates, []);
  time = 10;
  assert.equal(records.confirm(frame.frameId, frame.identity, {}).acceptanceAt, 10);
  assert.equal(records.pending(), 0);
});

test('B15-REC-G reordered confirmations remain immutable historical records without redisplay', () => {
  let time = 10; const updates = [], records = createDraftRecords({ clock: () => time, onUpdate: u => updates.push(u) });
  assert.ok(records, 'record lifecycle is implemented');
  const first = records.begin(event(1)), second = records.begin(event(2));
  records.displayed(second.frameId);
  records.confirm(second.frameId, second.identity, { rayTermination: { hit: 1 } }); time = 20;
  const old = records.confirm(first.frameId, first.identity, { rayTermination: { hit: 2 } });
  assert.equal(old.historical, true); assert.equal(old.acceptanceAt, 20);
  assert.equal(records.displayedFrame(), second.frameId);
  assert.equal(first.diagnosticsState, 'pending'); assert.equal(first.rayTermination, null);
  assert.equal(updates.length, 2); assert.ok(Object.isFrozen(first));
  assert.equal(records.confirm(first.frameId, first.identity, {}), false, 'terminal records never revive');
  assert.throws(() => records.begin({ ...event(3), eligible: false }), /eligible/);
});

test('B15-REC-G record ring backpressure stale identities loss and late callbacks preserve ownership', () => {
  const records = createDraftRecords({ clock: () => 30 });
  assert.ok(records);
  const first = records.begin(event(1)), second = records.begin(event(2));
  assert.throws(() => records.begin(event(3)), /capacity/);
  assert.throws(() => records.confirm(first.frameId, identity(99), {}), /identity/);
  records.confirm(first.frameId, first.identity, {});
  const third = records.begin(event(3));
  const interrupted = records.interrupt(1, 'device-lost');
  assert.deepEqual(interrupted.map(u => u.frameId), [second.frameId, third.frameId]);
  assert.ok(interrupted.every(u => u.diagnosticsState === 'interrupted'));
  const next = records.begin(event(4, 2));
  assert.equal(records.confirm(second.frameId, second.identity, {}), false);
  assert.equal(records.confirm(next.frameId, next.identity, {}).diagnosticsState, 'confirmed');
  assert.equal(records.pending(), 0);
});
