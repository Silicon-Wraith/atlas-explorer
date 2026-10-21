// shade_band and the diagnostic view modes, APPEARANCE_VERSION space-appearance-v1 (plan B11; spec §8.1
// step 4, §8.2, §7.6). Assembled after fields.wgsl, a Menger adapter and trace.wgsl, so a secondary ray is
// the same §11.4 tracer (march) and every secondary field value the same field_sample.
//   shade_band: the neutral inspection light in linear colour. In the full stage it adds one bounded shadow
//     ray (u.max_steps, the descriptor's `shadowSteps` <= 64) and restrained AO from at most five bounded
//     samples along the normal. Each failure is kept in `lightingStatus` with its status, reason and
//     subreason (B00 packLightingStatus layout); shadow and AO failures are independent and may coexist.
//     Unknown visibility is never shaded as known lit or known occluded: a pixel with any lighting failure
//     carries the legend colour of that failure, and the accumulate pass propagates it (accumulationFlags).
//   diagnostic_normals / _depth / _steps / _termination: display-space values that bypass lighting (and fog,
//     which 1b.1 rejects); lightingStatus is written zero.
// Every entry statically uses bindings 0–5 through load_geometry and store_sample, so each descriptor lists
// them densely (B00 ABI: bindings[i] is @binding(i)); only shade_band:menger also uses menger_boxes (6).
// Bindings: appearance.js APPEARANCE_BINDINGS. Every guard precedes the operation it protects.

// The trace.wgsl members keep their names and byte offsets (TraceUniforms, 160 bytes) so that the tracing
// functions read this uniform unchanged; max_steps (offset 60) is the shadow-step cap for shade_band and the
// primary step budget for the diagnostics. The appearance members follow at 160 (176 bytes in all).
struct ShadeUniforms {
  origin: vec2<u32>, size: vec2<u32>, internal_size: vec2<u32>, seed: u32, sample_index: u32,
  origin_high: vec3<f32>, max_iterations: u32,
  origin_low: vec3<f32>, max_steps: u32,
  forward: vec3<f32>, alpha: f32,
  right: vec3<f32>, tolerance_floor: f32,
  up: vec3<f32>, step_multiplier: f32,
  tolerance_factor: f32,
  c: vec4<f32>, kappa: f32, bound: f32, power: u32, depth: u32,
  lighting_stage: u32, ao_samples: u32, shadow_rays: u32,
};
@group(0) @binding(0) var<uniform> u: ShadeUniforms;
@group(0) @binding(1) var depth_in: texture_2d<f32>;
@group(0) @binding(2) var status_in: texture_2d<u32>;
@group(0) @binding(3) var normal_in: texture_2d<f32>;
@group(0) @binding(4) var color_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var lighting_out: texture_storage_2d<r32uint, write>;
@group(0) @binding(6) var<storage, read> menger_boxes: array<MengerBox>;

const STAGE_DIRECT: u32 = 0u;
const STAGE_FULL: u32 = 1u;
// Legend colours (status.js LEGEND; spec §8.2): defined in display space. display_band writes them exactly.
const LEGEND_UNRESOLVED: vec3<f32> = vec3<f32>(1, 0, 1);
const LEGEND_NUMERICAL_FAILURE: vec3<f32> = vec3<f32>(1, 0, 0);
const LEGEND_UNAVAILABLE_NORMAL: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);
// Diagnostic display-space colours (appearance.js TERMINATION_COLOURS: bytes 200 and 24, 28, 40 over 255).
const TERMINATION_HIT: vec3<f32> = vec3<f32>(0.7843137254901961, 0.7843137254901961, 0.7843137254901961);
const TERMINATION_MISS: vec3<f32> = vec3<f32>(0.09411764705882353, 0.10980392156862745, 0.1568627450980392);
const COST_LOW: vec3<f32> = vec3<f32>(0.05, 0.08, 0.3);
const COST_HIGH: vec3<f32> = vec3<f32>(1.0, 0.85, 0.2);
// The neutral inspection light (linear colour): a camera-relative key from upper left, behind the viewer.
const LIGHT_RIGHT: f32 = -0.45;
const LIGHT_UP: f32 = 0.6;
const LIGHT_BACK: f32 = 0.66;
const ALBEDO: f32 = 0.72;
const AMBIENT: f32 = 0.16;
const KEY: f32 = 0.85;
const SPECULAR: f32 = 0.18;
const SHININESS: f32 = 32.0;
const BACKGROUND: vec3<f32> = vec3<f32>(0.01, 0.013, 0.022);
// Secondary rays and samples start SECONDARY_OFFSET·τ(t) off the surface along the normal; restrained AO:
// spacing max(SECONDARY_OFFSET·τ, AO_SPACING·t), weights 1/2^k, occlusion scaled by AO_STRENGTH (AO >= 0.4).
const SECONDARY_OFFSET: f32 = 4.0;
const AO_SPACING: f32 = 0.015;
const AO_STRENGTH: f32 = 0.6;
const AO_MAX_SAMPLES: u32 = 5u; // B00 batch bound aoSamples

