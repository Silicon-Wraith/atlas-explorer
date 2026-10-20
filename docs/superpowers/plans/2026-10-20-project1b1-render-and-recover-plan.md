# Project 1b.1 — Render and Recover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Space workspace in its first usable form: explore the calibration objects, the
Mandelbulb and the quaternion Julia set on WebGPU with orbit and basic flight; recover from bad
camera positions, cancellation, allocation failure and device loss; save and reopen Space scene
JSON; show the estimator category, pending marks and distinct ray statuses — with every commit
gated beside the unchanged Plane gate, and the applicable §16.4 performance targets enforced at
this release.

**Architecture:**
- **Contracts before dependent implementations.** B00 fixes the backend and pass contracts, the
  status vocabulary, the fake backend and the frozen verification protocols. Pure models,
  numerics, camera arithmetic, scheduling and pass orchestration are Node-tested against the fake
  backend, independently of the GPU work. B01's coexistence spike and the WebGPU backend proceed
  beside the pure work. Product numerical comparisons begin only after B04's preregistered matrix
  is frozen and committed.
- **One integration checkpoint.** `src/app.js` and `index.html` change in exactly one task (B14:
  the Space workspace, the workspace switcher and the activation contract), after 1a's T12 has
  landed its composition root.
- **Verification layers (spec §16.1).** Node for scenes, models, scheduler, lifecycle and recovery;
  one headed GPU suite file (`tests/space.mjs`) exposing separately registered groups —
  coexistence, numerics, rendering, recovery, shell — each with named executable assertions, all
  `gpu: true`; a performance group in its own file; one headless check that Space degrades to
  "unavailable" while Plane keeps working. Headless WebGPU supplies no Space GPU acceptance
  evidence (Project 0 E7); non-WebGPU browser checks may gate.
- **The gate is 1a's gate.** `scripts/plane-gate.mjs`, `scripts/run-unit.mjs`, the launch guard,
  supervision, `tests/support/bounded.mjs` and the GPU lock are reused unchanged. 1b.1 appends
  suite entries to `tests/suites.manifest.json` and files to `tests/unit.manifest.json`; it changes
  no gate code.

**Tech stack:** plain ES modules, WebGPU (WGSL compute, one fullscreen render pipeline for
presentation) for Space, WebGL 2 for Plane (unchanged), the Node 20 built-in test runner,
Playwright 1.59.1 with installed Chrome headed on the physical NVIDIA GPU. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-project1-design.md`. The governing baseline is the
approved rev 3.2. This plan additionally proposes, for the user's approval, rev 4 §5.2/§10.1's
anchored camera representation for ordinary Space, the §9 backend annex (below), and the listed
release-placement clarifications; other §21 work is outside 1b.1. Governed by
`docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md` (amendments A1, A2). Project 0's
recorded decision and limitations are binding inputs: `docs/reports/project0/platform-decision.md`
(E7 headed-only; E10 WebGPU selected by the user with the mechanical outcome inconclusive; G5 as
amended by E8/E9), `precision-interpretation.md`, and
`spikes/project0/qualification/g5d-v1.json` (read-only, in the Project 0 worktree; nothing is
imported from `spikes/`).

**Builds on 1a:** `feat/project1a` is authoritative for every interface this plan consumes.
Interfaces 1a has planned but not yet landed are cited from the 1a plan and marked **(1a,
unlanded)**; this plan does not invent them (see *Dependencies on 1a*). The dependency table is
the `8eeed51` planning snapshot and is reconciled against the accepted 1a commit before B14 starts.

**Revision:** 1 — joint draft (Claude drafting; Codex co-author from Round 0: runs
20261020T211454Z-d306 and 20261020T212435Z-94a5). **Authors:** Claude and Codex as peers
(AGENTS.md/CLAUDE.md protocol). The verbatim record is
`/mnt/ml_storage/scratch/atlas-codesign/project1-log.md` ("PLAN 1b.1" entries), archived to
`docs/codesign/project1-log.md` at the milestone.

## Global Constraints

- **Scope (spec §3 release table, §8.2, §13.3):** 1b.1 only. Calibration objects (`sphere@1`,
  `box@1`, `menger@1` at depths 1 and 2), `mandelbulb@1` (powers 2–8, default 8),
  `quaternion-julia@1`; orbit, pan, dolly, focus, overview, orientation reset, the orientation
  control, basic flight; view modes shaded, normals, depth, step count, termination reason (orbit
  colour is 1b.2); the estimator-category indicator and pending mark; Space scene JSON files.
  **Not in 1b.1:** the Plane → Space bridge, instruments, inspector and precision badge (1b.2;
  §13.2's indicator list is read with §3's placement — proposed erratum); presets, compositions,
  discovery cards, Space export, and the fog, pause and update *controls* (1b.3, §13.9); deep zoom
  (1c); Space share links and touch Space navigation (§19.2 Q5/Q6, provisional defaults below).
  **Implemented without a control in 1b.1:** the scheduler's pause condition and one-snapshot
  Update semantics (used by hidden views and workspace deactivation; Node-tested in B07). **Fog:**
  `appearance.fog` validates only as `{ enabled: false }`; an enabled fog is rejected as invalid,
  never silently disabled.
- **Plane unchanged (spec §4.3):** Plane's numerical and rendering modules
  (`src/plane/{math,perturbation,reference.worker,renderer,shaders,graphics,places}.js`) do not
  change. B11 mechanically extracts palette definitions and interpolation into
  `src/shared/palettes.js`; `src/plane/palettes.js` imports and re-exports them while keeping
  Plane-owned `colorPixel`; existing exports and palette-byte and colour results stay identical
  (a test compares `paletteBytes` output byte for byte). Plane never acquires a Space device; a
  fresh start opens Plane (§13.1). Plane's render cadence is not routed through the scheduler.
  Every existing Plane browser assertion survives.
- **Boundaries (spec §4.1):** `space/models/` and `space/numerics/` import no DOM or GPU code (a
  test parses their imports). New shared modules are `scheduler.js` and `palettes.js`; B09 adds
  the explicitly listed report events and fields to `shared/render-report.js` with Plane semantics
  unchanged. `shared/` never holds GPU handles, quaternion operations, camera matrices, BigInt
  coordinates or a universal renderer. Backend-specific API access (`navigator.gpu`, `GPUDevice`,
  WGSL) is confined to `src/space/render/webgpu/`, except explicit test adapters.
- **Gate on every commit (spec §16.3; 1a rules):** after each commit run `npm run gate` with
  exactly one of `ATLAS_GPU_HANDOFF="<who, when>"` or `ATLAS_GPU_DEFERRED="<reason>"`; a pending
  commit is a candidate until a later `ATLAS_GPU_HANDOFF` run passes on that exact commit; a
  failed candidate is corrected in private history and every rewritten SHA is gated; a later
  passing commit never accepts a failed ancestor. Every browser or GPU run is wrapped in
  `flock /mnt/ml_storage/scratch/atlas-gpu.lock`. Space groups are `gpu: true` with the same
  handoff and deferral semantics as `browser-hardware` and `graphics`.
- **Headed only (Project 0 E7):** acceptance uses the complete recorded Project 0 launch
  profile — `--enable-gpu --use-angle=vulkan
  --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan --enable-webgpu-developer-features`
  — with installed Chrome, `chromiumSandbox: true`, the short Chrome TMPDIR from `bounded.mjs`,
  and the requested and effective arguments recorded in the suite report. A run without that
  profile is a separately identified portability experiment. A headless or software-device result
  never satisfies a Space numerical, rendering, performance or stability requirement (§16.5).
- **RED is behavioural and never launches a browser or GPU (1a T00):** each task with executable
  Node units writes its tests, then an interface skeleton, then runs `node scripts/run-unit.mjs
  <files> --expect-fail "<named test>"`. Browser-only wiring has browser checks written first and
  first run in GREEN under the lock; no fictitious Node RED is required for it.
- **Every wait is bounded (1a limits):** Space suites use `bounded.mjs`: launch and readiness
  15 s, ordinary operation 30 s, a numerics batch or a settled render 120 s, whole suite 10 min,
  cleanup 5 s; unit case 10 s. In the application: pipeline preparation reports progress and is
  bounded per attempt (plan default 60 s; a timeout invalidates the attempt and late pipeline
  promises cannot revive it); the scheduler watchdog is 5 s (§7.5).
- **Timer rules (Project 0 carry-forward):** any measurement harness rounds positive waits up to
  whole milliseconds, schedules against absolute targets, never accumulates relative delays, and
  records rearm counts and long-task entries, including on failure.
- **Numerics (spec §10, Project 0):** ordinary 1b uses binary32 field evaluation and the selected
  plain quaternion formulation (`project0-g5d-v1`, kernel form `g5d-plain-qsq-wrapper-prereg-v1`,
  fragment sha256 beginning `290b4cc6`), independently implemented and separately identified as
  the product kernel. G5-A failed on its tested path; T12 preserved compensation in its tested
  instrumented tracer but supplied no basis for adopting A.11 generally. Domain and range checks
  precede every dangerous operation; no post-hoc NaN or infinity detection; GPU-versus-CPU
  tolerances come from the error analysis frozen in this plan and in
  `tests/reference/space-matrix.json` (§16.2), never from tuning. The running derivative is
  range-safe (§10.4): an explicit zero state and a normalized `m·2ᵉ` state; log-domain estimate.
- **Statuses (spec §11.4, charter §3.4):** point statuses `escaped`, `not escaped within iteration
  budget`, `numerical failure`; ray statuses `approximate hit`, `miss`, `unresolved` with reasons
  `point-budget`, `estimate-unavailable`, `ray-step-budget`, `stagnation` (subreasons
  `ray-parameter`, `field-coordinate`), `numerical failure`. No minimum step, no manufactured hit,
  no interior value accepted as a hit. Legend colours (Project 0 A.5): unresolved magenta (1, 0, 1),
  numerical failure red (1, 0, 0), unavailable normal mid-grey (0.5, 0.5, 0.5). Counts come from
  status buffers, never from colours.
- **Spec constants:** τ(t) = max(10⁻⁶, 0.5·α·t), α = 2·tan(fov_y/2)/H_internal; step
  multiplier 0.9; bulb enclosing sphere radius 2; quaternion enclosing radius from the
  outward-rounded R(C) = max(2, (1 + √(1 + 4‖C‖))/2); escape |z| > 2 (bulb), ‖q‖ > R(C)
  (quaternion); default budget 128; supported quaternion box: each component of C and κ in
  [−4, 4]; bulb powers 2–8; profiles (§7.6): moving draft ½ × ½ resolution, ≤ 64 iterations, 256
  steps, direct light, 1 sample; settled full resolution, 128 iterations default, 512 steps,
  shadows, restrained AO, 8 samples; explicit limits ≤ 512 iterations, ≤ 1,024 steps, ≤ 64 AA
  samples; budgets 1 s per draft attempt, 10 s settled; scheduler ≤ 2 outstanding batches per
  device epoch, 8 ms completed-work target per batch, 5 s watchdog; 1 GiB tracked-allocation cap;
  camera `anchored-perspective-v1`, world Z up; undo and camera history 100 entries each; scene
  schema `atlas.scene` v1; conventions `atlas-space-rh-zup-abcd-v1`; §16.4 targets (B15).
- **Plan defaults (not spec constants):** default vertical FOV 60° (Project 0 A.1); preparation
  bound 60 s; lighting bounds six normal samples, one shadow ray of ≤ 64 steps, five AO samples;
  `RECENTRE_BOUND = 2⁻⁴⁰`; `MAX_PARAMETER_DIGITS = 64`; camera limits in B02; the neutral
  inspection light ℓ = normalize(1, 0.6, 1.5) with 0.15 + 0.85·max(0, n·ℓ) (Project 0 A.5).
- **Provisional product defaults (spec §19.2, for the user's confirmation):** Q2 — Space opens
  with the neutral inspection lighting (presets arrive in 1b.3); Q5 — desktop-first; Space has no
  touch gestures in 1b.1 and Plane's mobile behaviour is preserved; Q6 — scene files in 1b.1,
  discovery cards in 1b.3, Space share URLs deferred pending the user's decision.
- **Peer handoff, logging, storage, whole files, module paths:** as in the 1a plan (Codex never
  commits; `codex_bridge.py run --mode new-worktree`; every task reviewed by the other peer before
  it is complete; exchanges logged verbatim; scratch on `/mnt/ml_storage/scratch`, never `/tmp`;
  pure-module code steps give whole files; browser modules use `.js` and never live under `tests`,
  `scripts` or `artifacts`). **No branch reaches `main` without a pull request** (user rule,
  2026-10-20); 1b.1 implementation lives on `feat/project1b1` from the accepted 1a commit.

## Review Focus

The five failure modes most likely to bite a person using 1b.1 that the gate does not isolate by
itself. Each is pinned by named tests in its owning task.
1. **A plausible image that is not what it claims** — a partial tile or mixed generation shown as
   the viewport, a late completion published after an A → B → A edit, a retained image without its
   pending mark, or a draft's reduced budget reported as settled quality. *B09:* `a draft replaces
   the published image only when complete and the retained image is marked pending meanwhile`;
   `geometry A → B → A returns A's key with a new revision and the late A completion is rejected`.
   *B11:* `Shadowed samples never enter a direct-light accumulation and the first settled
   direct-light image precedes full quality`.
2. **A manufactured surface or a hidden failure** — an interior start accepted as a hit, a
   secondary-ray failure shaded as lit, a stagnating ray forced forward, an unavailable normal
   erasing its depth, or a numerical failure painted as a miss. *B10:* `Adversarial rays terminate
   with their expected status and subreason`; `Normals are available exactly where their samples
   resolve and unavailable normals keep their depth`. *B11:* `Secondary-ray failures leave a sample
   unlit, never lit`; `Diagnostic modes show the legend colours exactly for the status words`.
3. **Recovery that loses the investigation** — a device loss that drops the scene or a history,
   an allocation failure that quietly lowers the request, repeated loss looping forever, or a
   cancellation reported as preemption. *B13:* `recovery never modifies the scene or either
   history`; `allocation failure releases obsolete generations before offering a lower-cost choice
   and never changes the request`; `a second loss within the window stops automatic recovery and
   leaves retry explicit`. *B07:* `cancel reports none, drained or interrupted truthfully`.
