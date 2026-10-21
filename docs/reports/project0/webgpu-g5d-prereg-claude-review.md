# Claude review: G5-D preregistration (Codex r3, `VERDICT: G5-D READY`)

**Reviewer:** Claude (co-author). **Date:** 2026-10-20.
**Document reviewed:** `webgpu-g5d-prereg.md`. It is byte-identical to the `=== BEGIN/END DOCUMENT ===` body of `codex-T10-g5d-r3-findings.md`.
**Authority checked against:** E7, E8 and E9 (`docs/codesign/execution-decisions.md`), `claude-g5d-review.md` A1–A6, and Codex rounds 1–2.
**Independent reproduction:** `/mnt/ml_storage/scratch/atlas-g5d-check/r3/{gen,models,mut}.mjs`.
- Run on Node v20.20.2, CPU only.
- Frozen modules (`reference/f32.js`, `contract.js` `canonical()`) and `remediation/exact.js` / `models.js` were imported read-only.
- The §4.1 reference was written from scratch, not taken from Codex's code.
- No GPU or browser was used. No repository file was edited.

## Verdict: ACCEPT WITH AMENDMENTS

Every number and hash in §§3–6 reproduces exactly. The arithmetic choices honour E8 and E9. The §6 exception is correctly scoped. The disclosure is honest.

Two defects of exactness would put the single attempt at risk, and both have exact-text fixes:
- **G5D-1 (blocking for implementation):** the kernel instruction as written produces a duplicate WGSL declaration.
- **G5D-2:** a screen ambiguity changes the authoritative matrix hash.

G5D-3 to G5D-5 are short wording fixes. None of the amendments changes the matrix, the predictions, the tolerances or the acceptance logic.

## 1. Independent reproduction: all values match

| Item | Prereg | Reproduced |
|---|---|---|
| Uniform stream, 250,000 draws | `e5eb0b35…5823` | identical |
| Near-neutral stream, 250,000 draws | `ba0375e4…40c1` | identical |
| §5.6 band table (all 10 rows, including 56,992 uniform initial escapes) | as listed | identical |
| Final cases, distinct, qualifying / diagnostic | 287, 287, 223 / 64 | identical; all 223 qualifying are screen-eligible; all 64 diagnostics are S3 (32 uniform, 32 neutral) and none is eligible |
| Qualifying split | S0 86 + 8 initial, S1 65, S2 32, SB 32 | identical |
| Required components | 19,108 | identical |
| Qualifying cancellation samples | 16 | identical |
| Qualifying samples with \|j\| or \|k\| ≥ 0.1 | 215 | identical |
| SB samples at 128 rows | all 32 | identical |
| S2 escape indices | 8–11 | {8, 9, 10, 11} |
| Final 287 tuples | `df6d9cb7…cc79` | identical; no internal duplicates |
| Canonical matrix + LF | `b74ecc9e…c96e` | identical, under one reading of §4.5 (see G5D-2) |
| Prior tuples | 5,121, `4c1e21e8…9c10` | identical: 4,096 plane tuples embedded with j = k = 0, the off-plane tuple, and 1,024 `generalCases()` tuples |
| Freshness collisions | none | 0 in the uniform stream, 0 in the near-neutral stream, 0 in the selection |
| Certified R, 16 radius cases | `4015e10d` | identical; exact dyadic certificate and minimality |
| Radius-case escapes | R-group e = 1, I-group e = 0, all eligible | identical |
| Hard-coded radius 2 | changes the R-group index | all 8 R-cases go to e = 0 |
| Kernel fragment + final LF | `290b4cc6…a78c` | identical; the `qsq` lines are byte-identical to `gpu/fields.wgsl:52–54` |
| Uniform and near-neutral certified R | 2 | 2 for every draw in both streams |

The exact U, F, A and Q models were built on `exact.js` primitives. Every predicted value and hash reproduces:

