# ATLAS

**An infinite landscape. One equation. Endless discovery.**

A local fractal workbench: an adaptive-precision Mandelbrot Plane and a WebGPU Space for calibration objects, Mandelbulbs and quaternion Julia sets. Plain JavaScript, WebGL 2, WebGPU, Web Workers, and a small Node.js server. No runtime packages, accounts, API keys, or external asset requests.

The [current move-forward plan](docs/superpowers/plans/2026-10-29-atlas-browser-world-move-forward.md) tracks the prepared-world prototype and its planned integration into this application.

The first application integration adds an optional **Landscape** experience inside Space. It uses the retained local native preparer as a development control; the ordinary Plane and fractal-viewer launch paths remain available.

![Seahorse valley, calculated by ATLAS](assets/seahorse.png)

## Run

Requires Node.js 20 or later and a modern browser.

```sh
npm run dev
```

Open **http://localhost:5173**. Dependency installation is unnecessary to run the app. Keep the terminal running; use Ctrl+C to stop it. To choose another port:

```sh
npm run dev -- --port 5174
```

Serve the project over HTTP rather than opening `index.html` directly: browser modules and workers need a server. WebGL 2 with floating-point render targets provides the fastest experience. A worker-based CPU renderer takes over when that capability is unavailable.

On this Linux/NVIDIA workstation, Chrome's default graphics path selected Mesa **llvmpipe**, a CPU renderer, and failed to create WebGL even after graphics acceleration was enabled. Launch the verified NVIDIA/Vulkan configuration with:

```sh
npm run dev:gpu
# PORT also works; --port takes precedence:
npm run dev:gpu -- --port 5195
```

This starts the server if necessary and opens installed Google Chrome using a separate profile under `artifacts/runtime/chrome-gpu/`. It uses `--use-angle=vulkan` and `--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan`; Chrome's sandbox remains enabled. Close that window to exit the launcher. Your existing Chrome profile and its bookmarks/settings are untouched; ATLAS discoveries in the separate profile are separate too.

Click the engine status at the bottom of ATLAS, or open **Help → Graphics details**, to see the actual renderer and any initialization failure. `GPU` means a disclosed hardware renderer, `SOFTWARE WEBGL` means a recognized CPU graphics implementation, and `CPU` means ATLAS's worker fallback. `WEBGL` alone means the device identity is unknown. The verified device here is **ANGLE / NVIDIA RTX 6000 Ada / Vulkan**, not llvmpipe or SwiftShader. A static view does not continuously redraw, so idle GPU power alone cannot identify the renderer. Chromium documents the [Vulkan backend option](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md); the visible-window configuration above was also tested locally.

## Space

For the prepared landscape on this configured Linux/NVIDIA workstation, with the project development dependencies installed:

```sh
npm run dev:world
```

This owns one application server, installed headed Chrome, the GPU lock and a lazily started native preparer. It opens **http://127.0.0.1:5196**. Select **Space → Landscape**. Use WASD to move, Q/E down/up, drag to look, and the wheel or detail buttons to shrink/grow near the original formation. Unprepared coverage pauses movement visibly; move away from surfaces before growing. Return to the viewer or Plane and re-enter to retain the same supported pose during the page session.

Close the owned Chrome window or press Ctrl+C to stop the launcher and its processes. Generated data and the browser's temporary files stay under `/mnt/ml_storage/scratch`. The native Python/Manifold/PyMartini/CuPy bundle and physics module are producer-side configuration described in [the preparation tooling](scripts/preparation/README.md); installation on another host is not yet a supported promise. `-- --port N` selects a private port. `-- --no-browser` is available for an externally managed browser/test, with shutdown still owned by the terminal.

The ordinary `npm run dev` server has no native helper. Selecting Landscape there reports how to enable it and restores the viewer within Space. This first slice retains pose in memory; landscape save/reopen/history UI, abrupt-tab expiry, multi-tab recovery and full device-loss parity are subsequent BI1 work. It does not change the mathematical world when body size changes.

