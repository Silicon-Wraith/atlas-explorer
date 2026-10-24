# Transfer-gain card: does lower near-boundary gain keep T1's m4 formations without its m1 walls?

## Header

| | |
|---|---|
| **Initiative** | card `card-gain.md` revision 2 (SHA-256 e9718f92…), the successor recommended in the field atlas (PR #10) |
| **Owner / challenger** | Claude / Codex |
| **Process** | protocol item 7: one card review (Codex fixes 1, 3 and 4 applied verbatim; fix 2 replaced by an owner choice of uniform palette), a checkpoint, and an early CPU-only close agreed with Codex |
| **Date** | 2026-10-24. Clock started 17:50:05Z; closed at about 18:05Z, roughly 25 minutes of the 3 h cap |
| **Evidence root** | `/mnt/ml_storage/scratch/valley-spike/gain/` (`measures/`, `screen/`, freeze files, `gain-measures.py`) |

## Headline (Codex's wording, adopted)
> In the two development fixtures, neither tested lower-gain transfer met all required inspection poses. T3 increased required m1 relief from 0.21–0.24 e to 0.51–0.54 e, but 79–92% of the inspection discs remained steeper than 45°, and the required views exceeded the pitch limit. This identifies a limitation of these transfers under the frozen inspection policy; it does not establish a general relief ceiling for monotone DE fields.

**Outcome under the card:** neither T2 nor T3 is recommended. There is no new perceptual judgement, no qualifying T0 claim and no holdout generalisation.

## Tested
- **Transfers:** h_ℓ(D) = 120[1 − tanh(k_ℓ·log(1 + D/ℓ))], with k_ℓ = 0.7/log(1 + 120/ℓ):

  | Transfer | ℓ (world units) | max \|dT/dD\| |
  |---|---|---|
  | T1 | 1.7 | 11.57 |
  | T2 | 6.8 | 4.22 |
  | T3 | 27.2 | 1.83 |
  | T0 (reference) | — | 0.7 |

- **Required conditions:** seahorse original target at m4 and m1, and elephant proximity targets at m4 and m1.
- **Diagnostic conditions:** elephant original targets.

## Formally established (development fixtures, frozen policy)
- **Holdout:** the six declared attempts are exhausted under their certification and time limits.
  - k0–k3 and k5: c_out escape was not certified.
  - k4: certified bracket, but it exceeded the 180-second preflight budget during level-0 classification.
  - This is procedural. It does not establish that the reference is irresolvable, nor that a longer budget would succeed.
  - **Design error (Claude):** the field card had measured about 246 s for that step, and the budget was set below it.
- **Readiness:** all 24 condition × transfer cells pass the declared RMS/relief ≤ 0.10 criterion. The maximum measured ratio is about 0.0392, comparing level-5 direct evaluation with the level-4 interpolant.
- **Accessibility under the pose rule** (|eye − T| = 2e, |pitch| ≤ 45°, distance ≤ 3e, clear sightline). The implementation's sign-change root scan is not generally exhaustive, but Codex independently enumerated triangle crossings along all 24 rays and reproduced exactly one root per cell.

  | Required cell | T0 | T1 | T2 | T3 |
  |---|---|---|---|---|
  | m4 (both fixtures) | accessible | inaccessible | inaccessible | accessible |
  | m1 (both fixtures) | accessible | inaccessible | inaccessible | inaccessible (A view pitch 47.05° and 47.98°) |

- **Relief and spatial slope** (target-centred 3e disc; area fractions are estimates from the implemented quadrature):

  | Required cells | Relief (e), m4 | Relief (e), m1 | Area > 45°, m4 | Area > 45°, m1 |
  |---|---|---|---|---|
  | T0 | 0.21–0.28 | 0.21–0.24 | 0–0.14% | ≤ 0.5% |
  | T3 | 0.45–0.50 | 0.51–0.54 | 39–78% | 79–92% |
  | T2 | 0.74–0.75 | 0.94–1.00 | 53–82% | 89–94% |
  | T1 | 1.08–1.13 | 1.61–1.98 | 57–74% | 94–97% |

  - T0's required-cell slope medians are about 0.364, 0.651, 0.724 and 0.748.
  - Lower maximum gain does not monotonically reduce every slope statistic. For example, elephant proximity m4's fraction above 45° is about 73.8%, 82.0% and 77.5% for T1, T2 and T3.

## Supported partial findings
- **Distance-like gradient:** in the inspection discs, |∇D| has a median of 0.93–1.08, except seahorse m4 at 0.505. The distance estimate behaves approximately like a distance there, which helps explain why spatial slopes track transfer gain.
- **The trade-off within this family:** raising gain raises relief, and it pushes most of the near-boundary inspection area past 45° at m1.

## Unresolved (with the mathematical statement narrowed by Codex)
> For a differentiable field, |∇h| = |T′(D)|·|∇D|. The measured gradient distributions help explain the observed slopes, but their medians do not provide pointwise bounds. A spatial slope ≤ 1 requires |T′(D)|·|∇D| ≤ 1 locally. A 1-Lipschitz transfer bounds height differences by differences in D; this does not establish a ceiling on our plane-detrended RMS relief. Strictly monotone transfers preserve level sets, while changing their vertical spacing and potentially their detrended relief. Whether another monotone transfer can provide substantially more nearby relief at acceptable slopes remains unresolved.

- **T0's level is not a ceiling:** T0's 0.2–0.3 e is not a derived ceiling. Even an affine D can gain plane-detrended relief through a nonlinear, monotone, 1-Lipschitz transfer.
- **Walkability:** ≤ 45° surface slope is a geometric proxy. Camera accessibility and practical walkability are separate questions.
- **Not tested:**
  - **Perceptual judgement:** none of the accessible m4 views (T0 and T3) were judged. Stills were skipped by agreement, which narrows the claim.
  - **Palette:** the uniform-palette control is **untested**. A future check should hold geometry, camera, normals and lighting fixed while varying the transfer label, and require identical output.
- **Open beyond this card:** generalisation (no holdout), and fields whose structure is not a monotone function of D.

## For the advisor's direction decision
- **What the two cards found:** the development fixtures contain near-boundary structure that both peers recognised as cliff formations under T1 at m4. In this card, T1, T2 and T3 failed the required m1 inspection poses. T2 and T3 reduced relief relative to T1 without meeting the complete development criterion.
- **What that establishes:** a limitation of the tested transfers at the frozen targets under the inspection policy. It does not establish that one cannot stand near these formations, that practical navigation fails, or that simple monotone DE transfers generally are a weak lever.
- **Still open:**
  - further monotone transfer designs;
  - other inspection policies;
  - non-monotone structures;
  - different fields;
  - an experience centred on m4 cliff formations.

  This card does not choose among them.

## Process accounting
- **Time:** about 25 minutes of active work against a 3 h cap.
  - Holdout constructions and preflight took about 6 minutes.
  - CPU measures took under 1 minute of compute.
  - The checkpoint and report took the rest.
- **Worth it:**
  - **The 3D pose rule:** it turned the field card's ambiguous m1 views into a clear, checkable accessibility result.
  - **Codex's narrowing of the mathematical claim:** it stopped an over-strong ceiling argument.
  - **The early CPU-only close:** the verdict was already fixed, which saved about 30 minutes of rendering and judgement.
- **Cost of a design error:** the preflight budget was set below a step time that was already measured. The holdout was lost again; the next holdout attempt should size budgets from measured step times.
