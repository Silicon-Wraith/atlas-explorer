# Project 0 — WebGPU remediation preregistration

**Revision:** 2  
**Authority:** execution decision E5, recorded at `61829a3`, and Project 0 specification §6.  
**Scope:** G5-A, G1-A and G1-C together constitute WebGPU’s single remediation cycle.  
**Sequence:** `webgpu-1` → joint classification → one committed change set → `webgpu-remediation` → closure.

This document fixes the numerical candidate, diagnostic method and acceptance criteria before GPU execution of the new arithmetic form. It authorises no expression search, threshold adjustment, fixture replacement or additional remediation cycle.

The G5 candidate remains the compensated dot product specified in revision 1. **It is conditionally valid on the compiled target, not guaranteed against all transformations permitted by WGSL.** Revision 2 adds predicted contraction failures and tests that detect them. It does not replace the candidate with an unproved compiler workaround.

The authors accept this risk for the single remediation cycle: the compiler may invalidate the compensation, and two preregistered contraction models predict failure of the frozen G5 tolerance. This risk must accompany presentation of the preregistration to the user. Acceptance requires the compiled implementation to pass every validation below.

## 1. Unchanged requirements

The governing specification, `fixtures.json`, its provenance and all 24 paths in `SOURCE_PATHS` remain unchanged.

In particular:

- G5 retains its effective f32 inputs, independent CPU references, exclusions, iteration counts and tolerances.
- G1 remains mandatory in both headed and headless modes.
- Missing or invalid mandatory evidence still makes qualification inconclusive.
- Original evidence remains available under its original implementation and launch identities.
- Browser sandboxing, GPU watchdogs, allocation limits, bounded waits and specification §7 stops remain binding.
- No native implementation, browser replacement, global driver change or host-package change is authorised.

Supplementary arithmetic witnesses specified here validate the implementation. They do not replace or modify the frozen qualification fixtures.

## 2. G5-A: fixed compensated quaternion update

### 2.1 Mathematical operation and scope

For input state \(q=(a,b,c,d)\) and parameter \(C=(C_r,C_i,C_j,C_k)\), evaluate:

\[
q'=\left(
a^2-b^2-c^2-d^2+C_r,\;
ab+ba+C_i,\;
ac+ca+C_j,\;
ad+da+C_k
\right).
\]

Use the same implementation for **both** `qjulia-plane` and `qjulia-offplane`, at every recurrence update. There is no branch for a fixture, sample index, iteration number, known coordinate or observed discrepancy.

The returned state remains one `vec4f`. Compensation is local to an update; no low component is carried between iterations.

Replace both existing `qsq(q) + C` call sites with the compensated update. Do not change the Mandelbulb recurrence, analytic fields, escape tests, norm/logarithm evaluation, iteration limits or output layout.

### 2.2 Exact evaluation order

The candidate uses `TwoProductFMA`, `TwoSum` and compensated dot-product accumulation.

In this pseudocode, `R` denotes binary32 round-to-nearest, ties-to-even **in the CPU model and mathematical analysis**. It is not a WGSL intrinsic or a claim that assignment to a temporary forces rounding.

`F(a,b,c)` denotes one correctly rounded fused multiply-add in the intended model.

```text
TwoProductFMA(a, b):
    p = R(a * b)
    e = F(a, b, -p)
    return (p, e)

TwoSum(a, b):
    s  = R(a + b)
    v  = R(s - a)
    aa = R(s - v)
    da = R(a - aa)
    db = R(b - v)
    e  = R(da + db)
    return (s, e)

CompDot(x[0..m-1], y[0..m-1]):
    (p, s) = TwoProductFMA(x[0], y[0])
    for i = 1 .. m-1:
        (h, r) = TwoProductFMA(x[i], y[i])
        (p, q) = TwoSum(p, h)
        t = R(q + r)
        s = R(s + t)
    return R(p + s)
```

Evaluate the components with these ordered operands:

| Component | `x` | `y` |
|---|---|---|
| Real | `[a, -b, -c, -d, Cr]` | `[a, b, c, d, 1]` |
| i | `[a, b, Ci]` | `[b, a, 1]` |
| j | `[a, c, Cj]` | `[c, a, 1]` |
| k | `[a, d, Ck]` | `[d, a, 1]` |

Every component uses the old state. Assemble the new vector only after computing all four components. Include the parameter inside the compensated sum; do not add it afterward.

