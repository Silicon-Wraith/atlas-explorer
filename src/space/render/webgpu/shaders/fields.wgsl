// Space field kernels, KERNEL_VERSION space-fields-v1 (plan B08; spec §10.2–10.4, §11.1–11.3).
// Binary32 product evaluation. The point status words are B00's POINT_STATUS_* constants, which
// shaders.js prepends to every module. WGSL permits reassociation and fusion and lets an
// implementation assume NaN and infinity are absent, so every domain or range check below precedes
// the operation it protects; nothing detects a NaN after the fact, and non-finite inputs are
// recognised from their bit patterns. A module that calls menger_distance declares
//   var<storage, read> menger_boxes: array<MengerBox>;
// at a binding of its own choosing (points.wgsl owns @binding(3); B10 chooses its own slot). Both share
// this declaration contract and the 32-byte MengerBox layout (lo.xyz, 0, hi.xyz, 0).

struct Deriv { zero: bool, m: f32, e: i32 } // the explicit zero state, or D = m·2^e with 1 <= m < 2
struct PointEval { status: u32, index: u32, value: vec4<f32>, d: Deriv, estimate: u32, log_r: f32, log2_de: f32 }
struct AnalyticEval { valid: bool, distance: f32, applicability: u32 }
struct MengerBox { lo: vec4<f32>, hi: vec4<f32> }

const ESTIMATE_AVAILABLE: u32 = 0u;
const ESTIMATE_NOT_ESCAPED: u32 = 1u;
const ESTIMATE_ZERO_SENSITIVITY: u32 = 2u;
const ESTIMATE_GUARD: u32 = 3u;
const APPLICABILITY_EXTERIOR: u32 = 0u;
const APPLICABILITY_BOUNDARY: u32 = 1u;
const APPLICABILITY_INTERIOR: u32 = 2u;
const MAX_ITERATIONS: u32 = 512u;
const BULB_ESCAPE_RADIUS: f32 = 2.0;
// |x| <= 2^62 keeps every sum of squares of an admitted point below 2^126.
const COORDINATE_LIMIT: f32 = 4611686018427387904.0;
const SMALLEST_NORMAL: f32 = 1.1754943508222875e-38; // 2^-126
const BOX_COS: f32 = 0.8660254037844386; // cos(π/6) = √3/2
const BOX_SIN: f32 = 0.5;
const BOX_HALF: vec3<f32> = vec3<f32>(1.0, 0.5, 0.25);

fn finite_f32(x: f32) -> bool { return (bitcast<u32>(x) & 0x7f800000u) != 0x7f800000u; }
fn admissible_coordinate(x: f32) -> bool { return finite_f32(x) && abs(x) <= COORDINATE_LIMIT; }
fn admissible3(p: vec3<f32>) -> bool { return admissible_coordinate(p.x) && admissible_coordinate(p.y) && admissible_coordinate(p.z); }
fn admissible4(p: vec4<f32>) -> bool { return admissible3(p.xyz) && admissible_coordinate(p.w); }

fn derivative_zero() -> Deriv { return Deriv(true, 0.0, 0); }
fn derivative_one() -> Deriv { return Deriv(false, 1.0, 0); }

// D' = grow·D + add (spec §10.4) for a finite grow >= 0 and add ∈ {0, 1}, without materializing D:
// the mantissa is rescaled by the normalized grow factor and the exponents are added as integers.
fn derivative_update(d: Deriv, grow: f32, add: f32) -> Deriv {
  if (d.zero || grow == 0.0) {
    if (add == 0.0) { return derivative_zero(); }
    return derivative_one();
  }
  let g = frexp(grow); // exact: grow = g.fract·2^g.exp, 0.5 <= g.fract < 1
  var m = d.m * (2.0 * g.fract); // in [1, 4)
  let e = d.e + g.exp - 1;
  if (add != 0.0) {
    // D = m·2^e < 2^-24 rounds away beside 1 (half an ulp of 1.0); below that 2^-e is not added.
    if (e < -26) { return derivative_one(); }
    // 2^-e is under half an ulp of m >= 1 once e >= 25, so it is added only for e <= 24.
    if (e <= 24) { m = m + ldexp(1.0, -e); }
  }
  let n = frexp(m); // exact renormalization into [1, 2)
  return Deriv(false, 2.0 * n.fract, e + n.exp - 1);
}

