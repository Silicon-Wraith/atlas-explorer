// accumulate_band, APPEARANCE_VERSION space-appearance-v3 (plan B11; spec §8.1 step 5, §9.1 "Targets"): the
// linear sum and count of the completed samples of one accumulation identity, ping-pong between the two
// accumulation targets (sample s reads accumulation[s & 1] as `previous` and writes accumulation[(s + 1) & 1]
// as `next`; the renderer walks samples in ascending index per pixel), and the diagnostic propagation in
// `accumulationFlags`: the OR of every sample's outcome flags, so a diagnostic outcome is never averaged away.
// Sample 0 initializes the sum, the count and the flags from the current sample alone: it reads neither the
// previous accumulation nor the previous identity's flags (an appearance reset reuses the same targets).
// Bindings: appearance.js APPEARANCE_BINDINGS.
struct AccumulateUniforms { origin: vec2<u32>, size: vec2<u32>, sample_index: u32 };
@group(0) @binding(0) var<uniform> u: AccumulateUniforms;
@group(0) @binding(1) var status_in: texture_2d<u32>;
@group(0) @binding(2) var normal_in: texture_2d<f32>;
@group(0) @binding(3) var lighting_in: texture_2d<u32>;
@group(0) @binding(4) var color_in: texture_2d<f32>;
@group(0) @binding(5) var previous_in: texture_2d<f32>;
@group(0) @binding(6) var next_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var flags: texture_storage_2d<r32uint, read_write>;

// appearance.js ACCUMULATION_FLAGS: per-sample outcome facts. display_band decides the legend from them.
const FLAG_PRIMARY_NUMERICAL_FAILURE: u32 = 1u;
const FLAG_PRIMARY_UNRESOLVED: u32 = 2u;
const FLAG_UNAVAILABLE_NORMAL: u32 = 4u;
const FLAG_SHADOW_UNRESOLVED: u32 = 8u;
const FLAG_SHADOW_NUMERICAL_FAILURE: u32 = 16u;
const FLAG_AO_UNRESOLVED: u32 = 32u;
const FLAG_AO_NUMERICAL_FAILURE: u32 = 64u;

// One lighting failure (status.js packLightingStatus layout: the flag bit, then the status at `shift`).
fn lighting_flags(word: u32, flag: u32, shift: u32, unresolved: u32, numerical: u32) -> u32 {
  if ((word & flag) == 0u) { return 0u; }
  return select(unresolved, numerical, ((word >> shift) & 3u) == RAY_STATUS_NUMERICAL_FAILURE);
}
// appearance.js sampleFlags.
fn sample_flags(word: u32, normal: vec4<f32>, lighting: u32) -> u32 {
  let status = word & 15u;
  var f = 0u;
  if (status == RAY_STATUS_NUMERICAL_FAILURE) { f = f | FLAG_PRIMARY_NUMERICAL_FAILURE; }
  if (status == RAY_STATUS_UNRESOLVED) { f = f | FLAG_PRIMARY_UNRESOLVED; }
  if (status == RAY_STATUS_HIT && !(normal.w > 0.0)) { f = f | FLAG_UNAVAILABLE_NORMAL; }
  f = f | lighting_flags(lighting, LIGHTING_FAILURE_FLAGS_SHADOW, 2u, FLAG_SHADOW_UNRESOLVED, FLAG_SHADOW_NUMERICAL_FAILURE);
  f = f | lighting_flags(lighting, LIGHTING_FAILURE_FLAGS_AO, 12u, FLAG_AO_UNRESOLVED, FLAG_AO_NUMERICAL_FAILURE);
  return f;
}

@compute @workgroup_size(8, 8, 1)
fn accumulate_band(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let px = u.origin + gid.xy;
  let dims = textureDimensions(next_out);
  if (px.x >= dims.x || px.y >= dims.y) { return; }
  let p = vec2<i32>(px);
  let colour = textureLoad(color_in, p, 0).xyz;
  let f = sample_flags(textureLoad(status_in, p, 0).x, textureLoad(normal_in, p, 0), textureLoad(lighting_in, p, 0).x);
  var sum = vec4<f32>(colour, 1.0);
  var propagated = f;
  if (u.sample_index != 0u) {
    sum = textureLoad(previous_in, p, 0) + sum;
    propagated = textureLoad(flags, p).x | f;
  }
  textureStore(next_out, p, sum);
  textureStore(flags, p, vec4<u32>(propagated, 0u, 0u, 1u));
}
