# ATLAS
## North Star & Autonomous Development Charter

**Status:** Adopted by the advisor 2026-10-23 as ATLAS's governing charter. It mostly replaces the workbench charter (`2026-10-18-atlas-workbench-charter.md`); see Adoption decisions below.  
**Audience:** Claude, Codex, and project advisor  
**Purpose:** Establish the product vision, guiding principles, architectural expectations, research agenda, and collaborative development responsibilities for ATLAS.

## Adoption decisions (advisor, 2026-10-23)
- This charter governs ATLAS and supersedes the workbench charter except for the engineering invariants stated below:
  - **Numerical honesty:** where distance estimates are used, declare their category, applicability, signed/exterior-only semantics and derivation. Keep empirical validation separate from mathematical guarantees. Distinguish unresolved results and numerical failures from established hits, misses or occupancy, and record relevant approximation and precision limits. This preserves the substance of old §3.4 without requiring its particular viewport indicator. Detailed overlays may be optional; unresolved geometry still requires a defined, honestly indicated fallback.
  - **Resource management and recovery:** bound work, manage resource ownership and release explicitly, report completion truthfully, and recover without silently changing requested outputs or losing scene state.
  - **Compatibility evidence:** record the hardware, browser and launch configuration tested, report unsupported configurations clearly, and limit compatibility claims to evidence. Desktop/laptop discrete GPUs are the product target; mobile support is not required.

  Existing project specs continue to govern their implemented paths until explicitly amended. They do not mandate distance-estimated representation for new experiments. Existing acceptance requirements change only through an explicit policy amendment.
- Runtime dependencies are allowed when they make sense for ATLAS.
- Distance-estimate-only representation does not survive; representation is an engineering decision.
- Target hardware: desktop or laptop with a discrete GPU. Not mobile.
- Licence: MIT.
- The first joint deliverable is `docs/reports/north-star/2026-10-23-impact-assessment.md`, Claude/Codex, co-author READY.

---

# 1. The North Star

### Explore worlds born from mathematics.

**ATLAS is a web application for exploring procedural 3D worlds whose terrain, structure, and visual character are derived from fractal mathematics. Users can fly, walk, swim, or float through these worlds, interact with their landscapes and inhabitants, influence their appearance and ecology, and capture and share discoveries and journeys that others can revisit.**

The goal is not simply to visualize fractals.

The goal is to transform mathematical structures into places that people can inhabit, explore, experience, influence, and share.

ATLAS should make it possible to enter an extraordinary mathematical landscape and feel present within it.

A visitor might fly through a vast canyon whose walls reveal ever-finer fractal details, descend toward a river, encounter creatures moving through the environment, land on a rocky ledge, and explore on foot.

They might change the atmosphere, colors, textures, vegetation, or characteristics of the inhabitants. They might discover an extraordinary location and share it with someone who can revisit that place and experience the same underlying world.

The distinctive feature of ATLAS is that these environments are not merely handcrafted scenery or conventional procedurally generated terrain. Their underlying structures emerge from fractal mathematics.

**The fractal is the world's generative foundation, not necessarily its final visual appearance.**

# 2. Origin of the Vision

ATLAS began with an observation about a two-dimensional fractal.

At certain magnifications, fractal structures resemble recognizable geography: branching river valleys, mountain ranges, ridgelines, cliffs, and interconnected passages.

Those patterns suggest landscapes that could exist in three dimensions.

The initial inspiration was straightforward:

*What if someone could enter one of those valleys and fly along it, with fractal mountains rising on either side?*

That question expanded naturally.

What if the landscape had realistic materials, atmospheric effects, water, and vegetation? What if creatures inhabited it? What if the visitor could leave the aircraft, walk on the terrain, swim through waterways, or float among unfamiliar structures?

What if the visitor could alter the character of the world without losing its mathematical identity?

And what if discoveries and journeys could be reproduced and shared?

This is the experience ATLAS should pursue.

The original fractal explorer remains valuable as an instrument of mathematical discovery and possibly as a means of identifying locations for deeper exploration. It should not limit the broader vision to conventional fractal viewing.

# 3. Illustrative Experiences

