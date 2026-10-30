# ATLAS: move-forward plan toward a browser-ready mathematical world

**Date:** 2026-10-29
**Owner:** Codex
**Challenger:** Claude
**Status:** Current owner roadmap. PC1, PC2/WC2 and BI1.A1/A2/B/C are implemented and independently reviewed within their declared bounded local scopes. The tested local BI1 integration route is complete; the broader browser-world release and production backend remain open.
**Immediate next item:** advisor merge of BI1.C, then the first interleaved AP1/MD2 experience card. [BI1.C full scorecard](../../reports/project1-interactive/BI1C-RECOVERY-2026-10-30.md): one automatic active-device rebuild, explicit browser Retry and native Save/restart with actual-file return. Final source/test head `72ac955` passes 1,352 units/85 files/build and 27/27 gate, completed review and physical closure. Branch `feat/bi1c` is under project `.worktrees/bi1c`, based on merged PR22/main `57ba3b9`. Standing performance/memory and finite-world limits carry forward; RB1 retains release-backend selection.

Governing intent: [ATLAS North Star](../specs/2026-10-23-atlas-north-star-charter.md) and the [fixed-world engineering interpretation](../specs/2026-10-29-atlas-multiscale-world-clarification.md). This plan continues after the [local multiscale plan](2026-10-29-multiscale-feature-experience.md), [PR9 lifecycle](../../reports/project1-interactive/PR9-LIFECYCLE-2026-10-29.md) and [BW1 wider-world result](../../reports/project1-interactive/BW1-OBSERVER-REGIONS-2026-10-29.md). Their original evidence and criteria remain preserved.

## Destination and current position

The next product milestone is a supported browser experience in which someone opens ATLAS, enters a mathematical landscape, flies in three dimensions beyond hand-picked fixtures, approaches smaller mathematical structures, contacts them safely, leaves and returns to the same place. Preparation follows the visitor, memory remains bounded, and unavailable or unsupported geometry has an honest recovery state.

The mathematical world is fixed. Mathematical detail generation, mesh representation and approximation accuracy remain distinct. A smaller-scale representation may have new formations and topology; this plan does not require subdivision of the previous mesh. Rendering and interaction must agree on the represented world, and transitions must not relocate the visitor or move surfaces through them.

| Capability | Current evidence | Remaining limitation |
|---|---|---|
| Prepared rendering and collision | Local navigation consumes prepared triangles and spatial queries. | Native preparation is packaged behind PC1 and the local development helper; production deployment remains unselected. |
| Local multiscale discovery | PR9 shows additional mathematical relief, contact and stable return in one fixed construction. | Finer interaction is available near one starting formation; arbitrary recursion is unproved. |
| Wider spatial preparation | PC2 prepares fresh parent/cutter regions in a bounded three-dimensional domain with fixed mathematical lineage. | Finite domain and two body scales; general detail placement and unlimited coverage remain unproved. |
| Surrounding view | A coarser representation keeps distant terrain visible through local empty air. | No general watertight seam or continuous horizon guarantee. |
| Interactive performance | BI1.C final route: 49.978 FPS overall / 49.879 during preparation; navigation maximum 5.100 ms. | Navigation p99 4.100 ms and interaction-readiness maximum 2.191 s miss targets; complete region-memory attribution remains unverified. See the full BI1.C scorecard for restore/recovery timing. |
| Application experience | Entry, session recovery, portable scene/history and bounded execution recovery are integrated and independently reviewed. | Driver/hang recovery, supported deployment and broader world/detail experience remain. A dead native helper uses Save plus an explicit owned restart. |

**We are moving from a successful bounded research prototype into application engineering.** The prototype establishes enough to build on; it does not establish a finished browser-ready world.

## Execution sequence

### 1. PC1 — define the preparation contract and adapt the working preparer

**Experience enabled:** browser navigation can consume prepared world data without depending on Python modules, scratch paths or fixture-number conventions.

Publish a small versioned contract and put an adapter around the measured native preparer. The contract must describe:

- Stable world/generator identity and mathematical feature lineage, separately from representation identity, builder version, sampling and approximation policy.
- A spatial request with three-dimensional coverage, requested interaction/view needs and numerical requirements. Observer size affects those requirements, not the world seed or generation history.
- Explicit states for pending work, prepared view data, interaction-ready data, cancellation, unsupported coverage and unresolved/error results. A mesh being generated is not yet proof that browser collision preparation has finished.
- Surface, constructed empty-air and full-solid classifications with their approximation/qualification basis. Missing collision data never means empty space.
- Compatible render/collision revisions, coordinate transforms, bounds and dependencies; request/generation identifiers for rejecting stale completion.
- Ownership and retirement of CPU buffers, GPU resources, collision structures and caches, including shutdown and recovery.

