// spikes/project0/tests/resources-exercise.test.mjs — T8 fix round 1 (Codex T8 r1, findings 2 and 3): exerciseResources against a fake device.
// The fake records every dispatch and copy, models each texture by which rows were written with which pattern offset r, and serves the
// copied bytes in the texture's source format, so the A.8 copy layout (63 sample locations, 256-byte slots, full-band stride), the
// mixed-format decoding and the final 112-row write band are all exercised. Corrupted-byte and wrong-layout controls must fail. A cleanup
// whose GPU promises never resolve must still end on a later abort, destroying every resource and keeping both the error and the stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exerciseResources } from '../browser/drivers/resources.js';
import { createAllocator } from '../gpu/alloc.js';
import { createAbort } from '../gpu/abort.js';
import { metrics, maintenanceFailed } from '../measure/resources.mjs';

const fx = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
Object.assign(globalThis, {
  GPUTextureUsage: { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 },
  GPUBufferUsage: { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 },
  GPUMapMode: { READ: 1, WRITE: 2 },
});

const f32 = new Float32Array(1), f32u = new Uint32Array(f32.buffer);
const toF16 = v => { const e = Math.floor(Math.log2(v)); return ((e + 15) << 10) | Math.round((v / 2 ** e - 1) * 1024); };   // positive normals only (k + 0.25)
// The bytes of one texel in its source format: what copyTextureToBuffer writes. An unwritten row reads as zeros.
function texel(format, k) {
  const b = new ArrayBuffer(16), u8 = new Uint8Array(b), dv = new DataView(b);
  if (k === null) return u8.subarray(0, { r32float: 4, rgba16float: 8, r32uint: 4, rgba32float: 16, rgba8unorm: 4 }[format]);
  if (format === 'r32uint') { dv.setUint32(0, k, true); return u8.subarray(0, 4); }
  if (format === 'r32float') { dv.setFloat32(0, k + 0.25, true); return u8.subarray(0, 4); }
  if (format === 'rgba32float') { for (let c = 0; c < 4; c++) dv.setFloat32(4 * c, k + 0.25, true); return u8.subarray(0, 16); }
  if (format === 'rgba16float') { for (let c = 0; c < 4; c++) dv.setUint16(2 * c, toF16(k + 0.25), true); return u8.subarray(0, 8); }
  if (format === 'rgba8unorm') { u8.fill(k, 0, 4); return u8.subarray(0, 4); }
  throw new Error(`fake: format ${format}`);
}

