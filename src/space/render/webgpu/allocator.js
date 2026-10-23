// The tracked allocator (spec §8.3, §9.1 "Allocator"; plan B06). Pure over an injected resource
// factory — `factory.create(description) → native` and `factory.destroy(native)` — so Node tests
// exercise it without a GPU. Every application-owned resource passes through here: the cap is
// checked before the factory is asked for anything; a released resource stays tracked ("retiring")
// until every ticket, mapping and retaining owner has ended. Eligible idle textures then remain
// tracked as "pooled" until eviction/destruction. Peak includes that pool for the allocator's
// lifetime. Handles are frozen opaque tokens `{id, epoch}`; native objects never leave.
import { isPlainObject } from '../../../shared/scene.js';
import { BackendError, TRACKED_ALLOCATION_CAP } from '../backend.js';

const invalid = message => { throw new BackendError('invalid-descriptor', message); };
const positive = (value, label) => { if (!Number.isSafeInteger(value) || value < 1) invalid(`${label} must be a positive safe integer`); return value; };
const DESCRIPTION_KEYS = ['name', 'bytes', 'usage', 'width', 'height', 'format', 'bytesPerTexel', 'bytesPerRow', 'data'];
// Inventory reports actual dimensions; bytesPerTexel and initial data stay out of it.
const INVENTORY_KEYS = ['width', 'height', 'usage', 'format', 'bytesPerRow'];
const HOLD_KINDS = { ticket: 'tickets', mapping: 'mappings' };
const IDLE_POOL_BYTES = 256 * 2**20;
const IDLE_POOL_ENTRIES = 44;

function describe(desc) {
  if (!isPlainObject(desc)) invalid('allocation description must be a plain object');
  const unknown = Object.keys(desc).filter(key => !DESCRIPTION_KEYS.includes(key));
  if (unknown.length) invalid(`unknown allocation fields ${unknown.join(', ')}`);
  if (typeof desc.name !== 'string' || !desc.name.trim()) invalid('allocation name must be a non-empty string');
  positive(desc.bytes, 'allocation bytes');
  for (const key of ['width', 'height', 'bytesPerTexel', 'bytesPerRow']) if (desc[key] !== undefined) positive(desc[key], key);
  if ((desc.width === undefined) !== (desc.height === undefined)) invalid('width and height are given together');
  for (const key of ['usage', 'format']) if (desc[key] !== undefined && (typeof desc[key] !== 'string' || !desc[key])) invalid(`${key} must be a non-empty string`);
  if (desc.bytesPerTexel !== undefined && desc.width !== undefined && desc.width * desc.height * desc.bytesPerTexel > desc.bytes) invalid('allocation smaller than its declared image');
  if (desc.data !== undefined && (!(desc.data instanceof Uint8Array) || desc.data.byteLength > desc.bytes)) invalid('initial data must be a Uint8Array no longer than bytes');
  const { data, ...description } = desc;
  return { description: Object.freeze(description), data };
}

