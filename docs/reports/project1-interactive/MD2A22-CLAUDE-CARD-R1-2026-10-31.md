I can't call it ready yet. There's one material blocker, and it's a small fix. Almost everything you listed checks out against the code. But the coverage check runs in only one direction: fine bodies can reach places the pose model refuses, and that crashes the session. Nothing was executed or edited.

## What I read
- **In full:** the A2.2a spec, card and plan, `manifest.json`, `region-navigation.js`, `spatial-grid.js`, `prediction.js`, `design-analysis.py` and `design-analysis.json`. From r0 I'd already read `pose.js`, `runtime.js`, `contract.js` and `application-server.mjs`, with the same contents as this review assumes.
- **Partly:** `workspace.js` (lines 125–144 and 195–236, plus a search) and `prepared-regions.js` (search hits only).
- **Not read in r1:** `publications.mjs`, `native-queue.mjs`, the multiscale clarification spec, and the rest of the renderer and workspace. `scene-adapter.js`, `create-parent.py` and the preparation-boundary spec have the same hashes as r0, so I didn't reread them.
- I didn't check the manifest hashes or rerun the analysis.

## Confirmed
- **Exact scaling holds.** `sweepRegion` requires `bodyDiameterM / metresPerUnit == 1`, so D, D/4 and 4D need separate normalisations. Dividing by D/4 = D·2⁻² and rounding to f32 is exactly 4× the D version, and multiplying back gives identical physical coordinates. That's why the analysis shows the same roundoff for all three normalisations.
- **The renderer agrees.** The offset is (originM − anchor)/diameter and the scale is metresPerUnit/diameter. The anchor is `grid.origin`, which is the entry point. The initial view looks toward `feature.point`, which is the source centre.
- **The error figures check out:** A 5.44e‑6 m and B 1.027e‑5 m, against a 1.25e‑5 m limit. That limit is half the fine cast skin (0.001 normalised × fineD = 2.5e‑5 m). The gradient terms come from cell-edge differences, which are exactly the slope extremes of a bilinear surface.
- **Every requested cube is inside the global bounds:** 51,744 coarse and 208 view addresses for A, 113,680 and 528 for B. The entry point's footprint uses rows for z and columns for x correctly, and the entry clears the highest point under the body by about 0.0099 m.
- **Coarse movement is safe at the edges, but only just.** The domain is computed with a floor, so the pose envelope (grid domain ±D) reaches to at least bound − 0.05 m. `regionCovers` stops the body centre at bound − 0.0501 m. That leaves about 1e‑4 m of margin, and the card should assert it rather than rely on it.
- **Growing back works anywhere:** `regionClear` uses the home artifact's global bounds. The worker, certificate, scene-label and A2.2b split decisions are all fine.

## Blocker: fine bodies can move outside the pose envelope
`regionCovers` lets a fine body's centre get within 0.501·D/4 ≈ 0.0125 m of the global bounds. But `pose.validate` still applies `localBounds` (the coarse grid domain ±D) to every pose, and that envelope can stop as much as 0.05 m short of the bounds.

Example from the analysis: A's z envelope tops out at −0.1135 + 0.05·16 + 0.1 = 0.7865 m, but a fine body can reach 0.7875 m. The y top can fall short of the bounds by up to 0.05 m too, and E (move up) is free.

What happens next:
1. `runtime.move` calls `poseModel.withPositionM`, which throws `RangeError('pose outside finite prepared domain')`.
2. `workspace.frame` catches it and calls `interrupt`, which stops the landscape session.

The legacy world never hits this because its fine artifact's bounds sit inside the home cell. C3 only checks that the envelope is inside the bounds. It also needs the reverse: for every interaction kind, the set of positions `regionCovers` allows must lie inside the pose envelope, and for fine, inside `fineBounds`.

The smallest fix I see: set `fineBounds`, and the fine artifact's bounds, to the coarse pose envelope instead of the global box. That box is ordered and contains the fine request, and it makes `regionCovers` stop the body before the pose model would refuse it. It doesn't affect coarse or home. Two things then need to hold:
- The fine artifact's declared `volumeM3` has to fit the smaller box. Either report the volume clipped to those bounds, or show the full-solid volume still fits; I haven't checked which.
- Add the reverse check to C3, and to the Node units, for coarse (the ~1e‑4 m margin) and fine.

## Should be pinned before code
These values are persisted or part of identity, and the card leaves them open:
1. **Declared `qualification.toleranceM`** for each artifact. It's part of `representationKey`, and it must be ≤ 0.01×unit.
2. **The source-only scene label strings and the source light direction.** Saved scenes embed the light, and `admitPreparedScene` requires it to match exactly.
3. **C5's "declared audit slack"**, as a number. For example, the 0.001·body cast skin plus 1.25e‑5 m. This replaces an undefined term in an existing criterion; it isn't a new target.
4. **Grid axes order (optional).** The analysis uses X, Z, Y, which is left-handed. Nothing I read depends on handedness, since `spatial-grid` and the pose code only take dot products, but naming the axes explicitly avoids confusion.

## Verdict
Fix the fine-envelope blocker with a small spec/card amendment and the reverse containment check, and pin the three values above. I don't need another full review round: a diff-only check of the amendment is enough. Everything else in the card is consistent with the code I read.
