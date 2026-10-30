# PC2 — live preparation and bounded three-dimensional coverage

**Status:** Bounded experience implemented and independently reviewed on 2026-10-29; [full scorecard and source limits](../../reports/project1-interactive/PC2-LIVE-3D-COVERAGE-2026-10-29.md). Card challenge preceded implementation (`20261029T234230Z-92ad1a`); [card r1 resolutions](../../reports/project1-interactive/PC2-CARD-AMENDMENT-2026-10-29.md) apply. Codex owns execution; Claude is challenger. PC2 is the workstream/branch name; this implements the **WC2** step of the [browser-world roadmap](../plans/2026-10-29-atlas-browser-world-move-forward.md).

Governing intent: the [North Star charter](2026-10-23-atlas-north-star-charter.md), [fixed-world clarification](2026-10-29-atlas-multiscale-world-clarification.md) and merged [PC1 preparation boundary](2026-10-29-atlas-preparation-boundary.md). Starting point: [BW1's wider-world evidence](../../reports/project1-interactive/BW1-OBSERVER-REGIONS-2026-10-29.md) and [PC1's CPU result](../../reports/project1-interactive/PC1-PREPARATION-BOUNDARY-2026-10-29.md). This document changes neither the mathematical world nor maintained product acceptance.

## Experience and scope

A visitor flies upward, downward and sideways through newly prepared regions, contacts terrain safely, returns to the known smaller mathematical formation, changes scale there and revisits the same place. Preparation follows actual position and motion. Navigation consumes already prepared structures. An unready frontier delays movement visibly while keeping the last valid coverage.

The riskiest assumption is that the measured native preparation method can supply useful coverage along a three-dimensional flight path quickly enough, through PC1's actual render/collision readiness boundary, with bounded resources. PC1 proved a CPU protocol using recorded artifacts; this step must use live generation and real browser resources. BW1's lateral spacing cannot simply be extended into a third dimension.

Keep the original fixed world `H1C-surface-child@ee2564d40bda7ef6`, its canonical source inputs, its known fine formation and its current appearance. Mathematical detail generation, representation and approximation remain distinct. This step extends spatial preparation; it does not require a new world specimen, finer mesh or new visual formation. Application-shell integration, deployment selection, appearance and additional detail locations remain later roadmap steps.

Implementation source and documentation belong in this worktree under the project `.worktrees/pc2`. Generated geometry, run logs, profiles, screenshots and native dependency data belong under `/mnt/ml_storage/scratch`. Preserve the measured BW1/PR8 sources and evidence. Existing Plane/Space workspace behavior remains governed by its current contracts.

## Three-dimensional coverage

Use a fixed orthonormal frame `(tangent, binormal, normal)` and origin from the canonical world. Stable integer addresses `(i,j,k)` identify centers in that frame; addresses select materializations rather than define mathematical features. Initial bounded candidate: `i ∈ [-3,9]`, `j ∈ [-3,3]`, `k ∈ [-2,2]` (455 possible coarse addresses). With the smaller spacing, these lateral center ranges preserve BW1's previous physical extent while adding the third axis. Materialize on demand, not by building all addresses before flight. Record unsupported source coverage explicitly if qualification narrows this domain.

Retain coarse body diameter `D = 0.0265625 m`, axis-aligned preparation cubes of half-extent `D`, and body radius plus skin `0.501D`. Proposed lattice spacing is `0.5D` on each of the three frame axes. Stored frame vectors are `[tangent, binormal, normal]`; for each world axis, sum absolute components across those three vectors. Nearest rounding offsets each frame coordinate by at most `0.25D`, so world-axis enclosure is at most that sum times `0.25D`, plus radius/skin. The universal bound is `(0.25√3 + 0.501)D < D`. The actual maximum world-axis sum is `1.5080065201066828`, giving `0.8780016300266706D`; dot products agree with orthonormality to roundoff. Ordinary speed `0.5D/s`, speed cap `1D/s` and `dt` cap `0.05s` bound a step by `0.05D`. Include that step and `1e-8D` float slack; verify both endpoints and exact rounding ties. This geometric enclosure argument says nothing about terrain clearance.

