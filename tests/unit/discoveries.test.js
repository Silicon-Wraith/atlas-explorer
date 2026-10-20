import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDiscovery, createDiscoveryRecord, createLocalDiscoverySource, createDiscoveriesController } from '../../src/shared/discoveries.js';
import { sceneCodec, createPlaneScene } from '../../src/plane/scene-adapter.js';
import { createFakePersistence } from '../support/fake-persistence.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));

const thumbnail = () => ({ sourceReportId: 'report-1', mediaType: 'image/jpeg', blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }) });
const record = (id, zoom = 1, { name = `Discovery ${id}`, createdAt = `2026-10-20T00:00:0${zoom}.000Z` } = {}) => createDiscoveryRecord({
  scene: createPlaneScene({ view: { re: '-0.5', im: '0', zoom } }), name, thumbnail: thumbnail(), id, createdAt, sceneCodec,
});
const plain = value => ({ ...value, thumbnail: { ...value.thumbnail } });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const setup = (options = {}) => {
  const store = createFakePersistence();
  const local = createLocalDiscoverySource({ store, sceneCodec });
  const controller = createDiscoveriesController({ sources: [local], sceneCodec, readTimeoutMs: 40, writeWaitMs: 30, reconcileAttempts: 2, ...options });
  return { store, local, controller };
};

test('a discovery record is validated whole, with honest scene and thumbnail provenance', () => {
  const valid = record('a');
  assert.ok(Object.isFrozen(valid));
  assert.ok(Object.isFrozen(valid.sceneSnapshot));
  assert.ok(Object.isFrozen(valid.sceneSnapshot.camera));
  assert.ok(Object.isFrozen(valid.sceneSnapshot.appearance));
  assert.ok(Object.isFrozen(valid.thumbnail));
  assert.match(valid.sceneHash, /^fnv1a64:/);
  assert.equal(valid.thumbnail.sourceSceneHash, valid.sceneHash);
  const code = input => { try { validateDiscovery(input, sceneCodec); return 'valid'; } catch (error) { return error.code; } };
  assert.equal(code(plain(valid)), 'valid');
  assert.equal(code({ ...plain(valid), sceneHash: 'fnv1a64:0000000000000000' }), 'hash-mismatch');
  assert.equal(code({ ...plain(valid), thumbnail: { ...valid.thumbnail, sourceSceneHash: 'fnv1a64:0000000000000000' } }), 'stale-thumbnail');
  assert.equal(code({ ...plain(valid), workspace: 'space' }), 'invalid-value');
  assert.equal(code({ ...plain(valid), card: { selectedPoint: null, inspection: null, reportId: 'r' } }), 'invalid-value', 'Plane discoveries carry no Space card');
  assert.equal(code({ ...plain(valid), thumbnail: { ...valid.thumbnail, blob: new Blob([]) } }), 'invalid-value');
  assert.equal(code({ ...plain(valid), extra: true }), 'unknown-field');
  assert.equal(code({ ...plain(valid), schemaVersion: 2 }), 'unsupported-version');
  assert.equal(code({ ...plain(valid), name: '  ' }), 'invalid-value');
  assert.equal(code({ ...plain(valid), thumbnail: { ...valid.thumbnail, mediaType: 'image/gif', blob: new Blob(['gif'], { type: 'image/gif' }) } }), 'invalid-value');
});

test('the local source saves record, report and write marker in one commit', async () => {
  const { store, local } = setup();
  const first = record('a', 1);
  const result = await local.save(first, { report: { reportId: 'report-1', sceneHash: first.sceneHash, outcome: 'completed' }, writeId: 'w1' });
  assert.deepEqual(result, { status: 'committed' });
  assert.ok(store.stores.reports.has('report-1'), 'the thumbnail\'s report is committed with the discovery');
  assert.deepEqual(store.stores.writes.get('w1'), { writeId: 'w1', op: 'save', id: 'a' });
  assert.equal(await local.confirm('w1'), true);
  assert.equal(await local.confirm('w2'), false);
  await local.save(record('b', 2), { writeId: 'w2' });
  const page = await local.list({ workspace: 'plane', limit: 10 });
  assert.deepEqual([page.items.map(item => item.id), page.total], [['b', 'a'], 2]);
  await assert.rejects(local.save(record('c', 3), { report: { reportId: 'other' }, writeId: 'w3' }), /source report/);
  await assert.rejects(local.save(record('c', 3), {}), /writeId/);
});

