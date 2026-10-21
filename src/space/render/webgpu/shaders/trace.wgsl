// Space tracing core, TRACING_VERSION surface-v1/space-trace-v1 (plan B10; spec §11.4, §8.1 step 2,
// §10.1). Binary32 sphere tracing of one ray in model-native world coordinates: the ray origin is the
// B05 transport pair (high, low) and every field input is (high + t·d) + low, so no absolute world
// position is collapsed to one binary32 value before the field sees it. Statuses and reasons are B00's
// RAY_STATUS_* / UNRESOLVED_REASON_* / STAGNATION_* constants, which shaders.js prepends to every module.
// The consuming entry source declares `u: TraceUniforms` at @binding(0) and `menger_boxes` (the fields.wgsl
// declaration contract, 32-byte MengerBox rows) at the slot named in passes.js TRACING_BINDINGS.
// The Menger branch calls menger_sample(), supplied by menger-sample.wgsl (Menger variants only) or
// menger-absent.wgsl (every other variant, so they never statically use the box buffer).
// Every guard precedes the operation it protects (spec §10.2); nothing tests for NaN after the fact.
override FIELD: u32 = 0u; // passes.js VALIDATION_FIELD_IDS: 0 sphere, 1 box, 2 menger, 3 mandelbulb, 4 quaternion-julia, 5 constant

const FIELD_SPHERE: u32 = 0u;
const FIELD_BOX: u32 = 1u;
const FIELD_MENGER: u32 = 2u;
const FIELD_BULB: u32 = 3u;
const FIELD_QUATERNION: u32 = 4u;
const FIELD_CONSTANT: u32 = 5u; // validation only: a constant exterior distance u.c.x (the stagnation probes)

const MAX_RAY_STEPS: u32 = 1024u; // B00 batch bound raySteps
const F32_MAX: f32 = 3.4028234663852886e38;
const LOG2_DE_LIMIT: f32 = 127.0; // 2^127 is the largest power of two below F32_MAX: a larger estimate cannot be materialized
const LOG2_SAMPLE_FLOOR: f32 = -126.0; // below the smallest normal binary32, which WGSL may flush to zero
// Outward safety of the enclosing intervals (spec §11.4 "outward-safe bounds"); see enclosing_sphere.
const VOLUME_INFLATION: f32 = 0.00390625; // 2^-8
const REORIGIN_RADII: f32 = 128.0;
const DETAIL_NONE: u32 = 0u;
const DETAIL_INTERIOR: u32 = 1u;

// Field-position resolution of one evaluation (spec §11.4 "Each step", items 1–4).
const SAMPLE_FAILURE: u32 = 0u;      // recurrence or field-domain failure
const SAMPLE_NOT_ESCAPED: u32 = 1u;  // a valid orbit not escaped within its budget
const SAMPLE_INTERIOR: u32 = 2u;     // an analytic interior value (value: the signed distance for the sphere, 0 otherwise)
const SAMPLE_UNAVAILABLE: u32 = 3u;  // an escaped orbit without a usable estimate
const SAMPLE_DISTANCE: u32 = 4u;     // an analytic exterior or boundary distance >= 0
const SAMPLE_LOG2: u32 = 5u;         // a fractal exterior estimate, log2 DE (spec §10.4 log domain)

// 160 bytes; passes.js TRACE_UNIFORM_LAYOUT is this struct's byte layout. Each family's descriptor names
// only the fields it uses; the other bytes are zero.
struct TraceUniforms {
  origin: vec2<u32>, size: vec2<u32>, internal_size: vec2<u32>, seed: u32, sample_index: u32,
  origin_high: vec3<f32>, max_iterations: u32,
  origin_low: vec3<f32>, max_steps: u32,
  forward: vec3<f32>, alpha: f32,
  right: vec3<f32>, tolerance_floor: f32,
  up: vec3<f32>, step_multiplier: f32,
  tolerance_factor: f32,
  c: vec4<f32>, kappa: f32, bound: f32, power: u32, depth: u32,
};

