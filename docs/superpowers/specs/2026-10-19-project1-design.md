# Project 1 — Foundations (1a) and Space (1b)

**Status:** draft for the user's review · **Date:** 2026-10-19 · **Revision:** 2 (after Codex's
first co-author review)
**Authors:** Claude and Codex, co-designed as peers. The verbatim exchange is archived in
`docs/codesign/project1-log.md`, a project-specific log kept beside the protocol's
`docs/codesign/conversation-log.md` (which holds the charter and Project 0 co-design).
**Governed by:** `docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md`. This spec narrows
the charter and never contradicts it; section references like "charter §3.4" point there.
**Depends on:** Project 0 (`2026-10-18-project0-space-qualification-design.md`) for the Space
backend and its qualified arithmetic (§2).

## 1. Problem and outcome

The charter outlines Project 1 as two parts sharing one acceptance demonstration:
- **1a, Foundations:** Plane moved without behaviour change, versioned scenes, legacy adapters,
  undoable scene commands, and immutable render requests with truthful outcomes and reports.
- **1b, Space:** a 3D workspace for the Mandelbulb and the quaternion Julia set, delivered in three
  usable milestones.

This spec fixes the scope, contracts and verification of both. It authorizes no implementation.
Implementation of each part follows a user-approved plan.

## 2. Relationship to Project 0

- **Backend assumption.** Per user decision E6, this spec assumes **WebGPU, provisionally**.
  Project 0's recorded backend-selection outcome confirms or revises this assumption. For the
  WebGPU path, that is the verified decision record produced after closing
  qualification/remediation (`docs/reports/project0/webgpu-decision.json`, Project 0 plan T10); the
  `webgpu-remediation` campaign name alone does not establish selection. Per E5, the browser
  remains a firm requirement until keeping it would compromise the design or lose features; that
  point is escalated to the user, never decided here.
- **Independence.** 1a has no dependency on the Space backend and may be planned and built once
  this spec and its plan are approved. 1b's implementation starts only after Project 0 records a
  selected backend.
- **Isolation.** Project 1 never touches the Project 0 worktree, its branch, `spikes/`, or Project 0's
  frozen inputs, gates or evidence. Project 1 changes are not merged, rebased or otherwise
  propagated into Project 0 during qualification. Project 1 defers its GPU acceptance runs while
  Project 0 needs the workstation's GPU.
- **Inheritance.** Project 0's prototype code is disposable and is not imported. What carries
  forward is Project 0's fixture definitions, measurement protocols and report. Project 1
  re-expresses the fixtures it needs in `tests/`, and independently implements and validates every
  product kernel.

| Project 0 outcome | Consequence for Project 1 |
|---|---|
| WebGPU selected (including after its remediation cycle) | Finalize the WebGPU backend annex (§9) against the recorded configuration and the validated numerical formulation (§10.3); proceed with 1b. |
| WebGL 2 selected | Revise §9 and the 1b plan around T11's frozen API mapping; one Space backend is still maintained. This spec takes an amendment before 1b starts. |
| Inconclusive | 1a proceeds after approval; Space implementation is blocked until the limitation is resolved. |
| No-go | Space implementation stops and the browser-path limitation goes to the user. Features are never cut silently, and nothing moves to a native application. |

E6 advances design timing. It selects no backend, relaxes no gate, and authorizes no Space
implementation before Project 0 resolves.

**Project 0 findings this design accounts for** (as relayed by the user; not yet in a final
report, and not turned into Project 1 performance claims): WebGPU frame interval about 9–10 ms p95,
latency 18–22 ms, 10 minutes stable on the RTX 6000 Ada; WGSL may fuse multiply-adds, so
precision-sensitive arithmetic needs designed numerics (remediation G5-A, compensated evaluation,
in progress); Chrome 151 reports empty adapter device strings; headless WebGPU is unreliable on
this host.

## 3. Releases and the acceptance demonstration

Each release is usable on its own.

| Release | Usable outcome |
|---|---|
| **1a — Foundations** | Every existing Plane workflow preserved; scenes round-trip; parameter edits undo; exports capture immutable state; legacy artefacts open; a durable scene library. |
| **1b.1 — Render and recover** | Explore the calibration objects, Mandelbulb and quaternion Julia; orbit and basic flight; recover from bad camera positions, cancellation, allocation failure and device loss; save and reopen scene JSON. Estimator category, pending marks and distinct statuses are present from this release. |
| **1b.2 — Connect and inspect** | Pick a parameter in Plane and open its quaternion Julia set; compare the invariant section with the independent complex-Julia instrument; inspect an orbit; read the precision indicator. |
| **1b.3 — Complete the workflow** | Scoped presets, saved compositions, discovery cards, viewport and 4K PNG export with companion scene and report. |

| Acceptance step (charter §4) | Works from |
|---|---|
| 1. Pick c in Plane | 1a (Plane unchanged) |
| 2. Open its quaternion Julia set in Space | 1b.2 (bridge) |
| 3. Find a feature | 1b.1 |
| 4. With κ = 0, compare the invariant section with the complex-Julia instrument | 1b.2 (§13.5) |
| 5. Inspect a point's orbit | 1b.2 |
| 6. Change a parameter, then undo | 1a mechanism; in Space from 1b.1 |
| 7. Save a discovery card, reload, reproduce the view | 1b.3 |

1b.2 makes steps 1–6 work end to end. The complete seven-step demonstration is 1b.3's exit
criterion, run as one recorded investigation, headed, on the physical GPU. It includes a parameter
edit that visibly changes the scene and an undo that restores it. Reload must restore the scene,
the selected point, the inspector settings and the effective numerical parameters, not merely a
similar-looking camera.

## 4. Architecture

### 4.1 Source layout (responsibilities, not a requirement to create every file at once)
```text
src/
  app.js                    small composition root
  plane/
    workspace.js            Plane lifecycle and controls
    navigation.js           existing pointer, wheel, touch and key behaviour
    scene-adapter.js        scene ↔ existing view/settings
    render-adapter.js       existing renderers ↔ shared job contract
    math.js  perturbation.js  reference.worker.js  renderer.js  shaders.js
    graphics.js             WebGL-specific diagnostics
    places.js
  space/
    workspace.js  camera.js  navigation.js
    models/                 registry.js analytic.js menger.js mandelbulb.js quaternion-julia.js
    numerics/               parameters.js validation-domains.js
    render/                 renderer.js (pass graph) profiles.js backend.js webgpu/ (selected backend only)
    instruments/            slice.js complex-julia.js inspector.js evaluation.worker.js
  shared/
    scene.js commands.js history.js render-request.js render-report.js scheduler.js
    diagnostics.js palettes.js persistence.js legacy.js
  ui/
    shell.js dialogs.js notifications.js workspace-switcher.js  (plus icons.js, style.css)
tests/
  reference/                independent CPU references (share no code with src/)
```
- `space/models/` and `space/numerics/` import no DOM or GPU code; a test parses their imports.
- `shared/` never holds BigInt coordinates, perturbation, quaternion operations, camera matrices,
  GPU handles or a universal `Renderer`. The shared scheduler controls admission and priority;
  workspace renderers decide how admitted work executes.
