import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeQueue } from '../../scripts/preparation/native-queue.mjs';
import { createPreparationSession } from '../../src/space/preparation/lifecycle.js';

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => queueMicrotask(resolve));
const spec = { world: { id: 'fixed', definitionKey: 'fixed-definition' }, bounds: { min: [-1, -1, -1], max: [1, 1, 1] }, intent: 'interaction', requirements: { maxErrorM: .01, bodyDiameterM: 1 } };
const producer = { instanceId: 'worker-nonce', epoch: 0 };
const cancelledResult = q => ({ result: { schema: 'atlas.preparation.result', schemaVersion: 1, identity: q.identity, producer: q.producer, status: 'cancelled', reason: 'control complete', artifact: null }, payload: null });

test('PC2 cancels two queued producers promptly while the active job retains its native slot', async () => {
  const active = deferred(), dispatched = [], queue = createNativeQueue({ dispatch: q => { dispatched.push(q.identity.requestId); return active.promise.then(() => cancelledResult(q)); } });
  const session = createPreparationSession({ runtimeId: 'test', producer, maxLive: 3 });
  const run = () => session.start(spec, { produce: (q, signal) => queue.submit({ ...q, kind: 'coarse' }, signal), prepare: () => assert.fail('cancelled cannot prepare') });
  const one = run(), two = run(), three = run(); await tick(); await tick();
  assert.deepEqual(queue.snapshot(), { active: 1, queued: 2, closed: false });
  assert.equal(session.diagnostics().live, 3);
  await Promise.all([two.cancel(), three.cancel()]);
  assert.equal(session.diagnostics().live, 1); assert.deepEqual(queue.snapshot(), { active: 1, queued: 0, closed: false });
  const next = run(); await tick(); assert.equal(session.diagnostics().live, 2); assert.equal(queue.snapshot().queued, 1);
  await next.cancel(); active.resolve(); await one.done; await queue.close(); await session.shutdown();
  assert.equal(dispatched.length, 1); assert.equal(session.diagnostics().live, 0);
});

test('PC2 dispatches queued interaction before view without preempting the running job', async () => {
  const gates = [], order = [], queue = createNativeQueue({ dispatch: q => { order.push(q.name); const gate = deferred(); gates.push(gate); return gate.promise; } });
  const first = queue.submit({ name: 'running-view', kind: 'view' });
  const view = queue.submit({ name: 'queued-view', kind: 'view' });
  const body = queue.submit({ name: 'body', kind: 'coarse' }); await tick();
  assert.deepEqual(order, ['running-view']); gates[0].resolve('first'); await first; await tick(); await tick();
  assert.deepEqual(order, ['running-view', 'body']); gates[1].resolve('body'); await body; await tick(); await tick();
  assert.deepEqual(order, ['running-view', 'body', 'queued-view']); gates[2].resolve('view'); await view; await queue.close();
});

test('PC2 keeps active orphan work owned until completion and rejects excess queued work', async () => {
  const gate = deferred(), controller = new AbortController(), orphans = [];
  const queue = createNativeQueue({ dispatch: () => gate.promise, maxQueued: 0, onOrphan: value => orphans.push(value) });
  const p = queue.submit({ kind: 'coarse' }, controller.signal); await tick(); controller.abort();
  await assert.rejects(p, { name: 'AbortError' }); assert.equal(queue.snapshot().active, 1);
  await assert.rejects(queue.submit({ kind: 'coarse' }), error => error.code === 'capacity');
  const close = queue.close(); gate.resolve({ actual: 'late-result' }); await close;
  assert.deepEqual(orphans, [{ actual: 'late-result' }]); assert.equal(queue.snapshot().active, 0);
});

test('PC2 close settles queued clients and drains native ownership', async () => {
  const gate = deferred(), queue = createNativeQueue({ dispatch: () => gate.promise });
  const one = queue.submit({ kind: 'coarse' }), two = queue.submit({ kind: 'view' }); await tick();
  const rejected = Promise.all([assert.rejects(one, error => error.code === 'closed'), assert.rejects(two, error => error.code === 'closed')]);
  const closing = queue.close(); await rejected; gate.resolve(); await closing;
  assert.deepEqual(queue.snapshot(), { active: 0, queued: 0, closed: true });
});