4. **Input that outlives its owner** — flight that keeps moving after blur or a workspace switch,
   a captured drag that survives deactivation, a stale focus pick that moves the camera, or a
   hidden workspace that keeps rendering. *B12:* `a flight run commits on escape, blur and
   visibility loss with one entry and zero velocity afterwards`; `a focus whose pick is stale or
   unresolved starts no gesture and leaves the camera where it was`. *B14:* `deactivate closes
   admission, invalidates picks, settles navigation and releases capture without touching the
   scene`; `Switching during a Plane export does not interrupt the export`.
5. **A number presented with more authority than it has** — an effective binary32 value shown as
   the requested one, a validation record matched outside its coverage, Project 0's results
   presented as product validation, or an inconclusive matrix cell counted as passed. *B02:*
   `effective binary32 values carry their bit patterns beside the requested strings`; `a validation
   lookup matches only inside tested coverage and infers nothing`. *B08:* `Validation records are
   registered only for passed cells`. *B04:* `every stratum meets its floor or is marked
   inconclusive`.

---

## Task overview

| Task | Deliverable | Owner | Depends on | Wave |
|---|---|---|---|---|
| B00 | Backend and pass contracts, status vocabulary, fake backend and clock, frozen verification protocols | Codex | 1a T00, T03, T04, T06 | 0 |
| B01 | **Spike (recorded):** WebGL 2 + WebGPU coexistence, adapter identity, representative pipeline preparation; the headed `space` suite is born | Claude | B00; GPU handed over | 1 |
| B02 | Space scenes: model codecs, requested/effective parameters, outward-safe bounds, supported domains and validation registry | Codex | B00, 1a T03 | 1 |
| B03 | Production CPU evaluators, range-safe derivative, model records, camera classification | Claude | B00, B02 | 1 |
| B04 | Independent references; the frozen point/ray/detail matrix, tolerances, exclusions, convergence rules, quaternion usability experiment | Codex | B00 | 1 |
| B05 | Anchored camera arithmetic, recentring bound, perspective, orbit/pan/dolly/flight mathematics | Codex | B02 | 2 |
| B06 | WebGPU backend: acquisition, preparation, tracked allocation and retirement, admission-leased submission, readback, presentation, epochs | Claude | B00, B01 | 2 |
| B07 | The shared scheduler: admission, coalescing, priorities, pause and one-snapshot update, completed-work adaptation, budgets, watchdog | Codex | B00 | 2 |
| B08 | WGSL field kernels validated against B04's frozen references; validation records | Claude | B03, B04, B06 | 3 |
| B09 | Pass orchestration, profiles, keys and revisions, compatible accumulation, complete-image publication, Space reports | Codex | B00, B02, B07 | 3 |
| B10 | Primary tracing, normals and pick data; geometric validation (analytic rays, adversarial rays, convergence) before decorative shading | Claude | B04, B08, B09 | 4 |
| B11 | Lighting, bounded shadows and AO, diagnostic display, seeded jitter, linear accumulation, display mapping; shared palettes | Claude | B09, B10 | 5 |
| B12 | Orbit, pan, dolly, orientation control, flight, Space-owned gestures, stale-safe focus, camera-exterior status | Codex | B03, B05, B09, 1a T04 | 4 |
| B13 | Recovery orchestration: cancellation, failed allocation, stalled work, loss and repeated loss, preserving the investigation | Codex | B06 (contract), B07, B09 | 4 |
| B14 | **Checkpoint:** the Space workspace, the workspace switcher, the activation contract, panel, indicators, diagnostics, scene files | Claude | B10–B13; **1a T12 merged** | 6 |
| B15 | Headed interaction and recovery acceptance, frozen performance acceptance, the recorded investigation, the commit audit, handoff | Codex | B14; **1a T13** | 7 |

Each task has one implementer and the other peer's read-only review; shared ownership is not used.
Unit-test counts are given per task as *new* tests (the 1a baseline is still moving); the merger
records the running total in the ledger.

## Dependencies on 1a

The `8eeed51` planning snapshot; reconciled against the accepted 1a commit before B14 starts.

| 1a task | State | What 1b.1 consumes, and where |
|---|---|---|
| T00 | merged | `scripts/run-unit.mjs`, `scripts/plane-gate.mjs`, `tests/support/{bounded,no-launch,entry-guard}.mjs`, the suite manifest schema (`id`, `gpu`, `benchmark`, `command`, `report`, `evidence`, `requiredPasses`), `CHROME_TMPDIR`, `chromeLaunchEnv` — B00, B01, B15; every test task reuses its supports |
| T03 | merged (Amendment A) | `createSceneCodec({modelCodecs, maxSceneBytes})`, `SceneError`, `canonicalJson`, `fnv1a64`, `deepFreeze`, `requireObject`, `isPlainObject`, `MODEL_FIELDS`; the model codec shape `{workspace, id, version, validateModel}`; the configured size allowance — B02, B14 |
| T04 | merged (Amendment B) | `createHistory({initialScene, codec, undoLimit, cameraLimit, onListenerError})` with `begin/update/commit/cancel/apply/undo/redo/back/forward/snapshot/subscribe`, `reduceCommand`, `COMMAND_TYPES` — B12, B14 |
| T06 | merged (Amendment C) | `createRenderRequest`, `isPublishable`, `RENDER_OUTCOMES`, `RUNTIME_ID`, `createReportBuilder(request, {implementation, environment, workspaceFields, clock})`, `observed`, `UNAVAILABLE`, `INAPPLICABLE` — B07, B09, B13 |
| T09 | merged (Amendment D) | B14 preserves the discovery controller and workspace filtering; no Space cards are added |
| **T05** | in flight | **(1a, unlanded)** `src/plane/gestures.js` (`createGestureArbiter`, `DIRECT_KINDS`) — B14 preserves Plane gesture behaviour; B12 uses its own Space adapter and consumes no Plane kinds |
| **T07, T08** | in flight / not started | **(1a, unlanded)** `startExport`, the export lease, `atlas.lastReport`, the adapter cadence — B14 preserves Plane export leases, outcomes and rendering cadence (these already serve Plane in 1a; Space equivalents remain deferred) |
| **T10, T09b, T11** | in flight | transitive through T12 — B14 preserves persistence, reconciliation and the Discoveries control |
| **T12** | not started | **(1a, unlanded)** `createShell(root) → {$, toast, showDialog}`, `createPlaneWorkspace({shell, discoveries, sourceId?}) → {inspection, destroy()}`, `bindPlaneNavigation(...) → {reset()}`, `createNotifier`, `installDialogs`, `src/app.js` as composition root — **hard dependency for B14**; `activate()`/`deactivate()` are **new B14 methods**, not promised T12 exports |
| **T13** | not started | **(1a, unlanded)** `scripts/audit-gates.mjs`, `scripts/gate/ledger.mjs` (`auditLedger`, `judgeRecord`, `requiredIdsFromManifest`) — B15 |

## WebGPU backend annex (spec §9; proposed spec amendment §9.1, for the user's approval)

Spec §9 defers the WebGPU specifics to an annex written after Project 0 records its configuration;
that record exists (E10, `webgpu-g5d-decision.json`, `launch-remediation.json`). This annex binds
B00, B06, B08, B10 and B11, and is proposed for adoption into the spec by reference.

