# Resume note: integrated workflow → live run (written 2026-10-28, parked behind loop optimisation LO1)

The advisor's order (2026-10-28):
1. **First:** the loop optimisations (card `ia/card-lo1.md`):
   - children start from the parent's checkpoint;
   - run the anchor only when its bound can still decide something;
   - evaluate starting-level prediction.
2. **Then (this note):**
   - A. the limit-check fix in the integrated provider;
   - B. plug the compiled evaluator (with the LO1 optimisations, if accepted) into the integrated provider;
   - C. the live run.

Do not start A–C before LO1 is closed or the advisor says otherwise. The advisor rejected defaulting the live run to the drop-in workflow: the live run must use the integrated workflow, the architecture we intend to keep.

## Where things live
- **Code:** `/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/`.
- **Logs:** chronological log `gpu/clock.md` (read its tail first). Codex↔Claude log `/mnt/ml_storage/scratch/atlas-codesign/project1-log.md`; append with `LOG=<that file> /mnt/ml_storage/scratch/atlas-codesign/log-append.sh "<sender>" "<title>" <file>`.
- **Codex bridge:**
  - `python3 /mnt/ml_storage/dev/projects/codex-bridge/bin/codex_bridge.py consult|resume --run-id <id>`
  - `CODEX_BRIDGE_HOME=/mnt/ml_storage/scratch/codex-bridge`
  - The latest run id is in the clock.md tail. Before LO1 it was `20261028T050306Z-681e`.
- **Python / numba:** the venv `/mnt/ml_storage/scratch/venvs/fs1/bin/python`, with `NUMBA_CACHE_DIR=/mnt/ml_storage/scratch/numba_cache`. NumPy is 2.4.2, pinned to the system version.
- **Running:** wrap every run in `timeout -s KILL`. Scratch files stay under `/mnt/ml_storage/scratch`. GPU runs take `flock /mnt/ml_storage/scratch/atlas-gpu.lock` (none needed so far: everything is CPU).

## The two workflows
| | Old / drop-in | Integrated |
|---|---|---|
| Provider | `h1c_provider_hb.py` (Python `decide`, dict store) | `h1c_provider_fs.py` |
| Authoriser | `authoriser5e.py` | `authoriser5f.py` (slot handles on box memo) |
| Store and traversal | Compiled drop-in = `h1c_provider_nb.py` + `dec_nb.py` (compiled `decide` over store E arrays via `fs_dropin.py`) | Store E live in `fs_live.py`: placeholders, compiled query waves, continuations, summaries |
| Evaluator | Compiled `ev_nb.py` | Still the **NumPy** `HP.taylor_D` + hb `g_cap`/Koebe, called from `h1c_provider_fs._evaluate` |
| Harness | Equivalence: `ev_nb_equiv.py`, `dec_nb_equiv.py` (r3 gates) | Acceptance runner: `rt2.py` |

Reference (decision-equivalent) layers are `ev_nb.py` (Layer 1: bitwise equal to NumPy E1b) and `dec_nb.py` (Layer 2). `dec_nb._eval_cells` is the pluggable evaluator boundary. Its one stated deviation: libm `tanh` in Koebe, covered by the (1+1e-12) outward factor.

## A. The limit-check fix (cause established by ED1, verified in source)
- **Evidence:**
  - `ed1.json`: H_entry with no deadline. Old 34,722 evaluations; integrated 42,139 (+21%). 0 duplicate evaluations; both reached 34 of 34 frames.
  - `ed1_nowork.json`: with no per-decision visit allowance, old 186,454 against integrated 165,063. The integrated workflow is 11% better when the policy is equal.
  - RT2's live 44.6k = the structural gap + about 2.5k from deadline resumes.
- **Cause:**
  - Old `h1c_provider_hb.py:108` charges `visits + len(nxt) > WORK_CAP` before descending, where `nxt` is **all** prospective next-level children, cached or not.
  - Integrated `h1c_provider_fs.py:272` charges `vis + len(need) > W`, i.e. only **uncached** placeholders. `S.query` (in `fs_live.py`) also walks cached levels with allowance `W - vis` and prunes with summaries.
  - Net effect: coarse (parent-box) decisions run deeper before returning budget. The old workflow returned budget and split the box into capsule-meeting children, which was cheaper. First divergence: call 186 (old: budget, 10 new evaluations; integrated: below, 190).
  - The earlier "parity fix" (`clock.md:146`) did not make this check equivalent.
