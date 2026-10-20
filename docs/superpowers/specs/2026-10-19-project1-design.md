# Project 1 — Foundations (1a), Space (1b) and Space deep zoom (1c)

**Status:** **approved by the user on 2026-10-20** (rev 3.2, including charter amendment A1, approved after review; the 1a implementation plan is `docs/superpowers/plans/2026-10-20-project1a-foundations-plan.md`), with answers to four §19 questions that
affect 1a (recorded in §19.1 and applied throughout this revision): (1) camera history is separate
from undo; (2) a fresh start opens Plane; (3) this is greenfield development, so no backwards
compatibility with existing ATLAS artefacts is kept (§12 records what was removed and why);
(4) one Discoveries control, filtered per workspace and fed by discovery sources, with only the
local source built in Project 1 (§13.10). · **Date:** 2026-10-20 · **Revision:** 4 (rev 2 was
Codex-READY on 2026-10-19; rev 3 applies the user's decisions; 3.1–3.2 apply Codex's co-author reviews;
rev 4 adds Project 1c, Space deep zoom, by the user's decision "Yes, add deep zoom as 1c in Project 1."
(2026-10-20) — §21; rev 4 is a draft amendment awaiting the user's review)
**Authors:** Claude and Codex, co-designed as peers. The verbatim exchange is archived in
`docs/codesign/project1-log.md`, a project-specific log kept beside the protocol's
`docs/codesign/conversation-log.md` (which holds the charter and Project 0 co-design).
**Governed by:** `docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md`, including amendments
A1 and A2 recording the user's decisions of 2026-10-20. A1 removes compatibility obligations for earlier
artefacts. The remaining charter requirements, including preservation of requested Plane parameters
and disclosure of effective Space precision, continue to apply. Section references like "charter
§3.4" point there.
**Depends on:** Project 0 (`2026-10-18-project0-space-qualification-design.md`) for the Space
backend and its qualified arithmetic (§2).

## 1. Problem and outcome

The charter outlines Project 1 (with amendment A2) as three parts:
- **1a, Foundations:** Plane moved without behaviour change, versioned scenes, undoable scene
  commands with a separate camera history, immutable render requests with truthful outcomes and
  reports, and the Discoveries control over a local discovery store.
- **1b, Space:** a 3D workspace for the Mandelbulb and the quaternion Julia set, delivered in three
  usable milestones.
- **1c, Space deep zoom** (user decision, 2026-10-20): after 1b, extend Space's validated detail
  range using high-precision coordinates, reference orbits and family-specific GPU evaluation. A
  bounded precision spike establishes the supported families, numerical formulations and tested
  domains before product integration (§21).

This spec fixes the scope, contracts and verification of all three. It authorizes no implementation.
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
precision-sensitive quaternion arithmetic requires remediation. The subsequent update relayed on
2026-10-20 says E8 invalidated the G5-A formulation and identifies replacement work as G5-D. These
reports do not establish qualification; the final recorded decision and numerical evidence control
the product formulation. Chrome 151 reports empty adapter device strings; headless WebGPU is unreliable on
this host.

## 3. Releases and the acceptance demonstration

Each release is usable on its own.

| Release | Usable outcome |
|---|---|
| **1a — Foundations** | Every existing Plane workflow preserved (in the new native formats); scenes round-trip; parameter edits undo and camera moves have back/forward history; exports capture immutable state; Plane discoveries are kept in the durable local store and shown by the Discoveries control. |
| **1b.1 — Render and recover** | Explore the calibration objects, Mandelbulb and quaternion Julia; orbit and basic flight; recover from bad camera positions, cancellation, allocation failure and device loss; save and reopen scene JSON. Estimator category, pending marks and distinct statuses are present from this release. |
| **1b.2 — Connect and inspect** | Pick a parameter in Plane and open its quaternion Julia set; compare the invariant section with the independent complex-Julia instrument; inspect an orbit; read the precision indicator. |
| **1b.3 — Complete the workflow** | Scoped presets, saved compositions, discovery cards, viewport and 4K PNG export with companion scene and report. |
| **1c.0 — Precision spike** (feasibility milestone, not a product release) | A preregistered, bounded feasibility study per family and numerical profile, with a go / partial / no-go decision report for the user (§21.2). |
| **1c.1 — Deep zoom** | For each family the spike qualified: deep navigation, anchored tracing, deep inspection, discovery reload and immutable export within the frozen deep matrix (§21.3–§21.6). |

| Acceptance step (charter §4) | Works from |
|---|---|
| 1. Pick c in Plane | 1a (Plane unchanged) |
| 2. Open its quaternion Julia set in Space | 1b.2 (bridge) |
| 3. Find a feature | 1b.1 |
| 4. With κ = 0, compare the invariant section with the complex-Julia instrument | 1b.2 (§13.5) |
| 5. Inspect a point's orbit | 1b.2 |
| 6. Change a parameter, then undo | 1a mechanism; in Space from 1b.1 |
| 7. Save a discovery card, reload, reproduce the view | 1b.3 (the Discoveries control and local store exist from 1a) |

1b.2 makes steps 1–6 work end to end. The complete seven-step demonstration is 1b.3's exit
criterion, run as one recorded investigation, headed, on the physical GPU. It includes a parameter
edit that visibly changes the scene and an undo that restores it. Reload must restore the scene,
the selected point, the inspector settings and the effective numerical parameters, not merely a
similar-looking camera.

1c does not change this demonstration or make 1b incomplete. It has its own recorded deep
investigation as its exit criterion (§21.6).

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
    diagnostics.js palettes.js persistence.js
    discoveries.js          discovery record, DiscoverySource interface, local source
  ui/
    shell.js dialogs.js notifications.js workspace-switcher.js discoveries.js
                            (plus icons.js, style.css)
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
- CPU fallback, worker cancellation, tours, touch gestures, saved discoveries, share links, location
  files and image exports remain available, in the new native formats (§12, §14).
- Existing layouts and controls remain usable at the tested desktop, laptop and mobile sizes.

The contract protects rendering, navigation, precision and export **behaviour**, not file or URL
formats. Space's draft/settled policy never replaces Plane's rendering policy: the shared scheduler
accommodates Plane's existing cadence. Existing browser assertions survive, with import-path and
narrowly justified shell adjustments, never weakened expectations. The one permitted class of
assertion change is a format-dependent assertion in the existing share-link and location
export/reimport tests (`tests/browser.mjs`: the `#re=-2` URL match and both `savedLocation.view`
comparisons). These are updated for `atlas.scene`. The share test opens the URL actually generated
by the application and verifies exact coordinates and resolved scene settings. The location test
inspects the actual downloaded file, changes the live scene, reimports that same file, and verifies
complete scene restoration. These replace the old URL match and both `savedLocation.view`
comparisons without weakening behavioural coverage.

Import-path and justified shell-selector changes remain permitted. Tests may add explicit, bounded
synchronization for asynchronous discovery loading, while retaining their existing persistence
expectations; exploration is never blocked on discovery loading to preserve a test's timing
assumption. Other behavioural assertions remain unchanged.

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
  provenance: { createdBy: "atlas", bridgedFrom? }   // bridgedFrom: the originating Plane scene (§13.4)
}
```
- Scenes are frozen; every edit produces a new validated scene. A canonical serialization gives a
  stable `sceneHash`.
- The scene excludes GPU objects, generation counters, progress, hover/selection state, panel
  layout and hardware identity. Reports and discovery cards are separate records.
- Whole-scene validation precedes any commit, including import. Unknown schema or model versions
  are reported as unsupported, never guessed. Invalid or out-of-range values are reported, never
  repaired or clamped. Imported scenes contain data only. There is exactly one accepted scene
  format, `atlas.scene` (§12); discovery records (§13.10) are separately versioned containers.
  Native scenes contain every required field, and a Plane scene names a registered palette ID;
  nothing is inherited from the current settings.

### 5.2 Model-specific fields
- **Plane:** camera `{ re, im, zoom }`. `re` and `im` are exact decimal strings; `zoom` is the
  base-10 magnification exponent. `zoom` remains a finite JSON number, preserving its numerical
  rendering meaning (`validateView` requires a finite number); negative zero may normalize to zero.
  Appearance is `{ palette, phase, frequency, relief }` and `iteration.detail` is an integer 0–5;
  values outside today's control ranges (phase [0, 1], frequency [0.2, 2.5], relief [0, 1]) are
  invalid, not clamped. The iteration
  policy is named and versioned: `plane-detail-zoom-v1` =
  `[512, 1024, 2048, 4096, 8192, 16384][detail] + max(0, ceil((zoom − 3) · 32))` (today's
  `app.js:85`).
- **Space camera:** `anchored-perspective-v1` (rev 4, so that 1b and 1c share one representation):
  `{ kind: "anchored-perspective-v1", anchor: [x, y, z] exact decimal strings, scale: { mantissa,
  exponent } (a normalized finite mantissa and a bounded integer binary exponent), positionLocal,
  focusLocal: three CPU doubles each, orientationWxyz, verticalFovDegrees }`. The represented world
  position is `anchor + scale × positionLocal`. CPU navigation performs the anchor arithmetic at
  controlled high precision; recentring preserves represented positions to a declared bound and never
  reconstructs a world position through a single `Number`. Ordinary Space (1b) uses the same
  representation at modest scales while its field evaluator stays binary32. The representation is
  defined before 1b implementation, so introducing 1c does not require a camera-format migration. World Z defines up. Orbit and basic flight use upright navigation without a
  dedicated roll control. The orientation control may set a full camera orientation; axis
  constraints and orientation reset remain available. Serialization preserves the orientation.
- **Space parameters:** requested values remain decimal strings (for example
  `C: ["-0.2", "0.8", "0", "0"]`, `kappa: "0"`, `power: "8"`). Ordinary-profile preparation derives
  effective binary32 values and bit patterns. Deep-profile preparation derives the effective
  parameter representation specified by its qualified numerical profile (§21.5). Requests, reports
  and inspection results identify that representation and its precision beside the requested
  strings; effective values never overwrite requested values.

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
- **Camera history (user decision, 2026-10-20):** a per-workspace pose history (back/forward),
  separate from undo, plus overview and orientation reset, always one action away (charter §3.10).
  Continuous navigation (one drag, one pinch, one wheel burst, one key repeat run) and camera-only
  jumps (zoom buttons, coordinate entry, double-click, focus) each add one camera-history entry.
  Ordinary undo covers parameters, tracing, slices, appearance and whole-scene restorations, and
  never moves the camera except through `restoreScene`. Navigation actions that also change palette,
  detail or other content (for example Plane's curated places, which carry a palette, applied by
  `goTo`) record their content change as one undoable edit and their camera change as one
  camera-history entry. Opening a complete scene or discovery is an atomic whole-scene restoration:
  one undo entry restoring every domain, and one camera-history entry for the pose it opens.
- **Camera-history rules:** at most 100 poses per workspace. Moving back or forward changes only the
  camera and records nothing new; a new pose after moving back discards the forward poses. A tour
  captures its starting pose before its first automated jump and its final pose when stopped,
  without intermediate entries or consecutive duplicates. Back/Forward stops active navigation or a
  tour before restoring a pose. A camera-history move, like an undo, receives a new view revision
  (§7.2).
- **Synchronization of the two histories:** camera history is seeded with the workspace's initial
  accepted camera, and its current entry always matches the committed camera. Every committed
  camera change outside Back/Forward, including undo or redo of a whole-scene restoration, appends
  the resulting pose, suppresses consecutive identical poses, and truncates any forward branch.
  Content-only undo and redo leave camera history unchanged. (Start at A, open discovery B, undo:
  the camera returns to A and camera history reads A, B, A with the cursor on the last A, so Back
  goes to B.)

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
Space cameras use the anchored representation in §5.2. Anchor arithmetic uses controlled high
precision; local camera coordinates, orientation and field of view use CPU doubles. Ordinary Space
evaluates fields in binary32. Qualified 1c profiles use the reference, perturbation and range
representations specified by §21; their use of binary32 components does not require collapsing a
represented point into one binary32 value.

Camera-relative transport does not translate the mathematical model: recurrence inputs represent
points in the model's native coordinates. Navigation precision, field precision and rendering
tolerance remain separate problems. Neither the anchored camera nor camera-relative transport alone
establishes field accuracy.

### 10.2 WGSL floating-point rules
WGSL permits reassociation and fusion, and permits implementations to assume runtime infinities
and NaNs are absent; after a runtime overflow the result is an *indeterminate value*. Therefore:
- domain and range checks precede every dangerous operation; post-hoc NaN or infinity detection is
  insufficient;
- source-level temporaries are not arithmetic barriers;
- product GPU-versus-CPU tolerances come from an error analysis written before measuring that covers
  both fused and unfused evaluation, never from tuning to results.

### 10.3 Quaternion arithmetic
Project 1 independently implements and validates the arithmetic formulation recorded for Project 0's
selected configuration, citing its numerical analysis and qualification evidence, in
`space/render/webgpu/`. No remediation candidate is adopted merely because it was proposed or
attempted. This evidence concerns recurrence evaluation only. It does not establish quaternion
surface accuracy, validate the estimator or promise deeper detail. This is a named revision trigger
(§20).

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
  floor. Outside recorded coverage, the badge reports which tested condition is exceeded or that no
  matching validation exists. Coordinate collapse, sample collapse and stagnation are reported
  separately when observed; they are not inferred merely from being outside coverage. It never
  blocks navigation. Each family has validation records bound to the product implementation, profile and
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

## 12. Removed: legacy compatibility (user decision, 2026-10-20)

The user decided that ATLAS is greenfield development: "No this is green field development. No need
to keep backwards compatability." Revision 2's §12 (legacy artefact reading and migration) is
therefore removed, together with everything that existed only to serve it.

**Removed:**
- the adapters for the old `#re=…&im=…&z=…&palette=…` share links, the
  `localStorage['atlas.discoveries']` bookmarks and the `{ application: 'ATLAS', version: 1 }`
  location JSON (rev 2 §12.1);
