# Independent A2.2b position (r0). Nothing was run or edited.

## Read scope
- **Read in full:** `requirements.md`, `source-manifest.json`, `AGENTS.md`, the three specs (A2, A2.2a, multiscale clarification), the foundation plan, the A2.2a report, all four `regression-world/*.json` files, `import-manifest.json`, `source_recipe.py`, `source-recipe.js`, `create-parent.py`, `descendant_world.py`, `sampling_r0.py`, `h1lib.py`, `dek.py`, `generation_paths.py`, and all seven `upstream/*` files.
- **Partly read:** `builder_bw1.py` (lines 1–140).
- **Searched only, not read:** `fkern.py` (status codes), `native-worker.py`, `native-adapter.mjs`, `application-server.mjs`, and the `cache_*`/`builder_view` files (imports and `values` calls).
- **Not read:** `pert.py`, `config.mjs`.
- **Deliberately not opened:** `owner-position-r0.md`, `independent-prompt-r0.md`, `independent-argv-r0.json` and `independent-result-r0.json`, to stay independent.
- **Not verified:** I didn't check any manifest hash, because that would mean running something.

## What the source shows
1. **How the legacy world is built.** The seahorse-tail centre in `dek.py` feeds `sweep.TA(D)`. That gives a heightfield over x/z on a 0.05 m grid with R=45 (1801² ≈ 3.24M D points). `base.py` then turns it into the tilted-chart `t0` (1201², bracket ±20, 36 bisections). The runtime adds a parent carve (CS from `levels.json` seed, A0/L0/H0), cutters K1 and K2 (`construction.json`), and the descendant rule at ratio 64 on K2's floor. The parts are combined with manifold CSG for each region (`builder_bw1`). `t0` (`base.npz`) is the only computed array the runtime uses. Everything else reaching the runtime is a fixed number.
2. **What a rebuild can't reach.** Several upstream modules are neither owned nor in my read scope: `sweep.py` (TA), `h1c` (`grandchild-construct.py`), `rlib` (the T1R cache), and the descent `D04.npy` data (`frame.py`). So `base.npz` can't be regenerated from owned source today. Also, `dek.REGIONS` can be overridden by environment variables (`HOLDOUT_*`), so any rebuild record must state that they were absent.
3. **Unknown-zero.** `base.py` sets unresolved samples to D=0, i.e. treats them as boundary, and `unres=1` records one such sample. A2's contract says unknowns produce no surface. So the legacy parent cannot honestly be expressed as `affine-distance-r1`.
   - The two also differ in other ways: legacy uses float coordinates (`cx+U*(x-1024)`), A2 uses exact-rational coordinates.
   - Legacy rechecks at 131072 iterations; A2 has a single `maxIterations`.
   - Legacy needs 1801 cells; A2 allows at most 512.
4. **Identity depends on paths.** The original `WORLD_ID` hashed a spec keyed by absolute file paths. The owned copy hard-codes the ID as a literal alias. `legacy-world.json` binds the *original* sources, while the runtime runs *adapted* copies. The link between them is `validate_inputs()`, which checks original + listed edits = current file. That chain already works and should not be touched.
5. **Searches are provenance; their results are fixed choices.** These are the F1 root search and accessibility check, the F2 search, the C1/C2 selection, frame tile selection, the K ladder, and h1top (from the 2407 s T1R cache). Their results are recorded literally. Recipes should store those float64 values as round-trip decimal strings labelled "authored", and should never re-run the searches.
6. **Python/JS gaps (the owed hardening items).**
   - **Integral JSON:** `JSON.parse` turns `"cells":64.0` into 64, which JS accepts, while Python rejects the float. The same text gets different verdicts.
   - **Status 3:** `create-parent.py` classifies proven interior on the host, so the kernel never returns 3 there. Interior samples become a plateau at `Href+slope·Dref`. The A/B parents are smooth by pre-screening, so this path has probably never run end to end.
   - **Status 4:** the "failed" branch and the mixed 0/4 rule look untested.

## Position
- **Split A2.2b.** Calling all of A2.2b complete would require recipe closure, input construction, runtime consumption and a new formation all at once. That is too much for one card.
- **Mathematics vs provenance.** Identity covers the generator profile and version, the fixed numbers, the evaluation and unknown rules, and the logical digests of computed arrays. Search procedures, timings, paths, tools and devices are provenance.
- **Legacy gets its own profile.** It should be a separate profile, e.g. `legacy-ta-tilted-r0`, with its unknown-zero rule, float arithmetic and recheck rule declared, and `base.npz` treated as an imported input. It should never be presented as an alias of A2.
- **Two meanings of "legacy rebuild"; only one is needed now.**
  - *R1, regenerating `base.npz`* — not needed for A2.2b. It only becomes necessary before relaxing the `base.npz` binding, and it depends on first tracing `sweep.py`.
  - *R2, rebuilding the runtime from a recipe* — needed. Its first step can run on CPU only.
- **Runtime for new recursive worlds.** Use the existing native CSG path, driven by a component list from a recipe, with the legacy world as the byte-identical control. I'd reject a new tilted-CSG engine inside the Node adapter.
- **A new formation, later.** One authored child on A or B, placed where D is small, with its own canonical input created offline. The feature should be measured directly, not inferred from a difference between two approximations.

## Smallest next observable increment (CPU only, no GPU, no change to defaults, backend or UI)
1. **Legacy recipe file.** Add a repository-owned `regression-world` recipe with `imported-legacy` status.
   - A plain-Python loader rebuilds `S.COMPONENTS`, the descendant `SPEC` numbers and the asset bindings from it.
   - A unit test asserts these are bit-equal to what `sampling_r0`/`descendant_world` currently load.
   - `legacy-world.json`, the ID and the certificate stay unchanged.
   - Each untraced source (`sweep`, `h1c`, `rlib`, `D04`) is listed explicitly as unknown.
2. **Shared Python/JS rejection cases.** One case file covering integral floats, bools, `1e2`, empty or partial decimals, and exponent edge cases. Proposed rule: Python accepts exactly-integral floats as ints, and the verifier requires `recipe.json` to equal its canonical bytes.
3. **Status classification as a pure function.** Pull the 0/1/3/4 → resolved/unresolved/failed rule out of `create-parent.py` into a testable function, and test it on synthetic arrays, including a proven-interior plateau.

**Stop rule:** if item 1 can't reach bit-equality without editing the runtime, record which fixed numbers are missing and stop.

**Later, once you release the GPU:** run a small status-3 creation on a window containing cardioid interior, then a recipe-driven native region rebuild in both orders compared by digest, then the child input.

## Challenges and uncertainties
- I'd challenge any plan that requires the `base.npz` rebuild first, or puts A/B parent, child and grandchild plus runtime into one card.
- I'm assuming `h1c.Level` matches `sampling_r0`'s component semantics; I haven't seen it.
- I don't know where `t0` is NaN from failed brackets, or whether the one unknown sample falls in the domain the runtime actually uses. That's a cheap CPU read of `base.npz` and worth doing.
- I don't know the owner's position, so I can't say where we agree. My most likely disagreement is over R1 vs R2 and how the slice is split.
