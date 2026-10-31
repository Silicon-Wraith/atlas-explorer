# MD2.A1 evidence and source review (evidence-review-r0, head 65942d8)

**Verdict:** the evidence supports the bounded A1 ownership slice, and I found no material blocker. The relocation follows the r1 amendments:
- the frozen legacy world is checked against archived original bytes;
- every adapted module is rebuilt from its original by an exact allowlisted edit ledger;
- the module and input registry is recorded;
- the three graph modules stay distinct;
- all five geometry buffers match the preserved same-host controls bit for bit.

The one repair was mechanical and properly preserved. Acceptance still depends on the final 28-entry headed gate and its full scorecard. There is no browser, visual or performance claim yet.

## Checked in source
- **Edit ledger** (`generation_paths.validate_inputs`, lines 45–78):
  - For each adapted module it hashes the archived original and requires every listed `before` string to occur exactly once.
  - It applies the replacements and requires the result to equal the current file byte for byte, matching its recorded hash.
  - Constants and CUDA strings are covered as well as function bodies.
  - Unchanged modules keep their original hashes: `dek`, `fkern`, `pert`, `region_class` and `check_collision_r0` (manifest lines 34–42 against 55–61).
- **Legacy binding:**
  - `legacy-world.json` is a repository input with the literal ID `H1C-surface-child@ee2564d40bda7ef6` (line 73).
  - The six role digests are checked against `construction.json`, `base.npz` and `frame.json` and the archived originals of `sampling_r0`, `h1lib` and `descendant_world` (lines 67–77).
  - The worker emits that frozen definition (line 56). Executable digests travel separately in `sources` and `sourceFiles` (lines 38–44 and 58), so no old digest stands in for adapted code.
- **Inputs:**
  - The data root must sit inside the repository's `generation` directory (lines 8–10).
  - Every asset must be declared in the manifest (lines 17–22) and match its digest (lines 63–66).
  - The 13 inputs, including `levels.json`, `gs.json`, the fixtures, `parent-reference` and the reference control mesh, are all repository files (manifest lines 66–79).
- **No scratch paths remain:** in the adapted native modules, the only remaining `/mnt/` paths are the output-root check and the configured package directory (`generation_paths` lines 30 and 37). `sys.path` additions are limited to the package directory and the repository code (lines 40–41). The removal of the ambient `child.json` read is recorded as passing (`staticImport.ambientReadRemoved`).
- **Module identity** (`native-worker.py`):
  - The three graph objects are distinct and backed by one file (lines 33–35).
  - Interaction caches are shared and view caches disabled, both asserted (lines 36–37).
  - Module rows and read inputs are recorded in the hello message (line 60).
  - The preflight lists 20 names, including `adaptive_graph_pr3`, `bw1_adaptive_graph`, `bw1_view_graph`, `dek` and `field_fidelity_r0`.
- **I/O guard** (lines 81–110): an audit hook refuses reads from the four original scratch source roots, writes or mutations inside the checkout, and unregistered data reads. It also suppresses bytecode writing.
- **Preflight** (`MD2A1-native-preflight` checks, lines 828–837): 8/8 pass.
  - The legacy and mismatched certificates are rejected.
  - Home, new 3D region, corner, fine and view buffers exactly match the same-host controls.
  - Opposite order, reuse, rebuild and stale-epoch checks pass, and every publication retires.
  - Qualification passes for all coarse, fine and view policies. The new certificate's sources key is `fnv1a64:13ad585ee91d5b57`.
- **CPU and build:** 1,357 units in 86 files pass, the build passes, and the 8 + 9 HTTP controls pass. A negative test shows that a root outside the allowed prefix is rejected before its directory is created.

## The mechanical repair
- **What failed:** the first preflight hit `RuntimeError: dictionary changed size during iteration` at `generation_paths.py` line 114, during provenance enumeration and before any job ran. The controller confirmed process exit and cleanup, and an external check found both PIDs absent and the lock free.
- **The fix:** iterate over `list(sys.modules.items())`, plus a standard-library control that mutates the module table from inside `__getattr__`. It is outcome-independent and unrelated to mathematics.
- **Harness correction:** recording the controller's cleanup after a constructor failure fixes a reporting omission (`cleanup:false`); it changes nothing in the product.
- **Preservation:** the original failed attempt remains unchanged.

## Non-blocking hardening (report as limits or follow-ups)
1. **Two checks are denylists, not allowlists.**
   - The I/O guard refuses only the four named original scratch roots (line 88).
   - `owned_provenance` lists only modules whose files are under the repository code directory (lines 114–115). It would not reveal a first-party module loaded from some other scratch path.
   - The static result that no scratch import paths remain in the adapted code, together with exact buffer equality, makes such a module unlikely. A stronger form would be:
     - allow reads only from the repository, the output root, the configured package directory, the interpreter prefix and the CUDA/CuPy caches;
     - assert that every `sys.modules` file falls into one of those locations.
   - State the current check as covering known roots only.
2. **`policy-certificate.json`** is readable without being registered as an input (line 102). It is bound separately by its sources key, which is acceptable; say so.
3. **Default package directory:** it remains a scratch toolchain path. That is an external install, so it must be documented as setup, not as owned source.

## Honest scope (agreed)
- A1 owns the runtime and its fixtures, and recomputes regions fresh.
- A1 does not regenerate canonical parent inputs, provide general recipes, support multiple worlds, add new detail or choose a production backend.
- The legacy six-asset record has a closure gap: `levels.json`, `dek`, `pert`, `fkern` and `gs.json` are not bound by it, though they are now preserved and in provenance. A2 recipes must bind them.
- The direct CPU reference is independent of RTIN and Manifold meshing only. It shares the rule and evaluator code with the runtime.
- One historical unknown-to-zero sample in `base.npz` is kept as fixture provenance.
- Carried limits: the sparse forward reference, standing performance, memory, roll and driver limits, and global geometry completeness.

## Scope
**Read in full:** `owner-report.md`, the card amendment, `source-manifest.json`, `generation_paths.py` and `MD2A1-PREFLIGHT` lines 1–99.

**Partial reads and greps:**
- `native-worker.py`: lines 1–90
- the adapted native directory: grep for scratch paths and `sys.path`
- `MD2A1-native-preflight`: greps for checks and module names

**Not read:**
- `import-manifest.json` contents (the edit strings themselves);
- the adapted module bodies other than by grep, and `check-import.py`;
- the application server, native adapter and native controller diffs;
- `pc2-qualify.py`, `pc2-qualification-input.mjs` and the other experiment scripts;
- `tests/generation-ownership.mjs` and the unit tests;
- `legacy-world.json`, the certificate and buffer-control JSON;
- the source-audit and review-provenance JSON, and the docs and README.

No images were supplied. I executed nothing and edited nothing.