// log2 DE = -1 + log2 r + log2(ln r) - (log2 m + e), never materializing DE (spec §10.4).
fn log2_estimate(r: f32, ln_r: f32, d: Deriv) -> f32 {
  // guard: callers pass r > 2 (every escape radius is >= 2), ln r > ln 2 and a nonzero normalized d
  return -1.0 + log2(r) + log2(ln_r) - (log2(d.m) + f32(d.e));
}

fn failure_eval(index: u32) -> PointEval {
  return PointEval(POINT_STATUS_NUMERICAL_FAILURE, index, vec4<f32>(0.0), derivative_zero(), ESTIMATE_GUARD, 0.0, 0.0);
}
fn not_escaped_eval(index: u32, value: vec4<f32>, d: Deriv) -> PointEval {
  return PointEval(POINT_STATUS_NOT_ESCAPED, index, value, d, ESTIMATE_NOT_ESCAPED, 0.0, 0.0);
}
fn escaped_eval(index: u32, value: vec4<f32>, r: f32, d: Deriv) -> PointEval {
  // guard: r exceeds an escape radius >= 2, so ln r is finite and > ln 2
  let ln_r = log(r);
  if (d.zero) { return PointEval(POINT_STATUS_ESCAPED, index, value, d, ESTIMATE_ZERO_SENSITIVITY, ln_r, 0.0); }
  // guard: r > 2, ln r > 0 and d nonzero (checked above)
  return PointEval(POINT_STATUS_ESCAPED, index, value, d, ESTIMATE_AVAILABLE, ln_r, log2_estimate(r, ln_r, d));
}

fn complex_mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// P_p(z) (spec §11.1) and r^(p-1) in w, for |z| = r <= 2, without transcendental functions. With
// θ = acos(z/r), φ = atan2(y, x) and ρ = √(x² + y²) > 0: (z + iρ)^p = r^p(cos pθ + i sin pθ) = A + iB
// and ((x + iy)/ρ)^p = cos pφ + i sin pφ = U + iV, so P_p(z) = (B·U, B·V, A) exactly in real
// arithmetic; both powers are evaluated by repeated complex multiplication (B08 fix round 1,
// Claude/Codex ruling (b), codex-B08-consult-findings.md; power-of-two normalization, fix round 2,
// codex-B08-consult2-findings.md).
fn bulb_power_map(z: vec3<f32>, r: f32, p: u32) -> vec4<f32> {
  if (r == 0.0) { return vec4<f32>(0.0); } // the power map is zero at r = 0
  var rp1 = 1.0;
  for (var k = 1u; k < p; k++) { rp1 = rp1 * r; }
  let s = max(abs(z.x), abs(z.y));
  // The polar axis, and transverse magnitudes below the smallest normal binary32 (which WGSL may flush
  // to zero): φ = 0, θ ∈ {0, π}, P_p(z) = (0, 0, z^p) exactly.
  if (s < SMALLEST_NORMAL) {
    var zp = 1.0;
    for (var k = 0u; k < p; k++) { zp = zp * z.z; }
    return vec4<f32>(0.0, 0.0, zp, rp1);
  }
  // x² + y² can underflow in binary32, so (x, y) is scaled exactly by the power of two 2^-e with
  // s = m·2^e, 0.5 <= m < 1 (fix round 2, Codex's uniform candidate): no rounded quotient enters ρ.
  let e = frexp(s).exp;
  let t = ldexp(vec2<f32>(z.x, z.y), vec2<i32>(-e)); // |t| <= 1, the larger component in [0.5, 1)
  let h = length(t); // in [0.5, √2)
  let rho = ldexp(h, e); // exact: >= 2^-126 because s >= SMALLEST_NORMAL
  // guard: h >= 0.5
  let unit = t / h;
  let base = vec2<f32>(z.z, rho);
  var w = vec2<f32>(1.0, 0.0);
  var q = vec2<f32>(1.0, 0.0);
  for (var k = 0u; k < p; k++) {
    w = complex_mul(w, base);
    q = complex_mul(q, unit);
  }
  return vec4<f32>(w.y * q.x, w.y * q.y, w.x, rp1);
}

