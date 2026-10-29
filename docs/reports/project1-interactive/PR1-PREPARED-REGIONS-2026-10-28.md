# PR1: prepared-region geometry and collision — partial feasibility

**Owner:** Codex. **Challenger:** Claude. **Scope:** scratch native preparation and JavaScript/WASM collision, one H_contact specimen. Governing direction: [North Star charter](../../superpowers/specs/2026-10-23-atlas-north-star-charter.md). Frozen experiment: [prepared-regions plan](../../superpowers/plans/2026-10-28-prepared-regions-feasibility-plan.md). That plan records its pre-execution status; this report records subsequent execution and the advisor-authorized optimization follow-up.

**Current milestone:** [The prepared-geometry walkthrough](PR1-WALKTHROUGH-2026-10-28.md) is built and has completed three headed hardware-GPU replays. Prepared collision and safe same-scale patch replacement work in the tested scope. Query timing passes; the47.2FPS overall performance is accepted for this prototype. The stricter original p95 screen is retained diagnostically. Full streaming, LOD and memory qualification remain open. The earlier static/optimization chronology below is preserved.

The static experiment supports preparing interaction geometry ahead of movement. It does not yet qualify preparation ahead, rendering, scale transitions or product adoption. The visitor-facing goal is unchanged: movement consumes prepared geometry and does not investigate the fractal to decide each contact.

## Finding and retained change

The first mesh and collision index took **5.734 seconds**, excluding initialization, serialization and publication. That failed the five-second cold-ready gate even as a lower bound. The advisor directed us to treat this as an optimization target and investigate Python as a possible cause.

The decisive optimization was to clip each component to the requested region **before** composing the solids. The original native C++ Boolean operations processed substantial geometry subsequently discarded. The optimized build uses the same sampled component surfaces, with no additional approximation:

`(parent ∩ region) − (child ∩ region) − (grandchild ∩ region)`

is set-equivalent to intersecting the final difference with the region. In the observed run, mesh construction plus collision index fell to **2.272 seconds**, about 60% lower. A separate exact array-compaction improvement reduced mesh construction by another 0.132 seconds; its collision index was not separately remeasured.

Python remains in the preparation pipeline. The original dominant cost was 3.706 seconds in native Boolean operations. The 0.900-second mesh-closing stage mixed NumPy allocation with native mesh construction, so it cannot all be attributed to Python interpreter overhead. A subsequent instrumented run separated the remaining closing cost: **0.151 s array preparation**, **0.030 s Mesh64 wrapper/copy**, **0.510 s native Manifold construction**, and **0.696 s total closing**. Saved output arrays were bitwise equal to the retained compact candidate. Array preparation also includes native NumPy operations; it is not pure interpreter overhead. These measurements justify removing unnecessary geometry work and deferring a language rewrite; they do not establish that language overhead is irrelevant or that a rewrite would meet the remaining targets.

## Measured variants

All are individual specimen measurements, not repeated-run distributions. Mesh and collider were timed in separate processes; their sum is a combined lower bound, not an end-to-end elapsed measurement. Initialization is measured separately and excluded from these lower bounds. Native preparation does not establish browser/WASM preparation performance.

| Variant | Mesh construction | Collision index | Combined lower bound | Real collision triangles | Disposition |
|---|---:|---:|---:|---:|---|
| Original dense graphs, compose then clip | 4.972 s | 0.763 s | 5.734 s | 507,840 | Original cold-ready gate failed |
| Native simplification before composition | 2.030 s | 0.347 s | 2.377 s | 203,306 | Allocated surface-preservation tolerance failed |
| Clip components before composition | 1.510 s | 0.762 s | 2.272 s | 507,840 | Retain for further qualification |
| Clip first, exact array compaction | 1.378 s | Not remeasured | Not measured | 507,840 | Saved arrays bitwise equal to clip-first |
| Prior-art adaptive RTIN meshing | 2.461 s | Not run | Not measured | 890,025 | Higher mesh cost and memory; set aside |

