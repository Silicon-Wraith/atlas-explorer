# BI1.C — recover Landscape execution and preserve the place

2026-10-30. Owner Codex; independent challenger Claude. ****Qualified within the adopted r1 bounded local scope; ready for advisor PR review/merge****. Measured source/test head `72ac955e010327a79212ff04352431cc4a52606b`, base merged PR22 `57ba3b9cb0146724fdfc7ced5e991b4bee61b64d`, branch `feat/bi1c`, project worktree `/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/bi1c`. Later changes are documentation/evidence only. The advisor retains merge authority.

An active Landscape viewport now gets one automatic rebuild after a device-loss notification. A repeated loss, failed rebuild or collision-worker error stops interaction with an explicit Retry. Those browser rebuilds keep the requested mathematical world, camera, body/FOV and both histories. A native-helper exit stops with a truthful Save-and-restart reason. The actual downloaded scene returns to the same promised place after an owned browser/helper/server restart and new producer.

This completes the tested, bounded local integration route and unblocks interleaved AP1/MD2 work on appearance, controls, representation quality and broader mathematical discovery. It does not select a release backend or establish a finished browser-ready world. Mathematical detail generation, representation and observer scale remain distinct; no generator, world, shader, sampling, tolerance, speed or domain changed here.

## Full criteria scorecard

The [r0 card](BI1C-CARD-2026-10-30.md), [adopted r1 amendment](BI1C-CARD-AMENDMENT-2026-10-30.md), [design](../../superpowers/specs/2026-10-30-atlas-bi1c-recovery.md) and [task plan](../../superpowers/plans/2026-10-30-atlas-bi1c-implementation.md) precede implementation. R1 explicitly replaced the proposed hot native replacement with a terminal stop plus saved-file return after a full owned restart. That scope change occurred before building, following Claude's simpler alternative. There is no retrospective criterion or artistic/frame-tail gate.

| Criterion | Result | Evidence and limit |
|---|---|---|
| Fixed place/history | Pass within declared lifetime | Exact requested scene, pose/body/FOV and histories survive in-page recovery; an interrupted accepted gesture settles once. CPU barriers show a newer file wins. Native stop retains those values in the living page; an actual file preserves the place across deliberate restart. History stacks remain page-local and are not serialized. |
| Device recovery | Pass for tested active-viewport policy | Actual GPUDevice.destroy triggers one automatic rebuild with new device/runtime/worker identity; second destroy stays stopped through the fixed one-second observation. Actual Retry resets the allowance. Failed startup/rebuild stops; leave supersedes; ordinary re-entry keeps the allowance consumed. Deliberate destroy is not driver-crash qualification. |
| Browser preparer | Pass within controls/actual worker error | Actual uncaught module-worker error stops even while idle, and Retry uses a fresh worker. CPU controls cover message errors, deadlines, pending jobs, structured-clone exceptions and late upload retirement. All worker job errors are conservatively terminal. |
| Native preparer — r1 | Pass for terminal stop/explicit restart | An owned SIGKILL with a recorded active request yields typed preparer-lost, preserves the requested place, and keeps cleanup/Save available. No hot reconstruction occurs in that server. Fake-child and real-HTTP controls prove fail-fast exit, client binding, late-token refusal/retirement and startup cleanup. A new owned pair reopens the actual file with a new producer and byte-identical re-export. |
| Truthful stopped/pending state | Pass; cosmetic limits remain | Delivered failure closes movement/look/scale/prediction before rebuild. Wrong request/fallback cannot report recovery success. Native crash is distinguished from lease expiry and asks for restart; its ineffective Retry is hidden. Back/Forward/Open while stopped are explicit restore actions; they do not reset the automatic allowance. Stopped view pixels may be blank while requested data remains saved; duplicate status banners remain UI debt. |
| Ownership/resources | Retirement/cleanup pass; region memory unverified | All measured publications retire; old/late/failed resources retain release owners. Known device-loss queue rejection is tolerated; unrelated retirement failure stays sticky. Work/cache/residency/publication and single-adapter/successful-output quotas stay unchanged. No full physical-memory or long-session bound is inferred from RSS. |
| Existing application behavior | Pass — final 27/27 maintained gate | Final-source normal contact/scale, portable files/history, PC4 session/launcher and maintained Plane/viewer checks. Saved scene format and mathematical runtime remain unchanged. |
| Geometry/performance | Finite checks pass; targets mixed | Same native mathematical worker and WGSL; delivered geometry, buffers and recorded actual-motion audits checked. Standing targets and recovery/restore waits are listed separately below. Sparse forward reference remains explicit, not a global completeness claim. |
| Verification/review | Pass — 1,352 units / 85 files, build, 27/27 gate and completed peer reviews | Registered guarded units/build, maintained headed hardware profile, final pinned full gate, completed card/source/evidence judgement, source/file/run hashes and physical closure. Reviewer omissions and absence of independent execution are explicit. |
| Process/claim | Bounded local closure | Formal controls, supported finite observations and unresolved questions are separated. Proposed native replacement machinery was removed before building. No production-service restart policy, full crash corpus, arbitrary depth/world or appearance claim follows. |

