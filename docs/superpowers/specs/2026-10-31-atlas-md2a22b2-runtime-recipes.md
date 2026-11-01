# MD2.A2.2b B2 — consume the imported recipe in native preparation

2026-10-31. Owner Codex; challenger Claude. Base PR27/main `9436b04`; branch `feat/md2a22b2`, worktree `.worktrees/md2a22b2`. Governing [North Star](2026-10-23-atlas-north-star-charter.md), [fixed-world interpretation](2026-10-29-atlas-multiscale-world-clarification.md), [B1](2026-10-31-atlas-md2a22b-recursive-inputs.md) and [foundation](../plans/2026-10-30-atlas-world-generation-foundation.md).

## Observable result and scope

The existing rich landscape prepares its mathematical component/descendant inputs from the explicit recursive recipe. Its previously saved places reopen with the same world, pose and file bytes. Real GPU-generated region buffers remain equal to the preserved controls, with the same prepared collision and scale-transition behavior. This unblocks authored worlds without replacing the landscape with smooth parent controls.

B2 integrates the known imported construction only. A new authored child on a freshly created parent is B3, with its own parent-profile, domain/entry, identity, preparation and mathematical-feature criteria. Arbitrary source search, historical tilted-parent regeneration, Plane creation/selection and production-backend choice remain separate. No new renderer, mesher, field formula or aesthetic default is introduced.

## Parameter intake and ownership

A new stdlib `native/recipe_inputs.py` calls the existing recursive loader against a registered `regression-world/recursive-recipe.json`. `generation_paths.validate_inputs()` validates it before any CuPy import. The manifest binds the recipe transport and a compatibility record {recipeKey, projectionDigest, legacyId, legacyDefinitionKey}. The fixed legacy projection digest comes from the original-source reference, not the new recipe. Runtime intake requires exactly [parent, child, gchild] and one descendant whose parent is gchild; these names carry meaning in the imported evaluator. Source/support modules are explicitly registered and included in actual provenance; unowned modules do not become trusted merely by appearing on sys.path.

Only two mathematical assembly blocks change: `sampling_r0.COMPONENTS` is built from the projected components, converting frames with NumPy exactly as before; `descendant_world` takes its chart centre/support/amplitude/ratio from the projected descendant. These edits are listed verbatim in the import manifest. Reference-orbit creation follows the substitution. No worker-time monkeypatch after reference construction.

`h1lib.py`, `dek.py`, `pert.py` and `fkern.py` stay byte-identical. At startup the retained h1 root frame/origin/seed/scalars and U/N0 are checked bit-for-bit against the projected root/profile. The actual field's component parameters flow from the recipe; residual constants cannot silently disagree. CPU controls exercise that check without importing the GPU evaluator. The primary GPU evaluator remains float32 perturbation/rebasing, with binary64 direct fallback; no CPU/GPU equivalence follows from a label.

The worker reports the consumed recipe key, legacy alias and a numeric projection key derived from actual loaded native component/descendant attributes. Alias admission refuses before CUDA unless projected parameters match the fixed original digest and the actual legacy definition key; after native imports, refuse unless actual S.COMPONENTS/descendant attributes match too. Use one float-bit hexadecimal serializer for the CPU contract and worker, with an independent reference comparison. The Node adapter reasserts the compatibility record from hello against the world and registered metadata. Parent samples and the retained parent-reference mesh, fixtures, approach/domain/entry inputs remain separate registered dependencies. The prepared geometry/collision path, cache policies, operation order, RTIN/Manifold assembly and supported domain/body sizes stay unchanged.

## Identity and certificate policy

`legacy-world.json` stays byte-identical and supplies the existing Scene identity. The alias is accepted only for the explicitly registered current recipe key. An altered recipe cannot silently reuse that identity, even if its format is valid. New worlds later need complete recipe-derived definitions. B1's unused construction key is superseded by the runtime recipe key because the adapted sampling/descendant source hashes change; record both, without treating this as changed mathematical content.

The current source-policy certificate becomes invalid when sources/inputs change. Preserve it as a negative control, derive a new coarse/fine/view certificate from the actual five-region native run and independent finite qualification, and install only that new source-qualified certificate. A declared source edit or valid recipe is not itself an admission certificate.

## CPU gate amendment, before implementation

B1's 194-file baseline is historical evidence of its inert scope. It cannot permanently freeze unrelated application source in the maintained mathematical contract. Preserve that baseline and both B1 runs unchanged. Amend the maintained CPU entry to check immutable original sources/canonical data, numeric projection against `provenance/original/*`, current recipe/source/import-manifest integrity and the explicit runtime loader boundary. Remove its blanket assertion that all application/certificate files must remain unchanged and that the Python loader has no runtime consumer. Browser JS remains unaffected in this slice; source diff and the full product gate establish that.

