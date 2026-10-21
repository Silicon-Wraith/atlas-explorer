// B06 presentation: one fullscreen triangle; each output pixel loads the nearest display texel
// (explicit integer scaling; a draft is upscaled) and writes it unchanged. No transfer function:
// display_band performs the sole sRGB encoding into `display`; the canvas is a unorm format.
struct PresentUniforms { internal_size: vec2<u32>, output_size: vec2<u32> };
@group(0) @binding(0) var<uniform> u: PresentUniforms;
@group(0) @binding(1) var display: texture_2d<f32>;

@vertex
fn present_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let corner = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4<f32>(corner * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn present_fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let out_px = vec2<u32>(position.xy);
  // Nearest texel to the output pixel centre: floor((2·out + 1) · internal / (2 · output)).
  let source = min(((2u * out_px + 1u) * u.internal_size) / (2u * u.output_size), u.internal_size - 1u);
  return textureLoad(display, vec2<i32>(source), 0);
}