test('records from every source are validated by the controller; invalid ones are never opened', async () => {
  const { store, controller } = setup();
  store.stores.discoveries.set('bad', { id: 'bad', workspace: 'plane', createdAt: '2026-10-21T00:00:00.000Z', schema: 'atlas.discovery', schemaVersion: 1 });
  const forged = { ...plain(record('f')), sceneHash: 'fnv1a64:0000000000000000' };
  const lying = { id: 'lying', label: 'Lying source', capabilities: {}, list: async () => ({ items: [{ id: 'f', record: forged }], nextCursor: null, total: 1 }), get: async () => ({ id: 'f', record: forged }), subscribe: () => () => {} };
  const both = createDiscoveriesController({ sources: [createLocalDiscoverySource({ store, sceneCodec }), lying], sceneCodec, readTimeoutMs: 40 });
  await both.setWorkspace('plane');
  const { local, lying: other } = both.snapshot().sources;
  assert.match(local.items[0].unsupported, /missing field/);
  assert.equal(local.items[0].key, 'local:bad', 'records are identified by (sourceId, id)');
  assert.match(other.items[0].unsupported, /sceneHash/, 'a source\'s claim that a record is valid is not trusted');
  await assert.rejects(both.open('local', 'bad'), error => error.code === 'unsupported');
  await assert.rejects(both.open('lying', 'f'), error => error.code === 'unsupported');
  await controller.destroy();
});

test('write timeout then commit', async () => {
  const { store, controller } = setup();
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const saving = controller.save('local', record('a'));
  await wait(45);
  assert.equal(controller.snapshot().writes[0].status, 'checking', 'a timeout is not a failure');
  store.releaseCommit();
  assert.equal((await saving).status, 'committed');
  await flush();
  assert.deepEqual(controller.snapshot().sources.local.items.map(item => item.id), ['a']);
});

test('an absent record during a pending write is not proof of failure', async () => {
  const { store, controller } = setup();
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const final = await controller.save('local', record('a'));
  assert.equal(final.status, 'unknown', 'never failed merely because waiting ended');
  store.releaseCommit();
  await flush();
  assert.equal(controller.snapshot().writes[0].status, 'committed', 'a late definite outcome resolves an unknown observation');
});

test('an older record with the same scene never confirms a replacement that then fails', async () => {
  const { store, controller } = setup();
  await controller.setWorkspace('plane');
  await controller.save('local', record('a', 1, { name: 'Old name' }));
  store.holdCommits = true;
  const replacing = controller.save('local', record('a', 1, { name: 'New name' }));
  await wait(45);
  assert.equal(controller.snapshot().writes[1].status, 'checking', 'the old record with the same sceneHash confirms nothing');
  store.failNext = 'QuotaExceededError';
  store.releaseCommit();
  const final = await replacing;
  assert.deepEqual([final.status, final.reason], ['failed', 'QuotaExceededError']);
  assert.equal(store.stores.discoveries.get('a').name, 'Old name');
});

test('overlapping save and remove are judged by their own markers', async () => {
  const { store, controller } = setup({ writeWaitMs: 1000 });
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const saving = controller.save('local', record('a'));
  const removing = controller.remove('local', 'a');
  await flush();
  store.releaseCommit();
  store.failNext = 'AbortError';
  store.releaseCommit();
  assert.equal((await saving).status, 'committed');
  assert.equal((await removing).status, 'failed');
  assert.equal(store.stores.discoveries.has('a'), true, 'the failed removal left the saved record');
});

test('cancellation before commit aborts; cancellation after commit stays committed', async () => {
  const { store, controller } = setup({ writeWaitMs: 1000 });
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const before = controller.save('local', record('a'));
  await flush();
  controller.cancelWrite(controller.snapshot().writes[0].writeId);
  store.releaseCommit();
  assert.equal((await before).status, 'aborted');
  assert.equal(store.stores.discoveries.has('a'), false);
  store.holdCommits = false;
  const after = await controller.save('local', record('b'));
  controller.cancelWrite(after.writeId);
  assert.equal(after.status, 'committed');
  assert.equal(store.stores.discoveries.has('b'), true);
});