The following examples establish intended capabilities and experiential character. They are **design scenarios, not immediate implementation requirements**.

### Scenario A: The Fractal Canyon

A visitor finds a branching region of a Mandelbrot-derived landscape that resembles a network of deep valleys.

They select a corridor and enter three-dimensional exploration mode.

Mountain walls rise on either side, their shapes determined by mathematical properties of the underlying fractal.

The visitor flies through the canyon, following its curves. Nearby rock formations exhibit progressively finer detail as the visitor approaches.

The environment features atmospheric haze, shadows, rugged stone, water, and vegetation.

The visitor can ascend above the terrain to observe the larger mathematical structure or descend to examine its smaller features.

**What this demonstrates:**
- Transformation of fractal data into navigable geography.
- Continuous, coherent movement through a mathematical environment.
- Spatial detail that adapts to observation scale.
- Believable appearance without requiring geological realism to constrain the underlying mathematics.

### Scenario B: A Living Valley

A visitor enters a valley where vegetation occupies sheltered slopes, flying creatures follow air currents, and aquatic life moves through waterways.

The inhabitants are not merely decorations. They exhibit behaviors appropriate to their environments.

A flying creature might avoid a cliff, circle above a valley, or react to the visitor's approach.

A terrestrial creature might walk over uneven ground or respond to an obstacle.

An aquatic creature might swim through a submerged passage or react to the visitor disturbing the water.

**What this demonstrates:**
- Fractal geometry participating in physical simulation.
- Interactions between terrain, objects, creatures, and visitors.
- Procedural habitats and ecological variation.
- The potential for behavioral and environmental systems that develop over time.

It does not imply that ATLAS initially needs a comprehensive biological simulation.

### Scenario C: Shaping a World

A visitor discovers a landscape with unusual mathematical structures but dislikes its current appearance.

They change the material palette from dark volcanic rock to pale sandstone, adjust the lighting, introduce vegetation, and alter environmental conditions.

They might influence the types or behaviors of creatures that inhabit the region.

The world retains its defining mathematical geometry unless the visitor intentionally changes the relevant generation parameters.

**What this demonstrates:**
- Separation of mathematical structure from visual interpretation.
- User-directed customization of procedural worlds.
- The possibility of sharing different interpretations of the same underlying mathematics.
- Clear distinctions between appearance changes, world-generation changes, and simulation-state changes.

### Scenario D: A Shared Flight

A visitor records a journey through an extraordinary fractal environment.

The recording captures the route, camera behavior, world configuration, and any events necessary to reconstruct the experience.

The visitor shares a link.

Another person opens it and follows the journey or takes control to explore nearby.

**What this demonstrates:**
- Reproducible mathematical environments.
- Portable world definitions.
- Shareable locations, camera paths, and experiences.
- Versioned generation and replay mechanisms.

Exact numerical, behavioral, and pixel-level reproducibility are different guarantees. ATLAS must define which it provides rather than treating all three as equivalent.

### Scenario E: Beyond Conventional Geography

Not every fractal world must look terrestrial.

Some may resemble caves, coral reefs, crystal formations, floating islands, impossible architectural structures, or vast interconnected mathematical sculptures.

Other environments might have unfamiliar gravity, suspended bodies of water, or nontraditional navigation.

The experience should support exploration beyond the visual conventions of Earth.

**What this demonstrates:**

ATLAS is a fractal-world exploration system, not merely a realistic-terrain generator.

# 4. Product Identity and Engineering Values

ATLAS should be guided by five principles.

### 4.1 Experience is the product

The primary measure of success is whether ATLAS enables experiences that are engaging, beautiful, surprising, and worth sharing.

Mathematical novelty alone is insufficient.

### 4.2 Mathematics is the foundation

Worlds must have a meaningful, explainable relationship to their mathematical generators.

Arbitrary noise, conventional terrain generation, and decorative procedural effects may supplement the mathematics, but should not silently replace it while being represented as fractal-derived.

### 4.3 Physical coherence matters

Visitors and inhabitants must be able to interact with environments in believable ways.

Rendering, collision, navigation, and simulation should agree on the location and properties of physical structures.

### 4.4 Exploration should reward discovery

