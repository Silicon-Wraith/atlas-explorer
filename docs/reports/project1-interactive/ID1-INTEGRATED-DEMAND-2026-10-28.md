# ID1 integrated demand correction — closed, gate failed

2026-10-28. Codex owns implementation and measurement; Claude independently challenges the evidence. This follows the [restart checkpoint](CODEX-RESTART-CHECKPOINT-2026-10-28.md) and [LO1 closure](LO1-BOUNDED-EXPERIMENTS-2026-10-28.md).

The prospective child-wave check **does not pass ID1's frozen evaluation gate**. Retain only the independent capacity-accounting correction, as an isolated scratch variant. The advisor chose to investigate budget scheduling and retry reasons before compiled integration. No compiled integration, live acceptance run, commit or push occurred in ID1.

## Established on these runs

All four arms used the NumPy evaluator, the same initial requests, no effective deadline, and at most ten attempts per frame while the top-level reason was `budget` or `memory`. H_entry covered its full 34-frame walk; contact and edge covered the first two requested frames. These are counted-work experiments, not elapsed-time comparisons.

| H_entry arm | Evaluations | Visits | Calls | Authoriser work |
|---|---:|---:|---:|---:|
| Original dict | 34,722 | 313,022 | 1,941 | 351,006 |
| Original integrated | 42,139 | 120,349 | 1,228 | 164,752 |
| Integrated + accounting repair | 42,139 | 120,368 | 1,228 | 164,771 |
| Repair + prospective wave check | 42,139 | 99,748 | 1,228 | 144,151 |

All reach 34 frames with zero duplicate evaluations. The wave candidate exceeds the frozen 34,722 evaluation limit by 7,417 (21.36%). Original integrated and wave have identical evaluated key sets and final evidence, although evaluation order differs. Two MIXED answers become BUDGET, increasing new splits from 138 to 140. The 219 wave refusals replace later refusals and save visits without reducing evaluations.

The accounting control restores 19 visits lost across one capacity growth. Its H_entry questions, results, evaluation sequence and final evidence match original integrated. Original integrated has no growth counter: the harness's default zero is not evidence that it did not grow.

| H_edge arm, two frames | Evaluations | Visits | Calls | Authoriser work |
|---|---:|---:|---:|---:|
| Original dict | 48,538 | 308,582 | 1,880 | 359,100 |
| Original integrated | 51,938 | 131,513 | 1,425 | 184,991 |
| Accounting repair | 51,938 | 131,584 | 1,425 | 185,062 |
| Repair + wave check | 51,938 | 115,218 | 1,425 | 168,696 |

All finish both requested edge frames at fraction 0.05165765. Wave also fails the edge evaluation comparison with old. Edge was observed during ID1 and cannot serve as a held-out test for a later card.

Across all twelve runs, 39,053 definitive calls pass the independent checker against saved final evidence. All integrated store invariants pass; duplicate evaluations and memory-cap hits are zero. Physical node counts stay below the authoriser's four-million-cell limit, so the wave arm's evaluated-cell `len(FC)` change is inert here. Its identity guard explicitly retains the original physical-node emptiness test.

## Contact: observed progress and an important stopping limitation

All arms complete the first step at fraction 0.23480663. The second step targets approximately 0.4696. Partial authorisations advance the current position before the next attempt.

| Arm | Final fraction | Evaluations | Total requests | Final top-level reason |
|---|---:|---:|---:|---|
| Original dict | 0.41091160 | 446,716 | 11 | budget |
| Original integrated | 0.23480663 | 230,179 | 11 | budget |
| Accounting repair | 0.23480663 | 230,175 | 11 | budget |
| Repair + wave check | 0.42558702 | 315,725 | 2 | undetermined |

The wave candidate's greater certified prefix is observed, but its stopping label is misleading: **all four saved terminal boxes contain `budget_gchild` inside `cutter_undetermined_over_parent_solid`**. The authoriser returns top-level `undetermined` without a request-level cap hit, so the frozen harness stops retrying. The resulting two-versus-eleven request and aggregate-work comparisons are not fair completed-budget efficiency evidence. No tenfold speed or efficiency improvement is claimed. More attempts for any arm remain unmeasured.

This is inherited behavior in `authoriser5s.move`: a completed search without a witness returns `undetermined`; only a raised request-level Budget produces `budget`. Dict and integrated authorisers both inherit it, and RT live runners use the same retry condition. Correcting the label alone will not establish progress.

