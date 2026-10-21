// spikes/project0/tests/renderer.test.mjs — deterministic fake device: completions and mappings resolve only when the test says so.
// It asserts the *actual* number of pending queue submissions, through finish and mapping, and validates resolve alignment.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.GPUBufferUsage ??= { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128, QUERY_RESOLVE: 512 };
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUMapMode ??= { READ: 1 };
globalThis.navigator ??= {};
globalThis.navigator.gpu ??= { getPreferredCanvasFormat: () => 'bgra8unorm' };
const { Renderer } = await import('../gpu/renderer.js');
const { createAllocator } = await import('../gpu/alloc.js');
const { createWatchdog } = await import('../gpu/watchdog.js');
const { createAbort } = await import('../gpu/abort.js');

function fakeDevice({ timestamps = false } = {}) {
  const pending = [], maps = [];
  let submits = 0, peakPending = 0;
  const pass = () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, draw() {}, end() {} });
  const device = {
    features: new Set(timestamps ? ['timestamp-query'] : []),
    // WebGPU's mapping states: mapAsync() is pending until resolved; unmap() cancels a pending mapping (rejecting it) or releases a
    // mapped one; a copy into a buffer that is not unmapped is a validation error.
    createBuffer: d => { const b = { size: d.size, mapState: 'unmapped', destroy() {},
      mapAsync() { if (b.mapState !== 'unmapped') return Promise.reject(new Error('OperationError: buffer is not unmapped')); b.mapState = 'pending';
        return new Promise((res, rej) => { const m = { res: () => { if (b.pending === m) { b.pending = null; b.mapState = 'mapped'; res(); } }, rej }; b.pending = m; maps.push(m); }); },
      getMappedRange: () => { if (b.mapState !== 'mapped') throw new Error('OperationError: buffer is not mapped'); return new ArrayBuffer(d.size); },
      unmap() { if (b.pending) { const m = b.pending; b.pending = null; m.rej(new Error('AbortError: mapping cancelled by unmap()')); } b.mapState = 'unmapped'; } }; return b; },
    createTexture: d => ({ ...d, createView: () => ({}), destroy() { this.dead = true; } }),
    createBindGroup: () => ({}), createQuerySet: d => ({ count: d.count, destroy() {} }),
    createCommandEncoder: () => ({ beginComputePass: pass, beginRenderPass: pass, finish: () => ({}),
      copyBufferToBuffer(src, so, dst) { if (dst.mapState && dst.mapState !== 'unmapped') throw new Error(`copy into a ${dst.mapState} buffer`); },
      resolveQuerySet(set, first, count, buffer, offset) {
        if (offset % 256 !== 0) throw new Error(`resolveQuerySet destinationOffset ${offset} is not a multiple of 256`);
        if (offset + 8 * count > buffer.size || first + count > set.count) throw new Error('resolveQuerySet out of bounds');
      } }),
    queue: { submit() { submits++; }, writeBuffer() {}, onSubmittedWorkDone: () => { const p = new Promise(res => pending.push(res)); peakPending = Math.max(peakPending, pending.length); return p; } },
  };
  const tick = () => new Promise(r => setImmediate(r));
  return { device, submits: () => submits, pendingNow: () => pending.length, peakPending: () => peakPending,
    completeOne: async () => { pending.shift()?.(); await tick(); }, mapAll: async () => { while (maps.length) maps.shift().res(); await tick(); } };
}
const fixtures = { views: { 'bulb-overview': { camera: { origin: [1.92, -1.44, 0.7], target: [0, 0, 0] } } }, profiles: { draft: { W: 64, H: 64, iterations: 64, steps: 256, k: 0.9, floor: 1e-6, factor: 0.5 } } };
const pipeline = { getBindGroupLayout: () => ({}) };
const viewport = { bulb: pipeline, sphere: pipeline, shade: pipeline, blit: pipeline };
function make(fake, { epoch = () => 1, abort } = {}) {
  const events = { log: [], mark(type, f = {}) { const e = { type, t: performance.now(), ...f }; this.log.push(e); return e; } };
  const canvas = { width: 1280, height: 720, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) };
  const r = new Renderer({ device: fake.device, viewport, canvas, fixtures, events, alloc: createAllocator({ capBytes: 2 ** 30 }), watchdog: createWatchdog({ every: null }), abort, epoch });
  return { r, events };
}

test('replacement requests never exceed two pending submissions; the freed credit serves the current request', async () => {
  const fake = fakeDevice(), { r, events } = make(fake);
  for (let i = 0; i < 3; i++) r.render({ view: 'bulb-overview', profile: 'draft' });
  assert.equal(fake.submits(), 2);
  await fake.completeOne();
  assert.equal(fake.submits(), 3);
  assert.equal(events.log.filter(e => e.type === 'submit').at(-1).requestId, 3);
  assert.ok(fake.peakPending() <= 2);
});

test('the finish submission takes ledger credit: a replacement while a finish is pending cannot reach three', async () => {
  const fake = fakeDevice(), { r } = make(fake);
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });   // one band
  await fake.completeOne();                                                            // band done -> finish submitted
  assert.equal(fake.pendingNow(), 1, 'the finish is pending');
  r.render({ view: 'bulb-overview', profile: 'draft' });                               // replacement: 64x64, many bands
  r.render({ view: 'bulb-overview', profile: 'draft' });
  assert.equal(fake.pendingNow(), 2, 'only one band could be added beside the pending finish');
  assert.ok(fake.peakPending() <= 2); assert.ok(r.stats().outstandingMax <= 2);
  for (let i = 0; i < 40 && fake.pendingNow(); i++) { await fake.completeOne(); await fake.mapAll(); assert.ok(fake.pendingNow() <= 2); }
  assert.ok(fake.peakPending() <= 2, `peak pending ${fake.peakPending()}`);
});

