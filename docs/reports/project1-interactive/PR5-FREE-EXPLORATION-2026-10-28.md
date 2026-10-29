# PR5: free exploration and entry into finer terrain

**The bounded experience works:** free-flight controls, preparation ahead, a safe factor-two reduction in body size, contact on the finer surface, and safe growth after retreat. Three fixed two-minute replays averaged **46.93 FPS**, with **89 fine contacts**, **177 scale activations** and **0 movement waits**. The one-second request-to-ready target is assessed below, alongside every other criterion.

One actual local H1C surface, one factor-two body-size change, native preparation plus browser rendering and movement. No walking/gravity, unlimited terrain, arbitrary patch placement, watertight LOD seams or browser-only preparation claim.

## Try it

```bash
/mnt/ml_storage/scratch/atlas-explore-pr5/preview.sh
```

WASD flies; Q/E moves down/up; drag or arrow keys looks around. Wheel up or **Enter finer detail** requests the smaller body; wheel down or **Grow back** requests the larger body. **Guided replay** explicitly resets and runs the measured approach/contact/retreat sequence. Ordinary exploration has no automatic repositioning. Close the window or Ctrl+C to stop; the launcher owns hardware Chrome, native worker, private port 5258 and GPU lock, bounded to fifteen minutes.

The smaller body moves only within the prepared fine cube. A visible boundary refusal means turn back. Growing near the surface is deferred until the larger body fits; retreat before growing. Coarse terrain remains visual context outside the fine cube and supplies no collision answers to the small body.

## What changed

PR4 built a full fine replacement at the old physical extent and kept dense test probes in readiness. PR5 follows the advisor's decision to advance the navigable experience while correcting that measurement. The fine patch is physically smaller, with source tiles sized to it; dense experimental probes run during separate qualification. Runtime retains unresolved/nonfinite/sign-order checks, the native geometry status and vertex bound, and safe body activation.

The old body diameter D is 0.0265625 m; the new diameter d is D/2. Fine half extent is d and its center is 0.25 D toward the frozen PR4 witness. The exact direction has maximum axis component 0.8585373. Initial and predicted contact containment margins, including skin, exceed 0.03 D on every axis. The review's generic nearly-axis-aligned counterexample was checked against these actual values before building; it does not invalidate this fixed fixture. Actual generated geometry was then checked independently.

Fine tiles have 256 cells per side, step d/256 and physical width d, anchored to mathematical support coordinates. The sampling density matches PR4's finer grid, while the footprint differs. Sixteen tiles contain 1,056,784 source points, compared with PR4's 9,455,625. Final fine geometry contains 3,841 real triangles. This is a different and smaller workload, not an isolated speedup of the previous full-region build. Runtime/offline mesh arrays are identical for this specimen.

The qualified build's mesh lower bound was 0.753 s; the runtime version's was 0.403 s. Qualification wall time was 0.967 s and runtime wall time 0.406 s in that preserved sequential screen. Dense qualification has no influence on output arrays. That comparison is specimen evidence, not a benchmark proving validation removal alone explains the difference from PR4. Fresh field-to-mesh references and mesh-to-field samples were also evaluated offline. The held-out reference maximum is 0.00084615 new-body diameters, below the 0.01 target. Samples cover the grandchild floor; absence of samples from other surfaces is not proof of completeness.

World/camera positions use old-body units. Fine collision coordinates use the smaller body's units; the shared transform applies scale and offset for containment, activation and movement, and rendering uses the corresponding affine transform. The camera near plane scales with the body. Shrink/grow never moves the body's center. Rendering and collision use one active revision object; duplicate-index draw logs are not independent verification. Coarse context is clipped in the shader outside the fine cube; joined geometry and seam closure remain unresolved.

## Complete criteria scorecard