Simplification used one fixed tolerance, 0.001 body diameter. Its sampled composed-surface displacement exceeded that allocated allowance, and independent float64 distances confirmed the discrepancy. Passing individual graph checks did not ensure composed-surface preservation. This does not claim that the full 1% generator-fidelity threshold failed.

The RTIN variant used PyMartini 0.5.1, with a fixed 0.00001-body-diameter threshold and power-of-two-plus-one grids at least as fine as the original selected spacing. The floor and cap shared a triangulation formed from the maximum of their propagated error hierarchies. The larger source grids and conservative threshold outweighed reduction in this specimen. This result does not reject adaptive triangulation generally; no threshold search was performed. Its analytic primitives and native statuses passed, but it received no collision or fidelity qualification after failing the cost comparison.

## Evidence tiers

### Established within the measured scope

- Geometry preparation uses the actual H1C parent and two cutter constructions, with Manifold 3.5.4 native C++ composition. Movement uses Rapier 0.21.0 WASM triangle sweeps and has no field-evaluator or occupancy-refinement dependency.
- The clip-first H_contact run completed 4,096 fixed jittered sweeps: p99 **1.523 ms**, maximum **1.922 ms**; the separate first query took **3.478 ms**. All returned contact on this corpus. This is not a complete navigation or frame-time measurement.
- The original closed solid passed independent paired-edge and winding checks. Independent float64 distances on 16 sweeps, nine sampled prefix points each, found no sampled prefix violation and a maximum contact discrepancy of **0.000967 m**, below the **0.0010625 m** tolerance. These are finite checks, not a continuous-sweep proof.
- Clip-first preserved the original vertex/triangle counts. Two-sided surface samples, 1,024 in each direction, differed by at most approximately **4.6 × 10⁻⁸ m**. Exact array compaction then produced saved arrays bitwise equal to clip-first.
- The chosen samples were resolved. No unknown evaluation was converted into a height, solid or empty space. Artificial region-closing faces were excluded from collision-wall triangles.

### Supported partial findings

- Independent CPU fractal evaluations support sampled composed fidelity. On 512 area-weighted mesh samples, the maximum distance to a known exposed generator boundary point was **0.000916 m**. This is an upper bound on the nearest-boundary distance for each sample.
- In the reverse direction, 837 independently generated exposed boundary samples had maximum mesh distance **0.00101487 m**, below the **0.0010625 m** threshold. Independent float64 triangle distances on the 16 worst cases confirmed the result. The exposed reference counts were parent floor **1**, child floor **234**, child cap **1**, grandchild floor **501**, grandchild cap **100**. Parent and child-cap completeness are therefore effectively untested. This has little tolerance headroom and finite spatial coverage; it does not establish preservation of all openings.
- Necessary graph-sampling checks passed at three body scales for H_contact, H_edge and an additional nearby control. The nearby control still intersects cutters and is not the required ordinary-terrain control. The points used to select density are not held-out fidelity evidence; the composed checks above use a separate seed.
- The retained changes make prepared collision more practical. They do not yet meet the one-second preparation target for streaming.

### Unresolved qualification

- Full cold-ready latency, including initialization, transfer and publication; three fixed replay runs and their distributions.
- Full 1 GiB accounting for CPU/GPU region data, temporary buffers and old/new overlap. Compact clip-first peaked at **1,268.5 MiB process RSS**, with a **389.2 MiB warm runtime peak** and approximately **20.3 MB GPU pool allocation**. Subtracting RSS peaks is not valid ownership accounting. This memory gate remains open.
- H_edge and ordinary-terrain composed meshes, all named opening/topology checks, seams, high-speed and corner behavior.
- Collision at all three observer scales. Smaller cubes around the original center may miss the actual contact surface; those fixtures need a recorded surface-centered correction before they can establish finer-scale contact. Existing graph results do not establish this.
- Rendering and collision consuming the same published triangles, headed browser frame times, preparation contention, prefetch readiness, sudden direction changes and safe detail replacement.
- Browser deployment of the preparation pipeline. No product dependency or implementation has been adopted.

