// spikes/project0/gpu/probe.wgsl — writes out[i] = 3*i + 1 for i < n; n is deliberately not a multiple of 64.
struct Params { n: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.n) { return; }
  out[id.x] = 3u * id.x + 1u;
}
