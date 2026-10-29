# PR1: prepared geometry walkthrough

**Status:** finished walkthrough with performance accepted for this prototype. The overall average was **47.2 FPS**, above the advisor’s30FPS target; query timing also passed. The advisor explicitly accepts the occasional slower frames as non-blocking for this first step. The original stricter RAF-p95 screen remains recorded below as diagnostic evidence. Production streaming/LOD qualification is a separate, unfinished scope.

The advisor's architectural correction now has an observable implementation: the browser renders prepared triangles, movement queries the same triangles, and neither rendering nor movement calls a fractal evaluator. The visitor can traverse the existing grandchild opening, approach a surface without passing through it, retreat, and switch to a neighboring prepared patch after a clearance check.

The advisor also steered the work toward finishing a bounded experience rather than continuing to expand meshing research. The implementation is intentionally small and retains the known limitations below.

## Try the walkthrough

Run this on the workstation:

```bash
/mnt/ml_storage/scratch/atlas-prepared-demo/preview.sh
```

It takes the shared GPU lock, serves private port5248 and opens isolated headed Chrome with the recorded profile. Close the window or pressCtrl+C; it also closes automatically after15minutes. The manual preview was also launched on hardware Chrome and interrupted to verify cleanup. The test caller initially treated the expected SIGINT exit of flock as a failure; the preserved reconciliation confirms that the Node child completed browser/server cleanup successfully. Nothing is left serving after verification.

## What is built

- Walkthrough: `/mnt/ml_storage/scratch/atlas-prepared-demo/index.html`
- Source: `/mnt/ml_storage/scratch/atlas-prepared-demo/app.mjs`
- Bounded launcher/test: `/mnt/ml_storage/scratch/atlas-prepared-demo/run-browser-r1.mjs`
- Experiment card: `/mnt/ml_storage/scratch/atlas-prepared-demo/card-r0.md`

Controls: WASD moves, Q/E rises or descends, dragging changes the view, and R resets. The Opening and Surface patches buttons select the two fixtures; Replay path runs their saved routes. The finite prepared boundary is disclosed and refuses unsupported movement rather than inventing geometry.

WebGPU renders the same normalized vertex and real-triangle buffers that Rapier uses for movement. Artificial region-closing faces are excluded from both. A separate closed-solid mesh supports activation checks; its closure faces never act as movement walls. The browser checks whole-body containment in the prepared region, center exclusion from the closed solid, and clearance from the real surface before atomically changing the active render/collision patch. An unsafe activation probe is rejected. A closed-triangle cube validates the inclusion query's basic semantics.

## Smoke evidence

Installed Chrome ran headed at1280×720 with the recorded NVIDIA/Vulkan/WebGPU launch profile and sandbox enabled. Adapter identity was **NVIDIA RTX6000 Ada Generation**. The opening traversal recorded no contact, error or prepared-boundary refusal. The local fixture recorded surface contacts and10patch activations with no activation rejection, boundary refusal or error during the eight-second replay.

Loading the prebuilt assets and constructing all browser query structures took approximately **1.966seconds**. This excludes native geometry generation and is not a full cold-neighborhood timing. Browser construction includes the additional closed-solid indexes used for safe activation: opening1.522s, center86.4ms, plus178.5ms, minus60.7ms. Explicit render-buffer allocation was14,884,680bytes, excluding depth/driver/runtime allocations.

Screenshots:

- [Opening screenshot](PR1-opening-2026-10-28.png)
- [Surface/contact screenshot](PR1-patches-2026-10-28.png)

The initial smoke attempt failed before browser launch because port5195 was occupied. The existing listener was neither adopted nor terminated. The preserved repair uses port5248 and closes only an owned listening server. The r1smoke run drained GPU work, closed Chrome/context and stopped its server successfully.

## Preparation findings supporting the demonstration

The [earlier PR1 report](PR1-PREPARED-REGIONS-2026-10-28.md) preserves the full original/static findings. Subsequent evidence is in `prepared-adaptive-r0`, `prepared-local-r0` and `prepared-layers-r0` under `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/`.

The wide adaptive attempt stopped at its fixed2Mselected-vertex limit while constructing the child component. No finished wide adaptive mesh or fidelity pass exists. It did not justify further tolerance changes.

