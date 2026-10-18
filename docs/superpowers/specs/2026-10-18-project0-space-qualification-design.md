# Project 0 — Space Backend Qualification

**Status:** draft for user approval · **Date:** 2026-10-18 · **Revision:** 3 (after Codex's
second author review)
**Authors:** Claude and Codex, co-designed as peers
**Governed by:** `docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md`

## 1. Problem

The charter selects a single production backend for Space. WebGPU is preferred because it offers
compute passes, storage buffers, explicit limits and timestamp queries. But no evidence yet shows
that WebGPU works on this workstation:
- ATLAS's verified ANGLE/Vulkan path is evidence about **WebGL**, not WebGPU.
- General browser support announcements do not establish availability or correctness on the
  installed browser, driver and session.

Separately, nobody has measured how `f32` Mandelbulb rendering disagrees with a double-precision
reference as the camera approaches the surface. Nor has anyone measured whether selective
compensated arithmetic is worth its cost.

## 2. Outcome

Project 0 produces **evidence and a decision, not product code**:
1. **A qualification report** at `docs/reports/<date>-project0-qualification.md`, dated the day
   it is written. Compact per-trial JSON summaries go beside it. They record:
   - the fixture and code revisions;
   - the launch configurations;
   - hashes of the larger artefacts.

   Bulky traces, images and captures go in `artifacts/project0/`. That directory is git-ignored
   and local-only, and the report says which artefacts exist only there.
2. **One of four outcomes** (§6):
   - **WebGPU selected**;
   - **WebGL 2 selected**, naming the WebGPU gate that failed;
   - **no-go**: both attempted backends are unqualified after the permitted remediation;
   - **inconclusive**: the evidence is missing or invalid, for example because the browser
     could not be launched under the available permissions. Missing evidence is never recorded
     as a backend failure.
3. **A precision section** (§8), reported separately from backend selection. A negative result is
   a valid outcome. If the experiment could not run safely, the report says so rather than
   inventing a result.

**Prototype code is disposable:**
- it lives in `spikes/project0/`;
- nothing in `src/` imports it;
- Project 1 does not inherit it as a foundation.

**What carries forward:** the fixture definitions, the measurement protocols and the report.

## 3. Frozen workload

**Normative source.** Appendix A of this spec defines the workload, and
`spikes/project0/fixtures.json` serialises Appendix A before qualification begins. The report
cites the commit that froze it.

**Preparation before freezing.** CPU-only fixture preparation may establish reference data
before the freeze: anchors, expected coverage and the list of ambiguous samples. Cameras,
tolerances, expected coverage and exclusions are never chosen using GPU results or performance results.

**Changing a frozen fixture** creates a new fixture version. Earlier evidence stays available,
but it cannot qualify the revised workload.

**Profiles.** These are benchmark settings, not Project 1 defaults.
- **Draft:**
  - 1280 × 720 display, 640 × 360 internal samples, one primary ray per sample;
  - at most 64 recurrence iterations and 256 ray steps;
  - the A.5 shading model, with no shadows, ambient occlusion or accumulation.
- **Settled:**
  - 1280 × 720, a single sample;
  - at most 128 iterations and 512 steps;
  - the same shading.

**Coverage rule.** A fixture run is **invalid** if its hit, miss or unresolved fractions fall
outside the declared ranges (A.6). A fast image of nothing does not pass.

## 4. Mandatory gates

Each gate applies to the backend under qualification. Appendix A supplies every number, ray,
path and sequence a gate refers to.