test('a removal is confirmed only after it commits; a failure leaves the record', async () => {
  const { store, controller } = setup();
  await controller.setWorkspace('plane');
  await controller.save('local', record('a'));
  store.failNext = 'QuotaExceededError';
  const failed = await controller.remove('local', 'a');
  assert.deepEqual([failed.status, failed.reason], ['failed', 'QuotaExceededError']);
  assert.equal(store.stores.discoveries.has('a'), true);
  assert.equal((await controller.remove('local', 'a')).status, 'committed');
  assert.equal(store.stores.discoveries.has('a'), false);
});

test('old query after workspace change', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.save('local', record('p'));
  let releasePlane;
  store.listDelay = workspace => workspace === 'plane' ? new Promise(resolve => { releasePlane = resolve; }) : Promise.resolve();
  const planeLoad = controller.setWorkspace('plane');
  await flush();
  await controller.setWorkspace('space');
  releasePlane();
  assert.deepEqual(await planeLoad, ['discarded'], 'the late Plane result is discarded');
  assert.equal(controller.snapshot().workspace, 'space');
  assert.deepEqual(controller.snapshot().sources.local.items, []);
});

test('a newer refresh wins over an older one in the same workspace', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.setWorkspace('plane');
  const releases = [];
  store.listDelay = () => new Promise(resolve => releases.push(resolve));
  const older = controller.refresh();
  await flush();
  await controller.save('local', record('n')).catch(() => {});
  const newer = controller.refresh();
  await flush();
  releases.at(-1)();
  releases[0]();
  for (const release of releases) release();
  const [olderResult] = await older;
  await newer;
  assert.equal(olderResult, 'discarded', 'the older refresh cannot overwrite the newer one');
  assert.deepEqual(controller.snapshot().sources.local.items.map(item => item.id), ['n']);
});

test('an obsolete open is rejected and destroy invalidates outstanding reads', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.setWorkspace('plane');
  await controller.save('local', record('a', 1));
  await controller.save('local', record('b', 2));
  let releaseFirst;
  store.getDelay = id => (id === 'a' ? new Promise(resolve => { releaseFirst = resolve; }) : Promise.resolve());
  const first = controller.open('local', 'a');
  await flush();
  const second = await controller.open('local', 'b');
  releaseFirst();
  await assert.rejects(first, error => error.code === 'superseded');
  assert.equal(second.id, 'b');
  store.getDelay = null;
  store.listDelay = () => new Promise(resolve => setTimeout(resolve, 20));
  const pending = controller.refresh();
  controller.destroy();
  assert.deepEqual(await pending, ['discarded']);
});

test('a slow or failing source is unavailable without hiding another source', async () => {
  const { local } = setup();
  await local.save(record('a'), { writeId: 'w' });
  const silent = { id: 'silent', label: 'Silent', capabilities: {}, list: () => new Promise(() => {}), get: () => new Promise(() => {}), subscribe: () => () => {} };
  const broken = { id: 'broken', label: 'Broken', capabilities: {}, list: async () => { throw new Error('offline'); }, get: async () => null, subscribe: () => () => {} };
  const controller = createDiscoveriesController({ sources: [silent, local, broken], sceneCodec, readTimeoutMs: 20 });
  await controller.setWorkspace('plane');
  const { sources } = controller.snapshot();
  assert.deepEqual([sources.silent.status, sources.silent.reason], ['unavailable', 'did not respond in time']);
  assert.deepEqual([sources.broken.status, sources.broken.reason], ['unavailable', 'offline']);
  assert.deepEqual([sources.local.items.map(item => item.id), sources.local.total], [['a'], 1]);
});