- the legacy rules (rev 2 §12.2): context-dependent defaults and `provenance.resolvedFromContext`,
  the entry-path-specific `view.detail` handling, legacy coercions and `provenance.clamped`, bulk
  migration with read-back, idempotence, tombstones and retained unsupported records;
- `shared/legacy.js`, the `legacy-*` provenance sources and the original-hash-text provenance;
- the non-destructive adapter wording in §5 and §14, and old-format writing (rev 2 §19 Q7);
- the tests and acceptance items that existed only for these (rev 2 §16.1's captured context,
  entry-path `view.detail`, migration idempotence and tombstones, unsupported-record retention).

**Why:** the user explicitly removed compatibility with artefacts from earlier copies. Project 1
therefore omits their readers, migration machinery and format-specific rules while retaining the
native workflows listed below.

**What remains:** Plane's functional behaviour is unchanged (§4.3). Its share links, saved
discoveries, location files and image exports keep working, in the native formats: share links and
location files carry an `atlas.scene` (§14), and saved discoveries are discovery records in the local
store (§13.10). Old-format input is recognized only to report unsupported input. An old share link
encountered at startup opens fresh-start Plane with an unsupported-format notice. During an existing
investigation, it reports the problem without replacing the scene or either history. Old location
files are rejected without changing the investigation. ATLAS neither reads nor modifies
`localStorage['atlas.discoveries']`; existing data there is left untouched. Charter §3.9's adapter
rules, §4's 1a "legacy adapters" and §6 decision 8 are superseded by this decision; the charter
carries a dated amendment recording it (see the header).