- Palette definitions and interpolation are shared. Plane's `colorPixel(mu, stripe, …)`
  interpretation remains Plane-owned.
- Two workspaces, two canvases: Plane keeps its WebGL 2 context; Space owns its backend device.
  Plane starts without acquiring a Space device.

### 4.2 Extraction order (1a)
1. **Move first.** One commit moves the Plane-owned modules (and `icons.js`, `style.css` to `ui/`)
   and updates only the necessary references: imports, worker URLs, `index.html`, tests'
   `/src/…` imports and `scripts/thumbnails.mjs`. It does not split palette functions, change
   renderer behaviour or reorganize function bodies. Review compares moved file contents after
   import-path substitution, and the complete Plane verification gate (§16.3) passes.
2. Introduce the scene adapter around today's `view` and `settings`.
3. Route edits through commands without changing numerical functions or render cadence.
4. Extract the shell's genuinely common dialogs and notifications.
5. Extract navigation and lifecycle code as workspace switching requires.

When 1a begins, `AGENTS.md` and `HANDOFF.md` are updated as charter §6 item 10 requires, together
with the affected `README.md` paths and commands. That documentation change is its own commit,
separate from the mechanical move.

### 4.3 Plane regression contract ("behaviour unchanged")
- Exact coordinate strings and effectively unbounded navigation remain.
- Existing zoom thresholds, the adaptive iteration policy, reference-orbit machinery and shader
  arithmetic remain.
- Palette-only changes continue to reuse the field.
- A wheel step still produces one committed frame, with stable backing dimensions.
- Pending navigation retains and transforms the previous complete image.
- Pointer release does not introduce a second refinement render.
- CPU fallback, worker cancellation, tours, touch gestures, bookmarks, URLs and exports remain
  available.
- Existing layouts and controls remain usable at the tested desktop, laptop and mobile sizes.

Space's draft/settled policy never replaces Plane's rendering policy: the shared scheduler
accommodates Plane's existing cadence. Existing browser assertions survive, with import-path and
narrowly justified shell adjustments, never weakened expectations.

## 5. Scene contract

A scene describes an experiment. Runtime state describes its execution and is not part of a scene.

### 5.1 Envelope
```js
{
  application: "ATLAS",
  schema: "atlas.scene",
  schemaVersion: 1,
  applicationVersion: "…",
  workspace: "plane" | "space",
  model: { id, version },            // e.g. "plane-mandelbrot"@1, "mandelbulb"@1, "quaternion-julia"@1,
                                     //      "sphere"@1, "box"@1, "menger"@1
  conventions: "atlas-plane-v1" | "atlas-space-rh-zup-abcd-v1",
  parameters: { … },                 // model-specific; requested values as decimal strings
  camera: { … },                     // see 5.2
  slices: [ … ],                     // origin, basis, extent, sampling settings
  iteration: { maxIterations, bailoutPolicy } | { policy: "plane-detail-zoom-v1", detail },
  tracing: { profile: "surface-v1", … },   // resolved settings
  appearance: { … },                 // material, palette, lighting, fog, view mode
  sampling: { seed, sequence: "atlas-aa-v1", targetSamples },
  provenance: { source: "native" | "legacy-hash" | "legacy-bookmark" | "legacy-json",
                original?, resolvedFromContext?, clamped?, bridgedFrom? }
}
```
- Scenes are frozen; every edit produces a new validated scene. A canonical serialization gives a
  stable `sceneHash`.
- The scene excludes GPU objects, generation counters, progress, hover/selection state, panel
  layout and hardware identity. Reports and discovery cards are separate records.
- Whole-scene validation precedes any commit, including import. Unknown schema or model versions
  are preserved and reported as unsupported, never guessed. Imported scenes contain data only.

### 5.2 Model-specific fields
- **Plane:** camera `{ re, im, zoom }`. `re` and `im` are exact decimal strings; `zoom` is the
  base-10 magnification exponent. `zoom` remains a finite JSON number, preserving its numerical
  rendering meaning (`validateView` requires a finite number); negative zero may normalize to zero.
  The hash's original `z` text remains in provenance. The iteration
  policy is named and versioned: `plane-detail-zoom-v1` =
  `[512, 1024, 2048, 4096, 8192, 16384][detail] + max(0, ceil((zoom − 3) · 32))` (today's
  `app.js:85`).
- **Space camera:** `{ kind: "perspective", position, orientationWxyz, focus, verticalFovDegrees }`,
  CPU doubles. World Z defines up. Orbit and basic flight use upright navigation without a
  dedicated roll control. The orientation control may set a full camera orientation; axis
  constraints and orientation reset remain available. Serialization preserves the orientation.
- **Space parameters:** requested values are decimal strings (for example
  `C: ["-0.2", "0.8", "0", "0"]`, `kappa: "0"`, `power: "8"`). Render preparation derives effective
  binary32 values and their bit patterns. Effective values appear in requests, reports and
  inspection results beside the requested strings, and never overwrite them.

## 6. Commands and history

- **Commands** (`setParameter`, `setCamera`, `setSlice`, `setTracing`, `applyAppearancePreset`,
  `restoreScene`, …) produce validated scenes. Each command declares the **domains** it owns
  (`mathematics`, `tracing`, `appearance`, `camera`, `slice`, `whole-scene`). Invalidation is
  derived from before/after scenes, so a caller cannot mislabel a mathematical change as
  appearance-only.
- **Gestures:** `begin → update* → commit | cancel`. Updates render as previews. One slider drag,
  one camera drag or one wheel burst is one gesture. Cancel restores the pre-gesture scene. Commit
  does not trigger another render when the final preview already shows that state. Tours and
  palette animation never create one entry per frame.
- **Exact restoration:** undo restores stored values, never an inverse floating-point delta. Undo
  restores only the domains its command owns. For example, *change palette → navigate → undo
  palette* yields the previous palette and the current camera. `restoreScene` (opening a
  discovery, importing) is atomic and restores every domain, camera included.