- **Adapter and device.** `navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })`
  once per acquisition attempt; `adapter.info` is read on the retained adapter before
  `requestDevice`. Each identity field (`vendor`, `architecture`, `device`, `description`) is
  recorded as observed (`{value, source: 'adapter.info'}`) or `unavailable`; nothing asserts that
  Chrome always returns empty strings. `isFallbackAdapter` is recorded; a fallback adapter is a
  software device and never satisfies a physical-GPU requirement; physical-GPU acceptance needs
  corroborating evidence (`chrome://gpu`, the gate's hardware suite) when identity fields are
  unavailable. Required features: none. Optional: `timestamp-query`. Limits recorded and checked:
  `maxBufferSize`, `maxStorageBufferBindingSize`, `maxTextureDimension2D`,
  `maxComputeWorkgroupsPerDimension`, `maxComputeInvocationsPerWorkgroup`, `maxBindGroups`,
  `maxStorageBuffersPerShaderStage`.
- **Epochs and loss.** Every acquisition attempt receives a fresh identity; the epoch is an
  integer advanced on each successful acquisition, supplied to requests as
  `generation.deviceEpoch` (no second editable epoch field). A `device.lost.then(...)` observer is
  attached immediately after acquisition and never awaited before returning. Observed loss
  immediately makes the backend unavailable and invalidates its epoch before clients are notified
  (`onLoss({epoch, reason: 'destroyed' | 'unknown' | <reason>, message})`); late callbacks from
  retired attempts cannot replace current state; outstanding tickets settle `interrupted`; a
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
  completed display texture to the canvas in its preferred format with explicit scaling (a draft is
  upscaled at presentation) and sRGB encoding; the display texture is never copied directly to the
  canvas (`rgba8unorm` and `bgra8unorm` are not copy-compatible).
- **Targets** (per internal resolution, through the tracked allocator): `depth` r32float (4),
  `status` r32uint (4; bits 0–3 status, 4–7 reason, 8–11 subreason, 12–31 steps), `normal`
  rgba16float (8; w = availability), `sampleColor` rgba16float (8), `lightingStatus` r32uint (4;
  secondary-ray failures), `accumulationFlags` r32uint (4; diagnostic propagation across samples),
  two ping-pong `accumulation` rgba32float (16 each; sum and count, read previous, write next),
  `display` rgba8unorm (4), `retained` rgba8unorm (4; the previous complete image, shown with the
  pending mark): 72 bytes per pixel, 597,196,800 B at 3840 × 2160 before staging, uniforms, model
  buffers and overlapping generations. Each resource is counted at its actual dimensions. (Project
  0 A.8's 405,995,520 B is a different layout and is not reused as the product figure.)
- **Batches.** The descriptor and ticket of B00 (`identity`, `pipelineId`, `pass`, `region`,
  `sample`, `bounds`, named `inputs`/`outputs` slots, `uniforms`); one command buffer per batch;
  uniform data snapshotted before submission; storage owned by an outstanding ticket is never
  overwritten; horizontal subdivision allowed; completion is `device.queue.onSubmittedWorkDone()`
  labelled `queue-completion` (a fence includes preceding queued work and is not isolated shader
  time); GPU timestamps are a separate measurement recorded only when granted, never a substitute
  for completion. A watchdog timeout stops admission but neither settles the fence nor releases its
  resources; loss retires the epoch; ordinary cancellation drains it.
- **Readback.** One bounded region per call, at most 256 rows, horizontally split if required,
  into a lazily allocated pool of at most two staging buffers sized
  `alignUp(width × bytesPerTexel, 256) × rows`; `mapAsync(READ)`, copy out, `unmap`; the result
  resolves after copy-out and unmap; mapping ownership survives queue completion; every readback
  carries its epoch and identity.
- **Configuration.** `configureTargets` is transactional: bytes are reserved and accounted first,
  allocation and validation errors captured (`pushErrorScope`), and the old usable target set is
  retained if replacement fails.
- **Allocator.** `allocate` checks `tracked + bytes ≤ 1 GiB` before creating a resource;
  `release` marks a resource retiring, and bytes leave the total only when every ticket, mapping
  and retained-owner reference has ended; uniform uploads, query and resolve storage, staging and
  model buffers are counted; `diagnostics()` reports `{state, epoch, tracked, peak, retiring,
  inventory}`. Plane's WebGL allocations are reported separately and never summed in.
- **Launch (tests).** The complete Project 0 profile (Global Constraints); requested and effective
  arguments recorded in every report.

## Precision carry-forward (binding)

Project 0 records are historical evidence bound to their original implementation, profile, inputs
and limitations; they do not constitute product validation. The power-8 10⁻⁴/10⁻⁵ observations at
the frozen anchor belong in historical context, not in the product's applicable tested-coverage
record, and are never a navigation clamp. Product validation records identify the product kernel
and profile and B04's matrix results, including eligible counts, exclusions, inconclusive strata
and unsupported claims. Project 0's amended G5 validated sampled off-plane recurrence behaviour
for escape indices 0–11 and bounded orbits through 128 updates; it did not validate off-plane
rendering, long-escape behaviour generally (E9: no validated long-escape band at f32), or any
independently implemented product kernel. Every 1b.1 validation record carries these limitations
verbatim in `limitations`.

## Frozen verification protocols (B00 deliverable; changed only by a recorded plan amendment)

**P1 — The §16.2 matrix** (`tests/reference/space-matrix.json`, generated deterministically by
`tests/reference/matrix.mjs` and committed in B04 before any GPU comparison). Budgets 64, 128,
256 and 512 throughout the point matrix; bulb powers 2–8.

| Stratum | Frozen candidates | Floor / required assertions |
|---|---:|---|
| Bulb origin, per power × budget | 1 | 1/1 semantic case (zero power map; derivative zero state) |
| Bulb polar axis `(0, 0, ±2ʲ)`, j = −8…3, per power × budget | 24 | 24/24 semantic cases (φ = 0) |
| Bulb generic: cell centres of an 8³ grid over [−1.2, 1.2]³, per power × budget | 512 | ≥ 410 continuous-comparison eligible |
| Quaternion generic: C ∈ {(−.2,.8,0,0), (0,0,0,0), (2,0,0,0), (−.2,.8,.15,−.1), (.25,−.5,.5,−.25), (−.4,.2,−.3,.6)} × κ ∈ {0, ±0.5, ±2, ±4} × budget; an 8 × 8 × 4 cell-centre grid over [−1.5, 1.5]³ | 256 | ≥ 205 eligible; additionally ≥ 64 eligible non-initial-escape cases when \|κ\| ≤ 0.5. **κ = ±4 cells are empty-slice cells** (‖C‖ ≤ 8 ⇒ R(C) ≤ (1 + √33)/2 ≈ 3.3723 < 4): they require empty-slice, miss and initialization-escape assertions, not coverage minimums |
| Quaternion supported-boundary: the 16 corners of [−4, 4]⁴ plus its 8 face centres × 7 κ values {0, ±0.5, ±2, ±4} × 8 starts (origin, the six ±0.25 axis points, (0.25, −0.5, 0.75)) × 4 budgets | 5,376 | every admission, bound and semantic assertion; singular cases never excluded; exact requested-decimal just-outside-range rejection tests beside them |
| 32 named adversarial point cases | 32 | 32/32: zero sensitivity, derivative range (update 44), initialization escape, strict and equal empty-slice bounds, analytic interior/boundary starts, invalid inputs, both stagnation reasons |
| Sphere / rotated box reference rays (Project 0 A.4, re-expressed independently) | 625 / 651 | ≥ 500 / 521 eligible, each with ≥ 64 positive-depth hits |
| Menger depth 1 / 2 reference rays (41 × 41, oblique direction) | 1,681 each | ≥ 1,345 eligible with ≥ 64 positive-depth hits |
| Fractal overview rendering: 1,024 rays per power and per quaternion (C, κ) cell, budget 128 | 1,024 | ≥ 820 reference-eligible; hit-count requirements only for preregistered surface-bearing views |
| Detail approaches: two independently prepared anchors per bulb power, two for the default quaternion and two for C = (−.2,.8,.15,−.1), κ = 0.5; distances 10⁻¹…10⁻⁸; the central 32 × 32 rays of a 1280 × 720 frame; budget 128; 512 steps | 1,024 per anchor and distance | ≥ 512 reference-eligible and ≥ 128 positive-depth hits for a depth claim; the ladder measures where agreement fails — "threshold exceeded" is evidence, not a pass; insufficient coverage is `inconclusive` |

Totals before adversarial cases: 15,036 bulb, 43,008 generic quaternion, 5,376 boundary
quaternion points. Compared quantities and tolerances (quantity-specific, frozen): status and
escape index exact; ln R relative 10⁻⁴; log₂ DE absolute 2⁻¹⁰ (the estimate is compared in the log
domain; an unavailable estimate must be unavailable on both sides); analytic ray depth relative
10⁻³ with floor 10⁻⁶; convergence-ladder rows use Project 0 A.10's criteria (status disagreement
≤ 5 % of eligible; large depth errors > 1 % ≤ 5 % of eligible hits), with requested-input and
effective-input comparisons recorded separately. Sensitivity screen: Project 0 A.3's rule (a case
whose f32 input perturbation changes status or index is excluded and counted) applies to generic
strata only; semantic and adversarial cases are mandatory. Anchor selection: the CPU reference
marches each anchor's central ray at 256 iterations, k = 0.5, tolerance 10⁻¹³, up to 4,096 steps,
repeated at 10⁻¹⁵ as the convergence check (Project 0 A.6's method); the generator freezes the
algorithm, B04's commit freezes the values. Minimum eligibility is per stratum, never pooled. A
stratum below its floor is `inconclusive` and requires an explicit preregistration revision before
GPU comparison; it never silently weakens the floor. CPU-only preflight in B04 must substantiate
the floors before the file is frozen.

**P2 — Geometric validation** (B10): analytic rays — status exact and depth within the P1
tolerance against the slab/sphere oracle; convergence ladder — P1's criteria; adversarial rays —
expected status and subreason exactly; normals — on the sphere, within 10⁻³ rad of the exact
gradient on ≥ 99 % of hits, availability exactly where the six samples resolve; silhouette — the
sphere's hit mask equals the analytic disc except within one pixel of the edge; the quaternion
usability experiment — the default view's termination distribution within ±5 percentage points
per class of B04's binary64 prediction (160 × 90 rays, 128 iterations, 512 steps).

**P3 — Performance workload** (B15): 1280 × 720; scenes: the bulb overview (power 8, 128
iterations), the quaternion default view, `menger` depth 2; motion: a 30 s orbit at 0.5 rad/s
(draft rate and intervals), a burst of 400 camera requests at 60 ms spacing (interaction
latency), a parameter edit every 250 ms for 10 s (stress replacement); three trials per scene,
cold then warm; timing boundaries: request creation → first complete publication, with completed
work, publication and readback reported separately; coverage checks against B04's prediction;
visible-output verification (the display buffer changes between publications); harness-invalidity
rule: a request issued more than 4 ms late invalidates the trial, which is reported as invalid,
never as passed or failed; Project 0 timer rules; no single average-FPS figure. Targets: ≥ 30
completed drafts/s with consecutive-interval p95 ≤ 50 ms; interaction p95 ≤ 100 ms; stress
replacement ≤ 250 ms; no application main-thread task over 50 ms; first settled full-resolution
geometry, normals and direct-light image ≤ 2 s from the settled request, with full quality
reported separately.

---
### Task B00: Contracts, the fake backend and the frozen protocols (spec §7.1–7.5, §9, §11.4, §16)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** 1a T00, T03, T04, T06 (landed).

**Files:**
- Create: `src/space/render/status.js`, `src/space/render/backend.js`,
  `tests/support/fake-backend.mjs`, `tests/support/fake-clock.mjs`
- Modify: `tests/unit.manifest.json` (the merger appends)
- Test: `tests/unit/space-contract.test.js`, `tests/unit/fake-backend.test.js`

**Interfaces:**
- Produces (`status.js`): `POINT_STATUS = {escaped: 0, notEscaped: 1, numericalFailure: 2}`,
  `RAY_STATUS = {hit: 0, miss: 1, unresolved: 2, numericalFailure: 3}`, `UNRESOLVED_REASON =
  {none: 0, pointBudget: 1, estimateUnavailable: 2, rayStepBudget: 3, stagnation: 4}`,
  `STAGNATION = {none: 0, rayParameter: 1, fieldCoordinate: 2}`, `NORMAL_STATUS = {available: 0,
  unavailable: 1}`, `LIGHTING_STATUS = {lit: 0, shadowFailed: 1, aoFailed: 2}`,
  `ESTIMATOR_CATEGORIES = ['exact-distance', 'heuristic']`, `packStatus({status, reason,
  subreason, steps}) → u32` (bits 0–3, 4–7, 8–11, 12–31), `unpackStatus(u32)`, `LEGEND =
  {unresolved: [1, 0, 1], numericalFailure: [1, 0, 0], unavailableNormal: [0.5, 0.5, 0.5]}`,
  `STATUS_LABELS` (the §11.4 names verbatim), `wgslConstants() → string` (the same enums as WGSL
  `const` declarations, so kernels and JavaScript share one source).
- Produces (`backend.js`): `PASSES = ['probe', 'trace', 'normals', 'shade', 'accumulate',
  'display']`, `TARGET_LAYOUT_V1` (the annex table: name → `{format, bytesPerTexel, count}`),
  `TRACKED_ALLOCATION_CAP = 2 ** 30`, `LIGHTING_BOUNDS_DEFAULT = {normalFieldSamples: 6,
  shadowRays: 1, shadowSteps: 64, aoSamples: 5}`, `createBatch({identity: {requestId, jobId,
  viewId, generation}, pipelineId, pass, region: {x, y, width, height}, sample: {sequence, seed,
  index}, bounds: {pixels, raySteps, iterations, normalFieldSamples, shadowRays, shadowSteps,
  aoSamples}, inputs: {slot: handle}, outputs: {slot: handle}, uniforms}) → frozen Batch`
  (validates every field; `pixels === width × height`; bounds within the spec limits),
  `createPickRequest({identity, pixel, dimensions, sampleIndex}) → frozen`, `createAdmission({
  epoch, jobId}) → lease` (single-use: `consume()` returns true once), `BACKEND_METHODS =
  ['acquire', 'prepare', 'configureTargets', 'submitBatch', 'readback', 'present', 'release',
  'onLoss', 'currentEpoch', 'diagnostics', 'destroy']`, `assertBackend(impl)`, `BackendError
  {code: 'allocation-failed' | 'device-lost' | 'preparation-failed' | 'invalid-descriptor' |
  'stale-epoch' | 'no-admission' | 'unavailable'}`. Signatures (the annex): `acquire() →
  Promise<{epoch, identity, limits, features}>`; `prepare({epoch, pipelineSet, onProgress}) →
  Promise<{epoch, pipelineSetId}>`; `configureTargets({epoch, layoutId, internalSize, outputSize})
  → Promise<TargetSet>` (opaque handles plus logical descriptions); `submitBatch(batch, {admission})
  → Ticket`; `readback({identity, source, region, fields}, {admission}) → ReadbackTicket`;
  `present({identity, display}, {admission}) → Ticket`; `release(handle)`; `onLoss(callback) →
  unsubscribe`; `currentEpoch() → integer`; `diagnostics() → {state, epoch, tracked, peak,
  retiring, inventory}`; `destroy()`. `Ticket = {id, identity, submittedAt, done: Promise<{outcome:
  'completed' | 'interrupted' | 'failed', reason, queueCompletedAt, timing: {method:
  'queue-completion', elapsedMs, timestampMs?}}>}`; `ReadbackTicket` adds `result:
  Promise<{identity, region, fields, data}>`.
- Produces (`fake-backend.mjs`): `createFakeBackend({clock, cap = TRACKED_ALLOCATION_CAP,
  limits, failPrepareAt = null}) → backend` implementing every method deterministically:
  `prepare` resolves on `backend.finishPrepare()` (or rejects on `backend.failPrepare(stage)`);
  tickets settle on `backend.complete(ticket | 'next' | 'oldest' | 'newest', {gpuMs})` or
  `backend.fail(ticket, error)`; `backend.lose({reason})` fires `onLoss`, settles every
  outstanding ticket `interrupted`, and the next `acquire()` advances the epoch; `readback` returns
  bytes staged with `backend.stage(handle, bytes)`; every submitting method throws
  `BackendError('no-admission')` without a consumable lease; `allocate` enforces the cap and
  records `{tracked, peak, retiring, inventory}`; `backend.log` records every call in order;
  `backend.destroyDevice()` is the test adapter for real-loss semantics without terminal teardown.
- Produces (`fake-clock.mjs`): `createFakeClock(start = 0) → {now(), advance(ms), schedule(fn,
  ms) → id, clear(id), runDue()}`.

**Design assertions:** the annex (admission leases, identity, named slots, ticket shape, loss
semantics); §7.1 frozen requests; §7.3 outcomes; §11.4 status vocabulary verbatim; §4.1 (nothing
here is in `shared/`). The fake backend is the only backend Node tests use. The frozen protocols
P1–P3 become binding at this task's commit.

- [ ] **Step 1: Write the failing tests.** `tests/unit/space-contract.test.js`: `status words
  pack and unpack every combination losslessly` (exhaustive over the enums with steps 0, 1 and
  2²⁰ − 1); `a batch rejects an unknown pass, a region whose pixels disagree with its bounds, and
  bounds above the spec limits`; `an admission lease is consumed exactly once`; `assertBackend
  rejects an implementation missing release or onLoss`; `wgslConstants emits one const per enum
  member`. `tests/unit/fake-backend.test.js`: `allocation beyond the cap fails before any resource
  exists and leaves accounting unchanged`; `released bytes stay tracked while a ticket references
  the resource and leave when it settles`; `a loss settles every outstanding ticket interrupted and
  a new acquisition advances the epoch`; `submission without a lease is refused`; `completion
  order is under the test's control`.
- [ ] **Step 2: Skeleton and RED** — every export with `notImplemented` bodies; `node
  scripts/run-unit.mjs tests/unit/space-contract.test.js tests/unit/fake-backend.test.js
  --expect-fail "status words pack and unpack every combination losslessly"`. Expected: `RED confirmed`.
- [ ] **Step 3: Implement** (pure; frozen descriptors via `deepFreeze` from 1a `scene.js`).
- [ ] **Step 4: GREEN** — the two files, then `npm test`. Expected: all pass; no skip or todo.
- [ ] **Step 5: Commit** — `"Add the Space backend contract, status vocabulary and fake backend (1b.1 B00)"`, then the gate.

**Expected outputs:** 10 new unit tests; no browser or GPU work.

---

### Task B01: Spike — WebGL 2 and WebGPU in one page, identity, preparation (spec §18, §15, §7.4)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B00; the GPU handed over.

**Files:**
- Create: `src/space/render/webgpu/device.js`, `tests/space.mjs`,
  `docs/reports/project1b/2026-10-21-coexistence-spike.md` (generated from the suite report)
- Modify: `tests/suites.manifest.json` (append `space-coexistence`: `gpu: true`, command
  `tests/space.mjs --group coexistence`, report `artifacts/space-coexistence-report.json`,
  evidence `browser`, its `requiredPasses`), `package.json` (`test:space`)

**Interfaces:**
- Consumes: `bounded.mjs`, `CHROME_TMPDIR`, `chromeLaunchEnv`, the manifest schema (1a T00);
  `observed`, `UNAVAILABLE` (1a T06).
- Produces (`device.js`): `acquireDevice({powerPreference = 'high-performance',
  optionalFeatures = ['timestamp-query'], onLost}) → Promise<{device, adapter, attemptId,
  identity, isFallbackAdapter, features, limits}>` (the annex: `adapter.info` read on the retained
  adapter; `device.lost.then(onLost)` attached before returning; `attemptId` fresh per call);
  `DeviceError {code: 'no-webgpu' | 'no-adapter' | 'device-refused'}`.
- Produces (`tests/space.mjs`): the headed suite entry point: `--group <name>` selects a
  registered group (`coexistence` in B01; later tasks add `numerics`, `rendering`, `recovery`,
  `shell`); each group launches installed Chrome with the complete Project 0 profile, serves the
  built application, records `{name, details}` passes to its own report file with the requested
  and effective launch arguments and the `chrome://gpu` identity, and is bounded by
  `installSuiteDeadline`. B01's `requiredPasses`: `WebGL 2 and WebGPU contexts coexist in one
  page`; `Adapter identity reports observed or unavailable fields truthfully`; `A representative
  pipeline set prepares within the bound with progress events`.

**Design assertions:** spec §18 (coexistence verified early); §7.4 (no device string invented);
§15 (first-use compilation visible). E7: headed only. Preparation measured here is
representative; B06 repeats it with the complete pipeline set.

- [ ] **Step 1: Write the group's checks** — open the application; assert Plane renders
  (`document.body.dataset.ready === 'true'`, the WebGL canvas has a live context); in page,
  `import('/src/space/render/webgpu/device.js')`, `acquireDevice()`, assert `attemptId` is set and
  a second Plane wheel step still reaches full resolution (`atlas.whenIdle()`); assert each
  identity field is `unavailable` or `{value, source: 'adapter.info'}` and record them; prepare a
  representative set with `createComputePipelineAsync` (a 512-step × 128-iteration trace loop of
  the power-8 bulb kernel written inline for the spike, a normals pass, a display pass), record
  wall time per stage, assert at least three progress events and completion within 60 s; generate
  the spike document with `node tests/space.mjs --group coexistence --write-spike`.
- [ ] **Step 2: GREEN under the GPU lock** — `flock /mnt/ml_storage/scratch/atlas-gpu.lock npm run test:space -- --group coexistence`. Expected: three `PASS` lines and the report.
- [ ] **Step 3: Commit** — `"Add the headed Space suite and record the WebGL 2 + WebGPU coexistence spike (1b.1 B01)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** the spike document (both contexts live; per-stage preparation times;
identity fields as observed; whether `timestamp-query` was granted). A failure here blocks B06
onward and goes to the user with the evidence.

