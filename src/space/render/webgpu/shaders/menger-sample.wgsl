// The Menger field for the tracing modules (plan B10): only the Menger variants include this source,
// so only they statically use `menger_boxes` (declared by the entry source at its TRACING_BINDINGS slot).
fn menger_sample(p: vec3<f32>, depth: u32) -> FieldSample { return analytic_sample(menger_distance(p, depth)); }
