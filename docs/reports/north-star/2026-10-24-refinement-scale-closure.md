# Refining one world across observer scale: closure report

## Header

| | |
|---|---|
| **Initiative** | card `card-refinement-scale.md` revision 2.1 (SHA-256 3fa0dde6d54ea649…) |
| **Owner / challenger** | Claude / Codex |
| **Date** | 2026-10-24. Clock started 01:23:39Z; closed at about 05:15Z, roughly 3h50m of the 16 h cap |
| **Evidence root** | `/mnt/ml_storage/scratch/valley-spike/refine/` (gate) and `/mnt/ml_storage/scratch/valley-spike/refine-v4/` (captures, tasks, judgements) |
| **Log** | `/mnt/ml_storage/scratch/atlas-codesign/project1-log.md` (every message verbatim) |

## Outcome (wording agreed with Codex, run 20261024T050906Z-48a0)
> **Closed: incomplete diagnostic with a decisive failure of the required detail criterion.** The frozen candidate did not establish meaningful refinement detail at every required inspection level in both fixtures. Both peers found elephant m = 4 insufficient. The m = 1 findings remain disputed and therefore do not satisfy the both-peers acceptance rule. Seahorse m = 4 remains an agreed positive detail finding.
>
> Reject this candidate for the prescribed fixtures, landmarks, inspection poses, reference resolution and observer levels. Boundary coherence remains UNTESTED, and advisor continuity remains unassessed.

**The candidate:**
- field h = 120·[1 − tanh(0.7·D/120)], raised polarity, D = the existing world's distance estimate in world units;
- nested point-sampled levels down to a fixed reference at s₀/16;
- fixtures seahorse and elephant (the holdout);
- observer m = 16, 4 and 1.

## What was established

### Gate (passed; Codex 20261024T013549Z-645f)
- **Same sample locations:** the level-0 complex coordinates match the inherited sample locations within 1.2×10⁻¹⁶. Coordinate agreement alone does not establish an unchanged terrain.
- **Interior classification:** cardioid and period-2 closed forms, plus **rigorous attracting-cycle certificates** (outward-rounded interval arithmetic, mean-value disc form; successful certificates in the frozen reference records reach period 594 at 5,152 bits). Both reference boxes and corridors have **0 unresolved samples**.
- **Precision:** 256-bit checks on about 21k samples per fixture, with a 512-bit subset, found 0 classification disagreements and max |Δh| ≤ 1.2e-10, far inside both the vertical and the pixel allowance. Float32 storage adds ≤ 3.8e-6.
- **Landmarks:** the frozen transect rule selects them without reselection. The parent component (h > A/2) covers 53.383% (seahorse) and 54.937% (elephant) of root vertices, a vertex fraction rather than measured surface area; detail scope is parent ∩ reference box.

### Sampled LOD checks
These are sampled witness, vertical and transition checks; they are **not** full LOD coherence, because the boundary check is missing.

| Measure (max over 1290 frames) | Seahorse | Elephant | Tolerance |
|---|---|---|---|
| Witness projected displacement (4096 witnesses) | 0.717 px | 0.670 px | 1 px |
| Vertical, corridor | 0.0398 e₁ | 0.0352 e₁ | 0.05 e₁ |
| Fixed-camera transitions, stale vs reference | 0.717 px (1006 transitions) | 0.670 px (820) | 1 px |
| Fixed-camera transitions, direct (previous vs current) | 0.679 px | 0.638 px | 1 px |
| Multiplier-only control (m metadata only) | pixel-identical | pixel-identical | identical |

- **LOD defect found and fixed before freezing:** T-junction cracks at level seams. The fix is watertight fanned seams with bit-identical vertices (Codex CPU-checked 50 neighbour-level combinations per fixture).
- **Boundary/silhouette coherence: UNTESTED.** Four methods failed or were left uncalibrated:
  - flip-band thickness: insensitive to displacement;
  - raw contour-set distance: a ±0.001 jitter reads 8.3 px;
  - a significance-weighted protrusion formula: refuted by a projection counterexample;
  - dense correspondence: its oracle measured surface movement, and its visibility predicate can accept hidden counterparts.
  
  The calibration stopped under its stop rule after 31 of 60 minutes. All four approaches are preserved as findings. Only DC and raw contour distance continued, as descriptive capture measurements.

### Navigation
The scope is the tested controller, routes and machine only; this is not unrestricted navigation or production readiness.
- **Timing instrument:**
  - The moving positive control **failed**: the stalls were detected correctly, but five other intervals exceeded 33 ms (92.8, 56.3, 37.6, 34.6, 34.5 ms). It is preserved, and its cause is unexplained; LOD causation is not established.
  - A prospective amendment added a static-scene control, which **passed**: the presented intervals overlapping the injected stalls were 155.1, 81.1 and 156.5 ms, and no other interval exceeded 33 ms.
- **Six flight-and-return tasks** (both fixtures × m = 16, 4, 1; the frozen stateful controller with a vertical-speed limit, a swept-volume clearance check and trajectory-derived completion): **all pass**.