export function createTrackedAllocator({ factory, cap = TRACKED_ALLOCATION_CAP, clock, epoch = 1 } = {}) {
  if (typeof factory?.create !== 'function' || typeof factory?.destroy !== 'function') throw new TypeError('createTrackedAllocator requires factory.create and factory.destroy');
  const now = typeof clock === 'function' ? clock : clock?.now?.bind(clock);
  if (typeof now !== 'function') throw new TypeError('createTrackedAllocator requires an injected clock');
  if (!Number.isSafeInteger(cap) || cap < 0) throw new TypeError('cap must be a non-negative safe integer');
  let currentEpoch = epoch, tracked = 0, peak = 0, next = 0, failNext = false, idleBytes = 0;
  const resources = new Map(), issued = new WeakSet(), holders = new Map();
  const pooled = new Set(), poolIndex = new Map(); // idle textures remain tracked; Set preserves eviction order
  const poolKey = (description, group) => group ? JSON.stringify([group, description]) : null;
  function addIdle(entry) {
    if (pooled.has(entry)) return;
    pooled.add(entry); idleBytes += entry.description.bytes;
    if (!poolIndex.has(entry.poolKey)) poolIndex.set(entry.poolKey, new Set());
    poolIndex.get(entry.poolKey).add(entry);
  }
  function removeIdle(entry) {
    if (!pooled.delete(entry)) return;
    idleBytes -= entry.description.bytes;
    const bucket = poolIndex.get(entry.poolKey);
    bucket.delete(entry);
    if (!bucket.size) poolIndex.delete(entry.poolKey);
  }
  function evict(entry) {
    removeIdle(entry); resources.delete(entry.handle); tracked -= entry.description.bytes; destroyNative(entry.native);
  }

  function reserve(bytes) {
    for (const entry of pooled) { if (tracked + bytes <= cap) break; evict(entry); }
    if (tracked + bytes > cap) throw new BackendError('allocation-failed', `tracked allocation cap exceeded (${tracked} + ${bytes} > ${cap} bytes)`);
    if (failNext) { failNext = false; throw new BackendError('allocation-failed', 'injected allocation failure'); }
  }
  function create({ description, data }) {
    try { return factory.create(data === undefined ? description : { ...description, data }); }
    catch (error) { throw new BackendError('allocation-failed', `${description.name}: ${error?.message ?? error}`); }
  }
  function record(description, native, key = null, group = null) {
    const handle = Object.freeze({ id: `space-resource-${++next}`, epoch: currentEpoch });
    issued.add(handle);
    resources.set(handle, { handle, epoch: currentEpoch, description, native, poolKey: key, poolGroup: group, retiring: false, tickets: new Set(), mappings: new Set(), owners: new Set(), allocatedAt: now() });
    tracked += description.bytes; peak = Math.max(peak, tracked);
    return handle;
  }
  function destroyNative(native) { try { factory.destroy(native); } catch { /* a lost device may refuse; nothing else holds it */ } }
  function reclaim(entry) {
    if (!entry.retiring || entry.tickets.size || entry.mappings.size || entry.owners.size || !resources.has(entry.handle)) return;
    if (entry.poolKey && !entry.failure) {
      addIdle(entry);
      // Bound residency on release, even when there is no subsequent allocation pressure.
      while (pooled.size > IDLE_POOL_ENTRIES || idleBytes > IDLE_POOL_BYTES) evict(pooled.values().next().value);
    } else evict(entry);
  }
  function lookup(handle, { allowRetiring = false } = {}) {
    const entry = resources.get(handle);
    if (!entry || entry.epoch !== currentEpoch || (!allowRetiring && entry.retiring)) invalid('resource is foreign, retired or released');
    return entry;
  }
  return Object.freeze({
    // One resource: validated, cap-checked and only then created.
    allocate(desc) {
      const parsed = describe(desc);
      reserve(parsed.description.bytes);
      return record(parsed.description, create(parsed));
    },
    // Several resources as one reservation: the sum is checked first; any creation failure destroys
    // what was created and restores current tracking, while peak keeps the temporary pressure.
    transaction(descs, { pool = null } = {}) {
      if (!Array.isArray(descs) || !descs.length) invalid('a transaction needs at least one description');
      const parsed = descs.map(describe);
      const keys = parsed.map(item => poolKey(item.description, pool));
      // Take each candidate immediately: duplicate descriptions need distinct natives.
      // Key construction and lookup scale with requests, independently of idle pool size.
      const reused = keys.map(key => {
        const entry = poolIndex.get(key)?.values().next().value;
        if (entry) removeIdle(entry);
        return entry;
      });
      try { reserve(parsed.reduce((sum, item, index) => sum + (reused[index] ? 0 : item.description.bytes), 0)); }
      catch (error) { reused.forEach(entry => { if (entry) addIdle(entry); }); throw error; }
      // Each created resource counts toward the lifetime peak at once; a rollback restores current
      // tracking but never erases the evidence of that temporary pressure.
      const natives = [];
      let created = 0;
      try { for (const [index, item] of parsed.entries()) {
        natives.push(reused[index]?.native ?? create(item));
        if (!reused[index]) created += item.description.bytes;
        peak = Math.max(peak, tracked + created);
      } }
      catch (error) {
        natives.forEach((native, index) => { if (!reused[index]) destroyNative(native); });
        reused.forEach(entry => { if (entry) addIdle(entry); }); throw error;
      }
      return Object.freeze(parsed.map((item, index) => {
        const old = reused[index];
        if (old) { resources.delete(old.handle); tracked -= old.description.bytes; }
        return record(item.description, natives[index], keys[index], pool);
      }));
    },
    // Called only after successful configuration. Invalidate obsolete live entries as well:
    // they stay held, but their eventual release must not repopulate the old output-size key.
    activatePool(pool) {
      for (const entry of resources.values()) if (entry.poolKey && entry.poolGroup !== pool) {
        if (pooled.has(entry)) evict(entry);
        entry.poolKey = null;
      }
    },
    canReuse(descs, pool) {
      const needed = new Map();
      return descs.every(desc => {
        const key = poolKey(describe(desc).description, pool), count = (needed.get(key) ?? 0) + 1;
        needed.set(key, count);
        return (poolIndex.get(key)?.size ?? 0) >= count;
      });
    },
    release(handle, { discard = false } = {}) {
      if (!issued.has(handle)) invalid('unknown resource handle');
      const entry = resources.get(handle); if (!entry) return;
      if (discard) { removeIdle(entry); entry.poolKey = null; }
      entry.retiring = true; reclaim(entry);
    },
    retain(handle, owner) {
      if (typeof owner !== 'string' || !owner) invalid('owner must be a non-empty string');
      lookup(handle).owners.add(owner);
    },
    retire(owner) { for (const entry of resources.values()) { entry.owners.delete(owner); reclaim(entry); } },
    // Outstanding work: a ticket or a mapping token keeps every resource it holds alive.
    hold(handle, token, kind) {
      if (!Object.hasOwn(HOLD_KINDS, kind)) throw new RangeError(`hold kind must be ticket or mapping, not ${kind}`);
      const entry = lookup(handle);
      entry[HOLD_KINDS[kind]].add(token);
      if (!holders.has(token)) holders.set(token, new Set());
      holders.get(token).add(entry);
    },
    unhold(token) {
      const entries = holders.get(token); if (!entries) return;
      holders.delete(token);
      for (const entry of entries) { entry.tickets.delete(token); entry.mappings.delete(token); reclaim(entry); }
    },
    lookup,
    // An asynchronous creation failure (a captured error scope) is recorded on the resource and
    // reported by diagnostics; the backend fails every ticket that consumes it.
    markFailed(handle, message) { const entry = resources.get(handle); if (entry && entry.failure === undefined) entry.failure = String(message); },
    failNextAllocation() { failNext = true; },
    // Loss or teardown: every native resource is destroyed and tracking returns to zero; peak persists.
    destroyAll() {
      for (const entry of resources.values()) destroyNative(entry.native);
      resources.clear(); holders.clear(); pooled.clear(); poolIndex.clear(); tracked = 0; idleBytes = 0;
    },
    setEpoch(value) {
      if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('epoch must be a positive integer');
      if (resources.size) throw new Error('setEpoch requires an empty allocator (destroyAll first)');
      currentEpoch = value;
    },
    diagnostics() {
      let retiring = 0;
      const inventory = [...resources.values()].map(entry => {
        if (entry.retiring && !pooled.has(entry)) retiring += entry.description.bytes;
        const extra = Object.fromEntries(INVENTORY_KEYS.filter(key => entry.description[key] !== undefined).map(key => [key, entry.description[key]]));
        return Object.freeze({ id: entry.handle.id, epoch: entry.epoch, name: entry.description.name, bytes: entry.description.bytes, ...extra,
          state: pooled.has(entry) ? 'pooled' : entry.retiring ? 'retiring' : 'live', tickets: entry.tickets.size, mappings: entry.mappings.size, owners: entry.owners.size, allocatedAt: entry.allocatedAt,
          ...(entry.failure === undefined ? {} : { failure: entry.failure }) });
      });
      return Object.freeze({ tracked, peak, retiring, inventory: Object.freeze(inventory) });
    },
  });
}