struct Geometry { t: f32, word: u32, normal: vec4<f32> }
// A secondary-evaluation failure: B00 ray status (unresolved or numerical failure), reason and subreason.
struct Failure { failed: bool, status: u32, reason: u32, subreason: u32 }
struct Secondary { factor: f32, failure: Failure }

fn region_pixel(gid: vec3<u32>) -> vec3<u32> {
  // z = 1 when the invocation is inside the batch region, the internal size and the target.
  let px = u.origin + gid.xy;
  let dims = textureDimensions(color_out);
  let inside = gid.x < u.size.x && gid.y < u.size.y && px.x < u.internal_size.x && px.y < u.internal_size.y && px.x < dims.x && px.y < dims.y;
  return vec3<u32>(px, select(0u, 1u, inside));
}
fn load_geometry(px: vec2<u32>) -> Geometry {
  let p = vec2<i32>(px);
  return Geometry(textureLoad(depth_in, p, 0).x, textureLoad(status_in, p, 0).x, textureLoad(normal_in, p, 0));
}
fn store_sample(px: vec2<u32>, colour: vec3<f32>, lighting: u32) {
  textureStore(color_out, vec2<i32>(px), vec4<f32>(colour, 1.0));
  textureStore(lighting_out, vec2<i32>(px), vec4<u32>(lighting, 0u, 0u, 1u));
}
// The legend colour of an unresolved or failed primary status (any other status is not a legend case).
fn status_legend(status: u32) -> vec3<f32> { return select(LEGEND_UNRESOLVED, LEGEND_NUMERICAL_FAILURE, status == RAY_STATUS_NUMERICAL_FAILURE); }

fn no_failure() -> Failure { return Failure(false, 0u, 0u, 0u); }
fn numerical_failure() -> Failure { return Failure(true, RAY_STATUS_NUMERICAL_FAILURE, UNRESOLVED_REASON_NONE, STAGNATION_NONE); }
fn unresolved_failure(reason: u32, subreason: u32) -> Failure { return Failure(true, RAY_STATUS_UNRESOLVED, reason, subreason); }
// status.js reduceLightingFailures: a numerical failure wins; otherwise the lexicographic minimum unresolved
// (reason, subreason).
fn reduce_failure(a: Failure, b: Failure) -> Failure {
  if (!b.failed) { return a; }
  if (!a.failed) { return b; }
  if (a.status == RAY_STATUS_NUMERICAL_FAILURE) { return a; }
  if (b.status == RAY_STATUS_NUMERICAL_FAILURE) { return b; }
  if (b.reason < a.reason || (b.reason == a.reason && b.subreason < a.subreason)) { return b; }
  return a;
}
// status.js packLightingStatus: flag | status << shift | reason << (shift + 2) | subreason << (shift + 6).
fn pack_failure(f: Failure, flag: u32, shift: u32) -> u32 {
  if (!f.failed) { return 0u; }
  return flag | (f.status << shift) | (f.reason << (shift + 2u)) | (f.subreason << (shift + 6u));
}

