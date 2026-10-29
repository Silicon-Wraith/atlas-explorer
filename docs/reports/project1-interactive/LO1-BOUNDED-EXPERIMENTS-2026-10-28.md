# LO1 bounded experiments — owner findings

2026-10-28. Codex owns implementation and measurement; Claude challenges the decisive evidence. This report follows the [Step 1 owner review](LO1-STEP1-OWNER-REVIEW-2026-10-28.md). Claude supports closure in review `20261028T195314Z-eaa0f6`; the owner closed this bounded LO1 iteration.

The retained result is the repaired fresh fused/lazy-anchor evaluator. The contained-restart prototype fails its necessary cost screen; the padded starting-level hint fails its overshoot precheck. Neither prototype enters the integrated provider. These findings do not establish live performance or resolve A4's arithmetic assumption.

## Established on the preserved runs

- Step 1's four-fixture gate passes: identical decisions, evaluations, visits and keys; bitwise store equality after deferred-anchor promotion. Inclusive orbit reductions versus separate passes are 45.12% on H_contact and 23.42% on H_edge. Radius work increases; orbit reduction alone is not a timing claim.
- NC1 trace instrumentation preserves the actual event order and matches the uninstrumented Step 1 outputs and counters on all four fixtures. Its baseline replay matches the saved event values and main, anchor and inclusive orbit counts.
- None of 18 NC1 policies passes the predeclared H_edge screen. The strongest arm satisfying the same-radius main-success-loss gate saves 20.44% of inclusive orbit work against the required 30%; its approximate weighted cost increases 5.87%. The slightly larger 20.55% orbit saving loses 0.658% of same-radius main successes, exceeding the 0.5% limit.
- L3's added hint instrumentation preserves all nine original fused outputs bitwise on 414,915 cells with `need=False`; this checks the main path, not anchor execution. The exact padded formula skips a successful descendant level in 3,858/3,858 observable qualifying H_edge cells, 4,496/4,496 H_contact cells and 236/236 N_entry cells. The corresponding qualifying cases without an observed successful descendant are 2,045, 5,440 and 40; their overshoot status is unknown. H_entry produces no qualifying hint. No jumping frontier was implemented.

## Supported partial findings and limits

NC1 shows a substantial local orbit reduction for its specified event-time policy, with contained immediate-parent checkpoints and fresh anchors. It does not meet the retention criteria. The operation weights are an approximate scheduling model, not measured whole-kernel elapsed cost. No candidate reached the timing shortlist, H_contact candidate comparison, exhaustive selected-event arithmetic checks or 20,000-sample composition oracle.

Claude found an escape-test association mismatch in the rejected NC1 kernel: `(an + bn*P) + rz` differs from Step 1's `an + (bn*P + rz)`. This can admit an invalid checkpoint at a rounding boundary. The prototype cannot be reused without fixing and validating that condition. Its measured cost is still the cost of the preserved implementation; no corrected implementation's performance is claimed.

A fresh anchor was an experimental choice. Carrying an anchor from the inherited checkpoint with its own complete error state is a separate, unmeasured possibility. Claude's estimate near the orbit gate is a hypothesis. The L3 padded formula also differs from the earlier unpadded T0 predictor; rejecting this formula does not reject starting-level prediction generally. The preflight establishes skipped successful levels, not an actual walk-time regression.

## Decision and next work

The owner closed this bounded LO1 iteration with Step 1 retained. Follow the already-agreed order in [NEXT-integrated-live.md](NEXT-integrated-live.md): isolate and repair the integrated workflow's coarse-evaluation demand, integrate the compiled evaluator, then measure the integrated live workflow and the actual stalled H_contact frame at fraction 0.235. The prospective allowance check remains a causal hypothesis to isolate, not an established sole cause.

Final challenge reconciliation: `verify_examples_r0.py` regenerates the examples from each fixture's own arrays; H_edge and H_contact really share the cited cells. Claude's carry-forward GROW count concern was stale: current `dec_nb2.py:131` returns on failed insertion before line 133 increments the deferral count; the insertion routine preflights errors before writes, and the saved forced-GROW probe passes. The four-fixture harness asserts each level's pending count at line 52 and post-promotion count/generation at line 57. No additional Step 1 change was needed.

## Evidence and process accounting

All research artifacts remain revisioned under `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/`:

- `nc1-r0/`: trace gates, chronological event files, source r0/r1/r2, frozen weights, arithmetic preflight, both failed screen revisions and the single repair note.
- `l3-r0/`: card, pre-run amendment, hint source, preflight script/results, per-cell arrays, examples and SHA-256 manifest.
- Claude reviews: `20261028T191107Z-f72000` (arithmetic and accounting) and `20261028T193330Z-a6253c` (NC1 result and L3 card); exchanges are verbatim in the canonical scratch log.

NC1 reached its necessary stop in about 30 minutes; L3 build/precheck took about 20 minutes, including permission overhead. Trace equivalence, complete anchor accounting and Claude's overshoot precheck materially affected the decision. We stopped before expensive validation and timing after the necessary screens failed. All CPU experiment processes exited; no browser/GPU run, commit or push was performed.