The saved integrated requests also show actual stagnation: zero-based request IDs 3–10 (the fourth through eleventh requests) repeat the same 892 call rows except request index, with zero new evaluations and zero movement. Each consumes 3,162,244 visits. Twenty-seven resumed queues exceed the 4,096 evaluation allowance; 419 unretained queues exceed the 8,192 continuation cap. These explain two concrete cases for the next scheduling investigation; no liveness fix had been validated at ID1 closure. See the subsequent [BS1 result](BS1-SCHEDULING-2026-10-28.md).

## Local attribution, not a whole-gap explanation

The preserved call-186 replay crosses the old and integrated pre-call evidence caches. Old returns BUDGET with 10 new evaluations and 219 visits on either cache. Wave returns BUDGET with zero new evaluations on the old cache, but BELOW with 190 new evaluations and 316 visits on the integrated cache. Disabling summaries makes wave return BUDGET on either cache.

Old refuses 219 paid visits plus a 546-cell next wave against allowance 512; neither its evaluation budget nor depth limit binds. Cached descendant summaries reduce the integrated critical admission to 104 paid + 188 queued + 4 unpaid = 296. The exact pre-call evidence plus that replay's fresh values independently supports BELOW. This establishes the cache-and-summary mechanism for this question, not the cause of the entire 7,417-evaluation gap.

## Retained correction and verification limits

Scratch artifacts live under `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/integrated-r0/`.

- `fs_live_capacity_r0.py` and `h1c_provider_capacity_r0.py` retain only cumulative visits and minimum exponent across internal CAPACITY returns. The original kernel and reservation policy remain unchanged. This is a scratch variant, not a product deployment.
- `capacity-extract-check-r0.json` verifies original-kernel AST equality, forced-growth parity with the measured repair control, equality of node arrays, earlier minimum-exponent preservation, allowance decrement and provider wiring.
- `fs_live_id1_r1.py` preserves the rejected wave experiment. `focused-r2.json` checks exact allowance equality, mixed cached/missing waves, unresolved coverage and flags, growth with pending placeholders, first-value counts, rewrites and growth accounting.
- `analysis-r0.json`, the twelve per-arm results/logs/evidence files, and `closure-r0.json` retain both the counts and the terminal-reason limitation. `id1_call186_diagnostic_r0.*` preserves local attribution. `artifact-sha256-r0.json` records hashes and confirms all eight checkpoint baseline sources are unchanged.

Whole-wave admission holds within one `Store.query`, including internal growth. A cross-call continuation is a new initial frontier under the existing contract; original wave boundaries are not retained. Contact wave has nine such resumes, all returning BUDGET with zero new evaluations. Entry and edge have none.

One resume has a probable predecessor differing by a few ULPs in rectangle/threshold values. No unsafe answer was observed; saved slot IDs are insufficient to prove that lineage. However, the inherited provider does not bind stored done answers or continuation flags to the exact question. Claude identified this as a baseline soundness gap to fix before compiled integration. The observed-run audits do not replace that guard.

Final-evidence checking establishes support for these observed answers, not contemporaneous evidence provenance or arithmetic soundness. A4 and the ball-arithmetic oracle remain open. These experiments provide no browser/GPU or live acceptance.

## Independent challenge, next work and process cost

Claude reviews `20261028T201834Z-bffb08`, `20261028T202525Z-7a5e6d` and `20261028T203021Z-e96b6e` confirm the failed gate, support the separate accounting correction, reconcile the continuation contract and identify the terminal-reason and exact-question issues. Peer exchanges are in the canonical scratch log and its repository archive.

The advisor explicitly chose scheduling/retry investigation before compiled integration. The next card must distinguish honest retry classification, exact question binding, and actual retry progress. It must not relabel ID1 as passed or use already-observed edge results as held out.

ID1 engineering began at 20:10 UTC and reached closure around 20:34 UTC, within its 45-minute bound. Every workload exited successfully within its 120-second entry or 300-second contact/edge process bound. Some CPU count-only work overlapped; no timing comparisons use it. A test-only mocked argument-index typo was preserved and repaired once. One bridge attempt failed DNS; automatic approval review then required explicit payload approval, which the advisor supplied before the successful reviews. Forced-growth tests, separate controls, local attribution and the terminal-reason challenge materially changed the findings. The wave prototype was not rerun to seek a passing verdict.