| Model | Qualifying | Max componentRatio | Max logRRatio | S3 outside numerical criteria / index disagreements | Operational hash | Plane max logRRatio, plane hash | Continuation ratio, continuation hash |
|---|---|---|---|---|---|---|---|
| U | 223/223, 0 index | 0.2752085455 | 0.1192017236 | 62 / 1 | `f331de40…144c` | 0.3336865173, `41bc5d92…ac0f` | 0.6497890097, `29f1055f…0e81f` |
| F | 223/223, 0 index | 0.2193153862 | 0.1138465589 | 60 / 1 | `ad303936…d069` | 0.3686866083, `48967bc5…b9b8` | 2.7497713107, `d8889f18…f31f` |
| A | 223/223, 0 index | 0.2660767700 | 0.1427108871 | 61 / 0 | `6228bc8e…2703` | 0.3686866083, `48967bc5…b9b8` | 0.6497890097, `8f9c858d…0899` |
| Q | 223/223, 0 index | 0.3038225199 | 0.1058427698 | 61 / 1 | `5c90e2e3…b07d` | 0.2322788006, `bd031e73…0406` | 0.8883912805, `c73f4b52…8301` |

- Plane: 0 eligible status/index disagreements and 0 failures in every model.
- No exact rounding was subnormal, underflowed or overflowed.
- F reproduces the historical 2.7497713107, which supports §2 and §11.
- Mutations: j→0, k→0, j and k→0, C_j and C_k ignored, and the sign of 2ad flipped each fail **215/215** qualifying samples.

I did not re-run Codex's 80-digit decimal check (§6.6). My values come from a binary64 reference written independently, and they agree bit-for-bit with the published hashes.

## 2. E8 and E9 compliance: compliant

- **Tolerances.** The component tolerance 10⁻⁶ + 10⁻⁵|r| and the logR rtol 10⁻⁵ equal `fixtures.json` `arithmeticProtocol`.
- **Screen.** The screen fraction of 0.25 equals `sensitivityFraction`. The screen is extended to all eight inputs, as A1 required. It remains the sole exclusion rule.
- **Plane gate.** The plane gate is unchanged. Its predictions are explicitly non-gating.
- **S3.** S3 is mandatory, measured and non-gating (§4.5, §7.2). A favourable S3 result cannot be promoted. Missing or corrupt S3 evidence is still a defect. This matches E9 exactly.
- **Kernel.** The plain `q_update_g5d` kernel is used by the plane, the operational path and the 8-iterate diagnostic. Inputs come from runtime buffers. The full shader and descriptors are authenticated, not only the fragment.
- **§6 exception.**
  - It is one attempt. The first GPU execution, preflight included, consumes it.
  - G1–G13 are all headed, with `--reuse '[]'` and no `--gates`.
  - A failure closes the attempt, and no variant search is allowed (§7.3, §10).
- **Disclosure (§11).** The wording is honest:
  - the 2.7497713106862958 and 4.744852004194964 results stand as failures under their original contracts;
  - the F-model reproduction of all 32 components is stated correctly;
  - there is no "compiler violated WGSL" claim and no "every binary32 evaluation fails" claim;
  - "not a pass of the original G5 contract" is stated, and post-escape continuation is not validated.
- **Separate records.** The `webgpu-1` failure, the G5-A invalid/inconclusive result and the historical decision stay separate and hash-pinned. A new `webgpu-g5d-decision.json` is written, and `webgpu-decision.json` is never overwritten. Historical G5-A is verified against its recorded shader hash `58a506b9…`, not the new checkout.
- **§8.6 hashes checked.** `webgpu-1-manifest.json` (`d733e850…`), `webgpu-remediation-manifest.json` (`b0026a0b…`) and `webgpu-decision.json` (`c36410a2…`) match on disk. I did not independently resolve the two selected-record hashes (`7bda8368…`, `1023ae9e…`) through their manifests. The byte identity of `qsq` is checked by hash: `fields.wgsl` lines 52–54 and the first three lines of the §3 fragment both hash to `0b147e57…`.