Environments should contain interesting structure at multiple scales.

Visitors should be encouraged to investigate unfamiliar places, vary conditions, and discover phenomena they did not explicitly design.

### 4.5 Mathematical and engineering integrity are nonnegotiable

The system should remain inspectable, testable, and honest about numerical accuracy, performance, and limitations.

Existing diagnostic and precision capabilities should be preserved when useful.

The visitor experience need not expose every technical detail, but the engineering foundation must remain trustworthy.

# 5. Architectural Direction

These are conceptual responsibilities, **not mandates for five deployable subsystems, five repositories, or five rigid implementation layers**.

Claude and Codex are responsible for determining the most effective practical architecture.

## 5.1 Mathematical Generation

Defines the mathematical fields, structures, and relationships that originate a world.

Potential sources include Mandelbrot and Julia families, Mandelbox and Mandelbulb structures, iterated function systems, distance-estimated fractals, and combinations of fractal techniques.

The system should ultimately accommodate multiple generation approaches without requiring every algorithm to implement identical mathematical operations.

## 5.2 World Representation

Interprets mathematical results as spatial environments.

Possible responsibilities include:

- Surface, occupancy, elevation, and distance queries.
- Geometric interpretation and spatial topology.
- Surface normals and local features.
- Material and biome classification.
- Spatial indexing and level-of-detail representations.
- Consistent coordinate and scale management.

A two-dimensional fractal transformed into a heightfield and a three-dimensional implicit fractal may require different representations.

Do not force them into an inappropriate common model merely to achieve architectural uniformity.

## 5.3 World Simulation

Defines physical and behavioral interaction with the environment.

Possible responsibilities include:

- Collision detection and physical response.
- Gravity and rigid-body dynamics.
- Locomotion and movement constraints.
- Buoyancy and fluid interactions.
- Creature movement and behavior.
- Environmental processes.
- Temporal state and change.

Not every phenomenon requires full physical simulation. Approximation is legitimate when it produces appropriate behavior at acceptable computational cost.

## 5.4 Experience

Provides the interface through which visitors inhabit and perceive a world.

Possible responsibilities include:

- Interactive rendering.
- Camera control and exploration modes.
- Navigation and movement.
- Lighting, atmosphere, water, and materials.
- Environmental interaction.
- Appearance and world-parameter controls.
- Inspection tools and technical diagnostics.

Interactive motion and stationary inspection may use different rendering strategies.

Smooth, coherent navigation should not be sacrificed to maximize still-image fidelity.

## 5.5 Authorship, Reproducibility, and Sharing

Allows visitors to save, revisit, change, and communicate their discoveries.

Possible responsibilities include:

- World seeds and mathematical parameters.
- Generator and schema versions.
- Locations and camera configurations.
- Bookmarks and points of interest.
- Recorded paths and replay.
- Shared links and portable experience definitions.
- Persisted changes or simulation state, if supported.

A world definition, a saved viewpoint, a recorded journey, and a persistent modified world are distinct artifacts and should be modeled accordingly.

# 6. Physics as a Foundational Capability

ATLAS requires a physical interpretation of fractal geometry.

A visually detailed fractal environment is not necessarily a suitable physics environment.

The engine must eventually support stable interactions between mathematical surfaces and physical entities such as visitors, movable objects, creatures, and vehicles.

**Fundamental requirement: Rendering and physics must derive their spatial understanding from consistent world definitions.**

Their representations may differ in resolution or approximation, but must not create visibly contradictory physical environments.

### Research questions

- Can fractal distance estimators support reliable collision detection?
- How should collision handling work when an estimator is inaccurate, unsigned, discontinuous, or not conservative?
- How should physical contact be resolved against highly detailed or changing surfaces?
- Can conventional rigid-body simulation be integrated with specialized fractal collision methods?
- What physics representations are appropriate for distant versus nearby geometry?
- What happens when a world changes scale, geometry, or mathematical parameters?
- How should water, buoyancy, locomotion, and ecological behavior integrate with the physical environment?

Do not assume every fractal algorithm yields a valid signed-distance field.

Do not assume visual ray-marching techniques automatically provide robust physical collision resolution.

