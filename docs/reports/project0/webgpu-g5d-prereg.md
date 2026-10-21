# WebGPU G5-D preregistration

Date: 2026-10-20  
Authority: execution decisions E7, E8 and E9  
Qualification profile: `project0-g5d-v1`  
Campaign: `webgpu-g5d`  
Revision: incorporates co-author amendments G5D-1–G5D-5

## 1. Scope and authority

This document fixes the G5-D workload, arithmetic formulation, reference, exclusions, predictions and acceptance rules before its first GPU execution.

E8 authorizes G5 qualification over operational quaternion orbits: initialization through first escape or iteration-budget exhaustion. E9 makes S0, S1, S2 and SB qualifying bands and S3 a mandatory measured, non-gating diagnostic band. E7 retains headed-only qualification.

The original plane comparison and numerical tolerances remain unchanged. The 24 frozen provenance sources, `fixtures.json`, its provenance, the original specification and previous preregistrations remain unchanged. This document and its authenticated qualification profile implement the amendments separately.

This is one additional qualification attempt under E8’s exception to specification §6. It grants no additional remediation cycle.

The preregistration is ready for implementation. The implementation, generated artifacts, profile hashes, offline shader validation and tests must receive co-author review before the campaign runs.

## 2. Historical findings remain unchanged

G5-D was authorized **after** the original failures. Its justification concerns the renderer’s operational stopping rule; it does not retrospectively change either failure.

The independent grounds are:

- The frozen plane comparison already stops at escape or budget exhaustion.
- Continuing an escaping orbit indefinitely is a different numerical workload.
- CPU-only input-sensitivity analysis identifies severe sensitivity in the frozen off-plane continuation.
- The new matrix is selected using the independent reference and the unchanged sensitivity criterion, without selecting on GPU or binary32-model outcomes.

The historical record remains:

| Campaign | Original G5 result | Frozen off-plane componentRatio |
|---|---|---:|
| `webgpu-1` | Fail | 2.7497713106862958 |
| `webgpu-remediation` | Invalid/inconclusive; numerical failure; compensation unvalidated | 4.744852004194964 |

The original plain GPU result matched the E2 contraction model on all 32 components. The compensated result matched none of its five preregistered models.

These observations do **not** establish that every binary32 evaluation fails, or that the compiler violated WGSL. In particular, the E2 contraction model itself reproduces the original failure. G5-D makes no promise of unfused evaluation or correctly rounded polynomial updates.

## 3. The single arithmetic kernel

Use the existing plain quaternion polynomial `qsq`, declared unchanged at `gpu/fields.wgsl` lines 52–54, wrapped as `q_update_g5d`. The following text, including its final LF, defines the **logical kernel fragment** whose hash is given below. It is not a file. Its first three lines are the existing `fields.wgsl` declaration, byte-for-byte.

```wgsl
fn qsq(q: vec4f) -> vec4f {   // (a,b,c,d)^2 = (a^2 - b^2 - c^2 - d^2, 2ab, 2ac, 2ad)
  return vec4f(q.x * q.x - q.y * q.y - q.z * q.z - q.w * q.w, 2.0 * q.x * q.y, 2.0 * q.x * q.z, 2.0 * q.x * q.w);
}
fn q_update_g5d(q: vec4f, c: vec4f) -> vec4f {
  return qsq(q) + c;
}
```

SHA-256, recomputed and unchanged:

```text
290b4cc6ef4a608da0e44f3cdafb0ed52943e3c37aee9292167fb24a5a90a78c
```

This choice restores the direct polynomial and removes reliance on the experimentally unvalidated compensation mechanism. It is within E8’s authorized kernel-choice scope.

The operational entry point, plane entry point and fresh eight-iterate diagnostic must call this same function. No fixture-specific arithmetic branch is permitted. Inputs must come from runtime buffers.

The complete concatenated shader source and pipeline descriptors must also be authenticated. The fragment hash alone is insufficient to establish the executed implementation.

If selected, Project 1 inherits this named formulation and its qualified scope. G5-D does not validate compensated arithmetic, perturbation or accurate post-escape continuation.

## 4. Reference, escape and comparison semantics

### 4.1 Independent reference

The reference state and arithmetic are binary64. Each step reads the complete old state:

```js
function step(q, C) {
  const [a, b, c, d] = q;
  return [
    a*a - b*b - c*c - d*d + C[0],
    a*b + b*a + C[1],
    a*c + c*a + C[2],
    a*d + d*a + C[3],
  ];
}
```

Use ordinary JavaScript operation order as shown, `Math.hypot` for the norm and `Math.log` for its natural logarithm. Do not implement the reference by calling a candidate binary32 model.

The budget is **128 updates**.

### 4.2 Certified escape radius

For effective binary32 parameter \(C\), the mathematical bound is

\[
R_*(C)=\max\left(2,\frac{1+\sqrt{1+4\lVert C\rVert}}2\right).
\]

The supplied radius is the **least binary32 number \(R\ge2\)** satisfying

\[
R^2(R-1)^2\ \ge\ \sum_{j=0}^{3} C_j^2.
\]

Certify this inequality using exact dyadic arithmetic. Start from a binary64 estimate rounded to binary32, advance with `nextUp` until certified, then step downward while the preceding binary32 value remains at least 2 and certified.

