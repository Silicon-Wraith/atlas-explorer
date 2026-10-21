// The point-list evaluator (plan B08): effective points in, PointResult words out. Used by the
// numerics validation and by camera classification under effective inputs. FIELD selects the
// family (kernels.js FIELD_IDS: 0 sphere, 1 box, 2 menger, 3 mandelbulb, 4 quaternion-julia); power
// and parameters are uniforms. Points are a row-major grid of `pitch` columns; each batch carries
// its region (origin, size) and the exclusive end index in its own uniforms and bounds-checks every
// invocation (the frozen 8×8 dispatch ABI; the backend injects nothing).
override FIELD: u32 = 0u;

struct PointUniforms {
  origin: vec2<u32>, size: vec2<u32>, c: vec4<f32>,
  end: u32, pitch: u32, cap: u32, power: u32,
  kappa: f32, bound: f32, depth: u32, reserved: u32,
};
// 64 bytes. Fractal fields fill status..deriv_e; analytic fields fill status (escaped = valid,
// numerical failure) and distance/applicability. `field` echoes FIELD so a readback names its kernel.
struct PointResult {
  status: u32, index: u32, estimate: u32, deriv_zero: u32,
  value: vec4<f32>,
  log_r: f32, log2_de: f32, deriv_m: f32, deriv_e: i32,
  distance: f32, applicability: u32, field: u32, flags: u32,
};

@group(0) @binding(0) var<uniform> u: PointUniforms;
@group(0) @binding(1) var<storage, read> points: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> results: array<PointResult>;
@group(0) @binding(3) var<storage, read> menger_boxes: array<MengerBox>;

fn point_index(gid: vec3<u32>) -> u32 {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return 0xffffffffu; }
  let i = (u.origin.y + gid.y) * u.pitch + u.origin.x + gid.x;
  if (i >= u.end || i >= arrayLength(&points) || i >= arrayLength(&results)) { return 0xffffffffu; }
  return i;
}

fn fractal_result(e: PointEval) -> PointResult {
  var out: PointResult;
  out.status = e.status; out.index = e.index; out.estimate = e.estimate; out.deriv_zero = select(0u, 1u, e.d.zero);
  out.value = e.value; out.log_r = e.log_r; out.log2_de = e.log2_de; out.deriv_m = e.d.m; out.deriv_e = e.d.e;
  out.applicability = 3u; out.field = FIELD;
  return out;
}

fn analytic_result(e: AnalyticEval) -> PointResult {
  var out: PointResult;
  out.status = select(POINT_STATUS_NUMERICAL_FAILURE, POINT_STATUS_ESCAPED, e.valid);
  out.estimate = ESTIMATE_GUARD; out.deriv_zero = 1u;
  out.distance = e.distance; out.applicability = e.applicability; out.field = FIELD;
  return out;
}

@compute @workgroup_size(8, 8, 1)
fn evaluate_points(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = point_index(gid);
  if (i == 0xffffffffu) { return; }
  let p = points[i].xyz;
  if (FIELD == 3u) { results[i] = fractal_result(bulb_eval(p, u.power, u.cap)); }
  else if (FIELD == 4u) { results[i] = fractal_result(qjulia_eval(vec4<f32>(p, u.kappa), u.c, u.bound, u.cap)); }
  else if (FIELD == 0u) { results[i] = analytic_result(sphere_distance(p)); }
  else if (FIELD == 1u) { results[i] = analytic_result(box_distance(p)); }
  else if (FIELD == 2u) { results[i] = analytic_result(menger_distance(p, u.depth)); }
  else { results[i] = fractal_result(failure_eval(0u)); }
}

// The range-safe derivative alone (spec §10.4): each probe (grow, add, updates, 0) applies
// D' = grow·D + add `updates` times from the zero state.
@compute @workgroup_size(8, 8, 1)
fn evaluate_derivative(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = point_index(gid);
  if (i == 0xffffffffu) { return; }
  let probe = points[i];
  var d = derivative_zero();
  let admitted = finite_f32(probe.x) && probe.x >= 0.0 && probe.x <= 1048576.0 && (probe.y == 0.0 || probe.y == 1.0)
    && finite_f32(probe.z) && probe.z >= 0.0 && probe.z <= f32(MAX_ITERATIONS);
  if (!admitted) { results[i] = fractal_result(failure_eval(0u)); return; }
  let updates = u32(probe.z);
  for (var n = 0u; n < updates; n++) {
    // guard: grow is admitted finite in [0, 2^20] and add ∈ {0, 1}
    d = derivative_update(d, probe.x, probe.y);
  }
  results[i] = fractal_result(not_escaped_eval(updates, vec4<f32>(0.0), d));
}
