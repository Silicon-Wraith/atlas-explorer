
**Project 0 T12 — Precision interpretation**

T12 demonstrates preserved compensation in the tested WebGPU prototype, with some improvement in ray agreement but **no extension of the observed precision range**. Both implementations first exceed the declared discrepancy threshold at camera distance **10⁻⁵**. This closes the bounded experiment successfully; it does not establish that more comprehensive precision methods would fail.

The accepted evidence is `artifacts/project0/20261020T181850179Z-precision-precision-headed/`, summarised in [precision.json](precision.json). Its implementation identity is `4465b3c`, whose `spikes/` tree is identical to the approved `ab6c5e9`. Execution was headed, using the E10-selected configuration. All 160 supervision windows completed, with no execution invalidations or assessment errors. Independent read-only checks verified the recorded artifact hashes and timing descriptor; recomputing the metrics reproduced the summary exactly.

Compensation is **VALIDATED under the preregistered rule**: the six frozen and six supplemental primitive cases passed, and all 7,104 checked capture sites passed. Discriminating sites exceeded every minimum: multiplication 2,880/64, origin addition 3,072/64, and ray-parameter addition 788/32. This validates the tested cases and sampled arithmetic sites in this instrumented kernel, rather than every possible input or shader configuration.

The comparison counts exactly repeat the superseded ff11b35 run. That earlier run remains preserved as user-directed historical evidence; the corrected rerun supplies the accepted result.

**The observed precision limit is local to this experiment.** The camera approaches the frozen Mandelbulb anchor along the frozen direction. The workload is the central 64 × 64 rays of a 1280 × 720 frame, with 128 field iterations, 512 marching steps, and hit tolerance `0.005·α·t`, without an absolute tolerance floor.

