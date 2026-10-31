# Experimental source recipes and parent inputs (A2.1)

This offline creator builds a bounded parent heightfield from a declared Mandelbrot source. It does not change the current Landscape or connect Plane to world creation. Recursive feature/imported-legacy closure and preparation integration remain A2.2; the user-facing Plane/multiple-world workflow is A3. The example source was selected by earlier experiments and is not representative evidence for arbitrary Plane locations or rich terrain.

The [example](examples/parent-source.json) declares exact decimal source coordinates, complex units per metre, a canonical sampled domain/grid, affine distance-to-height constants and numerical policy. It uses the existing distance estimator with the explicit `affine-distance-r1` profile. Rows increase local z, columns increase x; c = C + U(x − i z), and height is along y. This parameterization does not assume a planar terrain. The bilinear canonical grid is part of this profile's mathematical construction, separate from any subsequent mesh resolution. There are no child formations in this profile.

Create inputs with the configured A1 GPU Python (NumPy/CuPy/CUDA), holding the GPU lock and one handoff:

```sh
flock /mnt/ml_storage/scratch/atlas-gpu.lock env \
  ATLAS_GPU_HANDOFF="owner, date: parent input creation" \
  PYTHONDONTWRITEBYTECODE=1 \
  /mnt/ml_storage/scratch/venvs/gpu/bin/python scripts/generation/create-parent.py \
  scripts/generation/examples/parent-source.json \
  --out /mnt/ml_storage/scratch/atlas-parent-example-unique
```

Use a new private output each time; existing directories are refused. The producer validates and constructs exact rational coordinates before importing CUDA, rounds each final coordinate once on the host, then uses the existing no-FMA CUDA iteration kernel. Unsupported rounding/range gives `unsupported`; unknown samples give `unresolved`. Neither grants a definition or height asset. Proven interior has distance zero; unknown is never substituted with zero. Source strings are retained verbatim; equivalent decimal spellings can have distinct request identities in v1. The native backend's digit/exponent/rounding limits are narrower than the codec's storage limits.

A resolved `bundle/` contains `recipe.json`, `result.json`, `height.npy` and a transport manifest. Its definition binds the complete bounded-profile recipe and logical little-endian float64 array; runtime/device/source provenance stays separate. Copy the bundle to another directory and verify it with a NumPy interpreter:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/generation/create-parent.py \
  --verify /mnt/ml_storage/scratch/atlas-parent-example-unique/bundle
```

Verification checks declared identity and file integrity, not authenticated authorship or every point's relationship to the source mathematics. A2.1's mathematical checks are finite. Diagnostic arrays and CUDA/JIT caches sit outside the portable bundle and remain in scratch. A resolved parent input is not yet a navigable prepared region with render/collision receipts.

The comparison needs a separately configured CPU interpreter with NumPy and mpmath. Probe dependencies **before** taking the GPU lock or handing over GPU ownership:

```sh
export ATLAS_REFERENCE_PYTHON=/home/john-sheppard/miniconda3_fresh/bin/python3
node scripts/experiments/md2a21-generation.mjs --preflight
flock /mnt/ml_storage/scratch/atlas-gpu.lock env \
  ATLAS_GPU_HANDOFF="owner, date: source-recipe comparison" \
  node scripts/experiments/md2a21-generation.mjs \
  /mnt/ml_storage/scratch/atlas-md2a2/comparison-unique
```

`ATLAS_GENERATION_PYTHON` overrides the GPU interpreter. The reference interpreter setting is required; missing libraries fail before generation. The maintained comparison has a 180-second bound, frozen pre-screened A/B sources, exact order/chunk rebuild controls, independent 50-digit checks, negative controls and moved/tampered bundle checks. The recorded first comparison had a preflight naming failure; the repaired native run stopped on a missing reference dependency. Its verification was completed separately under reviewed r2 on identical frozen data; it was not relabelled as a passing original run. See the [full report](../../docs/reports/project1-interactive/MD2A21-SOURCE-RECIPES-2026-10-30.md) for exact measured heads, process failures, limits and review scope.

## Imported recursive recipe (B1)

`examples/regression-recursive.json` now records the existing rich landscape's parent, child, grandchild and descendant choices. It binds the immutable tilted parent grid and all six evaluator sources. Its complete construction key is separate from the unchanged legacy scene ID. The new JS and stdlib Python codecs are inert: current preparation does not consume them yet. This does not add a new world, regenerate the historical parent or complete recursive runtime integration.

The imported profile keeps the old float arithmetic, TA unknown-to-zero history and bilinear `(u,v)` parent interpolation distinct from the new affine-distance profile. Its source hashes bind operation order; matching parameter bits is not a proof that all evaluator paths are equivalent. Historical search provenance and current non-mathematical preparation inputs remain documented in the [design](../../docs/superpowers/specs/2026-10-31-atlas-md2a22b-recursive-inputs.md).

Run the maintained native-free contract with an installed CPU Python and NumPy:

```sh
ATLAS_REFERENCE_PYTHON=/path/to/cpu/python node tests/generation-contract.mjs \
  /mnt/ml_storage/scratch/atlas-md2a22b/new-contract-run
```

The output directory must be new. The command needs no server, browser, CUDA or GPU lock; it owns one bounded CPU child and confirms its cleanup. Node unit tests never launch Python. Missing Python/NumPy fails or remains incomplete. Future full gates include this entry and require the interpreter setting. The fixture parent bundles under `tests/reference/source-parent-controls/` preserve prior qualified bytes for compatibility checks, not new mathematical evidence. See the [B1 scorecard](../../docs/reports/project1-interactive/MD2A22B1-RECURSIVE-INPUTS-2026-10-31.md).
