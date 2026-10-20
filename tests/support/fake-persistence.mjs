// A controlled PersistenceStore for Node tests (the production one is IndexedDB,
// src/shared/persistence.js). Commits can be held, released, aborted or failed, and reads can
// be delayed, so tests can order them around pending writes. Signals are honoured.
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
      const all = [...stores.discoveries.values()].filter(record => record.workspace === workspace).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const start = cursor ? Number(cursor) : 0;
      return { items: all.slice(start, start + limit), nextCursor: start + limit < all.length ? String(start + limit) : null };
    },
    async countDiscoveries({ workspace, signal }) {
      aborted(signal);
      return [...stores.discoveries.values()].filter(record => record.workspace === workspace).length;
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
    commit(batch, { signal } = {}) {
      return new Promise(resolve => {
        const apply = () => {
          if (fake.failNext) { const reason = fake.failNext; fake.failNext = null; resolve({ status: 'failed', reason }); return; }
          if (signal?.aborted) { resolve({ status: 'aborted', reason: 'aborted before commit' }); return; }
          for (const { store, value } of batch.puts) stores[store].set(keyOf(store, value), value);
          for (const { store, key } of batch.deletes) stores[store].delete(key);
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