## Final-source measurements

Application route `application-route` (22.241 s):

| Standing target | Measured | Result |
|---|---|---|
| Rendered submissions overall ≥30 FPS | 49.978 FPS; RAF 49.978 FPS | Pass |
| Rendered submissions during preparation ≥30 FPS | 49.879 FPS | Pass |
| Navigation p99 ≤2 ms | 4.100 ms | Miss |
| Navigation maximum ≤8 ms | 5.100 ms | Pass |
| Interaction readiness ≤1 s | median 0.809 s; p99/max 2.191 s | Miss |
| Attributable region memory ≤1 GiB | Full physical ownership attribution unavailable | Unverified |

Navigation p50/p95/p99/max: 0.100/2.600/4.100/5.100 ms across 726 decisions. View-readiness median/max: 1.695/1.720 s, reported separately from interaction. Waiting consumed 6.20% of measured frame time; 30 recorded contacts. Peak resident interaction/view regions 8/1; exact tracked GPU-region buffers 30.924 MiB. Frame p99/max 20.100/40.000 ms are diagnostics, not extra gates.

Navigation classes (p99 / maximum in ms): waiting 0.100/0.100 (n=53), constant 0.300/0.300 (n=129), firstSurface 0.200/0.200 (n=3), steadySurface 4.200/5.100 (n=541).

Normal application/session publications retired: application 17/17, session 8/8. Their delivered geometry, buffer and recorded-motion audits pass. Peak whole-owned-process RSS was application 2914.0 MiB, session 2682.9 MiB; this is not region-memory attribution.

Active-Landscape rendering statistics exclude initial activation and mode waits. Rendered=false intervals are excluded from submitted-frame count while their elapsed time remains in its denominator; RAF cadence is separate. Frame-tail values are diagnostic. Recovery events and explicit file/history jumps are not recorded as flight. Incoming restored-body clearance is enforced by the runtime; the offline flight audit applies to actual key-pulse intervals. Finite delivered-geometry qualification is not continuous mathematical body proof for every restored pose.

Final-source recovery rerun: **8/8 checks pass**, 18.700 s interaction / 45.047 s overall; no page errors. Publication retirement: interruption 8/8, restart 2/2.

| Recovery timing | Measured |
|---|---|
| Initial activation → first presentation | 3.789 s |
| Automatic device rebuild activation → presentation | 2.514 s |
| Explicit Retry after repeated device loss → presentation | 2.516 s |
| Explicit Retry after worker error → presentation | 2.501 s |
| Delivered device loss → automatic presentation | 2.569 s |
| Owned helper SIGKILL → delivered typed browser failure | 149.3 ms |
| Same native-loss control, including cleanup/screenshot | 253.0 ms |
| Fresh owned pair, actual saved-file activation → presentation | 3.931 s |

