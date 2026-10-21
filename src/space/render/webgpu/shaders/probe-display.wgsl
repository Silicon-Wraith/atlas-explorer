// B06 self-check: a known rgba8unorm display pattern (x & 255, y & 255, (x ^ y) & 255, 255) for the
// presentation check. Values k / 255 round-trip exactly through unorm8 storage.
struct ProbeUniforms { origin: vec2<u32>, size: vec2<u32> };
@group(0) @binding(0) var<uniform> u: ProbeUniforms;
@group(0) @binding(1) var display: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn probe_display(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = u.origin + gid.xy;
  let bytes = vec4<u32>(p.x & 255u, p.y & 255u, (p.x ^ p.y) & 255u, 255u);
  textureStore(display, vec2<i32>(p), vec4<f32>(bytes) / 255.0);
}
