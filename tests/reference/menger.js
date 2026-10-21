import { boxInterval } from './analytic.js';
const cache = new Map();
export function mengerBoxes(depth) {
  if (![1, 2].includes(depth)) throw new RangeError('finite Menger depth must be 1 or 2');
  if (cache.has(depth)) return cache.get(depth);
  let boxes = [{ center: [0, 0, 0], half: [1, 1, 1] }];
  for (let level = 0; level < depth; level++) {
    const children = [];
    for (const box of boxes) for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (Number(x === 0) + Number(y === 0) + Number(z === 0) > 1) continue;
      const h = box.half[0] / 3;
      children.push(Object.freeze({ center: Object.freeze([x, y, z].map((v, i) => box.center[i] + 2 * h * v)), half: Object.freeze([h, h, h]) }));
    }
    boxes = children;
  }
  cache.set(depth, Object.freeze(boxes)); return cache.get(depth);
}
// Enumeration, not folding. Parent distances prune groups of 20 children; every
// surviving leaf contributes its ordinary box distance to the same union minimum.
function squaredDistance(p, box) {
  const x = Math.max(Math.abs(p[0] - box.center[0]) - box.half[0], 0);
  const y = Math.max(Math.abs(p[1] - box.center[1]) - box.half[1], 0);
  const z = Math.max(Math.abs(p[2] - box.center[2]) - box.half[2], 0);
  return x * x + y * y + z * z;
}
export function mengerDistance(point, depth = 2) {
  if (!Array.isArray(point) || point.length !== 3 || point.some(x => !Number.isFinite(x) || Math.abs(x) > 1e150)) return { status: 'numerical failure' };
  const boxes = mengerBoxes(depth), parents = mengerBoxes(1);
  let best = Infinity, interior = false;
  for (let parent = 0; parent < 20; parent++) {
    // Roundoff cushion keeps a rounded parent bound from pruning an equal leaf.
    if (squaredDistance(point, parents[parent]) > best * (1 + 1e-14) + 1e-28) continue;
    const start = depth === 1 ? parent : parent * 20, end = start + (depth === 1 ? 1 : 20);
    for (let k = start; k < end; k++) {
      const box = boxes[k], d = squaredDistance(point, box);
      if (d < best) best = d;
      if (d === 0 && point.every((v, i) => Math.abs(v - box.center[i]) < box.half[i])) interior = true;
    }
  }
  return { distance: Math.sqrt(best), applicability: interior ? 'interior' : best === 0 ? 'boundary' : 'exterior' };
}
export function mengerIntervals(ray, depth) {
  const intervals = mengerBoxes(depth).map(box => ({ interval: boxInterval(ray, box), box }))
    .filter(({ interval }) => interval && interval.exit >= Math.max(0, interval.enter)).sort((a, b) => a.interval.enter - b.interval.enter);
  const merged = [];
  for (const { interval, box } of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.enter <= previous.exit) previous.exit = Math.max(previous.exit, interval.exit);
    else merged.push({ ...interval, box });
  }
  return merged;
}