- **Bounds:** 100 committed edits per workspace.
- **New execution identity:** an undo or redo always receives a new view revision (§7.2), so a
  late result from an earlier identical state can never be admitted.
- **Camera history:** a small per-workspace pose history (back/forward), plus overview and
  orientation reset, always one action away (charter §3.10).
- **Recommended policy (pending the user's decision, §19 Q4):** continuous navigation and
  camera-only jumps go to camera history, not to ordinary undo. Parameter, tracing, slice,
  appearance and whole-scene restorations are undoable. Only actions whose changes are confined to
  the camera follow the camera-only history policy. Navigation actions that also change palette,
  detail or other content (for example Plane's curated places, which carry a palette, applied by
  `goTo`) retain undoable content changes; their camera component follows the selected
  camera-history policy. Opening a complete scene or discovery remains an atomic whole-scene
  restoration. The domain model supports the other policy without restructuring.

## 7. Render contracts and scheduling (`shared/`)

### 7.1 Request
```js
{ requestId, jobId, viewId,
  sceneSnapshot, sceneHash,
  output: { width, height, purpose: "interactive" | "export" | "instrument" | "swatch" | "thumbnail" },
  quality: { /* explicit stage settings and total work limits */ },
  generation: { deviceEpoch, viewRevision, geometryRevision, appearanceRevision },
  keys: { geometryKey, appearanceKey } }
```
Requests are frozen. Every batch additionally identifies its pass, region and sample index.

### 7.2 Revisions and keys
- **Revisions** are monotonic execution identities: `viewRevision` advances for every new requested
  state; `geometryRevision` and `appearanceRevision` advance when their dependencies change.
- **Keys** identify resolved pass inputs, including request-specific settings, rather than scene
  fields alone. The base geometry key includes model and numerical implementation versions,
  effective mathematical inputs, camera and slice definitions, internal dimensions and sample
  mapping, actual iteration and tracing limits, normal-evaluation settings, and the required orbit
  attributes. A geometry sample additionally identifies the sampling-sequence version, seed and
  sample index. (Resolution matters because the hit tolerance does: at t = 1 and a 60° vertical
  field of view, τ ≈ 8.019 × 10⁻⁴ at height 720 and ≈ 2.673 × 10⁻⁴ at height 2160.)
- The **appearance key** includes the resolved appearance settings and the actual lighting stage,
  including shadow, AO and fog settings. **Accumulation** identifies the compatible geometry,
  appearance and sampling sequence. Increasing the target sample count may extend an existing
  compatible sequence; changing its inputs cannot mix old and new samples.
- Dependency revisions advance whenever these resolved inputs change, including resize and
  quality-stage changes. Content-key equality permits cache consideration but never overrides the
  epoch, request-identity or resource-lifetime checks. An appearance edit and its undo leave
  geometry untouched. A geometry sequence A → B → A returns to A's key but receives a new geometry
  revision.
- **Publishability:** a result is publishable only if its device epoch, view/request identity and
  required dependency revisions all still match. Completed valid geometry may be rebound to a new
  request after checking its key, device epoch and resource lifetime; a late completion from the
  original A request never becomes publishable merely because its content matches again.

### 7.3 Lifecycle and outcomes
```text
queued → preparing → running → completed
                         ↘ superseded | cancelled | interrupted | failed | budget-exceeded
```
- Cancelling a running job stops future submissions and enters a draining condition. The outcome
  records whether nothing was submitted, submitted work drained, or device loss interrupted it.
  "Cancelled" never implies that submitted GPU work was preempted. Rejecting a stale result is not
  cancelling it.
- **Pause** is a scheduler condition: calculation stops, editing continues, and the retained image
  stays marked as reflecting earlier settings. **Update** renders one frozen current snapshot and
  returns to paused operation.

### 7.4 Render reports
A report records: scene hash; request identity; model, numerics and shader versions; backend,
browser and hardware identity, where every identity field may be `unavailable` and each observed
field names its evidence source (Chrome 151 returns empty adapter strings, so no device string is
ever invented); requested and completed dimensions, iterations, tracing settings and samples;
outcome and its reason; counts of each ray termination status and of unavailable normals;
estimator category, derivation version and applicable validation record; requested versus
effective parameters and the sampling conditions; preparation, admission, submission, completion,
publication and readback timings, with GPU timing labelled `timestamp` or `queue-completion`; peak
tracked allocations and maximum outstanding batches. Job completion and per-pixel numerical status
are separate facts: an image may complete while containing diagnostic pixels, and both facts are
expressible. Workspace-specific fields are optional or explicitly marked inapplicable: Plane never
manufactures ray-termination counts or a Space estimator category to fill the shared envelope.

Plane adopts requests, outcomes and reports in 1a through `plane/render-adapter.js`, without
changing its scheduling behaviour.

### 7.5 Scheduler
- At most **two outstanding Space batches per device epoch**, across all views and jobs.
- A normal target of **8 ms of completed GPU work per batch**. This is a measured target adapted
  from completion evidence, not a hardware deadline. Batch descriptors also bound pixels, ray steps,
  recurrence iterations and secondary samples; bands subdivide horizontally when one row is too
  expensive.
- A **5-second no-progress watchdog** stops admission and reports; it never claims cancellation.
- One coalesced pending interactive request per view.
- Priority: active navigation → explicit inspection → active-view refinement → export → background
  swatches. Secondary instruments update at most twice per second during interaction. Hidden views
  are paused. Exports may pause while the user interacts. A minimal export job exists; a general
  render queue is Project 3.

### 7.6 Space quality profiles and work budgets (initial, provisional)
These limits apply only to Space. Plane retains its existing iteration policy, supported depths and
rendering cadence.

| Profile | Internal resolution | Iterations | Primary steps | Lighting and AA |
|---|---:|---:|---:|---|
| Moving draft | ½ width and height | up to 64 | 256 | direct light, 1 sample |
| Settled | full target | default 128 | 512 | shadows, restrained AO, target 8 samples |
| Supported explicit limits | requested target | at most 512 | at most 1,024 | at most 64 AA samples |

- A draft's reduced iteration budget is reported as preview quality. Instrument comparisons use the
  same actual budget as the result being compared.
- Initial elapsed-work budgets: 1 s per draft attempt, 10 s for settled refinement, 120 s per export,
  excluding time paused by scheduling. Exceeding one gives `budget-exceeded` with an explicit
  continuation or lower-cost choice. It never changes the requested mathematics or quietly reduces
  export resolution.
- These values are development defaults. The acceptance workload and thresholds (§16.4) are frozen
  before acceptance measurements; measurements may motivate a documented revision but never silently
  redefine a passing target.

## 8. Space renderer

### 8.1 Pass graph (`space/render/renderer.js`)
1. Prepare pipelines (asynchronously, before interaction, with visible status) and validate
   resource requirements. Parameter edits update uniforms and buffers, never recompile.
2. Trace primary rays into depth, termination status (with reason), step count and orbit-derived
   attributes.
3. Compute normals with explicit availability status.
4. Evaluate direct lighting, bounded shadows and restrained AO, preserving secondary-ray failure
   status (failures never turn into confident lighting). Apply enabled depth fog to each shaded
   sample in linear colour. Diagnostic values bypass decorative lighting and fog.
5. Accumulate compatible complete samples in linear colour.
6. Apply display mapping and present a complete image.

Fog is per sample, before accumulation, because the two orders differ: for two samples with colours
(1, 0), depths (1, 2), unit density and black fog, averaging the fogged samples gives ≈ 0.18394,
while fogging the average colour at the average depth gives ≈ 0.11157.

- **Invalidation:** geometry changes invalidate geometry and dependent accumulation.
  Lighting/appearance changes keep eligible geometry and reset appearance accumulation. Orbit-colour
  controls reuse geometry only if the required orbit attributes were recorded. Samples under
  different appearance keys are never accumulated together.
- **Antialiasing traces seeded, jittered primary rays.** Reshading one centre-sampled geometry
  buffer is not silhouette antialiasing. Sample indices and seeds are independent of batch order.
  The current geometry sample may be retained for appearance reuse without storing every AA sample.
- **Publication:** the canvas stays stable. A complete draft replaces the previous image; complete
  refinement samples then replace it. Partial tiles and mixed generations never become the ordinary
  viewport image. A retained previous image is visibly marked *pending*.

### 8.2 View modes
Shaded, normals, depth, step count, termination reason, orbit colour. Diagnostic modes bypass fog
and decorative lighting. Invalid and unresolved values use explicit colours or patterns with
legends (Project 0 A.5 colours as the starting legend: unresolved magenta, numerical failure red,
unavailable normal mid-grey). An unavailable normal does not erase an otherwise available
approximate-hit depth; its normal-status flag stays visible. Step count is labelled computational
cost, never estimator error. 1b.1 ships all modes except orbit colour, which arrives with the
inspector in 1b.2.

### 8.3 Resources
- Project 0's A.8 4K layout totals 405,995,520 B (387.1875 MiB); adding a separate 32-bit
  step-count image gives 439,173,120 B (≈ 418.83 MiB) before further declared buffers. This is a
  starting design, not a measured product peak.
- Space keeps a **1 GiB tracked-allocation cap** across its views, staging and overlapping
  generations. Plane allocations and opaque driver resources are reported separately and never
  hidden inside a claim about total VRAM.

## 9. Space backend interface

`space/render/backend.js` defines the product boundary:
```text
acquire()                      → identity (fields may be unavailable), limits, features
prepare(pipelineSet)           → asynchronous, with progress events
configureTargets(targetDesc)   → allocates through the tracked allocator
submitBatch(batchDesc)         → ticket with completion identity (queue completion, labelled)
readback(readbackDesc)         → asynchronous, banded staging
present(completedDisplayHandle)
release(handle)
onLoss(callback)
currentEpoch()
diagnostics()                  → tracked inventory and peak
destroy()
```
- `space/render/renderer.js` owns the pass graph. The backend owns GPU resources, command encoding,
  submission and completion, presentation and readback. Shared and UI code never see `GPUDevice`
  or WebGL handles.
- **Allocator:** every application-owned allocation, including staging and transients, goes through
  the backend's tracked allocator; the cap is checked before allocating. `release()` does not remove
  bytes from accounting while in-flight work still owns the resource; retiring allocations count
  until safely reclaimable.
- **Relation to T11.** T11's frozen method list is the qualification drivers' interface, not a
  production renderer API. Acquisition and preparation, bounded viewport work, resource accounting,
  epochs and loss recovery keep their T11 meaning. `arith`, `traceList`, resource exercises and
  `injectLoss` are **test adapters** around the production interface. Nothing imports
  `spikes/project0/`.
- **Keeping WebGL 2 possible** costs portable result formats and status semantics, bounded
  rectangular work regions, an asynchronous completion and readback abstraction, isolation of
  shader source, allocation and device APIs, and no product design that requires compute-only
  facilities. It does not justify a second backend, a shader translator or a universal GPU
  framework. There is no runtime Space fallback.
- **Fake backend:** a deterministic Node implementation of this interface, with controllable
  completion ordering, failures and loss notifications, drives scheduler, lifecycle and recovery
  tests (headless WebGPU is unreliable here).
- **Backend annex.** The WebGPU specifics (pipeline set, G-buffer formats, timestamp-query use,
  loss mapping) are finalized as an annex to this spec after Project 0 records its configuration.

## 10. Numerics and precision

### 10.1 Representation
Camera and scene state are CPU doubles. GPU fields are binary32. Kernels receive camera-relative
values. Camera-relative transport does not translate the mathematical model: before recurrence
evaluation, the effective field input represents the point in the model's native coordinates.
Navigation precision, field precision and rendering tolerance are three separate problems
(charter §3.5); camera-relative coordinates address only the first.

### 10.2 WGSL floating-point rules
WGSL permits reassociation and fusion, and permits implementations to assume runtime infinities
and NaNs are absent; after a runtime overflow the result is an *indeterminate value*. Therefore:
- domain and range checks precede every dangerous operation; post-hoc NaN or infinity detection is
  insufficient;
- source-level temporaries are not arithmetic barriers;
- product GPU-versus-CPU tolerances come from an error analysis written before measuring that covers
  both fused and unfused evaluation, never from tuning to results.

### 10.3 Quaternion arithmetic and G5-A
The quaternion square is evaluated in the **arithmetic formulation Project 0 records as qualified**.
If G5-A's compensated evaluation is part of the selected configuration, Project 1 independently
re-implements and re-validates that formulation in `space/render/webgpu/`, citing Project 0's
preregistered error analysis. That evidence covers the recurrence evaluation only. It does not
establish quaternion surface accuracy, validate the estimator or promise deeper detail. This is a
named revision trigger (§20).

### 10.4 Range-safe derivative (normative)
The running derivative can exceed binary32's range inside the supported budgets (illustration: the
recurrence D ← 8D + 1 from 0 first exceeds the binary32 maximum at update 44).
- **Representation.** The derivative has an explicit zero state and a normalized positive
  mantissa/exponent state, D = m·2ᵉ. Mandelbulb initialization uses the zero state, and its first
  derivative update produces a positive one (on the power-8 axis orbit from parameter (0, 0, 1),
  iterates 0 → 1 → 2 → 257 have derivatives 0 → 1 → 9 → 9217). Derivative updates preserve the
  specified recurrence without materializing an overflowing scalar.
