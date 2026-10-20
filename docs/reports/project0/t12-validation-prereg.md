# T12 compensation validation: preregistration

**Status.** Committed with the T12 fix round 1 code, **before any GPU run of T12.** Nothing here has seen a GPU result.

**Authority.** Codex T12 r1 (run 20261020T172559Z-7d6c), finding 1, plus findings 2 and 5 for the window plan and the batch policy.

**Unchanged.** `fixtures.json` and the 24 frozen sources are not modified. The six frozen `fixtures.primitives` cases still apply under their own rule.

## Why this exists

The six frozen primitive cases cannot detect several eliminations.
- **TwoProduct residual and split.** Codex removed all TwoProduct residual recovery, and the six cases still passed: both `mul_ff_f32` cases have exact products. Eliminating `split` goes undetected in the same way.
- **`add_ff` cases.** Their inner sums are exact, so they pass whether or not compensation is eliminated.
- **Entry point.** The frozen cases run in the separate `primitives` entry point. They therefore say nothing about the arithmetic compiled inside `trace_ff_list`.

Compensation is reported as **validated** only when all three layers below pass. Otherwise it is **UNVALIDATED**, and the compensated results are not interpreted.

## Layer 1: the frozen cases

These are unchanged: the brief's rule, against `fixtures.primitives`, with tolerance 0.

## Layer 2: the supplemental primitive corpus

**Files.**
- **Corpus:** `spikes/project0/precision-validation/corpus-v1.json`.
- **Generator:** `spikes/project0/precision-validation/generate.mjs`. Run `--check` to verify and `--write` to regenerate. Regeneration is byte-identical, and a test checks this.
- **Pin:** `spikes/project0/precision-config.js`.

**Hashes.**
- **Corpus file sha256:** `63f644eba111707490b1a83a2eaddece986e074861ec1213e45782cd460d491c`
- **Expected-results sha256:** `42f2d5a344eccd89fbba8317003b6a2125f63665ef2f91e4b8840932f2615681` (the canonical JSON of the six `expected` objects)

**How the cases run.**
- They run in the same `primitives` dispatch as the frozen cases, after them, with the same op encoding.
- Each produced pair then feeds `add_ff(r, then)`.
- The page records the sha256 of the corpus bytes it actually used. Node refuses any other hash as an interpretation error, never as a validation failure.

| # | Operation | Exact result | Then-add leaves | What elimination loses |
|---|---|---|---|---|
| 0 | `mul_ff_f32((1+2⁻²³, 0), 1+2⁻²³)` | (1+2⁻²²) + 2⁻⁴⁶ | 2⁻⁴⁶ | TwoProduct residual; split (hi 1, lo 2⁻²³) |
| 1 | `mul_ff_f32((1+2⁻²³, 0), 1+3·2⁻²³)` | (1+2⁻²¹) + 3·2⁻⁴⁶ | 3·2⁻⁴⁶ | TwoProduct residual; split |
| 2 | `mul_ff_f32((−(1+2⁻²³), 0), 1+2⁻²³)` | −(1+2⁻²²) − 2⁻⁴⁶ | −2⁻⁴⁶ | TwoProduct residual, sign |
| 3 | `add_ff((1, 0), (2⁻²⁵, 0))` | 1 + 2⁻²⁵ | 2⁻²⁵ | TwoSum residual inside add_ff |
| 4 | `add_ff((1, 2⁻³⁰), (2⁻²⁵, 0))` | 1 + 2⁻²⁵ + 2⁻³⁰ | 2⁻²⁵ + 2⁻³⁰ | TwoSum residual, low-part path |
| 5 | `add_ff((1, 0), (−2⁻²⁵, 0))` | 1 − 2⁻²⁵ (rounding tie) | −2⁻²⁵ | TwoSum residual on a tie |

**How the expected values were derived.** They come from the statement-by-statement binary32 model of `compensated.wgsl` (`precision-validation/models.js`). The generator then proves each one error-free against the exact dyadic operation (`remediation/exact.js`). The expected values are therefore the exact results.

**Rule (value-exact).** As exact dyadic values:
- `hi + lo` must equal the expected `hi + lo`;
- `thenHi + thenLo` must equal the expected `thenHi + thenLo`.

Low-word bits are not compared. A legitimately fused residual, which WGSL permits, therefore passes.

## Layer 3: captures inside `trace_ff_list`

