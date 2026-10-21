// spikes/project0/gpu/arithmetic.wgsl — G4/G5 sample entry points and the policy readback.
// G5-D (prereg docs/reports/project0/webgpu-g5d-prereg.md §3, §8.4): every G5 path (plane, operational, forced-continuation diagnostic)
// calls q_update_g5d, the plain fields.wgsl polynomial qsq (unchanged) plus the parameter. The G5-A helpers below are kept unchanged for the
// historical remediation_* validation entry points only; no G5 path uses q_update.
struct Count { n: u32, cap: u32, _a: u32, _b: u32 }
@group(0) @binding(0) var<uniform> count: Count;
@group(0) @binding(1) var<storage, read> inputs: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> outputs: array<vec4u>;

// G5-A (WebGPU remediation preregistration rev 2, §2.2; historical, superseded for G5 by G5-D): the compensated quaternion update. Each component is Ogita–Rump–Oishi Dot2 over
// the old state, with the parameter inside the compensated sum, evaluated in exactly this order with explicitly typed f32 intermediates:
// ordinary multiplication for the product, the builtin fma(a, b, -p) for its residual, the six-operation TwoSum. Compensation is local to
// one update; no low component is carried between iterations. WGSL may still fuse, contract or reassociate (prereg §2.4); the CPU models
// F, U, S, DB and SDB in remediation/ predict the consequences, and acceptance requires the compiled result to match Model F.
struct F2 { hi: f32, lo: f32 }
fn two_product_fma(a: f32, b: f32) -> F2 {
  let p: f32 = a * b;
  let e: f32 = fma(a, b, -p);
  return F2(p, e);
}
fn two_sum(a: f32, b: f32) -> F2 {
  let s: f32 = a + b;
  let v: f32 = s - a;
  let aa: f32 = s - v;
  let da: f32 = a - aa;
  let db: f32 = b - v;
  let e: f32 = da + db;
  return F2(s, e);
}
// CompDot: (p, s) = TwoProductFMA(x[0], y[0]); then per term (h, r) = TwoProductFMA(x[i], y[i]); (p, q) = TwoSum(p, h); t = q + r; s = s + t.
fn dot2_start(x: f32, y: f32) -> F2 { return two_product_fma(x, y); }
fn dot2_step(acc: F2, x: f32, y: f32) -> F2 {
  let hr: F2 = two_product_fma(x, y);
  let pq: F2 = two_sum(acc.hi, hr.hi);
  let t: f32 = pq.lo + hr.lo;
  let s: f32 = acc.lo + t;
  return F2(pq.hi, s);
}
fn dot2_end(acc: F2) -> f32 { return acc.hi + acc.lo; }
// x = [a, -b, -c, -d, Cr], y = [a, b, c, d, 1];  [a, b, Ci]·[b, a, 1];  [a, c, Cj]·[c, a, 1];  [a, d, Ck]·[d, a, 1]. All four read the old state.
fn q_update(q: vec4f, c: vec4f) -> vec4f {
  let a: f32 = q.x;  let b: f32 = q.y;  let qc: f32 = q.z;  let d: f32 = q.w;
  var re: F2 = dot2_start(a, a);
  re = dot2_step(re, -b, b);
  re = dot2_step(re, -qc, qc);
  re = dot2_step(re, -d, d);
  re = dot2_step(re, c.x, 1.0);
  var ci: F2 = dot2_start(a, b);
  ci = dot2_step(ci, b, a);
  ci = dot2_step(ci, c.y, 1.0);
  var cj: F2 = dot2_start(a, qc);
  cj = dot2_step(cj, qc, a);
  cj = dot2_step(cj, c.z, 1.0);
  var ck: F2 = dot2_start(a, d);
  ck = dot2_step(ck, d, a);
  ck = dot2_step(ck, c.w, 1.0);
  let r0: f32 = dot2_end(re);  let r1: f32 = dot2_end(ci);  let r2: f32 = dot2_end(cj);  let r3: f32 = dot2_end(ck);
  return vec4f(r0, r1, r2, r3);
}

// G5-D (prereg §3): the single arithmetic kernel; qsq is the existing fields.wgsl declaration.
fn q_update_g5d(q: vec4f, c: vec4f) -> vec4f {
  return qsq(q) + c;
}

@compute @workgroup_size(64)
fn bulb_samples(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  let e = bulb_eval(inputs[id.x].xyz, count.cap);
  outputs[id.x] = vec4u(e.status, e.index, bitcast<u32>(e.log_r), bitcast<u32>(e.de));
}

