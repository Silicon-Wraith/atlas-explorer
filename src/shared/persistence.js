// The browser's durable store (spec §14): IndexedDB database `atlas-workbench`, version 1,
// with `discoveries` (thumbnail Blob inline), `reports` and `writes` (one marker per committed
// write, so a write's outcome can be confirmed by its identity). A batch commits in one
// transaction and succeeds only on the transaction's `complete` event. There is no fallback
// store: if IndexedDB is unavailable, saving reports that, never a false success.
// Deletion is part of the same batch operation (`deletes: [{ store, key }]`), for records and for
// write markers alike; pruning policy belongs to the caller (plan amendment E, T09b).
export const DATABASE_NAME = 'atlas-workbench';
export const DATABASE_VERSION = 1;
export const STORES = Object.freeze({ discoveries: 'id', reports: 'reportId', writes: 'writeId' });

export class PersistenceError extends Error {
  constructor(code, message) { super(message); this.name = 'PersistenceError'; this.code = code; }
}

export function openPersistence({ indexedDB = globalThis.indexedDB, databaseName = DATABASE_NAME, version = DATABASE_VERSION, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new PersistenceError('unavailable', 'This browser does not provide IndexedDB storage.')); return; }
    let settled = false, request, upgrade = null;
    const fail = (code, message) => { if (!settled) { settled = true; clearTimeout(timer); reject(new PersistenceError(code, message)); } };
    // An open that was already reported never changes the schema afterwards: an upgrade still
    // running at the deadline is aborted (one that already committed cannot be undone).
    const abortUpgrade = () => { try { upgrade?.abort(); } catch { /* already finished */ } };
    const timer = setTimeout(() => { fail('timed-out', `Opening browser storage took longer than ${timeoutMs} ms.`); abortUpgrade(); }, timeoutMs);
    try { request = indexedDB.open(databaseName, version); }
    catch (error) { fail('unavailable', error.message); return; }
    request.onupgradeneeded = () => {
      upgrade = request.transaction;
      // A late upgrade (after a blocked or timed-out report) is aborted before any schema change.
      if (settled) { abortUpgrade(); return; }
      const db = request.result;
      if (!db.objectStoreNames.contains('discoveries')) db.createObjectStore('discoveries', { keyPath: STORES.discoveries }).createIndex('byWorkspaceCreated', ['workspace', 'createdAt']);
      if (!db.objectStoreNames.contains('reports')) db.createObjectStore('reports', { keyPath: STORES.reports });
      if (!db.objectStoreNames.contains('writes')) db.createObjectStore('writes', { keyPath: STORES.writes });
    };
    request.onblocked = () => fail('blocked', 'Browser storage is blocked by another open ATLAS tab.');
    request.onerror = () => fail('unavailable', request.error?.message || 'Browser storage could not be opened.');
    // A connection that arrives after the open was reported (timed out or blocked) is closed, not used.
    request.onsuccess = () => {
      const db = request.result;
      upgrade = null;
      if (settled) { db.close(); return; }
      settled = true; clearTimeout(timer);
      db.onversionchange = () => db.close();
      resolve(createStore(db, typeof indexedDB.cmp === 'function' ? (a, b) => indexedDB.cmp(a, b) : compareKeys));
    };
  });
}

const cancelledError = () => Object.assign(new Error('The read was cancelled.'), { name: 'AbortError' });
const done = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

// IndexedDB reads cannot be interrupted; a cancelled read rejects at once and its result is ignored.
// A read already cancelled is not started. A read that cannot start (a closed connection) rejects;
// it never throws synchronously.
function cancellable(start, signal) {
  if (signal?.aborted) return Promise.reject(cancelledError());
  let promise;
  try { promise = Promise.resolve(start()); } catch (error) { return Promise.reject(error); }
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(cancelledError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', onAbort); resolve(value); }, error => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}

// IndexedDB key order (W3C IndexedDB, "compare two keys"): number < date < string < binary <
// array; strings by code unit, binary bytewise, arrays element by element and then by length.
// Throws RangeError for anything that is not a valid key. The test fake orders by this; the
// production store compares with the browser's own `indexedDB.cmp` when it has one.
const keyType = key => {
  if (typeof key === 'number') return Number.isNaN(key) ? -1 : 0;
  if (key instanceof Date) return Number.isNaN(key.getTime()) ? -1 : 1;
  if (typeof key === 'string') return 2;
  if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) return 3;
  if (Array.isArray(key)) return Array.from(key).every(item => keyType(item) >= 0) ? 4 : -1;
  return -1;
};
const bytesOf = key => (key instanceof ArrayBuffer ? new Uint8Array(key) : new Uint8Array(key.buffer, key.byteOffset, key.byteLength));
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function compareKeys(a, b) {
  const ta = keyType(a), tb = keyType(b);
  if (ta < 0 || tb < 0) throw new RangeError('not a valid IndexedDB key');
  if (ta !== tb) return order(ta, tb);
  switch (ta) {
    case 0: case 2: return order(a, b);
    case 1: return order(a.getTime(), b.getTime());
    case 3: {
      const x = bytesOf(a), y = bytesOf(b);
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return order(x[i], y[i]);
      return order(x.length, y.length);
    }
    default: {
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = compareKeys(a[i], b[i]); if (c) return c; }
      return order(a.length, b.length);
    }
  }
}

