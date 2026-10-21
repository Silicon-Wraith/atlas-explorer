// spikes/project0/tests/alloc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAllocator } from '../gpu/alloc.js';
globalThis.GPUTextureUsage ??= { STORAGE_BINDING: 8 };
const device = { createBuffer: d => ({ ...d, destroy() { this.dead = (this.dead || 0) + 1; } }), createTexture: d => ({ ...d, destroy() {} }) };

test('the allocator refuses an allocation that would exceed the cap, before allocating', () => {
  const alloc = createAllocator({ capBytes: 1000 }); let created = 0;
  const counting = { ...device, createBuffer: d => { created++; return device.createBuffer(d); } };
  alloc.buffer(counting, { size: 600 });
  assert.throws(() => alloc.buffer(counting, { size: 600 }), /allocation cap exceeded/);
  assert.equal(created, 1);
  assert.equal(alloc.inventory().bytes, 600);
});

test('payload bytes, counts and the peak are exact; destroy() releases once', () => {
  const alloc = createAllocator({ capBytes: 2 ** 30 });
  const b = alloc.buffer(device, { size: 256 });
  const t = alloc.texture(device, { size: [4, 2], format: 'rgba16float' });
  alloc.pipeline({}); alloc.bindGroup({});
  assert.deepEqual(alloc.inventory(), { bytes: 256 + 64, textures: 1, buffers: 1, pipelines: 1, bindGroups: 1, peakBytes: 320 });
  b.destroy(); b.destroy(); t.destroy();
  assert.equal(b.dead, 1);
  assert.deepEqual(alloc.inventory(), { bytes: 0, textures: 0, buffers: 0, pipelines: 1, bindGroups: 1, peakBytes: 320 });
  assert.throws(() => alloc.texture(device, { size: [1, 1], format: 'bgra8unorm' }), /untracked texture format/);
});
