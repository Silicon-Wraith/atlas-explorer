import test from 'node:test';
import assert from 'node:assert/strict';
import { openPersistence, PersistenceError, DATABASE_NAME, DATABASE_VERSION, encodePageCursor, decodePageCursor, compareKeys } from '../../src/shared/persistence.js';
import { createFakePersistence } from '../support/fake-persistence.mjs';

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

// Fix round 1 (Codex r1 finding 2): an open already reported as blocked or timed out never
// changes the schema later. A late upgrade is aborted before any change; an upgrade still running
// at the deadline is aborted. (An upgrade that already committed cannot be undone.)
const upgradeSpy = () => {
  const spy = { aborted: 0, created: [] };
  spy.transaction = { abort() { spy.aborted++; } };
  spy.db = { objectStoreNames: { contains: () => false }, createObjectStore(name) { spy.created.push(name); return { createIndex() {} }; }, close() {} };
  return spy;
};

test('a late upgrade after a blocked open is aborted before any schema change', async () => {
  const spy = upgradeSpy();
  let later;
  const late = scriptedIndexedDB(request => { request.onblocked(); later = new Promise(resolve => setTimeout(() => { request.transaction = spy.transaction; request.result = spy.db; request.onupgradeneeded(); resolve(); }, 20)); });
  await assert.rejects(openPersistence({ indexedDB: late, timeoutMs: 200 }), error => error.code === 'blocked');
  await new Promise(resolve => setTimeout(resolve, 0));
  await later;
  assert.deepEqual({ aborted: spy.aborted, created: spy.created }, { aborted: 1, created: [] });
});

test('an upgrade still running at the deadline is aborted', async () => {
  const spy = upgradeSpy();
  const slow = scriptedIndexedDB(request => { request.transaction = spy.transaction; request.result = spy.db; request.onupgradeneeded(); });
  await assert.rejects(openPersistence({ indexedDB: slow, timeoutMs: 20 }), error => error.code === 'timed-out');
  assert.equal(spy.aborted, 1, 'the timed-out open aborted its upgrade transaction');
});

// Fix round 1 (Codex r1 findings 1 and 3): a page cursor is opaque and anchored on the last item's
// ordering key (createdAt, then id), bound to its workspace, and fully validated before any read.
test('a page cursor is opaque, anchored on the last ordering key, and fully validated', () => {
  const cursor = encodePageCursor('plane', { createdAt: '2026-10-20T00:00:03.000Z', id: 'c' });
  assert.equal(typeof cursor, 'string');
  assert.deepEqual(decodePageCursor(cursor, 'plane'), { createdAt: '2026-10-20T00:00:03.000Z', id: 'c' });
  assert.equal(decodePageCursor(null, 'plane'), null);
  for (const bad of ['50', '4294967296', 'after:', 'after:[1,2,3]', 'after:["plane","x"]', 'after:{}', 42, '']) assert.throws(() => decodePageCursor(bad, 'plane'), RangeError, String(bad));
  assert.throws(() => decodePageCursor(cursor, 'space'), RangeError, 'a cursor from another workspace is refused');
});

const listed = async (store, cursor, limit) => { const page = await store.listDiscoveries({ workspace: 'plane', limit, cursor }); return { ids: page.items.map(item => item.id), nextCursor: page.nextCursor }; };
const at = (id, second) => ({ store: 'discoveries', value: { id, workspace: 'plane', createdAt: `2026-10-20T00:00:0${second}.000Z` } });

test('paging continues after its anchor through concurrent inserts, deletes and equal timestamps', async () => {
  const store = createFakePersistence();
  await store.commit({ puts: [at('e', 5), at('d', 4), at('c', 3), at('b', 3), at('a', 1), { store: 'discoveries', value: { id: 'z', workspace: 'space', createdAt: '2026-10-20T00:00:09.000Z' } }], deletes: [] });
  const first = await listed(store, null, 3);
  assert.deepEqual(first.ids, ['e', 'd', 'c'], 'newest first; equal timestamps by id, descending');
  // Another connection deletes a record already shown and inserts one behind the anchor.
  await store.commit({ puts: [at('ba', 3), at('f', 6)], deletes: [{ store: 'discoveries', key: 'd' }] });
  const second = await listed(store, first.nextCursor, 3);
  assert.deepEqual(second, { ids: ['ba', 'b', 'a'], nextCursor: null }, 'nothing behind the anchor is skipped or repeated');
  const pages = [];
  for (let cursor = null, page; (page = await listed(store, cursor, 1)), pages.push(...page.ids), page.nextCursor; cursor = page.nextCursor);
  assert.deepEqual(pages, ['f', 'e', 'c', 'ba', 'b', 'a'], 'one record per page reaches every record exactly once');
  await assert.rejects(store.listDiscoveries({ workspace: 'plane', limit: 3, cursor: '4294967296' }), RangeError);
});

