# BI1.C implementation review (evidence-review-r1, head 72ac955)

**Verdict:** the code implements the adopted r1 policy, and I found no material blocker or new safety gap. The standalone evidence supports a bounded, local, browser-side closure of BI1. That is conditional on you verifying the fresh 27-entry gate on exactly 72ac955, the full criteria and physical cleanup. Nothing here claims a driver crash, kernel timing, global mathematical proof, hot native replacement or history serialisation.

## Source check against the amendments
- **Native controller** (`native-controller.mjs`):
  - On exit it sets `didExit` and creates a typed `preparer-lost` error. All pending work and the reset waiter are rejected (lines 21–26).
  - `run` and `reset` throw at once after exit (lines 51 and 60), so there is no write to a dead pipe and no 120 s hang.
  - `close` is memoised, idempotent and bounded, and skips the stop message after exit (lines 66–77).
- **Native adapter:** an unplanned `worker-exit` sets `terminal`; a deliberate stop does not (line 49).
- **Application server:**
  - **Terminal adapter state.** `healthy()` refuses with typed 503 `preparer-lost` or `preparer-unavailable` (lines 41–47). Failed initialisation is sticky and truthful, and is cleaned up first; unconfirmed cleanup becomes `cleanup-failed` (lines 34–38).
  - **Status** never initialises an adapter (lines 56–58).
  - **Client binding.** Open binds `client.adapter` (line 68) and rechecks health after every await (line 71).
  - **Late completion fenced.** Heartbeat, prepare and buffer all check health. A `prepare` that completes after the terminal event retires its token and throws (lines 114–116).
  - **Cleanup still works.** Retire, cancel and `onClose` use the client's own adapter and skip the health check (lines 23–24 and 89–104).
  - A native crash is reported as preparer loss, not as lease expiry.
- **Renderer** (`prepared-regions.js`):
  - Each device gets an epoch.
  - An uncaptured error is reported as `gpu-error`, separately from `device-lost` (lines 31–32).
  - Upload, render, `done` and resize are refused once the device is lost.
  - `retire` suppresses a queue-completion rejection only when the device is known lost (line 62).
  - `dispose` retires every region and aggregates genuine errors, which stay sticky (lines 127–132).
- **Browser preparer:**
  - `fail()` (lines 19–24) handles worker error, message error, job error, the startup and indexing deadlines, and a post-message exception. It is terminal even when idle: it rejects all pending jobs, terminates the worker and calls `onFailure` once.
  - After the build, physics restore and upload awaits, the state is checked again (lines 55, 59 and 71).
- **Workspace** (lines 20–56):
  - **Automatic attempt:** only `device-lost` on an active, presented state with `automaticRecoveries < 1` triggers one.
  - **Before any rebuild:** it clears input, settles the gesture and deactivates first.
  - **Rebuild path:** the restart is requested immediately through `onRestoreRequested`, which calls `space.restart`.
  - **Everything else stops:** GPU errors, worker failures, `preparer-*` codes and failures before presentation (`!active`) all stop explicitly; for `preparer-*` codes, `restartRequired` hides Retry.
  - **Allowance reset:** only `retry()` resets it.
  - **Session loss:** loss carrying a preparer code is routed to `interrupt`, not to expiry.
  - **Failed startup:** `check()` raises `state.failure`, so a failure during startup goes through the existing fallback and keeps the requested scene.

## Workspace unit controls (names checked, bodies not read)
Their names cover:
- first loss with exact place and history;
- repeated loss and Retry resetting the allowance;
- leaving during recovery;
- a new file superseding the recovery;
- GPU error, worker failure and native loss not consuming the automatic attempt;
- failed automatic startup;
- loss during a restore;
- an occupied body never being clamped;
- unconfirmed cleanup blocking recovery.

The preparer and renderer units cover idle error, message error, the indexing and startup deadlines, late upload, both outcomes of known-loss retirement, unrelated retirement errors and post-message exceptions. The controller units cover fast rejection after exit, typed outstanding rejection and idempotent close.