A fresh page opens Plane. Select **Space** to prepare its WebGPU pipelines and open the bulb overview. Space preserves its scene and camera history when switching workspaces. Use the family and parameter controls, orbit, dolly, double-click focus, overview and flight; save/open a scene JSON file to carry the investigation between sessions. A pending draft keeps its own camera/quality identity and is visibly marked pending until current work publishes. Settled images and picking require current geometry.

If WebGPU or an adapter is unavailable, Plane stays usable and the message explains Chrome graphics acceleration, HTTPS/localhost and the separate-profile `npm run dev:gpu` route. The release's end-to-end route is flagged Chrome plus actionable unavailability in an ordinary browser (user decision, 2026-10-22). This does not claim flag-free support on every driver. Quaternion visual captures designated diagnostic by plan rev 5.2 are not acceptance evidence. B15's three P3 scenes passed at promotion `31233b5438b8471654bc858c6cf7aca430d576fc`; the [recorded investigation](docs/reports/project1b/1b1-investigation.md) completed all 16 operations. [HANDOFF.md](HANDOFF.md) records the evidence scope and remaining handoff work.

## Explore Plane

- Scroll to zoom toward the pointer; drag to pan. Double-click to dive four times deeper.
- On touchscreens, drag with one finger or pinch with two. The settings icon opens the complete instrument panel.
- Start from five curated places, including a view beyond ordinary double-precision coordinates.
- Choose six color atmospheres, change color density and phase, or animate the palette without recalculating the GPU fractal.
- Increase **Level of detail** when a boundary needs more iterations. Black pixels can represent either interior points or points unresolved at the current iteration limit.
- Use **Go to** to enter exact decimal coordinates and a magnification exponent. Enter `1000` for 10¹⁰⁰⁰ magnification.
- **Take a journey** automatically visits and zooms into the curated places. Navigating manually stops it.
- **Capture** exports a clean PNG at viewport, Full HD, or 4K width. Save a JSON location separately to retain every coordinate digit and the color settings.
- **Share view** stores the location and settings in the URL. A localhost link works on a machine serving the same app; host `dist/` to share externally.
- Discoveries live in this browser's local storage. JSON export/import makes them portable.

| Key | Action |
| --- | --- |
| `+` / `−` | Zoom in / out |
| Arrow keys | Pan |
| `R` | Return to the whole set |
| `H` | Toggle cinema mode |
| `B` | Bookmark a discovery |
| `S` | Open Capture |
| `?` | Controls and help |
| Escape | Close a dialog, stop the journey, or leave cinema mode |

## How the zoom works

The viewport centre is stored as decimal strings. Navigation uses BigInt fixed-point arithmetic with `max(40, ceil(log10(magnification)) + 36)` decimal places. Coordinates never pass through a JavaScript `Number` before deep-zoom calculations.

A worker computes one high-precision reference orbit. The GPU follows nearby pixels using the perturbation identity `δz → 2Zδz + δz² + δc`, rebasing when the pixel orbit becomes smaller than its deviation or the reference ends. Ordinary perturbation uses compensated pairs of floats, high-precision texture samplers, and arithmetic barriers to preserve intermediate rounding on native drivers. At 10²⁸ magnification, the shader switches to separate mantissas and binary exponents to avoid float underflow. The CPU fallback uses the same strategy with 64-bit mantissas and switches to extended range before double underflow.

The CPU fallback uses a persistent pool of up to 16 workers, bounded by reported CPU concurrency and image size. It renders at the application's normal resolution, converts reference exponents once, and precomputes coordinate offsets by row/column. Orbit stripes use the triple-angle identity instead of per-iteration sine and atan2 calls. Workers yield between tiles so a new navigation request can cancel obsolete work promptly. The complete-frame swap still prevents partial-frame flicker.

Escape values and orbit texture are cached in a floating-point framebuffer. A separate color pass produces 8-bit red, green, and blue channels, making palette changes inexpensive. Navigation keeps a stable rendering resolution and immediately moves/scales the last complete image while the next view is calculated. Superseded calculations are discarded before display. The CPU fallback assembles a complete frame before replacing the previous one, so navigation does not clear the screen or reveal incomplete rows.