## 13. Workspaces and interface

### 13.1 Shell
Two retained investigations, one active view. A workspace switch preserves each workspace's scene,
camera, undo history and camera history; hidden work pauses, captured input is released, and
transient resources may be reclaimed. Shared surfaces: the Discoveries control (§13.10), palettes,
graphics diagnostics (extended with the Space backend and its tracked inventory).

**Start (user decision, 2026-10-20):** a fresh start opens **Plane** at its existing default view
(`INITIAL_VIEW`, Seahorse valley, default appearance and detail) without acquiring a Space device.
A supported Plane share link opens Plane with its scene; Space share-link support remains subject
to §19.2 Q6. Project 1 does not restore the previous session on reload; reopening work is done
through discoveries, scene files and share links.

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
- **Discovery card:** a Space discovery card is an `atlas.discovery` record (§13.10) whose optional
  `card` payload contains:
  ```js
  { selectedPoint,
    inspection: { inputs, effectiveInputs, settings, evaluatorVersion, results },
    reportId }
  ```
  Name, note, scene snapshot, scene hash and thumbnail belong to the enclosing discovery record.
  Cards do not introduce another record format or independent store. The stale-inspection rules
  below apply to this payload.
  A stale inspection never becomes a current-looking card silently: saving either refreshes it or
  records its stale provenance. Opening a card is a whole-scene restoration.