| Gate | Pass condition |
|---|---|
| G1 Actual hardware | **Setup:** the installed Chrome executable, launched with the documented configuration (`scripts/gpu-preview.mjs` flags) and dedicated Project 0 profiles. **Evidence:** NVIDIA execution, recorded separately for the visible session and for an automated headless numerical run. The record covers browser, driver, session type, adapter information and launch flags. **Fails:** software execution. An unknown device identity is inconclusive until corroborated, and requesting a high-performance adapter is not itself evidence. |
| G2 Repeatable startup | **Measured:** time from navigation start to publication of the first valid `bulb-overview` draft. It includes adapter and device acquisition and pipeline preparation, and the preparation status must be visible. **Pass:** three fresh-process, empty-profile launches each take ≤ 10 s. A separate warmed run is reported. |
| G3 Analytic correctness | **Fixtures:** `sphere`, `box`, `menger-1`, `menger-2`, with the A.4 ray lists. **Pass:** exact hit/miss agreement on non-excluded rays, and depth error ≤ 10⁻⁴·L. L and the tracing settings are given per fixture, and the tracing tolerance is tighter than the permitted depth error. **Edge cases:** excluded tangent and edge rays have their declared expectations. |
| G4 Fractal arithmetic | **Samples:** A.3 Mandelbulb samples, GPU against independent CPU double precision. **Rules:** every compared quantity, input conversion, tolerance and exclusion is fixed before GPU comparison, exclusions are listed with their count, and no exclusion may be added after inspecting GPU disagreements. |
| G5 Quaternion arithmetic | **Samples:** `qjulia-plane` against an independent CPU complex recurrence, and `qjulia-offplane` against an independent CPU quaternion recurrence. **Rules:** the same as G4. |
| G6 Draft throughput | **Fixtures:** `bulb-overview`, `bulb-detail-0.05` and `bulb-detail-0.005`, each following its A.7 path. At most one render request is pending, and the next pose is issued when the previous draft is published. **Counted:** completed, distinct drafts published within the 30-second window; the rate is the count divided by 30. **Pass, per trial:** rate ≥ 30 per second, and p95 of consecutive publication intervals (nearest-rank) ≤ 50 ms. |
| G7 Interaction latency | **Workload:** the A.7 burst sequence. **Recorded:** request ID, and the request, admission, completion and publication times. Intermediate requests in a burst may be coalesced, and only each burst's final request is measured, from its request time; the clock is not reset when work is admitted. **Pass:** p95 ≤ 100 ms. Re-presenting the previous image does not count as a new draft. |
| G8 Cancellation under stress | **Sequence:** once `bulb-stress` work has actually been submitted, issue the `sphere` request. **Pass:** a complete, valid `sphere` draft is published within 250 ms of that request, and no superseded stress result is ever published. Ten repetitions, all of which must pass. |
| G9 Main thread | **Pass:** during warmed G6 and G7 measurements, no application-attributable main-thread task exceeds 50 ms. All violations are recorded, and harness work is identified separately. |
| G10 Settled render | **Fixtures:** `bulb-overview`, `bulb-detail-0.05`, `bulb-detail-0.005`. **Measured:** from the settled render request to publication of the complete frame; pipeline preparation is excluded and measured in G2. **Pass:** each ≤ 2 s. |
| G11 Resources | **Workload:** the A.8 resource table is allocated, written with distinguishable data, read back and verified on selected contents. Future work is then cancelled and the resources released. **Pass:** tracked application-owned GPU allocations, including staging and overlapping generations, stay ≤ 1 GiB. Allocating handles alone does not pass, and the cap is not a claim about total driver VRAM. |
| G12 Stability | **Workload:** the A.9 ten-minute sequence. **Pass:** no unhandled errors and no unplanned device loss, and after completion and release the tracked inventory returns to the declared steady-state inventory. |
| G13 Loss and recovery | **Tested separately:** (a) intentional device destruction; (b) an unexpected-loss notification injected into the application's recovery path. **Pass for each:** the job is marked interrupted, success is never reported, request data is preserved, late completions are suppressed, and a valid render follows reinitialisation. A repeated injected loss stops automatic retry. Injected control-flow testing is labelled apart from any real driver loss. No GPU reset is forced to obtain this evidence. |

## 5. Measurement method
- **Trials:** three warmed 30-second trials per throughput fixture. Each trial is recorded and
  must pass on its own. An external interruption may justify a documented rerun; slow trials are
  never deleted selectively.
- **Window:** performance qualification runs in a **foreground visible window**. The canvas
  backing dimensions, device-pixel ratio and display refresh rate are fixed and reported.
- **Publication:** frame publication is an application event, not proof of scan-out on the
  physical display. Visible output is verified separately, without a synchronous readback on
  every timed frame.
- **What is recorded:**
  - pipeline preparation;
  - completed GPU work;
  - CPU scheduling and submission overhead;
  - publication;
  - readback, kept separate from the rest.
- **GPU timing:** timestamp queries are used where available. Their absence does not fail a
  backend. Queue-completion and readback timings are used instead, labelled as such and never
  as shader time. `onSubmittedWorkDone()` shows that queue work has completed, not that the
  frame is on screen.
- **Batching:** batches are bounded to about 10 ms of GPU work, with **no more than two batches
  outstanding**, and the maximum outstanding count is recorded. A whole unbounded frame is never
  submitted only to discard its result.

## 6. Decision procedure
1. **Qualify WebGPU against G1–G13.**
   - If every gate passes, select WebGPU. No WebGL 2 comparison is built just to chase a higher
     FPS, and no speedup over WebGL 2 is required.