struct FieldSample { kind: u32, value: f32 }
struct TraceResult { status: u32, reason: u32, subreason: u32, steps: u32, t: f32, detail: u32 }
struct Interval { kind: u32, enter: f32, exit: f32 } // kind: 0 ordinary, 1 empty (miss), 2 invalid (numerical failure)

fn trace_result(status: u32, reason: u32, subreason: u32, steps: u32, t: f32, detail: u32) -> TraceResult {
  return TraceResult(status, reason, subreason, steps, t, detail);
}
fn ray_failure(steps: u32, t: f32) -> TraceResult { return trace_result(RAY_STATUS_NUMERICAL_FAILURE, UNRESOLVED_REASON_NONE, STAGNATION_NONE, steps, t, DETAIL_NONE); }
fn ray_miss(steps: u32, t: f32) -> TraceResult { return trace_result(RAY_STATUS_MISS, UNRESOLVED_REASON_NONE, STAGNATION_NONE, steps, t, DETAIL_NONE); }
fn ray_hit(steps: u32, t: f32) -> TraceResult { return trace_result(RAY_STATUS_HIT, UNRESOLVED_REASON_NONE, STAGNATION_NONE, steps, t, DETAIL_NONE); }
fn ray_unresolved(reason: u32, subreason: u32, steps: u32, t: f32, detail: u32) -> TraceResult {
  return trace_result(RAY_STATUS_UNRESOLVED, reason, subreason, steps, t, detail);
}
// B00 packed status word: bits 0–3 status, 4–7 reason, 8–11 subreason, 12–31 steps. The interior detail has
// no place in the word (B00 subreason codes are the stagnation reasons); the ray-list result carries it.
fn pack_status(r: TraceResult) -> u32 { return r.status | (r.reason << 4u) | (r.subreason << 8u) | (min(r.steps, 0xfffffu) << 12u); }

fn finite3(v: vec3<f32>) -> bool { return finite_f32(v.x) && finite_f32(v.y) && finite_f32(v.z); }

// Profile admission, rechecked in the kernel (host admission in passes.js refuses the same inputs).
fn profile_admitted() -> bool {
  return u.max_steps >= 1u && u.max_steps <= MAX_RAY_STEPS && u.max_iterations >= 1u && u.max_iterations <= MAX_ITERATIONS
    && finite_f32(u.alpha) && u.alpha >= 0.0 && finite_f32(u.tolerance_floor) && u.tolerance_floor >= 0.0
    && finite_f32(u.tolerance_factor) && u.tolerance_factor >= 0.0 && finite_f32(u.step_multiplier) && u.step_multiplier > 0.0 && u.step_multiplier <= 1.0;
}

// sampleJitter (B00 backend.js): h = mix(seed ^ mix(sampleIndex ^ mix(x ^ mix(y)))), each mix two rounds of
// (v ^ v >> 16) · 0x045d9f3b in wrapping u32 arithmetic; dx, dy = ((16 bits) + 0.5) / 65536 - 0.5, exact in
// binary32. Sample 0 is the pixel centre. j and dy increase downward.
fn mix_hash(value: u32) -> u32 {
  var v = value;
  for (var i = 0u; i < 2u; i++) { v = (v ^ (v >> 16u)) * 0x045d9f3bu; }
  return v;
}
fn sample_jitter(px: vec2<u32>) -> vec2<f32> {
  if (u.sample_index == 0u) { return vec2<f32>(0.0); }
  let h = mix_hash(u.seed ^ mix_hash(u.sample_index ^ mix_hash(px.x ^ mix_hash(px.y))));
  return (vec2<f32>(f32(h & 0xffffu), f32((h >> 16u) & 0xffffu)) + 0.5) * 0.0000152587890625 - 0.5; // 2^-16
}
// B05 rayDirection: the sample point (i + 0.5 + dx, j + 0.5 + dy); with α = 2·tan(fov/2)/H,
// sx = (2(i + 0.5 + dx) − W)·α/2 and sy = (H − 2(j + 0.5 + dy))·α/2.
fn pixel_direction(px: vec2<u32>) -> vec3<f32> {
  let jitter = sample_jitter(px);
  let size = vec2<f32>(u.internal_size);
  let sx = (2.0 * (f32(px.x) + 0.5 + jitter.x) - size.x) * (0.5 * u.alpha);
  let sy = (size.y - 2.0 * (f32(px.y) + 0.5 + jitter.y)) * (0.5 * u.alpha);
  let v = u.forward + sx * u.right + sy * u.up;
  // guard: |forward| = 1 and |sx|, |sy| are bounded by the frustum, so v is finite and nonzero
  return normalize(v);
}

