# ATLAS Workbench — Architectural Charter

**Status:** draft for user approval · **Date:** 2026-10-18
**Authors:** Claude and Codex, co-designed as peers (full record: `docs/codesign/conversation-log.md`)
**Governs:** every ATLAS Workbench project spec. A project spec may narrow this charter but not
contradict it; changing the charter takes a revision approved by the user.

## 1. Problem

ATLAS is a fast, rigorously verified 2D Mandelbrot explorer, with:
- adaptive BigInt coordinates and GPU perturbation;
- sampled accuracy against an independent oracle;
- hardware-measured performance.

Its only object is a single 2D set. The goal is to evolve it into a **3D fractal and mathematical
explorer workbench** without losing what makes ATLAS distinctive: trustworthy mathematics,
reproducible results and measured claims.

## 2. Purpose and the workflow spine

ATLAS Workbench is for a curious, technically comfortable explorer who wants three things:
- to discover beautiful structures;
- to understand what produced them;
- to return to them reliably.

The experience leads with visual exploration. Mathematical transparency is built into the
architecture rather than bolted on.

Every feature must strengthen one workflow:

> **Explore → notice → inspect → vary → compare → save**

A feature that serves none of these steps is out of scope, however impressive it may be.

Rejected framings:
- **An art-first renderer.** It competes with Mandelbulber on its own ground and discards
  ATLAS's rigour.
- **A research console.** It demands estimator literacy before the user can navigate.

## 3. Architecture

### 3.1 One application, two workspaces
- **Plane:** today's ATLAS. Its navigation, effectively unbounded deep zoom, precision,
  bookmarks and exports are all preserved. It stays on WebGL 2 and remains fully useful on its own.
- **Space:** a new 3D workspace with its own numerical kernels, renderer and cameras. It hosts
  linked instruments (slice, inspector).

**Shared between them:**
- the scene contract;
- palettes;
- diagnostics;
- render requests, reports and job scheduling;
- interface components where they are genuinely common.

**Never shared:** coordinate systems, navigation controllers, numerical kernels and renderer
resources. The 2D perturbation engine and a 3D ray marcher have fundamentally different needs.

`src/app.js` is extracted incrementally, as Space actually requires it. There is no preparatory rewrite.

### 3.2 Source layout (destination)
```text
src/
  plane/    existing numerical engine, renderer, navigation (moved, behaviour unchanged)
  space/    models, rendering, cameras, instruments
  shared/   scene contracts, palettes, diagnostics, job/report scheduling
  ui/       application shell and shared interface components
```
- Space's mathematical models import no DOM or GPU code.
- Independent test references live in `tests/`, not in production modules.
- Workspace-specific controllers stay beside their workspace, so `ui/` must not become a
  second `app.js`.
- `shared/` holds genuinely shared contracts only. Plane's deep-coordinate machinery stays in `plane/`.

### 3.3 Space rendering
- **Method:** distance-estimated surface ray marching, with direct lighting, shadows, restrained
  ambient occlusion and orbit-derived colour.
- **Backend:** one production backend. It is WebGPU if Project 0 qualifies it on this
  workstation, otherwise WebGL 2. Two production 3D backends are never maintained.
- **No CPU fallback:** there is no interactive CPU path for Space. CPU implementations exist as
  independent references for tests and for inspecting single points.
- **Render generations:** each camera, geometry, estimator or quality change starts a new
  generation, and samples from different generations are never blended.
  - While moving: coherent reduced-resolution drafts on a stable canvas.
  - At rest: full-resolution geometry, then accumulated antialiasing and lighting until the
    requested quality is reached.
- **Retained image:** when the previous complete image is kept on screen, it is visibly
  marked *pending*. It is never passed off as the new view.
- **Bounded GPU work:** work is submitted in bounded batches with a shallow queue, so that
  obsolete work cannot monopolise interaction. Rejecting stale results is not the same as
  cancelling them.
- **Not in the first release:** temporal reprojection while moving (because of disocclusion
  and ghosting), path tracing, volumetric rendering and meshing.

