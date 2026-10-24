# Field card: what survives the mapping from Mandelbrot dynamics to terrain

## Header

| | |
|---|---|
| **Initiative** | card `card-field.md` revision 2 (SHA-256 3c5abccd…), directed by the advisor ("one more card aimed at the field itself before I commit to project direction") |
| **Owner / challenger** | Claude / Codex |
| **Origin** | independent positions committed by hash before exchange: Claude 447d990f…, Codex b11e8ec8… |
| **Process** | protocol item 7 as amended (proportional): one card review, a 60-minute checkpoint, no masking, independent view judgements written before exchange |
| **Date** | 2026-10-24. Clock started 16:44:34Z; closed at about 17:40Z, roughly 55 minutes of the 4 h cap |
| **Evidence root** | `/mnt/ml_storage/scratch/valley-spike/field/` (`atlas/`, `screen/`, `runs/stills-20261024T172726Z/`, the freeze files, both judgements) |

## Summary
- **In plain terms:** on the sampled development domains, measured relief varies systematically with D/e, where D is the implemented exterior distance estimate and e is eye height. Its magnitude also depends on the height transfer.
- **The log-type transfer (T1):** both peers recognise fluted buttresses and recesses at m4. At m1, steep walls dominate the frozen views; formations within 3e are not jointly established.
- **Placement under T0:** the proximity targets produce modest visual changes. The peers disagree about formation presence, while both rate the elephant proximity views weakly convincing.
- **The tested escape-potential transfer (TG):** resolution stability was not established within this card's budget. This does not establish a limitation of escape-potential terrain generally.
- **Holdout:** none of the declared constructions passed feasibility, so every finding is limited to the two development fixtures.

## Formally established (within this card's scope)
- **Holdout list exhausted.** k1 and k2 failed escape certification: the interval enclosure grew too wide at iterations 763 and 691. k0 had a certified bracket and a landmark but 97 unresolved reference samples (3 in the corridor). k3 had a certified bracket and a landmark but exceeded the 15-minute build budget. There are no holdout results.
- **Escape potential evaluator.** It is stable to escape radius on sampled points: the relative change between R = 1e6 and R = 1e12 is ≤ 5.7e-14 on 1,936-point subsamples. This is sampled radius stability at the same arithmetic precision, not full-field or iteration convergence.
  - **Exclusion:** one certified-escaping seahorse sample has no finite potential evaluation. It made the declared linear G/D calibration return NaN, and it removes 13 m1 relief measurements. Among the finite samples, the median G/D is about 4.77e-25.
  - **The switch:** the linear calibration's failure is preserved. Before any paired comparison, a bounded transfer on ν = −log₂ G (the continuous escape count) was chosen as a prospective transfer choice. The linear form was not experimentally refuted.
- **Collapse test** (bins and tolerance declared before binning):
  - T0: inconclusive, 6/9 bins agree;
  - T1: rejected, 3/9;
  - escape-count transfer (TG): rejected, 1/9.
  - No m = 16 group qualified, because each fixture has only 16 centres.
- **Resolution.**
  - TG relief differs from a level-3 interpolant by 30–49% of its size (median), so its stability at reference sampling is not established within this card's budget. TG is stopped here. This is **not** a rejection of terrain built on the escape potential.
  - T0 and T1 pass the frozen readiness check at every viewing neighbourhood: level-5 direct evaluation against the level-4 triangle interpolant gives an RMS of ≤ 4% of the local relief (limit 10%). Level-3 vs level-4 differences alone do not certify convergence.
- **Placement fractions** (sampled relief centres inside the frozen parent, with D/e < 4; these are different centre sets per scale, not area measures):

  | | m16 | m4 | m1 |
  |---|---|---|---|
  | Seahorse | 100% | 92.2% | 69.5% |
  | Elephant | 100% | 59.1% | 32.2% |

## Supported partial findings
- **Relief and distance.** Relief varies systematically with D/e (distance estimate over eye height), and its magnitude depends on the transfer. The declared collapse test is inconclusive for T0.
  - Within each fixture, T0's m4 and m1 values are close in most bins, but not in all (elephant [16, 32): 0.034 e vs 0.012 e).
  - Relief generally declines as D/e grows, but there is no universal cut-off. For example, seahorse T0 falls about 2× from [2, 4) to [4, 8).
  - T1 also raises relief at larger D/e (for example elephant m1 [4, 8): 0.053 e → 0.344 e).