This proves upward rounding of the bound without relying on the binary64 square root’s last bit. The inequality is equivalent to \(R(R-1)\ge\lVert C\rVert\) because \(R\ge2\).

The CPU reference and GPU use this same binary32 radius. Pass it as a runtime input; do not recompute it in WGSL.

### 4.3 Escape and returned observations

Test \(\lVert q_n\rVert>R\):

1. At initialization, \(n=0\).
2. After each update, \(n=1,\ldots,128\).

The GPU tests `length()` of its own state. The reference tests its binary64 norm. Equality with \(R\) is not escape.

Return, for every sample:

- status: `escaped`, `budget`, or `failure`;
- first escape index, or `null` when the budget is exhausted;
- \(\ln\lVert q_e\rVert\) on escape, otherwise `null`;
- raw binary32 words for every completed update through escape or budget exhaustion;
- the update count and any numerical-failure location.

An initial escape has index 0, a log-radius observation and no update rows. It never counts toward update coverage. A budget result has 128 update rows and **null** escape index and log-radius.

### 4.4 Qualifying comparisons

For each qualifying sample:

- Status and escape index must match exactly.
- Compare every component through the reference escaping iterate, including that iterate.
- For a budget result, compare all 128 updates.
- Component tolerance remains
  \[
  |a-r|\le10^{-6}+10^{-5}|r|.
  \]
- Escaping log-radius relative tolerance remains \(10^{-5}\).

A status or index disagreement is a **failure**, never a retrospective exclusion. Common-prefix component comparisons are then diagnostic. A numerical failure or nonfinite required component is also a failure.

Missing, malformed or unauthenticated evidence is invalid/inconclusive. A valid numerical disagreement must not be converted into invalid/inconclusive merely because it fails a numerical requirement.

The plane slot retains its existing frozen comparison, exclusions and metrics.

### 4.5 Sensitivity screen

Apply `nextDown` and `nextUp` independently to each of the eight effective binary32 inputs, in order:

```text
q.real, q.i, q.j, q.k, C.real, C.i, C.j, C.k
```

Hold \(R\) at the unperturbed sample’s certified value.

Exclude a sample from qualification if any neighbour:

- changes status or escape index;
- changes any compared component by more than one quarter of that component’s tolerance, evaluated against the unperturbed reference;
- changes escaping log-radius by more than one quarter of its tolerance.

Compare common update rows when recording component reasons for neighbours with different escape indices.

**Compare escaping log-radius whenever both the neighbour and the unperturbed sample escape, regardless of escape index, as in the frozen `reference/sensitivity.js` rule. The canonical-matrix hash in §5.8 is defined under this reading.**

Record all reasons, with coordinates visited in the order above and directions `down`, then `up`.

This is the sole numerical exclusion rule. Model predictions and GPU results never change eligibility.

Under E9, the selected S3 samples remain diagnostics regardless of their measured accuracy. A favourable GPU result does not promote them into qualification.

## 5. Deterministic matrix generator

Implement `spikes/project0/qualification/g5d-matrix.mjs`.

Generation was performed with Node **v20.20.2**. The generated artifact and hashes below are authoritative; reproduction differences must be investigated before GPU execution.

### 5.1 PRNG

Each stream starts independently at seed `0x47354431`.

```js
function splitmix32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}
```

Convert each word to \(U=\text{word}/2^{32}\). Draw indices are zero-based. Round requested input components using binary32 round-to-nearest, ties-to-even, and record both requested values and effective words.

### 5.2 Uniform stream

Generate exactly **250,000 draws**.

Consume eight random values per draw, first four for \(q_0\), then four for \(C\):

```js
requested = [
  ...fourValues.map(u => 3*u - 1.5),
  ...nextFourValues.map(u => 2*u - 1),
];
effective = requested.map(Math.fround);
```

The requested boxes are \([-1.5,1.5)^4\) and \([-1,1)^4\). These samples have certified \(R=2\).

Classify by reference escape index:

| Band | Reference result |
|---|---|
| S0 | Escape at 0–3 |
| S1 | Escape at 4–7 |
| S2 | Escape at 8–31 |
| S3 | Escape at 32–128 |
| SB | No escape within 128 updates |

Select, in generation order:

- First 64 eligible S0 samples with \(e>0\).
- First 64 eligible S1 samples.
- First 32 eligible S2 samples.
- First 32 eligible SB samples.
- First 16 eligible cancellation samples, unioned with the preceding selections.
- First 32 S3 samples, regardless of eligibility, as diagnostics.

A cancellation sample has some compared reference iterate \((a,b,c,d)\) satisfying

\[
a^2\ge0.25,\quad b^2+c^2+d^2\ge0.25,
\]
\[
|a^2-(b^2+c^2+d^2)|
 \le2^{-8}\max(a^2,b^2+c^2+d^2).
\]

A draw selected by several rules appears once. Do not replace overlapping selections to enlarge the matrix.

### 5.3 Near-neutral diagnostic stream

Generate exactly **250,000 draws**, resetting the same seed. Consume five random values per draw:

