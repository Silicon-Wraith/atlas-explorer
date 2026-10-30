# MD2.A1 — own the working region generator

2026-10-30. Owner Codex; challenger Claude. **Design proposed for independent challenge before implementation.** Base merged PR23 `af72dbe`, project worktree `.worktrees/md2a`, branch `feat/md2a`. Governing [North Star](2026-10-23-atlas-north-star-charter.md), [fixed-world interpretation](2026-10-29-atlas-multiscale-world-clarification.md), [foundation sequence](../plans/2026-10-30-atlas-world-generation-foundation.md) and [preparation contract](2026-10-29-atlas-preparation-boundary.md).

## Experience and boundary

The existing Landscape runs using repository-owned mathematical evaluation, descendant rules, sampling, mesh construction, caches and canonical regression inputs. Its generation and independent checks must not import first-party code or world inputs from scratch experiment directories. Scratch remains the home of generated outputs, caches, execution environments, installed dependencies and raw evidence. No new mathematical rule, appearance, body/domain, performance target or production backend is selected.

Regression World serves validation requirements and can change or be replaced as those requirements evolve. For this migration only, preserve its current definition and geometry as a discriminating compatibility control. This is not a permanent freeze. Record intentional future changes with their recipe/version and expected evidence. A1 owns the existing region-generation runtime and its input fixtures; executable creation of new canonical parent inputs and the Plane-to-world recipe/workflow remain A2/A3. Do not call this first slice generalized world creation or completion of the whole foundation.

## Source audit

The static trace identifies 18 runtime/helper modules (87,092 bytes), 12 canonical/reference inputs (7,847,830 bytes), and six upstream input-creation stages for subsequent work. Source manifest and exact original paths/hashes are preserved in the card packet/report. Important runtime chain:

`native-worker → coarse/fine/view cache/builders → adaptive RTIN + Manifold → descendant rule → graph sampler → perturbation/f64 fallback + direct CPU reference → canonical parent chart`.

Load order and module-local caches matter: coarse/view use separate graph module objects; fine uses the shared sampler; the wrapper shares bounded field/validation/topology stores for interaction and isolates view stores. Preserve those relationships rather than refactor the algorithm during relocation.

Canonical inputs include the parent chart, frame/seed/construction, grid/entry/feature data and a small parent reference. The historical parent builder converted unresolved distance estimates to zero; `base.npz` records one such sample. This is retained fixture provenance, not permission to do that in future source-driven creation. Finite qualification covers the represented regression construction and carries existing completeness limits. No arbitrary-source mathematical fidelity claim follows.

## Repository layout and configuration

Add `scripts/generation/native/` for the project-authored Python runtime/helper modules, `scripts/generation/regression-world/` for identified fixture inputs, and a source/import manifest with original digests and descriptions of permitted relocation edits. Keep generated arrays/meshes outside the checkout. Retain exact mathematical function bodies and CUDA source, changing only imports, source/input/output resolution, explicit legacy identity and provenance enumeration. No new mesher, collision engine or sampling policy.

Use one small path/configuration module with a root derived from its own file and an explicit bundle parameter for fixture data. Replace absolute scratch first-party imports and CWD-dependent input reads. Keep the existing Python interpreter configurable and make the installed native package directory an explicit dependency setting; do not vendor compiled libraries or silently install software. Preserve currently installed NumPy 2.5.4, SciPy 1.18.1, CuPy CUDA13x 14.2.0, Manifold3D 3.5.4 and PyMartini 0.5.1 as the measured control. Local licence metadata identifies MIT/BSD/Apache dependencies; these remain external packages, not copied implementations. Physics packaging remains an explicit external dependency, separate from generator ownership.

The application/experimental server defaults use the repository bundle and its newly qualified policy certificate. Native outputs remain scratch-owned. Document setup and limits. Existing tests with injected adapters retain their native-free behavior.

## Identity and compatibility

Relocation changes source hashes even where mathematical bodies stay identical. Recompute builder provenance and the qualification key; never relabel an old certificate as current. Representation keys may change across builder versions. Within the new builder, opposite order/rebuild must preserve keys and buffers.

The existing world record includes historical mathematical-source asset digests and a path-bearing legacy ID. Preserve its exact portable definition for old saved scenes through an explicit legacy binding: archive the three original mathematical source assets byte-for-byte, retain original canonical input bytes, and verify their six role/digest bindings against the frozen existing world record. Adapted executable code appears separately in actual builder provenance. Validate unchanged mathematical bodies/CUDA and actual binary geometry against preserved controls before relying on that binding. No old source digest may masquerade as the digest of the adapted executable file. A2 gets an explicit portable recipe/version scheme for newly created worlds.

The worker reports actual repository source/input digests plus dependency identity; qualification input resolves those actual files rather than guessing paths in experiment directories. Source readers validate digests before finite audits. Move direct CPU mathematical reference/distance helpers into repository ownership while preserving their computational independence from the mesher. The known fine mesh used by the checker is a regression reference only, never runtime input geometry. Store its provenance explicitly.

## Verification

Before hardware, guarded Node checks cover manifest integrity, missing/altered input rejection, source/legacy separation, source ownership and default configuration; static Python checks enforce allowed imports/path boundaries and unchanged math/CUDA bodies without importing GPU modules. Run full guarded units/build. Positive and negative evidence-root checks cover the new trailing-slash `atlas-md2a/` roots before full acceptance.

Run one bounded native migration/qualification workload on the installed GPU: home, new 3D region, domain corner, fine and view; compare delivered buffer SHA-256s to preserved same-host control, world/pose compatibility, opposite request order, resident reuse, rebuild and stale epoch rejection. Record loaded first-party modules and input roots to demonstrate scratch experiment independence. Requalify the new actual source set and all coarse/fine/view policies; a mismatched certificate remains rejected.

Pin a clean source/certificate head before the maintained headed full gate. Existing normal navigation/contact/scale, session/launcher, file/history/recovery and Plane/viewer checks must pass on the migrated source. Preserve source hashes, representative images, exact outcomes, owned-process cleanup and full criteria. Actual source/asset relocation is the hypothesis; performance measurements and finite geometry limits stay separate. Do not run a general optimization campaign.

## Bounds and closure

Source/CPU migration ≤4 h; hardware/evidence ≤1 h, including one final gate ≤45 min; adequate completed peer-review time separate. One outcome-independent mechanical repair after preflight is allowed, preserving the original failure. Safety, identity, cleanup failure or bound exhaustion stops qualification and returns the unresolved issue to review. No repeated run for a nicer number. Advisor merges the reviewed PR. Next A2 is canonical-input creation and source-driven world recipes, followed by the Plane workflow and genuine multi-source evidence.
