# Card LO1: loop optimisation of the certified field evaluator (r1, 2026-10-28; r0 preserved as card-lo1_r0.md)

**r1 changes** (Codex review, run 20261028T165125Z-d231; T0 r0 results in clock.md):
- **L1:**
  - (i) Checkpoints only before the parent's first step with Ahi > R. Only NMAX − k* steps remain.
  - (ii) Recentring pads come from operand-based error bounds (γ3 · Σ|input terms| for the FMA complex multiply-add), not pad(a′). Add |b|ε_δ and |e|ε_δ if δ is not exact. Check Sterbenz per component, signs included.
  - (iii) Containment via two checked inequalities: P′ = down(P_p − upper|δ|), and P′ ≥ upper(|U|s_c/√2 + err_c), with err_c = upper√(ε_x² + ε_y²), ε_x = γ2(|C_r| + |U q_x|), ε_y = γ2(|C_i| + |U q_y|), γ2 = 2u/(1−2u), u = 2^-53. Precondition: q_x = s(i+½) and q_y = s(j+½) are exact dyadics. Otherwise restart from zero; never shrink away part of the cell. (Codex: 740 of 1,236 sampled original child discs were NOT contained; the repaired rule covered every one.)
  - (iv) Test chained restarts. Compare against a fresh run at the same P′.
  - (v) Fusion after a restart is neither bitwise nor allowed to discard inherited remainders.
- **L2:**
  - First test whether [0,1] itself already resolves the leaf.
  - The relevant threshold is t_hi if t_hi < 1, and t_lo if t_hi ≥ 1 (with t_hi ≥ 1, [vlo,1] can prove strictly between).
  - Compute the Dup lower bound rounding down and the exp upper bound rounding up.
  - Lazy promotion must tighten stored evidence, update summaries and advance gen. 'Anchor not computed' must never become a permanent unknown.
- **L3:** a scheduling hint only, never a certificate. It needs margins for the remainder test (|e|P + rd < |d|/2) and for orbit-radius/escape. The main pass can fail before the centre escapes.
- **Experiments:** log evidence-creation order and per-query thresholds (final stores cannot establish checkpoint availability or decisive skips). L3 estimates include unresolved descendants and the cost of extra cells. ANY oracle violation blocks validation, even one explained by padding.
- **Build order (Codex preference, adopted):**
  1. Rigorous lazy-anchor skip plus fresh-orbit fusion (anchor and main pass share the child-centre orbit when no restart is involved). Bitwise-checkable.
  2. The contained, pre-escape L1 restart, with oracle.
  3. The L3 hint, measured in the walk.
  The estimate-based anchor skip (strong on H_edge in T0) is an additional measured option on top of 1. It can only lose shortcuts, never correctness.


**Owner:** Claude. **Challenger:** Codex: the rigour of the restart rule, and independent checks of the decisive counts.
**Advisor direction (2026-10-28):** "Children start from the parent's checkpoint is a sound optimization. Run the anchor only when its bound can still decide something is another sound optimization. If the starting level can be calculated with one simple, super fast calculation, [that] is a very interesting optimization. I think it is worth evaluating." This comes before the limit-check fix, the integrated provider and the live run (`gpu/NEXT-integrated-live.md`).

## Experience and limitation
- **Experience:** H_contact and H_edge answered within an interactive budget.
- **Limitation (FD1/FD1c, no deadline, compiled provider):**
  - **H_contact:** about 92% of 199M evaluator iterations yield no information; 79% of cells end unbounded.
  - **H_edge:** about 32% of iterations are spent on cells that get subdivided anyway, and their children rerun the same orbit from z = 0. About 25% of iterations are failed cells whose fallback anchor bound did not end the search.
  - **Shape of the waste:** each cell runs its centre orbit to escape (100–500 steps). The cost is repetition, not the step count.

## The levers

### L1. Children start from the parent's checkpoint
- **E1b state.** At step k, E1b holds a Taylor model over the disc |c − m| ≤ P:
  - z_k(c) ∈ a + b(c − m) + B(rz)
  - d_k(c) ∈ d + e(c − m) + B(rd)
  The recurrences in `ev_nb.taylor_D` (lines 57–63) are valid for **any** state satisfying these inclusions, not only one started at z = 0. b and d have the same recurrence and start, so they are bitwise equal from z = 0; after a restart they differ, and the kernel already keeps both.
- **Restart of a child** with centre m′ and δ = m′ − m:
  - a′ = a + bδ, b′ = b, rz′ = rz + rounding pad;
  - d′ = d + eδ, e′ = e, rd′ = rd + rounding pad;
  - continue from step k with the child radius P′.
  - δ is an exact float64 subtraction when the centres are within a factor 2 (Sterbenz); this has to be checked per component.
- **Containment is required: child disc ⊂ parent disc. The current radii make this fail by about 1 ulp.**
  - Parent radius: cr_p = k0_p + pad_p. Child: cr_c = k0_c + pad_c.
  - k0_p = 2·k0_c and |δ_exact| = k0_c/(1+PAD).
  - The geometric margin is about cell width × 2^-50, far below the ulp-scale rounding of the two computed centres.
  - Proposed rule: restart radius P′ = the largest disc about the computed m′ inside the parent disc, i.e. cr_p − |δ| with downward rounding.
  - The restart also needs a proof that P′ still covers the child cell. The cell lies inside D(m′_computed, k0_c + err_c), where err_c ≤ a stated bound on the centre-formation error (about 1 ulp of |c|). pad_p ≈ 8 ulps gives the slack.
  - **Codex to check this rule and the stated err_c bound.**