```js
const theta = 2*Math.PI*U0;
const k = 3 + (Math.floor(i/2) % 12);
const sign = i % 2 === 0 ? 1 : -1;
const rho = 1 + sign * 2**(-k) * (1 + U1);
const x = rho * Math.cos(theta);
const y = rho * Math.sin(theta);
const axis = [2*U2 - 1, 2*U3 - 1, 2*U4 - 1];
const norm = Math.hypot(...axis);

requested = [
  0, 0, 0, 0,
  x/2 - (x*x - y*y)/4,
  ...axis.map(a => (y/2 - 2*x*y/4)*a/norm),
];
```

A zero-length axis is a generator error, not permission to redraw. None occurred.

Select the first **32 S3 samples**, regardless of eligibility, as diagnostics. No qualifying samples come from this stream.

The structural justification is \(q_*=\mu/2\), \(C=\mu/2-\mu^2/4\): sampling \(\mu\) near the unit circle targets near-neutral fixed-point dynamics. Rotating the imaginary direction embeds the complex slice in quaternion space.

This deliberately changes the parameter distribution. It is independent of candidate arithmetic outcomes; it is not a claim of statistical uniformity or independence from mathematical sensitivity.

### 5.4 Mandatory radius checks

For \(i=0,\ldots,7\), let \(s_j=+1\) when bit \(j\) of \(i\) is set, otherwise \(-1\). Use

\[
C=(3,s_0/4,s_1/2,3s_2/4).
\]

Add both:

\[
q_0=(17/8,s_0/8,s_1/8,s_2/8),
\]
\[
q_0=(5/2,s_0/8,s_1/8,s_2/8).
\]

The certified radius for all 16 cases is:

```text
word: 4015e10d
value: 2.3418610095977783
```

The first group escapes at update 1; the second escapes at initialization. All 16 pass the sensitivity screen and are mandatory qualifying checks.

The first group starts outside radius 2 but inside the certified radius. Consequently, incorrectly hard-coding radius 2 changes its escape index.

### 5.5 Case identities and artifact serialization

IDs are:

- `U` followed by the uniform draw index, padded to six decimal digits;
- `N` followed by the near-neutral draw index, padded likewise;
- `R000000`–`R000007` for the update-1 radius cases;
- `I000000`–`I000007` for the initial-escape cases.

Sort the final cases lexicographically by ID.

Create this matrix object:

```text
{
  schema: 1,
  id: "project0-g5d-v1",
  budget: 128,
  seed: "47354431",
  cases: [...]
}
```

Each case contains exactly:

```text
id, source, index, requested, inputWords, radiusWord,
band, eligible, role, screen, reference
```

Values and meanings:

- `source`: `uniform`, `neutral`, or `radius`.
- `index`: stream index, or radius-case index.
- `inputWords`: eight lowercase, eight-digit hexadecimal words.
- `radiusWord`: the radius in the same word format.
- `role`: `qualifying` or `diagnostic`.
- `screen`: `{eligible, reasons}`.
- Each reason: `{coordinate, direction, changed}`.
- `changed` contains applicable strings in this order: `status/index`, `component`, `logR`.
- `reference`: `{e, rows, log}` using the reference in §4; `e` and `log` are null on budget exhaustion.
- `rows` contains update states only, not \(q_0\).

For radius cases, `requested` equals the exact effective input values.

Serialize with the existing `canonical()` function, followed by one LF. Do not edit that frozen function.

Commit the complete artifact as:

```text
spikes/project0/qualification/g5d-matrix.json
```

### 5.6 Achieved counts

The full preparation streams produced:

| Stream | Band | Draws | Eligible, excluding initial escape |
|---|---|---:|---:|
| Uniform | S0 | 236,492 | 176,142 |
| Uniform | S1 | 10,749 | 6,011 |
| Uniform | S2 | 1,992 | 188 |
| Uniform | S3 | 113 | 0 |
| Uniform | SB | 654 | 448 |
| Near-neutral | S0 | 0 | 0 |
| Near-neutral | S1 | 4,740 | 3,702 |
| Near-neutral | S2 | 22,643 | 1,910 |
| Near-neutral | S3 | 19,694 | 0 |
| Near-neutral | SB | 202,923 | 54,657 |

The uniform S0 draw count includes 56,992 initial escapes.

The final matrix contains **287 distinct samples**:

| Disposition | Count |
|---|---:|
| Qualifying S0 with updates | 86 |
| Qualifying initial escapes, not update coverage | 8 |
| Qualifying S1 | 65 |
| Qualifying S2 | 32 |
| Qualifying SB | 32 |
| Diagnostic S3, uniform | 32 |
| Diagnostic S3, near-neutral | 32 |

Thus:

- **223 qualifying samples**, including eight initial-escape checks.
- **64 S3 diagnostics**, all excluded by the sensitivity screen.
- **19,108 required reference components** across qualifying update rows.
- **16 qualifying cancellation samples**.
- **215 qualifying samples** have \(|q_j|\ge0.1\) or \(|q_k|\ge0.1\) at a compared iterate.
- All 32 SB samples exercise 128 updates.
- The selected S2 escape indices are 8–11. The band label does not claim exhaustive validation of every index through 31.

### 5.7 Freshness

Compare complete effective eight-word \((q_0,C)\) tuples against:

- 4,096 frozen plane tuples, embedded with zero j/k components;
- one frozen off-plane tuple;
- 1,024 remediation general-update tuples.

