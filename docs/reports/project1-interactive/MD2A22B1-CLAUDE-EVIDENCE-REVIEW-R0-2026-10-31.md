# Independent B1 evidence review r0

Run `20261031T194159Z-8fa0d7`. Read-only source/preserved-run review; no execution. Supports a scoped PR after wording corrections. Owner subsequently disproved the review's universal claim of identical frame-summation arithmetic with a bounded counterexample: Python compensated sum differed from JS left-to-right addition at1e-12. That statement is not adopted. The exact counterexample, narrow fix, preserved r0/r1 evidence and focused follow-up review are recorded in the [scorecard](MD2A22B1-RECURSIVE-INPUTS-2026-10-31.md).

I'm finishing a source-level review of the B1 code and evidence, then I'll give the verdict.

# Independent evidence review of MD2.A2.2b B1 (read-only; nothing was run or edited)

**Verdict: ready for a scoped PR once the report wording is corrected; no code repair is needed.** I found no correctness bug that changes any C1–C6 verdict. I reached that by reading the source and checking the logic, not by re-running anything. The C2 wording overstates what the independent check covers on two points, listed under required corrections.

## What I actually read
- **In full:**
  - the report, spec and card;
  - `recursive_recipe.py`, `check-recursive-inputs.py`, `source_recipe.py` (new), `recursive-recipe.js`, `generation-contract.mjs`;
  - `examples/regression-recursive.json`;
  - `pert.py`;
  - `evidence/contracts-r0/contract.json`;
  - `baseline-vs-git.json`.
- **In part:**
  - `create-parent.py`: lines 96–135, plus a search of its imports and policy calls.
  - `suites.manifest.json`: the generation-contract entry.
  - `supervise.mjs`: searched for its process-group cleanup.
  - `generation-runtime-baseline.json`: searched for key runtime, certificate and input files.
  - `units-all-r0.log`: the summary (1383 pass, 0 fail, 90 files).
  - `fkern.py`: defaults only.
- **Carried from earlier rounds:** I read `sampling_r0.py`, `h1lib.py`, `descendant_world.py`, `dek.py`, the JSON inputs and the original `create-parent.py` in round 0. The source bindings and baseline hashes here equal the hashes recorded then.
- **Not read:**
  - the unit test files' contents, the 90-entry corpus JSON itself, and the RED and build logs;
  - `source-adapter.mjs`, `config.mjs` and `source-bundle.mjs`;
  - the README;
  - the rest of the frozen A/B control bundles.

## Criterion by criterion
- **C1 — pass.**
  - JS and Python enforce the same key sets, decimal grammar and budgets, frame tolerance, ordered lineage, composition order and descendant rules.
  - Frame checks evaluate the dot products in the same order and use correctly rounded square roots in both languages, so their verdicts agree bit for bit.
  - The corpus covers both frame orientations, integral-float shapes and the rejection cases.
- **C2 — pass within scope, with the wording corrections below.**
  - The reference really is separate from the recipe. It reads constants with a whitelisted AST evaluator, which handles `dek`'s tuple assignment with `0.0016/2048` and `descendant_world`'s negative-literal tuple. It reads `construction.json`, `frame.json` and the `levels.json` seed directly, and takes the parent's `o` from the NPZ. Component order comes from `sampling_r0`'s `for k in ('K1','K2')` loop.
  - The bit comparisons look sound. Dict comparison ignores key order; floats are compared as packed bits; an integer/float type mismatch would be caught, not passed silently.
  - **Hard-coded in the checker:** how values map into the parent component (F=o, H=H0, A=A0, L=L0, C=seed) and the choice of gchild as the descendant's parent. I checked both against the source myself (`sampling_r0` lines 23–28, `descendant_world` lines 8 and 31–32), and they are correct.
- **C3 — pass.**
  - The stdlib ZIP/NPY reader and the NumPy descriptors agree. All 10 tamper and malformed-file cases are real: equal-length header edits, a valid transport hash so parsing is actually exercised, and a symlink that resolves outside the input directory.
  - Duplicate ZIP members are caught by the sorted-name equality check.
  - The recorded counts (343,902 NaN, about 28.6% of `t0`) are honestly kept as unknown.