- **Checkpoint choice.** Store the state at k* = the last step at which the inherited remainders are negligible against the child's own first-order spread: rz ≤ τ·|b|·P′ and rd ≤ τ·|e|·P′, with τ to be set by T0, e.g. 2^-10.
  - The inherited remainder is about 4× the child's own from-scratch remainder (quadratic in P). So with a small τ, the child's final enclosure is almost unchanged.
- **Storage:** k*, a, b, d, e, rz, rd and P, about 90 B per evaluated cell (about 33 MB for H_contact).
- **Deeper descendants** inherit from the nearest evaluated ancestor with a stored checkpoint, provided its remainders meet τ against their own P.
- **Results are not bitwise identical to from-scratch,** because the enclosures differ. Acceptance is therefore validity plus decision impact (below).

### L2. Run the anchor only when its bound can still decide something
- A Taylor-failed cell gets (vlo, 1) from Koebe-S. It contributes to a decision only by being entirely above: vlo > t_hi. (It can never be "below" or "strictly between", because vhi = 1.)
- **Rigorous skip test (no anchor needed):**
  - Dup ≥ f·fac_min·cr/U, with fac = G/tanh(G/2) ≥ 2 and Dhi0 ≥ 0.
  - If exp(−f·2·cr/U/L) ≤ t_hi, the bound can never decide the cell, so skip the anchor (and g_cap).
  - Skipping only replaces (vlo, 1) with (0, 1) for a cell that will be subdivided anyway.
  - **Store-semantics caveat:** the cell value is cached and reused by later decisions with other thresholds. A skipped anchor therefore has to be stored as "anchor not computed", to be computed lazily if a later decision with a lower t_hi could use it. It must not be stored as (0, 1) for ever.
- **Heuristic skip (optional, measured):** use the main pass's own centre-orbit distance estimate in place of Dhi0. Wrongly skipping costs a missed shortcut, never correctness.
- **Fusion:** where the anchor is needed, it shares the main pass's centre orbit (a, b, d, e are independent of P). One loop carrying two sets of radii gives bitwise identical results, at radius-only cost up to the main pass's exit.

### L3. Starting-level prediction
- The main failure mode is "bad": at the first escaping step, |e|P + rd ≥ |d|. This suggests a success radius P* ≈ |d_K|/|e_K| at escape step K.
- Those quantities are already computed by any evaluation covering the point, such as the parent's centre orbit. One division and a log2 then give the level whose radius is below P*·safety.
- **Use:** a failed cell's children skip straight to the predicted level. The trade-off: a skipped level can no longer prune sub-areas where coarse cells would have succeeded.
- **Measure first** (T0): predicted against actual success level; iterations saved against cells added.

## Smallest test: T0, offline, deterministic, no timings
Use the H_contact and H_edge stores from FD1-style reruns of `h1c_provider_nb`.
1. **L1:**
   - For each evaluated cell whose parent was evaluated: k*(τ) from the parent's trajectory, and the iterations skippable.
   - Re-run each child from the restart.
   - Report: change in ok flags against from-scratch; Dlo/Dhi widening (quantiles); total iterations saved, for τ ∈ {2^-6, 2^-10, 2^-20}.
2. **L2:**
   - The number of failed cells the rigorous test skips; their anchor iterations.
   - How many of the cells it would skip were in fact decisive (vlo > t_hi). This must be 0 by construction; a non-zero count means a bug.
   - The same counts for the heuristic, with its missed shortcuts.
3. **L3:**
   - For each failed cell with evaluated descendants: predicted level against the coarsest level at which its descendants succeeded.
   - Iterations that skipping levels would save, against extra cells evaluated.
   - T0 gives an estimate only; L3's real effect needs the decision walk.

**Validity oracle for L1** (before L1 enters the decision walk): sample points in restarted child discs. Compute the reference orbit and derivative in high precision (mpmath, or Arb if available) to the restart step k and beyond. Check |z_k(c) − a′ − b′(c − m′)| ≤ rz′ (and likewise for d) at each step up to exit. Require 0 violations on ≥ 20k samples (cells × points), including the hardest gchild cells.

## Success criteria
- **T0 → build gate:**
  - L1 saves ≥ 30% of H_edge iterations with ok-flag loss ≤ 0.5%.
  - L2 rigorous skip removes ≥ 10% of anchor iterations, with 0 decisive cells skipped.
  - L3 is kept only if, in T0, predicted skipping saves more iterations than it adds.
  - Each lever passes or fails separately.
- **Build (compiled, in `dec_nb` / `ev_nb` successors; integrated port follows in NEXT B):**
  - The no-deadline harness (`dec_nb_equiv`-style) on H_entry, H_contact, H_edge and N_entry.
  - Outcomes equal, or better with every answer proof-checked.
  - Iterations (deterministic) reduced as T0 predicted, within ±25%.
  - Validity oracle: 0 violations.
  - Report the change in evaluations and decisions.

## Time limit and stop rule
- **Time limit:** T0 1.5 h; build plus checks 4 h.
- **Stop if:**
  - Codex finds the restart rule unsound and no repaired rule exists within one round. L1 then stops; L2 and L3 continue.
  - Any oracle violation that a stated padding defect cannot explain.
  - T0 misses a lever's gate. That lever is recorded as a dead end and the others continue.

## Relation to the f32 perturbation standard
L1 is the certified, per-cell form of the deep-zoom technique (reference orbit plus series or bilinear skipping). The f32 card should design reference orbits and certified skip tables on the same model. LO1 is still built in float64, in the reference evaluator, so that the restart rule and the T0 numbers can be checked against the bitwise reference.
