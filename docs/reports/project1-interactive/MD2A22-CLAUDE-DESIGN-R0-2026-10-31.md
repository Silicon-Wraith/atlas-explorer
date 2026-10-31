I've finished reading the packet and I don't think a formal card or code should start yet. I agree with the direction (build the enterable vertical slice before another offline recursive codec), but several claims in the proposal don't match the code, and one of them can crash the runtime. Nothing was edited or executed.

## What I read
- **Read in full:** `owner-proposal.md`, `source-manifest.json`, `AGENTS.md`, `contract.js`, `collision-worker.js`, `runtime.js`, `pose.js`, `lifecycle.js`, `scene-adapter.js`, `source-recipe.js`, `native-adapter.mjs`, `application-server.mjs`, and the A2 source-recipes spec.
- **Partly read:** `create-parent.py` (lines 90–169 plus searches), `source_recipe.py`, `native-controller.mjs` and `world-preview.mjs` (searches only), and the preparation-boundary spec (searched lines only).
- **Not in the packet, so not read:** `region-navigation.js` (`regionCovers`/`regionClear`/`sweepRegion` and the collision skin), `spatial-grid.js`, `prediction.js`, `native-worker.py`, the native queue/publications modules, `generation/config.mjs`, the client/workspace code that consumes `/open`, the WebGPU renderer, `mesh-normals.js`, the A2.1 card and scorecard, the charter, the fixed-world clarification, and the legacy certificate format.
- `design-result-r0.json` is empty, so I had no Codex position to compare against. Everything below is my own view.

## Where I agree
- **The error bound is right.** On triangle (a,b,c), bilinear minus linear equals m·u·v, where m = h_a − h_b − h_c + h_d. The other triangle gives m·(1−u)(1−v). Both peak at |m|/4 at the midpoint of the b–c diagonal. B's 4.0199e‑5/4 gives the stated 1.005e‑5. The A2.1 spec defines the world as the bilinear surface, so this measures error against the world itself, not against an approximation of it.
- **The winding is right**, provided the layout is a=(row j, col i), b = col i+1 (+x), c = row j+1 (+z), d = (j+1, i+1). That matches the creator: rows increase z, columns increase x. Then (c−a)×(b−a) points +y. The card must state this layout, since the proposal never defines a, b, c, d.
- **The mesh counts check out:** 2×4225 = 8450 vertices, and 8192 + 8192 + 512 = 16896 faces. The collision worker builds a top-only surface (`FIX_INTERNAL_EDGES`) and a closed solid (`ORIENTED`), which fits this split.
- **Serving one global artifact is allowed:** `containsBounds` accepts any containing box, and `representationKey` leaves out addresses. The requested tolerances are 0.01×unit, so 1.25e‑5 m satisfies every request. Wrong-world refusal already exists in `admitPreparedScene`. The parent-definition digests and plain-string parameters fit `createWorldRecord`.
- **The sampling record needs a contract change.** `contract.js` requires exactly five sampling keys and a positive `rtinToleranceM`, so a uniform grid can't be described honestly today. Adding a second accepted shape while leaving the old one byte-for-byte unchanged is correct.

## Flaws and incompatibilities

1. **Edge addresses can kill the runtime.** In `runtime.js:65`, any `unsupported` result whose reason doesn't match `/capacity/` becomes a fatal error. Prediction can request neighbouring coarse or view cubes. If any cube the grid can produce isn't inside the global box (x/z ±0.8, y from minH−1 to maxH+1), the new adapter must refuse it, and the session dies. The card needs an exhaustive offline check: every address in both the coarse and view grids, plus every pose allowed by `pose.localBounds` (which is the grid domain ±D), must map to a cube inside the box. Whether this already holds depends on `spatial-grid.js`, which I didn't see.

2. **"Same revision for coarse, fine and view" is false.** View artifacts have a different intent and leave out `solid-indices`, so their `representationKey` differs. Coarse and fine can share one key. The claim should be "identical vertex and surface-index digests", not "same revision". Each resident address will also do its own fetch, Rapier build and GPU upload of the same mesh, up to 8 body regions plus 2 view regions. That's harmless at 8450 vertices, but it should be measured and reported, not described as streaming.

