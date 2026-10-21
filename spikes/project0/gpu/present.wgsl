// spikes/project0/gpu/present.wgsl — A.5 shading into rgba8unorm with workgroup-aggregated coverage; and the canvas blit.
struct Counts { total: atomic<u32>, hit: atomic<u32>, miss: atomic<u32>, point: atomic<u32>, steps: atomic<u32>, failure: atomic<u32>, normal_unavailable: atomic<u32>, _pad: u32 }
@group(0) @binding(0) var status_in: texture_2d<u32>;
@group(0) @binding(1) var normal_in: texture_2d<f32>;
@group(0) @binding(2) var display_out: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<storage, read_write> counts: Counts;
var<workgroup> local: array<atomic<u32>, 7>;

@compute @workgroup_size(8, 8)
fn shade(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li < 7u) { atomicStore(&local[li], 0u); }
  workgroupBarrier();
  let size = textureDimensions(status_in);
  if (id.x < size.x && id.y < size.y) {
    let code = textureLoad(status_in, id.xy, 0).x;
    let status = code & 15u;  let reason = (code >> 4u) & 15u;
    var color = vec3f(0.02, 0.02, 0.03);
    if (status == 0u) {
      atomicAdd(&local[1], 1u);
      if ((code & 256u) != 0u) { atomicAdd(&local[6], 1u); color = vec3f(0.5); }
      else { let n = textureLoad(normal_in, id.xy, 0).xyz; color = vec3f(0.15 + 0.85 * max(0.0, dot(n, normalize(vec3f(1.0, 0.6, 1.5))))); }
    } else if (status == 1u) { atomicAdd(&local[2], 1u); }
    else if (status == 2u) { color = vec3f(1.0, 0.0, 1.0); if (reason == 1u) { atomicAdd(&local[3], 1u); } else { atomicAdd(&local[4], 1u); } }
    else { color = vec3f(1.0, 0.0, 0.0); atomicAdd(&local[5], 1u); }
    atomicAdd(&local[0], 1u);
    textureStore(display_out, id.xy, vec4f(color, 1.0));
  }
  workgroupBarrier();
  if (li == 0u) {
    atomicAdd(&counts.total, atomicLoad(&local[0])); atomicAdd(&counts.hit, atomicLoad(&local[1])); atomicAdd(&counts.miss, atomicLoad(&local[2]));
    atomicAdd(&counts.point, atomicLoad(&local[3])); atomicAdd(&counts.steps, atomicLoad(&local[4])); atomicAdd(&counts.failure, atomicLoad(&local[5]));
    atomicAdd(&counts.normal_unavailable, atomicLoad(&local[6]));
  }
}

@group(0) @binding(0) var display_in: texture_2d<f32>;
@group(0) @binding(1) var<uniform> dst: vec4f;        // (canvas width, canvas height, 0, 0)
struct VOut { @builtin(position) pos: vec4f }
@vertex fn blit_vs(@builtin(vertex_index) i: u32) -> VOut {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return VOut(vec4f(xy * 2.0 - 1.0, 0.0, 1.0));
}
@fragment fn blit_fs(v: VOut) -> @location(0) vec4f {
  let src = textureDimensions(display_in);
  let c = vec2u(min(vec2f(src) - 1.0, floor(v.pos.xy * vec2f(src) / dst.xy)));
  return textureLoad(display_in, c, 0);   // nearest neighbour; a draft at half the backing size is shown at exactly 2x
}
