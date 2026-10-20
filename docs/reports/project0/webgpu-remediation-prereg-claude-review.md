# Claude peer review: WebGPU remediation preregistration, revision 1

**Document reviewed:** `webgpu-remediation-prereg.md` (Codex, `codex-T10-prereg-r1-findings.md`)
**Reviewer:** Claude, independent peer review under the co-authorship protocol
**Date:** 2026-10-19
**Scratch reproduction:** `/mnt/ml_storage/scratch/atlas-prereg-check/` (`model.mjs`, `lib.mjs`, `suite.mjs`). These use exact BigInt dyadic arithmetic with binary32 round-to-nearest-even and no binary64 shortcut.

## Verdict: ACCEPT WITH AMENDMENTS

The structure is sound and fails closed. The candidate is fixed before any GPU result. Acceptance includes a bit-exact match against a committed model, every failure closes the cycle, and the document never weakens the frozen tolerance, references or exclusions. I reproduced Codex's predictions exactly.

There is one substantive gap. The preregistration models only one way the compiler can depart from the source: the explicit `fma` being evaluated unfused. It does not model **contraction of the products that feed `TwoSum`**. That is the same transformation E2 has already shown this compiler performs. Under it, the candidate fails the frozen G5 tolerance. Amendments A1 and A2 deal with this. A3 to A6 are smaller precision fixes. None of them changes the candidate, a threshold or the scope.

## Point 1: G5-A is legitimate, not fitted

**1.1 The predictions reproduce exactly.** I wrote an independent model from §2.2's pseudocode and table.

| Model | Max ratio | Location | SHA-256 of the 8 rows |
|---|---:|---|---|
| F (exact FMA) | 0.8883912804919689 | iterate 7, real | `c73f4b52…028301` (matches §2.5) |
| U (unfused `F`) | 0.6605694682138076 | iterate 8, real | `7f454fa6…2c24c6` (matches §2.5) |

The F words match §2.5 row by row. The §2.4 witness also reproduces: `p = 3f800000` and `e = 337ffffe` under F, against `00000000` under U.

**1.2 The harness is validated against E2.** I ran the same model on the current `qsq(q) + C`. Fusing at `fma(a,a,-R(b²))` and at `fma(2a, y, C)` gives **2.7497713**, at iterate 8 in the i component. Fully unfused evaluation gives **0.6498**. Both agree with E2 (2.75 and 0.650), so the oracle reproduces the observed GPU failure.

**1.3 The 0.888 is the f32 floor, not a tuned number. This is the decisive point.** I also modelled a "CR" orbit: each component is the *correctly rounded exact polynomial* of the previous f32 state. Its hash is **identical to Model F** (`c73f4b52…`). On this orbit, the compensated dot product therefore delivers correctly rounded updates, and 0.8884 is the best any implementation that keeps an f32 state between iterations can do. There was no room to pick a form by its CPU ratio, because every sufficiently accurate local evaluation lands on the same 32 words.

The transcript says one formula was evaluated (`codex-T10-prereg-r1.out:9`), which is consistent with that. The choice rests on the textbook algorithm: Ogita, Rump and Oishi's Dot2 (their Algorithm 5.3). §2.2 is Dot2 line for line. The bound in §2.3 is their Proposition 5.5 with u = 2⁻²⁴, and the error-propagation inequality follows correctly from norm multiplicativity. The justification is independent of the observed 2.75. I deliberately did not evaluate any alternative form against the frozen fixture, because a reviewer doing that would reintroduce the fitting risk.

**1.4 The scope is right.**
- *G5 plane:* the plane recurrence is covered, because both `qsq(q)+C` call sites change (`arithmetic.wgsl:26,36`). No branch is made per fixture.
- *G4:* correctly excluded. The Mandelbulb step is the trigonometric power map followed by `w + p` (`fields.wgsl:26-49`). It is not a cancelling sum of products, it passed within its tolerance, and E5 scopes G5-A to "the quaternion sums of products". It is rerun anyway under §5.3.

**1.5 The margin is thin, and the document is right not to hide it.** Any deviation of more than about one ulp at iterate 7 fails. That is why A1 matters.

## Point 2: evaluation order and robustness to fusion

