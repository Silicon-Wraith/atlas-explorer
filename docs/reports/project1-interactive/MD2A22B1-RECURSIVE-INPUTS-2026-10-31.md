# MD2.A2.2b B1 — complete imported recursive inputs

2026-10-31. Owner Codex; challenger Claude. Base main/merged PR26 `79a3ab926d78b455e97178d7e677d48cd6e9c673`. Implementation in `/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/md2a22b`, branch `feat/md2a22b`. [Design](../../superpowers/specs/2026-10-31-atlas-md2a22b-recursive-inputs.md), [plan](../../superpowers/plans/2026-10-31-atlas-md2a22b-implementation.md), [before-code card](MD2A22B1-CARD-2026-10-31.md).

The existing recursive world now has an explicit, portable mathematical input recipe and an inert loader that reconstructs its current parameters exactly. This unblocks recipe-driven native preparation in B2. The running landscape is unchanged; it does not consume this recipe yet. Full A2.2b, new authored formations and Plane/world selection remain open.

## Frozen criteria and results

| Criterion | Result | Evidence and limit |
|---|---|---|
| C1 strict recursive codec/identity | Pass | JS/Python agree over 39 recursive JSON cases: exact source strings, key/canonical parity, snapshots, rule/source/asset bindings, frame/lineage/resource validation and rejected machine/path inputs. Either frame handedness is retained; norm/dot tolerance 1e-12. |
| C2 exact input projection | Pass within declared scope | All parent/child/gchild/descendant numerical parameter float64 bits match independent old-source AST/JSON/NPZ extraction; component order and explicit authored full lineage checked. U comes from whitelisted constant division; reference-orbit/taper constants checked. Six adapted-native source hashes bind evaluator arithmetic, including relocation edits; even non-mathematical source edits therefore change the new recipe key. Parent mapping and newly authored full lineage are fixed in the checker and independently checked by the reviewer reading the old source. Interior margin, recheck and pert/fkern defaults/thresholds are source-bound, not independently extracted by AST. Full lineage is newly explicit authoring metadata; old runtime lacks a full lineage record. Parameter equality does not prove CPU/GPU arithmetic equivalence. |
| C3 immutable inputs | Pass | Independent NumPy descriptors agree with stdlib ZIP/NPY checks for g/t0/o; relocation, transport/logical/source tamper, wrong shape, symlink escape and malformed array/member controls reject. All existing preparation/representation inputs remain unchanged. |
| C4 source contract parity | Pass |53 shared source JSON cases, including parsed integral floats/exponents, rounded-to-integer tokens, booleans, overflow, signed zero, decimal grammar/budgets and forbidden inputs. Exact canonical bytes/keys agree. Python copies before normalising; no caller mutation. Duplicate-key/nonfinite-token checks are Python transport controls, not a JS duplicate-detection claim. Existing source keys/definitions verify. |
| C5 status policy | Pass for synthetic controls |1,110 differential NumPy controls: 14 resolved, 70 unresolved, 1,026 failed. Original unknown/failure precedence preserved; nonfinite resolved samples fail; scalar/array interior zero plateaus normalize to positive zero. Producer calls the helper with the same kernel/height operation order. Actual GPU statuses3/4 remain B2 work. |
| C6 proportional verification | Pass |1,383 guarded units/90 files, build, registered CPU gate command and real evidence classifier pass.194 existing app/native/data/representation/certificate files byte-identical. Installed source key and both A/B definition/input bindings still match. No new recursive production import. No new full headed gate claim. |
| C7 bounds, cleanup, review, reporting | Pass |r0 passed 90 cases in1.255 s; after the newly found frame-rounding repair, r1 passed 92 cases in 1.274 s (child 1.058 s). Both under 60 s with cleanup confirmed and no native/CuPy/browser imports. Completed r0 and focused r1 independent reviews support the scoped PR. All review corrections are incorporated. |

## Preserved run and mathematical limits

`/mnt/ml_storage/scratch/atlas-md2a22b/contracts-r0/` and `contracts-r1/` hold `contract.json`, `python-results.json`, exact cross-language canonical outputs and child stdout/stderr. The final repaired command was:

```sh
ATLAS_REFERENCE_PYTHON=/home/john-sheppard/miniconda3_fresh/bin/python3 \
  node tests/generation-contract.mjs /mnt/ml_storage/scratch/atlas-md2a22b/contracts-r1
```

Toolchain: Node20.20.2; CPU Python3.13.2 and NumPy2.4.2 from the configured Anaconda environment. The harness imports no native evaluator/CUDA modules. Future full gates add this CPU entry: 27 suites plus unit/build/cleanup, 30 required entries; none was run as a substitute for a headed gate here.

The immutable parent transport SHA is `8ed49a2a78098f57c8a4176677ea0bdd9563fb5d9a364c6b491a93af8d33951b`. Its 1201² t0 grid contains 1,098,499 finite and 343,902 NaN values; g has 1201 samples, and the archived pre-TA unresolved-distance diagnostic is 1. These are preserved imported facts, not newly resolved geometry. NaN remains unknown. Imported full numerical regeneration was not attempted. Historical sweep/h1c/rlib/D04 provenance remains unresolved, and the current fine builder's retained parent mesh and other preparation fixtures stay separate from mathematical recipe content.