- **Estimator availability is separate from orbit classification.** Zero sensitivity at escape, or
  a guard preventing an unsafe derivative or estimator operation, makes the estimate unavailable.
  It does not itself classify the orbit as non-escaped or numerically failed: orbit evaluation
  continues to escape, iteration exhaustion or a recurrence failure. (Quaternion Julia with q₀ = 0
  and C = (2, 0, 0, 0): the orbit 0 → 2 → 6 escapes at update 2, while sensitivity becomes zero at
  update 1 and stays zero; the point is escaped with an unavailable estimate.) An unsafe recurrence
  operation produces mathematical point status `numerical failure`.
- **Log-domain estimate.** For an escaped point with positive valid sensitivity, the estimate is
  evaluated in the log domain. For the Mandelbulb:

    log₂ DE = −1 + log₂ r + log₂(ln r) − (log₂ m + e),

  compared with log₂ τ before materializing a step. Conversion and advancement are guarded
  separately. A representationally tiny positive estimate is not replaced by zero. Derivative
  guards are failure handling, never the normal substitute for range-safe evaluation within the
  supported workload.

### 10.5 Precision indicator and tested conditions
- Space promises **validated detail ranges**, never infinite zoom, and never a universal f32 zoom
  floor. Each family has validation records bound to the product implementation, profile and
  effective inputs (§16.2). Project 0's precision results inform these experiments but do not
  automatically validate a changed product kernel or profile.
