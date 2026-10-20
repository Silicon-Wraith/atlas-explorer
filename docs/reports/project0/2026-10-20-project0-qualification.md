# Project 0 — Space Backend Qualification Report

## Decision

Mechanical outcome: **inconclusive** (next: resolve missing or invalid WebGPU evidence). Recomputed from the saved evidence through the checked evaluator; the recorded decision is unchanged.

Selection: **WebGPU, chosen by explicit user override (E10); timing qualification incomplete**. This is an exception to the specification §6 rule that selection requires every mandatory gate to pass. It is the user's decision (E10), never a mechanical qualification.

Qualification scope: headed execution only, under E7; G5 as amended by E8 and E9 (operational orbits through first escape or 128 updates; S3 measured as a non-gating diagnostic).

Launch configuration: `remediation` — `--enable-gpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan --enable-webgpu-developer-features` (developer features; browser timestamp quantization disabled).

## Gates (final campaign)

| Gate | Status | Reasons |
|---|---|---|
| G1 | pass | — |
| G1/headless | Not required under E7; not scheduled in this campaign. Prior headless collection was unsuccessful; browser/GPU-process crash remains a known limitation on the recorded host. | excluded trial (E7); not a gate verdict |
| G2 | pass | — |
| G3 | pass | — |
| G4 | pass | — |
| G5 | pass as amended by E8 and E9 | — |
| G6 | invalid/inconclusive | timing evidence incomplete; cause unknown; demonstrated harness scheduling vulnerability; G7 schedule deviation: request 160 fired 4.30 ms late (limit 4 ms) (cause: unknown); not accepted as execution of the frozen schedule |
| G7 | invalid/inconclusive | timing evidence incomplete; cause unknown; demonstrated harness scheduling vulnerability; invalid metrics; G7 schedule deviation: request 160 fired 4.30 ms late (limit 4 ms) (cause: unknown); not accepted as execution of the frozen schedule; metrics: G7: the burst window covered 9221.199999809265 ms, not the frozen 23040 ms (accepted up to 35040 ms) |
| G8 | pass | — |
| G9 | invalid/inconclusive | timing evidence incomplete; cause unknown; demonstrated harness scheduling vulnerability; missing required trials |
| G10 | pass | — |
| G11 | pass | — |
| G12 | pass | — |
| G13 | pass | — |

**G1/headless.** Not required under E7; not scheduled in this campaign. Prior headless collection was unsuccessful; browser/GPU-process crash remains a known limitation on the recorded host.

Preserved evidence:
  - diagnosis: `docs/reports/project0/webgpu-g1c-diagnosis.md`, sha256 `cdf7b66649e2…`
  - manifest: `docs/reports/project0/webgpu-1-manifest.json`, sha256 `d733e85046a3…`
  - record: `20261019T235719304Z-webgpu-1-g1-headless/G1-headless-20261019T235719304Z-webgpu-1-g1-headless.json` (record `G1-headless-20261019T235719304Z-webgpu-1-g1-headless`), sha256 `1461dc310889…`

**Timing (G6, G7, G9).** Not qualified: timing evidence incomplete; cause unknown; demonstrated harness scheduling vulnerability. The leading diagnostic target is the harness timer defect carried forward in `docs/reports/project0/platform-decision.md` (fractional `setTimeout` rearm delays at `browser/drivers/timing.js`); no WebGPU limitation is demonstrated.

## G5 as amended by E8 and E9

- WebGPU passes G5 as amended by E8 and E9, under the headed-only scope of E7. This is not a pass of the original G5 contract.
- G5-D was authorized after the original numerical failures. The original plain implementation failed the frozen eight-iterate comparison at 2.7497713106862958; an exact contraction model reproduced all 32 GPU components. The compensated remediation failed at 4.744852004194964 and failed its compensation validation. It matched none of its five preregistered models. These results remain failures under their original contracts.
- G5-D changes the required comparison to operational orbits. It does not explain away the original divergence or validate accurate post-escape continuation. Any instrument relying on such continuation requires separate validation.
- No validated long-escape band at f32 input precision was established by this qualification. S3 was measured and reported as a non-gating diagnostic under E9. Qualifying escaping orbits cover escape indices 0–11 only; escape indices 12–128 are not validated by this qualification. This is a limitation of the demonstrated qualification domain, not a proof that every possible long-escape input is unqualifiable. Bounded orbits are tested through 128 updates.
- Headless WebGPU remains a known host limitation and was not converted into a pass.

Operational orbits: 223/223 qualifying within limits, worst componentRatio 0.19243534038149068, worst logRRatio 0.10932112776388266. Qualifying escaping orbits cover escape indices 0–11 only; escape indices 12–128 are not validated by this qualification. Bounded orbits are tested through 128 updates.

| Band | Role | Samples | Outside | Worst componentRatio |
|---|---|---|---|---|
| S0 | qualifying | 86 | 0 | 0.11900621756346888 |
| S1 | qualifying | 65 | 0 | 0.19213038438685867 |
| S2 | qualifying | 32 | 0 | 0.19243534038149068 |
| SB | qualifying | 32 | 0 | 0.18778830311955885 |
| S3 | diagnostic (E9, non-gating) | 64 | 61 | 72190.06146000013 |
| initial | qualifying | 8 | 0 | 0 |

