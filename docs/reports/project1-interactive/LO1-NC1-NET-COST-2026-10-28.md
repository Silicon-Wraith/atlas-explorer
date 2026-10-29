# LO1 Step 2 net-cost experiment — NC1 r1

**Historical experiment definition.** This bounded experiment has now stopped; see [the results and scope limits](LO1-BOUNDED-EXPERIMENTS-2026-10-28.md). The definition below is preserved as written before execution. In particular, its fresh-anchor constraint was a policy choice, not a fundamental restriction on sound inherited anchors.

2026-10-28. Owner Codex; challenger Claude. Status: DEFINED after challenger reconciliation, NOT RUN; no Step 2 implementation authorised by a result yet.

Experience: H_contact and H_edge spatial queries respond sooner without treating uncertainty as solid.
Risk: an inherited main trajectory cannot share the child's fresh-centre anchor; separate anchor work, checkpoint creation, larger remainders, extra cells, or later promotions may erase restart savings.

Baseline and evidence:
- Freeze the repaired Step 1 source hashes and four-request harness. Baseline work includes steps_loop + promote_steps, not steps_loop alone. Layer 2 is a historical reference, not the performance denominator.
- H_contact and H_edge are decisive. H_entry and N_entry are regression controls.
- Capture event order: request, decide, frontier batch, cell creation/read, both thresholds (including th >= 1), lazy usefulness decision, promotion, parent checkpoint availability and exit reason. A checkpoint counts as available only if its producing computation completed before the child event. Never infer availability from final-store ancestry.
- Store all exact inputs, branch decisions, masks, counters, outputs, source hashes, environment, seed, execution bounds and cleanup status. Logs are revisioned; failed attempts remain.

Offline policies (one cell schedule first; no decision-walk integration):
0. Fresh Step 1 fused main/anchor baseline.
1. Restart every eligible child.
2. Restart only if the rigorous lazy predicate says no anchor is useful at that event. If a later threshold needs it, charge the full separate anchor and g_cap then.
3. Restart if the already-observed parent failed by the derivative/mixed-escape test and the child radius P' <= 0.25*|d_exit|/|e_exit|, with finite nonzero denominator. This is a scheduling hypothesis, not a certificate. All other cells use Step 1. No child outcome or future descendant may choose the policy.
- For each policy compare full-remainder versus geometric-only checkpoint selection at tau in {2^-6,2^-10,2^-20}. The geometric-only selector MUST still carry the complete inherited remainder, including arithmetic error, in the restarted state.
- Use only contained, pre-escape states: exact-dyadic cell-coordinate checks, signed per-component Sterbenz or explicit delta error, operand-based recentering pads, P'=down(P_parent-upper|delta|), and checked child-cell coverage including centre-formation error. Any failed check means fresh Step 1.
- Charge parent trajectory/checkpoint production once at its actual event, selection, storage/read cost, and recomputation if a requested checkpoint was not retained. Do not create a free retrospective checkpoint for each child. Compare restarted and fresh main runs at the SAME repaired P', and separately report the production-radius baseline difference.
- Repeated/chained restarts are a distinct validity case. Main and anchor always keep independent error states after restart.

Measurements:
Report an operation vector, not one supposedly equal-cost iteration count:
- shared/fresh/restarted main orbit steps;
- fused anchor radius/test steps, including those spent on main-success cells;
- separate eager and promoted anchor orbit/radius/test steps;
- main radius/test steps, g_cap cell-steps, recenter/checkpoint work, bytes retained/peak allocation, lookups, promotions, and cell demand.
Net orbit work = fresh/shared orbit steps + restarted continuation steps + every separate anchor/promotion orbit step + any checkpoint-producing replay. Report checkpoint arithmetic and allocation separately. Verification-only promote_all is excluded from online cost and reported separately.
Instrumented and uninstrumented output gates precede timing. Same fixed event schedule, process/environment, warm compilation, and alternating A/B, B/A order over three paired repetitions for shortlisted policies; report all samples, median, range and unattributed overhead. No concurrent CPU benchmark. Do not treat a timing difference smaller than run spread as a finding.
A fixed-schedule result is only a local cost estimate. A later actual-walk run must count extra/lost evaluations, decisions, transitions, all anchors, and changes in outcomes; a restart must not get credit for pruning it did not cause.

