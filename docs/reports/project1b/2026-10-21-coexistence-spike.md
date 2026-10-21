# Project 1b.1 B01 — WebGL 2 and WebGPU coexistence spike

Generated from the suite report of `tests/space.mjs --group coexistence` (plan B01; spec §18, §15, §7.4, §9.1). Generated 2026-10-21T07:56:23.074Z from the source checkout at commit `4547180` (each run below names the commit it ran on; this document is committed separately from the code it describes). Headed only (Project 0 E7): a headless or software-device result never satisfies a Space requirement (§16.5).

## Conditions

| Condition | Value |
|---|---|
| Browser | installed Chrome 155.0.8059.84 (Official Build) (x86_64) (headed: true, chromiumSandbox: true) |
| User agent | Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 |
| Requested launch arguments | `--disable-dev-shm-usage` `--enable-gpu` `--use-angle=vulkan` `--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan` `--enable-webgpu-developer-features` |
| Effective arguments present | `--enable-gpu` `--use-angle=vulkan` `--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan` `--enable-webgpu-developer-features` |
| Effective arguments missing | none |
| Sandbox / headless / GPU watchdog | no-sandbox: false; headless: false; watchdog disabled: false |
| chrome://gpu active record | vendor 0x10de, device 0x26b1, driver NVIDIA 580.173.2.0 (1 poll(s)) |
| chrome://gpu Graphics Feature Status: WebGPU | Hardware accelerated |
| GPU handoff (ATLAS_GPU_HANDOFF) | B01 implementer (Fable), 2026-10-21, granted by controller |
| Source | commit `4547180` (clean); served from http://127.0.0.1:5197; served device.js matches the checkout: true |
| Suite started | 2026-10-21T07:56:21.372Z |
| Viewport | 1280 × 720, device scale factor 1 |