### 3.4 Estimator honesty (invariant)
- **Declared category:** every Space model declares the category of its distance estimator,
  with its applicability domain and derivation version. The categories are:
  - **exact distance**;
  - **conservative bound**;
  - **heuristic**.
- **Default category:** a model without a derivation justifying something stronger is
  *heuristic*. Sample comparisons can validate an implementation, but they cannot prove that
  a formula is exact or conservative.
- **Validation recorded separately:** empirical validation (tested domain and results) is
  recorded apart from the category.
- **Where the category appears:**
  - in model metadata, the inspector, diagnostics and render reports;
  - as a compact indicator in the ordinary viewport.
- **Statuses kept distinct:**
  - mathematical point status: *escaped*, *bounded within budget* or *numerical failure*;
  - renderer status: *approximate hit*, *miss*, *step-budget exhausted* or *numerical failure*.
- **Unresolved is its own result:** budget exhaustion is never silently turned into a hit or a miss.
- **No fake error heatmap:** step exhaustion can be observed directly, but estimator
  over- or under-estimation needs a reference. ATLAS never shows a live "error heatmap" that
  actually displays only computational cost.
- **Small values certify nothing:** a small estimate does not by itself prove the ray is near
  a surface. Hit tolerance, iteration limit and approximate-hit status are always recorded.

### 3.5 Precision
- **Plane:** keeps its effectively unbounded coordinate depth.
- **Space:** promises **validated detail ranges**, never "infinite zoom". Space computes the
  camera and scene in double precision on the CPU and evaluates fields in `f32` on the GPU.
  Neither WGSL nor GLSL ES has `f64` in shaders. A precision indicator reports two things:
  - the tested limits;
  - the current sampling conditions, meaning the world-space pixel footprint, the iteration
    count and the tolerance.
- **Three separate problems:**
  - navigation precision;
  - field precision;
  - rendering tolerance.
  Camera-relative coordinates help the first and do not solve the second.
- **Deeper 3D** (for example compensated arithmetic, or quaternion perturbation with
  δₙ₊₁ = Qₙδₙ + δₙQₙ + δₙ²) is research. It is chosen for one family and shown to help against
  an independent reference before it becomes a product promise.

### 3.6 Reproducibility
- **Scene contents:** a scene is a versioned, self-describing experiment. It records:
  - workspace and model identity and version;
  - parameters, with Plane coordinates kept as exact decimal strings;
  - coordinate conventions;
  - the camera;
  - slice definitions;
  - iteration and tracing settings;
  - appearance;
  - the sampling seed;
  - the application version.
- **Render reports:** stored separately from the scene. They record:
  - hardware;
  - browser;
  - the quality actually completed;
  - completion status.
- **The contract:** an experiment can be reproduced. Bit-identical images across GPUs are not
  promised.
- **Exports:** an export renders an **immutable scene snapshot**, never the live interactive state.

### 3.7 Coordinate conventions (Space)
- **World space:** right-handed and **Z-up**. Units are dimensionless and match the model's
  native coordinates.
- **Quaternions:** q = a + b**i** + c**j** + d**k**, stored as `(a, b, c, d)`. The complex
  number x + y**i** embeds as `(x, y, 0, 0)`.
- **The default quaternion Julia slice** maps world `(x, y, z)` to q₀ = x + y**i** + z**j**,
  with the fourth component (k) fixed at a parameter, default 0.
  - The **invariant complex plane** is world z = 0, the horizontal "ground" plane. On it, the
    quaternion recurrence qₙ₊₁ = qₙ² + c with c = a + b**i** is exactly the complex recurrence.
  - Orbits keep all four components; iterates are never projected back into the slice.
- **Mandelbulb:** the standard spherical-coordinate form, with θ = acos(z/r) and φ = atan2(y, x),
  so the polar axis is world Z. The power-8 default and the validated power range are fixed by
  the Project 1b spec.
- **Every family spec** documents its recurrence, initialisation, bailout rule, iteration
  limit, estimator derivation and tested parameter domain. A family name alone is not a specification.

