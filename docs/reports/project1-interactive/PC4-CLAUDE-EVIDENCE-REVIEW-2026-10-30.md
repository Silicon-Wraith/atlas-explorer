# PC4 / BI1.A2 independent evidence review (evidence-review-r1)

**Verdict:** the partial findings are supported. PC4 acceptance stays open and the failed session suite is not passed.
- **Diagnostic failure:** the aggregate cleanup-error failure is a fixture contradiction, not a product defect. I can trace it deterministically through the source, so it is not left uncertain.
- **Product source:** I found no implementation blocker for this slice.
- **Before acceptance:** one test-only correction is needed, then a native-free rehearsal, one corrected session suite run and one complete final gate.

## Is the aggregate assertion failure a fixture contradiction? Yes
The path, from source and ledger:
1. `lossProxy.block(aId)` runs before the wheel input (test line 76).
2. Page A's next heartbeat, at about …028980, gets the proxy's 503. `application-client.js:47` treats any non-ok renewal as authoritative and calls `lose()`. The browser records `session-lost` at …028983.
3. The workspace's `sessionLost` deactivates and then releases. The release:
   - retires three tokens through the proxy, each refused with 503, and `browser-producer.js:14` counts each as a remote failure;
   - aborts the held fine fetch, whose `/cancel` is refused (line 51 counts it);
   - surfaces `drain` (lifecycle.js:96) as "preparation resource release failed";
   - attempts `close`, which gets a 503. Because a response was received, deferral is not allowed and it throws.
4. That produces `cleanup-error` at …028996.8, with exactly the message in the ledger.
5. The suppression counts (heartbeat 1, cancel 1, retire 3, close 1) match A's three delivered tokens, its one in-flight request and its final close.
6. Line 113 then forbids any cleanup-error across `savedA` plus B, so the suite was certain to fail.

This is the correct product behaviour: the client refuses to claim a release it could not confirm.

**Classification correction.** Switching to a transport drop alone does not fix the contradiction if A is still alive when it tries to clean up. A dropped `retire` still increments `remoteRetirementFailures`. It works only because, with a drop rather than a 503, A goes to "checking" rather than "lost". A's permit lasts about 30 s and its page closes about 1 s later, so A never starts cleanup before teardown.

**Scenario label.** With the 503, A was not lost silently on the browser side. It knew it had lost the session and stopped before the held result even existed (fine prepared at …029402, after the cleanup error at …028996). The server-side silence, and so the expiry causality, is unaffected. The scenario name overstates the browser side.

## Facts verified against the ledger and source
- **Held-token causality:** token `6a62a329` (request :6) was prepared at …029402. It retired at …054693, between `client-retiring(expired)` and `client-expired`. There is no `client-closed` for A.
  - The server put the token in A's set because `route.fetch` consumed the response. "Held before delivery" therefore holds only on the browser side.
  - `delivery:"fulfilled"` came about 35 s after A's page had closed. It is not evidence that the old client consumed the response; I agree with that caveat.
- **Expiry timings:**
  - A: 023977 → 054693 = 30.716 s.
  - B: 064815 → 094835 = 30.020 s. B's client lost its permit at …094824.4, 10.6 ms before the server expired it, so the conservative permit is observed working.
- **Late old-client messages:**
  - A retire of a token it never owned → 410 via the tombstone, without an `http-error` because nothing is thrown (server lines 74–76).
  - A heartbeat with sequence 999 → 410, logged at …057648.
  - Publications and owner unchanged.
- **Input fencing:**
  - `frame` gates motion, prediction and drawing on `client.check()`; `scale` and `orient` check it too.
  - Lines 100–101 assert no pose, navigation or request change while unverified, and they passed because the failure was at line 113.
  - `queriesDuringPause:0` and `poseRetained:true` are literal values. They are justified only by those assertions passing.
- **Exact retained pose:** asserted by deep equality after expiry (line 103) and after retry (line 107). The retry pose goes through `poseModel.validate(retained)`.
- **Publications:** 8 prepared, 8 retired, enumerated from the ledger: A 4, B's first session 2, B's final session 2. The main route's 17/17 is from the summary only.
- **Deferred empty close:**
  - B's `retire` calls reached the server at …094835 and triggered the per-operation expiry. The server shows `client-expired tokens:2`, after which the retires were acknowledged as `alreadyRetired`.
  - The close was then aborted ("Failed to fetch") and deferred. Deferral requires lost session, no errors, zero remote failures, expired, and no response received (workspace lines 77–78, client line 129).
  - For this run, the ledger shows nothing was left. In general the claim holds only if every retire was acknowledged. The deferred close is never re-sent, which is acceptable.
- **Presentation timing:**
  - The recorded 9.714 s is the time the held task completed (≈ 029405 + 35000 → 064407, minus expiry at 054693). It is not a presentation measurement.
  - The real criterion is line 87, `ready(b)` within 15 s of expiry, which passed. B's view was prepared at …057507, about 2.8 s after expiry.
  - Record the timestamp at line 87 and rename the field.