## 3. Implementability without frozen-source changes: yes, after G5D-1 and G5D-2

- **No frozen file is involved.**
  - `gpu/*.wgsl`, `qualification.mjs`, `gates-checked.js`, `qualify.mjs`, `measure/arith.mjs`, `campaign.mjs` and `remediation/*` are absent from the 24 `provenance.sources`.
  - `decision.js` is frozen, and per §8.3 it is not modified.
- **The enforcement points exist.** Adding `webgpu-g5d` → `project0-g5d-v1` to `REQUIRED_PROFILE_CAMPAIGNS` (`qualification.mjs:18`) and `G5/qjulia-offplane` to the profile-scoped `REMOVABLE` (`qualification.mjs:38`) is enough. `campaign.mjs:45` already refuses a missing or wrong `--qualification` for a mapped campaign.
- **Reuse is demonstrated.** I built the certified radius and all four models from `exact.js` without modifying it, as §8.1 permits.
- **G5D-1: duplicate `qsq`.** §3 defines the kernel as a fragment that *includes* `fn qsq`, and §8.4 says to "add the wrapper in §3" to `gpu/arithmetic.wgsl`. But `webgpu.js:26` compiles `fields + arithmetic.wgsl`, and `fields.wgsl:52` already declares `fn qsq`.
  - Pasting the fragment into `arithmetic.wgsl` is a WGSL redeclaration error.
  - Moving or editing `qsq` in `fields.wgsl` changes the renderer shader that other gates use (`renderer.js:9`), which §8.4 and §10 forbid.
  - Because compilation would first happen inside the campaign, this would burn the single attempt on a compile failure.
- **G5D-2: logR scope.** §4.5 does not say whether logR is compared when a neighbour escapes at a *different* index.
  - Codex's hash `b74ecc9e…` reproduces only when logR is compared whenever both escape, which is the frozen `sensitivity.js` rule.
  - Comparing logR only at equal indices gives `a07b69f9…`.
  - Selection is unaffected: final tuples, roles and counts are identical under both readings. Only the `screen.reasons[].changed` strings of already-ineligible cases differ.
  - §5 makes the matrix hash authoritative and blocks GPU execution on any difference, so the reading must be written down.

## 4. Campaign command and acceptance logic: no fail-open path found

- **Escape boundary.** The smallest relative margin between any compared reference norm and R, over all 223 qualifying samples, is 1.77×10⁻³ (U000077). The f32 relative ulp is about 1.2×10⁻⁷. WGSL `length()` rounding therefore cannot flip a qualifying escape test.
- **Nonfinite metrics.** §7.2 forbids encoding a failure as an infinite metric, and `canonical()` throws on any nonfinite number. A nonfinite metric therefore cannot serialize as a pass.
- **Gates and reuse.** `campaign.mjs:120–121` treats `--gates` as the rerun set, never a waiver. With no `--gates`, all 13 gates run. `--reuse '[]'` is validated before anything runs (`campaign.mjs:53–54`).
- **Status and evidence.**
  - A status or index disagreement on a qualifying sample is a failure, never an exclusion (§4.4).
  - Missing or unauthenticated evidence, including S3 and the continuation diagnostic, is invalid. It is never a pass (§7.2).
  - The plane and operational slots are both required (§7.1).
- **Wording hazard (G5D-3).** §7.2 says "a correctly collected S3 numerical disagreement does not fail G5-D". §6.2 predicts S3 *index* disagreements in U, F and Q. Under the §4.4 vocabulary a strict implementer could treat an S3 status/index disagreement as failing. With one attempt, that sentence should name all three kinds of disagreement.
- **Development runs (G5D-4).** "No unrecorded development run" (§10) leaves no permitted way to catch a WGSL compile error before the attempt. Offline static validation consumes no GPU result and reveals nothing numerical. It should be required, and explicitly declared not to consume the attempt.