Use the native implementation as the initial adapter and measured control. Separate view-only payload needs from interaction payload needs; the current view path unnecessarily goes through collision indexing and snapshot restoration. Preserve the existing canonical world and its provenance while defining portable records; workstation file paths must not become required scene inputs.

**First execution slice:** at most two hours for source/contract audit, schema, adapter outline and a CPU contract/replay check. Inspect existing scene, renderer, navigation and resource contracts before choosing implementation files. Freeze a short card and obtain the normal peer challenge before substantial implementation. No new GPU performance corpus unless changed behavior requires it.

**Completion evidence:** a recorded BW1 request/result can cross the boundary without losing world identity, transforms, representation eligibility or fidelity policy; stale, unsupported and unresolved messages fail safely; view-only data cannot become navigation coverage; ownership and cancellation are executable and tested. Implementation details and product defaults stay out of the visitor flow.

### 2. WC2 — extend prepared coverage to three-dimensional flight

**Experience enabled:** the visitor can ascend, descend and move around terrain instead of remaining within the current lateral slab.

Extend stable region addressing and prediction to bounded three-dimensional coverage. Reuse the qualified generation/interaction method and surrounding view; retain the known fine-scale formation as a control. Derive overlap and spacing for the actual visitor body in three dimensions rather than assuming the two-dimensional lattice spacing remains safe. Generate and qualify the newly required parent/cutter regions.

Keep active coverage until the next handoff is safe. Protect regions needed within the measured preparation horizon, and show a truthful state when the visitor outruns preparation. Do not select a clear route by assuming flat terrain: use prepared collision geometry and mathematical reference checks. Contact with terrain is normal behavior.

**First candidate bound:** one explicitly bounded 3D domain, up to three hours for implementation/qualification and one hour for browser evidence and review. Publish addresses, route/input checks, resource limits and the full scorecard before building. Stop for safety, identity, unresolved required geometry or cleanup failures; record partial coverage if the chosen domain is not fully supported.

**Completion evidence:** real keyboard/mouse ascent, descent, lateral movement and reversal cross newly generated coverage; incoming bodies and swept motion remain supported; contact and scale changes are consistent; eviction/rebuild recovers the same promised place. Verify resident reuse and opposite request order separately. The known mathematical-detail experience remains available without reseeding or observer-dependent geometry.

### 3. BI1 — integrate a vertical slice into the existing ATLAS application

**Experience enabled:** enter and explore the prepared world through the application, without operating a research harness by hand.

Write the integration design and a task-level implementation plan after PC1/WC2 establish the boundary. Respect the maintained Plane/Space scene, history, camera, workspace activation and recovery contracts. Keep numerical and navigation logic GPU-independent, WebGPU ownership within the backend, and the composition root small. Introduce explicit spec amendments where a new prepared-world model requires them.

Start with one supported world and one complete route: launch, enter, move, change scale at the known formation, leave/return, switch workspace, recover or exit. Provide actionable unavailable-preparer behavior. Initially retain the native development adapter rather than silently adopting a production generation service or claiming browser-only execution.

Split implementation into reviewable slices with a concrete user-visible result and bounded execution card for each. Retain the working Plane and existing Space workflows and run the affected product checks. Scratch evidence informs this work but cannot replace product acceptance.

PC2 now demonstrates the bounded 3D experience at about50FPS, with request-readiness and navigation-tail misses. Its ordinary flights wait about13–15% of their duration. Own readiness throughput and truthful frontier status explicitly in early BI1 slices; carry fine-query tails and complete region-memory attribution as measurable obligations. BI1 qualifies its own final application source rather than inheriting PC2's pre-packaging performance measurements. See the [PC2 full scorecard](../../reports/project1-interactive/PC2-LIVE-3D-COVERAGE-2026-10-29.md).

**Completion evidence:** a documented supported launch path opens one application URL; the visitor does not coordinate separate experiment scripts; workspace switching and shutdown release resources correctly; state survives the promised recovery cases; existing workflows still pass. Keep the required local native helper explicit until the production preparation location is decided.

### 4. AP1 and MD2 — improve appearance and broaden mathematical discovery

These are interleaved workstreams after the initial application slice, likely several releases/subplans each and much of the remaining user-facing V1 work. Schedule their increments around complete exploration experiences. Neither needs to wait for a general optimization campaign. Coarse triangles remaining coarse relative to zoom is one end-to-end case: distinguish mathematical feature generation, mesh approximation, lighting/material cues and safe navigation rather than assume subdivision alone supplies missing mathematical detail.