A smaller observer-local patch at quarter scale built successfully with the same body size and accuracy limits. Fine source sampling plus PyMartini RTIN produced49,687real collision triangles. Mesh construction including accuracy probes and serialization took1.094s; adding the separately measured collision index gives1.163s. Fresh sampled two-sided fidelity and independent contact checks passed, with maximum field-reference distance0.00003984m against0.000265625m tolerance. This is local coverage, not the original two-second reachable neighborhood.

The parent in this local region is uniform solid: its prepared clipped representation is a12-triangle full block, with no visible parent surface. Reusing that reference elides its repeated field/mesh work. **This demonstrates reuse of uniform-in-region prepared state, not reuse of a visible layered surface or a general geometry-perturbation representation.** Claude independently verified the distinction in review20261028T232603Z-41ab4b. The broader claim is not adopted.

With that reference retained, three predetermined local patches took0.748/0.670/0.508s to construct. Their separate mesh-plus-index lower bounds were0.882/0.765/0.538s. The parent reference cost0.0118s to build. The central saved mesh arrays are bitwise identical to the version that rebuilt its parent. Fresh sampled fidelity passed for all three, but all exposed reference points lie on the grandchild floor; these local patches do not test an intersection or opening boundary. The separate opening fixture does test the saved route through the grandchild opening.

All three colliders can remain resident. Revisit performs zero new field evaluations and zero index builds; the measured Node query p99 was1.315ms and maximum1.570ms. That is separate from the browser replays below.

## What the layers discussion changes

The advisor described scale-dependent geometry as layers and suggested the analogy of “geometry perturbation.” This is a useful representation hypothesis, not an adopted algorithm or proof. A coarse reference plus local refinements may support reuse; connectivity changes or newly resolved openings can require more than vertex displacements. The world generator remains authoritative.

The implementation should retain bounded local representations, prepare detail ahead, and retire superseded representations. Rendering and collision must consume the same active boundary. It must not indefinitely subdivide one growing mesh.

Current patch-relative sampling shifts the approximated surface slightly when a neighboring patch is built. Measured overlap discrepancy was at most0.0000312m, within the local fidelity tolerance but not zero. Therefore **seamless tiling is not established**. The demonstration switches whole patches in their overlap with a clearance check; it does not render a joined tile seam or claim arbitrary LOD safety. World-anchored composed chunks with shared source samples are the next relevant representation test.

## Acceptance clarification after advisor review

The owner’s phrase “failed frame-rate target” conflated average frame rate with the additional95th-percentile criterion in the experiment plan. That was misleading. Across17,000recorded frame intervals totaling360.2599seconds, the average was47.188FPS; individual runs were47.210,47.235and47.119FPS. **Against a30FPS average target, this is a pass.**

The advisor explicitly judged this performance good for the first step and the occasional40msintervals non-blocking. The owner accepts that judgement: the walkthrough is done and its frame consistency is not a release blocker for this prototype. No run or measurement has been altered. The stricter original33ms-p95 comparison is retained historically, not presented as grounds to reject the prototype.

The broader experiment also specified queryp99<=2ms/max<=8ms; cold-ready<=5s; preparation-ahead target<=1s with2slookahead; <=1GiB workingdata; sampled geometry/contact error<=1%bodydiameter; no field investigation during movement; resident reuse; and safe geometry/detail transitions. These were experimental criteria, not all prerequisites to accepting this bounded walkthrough. Full cold-ready, streaming, finer-detail transition and memory claims remain unestablished. The owner should have communicated that scope distinction explicitly.

## Full criteria scorecard

This scorecard covers all nine criteria in the [frozen feasibility plan](../../superpowers/plans/2026-10-28-prepared-regions-feasibility-plan.md), followed by its required coverage and execution checks. **The bounded walkthrough is complete and its performance is accepted. The original broader feasibility result is partial.** “Partial” identifies a limited successful test or a mixed result; “unverified” means the required measurement is missing, not that it failed.

The owner should have presented this scorecard with the results. The original plan specified a frame-consistency threshold in addition to other system criteria; presenting that as simply a failed “30 FPS target” was incorrect. The advisor's subsequent acceptance of 47.2 FPS applies to this prototype. It does not change historical measurements or imply that untested streaming capabilities passed.

