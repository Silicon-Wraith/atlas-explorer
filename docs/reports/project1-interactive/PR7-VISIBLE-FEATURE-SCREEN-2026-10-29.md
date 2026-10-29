# PR7: bounded visible-feature screen

**No candidate passed the frozen screen, so no fine patch or browser showcase was built.** The existing PR6 connected-flight experience remains available and its measurements are unchanged.

**Status correction after advisor challenge:** the visible-feature step failed its experience goal. Broader world-foundation implementation is deferred. The [follow-up diagnosis](PR7-DIAGNOSIS-2026-10-29.md) identifies invalid local-plane camera placements and a visibility/clearance conflict in the finite probes. The original recommendation below to move on was premature; it is preserved as historical interpretation, not the current work order.

The experiment asked whether a safely reachable, smaller-scale view could show at least three pixels of geometric change between a retained coarse mesh and a finer surface approximation. It screened 320 fixed mathematical surface locations in the qualified corridor. Factor two produced no qualifying view. Factor four produced ten projected views at four locations, but the initial transition arrangement could not contain the body. A separately frozen, post hoc approach-position test fixed that coverage problem; all eight remaining above-threshold views then failed sampled body clearance.

This is a finding about the tested placements, camera poses and transition policies. It establishes neither a general limit on smaller-scale exploration nor the absence of finer mathematical structure.

## Scope and frozen choices

Owner Codex; challenger Claude. The advisor authorized this bounded experience experiment before the broader browser-ready-world work and accepted current performance as sufficient for continued development.

The candidate set was frozen before evaluation: the first 64 exposed grandchild-floor reference points from each PR3 region 0–4 qualification artifact, with no replacement or top-up. All five supplied 64 points, giving 320. `frozen-candidates-r0.json` preserves exact points and source hashes. All 320 CPU field reevaluations were finite, passed the exposed air/solid-side screen, and yielded coarse chart correspondences.

Old body diameter D is 0.0265625 m. PR7a uses d=D/2; PR7b, executed only after PR7a found none, uses d=D/4. Four camera choices are fixed per location: positive/negative chart u or v projected onto the estimated outward tangent plane, viewed obliquely with eye normal and tangent offsets 0.52d. The field normal uses centered differences at step D/2048 and a numerical composed-field air/solid-side check. This is a sampled numerical normal, not an analytic smoothness guarantee.

The camera model matches the prototype: 1280×720, vertical projection factor 1.3, focal scale 468 pixels. Fine physical half extent is D/2; at factor four that equals two new-body diameters. Incoming body containment therefore uses the actual half extent, rather than assuming one body diameter.

The three-pixel threshold, world sampling step d/256, error tolerances, finite locations and camera choices were not adjusted after outcomes. At most one fine patch could be built across all variants; none was justified. No factor-eight variant was attempted.

## Correspondence and projection correction

Two points on one eye ray project to the same pixel. A review suggestion to project the coarse and true intersections along that ray would measure zero lateral displacement. A small CPU assertion preserves that check, and Claude subsequently withdrew the suggestion.

The screen instead uses generator-chart correspondence: a ray along the component normal through the true field point finds the coarse mesh at the same chart coordinates (a,b). Both material positions are then projected from the frozen oblique camera. This avoids treating every height difference as lateral pixel motion and avoids silently substituting a nearest point at another chart location.

