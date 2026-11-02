# Independent B2 position

Run `20261031T233826Z-23b223`; owner position withheld. Read-only. Source/read limits follow verbatim. Owner adopted the two-edit integration; the bounded status4 control uses explicit finite-coordinate overflow instead of a long-orbit search.

# Independent B2 runtime-integration position (read-only; owner position not opened)

**Position:** B2a should make the native runtime take its component and descendant numbers from the recipe, through an explicit loader. It should keep the old saved-world identity unchanged, and prove the result by exact delivered-buffer bytes on the GPU. The real status 3/4 creator controls (B2b) are a small, separate GPU experiment. The new authored child is its own card (B3), not part of B2.

## What I read
- **In full:**
  - `requirements.md`, `manifest.json`;
  - `native-worker.py`, `native-adapter.mjs`, `config.mjs`;
  - `policy-certificate.json`, `legacy-buffer-controls.json`;
  - `tests/generation-ownership.mjs`.
- **Searched only:** `suites.manifest.json` (entry ids; `generation-ownership` is at line 237), and the B2 lines of the B2 implementation plan.
- **Same hashes as files I read in B1:** `sampling_r0.py`, `h1lib.py`, `descendant_world.py`, `generation_paths.py`, `streaming_builder_r0.py`, `import-manifest.json`, `legacy-world.json`, the recipe example, `recursive_recipe.py` (B1-r1), `check-recursive-inputs.py`, `source_recipe.py`, `create-parent.py`, `generation-contract.mjs`.
- **Not read:**
  - `world_grid.py`, `view_grid.py`, `cache_*`, `builder_view`, `adaptive_graph_pr3`;
  - `pc2-qualification-input.mjs` / `pc2-qualify.py`;
  - `native-controller.mjs`, the app server and launcher;
  - the saved-scene and preparation contract code (`src/space/preparation/contract.js`, scene files);
  - the B2 spec text beyond the plan lines above.

## What the source establishes
1. **A byte-exact GPU control already exists.**
   - `provenance/legacy-buffer-controls.json` holds five rows (home, new-3d, domain-corner, fine-control, view) with the exact delivered buffer SHAs.
   - `generation-ownership.mjs` already rebuilds those rows on the GPU, compares bytes, and checks opposite order, resident reuse, a real rebuild and a stale producer.
   - It also requalifies the certificate through `pc2-qualify.py` and rejects a mismatched certificate.
   - B2's decisive test is that same suite with the recipe as the source of the numbers. No new geometry oracle is needed.
2. **The world identity comes only from `legacy-world.json`.**
   - `validate_inputs()` sends it to the browser as `hello.definition`. It binds the *original* provenance sources, not the adapted ones.
   - The adapter enforces `world.id === 'H1C-surface-child@ee2564d40bda7ef6'`.
   - The same identity and the definition key `fnv1a64:4c29d6f7…` appear in the buffer controls.
   - So saved-place compatibility holds by construction as long as that record stays byte-identical. Changing an adapted native file doesn't touch it.
3. **Any native source change invalidates the certificate.**
   - The certificate key is `fnv1a64` over every owned module, every input read, the worker and the package versions. At runtime the adapter refuses an artifact whose source doesn't match.
   - So consuming the recipe means requalifying through the existing pc2 path, never carrying the old certificate over.
4. **Recipe values are baked in at import time.**
   - `sampling_r0` builds `COMPONENTS` and the reference orbits (`REFS`) when it is imported.
   - `h1lib` builds `T0`, `O` and the frame when it is imported.
   - `descendant_world` reads its constants as module globals.
   - Patching these after import from the worker would be fragile, because the reference orbits are already computed. Substitution has to happen where the values are constructed.
5. **The CUDA-free part of the worker comes first.** The worker imports NumPy and runs `validate_inputs()` before anything that pulls in CuPy. Loading and checking the recipe there gives tamper rejection on CPU before any CUDA import.
6. **The legacy runtime has hard-wired representation dependencies:**
   - the retained parent mesh (`parent-reference-r0.npz`), which the adapter requires for the fine path;
   - a single fixed fine origin (`approach.fine_origin`);
   - grid axes and origin from the legacy grid modules;
   - the hard-coded world ID.

   None of these generalises to a fresh world without new work.

## Smallest decisive slice (B2a)
**Parameter source.**
- Add a new owned module, e.g. `recipe_inputs.py`, registered under `newModules`. It uses the stdlib B1 loader (`load_inputs`: parent integrity, source bindings, projection).
- Register `regression-recursive.json` as a hashed manifest input. Call the loader inside `validate_inputs()`, before CUDA.

**Native edits.**
- Make exactly two listed relocation edits in `import-manifest.json`:
  - `sampling_r0`: build `COMPONENTS` from the projection, converting the frames with `np.asarray`.
  - `descendant_world`: take `A0/B0/HALF/AMPLITUDE/RATIO` from the projection's descendant.
- Leave `h1lib`, `dek`, `pert` and `fkern` byte-unchanged. At startup, fail closed unless the values those files still use equal the projection bit for bit: `H.U`, `H.N0`, `H.O`, `UA/VA/NRM`, `CS`, `A0/L0/H0`, and `dek.R`.
- This keeps one authoritative source for the numbers, with only two edits, and avoids a second, silently diverging copy of the constants.

**Identity.**
- `legacy-world.json` stays byte-identical and remains the scene identity.
- `hello` gains a construction binding `{recipeKey, alias: 'H1C-surface-child@ee2564d40bda7ef6'}`. The worker accepts that alias only for this one recipe key, recorded in a single explicit table. Any other recipe with this ID refuses.
- New worlds later get recipe-derived identities. Never alias a changed geometry.

