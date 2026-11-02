# B2 independent card review

Run `20261031T234746Z-d214f0`; all seven required corrections incorporated before code. Verbatim response follows.

# B2 design, card and plan review (read-only; nothing run or edited)

**Verdict: the card is proportionate, correctly scoped and implementable.** It is ready to execute once seven corrections are made in the card/spec text before any code; none of them needs an experiment. B3 and visual outcomes are correctly excluded.

## Comparing the frozen positions
- **Agreed:**
  - integrate only the imported construction, with the fresh child in B3;
  - keep `legacy-world.json` byte-identical as the scene identity;
  - only the registered recipe key may use the legacy alias, and the construction key changing is recorded explicitly;
  - requalify the certificate, with the old one kept as a refused control;
  - extend `generation-ownership` with the five byte-exact preserved rows rather than build a new geometry oracle;
  - the retained parent mesh and fixtures stay explicit representation dependencies;
  - one full 30-entry headed gate.
- **Where the owner moved to my position:** the owner wanted parent scalars, frame and seed moved out of `h1lib`. The card adopts my two-edit design: `h1lib`, `dek`, `pert` and `fkern` stay byte-identical, with bit checks on the constants they still use.
- **Where I move to the owner's position:**
  - *CPU gate:* the owner replaces B1's 194-file freeze with checks on immutable data plus current integrity, rather than my frozen-plus-declared-changed lists. That's acceptable, given that a source diff and the full gate cover application changes.
  - *Status 4:* the owner's first-iteration overflow at U=1e308 is simpler and more deterministic than my late-escape idea.
  - *Saved file:* reusing the preserved PR26 download avoids a new capture.
- **What was lost along the way:** the owner position required alias admission to check "an explicit fixed mathematical-projection digest". The spec only *reports* the projection key. See correction 1.

## Status cases, checked by hand against `fkern.py` and `create-parent.py`
- **Direct path** (C=0, U=1, one iteration):
  - (0,0) is proven interior: status 3, iteration −2, D=0.
  - (2e6,0) escapes at iteration 1 (a2 = 4e12 > 1e12): status 1, D = 2e6·ln 2e6.
  - (1e308,0) is not interior (q overflows to inf, so the comparison is false); a2 is inf, giving status 4 with iteration −1 and D NaN.
  - The period-3 point stays bounded: status 0, iteration −1.
  - All four expected statuses are correct.
- **Creator, mixed:** the 3×3 grid covers x ∈ {0.1, 0.2, 0.3} and y ∈ {0.1, 0, −0.1}. Eight points are proven cardioid interior, including (0.3, ±0.1): I checked that |1−√(1−4c)| ≈ 0.86 < 1. Only (0.3, 0) escapes. The result is resolved, with 8 status-3 points and 1 status-1 point. Preflight rounding and ordering pass.
- **Creator, failed:** coordinates ±1e308 are finite and pass preflight. The centre point (0,0) is host interior (status 3) and the other eight are status 4, so the result is failed with no height.
- **Creator, unknown:** with one iteration, all nine points are status 0, so the result is unresolved. Rounding is about 0.07 of the allowed budget.
- **50-digit checks:** the tolerance (rel 1e‑10 + abs 1e‑12) is generous for c=0.3 (a few dozen binary64 steps) and for 2e6. For the overflow case, mpmath shows the point does escape mathematically, so status 4 is a binary64 representability failure. The spec describes it as genuine binary64 overflow, which is correct; keep that wording.

## Required corrections before code
1. **Alias admission must check projection, not just the key.** Make the alias table bind `{recipeKey, projectionDigest, legacyId 'H1C-surface-child@ee2564d40bda7ef6', legacy definitionKey}`.
   - The projection digest comes from the original-source reference: `provenance/original/*` plus `construction.json`, `frame.json`, the `levels.json` seed and `base.npz` `o`.
   - The worker must refuse unless the digest of the *actually loaded* `S.COMPONENTS` and descendant attributes equals it. Use a single serializer (float bits as hex) shared by the CPU contract and the worker.
   - Without this, the legacy record keeps binding `construction.json` while the runtime takes its numbers elsewhere, and only the registered key ties the two together.
