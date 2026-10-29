# BS1 scheduling — useful components, contact gate failed

2026-10-28. Codex owns implementation and measurement; Claude independently challenges the evidence. This follows [ID1](ID1-INTEGRATED-DEMAND-2026-10-28.md) and the advisor's choice to investigate scheduling before compiled integration.

**The scheduling candidate performs previously blocked work, but does not improve movement or produce additional definitive contact decisions on the tested route.** Preserve its implementation, tests and limitations for reuse with a different evidence-producing method. Retain the separate accounting and exact-question correctness fixes as scratch variants. No replacement architecture or product default has been selected.

The North Star remains inhabitable movement through a coherent mathematical world. Efficient evaluation and resumable work can support that experience; their local success is not evidence that this contact problem has been solved. The advisor explicitly clarified that performance optimizations, including scheduling, remain worthwhile and may be needed by a new approach.

## Established within the recorded tests

Both arms use the original integrated traversal with ID1's accounting repair and the new exact-question guard. The candidate additionally permits partial evaluation of resumed pending batches and retains continuations under an accounted-byte limit, reserving headroom for one doubling of the largest node-array allocation. Fresh-call batch admission is unchanged. Both use the same first two H_contact frames, ten attempts on the second frame and no effective deadline.

| Measure | Guard control | Scheduling candidate |
|---|---:|---:|
| Final route fraction | 0.23480662983446213 | 0.23480662983446213 |
| Evaluated cells | 230,175 | 1,076,489 |
| Definitive spatial memo boxes | 1,791 | 1,791 |
| Unique definitive field questions | 2,852 | 2,852 |
| Provider visits | 31,329,004 | 14,394,846 |
| Authoriser work units | 31,581,881 | 15,482,027 |
| Requests | 11 | 11 |
| Final stop reason | budget | memory |

The first successful request and first attempt at the stalled frame have identical core calls and evaluation order. Subsequent attempts in either arm add no definitive questions, spatial memo boxes or movement. The candidate's 244 partial batches account for all 846,314 additional evaluations. All additional cells are at the gchild level: 843,548 (99.67%) return exactly `[0, 1]`; 2,766 have a nontrivial own bound. Shared cell values are unchanged.

The candidate reaches the authoriser's four-million-node `FC_CAP`, with 4,112,632 physical nodes including placeholders. It does **not** exhaust the provider's 3 GiB `MEM_CAP`: accounted arrays peak at 794,646,096 bytes, with no provider memory or continuation-retention refusal. The last five attempts return immediately at the authoriser cap. Consequently the lower aggregate work is not a throughput or efficiency improvement claim, and the run does not establish what would happen beyond that node limit. The limit was not raised to seek a passing result.

All observed definitive calls pass the checker against final saved evidence: 6,866 control calls and 4,284 candidate calls, each covering 2,852 unique questions. Duplicate evaluations, store path mismatches and summary mismatches are zero. These are observed-run checks, not an arithmetic soundness proof, contemporaneous evidence audit or independent proof of the authoriser's cover.

## What remains useful

The exact-question guard binds cached done answers and continuations to the complete level, rectangle and thresholds. Eleven focused tests pass, including concrete baseline counterexamples that otherwise reuse an incorrect done answer or stale classification flags. Same-question reuse remains available; a changed question releases its continuation bytes. The contact control has no mismatches; the candidate correctly invalidates two changed questions, with no A/B/A alternation observed. This correction remains required before any compiled port of the integrated provider.

The scheduling probes establish a separate capability. A pending batch of 5,000 cells previously returns BUDGET repeatedly without evaluating anything. Partial batches finish it in 4,096 + 904 evaluations; a 10,000-cell continuation finishes in 4,096 + 4,096 + 1,808. Both reach the same definitive result as an unlimited-work reference, with no duplicates or lost unresolved coverage and within each call's allowance. Additional probes cover classification flags, replacement and clearing of continuation bytes, exact memory/headroom equality, one-byte-over refusal, and unchanged fresh-call admission.

These results justify preserving the scheduler for reuse. Its benefit on a future evaluator or contact representation must be measured there. It is not adopted as the demonstrated remedy for this route. The compiled evaluator, fused main/anchor pass, field store and earlier measured optimizations likewise remain available under their existing validation limits.

Continuation retention has a material memory cost. At the end of the observed run the candidate retains 336,778,768 bytes in 950 slots, versus 4,560,952 bytes in 517 control slots. Candidate slots never resumed during this walk account for 16,008,768 bytes across 576 slots. This is a slot-lifetime observation, not proof that those continuations are permanently abandoned. The byte budget covers allocated node/work/continuation arrays; it excludes Python containers, signatures and other process memory. Reserving one growth allocation does not establish a long-walk memory guarantee.

## Supported findings and unresolved causes