| Original criterion | Threshold | Evidence and result |
|---|---|---|
| Navigation independence | Zero fractal evaluations, mesh construction or occupancy refinement from movement | **Pass for the walkthrough.** Movement consumes prepared Rapier structures; the browser imports no field evaluator. The reported zero is structural evidence, not an instrumented evaluator counter. |
| Collision cost | p99 ≤2 ms; maximum ≤8 ms per movement update | **Pass for all three walkthrough runs:** p99 1.4/1.3/1.2 ms; maximum 5.4/7.2/5.4 ms. **Broader stress corpus has failures:** earlier long sweeps reached p99 6.135 ms and maximum 8.898 ms in the opening fixture. These are different workloads; the walkthrough does not erase those failures. |
| Presented motion | Two minutes at 1280×720; p95 interval ≤33 ms; maximum ≤100 ms after warm-up | **Original p95 screen missed:** RAF p95 39.9 ms in each run. **Maximum screen passed:** 40.1 ms. RAF is a proxy; actual display-presentation timestamps were not measured. Internal resolution and viewport were both 1280×720. **Separately, the accepted ≥30 FPS average target passes at 47.188 FPS overall.** |
| First usable neighborhood | ≤5 s from empty cache, including generation, assembly, indexes, transfer and publication | **Unverified for the final implementation.** Initial wide specimen failed even before transfer/publication: mesh plus index took 5.734 s. Later local patches have much lower component times, but no complete cold-to-usable measurement exists. Browser asset/index setup took 1.951 s using already generated meshes; it is not full cold preparation. |
| Preparation ahead | Every required region ready before entry; two-second lookahead; target ≤1 s after scheduling | **Unverified.** Three local mesh-plus-index component sums were 0.882/0.765/0.538 s with a retained parent reference. These are lower bounds, not scheduling-to-ready measurements. All demo regions were preloaded; no preparation-ahead scheduler was exercised. |
| Working set | ≤1 GiB CPU region data plus GPU allocations, including build buffers and old/new overlap; RSS reported separately | **Unverified.** Native worker peak RSS was 697 MiB; separate Node end-snapshot RSS was 246.8 MB; evaluator GPU pool was 8.52 MB; browser render buffers were 14.88 MB. These have different scopes/times, omit allocations and cannot establish a combined peak or ownership budget. |
| Collision behavior | No observed tunneling, unintended crossing, unsupported floor or embedded visitor; contact discrepancy ≤1% of body diameter | **Pass on sampled static collision checks and observed walkthrough routes; partial against the full planned corpus.** Each replay recorded 40 contacts, 78 safe same-scale activations, zero boundary refusals and zero errors. Independent saved-triangle checks found no sampled penetration and contact errors below tolerance. Finer-detail transitions and all corner/activation cases remain unqualified. |
| Geometric fidelity | Independent sampled displacement ≤1% of body diameter; retain named walls/openings; disclose uncertainty/coverage | **Mixed.** All three final local patches passed sampled comparisons in both directions, and the separate named opening route remained traversable. Local reference samples cover the grandchild floor, not general intersections. Earlier wide quarter-scale geometry failed: maximum distance 0.0002890 m versus 0.000265625 m allowed. The final local success does not qualify that wider geometry or all scales. Sampling is not a proof that every small feature survives. |
| Reuse | Zero field evaluations or collider rebuilds on unchanged resident-region revisit | **Pass for resident patches.** Three colliders remain available and revisits reuse them. Eviction/reload behavior and a bounded streaming cache were not tested. |

The remaining requirements were stated in the plan's scope and ordered work, outside its nine-row threshold table. They must also be visible:

