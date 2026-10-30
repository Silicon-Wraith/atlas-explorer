# ATLAS session handoff

## Current — 2026-10-30: MD2.A1 generator ownership

[Full scorecard](docs/reports/project1-interactive/MD2A1-GENERATION-OWNERSHIP-2026-10-30.md), [foundation sequence](docs/superpowers/plans/2026-10-30-atlas-world-generation-foundation.md), [roadmap](docs/superpowers/plans/2026-10-29-atlas-browser-world-move-forward.md). Project-owned native runtime and 13 registered regression inputs replace the first-party scratch imports. Exact source edits and five same-host binary controls, opposite order/reuse/rebuild, new source policies, all 1,357 guarded units/86 files/build and 28/28 final gate pass on code/test/certificate head `3d95d7978c38760581f9d2b748eeb9573514570b`. Completed Claude reviews and confirmed physical cleanup are archived. A preflight metadata-startup failure and repair, failed first gate (27/28), separately reviewed r2 audit correction, unchanged-data replay and fresh corrected gate remain distinct; the original one-gate/process-time plan was missed. Later changes are documentation/evidence only. Branch `feat/md2a` in project `.worktrees/md2a` awaits advisor merge; base/main is merged PR23 `af72dbe`. Next MD2.A2 owns canonical-input creation and complete portable recipes, then the Plane workflow and genuine multi-source evidence. No new worlds or production backend are claimed. Regression World evolves with validation needs. Current recipe is still a fixed code/parameter/asset bundle supplied by the native helper; the browser does not create it from Plane. Questions about central independent-user hosting and client/server generation remain design considerations, not an implemented/selected server architecture. Standing Claude-call approval remains.

## 2026-10-23 — Project 1b.1 B15 evidence and documentation handoff

Plane is in `src/plane/`; Space is in `src/space/` (models, numerics, camera/navigation, workspace, render orchestration and the `render/webgpu/` backend). Shared scenes/history/scheduling stay in `src/shared/`; shell/activation UI stays in `src/ui/`. `src/app.js` composes both workspaces. Fresh startup opens Plane and acquires Space's device on first activation.

`npm run dev:gpu` accepts `PORT` or `-- --port N` (CLI wins). A failed Space activation leaves Plane available and displays code-specific WebGPU enablement guidance. The user approved the flagged-Chrome route plus actionable ordinary-browser unavailability as §3 end-to-end behavior. Pending navigation drafts may publish within their still-valid stream; strict settled/refinement and picking rules remain.

Space defaults to **L6b**, with GPU gating inside each navigation submission. L6a remains diagnostic; L6d is available but off. Settled/refinement outcome masks run in a Worker using unsliced typed-array decoding and incremental counts. Validation precedes presentation; a readback lease is held through the Worker acknowledgement.

P3 uses `atlas.p3-timing-budget-v1`, evidence schema 5: at most three of the 2,315 inputs may be more than 4 ms late, none above 8 ms. All raw issuance timestamps are retained. The allowance can change a threshold verdict; application failures still take precedence, and older versions cannot be pooled with these trials. The timer itself still records every anomaly above 4 ms.

Full gates passed on task candidate `bb239892add7ffc18fd30d460420f6472574c0bd` and its tree-identical promotion `31233b5438b8471654bc858c6cf7aca430d576fc`, now `feat/project1b1`. The [regenerated audit](docs/reports/project1b/gate-ledger-1b1.json) of pinned `main..31233b5` accepts all 167 rows: 97 accepted, 4 exceptions, 66 accounted WIP, zero unaccepted. It describes that committed range, not this later documentation change.

The promotion gate's P3 reports passed bulb in 3/3 attempts, quaternion in 3/4 and Menger in 3/4. The [bulb](docs/reports/project1b/1b1-performance-bulb.json), [quaternion](docs/reports/project1b/1b1-performance-quaternion.json) and [Menger](docs/reports/project1b/1b1-performance-menger.json) snapshots retain every attempt, metrics, raw issuance timestamps and clock evidence; omitted event streams remain in the raw files identified by path and SHA-256 in each snapshot. Gate evidence and the live manifest are under `/mnt/ml_storage/scratch/b15-executor5/`.

