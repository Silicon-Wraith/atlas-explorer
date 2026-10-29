# PR7 diagnosis: close-up placement failed

> **Subsequent execution:** [PR8](PR8-MULTISCALE-CONSTRUCTION-2026-10-29.md) validates one new fixed-world surface descendant, local fidelity and safe interaction. It stops at a weak visual result, with the original PR7 failures preserved. No full multiscale experience or broader world acceptance is claimed.

**Engineering interpretation corrected, 2026-10-29:** the North Star already establishes the intended distinction: multiscale exploration should reveal further mathematical structure within one fixed world, potentially through newly generated local geometry and topology. It need not refine the connectivity of an existing mesh. PR7 tested approximation discrepancy in a finite construction, not this general capability. The [engineering interpretation](../../superpowers/specs/2026-10-29-atlas-multiscale-world-clarification.md) and [next experience plan](../../superpowers/plans/2026-10-29-multiscale-feature-experience.md) correct the owner's experiment and generation/caching/transition reasoning. The original failure remains unchanged, and the withdrawn blind fine-build repair remains withdrawn.

**Correction after the advisor's subtractive-geometry challenge:** all eight rejected capture bodies also overlap real triangles of the existing coarse mesh. A new fine build is unnecessary to explain their rejection, and the proposed build-first repair below is withdrawn. Using a local normal to propose a camera does not assume a globally flat world; the supported finding is that this fixed placement heuristic produced invalid poses. See the fixed-pose audit below. Broader foundation work remains deferred.

**PR7 failed its visible-feature goal. Broader world-foundation implementation is deferred while this experience remains unresolved.** Recommending that we move on was premature. The original [experiment and full scorecard](PR7-VISIBLE-FEATURE-SCREEN-2026-10-29.md) remain unchanged: no accepted view, no new fine mesh, no browser demonstration.

The advisor requested a diagnosis rather than another broad search. This follow-up uses preserved inputs and separately frozen CPU probes. It does not reopen PR7 acceptance or award a pass to a changed test.

## What caused the rejection

The camera recipe used a local normal and tangent to propose a close-up pose. It placed the eye 0.52 new-body diameters outward and 0.52 tangentially, then explicitly checked mathematical-field occupancy. A radius-0.5 body would have only 0.02 diameters of clearance against an ideal plane. The actual surrounding surface is rough. The proposal rule did not guarantee clearance, and its occupancy checks correctly rejected invalid proposals. Calling this a flat-terrain assumption of the navigation system would overstate the evidence.

At factor four, the tangential offset is about 3.45 mm, 266 times the finite-difference step used to estimate the normal. Re-estimating the normals with half, twice and four times that step changes their directions by up to 17.38°, 10.62° and 37.44° at the three retained feature locations. This is evidence against extrapolating those local normals into body-scale clearance; it is not proof that any one estimate is the correct normal.

Four of the eight rejected eye centres are themselves in mathematical solid. All eight bodies contain solid samples strictly inside the physical radius, not merely in the safety skin. The field checks correctly reject these prescribed poses. They are not failing because validation is too slow or a time budget expires.

The initial parent-centre entry policy was a separate placement mistake. PR7c repaired entry/patch containment for eight views, but it did not repair their final camera positions. That is why its containment success did not produce a usable view.

## Visibility and clearance conflict in the tested locations

| Probe | Result | Meaning |
|---|---|---|
| Original factor-two views | Maximum 2.118 px across 1,280 views; zero at least 3 px | The selected approximation-displacement target fails before safety. |
| Original factor-four views | Maximum 4.236 px; ten at least 3 px | Some prescribed close-up poses produce enough projected displacement. |
| Eight retained factor-four capture bodies | All contain solid; four centres in solid | None is a valid visitor pose. |
| Fixed pullbacks along the same eight viewing directions | Only two poses reach zero sampled interior solid at the farthest, three-times distance; both then below 3 px | Backing away along these rays does not supply a demonstrated safe, qualifying view. Sampled air alone would not prove clearance. |
| Collision-aware directional probe at the same three entry-valid locations | 1,152 poses; 347 fit coarse coverage; 312 also outside closed solid; 152 also pass coarse surface clearance; maximum displacement among these 2.605 px | Removing the normal-based placement rule still gives no qualifying pose in this finite, conservative coarse screen. |

The last probe fixes factor four, 64 spherical directions and six distances (0.55, 0.75, 1, 1.5, 2 and 3 new-body diameters). It uses the real coarse triangle mesh, physical radius 0.125 old-body diameters and an additional clearance margin of 0.002 old-body diameters. This margin is more conservative than the original fine-body skin. No pose reaches the three-pixel stage, so target visibility, correspondence visibility, direct-path and final field screening are **not reached**. These are not 152 established reachable views.

Coarse geometry was qualified for the old body. Its use here is a diagnostic screen, not a qualification for the smaller body. The finite directions, conservative margin and retained coarse cube could exclude useful views. Consequently this does not prove that no reachable three-pixel view exists, or that the underlying world is unsolvable.

