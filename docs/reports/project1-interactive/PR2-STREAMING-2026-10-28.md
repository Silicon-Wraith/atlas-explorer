# PR2: preparing neighboring regions during movement

**Status: bounded streaming prototype complete; broader feasibility partial.** Three fixed two-minute replays averaged **46.51 FPS**. Frames overlapping region preparation averaged **47.17 FPS**. Movement timing passes. The three runs completed **593 region activations**, with no browser errors or clearance rejections. Two runs briefly withheld movement at the first handoff; fast departure from center-only readiness also missed the no-wait requirement. These misses remain recorded.

ATLAS can now assemble a neighboring region and its collision structures while the visitor moves, then activate matching visible and collision geometry. It can visibly defer a missing region and resume when ready. This advances the North Star's continuous exploration experience beyond PR1's preloaded walkthrough.

The limit is material: this is a finite, one-scale corridor with a retained parent reference and shared source tiles. The timed replays reuse field/RTIN results prepared during initialization and warm-up. They perform real native assembly, composition, export, transfer, collision-index construction, restore and GPU publication during movement; **they do not establish sustained sampling of new mathematical terrain while rendering**.

## Try it

```bash
/mnt/ml_storage/scratch/atlas-streaming-r0/preview.sh
```

Choose **Normal route** or **Fast departure**. This prototype follows a scripted route; PR1 remains the separate free-movement walkthrough. Close the window or press Ctrl+C. The launcher has a fifteen-minute limit and owns its native worker, headed Chrome, private port 5252 and exclusive GPU lock. A short launcher/cleanup check is preserved with the experiment.

## What changed and why

PR1's patch-relative grids could move the approximation when a neighbor was prepared. PR2 fixes source tiles to each cutter's mathematical support coordinates. Shared source values and RTIN triangulations are checked for identical recomputation. Native Manifold composition still uses the actual H1C construction; unknown evaluations reject publication.

Claude's initial review identified a closure risk in the proposed origin-anchored tiles: a zero-thickness cutter boundary inside a tile could give independently triangulated floors and caps different closing edges. Before measurement, the owner changed the fixed lattice origin to the cutter's support corner, keeping support boundaries on forced tile perimeters. The last support tile may be shorter; sample spacing never increases. The original card and unexecuted r0 implementation remain preserved.

A bounded LRU cache retains at most 128 MiB of field-result arrays and 64 MiB of RTIN-result arrays. A persistent native worker prepares regions; a browser worker constructs Rapier indexes and sends world snapshots to the main thread. Rendering and movement activate the same prepared region after whole-body containment, center-outside-solid and surface-clearance checks. The restored initial collision world passes a known contact query.