The original failures stand under their own contracts:

| Campaign | Record | componentRatio | Result |
|---|---|---|---|
| webgpu-1 | `G5-qjulia-offplane-20261019T235725379Z-webgpu-1-g5-headed` | 2.7497713106862958 | failure |
| webgpu-remediation | `G5-qjulia-offplane-20261020T051013812Z-webgpu-remediation-g5-headed` | 4.744852004194964 | failure; compensation eliminated (unvalidated) |

## Verified evidence chain

| Campaign | Verified against | Mechanical outcome |
|---|---|---|
| webgpu-1 | `docs/reports/project0/webgpu-1-gates.json` | inconclusive |
| webgpu-remediation | `docs/reports/project0/webgpu-decision.json` | inconclusive |
| webgpu-g5d | `docs/reports/project0/webgpu-g5d-decision.json` | inconclusive |

Implementation identities, each authenticated from its own commit (harness hash recomputed from git; shader resolved at that commit):

| Commit | Harness hash | Used by | Shader (fields + arithmetic) |
|---|---|---|---|
| bd978e6 | 8f8dd25e5852… | webgpu-1, webgpu-1 preflight | not recorded at this implementation |
| 448d5ff | 07f6b282d10c… | webgpu-remediation, webgpu-remediation preflight | 58a506b90506… (1 record(s)) |
| f754534 | d2dd9e74d26a… | webgpu-g5d, webgpu-g5d preflight | b6a565ad66bc… (1 record(s)) |
| 4465b3c | ece200e9cb38… | precision (T12) | not recorded at this implementation |
| ff11b35 | 1fdb34079a85… | precision ff11b35 (superseded) | not recorded at this implementation |

## Precision experiment (T12; separate from qualification)

Selection basis: user decision E10 (mechanical outcome inconclusive). Record `precision-precision-20261020T181850179Z-precision-precision-headed`, implementation 4465b3c; recomputed in full from its own evidence.

Primitive validation: passed (compensation validated under the preregistered rule).
Observed disagreement threshold against the CPU reference: 0.00001.

| d | interpreted | eligible | baseline status / large depth (exceeded) | compensated status / large depth (exceeded) | work median ms (base / comp) | extra bytes |
|---|---|---|---|---|---|---|
| 0.1 | yes | 4010 | 0 (0.00%) / 0 (false) | 0 (0.00%) / 0 (false) | 3.90 / 4.90 | -57696 |
| 0.01 | yes | 3957 | 0 (0.00%) / 1 (false) | 0 (0.00%) / 2 (false) | 3.90 / 4.95 | -57696 |
| 0.001 | yes | 3933 | 1 (0.03%) / 1 (false) | 0 (0.00%) / 2 (false) | 4.00 / 5.00 | -57696 |
| 0.0001 | yes | 3937 | 6 (0.15%) / 20 (false) | 3 (0.08%) / 23 (false) | 6.15 / 7.15 | -57696 |
| 0.00001 | yes | 3683 | 415 (11.27%) / 1016 (true) | 164 (4.45%) / 978 (true) | 11.45 / 47.35 | -57696 |
| 0.000001 | yes | 3858 | 2020 (52.36%) / 1657 (true) | 1640 (42.51%) / 2056 (true) | 11.40 / 50.05 | -57696 |
| 1e-7 | yes | 3956 | 3940 (99.60%) / 16 (true) | 3956 (100.00%) / 0 (true) | 6.00 / 44.65 | -57696 |
| 1e-8 | yes | 3972 | 3972 (100.00%) / 0 (true) | 3972 (100.00%) / 0 (true) | 49.25 / 11.50 | -57696 |

Caveats (joint interpretation, `docs/reports/project0/precision-interpretation.md`): the limit is local to this anchor, profile, implementation and environment, not a universal f32 zoom floor; A.11 compensates coordinate construction and recurrence addition only (the nonlinear map, derivative and estimator remain f32), so field-evaluation precision is the leading remaining bottleneck without a quantified attribution; costs describe the instrumented prototype; extraBytes is a difference of allocation peaks, not a saving; T12 tests arithmetic splitting, not Plane's bitwise splitting.

Superseded evidence (listed, not used):

- `docs/reports/project0/precision-ff11b35-superseded.json` — superseded; user-directed run while review was pending; not the accepted T12 result; implementation ff11b35; record `precision-precision-20261020T175447161Z-precision-precision-headed` (3 artefacts hash-verified, not recomputed: the fixed readers refuse its raw). See `docs/reports/project0/precision-ff11b35-superseded.md`.

---

<!-- Appended by hand after generation; everything above this rule is the report tool's output, byte-identical. Regeneration drops this trailer. -->
**Narrative.** The environment, remediation history, visible-output captures, interpretation and limitations are in the companion document [2026-10-20-project0-qualification-narrative.md](2026-10-20-project0-qualification-narrative.md) (reviewed jointly; Codex co-author READY, run 20261020T205527Z-6c6b; final review done; pull request pending).
