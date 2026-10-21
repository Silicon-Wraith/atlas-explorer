# Project 1 — Foundations (1a), Space (1b) and Space deep zoom (1c)

**Status:** **approved by the user on 2026-10-20** (rev 3.2, including charter amendment A1, approved after review; the 1a implementation plan is `docs/superpowers/plans/2026-10-20-project1a-foundations-plan.md`), with answers to four §19 questions that
affect 1a (recorded in §19.1 and applied throughout this revision): (1) camera history is separate
from undo; (2) a fresh start opens Plane; (3) this is greenfield development, so no backwards
compatibility with existing ATLAS artefacts is kept (§12 records what was removed and why);
(4) one Discoveries control, filtered per workspace and fed by discovery sources, with only the
local source built in Project 1 (§13.10). · **Date:** 2026-10-21 · **Revision:** 4.8 (rev 4.8 records the user's decision of 2026-10-21 on B10 S1: §11.4 names `analytic-inspection-v1`, and ordinary analytic depth is qualified against a sampling-aware envelope; see plan rev 4.8; rev 4.7 applies the B05 camera rulings (Codex runs 20261021T123602Z-6e35 and 20261021T170807Z-a7ee) and the B06 §9.1 annex changes PC1–PC8 (Codex runs 20261021T163028Z-1356, 20261021T165312Z-f480 and 20261021T170126Z-88ca) with no new user decision; rev 4.6 records the user's decision of 2026-10-21 and applies agreed Claude/Codex corrections: (1) B04 — the USER-APPROVED P1 qualification amendment and sharded matrix storage (Codex B04 fix round, run 20261021T123550Z-fdcd; convergence run 20261021T114017Z-0210): overview grid, status-stable eligibility, floors 820/64, C=(2,0,0,0) non-surface-bearing, preregistered pass rules, power-7 bulb-generic floor 410→400 only, 18 raw JSON shards plus a SHA-256 index, test split into reference-points, reference-rays and reference-p3, B08/B10 index pinning; (2) B07 — scheduler window and failed-ticket rules (Codex B07 fix round, run 20261021T123558Z-2470; Claude B07 r2): 256-operation pending window, 0.5–2× band, eight-completion spacing, the B06 failed-ticket obligation, auxiliary requests for settled jobs rejected, any-lease failure fails the whole job; (3) B05 — B12 `equalCameras` note (Codex B05 fix round, run 20261021T123602Z-6e35; Claude B05 r2); the axis-lock heading sign correction (forward azimuth minus 90°) is not yet in the plan text and travels with B05's pending fix round; other B05 corrections are not applied here. Rev 4.5 applies three Claude/Codex corrections with no new user decision: (1) §11 model-record shape — records carry no `validation`, which lives in the §16.2 registry (Codex B03 r1 I4, run 20261021T110320Z-1652; analytic `derivationVersion` values are populated strings, only recurrence, initialization and escape metadata are null); (2) the §7.4 identity erratum refined (Codex B01 r2 Q1, run 20261021T075810Z-2dd6); (3) the B01 served-source provenance wording in the 1b.1 plan (Codex B01 r3, run 20261021T110827Z-86bb). Rev 2 was
Codex-READY on 2026-10-19; rev 3 applies the user's decisions; 3.1–3.2 apply Codex's co-author reviews;
rev 4 adds Project 1c, Space deep zoom, by the user's decision "Yes, add deep zoom as 1c in Project 1."
(2026-10-20) — §21; rev 4.2 applies the user's decisions of 2026-10-21: the §9.1 WebGPU backend annex
adopted as normative, the anchored camera (§5.2/§10.1) approved for ordinary Space, §19.2 Q2, Q5
and Q6 answered (§19.1) with gamepad exploration added to Space navigation (§13.3; supported controllers: Xbox-style standard
layout, §19.1), and the §13.2
precision-badge erratum; rev 4.3 applies the user's decision of 2026-10-21 "approve amending the
adopted §9.1 annex to add allocate" (§9 method list, §9.1 Allocator and limits) together with the
B00 contract clarifications agreed with Codex (run 20261021T060324Z-4e7f: pipeline descriptor
ownership, epoch and ticket timing); rev 4.4 records rulings agreed between Claude and Codex, with
no new user decision: B02 rulings 1–10 (Codex run 20261021T072056Z-9083, ruling 3 amended by Codex
and accepted by Claude) — §5.2 Space anchors admitted through the shared anchor parser (≤ 400
significant digits, explicit exponent magnitude ≤ 400, normalized leading position in [−400, 400])
and the two-stage `Number`/`Math.fround` parameter conversion with non-finite results rejected;
and the B01 joint rulings (Codex run 20261021T073220Z-227f) — (a) §9.1 distinguishes adapter,
requested and granted limits, requests only task-needed increases (no blanket `requiredLimits`;
`maxStorageTexturesPerShaderStage` is the binding risk; read-only inputs use sampled bindings;
owner B06), (b) the §7.4 identity erratum (configuration-dependent: Chrome 151 empty, Chrome 155
populated; the code asserts neither), (c) a developer-features isolation experiment, labelled a
portability experiment, in B01's fix round (plan). **§21 (1c) remains a draft amendment awaiting the user's review.**)
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
the product formulation. Chrome 151 reported empty adapter device strings (historical; identity is configuration-dependent,
§7.4 erratum, refined rev 4.5); headless WebGPU is unreliable on
this host.

