// normals_band (plan B10; spec §8.1 step 3, §11.4, P2; plan rev 5.0 B10 note, implemented by B11b): central
// differences of the field at ε = 0.5·τ(t) around the pixel's hit point p = (high + t·d) + low, with explicit
// availability in w (1 available, 0 unavailable). A normal is available only when the pixel is an approximate hit,
// every sample its stencil requires resolves (an analytic exterior or boundary value, the sphere's signed interior
// value, or an escaped fractal orbit with a usable estimate), each axis's effective sample positions are distinct
// from each other and from p, and the gradient is finite and nonzero.
// One-sided fallback (rev 5.0, user decision 3), box and Menger only: their exterior-only exact distances report an
// interior point as zero, which is proven solid occupancy, never a distance. When exactly one endpoint of an axis is
// such an analytic interior and the other resolves, that axis takes the one-sided difference between the resolved
// endpoint and the resolved centre value f(p), evaluated once per pixel and only when needed: forward
// (f(p+) − f(p))/(p+axis − paxis) or backward (f(p) − f(p−))/(paxis − p−axis). The interior zero never enters the
// derivative. Both endpoints interior, an unresolved or failed sample (non-escape, an unavailable estimate, a
// numerical failure), an unresolved centre and coordinate collapse leave the normal unavailable. The stencil
// therefore needs at most seven field samples (B00 bound normalFieldSamples). An unavailable normal never touches the
// depth: this pass reads `depth` and `status` and writes only `normal`. Bindings: passes.js TRACING_BINDINGS.
@group(0) @binding(0) var<uniform> u: TraceUniforms;
@group(0) @binding(1) var depth_in: texture_2d<f32>;
@group(0) @binding(2) var status_in: texture_2d<u32>;
@group(0) @binding(3) var normal_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage, read> menger_boxes: array<MengerBox>;

const NORMAL_UNAVAILABLE: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 0.0);
const NORMAL_UNRESOLVED: u32 = 0u;
const NORMAL_RESOLVED: u32 = 1u;
const NORMAL_ANALYTIC_INTERIOR: u32 = 2u; // box and Menger only: proven solid, no distance value
struct NormalSample { kind: u32, value: f32 }

// The field value whose gradient is the normal: the analytic distance, or DE = 2^(log2 DE).
fn normal_sample(p: vec3<f32>) -> NormalSample {
  if (!admissible3(p)) { return NormalSample(NORMAL_UNRESOLVED, 0.0); }
  let s = field_sample(p);
  if (s.kind == SAMPLE_DISTANCE) { return NormalSample(NORMAL_RESOLVED, s.value); }
  // The sphere's distance is signed and exact inside; exterior-only fields report an interior zero, which for the
  // exact analytic solids (box, Menger) is proven occupancy that only selects the one-sided stencil.
  if (s.kind == SAMPLE_INTERIOR && FIELD == FIELD_SPHERE) { return NormalSample(NORMAL_RESOLVED, s.value); }
  if (s.kind == SAMPLE_INTERIOR && (FIELD == FIELD_BOX || FIELD == FIELD_MENGER)) { return NormalSample(NORMAL_ANALYTIC_INTERIOR, 0.0); }
  // guard: exp2 only for an estimate inside the binary32 normal range
  if (s.kind == SAMPLE_LOG2 && s.value >= LOG2_SAMPLE_FLOOR && s.value < LOG2_DE_LIMIT) { return NormalSample(NORMAL_RESOLVED, exp2(s.value)); }
  return NormalSample(NORMAL_UNRESOLVED, 0.0);
}

fn evaluate_normal(px: vec2<u32>, word: u32, t: f32) -> vec4<f32> {
  if ((word & 15u) != RAY_STATUS_HIT || !profile_admitted() || !finite_f32(t) || !(t >= 0.0)) { return NORMAL_UNAVAILABLE; }
  let p = field_position(u.origin_high, u.origin_low, pixel_direction(px), t);
  let epsilon = 0.5 * max(u.tolerance_floor, u.tolerance_factor * u.alpha * t);
  if (!(epsilon > 0.0) || !finite_f32(epsilon)) { return NORMAL_UNAVAILABLE; }
  var gradient = vec3<f32>(0.0);
  var centre = NormalSample(NORMAL_UNRESOLVED, 0.0);
  var centre_evaluated = false;
  for (var axis = 0u; axis < 3u; axis++) {
    var offset = vec3<f32>(0.0);
    offset[axis] = epsilon;
    let plus = p + offset;
    let minus = p - offset;
    // Indistinguishable at effective precision: the sample positions must differ from each other and from p.
    if (plus[axis] == minus[axis] || plus[axis] == p[axis] || minus[axis] == p[axis]) { return NORMAL_UNAVAILABLE; }
    let a = normal_sample(plus);
    let b = normal_sample(minus);
    if (a.kind == NORMAL_RESOLVED && b.kind == NORMAL_RESOLVED) {
      // guard: the effective separation plus − minus is nonzero (checked above) and both values are finite
      gradient[axis] = (a.value - b.value) / (plus[axis] - minus[axis]);
      continue;
    }
    // The one-sided fallback: exactly one endpoint an analytic interior (box and Menger only), the other resolved.
    let forward = a.kind == NORMAL_RESOLVED && b.kind == NORMAL_ANALYTIC_INTERIOR;
    let backward = a.kind == NORMAL_ANALYTIC_INTERIOR && b.kind == NORMAL_RESOLVED;
    if (!(forward || backward) || !(FIELD == FIELD_BOX || FIELD == FIELD_MENGER)) { return NORMAL_UNAVAILABLE; }
    if (!centre_evaluated) {
      centre = normal_sample(p);
      centre_evaluated = true;
    }
    if (centre.kind != NORMAL_RESOLVED) { return NORMAL_UNAVAILABLE; }
    if (forward) {
      // guard: plus[axis] != p[axis] (checked above) and both values are finite distances
      gradient[axis] = (a.value - centre.value) / (plus[axis] - p[axis]);
    } else {
      // guard: p[axis] != minus[axis] (checked above) and both values are finite distances
      gradient[axis] = (centre.value - b.value) / (p[axis] - minus[axis]);
    }
  }
  if (!finite3(gradient)) { return NORMAL_UNAVAILABLE; }
  let largest = max(abs(gradient.x), max(abs(gradient.y), abs(gradient.z)));
  if (!(largest > 0.0)) { return NORMAL_UNAVAILABLE; } // a zero gradient
  // guard: largest > 0 (checked above); scaling keeps the squared length in [1, 3]
  let scaled = gradient / largest;
  // guard: |scaled| >= 1
  return vec4<f32>(scaled / length(scaled), 1.0);
}

@compute @workgroup_size(8, 8, 1)
fn normals_band(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let px = u.origin + gid.xy;
  let dims = textureDimensions(normal_out);
  if (px.x >= u.internal_size.x || px.y >= u.internal_size.y || px.x >= dims.x || px.y >= dims.y) { return; }
  let word = textureLoad(status_in, vec2<i32>(px), 0).x;
  let t = textureLoad(depth_in, vec2<i32>(px), 0).x;
  textureStore(normal_out, vec2<i32>(px), evaluate_normal(px, word, t));
}
