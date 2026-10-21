// normals_band (plan B10; spec §8.1 step 3, §11.4, P2): central differences of the field at
// ε = 0.5·τ(t) around the pixel's hit point (high + t·d) + low, with explicit availability in w (1 available,
// 0 unavailable). A normal is available only when the pixel is an approximate hit, all six samples resolve
// (an analytic exterior or boundary value, the sphere's signed interior value, or an escaped fractal orbit
// with a usable estimate), each axis's effective sample positions are distinct from each other and from the
// hit point, and the gradient is finite and nonzero. An unavailable normal never touches the depth: this
// pass reads `depth` and `status` and writes only `normal`. Bindings: passes.js TRACING_BINDINGS.
@group(0) @binding(0) var<uniform> u: TraceUniforms;
@group(0) @binding(1) var depth_in: texture_2d<f32>;
@group(0) @binding(2) var status_in: texture_2d<u32>;
@group(0) @binding(3) var normal_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage, read> menger_boxes: array<MengerBox>;

const NORMAL_UNAVAILABLE: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 0.0);
struct NormalSample { resolved: bool, value: f32 }

// The field value whose gradient is the normal: the analytic distance, or DE = 2^(log2 DE).
fn normal_sample(p: vec3<f32>) -> NormalSample {
  if (!admissible3(p)) { return NormalSample(false, 0.0); }
  let s = field_sample(p);
  if (s.kind == SAMPLE_DISTANCE) { return NormalSample(true, s.value); }
  // The sphere's distance is signed and exact inside; exterior-only fields report an interior zero.
  if (s.kind == SAMPLE_INTERIOR && FIELD == FIELD_SPHERE) { return NormalSample(true, s.value); }
  // guard: exp2 only for an estimate inside the binary32 normal range
  if (s.kind == SAMPLE_LOG2 && s.value >= LOG2_SAMPLE_FLOOR && s.value < LOG2_DE_LIMIT) { return NormalSample(true, exp2(s.value)); }
  return NormalSample(false, 0.0);
}

fn evaluate_normal(px: vec2<u32>, word: u32, t: f32) -> vec4<f32> {
  if ((word & 15u) != RAY_STATUS_HIT || !profile_admitted() || !finite_f32(t) || !(t >= 0.0)) { return NORMAL_UNAVAILABLE; }
  let p = field_position(u.origin_high, u.origin_low, pixel_direction(px), t);
  let epsilon = 0.5 * max(u.tolerance_floor, u.tolerance_factor * u.alpha * t);
  if (!(epsilon > 0.0) || !finite_f32(epsilon)) { return NORMAL_UNAVAILABLE; }
  var gradient = vec3<f32>(0.0);
  for (var axis = 0u; axis < 3u; axis++) {
    var offset = vec3<f32>(0.0);
    offset[axis] = epsilon;
    let plus = p + offset;
    let minus = p - offset;
    // Indistinguishable at effective precision: the sample positions must differ from each other and from p.
    if (plus[axis] == minus[axis] || plus[axis] == p[axis] || minus[axis] == p[axis]) { return NORMAL_UNAVAILABLE; }
    let a = normal_sample(plus);
    let b = normal_sample(minus);
    if (!a.resolved || !b.resolved) { return NORMAL_UNAVAILABLE; }
    // guard: the effective separation plus − minus is nonzero (checked above) and both values are finite
    gradient[axis] = (a.value - b.value) / (plus[axis] - minus[axis]);
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