## 3. Releases and the acceptance demonstration

Each release is usable on its own.

| Release | Usable outcome |
|---|---|
| **1a — Foundations** | Every existing Plane workflow preserved (in the new native formats); scenes round-trip; parameter edits undo and camera moves have back/forward history; exports capture immutable state; Plane discoveries are kept in the durable local store and shown by the Discoveries control. |
| **1b.1 — Render and recover** | Explore the calibration objects, Mandelbulb and quaternion Julia; orbit and basic flight with mouse, trackpad, keyboard or a standard-layout gamepad (§13.3); recover from bad camera positions, cancellation, allocation failure and device loss; save and reopen scene JSON. Estimator category, pending marks and distinct statuses are present from this release. |
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
    gamepad.js              controller snapshot decoding and input state machine (§13.3)
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
  `{ kind: "anchored-perspective-v1", anchor: [x, y, z] exact decimal strings` (admitted through the shared Space anchor parser: at
  most 400 significant digits, explicit exponent magnitude at most 400, and nonzero normalized
  leading decimal position in `[-400,400]`; zero bypasses only the leading-position check)`, scale: { mantissa,
  exponent } (a normalized finite mantissa and a bounded integer binary exponent), positionLocal,
  focusLocal: three CPU doubles each, orientationWxyz, verticalFovDegrees }`. The represented world
  position is `anchor + scale × positionLocal`. CPU navigation performs the anchor arithmetic at
  controlled high precision; recentring admits only candidates whose exact aggregate L1 position-plus-focus error is at most `scale × 2⁻⁴⁰`, and refuses collapse of a previously distinct position and focus and never
  reconstructs a world position through a single `Number`. Ordinary Space (1b) uses the same
  representation at modest scales while its field evaluator stays binary32. The representation is
  defined before 1b implementation, so introducing 1c does not require a camera-format migration. World Z defines up. Orbit and basic flight use upright navigation without a
  dedicated roll control. The orientation control may set a full camera orientation; axis
  constraints and orientation reset remain available. Serialization preserves the orientation.
  **User decision (2026-10-21):** this representation is approved for ordinary Space as well as
  for 1c ("APPROVE").