- **Healthy owner:** 13 renewals including setup sequence 1; 12 fall inside the 60 s window. Reported accurately.
- **Pair fencing and status privacy (my earlier card finding):** resolved.
  - Status returns only state, remaining time and closed-client count.
  - Close, renew, retire and cancel all require the runtime ID and nonce; a nonce mismatch gives 409, an ended session 410.
  - Renewal sequences must strictly increase.
  - Expiry is checked on every operation as well as by the 1 s sweep.
  - A prepare whose session expires while it runs retires its output (server lines 98–102).
- **Tombstones:** each tombstone copies the live token set at close (retired tokens are already removed). That set is bounded by live publications at close, not by historical token IDs; tombstones are capped at 1,024. The report's wording is correct.
- **Gate:** 23/24 entries passed on 0ddff25; `space-preparation-session` failed at its line-84 causal assertion. The source digests recorded by the diagnostic equal the packet manifest's for the pinned application and test files.
- **First fixture (gate r1):** the diagnosis is consistent with the assertion message and with A's own produce path, which sends `/cancel` on abort. I cannot independently verify it, because the r1 server events are not in the packet.

## Minor source notes (not blockers)
1. `application-policy.mjs` `finish()`: if `onClose` throws, `healthy()` throws before the tombstone is written and before `current` is cleared. The state stays stuck in a closed-current, cleanup-failed condition, and the expiry event is not emitted. That is safe and sticky (503), but confirm a unit test covers it.
2. Any non-ok heartbeat, including generic 503s such as a malformed request, ends the session immediately. That is conservative and acceptable for a local same-origin server.
3. **Launcher:** the page-lifetime owner correctly tracks pages only within its own context and is idempotent, with dispose in `finally`. Windows opened in the default context (for example with Ctrl+N) are not owned; that limit should be stated. The headed check did not run.

## Performance and geometry (from the preserved summary)
- **Frame rate:** 49.94 FPS (49.88 during preparation) against a 30 FPS target: pass. The p50 frame time of 20 ms suggests a 50 Hz cadence; that is descriptive only.
- **Navigation:** p99 4.30 ms against 2 ms is a miss; the maximum of 5.30 ms against 8 ms passes.
- **Readiness:** interaction readiness has a median of 0.877 s and a maximum of 2.159 s, so the maximum misses. View readiness (median 1.719 s, max 1.728 s, n=2) also exceeds 1 s if the same target applies. The report should name it explicitly rather than "some readiness".
- **Waiting:** 1.080 s, 6.29% of active intervals.
- **Sparse specimen:** specimen `4b2f1f5b` has a single reference sample, so its reference-to-mesh direction is essentially unchecked. Only the mesh-side direction has 512 samples. Its limit is stated; it should not count as surface-fidelity evidence.
- No 1 GiB memory claim, no real OS sleep or renderer crash claim, and no new frame-tail gate.

## The four images
- **Second-tab refusal:** shows the "another tab" message and Retry, with the Fractal viewer selected. Consistent.
- **Expired page:**
  - Inert and blank with a Retry button. The blank is consistent with `drawImage` of a WebGPU canvas after presentation.
  - The expiry message appears twice (two status elements). This is cosmetic and not a gate.
- **Retried page:** terrain at scale 1. The exact pose comes from the assertion; it cannot be confirmed visually.
- **Fine inspection:** scale 0.25 on the main route.

## Smallest next action (test only; no application change)
1. In `session-loss-proxy`, simulate transport loss for A by holding or destroying the socket instead of answering 503. A then stays "checking" until its page closes, which matches "silent loss".
2. Scope the error assertion per page:
   - The B and replacement-owner sessions stay strict: no runtime, device or cleanup errors.
   - A must have no error before the fault time. Any A cleanup-error must postdate the block and match the proxy's suppression counts.
3. Record presentation time at line 87.
4. Rehearse the proxy behaviour without native work, then make one corrected session run and one complete final gate. That run will also cover the launcher check and the finite audits that never ran.

No further review round is needed unless that run fails.

## Scope
**Read this session (frozen packet):**
- Documents and evidence: `source-manifest.json`, the PC4 scorecard, evidence-summary, product-gate and session-ledger JSON, and the fixture-replacement note.
- Tests: `tests/space-preparation-session.mjs`, `tests/support/session-loss-proxy.mjs`.
- Source: `application-policy.mjs`, `application-server.mjs`, `application-client.js`, `workspace.js`, `browser-producer.js`, `page-lifetime.mjs`, `world-preview.mjs`, and lines 60–109 of `lifecycle.js`, plus a grep across `src/space/preparation`.
- All four PNGs.

**Not read:** `runtime.js` and `contract.js`, the native adapter, queue, worker and publications modules, the unit tests, `pc4-http.mjs`, the card amendment, the preflight note, `app.js`, `index.html`, `mode-host.js`, the gate r1 raw run, and the raw scratch reports.

I executed nothing and edited nothing.