### 13.9 Fog, pause and update (1b.3)
Minimal exponential depth fog, applied in the appearance pass only, off in diagnostic modes, with an
obvious off switch. Pause and update per §7.3.

### 13.10 Discoveries control and discovery sources (user decision, 2026-10-20; built in 1a)
One **Discoveries control** (`ui/discoveries.js`) serves every workspace. Each workspace shows it
filtered to its own workspace type; a filter is a query parameter, not a separate store or view
implementation. In 1a it replaces Plane's "Your discoveries" tab with the same visible behaviour:
save with B or the bookmark button, a thumbnail list, open, delete, and the empty-state message.

- **Discovery record** (`shared/discoveries.js`), versioned and validated as a whole like a scene:
  ```js
  { schema: "atlas.discovery", schemaVersion: 1, id, workspace: "plane" | "space",
    name, note, createdAt, sceneSnapshot, sceneHash,
    thumbnail: { sourceSceneHash, sourceReportId, mediaType, blob },  // sourceReportId: the render used
    card?: { selectedPoint, inspection, reportId } }    // Space discovery cards, 1b.3 (§13.8)
  ```
  `sceneSnapshot.workspace` equals `workspace`. A Plane discovery is name, scene and thumbnail; a
  Space discovery card adds `card`. Opening any discovery is a whole-scene restoration (§6).
  Validation checks that `sceneHash` matches the canonical scene snapshot. Thumbnail and inspection
  provenance must not silently represent an earlier scene as current. Source identity is attached by
  the registered source adapter; record identity in the control is `(sourceId, id)`.
- **DiscoverySource interface:** each source has an `id`, a display label and declared
  capabilities (`save`, `remove`). `list({ workspace, limit, cursor, signal }) → { items, nextCursor }`
  and `get(id, { signal })` return promises. Sources declaring write capabilities implement
  `save(record, { signal })` and `remove(id, { signal })`, also returning promises.
  `subscribe(listener) → unsubscribe` establishes a subscription synchronously; notifications
  describe committed changes.