### 3.8 Dependencies
- **Default:** zero runtime dependencies unless a later spec explicitly justifies one. This
  means plain ES modules, hand-written shaders and small purpose-built maths routines. Vendored
  code counts as a dependency.
- **Development:** Playwright stays the only development dependency unless a spec justifies another.

### 3.9 Compatibility
Every existing ATLAS artefact keeps working, through explicit, non-destructive adapters that
read it as a new scene. The artefacts are:
- the `#re=…&im=…&z=…&palette=…` share URLs (old URLs open Plane);
- the `localStorage['atlas.discoveries']` bookmarks;
- `{application: 'ATLAS', version: 1, …}` JSON exports.

The adapters follow these rules:
- Decimal coordinate strings are preserved exactly.
- Old defaults are resolved according to the old format.
- Original stored data is kept until a validated new record has been saved.
- Migration can be repeated safely, and names, IDs and ordering are preserved.
- Unsupported records are reported, never deleted.

When a Plane parameter carries more digits than Space can evaluate, the requested value is
preserved and the effective Space precision is shown. It is never silently rounded.

### 3.10 Failure behaviour (applies to every project)

| Failure | Required behaviour |
|---|---|
| First-use shader compilation | Prepare pipelines asynchronously, show the preparation status and keep the current view. Slider edits update parameters, not shaders. |
| Pathological cost | Bound the work in each submission and in total. Stop future submissions. |
| Device loss during an export | Preserve the scene and job, mark the export interrupted and offer a restart. Never claim it completed. |
| Repeated device loss | Stop retrying automatically, while keeping saved scenes and Plane available. |
| Allocation failure | Release obsolete resources and offer an explicit lower-cost configuration. Never silently shrink requested outputs. |
| Invalid numerical domain | Guard singular operations and report a numerical failure as its own status. |
| Competing linked views | Prioritise the active view, throttle secondary views and pause hidden ones. |
| Parameter edits | Mark probes, measurements and thumbnails stale. |
| Import over the supported limits | Validate the whole scene before committing it. Report the problem; never silently change the mathematics. |
| Lost or stuck input | Clear movement when focus is lost. Overview, orientation reset and camera history are always one action away. |

### 3.11 Verification culture (carried over from ATLAS)
- **Layered evidence:**
  - analytic geometry against closed-form answers;
  - recurrences against independent CPU references;
  - GPU readback against the CPU, with quantity-specific tolerances fixed before measuring;
  - estimator behaviour under adversarial rays and convergence studies;
  - images compared on silhouettes, depth and normals before colour;
  - interaction tests (intermediate frames, stale results, cancellation, device loss);
  - the existing Plane suites kept green.
- **Real hardware:** acceptance runs on the physical NVIDIA GPU. Software rendering alone has
  already missed native-driver defects (see `HANDOFF.md`).
- **Performance claims:** they are measured and reported per trial, with completed GPU work,
  readback and presentation reported separately. There is no single average-FPS figure.

## 4. Roadmap

**Committed:** Project 0. Projects 1a and 1b are committed in outline, and their specs follow
the Project 0 report. **Later projects are candidates, not commitments**: placing a feature in
Project 3 does not commit anyone to building it.

| Project | Content | Status |
|---|---|---|
| **0 — Qualification** | Hardware and numerical feasibility; selects the Space backend from workstation evidence; one bounded precision experiment. | Specified separately; approved with this charter |
| **1a — Foundations** | Plane moved to `src/plane/` with behaviour unchanged. Versioned scene envelope and legacy adapters. Scene commands with undo/redo (one slider drag is one edit). Immutable render requests, generation identity, cancellation outcomes and render reports. | Committed in outline |
| **1b — Space** | Three milestones, each usable: **(1) render and recover:** calibration objects, Mandelbulb, quaternion Julia, bounded scheduling, orbit and basic flight cameras, failure handling. **(2) connect and inspect:** the Plane↔Space quaternion bridge, an independent recurrence slice, the orbit inspector, view modes, precision reporting. **(3) complete the workflow:** scoped presets, compositions, discovery cards, viewport and 4K PNG export with scene and report. | Committed in outline |
| 2 — Investigation | Mandelbox; pin-and-diff comparison; parameter maps; a **Variations** grid with immutable lineage; a findings graph; expeditions; a bounded "survey nearby" guide; an exploration journal. | Candidate |
| 3 — Publication and motion | Render queue with immutable build snapshots; tiled stills; recorded flight re-rendered offline; keyframes with per-parameter interpolation; deterministic image sequences, then video; photo-mode depth of field; path tracing. | Candidate |
| 4 — Formula authoring | A typed, bounded-iteration expression language compiled to a CPU evaluator and a shader. Capability types (recurrence, implicit field, density, distance). Automatic differentiation for derivatives, which does not certify bounds. | Candidate |
| 5 — Extensions | Deep 3D precision research; volumes and attractors; hybrids; mesh export for fabrication. | Candidate |