test('paging loads the next page and a refresh invalidates paging', async () => {
  const { store, local, controller } = setup({ readTimeoutMs: 1000 });
  for (let i = 0; i < 55; i++) await local.save(createDiscoveryRecord({ scene: createPlaneScene({ view: { re: '-0.5', im: '0', zoom: i / 10 } }), name: `D${i}`, thumbnail: thumbnail(), id: `d${i}`, createdAt: new Date(Date.UTC(2026, 9, 20, 0, 0, i)).toISOString(), sceneCodec }), { writeId: `w${i}` });
  await controller.setWorkspace('plane');
  let view = controller.snapshot().sources.local;
  assert.deepEqual([view.items.length, view.total, view.nextCursor], [50, 55, '50']);
  await controller.nextPage('local');
  view = controller.snapshot().sources.local;
  assert.deepEqual([view.items.length, view.nextCursor, view.items.at(-1).id], [55, null, 'd0']);
  store.listDelay = (workspace, call) => (call % 2 ? new Promise(resolve => setTimeout(resolve, 30)) : Promise.resolve());
  await controller.refresh();
  assert.equal(controller.snapshot().sources.local.items.length, 50, 'refresh replaces the previously loaded pages');
  const paging = controller.nextPage('local');
  await controller.refresh();
  assert.equal(await paging, 'discarded');
});

test('a throwing subscriber cannot turn a committed save into a failure', async () => {
  const errors = [];
  const store = createFakePersistence();
  const local = createLocalDiscoverySource({ store, sceneCodec, onListenerError: error => errors.push(`source: ${error.message}`) });
  const controller = createDiscoveriesController({ sources: [local], sceneCodec, readTimeoutMs: 40, onListenerError: error => errors.push(`controller: ${error.message}`) });
  const delivered = [];
  local.subscribe(() => { throw new Error('source listener broke'); });
  local.subscribe(change => delivered.push(change.type));
  controller.subscribe(() => { throw new Error('control render broke'); });
  await controller.setWorkspace('plane');
  const observation = await controller.save('local', record('a'));
  assert.equal(observation.status, 'committed');
  assert.ok(store.stores.discoveries.has('a'));
  assert.deepEqual(delivered, ['saved'], 'the other subscriber still received the change');
  assert.ok(errors.includes('source: source listener broke') && errors.some(error => error.startsWith('controller:')), 'failures are reported separately');
});

test('overlapping next-page requests append a page exactly once', async () => {
  const { store, local, controller } = setup({ readTimeoutMs: 1000 });
  for (let i = 0; i < 60; i++) await local.save(createDiscoveryRecord({ scene: createPlaneScene({ view: { re: '-0.5', im: '0', zoom: i / 10 } }), name: `D${i}`, thumbnail: thumbnail(), id: `d${i}`, createdAt: new Date(Date.UTC(2026, 9, 20, 0, 0, i)).toISOString(), sceneCodec }), { writeId: `w${i}` });
  await controller.setWorkspace('plane');
  store.listDelay = () => new Promise(resolve => setTimeout(resolve, 10));
  const [first, second] = await Promise.all([controller.nextPage('local'), controller.nextPage('local')]);
  assert.deepEqual([first, second], ['ready', 'ready'], 'the second request is the same read');
  const ids = controller.snapshot().sources.local.items.map(item => item.id);
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, 60, 'no record appears twice');
});

test('an open across a workspace change A → B → A is rejected, and its read is aborted', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.setWorkspace('plane');
  await controller.save('local', record('a'));
  const signals = [];
  let release;
  store.getDelay = () => new Promise(resolve => { release = resolve; });
  const original = store.getDiscovery;
  store.getDiscovery = (id, options = {}) => { signals.push(options.signal); return original(id, options); };
  const opening = controller.open('local', 'a');
  await flush();
  await controller.setWorkspace('space');
  await controller.setWorkspace('plane');
  assert.equal(signals[0].aborted, true, 'the workspace change aborted the read');
  release();
  await assert.rejects(opening, error => error.code === 'superseded');
});

test('a refresh and a destroy abort the reads they supersede', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.setWorkspace('plane');
  const signals = [];
  const original = store.listDiscoveries;
  store.listDiscoveries = query => { signals.push(query.signal); return new Promise(resolve => setTimeout(() => resolve(original(query)), 20)); };
  const older = controller.refresh();
  await flush();
  const newer = controller.refresh();
  assert.equal(signals[0].aborted, true);
  controller.destroy();
  assert.equal(signals[1].aborted, true);
  assert.deepEqual([await older, await newer], [['discarded'], ['discarded']]);
});

