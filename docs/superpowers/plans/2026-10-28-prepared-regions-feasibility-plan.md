# Prepared regions: feasibility experiment

> **Subsequent engineering correction, 2026-10-29:** future generation and scale-transition design follows the [fixed-world multiscale clarification](../specs/2026-10-29-atlas-multiscale-world-clarification.md). The original preparation/approximation experiment below does not by itself test additional mathematical structure at smaller scales. Its frozen criteria and historical outcomes remain separate.

**Status:** Proposed experiment; no implementation or measured result yet. The advisor has clarified the architectural direction: preparing a region should make it ready for rendering and interaction. This plan tests a concrete implementation of that direction, not a product default.

**Owner:** Codex. **Independent challenger:** Claude. Governing document: [ATLAS North Star charter](../specs/2026-10-23-atlas-north-star-charter.md). Evidence baseline: [BS1 closure](../../reports/project1-interactive/BS1-SCHEDULING-2026-10-28.md). Earlier precedent: [impact assessment, shared rendering/collision surface](../../reports/north-star/2026-10-23-impact-assessment.md).

## Experience and riskiest assumption

A visitor approaches the existing H region, encounters its walls and openings, enters finer detail, turns back and revisits it. Nearby geometry is prepared before it is needed. Navigation uses an existing collision representation and does not evaluate the fractal or refine mathematical occupancy evidence.

The riskiest assumption is that a coherent surface and its collision index can be built, refined and retained cheaply enough to keep ahead of exploration. Fast collision queries alone do not establish feasibility. Preparing the current expensive box-classification process in advance does not establish it either.

## Scope and boundaries

- Use the actual H1C parent/child/grandchild construction and H_contact/H_edge locations. Include one ordinary terrain region as a control. Do not replace the hard fixture with a flat floor or single heightfield.
- Test a bounded neighborhood at three observer scales: the existing contact body size, one quarter of that size, and one sixteenth. These are relative experimental scales, not a fixed world-space detail cutoff or a claim about unlimited depth.
- Initially render and collide against exactly the same generated triangles and world transform. Simplified collision proxies would introduce another hypothesis and are outside this first experiment.
- Preserve the generator, its parameters, significant openings and mathematical provenance. An unresolved evaluation remains unresolved. It cannot silently become a vertex height, solid material or empty space.
- Keep geometry generation separate from navigation. Preparing an acceleration structure does not precompute every possible contact; a movement request still performs a cheap geometric sweep.
- The existing ray-based renderer produces images and depth samples, not a reusable complete surface. A camera depth image cannot stand in for collision geometry around and behind the observer. Include surface construction and any renderer adaptation in the cost and engineering budget.
- This is a scratch experiment. It does not amend existing certification or product acceptance requirements. Approximation to the underlying field and collision correctness against the prepared representation are distinct claims.

## Candidate and selection rule

Start with local triangle patches and a collision library's spatial acceleration structure. H1C exposes a parent surface and cutter floors/caps in local coordinate systems. Investigate reusing that structure to sample surfaces in two dimensions, resolve their intersections and assemble the exposed boundary, rather than sampling every point in a dense three-dimensional volume.

The difficult part is surface assembly: cutter intersections, narrow openings, borders and uncertain samples. First inspect the existing generation artifacts for reusable samples and topology. Do not assume field-value caches already provide a surface.

If the source inspection shows that patch intersections require a substantial new geometry system, record that reason and select one bounded local volume-to-surface approach instead. Select before the timed build, using source evidence and a work/memory estimate. Build one candidate in this experiment; preserve the other as an unmeasured alternative. A failed patch implementation does not establish that every representation is infeasible.

