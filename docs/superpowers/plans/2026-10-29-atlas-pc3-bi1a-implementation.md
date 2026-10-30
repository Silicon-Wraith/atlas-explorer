# PC3 / BI1.A — application entry and workspace lifecycle

**Status:** BI1.A1 implemented and independently reviewed, 2026-10-29; [full scorecard](../../reports/project1-interactive/PC3-APPLICATION-ENTRY-2026-10-29.md). The pre-implementation [r1 scope/corrections](../../reports/project1-interactive/PC3-CARD-AMENDMENT-2026-10-29.md) narrow execution to BI1.A1. Governing [BI1 design](../specs/2026-10-29-atlas-bi1-application-integration.md); preserved [r0 card](../../reports/project1-interactive/PC3-CARD-2026-10-29.md). Branch `feat/pc3`, project `.worktrees/pc3`, base `9bd2066a9aaaf935f6740944ec9cdac02790eb03`. This first slice does not close all of BI1.

## Task 1 — validated in-memory requested pose

Files: `src/space/preparation/pose.js`, focused registered unit tests, unit manifest.

Validate the finite prepared pose/world value, with explicit convention, canonical origin, local offset, unit orientation, FOV and D/D4 body requirements. Retain it immutably across leave/re-entry. Verify numerical limits against the actual origin/body skin. The persistent model codec, shared-history integration and file UI are deferred to BI1.B; do not register a provisional persisted format or change existing codecs in A1.

Assertions: values contain no native paths/handles/producer epochs; observer size cannot change mathematical identity; unsupported scale/pose is explicit; existing Plane/Space codec outputs remain identical. Check immutable ownership, world binding, invalid inputs and numerical conversion bounds.

## Task 2 — reusable prepared region lifecycle

Files: `src/space/preparation/runtime.js`, reusable PC2 helpers only where explicit injection is needed, focused registered runtime tests.

Extract request/residency/prediction/selection ownership from the PC2 fixture into a DOM-independent runtime. Inject producer, consumer, clock and telemetry. Keep mathematical policy and existing control fixture behavior. Track pending/ready/retiring resources, fine/home protection, safe covered motion/scale and asynchronous suspend/dispose. Separate first surface queries from constant-air decisions in new telemetry.

Assertions: interaction readiness waits for both receipts; view supplies no collision/clearance; no field evaluation in motion; old active coverage stays until safe handoff; caps include retiring resources; leave invalidates publication synchronously; re-entry waits for cleanup. Tests use deferred real lease/PC1 objects and geometry/query doubles to exercise the lifecycle rather than mirror implementation.

## Task 3 — producer-side client lease and same-origin host

Files: `scripts/preparation/application-server.mjs`, a reusable static handler extracted from `scripts/serve.mjs` if required, `scripts/world-preview.mjs`, package scripts, focused pure client/config tests; `src/preparation-bootstrap.js` and `src/preparation-worker.js` composition entries.

Serve the actual app plus preparation endpoints, metadata, physics module and worker entry from one local origin. Reuse the existing native adapter rather than copying math. Keep lazy physics loading in the composition bootstrap and the worker in src, injecting both into Space core. A1 has lazy native initialization, one launcher-owned client, explicit close and request-identity retirement; heartbeat/expiry/multi-tab recovery are deferred. Enforce localhost Host/Origin and same-origin JSON POST for native work; metadata GET cannot generate. Keep ordinary static serve and its forbidden/private path policy. The launcher owns lock, handoff, sandboxed browser/profile and the whole process tree; transient data lives in scratch.

Assertions: cancelled/closed clients cannot publish or retire another client; lost-token responses remain retireable; missing helper falls back inside Space and keeps the ordinary app useful; endpoints reject foreign Origin/Host; ports/paths are explicit; native evidence obeys existing quotas; shutdown cannot claim success while an owned process remains. Test client ownership with deferred objects; real native/HTTP controls run separately under hardware ownership, never from guarded units. Abrupt client loss is owned until server shutdown and reported as an A1 limitation.

## Task 4 — Space mode host and prepared workspace

Files: `src/space/mode-host.js`, `src/space/preparation/workspace.js`, `index.html`, `src/ui/style.css`, small `src/app.js` composition changes, focused fake-DOM/workspace tests.

