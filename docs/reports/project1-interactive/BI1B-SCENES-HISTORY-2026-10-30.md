# BI1.B — portable Landscape scenes and navigation history

2026-10-30. Owner Codex; independent challenger Claude. **Bounded BI1.B closure: 1,327 guarded units/82 files, build and 25/25 required product-gate entries pass; completed Claude judgement supports this slice with the explicit findings below**. Measured code/test head `71dc60a1c25172853f446f5bea06d3e7d555f3a5`, based on merged PC4 `5013ba6`, branch `feat/bi1b`, project worktree `/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/bi1b`. Later commits contain documentation/evidence only. Advisor merges the reviewed PR.

Landscape can save a nondefault place to an actual JSON file, close its owned browser/helper, reopen that file with a new producer and return to the same promised world, camera, body and FOV. Back/Forward follows accepted navigation gestures; Undo/Redo reverses complete scene openings. Restoration prepares compatible rendering/collision coverage and checks body clearance before enabling interaction. An unsupported request stays requested, exportable and retryable; it never silently becomes the default place.

This supports the North Star by making mathematical places revisitable through the application. It does not add mathematical detail, enlarge the supported world or select a production preparer. The fixed-world generator and lineage remain distinct from body size, mesh representation and preparation requirements.

## Every frozen criterion

The [original card](BI1B-CARD-2026-10-30.md), [r1 correction](BI1B-CARD-AMENDMENT-2026-10-30.md), [gate-root follow-up](BI1B-FINAL-GATE-FOLLOWUP-2026-10-30.md) and [scale-request repair card](BI1B-SCALE-REPAIR-CARD-2026-10-30.md) are preserved. No artistic, pixel-equality or frame-tail gate was added after observation.

| Criterion | Result | Evidence and scope |
|---|---|---|
| Fixed-world portable scene | Pass for this supported world | Pure prepared-world@1 codec checks complete schema/model/policy/world identity, finite values, camera convention and canonical binary64 values. Actual downloaded bytes contain the current complete world record and camera, without paths, producer IDs, epochs, tokens or cached meshes. Re-keying a different world cannot bypass the producer's full-record compatibility comparison. FNV is identity checking, not authentication. |
| Actual durable file return | Pass, same host/native configuration | Actual nondefault coarse file reopened after closing browser/helper ownership; new browser and producer identity, exact promised world/pose/body/FOV at current first presentation and byte-identical re-export. This is not a fine-file or cross-platform reconstruction test. |
| Navigation history | Pass within registered controls and actual route | Grouped accepted key movement, exact Back/Forward without an edit, branch truncation and 100-pose bounds. Source/deferred controls cover settlement and stale state; headed key/history and wheel-scale paths run. Blocked movement creates no camera entry. Histories survive leave/re-entry in memory. No full six-degree-of-freedom controller claim. |
| Whole-scene history | Pass | One complete file opening is one edit; exact Undo/Redo observed. 100-edit bound and camera/edit separation checked with CPU-only controls. Stacks are not serialized. |
| Safe async restore | Pass within tested lifecycle | Requested and published owners are separate; input closes and old resources drain before replacement. B→C/leave races, world/pose/clearance admission and current-presentation success checked. A viewer fallback cannot report Landscape-open success. History jumps excluded from flight audits. |
| Truthful failures | Pass, listed status limit remains | Malformed/version/size rejection preserves scene/history. Actual valid-but-unsupported local999 file stays requested and inert through Retry; explicit Undo returns to saved place. Missing-helper fallback remains usable. New pending-scale timeout/clearance reasons are accurate, but can remain displayed after later movement. |
| Existing application/PC4 behavior | Pass in final maintained gate | Maintained Plane/viewer scene/share/discovery/input checks plus protected owner/expiry/retained-pose retry/owned-launcher controls. Actual pre-metadata file Open exercised. No automatic reload restoration, Landscape bookmark library, IndexedDB migration or BI1.C recovery parity. |
| Geometry/performance | Finite audits pass; targets mixed | Same native/runtime/queue/source/tolerance/quotas. Final delivered-geometry, buffer-identity and recorded-flight audits checked. Every standing performance target is reported below; history/file latency is separate. Finite samples do not prove continuous surface completeness. |
| Resources | Retirement/cleanup pass; 1 GiB attribution unverified | Publication/token sets, native caches and residency caps checked. Failed/superseded instances retire and physical process/port/lock closure is confirmed. Browser/interpreter RSS is reported separately and cannot settle attributable region ownership. |
| Verification/process | Pass; measured head 71dc60a | Registered units/build, clean pinned 25-entry gate, completed independent card/source/evidence judgements, exact source/file/run hashes, original failures and review omissions preserved. |