The separate rerun at `31233b5` records [4K retained-image replacement](docs/reports/project1b/1b1-memory-4k.json) completing in 8470.5/6404.5 ms, peak concurrent tracked allocation 911,524,192 bytes (911.5 MB, including the pool), and [16/16 investigation operations](docs/reports/project1b/1b1-investigation.md). These are exact copies from `/mnt/ml_storage/scratch/b15-final/evidence/`. The standalone records have `handoff: null`; their suite reports have no failure entries but do not provide a positive final cleanup receipt. Retain the original launch/exit receipts to close that provenance gap. The manual flag-routing/unavailability checks at `a593d97` are carried forward by the controller: the only product files changed since are `outcome-masks.js` and `mask-worker-service.js`.

Run `npm test` and `npm run build` first. Diagnostic commands and the headed shell suite are:

```sh
ATLAS_URL=http://127.0.0.1:5195 ATLAS_GPU_HANDOFF="<who, when>" flock /mnt/ml_storage/scratch/atlas-gpu.lock npm run test:space -- --group shell
ATLAS_GPU_HANDOFF="<who, when>" flock /mnt/ml_storage/scratch/atlas-gpu.lock node scripts/perf-smoke.mjs --scene all --port 5247
node scripts/maskbench.mjs
```

Acceptance is headed installed Chrome on the physical GPU, with the full recorded Project 0 profile and confirmed cleanup. The `prewarm` group and three `tests/space-performance.mjs --scene <id>` suites require `ATLAS_COLD_CACHE_ROOT` under scratch. The `memory` group measures an actual 4K retained-image replacement; it does not force in-flight overlap. `--group shell --investigation` records the required workflow. The smoke script creates its own isolated cold caches and measures cadence, confirmation and strict 4 ms issuance anomalies; it is not P3 acceptance. Its `--stalls` mode is diagnostic only. The mask benchmark is CPU-only and reports cold/warm tile and close timings without timing assertions.

The controller owns the remaining commit, gate and promotion. The docs-fast allowlist and output-summary list are empty; these reports and README/HANDOFF therefore take ordinary acceptance. Bring the current integration tip into the task branch, commit the prepared outputs, and full-gate that reviewed candidate. A staged `--no-ff` promotion with the same tree can use recorded fast checks and the candidate gate (plan rev 4.9); retain the historical docs-only-WIP boundary at the already fully gated `31233b5`. Re-audit the final staged head using an extended external manifest before advancing integration. Keep that final audit external so the committed ledger can remain an honest snapshot of `31233b5`. If the promotion changes the candidate tree, review and full-gate the merge. All browser/GPU runs take the exclusive lock; promotion to `main` still requires a reviewed PR and the required integration gate.

The sections below preserve earlier project history.

## 2026-10-20 — Project 1a (Foundations) begins

- The Plane modules now live in `src/plane/`; `icons.js` and `style.css` in `src/ui/`. `src/app.js` remains the entry point. Paths below that name `src/<module>.js` refer to `src/plane/<module>.js` (or `src/ui/`).
- `npm test` runs the Node unit suite through `scripts/run-unit.mjs`. `npm run gate` runs the Plane behaviour gate (spec §16.3) and records each run in `artifacts/gates/`.
- Per charter amendment A1, earlier share links, `localStorage['atlas.discoveries']` bookmarks and version-1 location files are not carried forward; Project 1a replaces them with native scene formats.
- The plan is `docs/superpowers/plans/2026-10-20-project1a-foundations-plan.md`; the sections below describe the 2D explorer as of 2026-10-15.
- Project 1a is accepted when `node scripts/audit-gates.mjs <base> <implementationHead>` reports ACCEPTED: every implementation commit either has its own valid, passing gate record (`accepted`) or is listed in `docs/reports/project1a/gate-exceptions.json` as a user-approved exception (`accepted-by-exception`), whose failed record is kept and which is superseded by a later descendant that passed its own gate. Project 1a has one exception: `c6706b3` failed its workflow suite (a recovery race) and is superseded by its fix `c899416`; history was not rewritten. The summary is `docs/reports/project1a/gate-ledger.json`; the records themselves stay in `artifacts/gates/`.
- Plane now keeps one authoritative scene in a history: undo covers appearance and detail; Back/Forward (Alt+←/→) covers camera moves. Discoveries live in IndexedDB (`atlas-workbench`), shown by the Discoveries control in Your discoveries.

## User requirements and boundaries