These form **5,121 distinct prior tuples**. Neither preparation stream nor any selected case collides with them. The selected matrix also contains no internal duplicate tuple.

A collision is a preparation error requiring review. It is not permission to skip the case and silently take another.

The frozen off-plane tuple is used only for the separately identified historical-continuation diagnostic.

### 5.8 Hashes

Input-stream serialization is eight lowercase, eight-digit hexadecimal words separated by single spaces, followed by LF for each tuple.

```text
Uniform stream, all 250,000 draws:
e5eb0b35931264f42508b7856ba872c244ddc73eacd806a0520f5bb958755823

Near-neutral stream, all 250,000 draws:
ba0375e40e22131e019869e26814396b58c365b3806a1ec47d60e543526540c1

Final 287 effective tuples, in case-ID order:
df6d9cb78cd9f159bd33491d14cf70e4e560446eb42a8040aab525d8764dcc79

Canonical matrix object plus LF:
b74ecc9e404ace915fe59fd7e4ea0acb097743157e376bff2edf45f19663c96e

Prior 5,121 tuples, unique and lexicographically sorted, each followed by LF:
4c1e21e80cbb1e07ae3d72cb4efc829cdd0e84f01392a4a982e78fc7f0629c10
```

The matrix hash was recomputed under §4.5’s explicit both-escaped log-radius rule and is unchanged.

The earlier 20-million-draw uniform feasibility search remains preparation history, not an additional selection pool:

```text
42f0d2c26bc7173ebc43ede1daf8ecfa611a99ae0c4d683926c633b3edd1de5b
```

It produced zero eligible S3 cases. Neither that search nor the near-neutral search proves that no eligible S3 input exists anywhere.

## 6. CPU predictions fixed before GPU execution

### 6.1 Models

Use exact dyadic arithmetic with explicit binary32 round-to-nearest, ties-to-even. A binary64 multiply-add followed by `Math.fround` is not an exact FMA model.

Let:

- \(R(x)\): correctly rounded binary32 value of exact \(x\);
- \(F(a,b,c)=R(ab+c)\);
- \(q=(a,b,c,d)\);
- \(t=R(2a)\).

All components use the old state.

**U — unfused source-order evaluation**

```text
real = R(R(R(R(R(a*a) - R(b*b)) - R(c*c)) - R(d*d)) + Cr)
imag(v, Cv) = R(R(t*v) + Cv)
```

**F — E2 contraction graph**

```text
r = F(a, a, -R(b*b))
r = F(-c, c, r)
r = F(-d, d, r)
real = R(r + Cr)
imag(v, Cv) = F(t, v, Cv)
```

**A — a fixed reassociated graph**

```text
s = R(R(R(b*b) + R(c*c)) + R(d*d))
real = R(F(a, a, -s) + Cr)
imag(v, Cv) = F(t, v, Cv)
```

**Q — correctly rounded exact polynomial per component**

```text
real = R(a*a - b*b - c*c - d*d + Cr)
imag(v, Cv) = R(2*a*v + Cv)
```

Q is an ideal local-rounding comparison, not a claim about compiler behaviour.

Each model retains binary32 state between updates. Its escape test and log-radius use binary64 `Math.hypot` and `Math.log` of that state. These norm/log calculations are explicitly **not bit predictions for WGSL `length` and `log`**.

These four graphs do not enumerate every permitted compiler transformation. GPU agreement with a model is diagnostic; unlike G5-A, bit-exact agreement with one named model is not an acceptance requirement.

### 6.2 Operational predictions

Every model predicts:

- 223/223 qualifying samples pass;
- zero qualifying status/index disagreements;
- zero qualifying component or log-radius failures;
- no binary32 subnormal/underflow rounding or overflow during these model executions.

| Model | Maximum qualifying componentRatio | Maximum qualifying logRRatio | S3 samples outside numerical criteria | S3 status/index disagreements |
|---|---:|---:|---:|---:|
| U | 0.2752085455 | 0.1192017236 | 62/64 | 1 |
| F | 0.2193153862 | 0.1138465589 | 60/64 | 1 |
| A | 0.2660767700 | 0.1427108871 | 61/64 | 0 |
| Q | 0.3038225199 | 0.1058427698 | 61/64 | 1 |

The S3 results remain diagnostic and are not hidden by the qualifying totals.

### 6.3 Prediction hash format

For every case, in matrix order, hash this header:

```text
<ID> <escaped|budget> <escape-index|-> <number-of-update-rows>\n
```

Follow it with each update row as four lowercase, eight-digit hexadecimal words, separated by single spaces and terminated by LF.

Normalize either sign of zero to `00000000` for these diagnostic model hashes. There is no blank separator between cases. Log-radius is excluded from the word hash and stored separately.

Operational prediction hashes, covering all 287 samples:

```text
U  f331de400e4631c83dabd55419d34bd2dbc8475391461918cd1c122ebd83144c
F  ad303936aaa072ad23286c5a437fde6da81051911be81e8f51fa39950a42d069
A  6228bc8e34efd493fff204c72d5a83b0fe7cf19be15e4439e61dedb5b3862703
Q  5c90e2e3ca57576bca1367161dd2a1ac5b14e6ee60eb5765d3b22b554926b07d
```

### 6.4 Plane predictions

Model all 4,096 plane inputs. Keep the frozen 3,684 eligible cases and 412 diagnostics unchanged.