- **Reads** are cancellable and bounded by a control-level timeout. Results carry their source and
  query identity; a late result for an obsolete workspace, filter or request is discarded even if
  cancellation was ineffective.
- **Writes:** cancellation requests an abort; it does not establish the outcome. The local source
  saves each discovery and its thumbnail atomically, and reports success only after commit. A
  cancellation arriving after commit cannot turn that success into an aborted write. If a timeout
  occurs before the outcome is known, the control reports that it is still checking the result and
  reconciles against the local store. It never claims that a save or deletion succeeded, or did not
  occur, solely because waiting ended.
- **Isolation:** a failing or slow source is shown as unavailable in the control; it never hides
  another source's results or blocks exploration.
- **Records from a source are data.** The control validates every record and its scene before it
  is shown or opened; an invalid record is listed as unsupported and never opened. Source records
  carry the source id, so identical ids from different sources never collide.
- **Project 1 builds one source: `local`,** backed by the IndexedDB store (§14), with `save` and
  `remove`. Ordering is newest first. Deletion has no application-level undo or soft-delete stage;
  the control confirms removal only after the local operation commits, and failure leaves the record
  available. Storage failure leaves
  exploration usable, offers the scene file, and never reports a save that did not happen.
- **Future direction (user-stated, not Project 1 scope):** a project landing page, and a shared
  source served by a centrally hosted API, feeding the same control beside the local source (§17).
  Project 1 adds no network code, account, sharing or remote source; the interface exists so a
  later source can be added without changing the control or the record.

## 14. Persistence and export

- **Persistence:** IndexedDB stores discovery records and their thumbnail blobs, reports and
  compositions. Space cards use the discovery record's `card` payload from 1b.3. `localStorage` only for small preferences. Storage failure leaves exploration
  usable, offers downloadable scene data, and never reports a save that did not happen.
- **Scene files:** export and import of scene JSON (`atlas.scene`), from 1a for Plane and 1b.1 for
  Space. Plane's "Save location" and "Open location" use this format; it is the only accepted
  location-file format.
- **Share links (Plane, 1a):** `#scene=` followed by the canonical scene serialization, encoded as
  base64url UTF-8. It carries every coordinate digit and every scene field; opening one is a
  whole-scene restoration after whole-scene validation. An invalid or unsupported link at startup
  opens the fresh-start view (§13.1) with a notice; one encountered during an existing investigation
  (a `hashchange`) reports the problem without replacing its scene or either history. Space share links remain an open question (§19 Q6).
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
  job. Plane's existing image-export choices remain; its location file is the scene JSON above.
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
| Scene, history, discoveries | Node | Exact strings, canonical serialization and hashes, whole-scene validation (invalid values reported, never clamped; old formats rejected), share-link and scene-file round trips, domain-scoped undo, grouped gestures, camera-history rules, discovery-record validation, source failure and timeout isolation, write cancellation before and after commit, a timeout followed by a committed result, late list results after a workspace switch, the A → open B → undo → Back/Forward case, local-store save, list, delete and storage failure |
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
higher bulb powers; arbitrary 4D slice rotations; section clipping and cut faces; for 1c (§21):
general formula perturbation, reference reuse across parameter changes and speculative reference
prediction, a general GPU arbitrary-precision framework, a second runtime backend or an interactive
CPU Space fallback, and unlimited depth, universal accuracy claims or guaranteed performance at every
admitted depth; estimator-scaled flight assist (unless it proves useful); inertia and collision; general render
queues; tiled giant stills; parameter maps, variations and publication animation.

**User-stated future direction (2026-10-20), outside Project 1:** a landing page that presents the
project, its goals and what others are doing; and shared discoveries served from a centrally hosted
API, consumed as a second discovery source by the same Discoveries control (§13.10). These need their
own spec (hosting, identity, moderation, privacy and trust of remote records) and do not grow 1a.

## 18. Risks
- Plane regressions during extraction → move-first, path-only diffs, the full Plane gate.
- Losing Plane functions while changing formats → behaviour assertions replace format assertions at
  equal strength (§4.3); share-link, location-file and discovery round trips are tested.
- Quaternion estimator usability and stop-on-unresolved coverage → early family validation.
- Precision outside measured domains → the tested-conditions badge; no universal claims.
- Compounded cost of shadows, AA and instruments → shared admission limits, frozen acceptance workload.
- Loss-recovery and stale-result races → explicit epochs and revisions; fake-backend tests.
- WebGL 2 and WebGPU contexts coexisting in one page → verified early in 1b.1.
- Pipeline preparation time → prepared before interaction, measured.
- 1c: compiler transformations of compensated arithmetic → treated as candidates, validated on the
  compiled backend; poorly conditioned reference differences and reference upload error → derived
  error analysis; reference proliferation across a 3D ray workload and preparation cost → bounded
  reference jobs and separate budgets; derivative error amplification → spike stage 2; bulb
  singularities → family-specific spike; coordinate collapse in downstream passes (normals, shadows,
  depth, picking) despite a correct orbit kernel → the anchored representation everywhere (§21.5).

