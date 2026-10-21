// spikes/project0/browser/packing.js — fixture data → GPU layouts (pure; tested in Node).
export function vec4(flat3) {
  const n = flat3.length / 3, out = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) out.set(flat3.subarray(3 * i, 3 * i + 3), 4 * i);
  return out;
}
export function packBoxes(boxes) {
  return new Float32Array(boxes.flatMap(({ c, h }) => {
    if (h.length !== 3 || !h.every(v => Number.isFinite(v) && v > 0 && v === h[0])) throw new Error('Menger upload requires cubic boxes');
    return [...c, h[0]];
  }));
}
export function packRows(rows, fn) {
  const out = new Float32Array(4 * rows.length);
  rows.forEach((r, i) => { const v = fn(r); if (v.length !== 4) throw new Error('packRows needs four lanes per row'); out.set(v, 4 * i); });
  return out;
}
