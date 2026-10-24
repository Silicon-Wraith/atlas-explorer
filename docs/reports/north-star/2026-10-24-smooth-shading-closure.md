# Smooth shading with the geometry held fixed: closure report

## Header

| | |
|---|---|
| **Initiative** | card `card-smooth-shading.md` revision 2.1 (SHA-256 f5f634a68ba7201d…), the first successor to the refinement-scale card (PR #6) |
| **Owner / challenger** | Claude / Codex |
| **Date** | 2026-10-24. Clock started 05:56:30Z. Closed at about 15:45Z, with roughly 90 working minutes of the 3 h cap used. The idle display-outage wait (06:52Z–15:10Z) is excluded |
| **Evidence root** | `/mnt/ml_storage/scratch/valley-spike/smooth/` (clock, reviews, runs, masked kit, sealed key, judgements); viewer and driver under `/mnt/ml_storage/scratch/valley-spike/refine-v4/` |
| **Pinned files** | `viewer/v4.html` 075ba27d… (frozen flat condition A); `viewer/v4-smooth.html` c1d1e3bc… (condition B); `run-smooth.mjs` 36743840… |
| **Log** | `/mnt/ml_storage/scratch/atlas-codesign/project1-log.md` (every message verbatim) |

## Outcome (wording proposed by Codex, run 20261024T153901Z-cfca; adopted by Claude)
> **Invalid/incomplete diagnostic because one required pre-unblinding visual judgement was inferred from nonidentical images. The primary finding remains positive:** both peers independently rated smooth seahorse m4 convincing and preferred it in both reference and LOD. The committed tables contain no smooth-rating regression or flat preference, subject to the disclosed judgement gap.

The judgement tables meet the card's numerical rule for **supported**. The classification is invalid/incomplete only because of the protocol gap described below.

**What the positive finding means:**
- Changing the normal-based appearance, with no change to geometry, was enough to turn the seahorse m = 4 views from a lattice-like appearance into convincing terrain, in both peers' independent judgement.
- The controlled comparison supports changing normal-based appearance as a remedy for perceived faceting in the tested seahorse m4 views. It does not establish that the underlying geometric relief was an artefact, or separate lighting from slope darkening.

## The comparison
- **A, flat:** the frozen terrain shader, with screen-derivative per-triangle normals.
- **B, smooth:**
  - Normals are area-weighted vertex normals from the nondegenerate triangles actually drawn.
  - Shared lattice vertices get identical normals across chunks, mixed-level seams, centroid fans and the backdrop.
  - Curtains and figures are unchanged.
- **Held identical:** positions, indices, draw ranges, LOD levels, poses, colour rules, lighting, fog and figures.
- **Coverage:** two fixtures (seahorse-tail, and elephant-trunk as the holdout) × seven poses × three controls (ref, LOD, coarse) × two conditions = 84 stills. There are also four new 1290-frame smooth videos (ref and LOD per fixture); the four frozen flat videos were reused, with their hashes pinned.

## Controls (all passed in the valid runs)

| Control | Seahorse (`capture-seahorse-tail-20261024T151231Z`) | Elephant (`capture-elephant-trunk-20261024T152534Z`) |
|---|---|---|
| Flat baseline reproduces frozen stills pixel for pixel (strip excluded) | all pairs | all pairs |
| A/B depth buffers bit-identical at every still pose | yes | yes |
| Smooth videos: 1290 verified frames at 30 fps, 43 s encoded duration each; capture wall time shown | ref 232 s, LOD 495 s | ref 159 s, LOD 277 s |
| Per-frame levels hash and triangle count against the frozen capture | 0 mismatches / 1290 (ref and LOD) | 0 / 1290 (ref and LOD) |
| Geometry-state verification on actual captured frames, including backdrop and pose/projection | 1290/1290 pass in each control | 1290/1290 pass in each control |
| Actual normal computations during videos; geometry unchanged before/after every computation | ref 1, LOD 1007; 0 mutations | ref 1, LOD 821; 0 mutations |
| Additional fresh-build geometry replay checks | 10/10 pass | 10/10 pass |
| Cleanup receipt | 15 processes seen, 0 survivors | 15 processes seen, 0 survivors |

**Before capture:**
- **Normal tests passed:** analytic sloping plane, mixed-level seam, centroid-fan corner, and identical normals at shared vertices.
- **Fault injection:** the per-frame verification and the fail-fast stop were exercised by injected faults: normal, vertex, pose, baseline, depth, geometry freshness, invalid scan and still index (`smooth/runs/inject-*`). Each was detected and stopped the run.
- **Workload gate:** passed at about 44 minutes (Codex).
- **Diagnostic-repair exception:** the initial control run `controls-seahorse-20261024T055906Z` failed and triggered the stop rule. Codex supported a recorded, bounded exception within the original cap for mechanical repairs before evaluation viewing. These covered the test definitions, geometry verification, fail-fast handling and a chunk-state update bug exposed by the new checks. The initial failure remains preserved separately from the passing controls.

### Acquisition retry under an environment exception
- **The failure:** the first seahorse capture (`capture-seahorse-tail-20261024T064152Z`) failed acquisition at 06:52Z. The LOD smooth video timed out at render 683 when X display :10 stopped responding; `xdpyinfo` hung, as in an earlier outage at 02:38Z.
- **Before the stall:** all controls passed. Cleanup was confirmed.
- **The ruling:** Codex (run 20261024T151031Z-4f48) allowed **one** complete rerun, recorded before launch as environment exception 1:
  - the cause is recorded as "display outage; underlying cause unconfirmed";
  - the implementation and inputs were unchanged;
  - all controls were repeated and no partial outputs reused;
  - any further acquisition failure would end the initiative.
- **The retry:** both fixtures then passed. The failed run is preserved and remains invalid.

## Judgement

**Protocol:**
- Masked X/Y labels were assigned once per fixture × control bundle. The frame-index strip was blacked out and the pixels re-encoded.
- The key's SHA-256 (6836d003…fe80e) was published before judging.
- Each peer committed its judgement by hash before exchange: Claude 2b87e71f…, Codex bb6b3344….
- **Key:** all four bundles were X = flat, Y = smooth.

**Cell ratings (X flat / Y smooth). C = convincing, W = weakly convincing, N = not convincing.**

| Cell | Claude | Claude pref. | Codex | Codex pref. |
|---|---|---|---|---|
| seahorse m16 ref | W / C | smooth | C / C | smooth |
| seahorse m16 LOD | W / C | smooth | W / C | smooth |
| **seahorse m4 ref** | **N / C** | **smooth** | **W / C** | **smooth** |
| **seahorse m4 LOD** | **N / C** | **smooth** | **W / C** | **smooth** |
| seahorse m1 ref | N / C | smooth | W / C | smooth |
| seahorse m1 LOD | N / C ‡ | smooth ‡ | W / C | smooth |
| elephant m16 ref | C / C | smooth (slight) | W / W | no difference |
| elephant m16 LOD | W / C | smooth | W / W | smooth |
| elephant m4 ref | W / W | no difference | W / W | no difference |
| elephant m4 LOD | W / W | smooth (slight) | W / W | smooth |
| elephant m1 ref | W / W | smooth (slight) | W / W | no difference |
| elephant m1 LOD | W / W | smooth (slight) | W / W | no difference |

‡ The cell with the judgement gap (see below).

**What the table shows:**
- **Primary success, per peer: yes for both.** Each peer rated smooth convincing and preferred it in both seahorse m4 cells.
- **No regressions:** neither peer rated smooth lower than flat in any cell, or preferred flat in any cell.
- **Seahorse:** both peers preferred smooth in 6/6 cells. The rating rose in 6/6 cells for Claude and 5/6 for Codex (m16 ref was C/C).
- **Elephant:** the normal change did not raise either peer's m4 or m1 cell ratings above weakly convincing. Both reported weak shape cues on a broad, uniform slope. This does not rule out benefits from other shading or lighting changes.
  - At m16 the peers disagree on the absolute smooth rating: Claude rated it convincing, Codex weakly convincing.

### The judgement gap (why the outcome is invalid/incomplete)
- **What I did:** Claude rated seahorse LOD m1 poses 299 and 599 from a pixel comparison with the corresponding reference images, without viewing them separately. This was disclosed in the committed judgement.
- **Pose 599** is pixel-identical, so transferring the rating is defensible.
- **Pose 299** differs: 1,439 (X) and 1,534 (Y) pixels along the skyline.
- **Why this decides the outcome:** the card has no substitution rule, and a post-unblinding viewing cannot complete a pre-unblinding step.

**Scope of the gap:**
- One pose of one cell, out of 12 cells per peer.
- The primary cells were fully observed by both peers.
- In the affected cell, directly viewed pose 269 fixes flat at N, the lowest category, so smooth cannot receive a lower cell rating than flat. However, both the smooth cell's exact rating and its paired preference depend partly on the unviewed pose 299. Claude directly viewed two of the four poses (269 and 644), transferred pose 599's rating from pixel-identical images, and inferred pose 299's rating from nonidentical images.
- A post-unblinding supplemental viewing of pose 299 matched the inferred rating (flat N, smooth C). It is recorded as supplemental only.

## Limits
- **Weak masking:**
  - The condition was inferable from appearance; both peers inferred Y = smooth before unblinding.
  - Both peers had implementation knowledge, and Claude had prior exposure to the frozen flat stills.
  - The key happened to be all-Y, a 1/16 outcome.
  - The masking concealed labels only.
- **Not isolated:** lighting is not separated from slope darkening; both use the normal.
- **Motion untested:** sampled frames of the smooth LOD video show no visible seam, but shimmer and popping were not judged.
- **Detail not reopened:** the closed detail result (criterion 1) stands. Smoothing removes faceting; it adds no relief. Coarse smooth stills look clean but carry only coarse relief.
- **Representation unchanged:** no change to the field, transfer, LOD or navigation.

## What comes next
- **Candidate default:** B (smooth area-weighted vertex normals) becomes a **candidate rendering default**, adopted explicitly in the next representation card.
  - It rests on the clean primary finding, with the m1 LOD gap and the weak masking carried as recorded limits.
  - The original pre-unblinding gap cannot be repaired retrospectively. The supplemental viewing remains separate. Any further study needs a prospective protocol and complete observations; condition recognition remains a masking limitation.
- **Before adopting it in the product:**
  - check motion (temporal shimmer at LOD transitions);
  - check cost (normal recomputation on chunk changes during live navigation).
- **Elephant at m4 and m1:** shape legibility remains unresolved after this normal change. Representation/detail and lighting design remain successor hypotheses; this comparison does not choose between them.
- **Process lesson:** every required pose must be viewed individually before unblinding, even when the images are near-identical. Future cards should either state a substitution rule or forbid one.