| Criterion | Target | Result |
|---|---|---|
| Average frame rate | ≥30 FPS overall and during preparation | 46.93 / 47.97 FPS. Frame percentile/max diagnostics below are not extra hidden gates. |
| Full navigation update | p99 ≤2 ms; maximum ≤8 ms | Worst normal p99 1.40 ms; max 2.70 ms. Includes synchronous scheduling, scale guards, route and movement. |
| Fine request to ready | ≤1 s | 0.460 s, 0.486 s, 0.483 s. Cold fine field/RTIN caches are reset per run; process/GPU kernels and parent reference are retained. |
| Ready to safe shrink | ≤1 s when body fits | 0.70 ms, 13.10 ms, 17.40 ms; each normal run activates fine. |
| First usable coarse | ≤5 s | 0.322 s browser preparation; 2.001 s process-start to ready. Loads a retained coarse artifact, not an empty geometry/reference cache. |
| Navigation independence | No field or mesh investigation in movement | Structural separation: resident Rapier casts/guards; predictor launches asynchronous preparation. No claim of a measured zero counter. |
| Actual free controls | Separate keyboard, look and wheel check | True: all six WASD/QE keys moved the body; drag plus arrow changed view; wheel shrank and grew. Fine-boundary check recorded 113 refusals while retaining prepared coverage. Guided replays are separate evidence. |
| Smaller-scale contact and growth | Shrink/contact/retreat/grow each run | 89 normal fine contacts and 177 scale activations. Growth at contact was refused 89 times; growth after retreat succeeded. |
| Unsafe activation | Defer without moving visitor | Source invariant checks, isolated unready/retiring/coordinate controls, and recorded real unsafe-growth checks pass. |
| Fidelity/contact | Sampled error ≤0.01 new-body diameter | Fresh field/reference, closed-edge and contact checks pass. Maximum recorded contact discrepancy 0.000000860 body diameters. Finite samples do not prove continuous sweep correctness everywhere. |
| No embedding or unprepared entry | None observed | Independent incoming-clearance/contact checks pass. Normal route boundary refusals 0; the separate input check deliberately exercises the boundary. No small-body coarse collision fallback. |
| Runtime versus dense test validation | Identical geometry; checks outside timed readiness | Exact arrays match, with dense probes absent from runtime graph construction. Essential value/native validity checks remain. All measured fine outputs must match the qualified specimen. |
| Resident reuse | No field/index rebuild on resident revisit | One fine request per measured run; repeated scale changes reuse both revisions. Explicit between-run reset is preparation. |
| Late preparation | Coarse remains usable; recover safely | Forced 3 s delay: 3.498 s request-to-ready; 0 movement waits, 3 fine contacts and 0 errors. A late zoom request may remain pending; coarse usability does not mean fine detail was ready. |
| Memory | ≤1 GiB attributable region CPU+GPU, including overlap/build | Unverified; ledger below. Lower process memory is supported, complete ownership is not. |
| New feature at contact | Distinct newly resolved feature | Not established: frozen nearest witness remains shared with PR4/coarse. Closer approach at smaller body size works, but this is not evidence of a new contact feature. |
| Scope and execution | Bounds, exclusive hardware GPU, cleanup | Frozen smoke, separate actual-input check, three 120 s runs and late control preserved. Cleanup True; final preview/host checks and review recorded at closure. One actual local H1C surface, one factor-two body-size change, native preparation plus browser rendering and movement. No walking/gravity, unlimited terrain, arbitrary patch placement, watertight LOD seams or browser-only preparation claim. |

## Fixed replay results

The predictor requests the one fine feature from current pose/direction within its declared range, or from explicit UI demand. It cannot read future input. The measured replay requests at elapsed one second while oscillating nearby, then uses the same scale and movement functions as free input. It contacts, refuses unsafe growth, retreats and repeats resident scale changes. Five seconds of stationary rendering precede three fixed runs. Each resets native caches and starts coarse-only.

| Run | FPS | Preparation FPS | Update p99 / max | Fine ready | Fine contacts | Activations | Unsafe growth refused |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 46.99 | 47.92 | 1.30 / 2.20 ms | 0.460 s | 30 | 59 | 30 |
| 2 | 46.80 | 48.00 | 1.40 / 2.70 ms | 0.486 s | 30 | 59 | 30 |
| 3 | 47.01 | 48.00 | 1.40 / 2.40 ms | 0.483 s | 29 | 59 | 29 |

RAF is a presentation proxy, not hardware presentation timestamps. Host field-call intervals are not CUDA kernel timestamps. Categories overlap; do not add their durations.

| Frame subset, normal runs | Frames | Interval sum | FPS |
|---|---:|---:|---:|
| overall | 16898 | 360.035 s | 46.93 |
| preparation | 71 | 1.480 s | 47.97 |
| source | 27 | 0.600 s | 45.00 |
| validation | 5 | 0.100 s | 50.00 |
| field | 29 | 0.640 s | 45.31 |

