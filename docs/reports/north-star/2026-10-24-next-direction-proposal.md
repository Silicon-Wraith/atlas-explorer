# Next direction: richer spatial interpretations of the field (joint proposal)

**For:** the advisor. **From:** Claude and Codex.

**Basis:**
- Independent positions, committed by hash before exchange: Claude 9dbeda1b… (`scratch/valley-spike/direction/position-claude.md`) and Codex b5e87f4e… (run 20261024T183055Z-a4fd).
- The advisor's direction of 2026-10-24, logged verbatim.

## What we now hold
- **Earlier outcomes stand:** the transfer-gain outcome stands under its frozen inspection policy. That policy measures a specific camera inspection pose; it establishes neither practical walking accessibility nor flight navigability. Its limits should not determine the architecture.
- **Three properties, reported separately from now on:**
  - **Visual legibility:** recognisable formations, depth, scale and changing spatial relationships during movement.
  - **Navigation:** a declared observer body travels through connected free space by a declared locomotion mode. **Flight is the required mode for the next experiment**; walking and landing are optional evidence.
  - **Physical accessibility:** whether a given body can land, stand on, climb or enter a particular surface.

  A cliff can pass the first two and fail the third. That is not a failure of world generation.
- **Why the heightfield is limited:** it fails structurally. One elevation per horizontal point cannot express overhangs, stacked surfaces, undercut fissures or chambers, and no transfer can change that. It stays useful for distant terrain and backdrops; it should not be the universal representation.
- **Caves are an authored rule:** changing the representation does not by itself find "hidden caves". Derivatives, residuals and other fields expose relationships; turning them into thickness, voids or passages is an authored generation rule. We will state each rule explicitly, and test that the resulting geography keeps a meaningful dependence on the mathematics.
- **What the mathematics offers per point beyond D:**
  - the complex derivative z′(c) (its direction as well as its size);
  - the external angle;
  - the escape count;
  - multiscale residuals;
  - in the interior, the period and the multiplier λ;
  - one genuinely three-dimensional source: the 4D (c, z₀) parameter space of z² + c, whose z₀ = 0 slice is exactly the Mandelbrot set.
- **Reference experience:** the T1 m4 cliff formations that both peers recognised. They are kept regardless of outcome, with their original geometry, cameras and captures preserved.

## Alternatives and tradeoffs
| Approach | Opportunity | Main limitation |
|---|---|---|
| Keep T1; add flight and scale change | Fastest test of the existing canyon experience | No new topology |
| Add derivative or multiscale features to elevation | Cheap; uses existing samples | Still a heightfield; derivatives need their own stability checks |
| **Volume derived from the planar field** (bounded voids, overhangs, layered solids under an explicit rule) | Keeps the canyon context and adds passages and overhangs | Needs an explicit shaping rule and new geometry checks; risk of "designed structure posing as mathematics" |
| A genuinely 3D field: the (Re c, Im c, Re z₀) parameter slice, or another 3D fractal | Spatial structure that is not a lifted planar field; the slice contains today's set as its z₀ = 0 cross-section | Changes generator and representation together; its distance estimate is not exact, and its legibility and scale relationships are unknown |

## Recommendation (staging agreed by both peers)
**Step 0: qualified fixture pool, before any substantial run** (≤ 2 working hours).
- **The problem it fixes:** three cards in a row lost their holdout to fixture feasibility. The causes:
  - name-based or main-cardioid boxes that are all interior or all exterior;
  - escape points that fall into bulbs;
  - slow classification near the cardioid;
  - a zero-unresolved rule applied over whole boxes;
  - budgets set below measured step times.
- **What the job does:**
  - It runs once, independently of any card, with budgets sized from measured stage times.
  - It keeps four checks separate: certified boundary inclusion, landmark availability, reference classification and sampling stability.
  - It records unresolved samples explicitly and never assumes them interior.
  - It freezes the selection order, preserves failures, and reserves unused, unviewed fixtures.
- **What qualification means:** evaluation is possible within declared numerical domains and measured budgets.
  - Planar fixture qualification does not establish readiness for the 3D parameter slice.
  - Before the substantial flight run, the selected rule's required evaluation domain must also pass numerical preflight on the reserved fixture, without selecting for attractive geometry or passage existence.
  - Any departure from whole-box resolution must define in advance the evaluated domain and the treatment of unknown regions; unknown space cannot count as clear.
  - Qualification never requires the candidate to succeed.
