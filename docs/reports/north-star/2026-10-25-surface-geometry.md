# Surface geometry on TA walls: assessment and screening experiment (closed 2026-10-25)

Evidence: `/mnt/ml_storage/scratch/valley-spike/surface/` (card r2, frame, gate, gate2, c1, measure, clock) and `/mnt/ml_storage/scratch/valley-spike/descent/` (descent card r2). Reasoning trail: `docs/codesign/project1-log.md`.

**Advisor question.** Why do TA's canyon walls look like smooth drapes? Can fractal mathematics put real geometry on cliff faces (displacement, implicit F = 0, or a hybrid) while keeping TA's landscape, one fixed world, and detail revealed by finer evaluation?

## Answer in brief
- **Cause.** The field, not the heightfield and not the transfer. The two peers reached this independently.
- **Experiment.** Neither frozen candidate put formations on the wall face.
  - C1, a surface-relative pattern, failed the relief criterion by 5–18×.
  - C2, a Julibrot-slice layer, failed to align with TA's walls for any scanned κ.
- **Not tested.** Overhangs and passages, which do need more than a heightfield.

## 1. Cause (established locally on seahorse; both peers)
- **Field.** A wall's cross-section at each height is a contour of D. Our measurement over 11 nested levels (m = 8 → 1/4) found:
  - Relief at your size ≈ e/D once D > e, the same at every scale.
  - Contour curvature ≈ 0.4/D.
  - A wall point at depth d (D = d/2.16) is therefore smooth relative to you, and gets *smoother* as you shrink.
  - Codex's fresh evaluation agrees: detrended RMS/r falls linearly with r.
  - **Reasoning:** the escape-time field is real-analytic off M, so a point at distance D has no structure much finer than D.
  - **Limit:** D is an estimate, not an exact distance, and we have not shown that every wall is smooth.
- **Transfer.** A monotone T only relabels contours, so it cannot add shape along them. TA, being affine, preserves D exactly.
- **Heightfield topology.** Not needed to explain the smoothness. A heightfield *can* carry ribs and recesses on steep faces. It cannot carry undercuts, ledges with rock above, or passages.

## 2. Candidates (one per peer, frozen before evaluation; card r2 after one review)
**Test setup.** One mid-wall tile on the seahorse descent route:
- size 10 m, slope 37°, D from 7.5 to 12.5 m;
- displacement bound B = 1.7 m, with a taper excluded from scoring;
- fresh evaluation at two resolutions, with maxit doubled for the finer one;
- success threshold: relief at your size ≥ 0.1 at m = 1 and m = 1/4.

| | Relief at your size, m = 1 | m = 1/4 | Refinement | Envelope | Result |
|---|---|---|---|---|---|
| C0 TA (control) | 0.016 | 0.0041 | ok | n/a | n/a |
| C1 Codex: frozen pattern d = (B/2)·w·tanh((D(c₄+(u,v)) − Π)/3.4) in fixed wall coordinates | 0.022 | 0.0057 | ok | max 0.83 m ≤ B/2 | **FAIL** (relief 5× short at m = 1, 18× at m = 1/4) |
| C2 Claude: rock at height y = the Julibrot slice M_{κ(y_rim − y)} (orbit starts at √t) | n/a | n/a | n/a | n/a | **FAIL at the alignment gate** |

C2 detail, after one bounded fitting repair:
- The slice boundary's position is non-monotone in t.
- Over 48 values of t, none places the mid-height boundary within B of the TA contour (best: 2.26 m).
- The boundary leaves the 30 m window entirely for 21 of the 48 values.

**Verification by Codex:**
- reproduced the C2 minima and the robustness to finer grids;
- matched C1 to its specification to 2×10⁻¹³ m;
- recomputed relief with fully area-weighted fits (0.0217 / 0.0057).

**Limits:**
- Refinement is a parameter-matched check against bilinear surfaces.
- Detection used D_t < 0.2 m, where the card specified ρ = 0.1 m.
- C2's result covers the scanned t grid and a linear κ only.
- **No stills were rendered, so appearance is unjudged.**

## 3. What this establishes, supports and leaves open
- **Established:** the smooth walls come from the field (locally); this C1 pattern supplies too little relief; this C2 construction does not follow TA with a linear κ on the scanned grid.
- **Supported:** a pattern sampled from M's exterior field far from the boundary carries the same smoothness (C1 inherited it). At your size, relief appears where you are within about e of the boundary (0.26 at D/e ≤ 1, at every scale).
- **Unresolved:**
  - a construction anchored on the boundary (formations wherever a fractal boundary actually is);
  - a standalone 3D Mandelbrot world (Julibrot slices) that gives up TA's large structure;
  - passages and undercuts;
  - the experience in motion.

## 4. Descent card (closed, partial)
- **Built and verified:** watertight nested patches, live p95 22–24 ms, and the independent checker passing for T0, TA and TP.
- **Advisor's flight:** detail stays on the upper terrain and walls read as smooth drapes. That prompted this assessment.
- The peers' still judgements disagreed (TA vs TP). The advisor's flight superseded them.

## Process accounting
- Descent: about 2 h. Surface: about 1 h 20 of a 4 h cap.
- **Worth it:**
  - independent positions (both found the cause; their candidates differed usefully);
  - the single card review (it caught C2's ill-defined construction and an unfair extra C1 stage);
  - the gate-first ordering (C2 stopped after minutes of 2D evaluation, before any voxel or render work);
  - Codex's verification (it caught a bad κ fit and turned an overclaim into a proper repair).
- **Not worth it / to change:** my C2 spec error (y_top) cost one revision. Probe numbers should be labelled with what they measure (median |ΔD|, not boundary shift).