Compose retained viewer and Landscape owners behind one Space activation interface. Keep the existing viewer inspection/API and initial selection. The prepared workspace owns scene/pose, eligible input, current runtime, status, render loop and release promises. Add an accessible explicit mode selector and movement/scale/exit controls. Keep previous mode visible and inert until current first presentation. Treat pending/failure/superseded states truthfully. Product status omits internal fixture names and cache details.

Assertions: only one input owner; switching/blur/hidden/dialogs stop motion and capture; stale activation never changes focus/visibility; Plane scene and both histories survive; prepared re-entry restores supported world/pose after clearance; failed restoration does not silently reset. Fake DOM tests cover rapid switches and deferred preparation without a browser/GPU.

## Task 5 — early throughput ownership and first application route

Files: runtime scheduling/telemetry from task2, prepared workspace from task4, maintained bounded browser suite under `tests/`, suite manifest and runner wiring.

Make frontier waiting visible and record complete readiness phases. Preserve ordinary speed/tolerance; prioritize needed body coverage and limit optional view interference. Run the first actual application route with real keys: start Plane, enter Space/Landscape, cross `k≠0`, move/reverse, contact, reach the known fine site, shrink/contact/retreat/grow, leave for viewer and Plane, then re-enter the retained supported pose. Explicit mode selection/history actions do not count as flight. A safe guide may help reach the original fine control, but never assign the visitor position to satisfy travel.

Freeze exact duration/repeats in the card before implementation. Report all targets individually, including wait fraction and first-surface telemetry. Preserve misses without broad optimization. Test leave during pending native work and a missing-helper mode. Confirm final-source hardware identity, resource release and process cleanup.

## Task 6 — affected product verification and closure

Files: `README.md`, report/index/checkpoint, this plan, design status and milestone log archive.

Run all registered units/build, affected Plane behavior gate and existing Space shell/interaction checks using the maintained profiles and a clean pinned implementation commit. Product acceptance policy remains in force; document actual evidence rather than infer compatibility from PC2. Obtain independent card/evidence review with explicit source/execution/image scope. Publish all original criteria, observed capability, limits, process cost and BI1.B/BI1.C remaining work. Create a reviewed PR; advisor merges.

## Bounds and progress

First slice bound: three hours implementation/CPU qualification plus one hour bounded application evidence/review, excluding documented external-permission wait. One mechanical fixture repair is allowed with the original attempt retained; no rerun merely to improve the outcome. Stop the affected candidate for lost world/execution identity, unsafe or unowned movement, required-source failure or unconfirmed cleanup. Do not broaden into a production service, artistic pass or implicit-model rewrite.

| Stage | Status |
|---|---|
| Update main and create project worktree | Complete; merged PR19 base verified |
| Source audit, governing design and task plan | Challenged; r1 corrections adopted |
| Frozen first-slice card | r0 preserved; r1 narrows to BI1.A1 before implementation |
| Task1 validated in-memory pose | Implemented; world binding, immutability, orientation and numerical tests pass |
| Task2 extracted prepared runtime | Implemented; coverage, late publication, physical retirement and first-surface controls pass |
| Task3 local host/client/launcher | Implemented; HTTP/native development smoke passes Origin/private-path/early-cancel/payload/release checks. Launcher r0 exposed Playwright's default signal exit bypassing the closure report; explicit application signal ownership repairs it. r1 records cleanup and independent host audit confirms all owned PIDs absent, port closed and GPU lock free. |
| Task4 mode host and workspace | Implemented; focused activation/input/re-entry tests and actual headed app development smoke pass |
| Task5 application route | First final-source route passes in22.804s; both30s lifecycle controls, missing helper, finite geometry/flight audits and cleanup pass.49.943FPS; p99 navigation/readiness targets miss individually. |
| Task6 compatibility/review/report | Full gate passes onbb1d528, clean at start/end with generated report relocation recorded, including1,279 units/build and maintained Plane/Space suites. Full scorecard and independent evidence review20261030T033633Z-411dc5 support bounded closure; source-review/screenshot/sparse-reference limits explicit. |
