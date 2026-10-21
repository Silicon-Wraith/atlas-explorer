// trace_band (plan B10; spec §8.1 step 2): one primary ray per pixel of the batch region, through the
// pixel's sample point (i + 0.5 + dx, j + 0.5 + dy) of the request's sample; writes `depth` (the ray
// parameter t, world distance) and the packed `status` word. Bindings: passes.js TRACING_BINDINGS.
@group(0) @binding(0) var<uniform> u: TraceUniforms;
@group(0) @binding(1) var depth_out: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var status_out: texture_storage_2d<r32uint, write>;
@group(0) @binding(3) var<storage, read> menger_boxes: array<MengerBox>;

@compute @workgroup_size(8, 8, 1)
fn trace_band(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let px = u.origin + gid.xy;
  let dims = textureDimensions(depth_out);
  if (px.x >= u.internal_size.x || px.y >= u.internal_size.y || px.x >= dims.x || px.y >= dims.y) { return; }
  let r = trace_pixel(px);
  textureStore(depth_out, vec2<i32>(px), vec4<f32>(r.t, 0.0, 0.0, 1.0));
  textureStore(status_out, vec2<i32>(px), vec4<u32>(pack_status(r), 0u, 0u, 1u));
}