## Final source measurements

| Measurement | Target | Final observation | Result |
|---|---|---|---|
| Overall submitted frames | ≥30 FPS | 49.988 FPS | Pass |
| Submitted frames during preparation | ≥30 FPS | 49.880 FPS | Pass |
| Navigation p99 | ≤2 ms | 3.900 ms | Miss |
| Navigation maximum | ≤8 ms | 4.600 ms | Pass |
| Interaction readiness | ≤1 s | median 0.948 s; p99 2.430 s; max 2.430 s; n=9 | Miss |
| View readiness | Reported separately | median 1.745 s; max 1.766 s; n=2 | Reported |
| Attributable region memory | ≤1 GiB | Incomplete attribution; owned-tree RSS below is not region ownership | Unverified |

The actual-input route took 22.664 s: 30 contact events, 862 frame intervals/862 rendered, RAF cadence 49.988 FPS, waiting 1.140 s (6.61%). Frame intervals p95 20.100 ms/max 40.000 ms are diagnostics, not another acceptance gate. Peak owned GPU-buffer receipt total 30.92 MiB; resident interaction/view maxima 8/1.

| Navigation class | Samples | p99 ms | Max ms |
|---|---|---|---|
| waiting | 57 | 0.100 | 0.100 |
| constant | 126 | 0.200 | 0.200 |
| firstSurface | 3 | 0.200 | 0.200 |
| steadySurface | 542 | 4.100 | 4.600 |

Application owned-tree peak RSS 2888.88 MiB; session route 2831.82 MiB; file save/reopen phases 2348.82/2529.11 MiB. These include browser/interpreter/process-tree costs. Application cache peaks: source 95.74 MiB, validation 80 bytes, topology 51.35 MiB. Main/worker WASM and provenance/native/GPU ownership are not combined into a complete region-memory bound.

| Run | Prepared publications | Retired publications | Finite audits / cleanup |
|---|---|---|---|
| Application | 18 | 18 | Pass |
| Session recovery | 8 | 8 | Pass |
| File save | 3 | 3 | Pass |
| File reopen | 14 | 14 | Pass |

Final evidence: [normal/session summary](BI1B-final-evidence-summary-2026-10-30.json), [file summary](BI1B-final-file-summary-2026-10-30.json), [source/record hashes](BI1B-run-provenance-2026-10-30.json), [decisive event extracts](BI1B-final-ledgers-2026-10-30.json), [physical closure](BI1B-final-closure-2026-10-30.json). Actual saved file SHA-256 `1e768303de00a42b8904dc6a6119e9cf58da2a90ea7e779e012a2a3bef1bcd08`, 2851 bytes: [archived actual file](BI1B-saved-scene-2026-10-30.json). The 9/9 file interaction took 25.280 s; whole suite 51.295 s.

Active-Landscape intervals exclude initial activation and mode switching. Render-submission FPS excludes rendered=false frames from the count while retaining their elapsed time in the denominator; RAF cadence is separate. First-surface query, steady surface, empty/solid and waiting decisions are separated in the machine-readable summary. No repeat was run for a better score.

| Restore request | Current presentation latency |
|---|---|
| 1 | 3.885 s |
| 2 | 3.232 s |
| 3 | 1.856 s |
| 4 | 2.456 s |
| 5 | 2.778 s |
| 6 | 2.529 s |
| 8 | 2.491 s |

