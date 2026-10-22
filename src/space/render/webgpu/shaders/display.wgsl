// display_band, APPEARANCE_VERSION space-appearance-v3 (plan B11; spec §8.1 step 6, §8.2, §9.1 "Pipelines"; plan
// rev 5.0 B11 note, implemented by B11b): the mean of the accumulated samples into `display` (rgba8unorm). The sole
// sRGB encoding of the pipeline happens here, and only for shaded (linear) means; diagnostic means are already
// display-space values. A diagnostic outcome recorded in `accumulationFlags` overrides the mean with its legend
// colour, written exactly (round half up to k/255): any numerical failure (primary or secondary), then a primary
// unresolved ray, then — in the shaded and normals modes only — an unavailable normal. A lighting-only unresolved
// outcome (shadow or AO; user decision 2, 2026-10-22) keeps the encoded mean and mixes it with the faint
// desaturated LIGHTING_TINT, in display space so that it marks every flagged pixel whatever its brightness and
// however few of its samples failed; it never uses the primary-failure magenta. The presenter adds no transfer
// function. Bindings: APPEARANCE_BINDINGS.
struct DisplayUniforms { origin: vec2<u32>, size: vec2<u32>, lighting_stage: u32, view_mode: u32 };
@group(0) @binding(0) var<uniform> u: DisplayUniforms;
@group(0) @binding(1) var accumulation_in: texture_2d<f32>;
@group(0) @binding(2) var flags_in: texture_2d<u32>;
@group(0) @binding(3) var display_out: texture_storage_2d<rgba8unorm, write>;

const STAGE_DIAGNOSTIC: u32 = 2u;
const VIEW_SHADED: u32 = 0u;
const VIEW_NORMALS: u32 = 1u;
const LEGEND_UNRESOLVED: vec3<f32> = vec3<f32>(1, 0, 1);
const LEGEND_NUMERICAL_FAILURE: vec3<f32> = vec3<f32>(1, 0, 0);
const LEGEND_UNAVAILABLE_NORMAL: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);
const FLAG_PRIMARY_NUMERICAL_FAILURE: u32 = 1u;
const FLAG_PRIMARY_UNRESOLVED: u32 = 2u;
const FLAG_UNAVAILABLE_NORMAL: u32 = 4u;
const FLAG_SHADOW_UNRESOLVED: u32 = 8u;
const FLAG_SHADOW_NUMERICAL_FAILURE: u32 = 16u;
const FLAG_AO_UNRESOLVED: u32 = 32u;
const FLAG_AO_NUMERICAL_FAILURE: u32 = 64u;
const NUMERICAL_FLAGS: u32 = FLAG_PRIMARY_NUMERICAL_FAILURE | FLAG_SHADOW_NUMERICAL_FAILURE | FLAG_AO_NUMERICAL_FAILURE;
const LIGHTING_UNRESOLVED_FLAGS: u32 = FLAG_SHADOW_UNRESOLVED | FLAG_AO_UNRESOLVED;
// appearance.js LIGHTING_TINT: a muted amber, mixed at LIGHTING_TINT_WEIGHT into the display-space mean.
const LIGHTING_TINT: vec3<f32> = vec3<f32>(0.8, 0.66, 0.36);
const LIGHTING_TINT_WEIGHT: f32 = 0.2;

// A display-space colour as exact unorm8 bytes: floor(v·255 + 0.5)/255 stores back as that byte.
fn exact(c: vec3<f32>) -> vec4<f32> { return vec4<f32>(floor(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)) * 255.0 + 0.5) * (1.0 / 255.0), 1.0); }
// The sRGB transfer function (IEC 61966-2-1) on a clamped linear value.
fn srgb(value: vec3<f32>) -> vec3<f32> {
  let c = clamp(value, vec3<f32>(0.0), vec3<f32>(1.0));
  // guard: c >= 0, so pow is defined (pow(0, 1/2.4) = 0 is selected away below the threshold anyway)
  let high = 1.055 * pow(c, vec3<f32>(0.4166666666666667)) - 0.055;
  return select(high, c * 12.92, c <= vec3<f32>(0.0031308));
}

@compute @workgroup_size(8, 8, 1)
fn display_band(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let px = u.origin + gid.xy;
  let dims = textureDimensions(display_out);
  if (px.x >= dims.x || px.y >= dims.y) { return; }
  let p = vec2<i32>(px);
  let sum = textureLoad(accumulation_in, p, 0);
  let f = textureLoad(flags_in, p, 0).x;
  var written = vec4<f32>(0.0);
  if ((f & NUMERICAL_FLAGS) != 0u) { written = exact(LEGEND_NUMERICAL_FAILURE); }
  else if ((f & FLAG_PRIMARY_UNRESOLVED) != 0u) { written = exact(LEGEND_UNRESOLVED); }
  else if ((f & FLAG_UNAVAILABLE_NORMAL) != 0u && (u.view_mode == VIEW_SHADED || u.view_mode == VIEW_NORMALS)) { written = exact(LEGEND_UNAVAILABLE_NORMAL); }
  else if (!(sum.w >= 1.0) || !finite_rgb(sum.xyz)) { written = exact(LEGEND_UNRESOLVED); } // no completed sample is never a colour
  else {
    // guard: sum.w >= 1 (checked above)
    let mean = sum.xyz / sum.w;
    var shown = select(srgb(mean), clamp(mean, vec3<f32>(0.0), vec3<f32>(1.0)), u.lighting_stage == STAGE_DIAGNOSTIC);
    if ((f & LIGHTING_UNRESOLVED_FLAGS) != 0u) { shown = mix(shown, LIGHTING_TINT, LIGHTING_TINT_WEIGHT); }
    written = vec4<f32>(shown, 1.0);
  }
  textureStore(display_out, p, written);
}
fn finite_rgb(v: vec3<f32>) -> bool {
  let bits = bitcast<vec3<u32>>(v) & vec3<u32>(0x7f800000u);
  return all(bits != vec3<u32>(0x7f800000u));
}
