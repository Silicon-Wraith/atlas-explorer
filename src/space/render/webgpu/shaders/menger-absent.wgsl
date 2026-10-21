// Every non-Menger tracing variant includes this source instead of menger-sample.wgsl (plan B10): the
// FIELD override never selects it, and the variant never statically uses `menger_boxes`.
fn menger_sample(p: vec3<f32>, depth: u32) -> FieldSample { return FieldSample(SAMPLE_FAILURE, 0.0); }