// `corrupt(copy, bytes)` may alter the bytes a copy writes; `shift` misplaces every 1x1 sample by that many bytes (a wrong slot layout);
// `skipRowsFrom` drops dispatched rows at or past that row (a missing final band); `hang` makes every completion a promise that never settles,
// and `encodeFailsAt` throws from the nth createCommandEncoder.
function fakeDevice({ corrupt = () => {}, shift = 0, skipRowsFrom = Infinity, hang = false, encodeFailsAt = 0 } = {}) {
  const log = { dispatches: [], samples: [], bands: [], submits: 0, created: [], destroyed: 0 };
  let encoders = 0;
  const track = o => { log.created.push(o); const d = o.destroy ?? (() => {}); o.destroy = () => { log.destroyed++; d(); }; return o; };
  const device = {
    createTexture: ({ size: [width, height], format }) => track({ kind: 'texture', width, height, format, rows: new Int32Array(height).fill(-1), createView() { return { texture: this }; } }),
    createBuffer: ({ size }) => track({ kind: 'buffer', size, data: new Uint8Array(size), mapAsync: async () => {}, getMappedRange(offset = 0, n = size - offset) { return this.data.slice(offset, offset + n).buffer; }, unmap() {} }),
    createBindGroup: ({ entries }) => ({ entries }),
    createCommandEncoder() {
      if (++encoders === encodeFailsAt) throw new Error('encode failed');
      const ops = [];
      return {
        beginComputePass() {
          let pl = null, bind = null;
          return { setPipeline: p => { pl = p; }, setBindGroup: (_, g) => { bind = g; }, end() {},
            dispatchWorkgroups: (x, y) => ops.push({ kind: 'dispatch', format: pl.format, bind, x, y }) };
        },
        copyTextureToBuffer: (src, dst, size) => ops.push({ kind: 'copy', src, dst, size }),
        finish: () => ({ ops }),
      };
    },
    queue: {
      writeBuffer: (b, offset, data, dataOffset, n) => b.data.set(new Uint8Array(data, dataOffset, n), offset),
      submit([{ ops }]) {
        log.submits++;
        for (const op of ops) {
          if (op.kind === 'dispatch') {
            const [u, tv] = [op.bind.entries.find(e => e.binding === 0).resource.buffer, op.bind.entries.find(e => e.binding === 1).resource];
            const [r, row0, rows, width] = new Uint32Array(u.data.buffer, 0, 4), tex = tv.texture;
            assert.equal(op.format, tex.format, 'the pipeline matches the bound texture format');
            log.dispatches.push({ format: tex.format, r, row0, rows, width, x: op.x, y: op.y });
            if (op.x * 16 >= width && op.y * 16 >= rows) for (let y = row0; y < row0 + rows && y < tex.height; y++) if (y < skipRowsFrom) tex.rows[y] = r;
            continue;
          }
          const { texture: tex, origin = [0, 0] } = op.src, [w, h] = op.size, at = op.dst.offset ?? 0;
          const k = (x, y) => tex.rows[y] < 0 ? null : (13 * x + 17 * y + tex.rows[y]) % 251;
          if (w === 1 && h === 1) {
            const bytes = texel(tex.format, k(origin[0], origin[1])).slice(); corrupt({ tex, x: origin[0], y: origin[1] }, bytes);
            op.dst.buffer.data.set(bytes, at + shift); log.samples.push({ format: tex.format, x: origin[0], y: origin[1], offset: at });
          } else {
            const stride = op.dst.bytesPerRow; log.bands.push({ format: tex.format, w, h, stride, offset: at });
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const bytes = texel(tex.format, k(x, y)).slice(); corrupt({ tex, x, y, band: true }, bytes); op.dst.buffer.data.set(bytes, at + y * stride + x * bytes.length); }
          }
        }
      },
      onSubmittedWorkDone: () => hang ? new Promise(() => {}) : Promise.resolve(),
    },
  };
  const prepared = { pipelines: Object.fromEntries(['r32float', 'rgba16float', 'r32uint', 'rgba32float', 'rgba8unorm'].map(format => [format, { format, getBindGroupLayout: () => ({}) }])) };
  return { device, prepared, log };
}
const watchdog = { submitted: () => () => {} };
const run = async (opts = {}, abort = createAbort()) => {
  const f = fakeDevice(opts), alloc = createAllocator({ capBytes: fx.resources.capBytes });
  const raw = await exerciseResources(f.device, alloc, watchdog, abort, fx, f.prepared, () => {}, { mapDeadlineMs: 1000 });
  return { ...f, raw, alloc };
};
const held = i => ({ bytes: i.bytes, textures: i.textures, buffers: i.buffers });
const R = fx.resources, TEXTURES = R.entries.filter(e => e.kind === 'texture');

test('the A.8 exercise writes every texture in 256-row bands ending with a 112-row band, and passes every G11 rule on correct bytes', async () => {
  const { raw, log, alloc } = await run();
  assert.deepEqual(raw.errors, []);
  // Writes: per texture, rows 0, 256, ..., 2048, the last band 2160 - 2048 = 112 rows; the pattern offset r is the texture's index.
  const writes = log.dispatches.slice(0, 63);
  TEXTURES.forEach((e, r) => {
    const mine = writes.filter(d => d.r === r);
    assert.deepEqual(mine.map(d => [d.format, d.row0, d.rows, d.width, d.x, d.y]),
      Array.from({ length: 9 }, (_, i) => [e.format, 256 * i, i < 8 ? 256 : 112, 3840, 240, i < 8 ? 16 : 7]), e.name);
  });
  // Sample copies: per texture, the 9 frozen locations in y-major order, at 256-byte slots 0..8 of the staging buffer.
  const points = R.readback.y.flatMap(y => R.readback.x.map(x => [x, y]));
  assert.equal(log.samples.length, 63);
  TEXTURES.forEach((e, t) => assert.deepEqual(log.samples.slice(9 * t, 9 * t + 9).map(s => [s.format, s.x, s.y, s.offset]), points.map(([x, y], i) => [e.format, x, y, 256 * i]), e.name));
  assert.deepEqual(raw.checks.map(c => [c.texture, c.x, c.y]), TEXTURES.flatMap(e => points.map(([x, y]) => [e.name, x, y])));
  // The full band: the display texture, 3840 x 256 at the frozen 15,360-byte stride, into the second staging buffer.
  assert.deepEqual(log.bands, [{ format: 'rgba8unorm', w: 3840, h: 256, stride: 15360, offset: 0 }]);
  assert.equal(raw.bandOk, true);
  // Cancellation: exactly two rewrites submitted, none after; at most two outstanding.
  assert.deepEqual(raw.cancel, { before: 2, after: 0 }); assert.equal(log.dispatches.length, 65); assert.ok(raw.outstandingMax <= 2);
  // Cleanup: every texture and buffer the exercise allocated is destroyed; the inventory returns to its starting point.
  assert.equal(log.destroyed, log.created.length); assert.deepEqual(held(raw.after), held(raw.before)); assert.equal(alloc.inventory().bytes, 0);
  assert.deepEqual(metrics('G11', '4k', raw, fx), { tableBytes: 405995520, peakBytes: raw.peakBytes, texturesWritten: 7, selectedChecks: 63, mismatches: 0, fullBandBytes: 3932160, cancelled: 1, released: 1, outstandingMax: 2 });
  assert.ok(raw.peakBytes >= 405995520 && raw.peakBytes <= 2 ** 30, String(raw.peakBytes));
  assert.equal(maintenanceFailed(raw, fx), false);
});

