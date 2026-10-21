// B06 self-check: a fixed 64-step sphere trace into the r32float depth target. Exercises a loop-
// bearing compute pipeline through preparation; it is not a product kernel (B10 owns tracing).
struct TraceUniforms { origin: vec2<u32>, size: vec2<u32> };
@group(0) @binding(0) var<uniform> u: TraceUniforms;
@group(0) @binding(1) var depth: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8, 1)
fn selfcheck_trace(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = u.origin + gid.xy;
  let ndc = (vec2<f32>(gid.xy) + 0.5) / vec2<f32>(u.size) * 2.0 - 1.0;
  let eye = vec3<f32>(0.0, 0.0, -3.0);
  let dir = normalize(vec3<f32>(ndc.x, -ndc.y, 1.5));
  var t = 0.0;
  var hit = -1.0;
  for (var step = 0u; step < 64u; step++) {
    let d = length(eye + dir * t) - 1.0;
    if (d < 1e-4) { hit = t; break; }
    t = t + d;
  }
  textureStore(depth, vec2<i32>(p), vec4<f32>(hit, 0.0, 0.0, 1.0));
}
