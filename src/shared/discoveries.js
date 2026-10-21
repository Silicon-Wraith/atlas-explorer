// Discoveries (spec §13.10): the record, the DiscoverySource contract, the local source,
// and the headless controller behind the Discoveries control. Records from any source are
// data: they are validated before they are shown or opened.
import { deepFreeze, isPlainObject, requireObject, SceneError } from './scene.js';

export const DISCOVERY_SCHEMA = 'atlas.discovery';
export const DISCOVERY_SCHEMA_VERSION = 1;
export const THUMBNAIL_TYPES = Object.freeze(['image/jpeg', 'image/png']);
const KEYS = ['schema', 'schemaVersion', 'id', 'workspace', 'name', 'note', 'createdAt', 'sceneSnapshot', 'sceneHash', 'thumbnail'];

const text = (value, path, max) => {
  if (typeof value !== 'string' || value.length > max) throw new SceneError('invalid-value', `must be a string of at most ${max} characters`, path);
  return value;
};

export function validateDiscovery(input, sceneCodec) {
  if (!isPlainObject(input)) throw new SceneError('invalid-value', 'a discovery must be an object');
  if (input.schema !== DISCOVERY_SCHEMA || input.schemaVersion !== DISCOVERY_SCHEMA_VERSION) throw new SceneError('unsupported-version', 'not a supported discovery record');
  for (const key of Object.keys(input)) if (!KEYS.includes(key) && key !== 'card') throw new SceneError('unknown-field', `unknown field ${key}`);
  for (const key of KEYS) if (!(key in input)) throw new SceneError('missing-field', `missing field ${key}`);
  if (!text(input.id, 'id', 128)) throw new SceneError('invalid-value', 'must not be empty', 'id');
  if (!text(input.name, 'name', 200).trim()) throw new SceneError('invalid-value', 'must not be empty', 'name');
  text(input.note, 'note', 5000);
  // Fixed-width UTC timestamps preserve chronological order in string indexes.
  if (typeof input.createdAt !== 'string' || input.createdAt.length !== 24 || Number.isNaN(Date.parse(input.createdAt)) || new Date(input.createdAt).toISOString() !== input.createdAt) throw new SceneError('invalid-value', 'must be a canonical UTC ISO date with a four-digit year', 'createdAt');
  const scene = sceneCodec.validate(input.sceneSnapshot);
  if (input.workspace !== scene.workspace) throw new SceneError('invalid-value', 'must equal the scene workspace', 'workspace');
  const { sceneHash } = sceneCodec.fingerprint(scene);
  if (input.sceneHash !== sceneHash) throw new SceneError('hash-mismatch', 'sceneHash does not match the scene', 'sceneHash');
  const thumbnail = requireObject(input.thumbnail, 'thumbnail', ['sourceSceneHash', 'sourceReportId', 'mediaType', 'blob']);
  if (thumbnail.sourceSceneHash !== sceneHash) throw new SceneError('stale-thumbnail', 'the thumbnail shows a different scene', 'thumbnail.sourceSceneHash');
  if (!text(thumbnail.sourceReportId, 'thumbnail.sourceReportId', 200).trim()) throw new SceneError('invalid-value', 'must not be empty', 'thumbnail.sourceReportId');
  if (!THUMBNAIL_TYPES.includes(thumbnail.mediaType)) throw new SceneError('invalid-value', `must be one of ${THUMBNAIL_TYPES.join(', ')}`, 'thumbnail.mediaType');
  if (!(thumbnail.blob instanceof Blob) || thumbnail.blob.size === 0) throw new SceneError('invalid-value', 'must be a non-empty Blob', 'thumbnail.blob');
  if (thumbnail.blob.type && thumbnail.blob.type !== thumbnail.mediaType) throw new SceneError('invalid-value', 'must match mediaType when specified', 'thumbnail.blob.type');
  const record = {
    schema: DISCOVERY_SCHEMA, schemaVersion: DISCOVERY_SCHEMA_VERSION, id: input.id, workspace: scene.workspace,
    name: input.name, note: input.note, createdAt: input.createdAt, sceneSnapshot: scene, sceneHash,
    thumbnail: { sourceSceneHash: sceneHash, sourceReportId: thumbnail.sourceReportId, mediaType: thumbnail.mediaType, blob: thumbnail.blob },
  };
  if ('card' in input) {
    if (scene.workspace !== 'space') throw new SceneError('invalid-value', 'only Space discoveries carry a card', 'card');
    const card = input.card;
    if (!isPlainObject(card) || Object.keys(card).sort().join() !== 'inspection,reportId,selectedPoint') throw new SceneError('invalid-value', 'must hold selectedPoint, inspection and reportId', 'card');
    record.card = structuredClone(card);
  }
  for (const key of ['sceneSnapshot', 'thumbnail']) Object.freeze(record[key]);
  return Object.freeze(record.card ? { ...record, card: deepFreeze(record.card) } : record);
}