2. **On a failure, classify it:**
   - *implementation defect*;
   - *launch or configuration problem*: try a documented setting local to the session;
   - *backend limitation or persistent failure*.

   **Remediation:** each backend gets at most **one documented remediation cycle**. That is one
   proposed change set addressing the identified failures, followed by a rerun of the affected
   gates and the correctness checks that depend on them. The original evidence is kept.
   Fixtures and thresholds are never tuned until a pass appears.
3. **If WebGPU remains unqualified,** implement the disposable WebGL 2 equivalent.
   - **Before qualifying it,** freeze the API mapping for each of these:
     - hardware diagnostics;
     - compilation completion (`KHR_parallel_shader_compile` where available, otherwise
       prewarming with the stall measured under G2);
     - GPU completion, using non-blocking fence polling, never a `finish()` per measurement.
       Timing extensions are optional;
     - readback;
     - resource accounting (the same byte accounting as A.8);
     - context-loss recovery (`WEBGL_lose_context`, plus the injected test).
   - **What is preserved:** the mathematical workload, output semantics and thresholds.
   - **Outcome:** if WebGL 2 passes, select it and record which WebGPU gate failed.
4. **Recording the gates.** Every gate gets one status, recorded with its evidence or with the
   reason execution stopped:
   - `pass`;
   - `fail`;
   - `not run`: unattempted WebGL gates are `not run`;
   - `invalid/inconclusive`.
5. **Selecting a backend:**
   - A backend is selected only when all of its mandatory gates pass.
   - **No-go** applies when both attempted backends remain unqualified after remediation.
   - Missing or invalid evidence produces **inconclusive**.
6. **What happens next:**
   - After a selected-backend report, Projects 1a and 1b are drafted.
   - After no-go or inconclusive, the reported limitation is resolved before any Space
     implementation. Quality is never lowered silently, nothing moves to a native application,
     and nobody promises that Project 1 will fix the problem.

## 7. Abort conditions
**When to stop.** Stop the affected experiment, preserve the smallest reproducer and report
before retrying if any of these happens:
- an unexpected GPU reset or device loss;
- an unrecoverable browser hang;
- a submission making no observable progress for 5 s;
- the allocation cap being exceeded;
- software execution detected during a supposed hardware measurement.

A harness timeout is a stop condition. It is not a claim that GPU work already submitted was cancelled.

**Never do any of these to obtain a pass:**
- disable the browser sandbox or GPU watchdogs;
- change global drivers, compositor settings or host packages (NVIDIA driver and DKMS included);
- run `apt` upgrades.

**Numerical results.** A numerically wrong result is not a benchmark: reproduce and diagnose it
before quoting any performance figure.

## 8. Precision experiment (not a backend gate)
1. **Baseline (A.10).**
   - **Setup:** the camera approaches the frozen numerical anchor along the frozen direction.
   - **Recorded at each distance:**
     - the actual camera coordinates;
     - the pixel footprint;
     - the iteration limit and tracing tolerance;
     - comparisons of identical, specified rays against the CPU double-precision reference.

     The report distinguishes input-coordinate rounding from later field and marching error.
   - **Reference check:** the CPU reference is validated by the A.10 convergence check. Rays
     whose reference result does not stabilise are recorded and excluded.
   - **Reported as:** the first tested scale at which the declared discrepancy threshold is
     exceeded. This is the **observed disagreement threshold against the CPU reference for this
     scene, profile and implementation**, not a general f32 floor.
   - **When to stop interpreting:** once reference or anchor uncertainty dominates the comparison.
     CPU double precision is an independent reference, not geometric ground truth.
2. **One compensated prototype (A.11),** compared with the baseline on identical requested scenes
   and tracing settings.
   - **Validate the primitives first.** The compensated primitives are validated on the actual
     shader backend before any result is interpreted. This includes cases where keeping the low
     component changes the answer. WGSL permits floating-point reassociation and fusion, so a
     CPU `TwoSum` cannot be assumed to keep its guarantees in a shader. If the intended
     arithmetic is not preserved, the experiment is *unvalidated*: it is not evidence that
     compensation does not help.
3. **Outcome.**
   - A measured absence of useful improvement closes the experiment successfully.
   - A promising result becomes a separately reviewed recommendation, and does not enlarge Project 1.
   - New compensated transcendental functions are out of scope.

## 9. What this does not do
- **Product code:** no product UI and no change to Plane or to anything in `src/`. The spike may
  read `src/` but never modifies it.
