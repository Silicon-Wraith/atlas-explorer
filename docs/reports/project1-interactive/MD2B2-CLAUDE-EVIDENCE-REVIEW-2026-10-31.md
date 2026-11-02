# B2 independent decisive evidence review

Run `20261101T005527Z-257704`; read-only. Supports the scoped PR with no correctness blocker. The recommended maintained fixture-hash pin was added and its seven guarded tests pass; requested wording corrections were adopted. No additional GPU run requested or performed. Exact read limits follow verbatim.

# Independent evidence review of the B2 implementation, source pinned at `69298ce` (read-only; nothing run, hashed or edited)

**Verdict: ready for the scoped PR.** I found no correctness bug and no blocker. All C1–C9 verdicts are supported within their stated limits. One maintained-test gap is worth a small fix before or with the PR, plus four wording points. Nothing below needs another GPU or gate run.

## Criterion by criterion

### C1 — intake before CUDA: pass
- `generation_paths.validate_inputs()` runs these checks in order:
  1. original sources plus the listed edits;
  2. `newModules` hashes, which now cover `generation_paths`, `recipe_inputs`, `recursive_recipe` and `source_recipe`;
  3. all registered inputs, including `recursive-recipe.json`;
  4. the six legacy assets against the originals;
  5. finally `load_for_legacy`.
- `load_for_legacy` checks all five alias fields, recomputes the legacy FNV definition key in Python, and checks the recipe key. It requires the IDs to be exactly `[parent, child, gchild]` with a single descendant parented on `gchild`. It verifies parent integrity and the source bindings, and requires the projection digest to equal `LEGACY_PROJECTION`.
- `check_intake` runs one valid case and seven negative ones, each in a fresh interpreter with an audit hook against CuPy and native-module imports. The negatives are: missing recipe, transport tamper, a changed amplitude with every hash recomputed, a renamed parent with every hash recomputed, a foreign alias, a changed parent, and a recomputed source-binding mismatch.
- I checked how the cases are built. The "rehashed" ones genuinely update the manifest's transport hash and recipe key, so they reach the projection and name checks rather than failing early.
- `recipe_inputs` also refuses `recursive_recipe`/`source_recipe` modules that resolve from anywhere other than the generation root.

### C2 — actual parameters, unchanged mathematics: pass
- `sampling_r0` now builds `COMPONENTS` from `component_inputs()` and converts the frames to NumPy arrays before `REFS`. `validate_residual(H)` runs first and compares `h1lib`'s O/UA/VA/NRM/CS/A0/L0/H0, U and N0, plus `dek.R`, through the shared serializer.
- `descendant_world` takes A0/B0/HALF/AMPLITUDE/RATIO from the recipe. `check_intake` confirms by AST that none of these is a literal any more and that `COMPONENTS` is assigned before `REFS`.
- The worker's `actual_binding(W.S, W)` reads the real loaded `COMPONENTS` and the descendant module's attributes, including `K2['name']`. `generation-ownership` then checks `nativeInputs` deep-equals the frozen B1-r1 bits and that the digest matches.
- The CPU checker now reads its AST reference from `provenance/original/*`. It confirms that `projection_bits` agrees with its independent packing and with the frozen file.
- **Serializer:** it checks `isinstance(float)` (which covers `np.float64`), `.tolist()` for arrays and NumPy scalars, and `complex`. It is type-sensitive, so 64 and 64.0 differ, which is correct.

### C3 — identity and data: pass
- `legacy-world.json` is unchanged and validated against its original assets.
- The Node adapter re-asserts the manifest binding, requires `actualProjectionDigest === projectionDigest`, and requires `legacyDefinitionKey === world.definitionKey`, which JS computes independently. That cross-checks Python's FNV implementation.
- The CPU contract keeps the immutable list: all of `provenance/*`, `regression-world/*` except the certificate, and the four kernel files.

### C4 — actual GPU geometry and order: pass
The suite and the migration record show the five rows with byte-exact buffers, plus reset/reorder, reuse, rebuild and a stale producer. The gold file is unchanged.

### C5 — source qualification: pass
- The test's copy of the old certificate (`pr27-native-policy-certificate.json`) has the same `sourcesKey` (`fnv1a64:13ad585e…`) as the original, and it is refused.
- The new certificate (`fnv1a64:a927f8d8…`) keeps exactly the same sampling policies and specimen counts (3, 1, 1).
- `owned_provenance` now admits only modules under `native/` or listed in `newModules`, and skips `__main__`, which the worker records itself.