## 19. Questions for the user

### 19.1 Answered (2026-10-20)
- **Fresh start** (rev 2 Q1): open Plane (§13.1).
- **Camera moves in undo** (rev 2 Q4): separate camera history, as recommended (§6).
- **Legacy output** (rev 2 Q7) and legacy reading: "No this is green field development. No need to
  keep backwards compatability." (§12).
- **Discoveries presentation** (rev 2 Q8): "Maybe both. Each workspace would want to showcase it's
  discoveries. Maybe the way that is does that is via a discoveries control that each workspace
  filters to their workspace type. This is future think here, but maybe if we have a landing page
  that talks about the project, goals, what others are doing, the discovery control can be fed by
  local discoveries and shared discoveries served from an API that is centrally hosted?" Applied as
  §13.10, with the landing page and shared API recorded in §17.

- **Deep zoom** (2026-10-20): "Yes, add deep zoom as 1c in Project 1." Applied as §21 and charter
  amendment A2.

### 19.2 Open
These affect only 1b and 1c; the architecture supports either answer to each.
2. **Space's initial look:** neutral inspection or atmospheric exploration? Both remain available as
   presets.
3. **Bridge flow:** should the bridge open the linked instruments immediately, or offer a compact
   "Compare the section" action?
5. **Touch/mobile Space navigation** in Project 1, or desktop-first? (Plane's mobile behaviour is
   preserved regardless.)
6. **Space share URLs** in Project 1, or files and discovery cards only? (Plane's native share links
   exist from 1a regardless.)
9. **USER DECISION — partial deep zoom:** if the Mandelbulb spike is partial or no-go, may 1c ship
   quaternion-Julia deep zoom while the bulb stays at ordinary precision (recommended), or must 1c
   wait for both families?
10. **USER DECISION — deepest-range interaction:** at the deepest supported settings, is progressive
    exploration with visible reference-preparation pauses acceptable (recommended), or is
    continuous interactive motion a release requirement?
    **User answers (2026-10-20):**
    - **Q9:** yes. 1c may ship quaternion-Julia deep zoom while the bulb stays at ordinary
      precision.
    - **Q10:** the 1c spike proposes the reference-preparation pause budgets (typical and deepest)
      for the user's approval before acceptance. The user's stated expectation is that pauses are
      "way lower than a second".

## 20. Revision triggers
None of these affects 1a.
- Project 0 records its decision: confirm or revise §2, §9 (backend annex) and §10.3.
- Project 0's precision section reports: revisit §10.5 and the §16.2 matrix.
- **Project-0-dependent (1b, §10):** per the relayed execution decision E8, Project 0's G5-A
  compensated evaluation was defeated by compiler reassociation and recorded as invalid; replacement
  work is G5-D. §10.3 is confirmed against whatever formulation Project 0 finally records. Plane
  contains a runtime `u_round` factor and bitwise splitting (`src/shaders.js`, perturbation
  fragment); `HANDOFF.md` records that these addressed the observed GLSL driver issue. They are
  candidates for investigation, not established WGSL arithmetic barriers, and remain subject to the
  preregistered error analysis (§10.2).
- **1c (resolved by rev 4):** E9's direction — Space deep zoom by perturbation, as in ATLAS 2D — is
  placed in Project 1c (§21), gated on Project 0's recorded backend and arithmetic decision. It
  changes no Project 0 inputs, gates or evidence. The 1c.0 spike result is a revision trigger: the
  spec is amended to record each family's go / partial / no-go outcome and its numerical profile
  before 1c.1 is planned.
- Any user answer in §19.2 that changes scope: amend §3 and the affected sections.
## 21. Project 1c — Space deep zoom (rev 4; user decision, 2026-10-20)

### 21.1 Placement and gates
- 1c follows 1b.3 and never delays 1b or its acceptance demonstration.
- It starts only after Project 0 records its selected backend and arithmetic formulation. That
  record is a prerequisite, not evidence that 1c's additional formulations work. A failed 1c
  experiment does not reopen Project 0 or block the ordinary-precision 1b release.
- Mathematical preparation (derivations, independent references) may begin earlier; compiled-backend
  experiments need the selected backend and an available GPU (§2 isolation still applies).
- 1c.0 and 1c.1 each follow a user-approved plan. 1c.1 is planned only after the spike's decision
  report has been reviewed by the user (§19.2 Q9).
