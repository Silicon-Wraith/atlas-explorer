// spikes/project0/measure/png.mjs — minimal PNG decoder (8-bit RGB/RGBA, filters 0–4) for presented-canvas screenshots, and the
// same colour classes as the in-page storage capture.
import { inflateSync } from 'node:zlib';
export function decodePng(buf) {
  const b = Buffer.from(buf);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width, height, colorType, depth; const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8), data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; if (data[12] !== 0) throw new Error('interlaced PNG unsupported'); }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || ![2, 6].includes(colorType)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${colorType})`);
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat)), rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? up : c) : NaN;
      if (Number.isNaN(pred)) throw new Error(`bad PNG filter ${f}`);
      cur[i] = (line[i] + pred) & 255;
    }
    for (let x = 0; x < width; x++) { rgba.set(cur.subarray(x * bpp, x * bpp + 3), 4 * (y * width + x)); rgba[4 * (y * width + x) + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    prev = cur;
  }
  return { width, height, rgba };
}
export function classify({ rgba }) {
  const c = { background: 0, unresolved: 0, failure: 0, unavailableNormal: 0, shaded: 0 };
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r === 255 && g === 0 && b === 255) c.unresolved++; else if (r === 255 && g === 0 && b === 0) c.failure++;
    else if (r === 128 && g === 128 && b === 128) c.unavailableNormal++; else if (r <= 6 && g <= 6 && b <= 8) c.background++; else c.shaded++;
  }
  return c;
}
