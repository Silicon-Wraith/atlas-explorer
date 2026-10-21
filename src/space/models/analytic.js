// Calibration objects sphere@1 and box@1 (spec §11.3, Project 0 A.4), binary64.
// They report distance semantics and applicability, never an escape status.
//   sphere: radius 1 at the origin, signed distance |p| - 1 (interior values negative).
//   box: half-extents h = (1, 0.5, 0.25), object-to-world rotation R_z(π/6), exterior
//   distance ‖max(|u| - h, 0)‖ with u = R_z(-π/6)·p; an interior point reports the
//   exterior-only function's zero with interior applicability (never a hit, §11.4).
// Applicability is decided exactly for the binary64-evaluated geometry: the sign of
// the computed signed distance (sphere) or of max(|u| - h) (box), so a positive
// distance always accompanies exterior applicability and zero exactly marks the boundary.
import { pointIsFinite, analyticResult, ANALYTIC_FAILURE } from './field.js';

const ENCLOSING = Object.freeze({ kind: 'sphere', radius: 2 });
// cos(π/6) = √3/2 and sin(π/6) = 1/2, each rounded once (not Math.cos/Math.sin of a rounded π/6).
export const BOX_ROTATION = Object.freeze({ cos: Math.sqrt(3) / 2, sin: 0.5 });
export const BOX_HALF_EXTENTS = Object.freeze([1, 0.5, 0.25]);

function checkEffective(effective) {
  if (effective === null || typeof effective !== 'object') throw new TypeError('effective parameters must be an object');
}

function classify(distance) {
  if (!Number.isFinite(distance)) return ANALYTIC_FAILURE;
  return analyticResult(distance, distance > 0 ? 'exterior' : distance === 0 ? 'boundary' : 'interior');
}

export const sphere = Object.freeze({
  evaluate(effective, point) {
    checkEffective(effective);
    if (!pointIsFinite(point)) return ANALYTIC_FAILURE;
    return classify(Math.hypot(point[0], point[1], point[2]) - 1);
  },
  enclosingVolume: () => ENCLOSING,
});

export const box = Object.freeze({
  evaluate(effective, point) {
    checkEffective(effective);
    if (!pointIsFinite(point)) return ANALYTIC_FAILURE;
    const [x, y, z] = point, { cos, sin } = BOX_ROTATION;
    const u = [cos * x + sin * y, -sin * x + cos * y, z];
    const q = u.map((value, i) => Math.abs(value) - BOX_HALF_EXTENTS[i]);
    const outside = Math.max(q[0], q[1], q[2]);
    if (outside > 0) return classify(Math.hypot(...q.map(value => Math.max(value, 0))));
    return analyticResult(0, outside === 0 ? 'boundary' : 'interior');
  },
  enclosingVolume: () => ENCLOSING,
});
