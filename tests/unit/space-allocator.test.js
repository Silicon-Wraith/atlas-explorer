import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackedAllocator } from '../../src/space/render/webgpu/allocator.js';
import { BackendError, TRACKED_ALLOCATION_CAP } from '../../src/space/render/backend.js';
import { createFakeClock } from '../support/fake-clock.mjs';
import { assertStatusAfterTicket } from '../support/space-lifecycle-checks.mjs';

test('B15-R16-F3 recovery harness accepts ticket retirement into the tracked idle pool', () => {
  const { allocator: tracked } = allocator();
  const bytes = 3840 * 2160 * 4;
  const [status] = tracked.transaction([{ name: 'status', bytes, width: 3840, height: 2160, format: 'r32uint', bytesPerTexel: 4 }], { pool: '4k' });
  tracked.activatePool('4k');
  const ticket = {};
  tracked.hold(status, ticket, 'ticket'); tracked.release(status);
  assert.equal(tracked.diagnostics().retiring, bytes);
  tracked.unhold(ticket);
  const d = tracked.diagnostics();
  assertStatusAfterTicket({ trackedAtAllocation: bytes, afterTicket: { tracked: d.tracked, retiring: d.retiring, statusPresent: true, status: d.inventory[0], idleBytes: d.tracked, peak: d.peak } });
  assert.equal(d.inventory[0].state, 'pooled');
  assert.equal(d.peak, bytes);
  // Concurrent live + idle residency, including the pool, must never cross 1 GiB.
  tracked.allocate({ name: 'live', bytes: 2 ** 30 - bytes, usage: 'storage' });
  assert.equal(tracked.diagnostics().tracked, 2 ** 30);
  tracked.allocate({ name: 'pressure', bytes: 4, usage: 'storage' });
  assert.equal(tracked.diagnostics().peak, 2 ** 30);
  assert.equal(tracked.diagnostics().inventory.some(e => e.state === 'pooled'), false);
  tracked.destroyAll(); assert.equal(tracked.diagnostics().tracked, 0);
});

// A resource factory that records every creation and destruction; `native` objects are inert.
function fakeFactory({ failOn = null } = {}) {
  const created = [], destroyed = [];
  return {
    created, destroyed,
    create(desc) {
      if (failOn && desc.name === failOn) throw new Error(`driver refused ${desc.name}`);
      const native = { label: desc.name, bytes: desc.bytes, data: desc.data ? new Uint8Array(desc.data) : null };
      created.push(native); return native;
    },
    destroy(native) { destroyed.push(native); },
  };
}
const allocator = (options = {}) => {
  const factory = options.factory ?? fakeFactory();
  return { factory, allocator: createTrackedAllocator({ factory, cap: options.cap ?? TRACKED_ALLOCATION_CAP, clock: options.clock ?? createFakeClock(), epoch: options.epoch ?? 1 }) };
};
const code = expected => error => error instanceof BackendError && error.code === expected;