`tests/reference/source-parent-controls/` freezes the two small qualified PR26 input bundles byte-for-byte, with copied hash/provenance records. Both Python bundle verification and Node definition/input/certificate checks pass. No CUDA creation or new mathematical source validation follows from verifying these old inputs. New source preparation still requires its own qualification.

The primary runtime GPU evaluator is float32 perturbation with rebasing and a float32 reference orbit; it compares escape against float32(1e12) and runs once to max(131072,4*32768). Binary64 fkern is the fallback. Initial 32768/recheck131072 labels describe direct CPU semantics, not a uniform binary64 GPU implementation or proven equivalence. The source bindings define the actual arithmetic. The new JS codec is copied into dist by the static build but has no production imports; the 194-file baseline is the primary unchanged-runtime check.

Both preserved runs and raw logs remain in scratch; [r0 evidence](MD2A22B1-evidence-2026-10-31.json) and [r1 evidence](MD2A22B1-evidence-r1-2026-10-31.json) retain their exact results.

## Three evidence tiers

**Established finite results:** C1–C7 above on the preserved inputs/corpus; exact numeric parameter projection, immutable dependency integrity, synthetic status parity, unchanged runtime source and passing registered CPU verification.

**Supported finding:** a complete imported recipe can reproduce the current runtime's mathematical input parameters without replaying historical search or spending navigation budget on mathematical discovery. This supports the next integration step toward multiple prepared mathematical worlds.

**Unresolved:** native runtime recipe consumption, legacy saved-scene compatibility after that integration, actual rebuilt-region equality/order behavior, real GPU interior/failure controls, a newly authored child on a freshly created parent, arbitrary source support, historical parent regeneration, rendering/transition/contact evidence for any changed geometry, memory and standing performance limits. The B1 checks cannot settle these.

## Process accounting and next action

The original r0 CPU contract passed its 90 cases on its first attempt. A bounded owner probe then found a further frame at the existing tolerance boundary: Python compensated summation accepted it while JS sequential summation refused it. This disproves broader parity, not the original 90 observed verdict matches. The new codec now explicitly accumulates dot products left-to-right. The fixed tolerance, imported recipe, native sources, certificates and runtime bytes did not change. Two frozen adjacent-float boundary cases were added. One follow-up r1 contract passed all 92 cases on its first attempt in 1.274 s, with cleanup confirmed. No other decisive rerun or GPU/browser work. Final guarded units 7.606 s and the static build pass. An initial sandbox RED invocation did not confirm the named assertion; the unchanged guarded host runner confirmed the intended assertion RED before implementation. The shared tests then passed. A development-time manifest-key mistake was repaired before the decisive run. Both are preserved in scratch; neither is relabelled as successful evidence.

Independent position run `20261031T191359Z-4c27d8` and [card review](MD2A22B1-CLAUDE-CARD-REVIEW-2026-10-31.md) `20261031T192509Z-d2c591` completed. Their API costs were $1.3067 and $1.8991. Card review exposed missing arithmetic/representation boundaries worth making explicit. Independent [r0 evidence review](MD2A22B1-CLAUDE-EVIDENCE-REVIEW-R0-2026-10-31.md) run `20261031T194159Z-8fa0d7` cost $3.6121 and supports the scoped PR after precision/claim wording corrections. The owner did not accept its unsupported universal frame-summation claim; the small discriminating probe justified the focused repair and follow-up review. Completed [focused review](MD2A22B1-CLAUDE-EVIDENCE-REVIEW-R1-2026-10-31.md) `20261031T195004Z-fcdd7a` cost $4.3902, withdrew the incorrect arithmetic claim and independently supports the repair and scoped PR. Total peer API cost: $11.2080 across independent position, card review and two evidence rounds. About 40 minutes elapsed from the independent-position request to completed focused review; implementation began at 19:32 UTC, within the 3-hour budget. The two CPU contract runs took 2.529 s total; final unit/build work and the focused rounding probe were proportionate to the new boundary finding. Owner also inspected repository Python callers: they use returned validated recipes, with no dependency on object identity found. No approval is pending from the advisor.

B2 is next after this reviewed PR is merged: consume the complete recipe through the existing native CSG preparation path, retain representation dependencies explicitly, compare real output/rebuild/order and old scenes, run actual GPU status controls and the maintained headed gate, then qualify a new authored child. Each new scope gets before-code measurable criteria. Do not replace the current usable landscape with the smooth A/B parent controls.

## Worktree cleanup and handoff

The merged inactive `md2a22` and `pc3` worktrees/local branches were retired. Their 1,521,364,506 bytes of ignored artifacts/build outputs were copied and hash-verified in `/mnt/ml_storage/scratch/atlas-branch-cleanup-2026-10-31/md2a22b-followup/`, with verified git bundles. Four merged remote branches were removed using expected-head leases after an outdated remote record was refreshed and checked. An initial cross-filesystem rename failed without moving data; verified copying completed the archive. Active `pc2`, dirty preservation worktrees and unmerged work remain. Root main stays at79a3ab9 with the advisor's `.codex/config.toml` edit preserved. No live viewer was stopped.

The archived peer log is byte-verbatim and retains its original final blank line. Only that archive is excluded from `git diff --check`; all other staged files pass the whitespace check. Archive byte offsets and SHA-256 are recorded alongside it.