// A key as JSON that keeps its type: ['n'|'d', decimal string] (covers ±Infinity), ['s', string],
// ['b', hex bytes], ['a', [keys]]. decodeKey(encodeKey(k)) compares equal to k for every valid key.
function encodeKey(key) {
  switch (keyType(key)) {
    case 0: return ['n', String(key)];
    case 1: return ['d', String(key.getTime())];
    case 2: return ['s', key];
    case 3: return ['b', Array.from(bytesOf(key), byte => byte.toString(16).padStart(2, '0')).join('')];
    case 4: return ['a', key.map(encodeKey)];
    default: throw new RangeError('a page anchor must be a valid IndexedDB key');
  }
}
function decodeKey(encoded) {
  const invalid = () => { throw new RangeError('not a page cursor of this store'); };
  if (!Array.isArray(encoded) || encoded.length !== 2) invalid();
  const [tag, body] = encoded;
  const number = () => { const value = typeof body === 'string' ? Number(body) : NaN; if (Number.isNaN(value) || String(value) !== body) invalid(); return value; };
  // A date body is an exact time value: an integer within the Date range (±8.64e15 ms).
  const time = () => { const value = number(); const date = new Date(value); if (!Number.isInteger(value) || date.getTime() !== value) invalid(); return date; };
  switch (tag) {
    case 'n': return number();
    case 'd': return time();
    case 's': return typeof body === 'string' ? body : invalid();
    case 'b': return typeof body === 'string' && /^(?:[0-9a-f]{2})*$/.test(body) ? new Uint8Array(body.match(/../g)?.map(pair => parseInt(pair, 16)) ?? []).buffer : invalid();
    case 'a': return Array.isArray(body) ? body.map(decodeKey) : invalid();
    default: return invalid();
  }
}

// Page cursors are opaque: they name the workspace and the IndexedDB ordering keys of the last row
// returned — its index key `createdAt` and its primary key `id`, whatever their types and whether or
// not the row is a valid ATLAS discovery (createdAt, then id; both descending) — so a page continues
// strictly after that row whatever was inserted or deleted meanwhile. Every cursor emitted decodes.
// Shared with the test fake.
const CURSOR_PREFIX = 'after:';
export function encodePageCursor(workspace, { createdAt, id }) {
  if (typeof workspace !== 'string') throw new RangeError('a page cursor needs a workspace');
  return CURSOR_PREFIX + JSON.stringify([workspace, encodeKey(createdAt), encodeKey(id)]);
}
export function decodePageCursor(cursor, workspace) {
  if (cursor === null || cursor === undefined) return null;
  let parts = null;
  if (typeof cursor === 'string' && cursor.startsWith(CURSOR_PREFIX)) {
    try { parts = JSON.parse(cursor.slice(CURSOR_PREFIX.length)); } catch { parts = null; }
  }
  if (!Array.isArray(parts) || parts.length !== 3 || typeof parts[0] !== 'string') throw new RangeError(`not a page cursor of this store: ${String(cursor).slice(0, 80)}`);
  if (parts[0] !== workspace) throw new RangeError('this page cursor belongs to another workspace');
  return { createdAt: decodeKey(parts[1]), id: decodeKey(parts[2]) };
}
// True when (createdAt, id) comes after the anchor in newest-first order.
export const afterAnchor = (anchor, createdAt, id, compare = compareKeys) => {
  if (!anchor) return true;
  const byTime = compare(createdAt, anchor.createdAt);
  return byTime < 0 || (byTime === 0 && compare(id, anchor.id) < 0);
};