// One shadow ray toward the light, through march() with an explicit interval. Its parameter continues the
// primary ray's: the virtual origin start − t·l puts the shadow ray's own start at parameter t, so τ along it
// is max(floor, factor·α·(t + s)), never finer than the primary hit's footprint. The interval is the declared
// enclosing volume (trace.wgsl enclosing_interval) from that start onward. Hit: known occluded. Miss: known
// lit. Unresolved or numerical failure: unknown, returned as a failure.
fn shadow_ray(p: vec3<f32>, n: vec3<f32>, l: vec3<f32>, t: f32, tau: f32) -> Secondary {
  let start = p + n * (SECONDARY_OFFSET * tau);
  let origin = start - t * l;
  if (!admissible3(start) || !admissible3(origin)) { return Secondary(1.0, numerical_failure()); }
  let volume = enclosing_interval(origin, vec3<f32>(0.0), l);
  if (volume.kind == 2u || !finite_f32(volume.enter) || !finite_f32(volume.exit)) { return Secondary(1.0, numerical_failure()); }
  if (volume.kind == 1u) { return Secondary(1.0, no_failure()); } // the ray never meets the volume
  let r = march(origin, vec3<f32>(0.0), l, true, Interval(0u, max(t, volume.enter), volume.exit));
  if (r.status == RAY_STATUS_HIT) { return Secondary(0.0, no_failure()); }
  if (r.status == RAY_STATUS_MISS) { return Secondary(1.0, no_failure()); }
  if (r.status == RAY_STATUS_UNRESOLVED) { return Secondary(1.0, unresolved_failure(r.reason, r.subreason)); }
  return Secondary(1.0, numerical_failure());
}

struct AoSample { resolved: bool, distance: f32, failure: Failure }
// One AO field value at q, resolved as the tracer resolves it: an analytic distance, an analytic interior (the
// point lies in the solid: the sphere's signed distance, otherwise zero), or a fractal estimate 2^(log2 DE).
// A field failure is a numerical failure; an unescaped orbit or an unavailable estimate is unresolved.
fn ao_sample(q: vec3<f32>) -> AoSample {
  if (!admissible3(q)) { return AoSample(false, 0.0, numerical_failure()); }
  let s = field_sample(q);
  if (s.kind == SAMPLE_DISTANCE) { return AoSample(true, s.value, no_failure()); }
  if (s.kind == SAMPLE_INTERIOR) { return AoSample(true, min(s.value, 0.0), no_failure()); }
  if (s.kind == SAMPLE_LOG2) {
    if (!finite_f32(s.value) || s.value >= LOG2_DE_LIMIT) { return AoSample(false, 0.0, unresolved_failure(UNRESOLVED_REASON_ESTIMATE_UNAVAILABLE, STAGNATION_NONE)); }
    // guard: s.value < 127, so 2^value is finite (an underflow to zero is a valid, tiny distance)
    return AoSample(true, exp2(s.value), no_failure());
  }
  if (s.kind == SAMPLE_NOT_ESCAPED) { return AoSample(false, 0.0, unresolved_failure(UNRESOLVED_REASON_POINT_BUDGET, STAGNATION_NONE)); }
  if (s.kind == SAMPLE_UNAVAILABLE) { return AoSample(false, 0.0, unresolved_failure(UNRESOLVED_REASON_ESTIMATE_UNAVAILABLE, STAGNATION_NONE)); }
  return AoSample(false, 0.0, numerical_failure());
}
// Restrained AO: every bounded sample is evaluated, and any failure makes the occlusion unknown (the reduced
// failure is returned; the factor is not used).
fn ambient_occlusion(p: vec3<f32>, n: vec3<f32>, t: f32, tau: f32) -> Secondary {
  let spacing = max(SECONDARY_OFFSET * tau, AO_SPACING * t);
  var occlusion = 0.0;
  var total = 0.0;
  var weight = 0.5;
  var failure = no_failure();
  let count = min(u.ao_samples, AO_MAX_SAMPLES);
  for (var k = 1u; k <= count; k++) {
    let h = f32(k) * spacing;
    let s = ao_sample(p + n * h);
    if (s.resolved) {
      // guard: h >= spacing > 0 (spacing is checked positive by the caller)
      occlusion += weight * clamp((h - s.distance) / h, 0.0, 1.0);
    } else {
      failure = reduce_failure(failure, s.failure);
    }
    total += weight;
    weight *= 0.5;
  }
  if (failure.failed) { return Secondary(1.0, failure); }
  if (!(total > 0.0)) { return Secondary(1.0, no_failure()); }
  // guard: total > 0 (checked above)
  return Secondary(1.0 - AO_STRENGTH * occlusion / total, no_failure());
}