## Attempts, provenance and limits

Scratch roots:

- `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/prepared-r0/`: frozen card, graph sampling, original mesh/collision, primitive repair, independent contact checks and original failed cold-ready result.
- `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/prepared-opt-r0/`: bounded optimization cards, all variants, two-sided surface comparisons and independent composed-field checks.
- `/mnt/ml_storage/scratch/atlas-prepared-toolchain/`: isolated native/WASM tooling; product dependencies unchanged.

Hardware: NVIDIA RTX 6000 Ada. GPU sampling used the existing perturbation evaluator, bounded processes, exclusive GPU lock and an explicit handoff declaration. CPU reference evaluation used the independent direct float64 orbit implementation. Native geometry uses finite precision; no exact-arithmetic enclosure claim is made.

The original mesh primitive attempt failed on the parent chart's negative orientation; a preserved repair reverses winding under a negative basis determinant. The RTIN primitive initially expected the dense mesh's eight rim vertices; the adaptive pyramid correctly used four, with analytic volume 4/3 and valid closed topology. The assertion repair and failed attempt are preserved. Neither repair changes the outcome thresholds.

The implementation and evidence contain source hashes. The closure manifest `prepared-opt-r0/closure-manifest-r0.json` pins all immediate source, card, result and binary files in both experiment directories (excluding caches and the manifest itself). All reported experiment processes exited. No browser/GPU product acceptance run, product-source change, commit, push or merge occurred.

## Decision and next discriminator

Retain clip-first and exact array compaction. Set aside the unqualified simplification and this RTIN configuration. Do not spend further time on a language rewrite without evidence that remaining interpreter work is decisive.

Claude independently checked the decisive sources and values in **20261028T222628Z-5e1a30**. He found no defect invalidating the retained clipping or compaction changes. His challenge correctly narrowed the fidelity coverage and identified the mixed closing timer. The owner verified the per-surface counts and added the split timing above after that review; the new timing is owner evidence, not separately peer-reviewed.

Accept his recommended ordering: **qualify static geometry and collision at three scales before further preparation-ahead optimization**. Use recorded surface-centered fixtures, normalize collision coordinates by body size, sample exposed surfaces separately, and check a named opening. Record cost and memory alongside. Smaller region size remains a later cost hypothesis, conditional on covering the visitor's reachable space at the frozen speeds and lookahead. The review's statement that only region size can reduce collider cost is not established and is not adopted; alternative representations and implementation changes remain possible.

## Process cost and closure

PR1 began at **21:43 UTC**; this static/optimization milestone closed at approximately **22:30 UTC**, about **47 minutes**, including review. The optimization follow-up began at **22:01 UTC** and ended within its 45-minute bound. The eight-hour experiment allowance was a maximum, not a reason to continue past a failed or unqualified gate. Streaming was not built while static readiness remains unqualified.

Three focused Claude exchanges reviewed the initial card, the original failure and the optimization evidence. The reviews were useful: they identified clipping before composition, distinguished graph checks from composed fidelity, exposed uneven reference coverage and prompted residual cost attribution. The rejected simplification and RTIN variants preserved concrete cost/fidelity findings. Further polishing of those variants was not justified in this bounded iteration.

The advisor correctly called out a gap in progress updates. Milestone reporting must happen during investigation so the advisor can steer before choices are settled; preserving a detailed log afterward is insufficient.

**Disposition:** partial static feasibility, with retained preparation optimizations. Full prepared-region feasibility remains unresolved. The next owned step is the three-scale static qualification described above, not product integration or a claim that streaming is ready.


## Subsequent three-scale static qualification

The owner resumed at22:39UTC after the advisor correctly pointed out that reporting is not a reason to leave authorized work idle. The same quarter/one-sixteenth body scales now center on the independently evaluated grandchild floor at the saved contact witness. Additional fixtures include H_edge, ordinary parent terrain outside both cutter envelopes, and the existing grandchild S-to-T opening route. Precise coordinates and provenance are in `prepared-static-r0/fixtures-r0.json`.

