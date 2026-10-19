// spikes/project0/tests/png.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePng, classify } from '../measure/png.mjs';
function crc32(buf) { let c, crc = 0xffffffff; for (const byte of buf) { c = (crc ^ byte) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(width, rows) {   // rows: [{filter, bytes(RGBA)}]
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(rows.length, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.concat(rows.map(r => Buffer.from([r.filter, ...r.bytes])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
test('decodes filter 0 and filter 1 (sub) rows and classifies the diagnostic colours', () => {
  const magenta = [255, 0, 255, 255], red = [255, 0, 0, 255];
  const row0 = { filter: 0, bytes: [...magenta, ...red] };
  const row1 = { filter: 1, bytes: [128, 128, 128, 255, 2, 2, 2, 0] };                    // second pixel = first + (2,2,2,0) = (130,130,130,255)
  const img = decodePng(png(2, [row0, row1]));
  assert.equal(img.width, 2); assert.equal(img.height, 2);
  assert.deepEqual([...img.rgba.subarray(12, 16)], [130, 130, 130, 255]);
  assert.deepEqual(classify(img), { background: 0, unresolved: 1, failure: 1, unavailableNormal: 1, shaded: 1 });
});