Gates and decision:
- Retain the existing L1 >=30% H_edge iteration-saving and <=0.5% main-ok-loss screen, but explicitly evaluate the saving against inclusive Step 1 net orbit work (a stricter new denominator). Do not claim overall savings unless the operation vector and warmed elapsed time also improve. Report H_contact separately; choose a conditional policy only if it avoids a measured regression there.
- Stop an offline policy if sound containment/recentering cannot be implemented in the one repair round, or if net work does not pass the screen. No lowering a gate after observing results. H_entry/N_entry and extra-cell/walk effects remain required before acceptance.
- Before any restarted evaluator enters the decision walk, require zero validity violations in >=20,000 high-precision samples, including difficult grandchildren, boundaries and chained restarts, at checkpoint and subsequent steps through exit. Any violation blocks that candidate. mpmath point checks are sampled evidence; they do not discharge A4 or prove an interval method. A rigorous ball oracle remains a separate unresolved direction.
- No f32/product default decision, live performance claim, GPU acceptance or integration is made by NC1.

Bounds and accounting:
Trace/instrumentation gate <=20 min hard limit; each candidate batch <=20 min hard limit; total NC1 engineering/run budget 90 min before a recorded stop/continue decision; at most one 30-min mechanical repair within that budget. Use timeout -s KILL, CPU-only execution, scratch caches/artifacts and confirmed process cleanup. Preserve failures. Report process time, compute time, review overhead, and which checks changed the decision.

## r1 clarifications required by challenger (before any NC1 run)
These definitions refine the r0 clauses above; r0 is preserved.

1. Checkpoint production and retention are fixed. NC1 tests immediate children only. During each parent evaluation, derive the four possible dyadic child centres and containment-repaired radii from the parent's address. Use the minimum P' among geometrically eligible children for that arm's selector; retain one common latest pre-escape checkpoint for those immediate children, never one chosen using an actual future child's outcome. The full parent evaluation completes before its checkpoint becomes available. A child without its immediate parent's retained checkpoint uses fresh Step 1; no retrospective parent recomputation or nearest-ancestor search in NC1. This deliberately narrows the experiment.
All evaluated parents are eligible for retention, irrespective of eventual child success. Use deterministic FIFO insertion order, a 48 MiB checkpoint allocation cap including keys/metadata, and no eviction decisions based on outcomes. Report retained counts and misses. Gate: incremental candidate runtime peak memory <=64 MiB, including checkpoint pool and shadow/scratch arrays; identical bounded trace-output buffers (<=8 MiB) are reported separately for both arms. A memory miss means fresh fallback, not dropped coverage.

2. The anchor comparison explicitly includes the full fresh run started only after a restarted main actually fails. Charge its entire orbit/radius/test path and g_cap, including deferred later promotions. Report the baseline's anchor-radius/test work spent on main-success cells separately. A separate-after-failure arm therefore gets legitimate credit for avoiding that speculative radius work, while never receiving a free inherited anchor.

3. "Geometric-only" means a zero-pad shadow radius recurrence: same computed centre orbit and parent radius P, separate rz_shadow/rd_shadow initialized to zero, recurrence terms as ev_nb.py:59/61 with every radius-padding term omitted. Its cross terms use the shadow radii, not full radii. This is a selector diagnostic, not an exact decomposition of the full error. Charge the shadow radius updates, tests and storage in the candidate cost. The actual restarted enclosure always uses full parent rz/rd and operand-based recentering bounds. No third selector based on guessed child error is added in this experiment.

4. Improvement has fixed numerical meaning. Before running candidate policies, calibrate positive per-unit elapsed-cost weights for orbit updates, radius/test updates, g_cap steps, checkpoint/geometry operations and memory/lookup operations in isolated warmed batches on this same environment. Save weights and calibration samples before candidate results; never refit to a desired winner. This weighted operation score is a scheduling estimate, not a substitute for elapsed time. A shortlisted policy must meet all: >=30% inclusive H_edge orbit reduction, <=0.5% main-ok loss at equal P', >=10% H_edge weighted-cost reduction, and >=10% H_edge warmed median elapsed reduction with non-overlapping observed baseline/candidate ranges. H_contact may increase by at most 2% in both weighted cost and warmed median elapsed time; apply the same 2% limit to H_entry/N_entry controls. The 64 MiB incremental memory gate above also applies. If the operation model and elapsed result disagree, report inconclusive and do not integrate; no retroactive weighting. Calibration overhead is charged to experiment cost. These are stricter screening criteria for a reversible offline prototype, not a product acceptance-policy replacement.
