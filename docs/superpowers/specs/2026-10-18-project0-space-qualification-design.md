# Project 0 — Space Backend Qualification

**Status:** draft for user approval · **Date:** 2026-10-18
**Authors:** Claude and Codex, co-designed as peers (`docs/codesign/conversation-log.md`)
**Governed by:** `docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md`

## 1. Problem

The charter selects a single production backend for Space. WebGPU is preferred because it
offers compute passes, storage buffers, explicit limits and timestamp queries. Nothing yet shows
that WebGPU works on this workstation, though:
- ATLAS's verified ANGLE/Vulkan path is evidence about **WebGL**;
- Chrome's 2026 notes on Linux/NVIDIA WebGPU say nothing about this installed browser and session.

Separately, nobody has measured how deep `f32` Mandelbulb rendering stays trustworthy, or
whether selective compensated arithmetic is worth its cost.

## 2. Outcome

Project 0 produces **evidence and a decision, not product code**:
1. **A qualification report** at `docs/reports/<date>-project0-qualification.md` (dated the day it is written), with raw
   per-trial results alongside it as JSON. The report reaches one of four outcomes:
   - **WebGPU selected**;
   - **WebGL 2 selected** (naming the WebGPU gate that failed);
   - **no-go** (neither qualified, so the rendering assumptions must be revised before Project 1);
   - **inconclusive** (evidence could not be collected, for example because the browser could
     not be launched under the available permissions; this is not evidence that the API fails).
2. **A precision report section:** f32 limits and the result of the compensated prototype.
   A negative result is a valid, successful outcome.

The prototype code is **disposable**:
- It lives in `spikes/project0/`.
- Nothing in `src/` imports it.
- Project 1 does not inherit it as a foundation.

What does carry forward is the fixture definitions, the measurement methods and the report.

## 3. Frozen workload

Fixture definitions are committed in `spikes/project0/fixtures.json` **before any timing run**.
The report cites the freezing commit. Changing a fixture after measuring invalidates earlier trials.

| Fixture | Definition |
|---|---|
| `sphere` | Radius 1 at the origin; exact signed distance. |
| `box` | Axis-aligned, half-extents (1, 0.5, 0.25), rotated 30° about Z; exact exterior distance. |
| `menger-1`, `menger-2` | Finite Menger sponge in [−1, 1]³ at depths 1 and 2. The reference is a CPU enumeration of the occupied boxes (20 and 400), giving exact ray intervals and exact exterior distance (the minimum point-to-box distance). The compact GPU routine is classified by what the comparison establishes (charter §3.4). |
| `bulb-overview` | Mandelbulb, power 8, bailout radius 2, with the camera 2.5 from the origin looking at it. Vertical field of view 60°, Z up. |
| `bulb-detail` | The same Mandelbulb, approached along a fixed ray (part of the frozen fixture) to the first surface point the CPU reference finds. Camera distances to that point are 0.05 and 0.005. |
| `bulb-stress` | Mandelbulb with a camera grazing a high-detail region. The iteration and step caps are reached on most pixels. Used for cancellation and exhaustion tests, not throughput. |
| `qjulia-plane` | Quaternion recurrence qₙ₊₁ = qₙ² + c, with c = −0.2 + 0.8**i**. Starting points are a 64 × 64 grid on the invariant plane q₀ = x + y**i** (world z = 0), over [−1.5, 1.5]². |

**Draft profile:**
- 1280 × 720 display and 640 × 360 internal samples, one primary ray per sample;
- at most 64 recurrence iterations and 256 ray steps;
- direct shading only, with no shadows, ambient occlusion or accumulation;
- per-fixture tracing tolerances recorded in the fixture.

**Settled profile:** 1280 × 720, a single sample, at most 128 iterations and 512 steps,
direct shading.

These are benchmark settings, not Project 1 defaults.

**Coverage checks.** A fixture run is invalid in either of these cases:
- it misses everything;
- its exhausted-ray fraction is above the fixture's declared expectation.

A fast image of nothing does not pass.

