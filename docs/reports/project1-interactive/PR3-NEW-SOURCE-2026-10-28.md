# PR3: preparing new source tiles during movement

**The ordinary-speed streaming experience passes on this finite, single-scale route.** Three fixed two-minute replays averaged **47.83 FPS**, with **zero geometry waits**, **27 contacts**, **216 region activations** and **108 retirements**. Movement p99 was 0.2 ms; the largest measured movement call was 2.7 ms. Claude independently checked the decisive evidence and supports this bounded result.

This advances ATLAS toward “make mathematics somewhere you can go”: preparing nearby mathematical terrain now produces matching visible geometry and collision structures while movement continues. Navigation consumes prepared collision data. It does not investigate the mathematical field to decide each step.

Broader feasibility remains partial. Each replay acquires only **two previously absent source tiles**. The contact point is on an initially sampled tile. Faster movement waits, complete region-memory accounting is unresolved, and changing detail has not been tested. These limits do not invalidate the ordinary-speed experience.

## Try the repaired preview

```bash
/mnt/ml_storage/scratch/atlas-streaming-pr3/preview.sh
```

Choose **Explore and touch** or **Fast departure**. This follows a scripted out/contact/retreat/return route. Close the window or press Ctrl+C. The launcher owns installed headed Chrome, the native worker, private port 5254 and the exclusive GPU lock; it stops after fifteen minutes. The earlier PR1 free-movement demonstration and PR2 preview remain separate.

The preview includes two corrections made after measurement: retiring regions are excluded from movement candidates before awaiting GPU cleanup, and source/validation caches have separate bounds. The measured files are preserved with `-measured-r0` names. The performance results below belong to that original version; no improved performance is claimed for the repairs.

## What was tested

Owner Codex; challenger Claude. The frozen card and amendment precede measurement. PR2's support-anchored source tiles and RTIN construction are retained. Five regions lie at tangent offsets 0, 0.75, 1.5, 2.25 and 3 body diameters, with half extent one diameter each. Body diameter is 0.0265625 m. All five lie within the retained parent reference from the earlier H1C experiment. Reference construction from a completely empty cache is outside this measurement.

Each run clears native field/RTIN caches, rebuilds the starting region, then starts timing. The five-second warm-up is stationary rendering; it does not traverse the route. Region 2 acquires grandchild tiles `(3,3)` and `(4,3)`, absent from the starting region. Regions 3/4 reuse those tiles. This is a finite five-region test, not unlimited world streaming.

The predictor uses current position, direction and speed with a two-second lookahead. It cannot see future route turns. The browser retains at most three regions. Evicted regions must be prepared again, even though their experiment artifacts remain on disk. A still-resident revisit requires no preparation. Native preparation, collision-index construction, transfer, restore and GPU publication run asynchronously.

The handoff policy uses actual safe coverage: retain the active region while the whole requested sphere sweep remains covered. Otherwise activate a ready region covering the current body and endpoint and passing clearance checks. Missing coverage visibly withholds movement. The convex prepared cube makes endpoint containment sufficient for the intervening sphere sweep. Matching real triangles and transforms serve rendering and movement; artificial closing faces serve solid inclusion only.

A nearest-surface contact rule was frozen before timing. Its witness projects into tile `(4,2)`, already present initially. That failed the new-source-contact subcriterion. This limitation was recorded before browser integration; the route and tolerances were preserved. Runtime collision queries determine the stopping point; they do not replay a saved contact fraction.

## Results and full criteria scorecard

Chrome 155.0.8059.84 ran headed at 1280×720 on NVIDIA RTX 6000 Ada through the recorded Vulkan/WebGPU profile. Browser sandbox was requested; effective arguments contain neither headless nor no-sandbox flags. Chrome's own GPU report separately says its GPU process is not sandboxed. The experiment uses the established project launch profile.

| Ordinary run, 120 s each | Average FPS | FPS during preparation | Movement p99 / maximum | Contacts / activations / retirements | Geometry waits |
|---|---:|---:|---:|---:|---:|
| 1 | 47.69 | 47.29 | 0.2 / 1.8 ms | 9 / 72 / 36 | 0 |
| 2 | 48.00 | 47.73 | 0.2 / 1.4 ms | 9 / 72 / 36 | 0 |
| 3 | 47.81 | 47.87 | 0.2 / 2.7 ms | 9 / 72 / 36 | 0 |