**Project 1 acceptance demonstration**, the shared goal of 1a and 1b, as one real investigation:
1. Pick c in Plane.
2. Open its quaternion Julia set in Space.
3. Find a feature.
4. Intersect it with the slice and confirm that the z = 0 slice matches Plane's Julia section.
5. Inspect a point's orbit.
6. Change a parameter, then undo.
7. Save a discovery card, reload, and reproduce the view.

### 4.1 Detail of the Project 1b feature set
- **View modes** (after Blender's viewport shading): shaded / normals / depth / step count /
  termination reason / orbit colour.
  - Diagnostic modes bypass fog and decorative lighting.
  - Invalid normals and unresolved depths get explicit representations.
- **Navigation:**
  - orbit, pan and dolly, focus on a point, and reset;
  - an orientation control in the style of Bryce's trackball, with axis constraints and reset;
  - **basic flight** (look plus move and strafe, with explicit speed). An optional slow-down
    scaled by the estimator is assistance, not collision protection: it is clamped and
    smoothed, and needs no per-frame synchronous readback.
  - Escape releases input, and losing focus stops movement.
  - A camera inside the occupied set gives a recoverable diagnostic, not a black frame.
  - Not included: inertia, collision avoidance or a vehicle model.
- **Scoped presets with rendered swatches** (after Bryce's labs and MagicaVoxel's scopes):
  - appearance-only and lighting-only presets, previewed on the current scene and undoable,
    never touching mathematics or camera;
  - a neutral inspection lighting preset;
  - a bounded gallery, cached and scheduled behind interaction.
- **Saved compositions** (after Bryce's memory dots and Terragen's cameras): a thumbnail strip
  of camera and focus states. This is distinct from a *discovery*, which restores a whole scene
  snapshot.
- **Discovery cards** (after No Man's Sky's scanner): a scene snapshot, the selected point,
  the inspector data together with the settings that produced it, and a note.
- **Minimal exponential depth fog:** applied in the appearance pass only, off in diagnostics,
  with an obvious off switch.
- **Pause/update while editing:** pausing stops calculation, not editing. A retained image
  shows that it reflects earlier settings.

## 5. Out of scope (cut)

Terrain sculpting; vegetation and ecosystems; full atmosphere simulation; a formula catalogue
as a goal; node graphs before the formula language; raw shader editing as the main authoring
path; game rewards and scores; executable scripts inside imported scenes; an interactive CPU 3D
renderer; native (non-browser) applications.

## 6. Decisions recorded by this charter
1. One app with two workspaces; Plane is preserved and stays on WebGL 2.
2. One production Space backend, chosen by Project 0 evidence.
3. Estimator honesty is an invariant (§3.4).
4. Space promises validated detail ranges, never infinite zoom.
5. Scenes are reproducible experiments; exports render immutable snapshots.
6. Project 1 families are Mandelbulb and quaternion Julia; Mandelbox leads Project 2.
7. Zero runtime dependencies unless a spec justifies one.
8. Legacy ATLAS artefacts are migrated non-destructively.
9. Project 1 splits into 1a (Foundations) and 1b (Space), with one shared acceptance demonstration.
10. Git is now in use. This supersedes the `HANDOFF.md` instruction not to initialise it, and
    `AGENTS.md` and `HANDOFF.md` are updated when Project 1a starts.
