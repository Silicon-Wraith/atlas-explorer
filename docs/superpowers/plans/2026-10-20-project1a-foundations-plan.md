# Project 1a — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Amendment A (2026-10-20, user directive; Codex design run 20261020T201409Z-18ac):** the scene size limit is configurable. `MAX_SCENE_BYTES` is replaced by `DEFAULT_MAX_SCENE_BYTES`; `createSceneCodec` takes `maxSceneBytes`; `src/plane/scene-adapter.js` adds `createPlaneSceneAdapter({maxSceneBytes})`, whose bound methods are also the module's named exports, including `sceneCodec`. Later tasks read the limit from `sceneCodec.maxSceneBytes`. T03's code blocks below show the pre-amendment text; the implementation on `feat/project1a` is authoritative.

> **Amendment B (2026-10-20; T04 review fix round, Codex run 20261020T203951Z-76f3, Claude review r2 APPROVED):** `createHistory` isolates each listener and takes an optional `onListenerError` hook (default: rethrow after the transition is returned); it requires `codec.equal`; a no-op command keeps its revision and requests no render; `step()` validates the target before moving a stack entry. T04's code blocks below are pre-amendment; `feat/project1a` is authoritative.

> **Amendment C (2026-10-20; PLAN CHANGE from T06 review, Codex fix run 20261020T204535Z-9244, Claude review r2 APPROVED):** render reports read the backend and device when the render finishes (`finish()` evaluates an environment thunk over the captured renderer), not before it starts; the fake renderer varies mode and device per render and its `cancel()` rejects pending entries; `stillCurrent` treats a throwing check as not current. Codex's exact plan-text diffs are in `.superpowers/sdd/2026-10-20-project1a-foundations-plan/codex-T06-fix1-report.md`. T06's code blocks below are pre-amendment; `feat/project1a` is authoritative. Unit counts run +5 further from T06 on. T08's review must confirm the `busy` guard wraps every `adapter.render`.

> **Amendment D (2026-10-20; T09 review fix round, Codex run 20261020T204522Z-ae99, Claude review r2 APPROVED):** a save or remove that throws synchronously, or a source without one, settles `failed`; a reply without a definite status stays `unknown` (never claimed as not saved); `destroy()` stops marker reads and reconcile delays, admitted saves still commit, later calls reject as `destroyed` or `unsupported` without touching the source, and teardown is idempotent; validation rejects noncanonical dates, blank report ids, extra thumbnail fields and mismatched MIME types; one refresh per commit. Write and marker pruning is deferred to T10/T11 (markers are the only evidence of an unknown write). The test keeps its own `flush` helper (T09 does not depend on T06). Codex's replacement plan blocks: `.superpowers/sdd/2026-10-20-project1a-foundations-plan/codex-T09-fix1-plan-corrections.md`. T09's code blocks below are pre-amendment; `feat/project1a` is authoritative.

> **Amendment E (2026-10-20; T11 reviews, Codex runs 20261020T210236Z-7eb2 and 20261020T211007Z-8ccc APPROVED; joint Claude/Codex ruling):** (1) T11 exports `discoveryCount`; the count shows `?` when nothing is established (a failed first read) and `N+` for a known lower bound, never an exact unestablished number; `writeMessage` claims an outcome only for `committed`, `aborted` and `failed`; the replacement blocks are in `.superpowers/sdd/2026-10-20-project1a-foundations-plan/task-T11-report.md` ("Fix round 1"). T12 must destroy the Discoveries control before its controller. (2) **New task T09b — write and marker pruning** (T09 follow-up in `src/shared/discoveries.js`; after T10, whose persistence supplies deletion; before T12; schedule W5 becomes T08 ∥ T10 → T09b → T12). Policy: keep every pending, checking and unknown write and marker with no age or count eviction; keep the newest 100 delivered definite outcomes; delete a marker only after a definite outcome is delivered and reconciliation readers have finished; teardown, timeout, record presence or absence and elapsed time never authorise pruning; a cleanup failure keeps the evidence and never changes the write result.

> **Amendment F (2026-10-20; PLAN CHANGE from T07 reviews, Codex runs 20261020T205356Z-1484 and fix 20261020T211103Z-20b0, Claude review r2 APPROVED):** export timeouts (admission, render, encode) keep their own cause when a device loss occurs concurrently, matching T06's render report, and the job report also carries `deviceLost` and `retired`; a stopped render's report is adopted as is and a completed render is checked for a loss arriving before its continuation; `stage` hook exceptions are isolated (the lease is released) and are currently swallowed silently, which T08's review must weigh; non-Error rejections are normalised. Codex's exact diffs against the brief's `export.js` block are in `.superpowers/sdd/2026-10-20-project1a-foundations-plan/codex-T07-fix1-report.md` (labelled "Amendment D" there; recorded here as F). T07's code blocks below are pre-amendment; `feat/project1a` is authoritative.

> **Amendment G (2026-10-20; T05 reviews, Codex runs 20261020T212928Z-a5d0 and 20261020T214524Z-7746 APPROVED; joint Claude/Codex ruling):** (1) A pointerdown settles the gesture only when the pointer set was empty (a second finger never commits a drag early); every history step (undo, redo, back, forward) first runs `stopPointers()` (release capture, clear pointers, remove the dragging state); T05's replacement `src/app.js` text is in `.superpowers/sdd/2026-10-20-project1a-foundations-plan/task-T05-report.md` ("Fix round 1"). **T12 must carry both into `bindPlaneNavigation` in `src/plane/navigation.js`** (not only `workspace.js`), and later whole-file replacements must keep the new workflow checks and `requiredPasses`. History buttons wrap to a second row below 760 px (`src/ui/style.css`). (2) GPU completion: `render()`, `atlas.rendered` and `whenIdle()` report application-side progress, not GPU completion, on any backend (`finish()` is a flush). The workflow suite drains each page before closing and a drain failure fails the suite (`tests/support/workflow-cleanup.mjs`). **New task T00b** (after T05; named for T00's `tests/support/bounded.mjs`): a shared bounded drain helper (WebGL 2 fence with yielding polls, validated against a readback; a one-pixel readback is acceptable for teardown; `loseContext` is not evidence) run before every page or context close, and corrected timing in `tests/browser.mjs` ("Repeated GPU navigation": drain before the clock starts, confirm completion after the last draw, record submission and completion separately); keep the asserts and `LIMITS.deep`, add or loosen no thresholds. (3) The application's completion contract is an asynchronous signal tied to the request and device epoch, never a synchronous readback per render — to be specified for T06/T08 when T08 is dispatched.

**Goal:** Move Plane into the workbench structure without changing its behaviour, and give it native
versioned scenes, undo with a separate camera history, immutable render requests with truthful
reports, an immutable image export, and a Discoveries control over durable local storage — with
every commit gated.

**Architecture:**
- **Pure contracts first.** `src/shared/` (scenes, commands and histories, render requests and
  reports, discoveries, persistence) and Plane's adapters in `src/plane/` are Node-tested with
  fakes before any application file uses them.
- **Three integration checkpoints.** `src/app.js` changes in exactly three tasks: T05 routes every
  edit through the history, T08 routes every render and the export through the render adapter, and
  T12 moves the lifecycle into `src/plane/workspace.js` and leaves `src/app.js` as the composition
  root.
- **The gate.** `scripts/plane-gate.mjs` runs on every commit with an owned server, hard time
  limits and classified outcomes. A commit is a *candidate* until a gate record for that exact
  commit passes with the GPU suites included; T13 audits that every 1a commit is accepted.

**Tech stack:** plain ES modules (browser `.js`, Node entry points `.mjs`), WebGL 2 (unchanged),
IndexedDB, the Node 20 built-in test runner, Playwright 1.59.1 (already the only dev dependency).
No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-project1-design.md` (rev 3.2, approved 2026-10-20),
governed by `docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md` with amendment A1.

**Revision:** 7.1 — Codex READY (run 20261020T181347Z-b0d1) after ten plan rounds; supervision per the controller's ruling (2026-10-20). **Authors:** Claude and Codex as peers (AGENTS.md/CLAUDE.md protocol). The record is
`docs/codesign/project1-log.md`. Claude drafted the code; both peers agreed the structure and
reviewed the whole.

## Global Constraints

- **Scope (spec §1, §3, §4.1):** 1a only. No `src/space/`, no `shared/scheduler.js`, no
  `ui/workspace-switcher.js`, no `shared/palettes.js` split (deferred to 1b.1), no remote
  discovery source, no network code. 1a does not depend on Project 0's outcome and never touches
  the Project 0 worktree, its branch, `spikes/` or its evidence. `history.cancel` exists in 1a
  without a Plane control (Plane has no cancel gesture today; Space flight uses it in 1b).
- **Plane behaviour contract (spec §4.3), verbatim:** exact coordinate strings and effectively
  unbounded navigation remain; existing zoom thresholds, the adaptive iteration policy,
  reference-orbit machinery and shader arithmetic remain; palette-only changes continue to reuse
  the field; a wheel step still produces one committed frame, with stable backing dimensions;
  pending navigation retains and transforms the previous complete image; pointer release does not
  introduce a second refinement render; CPU fallback, worker cancellation, tours, touch gestures,
  saved discoveries, share links, location files and image exports remain available, in the new
  native formats; existing layouts and controls remain usable at the tested desktop, laptop and
  mobile sizes.
- **Assertions:** existing browser assertions survive. The only permitted assertion changes are
  the format-dependent ones (`tests/browser.mjs`: the `#re=-2` match and both
  `savedLocation.view` comparisons), replaced in T05 by native-format checks of equal or greater
  strength, and the bounded wait for asynchronous discovery loading added in T12. Nothing in
  `src/plane/{math,perturbation,reference.worker,renderer,shaders,graphics,palettes,places}.js`
  changes after T01.
- **Legacy (spec §12, charter A1):** nothing reads or writes `localStorage['atlas.discoveries']`
  after T12; earlier links and location files are recognised only to report unsupported input.
- **Gate on every commit (spec §16.3):** after each commit run `npm run gate` with exactly one of
  `ATLAS_GPU_HANDOFF="<who, when>"` or `ATLAS_GPU_DEFERRED="<reason>"`. Exit 0 = passed, 2 =
  pending (GPU suites explicitly deferred), 1 = failed. A pending commit is a *candidate*; it becomes *accepted* only when a
  later run with `ATLAS_GPU_HANDOFF` passes on that exact commit (check it out detached, run the
  gate, return). The GPU is handed over by the user or the Project 0 lead; it is never probed.
  Records: `artifacts/gates/` (git-ignored); the T13 audit commits the summary. A task whose review
  is clear but whose commits are not all accepted is reported as **implemented, validation
  pending**, never as complete. On a failed candidate: stop, preserve its failure evidence, correct
  it in private history (the implementation branch is private until acceptance; amend or rebase),
  and gate every rewritten SHA. A later passing commit does not accept a failed ancestor.
- **Supervision (controller ruling, 2026-10-20, on cost and proportionality grounds):** every
  supervised run — unit runner, build, server, each browser suite — is spawned into its own process
  group, and on exit or deadline the whole group is killed (SIGTERM, then SIGKILL), each phase
  bounded; the result always arrives within the execution deadline plus two cleanup phases.
  Cleanup is confirmed only when the group is observed empty and the leader has closed; otherwise it
  is `unconfirmed`, which unit, RED and suite classification all treat as failure, and the gate run
  then starts no further browser or GPU work. There is no orphan inventory: the process group is the
  unit of ownership. The browser, which Playwright starts in a group of its own, is closed by its
  suite; a close that cannot be confirmed is sticky and terminal: the suite prints
  `CLEANUP-UNCONFIRMED`, exits 125 at once, and no later deadline or error can downgrade it; the gate
  honours the printed marker whatever the exit code and launches no further browser or GPU suite.
  Git calls are bounded too.
- **Graphics context loss:** a lost context makes the renderer unavailable — no render, recolor or
  export admission — until a successful replacement, which waits for any export lease; releasing a
  lease never restores availability. After every asynchronous render or encoding boundary,
  including rejections and non-cooperative completions, a lost epoch is checked before the result
  is classified or colored, and yields `interrupted` with no publication; a timeout reports the
  timeout, never a loss.
- **RED is behavioural and never launches a browser or GPU:** each task writes its tests, then an
  *interface skeleton* (every exported name with its final shape), then runs
  `node scripts/run-unit.mjs <files> --expect-fail "<named test>"`, which confirms RED only if that
  named test fails on an assertion (`ERR_ASSERTION` in its own TAP block). Missing modules, syntax,
  reference, launch and timeout failures never count; `--expect-missing` exists only for the T00
  bootstrap and says so. Every unit-test process is preloaded with `tests/support/no-launch.mjs`,
  which makes every `child_process` launcher throw, and every browser suite's first import is
  `tests/support/entry-guard.mjs`, which refuses unit mode before Playwright is imported. Browser
  suites run only in GREEN steps and in the gate. The application wiring in T05 and T08 has
  browser-only acceptance: its browser checks are written first and first run by the gate.
- **Every wait is bounded:** every browser context and page gets default action, wait and
  navigation bounds (`boundContext`), every `page.evaluate` is bounded (`ev`, `within`), and every
  close and download is bounded; launch and server readiness 15 s; ordinary browser operation 30 s;
  deep render or probe 120 s; whole suite 10 min (exit 124); cleanup 5 s, then SIGKILL of owned
  processes only; unit test case 10 s; unit run 10 min; `atlas.whenIdle({ timeoutMs = 60000 })`
  rejects with `IdleTimeoutError`; discovery reads 5 s, write observation 5 s, three
  reconciliation attempts; export admission 60 s, render 120 s, encoding 30 s; discovery thumbnail
  encoding 5 s.
- **Every stop is classified, and evidence fails closed:** suite states are `passed`, `failed`,
  `deferred`, `not-run`, `incomplete`; a missing, empty, truncated or stale report, a skipped or
  todo test, zero executed tests, an unclassified state or a changed tree never passes.
- **No test asserts nothing:** every test makes at least one assertion about behaviour; suites
  assert their sample counts (six numerical views, six GPU samples, four benchmarks, at least one
  observed frame), and the gate requires each suite's named passes.
- **Storage:** scratch goes to `/mnt/ml_storage/scratch`, never `/tmp`; every process the gate or
  the unit runner starts has `TMPDIR=artifacts/runtime`.
- **Whole files:** every code step gives a file's complete content; a later task that changes a
  file gives it again in full; verification takes the last full version of each path. Two
  documented exceptions: T01 is a path substitution script with a byte-identity verifier, and
  documentation edits in T02 and T13 are exact text replacements.
- **Module paths:** browser modules use `.js` and never live under a path containing `tests`,
  `scripts` or `artifacts` (`scripts/serve.mjs` refuses those).
- **Peer handoff:** Codex never commits. A Codex-owned task runs as
  `codex_bridge.py run --mode new-worktree` from the named base commit and returns a patch with its
  test evidence; Claude reviews it, applies it in the implementation checkout, re-runs the task's
  steps and commits. Every task, whoever implemented it, gets the other peer's read-only review
  (`codex_bridge.py review --diff <base>` for Claude's) before it is marked complete. Nobody edits
  the checkout while a bridge run is active.
- **Logging:** every peer exchange during execution is appended verbatim to
  `/mnt/ml_storage/scratch/atlas-codesign/project1-log.md` and archived at milestones.
- **Fixed values (spec):** scene schema `atlas.scene` v1; fingerprint `fnv1a64:` + 16 hex digits
  over the canonical serialization's UTF-8 bytes; scene text limit configurable, default 2,000,000 bytes (`DEFAULT_MAX_SCENE_BYTES`); decimal budget
  200,000 digits for the mantissa, the required precision and the fixed-point scaling power (so
  materialized values have at most 400,000 digits); undo and camera history 100 entries each;
  wheel and key-repeat grouping 200 ms quiet; IndexedDB `atlas-workbench` v1 with `discoveries`
  (thumbnail inline), `reports` and `writes` (write markers); owned gate server port 5190.

## Review Focus

The five failure modes most likely to bite a person using 1a that the gate does not isolate by
itself. Each is pinned by named tests in its owning task.
1. **A RED run reaches a real launcher, a stuck process outlives its deadline, or missing evidence
   passes.** *T00:* `browser suites refuse to start under a unit run`; `every child_process
   launcher throws before any side effect`; `a child that ignores termination and never closes
   still yields a classified result in time`; `a group member that never exits, or an unreadable
   group, fails closed`; `missing or empty suite evidence cannot pass`. *T13:* `a ledger claim
   without valid evidence never accepts a commit`.
2. **Scene or history integration corrupts exact state or couples the two histories** — a panned
   coordinate beyond ±4 cannot be saved, an entered exponent hangs the page, undoing a palette
   moves the camera, Back does nothing after an undone restore, or a tour frame splits a slider
   drag. *T03:* `pan outside the entry range round-trips as a native scene`; `coordinate entry
   rejects an oversized decimal before anything materializes it`. *T04:* `palette, navigate, undo
   palette preserves camera`; `restore, undo, back and forward`. *T05:* `a slider drag during a
   tour stays one undo entry`. *T12:* `reset forgets a captured drag, so further movement cannot
   navigate`.
3. **A late render publishes across request or epoch boundaries, or a report misdescribes the
   image.** *T06:* `a-b-a late completion rejected`; `a renderer that ignores cancellation is never
   adopted`; `appearance rebind reports current request`; `successive recolors keep the geometry
   origin`; `identities from two runtimes sharing one store never collide`.
4. **An export captures live edits, releases the renderer before encoding, or reports a different
   outcome than it had.** *T07:* `export freezes before admission`; `an edit while the export render
   is pending changes nothing`; `export holds lease through encoding`; `an encoding failure is a
   failed export whose report says failed`; `a device loss while encoding interrupts the export,
   discards the image and releases the lease`. *T08 (browser):* `An edit during a WebGL export does
   not change the exported image` (three witnessed phases), the CPU equivalent, and `A context loss
   during an export interrupts it and live rendering resumes`.
5. **A storage timeout becomes a false success or failure, a stale read replaces current results,
   or a discovery becomes unreachable.** *T09:* `an older record with the same scene never confirms
   a replacement that then fails`; `an absent record during a pending write is not proof of
   failure`; `a throwing subscriber cannot turn a committed save into a failure`; `overlapping
   next-page requests append a page exactly once`; `an open across a workspace change A → B → A is
   rejected, and its read is aborted`. *T10 (browser):*
   `IndexedDB commits whole batches, rolls back, cancels and reopens`. *T12 (browser):* `More than
   one page of discoveries stays reachable`.

---

## Task overview

| Task | Deliverable | Owner | Depends on | Unit tests after |
|---|---|---|---|---:|
| T00 | Fail-closed execution: unit runner, launch guard, bounded supervision and suites, the gate | Codex | — | 40 |
| T01 | Plane moved to `src/plane/` and `src/ui/`, path-only | Claude | T00 | 40 |
| T02 | AGENTS.md, HANDOFF.md, README.md updated (charter §6 item 10) | Claude | T01 | 40 |
| T03 | Native scenes: envelope, canonical form, fingerprints, Plane codec, decimal preflight, links, files | Codex | T01 | 53 |
| T04 | Commands, undo history and camera history | Codex | T03 | 63 |
| T05 | **Checkpoint 1:** gesture ownership; every Plane edit through the history; native links and files | Claude | T04 | 68 |
| T06 | Render requests, publication reports and the Plane render adapter | Codex | T03 | 82 |
| T07 | Immutable exclusive export with a job report | Codex | T06 | 94 |
| T08 | **Checkpoint 2:** every render and the export through the adapter | Claude | T05, T07 | 94 |
| T09 | Discovery records, sources (write markers) and the headless controller | Codex | T03 | 114 |
| T10 | IndexedDB persistence | Claude | T09 | 117 |
| T11 | The Discoveries control (paging, write status) | Claude | T09 | 122 |
| T12 | **Checkpoint 3:** workspace extraction, shell, Discoveries cut-over, legacy removed | Claude | T08, T10, T11 | 125 |
| T13 | Evidence-backed acceptance audit, documentation, handoff | Codex | all | 128 |

**Planning-time verification (2026-10-20, revision 7), recorded so reviewers know what has and
has not been exercised.** Every code block, interface skeleton and documentation edit was extracted
from this plan text into a fresh tree built from the base commit `5cb4b8e`, task by task, with each
task's prefix validated on its own (`validate.py` in
`/mnt/ml_storage/scratch/atlas-codesign/project1/plan/`). For every task: the T00 bootstrap RED
failed on its two missing modules; every other RED (T03–T07, T09–T13) printed `RED confirmed:
"<named test>" fails on an assertion` against its skeleton; `npm test` then reported exactly the
unit count in the table above with no failure, skip or todo; all relative imports, named exports,
worker URLs and `index.html` references resolved; the T01 verifier reported the move path-only; and
the extracted tree equalled the drafting tree. The gate's refusal without a GPU statement and the
audit's NOT ACCEPTED on ungated commits were also run. **No browser, server, GPU or gate suite has
run**: the browser suites (`tests/browser.mjs`, `tests/navigation.mjs`, `tests/graphics.mjs`,
`tests/workflow.mjs`) and the code that only runs in a page (`src/app.js`,
`src/plane/workspace.js`, the DOM half of `src/ui/discoveries.js`, `src/shared/persistence.js`
against real IndexedDB) are syntax- and import-checked only; their first execution is each task's
gate.

**Event-routing inventory (T05).** Every place `src/app.js` changed `view` or `settings` before 1a,
and its replacement. After T05, `view` and `settings` are assigned only in `adoptScene()`.

| Before | After |
|---|---|
| `loadHash()` at startup (old `#re=` format, coercions) | `startupScene()`: `decodeShareHash`; a native scene opens, anything else opens `PLANE_INITIAL_SCENE` with a notice |
| `hashchange` → `loadHash()` | valid scene → `restoreScene` (one undo entry, one camera entry); otherwise a notice, nothing changes |
| `goTo(next, palette, place)` (places, home, coordinate entry, tour, tests) | `admitEnteredView` (preflight, then the entry bounds), then `setCamera` (+ `setIteration` detail, + `setAppearance` palette) as one action; inside a tour, `gestures.automate('tour', …)`. No extra render request |
| `navigate()` from wheel, keys | `navigateGrouped()` → `gestures.grouped`: one `navigation-grouped` gesture, committed after 200 ms quiet |
| `navigate()` from drag and pinch | `navigation-drag` gesture, committed when the last pointer is released |
| `navigate()` from zoom buttons, double-click | one `jump` action each |
| palette swatch | `setAppearance` action (recolor only) |
| phase, frequency, detail sliders (`input`) | one `slider` gesture per drag, committed on `change` |
| relief toggle | `setAppearance` action |
| palette cycle (`animate`) | `gestures.animate`: joins the open gesture, else an `animation` gesture committed when cycling stops |
| tour frames | `gestures.automate('tour', …)`: skipped while a direct gesture is open; a direct gesture stops the tour first |
| saved discovery click (`validatedSettings`) | T05–T11: `restoreScene` of `createPlaneScene(view, settings)`; T12: Discoveries control → `restoreScene` |
| JSON import (`validatedSettings`) | `decodeSceneFile` → `restoreScene` |
| share link (`#re=…`) | `encodeShareHash(scene)` (`#scene=…`) |
| location file (`version: 1`) | `encodeSceneFile(scene)` (`atlas.scene`) |
| `renderSettings()` (`detailLevels`) | `toPlaneState(scene).settings` (policy `plane-detail-zoom-v1`) |

---

### Task T00: Fail-closed execution: unit runner, launch guard, bounded suites and the gate

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** the approved plan (base: the plan commit).

This task changes only test and gate infrastructure; `src/` is untouched, so T01 remains the first production-source change. It is the bootstrap: its own RED run uses `node --test` directly on test files whose imports cannot launch anything.

**Files:**
- Create: `scripts/gate/lib.mjs` (pure classification and evidence rules), `scripts/gate/supervise.mjs` (bounded child processes), `scripts/run-unit.mjs` (the only unit runner), `scripts/plane-gate.mjs` (the gate)
- Create: `tests/support/no-launch.mjs`, `tests/support/entry-guard.mjs`, `tests/support/bounded.mjs`
- Create: `tests/unit.manifest.json`, `tests/suites.manifest.json`
- Modify (whole files): `tests/browser.mjs`, `tests/navigation.mjs`, `tests/graphics.mjs` — guard first, Playwright imported dynamically, every wait bounded, sample counts asserted; no other assertion changes
- Modify: `package.json` scripts
- Test: `tests/unit/gate.test.js`, `tests/unit/no-launch.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `scripts/gate/lib.mjs`: `parseTapSummary(text) → {tests, pass, fail, cancelled, skipped, todo} | null`; `classifyUnit(run, summary) → {state, reason}`; `tapBlock(output, testName)`; `classifyRed(run, output, {missing}|{failing}) → {confirmed, reason}` (a `failing` RED needs `ERR_ASSERTION` in that test's own TAP block); `validateEvidence(suite, {report}|{files}) → {ok} | {ok:false, kind:"missing"|"invalid", detail}`; `classifySuiteRun(run, evidence) → {state, reason}`; `overallGate(results, requiredIds) → {state:"passed"|"pending"|"failed", exitCode:0|2|1, reason}`.
  - `scripts/gate/supervise.mjs`: `POLL_MS`, `probeGroup(groupSignal, pgid) → "empty"|"alive"|"unknown"`, `cleanUpGroup({groupSignal, pgid, leader:{closed()}, cleanupMs}) → "not-needed"|"confirmed"|"unconfirmed"` (SIGTERM then SIGKILL to the whole group, each phase bounded; confirmed only when the group is observed empty and the leader closed), `runBounded({spawnFn, groupSignal?, command, args, options, timeoutMs, cleanupMs, echo}) → Promise<{exitCode, signal, timedOut, cleanup, spawnError, stdout, stderr}>` (spawned detached into its own process group; spawnFn mandatory; always resolves within timeoutMs + 2 × cleanupMs plus one poll).
  - `scripts/run-unit.mjs`: CLI `node scripts/run-unit.mjs [files…] [--expect-missing <module> | --expect-fail "<test name>"]`; exports `parseArgs(argv)`, `selectFiles(manifest, requested)`. Prints `UNIT {json}`.
  - `scripts/plane-gate.mjs`: CLI `npm run gate`; exports `runGate(deps) → Promise<record>` with `deps = {root, env, spawnFn, groupSignal?, git:{head(), porcelain()}, fs:{readJson(rel), exists(rel), remove(rel)}, probePort(port), now()}`, `GATE_PORT = 5190`, `GIT_MS = 10000` (every git call is bounded), `GATE_RECORD_SCHEMA`. A record is `{schema:"atlas.plane-gate", schemaVersion:1, commit, requiredIds:["unit","build",…suites,"cleanup"], results, overall, server, handoff, deferral, notes}`.
  - `tests/support/bounded.mjs`: `LIMITS`, `BoundedWaitTimeout`, `within(promise, ms, label)`, `boundContext(contextOrPage)` (default action, wait and navigation bounds), `ev(page, fn, arg?, label?, ms?)` (bounded `page.evaluate`), `idleWithin(page, ms?)`, `closeWithin(resource, label, {ms?, exit?})` (a failed close prints `CLEANUP-UNCONFIRMED` and exits 125 at once), `cleanupState`, `CLEANUP_UNCONFIRMED_EXIT`, `installSuiteDeadline(name, ms?, {exit?})` (exit 124, or 125 after an unconfirmed close).
  - `tests/support/no-launch.mjs`: `DENIED_METHODS`, `LaunchDeniedError`, `unitGuardActive`; `tests/support/entry-guard.mjs`: `UnitModeRefusal`, `inUnitMode(env)`.
  - Manifests: `tests/unit.manifest.json` `{files: [...]}`; `tests/suites.manifest.json` `{build: {requiredFiles}, suites: [{id, gpu, command, report, evidence, requiredPasses?, benchmark?}]}`. Later tasks append to both.

**Design assertions:**
- Spec §16.3: the gate runs unit tests, the build and every browser suite on a clean commit, through an owned server, and fails closed (`missing or empty suite evidence cannot pass`, `a suite without its report is incomplete, and the gate fails`).
- Plan rules: a RED run never launches a browser or GPU (`every child_process launcher throws before any side effect`, `browser suites refuse to start under a unit run`); every supervised run lives in its own process group, which is killed as a whole on exit or deadline, bounded, and confirmed only when observed empty (`runBounded classifies a hung child as timed out and kills its group`, `a child that ignores termination and never closes still yields a classified result in time`, `a group member that outlives the leader is killed before the result, and confirmed`, `a group member that never exits, or an unreadable group, fails closed`); unconfirmed cleanup fails unit, RED and suite classification and stops further browser or GPU work (`unconfirmed cleanup fails unit and RED classification too`, `a suite that passes but cannot confirm cleanup is incomplete and stops later suites`). Controller ruling (2026-10-20, cost and proportionality): the process group is the unit of ownership — no orphan inventory; the browser, which Playwright starts in a group of its own, is closed by the suite; a failed close is sticky and terminal — the suite prints `CLEANUP-UNCONFIRMED` and exits 125 at once, no deadline can downgrade it, and the gate honours the printed marker whatever the exit code and launches no further suite (`an unconfirmed browser close is terminal and survives a later deadline`, `a printed cleanup failure is honoured whatever the exit code, and stops the GPU suite`).
- RED is behavioural: `RED is a named assertion failure; a missing module is only the bootstrap`.
- Excludes: any change under `src/`.

- [ ] **Step 1: Write the failing tests**

**`tests/unit/gate.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parseTapSummary, classifyUnit, classifyRed, validateEvidence, classifySuiteRun, overallGate } from '../../scripts/gate/lib.mjs';
import { runBounded, cleanUpGroup, probeGroup } from '../../scripts/gate/supervise.mjs';
import { runGate, GATE_PORT } from '../../scripts/plane-gate.mjs';
import { parseArgs, selectFiles } from '../../scripts/run-unit.mjs';

const TAP_OK = '# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('a unit run passes only with executed tests and no failure, skip or todo', () => {
  const ok = { exitCode: 0, signal: null, timedOut: false };
  assert.equal(classifyUnit(ok, parseTapSummary(TAP_OK)).state, 'passed');
  assert.deepEqual(classifyUnit(ok, parseTapSummary(TAP_OK.replace('# tests 3', '# tests 0').replace('# pass 3', '# pass 0'))), { state: 'failed', reason: 'no-tests' });
  assert.equal(classifyUnit(ok, parseTapSummary(TAP_OK.replace('# skipped 0', '# skipped 1'))).state, 'failed');
  assert.equal(classifyUnit({ ...ok, exitCode: 1 }, parseTapSummary(TAP_OK.replace('# fail 0', '# fail 1'))).state, 'failed');
  assert.deepEqual(classifyUnit(ok, null), { state: 'incomplete', reason: 'missing-evidence: no TAP summary' });
  assert.deepEqual(classifyUnit({ ...ok, timedOut: true }, parseTapSummary(TAP_OK)), { state: 'incomplete', reason: 'timeout' });
  assert.equal(parseTapSummary('# tests 3\n# pass 3\n'), null, 'a truncated summary is missing evidence');
});

test('RED is a named assertion failure; a missing module is only the bootstrap', () => {
  const failed = { exitCode: 1, signal: null, timedOut: false };
  const missing = "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/w/src/shared/scene.js'";
  assert.match(classifyRed(failed, missing, { missing: 'src/shared/scene.js' }).reason, /^bootstrap only/);
  assert.equal(classifyRed(failed, missing, { missing: 'src/shared/history.js' }).confirmed, false);
  assert.equal(classifyRed({ ...failed, exitCode: 0 }, missing, { missing: 'src/shared/scene.js' }).confirmed, false);
  const assertion = "not ok 2 - undo restores the palette\n  ---\n  code: 'ERR_ASSERTION'\n  ...\nok 3 - other\n";
  assert.equal(classifyRed(failed, assertion, { failing: 'undo restores the palette' }).confirmed, true);
  const thrown = "not ok 2 - undo restores the palette\n  ---\n  error: 'boom'\n  code: 'ERR_TEST_FAILURE'\nok 3 - other\n  code: 'ERR_ASSERTION'\n";
  assert.match(classifyRed(failed, thrown, { failing: 'undo restores the palette' }).reason, /not on an assertion/, 'an assertion in another test does not count');
  assert.equal(classifyRed(failed, `${assertion}SyntaxError: Unexpected token`, { failing: 'undo restores the palette' }).confirmed, false);
  assert.equal(classifyRed(failed, `${assertion}LaunchDeniedError`, { failing: 'undo restores the palette' }).confirmed, false);
  assert.equal(classifyRed(failed, "not ok 2 - something else\n  code: 'ERR_ASSERTION'\n", { failing: 'undo restores the palette' }).confirmed, false);
  assert.equal(classifyRed({ ...failed, timedOut: true }, assertion, { failing: 'undo restores the palette' }).confirmed, false);
});

test('missing or empty suite evidence cannot pass', () => {
  const suite = { evidence: 'browser', report: 'r.json', requiredPasses: ['A', 'B'] };
  const ok = { exitCode: 0, signal: null, timedOut: false };
  assert.deepEqual(classifySuiteRun(ok, validateEvidence(suite, {})), { state: 'incomplete', reason: 'no report at r.json' });
  assert.equal(classifySuiteRun(ok, validateEvidence(suite, { report: [] })).state, 'failed');
  assert.equal(classifySuiteRun(ok, validateEvidence(suite, { report: [{ name: 'A' }] })).state, 'failed');
  assert.equal(classifySuiteRun(ok, validateEvidence(suite, { report: [{ name: 'A' }, { name: 'B' }, { name: 'FAIL' }] })).state, 'failed');
  assert.equal(classifySuiteRun(ok, validateEvidence(suite, { report: [{ name: 'A' }, { name: 'B' }] })).state, 'passed');
  assert.equal(validateEvidence({ evidence: 'browser', requiredPasses: [] }, { report: [{ name: 'A' }] }).ok, false, 'a suite without required passes is vacuous');
  const nav = { evidence: 'navigation' };
  const backend = name => ({ backend: name, frames: 12, renderedPerWheel: 1, burst: { commits: 1 } });
  assert.equal(validateEvidence(nav, { report: [backend('gpu'), backend('cpu')] }).ok, true);
  assert.equal(validateEvidence(nav, { report: [backend('gpu'), { ...backend('cpu'), frames: 0 }] }).ok, false);
  assert.equal(validateEvidence(nav, { report: [backend('gpu')] }).ok, false);
  const graphics = { evidence: 'graphics', benchmark: true };
  const entry = { samples: [1, 2, 3, 4, 5, 6], benchmarks: [1, 2, 3, 4] };
  assert.equal(validateEvidence(graphics, { report: [entry] }).ok, true);
  assert.equal(validateEvidence(graphics, { report: [{ ...entry, benchmarks: [1] }] }).ok, false);
  assert.equal(validateEvidence({ evidence: 'build', requiredFiles: ['dist/index.html'] }, { files: { 'dist/index.html': false } }).kind, 'missing');
});

test('the overall gate is passed, pending only for deferrals, otherwise failed', () => {
  const ids = ['unit', 'gpu'];
  assert.equal(overallGate({ unit: { state: 'passed' }, gpu: { state: 'passed' } }, ids).exitCode, 0);
  assert.equal(overallGate({ unit: { state: 'passed' }, gpu: { state: 'deferred' } }, ids).exitCode, 2);
  assert.equal(overallGate({ unit: { state: 'failed' }, gpu: { state: 'deferred' } }, ids).exitCode, 1, 'a failure is not hidden by a deferral');
  assert.equal(overallGate({ unit: { state: 'passed' } }, ids).state, 'failed', 'a suite that never ran is not-run, which fails');
  assert.equal(overallGate({ unit: { state: 'passed' }, gpu: { state: 'skipped' } }, ids).state, 'failed', 'an unclassified state fails closed');
});

function fakeChild({ stdout = '', exitCode = 0, hang = false, ready = false, deaf = false } = {}) {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), signals: [] });
  child.kill = signal => { child.signals.push(signal); if (!deaf) setImmediate(() => child.emit('close', null, signal)); };
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', stdout);
    if (ready) return;
    if (!hang) child.emit('close', exitCode, null);
  });
  return child;
}

// A fake process group: `members` maps member names to { dieOn } ('SIGTERM', 'SIGKILL' or null).
// The leader is a member too, until its close event. `probeError` makes signal 0 fail otherwise.
function fakeGroup(members = {}, { probeError = null } = {}) {
  const signals = [];
  const groupSignal = (pgid, name) => {
    if (name === 0) {
      if (probeError) throw Object.assign(new Error(probeError), { code: probeError });
      if (!Object.keys(members).length) throw Object.assign(new Error('no such group'), { code: 'ESRCH' });
      return;
    }
    signals.push(name);
    for (const [member, entry] of Object.entries(members)) if (entry.dieOn === name || (name === 'SIGKILL' && entry.dieOn === 'SIGTERM')) { delete members[member]; entry.onExit?.(); }
  };
  return { signals, groupSignal, members };
}
// A child whose process group holds itself plus `others`.
function groupedChild(childOptions = {}, others = {}, groupOptions = {}) {
  const child = Object.assign(fakeChild({ ...childOptions, deaf: true }), { pid: 4242 });
  const group = fakeGroup({ ...others, leader: { dieOn: childOptions.deaf ? null : 'SIGTERM', onExit: () => child.emit('close', null, 'SIGTERM') } }, groupOptions);
  child.once('close', () => { delete group.members.leader; });
  return { child, group };
}
const run = ({ child, group }, timeoutMs = 1000) => runBounded({ spawnFn: () => child, groupSignal: group.groupSignal, command: 'x', timeoutMs, cleanupMs: 20 });

test('runBounded classifies a hung child as timed out and kills its group', async () => {
  const subject = groupedChild({ hang: true });
  const result = await run(subject, 20);
  assert.deepEqual([result.timedOut, result.cleanup], [true, 'confirmed']);
  assert.deepEqual(subject.group.signals, ['SIGTERM']);
  await assert.rejects(async () => runBounded({ command: 'x', timeoutMs: 5 }), /requires spawnFn/);
});

test('a child that ignores termination and never closes still yields a classified result in time', async () => {
  const subject = groupedChild({ hang: true, deaf: true });
  const started = Date.now();
  const result = await run(subject, 20);
  assert.deepEqual([result.timedOut, result.cleanup], [true, 'unconfirmed']);
  assert.deepEqual(subject.group.signals, ['SIGTERM', 'SIGKILL']);
  assert.ok(Date.now() - started < 20 + 2 * 20 + 400, 'within the execution deadline plus two cleanup phases');
  assert.equal(classifySuiteRun(result, { ok: true }).state, 'incomplete');
});

test('a group member that outlives the leader is killed before the result, and confirmed', async () => {
  const subject = groupedChild({}, { helper: { dieOn: 'SIGKILL' } });
  const result = await run(subject);
  assert.deepEqual([result.exitCode, result.timedOut, result.cleanup], [0, false, 'confirmed']);
  assert.deepEqual(subject.group.signals, ['SIGTERM', 'SIGKILL'], 'the leader\'s exit did not cancel cleanup');
  assert.equal(classifySuiteRun(result, { ok: true }).state, 'passed');
});

test('a group member that never exits, or an unreadable group, fails closed', async () => {
  const stuck = await run(groupedChild({}, { helper: { dieOn: null } }));
  assert.deepEqual([stuck.exitCode, stuck.cleanup], [0, 'unconfirmed']);
  assert.equal(classifySuiteRun(stuck, { ok: true }).state, 'incomplete');
  assert.equal((await run(groupedChild({}, {}, { probeError: 'EPERM' }))).cleanup, 'unconfirmed');
  assert.equal(probeGroup(() => { throw Object.assign(new Error('x'), { code: 'EPERM' }); }, 1), 'unknown');
  assert.equal(await cleanUpGroup({ groupSignal: () => {}, pgid: undefined, leader: { closed: () => false }, cleanupMs: 5 }), 'unconfirmed', 'no group id cannot be confirmed');
});

test('unconfirmed cleanup fails unit and RED classification too', () => {
  const passing = { exitCode: 0, signal: null, timedOut: false, cleanup: 'unconfirmed' };
  assert.equal(classifyUnit(passing, parseTapSummary(TAP_OK)).state, 'incomplete');
  const red = { exitCode: 1, signal: null, timedOut: false, cleanup: 'unconfirmed' };
  assert.equal(classifyRed(red, "not ok 2 - t\n  code: 'ERR_ASSERTION'\n", { failing: 't' }).confirmed, false);
});

function gateDeps({ env = { ATLAS_GPU_HANDOFF: 'test' }, porcelain = '', portInUse = false, reports = {}, scripts = {} } = {}) {
  const spawned = [], removed = [], children = new Map();
  const spawnFn = (command, args) => {
    const key = args.join(' ');
    spawned.push(key);
    const child = key.startsWith('scripts/serve.mjs') ? fakeChild({ stdout: `ATLAS is ready at http://localhost:${GATE_PORT}`, ready: true })
      : key === 'scripts/run-unit.mjs' ? fakeChild(scripts.unit ?? { stdout: 'UNIT {"state":"passed","reason":"3 tests passed"}\n' })
      : fakeChild(scripts[key] ?? {});
    child.pid = 1000 + spawned.length;
    child.once('close', () => { child.closed = true; });
    children.set(child.pid, child);
    return child;
  };
  // Each child's group holds only the child: empty once it has closed; signals reach the child.
  const groupSignal = (pgid, name) => {
    const child = children.get(pgid);
    if (!child || child.closed) throw Object.assign(new Error('no such group'), { code: 'ESRCH' });
    if (name !== 0) child.kill(name);
  };
  const manifest = {
    build: { requiredFiles: ['dist/index.html'] },
    suites: [
      { id: 'browser', gpu: false, command: ['tests/browser.mjs'], report: 'b.json', evidence: 'browser', requiredPasses: ['A'] },
      { id: 'graphics', gpu: true, command: ['tests/graphics.mjs'], report: 'g.json', evidence: 'graphics' },
    ],
  };
  const files = { 'tests/suites.manifest.json': manifest, 'b.json': [{ name: 'A' }], 'g.json': [{ samples: [1, 2, 3, 4, 5, 6] }], ...reports };
  return {
    spawned, removed,
    deps: {
      root: '/candidate', env, spawnFn, groupSignal, now: () => '2026-10-20T00:00:00.000Z',
      git: { head: async () => 'abc123', porcelain: async () => porcelain },
      fs: { readJson: async rel => files[rel], exists: async () => true, remove: async rel => { removed.push(rel); } },
      probePort: async () => portInUse,
    },
  };
}

test('a clean candidate with the GPU handed over passes every suite', async () => {
  const { deps, spawned } = gateDeps();
  const record = await runGate(deps);
  assert.equal(record.overall.state, 'passed');
  assert.deepEqual(Object.keys(record.results), ['unit', 'build', 'browser', 'graphics', 'cleanup']);
  assert.deepEqual(record.requiredIds, ['unit', 'build', 'browser', 'graphics', 'cleanup']);
  assert.equal(record.server, 'confirmed', 'the server\'s whole group exited');
  assert.ok(spawned.includes(`scripts/serve.mjs --port ${GATE_PORT}`));
  assert.equal(record.commit, 'abc123');
});

test('a suite that passes but cannot confirm cleanup is incomplete and stops later suites', async () => {
  const { deps, spawned } = gateDeps({ scripts: { 'tests/browser.mjs': { exitCode: 125 } } });
  const record = await runGate(deps);
  assert.match(record.results.browser.reason, /cleanup-unconfirmed/);
  assert.equal(record.results.graphics.state, 'not-run');
  assert.equal(record.results.cleanup.state, 'incomplete');
  assert.equal(record.overall.state, 'failed');
  assert.ok(!spawned.includes('tests/graphics.mjs'), 'no GPU work after an unconfirmed cleanup');
});

test('a printed cleanup failure is honoured whatever the exit code, and stops the GPU suite', async () => {
  const { deps, spawned } = gateDeps({ scripts: { 'tests/browser.mjs': { stdout: 'CLEANUP-UNCONFIRMED browser: close timed out\n', exitCode: 124 } } });
  const record = await runGate(deps);
  assert.match(record.results.browser.reason, /cleanup-unconfirmed/);
  assert.equal(record.results.graphics.state, 'not-run');
  assert.equal(record.overall.state, 'failed');
  assert.ok(!spawned.includes('tests/graphics.mjs'), 'the following GPU suite never launches');
});

test('a GPU deferral leaves the gate pending, never passed', async () => {
  const { deps, spawned } = gateDeps({ env: { ATLAS_GPU_DEFERRED: 'Project 0 holds the GPU' } });
  const record = await runGate(deps);
  assert.equal(record.results.graphics.state, 'deferred');
  assert.equal(record.results.browser.state, 'passed');
  assert.equal(record.overall.state, 'pending');
  assert.ok(!spawned.includes('tests/graphics.mjs'));
});

test('the gate refuses to run without an explicit GPU statement, or on a dirty tree', async () => {
  for (const env of [{}, { ATLAS_GPU_HANDOFF: 'a', ATLAS_GPU_DEFERRED: 'b' }]) {
    const { deps, spawned } = gateDeps({ env });
    const record = await runGate(deps);
    assert.equal(record.overall.state, 'failed');
    assert.deepEqual(spawned, []);
  }
  const dirty = gateDeps({ porcelain: ' M src/app.js' });
  assert.equal((await runGate(dirty.deps)).overall.state, 'failed');
  assert.deepEqual(dirty.spawned, []);
});

test('a failed unit run stops the gate before any browser starts', async () => {
  const { deps, spawned } = gateDeps({ scripts: { unit: { stdout: 'UNIT {"state":"failed","reason":"failures: 1"}\n', exitCode: 1 } } });
  const record = await runGate(deps);
  assert.equal(record.results.unit.state, 'failed');
  assert.equal(record.overall.state, 'failed');
  assert.deepEqual(spawned, ['scripts/run-unit.mjs']);
});

test('an occupied port is never adopted', async () => {
  const { deps, spawned } = gateDeps({ portInUse: true });
  const record = await runGate(deps);
  assert.match(record.results.browser.reason, /in use/);
  assert.equal(record.overall.state, 'failed');
  assert.ok(!spawned.some(key => key.startsWith('scripts/serve.mjs')));
});

test('a suite without its report is incomplete, and the gate fails', async () => {
  const { deps } = gateDeps({ reports: { 'b.json': undefined } });
  const record = await runGate(deps);
  assert.equal(record.results.browser.state, 'incomplete');
  assert.equal(record.overall.state, 'failed');
});

test('the unit runner only runs manifest files and parses RED expectations', () => {
  assert.deepEqual(parseArgs(['tests/unit/a.test.js', '--expect-fail', 'name']), { files: ['tests/unit/a.test.js'], expectation: { failing: 'name' } });
  assert.throws(() => parseArgs(['--expect-missing']), /needs a module path/);
  assert.deepEqual(selectFiles({ files: ['a', 'b'] }, []), ['a', 'b']);
  assert.throws(() => selectFiles({ files: ['a'] }, ['c']), /not in tests\/unit.manifest.json/);
  assert.throws(() => selectFiles({ files: [] }, []), /lists no files/);
});
````

**`tests/unit/no-launch.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import { spawn, execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { DENIED_METHODS, LaunchDeniedError, unitGuardActive } from '../support/no-launch.mjs';
import { within, BoundedWaitTimeout, closeWithin, installSuiteDeadline, cleanupState } from '../support/bounded.mjs';

test('the launch guard is active inside unit-test processes', () => {
  assert.equal(unitGuardActive, true, 'run unit tests through scripts/run-unit.mjs');
  assert.equal(process.env.ATLAS_UNIT_MODE, '1');
});

test('every child_process launcher throws before any side effect', () => {
  for (const method of DENIED_METHODS) {
    assert.throws(() => childProcess[method]('node', ['-e', '']), error => error instanceof LaunchDeniedError && error.method === method, method);
  }
  assert.throws(() => spawn('node'), LaunchDeniedError, 'named ESM binding');
  assert.throws(() => execFileSync('node'), LaunchDeniedError, 'named ESM binding');
});

test('worker threads remain available to unit tests', async () => {
  const worker = new Worker('require("node:worker_threads").parentPort.postMessage(21 * 2)', { eval: true });
  try {
    const value = await within(new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); }), 5000, 'worker');
    assert.equal(value, 42);
  } finally { await worker.terminate(); }
});

test('browser suites refuse to start under a unit run', async () => {
  for (const suite of ['../browser.mjs', '../navigation.mjs', '../graphics.mjs']) {
    await assert.rejects(import(suite), error => error.name === 'UnitModeRefusal', suite);
  }
});

test('bounded waits resolve in time and time out with a classified error', async () => {
  assert.equal(await within(Promise.resolve(7), 50, 'fast'), 7);
  await assert.rejects(within(new Promise(() => {}), 20, 'stuck'), error => error instanceof BoundedWaitTimeout && error.code === 'ATLAS_WAIT_TIMEOUT' && error.label === 'stuck');
  assert.throws(() => within(Promise.resolve(), Infinity, 'unbounded'), RangeError);
});

test('an unconfirmed browser close is terminal and survives a later deadline', async () => {
  class Stopped extends Error {}
  const exits = [];
  const exit = code => { exits.push(code); throw new Stopped(); };
  let launchedNext = false;
  // The simulated failure's protocol lines are captured, never written into the enclosing unit run
  // (the gate reads CLEANUP-UNCONFIRMED from real suite output).
  const captured = [], originalError = console.error;
  console.error = (...args) => { captured.push(args.join(' ')); };
  try {
    const suite = async () => {
      await closeWithin({ close: () => new Promise(() => {}) }, 'browser', { ms: 10, exit });
      launchedNext = true;
    };
    await assert.rejects(suite(), Stopped);
    assert.equal(launchedNext, false, 'no further launch after the failed close');
    assert.deepEqual(exits, [125]);
    assert.equal(cleanupState.unconfirmed, true);
    assert.ok(captured.some(line => line.startsWith('CLEANUP-UNCONFIRMED browser')), 'the marker is emitted');
    const deadlineExits = [];
    const timer = installSuiteDeadline('test', 5, { exit: code => deadlineExits.push(code) });
    await new Promise(resolve => setTimeout(resolve, 30));
    clearTimeout(timer);
    assert.deepEqual(deadlineExits, [125], 'a deadline cannot downgrade 125 to 124');
  } finally {
    console.error = originalError;
    cleanupState.unconfirmed = false;
  }
});
````

Both files import modules that do not exist yet; `no-launch.test.js` imports the browser suites only dynamically, after its static imports of `tests/support/*` have resolved, so a missing support module stops it before any suite is imported.

- [ ] **Step 2: Run them to verify they fail (bootstrap RED, no runner yet)**

Run:
```bash
mkdir -p artifacts/runtime && TMPDIR=artifacts/runtime node --test tests/unit/gate.test.js tests/unit/no-launch.test.js; echo "exit $?"
```
Expected: `exit 1`, and the output contains `ERR_MODULE_NOT_FOUND` for `scripts/gate/lib.mjs` and for `tests/support/no-launch.mjs`. No browser or server starts.

- [ ] **Step 3: Write the classification rules, the supervisor and the unit runner**

**`scripts/gate/lib.mjs`** (complete file):

````js
// Pure evidence and classification rules for the unit runner and the Plane gate.
// Nothing here launches a process or touches the file system.

export const SUITE_STATES = Object.freeze(['passed', 'failed', 'deferred', 'not-run', 'incomplete']);

// Reads the summary block that node:test's TAP reporter prints last.
export function parseTapSummary(text) {
  const read = name => {
    const match = String(text).match(new RegExp(`^# ${name} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  };
  const summary = { tests: read('tests'), pass: read('pass'), fail: read('fail'), cancelled: read('cancelled'), skipped: read('skipped'), todo: read('todo') };
  return Object.values(summary).some(value => value === null) ? null : summary;
}

// A unit run passes only with at least one executed test and no failure, cancellation, skip or todo.
export function classifyUnit({ exitCode, signal, timedOut, spawnError, cleanup }, summary) {
  if (cleanup === 'unconfirmed') return { state: 'incomplete', reason: 'cleanup-unconfirmed: an owned process did not exit' };
  if (timedOut) return { state: 'incomplete', reason: 'timeout' };
  if (spawnError) return { state: 'incomplete', reason: `launch-error: ${spawnError}` };
  if (signal) return { state: 'incomplete', reason: `interrupted: ${signal}` };
  if (!summary) return { state: 'incomplete', reason: 'missing-evidence: no TAP summary' };
  if (summary.tests === 0) return { state: 'failed', reason: 'no-tests' };
  if (summary.skipped > 0 || summary.todo > 0) return { state: 'failed', reason: 'skipped-or-todo-tests' };
  if (summary.fail > 0 || summary.cancelled > 0 || exitCode !== 0) return { state: 'failed', reason: `failures: ${summary.fail}, cancelled: ${summary.cancelled}, exit: ${exitCode}` };
  if (summary.pass !== summary.tests) return { state: 'failed', reason: 'pass count differs from test count' };
  return { state: 'passed', reason: `${summary.pass} tests passed` };
}

const NON_BEHAVIOURAL = /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError: .* is not defined|LaunchDeniedError|ATLAS_LAUNCH_DENIED|cancelledByParent|'test timed out'/;

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The TAP block of one failing test: from its `not ok` line up to the next result line.
export function tapBlock(output, name) {
  const lines = String(output).split('\n');
  const heading = new RegExp(`^\\s*not ok \\d+ - ${escapeRegExp(name)}\\s*$`);
  const start = lines.findIndex(line => heading.test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^\s*(ok|not ok) \d+ - /.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

// RED is behavioural: the named test executes against an importable interface and fails on an
// assertion (ERR_ASSERTION). Missing modules, syntax, reference, launch and timeout failures never
// count. `missing` exists only for the T00 bootstrap and is reported as such.
export function classifyRed(run, output, expectation) {
  if (run.cleanup === 'unconfirmed') return { confirmed: false, reason: 'cleanup-unconfirmed: an owned process did not exit' };
  if (run.timedOut || run.signal || run.spawnError) return { confirmed: false, reason: 'the RED run did not finish normally' };
  if (run.exitCode === 0) return { confirmed: false, reason: 'the tests passed; RED requires a failure' };
  if (expectation.missing) {
    const ok = /ERR_MODULE_NOT_FOUND/.test(output) && output.includes(expectation.missing);
    return ok ? { confirmed: true, reason: `bootstrap only: module ${expectation.missing} does not exist yet` } : { confirmed: false, reason: `expected ERR_MODULE_NOT_FOUND for ${expectation.missing}` };
  }
  if (expectation.failing) {
    if (NON_BEHAVIOURAL.test(output)) return { confirmed: false, reason: 'a module, syntax, reference, launch or timeout failure occurred; RED must be an assertion' };
    const block = tapBlock(output, expectation.failing);
    if (!block) return { confirmed: false, reason: `"${expectation.failing}" did not fail` };
    if (!/ERR_ASSERTION/.test(block)) return { confirmed: false, reason: `"${expectation.failing}" failed, but not on an assertion` };
    return { confirmed: true, reason: `"${expectation.failing}" fails on an assertion` };
  }
  return { confirmed: false, reason: 'no RED expectation given' };
}

// Evidence validators. `missing` means the evidence does not exist (incomplete);
// `invalid` means it exists and shows a failure or a vacuous run (failed).
export function validateEvidence(suite, evidence) {
  if (suite.evidence === 'build') {
    const missing = (suite.requiredFiles || []).filter(file => !evidence.files?.[file]);
    return missing.length ? { ok: false, kind: 'missing', detail: `build output lacks ${missing.join(', ')}` } : { ok: true };
  }
  const report = evidence.report;
  if (report === undefined) return { ok: false, kind: 'missing', detail: `no report at ${suite.report}` };
  if (!Array.isArray(report) || report.length === 0) return { ok: false, kind: 'invalid', detail: 'report is empty or not a list' };
  if (suite.evidence === 'browser') {
    if (report.some(entry => entry?.name === 'FAIL')) return { ok: false, kind: 'invalid', detail: 'report records a failure' };
    const names = new Set(report.map(entry => entry?.name));
    const absent = (suite.requiredPasses || []).filter(name => !names.has(name));
    if (!suite.requiredPasses?.length) return { ok: false, kind: 'invalid', detail: 'suite declares no required passes' };
    return absent.length ? { ok: false, kind: 'invalid', detail: `missing passes: ${absent.join('; ')}` } : { ok: true };
  }
  if (suite.evidence === 'navigation') {
    const backends = report.map(entry => entry?.backend).sort();
    if (JSON.stringify(backends) !== JSON.stringify(['cpu', 'gpu'])) return { ok: false, kind: 'invalid', detail: `backends ${backends}` };
    const bad = report.filter(entry => !(entry.frames > 0 && entry.renderedPerWheel === 1 && entry.burst?.commits === 1));
    return bad.length ? { ok: false, kind: 'invalid', detail: 'a backend lacks frames, a single wheel commit or a burst result' } : { ok: true };
  }
  if (suite.evidence === 'graphics') {
    const bad = report.filter(entry => entry?.error || entry?.samples?.length !== 6 || (suite.benchmark && entry?.benchmarks?.length !== 4));
    return bad.length ? { ok: false, kind: 'invalid', detail: 'a graphics entry failed or is incomplete' } : { ok: true };
  }
  if (suite.evidence === 'workflow') {
    if (report.some(entry => entry?.name === 'FAIL')) return { ok: false, kind: 'invalid', detail: 'report records a failure' };
    const names = new Set(report.map(entry => entry?.name));
    const absent = (suite.requiredPasses || []).filter(name => !names.has(name));
    if (!suite.requiredPasses?.length) return { ok: false, kind: 'invalid', detail: 'suite declares no required passes' };
    return absent.length ? { ok: false, kind: 'invalid', detail: `missing passes: ${absent.join('; ')}` } : { ok: true };
  }
  return { ok: false, kind: 'invalid', detail: `unknown evidence kind ${suite.evidence}` };
}

export function classifySuiteRun(run, evidenceResult) {
  if (/CLEANUP-UNCONFIRMED/.test(`${run.stdout ?? ''}\n${run.stderr ?? ''}`)) return { state: 'incomplete', reason: 'cleanup-unconfirmed: the suite could not confirm closing its browser', cleanup: 'unconfirmed' };
  if (run.cleanup === 'unconfirmed') return { state: 'incomplete', reason: 'cleanup-unconfirmed: the process tree did not exit after SIGKILL', cleanup: 'unconfirmed' };
  if (run.timedOut) return { state: 'incomplete', reason: 'timeout' };
  if (run.spawnError) return { state: 'incomplete', reason: `launch-error: ${run.spawnError}` };
  if (run.signal) return { state: 'incomplete', reason: `interrupted: ${run.signal}` };
  if (run.exitCode === 124) return { state: 'incomplete', reason: 'the suite reached its own deadline' };
  if (run.exitCode === 125) return { state: 'incomplete', reason: 'cleanup-unconfirmed: the suite could not close its browser', cleanup: 'unconfirmed' };
  if (run.exitCode !== 0) return { state: 'failed', reason: `exit ${run.exitCode}` };
  if (!evidenceResult.ok) return { state: evidenceResult.kind === 'missing' ? 'incomplete' : 'failed', reason: evidenceResult.detail };
  return { state: 'passed', reason: 'exit 0 with valid evidence' };
}

// Overall: 0 passed, 2 pending (only explicit GPU deferrals outstanding), 1 failed.
export function overallGate(results, requiredIds) {
  const states = requiredIds.map(id => results[id]?.state ?? 'not-run');
  for (const state of states) if (!SUITE_STATES.includes(state)) return { state: 'failed', exitCode: 1, reason: `unclassified state ${state}` };
  if (states.some(state => state === 'failed' || state === 'incomplete' || state === 'not-run')) return { state: 'failed', exitCode: 1, reason: 'a required suite did not pass' };
  if (states.some(state => state === 'deferred')) return { state: 'pending', exitCode: 2, reason: 'GPU suites deferred by explicit handoff' };
  return { state: 'passed', exitCode: 0, reason: 'every required suite passed' };
}
````

**`scripts/gate/supervise.mjs`** (complete file):

````js
// Runs one child process under hard wall-clock bounds in its own process group (spawned detached),
// and on exit or deadline kills the whole group, bounded: SIGTERM, then SIGKILL, each phase at most
// `cleanupMs`. Cleanup is `confirmed` only when the group is observed empty (signal 0 → ESRCH) and
// the leader has closed; anything else — a surviving member, or a probe that fails for another
// reason — is `unconfirmed`, which every classifier treats as a failure. The result always arrives
// within timeoutMs + 2 × cleanupMs plus one poll.
// Scope (controller ruling, 2026-10-20): the group is the unit of ownership. Processes that leave
// it (Playwright starts the browser in a group of its own) are closed by the suite itself through
// `closeWithin`, which exits 125 when it cannot confirm the close.
export const POLL_MS = 50;
const sleep = ms => new Promise(wake => setTimeout(wake, ms));

// → 'empty' | 'alive' | 'unknown'
export function probeGroup(groupSignal, pgid) {
  try { groupSignal(pgid, 0); return 'alive'; }
  catch (error) { return error?.code === 'ESRCH' ? 'empty' : 'unknown'; }
}

// leader: { closed() → boolean }. → 'not-needed' | 'confirmed' | 'unconfirmed'
export async function cleanUpGroup({ groupSignal, pgid, leader, cleanupMs }) {
  if (!pgid) return leader.closed() ? 'not-needed' : 'unconfirmed';
  const state = () => { const group = probeGroup(groupSignal, pgid); return group === 'unknown' ? 'unknown' : group === 'empty' && leader.closed() ? 'empty' : 'alive'; };
  let current = state();
  if (current === 'empty') return 'not-needed';
  for (const name of ['SIGTERM', 'SIGKILL']) {
    if (current !== 'alive') break;
    try { groupSignal(pgid, name); } catch { /* checked by the probe */ }
    const until = Date.now() + cleanupMs;
    do { await sleep(Math.min(POLL_MS, cleanupMs)); current = state(); } while (current === 'alive' && Date.now() < until);
  }
  return current === 'empty' ? 'confirmed' : 'unconfirmed';
}

const defaultGroupSignal = (pgid, signal) => process.kill(-pgid, signal);

export function runBounded({ spawnFn, groupSignal = defaultGroupSignal, command, args = [], options = {}, timeoutMs, cleanupMs = 5000, echo = false }) {
  if (typeof spawnFn !== 'function') throw new TypeError('runBounded requires spawnFn');
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) throw new RangeError('runBounded requires a positive timeoutMs');
  return new Promise(resolve => {
    let child, stdout = '', stderr = '', timedOut = false, finishing = false, closed = false;
    try { child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options, detached: true }); }
    catch (error) { resolve({ stdout, stderr, timedOut, exitCode: null, signal: null, spawnError: error.message, cleanup: 'not-needed' }); return; }
    async function finish(result) {
      if (finishing) return;
      finishing = true;
      clearTimeout(deadline);
      const cleanup = await cleanUpGroup({ groupSignal, pgid: child.pid, leader: { closed: () => closed }, cleanupMs });
      resolve({ stdout, stderr, timedOut, ...result, cleanup });
    }
    const deadline = setTimeout(() => { timedOut = true; finish({ exitCode: null, signal: 'deadline', spawnError: null }); }, timeoutMs);
    child.stdout?.on('data', data => { stdout += data; if (echo) process.stdout.write(data); });
    child.stderr?.on('data', data => { stderr += data; if (echo) process.stderr.write(data); });
    child.once('error', error => { closed = true; finish({ exitCode: null, signal: null, spawnError: error.message }); });
    child.once('close', (exitCode, signal) => { closed = true; finish({ exitCode, signal, spawnError: null }); });
  });
}
````

**`scripts/run-unit.mjs`** (complete file):

````js
// The only way to run Node unit tests (npm test). Never starts a browser, server or GPU:
// every test process is preloaded with tests/support/no-launch.mjs.
//   node scripts/run-unit.mjs                          all files in tests/unit.manifest.json
//   node scripts/run-unit.mjs tests/unit/x.test.js     selected manifest files
//   … --expect-missing src/shared/scene.js             RED: that module does not exist yet
//   … --expect-fail "exact test name"                  RED: that named test fails
import { spawn } from 'node:child_process';
import { readFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBounded } from './gate/supervise.mjs';
import { parseTapSummary, classifyUnit, classifyRed } from './gate/lib.mjs';

export const UNIT_TIMEOUT_MS = 600_000;
export const TEST_CASE_TIMEOUT_MS = 10_000;

export function parseArgs(argv) {
  const files = [], expectation = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--expect-missing') expectation.missing = argv[++i];
    else if (argv[i] === '--expect-fail') expectation.failing = argv[++i];
    else files.push(argv[i]);
  }
  if ('missing' in expectation && !expectation.missing) throw new Error('--expect-missing needs a module path');
  if ('failing' in expectation && !expectation.failing) throw new Error('--expect-fail needs a test name');
  return { files, expectation };
}

export function selectFiles(manifest, requested) {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('tests/unit.manifest.json lists no files');
  const unknown = requested.filter(file => !manifest.files.includes(file));
  if (unknown.length) throw new Error(`not in tests/unit.manifest.json: ${unknown.join(', ')}`);
  return requested.length ? requested : manifest.files;
}

async function main() {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const { files: requested, expectation } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(resolve(root, 'tests/unit.manifest.json'), 'utf8'));
  const files = selectFiles(manifest, requested);
  for (const file of files) await access(resolve(root, file));
  await mkdir(resolve(root, 'artifacts/runtime'), { recursive: true });
  const run = await runBounded({
    spawnFn: spawn, command: process.execPath, timeoutMs: UNIT_TIMEOUT_MS, echo: !expectation.missing && !expectation.failing,
    args: ['--import', './tests/support/no-launch.mjs', '--test', '--test-reporter=tap', `--test-timeout=${TEST_CASE_TIMEOUT_MS}`, ...files],
    options: { cwd: root, env: { ...process.env, TMPDIR: resolve(root, 'artifacts/runtime'), ATLAS_UNIT_MODE: '1' } },
  });
  const output = `${run.stdout}\n${run.stderr}`;
  if (expectation.missing || expectation.failing) {
    const red = classifyRed(run, output, expectation);
    console.log(`${red.confirmed ? 'RED confirmed' : 'RED NOT confirmed'}: ${red.reason}`);
    if (!red.confirmed) console.log(output);
    process.exitCode = red.confirmed ? 0 : 1;
    return;
  }
  const result = classifyUnit(run, parseTapSummary(run.stdout));
  console.log(`UNIT ${JSON.stringify({ ...result, files: files.length, summary: parseTapSummary(run.stdout) })}`);
  process.exitCode = result.state === 'passed' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await main();
````

**`tests/support/no-launch.mjs`** (complete file):

````js
// Preloaded into every unit-test process by scripts/run-unit.mjs (`node --import`).
// Inside a node:test child process (NODE_TEST_CONTEXT=child…) every child_process
// launcher throws before any side effect, so a RED or unit run can never start a
// server, a browser or a GPU process. The supervising runner process is untouched:
// node:test itself needs `spawn` to start each test file.
// This is an enforced repository rule, not a security sandbox.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

export const DENIED_METHODS = Object.freeze(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);

export class LaunchDeniedError extends Error {
  constructor(method) {
    super(`Unit tests may not launch processes (child_process.${method}).`);
    this.name = 'LaunchDeniedError';
    this.code = 'ATLAS_LAUNCH_DENIED';
    this.method = method;
  }
}

export const unitGuardActive = String(process.env.NODE_TEST_CONTEXT || '').startsWith('child');

if (unitGuardActive) {
  for (const method of DENIED_METHODS) {
    childProcess[method] = () => { throw new LaunchDeniedError(method); };
  }
  // Rebind the named ESM exports (`import { spawn } from 'node:child_process'`).
  syncBuiltinESMExports();
  process.env.ATLAS_UNIT_MODE = '1';
}
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js"
  ]
}
````

- [ ] **Step 4: Write the gate and the suite manifest**

**`scripts/plane-gate.mjs`** (complete file):

````js
// The Plane behaviour gate (spec §4.3, §16.3), run on every 1a commit:
//   ATLAS_GPU_HANDOFF="<who, when>" node scripts/plane-gate.mjs     GPU handed to Project 1
//   ATLAS_GPU_DEFERRED="<reason>"   node scripts/plane-gate.mjs     GPU held (e.g. by Project 0)
// Exactly one of the two must be set; the gate never probes the GPU.
// Exit 0 passed, 2 pending (only GPU suites deferred), 1 failed. Records go to
// artifacts/gates/<stamp>-<sha>.json and one line per run to artifacts/gates/ledger.jsonl.
import { spawn, execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { readFile, rm, mkdir, writeFile, appendFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBounded, cleanUpGroup } from './gate/supervise.mjs';
import { validateEvidence, classifySuiteRun, overallGate } from './gate/lib.mjs';

export const GATE_PORT = 5190;
export const SERVER_READY_MS = 15_000;
export const UNIT_MS = 600_000;
export const BUILD_MS = 120_000;
export const SUITE_MS = 600_000;
export const CLEANUP_MS = 5_000;
export const GATE_RECORD_SCHEMA = 'atlas.plane-gate';
export const GIT_MS = 10_000;

function startOwnedServer({ spawnFn, root, env }) {
  return new Promise(resolveStart => {
    let child, ready = false, output = '';
    try {
      child = spawnFn(process.execPath, ['scripts/serve.mjs', '--port', String(GATE_PORT)], { cwd: root, env: { ...env, PORT: String(GATE_PORT) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } catch (error) { resolveStart({ ok: false, reason: `server launch failed: ${error.message}` }); return; }
    const server = { child, exited: false };
    child.once('close', () => { server.exited = true; });
    const timer = setTimeout(() => { if (!ready) resolveStart({ ok: false, reason: 'server did not report readiness', server }); }, SERVER_READY_MS);
    child.stdout.on('data', data => {
      output += data;
      if (!ready && output.includes(`ATLAS is ready at http://localhost:${GATE_PORT}`)) { ready = true; clearTimeout(timer); resolveStart({ ok: true, server }); }
    });
    child.stderr?.on('data', data => { output += data; });
    child.once('error', error => { clearTimeout(timer); server.exited = true; if (!ready) resolveStart({ ok: false, reason: `server error: ${error.message}`, server }); });
    child.once('close', code => { clearTimeout(timer); if (!ready) resolveStart({ ok: false, reason: `server exited (${code}) before readiness: ${output.trim()}`, server }); });
  });
}

// → 'not-needed' | 'confirmed' | 'unconfirmed': the server's whole process group has exited.
function stopOwnedServer(server, groupSignal) {
  if (!server) return Promise.resolve('not-needed');
  return cleanUpGroup({ groupSignal, pgid: server.child.pid, leader: { closed: () => server.exited }, cleanupMs: CLEANUP_MS });
}

// deps: { root, env, spawnFn, groupSignal?, git: { head(), porcelain() }, fs: { readJson(rel), exists(rel), remove(rel) }, probePort(port), now() }
export async function runGate(deps) {
  for (const key of ['root', 'env', 'spawnFn', 'git', 'fs', 'probePort', 'now']) if (!deps?.[key]) throw new TypeError(`runGate requires ${key}`);
  const { root, env, spawnFn, git, fs, probePort, now } = deps;
  const groupSignal = deps.groupSignal ?? ((pgid, signal) => process.kill(-pgid, signal));
  const startedAt = now();
  const manifest = await fs.readJson('tests/suites.manifest.json');
  const requiredIds = ['unit', 'build', ...manifest.suites.map(suite => suite.id), 'cleanup'];
  const results = {};
  const record = { schema: GATE_RECORD_SCHEMA, schemaVersion: 1, startedAt, commit: null, requiredIds, handoff: env.ATLAS_GPU_HANDOFF || null, deferral: env.ATLAS_GPU_DEFERRED || null, results, notes: [] };
  let cleanupConfirmed = true;
  const finish = () => {
    if (!results.cleanup) results.cleanup = cleanupConfirmed ? { state: 'passed', reason: 'every owned process exited' } : { state: 'incomplete', reason: 'cleanup-unconfirmed: an owned process tree did not exit' };
    record.finishedAt = now(); record.overall = overallGate(results, requiredIds); return record;
  };
  const supervised = async (args, timeoutMs, extraEnv = {}) => {
    const run = await runBounded({ spawnFn, groupSignal, command: process.execPath, args, options: { cwd: root, env: { ...childEnv, ...extraEnv } }, timeoutMs, cleanupMs: CLEANUP_MS });
    if (run.cleanup === 'unconfirmed' || run.exitCode === 125 || /CLEANUP-UNCONFIRMED/.test(`${run.stdout}\n${run.stderr}`)) cleanupConfirmed = false;
    return run;
  };

  if (Boolean(env.ATLAS_GPU_HANDOFF) === Boolean(env.ATLAS_GPU_DEFERRED)) {
    record.notes.push('exactly one of ATLAS_GPU_HANDOFF or ATLAS_GPU_DEFERRED must name the GPU state');
    return finish();
  }
  record.commit = await git.head();
  if (await git.porcelain()) { record.notes.push('the working tree has uncommitted changes; a gate runs only on a commit'); return finish(); }
  const childEnv = { ...env, TMPDIR: resolve(root, 'artifacts/runtime') };

  const unit = await supervised(['scripts/run-unit.mjs'], UNIT_MS);
  const unitLine = unit.stdout.split('\n').find(line => line.startsWith('UNIT '));
  let unitResult = null;
  try { unitResult = unitLine ? JSON.parse(unitLine.slice(5)) : null; } catch { unitResult = null; }
  results.unit = classifySuiteRun(unit, unitResult ? (unitResult.state === 'passed' ? { ok: true } : { ok: false, kind: 'invalid', detail: unitResult.reason }) : { ok: false, kind: 'missing', detail: 'no UNIT summary line' });
  if (results.unit.state !== 'passed') return finish();

  await fs.remove('dist');
  const build = await supervised(['scripts/build.mjs'], BUILD_MS);
  const files = {};
  for (const file of manifest.build.requiredFiles) files[file] = await fs.exists(file);
  results.build = classifySuiteRun(build, validateEvidence({ evidence: 'build', requiredFiles: manifest.build.requiredFiles }, { files }));

  const toRun = [];
  for (const suite of manifest.suites) {
    if (suite.gpu && env.ATLAS_GPU_DEFERRED) results[suite.id] = { state: 'deferred', reason: env.ATLAS_GPU_DEFERRED };
    else toRun.push(suite);
  }
  if (toRun.length) {
    if (await probePort(GATE_PORT)) {
      for (const suite of toRun) results[suite.id] = { state: 'incomplete', reason: `port ${GATE_PORT} is in use; the gate never adopts a server` };
      return finish();
    }
    const started = await startOwnedServer({ spawnFn, root, env: childEnv });
    try {
      if (!started.ok) {
        for (const suite of toRun) results[suite.id] = { state: 'incomplete', reason: started.reason };
      } else {
        for (const suite of toRun) {
          if (!cleanupConfirmed) { results[suite.id] = { state: 'not-run', reason: 'an earlier suite\'s cleanup was unconfirmed; no further browser or GPU work starts' }; continue; }
          if (started.server.exited) { results[suite.id] = { state: 'incomplete', reason: 'the owned server exited' }; continue; }
          await fs.remove(suite.report);
          const run = await supervised(suite.command, SUITE_MS, { ATLAS_URL: `http://127.0.0.1:${GATE_PORT}` });
          const report = await fs.readJson(suite.report);
          results[suite.id] = started.server.exited ? { state: 'incomplete', reason: 'the owned server exited during the suite' } : classifySuiteRun(run, validateEvidence(suite, { report }));
        }
      }
    } finally {
      record.server = await stopOwnedServer(started.server, groupSignal);
      if (record.server === 'unconfirmed') cleanupConfirmed = false;
    }
  }
  if (await git.head() !== record.commit || await git.porcelain()) {
    record.notes.push('the commit or tracked tree changed during the gate');
    results.unit = { state: 'failed', reason: 'tree changed during the gate' };
  }
  return finish();
}

function productionDeps(root) {
  const run = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: GIT_MS, killSignal: 'SIGKILL' }).trim();
  return {
    root, env: process.env, spawnFn: spawn, now: () => new Date().toISOString(),
    git: { head: async () => run(['rev-parse', 'HEAD']), porcelain: async () => run(['status', '--porcelain']) },
    fs: {
      readJson: async rel => { try { return JSON.parse(await readFile(resolve(root, rel), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return undefined; return { unreadable: error.message }; } },
      exists: async rel => access(resolve(root, rel)).then(() => true, () => false),
      remove: async rel => rm(resolve(root, rel), { recursive: true, force: true }),
    },
    probePort: port => new Promise(resolveProbe => {
      const socket = connect({ port, host: '127.0.0.1' });
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolveProbe(true); });
      socket.once('timeout', () => { socket.destroy(); resolveProbe(true); });
      socket.once('error', () => resolveProbe(false));
    }),
  };
}

async function main() {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const record = await runGate(productionDeps(root));
  await mkdir(resolve(root, 'artifacts/gates'), { recursive: true });
  const name = `artifacts/gates/${record.startedAt.replace(/[:.]/g, '-')}-${(record.commit || 'none').slice(0, 12)}.json`;
  await writeFile(resolve(root, name), JSON.stringify(record, null, 2));
  await appendFile(resolve(root, 'artifacts/gates/ledger.jsonl'), `${JSON.stringify({ commit: record.commit, startedAt: record.startedAt, overall: record.overall.state, record: name, deferral: record.deferral })}\n`);
  for (const [id, result] of Object.entries(record.results)) console.log(`${id.padEnd(18)} ${result.state.padEnd(10)} ${result.reason}`);
  for (const note of record.notes) console.log(`note: ${note}`);
  console.log(`GATE ${record.overall.state.toUpperCase()} (${record.overall.reason}) → ${name}`);
  process.exitCode = record.overall.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await main();
````

**`tests/suites.manifest.json`** (complete file):

````json
{
  "build": { "requiredFiles": ["dist/index.html", "dist/src/app.js"] },
  "suites": [
    { "id": "browser", "gpu": false, "command": ["tests/browser.mjs"], "report": "artifacts/browser-report.json", "evidence": "browser",
      "requiredPasses": ["Desktop WebGL startup and unobstructed controls", "WebGL acceleration is labeled accurately and exposes its actual renderer", "Instant palette changes without recalculating the fractal", "Wheel zoom and pointer drag", "GPU escape values agree with independent BigInt oracle", "Laptop layout keeps exact-coordinate navigation accessible", "Repeated GPU navigation reaches the latest view and full resolution", "Bookmarks persist across reloads", "Cinema mode, keyboard shortcuts, and accessible help dialog", "Arbitrary coordinate navigation enters extended GPU mode", "Shared URL restores precision and settings", "PNG export", "JSON location export and import preserve exact coordinates", "Journey animates and manual navigation stops it", "Mobile layout, settings, touch drag, and cursor-centered pinch zoom", "CPU worker escape values agree with independent BigInt oracle", "CPU palette caching, render cancellation, and responsive navigation", "Automatic CPU fallback when webgl2 is unavailable", "Automatic CPU fallback when float-targets is unavailable", "No browser runtime errors"] },
    { "id": "browser-hardware", "gpu": true, "command": ["tests/browser.mjs", "--hardware"], "report": "artifacts/hardware-browser-report.json", "evidence": "browser",
      "requiredPasses": ["Desktop WebGL startup and unobstructed controls", "WebGL acceleration is labeled accurately and exposes its actual renderer", "Instant palette changes without recalculating the fractal", "Wheel zoom and pointer drag", "GPU escape values agree with independent BigInt oracle", "Laptop layout keeps exact-coordinate navigation accessible", "Repeated GPU navigation reaches the latest view and full resolution", "Bookmarks persist across reloads", "Cinema mode, keyboard shortcuts, and accessible help dialog", "Arbitrary coordinate navigation enters extended GPU mode", "Shared URL restores precision and settings", "PNG export", "JSON location export and import preserve exact coordinates", "Journey animates and manual navigation stops it", "Mobile layout, settings, touch drag, and cursor-centered pinch zoom", "CPU worker escape values agree with independent BigInt oracle", "CPU palette caching, render cancellation, and responsive navigation", "Automatic CPU fallback when webgl2 is unavailable", "Automatic CPU fallback when float-targets is unavailable", "No browser runtime errors"] },
    { "id": "navigation", "gpu": false, "command": ["tests/navigation.mjs"], "report": "artifacts/navigation-report.json", "evidence": "navigation" },
    { "id": "graphics", "gpu": true, "benchmark": true, "command": ["tests/graphics.mjs", "--chrome", "--headed", "--compositor", "--benchmark"], "report": "artifacts/graphics-report.json", "evidence": "graphics" }
  ]
}
````

- [ ] **Step 5: Guard and bound the browser suites**

Each suite now imports `./support/entry-guard.mjs` first and Playwright dynamically, installs a suite deadline, bounds the creation of every context and page and gives them default bounds (`within`, `boundContext`), bounds every `page.evaluate` (`ev` or `within`; `idleWithin` passes its bound to `atlas.whenIdle`), every close and every download, and exits 125 if it cannot confirm closing its browser. The only assertion additions are the non-vacuity checks (six numerical views with six samples each; six GPU samples; four benchmarks; at least one observed frame).

**`tests/support/entry-guard.mjs`** (complete file):

````js
// The first import of every browser suite. Under a unit or RED run it throws
// before the suite imports Playwright, starts a server or launches a browser.
export class UnitModeRefusal extends Error {
  constructor() {
    super('This browser suite refuses to run under unit tests (ATLAS_UNIT_MODE or NODE_TEST_CONTEXT is set).');
    this.name = 'UnitModeRefusal';
    this.code = 'ATLAS_UNIT_MODE_REFUSAL';
  }
}
export function inUnitMode(env = process.env) {
  return env.ATLAS_UNIT_MODE === '1' || String(env.NODE_TEST_CONTEXT || '').startsWith('child');
}
if (inUnitMode()) throw new UnitModeRefusal();
````

**`tests/support/bounded.mjs`** (complete file):

````js
// Bounded waits for browser suites. A timeout is a classified failure; callers
// follow it with bounded cleanup (closeWithin), and the suite deadline ends the
// process if cleanup itself cannot finish.
export const LIMITS = Object.freeze({
  launch: 15_000,      // browser launch and server readiness
  operation: 30_000,   // ordinary browser operation
  deep: 120_000,       // explicit deep render or numerical probe
  suite: 600_000,      // whole suite
  cleanup: 5_000,      // graceful cleanup before termination
});

export class BoundedWaitTimeout extends Error {
  constructor(label, ms) {
    super(`${label} did not finish within ${ms} ms.`);
    this.name = 'BoundedWaitTimeout';
    this.code = 'ATLAS_WAIT_TIMEOUT';
    this.label = label;
    this.ms = ms;
  }
}

export function within(promise, ms, label) {
  if (!(Number.isFinite(ms) && ms > 0)) throw new RangeError(`within(${label}) needs a positive finite bound`);
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new BoundedWaitTimeout(label, ms)), ms); });
  return Promise.race([Promise.resolve(promise), deadline]).finally(() => clearTimeout(timer));
}

// Every Playwright action, locator, wait and navigation on this context or page gets a
// default bound; page.evaluate has none, so suites call it through ev().
export function boundContext(target) {
  target.setDefaultTimeout(LIMITS.operation);
  target.setDefaultNavigationTimeout(LIMITS.launch);
  return target;
}

// page.evaluate under a bound.
export function ev(target, fn, arg, label = 'page.evaluate', ms = LIMITS.operation) {
  return within(target.evaluate(fn, arg), ms, label);
}

// Waits for the application's own idle signal, bounded from outside the page.
export function idleWithin(page, ms = LIMITS.operation) {
  return within(page.evaluate(timeoutMs => window.atlas.whenIdle({ timeoutMs }), ms), ms + LIMITS.cleanup, 'atlas.whenIdle');
}

// Bounded close. A close that cannot be confirmed is sticky and terminal: the suite prints
// CLEANUP-UNCONFIRMED (which the gate reads whatever the exit code), records it, and exits 125 at
// once, so no further browser or GPU work starts and no later deadline or error can downgrade it.
export const CLEANUP_UNCONFIRMED_EXIT = 125;
export const cleanupState = { unconfirmed: false };
export async function closeWithin(resource, label, { ms = LIMITS.cleanup, exit = code => process.exit(code) } = {}) {
  if (!resource) return 'absent';
  try { await within(resource.close(), ms, `${label}.close`); return 'closed'; }
  catch (error) {
    cleanupState.unconfirmed = true;
    console.error(`CLEANUP-UNCONFIRMED ${label}: ${error.message}`);
    exit(CLEANUP_UNCONFIRMED_EXIT);
    return 'abandoned';
  }
}

// Ends the process with exit code 124 if the whole suite overruns its bound.
export function installSuiteDeadline(name, ms = LIMITS.suite, { exit = code => process.exit(code) } = {}) {
  const timer = setTimeout(() => {
    console.error(`SUITE-DEADLINE ${name}: exceeded ${ms} ms`);
    exit(cleanupState.unconfirmed ? CLEANUP_UNCONFIRMED_EXIT : 124);
  }, ms);
  timer.unref();
  return timer;
}
````

**`tests/browser.mjs`** (complete file):

````js
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('browser');

await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const hardware = process.argv.includes('--hardware');
const reportPath = `artifacts/${hardware ? 'hardware-' : ''}browser-report.json`;
let server, browser;
const report = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const errors = [];
function watchErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
}
async function idle(page) {
  // Let browser input/resize events reach the render queue before waiting on it.
  await page.waitForTimeout(400);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && document.body.dataset.rendering === 'false', null, { timeout: 60000 });
  await idleWithin(page);
}
async function checkLayout(page) {
  const problems = await ev(page, () => {
    const issues = [];
    for (const selector of ['.topbar', '.navigation', '.navigation-hint', '.panel', '.destinations']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < 0 || rect.right > innerWidth + 1 || rect.top < 0 || rect.bottom > innerHeight + 1) issues.push(`${selector} outside viewport`);
    }
    const panel = document.querySelector('.panel').getBoundingClientRect();
    for (const selector of ['.destination-tabs', '.navigation']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top) issues.push(`${selector} overlaps panel`);
    }
    return issues;
  });
  assert.deepEqual(problems, []);
}

// Runs inside the browser; the exact recurrence is independent of both renderers.
async function numericalProbe(backend) {
  const { GpuRenderer, CpuRenderer } = await import('/src/renderer.js');
  const { fixed, spanFixed, precisionFor, escapeTimeExact } = await import('/src/math.js');
  const { colorPixel, paletteBytes, PALETTES } = await import('/src/palettes.js');
  const renderer = new (backend === 'gpu' ? GpuRenderer : CpuRenderer)(document.createElement('canvas'));
  const cases = [
    { re: '-.5', im: '.1', zoom: 0, iterations: 700 },
    { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4, iterations: 1500 },
    { re: '-0.743643887037151', im: '0.13182590420533', zoom: 15.5, iterations: 4500 },
    { re: '-0.743735546648121901421502749766284274', im: '0.13180188244022899880486875943155304', zoom: 9.178000000000004, iterations: 1222 },
    { re: '-0.74373554655981392496378600769218837122', im: '0.13180188254868144746747814705787405605', zoom: 11.242000000000006, iterations: 1288 },
    { re: '-2', im: '0', zoom: 1000, iterations: 2100 },
  ];
  const result = [];
  try {
    for (const view of cases) {
      const width = view.zoom === 9.178000000000004 ? 320 : 16, height = width === 320 ? 96 : 12;
      await renderer.render(view, { palette: 'ember', phase: .11, frequency: 1, relief: 1, iterations: view.iterations }, width, height);
      const field = backend === 'gpu' ? renderer.readField() : renderer.data;
      if (backend === 'cpu') {
        // Check the actual painted canvas, including rows from earlier worker tiles.
        const rgba = renderer.context.getImageData(0, 0, width, height).data;
        const palette = paletteBytes(PALETTES[0]);
        for (let index = 0; index < field.length; index += 4) {
          const expected = [...colorPixel(field[index], field[index + 1], palette, .11, 1, 1), 255];
          if (expected.some((channel, offset) => channel !== rgba[index + offset])) throw new Error(`CPU paint mismatch at ${index / 4}`);
        }
      }
      const digits = precisionFor(view.zoom), span = spanFixed(view.zoom, digits);
      const re = fixed(view.re, digits), im = fixed(view.im, digits);
      let maximumError = 0, mismatches = 0, samples = 0;
      const points = width === 320 ? [[1, 1], [65, 18], [130, 35], [180, 51], [240, 77], [315, 94]] : [[1, 1], [5, 2], [11, 4], [2, 8], [13, 9], [6, 10]];
      for (const [x, y] of points) {
        const cr = re + span * BigInt(2 * x + 1 - width) / BigInt(2 * width);
        const ci = im + span * BigInt(2 * y + 1 - height) / BigInt(2 * width);
        const row = backend === 'gpu' ? y : height - y - 1;
        const expected = escapeTimeExact(cr, ci, digits, view.iterations), actual = field[(row * width + x) * 4];
        if ((expected < 0) !== (actual < 0) || !Number.isFinite(actual)) mismatches++;
        if (expected >= 0 && actual >= 0) maximumError = Math.max(maximumError, Math.abs(expected - actual));
        samples++;
      }
      result.push({ zoom: view.zoom, maximumError, mismatches, samples });
    }
  } finally { renderer.destroy(); }
  return result;
}
function checkNumerical(results) {
  assert.equal(results.length, 6, 'all six numerical views must be sampled');
  for (const result of results) {
    assert.equal(result.samples, 6, JSON.stringify(result));
    assert.equal(result.mismatches, 0, JSON.stringify(result));
    assert.ok(result.maximumError < .5, JSON.stringify(result));
  }
}
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', ...(hardware ? ['--enable-gpu', '--use-angle=vulkan'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
  const context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  watchErrors(page);
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  assert.match(await page.title(), /ATLAS/);
  assert.match(await page.locator('#engine-status').textContent(), hardware ? /^GPU/ : /SOFTWARE WEBGL/);
  assert.equal(await ev(page, () => atlas.graphics.acceleration), hardware ? 'hardware' : 'software');
  await page.screenshot({ path: 'artifacts/atlas-desktop.png', animations: 'disabled' });
  await checkLayout(page);
  const graphics = await ev(page, () => {
    const gl = atlas.renderer.gl, info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) };
  });
  pass('Desktop WebGL startup and unobstructed controls', { graphics });

  await page.getByRole('button', { name: 'Show graphics details', exact: true }).click();
  assert.match(await page.locator('#graphics-device').textContent(), hardware ? /NVIDIA|AMD|Intel|Apple/i : /SwiftShader/);
  assert.match(await page.locator('#graphics-summary').textContent(), hardware ? /hardware graphics device/ : /software on the CPU/);
  await page.keyboard.press('Escape');
  pass('WebGL acceleration is labeled accurately and exposes its actual renderer');

  const before = await ev(page, () => ({ count: atlas.rendered, image: document.querySelector('canvas').toDataURL() }));
  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  const after = await ev(page, () => ({ count: atlas.rendered, image: document.querySelector('canvas').toDataURL() }));
  assert.equal(before.count, after.count); assert.notEqual(before.image, after.image);
  pass('Instant palette changes without recalculating the fractal');

  const oldView = await ev(page, () => atlas.view);
  await page.mouse.move(720, 440); await page.mouse.wheel(0, -120);
  await page.waitForTimeout(400); await idleWithin(page);
  assert.ok((await ev(page, () => atlas.view.zoom)) > oldView.zoom);
  await page.mouse.move(600, 420); await page.mouse.down(); await page.mouse.move(650, 450, { steps: 5 }); await page.mouse.up();
  await idle(page);
  assert.notEqual((await ev(page, () => atlas.view.re)), oldView.re);
  pass('Wheel zoom and pointer drag');

  await page.keyboard.press('b');
  await page.getByRole('button', { name: /Your discoveries/ }).click();
  await page.waitForFunction(() => document.querySelector('#saved-count').textContent === '1', null, { timeout: LIMITS.operation });
  assert.equal(await page.locator('.saved-wrapper').count(), 1);
  await page.reload({ timeout: LIMITS.launch }); await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.equal(await page.locator('#saved-count').textContent(), '1');
  pass('Bookmarks persist across reloads');

  await page.getByRole('button', { name: 'Cinema mode', exact: true }).click();
  assert.ok(await page.locator('body').evaluate(el => el.classList.contains('cinema')));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls and about', exact: true }).click();
  assert.ok(await page.locator('#help-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  pass('Cinema mode, keyboard shortcuts, and accessible help dialog');

  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('-2'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('40');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  await idleWithin(page, LIMITS.deep);
  assert.equal((await ev(page, () => atlas.view.zoom)), 40);
  assert.match(await page.locator('#engine-status').textContent(), /EXTENDED/);
  pass('Arbitrary coordinate navigation enters extended GPU mode');

  await page.getByRole('button', { name: /Share view/ }).click();
  assert.match(page.url(), /#re=-2/);
  const sharedPage = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage')); watchErrors(sharedPage); await sharedPage.goto(page.url(), { timeout: LIMITS.launch });
  await sharedPage.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.equal(await ev(sharedPage, () => atlas.view.zoom), 40);
  await closeWithin(sharedPage, 'sharedPage'); pass('Shared URL restores precision and settings');

  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.locator('#export-size').selectOption('current');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  const downloaded = await within(downloadPromise, LIMITS.deep, 'PNG download'); await within(downloaded.saveAs('artifacts/export-test.png'), LIMITS.operation, 'PNG save');
  assert.match(downloaded.suggestedFilename(), /\.png$/);
  const png = await readFile('artifacts/export-test.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
  pass('PNG export', { width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

  const locationDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save location (.json)', exact: true }).click();
  await within((await within(locationDownload, LIMITS.operation, 'location download')).saveAs('artifacts/export-test.json'), LIMITS.operation, 'location save');
  const savedLocation = JSON.parse(await readFile('artifacts/export-test.json', 'utf8'));
  assert.deepEqual(savedLocation.view, await ev(page, () => atlas.view));
  await page.keyboard.press('Escape');
  await within(page.evaluate(async () => { atlas.goTo({ re: '-.5', im: '0', zoom: 0 }); await atlas.whenIdle(); }), LIMITS.operation, 'move away before import');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.locator('#import-location').setInputFiles('artifacts/export-test.json');
  await idle(page);
  assert.deepEqual(await ev(page, () => atlas.view), savedLocation.view);
  assert.equal(await page.locator('#capture-dialog').evaluate(el => el.open), false);
  pass('JSON location export and import preserve exact coordinates');

  const numerical = await within(page.evaluate(numericalProbe, 'gpu'), LIMITS.deep, 'GPU numerical probe');
  checkNumerical(numerical);
  pass('GPU escape values agree with independent BigInt oracle', { numerical });

  await within(page.evaluate(async () => { atlas.goTo({ re: '-.743643887037151', im: '.13182590420533', zoom: 3.85 }); await atlas.whenIdle(); }), LIMITS.operation, 'return to Seahorse valley');
  await page.setViewportSize({ width: 1280, height: 720 });
  await idle(page);
  await checkLayout(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  assert.ok(await page.locator('#coordinate-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/atlas-laptop.png', animations: 'disabled' });
  pass('Laptop layout keeps exact-coordinate navigation accessible');

  const response = await within(page.evaluate(async () => {
    const start = performance.now(), initial = atlas.view.zoom;
    for (let i = 0; i < 6; i++) {
      document.querySelector('#zoom-in').click();
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    await atlas.whenIdle();
    atlas.renderer.gl.finish();
    return { elapsedMs: performance.now() - start, initial, final: atlas.view.zoom, width: atlas.renderer.canvas.width, height: atlas.renderer.canvas.height };
  }), LIMITS.deep, 'repeated GPU navigation');
  assert.ok(Math.abs(response.final - response.initial - 6 * Math.log10(2)) < 1e-10);
  assert.equal(response.width, 1280); assert.equal(response.height, 720);
  pass('Repeated GPU navigation reaches the latest view and full resolution', { response });
  await page.getByRole('button', { name: /Take a journey/ }).click();
  await page.waitForFunction(() => !document.querySelector('#tour-status').hidden && atlas.view.zoom > 3.85, null, { timeout: LIMITS.operation });
  await page.keyboard.press('+');
  assert.ok(await page.locator('#tour-status').evaluate(el => el.hidden));
  await idle(page);
  pass('Journey animates and manual navigation stops it');

  const mobileContext = boundContext(await within(browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }), LIMITS.launch, 'newContext'));
  const mobile = boundContext(await within(mobileContext.newPage(), LIMITS.launch, 'newPage')); watchErrors(mobile);
  await mobile.goto(url, { timeout: LIMITS.launch }); await idle(mobile);
  await mobile.screenshot({ path: 'artifacts/atlas-mobile.png', animations: 'disabled' });
  await checkLayout(mobile);
  assert.ok(await ev(mobile, () => document.documentElement.scrollWidth <= innerWidth));
  await mobile.getByRole('button', { name: 'Abyss palette', exact: true }).tap();
  assert.equal(await ev(mobile, () => atlas.settings.palette), 'ocean');
  await mobile.getByRole('button', { name: 'Explorer settings', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Go to', exact: true }).tap();
  assert.ok(await mobile.locator('#coordinate-dialog').evaluate(el => el.open));
  await mobile.locator('#coordinate-dialog').getByRole('button', { name: 'Close', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Explorer settings', exact: true }).tap();
  await idle(mobile);
  const touch = await mobileContext.newCDPSession(mobile);
  const touchEvent = (type, touchPoints) => touch.send('Input.dispatchTouchEvent', { type, touchPoints });
  const beforeTouch = await ev(mobile, () => atlas.view);
  await touchEvent('touchStart', [{ x: 100, y: 380, id: 1 }]);
  await touchEvent('touchMove', [{ x: 140, y: 400, id: 1 }]);
  await touchEvent('touchEnd', []);
  await idle(mobile);
  assert.notEqual(await ev(mobile, () => atlas.view.re), beforeTouch.re);
  const beforePinch = await ev(mobile, () => atlas.view.zoom);
  await touchEvent('touchStart', [{ x: 130, y: 380, id: 1 }, { x: 230, y: 380, id: 2 }]);
  await touchEvent('touchMove', [{ x: 100, y: 380, id: 1 }, { x: 260, y: 380, id: 2 }]);
  await touchEvent('touchEnd', []);
  await idle(mobile);
  assert.ok(Math.abs(await ev(mobile, () => atlas.view.zoom) - beforePinch - Math.log10(1.6)) < 1e-8);
  assert.equal(await ev(mobile, () => visualViewport.scale), 1);
  await touch.detach();
  pass('Mobile layout, settings, touch drag, and cursor-centered pinch zoom');
  await closeWithin(mobileContext, 'mobileContext');
  await closeWithin(context, 'context');

  // Exercise actual startup fallback, including a context that lacks float targets.
  for (const unavailable of ['webgl2', 'float-targets']) {
    const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 } }), LIMITS.launch, 'newContext'));
    await cpuContext.addInitScript(kind => {
      if (kind === 'webgl2') {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === 'webgl2' ? null : original.call(this, type, ...args);
        };
      } else {
        const original = WebGL2RenderingContext.prototype.getExtension;
        WebGL2RenderingContext.prototype.getExtension = function (name) {
          return name === 'EXT_color_buffer_float' ? null : original.call(this, name);
        };
      }
    }, unavailable);
    const cpu = boundContext(await within(cpuContext.newPage(), LIMITS.launch, 'newPage')); watchErrors(cpu);
    const started = performance.now();
    await cpu.goto(url, { timeout: LIMITS.launch }); await idle(cpu);
    const startupMs = performance.now() - started;
    assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
    await cpu.getByRole('button', { name: 'Controls and about', exact: true }).click();
    await cpu.getByRole('button', { name: 'Graphics details', exact: true }).click();
    assert.equal(await ev(cpu, () => atlas.graphics.acceleration), 'cpu');
    assert.match(await cpu.locator('#graphics-reason').textContent(), unavailable === 'webgl2' ? /WebGL 2 context creation failed/ : /EXT_color_buffer_float is missing/);
    await cpu.keyboard.press('Escape');
    assert.ok(await ev(cpu, () => atlas.renderer.data.some((value, index) => index % 4 === 0 && value > 0)));
    if (unavailable === 'webgl2') {
      await cpu.screenshot({ path: 'artifacts/atlas-cpu.png', animations: 'disabled' });
      const cpuNumerical = await within(cpu.evaluate(numericalProbe, 'cpu'), LIMITS.deep, 'CPU numerical probe');
      checkNumerical(cpuNumerical);
      pass('CPU worker escape values agree with independent BigInt oracle', { numerical: cpuNumerical });
      const cpuBefore = await ev(cpu, () => ({ count: atlas.rendered, image: atlas.renderer.canvas.toDataURL() }));
      await cpu.getByRole('button', { name: 'Aurora palette', exact: true }).click();
      const cpuAfter = await ev(cpu, () => ({ count: atlas.rendered, image: atlas.renderer.canvas.toDataURL() }));
      assert.equal(cpuBefore.count, cpuAfter.count); assert.notEqual(cpuBefore.image, cpuAfter.image);
      const responsiveness = await within(cpu.evaluate(async () => {
        const gaps = [], started = performance.now(), initialZoom = atlas.view.zoom;
        let last = started;
        const timer = setInterval(() => { const now = performance.now(); gaps.push(now - last); last = now; }, 16);
        // Each new request cancels a worker still calculating an older view.
        for (let i = 0; i < 5; i++) {
          document.querySelector('#zoom-in').click();
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        await atlas.whenIdle();
        clearInterval(timer);
        return { elapsedMs: performance.now() - started, maximumTimerGapMs: Math.max(...gaps), timerTicks: gaps.length, initialZoom, finalZoom: atlas.view.zoom, width: atlas.renderer.canvas.width };
      }), LIMITS.deep, 'CPU responsiveness');
      assert.ok(Math.abs(responsiveness.finalZoom - responsiveness.initialZoom - 5 * Math.log10(2)) < 1e-10);
      assert.equal(responsiveness.width, 960);
      assert.ok(responsiveness.timerTicks > 3);
      assert.ok(responsiveness.maximumTimerGapMs < 1000, JSON.stringify(responsiveness));
      pass('CPU palette caching, render cancellation, and responsive navigation', { responsiveness });
    }
    pass(`Automatic CPU fallback when ${unavailable} is unavailable`, { startupMs });
    await closeWithin(cpuContext, 'cpuContext');
  }

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  throw error;
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
````

**`tests/navigation.mjs`** (complete file):

````js
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('navigation');

await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const record = process.argv.includes('--record');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const report = [];
let server, browser;
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolve, reject) => {
      server.stdout.once('data', resolve); server.once('error', reject);
      server.once('exit', code => reject(new Error(`Preview server exited: ${code}`)));
    }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const backend of ['gpu', 'cpu']) {
    const page = boundContext(await within(browser.newPage({ viewport: { width: 1280, height: 720 } }), LIMITS.launch, 'newPage'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(kind => {
      if (kind === 'cpu') {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === 'webgl2' ? null : original.call(this, type, ...args);
        };
      }
      // Make the pending-frame interval observable on fast as well as slow machines.
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (...args) { setTimeout(() => post.apply(this, args), 100); };
    }, backend);
    await page.goto(url, { timeout: LIMITS.launch });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
    await idleWithin(page);
    const result = await within(page.evaluate(async () => {
      const canvas = document.querySelector('#fractal');
      const probe = document.createElement('canvas'); probe.width = 64; probe.height = 40;
      const context = probe.getContext('2d', { willReadFrequently: true });
      function sample() {
        context.drawImage(canvas, 0, 0, probe.width, probe.height);
        const rgba = context.getImageData(0, 0, probe.width, probe.height).data;
        let sum = 0;
        for (let i = 0; i < rgba.length; i += 4) sum += rgba[i] + rgba[i + 1] + rgba[i + 2];
        return sum / (probe.width * probe.height * 3);
      }
      const initialBrightness = sample(), initialRendered = atlas.rendered;
      const sizes = new Set(), brightness = [];
      let running = true;
      function observe() {
        if (!running) return;
        brightness.push(sample()); sizes.add(`${canvas.width}x${canvas.height}`);
        requestAnimationFrame(observe);
      }
      requestAnimationFrame(observe);
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -60, clientX: 640, clientY: 330, bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 700));
      await atlas.whenIdle();
      running = false;
      return { initialBrightness, minimumBrightness: Math.min(...brightness), frames: brightness.length, renderedPerWheel: atlas.rendered - initialRendered, sizes: [...sizes] };
    }), LIMITS.operation, 'wheel observation');
    report.push({ backend, ...result });
    console.log(backend, result);
    if (!record) {
      assert.ok(result.frames > 0, 'The observation must sample at least one animation frame');
      assert.equal(result.renderedPerWheel, 1, 'A wheel step should commit one image, without a second resolution change');
      assert.equal(result.sizes.length, 1, 'Navigation must keep the displayed pixel dimensions stable');
      assert.ok(result.minimumBrightness > result.initialBrightness * .5, 'The previous image must remain visible while the worker calculates');
      assert.deepEqual(errors, []);
      const burst = await within(page.evaluate(async () => {
        const surface = document.querySelector('#fractal-surface');
        const initial = atlas.view.zoom, count = atlas.rendered;
        for (let i = 0; i < 5; i++) {
          surface.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, clientX: 580, clientY: 360, bubbles: true, cancelable: true }));
          await new Promise(resolve => setTimeout(resolve, 15));
        }
        await atlas.whenIdle();
        return { zoom: atlas.view.zoom, expectedZoom: initial - 5 * 30 * .0015, commits: atlas.rendered - count, transform: document.querySelector('#fractal').style.transform };
      }), LIMITS.operation, 'wheel burst');
      assert.ok(Math.abs(burst.zoom - burst.expectedZoom) < 1e-10);
      assert.equal(burst.commits, 1, 'Only the latest requested view should be presented after a rapid wheel burst');
      assert.equal(burst.transform, '', 'The finished frame must replace the temporary preview');
      report.at(-1).burst = burst;
      // A translated/scaled canvas must not move the input surface: drag from an
      // exposed edge while the next image is pending, then release the pointer.
      await page.mouse.move(500, 360); await page.mouse.down();
      await page.mouse.move(560, 390, { steps: 3 });
      await page.mouse.up();
      await idleWithin(page);
      const afterDrag = await ev(page, () => ({ count: atlas.rendered, re: atlas.view.re, im: atlas.view.im }));
      await page.waitForTimeout(300);
      assert.equal(await ev(page, () => atlas.rendered), afterDrag.count, 'Pointer release must not trigger a second refinement render');
      assert.deepEqual(errors, []);
    }
    await page.screenshot({ path: `artifacts/navigation-${record ? 'before' : 'after'}-${backend}.png` });
    await closeWithin(page, 'page');
  }
} finally {
  await writeFile(`artifacts/navigation-${record ? 'before' : 'report'}.json`, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
````

**`tests/graphics.mjs`** (complete file):

````js
import './support/entry-guard.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { LIMITS, within, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('graphics');

await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const report = [];
let server;
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolve, reject) => {
      server.stdout.once('data', resolve); server.once('error', reject);
      server.once('exit', code => reject(new Error(`Preview server exited: ${code}`)));
    }), LIMITS.launch, 'preview server readiness');
  }
  for (const [name, args] of [
    ['hardware-vulkan', ['--enable-gpu', '--use-angle=vulkan', ...(process.argv.includes('--compositor') ? ['--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan'] : [])]],
  ]) {
    let browser;
    const entry = { name, browser: process.argv.includes('--chrome') ? 'installed Chrome' : 'Chromium headless shell', headed: process.argv.includes('--headed'), args, messages: [], errors: [] }; report.push(entry);
    try {
      browser = await chromium.launch({ ...(process.argv.includes('--chrome') ? { channel: 'chrome', chromiumSandbox: true } : {}), headless: !process.argv.includes('--headed'), timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', ...args] });
      const page = boundContext(await within(browser.newPage({ viewport: { width: 1280, height: 720 } }), LIMITS.launch, 'newPage'));
      page.on('console', message => {
        if (['error', 'warning', 'info'].includes(message.type())) entry.messages.push(message.text());
        if (message.type() === 'error' || message.text().includes('CONTEXT_LOST_WEBGL')) entry.errors.push(message.text());
      });
      page.on('pageerror', error => entry.errors.push(error.message));
      await page.goto(url, { timeout: LIMITS.launch });
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 30000 });
      entry.graphics = await within(page.evaluate(() => {
        const gl = atlas.renderer.gl;
        if (!gl) return { mode: atlas.renderer.mode, diagnostics: atlas.renderer.diagnostics };
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          mode: atlas.renderer.mode,
          renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
          vendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
          version: gl.getParameter(gl.VERSION), error: gl.getError(),
        };
      }), LIMITS.operation, 'graphics identity');
      assert.match(entry.graphics.mode, /^GPU/);
      assert.equal(entry.graphics.error, 0);
      entry.samples = await within(page.evaluate(async () => {
        const { GpuRenderer } = await import('/src/renderer.js');
        const { fixed, spanFixed, precisionFor, escapeTimeExact } = await import('/src/math.js');
        const renderer = new GpuRenderer(document.createElement('canvas'));
        const view = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4 };
        await renderer.render(view, { palette: 'ember', phase: .11, frequency: 1, relief: 1, iterations: 1500 }, 16, 12);
        const field = renderer.readField(), digits = precisionFor(view.zoom), span = spanFixed(view.zoom, digits);
        const result = [];
        for (const [x,y] of [[1,1],[5,2],[11,4],[2,8],[13,9],[6,10]]) {
          const re = fixed(view.re,digits) + span * BigInt(2*x+1-16) / 32n;
          const im = fixed(view.im,digits) + span * BigInt(2*y+1-12) / 32n;
          result.push({x,y,actual:field[(y*16+x)*4],expected:escapeTimeExact(re,im,digits,1500)});
        }
        renderer.destroy(); return result;
      }), LIMITS.deep, 'GPU samples');
      assert.equal(entry.samples.length, 6, 'all six GPU samples must be compared');
      for (const sample of entry.samples) assert.ok(Math.abs(sample.actual - sample.expected) < .5, JSON.stringify(sample));
      if (process.argv.includes('--benchmark')) entry.benchmarks = await within(page.evaluate(async () => {
        const { GpuRenderer, CpuRenderer } = await import('/src/renderer.js');
        const views = [
          { re: '-0.743735546648121901421502749766284274', im: '0.13180188244022899880486875943155304', zoom: 9.178000000000004 },
          { re: '-0.74373554655981392496378600769218837122', im: '0.13180188254868144746747814705787405605', zoom: 11.242000000000006 },
        ];
        const results = [];
        for (const Backend of [CpuRenderer, GpuRenderer]) {
          const renderer = new Backend(document.createElement('canvas'));
          try {
            for (const view of views) {
              const settings = { palette: 'ember', phase: .11, frequency: 1, relief: 1, iterations: 1024 + Math.max(0, Math.ceil((view.zoom - 3) * 32)) };
              const start = performance.now();
              await renderer.render(view, settings, 1280, 720);
              const field = renderer.gl ? renderer.readField() : renderer.data;
              const milliseconds = performance.now()-start;
              const values = Array.from({ length: field.length / 4 }, (_, index) => field[index * 4]);
              results.push({ backend: Backend.name, zoom: view.zoom, width: renderer.canvas.width, height: renderer.canvas.height, workers: renderer.diagnostics.workers, milliseconds, escaped: values.filter(x => x > 0).length, glError: renderer.gl?.getError() });
            }
          } finally { renderer.destroy(); }
        }
        return results;
      }), LIMITS.deep, 'benchmarks');
      if (process.argv.includes('--benchmark')) assert.equal(entry.benchmarks.length, 4, 'both backends must benchmark both views');
      for (const result of entry.benchmarks || []) {
        assert.equal(result.width, 1280); assert.equal(result.height, 720);
        assert.ok(result.escaped > 0);
        if (result.backend === 'GpuRenderer') assert.equal(result.glError, 0);
      }
      if (process.argv.includes('--benchmark')) {
        for (const [name, view] of [
          ['zoom-9', { re: '-0.743735546648121901421502749766284274', im: '0.13180188244022899880486875943155304', zoom: 9.178000000000004 }],
          ['zoom-11', { re: '-0.74373554655981392496378600769218837122', im: '0.13180188254868144746747814705787405605', zoom: 11.242000000000006 }],
        ]) {
          await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, view), LIMITS.deep, `benchmark view ${name}`);
          await page.screenshot({ path: `artifacts/hardware-${name}.png` });
        }
      }
      assert.deepEqual(entry.errors, []);
      await page.screenshot({ path: `artifacts/${name}.png` });
    } catch (error) { entry.error = error.message; process.exitCode = 1; }
    finally { await closeWithin(browser, 'browser'); }
    console.log(JSON.stringify({ ...entry, error: entry.error?.split('\n').slice(0, 3).join('\n') }, null, 2));
  }
} finally {
  await writeFile(process.env.ATLAS_GRAPHICS_REPORT || 'artifacts/graphics-report.json', JSON.stringify(report, null, 2));
  server?.kill('SIGTERM');
}
````

**`package.json`** (complete file):

````json
{
  "name": "atlas-mandelbrot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "An immersive arbitrary-precision Mandelbrot observatory",
  "scripts": {
    "dev": "node scripts/serve.mjs",
    "dev:gpu": "node scripts/gpu-preview.mjs",
    "start": "node scripts/serve.mjs",
    "build": "node scripts/build.mjs",
    "test": "node scripts/run-unit.mjs",
    "test:browser": "node scripts/run-unit.mjs && node tests/browser.mjs",
    "test:navigation": "node scripts/run-unit.mjs && node tests/navigation.mjs",
    "test:graphics": "node scripts/run-unit.mjs && node tests/graphics.mjs --chrome --headed --compositor --benchmark",
    "thumbnails": "node scripts/thumbnails.mjs",
    "gate": "node scripts/plane-gate.mjs"
  },
  "devDependencies": {
    "playwright": "1.59.1"
  }
}
````

- [ ] **Step 6: Run the unit tests to verify they pass**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"40 tests passed","files":3,…}` and exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/gate/lib.mjs scripts/gate/supervise.mjs scripts/run-unit.mjs scripts/plane-gate.mjs tests/support/no-launch.mjs tests/support/entry-guard.mjs tests/support/bounded.mjs tests/unit.manifest.json tests/suites.manifest.json tests/unit/gate.test.js tests/unit/no-launch.test.js tests/browser.mjs tests/navigation.mjs tests/graphics.mjs package.json
git commit -m "Add the fail-closed unit runner, launch guard, bounded browser suites and Plane gate"
```

- [ ] **Step 8: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 9: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T01: Move Plane without changing behaviour (spec §4.2 step 1)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** T00.

One commit moves the Plane-owned modules and updates only the references to them. No file body changes; palette functions are not split; `src/app.js` stays where it is.

**Files:**
- Move: `src/{math,perturbation,reference.worker,renderer,shaders,graphics,places,palettes}.js` → `src/plane/`; `src/icons.js`, `src/style.css` → `src/ui/`
- Modify (import paths only): `src/app.js`, `index.html`, `tests/math.test.js`, `tests/worker-harness.js`, `tests/browser.mjs`, `tests/graphics.mjs`, `scripts/thumbnails.mjs`

**Interfaces:**
- Consumes: T00 (the gate).
- Produces: the paths every later task imports: `src/plane/<module>.js`, `src/ui/icons.js`, `src/ui/style.css`. Module exports are unchanged.

**Design assertions:**
- Spec §4.2 step 1: the moved files are byte-identical and every other change is an import-path substitution (the verifier), and the full Plane gate passes on the commit.
- Excludes: splitting palettes, changing renderer behaviour, reorganizing function bodies.

- [ ] **Step 1: Save the verifier outside the checkout**

Save this file as `/mnt/ml_storage/scratch/atlas-1a/verify-plane-move.mjs` (scratch, never committed):

**`/mnt/ml_storage/scratch/atlas-1a/verify-plane-move.mjs`** (complete file):

````js
// Verifies that the staged move is path-only: every moved file is byte-identical,
// and every other changed line differs from its original only by the listed path substitutions.
import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const moves = { 'src/icons.js': 'src/ui/icons.js', 'src/style.css': 'src/ui/style.css' };
for (const name of ['math', 'perturbation', 'reference.worker', 'renderer', 'shaders', 'graphics', 'places', 'palettes']) moves[`src/${name}.js`] = `src/plane/${name}.js`;
const problems = [];
for (const [from, to] of Object.entries(moves)) {
  if (git('show', `HEAD:${from}`) !== git('show', `:${to}`)) problems.push(`${to} differs from ${from}`);
}
const substitutions = [
  [/'\.\/plane\/(renderer|math|palettes|places)\.js'/g, "'./$1.js'"], [/'\.\/ui\/icons\.js'/g, "'./icons.js'"],
  [/\/src\/ui\/style\.css/g, '/src/style.css'], [/'\.\.\/src\/plane\//g, "'../src/"], [/'\/src\/plane\//g, "'/src/"],
];
const edited = ['src/app.js', 'index.html', 'tests/math.test.js', 'tests/worker-harness.js', 'tests/browser.mjs', 'tests/graphics.mjs', 'scripts/thumbnails.mjs'];
for (const file of edited) {
  let after = git('show', `:${file}`);
  for (const [pattern, replacement] of substitutions) after = after.replace(pattern, replacement);
  if (after !== git('show', `HEAD:${file}`)) problems.push(`${file} has a change other than an import-path substitution`);
}
const staged = git('diff', '--cached', '--name-status', '-M100%').trim().split('\n');
const expected = Object.keys(moves).length + edited.length;
if (staged.length !== expected) problems.push(`expected ${expected} staged paths, found ${staged.length}: ${staged.join(' | ')}`);
console.log(problems.length ? `MOVE NOT PATH-ONLY\n${problems.join('\n')}` : `MOVE PATH-ONLY: ${Object.keys(moves).length} moved byte-identical, ${edited.length} files with import paths only`);
process.exitCode = problems.length ? 1 : 0;
````

- [ ] **Step 2: Move the files and substitute the paths**

**`/mnt/ml_storage/scratch/atlas-1a/move-plane.sh`** (complete file):

````bash
set -euo pipefail
mkdir -p src/plane src/ui
for name in math perturbation reference.worker renderer shaders graphics places palettes; do
  git mv "src/$name.js" "src/plane/$name.js"
done
git mv src/icons.js src/ui/icons.js
git mv src/style.css src/ui/style.css
sed -i -e "s#from './renderer.js'#from './plane/renderer.js'#" \
       -e "s#from './math.js'#from './plane/math.js'#" \
       -e "s#from './palettes.js'#from './plane/palettes.js'#" \
       -e "s#from './places.js'#from './plane/places.js'#" \
       -e "s#from './icons.js'#from './ui/icons.js'#" src/app.js
sed -i -e 's#href="/src/style.css"#href="/src/ui/style.css"#' index.html
sed -i -E "s#'\.\./src/(math|perturbation|palettes|graphics|places)\.js'#'../src/plane/\1.js'#" tests/math.test.js scripts/thumbnails.mjs
sed -i -e "s#'../src/reference.worker.js'#'../src/plane/reference.worker.js'#" tests/worker-harness.js
sed -i -E "s#'/src/(renderer|math|palettes)\.js'#'/src/plane/\1.js'#g" tests/browser.mjs tests/graphics.mjs
git add src/app.js index.html tests/math.test.js tests/worker-harness.js tests/browser.mjs tests/graphics.mjs scripts/thumbnails.mjs
````

Run:
```bash
bash /mnt/ml_storage/scratch/atlas-1a/move-plane.sh
```
Expected: no output, exit 0; `git status --short` shows ten renames and seven modified files, all staged.

- [ ] **Step 3: Verify the move is path-only**

Run:
```bash
node /mnt/ml_storage/scratch/atlas-1a/verify-plane-move.mjs
```
Expected: `MOVE PATH-ONLY: 10 moved byte-identical, 7 files with import paths only` and exit 0.

- [ ] **Step 4: Run the unit tests**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"40 tests passed","files":3,…}` and exit 0.

- [ ] **Step 5: Commit**

Run:
```bash
git commit -m "Move the Plane modules into src/plane and the shell assets into src/ui (path-only)"
```
Expected: one commit containing exactly the 17 staged paths.

- [ ] **Step 6: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 7: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T02: Update the repository instructions (charter §6 item 10)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** T01.

Its own commit, separate from the mechanical move (spec §4.2). `CLAUDE.md` is unchanged: the collaboration protocol section is not edited, so the two copies stay identical.

**Files:**
- Modify: `AGENTS.md`, `HANDOFF.md`, `README.md` (exact replacements below)

**Interfaces:**
- Consumes: T00, T01.
- Produces: documentation only.

**Design assertions:**
- Charter §6 item 10 and spec §4.2: AGENTS.md and HANDOFF.md updated when 1a starts, in a commit separate from the move; the collaboration protocol copies stay identical.

- [ ] **Step 1: Apply the replacements**

In `AGENTS.md`, replace exactly:

````text
When adding the first implementation, organize files around clear responsibilities. A suggested starting layout is:

- `src/`: application source, separating fractal calculations, rendering, and interaction.
- `tests/`: automated tests and small fixtures.
- `assets/`: palettes, images, and other static resources, when needed.
- `README.md`: setup instructions, controls, and supported workflows.
````

with:

````text
The layout follows the Project 1 spec (`docs/superpowers/specs/2026-10-19-project1-design.md` §4.1):

- `src/app.js`: the small composition root.
- `src/plane/`: the 2D Plane workspace (coordinates, perturbation, renderers, shaders, places, palettes).
- `src/shared/`: workspace-independent contracts (scenes, commands and histories, render requests and reports, discoveries, persistence). It never holds BigInt coordinates, perturbation or GPU handles.
- `src/ui/`: the shell (dialogs, notifications, icons, styles, the Discoveries control).
- `tests/`: unit tests (`tests/unit/`, listed in `tests/unit.manifest.json`), browser suites (`tests/*.mjs`, listed in `tests/suites.manifest.json`) and test support (`tests/support/`).
- `assets/`: images and other static resources.
- `README.md`: setup instructions, controls, and supported workflows.
````

In `AGENTS.md`, replace exactly:

````text
No build, test, or development commands exist yet. When selecting the toolchain, document exact installation, local-run, build, and test commands in `README.md` and update this section. Prefer a small, reproducible workflow over custom automation.
````

with:

````text
`README.md` and `package.json` hold the exact commands. In short: `npm run dev` serves the app; `npm test` runs the Node unit tests through `scripts/run-unit.mjs` (never a browser or GPU); `npm run build` copies the static app into `dist/`; `npm run gate` runs the Plane behaviour gate on a clean commit. The gate needs exactly one of `ATLAS_GPU_HANDOFF="<who, when>"` or `ATLAS_GPU_DEFERRED="<reason>"`, and exits 0 (passed), 2 (pending: GPU suites deferred) or 1 (failed); an owned process tree that cannot be confirmed stopped fails the run and stops further browser or GPU work. Scratch files go to `/mnt/ml_storage/scratch`, never `/tmp`.
````

In `AGENTS.md`, replace exactly:

````text
No testing framework or coverage target is configured. Add focused tests alongside numerical and interaction logic.
````

with:

````text
Unit tests use the Node built-in runner through `scripts/run-unit.mjs`; add every new unit test file to `tests/unit.manifest.json`. A RED run uses `--expect-fail "<test name>"` against an importable interface skeleton and passes only if that test fails on an assertion; it never launches a browser or GPU (`--expect-missing` is only the T00 bootstrap). Every wait in a browser suite is bounded (`tests/support/bounded.mjs`). Add focused tests alongside numerical and interaction logic.
````

In `HANDOFF.md`, replace exactly:

````text
- Git is not in use; do not initialize it.
````

with:

````text
- Git is in use since 2026-10-18; this supersedes the original instruction not to initialise it (charter §6 item 10).
````

In `HANDOFF.md`, replace exactly:

````text
# ATLAS session handoff
````

with:

````text
# ATLAS session handoff

## 2026-10-20 — Project 1a (Foundations) begins

- The Plane modules now live in `src/plane/`; `icons.js` and `style.css` in `src/ui/`. `src/app.js` remains the entry point. Paths below that name `src/<module>.js` refer to `src/plane/<module>.js` (or `src/ui/`).
- `npm test` runs the Node unit suite through `scripts/run-unit.mjs`. `npm run gate` runs the Plane behaviour gate (spec §16.3) and records each run in `artifacts/gates/`.
- Per charter amendment A1, earlier share links, `localStorage['atlas.discoveries']` bookmarks and version-1 location files are not carried forward; Project 1a replaces them with native scene formats.
- The plan is `docs/superpowers/plans/2026-10-20-project1a-foundations-plan.md`; the sections below describe the 2D explorer as of 2026-10-15.
````

In `README.md`, replace exactly:

````text
```sh
npm test                 # Independent numerical and actual worker tests
npm run build            # Copy the static application into dist/
npm run start -- --dist  # Serve the built application
```
````

with:

````text
```sh
npm test                 # Node unit tests (numerical, worker, contracts); never a browser or GPU
npm run build            # Copy the static application into dist/
npm run start -- --dist  # Serve the built application
ATLAS_GPU_DEFERRED="<reason>" npm run gate   # Plane gate without the GPU suites (exit 2 = pending)
ATLAS_GPU_HANDOFF="<who, when>" npm run gate # Full Plane gate (exit 0 = passed)
```

The gate runs only on a clean commit. It starts its own server on port 5190, runs the unit tests, the build and every browser suite under hard time limits, classifies each one (`passed`, `failed`, `deferred`, `not-run`, `incomplete`), and records the result in `artifacts/gates/`.
````

In `README.md`, replace exactly:

````text
| `src/math.js` | Adaptive coordinates, reference orbits, independent exact recurrence |
| `src/perturbation.js` | CPU perturbation and extended-range arithmetic |
| `src/reference.worker.js` | Reference calculation and CPU rendering off the main thread |
| `src/shaders.js` | Direct, perturbation, extended-range, and color shaders |
| `src/renderer.js` | GPU resources, render targets, CPU fallback |
| `src/graphics.js` | Renderer classification and graphics diagnostics |
| `src/app.js` | Navigation, controls, bookmarks, import/export, sharing |
| `src/style.css` | Responsive observatory interface |
| `src/places.js`, `src/palettes.js` | Curated locations and RGB palettes |
| `tests/` | Numerical, worker, and browser regression tests |
````

with:

````text
| `src/plane/math.js` | Adaptive coordinates, reference orbits, independent exact recurrence |
| `src/plane/perturbation.js` | CPU perturbation and extended-range arithmetic |
| `src/plane/reference.worker.js` | Reference calculation and CPU rendering off the main thread |
| `src/plane/shaders.js` | Direct, perturbation, extended-range, and color shaders |
| `src/plane/renderer.js` | GPU resources, render targets, CPU fallback |
| `src/plane/graphics.js` | Renderer classification and graphics diagnostics |
| `src/app.js` | Navigation, controls, bookmarks, import/export, sharing |
| `src/ui/style.css`, `src/ui/icons.js` | Responsive observatory interface |
| `src/plane/places.js`, `src/plane/palettes.js` | Curated locations and RGB palettes |
| `tests/` | Unit tests (`tests/unit/`, `tests/math.test.js`), browser suites (`tests/*.mjs`) and support |
````

Each anchor occurs exactly once; if one does not, stop and report it rather than editing around it.

- [ ] **Step 2: Check the protocol copies are still identical**

Run:
```bash
diff <(sed -n '/^## Claude–Codex Collaboration Protocol/,$p' AGENTS.md) <(sed -n '/^## Claude–Codex Collaboration Protocol/,$p' CLAUDE.md) && echo identical
```
Expected: `identical`.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md HANDOFF.md README.md
git commit -m "Update AGENTS, HANDOFF and README for Project 1a paths, commands and the gate"
```

- [ ] **Step 4: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 5: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T03: Native scenes (spec §5, §12, §14)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** T01.

**Files:**
- Create: `src/shared/scene.js` (envelope, canonical JSON, `fnv1a64`, codec registry)
- Create: `src/plane/scene-adapter.js` (the `plane-mandelbrot@1` codec, iteration policy, share links, scene files)
- Modify: `tests/unit.manifest.json`
- Test: `tests/unit/scene.test.js`, `tests/unit/plane-scene.test.js`

**Interfaces:**
- Consumes: `PALETTES` (`src/plane/palettes.js`), `INITIAL_VIEW` (`src/plane/math.js`).
- Produces (`src/shared/scene.js`): `APPLICATION_VERSION`, `DEFAULT_MAX_SCENE_BYTES = 2_000_000`, `SceneError {code, path}` (codes: `invalid-value`, `missing-field`, `unknown-field`, `unsupported-format`, `unsupported-version`, `unsupported-model`, `too-large`, `invalid-json`, `resource-limit`, plus the link codes below), `isPlainObject`, `canonicalJson(value) → string`, `utf8Bytes(text)`, `fnv1a64(text) → "fnv1a64:<16 hex>"`, `deepFreeze`, `requireObject(value, path, keys)`, `MODEL_FIELDS`, `createSceneCodec({modelCodecs, maxSceneBytes = DEFAULT_MAX_SCENE_BYTES}) → {maxSceneBytes, validate(input) → frozen Scene, parse(text), serialize(scene), fingerprint(scene) → {canonical, sceneHash}, equal(a, b)}`. A model codec is `{workspace, id, version, validateModel(input) → {conventions, parameters, camera, slices, iteration, tracing, appearance, sampling}}`.
- Produces (`src/plane/scene-adapter.js`): `PLANE_MODEL`, `PLANE_DEFAULTS`, `DETAIL_LEVELS`, `DECIMAL_BUDGET_DIGITS = 200_000`, `MAX_PLANE_ZOOM`, `planeIterations(detail, zoom)`, `checkDecimal(text, path)`, `preflightView(view)` (lexical and resource preflight, never materializes), `admitEnteredView(view, validate = validateView)` (preflight, then the coordinate-entry bounds), `planeModelCodec`, `sceneCodec`, `createPlaneScene({view, settings?, applicationVersion?})`, `PLANE_INITIAL_SCENE`, `toPlaneState(scene) → {view:{re, im, zoom}, settings:{palette, phase, frequency, relief, detail, iterations}}`, `planeDependencies(scene) → {geometry, appearance}` (canonical strings), `SHARE_PREFIX = "#scene="`, `encodeShareHash(scene)`, `decodeShareHash(hash) → {kind:"none"} | {kind:"scene", scene} | {kind:"unsupported", error}` (link codes `earlier-format`, `unrecognized-link`, `invalid-link`, `too-large`), `encodeSceneFile(scene)`, `decodeSceneFile(text)`.

**Design assertions:**
- Spec §5: frozen, whole-scene-validated scenes with a stable `sceneHash` over a canonical serialization; unknown versions reported, never guessed; invalid values reported, never clamped; no inheritance (`invalid values are reported, never clamped, and nothing is inherited`).
- Spec §5.2 and §4.3: exact coordinate strings, including panned coordinates outside the entry bounds (`pan outside the entry range round-trips as a native scene`); the `plane-detail-zoom-v1` policy.
- Resource admission: a lexical preflight bounds mantissa digits, required precision and the fixed-point scaling power to 200,000 digits each (so materialized values have at most 400,000 digits) before anything materializes them, on every entry path (`decimal expansion beyond the resource budget is classified without materializing it`, `coordinate entry rejects an oversized decimal before anything materializes it`).
- Spec §12 and §14: native share links and scene files only; earlier formats reported as unsupported.

- [ ] **Step 1: Write the failing tests**

**`tests/unit/scene.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, fnv1a64, createSceneCodec, SceneError, MAX_SCENE_BYTES, requireObject } from '../../src/shared/scene.js';

const toyCodec = {
  workspace: 'plane', id: 'toy', version: 1,
  validateModel(input) {
    const camera = requireObject(input.camera, 'camera', ['x']);
    if (typeof camera.x !== 'string') throw new SceneError('invalid-value', 'must be a string', 'camera.x');
    return { conventions: 'toy', parameters: {}, camera: { x: camera.x }, slices: [], iteration: {}, tracing: null, appearance: {}, sampling: {} };
  },
};
const codec = createSceneCodec({ modelCodecs: [toyCodec] });
const toy = (overrides = {}) => ({
  application: 'ATLAS', schema: 'atlas.scene', schemaVersion: 1, applicationVersion: 'test', workspace: 'plane',
  model: { id: 'toy', version: 1 }, conventions: 'toy', parameters: {}, camera: { x: '1' }, slices: [], iteration: {},
  tracing: null, appearance: {}, sampling: {}, provenance: { createdBy: 'atlas' }, ...overrides,
});

test('canonical JSON sorts keys, writes −0 as 0 and rejects non-finite numbers', () => {
  assert.equal(canonicalJson({ b: [1, { d: 2, c: -0 }], a: 'x' }), '{"a":"x","b":[1,{"c":0,"d":2}]}');
  assert.throws(() => canonicalJson({ a: NaN }), SceneError);
  assert.throws(() => canonicalJson({ a: Infinity }), SceneError);
  assert.throws(() => canonicalJson({ a: undefined }), SceneError);
  assert.throws(() => canonicalJson(new Date(0)), SceneError);
});

test('fnv1a64 matches independent known answers over UTF-8 bytes', () => {
  assert.equal(fnv1a64(''), 'fnv1a64:cbf29ce484222325');
  assert.equal(fnv1a64('a'), 'fnv1a64:af63dc4c8601ec8c');
  assert.equal(fnv1a64('foobar'), 'fnv1a64:85944171f73967e8');
  assert.equal(fnv1a64('é'), 'fnv1a64:0ac21707b7181e01');
  assert.equal(fnv1a64('∞ ATLAS'), 'fnv1a64:a6158a118c31f120');
});

test('validation returns a frozen defensive copy whose fingerprint ignores key order', () => {
  const input = toy();
  const scene = codec.validate(input);
  input.camera.x = 'changed';
  assert.equal(scene.camera.x, '1');
  assert.ok(Object.isFrozen(scene) && Object.isFrozen(scene.camera));
  const reordered = Object.fromEntries(Object.entries(toy()).reverse());
  assert.equal(codec.fingerprint(codec.validate(reordered)).sceneHash, codec.fingerprint(scene).sceneHash);
  assert.match(codec.fingerprint(scene).sceneHash, /^fnv1a64:[0-9a-f]{16}$/);
  assert.ok(codec.equal(scene, codec.parse(codec.serialize(scene))));
});

test('unknown, missing and unsupported envelope content is reported, never guessed', () => {
  const code = input => { try { codec.validate(input); return 'valid'; } catch (error) { return error.code; } };
  assert.equal(code(toy({ extra: 1 })), 'unknown-field');
  const missing = toy(); delete missing.sampling;
  assert.equal(code(missing), 'missing-field');
  assert.equal(code(toy({ schemaVersion: 2 })), 'unsupported-version');
  assert.equal(code(toy({ model: { id: 'toy', version: 2 } })), 'unsupported-model');
  assert.equal(code(toy({ schema: 'other' })), 'unsupported-format');
  assert.equal(code({ application: 'ATLAS', version: 1, view: {}, settings: {} }), 'unsupported-format');
  assert.equal(code(toy({ workspace: 'space' })), 'invalid-value');
  assert.equal(code(toy({ provenance: { createdBy: 'atlas', note: 'x' } })), 'unknown-field');
  assert.equal(code(toy({ provenance: { createdBy: 'atlas', bridgedFrom: toy({ provenance: { createdBy: 'atlas', bridgedFrom: toy() } }) } })), 'invalid-value');
  assert.equal(code(toy({ provenance: { createdBy: 'atlas', bridgedFrom: toy() } })), 'valid');
});

test('scene text is bounded before parsing and must be JSON', () => {
  assert.throws(() => codec.parse('x'.repeat(MAX_SCENE_BYTES + 1)), error => error.code === 'too-large');
  assert.throws(() => codec.parse('é'.repeat(MAX_SCENE_BYTES / 2 + 1)), error => error.code === 'too-large', 'the limit counts UTF-8 bytes');
  assert.throws(() => codec.parse('{'), error => error.code === 'invalid-json');
});
````

**`tests/unit/plane-scene.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { moveView, validateView, INITIAL_VIEW } from '../../src/plane/math.js';
import { MAX_SCENE_BYTES } from '../../src/shared/scene.js';
import {
  sceneCodec, createPlaneScene, toPlaneState, planeIterations, planeDependencies, PLANE_INITIAL_SCENE,
  encodeShareHash, decodeShareHash, encodeSceneFile, decodeSceneFile, DECIMAL_BUDGET_DIGITS, admitEnteredView,
} from '../../src/plane/scene-adapter.js';

const errorCode = fn => { try { fn(); return 'valid'; } catch (error) { return error.code; } };
const withScene = (scene, patch) => JSON.parse(JSON.stringify({ ...JSON.parse(sceneCodec.serialize(scene)), ...patch }));

test('a Plane scene preserves exact coordinate strings and derives iterations from the named policy', () => {
  const view = { re: '-0.743643887037158704752191506114774', im: '1.23456e-70', zoom: 15.5 };
  const scene = createPlaneScene({ view, settings: { palette: 'aurora', detail: 3 } });
  assert.equal(scene.camera.re, view.re);
  assert.equal(scene.camera.im, '1.23456e-70');
  const state = toPlaneState(sceneCodec.parse(sceneCodec.serialize(scene)));
  assert.deepEqual(state.view, view);
  assert.equal(state.settings.iterations, 4096 + 400);
  assert.equal(planeIterations(1, 3.85), 1024 + 28);
  assert.deepEqual(toPlaneState(PLANE_INITIAL_SCENE).view, { ...INITIAL_VIEW });
  assert.deepEqual(toPlaneState(PLANE_INITIAL_SCENE).settings, { palette: 'ember', phase: 0.11, frequency: 1, relief: 1, detail: 1, iterations: 1052 });
});

test('pan outside the entry range round-trips as a native scene', () => {
  const panned = moveView({ re: '0', im: '0', zoom: 0 }, 2, 0);
  assert.equal(panned.re, '6.8');
  assert.throws(() => validateView(panned), 'the coordinate-entry dialog keeps its bounds');
  const scene = createPlaneScene({ view: panned });
  assert.equal(sceneCodec.parse(sceneCodec.serialize(scene)).camera.re, '6.8');
});

test('decimal expansion beyond the resource budget is classified without materializing it', () => {
  const start = performance.now();
  for (const re of ['1e1000000000000', '1e-1000000000000', `0.${'1'.repeat(DECIMAL_BUDGET_DIGITS + 1)}`]) {
    assert.equal(errorCode(() => createPlaneScene({ view: { re, im: '0', zoom: 0 } })), 'resource-limit', re.slice(0, 20));
  }
  assert.equal(errorCode(() => createPlaneScene({ view: { re: '0', im: '0', zoom: 1e9 } })), 'resource-limit');
  assert.equal(errorCode(() => createPlaneScene({ view: { re: '1e200000', im: '0', zoom: 199964 } })), 'resource-limit', 'the combined precision and exponent expansion is bounded');
  assert.ok(performance.now() - start < 1000, 'the check must not expand powers of ten');
  assert.equal(errorCode(() => createPlaneScene({ view: { re: '-2', im: '0', zoom: 10000 } })), 'valid');
});

test('coordinate entry rejects an oversized decimal before anything materializes it', () => {
  let materialized = 0;
  const spy = view => { materialized++; return validateView(view); };
  for (const view of [{ re: '1e1000000000000', im: '0', zoom: 0 }, { re: '0', im: `1e-${'9'.repeat(12)}`, zoom: 0 }, { re: '0', im: '0', zoom: 1e9 }]) {
    assert.equal(errorCode(() => admitEnteredView(view, spy)), 'resource-limit');
  }
  assert.equal(materialized, 0, 'validateView was never reached');
  assert.deepEqual(admitEnteredView({ re: '-2', im: '0', zoom: 40 }, spy), { re: '-2', im: '0', zoom: 40 });
  assert.throws(() => admitEnteredView({ re: '5', im: '0', zoom: 1 }, spy), /coordinate/i, 'the entry dialog keeps its mathematical bounds after the preflight');
  assert.equal(materialized, 2);
});

test('invalid values are reported, never clamped, and nothing is inherited', () => {
  const base = PLANE_INITIAL_SCENE;
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { appearance: { ...base.appearance, phase: 1.5 } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { appearance: { ...base.appearance, palette: 'nope' } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { iteration: { policy: 'plane-detail-zoom-v1', detail: 2.5 } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { camera: { re: '0', im: '0', zoom: -0.7 } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { camera: { re: 'x', im: '0', zoom: 0 } }))), 'invalid-value');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { appearance: { palette: 'ember', phase: 0.1, frequency: 1 } }))), 'missing-field');
  assert.equal(errorCode(() => sceneCodec.validate(withScene(base, { tracing: { profile: 'surface-v1' } }))), 'invalid-value');
});

test('share links round-trip every digit; earlier, tampered and oversized links are unsupported', () => {
  const scene = createPlaneScene({ view: { re: '-2', im: '0', zoom: 40 }, settings: { palette: 'rose', phase: 0.25, frequency: 2, relief: 0, detail: 4 } });
  const hash = encodeShareHash(scene);
  assert.match(hash, /^#scene=[A-Za-z0-9_-]+$/);
  const decoded = decodeShareHash(hash);
  assert.equal(decoded.kind, 'scene');
  assert.ok(sceneCodec.equal(decoded.scene, scene));
  assert.deepEqual(decodeShareHash(''), { kind: 'none' });
  assert.equal(decodeShareHash('#re=-2&im=0&z=40&palette=ember').error.code, 'earlier-format');
  assert.equal(decodeShareHash('#somewhere').error.code, 'unrecognized-link');
  assert.equal(decodeShareHash(`${hash.slice(0, -4)}!!!!`).error.code, 'invalid-link');
  assert.equal(decodeShareHash(`${hash.slice(0, 12)}`).kind, 'unsupported');
  assert.equal(decodeShareHash(`#scene=${'A'.repeat(Math.ceil(MAX_SCENE_BYTES * 4 / 3) + 8)}`).error.code, 'too-large');
});

test('scene files round-trip; an earlier location file is rejected as an unsupported format', () => {
  const scene = createPlaneScene({ view: { re: '0.276', im: '0.008', zoom: 2.4 }, settings: { palette: 'ocean' } });
  const text = encodeSceneFile(scene);
  assert.equal(JSON.parse(text).schema, 'atlas.scene');
  assert.ok(sceneCodec.equal(decodeSceneFile(text), scene));
  const earlier = JSON.stringify({ application: 'ATLAS', version: 1, view: { re: '0', im: '0', zoom: 0 }, settings: {} });
  assert.equal(errorCode(() => decodeSceneFile(earlier)), 'unsupported-format');
  assert.equal(errorCode(() => decodeSceneFile('not json')), 'invalid-json');
});

test('geometry and appearance dependencies separate a palette edit from a camera edit', () => {
  const a = createPlaneScene({ view: INITIAL_VIEW });
  const palette = createPlaneScene({ view: INITIAL_VIEW, settings: { palette: 'aurora' } });
  const moved = createPlaneScene({ view: { ...INITIAL_VIEW, zoom: 4 } });
  assert.equal(planeDependencies(a).geometry, planeDependencies(palette).geometry);
  assert.notEqual(planeDependencies(a).appearance, planeDependencies(palette).appearance);
  assert.notEqual(planeDependencies(a).geometry, planeDependencies(moved).geometry);
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js"
  ]
}
````

- [ ] **Step 2: Write the interface skeletons**

Every exported name exists with its final shape, so the tests import cleanly and fail on behaviour, not on a missing module.

**`src/shared/scene.js`** (complete file — interface skeleton):

````js
// T03 interface skeleton: the exported names and shapes only. Replaced in full by the
// implementation step; it exists so the RED run fails on a named assertion, not an import.
const notImplemented = name => () => { throw new Error(`not implemented: ${name}`); };
export const APPLICATION = 'ATLAS';
export const SCENE_SCHEMA = 'atlas.scene';
export const SCENE_SCHEMA_VERSION = 1;
export const APPLICATION_VERSION = '1.0.0';
export const MAX_SCENE_BYTES = 2_000_000;
export const MODEL_FIELDS = Object.freeze([]);
export class SceneError extends Error {
  constructor(code, message, path = '') { super(message); this.name = 'SceneError'; this.code = code; this.path = path; }
}
export const isPlainObject = notImplemented('isPlainObject');
export const canonicalJson = notImplemented('canonicalJson');
export const utf8Bytes = notImplemented('utf8Bytes');
export const fnv1a64 = () => 'fnv1a64:0000000000000000';
export const deepFreeze = notImplemented('deepFreeze');
export const requireObject = notImplemented('requireObject');
export const createSceneCodec = () => ({ validate: notImplemented('validate'), parse: notImplemented('parse'), serialize: notImplemented('serialize'), fingerprint: notImplemented('fingerprint'), equal: notImplemented('equal') });
````

**`src/plane/scene-adapter.js`** (complete file — interface skeleton):

````js
// T03 interface skeleton (see src/shared/scene.js). Replaced in full by the implementation step.
import { createSceneCodec } from '../shared/scene.js';
const notImplemented = name => () => { throw new Error(`not implemented: ${name}`); };
export const PLANE_MODEL = Object.freeze({ id: 'plane-mandelbrot', version: 1 });
export const PLANE_CONVENTIONS = 'atlas-plane-v1';
export const PLANE_ITERATION_POLICY = 'plane-detail-zoom-v1';
export const DETAIL_LEVELS = Object.freeze([512, 1024, 2048, 4096, 8192, 16384]);
export const PLANE_DEFAULTS = Object.freeze({ palette: 'ember', phase: 0.11, frequency: 1, relief: 1, detail: 1 });
export const DECIMAL_BUDGET_DIGITS = 200_000;
export const MAX_PLANE_ZOOM = DECIMAL_BUDGET_DIGITS - 36;
export const SHARE_PREFIX = '#scene=';
export const planeIterations = notImplemented('planeIterations');
export const checkDecimal = notImplemented('checkDecimal');
export const preflightView = notImplemented('preflightView');
export const admitEnteredView = notImplemented('admitEnteredView');
export const planeModelCodec = Object.freeze({ workspace: 'plane', ...PLANE_MODEL, validateModel: notImplemented('validateModel') });
export const sceneCodec = createSceneCodec({ modelCodecs: [planeModelCodec] });
export const createPlaneScene = notImplemented('createPlaneScene');
export const PLANE_INITIAL_SCENE = null;
export const toPlaneState = notImplemented('toPlaneState');
export const planeDependencies = notImplemented('planeDependencies');
export const encodeShareHash = notImplemented('encodeShareHash');
export const decodeShareHash = notImplemented('decodeShareHash');
export const encodeSceneFile = notImplemented('encodeSceneFile');
export const decodeSceneFile = notImplemented('decodeSceneFile');
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/scene.test.js tests/unit/plane-scene.test.js --expect-fail "fnv1a64 matches independent known answers over UTF-8 bytes"
```
Expected: `RED confirmed: "fnv1a64 matches independent known answers over UTF-8 bytes" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the implementation (replacing the skeletons)**

**`src/shared/scene.js`** (complete file):

````js
// Scene envelope, canonical serialization and fingerprints (spec §5).
// Workspace-independent: model-specific fields are validated by registered model codecs.
export const APPLICATION = 'ATLAS';
export const SCENE_SCHEMA = 'atlas.scene';
export const SCENE_SCHEMA_VERSION = 1;
export const APPLICATION_VERSION = '1.0.0';
export const MAX_SCENE_BYTES = 2_000_000;

const ENVELOPE_KEYS = ['application', 'schema', 'schemaVersion', 'applicationVersion', 'workspace', 'model', 'conventions', 'parameters', 'camera', 'slices', 'iteration', 'tracing', 'appearance', 'sampling', 'provenance'];
export const MODEL_FIELDS = Object.freeze(['conventions', 'parameters', 'camera', 'slices', 'iteration', 'tracing', 'appearance', 'sampling']);

export class SceneError extends Error {
  constructor(code, message, path = '') {
    super(path ? `${path}: ${message}` : message);
    this.name = 'SceneError';
    this.code = code;
    this.path = path;
  }
}

export const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// Deterministic JSON: object keys sorted by code unit, arrays in order, finite numbers only, −0 written as 0.
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SceneError('invalid-value', 'numbers must be finite');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => {
      if (value[key] === undefined) throw new SceneError('invalid-value', `undefined value at ${key}`);
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    }).join(',')}}`;
  }
  throw new SceneError('invalid-value', `cannot serialize a ${typeof value}`);
}

export const utf8Bytes = text => new TextEncoder().encode(text);

// FNV-1a over the UTF-8 bytes, modulo 2^64. An identifier, not authentication.
export function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of utf8Bytes(text)) hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export function requireObject(value, path, keys) {
  if (!isPlainObject(value)) throw new SceneError('invalid-value', 'must be an object', path);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new SceneError('unknown-field', `unknown field ${key}`, path);
  for (const key of keys) if (!(key in value)) throw new SceneError('missing-field', `missing field ${key}`, path);
  return value;
}

export function createSceneCodec({ modelCodecs }) {
  const registry = new Map(modelCodecs.map(codec => [`${codec.id}@${codec.version}`, codec]));

  function validate(input, depth = 0) {
    if (!isPlainObject(input)) throw new SceneError('invalid-value', 'a scene must be an object');
    if (input.application !== APPLICATION || input.schema !== SCENE_SCHEMA) throw new SceneError('unsupported-format', 'not an ATLAS scene');
    if (input.schemaVersion !== SCENE_SCHEMA_VERSION) throw new SceneError('unsupported-version', `scene schema version ${JSON.stringify(input.schemaVersion)} is not supported`, 'schemaVersion');
    requireObject(input, '', ENVELOPE_KEYS);
    if (typeof input.applicationVersion !== 'string' || !input.applicationVersion || input.applicationVersion.length > 64) throw new SceneError('invalid-value', 'must be a short string', 'applicationVersion');
    const model = requireObject(input.model, 'model', ['id', 'version']);
    const codec = registry.get(`${model.id}@${model.version}`);
    if (!codec) throw new SceneError('unsupported-model', `model ${JSON.stringify(model.id)}@${JSON.stringify(model.version)} is not supported`, 'model');
    if (input.workspace !== codec.workspace) throw new SceneError('invalid-value', `must be ${codec.workspace}`, 'workspace');
    const provenanceIn = input.provenance;
    if (!isPlainObject(provenanceIn)) throw new SceneError('invalid-value', 'must be an object', 'provenance');
    for (const key of Object.keys(provenanceIn)) if (key !== 'createdBy' && key !== 'bridgedFrom') throw new SceneError('unknown-field', `unknown field ${key}`, 'provenance');
    if (provenanceIn.createdBy !== 'atlas') throw new SceneError('invalid-value', 'must be "atlas"', 'provenance.createdBy');
    const provenance = { createdBy: 'atlas' };
    if ('bridgedFrom' in provenanceIn) {
      if (depth > 0) throw new SceneError('invalid-value', 'a bridged scene cannot itself be bridged', 'provenance.bridgedFrom');
      provenance.bridgedFrom = validate(provenanceIn.bridgedFrom, depth + 1);
    }
    const fields = codec.validateModel(input);
    for (const key of MODEL_FIELDS) if (!(key in fields)) throw new SceneError('invalid-value', `model codec omitted ${key}`);
    const scene = {
      application: APPLICATION, schema: SCENE_SCHEMA, schemaVersion: SCENE_SCHEMA_VERSION,
      applicationVersion: input.applicationVersion, workspace: codec.workspace,
      model: { id: codec.id, version: codec.version }, ...fields, provenance,
    };
    canonicalJson(scene);
    return deepFreeze(scene);
  }

  const serialize = scene => canonicalJson(scene);

  function parse(text) {
    if (typeof text !== 'string') throw new SceneError('invalid-value', 'scene text must be a string');
    if (utf8Bytes(text).length > MAX_SCENE_BYTES) throw new SceneError('too-large', `scene text exceeds ${MAX_SCENE_BYTES} bytes`);
    let data;
    try { data = JSON.parse(text); } catch { throw new SceneError('invalid-json', 'scene text is not valid JSON'); }
    return validate(data);
  }

  function fingerprint(scene) {
    const canonical = serialize(scene);
    return { canonical, sceneHash: fnv1a64(canonical) };
  }

  return Object.freeze({ validate: input => validate(input), parse, serialize, fingerprint, equal: (a, b) => serialize(a) === serialize(b) });
}
````

**`src/plane/scene-adapter.js`** (complete file):

````js
// Plane ↔ scene (spec §5.2, §12, §14): the plane-mandelbrot@1 model codec, the
// detail/zoom iteration policy, native share links and native scene files.
import { PALETTES } from './palettes.js';
import { INITIAL_VIEW, validateView } from './math.js';
import { createSceneCodec, canonicalJson, SceneError, requireObject, utf8Bytes, MAX_SCENE_BYTES, APPLICATION_VERSION } from '../shared/scene.js';

export const PLANE_MODEL = Object.freeze({ id: 'plane-mandelbrot', version: 1 });
export const PLANE_CONVENTIONS = 'atlas-plane-v1';
export const PLANE_ITERATION_POLICY = 'plane-detail-zoom-v1';
export const DETAIL_LEVELS = Object.freeze([512, 1024, 2048, 4096, 8192, 16384]);
export const PLANE_DEFAULTS = Object.freeze({ palette: 'ember', phase: 0.11, frequency: 1, relief: 1, detail: 1 });
// Resource budget for exact decimal coordinates, checked lexically, before anything is
// materialized: the mantissa has at most this many digits, the required precision
// (precisionFor(zoom) = ceil(zoom) + 36) is at most this many digits, and the fixed-point
// scaling power |precision + exponent − fraction digits| is at most this many digits. So every
// fixed-point value math.js materializes has at most 2 × 200,000 decimal digits.
export const DECIMAL_BUDGET_DIGITS = 200_000;
export const MAX_PLANE_ZOOM = DECIMAL_BUDGET_DIGITS - 36;
const MIN_PLANE_ZOOM = -0.6;
const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?)(\d+))?$/i;

export function planeIterations(detail, zoom) {
  return DETAIL_LEVELS[detail] + Math.max(0, Math.ceil((zoom - 3) * 32));
}

// Lexical parts of a decimal string; never converts it to a number or BigInt.
function decimalParts(text, path) {
  if (typeof text !== 'string') throw new SceneError('invalid-value', 'must be a decimal string', path);
  const match = text.match(DECIMAL);
  if (!match || !(match[2] || match[3])) throw new SceneError('invalid-value', 'must be a decimal string', path);
  const digits = match[2].length + (match[3] || '').length;
  if (digits > DECIMAL_BUDGET_DIGITS) throw new SceneError('resource-limit', `has ${digits} digits; the budget is ${DECIMAL_BUDGET_DIGITS}`, path);
  const exponentDigits = (match[5] || '0').replace(/^0+(?=\d)/, '');
  if (exponentDigits.length > String(DECIMAL_BUDGET_DIGITS).length || Number(exponentDigits) > DECIMAL_BUDGET_DIGITS) throw new SceneError('resource-limit', `exponent exceeds the ${DECIMAL_BUDGET_DIGITS}-digit budget`, path);
  return { exponent: (match[4] === '-' ? -1 : 1) * Number(exponentDigits), fractionDigits: (match[3] || '').length };
}

export function checkDecimal(text, path) { decimalParts(text, path); return text; }

// The fixed-point scaling power math.js would use for this coordinate at this zoom.
function checkExpansion(text, zoom, path) {
  const { exponent, fractionDigits } = decimalParts(text, path);
  const power = Math.max(40, Math.ceil(zoom) + 36) + exponent - fractionDigits;
  if (Math.abs(power) > DECIMAL_BUDGET_DIGITS) throw new SceneError('resource-limit', `needs a ${Math.abs(power)}-digit fixed-point expansion; the budget is ${DECIMAL_BUDGET_DIGITS}`, path);
  return text;
}

// The pure lexical and resource preflight. Every entry path runs it before validateView, fixed
// or anything else that materializes fixed-point values. It never rewrites the text.
export function preflightView(input) {
  if (!input || typeof input !== 'object') throw new SceneError('invalid-value', 'a view must be an object');
  const zoom = input.zoom;
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) throw new SceneError('invalid-value', 'must be a finite number', 'zoom');
  if (zoom > MAX_PLANE_ZOOM) throw new SceneError('resource-limit', `zoom exceeds ${MAX_PLANE_ZOOM}, the limit of the decimal budget`, 'zoom');
  checkExpansion(input.re, zoom, 're');
  checkExpansion(input.im, zoom, 'im');
  return input;
}

// Coordinate entry and jumps: the preflight first, then the existing coordinate-entry bounds.
export function admitEnteredView(input, validate = validateView) {
  preflightView(input);
  return validate(input);
}

function checkRange(value, min, max, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new SceneError('invalid-value', `must be a number in [${min}, ${max}]`, path);
  return Object.is(value, -0) ? 0 : value;
}

function validateModel(input) {
  if (input.conventions !== PLANE_CONVENTIONS) throw new SceneError('invalid-value', `must be ${PLANE_CONVENTIONS}`, 'conventions');
  requireObject(input.parameters, 'parameters', []);
  if (!Array.isArray(input.slices) || input.slices.length) throw new SceneError('invalid-value', 'must be an empty list', 'slices');
  if (input.tracing !== null) throw new SceneError('invalid-value', 'must be null for Plane', 'tracing');
  const sampling = requireObject(input.sampling, 'sampling', ['seed', 'sequence', 'targetSamples']);
  if (sampling.seed !== 0 || sampling.sequence !== 'plane-single-v1' || sampling.targetSamples !== 1) throw new SceneError('invalid-value', 'must be { seed: 0, sequence: "plane-single-v1", targetSamples: 1 }', 'sampling');
  const camera = requireObject(input.camera, 'camera', ['re', 'im', 'zoom']);
  if (typeof camera.zoom === 'number' && camera.zoom > MAX_PLANE_ZOOM) throw new SceneError('resource-limit', `zoom exceeds ${MAX_PLANE_ZOOM}, the limit of the decimal budget`, 'camera.zoom');
  const zoom = checkRange(camera.zoom, MIN_PLANE_ZOOM, MAX_PLANE_ZOOM, 'camera.zoom');
  const iteration = requireObject(input.iteration, 'iteration', ['policy', 'detail']);
  if (iteration.policy !== PLANE_ITERATION_POLICY) throw new SceneError('invalid-value', `must be ${PLANE_ITERATION_POLICY}`, 'iteration.policy');
  if (!Number.isInteger(iteration.detail) || iteration.detail < 0 || iteration.detail > 5) throw new SceneError('invalid-value', 'must be an integer from 0 to 5', 'iteration.detail');
  const appearance = requireObject(input.appearance, 'appearance', ['palette', 'phase', 'frequency', 'relief']);
  if (!PALETTES.some(palette => palette.id === appearance.palette)) throw new SceneError('invalid-value', 'must name a registered palette', 'appearance.palette');
  return {
    conventions: PLANE_CONVENTIONS, parameters: {}, slices: [], tracing: null,
    sampling: { seed: 0, sequence: 'plane-single-v1', targetSamples: 1 },
    camera: { re: checkExpansion(camera.re, zoom, 'camera.re'), im: checkExpansion(camera.im, zoom, 'camera.im'), zoom },
    iteration: { policy: PLANE_ITERATION_POLICY, detail: iteration.detail },
    appearance: {
      palette: appearance.palette,
      phase: checkRange(appearance.phase, 0, 1, 'appearance.phase'),
      frequency: checkRange(appearance.frequency, 0.2, 2.5, 'appearance.frequency'),
      relief: checkRange(appearance.relief, 0, 1, 'appearance.relief'),
    },
  };
}

export const planeModelCodec = Object.freeze({ workspace: 'plane', ...PLANE_MODEL, validateModel });
export const sceneCodec = createSceneCodec({ modelCodecs: [planeModelCodec] });

// Native creation may use documented defaults; loading never does (sceneCodec.validate).
export function createPlaneScene({ view, settings = {}, applicationVersion = APPLICATION_VERSION }) {
  const merged = { ...PLANE_DEFAULTS, ...settings };
  return sceneCodec.validate({
    application: 'ATLAS', schema: 'atlas.scene', schemaVersion: 1, applicationVersion,
    workspace: 'plane', model: { ...PLANE_MODEL }, conventions: PLANE_CONVENTIONS,
    parameters: {}, camera: { re: view.re, im: view.im, zoom: view.zoom }, slices: [],
    iteration: { policy: PLANE_ITERATION_POLICY, detail: merged.detail }, tracing: null,
    appearance: { palette: merged.palette, phase: merged.phase, frequency: merged.frequency, relief: merged.relief },
    sampling: { seed: 0, sequence: 'plane-single-v1', targetSamples: 1 },
    provenance: { createdBy: 'atlas' },
  });
}

export const PLANE_INITIAL_SCENE = createPlaneScene({ view: INITIAL_VIEW });

// The renderer-facing state; iterations always come from the named policy.
export function toPlaneState(scene) {
  const { camera, appearance, iteration } = scene;
  return {
    view: { re: camera.re, im: camera.im, zoom: camera.zoom },
    settings: { ...appearance, detail: iteration.detail, iterations: planeIterations(iteration.detail, camera.zoom) },
  };
}

// Resolved pass inputs for render keys: geometry vs appearance (spec §7.2).
export function planeDependencies(scene) {
  return {
    geometry: canonicalJson({ model: scene.model, camera: scene.camera, iteration: scene.iteration }),
    appearance: canonicalJson(scene.appearance),
  };
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new SceneError('invalid-link', 'the link payload is not base64url');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export const SHARE_PREFIX = '#scene=';
const MAX_LINK_PAYLOAD = Math.ceil(MAX_SCENE_BYTES * 4 / 3) + 4;

export function encodeShareHash(scene) {
  return SHARE_PREFIX + base64UrlEncode(utf8Bytes(sceneCodec.serialize(scene)));
}

// → { kind: 'none' } | { kind: 'scene', scene } | { kind: 'unsupported', error: SceneError }
export function decodeShareHash(hash) {
  if (!hash || hash === '#') return { kind: 'none' };
  try {
    if (!hash.startsWith(SHARE_PREFIX)) {
      const earlier = new URLSearchParams(hash.slice(1)).has('re');
      throw new SceneError(earlier ? 'earlier-format' : 'unrecognized-link', earlier ? 'this link is from an earlier ATLAS format' : 'this link is not an ATLAS scene link');
    }
    const payload = hash.slice(SHARE_PREFIX.length);
    if (payload.length > MAX_LINK_PAYLOAD) throw new SceneError('too-large', 'the link is too large');
    const bytes = base64UrlDecode(payload);
    if (bytes.length > MAX_SCENE_BYTES) throw new SceneError('too-large', 'the link is too large');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new SceneError('invalid-link', 'the link payload is not UTF-8'); }
    return { kind: 'scene', scene: sceneCodec.parse(text) };
  } catch (error) {
    if (error instanceof SceneError) return { kind: 'unsupported', error };
    return { kind: 'unsupported', error: new SceneError('invalid-link', error.message) };
  }
}

export function encodeSceneFile(scene) {
  return `${JSON.stringify(JSON.parse(sceneCodec.serialize(scene)), null, 2)}\n`;
}

export function decodeSceneFile(text) {
  if (typeof text === 'string' && utf8Bytes(text).length <= MAX_SCENE_BYTES) {
    let data = null;
    try { data = JSON.parse(text); } catch { /* reported by sceneCodec.parse */ }
    if (data && data.application === 'ATLAS' && data.version === 1 && !('schema' in data)) throw new SceneError('unsupported-format', 'this location file is from an earlier ATLAS format');
  }
  return sceneCodec.parse(text);
}
````

- [ ] **Step 5: Run the unit tests**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"53 tests passed","files":5,…}` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/scene.js src/plane/scene-adapter.js tests/unit/scene.test.js tests/unit/plane-scene.test.js tests/unit.manifest.json
git commit -m "Add versioned native scenes, fingerprints, share links and scene files"
```

- [ ] **Step 7: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 8: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T04: Commands, undo history and camera history (spec §6, §19.1)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** T03.

**Files:**
- Create: `src/shared/commands.js`, `src/shared/history.js`
- Modify: `tests/unit.manifest.json`
- Test: `tests/unit/history.test.js`

**Interfaces:**
- Consumes: `sceneCodec`, `createPlaneScene` (T03), `SceneError`, `canonicalJson` (T03).
- Produces (`src/shared/commands.js`): `DOMAIN_FIELDS`, `DOMAINS` (`mathematics`, `tracing`, `appearance`, `camera`, `slice`), `WHOLE_SCENE`, `changedDomains(before, after)`, `withDomains(scene, source, domains)`, `COMMAND_TYPES` (`setCamera {camera}`, `setAppearance {patch}`, `setIteration {patch}`, `setParameters {parameters}`, `setTracing {tracing}`, `setSlices {slices}`, `restoreScene {scene}`), `reduceCommand(scene, command, codec) → {scene, ownedDomains, changed}` (errors `unknown-command`, `workspace-mismatch`, `command-domain-violation`).
- Produces (`src/shared/history.js`): `createHistory({initialScene, codec, undoLimit = 100, cameraLimit = 100}) → {snapshot(), begin({kind}) → id, update(id, command), commit(id), cancel(id), apply(commands, {kind}), undo(), redo(), back(), forward(), commitActive(), subscribe(listener) → unsubscribe}`. Transitions are frozen `{cause, before, after, changed, preview, render, revision, snapshot}`; `snapshot()` is `{scene, revision, canUndo, canRedo, canBack, canForward, undoDepth, redoDepth, camera:{index, length}, gesture}`. Undo, redo, back and forward return `null` when there is nothing to do. Listeners are for display state only; callers render from returned transitions.

**Design assertions:**
- Spec §6: commands own domains; invalidation is derived from before and after scenes; exact restoration; domain-scoped undo (`palette, navigate, undo palette preserves camera`); atomic `restoreScene`; 100-entry bounds; every undo, redo, back and forward is a new revision.
- User decision 2026-10-20 and spec §6: separate camera history, seeded with the initial camera, synchronized with whole-scene undo and redo (`restore, undo, back and forward`); tours record their start and final pose only.
- Excludes: deciding which UI events open which gestures (T05).

- [ ] **Step 1: Write the failing tests**

**`tests/unit/history.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../src/shared/history.js';
import { reduceCommand, changedDomains } from '../../src/shared/commands.js';
import { sceneCodec, createPlaneScene } from '../../src/plane/scene-adapter.js';

const A = { re: '-0.5', im: '0', zoom: 0 };
const B = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };
const C = { re: '0.276', im: '0.008', zoom: 2.4 };
const start = () => createHistory({ initialScene: createPlaneScene({ view: A }), codec: sceneCodec });
const cam = view => ({ type: 'setCamera', camera: view });
const palette = id => ({ type: 'setAppearance', patch: { palette: id } });

test('commands own their domains and changes are derived from the scenes', () => {
  const scene = createPlaneScene({ view: A });
  const result = reduceCommand(scene, palette('aurora'), sceneCodec);
  assert.deepEqual(result.changed, ['appearance']);
  assert.deepEqual(changedDomains(scene, reduceCommand(scene, { type: 'setIteration', patch: { detail: 3 } }, sceneCodec).scene), ['mathematics']);
  assert.throws(() => reduceCommand(scene, { type: 'paint' }, sceneCodec), error => error.code === 'unknown-command');
  assert.throws(() => reduceCommand(scene, palette('nope'), sceneCodec), error => error.code === 'invalid-value');
});

test('palette, navigate, undo palette preserves camera', () => {
  const history = start();
  history.apply([palette('aurora')]);
  history.apply([cam(B)], { kind: 'navigation' });
  const undone = history.undo();
  assert.equal(undone.after.appearance.palette, 'ember');
  assert.deepEqual(undone.after.camera, B);
  assert.deepEqual(undone.changed, ['appearance']);
  assert.equal(history.snapshot().camera.length, 2, 'content-only undo leaves camera history unchanged');
  assert.equal(history.redo().after.appearance.palette, 'aurora');
});

test('restore, undo, back and forward', () => {
  const history = start();
  const discovery = createPlaneScene({ view: B, settings: { palette: 'rose', detail: 3 } });
  history.apply([{ type: 'restoreScene', scene: discovery }], { kind: 'restore' });
  assert.equal(history.snapshot().scene.appearance.palette, 'rose');
  const undone = history.undo();
  assert.deepEqual(undone.after.camera, A);
  assert.equal(undone.after.appearance.palette, 'ember', 'whole-scene undo restores every domain');
  assert.deepEqual(history.snapshot().camera, { index: 2, length: 3 }, 'history reads A, B, A with the cursor on the last A');
  const back = history.back();
  assert.deepEqual(back.after.camera, B, 'Back restores B\'s camera');
  assert.equal(back.after.appearance.palette, 'ember', 'Back moves only the camera');
  assert.deepEqual(back.changed, ['camera']);
  assert.deepEqual(history.forward().after.camera, A);
  assert.equal(history.snapshot().camera.length, 3, 'Back and Forward record nothing');
  history.redo();
  assert.deepEqual(history.snapshot().scene.camera, B);
  assert.deepEqual(history.snapshot().camera, { index: 3, length: 4 }, 'whole-scene redo appends the restored pose');
});

test('a slider drag is one undo entry, its commit asks for no second render, and cancel restores', () => {
  const history = start();
  const id = history.begin({ kind: 'edit' });
  for (const phase of [0.2, 0.3, 0.4]) assert.equal(history.update(id, { type: 'setAppearance', patch: { phase } }).render, true);
  const committed = history.commit(id);
  assert.equal(committed.render, false);
  assert.equal(history.snapshot().undoDepth, 1);
  history.undo();
  assert.equal(history.snapshot().scene.appearance.phase, 0.11);
  const drag = history.begin({ kind: 'edit' });
  history.update(drag, { type: 'setAppearance', patch: { phase: 0.9 } });
  const cancelled = history.cancel(drag);
  assert.equal(cancelled.after.appearance.phase, 0.11);
  assert.equal(history.snapshot().undoDepth, 0);
  assert.throws(() => history.update(drag, { type: 'setAppearance', patch: { phase: 0.5 } }), error => error.code === 'stale-gesture');
});

test('a wheel burst is one camera-history entry and never an undo entry', () => {
  const history = start();
  history.apply([palette('aurora')]);
  history.undo();
  const id = history.begin({ kind: 'navigation' });
  for (const zoom of [0.1, 0.2, 0.3]) history.update(id, cam({ ...A, zoom }));
  history.commit(id);
  const snapshot = history.snapshot();
  assert.deepEqual(snapshot.camera, { index: 1, length: 2 });
  assert.equal(snapshot.undoDepth, 0);
  assert.equal(snapshot.redoDepth, 1, 'new camera navigation does not erase unrelated content redo');
});

test('undo during an active gesture commits the gesture first', () => {
  const history = start();
  history.apply([palette('aurora')]);
  const id = history.begin({ kind: 'navigation' });
  history.update(id, cam(B));
  const undone = history.undo();
  assert.equal(undone.after.appearance.palette, 'ember');
  assert.deepEqual(undone.after.camera, B, 'the in-progress camera move is kept');
  assert.equal(history.snapshot().camera.length, 2);
  assert.equal(history.snapshot().gesture, null);
});

test('a tour records its start and final pose and one content entry, never one per frame', () => {
  const history = start();
  const id = history.begin({ kind: 'tour' });
  for (let frame = 0; frame < 50; frame++) history.update(id, cam({ ...A, zoom: frame / 100 }));
  history.update(id, palette('ocean'));
  history.update(id, cam(C));
  history.commit(id);
  const snapshot = history.snapshot();
  assert.deepEqual(snapshot.camera, { index: 1, length: 2 });
  assert.equal(snapshot.undoDepth, 1);
  assert.deepEqual(history.back().after.camera, A);
});

test('both histories keep at most 100 entries and suppress consecutive identical poses', () => {
  const history = start();
  for (let i = 1; i <= 120; i++) history.apply([{ type: 'setAppearance', patch: { phase: i / 1000 } }]);
  for (let i = 1; i <= 120; i++) history.apply([cam({ ...A, zoom: i / 100 })], { kind: 'navigation' });
  history.apply([cam({ ...A, zoom: 1.2 })], { kind: 'navigation' });
  const snapshot = history.snapshot();
  assert.equal(snapshot.undoDepth, 100);
  assert.equal(snapshot.camera.length, 100);
  assert.equal(snapshot.camera.index, 99);
});

test('every undo, redo, back and forward receives a new revision', () => {
  const history = start();
  const revisions = [];
  history.subscribe(transition => revisions.push(transition.revision));
  history.apply([palette('aurora')]);
  history.apply([cam(B)], { kind: 'navigation' });
  const seen = [history.undo().revision, history.redo().revision, history.back().revision, history.forward().revision];
  assert.equal(new Set(seen).size, 4);
  for (let i = 1; i < revisions.length; i++) assert.ok(revisions[i] >= revisions[i - 1]);
  assert.equal(history.forward(), null, 'nothing beyond the last pose');
});

test('a failed command in an action leaves the scene and histories unchanged', () => {
  const history = start();
  const before = history.snapshot();
  assert.throws(() => history.apply([palette('aurora'), palette('nope')]), error => error.code === 'invalid-value');
  const after = history.snapshot();
  assert.ok(sceneCodec.equal(after.scene, before.scene));
  assert.equal(after.undoDepth, 0);
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js"
  ]
}
````

- [ ] **Step 2: Write the interface skeletons**

**`src/shared/commands.js`** (complete file — interface skeleton):

````js
// T04 interface skeleton. Replaced in full by the implementation step.
const notImplemented = name => () => { throw new Error(`not implemented: ${name}`); };
export const DOMAIN_FIELDS = Object.freeze({});
export const DOMAINS = Object.freeze([]);
export const WHOLE_SCENE = 'whole-scene';
export const COMMAND_TYPES = Object.freeze([]);
export const changedDomains = () => [];
export const withDomains = notImplemented('withDomains');
export const reduceCommand = scene => ({ scene, ownedDomains: [], changed: [] });
````

**`src/shared/history.js`** (complete file — interface skeleton):

````js
// T04 interface skeleton. Replaced in full by the implementation step.
export function createHistory() {
  const notImplemented = name => () => { throw new Error(`not implemented: ${name}`); };
  return Object.freeze({
    snapshot: notImplemented('snapshot'), begin: notImplemented('begin'), update: notImplemented('update'), commit: notImplemented('commit'),
    cancel: notImplemented('cancel'), apply: notImplemented('apply'), undo: notImplemented('undo'), redo: notImplemented('redo'),
    back: notImplemented('back'), forward: notImplemented('forward'), commitActive: notImplemented('commitActive'), subscribe: notImplemented('subscribe'),
  });
}
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/history.test.js --expect-fail "commands own their domains and changes are derived from the scenes"
```
Expected: `RED confirmed: "commands own their domains and changes are derived from the scenes" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the implementation (replacing the skeletons)**

**`src/shared/commands.js`** (complete file):

````js
// Scene commands (spec §6). Each command declares the domains it owns; the
// domains a change actually touched are derived from the before and after scenes,
// so a caller cannot label a mathematical change as appearance-only.
import { SceneError, canonicalJson } from './scene.js';

export const DOMAIN_FIELDS = Object.freeze({
  mathematics: Object.freeze(['model', 'conventions', 'parameters', 'iteration']),
  tracing: Object.freeze(['tracing', 'sampling']),
  appearance: Object.freeze(['appearance']),
  camera: Object.freeze(['camera']),
  slice: Object.freeze(['slices']),
});
export const DOMAINS = Object.freeze(Object.keys(DOMAIN_FIELDS));
export const WHOLE_SCENE = 'whole-scene';

export function changedDomains(before, after) {
  return DOMAINS.filter(domain => DOMAIN_FIELDS[domain].some(field => canonicalJson(before[field]) !== canonicalJson(after[field])));
}

// A plain copy of `scene` with the fields of `domains` taken from `source`.
export function withDomains(scene, source, domains) {
  const result = { ...scene };
  for (const domain of domains) for (const field of DOMAIN_FIELDS[domain]) result[field] = source[field];
  return result;
}

const COMMANDS = Object.freeze({
  setCamera: { owns: ['camera'], apply: (scene, command) => ({ ...scene, camera: command.camera }) },
  setAppearance: { owns: ['appearance'], apply: (scene, command) => ({ ...scene, appearance: { ...scene.appearance, ...command.patch } }) },
  setIteration: { owns: ['mathematics'], apply: (scene, command) => ({ ...scene, iteration: { ...scene.iteration, ...command.patch } }) },
  setParameters: { owns: ['mathematics'], apply: (scene, command) => ({ ...scene, parameters: command.parameters }) },
  setTracing: { owns: ['tracing'], apply: (scene, command) => ({ ...scene, tracing: command.tracing }) },
  setSlices: { owns: ['slice'], apply: (scene, command) => ({ ...scene, slices: command.slices }) },
  restoreScene: { owns: [WHOLE_SCENE], apply: (scene, command) => command.scene },
});
export const COMMAND_TYPES = Object.freeze(Object.keys(COMMANDS));

// → { scene, ownedDomains, changed }; the result is a validated, frozen scene.
export function reduceCommand(scene, command, codec) {
  const definition = COMMANDS[command?.type];
  if (!definition) throw new SceneError('unknown-command', `unknown command ${JSON.stringify(command?.type)}`);
  const next = codec.validate(definition.apply(scene, command));
  if (next.workspace !== scene.workspace) throw new SceneError('workspace-mismatch', `a ${scene.workspace} history cannot hold a ${next.workspace} scene`);
  const changed = changedDomains(scene, next);
  if (!definition.owns.includes(WHOLE_SCENE)) {
    const foreign = changed.filter(domain => !definition.owns.includes(domain));
    if (foreign.length) throw new SceneError('command-domain-violation', `${command.type} changed ${foreign.join(', ')}`);
  }
  return { scene: next, ownedDomains: definition.owns, changed };
}
````

**`src/shared/history.js`** (complete file):

````js
// Undo history and camera history for one workspace (spec §6, user decision 2026-10-20).
// Undo covers parameters, tracing, slices, appearance and whole-scene restorations;
// camera moves go to a separate back/forward history. The current camera-history entry
// always equals the committed camera.
import { reduceCommand, changedDomains, withDomains, WHOLE_SCENE } from './commands.js';
import { SceneError, canonicalJson } from './scene.js';

export function createHistory({ initialScene, codec, undoLimit = 100, cameraLimit = 100 }) {
  let scene = codec.validate(initialScene);
  let revision = 0, gestureCounter = 0, gesture = null;
  const undoStack = [], redoStack = [], listeners = new Set();
  const poses = [scene.camera];
  let poseIndex = 0;

  const snapshot = () => Object.freeze({
    scene, revision, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    canBack: poseIndex > 0, canForward: poseIndex < poses.length - 1,
    undoDepth: undoStack.length, redoDepth: redoStack.length,
    camera: Object.freeze({ index: poseIndex, length: poses.length }), gesture: gesture?.kind ?? null,
  });

  function emit(cause, before, { preview = false, render = true } = {}) {
    const changed = changedDomains(before, scene);
    if (before !== scene) revision++;
    const transition = Object.freeze({ cause, before, after: scene, changed: Object.freeze(changed), preview, render: render && before !== scene, revision, snapshot: snapshot() });
    for (const listener of listeners) listener(transition);
    return transition;
  }

  function recordCamera(camera) {
    if (canonicalJson(poses[poseIndex]) === canonicalJson(camera)) return;
    poses.splice(poseIndex + 1);
    poses.push(camera);
    if (poses.length > cameraLimit) poses.shift();
    poseIndex = poses.length - 1;
  }

  function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > undoLimit) undoStack.shift();
    redoStack.length = 0;
  }

  function settleGesture() {
    if (!gesture) return null;
    const { start, whole } = gesture;
    gesture = null;
    if (whole) {
      pushUndo({ kind: WHOLE_SCENE, before: start, after: scene });
      recordCamera(scene.camera);
    } else {
      const changed = changedDomains(start, scene);
      const content = changed.filter(domain => domain !== 'camera');
      if (content.length) pushUndo({ kind: 'domains', domains: content, before: start, after: scene });
      if (changed.includes('camera')) recordCamera(scene.camera);
    }
    // The last preview already showed this state: committing never asks for another render.
    return emit('commit', scene, { render: false });
  }

  function begin({ kind }) {
    settleGesture();
    gesture = { id: ++gestureCounter, kind, start: scene, whole: false };
    return gesture.id;
  }

  function requireGesture(id) {
    if (!gesture || gesture.id !== id) throw new SceneError('stale-gesture', `gesture ${id} is not active`);
  }

  function update(id, command) {
    requireGesture(id);
    const before = scene;
    const result = reduceCommand(scene, command, codec);
    if (result.ownedDomains.includes(WHOLE_SCENE)) gesture.whole = true;
    scene = result.scene;
    return emit('preview', before, { preview: true });
  }

  function commit(id) { requireGesture(id); return settleGesture(); }

  function cancel(id) {
    requireGesture(id);
    const before = scene;
    scene = gesture.start;
    gesture = null;
    return emit('cancel', before);
  }

  // One discrete action: several commands, one history group, one render.
  function apply(commands, { kind = 'edit' } = {}) {
    settleGesture();
    const start = scene;
    const id = begin({ kind });
    try { for (const command of commands) update(id, command); }
    catch (error) { const before = scene; scene = start; gesture = null; emit('cancel', before); throw error; }
    settleGesture();
    return Object.freeze({ cause: 'apply', before: start, after: scene, changed: Object.freeze(changedDomains(start, scene)), preview: false, render: start !== scene, revision, snapshot: snapshot() });
  }

  function step(from, to, cause, pick) {
    settleGesture();
    const entry = from.pop();
    if (!entry) return null;
    to.push(entry);
    const before = scene;
    const target = pick(entry);
    scene = entry.kind === WHOLE_SCENE ? target : codec.validate(withDomains(scene, target, entry.domains));
    if (entry.kind === WHOLE_SCENE) recordCamera(scene.camera);
    return emit(cause, before);
  }

  const undo = () => step(undoStack, redoStack, 'undo', entry => entry.before);
  const redo = () => step(redoStack, undoStack, 'redo', entry => entry.after);

  function moveCamera(offset, cause) {
    settleGesture();
    const index = poseIndex + offset;
    if (index < 0 || index >= poses.length) return null;
    poseIndex = index;
    const before = scene;
    scene = reduceCommand(scene, { type: 'setCamera', camera: poses[index] }, codec).scene;
    return emit(cause, before);
  }

  return Object.freeze({
    snapshot, begin, update, commit, cancel, apply, undo, redo,
    back: () => moveCamera(-1, 'back'), forward: () => moveCamera(1, 'forward'),
    commitActive: settleGesture,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
}
````

- [ ] **Step 5: Run the unit tests**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"63 tests passed","files":6,…}` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/commands.js src/shared/history.js tests/unit/history.test.js tests/unit.manifest.json
git commit -m "Add domain-owning commands, undo history and camera history"
```

- [ ] **Step 7: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 8: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T05: Checkpoint 1: every Plane edit through the history; native links and files

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** T04.

First of the three `src/app.js` versions. It follows the event-routing inventory above: `view` and `settings` become derived values, assigned only in `adoptScene()`, and rendering cadence is unchanged (`requestRender`/`flushRender` are untouched; `goTo` no longer requests a second render of its own). Gesture ownership lives in the Node-tested `src/plane/gestures.js`. The scene history variable is `sceneHistory`, so `history.replaceState` still reaches `window.history`. The application wiring's acceptance is in the browser (the workflow suite and the updated share and location checks), first run by the gate; that limitation is deliberate and visible.

**Files:**
- Create: `src/plane/gestures.js` (gesture ownership)
- Test: `tests/unit/gestures.test.js`
- Modify (whole files): `src/app.js`, `index.html` (Back, Forward, Undo, Redo buttons), `src/ui/icons.js` (four icons), `tests/browser.mjs` (the two format-dependent checks only), `tests/unit/no-launch.test.js` (adds `workflow.mjs`), `tests/suites.manifest.json`, `tests/unit.manifest.json`, `package.json`
- Create: `tests/workflow.mjs` (GREEN-only browser workflows)

**Interfaces:**
- Consumes: `createHistory` (T04); `sceneCodec`, `createPlaneScene`, `toPlaneState`, `PLANE_INITIAL_SCENE`, `encodeShareHash`, `decodeShareHash`, `encodeSceneFile`, `decodeSceneFile`, `admitEnteredView` (T03).
- Produces (`src/plane/gestures.js`): `DIRECT_KINDS` (`slider`, `navigation-drag`, `navigation-grouped`), `createGestureArbiter({history, onTransition(transition, interactive), stopAutomated(kind), groupQuietMs = 200, setTimer?, clearTimer?}) → {preview(kind, command, interactive), grouped(command, interactive), automate(kind, command, interactive) → boolean, animate(command), commit(kind?), settle(), apply(commands, kind, interactive), step(action, interactive) → transition | null, openKind}`.
- Produces: `window.atlas` additions used by browser tests: `scene` (the frozen scene), `history` (the snapshot without the scene), `undo()`, `redo()`, `back()`, `forward()`, `whenIdle({timeoutMs = 60000})` (rejects with `IdleTimeoutError`). Keys: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo, Alt+← back, Alt+→ forward. Buttons `#back-button`, `#forward-button`, `#undo-button`, `#redo-button`.

**Design assertions:**
- Spec §6 and §19.1: direct gestures stop automated motion first; automated motion never commits an unfinished direct gesture; the palette animation joins the open gesture (`a slider drag during a tour stays one undo entry`, `cycling during a slider drag stays one entry`, `automated motion never commits an unfinished direct gesture`).
- Spec §4.3: one committed frame per wheel step, no second render on release, unchanged cadence (existing navigation suite); `goTo` requests no extra render.
- Spec §13.1, §14: fresh start opens Plane; invalid links at startup open fresh-start Plane with a notice, during an investigation they change nothing; oversized coordinate entry is rejected before expansion (workflow suite).
- Spec §4.3 assertion rule: only the two format-dependent checks in `tests/browser.mjs` change, to native-format checks of equal or greater strength.

- [ ] **Step 1: Write the failing gesture tests**

**`tests/unit/gestures.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGestureArbiter } from '../../src/plane/gestures.js';
import { createHistory } from '../../src/shared/history.js';
import { sceneCodec, createPlaneScene } from '../../src/plane/scene-adapter.js';

const A = { re: '-0.5', im: '0', zoom: 0 };
const phase = value => ({ type: 'setAppearance', patch: { phase: value } });
const camera = zoom => ({ type: 'setCamera', camera: { ...A, zoom } });

function setup() {
  const history = createHistory({ initialScene: createPlaneScene({ view: A }), codec: sceneCodec });
  const transitions = [], timers = [];
  const state = { tour: false };
  const arbiter = createGestureArbiter({
    history, onTransition: transition => transitions.push(transition),
    stopAutomated: () => { if (state.tour) { state.tour = false; arbiter.commit('tour'); } },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
  });
  const tourFrame = zoom => (state.tour ? arbiter.automate('tour', camera(zoom), true) : false);
  return { history, arbiter, transitions, timers, state, tourFrame };
}

test('a slider drag during a tour stays one undo entry', () => {
  const { history, arbiter, state, tourFrame } = setup();
  state.tour = true;
  tourFrame(0.1); tourFrame(0.2);
  for (const [index, value] of [0.3, 0.4, 0.5].entries()) {
    arbiter.preview('slider', phase(value));
    assert.equal(tourFrame(0.3 + index / 10), false, 'the tour stopped before the slider\'s first preview');
  }
  arbiter.commit('slider');
  const snapshot = history.snapshot();
  assert.equal(snapshot.undoDepth, 1, 'one slider entry; the tour moved only the camera');
  assert.deepEqual(snapshot.camera, { index: 1, length: 2 }, 'one camera entry for the tour');
  history.undo();
  assert.equal(history.snapshot().scene.appearance.phase, 0.11, 'undo removes the whole drag');
});

test('cycling during a slider drag stays one entry', () => {
  const { history, arbiter } = setup();
  arbiter.preview('slider', phase(0.3));
  for (let frame = 0; frame < 20; frame++) arbiter.animate({ type: 'setAppearance', patch: { frequency: 1 + frame / 100 } });
  arbiter.preview('slider', phase(0.4));
  assert.equal(arbiter.openKind, 'slider', 'the animation joined the drag instead of committing it');
  arbiter.commit('slider');
  assert.equal(history.snapshot().undoDepth, 1);
});

test('automated motion never commits an unfinished direct gesture', () => {
  const { history, arbiter } = setup();
  arbiter.preview('navigation-drag', camera(0.5), true);
  assert.equal(arbiter.automate('tour', camera(0.9), true), false);
  assert.equal(arbiter.openKind, 'navigation-drag');
  assert.equal(history.snapshot().scene.camera.zoom, 0.5);
});

test('a wheel burst commits once after the quiet period, and Back settles an open drag first', () => {
  const { history, arbiter, timers } = setup();
  for (const zoom of [0.1, 0.2, 0.3]) arbiter.grouped(camera(zoom));
  assert.deepEqual(timers.map(timer => timer.ms), [200, 200, 200]);
  timers.at(-1).fn();
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 2 });
  arbiter.preview('navigation-drag', camera(0.8), true);
  const back = arbiter.step('back', true);
  assert.deepEqual(back.after.camera.zoom, 0.3, 'the drag was committed as a pose, then Back restored the previous one');
  assert.equal(arbiter.openKind, null);
  assert.deepEqual(history.snapshot().camera, { index: 1, length: 3 });
});

test('a discrete action settles the open gesture and renders from its transition', () => {
  const { history, arbiter, transitions } = setup();
  arbiter.preview('slider', phase(0.2));
  arbiter.apply([{ type: 'setAppearance', patch: { palette: 'aurora' } }], 'edit');
  assert.equal(history.snapshot().undoDepth, 2);
  assert.deepEqual(transitions.map(transition => transition.cause), ['preview', 'commit', 'apply']);
  assert.equal(arbiter.step('redo'), null, 'nothing to redo');
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js",
    "tests/unit/gestures.test.js"
  ]
}
````

- [ ] **Step 2: Write the interface skeleton**

**`src/plane/gestures.js`** (complete file — interface skeleton):

````js
// T05 interface skeleton. Replaced in full by the implementation step.
export const DIRECT_KINDS = Object.freeze(['slider', 'navigation-drag', 'navigation-grouped']);
export function createGestureArbiter() {
  const nothing = () => {};
  return Object.freeze({ preview: nothing, grouped: nothing, automate: () => false, animate: nothing, commit: nothing, settle: nothing, apply: nothing, step: () => null, openKind: null });
}
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/gestures.test.js --expect-fail "a slider drag during a tour stays one undo entry"
```
Expected: `RED confirmed: "a slider drag during a tour stays one undo entry" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the gesture arbiter (replacing the skeleton)**

**`src/plane/gestures.js`** (complete file):

````js
// Gesture ownership for one workspace's history (spec §6). Direct gestures (a slider drag, a
// pointer drag or pinch, a wheel burst or key-repeat run) and automated motion (the tour, the
// palette animation) have explicit owners:
// - a direct gesture stops automated motion before its first preview;
// - automated motion never begins while a direct gesture is open, so it cannot commit one;
// - the palette animation joins whichever gesture is open, otherwise it opens its own;
// - discrete actions and history steps settle the open gesture first.
export const DIRECT_KINDS = Object.freeze(['slider', 'navigation-drag', 'navigation-grouped']);

export function createGestureArbiter({ history, onTransition, stopAutomated = () => {}, groupQuietMs = 200, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let open = null, timer = null;
  const isOpen = () => open !== null && history.snapshot().gesture === open.kind;
  const begin = kind => { open = { id: history.begin({ kind }), kind }; return open.id; };
  const clearGroupTimer = () => { if (timer !== null) { clearTimer(timer); timer = null; } };

  function preview(kind, command, interactive = false) {
    if (DIRECT_KINDS.includes(kind)) stopAutomated(kind);
    if (!(isOpen() && open.kind === kind)) begin(kind);
    onTransition(history.update(open.id, command), interactive);
  }
  // A wheel step or repeated key: one gesture, committed after `groupQuietMs` without input.
  function grouped(command, interactive = true) {
    preview('navigation-grouped', command, interactive);
    clearGroupTimer();
    timer = setTimer(() => { timer = null; commit('navigation-grouped'); }, groupQuietMs);
  }
  // Automated motion (a tour frame). Returns false, and does nothing, while a direct gesture is open.
  function automate(kind, command, interactive = false) {
    if (isOpen() && DIRECT_KINDS.includes(open.kind)) return false;
    if (!(isOpen() && open.kind === kind)) begin(kind);
    onTransition(history.update(open.id, command), interactive);
    return true;
  }
  function animate(command) {
    if (!isOpen()) begin('animation');
    onTransition(history.update(open.id, command), false);
  }
  function commit(kind) {
    if (!open || (kind && open.kind !== kind)) return;
    if (open.kind === 'navigation-grouped') clearGroupTimer();
    if (isOpen()) onTransition(history.commit(open.id), false);
    open = null;
  }
  function settle() {
    clearGroupTimer();
    if (isOpen()) onTransition(history.commit(open.id), false);
    open = null;
  }
  function apply(commands, kind, interactive = false) {
    settle();
    onTransition(history.apply(commands, { kind }), interactive);
  }
  // undo, redo, back, forward → the transition, or null when there is nothing to do.
  function step(action, interactive = false) {
    settle();
    const transition = history[action]();
    if (transition) onTransition(transition, interactive);
    return transition;
  }
  return Object.freeze({ preview, grouped, automate, animate, commit, settle, apply, step, get openKind() { return isOpen() ? open.kind : null; } });
}
````

- [ ] **Step 5: Write the browser checks (they are not run until the gate)**

**`tests/workflow.mjs`** (complete file):

````js
// Project 1a workflows in a real browser (SwiftShader WebGL, headless): native scenes,
// undo and camera history, startup and invalid links. GREEN only: never part of a RED run.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('workflow');
await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const reportPath = 'artifacts/workflow-report.json';
const report = [], errors = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const INITIAL = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };
let server, browser;

async function open(context, hash = '') {
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${url}/${hash}`, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  return page;
}
const state = page => ev(page, () => ({ scene: atlas.scene, history: atlas.history, rendered: atlas.rendered }));

try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'pipe' });
    await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  const page = await open(context);

  const fresh = await state(page);
  assert.equal(fresh.scene.workspace, 'plane');
  assert.deepEqual(fresh.scene.camera, INITIAL);
  assert.equal(fresh.history.canBack, false);
  assert.equal(fresh.history.canUndo, false);
  pass('Fresh start opens Plane at the default view');

  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await idleWithin(page);
  const zoomed = await state(page);
  assert.equal(zoomed.scene.appearance.palette, 'aurora');
  await page.keyboard.press('Control+z');
  const undone = await state(page);
  assert.equal(undone.scene.appearance.palette, 'ember');
  assert.deepEqual(undone.scene.camera, zoomed.scene.camera, 'undoing the palette keeps the camera');
  assert.equal(undone.rendered, zoomed.rendered, 'an appearance undo recolors without recalculating');
  pass('Palette edit, navigation and undo keep the camera');

  const urlBefore = page.url();
  await ev(page, () => { window.__atlasPageMarker = 'still-here'; });
  await page.keyboard.press('Alt+ArrowLeft');
  await idleWithin(page);
  assert.equal(page.url(), urlBefore, 'Alt+Left must not navigate the browser');
  assert.equal(await ev(page, () => window.__atlasPageMarker), 'still-here', 'the page was not reloaded or replaced');
  const back = await state(page);
  assert.deepEqual(back.scene.camera, INITIAL);
  assert.equal(back.scene.appearance.palette, 'ember', 'Back moves only the camera');
  await page.keyboard.press('Alt+ArrowRight');
  await idleWithin(page);
  assert.deepEqual((await state(page)).scene.camera, zoomed.scene.camera);
  pass('Camera back and forward restore poses without touching content');

  const beforeEntry = await state(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('1e1000000000000'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('0');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  assert.match(await page.locator('#coordinate-error').textContent(), /budget/);
  assert.equal(await page.locator('#input-re').inputValue(), '1e1000000000000', 'the requested text is preserved');
  await page.keyboard.press('Escape');
  const afterEntry = await state(page);
  assert.deepEqual(afterEntry.scene, beforeEntry.scene);
  assert.deepEqual(afterEntry.history, beforeEntry.history, 'neither history changes');
  pass('An oversized coordinate is rejected before it is expanded');

  const beforeDrag = await state(page);
  await page.locator('#phase').scrollIntoViewIfNeeded();
  const slider = await page.locator('#phase').boundingBox();
  await page.mouse.move(slider.x + slider.width * 0.2, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterDrag = await state(page);
  assert.notEqual(afterDrag.scene.appearance.phase, beforeDrag.scene.appearance.phase);
  assert.equal(afterDrag.history.undoDepth, beforeDrag.history.undoDepth + 1, 'one drag is one undo entry');
  await ev(page, () => document.activeElement?.blur());
  await page.keyboard.press('Control+z');
  assert.equal((await state(page)).scene.appearance.phase, beforeDrag.scene.appearance.phase);
  pass('A slider drag is one undo entry');

  const beforeWheel = await state(page);
  await within(page.evaluate(async () => {
    const surface = document.querySelector('#fractal-surface');
    for (let i = 0; i < 5; i++) {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, clientX: 640, clientY: 360, bubbles: true, cancelable: true }));
      await new Promise(resolveStep => setTimeout(resolveStep, 15));
    }
    await new Promise(resolveQuiet => setTimeout(resolveQuiet, 400));
    await atlas.whenIdle();
  }), LIMITS.operation, 'wheel burst');
  const afterWheel = await state(page);
  assert.ok(afterWheel.scene.camera.zoom > beforeWheel.scene.camera.zoom);
  assert.equal(afterWheel.history.camera.length, beforeWheel.history.camera.index + 2, 'a wheel burst is one camera-history entry');
  assert.equal(afterWheel.history.undoDepth, beforeWheel.history.undoDepth, 'navigation never adds an undo entry');
  pass('A wheel burst is one camera-history entry');

  const before = await state(page);
  await ev(page, () => { location.hash = '#scene=@@@'; });
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('visible'), null, { timeout: LIMITS.operation });
  assert.match(await page.locator('#toast').textContent(), /unchanged/);
  const after = await state(page);
  assert.deepEqual(after.scene, before.scene);
  assert.deepEqual(after.history, before.history, 'neither history changes');
  pass('An invalid link during an investigation changes nothing');

  const earlier = await open(context, '#re=-2&im=0&z=40&palette=rose');
  assert.deepEqual((await state(earlier)).scene.camera, INITIAL);
  assert.match(await earlier.locator('#toast').textContent(), /earlier ATLAS format/);
  pass('An earlier-format link opens fresh-start Plane with a notice');

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
````

**`tests/browser.mjs`** (complete file):

````js
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('browser');

await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const hardware = process.argv.includes('--hardware');
const reportPath = `artifacts/${hardware ? 'hardware-' : ''}browser-report.json`;
let server, browser;
const report = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const errors = [];
function watchErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
}
async function idle(page) {
  // Let browser input/resize events reach the render queue before waiting on it.
  await page.waitForTimeout(400);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && document.body.dataset.rendering === 'false', null, { timeout: 60000 });
  await idleWithin(page);
}
async function checkLayout(page) {
  const problems = await ev(page, () => {
    const issues = [];
    for (const selector of ['.topbar', '.navigation', '.navigation-hint', '.panel', '.destinations']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < 0 || rect.right > innerWidth + 1 || rect.top < 0 || rect.bottom > innerHeight + 1) issues.push(`${selector} outside viewport`);
    }
    const panel = document.querySelector('.panel').getBoundingClientRect();
    for (const selector of ['.destination-tabs', '.navigation']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top) issues.push(`${selector} overlaps panel`);
    }
    return issues;
  });
  assert.deepEqual(problems, []);
}

// Runs inside the browser; the exact recurrence is independent of both renderers.
async function numericalProbe(backend) {
  const { GpuRenderer, CpuRenderer } = await import('/src/plane/renderer.js');
  const { fixed, spanFixed, precisionFor, escapeTimeExact } = await import('/src/plane/math.js');
  const { colorPixel, paletteBytes, PALETTES } = await import('/src/plane/palettes.js');
  const renderer = new (backend === 'gpu' ? GpuRenderer : CpuRenderer)(document.createElement('canvas'));
  const cases = [
    { re: '-.5', im: '.1', zoom: 0, iterations: 700 },
    { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4, iterations: 1500 },
    { re: '-0.743643887037151', im: '0.13182590420533', zoom: 15.5, iterations: 4500 },
    { re: '-0.743735546648121901421502749766284274', im: '0.13180188244022899880486875943155304', zoom: 9.178000000000004, iterations: 1222 },
    { re: '-0.74373554655981392496378600769218837122', im: '0.13180188254868144746747814705787405605', zoom: 11.242000000000006, iterations: 1288 },
    { re: '-2', im: '0', zoom: 1000, iterations: 2100 },
  ];
  const result = [];
  try {
    for (const view of cases) {
      const width = view.zoom === 9.178000000000004 ? 320 : 16, height = width === 320 ? 96 : 12;
      await renderer.render(view, { palette: 'ember', phase: .11, frequency: 1, relief: 1, iterations: view.iterations }, width, height);
      const field = backend === 'gpu' ? renderer.readField() : renderer.data;
      if (backend === 'cpu') {
        // Check the actual painted canvas, including rows from earlier worker tiles.
        const rgba = renderer.context.getImageData(0, 0, width, height).data;
        const palette = paletteBytes(PALETTES[0]);
        for (let index = 0; index < field.length; index += 4) {
          const expected = [...colorPixel(field[index], field[index + 1], palette, .11, 1, 1), 255];
          if (expected.some((channel, offset) => channel !== rgba[index + offset])) throw new Error(`CPU paint mismatch at ${index / 4}`);
        }
      }
      const digits = precisionFor(view.zoom), span = spanFixed(view.zoom, digits);
      const re = fixed(view.re, digits), im = fixed(view.im, digits);
      let maximumError = 0, mismatches = 0, samples = 0;
      const points = width === 320 ? [[1, 1], [65, 18], [130, 35], [180, 51], [240, 77], [315, 94]] : [[1, 1], [5, 2], [11, 4], [2, 8], [13, 9], [6, 10]];
      for (const [x, y] of points) {
        const cr = re + span * BigInt(2 * x + 1 - width) / BigInt(2 * width);
        const ci = im + span * BigInt(2 * y + 1 - height) / BigInt(2 * width);
        const row = backend === 'gpu' ? y : height - y - 1;
        const expected = escapeTimeExact(cr, ci, digits, view.iterations), actual = field[(row * width + x) * 4];
        if ((expected < 0) !== (actual < 0) || !Number.isFinite(actual)) mismatches++;
        if (expected >= 0 && actual >= 0) maximumError = Math.max(maximumError, Math.abs(expected - actual));
        samples++;
      }
      result.push({ zoom: view.zoom, maximumError, mismatches, samples });
    }
  } finally { renderer.destroy(); }
  return result;
}
function checkNumerical(results) {
  assert.equal(results.length, 6, 'all six numerical views must be sampled');
  for (const result of results) {
    assert.equal(result.samples, 6, JSON.stringify(result));
    assert.equal(result.mismatches, 0, JSON.stringify(result));
    assert.ok(result.maximumError < .5, JSON.stringify(result));
  }
}
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', ...(hardware ? ['--enable-gpu', '--use-angle=vulkan'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
  const context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  watchErrors(page);
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  assert.match(await page.title(), /ATLAS/);
  assert.match(await page.locator('#engine-status').textContent(), hardware ? /^GPU/ : /SOFTWARE WEBGL/);
  assert.equal(await ev(page, () => atlas.graphics.acceleration), hardware ? 'hardware' : 'software');
  await page.screenshot({ path: 'artifacts/atlas-desktop.png', animations: 'disabled' });
  await checkLayout(page);
  const graphics = await ev(page, () => {
    const gl = atlas.renderer.gl, info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) };
  });
  pass('Desktop WebGL startup and unobstructed controls', { graphics });

  await page.getByRole('button', { name: 'Show graphics details', exact: true }).click();
  assert.match(await page.locator('#graphics-device').textContent(), hardware ? /NVIDIA|AMD|Intel|Apple/i : /SwiftShader/);
  assert.match(await page.locator('#graphics-summary').textContent(), hardware ? /hardware graphics device/ : /software on the CPU/);
  await page.keyboard.press('Escape');
  pass('WebGL acceleration is labeled accurately and exposes its actual renderer');

  const before = await ev(page, () => ({ count: atlas.rendered, image: document.querySelector('canvas').toDataURL() }));
  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  const after = await ev(page, () => ({ count: atlas.rendered, image: document.querySelector('canvas').toDataURL() }));
  assert.equal(before.count, after.count); assert.notEqual(before.image, after.image);
  pass('Instant palette changes without recalculating the fractal');

  const oldView = await ev(page, () => atlas.view);
  await page.mouse.move(720, 440); await page.mouse.wheel(0, -120);
  await page.waitForTimeout(400); await idleWithin(page);
  assert.ok((await ev(page, () => atlas.view.zoom)) > oldView.zoom);
  await page.mouse.move(600, 420); await page.mouse.down(); await page.mouse.move(650, 450, { steps: 5 }); await page.mouse.up();
  await idle(page);
  assert.notEqual((await ev(page, () => atlas.view.re)), oldView.re);
  pass('Wheel zoom and pointer drag');

  await page.keyboard.press('b');
  await page.getByRole('button', { name: /Your discoveries/ }).click();
  await page.waitForFunction(() => document.querySelector('#saved-count').textContent === '1', null, { timeout: LIMITS.operation });
  assert.equal(await page.locator('.saved-wrapper').count(), 1);
  await page.reload({ timeout: LIMITS.launch }); await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.equal(await page.locator('#saved-count').textContent(), '1');
  pass('Bookmarks persist across reloads');

  await page.getByRole('button', { name: 'Cinema mode', exact: true }).click();
  assert.ok(await page.locator('body').evaluate(el => el.classList.contains('cinema')));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls and about', exact: true }).click();
  assert.ok(await page.locator('#help-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  pass('Cinema mode, keyboard shortcuts, and accessible help dialog');

  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('-2'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('40');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  await idleWithin(page, LIMITS.deep);
  assert.equal((await ev(page, () => atlas.view.zoom)), 40);
  assert.match(await page.locator('#engine-status').textContent(), /EXTENDED/);
  pass('Arbitrary coordinate navigation enters extended GPU mode');

  await page.getByRole('button', { name: /Share view/ }).click();
  assert.match(page.url(), /#scene=[A-Za-z0-9_-]+$/);
  const sharedScene = await ev(page, () => atlas.scene);
  const sharedPage = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage')); watchErrors(sharedPage); await sharedPage.goto(page.url(), { timeout: LIMITS.launch });
  await sharedPage.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.deepEqual(await ev(sharedPage, () => atlas.view), { re: '-2', im: '0', zoom: 40 });
  assert.deepEqual(await ev(sharedPage, () => atlas.scene), sharedScene, 'the generated link restores the complete scene');
  await closeWithin(sharedPage, 'sharedPage'); pass('Shared URL restores precision and settings');

  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.locator('#export-size').selectOption('current');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  const downloaded = await within(downloadPromise, LIMITS.deep, 'PNG download'); await within(downloaded.saveAs('artifacts/export-test.png'), LIMITS.operation, 'PNG save');
  assert.match(downloaded.suggestedFilename(), /\.png$/);
  const png = await readFile('artifacts/export-test.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
  pass('PNG export', { width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

  const locationDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save location (.json)', exact: true }).click();
  await within((await within(locationDownload, LIMITS.operation, 'location download')).saveAs('artifacts/export-test.json'), LIMITS.operation, 'location save');
  const savedLocation = JSON.parse(await readFile('artifacts/export-test.json', 'utf8'));
  assert.equal(savedLocation.schema, 'atlas.scene');
  assert.deepEqual(savedLocation.model, { id: 'plane-mandelbrot', version: 1 });
  assert.deepEqual(savedLocation.camera, await ev(page, () => atlas.view));
  assert.deepEqual(savedLocation, await ev(page, () => atlas.scene), 'the file holds the complete live scene');
  await page.keyboard.press('Escape');
  await within(page.evaluate(async () => { atlas.goTo({ re: '-.5', im: '0', zoom: 0 }); await atlas.whenIdle(); }), LIMITS.operation, 'move away before import');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.locator('#import-location').setInputFiles('artifacts/export-test.json');
  await idle(page);
  assert.deepEqual(await ev(page, () => atlas.view), savedLocation.camera);
  assert.deepEqual(await ev(page, () => atlas.scene), savedLocation, 'reimport restores the complete scene');
  assert.equal(await page.locator('#capture-dialog').evaluate(el => el.open), false);
  pass('JSON location export and import preserve exact coordinates');

  const numerical = await within(page.evaluate(numericalProbe, 'gpu'), LIMITS.deep, 'GPU numerical probe');
  checkNumerical(numerical);
  pass('GPU escape values agree with independent BigInt oracle', { numerical });

  await within(page.evaluate(async () => { atlas.goTo({ re: '-.743643887037151', im: '.13182590420533', zoom: 3.85 }); await atlas.whenIdle(); }), LIMITS.operation, 'return to Seahorse valley');
  await page.setViewportSize({ width: 1280, height: 720 });
  await idle(page);
  await checkLayout(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  assert.ok(await page.locator('#coordinate-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/atlas-laptop.png', animations: 'disabled' });
  pass('Laptop layout keeps exact-coordinate navigation accessible');

  const response = await within(page.evaluate(async () => {
    const start = performance.now(), initial = atlas.view.zoom;
    for (let i = 0; i < 6; i++) {
      document.querySelector('#zoom-in').click();
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    await atlas.whenIdle();
    atlas.renderer.gl.finish();
    return { elapsedMs: performance.now() - start, initial, final: atlas.view.zoom, width: atlas.renderer.canvas.width, height: atlas.renderer.canvas.height };
  }), LIMITS.deep, 'repeated GPU navigation');
  assert.ok(Math.abs(response.final - response.initial - 6 * Math.log10(2)) < 1e-10);
  assert.equal(response.width, 1280); assert.equal(response.height, 720);
  pass('Repeated GPU navigation reaches the latest view and full resolution', { response });
  await page.getByRole('button', { name: /Take a journey/ }).click();
  await page.waitForFunction(() => !document.querySelector('#tour-status').hidden && atlas.view.zoom > 3.85, null, { timeout: LIMITS.operation });
  await page.keyboard.press('+');
  assert.ok(await page.locator('#tour-status').evaluate(el => el.hidden));
  await idle(page);
  pass('Journey animates and manual navigation stops it');

  const mobileContext = boundContext(await within(browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }), LIMITS.launch, 'newContext'));
  const mobile = boundContext(await within(mobileContext.newPage(), LIMITS.launch, 'newPage')); watchErrors(mobile);
  await mobile.goto(url, { timeout: LIMITS.launch }); await idle(mobile);
  await mobile.screenshot({ path: 'artifacts/atlas-mobile.png', animations: 'disabled' });
  await checkLayout(mobile);
  assert.ok(await ev(mobile, () => document.documentElement.scrollWidth <= innerWidth));
  await mobile.getByRole('button', { name: 'Abyss palette', exact: true }).tap();
  assert.equal(await ev(mobile, () => atlas.settings.palette), 'ocean');
  await mobile.getByRole('button', { name: 'Explorer settings', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Go to', exact: true }).tap();
  assert.ok(await mobile.locator('#coordinate-dialog').evaluate(el => el.open));
  await mobile.locator('#coordinate-dialog').getByRole('button', { name: 'Close', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Explorer settings', exact: true }).tap();
  await idle(mobile);
  const touch = await mobileContext.newCDPSession(mobile);
  const touchEvent = (type, touchPoints) => touch.send('Input.dispatchTouchEvent', { type, touchPoints });
  const beforeTouch = await ev(mobile, () => atlas.view);
  await touchEvent('touchStart', [{ x: 100, y: 380, id: 1 }]);
  await touchEvent('touchMove', [{ x: 140, y: 400, id: 1 }]);
  await touchEvent('touchEnd', []);
  await idle(mobile);
  assert.notEqual(await ev(mobile, () => atlas.view.re), beforeTouch.re);
  const beforePinch = await ev(mobile, () => atlas.view.zoom);
  await touchEvent('touchStart', [{ x: 130, y: 380, id: 1 }, { x: 230, y: 380, id: 2 }]);
  await touchEvent('touchMove', [{ x: 100, y: 380, id: 1 }, { x: 260, y: 380, id: 2 }]);
  await touchEvent('touchEnd', []);
  await idle(mobile);
  assert.ok(Math.abs(await ev(mobile, () => atlas.view.zoom) - beforePinch - Math.log10(1.6)) < 1e-8);
  assert.equal(await ev(mobile, () => visualViewport.scale), 1);
  await touch.detach();
  pass('Mobile layout, settings, touch drag, and cursor-centered pinch zoom');
  await closeWithin(mobileContext, 'mobileContext');
  await closeWithin(context, 'context');

  // Exercise actual startup fallback, including a context that lacks float targets.
  for (const unavailable of ['webgl2', 'float-targets']) {
    const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 } }), LIMITS.launch, 'newContext'));
    await cpuContext.addInitScript(kind => {
      if (kind === 'webgl2') {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === 'webgl2' ? null : original.call(this, type, ...args);
        };
      } else {
        const original = WebGL2RenderingContext.prototype.getExtension;
        WebGL2RenderingContext.prototype.getExtension = function (name) {
          return name === 'EXT_color_buffer_float' ? null : original.call(this, name);
        };
      }
    }, unavailable);
    const cpu = boundContext(await within(cpuContext.newPage(), LIMITS.launch, 'newPage')); watchErrors(cpu);
    const started = performance.now();
    await cpu.goto(url, { timeout: LIMITS.launch }); await idle(cpu);
    const startupMs = performance.now() - started;
    assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
    await cpu.getByRole('button', { name: 'Controls and about', exact: true }).click();
    await cpu.getByRole('button', { name: 'Graphics details', exact: true }).click();
    assert.equal(await ev(cpu, () => atlas.graphics.acceleration), 'cpu');
    assert.match(await cpu.locator('#graphics-reason').textContent(), unavailable === 'webgl2' ? /WebGL 2 context creation failed/ : /EXT_color_buffer_float is missing/);
    await cpu.keyboard.press('Escape');
    assert.ok(await ev(cpu, () => atlas.renderer.data.some((value, index) => index % 4 === 0 && value > 0)));
    if (unavailable === 'webgl2') {
      await cpu.screenshot({ path: 'artifacts/atlas-cpu.png', animations: 'disabled' });
      const cpuNumerical = await within(cpu.evaluate(numericalProbe, 'cpu'), LIMITS.deep, 'CPU numerical probe');
      checkNumerical(cpuNumerical);
      pass('CPU worker escape values agree with independent BigInt oracle', { numerical: cpuNumerical });
      const cpuBefore = await ev(cpu, () => ({ count: atlas.rendered, image: atlas.renderer.canvas.toDataURL() }));
      await cpu.getByRole('button', { name: 'Aurora palette', exact: true }).click();
      const cpuAfter = await ev(cpu, () => ({ count: atlas.rendered, image: atlas.renderer.canvas.toDataURL() }));
      assert.equal(cpuBefore.count, cpuAfter.count); assert.notEqual(cpuBefore.image, cpuAfter.image);
      const responsiveness = await within(cpu.evaluate(async () => {
        const gaps = [], started = performance.now(), initialZoom = atlas.view.zoom;
        let last = started;
        const timer = setInterval(() => { const now = performance.now(); gaps.push(now - last); last = now; }, 16);
        // Each new request cancels a worker still calculating an older view.
        for (let i = 0; i < 5; i++) {
          document.querySelector('#zoom-in').click();
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        await atlas.whenIdle();
        clearInterval(timer);
        return { elapsedMs: performance.now() - started, maximumTimerGapMs: Math.max(...gaps), timerTicks: gaps.length, initialZoom, finalZoom: atlas.view.zoom, width: atlas.renderer.canvas.width };
      }), LIMITS.deep, 'CPU responsiveness');
      assert.ok(Math.abs(responsiveness.finalZoom - responsiveness.initialZoom - 5 * Math.log10(2)) < 1e-10);
      assert.equal(responsiveness.width, 960);
      assert.ok(responsiveness.timerTicks > 3);
      assert.ok(responsiveness.maximumTimerGapMs < 1000, JSON.stringify(responsiveness));
      pass('CPU palette caching, render cancellation, and responsive navigation', { responsiveness });
    }
    pass(`Automatic CPU fallback when ${unavailable} is unavailable`, { startupMs });
    await closeWithin(cpuContext, 'cpuContext');
  }

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  throw error;
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
````

**`tests/suites.manifest.json`** (complete file):

````json
{
  "build": {
    "requiredFiles": [
      "dist/index.html",
      "dist/src/app.js"
    ]
  },
  "suites": [
    {
      "id": "browser",
      "gpu": false,
      "command": [
        "tests/browser.mjs"
      ],
      "report": "artifacts/browser-report.json",
      "evidence": "browser",
      "requiredPasses": [
        "Desktop WebGL startup and unobstructed controls",
        "WebGL acceleration is labeled accurately and exposes its actual renderer",
        "Instant palette changes without recalculating the fractal",
        "Wheel zoom and pointer drag",
        "GPU escape values agree with independent BigInt oracle",
        "Laptop layout keeps exact-coordinate navigation accessible",
        "Repeated GPU navigation reaches the latest view and full resolution",
        "Bookmarks persist across reloads",
        "Cinema mode, keyboard shortcuts, and accessible help dialog",
        "Arbitrary coordinate navigation enters extended GPU mode",
        "Shared URL restores precision and settings",
        "PNG export",
        "JSON location export and import preserve exact coordinates",
        "Journey animates and manual navigation stops it",
        "Mobile layout, settings, touch drag, and cursor-centered pinch zoom",
        "CPU worker escape values agree with independent BigInt oracle",
        "CPU palette caching, render cancellation, and responsive navigation",
        "Automatic CPU fallback when webgl2 is unavailable",
        "Automatic CPU fallback when float-targets is unavailable",
        "No browser runtime errors"
      ]
    },
    {
      "id": "workflow",
      "gpu": false,
      "command": [
        "tests/workflow.mjs"
      ],
      "report": "artifacts/workflow-report.json",
      "evidence": "workflow",
      "requiredPasses": [
        "Fresh start opens Plane at the default view",
        "Palette edit, navigation and undo keep the camera",
        "Camera back and forward restore poses without touching content",
        "An oversized coordinate is rejected before it is expanded",
        "A slider drag is one undo entry",
        "A wheel burst is one camera-history entry",
        "An invalid link during an investigation changes nothing",
        "An earlier-format link opens fresh-start Plane with a notice",
        "No browser runtime errors"
      ]
    },
    {
      "id": "browser-hardware",
      "gpu": true,
      "command": [
        "tests/browser.mjs",
        "--hardware"
      ],
      "report": "artifacts/hardware-browser-report.json",
      "evidence": "browser",
      "requiredPasses": [
        "Desktop WebGL startup and unobstructed controls",
        "WebGL acceleration is labeled accurately and exposes its actual renderer",
        "Instant palette changes without recalculating the fractal",
        "Wheel zoom and pointer drag",
        "GPU escape values agree with independent BigInt oracle",
        "Laptop layout keeps exact-coordinate navigation accessible",
        "Repeated GPU navigation reaches the latest view and full resolution",
        "Bookmarks persist across reloads",
        "Cinema mode, keyboard shortcuts, and accessible help dialog",
        "Arbitrary coordinate navigation enters extended GPU mode",
        "Shared URL restores precision and settings",
        "PNG export",
        "JSON location export and import preserve exact coordinates",
        "Journey animates and manual navigation stops it",
        "Mobile layout, settings, touch drag, and cursor-centered pinch zoom",
        "CPU worker escape values agree with independent BigInt oracle",
        "CPU palette caching, render cancellation, and responsive navigation",
        "Automatic CPU fallback when webgl2 is unavailable",
        "Automatic CPU fallback when float-targets is unavailable",
        "No browser runtime errors"
      ]
    },
    {
      "id": "navigation",
      "gpu": false,
      "command": [
        "tests/navigation.mjs"
      ],
      "report": "artifacts/navigation-report.json",
      "evidence": "navigation"
    },
    {
      "id": "graphics",
      "gpu": true,
      "benchmark": true,
      "command": [
        "tests/graphics.mjs",
        "--chrome",
        "--headed",
        "--compositor",
        "--benchmark"
      ],
      "report": "artifacts/graphics-report.json",
      "evidence": "graphics"
    }
  ]
}
````

**`tests/unit/no-launch.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import { spawn, execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { DENIED_METHODS, LaunchDeniedError, unitGuardActive } from '../support/no-launch.mjs';
import { within, BoundedWaitTimeout, closeWithin, installSuiteDeadline, cleanupState } from '../support/bounded.mjs';

test('the launch guard is active inside unit-test processes', () => {
  assert.equal(unitGuardActive, true, 'run unit tests through scripts/run-unit.mjs');
  assert.equal(process.env.ATLAS_UNIT_MODE, '1');
});

test('every child_process launcher throws before any side effect', () => {
  for (const method of DENIED_METHODS) {
    assert.throws(() => childProcess[method]('node', ['-e', '']), error => error instanceof LaunchDeniedError && error.method === method, method);
  }
  assert.throws(() => spawn('node'), LaunchDeniedError, 'named ESM binding');
  assert.throws(() => execFileSync('node'), LaunchDeniedError, 'named ESM binding');
});

test('worker threads remain available to unit tests', async () => {
  const worker = new Worker('require("node:worker_threads").parentPort.postMessage(21 * 2)', { eval: true });
  try {
    const value = await within(new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); }), 5000, 'worker');
    assert.equal(value, 42);
  } finally { await worker.terminate(); }
});

test('browser suites refuse to start under a unit run', async () => {
  for (const suite of ['../browser.mjs', '../navigation.mjs', '../graphics.mjs', '../workflow.mjs']) {
    await assert.rejects(import(suite), error => error.name === 'UnitModeRefusal', suite);
  }
});

test('bounded waits resolve in time and time out with a classified error', async () => {
  assert.equal(await within(Promise.resolve(7), 50, 'fast'), 7);
  await assert.rejects(within(new Promise(() => {}), 20, 'stuck'), error => error instanceof BoundedWaitTimeout && error.code === 'ATLAS_WAIT_TIMEOUT' && error.label === 'stuck');
  assert.throws(() => within(Promise.resolve(), Infinity, 'unbounded'), RangeError);
});

test('an unconfirmed browser close is terminal and survives a later deadline', async () => {
  class Stopped extends Error {}
  const exits = [];
  const exit = code => { exits.push(code); throw new Stopped(); };
  let launchedNext = false;
  // The simulated failure's protocol lines are captured, never written into the enclosing unit run
  // (the gate reads CLEANUP-UNCONFIRMED from real suite output).
  const captured = [], originalError = console.error;
  console.error = (...args) => { captured.push(args.join(' ')); };
  try {
    const suite = async () => {
      await closeWithin({ close: () => new Promise(() => {}) }, 'browser', { ms: 10, exit });
      launchedNext = true;
    };
    await assert.rejects(suite(), Stopped);
    assert.equal(launchedNext, false, 'no further launch after the failed close');
    assert.deepEqual(exits, [125]);
    assert.equal(cleanupState.unconfirmed, true);
    assert.ok(captured.some(line => line.startsWith('CLEANUP-UNCONFIRMED browser')), 'the marker is emitted');
    const deadlineExits = [];
    const timer = installSuiteDeadline('test', 5, { exit: code => deadlineExits.push(code) });
    await new Promise(resolve => setTimeout(resolve, 30));
    clearTimeout(timer);
    assert.deepEqual(deadlineExits, [125], 'a deadline cannot downgrade 125 to 124');
  } finally {
    console.error = originalError;
    cleanupState.unconfirmed = false;
  }
});
````

**`package.json`** (complete file):

````json
{
  "name": "atlas-mandelbrot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "An immersive arbitrary-precision Mandelbrot observatory",
  "scripts": {
    "dev": "node scripts/serve.mjs",
    "dev:gpu": "node scripts/gpu-preview.mjs",
    "start": "node scripts/serve.mjs",
    "build": "node scripts/build.mjs",
    "test": "node scripts/run-unit.mjs",
    "test:browser": "node scripts/run-unit.mjs && node tests/browser.mjs",
    "test:navigation": "node scripts/run-unit.mjs && node tests/navigation.mjs",
    "test:graphics": "node scripts/run-unit.mjs && node tests/graphics.mjs --chrome --headed --compositor --benchmark",
    "thumbnails": "node scripts/thumbnails.mjs",
    "gate": "node scripts/plane-gate.mjs",
    "test:workflow": "node scripts/run-unit.mjs && node tests/workflow.mjs"
  },
  "devDependencies": {
    "playwright": "1.59.1"
  }
}
````

In `tests/browser.mjs` only the share-link and location-file checks change: the share test now opens the URL the application generated and compares the complete scene; the location test inspects the downloaded `atlas.scene` file, reimports it and compares the complete scene. The pass names are unchanged. The Alt+← check also asserts that the browser did not navigate or reload.

- [ ] **Step 6: Write the application wiring**

**`src/app.js`** (complete file):

````js
import { GpuRenderer, CpuRenderer } from './plane/renderer.js';
import { moveView, zoomView, viewTransform, precisionFor, validateView } from './plane/math.js';
import { PALETTES } from './plane/palettes.js';
import { PLACES } from './plane/places.js';
import { icon, installIcons } from './ui/icons.js';
import { createHistory } from './shared/history.js';
import { sceneCodec, createPlaneScene, toPlaneState, PLANE_INITIAL_SCENE, encodeShareHash, decodeShareHash, encodeSceneFile, decodeSceneFile, admitEnteredView } from './plane/scene-adapter.js';
import { createGestureArbiter } from './plane/gestures.js';

const $ = selector => document.querySelector(selector);
installIcons();
let canvas = $('#fractal');
let renderer;
// The scene history owns the one authoritative scene. `view` and `settings` are derived from it
// and are assigned only in adopt().
let sceneHistory, gestures, view, settings;
let activePlace = 'seahorse';
let busy = false, dirty = false, toastTimer, displayedView;
let rendered = 0, requestVersion = 0, cycle = false, tour = null, captureBusy = false;
let saved = [], savedTab = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}

try {
  const existing = JSON.parse(localStorage.getItem('atlas.discoveries') || '[]');
  saved = Array.isArray(existing) ? existing.filter(item => {
    try { validateView(item.view); return typeof item.name === 'string' && typeof item.id === 'string'; } catch { return false; }
  }) : [];
} catch { /* A privacy-restricted browser still supports exploration. */ }

function adoptScene(scene) {
  const state = toPlaneState(scene);
  view = state.view;
  const { iterations, ...appearanceAndDetail } = state.settings;
  settings = appearanceAndDetail;
}

// Startup: a native share link opens its scene; anything else opens fresh-start Plane.
function startupScene() {
  const link = decodeShareHash(location.hash);
  if (link.kind === 'scene' && link.scene.workspace === 'plane') { activePlace = ''; return link.scene; }
  if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Opening Seahorse valley.`);
  return PLANE_INITIAL_SCENE;
}
sceneHistory = createHistory({ initialScene: startupScene(), codec: sceneCodec });
adoptScene(sceneHistory.snapshot().scene);
sceneHistory.subscribe(() => updateHistoryControls());

// Every scene change arrives here: derive view and settings, then render or recolor.
function adopt(transition, interactive = false) {
  if (!transition) return;
  adoptScene(transition.after);
  if (!transition.render) return;
  const geometry = transition.changed.some(domain => domain !== 'appearance');
  if (transition.changed.some(domain => domain !== 'camera')) syncControls();
  if (geometry) requestRender(interactive);
  else { updateReadouts(); renderer.color(settings); }
}

gestures = createGestureArbiter({ history: sceneHistory, onTransition: (transition, interactive) => adopt(transition, interactive), stopAutomated: () => stopTour() });
const preview = (kind, command, interactive) => gestures.preview(kind, command, interactive);
const commitGesture = kind => gestures.commit(kind);
const applyAction = (commands, kind, interactive = false) => gestures.apply(commands, kind, interactive);
// A wheel burst or key-repeat run: one camera-history entry after a quiet period.
function navigateGrouped(next) {
  activePlace = '';
  gestures.grouped({ type: 'setCamera', camera: next });
  document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
}
function historyStep(action) {
  stopTour();
  const transition = gestures.step(action, action === 'back' || action === 'forward');
  if (transition) { activePlace = ''; renderPlaces(); }
}
function updateHistoryControls() {
  const snapshot = sceneHistory.snapshot();
  for (const [id, enabled] of [['#undo-button', snapshot.canUndo], ['#redo-button', snapshot.canRedo], ['#back-button', snapshot.canBack], ['#forward-button', snapshot.canForward]]) {
    const button = $(id); if (button) button.disabled = !enabled;
  }
}

function makeRenderer() {
  try { return new GpuRenderer(canvas); }
  catch (error) {
    console.info('Using the CPU renderer:', error.message);
    const replacement = canvas.cloneNode(false); canvas.replaceWith(replacement); canvas = replacement;
    toast('Using the CPU renderer. Deep views take a little longer.');
    return new CpuRenderer(canvas, error);
  }
}
renderer = makeRenderer();

function updateGraphicsDetails() {
  const info = renderer.diagnostics;
  $('#graphics-summary').textContent = {
    hardware: 'Your browser reports a hardware graphics device for WebGL rendering.',
    software: 'Your browser is running WebGL in software on the CPU.',
    unknown: 'WebGL is running, but the browser has not disclosed a recognizable graphics device.',
    cpu: 'Fractal calculations are running in the CPU fallback.',
  }[info.acceleration];
  $('#graphics-device').textContent = info.device;
  $('#graphics-reason').textContent = info.reason || 'WebGL 2 and floating-point rendering initialized successfully.';
  $('#graphics-attempted-row').hidden = !info.attemptedDevice;
  $('#graphics-attempted').textContent = info.attemptedDevice || '';
  $('#graphics-guidance').textContent = info.acceleration === 'cpu' || info.acceleration === 'software'
    ? 'Check your browser’s graphics acceleration setting and graphics diagnostics. Rendering runs on the computer where this browser is open.'
    : 'ATLAS calculates new images when you navigate or change the detail setting. A still view does not continuously recalculate the fractal.';
  $('#engine-status').title = `${info.device}\n${info.reason || info.acceleration}\nClick for graphics details`;
}
updateGraphicsDetails();

function renderSettings() {
  return toPlaneState(sceneHistory.snapshot().scene).settings;
}
function dimensions() {
  const width = innerWidth, height = innerHeight;
  let ratio = Math.min(devicePixelRatio || 1, 1.6);
  const budget = view.zoom >= 28 ? 1100000 : 2300000;
  ratio = Math.min(ratio, Math.sqrt(budget / (width * height)));
  return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
}
function requestRender(interactive = false) {
  dirty = true; requestVersion++;
  if (busy && renderer instanceof CpuRenderer) renderer.cancel();
  if (interactive && displayedView) {
    const { scale, x, y } = viewTransform(displayedView, view, innerWidth);
    if ([scale, x, y].every(Number.isFinite)) canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  updateReadouts();
  requestAnimationFrame(flushRender);
}
async function flushRender() {
  if (busy || !dirty || captureBusy) return;
  busy = true; dirty = false;
  const version = requestVersion;
  const snapshot = { ...view }, config = renderSettings();
  const [width, height] = dimensions();
  $('#render-status').textContent = 'Resolving the landscape…';
  document.body.dataset.rendering = 'true';
  try {
    await renderer.render(snapshot, config, width, height, false, () => version === requestVersion);
    renderer.color(settings);
    displayedView = snapshot;
    canvas.style.transform = '';
    rendered++;
    document.body.dataset.ready = 'true';
    $('#engine-status').textContent = renderer.mode;
    updateGraphicsDetails();
    $('#render-status').textContent = 'Ready to explore';
    $('#resolution-status').textContent = `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} · RGB`;
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error(error);
    $('#render-status').textContent = 'Render interrupted';
    toast('This view could not finish rendering. Try reducing the level of detail.');
  } finally {
    busy = false;
    document.body.dataset.rendering = 'false';
    if (dirty || version !== requestVersion) requestAnimationFrame(flushRender);
  }
}
function updateReadouts() {
  const superscript = value => String(value).replace(/[-\d]/g, c => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' })[c]);
  $('#zoom-value').textContent = view.zoom < 6 ? (10 ** view.zoom).toLocaleString('en-US', { maximumFractionDigits: view.zoom < 1 ? 1 : 0 }) : `${(10 ** (view.zoom - Math.floor(view.zoom))).toFixed(2)} · 10${superscript(Math.floor(view.zoom))}`;
  for (const key of ['re', 'im']) {
    const text = view[key];
    $(`#coordinate-${key}`).textContent = (text.startsWith('-') ? '−' + text.slice(1) : '+' + text);
    $(`#coordinate-${key}`).title = text;
  }
  $('#precision-status').textContent = `${precisionFor(view.zoom)} DIGITS`;
  $('#detail-value').textContent = renderSettings().iterations.toLocaleString();
}
function syncControls() {
  $('#phase').value = Math.round(settings.phase * 1000);
  $('#frequency').value = Math.round(settings.frequency * 100);
  $('#detail').value = settings.detail;
  $('#relief').checked = !!settings.relief;
  $('#frequency-value').textContent = `${settings.frequency.toFixed(1)}×`;
  document.querySelectorAll('input[type=range]').forEach(styleRange);
  const palette = PALETTES.find(p => p.id === settings.palette);
  $('#palette-name').textContent = palette.name;
  $('#palette-description').textContent = palette.description;
  document.querySelectorAll('.palette-swatch').forEach(button => {
    const active = button.dataset.palette === settings.palette;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  updateReadouts();
}
function styleRange(input) {
  input.style.setProperty('--range', `${(input.value - input.min) / (input.max - input.min) * 100}%`);
}
// A jump to a place or entered coordinate: its camera goes to camera history and any
// palette or detail it carries is one undoable content change.
// The lexical and resource preflight runs before validateView materializes anything.
function goTo(next, palette, place = '', { tourGesture = false } = {}) {
  const target = admitEnteredView(next);
  const commands = [{ type: 'setCamera', camera: { re: target.re, im: target.im, zoom: target.zoom } }];
  if (Number.isInteger(next.detail)) commands.push({ type: 'setIteration', patch: { detail: Math.min(5, Math.max(0, next.detail)) } });
  if (palette) commands.push({ type: 'setAppearance', patch: { palette } });
  activePlace = place;
  if (tourGesture) for (const command of commands) gestures.automate('tour', command);
  else applyAction(commands, 'jump');
  renderPlaces();
}
function navigate(next, interactive = true, kind = 'navigation') {
  stopTour(); activePlace = '';
  if (kind === 'jump') applyAction([{ type: 'setCamera', camera: next }], 'jump', interactive);
  else preview(kind, { type: 'setCamera', camera: next }, interactive);
  document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
}
function pointAt(clientX, clientY) {
  return [(clientX - innerWidth / 2) / innerWidth, (innerHeight / 2 - clientY) / innerWidth];
}

$('#palette-grid').innerHTML = PALETTES.map(p => `<button class="palette-swatch" data-palette="${p.id}" title="${p.name}" aria-label="${p.name} palette" aria-pressed="false" style="background:linear-gradient(145deg,${p.stops.slice(1,6).join(',')})"></button>`).join('');
$('#palette-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-palette]');
  if (!button) return;
  applyAction([{ type: 'setAppearance', patch: { palette: button.dataset.palette } }], 'edit');
});
// One slider drag is one gesture: `input` previews, `change` (release) commits.
$('#phase').addEventListener('input', event => { styleRange(event.target); preview('slider', { type: 'setAppearance', patch: { phase: event.target.value / 1000 } }); });
$('#frequency').addEventListener('input', event => { preview('slider', { type: 'setAppearance', patch: { frequency: event.target.value / 100 } }); });
$('#detail').addEventListener('input', event => { styleRange(event.target); preview('slider', { type: 'setIteration', patch: { detail: Number(event.target.value) } }); });
for (const id of ['#phase', '#frequency', '#detail']) $(id).addEventListener('change', () => commitGesture('slider'));
$('#relief').addEventListener('change', event => { applyAction([{ type: 'setAppearance', patch: { relief: Number(event.target.checked) } }], 'edit'); });
$('#cycle-button').onclick = () => {
  cycle = !cycle; $('#cycle-button').setAttribute('aria-pressed', String(cycle));
  if (!cycle) commitGesture('animation');
  if (cycle && !tour) requestAnimationFrame(animate);
};
let lastAnimation = 0;
function animate(time) {
  const dt = Math.min(.08, (time - (lastAnimation || time)) / 1000); lastAnimation = time;
  if (cycle && !captureBusy) { gestures.animate({ type: 'setAppearance', patch: { phase: (settings.phase + dt * .025) % 1 } }); $('#phase').value = Math.round(settings.phase * 1000); styleRange($('#phase')); }
  if (tour && !captureBusy) {
    const elapsed = time - tour.started;
    if (elapsed > 18000) {
      tour.index = (tour.index + 1) % PLACES.length; tour.started = time; tour.lastFrame = 0;
      const place = PLACES[tour.index]; goTo(place, place.palette, place.id, { tourGesture: true });
      $('#tour-location').textContent = place.name;
    } else if (!busy && elapsed - tour.lastFrame > 90) {
      const step = (elapsed - tour.lastFrame) / 1000;
      tour.lastFrame = elapsed;
      gestures.automate('tour', { type: 'setCamera', camera: zoomView(view, view.zoom + Math.min(.2, step) * .07) }, true);
    }
  }
  if (cycle || tour) requestAnimationFrame(animate); else lastAnimation = 0;
}
function startTour() {
  if (tour) { stopTour(); return; }
  gestures.settle();
  tour = { index: 1, started: performance.now(), lastFrame: 0 };
  goTo(PLACES[1], PLACES[1].palette, PLACES[1].id, { tourGesture: true });
  $('#tour-status').hidden = false; $('#tour-location').textContent = PLACES[1].name;
  $('#tour-button').innerHTML = `${icon('pause')} Pause the journey <span class="arrow">↗</span>`;
  if (reducedMotion) toast('Journey started. Use Pause at any time to stop motion.');
  if (!cycle) requestAnimationFrame(animate);
}
function stopTour() {
  const running = tour;
  tour = null;
  if (running) commitGesture('tour');
  $('#tour-status').hidden = true;
  $('#tour-button').innerHTML = `${icon('play')} Take a journey <span class="arrow">↗</span>`;
}
$('#tour-button').onclick = startTour;
$('#stop-tour').onclick = stopTour;

function bindCanvas() {
  const surface = $('#fractal-surface');
  surface.addEventListener('wheel', event => {
    event.preventDefault();
    const [x, y] = pointAt(event.clientX, event.clientY);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    navigateGrouped(zoomView(view, view.zoom - Math.max(-160, Math.min(160, delta)) * .0015, x, y));
  }, { passive: false });
  surface.addEventListener('dblclick', event => { const [x, y] = pointAt(event.clientX, event.clientY); navigate(zoomView(view, view.zoom + Math.log10(4), x, y), true, 'jump'); });
  const pointers = new Map();
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    stopTour(); gestures.settle(); canvas.focus({ preventScroll: true }); surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.classList.add('dragging');
  });
  surface.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      navigate(moveView(view, (old.x - event.clientX) / innerWidth, (event.clientY - old.y) / innerWidth), true, 'navigation-drag');
    } else if (pointers.size === 2) {
      const after = [...pointers.values()];
      const distance = values => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      const mid = values => ({ x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 });
      const previous = mid(before), current = mid(after);
      const [x, y] = pointAt(previous.x, previous.y);
      const next = zoomView(view, view.zoom + Math.log10(Math.max(1, distance(after)) / Math.max(1, distance(before))), x, y);
      navigate(moveView(next, (previous.x - current.x) / innerWidth, (current.y - previous.y) / innerWidth), true, 'navigation-drag');
    }
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(event, e => {
    pointers.delete(e.pointerId);
    if (!pointers.size) { canvas.classList.remove('dragging'); commitGesture('navigation-drag'); }
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); $('#render-status').textContent = 'Graphics paused'; toast('The graphics device paused. Restoring the view…');
  });
  canvas.addEventListener('webglcontextrestored', () => { renderer.destroy(); renderer = makeRenderer(); requestRender(); });
}
bindCanvas();
$('#zoom-in').onclick = () => navigate(zoomView(view, view.zoom + Math.log10(2)), true, 'jump');
$('#zoom-out').onclick = () => navigate(zoomView(view, view.zoom - Math.log10(2)), true, 'jump');
$('#undo-button').onclick = () => historyStep('undo');
$('#redo-button').onclick = () => historyStep('redo');
$('#back-button').onclick = () => historyStep('back');
$('#forward-button').onclick = () => historyStep('forward');
const home = () => { stopTour(); goTo(PLACES[0], settings.palette, 'origin'); };
$('#home-button').onclick = home;
$('#brand-home').onclick = event => { event.preventDefault(); home(); };
function cinema() { document.body.classList.toggle('cinema'); }
$('#cinema-button').onclick = cinema;
$('#settings-button').onclick = () => {
  document.body.classList.toggle('controls-expanded');
  $('#settings-button').setAttribute('aria-expanded', String(document.body.classList.contains('controls-expanded')));
};
$('#exit-cinema').onclick = cinema;
$('#gallery-toggle').onclick = () => {
  document.body.classList.toggle('gallery-collapsed');
  const label = document.body.classList.contains('gallery-collapsed') ? 'Expand places' : 'Collapse places';
  $('#gallery-toggle').setAttribute('aria-label', label); $('#gallery-toggle').title = label;
};

function renderPlaces() {
  $('#saved-count').textContent = saved.length;
  $('#destination-grid').classList.toggle('saved-places', savedTab);
  $('#destination-grid').replaceChildren();
  if (savedTab && !saved.length) {
    const empty = document.createElement('div'); empty.className = 'empty-saved'; empty.textContent = 'Find a place you love. Press B to keep it here.'; $('#destination-grid').append(empty); return;
  }
  (savedTab ? saved : PLACES).forEach((place, index) => {
    const button = document.createElement('button');
    button.className = `destination-card${place.id === activePlace ? ' active' : ''}`;
    button.dataset.place = place.id;
    const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.draggable = false;
    image.src = savedTab ? place.thumbnail || '/assets/seahorse.png' : `/assets/${place.id}.png`;
    // Thumbnails are real renders, generated by scripts/thumbnails.mjs.
    image.onerror = () => { image.style.display = 'none'; };
    button.append(image);
    const fields = [['place-number', String(index + 1).padStart(2, '0')], ['place-arrow', '↗'], ['place-name', place.name], ['place-description', place.description || 'YOUR OWN LITTLE INFINITY']];
    for (const [className, text] of fields) { const span = document.createElement('span'); span.className = className; span.textContent = text; button.append(span); }
    button.onclick = () => {
      stopTour();
      if (savedTab) {
        try { applyAction([{ type: 'restoreScene', scene: createPlaneScene({ view: place.view, settings: place.settings }) }], 'restore'); activePlace = place.id; renderPlaces(); }
        catch (error) { toast(`This discovery could not be opened: ${error.message}`); }
      } else goTo(place, place.palette, place.id);
    };
    if (savedTab) {
      const wrapper = document.createElement('div'); wrapper.className = 'saved-wrapper'; wrapper.append(button);
      const remove = document.createElement('button'); remove.className = 'delete-save'; remove.innerHTML = icon('close'); remove.setAttribute('aria-label', `Delete ${place.name}`);
      remove.onclick = () => { saved = saved.filter(item => item.id !== place.id); persistSaved(); renderPlaces(); toast('Discovery removed.'); };
      wrapper.append(remove); $('#destination-grid').append(wrapper);
    } else $('#destination-grid').append(button);
  });
}
function persistSaved() {
  try { localStorage.setItem('atlas.discoveries', JSON.stringify(saved)); return true; }
  catch { toast('Browser storage is unavailable or full. Use Capture → Save location to keep this view.'); return false; }
}
function saveDiscovery() {
  if (!rendered || busy || dirty) { toast('Let the current view finish, then save it.'); return; }
  const thumbnailCanvas = document.createElement('canvas'); thumbnailCanvas.width = 320; thumbnailCanvas.height = 160;
  thumbnailCanvas.getContext('2d').drawImage(canvas, 0, 0, 320, 160);
  const base = PLACES.find(p => p.id === activePlace)?.name || 'Discovery';
  const item = { id: crypto.randomUUID(), name: `${base} ${String(saved.length + 1).padStart(2, '0')}`, view: { ...view }, settings: { ...settings }, thumbnail: thumbnailCanvas.toDataURL('image/jpeg', .75) };
  saved.unshift(item);
  if (!persistSaved()) { saved.shift(); return; }
  renderPlaces(); toast('Discovery saved. Find it in Your discoveries.');
}
$('#bookmark-button').onclick = saveDiscovery;
for (const id of ['places-tab', 'saved-tab']) $(`#${id}`).onclick = () => {
  savedTab = id === 'saved-tab';
  for (const tab of ['places-tab', 'saved-tab']) { const active = tab === id; $(`#${tab}`).classList.toggle('active', active); $(`#${tab}`).setAttribute('aria-pressed', String(active)); }
  renderPlaces();
};

function showDialog(id) { stopTour(); $(id).showModal(); }
$('#engine-status').onclick = () => showDialog('#graphics-dialog');
$('#graphics-button').onclick = () => { $('#help-dialog').close(); showDialog('#graphics-dialog'); };
$('#help-button').onclick = () => showDialog('#help-dialog');
$('#export-button').onclick = () => showDialog('#capture-dialog');
$('#coordinates-button').onclick = () => {
  $('#input-re').value = view.re; $('#input-im').value = view.im; $('#input-zoom').value = view.zoom;
  $('#coordinate-error').textContent = ''; showDialog('#coordinate-dialog');
};
$('#coordinate-form').onsubmit = event => {
  event.preventDefault();
  try {
    const next = admitEnteredView({ re: $('#input-re').value.trim(), im: $('#input-im').value.trim(), zoom: Number($('#input-zoom').value) });
    goTo(next); $('#coordinate-dialog').close();
  } catch (error) { $('#coordinate-error').textContent = error.message; }
};
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
$('#share-button').onclick = async () => {
  commitGesture();
  const url = `${location.origin}${location.pathname}${encodeShareHash(sceneHistory.snapshot().scene)}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('View link copied. Every coordinate digit is included.'); }
  catch { toast('Your view is in the address bar. Copy that URL to share it.'); }
};
// A link opened during an investigation: a valid scene is a whole-scene restoration;
// anything else is reported and changes neither the scene nor either history.
addEventListener('hashchange', () => {
  const link = decodeShareHash(location.hash);
  if (link.kind === 'scene' && link.scene.workspace === 'plane') { stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene: link.scene }], 'restore'); renderPlaces(); }
  else if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Your view is unchanged.`);
});

function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$('#download-location').onclick = () => {
  commitGesture();
  download(new Blob([encodeSceneFile(sceneHistory.snapshot().scene)], { type: 'application/json' }), 'atlas-scene.json');
  $('#capture-status').textContent = 'Location saved, including all coordinate digits.';
};
$('#import-location').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > sceneCodec.maxSceneBytes) throw new Error('This location file is too large.');
    const scene = decodeSceneFile(await file.text());
    stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene }], 'restore'); renderPlaces();
    $('#capture-dialog').close(); toast('Welcome back to your discovery.');
  } catch (error) { $('#capture-status').textContent = error.message || 'Could not open this location.'; }
  event.target.value = '';
};
$('#download-image').onclick = async () => {
  if (captureBusy) return;
  const button = $('#download-image'); button.disabled = true;
  $('#capture-status').textContent = 'Rendering your image…';
  stopTour();
  while (busy) await new Promise(resolve => setTimeout(resolve, 40));
  captureBusy = true;
  const snapshot = { ...view }, config = renderSettings();
  const width = $('#export-size').value === 'current' ? canvas.width : Number($('#export-size').value);
  const height = Math.max(1, Math.round(width * innerHeight / innerWidth));
  try {
    await renderer.render(snapshot, config, width, height, true);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image export is unavailable.');
    download(blob, `atlas-${Math.floor(snapshot.zoom)}-decades.png`);
    $('#capture-status').textContent = `Saved ${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} pixels. Save the location below to return here.`;
  } catch (error) { $('#capture-status').textContent = error.message; }
  finally { captureBusy = false; button.disabled = false; requestRender(); }
};

addEventListener('keydown', event => {
  if (event.target.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  const historyKey = (event.ctrlKey || event.metaKey) && !event.altKey
    ? (key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null)
    : event.altKey && !event.ctrlKey && !event.metaKey ? ({ arrowleft: 'back', arrowright: 'forward' })[key] : null;
  if (historyKey) { event.preventDefault(); historyStep(historyKey); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const actions = {
    '+': () => navigateGrouped(zoomView(view, view.zoom + Math.log10(2))), '=': () => navigateGrouped(zoomView(view, view.zoom + Math.log10(2))),
    '-': () => navigateGrouped(zoomView(view, view.zoom - Math.log10(2))),
    arrowleft: () => navigateGrouped(moveView(view, -.08, 0)), arrowright: () => navigateGrouped(moveView(view, .08, 0)),
    arrowup: () => navigateGrouped(moveView(view, 0, .08)), arrowdown: () => navigateGrouped(moveView(view, 0, -.08)),
    r: home, h: cinema, b: saveDiscovery, s: () => showDialog('#capture-dialog'), '?': () => showDialog('#help-dialog'),
    escape: () => { document.body.classList.remove('cinema'); stopTour(); },
  };
  if (actions[key]) { event.preventDefault(); actions[key](); }
});
addEventListener('resize', () => requestRender(true));
addEventListener('pagehide', () => renderer.destroy());

// Small inspection API for numerical and browser regression tests.
class IdleTimeoutError extends Error {
  constructor(ms, state) { super(`ATLAS did not become idle within ${ms} ms (${JSON.stringify(state)}).`); this.name = 'IdleTimeoutError'; this.code = 'ATLAS_IDLE_TIMEOUT'; }
}
window.atlas = {
  get graphics() { return { ...renderer.diagnostics }; },
  get view() { return { ...view }; }, get settings() { return renderSettings(); }, get renderer() { return renderer; },
  get rendered() { return rendered; }, goTo,
  get scene() { return sceneHistory.snapshot().scene; },
  get history() { const { scene, ...rest } = sceneHistory.snapshot(); return rest; },
  undo: () => historyStep('undo'), redo: () => historyStep('redo'), back: () => historyStep('back'), forward: () => historyStep('forward'),
  async whenIdle({ timeoutMs = 60000 } = {}) {
    const deadline = performance.now() + timeoutMs;
    while (busy || dirty || captureBusy) {
      if (performance.now() > deadline) throw new IdleTimeoutError(timeoutMs, { busy, dirty, captureBusy });
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  },
};
syncControls(); renderPlaces(); updateHistoryControls(); requestRender();
````

**`index.html`** (complete file):

````html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b141b">
  <meta name="description" content="An infinite landscape hidden inside a simple equation. Explore the Mandelbrot set in full color with adaptive precision.">
  <title>ATLAS — An infinite landscape</title>
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="stylesheet" href="/src/ui/style.css">
</head>
<body>
  <main id="observatory">
    <div id="fractal-surface"><canvas id="fractal" aria-label="Interactive Mandelbrot fractal. Scroll to zoom, drag to pan, or use the keyboard controls." tabindex="0"></canvas></div>
    <div class="vignette" aria-hidden="true"></div>
    <header class="topbar chrome">
      <a class="brand" href="#" id="brand-home" aria-label="Atlas home"><span class="brand-symbol">∞</span><span>ATLAS</span><i></i><small>THE MANDELBROT EXPLORER</small></a>
      <nav class="header-actions" aria-label="View actions">
        <button id="settings-button" class="icon-button mobile-only" title="Explorer settings" aria-label="Explorer settings" aria-expanded="false"><span data-icon="sliders"></span></button>
        <button id="help-button" class="icon-button" title="Controls and about (?)" aria-label="Controls and about"><span data-icon="help"></span></button>
        <button id="cinema-button" class="icon-button" title="Cinema mode (H)" aria-label="Cinema mode"><span data-icon="expand"></span></button>
        <span class="action-divider"></span>
        <button id="share-button" class="text-button"><span data-icon="link"></span><span>Share view</span></button>
        <button id="export-button" class="export-button"><span data-icon="download"></span><span>Capture</span></button>
      </nav>
    </header>

    <section class="intro chrome" aria-label="Current location">
      <div class="eyebrow"><span class="live-dot"></span> A WINDOW INTO INFINITY</div>
      <h1>An infinite<br>landscape.</h1>
      <p>One equation. Endless discovery.</p>
      <button id="tour-button" class="tour-button"><span data-icon="play"></span> Take a journey <span class="arrow">↗</span></button>
    </section>

    <aside id="control-panel" class="panel chrome" aria-label="Explorer controls">
      <div class="panel-top"><div><span class="eyebrow">YOUR OBSERVATORY</span><h2>Make it your own.</h2></div><span class="tiny-orbit" aria-hidden="true">✳</span></div>
      <div class="panel-section">
        <div class="section-heading"><label>Color atmosphere</label><span class="small-tag">24-BIT RGB</span></div>
        <div id="palette-grid" class="palette-grid"></div>
        <div class="palette-caption"><span id="palette-name">Solar flare</span><span id="palette-description">Copper · gold · midnight</span></div>
        <div class="slider-label"><label for="phase">Color shift</label><button id="cycle-button" class="mini-button" aria-pressed="false" title="Animate the palette"><span data-icon="spark"></span> Animate</button></div>
        <input id="phase" type="range" min="0" max="1000" value="110" aria-label="Color shift">
        <div class="slider-label"><label for="frequency">Color density</label><output id="frequency-value" for="frequency">1.0×</output></div>
        <input id="frequency" type="range" min="20" max="250" value="100">
      </div>
      <div class="panel-section">
        <div class="section-heading"><label for="detail">Level of detail</label><output id="detail-value" for="detail">1,024</output></div>
        <input id="detail" type="range" min="0" max="5" step="1" value="1">
        <div class="range-caption"><span>Faster</span><span>Finer</span></div>
        <label class="toggle-row" for="relief"><span>Orbit texture <small>Let the light find the details</small></span><input id="relief" type="checkbox" checked><span class="switch" aria-hidden="true"></span></label>
      </div>
      <div class="panel-section location-section">
        <div class="section-heading"><label>In the complex plane</label><button id="coordinates-button" class="mini-button" title="Go to coordinates"><span data-icon="crosshair"></span> Go to</button></div>
        <div class="coordinate"><span>Re</span><span id="coordinate-re">−0.743643887037151</span></div>
        <div class="coordinate"><span>Im</span><span id="coordinate-im">+0.131825904205330</span></div>
        <button id="bookmark-button" class="bookmark-button"><span data-icon="bookmark"></span> Save this discovery <span class="keycap">B</span></button>
      </div>
      <div class="panel-footer"><span class="live-dot"></span><button id="engine-status" class="engine-button" aria-label="Show graphics details">INITIALIZING</button><span id="precision-status">40 DIGITS</span></div>
    </aside>

    <div class="navigation chrome" aria-label="Navigation controls">
      <button id="zoom-in" title="Zoom in (+)" aria-label="Zoom in"><span data-icon="plus"></span></button>
      <div class="zoom-readout"><span id="zoom-value">7,079</span><small>× MAGNIFICATION</small></div>
      <button id="zoom-out" title="Zoom out (−)" aria-label="Zoom out"><span data-icon="minus"></span></button>
      <span class="nav-divider"></span>
      <button id="home-button" title="The whole set (R)" aria-label="Reset to whole Mandelbrot set"><span data-icon="home"></span></button>
      <span class="nav-divider"></span>
      <button id="back-button" title="Previous view (Alt+←)" aria-label="Previous view" disabled><span data-icon="back"></span></button>
      <button id="forward-button" title="Next view (Alt+→)" aria-label="Next view" disabled><span data-icon="forward"></span></button>
      <button id="undo-button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled><span data-icon="undo"></span></button>
      <button id="redo-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled><span data-icon="redo"></span></button>
    </div>
    <div class="navigation-hint chrome"><span data-icon="mouse"></span><span>Scroll to zoom</span><i></i><span>Drag to explore</span><i></i><span>Double-click to dive</span></div>

    <section id="destinations" class="destinations chrome" aria-label="Places to explore">
      <div class="destinations-heading"><div><span class="eyebrow">THE UNIVERSE NEXT DOOR</span><h2>Somewhere to begin.</h2></div><div class="destination-tabs" role="group" aria-label="Location collection"><button id="places-tab" class="active" aria-pressed="true">Curated places</button><button id="saved-tab" aria-pressed="false">Your discoveries <span id="saved-count">0</span></button></div><button id="gallery-toggle" class="icon-button" title="Collapse places" aria-label="Collapse places"><span data-icon="chevron"></span></button></div>
      <div id="destination-grid" class="destination-grid"></div>
    </section>

    <footer class="statusbar chrome"><span><span class="status-dot"></span><span id="render-status">Preparing your window…</span></span><span class="formula">z<sub>n+1</sub> = z<sub>n</sub><sup>2</sup> + c <i></i> INFINITELY SIMPLE. ENDLESSLY COMPLEX.</span><span id="resolution-status"></span></footer>
    <button id="exit-cinema" class="exit-cinema" title="Show controls (H or Escape)"><span data-icon="expand"></span> Show controls <kbd>H</kbd></button>
    <div id="tour-status" class="tour-status" hidden><span class="live-dot"></span><span id="tour-location">A journey into the set</span><button id="stop-tour" aria-label="Stop journey"><span data-icon="pause"></span></button></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </main>

  <dialog id="help-dialog" class="modal">
    <button class="modal-close icon-button" data-close aria-label="Close"><span data-icon="close"></span></button>
    <span class="eyebrow">WELCOME TO ATLAS</span><h2>There is always more.</h2>
    <p>Every shape you see comes from repeating one tiny equation. Follow a boundary. Find a spiral. Keep going.</p>
    <div class="help-keys"><span>Zoom toward the pointer</span><kbd>Scroll</kbd><span>Move through the landscape</span><kbd>Drag / ↑ ↓ ← →</kbd><span>Dive into a detail</span><kbd>Double-click / +</kbd><span>Step back</span><kbd>−</kbd><span>Return to the whole set</span><kbd>R</kbd><span>Hide the instruments</span><kbd>H</kbd><span>Save your discovery</span><kbd>B</kbd><span>Capture an image</span><kbd>S</kbd></div>
    <p class="help-note">On touchscreens, drag with one finger and pinch to zoom. Precision grows with your journey; there is no preset zoom ceiling. Very deep or intricate views need more time and a higher detail setting. A black region may be inside the set, or may need more iterations.</p>
    <a class="source-link" href="https://mathr.co.uk/web/deep-zoom.html" target="_blank" rel="noreferrer">The mathematics behind the journey ↗</a>
    <button id="graphics-button" class="secondary-button">Graphics details</button>
  </dialog>

  <dialog id="graphics-dialog" class="modal">
    <button class="modal-close icon-button" data-close aria-label="Close"><span data-icon="close"></span></button>
    <span class="eyebrow">YOUR DEVICE</span><h2>Your rendering engine.</h2>
    <p id="graphics-summary"></p>
    <dl class="graphics-details">
      <div><dt>Active renderer</dt><dd id="graphics-device"></dd></div>
      <div id="graphics-attempted-row" hidden><dt>Attempted graphics device</dt><dd id="graphics-attempted"></dd></div>
      <div><dt>GPU initialization</dt><dd id="graphics-reason"></dd></div>
    </dl>
    <p id="graphics-guidance" class="help-note"></p>
  </dialog>

  <dialog id="coordinate-dialog" class="modal">
    <button class="modal-close icon-button" data-close aria-label="Close"><span data-icon="close"></span></button>
    <span class="eyebrow">A PLACE IN INFINITY</span><h2>Go somewhere precise.</h2>
    <form id="coordinate-form">
      <label for="input-re">Real coordinate</label><textarea id="input-re" rows="2" required spellcheck="false"></textarea>
      <label for="input-im">Imaginary coordinate</label><textarea id="input-im" rows="2" required spellcheck="false"></textarea>
      <label for="input-zoom">Magnification · power of 10</label><input id="input-zoom" type="number" min="-0.6" step="any" required>
      <p class="help-note">For 10²⁰ magnification, enter 20. All coordinate digits are preserved.</p>
      <p id="coordinate-error" class="form-error" role="alert"></p>
      <button type="submit" class="primary-button">Explore this location <span>↗</span></button>
    </form>
  </dialog>

  <dialog id="capture-dialog" class="modal">
    <button class="modal-close icon-button" data-close aria-label="Close"><span data-icon="close"></span></button>
    <span class="eyebrow">A LITTLE PIECE OF INFINITY</span><h2>Keep the view.</h2><p>A full-color PNG, without the instruments. Your coordinates travel alongside it in a location file.</p>
    <label for="export-size">Image resolution</label><select id="export-size"><option value="1920">Full HD · 1920 px wide</option><option value="3840">4K · 3840 px wide</option><option value="current">Current viewport</option></select>
    <button id="download-image" class="primary-button">Save image <span data-icon="download"></span></button>
    <button id="download-location" class="secondary-button">Save location (.json)</button>
    <label class="import-label" for="import-location">Open a saved location <span>↗</span></label><input id="import-location" type="file" accept="application/json,.json" hidden>
    <p id="capture-status" class="help-note" role="status"></p>
  </dialog>
  <noscript><div class="noscript">ATLAS needs JavaScript to calculate and explore the Mandelbrot set.</div></noscript>
  <script type="module" src="/src/app.js"></script>
</body>
</html>
````

**`src/ui/icons.js`** (complete file):

````js
const paths = {
  sliders: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9a2.6 2.6 0 0 1 5.1.6c0 1.9-2.5 2-2.5 3.7M12 17h.01"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  link: '<path d="m10 13 4-4m-5 6-2 2a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 1 2-2a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" transform="translate(1 0)"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>', pause: '<path d="M9 5v14M15 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-7h6v7"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
  spark: '<path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3Z"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>', forward: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  undo: '<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m15 7 5 5-5 5m5-5H9a5 5 0 0 0 0 10h3"/>',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
export function installIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
}
````

- [ ] **Step 7: Run the unit tests and the syntax checks**

Run:
```bash
npm test && node --check src/app.js && node --check tests/workflow.mjs
```
Expected: `UNIT {"state":"passed","reason":"68 tests passed","files":7,…}` and exit 0. The two syntax checks print nothing.

- [ ] **Step 8: Commit**

```bash
git add src/plane/gestures.js tests/unit/gestures.test.js tests/unit.manifest.json src/app.js index.html src/ui/icons.js tests/browser.mjs tests/workflow.mjs tests/suites.manifest.json tests/unit/no-launch.test.js package.json
git commit -m "Route every Plane edit through the scene history with explicit gesture ownership; native share links and scene files"
```

- [ ] **Step 9: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 10: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T06: Render requests, reports and the Plane render adapter (spec §7.1–7.4)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** T03.

**Files:**
- Create: `src/shared/render-request.js`, `src/shared/render-report.js`, `src/plane/render-adapter.js`
- Create: `tests/support/fake-renderer.mjs`
- Modify: `tests/unit.manifest.json`
- Test: `tests/unit/render-adapter.test.js`, `tests/unit/renderer-guards.test.js`

**Interfaces:**
- Consumes: `deepFreeze`, `isPlainObject`, `fnv1a64`, `canonicalJson` (T03); `toPlaneState`, `sceneCodec`, `planeDependencies` (T03); a renderer with `render(view, settings, width, height, fullResolution, isCurrent)`, `color(settings)`, `cancel?()`, `canvas`, `mode`, `diagnostics`, `gl?` (the existing `GpuRenderer`/`CpuRenderer`, unchanged).
- Produces (`src/shared/render-request.js`): `RUNTIME_ID` (a namespace created synchronously per page or process), `RENDER_PURPOSES`, `RENDER_OUTCOMES`, `RenderRequestError`, `createRenderRequest({requestId, jobId, viewId, sceneSnapshot, sceneHash, output:{width, height, purpose}, quality, generation:{deviceEpoch, viewRevision, geometryRevision, appearanceRevision}, keys:{geometryKey, appearanceKey}}) → frozen request`, `isPublishable(request, currentGeneration)`.
- Produces (`src/shared/render-report.js`): `UNAVAILABLE`, `INAPPLICABLE`, `observed(value, source)`, `createReportBuilder(request, {implementation, environment, workspaceFields, clock}) → {mark(event), finish(outcome, {reason, completed, appearanceKey, details}) → frozen report}`, `PLANE_INAPPLICABLE_FIELDS`.
- Produces (`src/shared/render-report.js`, finish): `builder.finish(outcome, {reason, completed, publication, details})`; with `publication`, the report describes that request (its scene hash, identity, keys, generation) and records `geometryRequestId` (the request whose geometry was published) with `appearanceRebound: true`.
- Produces (`src/plane/render-adapter.js`): `LeaseError`, `createPlaneRequest({scene, purpose, width, height, generation, viewId?, runtimeId = RUNTIME_ID})` (identities `plane-<purpose>-<runtime>-<n>`), `appearanceKeyOf(settings)`, `createPlaneRenderAdapter({renderer, clock}) → {render(request, {isCurrent, currentGeneration, liveScene}) → Promise<report>, recolor(scene, generation) → {status:"applied"|"deferred"|"retired", report|null}, cancelInteractive(), whenIdle({timeoutMs}) → Promise<boolean>, reserveExclusive(request) → lease, invalidate() (a lost context: advances the epoch, forgets the publication, makes the renderer unavailable), reserved, retired, unavailable, epoch, renderer, published, replaceRenderer(next) (throws during a lease; clears unavailable)}`; while unavailable, render and reserveExclusive throw and recolor returns `{status:"unavailable"}`; a lease is `{request, canvas, jobReport, current() → boolean, lost() → boolean (a context loss since reservation), admit({timeoutMs}), render({timeoutMs}) (checks its captured epoch before classifying or coloring), retire(), release() → deferred scene | null}`. The adapter keeps the publication and, separately, the request that computed its geometry. Geometry stays publishable while the device epoch and geometry revision match; the check runs after the renderer finishes.
- Produces (`tests/support/fake-renderer.mjs`): `createFakeRenderer({gl?})` with `finishNext({ignoreCurrent?})`, `failNext(message)`, `colors()`, `renders()`; `flush()`.

**Design assertions:**
- Spec §7.1–7.2: frozen requests with revisions and resolved keys; identities never collide across runtimes (`identities from two runtimes sharing one store never collide`); a late completion is never publishable merely because its key matches again (`a-b-a late completion rejected`); the adapter never adopts a stale completion (`a renderer that ignores cancellation is never adopted`), and the production renderers check `isCurrent` before writing pixels (`GpuRenderer checks isCurrent before it resizes, draws or colors`, `CpuRenderer checks isCurrent before it adopts or paints a frame`).
- Spec §7.2–7.4: every publication belongs to a complete request describing the published scene; an appearance applied to completed geometry, during a render or immediately, is reported under a new publication request with the geometry's request as provenance, however many recolors follow (`appearance rebind reports current request`, `an immediate recolor produces a current publication report`, `successive recolors keep the geometry origin`).
- Context loss: nothing uses a lost renderer until it is replaced, and a render in flight is interrupted (`a lost renderer admits nothing until it is replaced`, `a context loss during an interactive render interrupts it`).
- Spec §7.4: unavailable facts are `unavailable`, Space-only fields `inapplicable`; GPU timing is not claimed.

- [ ] **Step 1: Write the failing tests**

**`tests/support/fake-renderer.mjs`** (complete file):

````js
// A controllable stand-in for GpuRenderer/CpuRenderer in Node tests. Each render waits
// until the test calls finish(), fail() or leaves it pending; every call is recorded.
export function createFakeRenderer({ gl = true } = {}) {
  const calls = [], pending = [];
  const renderer = {
    calls, pending, canvas: { width: 64, height: 32 }, mode: 'FAKE · DIRECT', diagnostics: { device: 'Fake device', api: 'test' },
    gl: gl ? {} : undefined,
    render(view, settings, width, height, fullResolution = false, isCurrent = () => true) {
      calls.push({ op: 'render', view: { ...view }, settings: { ...settings }, width, height, fullResolution });
      return new Promise((resolve, reject) => {
        pending.push({
          // ignoreCurrent: a renderer that completes without honouring cancellation.
          finish({ ignoreCurrent = false } = {}) {
            if (!ignoreCurrent && !isCurrent()) { const error = new Error('Render superseded'); error.name = 'AbortError'; reject(error); return; }
            renderer.canvas.width = width; renderer.canvas.height = height;
            renderer.color(settings);
            resolve();
          },
          fail(message) { reject(new Error(message)); },
        });
      });
    },
    color(settings) { calls.push({ op: 'color', settings: { ...settings } }); },
    cancel() { calls.push({ op: 'cancel' }); },
    finishNext(options) { pending.shift().finish(options); },
    failNext(message) { pending.shift().fail(message); },
    colors() { return calls.filter(call => call.op === 'color').map(call => call.settings); },
    renders() { return calls.filter(call => call.op === 'render'); },
  };
  return renderer;
}

export const flush = () => new Promise(resolve => setImmediate(resolve));
````

**`tests/unit/render-adapter.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaneRenderAdapter, createPlaneRequest, appearanceKeyOf, LeaseError } from '../../src/plane/render-adapter.js';
import { createRenderRequest, isPublishable, RUNTIME_ID } from '../../src/shared/render-request.js';
import { createPlaneScene, sceneCodec, toPlaneState } from '../../src/plane/scene-adapter.js';
import { createFakeRenderer, flush } from '../support/fake-renderer.mjs';

const A = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 } });
const B = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 1 } });
const auroraA = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 }, settings: { palette: 'aurora' } });
let clockValue = 0;
const clock = () => (clockValue += 5);
const generation = (geometryRevision, { deviceEpoch = 0, viewRevision = geometryRevision, appearanceRevision = 0 } = {}) => ({ deviceEpoch, viewRevision, geometryRevision, appearanceRevision });
const request = (scene, revision, purpose = 'interactive') => createPlaneRequest({ scene, purpose, width: 320, height: 180, generation: generation(revision) });
const hashOf = scene => sceneCodec.fingerprint(scene).sceneHash;

test('render requests are frozen, validated and publishable only while every revision matches', () => {
  const r = request(A, 1);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.output) && Object.isFrozen(r.generation));
  assert.match(r.sceneHash, /^fnv1a64:/);
  assert.ok(isPublishable(r, generation(1)));
  assert.ok(!isPublishable(r, generation(2)));
  assert.ok(!isPublishable(r, generation(1, { deviceEpoch: 1 })), 'a new device epoch rejects the request');
  assert.throws(() => createRenderRequest({ ...r, output: { width: 0, height: 1, purpose: 'interactive' } }), /positive/);
  assert.throws(() => createRenderRequest({ ...r, output: { width: 1, height: 1, purpose: 'poster' } }), /purpose/);
  assert.notEqual(request(A, 1).keys.geometryKey, createPlaneRequest({ scene: A, purpose: 'interactive', width: 640, height: 360, generation: generation(1) }).keys.geometryKey, 'resolution is part of the geometry key');
  assert.equal(appearanceKeyOf(toPlaneState(A).settings), r.keys.appearanceKey);
});

test('a-b-a late completion rejected', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let revision = 1, scene = A;
  const options = () => ({ currentGeneration: () => generation(revision), liveScene: () => scene });
  const first = adapter.render(request(A, 1), options());
  revision = 2; scene = B;
  const second = adapter.render(request(B, 2), options());
  revision = 3; scene = A;
  const third = adapter.render(request(A, 3), options());
  renderer.finishNext(); renderer.finishNext(); renderer.finishNext();
  const reports = await Promise.all([first, second, third]);
  assert.deepEqual(reports.map(report => report.outcome), ['superseded', 'superseded', 'completed']);
  assert.equal(reports[0].keys.geometryKey, reports[2].keys.geometryKey, 'the late A shares the key of the current A');
  assert.equal(reports[2].generation.geometryRevision, 3);
});

test('a renderer that ignores cancellation is never adopted', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let revision = 1;
  const pending = adapter.render(request(A, 1), { currentGeneration: () => generation(revision), liveScene: () => A });
  revision = 2;
  const colorsBefore = renderer.colors().length;
  renderer.finishNext({ ignoreCurrent: true });
  const report = await pending;
  assert.equal(report.outcome, 'superseded');
  assert.equal(renderer.colors().length, colorsBefore + 1, 'only the fake renderer\'s own drawing; the adapter adopted nothing (pixel safety is the renderers\' own pre-write check)');
  assert.equal(adapter.published, null);
});

test('appearance rebind reports current request', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let scene = A;
  const original = request(A, 1);
  const pending = adapter.render(original, { currentGeneration: () => generation(1, { viewRevision: scene === A ? 1 : 2, appearanceRevision: scene === A ? 0 : 1 }), liveScene: () => scene });
  scene = auroraA;
  renderer.finishNext();
  const report = await pending;
  assert.equal(report.outcome, 'completed');
  assert.equal(renderer.colors().at(-1).palette, 'aurora', 'the published image uses the live appearance');
  assert.equal(report.sceneHash, hashOf(auroraA), 'the report describes the published scene');
  assert.notEqual(report.requestId, original.requestId, 'a new publication request, not the original');
  assert.equal(report.geometryRequestId, original.requestId, 'the geometry\'s request is recorded as provenance');
  assert.equal(report.keys.appearanceKey, appearanceKeyOf(toPlaneState(auroraA).settings));
  assert.deepEqual(report.generation, generation(1, { viewRevision: 2, appearanceRevision: 1 }));
  assert.equal(report.appearanceRebound, true);
});

test('an immediate recolor produces a current publication report', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  assert.deepEqual(adapter.recolor(auroraA, generation(0)), { status: 'applied', report: null }, 'nothing published yet');
  const original = request(A, 1);
  const pending = adapter.render(original, { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.finishNext();
  assert.equal((await pending).requestId, original.requestId);
  const { status, report } = adapter.recolor(auroraA, generation(1, { viewRevision: 2, appearanceRevision: 1 }));
  assert.equal(status, 'applied');
  assert.equal(report.sceneHash, hashOf(auroraA));
  assert.equal(report.geometryRequestId, original.requestId);
  assert.equal(report.outcome, 'completed');
  assert.equal(adapter.published.sceneHash, hashOf(auroraA));
  assert.equal(adapter.recolor(B, generation(2)).report, null, 'a different geometry is never claimed by a recolor');
});

test('successive recolors keep the geometry origin', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const original = request(A, 1);
  const pending = adapter.render(original, { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.finishNext(); await pending;
  const roseA = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 }, settings: { palette: 'rose' } });
  const first = adapter.recolor(auroraA, generation(1, { viewRevision: 2, appearanceRevision: 1 })).report;
  const second = adapter.recolor(roseA, generation(1, { viewRevision: 3, appearanceRevision: 2 })).report;
  assert.equal(first.geometryRequestId, original.requestId);
  assert.equal(second.geometryRequestId, original.requestId, 'not the previous recolor\'s request');
  assert.equal(second.sceneHash, hashOf(roseA));
});

test('identities from two runtimes sharing one store never collide', () => {
  const one = createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation: generation(1), runtimeId: 'runtime-one' });
  const two = createPlaneRequest({ scene: B, purpose: 'interactive', width: 10, height: 10, generation: generation(1), runtimeId: 'runtime-two' });
  assert.notEqual(one.requestId, two.requestId);
  assert.notEqual(one.jobId, two.jobId);
  assert.match(request(A, 1).requestId, new RegExp(RUNTIME_ID), 'the default namespace is this runtime\'s');
});

test('reports mark unavailable and inapplicable facts instead of inventing them', async () => {
  const renderer = createFakeRenderer();
  renderer.diagnostics.device = '';
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const pending = adapter.render(request(A, 1), { currentGeneration: () => generation(1), liveScene: () => A });
  renderer.finishNext();
  const report = await pending;
  assert.equal(report.environment.device, 'unavailable', 'an empty device string is unavailable, never invented');
  assert.deepEqual(report.environment.backend, { value: 'FAKE · DIRECT', source: 'renderer.mode' });
  assert.equal(report.rayTermination, 'inapplicable');
  assert.equal(report.estimator, 'inapplicable');
  assert.equal(report.timings.gpu, 'unavailable');
  assert.ok(report.timings.completed >= report.timings.admitted);
  assert.deepEqual(report.completed, { width: 320, height: 180 });
  assert.equal(report.iterations, 1024);
  assert.equal(report.appearanceRebound, false);
});

test('a failed render is reported as failed and a replaced renderer interrupts its old job', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const options = { currentGeneration: () => generation(1, { deviceEpoch: adapter.epoch }), liveScene: () => A };
  const failing = adapter.render(request(A, 1), options);
  renderer.failNext('Cannot allocate rendering surface.');
  assert.deepEqual([(await failing).outcome, (await failing).reason], ['failed', 'Cannot allocate rendering surface.']);
  const old = adapter.render(request(A, 1), options);
  adapter.replaceRenderer(createFakeRenderer());
  renderer.pending.shift().finish();
  assert.equal((await old).outcome, 'interrupted', 'a job on a replaced renderer is interrupted, never adopted');
  assert.equal(adapter.epoch, 1);
});

test('whenIdle is bounded', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  assert.equal(await adapter.whenIdle({ timeoutMs: 10 }), true);
  adapter.render(request(A, 1), { currentGeneration: () => generation(1), liveScene: () => A });
  assert.equal(await adapter.whenIdle({ timeoutMs: 10 }), false);
  renderer.finishNext(); await flush();
  assert.equal(await adapter.whenIdle({ timeoutMs: 10 }), true);
  assert.throws(() => { adapter.reserveExclusive(request(A, 2, 'export')); adapter.reserveExclusive(request(A, 2, 'export')); }, LeaseError);
});

test('a lost renderer admits nothing until it is replaced', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const generationNow = () => generation(1, { deviceEpoch: adapter.epoch });
  adapter.invalidate();
  assert.equal(adapter.unavailable, true);
  assert.throws(() => adapter.render(request(A, 1), { currentGeneration: generationNow, liveScene: () => A }), LeaseError);
  assert.deepEqual(adapter.recolor(auroraA, generationNow()), { status: 'unavailable', report: null });
  assert.throws(() => adapter.reserveExclusive(request(A, 1, 'export')), LeaseError);
  assert.equal(renderer.renders().length + renderer.colors().length, 0, 'the lost renderer was never used');
  const replacement = createFakeRenderer();
  adapter.replaceRenderer(replacement);
  assert.equal(adapter.unavailable, false);
  const live = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 32, height: 16, generation: generationNow() }), { currentGeneration: generationNow, liveScene: () => A });
  replacement.finishNext();
  assert.equal((await live).outcome, 'completed');
});

test('a context loss during an interactive render interrupts it', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const pending = adapter.render(request(A, 1), { currentGeneration: () => generation(1, { deviceEpoch: adapter.epoch }), liveScene: () => A });
  adapter.invalidate();
  renderer.finishNext();
  const report = await pending;
  assert.equal(report.outcome, 'interrupted');
  assert.equal(adapter.published, null);
});
````

**`tests/unit/renderer-guards.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The production renderers run only in a browser. These checks pin, in their source, that each
// one asks `isCurrent()` before it writes anything visible — the guard the render adapter relies
// on for pixel safety (the adapter itself only refuses to adopt a stale completion).
const source = readFileSync(new URL('../../src/plane/renderer.js', import.meta.url), 'utf8');
const method = (className, name) => {
  const start = source.indexOf(`export class ${className}`);
  const body = source.slice(start, source.indexOf('\nexport class', start + 1) === -1 ? undefined : source.indexOf('\nexport class', start + 1));
  const at = body.indexOf(`  async ${name}(`);
  assert.ok(at >= 0, `${className}.${name} exists`);
  return body.slice(at, body.indexOf('\n  }\n', at));
};

test('GpuRenderer checks isCurrent before it resizes, draws or colors', () => {
  const render = method('GpuRenderer', 'render');
  const guard = render.indexOf('if (!isCurrent()) throw superseded();');
  assert.ok(guard > 0, 'the guard exists');
  for (const write of ['this.resize(width, height);', 'gl.drawArrays(', 'this.color(settings);']) {
    assert.ok(render.indexOf(write) > guard, `${write} happens after the guard`);
  }
});

test('CpuRenderer checks isCurrent before it adopts or paints a frame', () => {
  const render = method('CpuRenderer', 'render');
  const guard = render.indexOf('if (!isCurrent()) { reject(superseded()); return; }');
  assert.ok(guard > 0, 'the guard exists');
  for (const write of ['this.data = frame;', 'this.color(this.settings);']) {
    assert.ok(render.indexOf(write) > guard, `${write} happens after the guard`);
  }
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js",
    "tests/unit/gestures.test.js",
    "tests/unit/render-adapter.test.js",
    "tests/unit/renderer-guards.test.js"
  ]
}
````

`renderer-guards.test.js` pins the production renderers' existing pre-write `isCurrent` checks (in `src/plane/renderer.js`, unchanged since T01); it passes from the start and is not part of the RED.

- [ ] **Step 2: Write the interface skeletons**

**`src/shared/render-request.js`** (complete file — interface skeleton):

````js
// T06 interface skeleton. Replaced in full by the implementation step.
export const RENDER_PURPOSES = Object.freeze(['interactive', 'export', 'instrument', 'swatch', 'thumbnail']);
export const RENDER_OUTCOMES = Object.freeze(['completed', 'superseded', 'cancelled', 'interrupted', 'failed', 'budget-exceeded']);
export const MAX_OUTPUT_DIMENSION = 16384;
export const RUNTIME_ID = 'runtime-skeleton';
export class RenderRequestError extends Error {}
export const createRenderRequest = input => ({ ...input });
export const isPublishable = () => false;
````

**`src/shared/render-report.js`** (complete file — interface skeleton):

````js
// T06 interface skeleton. Replaced in full by the implementation step.
export const UNAVAILABLE = 'unavailable';
export const INAPPLICABLE = 'inapplicable';
export const PLANE_INAPPLICABLE_FIELDS = Object.freeze({});
export const observed = () => UNAVAILABLE;
export const createReportBuilder = () => ({ mark() {}, finish: () => ({}) });
````

**`src/plane/render-adapter.js`** (complete file — interface skeleton):

````js
// T06 interface skeleton. Replaced in full by the implementation step.
export class LeaseError extends Error {}
export const createPlaneRequest = () => ({});
export const appearanceKeyOf = () => '';
export function createPlaneRenderAdapter() {
  const nothing = () => {};
  return Object.freeze({ render: async () => ({}), recolor: () => ({ status: 'applied', report: null }), cancelInteractive: nothing, whenIdle: async () => true, reserveExclusive: () => ({}), reserved: false, retired: false, epoch: 0, renderer: null, published: null, replaceRenderer: nothing });
}
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/render-adapter.test.js --expect-fail "render requests are frozen, validated and publishable only while every revision matches"
```
Expected: `RED confirmed: "render requests are frozen, validated and publishable only while every revision matches" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the implementation (replacing the skeletons)**

**`src/shared/render-request.js`** (complete file):

````js
// Immutable render requests (spec §7.1, §7.2). Revisions are execution identities;
// keys identify resolved pass inputs. Equal keys never make a stale request publishable.
import { deepFreeze, isPlainObject } from './scene.js';

export const RENDER_PURPOSES = Object.freeze(['interactive', 'export', 'instrument', 'swatch', 'thumbnail']);

// A namespace created synchronously once per page or process, so request, job and report
// identities stay distinct across reloads and tabs that share one store.
export const RUNTIME_ID = globalThis.crypto?.randomUUID?.() ?? `runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const MAX_OUTPUT_DIMENSION = 16384;
const REVISIONS = ['deviceEpoch', 'viewRevision', 'geometryRevision', 'appearanceRevision'];

export class RenderRequestError extends Error {
  constructor(message) { super(message); this.name = 'RenderRequestError'; this.code = 'invalid-render-request'; }
}

const requireString = (value, name) => { if (typeof value !== 'string' || !value) throw new RenderRequestError(`${name} must be a non-empty string`); return value; };
const requireCount = (value, name, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new RenderRequestError(`${name} must be an integer from 0 to ${max}`);
  return value;
};

export function createRenderRequest({ requestId, jobId, viewId, sceneSnapshot, sceneHash, output, quality, generation, keys }) {
  if (!isPlainObject(sceneSnapshot)) throw new RenderRequestError('sceneSnapshot must be a scene');
  if (!RENDER_PURPOSES.includes(output?.purpose)) throw new RenderRequestError(`output.purpose must be one of ${RENDER_PURPOSES.join(', ')}`);
  const width = requireCount(output.width, 'output.width', MAX_OUTPUT_DIMENSION);
  const height = requireCount(output.height, 'output.height', MAX_OUTPUT_DIMENSION);
  if (!width || !height) throw new RenderRequestError('output dimensions must be positive');
  if (!isPlainObject(quality)) throw new RenderRequestError('quality must be an object');
  const frozenGeneration = {};
  for (const name of REVISIONS) frozenGeneration[name] = requireCount(generation?.[name], `generation.${name}`);
  return deepFreeze({
    requestId: requireString(requestId, 'requestId'), jobId: requireString(jobId, 'jobId'), viewId: requireString(viewId, 'viewId'),
    sceneSnapshot, sceneHash: requireString(sceneHash, 'sceneHash'),
    output: { width, height, purpose: output.purpose },
    quality: structuredClone(quality),
    generation: frozenGeneration,
    keys: { geometryKey: requireString(keys?.geometryKey, 'keys.geometryKey'), appearanceKey: requireString(keys?.appearanceKey, 'keys.appearanceKey') },
  });
}

// Publishable only if the device epoch, view revision and dependency revisions all still match.
export function isPublishable(request, current) {
  return REVISIONS.every(name => request.generation[name] === current[name]);
}

export const RENDER_OUTCOMES = Object.freeze(['completed', 'superseded', 'cancelled', 'interrupted', 'failed', 'budget-exceeded']);
````

**`src/shared/render-report.js`** (complete file):

````js
// Render reports (spec §7.4). Unavailable facts are marked unavailable, and fields that
// do not apply to a workspace are marked inapplicable rather than invented.
import { deepFreeze } from './scene.js';
import { RENDER_OUTCOMES } from './render-request.js';

export const UNAVAILABLE = 'unavailable';
export const INAPPLICABLE = 'inapplicable';
const EVENTS = Object.freeze(['admitted', 'submitted', 'completed', 'published', 'readback']);

// An identity field is { value, source } when observed, or 'unavailable'.
export function observed(value, source) {
  return typeof value === 'string' && value.trim() ? { value, source } : UNAVAILABLE;
}

let reportCounter = 0;

export function createReportBuilder(request, { implementation, environment = {}, workspaceFields = {}, clock }) {
  if (typeof clock !== 'function') throw new TypeError('createReportBuilder requires a clock');
  const requestedAt = clock();
  const marks = {};
  let finished = null;
  return Object.freeze({
    mark(event) {
      if (!EVENTS.includes(event)) throw new RangeError(`unknown report event ${event}`);
      if (marks[event] === undefined) marks[event] = clock() - requestedAt;
    },
    // `publication`: when completed geometry is published under a newer request (an appearance
    // edit), the report describes that request — the published scene — and records the request
    // that computed the geometry as `geometryRequestId`.
    finish(outcome, { reason = '', completed = null, publication = null, details = {} } = {}) {
      if (finished) return finished;
      if (!RENDER_OUTCOMES.includes(outcome)) throw new RangeError(`unknown outcome ${outcome}`);
      const described = publication ?? request;
      finished = deepFreeze({
        reportId: `report-${described.requestId}-${++reportCounter}`,
        sceneHash: described.sceneHash, requestId: described.requestId, jobId: described.jobId, viewId: described.viewId,
        geometryRequestId: request.requestId,
        purpose: described.output.purpose, model: { ...described.sceneSnapshot.model }, implementation,
        environment: { backend: environment.backend ?? UNAVAILABLE, browser: environment.browser ?? UNAVAILABLE, device: environment.device ?? UNAVAILABLE },
        requested: { width: described.output.width, height: described.output.height, quality: described.quality },
        completed, outcome, reason,
        keys: { ...described.keys },
        appearanceRebound: described !== request,
        generation: described.generation,
        timings: { clock: 'page-performance-now', ...marks, gpu: UNAVAILABLE },
        ...workspaceFields, ...details,
      });
      return finished;
    },
  });
}

// Fields a Plane report never manufactures (spec §7.4).
export const PLANE_INAPPLICABLE_FIELDS = Object.freeze({
  rayTermination: INAPPLICABLE, unavailableNormals: INAPPLICABLE, estimator: INAPPLICABLE, samples: INAPPLICABLE,
});
````

**`src/plane/render-adapter.js`** (complete file):

````js
// The only route to Plane's renderer (spec §7, §14). It wraps GpuRenderer/CpuRenderer
// unchanged, turns each render into an outcome and a report, and grants an exclusive lease
// for exports. Scheduling and cadence stay in the Plane workspace.
//
// Every publication belongs to a complete immutable request describing the published scene:
// completed geometry shown with a newer appearance is reported under a new publication request
// that names the request which computed the geometry (`geometryRequestId`), however many recolors
// follow. Publication is checked here, after the renderer finishes: the adapter never adopts a
// stale completion. (A renderer that draws without checking can still change pixels; the
// production renderers check `isCurrent` before they write — tests/unit/renderer-guards.test.js.)
import { createReportBuilder, observed, PLANE_INAPPLICABLE_FIELDS } from '../shared/render-report.js';
import { createRenderRequest, isPublishable, RUNTIME_ID } from '../shared/render-request.js';
import { fnv1a64, canonicalJson } from '../shared/scene.js';
import { toPlaneState, sceneCodec, planeDependencies } from './scene-adapter.js';

let requestCounter = 0;

// A frozen Plane request. The geometry key includes the output size, because the rendered
// field depends on it; the appearance key covers palette, phase, frequency and relief.
// Identities carry the runtime namespace, so they never collide across reloads or tabs.
export function createPlaneRequest({ scene, purpose, width, height, generation, viewId = 'plane-main', runtimeId = RUNTIME_ID }) {
  const n = ++requestCounter;
  const dependencies = planeDependencies(scene);
  return createRenderRequest({
    requestId: `plane-${purpose}-${runtimeId}-${n}`, jobId: `plane-job-${runtimeId}-${n}`, viewId,
    sceneSnapshot: scene, sceneHash: sceneCodec.fingerprint(scene).sceneHash,
    output: { width, height, purpose },
    quality: { iterations: toPlaneState(scene).settings.iterations, fullResolution: purpose === 'export' },
    generation,
    keys: { geometryKey: fnv1a64(`${dependencies.geometry}|${width}x${height}`), appearanceKey: fnv1a64(dependencies.appearance) },
  });
}

// The same key createPlaneRequest derives from a scene's appearance.
export const appearanceKeyOf = ({ palette, phase, frequency, relief }) => fnv1a64(canonicalJson({ palette, phase, frequency, relief }));

export class LeaseError extends Error {
  constructor(message) { super(message); this.name = 'LeaseError'; this.code = 'renderer-unavailable'; }
}

function bounded(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise.then(value => ({ settled: true, value }), error => ({ settled: true, error })),
    new Promise(resolve => { timer = setTimeout(() => resolve({ settled: false }), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

// Geometry stays publishable while the device epoch and geometry revision match; appearance
// edits do not invalidate it (they are rebound at publication).
const geometryCurrent = (request, generation) => generation.deviceEpoch === request.generation.deviceEpoch && generation.geometryRevision === request.generation.geometryRevision;

export function createPlaneRenderAdapter({ renderer, clock }) {
  if (typeof clock !== 'function') throw new TypeError('createPlaneRenderAdapter requires a clock');
  // published: { request (the current publication), geometry (the request that computed it) } | null
  // unavailable: the graphics context was lost and the renderer has not been replaced yet.
  let current = renderer, epoch = 0, losses = 0, retired = false, unavailable = false, inFlight = null, lease = null, deferredScene = null, published = null;

  const environment = () => ({
    backend: observed(current.mode, 'renderer.mode'),
    device: observed(current.diagnostics?.device, current.gl ? 'WebGL renderer string' : 'CPU fallback diagnostics'),
    browser: observed(globalThis.navigator?.userAgent, 'navigator.userAgent'),
  });
  const builderFor = request => createReportBuilder(request, {
    implementation: current.gl ? 'plane-webgl2-v1' : 'plane-cpu-v1', environment: environment(),
    workspaceFields: { ...PLANE_INAPPLICABLE_FIELDS, iterations: toPlaneState(request.sceneSnapshot).settings.iterations }, clock,
  });
  // The request a publication belongs to: the original, or a newer one with the live appearance.
  function publicationFor(request, scene, generation) {
    if (sceneCodec.equal(scene, request.sceneSnapshot) && isPublishable(request, generation)) return request;
    return createPlaneRequest({ scene, purpose: request.output.purpose, width: request.output.width, height: request.output.height, generation, viewId: request.viewId });
  }

  function requireUsable() {
    if (retired) throw new LeaseError('the renderer was retired after a timeout; replace it first');
    if (unavailable) throw new LeaseError('the graphics context was lost; the renderer is unavailable until it is replaced');
  }

  // Interactive render. `currentGeneration()` and `liveScene()` describe the workspace now;
  // `isCurrent()` is the workspace's own cadence check.
  function render(request, { isCurrent = () => true, currentGeneration, liveScene }) {
    requireUsable();
    if (lease) throw new LeaseError('the renderer is reserved for an export');
    const builder = builderFor(request), myEpoch = epoch, renderer = current;
    const { view, settings } = toPlaneState(request.sceneSnapshot);
    const stillCurrent = () => myEpoch === epoch && isCurrent() && geometryCurrent(request, currentGeneration());
    builder.mark('admitted');
    const run = (async () => {
      try {
        builder.mark('submitted');
        await renderer.render(view, settings, request.output.width, request.output.height, false, stillCurrent);
        builder.mark('completed');
        if (myEpoch !== epoch) return builder.finish('interrupted', { reason: 'the renderer was replaced during the render' });
        if (!stillCurrent()) return builder.finish('superseded', { reason: 'completed after a newer view was requested; not adopted' });
        const scene = liveScene();
        if (planeDependencies(scene).geometry !== planeDependencies(request.sceneSnapshot).geometry) return builder.finish('superseded', { reason: 'the live geometry changed; not adopted' });
        const publication = publicationFor(request, scene, currentGeneration());
        renderer.color(toPlaneState(scene).settings);
        builder.mark('published');
        published = { request: publication, geometry: request };
        return builder.finish('completed', { completed: { width: renderer.canvas.width, height: renderer.canvas.height }, publication: publication === request ? null : publication });
      } catch (error) {
        if (myEpoch !== epoch) return builder.finish('interrupted', { reason: 'the graphics context was lost or the renderer replaced during the render' });
        if (error?.name === 'AbortError') return builder.finish('superseded', { reason: 'a newer view was requested' });
        return builder.finish('failed', { reason: error?.message || String(error) });
      }
    })();
    const tracked = run.finally(() => { if (inFlight === tracked) inFlight = null; });
    inFlight = tracked;
    return run;
  }

  // An appearance edit on the published geometry. → { status: 'applied', report } (a completed
  // report for the new publication), { status: 'deferred' } during an export lease, or
  // { status: 'retired' }. Before anything is published, it only recolors.
  function recolor(scene, generation) {
    if (lease) { deferredScene = scene; return { status: 'deferred', report: null }; }
    if (retired) return { status: 'retired', report: null };
    if (unavailable) return { status: 'unavailable', report: null };
    current.color(toPlaneState(scene).settings);
    if (!published || planeDependencies(scene).geometry !== planeDependencies(published.geometry.sceneSnapshot).geometry) return { status: 'applied', report: null };
    const geometryRequest = published.geometry;
    const publication = createPlaneRequest({ scene, purpose: 'interactive', width: current.canvas.width, height: current.canvas.height, generation, viewId: geometryRequest.viewId });
    const builder = builderFor(geometryRequest);
    builder.mark('published');
    published = { request: publication, geometry: geometryRequest };
    return { status: 'applied', report: builder.finish('completed', { completed: { width: current.canvas.width, height: current.canvas.height }, publication, reason: 'appearance applied to completed geometry' }) };
  }

  function cancelInteractive() { if (!lease) current.cancel?.(); }

  async function whenIdle({ timeoutMs }) {
    if (!inFlight) return true;
    return (await bounded(inFlight, timeoutMs)).settled;
  }

  function retire() { retired = true; epoch++; published = null; }

  // Synchronous: called before the export's first await, so no live work can slip ahead.
  function reserveExclusive(request) {
    requireUsable();
    if (lease) throw new LeaseError('an export already holds the renderer');
    const own = { request }, reservedEpoch = epoch, reservedLosses = losses;
    lease = own;
    const active = () => { if (lease !== own) throw new LeaseError('this lease was released'); };
    return Object.freeze({
      request,
      get canvas() { return current.canvas; },
      // false once the device was lost or the renderer retired since reservation.
      current: () => epoch === reservedEpoch && !retired,
      // true once the graphics context was lost since reservation (a cause, distinct from retirement).
      lost: () => losses !== reservedLosses,
      // A report builder for the whole export job, started now (at reservation).
      jobReport: builderFor(request),
      async admit({ timeoutMs }) {
        active();
        if (!inFlight) return { ok: true };
        const settled = (await bounded(inFlight, timeoutMs)).settled;
        if (!settled) { retire(); return { ok: false, reason: 'the interactive render did not drain in time; the renderer was retired' }; }
        return { ok: true };
      },
      // The render stage alone; the export job's own report is produced by plane/export.js.
      async render({ timeoutMs }) {
        active(); requireUsable();
        const builder = builderFor(request), renderer = current, myEpoch = epoch;
        const { view, settings } = toPlaneState(request.sceneSnapshot);
        builder.mark('admitted'); builder.mark('submitted');
        const outcome = await bounded(renderer.render(view, settings, request.output.width, request.output.height, true, () => myEpoch === epoch), timeoutMs);
        if (!outcome.settled) { retire(); return builder.finish('interrupted', { reason: 'the export render exceeded its time limit; the renderer was retired' }); }
        // The captured epoch is checked before the result is classified or anything is colored.
        if (myEpoch !== epoch) return builder.finish('interrupted', { reason: 'the graphics context was lost during the export render' });
        if (outcome.error) return builder.finish(outcome.error.name === 'AbortError' ? 'interrupted' : 'failed', { reason: outcome.error.message });
        builder.mark('completed');
        renderer.color(settings);
        builder.mark('published');
        published = null; // the canvas now shows the export, not an interactive publication
        return builder.finish('completed', { completed: { width: renderer.canvas.width, height: renderer.canvas.height } });
      },
      retire() { active(); retire(); },
      // → the latest live scene deferred during the lease, or null.
      release() {
        if (lease !== own) return null;
        lease = null;
        const scene = deferredScene;
        deferredScene = null;
        return scene;
      },
    });
  }

  // A lost graphics context: nothing rendered before it is publishable, an export holding the lease
  // can no longer complete, and nothing — render, recolor or export — may use the renderer until
  // replaceRenderer(). Releasing a lease does not restore it.
  function invalidate() { epoch++; losses++; published = null; unavailable = true; }

  return Object.freeze({
    render, recolor, cancelInteractive, whenIdle, reserveExclusive, invalidate,
    get reserved() { return lease !== null; },
    get retired() { return retired; },
    get unavailable() { return unavailable; },
    get epoch() { return epoch; },
    get renderer() { return current; },
    // The request the canvas currently shows (null after an export, a loss or a replacement).
    get published() { return published?.request ?? null; },
    replaceRenderer(next) { if (lease) throw new LeaseError('cannot replace the renderer during an export'); current = next; retired = false; unavailable = false; epoch++; inFlight = null; published = null; },
  });
}
````

- [ ] **Step 5: Run the unit tests**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"82 tests passed","files":9,…}` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/render-request.js src/shared/render-report.js src/plane/render-adapter.js tests/support/fake-renderer.mjs tests/unit/render-adapter.test.js tests/unit/renderer-guards.test.js tests/unit.manifest.json
git commit -m "Add immutable render requests, truthful reports and the Plane render adapter"
```

- [ ] **Step 7: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 8: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T07: Immutable exclusive export (spec §14)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** T06.

**Files:**
- Create: `src/plane/export.js`
- Modify: `tests/unit.manifest.json`
- Test: `tests/unit/export.test.js`

**Interfaces:**
- Consumes: `createPlaneRenderAdapter`, `createPlaneRequest`, the lease API (T06).
- Produces: `EXPORT_LIMITS = {admissionMs: 60000, renderMs: 120000, encodeMs: 30000}`, `EXPORT_STAGES`; `startExport({adapter, request, encode, limits?, hooks?}) → {request, done: Promise<{outcome, reason, blob?, report, renderReport?, request, deferredScene}>}`. `startExport` reserves the renderer synchronously; the caller builds `request` synchronously before calling it. `report` is the export job's report, begun at reservation and always matching `outcome`; `renderReport` is the render stage's. `hooks` (tests only): `stage(name)` at `reserved`, `admission`, `render-submitted`, `encoding`, `finished`; `hold(name)` may delay `admission` or `encoding` within their limits. A render or encoding timeout retires the renderer; the caller must replace it.

**Design assertions:**
- Spec §14: the complete request is captured and the renderer reserved before the first asynchronous wait; edits while admission waits, while the export render is pending and while encoding is pending change only the live scene (`export freezes before admission`, `an edit while the export render is pending changes nothing`, `export holds lease through encoding`).
- Every stop is classified and reported: admission timeout, render timeout, encoding failure, device loss and success each produce a job report whose outcome matches (`an admission timeout is an interrupted export with its own report`, `an encoding failure is a failed export whose report says failed`, `a device loss while encoding interrupts the export, discards the image and releases the lease`, `a device loss during the export render interrupts it`, `an encoder rejection after a device loss is interrupted, not failed`, `a loss during the export render followed by an ordinary rejection is interrupted`, `a loss followed by a non-cooperative completion is interrupted and never recolored`); a timed-out renderer is retired, never reused, and a timeout reports its own cause (`an encoding timeout without a device loss reports the timeout, not a loss`); no renderer is replaced while the lease is held, and releasing the lease does not restore a lost one.

- [ ] **Step 1: Write the failing tests**

**`tests/unit/export.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaneRenderAdapter, createPlaneRequest, LeaseError } from '../../src/plane/render-adapter.js';
import { startExport } from '../../src/plane/export.js';
import { createPlaneScene } from '../../src/plane/scene-adapter.js';
import { createFakeRenderer, flush } from '../support/fake-renderer.mjs';

const A = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: 0 }, settings: { palette: 'ember' } });
const B = createPlaneScene({ view: { re: '-0.7', im: '0.1', zoom: 2 }, settings: { palette: 'aurora', detail: 4 } });
const clock = (() => { let t = 0; return () => (t += 1); })();
const generation = { deviceEpoch: 0, viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 };
const interactive = { currentGeneration: () => generation, liveScene: () => A };
const limits = { admissionMs: 200, renderMs: 200, encodeMs: 200 };
const exportOf = (scene, width = 1920, height = 1080) => createPlaneRequest({ scene, purpose: 'export', width, height, generation });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
// Edits a test makes while the export holds the renderer: a palette change and a new view.
function edit(adapter) {
  assert.equal(adapter.recolor(B, generation).status, 'deferred');
  assert.throws(() => adapter.render(createPlaneRequest({ scene: B, purpose: 'interactive', width: 640, height: 360, generation }), { currentGeneration: () => generation, liveScene: () => B }), LeaseError);
}
function assertExportedA(renderer, result, request) {
  const exportRender = renderer.renders().at(-1);
  assert.deepEqual(exportRender.view, { re: '-0.5', im: '0', zoom: 0 }, "the export renders A's geometry");
  assert.deepEqual([exportRender.width, exportRender.height, exportRender.fullResolution], [request.output.width, request.output.height, true]);
  assert.ok(renderer.colors().every(settings => settings.palette === 'ember'), 'no B appearance reached the renderer during the lease');
  assert.equal(result.report.sceneHash, request.sceneHash);
  assert.equal(result.report.outcome, result.outcome);
  assert.equal(result.deferredScene, B, 'the latest live edit is handed back on release');
}

test('export freezes before admission', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 320, height: 180, generation }), interactive);
  const request = exportOf(A);
  const stages = [];
  const { done } = startExport({ adapter, request, encode: async canvas => ({ bytes: `${canvas.width}x${canvas.height}` }), limits, hooks: { stage: name => stages.push(name) } });
  assert.equal(adapter.reserved, true, 'the renderer is reserved synchronously');
  assert.deepEqual(stages, ['reserved', 'admission']);
  edit(adapter);
  renderer.finishNext(); await flush(); await flush();
  renderer.finishNext();
  const result = await done;
  assert.equal(result.outcome, 'completed');
  assertExportedA(renderer, result, request);
  assert.deepEqual(result.blob, { bytes: '1920x1080' });
  assert.equal(adapter.reserved, false);
});

test('an edit while the export render is pending changes nothing', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const request = exportOf(A, 800, 450);
  let reached = false;
  const { done } = startExport({ adapter, request, encode: async () => ({ bytes: 'A' }), limits, hooks: { stage: name => { if (name === 'render-submitted') reached = true; } } });
  await flush(); await flush();
  assert.equal(reached, true, 'the export render was submitted');
  assert.equal(renderer.pending.length, 1, 'and is still pending');
  edit(adapter);
  renderer.finishNext();
  const result = await done;
  assert.equal(result.outcome, 'completed');
  assertExportedA(renderer, result, request);
});

test('export holds lease through encoding', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const encoding = deferred();
  const request = exportOf(A, 800, 450);
  const stages = [];
  const { done } = startExport({ adapter, request, encode: () => encoding.promise, limits: { ...limits, encodeMs: 1000 }, hooks: { stage: name => stages.push(name) } });
  await flush();
  renderer.finishNext(); await flush(); await flush();
  assert.equal(stages.at(-1), 'encoding');
  const colorsBefore = renderer.colors().length;
  edit(adapter);
  assert.equal(adapter.reserved, true, 'the lease covers encoding');
  assert.equal(renderer.colors().length, colorsBefore, 'nothing recolored the canvas being encoded');
  encoding.resolve({ bytes: 'A' });
  const result = await done;
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(result.blob, { bytes: 'A' });
  assertExportedA(renderer, result, request);
  assert.equal(result.renderReport.outcome, 'completed');
  assert.notEqual(result.report.reportId, result.renderReport.reportId, 'the job report is not the render-stage report');
});

test('an export render that never finishes retires the renderer and reports interrupted', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({}), limits: { ...limits, renderMs: 20 } });
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome], ['interrupted', 'interrupted']);
  assert.match(result.reason, /retired/);
  assert.equal(adapter.retired, true);
  assert.equal(adapter.reserved, false);
  assert.throws(() => adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive), LeaseError, 'a retired renderer is never reused');
  adapter.replaceRenderer(createFakeRenderer());
  assert.equal(adapter.retired, false);
});

test('an admission timeout is an interrupted export with its own report', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive);
  const request = exportOf(A, 100, 50);
  const { done } = startExport({ adapter, request, encode: async () => ({}), limits: { ...limits, admissionMs: 20 } });
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome], ['interrupted', 'interrupted']);
  assert.equal(result.report.requestId, request.requestId);
  assert.equal(renderer.renders().length, 1, 'the export never rendered');
  assert.equal(adapter.retired, true);
});

test('an encoding failure is a failed export whose report says failed', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  for (const encode of [async () => null, async () => { throw new Error('encoder crashed'); }]) {
    const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode, limits });
    await flush(); renderer.finishNext();
    const result = await done;
    assert.deepEqual([result.outcome, result.report.outcome], ['failed', 'failed']);
    assert.equal(result.renderReport.outcome, 'completed', 'the render stage itself completed');
    assert.equal(adapter.reserved, false);
  }
});

test('a device loss while encoding interrupts the export, discards the image and releases the lease', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const encoding = deferred();
  const stages = [];
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: () => encoding.promise, limits: { ...limits, encodeMs: 1000 }, hooks: { stage: name => stages.push(name) } });
  await flush(); renderer.finishNext(); await flush(); await flush();
  assert.equal(stages.at(-1), 'encoding');
  adapter.invalidate();
  assert.throws(() => adapter.replaceRenderer(createFakeRenderer()), LeaseError, 'no replacement while the export holds the lease');
  encoding.resolve({ bytes: 'stale' });
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome, result.blob], ['interrupted', 'interrupted', undefined]);
  assert.equal(adapter.reserved, false);
  assert.throws(() => adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation }), interactive), LeaseError, 'releasing the lease does not restore a lost renderer');
  const replacement = createFakeRenderer();
  adapter.replaceRenderer(replacement);
  const live = adapter.render(createPlaneRequest({ scene: A, purpose: 'interactive', width: 10, height: 10, generation: { ...generation, deviceEpoch: adapter.epoch } }), { currentGeneration: () => ({ ...generation, deviceEpoch: adapter.epoch }), liveScene: () => A });
  replacement.finishNext();
  assert.equal((await live).outcome, 'completed', 'live rendering resumes on the replacement');
});

test('a device loss during the export render interrupts it', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({ bytes: 'x' }), limits });
  await flush(); await flush();
  adapter.invalidate();
  renderer.finishNext();
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome], ['interrupted', 'interrupted']);
  assert.equal(adapter.reserved, false);
});

test('an encoder rejection after a device loss is interrupted, not failed', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  let reject;
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: () => new Promise((_, fail) => { reject = fail; }), limits: { ...limits, encodeMs: 1000 } });
  await flush(); renderer.finishNext(); await flush(); await flush();
  adapter.invalidate();
  reject(new Error('canvas lost'));
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome, result.blob], ['interrupted', 'interrupted', undefined]);
});

test('a loss during the export render followed by an ordinary rejection is interrupted', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({ bytes: 'x' }), limits });
  await flush(); await flush();
  adapter.invalidate();
  renderer.failNext('GL_OUT_OF_MEMORY');
  const result = await done;
  assert.deepEqual([result.outcome, result.report.outcome, result.renderReport.outcome], ['interrupted', 'interrupted', 'interrupted']);
  assert.match(result.reason, /lost/);
});

test('a loss followed by a non-cooperative completion is interrupted and never recolored', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: async () => ({ bytes: 'x' }), limits });
  await flush(); await flush();
  adapter.invalidate();
  const colorsBefore = renderer.colors().length;
  renderer.finishNext({ ignoreCurrent: true });
  const result = await done;
  assert.equal(renderer.colors().length, colorsBefore + 1, 'only the fake renderer\'s own drawing; the adapter colored nothing');
  assert.deepEqual([result.outcome, result.renderReport.outcome, result.blob], ['interrupted', 'interrupted', undefined]);
});

test('an encoding timeout without a device loss reports the timeout, not a loss', async () => {
  const renderer = createFakeRenderer();
  const adapter = createPlaneRenderAdapter({ renderer, clock });
  const { done } = startExport({ adapter, request: exportOf(A, 100, 50), encode: () => new Promise(() => {}), limits: { ...limits, encodeMs: 20 } });
  await flush(); renderer.finishNext();
  const result = await done;
  assert.equal(result.outcome, 'interrupted');
  assert.match(result.reason, /image encoding exceeded its time limit/);
  assert.doesNotMatch(result.reason, /lost/);
  assert.equal(adapter.retired, true);
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js",
    "tests/unit/gestures.test.js",
    "tests/unit/render-adapter.test.js",
    "tests/unit/renderer-guards.test.js",
    "tests/unit/export.test.js"
  ]
}
````

- [ ] **Step 2: Write the interface skeleton**

**`src/plane/export.js`** (complete file — interface skeleton):

````js
// T07 interface skeleton. Replaced in full by the implementation step.
export const EXPORT_LIMITS = Object.freeze({ admissionMs: 60_000, renderMs: 120_000, encodeMs: 30_000 });
export const EXPORT_STAGES = Object.freeze(['reserved', 'admission', 'render-submitted', 'encoding', 'finished']);
export const startExport = ({ request }) => ({ request, done: Promise.resolve({ outcome: 'failed', reason: 'not implemented', request, deferredScene: null }) });
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/export.test.js --expect-fail "export freezes before admission"
```
Expected: `RED confirmed: "export freezes before admission" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the implementation (replacing the skeleton)**

**`src/plane/export.js`** (complete file):

````js
// Immutable Plane image export (spec §14). The request is captured and the renderer reserved
// synchronously, before the first asynchronous wait. The lease covers admission, rendering,
// coloring and encoding; live edits during it change only the live scene.
// The export job reports from reservation to its terminal stage: every outcome — admission,
// render or encoding failure, or success — has a job report that matches it. The render
// stage's own report is kept separately as `renderReport`.
export const EXPORT_LIMITS = Object.freeze({ admissionMs: 60_000, renderMs: 120_000, encodeMs: 30_000 });
export const EXPORT_STAGES = Object.freeze(['reserved', 'admission', 'render-submitted', 'encoding', 'finished']);

class ExportTimeout extends Error {
  constructor(stage) { super(`${stage} exceeded its time limit`); this.name = 'ExportTimeout'; }
}
function within(promise, ms, stage) {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new ExportTimeout(stage)), ms); })]).finally(() => clearTimeout(timer));
}

// hooks (tests and diagnostics only): stage(name) is called synchronously as each stage
// begins; hold(name) may return a promise the stage waits for (bounded by that stage's limit).
// → { request, done: Promise<{ outcome, reason, blob?, report, renderReport?, request, deferredScene }> }
export function startExport({ adapter, request, encode, limits = EXPORT_LIMITS, hooks = {} }) {
  const lease = adapter.reserveExclusive(request);
  const job = lease.jobReport;
  const stage = name => hooks.stage?.(name);
  stage('reserved');
  const done = (async () => {
    let result, renderReport = null;
    const finish = (outcome, reason, extra = {}) => ({ outcome, reason, ...extra, report: job.finish(outcome, { reason, completed: renderReport?.completed ?? null, details: { renderReportId: renderReport?.reportId ?? null } }) });
    const LOST = 'the graphics device was lost during the export; nothing was published';
    try {
      stage('admission');
      await within(Promise.resolve(hooks.hold?.('admission')), limits.admissionMs, 'admission');
      const admitted = await lease.admit({ timeoutMs: limits.admissionMs });
      if (lease.lost()) result = finish('interrupted', LOST);
      else if (!admitted.ok) result = finish('interrupted', admitted.reason);
      else {
        job.mark('admitted'); job.mark('submitted');
        const rendering = lease.render({ timeoutMs: limits.renderMs });
        stage('render-submitted');
        renderReport = await rendering;
        // Lease validity is checked before a returned render outcome is adopted.
        if (lease.lost()) result = finish('interrupted', LOST, { renderReport });
        else if (renderReport.outcome !== 'completed') result = finish(renderReport.outcome, renderReport.reason, { renderReport });
        else if (!lease.current()) result = finish('interrupted', 'the renderer was retired during the export', { renderReport });
        else {
          job.mark('completed');
          stage('encoding');
          try {
            const blob = await within((async () => { await hooks.hold?.('encoding'); return encode(lease.canvas); })(), limits.encodeMs, 'image encoding');
            if (lease.lost()) result = finish('interrupted', LOST, { renderReport });
            else if (blob) { job.mark('published'); result = finish('completed', '', { blob, renderReport }); }
            else result = finish('failed', 'Image export is unavailable.', { renderReport });
          } catch (error) {
            const lost = lease.lost();
            if (error instanceof ExportTimeout) lease.retire();
            result = lost ? finish('interrupted', LOST, { renderReport }) : finish(error instanceof ExportTimeout ? 'interrupted' : 'failed', error.message, { renderReport });
          }
        }
      }
    } catch (error) {
      const lost = lease.lost();
      if (error instanceof ExportTimeout) lease.retire();
      result = lost ? finish('interrupted', LOST, { renderReport }) : finish(error instanceof ExportTimeout ? 'interrupted' : 'failed', error?.message || String(error), { renderReport });
    }
    stage('finished');
    return { ...result, request, deferredScene: lease.release() };
  })();
  return { request, done };
}
````

- [ ] **Step 5: Run the unit tests**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"94 tests passed","files":10,…}` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/plane/export.js tests/unit/export.test.js tests/unit.manifest.json
git commit -m "Add the immutable, exclusive Plane image export"
```

- [ ] **Step 7: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 8: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T08: Checkpoint 2: every render and the export through the adapter

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** T05, T07.

Second `src/app.js` version. `flushRender` keeps its busy/dirty/version cadence and builds a frozen request; the adapter is the only caller of `render()` and `color()`, and an appearance edit's recolor yields the report `lastReport` keeps, so `lastReport` always describes the image on the canvas. A resize advances the geometry revision. The export handler captures the scene, the dimensions and the request and reserves the renderer before its first `await` — replacing the old `while (busy)` polling loop. A lost context makes the renderer unavailable (no render, recolor or export until replacement; edits keep the latest desired scene); restoration waits for any export lease, and replacement assigns the new renderer to the adapter before the old one is destroyed, so the workspace and the adapter always share one renderer. The browser checks export the same view twice on WebGL and on the CPU fallback; the second time three phases are witnessed before the page edits the scene: admission held by a hook, the export render pending on a held worker message (the view is switched away and back first so the export misses the reference cache), and encoding held by a hook. The decoded RGBA pixels (compared in the page), the dimensions, the frozen scene and the job report must match. A further check loses the WebGL context while encoding is held, in both orders — restoration before the lease is released, and release before restoration — witnessing the loss and restoration events and asserting that nothing renders or publishes in the gap.

**Files:**
- Modify (whole files): `src/app.js`, `tests/workflow.mjs`, `tests/suites.manifest.json`

**Interfaces:**
- Consumes: `createPlaneRenderAdapter`, `createPlaneRequest`, `appearanceKeyOf` (T06); `startExport` (T07).
- Produces: `window.atlas.lastReport` (the report of the current publication), `window.atlas.lastExport` (`{outcome, reason, sceneHash, scene, report, renderReport}`), `atlas.lastExportImageData() → ImageData` (the decoded last export, for in-page comparison), `atlas.setExportHooks(hooks)` (test seam, next exports only), `atlas.rendererConsistent`; `atlas.renderer` now returns `adapter.renderer`.

**Design assertions:**
- Spec §7.4 and §14 in the page: Plane adopts requests, outcomes and reports without changing cadence (existing navigation and browser suites); the witnessed export races, on WebGL and CPU (`An edit during a WebGL export does not change the exported image`, `An edit during a CPU export does not change the exported image`); a context loss during an export (`A context loss during an export interrupts it and live rendering resumes`).
- Browser-only acceptance: this wiring has no Node RED; its first execution is the gate.

- [ ] **Step 1: Write the browser checks first**

**`tests/workflow.mjs`** (complete file):

````js
// Project 1a workflows in a real browser (SwiftShader WebGL, headless): native scenes,
// undo and camera history, startup and invalid links. GREEN only: never part of a RED run.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('workflow');
await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const reportPath = 'artifacts/workflow-report.json';
const report = [], errors = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const INITIAL = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };
let server, browser;

async function open(context, hash = '') {
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${url}/${hash}`, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  return page;
}
const state = page => ev(page, () => ({ scene: atlas.scene, history: atlas.history, rendered: atlas.rendered }));
const VIEW_B = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4.2 };
const VIEW_C = { re: '0.276', im: '0.008', zoom: 2.4 };
const VIEW_D = { re: '-1.762', im: '0', zoom: 1.6 };

// Installed on every context that runs the export checks: while `__holdWorkers` is set, messages
// to workers (reference orbits, CPU tiles) are queued until `__releaseWorkers()`.
const holdWorkersScript = () => {
  const post = Worker.prototype.postMessage;
  window.__heldWorkerMessages = [];
  Worker.prototype.postMessage = function (...args) {
    if (window.__holdWorkers) { window.__heldWorkerMessages.push(() => post.apply(this, args)); return; }
    return post.apply(this, args);
  };
  window.__releaseWorkers = () => { window.__holdWorkers = false; const held = window.__heldWorkerMessages.splice(0); held.forEach(send => send()); return held.length; };
};

// One export of the current viewport of `view`. With `withEdits`, three phases are witnessed
// before the page edits the live scene: admission held by a hook; the export render pending on a
// held worker message (the view is switched away and back first, so the export misses the
// renderer's reference cache, and nothing has been published); encoding held by a hook.
async function exportViewport(page, view, withEdits) {
  if (withEdits) await within(page.evaluate(async other => { atlas.goTo(other); await atlas.whenIdle(); }, VIEW_C), LIMITS.deep, 'move away to empty the reference cache');
  await ev(page, ({ target, edits }) => {
    window.__exportStages = [];
    const holds = {};
    window.__releaseExport = name => holds[name]?.();
    atlas.setExportHooks({
      stage(name) { window.__exportStages.push(name); },
      hold: name => (edits && (name === 'admission' || name === 'encoding') ? new Promise(resolve => { holds[name] = resolve; }) : undefined),
    });
    document.querySelector('#export-size').value = 'current';
    atlas.goTo(target);
    window.__holdWorkers = edits;
    document.querySelector('#download-image').click();
  }, { target: view, edits: withEdits });
  if (withEdits) {
    await page.waitForFunction(() => window.__exportStages.includes('admission'), null, { timeout: LIMITS.operation });
    await ev(page, other => { document.querySelector('[data-palette="aurora"]').click(); atlas.goTo(other); window.__releaseExport('admission'); }, VIEW_C);
    await page.waitForFunction(() => window.__exportStages.includes('render-submitted') && window.__heldWorkerMessages.length > 0, null, { timeout: LIMITS.operation });
    const pending = await ev(page, () => ({ stages: [...window.__exportStages], lastExport: atlas.lastExport }));
    assert.ok(!pending.stages.includes('encoding'), 'the export render is still pending on its held worker message');
    await ev(page, other => { document.querySelector('[data-palette="rose"]').click(); atlas.goTo(other); return window.__releaseWorkers(); }, VIEW_D);
    await page.waitForFunction(() => window.__exportStages.includes('encoding'), null, { timeout: LIMITS.deep });
    await ev(page, other => { document.querySelector('[data-palette="ocean"]').click(); atlas.goTo(other); window.__releaseExport('encoding'); }, VIEW_D);
  }
  await page.waitForFunction(() => window.__exportStages.includes('finished'), null, { timeout: LIMITS.deep });
  const result = await ev(page, () => ({ lastExport: atlas.lastExport, scene: atlas.scene, stages: window.__exportStages }), undefined, 'export result');
  await ev(page, () => atlas.setExportHooks(null));
  await idleWithin(page, LIMITS.deep);
  return result;
}

// The same export with and without edits during admission, rendering and encoding must decode to
// identical RGBA pixels (compared in the page), and must report the scene captured at the click.
async function checkExportImmutability(page, label) {
  await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_B), LIMITS.deep, 'go to B');
  const exportedScene = await ev(page, () => atlas.scene);
  const baseline = await exportViewport(page, VIEW_B, false);
  await ev(page, async () => { window.__baselineImage = await atlas.lastExportImageData(); }, undefined, 'decode baseline', LIMITS.deep);
  const raced = await exportViewport(page, VIEW_B, true);
  assert.deepEqual(raced.stages, ['reserved', 'admission', 'render-submitted', 'encoding', 'finished'], `${label}: every stage was reached`);
  for (const result of [baseline, raced]) {
    assert.equal(result.lastExport.outcome, 'completed', label);
    assert.equal(result.lastExport.report.outcome, 'completed');
    assert.deepEqual(result.lastExport.scene, exportedScene, `${label}: the export reports the scene captured at the click`);
  }
  const pixels = await ev(page, async () => {
    const before = window.__baselineImage, after = await atlas.lastExportImageData();
    let differing = 0;
    for (let i = 0; i < before.data.length; i++) if (before.data[i] !== after.data[i]) differing++;
    return { width: [before.width, after.width], height: [before.height, after.height], samples: after.data.length / 4, differing };
  }, undefined, 'compare pixels', LIMITS.deep);
  assert.equal(pixels.width[0], pixels.width[1]); assert.equal(pixels.height[0], pixels.height[1]);
  assert.ok(pixels.samples > 0);
  assert.equal(pixels.differing, 0, `${label}: edits during admission, rendering and encoding changed the exported pixels`);
  assert.deepEqual(raced.scene.camera, VIEW_D, 'the live scene kept the later edits');
  assert.equal(raced.scene.appearance.palette, 'ocean');
}

// A context loss while encoding is held, in both orders of restoration and lease release. The
// loss and restoration events are witnessed; the export is interrupted, nothing is published while
// the renderer is lost, the replacement waits for the lease, and live rendering resumes on one
// renderer shared by the workspace and the adapter.
async function checkContextLossDuringExport(page, restoreFirst) {
  await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_B), LIMITS.deep, 'go to B');
  await ev(page, () => {
    window.__contextEvents = [];
    if (!window.__contextListening) {
      window.__contextListening = true;
      const canvas = document.querySelector('#fractal');
      canvas.addEventListener('webglcontextlost', () => window.__contextEvents.push('lost'));
      canvas.addEventListener('webglcontextrestored', () => window.__contextEvents.push('restored'));
    }
    window.__exportStages = [];
    const holds = {};
    window.__releaseExport = name => holds[name]?.();
    atlas.setExportHooks({ stage(name) { window.__exportStages.push(name); }, hold: name => (name === 'encoding' ? new Promise(resolve => { holds[name] = resolve; }) : undefined) });
    document.querySelector('#export-size').value = 'current';
    document.querySelector('#download-image').click();
  });
  await page.waitForFunction(() => window.__exportStages.includes('encoding'), null, { timeout: LIMITS.deep });
  await ev(page, () => { window.__loseContext = atlas.renderer.gl.getExtension('WEBGL_lose_context'); window.__loseContext.loseContext(); });
  await page.waitForFunction(() => window.__contextEvents.includes('lost'), null, { timeout: LIMITS.operation });
  if (restoreFirst) {
    await ev(page, () => window.__loseContext.restoreContext());
    await page.waitForFunction(() => window.__contextEvents.includes('restored'), null, { timeout: LIMITS.operation });
  }
  const beforeRelease = await ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null }));
  await ev(page, () => window.__releaseExport('encoding'));
  await page.waitForFunction(() => window.__exportStages.includes('finished'), null, { timeout: LIMITS.deep });
  await ev(page, () => atlas.setExportHooks(null));
  if (!restoreFirst) {
    await page.waitForTimeout(500);
    const gap = await ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null, events: [...window.__contextEvents] }));
    assert.deepEqual(gap, { ...beforeRelease, events: ['lost'] }, 'nothing renders or publishes while the context is lost');
    await ev(page, () => window.__loseContext.restoreContext());
    await page.waitForFunction(() => window.__contextEvents.includes('restored'), null, { timeout: LIMITS.operation });
  }
  await page.waitForFunction(count => atlas.rendered > count, beforeRelease.rendered, { timeout: LIMITS.deep });
  const after = await ev(page, () => ({ outcome: atlas.lastExport.outcome, report: atlas.lastExport.report.outcome, consistent: atlas.rendererConsistent, exportButtonBusy: document.querySelector('#download-image').disabled, events: window.__contextEvents }));
  assert.deepEqual(after, { outcome: 'interrupted', report: 'interrupted', consistent: true, exportButtonBusy: false, events: ['lost', 'restored'] });
}

try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'pipe' });
    await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  await context.addInitScript(holdWorkersScript);
  const page = await open(context);

  const fresh = await state(page);
  assert.equal(fresh.scene.workspace, 'plane');
  assert.deepEqual(fresh.scene.camera, INITIAL);
  assert.equal(fresh.history.canBack, false);
  assert.equal(fresh.history.canUndo, false);
  pass('Fresh start opens Plane at the default view');

  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await idleWithin(page);
  const zoomed = await state(page);
  assert.equal(zoomed.scene.appearance.palette, 'aurora');
  await page.keyboard.press('Control+z');
  const undone = await state(page);
  assert.equal(undone.scene.appearance.palette, 'ember');
  assert.deepEqual(undone.scene.camera, zoomed.scene.camera, 'undoing the palette keeps the camera');
  assert.equal(undone.rendered, zoomed.rendered, 'an appearance undo recolors without recalculating');
  pass('Palette edit, navigation and undo keep the camera');

  const urlBefore = page.url();
  await ev(page, () => { window.__atlasPageMarker = 'still-here'; });
  await page.keyboard.press('Alt+ArrowLeft');
  await idleWithin(page);
  assert.equal(page.url(), urlBefore, 'Alt+Left must not navigate the browser');
  assert.equal(await ev(page, () => window.__atlasPageMarker), 'still-here', 'the page was not reloaded or replaced');
  const back = await state(page);
  assert.deepEqual(back.scene.camera, INITIAL);
  assert.equal(back.scene.appearance.palette, 'ember', 'Back moves only the camera');
  await page.keyboard.press('Alt+ArrowRight');
  await idleWithin(page);
  assert.deepEqual((await state(page)).scene.camera, zoomed.scene.camera);
  pass('Camera back and forward restore poses without touching content');

  const beforeEntry = await state(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('1e1000000000000'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('0');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  assert.match(await page.locator('#coordinate-error').textContent(), /budget/);
  assert.equal(await page.locator('#input-re').inputValue(), '1e1000000000000', 'the requested text is preserved');
  await page.keyboard.press('Escape');
  const afterEntry = await state(page);
  assert.deepEqual(afterEntry.scene, beforeEntry.scene);
  assert.deepEqual(afterEntry.history, beforeEntry.history, 'neither history changes');
  pass('An oversized coordinate is rejected before it is expanded');

  const beforeDrag = await state(page);
  await page.locator('#phase').scrollIntoViewIfNeeded();
  const slider = await page.locator('#phase').boundingBox();
  await page.mouse.move(slider.x + slider.width * 0.2, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterDrag = await state(page);
  assert.notEqual(afterDrag.scene.appearance.phase, beforeDrag.scene.appearance.phase);
  assert.equal(afterDrag.history.undoDepth, beforeDrag.history.undoDepth + 1, 'one drag is one undo entry');
  await ev(page, () => document.activeElement?.blur());
  await page.keyboard.press('Control+z');
  assert.equal((await state(page)).scene.appearance.phase, beforeDrag.scene.appearance.phase);
  pass('A slider drag is one undo entry');

  const beforeWheel = await state(page);
  await within(page.evaluate(async () => {
    const surface = document.querySelector('#fractal-surface');
    for (let i = 0; i < 5; i++) {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, clientX: 640, clientY: 360, bubbles: true, cancelable: true }));
      await new Promise(resolveStep => setTimeout(resolveStep, 15));
    }
    await new Promise(resolveQuiet => setTimeout(resolveQuiet, 400));
    await atlas.whenIdle();
  }), LIMITS.operation, 'wheel burst');
  const afterWheel = await state(page);
  assert.ok(afterWheel.scene.camera.zoom > beforeWheel.scene.camera.zoom);
  assert.equal(afterWheel.history.camera.length, beforeWheel.history.camera.index + 2, 'a wheel burst is one camera-history entry');
  assert.equal(afterWheel.history.undoDepth, beforeWheel.history.undoDepth, 'navigation never adds an undo entry');
  pass('A wheel burst is one camera-history entry');

  const before = await state(page);
  await ev(page, () => { location.hash = '#scene=@@@'; });
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('visible'), null, { timeout: LIMITS.operation });
  assert.match(await page.locator('#toast').textContent(), /unchanged/);
  const after = await state(page);
  assert.deepEqual(after.scene, before.scene);
  assert.deepEqual(after.history, before.history, 'neither history changes');
  pass('An invalid link during an investigation changes nothing');

  await checkExportImmutability(page, 'WebGL');
  pass('An edit during a WebGL export does not change the exported image');
  await checkContextLossDuringExport(page, true);
  await checkContextLossDuringExport(page, false);
  pass('A context loss during an export interrupts it and live rendering resumes');

  const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  await cpuContext.addInitScript(holdWorkersScript);
  await cpuContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  const cpu = await open(cpuContext);
  assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
  await checkExportImmutability(cpu, 'CPU');
  await closeWithin(cpuContext, 'cpuContext');
  pass('An edit during a CPU export does not change the exported image');

  const earlier = await open(context, '#re=-2&im=0&z=40&palette=rose');
  assert.deepEqual((await state(earlier)).scene.camera, INITIAL);
  assert.match(await earlier.locator('#toast').textContent(), /earlier ATLAS format/);
  pass('An earlier-format link opens fresh-start Plane with a notice');

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
````

**`tests/suites.manifest.json`** (complete file):

````json
{
  "build": {
    "requiredFiles": [
      "dist/index.html",
      "dist/src/app.js"
    ]
  },
  "suites": [
    {
      "id": "browser",
      "gpu": false,
      "command": [
        "tests/browser.mjs"
      ],
      "report": "artifacts/browser-report.json",
      "evidence": "browser",
      "requiredPasses": [
        "Desktop WebGL startup and unobstructed controls",
        "WebGL acceleration is labeled accurately and exposes its actual renderer",
        "Instant palette changes without recalculating the fractal",
        "Wheel zoom and pointer drag",
        "GPU escape values agree with independent BigInt oracle",
        "Laptop layout keeps exact-coordinate navigation accessible",
        "Repeated GPU navigation reaches the latest view and full resolution",
        "Bookmarks persist across reloads",
        "Cinema mode, keyboard shortcuts, and accessible help dialog",
        "Arbitrary coordinate navigation enters extended GPU mode",
        "Shared URL restores precision and settings",
        "PNG export",
        "JSON location export and import preserve exact coordinates",
        "Journey animates and manual navigation stops it",
        "Mobile layout, settings, touch drag, and cursor-centered pinch zoom",
        "CPU worker escape values agree with independent BigInt oracle",
        "CPU palette caching, render cancellation, and responsive navigation",
        "Automatic CPU fallback when webgl2 is unavailable",
        "Automatic CPU fallback when float-targets is unavailable",
        "No browser runtime errors"
      ]
    },
    {
      "id": "workflow",
      "gpu": false,
      "command": [
        "tests/workflow.mjs"
      ],
      "report": "artifacts/workflow-report.json",
      "evidence": "workflow",
      "requiredPasses": [
        "Fresh start opens Plane at the default view",
        "Palette edit, navigation and undo keep the camera",
        "Camera back and forward restore poses without touching content",
        "An oversized coordinate is rejected before it is expanded",
        "A slider drag is one undo entry",
        "A wheel burst is one camera-history entry",
        "An invalid link during an investigation changes nothing",
        "An edit during a WebGL export does not change the exported image",
        "A context loss during an export interrupts it and live rendering resumes",
        "An edit during a CPU export does not change the exported image",
        "An earlier-format link opens fresh-start Plane with a notice",
        "No browser runtime errors"
      ]
    },
    {
      "id": "browser-hardware",
      "gpu": true,
      "command": [
        "tests/browser.mjs",
        "--hardware"
      ],
      "report": "artifacts/hardware-browser-report.json",
      "evidence": "browser",
      "requiredPasses": [
        "Desktop WebGL startup and unobstructed controls",
        "WebGL acceleration is labeled accurately and exposes its actual renderer",
        "Instant palette changes without recalculating the fractal",
        "Wheel zoom and pointer drag",
        "GPU escape values agree with independent BigInt oracle",
        "Laptop layout keeps exact-coordinate navigation accessible",
        "Repeated GPU navigation reaches the latest view and full resolution",
        "Bookmarks persist across reloads",
        "Cinema mode, keyboard shortcuts, and accessible help dialog",
        "Arbitrary coordinate navigation enters extended GPU mode",
        "Shared URL restores precision and settings",
        "PNG export",
        "JSON location export and import preserve exact coordinates",
        "Journey animates and manual navigation stops it",
        "Mobile layout, settings, touch drag, and cursor-centered pinch zoom",
        "CPU worker escape values agree with independent BigInt oracle",
        "CPU palette caching, render cancellation, and responsive navigation",
        "Automatic CPU fallback when webgl2 is unavailable",
        "Automatic CPU fallback when float-targets is unavailable",
        "No browser runtime errors"
      ]
    },
    {
      "id": "navigation",
      "gpu": false,
      "command": [
        "tests/navigation.mjs"
      ],
      "report": "artifacts/navigation-report.json",
      "evidence": "navigation"
    },
    {
      "id": "graphics",
      "gpu": true,
      "benchmark": true,
      "command": [
        "tests/graphics.mjs",
        "--chrome",
        "--headed",
        "--compositor",
        "--benchmark"
      ],
      "report": "artifacts/graphics-report.json",
      "evidence": "graphics"
    }
  ]
}
````

- [ ] **Step 2: Write the implementation**

**`src/app.js`** (complete file):

````js
import { GpuRenderer, CpuRenderer } from './plane/renderer.js';
import { moveView, zoomView, viewTransform, precisionFor, validateView } from './plane/math.js';
import { PALETTES } from './plane/palettes.js';
import { PLACES } from './plane/places.js';
import { icon, installIcons } from './ui/icons.js';
import { createHistory } from './shared/history.js';
import { sceneCodec, createPlaneScene, toPlaneState, PLANE_INITIAL_SCENE, encodeShareHash, decodeShareHash, encodeSceneFile, decodeSceneFile, admitEnteredView } from './plane/scene-adapter.js';
import { createGestureArbiter } from './plane/gestures.js';
import { createPlaneRenderAdapter, createPlaneRequest } from './plane/render-adapter.js';
import { startExport } from './plane/export.js';

const $ = selector => document.querySelector(selector);
installIcons();
let canvas = $('#fractal');
let renderer;
// The scene history owns the one authoritative scene. `view` and `settings` are derived from it
// and are assigned only in adopt().
let sceneHistory, gestures, view, settings;
let activePlace = 'seahorse';
let busy = false, dirty = false, toastTimer, displayedView;
let rendered = 0, requestVersion = 0, cycle = false, tour = null, adapter, lastReport = null, lastExport = null, exportHooks = {}, pendingReplacement = false;
let geometryRevision = 0, appearanceRevision = 0;
let saved = [], savedTab = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}

try {
  const existing = JSON.parse(localStorage.getItem('atlas.discoveries') || '[]');
  saved = Array.isArray(existing) ? existing.filter(item => {
    try { validateView(item.view); return typeof item.name === 'string' && typeof item.id === 'string'; } catch { return false; }
  }) : [];
} catch { /* A privacy-restricted browser still supports exploration. */ }

function adoptScene(scene) {
  const state = toPlaneState(scene);
  view = state.view;
  const { iterations, ...appearanceAndDetail } = state.settings;
  settings = appearanceAndDetail;
}

// Startup: a native share link opens its scene; anything else opens fresh-start Plane.
function startupScene() {
  const link = decodeShareHash(location.hash);
  if (link.kind === 'scene' && link.scene.workspace === 'plane') { activePlace = ''; return link.scene; }
  if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Opening Seahorse valley.`);
  return PLANE_INITIAL_SCENE;
}
sceneHistory = createHistory({ initialScene: startupScene(), codec: sceneCodec });
adoptScene(sceneHistory.snapshot().scene);
sceneHistory.subscribe(() => updateHistoryControls());

// Every scene change arrives here: derive view and settings, then render or recolor.
function adopt(transition, interactive = false) {
  if (!transition) return;
  adoptScene(transition.after);
  if (!transition.render) return;
  const geometry = transition.changed.some(domain => domain !== 'appearance');
  if (geometry) geometryRevision++;
  if (transition.changed.includes('appearance')) appearanceRevision++;
  if (transition.changed.some(domain => domain !== 'camera')) syncControls();
  if (geometry) requestRender(interactive);
  else {
    updateReadouts();
    // A recolor of published geometry is itself a publication with its own report.
    const recolored = adapter.recolor(transition.after, generation());
    if (recolored.report) lastReport = recolored.report;
  }
}
const generation = () => ({ deviceEpoch: adapter.epoch, viewRevision: sceneHistory.snapshot().revision, geometryRevision, appearanceRevision });

gestures = createGestureArbiter({ history: sceneHistory, onTransition: (transition, interactive) => adopt(transition, interactive), stopAutomated: () => stopTour() });
const preview = (kind, command, interactive) => gestures.preview(kind, command, interactive);
const commitGesture = kind => gestures.commit(kind);
const applyAction = (commands, kind, interactive = false) => gestures.apply(commands, kind, interactive);
// A wheel burst or key-repeat run: one camera-history entry after a quiet period.
function navigateGrouped(next) {
  activePlace = '';
  gestures.grouped({ type: 'setCamera', camera: next });
  document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
}
function historyStep(action) {
  stopTour();
  const transition = gestures.step(action, action === 'back' || action === 'forward');
  if (transition) { activePlace = ''; renderPlaces(); }
}
function updateHistoryControls() {
  const snapshot = sceneHistory.snapshot();
  for (const [id, enabled] of [['#undo-button', snapshot.canUndo], ['#redo-button', snapshot.canRedo], ['#back-button', snapshot.canBack], ['#forward-button', snapshot.canForward]]) {
    const button = $(id); if (button) button.disabled = !enabled;
  }
}

function makeRenderer() {
  try { return new GpuRenderer(canvas); }
  catch (error) {
    console.info('Using the CPU renderer:', error.message);
    const replacement = canvas.cloneNode(false); canvas.replaceWith(replacement); canvas = replacement;
    toast('Using the CPU renderer. Deep views take a little longer.');
    return new CpuRenderer(canvas, error);
  }
}
renderer = makeRenderer();
adapter = createPlaneRenderAdapter({ renderer, clock: () => performance.now() });

function updateGraphicsDetails() {
  const info = renderer.diagnostics;
  $('#graphics-summary').textContent = {
    hardware: 'Your browser reports a hardware graphics device for WebGL rendering.',
    software: 'Your browser is running WebGL in software on the CPU.',
    unknown: 'WebGL is running, but the browser has not disclosed a recognizable graphics device.',
    cpu: 'Fractal calculations are running in the CPU fallback.',
  }[info.acceleration];
  $('#graphics-device').textContent = info.device;
  $('#graphics-reason').textContent = info.reason || 'WebGL 2 and floating-point rendering initialized successfully.';
  $('#graphics-attempted-row').hidden = !info.attemptedDevice;
  $('#graphics-attempted').textContent = info.attemptedDevice || '';
  $('#graphics-guidance').textContent = info.acceleration === 'cpu' || info.acceleration === 'software'
    ? 'Check your browser’s graphics acceleration setting and graphics diagnostics. Rendering runs on the computer where this browser is open.'
    : 'ATLAS calculates new images when you navigate or change the detail setting. A still view does not continuously recalculate the fractal.';
  $('#engine-status').title = `${info.device}\n${info.reason || info.acceleration}\nClick for graphics details`;
}
updateGraphicsDetails();

function renderSettings() {
  return toPlaneState(sceneHistory.snapshot().scene).settings;
}
function dimensions() {
  const width = innerWidth, height = innerHeight;
  let ratio = Math.min(devicePixelRatio || 1, 1.6);
  const budget = view.zoom >= 28 ? 1100000 : 2300000;
  ratio = Math.min(ratio, Math.sqrt(budget / (width * height)));
  return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
}
function requestRender(interactive = false) {
  dirty = true; requestVersion++;
  if (busy && renderer instanceof CpuRenderer) adapter.cancelInteractive();
  if (interactive && displayedView) {
    const { scale, x, y } = viewTransform(displayedView, view, innerWidth);
    if ([scale, x, y].every(Number.isFinite)) canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  updateReadouts();
  requestAnimationFrame(flushRender);
}
async function flushRender() {
  if (busy || !dirty || adapter.reserved || adapter.retired || adapter.unavailable) return;
  busy = true; dirty = false;
  const version = requestVersion;
  const snapshot = { ...view };
  const [width, height] = dimensions();
  const request = createPlaneRequest({ scene: sceneHistory.snapshot().scene, purpose: 'interactive', width, height, generation: generation() });
  $('#render-status').textContent = 'Resolving the landscape…';
  document.body.dataset.rendering = 'true';
  try {
    const report = await adapter.render(request, { isCurrent: () => version === requestVersion, currentGeneration: generation, liveScene: () => sceneHistory.snapshot().scene });
    if (report.outcome === 'superseded' || report.outcome === 'interrupted') return;
    if (report.outcome !== 'completed') throw new Error(report.reason);
    lastReport = report;
    displayedView = snapshot;
    canvas.style.transform = '';
    rendered++;
    document.body.dataset.ready = 'true';
    $('#engine-status').textContent = renderer.mode;
    updateGraphicsDetails();
    $('#render-status').textContent = 'Ready to explore';
    $('#resolution-status').textContent = `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} · RGB`;
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error(error);
    $('#render-status').textContent = 'Render interrupted';
    toast('This view could not finish rendering. Try reducing the level of detail.');
  } finally {
    busy = false;
    document.body.dataset.rendering = 'false';
    if (dirty || version !== requestVersion) requestAnimationFrame(flushRender);
  }
}
function updateReadouts() {
  const superscript = value => String(value).replace(/[-\d]/g, c => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' })[c]);
  $('#zoom-value').textContent = view.zoom < 6 ? (10 ** view.zoom).toLocaleString('en-US', { maximumFractionDigits: view.zoom < 1 ? 1 : 0 }) : `${(10 ** (view.zoom - Math.floor(view.zoom))).toFixed(2)} · 10${superscript(Math.floor(view.zoom))}`;
  for (const key of ['re', 'im']) {
    const text = view[key];
    $(`#coordinate-${key}`).textContent = (text.startsWith('-') ? '−' + text.slice(1) : '+' + text);
    $(`#coordinate-${key}`).title = text;
  }
  $('#precision-status').textContent = `${precisionFor(view.zoom)} DIGITS`;
  $('#detail-value').textContent = renderSettings().iterations.toLocaleString();
}
function syncControls() {
  $('#phase').value = Math.round(settings.phase * 1000);
  $('#frequency').value = Math.round(settings.frequency * 100);
  $('#detail').value = settings.detail;
  $('#relief').checked = !!settings.relief;
  $('#frequency-value').textContent = `${settings.frequency.toFixed(1)}×`;
  document.querySelectorAll('input[type=range]').forEach(styleRange);
  const palette = PALETTES.find(p => p.id === settings.palette);
  $('#palette-name').textContent = palette.name;
  $('#palette-description').textContent = palette.description;
  document.querySelectorAll('.palette-swatch').forEach(button => {
    const active = button.dataset.palette === settings.palette;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  updateReadouts();
}
function styleRange(input) {
  input.style.setProperty('--range', `${(input.value - input.min) / (input.max - input.min) * 100}%`);
}
// A jump to a place or entered coordinate: its camera goes to camera history and any
// palette or detail it carries is one undoable content change.
// The lexical and resource preflight runs before validateView materializes anything.
function goTo(next, palette, place = '', { tourGesture = false } = {}) {
  const target = admitEnteredView(next);
  const commands = [{ type: 'setCamera', camera: { re: target.re, im: target.im, zoom: target.zoom } }];
  if (Number.isInteger(next.detail)) commands.push({ type: 'setIteration', patch: { detail: Math.min(5, Math.max(0, next.detail)) } });
  if (palette) commands.push({ type: 'setAppearance', patch: { palette } });
  activePlace = place;
  if (tourGesture) for (const command of commands) gestures.automate('tour', command);
  else applyAction(commands, 'jump');
  renderPlaces();
}
function navigate(next, interactive = true, kind = 'navigation') {
  stopTour(); activePlace = '';
  if (kind === 'jump') applyAction([{ type: 'setCamera', camera: next }], 'jump', interactive);
  else preview(kind, { type: 'setCamera', camera: next }, interactive);
  document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
}
function pointAt(clientX, clientY) {
  return [(clientX - innerWidth / 2) / innerWidth, (innerHeight / 2 - clientY) / innerWidth];
}

$('#palette-grid').innerHTML = PALETTES.map(p => `<button class="palette-swatch" data-palette="${p.id}" title="${p.name}" aria-label="${p.name} palette" aria-pressed="false" style="background:linear-gradient(145deg,${p.stops.slice(1,6).join(',')})"></button>`).join('');
$('#palette-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-palette]');
  if (!button) return;
  applyAction([{ type: 'setAppearance', patch: { palette: button.dataset.palette } }], 'edit');
});
// One slider drag is one gesture: `input` previews, `change` (release) commits.
$('#phase').addEventListener('input', event => { styleRange(event.target); preview('slider', { type: 'setAppearance', patch: { phase: event.target.value / 1000 } }); });
$('#frequency').addEventListener('input', event => { preview('slider', { type: 'setAppearance', patch: { frequency: event.target.value / 100 } }); });
$('#detail').addEventListener('input', event => { styleRange(event.target); preview('slider', { type: 'setIteration', patch: { detail: Number(event.target.value) } }); });
for (const id of ['#phase', '#frequency', '#detail']) $(id).addEventListener('change', () => commitGesture('slider'));
$('#relief').addEventListener('change', event => { applyAction([{ type: 'setAppearance', patch: { relief: Number(event.target.checked) } }], 'edit'); });
$('#cycle-button').onclick = () => {
  cycle = !cycle; $('#cycle-button').setAttribute('aria-pressed', String(cycle));
  if (!cycle) commitGesture('animation');
  if (cycle && !tour) requestAnimationFrame(animate);
};
let lastAnimation = 0;
function animate(time) {
  const dt = Math.min(.08, (time - (lastAnimation || time)) / 1000); lastAnimation = time;
  if (cycle) { gestures.animate({ type: 'setAppearance', patch: { phase: (settings.phase + dt * .025) % 1 } }); $('#phase').value = Math.round(settings.phase * 1000); styleRange($('#phase')); }
  if (tour && !adapter.reserved) {
    const elapsed = time - tour.started;
    if (elapsed > 18000) {
      tour.index = (tour.index + 1) % PLACES.length; tour.started = time; tour.lastFrame = 0;
      const place = PLACES[tour.index]; goTo(place, place.palette, place.id, { tourGesture: true });
      $('#tour-location').textContent = place.name;
    } else if (!busy && elapsed - tour.lastFrame > 90) {
      const step = (elapsed - tour.lastFrame) / 1000;
      tour.lastFrame = elapsed;
      gestures.automate('tour', { type: 'setCamera', camera: zoomView(view, view.zoom + Math.min(.2, step) * .07) }, true);
    }
  }
  if (cycle || tour) requestAnimationFrame(animate); else lastAnimation = 0;
}
function startTour() {
  if (tour) { stopTour(); return; }
  gestures.settle();
  tour = { index: 1, started: performance.now(), lastFrame: 0 };
  goTo(PLACES[1], PLACES[1].palette, PLACES[1].id, { tourGesture: true });
  $('#tour-status').hidden = false; $('#tour-location').textContent = PLACES[1].name;
  $('#tour-button').innerHTML = `${icon('pause')} Pause the journey <span class="arrow">↗</span>`;
  if (reducedMotion) toast('Journey started. Use Pause at any time to stop motion.');
  if (!cycle) requestAnimationFrame(animate);
}
function stopTour() {
  const running = tour;
  tour = null;
  if (running) commitGesture('tour');
  $('#tour-status').hidden = true;
  $('#tour-button').innerHTML = `${icon('play')} Take a journey <span class="arrow">↗</span>`;
}
$('#tour-button').onclick = startTour;
$('#stop-tour').onclick = stopTour;

function bindCanvas() {
  const surface = $('#fractal-surface');
  surface.addEventListener('wheel', event => {
    event.preventDefault();
    const [x, y] = pointAt(event.clientX, event.clientY);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    navigateGrouped(zoomView(view, view.zoom - Math.max(-160, Math.min(160, delta)) * .0015, x, y));
  }, { passive: false });
  surface.addEventListener('dblclick', event => { const [x, y] = pointAt(event.clientX, event.clientY); navigate(zoomView(view, view.zoom + Math.log10(4), x, y), true, 'jump'); });
  const pointers = new Map();
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    stopTour(); gestures.settle(); canvas.focus({ preventScroll: true }); surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.classList.add('dragging');
  });
  surface.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      navigate(moveView(view, (old.x - event.clientX) / innerWidth, (event.clientY - old.y) / innerWidth), true, 'navigation-drag');
    } else if (pointers.size === 2) {
      const after = [...pointers.values()];
      const distance = values => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      const mid = values => ({ x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 });
      const previous = mid(before), current = mid(after);
      const [x, y] = pointAt(previous.x, previous.y);
      const next = zoomView(view, view.zoom + Math.log10(Math.max(1, distance(after)) / Math.max(1, distance(before))), x, y);
      navigate(moveView(next, (previous.x - current.x) / innerWidth, (current.y - previous.y) / innerWidth), true, 'navigation-drag');
    }
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(event, e => {
    pointers.delete(e.pointerId);
    if (!pointers.size) { canvas.classList.remove('dragging'); commitGesture('navigation-drag'); }
  });
  // A lost context invalidates every earlier render and any export holding the renderer. The
  // replacement waits until an export lease has been released.
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); adapter.invalidate(); $('#render-status').textContent = 'Graphics paused'; toast('The graphics device paused. Restoring the view…');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (adapter.reserved) { pendingReplacement = true; return; }
    replaceRenderer(); requestRender();
  });
}
bindCanvas();
$('#zoom-in').onclick = () => navigate(zoomView(view, view.zoom + Math.log10(2)), true, 'jump');
$('#zoom-out').onclick = () => navigate(zoomView(view, view.zoom - Math.log10(2)), true, 'jump');
$('#undo-button').onclick = () => historyStep('undo');
$('#redo-button').onclick = () => historyStep('redo');
$('#back-button').onclick = () => historyStep('back');
$('#forward-button').onclick = () => historyStep('forward');
const home = () => { stopTour(); goTo(PLACES[0], settings.palette, 'origin'); };
$('#home-button').onclick = home;
$('#brand-home').onclick = event => { event.preventDefault(); home(); };
function cinema() { document.body.classList.toggle('cinema'); }
$('#cinema-button').onclick = cinema;
$('#settings-button').onclick = () => {
  document.body.classList.toggle('controls-expanded');
  $('#settings-button').setAttribute('aria-expanded', String(document.body.classList.contains('controls-expanded')));
};
$('#exit-cinema').onclick = cinema;
$('#gallery-toggle').onclick = () => {
  document.body.classList.toggle('gallery-collapsed');
  const label = document.body.classList.contains('gallery-collapsed') ? 'Expand places' : 'Collapse places';
  $('#gallery-toggle').setAttribute('aria-label', label); $('#gallery-toggle').title = label;
};

function renderPlaces() {
  $('#saved-count').textContent = saved.length;
  $('#destination-grid').classList.toggle('saved-places', savedTab);
  $('#destination-grid').replaceChildren();
  if (savedTab && !saved.length) {
    const empty = document.createElement('div'); empty.className = 'empty-saved'; empty.textContent = 'Find a place you love. Press B to keep it here.'; $('#destination-grid').append(empty); return;
  }
  (savedTab ? saved : PLACES).forEach((place, index) => {
    const button = document.createElement('button');
    button.className = `destination-card${place.id === activePlace ? ' active' : ''}`;
    button.dataset.place = place.id;
    const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.draggable = false;
    image.src = savedTab ? place.thumbnail || '/assets/seahorse.png' : `/assets/${place.id}.png`;
    // Thumbnails are real renders, generated by scripts/thumbnails.mjs.
    image.onerror = () => { image.style.display = 'none'; };
    button.append(image);
    const fields = [['place-number', String(index + 1).padStart(2, '0')], ['place-arrow', '↗'], ['place-name', place.name], ['place-description', place.description || 'YOUR OWN LITTLE INFINITY']];
    for (const [className, text] of fields) { const span = document.createElement('span'); span.className = className; span.textContent = text; button.append(span); }
    button.onclick = () => {
      stopTour();
      if (savedTab) {
        try { applyAction([{ type: 'restoreScene', scene: createPlaneScene({ view: place.view, settings: place.settings }) }], 'restore'); activePlace = place.id; renderPlaces(); }
        catch (error) { toast(`This discovery could not be opened: ${error.message}`); }
      } else goTo(place, place.palette, place.id);
    };
    if (savedTab) {
      const wrapper = document.createElement('div'); wrapper.className = 'saved-wrapper'; wrapper.append(button);
      const remove = document.createElement('button'); remove.className = 'delete-save'; remove.innerHTML = icon('close'); remove.setAttribute('aria-label', `Delete ${place.name}`);
      remove.onclick = () => { saved = saved.filter(item => item.id !== place.id); persistSaved(); renderPlaces(); toast('Discovery removed.'); };
      wrapper.append(remove); $('#destination-grid').append(wrapper);
    } else $('#destination-grid').append(button);
  });
}
function persistSaved() {
  try { localStorage.setItem('atlas.discoveries', JSON.stringify(saved)); return true; }
  catch { toast('Browser storage is unavailable or full. Use Capture → Save location to keep this view.'); return false; }
}
function saveDiscovery() {
  if (!rendered || busy || dirty) { toast('Let the current view finish, then save it.'); return; }
  const thumbnailCanvas = document.createElement('canvas'); thumbnailCanvas.width = 320; thumbnailCanvas.height = 160;
  thumbnailCanvas.getContext('2d').drawImage(canvas, 0, 0, 320, 160);
  const base = PLACES.find(p => p.id === activePlace)?.name || 'Discovery';
  const item = { id: crypto.randomUUID(), name: `${base} ${String(saved.length + 1).padStart(2, '0')}`, view: { ...view }, settings: { ...settings }, thumbnail: thumbnailCanvas.toDataURL('image/jpeg', .75) };
  saved.unshift(item);
  if (!persistSaved()) { saved.shift(); return; }
  renderPlaces(); toast('Discovery saved. Find it in Your discoveries.');
}
$('#bookmark-button').onclick = saveDiscovery;
for (const id of ['places-tab', 'saved-tab']) $(`#${id}`).onclick = () => {
  savedTab = id === 'saved-tab';
  for (const tab of ['places-tab', 'saved-tab']) { const active = tab === id; $(`#${tab}`).classList.toggle('active', active); $(`#${tab}`).setAttribute('aria-pressed', String(active)); }
  renderPlaces();
};

function showDialog(id) { stopTour(); $(id).showModal(); }
$('#engine-status').onclick = () => showDialog('#graphics-dialog');
$('#graphics-button').onclick = () => { $('#help-dialog').close(); showDialog('#graphics-dialog'); };
$('#help-button').onclick = () => showDialog('#help-dialog');
$('#export-button').onclick = () => showDialog('#capture-dialog');
$('#coordinates-button').onclick = () => {
  $('#input-re').value = view.re; $('#input-im').value = view.im; $('#input-zoom').value = view.zoom;
  $('#coordinate-error').textContent = ''; showDialog('#coordinate-dialog');
};
$('#coordinate-form').onsubmit = event => {
  event.preventDefault();
  try {
    const next = admitEnteredView({ re: $('#input-re').value.trim(), im: $('#input-im').value.trim(), zoom: Number($('#input-zoom').value) });
    goTo(next); $('#coordinate-dialog').close();
  } catch (error) { $('#coordinate-error').textContent = error.message; }
};
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
$('#share-button').onclick = async () => {
  commitGesture();
  const url = `${location.origin}${location.pathname}${encodeShareHash(sceneHistory.snapshot().scene)}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('View link copied. Every coordinate digit is included.'); }
  catch { toast('Your view is in the address bar. Copy that URL to share it.'); }
};
// A link opened during an investigation: a valid scene is a whole-scene restoration;
// anything else is reported and changes neither the scene nor either history.
addEventListener('hashchange', () => {
  const link = decodeShareHash(location.hash);
  if (link.kind === 'scene' && link.scene.workspace === 'plane') { stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene: link.scene }], 'restore'); renderPlaces(); }
  else if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Your view is unchanged.`);
});

function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$('#download-location').onclick = () => {
  commitGesture();
  download(new Blob([encodeSceneFile(sceneHistory.snapshot().scene)], { type: 'application/json' }), 'atlas-scene.json');
  $('#capture-status').textContent = 'Location saved, including all coordinate digits.';
};
$('#import-location').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > sceneCodec.maxSceneBytes) throw new Error('This location file is too large.');
    const scene = decodeSceneFile(await file.text());
    stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene }], 'restore'); renderPlaces();
    $('#capture-dialog').close(); toast('Welcome back to your discovery.');
  } catch (error) { $('#capture-status').textContent = error.message || 'Could not open this location.'; }
  event.target.value = '';
};
// Only while no export holds the renderer: the adapter accepts the new renderer before the old
// one is destroyed, so the workspace and the adapter always refer to the same renderer.
function replaceRenderer() {
  if (adapter.reserved) { pendingReplacement = true; return; }
  pendingReplacement = false;
  const previous = renderer, next = makeRenderer();
  adapter.replaceRenderer(next);
  renderer = next;
  previous.destroy();
  updateGraphicsDetails();
}
// The complete export request is captured and the renderer reserved synchronously in this
// handler, before any asynchronous wait (spec §14). Later edits change only the live scene.
$('#download-image').onclick = () => {
  if (adapter.reserved || adapter.retired || adapter.unavailable) { $('#capture-status').textContent = 'The graphics device is not available yet. Try again in a moment.'; return; }
  stopTour(); commitGesture();
  const scene = sceneHistory.snapshot().scene;
  const width = $('#export-size').value === 'current' ? canvas.width : Number($('#export-size').value);
  const height = Math.max(1, Math.round(width * innerHeight / innerWidth));
  const request = createPlaneRequest({ scene, purpose: 'export', width, height, generation: generation() });
  const { done } = startExport({ adapter, request, hooks: exportHooks, encode: target => new Promise(resolve => target.toBlob(resolve, 'image/png')) });
  const button = $('#download-image'); button.disabled = true;
  $('#capture-status').textContent = 'Rendering your image…';
  done.then(result => {
    lastExport = result;
    if (result.outcome === 'completed') {
      download(result.blob, `atlas-${Math.floor(scene.camera.zoom)}-decades.png`);
      $('#capture-status').textContent = `Saved ${result.report.completed.width.toLocaleString()} × ${result.report.completed.height.toLocaleString()} pixels. Save the location below to return here.`;
    } else $('#capture-status').textContent = result.reason || 'Image export is unavailable.';
    if (adapter.retired || pendingReplacement) replaceRenderer();
  }).finally(() => { button.disabled = false; requestRender(); });
};

addEventListener('keydown', event => {
  if (event.target.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  const historyKey = (event.ctrlKey || event.metaKey) && !event.altKey
    ? (key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null)
    : event.altKey && !event.ctrlKey && !event.metaKey ? ({ arrowleft: 'back', arrowright: 'forward' })[key] : null;
  if (historyKey) { event.preventDefault(); historyStep(historyKey); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const actions = {
    '+': () => navigateGrouped(zoomView(view, view.zoom + Math.log10(2))), '=': () => navigateGrouped(zoomView(view, view.zoom + Math.log10(2))),
    '-': () => navigateGrouped(zoomView(view, view.zoom - Math.log10(2))),
    arrowleft: () => navigateGrouped(moveView(view, -.08, 0)), arrowright: () => navigateGrouped(moveView(view, .08, 0)),
    arrowup: () => navigateGrouped(moveView(view, 0, .08)), arrowdown: () => navigateGrouped(moveView(view, 0, -.08)),
    r: home, h: cinema, b: saveDiscovery, s: () => showDialog('#capture-dialog'), '?': () => showDialog('#help-dialog'),
    escape: () => { document.body.classList.remove('cinema'); stopTour(); },
  };
  if (actions[key]) { event.preventDefault(); actions[key](); }
});
// A new size is a new geometry dependency: earlier renders are no longer publishable.
addEventListener('resize', () => { geometryRevision++; requestRender(true); });
addEventListener('pagehide', () => adapter.renderer.destroy());

// Small inspection API for numerical and browser regression tests.
class IdleTimeoutError extends Error {
  constructor(ms, state) { super(`ATLAS did not become idle within ${ms} ms (${JSON.stringify(state)}).`); this.name = 'IdleTimeoutError'; this.code = 'ATLAS_IDLE_TIMEOUT'; }
}
window.atlas = {
  get graphics() { return { ...renderer.diagnostics }; },
  get view() { return { ...view }; }, get settings() { return renderSettings(); }, get renderer() { return adapter.renderer; },
  get lastReport() { return lastReport; },
  get lastExport() { return lastExport && { outcome: lastExport.outcome, reason: lastExport.reason, sceneHash: lastExport.request.sceneHash, scene: lastExport.request.sceneSnapshot, report: lastExport.report, renderReport: lastExport.renderReport ?? null }; },
  // Test seams for the export race checks: the decoded image of the last export, stage hooks,
  // and whether the workspace and the adapter share one renderer.
  async lastExportImageData() {
    if (!lastExport?.blob) return null;
    const bitmap = await createImageBitmap(lastExport.blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  },
  get rendererConsistent() { return renderer === adapter.renderer; },
  setExportHooks(hooks) { exportHooks = hooks || {}; },
  get rendered() { return rendered; }, goTo,
  get scene() { return sceneHistory.snapshot().scene; },
  get history() { const { scene, ...rest } = sceneHistory.snapshot(); return rest; },
  undo: () => historyStep('undo'), redo: () => historyStep('redo'), back: () => historyStep('back'), forward: () => historyStep('forward'),
  async whenIdle({ timeoutMs = 60000 } = {}) {
    const deadline = performance.now() + timeoutMs;
    while (busy || dirty || adapter.reserved || adapter.unavailable) {
      if (performance.now() > deadline) throw new IdleTimeoutError(timeoutMs, { busy, dirty, exporting: adapter.reserved, unavailable: adapter.unavailable });
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  },
};
syncControls(); renderPlaces(); updateHistoryControls(); requestRender();
````

- [ ] **Step 3: Run the unit tests and the syntax checks**

Run:
```bash
npm test && node --check src/app.js && node --check tests/workflow.mjs
```
Expected: `UNIT {"state":"passed","reason":"94 tests passed","files":10,…}` and exit 0. The syntax checks print nothing.

- [ ] **Step 4: Commit**

```bash
git add src/app.js tests/workflow.mjs tests/suites.manifest.json
git commit -m "Route Plane renders and the image export through the render adapter"
```

- [ ] **Step 5: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 6: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T09: Discovery records, sources and the headless controller (spec §13.10)

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** T03.

**Files:**
- Create: `src/shared/discoveries.js`
- Create: `tests/support/fake-persistence.mjs` (test-only; production never falls back to it)
- Modify: `tests/unit.manifest.json`
- Test: `tests/unit/discoveries.test.js`

**Interfaces:**
- Consumes: `deepFreeze`, `isPlainObject`, `SceneError` (T03); a scene codec.
- Produces: `DISCOVERY_SCHEMA`, `THUMBNAIL_TYPES`, `validateDiscovery(input, sceneCodec) → frozen record` (errors include `hash-mismatch`, `stale-thumbnail`), `createDiscoveryRecord({scene, name, note?, thumbnail:{sourceReportId, mediaType, blob}, id, createdAt, sceneCodec})`, `deliver(listeners, change, onListenerError)` (isolated notification), `createLocalDiscoverySource({store, sceneCodec, onListenerError?}) → {id:"local", label, capabilities:{save, remove, confirm}, list({workspace, limit, cursor, signal}) → {items, nextCursor, total}, get(id, {signal}), save(record, {signal, report, writeId}), remove(id, {signal, writeId}), confirm(writeId, {signal}) → boolean, subscribe(listener)}`. Each write commits a `writes` marker `{writeId, op, id}` in the same transaction.
- Produces: `createDiscoveriesController({sources, sceneCodec, readTimeoutMs = 5000, writeWaitMs = 5000, reconcileAttempts = 3, onListenerError?}) → {snapshot(), subscribe(), setWorkspace(ws), refresh(), nextPage(sourceId), cancelWrite(writeId), reconcile(writeId), open(sourceId, id) → record, save(sourceId, record, {report}) → observation, remove(sourceId, id) → observation, destroy()}`. Snapshot sources carry `{label, status, reason, items, nextCursor, total}`; writes carry `{writeId, kind, sourceId, id, status, reason}` with statuses `pending`, `checking`, `committed`, `aborted`, `failed`, `unknown` (a later definite outcome replaces `unknown`). Items are `{id, key:"<sourceId>:<id>", sourceId, record} | {…, unsupported}`, validated by the controller whatever the source.
- Persistence port (implemented by T10 and the fake): `listDiscoveries({workspace, limit, cursor, signal}) → {items, nextCursor}`, `countDiscoveries({workspace, signal}) → number`, `getDiscovery(id, {signal}) → value | null`, `getWriteMarker(writeId, {signal}) → marker | null`, `commit({puts:[{store, value}], deletes:[{store, key}]}, {signal}) → {status:"committed"} | {status:"aborted"|"failed", reason}`, `close()`.

**Design assertions:**
- Spec §13.10: one canonical record; records from any source are validated before display or open (`records from every source are validated by the controller; invalid ones are never opened`).
- Spec §13.10 writes: success only after commit; cancellation never decides the outcome; a timeout reports checking, then reconciles by this write's own marker — an older record with the same scene, or an unrelated absence, confirms nothing (`write timeout then commit`, `an absent record during a pending write is not proof of failure`, `an older record with the same scene never confirms a replacement that then fails`, `overlapping save and remove are judged by their own markers`).
- Spec §13.10 reads: each read carries a request identity; a refresh invalidates and aborts earlier list and paging reads; a page is appended once; a workspace change (even A → B → A) invalidates opens and clears old results; destroy aborts everything (`old query after workspace change`, `a newer refresh wins over an older one in the same workspace`, `an obsolete open is rejected and destroy invalidates outstanding reads`, `paging loads the next page and a refresh invalidates paging`, `overlapping next-page requests append a page exactly once`, `an open across a workspace change A → B → A is rejected, and its read is aborted`, `a refresh and a destroy abort the reads they supersede`, `an item or opened record whose id disagrees with its listing is unsupported`).
- A committed write stays committed whatever its subscribers do (`a throwing subscriber cannot turn a committed save into a failure`); a thumbnail's report must describe the record's scene and a completed publication (`a thumbnail report must describe the record's scene and a completed publication`).

- [ ] **Step 1: Write the failing tests**

**`tests/support/fake-persistence.mjs`** (complete file):

````js
// A controlled PersistenceStore for Node tests (the production one is IndexedDB,
// src/shared/persistence.js). Commits can be held, released, aborted or failed, and reads can
// be delayed, so tests can order them around pending writes. Signals are honoured.
const aborted = signal => { if (signal?.aborted) { const error = new Error('The read was cancelled.'); error.name = 'AbortError'; throw error; } };

export function createFakePersistence() {
  const stores = { discoveries: new Map(), reports: new Map(), writes: new Map() };
  const held = [];
  const keyOf = (store, value) => store === 'reports' ? value.reportId : store === 'writes' ? value.writeId : value.id;
  const fake = {
    stores, held, holdCommits: false, listDelay: null, getDelay: null, failNext: null, listCalls: [],
    async listDiscoveries({ workspace, limit, cursor, signal }) {
      fake.listCalls.push({ workspace, cursor });
      if (fake.listDelay) await fake.listDelay(workspace, fake.listCalls.length);
      aborted(signal);
      const all = [...stores.discoveries.values()].filter(record => record.workspace === workspace).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const start = cursor ? Number(cursor) : 0;
      return { items: all.slice(start, start + limit), nextCursor: start + limit < all.length ? String(start + limit) : null };
    },
    async countDiscoveries({ workspace, signal }) {
      aborted(signal);
      return [...stores.discoveries.values()].filter(record => record.workspace === workspace).length;
    },
    async getDiscovery(id, { signal } = {}) {
      if (fake.getDelay) await fake.getDelay(id);
      aborted(signal);
      return stores.discoveries.get(id) ?? null;
    },
    async getWriteMarker(writeId, { signal } = {}) {
      aborted(signal);
      return stores.writes.get(writeId) ?? null;
    },
    commit(batch, { signal } = {}) {
      return new Promise(resolve => {
        const apply = () => {
          if (fake.failNext) { const reason = fake.failNext; fake.failNext = null; resolve({ status: 'failed', reason }); return; }
          if (signal?.aborted) { resolve({ status: 'aborted', reason: 'aborted before commit' }); return; }
          for (const { store, value } of batch.puts) stores[store].set(keyOf(store, value), value);
          for (const { store, key } of batch.deletes) stores[store].delete(key);
          resolve({ status: 'committed' });
        };
        if (fake.holdCommits) held.push(apply); else queueMicrotask(apply);
      });
    },
    releaseCommit() { held.shift()(); },
    close() {},
  };
  return fake;
}
````

**`tests/unit/discoveries.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDiscovery, createDiscoveryRecord, createLocalDiscoverySource, createDiscoveriesController } from '../../src/shared/discoveries.js';
import { sceneCodec, createPlaneScene } from '../../src/plane/scene-adapter.js';
import { createFakePersistence } from '../support/fake-persistence.mjs';
import { flush } from '../support/fake-renderer.mjs';

const thumbnail = () => ({ sourceReportId: 'report-1', mediaType: 'image/jpeg', blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }) });
const record = (id, zoom = 1, { name = `Discovery ${id}`, createdAt = `2026-10-20T00:00:0${zoom}.000Z` } = {}) => createDiscoveryRecord({
  scene: createPlaneScene({ view: { re: '-0.5', im: '0', zoom } }), name, thumbnail: thumbnail(), id, createdAt, sceneCodec,
});
const plain = value => ({ ...value, thumbnail: { ...value.thumbnail } });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const setup = (options = {}) => {
  const store = createFakePersistence();
  const local = createLocalDiscoverySource({ store, sceneCodec });
  const controller = createDiscoveriesController({ sources: [local], sceneCodec, readTimeoutMs: 40, writeWaitMs: 30, reconcileAttempts: 2, ...options });
  return { store, local, controller };
};

test('a discovery record is validated whole, with honest scene and thumbnail provenance', () => {
  const valid = record('a');
  assert.ok(Object.isFrozen(valid));
  assert.match(valid.sceneHash, /^fnv1a64:/);
  assert.equal(valid.thumbnail.sourceSceneHash, valid.sceneHash);
  const code = input => { try { validateDiscovery(input, sceneCodec); return 'valid'; } catch (error) { return error.code; } };
  assert.equal(code(plain(valid)), 'valid');
  assert.equal(code({ ...plain(valid), sceneHash: 'fnv1a64:0000000000000000' }), 'hash-mismatch');
  assert.equal(code({ ...plain(valid), thumbnail: { ...valid.thumbnail, sourceSceneHash: 'fnv1a64:0000000000000000' } }), 'stale-thumbnail');
  assert.equal(code({ ...plain(valid), workspace: 'space' }), 'invalid-value');
  assert.equal(code({ ...plain(valid), card: { selectedPoint: null, inspection: null, reportId: 'r' } }), 'invalid-value', 'Plane discoveries carry no Space card');
  assert.equal(code({ ...plain(valid), thumbnail: { ...valid.thumbnail, blob: new Blob([]) } }), 'invalid-value');
  assert.equal(code({ ...plain(valid), extra: true }), 'unknown-field');
  assert.equal(code({ ...plain(valid), schemaVersion: 2 }), 'unsupported-version');
});

test('the local source saves record, report and write marker in one commit', async () => {
  const { store, local } = setup();
  const first = record('a', 1);
  const result = await local.save(first, { report: { reportId: 'report-1', sceneHash: first.sceneHash, outcome: 'completed' }, writeId: 'w1' });
  assert.deepEqual(result, { status: 'committed' });
  assert.ok(store.stores.reports.has('report-1'), 'the thumbnail\'s report is committed with the discovery');
  assert.deepEqual(store.stores.writes.get('w1'), { writeId: 'w1', op: 'save', id: 'a' });
  assert.equal(await local.confirm('w1'), true);
  assert.equal(await local.confirm('w2'), false);
  await local.save(record('b', 2), { writeId: 'w2' });
  const page = await local.list({ workspace: 'plane', limit: 10 });
  assert.deepEqual([page.items.map(item => item.id), page.total], [['b', 'a'], 2]);
  await assert.rejects(local.save(record('c', 3), { report: { reportId: 'other' }, writeId: 'w3' }), /source report/);
  await assert.rejects(local.save(record('c', 3), {}), /writeId/);
});

test('records from every source are validated by the controller; invalid ones are never opened', async () => {
  const { store, controller } = setup();
  store.stores.discoveries.set('bad', { id: 'bad', workspace: 'plane', createdAt: '2026-10-21T00:00:00.000Z', schema: 'atlas.discovery', schemaVersion: 1 });
  const forged = { ...plain(record('f')), sceneHash: 'fnv1a64:0000000000000000' };
  const lying = { id: 'lying', label: 'Lying source', capabilities: {}, list: async () => ({ items: [{ id: 'f', record: forged }], nextCursor: null, total: 1 }), get: async () => ({ id: 'f', record: forged }), subscribe: () => () => {} };
  const both = createDiscoveriesController({ sources: [createLocalDiscoverySource({ store, sceneCodec }), lying], sceneCodec, readTimeoutMs: 40 });
  await both.setWorkspace('plane');
  const { local, lying: other } = both.snapshot().sources;
  assert.match(local.items[0].unsupported, /missing field/);
  assert.equal(local.items[0].key, 'local:bad', 'records are identified by (sourceId, id)');
  assert.match(other.items[0].unsupported, /sceneHash/, 'a source\'s claim that a record is valid is not trusted');
  await assert.rejects(both.open('local', 'bad'), error => error.code === 'unsupported');
  await assert.rejects(both.open('lying', 'f'), error => error.code === 'unsupported');
  await controller.destroy();
});

test('write timeout then commit', async () => {
  const { store, controller } = setup();
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const saving = controller.save('local', record('a'));
  await wait(45);
  assert.equal(controller.snapshot().writes[0].status, 'checking', 'a timeout is not a failure');
  store.releaseCommit();
  assert.equal((await saving).status, 'committed');
  await flush();
  assert.deepEqual(controller.snapshot().sources.local.items.map(item => item.id), ['a']);
});

test('an absent record during a pending write is not proof of failure', async () => {
  const { store, controller } = setup();
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const final = await controller.save('local', record('a'));
  assert.equal(final.status, 'unknown', 'never failed merely because waiting ended');
  store.releaseCommit();
  await flush();
  assert.equal(controller.snapshot().writes[0].status, 'committed', 'a late definite outcome resolves an unknown observation');
});

test('an older record with the same scene never confirms a replacement that then fails', async () => {
  const { store, controller } = setup();
  await controller.setWorkspace('plane');
  await controller.save('local', record('a', 1, { name: 'Old name' }));
  store.holdCommits = true;
  const replacing = controller.save('local', record('a', 1, { name: 'New name' }));
  await wait(45);
  assert.equal(controller.snapshot().writes[1].status, 'checking', 'the old record with the same sceneHash confirms nothing');
  store.failNext = 'QuotaExceededError';
  store.releaseCommit();
  const final = await replacing;
  assert.deepEqual([final.status, final.reason], ['failed', 'QuotaExceededError']);
  assert.equal(store.stores.discoveries.get('a').name, 'Old name');
});

test('overlapping save and remove are judged by their own markers', async () => {
  const { store, controller } = setup({ writeWaitMs: 1000 });
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const saving = controller.save('local', record('a'));
  const removing = controller.remove('local', 'a');
  await flush();
  store.releaseCommit();
  store.failNext = 'AbortError';
  store.releaseCommit();
  assert.equal((await saving).status, 'committed');
  assert.equal((await removing).status, 'failed');
  assert.equal(store.stores.discoveries.has('a'), true, 'the failed removal left the saved record');
});

test('cancellation before commit aborts; cancellation after commit stays committed', async () => {
  const { store, controller } = setup({ writeWaitMs: 1000 });
  await controller.setWorkspace('plane');
  store.holdCommits = true;
  const before = controller.save('local', record('a'));
  await flush();
  controller.cancelWrite(controller.snapshot().writes[0].writeId);
  store.releaseCommit();
  assert.equal((await before).status, 'aborted');
  assert.equal(store.stores.discoveries.has('a'), false);
  store.holdCommits = false;
  const after = await controller.save('local', record('b'));
  controller.cancelWrite(after.writeId);
  assert.equal(after.status, 'committed');
  assert.equal(store.stores.discoveries.has('b'), true);
});

test('a removal is confirmed only after it commits; a failure leaves the record', async () => {
  const { store, controller } = setup();
  await controller.setWorkspace('plane');
  await controller.save('local', record('a'));
  store.failNext = 'QuotaExceededError';
  const failed = await controller.remove('local', 'a');
  assert.deepEqual([failed.status, failed.reason], ['failed', 'QuotaExceededError']);
  assert.equal(store.stores.discoveries.has('a'), true);
  assert.equal((await controller.remove('local', 'a')).status, 'committed');
  assert.equal(store.stores.discoveries.has('a'), false);
});

test('old query after workspace change', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.save('local', record('p'));
  let releasePlane;
  store.listDelay = workspace => workspace === 'plane' ? new Promise(resolve => { releasePlane = resolve; }) : Promise.resolve();
  const planeLoad = controller.setWorkspace('plane');
  await flush();
  await controller.setWorkspace('space');
  releasePlane();
  assert.deepEqual(await planeLoad, ['discarded'], 'the late Plane result is discarded');
  assert.equal(controller.snapshot().workspace, 'space');
  assert.deepEqual(controller.snapshot().sources.local.items, []);
});

test('a newer refresh wins over an older one in the same workspace', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.setWorkspace('plane');
  const releases = [];
  store.listDelay = () => new Promise(resolve => releases.push(resolve));
  const older = controller.refresh();
  await flush();
  await controller.save('local', record('n')).catch(() => {});
  const newer = controller.refresh();
  await flush();
  releases.at(-1)();
  releases[0]();
  for (const release of releases) release();
  const [olderResult] = await older;
  await newer;
  assert.equal(olderResult, 'discarded', 'the older refresh cannot overwrite the newer one');
  assert.deepEqual(controller.snapshot().sources.local.items.map(item => item.id), ['n']);
});

test('an obsolete open is rejected and destroy invalidates outstanding reads', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.setWorkspace('plane');
  await controller.save('local', record('a', 1));
  await controller.save('local', record('b', 2));
  let releaseFirst;
  store.getDelay = id => (id === 'a' ? new Promise(resolve => { releaseFirst = resolve; }) : Promise.resolve());
  const first = controller.open('local', 'a');
  await flush();
  const second = await controller.open('local', 'b');
  releaseFirst();
  await assert.rejects(first, error => error.code === 'superseded');
  assert.equal(second.id, 'b');
  store.getDelay = null;
  store.listDelay = () => new Promise(resolve => setTimeout(resolve, 20));
  const pending = controller.refresh();
  controller.destroy();
  assert.deepEqual(await pending, ['discarded']);
});

test('a slow or failing source is unavailable without hiding another source', async () => {
  const { local } = setup();
  await local.save(record('a'), { writeId: 'w' });
  const silent = { id: 'silent', label: 'Silent', capabilities: {}, list: () => new Promise(() => {}), get: () => new Promise(() => {}), subscribe: () => () => {} };
  const broken = { id: 'broken', label: 'Broken', capabilities: {}, list: async () => { throw new Error('offline'); }, get: async () => null, subscribe: () => () => {} };
  const controller = createDiscoveriesController({ sources: [silent, local, broken], sceneCodec, readTimeoutMs: 20 });
  await controller.setWorkspace('plane');
  const { sources } = controller.snapshot();
  assert.deepEqual([sources.silent.status, sources.silent.reason], ['unavailable', 'did not respond in time']);
  assert.deepEqual([sources.broken.status, sources.broken.reason], ['unavailable', 'offline']);
  assert.deepEqual([sources.local.items.map(item => item.id), sources.local.total], [['a'], 1]);
});

test('paging loads the next page and a refresh invalidates paging', async () => {
  const { store, local, controller } = setup({ readTimeoutMs: 1000 });
  for (let i = 0; i < 55; i++) await local.save(createDiscoveryRecord({ scene: createPlaneScene({ view: { re: '-0.5', im: '0', zoom: i / 10 } }), name: `D${i}`, thumbnail: thumbnail(), id: `d${i}`, createdAt: new Date(Date.UTC(2026, 9, 20, 0, 0, i)).toISOString(), sceneCodec }), { writeId: `w${i}` });
  await controller.setWorkspace('plane');
  let view = controller.snapshot().sources.local;
  assert.deepEqual([view.items.length, view.total, view.nextCursor], [50, 55, '50']);
  await controller.nextPage('local');
  view = controller.snapshot().sources.local;
  assert.deepEqual([view.items.length, view.nextCursor, view.items.at(-1).id], [55, null, 'd0']);
  store.listDelay = (workspace, call) => (call % 2 ? new Promise(resolve => setTimeout(resolve, 30)) : Promise.resolve());
  await controller.refresh();
  const paging = controller.nextPage('local');
  await controller.refresh();
  assert.equal(await paging, 'discarded');
});

test('a throwing subscriber cannot turn a committed save into a failure', async () => {
  const errors = [];
  const store = createFakePersistence();
  const local = createLocalDiscoverySource({ store, sceneCodec, onListenerError: error => errors.push(`source: ${error.message}`) });
  const controller = createDiscoveriesController({ sources: [local], sceneCodec, readTimeoutMs: 40, onListenerError: error => errors.push(`controller: ${error.message}`) });
  const delivered = [];
  local.subscribe(() => { throw new Error('source listener broke'); });
  local.subscribe(change => delivered.push(change.type));
  controller.subscribe(() => { throw new Error('control render broke'); });
  await controller.setWorkspace('plane');
  const observation = await controller.save('local', record('a'));
  assert.equal(observation.status, 'committed');
  assert.ok(store.stores.discoveries.has('a'));
  assert.deepEqual(delivered, ['saved'], 'the other subscriber still received the change');
  assert.ok(errors.includes('source: source listener broke') && errors.some(error => error.startsWith('controller:')), 'failures are reported separately');
});

test('overlapping next-page requests append a page exactly once', async () => {
  const { store, local, controller } = setup({ readTimeoutMs: 1000 });
  for (let i = 0; i < 60; i++) await local.save(createDiscoveryRecord({ scene: createPlaneScene({ view: { re: '-0.5', im: '0', zoom: i / 10 } }), name: `D${i}`, thumbnail: thumbnail(), id: `d${i}`, createdAt: new Date(Date.UTC(2026, 9, 20, 0, 0, i)).toISOString(), sceneCodec }), { writeId: `w${i}` });
  await controller.setWorkspace('plane');
  store.listDelay = () => new Promise(resolve => setTimeout(resolve, 10));
  const [first, second] = await Promise.all([controller.nextPage('local'), controller.nextPage('local')]);
  assert.deepEqual([first, second], ['ready', 'ready'], 'the second request is the same read');
  const ids = controller.snapshot().sources.local.items.map(item => item.id);
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, 60, 'no record appears twice');
});

test('an open across a workspace change A → B → A is rejected, and its read is aborted', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.setWorkspace('plane');
  await controller.save('local', record('a'));
  const signals = [];
  let release;
  store.getDelay = () => new Promise(resolve => { release = resolve; });
  const original = store.getDiscovery;
  store.getDiscovery = (id, options = {}) => { signals.push(options.signal); return original(id, options); };
  const opening = controller.open('local', 'a');
  await flush();
  await controller.setWorkspace('space');
  await controller.setWorkspace('plane');
  assert.equal(signals[0].aborted, true, 'the workspace change aborted the read');
  release();
  await assert.rejects(opening, error => error.code === 'superseded');
});

test('a refresh and a destroy abort the reads they supersede', async () => {
  const { store, controller } = setup({ readTimeoutMs: 1000 });
  await controller.setWorkspace('plane');
  const signals = [];
  const original = store.listDiscoveries;
  store.listDiscoveries = query => { signals.push(query.signal); return new Promise(resolve => setTimeout(() => resolve(original(query)), 20)); };
  const older = controller.refresh();
  await flush();
  const newer = controller.refresh();
  assert.equal(signals[0].aborted, true);
  controller.destroy();
  assert.equal(signals[1].aborted, true);
  assert.deepEqual([await older, await newer], [['discarded'], ['discarded']]);
});

test('an item or opened record whose id disagrees with its listing is unsupported', async () => {
  const valid = record('real');
  const mismatched = { id: 'mismatched', label: 'Mismatch', capabilities: {}, list: async () => ({ items: [{ id: 'listed', record: valid }], nextCursor: null, total: 1 }), get: async () => ({ id: 'real', record: valid }), subscribe: () => () => {} };
  const controller = createDiscoveriesController({ sources: [mismatched], sceneCodec, readTimeoutMs: 40 });
  await controller.setWorkspace('plane');
  assert.match(controller.snapshot().sources.mismatched.items[0].unsupported, /id differs/);
  await assert.rejects(controller.open('mismatched', 'listed'), error => error.code === 'unsupported');
});

test('a thumbnail report must describe the record\'s scene and a completed publication', async () => {
  const { local } = setup();
  const saved = record('a');
  await assert.rejects(local.save(saved, { writeId: 'w1', report: { reportId: 'report-1', sceneHash: 'fnv1a64:0000000000000000', outcome: 'completed' } }), /completed publication/);
  await assert.rejects(local.save(saved, { writeId: 'w2', report: { reportId: 'report-1', sceneHash: saved.sceneHash, outcome: 'superseded' } }), /completed publication/);
  assert.equal((await local.save(saved, { writeId: 'w3', report: { reportId: 'report-1', sceneHash: saved.sceneHash, outcome: 'completed' } })).status, 'committed');
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js",
    "tests/unit/gestures.test.js",
    "tests/unit/render-adapter.test.js",
    "tests/unit/renderer-guards.test.js",
    "tests/unit/export.test.js",
    "tests/unit/discoveries.test.js"
  ]
}
````

- [ ] **Step 2: Write the interface skeleton**

**`src/shared/discoveries.js`** (complete file — interface skeleton):

````js
// T09 interface skeleton. Replaced in full by the implementation step.
const notImplemented = name => () => { throw new Error(`not implemented: ${name}`); };
export const DISCOVERY_SCHEMA = 'atlas.discovery';
export const DISCOVERY_SCHEMA_VERSION = 1;
export const THUMBNAIL_TYPES = Object.freeze(['image/jpeg', 'image/png']);
export const validateDiscovery = notImplemented('validateDiscovery');
export const createDiscoveryRecord = () => ({});
export const createLocalDiscoverySource = notImplemented('createLocalDiscoverySource');
export const createDiscoveriesController = notImplemented('createDiscoveriesController');
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/discoveries.test.js --expect-fail "a discovery record is validated whole, with honest scene and thumbnail provenance"
```
Expected: `RED confirmed: "a discovery record is validated whole, with honest scene and thumbnail provenance" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the implementation (replacing the skeleton)**

**`src/shared/discoveries.js`** (complete file):

````js
// Discoveries (spec §13.10): the record, the DiscoverySource contract, the local source,
// and the headless controller behind the Discoveries control. Records from any source are
// data: they are validated before they are shown or opened.
import { deepFreeze, isPlainObject, SceneError } from './scene.js';

export const DISCOVERY_SCHEMA = 'atlas.discovery';
export const DISCOVERY_SCHEMA_VERSION = 1;
export const THUMBNAIL_TYPES = Object.freeze(['image/jpeg', 'image/png']);
const KEYS = ['schema', 'schemaVersion', 'id', 'workspace', 'name', 'note', 'createdAt', 'sceneSnapshot', 'sceneHash', 'thumbnail'];

const text = (value, path, max) => {
  if (typeof value !== 'string' || value.length > max) throw new SceneError('invalid-value', `must be a string of at most ${max} characters`, path);
  return value;
};

export function validateDiscovery(input, sceneCodec) {
  if (!isPlainObject(input)) throw new SceneError('invalid-value', 'a discovery must be an object');
  if (input.schema !== DISCOVERY_SCHEMA || input.schemaVersion !== DISCOVERY_SCHEMA_VERSION) throw new SceneError('unsupported-version', 'not a supported discovery record');
  for (const key of Object.keys(input)) if (!KEYS.includes(key) && key !== 'card') throw new SceneError('unknown-field', `unknown field ${key}`);
  for (const key of KEYS) if (!(key in input)) throw new SceneError('missing-field', `missing field ${key}`);
  if (!text(input.id, 'id', 128)) throw new SceneError('invalid-value', 'must not be empty', 'id');
  if (!text(input.name, 'name', 200).trim()) throw new SceneError('invalid-value', 'must not be empty', 'name');
  text(input.note, 'note', 5000);
  if (typeof input.createdAt !== 'string' || Number.isNaN(Date.parse(input.createdAt))) throw new SceneError('invalid-value', 'must be an ISO date', 'createdAt');
  const scene = sceneCodec.validate(input.sceneSnapshot);
  if (input.workspace !== scene.workspace) throw new SceneError('invalid-value', 'must equal the scene workspace', 'workspace');
  const { sceneHash } = sceneCodec.fingerprint(scene);
  if (input.sceneHash !== sceneHash) throw new SceneError('hash-mismatch', 'sceneHash does not match the scene', 'sceneHash');
  const thumbnail = input.thumbnail;
  if (!isPlainObject(thumbnail)) throw new SceneError('invalid-value', 'must be an object', 'thumbnail');
  if (thumbnail.sourceSceneHash !== sceneHash) throw new SceneError('stale-thumbnail', 'the thumbnail shows a different scene', 'thumbnail.sourceSceneHash');
  text(thumbnail.sourceReportId, 'thumbnail.sourceReportId', 200);
  if (!THUMBNAIL_TYPES.includes(thumbnail.mediaType)) throw new SceneError('invalid-value', `must be one of ${THUMBNAIL_TYPES.join(', ')}`, 'thumbnail.mediaType');
  if (!(thumbnail.blob instanceof Blob) || thumbnail.blob.size === 0) throw new SceneError('invalid-value', 'must be a non-empty Blob', 'thumbnail.blob');
  const record = {
    schema: DISCOVERY_SCHEMA, schemaVersion: DISCOVERY_SCHEMA_VERSION, id: input.id, workspace: scene.workspace,
    name: input.name, note: input.note, createdAt: input.createdAt, sceneSnapshot: scene, sceneHash,
    thumbnail: { sourceSceneHash: sceneHash, sourceReportId: thumbnail.sourceReportId, mediaType: thumbnail.mediaType, blob: thumbnail.blob },
  };
  if ('card' in input) {
    if (scene.workspace !== 'space') throw new SceneError('invalid-value', 'only Space discoveries carry a card', 'card');
    const card = input.card;
    if (!isPlainObject(card) || Object.keys(card).sort().join() !== 'inspection,reportId,selectedPoint') throw new SceneError('invalid-value', 'must hold selectedPoint, inspection and reportId', 'card');
    record.card = structuredClone(card);
  }
  for (const key of ['sceneSnapshot', 'thumbnail']) Object.freeze(record[key]);
  return Object.freeze(record.card ? { ...record, card: deepFreeze(record.card) } : record);
}

export function createDiscoveryRecord({ scene, name, note = '', thumbnail, id, createdAt, sceneCodec }) {
  const { sceneHash } = sceneCodec.fingerprint(scene);
  return validateDiscovery({
    schema: DISCOVERY_SCHEMA, schemaVersion: DISCOVERY_SCHEMA_VERSION, id, workspace: scene.workspace, name, note, createdAt,
    sceneSnapshot: scene, sceneHash, thumbnail: { ...thumbnail, sourceSceneHash: sceneHash },
  }, sceneCodec);
}

// The local source over a PersistenceStore (shared/persistence.js, or a test fake). Every write
// commits, in the same transaction as the change, a write marker named by its `writeId`, so the
// outcome of that specific write can be confirmed later — never inferred from a matching record.
// Delivers a change to every listener; one listener's failure never stops the others and never
// changes the outcome of the write that caused it. Failures go to `onListenerError`.
export function deliver(listeners, change, onListenerError) {
  for (const listener of [...listeners]) {
    try { listener(change); } catch (error) { try { onListenerError(error, change); } catch { /* never escalate */ } }
  }
}
const reportListenerError = error => console.error('A discoveries listener failed:', error);

export function createLocalDiscoverySource({ store, sceneCodec, onListenerError = reportListenerError }) {
  const listeners = new Set();
  const notify = change => deliver(listeners, change, onListenerError);
  const entry = raw => {
    try { return { id: raw?.id, record: validateDiscovery(raw, sceneCodec) }; }
    catch (error) { return { id: typeof raw?.id === 'string' ? raw.id : '(unknown)', unsupported: error.message }; }
  };
  const marker = (writeId, op, id) => ({ store: 'writes', value: { writeId, op, id } });
  return Object.freeze({
    id: 'local', label: 'This browser', capabilities: Object.freeze({ save: true, remove: true, confirm: true }),
    async list({ workspace, limit = 50, cursor = null, signal }) {
      const page = await store.listDiscoveries({ workspace, limit, cursor, signal });
      const total = await store.countDiscoveries({ workspace, signal });
      return { items: page.items.map(entry), nextCursor: page.nextCursor, total };
    },
    async get(id, { signal } = {}) {
      const raw = await store.getDiscovery(id, { signal });
      return raw === null ? null : entry(raw);
    },
    async save(record, { signal, report, writeId }) {
      if (typeof writeId !== 'string' || !writeId) throw new SceneError('invalid-value', 'a save needs a writeId');
      const valid = validateDiscovery(record, sceneCodec);
      const puts = [{ store: 'discoveries', value: valid }, marker(writeId, 'save', valid.id)];
      if (report) {
        if (report.reportId !== valid.thumbnail.sourceReportId) throw new SceneError('invalid-value', 'the report is not the thumbnail\'s source report');
        if (report.sceneHash !== valid.sceneHash || report.outcome !== 'completed') throw new SceneError('invalid-value', 'the thumbnail\'s report must describe this scene\'s completed publication');
        puts.push({ store: 'reports', value: report });
      }
      const result = await store.commit({ puts, deletes: [] }, { signal });
      if (result.status === 'committed') notify({ type: 'saved', id: valid.id, workspace: valid.workspace });
      return result;
    },
    async remove(id, { signal, writeId }) {
      if (typeof writeId !== 'string' || !writeId) throw new SceneError('invalid-value', 'a removal needs a writeId');
      const result = await store.commit({ puts: [marker(writeId, 'remove', id)], deletes: [{ store: 'discoveries', key: id }] }, { signal });
      if (result.status === 'committed') notify({ type: 'removed', id });
      return result;
    },
    // true only if this specific write committed.
    async confirm(writeId, { signal } = {}) {
      // (reads only the marker this write committed)
      return (await store.getWriteMarker(writeId, { signal })) !== null;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
}

class Deadline extends Error { constructor() { super('timed out'); this.name = 'Deadline'; } }
function race(promise, ms, controller) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Deadline()); }, ms); })]).finally(() => clearTimeout(timer));
}
const DEFINITE = ['committed', 'aborted', 'failed'];
let writeCounter = 0;
const newWriteId = () => `write-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++writeCounter}`}`;

// The Discoveries control's state, without any DOM. Every read is bounded and carries a
// request identity: a refresh invalidates the source's earlier list and paging reads, and only
// the current request may publish. Every record shown or opened is validated here, whatever
// source supplied it. Writes are observed until their source reports a definite outcome.
export function createDiscoveriesController({ sources, sceneCodec, readTimeoutMs = 5000, writeWaitMs = 5000, reconcileAttempts = 3, onListenerError = reportListenerError }) {
  if (!sceneCodec) throw new TypeError('createDiscoveriesController requires sceneCodec');
  const listeners = new Set();
  let workspace = null, destroyed = false, openToken = 0;
  const views = Object.fromEntries(sources.map(source => [source.id, { status: 'idle', reason: '', items: [], nextCursor: null, total: null, generation: 0, pages: new Map(), reads: new Set() }]));
  const abortReads = view => { for (const controller of view.reads) controller.abort(); view.reads.clear(); view.pages.clear(); };
  const opens = new Set();
  const abortOpens = () => { for (const controller of opens) controller.abort(); opens.clear(); };
  const writes = new Map(), controllers = new Map();
  const bySource = Object.fromEntries(sources.map(source => [source.id, source]));
  const unsubscribe = sources.map(source => source.subscribe?.(() => { if (!destroyed && workspace) refresh(); }));

  const snapshot = () => Object.freeze({
    workspace,
    sources: Object.freeze(Object.fromEntries(sources.map(source => {
      const { generation, pages, reads, ...view } = views[source.id];
      return [source.id, Object.freeze({ label: source.label, ...view })];
    }))),
    writes: Object.freeze([...writes.values()].map(write => Object.freeze({ ...write }))),
  });
  const emit = () => { if (!destroyed) deliver(listeners, snapshot(), onListenerError); };

  // Every item is validated here, whatever its source said about it.
  const checked = (source, item) => {
    const base = { id: item.id, sourceId: source.id, key: `${source.id}:${item.id}` };
    if (!item.record) return Object.freeze({ ...base, unsupported: item.unsupported || 'the source could not read this record' });
    if (item.record.id !== item.id) return Object.freeze({ ...base, unsupported: 'the record\'s id differs from the listed id' });
    try {
      const record = validateDiscovery({ ...item.record, thumbnail: { ...item.record.thumbnail } }, sceneCodec);
      if (record.workspace !== workspace) return Object.freeze({ ...base, unsupported: 'this record belongs to another workspace' });
      return Object.freeze({ ...base, record });
    } catch (error) { return Object.freeze({ ...base, unsupported: error.message }); }
  };

  // One read. A refresh (cursor null) starts a new generation and aborts the source's earlier
  // reads; a page read for a cursor already in flight is the same read, and a page is appended
  // only if it is still the next page of the current generation.
  function load(source, cursor) {
    const view = views[source.id];
    if (cursor && view.pages.has(cursor)) return view.pages.get(cursor);
    if (!cursor) { view.generation++; abortReads(view); }
    const myGeneration = view.generation, myWorkspace = workspace, controller = new AbortController();
    view.reads.add(controller);
    const current = () => !destroyed && view.generation === myGeneration && workspace === myWorkspace && (!cursor || view.nextCursor === cursor);
    Object.assign(view, { status: 'loading', reason: '' });
    emit();
    const read = (async () => {
      try {
        const page = await race(source.list({ workspace: myWorkspace, limit: 50, cursor, signal: controller.signal }), readTimeoutMs, controller);
        if (!current()) return 'discarded';
        const items = page.items.map(item => checked(source, item));
        Object.assign(view, { status: 'ready', reason: '', items: cursor ? [...view.items, ...items] : items, nextCursor: page.nextCursor, total: Number.isInteger(page.total) ? page.total : null });
      } catch (error) {
        if (!current()) return 'discarded';
        Object.assign(view, { status: 'unavailable', reason: error instanceof Deadline ? 'did not respond in time' : error.message });
      } finally {
        view.reads.delete(controller);
        if (cursor && view.pages.get(cursor) === read) view.pages.delete(cursor);
      }
      emit();
      return view.status;
    })();
    if (cursor) view.pages.set(cursor, read);
    return read;
  }

  function refresh() { return Promise.all(sources.map(source => load(source, null))); }

  function settleWrite(write, status, reason = '') {
    const definite = DEFINITE.includes(status);
    if (write.status === 'pending' || write.status === 'checking' || (write.status === 'unknown' && definite)) {
      Object.assign(write, { status, reason });
      emit();
      if (status === 'committed' && !destroyed && workspace) refresh();
    }
  }

  async function confirmWrite(write) {
    const source = bySource[write.sourceId];
    if (typeof source.confirm !== 'function') return false;
    const controller = new AbortController();
    try { return await race(source.confirm(write.writeId, { signal: controller.signal }), readTimeoutMs, controller); } catch { return false; }
  }

  async function observe(kind, source, id, operation) {
    const writeId = newWriteId(), controller = new AbortController();
    const write = { writeId, kind, sourceId: source.id, id, status: 'pending', reason: '' };
    writes.set(writeId, write);
    controllers.set(writeId, controller);
    emit();
    // The source's definite outcome is authoritative whenever it arrives, even after `unknown`.
    const outcome = operation(writeId, controller.signal).then(result => settleWrite(write, result.status, result.reason || ''), error => settleWrite(write, 'failed', error.message));
    outcome.finally(() => controllers.delete(writeId));
    let timer;
    const waited = await Promise.race([outcome.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), writeWaitMs); })]);
    clearTimeout(timer);
    if (!waited) {
      settleWrite(write, 'checking', 'the result is still being checked');
      for (let attempt = 0; attempt < reconcileAttempts && write.status === 'checking'; attempt++) {
        if (await confirmWrite(write)) settleWrite(write, 'committed', 'confirmed by this write\'s marker');
        if (write.status === 'checking') await Promise.race([outcome, new Promise(resolve => setTimeout(resolve, readTimeoutMs))]);
      }
      if (write.status === 'checking') { write.status = 'unknown'; write.reason = 'the outcome is unknown; check again'; emit(); }
    }
    return Object.freeze({ ...write });
  }

  return Object.freeze({
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    // A workspace change invalidates every read and every pending open, and clears the old results.
    setWorkspace(next) {
      workspace = next; openToken++; abortOpens();
      for (const view of Object.values(views)) Object.assign(view, { items: [], nextCursor: null, total: null });
      return refresh();
    },
    refresh,
    nextPage(sourceId) { const view = views[sourceId]; return view?.nextCursor ? load(bySource[sourceId], view.nextCursor) : Promise.resolve('none'); },
    // Requests an abort. The outcome still comes from the source: a committed write stays committed.
    cancelWrite(writeId) { controllers.get(writeId)?.abort(); },
    // The "check again" action for an unknown outcome; it never repeats the write.
    async reconcile(writeId) {
      const write = writes.get(writeId);
      if (write && (write.status === 'unknown' || write.status === 'checking') && await confirmWrite(write)) settleWrite(write, 'committed', 'confirmed by this write\'s marker');
      await refresh();
      return write ? Object.freeze({ ...write }) : null;
    },
    // Only the latest open may resolve; an obsolete selection is rejected.
    async open(sourceId, id) {
      const token = ++openToken, controller = new AbortController();
      abortOpens();
      opens.add(controller);
      let found;
      try { found = await race(bySource[sourceId].get(id, { signal: controller.signal }), readTimeoutMs, controller); }
      catch (error) { if (token !== openToken || destroyed) throw new SceneError('superseded', 'a newer selection or workspace replaced this one'); throw error; }
      finally { opens.delete(controller); }
      if (token !== openToken || destroyed) throw new SceneError('superseded', 'a newer selection or workspace replaced this one');
      if (!found) throw new SceneError('not-found', 'this discovery no longer exists');
      if (found.id !== id) throw new SceneError('unsupported', 'the source returned a different discovery');
      const item = checked(bySource[sourceId], found);
      if (!item.record) throw new SceneError('unsupported', `this discovery cannot be opened: ${item.unsupported}`);
      return item.record;
    },
    save(sourceId, record, options = {}) {
      const source = bySource[sourceId];
      return observe('save', source, record.id, (writeId, signal) => source.save(record, { ...options, writeId, signal }));
    },
    remove(sourceId, id) {
      const source = bySource[sourceId];
      return observe('remove', source, id, (writeId, signal) => source.remove(id, { writeId, signal }));
    },
    destroy() { destroyed = true; openToken++; abortOpens(); for (const view of Object.values(views)) abortReads(view); listeners.clear(); unsubscribe.forEach(stop => stop?.()); },
  });
}
````

- [ ] **Step 5: Run the unit tests**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"114 tests passed","files":11,…}` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/discoveries.js tests/support/fake-persistence.mjs tests/unit/discoveries.test.js tests/unit.manifest.json
git commit -m "Add discovery records, the local source contract and the discoveries controller"
```

- [ ] **Step 7: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 8: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T10: IndexedDB persistence (spec §14)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** T09.

Node tests cover the open protocol (unavailable, blocked, failed, late and timed-out opens). Commit, whole-batch rollback, cancellation before commit, reopen and a blocked upgrade run against real IndexedDB in the workflow suite, from the application page (the server refuses fixtures under `tests/`).

**Files:**
- Create: `src/shared/persistence.js`
- Modify: `tests/unit.manifest.json`, `tests/workflow.mjs`, `tests/suites.manifest.json`
- Test: `tests/unit/persistence.test.js`

**Interfaces:**
- Consumes: the persistence port (T09).
- Produces: `DATABASE_NAME = "atlas-workbench"`, `DATABASE_VERSION = 1`, `STORES` (`discoveries`, `reports`, `writes`), `PersistenceError {code: "unavailable"|"blocked"|"timed-out"}`, `openPersistence({indexedDB?, databaseName?, version?, timeoutMs = 5000}) → Promise<store>` implementing the port. Success means the transaction's `complete` event; a cancelled read rejects with `AbortError` and its result is ignored.

**Design assertions:**
- Spec §14: no fallback store and no false success (`missing IndexedDB is reported as unavailable, never replaced by another store`); a bounded, classified open (`opening is bounded, and a blocked or failed open is classified`).
- In a real browser: whole-batch commit including the write marker, whole-batch rollback (the complete old value survives and the rolled-back marker is absent), cancellation before commit, reopen, count, cancelled reads and a blocked upgrade (`IndexedDB commits whole batches, rolls back, cancels and reopens`).

- [ ] **Step 1: Write the failing tests**

**`tests/unit/persistence.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPersistence, PersistenceError, DATABASE_NAME, DATABASE_VERSION } from '../../src/shared/persistence.js';

// Node has no IndexedDB: these tests drive the open protocol with a scripted request.
// Commits, rollback and reopen run against real IndexedDB in tests/workflow.mjs.
function scriptedIndexedDB(script) {
  const opened = [];
  return { opened, open(name, version) { const request = {}; opened.push({ name, version }); setTimeout(() => script(request), 0); return request; } };
}

test('missing IndexedDB is reported as unavailable, never replaced by another store', async () => {
  await assert.rejects(openPersistence({ indexedDB: undefined }), error => error instanceof PersistenceError && error.code === 'unavailable');
});

test('opening is bounded, and a blocked or failed open is classified', async () => {
  const silent = scriptedIndexedDB(() => {});
  await assert.rejects(openPersistence({ indexedDB: silent, timeoutMs: 20 }), error => error.code === 'timed-out');
  assert.deepEqual(silent.opened, [{ name: DATABASE_NAME, version: DATABASE_VERSION }]);
  await assert.rejects(openPersistence({ indexedDB: scriptedIndexedDB(request => request.onblocked()), timeoutMs: 200 }), error => error.code === 'blocked');
  await assert.rejects(openPersistence({ indexedDB: scriptedIndexedDB(request => { request.error = new Error('denied'); request.onerror(); }), timeoutMs: 200 }), error => error.code === 'unavailable' && /denied/.test(error.message));
});

test('a connection that arrives after the deadline is closed, not used', async () => {
  let closed = false;
  const late = scriptedIndexedDB(request => setTimeout(() => { request.result = { close: () => { closed = true; } }; request.onsuccess(); }, 40));
  await assert.rejects(openPersistence({ indexedDB: late, timeoutMs: 10 }), error => error.code === 'timed-out');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(closed, true);
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js",
    "tests/unit/gestures.test.js",
    "tests/unit/render-adapter.test.js",
    "tests/unit/renderer-guards.test.js",
    "tests/unit/export.test.js",
    "tests/unit/discoveries.test.js",
    "tests/unit/persistence.test.js"
  ]
}
````

**`tests/workflow.mjs`** (complete file):

````js
// Project 1a workflows in a real browser (SwiftShader WebGL, headless): native scenes,
// undo and camera history, startup and invalid links. GREEN only: never part of a RED run.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('workflow');
await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const reportPath = 'artifacts/workflow-report.json';
const report = [], errors = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const INITIAL = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };
let server, browser;

async function open(context, hash = '') {
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${url}/${hash}`, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  return page;
}
const state = page => ev(page, () => ({ scene: atlas.scene, history: atlas.history, rendered: atlas.rendered }));
const VIEW_B = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4.2 };
const VIEW_C = { re: '0.276', im: '0.008', zoom: 2.4 };
const VIEW_D = { re: '-1.762', im: '0', zoom: 1.6 };

// Real IndexedDB: commit, whole-batch rollback, cancellation before commit, reopen, blocked upgrade.
function checkIndexedDb(page) {
  return within(page.evaluate(async () => {
    const { openPersistence } = await import('/src/shared/persistence.js');
    const name = `atlas-test-${Date.now()}`;
    const value = (id, note) => ({ id, workspace: 'plane', createdAt: '2026-10-20T00:00:00.000Z', note, thumbnail: { blob: new Blob(['x']) } });
    const results = {};
    const store = await openPersistence({ databaseName: name });
    results.commit = (await store.commit({ puts: [{ store: 'discoveries', value: value('a', 'old') }, { store: 'reports', value: { reportId: 'r1' } }, { store: 'writes', value: { writeId: 'w1', op: 'save', id: 'a' } }] })).status;
    results.rollback = (await store.commit({ puts: [{ store: 'discoveries', value: value('a', 'new') }, { store: 'writes', value: { writeId: 'w2', op: 'save', id: 'a' } }, { store: 'reports', value: { noKey: true } }] })).status;
    results.rolledBackMarker = await store.getWriteMarker('w2');
    results.afterRollback = (await store.getDiscovery('a')).note;
    const controller = new AbortController();
    const pending = store.commit({ puts: [{ store: 'discoveries', value: value('b', 'x') }] }, { signal: controller.signal });
    controller.abort();
    results.aborted = (await pending).status;
    results.abortedAbsent = (await store.getDiscovery('b')) === null;
    store.close();
    const reopened = await openPersistence({ databaseName: name });
    const fetched = await reopened.getDiscovery('a');
    results.reopened = fetched.note;
    results.blobSize = fetched.thumbnail.blob.size;
    results.list = (await reopened.listDiscoveries({ workspace: 'plane', limit: 10 })).items.map(item => item.id);
    results.count = await reopened.countDiscoveries({ workspace: 'plane' });
    results.marker = (await reopened.getWriteMarker('w1'))?.id ?? null;
    const cancelled = new AbortController(); cancelled.abort();
    results.cancelledRead = await reopened.getDiscovery('a', { signal: cancelled.signal }).then(() => 'resolved', error => error.name);
    reopened.close();
    const raw = await new Promise((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await openPersistence({ databaseName: name, version: 2, timeoutMs: 3000 }); results.blocked = 'opened'; }
    catch (error) { results.blocked = error.code; }
    raw.close();
    await new Promise(resolve => { const request = indexedDB.deleteDatabase(name); request.onsuccess = request.onerror = request.onblocked = resolve; });
    return results;
  }), LIMITS.operation, 'IndexedDB checks');
}

// Installed on every context that runs the export checks: while `__holdWorkers` is set, messages
// to workers (reference orbits, CPU tiles) are queued until `__releaseWorkers()`.
const holdWorkersScript = () => {
  const post = Worker.prototype.postMessage;
  window.__heldWorkerMessages = [];
  Worker.prototype.postMessage = function (...args) {
    if (window.__holdWorkers) { window.__heldWorkerMessages.push(() => post.apply(this, args)); return; }
    return post.apply(this, args);
  };
  window.__releaseWorkers = () => { window.__holdWorkers = false; const held = window.__heldWorkerMessages.splice(0); held.forEach(send => send()); return held.length; };
};

// One export of the current viewport of `view`. With `withEdits`, three phases are witnessed
// before the page edits the live scene: admission held by a hook; the export render pending on a
// held worker message (the view is switched away and back first, so the export misses the
// renderer's reference cache, and nothing has been published); encoding held by a hook.
async function exportViewport(page, view, withEdits) {
  if (withEdits) await within(page.evaluate(async other => { atlas.goTo(other); await atlas.whenIdle(); }, VIEW_C), LIMITS.deep, 'move away to empty the reference cache');
  await ev(page, ({ target, edits }) => {
    window.__exportStages = [];
    const holds = {};
    window.__releaseExport = name => holds[name]?.();
    atlas.setExportHooks({
      stage(name) { window.__exportStages.push(name); },
      hold: name => (edits && (name === 'admission' || name === 'encoding') ? new Promise(resolve => { holds[name] = resolve; }) : undefined),
    });
    document.querySelector('#export-size').value = 'current';
    atlas.goTo(target);
    window.__holdWorkers = edits;
    document.querySelector('#download-image').click();
  }, { target: view, edits: withEdits });
  if (withEdits) {
    await page.waitForFunction(() => window.__exportStages.includes('admission'), null, { timeout: LIMITS.operation });
    await ev(page, other => { document.querySelector('[data-palette="aurora"]').click(); atlas.goTo(other); window.__releaseExport('admission'); }, VIEW_C);
    await page.waitForFunction(() => window.__exportStages.includes('render-submitted') && window.__heldWorkerMessages.length > 0, null, { timeout: LIMITS.operation });
    const pending = await ev(page, () => ({ stages: [...window.__exportStages], lastExport: atlas.lastExport }));
    assert.ok(!pending.stages.includes('encoding'), 'the export render is still pending on its held worker message');
    await ev(page, other => { document.querySelector('[data-palette="rose"]').click(); atlas.goTo(other); return window.__releaseWorkers(); }, VIEW_D);
    await page.waitForFunction(() => window.__exportStages.includes('encoding'), null, { timeout: LIMITS.deep });
    await ev(page, other => { document.querySelector('[data-palette="ocean"]').click(); atlas.goTo(other); window.__releaseExport('encoding'); }, VIEW_D);
  }
  await page.waitForFunction(() => window.__exportStages.includes('finished'), null, { timeout: LIMITS.deep });
  const result = await ev(page, () => ({ lastExport: atlas.lastExport, scene: atlas.scene, stages: window.__exportStages }), undefined, 'export result');
  await ev(page, () => atlas.setExportHooks(null));
  await idleWithin(page, LIMITS.deep);
  return result;
}

// The same export with and without edits during admission, rendering and encoding must decode to
// identical RGBA pixels (compared in the page), and must report the scene captured at the click.
async function checkExportImmutability(page, label) {
  await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_B), LIMITS.deep, 'go to B');
  const exportedScene = await ev(page, () => atlas.scene);
  const baseline = await exportViewport(page, VIEW_B, false);
  await ev(page, async () => { window.__baselineImage = await atlas.lastExportImageData(); }, undefined, 'decode baseline', LIMITS.deep);
  const raced = await exportViewport(page, VIEW_B, true);
  assert.deepEqual(raced.stages, ['reserved', 'admission', 'render-submitted', 'encoding', 'finished'], `${label}: every stage was reached`);
  for (const result of [baseline, raced]) {
    assert.equal(result.lastExport.outcome, 'completed', label);
    assert.equal(result.lastExport.report.outcome, 'completed');
    assert.deepEqual(result.lastExport.scene, exportedScene, `${label}: the export reports the scene captured at the click`);
  }
  const pixels = await ev(page, async () => {
    const before = window.__baselineImage, after = await atlas.lastExportImageData();
    let differing = 0;
    for (let i = 0; i < before.data.length; i++) if (before.data[i] !== after.data[i]) differing++;
    return { width: [before.width, after.width], height: [before.height, after.height], samples: after.data.length / 4, differing };
  }, undefined, 'compare pixels', LIMITS.deep);
  assert.equal(pixels.width[0], pixels.width[1]); assert.equal(pixels.height[0], pixels.height[1]);
  assert.ok(pixels.samples > 0);
  assert.equal(pixels.differing, 0, `${label}: edits during admission, rendering and encoding changed the exported pixels`);
  assert.deepEqual(raced.scene.camera, VIEW_D, 'the live scene kept the later edits');
  assert.equal(raced.scene.appearance.palette, 'ocean');
}

// A context loss while encoding is held, in both orders of restoration and lease release. The
// loss and restoration events are witnessed; the export is interrupted, nothing is published while
// the renderer is lost, the replacement waits for the lease, and live rendering resumes on one
// renderer shared by the workspace and the adapter.
async function checkContextLossDuringExport(page, restoreFirst) {
  await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_B), LIMITS.deep, 'go to B');
  await ev(page, () => {
    window.__contextEvents = [];
    if (!window.__contextListening) {
      window.__contextListening = true;
      const canvas = document.querySelector('#fractal');
      canvas.addEventListener('webglcontextlost', () => window.__contextEvents.push('lost'));
      canvas.addEventListener('webglcontextrestored', () => window.__contextEvents.push('restored'));
    }
    window.__exportStages = [];
    const holds = {};
    window.__releaseExport = name => holds[name]?.();
    atlas.setExportHooks({ stage(name) { window.__exportStages.push(name); }, hold: name => (name === 'encoding' ? new Promise(resolve => { holds[name] = resolve; }) : undefined) });
    document.querySelector('#export-size').value = 'current';
    document.querySelector('#download-image').click();
  });
  await page.waitForFunction(() => window.__exportStages.includes('encoding'), null, { timeout: LIMITS.deep });
  await ev(page, () => { window.__loseContext = atlas.renderer.gl.getExtension('WEBGL_lose_context'); window.__loseContext.loseContext(); });
  await page.waitForFunction(() => window.__contextEvents.includes('lost'), null, { timeout: LIMITS.operation });
  if (restoreFirst) {
    await ev(page, () => window.__loseContext.restoreContext());
    await page.waitForFunction(() => window.__contextEvents.includes('restored'), null, { timeout: LIMITS.operation });
  }
  const beforeRelease = await ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null }));
  await ev(page, () => window.__releaseExport('encoding'));
  await page.waitForFunction(() => window.__exportStages.includes('finished'), null, { timeout: LIMITS.deep });
  await ev(page, () => atlas.setExportHooks(null));
  if (!restoreFirst) {
    await page.waitForTimeout(500);
    const gap = await ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null, events: [...window.__contextEvents] }));
    assert.deepEqual(gap, { ...beforeRelease, events: ['lost'] }, 'nothing renders or publishes while the context is lost');
    await ev(page, () => window.__loseContext.restoreContext());
    await page.waitForFunction(() => window.__contextEvents.includes('restored'), null, { timeout: LIMITS.operation });
  }
  await page.waitForFunction(count => atlas.rendered > count, beforeRelease.rendered, { timeout: LIMITS.deep });
  const after = await ev(page, () => ({ outcome: atlas.lastExport.outcome, report: atlas.lastExport.report.outcome, consistent: atlas.rendererConsistent, exportButtonBusy: document.querySelector('#download-image').disabled, events: window.__contextEvents }));
  assert.deepEqual(after, { outcome: 'interrupted', report: 'interrupted', consistent: true, exportButtonBusy: false, events: ['lost', 'restored'] });
}

try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'pipe' });
    await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  await context.addInitScript(holdWorkersScript);
  const page = await open(context);

  const fresh = await state(page);
  assert.equal(fresh.scene.workspace, 'plane');
  assert.deepEqual(fresh.scene.camera, INITIAL);
  assert.equal(fresh.history.canBack, false);
  assert.equal(fresh.history.canUndo, false);
  pass('Fresh start opens Plane at the default view');

  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await idleWithin(page);
  const zoomed = await state(page);
  assert.equal(zoomed.scene.appearance.palette, 'aurora');
  await page.keyboard.press('Control+z');
  const undone = await state(page);
  assert.equal(undone.scene.appearance.palette, 'ember');
  assert.deepEqual(undone.scene.camera, zoomed.scene.camera, 'undoing the palette keeps the camera');
  assert.equal(undone.rendered, zoomed.rendered, 'an appearance undo recolors without recalculating');
  pass('Palette edit, navigation and undo keep the camera');

  const urlBefore = page.url();
  await ev(page, () => { window.__atlasPageMarker = 'still-here'; });
  await page.keyboard.press('Alt+ArrowLeft');
  await idleWithin(page);
  assert.equal(page.url(), urlBefore, 'Alt+Left must not navigate the browser');
  assert.equal(await ev(page, () => window.__atlasPageMarker), 'still-here', 'the page was not reloaded or replaced');
  const back = await state(page);
  assert.deepEqual(back.scene.camera, INITIAL);
  assert.equal(back.scene.appearance.palette, 'ember', 'Back moves only the camera');
  await page.keyboard.press('Alt+ArrowRight');
  await idleWithin(page);
  assert.deepEqual((await state(page)).scene.camera, zoomed.scene.camera);
  pass('Camera back and forward restore poses without touching content');

  const beforeEntry = await state(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('1e1000000000000'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('0');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  assert.match(await page.locator('#coordinate-error').textContent(), /budget/);
  assert.equal(await page.locator('#input-re').inputValue(), '1e1000000000000', 'the requested text is preserved');
  await page.keyboard.press('Escape');
  const afterEntry = await state(page);
  assert.deepEqual(afterEntry.scene, beforeEntry.scene);
  assert.deepEqual(afterEntry.history, beforeEntry.history, 'neither history changes');
  pass('An oversized coordinate is rejected before it is expanded');

  const beforeDrag = await state(page);
  await page.locator('#phase').scrollIntoViewIfNeeded();
  const slider = await page.locator('#phase').boundingBox();
  await page.mouse.move(slider.x + slider.width * 0.2, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterDrag = await state(page);
  assert.notEqual(afterDrag.scene.appearance.phase, beforeDrag.scene.appearance.phase);
  assert.equal(afterDrag.history.undoDepth, beforeDrag.history.undoDepth + 1, 'one drag is one undo entry');
  await ev(page, () => document.activeElement?.blur());
  await page.keyboard.press('Control+z');
  assert.equal((await state(page)).scene.appearance.phase, beforeDrag.scene.appearance.phase);
  pass('A slider drag is one undo entry');

  const beforeWheel = await state(page);
  await within(page.evaluate(async () => {
    const surface = document.querySelector('#fractal-surface');
    for (let i = 0; i < 5; i++) {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, clientX: 640, clientY: 360, bubbles: true, cancelable: true }));
      await new Promise(resolveStep => setTimeout(resolveStep, 15));
    }
    await new Promise(resolveQuiet => setTimeout(resolveQuiet, 400));
    await atlas.whenIdle();
  }), LIMITS.operation, 'wheel burst');
  const afterWheel = await state(page);
  assert.ok(afterWheel.scene.camera.zoom > beforeWheel.scene.camera.zoom);
  assert.equal(afterWheel.history.camera.length, beforeWheel.history.camera.index + 2, 'a wheel burst is one camera-history entry');
  assert.equal(afterWheel.history.undoDepth, beforeWheel.history.undoDepth, 'navigation never adds an undo entry');
  pass('A wheel burst is one camera-history entry');

  const before = await state(page);
  await ev(page, () => { location.hash = '#scene=@@@'; });
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('visible'), null, { timeout: LIMITS.operation });
  assert.match(await page.locator('#toast').textContent(), /unchanged/);
  const after = await state(page);
  assert.deepEqual(after.scene, before.scene);
  assert.deepEqual(after.history, before.history, 'neither history changes');
  pass('An invalid link during an investigation changes nothing');

  assert.deepEqual(await checkIndexedDb(page), {
    commit: 'committed', rollback: 'failed', afterRollback: 'old', aborted: 'aborted', abortedAbsent: true,
    reopened: 'old', blobSize: 1, list: ['a'], blocked: 'blocked', rolledBackMarker: null, count: 1, marker: 'a', cancelledRead: 'AbortError',
  });
  pass('IndexedDB commits whole batches, rolls back, cancels and reopens');

  await checkExportImmutability(page, 'WebGL');
  pass('An edit during a WebGL export does not change the exported image');
  await checkContextLossDuringExport(page, true);
  await checkContextLossDuringExport(page, false);
  pass('A context loss during an export interrupts it and live rendering resumes');

  const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  await cpuContext.addInitScript(holdWorkersScript);
  await cpuContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  const cpu = await open(cpuContext);
  assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
  await checkExportImmutability(cpu, 'CPU');
  await closeWithin(cpuContext, 'cpuContext');
  pass('An edit during a CPU export does not change the exported image');

  const earlier = await open(context, '#re=-2&im=0&z=40&palette=rose');
  assert.deepEqual((await state(earlier)).scene.camera, INITIAL);
  assert.match(await earlier.locator('#toast').textContent(), /earlier ATLAS format/);
  pass('An earlier-format link opens fresh-start Plane with a notice');

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
````

**`tests/suites.manifest.json`** (complete file):

````json
{
  "build": {
    "requiredFiles": [
      "dist/index.html",
      "dist/src/app.js"
    ]
  },
  "suites": [
    {
      "id": "browser",
      "gpu": false,
      "command": [
        "tests/browser.mjs"
      ],
      "report": "artifacts/browser-report.json",
      "evidence": "browser",
      "requiredPasses": [
        "Desktop WebGL startup and unobstructed controls",
        "WebGL acceleration is labeled accurately and exposes its actual renderer",
        "Instant palette changes without recalculating the fractal",
        "Wheel zoom and pointer drag",
        "GPU escape values agree with independent BigInt oracle",
        "Laptop layout keeps exact-coordinate navigation accessible",
        "Repeated GPU navigation reaches the latest view and full resolution",
        "Bookmarks persist across reloads",
        "Cinema mode, keyboard shortcuts, and accessible help dialog",
        "Arbitrary coordinate navigation enters extended GPU mode",
        "Shared URL restores precision and settings",
        "PNG export",
        "JSON location export and import preserve exact coordinates",
        "Journey animates and manual navigation stops it",
        "Mobile layout, settings, touch drag, and cursor-centered pinch zoom",
        "CPU worker escape values agree with independent BigInt oracle",
        "CPU palette caching, render cancellation, and responsive navigation",
        "Automatic CPU fallback when webgl2 is unavailable",
        "Automatic CPU fallback when float-targets is unavailable",
        "No browser runtime errors"
      ]
    },
    {
      "id": "workflow",
      "gpu": false,
      "command": [
        "tests/workflow.mjs"
      ],
      "report": "artifacts/workflow-report.json",
      "evidence": "workflow",
      "requiredPasses": [
        "Fresh start opens Plane at the default view",
        "Palette edit, navigation and undo keep the camera",
        "Camera back and forward restore poses without touching content",
        "An oversized coordinate is rejected before it is expanded",
        "A slider drag is one undo entry",
        "A wheel burst is one camera-history entry",
        "An invalid link during an investigation changes nothing",
        "IndexedDB commits whole batches, rolls back, cancels and reopens",
        "An edit during a WebGL export does not change the exported image",
        "A context loss during an export interrupts it and live rendering resumes",
        "An edit during a CPU export does not change the exported image",
        "An earlier-format link opens fresh-start Plane with a notice",
        "No browser runtime errors"
      ]
    },
    {
      "id": "browser-hardware",
      "gpu": true,
      "command": [
        "tests/browser.mjs",
        "--hardware"
      ],
      "report": "artifacts/hardware-browser-report.json",
      "evidence": "browser",
      "requiredPasses": [
        "Desktop WebGL startup and unobstructed controls",
        "WebGL acceleration is labeled accurately and exposes its actual renderer",
        "Instant palette changes without recalculating the fractal",
        "Wheel zoom and pointer drag",
        "GPU escape values agree with independent BigInt oracle",
        "Laptop layout keeps exact-coordinate navigation accessible",
        "Repeated GPU navigation reaches the latest view and full resolution",
        "Bookmarks persist across reloads",
        "Cinema mode, keyboard shortcuts, and accessible help dialog",
        "Arbitrary coordinate navigation enters extended GPU mode",
        "Shared URL restores precision and settings",
        "PNG export",
        "JSON location export and import preserve exact coordinates",
        "Journey animates and manual navigation stops it",
        "Mobile layout, settings, touch drag, and cursor-centered pinch zoom",
        "CPU worker escape values agree with independent BigInt oracle",
        "CPU palette caching, render cancellation, and responsive navigation",
        "Automatic CPU fallback when webgl2 is unavailable",
        "Automatic CPU fallback when float-targets is unavailable",
        "No browser runtime errors"
      ]
    },
    {
      "id": "navigation",
      "gpu": false,
      "command": [
        "tests/navigation.mjs"
      ],
      "report": "artifacts/navigation-report.json",
      "evidence": "navigation"
    },
    {
      "id": "graphics",
      "gpu": true,
      "benchmark": true,
      "command": [
        "tests/graphics.mjs",
        "--chrome",
        "--headed",
        "--compositor",
        "--benchmark"
      ],
      "report": "artifacts/graphics-report.json",
      "evidence": "graphics"
    }
  ]
}
````

- [ ] **Step 2: Write the interface skeleton**

**`src/shared/persistence.js`** (complete file — interface skeleton):

````js
// T10 interface skeleton. Replaced in full by the implementation step.
export const DATABASE_NAME = 'atlas-workbench';
export const DATABASE_VERSION = 1;
export const STORES = Object.freeze({ discoveries: 'id', reports: 'reportId', writes: 'writeId' });
export class PersistenceError extends Error {}
export const openPersistence = async () => ({});
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/persistence.test.js --expect-fail "missing IndexedDB is reported as unavailable, never replaced by another store"
```
Expected: `RED confirmed: "missing IndexedDB is reported as unavailable, never replaced by another store" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the implementation (replacing the skeleton)**

**`src/shared/persistence.js`** (complete file):

````js
// The browser's durable store (spec §14): IndexedDB database `atlas-workbench`, version 1,
// with `discoveries` (thumbnail Blob inline), `reports` and `writes` (one marker per committed
// write, so a write's outcome can be confirmed by its identity). A batch commits in one
// transaction and succeeds only on the transaction's `complete` event. There is no fallback
// store: if IndexedDB is unavailable, saving reports that, never a false success.
export const DATABASE_NAME = 'atlas-workbench';
export const DATABASE_VERSION = 1;
export const STORES = Object.freeze({ discoveries: 'id', reports: 'reportId', writes: 'writeId' });

export class PersistenceError extends Error {
  constructor(code, message) { super(message); this.name = 'PersistenceError'; this.code = code; }
}

export function openPersistence({ indexedDB = globalThis.indexedDB, databaseName = DATABASE_NAME, version = DATABASE_VERSION, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new PersistenceError('unavailable', 'This browser does not provide IndexedDB storage.')); return; }
    let settled = false, request;
    const fail = (code, message) => { if (!settled) { settled = true; clearTimeout(timer); reject(new PersistenceError(code, message)); } };
    const timer = setTimeout(() => fail('timed-out', `Opening browser storage took longer than ${timeoutMs} ms.`), timeoutMs);
    try { request = indexedDB.open(databaseName, version); }
    catch (error) { fail('unavailable', error.message); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('discoveries')) db.createObjectStore('discoveries', { keyPath: 'id' }).createIndex('byWorkspaceCreated', ['workspace', 'createdAt']);
      if (!db.objectStoreNames.contains('reports')) db.createObjectStore('reports', { keyPath: 'reportId' });
      if (!db.objectStoreNames.contains('writes')) db.createObjectStore('writes', { keyPath: 'writeId' });
    };
    request.onblocked = () => fail('blocked', 'Browser storage is blocked by another open ATLAS tab.');
    request.onerror = () => fail('unavailable', request.error?.message || 'Browser storage could not be opened.');
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true; clearTimeout(timer);
      db.onversionchange = () => db.close();
      resolve(createStore(db));
    };
  });
}

const done = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

// IndexedDB reads cannot be interrupted; a cancelled read rejects at once and its result is ignored.
function cancellable(promise, signal) {
  if (!signal) return promise;
  const cancelled = () => Object.assign(new Error('The read was cancelled.'), { name: 'AbortError' });
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', onAbort); resolve(value); }, error => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}

function createStore(db) {
  async function readPage({ workspace, limit, cursor }) {
    const index = db.transaction('discoveries', 'readonly').objectStore('discoveries').index('byWorkspaceCreated');
    const range = IDBKeyRange.bound([workspace, ''], [workspace, '\uffff']);
    const skip = cursor ? Number(cursor) : 0;
    const items = [];
    await new Promise((resolve, reject) => {
      const request = index.openCursor(range, 'prev');
      let advanced = skip === 0;
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const position = request.result;
        if (!position) { resolve(); return; }
        if (!advanced) { advanced = true; position.advance(skip); return; }
        items.push(position.value);
        if (items.length > limit) { resolve(); return; }
        position.continue();
      };
    });
    return { items: items.slice(0, limit), nextCursor: items.length > limit ? String(skip + limit) : null };
  }
  return Object.freeze({
    listDiscoveries({ workspace, limit = 50, cursor = null, signal }) { return cancellable(readPage({ workspace, limit, cursor }), signal); },
    countDiscoveries({ workspace, signal }) {
      const range = IDBKeyRange.bound([workspace, ''], [workspace, '\uffff']);
      return cancellable(done(db.transaction('discoveries', 'readonly').objectStore('discoveries').index('byWorkspaceCreated').count(range)), signal);
    },
    getDiscovery(id, { signal } = {}) {
      return cancellable(done(db.transaction('discoveries', 'readonly').objectStore('discoveries').get(id)).then(value => value ?? null), signal);
    },
    getWriteMarker(writeId, { signal } = {}) {
      return cancellable(done(db.transaction('writes', 'readonly').objectStore('writes').get(writeId)).then(value => value ?? null), signal);
    },
    // → { status: 'committed' } | { status: 'aborted' | 'failed', reason }
    commit({ puts = [], deletes = [] }, { signal } = {}) {
      return new Promise(resolve => {
        if (signal?.aborted) { resolve({ status: 'aborted', reason: 'cancelled before the transaction started' }); return; }
        const names = [...new Set([...puts, ...deletes].map(operation => operation.store))];
        let transaction, cancelled = false;
        try { transaction = db.transaction(names, 'readwrite'); }
        catch (error) { resolve({ status: 'failed', reason: error.message }); return; }
        const onAbortSignal = () => { cancelled = true; try { transaction.abort(); } catch { /* already finished: its own outcome stands */ } };
        signal?.addEventListener('abort', onAbortSignal, { once: true });
        transaction.oncomplete = () => { signal?.removeEventListener('abort', onAbortSignal); resolve({ status: 'committed' }); };
        transaction.onabort = () => {
          signal?.removeEventListener('abort', onAbortSignal);
          resolve(cancelled ? { status: 'aborted', reason: 'cancelled before commit' } : { status: 'failed', reason: transaction.error?.name || 'the transaction was aborted' });
        };
        try {
          for (const { store, value } of puts) transaction.objectStore(store).put(value);
          for (const { store, key } of deletes) transaction.objectStore(store).delete(key);
        } catch (error) {
          cancelled = false;
          try { transaction.abort(); } catch { /* already aborting */ }
          signal?.removeEventListener('abort', onAbortSignal);
          resolve({ status: 'failed', reason: error.name || error.message });
        }
      });
    },
    close() { db.close(); },
  });
}
````

- [ ] **Step 5: Run the unit tests**

Run:
```bash
npm test && node --check tests/workflow.mjs
```
Expected: `UNIT {"state":"passed","reason":"117 tests passed","files":12,…}` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/persistence.js tests/unit/persistence.test.js tests/unit.manifest.json tests/workflow.mjs tests/suites.manifest.json
git commit -m "Add IndexedDB persistence with committed-only success"
```

- [ ] **Step 7: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 8: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T11: The Discoveries control (spec §13.10)

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** T09.

**Files:**
- Create: `src/ui/discoveries.js`
- Modify: `tests/unit.manifest.json`
- Test: `tests/unit/discoveries-control.test.js`

**Interfaces:**
- Consumes: the controller snapshot (T09); `icon` (`src/ui/icons.js`).
- Produces: `EMPTY_MESSAGE`, `discoveryCards(snapshot) → {cards, unavailable, more, outstanding, unknown, loading, loaded, total, totalKnown, empty}`, `writeMessage(observation, "save"|"remove")`, `outstandingMessage(write)`, `mountDiscoveriesControl({grid, countElement, controller, sourceId?, isActive, activeKey, onOpen(record, key), toast}) → {render(), destroy()}`. `#saved-count` shows the total (`…` while the first load is pending); a "Show more" card (`.discovery-more`) loads the next page; outstanding writes show a status line; an unknown outcome shows "Check again" (`controller.reconcile`), which never repeats the write.

**Design assertions:**
- Spec §13.10 and §4.3: every discovery stays reachable, as in today's Plane (`every discovery stays reachable: a next page is offered and the count is the total`); outstanding and unknown writes are visible (`outstanding and unknown writes are visible until resolved`); no message claims an unobserved outcome (`write messages never claim an outcome that was not observed`).

- [ ] **Step 1: Write the failing tests**

**`tests/unit/discoveries-control.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryCards, writeMessage, outstandingMessage, EMPTY_MESSAGE } from '../../src/ui/discoveries.js';

const blob = new Blob(['x'], { type: 'image/jpeg' });
const record = (id, note = '') => ({ name: `Discovery ${id}`, note, thumbnail: { blob } });
const snapshot = (local, writes = []) => ({ workspace: 'plane', sources: { local: { label: 'This browser', nextCursor: null, total: null, ...local } }, writes });

test('cards show supported and unsupported discoveries with source-qualified keys', () => {
  const model = discoveryCards(snapshot({ status: 'ready', reason: '', total: 2, items: [
    { key: 'local:a', id: 'a', record: record('a', 'MY NOTE') },
    { key: 'local:b', id: 'b', unsupported: 'missing field sceneHash' },
  ] }));
  assert.deepEqual([model.loaded, model.total], [2, 2]);
  assert.deepEqual(model.cards.map(card => [card.key, card.openable, card.description]), [['local:a', true, 'MY NOTE'], ['local:b', false, 'CANNOT BE OPENED']]);
  assert.equal(model.cards[0].thumbnail, blob);
  assert.equal(model.empty, false);
});

test('every discovery stays reachable: a next page is offered and the count is the total', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ key: `local:${i}`, id: String(i), record: record(i) }));
  const model = discoveryCards(snapshot({ status: 'ready', reason: '', items, nextCursor: '50', total: 51 }));
  assert.deepEqual([model.loaded, model.total], [50, 51]);
  assert.deepEqual(model.more, [{ sourceId: 'local', label: 'This browser', loaded: 50, total: 51 }]);
  assert.deepEqual(discoveryCards(snapshot({ status: 'ready', reason: '', items, total: 50 })).more, []);
});

test('an empty, loading or unavailable source is presented honestly', () => {
  assert.equal(discoveryCards(snapshot({ status: 'ready', reason: '', items: [], total: 0 })).empty, true);
  assert.equal(EMPTY_MESSAGE, 'Find a place you love. Press B to keep it here.');
  const loading = discoveryCards(snapshot({ status: 'loading', reason: '', items: [] }));
  assert.deepEqual([loading.loading, loading.empty], [true, false], 'loading is not empty');
  const down = discoveryCards(snapshot({ status: 'unavailable', reason: 'did not respond in time', items: [] }));
  assert.deepEqual(down.unavailable, [{ sourceId: 'local', label: 'This browser', reason: 'did not respond in time' }]);
  assert.equal(down.empty, false, 'an unavailable source is not shown as an empty one');
});

test('outstanding and unknown writes are visible until resolved', () => {
  const writes = [{ writeId: 'w1', kind: 'save', status: 'checking' }, { writeId: 'w2', kind: 'remove', status: 'pending' }, { writeId: 'w3', kind: 'save', status: 'unknown' }, { writeId: 'w4', kind: 'save', status: 'committed' }];
  const model = discoveryCards(snapshot({ status: 'ready', reason: '', items: [], total: 0 }, writes));
  assert.deepEqual(model.outstanding.map(write => write.writeId), ['w1', 'w2']);
  assert.deepEqual(model.unknown.map(write => write.writeId), ['w3']);
  assert.equal(outstandingMessage(writes[0]), 'Saving a discovery — checking the result…');
  assert.equal(outstandingMessage(writes[1]), 'Removing a discovery…');
});

test('write messages never claim an outcome that was not observed', () => {
  assert.match(writeMessage({ status: 'committed' }, 'save'), /saved/);
  assert.match(writeMessage({ status: 'unknown' }, 'save'), /Check again/);
  assert.doesNotMatch(writeMessage({ status: 'unknown' }, 'remove'), /removed\./);
  assert.match(writeMessage({ status: 'failed', reason: 'QuotaExceededError' }, 'save'), /could not be saved \(QuotaExceededError\)/);
  assert.match(writeMessage({ status: 'aborted' }, 'remove'), /not removed/);
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js",
    "tests/unit/gestures.test.js",
    "tests/unit/render-adapter.test.js",
    "tests/unit/renderer-guards.test.js",
    "tests/unit/export.test.js",
    "tests/unit/discoveries.test.js",
    "tests/unit/persistence.test.js",
    "tests/unit/discoveries-control.test.js"
  ]
}
````

- [ ] **Step 2: Write the interface skeleton**

**`src/ui/discoveries.js`** (complete file — interface skeleton):

````js
// T11 interface skeleton. Replaced in full by the implementation step.
export const EMPTY_MESSAGE = '';
export const discoveryCards = () => ({ cards: [], unavailable: [], more: [], outstanding: [], unknown: [], loading: false, loaded: 0, total: 0, totalKnown: true, empty: true });
export const writeMessage = () => '';
export const outstandingMessage = () => '';
export const mountDiscoveriesControl = () => Object.freeze({ render() {}, destroy() {} });
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/discoveries-control.test.js --expect-fail "cards show supported and unsupported discoveries with source-qualified keys"
```
Expected: `RED confirmed: "cards show supported and unsupported discoveries with source-qualified keys" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the implementation (replacing the skeleton)**

**`src/ui/discoveries.js`** (complete file):

````js
// The Discoveries control (spec §13.10): one control, filtered to the active workspace by its
// controller, shown in the "Your discoveries" tab. Rendering is a pure view model
// (discoveryCards) plus thin DOM glue. Every discovery stays reachable: bounded pages with a
// "Show more" card; outstanding writes are visible; an unknown outcome offers "Check again",
// which re-reads without repeating the write.
import { icon } from './icons.js';

export const EMPTY_MESSAGE = 'Find a place you love. Press B to keep it here.';

export function discoveryCards(snapshot) {
  const cards = [], unavailable = [], more = [];
  let loading = false, total = 0, totalKnown = true;
  for (const [sourceId, view] of Object.entries(snapshot.sources)) {
    if (view.status === 'unavailable') unavailable.push({ sourceId, label: view.label, reason: view.reason });
    if (view.status === 'loading' || view.status === 'idle') loading = true;
    if (Number.isInteger(view.total)) total += view.total; else { totalKnown = false; total += view.items.length; }
    if (view.nextCursor) more.push({ sourceId, label: view.label, loaded: view.items.length, total: view.total });
    for (const item of view.items) {
      cards.push(item.record
        ? { key: item.key, sourceId, id: item.id, name: item.record.name, description: item.record.note || 'YOUR OWN LITTLE INFINITY', thumbnail: item.record.thumbnail.blob, openable: true }
        : { key: item.key, sourceId, id: item.id, name: 'Unsupported discovery', description: 'CANNOT BE OPENED', thumbnail: null, openable: false, reason: item.unsupported });
    }
  }
  const outstanding = snapshot.writes.filter(write => write.status === 'pending' || write.status === 'checking');
  const unknown = snapshot.writes.filter(write => write.status === 'unknown');
  return { cards, unavailable, more, outstanding, unknown, loading, loaded: cards.length, total, totalKnown, empty: !loading && cards.length === 0 && unavailable.length === 0 };
}

export function writeMessage(observation, verb) {
  if (observation.status === 'committed') return verb === 'save' ? 'Discovery saved. Find it in Your discoveries.' : 'Discovery removed.';
  if (observation.status === 'aborted') return verb === 'save' ? 'The discovery was not saved.' : 'The discovery was not removed.';
  if (observation.status === 'unknown') return 'ATLAS could not confirm the result yet. Use Check again in Your discoveries.';
  return verb === 'save' ? `The discovery could not be saved (${observation.reason}). Use Capture → Save location to keep this view.` : `The discovery could not be removed (${observation.reason}).`;
}

export const outstandingMessage = write => `${write.kind === 'save' ? 'Saving' : 'Removing'} a discovery${write.status === 'checking' ? ' — checking the result' : ''}…`;

export function mountDiscoveriesControl({ grid, countElement, controller, sourceId = 'local', isActive, activeKey, onOpen, toast }) {
  let urls = [];
  const release = () => { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; };

  function card({ className = 'destination-card', number, arrow, name, description, onclick }) {
    const button = document.createElement('button');
    button.className = className;
    for (const [part, text] of [['place-number', number], ['place-arrow', arrow], ['place-name', name], ['place-description', description]]) {
      const span = document.createElement('span'); span.className = part; span.textContent = text; button.append(span);
    }
    if (onclick) button.onclick = onclick;
    return button;
  }

  function render() {
    const model = discoveryCards(controller.snapshot());
    countElement.textContent = model.loading && !model.loaded ? '…' : String(model.total);
    if (!isActive()) return;
    release();
    grid.classList.add('saved-places');
    grid.replaceChildren();
    const message = (text, action) => {
      const note = document.createElement('div'); note.className = 'empty-saved discovery-status'; note.textContent = text;
      if (action) { const button = document.createElement('button'); button.className = 'mini-button'; button.textContent = action.label; button.onclick = action.run; note.append(' ', button); }
      grid.append(note);
    };
    for (const write of model.outstanding) message(outstandingMessage(write));
    for (const write of model.unknown) message(`ATLAS could not confirm a ${write.kind === 'save' ? 'save' : 'removal'}.`, { label: 'Check again', run: () => controller.reconcile(write.writeId).then(result => toast(writeMessage(result, write.kind))) });
    for (const source of model.unavailable) message(`${source.label} is unavailable: ${source.reason}.`);
    if (model.empty) { message(EMPTY_MESSAGE); return; }
    model.cards.forEach((entry, index) => {
      const button = card({ number: String(index + 1).padStart(2, '0'), arrow: entry.openable ? '↗' : '·', name: entry.name, description: entry.description });
      if (entry.key === activeKey()) button.classList.add('active');
      button.dataset.discovery = entry.key;
      if (entry.thumbnail) {
        const image = document.createElement('img'); image.alt = ''; image.draggable = false;
        const url = URL.createObjectURL(entry.thumbnail); urls.push(url); image.src = url;
        image.onerror = () => { image.style.display = 'none'; };
        button.prepend(image);
      }
      if (entry.openable) button.onclick = () => controller.open(entry.sourceId, entry.id).then(record => onOpen(record, entry.key), error => { if (error.code !== 'superseded') toast(error.message); });
      else { button.disabled = true; button.title = entry.reason; }
      const wrapper = document.createElement('div'); wrapper.className = 'saved-wrapper'; wrapper.append(button);
      if (entry.sourceId === sourceId) {
        const remove = document.createElement('button'); remove.className = 'delete-save'; remove.innerHTML = icon('close'); remove.setAttribute('aria-label', `Delete ${entry.name}`);
        remove.onclick = () => controller.remove(entry.sourceId, entry.id).then(observation => toast(writeMessage(observation, 'remove')));
        wrapper.append(remove);
      }
      grid.append(wrapper);
    });
    for (const page of model.more) {
      const wrapper = document.createElement('div'); wrapper.className = 'saved-wrapper';
      wrapper.append(card({ className: 'destination-card discovery-more', number: '··', arrow: '→', name: 'Show more', description: `${page.loaded} OF ${page.total ?? 'MORE'} SHOWN`, onclick: () => controller.nextPage(page.sourceId) }));
      grid.append(wrapper);
    }
  }

  const unsubscribe = controller.subscribe(render);
  return Object.freeze({ render, destroy() { unsubscribe(); release(); } });
}
````

- [ ] **Step 5: Run the unit tests**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"122 tests passed","files":13,…}` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/discoveries.js tests/unit/discoveries-control.test.js tests/unit.manifest.json
git commit -m "Add the workspace-filtered Discoveries control"
```

- [ ] **Step 7: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 8: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T12: Checkpoint 3: workspace extraction, shell and the Discoveries cut-over

**Owner:** Claude. **Reviewer:** Codex. **Depends on:** T08, T10, T11.

Third and last `src/app.js` version: the composition root. The T08 lifecycle moves into `createPlaneWorkspace` unchanged except for (a) the shell supplying `$`, `toast` and dialogs, (b) navigation bindings moving to `src/plane/navigation.js` with identical arithmetic, plus a `reset()` that Back and Forward use to release a captured drag, and (c) the Discoveries control replacing the `localStorage` bookmarks. A save captures the thumbnail only when the canvas shows the current scene's publication (`adapter.published`, `lastReport` and the scene hash agree and no export holds the renderer), encodes it within 5 s, and commits the record, its thumbnail, its source report and its write marker together. Storage opens in the background so exploration never waits for it. `tests/browser.mjs` gains only the bounded wait for discovery loading after the reload.

**Files:**
- Create: `src/plane/workspace.js`, `src/plane/navigation.js`, `src/ui/shell.js`, `src/ui/dialogs.js`, `src/ui/notifications.js`
- Modify (whole files): `src/app.js`, `tests/browser.mjs`, `tests/workflow.mjs`, `tests/suites.manifest.json`, `tests/unit.manifest.json`
- Test: `tests/unit/navigation.test.js`

**Interfaces:**
- Consumes: everything above; `openPersistence` (T10); `createLocalDiscoverySource`, `createDiscoveriesController`, `createDiscoveryRecord` (T09); `mountDiscoveriesControl`, `writeMessage` (T11).
- Produces: `createPlaneWorkspace({shell, discoveries, sourceId?}) → {inspection, destroy()}` (`inspection` is `window.atlas`), `THUMBNAIL_ENCODE_MS = 5000`; `bindPlaneNavigation({surface, getCanvas, getView, onPointerStart, grouped, drag, dragEnd, jump}) → {reset() → number of released pointers}`, `navigationKey(key, view) → view | null`, `pointAt(clientX, clientY, width?, height?)`; `createShell(root) → {$, toast, showDialog}`; `installDialogs(root)`, `showDialog(root, selector)`; `createNotifier(element, {durationMs})`.

**Design assertions:**
- Spec §4.1–4.2: shell and navigation extracted; navigation arithmetic unchanged (`navigation keys produce exactly the views the previous handlers produced`); Back and Forward release a captured drag (`reset forgets a captured drag, so further movement cannot navigate`; browser `Back during a captured drag releases the drag`).
- Spec §12, §13.10, §14 in the page: discoveries save, survive reload, open and delete; more than one page stays reachable; the earlier `localStorage` key is neither read nor modified; unavailable storage leaves exploration usable and never claims a save (workflow suite).
- Spec §4.3: the existing bookmark-persistence check keeps its expectation, with a bounded wait for discovery loading.

- [ ] **Step 1: Write the failing tests**

**`tests/unit/navigation.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationKey, pointAt, bindPlaneNavigation } from '../../src/plane/navigation.js';
import { moveView, zoomView } from '../../src/plane/math.js';

const view = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };

test('navigation keys produce exactly the views the previous handlers produced', () => {
  assert.deepEqual(navigationKey('+', view), zoomView(view, view.zoom + Math.log10(2)));
  assert.deepEqual(navigationKey('=', view), zoomView(view, view.zoom + Math.log10(2)));
  assert.deepEqual(navigationKey('-', view), zoomView(view, view.zoom - Math.log10(2)));
  assert.deepEqual(navigationKey('arrowleft', view), moveView(view, -.08, 0));
  assert.deepEqual(navigationKey('arrowdown', view), moveView(view, 0, -.08));
  assert.equal(navigationKey('b', view), null);
});

test('pointer offsets are measured from the centre in viewport widths', () => {
  assert.deepEqual(pointAt(500, 250, 1000, 500), [0, 0]);
  assert.deepEqual(pointAt(1000, 0, 1000, 500), [0.5, 0.25]);
});

test('reset forgets a captured drag, so further movement cannot navigate', () => {
  const listeners = {}, released = [], moves = [];
  const surface = { addEventListener: (type, fn) => { listeners[type] = fn; }, setPointerCapture() {}, releasePointerCapture: id => released.push(id) };
  const canvas = { focus() {}, classList: { add() {}, remove() {} } };
  const navigation = bindPlaneNavigation({ surface, getCanvas: () => canvas, getView: () => view, onPointerStart() {}, grouped() {}, drag: next => moves.push(next), dragEnd() {}, jump() {} });
  globalThis.innerWidth = 1000; globalThis.innerHeight = 500;
  listeners.pointerdown({ button: 0, pointerId: 7, clientX: 100, clientY: 100 });
  listeners.pointermove({ pointerId: 7, clientX: 110, clientY: 100 });
  assert.equal(moves.length, 1);
  assert.equal(navigation.reset(), 1);
  assert.deepEqual(released, [7]);
  listeners.pointermove({ pointerId: 7, clientX: 150, clientY: 100 });
  assert.equal(moves.length, 1, 'movement after reset does not navigate');
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js",
    "tests/unit/gestures.test.js",
    "tests/unit/render-adapter.test.js",
    "tests/unit/renderer-guards.test.js",
    "tests/unit/export.test.js",
    "tests/unit/discoveries.test.js",
    "tests/unit/persistence.test.js",
    "tests/unit/discoveries-control.test.js",
    "tests/unit/navigation.test.js"
  ]
}
````

**`tests/browser.mjs`** (complete file):

````js
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('browser');

await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const hardware = process.argv.includes('--hardware');
const reportPath = `artifacts/${hardware ? 'hardware-' : ''}browser-report.json`;
let server, browser;
const report = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const errors = [];
function watchErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
}
async function idle(page) {
  // Let browser input/resize events reach the render queue before waiting on it.
  await page.waitForTimeout(400);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && document.body.dataset.rendering === 'false', null, { timeout: 60000 });
  await idleWithin(page);
}
async function checkLayout(page) {
  const problems = await ev(page, () => {
    const issues = [];
    for (const selector of ['.topbar', '.navigation', '.navigation-hint', '.panel', '.destinations']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < 0 || rect.right > innerWidth + 1 || rect.top < 0 || rect.bottom > innerHeight + 1) issues.push(`${selector} outside viewport`);
    }
    const panel = document.querySelector('.panel').getBoundingClientRect();
    for (const selector of ['.destination-tabs', '.navigation']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top) issues.push(`${selector} overlaps panel`);
    }
    return issues;
  });
  assert.deepEqual(problems, []);
}

// Runs inside the browser; the exact recurrence is independent of both renderers.
async function numericalProbe(backend) {
  const { GpuRenderer, CpuRenderer } = await import('/src/plane/renderer.js');
  const { fixed, spanFixed, precisionFor, escapeTimeExact } = await import('/src/plane/math.js');
  const { colorPixel, paletteBytes, PALETTES } = await import('/src/plane/palettes.js');
  const renderer = new (backend === 'gpu' ? GpuRenderer : CpuRenderer)(document.createElement('canvas'));
  const cases = [
    { re: '-.5', im: '.1', zoom: 0, iterations: 700 },
    { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4, iterations: 1500 },
    { re: '-0.743643887037151', im: '0.13182590420533', zoom: 15.5, iterations: 4500 },
    { re: '-0.743735546648121901421502749766284274', im: '0.13180188244022899880486875943155304', zoom: 9.178000000000004, iterations: 1222 },
    { re: '-0.74373554655981392496378600769218837122', im: '0.13180188254868144746747814705787405605', zoom: 11.242000000000006, iterations: 1288 },
    { re: '-2', im: '0', zoom: 1000, iterations: 2100 },
  ];
  const result = [];
  try {
    for (const view of cases) {
      const width = view.zoom === 9.178000000000004 ? 320 : 16, height = width === 320 ? 96 : 12;
      await renderer.render(view, { palette: 'ember', phase: .11, frequency: 1, relief: 1, iterations: view.iterations }, width, height);
      const field = backend === 'gpu' ? renderer.readField() : renderer.data;
      if (backend === 'cpu') {
        // Check the actual painted canvas, including rows from earlier worker tiles.
        const rgba = renderer.context.getImageData(0, 0, width, height).data;
        const palette = paletteBytes(PALETTES[0]);
        for (let index = 0; index < field.length; index += 4) {
          const expected = [...colorPixel(field[index], field[index + 1], palette, .11, 1, 1), 255];
          if (expected.some((channel, offset) => channel !== rgba[index + offset])) throw new Error(`CPU paint mismatch at ${index / 4}`);
        }
      }
      const digits = precisionFor(view.zoom), span = spanFixed(view.zoom, digits);
      const re = fixed(view.re, digits), im = fixed(view.im, digits);
      let maximumError = 0, mismatches = 0, samples = 0;
      const points = width === 320 ? [[1, 1], [65, 18], [130, 35], [180, 51], [240, 77], [315, 94]] : [[1, 1], [5, 2], [11, 4], [2, 8], [13, 9], [6, 10]];
      for (const [x, y] of points) {
        const cr = re + span * BigInt(2 * x + 1 - width) / BigInt(2 * width);
        const ci = im + span * BigInt(2 * y + 1 - height) / BigInt(2 * width);
        const row = backend === 'gpu' ? y : height - y - 1;
        const expected = escapeTimeExact(cr, ci, digits, view.iterations), actual = field[(row * width + x) * 4];
        if ((expected < 0) !== (actual < 0) || !Number.isFinite(actual)) mismatches++;
        if (expected >= 0 && actual >= 0) maximumError = Math.max(maximumError, Math.abs(expected - actual));
        samples++;
      }
      result.push({ zoom: view.zoom, maximumError, mismatches, samples });
    }
  } finally { renderer.destroy(); }
  return result;
}
function checkNumerical(results) {
  assert.equal(results.length, 6, 'all six numerical views must be sampled');
  for (const result of results) {
    assert.equal(result.samples, 6, JSON.stringify(result));
    assert.equal(result.mismatches, 0, JSON.stringify(result));
    assert.ok(result.maximumError < .5, JSON.stringify(result));
  }
}
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', ...(hardware ? ['--enable-gpu', '--use-angle=vulkan'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
  const context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  watchErrors(page);
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  assert.match(await page.title(), /ATLAS/);
  assert.match(await page.locator('#engine-status').textContent(), hardware ? /^GPU/ : /SOFTWARE WEBGL/);
  assert.equal(await ev(page, () => atlas.graphics.acceleration), hardware ? 'hardware' : 'software');
  await page.screenshot({ path: 'artifacts/atlas-desktop.png', animations: 'disabled' });
  await checkLayout(page);
  const graphics = await ev(page, () => {
    const gl = atlas.renderer.gl, info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) };
  });
  pass('Desktop WebGL startup and unobstructed controls', { graphics });

  await page.getByRole('button', { name: 'Show graphics details', exact: true }).click();
  assert.match(await page.locator('#graphics-device').textContent(), hardware ? /NVIDIA|AMD|Intel|Apple/i : /SwiftShader/);
  assert.match(await page.locator('#graphics-summary').textContent(), hardware ? /hardware graphics device/ : /software on the CPU/);
  await page.keyboard.press('Escape');
  pass('WebGL acceleration is labeled accurately and exposes its actual renderer');

  const before = await ev(page, () => ({ count: atlas.rendered, image: document.querySelector('canvas').toDataURL() }));
  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  const after = await ev(page, () => ({ count: atlas.rendered, image: document.querySelector('canvas').toDataURL() }));
  assert.equal(before.count, after.count); assert.notEqual(before.image, after.image);
  pass('Instant palette changes without recalculating the fractal');

  const oldView = await ev(page, () => atlas.view);
  await page.mouse.move(720, 440); await page.mouse.wheel(0, -120);
  await page.waitForTimeout(400); await idleWithin(page);
  assert.ok((await ev(page, () => atlas.view.zoom)) > oldView.zoom);
  await page.mouse.move(600, 420); await page.mouse.down(); await page.mouse.move(650, 450, { steps: 5 }); await page.mouse.up();
  await idle(page);
  assert.notEqual((await ev(page, () => atlas.view.re)), oldView.re);
  pass('Wheel zoom and pointer drag');

  await page.keyboard.press('b');
  await page.getByRole('button', { name: /Your discoveries/ }).click();
  await page.waitForFunction(() => document.querySelector('#saved-count').textContent === '1', null, { timeout: LIMITS.operation });
  assert.equal(await page.locator('.saved-wrapper').count(), 1);
  await page.reload({ timeout: LIMITS.launch }); await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  // Discoveries load from IndexedDB independently of rendering: wait, bounded, for the count to settle.
  await page.waitForFunction(() => document.querySelector('#saved-count').textContent !== '…', null, { timeout: LIMITS.operation });
  assert.equal(await page.locator('#saved-count').textContent(), '1');
  pass('Bookmarks persist across reloads');

  await page.getByRole('button', { name: 'Cinema mode', exact: true }).click();
  assert.ok(await page.locator('body').evaluate(el => el.classList.contains('cinema')));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls and about', exact: true }).click();
  assert.ok(await page.locator('#help-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  pass('Cinema mode, keyboard shortcuts, and accessible help dialog');

  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('-2'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('40');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  await idleWithin(page, LIMITS.deep);
  assert.equal((await ev(page, () => atlas.view.zoom)), 40);
  assert.match(await page.locator('#engine-status').textContent(), /EXTENDED/);
  pass('Arbitrary coordinate navigation enters extended GPU mode');

  await page.getByRole('button', { name: /Share view/ }).click();
  assert.match(page.url(), /#scene=[A-Za-z0-9_-]+$/);
  const sharedScene = await ev(page, () => atlas.scene);
  const sharedPage = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage')); watchErrors(sharedPage); await sharedPage.goto(page.url(), { timeout: LIMITS.launch });
  await sharedPage.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.deepEqual(await ev(sharedPage, () => atlas.view), { re: '-2', im: '0', zoom: 40 });
  assert.deepEqual(await ev(sharedPage, () => atlas.scene), sharedScene, 'the generated link restores the complete scene');
  await closeWithin(sharedPage, 'sharedPage'); pass('Shared URL restores precision and settings');

  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.locator('#export-size').selectOption('current');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  const downloaded = await within(downloadPromise, LIMITS.deep, 'PNG download'); await within(downloaded.saveAs('artifacts/export-test.png'), LIMITS.operation, 'PNG save');
  assert.match(downloaded.suggestedFilename(), /\.png$/);
  const png = await readFile('artifacts/export-test.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
  pass('PNG export', { width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

  const locationDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save location (.json)', exact: true }).click();
  await within((await within(locationDownload, LIMITS.operation, 'location download')).saveAs('artifacts/export-test.json'), LIMITS.operation, 'location save');
  const savedLocation = JSON.parse(await readFile('artifacts/export-test.json', 'utf8'));
  assert.equal(savedLocation.schema, 'atlas.scene');
  assert.deepEqual(savedLocation.model, { id: 'plane-mandelbrot', version: 1 });
  assert.deepEqual(savedLocation.camera, await ev(page, () => atlas.view));
  assert.deepEqual(savedLocation, await ev(page, () => atlas.scene), 'the file holds the complete live scene');
  await page.keyboard.press('Escape');
  await within(page.evaluate(async () => { atlas.goTo({ re: '-.5', im: '0', zoom: 0 }); await atlas.whenIdle(); }), LIMITS.operation, 'move away before import');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.locator('#import-location').setInputFiles('artifacts/export-test.json');
  await idle(page);
  assert.deepEqual(await ev(page, () => atlas.view), savedLocation.camera);
  assert.deepEqual(await ev(page, () => atlas.scene), savedLocation, 'reimport restores the complete scene');
  assert.equal(await page.locator('#capture-dialog').evaluate(el => el.open), false);
  pass('JSON location export and import preserve exact coordinates');

  const numerical = await within(page.evaluate(numericalProbe, 'gpu'), LIMITS.deep, 'GPU numerical probe');
  checkNumerical(numerical);
  pass('GPU escape values agree with independent BigInt oracle', { numerical });

  await within(page.evaluate(async () => { atlas.goTo({ re: '-.743643887037151', im: '.13182590420533', zoom: 3.85 }); await atlas.whenIdle(); }), LIMITS.operation, 'return to Seahorse valley');
  await page.setViewportSize({ width: 1280, height: 720 });
  await idle(page);
  await checkLayout(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  assert.ok(await page.locator('#coordinate-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/atlas-laptop.png', animations: 'disabled' });
  pass('Laptop layout keeps exact-coordinate navigation accessible');

  const response = await within(page.evaluate(async () => {
    const start = performance.now(), initial = atlas.view.zoom;
    for (let i = 0; i < 6; i++) {
      document.querySelector('#zoom-in').click();
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    await atlas.whenIdle();
    atlas.renderer.gl.finish();
    return { elapsedMs: performance.now() - start, initial, final: atlas.view.zoom, width: atlas.renderer.canvas.width, height: atlas.renderer.canvas.height };
  }), LIMITS.deep, 'repeated GPU navigation');
  assert.ok(Math.abs(response.final - response.initial - 6 * Math.log10(2)) < 1e-10);
  assert.equal(response.width, 1280); assert.equal(response.height, 720);
  pass('Repeated GPU navigation reaches the latest view and full resolution', { response });
  await page.getByRole('button', { name: /Take a journey/ }).click();
  await page.waitForFunction(() => !document.querySelector('#tour-status').hidden && atlas.view.zoom > 3.85, null, { timeout: LIMITS.operation });
  await page.keyboard.press('+');
  assert.ok(await page.locator('#tour-status').evaluate(el => el.hidden));
  await idle(page);
  pass('Journey animates and manual navigation stops it');

  const mobileContext = boundContext(await within(browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }), LIMITS.launch, 'newContext'));
  const mobile = boundContext(await within(mobileContext.newPage(), LIMITS.launch, 'newPage')); watchErrors(mobile);
  await mobile.goto(url, { timeout: LIMITS.launch }); await idle(mobile);
  await mobile.screenshot({ path: 'artifacts/atlas-mobile.png', animations: 'disabled' });
  await checkLayout(mobile);
  assert.ok(await ev(mobile, () => document.documentElement.scrollWidth <= innerWidth));
  await mobile.getByRole('button', { name: 'Abyss palette', exact: true }).tap();
  assert.equal(await ev(mobile, () => atlas.settings.palette), 'ocean');
  await mobile.getByRole('button', { name: 'Explorer settings', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Go to', exact: true }).tap();
  assert.ok(await mobile.locator('#coordinate-dialog').evaluate(el => el.open));
  await mobile.locator('#coordinate-dialog').getByRole('button', { name: 'Close', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Explorer settings', exact: true }).tap();
  await idle(mobile);
  const touch = await mobileContext.newCDPSession(mobile);
  const touchEvent = (type, touchPoints) => touch.send('Input.dispatchTouchEvent', { type, touchPoints });
  const beforeTouch = await ev(mobile, () => atlas.view);
  await touchEvent('touchStart', [{ x: 100, y: 380, id: 1 }]);
  await touchEvent('touchMove', [{ x: 140, y: 400, id: 1 }]);
  await touchEvent('touchEnd', []);
  await idle(mobile);
  assert.notEqual(await ev(mobile, () => atlas.view.re), beforeTouch.re);
  const beforePinch = await ev(mobile, () => atlas.view.zoom);
  await touchEvent('touchStart', [{ x: 130, y: 380, id: 1 }, { x: 230, y: 380, id: 2 }]);
  await touchEvent('touchMove', [{ x: 100, y: 380, id: 1 }, { x: 260, y: 380, id: 2 }]);
  await touchEvent('touchEnd', []);
  await idle(mobile);
  assert.ok(Math.abs(await ev(mobile, () => atlas.view.zoom) - beforePinch - Math.log10(1.6)) < 1e-8);
  assert.equal(await ev(mobile, () => visualViewport.scale), 1);
  await touch.detach();
  pass('Mobile layout, settings, touch drag, and cursor-centered pinch zoom');
  await closeWithin(mobileContext, 'mobileContext');
  await closeWithin(context, 'context');

  // Exercise actual startup fallback, including a context that lacks float targets.
  for (const unavailable of ['webgl2', 'float-targets']) {
    const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 } }), LIMITS.launch, 'newContext'));
    await cpuContext.addInitScript(kind => {
      if (kind === 'webgl2') {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === 'webgl2' ? null : original.call(this, type, ...args);
        };
      } else {
        const original = WebGL2RenderingContext.prototype.getExtension;
        WebGL2RenderingContext.prototype.getExtension = function (name) {
          return name === 'EXT_color_buffer_float' ? null : original.call(this, name);
        };
      }
    }, unavailable);
    const cpu = boundContext(await within(cpuContext.newPage(), LIMITS.launch, 'newPage')); watchErrors(cpu);
    const started = performance.now();
    await cpu.goto(url, { timeout: LIMITS.launch }); await idle(cpu);
    const startupMs = performance.now() - started;
    assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
    await cpu.getByRole('button', { name: 'Controls and about', exact: true }).click();
    await cpu.getByRole('button', { name: 'Graphics details', exact: true }).click();
    assert.equal(await ev(cpu, () => atlas.graphics.acceleration), 'cpu');
    assert.match(await cpu.locator('#graphics-reason').textContent(), unavailable === 'webgl2' ? /WebGL 2 context creation failed/ : /EXT_color_buffer_float is missing/);
    await cpu.keyboard.press('Escape');
    assert.ok(await ev(cpu, () => atlas.renderer.data.some((value, index) => index % 4 === 0 && value > 0)));
    if (unavailable === 'webgl2') {
      await cpu.screenshot({ path: 'artifacts/atlas-cpu.png', animations: 'disabled' });
      const cpuNumerical = await within(cpu.evaluate(numericalProbe, 'cpu'), LIMITS.deep, 'CPU numerical probe');
      checkNumerical(cpuNumerical);
      pass('CPU worker escape values agree with independent BigInt oracle', { numerical: cpuNumerical });
      const cpuBefore = await ev(cpu, () => ({ count: atlas.rendered, image: atlas.renderer.canvas.toDataURL() }));
      await cpu.getByRole('button', { name: 'Aurora palette', exact: true }).click();
      const cpuAfter = await ev(cpu, () => ({ count: atlas.rendered, image: atlas.renderer.canvas.toDataURL() }));
      assert.equal(cpuBefore.count, cpuAfter.count); assert.notEqual(cpuBefore.image, cpuAfter.image);
      const responsiveness = await within(cpu.evaluate(async () => {
        const gaps = [], started = performance.now(), initialZoom = atlas.view.zoom;
        let last = started;
        const timer = setInterval(() => { const now = performance.now(); gaps.push(now - last); last = now; }, 16);
        // Each new request cancels a worker still calculating an older view.
        for (let i = 0; i < 5; i++) {
          document.querySelector('#zoom-in').click();
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        await atlas.whenIdle();
        clearInterval(timer);
        return { elapsedMs: performance.now() - started, maximumTimerGapMs: Math.max(...gaps), timerTicks: gaps.length, initialZoom, finalZoom: atlas.view.zoom, width: atlas.renderer.canvas.width };
      }), LIMITS.deep, 'CPU responsiveness');
      assert.ok(Math.abs(responsiveness.finalZoom - responsiveness.initialZoom - 5 * Math.log10(2)) < 1e-10);
      assert.equal(responsiveness.width, 960);
      assert.ok(responsiveness.timerTicks > 3);
      assert.ok(responsiveness.maximumTimerGapMs < 1000, JSON.stringify(responsiveness));
      pass('CPU palette caching, render cancellation, and responsive navigation', { responsiveness });
    }
    pass(`Automatic CPU fallback when ${unavailable} is unavailable`, { startupMs });
    await closeWithin(cpuContext, 'cpuContext');
  }

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  throw error;
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
````

**`tests/workflow.mjs`** (complete file):

````js
// Project 1a workflows in a real browser (SwiftShader WebGL, headless): native scenes,
// undo and camera history, startup and invalid links. GREEN only: never part of a RED run.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { LIMITS, within, idleWithin, closeWithin, installSuiteDeadline, boundContext, ev } from './support/bounded.mjs';

const { chromium } = await import('playwright');
installSuiteDeadline('workflow');
await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const reportPath = 'artifacts/workflow-report.json';
const report = [], errors = [];
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, details); };
const INITIAL = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 3.85 };
let server, browser;

async function open(context, hash = '') {
  const page = boundContext(await within(context.newPage(), LIMITS.launch, 'newPage'));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${url}/${hash}`, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  await idleWithin(page);
  return page;
}
const state = page => ev(page, () => ({ scene: atlas.scene, history: atlas.history, rendered: atlas.rendered }));
const VIEW_B = { re: '-0.743643887037151', im: '0.13182590420533', zoom: 4.2 };
const VIEW_C = { re: '0.276', im: '0.008', zoom: 2.4 };
const VIEW_D = { re: '-1.762', im: '0', zoom: 1.6 };

// Real IndexedDB: commit, whole-batch rollback, cancellation before commit, reopen, blocked upgrade.
function checkIndexedDb(page) {
  return within(page.evaluate(async () => {
    const { openPersistence } = await import('/src/shared/persistence.js');
    const name = `atlas-test-${Date.now()}`;
    const value = (id, note) => ({ id, workspace: 'plane', createdAt: '2026-10-20T00:00:00.000Z', note, thumbnail: { blob: new Blob(['x']) } });
    const results = {};
    const store = await openPersistence({ databaseName: name });
    results.commit = (await store.commit({ puts: [{ store: 'discoveries', value: value('a', 'old') }, { store: 'reports', value: { reportId: 'r1' } }, { store: 'writes', value: { writeId: 'w1', op: 'save', id: 'a' } }] })).status;
    results.rollback = (await store.commit({ puts: [{ store: 'discoveries', value: value('a', 'new') }, { store: 'writes', value: { writeId: 'w2', op: 'save', id: 'a' } }, { store: 'reports', value: { noKey: true } }] })).status;
    results.rolledBackMarker = await store.getWriteMarker('w2');
    results.afterRollback = (await store.getDiscovery('a')).note;
    const controller = new AbortController();
    const pending = store.commit({ puts: [{ store: 'discoveries', value: value('b', 'x') }] }, { signal: controller.signal });
    controller.abort();
    results.aborted = (await pending).status;
    results.abortedAbsent = (await store.getDiscovery('b')) === null;
    store.close();
    const reopened = await openPersistence({ databaseName: name });
    const fetched = await reopened.getDiscovery('a');
    results.reopened = fetched.note;
    results.blobSize = fetched.thumbnail.blob.size;
    results.list = (await reopened.listDiscoveries({ workspace: 'plane', limit: 10 })).items.map(item => item.id);
    results.count = await reopened.countDiscoveries({ workspace: 'plane' });
    results.marker = (await reopened.getWriteMarker('w1'))?.id ?? null;
    const cancelled = new AbortController(); cancelled.abort();
    results.cancelledRead = await reopened.getDiscovery('a', { signal: cancelled.signal }).then(() => 'resolved', error => error.name);
    reopened.close();
    const raw = await new Promise((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await openPersistence({ databaseName: name, version: 2, timeoutMs: 3000 }); results.blocked = 'opened'; }
    catch (error) { results.blocked = error.code; }
    raw.close();
    await new Promise(resolve => { const request = indexedDB.deleteDatabase(name); request.onsuccess = request.onerror = request.onblocked = resolve; });
    return results;
  }), LIMITS.operation, 'IndexedDB checks');
}

// Installed on every context that runs the export checks: while `__holdWorkers` is set, messages
// to workers (reference orbits, CPU tiles) are queued until `__releaseWorkers()`.
const holdWorkersScript = () => {
  const post = Worker.prototype.postMessage;
  window.__heldWorkerMessages = [];
  Worker.prototype.postMessage = function (...args) {
    if (window.__holdWorkers) { window.__heldWorkerMessages.push(() => post.apply(this, args)); return; }
    return post.apply(this, args);
  };
  window.__releaseWorkers = () => { window.__holdWorkers = false; const held = window.__heldWorkerMessages.splice(0); held.forEach(send => send()); return held.length; };
};

// One export of the current viewport of `view`. With `withEdits`, three phases are witnessed
// before the page edits the live scene: admission held by a hook; the export render pending on a
// held worker message (the view is switched away and back first, so the export misses the
// renderer's reference cache, and nothing has been published); encoding held by a hook.
async function exportViewport(page, view, withEdits) {
  if (withEdits) await within(page.evaluate(async other => { atlas.goTo(other); await atlas.whenIdle(); }, VIEW_C), LIMITS.deep, 'move away to empty the reference cache');
  await ev(page, ({ target, edits }) => {
    window.__exportStages = [];
    const holds = {};
    window.__releaseExport = name => holds[name]?.();
    atlas.setExportHooks({
      stage(name) { window.__exportStages.push(name); },
      hold: name => (edits && (name === 'admission' || name === 'encoding') ? new Promise(resolve => { holds[name] = resolve; }) : undefined),
    });
    document.querySelector('#export-size').value = 'current';
    atlas.goTo(target);
    window.__holdWorkers = edits;
    document.querySelector('#download-image').click();
  }, { target: view, edits: withEdits });
  if (withEdits) {
    await page.waitForFunction(() => window.__exportStages.includes('admission'), null, { timeout: LIMITS.operation });
    await ev(page, other => { document.querySelector('[data-palette="aurora"]').click(); atlas.goTo(other); window.__releaseExport('admission'); }, VIEW_C);
    await page.waitForFunction(() => window.__exportStages.includes('render-submitted') && window.__heldWorkerMessages.length > 0, null, { timeout: LIMITS.operation });
    const pending = await ev(page, () => ({ stages: [...window.__exportStages], lastExport: atlas.lastExport }));
    assert.ok(!pending.stages.includes('encoding'), 'the export render is still pending on its held worker message');
    await ev(page, other => { document.querySelector('[data-palette="rose"]').click(); atlas.goTo(other); return window.__releaseWorkers(); }, VIEW_D);
    await page.waitForFunction(() => window.__exportStages.includes('encoding'), null, { timeout: LIMITS.deep });
    await ev(page, other => { document.querySelector('[data-palette="ocean"]').click(); atlas.goTo(other); window.__releaseExport('encoding'); }, VIEW_D);
  }
  await page.waitForFunction(() => window.__exportStages.includes('finished'), null, { timeout: LIMITS.deep });
  const result = await ev(page, () => ({ lastExport: atlas.lastExport, scene: atlas.scene, stages: window.__exportStages }), undefined, 'export result');
  await ev(page, () => atlas.setExportHooks(null));
  await idleWithin(page, LIMITS.deep);
  return result;
}

// The same export with and without edits during admission, rendering and encoding must decode to
// identical RGBA pixels (compared in the page), and must report the scene captured at the click.
async function checkExportImmutability(page, label) {
  await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_B), LIMITS.deep, 'go to B');
  const exportedScene = await ev(page, () => atlas.scene);
  const baseline = await exportViewport(page, VIEW_B, false);
  await ev(page, async () => { window.__baselineImage = await atlas.lastExportImageData(); }, undefined, 'decode baseline', LIMITS.deep);
  const raced = await exportViewport(page, VIEW_B, true);
  assert.deepEqual(raced.stages, ['reserved', 'admission', 'render-submitted', 'encoding', 'finished'], `${label}: every stage was reached`);
  for (const result of [baseline, raced]) {
    assert.equal(result.lastExport.outcome, 'completed', label);
    assert.equal(result.lastExport.report.outcome, 'completed');
    assert.deepEqual(result.lastExport.scene, exportedScene, `${label}: the export reports the scene captured at the click`);
  }
  const pixels = await ev(page, async () => {
    const before = window.__baselineImage, after = await atlas.lastExportImageData();
    let differing = 0;
    for (let i = 0; i < before.data.length; i++) if (before.data[i] !== after.data[i]) differing++;
    return { width: [before.width, after.width], height: [before.height, after.height], samples: after.data.length / 4, differing };
  }, undefined, 'compare pixels', LIMITS.deep);
  assert.equal(pixels.width[0], pixels.width[1]); assert.equal(pixels.height[0], pixels.height[1]);
  assert.ok(pixels.samples > 0);
  assert.equal(pixels.differing, 0, `${label}: edits during admission, rendering and encoding changed the exported pixels`);
  assert.deepEqual(raced.scene.camera, VIEW_D, 'the live scene kept the later edits');
  assert.equal(raced.scene.appearance.palette, 'ocean');
}

// A context loss while encoding is held, in both orders of restoration and lease release. The
// loss and restoration events are witnessed; the export is interrupted, nothing is published while
// the renderer is lost, the replacement waits for the lease, and live rendering resumes on one
// renderer shared by the workspace and the adapter.
async function checkContextLossDuringExport(page, restoreFirst) {
  await within(page.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_B), LIMITS.deep, 'go to B');
  await ev(page, () => {
    window.__contextEvents = [];
    if (!window.__contextListening) {
      window.__contextListening = true;
      const canvas = document.querySelector('#fractal');
      canvas.addEventListener('webglcontextlost', () => window.__contextEvents.push('lost'));
      canvas.addEventListener('webglcontextrestored', () => window.__contextEvents.push('restored'));
    }
    window.__exportStages = [];
    const holds = {};
    window.__releaseExport = name => holds[name]?.();
    atlas.setExportHooks({ stage(name) { window.__exportStages.push(name); }, hold: name => (name === 'encoding' ? new Promise(resolve => { holds[name] = resolve; }) : undefined) });
    document.querySelector('#export-size').value = 'current';
    document.querySelector('#download-image').click();
  });
  await page.waitForFunction(() => window.__exportStages.includes('encoding'), null, { timeout: LIMITS.deep });
  await ev(page, () => { window.__loseContext = atlas.renderer.gl.getExtension('WEBGL_lose_context'); window.__loseContext.loseContext(); });
  await page.waitForFunction(() => window.__contextEvents.includes('lost'), null, { timeout: LIMITS.operation });
  if (restoreFirst) {
    await ev(page, () => window.__loseContext.restoreContext());
    await page.waitForFunction(() => window.__contextEvents.includes('restored'), null, { timeout: LIMITS.operation });
  }
  const beforeRelease = await ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null }));
  await ev(page, () => window.__releaseExport('encoding'));
  await page.waitForFunction(() => window.__exportStages.includes('finished'), null, { timeout: LIMITS.deep });
  await ev(page, () => atlas.setExportHooks(null));
  if (!restoreFirst) {
    await page.waitForTimeout(500);
    const gap = await ev(page, () => ({ rendered: atlas.rendered, report: atlas.lastReport?.reportId ?? null, events: [...window.__contextEvents] }));
    assert.deepEqual(gap, { ...beforeRelease, events: ['lost'] }, 'nothing renders or publishes while the context is lost');
    await ev(page, () => window.__loseContext.restoreContext());
    await page.waitForFunction(() => window.__contextEvents.includes('restored'), null, { timeout: LIMITS.operation });
  }
  await page.waitForFunction(count => atlas.rendered > count, beforeRelease.rendered, { timeout: LIMITS.deep });
  const after = await ev(page, () => ({ outcome: atlas.lastExport.outcome, report: atlas.lastExport.report.outcome, consistent: atlas.rendererConsistent, exportButtonBusy: document.querySelector('#download-image').disabled, events: window.__contextEvents }));
  assert.deepEqual(after, { outcome: 'interrupted', report: 'interrupted', consistent: true, exportButtonBusy: false, events: ['lost', 'restored'] });
}

try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'pipe' });
    await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  browser = await chromium.launch({ headless: true, timeout: LIMITS.launch, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  await context.addInitScript(holdWorkersScript);
  const page = await open(context);

  const fresh = await state(page);
  assert.equal(fresh.scene.workspace, 'plane');
  assert.deepEqual(fresh.scene.camera, INITIAL);
  assert.equal(fresh.history.canBack, false);
  assert.equal(fresh.history.canUndo, false);
  pass('Fresh start opens Plane at the default view');

  await page.getByRole('button', { name: 'Aurora palette', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await idleWithin(page);
  const zoomed = await state(page);
  assert.equal(zoomed.scene.appearance.palette, 'aurora');
  await page.keyboard.press('Control+z');
  const undone = await state(page);
  assert.equal(undone.scene.appearance.palette, 'ember');
  assert.deepEqual(undone.scene.camera, zoomed.scene.camera, 'undoing the palette keeps the camera');
  assert.equal(undone.rendered, zoomed.rendered, 'an appearance undo recolors without recalculating');
  pass('Palette edit, navigation and undo keep the camera');

  const urlBefore = page.url();
  await ev(page, () => { window.__atlasPageMarker = 'still-here'; });
  await page.keyboard.press('Alt+ArrowLeft');
  await idleWithin(page);
  assert.equal(page.url(), urlBefore, 'Alt+Left must not navigate the browser');
  assert.equal(await ev(page, () => window.__atlasPageMarker), 'still-here', 'the page was not reloaded or replaced');
  const back = await state(page);
  assert.deepEqual(back.scene.camera, INITIAL);
  assert.equal(back.scene.appearance.palette, 'ember', 'Back moves only the camera');
  await page.keyboard.press('Alt+ArrowRight');
  await idleWithin(page);
  assert.deepEqual((await state(page)).scene.camera, zoomed.scene.camera);
  pass('Camera back and forward restore poses without touching content');

  const beforeEntry = await state(page);
  await page.getByRole('button', { name: 'Go to', exact: true }).click();
  await page.locator('#input-re').fill('1e1000000000000'); await page.locator('#input-im').fill('0'); await page.locator('#input-zoom').fill('0');
  await page.getByRole('button', { name: 'Explore this location' }).click();
  assert.match(await page.locator('#coordinate-error').textContent(), /budget/);
  assert.equal(await page.locator('#input-re').inputValue(), '1e1000000000000', 'the requested text is preserved');
  await page.keyboard.press('Escape');
  const afterEntry = await state(page);
  assert.deepEqual(afterEntry.scene, beforeEntry.scene);
  assert.deepEqual(afterEntry.history, beforeEntry.history, 'neither history changes');
  pass('An oversized coordinate is rejected before it is expanded');

  const beforeDrag = await state(page);
  await page.locator('#phase').scrollIntoViewIfNeeded();
  const slider = await page.locator('#phase').boundingBox();
  await page.mouse.move(slider.x + slider.width * 0.2, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterDrag = await state(page);
  assert.notEqual(afterDrag.scene.appearance.phase, beforeDrag.scene.appearance.phase);
  assert.equal(afterDrag.history.undoDepth, beforeDrag.history.undoDepth + 1, 'one drag is one undo entry');
  await ev(page, () => document.activeElement?.blur());
  await page.keyboard.press('Control+z');
  assert.equal((await state(page)).scene.appearance.phase, beforeDrag.scene.appearance.phase);
  pass('A slider drag is one undo entry');

  const beforeWheel = await state(page);
  await within(page.evaluate(async () => {
    const surface = document.querySelector('#fractal-surface');
    for (let i = 0; i < 5; i++) {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, clientX: 640, clientY: 360, bubbles: true, cancelable: true }));
      await new Promise(resolveStep => setTimeout(resolveStep, 15));
    }
    await new Promise(resolveQuiet => setTimeout(resolveQuiet, 400));
    await atlas.whenIdle();
  }), LIMITS.operation, 'wheel burst');
  const afterWheel = await state(page);
  assert.ok(afterWheel.scene.camera.zoom > beforeWheel.scene.camera.zoom);
  assert.equal(afterWheel.history.camera.length, beforeWheel.history.camera.index + 2, 'a wheel burst is one camera-history entry');
  assert.equal(afterWheel.history.undoDepth, beforeWheel.history.undoDepth, 'navigation never adds an undo entry');
  pass('A wheel burst is one camera-history entry');

  const before = await state(page);
  await ev(page, () => { location.hash = '#scene=@@@'; });
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('visible'), null, { timeout: LIMITS.operation });
  assert.match(await page.locator('#toast').textContent(), /unchanged/);
  const after = await state(page);
  assert.deepEqual(after.scene, before.scene);
  assert.deepEqual(after.history, before.history, 'neither history changes');
  pass('An invalid link during an investigation changes nothing');

  assert.deepEqual(await checkIndexedDb(page), {
    commit: 'committed', rollback: 'failed', afterRollback: 'old', aborted: 'aborted', abortedAbsent: true,
    reopened: 'old', blobSize: 1, list: ['a'], blocked: 'blocked', rolledBackMarker: null, count: 1, marker: 'a', cancelledRead: 'AbortError',
  });
  pass('IndexedDB commits whole batches, rolls back, cancels and reopens');

  await checkExportImmutability(page, 'WebGL');
  pass('An edit during a WebGL export does not change the exported image');
  await checkContextLossDuringExport(page, true);
  await checkContextLossDuringExport(page, false);
  pass('A context loss during an export interrupts it and live rendering resumes');

  const cpuContext = boundContext(await within(browser.newContext({ viewport: { width: 960, height: 720 }, acceptDownloads: true }), LIMITS.launch, 'newContext'));
  await cpuContext.addInitScript(holdWorkersScript);
  await cpuContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  const cpu = await open(cpuContext);
  assert.match(await cpu.locator('#engine-status').textContent(), /CPU/);
  await checkExportImmutability(cpu, 'CPU');
  await closeWithin(cpuContext, 'cpuContext');
  pass('An edit during a CPU export does not change the exported image');

  const settledCount = async target => {
    await target.waitForFunction(() => document.querySelector('#saved-count').textContent !== '…', null, { timeout: LIMITS.operation });
    return target.locator('#saved-count').textContent();
  };
  const discoveryContext = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 } }), LIMITS.launch, 'newContext'));
  const library = await open(discoveryContext);
  assert.equal(await settledCount(library), '0');
  await library.keyboard.press('b');
  await library.waitForFunction(() => document.querySelector('#saved-count').textContent === '1', null, { timeout: LIMITS.operation });
  const savedScene = await ev(library, () => atlas.scene);
  await within(library.evaluate(async view => { atlas.goTo(view); await atlas.whenIdle(); }, VIEW_C), LIMITS.deep, 'move away');
  await library.reload({ timeout: LIMITS.launch });
  await library.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.equal(await settledCount(library), '1', 'the discovery survives a reload');
  await library.getByRole('button', { name: /Your discoveries/ }).click();
  await library.locator('.saved-wrapper .destination-card').first().click();
  await library.waitForFunction(scene => JSON.stringify(atlas.scene.camera) === JSON.stringify(scene.camera), savedScene, { timeout: LIMITS.operation });
  assert.deepEqual(await ev(library, () => atlas.scene), savedScene, 'opening restores the whole scene');
  await library.locator('.saved-wrapper .delete-save').first().click();
  await library.waitForFunction(() => document.querySelector('#saved-count').textContent === '0', null, { timeout: LIMITS.operation });
  assert.match(await library.locator('#toast').textContent(), /Discovery removed/);
  await library.reload({ timeout: LIMITS.launch });
  assert.equal(await settledCount(library), '0', 'the deletion is durable');
  await closeWithin(discoveryContext, 'discoveryContext');
  pass('Discoveries save, survive reload, open and delete');

  const pagingContext = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 } }), LIMITS.launch, 'newContext'));
  const paging = await open(pagingContext);
  await within(paging.evaluate(async () => {
    const { openPersistence } = await import('/src/shared/persistence.js');
    const { createLocalDiscoverySource, createDiscoveryRecord } = await import('/src/shared/discoveries.js');
    const { sceneCodec, createPlaneScene } = await import('/src/plane/scene-adapter.js');
    const source = createLocalDiscoverySource({ store: await openPersistence(), sceneCodec });
    const canvas = new OffscreenCanvas(8, 4); canvas.getContext('2d').fillRect(0, 0, 8, 4);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    for (let i = 0; i < 51; i++) {
      const scene = createPlaneScene({ view: { re: '-0.5', im: '0', zoom: i / 10 } });
      const record = createDiscoveryRecord({ scene, name: `Seeded ${String(i).padStart(2, '0')}`, thumbnail: { sourceReportId: `seed-${i}`, mediaType: 'image/png', blob }, id: `seed-${i}`, createdAt: new Date(Date.UTC(2026, 9, 20, 0, 0, i)).toISOString(), sceneCodec });
      const result = await source.save(record, { writeId: `seed-write-${i}` });
      if (result.status !== 'committed') throw new Error(`seeding failed: ${result.reason}`);
    }
  }), LIMITS.deep, 'seed 51 discoveries');
  await paging.reload();
  await paging.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
  assert.equal(await settledCount(paging), '51', 'the count is the total, not the first page');
  await paging.getByRole('button', { name: /Your discoveries/ }).click();
  assert.equal(await paging.locator('.saved-wrapper .destination-card:not(.discovery-more)').count(), 50);
  await paging.locator('.discovery-more').click();
  await paging.waitForFunction(() => document.querySelectorAll('.saved-wrapper .destination-card:not(.discovery-more)').length === 51, null, { timeout: LIMITS.operation });
  assert.equal(await paging.locator('.discovery-more').count(), 0, 'no further page is offered');
  await paging.locator('[data-discovery="local:seed-0"]').click();
  await paging.waitForFunction(() => atlas.scene.camera.zoom === 0, null, { timeout: LIMITS.operation });
  await paging.locator('.saved-wrapper').filter({ has: paging.locator('[data-discovery="local:seed-0"]') }).locator('.delete-save').click();
  await paging.waitForFunction(() => document.querySelector('#saved-count').textContent === '50', null, { timeout: LIMITS.operation });
  await closeWithin(pagingContext, 'pagingContext');
  pass('More than one page of discoveries stays reachable');

  const dragContext = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 } }), LIMITS.launch, 'newContext'));
  const drag = await open(dragContext);
  await drag.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await idleWithin(drag);
  await drag.mouse.move(720, 420); await drag.mouse.down();
  await drag.mouse.move(760, 440, { steps: 3 });
  await drag.keyboard.press('Alt+ArrowLeft');
  await idleWithin(drag);
  const afterBack = await ev(drag, () => atlas.scene.camera);
  await drag.mouse.move(820, 470, { steps: 3 });
  await drag.mouse.up();
  await idleWithin(drag);
  assert.deepEqual(await ev(drag, () => atlas.scene.camera), afterBack, 'a still-pressed pointer does not resume navigation after Back');
  await closeWithin(dragContext, 'dragContext');
  pass('Back during a captured drag releases the drag');

  const legacy = JSON.stringify([{ id: 'old-1', name: 'Old bookmark', view: { re: '-0.5', im: '0', zoom: 0 }, settings: {} }]);
  const legacyContext = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 } }), LIMITS.launch, 'newContext'));
  await legacyContext.addInitScript(value => { if (!localStorage.getItem('atlas.discoveries')) localStorage.setItem('atlas.discoveries', value); }, legacy);
  const legacyPage = await open(legacyContext);
  assert.equal(await settledCount(legacyPage), '0', 'earlier bookmarks are not read');
  await legacyPage.keyboard.press('b');
  await legacyPage.waitForFunction(() => document.querySelector('#saved-count').textContent === '1', null, { timeout: LIMITS.operation });
  assert.equal(await ev(legacyPage, () => localStorage.getItem('atlas.discoveries')), legacy, 'earlier bookmarks are not modified');
  await closeWithin(legacyContext, 'legacyContext');
  pass('The earlier discoveries key is neither read nor modified');

  const offlineContext = boundContext(await within(browser.newContext({ viewport: { width: 1440, height: 1000 } }), LIMITS.launch, 'newContext'));
  await offlineContext.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined }); });
  const offline = await open(offlineContext);
  await offline.keyboard.press('b');
  await offline.waitForFunction(() => /could not be saved/.test(document.querySelector('#toast').textContent), null, { timeout: LIMITS.operation });
  assert.doesNotMatch(await offline.locator('#toast').textContent(), /Discovery saved/);
  await offline.getByRole('button', { name: /Your discoveries/ }).click();
  assert.match(await offline.locator('#destination-grid').textContent(), /unavailable/);
  const zoomBefore = await ev(offline, () => atlas.view.zoom);
  await offline.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await idleWithin(offline);
  assert.ok(await ev(offline, () => atlas.view.zoom) > zoomBefore, 'exploration continues without storage');
  await closeWithin(offlineContext, 'offlineContext');
  pass('Unavailable storage leaves exploration usable and never claims a save');

  const earlier = await open(context, '#re=-2&im=0&z=40&palette=rose');
  assert.deepEqual((await state(earlier)).scene.camera, INITIAL);
  assert.match(await earlier.locator('#toast').textContent(), /earlier ATLAS format/);
  pass('An earlier-format link opens fresh-start Plane with a notice');

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
}
````

**`tests/suites.manifest.json`** (complete file):

````json
{
  "build": {
    "requiredFiles": [
      "dist/index.html",
      "dist/src/app.js"
    ]
  },
  "suites": [
    {
      "id": "browser",
      "gpu": false,
      "command": [
        "tests/browser.mjs"
      ],
      "report": "artifacts/browser-report.json",
      "evidence": "browser",
      "requiredPasses": [
        "Desktop WebGL startup and unobstructed controls",
        "WebGL acceleration is labeled accurately and exposes its actual renderer",
        "Instant palette changes without recalculating the fractal",
        "Wheel zoom and pointer drag",
        "GPU escape values agree with independent BigInt oracle",
        "Laptop layout keeps exact-coordinate navigation accessible",
        "Repeated GPU navigation reaches the latest view and full resolution",
        "Bookmarks persist across reloads",
        "Cinema mode, keyboard shortcuts, and accessible help dialog",
        "Arbitrary coordinate navigation enters extended GPU mode",
        "Shared URL restores precision and settings",
        "PNG export",
        "JSON location export and import preserve exact coordinates",
        "Journey animates and manual navigation stops it",
        "Mobile layout, settings, touch drag, and cursor-centered pinch zoom",
        "CPU worker escape values agree with independent BigInt oracle",
        "CPU palette caching, render cancellation, and responsive navigation",
        "Automatic CPU fallback when webgl2 is unavailable",
        "Automatic CPU fallback when float-targets is unavailable",
        "No browser runtime errors"
      ]
    },
    {
      "id": "workflow",
      "gpu": false,
      "command": [
        "tests/workflow.mjs"
      ],
      "report": "artifacts/workflow-report.json",
      "evidence": "workflow",
      "requiredPasses": [
        "Fresh start opens Plane at the default view",
        "Palette edit, navigation and undo keep the camera",
        "Camera back and forward restore poses without touching content",
        "An oversized coordinate is rejected before it is expanded",
        "A slider drag is one undo entry",
        "A wheel burst is one camera-history entry",
        "An invalid link during an investigation changes nothing",
        "IndexedDB commits whole batches, rolls back, cancels and reopens",
        "An edit during a WebGL export does not change the exported image",
        "A context loss during an export interrupts it and live rendering resumes",
        "An edit during a CPU export does not change the exported image",
        "Discoveries save, survive reload, open and delete",
        "More than one page of discoveries stays reachable",
        "Back during a captured drag releases the drag",
        "The earlier discoveries key is neither read nor modified",
        "Unavailable storage leaves exploration usable and never claims a save",
        "An earlier-format link opens fresh-start Plane with a notice",
        "No browser runtime errors"
      ]
    },
    {
      "id": "browser-hardware",
      "gpu": true,
      "command": [
        "tests/browser.mjs",
        "--hardware"
      ],
      "report": "artifacts/hardware-browser-report.json",
      "evidence": "browser",
      "requiredPasses": [
        "Desktop WebGL startup and unobstructed controls",
        "WebGL acceleration is labeled accurately and exposes its actual renderer",
        "Instant palette changes without recalculating the fractal",
        "Wheel zoom and pointer drag",
        "GPU escape values agree with independent BigInt oracle",
        "Laptop layout keeps exact-coordinate navigation accessible",
        "Repeated GPU navigation reaches the latest view and full resolution",
        "Bookmarks persist across reloads",
        "Cinema mode, keyboard shortcuts, and accessible help dialog",
        "Arbitrary coordinate navigation enters extended GPU mode",
        "Shared URL restores precision and settings",
        "PNG export",
        "JSON location export and import preserve exact coordinates",
        "Journey animates and manual navigation stops it",
        "Mobile layout, settings, touch drag, and cursor-centered pinch zoom",
        "CPU worker escape values agree with independent BigInt oracle",
        "CPU palette caching, render cancellation, and responsive navigation",
        "Automatic CPU fallback when webgl2 is unavailable",
        "Automatic CPU fallback when float-targets is unavailable",
        "No browser runtime errors"
      ]
    },
    {
      "id": "navigation",
      "gpu": false,
      "command": [
        "tests/navigation.mjs"
      ],
      "report": "artifacts/navigation-report.json",
      "evidence": "navigation"
    },
    {
      "id": "graphics",
      "gpu": true,
      "benchmark": true,
      "command": [
        "tests/graphics.mjs",
        "--chrome",
        "--headed",
        "--compositor",
        "--benchmark"
      ],
      "report": "artifacts/graphics-report.json",
      "evidence": "graphics"
    }
  ]
}
````

- [ ] **Step 2: Write the interface skeleton**

**`src/plane/navigation.js`** (complete file — interface skeleton):

````js
// T12 interface skeleton. Replaced in full by the implementation step.
export const pointAt = () => [0, 0];
export const navigationKey = () => null;
export const bindPlaneNavigation = () => Object.freeze({ reset: () => 0 });
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/navigation.test.js --expect-fail "navigation keys produce exactly the views the previous handlers produced"
```
Expected: `RED confirmed: "navigation keys produce exactly the views the previous handlers produced" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the shell and navigation modules (replacing the skeleton)**

**`src/ui/notifications.js`** (complete file):

````js
// The shell's transient notice (the #toast element).
export function createNotifier(element, { durationMs = 3500 } = {}) {
  let timer;
  return function toast(message) {
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove('visible'), durationMs);
  };
}
````

**`src/ui/dialogs.js`** (complete file):

````js
// Shared dialog behaviour: close buttons and light dismissal outside the dialog box.
export function installDialogs(root = document) {
  root.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
  root.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  }));
}

export function showDialog(root, selector) { root.querySelector(selector).showModal(); }
````

**`src/ui/shell.js`** (complete file):

````js
// The application shell: element lookup, icons, notices and dialogs shared by workspaces.
import { installIcons } from './icons.js';
import { createNotifier } from './notifications.js';
import { installDialogs, showDialog } from './dialogs.js';

export function createShell(root = document) {
  installIcons(root);
  installDialogs(root);
  const $ = selector => root.querySelector(selector);
  return Object.freeze({ $, toast: createNotifier($('#toast')), showDialog: selector => showDialog(root, selector) });
}
````

**`src/plane/navigation.js`** (complete file):

````js
// Plane pointer, wheel, touch and key navigation (unchanged behaviour, spec §4.3).
// It computes the next view; the workspace decides how each move enters history.
import { moveView, zoomView } from './math.js';

// x/y offsets from the viewport centre in units of viewport width.
export function pointAt(clientX, clientY, width = innerWidth, height = innerHeight) {
  return [(clientX - width / 2) / width, (height / 2 - clientY) / width];
}

// The view a navigation key leads to, or null for any other key.
export function navigationKey(key, view) {
  switch (key) {
    case '+': case '=': return zoomView(view, view.zoom + Math.log10(2));
    case '-': return zoomView(view, view.zoom - Math.log10(2));
    case 'arrowleft': return moveView(view, -.08, 0);
    case 'arrowright': return moveView(view, .08, 0);
    case 'arrowup': return moveView(view, 0, .08);
    case 'arrowdown': return moveView(view, 0, -.08);
    default: return null;
  }
}

// grouped: wheel steps; drag: pointer and pinch moves; dragEnd: last pointer released; jump: double-click.
// → { reset() }
export function bindPlaneNavigation({ surface, getCanvas, getView, onPointerStart, grouped, drag, dragEnd, jump }) {
  surface.addEventListener('wheel', event => {
    event.preventDefault();
    const view = getView();
    const [x, y] = pointAt(event.clientX, event.clientY);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    grouped(zoomView(view, view.zoom - Math.max(-160, Math.min(160, delta)) * .0015, x, y));
  }, { passive: false });
  surface.addEventListener('dblclick', event => { const view = getView(); const [x, y] = pointAt(event.clientX, event.clientY); jump(zoomView(view, view.zoom + Math.log10(4), x, y)); });
  const pointers = new Map();
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    onPointerStart(); getCanvas().focus({ preventScroll: true }); surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); getCanvas().classList.add('dragging');
  });
  surface.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const view = getView();
    const before = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      drag(moveView(view, (old.x - event.clientX) / innerWidth, (event.clientY - old.y) / innerWidth));
    } else if (pointers.size === 2) {
      const after = [...pointers.values()];
      const distance = values => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      const mid = values => ({ x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 });
      const previous = mid(before), current = mid(after);
      const [x, y] = pointAt(previous.x, previous.y);
      const next = zoomView(view, view.zoom + Math.log10(Math.max(1, distance(after)) / Math.max(1, distance(before))), x, y);
      drag(moveView(next, (previous.x - current.x) / innerWidth, (current.y - previous.y) / innerWidth));
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(type, event => {
    if (!pointers.delete(event.pointerId)) return;
    if (!pointers.size) { getCanvas().classList.remove('dragging'); dragEnd(); }
  });
  // Back/Forward: forget active pointers and release their capture, so later movement of a
  // still-pressed pointer cannot resume navigation.
  return Object.freeze({
    reset() {
      const captured = [...pointers.keys()];
      pointers.clear();
      for (const pointerId of captured) { try { surface.releasePointerCapture(pointerId); } catch { /* already released */ } }
      getCanvas().classList.remove('dragging');
      return captured.length;
    },
  });
}
````

- [ ] **Step 5: Write the workspace and the composition root**

**`src/plane/workspace.js`** (complete file):

````js
// The Plane workspace (spec §4.1, §13.1): its lifecycle, controls and histories.
// Created once by the composition root (src/app.js) with the shell and the discoveries.
import { GpuRenderer, CpuRenderer } from './renderer.js';
import { zoomView, viewTransform, precisionFor } from './math.js';
import { PALETTES } from './palettes.js';
import { PLACES } from './places.js';
import { icon } from '../ui/icons.js';
import { createHistory } from '../shared/history.js';
import { createDiscoveryRecord } from '../shared/discoveries.js';
import { mountDiscoveriesControl, writeMessage } from '../ui/discoveries.js';
import { sceneCodec, toPlaneState, PLANE_INITIAL_SCENE, encodeShareHash, decodeShareHash, encodeSceneFile, decodeSceneFile, admitEnteredView } from './scene-adapter.js';
import { createGestureArbiter } from './gestures.js';
import { createPlaneRenderAdapter, createPlaneRequest } from './render-adapter.js';
import { startExport } from './export.js';
import { bindPlaneNavigation, navigationKey } from './navigation.js';

export const THUMBNAIL_ENCODE_MS = 5000;

export function createPlaneWorkspace({ shell, discoveries, sourceId = 'local' }) {
  const { $, toast, showDialog: openDialog } = shell;
  let canvas = $('#fractal');
  let renderer;
  // The scene history owns the one authoritative scene. `view` and `settings` are derived from it
  // and are assigned only in adopt().
  let sceneHistory, gestures, view, settings;
  let activePlace = 'seahorse';
  let busy = false, dirty = false, displayedView, navigation;
  let rendered = 0, requestVersion = 0, cycle = false, tour = null, adapter, lastReport = null, lastExport = null, exportHooks = {}, pendingReplacement = false;
  let geometryRevision = 0, appearanceRevision = 0;
  let savedTab = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;



  function adoptScene(scene) {
    const state = toPlaneState(scene);
    view = state.view;
    const { iterations, ...appearanceAndDetail } = state.settings;
    settings = appearanceAndDetail;
  }

  // Startup: a native share link opens its scene; anything else opens fresh-start Plane.
  function startupScene() {
    const link = decodeShareHash(location.hash);
    if (link.kind === 'scene' && link.scene.workspace === 'plane') { activePlace = ''; return link.scene; }
    if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Opening Seahorse valley.`);
    return PLANE_INITIAL_SCENE;
  }
  sceneHistory = createHistory({ initialScene: startupScene(), codec: sceneCodec });
  adoptScene(sceneHistory.snapshot().scene);
  sceneHistory.subscribe(() => updateHistoryControls());

  // Every scene change arrives here: derive view and settings, then render or recolor.
  function adopt(transition, interactive = false) {
    if (!transition) return;
    adoptScene(transition.after);
    if (!transition.render) return;
    const geometry = transition.changed.some(domain => domain !== 'appearance');
    if (geometry) geometryRevision++;
    if (transition.changed.includes('appearance')) appearanceRevision++;
    if (transition.changed.some(domain => domain !== 'camera')) syncControls();
    if (geometry) requestRender(interactive);
    else {
      updateReadouts();
      // A recolor of published geometry is itself a publication with its own report.
      const recolored = adapter.recolor(transition.after, generation());
      if (recolored.report) lastReport = recolored.report;
    }
  }
  const generation = () => ({ deviceEpoch: adapter.epoch, viewRevision: sceneHistory.snapshot().revision, geometryRevision, appearanceRevision });

  gestures = createGestureArbiter({ history: sceneHistory, onTransition: (transition, interactive) => adopt(transition, interactive), stopAutomated: () => stopTour() });
  const preview = (kind, command, interactive) => gestures.preview(kind, command, interactive);
  const commitGesture = kind => gestures.commit(kind);
  const applyAction = (commands, kind, interactive = false) => gestures.apply(commands, kind, interactive);
  // A wheel burst or key-repeat run: one camera-history entry after a quiet period.
  function navigateGrouped(next) {
    activePlace = '';
    gestures.grouped({ type: 'setCamera', camera: next });
    document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
  }
  function historyStep(action) {
    stopTour();
    navigation?.reset();
    const transition = gestures.step(action, action === 'back' || action === 'forward');
    if (transition) { activePlace = ''; renderPlaces(); }
  }
  function updateHistoryControls() {
    const snapshot = sceneHistory.snapshot();
    for (const [id, enabled] of [['#undo-button', snapshot.canUndo], ['#redo-button', snapshot.canRedo], ['#back-button', snapshot.canBack], ['#forward-button', snapshot.canForward]]) {
      const button = $(id); if (button) button.disabled = !enabled;
    }
  }

  function makeRenderer() {
    try { return new GpuRenderer(canvas); }
    catch (error) {
      console.info('Using the CPU renderer:', error.message);
      const replacement = canvas.cloneNode(false); canvas.replaceWith(replacement); canvas = replacement;
      toast('Using the CPU renderer. Deep views take a little longer.');
      return new CpuRenderer(canvas, error);
    }
  }
  renderer = makeRenderer();
  adapter = createPlaneRenderAdapter({ renderer, clock: () => performance.now() });

  function updateGraphicsDetails() {
    const info = renderer.diagnostics;
    $('#graphics-summary').textContent = {
      hardware: 'Your browser reports a hardware graphics device for WebGL rendering.',
      software: 'Your browser is running WebGL in software on the CPU.',
      unknown: 'WebGL is running, but the browser has not disclosed a recognizable graphics device.',
      cpu: 'Fractal calculations are running in the CPU fallback.',
    }[info.acceleration];
    $('#graphics-device').textContent = info.device;
    $('#graphics-reason').textContent = info.reason || 'WebGL 2 and floating-point rendering initialized successfully.';
    $('#graphics-attempted-row').hidden = !info.attemptedDevice;
    $('#graphics-attempted').textContent = info.attemptedDevice || '';
    $('#graphics-guidance').textContent = info.acceleration === 'cpu' || info.acceleration === 'software'
      ? 'Check your browser’s graphics acceleration setting and graphics diagnostics. Rendering runs on the computer where this browser is open.'
      : 'ATLAS calculates new images when you navigate or change the detail setting. A still view does not continuously recalculate the fractal.';
    $('#engine-status').title = `${info.device}\n${info.reason || info.acceleration}\nClick for graphics details`;
  }
  updateGraphicsDetails();

  function renderSettings() {
    return toPlaneState(sceneHistory.snapshot().scene).settings;
  }
  function dimensions() {
    const width = innerWidth, height = innerHeight;
    let ratio = Math.min(devicePixelRatio || 1, 1.6);
    const budget = view.zoom >= 28 ? 1100000 : 2300000;
    ratio = Math.min(ratio, Math.sqrt(budget / (width * height)));
    return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
  }
  function requestRender(interactive = false) {
    dirty = true; requestVersion++;
    if (busy && renderer instanceof CpuRenderer) adapter.cancelInteractive();
    if (interactive && displayedView) {
      const { scale, x, y } = viewTransform(displayedView, view, innerWidth);
      if ([scale, x, y].every(Number.isFinite)) canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
    updateReadouts();
    requestAnimationFrame(flushRender);
  }
  async function flushRender() {
    if (busy || !dirty || adapter.reserved || adapter.retired || adapter.unavailable) return;
    busy = true; dirty = false;
    const version = requestVersion;
    const snapshot = { ...view };
    const [width, height] = dimensions();
    const request = createPlaneRequest({ scene: sceneHistory.snapshot().scene, purpose: 'interactive', width, height, generation: generation() });
    $('#render-status').textContent = 'Resolving the landscape…';
    document.body.dataset.rendering = 'true';
    try {
      const report = await adapter.render(request, { isCurrent: () => version === requestVersion, currentGeneration: generation, liveScene: () => sceneHistory.snapshot().scene });
      if (report.outcome === 'superseded' || report.outcome === 'interrupted') return;
      if (report.outcome !== 'completed') throw new Error(report.reason);
      lastReport = report;
      displayedView = snapshot;
      canvas.style.transform = '';
      rendered++;
      document.body.dataset.ready = 'true';
      $('#engine-status').textContent = renderer.mode;
      updateGraphicsDetails();
      $('#render-status').textContent = 'Ready to explore';
      $('#resolution-status').textContent = `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} · RGB`;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      $('#render-status').textContent = 'Render interrupted';
      toast('This view could not finish rendering. Try reducing the level of detail.');
    } finally {
      busy = false;
      document.body.dataset.rendering = 'false';
      if (dirty || version !== requestVersion) requestAnimationFrame(flushRender);
    }
  }
  function updateReadouts() {
    const superscript = value => String(value).replace(/[-\d]/g, c => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' })[c]);
    $('#zoom-value').textContent = view.zoom < 6 ? (10 ** view.zoom).toLocaleString('en-US', { maximumFractionDigits: view.zoom < 1 ? 1 : 0 }) : `${(10 ** (view.zoom - Math.floor(view.zoom))).toFixed(2)} · 10${superscript(Math.floor(view.zoom))}`;
    for (const key of ['re', 'im']) {
      const text = view[key];
      $(`#coordinate-${key}`).textContent = (text.startsWith('-') ? '−' + text.slice(1) : '+' + text);
      $(`#coordinate-${key}`).title = text;
    }
    $('#precision-status').textContent = `${precisionFor(view.zoom)} DIGITS`;
    $('#detail-value').textContent = renderSettings().iterations.toLocaleString();
  }
  function syncControls() {
    $('#phase').value = Math.round(settings.phase * 1000);
    $('#frequency').value = Math.round(settings.frequency * 100);
    $('#detail').value = settings.detail;
    $('#relief').checked = !!settings.relief;
    $('#frequency-value').textContent = `${settings.frequency.toFixed(1)}×`;
    document.querySelectorAll('input[type=range]').forEach(styleRange);
    const palette = PALETTES.find(p => p.id === settings.palette);
    $('#palette-name').textContent = palette.name;
    $('#palette-description').textContent = palette.description;
    document.querySelectorAll('.palette-swatch').forEach(button => {
      const active = button.dataset.palette === settings.palette;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    updateReadouts();
  }
  function styleRange(input) {
    input.style.setProperty('--range', `${(input.value - input.min) / (input.max - input.min) * 100}%`);
  }
  // A jump to a place or entered coordinate: its camera goes to camera history and any
  // palette or detail it carries is one undoable content change.
  // The lexical and resource preflight runs before validateView materializes anything.
  function goTo(next, palette, place = '', { tourGesture = false } = {}) {
    const target = admitEnteredView(next);
    const commands = [{ type: 'setCamera', camera: { re: target.re, im: target.im, zoom: target.zoom } }];
    if (Number.isInteger(next.detail)) commands.push({ type: 'setIteration', patch: { detail: Math.min(5, Math.max(0, next.detail)) } });
    if (palette) commands.push({ type: 'setAppearance', patch: { palette } });
    activePlace = place;
    if (tourGesture) for (const command of commands) gestures.automate('tour', command);
    else applyAction(commands, 'jump');
    renderPlaces();
  }
  function navigate(next, interactive = true, kind = 'navigation') {
    stopTour(); activePlace = '';
    if (kind === 'jump') applyAction([{ type: 'setCamera', camera: next }], 'jump', interactive);
    else preview(kind, { type: 'setCamera', camera: next }, interactive);
    document.querySelectorAll('.destination-card.active').forEach(el => el.classList.remove('active'));
  }

  $('#palette-grid').innerHTML = PALETTES.map(p => `<button class="palette-swatch" data-palette="${p.id}" title="${p.name}" aria-label="${p.name} palette" aria-pressed="false" style="background:linear-gradient(145deg,${p.stops.slice(1,6).join(',')})"></button>`).join('');
  $('#palette-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-palette]');
    if (!button) return;
    applyAction([{ type: 'setAppearance', patch: { palette: button.dataset.palette } }], 'edit');
  });
  // One slider drag is one gesture: `input` previews, `change` (release) commits.
  $('#phase').addEventListener('input', event => { styleRange(event.target); preview('slider', { type: 'setAppearance', patch: { phase: event.target.value / 1000 } }); });
  $('#frequency').addEventListener('input', event => { preview('slider', { type: 'setAppearance', patch: { frequency: event.target.value / 100 } }); });
  $('#detail').addEventListener('input', event => { styleRange(event.target); preview('slider', { type: 'setIteration', patch: { detail: Number(event.target.value) } }); });
  for (const id of ['#phase', '#frequency', '#detail']) $(id).addEventListener('change', () => commitGesture('slider'));
  $('#relief').addEventListener('change', event => { applyAction([{ type: 'setAppearance', patch: { relief: Number(event.target.checked) } }], 'edit'); });
  $('#cycle-button').onclick = () => {
    cycle = !cycle; $('#cycle-button').setAttribute('aria-pressed', String(cycle));
    if (!cycle) commitGesture('animation');
    if (cycle && !tour) requestAnimationFrame(animate);
  };
  let lastAnimation = 0;
  function animate(time) {
    const dt = Math.min(.08, (time - (lastAnimation || time)) / 1000); lastAnimation = time;
    if (cycle) { gestures.animate({ type: 'setAppearance', patch: { phase: (settings.phase + dt * .025) % 1 } }); $('#phase').value = Math.round(settings.phase * 1000); styleRange($('#phase')); }
    if (tour && !adapter.reserved) {
      const elapsed = time - tour.started;
      if (elapsed > 18000) {
        tour.index = (tour.index + 1) % PLACES.length; tour.started = time; tour.lastFrame = 0;
        const place = PLACES[tour.index]; goTo(place, place.palette, place.id, { tourGesture: true });
        $('#tour-location').textContent = place.name;
      } else if (!busy && elapsed - tour.lastFrame > 90) {
        const step = (elapsed - tour.lastFrame) / 1000;
        tour.lastFrame = elapsed;
        gestures.automate('tour', { type: 'setCamera', camera: zoomView(view, view.zoom + Math.min(.2, step) * .07) }, true);
      }
    }
    if (cycle || tour) requestAnimationFrame(animate); else lastAnimation = 0;
  }
  function startTour() {
    if (tour) { stopTour(); return; }
    gestures.settle();
    tour = { index: 1, started: performance.now(), lastFrame: 0 };
    goTo(PLACES[1], PLACES[1].palette, PLACES[1].id, { tourGesture: true });
    $('#tour-status').hidden = false; $('#tour-location').textContent = PLACES[1].name;
    $('#tour-button').innerHTML = `${icon('pause')} Pause the journey <span class="arrow">↗</span>`;
    if (reducedMotion) toast('Journey started. Use Pause at any time to stop motion.');
    if (!cycle) requestAnimationFrame(animate);
  }
  function stopTour() {
    const running = tour;
    tour = null;
    if (running) commitGesture('tour');
    $('#tour-status').hidden = true;
    $('#tour-button').innerHTML = `${icon('play')} Take a journey <span class="arrow">↗</span>`;
  }
  $('#tour-button').onclick = startTour;
  $('#stop-tour').onclick = stopTour;

  navigation = bindPlaneNavigation({
    surface: $('#fractal-surface'), getCanvas: () => canvas, getView: () => view,
    onPointerStart() { stopTour(); gestures.settle(); },
    drag: next => navigate(next, true, 'navigation-drag'),
    dragEnd: () => commitGesture('navigation-drag'),
    grouped: navigateGrouped,
    jump: next => navigate(next, true, 'jump'),
  });
  // A lost context invalidates every earlier render and any export holding the renderer. The
  // replacement waits until an export lease has been released.
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); adapter.invalidate(); $('#render-status').textContent = 'Graphics paused'; toast('The graphics device paused. Restoring the view…');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (adapter.reserved) { pendingReplacement = true; return; }
    replaceRenderer(); requestRender();
  });
  $('#zoom-in').onclick = () => navigate(zoomView(view, view.zoom + Math.log10(2)), true, 'jump');
  $('#zoom-out').onclick = () => navigate(zoomView(view, view.zoom - Math.log10(2)), true, 'jump');
  $('#undo-button').onclick = () => historyStep('undo');
  $('#redo-button').onclick = () => historyStep('redo');
  $('#back-button').onclick = () => historyStep('back');
  $('#forward-button').onclick = () => historyStep('forward');
  const home = () => { stopTour(); goTo(PLACES[0], settings.palette, 'origin'); };
  $('#home-button').onclick = home;
  $('#brand-home').onclick = event => { event.preventDefault(); home(); };
  function cinema() { document.body.classList.toggle('cinema'); }
  $('#cinema-button').onclick = cinema;
  $('#settings-button').onclick = () => {
    document.body.classList.toggle('controls-expanded');
    $('#settings-button').setAttribute('aria-expanded', String(document.body.classList.contains('controls-expanded')));
  };
  $('#exit-cinema').onclick = cinema;
  $('#gallery-toggle').onclick = () => {
    document.body.classList.toggle('gallery-collapsed');
    const label = document.body.classList.contains('gallery-collapsed') ? 'Expand places' : 'Collapse places';
    $('#gallery-toggle').setAttribute('aria-label', label); $('#gallery-toggle').title = label;
  };

  const control = mountDiscoveriesControl({
    grid: $('#destination-grid'), countElement: $('#saved-count'), controller: discoveries, sourceId,
    isActive: () => savedTab, activeKey: () => activePlace,
    onOpen(record, key) {
      stopTour(); applyAction([{ type: 'restoreScene', scene: record.sceneSnapshot }], 'restore');
      activePlace = key; renderPlaces();
    },
    toast,
  });
  function renderPlaces() {
    if (savedTab) { control.render(); return; }
    $('#destination-grid').classList.remove('saved-places');
    $('#destination-grid').replaceChildren();
    PLACES.forEach((place, index) => {
      const button = document.createElement('button');
      button.className = `destination-card${place.id === activePlace ? ' active' : ''}`;
      button.dataset.place = place.id;
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.draggable = false;
      image.src = `/assets/${place.id}.png`;
      // Thumbnails are real renders, generated by scripts/thumbnails.mjs.
      image.onerror = () => { image.style.display = 'none'; };
      button.append(image);
      const fields = [['place-number', String(index + 1).padStart(2, '0')], ['place-arrow', '↗'], ['place-name', place.name], ['place-description', place.description]];
      for (const [className, text] of fields) { const span = document.createElement('span'); span.className = className; span.textContent = text; button.append(span); }
      button.onclick = () => { stopTour(); goTo(place, place.palette, place.id); };
      $('#destination-grid').append(button);
    });
    control.render();
  }
  // The thumbnail is captured only when the canvas shows exactly the current scene's publication:
  // the last report describes the adapter's current publication, whose scene hash is this scene's.
  // The record, its thumbnail and that report are committed together.
  async function saveDiscovery() {
    gestures.settle();
    const scene = sceneHistory.snapshot().scene;
    const published = adapter.published;
    if (!rendered || busy || dirty || adapter.reserved || !published || !lastReport || lastReport.requestId !== published.requestId || lastReport.sceneHash !== sceneCodec.fingerprint(scene).sceneHash) {
      toast('Let the current view finish, then save it.'); return;
    }
    const report = lastReport;
    const thumbnailCanvas = document.createElement('canvas'); thumbnailCanvas.width = 320; thumbnailCanvas.height = 160;
    thumbnailCanvas.getContext('2d').drawImage(canvas, 0, 0, 320, 160);
    let timer;
    const blob = await Promise.race([
      new Promise(resolve => thumbnailCanvas.toBlob(resolve, 'image/jpeg', .75)),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), THUMBNAIL_ENCODE_MS); }),
    ]).finally(() => clearTimeout(timer));
    if (!blob) { toast('This browser could not create a thumbnail. Use Capture → Save location to keep this view.'); return; }
    const base = PLACES.find(p => p.id === activePlace)?.name || 'Discovery';
    const count = Object.values(discoveries.snapshot().sources).reduce((total, view) => total + (Number.isInteger(view.total) ? view.total : view.items.length), 0);
    let record;
    try {
      record = createDiscoveryRecord({ scene, name: `${base} ${String(count + 1).padStart(2, '0')}`, thumbnail: { sourceReportId: report.reportId, mediaType: 'image/jpeg', blob }, id: crypto.randomUUID(), createdAt: new Date().toISOString(), sceneCodec });
    } catch (error) { toast(`This view could not be saved: ${error.message}`); return; }
    const observation = await discoveries.save(sourceId, record, { report });
    toast(writeMessage(observation, 'save'));
  }
  $('#bookmark-button').onclick = saveDiscovery;
  for (const id of ['places-tab', 'saved-tab']) $(`#${id}`).onclick = () => {
    savedTab = id === 'saved-tab';
    for (const tab of ['places-tab', 'saved-tab']) { const active = tab === id; $(`#${tab}`).classList.toggle('active', active); $(`#${tab}`).setAttribute('aria-pressed', String(active)); }
    renderPlaces();
  };

  function showDialog(id) { stopTour(); openDialog(id); }
  $('#engine-status').onclick = () => showDialog('#graphics-dialog');
  $('#graphics-button').onclick = () => { $('#help-dialog').close(); showDialog('#graphics-dialog'); };
  $('#help-button').onclick = () => showDialog('#help-dialog');
  $('#export-button').onclick = () => showDialog('#capture-dialog');
  $('#coordinates-button').onclick = () => {
    $('#input-re').value = view.re; $('#input-im').value = view.im; $('#input-zoom').value = view.zoom;
    $('#coordinate-error').textContent = ''; showDialog('#coordinate-dialog');
  };
  $('#coordinate-form').onsubmit = event => {
    event.preventDefault();
    try {
      const next = admitEnteredView({ re: $('#input-re').value.trim(), im: $('#input-im').value.trim(), zoom: Number($('#input-zoom').value) });
      goTo(next); $('#coordinate-dialog').close();
    } catch (error) { $('#coordinate-error').textContent = error.message; }
  };
  $('#share-button').onclick = async () => {
    commitGesture();
    const url = `${location.origin}${location.pathname}${encodeShareHash(sceneHistory.snapshot().scene)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); toast('View link copied. Every coordinate digit is included.'); }
    catch { toast('Your view is in the address bar. Copy that URL to share it.'); }
  };
  // A link opened during an investigation: a valid scene is a whole-scene restoration;
  // anything else is reported and changes neither the scene nor either history.
  addEventListener('hashchange', () => {
    const link = decodeShareHash(location.hash);
    if (link.kind === 'scene' && link.scene.workspace === 'plane') { stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene: link.scene }], 'restore'); renderPlaces(); }
    else if (link.kind === 'unsupported') toast(`${link.error.message[0].toUpperCase()}${link.error.message.slice(1)}. Your view is unchanged.`);
  });

  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  $('#download-location').onclick = () => {
    commitGesture();
    download(new Blob([encodeSceneFile(sceneHistory.snapshot().scene)], { type: 'application/json' }), 'atlas-scene.json');
    $('#capture-status').textContent = 'Location saved, including all coordinate digits.';
  };
  $('#import-location').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > sceneCodec.maxSceneBytes) throw new Error('This location file is too large.');
      const scene = decodeSceneFile(await file.text());
      stopTour(); activePlace = ''; applyAction([{ type: 'restoreScene', scene }], 'restore'); renderPlaces();
      $('#capture-dialog').close(); toast('Welcome back to your discovery.');
    } catch (error) { $('#capture-status').textContent = error.message || 'Could not open this location.'; }
    event.target.value = '';
  };
  // Only while no export holds the renderer: the adapter accepts the new renderer before the old
  // one is destroyed, so the workspace and the adapter always refer to the same renderer.
  function replaceRenderer() {
    if (adapter.reserved) { pendingReplacement = true; return; }
    pendingReplacement = false;
    const previous = renderer, next = makeRenderer();
    adapter.replaceRenderer(next);
    renderer = next;
    previous.destroy();
    updateGraphicsDetails();
  }
  // The complete export request is captured and the renderer reserved synchronously in this
  // handler, before any asynchronous wait (spec §14). Later edits change only the live scene.
  $('#download-image').onclick = () => {
    if (adapter.reserved || adapter.retired || adapter.unavailable) { $('#capture-status').textContent = 'The graphics device is not available yet. Try again in a moment.'; return; }
    stopTour(); commitGesture();
    const scene = sceneHistory.snapshot().scene;
    const width = $('#export-size').value === 'current' ? canvas.width : Number($('#export-size').value);
    const height = Math.max(1, Math.round(width * innerHeight / innerWidth));
    const request = createPlaneRequest({ scene, purpose: 'export', width, height, generation: generation() });
    const { done } = startExport({ adapter, request, hooks: exportHooks, encode: target => new Promise(resolve => target.toBlob(resolve, 'image/png')) });
    const button = $('#download-image'); button.disabled = true;
    $('#capture-status').textContent = 'Rendering your image…';
    done.then(result => {
      lastExport = result;
      if (result.outcome === 'completed') {
        download(result.blob, `atlas-${Math.floor(scene.camera.zoom)}-decades.png`);
        $('#capture-status').textContent = `Saved ${result.report.completed.width.toLocaleString()} × ${result.report.completed.height.toLocaleString()} pixels. Save the location below to return here.`;
      } else $('#capture-status').textContent = result.reason || 'Image export is unavailable.';
      if (adapter.retired || pendingReplacement) replaceRenderer();
    }).finally(() => { button.disabled = false; requestRender(); });
  };

  addEventListener('keydown', event => {
    if (event.target.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    const historyKey = (event.ctrlKey || event.metaKey) && !event.altKey
      ? (key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null)
      : event.altKey && !event.ctrlKey && !event.metaKey ? ({ arrowleft: 'back', arrowright: 'forward' })[key] : null;
    if (historyKey) { event.preventDefault(); historyStep(historyKey); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const next = navigationKey(key, view);
    if (next) { event.preventDefault(); navigateGrouped(next); return; }
    const actions = {
      r: home, h: cinema, b: saveDiscovery, s: () => showDialog('#capture-dialog'), '?': () => showDialog('#help-dialog'),
      escape: () => { document.body.classList.remove('cinema'); stopTour(); },
    };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  });
  // A new size is a new geometry dependency: earlier renders are no longer publishable.
  addEventListener('resize', () => { geometryRevision++; requestRender(true); });
  addEventListener('pagehide', () => adapter.renderer.destroy());

  // Small inspection API for numerical and browser regression tests.
  class IdleTimeoutError extends Error {
    constructor(ms, state) { super(`ATLAS did not become idle within ${ms} ms (${JSON.stringify(state)}).`); this.name = 'IdleTimeoutError'; this.code = 'ATLAS_IDLE_TIMEOUT'; }
  }
  const inspection = {
    get graphics() { return { ...renderer.diagnostics }; },
    get view() { return { ...view }; }, get settings() { return renderSettings(); }, get renderer() { return adapter.renderer; },
    get lastReport() { return lastReport; },
    get lastExport() { return lastExport && { outcome: lastExport.outcome, reason: lastExport.reason, sceneHash: lastExport.request.sceneHash, scene: lastExport.request.sceneSnapshot, report: lastExport.report, renderReport: lastExport.renderReport ?? null }; },
    // Test seams for the export race checks: the decoded image of the last export, stage hooks,
    // and whether the workspace and the adapter share one renderer.
    async lastExportImageData() {
      if (!lastExport?.blob) return null;
      const bitmap = await createImageBitmap(lastExport.blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    },
    get rendererConsistent() { return renderer === adapter.renderer; },
    setExportHooks(hooks) { exportHooks = hooks || {}; },
    get rendered() { return rendered; }, goTo,
    get scene() { return sceneHistory.snapshot().scene; },
    get history() { const { scene, ...rest } = sceneHistory.snapshot(); return rest; },
    undo: () => historyStep('undo'), redo: () => historyStep('redo'), back: () => historyStep('back'), forward: () => historyStep('forward'),
    async whenIdle({ timeoutMs = 60000 } = {}) {
      const deadline = performance.now() + timeoutMs;
      while (busy || dirty || adapter.reserved || adapter.unavailable) {
        if (performance.now() > deadline) throw new IdleTimeoutError(timeoutMs, { busy, dirty, exporting: adapter.reserved, unavailable: adapter.unavailable });
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    },
  };
  discoveries.setWorkspace('plane');
  syncControls(); renderPlaces(); updateHistoryControls(); requestRender();
  return Object.freeze({ inspection, destroy: () => { control.destroy(); adapter.renderer.destroy(); } });
}
````

**`src/app.js`** (complete file):

````js
// Composition root: the shell, durable storage, the discovery source and controller, and
// the Plane workspace (spec §4.1). A fresh start opens Plane (user decision, 2026-10-20).
import { createShell } from './ui/shell.js';
import { createPlaneWorkspace } from './plane/workspace.js';
import { openPersistence } from './shared/persistence.js';
import { createLocalDiscoverySource, createDiscoveriesController } from './shared/discoveries.js';
import { sceneCodec } from './plane/scene-adapter.js';

const shell = createShell(document);

// Storage opens in the background; exploration never waits for it. Until it opens every
// call waits for it, and if it cannot open every call reports why.
const opened = openPersistence();
opened.catch(error => console.info('Discoveries are unavailable:', error.message));
const store = {
  listDiscoveries: async query => (await opened).listDiscoveries(query),
  countDiscoveries: async query => (await opened).countDiscoveries(query),
  getDiscovery: async (id, options) => (await opened).getDiscovery(id, options),
  getWriteMarker: async (writeId, options) => (await opened).getWriteMarker(writeId, options),
  commit: async (batch, options) => (await opened).commit(batch, options),
};
const local = createLocalDiscoverySource({ store, sceneCodec });
const discoveries = createDiscoveriesController({ sources: [local], sceneCodec });

const plane = createPlaneWorkspace({ shell, discoveries, sourceId: local.id });
window.atlas = plane.inspection;
addEventListener('pagehide', () => opened.then(db => db.close(), () => {}));
````

- [ ] **Step 6: Run the unit tests and the checks**

Run:
```bash
npm test && for f in src/app.js src/plane/workspace.js src/plane/navigation.js src/ui/*.js tests/workflow.mjs tests/browser.mjs; do node --check "$f"; done && ! grep -rn "atlas.discoveries" src/
```
Expected: `UNIT {"state":"passed","reason":"125 tests passed","files":14,…}` and exit 0. The syntax checks print nothing, and `grep` finds no reference to the earlier bookmarks key in `src/`.

- [ ] **Step 7: Commit**

```bash
git add src/app.js src/plane/workspace.js src/plane/navigation.js src/ui/shell.js src/ui/dialogs.js src/ui/notifications.js tests/unit/navigation.test.js tests/unit.manifest.json tests/browser.mjs tests/workflow.mjs tests/suites.manifest.json
git commit -m "Extract the Plane workspace and shell; Discoveries move to IndexedDB"
```

- [ ] **Step 8: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 9: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.


---

### Task T13: Acceptance audit, documentation and handoff

**Owner:** Codex. **Reviewer:** Claude. **Depends on:** all; the GPU handed over.

The final task adds no features. It audits that every 1a commit has its own valid, passing gate evidence — a ledger line is only an index; acceptance comes from the referenced record, checked for schema, exact commit, the commit's own required suites and a recomputed result — then updates the source map and the handoff and commits the summary. Testing only the tip cannot clear earlier commits. The commits after the audited range (the ledger summary and the log archive) are gated too; their own records stay in `artifacts/gates/` rather than in the summary they would change.

**Files:**
- Create: `scripts/gate/ledger.mjs`, `scripts/audit-gates.mjs`
- Modify: `README.md`, `HANDOFF.md` (exact replacements), `tests/unit.manifest.json`
- Test: `tests/unit/ledger.test.js`
- Create (generated): `docs/reports/project1a/gate-ledger.json`

**Interfaces:**
- Consumes: `artifacts/gates/ledger.jsonl` and the records it names (T00 gate); `overallGate` (T00).
- Produces: `judgeRecord(commit, record, requiredIds) → {state:"passed"|"pending"|"failed"|"invalid", reason}`, `auditLedger({commits, entries, records, requiredIdsFor}) → {accepted, corruptLedgerLines, rows:[{commit, state:"accepted"|"pending"|"failed"|"invalid-evidence"|"ungated", runs, record, reason}]}`, `parseLedger(text)`, `requiredIdsFromManifest(manifest)`; CLI `node scripts/audit-gates.mjs <base> <implementationHead>`.

**Design assertions:**
- Plan rule (candidate vs accepted): every audited commit needs its own passing evidence (`every commit needs its own passed gate; the final tip cannot clear earlier commits`); a ledger claim without valid evidence never accepts a commit — missing or corrupt record, wrong commit, missing required suite, a deferred suite claimed as passed (`a ledger claim without valid evidence never accepts a commit`, `an ungated commit, an empty range or a corrupt ledger line never passes`).

- [ ] **Step 1: Write the failing tests**

**`tests/unit/ledger.test.js`** (complete file):

````js
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLedger, judgeRecord, parseLedger, requiredIdsFromManifest } from '../../scripts/gate/ledger.mjs';

const IDS = ['unit', 'build', 'browser', 'graphics', 'cleanup'];
const passedResults = Object.fromEntries(IDS.map(id => [id, { state: 'passed', reason: '' }]));
const record = (commit, overrides = {}) => ({ schema: 'atlas.plane-gate', schemaVersion: 1, commit, requiredIds: IDS, results: passedResults, overall: { state: 'passed' }, ...overrides });
const audit = (commits, entries, records) => auditLedger({ commits, entries, records, requiredIdsFor: () => IDS });

test('every commit needs its own passed gate; the final tip cannot clear earlier commits', () => {
  const deferred = { ...passedResults, graphics: { state: 'deferred', reason: 'held' } };
  const entries = [
    { commit: 'a', overall: 'pending', record: 'a1' },
    { commit: 'b', overall: 'passed', record: 'b1' },
    { commit: 'c', overall: 'passed', record: 'c1' },
  ];
  const records = { a1: record('a', { results: deferred, overall: { state: 'pending' } }), b1: record('b'), c1: record('c') };
  const result = audit(['a', 'b', 'c'], entries, records);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.rows.map(row => row.state), ['pending', 'accepted', 'accepted']);
  assert.equal(audit(['a', 'b', 'c'], [...entries, { commit: 'a', overall: 'passed', record: 'a2' }], { ...records, a2: record('a') }).accepted, true);
});

test('a ledger claim without valid evidence never accepts a commit', () => {
  const claim = [{ commit: 'x', overall: 'passed', record: 'r' }];
  const cases = {
    'missing record': {},
    'corrupt record': { r: { unreadable: 'Unexpected token' } },
    'wrong commit': { r: record('y') },
    'missing required suite': { r: record('x', { requiredIds: IDS.slice(0, 3), results: Object.fromEntries(IDS.slice(0, 3).map(id => [id, { state: 'passed' }])) }) },
    'deferred suite claimed as passed': { r: record('x', { results: { ...passedResults, graphics: { state: 'deferred', reason: 'held' } } }) },
    'wrong schema': { r: record('x', { schema: 'other' }) },
  };
  for (const [name, records] of Object.entries(cases)) {
    const result = audit(['x'], claim, records);
    assert.equal(result.accepted, false, name);
    assert.equal(result.rows[0].state, 'invalid-evidence', name);
  }
  assert.match(judgeRecord('x', record('x', { results: { ...passedResults, graphics: { state: 'deferred' } } }), IDS).reason, /claims passed, its results give pending/);
});

test('an ungated commit, an empty range or a corrupt ledger line never passes', () => {
  assert.equal(audit(['x'], [], {}).rows[0].state, 'ungated');
  assert.equal(audit([], [], {}).accepted, false);
  const entries = parseLedger('{"commit":"x","overall":"passed","record":"r"}\nnot json\n\n');
  assert.equal(entries.length, 2);
  const result = audit(['x', 'y'], entries, { r: record('x') });
  assert.deepEqual([result.accepted, result.corruptLedgerLines, result.rows[0].state, result.rows[1].state], [false, 1, 'accepted', 'ungated']);
  assert.deepEqual(requiredIdsFromManifest({ suites: [{ id: 'browser' }, { id: 'graphics' }] }), IDS);
  assert.equal(requiredIdsFromManifest(undefined), null);
});
````

**`tests/unit.manifest.json`** (complete file):

````json
{
  "files": [
    "tests/math.test.js",
    "tests/unit/no-launch.test.js",
    "tests/unit/gate.test.js",
    "tests/unit/scene.test.js",
    "tests/unit/plane-scene.test.js",
    "tests/unit/history.test.js",
    "tests/unit/gestures.test.js",
    "tests/unit/render-adapter.test.js",
    "tests/unit/renderer-guards.test.js",
    "tests/unit/export.test.js",
    "tests/unit/discoveries.test.js",
    "tests/unit/persistence.test.js",
    "tests/unit/discoveries-control.test.js",
    "tests/unit/navigation.test.js",
    "tests/unit/ledger.test.js"
  ]
}
````

- [ ] **Step 2: Write the interface skeleton**

**`scripts/gate/ledger.mjs`** (complete file — interface skeleton):

````js
// T13 interface skeleton. Replaced in full by the implementation step.
export const GATE_RECORD_SCHEMA = 'atlas.plane-gate';
export const judgeRecord = () => ({ state: 'passed', reason: '' });
export const auditLedger = () => ({ accepted: true, corruptLedgerLines: 0, rows: [] });
export const parseLedger = () => [];
export const requiredIdsFromManifest = () => null;
````

- [ ] **Step 3: Run the named test to verify it fails on an assertion**

Run:
```bash
node scripts/run-unit.mjs tests/unit/ledger.test.js --expect-fail "every commit needs its own passed gate; the final tip cannot clear earlier commits"
```
Expected: `RED confirmed: "every commit needs its own passed gate; the final tip cannot clear earlier commits" fails on an assertion` and exit 0. Any other failure — a missing module, a syntax, reference, launch or timeout error, or a different test — prints `RED NOT confirmed` and exits 1.

- [ ] **Step 4: Write the implementation (replacing the skeleton)**

**`scripts/gate/ledger.mjs`** (complete file):

````js
// Acceptance audit. A ledger line is only an index into evidence: acceptance comes from the
// referenced gate record — its schema, its exact commit, the required suite set for that
// commit, and a recomputed overall result. Missing, malformed, contradictory or incomplete
// evidence never establishes acceptance (fails closed).
import { overallGate } from './lib.mjs';

export const GATE_RECORD_SCHEMA = 'atlas.plane-gate';
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);

// → { state: 'passed' | 'pending' | 'failed' | 'invalid', reason }
export function judgeRecord(commit, record, requiredIds) {
  if (record === undefined) return { state: 'invalid', reason: 'the referenced gate record is missing' };
  if (!record || typeof record !== 'object' || record.unreadable) return { state: 'invalid', reason: 'the gate record is unreadable' };
  if (record.schema !== GATE_RECORD_SCHEMA || record.schemaVersion !== 1) return { state: 'invalid', reason: 'not an atlas.plane-gate v1 record' };
  if (record.commit !== commit) return { state: 'invalid', reason: `the record is for ${record.commit}, not ${commit}` };
  if (!Array.isArray(requiredIds) || !requiredIds.length) return { state: 'invalid', reason: 'the commit\'s required suite set is unknown' };
  if (!sameList(record.requiredIds, requiredIds)) return { state: 'invalid', reason: 'the record does not cover the commit\'s required suites' };
  if (!record.results || typeof record.results !== 'object') return { state: 'invalid', reason: 'the record has no results' };
  const recomputed = overallGate(record.results, requiredIds);
  if (record.overall?.state !== recomputed.state) return { state: 'invalid', reason: `the record claims ${record.overall?.state}, its results give ${recomputed.state}` };
  return { state: recomputed.state, reason: recomputed.reason };
}

// commits: the audited SHAs in order; entries: parsed ledger lines (null for corrupt lines);
// records: { path → parsed record | undefined }; requiredIdsFor(commit) → the commit's suite ids.
export function auditLedger({ commits, entries, records, requiredIdsFor }) {
  const rows = commits.map(commit => {
    const judged = entries.filter(entry => entry && entry.commit === commit).map(entry => ({ record: entry.record, ...judgeRecord(commit, records[entry.record], requiredIdsFor(commit)) }));
    const passed = judged.filter(run => run.state === 'passed');
    const state = passed.length ? 'accepted' : judged.some(run => run.state === 'pending') ? 'pending' : judged.some(run => run.state === 'failed') ? 'failed' : judged.length ? 'invalid-evidence' : 'ungated';
    const chosen = passed.at(-1) ?? judged.at(-1) ?? null;
    return { commit, state, runs: judged.length, record: chosen?.record ?? null, reason: chosen?.reason ?? 'no gate run recorded' };
  });
  return { accepted: rows.length > 0 && rows.every(row => row.state === 'accepted'), corruptLedgerLines: entries.filter(entry => !entry).length, rows };
}

export function parseLedger(text) {
  return text.split('\n').filter(line => line.trim()).map(line => { try { return JSON.parse(line); } catch { return null; } });
}

// The required suite ids of a commit, from its own tests/suites.manifest.json (as the gate builds them).
export function requiredIdsFromManifest(manifest) {
  return manifest && Array.isArray(manifest.suites) ? ['unit', 'build', ...manifest.suites.map(suite => suite.id), 'cleanup'] : null;
}
````

**`scripts/audit-gates.mjs`** (complete file):

````js
// node scripts/audit-gates.mjs <base> <implementationHead>
// Audits every commit in base..implementationHead against its own gate evidence, writes
// docs/reports/project1a/gate-ledger.json, and exits 0 only if every commit is accepted.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditLedger, parseLedger, requiredIdsFromManifest } from './gate/ledger.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const [base, head] = process.argv.slice(2);
if (!base || !head) { console.error('usage: node scripts/audit-gates.mjs <base> <implementationHead>'); process.exit(1); }
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const implementationHead = git('rev-parse', head);
const commits = git('rev-list', '--reverse', `${base}..${implementationHead}`).split('\n').filter(Boolean);
let entries = [];
try { entries = parseLedger(await readFile(resolve(root, 'artifacts/gates/ledger.jsonl'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const records = {};
for (const entry of entries) {
  if (!entry?.record || entry.record in records) continue;
  try { records[entry.record] = JSON.parse(await readFile(resolve(root, entry.record), 'utf8')); }
  catch (error) { records[entry.record] = error.code === 'ENOENT' ? undefined : { unreadable: error.message }; }
}
const requiredIdsFor = commit => { try { return requiredIdsFromManifest(JSON.parse(git('show', `${commit}:tests/suites.manifest.json`))); } catch { return null; } };
const audit = auditLedger({ commits, entries, records, requiredIdsFor });
for (const row of audit.rows) console.log(`${row.commit.slice(0, 12)} ${row.state.padEnd(16)} ${row.record ?? ''} ${row.state === 'accepted' ? '' : row.reason}`);
await mkdir(resolve(root, 'docs/reports/project1a'), { recursive: true });
await writeFile(resolve(root, 'docs/reports/project1a/gate-ledger.json'), `${JSON.stringify({ base: git('rev-parse', base), implementationHead, audit }, null, 2)}\n`);
console.log(audit.accepted ? `ACCEPTED: all ${commits.length} commits passed the full gate` : 'NOT ACCEPTED: at least one commit lacks valid passing gate evidence');
process.exitCode = audit.accepted ? 0 : 1;
````

- [ ] **Step 5: Update the documentation**

In `README.md`, replace exactly:

````text
| `src/app.js` | Navigation, controls, bookmarks, import/export, sharing |
| `src/ui/style.css`, `src/ui/icons.js` | Responsive observatory interface |
````

with:

````text
| `src/app.js` | Composition root: shell, storage, discoveries, the Plane workspace |
| `src/plane/workspace.js` | Plane lifecycle, controls, undo and camera history, sharing, import/export |
| `src/plane/navigation.js` | Pointer, wheel, touch and key navigation |
| `src/plane/scene-adapter.js` | Plane scenes, the detail/zoom iteration policy, share links and scene files |
| `src/plane/render-adapter.js`, `src/plane/export.js` | Render requests, outcomes and reports; the exclusive, immutable image export |
| `src/shared/scene.js`, `src/shared/commands.js`, `src/shared/history.js` | Scene envelope and fingerprints, domain-owning commands, undo and camera history |
| `src/shared/render-request.js`, `src/shared/render-report.js` | Immutable render requests and truthful reports |
| `src/shared/discoveries.js`, `src/shared/persistence.js` | Discovery records, sources and controller; IndexedDB storage |
| `src/ui/` | Shell, dialogs, notifications, the Discoveries control, icons and styles |
````

In `HANDOFF.md`, replace exactly:

````text
- The plan is `docs/superpowers/plans/2026-10-20-project1a-foundations-plan.md`; the sections below describe the 2D explorer as of 2026-10-15.
````

with:

````text
- The plan is `docs/superpowers/plans/2026-10-20-project1a-foundations-plan.md`; the sections below describe the 2D explorer as of 2026-10-15.
- Project 1a is accepted when `node scripts/audit-gates.mjs <base> <implementationHead>` reports ACCEPTED: every implementation commit has its own valid, passing gate record. The summary is `docs/reports/project1a/gate-ledger.json`; the records themselves stay in `artifacts/gates/`.
- Plane now keeps one authoritative scene in a history: undo covers appearance and detail; Back/Forward (Alt+←/→) covers camera moves. Discoveries live in IndexedDB (`atlas-workbench`), shown by the Discoveries control in Your discoveries.
````

- [ ] **Step 6: Run the unit tests**

Run:
```bash
npm test
```
Expected: `UNIT {"state":"passed","reason":"128 tests passed","files":15,…}` and exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/gate/ledger.mjs scripts/audit-gates.mjs tests/unit/ledger.test.js tests/unit.manifest.json README.md HANDOFF.md
git commit -m "Add the per-commit gate acceptance audit and update the source map"
```

- [ ] **Step 8: Gate the commit**

Run (one of the two, as the GPU state requires):
```bash
ATLAS_GPU_HANDOFF="<who handed the GPU over, when>" npm run gate
ATLAS_GPU_DEFERRED="<reason, e.g. Project 0 holds the GPU>" npm run gate
```
Expected: the last line is `GATE PASSED (every required suite passed) → artifacts/gates/…` (exit 0), or,
with a deferral, `GATE PENDING (GPU suites deferred by explicit handoff) → …` (exit 2), and every
non-GPU suite line reads `passed`. Any `failed`, `incomplete` or `not-run` line rejects this candidate:
stop, keep its gate record, correct the commit in private history (amend or rebase) and gate every
rewritten SHA; a later passing commit never accepts a failed ancestor. A pending commit stays a
candidate until a handoff run passes on that exact commit.

- [ ] **Step 9: Clear every pending candidate, then audit**

Record the two SHAs: `BASE` = the commit the implementation branch started from (the approved plan commit), `HEAD1A` = this task's commit. With the GPU handed over, for each commit the audit lists as `pending`: `git checkout --detach <commit> && ATLAS_GPU_HANDOFF="<who, when>" npm run gate; git checkout -`. A commit whose gate *failed* cannot be accepted by later commits: the implementation branch is private until acceptance, so the failing commit is corrected in place (amend or rebase), and every rewritten SHA after it is gated again before the audit. Then:

Run:
```bash
node scripts/audit-gates.mjs "$BASE" "$HEAD1A"
```
Expected: one line per 1a commit, each `accepted`, then `ACCEPTED: all <n> commits passed the full gate` and exit 0. Any other state is a stop: report it, do not commit the summary.

- [ ] **Step 10: Commit and gate the summary**

```bash
git add docs/reports/project1a/gate-ledger.json
git commit -m "Record the Project 1a gate acceptance ledger"
```

Gate this commit with `ATLAS_GPU_HANDOFF` as in the gate step; expected `GATE PASSED`. Its record stays in `artifacts/gates/`.

- [ ] **Step 11: Peer review**

The peer who did not implement the task reviews the task's diff read-only and logs it verbatim
(`codex_bridge.py review --diff <base>` when Claude implemented it; Claude reviews Codex's patch
before applying it). With no blocking findings the task is **implemented**; it is **accepted**
only when a gate record for each of its commits passes with the GPU suites included. Until then it
is reported as *implemented, validation pending*.

- [ ] **Step 12: Hand off**

Archive the co-design log to `docs/codesign/project1-log.md` in its own commit and gate it the same way. Report to the user: the accepted summary, the gate records of the two documentation commits, the browser and hardware reports, and any deviation recorded during execution.


---

## Self-review against the spec

- §4.2 extraction order: move first (T01), scene adapter (T03, T05), commands (T04, T05), shell
  (T12), navigation and lifecycle (T12); documentation as its own commit (T02).
- §4.3: gate on every commit (T00 onward); only the listed assertion changes (T05, T12).
- §5: envelope, frozen scenes, canonical serialization and hash, whole-scene validation, Plane
  fields and inapplicable fields (T03).
- §6 and §19.1: domains, derived invalidation, gestures, exact restoration, 100-entry bounds, new
  revisions, camera history with synchronization and tours (T04, T05).
- §7.1–7.4: frozen requests, revisions and keys, outcomes, reports with unavailable and
  inapplicable fields (T06); Plane adopts them without changing cadence (T08). §7.5–7.6 are Space-only.
- §12: no legacy readers; earlier formats reported (T03, T05, T12).
- §13.1: fresh start opens Plane (T05). §13.10: record, source contract, local source, control
  (T09–T12).
- §14: IndexedDB with no false success (T10, T12); scene files and share links (T03, T05); the
  export invariant with both races (T07, T08).
- §16.1 rows for 1a: scene/history/discoveries (T03, T04, T09, T11), interaction (T05, T08, T12).
- §16.3: the gate (T00, every task). §16.5: GPU suites need the explicit handoff.