test('an item or opened record whose id disagrees with its listing is unsupported', async () => {
  const valid = record('real');
  const mismatched = { id: 'mismatched', label: 'Mismatch', capabilities: {}, list: async () => ({ items: [{ id: 'listed', record: valid }], nextCursor: null, total: 1 }), get: async () => ({ id: 'real', record: valid }), subscribe: () => () => {} };
  const controller = createDiscoveriesController({ sources: [mismatched], sceneCodec, readTimeoutMs: 40 });
  await controller.setWorkspace('plane');
  assert.match(controller.snapshot().sources.mismatched.items[0].unsupported, /id differs/);
  await assert.rejects(controller.open('mismatched', 'listed'), error => error.code === 'unsupported');
});

test('a thumbnail report must describe the record\'s scene and a completed publication', async () => {
  const { local } = setup();
  const saved = record('a');
  await assert.rejects(local.save(saved, { writeId: 'w1', report: { reportId: 'report-1', sceneHash: 'fnv1a64:0000000000000000', outcome: 'completed' } }), /completed publication/);
  await assert.rejects(local.save(saved, { writeId: 'w2', report: { reportId: 'report-1', sceneHash: saved.sceneHash, outcome: 'superseded' } }), /completed publication/);
  assert.equal((await local.save(saved, { writeId: 'w3', report: { reportId: 'report-1', sceneHash: saved.sceneHash, outcome: 'completed' } })).status, 'committed');
});

// A source that ignores cancellation, so identity guards must reject its late successes.
const deaf = () => {
  const pending = [];
  const source = { id: 'deaf', label: 'Deaf', capabilities: {}, subscribe: () => () => {},
    list: ({ workspace, cursor }) => new Promise(resolve => pending.push({ kind: 'list', workspace, cursor, resolve })),
    get: id => new Promise(resolve => pending.push({ kind: 'get', id, resolve })) };
  return { source, pending };
};

test('a late list result is discarded even when the source ignores cancellation', async () => {
  const { source, pending } = deaf();
  const controller = createDiscoveriesController({ sources: [source], sceneCodec, readTimeoutMs: 1000 });
  const plane = controller.setWorkspace('plane');
  const space = controller.setWorkspace('space');
  pending[1].resolve({ items: [], nextCursor: null, total: 0 });
  await space;
  pending[0].resolve({ items: [{ id: 'p', record: record('p') }], nextCursor: null, total: 1 });
  assert.deepEqual(await plane, ['discarded'], 'a late success must respect the query identity');
  assert.deepEqual(controller.snapshot().sources.deaf.items, []);
  controller.destroy();
});

test('a superseded page is not appended even when the source ignores cancellation', async () => {
  const { source, pending } = deaf();
  const controller = createDiscoveriesController({ sources: [source], sceneCodec, readTimeoutMs: 1000 });
  const first = controller.setWorkspace('plane');
  pending[0].resolve({ items: [{ id: 'a', record: record('a', 2) }], nextCursor: '1', total: 2 });
  await first;
  const paging = controller.nextPage('deaf');
  const again = controller.refresh();
  pending[2].resolve({ items: [{ id: 'a', record: record('a', 2) }], nextCursor: '1', total: 2 });
  await again;
  pending[1].resolve({ items: [{ id: 'b', record: record('b', 1) }], nextCursor: null, total: 2 });
  assert.equal(await paging, 'discarded', 'a late page must respect the refresh generation');
  assert.deepEqual(controller.snapshot().sources.deaf.items.map(item => item.id), ['a']);
  controller.destroy();
});

test('an obsolete open is rejected even when the source ignores cancellation', async () => {
  const { source, pending } = deaf();
  const controller = createDiscoveriesController({ sources: [source], sceneCodec, readTimeoutMs: 1000 });
  const workspace = controller.setWorkspace('plane');
  pending[0].resolve({ items: [], nextCursor: null });
  await workspace;
  const first = controller.open('deaf', 'a');
  const second = controller.open('deaf', 'b');
  pending[2].resolve({ id: 'b', record: record('b') });
  assert.equal((await second).id, 'b');
  pending[1].resolve({ id: 'a', record: record('a') });
  await assert.rejects(first, error => error.code === 'superseded', 'a late open must respect the selection token');
  controller.destroy();
});