- **Features:** no Mandelbox; no shadows, ambient occlusion or accumulation; no bridge UI, scene
  formats or exports. The quaternion fixtures test arithmetic, not a second rendered family.
- **WebGL 2:** no prototype unless WebGPU fails qualification.
- **Optimisation:** none beyond the one remediation cycle per backend.

## 10. Execution notes
- Reuse ATLAS's launch knowledge (`scripts/gpu-preview.mjs`, `tests/graphics.mjs`), keeping the
  sandbox enabled.
- Project 0 browser profiles live under `artifacts/runtime/project0-*`.
- The CPU references (double precision) live in `spikes/project0/reference/` and are tested in
  Node before any GPU comparison. They are written independently of the shader code.
- All files stay inside this project.

## 11. Done means
- `fixtures.json` (serialising Appendix A) was committed before any GPU run.
- Every gate has a status with evidence, and the decision follows §6 mechanically.
- The precision section reports both the baseline and the prototype, or a stated reason why it could not.
- The report has been reviewed jointly by Claude and Codex and presented to the user.

---

## Appendix A — Normative fixtures

Conventions are those of charter §3.7: right-handed, Z-up, dimensionless units.

### A.1 Camera model
- **Projection:** pinhole perspective with a vertical field of view of 60° and the aspect ratio
  of the target, 16:9 unless stated. The world up vector is `(0, 0, 1)`, with no roll.
- **Basis:**
  - forward: f = normalize(target − position);
  - right: r = normalize(f × up);
  - camera up: u = r × f.
- **Pixel centres:** (i + 0.5, j + 0.5) with j = 0 at the top. With h = tan(30°),
  s_x = (2(i+0.5)/W − 1)·h·W/H and s_y = (1 − 2(j+0.5)/H)·h, and the ray direction is
  normalize(f + s_x·r + s_y·u).
- **Origin and range:** rays start at the camera position. Nothing is clipped at the near
  plane; the far limit is the exit from the fixture's bounding volume.

### A.2 Tracing profiles

**Mandelbulb kernel (heuristic estimator; category `heuristic`, exterior-only):**
- **State:** z₀ = (0, 0, 0) and dr₀ = 0. For n = 0…N−1, where N is the iteration cap, perform
  one update:
  1. r = |zₙ|. If r = 0, then P₈(zₙ) = 0. Otherwise:
     - θ = acos(clamp(z/r, −1, 1));
     - φ = atan2(y, x), with φ = 0 when x = y = 0;
     - P₈(zₙ) = r⁸·(sin 8θ cos 8φ, sin 8θ sin 8φ, cos 8θ).
  2. drₙ₊₁ = 8·r⁷·drₙ + 1.
  3. zₙ₊₁ = P₈(zₙ) + p.
  4. If |zₙ₊₁| > 2, the point is **escaped**, with escape index n+1, R = |zₙ₊₁| and
     estimate DE = 0.5·ln(R)·R / drₙ₊₁.
- **No escape** within the cap gives `not escaped within iteration budget`, with no usable estimate.
- **Numerical failure:** any invalid domain or overflow gives `numerical failure`. These are
  guarded *before* executing the affected operation, never detected only afterwards as NaN or
  infinity: WGSL permits implementations to assume those values do not occur.

**Marcher (Mandelbulb):**
- **Bounding volume:** a sphere of radius 1.25 at the origin.
  - A ray with no forward interval through it, including t_exit < max(0, t_entry), is a `miss`.
  - Otherwise marching starts at max(0, t_entry).
- **Hit tolerance:** tol(t) = max(10⁻⁶, 0.5·α·t), where α = 2·tan(30°)/H_internal is the
  angular pixel size at the profile's internal resolution.
- **Each step:** evaluate the kernel at p = o + t·d.
  - Not escaped: `unresolved` (reason `point`). The ray stops.
  - Numerical failure: `numerical failure`.
  - Escaped with DE < tol(t): `approximate hit` at t.
  - Otherwise t ← t + k·DE, with step multiplier k = 0.9.
- **Leaving the volume:** t > t_exit is a `miss`.
- **Step cap reached:** `unresolved` (reason `steps`).

**Marcher (analytic and Menger fixtures):**
- The rules are the same, with the fixture's distance function.
- **Hit tolerance and step cap:** a fixed hit tolerance of 10⁻⁶ and a fixed cap of 512 steps
  for G3. The tracing tolerance is therefore tighter than every permitted depth error.
- **Bounding volumes:** a sphere of radius 2 for `sphere` and `box`, and the box [−1, 1]³ for Menger.
- **Step multiplier:** k = 1.0 for all of these fixtures.