Explicit checker update: original AST reads provenance/original/{h1lib,sampling_r0,descendant_world,dek}.py; real load/projection uses the registered runtime recipe. The B1 example remains only a format-corpus fixture, whose old source binding is not a current runtime grant. The 92 shared codec cases remain controls. Hash strings inside a format-validation fixture need not match the current runtime; the real runtime recipe has separate source-integrity and alias checks. CPU preflight refuses a missing/tampered recipe, bad parent transport/source binding and a wrong alias pair before CUDA, including cases with recomputed transport metadata. Residual-constant mismatch refuses. This changes the gate's applicability deliberately, not a result after it has failed.

## GPU and browser evidence

Extend the existing `generation-ownership` suite, rather than create another geometry oracle: compare all five preserved delivered-buffer hashes/classifications, opposite order, resident reuse, cache reset/actual rebuild and stale producer rejection. Verify actual native projection metadata, the old certificate's rejection and fresh source qualification. The legacy world record and old mathematical/representation inputs are immutable controls; do not regenerate controls to match a changed result.

Use the preserved actual PR26 headed download `/mnt/ml_storage/scratch/atlas-md2a22/final-files/actual-saved-scene.json` and its successful run record as the pre-change saved-place fixture, copying exact bytes/provenance into test reference data before implementation. Extend the maintained headed file workflow to open it in a fresh B2 helper/browser and reexport it byte-for-byte, then restore the workflow's current file. Existing file/history/navigation checks stay in force.

Real status controls have two distinct layers:

- Call the actual CuPy `fkern.fdser` path on fixed finite coordinates giving statuses 3/1/4/0. Status3 exercises its GPU interior mask; status4 exercises genuine binary64 overflow, not a mocked result. Verify iterations, zero/finite/NaN semantics and sampled half-Milnor distance against an independent high-precision reference.
- Run the real source creator on three frozen 3×3 recipes: mixed interior/escaped around C=0.2, U=0.1; a finite-coordinate overflow window with U=1e308; and an unresolved non-cardioid source with iteration budget1. Expect resolved with both statuses3/1 and exact positive-zero plateau, failed with status4/no height, and unresolved with status0/no height respectively. The creator's interior proof is on the host; do not mislabel it GPU iteration. Independent CPU/50-digit controls check the reasons and finite distances, with relative1e-10 plus absolute1e-12 tolerance for the fixed escaping samples. No search or fault injection.

Status controls can share the native suite's exclusive GPU session. Keep them bounded to60 seconds including subprocess cleanup and register their required pass in that suite. The final maintained gate still has30 required entries; all run headed on the recorded NVIDIA/Vulkan profile, with owned cleanup, exact one handoff and cold caches as required. Existing functional targets remain; standing readiness/nav-tail/memory limits and measured FPS are reported separately. Do not add unpublished frame-tail or aesthetic criteria.

## Bounds, stop and report

Implementation/verification budget4 hours from accepted card. Native compatibility preflight≤420 seconds, status controls≤60 seconds, CPU contract≤60 seconds, per-suite maintained bounds and a90-minute outer full-gate bound. One pre-substantive mechanical repair per harness may preserve the failed attempt; a substantive numerical/buffer mismatch stops and is diagnosed rather than retuning controls. One full gate is planned; further runs require an actual repair/new evidence need, never a cleaner verdict. No concurrent reviewer/checkout edits or competing GPU use.

Report every [card](../../reports/project1-interactive/MD2B2-CARD-2026-10-31.md) criterion, source/data/certificate hashes, actual observed configurations/cleanup, established finite results, supported findings, unresolved B3 questions and process cost. Complete independent evidence review before publishing the reviewed PR; advisor alone merges. This is runtime input integration, not a claim of new mathematical formations or completion of the full foundation.

## Before-code review amendments

The extended generation-ownership suite gets420 seconds in both its manifest and internal deadline, allowing its qualification subprocesses and the60-second status block. GPU probe import/JIT/cleanup all count inside that status block. The mixed creator case establishes a positive-zero plateau, not execution of the negative-zero normalization branch: Fraction removes the signed input zero; B1 synthetic controls cover normalization. Perturbation status2/promotion paths are outside the new C6 status claim.

The old actual downloaded fixture has schema atlas.scene/version1, model prepared-world/version1, parameters.world.id H1C-surface-child@ee2564d40bda7ef6 and definitionKey fnv1a64:4c29d6f7f61fbb06; source SHA/pass/cleanup are checked before code. Before-code builder/cache audit found only projected component fields used: name/F/u/v/n/C/H/A/L/htop. adaptive_graph_pr3 uses frame.get(name/H); the dropped construction diagnostic/provenance fields have no consumers. Preserve the search evidence.