- The viewport badge reads **within tested conditions**, **outside tested conditions** or
  **no matching validation**. Outside tested conditions is allowed and flagged, never blocked or
  silently clamped.
- Expanded, it shows: the applicable tested domain, implementation and validation record; whether
  the current scene matches that coverage; requested versus effective parameters; the iteration
  budget and hit tolerance; the estimated world-space pixel footprint at the inspected or visible
  depth; and any coordinate or sample collapse or marching stagnation.
- **Plane → Space parameters:** a Plane parameter with more digits than Space evaluates keeps its
  requested decimal strings; Space shows the effective double and binary32 values (charter §3.9).

## 11. Families and tracing

Every model record:
```js
{ id, recurrenceVersion, initialization, escapeRule, supportedParameters,
  estimator: { category, semantics, derivationVersion },
  validation: { recordId, implementationVersion, testedParameters, testedSamplingConditions } }
```
Supported input ranges and empirically tested coverage stay separate. The category appears in model
metadata, the inspector, diagnostics, reports, and as a compact viewport indicator from 1b.1.

### 11.1 Mandelbulb (`mandelbulb`@1)
- Power p ∈ {2, 3, 4, 5, 6, 7, 8}, **default 8**; each power has its own validation coverage.
  Fractional powers are deferred (among other reasons, non-integer multiples of the `atan2`
  azimuth are discontinuous across φ = ±π).
- z₀ = 0, d₀ = 0; zₙ₊₁ = P_p(zₙ) + x; dₙ₊₁ = p·|zₙ|ᵖ⁻¹·dₙ + 1 (range-safe, §10.4).
- P_p uses charter §3.7's Z-polar spherical coordinates, θ = acos(clamp(z/r, −1, 1)),
  φ = atan2(y, x), and
  P_p(x, y, z) = rᵖ(sin(pθ)cos(pφ), sin(pθ)sin(pφ), cos(pθ));
  at r = 0 the power map is zero; on the polar axis φ = 0.
- Escape after each update when |z| > 2. Default full-quality budget 128.
- For an escaped point with a valid derivative: DE = ½·ln(r)·r/d.
- **Category: heuristic, exterior-only.** The scalar derivative recurrence is part of the
  approximation, not a proof of an exact spatial derivative or a conservative distance; the
  derivation document states that.
- Bounding sphere radius 2. It is valid for the supported powers p ≥ 2: the power map has norm rᵖ,
  so for a parameter of norm s > 2 the first iterate has norm s and the reverse triangle inequality
  gives growth thereafter. Project 0's power-8 bound of 1.25 is not reused.

### 11.2 Quaternion Julia (`quaternion-julia`@1)
- q = a + b**i** + c**j** + d**k** stored as (a, b, c, d); default slice q₀ = (x, y, z, κ) per
  charter §3.7. Defaults C = (−0.2, 0.8, 0, 0), κ = 0; supported input box: each component of C, and
  κ, in [−4, 4].
- qₙ₊₁ = qₙ² + C with q² = (a² − b² − c² − d², 2ab, 2ac, 2ad), keeping all four components. Iterates
  are never projected back into the slice.
- R(C) = max(2, (1 + √(1 + 4‖C‖))/2), which follows from ‖q² + C‖ ≥ ‖q‖² − ‖C‖. Escape occurs when
  ‖qₙ‖ > R(C), tested at initialization and after each update. R is computed from the **effective**
  C actually evaluated, with outward rounding covering the bound calculation and conversion. The
  empty-slice comparison uses effective κ and the outward-rounded bound: if |κ| > R(C) (strictly),
  the slice contains no non-escaping points under this bound. For the default C, R(C) = 2.
- Scalar sensitivity d₀ = 1, dₙ₊₁ = 2‖qₙ‖·dₙ (range-safe); DE = ½·ln‖q‖·‖q‖/d. The differential
  h ↦ qh + hq has norm at most 2‖q‖‖h‖, but using that bound in this estimator does not establish a
  conservative distance. **Category: heuristic, exterior-only.** Default budget 128.
- Invariant plane exactly as charter §3.7: with κ = 0 and C = C_r + C_i**i**, world z = 0 is
  invariant and the recurrence is exactly the complex recurrence; no correspondence is claimed
  otherwise, and exact correspondence of the recurrence does not make a finite-tolerance surface
  match the mathematical boundary.
- Zero sensitivity, unavailable estimates and range failures have explicit outcomes. An escaped
  orbit with an unusable estimator is neither a non-escaped orbit nor a surface hit.

### 11.3 Calibration objects
Sphere (radius 1, exact signed distance), the rotated box (exact exterior distance) and the finite
Menger union at depths 1 and 2 (20 and 400 boxes; the minimum exterior box distance is exact
outside the union in real arithmetic), as defined in Project 0 A.4. **Category: exact distance**
(signed for the sphere, exterior-only for box and Menger). A compact folded Menger needs a separate
specification and validation.