test('allocation is refused before creation when it would exceed the cap', () => {
  const { factory, allocator: tracked } = allocator({ cap: 100 });
  tracked.allocate({ name: 'model', bytes: 64, usage: 'storage' });
  assert.throws(() => tracked.allocate({ name: 'too-big', bytes: 40, usage: 'storage' }), code('allocation-failed'));
  assert.equal(factory.created.length, 1, 'the factory is never asked for a resource the cap refuses');
  assert.equal(tracked.diagnostics().tracked, 64); assert.equal(tracked.diagnostics().peak, 64);
  assert.equal(tracked.diagnostics().inventory.length, 1);
  // Exactly at the cap is admitted; one byte over is refused before creation.
  tracked.allocate({ name: 'fits', bytes: 36, usage: 'storage' });
  assert.equal(tracked.diagnostics().tracked, 100);
  assert.throws(() => tracked.allocate({ name: 'over', bytes: 4, usage: 'storage' }), code('allocation-failed'));
  assert.equal(factory.created.length, 2);
  // The cap check comes first: an armed injection survives a cap refusal.
  tracked.failNextAllocation();
  assert.throws(() => tracked.allocate({ name: 'over', bytes: 4, usage: 'storage' }), error => code('allocation-failed')(error) && /cap/.test(error.message));
  assert.equal(factory.created.length, 2);
  // Isolated from the cap: with room left, the armed injection refuses one request that fits, before creation.
  const { factory: roomy, allocator: spare } = allocator({ cap: 100 });
  spare.failNextAllocation();
  assert.throws(() => spare.allocate({ name: 'injected', bytes: 4, usage: 'storage' }), error => code('allocation-failed')(error) && /injected/.test(error.message));
  assert.equal(roomy.created.length, 0);
  spare.allocate({ name: 'next', bytes: 4, usage: 'storage' }); assert.equal(roomy.created.length, 1, 'the injection is one-shot');
  assert.throws(() => tracked.allocate({ name: 'bad', bytes: 0, usage: 'storage' }), code('invalid-descriptor'));
  assert.throws(() => tracked.allocate({ name: '', bytes: 4, usage: 'storage' }), code('invalid-descriptor'));
});

test('release keeps bytes tracked until the last retaining owner retires', () => {
  const { factory, allocator: tracked } = allocator();
  const handle = tracked.allocate({ name: 'retained', bytes: 1024, usage: 'storage' });
  tracked.retain(handle, 'published'); tracked.retain(handle, 'thumbnail');
  tracked.release(handle);
  assert.equal(tracked.diagnostics().tracked, 1024); assert.equal(tracked.diagnostics().retiring, 1024);
  assert.equal(factory.destroyed.length, 0, 'a retained resource is not destroyed on release');
  assert.throws(() => tracked.lookup(handle), code('invalid-descriptor'), 'a released handle is no longer usable for new work');
  assert.equal(tracked.lookup(handle, { allowRetiring: true }).retiring, true);
  tracked.retire('published');
  assert.equal(tracked.diagnostics().tracked, 1024, 'one owner still retains it');
  tracked.retire('thumbnail');
  assert.equal(tracked.diagnostics().tracked, 0); assert.equal(tracked.diagnostics().retiring, 0);
  assert.equal(factory.destroyed.length, 1); assert.equal(factory.destroyed[0], factory.created[0]);
  // Releasing again is a no-op for a reclaimed handle; a foreign token is refused.
  tracked.release(handle);
  assert.throws(() => tracked.release({ id: 'foreign', epoch: 1 }), code('invalid-descriptor'));
  assert.throws(() => tracked.retain({ id: 'foreign', epoch: 1 }, 'x'), code('invalid-descriptor'));
});

test('held tickets and mappings keep a released resource until the last reference ends', () => {
  const { factory, allocator: tracked } = allocator();
  const handle = tracked.allocate({ name: 'status', bytes: 16, usage: 'storage' });
  const ticket = { id: 't1' }, mapping = { id: 'm1' };
  tracked.hold(handle, ticket, 'ticket'); tracked.hold(handle, mapping, 'mapping');
  tracked.release(handle);
  const entry = tracked.diagnostics().inventory[0];
  assert.equal(entry.state, 'retiring'); assert.equal(entry.tickets, 1); assert.equal(entry.mappings, 1);
  tracked.unhold(ticket);
  assert.equal(tracked.diagnostics().tracked, 16);
  tracked.unhold(mapping);
  assert.equal(tracked.diagnostics().tracked, 0); assert.equal(factory.destroyed.length, 1);
  assert.throws(() => tracked.hold(handle, ticket, 'ticket'), code('invalid-descriptor'));
  assert.throws(() => tracked.hold(tracked.allocate({ name: 'x', bytes: 4, usage: 'storage' }), ticket, 'owner'), RangeError);
});