test('a cancellation that arrives after commit, before the outcome is observed, stays committed', async () => {
  const { store, controller } = setup({ writeWaitMs: 1000 });
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const saving = controller.save('local', record('a'));
  await flush();
  store.releaseCommit();
  controller.cancelWrite(controller.snapshot().writes[0].writeId);
  assert.equal((await saving).status, 'committed', 'cancellation cannot decide an already committed write');
  assert.equal(controller.snapshot().writes[0].status, 'committed');
  controller.destroy();
});

const writable = overrides => ({
  id: 'test', label: 'Test source', capabilities: { save: true, remove: true },
  list: async () => ({ items: [], nextCursor: null, total: 0 }), get: async () => null,
  subscribe: () => () => {}, ...overrides,
});
const write = (controller, kind) => kind === 'save' ? controller.save('test', record('a')) : controller.remove('test', 'a');

test('synchronous write errors settle as failed and release their cancellation controllers', async () => {
  for (const kind of ['save', 'remove']) {
    let signal;
    const source = writable({ [kind]: (value, options) => { signal = options.signal; throw new Error('sync boom'); } });
    const controller = createDiscoveriesController({ sources: [source], sceneCodec });
    const result = await write(controller, kind).catch(error => ({ status: 'rejected', reason: error.message }));
    assert.deepEqual([result.status, result.reason], ['failed', 'sync boom'], `${kind}: synchronous exceptions must settle the observation`);
    assert.equal(controller.snapshot().writes[0].status, 'failed');
    controller.cancelWrite(result.writeId);
    assert.equal(signal.aborted, false, 'the settled write no longer has a cancellation controller');
    controller.destroy();
  }
});

test('unsupported or missing write methods are rejected before a pending write is allocated', async () => {
  for (const kind of ['save', 'remove']) {
    for (const source of [writable({ capabilities: {}, [kind]: () => assert.fail('unsupported method called') }), writable({})]) {
      const controller = createDiscoveriesController({ sources: [source], sceneCodec });
      const result = await write(controller, kind).catch(error => ({ code: error.code }));
      assert.equal(result?.code, 'unsupported', `${kind}: missing capability or method must be rejected as unsupported`);
      assert.deepEqual(controller.snapshot().writes, [], 'unsupported operations allocate no pending write');
      controller.destroy();
    }
  }
});

test('non-definite source outcomes remain unknown and can be reconciled by their own marker', async () => {
  for (const result of [{ status: 'ok' }, undefined, null, { status: 'pending' }, { status: 'unknown' }]) {
    for (const kind of ['save', 'remove']) {
      let signal;
      const source = writable({ [kind]: async (value, options) => { signal = options.signal; return result; }, confirm: async () => true });
      const controller = createDiscoveriesController({ sources: [source], sceneCodec });
      const observation = await write(controller, kind).catch(error => ({ status: 'rejected', reason: error.message }));
      assert.equal(observation.status, 'unknown', 'a malformed response does not prove the write failed or committed');
      assert.match(observation.reason, /definite/);
      controller.cancelWrite(observation.writeId);
      assert.equal(signal.aborted, false, 'a resolved source operation releases its cancellation controller');
      assert.equal((await controller.reconcile(observation.writeId)).status, 'committed');
      controller.destroy();
    }
  }
});

test('destroy stops write observation immediately without cancelling an admitted save', async () => {
  const { store, controller } = setup({ writeWaitMs: 1000, readTimeoutMs: 1000 });
  let confirms = 0;
  store.getWriteMarker = async () => { confirms++; return null; };
  store.holdCommits = true;
  const saving = controller.save('local', record('a'));
  await flush();
  let observed;
  saving.then(result => { observed = result; });
  controller.destroy();
  await flush();
  const stopped = observed;
  const confirmsAtDestroy = confirms;
  // Release even on RED, so a failing assertion leaves no pending observation timer.
  store.releaseCommit();
  await saving;
  await flush();
  assert.equal(stopped?.status, 'unknown', 'destroy must stop observing before the write deadline');
  assert.equal(confirmsAtDestroy, 0, 'destroy starts no marker reads');
  assert.equal(store.stores.discoveries.has('a'), true, 'teardown must not abort an admitted save');
  assert.equal(controller.snapshot().writes[0].status, 'committed', 'a later definite outcome still replaces unknown');
});