These times distinguish fault delivery, activation-to-presentation, and interaction/control completion. A typed native failure can arrive through an outstanding request or the next heartbeat; the implementation does not claim zero network/detection delay. The first standalone native delivery was 125.8 ms after SIGKILL; its 216 ms control completion also included cleanup and screenshot work. GPU/worker rebuilding reuses the healthy native process; only the explicit owned restart changes producer identity.

Final-source file/history route: **9/9 checks pass**, 25.734 s interaction / 51.311 s overall. The actual download SHA-256 is `84138abd89df4dd379798d402074e35464304f0b3fd9def94c7a0a55d5d88bdc`. The fresh producer differs and the saved scene/pose match exactly; actual re-export bytes match. Publication retirement: save 3/3, reopen 14/14. All finite geometry/buffer/actual-motion audits pass. 7 explicit restores took 1.871–4.006 s (median 2.587 s).

File/history restoration starts at restore-requested and ends at matching current restore-presented; picker/read time is excluded. It recreates client/runtime/GPU/collision state, while the healthy helper persists within a phase. These waits remain optimization targets separate from the movement query budget. A fresh activation may select a different supported coarse region/approximation; exact file/place return does not promise pixel-identical terrain.

## Implementation and independent evidence

The workspace owns the one-attempt policy and existing mode host owns supersession. Only a structured device-lost code on an already active presented renderer consumes the allowance. Validation/OOM and other GPU errors stop explicitly. Intentional disposal suppresses its own loss notification. Every device/worker has an execution identity; requested scene/history contain no GPU/worker/native handles. Failure closes input and cancels pending scale intent; accepted motion settles once. A stale scale message clears on fresh activation or accepted movement.

Renderer retirement destroys every resource, tolerates either queue-completion outcome after acknowledged loss, and preserves unrelated cleanup failures. The preparer is terminal on error/messageerror/deadline/job failure, rejects all pending jobs and terminates its worker. Existing lifecycle rejection plus checks across physics restore/upload reject late publication.

The native controller rejects run/reset promptly after observed exit and closes idempotently. One adapter remains bound to each admitted client. Server health checks apply before and after asynchronous preparation/transfer, while retire/cancel/close remain usable. A late token is retired before the response is refused. Failed initialization/certificate admission confirms owned cleanup; failed cleanup remains sticky. The native server never silently reconstructs a dead adapter or starts work from a status read.

[Final gate](BI1C-final-product-gate-2026-10-30.json), [normal/session measurements](BI1C-final-normal-summary-2026-10-30.json), [file/history evidence](BI1C-final-file-summary-2026-10-30.json), [recovery evidence](BI1C-final-recovery-summary-2026-10-30.json), [decisive ledgers](BI1C-final-ledgers-2026-10-30.json), [physical closure](BI1C-final-closure-2026-10-30.json) and [owner/source/raw-file verification](BI1C-owner-verification-2026-10-30.json) preserve the acceptance record. Large frame/performance streams remain in hashed scratch paths; the committed ledgers omit frame/navigation streams and artifact bodies explicitly.

The [preflight](BI1C-PREFLIGHT-2026-10-30.json) preserves meaningful assertion RED/GREEN, guarded controls, 8 existing and 9 new native-free real HTTP checks, real negative-root rejection before mkdir, unchanged native/shader hashes and a derived old-data audit-format rehearsal. The rehearsal ran under the GPU lock and is explicitly not product acceptance. The actual headed workflow then passed 8/8 on its first attempt in 19.146 s interaction / 45.459 s overall, with 8/8 and 2/2 publications retired and no page errors. Expected induced faults are the workload; no failed acceptance run was relabelled as pass.