// The field input at ray parameter t: (high + t·d) + low (B05). Fusion of t·d + high is permitted.
fn field_position(high: vec3<f32>, low: vec3<f32>, d: vec3<f32>, t: f32) -> vec3<f32> { return (high + t * d) + low; }

fn analytic_sample(e: AnalyticEval) -> FieldSample {
  if (!e.valid) { return FieldSample(SAMPLE_FAILURE, 0.0); }
  if (e.applicability == APPLICABILITY_INTERIOR) { return FieldSample(SAMPLE_INTERIOR, e.distance); }
  // guard: an exterior or boundary value is a nonnegative distance
  if (!(e.distance >= 0.0)) { return FieldSample(SAMPLE_FAILURE, 0.0); }
  return FieldSample(SAMPLE_DISTANCE, e.distance);
}
fn fractal_sample(e: PointEval) -> FieldSample {
  if (e.status == POINT_STATUS_NUMERICAL_FAILURE) { return FieldSample(SAMPLE_FAILURE, 0.0); }
  if (e.status == POINT_STATUS_NOT_ESCAPED) { return FieldSample(SAMPLE_NOT_ESCAPED, 0.0); }
  if (e.estimate != ESTIMATE_AVAILABLE) { return FieldSample(SAMPLE_UNAVAILABLE, 0.0); }
  return FieldSample(SAMPLE_LOG2, e.log2_de);
}
fn field_sample(p: vec3<f32>) -> FieldSample {
  if (FIELD == FIELD_BULB) { return fractal_sample(bulb_eval(p, u.power, u.max_iterations)); }
  if (FIELD == FIELD_QUATERNION) { return fractal_sample(qjulia_eval(vec4<f32>(p, u.kappa), u.c, u.bound, u.max_iterations)); }
  if (FIELD == FIELD_SPHERE) { return analytic_sample(sphere_distance(p)); }
  if (FIELD == FIELD_BOX) { return analytic_sample(box_distance(p)); }
  if (FIELD == FIELD_MENGER) { return menger_sample(p, u.depth); }
  if (FIELD == FIELD_CONSTANT) {
    if (!admissible3(p) || !finite_f32(u.c.x) || !(u.c.x >= 0.0)) { return FieldSample(SAMPLE_FAILURE, 0.0); }
    return FieldSample(SAMPLE_DISTANCE, u.c.x);
  }
  return FieldSample(SAMPLE_FAILURE, 0.0);
}

