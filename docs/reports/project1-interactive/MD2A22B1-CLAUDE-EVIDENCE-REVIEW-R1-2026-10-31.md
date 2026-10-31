# Independent B1 frame repair review

Run `20261031T195004Z-fcdd7a`; completed read-only review of the frozen repair and preserved r1 output. Supports a scoped PR; exact scope/limitations follow verbatim.

# Focused B1 follow-up review (read-only; nothing run or edited)

**Verdict: the fix and its evidence hold, and B1 is ready for a scoped PR.** I see no remaining blocker, and I don't need another harness run.

## My frame-summation claim is withdrawn
You're right, and my r0 statement was wrong. From Python 3.12, `sum()` over floats uses compensated summation, while JS `reduce` adds strictly in order. The toolchain here is Python 3.13.2. Your preserved probe shows the consequence:
- the dot product is 1.0000056338554941e‑12 added in order, but 9.999917560676863e‑13 with compensation;
- before the fix, Python accepted that frame and JS refused it (`frame-python-before.json` and `frame-js-before.json`).

So parity did not hold at the tolerance boundary. The original 90 matching verdicts are still valid observations, and the report keeps them without relabelling.

## The source fix
`recursive_recipe.py` lines 34–40 now compute `total = 0.` followed by `total += x*y`, in `zip` order.
- This is the same sequence of rounded multiplications and additions as JS `a.reduce((s,x,i)=>s+x*b[i],0)`.
- Neither language fuses the two operations. CPython runs them as separate operations; JS semantics require plain IEEE arithmetic.
- `math.sqrt` and `Math.sqrt` are both correctly rounded.
- Non-finite products also end the same way in both. A NaN dot product slips past one check (`abs(nan) > 1e-12` is false in both languages), but that vector's own norm check then rejects it.
- The norm-before-orthogonality loop order is unchanged, and the JS codec is unchanged.
- I found no other float `sum()` in the codec; the ZIP size sum adds integers only.

## The two new cases
- **Outside:** `frame-dot-rounding-outside` contains exactly the probe's parent frame. Its expected verdict is refuse, and in r1 both languages refused.
- **Inside:** `frame-dot-rounding-inside` changes only `v[0]`, from `0.04026214316938712` to `0.040262143169387116`. That lowers the dot product by roughly 0.879 × 6.9e‑18 ≈ 6e‑18, which is just enough to cross the ~5.6e‑18 margin. Its expected verdict is accept, and in r1 both languages accepted with the same key (`sha256:463eae79…`).
- The outside case is the one that tells the old and new Python apart. The inside case confirms the fix doesn't over-reject.

## Run outcomes and claim wording
- **r1 run:** the contract record shows 39 recursive plus 53 source cases (92), all five Python checks passing, the child taking 1.058 s, and cleanup confirmed. The units log shows 1,383 tests across 90 files with 0 failures.
- **Report:** it now states that the GPU path is float32 perturbation and that the iteration labels describe CPU semantics. It also notes:
  - the bindings are to the adapted native files, including their relocation edits;
  - several values are bound only by source hash;
  - the parent mapping and lineage are fixed in the checker;
  - the copy into `dist` is inert, and the 194-file baseline is the primary unchanged-runtime check.
- **Spec:** line 23 states that both codecs compute frame dot products in left-to-right binary64.
- **README:** line 206 documents `ATLAS_REFERENCE_PYTHON` and says a missing interpreter or NumPy cannot pass.

## Optional wording polish
- Report line 21 names only `contracts-r0/` directly above the r1 command. Line 36 covers r1, but naming both directories on line 21 would be clearer.
- In C2, "independently checked against the old source" was done by a reviewer reading the source, not by the checker. Saying so would be more precise.

## What I read, and what I couldn't check
- **Read:**
  - `recursive_recipe.py` lines 30–47, plus a search for other dot/`sum` uses;
  - the four frame evidence files;
  - both boundary corpus cases in full;
  - the r1 `contract.json` (searched for the frame cases, counts and cleanup);
  - the units-r1 summary;
  - the report (lines 9–50);
  - the frame wording on spec line 23;
  - README lines 204–206.
- **Not read:** the r1 evidence JSON, the build-r1 log, the unit test contents, and any other changed file.
- **Not checked:** I didn't verify any hash from bytes or re-run anything. I didn't independently compute the probe's dot product or establish which pair of vectors is the boundary one. I didn't confirm that the inside value is exactly one representable step from the outside value; it's consistent with that.
- **Carried forward:** my r0 limits still apply. No numerical equivalence across CPU and GPU, and no full headed gate, is claimed or implied.