---

### Task B02: Space scenes — model codecs, effective parameters, domains (spec §5, §10.1, §11, §14)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B00; 1a T03 (Amendment A).

**Files:**
- Create: `src/space/scene-adapter.js`, `src/space/numerics/parameters.js`,
  `src/space/numerics/validation-domains.js`
- Modify: `tests/unit.manifest.json` (merger appends)
- Test: `tests/unit/space-scene.test.js`, `tests/unit/space-parameters.test.js`

**Interfaces:**
- Consumes: `createSceneCodec({modelCodecs, maxSceneBytes})`, `SceneError`, `requireObject`,
  `isPlainObject`, `canonicalJson`, `APPLICATION_VERSION`, `DEFAULT_MAX_SCENE_BYTES` (1a T03).
- Produces (`parameters.js`): `MAX_PARAMETER_DIGITS = 64`, `parseDecimal(text, path) → {sign,
  digits, exponent}` (accepts only `-?\d+(\.\d+)?([eE][-+]?\d+)?` with ≤ 64 significant digits and
  |exponent| ≤ 400; `SceneError('invalid-value', …, path)` otherwise; never materializes beyond
  the budget), `compareDecimal(a, b) → -1 | 0 | 1` (exact), `inRange(text, lo, hi)` (exact, before
  any rounding), `toDouble(text)`, `toBinary32(text) → {requested, double, value, bits}` (`value =
  Math.fround(double)`; `bits` = 8 lowercase hex digits), `effectiveParameters(modelId,
  parameters) → {requested, effective, bits}` (`mandelbulb`: `power` an integer string 2–8;
  `quaternion-julia`: `C[4]` and `kappa` in [−4, 4]; `menger`: `depth` 1 or 2; `sphere`, `box`:
  `{}`), `escapeRadius(effectiveC: [4 × f32]) → {value, bound}` (`value = max(2, (1 + √(1 +
  4‖C‖))/2)` in binary32 arithmetic; `bound` outward-rounded by two `nextUp` steps after each
  rounding operation so `bound ≥` the real-arithmetic radius), `sliceIsEmpty(effectiveKappa, bound)
  → boolean` (strict `|κ| > bound`), `nextUp32(x)`, `nextDown32(x)`.
- Produces (`validation-domains.js`): `SUPPORTED_DOMAINS` (per model, the requested-value
  ranges above), `inSupportedDomain(modelId, parameters) → {ok, violations: [{path, reason}]}`,
  `VALIDATION_RECORD_FIELDS = ['recordId', 'modelId', 'implementationVersion', 'profile',
  'testedParameters', 'testedSamplingConditions', 'coverage', 'inconclusive', 'limitations']`,
  `createValidationRegistry() → {register(record), lookup({modelId, implementationVersion,
  profile, effective, sampling}) → record | null, list()}` (a lookup matches only when the
  effective inputs and sampling conditions fall inside the record's tested sets; nothing is
  inferred). B02 registers no records; B08 and B10 do.
- Produces (`scene-adapter.js`): `SPACE_CONVENTIONS = 'atlas-space-rh-zup-abcd-v1'`,
  `SPACE_MODELS` (`sphere@1`, `box@1`, `menger@1`, `mandelbulb@1`, `quaternion-julia@1`),
  `CAMERA_KIND = 'anchored-perspective-v1'`, `CAMERA_LIMITS = {anchorDigits: 400, exponent:
  [−1074, 1023], localMagnitude: 2 ** 20, fovDegrees: [10, 120]}`, `TRACING_PROFILE =
  'surface-v1'`, `TRACING_LIMITS = {maxIterations: [1, 512], maxSteps: [1, 1024], targetSamples:
  [1, 64]}`, `VIEW_MODES = ['shaded', 'normals', 'depth', 'steps', 'termination']`,
  `SPACE_DEFAULTS` (camera: anchor `["0", "0", "0"]`, scale `{mantissa: 1, exponent: 0}`,
  `positionLocal: [1.92, -1.44, 0.7]`, `focusLocal: [0, 0, 0]`, `orientationWxyz` looking at the
  origin with Z up, `verticalFovDegrees: 60`; iteration `{maxIterations: 128, bailoutPolicy:
  'model-default'}`; tracing `{profile: 'surface-v1', maxSteps: 512, stepMultiplier: 0.9}`;
  appearance `{material: 'neutral', palette: 'ember', lighting: 'inspection', fog: {enabled:
  false}, viewMode: 'shaded'}`; sampling `{seed: 1, sequence: 'atlas-aa-v1', targetSamples: 8}`;
  `slices: []`), `spaceModelCodecs`, `createSpaceSceneAdapter({maxSceneBytes}) → {sceneCodec,
  createSpaceScene({model, parameters?, camera?, iteration?, tracing?, appearance?, sampling?}),
  encodeSceneFile(scene), decodeSceneFile(text)}`, and the default adapter's bound methods as
  named exports plus `SPACE_INITIAL_SCENE` (the bulb default).

**Design assertions:** §5.1 (whole-scene validation; invalid or out-of-range values reported,
never clamped; unknown model versions unsupported); §5.2 (decimal-string requests; effective
binary32 values and bits derived, never written back; the camera representation — isolated behind
`CAMERA_KIND` so that a user decision against rev 4's representation revises B02's camera codec,
B05 and the serialization fixtures before implementation, nothing else); §11.2 (outward-rounded
R(C) from the effective C; strict empty-slice test); §10.5/§11 (supported ranges and tested
coverage separate). Excludes: camera arithmetic (B05), evaluators (B03), presets (1b.3).

- [ ] **Step 1: Write the failing tests** — the named tests below, as code:

````js
test('decimal strings are parsed exactly and bounded before any rounding', () => {
  assert.deepEqual(parseDecimal('-0.2', 'C[0]'), { sign: -1, digits: '2', exponent: -1 });
  for (const bad of ['1e401', '0.' + '1'.repeat(65), '0x10', '', ' 1', '1_000', 'NaN']) assert.throws(() => parseDecimal(bad, 'kappa'), e => e.code === 'invalid-value');
  assert.equal(inRange('4.0000000000000000000000001', '-4', '4'), false, 'exact on the decimal');
  assert.equal(inRange('4', '-4', '4'), true); assert.equal(compareDecimal('0.10', '0.1'), 0);
});
test('effective binary32 values carry their bit patterns beside the requested strings', () => {
  const e = toBinary32('0.8');
  assert.deepEqual(e, { requested: '0.8', double: 0.8, value: Math.fround(0.8), bits: '3f4ccccd' });
  const q = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '0' });
  assert.deepEqual(q.requested.C, ['-0.2', '0.8', '0', '0']);
  assert.deepEqual(q.effective.C, [-0.2, 0.8, 0, 0].map(Math.fround)); assert.equal(q.bits.C[1], '3f4ccccd');
});
test('R(C) is computed from the effective C with outward rounding, and the default gives 2', () => {
  const r = escapeRadius([Math.fround(-0.2), Math.fround(0.8), 0, 0]);
  assert.equal(r.value, 2); assert.ok(r.bound >= 2 && r.bound < 2.00001);
  const big = escapeRadius([4, 4, 4, 4]);                       // ‖C‖ = 8 → (1 + √33)/2 ≈ 3.3722813
  assert.ok(big.bound > big.value && big.bound < 3.3723 && big.bound > 3.3722);
  assert.equal(sliceIsEmpty(4, big.bound), true, 'κ = ±4 is always an empty slice in the supported box');
  assert.equal(sliceIsEmpty(2, 2), false, 'strict comparison'); assert.equal(sliceIsEmpty(2.5, 2), true);
});
test('a Space scene validates whole, rejects out-of-range values, and round-trips as a file', () => {
  const scene = createSpaceScene({ model: 'quaternion-julia' });
  assert.equal(scene.workspace, 'space'); assert.equal(scene.camera.kind, 'anchored-perspective-v1');
  const invalid = [
    { model: 'quaternion-julia', parameters: { C: ['5', '0', '0', '0'], kappa: '0' } },
    { model: 'quaternion-julia', parameters: { C: ['4.0000000000000000001', '0', '0', '0'], kappa: '0' } },
    { model: 'mandelbulb', parameters: { power: '9' } },
    { model: 'mandelbulb', parameters: { power: '8.0' } },
    { model: 'mandelbulb', iteration: { maxIterations: 513, bailoutPolicy: 'model-default' } },
    { model: 'menger', parameters: { depth: 3 } },
  ];
  for (const input of invalid) assert.throws(() => createSpaceScene(input), e => e.code === 'invalid-value');
  assert.throws(() => sceneCodec.validate({ ...scene, model: { id: 'mandelbulb', version: 2 } }), e => e.code === 'unsupported-model');
  const text = encodeSceneFile(scene);
  assert.ok(sceneCodec.equal(decodeSceneFile(text), scene));
  assert.equal(sceneCodec.fingerprint(decodeSceneFile(text)).sceneHash, sceneCodec.fingerprint(scene).sceneHash);
  assert.equal(createSpaceSceneAdapter({ maxSceneBytes: 64 }).sceneCodec.maxSceneBytes, 64);
});
test('the camera representation is validated: exact anchor strings, bounded scale, finite locals', () => {
  const camera = SPACE_INITIAL_SCENE.camera;
  for (const patch of [{ anchor: [0, 0, 0] }, { scale: { mantissa: 0.25, exponent: 2000 } }, { scale: { mantissa: 3, exponent: 0 } }, { positionLocal: [NaN, 0, 0] }, { positionLocal: [2 ** 21, 0, 0] }, { verticalFovDegrees: 5 }, { orientationWxyz: [1, 1, 0, 0] }])
    assert.throws(() => createSpaceScene({ model: 'sphere', camera: { ...camera, ...patch } }), e => e.code === 'invalid-value', JSON.stringify(patch));
});
test('fog validates only as disabled and the view mode is one of the five', () => {
  assert.throws(() => createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, fog: { enabled: true, density: 1 } } }), e => e.code === 'invalid-value');
  assert.throws(() => createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, viewMode: 'orbit' } }), e => e.code === 'invalid-value');
});
test('a validation lookup matches only inside tested coverage and infers nothing', () => {
  const registry = createValidationRegistry();
  registry.register({ recordId: 'bulb-p8-x', modelId: 'mandelbulb', implementationVersion: 'x', profile: 'surface-v1', testedParameters: { power: [8] }, testedSamplingConditions: { maxIterations: [64, 128], heights: [720] }, coverage: {}, inconclusive: [], limitations: [] });
  const sampling = { maxIterations: 128, height: 720 };
  assert.ok(registry.lookup({ modelId: 'mandelbulb', implementationVersion: 'x', profile: 'surface-v1', effective: { power: 8 }, sampling }));
  assert.equal(registry.lookup({ modelId: 'mandelbulb', implementationVersion: 'x', profile: 'surface-v1', effective: { power: 7 }, sampling }), null);
  assert.equal(registry.lookup({ modelId: 'mandelbulb', implementationVersion: 'y', profile: 'surface-v1', effective: { power: 8 }, sampling }), null, 'a changed implementation has no record');
  assert.equal(registry.lookup({ modelId: 'mandelbulb', implementationVersion: 'x', profile: 'surface-v1', effective: { power: 8 }, sampling: { ...sampling, maxIterations: 256 } }), null);
});
````

- [ ] **Step 2: Skeleton and RED** — `--expect-fail "decimal strings are parsed exactly and bounded before any rounding"`.
- [ ] **Step 3: Implement** (`compareDecimal` on normalized digit strings; `bits` through a
  `DataView`; each `validateModel` uses `requireObject` and reports the first violation with its
  path; the orientation must be a unit quaternion within 10⁻⁶).
- [ ] **Step 4: GREEN**, then `npm test`.
- [ ] **Step 5: Commit** — `"Add Space scenes: model codecs, effective parameters and validation domains (1b.1 B02)"`, then the gate.

**Expected outputs:** 7 new unit tests; `SPACE_INITIAL_SCENE` serializes under 4 KB; the
import-boundary test (B03) covers `space/numerics/`.

---

### Task B03: Production CPU evaluators and model records (spec §10.4, §11.1–11.4, §13.3)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B00, B02.

**Files:**
- Create: `src/space/numerics/derivative.js`, `src/space/models/registry.js`,
  `src/space/models/analytic.js`, `src/space/models/menger.js`, `src/space/models/mandelbulb.js`,
  `src/space/models/quaternion-julia.js`
- Test: `tests/unit/space-derivative.test.js`, `tests/unit/space-models.test.js`

**Interfaces:**
- Consumes: `effectiveParameters`, `escapeRadius`, `sliceIsEmpty` (B02); `POINT_STATUS`,
  `ESTIMATOR_CATEGORIES` (B00).
- Produces (`derivative.js`): `ZERO` (frozen `{zero: true}`), `fromNumber(x) → {zero: false, m,
  e}` (`0.5 ≤ m < 1`, integer `e`), `update(d, grow, {add = 1}) → D'` for `D' = grow·D + add`
  without materializing an overflowing scalar, `log2(d) → number | null` (`null` for the zero
  state), `toNumber(d) → number | Infinity`, `isZero(d)`.
- Produces (each model module): `evaluate(effective, point, {maxIterations}) → PointResult =
  {status: 'escaped' | 'not-escaped' | 'numerical-failure', index, logR | null, estimate:
  {available, log2DE | null, reason: null | 'zero-sensitivity' | 'guard' | 'not-escaped' |
  'interior' | 'not-applicable'}, orbit: {radius, components}}`; `trace(effective, point,
  {maxIterations}) → [{z, d}]` for the fractal models; calibration objects return `{status:
  'escaped', index: 0, estimate: {available: true, log2DE: log2(distance), exact: true},
  applicability: 'exterior' | 'interior' | 'boundary'}` (an interior signed value is reported,
  never accepted as a hit by callers); `menger.boxes(depth) → [{centre, half}]`.
- Produces (`registry.js`): `MODEL_RECORDS` keyed `"<id>@<version>"`: `{id, version,
  recurrenceVersion, initialization, escapeRule, supportedParameters, estimator: {category,
  semantics, derivationVersion}, enclosingVolume(effective) → {kind: 'sphere', radius} | {kind:
  'box', min, max}, evaluate, trace?}`; `getModel(id, version)`; `classifyCamera(model,
  effective, worldPosition, budget) → {status: 'exterior' | 'unresolved', detail}` (exterior iff
  the point escapes with an available estimate; §13.3).

