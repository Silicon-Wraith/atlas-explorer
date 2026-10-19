// spikes/project0/gpu/arithmetic.wgsl — G4/G5 sample entry points and the policy readback.
struct Count { n: u32, cap: u32, _a: u32, _b: u32 }
@group(0) @binding(0) var<uniform> count: Count;
@group(0) @binding(1) var<storage, read> inputs: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> outputs: array<vec4u>;

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
    q = qsq(q) + c;                                     // |q| <= 2 here, so no overflow
  }
  outputs[id.x] = out;
}

// inputs[0] = q0, inputs[1] = C; eight iterates written as bitcast vec4f. Statically uses bindings 1 and 2 only.
@compute @workgroup_size(1)
fn qjulia_offplane() {
  var q = inputs[0];
  let c = inputs[1];
  for (var n: u32 = 0u; n < 8u; n++) { q = qsq(q) + c; outputs[n] = bitcast<vec4u>(q); }
}

@compute @workgroup_size(64)
fn derivative_policy(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  outputs[id.x] = vec4u(select(0u, 1u, derivative_fits(inputs[id.x].x, inputs[id.x].y)), 0u, 0u, 0u);
}