### C6 — CUDA status behaviour: pass
- The direct probe returned distance `29017315.477048438`, which equals 2e6·ln(2e6). Iterations were [−2, 1, −1, −1].
- The 50-digit check is independent of the code under test. It reimplements the recurrence and the interior test in mpmath, and maps grid coordinates the same way as the creator (rows decrease the imaginary part).
- For the overflow cells it asserts both that the point escapes mathematically and that a² overflows in binary64.
- For the escaped mixed sample it checks the iteration count, the distance against rel 1e‑10 + abs 1e‑12, and that height equals −distance.
- The plateau wording is now honest. `gpuInteriorMask: true` is a fixed label in the probe output, not a measurement; it is still true by the construction of `fdser`.

### C7 — pre-change saved place: pass
- The headed test asserts the schema, world ID and definition key.
- It asserts the camera and requested scene deep-equal the file, and that the re-export string equals the file's bytes.
- The recorded `sourceSha256` is `907f4037…`, which equals the provenance record.

### C8 and C9: pass
- `gate.json` shows commit `69298ce`, and every required state is `passed`.
- Cleanup and bounds are as reported; C9 is pending only this review.

## Recommended fix (small, nonblocking)
- **Pin the old saved place's bytes in a maintained test.** Neither `space-prepared-files.mjs` nor `generation-config.test.js` asserts the SHA of `tests/reference/legacy-prepared-place.json` against `legacy-place-provenance.json`. The CPU contract's immutable list doesn't cover it either.
- This decisive run recorded `907f4037…`, so B2's evidence stands. But a future edit to the fixture would let the "pre-change file" claim pass silently. One line, asserting the SHA against the provenance record in the unit test or the headed suite, closes it.

## Wording corrections
1. **C2 "actual loaded native attributes":** in `actual_binding`, the components, U, N0 and descendants are read from the loaded modules, but `lineage` and `composition` come from the recipe. Those two are authored metadata that the old runtime never had. Say so.
2. **"browser src byte-identical to PR27":** no maintained check enforces this. B1's `src/` import scan was removed, and the CPU contract freezes only mathematical and representation files. It rests on the owner's source diff plus the full gate, which matches the spec. Label it that way.
3. **The CPU contract's recorded `changed` hash list (line 74) is still B1's.** It leaves out `recipe_inputs.py`, `generation_paths.py`, the two edited native files, the manifest, the certificate, the worker and the adapter. This is evidence only. Either update it, or state that the B2 hashes live in the evidence record.
4. **`sampling_r0` still reads `CON`/`construction.json` but no longer uses it.** It's harmless and keeps the file in the provenance read set. If that's intentional, say so; otherwise it looks like a value source.

## Screenshots, reviewed as restoration evidence only
- `legacy-restored-place.png` shows the rich recursive landscape at scale 1, with fractal ridges and spirals, and the "Landscape scene saved." toast after the re-export download. That is consistent with the old place being restored.
- `fine-inspection.png` shows a close-up surface at scale 0.25.
- Neither is used as an aesthetic criterion, and neither demonstrates new formations.

## What I read
- **In full:**
  - the B2 report;
  - `recipe_inputs.py`, `generation_paths.py`, `check_recipe_intake.py`;
  - `md2b2-check-status.py`, `md2b2-gpu-status.py`;
  - `legacy-recursive-projection.json`, both certificates, `legacy-place-provenance.json`;
  - the evidence files `native-summary.json`, `native/status-controls.json`, `native/direct.json`, `native/status-reference.json`;
  - both screenshots.
- **In part:**
  - `sampling_r0.py` lines 1–40 and `descendant_world.py` lines 1–20;
  - `check-recursive-inputs.py` lines 118–162;
  - `generation-contract.mjs` lines 48–74;
  - `space-prepared-files.mjs` lines 70–89;
  - plus targeted searches of `native-worker.py`, `native-adapter.mjs`, `import-manifest.json`, `recursive_recipe.py` (the serializer), `generation-ownership.mjs`, `migration.json`, `gate.json`, `files-detail.json`, `generation-config.test.js`, the legacy fixture and `generation-runtime-baseline.json`.
- **Not read:**
  - the evidence JSON and `facts.json`;
  - `performance-extract.json`, `standing-metrics.json`, `source-metrics.json`, `cleanup-audit.json`;
  - `cpu-contract.json`/`cpu-results.json`, `qualification.json`, the full gate and preflight logs;
  - `application-report.json`/`files-report.json`, the units/build/RED logs and the import-check logs;
  - `pc2-qualify.py` and its input script, `scene-adapter.js`, `contract.js`, `config.mjs`, the READMEs, and the spec/card/plan copies.

## Limits
- I didn't recompute any hash or rerun anything.
- I take the performance figures, the cleanup audit (129 PIDs, ports, lock) and the 5195 retirement from the report, without opening their records.
- I couldn't verify card correction 6: the search for consumers of the component keys the projection drops. Byte equality on the five rows covers every path those rows exercise, not unexercised regions.
- These results hold for one host, its driver and these package versions only. Nothing here establishes CPU/GPU numerical equivalence, the perturbation path's status-2 promotion, global collision or error bounds, or anything about B3.