**A successful rolling-ball demonstration is evidence of feasibility, not proof of a general-purpose physics engine.**

# 7. Research Case Studies

The following projects should be examined as sources of evidence and engineering ideas.

Their architectures, limitations, and licenses must be evaluated before any integration decisions.

## 7.1 Marble Marcher — Physics in Fractal Environments

**Original:** https://github.com/HackerPoet/MarbleMarcher  
**Creator:** HackerPoet / CodeParade  
**License:** GPL-2.0

Marble Marcher is a playable demonstration of a marble moving through and interacting with procedurally rendered fractal environments.

It is directly relevant because it demonstrates physical gameplay involving fractal geometry rather than merely displaying a mathematical object.

### Questions to investigate

- How are fractal surfaces evaluated for collision?
- How are contact positions and surface normals estimated?
- How are penetration, stability, bouncing, and rolling handled?
- How do the physics and rendering implementations maintain consistency?
- What assumptions are specific to a spherical moving object?
- How might the techniques generalize to walking characters, vehicles, and moving creatures?
- What limits exist concerning numerical precision, performance, and complex geometry?

### Lessons to extract

Determine which techniques can be generalized, which depend on the particular fractal formulas, and which are specific to Marble Marcher's gameplay.

Do not assume the entire engine should be ported.

## 7.2 Marble Marcher Community Edition — Rendering, Performance, and Replay

**Repository:** https://github.com/WAUthethird/Marble-Marcher-Community-Edition  
**License:** GPL-2.0

The community edition expands the original project with rendering and performance improvements, configurable graphics, and work involving replay and recording.

### Questions to investigate

- Which rendering optimizations are applicable to ATLAS?
- What compromises exist between interactive rendering and high-quality stationary output?
- How is replay data represented?
- Which replay capabilities are implemented, experimental, or planned?
- What lessons apply to reproducible journeys through procedural environments?

Treat repository documentation and implemented behavior separately. Do not assume every planned feature is complete.

## 7.3 FractiX — Fractal Rendering and Collision Integration

**Repository:** https://github.com/NabilNYMansour/Unity-FractiX  
**License:** MIT

FractiX is a Unity-based ray-marching and cone-marching rendering project supporting signed-distance-field environments, collision detection, conventional polygonal geometry, and several demonstrations.

Its examples include collision detection, boid movement through a fractal environment, and time-varying fractal structures.

Its documentation identifies fuller physics response as a future capability, so it should not be treated as a mature general-purpose physics solution.

### Questions to investigate

- How are distance-field queries shared between rendering and collision?
- What is the cost of evaluating collision against the mathematical field?
- Can collision information be queried efficiently for multiple moving entities?
- How does FractiX integrate conventional geometry with implicit surfaces?
- How are boids made aware of environmental geometry?
- Which architectural ideas are portable outside Unity?

### Lessons to extract

Focus particularly on interfaces between mathematical fields, spatial collision queries, conventional geometry, and moving entities.

## 7.4 Marble Marcher WebGPU — Browser Feasibility Research

**Repository:** https://github.com/grinstead/MarbleMarcherWebGPU  
**License:** GPL-3.0

This is an early-stage effort to bring Marble Marcher concepts to WebGPU.

Its value is primarily as a browser-oriented research reference, not as evidence of a mature production solution.

### Questions to investigate

- Which fractal algorithms and rendering components have been implemented?
- Where does physics execute?
- What challenges arise when translating desktop approaches to WebGPU?
- What browser-specific limitations have appeared?
- Can relevant techniques be demonstrated in a small, independent prototype?

## 7.5 General-Purpose Physics Engines

Evaluate mature browser-compatible engines, including Rapier, as possible providers of general-purpose rigid-body simulation, constraint handling, and ordinary object collisions.

The important research question is not simply which physics engine has the largest feature set.

It is whether a mature conventional physics system can coexist efficiently and reliably with specialized fractal geometry queries.

A hybrid approach may be appropriate.

No physics-engine selection is prescribed by this charter.

## Research and Licensing Discipline

For every case study:

1. Examine actual source code and implemented behavior.
2. Distinguish demonstrated capabilities from documentation claims and future plans.
3. Identify relevant algorithms, interfaces, and limitations.
4. Evaluate browser applicability and maintenance risks.
5. Verify licensing obligations before reusing code.
6. Produce a concise findings report tied to ATLAS requirements.

GPL-licensed reference implementations must not be copied into ATLAS without deliberate license review and approval.

Studying mathematical techniques and independently implementing general algorithms is not equivalent to copying protected source code, but provenance and licensing still require care.

# 8. Technical Challenges Requiring Deliberate Investigation

The project should acknowledge these difficulties rather than build around unverified assumptions.

### 8.1 Mathematical-to-spatial interpretation

There is no universal transformation that turns arbitrary fractals into convincing terrain.

Different generators may require different spatial interpretations. The quality of those transformations will strongly influence the resulting experience.

### 8.2 Precision and scale

A mathematically deep zoom does not automatically translate into infinitely navigable 3D geometry.

Coordinate precision, numerical stability, floating-point behavior, and representation changes require deliberate solutions.

### 8.3 Performance during movement

Interactive navigation requires sufficiently consistent frame times and spatial coherence.

Rendering should adapt to movement, viewpoint, proximity, and available hardware resources.

### 8.4 Adaptive physical detail

Full physical fidelity across every visible fractal feature is infeasible.

ATLAS must determine which detail requires simulation, which can be approximated, and how those representations transition without destabilizing physical objects.

### 8.5 Living systems

Ecology may eventually range from static procedural habitats to simulated populations and environmental change.

The architecture should avoid prematurely excluding richer systems, but should not implement an elaborate ecosystem simulator before simpler behaviors prove useful.

### 8.6 Reproducibility

World generation should be deterministic where feasible.

A shared experience may additionally depend on engine versions, numeric implementations, recorded inputs, simulation state, asset definitions, and runtime conditions.

The project must explicitly define what can be reproduced and under which conditions.

### 8.7 Browser constraints

ATLAS is a browser application.

GPU capabilities, memory limits, CPU/WASM performance, threading restrictions, shader portability, and platform differences must be incorporated into architectural decisions.

Desktop-only demonstrations are research evidence, not automatically viable implementation foundations.

# 9. Development Strategy

The project should advance through **experience-oriented proofs**, not a fixed sequence of infrastructure projects.

Claude and Codex must propose and maintain their own roadmap, subject to the following progression goals.

### Stage 1 — Prove a Fractal Landscape Can Be Inhabited

Produce a convincing fractal-derived valley or equivalent navigable environment.

The visitor must be able to enter it, move through it, perceive depth and scale, and inspect nearby details.

The environment should retain a meaningful mathematical relationship to its generator.

**Success criterion:** It feels like entering and traveling through a place, not maneuvering around a displayed fractal object.

### Stage 2 — Prove Physical Interaction

Introduce a moving physical entity that interacts reliably with fractal geometry.

A rolling sphere may be an appropriate initial demonstration, building on the Marble Marcher precedent.

Extend the demonstration toward reliable grounding, movement, and collision appropriate for visitors and other objects.

**Success criterion:** Physical interactions agree sufficiently with visible geometry and remain stable under representative movement conditions.

### Stage 3 — Prove Environmental Expressiveness

Demonstrate meaningful control over materials, lighting, atmosphere, appearance, and environmental classification.

Changing the appearance should not inadvertently change the mathematical world unless explicitly intended.

**Success criterion:** Two visually distinct environments can share the same underlying mathematical structure.

### Stage 4 — Prove Reproducible Exploration

Support saving and revisiting locations, world configurations, and eventually journeys.

**Success criterion:** A shared artifact can reconstruct the promised aspects of an experience in a compatible application version.

### Stage 5 — Prove an Inhabited World

Introduce simple entities that move through and interact with the environment.

Begin with bounded, understandable behaviors before progressing to complex ecology.

**Success criterion:** Creatures or objects behave as occupants of the environment rather than animations disconnected from it.

These stages represent capabilities to demonstrate, not necessarily independent releases or a strict execution order.

Claude and Codex should adjust sequencing based on evidence, dependencies, and the existing codebase.

# 10. Autonomous Collaboration Model

ATLAS is also an experiment in collaborative AI software development.

