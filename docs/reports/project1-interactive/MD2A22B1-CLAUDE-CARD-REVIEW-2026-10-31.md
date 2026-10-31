# B1 independent card review

Run `20261031T192509Z-d2c591`; source packet frozen in scratch `atlas-md2a22b/card-review-r1`. Completed before implementation. All requested amendments incorporated into spec/card; no new GPU work authorized by this card.

**Verdict: the B1/B2 split and the CPU-only verification level are proportionate, and I'd accept the card with amendments rather than block it.** Two gaps would make C2's completeness claim overstate what's been checked. Five smaller items should be fixed in the card text before code. I ran and edited nothing.

## What I read this round
- **In full:** `owner-position-r0.md`, the B1 design spec, the B1 card, the implementation plan, `manifest.json`.
- **In part:** `streaming_builder_r0.py` (lines 60–109), `suites.manifest.json` (lines 100–209 plus a search for `server:false`), `scripts/gate/lib.mjs` (lines 60–129, the evidence classifier).
- **Searched only:** `source-recipe.test.js`.
- **Not read:** the rest of the gate code and test files. I didn't verify any hash.
- **Carried over from round 0:** `h1lib.py`, `sampling_r0.py`, `descendant_world.py`, `dek.py`, `fkern.py` (status codes), `frame.json`, `construction.json`, `base.py`, `create-parent.py`, `source_recipe.py`.
- **Not seen in either round:** `pert.py`.

## Owner position vs my independent response
- **Agree:**
  - Keep `base.npz` bound as an imported input, not rebuilt.
  - Record the old search results as fixed numbers rather than replaying the searches or the 2407 s T1R cache.
  - Use a separate legacy profile that declares float coordinates, unknown→zero and the 36 bisections.
  - Report a rebuild mismatch rather than chase old rounding.
  - Keep the old world record compatible.
- **Where it shifted:** the owner first leaned towards one card including runtime consumption. The frozen design now splits B1 (inert) from B2 (runtime), which matches what I proposed.
- **Disagreement I withdraw:** I had proposed requiring `recipe.json` to be byte-identical to its canonical form. Your argument holds: the key is computed over the normalised canonical object, and the transport SHA binds the file bytes. That's enough.
- **Disagreement I keep:** the spec never names the upstream sources that can't be traced: `sweep.py` (the TA transfer), `h1c` (Level semantics), `rlib` (T1R) and the descent `D04.npy`. They don't block B1, but they are why a full rebuild is impossible today. They should be listed as unresolved provenance so B2 or a later rebuild doesn't rediscover them.

## Two gaps that would overstate C2
1. **The independent reference covers too few sources for "all values the current math reads are explicit."**
   - The runtime field is built in `sampling_r0.values`, not just `h1lib`/`descendant_world`. Values that path reads:
     - the taper constants (0.8 / 1.0 / cosine shape);
     - carve form `−A·w·exp(−D/L)`, plus `T0` for the parent;
     - cap `htop·w`;
     - the reference-orbit length 131072;
     - the GPU path (`pert.dser`, then `fkern.fdser` for status 2 or non-finite status 1, keeping finite status 1 or status 3).
   - The parent's `F` is `base.npz['o']`, its `C` is the `levels.json` seed, and `U = 0.0016/2048` is an expression in `dek.py`, not a literal.
   - Operation order differs between paths. Runtime `values()` computes `U·(RATIO·(a−A0) + i·RATIO·(b−B0))`, while CPU `scalar_depth` computes `U·RATIO·((a−A0) + i(b−B0))`. Comparing parameter bits cannot show that arithmetic is complete.
   - **Fix:**
     - Widen the AST/JSON reference to `sampling_r0.py` and `dek.py`, using a whitelisted constant-arithmetic evaluator; `literal_eval` won't handle the division.
     - Name the rule/kernel versions as bound to the hashes of the original sources (evaluator, kernel, rule, `pert`, `fkern`).
     - State that arithmetic order is covered by that source binding, not by the projection.
     - Have the recipe declare the subtractive composition operator (parent − child − gchild in order, cap and support semantics). Today it is only implied by "optional cutter cap".