| Criterion | Frozen target | Result and limits |
|---|---|---|
| Average frame rate | ≥30 FPS overall and during preparation | **Pass on this route:** 47.83 overall; 47.63 during preparation. RAF p95 20.1 ms and maximum 40.1 ms are diagnostics, with no additional hidden gate. |
| Movement cost | p99 ≤2 ms; maximum ≤8 ms, including handoff/contact | **Pass:** p99 0.2 ms in each run; maximum 2.7 ms. Measurement includes the movement routine's coverage, activation and cast work. |
| Ready before entry | No ordinary-route waits | **Pass observed:** zero withheld steps across all three runs. The initial smoke also had zero waits. |
| Preparation latency | Request-to-ready ≤1 s | **Miss:** 57 of 114 normal readiness events met it; maximum 1.5334 s. Preparation nevertheless finished before required entry. Validation results evicting source arrays contributed avoidable cache churn; this is not an inherent preparation-cost floor. The exact contribution was not isolated. |
| First usable neighborhood | ≤5 s, empty region cache | **Partial:** browser region preparation 2.023 s; full-run process start to ready 3.723 s. Earlier smoke startup was 11.927 s and remains recorded. Both retain a prepared parent reference; complete cold startup is unestablished. |
| Navigation independence | No field or mesh investigation inside movement | **Pass structurally:** movement uses resident Rapier geometry. Prediction initiates asynchronous preparation. |
| New mathematical source during travel | Leave initial tile footprint and sample before entry | **Pass narrowly:** two new tile keys per cache reset. Only 13 frame intervals overlap their first acquisition across the three normal runs; sustained new-world sampling is untested. |
| Contact on newly sampled detail | Actual contact witness belongs to an initially absent tile | **Not met:** witness lies in initial tile `(4,2)`. Contact in a newly assembled endpoint region is established; contact with the two new tiles is not. |
| Contact accuracy and safety | Error ≤1% body diameter; no observed embedding/tunneling | **Pass on sampled scope:** all 31 contacts including diagnostics pass independent triangle-distance checks. Maximum contact discrepancy 0.00001735 body diameters. Sampled approach prefixes are clear; actual backed-off stopping positions remain outside the radius-0.5 surface. Arbitrary thin features, corners and sweeps remain unqualified. |
| Geometry fidelity | Sampled two-direction discrepancy ≤1% body diameter; no unknown publication | **Pass for these local floors:** five independent reference-to-triangle maxima range 0.001091–0.001447 body diameters. Mesh-to-field screens also pass. All 140 measured meshes equal qualified preflight arrays. Reference samples cover the grandchild floor; no new opening/intersection qualification is claimed. |
| Neighbor consistency | Sampled overlap error ≤0.00001 body diameters | **Pass sampled:** 3,423 points across eight directed overlaps; maximum 0.00000003585 body diameters. Closed per-region edges pair with correct orientation. Whole overlapping regions are activated; joined watertight tiling is not proven. |
| Resident reuse | No field/index rebuilding for unchanged resident revisits | **Pass observed:** zero requests for still-resident regions. Rebuilding evicted regions is counted as preparation. |
| Retirement and cache bounds | At most three resident regions; bounded source/topology caches | **Observed bounds pass; lifecycle defect repaired afterward:** maximum three resident regions, 108 normal retirements without observed error. Review found a possible activation during pending retirement; the repaired preview excludes that victim before waiting. The measured version did have that race window. |
| Memory | ≤1 GiB CPU region data plus GPU allocations, including overlap/build/transfer | **Unverified:** the expanded ledger below still lacks complete attributable simultaneous peaks. RSS cannot settle this criterion. |
| Deliberately late geometry | Honest wait and recovery | **Pass diagnostic:** a forced 3 s delay caused 2.740 s of withheld movement over 133 steps, then recovery and contact; zero errors. |
| Fast departure/reversal | Supported traversal without readiness waits | **Miss at 2 body diameters/s:** 5.780 s of withheld movement over 277 steps in the 16 s diagnostic; recovery and three contacts, zero errors. Ordinary 0.5-speed reversals pass. |
| Matching visible/contact revision and safe activation | Same geometry/transforms; whole-body clearance | **Pass observed at one scale.** Scale/detail replacement remains untested. |
| Execution | Fixed runs, bounded work, exclusive GPU, preserved attempts, cleanup | **Completed:** fixed smoke, three 120 s runs and two 16 s diagnostics; no rerun for a cleaner score. Hardware launch and worker/browser cleanup recorded. Final preview and host cleanup checks are separate evidence. |
| Scope beyond this test | Three scales, detail change, seams, openings/intersections | **Unresolved.** These are broader feasibility requirements, not passes inferred from this corridor. |

No normal frame exceeded the movement timestep cap; no simulated motion time was discarded. No browser errors or unexpected route contacts were recorded.

## Frame attribution and memory

All preparation-overlap intervals include publication. Native host-call timestamps are compared with intervals ending at `performance.timeOrigin + RAF timestamp`. These are host field-work windows, not GPU kernel timestamps or hardware presentation measurements. Categories overlap and their durations must not be added.

| Normal-run frame subset | Frames | Sum of overlapping frame intervals | FPS |
|---|---:|---:|---:|
| All movement | 17,220 | 359.998 s | 47.83 |
| Region preparation | 5,613 | 117.839 s | 47.63 |
| Any field evaluation | 929 | 19.520 s | 47.59 |
| Source sampling, including evicted old tiles | 371 | 7.740 s | 47.93 |
| First acquisition of the two new tiles | 13 | 0.260 s | 50.02 |
| Validation probes | 691 | 14.720 s | 46.94 |