**AP1: lighting and materials.** Add a bounded first appearance pass to the working terrain: readable lighting, a material treatment and usable exploration controls. Appearance parameters remain separate from mathematical generation. Check that shading and materials preserve geometric cues, contact consistency, motion and the declared frame-rate target. Do not invent a required wall shape, artistic feature or pixel pattern as a product success gate.

**MD2: detail beyond the starting formation.** Demonstrate additional mathematical structure at more than one location and scale. Freeze the construction/lineage and intended discovery before choosing its representation. Prepare detail ahead of the visitor, retain consistent collision, and check regeneration in different orders. New topology or a replacement representation is allowed; more triangles alone do not establish new mathematical structure. Define the finite scope before building; unlimited depth is not a prerequisite.

**Completion evidence:** users can see and explore an improved landscape and find mathematical detail beyond the single original demonstration, while still revisiting the same world. Each increment publishes its own small card, evidence and limits. Do not restart the parked alternative specimens merely to force an old failed visual prediction to pass.

### 5. RB1 — select and release a supported browser-world path

**Experience enabled:** the integrated world has a documented, supportable way to run and revisit a saved place.

Before selecting client-side preparation, a generation service or a hybrid, the peers write independent positions and run the smallest discriminating test behind PC1's boundary. Compare actual capability, startup, readiness, memory, fidelity, platform requirements and operational consequences. Escalate material deployment cost, licensing or acceptance of important unresolved risks with a recommendation. The current local native adapter is a control, not an automatic production default.

Use the selected supported path for a bounded longer-session test, resource accounting and recovery checks. Define the promised reproducibility level and save/reopen a world and viewpoint without depending on cached meshes or machine-specific paths. Exact pixels, numerical identity and place identity are different promises.

**Completion evidence:** the supported desktop/discrete-GPU configuration and launch/deployment requirements are documented; saved places recover the promised world; resource ownership and shutdown are verified; remaining limitations are explicit. Execute the applicable maintained product acceptance policy. Promotion is through a reviewed PR; the advisor merges to main.

## Criteria and how decisions will be made

Each execution card connects its criteria to the experience or engineering claim being tested. Freeze them before evaluation and report every criterion afterward. A wrong prediction of a particular visual formation is a finding about that prediction; it cannot erase demonstrated mathematical detail that meets the product intent. New gates are not introduced after a run.

| Category | Standing requirement or target | Treatment |
|---|---|---|
| World integrity | Same fixed mathematical world; stable placement and lineage | Missing provenance or observer-dependent reseeding stops the affected candidate. |
| Geometry and interaction | Compatible prepared revisions, safe covered handoffs, no observed tunnelling, embedding or relocation | Correctness failures stop the affected candidate. State empirical/finite limits separately from mathematical guarantees. |
| Fidelity | Current local target ≤0.01 interaction-body diameters; view-only tolerance declared separately | Never silently loosen a tolerance. Unsupported reference coverage narrows the claim; do not imply completeness from a missing sample. |
| Frame rate | At least 30 FPS overall and during preparation on the supported hardware | Record the workload, per-run and pooled figures. Frame tails remain diagnostics unless an explicit policy changes. |
| Navigation | p99 ≤2 ms, maximum ≤8 ms | Record passes and misses separately. Prototype progress can continue with an explicit performance gap when the experience works; the result is not an all-target pass. |
| Preparation | Request→interaction-ready target 1 second; viewing and interaction timings separated | Include transfer, indexing and publication. Record startup/cache state, queue delays, waits and recovery. Fix measured experience blockers; defer a general optimization campaign. |
| Resources | Bounded work, caches and residency; target1 GiB attributable region data | Track ownership, live bytes and retained capacity. Keep RSS separate; incomplete ownership is unverified, not a budget pass. |
| Repeatability | Resident reuse, real retirement/rebuild and opposite request order | Check each separately against the declared numerical promise. Same-host bitwise evidence does not establish cross-platform identity. |
| Verification | Bounded CPU/browser work, exclusive GPU ownership, maintained hardware profile and confirmed cleanup | An unconfirmed owned process tree stops further GPU work. Existing product acceptance policy remains authoritative for integration/release. |

Performance gaps do not become reasons to invent a new mathematical specimen. A meaningful safety or integrity defect does require repair before relying on that path. At a stop rule, record the result and the smallest next discriminating action.

## Open findings carried into execution