| Measure | Result |
|---|---|
| Completion | 720 / 4800 / 312 / 4800 substeps |
| Penetrations | 0 |
| Clearance violations | 0 |
| Relocations | 0 |
| Contract violations | 0 |
| p95 | 21.2–22.1 ms |
| max | ≤ 69.8 ms |

## Detail and convincingness (both peers independently; judgements committed by hash before exchange)

| | m = 4 | m = 1 |
|---|---|---|
| Seahorse | **present (both)**: grooves and scalloped plateau edges with parallax; refinement on the landmark crest | **disputed**: Codex present, limited (a crest shoulder and saddle; the shoulder witness is 2.8 units from L with a reference-minus-coarse residual of +0.24 e); Claude not established (no inspectable near-field formations) |
| Elephant (holdout) | **not established (both)** | **disputed**: Codex present, limited (a crest saddle and shoulders 4.5–7.3 units beyond L; reference-minus-coarse residuals of −0.145 units at the saddle and +0.273 and +0.329 units at the shoulders); Claude not established |

- **Convincingness (recorded views):**
  - Codex: present at all levels in both fixtures, as bare, stylised terrain.
  - Claude: negative for seahorse m = 4 *as rendered*, and weakly positive elsewhere.
  - Under the both-peers rule, the visual part of criterion 3 does not pass.

**Discriminating test for my seahorse m = 4 objection** (level-5 probes at s₀/32). Across the four seahorse neighbourhoods, the probe's interpolation-error standard deviation was 0.86–5.54% of the reported fine-minus-coarse residual standard deviation. The corresponding maximum-error ratios were 4.40–10.20%. These compare different sampling sets. I withdraw my under-resolution diagnosis: the probes found only small additional height errors at the tested points. They do not establish global convergence, nor do they prove that shading alone caused the visible stepping; that requires a controlled shading comparison.

**Fine-minus-coarse residuals within 3 eye heights** (in eye heights e of that level; geometric approximation differences, not all environmental relief):

| Location | Seahorse std / max | Elephant std / max |
|---|---|---|
| m = 4 foot (pose 90) | 0.028 / **0.122** | 0.0003 / **0.0008** |
| m = 4 landmark | 0.020 / 0.140 | 0.018 / 0.097 |
| m = 1 foot (pose 599) | 0.042 / 0.208 | 0.008 / 0.044 |
| m = 1 landmark | 0.071 / 0.279 | 0.031 / 0.179 |

## Interpretation (hypotheses, not findings)
- **Agreed framing:** the tested field, landmark-selection rule and viewing protocol did not reliably expose additional formations that both peers considered meaningful. The experiment has **not** isolated the contributions of field structure, transfer, target selection, viewing distance and shading.
  - The transfer is approximately linear near the boundary, with dh/dD → −0.7. Saturation compresses the far field; near-boundary saturation was not established as the cause of the detail result. Claude's earlier compression explanation is withdrawn.
- **Claude's interpretation:** refinement mostly added silhouette nuance at crest lines, not inspectable near-field formations. This sits alongside Codex's accepted crest findings and the agreed seahorse m = 4 finding.
- **Successor hypotheses** (each needs its own card and an independent holdout):
  - smooth reference-derived shading with geometry held fixed, which tests the rendering objection;
  - a residual-based inspection-target rule, which tests discovery and suitability;
  - a different transfer, a different world definition (log-DE needs explicit behaviour at D = 0).

## Process notes
- **Protocol held:** read-only reviews and freezes before every measured run; one GPU user under the lock; confirmed cleanup receipts before each launch; failed runs preserved; disagreements resolved by experiment where one exists.
- **Display outage:** headed Chrome launches failed for about 13 minutes because X display :10 stopped responding. The run was blocked, not substituted. The advisor restored the display.
- **The advisor's timed continuity viewing** (criterion 4) has not been done. It would add perceptual context but cannot overturn the failed detail requirement.

## Evidence index (refine-v4/runs/)

| Run | Contents |
|---|---|
| `measured-seahorse-20261024T033205Z`, `measured-elephant-20261024T041735Z` | videos (coarse, ref, lod), stills, `review/sheet-*.png`, `*-measure.json`, `results.json` |
| `live-control-20261024T045516Z` | failed moving control |
| `static-control-20261024T050106Z` | passed static control |
| `live-{seahorse-tail,elephant-trunk}-m{16,4,1}-*` | the six tasks |
| `calib-*`, `validate-*`, `masks-*` | boundary-metric attempts |
| `navrun-*`, `livetests-*` | CPU controls |

- **Judgements:** `claude-detail-judgement-{seahorse,elephant}.md` (hashes ee34f4ea…, d8fd6298…), `seahorse-disagreement.md`, and the Codex runs 20261024T041910Z-e2c2 and 20261024T050229Z-b0cb in the log.
- **Measures:** `detail-measures-*.json`, `resolution-test-*.json`.