All 7 successful explicit restores: min 1.856 s, median 2.529 s, max 3.885 s. Earlier standalone 9ab8ee6:1.875–3.946 s; stopped 07775ed gate file slice:1.907–4.062 s. Unsupported request 7 is absent because it never presented.

Restore timing starts at `restore-requested` and ends at matching current `restore-presented`, excluding the file picker/read. Each history restore rebuilds client/runtime/GPU/collision state. The native helper remains alive within a phase; only save→reopen actually restarts helper/browser and changes producer identity. This is an optimization target and a visible wait, not movement-query timing.

## What failed, and the repair

1. First actual-file suite on 2919f6d completed its user-facing checks, then the buffer-audit fixture failed with `KeyError: mode` because the phase report omitted its mode. Original files remain unchanged. The one original mechanical repair added `mode:'files'`, rehearsed the real audits on derived copies and produced a 9/9 corrected run on 9ab8ee6. That commit also preserved full quaternion up in rendering; unit/source evidence covers 90° roll and sign equivalence.
2. First full gate on 9ab8ee6 failed before browser/GPU: the native-free HTTP script accepted only atlas-pc4 output roots. It refused atlas-bi1b before mkdir/server/adapter startup. Original-card acceptance stopped because its repair allowance was spent. Independent review approved one narrow two-root correction, with eight actual native-free checks, fake native/factory2/cleanup and look-alike rejection before mkdir.
3. That full gate on 07775ed failed 24/25: wheel scale intent ended on a transient native queue-capacity result although fine geometry became ready 1.606 s later. The user remained at coarse scale for the 10 s test bound. Browser errors were empty and cleanup passed. Source/trace review independently confirmed the same one-await/one-retry defect already exists in merged PC4. This was a real application failure, not failed mathematics and not a gate waiver.
4. A fresh independently challenged repair card kept the latest bounded scale intent in the workspace. Existing prediction prepares/retries geometry; a current permitted frame attempts the unchanged collision-safe scale admission only when fine and home are ready. Reverse, leave, restore, loss, focus, save and timeout cancel. Meaningful assertion RED on old source precedes GREEN with the real runtime and capacity-refusing/gated fake producer. No per-frame request flood, one scale and one camera entry; cancellation/timeout/occupied-body controls pass. Runtime 81d711…, queue 293b8d… and adapter a69104… are unchanged. One maintained headed route passed, then one final full gate ran on 71dc60a. The headed route establishes lack of regression; deterministic controls establish the capacity-race repair.

No failed attempt is rewritten as passed. The path correction and then the actual source repair are separately bounded, reviewed follow-ups; earlier no-rerun stop rules were respected by stopping their acceptance claims and returning for independent judgement.

## Independent judgement and remaining limits

Completed card review 20261030T173343Z-2ee11b preceded implementation. Evidence/source review 20261030T181111Z-fa25dc supports the bounded file/history experience; gate-root review 20261030T181754Z-a3f42a approves the narrow test correction. Scale-failure review 20261030T184858Z-620182 confirms the diagnosis and recommends workspace ownership; completed repair review 20261030T185734Z-7beb48 finds no material blocker/new safety gap, conditional on the owner's final 25/25/scorecard/cleanup check. These are completed judgements, not absent timeout responses. Verbatim responses and provenance are archived; none of these reviews independently executed tests.

Original evidence review read the new codec/history/workspace/mode host/file suite in full, selected pose/renderer/app paths and ledger/summary extracts, and both coarse screenshots. It did not read the unit tests, runtime/client or all raw data. Repair review read the card, manifest, summary and workspace in full; unit lines 120–189 and targeted grep; the fine screenshot. It did not read the rig helpers, raw headed ledger/audits beyond summary booleans, RED record or final gate. The owner checked those actual preserved runs and final conditions. Detailed reading omissions for each review remain with its verbatim response: [card](BI1B-CLAUDE-CARD-REVIEW-2026-10-30.md), [file/source evidence](BI1B-CLAUDE-EVIDENCE-REVIEW-2026-10-30.md), [gate-root follow-up](BI1B-CLAUDE-GATE-ROOT-REVIEW-2026-10-30.md), [scale diagnosis](BI1B-CLAUDE-SCALE-REVIEW-2026-10-30.md), [repair verification](BI1B-CLAUDE-SCALE-EVIDENCE-REVIEW-2026-10-30.md), and [completed-review provenance](BI1B-completed-review-provenance-2026-10-30.json).