## Diagnosis and next discriminator

**Established:** the original camera placements overlap terrain; factor two misses the projection target; this bounded clearance-aware probe also finds no qualifying candidate. The requested experience has not been demonstrated.

**Supported explanation:** the fixture's fixed camera recipe produced invalid body-scale poses in rough terrain. Normal-step sensitivity does not independently prove that numerical normal error caused those overlaps. In these locations, moving close enough to magnify coarse/fine correspondence differences competes with body clearance. The defect is in the candidate-placement method and potentially the choice of acceptance proxy. There is no evidence here of a preparation-latency or scheduling cause.

**Unresolved:** whether a newly prepared finer collision representation supports a reachable, recognisable close-up; whether the three-pixel displacement proxy actually captures the discovery we want. PR7 never built that finer representation, so it did not test the finer mesher, its runtime, or the general prepared-region architecture.

Keep the current experience as the next discriminator. The earlier recommendation to prepare finer geometry as the immediate repair is withdrawn after the fixed-pose audit below. First resolve what the experiment is meant to reveal: another subtractive construction layer, or greater numerical accuracy for the same already-carved surface. Assess whether the three-pixel displacement between approximations actually measures that experience. Use existing geometry to establish candidate clearance and route wherever applicable. Any subsequent build needs a specific missing-geometric-information justification, a bounded card and a frozen criterion; a changed measure cannot retroactively pass PR7. Do not begin the broader lattice implementation as a substitute for this missing result.

## Fixed-pose audit and subtractive refinement

The advisor correctly observed that removing solid cannot create a collision for the same body at the same pose. If fine solid is contained within coarse solid, coarse-body clearance implies fine-body clearance, within shared coverage. This implication requires containment; a subtraction-based world construction alone does not establish containment between separately approximated meshes.

Source inspection finds that the current builder starts with the retained parent and subtracts the same child/grandchild cutters at finer sampling spacing and tighter meshing tolerances. It does not add a new mathematical cutter when the body shrinks. The cutters are independently resampled and triangulated; the builder does not enforce coarse/fine solid containment. Thus two different operations had been conflated: adding a genuinely subtractive layer, and improving the approximation of a fixed carved surface. This is an implementation/experiment distinction to resolve, not a reason to assume another build will fix the experience.

`coarse_pose_audit_r0.mjs` checks exactly the eight preserved capture poses against the existing coarse real-surface triangles. It finds **8/8 already overlap the coarse surface**, with nearest-surface distances of 0.004287–0.315312 new-body diameters, all below physical radius 0.5. Four centres are also inside its closed solid. Five bodies extend outside the retained coarse cube, limiting full-body coverage claims, but every pose has a positive overlap witness on an existing real triangle; no extrapolation outside the cube is needed to reject clearance. These are not examples of a coarse-clear pose becoming blocked by refinement.

The separate 152 coarse-clear directional samples are different poses and all miss the three-pixel proxy. They were never evaluated with a fine mesh or reported as fine collisions. Consequently the current evidence supplies no counterexample to the advisor's coarse-clearance reasoning. A fine build is not the supported next repair for the eight failed views.

Reviewed sources: `/mnt/ml_storage/scratch/atlas-connected-pr6/streaming_builder_r0.py` (same-component rebuild and Boolean subtraction), its `adaptive_graph_pr3.py` (independent surface sampling/triangulation), `prepared-r0/sampling_r0.py` (fixed components and field), and PR7 `camera_approach_r0.py` (pose rule followed by field rejection). `subtractive-audit-source-hashes-r0.json` preserves their hashes. The fixed-pose audit completed in under one second, CPU only. No new candidate, finer geometry, navigation change or acceptance rerun was introduced. This correction is owner analysis, not a new peer certification.

## Evidence and process

Root: `/mnt/ml_storage/scratch/atlas-feature-pr7-diagnosis/`.

- Frozen scopes: `scope-r0.md`, `clearance-pose-scope-r0.md`.
- Original-input hashes: `input-hashes-r0.json`.
- Field, normal, projection and fixed-pullback probes: `diagnose_r0.py`, `diagnosis-r0.json`, `diagnosis-r0.out`.
- Collision-aware probe and filter counts: `clearance_poses_r0.mjs`, `clearance-poses-r0.json`, `clearance_trace_r0.mjs`, `clearance-trace-r0.json`.

The recorded trace is a second evaluation of the same frozen poses with filter counters, not a search expansion. All CPU commands completed within 120-second caps. No GPU/browser work, fine build, product-source edit or performance rerun occurred. These follow-up findings are owner analysis, not an additional independent Claude certification. Prior PR7 reviews do not certify them.

Process accounting: approximately 15 minutes of diagnosis and reporting, with CPU runs taking seconds. The centre/body distinction and filter counts were useful: they prevent attributing an invalid-camera rejection to the geometry builder, and prevent claiming that coarse-clear samples are reachable. No further scale/location search was undertaken. Existing PR6 evidence remains valid within its original scope; it does not satisfy PR7.
