# ATLAS — North Star Impact Assessment and Collaboration Protocol

**From:** Claude and Codex (joint deliverable; co-author review READY, 2026-10-23)
**Responds to:** `ATLAS_Governing_Charter_Proposal.md` and the storyboard. The storyboard is a set of conceptual targets, not evidence of feasibility.
**Basis:** source inspection of `main` at b7eb347 and `feat/project1b1x` at f7e390e (their `src/` trees are identical), Historical 1b.1 measurements are background evidence only; they do not establish performance for the proposed landscape. No new GPU runs were made for this document. External case studies and licences have not yet been verified.

---

## 1. What already supports the North Star

| Asset (where) | How it serves inhabitable worlds |
|---|---|
| Plane: precise coordinates and perturbation evaluation (`src/plane/math.js`, `perturbation.js`) | Selects and samples a source region: the storyboard's "from 2D exploration…". It provides smooth escape values and stripes, not distance estimates. It does not define terrain by itself. |
| Space camera, flight, gamepad (`src/space/camera.js`, `flight.js`, `gamepad.js`) | Movement and viewing already work: perspective camera, keyboard, pointer and gamepad flight. |
| WebGPU rendering: drafts while moving, settled refinement, shadows, AO, explicit failure reporting | Reusable lighting and quality machinery. Whether it suits continuous near-surface travel is **unmeasured**. |
| Versioned scenes, Discoveries, scene files (`src/shared/scene.js`, `discoveries.js`, `persistence.js`) | Foundation for revisiting places. This is not yet a guarantee of identical pixels, behaviour or results across GPUs. |
| Existing geometry/appearance separation (`src/space/render/keys.js:7`, `:15`) | Supports changing appearance independently of geometry (Stage 3). X01 composition work is separate; see §7. |
| Numerical verification, tracked memory, recovery, honest reports | §4.5 integrity. These are kept as engineering foundation; they need not be visible in beauty views. |

## 2. What materially conflicts

1. **The current charter prescribes the representation for its first release.** The workbench charter prescribes distance-estimated surface rendering and excludes meshing from the first release, rather than forever (§3.3, lines 79 and 100). Runtime dependencies default to zero but are explicitly permitted when justified by a later spec (§3.8, line 195). We should amend the representation constraints explicitly for the experiment; there is no unconditional dependency ban.
2. **Flight has no physical body.** `flightStep` moves the camera without consulting geometry. The "camera outside the surface" status is a diagnostic, not a collision response (`camera.js:452`, `workspace.js:441`).
3. **Today's fractal estimators are not collision distances.** Mandelbulb and quaternion Julia use exterior-only heuristic estimates. Box and Menger are exact but exterior-only. Only the sphere is exact and signed. An unescaped orbit does not establish solid occupancy.
4. **The geometry is bounded objects viewed from outside**, and the rendering defaults favour still inspection: half-resolution drafts in motion, refinement when still. Neither is a prerequisite problem for a first bounded landscape, but both matter for travel.
5. **Process weight.** The existing acceptance process is elaborate; its share of development effort has not been measured here. Future experiments should use proportional verification (see §5).

## 3. What is missing
- An explicit fractal-to-landscape mapping, and physical scale and contact semantics.
- Grounded locomotion (land, walk) and collision. Water, atmosphere including fog, and inhabitants. Enabled fog is rejected in the inspected Space implementation (`src/space/scene-adapter.js:98`).
- Journey recording and replay, and shareable Space links.
- World creation as a first-class experience (charter, advisor addition 2026-10-23: "as rewarding as exploring"). Today a world is defined by editing parameters in a panel; choosing a Plane region, shaping its mapping and authoring a world's look need their own experience.
- A broader product compatibility target beyond the existing reference workstation (see §6).

## 4. The experiment: first flight into a Mandelbrot valley, then landing and walking

**Hypothesis under test:** a documented Mandelbrot scalar field (smooth escape, appropriately shaped), sampled over a region chosen in Plane, yields a heightfield with connected valleys that read as a place at human scale. Whether it does is **unverified**.

**Method:** a bounded patch. The mapping, sampling resolution and physical scale are frozen before measurement. Render and collide against the same triangulated surface with the same world transform. This removes an intentional representation mismatch; contact correctness and stability still require testing. Camera, input and scene machinery are reused where practical. The new representation stays experimental, on a scratch branch without a product acceptance gate.

**Phase A, flight:** isolates the visual and geographic hypothesis.
- Success: at three distinct Plane regions, a continuous flight below the surrounding ridges, deviating freely from a recorded route.
- Success: over a two-minute flight in each region, p95 presented-frame interval ≤ 33 ms at 1280×720 output, with no interval above 100 ms after a fixed warm-up. Record the internal rendering resolution, quality settings and presentation measurement method; full internal resolution is not required.
- Success: both peers independently judge the recorded flight to make depth, scale and nearby detail legible, recording their reasons. Advisor feedback is invited at the milestone; it is not a prerequisite for Phase B.
- Success: save and reopen restores the same surface and viewpoint.

**Phase B, land and walk:** runs only if A succeeds.
- Success: a minimal grounded walker repeatedly lands, stops and traverses permitted slopes at three locations in the primary region, without tunnelling. Avatar height, supported movement speeds and slope limits are frozen before testing; contact error is measured against the shared triangle surface, with a limit of 1% of avatar height.

