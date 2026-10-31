# A2.1 card review (r0): ready once six card-text amendments are made

Nothing I found invalidates A2.1. The smaller scope holds up: a parent-only profile, the legacy alias staying bound to its assets, and the legacy rebuild deferred and explicitly not counted as done. It answers the question I put to my own first experiment: new grids derived from a named source, checked against the mathematics from the exact strings, not from a fixture. But some identity and numerical points are underspecified, and an implementer could resolve them in ways that undercut the card's own claims. These are text changes to the card, not redesigns.

## Reading scope
- **Read in full:** `owner-comparison.md`, `owner-position.md`, the card (`MD2A21-CARD-2026-10-30.md`), the design (`2026-10-30-atlas-md2a2-source-recipes.md`), the plan (`2026-10-30-atlas-md2a2-implementation.md`), `fkern.py`, `shared/scene.js`, and the card-review `source-manifest.json`.
- **Read in part:** `src/plane/math.js` and `src/plane/scene-adapter.js`, by searching for how decimals and zoom are handled.
- **Carried from r0:** the files read in my first review, used here to check anchor and constant derivations.
- **Not read:** `challenger-position.md` (I relied on my own r0 text), `field_fidelity_r0`, `classify`, `rlib`/`tlib`, `generation_paths`.
- **Not checked:** I did not verify any hashes. Nothing was executed or edited.

## Checks I made against the source (these support the card)
- **Affine constants:** height 89.0601 matches `T1(6.8)` from `sweep.py`. Slope 2.16004 matches `|dT1/dD|` there. The comment in `frame.py` ("TA0 = 103.7484") is stale or misleading; the code and the card agree with each other.
- **Anchors:** Anchor A is exactly `dek.to_c(seahorse-tail)` applied to the legacy `frame.json` centre (1415.0518, 1040.3354). Anchor B is exactly `dek.to_c(elephant-trunk)` applied to the sweep `START` point. Both are pre-existing locations, as claimed.
- **Grid resolution:** U = 0.00000078125 is exactly 0.0016/2048. The grid step is 0.025 m, or 1.95e-8 in c. The 1/1024 rounding budget is about 1.9e-11, far above the float64 ulp of about 1e-16 at |c| ≈ 0.74. The case with U = 1e-40 cannot meet the budget.
- **Canonical bytes:** `canonicalJson` sorts keys by UTF-16 code unit and emits integers and strings directly. For a schema of printable ASCII, strings and safe integers only, Python `json.dumps(sort_keys=True, separators=(',',':'))` can produce the same bytes. The cross-language claim is sound within that restriction.
- **Kernel determinism:** the `fkern` iteration kernel is compiled with `--fmad=false`, so same-host determinism is plausible.

## Required amendments, to make before code
1. **Freeze the control inputs.** "One-point or minimal-grid … near −0.1226+0.7449i" is not frozen. Fix the exact decimal strings, U, half extent and cell count. For the deep case, fix the exact U string (`"1e-40"` or the long decimal form), and state which layer must reject it. The codec must accept it as valid syntax, and the numerical preflight must return `unsupported`. Otherwise a codec-level "invalid" result could be counted as passing the "unsupported" control.
2. **Specify how coordinates are built.** The design mentions Decimal but doesn't say how c is formed or rounded.
   - Python's default `Decimal` precision is 28 digits, and it rounds silently. Anchor A already has 25 significant digits, and Plane strings can be much longer. Use `Fraction`, or a context whose precision comes from the input lengths, with `Inexact` trapped.
   - `fkern.fdser` builds `complex(C) + U*(u+1j*v)` from a float64 `C` inside CuPy. CuPy elementwise kernels are not compiled with `--fmad=false`, so contraction may happen there. The interior test also runs in CuPy. Freeze one path: compute exact c per sample, round once to float64 on the host, run `proven_interior` on the host, and pass `cr`/`ci` straight to the `fdirect` kernel. Then the identity-bound rounding budget is the real error bound, not an estimate.
   - State the sign mapping explicitly: the profile uses `C + U(x − i z)`, while `fdser` uses `+iv`, so v = −z.
3. **Write the remaining profile constants into the generator spec.** Generator id/version binds these, but they are not written down:
   - the interior-test margin `(1 − 1e-9)`;
   - proven interior means resolved, with D = 0 and height = H_ref + slope·D_ref. Otherwise say it is unresolved, but decide;
   - status 4 ("failed") means not resolved;
   - escape radius 1e6;
   - outside the grid domain there is no surface defined, which is not the same as empty air;
   - the logical array is little-endian float64 in C order, with no NaN and −0.0 normalized;
   - the order of operations and float64 conversion of the affine constants.
   
   Add a unit test that asserts this constants table, so a code change that skips a version bump is caught.
4. **Make the mathematical check independent and pointed.** The checker must build c from the recipe strings itself and share no coordinate helper with the creator. Freeze the rule for picking the 32 points per case. It should always include the 4 corners and the centre, which catch axis or sign flips, and the k highest-iteration escaped samples, which are the hardest points. Record whether the CPU and GPU iteration counts agree. Height error is about 2.16 × the D error, so the height criterion is the binding one; say so. The 1e-4 m tolerance is well below 0.025 m × |∇H| ≈ 0.05 m, so it does catch half-cell and orientation errors. I support it.
5. **Disclose the anchor provenance and the selection bias.** A is the legacy chart centre. That frame was chosen by an earlier screen for windows with D between 3.4 and 13.6 m, and its window has D from about 7.5 to 12.5 m, a smooth ramp. B is a sweep starting point. Both were pre-screened by earlier experiments. A pass shows that creation from strings is correct. It shows nothing about arbitrary Plane sources or terrain that is rich in features. The "nonconstant relief / A≠B" criterion is a sanity check only; the mpmath agreement is what discriminates.
6. **Extend the tamper tests.** A mutated request JSON or result JSON must also be rejected because the key or definition no longer matches, not only a mutated `.npy` file.

## Recommended, not blocking
- Budget the mpmath checks separately from the 180 s native budget, or estimate them up front. At 50 digits, one high-iteration point can take seconds, and picking the highest-iteration samples makes that more likely. If a check times out, record it as incomplete, not as passed.
- Add an informative third case that does not gate the result: Plane's `INITIAL_VIEW` strings. This exercises a string that came from the product, not from an experiment. Either outcome is reportable: resolved and checked, or honestly unresolved.
- Proportionality is fine. Running the 1,357 guarded tests plus the build for an inert tool is cheap and protects A1's bytes. One native run with one mechanical repair is proportionate.

## Agreement and disagreement with the owner
- **Agree:** string/integer canonical bytes with SHA-256, leaving the existing FNV scene contracts alone; a resolved array binding kept separate from provenance; the CUDA float64 kernel with mpmath holdouts instead of a CPU production grid; the legacy rebuild deferred and not counted.
- **Agree, with a correction to my r0 position:** I wanted the first experiment to be CPU-only. Reusing the existing GPU float64 kernel is acceptable, provided coordinates are formed on the host as in amendment 2.
- **Disagree only where the card leaves room:** the exact coordinate path, the frozen control inputs, the interior/failed semantics, and the anchor disclosure.
