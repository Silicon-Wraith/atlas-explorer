# Owned native region generation

MD2.A1 brings the working region-generation runtime and its regression inputs into this repository. `native/` contains the project-authored evaluator, descendant, cache and RTIN/Manifold assembly modules. `regression-world/` contains explicit, hashed input/reference fixtures. `provenance/original/` preserves their original source bytes, and `import-manifest.json` lists the exact allowed relocation edits and input digests. The original files are data for provenance, not executable import paths.

Regression World serves validation requirements and may evolve. This migration holds the current specimen fixed to detect unintended changes. The existing ID/portable definition are an explicit legacy binding; archived mathematical source/input bytes preserve its six original assets. Additional inputs and executable code omitted by the legacy world record are bound in the current builder/source manifest. This does not repair the old world-definition closure retroactively. New recipes must bind their complete mathematical inputs.

Run `node --input-type=module -e 'import {verifyGenerationBundle} from "./scripts/generation/config.mjs"; console.log(await verifyGenerationBundle())'` and `python scripts/generation/check-import.py` from the project root for source/input integrity and stdlib/static I/O ownership checks. These do not import mathematical/GPU modules. Supported worker/reference paths reject checkout writes and reads from the four original first-party scratch experiment roots. Actual module/input paths are recorded and checked for the measured default route; this denylist/module filter is not a universal filesystem allowlist. Runtime metadata records actual loaded modules, all registered inputs, three distinct graph module objects, shared interaction caches and disabled view caches.

`npm run dev:world` now selects this owned bundle. Its source-bound `policy-certificate.json` is derived by maintained finite qualification, not copied from the old scratch implementation. A changed actual source/package/input digest invalidates admission and requires requalification. The same native CUDA/Manifold/PyMartini preparation and browser physics/rendering path remain; this is not browser-only generation or a production-backend selection.

The configured workstation dependencies remain external:

- Python 3.13 at `/mnt/ml_storage/scratch/venvs/gpu/bin/python`; override with `ATLAS_GENERATION_PYTHON`.
- NumPy 2.5.4, SciPy 1.18.1 and CuPy CUDA13x 14.2.0 in that environment.
- Manifold3D 3.5.4 and PyMartini 0.5.1 installed under `/mnt/ml_storage/scratch/atlas-prepared-toolchain/py`; override the directory with `ATLAS_NATIVE_PACKAGES`.
- The existing browser physics module remains configured by the application server. Recreating/installing a supported host bundle remains separate work. No third-party compiled library is vendored here; local metadata/licences record MIT (CuPy/PyMartini), BSD-family (NumPy/SciPy) and Apache-2.0 (Manifold).

Generated data, JIT caches, temporary files and raw evidence stay in explicit scratch run roots. Use the GPU lock and exactly one handoff for all native/CUDA and headed browser verification. `tests/generation-ownership.mjs` is the maintained five-case binary-geometry/order/rebuild control; its output includes a newly qualified source policy and confirmed owned native cleanup. The application gate additionally checks actual navigation, contact, scaling, scenes/history, sessions and device/preparer recovery.

Limits: source-driven canonical-parent input creation and the Plane-to-world recipe/workflow are subsequent MD2.A slices. The legacy parent-input builder substituted zero for unresolved distance estimates; the saved base records one such sample. That is retained fixture provenance, not a policy for new worlds. Direct CPU references are independent of RTIN/Manifold meshing but share rule/evaluator code. Finite checks, one sparse forward-reference specimen, standing readiness/navigation-tail misses, unverified full region-memory attribution, fixed domain/two scales, first-drag roll and driver/hang recovery limits remain explicit. More than one source-generated world is not yet claimed.

An offline experimental [source-recipe creator](SOURCE-RECIPES.md) now generates bounded parent inputs from exact source strings. It is separate from the unchanged Regression World runtime; recursive/imported closure and preparation/UI integration remain subsequent increments.

## Enter a qualified source parent

A2.2a adds a bounded parent-only application route. The default is still Regression World. After creating an A2.1 bundle using [SOURCE-RECIPES.md](SOURCE-RECIPES.md), launch:

```sh
npm run dev:world -- --source-world /absolute/path/to/bundle
```

The launcher owns the same GPU lock/headed browser and cleanup as the default route. Switch to Space, then Landscape. WASD/QE, wheel/body-size controls and Landscape scene files work through the existing preparation boundary. One world is configured per launch; a different world file refuses explicitly. Shrinking shows the same bilinear mathematical surface at a smaller body size. Additional formations and Plane creation/selection are subsequent work.

Only the independently qualified A/B mathematical definitions and current source/Node policy are admitted by `source-world-certificates.json`. A mathematically identical rebuilt/relocated numeric bundle retains its definition and qualification; transport/provenance hashes are separately checked, never part of world identity. Other sources fail explicitly rather than becoming empty space. The A2.1 creator still evaluates the mathematics on CUDA. This route constructs/indexes an existing 65×65 heightfield on the CPU once; navigation performs prepared collision queries and no mathematical iteration. It adds no Python preparation worker.

Maintainer qualification uses an explicit CPU interpreter with NumPy, then pins the emitted certificate before the full headed product gate:

```sh
ATLAS_REFERENCE_PYTHON=/path/to/cpu/python node scripts/experiments/md2a22-preflight.mjs /mnt/ml_storage/scratch/atlas-md2a22/new-preflight
```

Set `ATLAS_PARENT_A` / `ATLAS_PARENT_B` to the previously checked source bundle directories; defaults point at preserved A2.1 data on the configured workstation. Each output directory must be new. `ATLAS_SOURCE_WORLD_INPUTS` selects that preflight directory for the maintained `source-worlds` browser entry; `ATLAS_REFERENCE_PYTHON` is also required for its independent motion audit. Requalification is a measured maintainer operation, not automatic certificate acceptance at application startup. [Frozen criteria](../../docs/reports/project1-interactive/MD2A22-CARD-2026-10-31.md) and [independent CPU evidence](../../docs/reports/project1-interactive/MD2A22-qualification-2026-10-31.json) define the limited claim. The full 29-entry maintained headed hardware gate passes on product source `2015ee8`; see the [complete scorecard](../../docs/reports/project1-interactive/MD2A22-ENTERABLE-PARENTS-2026-10-31.md). Completed independent final evidence review supports the scoped PR.

B2 now connects the [complete imported recursive recipe](SOURCE-RECIPES.md#imported-recursive-runtime-recipe-b2) to native parameter assembly, with strict legacy compatibility and source-policy requalification. Its native preflight matches all five old geometry controls and real CUDA status checks pass; the full30-entry headed product gate passes on69298ce and completed independent evidence review supports release; see the [B2 scorecard](../../docs/reports/project1-interactive/MD2B2-RUNTIME-RECIPES-2026-10-31.md). New authored formations remain B3.
