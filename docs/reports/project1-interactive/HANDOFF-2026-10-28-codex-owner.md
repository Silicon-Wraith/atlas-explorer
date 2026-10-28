# Handoff: Codex as owner/orchestrator, Claude as reviewer/challenger (2026-10-28)

**From:** Claude, owner up to now. **To:** Codex, the new owner/orchestrator. **Advisor:** holds the product vision and merges PRs.

The advisor is switching roles so they can see each peer's strengths and weaknesses in the other seat.
- **Codex** now owns the engineering initiative: it designs, builds, measures, decides reversible choices, writes cards and notes, reports milestones to the advisor, and drives the work.
- **Claude** is the challenger: it looks for the flaw or the simpler path, checks the decisive evidence independently, and gives positions on consequential choices.

The collaboration protocol in `AGENTS.md` / `CLAUDE.md` still applies in full, with the roles swapped.

Read this whole file before acting, then the tail of `gpu/clock.md`. All paths are under `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/` unless absolute.

---

## 1. What we are trying to do
- **North Star:** "make mathematics somewhere you can go".
- **The experience at stake:** a visitor moves through a 2D-zoom-derived world (fixtures H, N, G), and the world answers spatial queries interactively:
  - **entry:** can I move here?
  - **contact:** am I touching solid?
  - **edge:** where is the boundary?
- **The blocked queries are H_contact and H_edge.** They must be certified under stated assumptions within an interactive budget.
- **Standing advisor rules:**
  - Uncertainty is never geometry (unknown never becomes solid).
  - H stays in scope.
  - No fixed-millimetre cutoffs.
  - Claims are "certified under stated assumptions".
  - Reply to advisor points (agree / differ / plan) before acting.
  - Proportional process.
- **Advisor decisions already made:**
  - **f32 perturbation is the standard evaluator** (`ia/decision-f32-perturbation.md`). Float64 is kept as the bitwise reference only. ATLAS targets far deeper zoom than the current fixtures.
  - **Store E** (hash-free pointer quadtree) was chosen and is performant.
  - **Order of work:**
    1. **LO1 loop optimisation** (current).
    2. **The integrated-workflow limit-check fix.**
    3. **The compiled evaluator in the integrated provider.**
    4. **The live run.** It must use the **integrated** workflow, not drop-in.

    Items 2–4 are fully specified in `NEXT-integrated-live.md`.

## 2. Current initiative: LO1 (card `ia/card-lo1.md` r1; r0 preserved)
The advisor named three levers as sound or worth evaluating:
- **L1:** children start from the parent's checkpoint;
- **L2:** run the anchor only when its bound can still decide something;
- **L3:** starting-level prediction from one cheap calculation.

The build order follows Codex's own review (run `20261028T165125Z-d231`):
1. lazy anchor plus fused orbit;
2. the contained pre-escape restart;
3. the L3 hint.

### Status
| Step | State | Evidence |
|---|---|---|
| T0 offline measurement | done | `rc1/lo1_t0.py` → `lo1_t0.json/.out` |
| **Step 1:** fused main/anchor pass + rigorous lazy anchor | **built, passes my equivalence gates, NOT yet independently reviewed** | `rc1/ev_nb2.py`, `dec_nb2.py`, `h1c_provider_nb2.py`; harness `lo1_s1_equiv.py` → `.json/.out` |
| **Step 2:** L1 contained restart | designed (card r1 + Codex repairs); not built | — |
| **Step 3:** L3 hint | measured offline only | T0 |

### Step 1 results (no deadline, against Layer 2)
- **Identical** moves, decision sequences, evaluations and visits on H_entry, H_contact, H_edge and N_entry.
- After `promote_all()`, the store is bitwise equal to Layer 2's.
- Fused kernel == separate kernels bitwise on every cell.
- **Orbit loop steps:**
  - H_contact: 199.06M → 109.01M (−45%);
  - H_edge: 8.47M → 6.41M (−24%).