test('controls: a corrupted byte in any source format, a wrong slot layout or a missing final band is a mismatch', async () => {
  const one = (format, x, y, channelByte) => ({ corrupt: (c, bytes) => { if (!c.band && c.tex.format === format && c.x === x && c.y === y && c.tex.rows[y] >= 0) bytes[channelByte] ^= 1; } });
  const cases = [
    ['r32float low byte', one('r32float', 1920, 1080, 0), 1],
    ['r32uint', one('r32uint', 3839, 2159, 0), 1],
    ['rgba16float alpha channel (every channel decoded)', one('rgba16float', 0, 0, 6), 2],      // normal and orbit are both rgba16float
    ['rgba32float blue channel', one('rgba32float', 0, 2159, 8), 1],
    ['rgba8unorm green channel', one('rgba8unorm', 3839, 0, 1), 2],                            // display and retained are both rgba8unorm
    ['the full band, last row', { corrupt: (c, bytes) => { if (c.band && c.x === 3839 && c.y === 255) bytes[0] ^= 1; } }, 1],
    ['every sample 4 bytes off its 256-byte slot', { shift: 4 }, null],
    ['no rows written in the final 112-row band', { skipRowsFrom: 2048 }, 21],                  // y = 2159 at three x, in all seven textures
  ];
  for (const [name, opts, expected] of cases) {
    const { raw } = await run(opts);
    const m = metrics('G11', '4k', raw, fx);
    if (expected === null) assert.ok(m.mismatches > 0, name); else assert.equal(m.mismatches, expected, name);
    assert.equal(maintenanceFailed(raw, fx), true, name);
  }
});

test('an encoding failure with completions that never settle still ends on a later abort: every resource destroyed, error and stop both kept', async () => {
  const abort = createAbort();
  setTimeout(() => abort.abort({ kind: 'stall', outstanding: [] }), 20);           // the session watchdog, 5 s later in a real run
  let f, alloc;
  const pending = (async () => {
    f = fakeDevice({ hang: true, encodeFailsAt: 3 }); alloc = createAllocator({ capBytes: fx.resources.capBytes });
    return exerciseResources(f.device, alloc, watchdog, abort, fx, f.prepared, () => {}, { mapDeadlineMs: 1000 });
  })();
  const raw = await Promise.race([pending, new Promise(r => setTimeout(() => r('hung'), 1000))]);
  assert.notEqual(raw, 'hung', 'the cleanup must not wait for GPU promises after the abort');
  assert.equal(f.log.submits, 2, 'two submissions were outstanding when encoding failed');
  assert.deepEqual(raw.errors, ['encode failed', 'no observable progress for 5 s: []']);
  assert.equal(f.log.destroyed, f.log.created.length); assert.deepEqual(held(raw.after), held(raw.before)); assert.equal(alloc.inventory().bytes, 0);
  assert.throws(() => metrics('G11', '4k', raw, fx), /encode failed; no observable progress for 5 s/);
});
