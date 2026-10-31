# A2.1 decisive-evidence review: ready for a PR, no blocker

A2.1 is ready for a PR as a bounded, offline, parent-only increment. Both failed attempts stay failures. The completion run doesn't relabel either of them, but it does supply the evidence the original run was meant to produce. What remains are wording and follow-up items, listed below.

## Reading scope
- **Read in full:**
  - owner material: `owner-report.md`, `owner-proof.json`, `source-manifest.json`;
  - run results: `cpu-completion.json`, `mathematics.json`, `native-closure.json`, `cpu-closure.json`;
  - code: `src/space/generation/source-recipe.js`, `tests/unit/source-recipe.test.js`, `tests/support/source-recipes.mjs`, `scripts/experiments/md2a21-generation.mjs` (the new harness), `scripts/generation/probe-reference.py`;
  - docs: `scripts/generation/SOURCE-RECIPES.md`, the card, and the r2 amendment.
- **Partly read:** `frozen-inputs.json` (first entries only; its SHA matches the input manifest I already reviewed).
- **Relied on from earlier rounds, with matching manifest hashes:**
  - `check-parent.py` (`8615d97…`), `create-parent.py` (`613c1c2…`), `source_recipe.py` (`25f51fd…`), `fkern.py`;
  - `native-experiment.json` (`78901ad…`, the same original failed run).
- **Not read:**
  - `scripts/generation/examples/parent-source.json`, which `SOURCE-RECIPES.md` references but isn't in the packet;
  - `supervise.mjs`, `shared/scene.js` at the final head, and the 164 production files.
- **Not checked:** the test, build and byte-identity results. I verified no hashes and executed or edited nothing.

## Code and data checks that support the result
- **Evaluation path:** the creator bypasses `fdser`. It passes host-rounded `cr`/`ci` straight to `fdirect` with R² = 1e12, divides D_c by U on the host, computes height as H_ref − slope·(D − D_ref), and writes a positive zero. The checker uses the same formula, but in 50-digit arithmetic from the recipe strings.
- **The size of the errors means the checker is a real test:**
  - Max errors are D 3.19e-11 m and H 6.90e-11 m.
  - That matches the predicted floor: binary64 coordinate rounding (`maxRoundoffFraction` 2.6e-9 × the 0.025 m step ≈ 6e-11 m), times |∇D| of order 1.
  - A row/column swap, a z-sign flip or a half-cell offset would produce errors from centimetres to metres. The four corner points would expose any of them.
  - All 64 classifications agree and all 64 iteration counts agree.
- **Rebuilds and controls:** the rebuilt `height.npy` and `diagnostics.npz` files match byte for byte. The unknown control has 9/9 samples at status 0 and no asset. The deep case is unsupported with no CUDA.
- **Relocation and tamper:** the relocated bundle verifies. The three tamper cases hit the intended code paths: line 33 "Request key mismatch", and line 44 "Resolved definition mismatch" for both the result and height tampers.
- **Completion run conditions met:**
  - Hashes were checked before and after.
  - The driver and its manifest hashes were recorded.
  - The reference environment matches the frozen probe.
  - `PYTHONPATH` and `PYTHONHOME` were unset.
  - Owned PIDs are gone and the lock is free for both runs.
- **The new harness covers my earlier recommendation:**
  - It fails closed when `ATLAS_REFERENCE_PYTHON` is unset.
  - It runs `probe-reference.py` as a script, so `source_recipe` resolves from the script directory, and it asserts the exact file path.
  - The probe runs before the GPU-handoff check and before the root directory is created.
  - It offers a CPU-only `--preflight` mode.
- **Tests:** the 11 new tests plus the 1,357 baseline equal the 1,368 reported, in 87 files, which is consistent. One unit test locks the profile constants table. Deep strings survive without passing through `Number`. Forbidden observer, body, mesh, cache, path and device fields are rejected in JS.

## Claims
**Established, within the stated scope:**
1. **Identity:** for the four frozen recipes, JS and Python produce identical canonical bytes and SHA-256 request keys. Source strings are kept verbatim. `1e-40` is valid recipe syntax and is rejected as unsupported by the numerical preflight before CUDA.
2. **Source-derived grids:** A and B are resolved 65² grids, newly created from the exact strings through owned code with exact rational coordinates rounded once and the no-FMA kernel. 64 of 64 points agree with an independent 50-digit check, about 1e6 times inside the 1e-4 m tolerance. The surfaces are not constant and differ from each other (offset-removed difference 4.66 m).
3. **Repeatability:** on the same host, logical arrays and definitions are exactly reproducible across reverse order and different chunk sizes.
4. **Honest non-results:** unknown samples stay unresolved with no surface. Deep-scale requests are refused, not rounded.
5. **Portability and integrity:** the relocated bundle verifies, and identity tampering is caught even after the transport hashes are recomputed.
6. **Clean completion:** the original data and sources were byte-identical before and after completion, and cleanup was confirmed.

**Supported by the owner's records, not independently checked by me:**
- 1,368 of 1,368 guarded tests and the build pass.
- 164 production files are byte-identical to `9b89e6c`, and no production code imports the new modules.
- The generation, checker and core files at final head `fadee82` are byte-identical to `71ec61a`.
- No fixture was read. This is limited to the Python audit-hook scope; native C file access isn't covered.

**Unresolved or not exercised. These must appear as limits in the PR and report:**
- **Interior and failed statuses:** neither positive case contains a proven-interior sample (status 3) or a failed sample (status 4). The rules "proven interior resolves with D = 0" and "failed grants no surface" are implemented and the profile locks them, but this evidence never exercises them.
- **Python-side rejection is untested:** only the JS codec has negative unit tests. Python was compared only on the four valid recipes. One known asymmetry: `"cells": 64.0` is accepted by JS (`JSON.parse` gives 64) but rejected by Python, which sees a float. That fails closed and can't produce two different identities, but record it, and add Python negative tests in A2.2.
- **Representativeness:** A and B were pre-screened earlier. A's eight "hardest" points are tied at 98 iterations, so they add little. Finite agreement is not a global accuracy claim, not evidence of new features, and not support for arbitrary Plane sources.
- **Out of scope:** cross-platform bitwise reproducibility, the legacy rebuild, recursive or imported closure, preparation and navigation integration, the browser gate, and performance.
- **Process:** the card's one-run, 180 s protocol was not met. The first attempt hit a preflight binding bug, and the repaired run stopped on the missing dependency. Completion came from a separately reviewed CPU run on identical data. Total time is 4.178 s native plus 1.065 s completion, with overhead reported separately.
- **Unreviewed example:** `examples/parent-source.json` hasn't been reviewed. Confirm it is the frozen A recipe, or label it as such.

## Before merging
- **PR text:** the PR description should carry the three claim tiers above, verbatim in substance, including the line "original native experiment: FAILED; verification completed separately on identical frozen data".
- **A2.2 follow-ups:**
  - Python negative-validation tests, with a decision on accepting integral floats.
  - Exercise status 3 and status 4 in a frozen control.
  - Fold the reference preflight into the A2.2 card.
