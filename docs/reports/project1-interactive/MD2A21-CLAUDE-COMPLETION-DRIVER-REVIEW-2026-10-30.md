# CPU completion driver review: ready to run, no blocker

`complete-cpu-r0.mjs` does what r2 committed to:
- **No creation or GPU work:** it has no `create` call, no GPU handoff and no CuPy.
- **Old data stays read-only:** it reads `native-r1/` and writes only to a new `cpu-completion-r0/`. `mkdir` fails if that directory already exists, so an earlier attempt can't be silently reused.
- **Hashes before and after:** it checks all 34 manifest entries both before and after the run. That covers the data, `diagnostics.npz`, the original `experiment.json` and the sources.
- **Original failure confirmed:** it requires `pass: false` and the mpmath failure text in the original `experiment.json`.
- **Unchanged checker:** it runs `check-parent.py` on the original A/B roots and requires 32 points per case.
- **Exact original tamper mutations:** the relocation step and the three tamper mutations, the transport rehash and the expected error pattern match lines 66–78 of the original harness exactly. I traced all three through `verify_bundle`:
  - the request tamper fails with "Request key mismatch";
  - the result tamper fails with "Resolved definition mismatch";
  - the height tamper flips exponent bit 4 of the last float. Heights near 80 get scaled by 2^16 and stay finite, so the failure is also "Resolved definition mismatch".
- **Failure evidence kept:** on any failure it saves the stack plus the Python stderr, which includes the assertion tuple. It does not claim full rows.

## Checks on the supporting files
- **Probe:** `reference-probe.txt` resolves `source_recipe` by inserting `scripts/generation` into `sys.path`. That reaches the same file `create-parent.py` gets from its own script directory, and the probe confirms the path. Backend is `python`, gmpy is absent, CuPy is not imported. NumPy is 2.4.2 here against 2.5.4 in the GPU venv; that's recorded and doesn't matter at the 1e-4 m tolerance.
- **Budget:** the projection selects the same indices the checker will, with 4552 iterations in total (A has 98 per point, B has 44–45). At 1 ms per iteration plus 15 s that comes to about 20 s, well under 60 s. A realistic mpmath cost is roughly 0.05–0.2 ms per iteration, so the 1 ms figure is conservative.

## Operational conditions (no code change needed)
1. **Hash-check the trust root right before the run.** The driver does not verify `driver-manifest.json` itself. Check the driver, `completion-input-manifest.json` and `reference-probe.txt` against it and record the result. If the input manifest were changed, the `frozen()` check would pass meaninglessly.
2. **Don't let shell variables steer imports.** The driver passes `process.env` through, so either unset `PYTHONPATH`/`PYTHONHOME` or record them. After the run, confirm that `report.referenceEnvironment` matches the frozen probe: same file paths, same versions, `cudaImported: false`.
3. **Do the same external cleanup closure as native-r1.** The driver records owned PIDs, but checking that the host PIDs are gone and the lock is free still has to happen outside it.
4. **Minor:** the original passed `cleanupMs: 5000`, and this driver omits it. `cleanup !== 'unconfirmed'` is still asserted, so this is acceptable. I haven't read the default in `supervise.mjs`, which also sits outside the frozen manifest; it only supervises processes and does no maths.

## A limit to report, not a new gate
In case A, almost every sample takes 98 iterations, so the "8 hardest points" are just tie-broken indices 1–7. In this smooth, pre-screened region, the hardest-point selection adds little. State that in the evidence report; it doesn't change any criterion.

## Proposed future harness (separate, not part of this readiness)
Before it's adopted, it should:
- fail closed when `ATLAS_REFERENCE_PYTHON` is unset, instead of falling back to `python3`;
- probe module paths and `source_recipe` resolution the way this probe does;
- run that probe before the GPU handoff, not after it.

## Reading scope
- **Read in full:** `complete-cpu-r0.mjs`, `reference-probe.txt`, `reference-environment-probe.json`, `completion-budget-projection.json`, `driver-manifest.json`.
- **Partly read:**
  - `proposed-generation-harness.mjs`, by searching for the reference-interpreter, probe, deadline and GPU-handoff lines only;
  - `completion-input-manifest.json`, where I counted 34 entries and assumed it is the same file I reviewed last round.
- **Relied on from earlier rounds:** `check-parent.py`, `create-parent.py`, `source_recipe.py`, the original harness and `native-r1-experiment.json`.
- **Not read:** `supervise.mjs`, `source-recipe.js`, `source-recipes.mjs`.
- **Not checked:** I verified no hashes. Nothing was executed or edited.
