# ATLAS

**An infinite landscape. One equation. Endless discovery.**

A local Mandelbrot observatory with adaptive-precision coordinates, GPU rendering, and 24-bit RGB color. Plain JavaScript, WebGL 2, Web Workers, and a small Node.js server. No runtime packages, accounts, API keys, or external asset requests.

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
```

This starts the server if necessary and opens installed Google Chrome using a separate profile under `artifacts/runtime/chrome-gpu/`. It uses `--use-angle=vulkan` and `--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan`; Chrome's sandbox remains enabled. Close that window to exit the launcher. Your existing Chrome profile and its bookmarks/settings are untouched; ATLAS discoveries in the separate profile are separate too.

Click the engine status at the bottom of ATLAS, or open **Help → Graphics details**, to see the actual renderer and any initialization failure. `GPU` means a disclosed hardware renderer, `SOFTWARE WEBGL` means a recognized CPU graphics implementation, and `CPU` means ATLAS's worker fallback. `WEBGL` alone means the device identity is unknown. The verified device here is **ANGLE / NVIDIA RTX 6000 Ada / Vulkan**, not llvmpipe or SwiftShader. A static view does not continuously redraw, so idle GPU power alone cannot identify the renderer. Chromium documents the [Vulkan backend option](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md); the visible-window configuration above was also tested locally.

## Explore

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
npm test                 # Independent numerical and actual worker tests
npm run build            # Copy the static application into dist/
npm run start -- --dist  # Serve the built application
```

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
| `src/math.js` | Adaptive coordinates, reference orbits, independent exact recurrence |
| `src/perturbation.js` | CPU perturbation and extended-range arithmetic |
| `src/reference.worker.js` | Reference calculation and CPU rendering off the main thread |
| `src/shaders.js` | Direct, perturbation, extended-range, and color shaders |
| `src/renderer.js` | GPU resources, render targets, CPU fallback |
| `src/graphics.js` | Renderer classification and graphics diagnostics |
| `src/app.js` | Navigation, controls, bookmarks, import/export, sharing |
| `src/style.css` | Responsive observatory interface |
| `src/places.js`, `src/palettes.js` | Curated locations and RGB palettes |
| `tests/` | Numerical, worker, and browser regression tests |
| `scripts/` | Local server, build, PNG encoding, thumbnail generation |

No Git repository has been initialized. The existing `AGENTS.md` has been left unchanged.