fn inspection_light() -> vec3<f32> {
  let l = LIGHT_RIGHT * u.right + LIGHT_UP * u.up - LIGHT_BACK * u.forward;
  // guard: right, up and forward are orthonormal, so |l| = |(−0.45, 0.6, 0.66)| ≈ 1.0 and nonzero
  return normalize(l);
}

struct Shaded { colour: vec3<f32>, lighting: u32 }
fn shade(px: vec2<u32>, g: Geometry) -> Shaded {
  let status = g.word & 15u;
  if (status == RAY_STATUS_MISS) { return Shaded(BACKGROUND, 0u); }
  if (status != RAY_STATUS_HIT) { return Shaded(status_legend(status), 0u); }
  // An unavailable normal keeps its depth; it is shown with its legend colour, never lit.
  if (!(g.normal.w > 0.0) || !finite3(g.normal.xyz)) { return Shaded(LEGEND_UNAVAILABLE_NORMAL, 0u); }
  let length2 = dot(g.normal.xyz, g.normal.xyz);
  if (!(length2 > 0.25)) { return Shaded(LEGEND_UNAVAILABLE_NORMAL, 0u); }
  // guard: |n|² > 0.25 (checked above; an available normal is unit length within rgba16float rounding)
  let n = normalize(g.normal.xyz);
  let d = pixel_direction(px);
  let l = inspection_light();
  let diffuse = max(dot(n, l), 0.0);
  var visibility = 1.0;
  var ao = 1.0;
  var lighting = 0u;
  if (u.lighting_stage == STAGE_FULL) {
    var shadow_failure = no_failure();
    var ao_failure = no_failure();
    let p = field_position(u.origin_high, u.origin_low, d, g.t);
    let tau = max(u.tolerance_floor, u.tolerance_factor * u.alpha * g.t);
    if (!admissible3(p) || !finite_f32(g.t) || !(g.t >= 0.0) || !finite_f32(tau) || !(tau > 0.0)) {
      // Neither secondary evaluation can start: both are numerical failures.
      if (u.shadow_rays >= 1u && diffuse > 0.0) { shadow_failure = numerical_failure(); }
      if (u.ao_samples >= 1u) { ao_failure = numerical_failure(); }
    } else {
      // A surface facing away from the light is unlit by the key whatever lies between: no shadow ray.
      if (u.shadow_rays >= 1u && u.max_steps >= 1u && diffuse > 0.0) {
        let s = shadow_ray(p, n, l, g.t, tau);
        visibility = s.factor;
        shadow_failure = s.failure;
      }
      if (u.ao_samples >= 1u) {
        let a = ambient_occlusion(p, n, g.t, tau);
        ao = a.factor;
        ao_failure = a.failure;
      }
    }
    lighting = pack_failure(shadow_failure, LIGHTING_FAILURE_FLAGS_SHADOW, 2u) | pack_failure(ao_failure, LIGHTING_FAILURE_FLAGS_AO, 12u);
    if (lighting != 0u) {
      let numerical = (shadow_failure.failed && shadow_failure.status == RAY_STATUS_NUMERICAL_FAILURE) || (ao_failure.failed && ao_failure.status == RAY_STATUS_NUMERICAL_FAILURE);
      return Shaded(select(LEGEND_UNRESOLVED, LEGEND_NUMERICAL_FAILURE, numerical), lighting);
    }
  }
  // guard: d is a unit direction, so l − d is zero only when l = d (the light behind the surface point along the view)
  let half_vector = l - d;
  var specular = 0.0;
  if (diffuse > 0.0 && dot(half_vector, half_vector) > 0.0) {
    // guard: |l − d|² > 0 (checked above)
    let h = normalize(half_vector);
    let nh = dot(n, h);
    if (nh > 0.0) {
      // guard: nh > 0 (checked above), so pow is defined
      specular = SPECULAR * pow(nh, SHININESS);
    }
  }
  return Shaded(ALBEDO * (AMBIENT * ao + KEY * diffuse * visibility) + vec3<f32>(specular * visibility), lighting);
}

