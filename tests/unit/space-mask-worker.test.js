import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaskProcessor } from '../../src/space/render/mask-processor.js';

// A main-thread sample may take longer than 4 ms end-to-end. The smoke limit is
// main-thread scheduling delay: transfer the owned bytes, never scan/copy pixels.
test('B15-R16-F8 Worker transport removes per-sample pixel work from the four millisecond main-thread budget', async () => {
  const size = { width: 1280, height: 720 }, pixels = size.width * size.height;
  const bytes = new Uint8Array(pixels * 4), sent = [];
  const worker = { postMessage(message, transfers = []) { sent.push(structuredClone(message, { transfer: transfers })); }, terminate() {} };
  const processor = createMaskProcessor({ createWorker: () => worker });
  let pending;
  try {
    const masks = processor.open(size, { strict: true });
    pending = masks.ingest({ accumulationKey: 'settled', sample: 0 }, 'status', { x: 0, y: 0, ...size }, bytes);
    pending.catch(() => {});
    assert.equal(bytes.byteLength, 0, 'the full readback must transfer ownership instead of remaining on the main thread');
    assert.equal(sent.length, 1, 'one metadata envelope regardless of pixel count');
    assert.equal(masks.closed({ accumulationKey: 'settled', sample: 0 }), false, 'no validation before Worker acknowledgement');
  } finally { processor.destroy(); await pending?.catch(() => {}); }
});

import { createNodeMaskWorker } from '../support/node-mask-worker.mjs';
import { createOutcomeMasks } from '../../src/space/render/outcome-masks.js';
import { packStatus, packLightingStatus } from '../../src/space/render/status.js';
import { packRecoveryWord } from '../../src/space/render/webgpu/passes.js';

const sampleId = sample => ({ accumulationKey: 'worker-samples', sample });
const u32 = values => new Uint8Array(Uint32Array.from(values).buffer);

test('B15-R16-F8 real CPU Worker owns full-resolution masks across samples without main-thread pixel allocation or decode', async () => {
  const workers = [], processor = createMaskProcessor({ createWorker: () => { const w = createNodeMaskWorker(); workers.push(w); return w; } });
  const size = { width: 1280, height: 720 }, region = { x: 0, y: 0, ...size }, pixels = size.width * size.height;
  // Allocate synthetic readback input before guarding the main-thread mask path.
  const data = Array.from({ length: 2 }, () => ({ status: new Uint8Array(pixels * 4), normal: new Uint8Array(pixels * 8), lightingStatus: new Uint8Array(pixels * 4) }));
  const DataViewBefore = globalThis.DataView, Uint16Before = globalThis.Uint16Array, Uint32Before = globalThis.Uint32Array;
  let ticks = 0; const timer = setInterval(() => ticks++, 1);
  try {
    globalThis.DataView = class { constructor() { assert.fail('per-pixel decode on the main thread'); } };
    for (const [key, Base] of [['Uint16Array', Uint16Before], ['Uint32Array', Uint32Before]]) globalThis[key] = class extends Base {
      constructor(...args) { assert.ok(!(typeof args[0] === 'number' && args[0] > 512), 'full-frame mask allocation on main'); super(...args); }
    };
    const masks = processor.open(size);
    for (let sample = 0; sample < 2; sample++) {
      for (const [field, bytes] of Object.entries(data[sample])) { await masks.ingest(sampleId(sample), field, region, bytes); assert.equal(bytes.byteLength, 0); }
      assert.equal(masks.closed(sampleId(sample)), true);
      assert.equal(masks.snapshot().union.hits, pixels);
      assert.equal(masks.snapshot().union.samples, sample + 1);
      assert.equal(masks.counts().unavailableNormals, pixels);
    }
    assert.equal(workers.length, 1, 'one persistent worker across samples');
    assert.ok(ticks > 0, 'main-thread timers run during off-thread sample work');
  } finally {
    globalThis.DataView = DataViewBefore; globalThis.Uint16Array = Uint16Before; globalThis.Uint32Array = Uint32Before;
    clearInterval(timer); processor.destroy(); await Promise.all(workers.map(w => w.stopped));
  }
});