2. **The imported profile's component IDs carry meaning in the runtime.**
   - The runtime branches on names: `sampling_r0` checks for `'parent'` and adds `T0`, footprint checks `!= 'parent'`, `descendant_world` looks for `'gchild'`.
   - The projection sets `name = id`, and the B1 codec accepts any identifier.
   - Runtime intake for `imported-legacy-r1` must therefore require exactly `[parent, child, gchild]`, with the descendant's parent `gchild`. Otherwise a renamed, otherwise valid recipe would silently turn the parent into a cutter.
3. **The suite deadline needs to grow.** `generation-ownership` has a 300 s limit in both the manifest and `installSuiteDeadline`. It already includes two qualification subprocesses (each with a 120 s timeout), and the card adds a 60 s status block on top of a ≤300 s preflight.
   - Freeze a new limit in both places before running (e.g. 420 s), or state the suite's measured historical duration. Otherwise a mechanical timeout would show up as an incomplete gate.
4. **The plateau claim overstates what the mixed case tests.** `referenceHeightM: "-0.0"` passes through `Fraction`, which drops the sign, so the transfer becomes +0.0. Interior height is then 0.0 − 1·(0.0 − 0.0) = +0.0, so the producer can't produce −0 here.
   - The case confirms a positive-zero plateau but does not exercise the −0 normalisation branch; B1's synthetic test covers that branch.
   - Fix the wording, or drop the claim that this case tests normalisation.
5. **Check the saved-file fixture's world before relying on it.** Before C7 depends on `actual-saved-scene.json`, assert that its world reference is the legacy one (ID and definition key `fnv1a64:4c29d6f7f61fbb06`) and that its scene schema is the current one.
   - I could only read its provenance (SHA, pass, cleanup), not its contents. The PR26 `space-prepared-files` "nondefault Landscape file" is probably the legacy world, but that should be checked, not assumed.
6. **Check for component keys the projection drops.** The old components were `dict(CON[k])`, which carries extra `construction.json` keys such as `h1top_provenance` and `floor1_height_along_n2_over_support`; the projection doesn't include them.
   - Before code, search `adaptive_graph_pr3`, the builders and the `cache_*` modules for any use of other component keys, including `.get` with a default. If one exists, the byte control would fail mechanically or, worse, behave subtly differently.
7. **Spell out the B1 checker update.** The CPU checker currently calls `R.load_inputs(examples/regression-recursive.json)` and reads constants by AST from the *current* `native/*.py`.
   - After the edits, `verify_sources` fails for the example, and the edited `descendant_world` no longer contains the literals.
   - Write down explicitly: the AST reads `provenance/original/{h1lib,sampling_r0,descendant_world}.py` (and `dek`), load and projection use the registered runtime recipe, and the example stays only as a format-corpus fixture.

## Smaller points (wording only, nonblocking)
- State where alias admission happens: in the worker before CUDA, re-asserted by the adapter from the recipe metadata in `hello`.
- The runtime perturbation path's own statuses (`pert` status 2 and the fallback promotion) are not exercised. Say this is outside C6.
- The direct `fdser` probe needs its own small Python/CuPy subprocess, since the worker doesn't expose `fdser`. Make sure it counts within the 60 s status budget, including its JIT compile.

## What I read
- **In full:**
  - `owner-position-r0.md`, the B2 spec, the B2 card and the B2 plan;
  - `manifest.json`, `status-cases.json`, `legacy-place-provenance.json`;
  - `fkern.py` (the B1-r1 copy; same hash as the one bound in the recipe);
  - `suites.manifest.json` lines 174–273.
- **Carried from my independent read this round:** `native-worker.py`, `native-adapter.mjs`, `config.mjs`, `generation-ownership.mjs`, `policy-certificate.json`, `legacy-buffer-controls.json`. Their manifest hashes are unchanged.
- **Carried from earlier rounds:** `create-parent.py`, `source_recipe.py`, `sampling_r0.py`, `descendant_world.py`, `h1lib.py`.
- **Not read:**
  - the saved-scene fixture's contents;
  - `MD2B2-OWNER-INDEPENDENT` and `MD2B2-CLAUDE-INDEPENDENT`; I assume these are copies of the two frozen positions;
  - `adaptive_graph_pr3`, `cache_*`, the builders, `world_grid`;
  - the pc2 qualification scripts, `space-prepared-files.mjs`, the scene and contract code.

## Limits
- All status expectations above come from reading the source by hand, not from running anything.
- Whether the byte control passes after substitution remains a GPU question. The likeliest mechanical causes of a mismatch are dropped component keys, list-versus-array types and the shape of `complex`, not mathematics.
