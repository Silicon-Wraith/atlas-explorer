# LO1 Step 1 owner review — 2026-10-28

Step 1 is accepted for the tested offline reference behavior after repair. Codex performed the independent review before consulting Claude, reproduced defects, installed the repairs through explicit sandbox approvals, and passed the strengthened gate. Claude remained the independent challenger. The advisor retains product direction and PR merges.

Step 2 is **not built**. Its next experiment is defined in [NC1 r1](LO1-NC1-NET-COST-2026-10-28.md). The broader LO1 initiative remains open.

## Integrity and review order

The snapshot SHA-256 was independently checked: `71b2c3d1dae9e435c08581c72db25b922809cf9dde53a73918acd654413034c7`. Of 2,387 archive entries, 2,365 regular files matched the live tree. No entries were missing. The only changed archived file was `clock.md`, with exactly the expected 17:57:43Z checkpoint appended; additions were Python/Numba caches. The handoff hash also matched.

The independent position was saved at 18:23:54Z, before the first Claude call. Research sources stayed unchanged during both read-only reviews. Evidence lives at:

`/mnt/ml_storage/scratch/atlas-codesign/lo1-owner-review-2026-10-28-r0/`

It contains the initial position, integrity inventory, isolated repair revisions, all focused/replay results, interruption test, NC1 revisions and installation hash manifest. Original research source and harness bytes are preserved as `*_r0.py`; original JSON/output files remain untouched.

## Findings and repairs

| Finding | Evidence and resolution |
|---|---|
| Cached promotions could overflow BLOG output arrays. | Original provider line 33 sized the buffer from new-evaluation budget, while decision line 119 also wrote cached promotions. A real sequence created 21 pending cells using single-cell calls with budget 0, then a cached-only query exceeded capacity 2 under bounds checking. Capacity now covers new-cell allowance plus all pending anchors at entry, maintained without scanning the store. The repaired case records 21 promotions safely. |
| `promote_all()` changed evidence without advancing `gen`. | A real cell changed value while generation stayed 1. The helper now advances generation and decrements the pending count. Normal decision promotion already advanced generation. |
| Relative exponential padding was not an upper bound in the subnormal range. | For `cr=372.05, f=U=L=1`, the old bound was about 4.94e-324 versus exact exp(-2cr) about 6.94e-324. No eager-classification error was demonstrated. Extreme/overflowed exponents now conservatively compute anchors; normal output is rounded outward with nextafter. |
| The harness overstated equivalence and did not fail its process on a failed gate. | Store comparison now checks bits; s0 is compared exactly; full witness data and assumptions are compared; summary, pending-count and generation assertions were added; failure exits nonzero. Result paths are exclusive, preserving earlier runs. |
| Pending-count repair initially included deferrals before insertion succeeded. | Claude identified this during reconciliation. Counting now occurs only after successful insertion; a forced GROW return preserves count/flags at zero and raises as required. |

Current research source:
- `gpu/ia/rc1/h1c_provider_nb2.py`: capacity/count lifecycle, generation helper and diagnostic export contract.
- `gpu/ia/rc1/dec_nb2.py`: extreme exponential handling and post-insertion deferral count.
- `gpu/ia/rc1/lo1_s1_equiv.py`: strengthened gate; default result `lo1_s1_equiv_r3.json`.

All paths above are under `/mnt/ml_storage/scratch/valley-spike/zoom2d/`. Exact before/after hashes are in the evidence directory's `installation-r2.json`.

## Verification and reconciliation

The installed-source gate, bounded by a 300-second hard timeout with array bounds checking enabled, exited 0. Saved results: `gpu/ia/rc1/lo1_s1_equiv_r3.json` and `.out`.

| Fixture | Cells | Decisions | Outcome sequence | Bit differences / summary mismatches |
|---|---:|---:|---|---|
| H_entry | 12 | 35 | 6 AUTHORISED | 0 / 0 |
| H_contact | 363,691 | 4,789 | AUTHORISED, WAIT | 0 / 0 |
| H_edge | 48,538 | 1,880 | 2 AUTHORISED | 0 / 0 |
| N_entry | 2,674 | 93 | 6 AUTHORISED | 0 / 0 |