function createStore(db, compare) {
  // Every index key [workspace, createdAt] of one workspace, whatever createdAt's type: [workspace]
  // sorts before all of them, and [workspace + '\u0000'] (excluded) after all of them and before
  // every other workspace, since no string lies between workspace and workspace + '\u0000'.
  // A continuation stops at the anchor's createdAt (included).
  const workspaceRange = (workspace, upperCreatedAt) => (upperCreatedAt === undefined
    ? IDBKeyRange.bound([workspace], [`${workspace}\u0000`], false, true)
    : IDBKeyRange.bound([workspace], [workspace, upperCreatedAt]));
  function readPage({ workspace, limit, cursor }) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer: ${limit}`);
    const anchor = decodePageCursor(cursor, workspace);
    const transaction = db.transaction('discoveries', 'readonly');
    const index = transaction.objectStore('discoveries').index('byWorkspaceCreated');
    const items = [], anchors = [];
    return new Promise((resolve, reject) => {
      const failed = error => reject(error ?? new Error('the read was aborted'));
      transaction.onabort = () => failed(transaction.error);
      // Index entries with equal keys are ordered by primary key (id), so 'prev' visits createdAt
      // then id, both descending. Entries at the anchor's createdAt up to the anchor are skipped.
      // The next anchor is the row's own keys (position.key, position.primaryKey), never its fields.
      const request = index.openCursor(workspaceRange(workspace, anchor?.createdAt), 'prev');
      request.onerror = () => failed(request.error);
      request.onsuccess = () => {
        try {
          const position = request.result;
          if (!position) { resolve(); return; }
          if (afterAnchor(anchor, position.key[1], position.primaryKey, compare)) {
            items.push(position.value);
            anchors.push({ createdAt: position.key[1], id: position.primaryKey });
            if (items.length > limit) { resolve(); return; }
          }
          position.continue();
        } catch (error) { failed(error); }
      };
    }).then(() => ({ items: items.slice(0, limit), nextCursor: items.length > limit ? encodePageCursor(workspace, anchors[limit - 1]) : null }));
  }
  const getFrom = (store, key) => done(db.transaction(store, 'readonly').objectStore(store).get(key)).then(value => value ?? null);
  return Object.freeze({
    // Newest first, by `createdAt`, within one workspace.
    listDiscoveries({ workspace, limit = 50, cursor = null, signal }) { return cancellable(() => readPage({ workspace, limit, cursor }), signal); },
    countDiscoveries({ workspace, signal }) {
      return cancellable(() => done(db.transaction('discoveries', 'readonly').objectStore('discoveries').index('byWorkspaceCreated').count(workspaceRange(workspace))), signal);
    },
    getDiscovery(id, { signal } = {}) { return cancellable(() => getFrom('discoveries', id), signal); },
    getWriteMarker(writeId, { signal } = {}) { return cancellable(() => getFrom('writes', writeId), signal); },
    // One transaction for the whole batch → { status: 'committed' } only on its `complete` event,
    // else { status: 'aborted' (cancelled before commit) | 'failed', reason }. A cancellation that
    // arrives after commit leaves the commit standing.
    commit({ puts = [], deletes = [] }, { signal } = {}) {
      return new Promise(resolve => {
        if (signal?.aborted) { resolve({ status: 'aborted', reason: 'cancelled before the transaction started' }); return; }
        const names = [...new Set([...puts, ...deletes].map(operation => operation.store))];
        let transaction, cancelled = false, failure = null;
        try { transaction = db.transaction(names, 'readwrite'); }
        catch (error) { resolve({ status: 'failed', reason: error.name || error.message }); return; }
        const onAbortSignal = () => { cancelled = true; try { transaction.abort(); } catch { /* already finished: its own outcome stands */ } };
        signal?.addEventListener('abort', onAbortSignal, { once: true });
        transaction.oncomplete = () => { signal?.removeEventListener('abort', onAbortSignal); resolve({ status: 'committed' }); };
        transaction.onabort = () => {
          signal?.removeEventListener('abort', onAbortSignal);
          if (failure) resolve({ status: 'failed', reason: failure });
          else resolve(cancelled ? { status: 'aborted', reason: 'cancelled before commit' } : { status: 'failed', reason: transaction.error?.name || 'the transaction was aborted' });
        };
        try {
          for (const { store, value } of puts) transaction.objectStore(store).put(value);
          for (const { store, key } of deletes) transaction.objectStore(store).delete(key);
        } catch (error) {
          // A request the store refuses (e.g. a value without its key) fails the whole batch: the
          // transaction is aborted and the outcome is reported by its `abort` event.
          failure = error.name || error.message;
          try { transaction.abort(); }
          catch { signal?.removeEventListener('abort', onAbortSignal); resolve({ status: 'failed', reason: failure }); }
        }
      });
    },
    close() { db.close(); },
  });
}