- **Transfer at m4.** At matched targets, both peers independently saw formations under T1 at m = 4, in elephant (proximity target) and in seahorse (original target): fluted buttresses, ribs and recesses whose overlap changes between the lateral views. Codex rated both convincing. Claude rated elephant convincing and seahorse weakly convincing, because of comb-tooth vertical walls at the image edges.
- **Transfer at m1.** Both peers described predominantly steep walls under T1. Claude recorded formations present in both fixtures; Codex recorded unclear, because the overhead features did not establish formations within 3e. The frozen views pitch upward 68–75°, with look-at targets 6.0–8.2e away in 3D. Nearby formations are therefore not jointly established. These views demonstrate steepness and a limitation of the inspection geometry; they do not establish that T1 lacks nearby formations under other poses.
- **Placement under T0 (elephant).** Moving to a near-boundary target (D/e < 1) raised local relief at m1 from 0.057 e to 0.237 e and added rounder shoulders and saddles. Codex saw limited formations at both levels; Claude saw curvature but nothing clearly inspectable. Both rated these views weakly convincing. This supports a placement contribution at these targets, not placement as the main explanation.
- **Peer disagreements, recorded without resolution:**
  - **Seahorse T0 at its original target:** Codex recorded formations present and rated the terrain convincing at both levels. Claude recorded formation presence unclear at m4 and absent at m1, rating both weakly convincing.
  - Elephant T0 at its original m4 target: Codex saw a limited formation, Claude none.

## Unresolved questions
- **Generalisation:** whether any of this holds beyond seahorse and elephant (there is no holdout).
- **Transfer steepness and inspection:** whether reducing near-boundary transfer gain, while preserving useful relief redistribution, improves close inspection at m1. The transfer derivative with respect to D must be distinguished from spatial terrain slope (∇h = T′(D)∇D): T1 already has |T1′(D)| ≤ 120k/ℓ ≈ 11.57, against 0.7 for T0. The actual 3D inspection distance must also be verified.
- **Escape potential:** whether it, at higher resolution or with a different bounded transfer, gives stable terrain.
- **Other fields:** interior-varying fields (the plateaux are negligible in these fixtures: 0.0094% and 0.0002% of reference samples), angular fields, other fractal families.
- **Rendering confound:** the terrain palette is keyed to height, so T1 also darkens the colours. That is a rendering confound, not field evidence.
- **Live behaviour:** LOD, motion, navigation and performance for any non-T0 transfer.

## Recommendation (the next uncertainty)
- **For the advisor's direction decision:** these development fixtures contain structure that T1 presents as recognisable cliff formations at m4. Nearby formations at m1 are not jointly established, and no holdout passed. The evidence supports further investigation of the Mandelbrot heightfield direction without establishing its general suitability.
- **Next card:** test a transfer with explicitly lower near-boundary gain against T1.
  - Separate transfer effects from inspection-pose effects, and verify the required 3D proximity.
  - If a spatial slope limit is intended, define and measure that limit rather than treating a transfer-derivative bound as sufficient.
- **Holdout preparation:** keep the certified-bracket guarantee, and investigate reference feasibility with a bounded preflight.
  - More certification effort or a different box placement are candidate remedies, not demonstrated fixes.
  - An exterior corridor alone does not satisfy a zero-unresolved requirement over the full reference box, and unresolved samples must not be assumed interior.

## Process accounting
- **Time:** about 55 minutes of active work against a 4 h cap.
  - Holdout screening took about 25 minutes, mostly reference builds.
  - CPU analysis took about 15 minutes.
  - Stills (capture and judgement) took about 15 minutes.
- **Repairs:** one mechanical repair, the witnesses file missing from the viewer data (failed run preserved), within the two allowed.
- **Worth it:**
  - The declared collapse bins: they stopped a too-strong reading.
  - Codex's checkpoint corrections. The parent mask reversed an elephant placement claim; the NaN cause and the bound on the radius-convergence claim were also corrected.
  - The frozen readiness check before viewing.
  - Independent view judgements, which found the m1 wall geometry.
- **Not worth it:** none was identified as clearly excess. Dropping masking and hash commits for this exploratory card cost nothing visible.
- **Deviation:** Claude fast-forwarded main during Codex's position consult (a guard violation). It is recorded in the log; the position text was unaffected.
