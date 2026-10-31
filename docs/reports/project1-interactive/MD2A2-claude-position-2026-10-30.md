# Independent A2 position (r0): read-only review, before seeing the owner's position

## Read scope
- **Read in full:** `requirements.md`, `source-manifest.json`, both docs (the foundation plan and the multiscale clarification), all four regression-world JSON files, `base.py`, `frame.py`, `seed-build.py`, `child-construct.py`, `grandchild-construct.py`, `descent-build.py`, `height-transfer.py` (sweep), `t1-cache.py`, `t1-cache-result.json`, `dek.py`, `pert.py`, `h1lib.py`, `sampling_r0.py`, `descendant_world.py`, `contract.js`.
- **Read in part:** `h1c.py`. I only searched it for its imports, classes and functions.
- **Not read** (not in the payload): `shared/scene.js` (where `canonicalJson` and `fnv1a64` live), `field_fidelity_r0`, `fkern`, `classify`, `rlib`, `tlib`, `generation_paths`, `gs.json`, the North Star charter and the preparation-boundary spec.
- **Not checked:** I did not verify the manifest SHA-256 values, because I couldn't run anything.
- **Not written:** no plan file. Write and ExitPlanMode aren't available in this read-only session.
- **Not used:** A1 is not treated as evidence that anything here is accepted.

## Facts from the source that shape the design
1. **The parent surface is a sampled grid.** In `base.py`, `t0` is a 0.05 m grid over a 90 m square. It comes from a bilinear interpolation of a D grid, followed by 36 bisection steps along a fixed normal `n`. `h1lib.T0` reads it back with `RegularGridInterpolator`. So the legacy parent surface is effectively the interpolation of that sampled grid. `base.npz` behaves like part of the world's definition, not a cache.
2. **Two things in the legacy world are silent repairs.** `base.py` sets D to 0 for both proven-interior points (`INT`) and unresolved points (`UNRES`). Points where bisection finds no bracket become NaN.
3. **One "constant" is computed numerically.** `TA(D) = TA0 − AA(D−6.8)` is affine in D. But `AA` comes from a central finite difference with step 1e-6 (`sweep._dT1`), so its value depends on floating-point evaluation.
4. **The current world is well inside float64.** The mapping is `U = 0.0016/2048 ≈ 7.8e-7` c-units per metre. At |c| ≈ 0.74, one ulp is about 1.4e-10 m of world distance. Deep Plane coordinates would not survive this path: `dek.to_c` and `pert.ref_orbit` both build c in float64, and the GPU deltas are float32.
5. **The frame depends on a long upstream chain.** `frame.json` is picked from descent patch `D04`. That patch came from the BF sweep route, which came from the sweep fixtures. Replaying that chain only to get a chart orientation would be replaying irrelevant experiments.
6. **Feature placements are search outputs.** `C1`, `F1` and the child frame come from root finding plus voxel reachability searches (`child-construct`). `F2` and `C2` come from a sphere-sweep search (`grandchild-construct`). `h1top` is a maximum over the 2407 s T1R cache plus 0.05. All of these are construction choices that are already frozen as literals in `construction.json` and `levels.json`.
7. **The current JS identity uses floats and a 64-bit non-cryptographic hash.** `contract.js` `createWorldRecord` hashes canonical JSON with `fnv1a64`, and `legacy-world.json` keeps its parameters as JS Numbers. The asset list also hashes the evaluator's code bytes (`base-field-evaluator`), so world identity is currently tied to source code.

## (1) What goes in each layer
**World mathematical identity (the recipe):** the parts that decide which world exists. Everything that changes geometry belongs here:
- **Formula and evaluation rules:**
  - formula z²+c;
  - escape radius 1e6 and the "half-Milnor" distance estimate;
  - which interior points count as proven;
  - iteration budget (32768, then a 131072 re-check);
  - the unknown-point policy.
  
  Iteration limits belong in identity because they decide which points become unknown, and that changes the shape.
- **Source anchor:** stored as decimal strings.
- **Spatial interpretation:** metres per c-unit stored as an exact rational, axis orientation, origin, and the transfer function with `TA0`/`AA` frozen as decimal literals.
- **Parent chart frame:** origin and the u/v/n vectors.
- **Parent sampling procedure:** spacing, extent, bisection depth and interpolation. This stays in identity only while the legacy parent is defined by its sampled grid.
- **Feature lineage:** each feature's C, F, u/v/n, H/A/L and htop as literals, plus the descendant rule (id, version, chart centre, half support, amplitude, ratio).

**Executable and representation provenance (not identity):** code digests, evaluator backend (CPU float64, GPU perturbation with fallback, kernel hash), platform, achieved tolerances, and the records of how features were found (candidate counts, rejections, costs). Sampling, mesh builder and transform also go here, as `contract.js` already does for artifacts.

**Generated assets (can be rebuilt; the recipe key is part of each cache key):** `base.npz`, D patches, `grids`, `cache.npz`, meshes. An asset's digest is something you check after rebuilding, not an input. The exception is the legacy alias: until the rebuild is proven bitwise-identical, it stays bound to its assets.