There is no preset magnification ceiling. Available memory, computation time, finite iteration budgets, and mantissa accuracy remain practical limits. The numerical tests exercise navigation and escaping pixels at 10¹⁰⁰⁰ against an independent BigInt recurrence; this is not a claim of constant frame rate or exact classification at every boundary pixel. GPU performance and accuracy depend on the browser and graphics driver.

The mathematical approach follows [Claude Heiland-Allen's deep-zoom notes](https://mathr.co.uk/web/deep-zoom.html). All artwork in `assets/` is calculated from the Mandelbrot set by this project's renderer.

## Build and verify

```sh
npm test                 # Node unit tests (numerical, worker, contracts); never a browser or GPU
npm run build            # Copy the static application into dist/
npm run start -- --dist  # Serve the built application
ATLAS_GPU_DEFERRED="<reason>" flock /mnt/ml_storage/scratch/atlas-gpu.lock npm run gate   # Plane gate without the GPU suites (exit 2 = pending)
ATLAS_GPU_HANDOFF="<who, when>" ATLAS_B15_REPORT_DIR=artifacts/b15-reports ATLAS_COLD_CACHE_ROOT=/mnt/ml_storage/scratch/atlas-cold flock /mnt/ml_storage/scratch/atlas-gpu.lock npm run gate # Full gate (exit 0 = passed)
```

Every browser/GPU run takes `flock /mnt/ml_storage/scratch/atlas-gpu.lock`. Space acceptance uses installed Chrome headed, sandbox enabled, with the recorded Project 0 Vulkan/WebGPU profile; a software or headless result cannot qualify Space numerical/rendering/performance targets. Use an uncontended standalone port such as 5195. The three P3 suites and the cold-prewarm group require `ATLAS_COLD_CACHE_ROOT`; each launch gets empty isolated cache directories and a fresh browser profile.

```sh
ATLAS_URL=http://127.0.0.1:5195 ATLAS_GPU_HANDOFF="<who, when>" flock /mnt/ml_storage/scratch/atlas-gpu.lock npm run test:space -- --group shell
ATLAS_URL=http://127.0.0.1:5195 ATLAS_GPU_HANDOFF="<who, when>" ATLAS_COLD_CACHE_ROOT=/mnt/ml_storage/scratch/atlas-cold flock /mnt/ml_storage/scratch/atlas-gpu.lock node tests/space.mjs --group prewarm
# With those environment variables exported: --scene bulb, quaternion, or menger
flock /mnt/ml_storage/scratch/atlas-gpu.lock node tests/space-performance.mjs --scene bulb
node tests/audit-acceptance.mjs # Offline real-Git audit integration; no browser/GPU
```

Space uses **L6b** by default: navigation drafts use GPU gating within their submission. L6a remains a diagnostic comparison; asynchronous L6d is available but off. Settled/refinement masks belong to a Worker, which uses unsliced typed-array decoding and incremental counts; each sample is validated before presentation, and its readback lease remains held until acknowledgement.

P3 acceptance uses `atlas.p3-timing-budget-v1` (evidence schema 5): among the complete 2,315 inputs, at most three may be strictly more than 4 ms late, and none may exceed 8 ms. Every raw scheduled/observed timestamp remains recorded. A fourth anomaly or one above 8 ms makes timing inconclusive; established application failures still take precedence. This allowance can change a threshold verdict. Older record versions or different timing policies cannot be pooled with these trials; the absolute timer and its strict 4 ms anomaly flag are unchanged.

These diagnostic commands complement the full gate:

```sh
# Headed GPU smoke; output and isolated cold caches go under scratch.
ATLAS_GPU_HANDOFF="<who, when>" flock /mnt/ml_storage/scratch/atlas-gpu.lock node scripts/perf-smoke.mjs --scene all --port 5247
# CPU-only 4K mask benchmark; no browser, GPU or timing assertions.
node scripts/maskbench.mjs
```

`perf-smoke.mjs` measures completed and published draft cadence, latency, publication confirmation and issuance lateness. It is diagnostic, uses a strict zero-anomalies-above-4-ms check, and cannot satisfy P3 acceptance. Its optional `--stalls` probe perturbs issuance and disables pass classification. `maskbench.mjs` reports cold and warm decode/close timings for the Worker algorithm in one Node thread; its optional arguments are `[source-root] [worker|sliced|legacy]`.

Promotions to `main` use a reviewed PR only. Feature, WIP, promotion and integration evidence follow the versioned 1b.1 acceptance manifest; fast-check records cannot substitute for full gates. The 1b.1 audit range is pinned `main..implementationHead`, excluding histories already shipped on main.

For the full gate, `ATLAS_B15_REPORT_DIR=artifacts/b15-reports` keeps live P3/prewarm evidence outside the tracked documentation tree; copy reviewed snapshots to `docs/reports/project1b/` afterward. The gate runs only on a clean commit. It starts its own server on port 5190, runs the unit tests, the build and every browser suite under hard time limits, classifies each one (`passed`, `failed`, `deferred`, `not-run`, `incomplete`), and records the result in `artifacts/gates/`.

Browser tests use Playwright as the only development dependency:

```sh
npm ci
npx playwright install chromium
npm run test:browser
npm run test:navigation  # Check frames during zooming and panning
npm run test:browser -- --hardware  # Native NVIDIA/Vulkan, Chromium headless
npm run test:graphics    # Installed Chrome, visible window, NVIDIA/Vulkan benchmark
```

The browser suite checks desktop/laptop layout, palette caching, mouse navigation, bookmark persistence, cinema mode, dialogs, deep coordinates, shared links, PNG and JSON export, JSON import, the journey, and mobile settings and touch gestures. It checks GPU and CPU samples against the independent BigInt oracle, verifies painted CPU pixels, forces automatic fallback with missing WebGL/float-target support, and measures repeated navigation and CPU responsiveness. It writes screenshots and a report to `artifacts/`. Browser profiles and temporary files stay under `artifacts/runtime/`. It requires permission to launch Chromium and bind/connect to localhost.

Verification on **2026-10-15** now includes the physical **NVIDIA RTX 6000 Ada** using Vulkan, in addition to SwiftShader software WebGL. All **20 browser checks passed on each backend**, all **16 numerical/worker tests** passed, and both navigation regression paths passed. Desktop (1440 × 1000), laptop (1280 × 720), mobile touch emulation (390 × 844), and CPU fallback are covered. See [the hardware browser report](artifacts/hardware-browser-report.json), [software browser report](artifacts/browser-report.json), and [visible Chrome probe](artifacts/graphics-report.json).

Native GPU and CPU each passed 36 sampled pixels across magnifications 10⁰, 10⁴, 10¹⁵·⁵, 10¹⁰⁰⁰, and both user-reported locations (zoom exponents 9.178 and 11.242). Maximum smoothed escape-value error was below 0.0001, with zero escape/interior classification mismatches. These are sampled checks, not exhaustive accuracy guarantees. Other browser engines and physical mobile devices remain unverified. The former SwiftShader-only checks missed native texture precision and driver arithmetic optimization problems; those are now fixed and covered by the hardware run.

At the two reported locations, the old single-worker fallback measured 5.1 s and 7.8 s at **720 × 405**. The updated fallback measured about **260 ms** at **1280 × 720**, using 16 workers. Native GPU measured **57 ms and 49 ms** at that same full resolution, including synchronous framebuffer readback to ensure actual completion. See [before](artifacts/graphics-before.json) and [after](artifacts/graphics-report.json). These are local measurements, not a constant-frame-rate promise for every zoom or boundary; reference cost and required iterations still depend on the location. The original GPU timings in the before report used `finish()` without readback and should not be used for comparison.

Browser verification fixed overlapping desktop controls and restored access to exact-coordinate entry on shorter screens. CPU rendering caches palettes and colors each completed frame once, instead of recoloring the entire image for every worker tile. In the native browser run, the repeated-zoom CPU check at a 960 × 720 viewport had a maximum timer gap of 75 ms, down from 2692 ms before the original optimization, while now rendering at full viewport resolution. This measures main-thread availability during that scenario; timings depend on the machine and view.

The navigation regression adds a 100 ms worker delay to expose intermediate frames. It reproduced two WebGL renders per wheel step with a resolution switch, and a CPU image-clear flash. After the fix, both paths commit one image per step at stable dimensions, retain the previous image during calculation, discard stale frames during rapid wheel input, and avoid an extra render on pointer release. See the [before](artifacts/navigation-before.json) and [after](artifacts/navigation-report.json) measurements. Earlier browser checks waited for rendering to settle and did not catch this transient flicker.

Regenerate the actual fractal thumbnails with `npm run thumbnails`. This CPU operation may take a minute or two. To regenerate one, use `node scripts/thumbnails.mjs seahorse`.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/plane/math.js` | Adaptive coordinates, reference orbits, independent exact recurrence |
| `src/plane/perturbation.js` | CPU perturbation and extended-range arithmetic |
| `src/space/workspace.js`, `src/ui/workspace-switcher.js` | Space scene/history, navigation, preparation, recovery and workspace activation |
| `src/space/models/`, `src/space/numerics/`, `src/space/camera.js` | GPU-independent model/numerical/camera contracts |
| `src/space/render/`, `src/space/render/webgpu/` | Space orchestration, tracked resources, WebGPU passes and WGSL |
| `tests/space.mjs`, `tests/space-performance.mjs` | Headed Space suites, investigation, cold prewarm, allocation measurement and frozen P3 workloads |
| `src/plane/reference.worker.js` | Reference calculation and CPU rendering off the main thread |
| `src/plane/shaders.js` | Direct, perturbation, extended-range, and color shaders |
| `src/plane/renderer.js` | GPU resources, render targets, CPU fallback |
| `src/plane/graphics.js` | Renderer classification and graphics diagnostics |
| `src/app.js` | Composition root: shell, storage, discoveries, the Plane workspace |
| `src/plane/workspace.js` | Plane lifecycle, controls, undo and camera history, sharing, import/export |
| `src/plane/navigation.js` | Pointer, wheel, touch and key navigation |
| `src/plane/scene-adapter.js` | Plane scenes, the detail/zoom iteration policy, share links and scene files |
| `src/plane/render-adapter.js`, `src/plane/export.js` | Render requests, outcomes and reports; the exclusive, immutable image export |
| `src/shared/scene.js`, `src/shared/commands.js`, `src/shared/history.js` | Scene envelope and fingerprints, domain-owning commands, undo and camera history |
| `src/shared/render-request.js`, `src/shared/render-report.js` | Immutable render requests and truthful reports |
| `src/shared/discoveries.js`, `src/shared/persistence.js` | Discovery records, sources and controller; IndexedDB storage |
| `src/ui/` | Shell, dialogs, notifications, the Discoveries control, icons and styles |
| `src/plane/places.js`, `src/plane/palettes.js` | Curated locations and RGB palettes |
| `tests/` | Unit tests (`tests/unit/`, `tests/math.test.js`), browser suites (`tests/*.mjs`) and support |
| `scripts/` | Local server, build, PNG encoding, thumbnail generation |

Git is in use; Project 1a was developed on `feat/project1a`. Read `AGENTS.md` for the repository workflow.

The Project 1a gate audit distinguishes commits with their own passing gate (`accepted`) from explicit user-approved exceptions (`accepted-by-exception`). Exceptions are recorded in `docs/reports/project1a/gate-exceptions.json`; the audit summary lists each decision and both gate records in `docs/reports/project1a/gate-ledger.json`.

Licensed under MIT; see [LICENSE](LICENSE).

The inspection API `atlas.space.requestCamera(pose, {phase})` defaults to a settled `commit`; `preview` follows the drag path and the final commit records one history entry. `onRequest` covers requests created by the workspace submission path, before handing them to recovery. Workspace resize submissions are included; direct renderer calls and internal recovery replays are excluded; their results remain visible through `onReport`. These are developer inspection APIs, not user controls.
