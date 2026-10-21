import test from 'node:test';
import assert from 'node:assert/strict';
import { openPersistence, PersistenceError, DATABASE_NAME, DATABASE_VERSION } from '../../src/shared/persistence.js';

// Node has no IndexedDB: these tests drive the open protocol with a scripted request.
// Commits, rollback and reopen run against real IndexedDB in tests/workflow.mjs.
function scriptedIndexedDB(script) {
  const opened = [];
  return { opened, open(name, version) { const request = {}; opened.push({ name, version }); setTimeout(() => script(request), 0); return request; } };
}

test('missing IndexedDB is reported as unavailable, never replaced by another store', async () => {
  await assert.rejects(openPersistence({ indexedDB: undefined }), error => error instanceof PersistenceError && error.code === 'unavailable');
});

test('opening is bounded, and a blocked or failed open is classified', async () => {
  const silent = scriptedIndexedDB(() => {});
  await assert.rejects(openPersistence({ indexedDB: silent, timeoutMs: 20 }), error => error.code === 'timed-out');
  assert.deepEqual(silent.opened, [{ name: DATABASE_NAME, version: DATABASE_VERSION }]);
  await assert.rejects(openPersistence({ indexedDB: scriptedIndexedDB(request => request.onblocked()), timeoutMs: 200 }), error => error.code === 'blocked');
  await assert.rejects(openPersistence({ indexedDB: scriptedIndexedDB(request => { request.error = new Error('denied'); request.onerror(); }), timeoutMs: 200 }), error => error.code === 'unavailable' && /denied/.test(error.message));
});

test('a connection that arrives after the deadline is closed, not used', async () => {
  let closed = false;
  const late = scriptedIndexedDB(request => setTimeout(() => { request.result = { close: () => { closed = true; } }; request.onsuccess(); }, 40));
  await assert.rejects(openPersistence({ indexedDB: late, timeoutMs: 10 }), error => error.code === 'timed-out');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(closed, true);
});