### A.3 Arithmetic samples (G4, G5)
- **`bulb-samples`** (4,096 samples):
  - **Grid:** the cell centres of a 16³ grid over [−1.2, 1.2]³. The cap is 64 iterations.
  - **Inputs:** CPU double values converted to f32 with round-to-nearest. All arithmetic
    references use the same effective f32 inputs and parameters as the GPU, and the requested
    decimal values are recorded separately.
  - **Compared:**
    - escape status and index, which must match exactly;
    - ln R at escape, relative tolerance 10⁻⁴;
    - DE, relative tolerance 10⁻³.
  - **Sensitivity screen:** see the rule after this list.
- **`qjulia-plane`** (4,096 samples):
  - **Starting points:** C = (−0.2, 0.8, 0, 0). For i, j = 0…63, xᵢ = −1.5 + 3(i+½)/64 and
    yⱼ = −1.5 + 3(j+½)/64, starting at q₀ = (xᵢ, yⱼ, 0, 0).
  - **Escape:** tested as ‖qₙ‖ > 2, including at n = 0, with at most 128 updates.
  - **Returned:** the first escape index and `logEscapeRadius` = ln ‖qₙ‖. A sample that never
    escapes returns `not escaped within iteration budget`.
  - **Compared against:** an independently implemented CPU **complex** recurrence z → z² + C.
    Escape status and index must match exactly; `logEscapeRadius` has a relative tolerance of 10⁻⁵.
  - **Recorded separately:** the requested decimal values of C and their effective f32 values.
  - **Sensitivity screen:** see the rule after this list.
  - **Expected:** CPU preparation found 3,814 escaping and 282 not escaping within budget. That
    is a sanity check, not certified interior.
- **`qjulia-offplane`:**
  - **Start:** q₀ = (0.25, 0.5, 0.125, −0.25) with the same C. The expected first update is
    q₁ = (−0.465625, 1.05, 0.0625, −0.125).
  - **Compared:** the first 8 iterates against an independent CPU quaternion recurrence. Each
    component must satisfy |actual − reference| ≤ 10⁻⁶ + 10⁻⁵·|reference|.
  - **Purpose:** catches an implementation that drops the **j** and **k** components.

**Sensitivity screen** (the pre-registration rule for `bulb-samples` and `qjulia-plane`):
- **Neighbours:** the immediately adjacent representable f32 values, `nextDown` and `nextUp`,
  never a nominal ulp added or subtracted.
  - For the bulb, each of the three sample coordinates is perturbed individually.
  - For the complex Julia set, x, y, C_r and C_i are perturbed individually, keeping the **j**
    and **k** components zero.
- **Exclusion:** a sample is excluded from the mandatory full-orbit comparisons if any neighbour
  does either of these:
  - changes the escape status or escape index;
  - changes a compared continuous quantity by more than a quarter of that quantity's acceptance
    tolerance.
- **Freezing:** the eligible set, and the reason for each exclusion, are frozen before GPU
  execution. Every excluded sample is kept in the diagnostic report.
- **Minimum eligibility:** at least 80% of the original grid must remain eligible. Otherwise
  the fixture is revised before freezing.
- **Limits of the screen:** it is empirical and is not a bound on accumulated floating-point error.
- **Relative tolerance** means |actual − reference| ≤ rtol·|reference|.

### A.4 Analytic reference rays (G3)
- **`sphere`:**
  - **Geometry:** radius 1 at the origin, with exact signed distance |p| − 1. L = 1.
  - **Rays:** origin (u, −4, v) and direction (0, 1, 0), for u, v ∈ {−1.2, −1.1, …, 1.2} (625 rays).
  - **Expected:** a hit iff u² + v² < 1, at depth t = 4 − √(1 − u² − v²).
  - **Excluded as tangent:** rays with |√(u² + v²) − 1| < 0.02.
- **`box`:**
  - **Geometry:** local half-extents h = (1, 0.5, 0.25), object-to-world rotation R_z(π/6), and
    exterior distance d(p) = ‖max(|u| − h, 0)‖ with u = R_z(−π/6)·p. L = 0.25. Interior distance
    is not validated.
  - **Rays:** origin (u, −4, v) and direction (0, 1, 0), for u ∈ {−1.5, −1.4, …, 1.5} and
    v ∈ {−0.5, −0.45, …, 0.5}.
  - **Expected:** from an independent slab intersection in local coordinates.
  - **Excluded as edge rays:** those whose slab entry point lies within 10⁻³ of an edge of the
    entered face.
