// Retained BW1 flat-normal expansion; CPU geometry work, usable in a worker.
export function expandTriangles(vertices, indices) {
  if (!(vertices instanceof Float32Array) || !(indices instanceof Uint32Array) || vertices.length % 3 || indices.length % 3) throw new TypeError('packed float32 vertices and uint32 triangles required');
  const result = new Float32Array(indices.length * 6);
  for (let k = 0; k < indices.length; k += 3) {
    const i = indices[k] * 3, j = indices[k + 1] * 3, l = indices[k + 2] * 3;
    if (Math.max(i, j, l) + 2 >= vertices.length) throw new RangeError('triangle outside vertex buffer');
    const a = [vertices[j] - vertices[i], vertices[j + 1] - vertices[i + 1], vertices[j + 2] - vertices[i + 2]];
    const b = [vertices[l] - vertices[i], vertices[l + 1] - vertices[i + 1], vertices[l + 2] - vertices[i + 2]];
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], length = Math.hypot(...n);
    if (!Number.isFinite(length) || !length) throw new Error('Degenerate rendered triangle');
    for (let t = 0; t < 3; t++) {
      result.set(vertices.subarray(indices[k + t] * 3, indices[k + t] * 3 + 3), (k + t) * 6);
      result.set(n.map(x => x / length), (k + t) * 6 + 3);
    }
  }
  return result;
}
