// REC-G combined presenter. Validation consumes a completed reduction in a later
// render pass; it never checks atomics while the reduction is still producing them.
struct U { internal_size: vec2<u32>, output_size: vec2<u32>, producer: u32, words: u32, mode: u32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var display: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> summary: array<u32>;
fn valid_summary() -> bool {
  let pixels = u.internal_size.x * u.internal_size.y;
  if ((u.words != 16u && u.words != 24u) || arrayLength(&summary) != u.words || pixels == 0u || pixels > 230400u) { return false; }
  if (summary[0] != 0x41545301u || summary[1] != u.producer || summary[2] != 0u || summary[3] != pixels) { return false; }
  var total = 0u;
  for (var i = 4u; i < 12u; i++) { if (summary[i] > pixels) { return false; } total += summary[i]; }
  if (total != pixels || summary[12] > summary[4]) { return false; }
  if (u.words == 16u) { return summary[13] == 0u && summary[14] == 0u && summary[15] == 0u; }
  var attempts = 0u; var stops = 0u;
  for (var i = 13u; i < 21u; i++) { if (summary[i] > pixels) { return false; } }
  for (var i = 13u; i < 17u; i++) { attempts += summary[i]; stops += summary[i + 4u]; }
  return attempts == summary[23] && attempts <= pixels && stops == summary[16] && summary[13] <= summary[4] &&
    summary[14] <= summary[6] && summary[15] <= summary[8] && summary[16] <= summary[7] &&
    summary[21] <= 8u * attempts && summary[22] <= 15u * attempts;
}
const PROVISIONAL: array<u32, 168> = array<u32, 168>(17u, 17u, 17u, 17u, 17u, 10u, 4u, 14u, 17u, 17u, 31u, 17u, 17u, 17u, 16u, 16u, 16u, 16u, 16u, 16u, 31u, 31u, 4u, 4u, 4u, 4u, 4u, 31u, 30u, 17u, 17u, 17u, 17u, 17u, 30u, 14u, 17u, 17u, 31u, 17u, 17u, 17u, 31u, 4u, 4u, 4u, 4u, 4u, 4u, 31u, 4u, 4u, 4u, 4u, 4u, 31u, 17u, 25u, 25u, 21u, 19u, 19u, 17u, 14u, 17u, 16u, 23u, 17u, 17u, 14u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 31u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 30u, 17u, 17u, 30u, 16u, 16u, 16u, 30u, 17u, 17u, 30u, 20u, 18u, 17u, 14u, 17u, 17u, 17u, 17u, 17u, 14u, 17u, 17u, 17u, 17u, 17u, 10u, 4u, 31u, 4u, 4u, 4u, 4u, 4u, 31u, 15u, 16u, 16u, 14u, 1u, 1u, 30u, 31u, 4u, 4u, 4u, 4u, 4u, 31u, 14u, 17u, 17u, 17u, 17u, 17u, 14u, 17u, 25u, 25u, 21u, 19u, 19u, 17u, 14u, 17u, 17u, 31u, 17u, 17u, 17u, 16u, 16u, 16u, 16u, 16u, 16u, 31u);
const INVALID: array<u32, 119> = array<u32, 119>(17u, 17u, 17u, 17u, 17u, 10u, 4u, 14u, 17u, 17u, 31u, 17u, 17u, 17u, 16u, 16u, 16u, 16u, 16u, 16u, 31u, 31u, 4u, 4u, 4u, 4u, 4u, 31u, 30u, 17u, 17u, 17u, 17u, 17u, 30u, 14u, 17u, 17u, 31u, 17u, 17u, 17u, 31u, 4u, 4u, 4u, 4u, 4u, 4u, 31u, 4u, 4u, 4u, 4u, 4u, 31u, 14u, 17u, 17u, 17u, 17u, 17u, 14u, 17u, 25u, 25u, 21u, 19u, 19u, 17u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 31u, 16u, 16u, 30u, 16u, 16u, 16u, 14u, 17u, 17u, 31u, 17u, 17u, 17u, 31u, 4u, 4u, 4u, 4u, 4u, 31u, 16u, 16u, 16u, 16u, 16u, 16u, 31u, 31u, 16u, 16u, 30u, 16u, 16u, 31u, 30u, 17u, 17u, 17u, 17u, 17u, 30u);
fn label(px: vec2<u32>, provisional: bool) -> bool {
  if (px.x < 8u || px.y < 6u || px.y >= 20u) { return false; }
  // guard: the bounds above prevent subtraction underflow; constant divisors are positive.
  let x = (px.x - 8u) / 2u; let y = (px.y - 6u) / 2u;
  // guard: constant divisor 6 is positive.
  let letter = x / 6u; let bit = x % 6u;
  if (bit >= 5u) { return false; }
  if (provisional) { if (letter >= 23u) { return false; } return (PROVISIONAL[letter * 7u + y] & (16u >> bit)) != 0u; }
  if (letter >= 17u) { return false; } return (INVALID[letter * 7u + y] & (16u >> bit)) != 0u;
}
@vertex fn present_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let corner = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4<f32>(corner * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn present_fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let px = vec2<u32>(position.xy);
  if (u.mode == 1u && !valid_summary()) {
    if (label(px, false)) { return vec4<f32>(1, 1, 1, 1); }
    // guard: constant divisor 16 is positive.
    let checker = ((px.x / 16u + px.y / 16u) & 1u) != 0u;
    return select(vec4<f32>(0.25, 0, 0, 1), vec4<f32>(1, 0, 1, 1), checker);
  }
  // Provisional mode uses a synchronous DOM mark, removable on confirmation without another GPU submission.
  // guard: backend validates positive output dimensions within device texture limits.
  let source = min(((2u * px + 1u) * u.internal_size) / (2u * u.output_size), u.internal_size - 1u);
  return textureLoad(display, vec2<i32>(source), 0);
}