Completed card review 20261030T195226Z-a5e2ca confirmed the original source gaps, proposed precise corrections and offered the narrower native boundary. Owner adopted it at `07bc0a2` before implementation. Completed implementation/evidence review 20261030T203457Z-503308 found no material blocker/new safety gap and supports scoped local closure conditional on the owner's final 27-entry gate/full criteria/cleanup check. The owner verified those conditions, actual runs and available source digests; no absent timeout response counts as judgement.

[Card review](BI1C-CLAUDE-CARD-REVIEW-2026-10-30.md), [implementation/evidence review](BI1C-CLAUDE-EVIDENCE-REVIEW-2026-10-30.md) and [reading/provenance record](BI1C-review-provenance-2026-10-30.json) preserve exact responses. The final reviewer inspected selected controller/server/adapter/workspace/renderer/preparer paths by reads/grep, the summary and unit-test names, and all five screenshots. He did not read the unit bodies, recovery/HTTP suite, raw ledgers, application client, collision worker, app, mode host or native queue. He executed and edited nothing. Those omissions narrow independent review scope; owner verification covers the preserved runs and source.

Representative final images: [device recovered](BI1C-device-recovered-2026-10-30.png), [repeated loss stopped](BI1C-device-stopped-2026-10-30.png), [worker stopped](BI1C-worker-stopped-2026-10-30.png), [native stopped](BI1C-native-stopped-2026-10-30.png), [actual restart return](BI1C-restart-return-2026-10-30.png). Diagnostic device-destroy/worker-crash functions are deliberately reachable through the developer inspection API, following the existing viewer precedent. There are no visitor UI or HTTP fault/kill controls.

## Established, supported and unresolved

**Established within maintained controls:** current-generation scene/resource admission, one active-device automatic attempt and explicit reset, terminal worker/native classification, fail-fast controller and owned cleanup, exact requested/history retention, supersession/leave/clearance and final registered verification result.

**Supported finite evidence:** actual deliberate device loss, actual worker exception, an owned helper exit with an outstanding Node request, exact actual-file return after a new owned pair/producer, finite geometry/buffer/motion checks, measured latency and resource retirement.

**Unresolved/carried forward:** driver-level loss, concurrent eviction whose queue rejection might arrive before the loss callback, unresponsive native/kernel hangs, arbitrary startup/recovery matrices, global geometry/fidelity, cross-platform reconstruction, region-memory attribution, long sessions and production deployment. Concurrent early rejection conservatively stops via sticky cleanup; it is not claimed to recover. A single forward reference on coarse specimen `4b2f` remains insufficient for complete coverage. Imported roll still resets on first drag and pitch is clamped to ±1.5. The fixed two scales/domain and native development bundle remain; no new mathematical or appearance feature was built.

## Process cost and next action

The adopted r1 implementation/CPU slice ran from 19:59:44 to the clean source commit at 20:29:49 UTC (about 30 minutes, below 3 h). The first actual recovery suite took 45.459 s overall. The single final gate took 34.64 minutes, below its 45-minute bound. Completed card/evidence reviews took 119 s and 99 s respectively; their resumed-session CLI usage/cost counters are cumulative and are not treated as per-review costs. Hardware/evidence work began at 20:29:58 UTC; final archive/PR timestamps are in Git and the peer log. No mechanical repair allowance was used.

Useful process: independent identification of the known-loss retirement prerequisite, narrowing native scope before building, real HTTP terminal/held-result rehearsal, exact CPU race controls, an actual owned-process interruption, and final source-scoped product acceptance. Avoided cost: no hot-replacement framework, new restart caps or output-layout migration; root/audit format errors were caught by preflight rather than a long failed gate. No repeats were made to improve a performance score.

Next are **interleaved AP1/MD2 releases** after advisor merge: readable lighting/materials/controls and representation quality relative to zoom, paired with broader fixed-world mathematical structures beyond the initial formation. Each increment gets its own observable experience/card and collision-consistent preparation. RB1 retains the production-backend/reproducibility decision; full resource optimization is not inserted as a new blocker before those experiences.