All four models predict zero eligible status/index disagreements and no eligible numerical failures.

| Model | Maximum eligible logRRatio |
|---|---:|
| U | 0.3336865173 |
| F | 0.3686866083 |
| A | 0.3686866083 |
| Q | 0.2322788006 |

Hash the model orbits with the preceding framing, using IDs `P0000` through `P4095`:

```text
U  41bc5d92adecf79818aec71b8d202f7bbc659d4365a7c00ed9dad64d24daac0f
F  48967bc57e3f267ff49b57c07fee48951e99e4e345aa1d91a3246a4f879ba9b8
A  48967bc57e3f267ff49b57c07fee48951e99e4e345aa1d91a3246a4f879ba9b8
Q  bd031e7309be0753fef189c461b5a8d4389787d2b69284c8925dfd42e7300406
```

Store predicted status, index and binary64 log-radius separately. These predictions do not alter the plane gate.

### 6.5 Forced-continuation diagnostic predictions

Execute exactly eight updates of the frozen off-plane input in each model, ignoring escape for this diagnostic only.

| Model | Original frozen componentRatio |
|---|---:|
| U | 0.6497890097 |
| F | 2.7497713107 |
| A | 0.6497890097 |
| Q | 0.8883912805 |

Hash eight four-word rows, each terminated by LF, without a case header:

```text
U  29f1055f3644e33b2e814d2c043b6109250ebb736f51fd50b97ba4398af0e81f
F  d8889f1838ae0a29b6e4e0a00ec1926efbed8245718bcc78fcc277bc0c17f31f
A  8f9c858d796666a1eb2f45633b9b77c2e2cabd6738e88d5e931ad2a455010899
Q  c73f4b529b67bbff1fcaeed98312ce367b08685d30c29b39610fd83075028301
```

### 6.6 Independent checks and selection prohibition

An independent 80-digit decimal recurrence reproduced the escape classifications and sensitivity eligibility of all 287 selected samples. It checked 4,879 baseline/neighbour orbits. Baseline components at 80 and 120 decimal digits rounded to the same binary64 values.

For qualifying samples and their neighbours, the largest observed binary64-reference component discrepancy against the decimal calculation was approximately \(5.84\times10^{-10}\) of the component tolerance.

The qualifying matrix detects each prescribed mutation:

| Mutation | Qualifying samples failing |
|---|---:|
| Set updated j to zero | 215 |
| Set updated k to zero | 215 |
| Set both to zero | 215 |
| Ignore \(C_j,C_k\) | 215 |
| Reverse the sign of \(2ad\) | 215 |

The eight initial-escape checks perform no update and therefore do not detect these update mutations.

Claude independently reproduced the stream and matrix hashes, counts, freshness, radius certification, kernel hash, all 12 model hashes and mutation results using a separately written binary64 reference. That reproduction did not independently repeat the decimal check.

CPU predictions are not eligibility rules. No model failure authorizes removing a case, changing a seed, changing a kernel or revising the matrix until a pass appears. A prediction discrepancy during implementation requires investigation and review, with the preparation history preserved.

## 7. Evidence and acceptance

### 7.1 Required records

Under `project0-g5d-v1`, G5 requires:

- the unchanged `G5/qjulia-plane` slot;
- the new `G5/qjulia-operational` slot.

The original `G5/qjulia-offplane` is removed from the required selection only under this profile. Its fresh eight-iterate observation remains a mandatory, authenticated diagnostic.

Collect all 287 operational samples, including S3. Store raw words, input/matrix identity, output counts, statuses, indices, log-radius words, shader identity and pipeline descriptors.

Preserve each completed readback immediately. A later failure must not discard earlier batches, the plane observation or the forced-continuation diagnostic.

### 7.2 Numerical verdict

The operational slot passes only when:

- every qualifying sample satisfies §4;
- all required samples and diagnostics were collected and authenticated;
- the workload and implementation match the profile;
- no invocation invalidation or applicable stop condition invalidates the evidence.

Use finite count metrics for status, index and numerical failures. Do not encode a numerical failure as an infinite JSON metric. Keep observed nonfinite words and their locations in raw evidence.

Report at least:

- total samples: 287;
- qualifying samples: 223;
- diagnostics: 64;
- expected qualifying reference components: 19,108;
- qualifying status, index and numerical-failure counts;
- qualifying maximum componentRatio and logRRatio;
- separate per-band and S3 diagnostics.

**A correctly collected S3 status, index or numerical disagreement does not fail G5-D.** Missing or corrupt S3 evidence is still an evidence defect. E9 does not waive specification §7’s device-loss, hang, watchdog, allocation or software-execution stops.

Recompute all numerical observations from authenticated raw data at every read, including invalid and partial records. Preserve the existing distinction between an honest synthetic `incomplete` invocation and an actual numerical slot.

### 7.3 No reinterpretation after execution

The first GPU output cannot change:

- the kernel;
- the selected cases or roles;
- the radius rule;
- the screen;
- tolerances;
- model definitions;
- acceptance or disclosure rules.

Unexpected arithmetic is recorded and analyzed. There is no variant search inside this attempt.

## 8. Profile and implementation instructions

All paths below are under `spikes/project0` unless explicitly stated otherwise.

### 8.1 New CPU artifacts