- **Space parameters:** Requested fractal parameters C, kappa, and power remain decimal strings. Menger depth is
  a JSON integer selector, 1 or 2. Ordinary-profile preparation derives effective binary64 values
  with `Number(text)` and binary32 values with `Math.fround` of that binary64 result, preserving
  this two-stage rounding definition and reporting its bits. Conversion helpers reject non-finite
  results; underflow to subnormals or signed zero remains defined. Effective values never replace
  requested scene values. Deep-profile preparation derives the effective
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
  one camera drag, one wheel burst or one continuous controller run (§13.3) is one gesture. Cancel restores the pre-gesture scene. Commit
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
  the resulting pose, suppresses consecutive identical poses, and truncates any forward branch. For Space history, identity uses semantic camera equality: exact represented position/focus and FOV, with normalized rotations compared modulo quaternion sign within eight binary64 epsilons per component. This comparison does not define scene-file identity or cache/request keys.
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
field names its evidence source, and no device string is ever invented (**erratum, rev 4.4, refined rev 4.5:**
Chrome 151 returned empty strings; in the paired Chrome 155.0.8059.84 experiment, vendor and
architecture were observed in both launches, and device and description only with
`--enable-webgpu-developer-features`; these are configuration-specific, so the code asserts
neither universal emptiness nor universal population. Record each observed field with its source,
otherwise `unavailable`); requested and completed dimensions, iterations, tracing settings and samples;
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
allocate({name, bytes, usage, data?}) → opaque buffer handle
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
- **Backend annex.** The WebGPU specifics are §9.1 (adopted by the user, 2026-10-21).

### 9.1 WebGPU backend annex (normative; user decision, 2026-10-21: "ADOPT")
Project 0 recorded its configuration (E10, `webgpu-g5d-decision.json`, `launch-remediation.json`).
This annex, proposed in the 1b.1 plan (rev 4.1) and adopted by the user on 2026-10-21, is normative
for the WebGPU backend. Task identifiers (B00–B14) name the 1b.1 plan tasks that implement each part.
Amended by user decision, 2026-10-21 ("approve amending the adopted §9.1 annex to add allocate"):
the production `allocate` method and `maxUniformBufferBindingSize` (Allocator and Adapter bullets).