- **If qualification fails:** stop and report. Later work is then development-only.

**Step 1: interpretation screen** (≤ 3 working hours, including implementation and checks; CPU checkpoint at 60 minutes; development fixtures only).
- **Comparison:** each candidate against the preserved T1 m4 reference, at its reference locations and scale. Freeze one rule per candidate before viewing. Use matched appearance, and first verify that changing only a condition label cannot change pixels.
- **Candidates:**
  - **P, residual-band passage:** give a connected coarse-to-fine field-residual band finite vertical extent inside the T1 solid, then subtract it where it meets the cliff face.
  - **E, extruded level-set solid:** solid where D(x, z) < w(y), using one frozen height profile intended to produce an overhang and a recess. Horizontal sections follow level sets of the implemented field; their vertical arrangement is authored.
  - **S, the 3D parameter slice:** evaluate a bounded slice under an explicit occupancy and unresolved-state contract. A safety factor alone does not establish a conservative distance bound. A new sphere-tracing implementation is not required to screen this candidate.
- **Checks:**
  - Check for a genuine overhead surface, and for a connected passage that accommodates the declared observer body at m4. State the body dimensions and clearance margin explicitly.
  - Verify geometry against the representation actually used; sampled field checks must not be reported as continuous guarantees.
  - Record how the mathematical field and the shaping constants each determine the result.
- **Stills:** one small matched still set for each numerically ready candidate, judged independently. Stills establish neither successful travel nor live performance.
- **Selection rule, frozen before viewing:**
  - Eligibility requires numerical readiness, the geometric checks, and a credible route to the specified T1-referenced flight experience.
  - Among eligible candidates, prefer the clearest experiential promise; an unresolved tie goes to the lower implementation cost.
  - Carry one unchanged rule into Step 2.
  - Missing geometry is a negative construction result; insufficient numerical evidence or exhausted implementation time leaves a candidate unresolved.
- **If no candidate qualifies, stop.** The screen need not produce a winner. Do not extend its cap or build a general renderer to complete the comparison.

**Step 2: flight-through experience** (about one working day).
- **The experience:** fly beside a recognisable T1 m4 formation, enter a field-derived opening, pass beneath solid terrain, and emerge with the original cliffs still giving orientation.
- **Representation:** one bounded patch, one frozen rule, and a fixed triangle mesh used for both rendering and swept-body clearance. No adaptive detail, general implicit renderer or physics-engine choice yet.
- **Success requires all of:**
  - a geometrically verified overhead surface and a connected entrance-to-exit passage;
  - a bounded flight-and-return task with no penetration, relocation, or unresolved geometry treated as empty;
  - both peers independently recognising the original cliff character and identifying spatial relationships the passage newly opens up;
  - live performance recorded against a budget frozen in advance.
- **Holdout:** evaluated once on the reserved fixture.
- **What counts as partial:** a topology demonstration without a compelling journey is partial evidence, not success.
- **Stops:**
  - the passage needs manual routing;
  - relevant geometry remains unresolved;
  - the work grows into a renderer rewrite.

  A failed construction rejects that rule, not richer spatial interpretation generally.

**If no candidate qualifies:** record whether geometry, experiential promise, numerical readiness or implementation cost prevented progression. A separate 3D-field card remains an alternative, supported by the screen's findings rather than presumed superior.

## Why this staging
- **Codex:** stills do not establish travel, so the decisive evidence has to be a flight through a real passage.
- **Claude:** committing a day to one shaping rule before seeing the alternatives risks testing the wrong one.
- **The combination:** the 3-hour screen picks the rule cheaply, and the one-day flight test decides whether it creates "somewhere worth entering". Total commitment: about 1.5 working days, with clear stop points after each step.

## Decision requested
We recommend the bounded sequence above: fixture preparation, the interpretation screen, then a flight test only if a candidate qualifies. This selects an experiment, not ATLAS's universal representation. The successful T1 m4 cliffs remain the reference experience regardless of outcome.

Codex agreed to this staging, with replacements (run 20261024T183306Z-ef31).