## Evidence check (`summary.json`)
- **Run:** 8/8 checks, 19.146 s of interaction and 45.459 s overall, with no page errors.
- **Publications retired:** 8/8 in the interruption phase and 2/2 after restart. Physical closure shows all 29 PIDs absent, ports closed and the lock free.
- **Device destroy:** the scene hash `8e8c834853c8f30b`, pose and history are identical before and after. Device epoch went 1 → 2 and worker 1 → 2, with one automatic recovery and no navigation between failure and presentation.
- **Repeated loss:** stopped through the 1000 ms observation with no execution. Retry took 2745 ms, giving epoch 3 and worker 3 with the allowance reset to 0.
- **Worker error:** retry took 2681 ms, giving epoch 4 and worker 4 at the same place and history.
- **Native kill:**
  - PID 1840479 was killed at …214785 with one active queue job, `5068da35…:3`; the browser stopped at …215001, 216 ms after the kill.
  - The file saved while stopped matches `nativeBefore` (`positionLocalM` y = 0.010359…).
  - After restart the producer is new (`95272d60…` versus `1a9e4d54…`), the re-export is byte-identical, and the fresh page's history shows one undo and two camera entries.
- **Geometry audits:** pass. The single-sample forward-reference limit on specimen `4b2f` is carried forward.

## The five images
- **`device-recovered.png`:** terrain with Back enabled.
- **`device-stopped.png`:** "GPU device lost: Device was destroyed." with Retry and "Save requested Landscape scene".
- **`worker-stopped.png`:** "collision preparation stopped. Retry…" with Retry.
- **`native-stopped.png`:** "Native preparation stopped. Save your scene and restart ATLAS." with no Retry button, which is correct.
- **`restart-return.png`:** terrain with Undo enabled and "Landscape scene saved."

The duplicated status line in these images is cosmetic and pre-existing.

## Minor notes for the report (not blockers)
1. **Possible race in known-loss retirement.**
   - `lost` is set inside the `device.lost` callback.
   - A retirement already in flight could, in principle, see `onSubmittedWorkDone` reject before that callback runs, and then raise a sticky error.
   - Recovery-driven retirement starts after `interrupt`, so the tested path is safe. Concurrent eviction during loss is unverified.
2. **Back and Forward while stopped** start a normal restore activation without resetting the allowance. That is acceptable, since it is still an explicit user action; say so in the report.
3. **Any worker job error is now terminal.** That is conservative and consistent with the amendment.
4. **Test hooks:** `testAdapter.destroyDevice` and `crash` exist on production objects. I did not verify that a visitor cannot reach them.
5. **Carried limits:** standing performance and readiness misses, unverified 1 GiB attribution, the roll reset on first drag, restore and recovery latencies (about 2.7 s to retry), deliberate destroy rather than a driver loss, and native restart requiring a launcher restart (production service policy left to RB1).

## Scope
**Read in full:** `owner-report.md`, the card amendment and `source-manifest.json`.

**Partial reads and greps:**
- `summary.json`: lines 1–1654 plus a grep
- `native-controller.mjs`: lines 14–79
- `application-server.mjs`: lines 18–146 by grep and lines 29–128
- `native-adapter.mjs`: lines 43–57 plus a grep
- `workspace.js`: lines 20–59 plus a grep
- `prepared-regions.js` and `browser-preparer.js`: greps
- the four unit test files: grep of test names only

**Not read:**
- `application-client.js`, `collision-worker.js`, `mode-host.js`, `app.js`, `native-queue.mjs`;
- `bi1c-http.mjs`, whose check names my grep did not find;
- the bodies of the unit tests;
- the recovery suite, raw ledgers and preflight JSON;
- the rest of `summary.json`.

**Images viewed:** all five PNGs.

I executed nothing and edited nothing.
