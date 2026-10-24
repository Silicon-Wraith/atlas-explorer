# Representation card: stopped at the pre-GPU gate

## Header

| | |
|---|---|
| **Initiative** | card `card-representation.md` revision 2 (SHA-256 a6dfa0fd224ec56f…). It tests a log-redistributed transfer (T1) and a residual-based inspection rule (P1) for exposing formations at m = 4 and m = 1 |
| **Owner / challenger** | Claude / Codex |
| **Origin** | independent positions committed by hash before exchange: Claude 6ea60118…, Codex 8973e231… |
| **Date** | 2026-10-24. Clock started 16:13:28Z; stopped at the gate about 16:30Z, roughly 20 minutes of the 8 h cap |
| **Evidence root** | `/mnt/ml_storage/scratch/valley-spike/represent/` (positions, holdout manifest and seed, pipeline copy, `screen/*/feasibility.json`) |
| **Log** | `/mnt/ml_storage/scratch/atlas-codesign/project1-log.md` |

## Outcome (Codex ruling, run on the gate request; adopted)
> **Incomplete diagnostic, stopped at the mandatory pre-GPU gate after exhausting the declared holdout list. T1 and P1 remain untested.** This is a finding about fixture selection and numerical readiness.

No GPU work was done and nothing was rendered or viewed.

## What happened
**The rules, fixed before screening:**
- The card requires an unseen holdout region, chosen by a rule fixed before any probe.
- The holdout manifest (SHA-256 cbf956e1…) was committed before screening. It declares:
  - four region centres;
  - a 0.0016-wide complex box per region (the existing world mapping);
  - the frozen landmark, parent and reference rules;
  - zero unresolved samples allowed in the reference box and corridor;
  - a 20-minute build deadline per region.
- **Seed order:** the seed (committed by hash with the card) ordered the regions scepter, quad-spiral, west mini-brot, triple-spiral.
- **Screening:** only the declared mechanical checks were used.

| Region (in seed order) | Result | Sampled evidence |
|---|---|---|
| scepter valley (−1.3600, 0.0050) | infeasible | 409,600/409,600 level-0 samples classified as proven interior; 0 landmark candidates |
| quad-spiral valley (0.2740, 0.4820) | infeasible | 409,600/409,600 level-0 samples escaped; 0 landmark candidates |
| west mini-brot neck (−1.7490, 0.0000) | infeasible | a landmark was selected (626 candidates), but the reference build left 1,614 of 1,617 non-escaping samples unresolved, 1,134 of them in the corridor (limit 0) |
| triple-spiral valley (−0.0880, 0.6540) | infeasible | 0 landmark candidates (409,590 escaped, 10 interior) |

**Why mini-brot didn't end the list:** it failed reference feasibility, so it never became the selected holdout. Triple-spiral's zero-landmark result is what establishes that the list is exhausted.

These are sampled classifications and landmark counts. They do not prove that a whole continuous box lacks boundary.

**Hypotheses, not findings:**
- The scepter box may lie inside the period-4 bulb.
- The mini-brot unresolved samples may be near-parabolic points at the period-3 cusp.

## Repair accounting
My copy of the frozen pipeline (`represent/pipeline/`) needed two successive mechanical repairs during the mini-brot reference build. That is **two repair/retry cycles against the card's one-cycle allowance.** No retrospective exception was granted.
- **First repair:** `reference.py` read the parent mask from the pipeline directory instead of the screening output.
- **Second repair:** its source-hash list still named `budget-sweep.py`, which was not copied.

The changed `reference.py` hash is 96d00c60… (the frozen original is fcece03e…). Both failed attempts are preserved. All three attempts record the same 1,614 unresolved classifications, so the stop does not depend on accepting the final rerun.

## Cause
I declared the four region centres from well-known region names, with no mechanical guarantee that each 0.0016-wide box contains boundary, a landmark and a fully resolvable reference. The card correctly forbids changing the manifest after screening.

## What comes next
- **Field card next:** as the advisor directed, the field card follows, with positions drafted independently. T1 and P1 are carried forward as unanswered questions.
- **Its holdout rule must keep three things distinct:**
  - **Boundary inclusion:** the box contains boundary, by a stated guarantee with numerical error bounds.
  - **Landmark availability:** the frozen landmark rule yields a landmark.
  - **Reference resolvability:** the reference build completes with zero unresolved samples.
- **No commitment yet:** a seeded external-ray placement was suggested, but it is not committed to.