Add:

- `qualification/g5d-reference.mjs`: §4 reference, certified radius and screen.
- `qualification/g5d-matrix.mjs`: §5 deterministic generation and freshness audit.
- `qualification/g5d-matrix.json`: complete canonical matrix.
- `qualification/g5d-models.mjs`: exact U/F/A/Q graphs and prediction serialization.
- `qualification/g5d-predictions.json`: operational, plane and continuation predictions, logs and summaries.
- `qualification/g5d-metrics.mjs`: raw decoding, validation and numerical derivation.
- `qualification/g5d-v1.json`: authenticated amendment profile.

The exact dyadic primitives in the existing remediation model may be reused without changing their semantics.

Commit the generator, reference, models, artifacts and their hashes before GPU execution. Pin source-file hashes as well as generated-data hashes. Never regenerate the matrix during a GPU campaign.

### 8.2 Amendment profile

Register only the explicit ID `project0-g5d-v1`, at the fixed path above, with its actual SHA-256.

The profile must bind:

- campaign `webgpu-g5d`;
- backend `webgpu`, execution mode `headed`;
- E7, E8 and E9 authority;
- this preregistration’s bytes;
- the unchanged base specification and fixture identities;
- the existing E7 limitation evidence;
- matrix, generator, reference, model and prediction hashes;
- kernel and complete shader/configuration identity;
- historical manifests, G5 evidence and decision references;
- exact slot amendment and operational rules.

Base identities remain:

```text
specHash:
64d82abf00e50c97c72347d7f4fa2d7b9dfd86240e73441b099a31afc8b1c645

fixtureHash:
ab15af0e527e60168b9cffc6328dadfd0846430da416ba06334fe041907ba0d1
```

Use explicit profile-specific permissions:

- E7 continues to remove only `G1/headless`.
- G5-D inherits that exclusion and replaces required `G5/qjulia-offplane` with `G5/qjulia-operational`.
- No other slot may be excluded or injected.

Distinguish the dispositions:

```text
G1/headless:
  not required under E7; prior failure retained

G5/qjulia-offplane:
  diagnostic under E8; freshly collected; not a qualifying pass

S3 samples:
  diagnostic under E9; sensitivity exclusions retained
```

Keep canonical-byte authentication, recursive freezing, private verified-context provenance and manifest/context binding. A saved `verified: true` is never authority.

Commit this document first, then bind its hash in the profile, then pin the profile in the registry. Avoid circular hashes. The preregistration hash must identify this revised document, not the preceding draft.

### 8.3 Checked evaluation

Update non-frozen `qualification.mjs`, `gates-checked.js` and `qualify.mjs`.

The frozen `decision.js` consumes gate verdicts and need not change.

Under G5-D:

1. Authenticate and bind the manifest/profile.
2. Validate selected records against the effective plan.
3. Evaluate headed G1 and amended G5 with that plan.
4. Preserve the frozen rules for every other gate.

The frozen evaluator validates its input records against the frozen plan. Therefore, do not pass a new operational G5 record into that evaluator’s whole-record validation. After effective-plan validation, unchanged gates can be evaluated using their own records and the unchanged frozen evaluator. Preserve all existing timing, invalidation, coverage and attribution checks.

Add a regression proving that a selected operational G5 record does not make otherwise valid G2/G4 evidence invalid through an unknown-slot error.

The G5-D profile must be mandatory for the `webgpu-g5d` campaign in every entry point, including direct checked evaluation, manifest loading and closure.

### 8.4 GPU and driver

Modify non-frozen `gpu/arithmetic.wgsl` and the G5 driver to:

- add **only the three-line `q_update_g5d` wrapper** from §3 to `gpu/arithmetic.wgsl`, calling the existing `qsq` from `fields.wgsl`. Do not redeclare, move or edit `qsq` or any other part of `fields.wgsl`, which other gates’ shaders include. The implementation review verifies the §3 fragment hash over `fields.wgsl` lines 52–54 followed by the wrapper text, and separately authenticates the complete concatenated `fields.wgsl + arithmetic.wgsl` source;
- call the wrapper from the plane, operational and eight-update diagnostic paths;
- add `qjulia_operational`;
- supply effective input words and certified radius from the authenticated matrix;
- collect every required state through escape/budget;
- retain partial readbacks and exact failure locations.

Use bounded batches, at most two outstanding, and existing watchdog/deadline/allocation rules. Freeze the output layout, batch sizing and pipeline descriptors during implementation review. No deadline extension or runtime batch-size search is authorized.

Make the necessary profile plumbing in `campaign.mjs`, `run.mjs`, `browser/main.js`, driver dispatch and GPU preparation code. Add only the required G5 pipeline/configuration changes. Other gates’ mathematical implementations and launch configuration must not change.

Update `measure/arith.mjs` and measurement dispatch to derive the operational slot from the new metric module. Keep the frozen plane metric derivation unchanged.

Make `remediation/evidence-rules.mjs` profile-aware:

- historical E7 remediation still requires the G5-A compensated form;
- authenticated G5-D requires the new plain form;
- developer flags alone do not select an arithmetic contract.

Preserve acquisition logging, granted-feature comparisons, sandbox checks and timestamp disclosures.

### 8.5 Historical G5-A shader verification

