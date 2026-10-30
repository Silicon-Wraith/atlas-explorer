# BI1.C card challenge (card-review-r0, head 6ae51a6, base 57ba3b9)

**Verdict:** ready to implement, with precise amendments. I found no fatal flaw. The browser-side policy is the right size: the workspace owns recovery, one automatic attempt is allowed only for a device loss on an already active viewport, and everything else requires explicit Retry. The native-replacement part is the largest and riskiest piece, and there is a simpler alternative below.

If every criterion passes, a scoped, finite local BI1 closure would be supported. The performance misses, unverified 1 GiB region memory, roll limit and production-backend question stay open.

## The alleged gaps, checked against source (all confirmed)
- **Renderer** (`prepared-regions.js`):
  - Both an uncaptured GPU error (line 30) and device loss (line 31) go to the same string `onError`. The workspace handles both by deactivating.
  - `retire` (lines 56–59) awaits `onSubmittedWorkDone` inside try/finally. If that promise rejects, the buffers are still destroyed but the error propagates.
  - `dispose` (line 124) awaits each retire in sequence, so the first rejection aborts the loop.
  - The resulting lease error becomes the lifecycle's `cleanupErrors`, then a `drain` throw, then a sticky workspace `cleanupError`, which blocks every later activation. So known-loss retirement is a prerequisite for any rebuild.
  - Whether Chrome actually rejects `onSubmittedWorkDone` after loss is not established. The code must tolerate either outcome.
- **Browser preparer** (`browser-preparer.js`):
  - `onerror` (line 23) rejects pending jobs but sets no closed or terminal state and notifies no one, so an error while idle is invisible.
  - There is no `messageerror` handler.
  - The 20 s indexing deadline (line 31) rejects the job but leaves it in `pending`.
  - Late results after asynchronous physics initialisation or upload are already disposed by the lifecycle's `!current()` path (`lifecycle.js`, lines 68–73). The extra consumer checks are defence in depth, not a gap fix.
- **Native controller** (`native-controller.mjs`): `run` (lines 48–55) checks only `closed` and `pending.size`. After the process exits, it writes to a dead stdin, whose error is only logged (line 27), and then waits the full 120 s deadline.
- **Server:** `initialize` is memoised (`initialization ??=`), as I saw in the earlier review of the same hash (b6ff65). A rejected start or an adapter whose process has exited is therefore permanent.
  - After native loss, Retry Landscape reopens successfully using the cached hello data, and then every `prepare` fails again.
- **Output paths:** the adapter writes to `runRoot/native` (`native-adapter.mjs`, line 46), and the 4 GiB quota `totalOutputBytes` is kept per adapter (lines 62–65). A second adapter would overwrite job files and reset the quota. Unique attempt roots and a global quota are justified.

## Material amendments
1. **Separate uncaptured GPU errors from device loss.**
   - The design says they are reported separately but gives no policy for uncaptured errors.
   - Specify: an uncaptured validation or out-of-memory error stops Landscape terminally with explicit Retry and no automatic attempt.
   - Only `device.lost`, while the renderer is not disposing, consumes the automatic allowance.
   - Use a typed code. Do not branch on the loss `reason`, because the diagnostic `device.destroy()` produces `reason: 'destroyed'`. Label that evidence as a deliberate destroy, not a driver-level loss.
2. **Known-loss retirement must continue past rejections.**
   - Once the renderer has observed loss for its device, `retire` destroys the buffers and suppresses a rejection from `onSubmittedWorkDone`. `dispose` retires every region even if one fails.
   - A retirement failure on a device that is not lost must stay sticky.
   - Unit-test both outcomes of `onSubmittedWorkDone` (resolve and reject).
3. **Bind the adapter to the client when it opens.** Store `client.adapter` at open. `prepare`, `buffer`, `retire`, `cancel` and `onClose` then always use their own client's adapter.
   - This replaces per-request capture and is enough for fencing: PC4 allows only one current client, and a new open cannot succeed until the old client is closed or expired.
   - Tombstone cleanup then reaches the old adapter's publications, never the new one's.
