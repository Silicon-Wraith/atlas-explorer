# ATLAS session handoff

## User requirements and boundaries

- Build an impressive, fast Mandelbrot explorer with infinite zoom and 24-bit RGB. The user delegated language, platform, design, and implementation choices.
- Operate only in `/mnt/ml_storage/dev/projects/mandelbrot_explorer`.
- Git is not in use; do not initialize it.
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
