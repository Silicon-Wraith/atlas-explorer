# r2 completion proposal review: conditionally sufficient and proportionate

## Verdict
The proposal is **sufficient and proportionate**, provided the conditions below are met before the run. The original native experiment stays **failed**, and nothing here relabels it.

The four checks that never ran are the 64 high-precision source checks with the A≠B difference, the relocation check, and the three tamper checks. All four are deterministic CPU functions of files that are already SHA-frozen. Running them on the same bytes, with the same checker and the same `verify_bundle`, gives exactly the evidence the original run would have given, except for interpreter and library versions, which must be recorded.

A GPU rerun would add nothing. Same-host determinism is already shown: the rebuilt `height.npy` and `diagnostics.npz` hashes match their originals. A rerun would also produce new data that needs checking again, so it is the weaker choice.

## Reading scope
- **Read in full:**
  - this round's packet: `owner-position.md`, `MD2A21-CARD-AMENDMENT-R2-2026-10-30.md`, `native-r1-experiment.json`, `completion-input-manifest.json`, `native-r1-external-closure.json`;
  - the code it relies on: `scripts/generation/check-parent.py`, `create-parent.py`, `source_recipe.py`, `scripts/experiments/md2a21-generation.mjs`.
- **Not read:** `src/space/generation/source-recipe.js`, `tests/support/source-recipes.mjs`, `scripts/gate/supervise.mjs` (not in the packet), and the CPU interpreter environment.
- **Not checked:** I did not verify any hash, including whether the packet's checker matches `8615d97…`. Nothing was executed or edited.

## What the frozen record already establishes (unchanged by this proposal)
- **Identity and controls:**
  - Python and JS produce the same canonical bytes and keys for all four recipes.
  - The deep case (`"1e-40"`) is valid recipe syntax and is rejected as `unsupported` before CUDA, which is the layering I asked for.
  - The unknown control has all 9 samples at status 0, no definition and no `height.npy`.
- **Rebuilds:** A and B are resolved, with all 4225 samples at status 1. The rebuilds ran B then A, in reverse point order, with chunk size 127. Their `height.npy` and `diagnostics.npz` match byte for byte, and their definitions are identical. As expected, `result.json` and `bundle.json` differ only through pid, elapsed time and provenance.
- **Rounding:** `maxRoundoffFraction` is 2.6e-9 for A and 1.4e-9 for B, consistent with half an ulp divided by the step.
- **Orientation:** the creator's `meshgrid(real, imag)` puts x on columns and z on rows. The checker uses row i → z and column j → x, so they agree.
- **Checker:** it builds c from the recipe strings at 50 digits and never reads creator coordinates. Its point selection is the 4 corners, the centre, the 8 highest-iteration escaped points, then an even spread, which matches my earlier amendment.

## Required conditions before running
1. **Use a separately frozen completion driver.** The current harness can't do this job as written. It requires `ATLAS_GPU_HANDOFF`, runs `mkdir(root)`, re-runs creation and writes `experiment.json` into its root. The completion needs its own small driver or mode, reviewed and hash-frozen before it runs, that:
   - reads `native-r1/` read-only and writes only to a new root;
   - runs `check-parent.py` on `native-r1/A` and `native-r1/B` with the output going to the new root;
   - copies `A/bundle` and runs `create-parent.py --verify` on the copy;
   - applies **exactly** the three mutations in harness lines 66–78: `source.re += '1'` in the request, the same edit inside `definition.recipe` in the result, an XOR on the last byte of the height file, and a rehash of the transport manifest. It must expect the same error pattern (`Request key mismatch|Resolved definition mismatch`).
   
   Adding `ATLAS_REFERENCE_PYTHON` to the normal harness is fine for future runs, but that is separate from this driver.
2. **Probe the exact import set first.** The original run failed on a missing import, and there is no repair allowance now, so remove that failure mode before the run. Using the same interpreter and the same invocation form the driver will use, import only `numpy` and `mpmath`, and resolve `source_recipe` from the script directory. Record the module paths and versions of Python, NumPy and mpmath, and note whether gmpy is present. Evaluate nothing.
   - Don't add `-I`. On Python 3.11 and later, `-I` implies `-P`, which removes the script directory from `sys.path`, so `create-parent.py` could no longer import `source_recipe`.
3. **Check the 120 s budget against the frozen data before the run.** Read the GPU iteration counts for the 64 selected indices from the frozen `diagnostics.npz`. That reveals nothing about the checker's outcome. Project the 50-digit mpmath cost, which also computes `abs()` with a square root on every iteration. If the projection exceeds about half of 120 s, change the budget now, before the run, never after it.
4. **Fix the wording about preserved rows.** The unchanged checker stops at the first failing assertion and writes nothing until the end. So "preserve complete checker rows" only holds on success. On failure, the evidence is the assertion text, which contains the index and both errors. Changing the checker to collect all rows would break "unchanged checker", so change the card's wording instead.
5. **Verify hashes before and after.** Check every manifest entry before and after the run, including `diagnostics.npz`. `check-parent.py` reads it, but it is not bound by the bundle, so the manifest is its only integrity guarantee. Also check the four source files and the original `experiment.json`. Confirm that the checker's in-process record shows `cudaImported: false`.
6. **Label the result honestly.** Report it as "Original A2.1 native experiment: failed (missing reference dependency). Verification completed separately, on identical frozen inputs, in a reviewed CPU-only run." Give the aggregate time (the 4.178 s native run plus the completion and its overhead) and both process misses. A2.1 criteria are met only if every check passes; any failure stops acceptance.

## Things that are not blockers
- **Different interpreter or NumPy version:** loading `.npy`/`.npz` files and mpmath arithmetic don't depend on the platform at the 1e-4 m tolerance. Recording the versions is enough.
- **Is 50 digits enough at the hardest points:** the derivative magnitude at escape is about 1e12, so roughly 38 significant digits remain. That is ample.
- **Effect of rounding c to float64:** the checker uses the exact c, while the GPU used the rounded c. The rounding is about 5e-17 in c, which is about 1e-10 m in D. That is negligible against 1e-4.
- **Re-checking JS/Python identities:** the original run already passed this. Repeating it is harmless, but it isn't needed.

## Where I disagree with the proposal
- **The 120 s bound** needs a check against the data before the run (condition 3).
- **"Complete checker rows"** overstates what an unchanged checker can preserve on failure (condition 4).
- **The completion driver** must be a separately frozen artifact. It must not be the normal harness with an environment variable added (condition 1).

Once these are met, the judgement is complete and the run may proceed.
