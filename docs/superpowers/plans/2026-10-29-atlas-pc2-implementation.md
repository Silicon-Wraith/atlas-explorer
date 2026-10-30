# PC2 implementation plan — live preparation and 3D flight coverage

**Status:** Bounded implementation/evidence complete and independently reviewed, 2026-10-29; [PR #19](https://github.com/Silicon-Wraith/atlas-explorer/pull/19) is open for advisor review/merge. Claude card review `20261029T234230Z-92ad1a`, the [r1 resolutions](../../reports/project1-interactive/PC2-CARD-AMENDMENT-2026-10-29.md) and the [full result/source limits](../../reports/project1-interactive/PC2-LIVE-3D-COVERAGE-2026-10-29.md) apply. Branch `feat/pc2`, worktree `/mnt/ml_storage/dev/projects/mandelbrot_explorer/.worktrees/pc2`, starts at merged main `1cfacca0506854685db2207949a7e1b4b24ea084`. PC2 implements the roadmap's WC2 step.

**Governing design:** [PC2 live 3D coverage](../specs/2026-10-29-atlas-pc2-live-3d-coverage.md), [PC1 boundary](../specs/2026-10-29-atlas-preparation-boundary.md), the North Star and fixed-world clarification referenced there. The design governs this plan. The [execution card](../../reports/project1-interactive/PC2-CARD-2026-10-29.md) freezes candidate bounds and evidence. Normal peer challenge precedes substantial implementation.

## Scope and source audit

The merged PC1 code provides strict JSON validation, content-dependent representation identity, request/producer epochs and tracked resource leases. BW1 provides the live native generator, collision preparation, same-revision rendering, real input and bounded measurement controls. Its measured source/evidence are immutable controls. Audit the actual interfaces before moving any behavior into owned modules; copy retained behavior with provenance rather than silently editing the control.

The implementation remains an isolated prepared-world slice exercised by a bounded browser harness. It does not register a new existing-app scene model, change Plane/Space history/persistence, choose a production backend or replace product acceptance. Source belongs in the project worktree; generated artifacts and dependency data belong in scratch. No new worktree is created under scratch.

## Task 1 — 3D address and body-coverage model

**Files:** `src/space/preparation/spatial-grid.js`; `tests/unit/preparation-grid.test.js`; `tests/unit.manifest.json`.

Implement stable integer 3D addressing, center/bounds conversion, nearest/candidate selection and whole-body/swept-segment containment. Keep world identity separate from lattice addresses. Freeze the world frame, `D`, half-extent, skin, `0.5D` spacing and finite domain in explicit data. Preserve BW1's physical lateral extent.

**Assertions:** all positions accepted as covered have the entire body and proposed sweep inside actual returned bounds; no address outside the declared domain is silently clamped; mathematical identity is independent of body size/address order; coverage does not imply collision clearance.

**Checks:** manifest-registered guarded units over actual-frame cell corners, faces/ties, finite-domain boundaries, three-axis motion, invalid/unsupported inputs, and fine/home dependency containment. Validate the enclosure derivation against the actual frame. Do not launch a browser or GPU from units.

## Task 2 — live native protocol and PC1 adapter

**Files:** `scripts/preparation/native-worker.py`; `scripts/preparation/native-adapter.mjs`; small GPU-independent protocol/queue helpers under `src/space/preparation/` if required; `tests/unit/native-preparation.test.js`; unit manifest.

Configure the retained native dependency bundle on the producer side. Wrap canonical BW1 coarse/view builders for explicit 3D origins, retaining fine generation as a declared control. Keep canonical mathematical sources unchanged. Emit the real world/content manifest, complete sampling policy, constructed-solid classification and per-phase timing. Bind the fine parent reference by digest.

Echo full request and producer identities, accept spatial requests with actual containment, and construct PC1 artifacts/results without leaking native paths. Use one active native job/two queued jobs, interaction priority, deduplication compatible with request identities, cancellation/retirement and bounded startup/job/shutdown. Input/output roots and disk quotas are explicit; no implicit root-drive writes.

**Assertions:** native completion never grants browser readiness; stale producer/runtime results cannot publish; empty/full classification is explicit and based on the composed solid; required-source unknowns are unresolved rather than air; representation identity includes policy/source/content dependencies and excludes fixture/job numbers. A cancelled active job may complete but must have an owned retirement path.

**Checks:** guarded units with a process/stream double test matching, queue priority, cancellation, restart, late results, malformed classification and cleanup behavior. A separately bounded native smoke verifies actual geometry/policy/world/buffers through the adapter under the GPU lock. Preserve its complete input and source manifest. Do not claim a native smoke establishes browser interaction readiness.

## Task 3 — actual browser resource receipts

**Files:** `src/space/render/webgpu/prepared-regions.js` and its WGSL if separated; `src/space/preparation/collision-worker.js`; GPU-independent browser payload/receipt helpers under `src/space/preparation/`; focused registered units where they verify contract behavior; `tests/fixtures/pc2/` browser page/driver.

Reuse the measured triangle renderer, normal generation and collision method with explicit ownership. The payload producer validates lengths/digests and returns a lease. The consumer prepares GPU resources and interaction collision/occupancy structures, then returns a PC1-compatible receipt. View intent loads only rendering buffers and creates no collision snapshots/worlds. Use real producer identity and actual content-derived revision in all paths.

**Assertions:** WebGPU ownership stays in the backend; shared code acquires no native/physics/GPU handle; partial allocations release on failure; `interaction-ready` waits for collision and rendering completion; a view receipt never grants movement coverage; full-solid blocks entry and missing data is unresolved.

**Checks:** focused CPU contract controls plus bounded headed hardware smoke with actual revision events, empty/full cases where generated, view-without-collision events and confirmed release. Retained fine/home/view clipping behavior must survive extraction; preserve image evidence without introducing a new artistic gate.

## Task 4 — prediction, movement handoff and retirement

**Files:** GPU-independent prediction/coverage selection under `src/space/preparation/`; focused registered units; the PC2 browser driver and native adapter from tasks 2–3.

Predict useful coverage from actual position/velocity within a bounded readiness horizon. Protect active/home/fine dependencies and imminent body work, cap residency, and admit view work only when interaction demand permits it. Use prepared collision for incoming pose and sweep decisions. Change active rendering/collision selection together, leaving prior coverage live until safe handoff. Preserve real keyboard/mouse scale/contact controls at the canonical fine formation.

**Assertions:** no assumption of flat terrain; nearest-address selection alone never establishes clearance; no mathematical evaluation in movement frames; late/unready preparation delays movement truthfully without displacement; active or required regions cannot be retired; shutdown drains pending jobs before releasing their inputs. Queue/native blocking, query warmup, restoration and publication cost stay observable.

**Checks:** deterministic units for diagonal/corner coverage, protected eviction, priority and stale handoff; bounded browser smoke for genuine up/down/lateral motion, contacts, fine transitions and an injected 3-second delay. Do not substitute direct position assignment for flight input.

## Task 5 — qualification and the frozen browser workload

**Files:** `scripts/experiments/pc2.mjs` bounded runner; `scripts/experiments/pc2-qualify.py` and score helpers as needed; the PC2 fixture page. Run inputs, native payloads, manifests, timings, screenshots and reports go under a fresh `/mnt/ml_storage/scratch/atlas-pc2/` run directory.

Reuse maintained Chrome/profile/bounded-cleanup helpers. Run only the frozen candidate: preflight of required new 3D regions, 3 × 90-second ordinary excursions, one 20-second late-preparation control and one bounded real-input check. Preserve stationary/startup/cache conditions and each failed attempt. Native generation remains one active job; do not prebuild all 455 possible regions.

**Assertions:** reference checks are independent of rendered/collision representations and never equate missing samples with completeness; compare declared tolerances, not observed maxima; record reuse, actual rebuild and opposite order separately; hardware acceptance uses headed installed Chrome with sandbox, recorded Vulkan/discrete-GPU identity, explicit handoff, exclusive lock and confirmed owned cleanup. An unconfirmed process tree stops further GPU work.

**Checks:** all card rows, including performance misses, per-scale collision/first-query distributions, readiness phase accounting, wait/throughput/priority, resource ownership and the region-143 completeness follow-up. A performance miss does not erase an achieved flight experience. A safety/identity/source/cleanup defect does stop reliance on the affected candidate.

## Task 6 — independent result judgement and publication

**Files:** `docs/reports/project1-interactive/PC2-LIVE-3D-COVERAGE-2026-10-29.md`; representative screenshots; report index/restart status; this plan's progress record; roadmap progress; milestone peer-log archive.

Freeze decisive source/evidence, record the owner's judgement, and obtain the normal independent evidence assessment with its execution/visual limits explicit. Check peer factual claims against source or preserved runs. Publish every original card criterion with pass/miss/unverified status, established/supported/unresolved tiers, process cost and the next owned action. Run affected guarded units and required checks; preserve finite scope and existing product acceptance.

Any PR keeps PC2 source, its specification and evidence together. The advisor merges to main. BI1 follows with a separate application-integration design and task plan; no automatic backend choice or release claim follows from PC2.

## Bound and stop accounting

The first candidate allows three hours for implementation/qualification and one hour for browser evidence/review. Record design/audit and external permission waits separately. Stop early for unsafe geometry, lost identity, unresolved required construction, unconfirmed cleanup or the frozen substantive stop rule. A bounded mechanical repair preserves the failed attempt and uses rules independent of the desired outcome. Further work after a substantive stop needs a new recorded engineering choice, not repeated runs to improve the verdict.

## Progress

| Task | Status |
|---|---|
| Design/source audit and frozen card | Complete; challenge and r1 corrections recorded |
| 1. 3D coverage | Implemented; actual-frame coverage units pass |
| 2. Live producer | Implemented; five native development outputs and independent finite checks pass |
| 3. Browser receipts | Implemented; headed hardware smoke reaches coarse/fine contact; exact-shader nested clipping controls pass |
| 4. Prediction/handoffs | Implemented; all three ordinary runs demonstrate new 3D coverage and repeated fine visits; cancelled-response ownership gap repaired and tested |
| 5. Qualification/workload | Complete for the preserved measured source: 3×90s, late20s, actual input26.121s, reconstruction controls, all published unique geometry and finite flight audits; final dependency packaging has a separate20s hardware smoke |
| 6. Review/report | Complete; two evidence reviews support bounded closure and BI1 design. Full scorecard records target misses, sparse sampling, source scope and unverified ownership. All 1,258 units/build pass; PR #19 published |
