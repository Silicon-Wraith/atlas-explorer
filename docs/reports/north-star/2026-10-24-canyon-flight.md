# Step 2: T1 canyon flight and ascent (baseline): closure

## Header

| | |
|---|---|
| **Plan** | Step 2 of `2026-10-24-next-direction-proposal.md`, baseline only (plan adjustment 2). Step 1 found no eligible passage rule (PR #12). |
| **Card** | `card-flight.md` r2 (SHA-256 a736b498…). Codex review 20261024T213832Z-bebd (NOT READY; replacements 1–7 applied) |
| **Owner / challenger** | Claude / Codex |
| **Frozen before the holdout** | `flight/rules.json` (39bbc84b…): rule, constants, rendering mode and code hashes |
| **Codex runs** | 20261024T215503Z-ecf7 (holdout result; descriptive run bounds), 20261024T215821Z-5d26 (independent recording judgements; Claude's hashed f01… before exchange) |
| **Evidence** | `/mnt/ml_storage/scratch/valley-spike/flight/` (`runs/`, `dev2/`, `holdout/`, `rules.json`, `clock.md`, both judgements) |

## Summary
- **Holdout:** **Step 2 did not meet holdout success.** The frozen route rule failed criterion 1 on the reserved fixture k2; criteria 2–4 were not evaluated there.
- **Development (seahorse):**
  - **Established:** route qualification, and live navigation and performance within budget.
  - **Not established:** experiential convincingness. Both peers found the sampled scenery canyon-like and the ascent's structural reveal legible, but neither could inspect continuous motion, so criterion 4 is incomplete.
- **Next questions:** the next investigation concerns **route selection** (and possibly cliff-side rather than two-sided journeys), and an **advisor viewing** of the recordings in motion.

## Formally established
- **Route rule on development fixtures:**
  - **Seahorse:** qualifies at q = 40, with eye altitude y_f = 96.3.
    - Route: 250 units (36.8e), smoothing rejected, so the polyline is used.
    - Walls on both sides at 68% of samples; longest enclosed run 25e; total heading change 4.5 rad; minimum clearance 1.58 units.
  - **Elephant:** no canyon under the rule (enclosure 0.00 at q = 40 and 50; degenerate path at q = 30).
- **Holdout k2:** numeric only, evaluated once with the rule frozen.
  - No q qualifies. Enclosure was 0.00 at q = 30, 40 and 50, with route lengths of 6.9e, 24.3e and 30.4e.
  - At q = 50, 29 of 31 stations had no qualifying wall on either side and 2 were unresolved on both sides. Even counting the unresolved stations as enclosed gives 6.5%, so the result is not a borderline artefact of missing support.
  - The k2 box has no unresolved samples. The backdrop has 68 unresolved level-0 samples (display only).
- **Checker validation:**
  - **Clean run:** the Node replay of the actual controller passes.
  - **Tampered logs:** each probe is rejected. Penetration was flagged 3897 times, relocation once, and premature completion as incomplete.
  - **Controller:** it refuses the first unsafe step when y_f is lowered by 40.
- **Live, development, all-reference rendering** (installed Chrome headed, GPU lock, cleanup confirmed):
  - **Navigation:** the seahorse task passes with 0 penetrations, clearance violations, relocations or contract violations. The flight takes 18.5 s and the ascent 20.0 s.
  - **Timing:** p95 22.4 ms, max 27.9 ms.
  - **Instrument validity on the final implementation:**
    - the static control passes (stalls detected at 156.6, 87.1 and 154.0 ms; no other interval over 33 ms);
    - the moving stall diagnostic passes (159.5, 85.4 and 155.8 ms; no other interval over 33 ms).
    
    The refinement card's unexplained moving-scene hitches did not recur without LOD.
- **LOD with smooth normals is not viable as built:**
  - Rebuilding all normals on each level change costs about 328 ms. In 119 frames, p95 was 342 ms.
  - Under the card's bounded alternative, all-reference rendering with normals computed once was frozen before the holdout. The LOD deviation therefore no longer applies.

## Supported partial findings
Both peers judged independently from 2 fps contact sheets of the continuous recordings. Neither could play continuous video.
- **Seahorse flight:**
  - **Agreed:** recognisable fluted T1 walls on both sides along a narrowing, bending floor.
  - **Ratings:** Claude rated the flight *convincing* from the samples, which goes beyond the card's rule. Codex rated it *unclear as a moving experience; sampled scenery convincing*. **Codex's rating is the correct application of the card.**
  - **Unclear for both:** detail resolving on approach, curve-following in motion, and shimmer.
  - **Fault:** at the end of the route the camera faces a dead-end wall that fills the frame (about 1 s by Claude's estimate) before the ascent turns.
- **Seahorse ascent:** both peers find the larger structure legible. The canyon is seen as a gap between arms of the seahorse spiral, within its branching hierarchy.
- **k2 descriptive run:** post-result, with the non-qualifying q50 route unchanged; it is not a criterion and could not overturn the result.
  - **Agreed:** it traverses a broad basin with distant fluted rims and one nearer butte. It is not a sustained two-sided canyon.
  - **Navigation and timing:** pass (p95 21.4 ms, max 25.1 ms).
  - **Ascent:** both find it legible, revealing the cardioid plateau edge as a cliffed coastline of spirals and bays. Codex notes a conspicuous straight world-boundary edge against the sky in the later overview.
  - k2 is now a viewed, previously evaluated fixture.

## Unresolved
- **Convincingness in motion.** It needs a human or tool able to watch the recordings: the advisor can, while neither peer could.
- **Route selection.** Whether a different objective finds qualifying canyons on k2 or elsewhere.
  - The maximum-clearance metric plus double sweep plausibly favours open ground and dead ends (as Codex predicted). This remains a hypothesis.
  - A cliff-following rule guarantees proximity to at most one wall: a cliffside journey is a different experience from a two-sided canyon, and the two should be kept distinct.
- **Where canyons occur.** Whether two-sided canyons are a property of particular regions (seahorse's gaps between arms) rather than of T1 terrain generally. There is one positive development fixture and two negatives (elephant, k2).
- **A fresh generalisation claim needs a new qualified fixture.** k2 cannot test a rule motivated by its own failure, and the pool has no other qualified fixture. A faster level-0 classifier would help the next pool.
- **Visual quality limits:** the smooth-shaded level-4 mesh gives soft, draped wall faces; the palette is uniform ochre; there is no haze, shadow or vegetation (charter Scenario A lists these).

## North Star reading
- **Toward:** for the first time, ATLAS has a recorded flight through a field-derived canyon of T1 cliffs, followed by an ascent that shows the mathematical structure it belongs to. It ran at frame rate with verified collision-free motion. The charter's Scenario A is now demonstrably reachable on at least one region.
- **Not yet:**
  - generalisation (the holdout failed route selection);
  - motion convincingness (unjudged).
- **Sets up:** a reusable flight stack, comprising the T1 export, route rule, controller, independent checker, live driver with recording, and validated timing instrument; and a sharp next question about route selection.

## Process accounting
- **Time:** card about 40 minutes plus one review. The build and every run took about 20 minutes after READY (21:43–22:00Z), far inside the 8 h cap, because the refinement viewer, controller, checker and instrument were reused.
- **Mechanical repairs (two allowed):**
  - repair 1: a missing argument in the driver's evaluate call;
  - before that, a port clash: 5195 is held by an unrelated two-day-old server, so private port 5197 was used and recorded.
- **Worth it:**
  - Codex's card review: the checker contract, ascent framing, LOD cost risk and continuous-recording requirement were all borne out.
  - Codex's corrections: timing tier (the moving control then passed cleanly), descriptive-run reasoning, and the stricter application of the motion rule.
  - Reuse of tested refinement machinery.
- **Lesson:**
  - The peers cannot judge motion. A card whose decisive criterion is motion should plan for a viewer who can, such as the advisor or a motion-analysis tool, rather than discovering this at judgement time.
  - A route rule frozen after a single positive development fixture had a predictable failure mode.
