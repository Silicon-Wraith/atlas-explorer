// spikes/project0/gpu/view.wgsl — A.1 camera rays for one band; writes depth, status, normal.
struct Camera { origin: vec4f, fwd: vec4f, right: vec4f, up: vec4f, size: vec4u, band: vec4u }   // size = (W, H, 0, 0); band = (row0, rows, col0, cols)
@group(1) @binding(0) var<uniform> cam: Camera;
@group(1) @binding(1) var depth_out: texture_storage_2d<r32float, write>;
@group(1) @binding(2) var status_out: texture_storage_2d<r32uint, write>;
@group(1) @binding(3) var normal_out: texture_storage_2d<rgba16float, write>;
const NORMAL_UNAVAILABLE: u32 = 256u;   // bit 8 of status; bits 0..3 ray status, bits 4..7 reason

fn normal_at(p: vec3f, eps: f32) -> vec4f {
  var g = vec3f(0.0);
  for (var a: u32 = 0u; a < 3u; a++) {
    var o = vec3f(0.0); o[a] = eps;
    let x = field(p + o); let y = field(p - o);
    if (x.status != ST_ESCAPED || y.status != ST_ESCAPED) { return vec4f(0.0); }
    g[a] = (x.de - y.de) / (2.0 * eps);
  }
  let l = length(g);
  if (!(l > 0.0) || l > 3.4e38) { return vec4f(0.0); }
  return vec4f(g / l, 1.0);
}

@compute @workgroup_size(8, 8)
fn view_band(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= cam.band.w || id.y >= cam.band.y) { return; }
  let px = cam.band.z + id.x;  let py = cam.band.x + id.y;
  let w = f32(cam.size.x);  let h = f32(cam.size.y);  let th = 0.57735026918962576;   // tan(30 degrees)
  let sx = (2.0 * (f32(px) + 0.5) / w - 1.0) * th * w / h;
  let sy = (1.0 - 2.0 * (f32(py) + 0.5) / h) * th;
  let d = normalize(cam.fwd.xyz + sx * cam.right.xyz + sy * cam.up.xyz);
  let r = trace_ray(cam.origin.xyz, d);
  var code = r.status | (r.reason << 4u);
  var n = vec4f(0.0);
  if (r.status == RAY_HIT) {
    n = normal_at(cam.origin.xyz + r.t * d, 0.5 * max(prof.floor, prof.factor * prof.alpha * r.t));
    if (n.w == 0.0) { code = code | NORMAL_UNAVAILABLE; }
  }
  let c = vec2u(px, py);
  textureStore(depth_out, c, vec4f(r.t, 0.0, 0.0, 0.0));
  textureStore(status_out, c, vec4u(code, 0u, 0u, 0u));
  textureStore(normal_out, c, n);
}
