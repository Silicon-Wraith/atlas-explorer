// B06 self-check: the probe pass. Writes ATLS ^ ((y << 16) | x) into an r32uint target over the
// batch region carried in its own uniforms (the backend injects nothing), so (0, 0) reads "ATLS".
struct ProbeUniforms { origin: vec2<u32>, size: vec2<u32> };
@group(0) @binding(0) var<uniform> u: ProbeUniforms;
@group(0) @binding(1) var probe_target: texture_storage_2d<r32uint, write>;
const PROBE_WORD: u32 = 0x41544c53u;

@compute @workgroup_size(8, 8, 1)
fn probe(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = u.origin + gid.xy;
  textureStore(probe_target, vec2<i32>(p), vec4<u32>(PROBE_WORD ^ ((p.y << 16u) | p.x), 0u, 0u, 1u));
}
