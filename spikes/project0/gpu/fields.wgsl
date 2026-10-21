// spikes/project0/gpu/fields.wgsl — written from spec A.2–A.4 and the agreed derivative range policy.
const ST_ESCAPED: u32 = 0u;  const ST_BUDGET: u32 = 1u;  const ST_FAILURE: u32 = 2u;   // T1 ARITH_STATUS order
struct Eval { status: u32, index: u32, log_r: f32, de: f32 }

// Range policy: the update grow*dr + 1 is allowed iff its exact real value is <= F32_MAX, for nonnegative finite
// f32 operands. Decided from exponents and an exact 24x24-bit significand product; no operation that could
// overflow is executed.
fn derivative_fits(grow: f32, dr: f32) -> bool {
  if (grow == 0.0 || dr == 0.0) { return true; }
  let g = frexp(grow);  let d = frexp(dr);           // fract in [0.5, 1)
  let e = g.exp + d.exp;                              // product = fract_g * fract_d * 2^e, in [2^(e-2), 2^e)
  if (e <= 127) { return true; }                      // product < 2^127, so +1 stays <= F32_MAX
  if (e >= 130) { return false; }                     // product >= 2^128 > F32_MAX
  let mg = u32(g.fract * 16777216.0);  let md = u32(d.fract * 16777216.0);   // exact 24-bit significands
  let a1 = mg >> 12u;  let a0 = mg & 0xfffu;  let b1 = md >> 12u;  let b0 = md & 0xfffu;
  let mid = a1 * b0 + a0 * b1;                        // < 2^25
  var lo = a0 * b0 + ((mid & 0xfffu) << 12u);
  let hi = a1 * b1 + (mid >> 12u) + (lo >> 24u);      // 48-bit product = hi * 2^24 + lo
  lo = lo & 0xffffffu;
  // F32_MAX = (2^24 - 1) * 2^104, with product = mg*md*2^(e-48):
  if (e == 128) { return hi <= 0xfffffeu; }                          // mg*md <= 2^48 - 2^24 - 1
  return hi < 0x7fffffu || (hi == 0x7fffffu && lo <= 0x7fffffu);     // e == 129: mg*md <= 2^47 - 2^23 - 1
}

// A.2 Mandelbulb: z0 = 0, dr0 = 0, escape when |z| > 2 after an update; the DE is heuristic.
fn bulb_eval(p: vec3f, cap: u32) -> Eval {
  var z = vec3f(0.0);
  var dr: f32 = 0.0;
  for (var n: u32 = 1u; n <= cap; n++) {
    let r = length(z);
    var w = vec3f(0.0);
    var grow: f32 = 0.0;
    if (r > 0.0) {
      let theta = acos(clamp(z.z / r, -1.0, 1.0));
      var phi: f32 = 0.0;
      if (z.x != 0.0 || z.y != 0.0) { phi = atan2(z.y, z.x); }
      let r2 = r * r;  let r4 = r2 * r2;
      grow = 8.0 * r4 * r2 * r;                        // r <= 2 here, so grow <= 1024
      let s = sin(8.0 * theta);
      w = (r4 * r4) * vec3f(s * cos(8.0 * phi), s * sin(8.0 * phi), cos(8.0 * theta));
    }
    // Fast path: grow <= 1024 and dr < 1e34 cannot exceed F32_MAX; otherwise apply the exact policy.
    if (!(dr < 1e34) && !derivative_fits(grow, dr)) { return Eval(ST_FAILURE, n, 0.0, 0.0); }
    dr = grow * dr + 1.0;
    z = w + p;
    let big_r = length(z);
    if (big_r > 2.0) { let lr = log(big_r); return Eval(ST_ESCAPED, n, lr, 0.5 * lr * big_r / dr); }
  }
  return Eval(ST_BUDGET, 0u, 0.0, 0.0);
}

fn qsq(q: vec4f) -> vec4f {   // (a,b,c,d)^2 = (a^2 - b^2 - c^2 - d^2, 2ab, 2ac, 2ad)
  return vec4f(q.x * q.x - q.y * q.y - q.z * q.z - q.w * q.w, 2.0 * q.x * q.y, 2.0 * q.x * q.z, 2.0 * q.x * q.w);
}
fn rot_z(p: vec3f, a: f32) -> vec3f { let c = cos(a); let s = sin(a); return vec3f(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
fn box_distance(p: vec3f, c: vec3f, h: vec3f) -> f32 { return length(max(abs(p - c) - h, vec3f(0.0))); }
fn sphere_distance(p: vec3f) -> f32 { return length(p) - 1.0; }
fn rotated_box_distance(p: vec3f) -> f32 { return box_distance(rot_z(p, -0.52359877559829887), vec3f(0.0), vec3f(1.0, 0.5, 0.25)); }