test('diagnostics report tracked, peak, retiring and the inventory by name and actual dimensions', () => {
  const { allocator: tracked } = allocator({ epoch: 3 });
  const depth = tracked.allocate({ name: 'depth', bytes: 64 * 32 * 4, width: 64, height: 32, format: 'r32float', bytesPerTexel: 4 });
  const staging = tracked.allocate({ name: 'readback-staging-0', bytes: 256 * 8, bytesPerRow: 256 });
  const uniform = tracked.allocate({ name: 'uniforms', bytes: 32, usage: 'uniform' });
  let diagnostics = tracked.diagnostics();
  assert.equal(diagnostics.tracked, 8192 + 2048 + 32); assert.equal(diagnostics.peak, 8192 + 2048 + 32); assert.equal(diagnostics.retiring, 0);
  assert.deepEqual(diagnostics.inventory.map(item => item.name), ['depth', 'readback-staging-0', 'uniforms']);
  const [depthItem, stagingItem, uniformItem] = diagnostics.inventory;
  assert.deepEqual({ ...depthItem, allocatedAt: undefined }, { id: depth.id, epoch: 3, name: 'depth', bytes: 8192, width: 64, height: 32, format: 'r32float', state: 'live', tickets: 0, mappings: 0, owners: 0, allocatedAt: undefined });
  assert.equal(stagingItem.bytesPerRow, 256); assert.equal(stagingItem.width, undefined);
  assert.equal(uniformItem.usage, 'uniform'); assert.equal(uniformItem.format, undefined);
  assert.equal(depth.epoch, 3); assert.equal(typeof depth.id, 'string'); assert.ok(Object.isFrozen(depth));
  tracked.release(uniform); tracked.release(staging);
  tracked.hold(depth, { id: 't' }, 'ticket'); tracked.release(depth);
  diagnostics = tracked.diagnostics();
  assert.equal(diagnostics.tracked, 8192, 'unreferenced releases leave accounting at once; a held one retires');
  assert.equal(diagnostics.retiring, 8192); assert.equal(diagnostics.peak, 8192 + 2048 + 32, 'peak persists');
  assert.deepEqual(diagnostics.inventory.map(item => [item.name, item.state]), [['depth', 'retiring']]);
  assert.ok(Object.isFrozen(diagnostics) && Object.isFrozen(diagnostics.inventory), 'diagnostics are a frozen snapshot');
});

test('uniform, staging and model buffers are counted', () => {
  const { allocator: tracked } = allocator({ cap: 4096 });
  const model = tracked.allocate({ name: 'model', bytes: 1024, usage: 'storage', data: Uint8Array.from([1, 2, 3, 4]) });
  const uniforms = tracked.allocate({ name: 'uniforms', bytes: 48, usage: 'uniform' });
  const staging = tracked.allocate({ name: 'readback-staging-0', bytes: 2048, bytesPerRow: 256 });
  assert.equal(tracked.diagnostics().tracked, 1024 + 48 + 2048);
  assert.ok(tracked.lookup(model).description.data === undefined, 'initial data is not part of the frozen description');
  assert.equal(tracked.lookup(model).description.bytes, 1024); assert.ok(Object.isFrozen(tracked.lookup(model).description));
  assert.throws(() => tracked.allocate({ name: 'query-resolve', bytes: 1024, usage: 'storage' }), code('allocation-failed'), 'the next kilobyte would cross the 4096 cap');
  tracked.release(uniforms); tracked.release(staging);
  assert.equal(tracked.diagnostics().tracked, 1024);
  tracked.allocate({ name: 'query-resolve', bytes: 1024, usage: 'storage' });
  assert.equal(tracked.diagnostics().tracked, 2048);
});