| Finding | Current evidence | Where it is addressed |
|---|---|---|
| Preparation latency and waiting | Coarse 0.59–2.31 s; fine 1.56–1.70 s; view 1.92–2.23 s; 6.69 s waiting over 360 s | PC1 makes readiness phases/intent explicit; WC2/BI1 measure prediction, throughput and priority under actual movement. |
| Coarse collision outliers | Navigation maximum 12 ms; coarse sweep maximum 11.9 ms | Preserve phase timing; distinguish first-after-restore queries, steady queries and allocation effects before choosing an optimization. |
| Fine collision cost | Fine sweep p99 about 3.5 ms despite overall navigation p99 passing | Keep per-scale measurements in the next workload; do not call the pooled change an optimization. |
| Publication stalls and capacity | Frame maxima 120–160 ms; main WASM capacity about 350 MiB | PC1/BI1 separate view-only payloads and ownership; inspect snapshot restore and normal expansion, then test capacity over a bounded longer session. |
| Memory ownership | RSS exceeds the 1 GiB target category, but region ownership is incomplete | PC1 defines owners; BI1/RB1 measure attributable bytes and retirement/recovery. |
| Sparse reference coverage | BW1 region 143 had no forward-reference samples | Carry a targeted mathematical completeness check into the next qualification card; preserve the valid reverse checks and current limits. |
| Portable identity and deployment | Current canonical provenance and native environment include workstation-specific implementation inputs | PC1 defines portable records without changing the world; RB1 makes the supported backend/reproducibility decision explicitly. |
| Limited coverage and detail | Bounded lateral slab; one known finer formation | WC2 extends spatial movement; MD2 expands mathematical discovery after the application slice. |

## Ownership, review and publication

Codex owns execution, measurements, corrections and keeping this roadmap current. Claude challenges substantial cards and independently judges decisive evidence. A peer's numerical claim is checked against preserved source or data before being relied upon. Review omissions are declared and narrow the claim. Consequential architecture choices get independent positions and a bounded test, rather than repeated discussion or transferring an engineering disagreement to the advisor.

The advisor steers product intent and merges reviewed PRs. Routine reversible implementation does not wait for another implementation approval. External transmission, material deployment commitments and other consequential permissions are handled when needed, with concrete reviewable scope. Standing approval from2026-10-30 covers calling Claude through the existing bridge with ATLAS design/source/results/fixed images; no routine payload-specific permission prompts.

Every milestone report contains: the newly observable capability, the full criteria scorecard, established/partial/unresolved findings, representative evidence, process cost and the next owned action. Keep progress visible during active work, including review/reporting periods. Link the latest milestone and this plan from the project status index and restart checkpoint.

The first supported browser-world milestone is reached when a visitor can enter the integrated application, travel freely within the declared 3D domain, approach mathematical detail, contact it, return and recover the promised state without research-harness coordination. AP1 improves its appearance; MD2 expands what can be discovered; RB1 establishes the supported release path. Walking, ecology and unlimited recursive generation remain later North Star work rather than prerequisites for this milestone.

## Progress ledger

| Item | Status | Next deliverable |
|---|---|---|
| Local prepared navigation | Demonstrated | Preserved evidence in PR1–6 and later checks |
| Local multiscale fixed-world experience | Demonstrated | PR9 remains the control |
| BW1 wider-world foundation | Demonstrated, with reported gaps | Native prototype and launcher retained |
| PC1 preparation boundary | **First CPU slice complete, independently reviewed** | [Contract, lifecycle and native replay report](../../reports/project1-interactive/PC1-PREPARATION-BOUNDARY-2026-10-29.md); live producer wiring remains for WC2 |
| WC2 three-dimensional coverage | **Bounded experience complete, independently reviewed** | [PC2 source/evidence and full scorecard](../../reports/project1-interactive/PC2-LIVE-3D-COVERAGE-2026-10-29.md); latency/navigation misses, ownership and final-source limits explicit |
| BI1 application integration | **A1/A2/B/C bounded local route independently reviewed** | [BI1.C full scorecard](../../reports/project1-interactive/BI1C-RECOVERY-2026-10-30.md): device/worker recovery, native Save/restart, exact file return, 1,352 units/27-entry gate and cleanup pass. Advisor merge then interleaved AP1/MD2 releases; release backend/world breadth remain open. |
| AP1 appearance | Planned | First lighting/material increment on integrated geometry |
| MD2 broader mathematical discovery | Planned | Bounded additional locations/scales with fixed lineage |
| RB1 supported release | Planned | Backend decision, ownership/recovery evidence, supported launch and reviewed PR |

The time limits above bound first execution slices; they are not calendar delivery promises for the entire roadmap. Later-stage scope and estimates are refined from the preceding evidence before implementation starts. No user decision is currently blocking the next local planning/execution slice.