**2.1 The order is correct.** The operand table gives exactly a²−b²−c²−d²+Cr, 2ab+Ci, 2ac+Cj and 2ad+Ck. Cr is inside the compensated sum, and every component reads the old state. §2.4 is correct that the candidate is **not** robust to an unfused `fma`, and Model U covers that case.

Vulkan reinforces the point, although this rests on my recollection and must be confirmed against the Vulkan specification's "Precision and Operation of SPIR-V Instructions" table before the authors rely on it. As I recall, it specifies that the precision of `GLSL.std.450 Fma` is inherited from OpFMul followed by OpFAdd, so a fused result is not guaranteed. It also requires OpFAdd, OpFSub and OpFMul to be correctly rounded. On this target, the realistic threat is therefore contraction, which happens unless `NoContraction` is set, and Tint cannot express that from WGSL. Reassociation is a lesser threat.

**2.2 The unmodelled threat: products feeding `TwoSum`.** In `TwoSum(p, h)`, `h = R(x[i]*y[i])` is a raw product. It is an operand of
- `s = p + h`, which can contract to `fma(x,y,p)`, and
- `db = h - v`, which can contract to `fma(x,y,-v)`.

This is the pattern E2 says the GPU contracted: a product added to, or subtracted from, a non-product, as in `fma(2x, y, C)` and `fma(x, x, -y²)`. Contracting `db` double-counts the product residual `r`, which `t = q + r` adds back. My results:

| Variant (otherwise Model F) | Max ratio | Frozen G5 | Words differ from F | Mismatches in the 1,024 §2.6 cases |
|---|---:|---|---|---:|
| contract `s` only (S) | 0.6606 | passes | yes (`4eb056b8…`) | 72 |
| contract `db` only (DB) | **2.2848** (iter 8, i) | **fails** | yes (`6221a8ba…`) | 600 |
| contract both (SDB) | **2.1918** (iter 8, i) | **fails** | yes (`29940152…`) | 607 |
| Model U, for comparison | 0.6606 | passes | yes | 787 |

The acceptance logic still fails closed: any of these produces a Model F mismatch and so an "unvalidated" result. The trouble is that the preregistration:
- does not foresee this failure;
- has no committed models that would classify it, and §2.5 forbids inventing one afterwards;
- states in §2.4 only the unfused-`fma` and reassociation risks.

The single remediation cycle could therefore be spent on a failure that can be predicted from E2's own evidence. I cannot say whether NVIDIA's compiler contracts a product with several uses (`h` feeds both `s` and `db`). The risk is evidence-based, not hypothetical.

**2.3 The witnesses do not discriminate this case.** In the compensated-dot witness, the second product is (−1)·1, so `h = −1` exactly and `r = 0`. The contracted and uncontracted forms then agree. The primitive grid feeds `TwoSum` runtime operands, not products, so it cannot see the contraction either. Only the general update cases catch it, and only 72 of the 1,024 catch the S variant.

## Point 3: G1-A

**3.1 Availability on this host.** `google-chrome --version` reports **151.0.7922.108**. The installed binary (`/opt/google/chrome/chrome`) contains these strings:
- the switch `enable-webgpu-developer-features`, located among other command-line switches (`force-high-performance-gpu`, `enable-dawn-backend-validation`);
- the attributes `vkDriverVersion`, `d3dShaderModel`, `isFallbackAdapter`, `subgroupMinSize` and `memoryHeaps`;
- the adapter-type strings `discrete GPU` and `integrated GPU`, next to `AdapterPropertiesWGPU`.

That establishes that the mechanism is present in this build. It does **not** establish that the fields are exposed at runtime on Linux/Vulkan. §3.1 states this honestly, and "absent" maps to *unavailable*.

Chrome's developer-features page documents the feature through `chrome://flags`, not as a command-line switch. It describes `device` only as "a vendor-specific adapter identifier", with no format, which is why A4 is needed. It lists the type values as exactly "discrete GPU", "integrated GPU", "CPU" and "unknown".

**3.2 Binding to the selected adapter is correct by construction.** `adapter.info` is read from the same `GPUAdapter` on which `requestDevice` is called (`gpu/device.js:16-31`). The ban on a second `requestAdapter` and the per-mode binding are right. The document is also right to reject the `chrome://gpu` Dawn Info inventory as a binding.

