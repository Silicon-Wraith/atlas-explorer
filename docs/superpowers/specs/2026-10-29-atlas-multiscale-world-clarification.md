# ATLAS multiscale world: corrected engineering interpretation

**Status:** Owner's corrected engineering interpretation of the existing North Star, 2026-10-29, following advisor correction. The charter already establishes multiscale discovery and a coherent mathematical world; it did not need a new requirement to explain this. The error was reducing that requirement to mesh refinement. The constraints below guide the next design; they select no meshing algorithm, recursion scheme or production backend and establish no new implementation result. Governing document: [North Star charter](2026-10-23-atlas-north-star-charter.md), especially §§4.2–4.4, 5.1–5.2, 6 and 8.2–8.4. The earlier charter insertion has been withdrawn; this note records the engineering correction.

## Product requirement

Exploring ATLAS at different scales should reveal additional geometric structure derived from the mathematics defining the world, analogous to discovering mathematical features while zooming into the 2D Mandelbrot set. Both observations belong to the same fixed mathematical world. Observer size, viewpoint and generation order affect which parts are evaluated and represented, not which world exists.

Three responsibilities must remain distinct:

| Responsibility | Meaning |
|---|---|
| Mathematical detail generation | Evaluate the world's fixed construction at the relevant location and scale, including formations or topology not explicitly represented at a larger scale. |
| Geometric representation | Construct an appropriate local mesh or another spatial representation of those results. It may be built anew and need not subdivide or preserve the connectivity of a previous mesh. |
| Representation accuracy | Choose sampling, numerical precision, simplification and collision tolerances sufficient for the requested interaction and view. More triangles alone do not establish additional mathematical structure. |

A generated surface becoming the domain for smaller formations is one candidate construction. The recursive relationships must be part of the fixed world definition. This clarification neither requires every generator to be recursive nor assumes every scale introduces another subtractive cutter.

## Consequences for design

**Generation and identity.** Define formations by stable mathematical locations/domains and construction lineage, including generator version and parameters. For a recursive candidate, specify how child location, orientation, physical scale and composition follow from its parent. The parent domain may be defined mathematically or by a canonical deterministic generation procedure; it must not depend on transient render-mesh triangle indices, the current tessellation, camera history or cache contents. A requested evaluation scale or depth is not a replacement world identity. Finite materialization of a fixed construction is compatible with a fixed world; unlimited depth or affordable evaluation is not thereby proven.

**Caching.** Distinguish identity of mathematical content from identity of its prepared representation. Generation dependencies include world definition, stable domain/location and relevant construction depth or feature lineage. Representation dependencies additionally include spatial coverage, selected mathematical content, builder version, sampling/precision/tolerances, coordinate transform and render/collision approximation policy. Body diameter can affect coverage, normalization and accuracy requirements without reseeding or redefining the world. Cache reuse requires those dependencies to match. Eviction removes a materialization, not the feature's identity. Revisiting or discovering a child before its surroundings must recover the same promised structures within declared numerical/reproducibility limits.

**Preparation and interaction.** Preparing a region includes the mathematical structure needed for its intended view and movement, visible geometry and compatible collision data. Navigation consumes this preparation through inexpensive spatial queries. It does not initiate recursive mathematical discovery during a movement frame. Rendering and collision may use different representations, but must agree on occupied space and physical surfaces within declared tolerances and share compatible generation provenance.

**Transitions.** Treat a scale transition as a change in prepared coverage and approximation of the same world. Newly represented formations may alter the mesh topology, so a vertex-morph-only transition cannot be assumed. Prepare the relevant neighborhood before it is entered, check incoming body clearance and the movement corridor, validate joins/dependencies, and coordinate publication of rendering and collision revisions. Preserve valid coverage until the handoff is safe. Delaying an unsafe or unready transition is legitimate and must be reported; teleporting the observer, reseeding the region, or moving a surface through the body is not a successful transition. Omitting an unprepared feature is not permission to call its space known empty.

Purely subtractive constructions preserve clearance for an unchanged body/pose if successive exact solids are nested. This is a useful property to investigate for that construction, not a universal assumption or an automatic property of independently approximated meshes.

## Effect on the current experiment

PR7 compared a coarse mesh with more accurate evaluation of the same finite parent/child/grandchild construction. Its three-pixel correspondence-displacement proxy measured approximation discrepancy. It did not establish or refute multiscale mathematical detail generation. Its invalid camera placements and unmet frozen criteria remain failures; this clarification does not award a pass or authorize a blind finer build. See [PR7 diagnosis](../../reports/project1-interactive/PR7-DIAGNOSIS-2026-10-29.md).

The next bounded experience experiment must name a mathematical feature and its world identity before choosing a mesh. For a recursive candidate, demonstrate that the feature follows from the fixed parent/child rule, then verify it from a reachable view and contact route. Evidence must separately address:

1. Additional mathematical structure at the selected scale, independently checked against that construction; measure the feature itself rather than requiring a discrepancy between approximations.
2. Stable feature identity and placement across observation scales, generation orders, and eviction/rebuild, with explicit numerical limits.
3. Appropriate prepared render/collision representations and consistent contact at that feature.
4. Safe transitions in both directions, including near-contact and late-preparation cases, without displacement through the observer.
5. Bounded preparation and navigation costs under criteria frozen before execution.

This is the direction for the next card, not a completed card or an implementation commitment. Recursive construction details, topology/overlap rules, accuracy guarantees and measured preparation costs remain engineering questions. The broader BW1 implementation remains deferred while this experience test is redesigned. Existing product acceptance policies remain in force.
