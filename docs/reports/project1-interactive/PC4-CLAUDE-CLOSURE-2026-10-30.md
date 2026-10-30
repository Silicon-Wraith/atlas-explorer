# PC4 / BI1.A2 closure confirmation (closure-review-r0)

**Verdict:** my final conditions are met, and bounded A2 closure is supported. I found no material blocker. The one factual correction below is the owner's own, and I accept it.

## The prescribed corrections are present in the test source
- **Socket drop instead of 503:** the proxy now calls `response.destroy()` for blocked requests. It records each fault with its time and operation, and records when the block started.
- **Per-page error checks (test lines 114–118):**
  - The living and replacement owners must have no runtime, device or cleanup errors.
  - The lost owner may have only cleanup-errors after the fault time. That condition is fairly permissive, but here it was not needed.
- **Presentation time:** `replacementPresentedAt` is recorded right after `ready(b)` (line 88). The held task's completion is a separate field, `heldResponseSettledAfterExpiryMs`.
- **Test digests:** the ledger's digests for the test and proxy match the closure manifest.
- **Application source is byte-identical:** the eight application source digests in the ledger match the r1 manifest (application-policy, application-server, world-preview, page-lifetime, application-client, workspace, app.js, index.html).

## The final causal ledger checks out
- **Lost owner A:**
  - Last renewal was at …307430 (sequence 13); the fault began at …311677.
  - Two heartbeats were dropped 1 ms apart, at …312436 and …312437. This is probably the browser retrying the POST once after the reset; it is harmless, since neither reached the server.
  - The teardown `/cancel` at …313286 was dropped. That is the exact leak that broke gate-r1, now suppressed at a boundary that survives page teardown.
  - A sent no close or retire calls, and A has no errors (`lostOwner: []`).
- **Held token:** `d549761c` (request :6) was prepared at …312850. It retired at …338160, between `client-retiring(expired)` and `client-expired`. Expiry came 30.730 s after the last renewal, under the 32 s limit, and there was no `client-closed` for A. The `delivery:"fulfilled"` field still does not show the old client received the response.
- **Replacement:** session `58beee74` opened at …338281. The recorded presentation time is 2.895 s after expiry, under 15 s. The old client's heartbeat got a 410 at …341080.
- **Living page:** last renewal at …348307, server expiry at …378326, so 30.019 s. Both tokens retired at expiry. The retry at the exact retained pose is supported by the assertions at lines 104 and 108, which passed. The whole loss and retry took 32.898 s, under 50 s.
- **Final session `ca0f7b88`:** two tokens prepared and explicitly retired at …381310, then closed with zero tokens left.
- **Session publications:** 8 prepared, 8 retired (4 + 2 + 2).
- **Launcher:** cleanup true, no cleanup errors, all nine owned process IDs gone. The page-lifetime assertions sit inside the suite that passed.

## Gate and closure records
- The gate on f108ec5 ran from 16:08:14.804 to 16:39:56.296. All 24 of 24 entries passed, including `space-preparation-session` and `cleanup`.
- The closure check shows cleanup true, no surviving processes, ports 5190/5196/5198/5199/5200/46817 closed, and the GPU lock free.

## Summary figures match the report
- **Main route:**
  - 49.970 FPS overall and 49.877 FPS during preparation, against a 30 FPS target.
  - Navigation p99 is 4.100 ms, which misses the 2 ms target; the maximum of 4.700 ms passes the 8 ms limit.
  - Interaction readiness (n=9): median 0.871 s, maximum 2.307 s.
  - View readiness (n=2): 1.683 s and 1.761 s.
  - Waiting 1.140 s, 6.62% of active intervals.
- **Resources:** peak GPU 32,426,144 bytes; RSS 2,983 MiB, which includes browser and interpreter overhead; 18 tokens prepared and 18 retired.
- **Qualification:** nine application specimens and four session specimens pass. The specimen with a single reference sample is flagged in both sets.
- The report's limits and its "miss" wording are accurate. I did not inspect the per-trial records for the three scene-performance groups; I rely on the gate entries passing.

## Factual correction (accepted)
My earlier statement that retired tokens are already removed from the tombstone copy was incomplete. In `application-server.mjs`, `/cancel` calls `adapter.cancelRequest` without deleting anything from `client.tokens`, so the tombstone can hold historical token IDs. The request capacity of 4,096 per client bounds them; there is no bound of 16 or fewer. The owner's wording is correct.

As a result, expiry or close can retire an already-retired token a second time. This run shows no cleanup failure from that. I did not re-read `publications.mjs` to confirm the second retire is idempotent. It is not a blocker.

## Scope
**Read in `closure-review-r0`:**
- `source-manifest.json`
- `PC4-FINAL-ACCEPTANCE-2026-10-30.md`
- `PC4-final-product-gate-2026-10-30.json`
- `PC4-final-closure-2026-10-30.json`
- `PC4-final-session-ledger-2026-10-30.json`: lines 1–60 and 785–891 in full, plus an extract of the server events
- `PC4-final-evidence-summary-2026-10-30.json`: grep extract of key fields only
- `tests/space-preparation-session.mjs` and `tests/support/session-loss-proxy.mjs`

**Not read:**
- the final verification card
- the peer-review copy
- the rehearsal and session-r3 artifacts
- the performance scorer and per-trial records
- raw application-server ledgers
- unit tests
- `publications.mjs`
- any new screenshots

The four images from my previous review remain the visual evidence. I executed nothing and edited nothing.