test('a transaction reserves every byte first and rolls back completely when one creation fails', () => {
  const { factory, allocator: tracked } = allocator({ cap: 1000, factory: fakeFactory({ failOn: 'normal' }) });
  const descriptions = [
    { name: 'depth', bytes: 400, width: 10, height: 10, format: 'r32float', bytesPerTexel: 4 },
    { name: 'status', bytes: 400, width: 10, height: 10, format: 'r32uint', bytesPerTexel: 4 },
    { name: 'normal', bytes: 800, width: 10, height: 10, format: 'rgba16float', bytesPerTexel: 8 },
  ];
  // Above the cap in aggregate: refused before the factory sees any of them.
  assert.throws(() => tracked.transaction(descriptions), code('allocation-failed'));
  assert.equal(factory.created.length, 0); assert.equal(tracked.diagnostics().tracked, 0);
  // Within the cap but the third creation fails: the first two are destroyed and nothing stays accounted.
  assert.throws(() => tracked.transaction(descriptions.map(desc => ({ ...desc, width: 5, height: 5, bytes: desc.bytes / 4 }))), code('allocation-failed'));
  assert.equal(factory.created.length, 2); assert.equal(factory.destroyed.length, 2);
  // Rollback restores current tracking; the lifetime peak keeps the two resources that briefly existed.
  assert.deepEqual(tracked.diagnostics(), { tracked: 0, peak: 200, retiring: 0, inventory: [] });
  const handles = tracked.transaction(descriptions.slice(0, 2));
  assert.equal(handles.length, 2); assert.equal(tracked.diagnostics().tracked, 800);
  assert.equal(tracked.diagnostics().peak, 800);
});

test('destroyAll destroys every native resource and zeroes tracking while peak persists', () => {
  const { factory, allocator: tracked } = allocator();
  const a = tracked.allocate({ name: 'a', bytes: 16, usage: 'storage' }); tracked.allocate({ name: 'b', bytes: 16, usage: 'storage' });
  tracked.hold(a, { id: 't' }, 'ticket'); tracked.release(a);
  tracked.destroyAll();
  assert.equal(factory.destroyed.length, 2);
  assert.deepEqual(tracked.diagnostics(), { tracked: 0, peak: 32, retiring: 0, inventory: [] });
  assert.throws(() => tracked.lookup(a, { allowRetiring: true }), code('invalid-descriptor'));
  tracked.unhold({ id: 't' }); // tokens from before the teardown are harmless
});

test('B15-O2 pool bounds entries and obsolete owners tickets and mappings survive until their final release', () => {
  const { factory, allocator: tracked } = allocator();
  const descriptions = Array.from({ length: 48 }, (_, i) => ({ name: `target-${i}`, bytes: 16, width: 2, height: 2, format: 'r32float' }));
  const handles = tracked.transaction(descriptions, { pool: 'output-a' }); tracked.activatePool('output-a');
  const ticket = {}, mapping = {};
  tracked.hold(handles[0], ticket, 'ticket'); tracked.hold(handles[1], mapping, 'mapping'); tracked.retain(handles[2], 'published');
  handles.forEach(h => tracked.release(h));
  assert.equal(tracked.diagnostics().inventory.filter(e => e.state === 'pooled').length, 44);
  tracked.activatePool('output-b'); tracked.activatePool('output-a');
  assert.equal(tracked.diagnostics().inventory.length, 3, 'only held obsolete resources survive');
  assert.equal(factory.destroyed.length, 45);
  tracked.unhold(ticket); tracked.unhold(mapping); tracked.retire('published');
  assert.equal(tracked.diagnostics().tracked, 0, 'returning to the old key does not revive obsolete entries');
  assert.equal(factory.destroyed.length, 48);
});

// Operation counts guard per-frame allocation work without a machine-dependent time limit.
function fullIdlePool() {
  const fixture = allocator();
  const descriptions = Array.from({ length: 44 }, (_, index) => ({ name: `target-${index}`, bytes: 4, usage: 'texture' }));
  fixture.allocator.transaction(descriptions, { pool: 'orbit' }).forEach(handle => fixture.allocator.release(handle));
  return { ...fixture, descriptions };
}