test('a frame publishes only after its finish completes and its counts map, with epoch and generation', async () => {
  const fake = fakeDevice(), { r } = make(fake); const got = [];
  r.onPublish(p => got.push(p));
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });
  await fake.completeOne(); assert.equal(got.length, 0);
  await fake.completeOne(); assert.equal(got.length, 0, 'not before the counts are mapped');
  await fake.mapAll();
  assert.equal(got.length, 1); assert.equal(got[0].epoch, 1); assert.equal(got[0].generation, 1); assert.equal(got[0].W, 8);
});

test('a resize keeps the ledger: dimension changes do not grant fresh credits', () => {
  const fake = fakeDevice(), { r } = make(fake);
  r.render({ view: 'bulb-overview', profile: 'draft' });
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 32, H: 32 } });
  assert.equal(fake.submits(), 2);
});

test('a destroyed renderer neither submits nor publishes', async () => {
  const fake = fakeDevice(), { r } = make(fake); let published = 0;
  r.onPublish(() => published++);
  r.render({ view: 'bulb-overview', profile: 'draft' }); r.destroy();
  for (let i = 0; i < 10; i++) await fake.completeOne();
  await fake.mapAll();
  assert.equal(fake.submits(), 2); assert.equal(published, 0);
});

test('completions from a retired device epoch never publish, and an abort stops submission', async () => {
  const fake = fakeDevice(); let epoch = 1; const { r, events } = make(fake, { epoch: () => epoch }); let published = 0;
  r.onPublish(() => published++);
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });
  epoch = 2;
  for (let i = 0; i < 5; i++) await fake.completeOne();
  await fake.mapAll();
  assert.equal(published, 0); assert.ok(events.log.some(e => e.type === 'stale-band'));
  const fake2 = fakeDevice(), abort = createAbort(), { r: r2 } = make(fake2, { abort });
  abort.abort({ kind: 'stall', outstanding: [] });
  r2.render({ view: 'bulb-overview', profile: 'draft' });
  assert.equal(fake2.submits(), 0);
});

test('timestamp resolves use 256-byte destination offsets for every slot', async () => {
  const fake = fakeDevice({ timestamps: true }), { r } = make(fake);
  for (let i = 0; i < 12; i++) { r.render({ view: 'bulb-overview', profile: 'draft' }); await fake.completeOne(); }
  assert.ok(fake.submits() >= 12, 'resolves for slots 0..7 and wrap-around were encoded without an alignment error');
});

test('a timestamp readback whose mapping never resolves is a bounded harness timeout', async () => {
  const fake = fakeDevice({ timestamps: true }), { r } = make(fake);
  r.mapDeadlineMs = 50;
  const p = r.readTimestamps();
  await fake.completeOne();                                                           // the copy completes; the map never does
  await assert.rejects(p, /harness readback timeout/);
});

test('a current frame whose coverage mapping never resolves aborts the experiment within its deadline and publishes nothing', async () => {
  const fake = fakeDevice(), abort = createAbort(), { r } = make(fake, { abort }); let published = 0;
  r.mapDeadlineMs = 50; r.onPublish(() => published++);
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });
  await fake.completeOne(); await fake.completeOne();                                    // trace band and finish both complete
  await assert.rejects(abort.race(new Promise(() => {})), /aborted: harness/);           // the waiting driver is woken
  assert.equal(published, 0); assert.match(abort.invalidation(), /harness readback timeout/);
  assert.ok(r.ring.every(s => s.owner === null), 'the ring reservation is released');
});

test('a retired generation\'s mapping failure stays suppressed, and its slot is reusable: the late mapping is cancelled', async () => {
  const fake = fakeDevice(), abort = createAbort(), { r, events } = make(fake, { abort }); const published = [];
  r.mapDeadlineMs = 50; r.onPublish(p => published.push(p));
  const first = r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });
  await fake.completeOne(); await fake.completeOne();
  const second = r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });   // a newer request retires the first frame
  await new Promise(res => setTimeout(res, 120));
  assert.equal(abort.aborted, false); assert.ok(events.log.some(e => e.type === 'suppressed-publication'));
  assert.ok(r.ring.every(s => s.owner === null && s.buf.mapState === 'unmapped'), 'the timed-out mapping was cancelled, not left pending');
  await fake.mapAll();                                                                    // the stale mapping resolves late: it must not remap
  assert.ok(r.ring.every(s => s.buf.mapState === 'unmapped'), 'a late resolution cannot remap a released slot');
  await fake.completeOne(); await fake.completeOne();                                    // the newer frame's band and finish reuse the slot
  await fake.mapAll();
  assert.equal(abort.aborted, false);
  assert.deepEqual(published.map(p => p.requestId), [second]); assert.notEqual(first, second);
  assert.ok(published[0].counts, 'the reused slot was copied into while unmapped and published counts');
});

test('onPublish returns an unsubscribe function', async () => {
  const fake = fakeDevice(), { r } = make(fake); let calls = 0;
  const off = r.onPublish(() => calls++); off();
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });
  for (let i = 0; i < 4; i++) { await fake.completeOne(); await fake.mapAll(); }
  assert.equal(calls, 0);
});
