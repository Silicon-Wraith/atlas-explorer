// spikes/project0/gpu/compensated.wgsl — A.11: pairs for O, t, p and the iterate; everything else ordinary f32.
// The `* barrier.one` factors are an experimental attempt to keep the required rounding; only the primitive checks validate it.
struct Barrier { one: f32, _a: f32, _b: f32, _c: f32 }
@group(1) @binding(0) var<uniform> barrier: Barrier;          // one = 1.0, opaque to the compiler
fn two_sum(a: f32, b: f32) -> vec2f { let s = (a + b) * barrier.one; let bb = (s - a) * barrier.one; return vec2f(s, (a - (s - bb)) + (b - bb)); }
fn quick_two_sum(a: f32, b: f32) -> vec2f { let s = (a + b) * barrier.one; return vec2f(s, b - (s - a) * barrier.one); }
fn split(a: f32) -> vec2f { let t = (4097.0 * a) * barrier.one; let hi = t - (t - a) * barrier.one; return vec2f(hi, a - hi); }
fn two_prod(a: f32, b: f32) -> vec2f {
  let p = (a * b) * barrier.one; let x = split(a); let y = split(b);
  return vec2f(p, ((x.x * y.x - p) + x.x * y.y + x.y * y.x) + x.y * y.y);
}
fn add_ff(a: vec2f, b: vec2f) -> vec2f {
  let s = two_sum(a.x, b.x); let t = two_sum(a.y, b.y);
  let u = quick_two_sum(s.x, s.y + t.x); return quick_two_sum(u.x, u.y + t.y);
}
fn mul_ff_f32(a: vec2f, b: f32) -> vec2f { let p = two_prod(a.x, b); return quick_two_sum(p.x, p.y + a.y * b); }

struct FF3 { x: vec2f, y: vec2f, z: vec2f }
fn bulb_eval_ff(p: FF3, cap: u32) -> Eval {
  var z = FF3(vec2f(0.0), vec2f(0.0), vec2f(0.0));
  var dr: f32 = 0.0;
  for (var n: u32 = 1u; n <= cap; n++) {
    let zf = vec3f(z.x.x + z.x.y, z.y.x + z.y.y, z.z.x + z.z.y);       // round_f32(z^ff)
    let r = length(zf);
    var w = vec3f(0.0); var grow: f32 = 0.0;
    if (r > 0.0) {
      let theta = acos(clamp(zf.z / r, -1.0, 1.0)); var phi: f32 = 0.0;
      if (zf.x != 0.0 || zf.y != 0.0) { phi = atan2(zf.y, zf.x); }
      let r2 = r * r; let r4 = r2 * r2; grow = 8.0 * r4 * r2 * r; let s = sin(8.0 * theta);
      w = (r4 * r4) * vec3f(s * cos(8.0 * phi), s * sin(8.0 * phi), cos(8.0 * theta));
    }
    if (!(dr < 1e34) && !derivative_fits(grow, dr)) { return Eval(ST_FAILURE, n, 0.0, 0.0); }
    dr = grow * dr + 1.0;
    z = FF3(add_ff(vec2f(w.x, 0.0), p.x), add_ff(vec2f(w.y, 0.0), p.y), add_ff(vec2f(w.z, 0.0), p.z));
    let big_r = length(vec3f(z.x.x + z.x.y, z.y.x + z.y.y, z.z.x + z.z.y));
    if (big_r > 2.0) { let lr = log(big_r); return Eval(ST_ESCAPED, n, lr, 0.5 * lr * big_r / dr); }
  }
  return Eval(ST_BUDGET, 0u, 0.0, 0.0);
}

@group(0) @binding(2) var<storage, read> origin_ff: array<vec2f, 3>;        // (hi, lo) per component, from CPU doubles
@group(0) @binding(3) var<storage, read> directions_f: array<vec4f>;          // d_ray, ordinary f32
@group(0) @binding(4) var<storage, read_write> results_ff: array<vec4u>;

@compute @workgroup_size(64)
fn trace_ff_list(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= prof.count) { return; }
  let i = prof.start + id.x; let d = directions_f[i].xyz;
  let o = vec3f(origin_ff[0].x + origin_ff[0].y, origin_ff[1].x + origin_ff[1].y, origin_ff[2].x + origin_ff[2].y);
  let iv = bound(o, d);
  var out = vec4u(RAY_MISS, WHY_NONE, 0u, 0u);
  if (iv.z != 0.0 && iv.y >= max(0.0, iv.x)) {
    var t = vec2f(max(0.0, iv.x), 0.0);
    var done = false;
    for (var step: u32 = 0u; step < prof.steps; step++) {
      if (t.x + t.y > iv.y) { out = vec4u(RAY_MISS, WHY_NONE, 0u, step); done = true; break; }
      let p = FF3(add_ff(origin_ff[0], mul_ff_f32(t, d.x)), add_ff(origin_ff[1], mul_ff_f32(t, d.y)), add_ff(origin_ff[2], mul_ff_f32(t, d.z)));
      let e = bulb_eval_ff(p, prof.iterations);
      let tt = t.x + t.y;
      if (e.status == ST_BUDGET) { out = vec4u(RAY_UNRESOLVED, WHY_POINT, bitcast<u32>(tt), step + 1u); done = true; break; }
      if (e.status == ST_FAILURE) { out = vec4u(RAY_FAILURE, WHY_NONE, bitcast<u32>(tt), step + 1u); done = true; break; }
      if (e.de < max(prof.floor, prof.factor * prof.alpha * tt)) { out = vec4u(RAY_HIT, WHY_NONE, bitcast<u32>(tt), step + 1u); done = true; break; }
      t = add_ff(t, vec2f(prof.k * e.de, 0.0));
    }
    if (!done) { out = select(vec4u(RAY_UNRESOLVED, WHY_STEPS, bitcast<u32>(t.x + t.y), prof.steps), vec4u(RAY_MISS, WHY_NONE, 0u, prof.steps), t.x + t.y > iv.y); }
  }
  results_ff[i] = out;
}

// Primitive validation. Case i: prim_in[2i] = (a.hi, a.lo, b.hi, b.lo), prim_in[2i+1] = (op, then.hi, then.lo, 0);
// op 0 = two_sum(a.hi, b.hi), 1 = add_ff(a, b), 2 = mul_ff_f32(a, b.hi). The produced pair feeds add_ff(r, then).
@group(0) @binding(5) var<storage, read> prim_in: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> prim_out: array<vec4f>;
@compute @workgroup_size(1)
fn primitives(@builtin(workgroup_id) wg: vec3u) {
  let v = prim_in[2u * wg.x]; let c = prim_in[2u * wg.x + 1u]; var r = vec2f(0.0);
  if (c.x == 0.0) { r = two_sum(v.x, v.z); } else if (c.x == 1.0) { r = add_ff(v.xy, v.zw); } else { r = mul_ff_f32(v.xy, v.z); }
  let then = add_ff(r, c.yz);
  prim_out[wg.x] = vec4f(r.x, r.y, then.x, then.y);
}
