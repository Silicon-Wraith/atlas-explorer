# Step 0 fixture pool and Step 1 interpretation screen: closure

## Header

| | |
|---|---|
| **Plan** | Steps 0 and 1 of `2026-10-24-next-direction-proposal.md` (advisor-approved, PR #11) |
| **Cards** | `card-pool.md` r2 (SHA-256 191a50d3…), `card-screen.md` r2 (SHA-256 889c299f…) |
| **Owner / challenger** | Claude / Codex |
| **Process** | protocol item 7: one card review each, with independent still judgements written before exchange (Claude's hashed f01bc7db… before sending) |
| **Codex runs** | 20261024T184910Z-5659 (pool card), 20261024T200022Z-10e5 (screen card), 20261024T203749Z-01a3 (still judgements) |
| **Evidence** | `/mnt/ml_storage/scratch/valley-spike/pool/` and `/mnt/ml_storage/scratch/valley-spike/screen1/` |

## Summary
- **Step 0:** a partial pool. One fixture of ten qualified (k2, main-cardioid). It is reserved as the Step 2 holdout; only its numbers have been inspected.
- **Step 1:** no candidate is eligible, so passage development stops under the frozen rule.
  - The Step 2 baseline (the T1 canyon flight and ascent) proceeds as planned (plan adjustment 2).
  - The screen does not reject these interpretation families generally; it rejects or leaves unresolved the specific frozen rules.

## Formally established (within scope)
- **Pool:** 10 constructions screened in 99.7 of 100 compute minutes. Cleanup was confirmed: 6 timeouts, each killing its process group, with no survivors.
  - Qualified: **k2 only**. Failures, by first failing check:

    | Check | Constructions |
    |---|---|
    | 1, boundary not certified | k3 |
    | 2, level-0 classification timeout (420 s) | k1, k5, k7, k9 (every bulb-2 construction except k3) |
    | 3, reference-build timeout (900 s) | k4, k6 |
    | 4 incomplete (one of three discs had unresolved support) | k0, k8 |

  - Every measured stability disc passed by a wide margin (T1 E/R ≤ 0.018, limit 0.10).
- **Screen numerics.**
  - **Representation and passage criteria:** voxel occupancy at 0.4 spacing, with a conservative body-clearance test (flight sphere ρ = 0.5e at m4). Passages are judged by Codex's two-mouth criterion, plus an owner-added opposite-exit criterion for free-standing bridges. Synthetic tunnel, bridge and recess cases behave as intended.
  - **Passages per fixture** (seahorse / elephant) at the frozen selections:

    | Candidate | Selected rule | Passages | Refinement at half spacing |
    |---|---|---|---|
    | E (extruded level set) | yn 100, a 10 | 3 / 1 | persists on both |
    | P (residual-band passage) | τ 1.7, d 6.8 | 1 / 0 | persists on seahorse |
    | S (3D parameter slice) | s 0.2, t 1 | 0 / 0 | not reached |

    For P and S, no grid setting produced an elephant passage.
  - **Smoothing control** (E/P; D replaced by its σ = 2e smoothing):
    - E: passages 1 / 2, solid IoU 0.94 / 0.96.
    - P: passages 0 / 0.
    - So for E, passage existence survives suppression of the fine field structure. The authored band is doing much of the work.
- **The selected E is degenerate.** At yn = 100 the band threshold (110.2 + a) exceeds T1's maximum of 120, so the notch band holds no solid. The fluted summits float above a uniform horizontal slot. The frozen numeric selection did not exclude degenerate grid points.

## Supported partial findings
- **Stills** (scratch CPU ray-marcher; the label-swap check was byte-identical). The peers' judgements, made independently, agree in substance:
  - **E at seahorse:**
    - Both peers see an unmistakable ceiling, open space beneath it and sky beyond. The fluted T1 cliffs remain recognisable in the cap.
    - Both rate the promise **weak**: it reads as a sliced, suspended formation, not an opening discovered within a cliff.
  - **P at seahorse:** a shadowed recess at the cliff base, but no legible roof-entrance-exit. Claude rated it *not*, Codex *weak*.
  - **S at elephant:**
    - Large nested curved sheets with undersides float above a ribbed ramp. They are genuinely three-dimensional and spatially interesting.
    - No legible passage, and no T1 character. Both rated the promise weak for the canyon-adjacent experience.
- **Eligibility:**
  - E is **unestablished**, not negative. Its geometry qualifies numerically on both fixtures, but cliff recognition on elephant could not be judged (see below).
  - P is ineligible (no elephant passage).
  - S is ineligible, with numerical readiness **unresolved**: the finite-difference gradient check disagreed at one seahorse point at s = 0.2 (relative error 64), and the cause is not established.

## Unresolved questions
- **Elephant views.** The frozen V1 rule placed the eye 1e above a slope rising toward the target, so R, E and P all fill the frame with near-field ground. Most V2 entrance views were unavailable: the derived eye lay outside the window or inside terrain, even after the repair search.
  - Visual comparison is therefore missing for elephant and for most entrance views.
  - Invalid poses do not prove that no flight approach exists.
- **Non-degenerate E.** Whether a notch band that keeps solid (yn + 1.5e + a < 120) gives undercuts and arches integrated with the cliffs, rather than floating caps. That would be a new rule, not part of this screen.
- **S's layered sheets.** They may merit their own card as a different kind of place, but they are not a route to the T1-referenced flight. The FD discrepancy needs explaining first.
- **The bulb-2 generator** contributed nothing because level-0 classification is too slow there. Any future pool needs a faster classifier.

## North Star reading
- **Toward the North Star:** Scenario A's first convincing flight is now unblocked. Step 2's baseline canyon flight has a qualified, unviewed holdout (k2), and its scope is now clear.
- **Not toward it:** none of the screened passage rules is yet "somewhere worth entering". Spending Step 2's day on a passage would be premature.
- **Sets up:** a well-defined next passage experiment (a non-degenerate E, or S as its own world), and a reusable checker for the geometry of passages and overhead surfaces.

## Process accounting
- **Time:**
  - Pool: about 50 minutes of implementation and review, plus 100 minutes of unattended compute.
  - Screen: about 40 minutes from READY to judgements (cap 3 h), including roughly 2 minutes of S compute.
- **Repairs and deviations:**
  - **Footprint measure:** the synthetic checks found that the footprint was measured on accessible centres, not on the body. Fixed before any fixture grid ran.
  - **Repair 1:** an outcome-independent pose search, before any still was rendered.
  - **Repair 2:** untrimmed window coordinates crashed S on elephant. This **exceeds the card's one-repair cap** and is a recorded deviation. E/P evidence is unaffected; the S evidence comes from the repaired run.
- **Worth it:**
  - Codex's card review: the passage-mouth ambiguity, conservative clearance, the refinement gate and the S control were all real.
  - The synthetic sanity cases.
  - Independent judgements, which converged without anchoring.
  - Treating unknown space as blocked.
- **Not worth it / lessons:**
  - The pose rules were the weak instrument. A fixed lateral pose and a mouth-relative eye, frozen without a geometric preview, produced mostly unusable or unavailable views.
  - Future screens should derive poses by searching for clear sight lines, frozen as a rule.
  - The numeric selection should exclude degenerate parameter settings in advance.
