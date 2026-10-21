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
    let settled = false, request;
    const fail = (code, message) => { if (!settled) { settled = true; clearTimeout(timer); reject(new PersistenceError(code, message)); } };
    const timer = setTimeout(() => fail('timed-out', `Opening browser storage took longer than ${timeoutMs} ms.`), timeoutMs);
    try { request = indexedDB.open(databaseName, version); }
    catch (error) { fail('unavailable', error.message); return; }
    request.onupgradeneeded = () => {
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
      if (settled) { db.close(); return; }
      settled = true; clearTimeout(timer);
      db.onversionchange = () => db.close();
      resolve(createStore(db));
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

function pageStart(cursor) {
  if (cursor === null || cursor === undefined) return 0;
  if (typeof cursor !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(cursor)) throw new RangeError(`not a cursor of this store: ${cursor}`);
  return Number(cursor);
}

function createStore(db) {
  const workspaceRange = workspace => IDBKeyRange.bound([workspace, ''], [workspace, '￿']);
  async function readPage({ workspace, limit, cursor }) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer: ${limit}`);
    const skip = pageStart(cursor);
    const index = db.transaction('discoveries', 'readonly').objectStore('discoveries').index('byWorkspaceCreated');
    const items = [];
    await new Promise((resolve, reject) => {
      const request = index.openCursor(workspaceRange(workspace), 'prev');
      let advanced = skip === 0;
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const position = request.result;
        if (!position) { resolve(); return; }
        if (!advanced) { advanced = true; position.advance(skip); return; }
        items.push(position.value);
        if (items.length > limit) { resolve(); return; }
        position.continue();
      };
    });
    return { items: items.slice(0, limit), nextCursor: items.length > limit ? String(skip + limit) : null };
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
