# BI1.B — save and return to a prepared-world place

**Status:** owner design for independent challenge,2026-10-30. Owner Codex; challenger Claude. Base merged PC4 `5013ba6154bf1162e3092c2b1b509377bade2629`, branch `feat/bi1b`, project `.worktrees/bi1b`. No implementation yet. The merged baseline passes1,298 guarded CPU tests/80 files.

Governing [North Star](2026-10-23-atlas-north-star-charter.md), [fixed-world interpretation](2026-10-29-atlas-multiscale-world-clarification.md), [BI1 integration](2026-10-29-atlas-bi1-application-integration.md), [Project1 scene/history contracts](2026-10-19-project1-design.md), and [roadmap](../plans/2026-10-29-atlas-browser-world-move-forward.md). This specifies the previously deferred BI1.B scene codec, history and file workflow. PC4's ownership/retry fence remains authoritative. BI1.C still owns complete device/preparer interruption parity.

## Observable experience and risk

Explore Landscape, save a scene file, leave the browser/helper, relaunch, and open that actual file to return to the same mathematical world, position, orientation, body scale and FOV. Back/Forward revisits navigation gestures; Undo/Redo reverses complete scene openings. Pending or unsupported restoration explains its state and cannot silently place the visitor somewhere else.

The main risk is equating a requested history/file pose with an interaction-ready position. The existing history mutates validated scene data synchronously; prepared runtime startup is asynchronous and must check coverage and clearance. These remain distinct owners. Every restored representation must pass the same world/source policy and collision admission used by normal entry before input or current presentation is published.

This slice uses explicit scene files for durable return, consistent with existing viewer file controls. It does not add a Landscape bookmark/discovery library, migrate IndexedDB, automatically resume on reload, persist history stacks, or introduce sharing/backend selection. Those are separate product increments. Existing Plane discoveries and viewer workflows remain intact.

## Audited seams

- `shared/scene.js` supplies the strict `atlas.scene` envelope, canonical finite JSON, size admission, frozen snapshots and FNV identity. Model codecs are registered by adapters; shared code holds no model math, BigInt coordinates, GPU or physics resources.
- `shared/history.js` already supplies100-entry edit and camera histories, domain-specific undo, atomic `restoreScene`, branch truncation and gesture grouping. Reuse it without changing Plane/viewer semantics.
- Plane and viewer have independent codecs and file handlers. The application discovery controller currently uses Plane's codec; adding a global discovery registry is unnecessary for this file slice.
- Prepared `pose.js` already checks world reference, canonical origin, D/D4, fine bounds, local domain, unit orientation and a finite roundoff budget against active metadata. `runtime.start` additionally requires actual coverage/body clearance.
- Prepared workspace currently conflates its retained pose with the latest runtime pose and has no shared history. Its deactivation stores the old runtime pose; a pending restored request needs a separate owner so this cannot overwrite it.
- Space mode/workspace hosts already fence asynchronous first presentation. Reuse those transitions for explicit restoration rather than invent another visible-workspace selector.

## Portable scene model

Add a prepared-only scene adapter under `src/space/preparation/`, using `prepared-world@1` in `atlas.scene@1`, `workspace:'space'`. Never register it as an implicit distance-estimator model or pass it to the viewer's Z-up camera functions.

The fields follow the BI1 integration design:

| Field | v1 value |
|---|---|
| conventions | `atlas-prepared-yup-metres-v1` |
| parameters | `{world}` containing the complete PC1 world record, including its checked definition key, generator, mathematical parameters, canonical asset digests and lineage |
| camera | `{kind:'prepared-pose-v1',originM,positionLocalM,orientationWxyz,bodyDiameterM,verticalFovDegrees}` |
| slices / iteration | `[]` / `null` |
| tracing | `{profile:'prepared-triangles-v1',coverageProfile:'pc2-half-d-r1',maxErrorFraction:0.01}` |
| appearance | `{material:'neutral',lighting:'pc2-lambert-v1',lightDirection}` |
| sampling | `{profile:'retained-native-r1'}` |
| provenance | Existing `{createdBy:'atlas'}` envelope rules |

Files include mathematical world identity and requested camera/representation policy, never worker/GPU handles, collision snapshots, native filenames, bundle paths, publication tokens, runtime IDs, nonces or producer epochs. Body size does not alter world parameters. Build no new world or generator to exercise persistence.