// Fix round 2 (Codex r2 finding 4): anchors are the actual IndexedDB ordering keys (index key
// createdAt, primary key id) of whatever row ends a page, valid for ATLAS or not, and every cursor
// the store emits decodes. Unsupported rows still reach T09's validator and hide nothing around them.
const ORDERED_KEYS = () => [-Infinity, -1, 0, 7, Infinity, new Date(0), new Date(5), '', '7', 'L', 'a', 'x'.repeat(5000), '\uffff', new Uint8Array([]).buffer, new Uint8Array([0]).buffer, new Uint8Array([1, 2]).buffer, [], [1], [1, 'a'], ['a'], [[]]];

test('keys order as IndexedDB orders them, and every emitted cursor decodes to its anchor', () => {
  const keys = ORDERED_KEYS();
  for (let i = 0; i < keys.length; i++) for (let j = 0; j < keys.length; j++) assert.equal(compareKeys(keys[i], keys[j]), Math.sign(i - j), `${i} vs ${j}`);
  for (const bad of [NaN, new Date(NaN), null, undefined, true, {}, [NaN]]) assert.throws(() => compareKeys(bad, 0), RangeError);
  for (const createdAt of keys) for (const id of [7, 'x'.repeat(5000), new Date(3), new Uint8Array([9]).buffer, ['a', 1]]) {
    const anchor = decodePageCursor(encodePageCursor('plane', { createdAt, id }), 'plane');
    assert.equal(compareKeys(anchor.createdAt, createdAt), 0);
    assert.equal(compareKeys(anchor.id, id), 0);
  }
  assert.throws(() => encodePageCursor('plane', { createdAt: '2026-10-20T00:00:00.000Z', id: {} }), RangeError, 'only valid keys are anchors');
});

// Rows that are valid IndexedDB rows but not valid ATLAS discoveries (a numeric id, an oversized
// id, a Date or numeric createdAt), at page boundaries between valid rows.
const UNSUPPORTED_ROWS = () => [
  { id: 'v3', createdAt: '2026-10-20T00:00:05.000Z' }, { id: 7, createdAt: '2026-10-20T00:00:04.000Z' },
  { id: 'L'.padEnd(5000, 'x'), createdAt: '2026-10-20T00:00:04.000Z' }, { id: 'v2', createdAt: '2026-10-20T00:00:04.000Z' },
  { id: 'vd', createdAt: new Date(Date.UTC(2026, 9, 20)) }, { id: 'vn', createdAt: 5 }, { id: 'v1', createdAt: '2026-10-20T00:00:01.000Z' },
].map(row => ({ ...row, workspace: 'plane' }));
const shortId = id => (typeof id === 'string' && id.length > 20 ? `long${id.length}` : id);

test('unsupported rows at page boundaries neither break nor hide the pages around them', async () => {
  const store = createFakePersistence();
  await store.commit({ puts: UNSUPPORTED_ROWS().map(value => ({ store: 'discoveries', value })), deletes: [] });
  for (const limit of [1, 2, 3]) {
    const walked = [];
    try { for (let cursor = null, page; (page = await store.listDiscoveries({ workspace: 'plane', limit, cursor })), walked.push(...page.items.map(item => shortId(item.id))), page.nextCursor; cursor = page.nextCursor); }
    catch (error) { walked.push(`${error.name}: ${error.message}`); }
    assert.deepEqual(walked, ['v3', 'v2', 'long5000', 7, 'v1', 'vd', 'vn'], `limit ${limit}`);
  }
  assert.equal(await store.countDiscoveries({ workspace: 'plane' }), 7);
});