4. **Do not retire the client as "expired" on native loss.** Simpler and more truthful:
   - Mark the adapter generation dead.
   - Have `prepare` and `buffer` return a typed `preparer-lost` 503 with a truthful message. The browser treats it as a terminal preparer stop.
   - Leave the lease alone. Explicit Retry closes the old client normally, then opens, which constructs the replacement only after the old controller's close is confirmed.
   - If you do keep forced retirement, the heartbeat must carry the typed reason, so the visitor does not see PC4's "session expired" text for a native crash.
5. **The controller must fail fast after exit.** Set an `exited` flag in the close handler and have `run` and `reset` throw immediately once it is set. Unit-test this without spawning a process (inject a fake child process).
6. **Status reads and the construction cap.**
   - Reading status must never construct or retry an adapter.
   - The 16-construction cap must count failed initialisations as well.
   - The global 4 GiB quota is passed into each adapter as its remaining allowance.
7. **Evidence layout feasibility.**
   - The existing audit scripts (`pc2-qualification-input`, `qualify`, `buffer-audit`, `audit`) read the current layout. Either keep attempt 1 at `native/` and use `native-2…` for later attempts, or make the audit input enumerate attempt directories.
   - Either way, rehearse the audits on derived copies before hardware. This is the same class of risk as BI1.B's missing mode field and root guard.
   - Apply the trailing-slash `atlas-bi1c/` root guard to every affected script, including `pc4-http.mjs` and the application route suites.
8. **Native-kill fixture determinism.**
   - Immediately before SIGKILL, read the server snapshot and record that the queue has one active job and which request identity it holds.
   - A fine request takes about 1.1 s, so polling every 10 ms is adequate.
   - If the job completes before the kill, report it as a kill while idle; do not count it as "while a request is outstanding".
9. **Wiring the automatic attempt.** Reuse the existing app callback, which calls `space.restart('landscape')` when Space is current and otherwise returns inactive. Do not add a new deferred path.
   - The host's activation deadline applies to the rebuild.
   - Loss during the automatic rebuild's startup counts as a failed rebuild and stops.
   - Leaving during recovery returns `superseded`. A later re-entry is an ordinary activation, and the allowance stays consumed until explicit Retry.
   - These semantics match the viewer's existing `recovery.js` policy (one automatic recovery, `retry()` resets it); align the wording with that.

## Simpler alternative for the native part
Native loss could be a typed sticky stop with the message "Restart ATLAS". That keeps the fail-fast controller fix and the terminal adapter state, but drops replacement within the launcher.
- **Removed:** the lifecycle owner, unique roots, the 16-construction cap, the cross-attempt quota and part of the HTTP replay.
- **Cost:** losing "replace the helper without restarting the launcher".
- **Effect on closure:** none for the browser-side BI1 closure.

If replacement is kept, amendments 3–7 make it sound. Choosing between the two is an owner/advisor scope decision. Within the 3-hour CPU bound, the narrower path carries noticeably less risk.

## Proportionality
- **CPU tests:** exact barriers with fake devices, workers and adapters and the real workspace and runtime are the right proof for ordering.
- **Native-free HTTP replay:** proportionate for adapter binding and the held old completion.
- **Headed fixtures:** one route covering deliberate device destroy, a second destroy, a worker error and a suite-owned native kill is feasible within 240 s of interaction and 420 s overall.
  - An uncaught exception in a module worker does reach `Worker.onerror`.
  - A fresh adapter and device can be requested after `destroy`.
- **Time:** the final gate grows by about 7 minutes. Previous gates took about 32 minutes, so 45 minutes is adequate. The 1 h hardware budget, including that gate, is tight; record any overrun honestly.

## Scope
**Read in full:**
- **Owner documents:** `owner-position.md`, the BI1.C design, plan and card, and `source-manifest.json`.
- **Source:** `browser-preparer.js` and `native-controller.mjs`.

**Partial reads:**
- `native-adapter.mjs`: lines 40–119
- `prepared-regions.js`: grep for device lost, retirement and dispose
- `recovery.js`: grep for the recovery policy

**Relied on from earlier reviews of the same hashes:** `application-server.mjs` (b6ff65), `workspace.js` (fb8870), `lifecycle.js`, `mode-host.js` and `runtime.js`.

**Not read:** `collision-worker.js`, the upstream BI1 and Project1 specs, `workspace-switcher.js`, `app.js` (same hash as before), the tests and `AGENTS.md`. No images were supplied.

I executed nothing and edited nothing.
