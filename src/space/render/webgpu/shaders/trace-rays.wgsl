// trace_rays (plan B10): the validation ray-list entry. It shares march() with trace_band and takes
// explicit rays (B04's analytic and adversarial strata are rays, not camera pixels): each record is
// origin high (w: 1 for an explicit interval), origin low, unit direction, interval (enter, exit).
// Each result is the packed status, the depth bits, the interior detail and the starting parameter.
// Rays are a row-major grid `internal_size.x` wide; the batch region bounds every invocation.
struct TraceRay { high: vec4<f32>, low: vec4<f32>, direction: vec4<f32>, interval: vec4<f32> }
@group(0) @binding(0) var<uniform> u: TraceUniforms;
@group(0) @binding(1) var<storage, read> rays: array<TraceRay>;
@group(0) @binding(2) var<storage, read_write> ray_results: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> menger_boxes: array<MengerBox>;

@compute @workgroup_size(8, 8, 1)
fn trace_rays(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let i = (u.origin.y + gid.y) * u.internal_size.x + u.origin.x + gid.x;
  if (i >= arrayLength(&rays) || i >= arrayLength(&ray_results)) { return; }
  let ray = rays[i];
  let use_given = ray.high.w == 1.0;
  let r = march(ray.high.xyz, ray.low.xyz, ray.direction.xyz, use_given, Interval(0u, ray.interval.x, ray.interval.y));
  ray_results[i] = vec4<u32>(pack_status(r), bitcast<u32>(r.t), r.detail, r.steps);
}