// mandelbulb@1 (spec §11.1): z0 = 0, d0 = 0; z' = P_p(z) + c, d' = p·|z|^(p-1)·d + 1; escape after
// each update when |z| > 2.
fn bulb_eval(c: vec3<f32>, p: u32, cap: u32) -> PointEval {
  if (p < 2u || p > 8u || cap < 1u || cap > MAX_ITERATIONS || !admissible3(c)) { return failure_eval(0u); }
  var z = vec3<f32>(0.0);
  var d = derivative_zero();
  for (var n = 1u; n <= cap; n++) {
    let r = length(z);
    // An unescaped iterate has |z| <= 2, so r^p <= 256 and every operation below is finite.
    if (!(r <= BULB_ESCAPE_RADIUS)) { return failure_eval(n); }
    let mapped = bulb_power_map(z, r, p);
    // guard: grow = p·r^(p-1) <= 8·2^7 is finite and nonnegative
    d = derivative_update(d, f32(p) * mapped.w, 1.0);
    z = mapped.xyz + c;
    let rz = length(z);
    if (rz > BULB_ESCAPE_RADIUS) { return escaped_eval(n, vec4<f32>(z, 0.0), rz, d); }
  }
  return not_escaped_eval(cap, vec4<f32>(z, 0.0), d);
}

// The G5-D plain formulation qsq(q) + c (profile project0-g5d-v1, kernel form
// g5d-plain-qsq-wrapper-prereg-v1, fragment sha256 290b4cc6…), written independently for the
// product kernel: all four components kept, left to right, no compensation, never projected.
fn qjulia_update(q: vec4<f32>, c: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(q.x * q.x - q.y * q.y - q.z * q.z - q.w * q.w, 2.0 * q.x * q.y, 2.0 * q.x * q.z, 2.0 * q.x * q.w) + c;
}

// quaternion-julia@1 (spec §11.2): q' = q² + C, d0 = 1, d' = 2‖q‖·d; escape when ‖q‖ > R(C) at
// initialization and after each update. `bound` is B02's outward-rounded R(C) of the effective C.
fn qjulia_eval(q0: vec4<f32>, c: vec4<f32>, bound: f32, cap: u32) -> PointEval {
  let parameters_ok = finite_f32(bound) && bound >= 2.0 && bound <= 4.0 && admissible4(c) && all(abs(c) <= vec4<f32>(4.0));
  if (cap < 1u || cap > MAX_ITERATIONS || !parameters_ok || !admissible4(q0)) { return failure_eval(0u); }
  var q = q0;
  var d = derivative_one();
  let r0 = length(q);
  if (r0 > bound) { return escaped_eval(0u, q, r0, d); }
  for (var n = 1u; n <= cap; n++) {
    let r = length(q);
    // An unescaped iterate has ‖q‖ <= R(C) <= 4, so q² + C is finite.
    if (!(r <= bound)) { return failure_eval(n); }
    // guard: grow = 2‖q‖ <= 8 is finite and nonnegative; the sensitivity has no additive term
    d = derivative_update(d, 2.0 * r, 0.0);
    q = qjulia_update(q, c);
    let rq = length(q);
    if (rq > bound) { return escaped_eval(n, q, rq, d); }
  }
  return not_escaped_eval(cap, q, d);
}

