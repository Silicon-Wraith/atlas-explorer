Not quite ready: one line still needs amending. The pose-support guard fixes the r1 blocker, and the pinned values are fine. But the C5 contact-audit rule demands more clearance than the existing collision code guarantees, so the stop rule will probably fire during ordinary terrain contact. It's a one-line card amendment, after which I'd call it ready.

**Read scope:** r2 card and spec only, compared against r1. I relied on code I read earlier (`runtime.js`, `pose.js`, `region-navigation.js`, `workspace.js`, `scene-adapter.js`). I did not read the r2 plan and did not check any hashes. Nothing was run or edited.

## The guard and the pinned values are correct
- **The guard on the end point is enough.** The pose model accepts positions inside an axis-aligned box: the coarse envelope intersected with the fine limits. A box is convex, so if the start and the proposed end are both accepted, every committed point `start + delta·fraction` is too.
- **Scale changes and reopening were already safe.** Shrinking validates the same position against the global `fineBounds`. Growing keeps the position inside the envelope and checks clearance against the global home artifact. A reopened scene is validated before `start`, so only `move` needed the guard. It's right not to change the surface, the camera or pose admission.
- **The near-boundary saved-scene test reaches the real case.** It works as long as the fixture is clear of terrain. Near the edge, `viewGrid.nearest` may return null and simply skip the view, which is harmless.
- **The pinned values work:**
  - Tolerance 1.25e‑5 m is at most 0.01×unit for all three representations.
  - The light [−1/3, 2/3, −2/3] has unit length, and binary64 values survive the scene's exact JSON comparison.
  - The source-only labels leave the other scene-policy checks unchanged.
  - The X, Z, Y axes are fine as written.

## Blocker: the C5 audit inequality will likely flag false penetration
The spec and C5 require meshDistance − sourceError ≥ 0.5·body − 1e‑6·body, which means meshDistance ≥ 0.5·body + sourceError − 1e‑6·body. In other words, the body must stay about sourceError (about 1.03e‑5 m for B) clear of the delivered mesh. Nothing in the collision code guarantees that.

1. **Grazing contact.** `sweepRegion` backs off 0.001 normalised units along the direction of motion. The clearance that gives along the surface normal is 0.001·body·cos θ, where θ is the angle between the motion and the surface normal. For fine bodies on B, that clearance falls below 1.03e‑5 m once cos θ < ~0.41. Walking across or along a slope does this all the time. Coarse bodies fail too, at steeper grazing angles.
2. **Physics precision.** I'm assuming the served `rapier.mjs` is the usual f32 build; I haven't checked. If so, positions are in global normalised coordinates of up to about 64 (x/z) and about 156 (y) for fine bodies on B. One f32 ulp there is about 1.5e‑5 normalised, which is far above the 1e‑6·body slack. Legacy local cubes stayed around ±1, so the slack worked there and doesn't carry over.

So "recorded penetration" would stop the run because of approximation error and f32 noise, not because of a real collision fault.

**Smallest fix:** split the audit in two.
- **Penetration stop rule**, measured against the delivered mesh: meshDistance ≥ 0.5·body − s. Set s from the actual maximum normalised coordinate magnitude, for example a few f32 ulps of the largest local coordinate × body, or a fixed 1e‑4·body. Freeze the formula before the gate.
- **True-surface finding**, reported but not a stop rule: meshDistance − 0.5·body ≥ −(sourceError + s). That matches the declared empirical 1.25e‑5 m tolerance and doesn't claim more.

## Optional, not blocking
Add `reason: 'finite-domain'` to the `navigation` event, not just to `move()`'s return value. That keeps boundary waits out of the C9 readiness and navigation-time numbers and out of the "Preparing nearby terrain" status message.

With the C5 amendment I'd consider the card ready for implementation, and nothing else needs another review.
