# Codex restart context: GPU evaluator work

**Latest resume instructions:** [20:04 UTC restart checkpoint](CODEX-RESTART-CHECKPOINT-2026-10-28.md), saved at the advisor's requested break after the ID1 card review. The status paragraphs below are earlier checkpoints.

**Later milestone, 2026-10-28:** the [Step 1 owner review](LO1-STEP1-OWNER-REVIEW-2026-10-28.md) is resolved and the [bounded LO1 experiments](LO1-BOUNDED-EXPERIMENTS-2026-10-28.md) are closed with Step 1 retained. NC1 and the padded L3 hint failed their necessary screens; neither enters integration. Latest closure challenge: `20261028T195314Z-eaa0f6`. Integrated-demand card: scratch `gpu/ia/rc1/integrated-r0/card-r0.md`; its independent challenge is in progress. Read the current scratch clock before resuming. The original orientation below is the historical role-switch baseline.

Prepared 2026-10-28 from Claude's owner handoff, the project communication log, and the immutable GPU research snapshot. This note is orientation, not an independent approval of the implementation.

## Source integrity and authority

- Handoff: `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/HANDOFF-2026-10-28-codex-owner.md`. Its SHA-256 matches the repo copy at `docs/reports/project1-interactive/HANDOFF-2026-10-28-codex-owner.md` (`21bc14c180b7b24381f30f020b4146aa540f7225497becbb0fa423f3ba6b3777`).
- Snapshot: `/mnt/ml_storage/scratch/snapshots/gpu-handoff-2026-10-28.tar.zst`, 2,387 entries. I verified its full SHA-256: `71b2c3d1dae9e435c08581c72db25b922809cf9dde53a73918acd654413034c7`, matching the repo checksum file. I read files from the archive without extracting or changing the scratch tree. Its `gpu/clock.md` ends with the 2026-10-28 17:48:57Z role-switch entry.
- The chronological `gpu/clock.md` is authoritative for experiment state; `docs/codesign/project1-log.md` preserves the Claude–Codex exchanges. The handoff and snapshot checkpoint agree on the current LO1 state.

## Roles, goal, and constraints

Codex is now owner and orchestrator; Claude is the challenger; the advisor holds product direction and merges PRs. Start by answering advisor points with agree, differ, or plan. For consequential choices, write independent positions before discussing them. Verify factual and numerical claims against source or preserved runs. Report established, supported, and unresolved claims separately.

The experience at stake is interactive spatial queries over 2D-zoom-derived worlds H, N, and G: entry, contact, and edge. `H_contact` and `H_edge` remain the blocked queries. Unknown is never solid; keep H in scope; avoid fixed-millimetre cutoffs; describe results as certified only under their stated assumptions.

## Current initiative: LO1

LO1 evaluates three evaluator-loop changes: children restarting from a parent's Taylor checkpoint (L1), skipping an anchor only when it cannot decide a result (L2), and predicting a useful starting level (L3). See the snapshot's `gpu/ia/card-lo1.md` r1; r0 is preserved as `card-lo1_r0.md`.

**Step 1 is implemented and passed Claude's equivalence harness, but has not had an independent review.** It combines a fused fresh-orbit main/anchor pass with rigorous lazy-anchor deferral in `gpu/ia/rc1/ev_nb2.py`, `dec_nb2.py`, and `h1c_provider_nb2.py`; `lo1_s1_equiv.py` produced `lo1_s1_equiv.json/.out`. On H_entry, H_contact, H_edge, and N_entry, the saved result reports identical moves, decision sequences, evaluations, visits, and key sets versus Layer 2; stores are bitwise equal after pending anchors are promoted; fused and separate kernels agree bitwise. These are offline, no-deadline checks, not a live frame-rate or GPU acceptance result.

The measured loop-step reduction is substantial: H_contact 199.06M → 109.01M (about 45%); H_edge 8.47M → 6.41M (about 24%); N_entry 0.317M → 0.276M. Fusion supplies most of the gain; lazy deferral itself is modest. Wall times are secondary single-run observations (H_contact 9.46 → 5.19 s), not a performance gate.

Before building on Step 1, independently inspect the implementation and whether the harness proves what it claims. Claude specifically flagged the `t_hi >= 1` lazy-anchor branch, promotion behavior (tighten `lo`, rebuild `lb`/`hb` summaries, advance `gen`), `ANC` flags keyed by `id(level)` and cleared by `FC.clear`, and pending-anchor reuse under later thresholds. Treat those as review questions, not established defects.