- **`menger-1` and `menger-2`:**
  - **Geometry:** start from the cube [−1, 1]³. Subdivide each occupied cube into 27 equal cubes
    and keep the children whose index triple contains at most one middle index (1). Depth 1
    gives 20 boxes and depth 2 gives 400.
  - **CPU reference:** enumerates the boxes. Exterior distance is the minimum point-to-box
    distance, and ray intersections come from merging per-box slab intervals.
  - **L:** 1/3 at depth 1 and 1/9 at depth 2.
  - **Rays:** origin (u, −4, v) and direction normalize(0.3, 1, 0.2), with u = −1.2 + 2.4i/40 and
    v = −1.2 + 2.4j/40 for i, j = 0…40. The oblique direction avoids rays lying in face planes.
  - **Excluded as edge rays:** the same 10⁻³ rule as `box`.
  - **GPU routine:** d(p) = min over b of ‖max(|p − c_b| − h_b, 0)‖, taken over the 20 or 400
    occupied boxes (centres c_b, half-extents h_b) from the same subdivision.
    - In real arithmetic this gives the exact exterior distance to the finite union.
    - Floating-point implementation error is still subject to validation.
    - The independent CPU ray oracle uses merged slab intervals.
    - A compact folded implementation is deferred. Project 0 does not choose an unnamed substitute.
- **Edge cases (all G3 fixtures):** excluded tangent and edge rays may return an approximate
  hit, a miss, or unresolved through step exhaustion. A numerical failure is never acceptable.
  Their outcomes are recorded separately, and the ordinary depth assertion does not apply to them.

### A.5 Shading (draft and settled)
- **Normals:** the central-difference gradient of DE with offset ε = 0.5·tol(t).
  - The normal is `unavailable` if any of the six samples is not escaped or is invalid, or if
    the gradient is zero-length or non-finite.
  - For analytic fixtures, the gradient of the exact distance function.
- **Lighting:** colour = 0.15 + 0.85·max(0, n·ℓ), with ℓ = normalize(1, 0.6, 1.5), in white.
  The background is (0.02, 0.02, 0.03).
- **Statuses without a normal:** unavailable-normal hits, unresolved rays and numerical failures
  are written to a separate status buffer, never shaded as plausible surfaces. For display:
  unresolved is magenta (1, 0, 1), numerical failure is red (1, 0, 0), and unavailable-normal
  hits are mid-grey (0.5).

### A.6 Mandelbulb view fixtures and coverage
- **`bulb-overview`:**
  - **Camera:** position (1.92, −1.44, 0.70), which is 2.5 from the origin, with target the origin.
  - **Coverage:** CPU preparation at 160 × 90 gave 27.8% hit, 72.2% miss and 0% unresolved.
  - **Declared ranges:** hit 0.20–0.36, unresolved ≤ 0.02.
- **Numerical anchor A** (anchor, not exact surface point):
  - **Construction:** the CPU double-precision reference marches the central ray of
    `bulb-overview` (direction D = (−0.768, 0.576, −0.28)). It uses 256 iterations, k = 0.5, a
    fixed hit tolerance of 10⁻¹³ and up to 4,096 steps.
  - **Convergence check:** repeat the march with a tolerance of 10⁻¹⁵ and record the difference
    in t. This indicates empirical convergence; it is not a certified geometric error bound.
  - **Preparation value:**
    - t = 1.644459322137676, giving A = (0.6570552405982646, −0.49279143044869844,
      0.23955138980145063);
    - at 10⁻¹⁵, t = 1.6444593221416959, a difference of about 4.0 × 10⁻¹²;
    - `fixtures.json` stores the full double values.
- **`bulb-detail-0.05` and `bulb-detail-0.005`:**
  - **Camera:** position A − d·D for d = 0.05 and 0.005, with target A.
  - **Coverage:** preparation gave 100% hit for both.
  - **Declared ranges:** hit ≥ 0.95, unresolved ≤ 0.02.
- **`bulb-stress`:**
  - **Setup:** the `bulb-detail-0.005` camera with k = 0.25 and a fixed hit tolerance of 10⁻⁷,
    under the draft caps.
  - **Coverage:** preparation gave 34.9% hit and 65.1% unresolved (steps).
  - **Declared range:** unresolved (steps) ≥ 0.40.

- **Rendered `sphere` fixture** (used by G8 and G12):
  - **Camera:** position (1.92, −1.44, 0.70), target the origin, with the A.1 projection, under
    the draft profile.
  - **Pass:** a nonempty sphere image with no unresolved or numerical-failure pixels.