**3.3 The matching rule is fail-closed in structure but under-specified in two places.**
- (a) "A `device` *containing* a complete hexadecimal ID" allows substring matching against an undocumented format.
- (b) The ACTIVE-record parse is not given an exact form. The existing reviewed parser (`launch.mjs:93-130`) extracts only `DRIVER_VENDOR` and `DRIVER_VERSION`, so a device-ID extraction is new code.

A4 tightens both.

**3.4 Sandbox and attempt-1 constraints.** The flag exposes features. It does not touch the sandbox or the watchdog: `chromiumSandbox: true` remains in `launch.mjs:67`, and attempt 1 is kept free of it (§5.1). It does have one documented behavioural side effect that the preregistration omits: **it disables the 100 µs timestamp quantization**. The timing driver, the probe and the common driver request `timestamp-query` (`browser/drivers/common.js:24`, `browser/probe.js:19`). Timestamps are diagnostic under spec §5, not pass criteria, so no gate's logic changes. Remediation timestamp records are still not comparable with attempt-1 records, and Chrome flags the change as a privacy relaxation, which is acceptable here because only the local harness is loaded. See A5.

**3.5 The full rerun is forced and correct.** The plan says a launch change reruns every gate, and `checkCoherence` refuses reuse across launch configurations. Applying the flag uniformly is also the right design: G1 evidence collected under one configuration cannot corroborate gates run under another. The cost should be stated, however. Gates that pass in `webgpu-1`, notably the timing gates, where E4 recorded an unexplained late request, are exposed again with no reuse.

## Point 4: G1-C

**4.1 The cap is consistent.** Four hours from a recorded start matches E5's "half a day". It includes execution and analysis, and it starts after `webgpu-1` is classified. A small precision fix: say how pauses for review are counted (A6).

**4.2 The protocol is sound.** It reads the records first, then allows at most one headless reproducer and one headed control, using the attempt-1 configuration, the existing deadlines and the existing §7 stops. The diagnostic evidence is excluded from qualification, and the interpretation rules correctly refuse to treat the error string as a diagnosis. The lifetime tests, including a late device destroyed after an abort, match the existing contract in `device.js:23` and `g1.js:17`.

**4.3 The admissible fixes are sound**, as are the prohibitions: no deadline extension, no suppression of loss events, no auto-retry, no flag matrix, and any launch correction justified and frozen before its first GPU execution. Two known costs should be stated:
- the reproducer runs under the attempt-1 flags, while the correction ships under the remediation flags, which include the developer flag, so it is committed without having run under its final configuration;
- a launch correction cannot be tested before the freeze.

Both follow correctly from the fail-closed rules.

**4.4 One small gap.** It does not say what happens if headless G1 in `webgpu-1` succeeds. I assume no G1-C correction follows; A6 makes that explicit.

## Amendments (exact text)

**A1. Add to §2.4, after "Both possibilities are tested, not assumed away.":**

> A third transformation is expected on this target. In `TwoSum(p, h)`, the operand `h = R(x·y)` is a product, so a compiler may contract `s = p + h` into `fma(x, y, p)` and `db = h − v` into `fma(x, y, −v)`. E2 established that this compiler contracts product-plus-value patterns. Vulkan does not forbid it without `NoContraction`, which WGSL cannot express. Under exact CPU models of the frozen off-plane orbit, contracting `s` alone gives a maximum ratio of 0.6606, contracting `db` alone gives 2.2848, and contracting both gives 2.1918. **If the compiled shader contracts `db`, this candidate is predicted to fail the frozen G5 tolerance.** The authors accept this risk for the single remediation cycle and record that it was foreseen. The user is informed of this risk when the preregistration is presented.

*(Recommended but not required: before acceptance, the authors may instead replace the candidate with a formulation chosen by structural analysis alone. In it, no rounded product may be an operand of an add or subtract except as the addend of an explicit `fma`. A Kahan-style FMA difference of products is the example to consider. Any replacement must be fixed by that analysis before any evaluation against the frozen fixture, and then predicted under the same model set.)*

**A2. Replace the first sentence of §2.5 and extend its model list:**