## 4. Mandatory gates (WebGPU, and the WebGL 2 prototype if needed)

| Gate | Pass condition |
|---|---|
| G1 Actual hardware | NVIDIA execution is shown both in the target visible Chrome session (the `npm run dev:gpu` profile) and in an automated headless numerical run. The run records browser, driver, session type, adapter information and launch flags. Software execution fails the gate. |
| G2 Repeatable startup | Three fresh browser-process launches each reach a valid first draft within 10 s, with the preparation status visible. First-use and warmed times are reported separately. |
| G3 Analytic correctness | `sphere`, `box`, `menger-1` and `menger-2`. Hit/miss agrees exactly on the declared non-tangent rays, and depth error is ≤ 10⁻⁴·L, where L is the fixture's characteristic length. Tangent and edge rays have separate, declared expectations. |
| G4 Fractal arithmetic | Independent CPU (double) and GPU samples of the Mandelbulb recurrence agree within quantity-specific tolerances fixed in `fixtures.json` before execution. Stable escape classifications agree; boundary samples that are ambiguous in advance are listed and excluded from the agreement count. |
| G5 Quaternion embedding | `qjulia-plane` GPU samples agree with the independent complex recurrence z → z² + c on the CPU: escape iteration exactly, and escape value within the declared tolerance, excluding listed ambiguous points. |
| G6 Draft throughput | `bulb-overview` and both `bulb-detail` cameras. In each 30-second scripted-movement trial: at least 30 distinct drafts per second completed and published, and a p95 frame interval of 50 ms or less. |
| G7 Interaction latency | p95 time from the latest request to a new draft is 100 ms or less on the ordinary fixtures. Re-presenting the previous image does not count. |
| G8 Cancellation under stress | Running `bulb-stress` and then requesting the simple `sphere`: within 250 ms of the final request, stale work no longer delays the new scene, and no obsolete result is ever published. |
| G9 Main thread | During warmed navigation, no recurring application task exceeds 50 ms. Harness overhead is identified separately. |
| G10 Settled render | At the settled profile, one frame of each ordinary fixture completes within 2 s. |
| G11 Resources | The planned 3840 × 2160 resource layout is allocated and exercised within an application cap of 1 GiB of GPU allocation, covering allocation, readback and cancellation. This is not a 4K render, and no PNG is produced. |
| G12 Stability | A 10-minute mixed workload finishes with no unhandled errors and no unplanned device loss. After repeated resize and replacement, live resource counts and tracked allocations return to the documented budget. |
| G13 Loss and recovery | A simulated device loss interrupts the running job: success is not reported, the scene and request are preserved, and a valid render follows reinitialisation. Both intentional `destroy()` and the unexpected-loss control flow are tested. |

## 5. Measurement method
- **Trials:** three warmed 30-second trials per throughput fixture. Each trial is recorded and
  must pass on its own. An external interruption may justify a documented rerun; slow trials are
  never deleted selectively.
- **What is recorded:**
  - pipeline preparation time;
  - completed GPU work;
  - CPU scheduling and submission overhead;
  - draft publication, with a visible-output check;
  - readback.
- **GPU timing:** use timestamp queries where available. Their absence does not fail a backend;
  queue-completion and readback timings are used instead, and are labelled as such rather than
  as shader time. `onSubmittedWorkDone()` shows that queue work has completed, not that the
  frame has appeared on screen.
- **Batch size:** submissions target about 10 ms or less of GPU work per batch, with a shallow
  queue. G8 is the acceptance criterion facing the user.

## 6. Decision procedure
1. **Qualify WebGPU against G1–G13.** If every gate passes, select WebGPU. Do **not** build a
   WebGL 2 comparison just to chase a higher FPS figure. No speedup over WebGL 2 is required.
2. **On a failure, classify it:**
   - an *implementation defect*: fix it and rerun the affected gates;
   - a *launch or configuration problem*: try a documented setting local to the session;
   - a *backend limitation* or persistent failure: mark WebGPU unqualified.
   Only **one bounded remediation pass** is allowed.