Both arms matched moves, decision sequences, evaluations, visits and keys. Main outputs and failed-cell anchor outputs matched the separate reference kernels bitwise. Counts were asserted before promotion; counts, generation increments and cleared pending flags were checked afterward.

Focused evidence additionally covers:

- Real-cell reuse at th exactly 1, above 1, just below 1, and the already-resolved [0,1] case.
- ANC preservation during capacity growth and clearing across store resets.
- Wrong-threshold and disabled-promotion mutations changing correct MIXED to BUDGET. A separate **fully compiled fresh-evaluation** mutation also produces BUDGET instead of MIXED.
- An interrupted decision after one promotion, followed by resume, preserving pending counts, summaries and generation. The fake clock uses Python traversal with compiled numerical kernels; it is not live-deadline parity.

The original replay had 81 H_contact and 7 H_edge decisions with th > 1, none exactly 1. The focused tests establish sensitivity at the exact boundary separately.

Claude bridge runs:
- `20261028T182422Z-3a5e31`: stopped at eight turns before returning a review; failure preserved and logged.
- `20261028T182744Z-2ab659`: independent review.
- `20261028T183650Z-5e6714`: reconciliation and repair/NC1 review.

Claude acknowledged the overflow, helper generation bug, harness overclaims and subnormal-bound correction. Conditional acceptance required post-insertion counting, full-replay count assertions, stronger evaluation-time branch evidence, and explicit NC1 definitions. Codex verified those conditions before closing this Step 1 review. NC1 r1 fixes retention, selection timing, shadow-remainder accounting, and numerical cost/memory gates; it has not run.

## Evidence tiers and cost correction

**Established within these checks:** snapshot provenance, the reproduced defects and their regression repairs, four-fixture offline reference equivalence, and the focused lifecycle/threshold behavior. This is not a proof over all inputs.

**Supported partial finding:** fusion reduces shared orbit work. Include later promotions:

| Fixture | Layer 2 orbit steps | Step 1 inclusive orbit steps | Reduction | Step 1 radius/test steps |
|---|---:|---:|---:|---:|
| H_contact | 199,060,498 | 109,250,688 | 45.12% | 204,370,979 |
| H_edge | 8,469,061 | 6,485,656 | 23.42% | 12,629,268 |

Inclusive orbit work is `steps_loop + promote_steps`. Radius/test work increases by 2.67% and 49.12% respectively, because fusion speculatively carries anchors on main-success cells. These units have different costs; the percentages are not elapsed-time savings. Verification-only promote_all is excluded from online work. Single-run timings remain secondary; no performance acceptance claim is made.

**Unresolved:** A4's arithmetic enclosure assumption, rigorous oracle decisions, live deadlines, integrated workflow behavior, the stalled H_contact frame, and restart net cost. H_contact still returns WAIT in the second request. Exports containing pending [0,1] values are diagnostic own bounds, not resumable cache serialization. The one-way BLOG value check is intentionally not an event-order-equivalence claim; NC1 requires event-order evidence.

## Process and continuation

Preserved evidence spans approximately 18:23–18:52Z, plus the initial read-only inspection. Process cost: three full fixture replays, three focused revisions, one interrupted/resume check, two completed consultations, and one failed turn-limit attempt. The bounds-checked reproducer, independent bit comparisons and challenger review changed the result; merely repeating the original gate would have missed the overflow and helper defect.

All experiment processes exited; a process inspection found no remaining review/bridge commands. No GPU/browser run, commit or push occurred. Research writes used explicit sandbox approvals; the ATLAS product source was unchanged. The canonical scratch exchanges are archived into `docs/codesign/project1-log.md`.

Next: execute NC1's bounded offline screen, then decide whether a contained restart merits further implementation. Do not infer that Step 1 acceptance closes LO1 or permits the integrated live sequence yet.