// Calibration objects (spec §11.3, Project 0 A.4). Applicability follows the sign of the
// evaluated binary32 geometry; an interior point reports the exterior-only function's zero.
fn analytic_failure() -> AnalyticEval { return AnalyticEval(false, 0.0, APPLICABILITY_INTERIOR); }
fn classify_signed(distance: f32) -> AnalyticEval {
  if (distance > 0.0) { return AnalyticEval(true, distance, APPLICABILITY_EXTERIOR); }
  if (distance == 0.0) { return AnalyticEval(true, 0.0, APPLICABILITY_BOUNDARY); }
  return AnalyticEval(true, distance, APPLICABILITY_INTERIOR);
}

fn sphere_distance(p: vec3<f32>) -> AnalyticEval {
  if (!admissible3(p)) { return analytic_failure(); }
  return classify_signed(length(p) - 1.0);
}

fn box_distance(p: vec3<f32>) -> AnalyticEval {
  if (!admissible3(p)) { return analytic_failure(); }
  let local = vec3<f32>(BOX_COS * p.x + BOX_SIN * p.y, -BOX_SIN * p.x + BOX_COS * p.y, p.z);
  let q = abs(local) - BOX_HALF;
  let outside = max(q.x, max(q.y, q.z));
  if (outside > 0.0) { return AnalyticEval(true, length(max(q, vec3<f32>(0.0))), APPLICABILITY_EXTERIOR); }
  if (outside == 0.0) { return AnalyticEval(true, 0.0, APPLICABILITY_BOUNDARY); }
  return AnalyticEval(true, 0.0, APPLICABILITY_INTERIOR);
}

// The finite Menger union at depth 1 (20 boxes) or 2 (400 boxes): the minimum point-to-box
// distance outside the union. A point strictly inside a box is interior; a point on box faces is
// interior when the boxes touching it cover all eight orthants around it (a shared seam), otherwise
// boundary (fix round 2: union-interior classification, as B03's binary64 evaluator decides it).
// Orthant o has bit `axis` set for the + side; a box whose lo face holds the point covers only +.
const ORTHANTS_PLUS: vec3<u32> = vec3<u32>(0xaau, 0xccu, 0xf0u);
fn menger_distance(p: vec3<f32>, depth: u32) -> AnalyticEval {
  if (!admissible3(p) || (depth != 1u && depth != 2u)) { return analytic_failure(); }
  let count = select(400u, 20u, depth == 1u);
  if (arrayLength(&menger_boxes) < count) { return analytic_failure(); }
  var nearest = COORDINATE_LIMIT;
  var touched = false;
  var orthants = 0u;
  for (var i = 0u; i < count; i++) {
    let b = menger_boxes[i];
    let gap = max(max(b.lo.xyz - p, p - b.hi.xyz), vec3<f32>(0.0));
    if (all(gap == vec3<f32>(0.0))) {
      if (all(p > b.lo.xyz) && all(p < b.hi.xyz)) { return AnalyticEval(true, 0.0, APPLICABILITY_INTERIOR); }
      var mask = 0xffu;
      for (var axis = 0u; axis < 3u; axis++) {
        if (p[axis] == b.lo[axis]) { mask = mask & ORTHANTS_PLUS[axis]; }
        else if (p[axis] == b.hi[axis]) { mask = mask & (~ORTHANTS_PLUS[axis] & 0xffu); }
      }
      touched = true;
      orthants = orthants | mask;
    } else {
      nearest = min(nearest, length(gap));
    }
  }
  if (touched) { return AnalyticEval(true, 0.0, select(APPLICABILITY_BOUNDARY, APPLICABILITY_INTERIOR, orthants == 0xffu)); }
  return AnalyticEval(true, nearest, APPLICABILITY_EXTERIOR);
}