The WGSL implementation uses explicitly typed f32 intermediates, ordinary multiplication for `p`, and the builtin `fma(a,b,-p)` for the product residual. Its source must follow this operation order.

No alternate ordering, factorisation, splitting algorithm, precision representation or compiler-option search is included. In particular, revision 2 does **not** replace `a*b` with `fma(a,b,-0.0)`.

### 2.3 Error analysis

Assuming the stated rounding, preserved operations and no relevant overflow or underflow, the primitives recover the exact product and addition residuals. For a dot product with exact sum \(S=\sum x_i y_i\), let \(A=\sum |x_i y_i|\), \(u=2^{-24}\), and \(\gamma_m=mu/(1-mu)\). The compensated result satisfies:

\[
|\widehat S-S|\le u|S|+\gamma_m^2 A.
\]

The correction reduces the cancellation-sensitive accumulation term to second order in \(u\); final rounding still contributes the first term. This justifies choosing the algorithm independently of the observed 2.75. The algorithm and bound follow [Ogita, Rump and Oishi, “Accurate Sum and Dot Product,” Algorithm 5.3 and Proposition 5.5](https://ogilab.w.waseda.jp/ogita/math/doc/2005_OgRuOi.pdf).

This is a local evaluation bound, not a promise that eight iterates satisfy G5. If \(\delta_n\) is the local update error, quaternion norm multiplicativity gives:

\[
\|\widehat q_{n+1}-q_{n+1}\|
\le
(\|\widehat q_n\|+\|q_n\|)
\|\widehat q_n-q_n\|+\|\delta_n\|.
\]

Earlier state errors can therefore grow. The frozen full-orbit comparison remains necessary. CPU preparation must check the range assumptions throughout the validation vectors and modelled qualification trajectories.

On the frozen off-plane orbit, Model F is identical to rounding each component’s exact polynomial once at every update. **This is not a lower bound on full-orbit error for every implementation retaining f32 state.** Different local rounding errors can partially cancel earlier errors. Model U’s smaller full-orbit ratio is itself a counterexample to that stronger claim.

### 2.4 Fusion, contraction and reassociation limitations

**This candidate is not robust to an unfused implementation of its explicit FMA, contraction into `TwoSum`, or destructive reassociation.**

WGSL permits reassociation and certain fusion, does not prescribe round-to-nearest throughout, and allows `fma` to execute as separate multiplication and addition. Typed temporaries do not remove those freedoms. [WGSL floating-point rules](https://www.w3.org/TR/WGSL/#floating-point-accuracy), [WGSL reassociation and fusion](https://www.w3.org/TR/WGSL/#reassociation-and-fusion), [WGSL `fma`](https://www.w3.org/TR/WGSL/#fma-builtin)

For example, set:

\[
a=1+2^{-23},\qquad b=1-2^{-24}.
\]

The intended `TwoProductFMA` returns:

```text
p = 1                  bits 3f800000
e = 2^-24 - 2^-47       bits 337ffffe
```

An unfused evaluation returns zero residual instead.

There is a separate contraction hazard. In `TwoSum(p,h)`, the operand `h = R(x[i]*y[i])` originates in a product. A compiler can potentially contract:

```text
s  = R(p + h)  into F(x[i], y[i], p)
db = R(h - v)  into F(x[i], y[i], -v)
```

The second transformation can count the product residual both in `db` and in the separately accumulated `r`.

E2 establishes contraction of related product-plus-value expressions on this target. It does not establish whether this new expression, whose product has several uses, will receive either transformation.

Vulkan confirms the concern: absent applicable controls, contraction and reassociation are permitted; the accuracy requirement for `GLSL.std.450 Fma` is inherited from multiplication followed by addition. Correct rounding of individual arithmetic instructions does not preserve an unprotected expression graph. [Vulkan floating-point environment and precision tables](https://docs.vulkan.org/spec/latest/appendices/spirvenv.html)

The exact models in §2.5 predict:

- contraction of `s` alone: maximum ratio **0.6605694682138076**;
- contraction of `db` alone: **2.28481606431775**;
- contraction of both: **2.191825015044041**.

The last two fail frozen G5. These predictions apply to the specifically defined models, not to every possible mixture of compiler transformations.

**The proposed `fma(a,b,-0.0)` wrapper is not a protected rounding boundary.** An allowed implementation can simplify it to multiplication and subsequently contract its consumer. Zero’s sign does not supply protection under WGSL’s rules. This is a conclusion about permitted transformations, not a prediction of the installed compiler’s actual choice. [WGSL floating-point differences](https://www.w3.org/TR/WGSL/#floating-point-evaluation)

For the witness above:

```text
R(F(a,b,-0.0) - 1) = 0
F(a,b,-1)           = 2^-24 - 2^-47
```

The wrapper produces the same ideal Model F results on all 1,024 supplementary update cases and the specified witnesses. That establishes model equivalence when its intermediate rounding is preserved; it does not establish that the compiler preserves it.

The inspected upstream Tint SPIR-V writer maps `fma` to `GLSL.std.450 Fma`. Seeing that instruction alone would therefore not prove a rounding barrier. This source inspection is not an inspection of the installed NVIDIA compiler’s generated instructions. [Tint SPIR-V writer](https://raw.githubusercontent.com/google/dawn/main/src/tint/lang/spirv/writer/printer/printer.cc)

No `strictMath` option is relied upon: Chrome’s documented support names Metal and Direct3D, not this Vulkan target. [Chrome developer features](https://developer.chrome.com/docs/web-platform/webgpu/developer-features)

### 2.5 CPU models and predictions

Prepare and commit five exact models before executing any GPU version of this candidate:

- **Model F:** the operation graph in §2.2, with correctly rounded fused evaluation only at explicit `F` calls.
- **Model U:** the same graph, but each explicit `F(a,b,c)` becomes `R(R(a*b)+c)`.
- **Model S:** Model F, except that each product-fed `TwoSum(p,h)` in `CompDot` uses `s = F(x[i],y[i],p)`.
- **Model DB:** Model F, except that each such call uses `db = F(x[i],y[i],-v)`.
- **Model SDB:** both replacements, otherwise Model F.

In these replacements, `p` means the incoming accumulated high component. Subsequent operations use the resulting `s` and `v`.

**U, S, DB and SDB are diagnostic negative controls. None is an acceptable fallback.** They do not change the separately tested standalone `TwoSum` primitive.

Implement fused rounding with exact integer or rational arithmetic. A binary64 multiply-add followed by `Math.fround` is not an acceptable exact-FMA oracle.

The models do not enumerate every WGSL-permitted transformation. Mixed contractions, transformations involving the initial product, reassociation and combined unfusing/contraction may produce other results. An unpredicted output cannot become acceptable by inventing a model afterward.

The following predictions were independently reproduced using Python rational arithmetic and JavaScript BigInt arithmetic:

| Model | Maximum off-plane component ratio | Location |
|---|---:|---|
| F | 0.8883912804919689 | Iterate 7, real |
| U | 0.6605694682138076 | Iterate 8, real |
| S | 0.6605694682138076 | Iterate 8, real |
| DB | 2.28481606431775 | Iterate 8, i |
| SDB | 2.191825015044041 | Iterate 8, i |

The complete predicted binary32 words, in real/i/j/k order, are:

```text
Model F
beee6666 3f866666 3d800000 be000000
bf8d77ff be361475 bd6e6666 3dee6666
3f79144b 3f98b5b5 3e03be25 be83be25
bf426ba4 4047c80b 3e802e63 bf002e63
c11ae4fc c07c3fff bec2b219 3f42b219
429a8642 429a39ba 40eb9a93 c16b9a93
c3782a63 463a326b 448e368c c50e368c
cd0d8a4f cab47faa c909dc64 4989dc64

Model U
beee6666 3f866666 3d800000 be000000
bf8d77ff be361474 bd6e6666 3dee6666
3f79144b 3f98b5b5 3e03be25 be83be25
bf426ba3 4047c80b 3e802e63 bf002e63
c11ae4fc c07c3ffd bec2b218 3f42b218
429a8642 429a39b9 40eb9a91 c16b9a91
c3782a00 463a326a 448e368b c50e368b
cd0d8a4e cab47f61 c909dc2c 4989dc2c

Model S
beee6666 3f866666 3d800000 be000000
bf8d77ff be361475 bd6e6666 3dee6666
3f79144b 3f98b5b5 3e03be25 be83be25
bf426ba3 4047c80b 3e802e63 bf002e63
c11ae4fc c07c3ffd bec2b218 3f42b218
429a8642 429a39b9 40eb9a91 c16b9a91
c3782a17 463a326a 448e368b c50e368b
cd0d8a4e cab47f72 c909dc38 4989dc38

Model DB
beee6666 3f866666 3d800000 be000000
bf8d7800 be361476 bd6e6666 3dee6666
3f79144f 3f98b5b6 3e03be26 be83be26
bf426ba1 4047c80f 3e802e67 bf002e67
c11ae502 c07c4000 bec2b21c 3f42b21c
429a8650 429a39c1 40eb9aa0 c16b9aa0
c3782872 463a3284 448e36a1 c50e36a1
cd0d8a76 cab47e59 c909db64 4989db64

Model SDB
beee6666 3f866666 3d800000 be000000
bf8d7800 be361476 bd6e6666 3dee6666
3f79144f 3f98b5b6 3e03be26 be83be26
bf426ba1 4047c80f 3e802e67 bf002e67
c11ae502 c07c4000 bec2b21c 3f42b21c
429a8650 429a39c1 40eb9aa0 c16b9aa0
c3782881 463a3284 448e36a1 c50e36a1
cd0d8a76 cab47e64 c909db6c 4989db6c
```

For each model, hash just its eight rows: lowercase eight-digit words separated by single spaces, LF line endings, including the final LF.

```text
F:
c73f4b529b67bbff1fcaeed98312ce367b08685d30c29b39610fd83075028301

U:
7f454fa613b9b0439a4d52dcba8651a8cbc0a36e11d431c7a54d0270f62c24c6

S:
4eb056b882d9ce00c88576aeaa0424ea9e9d6e2987a2b857ce6bf2604ac1347e

DB:
6221a8ba8bc5c3319b11ce5cc3c85651385bddb3f0d50581f8dd7feb377f0023

SDB:
29940152cdb885a8cdd0cee6ca5a4bdb9fbf9c6c10938f7373c22df143f53306
```

An independent correctly rounded exact-polynomial orbit has the same 32 words and hash as Model F. Record that equivalence without claiming global optimality of its orbit error.

Before GPU execution, also commit a **Model F plane artifact covering all 4,096 samples**, in frozen sample order. It must contain:

- the CPU-predicted escape status and index under the compensated recurrence;
- the comparison quantities and predicted outcome against the frozen complex reference for every eligible sample;
- the unchanged eligibility/exclusion information;
- the generator, serialization definition and artifact hash.

Compute the plane model’s norm and logarithm in binary64 and label these calculations, including escape decisions depending on them, **not bit-predictive of GPU execution**. The frozen GPU-versus-complex comparison remains authoritative.

If this CPU model predicts a frozen plane failure on any eligible sample, do not proceed to GPU execution of the candidate. Record the unsuccessful preparation and escalate under E5; do not search another form.

### 2.6 Fixed supplementary validation

Generate expected results on the CPU and commit their generator, data and hashes before the first new-form GPU run. Keep them outside the frozen reference files.

The suite contains the following tests.

**1. Primitive grid**

Form:

\[
V=\{0\}\cup\{\pm 2^e(1+k2^{-23})\},
\]

for \(e\in\{-20,0,20\}\) and

\[
k\in\{0,1,\texttt{0x3fffff},\texttt{0x400000},
\texttt{0x7ffffe},\texttt{0x7fffff}\}.
\]

Test all 1,369 ordered pairs in \(V\times V\) through both primitives.

**2. Discriminating witnesses**

Include:

- the product witness in §2.4;
- `TwoSum(1,2^-24)`, whose residual must be `2^-24`, bits `33800000`;
- the compensated dot product
  \[
  [(1+2^{-23})(1-2^{-24})]+[(-1)\cdot1],
  \]
  whose result must retain `2^-24 - 2^-47`, bits `337ffffe`;
- the two product-fed quaternion witnesses below.

The original three witnesses do not distinguish the S and DB contractions. The following witnesses are the first differing cases in the fixed generator’s order; indices are **zero-based**.

```text
S witness: case 26
Input q:
c040a42d 406a2b6f 3effa6ac 4061c3d9
Input C:
3f432d94 bfc4efac bf1b6f74 4040350e

Model F:
c182107c c1bc85bb c0673cd2 c191dd0a
Model S:
c182107b c1bc85bb c0673cd2 c191dd0a
```

```text
DB witness: case 1
Input q:
bf798023 bfc827fd bfcf02e6 bfeac58f
Input C:
3f311e22 c05df698 bf5666ff 3fbddc9b

Model F:
c0d90fe5 bed71c1c 401427b0 40a1defc
Model DB:
c0d90fe5 bed71c1b 401427b0 40a1defc
```

These are named members of the general suite, not replacement qualification fixtures.

**3. General quaternion updates**

Generate 1,024 independent one-step cases using xorshift32, initial state `0x504f3035`. For each generated word, apply, in order:

```text
state ^= state << 13
state ^= state >>> 17
state ^= state << 5
```

Reduce to unsigned 32 bits after each operation. Construct an f32 word using that word’s sign bit and low 23 fraction bits, with exponent field:

```text
125 + ((word >>> 23) & 3)
```

Consume eight words per case, in `a,b,c,d,Cr,Ci,Cj,Ck` order.

The independently reproduced numbers of cases differing from Model F are:

| Negative control | Differing cases |
|---|---:|
| U | 787 |
| S | 72 |
| DB | 600 |
| SDB | 607 |

Commit expected words for all five models.

For primitive tests, use an independent exact oracle to verify the rounded high component and the exact identity `high + low = exact operation`. Compare quaternion updates with Model F and independently evaluate their exact polynomial values.

Use runtime inputs, not shader constants containing the answers. Read back the results. Normalise positive and negative zero only for supplementary bit comparisons; reject nonfinite results.

Execute validation with the same helper source and compilation configuration as the qualification implementation. Record shader-source hashes, entry points and pipeline descriptors.

A separate validation entry point is supporting evidence, not proof of identical optimisation in another entry point. Therefore the **actual off-plane qualification entry point must also match all 32 Model F words**.

### 2.7 Acceptance and unsuccessful outcomes

Acceptance requires **all** of the following:

- Every supplementary primitive and update check passes.
- The actual off-plane output matches Model F’s 32 words.
- Every frozen off-plane component satisfies:
  \[
  |\mathrm{actual}-\mathrm{reference}|
  \le10^{-6}+10^{-5}|\mathrm{reference}|.
  \]
- The full frozen plane comparison passes, with unchanged eligibility and exclusions.
- Required dependent correctness checks pass.
- Evidence integrity, identity and supervision checks pass.

No “within one ULP of the model” allowance is introduced.

A frozen-tolerance violation is a numerical failure. A failed primitive identity, model mismatch or missing validation evidence makes the compensation **unvalidated**, even if the frozen numerical comparison passes. Record these observations separately.

When output matches a committed negative control, record that match and classify the compensation as unvalidated. Matching a model means the observations are consistent with that model; it does not prove which instructions the compiler emitted. Where observations match several models, retain all matches.

An unexpected result is not evidence of a WGSL violation merely because it differs from Model F.

Recompute validation results from saved raw data at evidence-read time. A saved `passed: true` flag is insufficient.

Any unsuccessful outcome closes this candidate. There is no switch to a negative control, alternate expression, different compensation algorithm, altered compiler setting or second GPU-driven attempt. Preserve the evidence and escalate under E5.

## 3. G1-A: selected-adapter Dawn diagnostic

### 3.1 Exact diagnostic route

Add this session-local launch flag to the remediation configuration:

```text
--enable-webgpu-developer-features
```

Use the installed Chrome executable and dedicated Project 0 profiles.

Read extended `adapter.info` from the **exact `GPUAdapter` object used to create the probe’s device**. Capture:

```text
vendor
architecture
device
description
isFallbackAdapter
driver
backend
type
vkDriverVersion
```

Record absent properties as absent; do not substitute values from another diagnostic.

Chrome documents these extended fields. Chromium obtains the information from the selected Dawn adapter handle, providing the connection missing from a standalone inventory. Availability of every required field on the installed Linux/Vulkan build remains to be established. [Chrome extended adapter information](https://developer.chrome.com/docs/web-platform/webgpu/developer-features), [Chromium `GPUAdapter` implementation](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/webgpu/gpu_adapter.cc)

Do not use the `chrome://gpu` **Dawn Info** inventory as the selected-adapter binding. Chromium constructs that inventory by enumerating adapters; it does not identify the adapter executing this probe. [Chromium Dawn information collection](https://raw.githubusercontent.com/chromium/chromium/main/gpu/config/gpu_info_collector.cc)

### 3.2 Binding to the run and device

For each G1 mode:

1. Record campaign/run ID, implementation identity, browser version, effective command line, owned profile, browser process identity and document/target identity.
2. Request one adapter through the existing acquisition path.
3. Snapshot its information before `requestDevice`.
4. Call `requestDevice` on that same retained object.
5. Snapshot its information afterward and capture `device.adapterInfo` when exposed. Present overlapping identity fields must agree.
6. Execute the G1 numerical probe on that device, retain its raw readback and verify its declared numerical result.
7. Capture complete `chrome://gpu` text from the same browser instance before teardown, using the reviewed shadow-DOM-aware collector.
8. Bind all evidence through the run manifest and artifact hashes.

The existing G1 Mandelbulb dispatch may remain. Verify its returned samples using the frozen arithmetic comparison; buffer length and status-range checks alone are insufficient.

No second `requestAdapter` call is permitted merely to obtain more convenient identification.

“Same browser” means the same owned browser instance and its selected Dawn adapter connection. Chromium is multiprocess; an arbitrary matching GPU-process PID alone is insufficient.

Apply the procedure separately to headed and headless G1. Headed evidence cannot corroborate another run’s headless adapter.

### 3.3 Matching rule

Corroboration requires:

- A completed, verified numerical probe on the bound device.
- Selected-adapter vendor, trimmed and case-normalised, equal to `nvidia`.
- Selected-adapter backend equal to `vulkan`.
- Selected-adapter type, trimmed and case-normalised, equal to `discrete gpu`.
- `isFallbackAdapter === false`.
- A selected-adapter `device` string satisfying the whole-string rule below.
- Exactly one ACTIVE GPU record selected by the reviewed record-selection rules.
- ACTIVE vendor ID `0x10de`.
- Numerical equality of selected-adapter and ACTIVE device IDs.
- The existing hardware-accelerated WebGPU status and unambiguous driver-record requirements.
- No contradictory identity evidence or relevant process/device-loss event.

After trimming, the selected-adapter `device` must match:

```regex
^(0x)?[0-9a-fA-F]{1,8}$
```

Parse the digits as hexadecimal. Any other form is unavailable. Substring extraction is forbidden.

For `chrome://gpu`, reuse `activeGpuDriver`’s reviewed record selection in `launch.mjs`: labelled records, unique record indices, nonempty record values and exactly one ACTIVE record. A legacy driver-only record does not supply device corroboration.

Within that selected ACTIVE record:

1. Extract `VENDOR=` and `DEVICE=` with the existing field boundary rule, `(?:^|[\s,])KEY=`.
2. Require exactly one occurrence of each.
3. Trim each extracted value.
4. Require a leading hexadecimal token `0x[0-9a-fA-F]{1,8}`, followed only by the end of the value or an optional bracketed-name suffix, with optional separating whitespace.
5. Reject a longer hexadecimal token or an attached non-name suffix; do not accept a valid prefix of malformed text.
6. Parse only the leading hexadecimal token.

The reviewed field extractor truncates at commas, including commas inside bracketed names. A truncated bracketed suffix is therefore permitted; it is not interpreted as identity.

The observed E1 forms are:

```text
VENDOR= 0x10de [Google Inc. (NVIDIA)]
DEVICE=0x26b1 [ANGLE (NVIDIA, Vulkan …)]
```

Preserve the space after `VENDOR=`. Do not require the field value to start immediately after `=`.

For the recorded host, the expected device ID is `0x26b1`. Observe it independently on both sides; never fill it in as a default.

Retain driver strings and `vkDriverVersion` as reported. Do not equate differently encoded driver-version strings without a separately justified decoding rule.

### 3.4 Outcomes and tests

| Observation | Disposition |
|---|---|
| Every matching condition holds | Corroborated; G1 may pass subject to its other checks. |
| Required diagnostic absent, redacted, malformed or ambiguously matched | Unavailable; G1 invalid/inconclusive. |
| Authoritative identity observations disagree | Conflicting evidence; G1 invalid/inconclusive, with the conflict retained. |
| Software execution established | G1 failure and specification §7 stop, regardless of other missing evidence. |
| Acquisition or numerical probe fails | No execution corroboration; preserve the exact failure and apply existing classification rules. |

Tests must reject:

- mismatched device IDs;
- a valid selected-adapter ID embedded in other text;
- overlong or malformed hexadecimal tokens;
- duplicate or missing ACTIVE-record fields;
- stale run bindings or changed process/document identities;
- multiple ACTIVE records;
- contradictory adapter/device information;
- software adapters;
- unverified readbacks.

Include positive cases for the observed whitespace and comma-containing bracketed names.

### 3.5 Launch and feature effects

The developer flag is a qualification diagnostic dependency and must be disclosed. No production reliance on nonstandard fields is inferred.

Chrome documents that the flag disables the browser’s 100 µs timestamp-query quantization. Label remediation timestamp values **“browser timestamp quantization disabled”** and do not compare them with attempt-1 timestamp values. This label does not claim unlimited hardware timer resolution. Timestamp diagnostics remain outside the frozen timing pass criteria. [Chrome timestamp-query behaviour](https://developer.chrome.com/docs/web-platform/webgpu/developer-features)

Keep the reviewed feature-request policy unchanged:

- G1 and the arithmetic/checks acquisition path request no optional features.
- The common rendering/session path and integrity probe request only `timestamp-query`, subject to the existing availability filter.
- No newly exposed feature is added to the request policy.

Record available adapter features and the granted feature list for every acquisition.

Where attempt 1 contains a comparable acquired-device record for that gate, mode and acquisition role, its granted feature set must equal the remediation set; a difference invalidates that gate’s evidence.

Where attempt 1 never acquired a device or never ran that gate, record the comparison as unavailable. Apply the preregistered request policy above and verify its granted-set calculation. **Do not require a nonexistent baseline record or infer its contents.**

The adapter’s available feature set may differ. Record that difference; availability is distinct from features requested for a device.

The flag exposes developer behaviour beyond identity reporting. Keep sandbox, watchdog and adapter-selection settings unchanged, and verify actual launch arguments and selected identity. Do not infer identical internal browser behaviour merely from an unchanged requested-feature list.

Applying the flag forces reruns of every gate, including previously passing timing gates. That cost is accepted; no attempt-1 gate evidence is reused.

## 4. G1-C: bounded headless diagnosis

### 4.1 Hypothesis and time limit

The hypothesis is premature teardown or loss of the browser/Dawn connection while `requestDevice` is pending.

The exact error text is consistent with callback cancellation during instance shutdown in Dawn, but does not establish the cause in this installed Chrome build. [Dawn device-request callback handling](https://dawn.googlesource.com/dawn/+/refs/heads/main/src/dawn/native/Adapter.cpp)

Diagnosis starts after `webgpu-1` has been classified and is capped at **four hours of active diagnosis and analysis**.

Record timestamped working intervals, their cumulative duration and the overall wall-clock span. Waiting for peer review is excluded and recorded separately. Review does not reset the accumulated diagnosis time.

If headless G1 in `webgpu-1` acquires a device and completes verified readback, make no G1-C correction. Handle its identity through G1-A alone.

### 4.2 Protocol

First inspect original records and code paths. Construct a timestamped sequence containing:

- adapter request and settlement;
- device request and settlement;
- cancellation and timeout events;
- navigation, document destruction, page close/crash and browser disconnect;
- observable GPU-process exit/restart;
- device destruction and harness cleanup.

Preserve exact error messages and browser stderr.

If evidence is insufficient, permit at most one instrumented diagnostic acquisition per mode: one headless reproducer and one headed control. Use the installed browser and attempt-1 launch configuration. Use a retained document, explicitly awaited acquisition and the existing bounded integer probe. Successful acquisition must be followed by verified dispatch/readback.

These runs are diagnostic evidence and cannot be selected into qualification.

Keep existing invocation deadlines and the five-second submitted-work progress limit. Every §7 stop requires preservation and reporting before any further run; the remaining diagnostic allowance is not automatic permission to retry a stop.

Interpretation:

- Teardown preceding cancellation supports a harness-lifetime explanation.
- A live document with an unexpected GPU-process disappearance supports a browser/GPU-process failure classification.
- A successful minimal reproducer alone does not identify the causal difference from the campaign.
- The error string alone proves none of these causes.

### 4.3 Admissible correction

A correction may:

- retain the document, browser connection and acquisition ownership until settlement or the existing abort;
- repair premature cleanup or a demonstrable asynchronous sequencing defect;
- correct a demonstrated session-local launch/configuration problem.

Every code correction needs a focused test that fails without it. Lifetime tests must cover successful settlement, rejection, cancellation and a late device arriving after abort. Destroy a late device and never install it as current.

Do not extend deadlines, suppress real loss events, automatically repeat acquisition, adopt another browser process, disable protection mechanisms or try a launch-flag matrix.

Any additional launch correction needs recorded causal justification and exact arguments, reviewed and frozen with the combined change set **before its first GPU execution**. Testing a proposed workaround is remediation, even under a development label.

Known cost: diagnosis uses the attempt-1 configuration, while a lifecycle or launch correction first executes under the final remediation configuration. There is no preliminary GPU rehearsal of the correction or flag combination.

### 4.4 Evidence not collectable

Record headless evidence as not collectable under the current protocol when:

- the four-hour diagnosis allowance expires without a justified admissible correction;
- further collection would require prohibited changes;
- the committed remediation still cannot acquire a usable device, complete verified readback and corroborate identity.

Preserve any established failure cause separately.

“Evidence not collectable” does not mean `requestAdapter` returned null, does not prove the GPU lacks support, and does not make headless G1 optional.

## 5. Sequencing and campaign selection

### 5.1 Attempt 1

Run `webgpu-1` only after the T10 campaign tooling and required preflight are approved.

Attempt 1 uses the reviewed attempt-1 implementation and flags. Do not insert the compensated arithmetic, developer flag or headless correction.

Preserve its manifest and classify every failed, invalid or unattempted gate through T10 Step 7. E2’s development evidence remains development evidence; it cannot replace a missing qualifying result.

### 5.2 Freeze the one change set

After classification:

1. Complete the bounded headless diagnosis, if needed.
2. Implement the fixed arithmetic and identity protocol.
3. Independently reproduce all five CPU predictions and generate the complete supplementary and plane artifacts.
4. Check the CPU plane prerequisite and arithmetic range assumptions.
5. Review CPU tests, evidence validation and any justified headless correction.
6. Commit the implementation, expectations, exact launch configuration and remediation history before executing the new form on the GPU.

The initial remediation arguments are the attempt-1 arguments plus:

```json
"--enable-webgpu-developer-features"
```

Any justified G1-C addition is fixed in the same `launch-remediation.json`. No subsequent flag-search cycle is authorised.

The first GPU validation of the new arithmetic belongs to this remediation attempt, including any new-form execution during preflight. There is no preceding development rehearsal.

### 5.3 Gates and reuse

**Request reruns of every mandatory gate, G1–G13. Reuse none.**

The developer flag changes launch identity, so T10 Step 7 requires a full rerun. This covers:

- both G1 modes;
- both G5 slots;
- G3 and G4 under the new implementation/configuration;
- acquisition/lifecycle effects on G2 and G13;
- all performance, resource and stability measurements.

The arithmetic change itself affects both G5 paths. Mandelbulb arithmetic is unchanged, but G4 still reruns because launch configuration changes.

Run the corrected integrity preflight against the final implementation and actual remediation flags.

The intended campaign command is:

```bash
node spikes/project0/campaign.mjs --name webgpu-remediation --args remediation --reuse '[]'
```

Supplementary compensation validation runs in the correctness phase, is bound to G5 evidence and is excluded from performance windows.

Existing phase prerequisites and live-stop behaviour remain in force. Requested full coverage does not require continuing through a stop or executing performance after failed correctness. Unexecuted gates retain their reasons.

### 5.4 Closure

Write the final manifest even when collection or validation fails. Keep unsuccessful validation records and original evidence.

The remediation history records:

- original classifications;
- this preregistration and its commit;
- the complete change set and launch configuration;
- CPU predictions and artifact hashes;
- actual validation and gate results;
- feature and timestamp-quantization disclosures;
- diagnosis intervals, stop reasons and missing evidence.

Close using the reviewed T10 closure tool and frozen decision procedure. All mandatory gates must pass before WebGPU can be selected.

If the candidate fails, compensation is unvalidated, identity remains unavailable or headless evidence remains uncollectable, close the cycle and escalate under E5. Do not start another numerical variant, silently reduce browser requirements or begin native work.

## 6. File and specification boundaries

Expected changes are confined to nonfrozen spike implementation, diagnostic collection, evidence validation, new remediation tests/data, launch configuration and reports.

Relevant implementation paths include:

- `spikes/project0/gpu/fields.wgsl`;
- `spikes/project0/gpu/arithmetic.wgsl`;
- acquisition and G1 driver modules;
- shared ACTIVE-record parsing in `spikes/project0/launch.mjs`;
- nonfrozen measurement/qualification modules validating additional evidence;
- `spikes/project0/launch-remediation.json`.

New CPU models and supplementary vectors belong in separately named remediation files, not frozen reference modules or `fixtures.json`.

**No governing-spec or frozen-source change is required by this protocol.**

**USER DECISION** is required for proposals to change frozen inputs, references, tolerances or exclusions; remove mandatory headless evidence; weaken corroboration; switch numerical form after GPU observation; permit another remediation cycle; or depart from E5’s browser requirement.

Replacing this compensated algorithm with software binary32 arithmetic would revisit the separately proposed G5-B option. It is not silently authorised as an implementation detail of this preregistration.
