# Decision note: float32 perturbation is the standard evaluator approach (2026-10-28)

**Decided by:** the advisor (direction). Codex is to validate the approach and the implementations for correctness.

**Choice.** Float32 perturbation, with a high-precision reference orbit and f32 offsets δ, is the standard approach to field evaluation. The compiled float64 E1b evaluator (`rc1/ev_nb.py`) is kept only as the bitwise-faithful reference and validation baseline.

**Evidence.**
- **CF1:** stalled H decisions coincide with float64 point-anchor failures (99.9% of refinement-selected cells). Codex's certified-anchor stencil resolved 5/5. Status: supported, not established.
- **Representation:** we evaluate absolute c ≈ C + U·(a+ib) in float64, which loses the low bits of cell offsets. Perturbation keeps δ at full relative precision at any depth.
- **Product:** ATLAS will support much deeper zoom than the current fixtures. WebGPU has only f32.

**Limits and open certification questions** (for the card that comes next):
1. **f32 roundoff:** the unit roundoff is 2^-24, so padding per operation is larger and enclosures widen faster.
2. **Exponent range:** offsets underflow near 1e-38, so deep zoom needs exponent-carrying offsets.
3. **Reference orbit:** the error from rounding the reference to f32 must be bounded. Rebasing must preserve the enclosure.
4. **WGSL arithmetic model:** the spec gives no directed rounding, subnormals may be flushed, and implementations may contract operations into FMAs. The padding must cover every behaviour the spec allows.
5. **Stated arithmetic model from the outset.** Layer 1 showed that E1b's arithmetic-enclosure assumption silently rested on numpy's SIMD kernels (an FMA complex multiply and numpy's own complex abs).

**Reconsider if** a certified f32 perturbation enclosure cannot certify the cells that float64 certifies, at comparable cost, on the H fixtures.