The prior art is incremental retained terrain geometry in [geometry clipmaps](https://hhoppe.com/proj/gpugcm/) and the established RTIN algorithm implemented by [MARTINI](https://github.com/mapbox/martini). PR2 does not implement a complete clipmap or LOD system. Snapshot transfer uses Rapier's documented world serialization, checked through Context7 against the official API reference.

## Frozen route and measurement

The contact body diameter is 0.0265625 m. Region centers lie at tangent offsets -0.75, 0 and +0.75 body diameters, each with half extent one diameter. The route leaves the starting region's whole-body safe coverage. Only the center region is usable at each replay start; neighboring region meshes and indexes are rebuilt on demand. Source/RTIN caches remain explicitly resident.

The scheduler uses current position, direction and speed with a two-second lookahead, clipped to the declared finite domain. It cannot see future turns. The tested handoff policy requires the nearest-center region at the midpoint between region centers. Missing data at that handoff produces a visible wait; no unknown space is treated as traversable.

One five-second warm-up preceded three fixed 120-second runs: 60 seconds at 0.5 body diameters/s, then 60 seconds at 2 body diameters/s. Separate eight-second diagnostics forced a three-second preparation delay and a fast departure with only the center resident. Chrome ran headed at 1280×720 internal/viewport resolution on NVIDIA RTX 6000 Ada with the recorded Vulkan/WebGPU profile and sandbox enabled.

| Run | Average FPS | FPS overlapping preparation | Movement p99 / maximum | Activations | Movement withheld |
|---|---:|---:|---|---:|---:|
| 1 | 46.70 | 47.19 | 0.2 / 0.7 ms | 197 | 20 ms, one frame |
| 2 | 46.50 | 47.16 | 0.2 / 0.5 ms | 198 | 40 ms, one frame |
| 3 | 46.34 | 47.15 | 0.2 / 0.4 ms | 198 | 0 |

The preparation-overlap statistic includes the frame interval ending after publication, rather than counting only frames that still had a pending job when their callback began. It covers **250 intervals totaling 5.3003 seconds** across the three runs, not six minutes of continuous preparation. It uses cumulative RAF intervals aligned to recorded request/ready events; logging alignment has sub-millisecond uncertainty. RAF is a presentation proxy, not hardware presentation timestamps.

Frame p95 was 40 ms in all three runs; maximum was 40.1 / 60.1 / 40.1 ms. These are diagnostics, not an additional hidden acceptance gate. Movement uses a 50 ms step cap; one interval in run 2 discarded 10.1 ms of simulated movement time. Other normal runs had no capped intervals.

Reported withheld movement sums the rejected movement-step durations. Event-to-event wall waits were approximately 12.4 and 16.6 ms for the two normal-run waits; these are distinct measurements.

## Complete criteria scorecard

| Criterion | Frozen target | Result and scope |
|---|---|---|
| Average frame rate | ≥30 FPS, including preparation-active performance | **Pass on this corpus:** 46.51 overall; 47.17 across intervals overlapping preparation. Background cold field sampling remains untested in the timed replays. |
| Movement cost | p99 ≤2 ms; maximum ≤8 ms | **Pass:** p99 0.2 ms; maximum 0.7 ms across normal runs. The measurement includes the movement routine's clearance/handoff work, not just the cast. The route itself had no contacts: these timings are for clear sweeps and handoffs. The restored-world contact control was separate. |
| Navigation independence | No field evaluation, mesh construction or occupancy investigation in movement | **Pass structurally:** movement uses resident Rapier data. Prediction starts asynchronous preparation; it does not put field work in the movement query. |
| Ready before entry | Every normal-route region ready before required handoff | **Missed in two of three normal runs:** one withheld movement frame each. Third run passed. The initial smoke also withheld two steps totaling 39.9 ms. |
| Preparation latency | Target ≤1 s from request, including queue/build/transfer/index/publication | **Five of six normal builds met it:** 0.7741, 0.9909, 0.7744, 0.9766, 0.7389 and **1.0035 s**. The final value misses by 3.5 ms; it was nevertheless ready before its route entry. |
| First usable neighborhood | ≤5 s from empty region cache | **Supported with retained-reference limitation:** process-start to usable center was 3.747 s, including this harness's startup; browser region preparation was 2.013 s. The prepared parent reference was loaded from an earlier artifact. A completely empty geometry/reference cache remains unverified. |
| Memory | ≤1 GiB CPU region data plus GPU allocations, including build/overlap/transfer buffers | **Unverified:** worker peak RSS 1163.82 MiB is process memory, not ownership accounting. Field/RTIN array cache is bounded to 192 MiB; browser render buffers total 2,511,540 bytes. The plus-region publication carries 21.53 MB of collision snapshots for 1.36 MB of raw geometry (about 16 times as much); the minus region carries 7.90 MB of snapshots. Snapshot transfers, WASM heaps, native temporary allocations, depth and driver allocations prevent a complete region-data claim. The cache bound alone is not a memory pass. |
| Collision behavior | No observed tunneling, unintended crossing or embedded visitor; contact error ≤1% of body diameter | **Partial:** no errors/clearance rejections across 593 normal activations; independent route samples have body clearance. An independent distance check puts the restored initial contact error at 0.00005189 body diameters, below the 0.01 limit. The finite route contains no contact event. Arbitrary corners, thin features and continuous-sweep correctness are not established by this route. |
| Geometry fidelity | Sampled error ≤1% of body diameter; unknowns explicit | **Pass on tested local floors:** both sampled directions pass. Final plus/minus independent reference-to-triangle maximum errors are 0.001109 and 0.000998 body diameters; mesh-to-field upper bounds are also below tolerance. The center was qualified in the first screen; its measured arrays are identical to that specimen. The plus/minus streaming patches received fresh reference checks. Reference samples cover the grandchild floor only. Intersections, openings and other scales are not newly qualified. |
| Neighbor consistency | Fixed source/RTIN identity; sampled overlap error ≤0.00001 body diameters | **Pass for the first three-patch screen:** shared inputs/topology are identical; sampled Rapier overlap maximum is about 0.000000118 body diameters. Independent float64 checks on final float32 triangles pass, and closed per-patch edges pair correctly. This does not prove joined watertight tiling; the browser activates whole overlapping patches. |
| Resident reuse | No field/index rebuilding on unchanged resident revisit | **Pass within each run:** regions stay resident once ready. Explicit between-run resets rebuild neighbors for measurement. Source-cache eviction was bounded but not exercised; unlimited-world cache behavior remains untested. |
| Deliberately late preparation | Honest wait, preserve safety, recover when ready | **Pass for the diagnostic:** forced three-second delay produced 3.06 s of withheld movement, then recovered; no errors or clearance rejection. This is expected fallback behavior, not a readiness pass. |
| Fast departure and reversal | Supported fast traversal without required-region waits | **Missed from center-only readiness:** 1.04 s total withheld movement over two handoffs in the eight-second test, then recovery. Fast resident traversal and route reversals worked; abrupt turns into newly sampled terrain remain unqualified. |
| Same visible/collision revision; activation safety | Matching triangles/transforms; safe atomic replacement | **Pass in the observed same-scale scope.** Real triangles are shared; artificial closing faces are used only for solid inclusion. No finer-detail transition was tested. |
| Execution and evidence | Fixed runs, bounded processes, exclusive GPU, preserved attempts, cleanup | **Met for measurements:** fixed replays and diagnostics completed; worker exited normally and browser/server cleanup was confirmed. Independent review and final artifact/preview checks are recorded below. |

## Preparation screen and retained failures

Uncached fixed-tile mesh builds took 1.656 / 0.831 / 1.477 s for center/plus/minus; separate index construction makes the corresponding lower bounds 1.761 / 0.899 / 1.499 s. They are not end-to-end ready times. With the bounded field/RTIN cache, builds took 1.693 s for the first center, then 0.531 / 0.877 s for neighbors. Saved arrays are bit-for-bit identical to the uncached versions. The cached worker peaked at 1170.32 MiB RSS in that standalone comparison.

The first review call had a context-path validation error; the sandboxed retry timed out without a response; the authorized network-enabled retry completed. An independent edge-check script initially omitted the row axis in its uniqueness calculation and failed before producing its result. Its preserved r1 mechanical repair passed. No geometry tolerance, route or target was changed after observing a measurement failure. No browser replay was repeated to obtain a cleaner verdict.

## Decision and next discriminator

Keep this as a finished, useful prototype. Its frame rate and movement timing are good; the small ordinary-route waits do not justify another general performance-optimization campaign. The full no-wait readiness target is still missed, and fast departure exposes a larger startup/coverage limitation.

Source inspection identifies an avoidable restriction: the current policy waits at a nearest-region midpoint even when the active patch still safely covers further movement. At ordinary speed, the first midpoint is reached after 0.75 s, compared with a 0.739–0.774 s preparation. The two-second lookahead cannot request before this center-only start. Along the chosen tangent, whole-body coverage extends to approximately 0.506 body diameters rather than the 0.375 midpoint, providing about 0.26 s more movement at ordinary speed. A future policy should consume that available coverage until replacement is needed, while retaining the same safety checks. This is a source-based diagnosis and an unmeasured correction, not a new successful run. Fast startup still lacks sufficient coverage at these preparation times.

The next discriminating experience is a longer route that leaves the initial source-tile footprint, with startup coverage sized to supported movement and direction changes. It must exercise new mathematical sampling concurrently with rendering, at least one contact/retreat on newly prepared terrain, region retirement and complete memory accounting including collision snapshots. Freeze a handoff rule based on actual safe coverage before that comparison. Finer-detail replacement follows that one-scale result. PR1 and all failed wider geometry variants remain preserved; no product-source change, commit, push or merge is part of PR2.

## Evidence and process

All implementation and raw evidence lives under `/mnt/ml_storage/scratch/atlas-streaming-r0/`:

- Frozen cards: `card-r0.md`, `card-amendment-r1.md`, `stage2-card-r0.md`.
- Geometry/control results: `build-result-r1.json`, `query-r0.json`, `independent-overlap-r1.json`, `cached-r0/cache-result-r0.json`, `streaming-check-r0.json`.
- Browser evidence: `smoke-r0.json`, `full-r0.json`, `full-r0-run-0.json` through `full-r0-run-2.json`, `full-r0-late.json`, `full-r0-fast.json`.
- Native timeline/memory: `server-full-r0.json`; reconciled metrics: `metrics-r1.json`.
- The measured source hashes are embedded in `full-r0.json`. After measurement, only the inherited UI instruction text was corrected to describe the scripted controls; `demo/index-measured-r0.html` preserves the measured HTML. No measured application logic changed.

The support-boundary review prevented a geometry defect before measurement. Independent overlap/field checks established the narrow consistency result; the fixed replays separated acceptable rendering from missed readiness. The owner reports the complete scorecard here rather than requiring the advisor to reconstruct it from artifacts. Claude independently reviewed the sources and decisive evidence in **20261029T011549Z-25622c**, finding no invalidating flaw and supporting closure as a finished bounded prototype. His qualifications about warm source caches, clear-sweep timing, initial coverage and snapshot transfer cost are reflected above. All 13 native meshes used in the full run match the independently checked smoke specimens array-for-array (`measured-mesh-check-r0.json`). The center also matches the first field-qualified specimen; this is why its missing fresh-reference rows in `streaming-check-r0.json` are not treated as a new fidelity pass.

The manual launcher check (`preview-1793236315651.json`) completed on hardware Chrome and confirmed cleanup. A subsequent host check found no owned native/Node processes, no listener on 5252, and the GPU lock free (`cleanup-check-r0.json`). Browser closure is separately recorded in each run. No server or experiment is left running.

The card was frozen at about 00:40 UTC and the independent result review completed around 01:17 UTC on October 29 (October 28 local time), approximately 37 minutes plus initial inspection and report closure, within the four-hour bound. The first geometry discriminator completed within its 60-minute bound. The reviews and independent checks were useful: one prevented a closure defect, and the other narrowed the streaming and collision claims. No repeat was sought merely to improve a score.


[Preview screenshot](PR2-streaming-2026-10-28.png). The original PR1 walkthrough remains available separately.