- **Adapter and device.** `navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })`
  once per acquisition attempt; `adapter.info` is read on the retained adapter before
  `requestDevice`. Each identity field (`vendor`, `architecture`, `device`, `description`) is
  recorded as observed (`{value, source: 'adapter.info'}`) or `unavailable`; nothing asserts that
  Chrome always returns empty strings. `isFallbackAdapter` is recorded; a fallback adapter is a
  software device and never satisfies a physical-GPU requirement; physical-GPU acceptance needs
  corroborating evidence (`chrome://gpu`, the gate's hardware suite) when identity fields are
  unavailable. Required features: none. Optional: `timestamp-query`. Limits recorded and checked:
  `maxBufferSize`, `maxStorageBufferBindingSize`, `maxUniformBufferBindingSize`,
  `maxTextureDimension2D`,
  `maxComputeWorkgroupsPerDimension`, `maxComputeInvocationsPerWorkgroup`, `maxBindGroups`,
  `maxStorageBuffersPerShaderStage`, `maxStorageTexturesPerShaderStage`. Adapter-supported,
  requested and granted device limits are distinct and each is recorded; allocations and
  pipeline layouts are validated against the granted limits. `requestDevice` passes no blanket
  `requiredLimits`: the WebGPU defaults suffice for the specified workloads (the largest 4K
  target texture is 126.5625 MiB, the 4K target set is ten textures rather than one buffer, and
  texture allocations are not governed by the buffer-binding limits), so a task requests only an
  increase it needs and the adapter supports, with that need stated. The binding risk is
  `maxStorageTexturesPerShaderStage` (default 4): read-only inputs use sampled-texture bindings
  (`textureLoad`) rather than storage textures. B06 owns this (rev 4.4, joint ruling with Codex
  run 20261021T073220Z-227f).
- **Epochs and loss.** Every acquisition attempt receives a fresh identity; the epoch is an
  integer advanced on each successful acquisition, supplied to requests as
  `generation.deviceEpoch` (no second editable epoch field). The epoch is zero if and only if the
  backend is unavailable or destroyed; successful acquisitions receive increasing positive
  epochs. Completed tickets carry observed completion timing; failed and interrupted tickets
  have `queueCompletedAt: null`, `elapsedMs: null` and no timestamp duration, with the error
  message (failed) or the loss reason (interrupted) as `reason`. A `device.lost.then(...)` observer is
  attached immediately after acquisition and never awaited before returning. Observed loss
  immediately makes the backend unavailable and invalidates its epoch before clients are notified
  (`onLoss({epoch, reason: 'destroyed' | 'unknown' | <reason>, message})`); late callbacks from
  retired attempts cannot replace current state; a loss observed before an acquisition is published refuses that acquisition (`device-lost`); outstanding tickets settle `interrupted`; a
  resolved queue fence after loss does not establish successful work. `Backend.destroy()` is
  terminal teardown and suppresses recovery; the test adapter destroys the underlying device
  without terminal teardown to exercise real loss recovery, and injected notifications exercise
  the same invalidation path.
- **Admission.** Every operation that submits queue work — batches, probes, readback copies,
  presentation — consumes one single-use scheduler admission lease for the current epoch; there
  are no hidden submissions inside `prepare()` (the preparation probe runs through ordinary
  admission).
- **Pipelines.** Compute pipelines for field evaluation, tracing, normals, shading, accumulation
  and display, prepared with `createComputePipelineAsync`, every required family variant for
  trace, normals and secondary field evaluation enumerated and prewarmed during preparation
  (`FIELD` is a pipeline-overridable constant; power and parameters are uniforms; no
  interaction-time compilation). One separately prepared fullscreen render pipeline presents the
  completed display texture to the canvas in its preferred unorm format with explicit scaling (a
  draft is upscaled at presentation) and **no further transfer function**: accumulation stays
  linear, `display_band` performs the sole sRGB encoding into `display`, and diagnostic legend
  colours are defined in display space and written exactly. The display texture is never copied
  directly to the canvas (`rgba8unorm` and `bgra8unorm` are not copy-compatible).
- **Targets** (per internal resolution, through the tracked allocator): `depth` r32float (4),
  `status` r32uint (4; bits 0–3 status, 4–7 reason, 8–11 subreason, 12–31 steps), `normal`
  rgba16float (8; w = availability), `sampleColor` rgba16float (8), `lightingStatus` r32uint (4;
  independent shadow and AO failure flags with reasons, simultaneous failures preserved),
  `accumulationFlags` r32uint (4; diagnostic propagation across samples),
  two ping-pong `accumulation` rgba32float (16 each; sum and count, read previous, write next),
  `display` rgba8unorm (4), `retained` rgba8unorm (4; the previous complete image, shown with the
  pending mark): 72 bytes per pixel, 597,196,800 B at 3840 × 2160 before staging, uniforms, model
  buffers and overlapping generations. Each resource is counted at its actual dimensions. (Project
  0 A.8's 405,995,520 B is a different layout and is not reused as the product figure.)
- **Pipeline descriptors.** B00 freezes the pipeline descriptor schema and binding/uniform
  conventions. B06, B08, B10 and B11 freeze their concrete pipeline IDs, slots and layouts
  alongside executable shader descriptors; B06 validates preparation with executable self-check pipelines; B08, B10 and
  B11 add their descriptors and preparation assertions as their shaders come into existence; B11
  verifies complete product prewarming before B14 enables interaction. Compute dispatch geometry is frozen ABI: every compute entry point declares `@workgroup_size(8, 8, 1)`; the backend dispatches `ceil(region.width / 8) × ceil(region.height / 8)` workgroups and injects nothing; each pass carries its region (origin, size) in its own uniform layout and bounds-checks invocations.
- **Batches.** The descriptor and ticket of B00 (`identity`, `pipelineId`, `pass`, `region`,
  `sample`, `bounds`, named `inputs`/`outputs` slots, `uniforms`); one command buffer per batch;
  uniform data snapshotted before submission; storage owned by an outstanding ticket is never
  overwritten; horizontal subdivision is the caller's (one lease per region); completion is `device.queue.onSubmittedWorkDone()`
  labelled `queue-completion` (a fence includes preceding queued work and is not isolated shader
  time); GPU timestamps are a separate measurement recorded only when granted, never a substitute
  for completion. A watchdog timeout stops admission but neither settles the fence nor releases its
  resources; loss retires the epoch; ordinary cancellation drains it.
- **Readback.** One bounded region per call, at most 256 rows; a region whose staging (`alignUp(width × bytesPerTexel, 256) × rows`) would exceed `maxBufferSize` is refused `allocation-failed` before its lease is consumed, and the caller subdivides horizontally with one lease per region;
  into a lazily allocated pool of at most two staging buffers sized
  `alignUp(width × bytesPerTexel, 256) × rows`; `mapAsync(READ)`, copy out, `unmap`; the result
  resolves after copy-out and unmap; mapping ownership survives queue completion; every readback
  carries its epoch and identity.
- **Configuration.** `configureTargets` is transactional: bytes are reserved and accounted first,
  allocation and validation errors captured (`pushErrorScope`), and the old usable target set is
  retained if replacement fails. Successful target handles are caller-owned until `release(handle)`: a replacement never releases the earlier set, so a published image can be presented while its replacement is pending; B09 releases obsolete working targets and retains its published display until the replacement is published. Failed configurations roll back their own new resources; loss and `destroy()` invalidate everything.
- **Allocator.** Every application-owned allocation passes through the tracked allocator, which
  checks `tracked + bytes ≤ 1 GiB` before resource creation. The production method
  `allocate({name, bytes, usage, data?}) → handle` creates a buffer in the current available device
  epoch. `name` is nonempty; `bytes` is a positive safe integer divisible by four; `usage` is
  `'storage'` or `'uniform'`; optional `data` is a `Uint8Array` whose byte length does not exceed
  `bytes`. Initial data is defensively copied at creation and remaining bytes are zero. WebGPU
  initializes supplied contents through `mappedAtCreation`, copies them into the mapped range, and
  unmaps before returning; this performs no application queue submission and consumes no admission
  lease. The backend derives native usage flags, including copy-source support for readback. There
  is no production host-update method; admitted shader writes to storage buffers remain permitted.
  `stage()` is a fake-only test control. `allocate` stays synchronous. Every native creation runs inside validation and out-of-memory error scopes, and a resource whose initialization throws is destroyed before the call fails. A creation error captured asynchronously marks the resource failed (`diagnostics().inventory[i].failure`). Every ticket that consumes a resource awaits that resource's creation scopes as well as its own scopes and fence, and settles `failed` with the creation message if any creation scope captured an error. Precedence: loss first (an outstanding ticket settles `interrupted` whatever its scopes report, and nothing settles while a loss is pending); then pre-queue failure (work that threw before `queue.submit` settles `failed` at once); then captured creation or submission errors (`failed` after scopes and fence); otherwise `completed` with timing observed at the fence.

  `release(handle)` marks a resource retiring; bytes leave accounting only when every ticket,
  mapping and retained-owner reference has ended. Uniform uploads, query/resolve storage, staging
  and model buffers are counted. `diagnostics()` reports `{state, epoch, tracked, peak, retiring,
  inventory}` using actual allocation sizes. Plane allocations remain separate.
- **Launch (tests).** The complete recorded Project 0 launch profile (`--enable-gpu --use-angle=vulkan
  --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan --enable-webgpu-developer-features`,
  installed Chrome, headed, §16.5); requested and effective arguments recorded in every report.

## 10. Numerics and precision

### 10.1 Representation
Space cameras use the anchored representation in §5.2 (approved for ordinary Space by the user,
2026-10-21). Anchor arithmetic uses controlled high
precision; local camera coordinates, orientation and field of view use CPU doubles. Ordinary Space
evaluates fields in binary32. Camera transport: `high = RN32(exact represented coordinate)` and `low = RN32(exact − high)`, in that order, using nearest rounding with ties to even and range checks before use; the reported bound is the absolute L1 world-space error. Zero error is reported as a null logarithmic bound with `exact: true`; otherwise the bound is its integer ceiling logarithm with `exact: false`. The `2⁻⁴⁶` relative property holds when high and low are binary32-normal; it is not an underflow guarantee. Qualified 1c profiles use the reference, perturbation and range
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
{ id, version, recurrenceVersion, initialization, escapeRule, supportedParameters,
  estimator: { category, semantics, derivationVersion } }
```
Every static model record contains the following metadata fields. Empirical validation records are stored
separately in the validation registry described by §16.2. Applicable evidence is selected by model,
evidence class, implementation hashes, profile, effective parameters, sampling conditions and
spatial domain. A model record does not itself assert validated coverage; absence of matching
evidence is reported as “no matching validation”. For analytic models `derivationVersion` is a
populated string; only the recurrence, initialization and escape metadata are null.
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
  studies. `analytic-inspection-v1` (τ = 0.1·τ(t), unchanged multiplier and caps) is such a profile. Analytic-oracle
  depth accuracy (relative 10⁻³) is claimed under it. Ordinary `surface-v1` analytic depth is qualified against a
  sampling-aware envelope that budgets the hit rule's stopping displacement of up to τ/|n·d| along the ray (plan B04 P1; user-approved
  amendment 2026-10-21, rev 4.8).
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
A supported Plane share link opens Plane with its scene; Space share links are deferred beyond
Project 1 (§19.1 Q6, user decision 2026-10-21). Project 1 does not restore the previous session on reload; reopening work is done
through discoveries, scene files and share links.

### 13.2 Space layout
Viewport; parameter panel (family, parameters, iterations, tracing, appearance); viewport indicators
(estimator category, precision badge (1b.2), pending, pause, view mode); docked instruments (1b.2); a
composition strip (1b.3). (Erratum applied by user decision, 2026-10-21: the precision badge is
1b.2, consistent with §3.) Space opens with the neutral inspection lighting (§19.1 Q2; presets
arrive in 1b.3, §13.7).

### 13.3 Navigation (1b.1)
- Orbit, pan and dolly; focus on a point (asynchronous depth readback of the picked pixel); overview;
  orientation reset; a Bryce-style orientation control with axis constraints and reset (§5.2). Navigation safety: navigation must refuse coincident results; recentre must also refuse a result that collapses a previously distinct position and focus; `dolly(0)` returns the input camera and positive factors that round onto the focus are likewise refused; externally supplied coincident cameras retain the documented no-op behavior for orbit, dolly, reset, flight, and a coincident `lookAt` target. Axis locking uses `Rz(z) Ry(y) Rx(x)`: canonical angles are extracted from the current and requested orientations, the requested locked coordinate is replaced with the current one, and the orientation is reconstructed; at gimbal lock `x = 0` and `z` is solved; labels are tilt/X, roll/Y, heading/Z; for upright cameras `x = 90° + forward elevation`, `y = 0`, and `z` is the right-vector heading, or forward azimuth minus 90° (modulo 360°); off upright these coordinates are coupled, and at `y = ±90°` X/Z are not independent physical locks. A pick whose reconstruction is unavailable (`{unavailable: true, reason: 'precision-limit'}`) is an unresolved pick: it starts no gesture and does not change the camera.
- Basic flight: look plus move and strafe, with explicit speed in camera-local units per second; world speed is that value multiplied by camera scale. Escape releases input; blur or visibility
  loss stops movement immediately. No inertia, collision avoidance or vehicle model. Estimator-scaled
  slow-down is deferred unless it proves useful, and is never collision protection.
- **Controller (gamepad) exploration (user decision, 2026-10-21: "We should support joystick for
  exploration as well.").** For supported controller layouts, Space provides controller-driven
  orbit, pan, dolly and basic flight. Continuous controller navigation follows the camera-history
  rules. Losing input eligibility or the selected controller stops movement and commits the last
  preview exactly once. Resuming requires neutral controls. Mouse and keyboard remain complete
  alternatives.
  - *Supported layouts in 1b.1:* browser Gamepad API devices reporting `mapping === "standard"`. A
    connected device with another mapping is reported as connected with an unsupported layout and
    drives nothing; its axes are never guessed. Non-standard joysticks and flight sticks are
    deferred (§17; user answer to rev 4.2 Q11, §19.1: "Xbox style"). Physical devices are unqualified until one has been exercised.
  - *Input:* the controller is polled once per workspace animation frame, before the flight tick,
    with no second loop or timer; polling continues while input is eligible even when rendering is
    idle, and elapsed time is clamped as for flight. A poll produces at most one camera preview,
    which enters ordinary scheduler admission; controllers never change render cadence. Stick dead
    zones are radial with a squared response that preserves direction; buttons act on rising edges.
    Rates, mapping and dead-zone values are plan defaults, not spec constants.
  - *History:* an orbit controller run is one camera-history entry: it begins at the first accepted
    non-neutral motion and commits after the motion controls have been observed neutral for a short interval
    (plan default 200 ms, measured from an observed neutral sample). Within flight, the flight run remains the single
    entry. Overview and orientation reset stop navigation, commit any open run, then apply one
    camera-only jump.
  - *Eligibility and ownership:* input is accepted only while the Space workspace is the current
    activation with prepared pipelines, the document is visible, the window is focused and viewport
    navigation is enabled (parameter editing and modal dialogs suspend it). After connection,
    resumption, controller replacement or ownership loss, controls must return to neutral before new
    input is accepted. The lowest eligible controller is selected and kept until it disconnects; a
    newly connected controller never takes control. Escape, stop, suspension and disconnection of
    the selected controller always stop movement. A missing Gamepad API or a denied
    `getGamepads()` makes controllers unavailable without affecting other navigation. Browsers may
    expose a controller only after it is used: the interface invites "Press a controller button to
    connect", and that interaction performs no navigation.
  - Controller selection, button state and mapping preferences are runtime input settings, never part
    of `atlas.scene`. Remapping is deferred (§17).
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
  (a `hashchange`) reports the problem without replacing its scene or either history. Space share links are deferred beyond Project 1 (§19.1 Q6, user decision 2026-10-21); Space scenes travel as scene files (1b.1) and discovery cards (1b.3).
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
| Controller disconnected or input suspended | Movement stops and the last preview commits exactly once; held controls cannot resume movement until they return to neutral; mouse and keyboard keep working (§13.3). |

## 16. Verification

### 16.1 Layers
| Layer | Execution | Required evidence |
|---|---|---|
| Scene, history, discoveries | Node | Exact strings, canonical serialization and hashes, whole-scene validation (invalid values reported, never clamped; old formats rejected), share-link and scene-file round trips, domain-scoped undo, grouped gestures, camera-history rules, discovery-record validation, source failure and timeout isolation, write cancellation before and after commit, a timeout followed by a committed result, late list results after a workspace switch, the A → open B → undo → Back/Forward case, local-store save, list, delete and storage failure |
| Scheduler and lifecycle | Node, fake backend | Stale results, A → B → A late completions, epoch races, queue depth, cancellation outcomes, priority, retiring resource accounting; resize, draft-to-settled transitions, sample identity and direct-light-to-shadowed refinement as well as scene edits (direct-light-only samples never enter the accumulator for the later shadowed/AO appearance) |
| Mathematical models | Node, `tests/reference/` | Analytic answers, recurrence identities, full four-component quaternion updates, escape bounds, singular and range cases, stagnation including coordinate collapse |
| GPU numerics | Headed installed Chrome, physical GPU | Readback against independent references with preregistered tolerances and exclusions |
| Rendering | Headed, physical GPU | Silhouettes, depth, normals and termination coverage before colour; adversarial rays; convergence studies |
| Interaction and recovery | Browser | Intermediate frames, workspace switching, pause/edit/update, blur, scripted controller input through an injected `navigator.getGamepads` (a physical controller is never a gate dependency), cancellation, device loss (destroy and injected), failed allocation, stale instruments, both export races |
| Complete workflow | Headed browser, recorded | All seven acceptance steps, reload, immutable export, reproduction |

### 16.2 Validation matrix (frozen in the plan before any GPU comparison)
All seven bulb powers; origin and polar-axis cases; full off-plane quaternion parameters; nonzero κ;
supported-domain boundaries; iteration budgets 64, 128, 256 and 512; detail approaches with
independently prepared anchors and reference-convergence checks (after Project 0 A.10). Samples,
exclusions and quantity-specific tolerances are frozen before GPU comparison. The four iteration budgets apply to point arithmetic strata; overview tracing uses budget 128 and the plan's frozen integer-pixel sampling and status-stability screen. Fractal overview depth acceptance is profile-scaled and is distinct from analytic-oracle depth accuracy. The plan preregisters which views require positive-hit coverage; a zero hit floor does not establish an empty slice. A CPU-infeasible sampling definition or coverage floor may change only through a recorded amendment before GPU comparison, followed by fresh preflight and re-freezing of the artifacts. (User-approved amendment, 2026-10-21, rev 4.6.) Nothing is validated
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
queues; tiled giant stills; parameter maps, variations and publication animation. User decisions of 2026-10-21:
touch and mobile Space navigation (Plane's mobile behaviour is preserved); Space share URLs (scene
files from 1b.1 and discovery cards from 1b.3 carry Space scenes). Also deferred: controller
navigation in Plane; controller remapping and invert options, and non-standard controller layouts
(the user's controller is Xbox style, §19.1); controller focus picking.

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

### 19.1 Answered (2026-10-20 and 2026-10-21)
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

- **Space's initial look** (rev 2 Q2; user decision, 2026-10-21): neutral inspection lighting
  (§13.2); atmospheric looks remain available as presets (1b.3, §13.7).
- **Touch/mobile Space navigation** (rev 2 Q5; user decision, 2026-10-21): desktop/laptop first —
  mouse, trackpad and keyboard; no Space touch gestures in Project 1; Plane keeps its mobile
  behaviour. The user added: "We should support joystick for exploration as well." Applied as
  controller exploration of Space in 1b.1 (§13.3), co-designed with Codex (runs
  20261021T033701Z-268a and 20261021T034408Z-2f95, READY for the standard-layout scope); Plane controller
  navigation is deferred (§17).
- **Space share URLs** (rev 2 Q6; user decision, 2026-10-21): scene files only in 1b.1 (discovery
  cards in 1b.3); Space share URLs are deferred beyond Project 1 (§13.1, §14, §17).
- **Backend annex and anchored camera** (user decisions, 2026-10-21): the §9.1 WebGPU backend annex is
  adopted as normative text, and the anchored camera (§5.2, §10.1) is approved for ordinary Space;
  the §13.2 precision-badge erratum ("(1b.2)") is applied.
- **Controller models** (rev 4.2 Q11; user decision, 2026-10-21): "Xbox style". Standard-layout
  gamepads (`mapping === "standard"`, which Xbox-style controllers report) are sufficient for 1b.1;
  non-standard joysticks and flight sticks, mapping profiles and remapping stay deferred (§17).
- **Production `allocate`** (user decision, 2026-10-21: "approve amending the adopted §9.1 annex to
  add allocate"): §9 gains `allocate({name, bytes, usage, data?}) → opaque buffer handle` and the
  §9.1 Allocator bullet specifies it (rev 4.3), so B08/B09 model and points buffers have a
  production route; proposed in the 1b.1 B00 review and agreed by Codex (run 20261021T060324Z-4e7f).

### 19.2 Open
These affect only 1b and 1c; the architecture supports either answer to each.
3. **Bridge flow:** should the bridge open the linked instruments immediately, or offer a compact
   "Compare the section" action?
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
- Project 0 records its decision: confirm or revise §2, §9 (backend annex) and §10.3. (§9: resolved by
  §9.1, adopted by the user on 2026-10-21.)
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