**Recipe-key churn.**
- The recipe binds the six adapted files, so the two edits change two bindings and therefore the recipe key. Accept a new key under the same `imported-legacy-r1` profile, and record the B1 key as superseded.
- No alias is needed for the B1 key: nothing persisted it, since it had no production consumer.
- There's no hash cycle: the native files read the recipe by path and contain no recipe hash.

**Certificate.** Requalify coarse, fine and view through the existing pc2 path from the new migration rows, and install the new `policy-certificate.json`. The old certificate must be rejected under the new source.

**Simpler alternatives I rejected:**
- *Startup verification only (no substitution):* zero evaluator edits, but the values still flow from the JSON. It adds nothing beyond B1 and doesn't serve the fresh child.
- *Regenerating the JSON inputs from the recipe:* those files carry provenance fields the recipe doesn't hold, so the bytes can't match, and that would break the legacy asset hashes.

## CPU gate amendment (same PR, otherwise B1's contract fails)
- **Split the 194-file baseline into two lists:**
  - files still frozen: originals, `base.npz`, `legacy-world.json`, representation inputs, app `src/`, the evaluator files left unchanged;
  - a declared list of B2-changed files whose new hashes are pinned at the B2 freeze. That list covers the manifest, the two edited natives, the new module, the recipe, the certificate and the worker if touched.
- **Replace "no recursive production import" with an allowlist.** Only `recipe_inputs.py` and `generation_paths.py` may import the loader; browser `src/` still must not.
- **Move the AST/JSON reference to `provenance/original/*`.** The adapted `descendant_world` will no longer contain the literals. This also makes the reference independent of the runtime edits.
- **Add CPU controls:**
  - an AST check that `COMPONENTS` and the descendant constants in the adapted files come only from the projection (no leftover literals);
  - the residual-constant equality asserts, exercised on CPU;
  - the worker refusing a tampered recipe, wrong `base.npz`, a missing recipe or a wrong alias pair at the `validate_inputs` stage, with no CUDA import.
- The B1 corpus stays valid: format validation doesn't check hashes against the files.

## Real GPU acceptance
**B2a (headed hardware gate required, because native source changes):**
- **G1.** Run the extended `generation-ownership` suite with the recipe as the parameter source:
  - all five preserved rows, with byte-exact buffer SHAs and classifications;
  - reset and reorder, reuse, an actual rebuild, and a stale producer;
  - `hello` shows the recipe key and alias, and the legacy definition key is unchanged;
  - the old certificate is rejected, requalification passes, and the new certificate is installed.
- **G2.** A saved place exported from main before B2 reopens in a fresh B2 helper and browser, with exact pose and byte-identical re-export. Capture the file before implementation, unless an equivalent committed fixture exists; I didn't verify whether one does.
- **G3.** Run the full maintained headed gate (30 entries) with the source- and default-world suites unchanged. Report legacy readiness and p99 as standing measurements, not new thresholds.
- **Stop rule:** any buffer byte mismatch is a finding. Record which component or parameter caused it; don't retune.

**B2b (creator controls, separate from runtime integration; may share a GPU session):**
- **Status 3:** a frozen recipe whose window straddles main-cardioid interior and escaped points. Expect a resolved result with `counts['3'] > 0`, plateau heights exactly `Href − slope·(0 − Dref)` (with positive zero), and independent mpmath checks at a few sampled points.
- **Status 4:** a frozen recipe near the boundary at a scale where escape times exceed about 1,024 iterations. There, `fkern`'s binary64 `dz` overflows (|2z|^k beyond about 1.8e308) and the kernel returns status 4. Expect `failed`, no `height.npy`, and `counts['4'] > 0`. Independently confirm overflow at sampled points on CPU in Python float64.
- **Fallback (optional):** if status 4 can't be provoked naturally within the bound, record that as a mechanical finding. Don't inject faults into the kernel.

## Fresh-child sequence (B3, its own card after B2a)
1. **Parent profile.** The `imported-legacy-r1` profile hard-codes a tilted `T0` plus a parent carve. A fresh parent needs a new generator version in which the parent component is an A2.1 bilinear grid, either with no carve or with an explicit zero-amplitude carve (the schema currently requires a positive value). Its x, z, y chart is left-handed, which the accepted orientation rule already allows.
2. **Runtime generalisation:**
   - the adapter must accept recipe-derived identities;
   - grid, entry and coverage must be derived from the recipe, not from `approach-r1.json` or the legacy grid modules;
   - the fine path needs either a freshly built parent solid or a generated parent mesh, explicitly marked as a representation dependency. Otherwise fine starts as unsupported.
3. **Child choice.** Use the A/B parent only if its domain reaches small-D boundary structure; otherwise create a new parent through A2.1 first. Frame the child with a declared finite-difference normal of the bilinear surface, and author `C`, H, A, L and htop. The search is provenance; the result is stored as literals.
4. **Controls.**
   - Measure the feature itself, for example structural relief or edge counts in the child window.
   - Use independent mpmath distance checks.
   - Check a reachable approach, contact, and transitions in both directions.
   - Pass the full gate.
   - Smooth-parent visuals are not evidence of a new formation.

## Gaps and uncertainties
- I haven't read the grid and cache modules, the pc2 qualification scripts or the scene and contract code. That leaves three unverified points:
  - whether the fine origin and grid can be derived from a recipe;
  - whether requalification depends on the preserved rows only;
  - whether saved scenes store anything beyond the world reference and pose.
- I haven't verified that `generation-ownership` is `gpu: true` in the manifest; I only saw its id.
- Buffer equality after substitution is strongly expected, because B1 proved the parameters bit-equal and evaluation order is unchanged. The GPU run is still the only proof. If bytes differ, the likeliest causes are type mismatches (lists versus arrays, a `complex` constructed differently), not mathematics.