Most source sampling above is resampling after eviction. The novel-source exposure is too short to establish sustained GPU contention behavior. The measured shared field cache had 2,723 evictions; topology had none. Probe results and terrain arrays competed in that cache. The repair reserves 96 MiB for source arrays and 32 MiB for validation arrays, preserving the previous 128 MiB combined bound, plus 64 MiB for topology. Source and validation evictions now have separate counters. No performance improvement is inferred without measurement.

Measured peaks/capacities:

| Allocation or observation | Value | Meaning |
|---|---:|---|
| Field-result arrays | 134,216,392 bytes | Shared source/probe cache in measured version |
| Topology arrays | 30,259,120 bytes | Within 64 MiB bound |
| Main-thread WASM capacity | 130,744,320 bytes | Includes unused heap capacity |
| Worker WASM capacity | 70,385,664 bytes | Separate index-builder heap |
| In-flight payload ledger | 30,556,883 bytes | Raw arrays and snapshots counted at transfer stages |
| Live GPU geometry plus nominal depth | 8,380,152 bytes | Excludes driver and compositor allocations |
| Native GPU pool, recorded maximum | 15,787,520 bytes | Recorded native allocation observation |
| Native process peak RSS | 1,219.24 MiB | Includes runtime and other native allocations |
| Sampled owned process-tree RSS peak | 2,895.57 MiB | Broader ownership; shared pages may be counted more than once |
| Whole-device memory used at native job ends | 902–928 million bytes | Includes other GPU users; not attributable to this experiment |

These measurements are neither a simultaneous sum nor a full region-memory bound. Process-tree samples can miss brief peaks. The 1 GiB region-data criterion remains open; broader RSS exceeding it does not by itself prove region data alone exceeds it.

## Independent review, repairs and next step

Claude's card review `20261029T024257Z-07ca97` required fixed world-tile probe seeds, separation of source/validation/cache telemetry, explicit two-tile scope and a resident-versus-evicted revisit definition. Those changes preceded the first screen. The first screen passed graph/unknown/fidelity publication gates and disclosed the failed new-source-contact subcriterion.

The decisive review `20261029T032149Z-662636` supports the ordinary-speed result. It identified a real retirement race: while GPU completion was awaited, a victim remained selectable and could become active before being freed. The repair marks it retiring synchronously and excludes it from coverage selection throughout the wait. A focused deferred-drain check verifies unavailable/alternate-region behavior. The separate-cache check uses the actual cache routing with a CPU field stub to force validation eviction and confirm source retention, independent bounds, source eviction and reset behavior. Both pass. These checks are not a replacement performance replay.

All eleven source hashes recorded in the full browser report match preserved measured files (`source-check-r1.json`). Repaired live files and original measured files remain distinct. The repaired preview startup/cleanup check (`preview-1793245489282.json`) passed on hardware Chrome. A separate host check (`cleanup-check-r1.json`) found no owned controller/native processes, no listener on 5254, and the GPU lock free. No experiment remains running. No product source, commit, push, merge or acceptance gate is part of this scratch milestone.

**Decision:** retain PR3 as a finished bounded prototype. Do not turn the missed one-second latency target into a general optimization campaign: ordinary movement already remained ready. The next discriminator is one controlled coarse-to-finer replacement at the same location, with old and new geometry resident during preparation, atomic visible/contact activation, body clearance at the swap and contact on the finer level. It should also close the new-detail contact gap and extend source exposure beyond two tiles under frozen criteria. Continuous exploration and safe changes in detail directly support the North Star.

## Evidence and process cost

Implementation and raw evidence: `/mnt/ml_storage/scratch/atlas-streaming-pr3/`.

- Criteria and scope: `card-r0.md`, `card-amendment-r1.md`, `preflight-decision-r0.md`.
- Independent geometry: `preflight-independent-r0.json`, `geometry-check-r0.json`, per-region field checks under `preflight-r0/`.
- Hardware measurements: `smoke-r0.json`, `full-r0.json`, `full-r0-run-0.json` through `-2.json`, `full-r0-late.json`, `full-r0-fast.json`, `server-full-r0.json`.
- Reconciled metrics: `metrics-r0.json`, `summarize_r0.py`.
- Review: `review-card-result-r0.json`, `review-final-result-r0.json`; verbatim exchanges in the canonical peer log and repository archive.
- Repair checks: `fix-lifecycle-r1.json`, `fix-cache-r1.json`, `source-check-r1.json`.

Card freeze was 02:42:57 UTC October 29 (October 28 local). Independent first-screen checks completed by 02:55:04, about twelve minutes later, within the 45-minute bound. Full hardware measurement ran 03:05:22–03:12:12. Independent review and closure repairs followed, within the four-hour bound. Job/stage/browser deadlines were retained. The two reviews were useful: the first corrected attribution before measurement; the second found the retirement defect and avoidable cache churn. Independent geometry checks connected the measured artifacts to qualified specimens. No repeat was sought merely to improve a verdict.

[Preview image](PR3-streaming-2026-10-28.png).