## Memory and limits

Newly built fine jobs report native peak RSS **681.19 MiB**; sampled owned process-tree RSS peaks at **1985.12 MiB**. Historical build RSS embedded in the retained coarse artifact is excluded from current native peak calculations. Independent peaks cannot be summed; process-tree samples may miss brief peaks and shared pages may be counted repeatedly.

Field arrays peak at 16,908,544 bytes, validation cache 40, topology 8,928,056; source/validation evictions 0/0. Scalar initialization calls may appear in the inherited validation telemetry category; dense graph/source probe loops are disabled in runtime. Recorded native GPU pool peaks at 2,127,872 bytes. Browser WASM capacities, transfer payload and live render geometry are preserved in `metrics-r0.json`; WASM capacity includes reserve, GPU counts exclude driver/compositor allocations. The complete 1 GiB region-data budget remains unverified.

## Evidence and decision

All implementation and raw evidence: `/mnt/ml_storage/scratch/atlas-explore-pr5/`. Criteria: `card-r0.md`, `card-amendment-r1.md`, `frozen-geometry-r0.json`. Geometry: `qualified-r0/`, `runtime-r0/`, `preflight-build-r0.json`, `preflight-independent-r0.json`, `geometry-check-r1.json`. Controls and hardware: `coordinate-check-r0.json`, `smoke-r0.json`, `input-r0.json`, `full-r0.json`, individual runs, `server-full-r0.json`, `metrics-r0.json`. Source hashes are embedded in browser reports and match the preserved full-run sources (`source-check-r0.json`). Verbatim peer exchanges are archived in the codesign log.

The inherited preflight query's tile-based new-source label was corrected before measurement; changing tile width does not establish a new mathematical contact feature. The inherited scale metadata label was corrected to divisor eight before full measurement; body diameter and arrays were unchanged. Full source changes after smoke/input were provenance-width keys, scale metadata and a successful-activation status message; no geometry or navigation algorithm was tuned to improve a score. Original browser source hashes preserve that distinction.

The first independent checker reported missing fine-entry distances because its broadphase search radius was one new-body diameter while actual entry clearance was about 1.496. Contacts, measured arrays and growth/boundary checks already passed. The preserved r1 mechanical repair expands only the search radius to two; the 0.501 clearance threshold is unchanged. All 92 contact records, 182 activations and 92 unsafe-growth refusals, including the delayed control, now pass. Initial script/result/output remain preserved. No browser or geometry run was repeated for this correction.

Claude’s decisive review 20261029T044435Z-9c33fd supports the bounded free-flight and factor-two scale-change claim, finding no invalidating scale/activation/growth/masking bug. It independently checked the metrics, source transforms, checker repair, growth refusal and fine-boundary containment. The first review call reached its ten-tool-turn limit; one bounded continuation returned the verdict from existing inspection without further tool calls. Both attempts are preserved.

Claude did not independently verify the fresh fidelity values, runtime/offline identity or each individual input row. The owner checked those raw artifacts directly (`owner-verification-r0.json`), in addition to the independent numerical checker implementation. This is an explicit limit on peer review, not a missing experiment. Duplicate active-index logs remain architectural evidence only.

This establishes a safe scale change and closer approach inside a prepared box. It does not establish a perceptible new geometric feature revealed by refinement. Next: extend connected prepared coverage for free flight, reusing PR3’s safe-coverage handoff at the current body size. Include a predetermined location with a visibly distinct finer feature when one can be qualified; do not add walking/gravity before this connected exploration works. The native bridge remains scratch infrastructure, with browser-only preparation still open. No product source changes, commit, push or merge are part of this scratch milestone.


Process accounting: card review began around 04:27UTC; the one-specimen geometry/identity/fidelity screen completed within 45 minutes. Smoke, actual-input checks and full hardware replays followed; full measurements completed around 04:40UTC. Review and launcher closure remain within the three-hour bound. The card review improved unit/coverage checks; the final review confirmed scale safety and narrowed the visual claim. One checker-radius repair and one bounded review continuation were needed; no performance replay was repeated for a cleaner result.


Launcher check `preview-1793249157656.json` passed on installed headed hardware Chrome and confirmed cleanup. Host check `cleanup-check-r0.json` found no owned controller/native processes, no listener on 5258 and the GPU lock free. No experiment remains running.

[Preview image](PR5-exploration-2026-10-28.png).