Historical G5-A evidence must be checked against its recorded, authenticated implementation—not against the new checkout’s shader.

For remediation implementation commit

```text
448d5ff5eed70af1fbc579488d1f238cb155d3be
```

the reviewed `fields.wgsl + arithmetic.wgsl` SHA-256 and recorded shader hash agree:

```text
58a506b905061e195be1ad22a4d39370a9db7082ebc068e318420b785a2388ea
```

Bind that expectation and its complete pipeline descriptors to the historical implementation identity in authenticated metadata. Match the browser-reported value against it when rereading the historical record.

Do not accept a raw record’s self-declared hash as its own authority. Do not disable shader verification. Current G5-D evidence must match the current reviewed G5-D source/configuration.

The original compensation observations and frozen componentRatio must still be recomputed from historical raw words. The result remains unvalidated.

### 8.6 Historical references and separate closure

Preserve these files and hashes:

```text
docs/reports/project0/webgpu-1-manifest.json
d733e85046a39d64d7fefe7f50ff0c39d822b0ca0ae69fe9ec92b8fbb7c9dfdd

docs/reports/project0/webgpu-remediation-manifest.json
b0026a0bc85b3d1f4c0e6d97de37bb3c3a4fe71c8c5391ce8185d555ba9fab64

docs/reports/project0/webgpu-decision.json
c36410a2b1ddb16489087dc81ee9bb99ac45d9bcd2276cde988ed9aa545494ad
```

The selected historical off-plane record hashes are:

```text
webgpu-1:
7bda8368b6449105945d1ced07a6c76cfc38b76a5ad8fde524898423ce96b87c

webgpu-remediation:
1023ae9e0fbbb8656e7f46313f0a9ffd63a22382769b3e7b31c379ad26a84d3f
```

Resolve their paths from their respective authenticated manifests and verify their referenced artifacts.

Write new outputs:

```text
docs/reports/project0/webgpu-g5d-manifest.json
docs/reports/project0/webgpu-g5d-gates.json
docs/reports/project0/webgpu-g5d.md
docs/reports/project0/webgpu-g5d-decision.json
```

Add a separate G5-D closure entry point, or an explicitly profile-bound closure destination. **Never overwrite `webgpu-decision.json`.**

Closure must authenticate the profile, matrix, implementation, preflight, evidence and historical references; recompute observations; and write the amended verdict with the original failures alongside it.

## 9. Required tests before execution

The implementation review must verify:

1. **Reproduction:** matrix counts, all hashes in §§5–6, all 5,121 freshness comparisons, no duplicate selected tuple, and all prescribed mutation failures.
2. **Radius:** exact certificate and minimality, all 16 `R>2` cases, initial escape, strict boundary comparison, escaping-iterate inclusion and null budget fields.
3. **Screen:** all eight input coordinates in both directions; fixed unperturbed radius; status/index, component and log criteria; log comparison whenever both orbits escape even at different indices; no model-dependent exclusion.
4. **Numerics:** all four exact models, plane predictions and diagnostic predictions. An intentionally wrong result must produce a numerical failure rather than an evidence-format failure.
5. **Profile integrity:** missing, altered, unhashed, unknown or mismatched profile; unauthorized slot changes; mutation of nested authenticated data; stripped manifest metadata; direct evaluator calls without their required context.
6. **Legacy preservation:** old manifests retain their old requirements and failures. G5-D cannot reinterpret original G5 as passed.
7. **Evidence collection:** failure before any result, after the plane, after an operational batch and after a diagnostic readback; every completed observation survives writer-to-reader and closure round trips.
8. **Shader identity and construction:** wrong hash, altered constants, duplicate/missing/extra descriptors, incorrect form and historical/current implementation confusion. Verify `fields.wgsl` is unchanged, the concatenated module has exactly one `qsq` declaration, and the logical fragment hash matches.
9. **S3:** correctly collected status, index and numerical disagreements do not fail the operational numerical gate; missing/corrupt diagnostic evidence does; no S3 observation becomes a qualifying pass.
10. **Campaign:** every gate requested, headed only, empty reuse, unchanged launch configuration, fresh preflight at the final identity, and existing stop rules.
11. **Closure:** captured writes contain the correct profile, matrix/kernel identities, exclusions, diagnostics, historical hashes and manifest hash; historical decision bytes remain unchanged.
12. **Frozen boundary:** all 24 provenance sources and `fixtures.json` remain byte-identical. Run the fixture verifier and full relevant suite in the implementation environment.
13. **Offline shader validation:** the complete concatenated source passes an offline WGSL validator without a browser or GPU device. Record the validator version, command, source hash and successful result. Static source-text checks do not substitute for this validation.

Tests must exercise behaviours, including writer-to-reader and closure paths. Source-text searches alone do not establish these properties.

## 10. The single additional attempt

The permitted change set is limited to:

- the G5-D profile, generator, matrix, reference, models, predictions and metric;
- the named quaternion wrapper and G5 entry points/driver;
- necessary profile, evidence, shader-identity, reporting and closure plumbing;
- associated tests and documentation.

No other gate’s mathematics, fixture, threshold or launch configuration changes. `gpu/fields.wgsl` remains unchanged.

The campaign requests **G1–G13, all headed, with no reuse**. Gates that passed earlier must run again. Existing phased stops remain in force; unattempted gates receive their explicit stop reason.

