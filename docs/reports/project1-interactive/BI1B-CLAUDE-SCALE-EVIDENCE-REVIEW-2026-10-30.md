# BI1.B scale-repair review (scale-evidence-review-r0, head 71dc60a)

**Verdict:** the repair implements the correction I recommended, and I found no new safety gap and no material blocker. Acceptance is conditional on the owner confirming the fresh 25/25 gate on exactly 71dc60a, the full final scorecard and physical cleanup. The headed pass shows no regression; it does not show that the capacity race was reproduced. The deterministic unit controls are what prove the fix.

## Source check (`workspace.js`, fb8870…)
- **The intent is held in the workspace, and only the latest one.**
  - `scale()` cancels any earlier intent first (line 147).
  - A deferred smaller request creates one intent tied to the current state, `scaleSequence`, a deadline and a timer (lines 153–155). Its promise is resolved only through `finishScale`, which is idempotent (line 130).
- **No flood of requests.**
  - `advanceScale` (lines 136–145) calls `runtime.scale(true)` only when both `fine` and `0,0,0` are resident and the session check passes.
  - Prediction keeps sole ownership of retries, because `fineWanted` stays set by the initial `runtime.scale` → `requestFine` (`runtime.js:126,133`, unchanged).
- **Current-pose clearance is kept.** The single attempt goes through the existing `runtime.scale`, which checks clearance at the current pose. A refusal ends the intent with the message "Smaller scale needs clear prepared detail coverage at your current position." The intent is never retried and the pose never changes.
- **Cancellation:**
  - Every frame that is not permitted or not eligible calls `clearInput` (line 112), and `clearInput` calls `cancelScale` (line 27). That covers focus loss, a hidden tab and resizing.
  - `advanceScale` also cancels if the state is no longer current, has been cancelled, or `scaleSequence` has moved on. Reverse gestures and `deactivate` both advance it (lines 147–148 and 207).
  - Restore (via `deactivate` and `historyStep → clearInput`), session loss (`sessionLost → clearInput`), save and destroy all cancel as well.
  - Every path resolves the promise with false and clears the timer.
- **Timeout:** the timer and the frame-time deadline both lead to the same idempotent `finishScale`. The message is "Smaller formations are not ready yet; try again."
- **History:** a deferred success calls `storePose` and then settles navigation, immediately for a discrete button and after the quiet period for the wheel. That gives one camera entry.
- **The false status is gone:** "Move into the prepared detail area" no longer appears anywhere in the source.
- **Locked hashes match:** `runtime.js` 81d711…, `native-queue.mjs` 293b8d…, `native-adapter.mjs` a69104….

## Unit controls (`prepared-workspace.test.js`, lines 126–189)
These run the real runtime against a fake producer. The first fine request returns the exact "Native queue capacity; retry after deferral" result; the second is held behind a gate.
- **Normal case:**
  - Across 9 frames there are exactly 2 fine requests, so no flooding. The body is still 1 and the status reads "Preparing smaller formations".
  - After the gate opens, the body becomes 0.25, the promise resolves true, there is one `scale` event, the camera history length is 2 and the undo depth stays 0.
- **Cancellation cases:** reverse, leave, restore, session loss and focus loss each give false, no `scale` event and an unchanged body.
  - Restore ends at its requested pose.
  - Session loss shows the expiry status.
  - Every case releases all payloads, and the old false status never appears.
- **Timeout:** the message is honest, and coverage that arrives late does not change the pose.
- **Occupied body when coverage arrives:** the pose is unchanged and the clearance message is shown.
- **Coverage gap:** these tests use the discrete button path. The wheel's quiet-period path is covered only by the headed route.

## Headed evidence (`summary.json`)
- The route passed in 22.742 s with all 8 checks. The qualification, buffer, flight and external-closure audits are all true.
- There are two `scale` events: down to D/4 at …487208.9 and back up to D at …495191.7, both with zero displacement.
- Rendered frame rate was 50.05 FPS. Navigation p99 was 4.30 ms, still missing the 2 ms target, with a maximum of 4.60 ms.
- The summary does not show whether a capacity deferral happened this time.
- **Fine screenshot:** the status reads "scale 0.25" and no stale message is shown. It is a finite observation of the existing world only.

## Non-blocking note for the report, no change before the gate
`scaleMessage` is sticky: line 117 shows it on every frame until the next scale gesture. A timeout, clearance or "move away before growing" message can therefore persist after the visitor has moved, hiding "Preparing nearby terrain…".
- Before this repair, these messages were overwritten on the next frame, so they were effectively invisible. Persisting them is more honest, but they can go stale.
- Record this as a limit. Clearing the message on the next accepted movement is a candidate change for a later slice; it should not use up this gate.

## Limits to carry forward
- **Roll:** dropped on the first drag, and pitch is clamped to ±1.5.
- **Restore latency:** each restore is a new client, runtime, GPU and collision activation, about 1.9–3.9 s. The helper process persists.
- **Sparse specimen:** the restored coarse entry used specimen `4b2f`, which has a single forward reference sample.
- **Fine preparation after reverse:** the runtime keeps `fineWanted` set after a reverse gesture, so it keeps preparing and protecting fine coverage.
- **Unchanged limits:** the navigation p99 and readiness misses, and the unverified 1 GiB region memory.

## Scope
**Read in full:** the repair card, `source-manifest.json`, `summary.json` and `workspace.js`.

**Partial read:** `prepared-workspace.test.js`, lines 120–189, plus a grep for scale, capacity, focus, restore and deadline.

**Image:** `fine-inspection.png`.

**Not read:**
- the rest of `prepared-workspace.test.js`, including the rig helper bodies;
- `tests/space-prepared.mjs` (hash unchanged);
- the headed ledger and raw audits beyond the summary's booleans;
- the RED run record;
- the gate in progress.

I executed nothing and edited nothing.
