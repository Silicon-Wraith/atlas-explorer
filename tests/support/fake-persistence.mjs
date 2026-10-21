// A controlled PersistenceStore for Node tests (the production one is IndexedDB,
// src/shared/persistence.js). Commits can be held, released, aborted or failed, and reads can
// be delayed, so tests can order them around pending writes. Signals are honoured.
import { encodePageCursor, decodePageCursor, afterAnchor, compareKeys } from '../../src/shared/persistence.js';

const aborted = signal => { if (signal?.aborted) { const error = new Error('The read was cancelled.'); error.name = 'AbortError'; throw error; } };

export function createFakePersistence() {
  const stores = { discoveries: new Map(), reports: new Map(), writes: new Map() };
  const held = [];
  const keyOf = (store, value) => store === 'reports' ? value.reportId : store === 'writes' ? value.writeId : value.id;
  const fake = {
    stores, held, holdCommits: false, listDelay: null, getDelay: null, failNext: null, listCalls: [],
    async listDiscoveries({ workspace, limit, cursor, signal }) {
      fake.listCalls.push({ workspace, cursor });
      if (fake.listDelay) await fake.listDelay(workspace, fake.listCalls.length);
      aborted(signal);
      // The production store's order and cursors (T10 fix rounds 1-2): only rows the
      // byWorkspaceCreated index holds (createdAt a valid key), in IndexedDB key order — createdAt,
      // then the primary key id, both descending — and an opaque cursor anchored on the last row's
      // keys, whether or not that row is a valid discovery; never an offset.
      if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer: ${limit}`);
      const anchor = decodePageCursor(cursor, workspace);
      const indexed = record => { try { compareKeys(record.createdAt, record.createdAt); return true; } catch { return false; } };
      const after = [...stores.discoveries.entries()]
        .filter(([, record]) => record.workspace === workspace && indexed(record))
        .map(([id, record]) => ({ id, createdAt: record.createdAt, record }))
        .filter(row => afterAnchor(anchor, row.createdAt, row.id))
        .sort((a, b) => compareKeys(b.createdAt, a.createdAt) || compareKeys(b.id, a.id));
      const items = after.slice(0, limit).map(row => row.record);
      return { items, nextCursor: after.length > limit ? encodePageCursor(workspace, after[limit - 1]) : null };
    },
    async countDiscoveries({ workspace, signal }) {
      aborted(signal);
      return [...stores.discoveries.values()].filter(record => { if (record.workspace !== workspace) return false; try { compareKeys(record.createdAt, record.createdAt); return true; } catch { return false; } }).length;
    },
    async getDiscovery(id, { signal } = {}) {
      if (fake.getDelay) await fake.getDelay(id);
      aborted(signal);
      return stores.discoveries.get(id) ?? null;
    },
    async getWriteMarker(writeId, { signal } = {}) {
      aborted(signal);
      return stores.writes.get(writeId) ?? null;
    },
    commit({ puts = [], deletes = [] }, { signal } = {}) {
      return new Promise(resolve => {
        const apply = () => {
          if (fake.failNext) { const reason = fake.failNext; fake.failNext = null; resolve({ status: 'failed', reason }); return; }
          if (signal?.aborted) { resolve({ status: 'aborted', reason: 'aborted before commit' }); return; }
          try {
            // Stage the batch so a refused request rolls back earlier puts/deletes, just as
            // IndexedDB aborts the whole transaction. Keep the exposed Map identities stable.
            const staged = Object.fromEntries(Object.entries(stores).map(([name, rows]) => [name, new Map(rows)]));
            for (const { store, value } of puts) {
              const key = keyOf(store, value); compareKeys(key, key);
              staged[store].set(key, value);
            }
            for (const { store, key } of deletes) { compareKeys(key, key); staged[store].delete(key); }
            for (const [name, rows] of Object.entries(staged)) {
              stores[name].clear();
              for (const [key, value] of rows) stores[name].set(key, value);
            }
          } catch (error) { resolve({ status: 'failed', reason: error.message }); return; }
          resolve({ status: 'committed' });
        };
        if (fake.holdCommits) held.push(apply); else queueMicrotask(apply);
      });
    },
    releaseCommit() { held.shift()(); },
    close() {},
  };
  return fake;
}
