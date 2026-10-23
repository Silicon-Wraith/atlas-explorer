# Project 1b.1 — Render and Recover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Space workspace in its first usable form: explore the calibration objects, the
Mandelbulb and the quaternion Julia set on WebGPU with orbit and basic flight; recover from bad
camera positions, cancellation, allocation failure and device loss; save and reopen Space scene
JSON; show the estimator category, pending marks and distinct ray statuses — with every commit
accounted for and acceptance boundaries validated under the acceptance rule beside the unchanged Plane gate, and the applicable §16.4 performance targets enforced at
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
  no full-gate code. The full-gate runner remains unchanged; acceptance auditing (`scripts/audit-gates-1b1.mjs`) and fast-evidence recording are added.

**Tech stack:** plain ES modules, WebGPU (WGSL compute, one fullscreen render pipeline for
presentation) for Space, WebGL 2 for Plane (unchanged), the Node 20 built-in test runner,
Playwright 1.59.1 with installed Chrome headed on the physical NVIDIA GPU. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-project1-design.md`. The governing baseline is the
approved rev 3.2 as amended by rev 4.2's and rev 4.3's user decisions of 2026-10-21 (rev 4.3: the
§9.1 annex gains production `allocate`): rev 4 §5.2/§10.1's anchored
camera representation is approved for ordinary Space, the §9.1 WebGPU backend annex (below) is
adopted as normative spec text, the §19.2 Q2/Q5/Q6 defaults are confirmed with gamepad exploration
added (§13.3; task B12b), and the §13.2 erratum is applied; other §21 work is outside 1b.1. Governed by
`docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md` (amendments A1, A2). Project 0's
recorded decision and limitations are binding inputs: `docs/reports/project0/platform-decision.md`
(E7 headed-only; E10 WebGPU selected by the user with the mechanical outcome inconclusive; G5 as
amended by E8/E9), `precision-interpretation.md`, and
`spikes/project0/qualification/g5d-v1.json` (read-only, in the Project 0 worktree; nothing is
imported from `spikes/`).

**Builds on 1a:** `feat/project1a` is authoritative for every interface this plan consumes.
Interfaces 1a has planned but not yet landed are cited from the 1a plan and marked **(1a,
unlanded)** (all now merged; see the rev 5.0 note after the table); this plan does not invent them (see *Dependencies on 1a*). The dependency table is
the `8eeed51` planning snapshot and is reconciled against the accepted 1a commit before B14 starts.

**Revision:** 6.0 — rev 6.0 (rev 6.0, Claude/Codex converged 2026-10-22 under the user's delegation of product direction ("you and Codex are running this… This is your show"); user informed) adds the 1b.1x "Explore and compose" plan amendment (tasks X00–X07; identities `space-compose-v1`, `space-appearance-v4`, `radial-min-v1`, `space-orbit-attributes-v1`, `space-targets-v3`) and the conditional B15 remediation tasks B15-G0/G1, and moves Mandelbox to follow 1b.3 (spec §3, §21.1; charter A3). **Rev 5.3** — rev 5.3 records two user decisions of 2026-10-22 (the pending navigation-draft publication rule, B09-F10, with spec §7.2; and the §3 definition of "demonstrated end to end" for 1b.1, carried into B15's handoff text) and the Claude/Codex agreed P3 pose-stream API (`requestCamera(pose, {phase})`, `onRequest`, `onReport`) in B14 and P3 (Codex B15 report r2). **Rev 5.2** — rev 5.2 records the user's decision of 2026-10-22 to defer the quaternion scene from required visual acceptance to diagnostic evidence and a 1b.2 item, after B11c measured 13.37% quaternion lighting-unresolved (bulb 3.82%, quaternion primary 0). **Rev 5.1** — rev 5.1 records the user's approvals of 2026-10-22 for B11c: the AO heights 4i·τ (plan) and the §11.4 quaternion-primary bounded recovery (spec). It also records the B00 `normalFieldSamples` 7 amendment and the B14 notes: the Fx4 exception, where an allocation failure or budget overrun before the first present reveals Space so its recovery UI is reachable (Codex B14 r3/r4); the test-only `env.setTimer`/`clearTimer` seams beside `env`/`toast`/`ready`; and the switcher outcomes `superseded` and `cancelled`. **Rev 5.0** — rev 5.0 (the design batch; approved by the user 2026-10-22; Codex READY run 20261022T015010Z-c512) records three user decisions of 2026-10-22 and applies accumulated Claude/Codex corrections. **User decisions, 2026-10-22:** (1) visual acceptance, a new required check before B15 on six frozen scenes (new task B11b; fractal lighting-unresolved ceiling 10%, analytic ≤1%; measurement fixes: unavailable normals counted over hits only, numerator and denominator from the same accumulation) (sources codex-B14-visual-fixes.md and claude-B14-visual-debate1.md; Codex run 20261022T010745Z-fca4); (2) lighting-only (AO/shadow) unresolved presentation is a subtle tint, never primary magenta, amending B11's presentation contract, legend tests and appearance identity, with no spec change (§8.2 allows it); (3) a one-sided normal fallback for box and Menger only, at the B10 normal rule, with B03/B08 hashes unchanged and new B10 tracing identity and record IDs. **Claude/Codex agreed corrections, no new user decision:** (4) B07b readiness wake-up text; (5) B07c `discardAuxiliary`, including that a discard is not watchdog progress; (6) new tasks T04a, B09b and B09c, and B09c's added `space-rendering` required pass; (7) B10 errata (D3/D5 interfaces, the F3 interior-detail encoding, the Menger box buffer assigned to B11, the B10-F6 and B11 AO comment fixes deferred); (8) B12 (`getPickContext()`, the "approximate hit" label, the F6 stop-reason note) and B12b (look-rate argument, gamepad allowlist); (9) the B13 → B14 recovery-facade note; (10) B14's new seams and the stale dependency-table rows; (11) B15 notes. **Rev 4.9** — rev 4.9 records the user's approval (2026-10-21) of the following on acceptance gates: full gates on merged feature candidates and on integration boundaries; tree-identical promotions take fast checks; non-promotable WIP; a mechanically checked `docs-fast` allowance; a versioned, fail-closed disposition manifest; and an enumerated retrospective transition (Claude and Codex converged; Codex runs 20261021T212923Z-663c, 20261021T214134Z-fcb2 and 20261021T214354Z-244e). **Rev 4.8** — rev 4.8 records the user's decision of 2026-10-21 on B10 S1: analytic ray depth under `surface-v1` is qualified against a sampling-aware ρ-expanded-object envelope, and relative 10⁻³ accuracy is retained under the new inspection profile `analytic-inspection-v1` (τ×0.1), with a re-freeze, new record IDs and the failed evidence preserved (Claude and Codex independent positions converged; Codex run 20261021T203032Z-7350). **Rev 4.7** — rev 4.7 applies agreed Claude/Codex corrections with no new user decision: (1) B05 — camera interface and rulings (a)–(h) as converged, and the notes for B10, B11, B12 and B14 (B14's initial bulb scene uses `overview(bulb)`; B11 drops the palette allowlist entry) (Codex runs 20261021T123602Z-6e35 and 20261021T170807Z-a7ee), including the axis-lock heading “forward azimuth minus 90° (modulo 360°)” and the Menger overview radius rule, which supersede rev 4.6's statement that these were not yet in the plan text; (2) B06 — backend plan changes PC1–PC8 (F3 sample-0 initialization owned by B11 with a B06 zero-readback test; F2 probe and `preparation-failed` owned by B09; encode-only presenter; F8 asynchronous creation errors fail their tickets; F9 caller subdivides horizontally with one lease per region; target handles caller-owned until `release()`; frozen 8×8 dispatch ABI; `destroyDevice()` loss semantics) (Codex runs 20261021T163028Z-1356, 20261021T165312Z-f480 and 20261021T170126Z-88ca). **Rev 4.6** records the user's decision of 2026-10-21 and applies agreed Claude/Codex corrections: (1) B04 — the USER-APPROVED P1 qualification amendment and sharded matrix storage (Codex B04 fix round, run 20261021T123550Z-fdcd; convergence run 20261021T114017Z-0210): overview grid, status-stable eligibility, floors 820/64, C=(2,0,0,0) non-surface-bearing, preregistered pass rules, power-7 bulb-generic floor 410→400 only, 18 raw JSON shards plus a SHA-256 index, test split into reference-points, reference-rays and reference-p3, B08/B10 index pinning; (2) B07 — scheduler window and failed-ticket rules (Codex B07 fix round, run 20261021T123558Z-2470; Claude B07 r2): 256-operation pending window, 0.5–2× band, eight-completion spacing, the B06 failed-ticket obligation, auxiliary requests for settled jobs rejected, any-lease failure fails the whole job; (3) B05 — B12 `equalCameras` note (Codex B05 fix round, run 20261021T123602Z-6e35; Claude B05 r2); the axis-lock heading sign correction (forward azimuth minus 90°) is not yet in the plan text and travels with B05's pending fix round; other B05 corrections are not applied here. **Rev 4.5** — applies three Claude/Codex corrections with no new user decision (spec rev 4.5): (1) spec §11 model-record shape, no `validation` field (Codex B03 r1 I4, run 20261021T110320Z-1652); (2) spec §7.4 identity erratum refined (Codex B01 r2 Q1, run 20261021T075810Z-2dd6); (3) B01 M5 served-source provenance wording in the `tests/space.mjs` bullet (Codex B01 r3, run 20261021T110827Z-86bb; accepted in r4). **Rev 4.4** — records rulings agreed between Claude and Codex (no new user decision; spec
rev 4.4). **B02 rulings 1–10** (Claude's B02 reviews r1/r2 and Codex run 20261021T072056Z-9083):
(1) decimal grammar with lexical significant-digit counting, explicit exponent bound, signed zero;
(2) `toDouble`/`toBinary32` reject non-finite results; (3) **AMENDED by Codex, accepted by Claude**
— `ANCHOR_LIMITS = {digits: 400, exponent: [-400,400]}` and the shared `parseAnchorDecimal`
(normalized leading position in [−400, 400]; admitted exponents span [−799, 400]), which B05
imports; `anchorAdd` returns `{unchanged: true, reason: 'precision-limit'}` rather than emit an
inadmissible anchor; B05 derives its own working-integer budget (exact products can need 2,200
places); recentre drops a decimal tail only within an aggregate `2⁻⁴⁰ × scale` bound; (4) scale,
local-vector and quaternion limits; (5) Menger default `{depth: 1}`; (6) `escapeRadius` domain and
two outward steps; (7) tagged `SUPPORTED_DOMAINS` and exact registry arrays (B03 consumes the
tags; B08/B10 own sampling vocabulary); (8) exact implementation-hash and profile matching; (9)
`PRECISION_CARRY_FORWARD_LIMITATIONS` (any amendment to the *Precision carry-forward* paragraph
updates the constant in the same commit); (10) B11 owns the palette import move and the
Space-to-Plane import-boundary assertion. **B01 joint rulings** (Codex run
20261021T073220Z-227f): (a) the annex distinguishes adapter, requested and granted limits and
requests only task-needed increases — no blanket `requiredLimits`; `maxStorageTexturesPerShaderStage`
(default 4) is the binding risk, so read-only inputs use sampled bindings; owner B06; (b) spec §7.4
erratum — identity is configuration-dependent (Chrome 151 empty; Chrome 155 vendor and architecture in both launches, device and description only with `--enable-webgpu-developer-features`; refined rev 4.5) and the code
asserts neither; (c) B01's fix round includes a developer-features isolation experiment, labelled a
portability experiment. **Rev 4.3** — applies the B00 contract rulings agreed between Claude's B00 review (r1) and
Codex (run 20261021T060324Z-4e7f), and the user's decision of 2026-10-21 "approve amending the
adopted §9.1 annex to add allocate" (spec rev 4.3). Final rulings: (1) pipeline ABI — binding
order, access sets, uniform layouts, override constants, split render entry points, `layout:
'auto'`, one generated uniform binding per nonempty layout; concrete IDs/slots belong to B06, B08,
B10, B11; (2) `advance` takes evidence only, `{epoch, elapsedMs, timestampMs?, targetMs?}`;
`onAdvance` adapts pending batches, and B07 supplies `targetMs = batchTargetMs`; (3) AO reduction —
numerical failure wins, else the lexicographic minimum unresolved `(reason, subreason)`
(`reduceLightingFailures`); (4) epoch 0 iff unavailable/destroyed; null timing for failed and
interrupted tickets; (5) target-set shape, `TARGET_LAYOUT_ID`, accumulation parity; (6)
`LIGHTING_BOUNDS_DEFAULT` is defaults and ceilings; (7) P3 — B00 freezes schema and rules, B04
materializes and hashes, B09 validates decoding, B15 consumes; (8) production `allocate` (spec
§9/§9.1); (9) `retain`/`retire` stay fake-only, with B09 resolving retained-image ownership before
B06 review. **Rev 4.2** — applies the user's decisions of 2026-10-21 (the §9.1 annex adopted, the anchored
camera approved for ordinary Space, §19.2 Q2/Q5/Q6 confirmed, the §13.2 erratum) and adds controller
(gamepad) exploration of Space at the user's request ("We should support joystick for exploration as
well."): new task B12b and B14 wiring, co-designed with Codex — **Codex READY** for the
standard-layout scope (runs 20261021T033701Z-268a and 20261021T034408Z-2f95, resuming the plan
session 20261021T012346Z-8408; an earlier attempt 20261021T033535Z-8c31 failed on service capacity
with no reply). Spec rev 4.2 Q11 (supported controller models) is answered: "Xbox style" (standard layout; §19.1). **Rev 4.1** — **Codex READY** (run 20261021T012346Z-8408, verified at commit 5914fc9) after
five rounds: joint decomposition 20261020T211454Z-d306 and reconciliation 20261020T212435Z-94a5,
then the co-author reviews 20261020T214114Z-aba8 (fifteen findings), 20261021T010758Z-8a0a (nine)
and 20261021T011813Z-1807 (three blocking, one editorial), all applied. Claude drafted; both peers
agreed the structure and reviewed the whole. The four items under *Items for the user* were decided
on 2026-10-21; the user approved starting 1b.1 on 2026-10-21 and answered Q11 ("Xbox style"). **Authors:** Claude and Codex as peers
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
  §13.2's indicator list carries "(1b.2)", erratum applied in spec rev 4.2); presets, compositions,
  discovery cards, Space export, and the fog, pause and update *controls* (1b.3, §13.9); deep zoom
  (1c); Space share links and touch Space navigation (spec §19.1 Q5/Q6, user decisions 2026-10-21).
  **Gamepad exploration is in 1b.1** (spec §13.3; user decision 2026-10-21): see B12b.
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
- **Acceptance gates (spec §16.3; rev 4.9 amendment, user-approved 2026-10-21, replacing the 1a per-commit rule from the cutover):** Rev 4.9 proposes the converged acceptance-gate amendment and enumerated retrospective classifications; the user approved it on 2026-10-21. Existing requirements remain binding until the recorded cutover.
  - **Full gate.** `npm run gate` with exactly one of `ATLAS_GPU_HANDOFF="<who, when>"` or `ATLAS_GPU_DEFERRED="<reason>"`. A deferred run is a candidate until a later `ATLAS_GPU_HANDOFF` run passes on that exact commit. Every browser or GPU run is wrapped in `flock /mnt/ml_storage/scratch/atlas-gpu.lock`. Space groups are `gpu: true`, with the same handoff and deferral semantics as `browser-hardware` and `graphics`.
  - **Fast checks.** The guarded unit runner on the commit's own manifest, plus `npm run build`. The result is recorded in the ledger.
  - **Feature candidate.** Before acceptance, the task branch merges the current integration tip into itself. The full gate then runs on that merged candidate, which is the reviewed final tip.
  - **Promotion.** Pin the reviewed candidate and integration SHAs. After the candidate’s full gate passes, stage the promotion merge. If its tree equals the candidate’s, require passing fast checks and record both parents, both tree IDs and the original gate reference. If the trees differ, review and full-gate the staged merge (`merge-gated`). Immediately before accepting promotion, verify that integration still names the pinned SHA; otherwise refresh, review and re-gate the candidate. No promotion is accepted before its required checks pass.
  - **WIP.** Intermediate commits on a task branch take fast checks and diagnostic checks. They are never promotable individually, and a later gated tip does not retroactively accept them. History rewriting is not required; rewriting invalidates evidence links to replaced SHAs. No per-commit exceptions are issued for WIP except the independently pinned P17-2 historical exception for `2f91343fe82e08a915b7de81bfd87c46baa0e35c` and R23-Q3 historical exception for `4ffda8835bee7c7a72949dffd7baf0aed352609c`, each under its own stated evidence and containment conditions. Neither exception grants passing-WIP eligibility or promotion permission.
  - **Integration gate.** The merger owns it, under the GPU lock. It is required at B14, at final B15, before any promotion to main, and at a validated checkpoint the user explicitly requests. Pausing work does not trigger a gate. An existing qualifying run may satisfy multiple checkpoints for the same validated candidate; checkpoint names alone do not require duplicate runs.
  - **Documentation allowance (`docs-fast`).** It applies only when every changed path is on a mechanically checked allowlist that is versioned in the acceptance manifest. The allowlist holds exact narrative and log paths and designated output-only audit summaries. It excludes policy manifests, exception approvals, requirement-changing specs and plans, and evidence consumed by acceptance. Generated summaries are validated against their underlying evidence. Eligibility is judged against the already-approved allowlist; a commit cannot expand its own exemption. `docs-fast` requires passing recorded fast checks; path eligibility alone is insufficient.
  - **Dispositions** (versioned acceptance manifest, fail-closed): `feature-gated`, `merge-tree-identical`, `merge-gated`, `wip`, `docs-fast`, `integration-gated`, `exception`, and the transition-only `validated-later`. An unknown classification or missing boundary evidence fails. Evidence reuse is recorded separately from `judgeRecord`.
  - **Transition.** Following user approval, the cutover is the commit merging this amendment into `feat/project1b1`. Record its full SHA and the approval provenance in the acceptance manifest. Only the four explicitly listed historical commits receive retrospective classification; all other pre-cutover requirements, records and scoped exceptions remain unchanged. The manifest records full SHAs.
    - `40fecc3194529ce26a7ee4cd03176805998eb834` → `validated-later`. Its tree is identical to `123fb965d4320f5bc81cd02807a30f6e15789176`, whose full gate passed at 21:36 UTC, after the 19:13 UTC promotion. The original chronology is preserved.
    - `85820e580471b7656b15a8e1f3cd786cd343a164`, `b46e2159171f342c227b907b366f36d313b4328e` and `9f7875cd455e0bec90e75314babad5ff52a0e600` (1b1/B10) → historical `wip`. Their eventual candidate must satisfy the promotion rule.
    - B10 commits after the cutover fall under the rule directly.
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
  bound 60 s; lighting bounds seven normal field samples, one shadow ray of ≤ 64 steps, five AO samples;
  the recentre bound 2⁻⁴⁰ × scale (`RECENTRE_BOUND_LOG2 = −40`); `MAX_PARAMETER_DIGITS = 64`;
  camera limits in B02; the neutral
  inspection light ℓ = normalize(1, 0.6, 1.5) with 0.15 + 0.85·max(0, n·ℓ) (Project 0 A.5).
- **Product decisions (spec §19.1; confirmed by the user, 2026-10-21):** Q2 — Space opens with the
  neutral inspection lighting (presets arrive in 1b.3); Q5 — desktop/laptop first (mouse, trackpad,
  keyboard); Space has no touch gestures in Project 1 and Plane's mobile behaviour is preserved; the
  user added "We should support joystick for exploration as well." — browser Gamepad API
  exploration of Space (B12b); Q6 — scene files in 1b.1, discovery cards in 1b.3, Space share URLs
  deferred beyond Project 1.
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
   hidden workspace that keeps rendering, or a held controller that resumes motion. *B12b:* `held
   controls across blur, workspace switching or controller replacement cause no resumed movement`;
   `disconnect mid-run commits the last preview and zeroes velocity`. *B12:* `a flight run commits on escape, blur and
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
| B09b | Renderer-owned obsolete geometry release and structured job error codes | Codex | B09, B07 (incl. the incorporated B07c amendment) | follow-up (before B13 integration and B14 allocation acceptance) |
| B09c | Product camera classification repair and navigation integration (B11-F1); permanent all-family CPU/GPU check | Codex | B08 (point ABI), B09, B10, B11 | follow-up (before B14 enables interaction) |
| B10 | Primary tracing, normals and pick data; geometric validation (analytic rays, adversarial rays, convergence) before decorative shading | Claude | B04, B05, B08, B09 | 4 |
| B11 | Lighting, bounded shadows and AO, diagnostic display, seeded jitter, linear accumulation, display mapping; shared palettes | Claude | B09, B10 | 5 |
| B11b | Visual fixes and visual acceptance: lighting-only tint, one-sided normal fallback (box and Menger), the five-scene acceptance check plus quaternion diagnostic evidence | Claude | B14; **must merge before B15** | follow-up (after B14) |
| B12 | Orbit, pan, dolly, orientation control, flight, Space-owned gestures, stale-safe focus, camera-exterior status | Codex | B03, B05, B09, 1a T04 | 4 |
| B12b | Controller (gamepad) exploration: snapshot decoding, dead zones and response, input state machine, one-entry runs, selection, arming and suspension (standard layout) | Codex | B12 | 5 |
| T04a | Space semantic camera equality in shared history (`cameraEqual`) | Codex | 1a T04, B05; required by B14 | follow-up (before B14) |
| B13 | Recovery orchestration: cancellation, failed allocation, stalled work, loss and repeated loss, preserving the investigation | Codex | B06 (contract), B07, B09; B09b (allocation integration) | 4 |
| B14 | **Checkpoint:** the Space workspace, the workspace switcher, the activation contract, panel, indicators, diagnostics, scene files, controller polling and status | Claude | B10–B13, B12b, T04a, B09b, B09c; **1a T12 merged** | 6 |
| B15 | Headed interaction and recovery acceptance, frozen performance acceptance, the recorded investigation, the commit audit, handoff | Codex | B14, B11b; **1a T13** | 7 |

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
| **T05** | merged | **(1a)** `src/plane/gestures.js` (`createGestureArbiter`, `DIRECT_KINDS`) — B14 preserves Plane gesture behaviour; B12 uses its own Space adapter and consumes no Plane kinds |
| **T07, T08** | merged | **(1a)** `startExport`, the export lease, `atlas.lastReport`, the adapter cadence — B14 preserves Plane export leases, outcomes and rendering cadence (these already serve Plane in 1a; Space equivalents remain deferred) |
| **T10, T09b, T11** | merged | transitive through T12 — B14 preserves persistence, reconciliation and the Discoveries control |
| **T12** | merged (947d41f) | **(1a)** `createShell(root) → {$, toast, showDialog}`, `createPlaneWorkspace({shell, discoveries, sourceId?}) → {inspection, destroy()}`, `bindPlaneNavigation(...) → {reset()}`, `createNotifier`, `installDialogs`, `src/app.js` as composition root — **hard dependency for B14**; `activate()`/`deactivate()` are **new B14 methods**, not promised T12 exports |
| **T13** | merged (4e58d0e) | **(1a)** `scripts/audit-gates.mjs`, `scripts/gate/ledger.mjs` (`auditLedger`, `judgeRecord`, `requiredIdsFromManifest`) — B15 |

**Rev 5.0 note (2026-10-22; task-B14-report.md "Dependency reconciliation", codex-B14-r1-findings.md B14-F8, Codex run 20261022T005526Z-49f5):** compared with main 9ace5fe, every row above is now merged, including T12 (947d41f) and T13 (4e58d0e); the "in flight / not started / unlanded" states and "(1a, unlanded)" annotations (here, in B14 and in B15) were stale and are updated. Consumed signatures were checked on disk and match; Amendments I–L postdate the 8eeed51 snapshot; `createHistory` has also gained `cameraEqual` (T04a).

## WebGPU backend annex (spec §9.1; adopted as normative spec text by the user, 2026-10-21)

