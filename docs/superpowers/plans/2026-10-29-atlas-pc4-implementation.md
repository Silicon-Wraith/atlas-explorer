# PC4 / BI1.A2 — implementation plan

**Status:** Implementation complete; acceptance open after bounded full-gate/diagnostic attempts. See the [full scorecard](../../reports/project1-interactive/PC4-SESSION-RECOVERY-2026-10-30.md). Independent card challenge `20261030T050119Z-fbb429`,2026-10-29. Governing [design](../specs/2026-10-29-atlas-pc4-session-recovery.md), preserved [card](../../reports/project1-interactive/PC4-CARD-2026-10-29.md) and [r1 corrections](../../reports/project1-interactive/PC4-CARD-AMENDMENT-2026-10-29.md). Base `e3f7e293ddc96fb90eccf8decbccc59917639f4a`, branch `feat/pc4`, project `.worktrees/pc4`. Baseline1,279 registered guarded CPU units pass. Implementation started only after challenge and adopted corrections.

## 1. Server lease owner and application transport

Extend `scripts/preparation/application-policy.mjs` with an injected clock and the runtime/nonce lease, bounded tombstones, renewal sequence, expiry and typed outcomes. Keep pure policy independent of native/network execution. Cover exact deadline behavior, competing clients, late renew/close, close-before-open and failed retirement with deferred/fake-clock controls.

Integrate `application-server.mjs`: guarded heartbeat route, periodic expiry plus per-operation checks, lease metadata, scoped idempotent old-session cleanup and explicit structured failure reasons. Add fake-adapter injection at the composition seam for native-free HTTP controls; leave the production default native adapter/policy unchanged. Confirm cancelled output cannot cross the application-session fence and status cannot initialize native work.

## 2. Browser lease and cleanup transport

Extend `src/space/preparation/application-client.js` with a per-opening nonce, injected clocks/timers, sequenced bounded heartbeats, conservative permits, visibility revalidation and lost-session notification. Keep it DOM independent; workspace supplies visibility events. Fence delayed renewal responses and request completion. Add transport headers without changing the PC1 mathematical records. Scoped idempotent cleanup must release local leases even after server expiry; actual failures still propagate. Preserve old experimental producer defaults.

Register focused unit coverage for long delays, timeout/rejection, expired response arrival, stale acknowledgement, stop-before-response, old cleanup while a replacement owns publications, and single notification/timer release. Test invariants through deferred transport rather than mirroring private implementation.

## 3. Workspace recovery and session UI

Update `workspace.js` to check the lease before motion/prediction/scale and before renewed input after visibility return. Close input first, retain pose, release current work and hold an inert frame. Expose persistent session checking/expired/unavailable states. Add a small explicit Retry Landscape action through existing Space mode activation in `src/app.js`/`index.html`; keep Plane/viewer and first-presentation ownership. A failed restore must report its actual reason. No save/history, geometry, movement-controller or general navigation-feedback redesign in this slice.

Use fake-DOM/lease tests for paused input, scale/prediction gating, stale completion, release-before-retry, exact retained pose and sticky cleanup failure. Keep import boundaries and numerical source unchanged.

## 4. Launcher page lifetime

Extract a small page-lifetime owner used by `scripts/world-preview.mjs`. One initial page closing is not whole-context shutdown if another page remains; final-page/browser/terminal shutdown stays idempotent and bounded. Test page-event ordering using fakes and perform one bounded headed launcher check. Preserve Playwright signal ownership repair and existing launch arguments. Scratch is only runtime/dependency/evidence output.

## 5. Frozen native-free and headed controls

Add the native-free HTTP control and a maintained headed session-recovery suite with manifest registration. Run the card's exact healthy-owner/second-tab, silent owner-loss/lost-response, living-page expiry/retry and launcher controls. Production30s/5s timing stays intact; fake-clock units are separate. Record server publications, cancellations, browser input/pose, session state and resource release independently. No debug endpoint or shortened production timeout solely to pass a test.

Run the existing prepared application route on PC4 source for actual flight/contact/performance and finite mathematical qualification; native math remains the control. Preserve all attempts and report every criterion.

## 6. Product verification, peer evidence review and PR

Pin implementation commit, run all units/build and the full maintained gate with exclusive hardware ownership. Set `ATLAS_B15_REPORT_DIR` to a fresh scratch directory before the gate so generated performance reports never overwrite tracked docs; keep cold-cache and prepared-run roots explicit. No new acceptance thresholds or repeat for cleaner numbers.

Write the full scorecard, three evidence tiers, process cost, source/review/clock limits, screenshots and native/browser cleanup. Get the approved independent evidence review; archive the verbatim log at the milestone. Update BI1/roadmap/index/checkpoint without changing sequence. AP1/MD2 are later interleaved workstreams and their finer release plans remain open. Open a focused PC4 PR; advisor merges.

## Bounds and progress

Three hours implementation/CPU plus one hour hardware/evidence/review, excluding permission wait and the initial design/card challenge. One bounded mechanical repair with the original attempt retained; no cleaner-score rerun. Stop the affected candidate for ownership revival, cross-client mutation, motion after lease loss, lost world identity, source/qualification failure or unconfirmed process cleanup. At the bound publish established/partial/unresolved results without claiming A2 complete.

| Stage | State |
|---|---|
| Merged-main source/worktree | Complete; project `.worktrees/pc4`, PR20 base |
| Baseline CPU | Complete;1,279 units,79 files |
| Design/plan/card | Written for independent challenge |
| Peer card review | Complete; explicit PC4 permission received, challenge20261030T050119Z-fbb429 and r1 adopted |
| Implementation | Lease owner/transport/client/workspace retry and page-lifetime implementation complete;1,298 guarded units/80 files, build and native-free HTTP checks pass |
| Frozen controls/product gate | Full gate23/24 entries pass on0ddff25; new session fixture fails. Test-only2d34664 diagnostic establishes individual recoveries but fails aggregate error assertion; launcher/audits after it unrun. Stop recorded; acceptance open |
| Evidence review/report/PR | Full report/evidence preserved; evidence review20261030T160015Z-8e5a4d complete after advisor-requested extension; no inspected implementation blocker. Draft PR21; final verification card open |