- **Relationship to ordinary profiles:** §7.6's work limits and elapsed-work budgets, §10.3's
  Project-0-derived arithmetic, §13.3–§13.6's CPU-double/binary32 evaluation paths, and §16.2/§16.4's
  workload and performance targets describe ordinary Space. Deep profiles replace the applicable
  numerical representations, evaluator paths and budgets through §21's qualified profile. Shared
  lifecycle, publication, status, cancellation, export and allocation rules continue to apply. No
  deep-profile limit is inferred to be unbounded.

### 21.2 1c.0 — the bounded precision spike
A disposable, preregistered study, never imported by `src/`. Sample sets, error criteria, work
limits and the maximum number of candidate revisions are frozen before any GPU measurement: one
candidate and one bounded remediation cycle per family; further research needs a recorded amendment.

| Stage | Required result |
|---|---|
| 1. Arithmetic | Compiled primitives preserve the identities and error bounds their algorithms require, including cases where the low component changes the answer. Normal-range compensation is tested separately from exponent extension; deep range never depends on subnormals surviving (WGSL may flush them). |
| 2. Field evaluation | Complete perturbed orbits, escape classifications and sensitivity/estimator values agree with independent higher-precision references within preregistered bounds. |
| 3. Deep tracing | Anchored rays, rebasing, hit decisions, normals and depth readback keep meaningful distinctions beyond ordinary precision. |
| 4. Cost and recovery | Reference preparation, GPU work, memory, cancellation and recovery fit explicit budgets. |

- **Arithmetic candidate:** ATLAS 2D's runtime `u_round` factor and bitwise split, ported as
  `bitcast<f32>(bitcast<u32>(x) & 0xfffff000u)`. It is a candidate, not a WGSL rounding guarantee:
  WGSL permits reassociation and fusion around it (Project 0 precision note). Evidence is bound to
  the shader, pipeline, uniform values and available device and browser identity; a failing
  arithmetic self-check makes that numerical profile unavailable.
- **Outcomes, per family and numerical profile:** **go** — every stage passes for the frozen domain
  with useful detail beyond the ordinary renderer; **partial** — a named subset passes (for example
  quaternion Julia, or selected bulb powers or domains), failed coverage stays explicit; **no-go** —
  correctness or useful cost cannot be established; the report and the ordinary renderer remain, and
  nothing is silently substituted (no double CPU evaluation, dropped assertions or enlarged
  tolerances). An extended-exponent claim needs passing cases beyond ordinary binary32 delta range;
  an arbitrary-precision positioning claim needs cases where absolute binary64 coordinates collapse.
- **Exit:** a decision report, reviewed by both peers and given to the user.

### 21.3 Family formulations
- **Quaternion Julia (primary candidate).** With reference Qₙ₊₁ = Qₙ² + C_ref, actual qₙ = Qₙ + δₙ
  and C = C_ref + ΔC: δₙ₊₁ = Qₙδₙ + δₙQₙ + δₙ² + ΔC. The non-commutative terms are essential (for
  Q = i, δ = j: Qδ + δQ = 0, whereas 2Qδ = 2k). The first product version ties references to the
  current C; editing C rebuilds them. The spike also covers: reference representation error
  (uploading a high-precision orbit as finite components, with its rounding and residuals in the
  error analysis); rebasing that preserves the represented point and the actual iteration count
  (δ′ = δ + Qᵢ − Rⱼ at the selected indices — Plane's reset-to-zero rule does not transfer, because
  a Julia reference does not generally start at zero); and bounded replacement when a reference escapes early,
  becomes poorly conditioned or runs out, never silently restarting the orbit or its derivative.
- **Mandelbulb (separate feasibility).** δₙ₊₁ = P_p(Qₙ + δₙ) − P_p(Qₙ) + Δx must be evaluated without
  moving the cancellation into the power-map subtraction: a stable difference formulation of the
  specified spherical power map, or a bounded higher-order expansion only if its remainder and
  applicability are controlled. A Jacobian-only update is an approximation whose neglected terms
  cannot be ignored. Cases: the origin, the polar axis, the azimuth seam, small transverse offsets and
  transitions between applicable regions. The independent reference supports the required
  high-precision transcendental operations. Powers 2–8 have separate evidence; power 8 qualifies only
  power 8. Delivery is quaternion-first, bulb conditional on its spike result (§19.2 Q9).

