# BI1 — prepared worlds in the ATLAS application

**Status:** BI1.A1 / PC3 is implemented and independently reviewed within its bounded scope, 2026-10-29; see the [full scorecard](../../reports/project1-interactive/PC3-APPLICATION-ENTRY-2026-10-29.md). The [r1 scope/corrections](../../reports/project1-interactive/PC3-CARD-AMENDMENT-2026-10-29.md) followed card challenge `20261030T014341Z-f372da` before implementation. Evidence review `20261030T033633Z-411dc5` supports bounded closure. Worktree `/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/pc3`, branch `feat/pc3`, based on merged main `9bd2066a9aaaf935f6740944ec9cdac02790eb03` (PR #19). Full BI1 acceptance remains open. A2/PC4 implementation and individual headed recovery controls now exist; its aggregate fixture, launcher and final-gate acceptance remain open. See the [PC4 full scorecard](../../reports/project1-interactive/PC4-SESSION-RECOVERY-2026-10-30.md). B persistence/history and C device/preparer recovery follow A2.

Governing intent: [North Star](2026-10-23-atlas-north-star-charter.md), [fixed-world clarification](2026-10-29-atlas-multiscale-world-clarification.md), [preparation boundary](2026-10-29-atlas-preparation-boundary.md), [PC2](2026-10-29-atlas-pc2-live-3d-coverage.md), and the [browser-world roadmap](../plans/2026-10-29-atlas-browser-world-move-forward.md). The existing Project 1 scene/history, workspace activation and recovery requirements remain authoritative. The additions below explicitly cover the new prepared model; implicit-model camera/tracing contracts are not silently reused with different meanings.

## Experience and first boundary

Open one ATLAS application URL, enter the fixed mathematical landscape through Space, move using prepared collision, visit the known smaller formation, leave for Plane or the existing fractal viewer, and return to the same world and supported pose. Waiting and unavailable preparation have clear recovery states. The visitor does not operate a separate experiment page or coordinate a helper manually.

The risky assumption is lifecycle integration: the application can retain requested world/pose state while asynchronously preparing and releasing actual rendering/collision resources, without stale activation, input leakage or changes to existing Plane/Space behavior. The native preparation method remains the development control. Browser-only generation, a production service, new worlds, materials and a general optimization campaign are not selected here.

BI1 is split into reviewable increments. **BI1.A1 / PC3** establishes application launch, Space lifecycle, a validated in-memory pose and explicit close with the existing bounded world. **BI1.A2** adds abrupt-client expiry and the multi-tab policy. **BI1.B** adds the prepared scene codec, user-facing scene/history/file workflows and explicit restoration failures. **BI1.C** completes device/preparer interruption and the final integrated route/acceptance evidence. A partial increment does not close all of BI1.

## Audited starting point

- `src/app.js` composes Plane and Space behind `src/ui/workspace-switcher.js`; a fresh start opens Plane. The switcher holds the previous inert view until the current activation reports its first presentation.
- `src/space/workspace.js` owns the existing implicit-model investigation, histories, input and recovery. Its scene adapter registers sphere, box, Menger, Mandelbulb and quaternion Julia. Its right-handed Z-up camera and distance-estimator tracing fields are specific contracts.
- `src/shared/scene.js` already delegates model fields to registered codecs. `shared/history.js` separates camera history from content undo and validates all transitions through a codec. Shared modules contain no native, physics or GPU handles.
- PC2 provides portable world/request/artifact records, tracked leases, live native generation, prepared GPU/collision receipts, enclosure and queries. Its page still mixes experiment route control, DOM wiring and residency ownership; it cannot simply become the application workspace.
- `scripts/serve.mjs` is an owned Node static server; there is no Vite/framework dependency. It currently blocks tests/scripts and private paths. The existing GPU preview profile and bounded gate helpers are available.

## Space presentation and activation

Keep Plane/Space as the top-level workspaces. Add a Space-owned mode host for the retained **Fractal viewer** and **Landscape** investigations. The initial selection remains the existing viewer. Mode selection is explicit and is not encoded as a new mathematical parameter of an old model.

The existing Space workspace continues to own its current scene/history/recovery. A new prepared-world workspace owns its prepared scene, history, input, runtime and recovery. A small `src/space/mode-host.js` coordinates them; the outer switcher still receives one Space-compatible object. Composition injects the two owners and the local physics loader/worker URL. The existing `window.atlas.space` inspection remains the viewer's inspection; prepared/mode inspection is additive and contains diagnostics rather than product controls.

Both mode and workspace changes use increasing activation identities. Starting a replacement closes input immediately; the previous view stays visible and inert until a current first presentation is ready. Superseded completions release their resources and never change visibility/focus. Landscape failure reports its reason and activates the retained viewer within Space, so the outer switcher does not send the user back to Plane. Returning to Space selects its last successfully selected mode. Deactivation cancels active and pending activation, motion, pointer capture and queued requests synchronously, then tracks asynchronous retirement. Re-entry waits for owned cleanup before acquiring replacements. Landscape owns/releases its own renderer/device on leave; viewer ownership remains its existing policy.

Prepared movement is eligible only while its canvas is focused, the workspace/mode is active, no dialog or editable field owns input, and the document is visible/focused. Blur, hidden state, Escape and switching settle the open gesture and stop motion. The two Space modes never process the same navigation event. Plane share-link routing and in-progress exports retain their existing behavior.

## Prepared scene and numerical convention

BI1.A1 implements only the validated in-memory pose/world value and retains it over leave/re-entry. The following persistent codec is a BI1.B contract: introduce `prepared-world@1`, with `workspace: space`, using the existing `atlas.scene` envelope. Do not add it to the implicit-model registry or pass it to distance-estimator camera/rendering functions. The prepared scene adapter registers this codec for its own investigation; existing scene adapters continue to validate their supported models.

The parameters contain the validated PC1 world definition and supported source/policy reference, never a native filename, cached artifact, producer epoch or address used as mathematical identity. Body size and rendering detail are representation/navigation requirements, not inputs that reseed the world.

Use an explicit prepared Y-up metre convention and a distinct camera kind. The pose records the canonical finite origin, a bounded local metre offset, unit orientation, field of view and body diameter (D or D/4 for this candidate). Native requests reconstruct absolute binary64 coordinates only at the boundary inside PC2's documented finite domain; this is not the implicit camera's arbitrary-precision contract. Rendering remains relative to the canonical origin. Validate finite ranges and conversion error against the smallest supported body/skin; unsupported scale or domain is reported, not clamped or rounded into a different place.

The v1 model fields are explicit:

| Field | Prepared-world v1 value/validation |
|---|---|
| conventions | `atlas-prepared-yup-metres-v1` |
| parameters | `{ world }`, with the complete validated PC1 world record; mathematical identity only |
| camera | `{ kind: 'prepared-pose-v1', originM, positionLocalM, orientationWxyz, bodyDiameterM, verticalFovDegrees }`; finite triples, unit quaternion within1e-6, body diameterD orD/4, FOV10–120 degrees |
| slices | Empty array |
| iteration | `null`, explicitly inapplicable to a prepared representation |
| tracing | `{ profile: 'prepared-triangles-v1', coverageProfile: 'pc2-half-d-r1', maxErrorFraction: 0.01 }` |
| appearance | `{ material: 'neutral', lighting: 'pc2-lambert-v1', lightDirection }`, with a finite unit direction matching the retained control initially |
| sampling | `{ profile: 'retained-native-r1' }`; actual artifact sampling remains explicit in PC1 records |

The origin equals the canonical coarse origin from the selected world configuration. Local positions are bounded by the finite lattice extent plus one cube; precise supported-body coverage/clearance still decides publication. No constructor rounds an imported offset into a supported cell. The initial FOV matches PC2's focal scale1.3; the renderer accepts the scene FOV explicitly with its former control default retained. Body diameter belongs to camera/navigation state, not the world's mathematical parameters. The codec supplies every envelope field. Portable JSON never contains a Worker, WASM world, GPU object, request identity or resource lease.

Requested scene state and published interaction state are distinct. Ordinary movement commits only collision-accepted motion. Restoring a pose must prepare coverage and validate the incoming body before publishing it. Pending or unsupported restoration retains its requested state and shows a reason; it cannot silently move the visitor to a default pose. History jumps are explicit user actions and never counted as flight evidence. Camera gestures remain one camera-history entry; content edits use undo. BI1.A1 establishes only the validated in-memory retained pose; BI1.B adds the persistent codec and file/history UI.

## Owned prepared runtime

Extract a DOM-independent region runtime under `src/space/preparation/`. Inject production/consumer preparers, clocks and event sinks. It owns bounded requests, ready/retiring resources, prediction, dependencies and atomic interaction selection. Its interface exposes activation/preparation, accepted movement/scale decisions, observations and tracked suspend/dispose promises. GPU allocation stays in `src/space/render/webgpu/`; mathematical generation and collision work never move into shared modules or motion frames.

Keep PC2's D, domain, sampling, world, fine formation and declared tolerances. Preserve its measured native files, fixtures and evidence as controls. Reusable helpers can receive explicit configuration with their former behavior retained for the control. The application has its own route and final-source evidence.

Retain one active native job/two queued, eight owned interaction regions including pending/retirement, one selected/one transient view, PC1 session capacity13, and source/validation/topology caches96/32/64MiB. Fine interaction protects its home dependency. View work grants no movement clearance and cannot create collision resources. Full-solid and air are explicit approximate classifications; required source unknowns remain unresolved. The enclosing cube test never substitutes for terrain clearance.

Close input before suspension; invalidate request identities before waiting for releases. No stale receipt can revive retired coverage. A nonpreemptive native job may finish, but remains owned and cannot publish to a cancelled client. Every payload, collision world, worker and GPU allocation has a release owner. Cleanup failure is sticky and visible; no automatic reacquisition follows unconfirmed cleanup.

## One launch path and local preparation lifetime

Add one supported local launch command around the existing static-server behavior and native adapter. It serves the actual `index.html` application and same-origin preparation endpoints; no test fixture or scratch page is the product entry. Keep private ports separate from the gate, scratch outputs explicit and dependency configuration producer-side. The ordinary static launch remains usable when the helper is absent; selecting Landscape reports actionable unavailability and permits returning to the viewer/Plane.

The owned launch acquires the GPU lock and records its handoff, starts/stops its server/browser/native process tree with bounded cleanup, and retains the installed sandboxed headed Chrome/Vulkan profile. Native initialization is lazy on Landscape demand, so fresh Plane does not acquire a prepared-world device. Missing dependency bundles fail with their actual configuration reason; do not install host packages or change graphics drivers.

A producer-side client owner tracks publications independently of whether a browser learned a token. Begin/close operations are idempotent; only the current client/runtime/producer epoch can request or retire its resources. Explicit leave sends cancellation/retirement and waits for the existing server record. A1 is one launcher-owned client; abrupt tab loss is cleaned on owned server shutdown, not claimed as expiry. A2 adds the candidate30s expiry/5s heartbeat and multi-tab recovery under its own card. There is no silent takeover of an active client.

The server binds127.0.0.1 and validates Host and Origin. Native/client state changes require same-origin JSON POST; metadata/static GET cannot start generation. Keep the existing static private-path rule. `src/preparation-bootstrap.js` is the lazy physics composition point; `src/preparation-worker.js` is the application worker entry, with dependencies injected into Space core. The configured physics file is served through a specific application endpoint.

The server owns retained native evidence and caches after client cancellation under the existing job/output quotas; keeping bounded evidence is distinct from leaking a browser publication. Shutdown waits for queue/process ownership, using bounded escalation if necessary. A cancelled response must remain retireable by full request identity. Client expiry does not delete canonical sources or disguise failed attempts.

## Readiness, recovery and performance obligations

Treat PC2's13–15% ordinary waiting as an explicit experience limitation. BI1.A exposes truthful preparing/frontier states and measures native/queue/transfer/index/restore/upload/publication time. It cancels obsolete queued work and protects imminent interaction before optional view work. Avoid dispatching a new optional view merely because the instantaneous interaction queue is empty when known imminent interaction is not ready. Do not silently change source accuracy or body speed to improve the comparison.

Report the standing targets (30FPS overall/preparation, navigation p99 2ms/max8ms, interaction readiness1s, attributable region data1GiB) as individual pass/miss/unverified rows. A finite usable experience can advance with explicit performance gaps. Full ownership cannot be inferred from RSS or lease credits. First-surface casts must be distinguished from constant-air decisions and timed preparation warmup.

Device or preparer loss closes input and invalidates execution epochs before client notification. Retain world/pose/history while resources are rebuilt. Never resume from an incompatible world, old producer or stale GPU receipt. BI1.A requires safe interruption/unavailable handling and explicit retry; BI1.C qualifies the full device-loss/repeated-failure policy before claiming recovery parity with the existing viewer.

## Verification and promotion

Each BI1 increment freezes its own experience, bounds, workload, criteria, time limit and stop rule. Unit tests use the guarded runner; browser/GPU tests use bounded helpers, exclusive hardware ownership, installed headed Chrome and confirmed process cleanup. Add maintained suite/manifest entries as needed. Final application evidence is pinned to its own source; PC2's earlier measurements are context, not BI1 acceptance.

BI1.A must verify first activation, superseded activation, mode/workspace exit during preparation and navigation, retained safe re-entry, missing helper, scene/pose preservation and zero cross-mode input. Run the affected existing Plane and Space product checks; do not substitute an experiment smoke for those checks or silently waive the maintained policy. Broader acceptance, save/reopen, full histories and recovery complete in subsequent BI1 cards before the integrated milestone closes.

No new default, production backend, deployment service, material licensing commitment or unlimited-world claim follows from this design. Promotion remains a reviewed PR merged by the advisor.