The project advisor intends to define the destination, provide feedback, clarify product intent, and review consequential decisions while allowing Claude and Codex substantial engineering autonomy.

**Claude and Codex are expected to collaborate as engineering peers, not merely divide coding assignments.**

### Responsibilities of Claude and Codex

Both agents should:

- Develop and challenge architectural proposals.
- Research alternatives before making expensive commitments.
- Review each other's assumptions and implementations.
- Design and implement software.
- Validate behavior through tests and actual execution.
- Identify incorrect assumptions and technical dead ends.
- Maintain coherent technical documentation.
- Reassess designs when evidence contradicts previous decisions.
- Propose features and improvements consistent with the North Star.
- Communicate material risks, tradeoffs, and unresolved questions.

They should not rely on the advisor to resolve ordinary technical questions.

### Collaboration expectations

Important architectural decisions should receive an independent technical challenge.

That does not mean every implementation decision requires two approvals or that both agents must do every task.

Use independent review proportionally to the cost and risk of the decision.

Disagreement is valuable when it exposes uncertainty. It should lead to evidence gathering, a bounded experiment, or a documented tradeoff.

### Decision authority

**Agents may decide independently:**
- Internal implementation details.
- Library usage consistent with approved constraints.
- Refactoring and localized design choices.
- Test strategy and performance experiments.
- Work sequencing within approved objectives.
- Reversible technical decisions.

**Advisor review is required for:**
- Material changes to the product vision.
- Major architectural commitments that are expensive to reverse.
- Significant scope expansions.
- Technology or licensing changes with substantial project consequences.
- Decisions that materially compromise the user experience or mathematical integrity.
- Acceptance of important unresolved risks.

When appropriate, the agents should present a recommended decision rather than simply asking the advisor what to do.

# 11. Controls Against Unproductive Complexity

The most important failure mode to avoid is confusing sophisticated engineering with product progress.

Before undertaking a significant effort, ask:

**How will this work move ATLAS closer to an inhabitable, interactive, fractal-derived world?**

Every substantial initiative should identify:

1. The specific experience or capability it enables.
2. The currently demonstrated limitation it addresses.
3. The smallest credible approach to testing the proposal.
4. A measurable success criterion.
5. Conditions under which the effort should stop, change direction, or be abandoned.

### Avoid these failure patterns

**Architecture without demonstrated need:** Building generalized frameworks for hypothetical future requirements.

**Mathematical novelty without experiential value:** Adding fractal algorithms that do not advance navigation, interaction, beauty, or discovery.

**Renderer tunnel vision:** Maximizing image quality while neglecting spatial interaction and movement.

**Premature simulation complexity:** Designing sophisticated ecological or physics systems before proving simpler forms of environmental interaction.

**Technological momentum:** Continuing with an approach because substantial effort has already been invested.

**Unverified assumptions:** Treating a compelling demonstration as evidence that its techniques generalize to unrelated requirements.

**Unbounded research:** Continuing investigations indefinitely without a decision, experiment, or actionable finding.

### Preserve what already works

The current ATLAS implementation is an asset, not an obstacle to be discarded reflexively.

Existing mathematical, rendering, appearance, precision, caching, diagnostic, and exploration capabilities should be evaluated for reuse.

Significant replacement decisions require evidence that adaptation is less viable than redesign.

# 12. Validation and Evidence

Each meaningful development increment should produce evidence of progress.

Depending on the work, this may include:

- A functioning interactive demonstration.
- Screenshots or recorded navigation.
- Performance measurements.
- Collision stability tests.
- Numerical accuracy checks.
- Determinism and replay tests.
- Cross-browser compatibility results.
- Comparative experiments between candidate approaches.

Tests and measurements should be representative of real usage.

A demonstration that works only at one location, one zoom level, or one camera angle is not proof of a general solution.

Failed experiments are legitimate outcomes when they produce useful evidence and lead to better decisions.

Claims of success should be accompanied by what was tested, the environments tested, and what remains uncertain.

# 13. Engineering Decision Records

For decisions with material architectural impact, maintain a concise record containing:

