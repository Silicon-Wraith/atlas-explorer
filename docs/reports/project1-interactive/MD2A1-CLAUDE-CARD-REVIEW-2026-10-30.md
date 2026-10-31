# MD2.A1 card challenge (card-review-r0, head 4fcf2ce, base af72dbe)

**Verdict:** ready to implement, with precise amendments. I found no fatal flaw. Explicit legacy binding plus same-host buffer controls is a sound approach, and it is needed: blind re-keying is not possible here. The source audit missed several things that should be fixed before code moves:
- a silent input read that depends on the working directory;
- mathematical inputs and modules that neither the world record nor the worker's provenance covers;
- a world record that is derived at runtime and so will change automatically when files move.

The A1/A2 boundary is honest and useful as a prerequisite slice. It does not change what a visitor sees, so it should be reported as an ownership slice only.

## Findings from source
1. **`h1lib.py` reads `child.json` from the current directory** (line 30): `try: CH = json.load(open('child.json')) … except Exception: CH = None` runs at import.
   - If the worker is started from a directory that happens to contain a `child.json`, it silently defines `F1`, `C1` and related values.
   - h1lib is a legacy world asset, so it has to be edited anyway. Remove the read (`CH = None`) or make it explicit, and add a static check that no relative `open` or read remains in the runtime modules.
2. **Inputs and modules outside the world's six role bindings.** The world record binds only:
   - **inputs:** `construction.json`, `base.npz` and `frame.json`;
   - **code:** `sampling_r0.py`, `h1lib.py` and `descendant_world.py`.

   Other mathematical inputs are unbound:
   - `levels.json` supplies the seed `CS` (h1lib line 9);
   - `dek.py` is the distance estimator imported by h1lib (line 3);
   - `pert.py` and `fkern.py` are the GPU kernels;
   - `gs.json` supplies fixtures (`sampling_r0.py` line 21);
   - `fixtures-r0.json` and `parent-reference-r0.json` are read by `streaming_builder_r0.py` (lines 73 and 78).

   The worker's provenance `sources` (`native-worker.py`, lines 31–36) also omits `dek.py`, `field_fidelity_r0.py`, `world_grid.py`, `view_grid.py`, `levels.json`, `gs.json`, `fixtures-r0.json` and `parent-reference-r0.json`.
   - **Correction:**
     - Derive provenance from the modules actually loaded (`sys.modules` filtered to the repository root) plus a registry of every input file read.
     - Assert there are no first-party modules or inputs outside the repository.
     - In the legacy-binding manifest, record these as preserved but not bound by the world record.
     - Do not claim the six bindings establish mathematical closure of the legacy world; that is a pre-existing identity gap. A2 recipes must bind all of them.
3. **The world record is computed at runtime.**
   - `definition.assets` comes from `W.SPEC['base']`, whose digests come from hashing the actual files at import (`descendant_world.py`, lines 11–12). The worker then asserts those digests (lines 43–46).
   - After relocation the definition key would change on its own, and saved scenes would fail the exact world comparison.
   - **Correction:** the legacy definition becomes a frozen literal, with the world ID and the six digests taken from the archived originals. The worker emits that frozen record, separately from the executable digests. A static test byte-compares the archived originals with the frozen digests.
   - The path-bearing world ID (`@ee2564d…`) must also be literal, never recomputed.
4. **Module identity and load order** must be enforced, not just documented.
   - `adaptive_graph_pr3.py` currently loads as three module objects:
     - `bw1_adaptive_graph` for coarse, via `spec_from_file_location` (`builder_bw1.py`, lines 20–21);
     - `bw1_view_graph` for view (`builder_view.py`, lines 20–21);
     - `adaptive_graph_pr3` for fine, via a `sys.path` import.
   - The worker then:
     - wraps each module's `tile_mesh` (lines 50–56);
     - shares `F.field/validation/topology = C.*` (line 25);
     - sets the view caches to `Cache(0)` (line 28, which means disabled rather than isolated);
     - patches `B.world_grid`, `B.HERE`, `B.REQUESTS` and `B.G.DENSE_VALIDATION` on every request (lines 83–87).
   - **Correction:** keep the same module names and `spec_from_file_location` calls, pointed at the repository file. Add an import-time assertion that the coarse, view and fine graph modules are distinct objects backed by the same repository file. Record each first-party name's file path in the hello message, and fail on any module-name collision across directories.
   - The three `cache_*.py` modules set `B.HERE = <module dir>/cached-r0` at import (line 23), which after relocation points inside the checkout. Add a check that nothing is written under the repository root, for example a worker run against a read-only checkout or a check on the output paths.