For movement, select a prepared cube containing the entire body and proposed swept segment. Verify its incoming pose against its actual prepared collision/occupancy representation. The nearest address alone never establishes clearance. A collision or unavailable frontier is a legitimate movement outcome; no flat-ground or vertical-heightfield assumption is allowed. Terrain may block descent, so ascent/descent checks must use reachable free space rather than requiring passage through a solid floor.

Keep the original fine representation at its canonical location as a control, with its retained parent-reference dependency explicit. The containing home coarse region remains protected while fine interaction depends on it. Surrounding view uses a separately identified coarser representation and never supplies movement coverage.

## Live producer and contract adapter

Reuse PC1's strict request, artifact, result, world-reference and resource-lifecycle interfaces. Browser requests contain world identity, absolute 3D bounds, intent, requirements and execution identity. Native filenames and BW1 fixture numbers stay private to the adapter. Report actual returned bounds when satisfying a contained request. Unsupported world, bounds, intent or accuracy receives an explicit result rather than silent substitution.

The producer has a fresh instance nonce and epoch. Every native completion echoes the complete consumer request identity and producer identity. A restart or cancellation cannot make an old completion publishable. Keep native generation nonpreemptive when necessary: remove obsolete queued work and dispose late active results safely. Track the producer promise through shutdown; a timeout reports unconfirmed ownership and stops further work.

The first adapter wraps the retained parent/cutter builders and their bounded source/validation/topology caches. Its new code accepts three-dimensional origins, validates source coverage and emits an explicit classification. It must not alter the canonical mathematical module or silently reuse a parent-reference artifact for newly requested coarse terrain. The fine control retains its declared original dependency. Source digests, complete sampling policy and dependencies enter representation identity; job numbers and request order do not.

Producer metadata records cells, step, tile width, RTIN tolerance, numerical format, constructed-solid classification and qualification provenance directly. Verify those fields against actual construction and preserved source policy. Carry empirical tolerance and missing-reference limits without promoting sampled maxima to global error bounds. Target the prior region-143 completeness omission explicitly in qualification; do not erase its valid reverse checks or imply it was repaired by PC1.

Use explicit producer-side configuration for the retained native dependency bundle. Path-free world records bind the legacy ID to its content manifest; this does not claim portable generator installation. A local native helper is the development control, not a production service/backend choice.

## Browser preparation and safe publication

The browser's producer callback validates the response and exact binary lengths/digests, then returns a CPU payload lease. The consumer callback prepares actual rendering resources and, for interaction, actual collision/occupancy structures. A receipt names the compatible representation revision only after all required work completes. PC1 then grants `view-ready` or `interaction-ready`.

View intent transfers rendering buffers only and skips collision indexing, snapshots and restoration. Interaction retains explicit surface, constructed empty-air and full-solid semantics; missing data is never empty. A ready full-solid representation blocks entry. A ready lease is not automatically selected as the active region.

At handoff, recheck freshness, dependency availability, full-body/sweep coverage and incoming collision clearance. Keep the previous active region until a safe replacement is available; publish render/collision selection together. Scale changes preserve the observer position and use the existing fine control's supported transition. Delaying an unsafe or unready change is correct; relocation, tunnelling or moving a represented surface through the observer is a stop condition.

Production WebGPU ownership stays under `src/space/render/webgpu/`; numerical coverage, navigation selection and lifecycle code remain GPU-independent. A bounded experimental browser page may exercise these modules before BI1 integrates the existing application shell. Shared scene/persistence codecs gain no GPU, native or physics handles.

## Scheduling, resources and telemetry

Use a bounded queue with interaction work ahead of view work. Protect the active/dependent regions and those needed within the preparation horizon. Derive prediction from actual velocity and measured readiness, with a conservative initial horizon; record the rule and cap in the frozen card. View work cannot evict interaction source caches or displace imminent body work. A running native job may still delay the next interaction request; record that blocking time separately.