test('B15-R16-F8 Worker matches direct full decode for tiled mixed outcomes reasons normals and recovery unions', async () => {
  const worker = createNodeMaskWorker(), processor = createMaskProcessor({ createWorker: () => worker });
  try {
    const size = { width: 65, height: 17 }, remote = processor.open(size, { recovery: true }), direct = createOutcomeMasks(size, { recovery: true, strict: true });
    for (let sample = 0; sample < 3; sample++) for (const field of ['normal', 'recovery', 'lightingStatus', 'status']) for (let y = 16; y >= 0; y--) {
      const region = { x: 0, y, width: 65, height: 1 }, bytes = new Uint8Array(65 * (field === 'normal' ? 8 : 4)), view = new DataView(bytes.buffer);
      for (let x = 0; x < 65; x++) {
        const n = (y * 65 + x + sample) % 4;
        if (field === 'normal') view.setUint16(x * 8 + 6, x % 3 ? 0 : 0x3c00, true);
        else {
          const word = field === 'status' ? packStatus({ status: n, reason: n === 2 ? 1 : 0, subreason: 0, steps: 3 })
            : field === 'lightingStatus' ? (n === 0 ? packLightingStatus({ shadow: { status: 2, reason: 3, subreason: 0 }, ao: { status: 3, reason: 0, subreason: 0 } }) : 0)
            : n === 0 ? packRecoveryWord({ attempted: true, outcome: 'approximate hit', stop: 'none', midpoints: 2, encounters: 1 }) : 0;
          view.setUint32(x * 4, word, true);
        }
      }
      direct.ingestSync(sampleId(sample), field, region, bytes);
      await remote.ingest(sampleId(sample), field, region, bytes);
      if (direct.closed(sampleId(sample))) {
        assert.deepEqual(remote.snapshot(), direct.snapshot()); assert.deepEqual(remote.counts(), direct.counts());
      }
    }
  } finally { processor.destroy(); await worker.stopped; }
});

function controlled() {
  const messages = [], workers = [];
  const processor = createMaskProcessor({ createWorker: () => {
    const worker = { postMessage(value, transfer = []) { messages.push(structuredClone(value, { transfer })); }, terminate() { this.terminated = true; } };
    workers.push(worker); return worker;
  } });
  const send = (session, sample = 0) => session.ingest(sampleId(sample), 'status', { x: 0, y: 0, width: 1, height: 1 }, new Uint8Array(4));
  const ack = (message, patch = {}) => workers.at(-1).onmessage({ data: { session: message.session, sequence: message.sequence, id: message.id, closed: false, ...patch } });
  return { processor, messages, workers, send, ack, open: () => processor.open({ width: 1, height: 1 }) };
}

test('B15-R16-F8 Worker cancellation ignores late replies and leaves a sibling session usable', async () => {
  const h = controlled();
  try {
    const a = h.open(), b = h.open(), pa = h.send(a), pb = h.send(b), [ma, mb] = h.messages;
    const rejected = assert.rejects(pa, /cancelled/); a.close('cancelled'); await rejected;
    h.ack(ma); assert.equal(a.closed(sampleId(0)), false);
    h.ack(mb); await pb;
    assert.equal(h.workers.length, 1); assert.equal(h.workers[0].terminated, undefined);
    b.close();
  } finally { h.processor.destroy(); }
});

for (const event of ['onerror', 'onmessageerror', 'reset', 'destroy']) test(`B15-R16-F8 Worker ${event} rejects pending leases and fences stale callbacks`, async () => {
  const h = controlled();
  try {
    const a = h.open(), b = h.open(), pa = h.send(a), pb = h.send(b);
    const rejected = Promise.all([assert.rejects(pa), assert.rejects(pb)]), staleCallback = h.workers[0].onmessage;
    if (event === 'reset' || event === 'destroy') h.processor[event](); else h.workers[0][event]({ message: 'injected failure' });
    await rejected; assert.equal(h.workers[0].terminated, true);
    staleCallback({ data: { ...h.messages[0], closed: true, snapshot: {} } });
    assert.equal(a.closed(sampleId(0)), false);
    if (event !== 'destroy') { const c = h.open(), pc = h.send(c); h.ack(h.messages.at(-1)); await pc; assert.equal(h.workers.length, 2); }
    else assert.throws(() => h.open(), /destroyed/);
  } finally { h.processor.destroy(); }
});

test('B15-R16-F8 Worker rejects identity mismatch incomplete validation and unowned input buffers', async () => {
  for (const patch of [{ session: -1 }, { id: sampleId(4) }, { closed: true }, { error: 'invalid recovery word' }]) {
    const h = controlled();
    try { const a = h.open(), result = h.send(a); h.ack(h.messages[0], patch); await assert.rejects(result); assert.equal(a.closed(sampleId(0)), false); }
    finally { h.processor.destroy(); }
  }
  const h = controlled();
  try {
    const bytes = new Uint8Array(8);
    await assert.rejects(h.open().ingest(sampleId(0), 'status', { x: 0, y: 0, width: 1, height: 1 }, bytes.subarray(0, 4)), /owned complete/);
    assert.equal(bytes.byteLength, 8); assert.equal(h.messages.length, 0);
  } finally { h.processor.destroy(); }
});

test('B15-R16-F8 unavailable Worker fails closed instead of decoding on the main thread', async () => {
  const processor = createMaskProcessor({ createWorker: () => { throw new Error('Worker unavailable'); } });
  try { await assert.rejects(processor.open({ width: 1, height: 1 }).ingest(sampleId(0), 'status', { x: 0, y: 0, width: 1, height: 1 }, new Uint8Array(4)), /Worker unavailable/); }
  finally { processor.destroy(); }
});