test('R16-C1 pool lookup serializes each requested description once', () => {
  const { allocator: tracked, descriptions } = fullIdlePool();
  const stringify = JSON.stringify;
  let calls = 0;
  JSON.stringify = (...args) => { calls++; return stringify(...args); };
  try {
    assert.equal(tracked.canReuse([descriptions.at(-1)], 'orbit'), true);
    assert.ok(calls <= 1, `one lookup serialized ${calls} keys`);
    calls = 0;
    tracked.transaction([descriptions.at(-1)], { pool: 'orbit' });
    assert.ok(calls <= 1, `one checkout serialized ${calls} keys`);
  } finally { JSON.stringify = stringify; }
});

test('R16-C4 a warm pool query does not materialize or scan the idle pool', () => {
  const { allocator: tracked, descriptions } = fullIdlePool();
  const iterate = Set.prototype[Symbol.iterator];
  let visited = 0;
  Set.prototype[Symbol.iterator] = function* () { for (const value of iterate.call(this)) { visited++; yield value; } };
  try {
    assert.equal(tracked.canReuse([descriptions.at(-1)], 'orbit'), true);
    assert.ok(visited <= 1, `one lookup traversed ${visited} pooled entries`);
  } finally { Set.prototype[Symbol.iterator] = iterate; }
});

test('R16-C5 duplicate descriptions require distinct pooled native resources', () => {
  const { allocator: tracked, factory } = allocator({ cap: 8 });
  const desc = { name: 'identical', bytes: 4, usage: 'texture' };
  const [idle] = tracked.transaction([desc], { pool: 'pair' });
  tracked.release(idle);
  assert.equal(tracked.canReuse([desc, desc], 'pair'), false, 'one idle resource cannot cover two outputs');
  const handles = tracked.transaction([desc, desc], { pool: 'pair' });
  assert.notEqual(tracked.lookup(handles[0]).native, tracked.lookup(handles[1]).native);
  assert.equal(factory.created.length, 2);
  assert.equal(tracked.diagnostics().tracked, 8);
  assert.equal(tracked.diagnostics().peak, 8);
  handles.forEach(handle => tracked.release(handle));
  assert.equal(tracked.canReuse([desc, desc], 'pair'), true);
  const reused = tracked.transaction([desc, desc], { pool: 'pair' });
  assert.notEqual(tracked.lookup(reused[0]).native, tracked.lookup(reused[1]).native);
  assert.equal(factory.created.length, 2);
  tracked.destroyAll();
  assert.equal(factory.destroyed.length, 2);
  assert.equal(new Set(factory.destroyed).size, 2);
});


test('R16-C5 rollback restores distinct indexed candidates and idle accounting', () => {
  const factory = fakeFactory({ failOn: 'refused' }), { allocator: tracked } = allocator({ factory, cap: 16 });
  const desc = { name: 'same', bytes: 4 };
  tracked.transaction([desc, desc], { pool: 'pair' }).forEach(h => tracked.release(h));
  for (const failure of ['cap', 'factory']) {
    assert.throws(() => tracked.transaction([desc, desc, { name: 'refused', bytes: failure === 'cap' ? 12 : 4 }], { pool: 'pair' }), code('allocation-failed'));
    assert.equal(tracked.canReuse([desc, desc], 'pair'), true);
    assert.equal(tracked.diagnostics().tracked, 8);
  }
  tracked.activatePool('new');
  assert.equal(tracked.canReuse([desc], 'pair'), false);
  assert.equal(tracked.diagnostics().tracked, 0);
  const [next] = tracked.transaction([desc], { pool: 'new' });
  tracked.release(next); tracked.retire('unrelated'); tracked.release(next, { discard: true });
  assert.equal(tracked.canReuse([desc], 'new'), false);
  assert.equal(tracked.diagnostics().tracked, 0);
  assert.equal(factory.destroyed.length, 3);
});