// The declared enclosing volumes (spec §11.4): the bulb's radius-2 sphere, the quaternion's outward
// R(C) sphere, the Project 0 A.2 radius-2 sphere for the sphere and box, the box [-1, 1]^3 for Menger.
// Outward safety in binary32. The ray from the represented origin o = high + low (|low_i| <= ulp(high_i)/2)
// meets the R-sphere about 0 inside the parameter interval on which the ray from `high` meets the sphere
// of radius R + |low|_1, so the volume is inflated by |low|_1 and further by 2^-8·R. The discriminant
// is R'² − |q × d|² with the cross product (no b² − c cancellation); its rounding error is about
// 2·R'·2^-23·|q|, while the inflation widens the true chord by at least (R'² − R²)/(2R') ≈ 2^-8·R, so for
// |q| <= 128·R the computed interval contains the true one with margin (and roots are padded by the
// rounding of −q·d). A farther origin is first advanced exactly as the marcher would advance it, to
// t0 = q·(−d) − 2R' (a parameter before the volume), and the interval is computed from that point.
fn enclosing_sphere(high: vec3<f32>, low: vec3<f32>, d: vec3<f32>, radius: f32) -> Interval {
  if (!finite_f32(radius) || !(radius > 0.0) || radius > 16.0) { return Interval(2u, 0.0, 0.0); }
  let r = radius * (1.0 + VOLUME_INFLATION) + (abs(low.x) + abs(low.y) + abs(low.z));
  var t0 = 0.0;
  var q = high;
  let reach = length(high);
  if (reach > REORIGIN_RADII * r) {
    let along = -dot(high, d);
    if (along <= 0.0) { return Interval(1u, 0.0, 0.0); } // the volume lies behind a distant origin
    t0 = max(0.0, along - 2.0 * r);
    q = high + t0 * d;
  }
  let perpendicular = cross(q, d);
  let disc = r * r - dot(perpendicular, perpendicular);
  if (disc < 0.0) { return Interval(1u, 0.0, 0.0); }
  // guard: disc >= 0 (checked above) and finite for an admitted origin
  let half_chord = sqrt(disc);
  let mid = -dot(q, d);
  let pad = 0.0000002384185791015625 * (abs(mid) + r + t0) * 4.0; // 4·2^-22·(|mid| + R' + t0)
  return Interval(0u, t0 + mid - half_chord - pad, t0 + mid + half_chord + pad);
}
// Slab method for the box [-1, 1]^3, inflated by 2^-8 and |low_i| per axis and padded relatively.
fn enclosing_box(high: vec3<f32>, low: vec3<f32>, d: vec3<f32>) -> Interval {
  var enter = -F32_MAX;
  var exit = F32_MAX;
  for (var axis = 0u; axis < 3u; axis++) {
    let half = 1.0 + VOLUME_INFLATION + abs(low[axis]);
    let o = high[axis];
    if (d[axis] == 0.0) {
      if (abs(o) > half) { return Interval(1u, 0.0, 0.0); }
      continue;
    }
    // guard: d[axis] != 0 and |o| is admitted finite, so both quotients are finite for |o| <= 2^62
    let a = (-half - o) / d[axis];
    // guard: as above
    let b = (half - o) / d[axis];
    let pad = 0.00000095367431640625 * (abs(a) + abs(b)); // 2^-20 relative padding
    enter = max(enter, min(a, b) - pad);
    exit = min(exit, max(a, b) + pad);
  }
  if (exit < enter) { return Interval(1u, 0.0, 0.0); }
  return Interval(0u, enter, exit);
}
fn enclosing_interval(high: vec3<f32>, low: vec3<f32>, d: vec3<f32>) -> Interval {
  if (FIELD == FIELD_MENGER) { return enclosing_box(high, low, d); }
  if (FIELD == FIELD_QUATERNION) {
    if (!finite_f32(u.bound) || !finite_f32(u.kappa)) { return Interval(2u, 0.0, 0.0); }
    // The strict empty slice (spec §11.2): no non-escaping point under the outward bound, so a miss.
    if (abs(u.kappa) > u.bound) { return Interval(1u, 0.0, 0.0); }
    return enclosing_sphere(high, low, d, u.bound);
  }
  return enclosing_sphere(high, low, d, 2.0);
}