test('B15-R16-F8 Worker accepts at most two in-flight readbacks and recovers after post failure', async () => {
  const h = controlled();
  try {
    const a = h.open(), b = h.open(), c = h.open(), pa = h.send(a), pb = h.send(b);
    await assert.rejects(h.send(c), /two readback lease/);
    assert.equal(h.messages.filter(m => m.type === 'record').length, 2);
    h.ack(h.messages[0]); h.ack(h.messages[1]); await Promise.all([pa, pb]);
    h.workers[0].postMessage = () => { throw new Error('post failed'); };
    await assert.rejects(h.send(a, 1), /post failed/);
    assert.equal(h.workers[0].terminated, true);
    const result = h.send(h.open()); h.ack(h.messages.at(-1)); await result; assert.equal(h.workers.length, 2);
  } finally { h.processor.destroy(); }
});

test('B15-R16-F8 real Worker rejects invalid terminal recovery evidence before marking the sample closed', async () => {
  const worker = createNodeMaskWorker(), processor = createMaskProcessor({ createWorker: () => worker });
  try {
    const masks = processor.open({ width: 1, height: 1 }, { recovery: true }), id = sampleId(0), region = { x: 0, y: 0, width: 1, height: 1 };
    await masks.ingest(id, 'status', region, u32([packStatus({ status: 1, reason: 0, subreason: 0, steps: 3 })]));
    await masks.ingest(id, 'normal', region, new Uint8Array(8));
    await masks.ingest(id, 'lightingStatus', region, u32([0]));
    const recovery = packRecoveryWord({ attempted: true, outcome: 'approximate hit', stop: 'none', midpoints: 1, encounters: 1 });
    await assert.rejects(masks.ingest(id, 'recovery', region, u32([recovery])), /disagrees with the primary status/);
    assert.equal(masks.closed(id), false); assert.equal(masks.snapshot(), null);
  } finally { processor.destroy(); await worker.stopped; }
});


test('R16-C3 two concurrent sessions share two leases without mixing validation or counts', async () => {
  const { createMaskWorkerHandler } = await import('../../src/space/render/mask-worker-service.js');
  const h = controlled(), handle = createMaskWorkerHandler();
  try {
    const a = h.open(), b = h.open(), region = { x: 0, y: 0, width: 1, height: 1 };
    for (const field of ['status', 'normal', 'lightingStatus']) {
      const pa = a.ingest(sampleId(0), field, region, new Uint8Array(field === 'normal' ? 8 : 4));
      const pb = b.ingest(sampleId(0), field, region, field === 'status' ? u32([packStatus({ status: 1, reason: 0, subreason: 0, steps: 1 })]) : new Uint8Array(field === 'normal' ? 8 : 4));
      const records = h.messages.filter(m => m.type === 'record').slice(-2);
      assert.notEqual(records[0].session, records[1].session);
      assert.equal(a.closed(sampleId(0)), false);
      assert.equal(b.closed(sampleId(0)), false);
      // Replies can be observed independently; neither session owns the other.
      h.ack(records[1], handle(records[1])); await pb;
      assert.equal(a.closed(sampleId(0)), false);
      h.ack(records[0], handle(records[0])); await pa;
    }
    assert.equal(a.closed(sampleId(0)), true); assert.equal(b.closed(sampleId(0)), true);
    assert.equal(a.snapshot().union.hits, 1); assert.equal(b.snapshot().union.hits, 0);
    assert.notDeepEqual(a.counts(), b.counts());
    assert.equal(h.workers.length, 1);
  } finally { h.processor.destroy(); }
});


test('B15-R24 Worker service selects the unsliced typed-array decoder', async () => {
  const { createMaskWorkerHandler } = await import('../../src/space/render/mask-worker-service.js');
  const handle = createMaskWorkerHandler(), id = sampleId(0), size = { width: 3, height: 1 }, region = { x: 0, y: 0, ...size };
  const fields = [['status', u32([0, 1, 0x12])], ['normal', new Uint8Array(24)], ['lightingStatus', u32([0, 0, 0])]];
  const before16 = DataView.prototype.getUint16, before32 = DataView.prototype.getUint32;
  let reads = 0, reply;
  try {
    DataView.prototype.getUint16 = function (...args) { reads++; return before16.apply(this, args); };
    DataView.prototype.getUint32 = function (...args) { reads++; return before32.apply(this, args); };
    for (const [sequence, [field, bytes]] of fields.entries()) {
      reply = handle({ type: 'record', session: 1, sequence, id, field, region, bytes,
        ...(sequence === 0 ? { setup: { size, options: { strict: true } } } : {}) });
      assert.equal(reply.error, undefined); assert.equal(reply.closed, sequence === 2);
    }
  } finally { DataView.prototype.getUint16 = before16; DataView.prototype.getUint32 = before32; }
  assert.equal(reply.snapshot.union.pixels, 3); assert.equal(reply.counts.rayTermination.unresolved.pointBudget, 1);
  assert.equal(reads, 0, 'the production service must select the fast decoder, not just expose an unused factory');
});