Initial proposed limits: one active native job plus two queued jobs, at most eight retained interaction regions including home/fine dependencies, and one selected view with one transient replacement. PC1 session admission must account for pending plus ready leases; a conservative shared-session maximum is 13 (eight interaction, two view and three pending), rather than using its default of eight. Freeze cache sizes, binary/GPU limits, run-output bounds and prediction parameters in the execution card before measurements. These values bound a first candidate; they are not an allocation proof or a permanent product policy.

Record request, queue, native generation, serialization/transfer, collision construction, restoration, GPU upload, ready and active-handoff stages. Report cold/process/cache state explicitly. Measure first-after-restore collision queries separately from steady queries and keep per-scale distributions. Count live CPU payloads, GPU buffers, collision objects, native caches and engine retained capacities by owner; report RSS separately. A bounded lease count alone does not establish the 1 GiB region-data target.

Retirement waits for consumers/GPU work before freeing resources, then releases producer references. Cancellation, producer failure, workspace-equivalent shutdown and stale completion must release partial/late resources or report the unresolved owner. Preserve evidence on disk under a finite run quota. Shutdown is confirmed only when owned browser, worker, server and native processes have stopped.

## Validation and stop rules

Freeze the execution card before substantial implementation and obtain the normal peer challenge. The candidate is bounded to three hours of implementation/qualification plus one hour for browser evidence and review. Record permission/review waits separately. Further review addresses material unresolved issues; it does not create new artistic or visual gates.

The card must specify the actual deterministic/input workloads and report every criterion:

| Criterion | Required evidence or target |
|---|---|
| World and reconstruction | Same fixed world/lineage; source/policy/dependency keys; resident reuse, retirement/rebuild and opposite order checked separately. |
| Live 3D coverage | Actual ascent, descent, lateral flight and reversal enter newly generated coverage beyond the old slab; full body/sweeps supported. The finite declared domain is explicit. |
| Contact and transitions | Compatible visible/collision selections, contact on generated terrain, retained fine control, safe scale/late-preparation handoffs; no observed embedding, tunnelling, relocation or surface crossing through the observer. |
| Qualification | Empirical interaction target ≤0.01 body diameters; declared view tolerance; independent source/mesh/contact checks and explicit missing-reference limits. |
| Frame rate | ≥30 FPS overall and during preparation. Report tails as diagnostics rather than inventing a frame-tail acceptance gate. |
| Navigation | p99 ≤2 ms, maximum ≤8 ms; separate scale and first/steady query results. |
| Readiness and priority | Request→interaction-ready target 1 second, all phases included; waits, late-result recovery, queue throughput and view/interaction interference measured. |
| Resources and recovery | Declared queue/cache/residency caps, owner accounting toward 1 GiB, real retirement, restart/stale-result controls and confirmed cleanup. Incomplete ownership remains unverified. |
| Process and compatibility | Registered guarded CPU tests; bounded headed installed Chrome on the maintained discrete-GPU/Vulkan profile; exclusive GPU lock and explicit handoff; preserved attempts, independent judgement and full scorecard. |

Safety, identity, required-source resolution and unconfirmed cleanup failures stop the affected candidate. Performance misses remain visible gaps when the experience works; they do not erase valid demonstrated behavior or justify inventing another mathematical specimen. Mechanical repair follows a predeclared bounded rule and preserves the failed attempt. Finite evidence is not a global geometry guarantee.

## Implementation plan and closure

The [task-level plan](../plans/2026-10-29-atlas-pc2-implementation.md) names owned files, assertions, checks and dependencies before implementation. Initial sequencing: coverage model and tests; native protocol/adapter; actual browser resource receipts; prediction/handoff ownership; bounded CPU/native qualification; hardware/input evidence and independent result review. Reuse existing project tooling and source contracts rather than inventing another application shell.

Close with the full scorecard, formally established/finite supported/unresolved tiers, process cost, representative images and the next owned action. BI1 follows with the supported application-entry experience and its own integration design/task plan. No production backend or broad acceptance-policy amendment is selected by PC2.