## 5. Test strength: no outcome-dependent weakening; disclosure scope needs one fix

- **Selection is independent of outcomes.** Cases are the first N eligible draws in generation order, and the screen is the sole exclusion rule. Selection is independent of the models and the GPU (§4.5, §6.6). I do not propose changing the selection: doing so would itself violate that independence.
- **Observed properties, stated for the record.** These are consequences of the input-sensitivity screen, not of any choice made with knowledge of outcomes:
  - S0 with updates is 67/86 at e = 1, 17 at e = 2 and 2 at e = 3.
  - S1 is 35/20/6/4 at e = 4/5/6/7.
  - 16 of the 32 SB orbits settle to a fixed point within 128 updates, which damps errors. The other 16 do not.
  - The 4,096 SB update rows carry 86% of the 19,108 components.
  - The test therefore weighs mainly on bounded orbits and short escapes.
- **Escape-index scope (G5D-5).** Validated escape indices are 0–11 plus bounded orbits. §5.6 says this, but the §11 disclosure only says "no validated long-escape band", and E9 calls the long-escape band "S3, e ≥ 32". A reader of the decision record could infer that escapes at 12–31 are validated. They are not.

## Amendments (exact text)

**G5D-1: §3, replace the sentence "Use the existing plain quaternion polynomial, wrapped as `q_update_g5d`. The following text, including its final LF, defines the kernel fragment:" with:**

> Use the existing plain quaternion polynomial `qsq`, declared unchanged at `gpu/fields.wgsl` lines 52–54, wrapped as `q_update_g5d`. The following text, including its final LF, defines the *logical* kernel fragment whose hash is given below. It is not a file. Its first three lines are the existing `fields.wgsl` declaration, byte-for-byte.

**G5D-1: §8.4, replace the bullet "add the wrapper in §3;" with:**

> add only the three-line `q_update_g5d` wrapper from §3 to `gpu/arithmetic.wgsl`, calling the existing `qsq` from `fields.wgsl`. Do not redeclare, move or edit `qsq` or any other part of `fields.wgsl`, which other gates' shaders include. The implementation review verifies the §3 fragment hash over `fields.wgsl` lines 52–54 followed by the wrapper text, and separately authenticates the complete concatenated `fields.wgsl + arithmetic.wgsl` source;

**G5D-2: §4.5, after "Compare common update rows when recording component reasons for neighbours with different escape indices." insert:**

> Compare escaping log-radius whenever both the neighbour and the unperturbed sample escape, regardless of escape index, as in the frozen `reference/sensitivity.js` rule. The canonical-matrix hash in §5.8 is defined under this reading.

**G5D-3: §7.2, replace "A correctly collected S3 numerical disagreement does not fail G5-D." with:**

> A correctly collected S3 status, index or numerical disagreement does not fail G5-D.

**G5D-4: §10, after "There is no unrecorded development run of that entry point." insert:**

> Before the campaign, the complete concatenated shader source must pass an offline WGSL validator (for example `naga`) run without any GPU device or browser. The pass and the validator version are recorded in the implementation review. This static check does not consume the attempt. Creating a browser shader module or pipeline, or dispatching anything, does consume it.

**G5D-5: §11, in the quoted disclosure, after "S3 was measured and reported as a non-gating diagnostic under E9." insert:**

> Qualifying escaping orbits cover escape indices 0–11 only; escape indices 12–128 are not validated by this qualification.

## Disposition

Once G5D-1 to G5D-5 are applied, the preregistration is accepted for commit. None of them changes a hash in §§5–6. The kernel-fragment hash `290b4cc6…` stays valid under G5D-1's definition. The implementation review must then confirm three things:
- the matrix and model hashes reproduce;
- the offline WGSL validation in G5D-4 passed;
- the `REQUIRED_PROFILE_CAMPAIGNS` and `REMOVABLE` entries are bound to `project0-g5d-v1`.
