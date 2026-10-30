# BI1.C — recover the prepared world without changing the place

2026-10-30. Owner Codex; challenger Claude. **Draft for independent review; implementation has not started.** Base merged BI1.B `57ba3b9cb0146724fdfc7ced5e991b4bee61b64d`, branch `feat/bi1c`, worktree `/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/bi1c`. Baseline:1,327 guarded units/82 files pass.

Governing [North Star](2026-10-23-atlas-north-star-charter.md), [fixed-world interpretation](2026-10-29-atlas-multiscale-world-clarification.md), [BI1](2026-10-29-atlas-bi1-application-integration.md), [Project1 recovery](2026-10-19-project1-design.md) and [roadmap](../plans/2026-10-29-atlas-browser-world-move-forward.md). This closes the bounded local-development integration's execution-loss cases before interleaved AP1/MD2 increments. It does not select a production backend, expand the world or alter mathematical detail generation.

## Experience and risk

Explore Landscape and survive a lost GPU device without losing the mathematical place, requested file or histories. The first active-viewport device loss gets at most one automatic rebuild. A repeated loss, collision-worker failure, failed rebuild or unavailable native preparer stops clearly and offers explicit Retry. Retry rebuilds current compatible render/collision coverage and checks the current requested body's clearance before publishing or admitting input. A dead helper can be replaced through that explicit action while the launcher remains alive.

The riskiest assumption is coordinated retirement: GPU, worker, native producer and user scene/history have different lifetimes. A fresh execution must not accept old receipts, cancel a new owner, silently reset the place, or start before old cleanup is confirmed. Loss during an unfinished restore must retain that newer request, rather than store the prior runtime pose over it.

## Audited gaps and API basis

Current prepared rendering observes device.lost but forwards a string and only deactivates. Worker.onerror rejects current jobs but does not make the preparer terminal; it may be invisible when idle. The server memoizes one adapter forever, including initialization rejection or a controller whose child exited. Future controller.run calls do not check an already-observed exit. GPU retirement awaits submitted work and can throw on known loss, obstructing a safe rebuild. Existing generation, lease, file and history owners supply the foundation and remain authoritative.

