// spikes/project0/tests/renderer-r1.test.mjs — T7 fix round 1 (Codex T7 r1, four Important findings in gpu/renderer.js). The same deterministic
// fake device as renderer.test.mjs, extended so a queue completion can also be *rejected* (failOne). Completions and mappings settle only
// when the test says so; every test asserts the actual pending submissions, credits, ring reservations and publications.
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
    createBuffer: d => { const b = { size: d.size, mapState: 'unmapped', destroyed: false, destroy() { b.destroyed = true; },
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
    queue: { submit() { submits++; }, writeBuffer() {}, onSubmittedWorkDone: () => { const p = new Promise((res, rej) => pending.push({ res, rej })); peakPending = Math.max(peakPending, pending.length); return p; } },
  };
  const tick = () => new Promise(r => setImmediate(r));
  return { device, submits: () => submits, pendingNow: () => pending.length, peakPending: () => peakPending,
    completeOne: async () => { pending.shift()?.res(); await tick(); },
    failOne: async (message = 'OperationError: queue completion rejected') => { pending.shift()?.rej(new Error(message)); await tick(); },
    mapAll: async () => { while (maps.length) maps.shift().res(); await tick(); } };
}
const fixtures = { views: { 'bulb-overview': { camera: { origin: [1.92, -1.44, 0.7], target: [0, 0, 0] } } }, profiles: { draft: { W: 64, H: 64, iterations: 64, steps: 256, k: 0.9, floor: 1e-6, factor: 0.5 } } };
const pipeline = { getBindGroupLayout: () => ({}) };
const viewport = { bulb: pipeline, sphere: pipeline, shade: pipeline, blit: pipeline };
const SMALL = { view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } };   // one band
const LARGE = { view: 'bulb-overview', profile: 'draft' };                              // 64x64: many bands
function make(fake, { epoch = () => 1, abort, watchdog = createWatchdog({ every: null }), alloc = createAllocator({ capBytes: 2 ** 30 }) } = {}) {
  const events = { log: [], mark(type, f = {}) { const e = { type, t: performance.now(), ...f }; this.log.push(e); return e; } };
  const canvas = { width: 1280, height: 720, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) };
  const r = new Renderer({ device: fake.device, viewport, canvas, fixtures, events, alloc, watchdog, abort, epoch });
  return { r, events };
}
// Unhandled rejections during a test are a defect (finding 4): collect them for the duration of fn.
async function noUnhandled(fn) {
  const seen = [], on = e => seen.push(e); process.on('unhandledRejection', on);
  try { await fn(); await new Promise(r => setTimeout(r, 10)); } finally { process.off('unhandledRejection', on); }
  assert.deepEqual(seen.map(e => e?.message ?? String(e)), [], 'no unhandled rejections');
}

// Finding 1: the readback ring is part of a finish's admission, like its credit. A finish without a reservation would publish no counts.
test('r1/1: with all three ring slots held by delayed mappings, a fourth generation waits for a reservation and never publishes without counts', async () => {
  const fake = fakeDevice(), { r } = make(fake); const published = [];
  r.onPublish(p => published.push(p));
  for (let g = 1; g <= 3; g++) { r.render(SMALL); await fake.completeOne(); await fake.completeOne(); }   // band, finish; the mapping is held
  assert.ok(r.ring.every(s => s.owner !== null), 'three delayed mappings hold the ring');
  const fourth = r.render(SMALL);
  await fake.completeOne();                                                                               // the fourth band completes
  assert.equal(fake.pendingNow(), 0, 'the fourth finish is not submitted without a ring reservation');
  assert.equal(published.length, 0, 'nothing publishes, in particular not with counts: null');
  await fake.mapAll();                                                                                    // the retired mappings settle and release
  assert.equal(fake.pendingNow(), 1, 'a released reservation wakes the waiting finish');
  await fake.completeOne(); await fake.mapAll();
  assert.deepEqual(published.map(p => p.requestId), [fourth]);
  assert.ok(published.every(p => p.counts && typeof p.counts.total === 'number'), 'every publication carries counts');
});

// Finding 2a: the timestamp copy is a submission and takes the session ledger's credit.
test('r1/2a: readTimestamps() with two bands outstanding waits for credit: pending submissions and outstandingMax stay at most two', async () => {
  const fake = fakeDevice({ timestamps: true }), { r } = make(fake);
  r.render(LARGE);
  assert.equal(fake.pendingNow(), 2);
  let result = null; const p = r.readTimestamps().then(x => (result = x));
  await new Promise(res => setImmediate(res));
  assert.equal(fake.pendingNow(), 2, 'the copy is not submitted beside two outstanding bands');
  for (let i = 0; i < 200 && (fake.pendingNow() || result === null); i++) { await fake.completeOne(); await fake.mapAll(); assert.ok(fake.pendingNow() <= 2); }
  await p;
  assert.equal(result.method, 'timestamp-query');
  assert.ok(fake.peakPending() <= 2, `peak pending ${fake.peakPending()}`);
  assert.ok(r.stats().outstandingMax <= 2, `outstandingMax ${r.stats().outstandingMax}`);
  assert.equal(r.ledger.outstanding(), 0, 'the copy released its own credit');
});