### 21.4 Sensitivity, estimator and deep tracing
- Sensitivity is in the spike's scope. For quaternion Julia's scalar sensitivity, with d = D + η,
  R = ‖Q‖ and Δr = ‖Q + δ‖ − R: η′ = 2Rη + 2Δr·D + 2Δr·η, and, where the denominator is nonzero,
  Δr = (2⟨Q, δ⟩ + ‖δ‖²) / (‖Q + δ‖ + ‖Q‖). These are candidates; the spike compares the perturbed
  form with direct scaled/log accumulation of the actual sensitivity. η and Δr are signed
  corrections; §10.4's nonnegative representation applies to the actual and reference
  sensitivities. Both forms preserve the zero state (§10.4), avoid overflow and carry the actual orbit's derivative history across rebasing.
- The estimator stays **heuristic and exterior-only**; better arithmetic does not make it a
  conservative distance.
- A separately versioned deep tracing profile replaces `surface-v1`'s fixed 10⁻⁶ floor: a
  pixel-footprint tolerance in scaled or log form; an estimate too uncertain for the decision yields
  unresolved or bounded higher-precision work; no forced minimum step, fabricated zero estimate or
  manufactured hit; ray parameter, advancement and stagnation in the anchored representation; normal
  offsets, shadow biases, AO distances and depth reconstruction under the same scale policy. A small
  local ray parameter is not the distance from the camera.

### 21.5 Representation and product integration
- **Scenes:** the anchored camera (§5.2) plus a versioned numerical profile and requested precision
  and resource settings. Requested C and κ strings stay authoritative; 1c evaluates parameters at
  high precision, and a mode that still evaluates rounded binary32 C says so. Escape bounds come from
  the parameters actually evaluated, outward-rounded. Deep picked points and inspection inputs are
  stored anchored or exact. Reference arrays and GPU resources never enter scenes; reports identify
  their generator, precision, representation and content. Lexical size and exponent checks precede
  any BigInt allocation, with Space's own measured resource limits.
- **Modules:** Space-owned `space/precision/` (coordinates, reference orbits, perturbation, deep
  validation). The shared scheduler keeps admission and lifecycle only.
- **Reference jobs:** bounded worker jobs with generation identities, explicit precision and iteration
  limits, cancellation and classified failures. (Plane's worker computes references synchronously;
  that structure is not copied.)
- **Requests and reports** add the numerical profile, anchor and scale, effective parameter
  representation, reference identity and precision, and rebase policy; resource accounting adds CPU
  reference memory and preparation time. Epoch, stale-result, export and 1 GiB GPU rules still apply.
- **Instruments:** the deep inspector and the invariant-section comparison use evaluators that can
  represent deep inputs; widening a collapsed binary32 point to double verifies nothing. Deep
  comparisons freeze one shared set of represented starting points, effective parameters, bailout and
  iteration settings, and both evaluators consume those same inputs. Camera classification,
  inspection and slice results identify their evaluator and input precision; an ordinary-precision
  result is never presented as a current deep-profile measurement.
- **Identity:** reference caches identify the model, effective parameters, reference anchor,
  precision, iteration coverage, generator version and stored representation. Resolved geometry
  dependencies include the numerical profile and the reference and rebase inputs that can affect
  results; changes follow §7.2's revision and accumulation rules. Runtime job identities stay distinct
  from content identities.

### 21.6 Verification and acceptance
- Three independent layers: arithmetic and recurrence against direct high-precision evaluation
  independent of production code (exact identities where they apply, reference convergence or
  bounded uncertainty elsewhere); estimator and tracing (sensitivity comparisons, independently
  prepared rays, convergence studies, silhouette, depth and normal checks, explicit unresolved
  coverage); and the complete workflow (deep navigation, picking, parameter edit and undo, camera
  history, discovery reload, immutable viewport and 4K export).
- A **frozen deep matrix**, prepared before GPU comparison: a depth ladder with independently prepared
  anchors; full quaternion components and nonzero κ (invariant-plane cases as a subset); reference
  cancellation, upload precision, early escape and rebase boundaries; zero sensitivity, exponent
  extremes, component imbalance and lost low parts; every claimed bulb power and its singular-region
  policy; adjacent pixels and AA samples that collapse in the ordinary representation; viewport and
  export sampling; device loss, stale reference completion, cancellation and resource exhaustion.
  Reference uncertainty is reported; unresolved reference cases never count as passes.
- **Budgets:** 1c does not inherit 1b's frame-rate and settled-image targets; separate preparation,
  interaction and refinement budgets, with cold- and warm-reference trials, are frozen before
  acceptance (subject to §19.2 Q10).
- **Product validation:** the spike qualifies a candidate formulation; the product implementation must
  reproduce the applicable frozen numerical and tracing checks before it receives a product
  validation record.
- **Exit:** one recorded deep investigation per qualified family, including a witnessed improvement
  over the ordinary path on matched inputs (not merely navigation outside its previously tested
  domain), headed, on the physical GPU: navigate
  beyond the ordinary renderer's tested limits, inspect a point, edit a parameter and undo, save a
  discovery, reload and reproduce, export.