// Quaternion recurrence on q0 = (x, y, 0, 0) with C = (Cr, Ci, 0, 0); escape tested at n = 0 .. cap.
@compute @workgroup_size(64)
fn qjulia_plane(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  let s = inputs[id.x];
  var q = vec4f(s.x, s.y, 0.0, 0.0);
  let c = vec4f(s.z, s.w, 0.0, 0.0);
  var out = vec4u(ST_BUDGET, 0u, 0u, 0u);
  for (var n: u32 = 0u; n <= count.cap; n++) {
    let r = length(q);
    if (r > 2.0) { out = vec4u(ST_ESCAPED, n, bitcast<u32>(log(r)), 0u); break; }
    if (n == count.cap) { break; }
    q = q_update_g5d(q, c);                             // G5-D; |q| <= 2 here, so no overflow
  }
  outputs[id.x] = out;
}

// inputs[0] = q0, inputs[1] = C; eight iterates written as bitcast vec4f. Statically uses bindings 1 and 2 only.
@compute @workgroup_size(1)
fn qjulia_offplane() {
  var q = inputs[0];
  let c = inputs[1];
  for (var n: u32 = 0u; n < 8u; n++) { q = q_update_g5d(q, c); outputs[n] = bitcast<vec4u>(q); }   // G5-D forced-continuation diagnostic
}

// G5-D operational orbits (prereg §4.3; layout qualification/g5d-config.js), runtime inputs only: inputs[3i] = q0, inputs[3i + 1] = C,
// inputs[3i + 2].x = the certified binary32 escape radius R. Escape is length(q) > R, tested at n = 0 and after each update n = 1 .. cap.
// outputs[(cap + 1) i] = (status, index, log-radius word, completed updates); outputs[(cap + 1) i + n] = q_n for each completed update n.
// A norm that is neither > R nor <= R (NaN) is a numerical failure at that update.
@compute @workgroup_size(64)
fn qjulia_operational(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  let base = (count.cap + 1u) * id.x;
  var q = inputs[3u * id.x];
  let c = inputs[3u * id.x + 1u];
  let radius = inputs[3u * id.x + 2u].x;
  var out = vec4u(ST_BUDGET, 0u, 0u, count.cap);
  for (var n: u32 = 0u; n <= count.cap; n++) {
    let r = length(q);
    if (r > radius) { out = vec4u(ST_ESCAPED, n, bitcast<u32>(log(r)), n); break; }
    if (!(r <= radius)) { out = vec4u(ST_FAILURE, n, 0u, n); break; }
    if (n == count.cap) { break; }
    q = q_update_g5d(q, c);
    outputs[base + n + 1u] = bitcast<vec4u>(q);
  }
  outputs[base] = out;
}

@compute @workgroup_size(64)
fn derivative_policy(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  outputs[id.x] = vec4u(select(0u, 1u, derivative_fits(inputs[id.x].x, inputs[id.x].y)), 0u, 0u, 0u);
}

// G5-A supplementary validation (prereg §2.6): the same helper source and module as the qualification entry points, runtime inputs only.
// inputs[i] = (a, b, _, _): outputs[i] = (TwoProductFMA(a, b).hi, .lo, TwoSum(a, b).hi, .lo)
@compute @workgroup_size(64)
fn remediation_primitives(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  let v = inputs[id.x];
  let p: F2 = two_product_fma(v.x, v.y);
  let s: F2 = two_sum(v.x, v.y);
  outputs[id.x] = vec4u(bitcast<u32>(p.hi), bitcast<u32>(p.lo), bitcast<u32>(s.hi), bitcast<u32>(s.lo));
}
// inputs[i] = (x0, y0, x1, y1): outputs[i].x = CompDot([x0, x1], [y0, y1])
@compute @workgroup_size(64)
fn remediation_dot(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  let v = inputs[id.x];
  let r: f32 = dot2_end(dot2_step(dot2_start(v.x, v.y), v.z, v.w));
  outputs[id.x] = vec4u(bitcast<u32>(r), 0u, 0u, 0u);
}
// inputs[2i] = q, inputs[2i + 1] = C: outputs[i] = q_update(q, C)
@compute @workgroup_size(64)
fn remediation_updates(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  outputs[id.x] = bitcast<vec4u>(q_update(inputs[2u * id.x], inputs[2u * id.x + 1u]));
}