- **C4 — pass.** Python's `integral()` rejects bools and NaN and copies the input before normalising. `parse_float` rejects `1e400`; huge integers reject on range, matching JS returning Infinity. Duplicate keys are correctly left outside the parity claim.
- **C5 — pass.**
  - I worked through the logic: the helper's precedence (failed if any status 4, foreign status or non-finite resolved sample; else unresolved if any status 0 or non-finite; else resolved) is equivalent to the original inline `good`/`failed` expressions.
  - The checker's oracle is a faithful copy of those original lines from round 0.
  - The producer's summary inputs and the height arithmetic, including positive-zero normalisation, are unchanged.
  - Minor: the loop at `check-recursive-inputs.py:203` ignores its loop variables (it just repeats one hand-made summary). This is harmless because the 1,110-case enumeration already covers every summary combination the helper can see.
- **C6 — pass.** The baseline includes the native worker and adapters, `base.npz`, `legacy-world.json`, both certificates, the parent-reference NPZ/JSON, the builders and the import manifest. The certificate check confirms that neither `create-parent.py` nor `source_recipe.py` is a certificate source.
- **C7 — pass pending this review.** The harness runs the child in its own detached process group, cleanup is confirmed by group signal, failure exits classify honestly, and a missing interpreter fails.

## Required corrections (report/spec wording only)
1. **Evaluator precision isn't stated, and the field labels could be read as binary64 evaluation.** `pert.py` shows the main GPU path is:
   - float32 perturbation with rebasing;
   - a float32-cast reference orbit;
   - an escape test against `float32(1e12)`, not exactly 1e12;
   - a single run to `max(131072, 4·32768)` iterations.

   `fkern` (binary64) is only the fallback. "Initial 32768 / recheck 131072" describes `h1lib`'s CPU semantics; the GPU's equivalence to it is asserted in source comments and was not checked. Say this explicitly in the report. The source hash, not the label, is what binds the arithmetic.

   Adding an `evaluatorPrecision` field is optional. It would change the recipe key, so the corpus keys would need regenerating and the harness rerun.
2. **C2 scope.** Several values are bound only by source hash and not checked by the AST reference:
   - the interior margin 1e‑9;
   - the 131072 recheck;
   - the `pert`/`fkern` default arguments;
   - the escape threshold in `pert`/`fkern` (only `dek.R` is checked).

   Two more things are fixed in the checker rather than extracted from source: the expected lineage list and the component mapping. The lineage is newly authored.
3. **State that the recipe binds the *adapted* native files.** `legacy-world.json` binds the originals instead. Because the adapted files include path-relocation edits, the recipe key will change on any non-mathematical edit to those six files.
4. **Document `ATLAS_REFERENCE_PYTHON` for gate operators.** I only found it in the spec, card, report, `SOURCE-RECIPES.md` and the harness. Without it in the README or a gate preflight, the next 30-entry gate fails, correctly but for a mechanical reason.

## Optional and nonblocking
- Set the harness's internal deadline below the suite's 60 s timeout. Right now they are equal; both outcomes classify as incomplete, so nothing is misreported.
- The import scan covers only `src/` and `scripts/preparation`. The 194-file byte baseline is the stronger guarantee and should be cited as the primary check.
- `recursive-recipe.js` sits under `src/` and will be copied into `dist`. It's inert, but say so.

## What I couldn't check independently
- Actual execution or timings, and any file hash computed from bytes.
- The list of the 194 baseline files compared against git.
- The contents of the 53 + 37 corpus cases, beyond their ids and verdicts in `contract.json`.
- The unit test contents, the RED-then-green sequence, and the build output.
- The source certificate's file list in `source-adapter.mjs`.
- Whether any other Python caller depends on `source_recipe.validate` returning the same object; it now returns a deep copy.
- How the GPU path behaves at runtime (B2).