## (2) Precision and honest reproducibility across JS and Python
- **Store source coordinates as strings.** Anchor coordinates are decimal strings with a declared grammar. JS must never pass them through `Number()`. Python parses them with `decimal` or `mpmath`. Derived legacy centres (`Cs`, `C1`, `C2`) are float64 values, so record them as shortest round-trip strings: they decode back to exactly the same double.
- **Don't let float formatting decide identity.** Python and JS format some floats differently (`1e-07` vs `1e-7`, `1.0` vs `1`). Identity bytes should hold only strings, safe integers and a single canonicalization both languages share. I could not read `canonicalJson`, so whether Python and JS produce the same key today is an open question.
- **Reject unsupported depth instead of rounding.** The float64-direct path is allowed only when `U × smallest sample step ≥ 2^k × ulp(|c|)`, with k frozen up front (for example 10). The GPU path also needs the float32 delta range to be valid. Otherwise the result is `unsupported` with a reason. The mp-reference perturbation path stays unimplemented and is reported as unsupported.
- **Three levels of reproducibility, claimed separately:**
  - **Recipe bytes and key:** identical across JS and Python. This is the only thing JS has to guarantee in A2.
  - **Point evaluation:** CPU float64 is the reference. GPU and other backends only claim agreement within a tolerance on D and the escape classification. Points that disagree near the boundary become `unresolved`.
  - **Generated assets:** bitwise identical only for the same build and platform. Across platforms, compare within a tolerance and report the differences.
- **No claim of JS math parity.** JS does not evaluate the mathematics in A2.

## (3) Authored versus regenerated inputs
- **Legacy control:** every construction choice becomes an authored literal copied from `construction.json`, `levels.json`, `frame.json` and the rule parameters. Nothing gets re-run: no seed ladder, contour roots, voxel reachability, F2 sweep, T1R cache or descent/sweep chain. The import of renderer and column-cache code through `h1c`/`rlib`/`tlib` goes away. Changes to the legacy behaviour (the UNRES→0 fill, `AA`) need a new interpretation version; they cannot be silently fixed under the old alias.
- **New source worlds:**
  - The author supplies the anchor, window, metres-per-unit and interpretation version.
  - The frame is either authored literally or produced by a simple declared rule such as a plane fit over the window. A plane-fit frame is only a chart orientation; it does not make the terrain flat. Places where the projection has no bracket or the terrain folds are reported as unresolved coverage.
  - The parent samples are regenerated.
  - Descendants are either absent or given as literal chart coordinates. Porting the feature searches can wait until a separate card.
  - Regenerating the parent surface at a finer resolution adds no mathematical formations.

## (4) First discriminating experiment (CPU only, no GPU, no product default)
Freeze the criteria and a time/compute budget before running anything.

1. **A — legacy rebuild.** Write the literal recipe. A repo-owned function rebuilds `t0` (parent samples) from that recipe alone, in a fresh output root. Success is a byte-for-byte match with `base.npz`. Otherwise, report max |Δt0|, how NaN and unresolved points moved, and the unresolved count. If it isn't bitwise, the alias stays asset-bound.
2. **B — new source.** Pick a different anchor, written as a decimal string, at a depth float64 supports, with an authored window. Generate the frame and the parent samples from the recipe. Verify the result against the mathematics on its own:
   - Recompute D and height at around 64 deterministic sample points with mpmath, starting from the anchor string, not from the float pipeline.
   - Show that B is not a translated copy of A.
   - Rebuild in reverse order or with different chunking and get identical bytes.
3. **Negative controls:**
   - An anchor deeper than float64 allows returns `unsupported`, not a rounded result.
   - Changing the anchor's last significant digit changes the recipe key.
   - Changing camera, body, tessellation or cache settings leaves the key unchanged.
   - Under the new policy version, unresolved samples stay unknown instead of becoming 0.
4. **JS check.** Python and JS compute the same key from the same recipe bytes, and the anchor string survives a round trip byte for byte.

This is decisive because B's inputs come from a source location that no existing fixture contains, and they are checked against the mathematics, not against a copied fixture.

## Blockers
- Matching canonicalization between JS and Python is unproven (`scene.js` not read).
- `fnv1a64` is weak for future multi-user identity. That needs an explicit decision later, not in A2.
- The legacy identity hashes code bytes.
- UNRES→0 and the finite-difference `AA` are baked into the legacy world.
- The frame's origin lies upstream of the descent and sweep scripts.
- The transitive dependency closure is incomplete (`classify`, `rlib`, `tlib`, `fkern`, `field_fidelity_r0` not read).
- Deep-zoom evaluation, meaning a high-precision reference orbit and an extended-exponent GPU path, does not exist yet. Inside A2 it can only be refused honestly.

## Simpler path
Four pieces: a v0 recipe schema, a Python function that builds parent inputs from a recipe, one literal legacy recipe, and one recipe for a new anchor, plus the JS string and key test. Leave out generalized feature search, Plane UI, hosting and descendant creation for new worlds.

## Where I expect to agree or disagree with Codex
I can't compare positions yet. The three places I'd push back are:
- "Complete recipe" should not mean porting the six creation scripts.
- Iteration budget and unknown-point policy belong in identity, not in evaluation settings.
- `base.npz` can only become a generated asset once a bitwise rebuild proves it, or once a new version redefines the parent surface. A digest match on its own shouldn't be enough.
