// spikes/project0/gpu/trace.wgsl — the A.2 marcher. Step accounting follows the spec: exit test at step start,
// steps = step + 1 when an evaluation terminates the ray.
const RAY_HIT: u32 = 0u;  const RAY_MISS: u32 = 1u;  const RAY_UNRESOLVED: u32 = 2u;  const RAY_FAILURE: u32 = 3u;
const WHY_NONE: u32 = 0u;  const WHY_POINT: u32 = 1u;  const WHY_STEPS: u32 = 2u;
override FIELD: u32 = 3u;   // 0 sphere, 1 rotated box, 2 Menger union (boxes buffer), 3 Mandelbulb

struct Profile { k: f32, floor: f32, factor: f32, alpha: f32, steps: u32, iterations: u32, start: u32, count: u32, box_count: u32, _a: u32, _b: u32, _c: u32 }
struct Trace { status: u32, reason: u32, t: f32, steps: u32 }

@group(0) @binding(0) var<uniform> prof: Profile;
@group(0) @binding(1) var<storage, read> boxes: array<vec4f>;      // (centre.xyz, half-size) per Menger box

fn field(p: vec3f) -> Eval {
  if (FIELD == 0u) { return Eval(ST_ESCAPED, 0u, 0.0, sphere_distance(p)); }
  if (FIELD == 1u) { return Eval(ST_ESCAPED, 0u, 0.0, rotated_box_distance(p)); }
  if (FIELD == 2u) {
    var d: f32 = 3.4028234e38;
    for (var i: u32 = 0u; i < prof.box_count; i++) { let b = boxes[i]; d = min(d, box_distance(p, b.xyz, vec3f(b.w))); }
    return Eval(ST_ESCAPED, 0u, 0.0, d);
  }
  return bulb_eval(p, prof.iterations);
}

// (entry, exit, ok). Sphere radius 2 for sphere/box, 1.25 for the bulb; box [-1,1]^3 for Menger.
fn bound(o: vec3f, d: vec3f) -> vec3f {
  if (FIELD == 2u) {
    var lo = -3.4028234e38;  var hi = 3.4028234e38;
    for (var i: u32 = 0u; i < 3u; i++) {
      if (d[i] == 0.0) { if (o[i] < -1.0 || o[i] > 1.0) { return vec3f(0.0); } continue; }
      let x = (-1.0 - o[i]) / d[i];  let y = (1.0 - o[i]) / d[i];
      lo = max(lo, min(x, y));  hi = min(hi, max(x, y));
      if (lo > hi) { return vec3f(0.0); }
    }
    return vec3f(lo, hi, 1.0);
  }
  let radius = select(2.0, 1.25, FIELD == 3u);
  let a = dot(d, d);  let b = dot(o, d);  let c = dot(o, o) - radius * radius;
  let disc = b * b - a * c;
  if (disc < 0.0) { return vec3f(0.0); }
  let s = sqrt(disc);
  return vec3f((-b - s) / a, (-b + s) / a, 1.0);
}

fn trace_ray(o: vec3f, d: vec3f) -> Trace {
  let iv = bound(o, d);
  if (iv.z == 0.0 || iv.y < max(0.0, iv.x)) { return Trace(RAY_MISS, WHY_NONE, 0.0, 0u); }
  var t = max(0.0, iv.x);
  for (var step: u32 = 0u; step < prof.steps; step++) {
    if (t > iv.y) { return Trace(RAY_MISS, WHY_NONE, 0.0, step); }
    let e = field(o + t * d);
    if (e.status == ST_BUDGET) { return Trace(RAY_UNRESOLVED, WHY_POINT, t, step + 1u); }
    if (e.status == ST_FAILURE) { return Trace(RAY_FAILURE, WHY_NONE, t, step + 1u); }
    if (e.de < max(prof.floor, prof.factor * prof.alpha * t)) { return Trace(RAY_HIT, WHY_NONE, t, step + 1u); }
    t = t + prof.k * e.de;
  }
  if (t > iv.y) { return Trace(RAY_MISS, WHY_NONE, 0.0, prof.steps); }
  return Trace(RAY_UNRESOLVED, WHY_STEPS, t, prof.steps);
}

@group(0) @binding(2) var<storage, read> origins: array<vec4f>;
@group(0) @binding(3) var<storage, read> directions: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> results: array<vec4u>;

@compute @workgroup_size(64)
fn trace_list(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= prof.count) { return; }
  let i = prof.start + id.x;
  let r = trace_ray(origins[i].xyz, directions[i].xyz);
  results[i] = vec4u(r.status, r.reason, bitcast<u32>(r.t), r.steps);
}