> Prepare and commit five models before executing any GPU version of this candidate. Models F and U are as defined below. **Model S** is Model F with `s = F(x[i], y[i], p)` in every `TwoSum`. **Model DB** is Model F with `db = F(x[i], y[i], −v)`. **Model SDB** applies both. Models U, S, DB and SDB are labelled diagnostic negative controls. None of them is an acceptable outcome or a fallback.
>
> Commit the 32 words and the row hash for each. The expected hashes are: S `4eb056b882d9ce00c88576aeaa0424ea9e9d6e2987a2b857ce6bf2604ac1347e`, DB `6221a8ba8bc5c3319b11ce5cc3c85651385bddb3f0d50581f8dd7feb377f0023`, SDB `29940152cdb885a8cdd0cee6ca5a4bdb9fbf9c6c10938f7373c22df143f53306`. Record that Model F is identical to the per-component correctly rounded orbit.

**Add to §2.6 item 2:**

> Add two named product-fed witnesses, taken from the general update cases: the first case, in generation order, on which Model S differs from Model F, and the first on which Model DB differs. Commit their indices and expected words.

**Add to §2.7, after "Record both observations separately":**

> A GPU output equal to a committed negative-control model is recorded as that model, and the compensation is unvalidated.

**A3. Replace the plane sentence in §2.5 ("CPU modelling of the plane recurrence must also precede GPU execution.") with:**

> Before GPU execution, commit a Model F plane artifact covering every one of the 4,096 samples: the escape status and index under the compensated recurrence, plus a hash. Commit with it the CPU-predicted outcome of the frozen complex comparison for every eligible sample, with the norm and logarithm computed in binary64 and labelled as not bit-predictive. If Model F predicts a frozen plane failure on any eligible sample, the GPU run does not proceed and the result is escalated under E5.

**A4. In §3.3, replace the `device` bullet and the ACTIVE equality bullet with:**

> - The selected-adapter `device`, after trimming, matches the whole string `^(0x)?[0-9a-fA-F]{1,8}$` and parses to an integer. Any other form is *unavailable*; substring extraction is not permitted.
> - In the single ACTIVE record isolated by the existing reviewed parser (`activeGpuDriver`'s record selection, `launch.mjs:93-130`), the `VENDOR=` and `DEVICE=` fields are read with that parser's own field rule (`(?:^|[\s,])KEY=`). Each must occur exactly once, and its value must begin with a hexadecimal token `0x[0-9a-fA-F]{1,8}`, optionally followed by a bracketed name. The observed E1 form is `VENDOR= 0x10de [Google Inc. (NVIDIA)]` and `DEVICE=0x26b1 [ANGLE (NVIDIA, Vulkan …)]`. Note the space after `VENDOR=`, and the commas inside the brackets, which the parser's known comma limit truncates after the token. Only the leading token is parsed.
> - The ACTIVE vendor token equals `0x10de`, and the selected-adapter and ACTIVE device integers are equal.

Add to §3.4's test list: a `device` string containing a valid ID embedded in other text must be rejected.

**A5. Add to §3.4, after "must be disclosed":**

> Chrome documents one behavioural effect of the flag: it disables the 100 µs quantization of timestamp queries. The remediation records label timestamp-derived values as unquantized and never compare them with attempt-1 timestamp values. For each gate, the *granted* feature list recorded by `acquire` must be identical to attempt 1's, and any difference makes that gate's evidence invalid. The adapter's *available* feature set is recorded and may differ, because `acquire` grants only the features it requested. The flag is a feature-exposure switch. It does not alter the sandbox, the watchdogs or adapter selection. Applying it forces reruns of gates that passed in `webgpu-1`, and that cost is accepted.

**A6. Add to §4.1:**

> The cap counts active diagnosis and analysis time, recorded as timestamped intervals. Time waiting for peer review is excluded and recorded. If headless G1 in `webgpu-1` acquires a device and completes verified readback, no G1-C correction is made. The headless identity is then handled by G1-A alone.

**Add to §4.3:**

> Known cost: a lifecycle or launch correction is diagnosed under the attempt-1 configuration and first executed under the remediation configuration, without a prior test.

## What I did not do

I did not edit the preregistration, any `spikes/` file or git. I made no GPU or browser run; the Chrome evidence comes from `--version` and string inspection of the installed binary only. I did not dispatch subagents.