**Design assertions:** §10.4 (zero state; normalized mantissa/exponent; D ← 8D + 1 exceeds
binary32 at update 44 while the representation does not; availability separate from
classification; log-domain estimate); §11.1 (Z-polar power map; φ = 0 on the axis; zero map at
r = 0; escape after each update at |z| > 2; radius-2 bounding sphere for every power); §11.2 (full
four-component `q² + C`; iterates never projected; escape tested at initialization and after each
update against the outward bound; zero sensitivity explicit); §11.3 (sphere signed; box and
Menger exterior-only; 20 and 400 boxes). Excludes: ray marching (B10 on the GPU; the independent
marcher lives in `tests/reference/`); any import from `tests/`.

- [ ] **Step 1: Write the failing tests** (values reproduced from the spec and verified in Node
  during planning):

````js
test('the derivative recurrence 8D + 1 overflows binary32 at update 44 but the range-safe state does not', () => {
  let d = ZERO; for (let n = 1; n <= 44; n++) d = update(d, 8);
  assert.ok(log2(d) > 128 && Number.isFinite(log2(d)));
  let scalar = 0, first = 0; for (let n = 1; n <= 60 && !first; n++) { scalar = Math.fround(8 * scalar + 1); if (!Number.isFinite(scalar)) first = n; }
  assert.equal(first, 44);
  assert.equal(log2(ZERO), null); assert.equal(toNumber(update(ZERO, 8)), 1);
});
test('the power-8 axis orbit from (0, 0, 1) gives iterates 0, 1, 2, 257 and derivatives 0, 1, 9, 9217', () => {
  const steps = mandelbulb.trace({ power: 8 }, [0, 0, 1], { maxIterations: 3 });
  assert.deepEqual(steps.map(s => s.z[2]), [1, 2, 257]); assert.deepEqual(steps.map(s => toNumber(s.d)), [1, 9, 9217]);
  assert.deepEqual(steps.map(s => [s.z[0], s.z[1]]), [[0, 0], [0, 0], [0, 0]], 'φ = 0 on the polar axis');
});
test('quaternion Julia with q0 = 0 and C = (2, 0, 0, 0) escapes at update 2 with an unavailable estimate', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['2', '0', '0', '0'], kappa: '0' });
  const result = quaternionJulia.evaluate(effective, [0, 0, 0], { maxIterations: 128 });
  assert.equal(result.status, 'escaped'); assert.equal(result.index, 2);
  assert.deepEqual(result.estimate, { available: false, log2DE: null, reason: 'zero-sensitivity' });
});
test('on the invariant plane the quaternion recurrence equals the complex recurrence exactly', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '0' });
  let a = 0.3, b = -0.1; const steps = quaternionJulia.trace(effective, [0.3, -0.1, 0], { maxIterations: 20 });
  for (const step of steps) { [a, b] = [a * a - b * b - 0.2, 2 * a * b + 0.8]; assert.deepEqual(step.q, [a, b, 0, 0]); }
});
test('a nonzero κ or an off-plane C keeps all four components', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0.15', '-0.1'], kappa: '0.5' });
  const r = quaternionJulia.evaluate(effective, [0.1, 0.2, 0.3], { maxIterations: 8 });
  assert.equal(r.orbit.components.length, 4); assert.notEqual(r.orbit.components[3], 0);
});
test('calibration objects report exact distances and interior applicability', () => {
  assert.deepEqual(analytic.sphere.evaluate({}, [0, 0, 2]).estimate, { available: true, log2DE: 0, exact: true });
  assert.equal(analytic.sphere.evaluate({}, [0, 0, 0.5]).applicability, 'interior');
  assert.equal(analytic.sphere.evaluate({}, [0, 0, 1]).applicability, 'boundary');
  assert.equal(menger.boxes(1).length, 20); assert.equal(menger.boxes(2).length, 400);
  assert.equal(menger.evaluate({ depth: 1 }, [0, 0, 0]).applicability, 'exterior', 'the centre is removed at depth 1');
  assert.equal(menger.evaluate({ depth: 1 }, [0.9, 0.9, 0.9]).applicability, 'interior');
});
test('camera classification is exterior only with an available estimate, otherwise unresolved', () => {
  const bulb = getModel('mandelbulb', 1);
  assert.equal(classifyCamera(bulb, { power: 8 }, [1.92, -1.44, 0.7], 128).status, 'exterior');
  assert.equal(classifyCamera(bulb, { power: 8 }, [0, 0, 0], 128).status, 'unresolved');
  assert.equal(classifyCamera(getModel('sphere', 1), {}, [0, 0, 0.5], 128).status, 'unresolved');
});
test('space models and numerics import no DOM or GPU code', async () => {
  // Read every file under src/space/models and src/space/numerics; assert each import specifier
  // starts with './' or '../numerics/' or equals '../../shared/scene.js' or '../render/status.js',
  // and that the sources contain neither 'document' nor 'navigator' nor 'GPU'.
});
````

