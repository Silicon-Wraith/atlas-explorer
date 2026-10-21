import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackedAllocator } from '../../src/space/render/webgpu/allocator.js';
import { BackendError, TRACKED_ALLOCATION_CAP } from '../../src/space/render/backend.js';
import { createFakeClock } from '../support/fake-clock.mjs';

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
  // An injected failure is also refused before creation, and the cap check comes first.
  tracked.failNextAllocation();
  assert.throws(() => tracked.allocate({ name: 'injected', bytes: 4, usage: 'storage' }), code('allocation-failed'));
  assert.equal(factory.created.length, 2);
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
  assert.deepEqual(tracked.diagnostics(), { tracked: 0, peak: 0, retiring: 0, inventory: [] });
  const handles = tracked.transaction(descriptions.slice(0, 2));
  assert.equal(handles.length, 2); assert.equal(tracked.diagnostics().tracked, 800);
  assert.equal(tracked.diagnostics().peak, 800, 'peak reflects only resources that were actually created');
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
