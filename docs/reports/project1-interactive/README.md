# Project 1, interactive milestone: status at the role-switch handoff (2026-10-28)

This is a milestone checkpoint, not a closure report. On 2026-10-28 the advisor switched roles:
- **Codex** becomes owner/orchestrator.
- **Claude** becomes reviewer/challenger.

The purpose is to evaluate each peer in the other's seat. This folder records the state at the switch, so later work can be compared against a fixed baseline.

## Contents
| File | What it is |
|---|---|
| `HANDOFF-2026-10-28-codex-owner.md` | The full handoff: goals, standing rules, LO1 status, evidence tiers, corrections on record, file map, constraints |
| `NEXT-integrated-live.md` | Resume note for the work parked behind LO1: the integrated-workflow limit-check fix, the compiled evaluator in the integrated provider, the live run |
| `card-lo1.md`, `card-lo1_r0.md` | Card for the current initiative, LO1 (evaluator loop optimisation): r1 (after Codex review) and r0 |
| `decision-f32-perturbation.md` | Advisor decision: float32 perturbation is the standard evaluator; float64 is the bitwise reference only |
| `snapshot-gpu-handoff-2026-10-28.sha256` | Checksum of the scratch work-tree snapshot (below) |

The Claude↔Codex log is archived in `docs/codesign/project1-log.md`, through the handoff.

## Baseline snapshot (scratch, not in git)
- **Snapshot:** `/mnt/ml_storage/scratch/snapshots/gpu-handoff-2026-10-28.tar.zst`
- **SHA-256:** `71b2c3d1dae9e435c08581c72db25b922809cf9dde53a73918acd654413034c7`
- **Size:** 294 MB, zstd-compressed.
- **Contents:** the whole research tree `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/` (code, cards, `clock.md`, results), with `__pycache__` excluded. 2,387 entries, 160 Python files.
- **Why not in git:** the research code is entangled with large JSON results and doesn't belong in the product repository. The snapshot gives a checkable baseline for diffs and recovery.
- **Verify:** `sha256sum -c` against the checksum file.
- **List the contents:** `tar --zstd -tf <snapshot>`.

## Where things stand

### Established (gated or reproduced)
- **Store E** (hash-free pointer quadtree) is performant in the live workflow: integrated traversal on H frames fell from 0.57–3.51 s to 0.15–0.20 s.
- **Layer 1:** the compiled float64 evaluator is bitwise identical to the NumPy E1b evaluator, on finite valid inputs in this environment.
- **Layer 2:** the compiled decision walk is decision-equivalent to the Python one. The one stated deviation is libm `tanh` in Koebe, covered by an outward factor.
- **Speed with no deadline** (old → Layer 1 → Layer 2):

  | Request | Old | Layer 1 | Layer 2 |
  |---|---|---|---|
  | H_contact | 49.7 s | 16.3 s | 9.5 s |
  | H_edge | 8.6 s | 0.92 s | 0.50 s |

- **FD1:**
  - On H_contact, 88% of evaluated cells fail the Taylor enclosure, and 79% end with no information.
  - About 92% of evaluator iterations go to cells ending unbounded.
  - Codex confirmed the counts by an independent replay.
- **ED1:** the integrated workflow's extra evaluations (+21% without a deadline) contain no duplicates. With the per-decision visit allowance removed from both arms, the integrated workflow needs 11% fewer evaluations.
- **LO1 step 1** (fused main/anchor pass plus rigorous lazy anchor):
  - Decisions identical to Layer 2. After the deferred anchors are promoted, the store is bitwise equal.
  - Orbit loop steps: H_contact 199M → 109M (−45%); H_edge −24%.
  - **Not yet independently reviewed.**

### Supported
- Main-disc failures are geometric within this enclosure method.
- Anchor failures at the finest level come from the float64 enclosure's error budget. This supports the move to f32 perturbation with reference orbits.
- The ED1 gap is dominated by the prospective visit-allowance check: the integrated provider counts only uncached next-level cells.

### Unresolved
- **A4:** E1b's result-relative padding does not bound cancellation (Codex counterexample). Float64 certification rests on an unproved arithmetic assumption. **This awaits an advisor decision**, together with the ball-arithmetic oracle proposal.
- The LO1 step 2 checkpoint restart: designed, not built. It conflicts with anchor fusion on H_contact-type regions.
- Live behaviour and the stalled H_contact frame. The live run waits for LO1 and the integrated-workflow fixes.
- How many decisions precise anchors would unblock (bounded ≠ decided).

## Process note
During the session the advisor's challenges caught two of Claude's errors: an invalid frame comparison, and defaulting the live run to the drop-in workflow. Codex's reviews caught four more over-claims. All are recorded in the handoff (§4) and in `clock.md`. The bitwise-equivalence gates were worth their cost: they caught a NumPy SIMD-kernel dependence that would otherwise have been a silent arithmetic change.