**Stop rules (time-boxed: five working days in total):**
- Reject *the mapping* if at most two documented mapping variants cannot produce connected, traversable, interesting terrain without hand-sculpting its geography.
- Reject *the implementation* if it misses the motion or contact criteria at the frozen resolution.
- Record whether the mapping, the implementation or the available evidence failed the criteria. Exhausting the time limit can leave a hypothesis unresolved. Do not widen into a renderer rewrite. A Phase A pass without a Phase B pass is partial evidence, not completed inhabitation.

**Ownership:** for this spike, Claude owns prototype implementation and browser/GPU measurements. Both peers contribute to the technical design; Codex leads the independent challenge of the mapping and contact approach, reviews the implementation and tests, and independently checks decisive evidence. This assignment is specific to this initiative. Caves and overhangs are outside the heightfield experiment; its findings determine the next question.

## 5. Collaboration and decision protocol
1. **Start from one observable experience** and the riskiest assumption behind it.
2. **Owner and challenger.** Each initiative has one owner, who designs, builds and measures, and one challenger, who looks for the flaw or the simpler path and independently checks the decisive evidence. Roles rotate per initiative.
3. **State criteria before building.** A substantial initiative opens with a short card: the experience it enables, the limitation it addresses, the smallest test, the success criteria, a time limit and a stop rule.
4. **Decide by reversibility.**
   - Reversible choices: the owner decides.
   - Consequential choices: each of us writes an independent position first.
   - A disagreement gets the smallest discriminating test, not a longer argument. Evidence wins in either direction.
   - A short note records consequential decisions: evidence, choice, limits, and what would trigger reconsideration.
5. **Dead ends are findings.** At a stop rule the owner writes what was tried, what failed and what comes next. Either of us may abandon an approach; the other may challenge.
6. **Proportional process.**
   - Scratch experiments require no product acceptance gate. They retain bounded execution, exclusive GPU use, preserved evidence and confirmed cleanup.
   - Product verification follows behavioural impact, including camera, scheduling and resource-management changes that can affect rendering without changing shaders.
   - The recorded acceptance policy is amended before its requirements are replaced.
   - We keep the verbatim exchange log; it is cheap, and it is the advisor's window into our reasoning.
7. **Advisor contact.**
   - At milestones the advisor gets a summary covering: what ATLAS can do now, the evidence, what we learned, what's next and why, and any decisions needed.
   - We escalate material product-intent changes, expensive commitments, consequential licensing decisions, acceptance of important unresolved risks, and necessary external permissions, with a recommendation where a decision is needed.
   - Disagreements between us are settled by experiment, not escalation.

## 6. Charter, devices and licence: advisor decisions (2026-10-23)
- **Charter succession.** The new charter mostly replaces the workbench charter. Runtime dependencies are allowed when they make sense for ATLAS. Distance-estimate-only representation does not survive. We record which old rules carry forward (numerical honesty, resource management, browser compatibility) in the succession note.
- **Target hardware.** Desktop or laptop with a discrete GPU. Not mobile. The spike measures on the reference workstation, with its configuration recorded. Laptop-class discrete GPUs are a compatibility target for product work.
- **Licence.** MIT (`LICENSE:1`), confirmed. GPL references remain study material unless a reviewed decision says otherwise.

## 7. In-flight work
- **X01** (schema, conversion and cache contracts) passed its full gate on candidate fd9aef4 (20/20 suites, cleanup confirmed; record `/mnt/ml_storage/scratch/1b1x-acceptance/X01-gate-20261023T191506Z/2026-10-23T19-15-12-198Z-fd9aef437a2c.json`) and was promoted tree-identically to `feat/project1b1x` at 383e104. It is outside the pinned baseline inspected for §§1–3; its reusable contracts are reassessed with the spike's findings.
- **1b.1x X02–X07 are paused, not cancelled.** They will be re-scoped against Phase A's findings.

## Appendix: source references
Missing simulation and journey features are findings from source inspection. Test files establish that checks exist, not that this review reran them.

| Claim | References |
|---|---|
| Precise Plane coordinates; smooth escape and stripes | `src/plane/math.js:10`; `src/plane/perturbation.js:13` |
| Perspective camera, keyboard/pointer/gamepad flight | `src/space/scene-adapter.js:13`; `src/space/flight.js:39`; `src/space/gamepad.js:166` |
| Draft and settled quality | `src/space/render/profiles.js:6` |
| Shadows, AO, displayed failures | `src/space/render/webgpu/shaders/shade.wgsl:118`, `:154`; `src/space/render/webgpu/shaders/display.wgsl:60` |
| Canonical scenes, discoveries, persistence, scene files | `src/shared/scene.js:24`; `src/shared/discoveries.js:51`; `src/shared/persistence.js:20`; `src/space/scene-adapter.js:131` |
| Numerical tests, tracked memory, recovery | `tests/unit/space-models.test.js:18`; `src/space/render/webgpu/allocator.js:74`; `src/space/recovery.js:4` |
| Estimator categories and unresolved occupancy | `src/space/models/registry.js:30`, `:51` |
| Bounded families | `src/space/models/analytic.js:12`; `src/space/models/menger.js:15`; `src/space/models/mandelbulb.js:13`; `src/space/models/quaternion-julia.js:57` |
| Flight without a physical body; exterior status | `src/space/camera.js:452`; `src/space/workspace.js:441` |
| Deferred Space links | `src/ui/share-link-router.js:6` |

Diagnostic overlays may be optional in beauty views, but a defined, honestly indicated fallback for unresolved geometry remains required.
