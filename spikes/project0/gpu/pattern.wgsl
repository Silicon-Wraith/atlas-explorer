// spikes/project0/gpu/pattern.wgsl — A.8 verification pattern k = (13x + 17y + r) mod 251.
// One format per binding: each format has its own variable and entry point; their resource interfaces are disjoint.
struct P { r: u32, row0: u32, rows: u32, width: u32 }
@group(0) @binding(0) var<uniform> p: P;
fn k(x: u32, y: u32) -> u32 { return (13u * x + 17u * y + p.r) % 251u; }
fn inside(id: vec3u) -> bool { return id.x < p.width && id.y < p.rows; }

@group(0) @binding(1) var t_r32float: texture_storage_2d<r32float, write>;
@compute @workgroup_size(16, 16) fn write_r32float(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_r32float, vec2u(id.x, y), vec4f(f32(k(id.x, y)) + 0.25)); }

@group(0) @binding(1) var t_rgba16float: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(16, 16) fn write_rgba16float(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_rgba16float, vec2u(id.x, y), vec4f(f32(k(id.x, y)) + 0.25)); }

@group(0) @binding(1) var t_r32uint: texture_storage_2d<r32uint, write>;
@compute @workgroup_size(16, 16) fn write_r32uint(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_r32uint, vec2u(id.x, y), vec4u(k(id.x, y))); }

@group(0) @binding(1) var t_rgba32float: texture_storage_2d<rgba32float, write>;
@compute @workgroup_size(16, 16) fn write_rgba32float(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_rgba32float, vec2u(id.x, y), vec4f(f32(k(id.x, y)) + 0.25)); }

@group(0) @binding(1) var t_rgba8unorm: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(16, 16) fn write_rgba8unorm(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_rgba8unorm, vec2u(id.x, y), vec4f(f32(k(id.x, y)) / 255.0)); }