Use an existing static-mesh collision implementation rather than writing a new collision engine. Rapier is a candidate, not a dependency decision; its documented mesh and character-controller capabilities fit the required query shape. Confirm environment compatibility, version and licence before selecting it. See [colliders](https://rapier.rs/docs/user_guides/javascript/colliders/) and [movement queries](https://rapier.rs/docs/user_guides/javascript/character_controller/).

## Experimental criteria

These are proposed feasibility thresholds, not previously measured performance or changed product acceptance. Freeze them, the hardware/browser profile, world hashes, fixture bounds, paths, body dimensions, tolerances, sampling rules and implementation version before measurement. Do not relax them after seeing results.

| Property | Initial gate |
|---|---|
| Navigation independence | Zero fractal evaluations, surface construction or mathematical occupancy refinement from movement queries |
| Collision cost | p99 at most 2 ms and maximum at most 8 ms per movement update on the recorded test machine |
| Presented motion | Two-minute replay at 1280×720: p95 presented-frame interval at most 33 ms; none above 100 ms after a fixed, recorded warm-up; report internal resolution |
| First usable neighborhood | At most 5 seconds from an empty region cache, including evaluation, surface construction, index construction and transfer/publication |
| Preparation ahead | Every newly required region ready before entry on the frozen supported paths; use a two-second lookahead and target preparation within one second of scheduling |
| Working set | At most 1 GiB of CPU region data plus GPU region allocations, including old/new overlap and build buffers; report process RSS separately and accounting omissions explicitly |
| Collision behavior | No observed tunnelling, unintended crossing, unsupported floor or embedded visitor in the frozen tests; contact discrepancy against the shared surface at most 1% of body diameter |
| Geometric fidelity | Sampled displacement from an independently evaluated finer reference at most 1% of body diameter, with the named walls/openings retained; report reference uncertainty and unresolved coverage |
| Reuse | An unchanged resident region requires zero new field evaluations or collider rebuilds on revisit |

Freeze two movement speeds in body diameters per second before implementation: ordinary exploration and a faster supported traversal. Derive them from existing navigation settings where available; otherwise state the chosen experimental values and why. Record their absolute speeds at each scale. Freeze prediction from present position, speed and direction only; it cannot read future replay inputs. The lookahead is a scheduling horizon, not permission to fabricate geometry when preparation misses it.

These thresholds establish bounded feasibility on one machine and corpus. Finer-reference agreement is sampled evidence, not a mathematical enclosure proof or a guarantee that every sub-resolution feature is preserved.

## Ordered work and gates

### 1. Freeze the geometry contract and smallest specimen — up to one hour

Extract a bounded specimen around the saved H_contact failure, retaining relevant cutter intersections and a neighboring opening. Record which surfaces should exist, which reference evaluations are resolved, and the declared approximation at each scale. Select the preparation algorithm and collision implementation using the rule above. Record the input hashes, routes, reference sampling points and all experimental parameters.

The owner and challenger independently assess the proposed method's largest likely failure before reviewing each other's positions. A small scratch experiment needs proportional review, not multiple rounds by default.

**Stop:** if no bounded surface-building method or meaningful fidelity reference can be specified within the time budget, report unresolved feasibility and the missing capability. Do not start a generic meshing framework.

### 2. Build one region, then query it — up to three hours

Build the specimen from a cold cache. Measure field evaluation, surface assembly, collider/index construction, memory allocation, data transfer and publication separately, as well as total elapsed time. Include unresolved samples and rejected regions in the results.

Check surface connectivity, shared-edge positions and winding, relevant openings and agreement with the finer reference. Compare ordinary terrain with H_contact/H_edge. Do not infer correctness merely from a plausible image.

After preparation, disable or instrument access to the field evaluator and occupancy-refinement code. Exercise movement sweeps, grazing contact, corners, narrow openings, high-speed wall approaches and starts immediately outside a surface. Verify collision results independently against the saved triangle geometry on a fixed sample, without relying only on the chosen engine's own result.

**Stop:** if useful geometry cannot be prepared within the cold-start/memory/fidelity gates, or collision requires renewed field investigation. Faster queries cannot compensate for failed preparation. Preserve partial results and identify the failing stage.

### 3. Add preparation ahead and detail transitions — up to two hours

Use adjacent regions and two resident detail levels. Build new regions in bounded jobs, reuse shared samples where valid, and prioritize reachable nearby space, including off-screen areas. Rendering and collision consume the same region revision. Keep the current valid representation until the replacement is ready; account for both in peak memory.

Exercise approach, entry, seam crossing, refinement near contact, reversal, lateral movement and revisit. Include sudden direction changes and a deliberately late preparation job. On a missed preparation deadline, retain valid geometry or defer entry into an unready area with an honest loading state; never classify unknown space as solid or empty. Such a stall is counted and cannot pass the normal-route readiness gate.

A finer replacement must not create a gap or place the visitor inside a new surface. Define and test the activation condition before swapping; delaying unsafe activation is allowed, but missing required detail is recorded. Permanent retention of coarse detail cannot count as successful refinement.

Measure foreground frame times while preparation is active. GPU work, CPU work, transfer and allocation can contend even when jobs run in the background. A fast isolated build is insufficient. Preserve navigation and build traces on one time axis, with region request/ready/entry/retirement events.

### 4. Independent review and decision — up to two hours

Preserve cold and resident-cache runs separately. Use three fixed replays after one declared warm-up; retain all attempts and report each run and the distribution. Correct mechanical failures only under a bounded repair rule, preserving failed attempts. Do not tune parameters until the desired verdict appears.

The challenger checks the decisive geometry, timings and memory accounting independently. Record the process cost and which checks changed the conclusion. Close with one of:

- **Feasible on the tested scope:** all preparation, fidelity, movement, transition and resource gates pass. Propose broader qualification, not immediate product adoption.
- **Partial:** static prepared collision works, but preparation ahead, fidelity or scale transitions do not yet pass. Identify the exact missing capability.
- **Candidate rejected:** the chosen representation or builder fails a frozen gate. Preserve useful components; identify what a different candidate would have to change.
- **Inconclusive:** the time budget or unavailable evidence prevents the decisive test. Do not relabel this mathematical impossibility or success.

## Execution limits and evidence

Maximum eight hours of engineering, measurement and review; stop earlier at a decisive failed gate. Setup and renderer adaptation count. Per-process bounds and cleanup ownership must be recorded before launches. Browser/GPU work follows repository lock, handoff and headed-browser requirements; no software/headless result substitutes for the specified visual evidence.

Use `/mnt/ml_storage/scratch/` for new implementations and measurements. Preserve existing LO1/ID1/BS1 artifacts and optimizations. No product-source replacement, commit, push or merge is part of this plan. An experiment report belongs in `docs/reports/project1-interactive/` and must include source hashes, inputs, all attempts, timing traces, geometry/reference checks, screenshots or video where useful, memory accounting and confirmed cleanup.

Claude's review is not yet performed. The earlier additional external BS1 message was rejected by automatic approval review; this plan has not been sent through that route. Do not claim peer agreement or bypass that restriction. Local preparation of this plan is complete; arranging any needed external review is separate from the technical feasibility result.
