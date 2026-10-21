import { nextUp64 } from './f32.js';
const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(x => Number.isFinite(x) && Math.abs(x) < 1e150);
export function sphereDistance(point, radius = 1) {
  if (!finite3(point) || !(radius > 0 && radius < 1e150)) return { status: 'numerical failure' };
  const distance = Math.hypot(...point) - radius;
  return { distance, applicability: distance < 0 ? 'interior' : distance === 0 ? 'boundary' : 'exterior' };
}
export const ROTATED_BOX = Object.freeze({ center: [0, 0, 0], half: [1, 0.5, 0.25], rotationZ: Math.PI / 6 });
export function boxLocal(point, box = ROTATED_BOX, vector = false) {
  const p = point.map((v, i) => v - (vector ? 0 : box.center[i]));
  const c = Math.cos(box.rotationZ ?? 0), s = Math.sin(box.rotationZ ?? 0);
  return [c * p[0] + s * p[1], -s * p[0] + c * p[1], p[2]];
}
export function boxDistance(point, box = ROTATED_BOX) {
  if (!finite3(point)) return { status: 'numerical failure' };
  const q = boxLocal(point, box).map((v, i) => Math.abs(v) - box.half[i]);
  return { distance: Math.hypot(...q.map(v => Math.max(v, 0))),
    applicability: q.every(v => v < 0) ? 'interior' : q.every(v => v <= 0) ? 'boundary' : 'exterior' };
}
export function sphereInterval(ray, radius = 2) {
  if (!finite3(ray?.origin) || !finite3(ray?.direction) || !(radius > 0 && radius < 1e150)) return { invalid: true };
  if (Math.abs(Math.hypot(...ray.direction) - 1) > 1e-6) return { invalid: true };
  const a = ray.direction.reduce((s, v) => s + v * v, 0);
  if (!(a > 0)) return { invalid: true };
  const b = ray.origin.reduce((s, v, i) => s + v * ray.direction[i], 0);
  const c = ray.origin.reduce((s, v) => s + v * v, 0) - radius * radius;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const d = Math.sqrt(discriminant);
  return { enter: (-b - d) / a, exit: (-b + d) / a };
}

// Directed binary64 interval operations for enclosing volumes. The analytic
// oracle above deliberately remains the ordinary closed-form geometric answer.
const down = value => -nextUp64(-value);
const addI = (a, b) => [down(a[0] + b[0]), nextUp64(a[1] + b[1])];
const subI = (a, b) => [down(a[0] - b[1]), nextUp64(a[1] - b[0])];
function mulI(a, b) {
  const values = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return [down(Math.min(...values)), nextUp64(Math.max(...values))];
}
function divI(a, b) {
  const values = [a[0] / b[0], a[0] / b[1], a[1] / b[0], a[1] / b[1]];
  return [down(Math.min(...values)), nextUp64(Math.max(...values))];
}
export function enclosingSphereInterval(ray, radius) {
  if (!finite3(ray?.origin) || !finite3(ray?.direction) || Math.abs(Math.hypot(...ray.direction) - 1) > 1e-6 || !(radius > 0 && radius < 1e150)) return { invalid: true };
  let a = [0, 0], b = [0, 0], c = [0, 0];
  for (let i = 0; i < 3; i++) {
    const o = [ray.origin[i], ray.origin[i]], d = [ray.direction[i], ray.direction[i]];
    a = addI(a, mulI(d, d)); b = addI(b, mulI(o, d)); c = addI(c, mulI(o, o));
  }
  c = subI(c, mulI([radius, radius], [radius, radius]));
  const discriminant = subI(mulI(b, b), mulI(a, c));
  if (discriminant[1] < 0) return null;
  const root = nextUp64(Math.sqrt(Math.max(0, discriminant[1])));
  const minusB = [-b[1], -b[0]];
  return { enter: divI(subI(minusB, [root, root]), a)[0], exit: divI(addI(minusB, [root, root]), a)[1] };
}
export function enclosingBoxInterval(ray) {
  if (!finite3(ray?.origin) || !finite3(ray?.direction) || Math.abs(Math.hypot(...ray.direction) - 1) > 1e-6) return { invalid: true };
  let enter = -Infinity, exit = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = ray.origin[i], d = ray.direction[i];
    if (d === 0) { if (Math.abs(o) > 1) return null; continue; }
    const lo = divI(subI([-1, -1], [o, o]), [d, d]);
    const hi = divI(subI([1, 1], [o, o]), [d, d]);
    enter = Math.max(enter, Math.min(lo[0], hi[0])); exit = Math.min(exit, Math.max(lo[1], hi[1]));
  }
  return exit < enter ? null : { enter, exit };
}
export function boxInterval(ray, box = ROTATED_BOX) {
  if (!finite3(ray?.origin) || !finite3(ray?.direction) || !ray.direction.some(v => v !== 0)) return { invalid: true };
  const o = boxLocal(ray.origin, box), d = boxLocal(ray.direction, box, true);
  let enter = -Infinity, exit = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    if (d[axis] === 0) { if (Math.abs(o[axis]) > box.half[axis]) return null; continue; }
    const lo = (-box.half[axis] - o[axis]) / d[axis], hi = (box.half[axis] - o[axis]) / d[axis];
    enter = Math.max(enter, Math.min(lo, hi)); exit = Math.min(exit, Math.max(lo, hi));
  }
  return exit < enter ? null : { enter, exit };
}
export function entryNearEdge(ray, interval, box, margin = 1e-3) {
  if (!interval || interval.exit < Math.max(0, interval.enter)) return false;
  const point = ray.origin.map((v, i) => v + Math.max(0, interval.enter) * ray.direction[i]);
  return boxLocal(point, box).filter((v, i) => box.half[i] - Math.abs(v) < margin).length > 1;
}
// Rev 4.8 surface-v1 analytic envelope (plan B04 P1; tolerance-analysis.md#depth). t⁻ is the first
// forward intersection, max(0, enter) when exit >= max(0, enter), with the object expanded outward by
// rho; null when the forward ray misses the expansion. Computed independently of the oracle intervals
// above and of the marcher: an explicit quadratic at radius + rho and explicit inflated local slabs.
export function expandedSphereEntry(ray, rho, radius = 1) {
  const [o, d] = [ray.origin, ray.direction], r = radius + rho;
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r, discriminant = b * b - a * c;
  if (!(a > 0) || discriminant < 0) return null;
  const root = Math.sqrt(discriminant), enter = (-b - root) / a, exit = (-b + root) / a;
  return exit >= Math.max(0, enter) ? Math.max(0, enter) : null;
}
// Slab entry for a local axis-aligned box (centre, half) inflated by rho; shared by the box and the Menger leaves.
export function inflatedSlabEntry(origin, direction, center, half, rho) {
  let enter = -Infinity, exit = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis] - center[axis], d = direction[axis], h = half[axis] + rho;
    if (d === 0) { if (Math.abs(o) > h) return null; continue; }
    const near = (-h - o) / d, far = (h - o) / d;
    enter = Math.max(enter, Math.min(near, far)); exit = Math.min(exit, Math.max(near, far));
  }
  return exit >= Math.max(0, enter) ? Math.max(0, enter) : null;
}
export function expandedBoxEntry(ray, rho, box = ROTATED_BOX) {
  return inflatedSlabEntry(boxLocal(ray.origin, box), boxLocal(ray.direction, box, true), [0, 0, 0], box.half, rho);
}