@compute @workgroup_size(8, 8, 1)
fn shade_band(@builtin(global_invocation_id) gid: vec3<u32>) {
  let at = region_pixel(gid);
  if (at.z == 0u) { return; }
  let s = shade(at.xy, load_geometry(at.xy));
  store_sample(at.xy, s.colour, s.lighting);
}

// Diagnostics: display-space values. A primary unresolved or failed ray takes its legend colour.
fn diagnostic_common(g: Geometry) -> vec4<f32> {
  // w = 1 when the colour is decided here (a miss or a legend status).
  let status = g.word & 15u;
  if (status == RAY_STATUS_MISS) { return vec4<f32>(TERMINATION_MISS, 1.0); }
  if (status != RAY_STATUS_HIT) { return vec4<f32>(status_legend(status), 1.0); }
  return vec4<f32>(0.0);
}

@compute @workgroup_size(8, 8, 1)
fn diagnostic_normals(@builtin(global_invocation_id) gid: vec3<u32>) {
  let at = region_pixel(gid);
  if (at.z == 0u) { return; }
  let g = load_geometry(at.xy);
  let decided = diagnostic_common(g);
  var colour = decided.xyz;
  if (decided.w == 0.0) {
    colour = select(LEGEND_UNAVAILABLE_NORMAL, clamp(g.normal.xyz * 0.5 + 0.5, vec3<f32>(0.0), vec3<f32>(1.0)), g.normal.w > 0.0 && finite3(g.normal.xyz));
  }
  store_sample(at.xy, colour, 0u);
}

// Depth normalized by the enclosing interval of the pixel's ray: 1 (bright) at the interval's start, 0 at its exit.
@compute @workgroup_size(8, 8, 1)
fn diagnostic_depth(@builtin(global_invocation_id) gid: vec3<u32>) {
  let at = region_pixel(gid);
  if (at.z == 0u) { return; }
  let g = load_geometry(at.xy);
  let decided = diagnostic_common(g);
  var colour = decided.xyz;
  if (decided.w == 0.0) {
    let volume = enclosing_interval(u.origin_high, u.origin_low, pixel_direction(at.xy));
    let start = max(0.0, volume.enter);
    let extent = volume.exit - start;
    if (volume.kind != 0u || !finite_f32(extent) || !(extent > 0.0) || !finite_f32(g.t)) {
      colour = LEGEND_NUMERICAL_FAILURE; // a hit without an interval is not a depth
    } else {
      // guard: extent > 0 and finite (checked above)
      let v = clamp((g.t - start) / extent, 0.0, 1.0);
      colour = vec3<f32>(1.0 - v);
    }
  }
  store_sample(at.xy, colour, 0u);
}

// Computational cost (spec §8.2: never estimator error): the step count over the primary step budget.
@compute @workgroup_size(8, 8, 1)
fn diagnostic_steps(@builtin(global_invocation_id) gid: vec3<u32>) {
  let at = region_pixel(gid);
  if (at.z == 0u) { return; }
  let g = load_geometry(at.xy);
  let status = g.word & 15u;
  var colour = status_legend(status);
  if (status == RAY_STATUS_HIT || status == RAY_STATUS_MISS) {
    // guard: max(max_steps, 1) >= 1
    let cost = clamp(f32(g.word >> 12u) / f32(max(u.max_steps, 1u)), 0.0, 1.0);
    colour = mix(COST_LOW, COST_HIGH, cost);
  }
  store_sample(at.xy, colour, 0u);
}

@compute @workgroup_size(8, 8, 1)
fn diagnostic_termination(@builtin(global_invocation_id) gid: vec3<u32>) {
  let at = region_pixel(gid);
  if (at.z == 0u) { return; }
  let g = load_geometry(at.xy);
  let decided = diagnostic_common(g);
  store_sample(at.xy, select(decided.xyz, TERMINATION_HIT, decided.w == 0.0), 0u);
}
