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

**Revision:** 4.1 — **Codex READY** (run 20261021T012346Z-8408, verified at commit 5914fc9) after
five rounds: joint decomposition 20261020T211454Z-d306 and reconciliation 20261020T212435Z-94a5,
then the co-author reviews 20261020T214114Z-aba8 (fifteen findings), 20261021T010758Z-8a0a (nine)
and 20261021T011813Z-1807 (three blocking, one editorial), all applied. Claude drafted; both peers
agreed the structure and reviewed the whole. Awaiting the user's approval and the four items under
*Items for the user*. **Authors:** Claude and Codex as peers
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
  tolerances come from B04's tolerance analysis, recorded before any GPU comparison, and the
  frozen `tests/reference/space-matrix.json` (§16.2), never from tuning. The running derivative is
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
  the recentre bound 2⁻⁴⁰ × scale (`RECENTRE_BOUND_LOG2 = −40`); `MAX_PARAMETER_DIGITS = 64`;
  camera limits in B02; the neutral
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
   erasing its depth, or a numerical failure painted as a miss. *B10:* `The 12 adversarial ray cases terminate
   with their expected status and subreason`; `Normals require distinct resolved samples and a
   finite nonzero gradient, and unavailable normals keep their depth`. *B11:* `Secondary-ray
   failures remain visibly diagnostic and are counted`; `Diagnostic modes show the legend colours
   exactly for the status words`.
3. **Recovery that loses the investigation** — a device loss that drops the scene or a history,
   an allocation failure that quietly lowers the request, repeated loss looping forever, or a
   cancellation reported as preemption. *B13:* `recovery never modifies the scene or either
   history`; `allocation failure releases obsolete generations before offering a lower-cost choice
   and never changes the request`; `a second loss stops automatic recovery even after more than 60
   seconds`. *B07:* `cancel reports none, drained or interrupted only on completion or loss
   evidence`.
4. **Input that outlives its owner** — flight that keeps moving after blur or a workspace switch,
   a captured drag that survives deactivation, a stale focus pick that moves the camera, or a
   hidden workspace that keeps rendering. *B12:* `a flight run commits on escape, blur and
   visibility loss with one entry and zero velocity afterwards`; `a focus whose pick is stale or
   unresolved starts no gesture and leaves the camera where it was`. *B14:* `deactivation commits
   the last preview exactly once and a later capture-loss callback cannot cancel it`; `a late
   activation cannot reactivate a hidden workspace`; `Switching during a Plane export does not
   interrupt the export`.
5. **A number presented with more authority than it has** — an effective binary32 value shown as
   the requested one, a validation record matched outside its coverage, Project 0's results
   presented as product validation, or an inconclusive matrix cell counted as passed. *B02:*
   `effective binary32 values carry their bit patterns beside the requested strings`; `a validation
   lookup matches only the evidence class and domain it was recorded for`. *B08:* `Validation
   records are registered only for passed mandatory strata`. *B04:* `an inconclusive mandatory
   stratum blocks qualification`.

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
| B09 | Pass orchestration, profiles, keys and revisions, compatible accumulation, complete-image publication, Space reports | Codex | B00, B02, B03, B07 | 3 |
| B10 | Primary tracing, normals and pick data; geometric validation (analytic rays, adversarial rays, convergence) before decorative shading | Claude | B04, B05, B08, B09 | 4 |
| B11 | Lighting, bounded shadows and AO, diagnostic display, seeded jitter, linear accumulation, display mapping; shared palettes | Claude | B09, B10 | 5 |
| B12 | Orbit, pan, dolly, orientation control, flight, Space-owned gestures, stale-safe focus, camera-exterior status | Codex | B03, B05, B09, 1a T04 | 4 |
| B13 | Recovery orchestration: cancellation, failed allocation, stalled work, loss and repeated loss, preserving the investigation | Codex | B06 (contract), B07, B09 | 4 |
| B14 | **Checkpoint:** the Space workspace, the workspace switcher, the activation contract, panel, indicators, diagnostics, scene files | Claude | B10–B13; **1a T12 merged** | 6 |
| B15 | Headed interaction and recovery acceptance, frozen performance acceptance, the recorded investigation, the commit audit, handoff | Codex | B14; **1a T13** | 7 |

Each task has one implementer and the other peer's read-only review; shared ownership is not used.
The merger records unit counts in the ledger (the 1a baseline is still moving, so this plan gives
no cumulative counts). Every listed Node test contains executable assertions; a missing-module or
missing-file failure never counts as behavioural RED.

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
- **Pipeline descriptors.** B00 freezes the pipeline descriptor schema, ids, binding slots and
  uniform layouts; B06 validates preparation with executable self-check pipelines; B08, B10 and
  B11 add their descriptors and preparation assertions as their shaders come into existence; B11
  verifies complete product prewarming before B14 enables interaction.
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
and limitations; they do not constitute product validation. Product validation records (B02's
registry) distinguish arithmetic, tracing and geometric evidence classes; each carries the
implementation-source hashes, the reference and generator hashes, the matrix hash, the profile and
the exact tested input or spatial sampling domain; a lookup matches only the conditions its
evidence class represents, and a local detail record never matches another camera patch merely
because parameters and image height match. The power-8 10⁻⁴/10⁻⁵ observations at
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
256 and 512 throughout the point matrix; bulb powers 2–8. Every stratum is classified in the
fixture schema as **mandatory** (arithmetic, semantic and geometric qualification) or
**diagnostic** (the detail ladders). A mandatory stratum must meet its preregistered floor and
pass its assertions; an inconclusive mandatory stratum blocks qualification and release and cannot
satisfy a `requiredPasses` entry. B04 stops before any GPU comparison when CPU preflight cannot
substantiate a mandatory floor (the floor is then revised by a recorded plan amendment, never
weakened silently). Diagnostic rows may record threshold exceedance or insufficient coverage
without claiming validation at that distance; they never substitute for mandatory qualification.

| Stratum | Frozen candidates | Floor / required assertions |
|---|---:|---|
| Bulb origin, per power × budget | 1 | 1/1 semantic case (zero power map; derivative zero state) |
| Bulb polar axis `(0, 0, ±2ʲ)`, j = −8…3, per power × budget | 24 | 24/24 semantic cases (φ = 0) |
| Bulb generic: cell centres of an 8³ grid over [−1.2, 1.2]³, per power × budget | 512 | ≥ 410 continuous-comparison eligible |
| Quaternion generic: C ∈ {(−.2,.8,0,0), (0,0,0,0), (2,0,0,0), (−.2,.8,.15,−.1), (.25,−.5,.5,−.25), (−.4,.2,−.3,.6)} × κ ∈ {0, ±0.5, ±2, ±4} × budget; an 8 × 8 × 4 cell-centre grid over [−1.5, 1.5]³ | 256 | ≥ 205 eligible; additionally ≥ 64 eligible non-initial-escape cases when \|κ\| ≤ 0.5. **κ = ±4 cells are empty-slice cells** (‖C‖ ≤ 8 ⇒ R(C) ≤ (1 + √33)/2 ≈ 3.3723 < 4): they require empty-slice, miss and initialization-escape assertions, not coverage minimums |
| Quaternion supported-boundary: the 16 corners of [−4, 4]⁴ plus its 8 face centres × 7 κ values {0, ±0.5, ±2, ±4} × 8 starts (origin, the six ±0.25 axis points, (0.25, −0.5, 0.75)) × 4 budgets | 5,376 | every admission, bound and semantic assertion; singular cases never excluded; exact requested-decimal just-outside-range rejection tests beside them |
| 32 named adversarial cases: 20 point cases (B08) and 12 ray cases (B10) | 32 | 32/32: zero sensitivity, derivative range (update 44), initialization escape, strict and equal empty-slice bounds, four-component quaternion probes that detect dropped or wrong j/k components, invalid inputs (points); analytic interior and boundary starts, origin-through, polar-axis, grazing, inside-start and both stagnation reasons (rays) |
| Sphere / rotated box reference rays (Project 0 A.4, re-expressed independently) | 625 / 651 | ≥ 500 / 521 eligible, each with ≥ 64 positive-depth hits |
| Menger depth 1 / 2 reference rays (41 × 41, oblique direction) | 1,681 each | ≥ 1,345 eligible with ≥ 64 positive-depth hits |
| Fractal overview rendering: 1,024 rays per power and per quaternion (C, κ) cell, budget 128 | 1,024 | ≥ 820 reference-eligible; hit-count requirements only for preregistered surface-bearing views |
| Detail approaches: two independently prepared anchors per bulb power, two for the default quaternion and two for C = (−.2,.8,.15,−.1), κ = 0.5; distances 10⁻¹…10⁻⁸; the central 32 × 32 rays of a 1280 × 720 frame; budget 128; 512 steps | 1,024 per anchor and distance | ≥ 512 reference-eligible and ≥ 128 positive-depth hits for a depth claim; the ladder measures where agreement fails — "threshold exceeded" is evidence, not a pass; insufficient coverage is `inconclusive` |

Totals before adversarial cases: 15,036 bulb, 43,008 generic quaternion, 5,376 boundary
quaternion points. These are sampling budgets, not evidence that the floors are attainable; CPU
preflight establishes that. Compared quantities and proposed tolerances (quantity-specific):
status and escape index exact; every quaternion component at escape, relative 10⁻⁴ with absolute
floor 10⁻⁶ (so that dropped or wrong j/k components are detected); ln R relative 10⁻⁴; log₂ DE
absolute 2⁻¹⁰ (compared in the log domain; an unavailable estimate must be unavailable on both
sides); analytic ray depth relative 10⁻³ with floor 10⁻⁶. **Before any numerical GPU comparison,
B04 records the analysis supporting every tolerance — fused and unfused evaluation, transcendental
error, conditioning and output quantization — and the tolerances are not represented as derived
until that analysis exists.** Sensitivity screen (generic strata only): for each candidate,
independently perturb each relevant effective binary32 input to its adjacent representable
values; exclude and count the candidate if the CPU reference changes status or escape index, or
changes a compared continuous quantity by more than one quarter of that quantity's acceptance
tolerance; semantic and adversarial cases are never excluded; eligibility, exclusions and
denominators are recorded per compared quantity, with no pooling between strata. Profiles:
ordinary-render comparisons use `surface-v1` on both sides; the detail ladders use a separately
named harness profile `ladder-v1` (no tolerance floor, factor 0.005, tighter reference 0.0005, with
A.10's criteria: status disagreement ≤ 5 % of eligible, large depth errors > 1 % ≤ 5 % of eligible
hits, requested-input and effective-input comparisons recorded separately); every result names
its profile. B04 freezes the exact case ids, start coordinates, overview cameras and pixel
coordinates, surface-bearing classifications and hit floors, anchor seed rays and selection rule
(the CPU reference marches each anchor's seed ray at 256 iterations, k = 0.5, tolerance 10⁻¹³, up
to 4,096 steps, repeated at 10⁻¹⁵ as the convergence check), and the reference-convergence
decisions; the generator freezes the algorithm and B04's commit freezes the values. Minimum
eligibility is per stratum, never pooled.