**Parsing and execution admission are separate.** The pure codec checks complete fields/known profiles, PC1 definition-key consistency, finite values, positive body size, unit quaternion within1e-6, FOV10–120, finite coordinate reconstruction and a conservative binary64 roundoff bound. It accepts no unknown envelope/model fields or silent defaults on import. Canonical encoding retains requested binary64 values (including the shared codec's negative-zero handling); orientation equivalence for history may compare normalized rotations modulo sign but does not rewrite scene-file identity.

The selected producer's configuration supplies the authoritative canonical origin, D/D4, finite spatial domain, fine formation and retained lighting policy. After opening that producer, and before creating/publishing replacement resources, validate the requested scene against those capabilities through the existing pose model. Then `runtime.start` checks actual body clearance. A structurally valid file can therefore be unsupported by the current producer; retain it as a requested scene and show the precise reason. This clarifies the BI1 validation table: offline structural validity never asserts currently supported coverage or collision clearance. Do not duplicate native grid/formation constants in a second browser world definition merely to parse a file.

Use existing2,000,000-byte scene admission unless evidence requires a separate explicit limit. Check selected file size before reading and codec bytes before parsing. Unsupported schema/model/profile, malformed values and parse failures leave the previous requested scene/history unchanged. A supported-format file with execution-incompatible world/pose is kept as the requested restoration and remains inert until repaired, undone or retried; it is not reported successfully opened.

## Scene/history owner

Introduce a GPU-independent prepared scene/history controller, using the prepared adapter and `createHistory`. It exposes immutable requested scene/history state, accepted-camera updates, complete-scene restore, Back/Forward, Undo/Redo and gesture settlement. Runtime resources and native ownership remain in the workspace/runtime.

When initial producer metadata is first available, seed history from the normal configured initial scene. If a file was requested before configuration, retain that parsed pending request separately; apply it once to the seeded history before preparing it. No unsupported-file fallback is presented as a successful restore. A request made while metadata is unavailable remains exportable/retryable as requested data, but cannot become interaction-ready.

Ordinary movement previews only collision-accepted poses from `runtime.pose()`. Camera gestures are one continuous key run/drag/wheel burst, not one entry per frame. Begin on the first actual accepted change, settle on release/quiet, blur, hidden state, Escape, scene action, workspace/mode exit or session loss. Overlapping navigation inputs must have a deterministic single gesture owner. Blocked movement makes no new pose entry. Scale changes enter camera history only after the existing safe scale decision succeeds.

Back/Forward changes camera only, adds no edit entry and stops input before requesting replacement coverage. A new navigation action after Back truncates Forward. Opening a complete scene is one `restoreScene` edit plus the normal camera-history result; Undo/Redo restores stored scene values and receives a new execution generation. No inverse floating-point motion. Content-only undo never changes camera. Keep at most100 edit entries and100 camera poses. Histories survive mode/workspace leave in memory, and are not serialized.

Local accepted-motion updates cannot accidentally trigger asynchronous scene restoration through a history listener. The controller distinguishes accepting an already validated runtime pose from explicitly requesting a different scene/history target. Camera equality is prepared-specific, includes body scale/FOV and exact represented position, and treats quaternion sign equivalence separately from serialized identity.

## Restoration and publication

Track `requestedScene`/pending import separately from `publishedPose`/last accepted runtime. On explicit file/history restoration:

1. Settle navigation, close input immediately, record the requested scene/history action and advance restoration generation.
2. Retain the prior view inert where available; cancel stale preparation and drain the previous runtime/client before reacquisition under PC4's sticky cleanup rules.
3. Obtain the current producer configuration, verify world/policy/pose compatibility, create the runtime and prepare required render/collision coverage. Check the restored body's clearance without moving or clamping it.
4. Publish only a current-generation first presentation and unexpired verified session permit. Then expose the accepted pose and re-enable eligible input. Report successful opening only now.
5. On missing helper, unsupported world/scale/domain, occupied body, failed source or cleanup: retain the requested scene, explain the reason, remain inert, and offer the applicable Retry/Undo/Open action. Plane/viewer remain accessible through existing mode handling. No silent default pose or world reseed.

Rapid B→C requests and leaving while B prepares invalidate B before awaiting cleanup. B may finish native work but cannot change C's desired state, published pose, history cursor, input or visibility. Old-runtime deactivation must never overwrite a newer requested scene. File/history jumps are explicit restores, not flight evidence. Reload still starts in Plane under the existing product contract; returning to the saved place is an explicit file open.

The existing mode host can return `outcome:activated` for a failed Landscape request because it successfully activated the viewer fallback. That is a successful Space fallback, not a successful scene restoration. File/history success must be tied to the requested Landscape generation and its own first-presentation/scene identity; never infer it from the host outcome alone. Preserve the outer host's established fallback semantics.

Add a narrow restoration-request callback to existing composition/mode activation, so successful first presentation and fallback remain owned by the mode host. Do not let a workspace's internal restore bypass a superseding mode/workspace token or create a second simultaneous Landscape owner.

## User controls

Provide clearly named Landscape Save/Open scene controls and its own Back/Forward/Undo/Redo controls; viewer controls retain their current handlers. The Open action must remain reachable from Space when Landscape is unavailable, allowing a file request to be retained/retried without pretending the helper exists. A file opened before the first successful Landscape entry uses the metadata-first seeding rule above. Save settles the active gesture and identifies whether it exports an interaction-ready scene or an explicitly pending requested scene; no stale displayed pose is mislabeled as the requested file.

Use actual JSON download/upload, bounded asynchronous file reads and a generation fence on out-of-order reads. A failed or superseded file read cannot replace a newer requested scene. Show persistent preparing/unsupported states through existing status areas. Keep details such as native paths, cache keys and nonce/session identifiers out of the visitor UI. Keyboard shortcuts apply only to the current active/focused Landscape and ignore editable fields/dialogs; no double handling by Plane/viewer.

## Verification and limits

The [frozen card](../../reports/project1-interactive/BI1B-CARD-2026-10-30.md) defines the exact bounded workload and complete scorecard. Registered native-free units cover codec/history/controller and deferred fake-DOM restoration races/clearance failure. One headed actual-file workflow saves a nondefault supported place, closes its resources, restarts the owned helper/browser and imports the actual downloaded file; then exercises both histories and truthful unsupported restoration. The existing Landscape route/finite audits and full maintained gate run on final source. No new mathematical specimen or general performance campaign is justified.

Report all standing targets individually, keep PC4's safe ownership and source/memory limits, and disclose peer reading/execution scope. Promote only through a reviewed PR merged by the advisor. No automatic return on reload, browser-only generation, broader terrain, material treatment or complete BI1.C recovery claim follows from this slice.