Under [A.10](../../superpowers/specs/2026-10-18-project0-space-qualification-design.md#a10-precision-baseline), a set exceeds the threshold when status disagreements exceed 5% of reference-eligible rays, or large depth errors exceed 5% of eligible positive-depth CPU hits. “Large” means relative depth error above 1%.

The decisive results against the requested CPU reference are:

| Camera distance | Eligible rays | Baseline status / depth errors | Compensated status / depth errors | Threshold exceeded |
|---|---:|---:|---:|---|
| 10⁻⁴ | 3,937 | 6 / 20 | 3 / 23 | Neither |
| 10⁻⁵ | 3,683 | 415 / 1,016 | 164 / 978 | Both |
| 10⁻⁶ | 3,858 | 2,020 / 1,657 | 1,640 / 2,056 | Both |
| 10⁻⁷ | 3,956 | 3,940 / 16 | 3,956 / 0 | Both |
| 10⁻⁸ | 3,972 | 3,972 / 0 | 3,972 / 0 | Both |

All eligible reference rays in these rows are CPU hits. Zero depth errors alongside total status disagreement therefore means missing GPU hits, not accurate depths.

The last tested distance below the discrepancy threshold is **10⁻⁴**; the first tested distance above it is **10⁻⁵**. No intermediate distances were tested. Their nominal world-space pixel footprints at the anchor are approximately **1.60 × 10⁻⁷** and **1.60 × 10⁻⁸**, respectively. These observations locate a practical agreement limit for this patch, profile, implementation and environment. They do not define a universal f32 zoom floor or a guaranteed continuous interval.

**A.11 protects coordinate construction and recurrence addition, while retaining substantial f32 computation.** The origin O, ray parameter t, sample position p and stored Cartesian iterate use high/low pairs. Each nonlinear power evaluation first collapses the iterate to f32; radius, angles, trigonometric functions, derivative accumulation and the distance estimator remain f32. Direction vectors also remain f32. This is not a fully compensated fractal iteration.

At 10⁻⁵, compensation reduces status disagreement from **11.27% to 4.45%**, bringing that criterion below 5%. But **26.55%** of eligible CPU hits still have large depth errors, so the combined threshold remains exceeded. At 10⁻⁶, status disagreement improves from **52.36% to 42.51%**, while the large-depth-error count increases. The improvement is therefore useful in some classifications, but neither sufficient nor uniformly beneficial.

Input conversion alone cannot explain the remaining discrepancy. At 10⁻⁵, the baseline still has 412 status disagreements and 936 large depth errors against the CPU reference using its actual rounded inputs. The compensated comparisons against its actual pair-encoded inputs equal its requested-reference comparisons.

The results support treating **field-evaluation precision as a leading remaining bottleneck**, including the f32 nonlinear map, derivative and estimator. They do **not** establish that the derivative or nonlinear iteration dominates the error quantitatively. T12 changes several arithmetic paths together and does not separately measure their contributions. Residual ray arithmetic, termination decisions, finite budgets and compiler behaviour remain coupled. Pair arithmetic cannot recover information already lost during the f32 nonlinear evaluation, but attributing a measured percentage of error to that stage would require a separate controlled study.

**Project 1 should expose tested limits alongside current sampling conditions.** Its precision indicator should report world-space pixel footprint, iteration count and tolerance, and distinguish navigation precision from field precision and rendering tolerance, as required by the [charter](../../superpowers/specs/2026-10-18-atlas-workbench-charter.md#35-precision).

For this fixture, the indicator can identify 10⁻⁴ as the last tested distance within the criterion and 10⁻⁵ as the first tested exceedance. Other patches, families and profiles need their own evidence. The value 10⁻⁵ should not become a universal camera clamp or a claim that every coarser view is accurate. A smooth image, small estimator value or preserved camera coordinate is insufficient evidence of resolved detail. T12 provides no basis for enabling A.11 as a general Project 1 deep-zoom solution.

**Project 1c should investigate precision through the fractal iteration itself.** A promising direction is a high-precision reference orbit with a family-specific perturbation recurrence, together with validated derivative and estimator treatment. This is a research recommendation, not a demonstrated capability from T12. The chosen family must establish improvement against an independent reference; Mandelbulb results do not validate quaternion perturbation.

The camera anchor and local offsets must retain enough precision for the requested pixel footprint. They should remain separate through coordinate construction and reference-orbit selection, rather than being prematurely collapsed into an absolute f32 position. Encoding CPU doubles as pairs preserves more of the supplied coordinates but cannot manufacture accuracy beyond those doubles. Greater depth may require higher-precision anchors and reference computation, plus rebasing or fallback when perturbation loses validity. Improving navigation alone leaves field precision unresolved.

**The compiler result supports further work on guarded compensation, with a specific scope.** Unlike G5-A, T12 retained observable residual information at discriminating sites inside the measured tracer. Its runtime uniform multiplier `barrier.one = 1` is evidence that the same general technique as Plane’s `u_round` can work on this WebGPU path.

T12 uses arithmetic splitting with 4097, however; it does **not** test Plane’s bitwise splitting implementation. The existing `u_round`/bitwise approach in `src/shaders.js` remains a credible candidate for a WGSL port, but T12 neither validates that port nor isolates whether the uniform barrier, capture writes or their combination preserved the arithmetic. WGSL permits reassociation and fusion, so this success is not a portable rounding guarantee. [WGSL §15.7.5](https://www.w3.org/TR/WGSL/#reassociation-and-fusion)

Any deployed version needs residual-generating and cancellation tests, independent exact checks and negative controls, followed by validation inside the actual recurrence kernel and end-to-end reference comparisons. Removing instrumentation or changing the compiler, backend or arithmetic implementation requires renewed validation. G5-A’s failure remains valid for its own path.

**The costs describe the instrumented prototype.** Median compensated/baseline work ratios are **4.14× at 10⁻⁵**, **4.39× at 10⁻⁶**, and **7.44× at 10⁻⁷**. Thus “about four times” applies to the first two distances, not all three. Capture writes are inside the timed kernel and may affect both execution cost and compilation. The measurements include host submission work through queue completion; they are not isolated shader instruction timings. Readback is reported separately, and adaptive batch sizes differ between implementations.

At **10⁻⁸**, the timing order reverses: baseline median work is **49.25 ms**, versus **11.50 ms** compensated. Both saved outputs report all 4,096 rays unresolved after all 512 marching steps. Fewer marching steps therefore do not explain the reversal. Field-iteration work, generated code and batching were not isolated, so its cause remains undetermined. Both results exceed the accuracy threshold; this is diagnostic cost evidence, not a useful-rendering speedup. The ranges also retain a compensated **163 ms** outlier at 10⁻⁴.

The signed **extraBytes = −57,696 B** is the difference between these implementations’ explicit allocation peaks: 204,848 B compensated versus 262,544 B baseline. It reflects different input layouts and resource lifetimes, not an inherent memory saving from compensation. The compensated peak includes its 8,192 B persistent capture storage and 16 B barrier uniform; the separate 8,192 B diagnostic staging allocation is disclosed.

No reference or anchor stopping rule was reached. Nevertheless, CPU convergence supplies an independent reference, not geometric ground truth. The experiment covers local depth and termination agreement, not whole-frame silhouettes, normals or every fractal family. T12 remains separate from backend qualification: WebGPU selection is still the user’s E10 decision, and the mechanical outcome remains **inconclusive**.