- Build an impressive, fast Mandelbrot explorer with infinite zoom and 24-bit RGB. The user delegated language, platform, design, and implementation choices.
- Operate only in `/mnt/ml_storage/dev/projects/mandelbrot_explorer`.
- Git is in use since 2026-10-18; this supersedes the original instruction not to initialise it (charter §6 item 10).
- Preserve the existing `AGENTS.md`. Its initial-project descriptions predate the implementation; use `README.md` and `package.json` for current tooling.
- The user already authorized running the local server and browser tests, including outside the sandbox if needed. Tool policy still controls whether execution is possible.

## Implemented

ATLAS is a local JavaScript/WebGL 2 application with adaptive BigInt coordinates, worker-computed reference orbits, GPU perturbation, extended exponent arithmetic, and a CPU fallback. It includes six palettes, five curated locations, touch/mouse navigation, a tour, bookmarks, exact-coordinate entry, URL sharing, and PNG/JSON export. See `README.md` for architecture, controls, practical precision limits, and the source map.

## GPU initialization and performance follow-up — latest state

- The user's Chrome initially disabled WebGL entirely. Enabling graphics acceleration selected **Mesa llvmpipe**, which is CPU rendering, and still failed context creation. A normal Chrome setting change alone did not select NVIDIA.
- **Native GPU is now verified.** Installed Google Chrome in a visible window works on **NVIDIA RTX 6000 Ada / Vulkan**, driver 580.173.02, with `--enable-gpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan`. Vulkan WebGL alone caused an initial context loss in a visible window; enabling the Vulkan compositor too eliminated it. Chrome's sandbox stays enabled. Do not recommend `--no-sandbox` or global driver changes.
- `npm run dev:gpu` starts the local server if needed and opens installed Chrome in a dedicated profile at `artifacts/runtime/chrome-gpu/`. Existing Chrome tabs/settings remain untouched. Profile-local ATLAS discoveries are separate. Launcher: `scripts/gpu-preview.mjs`.
- Added `src/graphics.js`, truthful GPU/software-WebGL/unknown/CPU labels, and **Graphics details** from the engine status or Help. It shows the selected device, active CPU worker count, and the full context/extension/shader initialization failure. Diagnostics are also exposed as `atlas.graphics`.
- Found and fixed two native shader issues missed by SwiftShader: default low-precision texture samplers and driver reassociation of compensated arithmetic. Ordinary perturbation now uses high/low float reference components and compensated complex math with bitwise splitting and a runtime rounding barrier. Extended-range mode still uses its original separate exponent representation. GPU mantissa accuracy remains finite; do not claim exhaustive exactness.
- The fallback previously used **one worker**, capped width at **720 pixels**, recalculated reference exponents inside every pixel iteration, and called sin/atan2 every iteration. It now keeps a pool of **up to 16 workers**, renders at normal application resolution, prepares references and row/column coordinates once, and uses the equivalent triple-angle identity for stripe coloring. Tiles yield to accept cancellation; frame IDs reject stale results; only a complete current frame is displayed.
- At the user's exact zoom exponents **9.178000000000004** and **11.242000000000006**, old CPU times were **5.1 s / 7.8 s at 720 × 405**. Updated CPU times were **258 / 261 ms at 1280 × 720** (16 workers). Native GPU was **57 / 49 ms at 1280 × 720**, including synchronous framebuffer readback. These are local measurements, not promises for every location. The original GPU numbers in the before report used `finish()` without readback and are not reliable timing comparisons.
- These two user locations did not show a numerical zoom ceiling in sampled exact CPU comparisons. The old fallback's resolution cap and cost explained softness and apparent rendering stalls. Iteration limits still matter at other locations; do not explain these particular samples as an iteration-budget failure.
- **Final checks passed:** 20 browser checks on native NVIDIA, 20 on SwiftShader, 16 numerical/worker tests, both GPU/CPU navigation regressions, installed Chrome visible-window graphics/benchmark checks, and static build. GPU and CPU each passed 36 sampled pixels including both user locations and 10¹⁰⁰⁰; maximum smoothed escape-value error below 0.0001, no classification mismatches. CPU oracle checks include rows across multiple workers.
- Reports: `artifacts/hardware-browser-report.json`, `artifacts/browser-report.json`, `artifacts/navigation-report.json`, `artifacts/graphics-before.json`, `artifacts/graphics-report.json`. Visually inspected `artifacts/hardware-zoom-9.png` and `artifacts/hardware-zoom-11.png`: full-resolution fractals at both reported locations, existing layout preserved.
- Commands: `npm run test:browser -- --hardware` uses Chromium headless with native NVIDIA/Vulkan; `npm run test:graphics` checks installed Chrome with a visible Vulkan window. The latter fails if hardware initialization, numerical samples, real painted pixels, or runtime checks fail. Other browser engines and physical mobile devices remain unverified.