5. **Paths relative to the module's own directory.** `sampling_r0.py` reads `HERE.parent/'construction.json'` and `'gs.json'` (lines 20–21). Once moved under `scripts/generation/native/`, that resolves to a different directory. Route every such read through the configuration module.
6. **Direct CPU reference: independent only of the mesher.**
   - `pc2-qualify.py` imports `descendant_world` from a scratch directory (lines 11–12) and `check_collision_r0.distances` from a second one (lines 14–15). It loads a scratch control mesh (line 30).
   - `descendant_world` pulls in `sampling_r0`, which imports CuPy, `pert` and `fkern`. The reference shares the descendant rule, h1lib and dek code with the runtime.
   - State that honestly: the reference is independent of RTIN and Manifold meshing, not of shared rule code.
   - Move the control mesh into an identified reference fixture with its provenance, as planned.
   - `pc2-qualification-input.mjs` guesses candidate paths by basename (lines 13–20); replacing that is necessary.
7. **Third-party packages in scratch:** `adaptive_graph_pr3.py` adds `/mnt/ml_storage/scratch/atlas-prepared-toolchain/py` to `sys.path` for pymartini and manifold3d. Externally installed packages in scratch are acceptable as an explicit configured dependency. Keep their `.so` digests in provenance as package identity, not as owned source.
8. **First-party code inside the scratch bundle:** the worker imports `cache_view` from `bundle/'core'` (line 26). The defaults also point at scratch for the bundle, `feature-r0.json` and the certificate. Include all of these in the relocation.

## Simpler and safer equivalence check
Instead of an AST-only comparison, use a normalised line-level diff between each archived original and its adapted copy. Every hunk must match an explicitly listed allowed edit: an import, a path constant, a configuration lookup, or removal of the `child.json` read.
- This covers module-level constants and CUDA source strings as well as function bodies.
- It is easier to audit than an AST comparison and catches unintended edits.
- Same-host bitwise buffer equality for home, new 3D region, domain corner, fine and view is the decisive behavioural control. Keep it, together with opposite order, reuse, rebuild and stale-epoch checks.

## Boundary, process and proportionality
- **Baseline:** the card correctly says the CPU baseline was incomplete (TAP missing). Before implementation, obtain a complete baseline unit run in the proper environment so later comparisons are meaningful.
- **Base-sample provenance:** the one historical unknown-to-zero sample in `base.npz` should be recorded as fixture provenance. It must not become a policy for new source creation. The current `h1lib.par_solid` treats unknown values as solid, which is conservative; note the difference.
- **Boundary:** A1 owns the runtime and its fixtures; A2 owns creating inputs and recipes. That split is honest. Do not use the words "generalised", "multi-world" or "new detail".
- **Bounds:** 4 h of CPU work and 1 h of hardware including one gate are proportionate. The highest-risk items are 3, 4 and 5 above; rehearse their checks without native work before any hardware run.

## Scope
**Read in full:**
- **Owner documents:** `owner-position.md`, the design, plan and card, and `source-manifest.json`.
- **Source:** `h1lib.py` lines 1–32.

**Partial reads and greps:**
- `native-worker.py`: lines 10–104 plus a grep
- **Legacy `*.py` files:** greps of imports, paths and reads
- `pc2-qualify.py` and `pc2-qualification-input.mjs`: greps

**Not read:**
- **Legacy files in full:** builders, caches, `pert.py` and `fkern.py` (CUDA), `dek.py`.
- **Remaining scripts and docs:** `pc2-audit.py`, `pc2-reconstruction.mjs`, the adapter, controller and server (hashes match earlier reviews), the foundation plan.
- **Input-creation scripts:** `base.py`, `frame.py`, the build and construct scripts, `sweep.py`.
- **Not present in this packet:** the actual input fixtures and the 12-input list.

No images were supplied. I executed nothing and edited nothing.