All six meshes built. Fresh reference seed20261030 and stratified surface sampling found a **real quarter-scale fidelity failure**: two grandchild-floor reference points exceed0.000265625m tolerance; maximum0.000289006m. Independent float64 triangle distance confirms it. The sparse selector had accepted32subdivisions/bodydiameter based on257points with max0.000210m. Local diagnosis with a finer grid greatly reduces errors at those points, but is not independent qualification of a repair.

Reference-to-mesh checks passed on the other five specimens. Mesh-to-field upper-bound sufficiency remained unresolved for contactscale1 and H_edge as well as quarter-scale contact. An upper bound above tolerance does not prove actual nearest-surface failure. Ordinary terrain, contactscale16 and the opening passed both sampled directions, within their per-surface coverage. No full six-specimen fidelity pass is claimed.

Claude independently confirmed the quarter-scale failure in **20261028T224625Z-a5c02b** and recommended dense interpolation checks with a reserved error margin. The owner adopted that experiment, not the review's stronger unestablished statistical/convergence claims.

### Uniform-density correction failed its screen

`prepared-dense-r0/card-r0.md` froze checks at every candidate triangle centroid and unique edge midpoint, accepting only errors within half the final tolerance. This is sampled interpolation-error estimation, not a certified supremum. Unknowns reject. The original128subdivisions/bodydiameter and4Mvertices/component caps remained.

Only ordinary terrain passed. All difficult fixtures still exceeded the allocated half-tolerance at the maximum rung. Selection alone took6.25s(contact1),5.87s(contact4),3.23s(contact16),6.11s(edge),5.83s(opening), already exceeding the five-second cold-ready budget for four cases before mesh/index construction. No dense rebuilds or streaming followed. This rejects that bounded uniform recipe; it does not establish that the underlying geometry cannot be prepared by another builder.

### Collision and named opening: separate useful evidence

All collision geometry and requests were normalized to body-diameter units, with sphere radius0.5. An analytic sphere-plane control returned the expected0.375time of impact. The corpus includes225approach/away/tangent cases with travel up to4bodydiameters, plus1024timing queries per specimen. Those long requests differ from the original short contact corpus and from normal frame-by-frame movement; results are not a paired timing comparison.

Independent float64 checks on27cases and9prefixpoints per case found no sampled premature penetration, no missing approach contacts, and contact error at most0.000257bodydiameter across the three contact scales (limit0.01). All tested closed meshes passed paired-edge and orientation checks. These remain sampled collision-engine results against the saved triangles, separate from generator fidelity.

The named opening passed:129independent field center samples were all air, while disabling the grandchild cutter makes part of the same route solid. Both Rapier ray and observer-sized sphere traversed without a hit. Independent sampled nearest-surface distance was at least0.54459bodydiameter, above radius0.5. This is a useful route/topology check, not a guarantee for every opening.

Long-sweep timing p99 was2.76ms(contact1),0.92ms(contact4),5.94ms(contact16),0.08ms(ordinary),6.14ms(opening). Opening maximum8.90ms also exceeded8ms. Thus the broader corpus fails the frozen query-time screen in several cases despite correct observed geometry. No timing pass is inferred from the earlier narrower corpus.

### Next owned experiment

Reduce mesh complexity using an established adaptive terrain mesher with fine source sampling and an explicit approximation allowance. The proposed card is `prepared-adaptive-r0/card-r0.md`: bounded513-sample tiles, source spacing<=bodydiameter/256, PyMartini RTIN tolerance0.001bodydiameter, separate floor/cap interiors with matching tile rims, and checks on the actual emitted triangles. Start with quarter-scale contact and fresh held-out references. Preserve all earlier failures; no product default changes. Independent card review is in progress; implementation has not started at this report update.