| Required coverage or method | Result |
|---|---|
| Actual parent/child/grandchild geometry; H_contact, H_edge and ordinary-terrain control | **Partial.** All were represented in static experiments. The final walkthrough uses a separate opening fixture and smaller contact patches; it does not qualify every difficult intersection. |
| Three observer scales: original, quarter and sixteenth | **Partial.** Static contact tests covered all three. The earlier quarter-scale fidelity test failed. Final adaptive local contact patches demonstrate quarter scale only, with no continuous zoom transition. |
| Same triangles and transform for rendering and collision | **Pass for the walkthrough.** Both consume the same normalized vertices and real triangles. Artificial closing faces are excluded from movement/rendering and used only in a separate activation structure. |
| Mathematical provenance and unresolved evaluations | **Supported within the built specimens.** Source/fixture hashes are preserved; builders reject unresolved evaluations rather than assigning geometry to them. Broad feature preservation remains limited by the fidelity coverage above. |
| Existing geometry/collision implementations | **Met.** Native Manifold composition, PyMartini refinement and Rapier queries were used; no new physics engine was built. This is experimental dependency use, not product adoption. |
| Ordinary and faster traversal; two-second prediction from current motion only | **Partial.** Speeds of 0.5 and 2 body diameters/s were frozen for the broader experiment. Static sweeps tested multiple lengths and directions. A scheduler meeting the frozen paths/speeds and prediction constraint was not implemented or qualified. |
| Connectivity, winding, shared edges and independent collision checks | **Partial.** Built closed meshes passed edge/winding checks, and sampled collision results were checked independently against saved triangles. This does not establish watertight boundaries between separately prepared visible patches. |
| Grazing, approach/retreat, near-surface starts, openings and high-speed/corner cases | **Partial.** Static tests covered approach, retreat and tangent sweeps at multiple lengths; the browser exercised opening traversal/reversal and contact/retreat. Complete corner and fast continuous-navigation coverage is not established. |
| Adjacent regions, two detail levels and safe activation | **Partial.** The demo made 234 same-scale patch activations across three runs, changing render/collision references together after clearance checks. No finer-detail activation was tested. The unsafe probe was rejected by body-boundary containment and does not independently test the embedded-center rejection branch. |
| Seam crossing without gaps or moving a surface through the visitor | **Unqualified for joined seams/LOD.** Overlap surface discrepancy reached 0.0000312 m, below local fidelity tolerance but nonzero. Whole-patch switching in overlap is demonstrated; joined watertight tiles are not. |
| Sudden direction changes, deliberately late preparation and honest fallback | **Untested as streaming behavior.** The finite demo bounds reject unsupported movement, but no deliberately late build or preparation deadline was exercised. Zero normal-route refusals is a preload result. |
| Bounded background jobs, old/new overlap, retirement and shared request/ready/entry timeline | **Untested as an integrated system.** No native preparation ran during the browser replays. Frame performance under preparation contention and complete peak-memory accounting remain open. |
| Three fixed replays after a declared warm-up; cold/resident distinction | **Met for the resident walkthrough.** One five-second warm-up, then three 120-second runs, each split equally between opening and local-contact routes. Cold readiness remains separately unverified. |
| Recorded hardware/browser, bounded execution, exclusive GPU use and cleanup | **Met for browser evidence.** Headed Chrome 155.0.8059.84, NVIDIA RTX 6000 Ada, enabled sandbox and recorded Vulkan/WebGPU profile; owned browser/server cleanup confirmed. |
| Preserve failures, bounded mechanical repair and source evidence | **Met.** Occupied-port failure and its repair are preserved, as are geometry/timing failures. No extra replay sought a better score. Source hashes, raw traces and screenshots are retained. |
| Independent challenge | **Met for the reported evidence.** Claude reviewed decisive stages and the final source/replays; review 20261028T234640Z-4810cf supports a finished walkthrough and partial broader feasibility. |
| Time limit, stop rules and proportional process | **Overall eight-hour cap met:** approximately 123 minutes to the completed walkthrough/replays, with final review/cleanup afterward. Failed wide/dense/adaptive attempts stopped and remained failures. Subsequent work narrowed the scope under advisor steering; it is not a pass through the original stage gates. Independent checks caught the wider fidelity failure and narrowed reuse/timing claims. Reporting during work was inadequate. |
| Scratch-only scope; no product promotion | **Met.** No product-source replacement, commit, push or merge. This report does not certify a production streaming system. |

**Decision:** accept the working walkthrough and its measured performance. It supports the North Star by demonstrating that visitors can navigate prepared mathematical geometry without doing expensive mathematical investigation during movement. The next missing experience is reaching a newly prepared region while moving, followed by safe changes of detail. Those need their own bounded demonstration; reducing the current accepted frame-time tail is not a prerequisite.

