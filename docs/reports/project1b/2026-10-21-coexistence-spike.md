# Project 1b.1 B01 — WebGL 2 and WebGPU coexistence spike

Generated from the suite report of `tests/space.mjs --group coexistence` (plan B01; spec §18, §15, §7.4, §9.1). Generated 2026-10-21T07:27:33.711Z from the working tree based on commit `401c3a5` (the B01 commit itself contains this file). Headed only (Project 0 E7): a headless or software-device result never satisfies a Space requirement (§16.5).

## Conditions

| Condition | Value |
|---|---|
| Browser | installed Chrome 155.0.8059.84 (Official Build) (x86_64) (headed: true, chromiumSandbox: true) |
| User agent | Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 |
| Requested launch arguments | `--disable-dev-shm-usage` `--enable-gpu` `--use-angle=vulkan` `--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan` `--enable-webgpu-developer-features` |
| Effective arguments present | `--enable-gpu` `--use-angle=vulkan` `--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan` `--enable-webgpu-developer-features` |
| Effective arguments missing | none |
| Sandbox / headless / GPU watchdog | no-sandbox: false; headless: false; watchdog disabled: false |
| chrome://gpu active record | vendor 0x10de, device 0x26b1, driver NVIDIA 580.173.2.0 |
| chrome://gpu Graphics Feature Status: WebGPU | Hardware accelerated |
| Suite started | 2026-10-21T07:27:32.144Z |
| Viewport | 1280 × 720, device scale factor 1 |

## 1. Both contexts live in one page

WebGL 2 (Plane): renderer `ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA RTX 6000 Ada Generation (0x000026B1)), NVIDIA)`, vendor `Google Inc. (NVIDIA)`, WebGL 2.0 (OpenGL ES 3.0 Chromium).

WebGPU: device attempt `space-device-1-mvhshx9u-8b72`; a second canvas configured with the preferred format `rgba8unorm`; compute probe {"count":64,"sum":2016,"ordered":true,"queueCompletionMs":3.4000000953674316}.

Plane after acquisition: wheel step zoom 3.85 → 4.03, full resolution 1280 × 720.

WebGL drains (fence + readback) with the WebGPU device alive: after acquisition {"status":"complete","polls":1,"fenceMs":0.8000001907348633,"readbackMs":0.3000001907348633,"elapsedMs":1.5,"pixel":[8,26,41,255]}; after WebGPU work {"status":"complete","polls":1,"fenceMs":1.5,"readbackMs":0.5,"elapsedMs":2.4000000953674316,"pixel":[8,31,48,255]}.

Destroying the WebGPU device: `device.lost` reason destroyed; WebGL drain afterwards {"status":"complete","polls":1,"fenceMs":27.799999713897705,"readbackMs":0.39999961853027344,"elapsedMs":28.59999990463257,"pixel":[8,31,48,255]}.

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

Bound 60000 ms per attempt (plan default 60 s). Cold total 13.5 ms; progress events 8; warm re-preparation total 4.1 ms.

| Stage | Module | Pipeline (createComputePipelineAsync) | Total | Warm total | Compilation messages |
|---|---|---|---|---|---|
| trace | 0 ms | 5.5 ms | 5.5 ms | 1.5 ms | none |
| normals | 0 ms | 5 ms | 5 ms | 1.4 ms | none |
| display | 0 ms | 2.5 ms | 2.5 ms | 0.8 ms | none |

Progress events: [{"set":"cold","stage":"trace","index":1,"total":3,"elapsedMs":5.799999713897705},{"set":"cold","stage":"normals","index":2,"total":3,"elapsedMs":10.900000095367432},{"set":"cold","stage":"display","index":3,"total":3,"elapsedMs":13.5},{"set":"cold","stage":"complete","index":3,"total":3,"elapsedMs":13.5},{"set":"warm","stage":"trace","index":1,"total":3,"elapsedMs":1.5999999046325684},{"set":"warm","stage":"normals","index":2,"total":3,"elapsedMs":3.1999998092651367},{"set":"warm","stage":"display","index":3,"total":3,"elapsedMs":4.099999904632568},{"set":"warm","stage":"complete","index":3,"total":3,"elapsedMs":4.099999904632568}]

Representative trace dispatch (recorded, not a requirement): 128 × 128 rays, submission 0 ms, queue completion 5.1 ms (labelled queue-completion; a fence includes preceding work), termination counts {"hit":1885,"miss":14499,"unresolved":0,"numericalFailure":0}.

## Repeat runs (ordered by start time)

| Run | Started | Cold total | trace | normals | display | Warm total | Dispatch queue completion |
|---|---|---|---|---|---|---|---|
| run1-report.json | 2026-10-21T07:20:20.019Z | 60.6 ms | 22.3 ms | 27.8 ms | 9.6 ms | 4.3 ms | 5.2 ms |
| run2-report.json | 2026-10-21T07:21:28.235Z | 14 ms | 5.8 ms | 5.2 ms | 2.6 ms | 4.1 ms | 5.2 ms |
| run3-report.json | 2026-10-21T07:21:30.161Z | 14.4 ms | 5.8 ms | 5.5 ms | 2.6 ms | 4.5 ms | 5.2 ms |
| run4-report.json | 2026-10-21T07:22:21.419Z | 14.5 ms | 5.8 ms | 5.6 ms | 2.6 ms | 4.2 ms | 5.2 ms |
| run5-report.json | 2026-10-21T07:22:23.402Z | 14.5 ms | 5.8 ms | 5.4 ms | 2.8 ms | 4.3 ms | 5.4 ms |
| run6-report.json | 2026-10-21T07:22:25.302Z | 14.2 ms | 5.7 ms | 5.4 ms | 2.6 ms | 4.3 ms | 5.4 ms |
| run7-report.json | 2026-10-21T07:25:08.726Z | 15.9 ms | 7.1 ms | 5.5 ms | 2.8 ms | 4.1 ms | 5.2 ms |
| run8-report.json | 2026-10-21T07:26:53.314Z | 16 ms | 7.3 ms | 5.5 ms | 2.6 ms | 4 ms | 5.2 ms |
| run9-report.json | 2026-10-21T07:26:55.230Z | 14.7 ms | 6 ms | 5.5 ms | 2.7 ms | 4.1 ms | 5.2 ms |
| run10-report.json | 2026-10-21T07:26:57.352Z | 16.1 ms | 6 ms | 6.1 ms | 3.2 ms | 4.3 ms | 5.3 ms |
| this run | 2026-10-21T07:27:32.144Z | 13.5 ms | 5.5 ms | 5 ms | 2.5 ms | 4.1 ms | 5.1 ms |

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
- "Cold" means a fresh browser profile and a fresh device in a fresh page; the GPU driver keeps an on-disk shader cache across browser processes, so only the first run after a kernel change compiles from scratch. The first row of the repeat-run table shows that case; "warm" re-prepares identical sources in the same device.
- In-page times come from `performance.now()`, which this non-isolated page quantizes to 0.1 ms; sub-millisecond values are bounds, not measurements.
- Launches without the complete recorded profile are separately identified portability experiments and are not represented here.