- Wall time (secondary, one run): H_contact 9.46 → 5.19 s.
- **Fusion is the gain.** The lazy rule defers few anchors (H_edge 922, of which 464 were later promoted).
- **The new owner should review step 1 before building on it.** Claude wrote both the code and its checks. Points to look at:
  - the `t_hi ≥ 1` branch of the lazy rule (from Codex's own review);
  - promotion semantics: tighten `lo`, re-summarise `lb`/`hb`, advance `gen`;
  - the `ANC` flag arrays, keyed by `id(level)` and cleared in `FC.clear`;
  - whether `lo1_s1_equiv.py` tests what it claims.

### T0 findings to carry (deterministic iteration counts; T0 used the production child radius, not the repaired P′)
- **L1 checkpoint:**
  - H_edge at τ = 2^-10 saves 53.6% of iterations (12 of 33,621 ok cells lost; width +0.19% median).
  - **H_contact only 3.4%:** 291,692 of 363,671 children get no checkpoint. The remainders there are rounding-dominated, so the geometric criterion rejects them.
  - Candidate fix: apply the criterion to the geometric part of the remainder only.
- **L2:**
  - The rigorous skip removes 8.8% of anchor iterations on H_edge and 0.6% on H_contact.
  - The estimate-based skip removes 68% on H_edge with 1 missed shortcut out of 2,066 decisive cells.
- **L3:** `P* = |d|/|e|` at main exit never predicted finer than the first Taylor-ok descendant (typically 1–2 levels conservative). Skippable failed work is estimated at 18% (H_edge) and 27% (H_contact), unmeasured in the walk.
- **Codex's experiment corrections still to apply:**
  - Log evidence-creation order and per-query thresholds. Final stores cannot establish checkpoint availability or decisive skips.
  - L3 estimates must include unresolved descendants and the cost of extra cells.

### Open design conflict found after step 1 (first thing for step 2)
- After an L1 restart, the child's orbit is no longer its own centre orbit; it inherits the parent's remainders. So the anchor **cannot ride on it** (Codex said the same).
- A restarted child that fails then needs a separate full-length anchor run, which gives back the fusion savings.
- On H_edge (31% of cells fail) the restart probably still wins. On H_contact (88% fail) it may lose.
- **Proposed next measurement** (offline, deterministic): net steps including anchors, for three policies:
  1. restart all cells;
  2. restart only where the anchor won't be needed;
  3. restart only when the parent's failure suggests the child will succeed.

  Also test the geometric-only criterion in the same run.

### Step 2 requirements (card r1, from Codex's review)
- Checkpoint only before the parent's first step with Ahi > R. Only NMAX − k* steps remain.
- Recentring error from operand-based bounds (γ3 · Σ|terms| for the FMA multiply-add). Add |b|ε_δ and |e|ε_δ if δ is not exact. Check Sterbenz per component, signs included.
- Containment by two checked inequalities, with fallback to a from-scratch run:
  - P′ = down(P_p − upper|δ|);
  - P′ ≥ upper(|U| s_c/√2 + err_c), with err_c = upper√(ε_x² + ε_y²), ε = γ2(|C| + |U q|);
  - precondition: exact dyadic q.
- Test chained restarts. Compare against a fresh run at the same P′.
- Validity oracle: mpmath 1.3.0 is in the venv (python-flint is not installed). Use ≥ 20k samples, including the hardest gchild cells. **Any violation blocks.**

## 3. Evidence state (three tiers)

### Established (gated, reproduced, or both)
- **Layer 1:** `rc1/ev_nb.py` is bitwise identical to NumPy E1b on finite valid inputs in this environment. NumPy 2.4.2 on X86_V3 uses SIMD kernels (FMA complex multiply, its own complex abs); these are reproduced via an `llvm.fma` intrinsic.
- **Layer 2:** `rc1/dec_nb.py` + `h1c_provider_nb.py` are decision-equivalent to the Python decide (r3 gates). The one stated deviation is libm `tanh` in Koebe, covered by the 1e-12 outward factor.
- **FD1** (Codex confirmed the counts by a 300-cell bitwise replay):
  - H_contact: 321,224 of 363,691 cells Taylor-failed; 288,610 end unbounded.
  - 91.88% of main + anchor Taylor iterations belong to cells ending unbounded.
- **ED1:**
  - Integrated workflow +21.36% evaluations without a deadline (34,722 → 42,139); 0 duplicates.
  - With no visit allowance: 11.47% fewer (186,454 → 165,063).
- **LO1 step 1:** equivalent, by the gates above. Not independently reviewed.

### Supported (plausible, not established)
- Main-disc failures are geometric **within this enclosure method** (PAD=0 + geometric radius recovers 1).
- Anchor failures come from the float64 enclosure's error budget. Removing either source alone recovers about 10% / 8% net.
- The ED1 gap is dominated by the prospective allowance check: `h1c_provider_hb.py:108` charges all next-level children, `h1c_provider_fs.py:272` only uncached ones. Summaries, own-value tests, placeholder waves and mixed exits also differ, so this is not isolated.
- L1 restart algebra is valid given valid parent inclusions (Codex). The implementation is unbuilt.

### Unresolved
- **A4:** E1b's result-relative padding does not bound cancellation (Codex counterexample). Float64 certification rests on an unproved arithmetic assumption. **This awaits an advisor decision**, as does the Arb/ball-arithmetic oracle proposal.
- Live-deadline behaviour and the stalled H_contact frame (frac 0.235). The deadline is soft.
- Whether f32 perturbation's anchor error (about |δ|·2^-24 plus reference error) beats float64; this depends on reference placement.
- "Bounded ≠ decided": how many decisions precise anchors would unblock.
- Layer 1 narrowed items: signed-zero ties in `_npmin/_npmax`, non-finite promotion, harness rounding of s0 and witness by key.

## 4. Corrections on record (for calibrating Claude's claims)
Claude made these errors this session. All were caught and logged:
- The "111 s vs 1.5 s" comparison used different start frames: invalid.
- "0% vs 23.5%" was a 10 s block cliff.
- "About 32.6k failed cells" was actually 321k; 32.6k was the bounded subset.
- The anchor "recovery" percentages were success totals.
- "Children evaluated ⇒ anchor wasted" over-claimed, because the store is shared.
- "The integrated workflow doesn't charge cached visits" was wrong.

**Rule 6 (verify before relying) applies to everything in this file.**

## 5. Map of files
- **Logs:**
  - `clock.md`: chronological, authoritative.
  - `/mnt/ml_storage/scratch/atlas-codesign/project1-log.md`: every Claude↔Codex message verbatim. Append with `LOG=/mnt/ml_storage/scratch/atlas-codesign/project1-log.md /mnt/ml_storage/scratch/atlas-codesign/log-append.sh "<sender>" "<title>" <file>`.
- **Cards and notes:** `ia/card-lo1.md`, `ia/decision-f32-perturbation.md`, `NEXT-integrated-live.md`, `RESET-2026-10-28.md`.
- **Evaluator / decision layers (`rc1/`):**
  - `ev_nb.py` (L1 reference);
  - `ev_nb2.py` (fused);
  - `dec_nb.py` (L2);
  - `dec_nb2.py` (L2 + lazy anchor);
  - `h1c_provider_hb.py` (baseline S provider, Python);
  - `h1c_provider_nb.py`, `h1c_provider_nb2.py`;
  - `fs1_store_e.py` (store E), `fs_dropin.py`.
- **Integrated workflow (`rc1/`):** `h1c_provider_fs.py`, `fs_live.py`, `authoriser5f.py`; old workflow `authoriser5e.py`.
- **Diagnostics (`rc1/`):** `fd1_diag.py`, `fd1b_anchor.py`, `fd1c_tree.py`, `ed1_demand.py`, `lo1_t0.py`, `lo1_s1_equiv.py`, plus their JSON/out files.
- **Baselines (`rc1/`):** `rt1.json`, `rt2.json`, `rt3.json`.
- **Preserved earlier revisions** use the `_rN` suffix. Never overwrite a preserved result; add a new revision.

## 6. Environment and standing constraints
- **Python / numba:** `/mnt/ml_storage/scratch/venvs/fs1/bin/python` (numba 0.68.1, NumPy 2.4.2 pinned to system, mpmath 1.3.0), with `NUMBA_CACHE_DIR=/mnt/ml_storage/scratch/numba_cache`.
- **Running:** wrap every run in `timeout -s KILL <s>`. CPU-only work needs no lock; GPU or browser runs take `flock /mnt/ml_storage/scratch/atlas-gpu.lock`.
- **Never:**
  - write scratch files outside `/mnt/ml_storage/scratch` (no `/tmp`);
  - modify the host NVIDIA driver, DKMS or packages;
  - disable the browser sandbox;
  - use self-matching `pgrep -f` / `pkill -f` patterns.
- **Git:** commit or push only when asked. The advisor merges PRs to `main`.
- **Bridge artefacts:** `CODEX_BRIDGE_HOME=/mnt/ml_storage/scratch/codex-bridge`. The latest run id is `20261028T165125Z-d231`.
- **Logistics for the advisor to settle:** this work lives in scratch, outside the git repo. A worktree-based bridge `run` cannot write there. The new owner needs write access to `gpu/ia/rc1/` and `gpu/` (cards, `clock.md`) by some launch route, and Claude needs read access for review.

## 7. Suggested first moves for the new owner (owner's call)
1. Review and accept (or repair) LO1 step 1.
2. Run the offline net-cost measurement for the restart and anchor conflict (§2), including the geometric-only criterion.
3. Decide the step 2 policy, build it with the card r1 requirements, and run the oracle.
4. Step 3 (L3 hint) in the walk.
5. Close LO1 with three-tier reporting and process accounting.
6. Proceed with `NEXT-integrated-live.md`.

Claude stands by as challenger: independent checks of decisive evidence, independent positions on consequential choices, and review of cards and code.