**What is captured.** `trace_ff_list` writes operand and result captures at its own arithmetic sites (the `capture_ff` binding at group 0, binding 7).
- The captures are always on, in the very pipeline the cost runs measure. They are not a separately specialised twin. The writes are part of the measured compensated kernel, and the report discloses this.
- **Captured rays:** global ray indices below `rays = 8` in every distance.
- **Captured steps:** steps below `steps = 16` of each ray.
- **Layout:** per ray and step, row 0 is `(t.hi, t.lo, inc, flag)`. Rows 1 to 3 are `(prod.hi, prod.lo, p.hi, p.lo)` for components x, y and z.
- **Flag:** 1 means the step continued by `inc = prof.k·de`; 2 means the step was evaluated and the ray ended; 0 means the step was not reached.

**Readback.** The capture buffer is read back once per distance, after its runs and outside every measured window. It is accounted in its own child allocator and reported as `captureBytes`.

**Site classes, each checked exactly against the true value:**
- **mul:** `prod` against `(t.hi + t.lo)·d_k`. Here `d_k` is the binary32 effective direction uploaded for that ray.
- **addOrigin:** `p` against `origin_k + prod`. The origin pair is the binary32 `originPairs` uploaded for the set.
- **addT:** the next step's `t` against `t + inc`.

**Bound.**
- A site passes when its exact error is at most 2⁻⁴⁰ × scale, or at most 2⁻¹²⁰ absolutely.
- **Scale:** `|t·d|` for mul, `|origin| + |prod|` for addOrigin, and `|t| + |inc|` for addT.
- Compensated float-float arithmetic errs by about 2⁻⁴⁴ of scale or less. Eliminated compensation errs by up to about 2⁻²⁴ of scale.

**Discrimination.** A site is *discriminating* when plain binary32 arithmetic would exceed the bound. Plain arithmetic here means `fl(t.hi·d_k)`, `fl(origin.hi + prod.hi)` and `fl(t.hi + inc)`. The checks are summed over all eight distances. Validation needs at least the following:
- mul: 64 discriminating sites;
- addOrigin: 64;
- addT: 32.

A capture that cannot detect elimination proves nothing, so fewer than these is UNVALIDATED.

**Malformed captures are interpretation errors**, not validation failures. This covers a wrong length, a flag other than 0, 1 or 2, a captured step after an uncaptured one, a non-finite value, or a captured ray beyond the set.

## Interpretation rule

**validated** = frozen cases pass ∧ supplemental cases pass ∧ no capture site exceeds its bound ∧ every discrimination minimum is met.

Otherwise compensation is **UNVALIDATED**:
- every failure is listed;
- the compensated trace is not compared;
- the baseline is still reported.

## Negative controls (CPU, `tests/precision-r1.test.mjs`)

Model variants generate the frozen results, the supplemental results and the captures, laid out exactly as the kernel writes them.

| Variant | Supplement | Captures | Validated |
|---|---|---|---|
| correct | 0 failures | 0 failures | yes |
| contracted (every multiply-add fused, as WGSL permits) | 0 | 0 | yes |
| TwoSum residual zeroed | 6 | 3641 | **no** |
| TwoProduct residual zeroed | 6 | 3072 | **no** |
| split = (a, 0), unfused | 6 | 3072 | **no** |

Under the TwoProduct and split variants, the six frozen cases alone still pass. That is Codex's reproduction.

## Batch policy (finding 5; `precision-config.js` `BATCH_POLICY`)

**Fixed parameters.** The policy changes batch size only, never rays, iterations or tolerance.
- initial batch 512;
- target 10 ms, with a band of 5 to 20 ms;
- batch sizes are powers of two in [64, 4096];
- at most 2 batches outstanding.

**Adjustment.** It is applied after every run, warm-up or measured, separately for each implementation and distance.
- **Per-batch duration:** `doneMs[i] − max(submitMs[i], doneMs[i−1])`.
- If the median duration over the run's full batches lies inside the band, the size is kept.
- Otherwise the next size is the largest power of two whose estimated duration (per-ray time × size) is at most 10 ms.

**Evidence and checks.**
- Every run keeps its size, its batch rows and its maximum outstanding count.
- Node recomputes the whole size sequence and each outstanding count. Any deviation is an interpretation error.

## Measured windows (finding 2; `supervision-plan.js` `WINDOW_PLANS.precision`)

- **Windows:** one per measured evaluation, `precision/<distance index>/<sample>/<baseline|compensated>`. That is 8 × 10 × 2 = 160 windows, in driver order. Warm-ups run outside windows.
- **Bound (supervisory, not a performance threshold):** 340,000 ms. This is `ceil(4096 / 64)` batches × the 5 s stall limit, plus the readback copy (5 s), its mapping (`MAP_DEADLINE_MS`, 5 s) and a 10 s margin.