3. **If WebGPU is unqualified:** build a minimal, disposable WebGL 2 prototype with equivalent
   output and workload, and qualify it against the same gates. G11 and G13 are adapted to their
   WebGL equivalents: context loss, and an allocation limit expressed in render targets. The
   adaptation is written down before running. If it passes, select WebGL 2 and record which
   WebGPU gate failed.
4. **If neither passes:** the outcome is no-go. Do not lower quality silently, switch to a
   native application, or promise that Project 1 will resolve it.

## 7. Abort conditions
Stop the affected experiment immediately, preserve the smallest reproducer and report before
retrying if any of these happens:
- an unexpected GPU reset or device loss;
- an unrecoverable browser hang;
- a submission making no observable progress for 5 s;
- the allocation cap being exceeded;
- software execution detected during a supposed hardware measurement.

A harness timeout is a stop condition. It is not a claim that GPU work already submitted was cancelled.

**Never** do any of the following to obtain a pass:
- disable the browser sandbox or GPU watchdogs;
- change global drivers, compositor settings or host packages (NVIDIA driver and DKMS included);
- run `apt` upgrades.

When a numerical result is wrong, stop treating the output as a valid benchmark. Reproduce and
diagnose the problem before quoting any performance figure.

## 8. Precision experiment (not a backend gate)
1. **f32 baseline.**
   - **Setup:** the camera approaches a fixed `bulb-detail` surface point along its normal, at
     distances of 10⁻¹, 10⁻², … 10⁻⁸ (one per decade).
   - **Measured at each distance:**
     - world-space pixel footprint;
     - iteration count;
     - tracing tolerance;
     - depth and silhouette disagreement against a CPU double-precision reference ray marcher
       on a 64 × 64 sample subset;
     - cost.
   - Visual inspection supplements the numbers but does not replace them.
   - **Report:** the depth at which disagreement crosses a declared threshold. This is the
     *measured f32 floor*.
2. **One compensated prototype.**
   - **Compensated (float-float):**
     - the ray-origin offset relative to the camera;
     - the accumulated ray parameter t, and therefore the sample position;
     - the Cartesian iterate components (x, y, z) through each power step.
   - **Ordinary f32:** r, θ, φ, the trigonometric power evaluation, the running derivative and
     the normal estimation. These are named explicitly, because they may dominate the error.
   - **Measured:** the same scenes and tolerances as the baseline, comparing accuracy gained
     against completed-work cost and resource cost, and the range over which any improvement holds.
   - Compensation cannot recover distinctions already lost when the sample coordinate was built.
3. **Outcome.**
   - A negative result closes the experiment successfully.
   - A promising result becomes a separately reviewed recommendation. It does not enlarge Project 1.
   - New compensated transcendental functions are **out of scope**.

## 9. What this does not do
- No product UI, no change to Plane, and no `src/` changes beyond what the spike harness reads.
  The spike reads `src/` but never modifies it.
- No Mandelbox and no shadows, AO or accumulation. Also absent: the bridge UI, scene formats and exports.
- No WebGL 2 prototype unless WebGPU fails qualification.
- No optimisation project. One remediation pass, then a decision.

## 10. Execution notes
- Reuse ATLAS's launch knowledge (`scripts/gpu-preview.mjs`, `tests/graphics.mjs`): a
  separate Chrome profile under `artifacts/runtime/`, the sandbox enabled, and Vulkan flags as
  documented.
- **Data locations:** raw results go to `artifacts/project0/`, which is git-ignored, and are
  summarised in the committed report. All files stay inside this project.
- **CPU references** (double precision) live in `spikes/project0/reference/` and are tested in
  Node before any GPU comparison.

## 11. Done means
- `fixtures.json` was frozen and committed before timing.
- Every gate has a recorded pass or fail, with per-trial evidence.
- The precision section reports the baseline and the prototype result.
- The decision follows §6 mechanically from the gate results.
- The report has been reviewed jointly by Claude and Codex and presented to the user.
- The Project 1a and 1b specs are then written against the selected backend.