Spec §9 defers the WebGPU specifics to an annex written after Project 0 records its configuration;
that record exists (E10, `webgpu-g5d-decision.json`, `launch-remediation.json`). This annex binds
B00, B06, B08, B10 and B11. The user adopted it on 2026-10-21; spec rev 4.2 §9.1 carries it as
normative text, identical in substance (the spec's Launch bullet spells out the profile this plan
cites from Global Constraints); any later amendment changes both together.

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
  message (failed) or the loss reason (interrupted) as `reason`. A ticket settles `failed` only when its work never entered the queue, including synchronous or encode-time failure before queue entry, or after its queue fence has resolved. A failed ticket must never represent work still running on the GPU. Timeout alone is not terminal evidence; observed loss follows the interruption path. A `device.lost.then(...)` observer is
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
  pending mark): 76 bytes per pixel, 630,374,400 B at 3840 × 2160 before staging, uniforms, model
  buffers and overlapping generations. Each resource is counted at its actual dimensions. (Project
  0 A.8's 405,995,520 B is a different layout and is not reused as the product figure.) `space-targets-v2` adds a tracked `recovery` r32uint geometry target, retained and released with the corresponding geometry. One target set totals 76 B per internal pixel, or 630,374,400 B at 3840×2160, before other allocations. The 1 GiB tracked-allocation cap is unchanged. (Rev 5.2, B11b-F9, Codex run 20261022T060300Z-5ca3; implementation consequence, no new user decision.)
- **Pipeline descriptors.** B00 freezes the pipeline descriptor schema and binding/uniform
  conventions. B06, B08, B10 and B11 freeze their concrete pipeline IDs, slots and layouts
  alongside executable shader descriptors; B06 validates preparation with executable self-check pipelines; B08, B10 and
  B11 add their descriptors and preparation assertions as their shaders come into existence; B11
  verifies complete product prewarming before B14 enables interaction. Compute dispatch geometry is frozen ABI: every compute entry point declares `@workgroup_size(8, 8, 1)`; the backend dispatches `ceil(region.width / 8) × ceil(region.height / 8)` workgroups and injects nothing; each pass carries its region (origin, size) in its own uniform layout and bounds-checks invocations.
- **Batches.** Retain the single-pass B00 Batch and its fields (identity, pipelineId, pass, region, sample, bounds, inputs/outputs, uniforms). For B15, grouping is permitted only if unchanged P3 still fails with the compatible fixes alone and uncontended diagnostic evidence supports bounded grouping as remediation. The B15 remediation record in the plan records satisfaction of this condition; settled work remains single-pass initially.
  A BatchGroup contains a common request/job/generation/sample identity and region and an ordered list of validated, prepared Batch descriptors. Each member retains its pipeline identity, bindings, uniform snapshot and work bounds. Initial scope is navigation drafts at sample zero without secondary rays: trace → normals → shade → accumulate → display, with diagnostic packing in display. Trace and normals may be omitted only under the existing compatible-geometry rules. Optional attributes and required secondary work in later 1b.1x drafts require widening the pass-order allowlist and its validation before use; they are not enabled by this initial implementation. Preserve mathematical bounds, sample order and seed. Every grouped dependency must be valid within the same region; no uncompleted cross-region dependency is assumed.
  One group is one command buffer, submission, admission lease and completion ticket. Validate every member and pack all uniforms before reserving all uniform snapshots transactionally; finish validation and reservation before consuming admission or submitting. Retain every constituent resource and uniform snapshot through the group's completion, failure or loss. Aggregate work accounts for every pass; the 8 ms adaptation target applies to the entire group. The epoch-wide limit remains two outstanding leases. A final queue fence is not evidence of individual intermediate completion.
  For navigation drafts, the validated group descriptor may additionally declare diagnostic reduction and a staging copy in the same command buffer and submission. Reduction retains the existing 8×8 compute ABI. The versioned summary is 64 B for nonrecovering families and 96 B for recovering families. It preserves exact terminal/reason counts, hit-conditioned unavailable-normal counts, coverage and invalid-data flags; recovering families additionally preserve attempts, all outcome and stop counts, and summed midpoints and encounters. Every full-decode rejection condition remains enforced. Draft reports identify aggregate evidence and never claim retained per-pixel masks. Settled/refinement work retains full diagnostic readbacks and masks.

  **B15 r16 default selection (Claude/Codex, 2026-10-23; delegated product direction):** Select (b) for product navigation drafts; retain (a) for diagnostic comparison and (d) as an available, disabled-by-default diagnostic. Variant (b) retains CPU-confirmed publication and accepted counts; it does not enable variant (d) pending publication. In variants (a), (b) and (c), workspace `onPublish` exposes only validated publications, with `publishedAt` observed when that publication is emitted after validation. In variants (b) and (c), every originally eligible draft presentation that completes successfully and passes CPU diagnostic validation emits exactly one ordinary validated publication, even when a newer navigation presentation has made it historical. Mark such notifications `historical: true`. Preserve the original request/job/generation identity, sample index, camera, quality and validated counts, and include the observed presentation-submission time, successful presenter queue-completion evidence and CPU confirmation time. `publishedAt` must not precede confirmation. Historical notifications are accounting events and do not change the current image or workspace publication state. Pure navigation supersession must not suppress them; existing cancellation, invalidation, failure and loss rules remain unchanged. Variant (a) gains no second publication, and variant (d) retains its existing pending-original and terminal-update protocol. Internal pending frame records and terminal updates in variants (b) and (c) remain available through renderer diagnostic subscriptions but are not forwarded through workspace `onPublicationUpdate`. Early or provisional presentation alone never counts as publication. Preserve diagnostic indicators, failure reports, invalidation and restoration behavior. Settled/refinement validation and presentation ordering are unchanged. Executor-3 comparisons support this engineering choice but are exploratory, with paced issuance invalidations and incomplete clock-comparable layer evidence; they establish neither P3 acceptance nor a protocol-valid performance budget pass.

  **(a), injected diagnostic CPU-gated comparison (L6a):** Creation/submission scopes, queue completion, mapping, copy-out, unmap and summary validation precede presentation. Presentation consumes a separate admission lease and completion ticket. Resources remain owned through their applicable ticket, mapping and retained-image lifetimes. This is a fixed two-operation plan; the epoch-wide cap remains two outstanding leases.

  **(b), product default L6b (GPU-gated in-submission):** Rendering, summary reduction, staging copy and presentation share one command buffer under one admission lease and completion ticket for qualified drafts. The present pass reads a freshly initialized, identity-bound summary after reduction. Missing, malformed or inconsistent evidence fails closed to an unmistakable whole-frame validation-failure display; valid numerical diagnostic pixels retain their prescribed markings. CPU summary validation, creation/submission scopes and completion checks still determine publication and job outcome. Early GPU presentation is recorded separately and never backdated as validated publication. Invalid evidence, mapping failure, execution failure or loss cannot establish a successful publication. All resources remain owned through their ticket, mapping and retained-image lifetimes.

  **(c), injected diagnostic provisional variant:** An unvalidated navigation draft may be displayed only with an unmistakable “Validating — provisional” mark visible from its first presentation. It emits a provisional-presentation event, retains the last validated image and supplies no validated publication, picking, export or accepted-cache result. Confirmation requires complete CPU diagnostic validation, successful creation/submission scopes and queue completion; the confirmation timestamp is observed then, never backdated. On rejection, cancellation, timeout or loss, invalidate the provisional result. Restore the retained image only if the rejected result still owns the displayed provisional generation; an older callback must never replace a newer image. Any GPU restoration uses ordinary admission and completion accounting, and no work is submitted to a lost epoch. Record provisional exposure and restoration costs. Provisional displays never satisfy P3 publication or completion requirements. The initial submission takes one lease/ticket; restoration takes another. A synchronous UI mark may be removed on confirmation without a GPU submission.

  **(d), injected diagnostic asynchronous-record variant (GPU gate plus append-only records; available, off by default):** Settled and refinement images retain full diagnostic readback and validation before presentation. Navigation drafts may present GPU-complete frames before CPU diagnostic confirmation. This is an explicit draft-only exception to the completed-publication prerequisite; existing identity, navigation-stream, monotonic-display-order and prohibition of partial or mixed-generation images remain in force.

  Rendering, diagnostic reduction, summary copy and presentation may share one validated command buffer, submission, admission lease and completion ticket. Per-pixel numerical markings remain mandatory. Before presentation, GPU checks enforce coverage, permitted status/reason values, recovery consistency and producer/sample identity. Frame-wide checks consume completed reduction output in the subsequent present pass. Missing or inconsistent evidence produces an unmistakable frame-level diagnostic display, never an apparently valid frame.

  In variant (d), each eligible draft presentation creates an immutable, uniquely identified frame record containing its epoch, request/sample identity, camera, quality and observed presentation-submission time, initially with `diagnosticsState: pending` and unavailable counts. Expose that original through workspace `onPublish`, and append identity-matched terminal updates through workspace `onPublicationUpdate` to `confirmed`, `failed` or `interrupted`; never overwrite the original event. Forward historical terminal updates as well as updates for the currently displayed frame. Unknown, duplicate or identity-conflicting updates remain protocol failures and must not be silently filtered. Confirmation requires successful creation/submission scopes, queue completion, summary copy-out/unmap and complete diagnostic validation. Preserve exact full-decode aggregate semantics, including recovery evidence. Confirmation does not assert that all numerical outcomes succeeded.

  Historical confirmation never republishes a superseded frame or changes a terminal job outcome. Observed loss interrupts pending records; late callbacks cannot revive them. A failed frame still displayed is visibly invalidated or replaced through ordinary admission, without replacing a newer frame. Pending diagnostic status is distinct from the navigation-pending indicator. Pending frames provide no validated picking, export or accepted-cache result.

  Summary slots and resources remain owned through their applicable ticket, mapping and retained-image lifetimes. The bounded ring applies backpressure rather than overwriting pending evidence. Initially leases remain outstanding through diagnostic resolution, preserving existing limits, budgets and watchdog rules. Draft reports identify aggregate evidence; settled/refinement masks remain unchanged.

  Constituent failure fails the whole group. Cancellation stops future admissions and drains admitted groups; timeout does not release resources; loss invalidates the epoch.
  Uniform data is snapshotted before submission; storage owned by an outstanding ticket is never
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
  **B15 r14 amendment (2026-10-23; target-set pool and supersession-safe configuration):** A released target texture whose tickets, mappings and owners have ended may enter a tracked idle pool instead of being destroyed. Pooled bytes stay in `tracked` and count against the 1 GiB cap; `reserve` evicts idle pooled textures (oldest first) before refusing an allocation, so the pool never causes an `allocation-failed`, and live, retiring or retained targets are never evicted. Reuse is keyed by layout id, output size, the complete `TARGET_LAYOUT` (the family-requirements key) and each texture's own description (name, size, format); a reused texture receives a fresh handle and the released handle stays invalid. Textures with a recorded creation failure, and fresh sets abandoned before their error scope resolved, are destroyed, never pooled. Loss and `destroy()` empty the pool, so a new epoch never reuses memory. Pooled textures are not re-zeroed: every draft and sample-zero pass writes each target texel it later reads (accumulation reads its previous sample only for sample index > 0). A request reserves targets only after supersession is decided: the renderer serializes configurations, rechecks after every wait that the request is unfinished, uncancelled and executable (a non-executable one is cancelled, as dispatch would), and an abort signal releases a superseded request's reservation synchronously while its configure is pending. At most one configuration's fresh reservation is outstanding per renderer. The 4K settled spare-geometry path reuses partial sets under the same rules. The diagnostic ladder driver obtains its targets through the same `configureTargets`, so L0–L6 share the pool.

  **B15 r15 O2 amendment (peer-converged pool residency policy):** The idle target pool has both a 44-texture entry bound and a 256 MiB (268,435,456 B) byte bound, in addition to the unchanged 1 GiB total tracked-allocation cap. Every `reclaim` trims the oldest idle entries until both idle bounds hold; idle bytes remain tracked. After a configuration has passed its error scopes and successfully resized the presenter, evict idle entries with incompatible output-size/layout/family keys. Invalidate pooling eligibility on incompatible live or retiring entries at the same time, so a late release, ticket completion, mapping completion or owner retirement cannot repopulate an obsolete key, even after a later return to that size. Never evict resources still held by a caller, ticket, mapping or retaining owner. Failed or superseded configuration does not activate its key; ordinary cap-pressure eviction remains permitted. Partial 4K reuse is retained within the idle-byte bound; verify both the spare-geometry/working-set path and 4K→720p transitions with held and late-released resources.

  **B15 r16 F3 clarification:** Ticket retirement ends the ticket hold; it does not retire an idle pooled texture from allocation accounting. Once all caller, ticket, mapping and retaining-owner holds end, an eligible texture is `pooled`, remains in `tracked`, and is excluded from `retiring`. Only destruction or eviction removes its bytes. The 4K recovery check expects the released 33,177,600 B status texture to remain tracked with zero holds while its pool key is active, then disappear on incompatible configuration. The 44-entry/256 MiB idle bounds and the 1 GiB cap apply concurrently; peak tracked allocation includes live, retiring, retained and idle pooled resources.

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

**P1 — The §16.2 matrix** (`tests/reference/space-matrix.json` indexes the raw JSON shards under `tests/reference/space-matrix/`; the index and all shards are generated deterministically by `tests/reference/matrix.mjs` and committed in B04 before any GPU comparison. Together they freeze the complete logical matrix, including failed or diagnostic rows and exclusions). Budgets 64, 128,
256 and 512 throughout the point matrix; bulb powers 2–8. Every stratum is classified in the
fixture schema as **mandatory** (arithmetic, semantic and geometric qualification) or
**diagnostic** (the detail ladders). A mandatory stratum must meet its preregistered floor and
pass its assertions; an inconclusive mandatory stratum blocks qualification and release and cannot
satisfy a `requiredPasses` entry. B04 stops before any GPU comparison when CPU preflight cannot
substantiate a mandatory floor (the floor is then revised by a recorded plan amendment, never
weakened silently). Diagnostic rows may record threshold exceedance or insufficient coverage
without claiming validation at that distance; they never substitute for mandatory qualification.

**Storage contract (user-approved 2026-10-21).** The index uses schema `atlas.space-matrix-index`, version 1, and contains `matrixTemplate`, `stratumOrder`, `shards`, and `matrixSha256`. `matrixTemplate` preserves the logical matrix's field order, with an empty `strata` array in its original position. Each shard descriptor records its relative path, kind/model grouping, byte length, SHA-256 and stratum IDs. Each shard contains a JSON array of complete strata. Assembly rejects missing, duplicate or unexpected IDs, verifies every shard's exact bytes, and fills `matrixTemplate.strata` in `stratumOrder`. Canonical assembled bytes use UTF-8 `JSON.stringify(matrix)` followed by one LF, with nonfinite values rejected. `matrixSha256` hashes these assembled bytes, excluding index-only metadata. `--check` verifies that assembly is byte-identical to serialized `generateMatrix({seed:1})`.

**User decision, 2026-10-21 (recorded; Codex B04 fix round run 20261021T123550Z-fdcd, convergence run 20261021T114017Z-0210).** The user approved the P1 qualification amendment: overview grid `(376+17u, 96+17v)` on the object footprint; eligibility is status-stability under a 10× tighter trace, with depth recorded and not screened; floors 820 eligible and 64 hits; `C=(2,0,0,0)` is non-surface-bearing; preregistered pass rules of at most 5% status disagreement and at least 95% of hits within 2τ on surface-bearing rows; and the power-7 bulb-generic floor 410→400 only. The user also approved sharded storage (18 raw JSON shards plus a SHA-256 index).


| Stratum | Frozen candidates | Floor / required assertions |
|---|---:|---|
| Bulb origin, per power × budget | 1 | 1/1 semantic case (zero power map; derivative zero state) |
| Bulb polar axis `(0, 0, ±2ʲ)`, j = −8…3, per power × budget | 24 | 24/24 semantic cases (φ = 0) |
| Bulb generic: cell centres of an 8³ grid over [−1.2, 1.2]³, per power × budget | 512 | ≥400 continuous-comparison eligible for power 7; ≥410 for powers 2–6 and 8; unchanged 512-candidate grids |
| Quaternion generic: C ∈ {(−.2,.8,0,0), (0,0,0,0), (2,0,0,0), (−.2,.8,.15,−.1), (.25,−.5,.5,−.25), (−.4,.2,−.3,.6)} × κ ∈ {0, ±0.5, ±2, ±4} × budget; an 8 × 8 × 4 cell-centre grid over [−1.5, 1.5]³ | 256 | ≥ 205 eligible; additionally ≥ 64 eligible non-initial-escape cases when \|κ\| ≤ 0.5. **κ = ±4 cells are empty-slice cells** (‖C‖ ≤ 8 ⇒ R(C) ≤ (1 + √33)/2 ≈ 3.3723 < 4): they require empty-slice, miss and initialization-escape assertions, not coverage minimums |
| Quaternion supported-boundary: the 16 corners of [−4, 4]⁴ plus its 8 face centres × 7 κ values {0, ±0.5, ±2, ±4} × 8 starts (origin, the six ±0.25 axis points, (0.25, −0.5, 0.75)) × 4 budgets | 5,376 | every admission, bound and semantic assertion; singular cases never excluded; exact requested-decimal just-outside-range rejection tests beside them |
| 32 named adversarial cases: 20 point cases (B08) and 12 ray cases (B10) | 32 | 32/32: zero sensitivity, derivative range (update 44), initialization escape, strict and equal empty-slice bounds, four-component quaternion probes that detect dropped or wrong j/k components, invalid inputs (points); analytic interior and boundary starts, origin-through, polar-axis, grazing, inside-start and both stagnation reasons (rays) |
| Sphere / rotated box reference rays (Project 0 A.4, re-expressed independently) | 625 / 651 | ≥ 500 / 521 eligible, each with ≥ 64 positive-depth hits |
| Menger depth 1 / 2 reference rays (41 × 41, oblique direction) | 1,681 each | ≥ 1,345 eligible with ≥ 64 positive-depth hits |
| Fractal overview rendering: 32×32 integer pixels `(376+17u,96+17v)`, `u,v=0…31`, per bulb power and quaternion (C,κ) cell; upright 2.5R overview camera, 60° vertical FOV, 1280×720, iteration budget 128, 512 steps | 1,024 | ≥820 status-stable reference-eligible rays; ≥64 eligible positive hits on the surface-bearing rows defined below; the overview status and depth pass rules below |
| Detail approaches: two independently prepared anchors per bulb power, two for the default quaternion and two for C = (−.2,.8,.15,−.1), κ = 0.5; distances 10⁻¹…10⁻⁸; the central 32 × 32 rays of a 1280 × 720 frame; budget 128; 512 steps | 1,024 per anchor and distance | ≥ 512 reference-eligible and ≥ 128 positive-depth hits for a depth claim; the ladder measures where agreement fails — "threshold exceeded" is evidence, not a pass; insufficient coverage is `inconclusive` |


At the upright overview camera, focus at the origin, distance `2.5R` along normalized Project 0 A.6 direction, vertical FOV 60°, and frame 1280×720, sample pixels `(i,j)=(376+17u,96+17v)`, `u,v=0…31`. Rays pass through `(i+0.5,j+0.5)`. These are the rounded cell centres of the enclosing sphere's projected bounding square: half-extent `360 tan(asin(1/2.5))/tan(π/6) = 272.13442056664366` pixels. No per-model adjustment.

A ray is reference-eligible when the binary64 surface-v1 trace and the otherwise identical trace with tolerance `0.1τ(t)` both resolve to the same status, approximate hit or miss. Record both depths and their signed difference, tighter minus primary; depth convergence does not screen overview eligibility. An eligible positive hit has primary depth greater than zero. Record every exclusion and its reason.

Every overview stratum requires at least 820 reference-eligible rays. Preregistered surface-bearing strata additionally require at least 64 eligible positive hits. Floors apply separately to each stratum, never pooled.

For overview hit-floor purposes, surface-bearing means every bulb power and quaternion cells with `|κ|≤0.5`, except `C=(2,0,0,0)`. Its three small-κ rows retain the 820 reference floor and status comparison, with positive-hit floor zero and diagnostic-only depth comparison. This classification does not assert an empty slice or require all rays to miss.

Let E be the frozen eligible-ray set and H its positive reference hits. On every overview row, GPU/reference status disagreements must satisfy `20D≤|E|`. On surface-bearing rows, at least 95% of H must return a GPU approximate hit with finite positive depth satisfying `abs(t_GPU−t_ref)≤2τ(t_ref)`; equivalently `20G≥19|H|`. A missing GPU hit counts as a failed depth comparison, not a removed denominator. Depth comparisons on non-surface-bearing rows are diagnostic. Numerical failures, including on excluded rays, are a hard failure, not absorbed into the 5% allowance. Both ordinary traces use surface-v1. These are preregistered engineering thresholds, not geometric error bounds.

Recorded amendment, approved 2026-10-21: for power 7 only, amend the continuous-comparison floor to 400 of the unchanged 512 candidates at each budget. Powers 2–6 and 8 retain 410. All coordinates, sensitivity screens, comparison tolerances, semantic requirements and exclusion reporting remain unchanged. This amendment is based on CPU preflight finding 408 eligible cases at every budget, before any GPU comparison.

Totals before adversarial cases: 15,036 bulb, 43,008 generic quaternion, 5,376 boundary
quaternion points. These are sampling budgets, not evidence that the floors are attainable; CPU
preflight establishes that. Compared quantities and proposed tolerances (quantity-specific):
point status and escape index exact; analytic and adversarial ray statuses exact; ordinary fractal overview statuses use the separately specified overview criterion; every quaternion component at escape, relative 10⁻⁴ with absolute
floor 10⁻⁶ (so that dropped or wrong j/k components are detected); ln R relative 10⁻⁴; log₂ DE
absolute 2⁻¹⁰ (compared in the log domain; an unavailable estimate must be unavailable on both
sides); analytic ray depth, under `surface-v1`, satisfies the sampling-aware envelope `max(0,t⁻)−δ ≤ t_GPU ≤ t*+δ`. Here t* is the independent oracle depth, ρ=τ(t*), δ=max(10⁻⁶,10⁻³|t*|), and t⁻ is the first forward intersection with a conservative outward expansion of the object by ρ. That expansion is a sphere of radius 1+ρ, each local box half-extent inflated by ρ, and the union of the inflated Menger leaves, computed independently by a sphere quadratic and local box slabs respectively. The expanded sphere is the exact Euclidean ρ-offset; inflated box half-extents conservatively contain the Euclidean ρ-offset, as does the union of inflated Menger leaves. Under the separately named inspection profile `analytic-inspection-v1` (τ = 0.1·τ_surface, unchanged multiplier and caps), analytic ray depth is relative 10⁻³ with floor 10⁻⁶ on the unchanged eligible rays. **User-approved amendment, 2026-10-21 (rev 4.8; B10 S1, Codex run 20261021T203032Z-7350).** This amendment is post-discovery. B04's binary64 tracer failed the original surface-v1 criterion (92/27/81/95 depth failures) because the hit rule permits a ray-depth error approaching τ/|n·d| for a planar face; curved surfaces and competing features require the independent expanded-object envelope. Cases, exclusions, floors, exact statuses and numerical-failure rules are unchanged. Rejected alternatives: a blanket 2τ, a multiplier fitted to the measured maximum, further incidence exclusions, and a local τ/cosθ. B04 updates `tests/reference/tolerance-analysis.md#depth` to separate stopping displacement from numerical allowance and document both profiles' arithmetic analysis; updates `matrix.mjs` protocol/profile metadata and affected analytic fixtures; and re-freezes the analysis, reference/generator hashes, affected shards, index-file hash and logical matrix hash. B08/B10 update their provenance pins and assign new IDs to **every record repinned to the new logical matrix**, including otherwise unchanged records. Preserve failed evidence under its original identities. Refresh affected P3 provenance in `performance-predictions.json` and `performance-workload.json`; unchanged surface-v1 semantics require no performance-target change. **Before any numerical GPU comparison,
B04 records the analysis supporting every tolerance — fused and unfused evaluation, transcendental
error, conditioning and output quantization — and the tolerances are not represented as derived
until that analysis exists.** Sensitivity screen (generic point strata only): for each candidate,
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

**P3 — Performance workload** (B15): B00 freezes `performance-workload.json`'s schema and
workload rules (`tests/reference/performance-workload.json`). B04 independently materializes the
scenes, request poses and checkpoint records without importing `src/`, generates
`performance-predictions.json`, and records both SHA-256 hashes. The prediction hash is stored in
the manifest; the final manifest hash is recorded externally, never embedded in the bytes it
hashes. B04 empties `unresolved` and sets `readyForAcceptance` when materialization is complete.
B09 verifies decoding through the Space codec and validates all cameras. B15 consumes both
artifacts by hash.

Output is 1280 × 720. Scenes are bulb power `"8"`; quaternion `C = ["-0.2","0.8","0","0"]`,
`kappa = "0"`; and Menger depth 2. All use 128 iterations, 512 steps, full lighting, eight samples
and `atlas-aa-v1` seed 1. The harness uses no randomness.

Each scene starts at an upright overview camera, focus `[0,0,0]`, distance 2.5 times its enclosing
radius along normalized Project 0 A.6 direction. Orbit yaw is about world Z at 0.5 rad/s for 30
seconds. Requests occur at `16k` ms for `k = 0…1874`. The last issued pose is therefore at 29,984
ms and yaw 14.992 radians.

Record the automatic settled request after that last pose, timing from request creation. Record
first direct-light publication and full quality separately; complete full quality before starting
interaction. The interaction phase issues 400 requests at `60j` ms for `j = 1…400`, with yaw
`14.992 + 0.5 × 60j / 1000`, continuing from the last issued orbit pose.

At the final interaction pose, issue 40 stress edits at `250j` ms, `j = 0…39`, over a ten-second
window. Even indices use the alternate value and odd indices restore the base: bulb `"7"`/`"8"`;
quaternion kappa `"0.5"`/`"0"`; Menger 1/2. Every edit changes state; the final edit restores the
base.

**B15 P17-1 instrumentation clarification:** Record the scheduling mode, configured lead time and enabled instrumentation in each attempt. Judged measurements disable the continuous MessageChannel stall probe and main-thread busy-spin scheduling. Diagnostic early-wake runs additionally report observed spin time. Preserve every attempt, its actual issuance timestamps and its classification. The 4 ms anomaly threshold, workload targets, trial counts and application-failure precedence remain unchanged. P21-1 explicitly relaxes P3 attempt timing validity through policy `atlas.p3-timing-budget-v1`; it does not change the scheduler, absolute input targets, request-to-publication clocks or application metrics. This allowance applies regardless of anomaly cause and does not establish that issuance error cannot affect a measured result. All publications, completions and latency observations remain in their applicable metrics; tolerated anomalies authorize neither sample removal nor timestamp correction. A proposed replacement acceptance scheduler requires a recorded protocol amendment and validation of its effect on application scheduling; fewer late callbacks alone do not establish equivalence.

Every counted timed publication requires successful completion evidence, matching original request identity and quality, and complete internal pixel coverage. In variants (a), (b) and (c), count an ordinary validated workspace publication once, at its observed `publishedAt`; no separate diagnostic update is required. Include validated historical notifications from variants (b) and (c). For those draft publications, reject duplicate original request/job/generation identity and sample-index combinations as protocol failures. Count only publications emitted within the measurement window; neither presentation-submission time nor an earlier diagnostic confirmation may backdate a later notification into that window. Raw internal frame records and updates are not additional publications. Preserve variant (d)’s strict pairing and rejection of unknown, duplicate or identity-conflicting updates. In variant (d), a pending original exposed through workspace `onPublish` requires exactly one matching confirmed diagnostic update before it can count. Its acceptance time is the later of presentation submission and observed diagnostic confirmation. Unknown, duplicate or identity-conflicting updates remain failures. Internal gated or provisional frame records are not additional counted publications. Pending, failed or interrupted records never count; confirmation after a measurement window does not add a publication to that window retroactively. Historical confirmations may count only for presentations originally eligible under the publication rules. Record early presentation and confirmation latency separately. Preserve all failed and unresolved evidence and existing failure-classification precedence. Target values, workloads, quality, trial counts and settled-image semantics remain unchanged. Replay orbit checkpoint poses `k ∈ {0,625,1250,1874}` outside the
timed workload at draft settings, plus the first settled direct-light image at sample zero.
Compare their `rayTermination` counts with B04 predictions. Selected timed requests may be
superseded. Take each scene's settled-first replay screenshot outside timed work. Missing or
failed coverage remains non-accepting.

Trial one follows a fresh page load, preparation and the complete recorded workload. Subsequent
trials use the same page without reload. Restore the frozen base scene and overview pose and drain
outstanding work outside timed phases. Discard no warm-up trial. Preserve the existing trial
counts, targets, timing rules and classification precedence.

Trials, timing and targets: **one
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
for a demonstrated harness failure without an established application failure. Under P3 timing policy `atlas.p3-timing-budget-v1`, an attempt is timing-eligible only if the complete frozen input schedule is recorded, no input is issued early, no issuance is more than 8 ms late, and at most three issuances are more than 4 ms late. Count anomalies across the entire attempt’s orbit, interaction and stress phases together; do not reset the allowance at phase boundaries. Compare unrounded observed lateness without an added numerical tolerance: exactly 4 ms is not an anomaly, exactly 8 ms is within the maximum, and exactly three anomalies are within the allowance. Every issuance more than 4 ms late remains a recorded timing anomaly, including its phase, input index, target and actual issuance timestamp. Anomalies within the allowance are tolerated, never relabelled explained or environmental. Missing, duplicate, malformed or early input observations do not qualify for the allowance. Timing ineligibility makes the attempt `inconclusive`, except where the preceding application-failure or demonstrated-harness-failure rule determines its classification. Timing eligibility alone does not establish a passing attempt. A scene suite
accepts only with at least three valid passing trials within five attempts and no established
application target failure in any attempt; every attempt and its classification evidence stays
in the report; the timing helper records anomalies and the trial classifier determines their
disposition; Project 0 timer rules; no single
average-FPS figure. Targets: ≥ 30 completed drafts/s with consecutive-interval p95 ≤ 50 ms;
interaction p95 ≤ 100 ms; stress replacement ≤ 250 ms; no application main-thread task over 50 ms;
first settled full-resolution geometry, normals and direct-light image ≤ 2 s from the settled
request, with full quality reported separately. The harness drives the page through the B14 inspection commands `atlas.space.requestCamera(pose, {phase})` and `atlas.space.editParameter(path, value)`, and the subscriptions `atlas.space.onRequest(listener)`, `atlas.space.onPublish(listener)`, `atlas.space.onPresent(listener)`, and `atlas.space.onReport(listener)`. At the frozen orbit times it issues 1,874 `preview` poses followed by one `commit` pose; the commit closes the stream and requests the automatic settled render. The interaction phase likewise uses previews followed by a commit at its last frozen pose. Request-to-publication timing starts at the matching `onRequest.createdAt`, with the original request identity retained in every counted publication, including a pending navigation draft. Input issuance, request creation, completion, publication, readback and presenter queue completion remain distinct observations. All frozen poses, intervals, scene settings, checkpoint tolerances, target values, trial counts and classification precedence remain unchanged. (Claude/Codex agreed, rev 5.3.)

**P21-1 provenance and prospective use:** This is a post-discovery acceptance-policy amendment under Claude/Codex’s delegated product direction, informed by the observed scheduling anomalies. The numerical allowance is an engineering choice, not a demonstrated environmental correction or a statistical validation result. Freeze the policy before new judged runs. Preserve previous evidence and its original classifications; do not retrospectively promote those attempts or pool attempts from different timing policies. Fresh acceptance requires all existing non-timing prerequisites and targets, at least three passing trials within five attempts per scene, and no established application failure. Control and smoke runs remain separate evidence and do not acquire P3 acceptance status. Peer decision: Claude/Codex, 2026-10-23, under the user’s delegation; the user is informed. This tolerance can change a threshold verdict. This amendment asserts no unavoidable timer floor, no exclusion of `nvidia-smi` as a cause, and no claim about the effect of changing sessions.

---
### Task B00: Contracts, the fake backend and the frozen protocols (spec §7.1–7.5, §9, §11.4, §16)

**B15 r10 amendment (2026-10-22):** Add `createBatchGroup({identity, region, sample, passes}) → frozen BatchGroup`; `passes` contains the member Batch descriptors. `submitBatch` and JobPlan batch operations accept either descriptor form. Test grouped-versus-ungrouped display and diagnostic equivalence, atomic validation, resource retention, two-lease accounting, cancellation and loss. Qualified navigation drafts use whole-frame groups under spec §7.5, without fence-driven tile learning or dynamic draft windows. Qualification covers family, dimensions and numerical work bounds; other drafts retain bounded subdivision. Settled execution remains single-pass with its existing tiling, adaptation and cancellation granularity.

**B15 REC-G amendment (2026-10-22, Claude/Codex converged):** The optional `BatchGroup.draft` fields are `{mode, summary, producerToken, recovery, display}`. The allowed modes are `compute`, `gated`, `provisional`, `async`, plus diagnostic-only `audit` and `unchecked`; only whole-frame sample-zero groups may use them. A summary group appends `reduce` after display, binds the display packet and summary handles consistently, and snapshots its producer token in the display/reducer uniforms. Tokens are positive, never reused within a renderer lifetime, and checked against the mapping's full identity. The backend copies 64/96 bytes in the same submission; combined presenters consume the completed summary in a later render pass. Combined tickets additionally report `presentationSubmittedAt` (null if rejected before queue entry); rejected pre-queue work creates no frame record. Full decoding may receive the same producer token for equivalence; legacy packet decoding retains its constant marker. Product `createSpaceRenderer` accepts only L6 variants; lower rungs run through the diagnostic browser driver. `env.draftExecution` is an injected test seam, never a product control. `onPublicationUpdate` exposes append-only diagnostic updates to workspace consumers.

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
  failures), `reduceLightingFailures(failures) → Failure | null` (any numerical failure reduces to
  `{status: numericalFailure, reason: none, subreason: none}`; otherwise the lexicographic minimum
  unresolved `(reason, subreason)`; no failures returns `null`),
  `ESTIMATOR_CATEGORIES = ['exact-distance', 'heuristic']`, `packStatus({status, reason,
  subreason, steps}) → u32` (bits 0–3, 4–7, 8–11, 12–31), `unpackStatus(u32)`, `LEGEND =
  {unresolved: [1, 0, 1], numericalFailure: [1, 0, 0], unavailableNormal: [0.5, 0.5, 0.5]}`,
  `STATUS_LABELS` (the §11.4 names verbatim), `wgslConstants() → string` (the same enums as WGSL
  `const` declarations, so kernels and JavaScript share one source).