Current official WebGPU documentation was fetched with Context7 (`/gpuweb/gpuweb`). Device loss resolves device.lost, invalidates the device and its objects, and requires a fresh adapter/device for recovery. Deliberate destroy also loses the device; renderer disposal must suppress that intentional callback. The implementation must use a structured failure code and must not parse implementation-defined loss messages. [Specification](https://gpuweb.github.io/gpuweb/#dom-gpudevice-lost), [device destruction](https://gpuweb.github.io/gpuweb/#dom-gpudevice-destroy).

## Browser execution and policy

Keep recovery with the prepared workspace, not shared scene/history or the mathematical runtime. Use typed notifications from renderer and browser preparer. Every current failure synchronously closes input, settles accepted motion once, cancels scale/file work as applicable, invalidates the execution and starts tracked retirement. Old callbacks are ignored by state identity. GPU/worker handles never enter portable scenes.

- **First active-viewport device loss:** consume the one automatic recovery allowance and immediately request a fresh activation through the existing mode host. The host owns supersession/leave; do not schedule a later activation after an unrelated cleanup promise that could re-enter a departed workspace.
- **Repeated device loss or failed automatic rebuild:** stopped state with reason, Save/Open/Retry and Plane/viewer still available. No timed automatic loop. Ordinary leave/re-entry and scene edits do not replenish the allowance; explicit Retry does.
- **Worker crash, message failure, index deadline or other preparation error:** terminal preparer, reject pending work, stop visibly and require explicit Retry. No attempt to reuse a broken worker.
- **Failure before first presentation:** cancel unfinished execution and preserve the requested scene, then show unavailability/Retry through the existing fallback. Automatic recovery is reserved for an already active viewport. This boundary is explicit rather than claiming all startup-failure parity.
- **Retry:** reset the automatic allowance; restart the selected Landscape activation with fresh runtime/client/worker/device identity. Histories and requested scene are unchanged. An unsupported world/pose still fails admission. No silent scale, origin, sampling, speed or quality change.

The renderer records an execution epoch, reports device-loss separately from uncaptured GPU errors, rejects use after loss, and retires buffers on acknowledged device loss even if onSubmittedWorkDone rejects. Unrelated retirement errors remain sticky. Disposal always destroys owned resources and suppresses self-generated device-loss recovery. A consumer checks cancellation/terminal state across asynchronous physics initialization, worker completion and upload; late results are released, never published.

A pending scale intent is cancelled by interruption. Existing stale scale status is cleared on a fresh activation or accepted movement so it cannot hide the new recovery/frontier state. Imported roll's first-drag limitation is otherwise unchanged.

## Native preparation lifetime

Introduce a small testable lifecycle owner around adapter construction, health and retirement. One healthy adapter is reused across ordinary browser histories/rebuilds. Unexpected worker exit invalidates its generation and retires the current server client before any replacement can become available. Heartbeat/prepare admission must reject the retired owner; tombstones still acknowledge cleanup. Stop input on the delivered failure; cached collision geometry remains safe while a previously verified lease is still valid, without claiming zero transport delay to detect a remote failure.

Only an explicit application open after failure can create the next producer. Metadata/status reads never start native work. Wait for confirmed old controller/queue/publication cleanup before constructing a replacement. Initialization failure also permits an explicit fresh attempt only after owned startup cleanup. Unconfirmed cleanup is sticky and requires launcher restart. Close handlers and in-flight HTTP requests capture their own adapter generation; late old completions cannot retire or publish through the new adapter.

Use distinct producer-attempt output directories so old failed evidence/buffers cannot be overwritten by restarted job numbering. Preserve aggregate native-records output for existing audits, with generation provenance. Keep the existing4GiB successful-output quota across attempts, the existing per-process96/32/64MiB caches and all request/publication/residency caps. Proposed cap:16 producer constructions per launcher, with a clear launcher-restart reason afterward. This bounds restart metadata/directories; it does not establish complete physical disk or region-memory ownership. No automatic process restart loop.

The native controller rejects new jobs immediately after observed process exit and exposes idempotent bounded close. No system driver/package changes. The fixed world/source assets/certificate and mathematical worker computations remain unchanged.

## Verification seams and scope

Use the existing diagnostic inspection precedent: an explicit device-destroy hook exercises an actual GPUDevice.lost; a diagnostic worker message throws an uncaught worker error, exercising the actual onerror path. These are inspection/test functions, not visitor controls. Native loss kills only the suite-owned, recorded helper PID while a preparation request is outstanding. Label this as process/request interruption, not proof of a particular GPU-kernel failure. No generic HTTP kill/restart endpoint is introduced.

Guarded CPU tests use real workspace/runtime logic with fake devices/workers/adapters and controlled promises. Cover one automatic attempt, repeated failure, explicit Retry, idle and pending worker loss, late callbacks/uploads, newer requested file winning, leave during recovery, current-pose clearance, sticky cleanup and no scene/history drift. Native lifecycle controls check failure/retry/constructor cleanup/old generation/output budget without spawning processes. A native-free real HTTP replay exercises server admission/tombstones and a held old completion across replacement before hardware.

One headed recovery route records nondefault place/history, actual device destruction and automatic return; second destruction/stopped/explicit retry; actual worker error/explicit retry; actual owned helper exit/explicit retry/new producer; input fences and unchanged requested place/history. CPU barriers establish precise races; the headed route is finite application evidence, not an arbitrary crash corpus. Existing application/contact/scale, file/history, session/launcher and Plane/viewer suites run in the final full gate on this source.

[Card](../../reports/project1-interactive/BI1C-CARD-2026-10-30.md) freezes all criteria, limits and stop rules. Full scorecard must report30FPS overall/preparation, navp99≤2ms/max≤8ms,1s interaction readiness, recovery/restore timing separately and1GiB attributable region memory as pass/miss/unverified. Standing misses may remain; no hidden tail/artistic test. Preserve failed attempts, exact hashes, peer reading/execution scope and process cost. Advisor merges the reviewed PR.
