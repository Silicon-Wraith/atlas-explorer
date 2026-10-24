# Scale sweep: field, transfer and observer scale

## Header

| | |
|---|---|
| **Origin** | The advisor's direction of 2026-10-24: examine field scale, height transfer, observer scale, normalised relief and spatial slope; distinguish true refinement from reinterpretation; determine the necessary properties. |
| **Positions** | Independent: Claude (hash-committed, `scale/position-claude.md`) and Codex (run 20261024T225816Z-4f0b). One debate round (20261024T230056Z-8a44) converged (`scale/convergence.md`). |
| **Card** | `card-scale.md` r2 (SHA-256 33b34335…); Codex review 20261024T230421Z-03c9 (NOT READY; replacements 1–6 applied, numbers reproduced) |
| **Independent check** | Codex 20261024T231219Z-06a6 re-derived the classes and numbers from `sweep.json`. Its corrections are adopted throughout this report. |
| **Evidence** | `/mnt/ml_storage/scratch/valley-spike/scale/` (`sweep.py`, `controls.json`, `sweep.json`, `sweep.log`, `clock.md`) |
| **Time** | READY 23:09:51Z, sweep complete 23:11Z, check 23:16Z, against a 4 h cap |

## What the analysis established (the advisor's question)
- **The field is degree-1 homogeneous only under a similarity of the field.** Write H_e(u) = [h(x_e + e·u) − h(x_e)]/e in observer units. Then:
  - an **affine** transfer preserves normalised geometry exactly when the normalised field patches correspond;
  - a **pure logarithmic** transfer preserves absolute height differences, so normalised relief and slope grow as 1/e as the observer shrinks (the advisor's point);
  - **every smooth fixed transfer is affine at distances well below its smallest characteristic length.** T1 has a log-like band and is affine below D ≈ 1.7, with a gain of about 11.6.
- **Shrinking in place at a differentiable point is asymptotically planar** (R_e = O(e)). New detail requires following finer boundary structure.
- **True refinement versus reinterpretation:**
  - Geometry must be a fixed function of position, with evaluation converging to one surface. Observer scale e, chart scale s and evaluation tolerance ε are kept separate.
  - Geometry that depends on the observer, such as h_e = e·F(D/e), is a different world at each scale, however smooth the morph.
- **Discrete scale covariance with contrast** is possible for a fixed transfer only in the log-periodic-linear class, T = b − D·P(log₂(D/D*)) with P periodic. Affine is the degenerate case.
  - This is a candidate, not a demonstrated necessity: affine terrain is not formation-free (direction, curvature, branching and creases still vary).

## Formally established (development fixtures, frozen sequences)
- **Controls passed first** (`controls.json`):
  - three-ray scaling: TA preserves normalised heights and statistics at every scale, and the unsaturated diagnostic T_U does so at octave pairs;
  - TP identity error 1.5e-14;
  - straight boundary: TA relief 1.4e-14, **TP relief 0.263e from an affine field**. This proves the mechanism by which a transfer creates relief.
- **Field classes** (τ = 0.02/a ≈ 0.00926 for ρ_D): **all 44 cells are "supported field signal"**, including both FP sequences. The categorical rule therefore does not separate following the boundary from shrinking in place.

  | Sequence | Fine ρ_D range | Sub-m1 supported |
  |---|---:|---:|
  | Seahorse FP | 0.154–0.328 | 4/4 |
  | Seahorse BF | 0.289–0.481 | 4/4 |
  | Elephant FP | 0.027–0.403 | 4/4 |
  | Elephant BF | 0.343–0.447 | 4/4 |

  - **BF:** maximum field sampling discrepancy 0.00314e (≤ 0.91% of fine field relief).
    - Subsequent centres have D/e in 0.990–1.008. The initial centres sat at 0.21 and 0.39, outside the band, and were retained as frozen.
    - No termination, and no unresolved samples.
- **Transfers on BF** (coarse grid, both fixtures):

  | Transfer | Relief/e | Area > 45° | Area < 15° | Height-sampling pass |
  |---|---:|---:|---:|---:|
  | T0 | 0.202–0.336 | 0–6.9% | 10.4–40.7% | 22/22 |
  | TA | 0.623–1.037 | 50.9–88.5% | 3.4–13.1% | 22/22 |
  | TP | 0.292–0.521 | 17.0–51.6% | 20.8–45.2% | 22/22 |
  | T1 | descriptive only | | | **0/22** |

  - **TA:** R_A/e = a·ρ_D exactly.
  - **T0:** 0.315–0.324 times TA's relief (predicted ≈ 0.324).
  - **T1** fails only the absolute 0.02e allowance (BF discrepancies 0.022–0.036e). Its rise from about 1 to about 4 relief/e as e falls is consistent with the predicted amplification, but it supports no resolved-detail claim at e/16.
- **Numerical accuracy:** all 44 higher-precision rechecks pass, with a maximum height difference of 2.2e-9·e.

## Supported partial findings
- **Following the boundary inward**, the fixed field keeps sampled, above-threshold nonplanarity down to m = 1/4 on both development fixtures. This is a candidate interval for inspection.
- **Elephant FP** declines from about 0.40 to 0.027 over the smaller scales (not strictly monotonically), consistent with approach to a locally planar regime. That does not prove smoothness.
- **Seahorse FP** stays above threshold throughout; its centre is exterior (D ≈ 2.82). There is no claim about nonsmoothness.
- **Fixed-frame patch agreement varies substantially** (BF RMS 0.28–1.03 for seahorse, 0.20–0.50 for elephant). It neither establishes nor rejects statistical self-similarity under other registrations.
- **TP** shows both steep and low-slope triangle populations throughout BF, which makes it a candidate for inspection. It is not yet shown to give usable floors or a better experience.
  - **T0** also keeps low-slope area at every BF scale, but with very little steep area.
  - On elephant FP, TP's relief persists (0.24–0.49) while field relief falls. That supports a material effect from the nonlinear interpretation, but the measurement does not split it into field and transfer parts.

## Unresolved, and limits of this evidence
- **Witnesses:** they checked repeatability within one run only. They were not shared across scales, and their seeds were process-dependent and not retained.
- **Precision samples:** these were drawn from the disc's bounding square, so some lie outside the disc (for example 52 inside and 12 outside for seahorse FP m4).
- **Slopes:** the sampling gate checks heights, not slope distributions. "Cliff" and "floor" would need connectivity, extent and access, none of which was measured.
- **T1** needs finer spatial evaluation before any positive claim.
- **Reachability:** near-terrain reachability of the BF routes is untested. So are recordings, motion and the advisor's judgement.

## Next
- The candidate interval and TP's slope mix justify a **descent recording**: a collision-checked shrink-and-approach-return flight along a frozen BF route, rendered from fresh evaluation at each scale, for the advisor to judge.
  - This requires a multi-resolution renderer of nested patches around the observer, which today's single-resolution viewer is not.
  - It belongs in the resumed explore card, now re-scoped toward descent rather than area.
- **Conditions to compare:** T0, TA and TP on the same frozen routes. Attribution stays explicit: field nonplanarity versus interpretation effects.
- **Development fixtures only:** a generalisation claim needs a new pool fixture.

## Process accounting
- **Time:** positions, debate and card took about 1.5 h with two Codex reviews. Compute took about 90 s. The independent check took about 4 minutes.
- **Worth it:**
  - Independent positions, which agreed on the core and corrected each other's overclaims (Claude's in particular).
  - Codex's card review: a contradictory TA formula, an impossible TP control and an overclaimed decision rule, all fixed before compute.
  - Analytic controls first.
  - The independent re-derivation, which corrected six numeric or interpretive statements.
- **Lesson:**
  - The screening threshold τ was too low to discriminate FP from BF: every cell passed.
  - A future decision rule should be calibrated against a known-smooth control, not only against a numeric floor.