test('destroy aborts marker reads even when their source ignores cancellation', async () => {
  const { store, controller } = setup({ writeWaitMs: 1, readTimeoutMs: 1000 });
  let began, markerSignal, confirms = 0;
  const started = new Promise(resolve => { began = resolve; });
  store.getWriteMarker = (id, { signal }) => { confirms++; markerSignal = signal; began(); return new Promise(() => {}); };
  store.holdCommits = true;
  const saving = controller.save('local', record('a'));
  await started;
  let observed;
  saving.then(result => { observed = result; });
  controller.destroy();
  await flush();
  const abortedAtDestroy = markerSignal.aborted;
  const stopped = observed;
  store.releaseCommit();
  await saving;
  assert.equal(abortedAtDestroy, true, 'destroy must abort the in-flight marker read');
  assert.equal(stopped?.status, 'unknown', 'a source ignoring abort must not retain the observation timer');
  assert.equal(confirms, 1, 'destroy stops the reconciliation loop');
  assert.equal(store.stores.discoveries.has('a'), true);
});

test('destroy stops the delay between marker checks', async () => {
  const { store, controller } = setup({ writeWaitMs: 1, readTimeoutMs: 1000 });
  let began, confirms = 0;
  const started = new Promise(resolve => { began = resolve; });
  store.getWriteMarker = async () => { confirms++; began(); return null; };
  store.holdCommits = true;
  const saving = controller.save('local', record('a'));
  await started;
  await flush();
  let observed;
  saving.then(result => { observed = result; });
  controller.destroy();
  await flush();
  const stopped = observed;
  store.releaseCommit();
  await saving;
  assert.equal(stopped?.status, 'unknown', 'destroy must stop the reconciliation delay');
  assert.equal(confirms, 1, 'destroy must not start another marker check');
});

test('a destroyed controller starts no reads or writes and teardown is idempotent', async () => {
  const calls = [];
  const source = writable({
    list: async () => { calls.push('list'); return { items: [], nextCursor: 'next', total: 1 }; },
    get: async () => { calls.push('get'); return null; },
    save: async () => { calls.push('save'); return { status: 'committed' }; },
    remove: async () => { calls.push('remove'); return { status: 'committed' }; },
    confirm: async () => { calls.push('confirm'); return false; },
    subscribe: () => () => { calls.push('unsubscribe'); },
  });
  const controller = createDiscoveriesController({ sources: [source], sceneCodec });
  await controller.setWorkspace('plane');
  calls.length = 0;
  controller.destroy();
  controller.destroy();
  const refresh = await controller.refresh();
  const page = await controller.nextPage('test');
  const workspace = await controller.setWorkspace('space');
  const opening = await controller.open('test', 'a').catch(error => error.code);
  const saving = await write(controller, 'save').catch(error => error.code);
  const removing = await write(controller, 'remove').catch(error => error.code);
  const reconciled = await controller.reconcile('absent');
  assert.deepEqual(calls, ['unsubscribe'], 'destroyed methods must not touch the source');
  assert.deepEqual([refresh, page, workspace, opening, saving, removing, reconciled], [['discarded'], 'discarded', ['discarded'], 'superseded', 'destroyed', 'destroyed', null]);
  assert.equal(controller.snapshot().workspace, 'plane', 'setWorkspace after destroy does not mutate the snapshot');
  assert.deepEqual(controller.snapshot().writes, []);
});

test('discovery dates use canonical four-digit-year UTC strings for chronological ordering', () => {
  const valid = plain(record('a'));
  for (const createdAt of ['2026', 'Tue, 20 Oct 2026 00:00:00 GMT', '10/20/2026', '2026-10-20T00:00:00Z', '2026-10-20T01:00:00.000+01:00', '2026-02-30T00:00:00.000Z', '+010000-01-01T00:00:00.000Z', 'invalid']) {
    assert.throws(() => validateDiscovery({ ...valid, createdAt }, sceneCodec), error => error.code === 'invalid-value', `reject noncanonical date: ${createdAt}`);
  }
  assert.equal(validateDiscovery(valid, sceneCodec).createdAt, valid.createdAt);
});

test('thumbnail provenance requires a nonblank source report id', () => {
  const valid = plain(record('a'));
  for (const sourceReportId of ['', '  ']) {
    assert.throws(() => validateDiscovery({ ...valid, thumbnail: { ...valid.thumbnail, sourceReportId } }, sceneCodec), error => error.code === 'invalid-value', 'a thumbnail must identify its source report');
  }
});

