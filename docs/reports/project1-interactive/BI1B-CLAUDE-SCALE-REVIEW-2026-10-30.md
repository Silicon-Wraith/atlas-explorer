# BI1.B scale activation failure (scale-failure-review-r0, head 07775ed)

**Verdict:** I confirm the owner's diagnosis, with one attribution correction. This is a pre-existing defect in the workspace's scale-intent handling that BI1.B exposed, not one it introduced. The failed gate cannot be waived.

A narrow, workspace-owned repair is proportional and justified. My recommended form is below, with two small changes to the card: lock the runtime source, and add an honest-status check.

## What the trace shows (observed)
All event lines are from `failure.json`.
- **Wheel at …981923.5.** Request 16 (`kind:fine`) and `scale-deferred` (`preparation`, `smaller:true`) occur at the same timestamp. At …981926.1, request 16 settles `unsupported`: "Native queue capacity; retry after deferral".
- **Request 17 and a second `scale-deferred` at …981926.3** (lines 2385–2403). Request 17 also settles as capacity-refused at …981928.
- **Request 18 at …981942.9**, also capacity-refused. Coarse prediction requests 14 and 15 are then cancelled at about …981946.7 as "obsolete prediction".
- **Request 19 (fine) at …982042.9** becomes `ready` at …983529.5. That is 1.606 s after the wheel, or 1.487 s after request 19 started.
- **No `scale` event** appears before teardown at about …992052. The test failed after `waitForFunction` timed out (10 s) at `tests/space-prepared.mjs:58`, waiting for the body diameter to become D/4. Browser errors are empty and cleanup is true.

## Source mechanism (verified)
- **`runtime.scale(true)`** (`runtime.js:121–132`): when the fine region is not resident, it calls `requestFine()`, emits `scale-deferred`, and returns false (line 126).
- **`requestFine`** (line 133) sets `fineWanted = true`, then requests coarse and fine.
- **`request()`** (lines 39–69): an `unsupported` result whose reason mentions capacity is deliberately not fatal (line 65), and `done` resolves null.
- **Workspace `scale`** (`workspace.js:127–131` in 2f706dd):
  1. It awaits `runtime.requestFine()`. That returns the pending request 16's `done`, which resolves null at …926.1.
  2. It then calls `runtime.scale(true)` once more. That produces request 17 and the second `scale-deferred`, returns false, and shows the status "Move into the prepared detail area to change scale."
  3. Nothing retains the intent after that.
- **Correction to the owner's attribution:** request 17 came from the workspace's post-await retry, not from prediction. Request 18 and the later request 19 came from `predict` (line 98), which keeps requesting fine because `fineWanted` stayed true. So the fine region did become ready, but nobody tried the scale again.
- **The capacity refusal itself** matches the existing design: one non-preemptive native job plus two queued (`native-queue.mjs:26`). Prediction requests and cancelled but still-running native work can fill it. Which three jobs occupied the queue at …981923 is my inference; the server-side lines (about 3363–3425) are consistent with it, but I did not decode them.

## Caused or exposed? Exposed (inference supported by hashes)
- `runtime.js` (81d711…), `native-queue.mjs` (293b8d…) and `native-adapter.mjs` (a69104…) are byte-identical to the merged PC4 versions I reviewed.
- The workspace's asynchronous scale branch has the same logic as PC4's (PC4 `workspace.js` lines 56–58): one `await requestFine()`, one retry, then the intent is dropped. BI1.B added only history settlement around it.
- The same route passed earlier gates. The difference is timing: the wheel happened to arrive while prediction had filled the native queue.
- A second defect, also pre-existing: the status text is false. After a capacity refusal it says "Move into the prepared detail area", but the visitor was already in the detail area.

## Recommended correction: hold the intent in the workspace, apply it from the frame loop
Prefer this over changing `runtime.requestFine`:
- It keeps `runtime.js` byte-identical, so PC2–PC4 runtime evidence still applies.
- It needs no timer inside the runtime.
- The session, input, restore and leave fences all already live in the workspace.

**Sketch:**
1. On a deferred smaller-scale gesture, store `scaleIntent = { state, sequence: mine, deadline: frameTime + bound }` and show "Preparing smaller formations…".
2. In `frame()`, only when the frame is permitted, eligible, the intent's state is current and its sequence equals `scaleSequence`, read `runtime.snapshot().resident`.
   - Call `runtime.scale(true)` only once both `fine` and `0,0,0` are resident. One attempt; never call it per frame while fine is absent, because each call issues a new fine request.
   - On success: `storePose` and settle navigation, giving one camera entry.
   - On refusal (clearance, or not covering): clear the intent and show an honest message.
3. **Clear the intent on:**
   - a reverse gesture (it already increments `scaleSequence`) and `deactivate` (leave, restore, session loss);
   - `clearInput`, which already runs whenever the frame is not permitted or not eligible;
   - deadline expiry, with the status "Smaller formations are not ready yet; try again."
4. **Fix the capacity-refusal status:** it should say preparation is still in progress, not "move into the detail area".
5. **Keep unchanged:** no queue or quota change, no change to movement or a direct scale setter, no runtime change, no new mathematics or mesh.

**Known limit to record:** after a reverse gesture the runtime keeps `fineWanted` true (there is no cancel API). The cost is extra protected preparation, not a safety problem.

## Deterministic proof without native work
Use workspace unit tests with the real runtime and a fake producer in which the first fine result is `unsupported` with a capacity reason. The second, prediction-driven fine request resolves through a deferred promise. Drive frames with the fake animation-frame scheduler.

Assert:
- exactly one `scale` event and a final body of D/4 after the fine region becomes ready;
- the number of fine requests is bounded: no per-frame requests from intent handling;
- **each of these before readiness produces no scale, the stated status and released resources:**
  - a reverse wheel
  - deactivate or leave
  - a superseding restore
  - session loss
  - deadline expiry
- a clearance refusal after readiness produces no pose change;
- the status text is correct in each case;
- one camera-history entry after a successful deferred scale.

## Is the card proportional? Yes, with two additions
- **The bound fits:** 45 minutes of source and unit work, then one headed `space-prepared` route, then one 40-minute gate with no rerun allowance. It is an actual product defect: a user's scale gesture is lost and the status is false.
- **Addition 1:** lock `runtime.js`, `native-queue.mjs` and `native-adapter.mjs` to their current hashes.
- **Addition 2:** add the status-text checks above.

The headed route may not reproduce the capacity race. It shows absence of regression only; the unit test is what proves the fix. Say this explicitly. The existing file and history evidence still applies to the unchanged code paths.

## Scope
**Read in full:**
- `owner-position.md`
- `source-manifest.json`
- `runtime.js`
- `native-queue.mjs`

**Partial reads:**
- `failure.json`: lines 1–1601, plus a grep of type, requestId, state, reason and time fields
- `tests/space-prepared.mjs`: lines 40–69

**Relied on from earlier reviews of the same hashes:** `workspace.js` (2f706dd) and PC4's `workspace.js`.

**Not read:** `native-adapter.mjs` (hash only), the unit tests (`prepared-runtime`, `prepared-workspace`), the gate follow-up report and `failure.json` beyond line 1601 except via grep.

I executed nothing and edited nothing.