**P2 — Geometric validation** (B10): analytic rays — status exact and depth within the P1
tolerance against the slab/sphere oracle; the detail ladders — P1's `ladder-v1` criteria, as
diagnostic evidence; adversarial rays — expected status and subreason exactly; normals — on the
sphere, within 10⁻³ rad of the exact gradient on ≥ 99 % of hits; a normal is available only when
all required samples resolve, the effective sample positions remain distinct, and the gradient is
finite and nonzero, otherwise the depth is preserved and the normal marked unavailable; silhouette — the
sphere's hit mask equals the analytic disc except within one pixel of the edge; the quaternion
usability experiment — the default view's termination distribution within ±5 percentage points
per class of B04's binary64 prediction (160 × 90 rays, 128 iterations, 512 steps).

**P3 — Performance workload** (B15): B00 freezes a workload manifest
(`tests/reference/performance-workload.json`) containing the complete scenes, motion trajectories
(camera poses per request time), request times, edit values, seeds, warm-up rules and coverage
checkpoints (the three P3 scenes are the `lightingQuality: 'full'`, eight-sample settled scenes); B04 supplies `tests/reference/performance-predictions.json` (hashed; each
checkpoint's termination distribution and its acceptance tolerance); B15 consumes both files by
hash. Content:
1280 × 720; scenes: the bulb overview (power 8, 128 iterations), the quaternion default view,
`menger` depth 2, all at `lightingQuality: 'full'`; per scene: a 30 s orbit at 0.5 rad/s (draft rate and intervals), a burst of 400
camera requests at 60 ms spacing (interaction latency), a parameter edit every 250 ms for 10 s
(stress replacement); one cold trial after a fresh page load, then warm trials; **one
performance suite per scene**, each with the existing ten-minute bound, requiring three valid
trials and allowing at most five recorded attempts; insufficient valid trials are reported as
inconclusive and non-accepting; invalid trials are never retried silently. Timing boundaries:
request creation → first complete publication, with completed work, publication, readback and
presenter queue completion reported separately (`onPresent` reports `{identity, queueCompletedAt,
evidence: 'presenter-queue-completion'}`; actual compositor presentation time is reported as
unavailable unless independently observed; headed screenshot checks at frozen checkpoints verify
visible canvas output separately, outside the timed workload); coverage checks at
the manifest's checkpoints against B04's prediction, and failed or missing coverage cannot satisfy
a target; attempt classification: a request issued more than 4 ms late records a timing
anomaly, which does not by itself establish a harness failure; an established application target
failure makes the attempt `failed` regardless of timing anomalies; an attempt may be excluded only
for a demonstrated harness failure without an established application failure; an unexplained
timing anomaly makes the attempt `inconclusive`, which cannot support acceptance; a scene suite
accepts only with at least three valid passing trials within five attempts and no established
application target failure in any attempt; every attempt and its classification evidence stays
in the report; the timing helper records anomalies and the trial classifier determines their
disposition; Project 0 timer rules; no single
average-FPS figure. Targets: ≥ 30 completed drafts/s with consecutive-interval p95 ≤ 50 ms;
interaction p95 ≤ 100 ms; stress replacement ≤ 250 ms; no application main-thread task over 50 ms;
first settled full-resolution geometry, normals and direct-light image ≤ 2 s from the settled
request, with full quality reported separately. The harness drives the page through the B14
inspection commands `atlas.space.requestCamera(pose)`, `atlas.space.editParameter(path, value)`
and the subscriptions `atlas.space.onPublish(listener)` and `atlas.space.onPresent(listener)`.

---
### Task B00: Contracts, the fake backend and the frozen protocols (spec §7.1–7.5, §9, §11.4, §16)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** 1a T00, T03, T04, T06 (landed).

**Files:**
- Create: `src/space/render/status.js`, `src/space/render/backend.js`,
  `tests/support/fake-backend.mjs`, `tests/support/fake-clock.mjs`,
  `tests/reference/performance-workload.json` (the P3 manifest)
- Modify: `tests/unit.manifest.json` (the merger appends)
- Test: `tests/unit/space-contract.test.js`, `tests/unit/fake-backend.test.js`

**Interfaces:**
- Produces (`status.js`): `POINT_STATUS = {escaped: 0, notEscaped: 1, numericalFailure: 2}`,
  `RAY_STATUS = {hit: 0, miss: 1, unresolved: 2, numericalFailure: 3}`, `UNRESOLVED_REASON =
  {none: 0, pointBudget: 1, estimateUnavailable: 2, rayStepBudget: 3, stagnation: 4}`,
  `STAGNATION = {none: 0, rayParameter: 1, fieldCoordinate: 2}`, `NORMAL_STATUS = {available: 0,
  unavailable: 1}`, `LIGHTING_FAILURE_FLAGS = {shadow: 1, ao: 2}` (zero means no recorded failure, not
  "lit"), `packLightingStatus({shadow: null | Failure, ao: null | Failure}) → u32` where `Failure =
  {status, reason, subreason}` and `status` is `RAY_STATUS.unresolved` or
  `RAY_STATUS.numericalFailure` (`null` means no recorded failure; frozen layout: bits 0–1 failure
  flags, 2–3 shadow status, 4–7 shadow reason, 8–11 shadow subreason, 12–13 AO status, 14–17 AO
  reason, 18–21 AO subreason, remaining bits zero; multiple AO failures reduce deterministically
  with numerical failure taking precedence), `unpackLightingStatus(u32)` (reconstructs both
  failures),
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
  `createPickRequest({identity, pixel, dimensions, geometryRevision, sampleIndex}) → frozen`,
  `createAdmission({epoch, jobId}) → lease` (single-use: `consume()` returns true once),
  `createJobPlan({request, operations, onAdvance}) → JobPlan` (each operation has `id`,
  `dependsOn: string[]` and one payload — `{kind: 'batch', batch}`, `{kind: 'readback',
  descriptor}` or `{kind: 'presentation', descriptor}` — whose descriptors match the first
  arguments of the corresponding backend methods; B09 constructs the operations with complete
  resource bindings) with `next() → operation | null` (reserves one ready operation so repeated
  calls cannot issue it twice; `null` means none is ready now, not necessarily exhaustion),
  `advance(operation, completion)` (resolves dependencies; adaptive subdivision from completion
  evidence preserves dependency ordering) and `exhausted()` (true only after every operation has
  completed; the scheduler alone owns elapsed-work budgets and job outcomes),
  `validatePipelineDescriptor(descriptor)` and `createPipelineSet({id, descriptors}) → frozen`
  (the descriptor schema names `pipelineId`, `kind: 'compute' | 'render'`, `sourceIds`,
  `entryPoint`, `constants`, `bindings: [{slot, type, access}]` and `uniformLayout`),
  `sampleJitter({seed, sampleIndex, pixel: [x, y]}) → {dx, dy}` (the frozen `atlas-aa-v1`
  algorithm: a 32-bit integer hash `h = mix(seed ⊕ mix(sampleIndex ⊕ mix(x ⊕ mix(y))))` with
  `mix(v) { v >>>= 0; for (let i = 0; i < 2; i++) v = Math.imul(v ^ (v >>> 16), 0x045d9f3b) >>> 0;
  return v; }` — every multiplication is modulo 2³², a WGSL implementation uses equivalent `u32`
  arithmetic, and the frozen cross-language test vectors include `mix(42) === 4147330502`; `dx =
  ((h & 0xffff) + 0.5) / 65536 − 0.5`, `dy = (((h >>> 16) & 0xffff) + 0.5) / 65536 − 0.5`; sample
  0 is the pixel centre with `{dx: 0, dy: 0}`), `BACKEND_METHODS =
  ['acquire', 'prepare', 'configureTargets', 'submitBatch', 'readback', 'present', 'release',
  'onLoss', 'currentEpoch', 'diagnostics', 'destroy']`, `assertBackend(impl)`, `BackendError
  {code: 'allocation-failed' | 'device-lost' | 'preparation-failed' | 'invalid-descriptor' |
  'stale-epoch' | 'no-admission' | 'unavailable'}`. Signatures (the annex): `acquire() →
  Promise<{epoch, identity, limits, features}>`; `prepare({epoch, pipelineSet, onProgress}) →
  Promise<{epoch, pipelineSetId, preparedPipelineIds}>`; `configureTargets({epoch, layoutId, internalSize, outputSize})
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
  tickets settle on `backend.complete(ticket | 'next' | 'oldest' | 'newest', {elapsedMs,
  timestampMs?})` or `backend.fail(ticket, error)`; `backend.lose({reason})` fires `onLoss`, settles every
  outstanding ticket `interrupted`, and the next `acquire()` advances the epoch; `readback` returns
  bytes staged with `backend.stage(handle, bytes)`; every submitting method throws
  `BackendError('no-admission')` without a consumable lease; `allocate` enforces the cap and
  records `{tracked, peak, retiring, inventory}`; `backend.log` records every call in order;
  `backend.testAdapter = {destroyDevice(), injectLoss({reason}), failNextAllocation()}` (declared
  separately from the production interface; the WebGPU backend's adapter has the same shape).
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
  member`; `sample jitter is deterministic, centred for sample 0, within half a pixel, and mix(42) is
  4147330502`; `a pipeline set validates its descriptors and rejects an unknown binding type`; `a job
  plan reserves ready operations once and remains unexhausted while dependencies are outstanding`;
  `lighting status round-trips simultaneous unresolved and numerical failures without conflating
  them`. `tests/unit/fake-backend.test.js`: `allocation beyond the cap fails before any resource
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

**Expected outputs:** the contract, fake backend and clock; no browser or GPU work.

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
representative; B11 verifies the complete product set.

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
  `VALIDATION_RECORD_FIELDS = ['recordId', 'modelId', 'evidenceClass', 'implementationHashes',
  'referenceHashes', 'matrixHash', 'profile', 'testedParameters', 'testedSamplingConditions',
  'testedDomain', 'coverage', 'inconclusive', 'limitations']` (`evidenceClass` is `'arithmetic'`,
  `'tracing'` or `'geometric'`; `testedDomain` is the exact input set or spatial sampling domain),
  `createValidationRegistry() → {register(record), lookup({modelId, evidenceClass,
  implementationHashes, profile, effective, sampling, domain}) → record | null, list()}` (a lookup
  matches only when every hash equals the record's, the effective inputs and sampling conditions
  fall inside the tested sets, and the requested `domain` matches the record's `testedDomain`
  for every evidence class — point/input sets for arithmetic, ray/condition sets for tracing,
  camera/anchor sampling domains for geometric; an omitted domain returns `null`; `list()` shows
  historical records without claiming applicability; nothing is inferred, and a local detail
  record never matches another camera patch). B02 registers no records; B08 and B10 do.
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
  appearance `{material: 'neutral', palette: 'ember', lighting: 'inspection', lightingQuality:
  'full', fog: {enabled: false}, viewMode: 'shaded'}` (`lightingQuality` is `'direct'` |
  `'full'`; the palette selects the depth and step-count ramps and is enabled in those modes;
  normal and termination colours are fixed; shaded mode keeps the neutral inspection material); sampling `{seed: 1, sequence: 'atlas-aa-v1', targetSamples: 8}`;
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
  assert.throws(() => createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, lightingQuality: 'soft' } }), e => e.code === 'invalid-value');
  assert.equal(createSpaceScene({ model: 'sphere', appearance: { ...SPACE_DEFAULTS.appearance, lightingQuality: 'direct' } }).appearance.lightingQuality, 'direct');
});
test('a validation lookup matches only the evidence class and domain it was recorded for', () => {
  const registry = createValidationRegistry();
  const hashes = { kernel: 'sha256:aaa', tracing: 'sha256:bbb' };
  const base = { modelId: 'mandelbulb', implementationHashes: hashes, referenceHashes: { generator: 'sha256:ccc' }, matrixHash: 'sha256:ddd', profile: 'surface-v1', testedParameters: { power: [8] }, testedSamplingConditions: { maxIterations: [64, 128], heights: [720] }, coverage: {}, inconclusive: [], limitations: [] };
  registry.register({ ...base, recordId: 'bulb-p8-arith', evidenceClass: 'arithmetic', testedDomain: { points: 'grid-8-1.2' } });
  registry.register({ ...base, recordId: 'bulb-p8-geo', evidenceClass: 'geometric', testedDomain: { anchor: 'A1', distances: [0.1, 0.01] } });
  registry.register({ ...base, recordId: 'bulb-p8-trace', evidenceClass: 'tracing', testedDomain: { rays: 'adversarial-v1' } });
  const sampling = { maxIterations: 128, height: 720 };
  const arith = (extra = {}) => ({ modelId: 'mandelbulb', evidenceClass: 'arithmetic', implementationHashes: hashes, profile: 'surface-v1', effective: { power: 8 }, sampling, domain: { points: 'grid-8-1.2' }, ...extra });
  assert.ok(registry.lookup(arith()));
  assert.equal(registry.lookup(arith({ effective: { power: 7 } })), null);
  assert.equal(registry.lookup(arith({ implementationHashes: { ...hashes, kernel: 'sha256:zzz' } })), null, 'a changed implementation has no record');
  assert.equal(registry.lookup(arith({ sampling: { ...sampling, maxIterations: 256 } })), null);
  assert.equal(registry.lookup(arith({ domain: { points: 'grid-16-1.2' } })), null, 'another point set is not covered');
  assert.equal(registry.lookup(arith({ domain: undefined })), null, 'an omitted domain never matches');
  assert.equal(registry.lookup({ ...arith(), evidenceClass: 'tracing', domain: { rays: 'overview-v1' } }), null, 'another tracing domain is not covered');
  assert.equal(registry.list().length, 3, 'list shows historical records without claiming applicability');
  assert.ok(registry.lookup({ modelId: 'mandelbulb', evidenceClass: 'geometric', implementationHashes: hashes, profile: 'surface-v1', effective: { power: 8 }, sampling, domain: { anchor: 'A1', distance: 0.1 } }));
  assert.equal(registry.lookup({ modelId: 'mandelbulb', evidenceClass: 'geometric', implementationHashes: hashes, profile: 'surface-v1', effective: { power: 8 }, sampling, domain: { anchor: 'A2', distance: 0.1 } }), null, 'another camera patch is not covered');
});
````

- [ ] **Step 2: Skeleton and RED** — `--expect-fail "decimal strings are parsed exactly and bounded before any rounding"`.
- [ ] **Step 3: Implement** (`compareDecimal` on normalized digit strings; `bits` through a
  `DataView`; each `validateModel` uses `requireObject` and reports the first violation with its
  path; the orientation must be a unit quaternion within 10⁻⁶).
- [ ] **Step 4: GREEN**, then `npm test`.
- [ ] **Step 5: Commit** — `"Add Space scenes: model codecs, effective parameters and validation domains (1b.1 B02)"`, then the gate.

**Expected outputs:** `SPACE_INITIAL_SCENE` serializes under 4 KB; the import-boundary test (B03)
covers `space/numerics/`.

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
- Produces (each model module): `evaluate(effective, point, {maxIterations}) → FieldResult`,
  discriminated by `kind`. Fractal models return `{kind: 'fractal', status: 'escaped' |
  'not-escaped' | 'numerical-failure', index, logR | null, estimate: {available, log2DE | null,
  reason: null | 'zero-sensitivity' | 'guard' | 'not-escaped'}, orbit: {radius, components}}`
  and `trace(effective, point, {maxIterations}) → [{components, d}]`. Calibration objects return
  `{kind: 'analytic', validity: 'valid' | 'numerical-failure', distance: number | null,
  applicability: 'exterior' | 'boundary' | 'interior'}` with no escape status or index: a boundary
  distance of zero is a valid hit; interior applicability yields `unresolved/estimate-unavailable`
  in the tracer (§11.4). `effective` is the `.effective` member of `effectiveParameters`'s result
  throughout. `menger.boxes(depth) → [{centre, half}]`.
- Produces (`registry.js`): `MODEL_RECORDS` keyed `"<id>@<version>"`: `{id, version,
  recurrenceVersion, initialization, escapeRule, supportedParameters, estimator: {category,
  semantics, derivationVersion}, enclosingVolume(effective) → {kind: 'sphere', radius} | {kind:
  'box', min, max}, evaluate, trace?}`; `getModel(id, version)`; `classifyCamera(model,
  effective, worldPosition, budget) → {status: 'exterior' | 'unresolved', detail}` (exterior iff an
  analytic field reports exterior applicability with positive distance, or a fractal orbit escapes
  with an available estimate; §13.3).

**Design assertions:** §10.4 (zero state; normalized mantissa/exponent; D ← 8D + 1 exceeds
binary32 at update 44 while the representation does not; availability separate from
classification; log-domain estimate); §11.1 (Z-polar power map; φ = 0 on the axis; zero map at
r = 0; escape after each update at |z| > 2; radius-2 bounding sphere for every power); §11.2 (full
four-component `q² + C`; iterates never projected; escape tested at initialization and after each
update against the outward bound; zero sensitivity explicit); §11.3 (sphere signed; box and
Menger exterior-only; 20 and 400 boxes). Excludes: ray marching (B10 on the GPU; the independent
marcher lives in `tests/reference/`); any import from `tests/`.

- [ ] **Step 1: Write the failing tests** (the derivative and axis-orbit values are the spec's,
  reproduced in Node during planning; the invariant-plane assertion computes its expectation from
  the effective C):

````js
test('the derivative recurrence 8D + 1 overflows binary32 at update 44 but the range-safe state does not', () => {
  let d = ZERO; for (let n = 1; n <= 44; n++) d = update(d, 8);
  assert.ok(log2(d) > 128 && Number.isFinite(log2(d)));
  let scalar = 0, first = 0; for (let n = 1; n <= 60 && !first; n++) { scalar = Math.fround(8 * scalar + 1); if (!Number.isFinite(scalar)) first = n; }
  assert.equal(first, 44);
  assert.equal(log2(ZERO), null); assert.equal(toNumber(update(ZERO, 8)), 1);
});
test('the power-8 axis orbit from (0, 0, 1) gives iterates 0, 1, 2, 257 and derivatives 0, 1, 9, 9217', () => {
  const power8 = effectiveParameters('mandelbulb', { power: '8' }).effective;
  const steps = mandelbulb.trace(power8, [0, 0, 1], { maxIterations: 3 });
  assert.deepEqual(steps.map(s => s.components[2]), [1, 2, 257]); assert.deepEqual(steps.map(s => toNumber(s.d)), [1, 9, 9217]);
  assert.deepEqual(steps.map(s => [s.components[0], s.components[1]]), [[0, 0], [0, 0], [0, 0]], 'φ = 0 on the polar axis');
});
test('quaternion Julia with q0 = 0 and C = (2, 0, 0, 0) escapes at update 2 with an unavailable estimate', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['2', '0', '0', '0'], kappa: '0' }).effective;
  const result = quaternionJulia.evaluate(effective, [0, 0, 0], { maxIterations: 128 });
  assert.equal(result.kind, 'fractal'); assert.equal(result.status, 'escaped'); assert.equal(result.index, 2);
  assert.deepEqual(result.estimate, { available: false, log2DE: null, reason: 'zero-sensitivity' });
});
test('on the invariant plane the quaternion recurrence equals the complex recurrence exactly', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0', '0'], kappa: '0' }).effective;
  const [ca, cb] = effective.C;                      // the effective binary32 values, widened to doubles
  let a = 0.3, b = -0.1; const steps = quaternionJulia.trace(effective, [0.3, -0.1, 0], { maxIterations: 20 });
  assert.equal(steps.length, 20);
  for (const step of steps) { [a, b] = [a * a - b * b + ca, 2 * a * b + cb]; assert.deepEqual(step.components, [a, b, 0, 0]); }
});
test('a nonzero κ or an off-plane C keeps all four components', () => {
  const effective = effectiveParameters('quaternion-julia', { C: ['-0.2', '0.8', '0.15', '-0.1'], kappa: '0.5' }).effective;
  const r = quaternionJulia.evaluate(effective, [0.1, 0.2, 0.3], { maxIterations: 8 });
  assert.equal(r.orbit.components.length, 4); assert.notEqual(r.orbit.components[3], 0);
});
test('calibration objects report exact distances and applicability without fabricating an escape status', () => {
  assert.deepEqual(analytic.sphere.evaluate({}, [0, 0, 2]), { kind: 'analytic', validity: 'valid', distance: 1, applicability: 'exterior' });
  assert.deepEqual(analytic.sphere.evaluate({}, [0, 0, 1]), { kind: 'analytic', validity: 'valid', distance: 0, applicability: 'boundary' });
  assert.equal(analytic.sphere.evaluate({}, [0, 0, 0.5]).applicability, 'interior');
  assert.ok(!('status' in analytic.sphere.evaluate({}, [0, 0, 2])) && !('index' in analytic.sphere.evaluate({}, [0, 0, 2])));
  assert.equal(menger.boxes(1).length, 20); assert.equal(menger.boxes(2).length, 400);
  assert.equal(menger.evaluate({ depth: 1 }, [0, 0, 0]).applicability, 'exterior', 'the centre is removed at depth 1');
  assert.equal(menger.evaluate({ depth: 1 }, [0.9, 0.9, 0.9]).applicability, 'interior');
});
test('camera classification is exterior only with positive analytic distance or an available fractal estimate', () => {
  const bulb = getModel('mandelbulb', 1); const power8 = effectiveParameters('mandelbulb', { power: '8' }).effective;
  assert.equal(classifyCamera(bulb, power8, [1.92, -1.44, 0.7], 128).status, 'exterior');
  assert.equal(classifyCamera(bulb, power8, [0, 0, 0], 128).status, 'unresolved');
  assert.equal(classifyCamera(getModel('sphere', 1), {}, [0, 0, 0.5], 128).status, 'unresolved');
  assert.equal(classifyCamera(getModel('sphere', 1), {}, [0, 0, 1], 128).status, 'unresolved', 'a boundary start is not exterior');
});
test('space models and numerics import no DOM or GPU code', async () => {
  // boundaryViolations(roots, allowed): resolves every static import and re-export specifier of every
  // file under `roots` to a canonical path (dynamic imports are violations), checks it against
  // `allowed`, then walks the permitted dependencies transitively and flags any source that
  // mentions document, navigator, window, GPUDevice or navigator.gpu.
  const allowed = [/^src\/space\/models\//, /^src\/space\/numerics\//, /^src\/shared\/scene\.js$/, /^src\/space\/render\/status\.js$/];
  const violations = await boundaryViolations(['src/space/models', 'src/space/numerics'], allowed);
  assert.deepEqual(violations, []);
  assert.ok((await boundaryViolations(['tests/fixtures/boundary/imports-renderer'], allowed)).length > 0, 'a renderer import fails the checker');
  assert.ok((await boundaryViolations(['tests/fixtures/boundary/imports-shell'], allowed)).length > 0, 'a UI import fails the checker');
  assert.ok((await boundaryViolations(['tests/fixtures/boundary/dynamic-import'], allowed)).length > 0, 'an unsupported dynamic import fails the checker');
});
````

- [ ] **Step 2: Skeleton and RED** — `--expect-fail "the derivative recurrence 8D + 1 overflows binary32 at update 44 but the range-safe state does not"`.
- [ ] **Step 3: Implement.** `derivative.js` keeps `m` in binary64 and renormalizes by halving
  or doubling with an integer exponent after every update. The fractal evaluators run in binary64
  (the product CPU evaluator; the GPU is binary32; B08 compares both against B04's references).
  Guards and escape tests in the spec's order.
- [ ] **Step 4: GREEN**, then `npm test`.
- [ ] **Step 5: Commit** — `"Add Space model evaluators, the range-safe derivative and model records (1b.1 B03)"`, then the gate.

**Expected outputs:** the evaluators and records; the import-boundary test guards the layering
from here on.

---

### Task B04: Independent references and the frozen validation matrix (spec §16.1–16.2; P1)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B00 (P1); the mathematical definitions of
spec §11, not B03's code.

**Files:**
- Create: `tests/reference/tolerance-analysis.md`, `tests/reference/f32.js`, `tests/reference/complex.js`,
  `tests/reference/quaternion.js`, `tests/reference/bulb.js`, `tests/reference/analytic.js`,
  `tests/reference/menger.js`, `tests/reference/camera.js`, `tests/reference/trace.js`,
  `tests/reference/anchors.mjs`, `tests/reference/matrix.mjs` (generator),
  `tests/reference/space-matrix.json` (generated, committed),
  `tests/reference/quaternion-usability.json` (generated, committed),
  `tests/reference/performance-predictions.json` (generated, committed; each P3 checkpoint's
  termination distribution and acceptance tolerance, with its sha256 recorded)
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
  'atlas.space-matrix', version: 1, frozenAt, generatorSha256, analysis: {path, sha256}, strata:
  [{id, role: 'mandatory' | 'diagnostic', kind, profile: 'surface-v1' | 'ladder-v1', cases: [{id,
  inputs, camera?, pixel?, expected}], floor, eligible, excluded: [{id, reason, quantity}], state:
  'frozen' | 'inconclusive'}], tolerances: {quantity: {kind, value, floor?, analysisRef}},
  anchors: [{id, model, effective, seedRay, anchor, t, convergence}]}`, the usability file
  `{rays, settings, distribution: {hit, miss, unresolved: {...}, numericalFailure}}`, and the error
  analysis `tests/reference/tolerance-analysis.md` (fused and unfused evaluation, transcendental
  error, conditioning, output quantization, per compared quantity); `matrixIsQualifiable(matrix)
  → boolean` (false while any mandatory stratum is inconclusive).

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
  committed file's sha256`; `an inconclusive mandatory stratum blocks qualification` (the
  generator refuses to mark a mandatory stratum `frozen` below its floor, and `matrixIsQualifiable`
  returns false while any mandatory stratum is inconclusive); `every tolerance names its analysis
  section`; `anchors converge within the declared rule and are recorded with both tolerances`;
  `four-component probes detect a dropped or wrong j or k component` (a reference variant with the
  k term zeroed fails the component comparison).
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "the complex and quaternion recurrences agree exactly on the invariant plane"`.
- [ ] **Step 3: Implement; write the tolerance analysis; CPU preflight** — `node
  tests/reference/matrix.mjs --preflight` prints per-stratum eligible counts against P1's floors;
  B04 stops before any GPU comparison if a mandatory floor is not substantiated, and the floor is
  revised only by a recorded plan amendment. Then generate and commit the files with their hashes.
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add independent Space references and freeze the validation matrix (1b.1 B04)"`, then the gate.

