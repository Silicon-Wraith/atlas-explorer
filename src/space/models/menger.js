// menger@1 (spec §11.3, Project 0 A.4): the finite union of boxes obtained from the
// cube [-1, 1]³ by subdividing each occupied cube into 27 and keeping the children
// whose index triple has at most one middle index; depth 1 gives 20 boxes, depth 2
// gives 400. The exterior distance is the minimum point-to-box distance (exact outside
// the union in real arithmetic); binary64 evaluation error remains subject to validation.
//
// Face coordinates come from one lattice, b(k) = (2k - S)/S with S = 3^depth, each
// rounded once, so adjacent boxes share bit-identical faces and the union has no
// rounding gaps. Applicability is decided exactly for that binary64 geometry: strictly
// inside a box, or on a face shared so that all eight orthants around the point are
// covered, is interior; otherwise a point on a box is boundary (a valid zero); else
// exterior with a positive distance (distinct doubles have a nonzero difference).
import { pointIsFinite, analyticResult, ANALYTIC_FAILURE } from './field.js';

const VOLUME = Object.freeze({ kind: 'box', min: Object.freeze([-1, -1, -1]), max: Object.freeze([1, 1, 1]) });
const cache = new Map();

function depthOf(depth) {
  if (depth !== 1 && depth !== 2) throw new RangeError('the Menger depth must be 1 or 2');
  return depth;
}

function lattice(depth) {
  depthOf(depth);
  if (cache.has(depth)) return cache.get(depth);
  const S = 3 ** depth, bound = k => (2 * k - S) / S;
  let cells = [[0, 0, 0]];
  for (let level = 0; level < depth; level++) {
    const next = [];
    for (const cell of cells) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
        if ((i === 1) + (j === 1) + (k === 1) <= 1) next.push([cell[0] * 3 + i, cell[1] * 3 + j, cell[2] * 3 + k]);
      }
    }
    cells = next;
  }
  const faces = cells.map(cell => ({ lo: cell.map(bound), hi: cell.map(index => bound(index + 1)) }));
  const listed = Object.freeze(cells.map(cell => Object.freeze({
    centre: Object.freeze(cell.map(index => (2 * index + 1 - S) / S)),
    half: Object.freeze([1 / S, 1 / S, 1 / S]),
  })));
  const entry = { faces, listed };
  cache.set(depth, entry);
  return entry;
}

export function boxes(depth) {
  return lattice(depth).listed;
}

export function evaluate(effective, point) {
  const { faces } = lattice(effective?.depth);
  if (!pointIsFinite(point)) return ANALYTIC_FAILURE;
  let nearest = Infinity, touched = false, orthants = 0;
  for (const { lo, hi } of faces) {
    const gaps = [0, 0, 0];
    let strictly = true, mask = 0xff;
    for (let axis = 0; axis < 3; axis++) {
      const p = point[axis];
      if (p < lo[axis]) gaps[axis] = lo[axis] - p;
      else if (p > hi[axis]) gaps[axis] = p - hi[axis];
      else if (p === lo[axis] || p === hi[axis]) {
        strictly = false;
        // Orthant bit o has bit `axis` set for the + side; on lo only + is covered, on hi only -.
        for (let o = 0; o < 8; o++) if (((o >> axis) & 1) !== (p === lo[axis] ? 1 : 0)) mask &= ~(1 << o);
      }
    }
    if (gaps[0] || gaps[1] || gaps[2]) {
      nearest = Math.min(nearest, Math.hypot(gaps[0], gaps[1], gaps[2]));
      continue;
    }
    if (strictly) return analyticResult(0, 'interior');
    touched = true; orthants |= mask;
  }
  if (touched) return analyticResult(0, orthants === 0xff ? 'interior' : 'boundary');
  if (!Number.isFinite(nearest)) return ANALYTIC_FAILURE; // only a norm overflow far outside the union
  return analyticResult(nearest, 'exterior');
}

export function enclosingVolume(effective) {
  depthOf(effective?.depth);
  return VOLUME;
}