// Starting conditions and the ordered step rules of spec §11.4. `use_given` replaces the enclosing
// interval (the validation stagnation probes). No minimum step is forced and no hit is manufactured.
fn march(high: vec3<f32>, low: vec3<f32>, d: vec3<f32>, use_given: bool, given: Interval) -> TraceResult {
  if (!profile_admitted()) { return ray_failure(0u, 0.0); }
  // Invalid ray arithmetic is a numerical failure, never a miss: a finite, admitted origin and a unit direction.
  if (!admissible3(high) || !admissible3(low) || !finite3(d)) { return ray_failure(0u, 0.0); }
  // guard: d is finite and |d_i| <= 2^62 cannot hold for a unit vector beyond tolerance; dot(d, d) is finite for finite d below 2^63
  if (any(abs(d) > vec3<f32>(2.0)) || abs(dot(d, d) - 1.0) > 0.000004) { return ray_failure(0u, 0.0); }
  var interval = given;
  if (!use_given) { interval = enclosing_interval(high, low, d); }
  if (interval.kind == 2u || !finite_f32(interval.enter) || !finite_f32(interval.exit)) { return ray_failure(0u, 0.0); }
  if (interval.kind == 1u) { return ray_miss(0u, 0.0); }
  var t = max(0.0, interval.enter);
  if (interval.exit < t) { return ray_miss(0u, t); }
  var p = field_position(high, low, d, t);
  for (var steps = 1u; steps <= u.max_steps; steps++) {
    if (!admissible3(p)) { return ray_failure(steps, t); }
    let s = field_sample(p);
    if (s.kind == SAMPLE_FAILURE) { return ray_failure(steps, t); }
    if (s.kind == SAMPLE_NOT_ESCAPED) { return ray_unresolved(UNRESOLVED_REASON_POINT_BUDGET, STAGNATION_NONE, steps, t, DETAIL_NONE); }
    // This exterior profile never accepts an interior value as a hit (spec §11.4 "Analytic applicability").
    if (s.kind == SAMPLE_INTERIOR) { return ray_unresolved(UNRESOLVED_REASON_ESTIMATE_UNAVAILABLE, STAGNATION_NONE, steps, t, DETAIL_INTERIOR); }
    if (s.kind == SAMPLE_UNAVAILABLE) { return ray_unresolved(UNRESOLVED_REASON_ESTIMATE_UNAVAILABLE, STAGNATION_NONE, steps, t, DETAIL_NONE); }
    // τ(t) = max(floor, factor·α·t): surface-v1 floor 1e-6, factor 0.5; ladder-v1 floor 0, factor 0.005.
    let tolerance = max(u.tolerance_floor, u.tolerance_factor * u.alpha * t);
    var distance = 0.0;
    if (s.kind == SAMPLE_DISTANCE) {
      // An analytic boundary value of zero remains a valid hit; otherwise the estimate below τ.
      if (s.value == 0.0 || s.value < tolerance) { return ray_hit(steps, t); }
      distance = s.value;
    } else {
      if (!finite_f32(s.value) || s.value >= LOG2_DE_LIMIT) { return ray_unresolved(UNRESOLVED_REASON_ESTIMATE_UNAVAILABLE, STAGNATION_NONE, steps, t, DETAIL_NONE); }
      // guard: log2 is applied only to a positive normal tolerance; a zero or subnormal τ admits no fractal hit
      if (tolerance >= SMALLEST_NORMAL && s.value < log2(tolerance)) { return ray_hit(steps, t); }
      // A value below the binary32 range underflows toward zero, which is stagnation, never a hit (no
      // clamp, no forced minimum).
      // guard: s.value < 127 so 2^value is finite
      distance = exp2(s.value);
    }
    // guard: the candidate advance t + m·DE must stay finite
    if (!(distance <= (F32_MAX - t) / u.step_multiplier)) { return ray_failure(steps, t); }
    let candidate = t + u.step_multiplier * distance;
    if (candidate > interval.exit) { return ray_miss(steps, t); }
    if (!(candidate > t)) { return ray_unresolved(UNRESOLVED_REASON_STAGNATION, STAGNATION_RAY_PARAMETER, steps, t, DETAIL_NONE); }
    let next = field_position(high, low, d, candidate);
    if (all(next == p)) { return ray_unresolved(UNRESOLVED_REASON_STAGNATION, STAGNATION_FIELD_COORDINATE, steps, t, DETAIL_NONE); }
    t = candidate;
    p = next;
  }
  return ray_unresolved(UNRESOLVED_REASON_RAY_STEP_BUDGET, STAGNATION_NONE, u.max_steps, t, DETAIL_NONE);
}

fn trace_pixel(px: vec2<u32>) -> TraceResult {
  return march(u.origin_high, u.origin_low, pixel_direction(px), false, Interval(0u, 0.0, 0.0));
}