**Applicability:**
- The ordinary coverage ranges apply separately to the draft and settled profiles, and to every
  completed frame on the declared paths.
- An unavailable-normal hit still counts as a geometry hit; normal availability is reported
  separately.
- Numerical failures are counted separately and invalidate an ordinary qualification render.
- The ranges do not apply to arithmetic-only fixtures, excluded G3 edge rays, or the
  intentionally failing deep precision samples.

**Preparation and freezing:**
- CPU preparation verifies both profiles and the moving views before freezing. The 160 × 90
  figures above are illustrative and do not substitute for that check.
- `fixtures.json` re-derives every value with the committed CPU reference.
- If the fractions fall outside the declared ranges, the ranges are revised *before* the
  freeze, never after.

### A.7 Motion
- **`bulb-overview` path:** the camera moves on the horizontal circle of radius 2.4 at
  z = 0.70, always looking at the origin. With θ₀ = atan2(−1.44, 1.92), the angle at trial time τ
  is θ(τ) = θ₀ + 2π·τ/30.
- **Detail paths:** with v₀ = −d·D and β(τ) = (π/18)·sin(2π·τ/10), the camera is at
  A + R_z(β(τ))·v₀, looking at A.
- **Bursts (G7):**
  - **Start:** each trial resets to the overview start.
  - **Requests:** burst b and request j (both zero-based) use the angle θ₀ + (20b + j + 1)·π/180.
    Requests are issued 8 ms apart.
  - **Quiet interval:** one second, beginning after request 19.
  - **Volume:** 20 bursts per trial, 3 trials.
  - **Measured:** the latency of each burst's final request. The p95 is evaluated independently
    for each trial.

### A.8 Resource table (G11, at 3840 × 2160 = 8,294,400 pixels)

| Resource | Format | Bytes/pixel | Count | Bytes |
|---|---|---|---|---|
| Depth (t) | r32float | 4 | 1 | 33,177,600 |
| Normal | rgba16float | 8 | 1 | 66,355,200 |
| Status | r32uint | 4 | 1 | 33,177,600 |
| Orbit data | rgba16float | 8 | 1 | 66,355,200 |
| Accumulation | rgba32float | 16 | 1 | 132,710,400 |
| Display (in progress) | rgba8unorm | 4 | 1 | 33,177,600 |
| Display (retained previous generation) | rgba8unorm | 4 | 1 | 33,177,600 |
| Readback staging band (3840 × 256) | rgba8 | — | 2 | 7,864,320 |
| **Total** | | | | **405,995,520 (≈ 387 MiB)** |

- **Why this layout:** it reflects the charter's architecture of one in-progress generation, one
  retained display and a banded readback.
- **Total:** 405,995,520 bytes (387.1875 MiB) before any additional declared buffers. This is not
  a measurement of physical VRAM consumption.
- **Texture descriptors:** every texture has one mip level, one array layer and a sample count of
  one. The usage flags, and the allocation, write and readback sequence, are frozen with the harness.
- **What the byte cap counts:** declared texture payloads and actual buffer sizes, including
  alignment, staging and overlapping allocations. Pipeline and bind-group counts are tracked
  separately, because their opaque driver allocation sizes cannot be measured through this
  accounting.
- **Verification pattern:**
  - **Writes:** every texel of every texture is written, in bounded passes. For resource index
    r, k = (13x + 17y + r) mod 251 is stored as k in integer formats, k + 0.25 in floating
    formats and k/255 in unorm colour channels.
  - **Readback:** the Cartesian product of x ∈ {0, ⌊W/2⌋, W−1} and y ∈ {0, ⌊H/2⌋, H−1} is read
    back from each texture in its source format, using correctly aligned small copies into the
    existing staging buffers. The stored representation is verified.
  - **Full band:** a full 3840 × 256 RGBA8 band readback is exercised separately.
  - **Peak:** the peak inventory is recorded before anything is released.

### A.9 Stability sequence (G12)
- **Structure:** 60 cycles, each occupying a fixed ten-second wall-clock interval:
  - [0, 3) s: `bulb-overview` motion;
  - [3, 4) s: `sphere`;
  - [4, 7) s: `bulb-detail-0.005` motion;
  - at 7 s: submit `bulb-stress` work, replace it with the `sphere` request after submission,
    then perform the scheduled resize, rotating through the backing sizes 1280 × 720,
    1920 × 1080 and 960 × 540;
  - every tenth cycle, also allocate, verify and release the A.8 layout.