The saved and cold-restored images can differ in facet/normal patterns because the same pose can select a different admitted coarse region: original live 03a17384… versus restored4b2f1f5b…. Specimen 4b2f has only one forward reference sample and 512 reverse mesh samples. Reverse checks do not establish full surface coverage. No pixel-identical reconstruction or global fidelity claim follows. Final representative views: [saved place](BI1B-saved-place-2026-10-30.png), [cold-restored place](BI1B-restored-place-2026-10-30.png), [fine inspection](BI1B-fine-inspection-2026-10-30.png).

An imported roll is retained by scene identity and render basis; the current yaw/pitch look controller drops roll on first drag and clamps pitch to ±1.5. No arbitrary-roll headed file was tested. After cancelling a pending shrink, runtime fineWanted can still prepare/protect fine coverage; no cancellation API or new resource quota was introduced. A sticky scale-failure message can obscure later frontier-preparation status until another scale gesture. These are explicit follow-up limits, not newly invented gates.

**Formally established within maintained controls:** codec/history/request ownership, current-generation admission, existing PC4 fences, deterministic capacity-to-ready scale handling, and the final registered verification result.

**Supported finite findings:** actual coarse file return after real helper/browser restart, the recorded 3D/fine-contact route, finite delivered geometry and recorded-motion checks, measured performance and resource retirement.

**Unresolved:** continuous/global geometry coverage, cross-platform reconstruction, full region memory ownership, fine-file/arbitrary-roll hardware return, complete sleep/crash/device/preparer recovery parity, production deployment and broader mathematical/appearance experience. Saved files identify the world without embedding mesh assets; the supported preparer and source assets must still be available.

## Process cost and next step

Initial design/card commits 17:19–17:39 UTC preceded implementation; implementation/first fixes were committed 17:56–18:04. First pre-hardware gate failed after 7m 05s; the 07775ed gate ran 18:20:33–18:49:56 UTC (29m 23s). Workspace repair and full CPU verification took about 2 minutes; its headed route/controls/audits took about 2 minutes. The final gate ran 2026-10-30T18:57:36.826Z–2026-10-30T19:30:10.243Z, 32m 33s, within its 40 minute bound. Its exact record is [archived](BI1B-final-product-gate-2026-10-30.json). Independent card/evidence/diagnosis/repair reviews and initial transmission-permission wait are accounted separately from building/hardware. The original 1 h hardware allowance stopped explicitly; follow-up cards declared their own finite bounds before execution. Large per-trial performance reports and complete frame/navigation streams remain preserved in scratch with source paths and hashes. The published event extract explicitly lists its omissions; full measured summaries and decisive state transitions are archived.

Worthwhile process: independent scene-admission/fallback challenge, exact-file cold return, cancellation barriers, real source diagnosis instead of a timing retry, deterministic capacity/late-ready controls and final source-scoped product evidence. Avoidable cost: missing phase mode and stale test output-root guard; both should have been caught by native-free rehearsal before hardware. The failed full route exposed a real inherited defect, and its repair now has a direct control. Review time was allowed to complete; process cost does not turn a missing gate into a pass.

BI1.B’s bounded scene/history/file slice is complete. **BI1.C device/preparer recovery is next after advisor merge.** AP1/MD2 remain interleaved multirelease workstreams for appearance, controls, representation quality relative to zoom and additional fixed-world mathematical structures. The current native helper remains a development control. No advisor implementation decision or new Claude-transmission permission is pending; standing approval is now recorded in both agent instruction files.
