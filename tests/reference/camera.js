// Binary64 fixture cameras, independently derived from Project 0 A.1.
// These references support the modest anchors/scales in the frozen matrix only;
// they do not implement arbitrary-precision navigation or origin transport.
export const normalize = v => { const n = Math.hypot(...v); if (!(n > 0)) throw new RangeError('zero direction'); return v.map(x => x / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const OVERVIEW_DIRECTION = Object.freeze(normalize([1.92, -1.44, 0.70]));
export function lookCamera(position, focus = [0, 0, 0], verticalFovDegrees = 60) {
  const f = normalize(focus.map((v, i) => v - position[i])), right = normalize(cross(f, [0, 0, 1])), up = cross(right, f);
  // Camera-to-world rotation has columns right, up, -forward.
  const m = [[right[0], up[0], -f[0]], [right[1], up[1], -f[1]], [right[2], up[2], -f[2]]];
  const trace = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (trace > 0) {
    const s = 2 * Math.sqrt(1 + trace);
    q = [s / 4, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s];
  } else {
    const i = m[0][0] > m[1][1] && m[0][0] > m[2][2] ? 0 : m[1][1] > m[2][2] ? 1 : 2;
    const j = (i + 1) % 3, k = (i + 2) % 3, s = 2 * Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]);
    q = [(m[k][j] - m[j][k]) / s, 0, 0, 0]; q[i + 1] = s / 4; q[j + 1] = (m[j][i] + m[i][j]) / s; q[k + 1] = (m[k][i] + m[i][k]) / s;
  }
  q = normalize(q); if (q[0] < 0) q = q.map(x => -x);
  return { kind: 'anchored-perspective-v1', anchor: ['0', '0', '0'], scale: { mantissa: 1, exponent: 0 },
    positionLocal: [...position], focusLocal: [...focus], orientationWxyz: q, verticalFovDegrees };
}
export function overviewCamera(radius) { return lookCamera(OVERVIEW_DIRECTION.map(x => x * 2.5 * radius)); }
export function yawCamera(camera, radians) {
  if (radians === 0) return structuredClone(camera);
  const [x, y, z] = camera.positionLocal.map((v, i) => v - camera.focusLocal[i]), c = Math.cos(radians), s = Math.sin(radians);
  const result = lookCamera([c * x - s * y, s * x + c * y, z].map((v, i) => v + camera.focusLocal[i]), camera.focusLocal, camera.verticalFovDegrees);
  return { ...result, anchor: [...camera.anchor], scale: { ...camera.scale } };
}
export function cameraBasis(camera) {
  const [w, x, y, z] = camera.orientationWxyz;
  return { right: [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    up: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    forward: [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))] };
}
export function rayFor(camera, i, j, W, H) {
  const { forward, right, up } = cameraBasis(camera), h = Math.tan(camera.verticalFovDegrees * Math.PI / 360);
  const sx = (2 * (i + 0.5) / W - 1) * h * W / H, sy = (1 - 2 * (j + 0.5) / H) * h;
  const scale = camera.scale.mantissa * 2 ** camera.scale.exponent;
  return { origin: camera.positionLocal.map((v, k) => Number(camera.anchor[k]) + scale * v),
    direction: normalize(forward.map((v, k) => v + sx * right[k] + sy * up[k])) };
}