- Problem being addressed.
- Relevant product requirement.
- Alternatives considered.
- Evidence gathered.
- Decision and rationale.
- Consequences and known limitations.
- Reversal cost.
- Conditions that would justify reconsideration.

Avoid excessive documentation for routine matters.

The purpose is to preserve architectural reasoning and prevent repeated rediscovery, not to create bureaucracy.

# 14. Advisor Communication Protocol

The advisor should receive periodic summaries of meaningful progress rather than exhaustive implementation transcripts.

Each summary should answer:

**What can ATLAS do now that it could not do before?**

**What evidence shows that it works?**

**What have we learned that changes our understanding of the problem?**

**What are Claude and Codex planning next, and why?**

**Are there consequential decisions requiring advisor input?**

When escalation is necessary, provide options, tradeoffs, evidence, and a recommendation.

Do not transfer an unresolved engineering investigation to the advisor merely because the agents disagree.

When significant uncertainty remains, recommend the smallest practical experiment capable of reducing it.

The advisor is entitled to override decisions, redirect priorities, or require additional investigation. That authority should not become a dependency for routine engineering progress.

# 15. Open Product Questions

Several topics remain intentionally open.

- Should worlds be temporarily influenced, persistently modified, or both?
- How extensively should procedural creatures and ecosystems evolve over time?
- How should arbitrary mathematical depth relate to perceived world scale?
- What guarantees should accompany a shared location or replay?
- How should different fractal families map to different world geometries?
- What relationship should exist between conventional 2D fractal exploration and immersive 3D exploration?
- How should users create, modify, and share new world-generation configurations?

Claude and Codex should investigate these questions when they become relevant to actual architectural decisions.

An unanswered question does not automatically justify delaying unrelated development.

# 16. The Definition of Progress

The measure of ATLAS is not the number of supported fractal algorithms, the size of its codebase, or the sophistication of its internal systems.

Progress is demonstrated when visitors gain new ways to explore, understand, influence, inhabit, and share mathematically generated environments.

The first convincing flight through a fractal canyon is more valuable than an elaborate architecture incapable of producing one.

A stable physical interaction with a fractal surface is more valuable than a speculative general-purpose physics framework.

A simple creature that convincingly navigates the environment is more valuable than a complex ecological model that cannot be experienced.

An easily shared discovery is more valuable than an ambitious persistence system with no meaningful content to share.

This does not diminish the importance of robust engineering. It establishes why that engineering exists.

# 17. Standing Instructions to Claude and Codex

The following instructions govern future ATLAS development:

**Understand the destination.** ATLAS is intended to become an immersive, interactive exploration platform for inhabitable worlds derived from fractal mathematics.

**Exercise engineering independence.** Propose, debate, research, implement, test, and refine solutions without routinely requiring the advisor to prescribe them.

**Challenge one another.** Independent reasoning and constructive technical disagreement should improve decisions.

**Validate before generalizing.** Prefer concrete, measured demonstrations over speculative abstractions.

**Protect architectural flexibility.** Design around demonstrated responsibilities and viable extension points, not hypothetical universality.

**Keep the world coherent.** Mathematical generation, spatial representation, rendering, physics, and interaction must remain compatible.

**Maintain scientific integrity.** Be explicit about approximations, accuracy, deterministic behavior, and limitations.

**Preserve useful work.** Evolve the existing application thoughtfully rather than discarding it without evidence.

**Escalate consequential decisions.** Present recommendations supported by analysis, not unstructured requests for direction.

**Make progress visible.** Every significant increment should produce an observable capability, a meaningful risk reduction, or a defensible finding.

**Remain willing to change course.** A technical direction that does not advance the North Star must be reconsidered, regardless of prior investment.

---

# 18. Final Direction

ATLAS should ultimately allow someone to discover a mathematical world, enter it, travel through it, experience its physical and living environments, influence its character, and share the journey.

The specific architecture, algorithms, and implementation methods are open to engineering discovery.

Claude and Codex have the opportunity—and responsibility—to find a workable solution through collaborative design, experimentation, implementation, and critical review.

The advisor will help protect the vision, challenge assumptions, and make consequential product decisions.

**The mission is not to build the most elaborate fractal renderer.**

**The mission is to make mathematics somewhere you can go.**