### 11.4 Tracing profile `surface-v1` and statuses
- Hit tolerance τ(t) = max(10⁻⁶, 0.5·α·t), α = 2·tan(fov_y/2)/H_internal. A sampling rule, not an
  error certificate. A separately versioned inspection profile may tighten it for convergence
  studies.
- **Starting conditions.** Rays use model-native world coordinates and unit-length directions, so
  t measures world-space distance. The forward ray is intersected with the model's declared
  enclosing volume, using outward-safe bounds. An empty intersection gives **miss**; otherwise
  marching starts at t = max(0, t_enter) and t_exit is retained. Invalid ray or intersection
  arithmetic gives **numerical failure**, not miss.
- **Enclosing volumes.** The bulb uses its radius-2 sphere. Quaternion Julia uses a conservative
  enclosing sphere derived from the outward-rounded R(C) and effective κ; a world-space radius of
  R(C) suffices when |κ| ≤ R(C) (since ‖q₀‖ ≥ ‖(x, y, z)‖). The strict empty-slice case is handled
  before tracing. The plan may choose tighter quaternion bounds if they are derived and tested.
  Calibration objects use their Project 0 A.2 enclosing volumes.
- **Analytic applicability.** Analytic evaluations provide distance semantics and applicability;
  they do not fabricate fractal escape statuses. This exterior profile never accepts an interior
  signed value, or an interior zero from an exterior-distance function, as a hit. Such a start gives
  **unresolved** (`estimate-unavailable`) with an interior/applicability detail and offers camera
  recovery. An analytic boundary value of zero remains a valid hit.
- **Each step**, evaluate the field at the current position, in this order:
  1. A recurrence or field-domain failure → **numerical failure**.
  2. A valid fractal orbit not escaped within its iteration budget → **unresolved**
     (`point-budget`). The ray stops; no interior distance is invented and no speculative step is
     taken.
  3. An escaped orbit without a usable estimate → **unresolved** (`estimate-unavailable`).
  4. Otherwise the hit and advancement rules below apply.
  - A valid exterior estimate below τ(t) → **approximate hit** (the only hit criterion).
  - Otherwise compute the guarded candidate advance t + 0.9·DE. If it exits the enclosing interval
    → **miss**. If the effective ray parameter does not increase, or the next effective field-input
    position equals the current one → **unresolved** (`stagnation`, subreason `ray-parameter` or
    `field-coordinate`). (In binary32, t may increase while the position does not: with o = 1,
    t = 2⁻²⁶ and t = 2⁻²⁵ both give o + t = 1.)
  - Step cap → **unresolved** (`ray-step-budget`).
- No minimum step is forced, and no hit is manufactured, to escape stagnation.
- Statuses stay distinct (charter §3.4):
  - point: `escaped`, `not escaped within iteration budget`, `numerical failure`;
  - ray: `approximate hit`, `miss`, `unresolved` (`point-budget`, `estimate-unavailable`,
    `ray-step-budget`, `stagnation`), `numerical failure`.
- A heuristic marcher's miss does not prove that the mathematical ray misses the set; a small DE
  certifies nothing. Normals are unavailable when required samples are unresolved, invalid,
  indistinguishable at effective precision, or give a zero gradient.
- There is no live "error heatmap".

## 12. Legacy compatibility and migration (1a)

### 12.1 Artefacts, as the current code reads them
| Artefact | Fields and interpretation |
|---|---|
| Share hash | `#re=…&im=…&z=…&palette=…&phase=…&frequency=…&relief=…&detail=…`; `z` is the base-10 zoom exponent; old hashes always open Plane. |
| Discoveries | `localStorage['atlas.discoveries']`: an array of `{ id, name, view: {re, im, zoom[, detail]}, settings: {palette, phase, frequency, relief, detail, iterations}, thumbnail }`; display also accepts `description`. |
| JSON location | `{ application: 'ATLAS', version: 1, view, settings }`; the old importer also accepts unmarked `view`/`settings` objects. |

### 12.2 Normative rules
- Coordinate strings are preserved exactly, including scientific notation and trailing digits.
  IDs, names, ordering, descriptions, thumbnails and the six palette IDs are preserved.
- Startup defaults are `ember`, phase 0.11, frequency 1, relief 1, detail 1. The legacy coercions
  apply: phase [0, 1], frequency [0.2, 2.5], relief [0, 1], detail rounded into [0, 5]. Clamps are
  recorded in provenance.
- `settings.iterations` is informational legacy data: the old loader ignores it and rendering
  derives iterations from `plane-detail-zoom-v1`.
- **Context-dependent defaults.** Missing settings in JSON import, bookmark activation and
  `hashchange` inherit the **current** settings in the old app. The adapter therefore takes an
  explicit captured legacy context (the current Plane settings at open time), stores the fully
  resolved scene, and lists the inherited fields in `provenance.resolvedFromContext`. Bulk migration
  does not invent a context for incomplete records; they remain retained and are resolved when
  opened.
- **Entry-path-specific `view.detail`.** Bookmark activation passes the original view to `goTo`, so
  an integer `view.detail` overrides settings. JSON import first applies `validateView`, which strips
  `detail`, so JSON import ignores it. The adapter preserves this distinction.