3. **The certificate wording risks overclaiming.** `qualification.kind` must be `'empirical'`, and the boundary spec forbids presenting a check as an everywhere guarantee. The analytic |m|/4 bound plus roundoff can go into evidence and limits, but the artifact can't declare it as a guarantee without a further contract change. The card should say which of these it does.

4. **The roundoff term is incomplete.** Rounding a vertex to f32 also moves it sideways, so the bound needs a |∇h|max × δ_xz term, not only vertical rounding of y. The margin is only about 2.45e‑6 m (1.25e‑5 − 1.005e‑5). It's probably fine, but it has to be computed from the actual height range and slope.

5. **Saving doesn't really need "no new format".** `scene-adapter.js` hard-codes `sampling.profile: 'retained-native-r1'` and `coverageProfile: 'pc2-half-d-r1'`. A source-world scene would carry a false "retained native" sampling label. Either accept a new value only for the source generator (old scenes are unaffected), or explicitly record the label as a mislabel the slice accepts.

6. **The `/open` endpoint is tied to the native bundle.** `application-server.mjs:71-76` reads `feature-r0.json` from the bundle and the `approach` (entry, inspection eye, fineOrigin, fineDiameter) from the native hello. `admitPreparedScene` also requires `setup.feature.light`. A source bundle has none of these. The adapter will have to supply them, which changes the server, so the card should require that the default path stays byte-identical. I couldn't check whether the client uses `approach.fineOrigin` to target shrinking.

7. **Fine bounds equal to the global box don't fit the existing checks.**
   - The native adapter checks that the home cell contains the fine bounds, so the new adapter has to drop that check deliberately.
   - The runtime still requires the coarse home cell `'0,0,0'` to be resident for fine.
   - Growing back to coarse selects `'0,0,0'` as the active region wherever the body is. That only works if `regionClear` uses the artifact's bounds rather than the address cube (not read).
   - The card must also say plainly that shrinking shows the same bilinear surface with no new detail.

8. **The certificate path defaults to the legacy file.** `ATLAS_GENERATION_CERTIFICATE` falls back to `GENERATION_CERTIFICATE`. A `--source-world` launch must fail loudly on that default certificate rather than ever reaching the native-style acceptance path.

9. **Smaller mismatches:**
   - The proposal says "heights.raw", but the asset is `height.npy`. The logical SHA is sha256(canonical header + `\0` + C-order bytes). Reuse `create-parent.py --verify` / `verify_bundle` rather than inventing a new check.
   - "XY footprint" should be the XZ footprint, since y is up.
   - The bottom face should sit exactly at the box's y-min. Saying it is "below all admissible requests" is only true given flaw 1.

10. **Possible circular self-check.** If the preflight verifier imports the same mesh-building code, the certificate approves itself. The reference implementation must be separate (stdlib or numpy), and its digests must be pinned in a separate step before the gate.

## A simpler path
- **Drop the new worker.** Build the 8450-vertex mesh inside the Node process, in a source adapter passed through the existing `adapterFactory` parameter of `createApplicationServer`. Then there is no `native-worker` variant, no `NativeController` entry parameter, no worker-exit or reset handling, and no process cleanup surface. Building that mesh should take milliseconds. Keep the independent Python/numpy checker in preflight. If the owner still wants a worker, they should say what it buys.
- **One artifact per intent, built once:** an interaction artifact and a view artifact, both covering the global box and served for every contained request.
- **Split off the A2.1 hardening.** The JSON integer normalisation (there is a real gap: JS accepts `64.0`, Python rejects it), the CPU and GPU negative controls, and the U=1e308 stress test belong in a separate small card. Only fixed A/B are admitted, so the slice doesn't depend on them, and changing generator sources mid-slice changes their provenance digests.
- **Don't regenerate A/B inside the gate.** Fresh A/B regeneration is a GPU replay of A2.1. Run it as a separate optional control, not as an admission dependency.

## What would settle the remaining questions before the card
1. Read `region-navigation.js` and `spatial-grid.js`. They decide flaws 1 and 7 and the collision-skin basis for the 0.0005·fineD threshold.
2. Do an offline enumeration of grid and view addresses against the actual A/B boxes.
3. Compute the full roundoff from the actual height range and gradient.
4. Decide explicitly on the scene `sampling` label and on what the qualification record claims.

On scope: this slice adds no backend default and no new mathematical formation. It is ready for a card once these items are written in as criteria; it isn't ready for code yet.