2. **The representation dependencies are absent from the spec.**
   - The fine builder loads `prepared-layers-r0/parent-reference-r0.npz/.json` and uses the retained parent mesh directly (`streaming_builder_r0.py:78,105–107`).
   - At import or run time the runtime also reads `fixtures-r0.json`, `approach-r1.json`, `gs.json`, `feature-r0.json` and `cpu-screen-r0.json`.
   - Your instruction is right: keep them as explicit non-mathematical representation inputs. But the spec and card never say so. Without that, "complete recipe" will read as runtime closure.
   - **Fix:** add a "representation inputs, not in the recipe, untouched in B1, must stay explicit in B2" list, plus a C3 assertion that their bindings are unchanged.

## Smaller items to fix in the card text
- **Frame handedness:** I confirmed the parent frame is left-handed: u×v = (−0.18973, −0.79532, 0.57573) = −n. Accepting both orientations is right, but the orthonormality check needs a declared tolerance (e.g. |dot|, |‖·‖−1| ≤ 1e‑12). Validation must not fix the frame or flip its sign. Keep the literal 2.78e‑17 component.
- **Parent interpolation:** "bilinear" isn't enough. Declare the axis order (u, v with `ij` indexing, unlike A2's z,x) and that queries outside `g` return NaN, i.e. unknown (`RGI fill_value=nan`).
- **Descendant support:** say whether `HALF = gchild H/RATIO` is a validation rule or just an observed fact. I'd make it an observation in this imported profile, not a general constraint.
- **Status-decision helper:** say whether `create-parent.py` will be edited to call it.
  - If yes, record its new hash, and confirm it isn't in any certificate's source list and that A/B `verify_bundle` is unaffected.
  - If no, prove the helper matches the current inline rule with a differential control.
  - The summary must keep the current inputs: counts per status including foreign values, plus a count of status 1/3 entries with non-finite distance or height. Unknown status 0 with NaN must stay unresolved, not failed.
  - Add a plateau case where `Href − slope·(0−Dref) = 0`, to exercise the existing −0 normalisation.
- **Shared JSON corpus:** add cases where Python and JS can diverge:
  - `1e400`: Python `json` returns inf without calling `parse_constant`, so it must reject explicitly.
  - `1.0000000000000001`: both parse to 1 and accept. Pin this so "fractional rejects" isn't over-read.
  - `-0` / `-0.0`.
  - Large exponent-integer spellings.
  - Keep duplicate keys explicitly outside the parity claim.
- **CPU gate entry:** the `workflow` evidence kind with `requiredPasses` and `server:false` fits existing practice (`performance-entry`, `acceptance-audit`). Two additions:
  1. Declare the Python interpreter and NumPy source (the toolchain). A missing interpreter or NumPy must classify as failed or incomplete, never pass. The harness must not import CuPy.
  2. Note that the gate grows from 29 to 30 entries for future runs.
  - Running the command and classifier directly instead of a deferred full gate is correct. A deferred gate may still need the browser/GPU lock, and you currently hold the GPU.
- **Cross-language parity:** C4 needs one process to spawn the other (Node↔Python). Put that inside the harness, with bounded time and confirmed cleanup, because unit tests must not spawn Python.

## Proportionality
- No headed gate in B1 is justified, provided C6's byte-identity check covers all app/native/input/certificate files and the parent-reference representation files, and a static check shows the codec isn't imported anywhere.
- The 3 h / 60 s budgets and the stop rules are adequate.
- Actual GPU status 3/4 runs, runtime consumption, saved-place compatibility and the full gate correctly sit in B2.

**Ready once the two C2 fixes and the five smaller items above are in the card text.** None needs an experiment or the GPU.