**Expected outputs:** the committed matrix, usability file and tolerance analysis; the preflight
table in the task report.

---

### Task B05: Anchored camera arithmetic and perspective (spec §5.2, §10.1; Project 0 A.1)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B02.

**Files:**
- Create: `src/space/camera.js`
- Test: `tests/unit/space-camera.test.js`

**Interfaces:**
- Consumes: `CAMERA_KIND`, `CAMERA_LIMITS` (B02). Anchors use their own bounded decimal parser
  (`parseAnchorDecimal`, up to `CAMERA_LIMITS.anchorDigits`); B02's `parseDecimal` stays limited to
  64 significant digits for parameters.
- Produces: `RECENTRE_BOUND_LOG2 = -40` (the bound is `2⁻⁴⁰ × scale`, kept in scaled or
  log form; it is never materialized as a possibly underflowing double), `anchorAdd(anchor, scale,
  local) → anchor'` (exact decimal arithmetic on `BigInt`-scaled integers), `recentre(camera) →
  {camera, driftBoundLog2} | {camera, unchanged: true, reason: 'precision-limit'}` (moves the
  local part into the anchor when `‖positionLocal‖ > 1024` or `< 2⁻¹⁰`, re-expressing `focusLocal`
  consistently; when the bound cannot be met within `anchorDigits`, the camera is returned
  unchanged with an explicit precision-limit result), `encodeOrdinaryOrigin(camera) → {highF32:
  [3], lowF32: [3], errorBoundLog2} | {unavailable: true, reason}` (the ordinary binary32
  transport: `high` is the binary32 rounding of the double–double value, `low` the binary32
  rounding of the exact remainder, computed in that order from the exact anchor, after
  representability of both the high and the residual component has been checked; the GPU field
  coordinate's source expression is `(high + t·d) + low` — a source expression, not an arithmetic
  barrier: §10.2's analysis and guards cover permitted fusion and reassociation, and the coordinate
  probes record the effective GPU input bits for the transport and stagnation cases; a represented
  origin whose remainder exceeds binary32 range is `unavailable` and the saved camera is not
  changed), `basis(camera) →
  {forward, right, up}` (rotates the canonical right (1, 0, 0), up (0, 1, 0) and forward (0, 0, −1)
  by `orientationWxyz`; a serialized orientation is reconstructed exactly, roll included; upright
  constraints apply to navigation operations, not to reconstruction), `rayDirection(camera, i, j,
  width, height, jitter = {dx: 0, dy: 0})` (A.1 pixel centres with `h = tan(fov/2)` plus the
  sample jitter), `angularPixelSize(camera, height)`, `orbit(camera, dYaw, dPitch)` (about
  `focusLocal`; upright; pitch clamped to ±89°), `pan(camera, dx, dy)`, `dolly(camera, factor)`
  (toward `focusLocal`, never crossing it), `lookAt(camera, focusLocal)` (upright),
  `setOrientation(camera, wxyz, {lockAxis: null | 'x' | 'y' | 'z'})`, `resetOrientation(camera)`
  (upright, looking at `focusLocal`), `overview(model, effective) → camera` (2.5 × the enclosing
  radius along Project 0 A.6's direction), `equalCameras(a, b)`, `flightStep(camera, {forward,
  strafe, rise, yaw, pitch}, speed, dtSeconds)` (upright: yaw about world Z, no roll),
  `reconstructHit(camera, pixel, jitter, depth, width, height) → anchoredPoint` (the pick result's
  anchored world position, from the sample's own camera, pixel and jitter — never three binary32
  values), `toLocal(camera, anchoredPoint) → [3]` (the point expressed in the camera's anchor and
  scale, for `lookAt`).

**Design assertions:** §5.2 (represented position; recentring preserves positions to a declared
bound; never one `Number` world position; world Z up; upright navigation; orientation preserved
by serialization); §10.1 (navigation precision separate from field precision; no model
translation). Isolated behind the camera contract (B02). Excludes: events and gestures (B12),
picking (B10/B12).

- [ ] **Step 1: Write the failing tests** — `anchor arithmetic preserves the represented point
  within the recentre bound` (anchor `["0.6570552405982646", "-0.49279143044869844",
  "0.23955138980145063"]`, scale 2⁻²⁰, `positionLocal` `[3000, 0, 0]`; after `recentre`, the exact
  represented point (compared with `BigInt` arithmetic) moved by less than 2⁻⁴⁰ × scale and
  `‖positionLocal‖ ≤ 1024`); `recentring beyond the anchor digit limit returns the camera unchanged
  with a precision-limit result` (a 400-digit anchor and a scale of 2⁻¹⁰⁰⁰); `the ordinary origin
  is encoded as binary32 high and low parts in the declared order` (a 30-digit anchor: `lowF32 ≠
  0`, and `highF32 + lowF32` in double equals the double–double value within 2⁻⁴⁶ relative); `an
  origin whose remainder is out of binary32 range is unavailable and the camera unchanged`; `a
  serialized orientation with roll is reconstructed exactly by basis`; `the basis matches Project 0
  A.1 for the bulb overview` (`forward` ≈ (−0.768, 0.576, −0.28) within 10⁻³); `ray directions use
  pixel centres, the vertical field of view and the sample jitter` (the centre of 1280 × 720 with
  zero jitter is `forward`; the corner matches A.1's formula; jitter `{dx: 0.5, dy: 0}` moves the
  direction by one half pixel); `orbit keeps the focus and the distance and stays upright`; `dolly
  never crosses the focus`; `flight is upright: yaw about world Z, pitch clamped, no roll`;
  `overview places the camera at 2.5 radii`; `setOrientation with a locked axis changes only the
  other two`; `reconstructHit's error is bounded by origin transport, direction rounding and depth
  quantization together` (the test bounds each term and their sum; depth spacing alone does not
  bound the total reconstruction error).
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "anchor arithmetic preserves the represented point within the recentre bound"`.
- [ ] **Step 3: Implement** (`BigInt` is Space-owned and never in `shared/`; the orientation is a
  unit quaternion `[w, x, y, z]`; the double–double split uses Dekker's exact two-sum on the
  anchor's truncated decimal expansion).
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add the anchored Space camera and perspective arithmetic (1b.1 B05)"`, then the gate.

**Expected outputs:** the camera module, the only Space code that sees anchors as decimals.

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
  Promise<{preparedPipelineIds, pipelines}>` (`pipelines` stays inside the backend) (`createComputePipelineAsync` per variant; progress `{stage, completed,
  total}`; timeout invalidates the attempt), `createPresenter({device, canvas}) → {present(
  displayTexture, {admission})}` (the fullscreen render pipeline to the preferred canvas format
  with scaling and no further transfer function); the probe pass writes `0x41544c53` ("ATLS")
  into a 1 × 1 r32uint target, read back through ordinary admission; a mismatch is
  `preparation-failed`. `backend.testAdapter = {destroyDevice(), injectLoss({reason}),
  failNextAllocation()}` (declared separately from the production interface; `destroyDevice` is a
  real loss without terminal teardown). `pipelineDescriptors.js` is **not** created here: B00 froze
  the descriptor schema; B06 prepares executable self-check pipelines (`probe`, `present`, and a
  `selfcheck-trace` that runs a fixed 64-step loop) and B08, B10 and B11 register their own
  descriptors with preparation assertions as their shaders come into existence.

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
- [ ] **Step 2: Headed checks** (`space-recovery` `requiredPasses`): `Self-check pipelines prepare
  asynchronously with progress and the probe readback is ATLS through ordinary admission`;
  `A batch completes with queue-completion timing and a 256-row banded readback returns the staged
  pattern` (the probe pass at 1024 × 600 writing a known pattern; rows read back in bands with
  aligned `bytesPerRow`); `Presentation renders the display texture to the preferred canvas format
  at the output size without a second transfer function` (a draft at half size presented upscaled;
  sampled canvas pixels equal the display texture's bytes);
  `A real device loss through the test adapter settles outstanding tickets interrupted, marks the
  backend unavailable before clients are notified, and reacquisition yields a fresh attempt and a
  new epoch`; `Configuration failure keeps the previous target set usable` (request a target set
  above the cap; the earlier set still presents); `A 4K target set allocates within the cap at
  72 bytes per pixel and is reclaimed after the last ticket retires`.
- [ ] **Step 3: Implement.** - [ ] **Step 4: GREEN** — Node first, then `flock … npm run test:space -- --group recovery`.
- [ ] **Step 5: Commit** — `"Add the WebGPU backend with tracked allocation, admission and loss mapping (1b.1 B06)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** six named headed passes; self-check preparation time recorded in the
report (B11 records the complete product set's preparation time once it exists).

---

### Task B07: The shared scheduler (spec §7.3, §7.5, §7.6, §15)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B00.

**Files:**
- Create: `src/shared/scheduler.js`
- Test: `tests/unit/scheduler.test.js`

**Interfaces:**
- Consumes: `RENDER_OUTCOMES` (1a T06); the fake clock (B00). The lease factory and the job
  plan are **injected** (`makeAdmission`, `JobPlan` instances from B00's `createJobPlan`); shared
  code imports no Space module.
- Produces: `SCHEDULER_DEFAULTS = {maxOutstanding: 2, batchTargetMs: 8, watchdogMs: 5000,
  budgets: {draftMs: 1000, settledMs: 10000, exportMs: 120000}, instrumentHz: 2}`, `PRIORITIES =
  ['navigation', 'inspection', 'refinement', 'export', 'swatch']`, `createScheduler({clock,
  makeAdmission, setTimer, clearTimer, ...SCHEDULER_DEFAULTS}) → {registerView(viewId, {hidden =
  false}), setEpoch(epoch), request(viewId, {jobId, requestId, priority, kind: 'draft' |
  'settled', plan: JobPlan}) → job` (one coalesced pending interactive request per view: a newer
  request replaces the pending one, which settles `superseded`; a running job is never replaced,
  only cancelled), `admit() → [{operation, admission}]` (at most `maxOutstanding` leases outstanding
  across all views and jobs per epoch; priority order; hidden and paused views never admitted;
  auxiliary submissions — probes, readbacks, presentation — take leases from the same pool through
  `requestAuxiliary(viewId, {jobId, priority, operation}) → {done}`), `completed(admission, {epoch, elapsedMs})` (advances the plan;
  adapts the next batch's bounds toward `batchTargetMs` from completion evidence, never above the
  hard bounds), `failed(admission, error)`, `interrupted(epoch)` (observed loss: every lease of
  that epoch settles `interrupted`), `pause(viewId)`, `resume(viewId)`, `update(viewId)` (admits
  exactly one frozen current snapshot's job, then returns the view to paused), `hidden(viewId,
  bool)`, `cancel(jobId) → {accepted: boolean, done: Promise<{outcome: 'cancelled', submitted:
  'none' | 'drained' | 'interrupted'}>}` (stops admission immediately; `done` reports `drained` only
  after completion evidence for every outstanding lease, or `interrupted` after observed loss;
  watchdog expiry proves neither), `snapshot()`, `subscribe(listener)}`. The watchdog runs on the
  injected timer while leases are outstanding, including for hidden views; it never depends on
  animation-frame ticks: expiry stops admission for that epoch and settles the job
  `budget-exceeded` with reason `watchdog`, without claiming cancellation and without releasing the
  lease's resources. Elapsed work excludes time while the view was paused or hidden; exceeding a
  budget settles `budget-exceeded` with `{continuation: 'resume' | 'lower-cost'}`; a job settles
  `completed` when its plan is exhausted.

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
  interrupted only on completion or loss evidence` (before any lease: `none` at once; with a lease
  outstanding: `done` stays pending until `completed` → `drained`, or `interrupted(epoch)` →
  `interrupted`; a watchdog expiry leaves `done` pending); `the watchdog fires on the injected
  timer while a hidden view holds a lease, settles budget-exceeded and never says cancelled`; `a
  draft exceeding 1 s of unpaused work settles budget-exceeded with a continuation`; `batch bounds
  adapt toward 8 ms from completion evidence and never exceed the hard bounds`; `a completion from
  an older epoch is ignored`; `a job settles completed when its plan is exhausted`; `shared
  scheduler imports nothing from src/space`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "at most two leases are outstanding per epoch across views, jobs and auxiliary submissions"`.
- [ ] **Step 3: Implement** (pure over the injected clock and timers).
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add the shared render scheduler (1b.1 B07)"`, then the gate.

**Expected outputs:** the scheduler; the only shared module that knows about admission.

---
### Task B08: WGSL field kernels and the GPU numerics comparison (spec §10.2–10.4, §11.1–11.3, §16.2; P1)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B03, B04, B06.

**Files:**
- Create: `scripts/shader-metadata.mjs`, `src/space/render/webgpu/shaders/fields.wgsl`,
  `src/space/render/webgpu/shaders/points.wgsl` (a list evaluator used by validation and by the
  camera classification under effective inputs: points in, `PointResult` words out),
  `src/space/render/webgpu/kernels.js` (JavaScript metadata: `KERNEL_VERSION`, the source
  hashes, the `points` and field pipeline descriptors registered with B00's schema),
  `src/space/numerics/validation-records.js`
- Modify: `tests/space.mjs` (the `numerics` group), `tests/suites.manifest.json` (append
  `space-numerics`)
- Test: `tests/unit/kernel-metadata.test.js` (`the kernel metadata hashes equal the shader
  sources on disk and the descriptors validate against the B00 schema`); headed checks. Guard
  annotations in the WGSL (`// guard:` before each `acos`, `log`, `sqrt`, `atan2`, division and
  derivative update) support source auditing only; guarded evaluation is established by the frozen
  adversarial cases and the headed readback assertions.

**Interfaces:**
- Consumes: `wgslConstants`, status words, the pipeline descriptor schema (B00); the matrix and
  usability files (B04); the evaluators (B03) for context; the backend (B06).
- Produces: WGSL `bulb_eval(p, power, cap) → PointEval`, `qjulia_eval(q0, C, bound, cap) →
  PointEval`, `sphere_distance`, `box_distance`, `menger_distance(p, depth)` (boxes from a storage
  buffer), `derivative_update` on the `(m, e)` state (`f32` mantissa, `i32` exponent),
  `log2_estimate(...)`; `points.wgsl` entry `evaluate_points`; `kernels.js`: `KERNEL_VERSION =
  'space-fields-v1'`, `KERNEL_HASHES` (sha256 of each assembled shader source including the prepended status
  constants, generated into committed metadata by `scripts/shader-metadata.mjs`, a declared Node
  generator, and verified against the sources by the unit test; the static build copies the
  metadata unchanged), `fieldPipelineDescriptors()`; validation records
  `mandelbulb@1/arithmetic/p<power>` and `quaternion-julia@1/arithmetic` (`evidenceClass:
  'arithmetic'`, `implementationHashes` from `KERNEL_HASHES`, `coverage` and `inconclusive`
  copied from the comparison results, `limitations` carrying the precision carry-forward verbatim).

**Design assertions:** §10.2 (guards before dangerous operations; no post-hoc NaN detection;
frozen tolerances); §10.3 (the G5-D plain `qsq(q) + c` formulation, independently implemented,
cited by profile and fragment hash; the product kernel separately identified by
`KERNEL_VERSION`); §10.4 in WGSL; §11.1 (φ = 0 on the axis; zero power map at r = 0); §16.2 (P1).

- [ ] **Step 1: Headed checks first** (`space-numerics` `requiredPasses`; this is GPU work, so its
  checks are written before the shaders and first run under the lock): `Bulb kernels match the
  frozen references for every power, mandatory stratum and budget` (iterates the point strata
  through `evaluate_points`; every mandatory stratum `passed`; eligible counts and worst ratios
  written to the report); `Quaternion kernels match the frozen references across off-plane C,
  nonzero κ and the boundary strata including every component`; `κ = ±4 strata report empty
  slices and initialization escapes exactly`; `The 20 adversarial point cases give their expected
  statuses on the GPU`; `Derivative range safety holds on the GPU beyond update 44`; `Validation
  records are registered only for passed mandatory strata`.
- [ ] **Step 2: Implement** the WGSL, `kernels.js` and the records; the unit test on the metadata.
- [ ] **Step 3: GREEN** — `npm test`, then `flock … npm run test:space -- --group numerics`.
- [ ] **Step 4: Commit** — `"Add the Space field kernels and validate them against the frozen matrix (1b.1 B08)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** six headed passes; the per-stratum table in the report. A mandatory stratum
that fails or is inconclusive blocks the commit: the kernel is fixed or the failure is escalated
with the evidence; tolerances and floors are never relaxed.

---

### Task B09: The pass graph — requests, keys, accumulation, publication, reports (spec §7.1–7.4, §8.1, §8.2)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B00, B02, B03, B07.

**Files:**
- Create: `src/space/render/renderer.js`, `src/space/render/profiles.js`,
  `src/space/render/keys.js`, `src/space/render-adapter.js`
- Modify (additive, with regression tests): `src/shared/render-report.js` — `EVENTS` gains
  `preparing` and `prepared` (preparation duration is `prepared − preparing`; `prepared` alone is
  elapsed time from request creation); nothing else changes; `tests/unit/render-adapter.test.js`
  gains `the preparing and prepared events are optional and Plane reports omit them` and `every
  shared timing mark survives a workspace-field extension`
- Test: `tests/unit/space-renderer.test.js`, `tests/unit/space-keys.test.js`

**Interfaces:**
- Consumes: `createScheduler` (B07); the fake backend, `createBatch`, `createPickRequest`,
  `createJobPlan`, `sampleJitter`, `createAdmission` (B00; the renderer passes `createAdmission`
  to the scheduler as `makeAdmission`); `TARGET_LAYOUT_V1`, `LIGHTING_BOUNDS_DEFAULT` (B00);
  `createRenderRequest`, `isPublishable`, `createReportBuilder`, `observed`, `UNAVAILABLE` (1a
  T06); `sceneCodec`, `effectiveParameters` (B02); `getModel` (B03, resolved per request from
  `request.sceneSnapshot.model`, never a fixed constructor argument).
- Produces (`profiles.js`): `PROFILES = {draft: {scale: 0.5, maxIterations: 64, maxSteps: 256,
  lighting: 'direct', samples: 1, budgetMs: 1000}, settled: {scale: 1, maxIterations: 'scene',
  maxSteps: 'scene', lighting: 'scene', samples: 'scene', budgetMs: 10000}}`, `resolveQuality(scene,
  profile, {width, height}) → quality` (§7.1's explicit stage settings; draft iterations
  `min(64, scene)` reported as preview quality; lighting bounds from `LIGHTING_BOUNDS_DEFAULT`,
  zero shadow and AO work for `direct`; drafts always use direct lighting; settled requests
  honour `appearance.lightingQuality`, with the first complete direct-light image followed by
  secondary-light refinement only for `'full'`; the resolved setting participates in appearance
  keys, reports and scene round-trips).
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
  pipelineSet})` (the pipeline set is passed explicitly; Node tests inject a fixture set)
  → {prepare() → Promise<{epoch, pipelineSetId, preparedPipelineIds}> (the backend's receipt,
  forwarded for B14's `verifyPrewarm`), render(request, {currentGeneration}) → job, pick(pickRequest) →
  Promise<{identity, status, depth, sample: {camera, pixel, jitter, dimensions}} | {stale: true}>,
  classifyEffectiveCamera(request) → Promise<{identity, status: 'exterior' | 'unresolved',
  detail} | {stale: true}>` (through the backend's `evaluate_points` pipeline; stale identities
  rejected), `cancel(jobId) → {accepted, done}`, `resize({width, height})`, `onPublish(listener)`,
  `onPresent(listener)`, `onReport(listener)`, `onStatus(listener)`, `destroy()}`. A job settles
  `{outcome, reason, report}`. Publication events: `{kind: 'draft' | 'settled-first' |
  'refinement', requestId, geometryRequestId, samples, pending: false}`; a status event `{pending:
  true, since}` is emitted the moment a new request supersedes the published image. The renderer
  builds a `JobPlan` per request and walks §8.1 through the scheduler (trace → normals → shade →
  accumulate → display → present), each pass as batches within the §7.5 bounds, every submission
  with its admission lease; it supplies `sampleJitter` to the trace pass before tracing, and
  normals, shading and picking use the same sample geometry; accumulation consumes completed
  samples in ascending sample-index order per pixel, so batch reordering changes scheduling, never
  floating-point summation order. **Settled sequence:** a settled request first produces
  full-resolution geometry, normals and direct lighting at the settled caps and publishes that
  complete image as `settled-first`. For `lightingQuality: 'full'`, refinement with shadows and AO
  then proceeds under a distinct appearance and accumulation identity to the requested sample
  target, and direct-light samples are never mixed into the full-light accumulation. For
  `'direct'`, accumulation continues under the direct-light identity without secondary-light
  submissions. If the requested sample target is one, the first settled publication also completes
  the job and both milestone times coincide. Completed geometry is bound to a newer
  request only after key, epoch and resource-lifetime checks; a publication requires request and
  view identity to match beyond `isPublishable`; partial tiles and mixed generations are never
  published; a pick is answered only for the current epoch, request, geometry revision, dimensions
  and sample identity, otherwise `{stale: true}`.
- Report `workspaceFields` (never a replacement `timings` object; the shared lifecycle marks stay
  intact): `rayTermination: {hit, miss, unresolved: {pointBudget, estimateUnavailable,
  rayStepBudget, stagnation: {rayParameter, fieldCoordinate}}, numericalFailure}`,
  `unavailableNormals`, `lightingFailures: {shadow, ao, both}`, `estimator: {category,
  derivationVersion, validationRecordId | null, inconclusive: []}`, `parameters: {requested,
  effective, bits}`, `samples: {target, completed}`, `milestones: {settledFirstImageMs,
  fullQualityMs}`, `allocation: {peak, outstandingBatchesMax}`, `gpuTiming: {completionMethod:
  'queue-completion', queueElapsedMs, timestampMs?}` (timestamps are optional duration evidence and
  never replace queue-completion evidence), `preview: boolean`.

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
  `accumulation order is ascending sample index whatever the completion order` (two completion
  orders; bit-identical accumulations); `every submission carries a consumed admission lease`; `a
  pick for an older geometry revision or other dimensions is stale`; `the model is resolved from
  each request`; `a direct-only one-sample settled request completes at its first image without
  secondary-light submissions`; `classifyEffectiveCamera rejects a stale identity`; `the preparing and prepared
  events are optional and Plane reports omit them`; `every shared timing mark survives a
  workspace-field extension`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "a draft replaces the published image only when complete and the retained image is marked pending meanwhile"`.
- [ ] **Step 3: Implement** the pass walk over the fake backend: the integration this task closes
  is request → `JobPlan` → scheduler leases → backend tickets → publication and report.
- [ ] **Step 4: GREEN**, `npm test` (the Plane render-adapter suite still passes with the added
  events).
- [ ] **Step 5: Commit** — `"Add the Space pass graph, profiles, keys and reports (1b.1 B09)"`, then the gate.

**Expected outputs:** the renderer and its report fields, Node-tested end to end on the fake
backend.

---

### Task B10: Tracing, normals, pick data and geometric validation (spec §11.4, §8.1 steps 2–3, §13.3; P2)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B04, B05, B08, B09.

**Files:**
- Create: `src/space/render/webgpu/shaders/trace.wgsl`,
  `src/space/render/webgpu/shaders/normals.wgsl`, `src/space/render/webgpu/passes.js`
  (bind-group layouts, named slots, uniform packing and the pipeline descriptors for the trace,
  normals and pick passes; exports `TRACING_VERSION` and `TRACING_HASHES`)
- Modify: `tests/space.mjs` (the `rendering` group is born), `tests/suites.manifest.json`
  (append `space-rendering`), `src/space/numerics/validation-records.js` (tracing and geometric
  records)
- Test: `tests/unit/tracing-metadata.test.js` (hashes equal the sources; descriptors validate);
  headed checks.

**Interfaces:**
- Consumes: `fields.wgsl`, `kernels.js` (B08); descriptors and status words (B00);
  `rayDirection`, `encodeOrdinaryOrigin`, `reconstructHit` (B05); the matrix ray strata and
  anchors (B04); the renderer's pass sequence and pick API (B09).
- Produces: WGSL entries `trace_band` (writes `depth` and the packed `status`), `normals_band`
  (central differences at ε = 0.5·τ(t); writes `normal` with availability), `pick_readback` (one
  pinned geometry sample's depth and packed status; the CPU reconstructs the anchored hit with
  `reconstructHit` from that sample's camera, pixel and jitter — no absolute world hit is collapsed
  to binary32); `passes.js`: `TRACING_VERSION = 'surface-v1/space-trace-v1'`, `TRACING_HASHES`,
  `tracePipelineDescriptors()`, `traceUniforms(request, camera, effective, jitter)` (origin
  `highF32` and `lowF32`, basis, α, the τ floor, step multiplier, caps, enclosing-interval
  parameters; the field coordinate's source expression is `(high + t·d) + low`, per B05),
  `normalsUniforms`,
  `pickUniforms`.

**Design assertions:** §11.4 verbatim (starting conditions; outward-safe enclosing volumes; the
ordered step rules; `0.9·DE`; stagnation by ray parameter or field coordinate compared in
binary32; the step cap; no minimum step; an interior start → `unresolved/estimate-unavailable`
with interior detail); §8.1 (normals with availability; an unavailable normal keeps the depth);
P2's normal rule (all required samples resolved, effective sample positions distinct, gradient
finite and nonzero); §13.3 (focus by asynchronous depth readback; a pick rejected when epoch,
request, geometry revision, dimensions or sample identity no longer match). P2 is the acceptance
protocol.

- [ ] **Step 1: Headed checks first** (`space-rendering` `requiredPasses`): `Analytic rays trace
  to the oracle depth with exact statuses`; `The detail ladders record agreement or exceedance per
  distance under ladder-v1 as diagnostic evidence`; `The 12 adversarial ray cases terminate with
  their expected status and subreason`; `Every mandatory overview stratum passes under surface-v1`
  (executes every frozen overview camera and pixel set across all powers and quaternion (C, κ)
  cells, checks eligibility and positive-hit floors and the preregistered status and depth
  criteria; empty-slice views assert misses explicitly; results recorded by stratum id); `Normals
  require distinct resolved samples and a finite
  nonzero gradient, and unavailable normals keep their depth`; `The sphere silhouette equals the
  analytic disc except within one pixel of the edge`; `The quaternion default view's termination
  distribution matches the independently predicted one within 5 points`; `A pick returns the
  pinned sample's depth and reconstructs an anchored hit, and a stale pick is rejected`.
- [ ] **Step 2: Implement** `trace.wgsl` (the §11.4 loop), `normals.wgsl`, `passes.js`, the
  geometric and tracing records (`evidenceClass: 'tracing'` for the status and adversarial
  evidence, `'geometric'` with `testedDomain` per anchor for the ladders).
- [ ] **Step 3: GREEN** — `npm test`, then under the lock (`--group rendering`).
- [ ] **Step 4: Commit** — `"Add Space tracing, normals and picking with geometric validation (1b.1 B10)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** eight headed passes; tracing and geometric validation records registered
per family with their domains.

---

### Task B11: Lighting, shadows, AO, antialiasing, accumulation, display; shared palettes (spec §8.1 steps 4–6, §8.2, §7.6)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B09, B10.

**Files:**
- Create: `src/space/render/webgpu/shaders/shade.wgsl`, `.../accumulate.wgsl`,
  `.../display.wgsl`, `src/space/render/webgpu/appearance.js`, `src/shared/palettes.js`
- Modify (mechanical): `src/plane/palettes.js` — imports `PALETTES`, `paletteBytes` and the
  interpolation from `src/shared/palettes.js` and re-exports them; keeps `colorPixel` unchanged;
  its exports and byte results stay identical
- Modify: `tests/space.mjs` (`rendering` group), `tests/suites.manifest.json`
- Test: `tests/unit/shared-palettes.test.js`; headed checks.

**Interfaces:**
- Consumes: B10's buffers and slots; `appearanceKey` (B09); `LEGEND`, `LIGHTING_FAILURE_FLAGS`,
  `packLightingStatus` (B00).
- Produces: `shade_band` (the neutral inspection light; one bounded shadow ray of ≤ 64 steps
  through the same tracer and restrained AO with five bounded samples along the normal; **lighting
  failure flags independently preserve shadow and AO failures, including simultaneous failures and
  their reasons, in `lightingStatus`; unknown visibility is never encoded as known lit or known
  occluded; a failed secondary evaluation produces a diagnostic presentation and a report count,
  and accumulation preserves the failure indication**; diagnostic modes `normals` (n·0.5 + 0.5),
  `depth` (normalized by the enclosing interval), `steps` (a cost ramp, labelled "computational
  cost"), `termination` (legend colours) — all bypassing lighting and writing `accumulationFlags`
  so diagnostic outcomes survive accumulation), `accumulate_band` (ping-pong linear sum and count
  under one accumulation key, consuming completed samples in ascending sample-index order per
  pixel), `display_band` (the sole sRGB encoding of the mean into `display`; legend colours
  written exactly in display space; a sample count below the target leaves the image complete and
  reported as partial quality, never pending); `src/space/render/webgpu/appearance.js`
  (`APPEARANCE_VERSION`, `APPEARANCE_HASHES`, `appearancePipelineDescriptors()`, and
  `verifyPrewarm({requiredPipelineIds, preparedPipelineIds}) → {ok, missing}` (identifiers only;
  GPU pipeline objects stay backend-owned), whose receipt B14 validates before enabling
  interaction). `src/shared/palettes.js`: `PALETTES`, `paletteBytes(palette,
  size)`, `interpolatePalette(palette, t)`.

**Design assertions:** §8.1 (secondary-ray failures never become confident lighting; accumulation
in linear colour; diagnostic values bypass lighting; antialiasing traces seeded jittered rays);
§8.2 (all modes except orbit colour; the legend); §7.6 (settled: shadows, restrained AO, eight
samples); §13.9 (no fog); §4.1 (palette definitions and interpolation shared; Plane's
`colorPixel` Plane-owned).

- [ ] **Step 1: Tests** — Node: `the shared palette bytes equal Plane's former output byte for
  byte` (a fixture of `paletteBytes(PALETTES[i], 1024)` captured from the pre-change module, for
  every palette); `the appearance metadata hashes equal the sources and verifyPrewarm reports a
  missing variant`. Headed (`requiredPasses`): `A settled image accumulates eight jittered samples
  and the result is bit-identical across completion orders`; `Shadowed samples never enter a
  direct-light accumulation and the first settled direct-light image precedes full quality`;
  `Diagnostic modes show the legend colours exactly for the status words`; `Secondary-ray
  failures remain visibly diagnostic and are counted`, including a simultaneous shadow and AO
  failure; `Diagnostic outcomes survive accumulation`; `The complete product pipeline set prewarms
  within the bound and its preparation time is recorded`.
- [ ] **Step 2: Implement** the three shaders, `appearance.js` and the shared palette extraction
  (the integration this task closes: a settled job runs to full quality on the real device).
- [ ] **Step 3: GREEN** (`npm test`, the Plane gate suites, then `--group rendering` under the lock).
- [ ] **Step 4: Commit** — `"Add Space lighting, antialiasing, accumulation and display; share palette definitions (1b.1 B11)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** six headed passes; the complete pipeline set's preparation time; every
existing Plane assertion unchanged and green.

---

### Task B12: Navigation, flight, gestures, focus and camera-exterior status (spec §6, §13.3, §15)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B03, B05, B09; 1a T04.

**Files:**
- Create: `src/space/gestures.js`, `src/space/flight.js`, `src/space/navigation.js`
- Test: `tests/unit/space-gestures.test.js`, `tests/unit/space-navigation.test.js`

**Interfaces:**
- Consumes: `createHistory` (1a T04) and the command `{type: 'setCamera', camera}`; camera
  functions (B05); `classifyCamera` (B03); `createPickRequest` (B00); `renderer.pick` and
  `renderer.classifyEffectiveCamera` (B09).
- Produces (`gestures.js`): `SPACE_KINDS = ['orbit-drag', 'pan-drag', 'wheel-dolly',
  'key-nudge', 'flight', 'focus']`, `createSpaceGestures({history, onTransition, stopNavigation, groupQuietMs = 200, setTimer,
  clearTimer}) → {drag(kind, camera), dragCommit(kind), dragCancel(kind),
  grouped(kind, camera), flightStart(), flightUpdate(camera), flightEnd(), focusApply(camera),
  apply(commands, kind), undo(), redo(), back(), forward(), settle()}`. Rules: one drag, one wheel
  burst, one key-repeat run and one flight run are each one camera-history entry; **`pointerup`
  commits; `pointercancel` cancels (`history.cancel`, pre-gesture pose restored); window blur
  commits the last preview and releases input; workspace deactivation commits before releasing
  capture; a flight run commits on every exit; focus starts no history gesture until a valid pick
  returns, then applies one camera-only jump — a stale, unresolved or missed pick changes nothing**;
  back and forward, undo and redo, scene replacement and workspace deactivation first call the
  injected `stopNavigation(reason)` (supplied by the workspace: stops flight and releases capture)
  and settle navigation; a tick after a gesture closed cannot update it. Nothing imports
  `src/plane/gestures.js`.
- Produces (`flight.js`): `createFlight({getCamera, setCamera, clock, onStart, onStop}) →
  {start(), toggle(), keyDown(code), keyUp(code), pointerLook(dx, dy), setSpeed(unitsPerSecond),
  speed, tick(now), stop(reason: 'escape' | 'blur' | 'hidden' | 'stop-key' | 'deactivate' |
  'history'), active}` (`onStart`/`onStop` notify the gesture owner, which opens and commits the
  `flight` gesture; no inertia; `stop` zeroes every velocity immediately; `tick` applies
  `flightStep` with the elapsed time clamped to 100 ms and does nothing when inactive).
- Produces (`navigation.js`): `bindSpaceNavigation({surface, gestures, flight, getCamera, pick,
  onStatus}) → {reset() → number of released pointers, destroy()}` (pointer orbit; pan with the
  secondary button or Shift; wheel dolly grouped; keys for nudge and the flight toggle `F`;
  `Escape` releases input and stops flight; `blur` and `visibilitychange` stop flight and commit an
  open drag; double-click requests a pick and, on a valid result after rechecking identity,
  computes `hit = reconstructHit(sample.camera, sample.pixel, sample.jitter, depth,
  sample.dimensions.width, sample.dimensions.height)` and applies `lookAt(currentCamera,
  toLocal(currentCamera, hit))` as one `focus` jump; no gesture starts for a stale result);
  `cameraStatus({cpu, effective}) → {status: 'exterior' | 'unresolved', detail}` (`cpu` from
  `classifyCamera`, `effective` from `renderer.classifyEffectiveCamera`; unresolved when either is
  unresolved or the effective result is stale; §13.3).

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
  either evaluator is unresolved or the effective result is stale`; `back, forward, undo, redo and
  scene replacement stop flight and settle an open gesture`; `a flight tick after the gesture closed
  does not move the camera`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "an orbit drag is one camera-history entry and undo does not move the camera"`.
- [ ] **Step 3: Implement** the three modules against the fake DOM (the integration this task
  closes: input events → gestures → history transitions → camera, with the renderer's pick and
  classification as injected promises).
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add Space navigation, flight, gestures and focus (1b.1 B12)"`, then the gate.

**Expected outputs:** navigation that is Node-testable without a DOM or a GPU.

---

### Task B13: Recovery orchestration (spec §7.3, §14, §15)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B06 (contract), B07, B09.

**Files:**
- Create: `src/space/recovery.js`
- Test: `tests/unit/space-recovery.test.js` (fake backend, fake clock)

**Interfaces:**
- Consumes: the renderer (B09), the scheduler (B07), `BackendError` codes and the backend's
  `onLoss`, `acquire`, `prepare`, `configureTargets`, `diagnostics` (B00).
- Produces: `RECOVERY_POLICY = {maxAutomaticRecoveries: 1}` (the allowance is consumed by an
  automatic recovery attempt and is not reset by elapsed time, successful reacquisition or
  workspace switching; a subsequent loss stops automatic retry; only an explicit user retry starts a
  new recovery episode), `createRecovery({backend, renderer, scheduler, clock, policy, onNotice})
  → {state() → {epoch, phase: 'ready' | 'preparing' | 'recovering' | 'stopped', lastLoss,
  automaticRecoveries}, onLoss(event) → 'recover' | 'stopped', retry() (the explicit action after
  `stopped`; starts a new episode), onAllocationFailure({request, failed}) → {choices:
  ['release-and-retry', 'lower-resolution', 'fewer-samples'], released}` (releases obsolete
  generations first; offers the explicit lower-cost choice; never changes the request silently),
  `onBudgetExceeded(job) → {continuation: 'resume' | 'lower-cost'}`, `cancel(jobId) → {accepted,
  done}` (from the scheduler; never "preempted"), `destroy()`}.

**Design assertions:** §14 (device loss keeps the job and snapshot; one automatic viewport
recovery; repeated loss stops automatic retry; allocation failure releases obsolete resources and
offers an explicit lower-cost choice); §15 (every row that applies to 1b.1); §7.3 (outcomes;
pause); recovery never touches the scene, undo history or camera history.

- [ ] **Step 1: Write the failing tests** — `a loss during preparation, configuration, tracing
  and readback each settles the job interrupted and triggers one automatic recovery`; `a second
  loss stops automatic recovery even after more than 60 seconds`; `an explicit retry starts a new
  episode with one automatic recovery`; `late callbacks from
  the lost epoch are ignored after recovery`; `allocation failure releases obsolete generations
  before offering a lower-cost choice and never changes the request`; `a failed configuration keeps
  the previous target set and the previous publication`; `cancellation during retirement keeps
  bytes tracked until the ticket settles`; `a watchdog budget-exceeded offers a continuation and
  does not claim cancellation`; `recovery never modifies the scene or either history`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "a loss during preparation, configuration, tracing and readback each settles the job interrupted and triggers one automatic recovery"`.
- [ ] **Step 3: Implement** the policy over the fake backend and scheduler (the integration this
  task closes: backend loss and failure events → scheduler outcomes → renderer state → the choices
  offered to the workspace).
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add Space recovery orchestration (1b.1 B13)"`, then the gate.

**Expected outputs:** the recovery policy, Node-tested for every §15 row that applies to 1b.1.

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
  {inspection, activate(token) → Promise<{outcome}>, deactivate(), destroy()}` (`inspection` =
  `window.atlas.space`: `scene`, `history`, `lastReport`, `lastPublication`, `cameraStatus`,
  `backendDiagnostics`, `whenIdle({timeoutMs})`, the harness commands `requestCamera(pose)`,
  `editParameter(path, value)`, `cancelCurrent()`, the subscriptions `onPublish(listener)`,
  `onPresent(listener)`, and the test seams `setBackend(fake)`, `injectLoss()`,
  `injectAllocationFailure()` through the backend's test adapter); `createWorkspaceSwitcher({root,
  workspaces: {plane, space}, initial: 'plane'}) → {switchTo(id) → Promise<{activeId, outcome}>,
  current(), destroy()}` (assigns a monotonically increasing activation token; calls `deactivate()`
  on the current workspace, then `activate(token)` on the next; only the latest token may commit
  visibility, focus or publication; deactivation invalidates pending activation and pick work; the
  first switch to Space acquires the device, prepares pipelines with visible status and calls
  B11's `verifyPrewarm` before enabling interaction; a failed activation shows "Space unavailable:
  <reason>" and restores Plane only if that activation is still current); the Space panel: family
  selector, parameter inputs (decimal strings; invalid input reported inline, never clamped),
  iterations and steps, view mode, the appearance controls that exist in 1b.1 (palette, view
  mode, the inspection lighting switch between direct-only and full), the flight speed control,
  the viewport indicators (`#space-estimator` "exact distance" / "heuristic, exterior-only";
  `#space-pending`; `#space-camera-status`; the preparation status), overview, orientation reset,
  the orientation control, Back/Forward, undo/redo, "Save scene" (downloads `atlas.scene` JSON via
  `encodeSceneFile`) and "Open scene" (file input → `decodeSceneFile` → `restoreScene`: one undo
  entry and one camera entry; invalid files reported without changing the scene); graphics
  diagnostics extended with the backend identity and tracked inventory.
- **Activation contract (both workspaces; both methods idempotent):** `deactivate()` first closes
  admission and invalidates pending picks and pending activation, then settles navigation
  (preserves the last previewed pose, commits an open gesture exactly once, stops flight), stops
  automation (tours, palette animation), releases pointer capture and keyboard focus, and detaches
  its global listeners; capture-loss callbacks arriving afterwards cannot cancel that commit; all
  prior history entries, the scene, undo history and camera history are preserved; Space marks its
  views hidden in the scheduler and lets submitted batches drain, never claiming preemption; an
  in-flight Plane export keeps its lease and completes under T07/T08's rules, its completion
  callbacks respecting the inactive state. `activate(token)` re-attaches listeners, resumes views,
  and issues at most one current-state request when the publication is stale (Space may then
  publish several refinements from it); it does not restart stopped tours, palette animation or
  flight; a late activation whose token is no longer current does nothing.

**Design assertions:** §13.1 (two retained investigations, one active view; a switch preserves
scene, camera, undo and camera history; hidden work pauses; captured input released; a fresh start
opens Plane without acquiring a Space device); §13.2 (viewport, parameter panel, indicators); §14
(Space scene files); §15 (first-use compilation visible; lost input one action from overview, reset
and history); §4.3 (every existing Plane assertion survives).

- [ ] **Step 1: Node tests** (fake DOM, fake backend): `a fresh start activates Plane and never
  calls the Space backend factory`; `switching deactivates the current workspace before activating
  the next and both keep their histories`; `deactivation commits the last preview exactly once and
  a later capture-loss callback cannot cancel it`; `deactivate closes admission and invalidates
  pending picks and activation`; `a late activation cannot reactivate a hidden workspace` (switch
  to Space while acquisition is pending, switch back, then let acquisition resolve: Plane stays
  active and keeps focus); `activate issues at most one request when the publication is stale and
  does not restart a stopped tour`; `opening an invalid scene file reports and changes nothing`;
  `opening a valid file is one undo entry and one camera entry`; `a backend acquisition failure
  restores Plane only when that activation is still current`; `Plane deactivate stops a tour and
  detaches its keyboard listener`.
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
- [ ] **Step 3: Implement** the workspace, the switcher, the panel and the Plane activation
  methods (the integration this task closes: the composition root owns two workspaces and one
  active view).
- [ ] **Step 4: GREEN** — `npm test`, the Plane gate suites (`browser`, `browser-hardware`,
  `navigation`, `graphics`), `space-shell`, then `flock … npm run test:space -- --group shell`.
- [ ] **Step 5: Commit** — `"Add the Space workspace, the workspace switcher and the activation contract (1b.1 B14)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** two headless passes; ten headed passes; every Plane suite green with
unchanged assertions.

---

### Task B15: Performance acceptance, the recorded investigation, the audit and the handoff (spec §16.4, §3, §16.3; P3)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B14; **1a T13** (audit scripts).

**Files:**
- Create: `tests/space-performance.mjs` (headed, `gpu: true`, `benchmark: true`; one manifest
  entry per P3 scene: `space-performance-bulb`, `space-performance-quaternion`,
  `space-performance-menger`, each `--scene <id>`), `tests/support/timing.mjs`,
  `scripts/audit-gates-1b1.mjs` (a thin wrapper over T13's ledger functions writing the 1b.1
  output path), `docs/reports/project1b/1b1-performance-<scene>.json` (one per scene, generated),
  `docs/reports/project1b/1b1-investigation.md` (the recorded investigation),
  `docs/reports/project1b/gate-ledger-1b1.json` (generated by the audit)
- Modify: `tests/suites.manifest.json`, `README.md`, `HANDOFF.md`, `AGENTS.md`, `CLAUDE.md` (exact
  replacements for the Space paths and commands; the protocol section identical in AGENTS.md and
  CLAUDE.md)
- Test: `tests/unit/timing.test.js`; the performance suites.

**Interfaces:**
- Consumes: **(1a, unlanded)** `auditLedger`, `judgeRecord`, `requiredIdsFromManifest` (T13;
  gate execution unchanged); `window.atlas.space` harness commands and subscriptions (B14); P3,
  its workload manifest (B00) and `performance-predictions.json` (B04), both by hash; the B08 and
  B10 suite reports (stratum results keyed by matrix hash and stratum id).
- Produces (`timing.mjs`): `scheduleAbsolute({clock, setTimer}, targets, callback) →
  {rearms, lateByMs[], longTasks[], invalidated}` (rounds every positive wait up to a whole
  millisecond; re-arms against absolute targets; a request issued more than 4 ms late is
  recorded as a timing anomaly, never retried silently; long tasks from a `PerformanceObserver` in
  the page). The timing helper records anomalies only; `classifyAttempt(attempt) → {state:
  'passed' | 'failed' | 'inconclusive' | 'excluded', reason}` in `tests/space-performance.mjs`
  applies P3's precedence: an established application target failure is `failed` regardless of
  timing anomalies; an attempt is `excluded` only for a demonstrated harness failure without an
  established application failure; an unexplained anomaly is `inconclusive`. `scripts/audit-gates-1b1.mjs`
  also performs the **evidence join**: it joins the B08 and B10 stratum results by matrix hash and
  stratum id and requires passing evidence for every mandatory stratum; missing,
  duplicate-conflicting, failed or inconclusive results block acceptance, and diagnostic records
  never fill a missing mandatory result.

**Design assertions:** §16.4 verbatim through P3; Project 0's timer requirements; §16.3 (every
1b.1 commit accepted by its own gate record); §3 (the 1b.1 release row demonstrated end to end).

- [ ] **Step 1: Tests** — Node: `waits are rounded up and scheduled against absolute targets`;
  `a late issuance is recorded as a timing anomaly and an established application failure stays
  failed`; `three passing trials cannot rescue an earlier application failure accompanied by late
  issuance`; `the audit wrapper writes the 1b.1 ledger path and judges every commit in the range`;
  `the evidence join blocks on a missing, conflicting or inconclusive mandatory stratum`. Headed
  (each scene suite's `requiredPasses`, one per P3 target, asserting its threshold on every valid
  passing trial, at least three within five attempts and no established application target
  failure in any attempt, with completed work, publication, readback, presenter queue completion
  and the independent visible-output checks reported separately, and coverage at the manifest's
  checkpoints within B04's prediction; every attempt and its classification stays in the report;
  insufficient valid trials are `inconclusive` and do not accept).
- [ ] **Step 2: The recorded investigation** — headed, on the physical GPU, scripted by `node
  tests/space.mjs --group shell --investigation` and written to `1b1-investigation.md` with report
  ids and termination counts: open Plane; switch to Space; explore each calibration object, the
  bulb at two powers and the quaternion set (the default and C = (−.2, .8, .15, −.1), κ = 0.5);
  orbit, dolly, focus, flight; edit a parameter and undo; cancel a settled render and render again
  successfully; save the scene file, reload the page, open the file and verify the scene hash;
  inject a device loss and recover; inject an allocation failure and choose the lower-cost option;
  move the camera inside the set and recover with overview.
- [ ] **Step 3: Documentation** — README, HANDOFF, AGENTS and CLAUDE exact replacements (Space
  source map, `npm run test:space`, the GPU lock, the headed requirement, the PR-only rule for
  `main`).
- [ ] **Step 4: Commit and gate** — `"1b.1 acceptance: performance evidence, recorded
  investigation and handoff (B15)"`, then the gate with `ATLAS_GPU_HANDOFF`.
- [ ] **Step 5: Audit** — `node scripts/audit-gates-1b1.mjs <1b.1 base> <implementation head>`
  on the exact head just gated: every 1b.1 commit `accepted`; commit the summary as
  `gate-ledger-1b1.json` (`"1b.1 gate audit"`), gate that commit, and run a final audit including
  it, retaining that final record in `artifacts/gates/` outside the commit it describes; the task
  report names the audited head explicitly.

**Expected outputs:** three performance reports with per-trial results; the investigation
document; the audit summary with every commit accepted and the audited head named.

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
| `src/space/numerics/validation-records.js` | B08, B10 | B10 appends tracing and geometric records |
| `package.json` | B01 | `test:space` once |

All other files are single-owner.

## Items for the user

Collected from the plan; none blocks drafting, each is a proposal until approved:
- (a) adopt the §9.1 WebGPU backend annex (above) into the spec by reference;
- (b) approve rev 4 §5.2/§10.1's `anchored-perspective-v1` camera representation for ordinary
  Space (this plan implements it; a "no" revises B02's camera codec, B05 and the serialization
  fixtures before implementation);
- (c) confirm the §19.2 provisional defaults: Q2 neutral inspection lighting, Q5 desktop-first,
  Q6 scene files only with Space share URLs deferred;
- (d) erratum: mark the precision badge "(1b.2)" in §13.2's indicator list, matching §3.