- [ ] **Step 2: Skeleton and RED** — `--expect-fail "the derivative recurrence 8D + 1 overflows binary32 at update 44 but the range-safe state does not"`.
- [ ] **Step 3: Implement.** `derivative.js` keeps `m` in binary64 and renormalizes by halving
  or doubling with an integer exponent after every update. The fractal evaluators run in binary64
  (the product CPU evaluator; the GPU is binary32; B08 compares both against B04's references).
  Guards and escape tests in the spec's order.
- [ ] **Step 4: GREEN**, then `npm test`.
- [ ] **Step 5: Commit** — `"Add Space model evaluators, the range-safe derivative and model records (1b.1 B03)"`, then the gate.

**Expected outputs:** 8 new unit tests.

---

### Task B04: Independent references and the frozen validation matrix (spec §16.1–16.2; P1)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B00 (P1); the mathematical definitions of
spec §11, not B03's code.

**Files:**
- Create: `tests/reference/f32.js`, `tests/reference/complex.js`,
  `tests/reference/quaternion.js`, `tests/reference/bulb.js`, `tests/reference/analytic.js`,
  `tests/reference/menger.js`, `tests/reference/camera.js`, `tests/reference/trace.js`,
  `tests/reference/anchors.mjs`, `tests/reference/matrix.mjs` (generator),
  `tests/reference/space-matrix.json` (generated, committed),
  `tests/reference/quaternion-usability.json` (generated, committed)
- Test: `tests/unit/reference.test.js`

**Interfaces:**
- Consumes: nothing from `src/` (a test asserts it).
- Produces: `bulbOrbit(p, power, cap, {precision: 'f32' | 'f64'})`, `quaternionOrbit(q0, C,
  cap, {bound, precision})`, `complexOrbit(z0, c, cap)`, `sphereDistance`, `boxDistance`,
  `mengerBoxes(depth)`, `mengerDistance`, `sphereInterval`, `boxInterval`, `traceRay(ray, profile,
  field, interval) → {status, reason, subreason, t, steps}` (the §11.4 rules in binary64, with an
  f32-emulation mode for the stagnation checks), `rayFor(camera, i, j, W, H)` (Project 0 A.1,
  re-expressed), `prepareAnchor(model, effective, ray) → {anchor, t, convergence}` (P1's
  algorithm), `generateMatrix({seed}) → matrix`, the committed matrix `{schema:
  'atlas.space-matrix', version: 1, frozenAt, generatorSha256, strata: [{id, kind, cases,
  floor, eligible, excluded: [{id, reason}], state: 'frozen' | 'inconclusive'}], tolerances,
  anchors}` and the usability file `{rays, settings, distribution: {hit, miss, unresolved: {...},
  numericalFailure}}`.

**Design assertions:** §16.2 verbatim, via P1; independence (`tests/reference/` shares no code
with `src/`); nothing is validated merely because Project 0 tested power 8 and one quaternion
parameter; floors per stratum, never pooled; semantic and adversarial cases never excluded; the
detail ladder's exceedances are evidence, not passes.

- [ ] **Step 1: Write the failing tests** — `reference modules import nothing from src`; `the
  complex and quaternion recurrences agree exactly on the invariant plane`; `the bulb reference
  reproduces the axis orbit 0, 1, 2, 257 and the derivative 9217`; `Menger depths enumerate 20
  and 400 boxes and the exterior distance is the box-union minimum`; `the reference marcher
  reports stagnation by field coordinate for o = 1, t = 2⁻²⁶ in f32 mode`; `the reference marcher
  reports an interior start as unresolved with estimate-unavailable`; `κ = ±4 strata contain only
  empty-slice assertions`; `the matrix generator is deterministic and its output matches the
  committed file's sha256`; `every stratum meets its floor or is marked inconclusive`; `anchors
  converge within the declared rule and are recorded with both tolerances`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "the complex and quaternion recurrences agree exactly on the invariant plane"`.
- [ ] **Step 3: Implement; CPU preflight** — `node tests/reference/matrix.mjs --preflight`
  prints per-stratum eligible counts against P1's floors; a stratum below its floor is either
  resolved by a recorded preregistration revision to P1 (a plan amendment, before any GPU run) or
  frozen as `inconclusive`. Then generate and commit the files with their hashes.
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add independent Space references and freeze the validation matrix (1b.1 B04)"`, then the gate.

**Expected outputs:** 10 new unit tests; the committed matrix and usability files; the preflight
table in the task report.

---

### Task B05: Anchored camera arithmetic and perspective (spec §5.2, §10.1; Project 0 A.1)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B02.

**Files:**
- Create: `src/space/camera.js`
- Test: `tests/unit/space-camera.test.js`

**Interfaces:**
- Consumes: `CAMERA_KIND`, `CAMERA_LIMITS`, `parseDecimal` (B02).
- Produces: `RECENTRE_BOUND = 2 ** -40`, `anchorAdd(anchor, scale, local) → anchor'` (exact
  decimal arithmetic on `BigInt`-scaled integers; the represented point `anchor + scale × local` is
  preserved to within `RECENTRE_BOUND × scale`), `recentre(camera) → {camera, driftBound}` (moves
  the local part into the anchor when `‖positionLocal‖ > 1024` or `< 2⁻¹⁰`, re-expressing
  `focusLocal` consistently), `worldOrigin(camera) → {high: [3], low: [3]}` (double–double
  components; the GPU receives `high` and `low` as separate binary32 triples, never a collapsed
  sum), `basis(camera) → {forward, right, up, degenerate}` (A.1: world up (0, 0, 1); `right =
  normalize(forward × up)`, `up' = right × forward`; when `forward` is parallel to Z the previous
  `right` is kept and `degenerate` is true), `rayDirection(camera, i, j, width, height)` (A.1
  pixel centres with `h = tan(fov/2)`), `angularPixelSize(camera, height)`, `orbit(camera, dYaw,
  dPitch)` (about `focusLocal`; pitch clamped to ±89°), `pan(camera, dx, dy)`, `dolly(camera,
  factor)` (toward `focusLocal`, never crossing it), `lookAt(camera, focusWorld)`,
  `setOrientation(camera, wxyz, {lockAxis: null | 'x' | 'y' | 'z'})`, `resetOrientation(camera)`,
  `overview(model, effective) → camera` (2.5 × the enclosing radius along Project 0 A.6's
  direction), `equalCameras(a, b)`, `flightStep(camera, {forward, strafe, rise, yaw, pitch},
  speed, dtSeconds)` (upright: yaw about world Z, no roll).

**Design assertions:** §5.2 (represented position; recentring preserves positions to a declared
bound; never one `Number` world position; world Z up; upright navigation; orientation preserved
by serialization); §10.1 (navigation precision separate from field precision; no model
translation). Isolated behind the camera contract (B02). Excludes: events and gestures (B12),
picking (B10/B12).

- [ ] **Step 1: Write the failing tests** — `anchor arithmetic preserves the represented point
  within RECENTRE_BOUND across a recentre` (anchor `["0.6570552405982646",
  "-0.49279143044869844", "0.23955138980145063"]`, scale 2⁻²⁰, `positionLocal` `[3000, 0, 0]`;
  after `recentre`, the double–double origin agrees with the exact decimal within `RECENTRE_BOUND ×
  scale` and `‖positionLocal‖ ≤ 1024`); `a world origin is delivered as high and low parts whose
  sum is not representable in one double` (a 30-digit anchor; `low ≠ 0`); `the basis matches
  Project 0 A.1 for the bulb overview` (`forward` ≈ (−0.768, 0.576, −0.28) within 10⁻³);
  `ray directions use pixel centres and the vertical field of view` (the centre of 1280 × 720 is
  `forward`; the corner matches A.1's formula); `orbit keeps the focus and the distance`; `dolly
  never crosses the focus`; `flight is upright: yaw about world Z, pitch clamped, no roll`; `a
  degenerate forward keeps the previous right vector and is flagged`; `overview places the camera
  at 2.5 radii`; `setOrientation with a locked axis changes only the other two`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "anchor arithmetic preserves the represented point within RECENTRE_BOUND across a recentre"`.
- [ ] **Step 3: Implement** (`BigInt` is Space-owned and never in `shared/`; the orientation is a
  unit quaternion `[w, x, y, z]`).
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add the anchored Space camera and perspective arithmetic (1b.1 B05)"`, then the gate.

**Expected outputs:** 10 new unit tests.

---

### Task B06: The WebGPU backend (spec §9, §8.3, §15; the annex)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B00, B01.

**Files:**
- Create: `src/space/render/webgpu/backend.js`, `src/space/render/webgpu/allocator.js`,
  `src/space/render/webgpu/pipelines.js`, `src/space/render/webgpu/present.js`,
  `src/space/render/webgpu/shaders/probe.wgsl`, `src/space/render/webgpu/shaders/present.wgsl`,
  `src/space/render/webgpu/shaders.js` (fetches `.wgsl` text relative to the module URL and
  prepends `wgslConstants()`)
- Modify: `tests/space.mjs` (the `recovery` group is born here with the backend checks),
  `tests/suites.manifest.json` (append `space-recovery`)
- Test: `tests/unit/space-allocator.test.js` (the allocator is pure over an injected resource
  factory); the rest is headed.

**Interfaces:**
- Consumes: `acquireDevice` (B01); `BACKEND_METHODS`, `assertBackend`, `createAdmission`,
  `TARGET_LAYOUT_V1`, the ticket shape (B00).
- Produces: `createWebGPUBackend({canvas, clock, acquire = acquireDevice, enableTimestamps =
  false}) → backend` (every annex method and semantics; `onLoss` observers attached at
  acquisition; `destroy()` terminal), `createTrackedAllocator({factory, cap, clock}) →
  {allocate(desc) → handle, release(handle), retain(handle, owner), retire(owner),
  diagnostics()}`, `preparePipelines({device, pipelineSet, onProgress, boundMs}) →
  Promise<pipelines>` (`createComputePipelineAsync` per variant; progress `{stage, completed,
  total}`; timeout invalidates the attempt), `createPresenter({device, canvas}) → {present(
  displayTexture, {admission})}` (the fullscreen render pipeline to the preferred canvas format
  with scaling and sRGB encoding); the probe pass writes `0x41544c53` ("ATLS") into a 1 × 1
  r32uint target, read back through ordinary admission; a mismatch is `preparation-failed`.
  `backend.testAdapter = {destroyDevice()}` (real loss without terminal teardown).

**Design assertions:** §9 (the backend owns resources, encoding, submission, completion,
presentation and readback; shared and UI code never see `GPUDevice`); §8.3 (1 GiB cap; retiring
accounting; Plane separate); §15 (first-use compilation visible; the cap checked before
allocating); the annex (admission leases; fresh attempt identity; loss observer attached at
acquisition; transactional configuration; ping-pong accumulation; no direct canvas copy;
banded readback with 256-byte row alignment).

- [ ] **Step 1: Node tests (allocator):** `allocation is refused before creation when it would
  exceed the cap`; `release keeps bytes tracked until the last retaining owner retires`;
  `diagnostics report tracked, peak, retiring and the inventory by name and actual dimensions`;
  `uniform, staging and model buffers are counted`.
- [ ] **Step 2: Headed checks** (`space-recovery` `requiredPasses`): `Pipelines prepare
  asynchronously with progress and the probe readback is ATLS through ordinary admission`;
  `A batch completes with queue-completion timing and a 256-row banded readback returns the staged
  pattern` (the probe pass at 1024 × 600 writing a known pattern; rows read back in bands with
  aligned `bytesPerRow`); `Presentation renders the display texture to the preferred canvas format
  at the output size` (a draft at half size presented upscaled; sampled canvas pixels match);
  `A real device loss through the test adapter settles outstanding tickets interrupted, marks the
  backend unavailable before clients are notified, and reacquisition yields a fresh attempt and a
  new epoch`; `Configuration failure keeps the previous target set usable` (request a target set
  above the cap; the earlier set still presents); `A 4K target set allocates within the cap at
  72 bytes per pixel and is reclaimed after the last ticket retires`.
- [ ] **Step 3: Implement.** - [ ] **Step 4: GREEN** — Node first, then `flock … npm run test:space -- --group recovery`.
- [ ] **Step 5: Commit** — `"Add the WebGPU backend with tracked allocation, admission and loss mapping (1b.1 B06)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** 4 new unit tests; six named headed passes; preparation time for the
complete pipeline set recorded in the report (the B01 measurement repeated with the final set).

---

### Task B07: The shared scheduler (spec §7.3, §7.5, §7.6, §15)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B00.

**Files:**
- Create: `src/shared/scheduler.js`
- Test: `tests/unit/scheduler.test.js`

**Interfaces:**
- Consumes: `createAdmission` (B00) — the scheduler is the only producer of admission leases;
  `RENDER_OUTCOMES` (1a T06); the fake clock (B00).
- Produces: `SCHEDULER_DEFAULTS = {maxOutstanding: 2, batchTargetMs: 8, watchdogMs: 5000,
  budgets: {draftMs: 1000, settledMs: 10000, exportMs: 120000}, instrumentHz: 2}`, `PRIORITIES =
  ['navigation', 'inspection', 'refinement', 'export', 'swatch']`, `createScheduler({clock,
  ...SCHEDULER_DEFAULTS}) → {registerView(viewId, {hidden = false}), setEpoch(epoch),
  request(viewId, {jobId, requestId, priority, kind: 'draft' | 'settled', plan}) → job` (one
  coalesced pending interactive request per view: a newer request replaces the pending one, which
  settles `superseded`; a running job is never replaced, only cancelled), `admit() → [{batch,
  admission}]` (at most `maxOutstanding` leases outstanding across all views and jobs per epoch;
  priority order; hidden and paused views never admitted; auxiliary submissions — probes, readbacks,
  presentation — take leases from the same pool), `completed(admission, {epoch, elapsedMs})`
  (adapts the next batch's bounds toward `batchTargetMs` from completion evidence; never above the
  descriptor's hard bounds), `failed(admission, error)`, `pause(viewId)`, `resume(viewId)`,
  `update(viewId)` (admits exactly one frozen current snapshot's job, then returns the view to
  paused), `hidden(viewId, bool)`, `cancel(jobId) → {outcome: 'cancelled', submitted: 'none' |
  'drained' | 'interrupted'}`, `tick()` (the watchdog: no completion for `watchdogMs` while leases
  are outstanding stops admission for that epoch and settles the job `budget-exceeded` with reason
  `watchdog`; it never claims cancellation and never releases the lease's resources), `snapshot()`,
  `subscribe(listener)}`. Elapsed work excludes time while the view was paused or hidden;
  exceeding a budget settles `budget-exceeded` with `{continuation: 'resume' | 'lower-cost'}`.

**Design assertions:** §7.3 (lifecycle and outcomes; cancelling stops future submissions and
drains; "cancelled" never implies preemption; rejecting a stale result is not cancelling it; pause
is a scheduler condition; update renders one frozen snapshot); §7.5 (two outstanding batches per
epoch; 8 ms adapted from evidence, not a timeout; 5 s watchdog; one coalesced pending request per
view; priority order; hidden views paused; instruments ≤ 2 Hz, used in 1b.2); §7.6 (budgets 1 s and
10 s excluding paused time). Excludes: what a batch computes (B09), GPU submission (B06).

- [ ] **Step 1: Write the failing tests** — on the fake clock: `at most two leases are outstanding
  per epoch across views, jobs and auxiliary submissions`; `a newer interactive request supersedes
  the pending one and never the running one`; `priority order admits navigation before refinement
  before export`; `a hidden or paused view is never admitted and its elapsed work stops`; `update
  admits exactly one frozen snapshot and returns to paused`; `cancel reports none, drained or
  interrupted truthfully` (before any lease; after a lease completes; after `setEpoch` interrupts
  it); `the watchdog settles budget-exceeded, keeps the lease outstanding and never says
  cancelled`; `a draft exceeding 1 s of unpaused work settles budget-exceeded with a continuation`;
  `batch bounds adapt toward 8 ms from completion evidence and never exceed the hard bounds`; `a
  completion from an older epoch is ignored`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "at most two leases are outstanding per epoch across views, jobs and auxiliary submissions"`.
- [ ] **Step 3: Implement** (pure; no timers — `tick()` is called by the renderer's frame loop or
  the test).
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add the shared render scheduler (1b.1 B07)"`, then the gate.

**Expected outputs:** 10 new unit tests.

---
### Task B08: WGSL field kernels and the GPU numerics comparison (spec §10.2–10.4, §11.1–11.3, §16.2; P1)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B03, B04, B06.

**Files:**
- Create: `src/space/render/webgpu/shaders/fields.wgsl`,
  `src/space/render/webgpu/shaders/points.wgsl` (a list evaluator used only by validation and
  by the camera classification under effective inputs: points in, `PointResult` words out),
  `src/space/numerics/validation-records.js`
- Modify: `tests/space.mjs` (the `numerics` group), `tests/suites.manifest.json` (append
  `space-numerics`)
- Test: `tests/unit/wgsl-sources.test.js` (parses the WGSL text: every `acos`, `log`, `sqrt`,
  `atan2`, division and derivative update is preceded by a `// guard:` token naming the checked
  condition — a textual contract check, not a proof); headed checks.

**Interfaces:**
- Consumes: `wgslConstants`, status words (B00); the matrix and usability files (B04); the
  evaluators (B03) for context; the backend (B06).
- Produces: WGSL `bulb_eval(p, power, cap) → PointEval`, `qjulia_eval(q0, C, bound, cap) →
  PointEval`, `sphere_distance`, `box_distance`, `menger_distance(p, depth)` (boxes from a storage
  buffer), `derivative_update` on the `(m, e)` state (`f32` mantissa, `i32` exponent),
  `log2_estimate(...)`, `KERNEL_VERSION = 'space-fields-v1'`; `points.wgsl` entry
  `evaluate_points`; validation records `mandelbulb@1/space-fields-v1/p<power>` and
  `quaternion-julia@1/space-fields-v1` with `coverage` and `inconclusive` copied from the
  comparison results and `limitations` carrying the precision carry-forward verbatim.

**Design assertions:** §10.2 (guards before dangerous operations; no post-hoc NaN detection;
frozen tolerances); §10.3 (the G5-D plain `qsq(q) + c` formulation, independently implemented,
cited by profile and fragment hash; the product kernel separately identified by
`KERNEL_VERSION`); §10.4 in WGSL; §11.1 (φ = 0 on the axis; zero power map at r = 0); §16.2 (P1).

- [ ] **Step 1: Node test** (`wgsl-sources.test.js`): `every dangerous WGSL operation carries a
  guard token` — RED on the missing files.
- [ ] **Step 2: Headed checks** (`space-numerics` `requiredPasses`): `Bulb kernels match the
  frozen references for every power, stratum and budget` (iterates the point strata through
  `evaluate_points`; per stratum `passed` or `inconclusive`, never `failed`; eligible counts and
  worst ratios written to the report); `Quaternion kernels match the frozen references across
  off-plane C, nonzero κ and the boundary strata`; `κ = ±4 strata report empty slices and
  initialization escapes exactly`; `The 32 adversarial point cases give their expected statuses on
  the GPU`; `Derivative range safety holds on the GPU beyond update 44`; `Validation records are
  registered only for passed strata and name every inconclusive one`.
- [ ] **Step 3: Implement** the WGSL and the records.
- [ ] **Step 4: GREEN** — `npm test`, then `flock … npm run test:space -- --group numerics`.
- [ ] **Step 5: Commit** — `"Add the Space field kernels and validate them against the frozen matrix (1b.1 B08)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** 1 new unit test; six headed passes; the per-stratum table in the report. A
`failed` stratum blocks the commit: the kernel is fixed or the failure is escalated with the
evidence; tolerances are never relaxed.

---

### Task B09: The pass graph — requests, keys, accumulation, publication, reports (spec §7.1–7.4, §8.1, §8.2)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B00, B02, B07.

**Files:**
- Create: `src/space/render/renderer.js`, `src/space/render/profiles.js`,
  `src/space/render/keys.js`, `src/space/render-adapter.js`
- Modify (additive, with a regression test): `src/shared/render-report.js` — `EVENTS` gains
  `preparing` and `prepared` (preparation duration is `prepared − preparing`; `prepared` alone is
  elapsed time from request creation); nothing else changes; `tests/unit/render-adapter.test.js`
  gains `the preparing and prepared events are optional and Plane reports omit them`
- Test: `tests/unit/space-renderer.test.js`, `tests/unit/space-keys.test.js`

**Interfaces:**
- Consumes: `createScheduler` (B07); the fake backend, `createBatch`, `createPickRequest`,
  `TARGET_LAYOUT_V1`, `LIGHTING_BOUNDS_DEFAULT` (B00); `createRenderRequest`, `isPublishable`,
  `createReportBuilder`, `observed`, `UNAVAILABLE` (1a T06); `sceneCodec`, `effectiveParameters`
  (B02); `getModel` (B03, for `estimator.category` and the enclosing volume).
- Produces (`profiles.js`): `PROFILES = {draft: {scale: 0.5, maxIterations: 64, maxSteps: 256,
  lighting: 'direct', samples: 1, budgetMs: 1000}, settled: {scale: 1, maxIterations: 'scene',
  maxSteps: 'scene', lighting: 'full', samples: 'scene', budgetMs: 10000}}`, `resolveQuality(scene,
  profile, {width, height}) → quality` (§7.1's explicit stage settings; draft iterations
  `min(64, scene)` reported as preview quality; lighting bounds from `LIGHTING_BOUNDS_DEFAULT`,
  zero shadow and AO work for `direct`).
- Produces (`keys.js`): `geometryKey(scene, quality, {width, height, kernelVersion,
  tracingVersion}) → string` (fnv1a64 over §7.2's resolved inputs: model and kernel versions,
  effective parameters and bits, camera, slices, internal dimensions and sample mapping, actual
  iteration and tracing limits, normal settings), `appearanceKey(scene, quality) → string`
  (resolved appearance and the actual lighting stage, shadow and AO settings),
  `sampleKey(geometryKey, sampling, sampleIndex)`, `accumulationKey(geometryKey, appearanceKey,
  sampling)`.
- Produces (`render-adapter.js`): `createSpaceRequest({scene, purpose, width, height, profile,
  generation, viewId, versions}) → request` (frozen; `quality` from `resolveQuality`; keys from
  `keys.js`); `spaceWorkspaceFields(reportInputs)` (the Space report fields below).
- Produces (`renderer.js`): `createSpaceRenderer({backend, scheduler, clock, viewId, versions,
  model}) → {prepare() → Promise, render(request, {currentGeneration}) → job, pick(pickRequest)
  → Promise<{status, depth, world} | {stale: true}>, cancel(jobId), resize({width, height}),
  onPublish(listener), onReport(listener), onStatus(listener), tick(), destroy()}`. A job settles
  `{outcome, reason, report}`. Publication events: `{kind: 'draft' | 'settled-first' |
  'refinement', requestId, geometryRequestId, samples, pending: false}`; a status event `{pending:
  true, since}` is emitted the moment a new request supersedes the published image. The renderer
  walks §8.1 through the scheduler (trace → normals → shade → accumulate → display → present), each
  pass as batches within the §7.5 bounds, every submission with its admission lease; completed
  geometry is bound to a newer request only after key, epoch and resource-lifetime checks; a
  publication requires request and view identity to match beyond `isPublishable`; partial tiles
  and mixed generations are never published; samples under a different appearance key are never
  accumulated; a pick is answered only for the current epoch, view revision and request, otherwise
  `{stale: true}`.
- Report `workspaceFields`: `rayTermination: {hit, miss, unresolved: {pointBudget,
  estimateUnavailable, rayStepBudget, stagnation: {rayParameter, fieldCoordinate}},
  numericalFailure}`, `unavailableNormals`, `lightingFailures: {shadow, ao}`, `estimator:
  {category, derivationVersion, validationRecordId | null, inconclusive: []}`, `parameters:
  {requested, effective, bits}`, `samples: {target, completed}`, `milestones:
  {settledFirstImageMs, fullQualityMs}`, `allocation: {peak, outstandingBatchesMax}`,
  `timings.gpu: 'queue-completion' | 'timestamp'`, `preview: boolean`.

**Design assertions:** §7.2 (keys versus revisions; A → B → A gets a new revision; a late
completion never publishable by content equality); §7.3 outcomes; §7.4 (every field truthful or
`unavailable`/`inapplicable`; job completion separate from per-pixel status); §8.1 (pass order;
invalidation rules; AA by jittered primary rays with order-independent seeds; publication rules;
the pending mark); §8.2 (diagnostic modes bypass lighting). Excludes: WGSL (B08, B10, B11), DOM.

- [ ] **Step 1: Write the failing tests** — `a draft replaces the published image only when
  complete and the retained image is marked pending meanwhile`; `an appearance edit reuses
  geometry under the same geometry key and resets accumulation`; `geometry A → B → A returns A's
  key with a new revision and the late A completion is rejected`; `direct-light samples never enter
  the accumulator for the shadowed appearance`; `resize advances the geometry revision and the
  key`; `a report counts terminations and lighting failures from the status words and marks GPU
  timing as queue-completion`; `the first settled direct-light image and full-quality completion
  are separate milestones`; `a loss during tracing settles interrupted and publishes nothing`;
  `sample seeds are independent of batch order` (two completion orders; identical accumulations);
  `every submission carries a consumed admission lease`; `a pick for an older view revision is
  stale`; `the preparing and prepared events are optional and Plane reports omit them`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "a draft replaces the published image only when complete and the retained image is marked pending meanwhile"`.
- [ ] **Step 3: Implement.** - [ ] **Step 4: GREEN**, `npm test` (the Plane render-adapter suite
  still passes with the added events).
- [ ] **Step 5: Commit** — `"Add the Space pass graph, profiles, keys and reports (1b.1 B09)"`, then the gate.

**Expected outputs:** 12 new unit tests (11 Space + 1 Plane regression).

---

### Task B10: Tracing, normals, pick data and geometric validation (spec §11.4, §8.1 steps 2–3, §13.3; P2)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B04, B08, B09.

**Files:**
- Create: `src/space/render/webgpu/shaders/trace.wgsl`,
  `src/space/render/webgpu/shaders/normals.wgsl`, `src/space/render/webgpu/passes.js`
  (bind-group layouts, named slots and uniform packing for every pass)
- Modify: `tests/space.mjs` (the `rendering` group is born), `tests/suites.manifest.json`
  (append `space-rendering`), `src/space/numerics/validation-records.js` (tracing records)

**Interfaces:**
- Consumes: `fields.wgsl` (B08); descriptors and status words (B00); `rayDirection`,
  `worldOrigin` (B05); the matrix ray strata and anchors (B04); the renderer's pass sequence and
  pick API (B09).
- Produces: WGSL entries `trace_band` (writes `depth` and the packed `status`), `normals_band`
  (central differences at ε = 0.5·τ(t); writes `normal` with availability), `pick_readback` (one
  pixel's depth, status and world-space hit as four f32 from the high/low origin);
  `TRACING_VERSION = 'surface-v1/space-trace-v1'`; `passes.js`: `traceUniforms(request, camera,
  effective)` (origin high and low, basis, α, the τ floor, step multiplier, caps, enclosing-interval
  parameters), `normalsUniforms`, `pickUniforms`.

**Design assertions:** §11.4 verbatim (starting conditions; outward-safe enclosing volumes; the
ordered step rules; `0.9·DE`; stagnation by ray parameter or field coordinate compared in
binary32; the step cap; no minimum step; an interior start → `unresolved/estimate-unavailable`
with interior detail); §8.1 (normals with availability; an unavailable normal keeps the depth);
Project 0 A.5 (six samples; any unresolved or invalid → unavailable; zero gradient →
unavailable); §13.3 (focus by asynchronous depth readback; a pick rejected when epoch, view
revision or request no longer match). P2 is the acceptance protocol.

- [ ] **Step 1: Headed checks** (`space-rendering` `requiredPasses`): `Analytic rays trace to the
  oracle depth with exact statuses`; `Bulb and quaternion detail ladders agree with the converged
  references within P1's criteria where eligible and record each exceedance`; `Adversarial rays
  terminate with their expected status and subreason`; `Normals are available exactly where their
  samples resolve and unavailable normals keep their depth`; `The sphere silhouette equals the
  analytic disc except within one pixel of the edge`; `The quaternion default view's termination
  distribution matches the independently predicted one within 5 points`; `A pick returns the
  depth of the picked pixel and a stale pick is rejected`.
- [ ] **Step 2: Implement** `trace.wgsl` (the §11.4 loop), `normals.wgsl`, `passes.js`.
- [ ] **Step 3: GREEN** under the lock (`--group rendering`). - [ ] **Step 4: Commit** —
  `"Add Space tracing, normals and picking with geometric validation (1b.1 B10)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** seven headed passes; tracing validation records registered per family.

---

### Task B11: Lighting, shadows, AO, antialiasing, accumulation, display; shared palettes (spec §8.1 steps 4–6, §8.2, §7.6)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B09, B10.

**Files:**
- Create: `src/space/render/webgpu/shaders/shade.wgsl`, `.../accumulate.wgsl`,
  `.../display.wgsl`, `src/shared/palettes.js`
- Modify (mechanical): `src/plane/palettes.js` — imports `PALETTES`, `paletteBytes` and the
  interpolation from `src/shared/palettes.js` and re-exports them; keeps `colorPixel` unchanged;
  its exports and byte results stay identical
- Modify: `tests/space.mjs` (`rendering` group), `tests/suites.manifest.json`
- Test: `tests/unit/shared-palettes.test.js`; headed checks.

**Interfaces:**
- Consumes: B10's buffers and slots; `appearanceKey` (B09); `LEGEND`, `LIGHTING_STATUS` (B00).
- Produces: `shade_band` (the neutral inspection light; one bounded shadow ray of ≤ 64 steps
  through the same tracer, its failure status written to `lightingStatus` and the sample shaded
  unlit, never lit; restrained AO with five bounded samples along the normal; diagnostic modes
  `normals` (n·0.5 + 0.5), `depth` (normalized by the enclosing interval), `steps` (a cost ramp,
  labelled "computational cost"), `termination` (legend colours) — all bypassing lighting and
  writing `accumulationFlags` so diagnostic outcomes survive accumulation), `accumulate_band`
  (ping-pong linear sum and count under one accumulation key; jittered primary rays seeded by
  `atlas-aa-v1(seed, sampleIndex, pixel)`, independent of batch order), `display_band` (sRGB
  mapping of the mean; a sample count below the target leaves the image complete and reported as
  partial quality, never pending). `src/shared/palettes.js`: `PALETTES`, `paletteBytes(palette,
  size)`, `interpolatePalette(palette, t)`.

**Design assertions:** §8.1 (secondary-ray failures never become confident lighting; accumulation
in linear colour; diagnostic values bypass lighting; antialiasing traces seeded jittered rays);
§8.2 (all modes except orbit colour; the legend); §7.6 (settled: shadows, restrained AO, eight
samples); §13.9 (no fog); §4.1 (palette definitions and interpolation shared; Plane's
`colorPixel` Plane-owned).

- [ ] **Step 1: Tests** — Node: `the shared palette bytes equal Plane's former output byte for
  byte` (a fixture of `paletteBytes(PALETTES[i], 1024)` captured from the pre-change module, for
  every palette). Headed (`requiredPasses`): `A settled image accumulates eight jittered samples
  and the result is independent of batch order`; `Shadowed samples never enter a direct-light
  accumulation and the first settled direct-light image precedes full quality`; `Diagnostic modes
  show the legend colours exactly for the status words`; `Secondary-ray failures leave a sample
  unlit, never lit, and are counted in the report`; `Diagnostic outcomes survive accumulation`.
- [ ] **Step 2: Implement.** - [ ] **Step 3: GREEN** (`npm test`, the Plane gate suites, then `--group rendering` under the lock).
- [ ] **Step 4: Commit** — `"Add Space lighting, antialiasing, accumulation and display; share palette definitions (1b.1 B11)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** 1 new unit test; five headed passes; every existing Plane assertion
unchanged and green.

---

### Task B12: Navigation, flight, gestures, focus and camera-exterior status (spec §6, §13.3, §15)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B03, B05, B09; 1a T04.

**Files:**
- Create: `src/space/gestures.js`, `src/space/flight.js`, `src/space/navigation.js`
- Test: `tests/unit/space-gestures.test.js`, `tests/unit/space-navigation.test.js`

**Interfaces:**
- Consumes: `createHistory` (1a T04), `COMMAND_TYPES.setCamera`; camera functions (B05);
  `classifyCamera` (B03); `createPickRequest` (B00); `renderer.pick` (B09); `evaluate_points`
  through the renderer for the effective-input classification (B08).
- Produces (`gestures.js`): `SPACE_KINDS = ['orbit-drag', 'pan-drag', 'wheel-dolly',
  'key-nudge', 'flight', 'focus']`, `createSpaceGestures({history, onTransition, groupQuietMs =
  200, setTimer, clearTimer}) → {drag(kind, camera), dragCommit(kind), dragCancel(kind),
  grouped(kind, camera), flightStart(), flightUpdate(camera), flightEnd(), focusApply(camera),
  apply(commands, kind), undo(), redo(), back(), forward(), settle()}`. Rules: one drag, one wheel
  burst, one key-repeat run and one flight run are each one camera-history entry; **`pointerup`
  commits; `pointercancel` cancels (`history.cancel`, pre-gesture pose restored); window blur
  commits the last preview and releases input; workspace deactivation commits before releasing
  capture; a flight run commits on every exit; focus starts no history gesture until a valid pick
  returns, then applies one camera-only jump — a stale, unresolved or missed pick changes nothing**;
  back and forward settle any open gesture first. Nothing imports `src/plane/gestures.js`.
- Produces (`flight.js`): `createFlight({getCamera, setCamera, clock}) → {keyDown(code),
  keyUp(code), pointerLook(dx, dy), setSpeed(unitsPerSecond), tick(now), stop(reason: 'escape' |
  'blur' | 'hidden' | 'stop-key' | 'deactivate'), active}` (no inertia; `stop` zeroes every
  velocity immediately; `tick` applies `flightStep` with the elapsed time clamped to 100 ms).
- Produces (`navigation.js`): `bindSpaceNavigation({surface, gestures, flight, getCamera, pick,
  onStatus}) → {reset() → number of released pointers, destroy()}` (pointer orbit; pan with the
  secondary button or Shift; wheel dolly grouped; keys for nudge and the flight toggle `F`;
  `Escape` releases input and stops flight; `blur` and `visibilitychange` stop flight and commit an
  open drag; double-click requests a pick and applies `lookAt(hit)` only on a valid result);
  `cameraStatus({model, effective, camera, rendererClassification}) → {status: 'exterior' |
  'unresolved', detail}` (unresolved when either the CPU classification or the renderer's
  effective-input evaluation of the camera position is unresolved; §13.3).

**Design assertions:** §6 (gestures `begin → update* → commit | cancel`; one entry per continuous
navigation; camera-only jumps add one entry; undo never moves the camera); §13.3 (orbit, pan,
dolly, focus by asynchronous depth readback, overview, orientation reset and control with axis
constraints; flight with explicit speed; Escape releases; blur or visibility loss stops
immediately; no inertia; camera exterior status); §15 (lost input: overview, reset and history one
action away). Excludes DOM layout (B14).

- [ ] **Step 1: Write the failing tests** (fake DOM as in 1a's `navigation.test.js`): `an orbit
  drag is one camera-history entry and undo does not move the camera`; `a wheel burst groups within
  200 ms`; `pointerup commits and pointercancel restores the pre-gesture pose`; `window blur commits
  the last preview and releases input`; `a flight run commits on escape, blur and visibility loss
  with one entry and zero velocity afterwards`; `a focus whose pick is stale or unresolved starts
  no gesture and leaves the camera where it was`; `a valid pick is one camera-only jump`; `reset
  releases captured pointers so later moves cannot navigate`; `the camera status is unresolved when
  either evaluator is unresolved`; `back and forward settle an open gesture and stop flight`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "an orbit drag is one camera-history entry and undo does not move the camera"`.
- [ ] **Step 3: Implement.** - [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add Space navigation, flight, gestures and focus (1b.1 B12)"`, then the gate.

**Expected outputs:** 10 new unit tests.

---

### Task B13: Recovery orchestration (spec §7.3, §14, §15)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B06 (contract), B07, B09.

**Files:**
- Create: `src/space/recovery.js`
- Test: `tests/unit/space-recovery.test.js` (fake backend, fake clock)

**Interfaces:**
- Consumes: the renderer (B09), the scheduler (B07), `BackendError` codes and the backend's
  `onLoss`, `acquire`, `prepare`, `configureTargets`, `diagnostics` (B00).
- Produces: `RECOVERY_POLICY = {maxAutomaticRecoveries: 1, windowMs: 60000}`,
  `createRecovery({backend, renderer, scheduler, clock, policy, onNotice}) → {state() →
  {epoch, phase: 'ready' | 'preparing' | 'recovering' | 'stopped', lastLoss,
  automaticRecoveries}, onLoss(event) → 'recover' | 'stopped', retry() (the explicit action after
  `stopped`), onAllocationFailure({request, failed}) → {choices: ['release-and-retry',
  'lower-resolution', 'fewer-samples'], released}` (releases obsolete generations first; offers the
  explicit lower-cost choice; never changes the request silently), `onBudgetExceeded(job) →
  {continuation: 'resume' | 'lower-cost'}`, `cancel(jobId) → outcome` (from the scheduler; never
  "preempted"), `destroy()`}.

**Design assertions:** §14 (device loss keeps the job and snapshot; one automatic viewport
recovery; repeated loss stops automatic retry; allocation failure releases obsolete resources and
offers an explicit lower-cost choice); §15 (every row that applies to 1b.1); §7.3 (outcomes;
pause); recovery never touches the scene, undo history or camera history.

- [ ] **Step 1: Write the failing tests** — `a loss during preparation, configuration, tracing
  and readback each settles the job interrupted and triggers one automatic recovery`; `a second
  loss within the window stops automatic recovery and leaves retry explicit`; `late callbacks from
  the lost epoch are ignored after recovery`; `allocation failure releases obsolete generations
  before offering a lower-cost choice and never changes the request`; `a failed configuration keeps
  the previous target set and the previous publication`; `cancellation during retirement keeps
  bytes tracked until the ticket settles`; `a watchdog budget-exceeded offers a continuation and
  does not claim cancellation`; `recovery never modifies the scene or either history`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "a loss during preparation, configuration, tracing and readback each settles the job interrupted and triggers one automatic recovery"`.
- [ ] **Step 3: Implement.** - [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add Space recovery orchestration (1b.1 B13)"`, then the gate.

**Expected outputs:** 8 new unit tests.

---

### Task B14: Checkpoint — the Space workspace, the switcher and the activation contract (spec §13.1–13.3, §14, §15, §4.1)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B10–B13; **1a T12 merged** (and
transitively T05, T07, T08, T09b, T10, T11); the dependency table reconciled against the accepted
1a commit.

**Files:**
- Create: `src/space/workspace.js`, `src/ui/workspace-switcher.js`, `tests/space-shell.mjs`
  (headless Chromium, `gpu: false`)
- Modify (whole files, re-issued from the merged T12 versions): `src/app.js`, `index.html`,
  `src/ui/style.css`; additive: `src/plane/workspace.js` (gains `activate()` and `deactivate()`)
- Modify: `tests/space.mjs` (the `shell` group), `tests/suites.manifest.json` (append
  `space-shell` with `gpu: false` and `space-interaction` with `gpu: true`),
  `tests/unit.manifest.json`
- Test: `tests/unit/space-workspace.test.js`, `tests/unit/workspace-switcher.test.js`,
  `tests/unit/plane-activation.test.js`; the two browser suites.

**Interfaces:**
- Consumes: **(1a, unlanded)** `createShell`, `createPlaneWorkspace({shell, discoveries}) →
  {inspection, destroy()}`, `createNotifier`, `installDialogs` (T12); everything above.
- Produces: `createSpaceWorkspace({shell, backendFactory = createWebGPUBackend, clock}) →
  {inspection, activate(), deactivate(), destroy()}` (`inspection` = `window.atlas.space`:
  `scene`, `history`, `lastReport`, `lastPublication`, `cameraStatus`, `backendDiagnostics`,
  `whenIdle({timeoutMs})`, `setBackend(fake)` as a test seam, `injectLoss()` and
  `injectAllocationFailure()` through the backend's test adapter); `createWorkspaceSwitcher({root,
  workspaces: {plane, space}, initial: 'plane'}) → {switchTo(id), current(), destroy()}` (calls
  `deactivate()` on the current workspace, then `activate()` on the next; the first switch to
  Space acquires the device and prepares pipelines with visible status; a failure shows "Space
  unavailable: <reason>" and keeps Plane active); the Space panel: family selector, parameter
  inputs (decimal strings; invalid input reported inline, never clamped), iterations and steps,
  view mode, the viewport indicators (`#space-estimator` "exact distance" / "heuristic,
  exterior-only"; `#space-pending`; `#space-camera-status`; the preparation status), overview,
  orientation reset, the orientation control, Back/Forward, undo/redo, "Save scene" (downloads
  `atlas.scene` JSON via `encodeSceneFile`) and "Open scene" (file input → `decodeSceneFile` →
  `restoreScene`: one undo entry and one camera entry; invalid files reported without changing the
  scene); graphics diagnostics extended with the backend identity and tracked inventory.
- **Activation contract (both workspaces; both methods idempotent):** `deactivate()` first closes
  admission and invalidates pending picks, then settles navigation (commits an open gesture, stops
  flight), stops automation (tours, palette animation), releases pointer capture and keyboard
  focus, and detaches its global listeners; capture-loss callbacks arriving afterwards cannot
  cancel that settlement; the scene, undo history and camera history are preserved; Space marks
  its views hidden in the scheduler and lets submitted batches drain, never claiming preemption;
  an in-flight Plane export keeps its lease and completes under T07/T08's rules, its completion
  callbacks respecting the inactive state. `activate()` re-attaches listeners, resumes views, and
  issues at most one current-state request when the publication is stale (Space may then publish
  several refinements from it).

**Design assertions:** §13.1 (two retained investigations, one active view; a switch preserves
scene, camera, undo and camera history; hidden work pauses; captured input released; a fresh start
opens Plane without acquiring a Space device); §13.2 (viewport, parameter panel, indicators); §14
(Space scene files); §15 (first-use compilation visible; lost input one action from overview, reset
and history); §4.3 (every existing Plane assertion survives).

- [ ] **Step 1: Node tests** (fake DOM, fake backend): `a fresh start activates Plane and never
  calls the Space backend factory`; `switching deactivates the current workspace before activating
  the next and both keep their histories`; `deactivate closes admission, invalidates picks, settles
  navigation and releases capture without touching the scene`; `a capture-loss callback after
  deactivation cannot cancel the settled gesture`; `activate issues at most one request when the
  publication is stale`; `opening an invalid scene file reports and changes nothing`; `opening a
  valid file is one undo entry and one camera entry`; `a backend acquisition failure leaves Plane
  active with a notice`; `Plane deactivate stops a tour and detaches its keyboard listener, and
  activate restores them`.
- [ ] **Step 2: Browser checks.** `tests/space-shell.mjs` (headless, evidence `browser`): `Space
  reports unavailable without WebGPU and Plane keeps working`; `Switching to Space and back
  preserves the Plane scene and both histories` (the Space backend replaced by the fake through the
  seam). `tests/space.mjs --group shell` (headed, `space-interaction`): `The first switch to Space
  prepares pipelines with visible status and renders the bulb overview`; `Each family renders with
  its estimator category shown`; `Orbit, wheel dolly, focus, overview and flight each produce one
  camera-history entry`; `Undo of a parameter edit restores the scene without moving the camera`;
  `A saved scene file reopens to the same scene hash`; `A device loss during interaction recovers
  once and a repeated loss stops automatic retry with the scene intact`; `An allocation failure
  offers a lower-cost choice and never changes the request`; `A camera inside the set shows the
  unresolved exterior status with overview and reset available`; `Switching during a Plane export
  does not interrupt the export`; `Keyboard focus, capture and flight end on blur and on switching`.
- [ ] **Step 3: Implement.** - [ ] **Step 4: GREEN** — `npm test`, the Plane gate suites
  (`browser`, `browser-hardware`, `navigation`, `graphics`), `space-shell`, then
  `flock … npm run test:space -- --group shell`.
- [ ] **Step 5: Commit** — `"Add the Space workspace, the workspace switcher and the activation contract (1b.1 B14)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** 9 new unit tests; two headless passes; ten headed passes; every Plane suite
green with unchanged assertions.

---

### Task B15: Performance acceptance, the recorded investigation, the audit and the handoff (spec §16.4, §3, §16.3; P3)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B14; **1a T13** (audit scripts).

**Files:**
- Create: `tests/space-performance.mjs` (headed, `gpu: true`, `benchmark: true`),
  `tests/support/timing.mjs`, `docs/reports/project1b/1b1-performance.json` (generated),
  `docs/reports/project1b/1b1-investigation.md` (the recorded investigation),
  `docs/reports/project1b/gate-ledger-1b1.json` (generated by the T13 audit)
- Modify: `tests/suites.manifest.json`, `README.md`, `HANDOFF.md`, `AGENTS.md` (exact
  replacements for the Space paths and commands)
- Test: `tests/unit/timing.test.js`; the performance suite.

**Interfaces:**
- Consumes: **(1a, unlanded)** `auditLedger`, `judgeRecord`, `requiredIdsFromManifest`,
  `scripts/audit-gates.mjs` (T13); `window.atlas.space` (B14); P3.
- Produces (`timing.mjs`): `scheduleAbsolute({clock, setTimer}, targets, callback) →
  {rearms, lateByMs[], longTasks[], invalidated}` (rounds every positive wait up to a whole
  millisecond; re-arms against absolute targets; a request issued more than 4 ms late invalidates
  the trial and is recorded, never retried silently; long tasks from a `PerformanceObserver` in
  the page).

**Design assertions:** §16.4 verbatim through P3; Project 0's timer requirements; §16.3 (every
1b.1 commit accepted by its own gate record); §3 (the 1b.1 release row demonstrated end to end).

- [ ] **Step 1: Tests** — Node: `waits are rounded up and scheduled against absolute targets`;
  `a late issuance invalidates the trial and is recorded with its lateness`. Headed
  (`space-performance` `requiredPasses`, one per P3 target, each asserting its threshold on every
  valid trial and at least three valid trials per scene, with completed work, publication and
  readback reported separately and coverage checked against B04's prediction).
- [ ] **Step 2: The recorded investigation** — headed, on the physical GPU, scripted by `node
  tests/space.mjs --group shell --investigation` and written to `1b1-investigation.md` with report
  ids and termination counts: open Plane; switch to Space; explore each calibration object, the
  bulb at two powers and the quaternion set (the default and C = (−.2, .8, .15, −.1), κ = 0.5);
  orbit, dolly, focus, flight; edit a parameter and undo; save the scene file, reload the page, open
  the file and verify the scene hash; inject a device loss and recover; inject an allocation
  failure and choose the lower-cost option; move the camera inside the set and recover with
  overview.
- [ ] **Step 3: Audit** — `node scripts/audit-gates.mjs <1b.1 base> <head>`: every 1b.1 commit
  `accepted`; the summary committed as `gate-ledger-1b1.json`.
- [ ] **Step 4: Documentation** — README, HANDOFF and AGENTS exact replacements (Space source
  map, `npm run test:space`, the GPU lock, the headed requirement, the PR-only rule for `main`).
- [ ] **Step 5: Commit** — `"1b.1 acceptance: performance evidence, recorded investigation, gate audit and handoff (B15)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** 2 new unit tests; the performance report with per-trial results; the
investigation document; the audit summary with every commit accepted.

---

## Parallel schedule

Waves describe dependency readiness, not permission to run GPU suites concurrently: every
browser and GPU run takes `flock /mnt/ml_storage/scratch/atlas-gpu.lock`, and gate runs are
serialized (port 5190, one GPU).

| Wave | Tasks | Notes |
|---|---|---|
| W0 | B00 | contracts, fake backend, frozen protocols; alone |
| W1 | B01 ‖ B02 ‖ B03 ‖ B04 | B01 needs the GPU; B02–B04 are Node-only and disjoint (B03 depends on B02's `parameters.js` — start B03 after B02's interfaces are committed, or implement against its skeleton) |
| W2 | B05 ‖ B06 ‖ B07 | B06 needs the GPU; B05 and B07 Node-only |
| W3 | B08 ‖ B09 | B08 needs the GPU and the frozen matrix; B09 Node-only |
| W4 | B10 ‖ B12 ‖ B13 | B10 needs the GPU; B12 and B13 Node-only |
| W5 | B11 | GPU; mechanical palette change touches `src/plane/palettes.js` |
| W6 | B14 | after 1a T12 is merged and the dependency table is reconciled; alone (touches `src/app.js`, `index.html`) |
| W7 | B15 | after 1a T13; alone |

Critical path: B00 → B01 → B06 → B08 → B10 → B11 → B14 → B15 (8 deep). The Node-only chain
B02 → B05/B09 → B12/B13 runs beside it.

**Hot files (serialized or merged by the merger):**

| File | Touched by | Rule |
|---|---|---|
| `src/app.js`, `index.html`, `src/ui/style.css` | 1a T08, T12; B14 | B14 only, after T12 lands; whole-file re-issue from the merged T12 version |
| `src/plane/workspace.js` | 1a T12; B14 | additive `activate`/`deactivate` after T12 |
| `src/plane/palettes.js` | B11 | mechanical re-export; byte-identical outputs tested |
| `src/shared/render-report.js` | B09 | additive events; Plane regression test |
| `tests/suites.manifest.json` | B01, B06, B08, B10, B11, B14, B15 | append-only; the merger appends |
| `tests/unit.manifest.json` | every Node task | append-only; the merger appends |
| `tests/space.mjs` | B01, B06, B08, B10, B11, B14, B15 | one group per task; groups are separate top-level blocks; merge in task order |
| `src/space/numerics/validation-records.js` | B08, B10 | B10 appends tracing records |
| `package.json` | B01 | `test:space` once |

All other files are single-owner.

## Self-review against the spec

- §3 release row 1b.1: calibration objects, bulb, quaternion (B02, B03, B08); orbit and flight
  (B05, B12, B14); recovery from bad camera (B03, B12, B14), cancellation (B07, B13), allocation
  failure (B06, B13, B14), device loss (B06, B13, B14); scene JSON (B02, B14); estimator category
  (B03, B09, B14), pending marks (B09, B14), distinct statuses (B00, B08, B10, B11).
- §4.1 boundaries (B00, B03 import test, B11 palettes); §4.3 Plane unchanged (B11 byte test, B14
  gate suites).
- §5 Space scenes and the rev 4 camera (B02; user item); §6 gestures and histories (B12, B14).
- §7.1–7.6 requests, keys, outcomes, reports, scheduler, profiles (B00, B07, B09).
- §8.1–8.3 pass graph, view modes, resources (B06, B09, B10, B11; the annex).
- §9 backend interface, allocator, fake backend, annex (B00, B06; user item).
- §10.1–10.5 representation, WGSL rules, quaternion arithmetic, range-safe derivative (B03, B05,
  B08); the precision indicator is 1b.2 (records stored from B08/B10).
- §11.1–11.4 families, calibration, tracing profile and statuses (B03, B04, B08, B10).
- §13.1–13.3 shell, layout, navigation (B12, B14); §13.9 fog/pause/update controls 1b.3 (Global
  Constraints); §14 scene files and failure behaviour (B13, B14); §15 (B06, B07, B13, B14).
- §16.1 layers (every task), §16.2 matrix (P1, B04, B08, B10), §16.3 gate (every commit), §16.4
  performance (P3, B15), §16.5 hardware (Global Constraints).
- §18 risks: coexistence (B01), estimator usability (B04, B10), precision outside measured
  domains (records, B08), compounded cost (B07, B15), loss races (B00, B13), preparation time (B01,
  B06).
- §19.2 Q2, Q5, Q6: provisional defaults (Global Constraints; user items).
- Items for the user, collected: (a) adopt the §9.1 backend annex; (b) approve rev 4 §5.2/§10.1's
  anchored camera for ordinary Space; (c) confirm the Q2/Q5/Q6 defaults; (d) erratum: §13.2's
  indicator list to mark the precision badge "(1b.2)".