Ray-query syntax and hit-point reconstruction were checked through Context7 against the official [Rapier World API](https://rapier.rs/javascript3d/classes/World.html) and [RayColliderHit API](https://rapier.rs/javascript3d/classes/RayColliderHit.html). The installed library reports 0.21.0. A cuboid ray control passed. The independent screen checker verifies that reported coarse points lie on the actual normalized float32 triangles and recomputes projections and cube margins.

Projected correspondence displacement remains a shortlist criterion. It would require actual fine geometry, visible correspondence and image corroboration to establish a named visible feature.

## Results

| Variant | Locations | Fixed views | Views ≥3 px | Safely eligible | Finding |
|---|---:|---:|---:|---:|---|
| PR7a, factor two | 320 | 1,280 | 0 | 0 | No view passes the geometric projection threshold. |
| PR7b, factor four, parent-centre entry | 320 | 1,280 | 10 at 4 locations | 0 | Every above-threshold view fails fine-cube body containment for the transition. |
| PR7c, factor four, actual coarse approach | 4, selected post hoc and frozen before execution | 16 | 8 among 3 accepted approaches | 0 | Coverage passes; all eight views contain sampled solid points within the body at capture. |

The four locations identified in PR7b are parent/reference pairs (0,1), (0,7), (4,15) and (4,20). Their ten projected displacements range from about 3.04 to 4.24 pixels. All retained parent-reference bounds pass. Eight views include the target point within the fine cube, while two additionally fail that condition. No body-occupancy evaluation was needed for PR7b because cube containment had already failed; it would be incorrect to call those views collisions.

### Entry-policy follow-up

Before any candidate evaluation, the owner simplified the original entry rule to the qualified parent region centre. That made the first screen easy to relate to the existing corridor but imposed a restrictive transition. PR7a/b stopped with their original results preserved.

PR7c was a **post hoc hypothesis, frozen before execution**, testing that entry restriction alone. It used only the four identified locations, unchanged camera choices, factor four and the same three-pixel threshold. A real Rapier sphere sweep of the old body from the parent centre toward the field point supplied an approach position, backed off by a fixed 0.002D along the ray. The position had to remain in the coarse cube, outside its solid and at least 0.501D from its real surface.

| Location | Approach cosine | Independent coarse clearance / D | Entry accepted |
|---|---:|---:|---|
| Region 0, reference 1 | 0.6473 | 0.50129627 | Yes |
| Region 0, reference 7 | 0.7894 | 0.50157919 | Yes |
| Region 4, reference 15 | 0.8054 | 0.50161188 | Yes |
| Region 4, reference 20 | 0.4722 | 0.50094590 | No |

The last rejection is geometric: ray backoff contributes less normal clearance on a grazing approach. Its result was retained; the threshold or backoff was not tuned.

All eight above-threshold views from accepted entries now pass cube containment, feature inclusion and retained-reference bounds. Field occupancy was sampled at nine body-centre positions along the approach-to-eye segment, using the centre and 64 sphere directions at radius 0.501d. The eye-to-feature sightline was also sampled. Every view had solid samples at the final capture body itself; counts were 14, 24, 42, 12, 45, 49, 33 and 25 out of 65. There were no unknown samples. Five sightlines also encountered solid samples; three were clear. Explicit counterexample points are preserved in `approach-check-r0.json`. These initial counterexamples were the first encountered, not the deepest. A read-only diagnostic at the same rejected poses (`capture-depth-diagnostic-r0.json`) found maximum chart-normal floor gaps of 0.276–1.093d; these are graph-axis gaps, not Euclidean penetration depths. A second diagnostic sampled strictly inside physical radius 0.5d, at radius 0.499d: all eight bodies still contained solid samples (14,24,41,12,44,48,32,25). This resolves a review question about one initially marginal counterexample without changing any acceptance rule or pose.

These are finite composed-field occupancy checks. They establish why these frozen capture poses were rejected. No fine collider was constructed, so no stronger prepared-mesh body-clearance result is claimed.

## Full criteria scorecard

| Criterion | Target | Result |
|---|---|---|
| Candidate set | Freeze before evaluation; no top-up | Met: 320 exact references, 64 per region, hashes preserved. |
| Mathematical field/normal applicability | Finite values and exposed air/solid sides | Met at all 320 screened points within numerical sampling scope. |
| Coarse correspondence | Same chart location on actual mesh | 320 ray correspondences; cuboid control and independent triangle checks on above-threshold results pass. |
| Projected feature | ≥3 px from a fixed valid camera | Factor two has none. Factor four has geometric candidates, but none survives all safety conditions. |
| Old-body entry safety | Coarse cube fit, outside solid, clearance ≥0.501D | Three of four post hoc approaches pass; one grazing approach fails. |
| Fine transition coverage | Whole smaller body in patch at entry, capture and contact goal | Parent-centre entry fails for all ten initial projected views; actual approach passes for the eight surviving views. |
| Capture/body-path field screen | All sampled points air; unknowns ineligible | Miss: all eight final capture bodies contain solid samples. No candidate selected. |
| Fine construction and runtime/offline identity | At most one build, identical geometry | Not run: early safety stop; zero builds. |
| Fresh fine fidelity/contact/closed edges | ≤0.01 new-body diameter and valid topology | Not run: no selected fine specimen. Existing PR3/PR5 qualifications are not relabelled as new passes. |
| Actual visible feature/images | Named differing feature, ≥3 px corroboration | Not established. No unsafe camera showcase was rendered. |
| Free navigation, growth guards and incoming units | Safe feature integration in PR6 | Not run for this experiment. Existing PR6 remains unchanged. |
| Frame rate/navigation/preparation | ≥30 FPS, p99 ≤2 ms/max ≤8 ms, readiness target 1 s | Not measured here; no browser or performance rerun. Prior PR6 evidence remains separate. |
| Runtime memory/residency | ≤4 regions; declared caches; 1 GiB ownership if attributable | Not newly assessed. Prior ownership gap remains open. |
| Cold startup, late data, resident reuse | Declared readiness/recovery requirements | Not newly assessed because the candidate stopped before integration. |
| Bounds/process | ≤3 hours; bounded CPU variants; at most one fine build; preserve attempts | All CPU commands completed within their 120 s process caps. Three frozen variants stopped as declared; no GPU/browser workload, new scale, adaptive resampling or performance tuning was used. |
| Broader scope | Browser-ready world and visible mathematical exploration | Remains open. This screen neither adopts nor rejects a world architecture. |

## Interpretation and next step

The first negative result was partly caused by an experimental entry restriction. The follow-up removed that restriction and exposed a real body-clearance limitation in the selected close-up poses. This is a useful local finding, rather than a reason to redesign the working navigation system.

There is also a limit to the acceptance proxy: movement of the same material point between two approximations measures a level-of-detail difference. It does not by itself measure whether travelling closer reveals meaningful mathematical structure. Small differences can be desirable continuity. The frozen three-pixel criterion remains unmet; it should not silently become a general requirement that detail transitions visibly move surfaces.

The broader-world work should eventually be organized around a visitor journey: open the application, travel beyond fixed fixtures, prepare regions around the actual observer pose, approach recognisable structure, and revisit with bounded memory and honest recovery. Its implementation is now deferred while the failed visible-feature step is diagnosed and its next bounded repair specified. A further close-up placement/scale experiment requires a new card; it is not added to PR7.

## Evidence and process

Root: `/mnt/ml_storage/scratch/atlas-feature-pr7/`.

- Frozen scope: `card-r0.md`, `card-factor4-r0.md`, `card-amendment-r1.md`, post hoc `card-approach-r0.md`.
- Inputs: `frozen-candidates-r0.json`, `field-candidates-r0.json`, source reference hashes.
- Coarse correspondence and first variants: `coarse-correspondence-r0.json`, `camera-factor2-r0.json`, `visibility-factor2-r0.json`, `camera-factor4-r0.json`, `visibility-factor4-r0.json`.
- Independent arithmetic: `independent-screen-r0.json`.
- Follow-up: `approach-correspondence-r0.json`, `camera-approach-r0.json`, `visibility-approach-r0.json`, `approach-check-r0.json`.
- Peer review: `review-card-result-r0.json`, `review-screen-result-r0.json`; `review-final-result-r0.json`. Verbatim exchanges are archived in the codesign log.

Claude’s first review added capture safety and actual candidate-count checks. The second accepted the narrow negative finding, withdrew the eye-ray suggestion, and challenged the post hoc approach variant’s grazing clearance. The owner’s projection correction is preserved by a small mathematical control. Independent distance checks agree with all four actual approach classifications.

No product source change, commit, push or merge is part of this experiment. Claude’s final review 20261029T173822Z-09f83f agrees with the stop and narrow interpretation. It checked approach clearances and composed-field occupancy evidence but did not trace the long JavaScript conversion line or independently verify the original ten-view/four-location counts and eye-ray details. The owner’s independent triangle/projection/margin check verifies the counts, and the entry-formula diagnostic reconstructs every world entry with error below 1e-7D. The unchanged-pose diagnostics above clarify that the first counterexample was not the deepest; all eight poses overlap the physical body.

The observation that small approximation changes can support continuity is an engineering interpretation, not a reinterpretation of the frozen criterion. The three-pixel visible-feature criterion remains unmet.

Process accounting: card challenge began around 17:19 UTC; CPU screens, independent checks and the post hoc entry-policy discriminator completed around 17:36; final review and closure followed within the three-hour bound. CPU commands themselves took seconds; most active time went to implementation, three focused peer exchanges and reporting. The projection correction and capture-clearance checks prevented an unnecessary fine build and browser experiment. No performance replay, GPU workload or tolerance/pose tuning was used to obtain a cleaner verdict.

All owned CPU and review commands completed. PR6’s verified launcher remains `/mnt/ml_storage/scratch/atlas-connected-pr6/preview.sh`; no application source or launcher changed in PR7. The deferred broader initiative outline is [BW1: regions around the visitor](BW1-NEXT-2026-10-29.md).