- **Deadlines:** all maintenance must finish before the next cycle boundary; otherwise a
  cycle-deadline failure is recorded. Timestamps are kept, and a cycle is never stretched silently.
- **Motion and sizes:** each motion phase restarts its local path time at zero. Rendering uses
  the current backing size, with draft internal dimensions at half that size.
- **Baseline:** before it is recorded, prepare every pipeline the sequence uses (including
  resource verification), return to 1280 × 720, drain submitted work and release transient
  resources.
- **Pass:** after the sequence and the same drain-and-release procedure, tracked allocations are
  within 1% of the baseline and the live resource counts equal it.

### A.10 Precision baseline
- **Setup:** anchor A and approach direction D (A.6). Each pixel's own direction is written
  d_ray, to keep it distinct from D.
- **Distances:** d ∈ {10⁻¹, 10⁻², …, 10⁻⁸}, with the camera at A − d·D looking at A.
- **Rays:** the central 64 × 64 pixels (columns 608–671, rows 328–391) of a 1280 × 720 frame
  under A.1.
- **Precision profile:** the settled iteration and step caps, but with a hit tolerance of
  0.005·α·t (α for H = 720) and *no* absolute floor. The baseline GPU, the compensated GPU and
  the primary CPU reference all use this profile.
- **Reference convergence:**
  - Compare the primary CPU trace at hit-scale 0.005 with a tighter CPU trace at 0.0005.
  - A ray is *reference-eligible* only when both traces return the same resolved status (hit or
    miss) and, for hits, their relative depth difference is at most 10⁻³.
  - GPU results are compared with the primary CPU result, never with a differently configured trace.
  - Feasibility: 86 of 4,096 rays were ineligible at d = 0.1 during preparation.
- **Discrepancy:**
  - Let E be the reference-eligible rays and H the CPU hits in E with positive depth.
  - A status disagreement is any GPU status different from the CPU's resolved status, including
    GPU unresolved and numerical-failure results.
  - The threshold is exceeded when status disagreements are more than 5% of E, or when GPU hits
    with a relative depth error above 10⁻² are more than 5% of H.
  - Missing GPU hits are counted by the status test.
  - If H is empty, the depth comparison is reported as unavailable, not as a pass.
- **Stopping rules:** interpretation stops at a distance d if either of these holds:
  - more than 50% of the original 4,096 rays are reference-ineligible;
  - the anchor convergence difference (A.6) exceeds 10⁻³·d.

  The excluded fraction, and the reason for each exclusion, are always reported.
- **Scope:** this measures local depth and termination agreement on the selected patch. It does
  not establish whole-frame silhouette accuracy.

### A.11 Compensated prototype dataflow
- **Kept as compensated (float-float) high/low pairs:**
  - the absolute camera origin O, encoded from CPU doubles;
  - the ray parameter t;
  - the sample position p = O + t·d_ray, computed explicitly with pair arithmetic.
- **d_ray** stays ordinary f32.
- **The iterate:** the Cartesian iterate is held as pairs between steps. Each power step rounds
  the pair components to f32 and evaluates P₈ in ordinary f32. It then adds p with compensated
  addition: z^ff ← add_ff((P₈(round_f32(z^ff)), 0), p^ff).
- **Ordinary f32:** r, θ, φ, the trigonometric power evaluation, the running derivative, the
  final estimator and normal estimation.
- **What this protects:** coordinate construction and the addition in the recurrence. It does
  not compensate the full nonlinear power map.
- **Primitive validation:**
  - **Vectors:** explicit vectors and expected reconstructed values for `two_sum`, `add_ff` and
    `mul_ff_f32` are frozen in advance.
  - **What is validated:** high-plus-low results, including cancellation, and cases where using
    the low component afterwards changes a rounded result. The numerical tolerance is stated.
    Merely observing a nonzero low component does not pass.
  - **Mandatory case:** `two_sum(1, 2⁻²⁵)` represents exactly 1 + 2⁻²⁵, and subtracting 1 from
    that pair retains 2⁻²⁵.
- **Cost comparison:**
  - **Workload:** at each interpreted distance, the baseline and the prototype evaluate the same
    4,096 rays and return identical output fields.
  - **Runs:** three warm-ups, then ten measured evaluations per implementation.
  - **Reported:** the completed-work median and range, readback (separately) and incremental
    resource bytes.
- **Input conversion:** the ray-input conversion path is recorded. Comparison against the
  requested CPU-double origin is kept distinct from comparison against the baseline's rounded
  origin. The same effective ray directions are used when isolating later arithmetic error.