// Finding 2b: a snapshot describes exactly the bands submitted before its copy; a band submitted later never receives its values.
test('r1/2b: a delayed timestamp snapshot fills only the bands it copied, never a later generation\'s band', async () => {
  const fake = fakeDevice({ timestamps: true }), { r } = make(fake);
  // Copied before anything was rendered: the snapshot owns no band.
  const empty = r.readTimestamps(); await fake.completeOne();                                           // the copy completes; the map is held
  r.render(SMALL); await fake.completeOne();                                                             // a new band completes (slot 0)
  await fake.mapAll(); const a = await empty;
  assert.equal(a.filled, 0); assert.equal(r.stats().bands[0].gpuMs, null);
  await fake.completeOne(); await fake.mapAll();                                                         // finish the first frame
  // Copied after the first band: it owns that band only, not the band rendered while its mapping is delayed (slot 1).
  const one = r.readTimestamps(); await fake.completeOne();
  r.render(SMALL); await fake.completeOne();
  await fake.mapAll(); const b = await one;
  assert.equal(b.filled, 1);
  const [first, second] = r.stats().bands;
  assert.equal(typeof first.gpuMs, 'number'); assert.equal(second.gpuMs, null, 'the later generation\'s band keeps no snapshot value');
});

// Finding 3: a renderer belongs to the device epoch it was constructed in.
test('r1/3: after its device epoch retires, the renderer refuses new requests (no submission, no publication), and old completions stay stale', async () => {
  const fake = fakeDevice(); let epoch = 1; const { r, events } = make(fake, { epoch: () => epoch }); const published = [];
  r.onPublish(p => published.push(p));
  r.render(SMALL);
  assert.equal(fake.submits(), 1);
  epoch = 2;
  assert.throws(() => r.render(SMALL), /device epoch 1 has retired/);
  assert.equal(events.log.filter(e => e.type === 'request').length, 2, 'the refused request is still recorded at entry');
  assert.equal(fake.submits(), 1, 'nothing is submitted on the old device for the new epoch');
  for (let i = 0; i < 4; i++) { await fake.completeOne(); await fake.mapAll(); }
  assert.equal(fake.submits(), 1); assert.equal(published.length, 0);
  assert.ok(events.log.some(e => e.type === 'stale-band'));
  assert.ok(!events.log.some(e => e.type === 'submit' && e.epoch === 2), 'no submission is labelled with the new epoch');
});

// Finding 4: a rejected completion settles its own credit, watchdog registration and resources exactly once, and aborts a current failure.
test('r1/4a: a rejected band completion releases its credit and watchdog registration, aborts the session, and submits nothing further', async () => {
  await noUnhandled(async () => {
    let clock = 0; const stalls = [];
    const watchdog = createWatchdog({ every: null, stallMs: 10, now: () => clock, onStall: s => stalls.push(s) });
    const fake = fakeDevice(), abort = createAbort(), { r, events } = make(fake, { abort, watchdog }); let published = 0;
    r.onPublish(() => published++);
    r.render(LARGE);
    assert.equal(r.ledger.outstanding(), 2);
    await fake.failOne();
    assert.equal(abort.aborted, true); assert.match(abort.invalidation(), /submission-failed/);
    assert.equal(r.ledger.outstanding(), 1, 'the rejected band released exactly its own credit');
    assert.ok(events.log.some(e => e.type === 'submission-failed' && e.kind === 'band' && e.current === true));
    await fake.completeOne();
    assert.equal(r.ledger.outstanding(), 0); assert.equal(fake.submits(), 2, 'an aborted renderer submits nothing more');
    clock = 1000; watchdog.check();
    assert.equal(stalls.length, 0, 'both watchdog registrations were settled');
    assert.equal(published, 0);
  });
});

test('r1/4b: a rejected finish releases its credit and ring reservation, aborts, and publishes nothing', async () => {
  await noUnhandled(async () => {
    const fake = fakeDevice(), abort = createAbort(), { r } = make(fake, { abort }); let published = 0;
    r.onPublish(() => published++);
    r.render(SMALL); await fake.completeOne();                                                          // band done: the finish is submitted
    assert.equal(fake.pendingNow(), 1); assert.ok(r.ring.some(s => s.owner !== null));
    await fake.failOne();
    assert.equal(abort.aborted, true); assert.match(abort.invalidation(), /submission-failed/);
    assert.equal(r.ledger.outstanding(), 0); assert.ok(r.ring.every(s => s.owner === null), 'the reservation is released');
    await fake.mapAll();
    assert.equal(published, 0);
  });
});