test('thumbnail validation rejects unknown and missing fields', () => {
  const valid = plain(record('a'));
  assert.throws(() => validateDiscovery({ ...valid, thumbnail: { ...valid.thumbnail, extra: true } }, sceneCodec), error => error.code === 'unknown-field', 'unknown thumbnail fields must not be silently dropped');
  for (const key of Object.keys(valid.thumbnail)) {
    const thumbnail = { ...valid.thumbnail };
    delete thumbnail[key];
    assert.throws(() => validateDiscovery({ ...valid, thumbnail }, sceneCodec), error => error.code === 'missing-field', `missing thumbnail field: ${key}`);
  }
});

test('a declared thumbnail blob type must match its media type', () => {
  const valid = plain(record('a'));
  assert.throws(() => validateDiscovery({ ...valid, thumbnail: { ...valid.thumbnail, blob: new Blob(['png'], { type: 'image/png' }) } }, sceneCodec), error => error.code === 'invalid-value', 'a declared blob type must match mediaType');
  assert.equal(validateDiscovery({ ...valid, thumbnail: { ...valid.thumbnail, blob: new Blob(['jpeg']) } }, sceneCodec).thumbnail.blob.type, '', 'an unspecified blob type is accepted');
});

test('a valid record belonging to another workspace is unsupported in lists and opens', async () => {
  const valid = record('a');
  const source = writable({ list: async () => ({ items: [{ id: 'a', record: valid }], nextCursor: null }), get: async () => ({ id: 'a', record: valid }) });
  const controller = createDiscoveriesController({ sources: [source], sceneCodec });
  // Plane is the only model in 1a; testing it under the Space filter needs no invented Space codec.
  await controller.setWorkspace('space');
  assert.match(controller.snapshot().sources.test.items[0].unsupported || '', /another workspace/);
  await assert.rejects(controller.open('test', 'a'), error => error.code === 'unsupported');
  controller.destroy();
});

test('a committed local write refreshes once and external changes still refresh the view', async () => {
  const { store, local, controller } = setup();
  await controller.setWorkspace('plane');
  const count = store.listCalls.length;
  await controller.save('local', record('a'));
  await flush();
  assert.equal(store.listCalls.length - count, 1, 'one local commit must issue one refresh');
  await local.save(record('b'), { writeId: 'external' });
  await flush();
  assert.deepEqual(new Set(controller.snapshot().sources.local.items.map(item => item.id)), new Set(['a', 'b']));
  const beforeRemove = store.listCalls.length;
  await controller.remove('local', 'a');
  await flush();
  assert.equal(store.listCalls.length - beforeRemove, 1, 'one local removal must issue one refresh');
  controller.destroy();
});

test('marker reconciliation refreshes a committed write whose source has not notified', async () => {
  let lists = 0;
  const source = writable({ save: () => new Promise(() => {}), confirm: async () => true, list: async () => { lists++; return { items: [{ id: 'a', record: record('a') }], nextCursor: null }; } });
  const controller = createDiscoveriesController({ sources: [source], sceneCodec, writeWaitMs: 1 });
  await controller.setWorkspace('plane');
  const before = lists;
  assert.equal((await controller.save('test', record('a'))).status, 'committed');
  await flush();
  assert.equal(lists - before, 1, 'confirming a marker must refresh even without a source notification');
  controller.destroy();
});

test('non-Error write rejections also settle and release their cancellation controllers', async () => {
  for (const rejection of [null, 'plain rejection']) {
    let signal;
    const source = writable({ save: (value, options) => { signal = options.signal; throw rejection; } });
    const controller = createDiscoveriesController({ sources: [source], sceneCodec });
    const result = await controller.save('test', record('a')).catch(() => ({ status: 'rejected' }));
    assert.equal(result.status, 'failed', 'throwing a non-Error must not leave a write pending');
    assert.equal(result.reason, String(rejection));
    assert.equal(controller.snapshot().writes[0].status, 'failed');
    controller.cancelWrite(result.writeId);
    assert.equal(signal.aborted, false);
    controller.destroy();
  }
});