- Produces (`backend.js`): `PASSES = ['probe', 'trace', 'normals', 'shade', 'accumulate',
  'display']`, `TARGET_LAYOUT` (the annex table: name → `{format, bytesPerTexel, count}`),
  `TRACKED_ALLOCATION_CAP = 2 ** 30`, `LIGHTING_BOUNDS_DEFAULT = {normalFieldSamples: 7,
  shadowRays: 1, shadowSteps: 64, aoSamples: 5}` (both the settled defaults and the 1b.1 ceilings;
  direct lighting retains `normalFieldSamples: 7`, and only `shadowRays`, `shadowSteps` and
  `aoSamples` become zero; raising a ceiling requires a recorded plan amendment. Rev 5.1 records the accounting consequence of the approved box/Menger fallback: six endpoints plus at most one lazily evaluated centre. Other families retain six-sample central differences. Shadow and AO ceilings are unchanged.), `createBatch({identity: {requestId, jobId,
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
  `advance(operation, {epoch, elapsedMs, timestampMs?, targetMs?})` (requires current-epoch
  successful completion evidence; durations finite and nonnegative, a supplied `targetMs` positive.
  Failed/interrupted work never advances. `onAdvance(operation, completion, pendingOperations)`
  returns replacement pending operations or `undefined`. Reserved/completed operations cannot
  change; every pending ID and its dependency barriers must survive replacement. New operations may
  depend on reserved operations.) and `exhausted()` (true only after every operation has
  completed; the scheduler alone owns elapsed-work budgets and job outcomes),
  `validatePipelineDescriptor(descriptor)` and `createPipelineSet({id, descriptors}) → frozen`
  (the descriptor schema names `pipelineId`, `kind: 'compute' | 'render'`, `sourceIds`,
  `entryPoint` for `kind: 'compute'`; `vertexEntryPoint` and `fragmentEntryPoint` instead for
  `kind: 'render'`; `constants`, `bindings: [{slot, type, access}]` and `uniformLayout`;
  `bindings[i]` denotes `@group(0) @binding(i)`; `slot` is the WGSL variable name. Access sets are:
  uniform-buffer/read; storage-buffer/read or read-write; texture/read; storage-texture/read, write
  or read-write; sampler/read. Read-write bindings use the same handle in both maps.
  `uniformLayout` is `{byteLength, fields: [{name,type,offset}]}`; byte length is divisible by 16.
  Supported size/alignment pairs are scalar 4/4, vec2 8/8, vec3 12/16, vec4 16/16 and
  mat4x4<f32> 64/16. Arrays and mat3x3 are unsupported in 1b.1. Matrices use column-major field
  order. A nonempty layout requires exactly one generated uniform-buffer binding supplied from the
  exact `uniforms` field record, without a handle slot. Empty layouts permit explicitly allocated
  uniform input handles. Constants name WGSL overrides. B06 uses `layout: 'auto'` and creates bind
  groups from each prepared pipeline's layout),
  `sampleJitter({seed, sampleIndex, pixel: [x, y]}) → {dx, dy}` (the frozen `atlas-aa-v1`
  algorithm: a 32-bit integer hash `h = mix(seed ⊕ mix(sampleIndex ⊕ mix(x ⊕ mix(y))))` with
  `mix(v) { v >>>= 0; for (let i = 0; i < 2; i++) v = Math.imul(v ^ (v >>> 16), 0x045d9f3b) >>> 0;
  return v; }` — every multiplication is modulo 2³², a WGSL implementation uses equivalent `u32`
  arithmetic, and the frozen cross-language test vectors include `mix(42) === 4147330502`; `dx =
  ((h & 0xffff) + 0.5) / 65536 − 0.5`, `dy = (((h >>> 16) & 0xffff) + 0.5) / 65536 − 0.5`; sample
  0 is the pixel centre with `{dx: 0, dy: 0}`), `BACKEND_METHODS =
  ['acquire', 'prepare', 'allocate', 'configureTargets', 'submitBatch', 'readback', 'present', 'release',
  'onLoss', 'currentEpoch', 'diagnostics', 'destroy']`, `assertBackend(impl)`, `BackendError
  {code: 'allocation-failed' | 'device-lost' | 'preparation-failed' | 'invalid-descriptor' |
  'stale-epoch' | 'no-admission' | 'unavailable'}`. Signatures (the annex): `acquire() →
  Promise<{epoch, identity, limits, features}>`; `prepare({epoch, pipelineSet, onProgress}) →
  Promise<{epoch, pipelineSetId, preparedPipelineIds}>`; `allocate({name, bytes, usage: 'storage' |
  'uniform', data?: Uint8Array}) → handle`, with the allocation semantics in the amended §9.1
  Allocator bullet; `configureTargets({epoch, layoutId, internalSize, outputSize})
  → Promise<TargetSet>` (`{epoch, layoutId, internalSize, outputSize, handles, descriptions}`;
  `handles[name]` an opaque handle and `descriptions[name]` `{name, width, height, format,
  bytesPerTexel, bytes}` at actual internal dimensions; `layoutId` is the exported
  `TARGET_LAYOUT_ID = 'space-targets-v2'`; `handles.accumulation` and `descriptions.accumulation`
  are two-element arrays: for sample index `s`, read `handles.accumulation[s & 1]` and write
  `handles.accumulation[(s + 1) & 1]`; for every accumulation identity, sample 0 initializes the accumulated sum, count and diagnostic propagation from the current sample, without reading previous accumulation values or previous-identity diagnostic flags; physical clearing of the previous accumulation texture is unnecessary; samples after zero use the ping-pong parity above. B09 owns identity changes, sample indices and dependencies; B11 owns this initialization in its shaders (including stale `accumulationFlags` across an appearance reset); B06 owns resource initialization (fresh targets read zero) and lifetime); `submitBatch(batch, {admission})
  → Ticket`; `readback({identity, source, region, fields}, {admission}) → ReadbackTicket`;
  `present({identity, display}, {admission}) → Ticket`; `release(handle)`; `onLoss(callback) →
  unsubscribe`; `currentEpoch() → integer`; `diagnostics() → {state, epoch, tracked, peak,
  retiring, inventory}`; `destroy()`. `Ticket = {id, identity, submittedAt, done: Promise<{outcome:
  'completed' | 'interrupted' | 'failed', reason, queueCompletedAt, timing: {method:
  'queue-completion', elapsedMs, timestampMs?}}>}` (`currentEpoch()` is zero iff the backend is
  unavailable or destroyed; successful acquisitions receive increasing positive epochs; completed
  tickets carry observed completion timing; failed/interrupted tickets have `queueCompletedAt:
  null`, `elapsedMs: null` and no timestamp duration; a failure's `reason` is the error message,
  an interruption's the loss reason); `ReadbackTicket` adds `result:
  Promise<{identity, region, fields, data}>`.
- Produces (`fake-backend.mjs`): `createFakeBackend({clock, cap = TRACKED_ALLOCATION_CAP,
  limits, failPrepareAt = null}) → backend` implementing every method deterministically:
  `prepare` resolves on `backend.finishPrepare()` (or rejects on `backend.failPrepare(stage)`);
  tickets settle on `backend.complete(ticket | 'next' | 'oldest' | 'newest', {elapsedMs,
  timestampMs?})` or `backend.fail(ticket, error)`; `backend.lose({reason})` fires `onLoss`, settles every
  outstanding ticket `interrupted`, and the next `acquire()` advances the epoch; `readback` returns
  bytes staged with `backend.stage(handle, bytes)`; every submitting method throws
  `BackendError('no-admission')` without a consumable lease; `allocate` enforces the cap and
  records `{tracked, peak, retiring, inventory}`; `configureTargets` never releases earlier sets (target handles stay caller-owned until `release()`); `backend.log` records every call in order;
  `retain`/`retire` remain fake-only test controls (B09 resolves retained-image ownership before
  B06 review if production methods are needed);
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
  4147330502`; `a pipeline set validates its descriptors and rejects an unknown binding type`;
  `a model buffer allocated with initial data reads back its bytes and is counted` (rev 4.3, §9.1 allocate); `a job
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
  `shell`); each group launches installed Chrome with the complete Project 0 profile, tests the gate-owned committed source checkout: the unchanged gate serves the repository root on its own port and verifies the build in its separate `build` stage. A standalone run adopts the server answering at `ATLAS_URL` or starts and owns one from its checkout, records which, and establishes provenance by comparing every tracked application file (`index.html`, `src/`, `assets/`) byte for byte with what the server serves, recording the commit and dirty state; a mismatch fails the run before any browser launches. An arbitrary responding server, or a single matching module, never establishes provenance. Each group records `{name, details}` passes to its own report file with the requested
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

**Fix round 1 (rev 4.4, joint ruling (c), Codex run 20261021T073220Z-227f):** B01's fix round
includes a separately reported developer-features isolation experiment: two fresh-profile
launches on the same host, build, driver and source, under the GPU lock and handoff, differing
only in `--enable-webgpu-developer-features`; each records effective arguments, all four identity
fields, fallback status, adapter/device limits and features, and the same acquisition/compute
probe. The flag-absent run is labelled a **portability experiment**; it cannot replace acceptance
under the mandated profile, and it does not block B06.

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
- Produces (`parameters.js`): `MAX_PARAMETER_DIGITS = 64`, `ANCHOR_LIMITS = {digits: 400,
  exponent: [-400,400]}` (deeply frozen), `parseAnchorDecimal(text, path) → {sign, digits,
  exponent}`. It shares the parameter grammar and bounded scanner, uses a 400-significant-digit
  budget, requires explicit exponent magnitude ≤400, and for nonzero values requires normalized
  leading position `digits.length + exponent − 1` in `[-400,400]`. Zero bypasses only the
  leading-position check. Invalid input throws `SceneError('invalid-value', …, path)`. Parsing
  never materializes the anchor as a Number or BigInt. `parseDecimal(text, path) → {sign,
  digits, exponent}` (accepts only `-?\d+(\.\d+)?([eE][-+]?\d+)?` with ≤64 significant digits counted lexically from the first nonzero mantissa digit
  through the last mantissa digit, including trailing zeros, and explicit exponent magnitude ≤400.
  The normalized exponent may exceed that bound. Signed zero is preserved through conversion and
  its bit pattern; `SceneError('invalid-value', …, path)` otherwise; never materializes beyond
  the budget), `compareDecimal(a, b) → -1 | 0 | 1` (exact), `inRange(text, lo, hi)` (exact, before
  any rounding), `toDouble(text)` validates the decimal and returns `Number(text)`, throwing
  `SceneError('invalid-value')` if the result is non-finite. `toBinary32(text) → {requested,
  double, value, bits}` uses `double = toDouble(text)` and `value = Math.fround(double)`, throwing
  `SceneError('invalid-value')` if `value` is non-finite. This two-stage conversion, including
  double rounding, defines ordinary-profile semantics. Underflow to a subnormal or signed zero
  remains defined; `bits` contains eight lowercase hexadecimal digits. `effectiveParameters(modelId,
  parameters) → {requested, effective, bits}` (`mandelbulb`: `power` an integer string 2–8;
  `quaternion-julia`: `C[4]` and `kappa` in [−4, 4]; `menger`: `depth` is the JSON integer selector 1 or 2, defaulting to 1 for native creation.
  Every effective numeric parameter, including depth, carries binary32 bits; `sphere`, `box`:
  `{}`), `escapeRadius(effectiveC: [4 × finite, binary32-exact values in [-4,4]]) → {value, bound}`
  (invalid shape reports `invalid-value` at `effectiveC`, and an invalid component reports it at
  `effectiveC[i]`. The bound uses exactly two `nextUp32` steps after each rounded operation.) (`value = max(2, (1 + √(1 +
  4‖C‖))/2)` in binary32 arithmetic; `bound` outward-rounded by two `nextUp` steps after each
  rounding operation so `bound ≥` the real-arithmetic radius), `sliceIsEmpty(effectiveKappa, bound)
  → boolean` (strict `|κ| > bound`), `nextUp32(x)`, `nextDown32(x)`.
- Produces (`validation-domains.js`): `SUPPORTED_DOMAINS` uses `{kind: 'set', values: [...]}` for power and
  depth, and inclusive `{kind: 'interval', min: '-4', max: '4'}` descriptors for kappa and each of
  C’s four components. Sphere and box use `{}`. This admission metadata is separate from registry
  coverage. `inSupportedDomain(modelId, parameters) → {ok, violations: [{path, reason}]}`,
  `VALIDATION_RECORD_FIELDS = ['recordId', 'modelId', 'evidenceClass', 'implementationHashes',
  'referenceHashes', 'matrixHash', 'profile', 'testedParameters', 'testedSamplingConditions',
  'testedDomain', 'coverage', 'inconclusive', 'limitations']` (`evidenceClass` is `'arithmetic'`,
  `'tracing'` or `'geometric'`; `testedDomain` is the exact input set or spatial sampling domain),
  `createValidationRegistry() → {register(record), lookup({modelId, evidenceClass,
  implementationHashes, profile, effective, sampling, domain}) → record | null, list()}` (a lookup
  matches only when `implementationHashes` has exactly the record’s key set and equal values,
  `profile` is equal, and effective inputs and sampling conditions match their tested
  alternatives. Parameter and sampling arrays enumerate alternatives; vectors are alternatives
  represented as nested arrays. Domain values compare exactly except the closed aliases `heights
  → height` and `distances → distance`, whose arrays enumerate alternatives. Tested and query
  condition key sets match exactly after alias mapping. Arrays never imply intervals. Reference
  and matrix hashes are provenance; B08/B10 pin them at registration and issue new record IDs for
  a re-frozen matrix. B08/B10 define each evidence class’s sampling vocabulary, and callers
  project to that vocabulary. The requested `domain` matches the record's `testedDomain`
  for every evidence class — point/input sets for arithmetic, ray/condition sets for tracing,
  camera/anchor sampling domains for geometric; an omitted domain returns `null`; `list()` shows
  historical records without claiming applicability; nothing is inferred, and a local detail
  record never matches another camera patch). B02 registers no records; B08 and B10 do.
  `PRECISION_CARRY_FORWARD_LIMITATIONS` is a frozen array containing the five substantive
  sentences preceding “Every 1b.1 validation record…” in the binding Precision carry-forward
  paragraph, verbatim with prose line wraps joined. B08/B10 assert that every product record
  includes every entry. Generic registry fixtures may use empty limitations. B02's test reads that
  paragraph from this plan at test time, so any amendment to the paragraph must update the
  constant in the same commit (rev 4.4).
- Produces (`scene-adapter.js`): `SPACE_CONVENTIONS = 'atlas-space-rh-zup-abcd-v1'`,
  `SPACE_MODELS` (`sphere@1`, `box@1`, `menger@1`, `mandelbulb@1`, `quaternion-julia@1`),
  `CAMERA_KIND = 'anchored-perspective-v1'`, `CAMERA_LIMITS = {anchorDigits: 400, anchorExponent: [-400,400],
  exponent: [-1074,1023], localMagnitude: 2 ** 20, fovDegrees: [10,120]}`; the anchor limits
  derive from `ANCHOR_LIMITS`. Scale mantissa is in `[1,2)`. Local-coordinate limits apply to
  Euclidean vector norms. Quaternion admission requires `abs(norm(q) − 1) ≤ 1e-6`; stored
  components are neither normalized nor sign-canonicalized. `TRACING_PROFILE =
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
  `slices: []`. Native model-parameter defaults are `{}` for sphere and box, `{depth: 1}` for
  Menger, `{power: '8'}` for Mandelbulb, and `{C: ['-0.2','0.8','0','0'], kappa: '0'}` for
  quaternion Julia. Sampling seed is an integer in `[0, 2³²−1]`.), `spaceModelCodecs`, `createSpaceSceneAdapter({maxSceneBytes}) → {sceneCodec,
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
- Consumes: `effectiveParameters`, `escapeRadius`, `sliceIsEmpty`, `SUPPORTED_DOMAINS` (B02);
  `POINT_STATUS`, `ESTIMATOR_CATEGORIES` (B00). Each model record's `supportedParameters` uses
  B02's tagged `SUPPORTED_DOMAINS` descriptors (`{kind: 'set', values}` and inclusive `{kind:
  'interval', min, max}`) rather than untagged arrays (rev 4.4).
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
  `tests/reference/space-matrix.json` (generated index/header, committed) and `tests/reference/space-matrix/*.json` (18 generated data shards, committed): nine non-ladder kinds—bulb-origin, bulb-polar, bulb-generic, quaternion-generic, quaternion-boundary, adversarial-point, adversarial-ray, analytic-ray, fractal-overview—and nine ladder shards, detail-bulb-2 through detail-bulb-8, detail-quaternion-default and detail-quaternion-offplane,
  `tests/reference/quaternion-usability.json` (generated, committed),
  `tests/reference/performance-predictions.json` (generated, committed; each P3 checkpoint's
  termination distribution and acceptance tolerance, with its sha256 recorded)
- Modify: `tests/reference/performance-workload.json` — materialize B00's frozen rules, clear owned
  unresolved fields, and record the prediction hash.
- Test: `tests/unit/reference-points.test.js`, `tests/unit/reference-rays.test.js`, and `tests/unit/reference-p3.test.js`. Regenerate each partition once; retain live semantic assertions and separate frozen-artifact integrity comparisons. Measure each file's runtime against the unchanged 600,000 ms whole-run bound. The controller registers the files.

**Interfaces:**
- Consumes: nothing from `src/` (a test asserts it).
- Produces: `bulbOrbit(p, power, cap, {precision: 'f32' | 'f64'})`, `quaternionOrbit(q0, C,
  cap, {bound, precision})`, `complexOrbit(z0, c, cap)`, `sphereDistance`, `boxDistance`,
  `mengerBoxes(depth)`, `mengerDistance`, `sphereInterval`, `boxInterval`, `traceRay(ray, profile,
  field, interval) → {status, reason, subreason, t, steps}` (the §11.4 rules in binary64, with an
  f32-emulation mode for the stagnation checks), `rayFor(camera, i, j, W, H)` (Project 0 A.1,
  re-expressed), `prepareAnchor(model, effective, ray) → {anchor, t, convergence}` (P1's
  algorithm), `generateMatrix({seed}) → matrix`, the assembled logical matrix, stored through the index and shard contract in P1, `{schema:
  'atlas.space-matrix', version: 1, frozenAt, generatorSha256, analysis: {path, sha256}, strata:
  [{id, role: 'mandatory' | 'diagnostic', kind, profile: 'surface-v1' | 'analytic-inspection-v1' | 'ladder-v1', cases: [{id,
  inputs, camera?, pixel?, expected}], floor, eligible, excluded: [{id, reason, quantity}], state:
  'frozen' | 'inconclusive'}], tolerances: {quantity: {kind, value, floor?, analysisRef}},
  anchors: [{id, model, effective, seedRay, anchor, t, convergence}]}` (rev 4.8: freeze the inspection profile's tolerance formula, multiplier, caps and sampling conditions in matrix metadata; both analytic checks are mandatory), the usability file
  `{rays, settings, distribution: {hit, miss, unresolved: {...}, numericalFailure}}`, and the error
  analysis `tests/reference/tolerance-analysis.md` (fused and unfused evaluation, transcendental
  error, conditioning, output quantization, per compared quantity); `matrixIsQualifiable(matrix)
  → boolean` (false while any mandatory stratum is inconclusive).

**Design assertions:** §16.2 verbatim, via P1; independence (`tests/reference/` shares no code
with `src/`); nothing is validated merely because Project 0 tested power 8 and one quaternion
parameter; floors per stratum, never pooled; semantic and adversarial cases never excluded; the
detail ladder's exceedances are evidence, not passes. Named semantic tests execute the live independent references on their declared inputs and assert the mathematical/status result. Committed JSON comparisons remain separate determinism tests. Matrix `tolerances.usabilityDistribution` retains 0.05 for P2. P3 retains `perClassAbsoluteFraction: 0.01`; neither tolerance substitutes for the other. Prediction provenance includes the generator hash, so a generator edit changes prediction and workload hashes even when termination counts remain unchanged.


- [ ] **Step 1: Write the failing tests** — `reference modules import nothing from src`; `the
  complex and quaternion recurrences agree exactly on the invariant plane`; `the bulb reference
  reproduces the axis orbit 0, 1, 2, 257 and the derivative 9217`; `Menger depths enumerate 20
  and 400 boxes and the exterior distance is the box-union minimum`; `the reference marcher
  reports stagnation by field coordinate for o = 1, t = 2⁻²⁶ in f32 mode`; `the reference marcher
  reports an interior start as unresolved with estimate-unavailable`; `κ = ±4 strata contain only
  empty-slice assertions`; `the matrix generator is deterministic and its output
  matches the committed index's whole-matrix SHA-256; shard byte lengths and hashes, complete ID coverage and assembly order also match`; `an inconclusive mandatory stratum blocks qualification` (the
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
  Independently generate all scene JSON, 1,875 orbit poses and 400 interaction poses per scene, and
  five coverage checkpoints per scene. Verify deterministic materialization and record the final
  workload and prediction SHA-256 hashes.
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
- Consumes `CAMERA_KIND` and `CAMERA_LIMITS` from B02’s scene adapter, and `parseAnchorDecimal`
  from B02’s `numerics/parameters.js`. B05 uses that parser for anchor admission and emitted
  anchors; it does not implement another anchor parser. Parameter parsing remains limited to 64
  significant digits.
- Produces: `RECENTRE_BOUND_LOG2 = -40` (the bound is `2⁻⁴⁰ × scale`, kept in scaled or
  log form; it is never materialized as a possibly underflowing double), `anchorAdd(anchor, scale,
  local) → anchor' | {unchanged: true, reason: 'precision-limit'}` uses exact decimal arithmetic on
  BigInt-scaled integers. Return an anchor only if it satisfies B02’s shared parser; otherwise
  return the precision-limit outcome without changing the input anchor. `recentre(camera) → {camera, recentred, driftBoundLog2, exact} | {camera, recentred: false, unchanged: true, reason: 'precision-limit', detail}` (moves the
  local part into the anchor when `‖positionLocal‖ > 1024` or `< 2⁻¹⁰`, re-expressing `focusLocal`
  consistently; when the bound cannot be met within both the digit and anchor-exponent limits, the camera is
  returned unchanged with an explicit precision-limit result. A decimal tail may be discarded only after the exact L1 sum of all six represented position and focus component errors is shown to be no greater than `scale × 2⁻⁴⁰`. A candidate that collapses a previously distinct position and focus is refused even if its error fits that bound. Refusal detail is `anchor-digits`, `anchor-exponent`, `focus-re-expression`, `local-range`, or `working-budget`. Focus re-expression refusal does not establish a fractal depth limit. B05 derives its
  working-integer budget separately: anchor exponents alone do not bound exact scale/local multiplication. Successful rebasing returns `recentred: true`; a no-op returns false. Zero measured error is reported as `driftBoundLog2: null, exact: true`. Nonzero error uses its integer ceiling logarithm and `exact: false`. This reporting bound can be up to one bit looser than the admission threshold and is never used for admission.), `encodeOrdinaryOrigin(camera) → {highF32: [3], lowF32: [3], errorBoundLog2, exact} | {unavailable: true, reason}` (the ordinary binary32
  transport: `high = RN32(exact represented coordinate)` and `low = RN32(exact − high)`, in that order, using nearest rounding with ties to even and range checks before use. `errorBoundLog2` bounds the absolute L1 world-space error. Zero error uses `null` with `exact: true`; otherwise the bound is its integer ceiling logarithm with `exact: false`. The `2⁻⁴⁶` relative property holds when high and low are binary32-normal; it is not an underflow guarantee; the GPU field
  coordinate's source expression is `(high + t·d) + low` — a source expression, not an arithmetic
  barrier: §10.2's analysis and guards cover permitted fusion and reassociation, and the coordinate
  probes record the effective GPU input bits for the transport and stagnation cases; a represented
  origin whose remainder exceeds binary32 range is `unavailable` and the saved camera is not
  changed), `basis(camera) →
  {forward, right, up}` (rotates the canonical right (1, 0, 0), up (0, 1, 0) and forward (0, 0, −1)
  by `orientationWxyz`; a serialized orientation is reconstructed exactly, roll included; upright
  constraints apply to navigation operations, not to reconstruction), `rayDirection(camera, i, j,
  width, height, jitter = {dx: 0, dy: 0})` (A.1 pixel centres with `h = tan(fov/2)` plus the sample jitter at (i + 0.5 + dx, j + 0.5 + dy), with j and dy positive downward), `angularPixelSize(camera, height)`, `orbit(camera, dYaw, dPitch)` (about
  `focusLocal`; upright; pitch clamped to ±89°; at an exact pole, retain the current right vector’s horizontal heading before applying requested yaw and the pitch clamp), `pan(camera, dx, dy)`, `dolly(camera, factor)`
  (multiplies the distance to `focusLocal`, never reaching or crossing it; factor zero and positive factors that round onto the focus return the original camera; negative factors are invalid), `lookAt(camera, focusLocal)` (upright),
  `setOrientation(camera, wxyz, {lockAxis: null | 'x' | 'y' | 'z'})` (axis locking uses `Rz(z) Ry(y) Rx(x)`: extract canonical angles from the current and requested orientations, replace the requested locked coordinate with the current coordinate, then reconstruct; at gimbal lock, canonicalize `x = 0` and solve `z`; labels are tilt/X, roll/Y, heading/Z; for upright cameras, `x = 90° + forward elevation`, `y = 0`, and `z` is the right-vector heading, or forward azimuth minus 90° (modulo 360°); off upright, these coordinates are coupled, and at `y = ±90°`, X/Z are not independent physical locks), `resetOrientation(camera)`
  (upright, looking at `focusLocal`), `overview(model, effective) → camera` (let `direction = [1.92, −1.44, 0.7]` and `directionLength = Math.hypot(...direction)`. Use the enclosing sphere’s radius unchanged; for a box, compute its centre and half-extents, then advance `Math.hypot(...halfExtents)` by one binary64 step toward positive infinity. Compute each position component as `centre[i] + (direction[i] / directionLength) * 2.5 * radius`, evaluating the multiplications left to right. Look upright toward the centre.), `equalCameras(a, b)` (compares represented position and focus exactly, FOV exactly, and normalized quaternion components modulo sign within eight binary64 epsilons; it serves history de-duplication and change detection, never cache/request keys or stored-scene identity), `flightStep(camera, {forward,
  strafe, rise, yaw, pitch}, speed, dtSeconds)` (upright: yaw about world Z, no roll; speed is camera-local units per second; yaw and pitch are radians per second; translation uses updated forward/right and world Z rise; focus distance is preserved; B12 owns the elapsed-time clamp),
  `reconstructHit(camera, pixel, jitter, depth, width, height) → anchoredPoint | {unavailable: true, reason: 'precision-limit'}` (the pick result's
  anchored world position, from the sample's own camera, pixel and jitter — never three binary32
  values), `toLocal(camera, anchoredPoint) → [3] | {unavailable: true, reason: 'precision-limit'}` (the point expressed in the camera's anchor and
  scale, for `lookAt`). An anchored point is `{anchor, scale, positionLocal}`; pixel is B00’s `[x,y]`, and depth is world ray distance. Invalid inputs throw. Representational failure returns unavailable. **Navigation safety:** navigation must refuse coincident results. Recentre must also refuse a result that collapses a previously distinct position and focus. `dolly(0)` returns the input camera; positive factors that round onto the focus are likewise refused. Externally supplied coincident cameras retain the documented no-op behavior for orbit, dolly, reset, flight, and a coincident `lookAt` target.

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
  0`, and `highF32 + lowF32` in double equals the exact represented coordinate within 2⁻⁴⁶ relative); `an
  origin whose remainder is out of binary32 range is unavailable and the camera unchanged`; `a
  serialized orientation with roll is reconstructed exactly by basis`; `the basis matches Project 0
  A.1 for the bulb overview` (`forward` ≈ (−0.768, 0.576, −0.28) within 10⁻³); `ray directions use
  pixel centres, the vertical field of view and the sample jitter` (the centre of 1280 × 720 with
  zero jitter is `forward`; the corner matches A.1's formula; jitter `{dx: 0.5, dy: 0}` moves the
  direction by one half pixel); `orbit keeps the focus and the distance and stays upright`; `dolly approaches but never reaches the focus`; `flight is upright: yaw about world Z, pitch clamped, no roll`;
  `overview places the camera at 2.5 radii`; `setOrientation with a locked axis changes only the
  other two`; `reconstructHit's error is bounded by origin transport, direction rounding and depth
  quantization together` (the test bounds each term and their sum; depth spacing alone does not
  bound the total reconstruction error).
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "anchor arithmetic preserves the represented point within the recentre bound"`.
- [ ] **Step 3: Implement** (`BigInt` is Space-owned and never in `shared/`; the orientation is a
  unit quaternion `[w, x, y, z]`; transport rounds the exact represented coordinate and then its exact residual directly to binary32).
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add the anchored Space camera and perspective arithmetic (1b.1 B05)"`, then the gate.

**Expected outputs:** the camera module, the only Space code that sees anchors as decimals.

---

### Task B06: The WebGPU backend (spec §9, §8.3, §15; the annex)

**B15 r10 amendment (2026-10-22):** Add `createBatchGroup({identity, region, sample, passes}) → frozen BatchGroup`; `passes` contains the member Batch descriptors. `submitBatch` and JobPlan batch operations accept either descriptor form. Test grouped-versus-ungrouped display and diagnostic equivalence, atomic validation, resource retention, two-lease accounting, cancellation and loss. Qualified navigation drafts use whole-frame groups under spec §7.5, without fence-driven tile learning or dynamic draft windows. Qualification covers family, dimensions and numerical work bounds; other drafts retain bounded subdivision. Settled execution remains single-pass with its existing tiling, adaptation and cancellation granularity.

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
  `TARGET_LAYOUT`, the ticket shape (B00).
- Produces: `createWebGPUBackend({canvas, clock, acquire = acquireDevice, enableTimestamps =
  false}) → backend` (every annex method and semantics; `onLoss` observers attached at
  acquisition; `destroy()` terminal; `allocate({name, bytes, usage: 'storage' | 'uniform', data?:
  Uint8Array}) → handle`, with the allocation semantics in the amended §9.1 Allocator bullet), `createTrackedAllocator({factory, cap, clock}) →
  {allocate(desc) → handle, release(handle), retain(handle, owner), retire(owner),
  diagnostics()}`, `preparePipelines({device, pipelineSet, onProgress, boundMs}) →
  Promise<{preparedPipelineIds, pipelines}>` (`pipelines` stays inside the backend) (`createComputePipelineAsync` per variant; progress `{stage, completed,
  total}`; timeout invalidates the attempt), `createPresenter({device, canvas, format}) → {format, resize({width, height}), size(), encode(encoder, {pipeline, display, uniforms}), unconfigure()}` (encode-only; admission, the uniform snapshot, submission and the ticket stay in `backend.present`) (the fullscreen render pipeline to the preferred canvas format
  with scaling and no further transfer function); the probe pass writes `0x41544c53` ("ATLS")
  into a 1 × 1 r32uint target, B06 supplies the executable probe; B09's renderer preparation submits it and reads it back through ordinary admission, compares it with ATLS, and rejects with `preparation-failed` on mismatch (B13 and B14 consume that result); compilation alone is not successful product preparation. `backend.testAdapter = {destroyDevice(), injectLoss({reason}),
  failNextAllocation()}` (declared separately from the production interface; `destroyDevice()` is a real loss without terminal teardown. From the call until the loss is observed, nothing is admitted (`unavailable`), and only the loss path settles work. Outstanding tickets settle `interrupted`; an in-flight `prepare()` or `configureTargets()`, whether its own work succeeded or was rejected, waits for the loss and rejects `device-lost`; readback mappings end through the loss path. It resolves once the loss is observed. `uncapturedErrors()` observes uncaptured and creation errors). `pipelineDescriptors.js` is **not** created here: B00 froze
  the descriptor schema; B06 prepares executable self-check pipelines (`probe`, `present`, and a `selfcheck-trace` loop of at most 64 steps with early exit) and B08, B10 and B11 register their own
  descriptors with preparation assertions as their shaders come into existence.

**Design assertions:** §9 (the backend owns resources, encoding, submission, completion,
presentation and readback; shared and UI code never see `GPUDevice`); §8.3 (1 GiB cap; retiring
accounting; Plane separate); §15 (first-use compilation visible; the cap checked before
allocating); the annex (admission leases; fresh attempt identity; loss observer attached at
acquisition; transactional configuration; ping-pong accumulation; no direct canvas copy;
banded readback with 256-byte row alignment). **Device limits (rev 4.4, joint ruling (a), Codex run
20261021T073220Z-227f):** B06 records adapter-supported, requested and granted limits
separately, validates allocations and pipeline layouts against the granted limits, and requests
no blanket `requiredLimits` (the defaults suffice) — only an increase a task needs and the
adapter supports; `maxStorageTexturesPerShaderStage` (default 4) is the binding risk, so
read-only inputs use sampled-texture bindings; workgroup-storage and binding limits are checked
against the eventual shaders.

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
  76 bytes per pixel and is reclaimed after the last ticket retires`. **F3 zero-readback assertion (Codex runs 20261021T163028Z-1356, 20261021T165312Z-f480, 20261021T170126Z-88ca):** a fresh target set reads back as zero in both accumulation textures and `accumulationFlags` at 1024 × 600 with correct byte lengths; B06 owns resource initialization (fresh targets read zero), while per-identity sample-0 initialization belongs to B11's accumulate shader.
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
  request replaces the pending one, which settles `superseded`; `request()` supersedes only pending interactive work and never cancels running work. Clients explicitly call `cancel(jobId)` when cancellation is required. Issuing an auxiliary lease also makes its owner running), `admit() → [{operation, admission}]` (at most `maxOutstanding` leases outstanding
  across all views and jobs per epoch; priority order; hidden and paused views never admitted;
  auxiliary submissions — probes, readbacks, presentation — take leases from the same pool through
  `requestAuxiliary(viewId, {jobId, priority, operation}) → {done}`), `completed(admission, {epoch, elapsedMs, timestampMs?})` (advances the plan with `{epoch,
  elapsedMs, timestampMs?, targetMs: batchTargetMs}`; the plan's `onAdvance` adapts pending
  batches; `createBatch` enforces hard bounds), `failed(admission, error)`, `discardAuxiliary(admission, {reason}) → boolean` (terminal auxiliary rejection only: before queue entry or after the queue fence; releases exactly that lease without advancing the owner plan or failing/closing its group; outside cancellation an unsettled auxiliary resolves `{outcome: 'failed', reason}`; `reason` must be a nonempty diagnostic string, with no enum; main-job, foreign, retired and non-current admissions return false; invalid reasons on eligible leases throw before mutation; emits `discarded` after accounting; **a discard is not watchdog progress: it releases its lease without resetting the watchdog deadline, while `failed()` releases remain progress**), `interrupted(epoch)` (observed loss: every lease of
  that epoch settles `interrupted`), `pause(viewId)`, `resume(viewId)`, `update(viewId)` (pins the newest pending snapshot already submitted through `request()`, before admission; otherwise selects the running job. With neither, it only pauses. Subsequent requests remain coalesced separately. The selected job runs while other work remains paused, then the view remains paused. Explicit `pause()` or `resume()` during an unadmitted Update cancels its selection when a newer request is pending), `hidden(viewId,
  bool)`, `cancel(jobId) →
  {accepted: true, done: Promise<{outcome: 'cancelled', submitted: 'none' | 'drained' | 'interrupted'}>}
  | {accepted: false, done: Promise<null>}` (stops admission immediately; `done` reports `drained` only
  after every outstanding lease has terminal evidence—completion, failure or auxiliary discard—or `interrupted` after observed loss. Watchdog expiry proves neither. Failure before cancellation preserves the job's `failed` outcome; failure during cancellation contributes terminal drain evidence without changing the outcome to `failed`. Unknown or retired jobs return `accepted: false`; their outcomes remain on their own `job.done`), `snapshot()`, `subscribe(listener)}`. The watchdog runs on the
  injected timer while leases are outstanding, including for hidden views; it never depends on
  animation-frame ticks. Expiry stops admission for that epoch and settles only jobs holding outstanding leases as `budget-exceeded`, reason `watchdog`, continuation `lower-cost`. Unissued jobs remain queued. Requests and auxiliary requests received during the stall also queue. The stall clears after every outstanding lease has terminal completion, failure, auxiliary discard, or loss evidence. Already-settled jobs remain settled. Observed loss still prevents admission until a new epoch is installed. No timeout releases resources or proves cancellation. Elapsed work accrues only while the plan holds at least one admitted operation lease and its view is eligible. Queued, paused and hidden time is excluded; auxiliary leases do not charge this clock. End-to-end latency remains anchored to `requestedAt`. Elapsed-work exhaustion settles `budget-exceeded` with continuation `resume`; watchdog exhaustion uses `lower-cost`. These are recovery offers, not instructions to revive a settled job. Auxiliaries share the lease pool and cancellation ownership by `jobId`, have separate `done` promises, never advance the owner's plan, and are covered by the watchdog but not elapsed-work budgets. Unissued auxiliaries supersede with their pending owner; issued auxiliaries drain through explicit cancellation. An auxiliary request for a job already settled by the watchdog or by failure is rejected. `failed(admission, error)` on any lease of a job, auxiliary leases included, fails the whole job when it precedes a cancellation. Picks retain their existing stale-result contract. Classification replacement, cancellation, loss and identity mismatch remain stale; ordinary descriptor, admission, allocation, copy-out and decode failures return `unresolved` with error code/message under B09c. Terminal auxiliary rejection uses `discardAuxiliary`, never `failed()`. Discard does not close the owner group or alter an already settled render. During cancellation it supplies drain evidence for that lease, with promises awaiting the whole group's drain or loss; observed loss takes precedence over a partially proved drain. Previously settled outcomes remain unchanged, including discard before cancellation and watchdog settlement. Clients call `interrupted(lostEpoch)` on observed loss before calling `setEpoch(nextEpoch)`. A job settles `completed` when its plan is exhausted. Qualified navigation drafts use one fixed operation by default: grouped compute/reduction/staging copy/GPU-gated presentation under §9.1(b). The operation advances only after successful completion and CPU diagnostic validation. The diagnostic §9.1(a) comparison retains compute/reduction/copy followed by separately admitted presentation. Navigation streams permit at most two live admitted drafts plus the newest coalesced pending request. Preparation grants no lease. Every operation retains existing admission, elapsed-work, watchdog, failure, cancellation, loss, pause/Update and priority semantics. No product submission bypasses accounting. The epoch-wide cap remains two outstanding leases. Variants (c) and (d) remain injected diagnostics; restoration consumes its own lease/ticket. `ready(jobId, {epoch}) → boolean` rechecks only
  that job's plan after asynchronous preparation. A request may register before preparation
  completes; its immutable identity remains selectable by Update. Until ready, the plan returns
  `null` from `next()` and `false` from `exhausted()`. Readiness is bounded and idempotent:
  it preserves an existing reservation and emits a `ready` event only for newly reserved work
  (or `settled` for exhaustion), returning `true` for either transition and `false` otherwise.
  Unknown, terminal, cancelling and stale-epoch notifications are ignored, including when the
  notification epoch differs from either the current epoch or the job's epoch. Readiness never
  issues a lease, revives a terminal job, changes the Update selection, or bypasses priority,
  visibility, pause/Update eligibility, instrument cadence, watchdog stalls or the lease limit.

**Rev 5.0 notes (2026-10-22):** B07b and B07c are incorporated B07 amendments, not separate tasks (so B09b's dependency on B07c resolves to this section). (a) the `ready()` text and its tests are B07b's proposed replacements (codex-B07b-notes.md:173, Codex run 20261021T174058Z-73af). (b) `discardAuxiliary` is B07c's old→new text (codex-B07c-report.md, Codex run 20261021T184450Z-7ff7); the fix that a discard is not watchdog progress (`releaseLease` gains `progress = true`, discard passes false) was reviewed READY by Codex (codex-B07c-r2.out, run 20261021T191127Z-99fa).

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
  outstanding: `done` stays pending until terminal `completed` or `failed` evidence for every outstanding lease → `drained`, or `interrupted(epoch)` →
  `interrupted`; a watchdog expiry leaves `done` pending); `the watchdog fires on the injected
  timer while a hidden view holds a lease, settles budget-exceeded and never says cancelled`; `a
  draft exceeding 1 s of unpaused work settles budget-exceeded with a continuation`; `batch bounds
  adapt toward 8 ms from completion evidence and never exceed the hard bounds`; `a completion from
  an older epoch is ignored`; `a job settles completed when its plan is exhausted`; `shared
  scheduler imports nothing from src/space`; `a request registered before ready is admitted after
  ready and retains its Update selection`; `stale-epoch readiness is ignored`; `duplicate
  readiness causes no double admission`. Also assert bounded per-job rechecking, the lease limit
  across a readiness burst (including auxiliaries), hidden/paused eligibility, terminal-job
  rejection, watchdog stalls, instrument cadence and empty-plan completion. B07c tests:
  auxiliary discard refuses main and stale admissions, preserves normal owner completion and
  completed owners, drains cancellation only on terminal evidence, gives observed loss precedence,
  validates reasons, ignores retired duplicates, preserves watchdog outcomes, releases slots
  safely at both lease limits with synchronous listeners, and `discard: a discarded auxiliary is
  not watchdog progress`.
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
- Consumes: `wgslConstants`, status words, the pipeline descriptor schema (B00); the matrix (through the index and shards) and
  usability files (B04); Pin the logical `matrixSha256`, the index-file SHA-256 and reference/generator hashes at registration. Load required kinds through the pinned index and verify each loaded shard's byte length, SHA-256 and declared IDs before comparison. B04's full integrity check verifies all shards and the assembled hash; a partial load is not whole-matrix qualification and must not be passed off as such. B08 consumes point strata; B10 consumes ray strata and anchors. Merge common stratum inputs with case overrides and reconstruct integer-pixel rays through `(i+0.5,j+0.5)`. Reports join on logical matrix hash and stratum ID. Re-freezing requires new validation-record IDs; old evidence is not silently retargeted.  the evaluators (B03) for context; the backend (B06).
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
that fails or is inconclusive blocks acceptance and promotion: the kernel is fixed or the failure is escalated
with the evidence; tolerances and floors are never relaxed.

---

### Task B09: The pass graph — requests, keys, accumulation, publication, reports (spec §7.1–7.4, §8.1, §8.2)

**B15 r10 amendment (2026-10-22):** Add `createBatchGroup({identity, region, sample, passes}) → frozen BatchGroup`; `passes` contains the member Batch descriptors. `submitBatch` and JobPlan batch operations accept either descriptor form. Test grouped-versus-ungrouped display and diagnostic equivalence, atomic validation, resource retention, two-lease accounting, cancellation and loss. Qualified navigation drafts use whole-frame groups under spec §7.5, without fence-driven tile learning or dynamic draft windows. Qualification covers family, dimensions and numerical work bounds; other drafts retain bounded subdivision. Settled execution remains single-pass with its existing tiling, adaptation and cancellation granularity.

**B15 REC-G renderer extension:** `createSpaceRenderer` additionally accepts injected `groupDrafts` and `draftExecution` (default L6b; only L6a–L6d in the product renderer; L6a remains the CPU-gated diagnostic comparison and L6d remains available but off). Qualified drafts follow the fixed plan in B07 and the §9.1 variant rules. `onPublicationRecord`, `onPublicationUpdate`, `onProvisional` and `onRestoration` expose immutable presentation records, identity-matched terminal updates and diagnostic presentation/restoration observations. Variant (d) emits its pending record on `onPublish`; only confirmation supplies accepted counts. `diagnosticsState` is separate from navigation `pending`. Draft reports name `draft-summary-v1`, 64/96 B, expose exact `outcomeAggregates`, and report per-pixel `outcomeMasks` unavailable; settled/refinement masks are unchanged. Publication rejection checks, including recovery consistency from Worker-owned sample finalization, finish before CPU-gated present submission. Historical updates never republish or change the displayed counts.

**B15 r16c F8 Worker amendment (supersedes the r16b product slicing fallback):** Keep fused mask/count decoding and incremental sample/union histograms. Add `mask-processor.js`, `mask-worker-service.js` and `outcome-masks.worker.js`: lazily create one persistent Worker per renderer, with independently identified job sessions and at most two unacknowledged transferred readbacks. The Worker owns every full-frame array and the existing validation algorithm; it returns only bounded aggregate snapshots after finalization. Transfer owned, unmapped copy-out buffers; never GPU handles. Match session/operation/sample identities, retain each readback lease until acknowledgement, and defer settled presentation until the sample is closed. Close sessions on cancellation/finish; terminate the owned Worker on loss/destruction; reject pending requests on startup, transport or validation failure and fence late callbacks. Preserve §7.2, settled shaders, full per-pixel evidence and accumulation order. `maskProcessor` is an injectable transport seam; explicit `maskWork` retains CPU slicing for diagnostic/tests only, with no automatic fallback. RED-test buffer transfer/no main-thread pixel work and the renderer validation barrier; test the actual entry module in CPU worker threads, counts/recovery equivalence, bounded concurrency and lifecycle failures. The smoke tool now pinned at 39b7f06 measures the unchanged 4 ms issuance rule and checks P3 confirmation pairing. Its MessageChannel gap probe is opt-in and diagnostic only; probe-enabled results are never judged or pooled with acceptance measurements. Neither main-thread metric is total Worker/sample time. Claude runs that GPU smoke after handoff; Codex only reads it. Browser smoke, unchanged P3 for all three scenes, stress replacement and settled-first timing remain required. No unconfirmed orbit allocation/layout change is included.

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
  to the scheduler as `makeAdmission`); `TARGET_LAYOUT`, `LIGHTING_BOUNDS_DEFAULT` (B00);
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
  'refinement', requestId, geometryRequestId, samples, pending: boolean}`; a status event `{pending:
  true, since}` is emitted the moment a new request supersedes the published image. `pending` is true for a non-current navigation-draft publication permitted by spec §7.2 and B15's B09-F10 rule; otherwise it is false. The renderer
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
  view identity to match beyond `isPublishable`, except for the pending camera-navigation drafts expressly permitted by spec §7.2 and B15's B09-F10 rule; partial tiles and mixed generations are never
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


- **Plan windows and cancellation (B07 ruling (g); Codex run 20261021T123558Z-2470).** Keep at most 256 pending operations, representing at most one sample. Split larger samples into smaller windows; append subsequent windows through `onAdvance`, preserving every existing pending ID and dependency barrier. Outside window boundaries, return replacements only when completion evidence lies outside 0.5–2× `targetMs` and at least eight operations have completed since the previous replacement. Otherwise return `undefined`. Window-boundary replacements are exempt from that spacing. For `C` completions and `W` boundary replacements, a structural Node test on the P3 settled plan asserts pending count ≤256, at most one pending sample, and total replacements ≤`floor(C / 8) + W`. Incremental B00 readiness and validation remain a 1b.3 carry-forward owned with Space export; revisit earlier if measured B09 plans cannot satisfy these bounds. B09 explicitly cancels work that can no longer be used. Update may leave an older, unselected running job paused; the renderer owns its eventual cancellation. A stale or rejected pick is reported as a stale result, never through the scheduler's `failed()`: a failure on any lease fails the whole job, so a stale pick must not fail a settled render (§7.3: rejecting a stale result is not cancelling it).

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
  workspace-field extension`; `the P3 scenes decode through the Space codec and the poses are valid
  cameras`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "a draft replaces the published image only when complete and the retained image is marked pending meanwhile"`.
- [ ] **Step 3: Implement** the pass walk over the fake backend: the integration this task closes
  is request → `JobPlan` → scheduler leases → backend tickets → publication and report.
- [ ] **Step 4: GREEN**, `npm test` (the Plane render-adapter suite still passes with the added
  events).
- [ ] **Step 5: Commit** — `"Add the Space pass graph, profiles, keys and reports (1b.1 B09)"`, then the gate.

**Expected outputs:** the renderer and its report fields, Node-tested end to end on the fake
backend.

---

### Task B09b: Renderer-owned obsolete geometry release and structured job error codes (follow-up to B09; rev 5.0)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B09, B07 (incorporating the B07c amendment). **Precedes:** B13's allocation integration and B14's allocation acceptance.

**Scope** (codex-B09b-report.md, Codex run 20261021T225008Z-03c8; claude-B09b-r1-review.md, APPROVED): files `src/space/render/renderer.js` and `tests/unit/space-renderer.test.js`. Add synchronous `renderer.releaseObsolete() → frozen {freed, retiring}` in bytes, judged against the live viewport request and its current generation (a failed export never evicts compatible viewport geometry; an absent or throwing generation source retains the cache), preserving publication, job and pick ownership and ticket/mapping accounting. Preserve `record.error?.code` as the job result's `errorCode`; untyped failures get no invented code and no message is parsed. B13's follow-on consumes the real hooks, forwards `retiring` separately from `released` and removes its injected seams and `releaseUnavailable` fallback; B14 continues through the recovery facade.

---

### Task B09c: Product camera classification repair and navigation integration (follow-up to B09; B11-F1; rev 5.0)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B08's point ABI, B09's auxiliary and ownership rulings, B10 and B11's product pipeline set. **Required before** B14 enables interaction.

**Scope** (codex-B09c-report.md, Codex runs 20261021T235623Z-d66d and 20261022T001340Z-2963; claude-B09c-r1-review.md): reproduce B11-F1 with real product descriptors; submit and decode B08 point batches (product IDs, 16-byte input, 64-byte sentinel-initialised output, complete uniforms, box binding for every family); report classification failures as `unresolved` with the error code and message rather than hiding them as staleness; pin classification to the resolved iteration budget; preserve auxiliary lease and buffer ownership (`discardAuxiliary`, never `failed()`); verify the B12 focus pick. Files: `src/space/render/renderer.js`, `tests/unit/space-renderer.test.js`, `tests/space.mjs` (`rendering` group) and `tests/suites.manifest.json`. **Adds the required pass "Product camera classification agrees with the CPU at the resolved budget for every model family" to `space-rendering`** (bulb, Menger depths 1 and 2, sphere, box and quaternion Julia, plus the draft-64/settled-128 late-escape case).

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
  anchors (B04); Pin the logical `matrixSha256`, the index-file SHA-256 and reference/generator hashes at registration. Load required kinds through the pinned index and verify each loaded shard's byte length, SHA-256 and declared IDs before comparison. B04's full integrity check verifies all shards and the assembled hash; a partial load is not whole-matrix qualification and must not be passed off as such. B08 consumes point strata; B10 consumes ray strata and anchors. Merge common stratum inputs with case overrides and reconstruct integer-pixel rays through `(i+0.5,j+0.5)`. Reports join on logical matrix hash and stratum ID. Re-freezing requires new validation-record IDs; old evidence is not silently retargeted.  the renderer's pass sequence and pick API (B09).
- Produces: WGSL entries `trace_band` (writes `depth` and the packed `status`), `normals_band`
  (central differences at ε = 0.5·τ(t); writes `normal` with availability; **rev 5.0, user decision 2026-10-22: for box and Menger only, the one-sided fallback below applies when exactly one stencil endpoint is analytic-interior**), `pick_readback` [**not built; rev 5.0 erratum below**] (one
  pinned geometry sample's depth and packed status; the CPU reconstructs the anchored hit with
  `reconstructHit` from that sample's camera, pixel and jitter — no absolute world hit is collapsed
  to binary32) **B05 note (Codex run 20261021T123602Z-6e35 and 20261021T170807Z-a7ee):** `reconstructHit` and `toLocal` may return `{unavailable: true, reason: 'precision-limit'}`; B10 preserves that outcome as an unresolved pick and does not assume every call returns an anchored point. Use downward-positive `dy` (j and dy increase downward).; `passes.js`: `TRACING_VERSION = 'surface-v1/space-trace-v1'`, `TRACING_HASHES`,
  `tracePipelineDescriptors()`, `traceUniforms({modelId, camera, effective, region, internalSize, sampling, profile})` [**rev 5.0 erratum below; jitter is per pixel in the kernel**] (origin
  `highF32` and `lowF32`, basis, α, the τ floor, step multiplier, caps, enclosing-interval
  parameters; the field coordinate's source expression is `(high + t·d) + low`, per B05),
  `normalsUniforms`.

**Design assertions:** §11.4 verbatim (starting conditions; outward-safe enclosing volumes; the
ordered step rules; `0.9·DE`; stagnation by ray parameter or field coordinate compared in
binary32; the step cap; no minimum step; an interior start → `unresolved/estimate-unavailable`
with interior detail); §8.1 (normals with availability; an unavailable normal keeps the depth);
P2's normal rule (all required samples resolved, effective sample positions distinct, gradient
finite and nonzero); §13.3 (focus by asynchronous depth readback; a pick rejected when epoch,
request, geometry revision, dimensions or sample identity no longer match). P2 is the acceptance
protocol.

**Rev 5.0 notes (2026-10-22):**
- **One-sided normal fallback (user decision 3; codex-B14-visual-fixes.md B14-B1..B3, claude-B14-visual-debate1.md, Codex run 20261022T010745Z-fca4).** Box and Menger only, at the normal rule (P:1563): keep central differences at ε = 0.5τ wherever both samples resolve; when exactly one endpoint is analytic-interior, take the other endpoint with the resolved centre value f(p) (forward `(f(p+) − f(p))/(p+axis − paxis)`, backward `(f(p) − f(p−))/(paxis − p−axis)`); the interior zero never enters the derivative. Require distinct effective positions, finite resolved values and a finite nonzero gradient; both endpoints interior, non-escape, numerical failure and coordinate collapse stay unavailable. Validate edges, corners and competing nearest faces and verify normal directions, depth preservation and failure behaviour. B03/B08 field semantics and kernel hashes are unchanged; the B10 tracing identity and records get new IDs, and old records are not silently retargeted. B11b implements it.
- **D3/D5 interface corrections (task-B10-report.md Fix round 1, accepted; Codex run 20261021T203032Z-7350).** `pick_readback` and `pickUniforms` are removed: B09's pinned asynchronous readbacks of the status and depth texels are the pick path (`resolvePick` is the CPU half), and the stale-identity and unavailable-reconstruction requirements stay. The signature is `traceUniforms({modelId, camera, effective, region, internalSize, sampling, profile})`; jitter is computed per pixel in the kernel and the renderer's per-batch `jitter` uniform is unused.
- **F3 interior detail (task-B10-report.md F3).** B00's status layout is unchanged: under reason `estimate-unavailable` (2) the subreason nibble carries `ESTIMATE_DETAIL` (0 none, 1 interior), so interior is estimate-unavailable subreason 1; under `stagnation` (4) the nibble keeps the stagnation code. `passes.js` decodes by reason; `status.js` and the B08 hashes are untouched.
- **Menger box buffer goes to B11** (task-B10-report.md): renderer allocation, binding (`menger_boxes`, module-local slots 3/4, in `TRACING_BINDINGS`) and lifetime, covering both depths.
- **B10-F6 (comment only) is deferred until `trace.wgsl` next changes** (codex-B10-r2-findings2.md, Codex run 20261021T221653Z-a0bc; progress.md): at `trace.wgsl:151–154` replace the chord-margin comparison with `m/4 ≥ R′/1028 > √(6u)R′` using `m ≥ R/256`, and use the conservative bounds `R′ < 2^47` and `dd·R′² < 2^95` (not `2^46`/`2^93`); no algorithm change, and a comment edit would change the shader hash.

- [ ] **Step 1: Headed checks first** (`space-rendering` `requiredPasses`): `Analytic rays trace
  to the oracle depth with exact statuses` (rev 4.8: the surface-v1 envelope and `analytic-inspection-v1` relative 10⁻³, both required; see B04 P1); `The detail ladders record agreement or exceedance per
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
- Modify (mechanical): `src/space/scene-adapter.js` — import `PALETTES` from
  `src/shared/palettes.js`. Add an assertion that no `src/space/**` module imports `src/plane/**`
  (rev 4.4, B02 ruling 10). **B05 note (Codex run 20261021T123602Z-6e35 and 20261021T170807Z-a7ee):** when the palette dependency moves, remove `/^src\/plane\/palettes\.js$/` from that assertion’s allowlist.
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

**Rev 5.0 notes (2026-10-22):**
- **Lighting-only unresolved presentation (user decision 2; codex-B14-visual-fixes.md B14-A1..A3, claude-B14-visual-debate1.md, Codex run 20261022T010745Z-fca4).** Where only the shadow or AO evaluation is unresolved, shade from the samples that resolved and apply a faint desaturated tint; never reuse primary-failure magenta. Primary failures keep their legend and precedence; reasons, counts and accumulated flags stay in the diagnostic views and the report; secondary numerical failures stay distinguishable from secondary unresolved results; failed samples are never dropped or their flags averaged away. This amends B11's presentation contract (the "diagnostic presentation" clause above), the legend tests and the appearance identity, with no spec change (§8.2 permits colours or patterns). Unknown occupancy stays unknown (Q2); an unescaped fractal orbit is not occlusion. B11b implements it.
- **Menger box buffer:** B11 owns the renderer allocation, binding (`menger_boxes`, slots 3/4) and lifetime for both depths (task-B10-report.md Fix round 1).
- **AO comment fix deferred until `shade.wgsl` next changes** (codex-B11-r1-findings.md, Codex run 20261021T234913Z-9ed0; progress.md): correct the comment claiming the tracer resolves interiors the same way as AO; an analytic interior is proven solid occupancy, distinct from an unescaped fractal orbit.

- [ ] **Step 1: Tests** — Node: `the shared palette bytes equal Plane's former output byte for
  byte` (a fixture of `paletteBytes(PALETTES[i], 1024)` captured from the pre-change module, for
  every palette); `the appearance metadata hashes equal the sources and verifyPrewarm reports a
  missing variant`. Headed (`requiredPasses`): `A settled image accumulates eight jittered samples
  and the result is bit-identical across completion orders`; `Shadowed samples never enter a
  direct-light accumulation and the first settled direct-light image precedes full quality`;
  `Diagnostic modes show the legend colours exactly for the status words`; `Secondary-ray
  failures remain visibly diagnostic and are counted`, including a simultaneous shadow and AO
  failure; `Diagnostic outcomes survive accumulation`; `The complete product pipeline set prewarms
  within the bound and its preparation time is recorded`. Node/headed addition (Codex runs 20261021T163028Z-1356, 20261021T165312Z-f480, 20261021T170126Z-88ca): `sample 0 after an appearance reset on poisoned accumulation and flag targets equals a fresh allocation, for subdivided regions and the following samples`.
- [ ] **Step 2: Implement** the three shaders, `appearance.js` and the shared palette extraction
  (the integration this task closes: a settled job runs to full quality on the real device).
- [ ] **Step 3: GREEN** (`npm test`, the Plane gate suites, then `--group rendering` under the lock).
- [ ] **Step 4: Commit** — `"Add Space lighting, antialiasing, accumulation and display; share palette definitions (1b.1 B11)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** six headed passes; the complete pipeline set's preparation time; every
existing Plane assertion unchanged and green.

---

### Task B11b: Visual fixes and visual acceptance (user decisions 2026-10-22; rev 5.0)

**Rev 5.2 (user decision 2026-10-22): quaternion deferred from visual acceptance.** After FU1 and FU2 (task-B11c-report.md, commits 1f7acd2 and 515d2a9), the combined run measured: bulb lighting-unresolved 3.82% (pass); quaternion primary unresolved 0 (pass; all 162 recovered); quaternion lighting-unresolved 5226/39085 = 13.37% (AO point-budget 4897, shadow 413), over the 10% ceiling. The user deferred the quaternion: for 1b.1 the required visual-acceptance check covers five scenes (bulb, sphere, rotated box, Menger depth 1, Menger depth 2). The quaternion scene is still rendered, measured and reported with its numerators, denominators and reason bits as **diagnostic** evidence. Quaternion visual-threshold results are diagnostic and do not gate 1b.1 visual acceptance; their thresholds remain unchanged, and the lighting result remains failed/deferred, not passed. Required quaternion diagnostic evidence must still be produced. Other quaternion numerical, tracing, recovery and interaction requirements remain binding. This amendment supersedes the earlier six-scene visual-pass requirement and the B15 STOP attributable solely to quaternion visual acceptance; all remaining acceptance and review requirements still apply. Investigating and reducing the quaternion’s remaining lighting-unresolved coverage, dominated by AO point-budget outcomes, is recorded as a **1b.2 item**. Non-escape establishes neither interior occupancy nor occlusion; unknown outcomes remain explicitly unresolved. No other threshold changes.

**Rev 5.1 follow-ups, B11c, implemented on the B11b branch (user decisions 2026-10-22; Claude and Codex converged, Codex run 20261022T035651Z-7855; sources codex-B11c-proposals.md and claude-B11b-followups-position.md):**
- (FU1, plan change) AO sample heights become h_i = 4i·τ(t) for i = 1..5, so the maximum reach is 20τ; the 0.015·t term is removed. The 4 is the existing secondary-ray offset; no constant is fitted, and no calibration set is used. Apply this rule to every family; retain the existing five samples, weights, strength, point budget, failure semantics and accumulated flags. Appearance identity becomes `space-appearance-v3`. Accepted costs: weaker broad-cavity shading, and a reach that depends on resolution.
- (FU2, spec §11.4 amendment, rev 5.1) Implement the complete quaternion-primary recovery algorithm in §11.4, including its trigger, endpoint updates, terminal-failure precedence, eight-midpoint limit, collapse guards and shared primary evaluation cap. Retain recovery attempts, successes, midpoint counts, encountered point-budget evidence and recovery-stop details in diagnostics and saved evidence, separately from terminal ray outcomes. Test initial-point exclusion, successful recovery, both endpoint updates, numerical failure, estimate-unavailable, collapse and cap exhaustion, plus unchanged secondary and other-family behavior. Tracing identity becomes `surface-v1/space-trace-v3`, with new record IDs; preserve prior IDs and evidence. The 0.1% primary-unresolved ceiling is unchanged.
- Protocol: freeze the rule text, constants, recovery semantics, cost accounting and pass criteria before new acceptance measurements. Close B11b's reason-preservation and measurement-test defects first; freeze the corrected baseline while preserving the original failed evidence.

  Retain the six frozen scene parameters and explicit cameras, 1280×720 dimensions, 128 iterations, 512 total primary evaluations including recovery, eight samples, seed 1, normal/shadow policies, lighting settings and every existing threshold. Record effective settings, source hashes, identities and browser/GPU environment.

  Validate synthetic failure paths and requalify affected tracing and appearance identities before visual acceptance; CPU checks do not replace GPU qualification. Run all six scenes at each stage, in this order: corrected baseline, FU1 alone, FU2 alone, combined. No tuning or parameter selection occurs between stages.

  Save the four prescribed views and fixed crops, full product reports, per-sample raw status/reason/subreason evidence, union masks, numerators and denominators, recovery counts and work/timing. Assess all existing gates and review appearance; the combined candidate must satisfy the complete gate.

  If the preregistered AO rule or recovery remains insufficient, preserve the failed results and baseline reference, keep B15 blocked, and report no accepted B11c result. No post-hoc constant, workload, denominator or threshold changes are permitted. Claude and Codex may propose another bounded follow-up; the user decides whether to authorize and approve it.
- B00 amendment (B11b D1; Codex B11b r1, run 20261022T033656Z-c329): the normal field-sample ceiling `normalFieldSamples` becomes 7, because the approved one-sided fallback needs the centre value f(p). This is implied by the user-approved fallback, so no new user decision is needed.


**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B14. **Must merge before B15.** Sources: codex-B14-visual-fixes.md, claude-B14-visual-debate1.md, claude-B14-visual-investigation.md (Codex run 20261022T010745Z-fca4; B14 review run 20261022T005526Z-49f5).

**Scope:** implements the lighting-only tint (B11 note), the one-sided normal fallback (B10 note) and the visual acceptance check below, with new B10 tracing and B11 appearance identities and record IDs.

**Files/interfaces/tests:** Modify `normals.wgsl`, the affected appearance shaders and metadata, `renderer.js`, and their tests. Add frozen visual fixtures and a measurement helper; register "Five required frozen scenes meet visual acceptance" in `tests/space.mjs` and `space-rendering.requiredPasses`, updating the emitted pass name and manifest together. Continue rendering and saving the sixth, quaternion scene as required diagnostic evidence, with its threshold comparisons reported separately. Retain identity-, pixel- and sample-indexed status/normal/lighting masks through completed readbacks. Compute per-sample metrics and pixelwise unions from those same eight samples; aggregate counts or the last sample cannot supply union denominators. Test misses, mixed hit/miss samples, isolated failures, reset and stale identities. Correct the product unavailable-normal count using the joint hit/normal mask. Preserve visible lighting-only indication on every flagged pixel, independently of lighting, including after accumulation. Requalify affected tracing/appearance records under new identities, retaining old evidence. B11b follows B14 and therefore B11/B12; B15 starts after its required check passes.

**Visual acceptance (user decision 1, a new required check before B15).** Six frozen scenes are measured; under rev 5.2, five gate visual acceptance and quaternion Julia supplies diagnostic evidence only: default power-8 bulb; default quaternion Julia (`C = [-0.2, 0.8, 0, 0]`, κ = 0); sphere; rotated box; Menger depth 1; Menger depth 2. Cameras are the actual product overview cameras, stored explicitly in fixtures; 1280×720 internal and output resolution, 128 iterations, 512 steps, eight samples, `atlas-aa-v1` seed 1. Capture direct-only, full lighting, normals and termination views with identical rays, and retain fixed crops covering the reported box bands, the Menger hole walls and the right-face arc. Thresholds are Codex's proposals taken as given except the fractal lighting-unresolved ceiling, set by the user at 10% (analytic stays ≤1%); they are new post-discovery product thresholds, not performance or numerical tolerances:

| Metric | Analytic scenes | Fractal scenes |
|---|---:|---:|
| Primary unresolved fraction | 0 | ≤0.1% |
| Numerical failures, primary or secondary | 0 | 0 |
| Unavailable normals among hits | ≤0.1% | ≤1% |
| Lighting-unresolved pixels among hits | ≤1% | ≤10% (user, 2026-10-22) |
| Lighting-only failures presented as primary magenta | 0 | 0 |
| Failed outcomes losing their diagnostic indication | 0 | 0 |

**Scene classes:** analytic = sphere, rotated box, Menger depth 1 and Menger depth 2 (spec §11 exact-distance category); fractal = power-8 bulb and quaternion Julia. If Menger edges or corners cannot meet the analytic unavailable-normal limit under the one-sided fallback, B11b reports it as a finding; the limit is not pre-relaxed (Claude, 2026-10-22).

Measure each individual sample and the final union of flags across the eight samples. Primary unresolved fractions use pixels with any non-miss primary outcome as the denominator; normal and lighting fractions use pixels with any primary hit; report numerators and denominators. Also require zero unavailable normals on independently identified smooth analytic face interiors and normal error ≤10⁻³ rad on ≥99% of those eligible hits (eligibility defined geometrically before comparison, excluding stencil neighbourhoods of edges and competing features; the sphere criterion is preserved); the fixed smooth-face crops contain no diagnostic bands or arc. **Measurement fixes:** count unavailable normals over hits only (`src/space/render/renderer.js:69–74` counted the whole buffer including misses: Menger 792,698, of which 781,268 are misses, leaves 11,430 hit pixels), and take numerator and denominator from the same accumulation (5777 / 55079 mixed an accumulated-image numerator with a last-sample denominator); count status masks directly, not exact RGB values; recolouring alone must not conceal the raw failure fraction.

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
  {start(), toggle(), keyDown(code), keyUp(code), pointerLook(dx, dy), setSpeed(localUnitsPerSecond),
  speed, tick(now), stop(reason: 'escape' | 'blur' | 'hidden' | 'stop-key' | 'deactivate' |
  'history'), active}` (`onStart`/`onStop` notify the gesture owner, which opens and commits the
  `flight` gesture; no inertia; `stop` zeroes every velocity immediately; `tick` applies
  `flightStep` with the elapsed time clamped to 100 ms and does nothing when inactive).
- Produces (`navigation.js`): `bindSpaceNavigation({surface, gestures, flight, getCamera, pick,
  getPickContext, onStatus}) → {reset() → number of released pointers, destroy()}` (pointer orbit; pan with the
  secondary button or Shift; wheel dolly grouped; keys for nudge and the flight toggle `F`;
  `Escape` releases input and stops flight; `blur` and `visibilitychange` stop flight and commit an
  open drag; double-click requests a pick and, on a valid result (`status === STATUS_LABELS.ray[RAY_STATUS.hit]`, the label "approximate hit") after rechecking identity,
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
action away). Excludes DOM layout (B14). **B05 note (Codex run 20261021T123602Z-6e35):** B12's "identical camera" check, under which an identical returned camera starts no gesture, uses `equalCameras` (equal values), never `===`: a stalled dolly at the representation floor returns a new object with equal values. **B05 note (Codex run 20261021T123602Z-6e35 and 20261021T170807Z-a7ee):** rename the parameter description to `setSpeed(localUnitsPerSecond)` (camera-local units per second). Check both the `reconstructHit` and `toLocal` outcomes before `lookAt`; an unavailable outcome is an unresolved pick that starts no focus gesture and leaves the camera unchanged. An identical returned camera starts no focus gesture. Offer Overview, not reset, for loaded coincident scenes. Use the tilt/roll/heading labels with the stated coordinate convention (heading is forward azimuth minus 90°, modulo 360°). Do not label a `focus-re-expression` refusal “precision limit reached.”

**Rev 5.0 notes (2026-10-22; codex-B12-fix1-report.md, Codex run 20261021T223701Z-5191; claude-B12-r1-review.md):**
- **`getPickContext()`.** `getPickContext() → {identity, geometryRevision, dimensions, sampleIndex} | null` describes the eligible published geometry (`createPickRequest` and B09's `pick` require all four), returns null while inactive or pending, and is re-read after the await. B14 supplies it from publication and request metadata.
- **"Approximate hit".** A valid pick has `status === STATUS_LABELS.ray[RAY_STATUS.hit]` (the label "approximate hit", from B09's `status.js`), with the identity and sample checks.
- **F6 stop reasons.** `stopNavigation(reason)` receives the gesture kind (`appearance`, `focus`, `overview`, `pointer`, `flight`, action and handoff kinds, `scene-replacement`), wider than `flight.stop`'s enum, which does not validate; B14 maps history actions and scene replacement to flight reason `history`. Every discrete `apply` (content edits and no-ops included) stops flight and settles navigation first.
- Space history camera equality is T04a, not B12.

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

### Task B12b: Controller (gamepad) exploration — decoding, input state machine, history (spec §13.3, §6, §15; user decision 2026-10-21)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B12. **Scope:** standard-layout controllers
(`mapping === 'standard'`); the user's controller is Xbox style (spec §19.1, answer to rev 4.2 Q11), which reports the
standard layout; non-standard joysticks and flight sticks stay deferred (§17). Co-designed with Codex (runs 20261021T033701Z-268a,
20261021T034408Z-2f95; READY for this scope).

**Files:**
- Create: `src/space/gamepad.js`
- Modify (additive, B12's files): `src/space/gestures.js` (`'gamepad'` in `SPACE_KINDS` and in the drag allowlist),
  `src/space/flight.js` (`setAnalogInput`; stop reasons `disconnect`, `input-suspended`), `src/space/navigation.js` (pointerdown guard; rev 5.0)
- Test: `tests/unit/space-gamepad.test.js`; additions to `tests/unit/space-gestures.test.js` and `tests/unit/space-navigation.test.js`

**Interfaces:**
- Consumes: `createSpaceGestures` and `createFlight` (B12); camera functions `orbit`, `pan`,
  `dolly`, `overview`, `resetOrientation` (B05); the speed range validated by B12's speed control.
- Produces (`gestures.js`, additive): `SPACE_KINDS` and the drag allowlist used by `drag/dragCommit/dragCancel` gain `'gamepad'`; a `gamepad` run uses the
  drag-style path `drag('gamepad', camera)` / `dragCommit('gamepad')` / `dragCancel('gamepad')`,
  never the wheel-burst timer.
- Produces (`flight.js`, additive): `setAnalogInput({forward, strafe, rise, yaw, pitch}, {lookRadPerSec = Math.PI / 2} = {})`
  (normalized demands in [−1, 1]; non-finite → 0); `tick(now)` stays the sole continuous flight
  camera writer and combines keyboard and analog demands; `stop(reason)` clears analog demands as
  well as keyboard state; `stop` reasons gain `'disconnect' | 'input-suspended'`.
- Produces (`gamepad.js`):
  - `GAMEPAD_DEFAULTS = {stickDeadZone: 0.15, triggerDeadZone: 0.05, lookRadPerSec: Math.PI / 2,
    panFocusHeightsPerSec: 0.5, dollyDoublingsPerSec: 1, neutralCommitMs: 200, maxElapsedMs: 100}`
    (plan defaults, not spec constants).
  - `STANDARD_MAPPING` (frozen; standard-layout indices, Xbox-style labels, axis signs): axes 0/1
    left stick X/Y, 2/3 right stick X/Y (up = negative Y, frozen as "push up = pitch up / forward");
    buttons 0 A, 1 B, 3 Y, 4 LB, 5 RB, 6 LT (analog), 7 RT (analog), 8 Back/View, 9 Start/Menu,
    12–15 D-pad up/down/left/right.
  - `shapeStick(x, y, deadZone) → [x, y]`: `r = hypot(x, y)`; `r ≤ d → [0, 0]`; otherwise
    `(v / r) · ((min(r, 1) − d) / (1 − d))²` (direction preserved). `shapeTrigger(v, deadZone)` is
    the scalar analogue. Missing or non-finite components → 0.
  - `decodeSnapshot(gamepad) → {status: 'ok' | 'unsupported-layout' | 'disconnected', motion:
    {orbitYaw, orbitPitch, dolly, panX, panY, forward, strafe, rise, yaw, pitch}, buttons: {...}}`
    (pure; reads only `mapping`, `connected`, `axes`, `buttons[i].pressed/value`; never `timestamp`).
  - `createGamepadInput({getGamepads, gestures, flight, getCamera, cameraOps, clock, defaults,
    onStatus}) → {poll(now), setEligible(eligible, reason), status(), destroy()}`:
    - **Status:** `'unavailable'` (no API, or `getGamepads()` throws, e.g. `SecurityError`) |
      `'waiting'` ("Press a controller button to connect"; an empty list is not proof of absence) |
      `'connected'` | `'unsupported-layout'`; `onStatus({state, id, index})` on change. The
      discovery interaction performs no navigation.
    - **Selection:** lowest eligible index first, kept until it disconnects; a newly connected pad
      never steals control; a replacement starts disarmed; disconnection of an unselected pad
      changes status only.
    - **Arming:** after connection, resumption (`setEligible(true)`), replacement, mode change or
      ownership loss, motion controls must be observed neutral and action buttons released before
      input is accepted.
    - **Per poll (called once per workspace animation frame, before `flight.tick`):** elapsed time
      from the previous poll clamped to `maxElapsedMs`; the baseline resets on suspension. Buttons
      act on rising edges: Start toggles flight; B stops flight (`stop('stop-key')`); Back
      overview; Y orientation reset; LB/RB halve/double speed within the speed range (once per
      press). A jump (overview, reset) first calls `stopNavigation`/commits the open run, then
      applies one camera-only jump, and suppresses continuous motion for that poll. **Orbit mode:**
      left stick orbit yaw/pitch at `lookRadPerSec`, right stick Y dolly (×2 per second at full
      deflection, exponential), right stick X and D-pad pan (½ visible focus-plane height per
      second); all active demands are composed into one pose and submitted as **one**
      `drag('gamepad', pose)` preview. **Flight mode:** left stick forward/strafe, right stick
      yaw/pitch (upright, no roll) at `lookRadPerSec` (flight speed never scales angular rate),
      RT/LT rise/descend along world Z; translation = flight speed with the combined vector's
      magnitude capped at 1; delivered only through `flight.setAnalogInput` (no direct camera
      write).
    - **History:** an orbit run begins at the first accepted non-neutral motion and commits
      (`dragCommit('gamepad')`) after motion controls (sticks, D-pad, triggers) have been observed
      neutral for `neutralCommitMs`, measured from an observed neutral sample, never from the last
      preview, so a delayed frame cannot split a held stick. Within flight, the `flight` gesture is
      the single entry; source ownership (desktop vs controller) is separate from history ownership,
      so an open flight gesture does not reject controller samples.
    - **Ownership:** while a pointer drag, wheel burst or key-repeat run is open, controller orbit
      motion is ignored and vice versa (first owner wins); after losing ownership the pad re-arms.
      Escape, stop, suspension and selected-controller disconnection always stop movement.
    - **Suspension:** `setEligible(false, reason)` (inactive activation token, preparation not
      verified, hidden document, unfocused window, parameter editing, modal dialog) and
      selected-controller disconnection commit an open run exactly once, call
      `flight.stop('input-suspended' | 'disconnect')`, zero demands and disarm.
  - Controller selection, button state and mapping are runtime state, never written to the scene.

**Design assertions:** §13.3 (controller orbit, pan, dolly and basic flight for supported layouts;
one poll per frame with no second loop; at most one camera preview per poll through ordinary
scheduler admission; neutral re-arming; stable selection; eligibility; unavailable API leaves other
navigation intact); §6 (one continuous controller run is one gesture and one camera-history entry;
camera-only jumps add one entry; undo never moves the camera); §15 (disconnect or suspension stops
movement and commits once). Excludes DOM, polling scheduling and status layout (B14). Nothing
imports `src/plane/`. Physical devices are unqualified until exercised.

**Rev 5.0 notes (2026-10-22; codex-B12b-report.md, Codex run 20261021T225841Z-e7ee and fix round 20261021T231148Z-8d55; claude-B12b-r1-review.md):** (a) **look rate:** the optional second argument `{lookRadPerSec}` of `setAnalogInput` (finite, ≥0) makes the normalized yaw and pitch demands scale the supplied angular rate independently of translation speed, which is needed because demands are clamped to [−1, 1]. (b) **gamepad allowlist:** `'gamepad'` joins both `SPACE_KINDS` and the drag allowlist (`drag/dragCommit/dragCancel`); controller first-owner arbitration rests on `openKind`, since B12's private `begin` closes the previous gesture. (c) **Pointer ownership:** B12b modifies `navigation.js` to refuse pointerdown during a gamepad run and `gestures.js` to refuse delayed pointer drag delivery during that run. Neither path captures, settles or displaces the controller owner. Add both regressions to `tests/unit/space-navigation.test.js` and include that file in B12b's test scope. (d) **connect status:** controller connect status refreshes on polls even while input is ineligible, without accepting input (F3).

- [ ] **Step 1: Write the failing tests** (fake `Gamepad` snapshots with `mapping`, `connected`,
  `axes`, `buttons[{pressed, value}]`, `timestamp`; fake clock; fake gestures/flight recording
  calls): `inputs inside the dead zone produce no motion`; `the radial curve squares the magnitude
  and preserves direction`; `non-finite or missing axes produce zero demand`; `a non-standard
  mapping is reported as an unsupported layout and drives nothing`; `a stick run is one
  camera-history entry`; `held deflection across a delayed frame remains one history entry`;
  `equal-duration constant input at different frame rates produces equivalent movement`; `one poll
  produces at most one preview and flight receives one update per frame`; `disconnect mid-run
  commits the last preview and zeroes velocity`; `held controls across blur, workspace switching or
  controller replacement cause no resumed movement`; `polling while ineligible does nothing`;
  `overview and reset stop flight and commit the run before the jump`; `buttons act on rising edges
  and a held bumper changes speed once`; `a newly connected controller does not steal control and an
  unselected disconnect changes status only`; `a pointer drag owns the camera and controller orbit
  input is ignored until re-armed`; `a missing API or a throwing getGamepads reports unavailable and
  keyboard navigation still works`; `Gamepad.timestamp is never used to suppress held motion`.
- [ ] **Step 2: Skeleton and RED** — `--expect-fail "a stick run is one camera-history entry"`.
- [ ] **Step 3: Implement** `gamepad.js` and the additive B12 hooks against the fakes (the
  integration this task closes: controller snapshots → demands → gestures/flight → history).
- [ ] **Step 4: GREEN**, `npm test`.
- [ ] **Step 5: Commit** — `"Add Space controller (gamepad) exploration (1b.1 B12b)"`, then the gate.

**Expected outputs:** controller exploration that is Node-testable without a DOM, a GPU or a
physical controller; seventeen named tests passing.

---

### Task T04a: Space semantic camera equality in shared history (follow-up to B12; spec §6; rev 5.0)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** 1a T04, B05. **Required by:** B14 (merged before it). Source: codex-T04a-report.md (Codex run 20261021T224551Z-d59b; draft plan entry; B12-F3 ruling in claude-B12-r1-review.md).

**Scope:** `createHistory({..., cameraEqual = (a, b) => canonicalJson(a) === canonicalJson(b)})` in `src/shared/history.js`, used only by `recordCamera`, so every pose comparison (gesture settlement, direct `apply`, whole-scene settlement, undo and redo) uses it; B05's `equalCameras` stays in `src/space/camera.js` and is injected by the caller, so shared history imports no Space arithmetic; Plane keeps the default and its existing history tests unchanged. Files: `src/shared/history.js`, `tests/unit.manifest.json`, new `tests/unit/history-camera-equality.test.js` (sign-negated restore, commit, undo and redo, different poses, forward-branch handling, canonical Plane defaults). **B14 obligation:** pass `cameraEqual: equalCameras` for Space; T04a wires no workspace.

---

### Task B13: Recovery orchestration (spec §7.3, §14, §15)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B06 (contract), B07, B09; B09b (allocation integration).

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
  `onBudgetExceeded(job) → {continuation: 'resume' | 'lower-cost'}` (offers explicit recovery. Accepted recovery creates a fresh plan with new `jobId` and `requestId`, using the current device epoch. A settled job is never revived. Resume may rebind completed compatible geometry under §7.2's epoch, identity and resource-lifetime checks; the new elapsed-work budget starts fresh), `cancel(jobId) → {accepted,
  done}` (from the scheduler; forwards both B07 return variants unchanged; never "preempted"; loss handling calls `interrupted(lostEpoch)` before installing the next epoch), `destroy()`}.

**Design assertions:** §14 (device loss keeps the job and snapshot; one automatic viewport
recovery; repeated loss stops automatic retry; allocation failure releases obsolete resources and
offers an explicit lower-cost choice); §15 (every row that applies to 1b.1); §7.3 (outcomes;
pause); recovery never touches the scene, undo history or camera history.

**Rev 5.0 note (2026-10-22; codex-B13-fix1-reply.md and codex-B13-report.md "B14 note", Codex run 20261021T223901Z-7aab) — recovery facade for B14:** B14 MUST prepare, render and cancel viewport work only through `recovery`, submit `renderer.resize()` requests through `recovery.render`, pass live generation guards without rewriting their epoch, await `recovery.prepare()` while recovering, honour render refusal while recovering or stopped, and submit its current request after `recovered` with `job: null` or after an explicit retry.

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

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** B10–B13, B12b, T04a, B09b, B09c; **1a T12 merged** (and
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
- Consumes: **(1a, merged)** `createShell`, `createPlaneWorkspace({shell, discoveries}) →
  {inspection, destroy()}`, `createNotifier`, `installDialogs` (T12); everything above.
- Produces: `createSpaceWorkspace({shell, backendFactory = createWebGPUBackend, clock}) →
  {inspection, activate(token) → Promise<{outcome}>, deactivate(), destroy()}` (`inspection` =
  `window.atlas.space`: `scene`, `history`, `lastReport`, `lastPublication`, `cameraStatus`,
  `backendDiagnostics`, `whenIdle({timeoutMs})`, the harness commands `requestCamera(pose, {phase = 'commit'} = {})`, `editParameter(path, value)`, and `cancelCurrent()`, and the subscriptions `onRequest(listener)`, `onPublish(listener)`, `onPresent(listener)`, and `onReport(listener)`. `requestCamera` accepts only `phase: 'preview' | 'commit'`. A preview follows the same camera-gesture preview path as a drag, requests draft quality, and creates no camera-history entry. A commit closes an open camera-preview stream at the supplied pose, creates one camera-history entry for the stream, and requests settled quality; without an open stream it retains the existing discrete settled-jump behavior. The default is `commit`. `onRequest` emits `{identity, purpose, createdAt, request}` once for each created request before it is handed to the recovery/render path. `identity` identifies that request, `request` is its immutable snapshot, and `createdAt` uses the same monotonic clock as publication and presentation events. It is the request-creation boundary, not submission, admission, or GPU start. `onReport` emits each completed render report, including superseded work. Each subscription returns an unsubscribe function. (Claude/Codex agreed, rev 5.3.) The inspection API also exposes the test seams `setBackend(fake)`, `injectLoss()`,
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
  diagnostics extended with the backend identity and tracked inventory. **Controller wiring
  (B12b):** the workspace's animation-frame callback calls `gamepadInput.poll(now)` once, before
  `flight.tick(now)`, with no second loop or timer, and keeps running while controller input is
  eligible even when rendering is idle; `getGamepads` is `navigator.getGamepads?.bind(navigator)`
  (absent → unavailable); `gamepadconnected`/`gamepaddisconnected` refresh status only;
  `setEligible` follows the activation token, verified prewarm, `visibilitychange`, window
  `focus`/`blur`, parameter-input focus and modal dialogs; `#space-controller-status` shows
  "Press a controller button to connect", the connected controller id, "layout not supported in
  this release", or "controllers unavailable"; the panel documents the standard mapping.
- **Activation contract (both workspaces; both methods idempotent):** `deactivate()` first closes
  admission and invalidates pending picks and pending activation, then settles navigation
  (preserves the last previewed pose, commits an open gesture exactly once, stops flight and
  calls the controller's `setEligible(false, 'deactivate')`), stops
  automation (tours, palette animation), releases pointer capture and keyboard focus, and detaches
  its global listeners; capture-loss callbacks arriving afterwards cannot cancel that commit; all
  prior history entries, the scene, undo history and camera history are preserved; Space marks its
  views hidden in the scheduler and lets submitted batches drain, never claiming preemption; an
  in-flight Plane export keeps its lease and completes under T07/T08's rules, its completion
  callbacks respecting the inactive state. `activate(token)` re-attaches listeners, resumes views,
  and issues at most one current-state request when the publication is stale (Space may then
  publish several refinements from it); it does not restart stopped tours, palette animation or
  flight; a late activation whose token is no longer current does nothing.


- **Paused editing.** Workspace edits while paused still submit coalesced `request()` calls. The 1b.3 Update control calls `update()` to select the latest submitted snapshot.

**Design assertions:** §13.1 (two retained investigations, one active view; a switch preserves
scene, camera, undo and camera history; hidden work pauses; captured input released; a fresh start
opens Plane without acquiring a Space device); §13.2 (viewport, parameter panel, indicators); §14
(Space scene files); §15 (first-use compilation visible; lost input one action from overview, reset
and history); §4.3 (every existing Plane assertion survives). **B05 note (Codex run 20261021T123602Z-6e35 and 20261021T170807Z-a7ee):** a fresh Space investigation and its history are seeded from `overview(bulb)`; any corresponding B02 default/test changes belong to this integration change.

**Rev 5.0 notes (2026-10-22; task-B14-report.md "Deviations" D1–D2 and Fix round 1, codex-B14-r1-findings.md, Codex run 20261022T005526Z-49f5):**
- **Pick context.** `getPickContext()` returns `{identity, geometryRevision, dimensions: internalSize, sampleIndex}` from the request of the last publication, and null while inactive, unprepared, pending or dirty, or when the publication's generation differs from `liveGeneration()` (fix round F1).
- **New seams.** The switcher gains `pending()` (the pending workspace, distinct from the visible one; `current()` stays the visible workspace) and Plane gains `isActive()` and `openShareHash(hash)`, used by the new `src/ui/share-link-router.js` (one persistent `hashchange` listener wired in `app.js`; it acts only while Space is active or preparing, so Plane's own listener is not doubled; invalid or unsupported links are reported with the view unchanged). Files added: `src/ui/share-link-router.js`, `tests/unit/share-link-router.test.js`.

  **Rev 5.1 activation clarification:** pending Space activation normally retains Plane until a current-token presentation. After successful preparation/prewarm, an allocation failure or budget overrun may instead reveal Space's actionable recovery UI before presentation; this does not establish that an image was rendered. Other activation failures retain or restore Plane. Only the latest activation token may commit visibility.

  Repeated Space selection while awaiting presentation settles the earlier activation as `superseded`; the latest continues waiting. Cancellation of the awaited render without a replacement settles activation as `cancelled`, clears pending/inert state and restores usable Plane without an unavailable-error notification. Replacement rendering continues the activation wait. Retain regression coverage for reselection, cancellation/replacement, and both recovery exceptions before presentation.
- **Test hooks.** `createSpaceWorkspace` takes an extra `env` (document, window, frames, `getGamepads`, viewport size, flight and gamepad factories, and optional `setTimer`/`clearTimer` scheduler dependencies). Production retains browser timers; the timer seams enable deterministic tests without changing scheduler policy; `createWorkspaceSwitcher` takes `toast` and exposes `ready`; workspaces have an optional `focus()`; the inspection object carries harness extras. All are accepted additive seams.
- **Stale dependency rows (F8).** The table rows for 9ace5fe, T12 (947d41f) and T13 (4e58d0e) are now merged and are updated above.

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
  detaches its keyboard listener`; `the frame callback polls the controller once before the flight
  tick and stops polling when ineligible`.
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
  does not interrupt the export`; `Keyboard focus, capture and flight end on blur and on switching`; `A scripted gamepad orbits and
  flies, each run is one camera-history entry, and a disconnect stops flight` (`page.addInitScript`
  replaces `navigator.getGamepads` with a scripted fake and dispatches `gamepadconnected`; no
  physical controller is a gate dependency).
- [ ] **Step 3: Implement** the workspace, the switcher, the panel and the Plane activation
  methods (the integration this task closes: the composition root owns two workspaces and one
  active view).
- [ ] **Step 4: GREEN** — `npm test`, the Plane gate suites (`browser`, `browser-hardware`,
  `navigation`, `graphics`), `space-shell`, then `flock … npm run test:space -- --group shell`.
- [ ] **Step 5: Commit** — `"Add the Space workspace, the workspace switcher and the activation contract (1b.1 B14)"`, then the gate with `ATLAS_GPU_HANDOFF`.

**Expected outputs:** two headless passes; eleven headed passes; every Plane suite green with
unchanged assertions.

---

### Task B15: Performance acceptance, the recorded investigation, the audit and the handoff (spec §16.4, §3, §16.3; P3)

**B15 audit scope note (Claude–Codex ruling, 2026-10-22):** The audited commit set is
`git rev-list main..feat/project1b1`, pinning both tips as full SHAs in the live acceptance
manifest (use the reviewed implementation head for the feature tip when auditing a candidate).
Project 0 and Project 1a ancestors already reachable from `main` retain their shipped audits;
they are not reclassified or re-audited as 1b.1 commits. Missing typed fast evidence may be
re-recorded only by running the exact historical commit's own unit manifest and build now.
Such records retain the true current run timestamps and `recordedRetrospectively: true`.
They qualify only with a byte-pinned contemporaneous ledger excerpt recording a passing
unit/build fast check for the same SHA; absent or contradictory original evidence fails closed.
No original run timestamp or result is invented, and this does not retrospectively make WIP
promotable or change the four enumerated transition classifications.


**B15 r16d C1–C5 implementation clarification (2026-10-23):** Index idle textures by the validated allocation key, constructing it once per requested description. Checkout removes a candidate immediately; duplicate descriptions require distinct native resources, and rollback restores their index membership. Maintain idle byte totals incrementally. The 256 MiB/44-entry idle bound and 1 GiB peak concurrent tracked accounting remain unchanged. Reuse validation and canonical bytes only for immutable snapshots produced by the same scene codec, held weakly; arbitrary caller-owned and shallow-frozen inputs are revalidated and each codec retains its own admission limit. The Worker’s two-transfer bound is global across all sessions in one renderer/scheduler admission domain: each transfer retains a scheduler lease until acknowledgement. It is not a per-session allowance. Preserve validate-before-present; yielded main-thread slices are an explicit diagnostic seam only. Import `scripts/perf-smoke.mjs` unchanged from `39b7f06` (B15 round 18; supersedes the d9cbae5 smoke import and adds the P3 confirmation check); rendering changes require Claude’s hardware smoke before round sign-off, targeting zero orbit and stress issuance delays over the frozen 4 ms limit in three consecutive runs per scene. CPU operation-count tests do not certify browser GC latency or substitute for unchanged P3 acceptance.

**B15 r16 F7 policy amendment (Claude/Codex, 2026-10-23; delegated product direction, user informed):** The round-9 evidence-class exception extends to implementation-WIP commits on task branches after cutover `76de54b1df64b67a8764b05918671c218df93da0`. The independently pinned `wipEvidence` policy lists full SHAs through implementation head `8d694468385a77e2a16b716a3ee5b12e415c5677`, including all 15 B15 WIP commits; future task-WIP enrollment requires another provenance-bearing policy-pin update, never a manifest assertion. Such WIP may use retrospective typed unit/build checks alone, at actual re-run times on the exact clean unchanged commit with its own manifests and confirmed cleanup. A failure remains a failure. These records are non-promotable and require a fully gated descendant boundary.

**B15 R23-Q1 enrollment (Claude/Codex, 2026-10-23; peer decision under the user delegation, user informed):** Enroll only 3fb56c84523d0e3c85ac3bf6933b343889189bb5, 8a812be2669fbf461db5ec32f0e4f718606406b7 and ac61cdd5ef3973d9d01a45d562d5c43976242a2c in retrospective implementation-WIP. Require typed passing unit/build evidence on each exact clean unchanged commit, its own manifests, actual retrospective timestamps and confirmed cleanup. Keep promotable:false and require a fully gated descendant boundary. Diagnostic plain runs are not typed evidence. The candidate tip is not enrolled by this amendment; it requires its own qualifying full gate.

**B15 R23-Q3 historical failure (same peer provenance):** Permit only 4ffda8835bee7c7a72949dffd7baf0aed352609c to use disposition exception, audit state accepted-by-exception and promotable:false under B15-R23-Q3. Preserve the exact failed record and unit log, original timestamps, 1088 tests with 1086 passed, one failed and one cancelled, and both named unsuccessful results. This is historical accounting only; it is neither passing fast evidence nor a passed gate or promotion permission. Remove this SHA from passing retrospective-WIP eligibility. Require independently pinned failure/log and passing unit/build evidence for immediate repaired child b4ffb02ef0d148f8e1f9b8020a79fc559ffb97f7, plus a fully gated descendant boundary supplied by the live manifest. Verify exact-commit Git facts, repair ancestry and containment at every gated or promoted boundary in the audited range. No gated or promoted tip or promotion candidate may be the failed SHA, and no acceptance boundary may contain it without the repair. A passing descendant alone is insufficient: missing, mismatched or contradictory evidence, or the absence of a qualifying boundary gate, leaves the exception unaccepted. This single-SHA exception is independently pinned; it neither changes P17-2 nor authorizes any other failure.

**B15 R23-Q2 gate correction:** A cleanup failure declaration is a runner marker at column zero matching `^CLEANUP-UNCONFIRMED\b`, a supervised `cleanup: unconfirmed` result, exit 125, or the unit runner’s structured cleanup failure. Quoted markers in TAP test names or diagnostics are not cleanup declarations. Use the same marker predicate for suite classification and overall gate cleanup. Real cleanup failures still stop later suites; suite requirements, deadlines and evidence checks remain unchanged. This is the narrow correction to the otherwise unchanged full-gate runner authorized in round 23.

**B15 R23-Q4 agreement (Claude/Codex, 2026-10-23; peer decision under the delegation, user informed):** Adopt the round-23 staged-promotion-merge audit clarification in Step 5 below. The five docs-only-WIP rows retain their existing fully gated descendant-merge requirement. This clarifies the acceptance process; it does not relax the pinned policy, fabricate a boundary gate or authorize promotion before its gate and audit pass.

**B15 r16d C6/C7 amendment (2026-10-23; delegated peer process, user informed):** C6 is agreed by Claude/Codex. The first-parent mechanical docs-only WIP rule permits the prefixes `docs/superpowers/` and `docs/codesign/` plus the exact root paths `AGENTS.md` and `CLAUDE.md`. It admits the five pinned commits `27dc545`, `547a648`, `5227ea3`, `beae408` and `4bba5c3`; code, tooling, gate files and path lookalikes remain excluded. Every other tree entry must match the first parent; explicit full-SHA enrollment and a fully gated descendant merge remain required, and docs-only WIP is never promotable. The separate historical-docs-only policy is unchanged. **Superseded by P17-2 (Claude/Codex agreement, 2026-10-23):** Claude and Codex agree to the single-commit historical exception defined in the independently pinned policy. Codex withdraws the requirement that this row remain permanently unaccepted. Original failure evidence and previous decisions remain on record; the exception does not change that failure into a pass. Require the pinned failing record and named-test log, the immediate passing repaired child d7cf20d, the qualifying gate a905370 and identical-tree promotion baa5ab5, including repair ancestry at acceptance boundaries. Record disposition `exception`, state `accepted-by-exception` and `promotable:false` only for the full SHA `2f91343fe82e08a915b7de81bfd87c46baa0e35c`; missing, mismatched or contradictory evidence leaves it unaccepted. Legacy full-gate exception rules and passing-WIP eligibility are unchanged.


**Owner:** Codex. **Reviewer:** Claude. **Depends on:** B14, B11b (the visual acceptance check passes before sign-off); **1a T13** (audit scripts).

**Files:**
- Create: `tests/space-performance.mjs` (headed, `gpu: true`, `benchmark: true`; one manifest
  entry per P3 scene: `space-performance-bulb`, `space-performance-quaternion`,
  `space-performance-menger`, each `--scene <id>`), `tests/support/timing.mjs`,
  `scripts/audit-gates-1b1.mjs` (writes the 1b.1 output path; contract under Interfaces),
  `tests/unit/acceptance-audit.test.js` (WIP cannot satisfy a boundary; stale-target promotions fail; unapproved retrospective classifications fail; missing or invalid fast evidence fails), `docs/reports/project1b/1b1-performance-<scene>.json` (one per scene, generated),
  `docs/reports/project1b/1b1-investigation.md` (the recorded investigation),
  `docs/reports/project1b/gate-ledger-1b1.json` (generated by the audit)
- Modify: `tests/suites.manifest.json`, `README.md`, `HANDOFF.md`, `AGENTS.md`, `CLAUDE.md` (exact
  replacements for the Space paths and commands; the protocol section identical in AGENTS.md and
  CLAUDE.md)
- Test: `tests/unit/timing.test.js`, `tests/unit/acceptance-audit.test.js` (assertions: WIP cannot satisfy a boundary; stale-target promotions fail; unapproved retrospective classifications fail; missing or invalid fast evidence fails); the performance suites.

**Interfaces:**
- Consumes: **(1a, merged)** `auditLedger`, `judgeRecord`, `requiredIdsFromManifest` (T13;
  gate execution unchanged); `window.atlas.space` harness commands and subscriptions (B14); P3,
  its workload manifest (B00) and `performance-predictions.json` (B04), both by hash; the B08 and
  B10 suite reports (stratum results keyed by matrix hash and stratum id).
- Produces (`scripts/audit-gates-1b1.mjs`): `scripts/audit-gates-1b1.mjs` implements disposition-aware auditing while retaining legacy per-commit validation outside the approved transition. It consumes a versioned acceptance manifest recording full commit SHAs, policy version, approval provenance, cutover, retrospective classifications, feature boundaries, WIP ancestry, promotion parents/tree IDs, the approved documentation allowance and evidence references. The live manifest and final audit remain outside the commits they describe. Full-gate records retain their schema and exact-commit validation through `judgeRecord`. Fast checks produce separately typed records identifying the clean, unchanged commit/tree, manifests, unit/build outcomes and confirmed cleanup; they cannot satisfy a full-gate requirement. The audit verifies classifications against Git ancestry and boundary evidence, rather than trusting labels. Existing `scripts/audit-gates.mjs` retains legacy behavior.
- Produces (`timing.mjs`): `scheduleAbsolute({clock, setTimer}, targets, callback) →
  {rearms, lateByMs[], longTasks[], invalidated}`. Acceptance scheduling rounds every positive wait up to a whole millisecond and re-arms against unchanged absolute targets, yielding the main thread between checks. It never issues before a target and does not busy-wait to reach one. An early-wake busy-spin mode may be retained as an explicitly selected diagnostic, but its results cannot satisfy P3 acceptance or be pooled with acceptance trials. A request issued more than 4 ms late is
  recorded as a timing anomaly, never retried silently; long tasks from a `PerformanceObserver` in
  the page. Performance evidence schema version 5 records `measurement.schedulingMode`, `measurement.leadTimeMs`, instrumentation flags and `measurement.timingPolicy` on every attempt before work begins and in its page trial. P21-1 judged attempts use `measurement.timingPolicy: 'atlas.p3-timing-budget-v1'`. Preserve every raw input observation and record expected and observed input counts, the count strictly above 4 ms, maximum lateness, strict timing invalidation and policy timing invalidation. The complete frozen schedule contains 2,315 inputs, with its existing phase counts and identities. Derive policy eligibility from those observations; missing evidence is non-accepting. Keep `scheduleAbsolute` unchanged, including its strict `invalidated` flag for any lateness above 4 ms. P3’s classifier applies the aggregate policy separately; other timing-helper consumers do not silently inherit this allowance. Record `schemaVersion: 5` on the evidence envelope and each attempt. Schema-version-4 attempts and attempts under another or missing timing policy cannot pass under this policy or be pooled with version-5 acceptance trials. Retain the raw `trial.issued` entries `{phase, index, target, issuedAt, lateByMs}` in the page performance clock, with `trial.timeOriginMs` and phase windows. Record `timing.expectedInputCount`, `observedInputCount`, `lateOver4Count`, `maxLateByMs`, `strictInvalidated` and `policyInvalidated`, including partial attempts; the classifier derives eligibility from the raw entries rather than trusting these summaries. Judged scheduling is `absolute-ceil-timeout-v1`, with zero lead; the long-task observer and GPU clock monitor are enabled, and the MessageChannel stall probe and busy spin are disabled. Missing or diagnostic configuration cannot pass or be pooled with acceptance trials; application-failure precedence remains first. The timing helper records anomalies only; `classifyAttempt(attempt) → {state:
  'passed' | 'failed' | 'inconclusive' | 'excluded', reason}` in `tests/space-performance.mjs`
  applies P3's precedence: an established application target failure is `failed` regardless of
  timing anomalies; an attempt is `excluded` only for a demonstrated harness failure without an
  established application failure; P3 timing ineligibility under the recorded policy is `inconclusive`. `scripts/audit-gates-1b1.mjs`
  also performs the **evidence join**: it joins the B08 and B10 stratum results by matrix hash and
  stratum id and requires passing evidence for every mandatory stratum; missing,
  duplicate-conflicting, failed or inconclusive results block acceptance, and diagnostic records
  never fill a missing mandatory result.

**Design assertions:** §16.4 verbatim through P3; Project 0's timer requirements; §16.3 (every audited commit is accounted for under the applicable policy; every acceptance boundary has qualifying evidence; WIP remains non-promotable; ordinary WIP is reported as `accounted-wip`, while the specifically approved P17-2 historical failure may be reported only as `accepted-by-exception`, with its failed evidence preserved; exception inputs are explicitly scoped); §3 (the 1b.1 release row demonstrated end to end).

**Rev 5.0 notes (2026-10-22):**
- **Exception inputs.** `scripts/audit-gates.mjs` hard-codes the project1a exceptions path; B15 takes explicitly scoped exception inputs (the B08 exceptions move to a 1b.1-scoped file, or both files are read with explicit ranges) (progress.md; claude-gate-rule-debate1.md item 6 and codex-gate-rule-position.md, Codex run 20261021T212923Z-663c).
- **B11-F2 and B11-F3** (codex-B11-r1-findings.md, Codex run 20261021T234913Z-9ed0): the sRGB GPU transfer is untested (feed known unequal linear values through the GPU path); depth normalisation is untested (assert independently calculated normalised depths at several positions, identical with normal availability toggled).
- **Prewarm** is measured cold, with the browser and driver shader caches cleared (recorded from the design-batch brief; no source file states the cache-clearing method. task-B11-report.md D5 measured it on a fresh device; task-B01-report.md left driver-cache state unmeasured).
- **Memory** (task-B14-report.md, codex-B14-r1-findings.md): 88 B/px per settled request and about 122 B/px at peak at 1280×720 (B14); the 4K figure uses peak concurrent tracked allocation, retained and retiring resources included, not the settled figure or an extrapolated viewport peak.
- **B09-F9** (claude-B09-r1-review.md): three full-frame readbacks per sample (status, normal, lighting status; 16 B/px, only the last published counts reach the report) are a P3 risk. **Nonzero retiring-allocation coverage:** add an obsolete-cache allocation case with nonzero `released` and `retiring` (B14 never exercised one).
- **B09-F10** (claude-B09-r1-review.md; resolved, user-approved 2026-10-22, rev 5.3): During a continuous camera-navigation stream, the newest completed interactive draft may publish while a newer request from that same stream is outstanding. A publication that does not match the live request/revisions must visibly carry the pending mark and retain its own request identity, camera, quality and termination counts. The exception applies only to camera navigation within the same monotonic stream, view and device epoch, with unchanged non-camera scene inputs and output dimensions. Content or appearance edits, scene replacement, a new navigation stream, resize, deactivation, cancellation or device loss invalidate the corresponding older work; returning to an earlier content key does not revive it. Publication order is monotonic: an older request cannot overwrite any newer published request, including a settled image. Settled and refinement publications still require strict current-request and dependency matching. Picking continues to require a current matching publication. Tests cover pending publication while a newer camera request waits, invalidation even without a replacement submission, A → B → A rejection, device-epoch rejection, and refusal to overwrite a newer settled publication. B15 reports measured evidence for both the strict faster-than-input option and the pending-draft option; changing this rule does not weaken any P3 target.

- [ ] **Step 1: Tests** — Node: `waits are rounded up and scheduled against absolute targets`;
  `a late issuance is recorded as a timing anomaly and an established application failure stays
  failed`; `three passing trials cannot rescue an earlier application failure accompanied by late
  issuance`; `the audit wrapper writes the 1b.1 ledger path and judges every commit in the range against the versioned acceptance manifest, failing closed on an unknown disposition or missing boundary evidence`; `a promotion is accepted as merge-tree-identical only when its tree object ID equals the gated candidate's`; `a docs-fast commit cannot expand its own allowlist`;
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
  `main`). The handoff text records the **user decision of 2026-10-22** (rev 5.3): "demonstrated end to end" for 1b.1 is a documented flagged-Chrome launch route (`npm run dev:gpu`, which respects `PORT`/`--port`, or the documented flagged command) on this workstation, together with an actionable Space-unavailable message in ordinary Chrome that keeps Plane working. Stock flag-less browser support is a later item.
- [ ] **Step 4: Commit and gate** — `"1b.1 acceptance: performance evidence, recorded
  investigation and handoff (B15)"`, then the gate with `ATLAS_GPU_HANDOFF`.
- [ ] **Step 5: Audit** — `node scripts/audit-gates-1b1.mjs <1b.1 base> <implementation head>`
  on the exact head just gated. For B15’s five enrolled docs-only-WIP rows, retain the existing fully gated descendant-merge requirement. Audit the staged promotion merge into `feat/project1b1` as the final acceptance boundary after its own full gate passes, using disposition `merge-gated` and the exact merge SHA. Each docs-only row must name that descendant merge, retain its approved full-SHA enrollment and pass the first-parent path rule. A one-parent task tip containing the current integration tip does not satisfy this docs-only boundary rule, and a tree-identical promotion with fast checks alone does not substitute for the merge’s full gate. Candidate gating and the other promotion checks remain required. A task-tip audit is preliminary and may retain these rows as unaccepted. Do not accept or advance the promotion until the required gate and audit pass; account for every commit and validate every acceptance boundary in the final pinned range. Commit `gate-ledger-1b1.json`. If this commit changes only already-approved output-only summary paths, validate the summary against its evidence, run and record fast checks, and classify it `docs-fast`; otherwise apply the ordinary acceptance rule. Run a final audit including that commit, retain the result externally in `artifacts/gates/`, and name the final audited head.

**Expected outputs:** three performance reports with per-trial results; the investigation
document; the audit summary with every commit accounted for, accepted boundaries and WIP reported separately, and the audited head named. Codex owns `tests/space-performance-ladder.mjs`, its browser driver and `tests/reference/performance-ladder-v1.json`; Claude executes every registered rung. The driver reuses product request construction, shaders and encoding, with injected diagnostic-only switches and validated combinations. Product configuration selects L6b and exposes no ladder controls. L6a remains a diagnostic comparison; L6d is available but off by default.

Register L0, L1, L2, L3, L4, L5a, L5b, L5c, L5d, L6a, L6b, L6c and L6d. For each of bulb, quaternion and Menger, run three preregistered repetitions of the paced frozen P3 workload and an unpaced replay of four consecutive copies of its 1,875 orbit poses, in order, without dropping poses. Use two live frame slots and at most two outstanding submissions throughout the paired ladder. Fix warm-up and run order; bracket comparisons with L0. Run separately instrumented timestamp repetitions and record GPU clocks without changing clock policy.

Let L be paced draft request-to-presenter-completion p95 across orbit and interaction combined, excluding settled work, and T be confirmed unpaced drafts/s. For each rung, report incremental costs `(Lr−Lprevious)/L0` and `(Tprevious−Tr)/T0`, alongside absolute values and cumulative costs. Branches compare against their common predecessor. The converged, frozen incremental limits are 10%/10% for L1, L3, L4 and L6; 5%/5% for L2; 25%/25% for L5a; and 10%/10% for L5b, L5c and L5d. These are engineering limits, not measured results or replacements for P3. L0–L3 have benchmark-completion throughput without diagnostic confirmation; label it incomplete evidence, used only as the denominator for layer comparisons.

Record submission, completion, mapping, validation, provisional presentation, validated publication, restoration and failure separately. Report unavailable P3 metrics explicitly on incomplete rungs. Sum active GPU pass durations; do not label a timestamp span containing a host map wait as GPU work. Include restoration and rejected work in costs. After correctness review and candidate freeze, subsequent acceptance runs execute unchanged P3 on product-default L6b without diagnostic switches or tuning. Executor-3 L6a evidence retains its original identity and limitations.

**B15 r15 evidence amendment (F1–F4, O3):** Use `atlas.performance-ladder-evidence` schema version 3. Every cell must carry the same nonempty browser-session ID, a unique immutable attempt ID, explicit classification and confirmed cleanup; reject legacy schemas, missing classification, recorded errors, cleanup failures and invalidated timings. Repeated cell selections retain separate exclusively created files. Comparison lists every attempt and requires explicit selected/excluded dispositions, with reasons and exactly one selected attempt per repeated cell; exclusions cannot hide failed evidence. Supply these via `--compare <directory> --dispositions <JSON file>`, mapping attempt IDs to `{ "state": "selected" | "excluded", "reason": "..." }`. Preserve per-phase draft latency and per-phase lateness count, min, p50, p95, p99, max and count strictly above the frozen 4 ms threshold. Raw lateness samples retain their phase. Continue after ordinary cell errors only when cleanup is positively confirmed. Await monitor termination after SIGTERM and, if needed, SIGKILL; save the attempt and escalation/cleanup evidence before terminal `CLEANUP-UNCONFIRMED` exit 125. The cleanup flag is sticky across later deadlines; unknown driver/probe isolation or a failed bounded page teardown stops the session as well. Preserve the original cell error alongside cleanup errors. These diagnostic changes do not establish P3 acceptance or identify the cause of callback lateness.

**B15 r15 O1b amendment (observation-only clock gating):** Freeze `atlas.gpu-clocks-v1`: both ladder cells and P3 attempts collect `timestamp,uuid,clocks.sm,pstate,power.draw` using read-only `nvidia-smi` at 100 ms with UTC CSV. Preserve raw samples and cleanup evidence; report whole-cell, per-phase and orbit-plus-interaction median SM clocks, bands, band occupancy, P-state counts and median power. Summaries use measured phase windows, excluding setup, warm-up and coverage replay. Clock bands are `(0,270)`, `[270,600)`, `[600,1200)` and `[1200,∞)` MHz. These conservative comparison boundaries separate the recorded regimes; they are not hardware-calibrated thresholds. Each window needs at least two samples, at least 80% of the requested 100 ms cadence, and no boundary/inter-sample gap above 500 ms. Missing/unsupported/malformed samples, collector errors or ambiguous multiple GPUs make telemetry unavailable. Compare paced latency populations separately from unpaced throughput populations, including both same-mode L0 brackets: all compared medians must share a band, have maximum/minimum ≤1.10 and each have at least 90% of samples in that band. Otherwise the comparison is `inconclusive`, without normalized layer win/loss or budget verdict. P3 acceptance requires usable recorded clocks but no particular band, band occupancy or agreement across trials; established application failures retain priority over missing telemetry. A collector cleanup failure persists evidence and stops through the sticky exit-125 path. Ladder evidence keeps schema v3 with this versioned clock protocol and a changed ladder-manifest hash; P3 evidence advances to schema v3. Workload payloads and product thresholds remain frozen. No clock locking, host NVIDIA configuration change or artificial warm load is permitted. O1b supersedes the causal interpretation of the earlier scope/skip timing A/B; scopes remain required by §9.1, with no product remediation from O1b.

**REC-G qualification and evidence:** `rec-g-p3-envelope-v1` covers internal dimensions up to 640×360, ≤64 iterations, ≤256 ray steps, sample zero/one sample and no secondary rays; analytic sphere/box, bulb powers 7/8, Menger depths 1/2, and quaternion C=(-0.2,0.8,0,0), κ=0/0.5. Device dispatch/texture limits also apply. This bounds the candidate; the executor must establish active group work ≤8 ms for the registered workloads. A measured over-target workload returns to bounded subdivision. Qualification is not inferred from queue fences. Preregister same-packet GPU/full-decode equivalence across all statuses/reasons, normals, recovery outcomes/stops, malformed packets, partial workgroups, reset/reuse, stale identities and loss. Invalid summaries cause zero CPU-gated present submissions. Retain settled shaders, quality, seeds, accumulation order, tiling and full masks; compare baseline/candidate display, geometry and diagnostic bytes on identical frozen inputs. Evidence protocol `atlas.performance-records-v2` joins immutable pending events and terminal updates by frame ID plus full identity, rejects unknown/conflicting updates and drains before classification. Freeze the manifest and protocol before measurement; preserve previous evidence.


- **Conditional remediation (rev 6.0).** B15-G0 and B15-G1 (grouped submissions, only if unchanged P3 establishes an application failure) are listed under "B15 remediation: conditional grouped submissions" in the 1b.1x amendment below.

---

## 1b.1x Explore and compose (rev 6.0 plan amendment)

*Added in rev 6.0, Claude/Codex converged 2026-10-22 under the user's delegation of product direction ("you and Codex are running this… This is your show"); user informed. The governing spec text is §13.11 and the §7.2 and §8.1 amendments of the same revision.*

### Scope and identities

Normal prerequisite: accepted B15. B15-G0/G1 below are remediation tasks and may precede that acceptance.

This increment adds no runtime dependency, second Space backend, mathematical family, numerical-profile relaxation or weaker P3 target.

Use these identities:

| Concern | Identity |
|---|---|
| Scene appearance | `space-compose-v1` |
| Appearance implementation | `space-appearance-v4` |
| Artistic attribute definition | `radial-min-v1` |
| Attribute implementation | `space-orbit-attributes-v1` |
| Target layout | `space-targets-v3` |

The new target set adds:

| Target | Format | Bytes/pixel |
|---|---|---:|
| Orbit minimum | `r32float` | 4 |
| Attribute status/reason and escape-index word | `r32uint` | 4 |
| Shadow visibility | `r32float` | 4 |
| Raw AO occlusion | `r32float` | 4 |

Reuse the existing `lightingStatus` target. New availability/reason flags occupy unused bits in the existing accumulation flag word; existing bits retain their meanings.

One complete working target set is **76 + 16 = 92 B/pixel**, or **763,084,800 B at 3840×2160** before staging, uniforms, model buffers, retained caches and overlapping work. This is a layout figure, not a measured peak or a claim that every 4K configuration fits.

Retained sample-zero resources and aliases are counted exactly once while live; distinct working copies are additional allocations. The 1 GiB cap remains unchanged. Allocation failure stays explicit. 4K export remains a 1b.3 obligation.

Extend B00’s pass/bounds contract for attribute and separated secondary-lighting work. Attribute batches declare at most `N≤512` recurrence updates per hit; the bound is included in scheduling and grouped-work accounting. No new pass is charged as zero work.

Packed draft evidence carries attribute state/reason alongside existing primary, normal and recovery evidence. Version its layout; preserve coverage markers and exact counts.

### Tasks

Each task is reviewed by the other peer. GPU work remains exclusive.

| Task | Owner | Depends on | Deliverable |
|---|---|---|---|
| **X00** | Claude | B15 evidence, with the partial-work rule below | Freeze defaults, scopes, labels, six preset payloads, reference protocols, explicit walkthrough scenes/actions and manifests. Record diagnostic baselines. |
| **X01** | Codex | X00 | Strict schema, conversion, family-switch rules, command scopes, key contracts, target/batch ABI and unit coverage. |
| **X02** | Claude | X01 | Attribute, secondary-lighting and appearance shaders; exact palette evaluation; status patterns; GPU reference checks; minimal uncached renderer wiring needed to execute them. |
| **X03** | Codex | X02 | Retained sample-zero caches, pass dependencies, invalidation, resource ownership, reports and packed evidence. Extend and verify performance harnesses. |
| **X04** | Claude | X01 | Framing, orientation, panel groups, labels, explanations, hints, keyboard alternatives and input recovery. |
| **X05** | Codex | X03, X04 | Scoped presets and swatches; single-edit undo; scene JSON round-trip and reproduction. |
| **X06** | Claude | X00 | Bounded compatibility investigation and visual walkthrough preparation. May run early with exclusive GPU ownership. |
| **X07** | Codex | X00–X06; accepted B15 | Freeze final candidate, execute acceptance, assemble evidence/audit and prepare handoff. Claude reviews before completion. |

X00 may perform Node-only planning/reference work while B15 remains unresolved. X01 may begin only after its complete schema/ABI/reference dependencies are frozen. Neither partial progress permits 1b.1x GPU acceptance before neutral P3 passes.

The X00 baseline measurements use the accepted B15 implementation, not candidate code. Record existing reshading behavior—including the inert palette limitation—and eight-sample wall time. These diagnostics do not redefine the new acceptance budgets.

**Hot-file ownership:**

- `workspace.js`, `index.html`, and UI styles: X04, then X05 additive changes.
- `shade/accumulate/display.wgsl` and new attribute shader sources: X02.
- `renderer.js`: X02’s minimal wiring, then X03.
- `tests/space-performance.mjs` and performance support: X03, reviewed before X07’s candidate freeze.
- Generated shader metadata follows its owning source change; no simultaneous edits.

Any later shader correction returns to X02 ownership and receives review before new acceptance.

### Frozen artifacts

X00 commits:

- `tests/fixtures/explore-compose.json`: complete scene bytes, explicit cameras, dimensions, actions/times, expected command scopes and screenshot checkpoints.
- Complete default and six preset payloads.
- Attribute-reference fixtures, generator provenance, comparison protocol and coverage floors.
- Control alternate-value fixtures and indication-test fixtures.
- External SHA-256 manifests.

No acceptance fixture is selected after observing candidate performance. Baseline observations are recorded before the final fixture freeze, without changing the stated budgets.

The references import no production modules. Cases cover:

- Both fractal families, all supported bulb powers and budgets 64/128/256/512.
- Quaternion off-plane components and initialization escape.
- Zero minima, budget exhaustion, invalid reconstruction and numerical failures.
- Recovered primary hits and near-threshold recurrence cases.

For reference comparisons, use GPU-reconstructed effective hit positions, not independently rounded substitutes. Freeze an adjacent-representable-input sensitivity screen before GPU comparison. Excluded cases remain recorded and receive diagnostic comparison.

On eligible reference cases, status and escape index must agree; the allowed mismatch count is zero. X00 must independently justify and freeze the scalar-attribute tolerance and per-stratum coverage floors before comparison. Missing floors or unsupported tolerance analysis prevents X00 completion; a later amendment preserves the original failed preflight.

Separately, compare the instrumented GPU evaluator with the original GPU evaluator on the same inputs. Require agreement on escape status/index and estimate availability. Non-escaped or unusable attribute results at actual primary hits are counted as inconsistent. Ordinary walkthroughs require zero such inconsistencies.

### Walkthrough scenarios

| Scenario | Frozen behavior |
|---|---|
| **Bulb overview** | Power 8; neutral opening; hints; orbit, axis-lock, keyboard steps and reset; orbit-colour preset; phase/finish edits; undo; JSON save, alteration and reload. |
| **Bulb detail** | Fixed exterior close-up; light direction/intensity, shadows and AO; fog on/off; all diagnostic views; matched primary-buffer comparison. |
| **Quaternion overview** | `C=(-0.2,0.8,0,0)`, `κ=0`; colour, undo and save/reload workflow; retain lighting limitations. |
| **Quaternion detail** | Fixed exterior close-up; lighting/fog, four-component attributes, availability and diagnostics. |
| **Family change** | Orbit-coloured fractal → sphere, box and Menger; explicit solid/shaded resolution, notice and complete undo restoration. Malformed imports remain rejected. |
| **Recovery** | Rapid appearance edits, A → B → A, navigation during refinement, blur, cancellation, loss and allocation pressure. |
| **Unavailable Space** | Stock installed Chrome; preserve Plane and present actionable guidance if Space cannot initialize. |

X00 authors and peer-reviews explicit overview/detail cameras. Overview targets 60–80% of the unobscured viewport’s limiting dimension with the silhouette visible. Detail scenes name the intended feature and retain an exterior camera. These cameras never replace P1/P2/P3 or B11b fixtures.

Ordinary scene settings are 128 iterations, 512 primary steps, eight samples and seed 1.

Visual/layout checkpoints use desktop 1440×1000 and laptop 1280×720 windows, recording actual canvas dimensions. **Every timed check uses 1280×720 output.**

Capture neutral/composed images, normals, depth, termination, orbit colour and direct/full comparisons. Save raw masks and reports alongside screenshots.

### Control-effect and indication tests

X00 freezes alternate values and applicable fixtures.

For each appearance control, its alternate changes at least 1% of displayed hit pixels in the prescribed crop by at least `4/255` in one displayed channel, while matched primary buffers remain bit-equal. Background-only controls use a frozen miss-pixel crop.

Shape, model and navigation controls instead verify their intended mathematics/camera changes. View controls verify the selected mapping. Disclosure/help controls verify accessibility and behavior. These cases are not falsely subjected to primary-buffer invariance.

Control-effect crops exclude diagnostic overlays when measuring the control’s visual effect. Overlay correctness is tested separately against flags.

Indication fixtures cover every shipped palette × background × preset combination, colours matching the old tint, strong fog, isolated pixels, thin masks and simultaneous flags. Spatial patterns must remain distinguishable; primary legends retain their required values.

Readable form and useful framing remain a two-peer image review, supported by these quantitative checks.

### Timed appearance workload

Run with the preset gallery visible and swatches enabled. Scheduling may defer swatch work behind interaction under the existing priority rules; the harness may not disable it.

After a recorded complete starting render:

1. Issue 40 phase edits at 250 ms intervals, alternating `0` and `0.25`, with cached attributes.
2. Restore the frozen scene and drain work.
3. Issue 40 key-intensity edits at the same intervals, alternating `0.6` and `1.0`, with compatible full secondary data.
4. In a separate case, begin with solid colour and no attribute cache, then request orbit colour.

Record every request, supersession, actual quality, completed work, readback, publication and presenter-queue completion. Timing begins at request creation.

A cached-edit milestone is the first complete **full-resolution sample-zero image at the requested lighting quality**. It is distinct from §16.4’s first direct-light milestone and from completed eight-sample refinement.

### Budgets and acceptance

| Measurement | Requirement |
|---|---|
| Original neutral P3 | Original bytes, quality, timing, coverage, trial rules and failure precedence |
| Navigation draft rate | ≥30 completed drafts/s |
| Consecutive draft interval | p95 ≤50 ms |
| Navigation interaction | p95 ≤100 ms |
| Stress replacement | ≤250 ms |
| Application main-thread tasks | None over 50 ms during timed acceptance |
| First settled complete full-resolution geometry/normals/direct image | ≤2 s from request creation |
| Cached appearance-edit milestone | p95 ≤100 ms; maximum ≤250 ms |
| First uncached orbit-colour image | ≤2 s; full resolution and requested colour mode, with actual lighting stage disclosed |
| Complete eight-sample walkthrough refinement | ≤10 s wall time from the final request |
| Admission/allocation | Two outstanding leases; aggregate 8 ms work target; existing 5 s watchdog; 1 GiB tracked cap |
| Ordinary walkthrough numerical failures and attribute inconsistencies | Zero |

The isolated walkthrough wall-time requirement is additional to runtime elapsed-work budgets. It does not change their pause/scheduling semantics.

Timed appearance tests require three valid passing trials within five recorded attempts, using P3’s classification discipline. Preserve failed attempts; discard no warm-up trial. Missing coverage and harness timeouts cannot pass.

Measure the compose P3 variant only after neutral P3 passes. Store it in independently hashed `performance-workload-compose.json`; do not edit original P3 bytes. For each fractal scene it changes only the frozen appearance payload, retains the same primary trajectory/coverage expectations and uses the same targets. Moving drafts include orbit attributes.

Every shipped lighting preset receives fresh five-scene B11b qualification at full lighting, shadows enabled and nonzero AO. Failed presets are not shipped. Quaternion remains required diagnostic evidence, without relaxing its thresholds or its deferred investigation.

Final acceptance also requires:

- Existing mandatory numerical, visual, interaction, recovery and Plane gates.
- Complete scene restoration, including requested numerical parameters.
- Matched primary-buffer equality across appearance variants.
- Correct secondary-cache reuse and invalidation.
- Complete diagnostic and availability evidence through accumulation.
- No direct/full flash on the qualified cached-edit path.
- Peer-reviewed overview and detail results for both fractal families.
- A clean, pinned candidate and auditable evidence provenance.

### Compatibility investigation

Compare exactly two launch configurations on this workstation: the documented flagged route and stock installed Chrome, using isolated profiles and the same scene.

Record browser version, requested/effective arguments, adapter/device availability, identity evidence and initialization outcome.

A stock failure produces a documented limitation and verified guidance. A success establishes support only for that measured configuration. No second backend, native application or speculative flag search is authorized.

### B15 remediation: conditional grouped submissions

List these tasks under B15:

| Task | Owner | Depends on | Deliverable |
|---|---|---|---|
| **B15-G0** | Claude | Established P3 failure and diagnostic case for grouping | B00/B06 group contract, backend encoding, fake backend and ownership/failure tests |
| **B15-G1** | Codex | B15-G0 | Renderer integration, exact diagnostics, candidate freeze and unchanged P3 plus affected correctness/recovery gates |

Each is reviewed by the other peer.

**Trigger — SATISFIED:** group only if unchanged P3 still fails with the compatible fixes alone and uncontended diagnostic evidence supports bounded grouping. Executor run 2 at `7d89b39`, with the compatible fixes alone and no grouping, measured **13.5 / 12.6 / 11.5 completed drafts/s** for bulb / quaternion / Menger against the unchanged ≥30 target (`task-B15-executor2-report.md`, §6, in the B15 evidence directory; raw evidence under `/mnt/ml_storage/scratch/b15-executor2/`). Its operation-count and queue-fence diagnostics, together with the perf-step-2 peer positions, support bounded grouping. Grouping is enabled under rev 6.0's existing condition; no new amendment to the trigger is needed. Missing/inconclusive evidence would require measurement repair first.

**One governing text:** the complete §9.1 **Batches** text in the WebGPU backend annex above is quoted unchanged from the governing spec. It reconciles rev 6.0's conditional rule and the round-10 wording, including the B00 field list. This section records the condition and execution history instead of defining a second §9.1 rule.

**Recorded execution deviation:** rev 6.0 assigned B15-G0 (group contract and backend, including fake backend and ownership/failure tests) to Claude. Codex implemented B15-G0 in round 10 (`eec8048`); Claude's r3 review in `claude-B15-r1-review.md` approves its code logic and constitutes the peer review. The owner table above retains the original assignment as history. Codex also implemented the B15-G1 renderer integration; executor acceptance measurements remain outstanding.

Keep settled work ungrouped initially. Freeze the algorithm and candidate before acceptance measurements.

If neutral P3 still fails, 1b.1 remains unaccepted and 1b.1x GPU acceptance waits. Node-only work with frozen dependencies may continue; B15 diagnostics/remediation may continue under exclusive GPU ownership. Targets, quality, lease limits and backend scope do not change without another explicit peer-converged amendment.

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
| W5 | B11 ‖ B12b | B11 GPU, mechanical palette change touches `src/plane/palettes.js`; B12b Node-only (additive to B12's `gestures.js` and `flight.js`) |
| follow-ups | B09b ‖ T04a ‖ B09c | B09b merges before B13's allocation integration; T04a before B14; B09c after B11 and before B14 enables interaction |
| W6 | B14 | after 1a T12 is merged and the dependency table is reconciled; alone (touches `src/app.js`, `index.html`) |
| W6b | B11b | after B14, before B15 (rev 5.0); Claude implements, Codex reviews |
| W7 | B15 | after 1a T13; alone |

Critical path: B00 → B01 → B06 → B08 → B10 → B11 → B09c → B14 → B11b → B15 (10 deep). The Node-only chain
B02 → B05/B09 → B12/B13 → B12b runs beside it.

**Hot files (serialized or merged by the merger):**

| File | Touched by | Rule |
|---|---|---|
| `src/app.js`, `index.html`, `src/ui/style.css` | 1a T08, T12; B14 | B14 only, after T12 lands; whole-file re-issue from the merged T12 version |
| `src/plane/workspace.js` | 1a T12; B14 | additive `activate`/`deactivate` after T12 |
| `src/space/gestures.js`, `src/space/flight.js` | B12; B12b | B12b additive after B12 is accepted |
| `src/plane/palettes.js` | B11 | mechanical re-export; byte-identical outputs tested |
| `src/shared/render-report.js` | B09 | additive events; Plane regression test |
| `tests/suites.manifest.json` | B01, B06, B08, B10, B11, B14, B15 | append-only; the merger appends |
| `tests/unit.manifest.json` | every Node task | append-only; the merger appends |
| `tests/space.mjs` | B01, B06, B08, B10, B11, B14, B15 | one group per task; groups are separate top-level blocks; merge in task order |
| `src/space/numerics/validation-records.js` | B08, B10 | B10 appends tracing and geometric records |
| `package.json` | B01 | `test:space` once |

All other files are single-owner.

## Items for the user

**Decided by the user on 2026-10-22** (rev 5.0): visual acceptance with the 10% fractal lighting-unresolved ceiling (B11b); the lighting-only subtle-tint presentation (B11, B11b); the one-sided normal fallback for box and Menger (B10, B11b).

**Decided by the user on 2026-10-21** (applied in spec rev 4.2 and this revision): (a) ADOPT;
(b) APPROVE; (c) confirmed, with Q5 extended by "We should support joystick for exploration as
well." (B12b, B14); (d) applied. **Answered (2026-10-21):** spec rev 4.2 Q11 — "Xbox style": standard-gamepad
support suffices for 1b.1 (§19.1).
The original items, for the record:
- (a) adopt the §9.1 WebGPU backend annex (above) into the spec by reference;
- (b) approve rev 4 §5.2/§10.1's `anchored-perspective-v1` camera representation for ordinary
  Space (this plan implements it; a "no" revises B02's camera codec, B05 and the serialization
  fixtures before implementation);
- (c) confirm the §19.2 provisional defaults: Q2 neutral inspection lighting, Q5 desktop-first,
  Q6 scene files only with Space share URLs deferred;
- (d) erratum: mark the precision badge "(1b.2)" in §13.2's indicator list, matching §3.