The experiment supports changing the information available to contact decisions before investing in further throughput work as a remedy for this stall. Faster execution of these same evaluations cannot make their bounds more informative. This is a practical finding about the tested configuration, not a proof that the underlying problem or every refinement method is unsolvable.

Claude independently accepts the narrow failed contact gate in review `20261028T210433Z-dfe6d6`. However, that response also attributes unknown anchors to nonescaping centres and describes further refinement as futile. **The owner does not adopt that causal claim.** In `h1c_provider_fs.py`, `c0_unknown` counts failure of a padded point-disc Taylor enclosure. The enclosure can fail through derivative/remainder bounds and rounding sensitivity; the counter does not establish membership in the Mandelbrot set. Failure to escape within a finite iteration limit would not establish membership either.

Earlier FD1 evidence already shows sensitivity to the enclosure's error budget. On 307,719 failed gchild main enclosures, production anchors succeed 19,719 times. Removing the point radius diagnostically yields 47,702 successes; removing per-step padding yields 41,900. Those are totals, or net increases of 27,983 and 22,181. They do not authorize removing padding, establish arithmetic soundness or promise more definitive contact decisions. FD1 used an earlier workload and does not classify every additional BS1 cell. Repeating its broad diagnosis would add little.

Still unresolved: which changed evidence method can decide the frozen blocking contact questions; the inherited top-level `undetermined` label hiding component budget failures; A4's arithmetic assumption; the ball-arithmetic oracle; compiled integration; and product/live acceptance. BS1 deliberately prioritized the retained workflow's movement test over general stop-reason plumbing. Typed provider diagnostics were added to the candidate, but the authoriser's hidden-budget label was not repaired.

## Decision and next discriminating test

Stop treating additional scheduling or compilation as the proposed solution to this particular stall. Preserve the useful components and the failed experiment. No product source was changed.

The owner and challenger wrote independent positions before sharing them. The owner's proposed finite-resolution local collision representation and the challenger's proposed stronger numerical evidence are untested options. A replacement has not been chosen, and the challenger's causal inference above needs correction before it guides such a choice.

The closure initially proposed selecting another unresolved contact question from the saved frame. Subsequent advisor discussion corrected that scope: preparing a region should produce both visible geometry and a reusable collision representation, with finer regions prepared ahead of the observer. Navigation should consume that preparation. The [prepared-regions feasibility plan](../../superpowers/plans/2026-10-28-prepared-regions-feasibility-plan.md) supersedes the proposed cell-question experiment. It tests construction cost and geometry fidelity as well as inexpensive movement and safe detail transitions. Any approximation, work limit and unresolved outcome remains explicit; product acceptance requirements are unchanged. No new prototype was started during closure or planning.

## Evidence, review and process cost

Artifacts are under `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/scheduling-r0/`:

- `card-r0.md`, `card-amendment-r1.md`, `headroom-amendment-r2.md`: frozen scope, useful-progress criterion and memory revision.
- `provider_guard_r0.py`, `provider_guard_effective_r0.py`, `slot_guard_tests_r0.*`: reusable correctness correction and tests.
- `provider_liveness_r0.py`, `provider_liveness_r1.py`, `liveness_probes_r0.*` through `liveness_probes_r2.*`: preserved scheduling revisions and local capability checks.
- `contact_guard_r0.*`, `contact_live_r1.*` and their `_log`, `_journal`, `_proof`, `_manifest`, `_memo` and `_evidence` artifacts: the single matched pair, source hashes and preserved observations.
- `analysis-r0.json`, `new-evidence-audit-r0.json`, `closure-r0.json`, `artifact-sha256-r0.json`: comparison, information audit and closure provenance.

Claude's card review `20261028T203807Z-1d9fd8` sharpened the blocker attribution and useful-progress criterion. Implementation review `20261028T205312Z-77c2e3` prompted the growth-headroom requirement before the candidate walk. The closure review above accepts the numerical failure and resource-limit distinction. An additional reconciliation message was prepared but automatic approval review rejected sending its BS1 payload externally as outside the earlier ID1 approval. It was not sent; the source-based causal correction is the owner's checked finding, not a new peer consensus. Sent exchanges remain verbatim in the canonical scratch log and its repository archive.

Engineering began at 20:46:33 UTC with a 45-minute bound. The experiment and review reached their decisive result by about 21:06 UTC; evidence reconciliation and closure documentation finished within the bound. Both contact processes exited successfully within their 300-second limits. Focused probes, the matched contact comparison and independent challenge were useful: they separated a real scheduling capability from a failed movement remedy and caught both a memory limitation and an overclaim about cause. No contact rerun sought a cleaner verdict. All eight checkpoint baseline source hashes and both measured source manifests match at closure. Known owned workload and bridge sessions have exited. No browser/GPU run, commit or push occurred.