test('r1/4c: a retired generation\'s rejected completion is suppressed without aborting; the current generation still publishes', async () => {
  await noUnhandled(async () => {
    const fake = fakeDevice(), abort = createAbort(), { r, events } = make(fake, { abort }); const published = [];
    r.onPublish(p => published.push(p));
    r.render(SMALL);
    const second = r.render(SMALL);                                                                     // retires the first; its band is still pending
    await fake.failOne();                                                                               // the first generation's band rejects
    assert.equal(abort.aborted, false);
    assert.ok(events.log.some(e => e.type === 'submission-failed' && e.current === false));
    for (let i = 0; i < 4; i++) { await fake.completeOne(); await fake.mapAll(); }
    assert.deepEqual(published.map(p => p.requestId), [second]); assert.ok(published[0].counts);
    assert.equal(r.ledger.outstanding(), 0);
  });
});

// T7 fix round 2 (Codex T7 r2, finding 5): a rejected timestamp copy in the live epoch latches the abort before anything can pump, so no
// further submission follows the failure; its credit and watchdog registration settle exactly once. After destroy() it only cleans up.
test('r2/5: a rejected timestamp readback aborts before any further submission and settles its credit and watchdog once', async () => {
  await noUnhandled(async () => {
    let clock = 0; const stalls = [];
    const watchdog = createWatchdog({ every: null, stallMs: 10, now: () => clock, onStall: s => stalls.push(s) });
    const fake = fakeDevice({ timestamps: true }), abort = createAbort(), { r, events } = make(fake, { abort, watchdog });
    const p = r.readTimestamps(); const outcome = p.then(() => 'resolved', e => e.message);
    r.render(LARGE);                                                                                    // the copy holds one credit, one band the other
    assert.equal(fake.submits(), 2); assert.equal(r.ledger.outstanding(), 2);
    await fake.failOne();                                                                               // the copy's completion rejects
    assert.equal(abort.aborted, true, 'the failure is latched'); assert.match(abort.invalidation(), /submission-failed/);
    assert.equal(fake.submits(), 2, 'nothing is submitted after the failure');
    assert.ok(events.log.some(e => e.type === 'submission-failed' && e.kind === 'timestamp-readback' && e.current === true));
    assert.notEqual(await outcome, 'resolved');
    assert.equal(r.ledger.outstanding(), 1, 'the copy released exactly its own credit');
    await fake.completeOne();
    assert.equal(r.ledger.outstanding(), 0); assert.equal(fake.submits(), 2);
    clock = 1000; watchdog.check(); assert.equal(stalls.length, 0, 'both watchdog registrations were settled');
  });
});

test('r2/5b: after destroy(), a rejected timestamp readback only cleans up: no abort', async () => {
  await noUnhandled(async () => {
    const fake = fakeDevice({ timestamps: true }), abort = createAbort(), { r } = make(fake, { abort });
    const outcome = r.readTimestamps().then(() => 'resolved', e => e.message);
    r.destroy();
    await fake.failOne();
    assert.equal(abort.aborted, false); assert.equal(r.ledger.outstanding(), 0);
    assert.notEqual(await outcome, 'resolved');
  });
});

// T7 fix round 3 (Codex T7 r3, finding 7): an exception thrown by the copy's completion handler (here the pump's next band hitting the
// allocation cap) rejects readTimestamps() through the caller's normal failure path; it is never an unhandled rejection beside a success.
test('r3/7: a pump failure in the timestamp copy\'s completion handler rejects the readback, with no unhandled rejection', async () => {
  await noUnhandled(async () => {
    const fake = fakeDevice({ timestamps: true }), alloc = createAllocator({ capBytes: 2 ** 30 }), { r } = make(fake, { alloc });
    const outcome = r.readTimestamps().then(x => `resolved ${JSON.stringify(x)}`, e => e.message);
    r.render(LARGE);                                                                                    // the copy and one band hold both credits
    alloc.buffer(fake.device, { size: 2 ** 30 - alloc.inventory().bytes, usage: 0 });                   // no allowance left for the next band
    await fake.completeOne();                                                                           // the copy completes; its pump throws
    await fake.mapAll();
    assert.match(await outcome, /allocation cap exceeded/);
    assert.equal(r.ledger.outstanding(), 1, 'the copy released its own credit; the band still holds its own');
  });
});