Step 2, the contained pre-escape restart, is designed but unbuilt. The key interaction is that after a restart the child no longer follows its own centre orbit: inherited remainders mean its anchor cannot automatically share the restarted trajectory. A separate anchor may erase the savings, especially on H_contact, where most cells fail. The next discriminating offline measurement should count main plus anchor work for restarting all cells, restarting only when an anchor is unnecessary, and restarting based on the parent's failure signal; include the geometric-remainder criterion. Do not assume the Step 1 fusion carries through a restart.

The r1 restart requirements are strict: checkpoint before the parent's first possible escape (`Ahi > R`); derive recentering pads from operand-based rounding bounds; prove both parent-disc containment and child-cell coverage, otherwise restart from zero; require exact-dyadic coordinates or account for their formation error; test chained restarts against a fresh run at the same `P'`; and pass the mpmath validity oracle on at least 20,000 samples, including difficult grandchildren, with zero violations. An unexplained oracle violation blocks. The card's stop rule ends L1 if no sound repair is found within one round; L2/L3 can continue independently.

T0 measured L1 checkpoint savings on the production child radius, before the repaired `P'`: H_edge saves 53.6% at `tau=2^-10` with 12/33,621 ok cells lost; H_contact saves only 3.4%. Do not treat these as repaired-restart or walk-level results. The rigorous L2 skip saved 8.8% of anchor iterations on H_edge and 0.6% on H_contact; a heuristic saved more but missed a shortcut, so it cannot certify. L3 remains a hint, and its effect in the actual decision walk is unmeasured.

## Evidence cautions and later work

Claude's handoff records several earlier count and causal overclaims that were corrected in the log. For example, FD1 established that 91.88% of main-plus-anchor Taylor iterations belong to cells ending unbounded; it did not show those iterations were avoidable. FD1c tree membership did not prove an anchor was wasted. ED1 established a 21.36% integrated-workflow evaluation increase without a deadline, but the prospective allowance difference is only a supported cause, not an isolated one. Check each claim against the saved artifact and source before repeating it.

A4 remains unresolved: E1b result-relative padding does not bound cancellation, so float64 certification rests on an unproved arithmetic assumption. The advisor's decision and the proposed independent ball-arithmetic oracle remain open. Also unresolved are live-deadline behavior, the stalled H_contact frame at fraction 0.235, and whether f32 perturbation's anchor error is acceptable at the relevant reference placement.

After LO1 closes, follow `gpu/NEXT-integrated-live.md`: (A) fix and measure the integrated provider's limit-check policy against ED1; (B) port the compiled evaluator into the integrated workflow; (C) run the live test through the integrated workflow, not the drop-in path. Do not start A–C before LO1 closes unless the advisor directs otherwise.

## Workspace and operating notes

The research tree is outside Git at `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/`. I inspected the snapshot, not the live tree after that checkpoint. Compare the live tree with the snapshot before editing. The handoff notes that a normal Codex bridge worktree cannot write there; arrange an approved write route for `gpu/ia/rc1/` and `gpu/` before implementation. Preserve every `_rN` artifact and append chronology to `gpu/clock.md`.

Use `/mnt/ml_storage/scratch/venvs/fs1/bin/python` with `NUMBA_CACHE_DIR=/mnt/ml_storage/scratch/numba_cache`; NumPy 2.4.2, SciPy 1.17.1, Numba 0.68.1, and mpmath 1.3.0 are recorded. Bound every run with `timeout -s KILL`; CPU-only work needs no lock, GPU/browser work takes `flock /mnt/ml_storage/scratch/atlas-gpu.lock`. Scratch stays under `/mnt/ml_storage/scratch`; never disable the browser sandbox or modify the host NVIDIA driver. Commit or push only when asked.

At this inspection, the ATLAS checkout is on `report/interactive-handoff` with three pre-existing untracked files: `ATLAS-Fractal-Worlds-Unveiled.png`, `ATLAS_Governing_Charter_Proposal.md`, and `ATLAS_North_Star_Impact_Assessment.md`. This context note is the only file added in the checkout during this task.

The Codex-to-Claude consultation prototype from the prior turn is in the separate Agno worktree `/mnt/ml_storage/dev/projects/agno-cli-models/.claude/worktrees/codex-reverse-bridge` on branch `codex/reverse-bridge`; it is uncommitted and read-only by design. It does not solve write access to the GPU scratch tree.