**Evidence locations:** browser measurements and source hashes are in `/mnt/ml_storage/scratch/atlas-prepared-demo/full-r0.json` and `run-r0-0.json` through `run-r0-2.json`; preparation, fidelity and stress results are under `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/prepared-*-r0/`. The artifact hash manifest is `/mnt/ml_storage/scratch/atlas-codesign/pr1-walkthrough-manifest-2026-10-28.json`. This scorecard reconciles preserved results; no experiment was rerun to produce it.

## Fixed browser replay results

One five-second warm-up preceded three120second runs:60seconds of opening traversal/reversal followed by60seconds of contact, retreat and safe neighbor activation. No native preparation jobs ran during these replays. Frame intervals are requestAnimationFrame intervals, a presentation proxy rather than hardware display timestamps.

| Run | RAF interval p95 / max | Query p99 / max | Contacts | Patch activations | Errors / boundary refusals |
|---|---|---|---:|---:|---|
| 1 |39.9 /40.1ms|1.4 /5.4ms|40|78|0 /0|
| 2 |39.9 /40.1ms|1.3 /7.2ms|40|78|0 /0|
| 3 |39.9 /40.1ms|1.2 /5.4ms|40|78|0 /0|

Query timing passes the2ms p99 /8ms maximum criteria. RAF interval p95 misses the33ms screen in all three runs; maximum stays below100ms. Most observed intervals were20ms, with some40ms; the experiment does not attribute those missed intervals to the application, GPU or compositor. No repeat was run to obtain a better performance verdict.

No run recorded activation rejection or an unprepared-boundary refusal. The separate unsafe activation probe was rejected; that particular probe also violates whole-body containment, so it does not isolate the penetration-rejection branch. Browser code imports no fractal evaluator. Its zero-field-evaluation report is a structural property of this implementation, not an instrumented counter inside an evaluator.

The full run reports1.951s for asset/index setup and confirms the same hardware adapter and enabled sandbox. GPU work drained; browser/context closed and the owned server stopped. Results are `full-r0.json` and `run-r0-0.json` through `run-r0-2.json` under the demo directory.

## Limits and next engineering work

- No preparation-ahead scheduler, background native preparation contention, browser geometry builder or two-second lookahead qualification is demonstrated.
- The controlled replacement is between same-scale overlapping patches. Finer-scale activation, watertight shared seams and arbitrary intersection boundaries remain unqualified.
- Sampled fidelity is empirical; it is not a mathematical enclosure proof or preservation guarantee for every sub-resolution feature.
- Native process peak RSS was697MiB for the three-patch preparation worker; Node's end snapshot with three colliders was246.8MB and GPU evaluator pool8.52MB. The snapshot is not a Node peak, and this is not complete CPU/GPU ownership accounting.
- Product source and acceptance policy are unchanged. No commit, push or merge was performed.

The finished walkthrough is a useful bounded result even while these limits remain. The next implementation should be driven by the observed experience and the specific missing readiness/transition behavior, not another open-ended optimization search.


## Prior art and process

The layer/reference idea has established relatives: [progressive meshes](https://hhoppe.com/proj/pm/) support selective refinement and transitions between detail levels; [geometry clipmaps](https://hhoppe.com/proj/gpugcm/) retain nested grids and update them as the viewer moves. Those precedents guide future work; this walkthrough does not implement either complete scheme.

PR1 started21:43UTC. The visible walkthrough and fixed replays were complete by23:46UTC, about123minutes including the earlier experiments, reviews and the advisor's interventions. The dense/adaptive failures narrowed the preparation problem; the local-patch test and browser demonstration produced useful positive evidence. The advisor's request to finish prevented further seam/cache research from becoming a prerequisite to showing the experience. Reporting gaps during work were a process failure and are not excused by the preserved logs.

Claude independently reviewed the source and all three runs in **20261028T234640Z-4810cf**. He found no source bug invalidating the narrow observed behavior and accepted a finished walkthrough with overall feasibility **partial**. His corrections are reflected above: the browser has no field evaluator rather than an instrumented evaluation counter, and RAF intervals are not hardware presentation timestamps. The earlier layers review narrowed the reuse claim to a uniform-in-region parent.

Final launcher check: `preview-check-r0.json`, `preview-check-reconciliation-r1.json` and the timestamped preview report preserve the interrupt and confirmed cleanup. No preview, server or GPU experiment is intentionally left running.