Keep the reviewed remediation launch configuration, including the developer-features flag, sandbox and watchdogs. Preserve its feature-exposure and timestamp-quantization disclosures.

For this qualification work, the attempt starts at the first browser-backed shader-module creation, pipeline creation or GPU dispatch. This includes compile-only preparation and any preflight that performs one of those actions. Creating a module containing the new kernel consumes the attempt even if its operational entry point is never dispatched. No browser-backed compile-only rehearsal or unrecorded development run is permitted.

Before the campaign, the complete concatenated shader source must pass an offline WGSL validator, run without any GPU device or browser. Record the pass, validator version, command and source hash in the implementation review. This static check does not consume the attempt.

The existing integrity preflight requests no GPU adapter or device and creates no shader module or pipeline. It remains permitted and required at the final identity. Its browser launch alone is not shader execution or a compile-only rehearsal.

Once the qualifying campaign starts, a failure or inconclusive mandatory gate closes it; it does not authorize a changed rerun merely because G5 had not yet executed.

An unsuccessful attempt returns to the user under E5/E8. No second correction, kernel variant, seed change or additional remediation is authorized.

After the implementation, artifacts, offline validation and tests have been reviewed and committed, run exactly:

```bash
node spikes/project0/campaign.mjs \
  --name webgpu-g5d \
  --args remediation \
  --qualification project0-g5d-v1 \
  --reuse '[]'
```

Do not supply a restricted `--gates` list. The campaign must perform a fresh integrity preflight at the final implementation identity and with these launch arguments before gate execution.

## 11. Decision and T13 disclosure

Any selection must say:

> WebGPU passes G5 as amended by E8 and E9, under the headed-only scope of E7. This is not a pass of the original G5 contract.
>
> G5-D was authorized after the original numerical failures. The original plain implementation failed the frozen eight-iterate comparison at 2.7497713106862958; an exact contraction model reproduced all 32 GPU components. The compensated remediation failed at 4.744852004194964 and failed its compensation validation. It matched none of its five preregistered models. These results remain failures under their original contracts.
>
> G5-D changes the required comparison to operational orbits. It does not explain away the original divergence or validate accurate post-escape continuation. Any instrument relying on such continuation requires separate validation.
>
> No validated long-escape band at f32 input precision was established by this qualification. S3 was measured and reported as a non-gating diagnostic under E9. **Qualifying escaping orbits cover escape indices 0–11 only; escape indices 12–128 are not validated by this qualification.** This is a limitation of the demonstrated qualification domain, not a proof that every possible long-escape input is unqualifiable. Bounded orbits are tested through 128 updates.
>
> Headless WebGPU remains a known host limitation and was not converted into a pass.

T13 must display separately:

- original `webgpu-1` G5 failure;
- original G5-A invalid/inconclusive result and numerical failure;
- the unchanged historical inconclusive decision;
- amended operational G5-D and unchanged plane results;
- fresh forced-continuation diagnostic;
- S3 eligibility, observed errors and status/index disagreements;
- the absence of qualifying escaping samples at indices 12–128;
- headless limitation;
- tested arithmetic formulation, implementation and execution identities.

Do not report “G5 passed” without the amendment qualification. Do not describe precision badges as supplying an accuracy guarantee absent from this evidence.

## 12. Peer amendments and completion record

The earlier amendments are resolved as follows:

- **A1 accepted with E9’s authorized revision:** S3 is mandatory diagnostic coverage; S0/S1/S2/SB retain qualifying coverage. Generator, counts, freshness and hashes are fixed above.
- **A2 accepted with corrections:** certified upward radius, mandatory `R>2` cases, explicit initialization and budget-null semantics, and the single plain kernel.
- **A3 rejected:** model failure is not an exclusion rule or proof that binary32 cannot satisfy the contract. Predictions remain independently reported.
- **A4 accepted with the necessary non-frozen integration scope:** exactly one attempt, every gate requested, no reuse and no further remediation.
- **A5 accepted:** dual historical/amended records, fresh continuation diagnostic and a separate decision file.
- **A6 accepted with corrected numerical wording:** no claim that every honest binary32 evaluation passes the old contract.

The current co-author amendments are resolved as follows:

- **G5D-1 accepted:** the hashed fragment is logical; only the wrapper is added to `arithmetic.wgsl`. The existing `qsq` and all of `fields.wgsl` remain unchanged.
- **G5D-2 accepted:** compare log-radius whenever both reference orbits escape, irrespective of escape index.
- **G5D-3 accepted:** S3 status, index and numerical disagreements are explicitly non-gating when correctly collected.
- **G5D-4 accepted with scope clarification:** offline validation is mandatory and does not consume the attempt; browser-backed compilation for this qualification does. The existing GPU-free integrity preflight remains required.
- **G5D-5 accepted:** the decision and T13 explicitly disclose that qualifying escape indices are 0–11 only.

No G5D-1–G5D-5 amendment is rejected. The logical-fragment hash, canonical matrix hash and all 12 model hashes remain unchanged.

Preparation and revision used CPU calculations and read-only inspection. No browser or GPU execution occurred, and no repository files were edited. All 24 frozen source hashes matched their recorded provenance.

Implementation review, offline validation of the completed shader and campaign execution remain outstanding.