- **Fix:** inside the compiled query descent (`fs_live._query`), before descending a level, return budget if `vis + (size of next level including cached children) > W`, matching hb:108. An alternative is an explicit evaluation allowance for coarse decisions; choose whichever reproduces the old policy most simply.
  - Make it a new file or variant and preserve the old one, following the `_rN` convention.
  - Also fix `_Live.__len__`: it counts nodes, including placeholders, against FC_CAP. It should count evaluated cells (the same issue as Codex L2 #4 in the drop-in).
- **Test:** rerun ED1 with the variant (`ed1_demand.py`, about 25 s). Expect at most 34,722 evaluations (summaries save some), the same outcomes, and 0 duplicates. Then run H_contact and H_edge demand the same way.

## B. Compiled evaluator into the integrated provider
- Replace NumPy `HP.taylor_D` / `g_cap` / Koebe in `h1c_provider_fs._evaluate` with the compiled evaluator (`ev_nb.taylor_D`, `ev_nb.g_cap`, or `dec_nb._eval_cells`, or its LO1 successor).
- **If only the evaluator is swapped (no LO1 semantic changes):** require bitwise equality on decisions, cells and values against the NumPy integrated provider with no deadline, as `ev_nb_equiv.py` does. Koebe cells may differ only through the stated tanh deviation (`dec_nb_equiv.py` r3 gates: key sets, evaluations, visits, Koebe endpoint == f(own Dup)).
- **If LO1 changes enclosures (checkpoint restarts):** equivalence becomes LO1's acceptance criteria (validity oracle plus decision impact), not bitwise.
- The integrated provider batches through NumPy with fixed per-call cost. Once compiled, batch size no longer matters (cost = Σ iterations); this is the RT2 per-evaluation regression, 103→141 µs.

## C. Live run (needs its own short card)
- **Fixtures:**
  - RT3-style: the six fixtures `rt3.py` uses, N/G regressions included.
  - **The stalled H_contact frame:** the extended run must start at frac 0.235. RT2's extended frames started at frac 0, which made the "111 s vs 1.5 s" comparison invalid.
- **Baselines:** `rt3.json` (dict and drop-in-E rows), `rt1.json`, `rt2.json`. Compare like with like (same start frames, block lengths, request budgets).
- **Report (Codex L2 caveats):**
  - Outcomes; time per frame and p95; and **deadline overshoot**. The deadline is soft: evaluation batches can't be interrupted, and cached-only traversal isn't checked.
  - **Allocated memory**, peak RSS included.
  - Evaluations, visits and iterations. Iterations are deterministic and preferred for attribution.
  - No-deadline decision parity doesn't imply live parity: faster code changes how much work fits before the deadline.
- **Acceptance checks as in RT runs:**
  - f64 falsifier 0;
  - HP falsifier on segments;
  - live-decision proofs: 0 unsupported;
  - store invariants clean.

## State of evidence at parking time
- **FD1** (`fd1.json`, `fd1b.json`, `fd1c.json`; gate passed):
  - H_contact: 321,224 of 363,691 cells Taylor-failed; 288,610 (79%) end unbounded (0,1). About 92% of its 199M iterations yield no information.
  - Main-disc failures are geometric: PAD=0 recovers 1 of 321k.
  - Finest-level (gchild) anchor failures are float64-precision: either rounding source alone breaks about 85%.
  - H_edge: about 25% of iterations go to failed cells that were subdivided anyway; about 32% go to all subdivided cells.
- **Open advisor items:**
  1. Accept A4 as a stated, unresolved risk? E1b's result-relative padding does not bound cancellation (Codex counterexample).
  2. The Arb (ball arithmetic) oracle proposal.
  3. The f32 perturbation card. The advisor decided f32 perturbation is the standard; see `ia/decision-f32-perturbation.md`. It should be designed around reference orbits plus certified iteration skipping, LO1's generalisation.
- **Scope of the Layer 1 equivalence claim:** finite, valid inputs on this environment.