Full effective command line (chrome://version):

```
/opt/google/chrome/chrome --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --enable-automation --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --disable-dev-shm-usage --enable-gpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan --enable-webgpu-developer-features --user-data-dir=/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/project1b1-B01/artifacts/runtime/playwright_chromiumdev_profile-001ypY --remote-debugging-pipe --no-startup-window --ozone-platform=x11 --flag-switches-begin --flag-switches-end --enable-unsafe-swiftshader
```

## 1. Both contexts live in one page

WebGL 2 (Plane): renderer `ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA RTX 6000 Ada Generation (0x000026B1)), NVIDIA)`, vendor `Google Inc. (NVIDIA)`, WebGL 2.0 (OpenGL ES 3.0 Chromium).

WebGPU: device attempt `space-device-1-mvhtizld-5f50`; a second canvas configured with the preferred format `rgba8unorm`; compute probe {"count":64,"sum":2016,"ordered":true,"queueCompletionMs":3.6000003814697266}.

Plane after acquisition: wheel step zoom 3.85 → 4.03, full resolution 1280 × 720.

WebGL drains (fence + readback) with the WebGPU device alive: after acquisition {"status":"complete","polls":1,"fenceMs":0.5,"readbackMs":0.20000028610229492,"elapsedMs":1.0999999046325684,"pixel":[8,26,41,255]}; after WebGPU work {"status":"complete","polls":1,"fenceMs":1.5,"readbackMs":0.3000001907348633,"elapsedMs":2.4000000953674316,"pixel":[8,31,48,255]}.

Destroying the WebGPU device: `device.lost` reason destroyed; WebGL drain afterwards {"status":"complete","polls":1,"fenceMs":26.90000009536743,"readbackMs":0.3000001907348633,"elapsedMs":27.90000009536743,"pixel":[8,31,48,255]}; waits: lossObservation: armed 1, rearmed 0, fired false.

## 2. Adapter identity (as observed; nothing invented)

| Field | Observation |
|---|---|
| vendor | `nvidia` (source: adapter.info) |
| architecture | `lovelace` (source: adapter.info) |
| device | `0x26b1` (source: adapter.info) |
| description | `NVIDIA RTX 6000 Ada Generation` (source: adapter.info) |
| isFallbackAdapter | `false` (source: adapter.info) |
| features requested / granted | ["timestamp-query"] / ["timestamp-query"] (timestamp-query granted: true) |
| features available | ["bgra8unorm-storage","clip-distances","core-features-and-limits","depth-clip-control","depth32float-stencil8","dual-source-blending","float32-blendable","float32-filterable","indirect-first-instance","primitive-index","rg11b10ufloat-renderable","subgroup-size-control","subgroups","texture-component-swizzle","texture-compression-bc","texture-compression-bc-sliced-3d","texture-formats-tier1","texture-formats-tier2","timestamp-query"] |

| Limit | Value |
|---|---|
| maxBufferSize | 268435456 |
| maxStorageBufferBindingSize | 134217728 |
| maxUniformBufferBindingSize | 65536 |
| maxTextureDimension2D | 8192 |
| maxComputeWorkgroupsPerDimension | 65535 |
| maxComputeInvocationsPerWorkgroup | 256 |
| maxBindGroups | 4 |
| maxStorageBuffersPerShaderStage | 8 |

## 3. Representative pipeline preparation

Bound 60000 ms per attempt (plan default 60 s). First preparation in this fresh browser profile 14.4 ms (driver-cache state unmeasured); progress events 8; warm re-preparation of identical sources in the same device 4.1 ms.

Timer: `performance.now()` resolution measured in page 0.09999990463256836 ms (smallest positive delta over 4096 samples, 3 distinct deltas); in-page times at or below that resolution are bounds, not measurements. Long tasks observed during preparation and dispatch (PerformanceObserver `longtask`): 1 long task(s) — self at 53.4 ms for 110 ms. Scheduled waits (armed / rearmed / fired): preparationBound: armed 1, rearmed 0, fired false.

| Stage | Module | Pipeline (createComputePipelineAsync) | Total | Warm total | Compilation messages |
|---|---|---|---|---|---|
| trace | 0.1 ms | 5.7 ms | 5.8 ms | 1.4 ms | none |
| normals | 0 ms | 5.5 ms | 5.5 ms | 1.4 ms | none |
| display | 0 ms | 2.5 ms | 2.5 ms | 0.9 ms | none |

Progress events: [{"set":"cold","stage":"trace","index":1,"total":3,"elapsedMs":6.099999904632568},{"set":"cold","stage":"normals","index":2,"total":3,"elapsedMs":11.699999809265137},{"set":"cold","stage":"display","index":3,"total":3,"elapsedMs":14.400000095367432},{"set":"cold","stage":"complete","index":3,"total":3,"elapsedMs":14.400000095367432},{"set":"warm","stage":"trace","index":1,"total":3,"elapsedMs":1.5999999046325684},{"set":"warm","stage":"normals","index":2,"total":3,"elapsedMs":3.0999999046325684},{"set":"warm","stage":"display","index":3,"total":3,"elapsedMs":4.099999904632568},{"set":"warm","stage":"complete","index":3,"total":3,"elapsedMs":4.099999904632568}]

Representative trace dispatch (recorded, not a requirement): 128 × 128 rays, submission 0 ms, queue completion 5.2 ms (labelled queue-completion; a fence includes preceding work), termination counts {"hit":1885,"miss":14499,"unresolved":0,"numericalFailure":0}.

## Repeat runs (ordered by start time; fresh browser profile each; driver-cache state unmeasured)

| Run | Started | Source | First preparation | trace | normals | display | Warm total | Dispatch queue completion | Long tasks |
|---|---|---|---|---|---|---|---|---|---|
| f1-run1-report.json | 2026-10-21T07:56:12.556Z | `4547180` (clean) | 14.3 ms | 5.9 ms | 5.3 ms | 2.7 ms | 4.4 ms | 5.4 ms | 1 |
| f1-run2-report.json | 2026-10-21T07:56:14.766Z | `4547180` (clean) | 14.5 ms | 6.1 ms | 5.3 ms | 2.5 ms | 4 ms | 5.3 ms | 1 |
| f1-run3-report.json | 2026-10-21T07:56:16.709Z | `4547180` (clean) | 14.9 ms | 6.1 ms | 5.5 ms | 2.8 ms | 4.1 ms | 5.3 ms | 1 |
| this run | 2026-10-21T07:56:21.372Z | `4547180` (clean) | 14.4 ms | 5.8 ms | 5.5 ms | 2.5 ms | 4.1 ms | 5.2 ms | 1 |

## Developer-flag experiment (two fresh-profile launches differing only in `--enable-webgpu-developer-features`)

The flag-absent launch is a **portability experiment**: it is never qualification and never replaces acceptance under the complete recorded profile.

| Launch | Developer flag effective | vendor | architecture | device | description | isFallbackAdapter | timestamp-query granted | Probe |
|---|---|---|---|---|---|---|---|---|
| with-developer-flag | true | `nvidia` (source: adapter.info) | `lovelace` (source: adapter.info) | `0x26b1` (source: adapter.info) | `NVIDIA RTX 6000 Ada Generation` (source: adapter.info) | `false` (source: adapter.info) | true | {"count":64,"sum":2016,"ordered":true,"queueCompletionMs":1.9000000953674316} |
| without-developer-flag | false | `nvidia` (source: adapter.info) | `lovelace` (source: adapter.info) | `unavailable` | `unavailable` | `false` (source: adapter.info) | true | {"count":64,"sum":2016,"ordered":true,"queueCompletionMs":5.400000095367432} |

## Passes recorded

- WebGL 2 and WebGPU contexts coexist in one page
- Adapter identity reports observed or unavailable fields truthfully
- A representative pipeline set prepares within the bound with progress events
- WebGPU device destroyed without disturbing WebGL
- No browser runtime errors

## Reading these results

- Coexistence is established for this page, profile and host only; the suite re-establishes it on every gated commit.
- Identity fields are recorded as observed or `unavailable`; physical-GPU acceptance rests on the corroborating chrome://gpu record and the WebGL renderer string, never on an invented device string (§7.4, §9.1).
- Preparation times are representative of the spike kernels, not of the product pipeline set; B11 verifies complete product prewarming (§15 first-use compilation).
- Each run uses a fresh browser profile and a fresh device in a fresh page; the GPU driver-cache state is unmeasured (no cache isolation, clearing or hit/miss observation was performed), so differences between runs are reported, not attributed.
- Launches without the complete recorded profile are separately identified portability experiments and are not represented here except in the labelled experiment section.