## Initial browser verification — historical

- This session allowed escalated execution of `npm run test:browser`; its command prefix is now approved. Sandboxed local-server startup still failed, so browser verification used the authorized execution outside the sandbox.
- All **19 browser checks**, **15 numerical/worker tests**, both WebGL/CPU navigation regressions, and the **static build** passed after fixes. No browser runtime errors were recorded.
- Browser coverage includes desktop/laptop layout, mouse navigation, mobile touch drag and pinch, mobile settings, palette caching, bookmarks, dialogs, cinema mode, shared URLs, PNG export, JSON export/import, the journey, repeated navigation, and automatic CPU fallback when WebGL or float targets are unavailable.
- WebGL and CPU each matched the independent BigInt oracle's escape/interior classification at 24 sampled pixels across magnifications 10⁰, 10⁴, 10¹⁵·⁵, and 10¹⁰⁰⁰. Maximum smoothed escape-value errors were 0.4685 (WebGL) and 0.0000965 (CPU). Painted CPU RGBA output was also checked.
- These initial WebGL tests used Chromium with ANGLE/SwiftShader software rendering. Native hardware GPU was verified in the later follow-up above; do not generalize the old software timings to hardware.
- Visually inspected screenshots: `artifacts/atlas-desktop.png`, `artifacts/atlas-laptop.png`, `artifacts/atlas-mobile.png`, and `artifacts/atlas-cpu.png`. Structured results are in `artifacts/browser-report.json`; PNG/JSON export samples are alongside them.

## Fixes made during verification

- `src/style.css`: compacted the tall desktop panel to prevent it overlapping gallery tabs. Kept coordinate controls accessible by scrolling on short desktop screens.
- `src/renderer.js`: CPU rendering previously recolored the entire image on each eight-row worker message, producing a 2692 ms main-thread timer gap. The initial optimization reduced that to 46 ms; the subsequent complete-frame presentation fix below measured 34 ms.
- `tests/browser.mjs`: added CPU, responsiveness, touch, layout, tour, JSON, and painted-pixel checks; stabilized screenshots during transitions and writes the report on failures as well as success.
- `README.md`: records completed verification, findings, and remaining platform limitations. `AGENTS.md` remains unchanged; no Git repository was initialized.

## Zoom/pan flicker follow-up

- The user reported double painting on each wheel step. Reproduced WebGL rendering twice at alternating 1280 × 720 / 924 × 520 resolutions. CPU rendering also cleared the visible image before worker rows arrived. Earlier tests checked settled frames and missed these transitions.
- `src/app.js`: removed the reduced-resolution interaction pass and its delayed refinement, removed redundant renders on pointer release, and discards stale render requests before display. Immediately reprojects the previous complete image for responsive navigation.
- `src/math.js`: added exact-coordinate image transforms; tested panning and cursor anchoring through 10¹⁰⁰⁰.
- `src/renderer.js`: checks whether an asynchronous render is still current before publishing. CPU tiles accumulate privately, and only a completed current frame replaces the visible image; canceled work leaves the old image intact. Palette changes remain cached and apply to the replacement frame.
- `index.html` / `src/style.css`: added a fixed interaction surface around the transformable canvas. The interface layout is unchanged.
- `npm run test:navigation` (`tests/navigation.mjs`) passes for WebGL and CPU with a deliberate 100 ms worker delay: one committed image per wheel step, stable resolution, no blank-frame flash, rapid-input stale-frame rejection, and no second render on drag release. Measurements: `artifacts/navigation-before.json` and `artifacts/navigation-report.json`.
- The then-current 19-check browser suite, 15 numerical/worker tests, and build passed after these changes. The subsequent GPU/performance follow-up above adds hardware coverage and multicore rendering while retaining these navigation guarantees.

## Current runtime and future work

- The app is served at **http://localhost:5173**. `npm run dev:gpu` was launched and left open, exec session **98745**, using the dedicated profile. Verify availability after a session restart; process/session persistence is not guaranteed.
- Requested verification and the reported performance fixes are complete. Native NVIDIA performance is now measured. Additional browser/device coverage is optional future work.
- Keep new files and artifacts within this project. Do not bypass denied execution by changing an approved command to run a different operation. Authorization to run the app and browser tests remains in effect; tool policy still controls execution.