- Records failing the old validation (`zoom` not finite or below −0.6; coordinates outside [−4, 4]
  at the zoom's precision) are reported as unsupported, never repaired. Explicitly unknown future
  formats are rejected rather than guessed.
- **Migration** writes to the new store, validates and reads back each new record, then records
  migration success. It never overwrites or deletes the original array. Migration identities make it
  idempotent; duplicate legacy IDs and malformed records stay visible as migration problems.
  Deleting a migrated discovery writes a tombstone so migration does not resurrect it.

## 13. Workspaces and interface

### 13.1 Shell
Two retained investigations, one active view. A workspace switch preserves each workspace's scene,
camera and history; hidden work pauses, captured input is released, and transient resources may be
reclaimed. Shared surfaces: the discoveries library (workspace-tagged records; presentation per
§19 Q8), palettes, graphics diagnostics (extended with the Space backend and its tracked inventory).

### 13.2 Space layout
Viewport; parameter panel (family, parameters, iterations, tracing, appearance); viewport indicators
(estimator category, precision badge, pending, pause, view mode); docked instruments (1b.2); a
composition strip (1b.3).

### 13.3 Navigation (1b.1)
- Orbit, pan and dolly; focus on a point (asynchronous depth readback of the picked pixel); overview;
  orientation reset; a Bryce-style orientation control with axis constraints and reset (§5.2).
- Basic flight: look plus move and strafe, explicit speed. Escape releases input; blur or visibility
  loss stops movement immediately. No inertia, collision avoidance or vehicle model. Estimator-scaled
  slow-down is deferred unless it proves useful, and is never collision protection.
- **Camera exterior status.** The CPU double evaluator classifies the camera position on each
  committed camera. Either an unresolved CPU classification or an unresolved evaluation under the
  renderer's effective inputs shows "camera exterior status unresolved" with overview and reset.
  Neither proves interior membership.

### 13.4 Plane → Space bridge (1b.2)
An explicit transfer, not a coupled global parameter:
1. Select a parameter with Plane's exact coordinate machinery.
2. Preserve its decimal strings and the originating Plane scene (`provenance.bridgedFrom`).
3. Open `quaternion-julia` with C = (c_r, c_i, 0, 0), κ = 0, and an overview camera.
4. Show requested and effective Space values.
5. Offer a return action to the originating Plane view.

Space edits never move Plane. Returning a modified complex-compatible C to Plane is a separate
explicit command. A general four-component C has no faithful complex conversion; any projection must
be named and deliberate.

### 13.5 Instruments and the invariant-section comparison (1b.2)
- **Independent recurrence slice** (`instruments/slice.js`) and **complex-Julia instrument**
  (`instruments/complex-julia.js`): worker-based CPU double evaluation, default 256 × 256, bounded
  cancellable tiles. These are 2D mathematical instruments, not an interactive CPU Space renderer.
  They evaluate initial points directly and do not sample the ray marcher's DE surface. The
  complex-Julia instrument uses a separately implemented scalar complex recurrence.
- **Compare section** (a bounded operation):
  - freeze the scene and a shared grid (default 256 × 256);
  - construct the effective binary32 starting points once; the CPU instrument receives those same
    values widened to doubles;
  - use identical effective C, bailout and iteration budget;
  - evaluate the grid with the **product GPU quaternion recurrence** (no ray marching, no DE-based
    membership) and read back point status, escape index and log escape radius asynchronously;
  - show the GPU section and the CPU-complex result side by side, with a discrepancy overlay,
    counts, and linked point selection;
  - show the sampled plane's position and extent in Space;
  - mark results stale after relevant edits; cancellation follows the ordinary scheduler.
- The comparison is enabled as an invariant-section comparison only when κ = 0, C_j = C_k = 0 and the
  sampled plane is world z = 0; otherwise it states that the correspondence is not claimed.
- Discrepancies are labelled as differences between the named evaluators. They are not
  automatically excused as precision effects: a discrepancy that violates a validated implementation
  contract is a failure.
- Clipping and a rendered cut face are deferred: colouring a solid-looking cap from "not escaped
  within budget" would present finite recurrence classification as established solid geometry.

### 13.6 Orbit inspector (1b.2)
Picking a rendered point is asynchronous and records that the selection came from an approximate
hit. The production CPU double evaluator (in `space/models/`, separate from `tests/reference/`)
gives all four quaternion components (or the bulb's three), radius, escape index, status, estimate
and evaluator precision; a one-point GPU evaluation is shown beside it with the difference. A plotted
3D orbit projection is labelled as a projection. Results carry their inputs, effective inputs,
settings and evaluator version. Parameter edits keep the selected location and mark measurements
stale.

### 13.7 Scoped presets (1b.3)
Appearance-only and lighting-only presets with explicit allowed fields, previewed on the current
scene, undoable, never touching mathematics or camera; a neutral inspection lighting preset is always
available. Swatches use immutable preview requests behind interaction and inspection: at most 12
visible, a 24-entry cache keyed by scene, preset and renderer versions.

### 13.8 Compositions and discovery cards (1b.3)
- **Compositions:** a thumbnail strip of camera and focus states scoped to their model context. They
  restore no mathematics or appearance.
- **Discovery card:**
  ```js
  { id, name, note, sceneSnapshot, selectedPoint,
    inspection: { inputs, effectiveInputs, settings, evaluatorVersion, results },
    thumbnail: { sourceSceneHash, sourceReportId, blob }, reportId }
  ```
  A stale inspection never becomes a current-looking card silently: saving either refreshes it or
  records its stale provenance. Opening a card is a whole-scene restoration.

### 13.9 Fog, pause and update (1b.3)
Minimal exponential depth fog, applied in the appearance pass only, off in diagnostic modes, with an
obvious off switch. Pause and update per §7.3.

## 14. Persistence and export

- **Persistence:** IndexedDB for scenes, reports, cards, compositions and thumbnail blobs;
  `localStorage` only for small preferences and legacy access. Storage failure leaves exploration
  usable, offers downloadable scene data, and never reports a save that did not happen.
- **Scene files:** export and import of scene JSON (`atlas.scene`), from 1a for Plane and 1b.1 for
  Space.
- **Export invariant (normative, Plane and Space):** the complete export request is captured
  **before the first asynchronous wait**. Later edits may update the live scene but cannot alter the
  export's geometry, appearance, dimensions, sampling, companion data or report. The export publishes
  an immutable encoded image with matching metadata, then live rendering resumes. Today's Plane path
  violates this in two ways: it captures state only after `busy` clears (`app.js:383`), and
  `CpuRenderer.color` can replace the pending render's settings (`renderer.js:208`). The plan chooses
  the mechanism (a separate target, or exclusive use of the existing renderer); tests cover an edit
  while waiting for admission and an edit during rendering.
- **Space export (1b.3):** viewport dimensions, or "4K" = 3840 pixels wide at the selected aspect
  (3840 × 2160 at 16:9). A separate render target with banded computation and readback; arbitrarily
  large tiled stills are Project 3. Output is a PNG plus a companion experiment JSON with separate
  scene and report objects, joined by an export ID and the scene hash, both from the same immutable
  job. Plane's existing export choices remain.
- **Failure:** on device loss the job and snapshot are kept, the export is marked interrupted and a
  restart is offered; at most one automatic viewport recovery attempt, and repeated loss stops
  automatic retry. Allocation failure releases obsolete resources and offers an explicit lower-cost
  choice. Neither silently changes the export's dimensions.

## 15. Failure behaviour (charter §3.10, applied)
| Failure | Project 1 behaviour |
|---|---|
| First-use compilation | Space pipelines prepared asynchronously before interaction, with visible status; the current view stays. |
| Pathological cost | Batch bounds, per-request budgets, the watchdog; `budget-exceeded` with explicit choices. |
| Device loss during export | §14. |
| Repeated device loss | Automatic retry stops; saved scenes and Plane remain available. |
| Allocation failure | §14; the cap is checked before allocating. |
| Invalid numerical domain | Guards before operations; `numerical failure` as its own status. |
| Competing linked views | Priority order and throttling (§7.5); hidden views paused. |
| Parameter edits | Probes, inspections, comparisons and thumbnails marked stale. |
| Import over limits | Whole-scene validation; reported, never silently changed. |
| Lost or stuck input | Blur stops movement; overview, orientation reset and camera history one action away. |

## 16. Verification

### 16.1 Layers
| Layer | Execution | Required evidence |
|---|---|---|
| Scene, history, legacy | Node | Exact strings, defaults and coercions, captured context, entry-path `view.detail`, migration idempotence and tombstones, unsupported-record retention, domain-scoped undo, grouped gestures |
| Scheduler and lifecycle | Node, fake backend | Stale results, A → B → A late completions, epoch races, queue depth, cancellation outcomes, priority, retiring resource accounting; resize, draft-to-settled transitions, sample identity and direct-light-to-shadowed refinement as well as scene edits (direct-light-only samples never enter the accumulator for the later shadowed/AO appearance) |
| Mathematical models | Node, `tests/reference/` | Analytic answers, recurrence identities, full four-component quaternion updates, escape bounds, singular and range cases, stagnation including coordinate collapse |
| GPU numerics | Headed installed Chrome, physical GPU | Readback against independent references with preregistered tolerances and exclusions |
| Rendering | Headed, physical GPU | Silhouettes, depth, normals and termination coverage before colour; adversarial rays; convergence studies |
| Interaction and recovery | Browser | Intermediate frames, workspace switching, pause/edit/update, blur, cancellation, device loss (destroy and injected), failed allocation, stale instruments, both export races |
| Complete workflow | Headed browser, recorded | All seven acceptance steps, reload, immutable export, reproduction |

### 16.2 Validation matrix (frozen in the plan before any GPU comparison)
All seven bulb powers; origin and polar-axis cases; full off-plane quaternion parameters; nonzero κ;
supported-domain boundaries; iteration budgets 64, 128, 256 and 512; detail approaches with
independently prepared anchors and reference-convergence checks (after Project 0 A.10). Samples,
exclusions and quantity-specific tolerances are frozen before GPU comparison. Nothing is validated
merely because Project 0 tested power 8 and one quaternion parameter.

### 16.3 Plane gate (every 1a commit)
`npm test`, `npm run test:browser` (SwiftShader and `--hardware`), `npm run test:navigation`,
`npm run test:graphics` and `npm run build` stay green, including the deep-coordinate and actual
worker checks at 10¹⁰⁰⁰ and the deliberately delayed navigation tests. Shared and Space suites are
added beside them, never replacing Plane coverage.

### 16.4 Performance acceptance (Space, frozen Project 1 workload)
Project 0's measurement discipline: per-trial results; completed work, publication and readback
reported separately; coverage checks; visible-output verification; no single average-FPS figure.
Initial targets at 1280 × 720: ≥ 30 completed drafts per second with consecutive-interval p95
≤ 50 ms; interaction p95 ≤ 100 ms; stress replacement ≤ 250 ms; no application main-thread task over
50 ms; and the settled target of ≤ 2 s from the settled request to publication of the first complete
full-resolution geometry, normals and direct-light image at the settled iteration and tracing
settings (not an upscaled draft; the clock does not restart on admission). Shadows, AO and the
eight-sample target refine afterwards; the report records both milestones, and the first image does
not mark the full-quality job completed. Shadows, AA, quaternion rendering and linked instruments
need their own evidence: Project 0 did not qualify them.

### 16.5 Hardware
Headless browser tests remain for non-GPU behaviour and the existing Plane paths. GPU acceptance runs
headed on the physical NVIDIA GPU. Software-device results are identified as software results and
may support those test suites; they never satisfy Space's physical-GPU numerical, performance or
stability acceptance requirements.
Project 1 does not reinterpret Project 0's G1 requirements.

## 17. Deferred
Temporal reprojection, path tracing, volumetrics and meshing (charter); Mandelbox; fractional and
higher bulb powers; arbitrary 4D slice rotations; section clipping and cut faces; deep 3D
compensation or perturbation research (G5-A's recurrence correction, if adopted, is not this);
estimator-scaled flight assist (unless it proves useful); inertia and collision; general render
queues; tiled giant stills; parameter maps, variations and publication animation.

## 18. Risks
- Plane regressions during extraction → move-first, path-only diffs, the full Plane gate.
- Quaternion estimator usability and stop-on-unresolved coverage → early family validation.
- Precision outside measured domains → the tested-conditions badge; no universal claims.
- Compounded cost of shadows, AA and instruments → shared admission limits, frozen acceptance workload.
- Loss-recovery and stale-result races → explicit epochs and revisions; fake-backend tests.
- WebGL 2 and WebGPU contexts coexisting in one page → verified early in 1b.1.
- Pipeline preparation time → prepared before interaction, measured.

## 19. Open questions for the user
These are product questions; the architecture supports either answer.
1. **Fresh start:** with no saved session or legacy URL, should ATLAS open Plane or a Space overview?
2. **Space's initial look:** neutral inspection or atmospheric exploration? Both remain available as
   presets.
3. **Bridge flow:** should the bridge open the linked instruments immediately, or offer a compact
   "Compare the section" action?
4. **USER DECISION — camera moves in undo:** our recommendation is that continuous navigation and
   pure camera jumps go to camera history (back/forward), and ordinary undo covers parameters,
   tracing, slices, appearance and whole-scene restorations. Alternatively, camera drags and wheel
   bursts also become undo entries.
5. **Touch/mobile Space navigation** in Project 1, or desktop-first? (Plane's mobile behaviour is
   preserved regardless.)
6. **Space share URLs** in Project 1, or files and discovery cards only? (Legacy Plane links stay
   supported regardless.)
7. **Legacy output:** should Plane also offer writing the old v1 location JSON for older ATLAS copies?
   (Reading old artefacts is mandatory either way.)
8. **Discoveries library presentation:** one combined view with workspace filters, or a view per
   workspace? (Storage is the same either way.)

## 20. Revision triggers
- Project 0 records its decision: confirm or revise §2, §9 (backend annex) and §10.3.
- Project 0's precision section reports: revisit §10.5 and the §16.2 matrix.
- Any user answer in §19 that changes scope: amend §3 and the affected sections.
