# BI1.B implementation plan — prepared scenes, history and files

**Status:** implementing after completed independent card challenge20261030T173343Z-2ee11b and [r1 amendment](../../reports/project1-interactive/BI1B-CARD-AMENDMENT-2026-10-30.md),2026-10-30. Governing [design](../specs/2026-10-30-atlas-bi1b-scenes-history.md), [card](../../reports/project1-interactive/BI1B-CARD-2026-10-30.md), [upstream BI1](../specs/2026-10-29-atlas-bi1-application-integration.md). Base `5013ba6154bf1162e3092c2b1b509377bade2629`, branch `feat/bi1b`, worktree `/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/bi1b`. Baseline1,298 units/80 files pass; runtime/evidence under `/mnt/ml_storage/scratch/atlas-bi1b`.

## 1. Challenge the frozen boundary

Preserve an owner position and obtain independent design/card review of the new-format contract, metadata-first history seeding and requested-versus-published restoration seam. Include existing scene/history/commands, prepared pose/runtime/workspace and mode-host/composition source. Address material findings in a preserved amendment before substantial implementation. Review gets the adequate900s/16MiB bridge transport established in PC4, with source/image/execution scope declared; no silent short timeout and no assumption that an absent answer is verification.

## 2. Prepared scene adapter

Add `src/space/preparation/scene-adapter.js` for the versioned prepared model, complete canonical files and camera equality. Reuse `shared/scene.js`, PC1 world validation and the existing pose convention; keep native/GPU imports out. Pure parsing checks shape/numerical/profile/world-record consistency, while a separate compatibility function checks selected producer configuration with the existing pose model before preparation. No duplicate native grid constants.

Add `tests/unit/prepared-scene.test.js` and register it. Begin with an importable skeleton and a meaningful assertion RED for complete portable scene round-trip/unsupported validation. Cover requested values, quaternion equivalence versus canonical identity, all envelope/model sections, wrong world key/profile/schema, invalid numerical values, size cap, no mutation/default injection and full metadata-specific domain/scale/origin admission. Assert exported native-control records contain no machine paths or transient producer/session/resource fields.

## 3. GPU-independent scene/history controller

Add a small controller under preparation using `createHistory` and the prepared adapter. Initialize from first producer configuration, retain an earlier pending import, and apply it exactly once before runtime admission. Accept only runtime-approved pose updates during navigation. Expose explicit restoration requests and bounded requested-scene/history snapshots without resource handles.

Add registered `prepared-history.test.js` controls for grouped key/drag/wheel navigation, blocked no-op movement,100-entry bounds, Back/Forward and branch truncation, complete import/Undo/Redo, metadata-first pending import and requested-state survival. Do not change shared history semantics or reuse the viewer's Z-up camera algebra. Validate no history work turns every frame into an independent committed gesture or causes a restore loop.

## 4. Workspace restoration lifecycle

Integrate scene/history ownership into `prepared/workspace.js`, replacing the ambiguous retained-pose role with explicit requested and published state. Accepted frame/scale/orientation decisions update gesture previews. Explicit restoration closes input, advances generation, drains old resources, validates current producer compatibility and incoming body clearance, then publishes only a current first presentation with verified lease. Keep the original default pose and appearance for ordinary initial entry.

Extend existing registered prepared-workspace units with deferred client/consumer/renderer barriers. Check old-runtime storage cannot overwrite a new request; B→C supersession; leave during restore; no movement/prediction/scale while pending; missing helper and failed compatibility/clearance keep requested state; retry restores it; old callbacks cannot affect replacement; cleanup failure still blocks reacquisition. Assert no silent clamp, camera reset or old-frame success notification. In particular, a host `activated` result for viewer fallback must never satisfy a Landscape file-open completion. Pure fake fixtures establish logic, not actual GPU acceptance.

## 5. Existing UI/composition seams

Add Landscape file and history controls to `index.html`/styles and prepared workspace, keeping viewer bindings separate. A narrow callback through app/mode host coordinates actual activation; keep composition changes small. Open remains reachable in Space while Landscape is unavailable, with pending scene retained; Back/Forward/Undo/Redo show the controller's actual availability. Gate keyboard input by active/focused mode and dialog/editable state. Download/read helpers may be factored if doing so simplifies existing code without changing Plane/viewer semantics.

Add bounded file read identity and actual error/status handling, size-before-read checks, confirmed-current presentation before success and predictable same-file reselection. Preserve existing Plane discovery/storage/share-link behavior; no new IndexedDB schema or global discovery registry.

## 6. Actual file/history application evidence

Register a bounded headed BI1.B browser suite. Use maintained profile and exclusive GPU lock, private ports5196/5198/5200 as available (gate5190 remains reserved), fresh scratch outputs and owned process supervision. Reuse existing bundle/adapter/physics and finite qualification tools. Native-free rehearsal must verify any new fault/barrier fixture before hardware.

One bounded route: enter the actual app, navigate to a nondefault supported place, save/download the complete file, leave/close and confirm release, restart the owned helper/browser, select that actual file and compare requested/published world+pose/body/FOV after current presentation. Exercise real controls for navigation grouping/Back/Forward and whole-scene open/Undo/Redo, then invalid parse, valid unsupported restoration and recovery to the saved pose. Do not label history/file jumps as flight. Preserve producer change across helper restart and exact file hash.

Use CPU-controlled races for cases requiring precise ordering and only a small headed cancellation step if it is robust under the frozen card. Existing prepared-world suite supplies ordinary flight/contact/fidelity measurements on final source. Preserve failed attempts; apply at most the card's one outcome-independent mechanical repair after a native-free rehearsal.

## 7. Final verification, report and PR

Pin a clean implementation commit. Run all registered units/build and the complete maintained product gate, including the new file/history suite and PC4's ownership controls. Set `ATLAS_B15_REPORT_DIR`, `ATLAS_COLD_CACHE_ROOT`, application/session roots and new BI1.B roots explicitly under scratch; do not overwrite tracked performance documents. Do not inherit PC4 measurements as final BI1.B evidence.

Publish every frozen criterion, exact source/gate/file hashes, observed capability, formal/supported/unresolved tiers, full performance/memory limits and process cost. Obtain a completed independent evidence judgement with adequate time; verify numerical/source claims against actual preserved data. Archive verbatim exchanges. Update BI1 status, roadmap/index/checkpoint without changing the BI1.C/AP1/MD2 sequence. Open the reviewed PR; advisor merges main.

## Bounds and progress

Three hours implementation/native-free checks plus one hour hardware/evidence; initial card review, advisor permission wait and adequate final independent-review time are recorded separately. One bounded mechanical fixture repair, original attempt preserved. Stop for unsafe publication/movement, wrong-world activation, silent requested-pose change, broken ownership, unconfirmed cleanup or exhausted bound. A mechanical failure narrows the result rather than refuting successful file/history observations. No full acceptance claim until required runs and independent judgement complete.

| Stage | State |
|---|---|
| Merged-main/worktree | Complete;5013ba6, feat/bi1b under project.worktrees |
| Baseline | Complete;1,298 registered units/80 files |
| Source/design/plan/card | Audited and written; frozen for challenge |
| Independent card challenge | Complete;20261030T173343Z-2ee11b, r1 adopted; advisor gave standing Claude approval |
| Implementation | Scene codec/history/controller, restart seam, workspace/UI and19 new focused unit controls implemented;1,317 units/82 files and build pass. Meaningful assertion RED/GREEN preserved. |
| Headed/full-gate evidence | Native-free actual-record/unsupported-fixture rehearsal passes; actual file/restart suite written and registered; hardware next. |
| Final review/report/PR | Not started |