export function createDiscoveryRecord({ scene, name, note = '', thumbnail, id, createdAt, sceneCodec }) {
  const { sceneHash } = sceneCodec.fingerprint(scene);
  return validateDiscovery({
    schema: DISCOVERY_SCHEMA, schemaVersion: DISCOVERY_SCHEMA_VERSION, id, workspace: scene.workspace, name, note, createdAt,
    sceneSnapshot: scene, sceneHash, thumbnail: { ...thumbnail, sourceSceneHash: sceneHash },
  }, sceneCodec);
}

// The local source over a PersistenceStore (shared/persistence.js, or a test fake). Every write
// commits, in the same transaction as the change, a write marker named by its `writeId`, so the
// outcome of that specific write can be confirmed later — never inferred from a matching record.
// Delivers a change to every listener; one listener's failure never stops the others and never
// changes the outcome of the write that caused it. Failures go to `onListenerError`.
export function deliver(listeners, change, onListenerError) {
  for (const listener of [...listeners]) {
    try { listener(change); } catch (error) { try { onListenerError(error, change); } catch { /* never escalate */ } }
  }
}
const reportListenerError = error => console.error('A discoveries listener failed:', error);

export function createLocalDiscoverySource({ store, sceneCodec, onListenerError = reportListenerError }) {
  const listeners = new Set();
  const notify = change => deliver(listeners, change, onListenerError);
  const entry = raw => {
    try { return { id: raw?.id, record: validateDiscovery(raw, sceneCodec) }; }
    catch (error) { return { id: typeof raw?.id === 'string' ? raw.id : '(unknown)', unsupported: error.message }; }
  };
  const marker = (writeId, op, id) => ({ store: 'writes', value: { writeId, op, id } });
  return Object.freeze({
    id: 'local', label: 'This browser', capabilities: Object.freeze({ save: true, remove: true, confirm: true }),
    async list({ workspace, limit = 50, cursor = null, signal }) {
      const page = await store.listDiscoveries({ workspace, limit, cursor, signal });
      const total = await store.countDiscoveries({ workspace, signal });
      return { items: page.items.map(entry), nextCursor: page.nextCursor, total };
    },
    async get(id, { signal } = {}) {
      const raw = await store.getDiscovery(id, { signal });
      return raw === null ? null : entry(raw);
    },
    async save(record, { signal, report, writeId }) {
      if (typeof writeId !== 'string' || !writeId) throw new SceneError('invalid-value', 'a save needs a writeId');
      const valid = validateDiscovery(record, sceneCodec);
      const puts = [{ store: 'discoveries', value: valid }, marker(writeId, 'save', valid.id)];
      if (report) {
        if (report.reportId !== valid.thumbnail.sourceReportId) throw new SceneError('invalid-value', 'the report is not the thumbnail\'s source report');
        if (report.sceneHash !== valid.sceneHash || report.outcome !== 'completed') throw new SceneError('invalid-value', 'the thumbnail\'s report must describe this scene\'s completed publication');
        puts.push({ store: 'reports', value: report });
      }
      const result = await store.commit({ puts, deletes: [] }, { signal });
      if (result.status === 'committed') notify({ type: 'saved', id: valid.id, workspace: valid.workspace });
      return result;
    },
    async remove(id, { signal, writeId }) {
      if (typeof writeId !== 'string' || !writeId) throw new SceneError('invalid-value', 'a removal needs a writeId');
      const result = await store.commit({ puts: [marker(writeId, 'remove', id)], deletes: [{ store: 'discoveries', key: id }] }, { signal });
      if (result.status === 'committed') notify({ type: 'removed', id });
      return result;
    },
    // true only if this specific write committed.
    async confirm(writeId, { signal } = {}) {
      // (reads only the marker this write committed)
      return (await store.getWriteMarker(writeId, { signal })) !== null;
    },
    // Optional DiscoverySource operation: atomically forget only the supplied write markers,
    // without notifying discovery listeners. Same result and abort-before-commit contract as
    // save/remove; rejection or a non-committed result leaves the batch intact. Callers own
    // eligibility (definite delivery and finished readers), never the persistence store.
    async prune(writeIds, { signal } = {}) {
      if (!writeIds.length) return { status: 'committed' };
      return store.commit({ puts: [], deletes: writeIds.map(key => ({ store: 'writes', key })) }, { signal });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
}

class Deadline extends Error { constructor() { super('timed out'); this.name = 'Deadline'; } }
function race(promise, ms, controller) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Deadline()); }, ms); })]).finally(() => clearTimeout(timer));
}
const DEFINITE = ['committed', 'aborted', 'failed'];
let writeCounter = 0;
const newWriteId = () => `write-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++writeCounter}`}`;

// The Discoveries control's state, without any DOM. Every read is bounded and carries a
// request identity: a refresh invalidates the source's earlier list and paging reads, and only
// the current request may publish. Every record shown or opened is validated here, whatever
// source supplied it. Writes are observed until their source reports a definite outcome.
export function createDiscoveriesController({ sources, sceneCodec, readTimeoutMs = 5000, writeWaitMs = 5000, reconcileAttempts = 3, onListenerError = reportListenerError }) {
  if (!sceneCodec) throw new TypeError('createDiscoveriesController requires sceneCodec');
  const listeners = new Set();
  let workspace = null, destroyed = false, openToken = 0;
  // This lifetime belongs to observation, never to an admitted persistence write.
  const lifetime = new AbortController();
  const views = Object.fromEntries(sources.map(source => [source.id, { status: 'idle', reason: '', items: [], nextCursor: null, total: null, generation: 0, pages: new Map(), reads: new Set() }]));
  const abortReads = view => { for (const controller of view.reads) controller.abort(); view.reads.clear(); view.pages.clear(); };
  const opens = new Set();
  const abortOpens = () => { for (const controller of opens) controller.abort(); opens.clear(); };
  const writes = new Map(), controllers = new Map();
  // History and marker lifetimes are independent. A reader can outlive history eviction;
  // its closure retains this private state until the source promise really settles.
  const writeStates = new WeakMap(), deliveredHistory = new Set();
  const bySource = Object.fromEntries(sources.map(source => [source.id, source]));
  const unsubscribe = sources.map(source => source.subscribe?.(() => { if (!destroyed && workspace) refresh(); }));

  const makeSnapshot = () => Object.freeze({
    workspace,
    sources: Object.freeze(Object.fromEntries(sources.map(source => {
      const { generation, pages, reads, ...view } = views[source.id];
      return [source.id, Object.freeze({ label: source.label, ...view })];
    }))),
    writes: Object.freeze([...writes.values()].map(write => Object.freeze({ ...write }))),
  });
  const snapshot = () => {
    const value = makeSnapshot();
    value.writes.forEach(noteDelivery);
    return value;
  };
  const emit = () => {
    if (destroyed) return;
    const value = makeSnapshot(), observed = listeners.size > 0;
    deliver(listeners, value, onListenerError);
    if (observed) value.writes.forEach(noteDelivery);
  };

  // A public result/snapshot or subscriber notification delivers the immutable observation.
  // Defer maintenance to the next task so all promise continuations and synchronous listeners
  // can receive it first. The timer is a delivery boundary, never an age/expiry policy.
  function noteDelivery(observation) {
    if (destroyed || !DEFINITE.includes(observation.status)) return;
    const write = writes.get(observation.writeId), state = write && writeStates.get(write);
    if (!state || state.delivered || state.deliveryPending) return;
    state.deliveryPending = true;
    schedulePruning(state);
  }

  function schedulePruning(state) {
    if (destroyed || state.scheduled || (!state.delivered && !state.deliveryPending)) return;
    state.scheduled = true;
    setTimeout(() => {
      state.scheduled = false;
      if (destroyed) return;
      const { write } = state;
      if (state.deliveryPending) {
        state.deliveryPending = false;
        state.delivered = true;
        deliveredHistory.add(write);
        if (deliveredHistory.size > 100) {
          const oldest = deliveredHistory.values().next().value;
          deliveredHistory.delete(oldest);
          writes.delete(oldest.writeId);
          emit();
        }
      }
      const source = bySource[write.sourceId];
      if (state.readers || state.observers || state.cleanupStarted || typeof source.prune !== 'function') return;
      state.cleanupStarted = true;
      // Cleanup has its own cancellation, independent of the write and observation lifetime.
      // No retry, outcome rewrite, or claim of deletion on failure (including a non-definite
      // reply). Atomicity/cancellation before commit belong to the source's prune contract.
      const controller = new AbortController();
      race(Promise.resolve().then(() => {
        // An eviction notification can synchronously destroy the controller.
        if (!destroyed) return source.prune([write.writeId], { signal: controller.signal });
      }), readTimeoutMs, controller).catch(() => {});
    }, 0);
  }

  function writeResult(write) {
    const result = Object.freeze({ ...write });
    noteDelivery(result);
    return result;
  }

  // Every item is validated here, whatever its source said about it.
  const checked = (source, item) => {
    const base = { id: item.id, sourceId: source.id, key: `${source.id}:${item.id}` };
    if (!item.record) return Object.freeze({ ...base, unsupported: item.unsupported || 'the source could not read this record' });
    if (item.record.id !== item.id) return Object.freeze({ ...base, unsupported: 'the record\'s id differs from the listed id' });
    try {
      const record = validateDiscovery({ ...item.record, thumbnail: { ...item.record.thumbnail } }, sceneCodec);
      if (record.workspace !== workspace) return Object.freeze({ ...base, unsupported: 'this record belongs to another workspace' });
      return Object.freeze({ ...base, record });
    } catch (error) { return Object.freeze({ ...base, unsupported: error.message }); }
  };

  // One read. A refresh (cursor null) starts a new generation and aborts the source's earlier
  // reads; a page read for a cursor already in flight is the same read, and a page is appended
  // only if it is still the next page of the current generation.
  function load(source, cursor) {
    const view = views[source.id];
    if (cursor && view.pages.has(cursor)) return view.pages.get(cursor);
    if (!cursor) { view.generation++; abortReads(view); }
    const myGeneration = view.generation, myWorkspace = workspace, controller = new AbortController();
    view.reads.add(controller);
    const current = () => !destroyed && view.generation === myGeneration && workspace === myWorkspace && (!cursor || view.nextCursor === cursor);
    Object.assign(view, { status: 'loading', reason: '' });
    emit();
    const read = (async () => {
      try {
        const page = await race(source.list({ workspace: myWorkspace, limit: 50, cursor, signal: controller.signal }), readTimeoutMs, controller);
        if (!current()) return 'discarded';
        const items = page.items.map(item => checked(source, item));
        Object.assign(view, { status: 'ready', reason: '', items: cursor ? [...view.items, ...items] : items, nextCursor: page.nextCursor, total: Number.isInteger(page.total) ? page.total : null });
      } catch (error) {
        if (!current()) return 'discarded';
        Object.assign(view, { status: 'unavailable', reason: error instanceof Deadline ? 'did not respond in time' : error.message });
      } finally {
        view.reads.delete(controller);
        if (cursor && view.pages.get(cursor) === read) view.pages.delete(cursor);
      }
      emit();
      return view.status;
    })();
    if (cursor) view.pages.set(cursor, read);
    return read;
  }

  function refresh() { return destroyed ? Promise.resolve(sources.map(() => 'discarded')) : Promise.all(sources.map(source => load(source, null))); }

  function settleWrite(write, status, reason = '') {
    const definite = DEFINITE.includes(status);
    if (write.status === 'pending' || write.status === 'checking' || (write.status === 'unknown' && definite)) {
      Object.assign(write, { status, reason });
      emit();
      // Ordinary commits refresh through source notifications. Marker confirmation below
      // also refreshes, since it can recover an outcome whose notification never arrived.
    }
  }

  // Stop timers and marker reads promptly even when their source ignores cancellation.
  // Resolves false on timeout or teardown; neither establishes a write's outcome.
  function waitForObservation(promise, ms, readController) {
    let timer, stop;
    const stopped = new Promise(resolve => {
      stop = () => { readController?.abort(); resolve(false); };
      if (lifetime.signal.aborted) stop();
      else {
        lifetime.signal.addEventListener('abort', stop, { once: true });
        timer = setTimeout(stop, ms);
      }
    });
    return Promise.race([promise, stopped]).finally(() => {
      clearTimeout(timer);
      lifetime.signal.removeEventListener('abort', stop);
    });
  }

  async function confirmWrite(write) {
    const source = bySource[write.sourceId];
    if (destroyed || typeof source.confirm !== 'function') return false;
    const controller = new AbortController();
    const state = writeStates.get(write);
    state.readers++;
    const reading = Promise.resolve().then(() => destroyed || controller.signal.aborted ? false : source.confirm(write.writeId, { signal: controller.signal })).finally(() => {
      state.readers--;
      schedulePruning(state);
    });
    try { return await waitForObservation(reading, readTimeoutMs, controller) === true; } catch { return false; }
  }

  async function observe(kind, source, id, operation) {
    const writeId = newWriteId(), controller = new AbortController();
    const write = { writeId, kind, sourceId: source.id, id, status: 'pending', reason: '' };
    const state = { write, readers: 0, observers: 1, delivered: false, deliveryPending: false, scheduled: false, cleanupStarted: false };
    writeStates.set(write, state);
    writes.set(writeId, write);
    controllers.set(writeId, controller);
    emit();
    // The source's definite outcome is authoritative whenever it arrives, even after `unknown`.
    const outcome = Promise.resolve().then(() => operation(writeId, controller.signal)).then(
      result => DEFINITE.includes(result?.status)
        ? settleWrite(write, result.status, result.reason || '')
        : settleWrite(write, 'unknown', 'the source did not report a definite write status; check again'),
      error => settleWrite(write, 'failed', error?.message ?? String(error)),
    ).finally(() => controllers.delete(writeId));
    const waited = await waitForObservation(outcome.then(() => true), writeWaitMs);
    if (!waited && !destroyed) {
      settleWrite(write, 'checking', 'the result is still being checked');
      for (let attempt = 0; attempt < reconcileAttempts && write.status === 'checking' && !destroyed; attempt++) {
        if (await confirmWrite(write)) {
          settleWrite(write, 'committed', 'confirmed by this write\'s marker');
          if (!destroyed && workspace) refresh();
        }
        if (write.status === 'checking' && !destroyed) await waitForObservation(outcome, readTimeoutMs);
      }
    }
    if (write.status === 'pending' || write.status === 'checking') settleWrite(write, 'unknown', destroyed ? 'the control was destroyed before the outcome was known' : 'the outcome is unknown; check again');
    state.observers--;
    schedulePruning(state);
    return writeResult(write);
  }

  function writeSource(sourceId, kind) {
    if (destroyed) throw new SceneError('destroyed', 'the discoveries control was destroyed');
    const source = bySource[sourceId];
    if (source?.capabilities?.[kind] !== true || typeof source[kind] !== 'function') throw new SceneError('unsupported', `this source does not support ${kind}`);
    return source;
  }

  return Object.freeze({
    snapshot,
    subscribe(listener) { if (destroyed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    // A workspace change invalidates every read and every pending open, and clears the old results.
    setWorkspace(next) {
      if (destroyed) return refresh();
      workspace = next; openToken++; abortOpens();
      for (const view of Object.values(views)) Object.assign(view, { items: [], nextCursor: null, total: null });
      return refresh();
    },
    refresh,
    nextPage(sourceId) { if (destroyed) return Promise.resolve('discarded'); const view = views[sourceId]; return view?.nextCursor ? load(bySource[sourceId], view.nextCursor) : Promise.resolve('none'); },
    // Requests an abort. The outcome still comes from the source: a committed write stays committed.
    cancelWrite(writeId) { if (!destroyed) controllers.get(writeId)?.abort(); },
    // The "check again" action for an unknown outcome; it never repeats the write.
    async reconcile(writeId) {
      const write = writes.get(writeId);
      if (destroyed) return write ? Object.freeze({ ...write }) : null;
      const state = write && writeStates.get(write);
      if (state) state.observers++;
      try {
        if (write && (write.status === 'unknown' || write.status === 'checking') && await confirmWrite(write)) settleWrite(write, 'committed', 'confirmed by this write\'s marker');
        await refresh();
        return write ? writeResult(write) : null;
      } finally {
        if (state) { state.observers--; schedulePruning(state); }
      }
    },
    // Only the latest open may resolve; an obsolete selection is rejected.
    async open(sourceId, id) {
      if (destroyed) throw new SceneError('superseded', 'the discoveries control was destroyed');
      const token = ++openToken, controller = new AbortController();
      abortOpens();
      opens.add(controller);
      let found;
      try { found = await race(bySource[sourceId].get(id, { signal: controller.signal }), readTimeoutMs, controller); }
      catch (error) { if (token !== openToken || destroyed) throw new SceneError('superseded', 'a newer selection or workspace replaced this one'); throw error; }
      finally { opens.delete(controller); }
      if (token !== openToken || destroyed) throw new SceneError('superseded', 'a newer selection or workspace replaced this one');
      if (!found) throw new SceneError('not-found', 'this discovery no longer exists');
      if (found.id !== id) throw new SceneError('unsupported', 'the source returned a different discovery');
      const item = checked(bySource[sourceId], found);
      if (!item.record) throw new SceneError('unsupported', `this discovery cannot be opened: ${item.unsupported}`);
      return item.record;
    },
    async save(sourceId, record, options = {}) {
      const source = writeSource(sourceId, 'save');
      return observe('save', source, record.id, (writeId, signal) => source.save(record, { ...options, writeId, signal }));
    },
    async remove(sourceId, id) {
      const source = writeSource(sourceId, 'remove');
      return observe('remove', source, id, (writeId, signal) => source.remove(id, { writeId, signal }));
    },
    destroy() { if (destroyed) return; destroyed = true; lifetime.abort(); openToken++; abortOpens(); for (const view of Object.values(views)) abortReads(view); listeners.clear(); unsubscribe.forEach(stop => stop?.()); },
  });
}
