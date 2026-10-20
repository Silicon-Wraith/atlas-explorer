# Project 0 — Qualification report: narrative

**Status:** Claude's draft for joint review with Codex (T13 Step 5). It is not yet approved by the co-author.

**Companion to:** [2026-10-20-project0-qualification.md](2026-10-20-project0-qualification.md) and [2026-10-20-project0-results.json](2026-10-20-project0-results.json). `spikes/project0/report.mjs` generated both from the verified evidence:

```
node spikes/project0/report.mjs --decision docs/reports/project0/webgpu-g5d-decision.json --date 2026-10-20 --out docs/reports/project0
```

The tool has no narrative slot, so the narrative is kept in this separate file. The gate table, the G5 tables, the evidence chain and the precision table belong to the generated report, and this document links to them without restating them. Every figure below was checked against the evidence file it cites.

**About the links.** Paths under `artifacts/project0/` point to git-ignored local evidence: raw payloads, launch captures, `chrome://gpu` text, supervision files and images. They resolve only in a checkout that holds that evidence. A Git checkout alone does not contain everything needed to regenerate the report (see §3).

---

## 1. Outcome and authority

> Mechanical outcome: **inconclusive**.
> WebGPU was selected by **explicit user override under E10; timing qualification is incomplete**.

> **Qualification scope: headed execution only, under E7.**

- **The mechanical result.** The frozen decision procedure ([spec §6](../../superpowers/specs/2026-10-18-project0-space-qualification-design.md#6-decision-procedure)), recomputed by the report tool from the saved evidence, gives `inconclusive — next: resolve missing or invalid WebGPU evidence` ([webgpu-g5d-decision.json](webgpu-g5d-decision.json)). That result is recorded unchanged.
- **The selection.** Specification §6 allows a backend to be selected only when every mandatory gate passes. G6, G7 and G9 are invalid/inconclusive, so WebGPU is not mechanically qualified. The user chose it anyway, in E10: "Select WebGPU now. That is my decision." ([execution-decisions.md](../../codesign/execution-decisions.md), E10; [platform-decision.md](platform-decision.md)). This is a stated exception to §6. It is the user's decision, not a qualification, and it does not change the mechanical outcome.
- **The scope.** Under E7, qualification is headed only. G5 passes only as amended by E8 and E9 (§5).
- **The generated gate table** in the companion report is authoritative and is not repeated here. That includes its separate `G1/headless` row.

## 2. Environment, launch and measurement conditions

The final campaign is `webgpu-g5d` at implementation `f754534`, recorded in [webgpu-g5d-manifest.json](webgpu-g5d-manifest.json). The G1 record is the reference for identity. Its stem is `G1-headed-20261020T163911020Z-webgpu-g5d-g1-headed`, and the files are [record](../../../artifacts/project0/20261020T163911020Z-webgpu-g5d-g1-headed/G1-headed-20261020T163911020Z-webgpu-g5d-g1-headed.json), [raw](../../../artifacts/project0/20261020T163911020Z-webgpu-g5d-g1-headed/G1-headed-20261020T163911020Z-webgpu-g5d-g1-headed.raw.json), [launch](../../../artifacts/project0/20261020T163911020Z-webgpu-g5d-g1-headed/G1-headed-20261020T163911020Z-webgpu-g5d-g1-headed.launch.json) and [chrome://gpu](../../../artifacts/project0/20261020T163911020Z-webgpu-g5d-g1-headed/G1-headed-20261020T163911020Z-webgpu-g5d-g1-headed.chrome-gpu.txt).

**Browser and host:**

| Property | Recorded value | Source |
|---|---|---|
| Browser | Google Chrome 151.0.7922.108, `/opt/google/chrome/chrome` | record `identity` |
| GPU | NVIDIA RTX 6000 Ada Generation (vendor `nvidia`, architecture `lovelace`, device `0x26b1`) | raw `adapterInfo` |
| Driver | `NVIDIA 580.173.2.0` (record identity). The raw Dawn identity reports `NVIDIA: 580.173.02 580.173.2.0`. | record, raw |
| Backend | Vulkan. Dawn identity `backend: vulkan`. `chrome://gpu`: ANGLE on Vulkan 1.4.312, `Display type ANGLE_VULKAN`, "WebGPU: Hardware accelerated". | raw, chrome-gpu |
| Session | headed, X11 (`--ozone-platform=x11`, identity `session: x11`) | record, launch |
| Hardware / fallback | `isFallbackAdapter: false`. G1 metrics: `nvidia 1`, `software 0`, `corroborated 1`. The adapter identity is the same before and after `requestDevice` and in `device.adapterInfo`. | record, raw |

**Launch flags.** The campaign used the `remediation` argument set. The requested flags are:

```text
--enable-gpu
--use-angle=vulkan
--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan
--enable-webgpu-developer-features
```

- **Recorded effective command line.** The launch file's `commandLine`, repeated in the `chrome://gpu` "Command Line" row, also contains the launcher's default switches. Those include `--enable-automation`, `--disable-background-timer-throttling`, `--disable-renderer-backgrounding` and `--enable-unsafe-swiftshader`, which appears twice.
- **Not `--enable-unsafe-webgpu`.** `--enable-unsafe-swiftshader` is a different flag. `--enable-unsafe-webgpu` does not appear in the launch file or in the `chrome://gpu` capture. The adapter was hardware, not SwiftShader (above).
- **No dependence on `--enable-unsafe-webgpu`.** The results JSON records `unsafeFlag: false`, so the selected evidence does not depend on that flag. `unsafeFlag: false` refers specifically to `--enable-unsafe-webgpu`, which is absent from all 68 inventory launch command lines. It does not mean the command line contains no switches named "unsafe". The effective launch includes `--enable-unsafe-swiftshader`, in all 68 launch captures, while the selected adapter is NVIDIA hardware. Dependence on that switch was not tested.
- **Disclosed by the launch file:** developer features are on, and browser timestamp quantization is disabled.

**Features: advertised, requested, granted, used.**
- **Advertised.** The G1 adapter advertises 18 features, among them `timestamp-query` and `subgroups`.
- **G1.** G1 requested no features and was granted none (`requestedFeatures: []`, `grantedFeatures: []`). The accepted precision record also requested none.
- **Timing records.** The 11 timing records (G6 ×9, G7/0, G7/1) requested `timestamp-query` and were granted it at every device acquisition. Their `timingMethod` descriptors declare `timestampQueriesUsed: false`; that refers to the gate metrics, which use the page clock.
- **Diagnostic timestamps.** GPU timestamp queries were used separately for band diagnostics. The nine G6 raws and G7/0 each retain eight samples (`diagnostics.timestampQuery.samples: 8`), 80 in total. G7/1 contains no saved timestamp diagnostics. These diagnostics do not enter gate verdicts (`spikes/project0/timing-contract.js`).

**Frame, refresh and integrity conditions:**
- **Resolutions.** The frame (backing) is 1280 × 720. The integrity observer allows only that backing outside G12's deliberate resizes. Internal samples are 640 × 360 in every frame of the timing records, as specified in spec §3.
- **Refresh.** All 11 timing raws record `refreshHz: 50`, including the inspected [G7/1 raw](../../../artifacts/project0/20261020T163936979Z-webgpu-g5d-timing-headed/G7-1-20261020T163936979Z-webgpu-g5d-timing-headed.raw.json).
- **Integrity.** Every timing raw records `integrity: {events: [], violations: []}`. So there was no visibility change, blur, backing change or device-pixel-ratio change during the measured intervals. The G1 session shows one main-frame navigation, the same browser PID and target before and after, and no crash or close.
- **Device-pixel ratio.** The gate records do not store a DPR value.
  - The campaign's integrity preflight records `devicePixelRatio: 1`, with `visibility: visible` and `focused: true`.
  - During gate runs, `integrity.js` records a violation whenever DPR ≠ 1 or DPR changes, and no violation was recorded.
  - `fixtures.display.devicePixelRatio = 1` is the frozen requirement, not an observation.
- **Not recorded:** the display's physical mode and compositor configuration, CPU and host load, and GPU clocks.

**Preflight and supervision.**
- **Integrity preflight.** The campaign's own headed integrity preflight is [integrity-preflight.json](../../../artifacts/project0/20261020T163908552Z-dev-integrity-preflight-headed/integrity-preflight.json). It passed all 7 assertions at `f754534` / `d2dd9e74…`, and the manifest binds it by hash under `bindings`.
- **G1 supervision.** The [G1 supervision file](../../../artifacts/project0/20261020T163911020Z-webgpu-g5d-g1-headed/supervision.json) is complete, with no failure.
- **Timing supervision.** The [timing supervision file](../../../artifacts/project0/20261020T163936979Z-webgpu-g5d-timing-headed/supervision.json) plans 12 windows (G6 ×9, G7/0–2) but contains only 11. It records `complete: false` and `failure: null`. G7/2 was never opened.

## 3. Fixture provenance and reproducibility

- **Commits.** The fixtures were generated at `31fde5f434956b3ae3912a107125d4e95c1523be` ("Add deterministic Project 0 fixture preparation") and frozen at `5638678f5752ce4c6a40f36b280e1ce13ed52480` ("Freeze Project 0 qualification fixtures v1").
- **Identity.** [fixtures.json](../../../spikes/project0/fixtures.json) has fixture hash `ab15af0e…` and specification hash `64d82abf…` ([design specification](../../superpowers/specs/2026-10-18-project0-space-qualification-design.md)). It records 24 frozen source hashes and Node v20.20.2.
- **What the tool verifies.** The report tool checks the frozen sources, the specification and the fixture bytes against their Git history in the supplied root. It authenticates each run's implementation from that run's own commit:
  - it recomputes the harness hash from Git;
  - it resolves the declared shader hash (`fields.wgsl` + `arithmetic.wgsl`) at that commit, never from the current files.
- **Implementation identities.** The generated report lists all five as authenticated: `bd978e6`, `448d5ff`, `f754534`, `4465b3c` and `ff11b35`.
- **Inputs.** The three campaign manifests are [webgpu-1-manifest.json](webgpu-1-manifest.json), [webgpu-remediation-manifest.json](webgpu-remediation-manifest.json) and [webgpu-g5d-manifest.json](webgpu-g5d-manifest.json). The generated [results JSON](2026-10-20-project0-results.json) holds the hashes of the input files it read (`files`).
- **The 68-record inventory.** The results JSON `records[]` array holds 68 records: webgpu-1 13, webgpu-remediation 12, webgpu-g5d 41, accepted precision 1 and superseded precision 1. For each record it lists the campaign, role, gate, slot, mode, invalidations, metrics, full identity, and artifact paths with SHA-256 hashes. It is the verified inventory; this narrative does not restate it.
- **Local evidence.** The raw payloads, launch captures, `chrome://gpu` text, supervision and checkpoint files, and images under `artifacts/project0/` are git-ignored. The repository records their hashes (records, manifests, results JSON), not their bytes. Regenerating the report needs that local evidence as well as the repository and its history. The report tool also requires Git, and it fails rather than skip provenance checks.

## 4. Campaign and remediation history

Three campaigns, in order. Each was run once, and each earlier decision and its evidence are preserved and not overwritten.

1. **`webgpu-1`: the original campaign, at `bd978e6`.**
   - **Result:** inconclusive ([webgpu-1-manifest.json](webgpu-1-manifest.json), [webgpu-1-gates.json](webgpu-1-gates.json)).
   - **G1 invalid/inconclusive:** the headed adapter device and description were empty, and headless `requestAdapter` returned null.
   - **G5 fail:** off-plane componentRatio 2.7497713106862958. An exact fused-multiply-add contraction model reproduced all 32 GPU components (E2).
   - **G3, G4, G11 and G13 passed.**
   - **Not run:** the rest, because the campaign stopped at the correctness phase.
2. **`webgpu-remediation`: G5-A and G1-A (E5), with E7 applied, at `448d5ff`.**
   - **Records:** [preregistration](webgpu-remediation-prereg.md), [E7 addendum](webgpu-remediation-e7-addendum.md), [account](webgpu-remediation.md), [manifest](webgpu-remediation-manifest.json), [gates](webgpu-remediation-gates.json) and [decision](webgpu-decision.json), which is inconclusive and unchanged.
   - **G1 headed:** passed after G1-A's selected-adapter Dawn corroboration.
   - **G1-C:** diagnosed the headless failure as a GPU-process crash ([webgpu-g1c-diagnosis.md](webgpu-g1c-diagnosis.md)).
   - **G5 invalid/inconclusive:** the G5-A compensation matched none of its five preregistered models. All 1,371 TwoSum residuals read back as 0, and 798 of those zeros were wrong, which is consistent with compiler reassociation. The off-plane ratio was 4.744852004194964.
   - **Remediation consumed:** WebGPU's single remediation cycle (spec §6, E5) was used up.
3. **`webgpu-g5d`: the separately authorized E8 attempt (E8, E9), at `f754534`.**
   - **Records:** [preregistration](webgpu-g5d-prereg.md), [account](webgpu-g5d.md), [manifest](webgpu-g5d-manifest.json), [gates](webgpu-g5d-gates.json) and [decision](webgpu-g5d-decision.json), which is inconclusive.
   - **Run conditions:** it ran once, with every gate headed. The manifest records `reuse: []`, `attempts: {}`, `notRun: {}` and `verificationErrors: []`. According to the campaign account, there was no `--gates` argument, no retry and no edit.
   - **Commits:** the evidence was committed at `ae0871d`, and the user's E10 selection was recorded at `471fcb2`.

## 5. Qualification limitations: E7, amended G5 and timing

**Headless (E7).** The generated report keeps the separate row verbatim:

> G1/headless — Not required under E7; not scheduled in this campaign. Prior headless collection was unsuccessful; browser/GPU-process crash remains a known limitation on the recorded host.

- **The evidence.** See [webgpu-g1c-diagnosis.md](webgpu-g1c-diagnosis.md), the [original manifest](webgpu-1-manifest.json) and the [preserved headless record](../../../artifacts/project0/20261019T235719304Z-webgpu-1-g1-headless/G1-headless-20261019T235719304Z-webgpu-1-g1-headless.json) (`G1-headless-20261019T235719304Z-webgpu-1-g1-headless`).
- **What the diagnosis found.** On this host, Chrome 151 headless crashes its GPU process with SIGSEGV at startup. The first crash came before any WebGPU request, and two more followed it. No admissible correction was found.

**G5 passes only as amended by E8 and E9.**
- **What qualifies.** Operational orbits qualify on 223/223 samples (S0 94, including 8 initial escapes; S1 65; S2 32; SB 32), with a worst componentRatio of 0.19243534038149068. The qualifying escaping orbits cover escape indices 0–11, and the bounded orbits are tested through 128 updates.
- **S3 is diagnostic only.** S3 long escapes, 64 cases, all screen-ineligible, are a non-gating diagnostic: 61 of the 64 fall outside the criteria. They are not validated qualification coverage. No validated long-escape band exists at f32 input precision.
- **The original failures stand.** 2.7498 (webgpu-1, eight-iterate forced continuation) and 4.7449 (G5-A) remain failures under their own contracts. G5-A's compensation was defeated by compiler reassociation.
- **Records:** [webgpu-g5d-prereg.md](webgpu-g5d-prereg.md), [webgpu-g5d.md](webgpu-g5d.md), the profile [g5d-v1.json](../../../spikes/project0/qualification/g5d-v1.json), the [matrix](../../../spikes/project0/qualification/g5d-matrix.json) and the [predictions](../../../spikes/project0/qualification/g5d-predictions.json).

**Timing: G6, G7 and G9.**

> Timing evidence incomplete; cause unknown; demonstrated harness scheduling vulnerability.

- **G6.** The nine completed 30 s observations meet their numerical limits: intervalP95 8.6–9.4 ms, 4,419–5,018 publications. Each still carries the invocation-wide invalidation (E4).
- **G7.**
  - **G7/0** met its limit: 400 requests, 20 finals, latencyP95 9.6 ms.
  - **G7/1 was rejected.** Request 160 was scheduled at 338548.5 ms, and its callback entered 4.30 ms late (`lateByMs` 4.2999997…), against the 4 ms allowance. The burst window then covered 9,221.2 ms instead of the frozen 23,040 ms. The 160 earlier requests in G7/1 had a median lateness of 3.30 ms and a maximum of 3.90 ms.
  - **G7/2 was never produced.**
- **G9.** The required evidence was never produced.
- **What this does not show.** It does not establish a WebGPU rendering limitation: the failure happened at issuance, before the affected request reached the renderer.
- **The leading diagnostic target.** `browser/drivers/timing.js:57` passes fractional rearm delays to `setTimeout`. A CPU simulation of that path produced 3.47 ms of lateness without a stall, and 4.47 ms with a 1 ms stall. That shows the vulnerability. It does not show the cause of this particular callback.
- **Records:** [webgpu-g5d.md](webgpu-g5d.md), [platform-decision.md](platform-decision.md), and the [G7/1 record](../../../artifacts/project0/20261020T163936979Z-webgpu-g5d-timing-headed/G7-1-20261020T163936979Z-webgpu-g5d-timing-headed.json), [G7/1 raw](../../../artifacts/project0/20261020T163936979Z-webgpu-g5d-timing-headed/G7-1-20261020T163936979Z-webgpu-g5d-timing-headed.raw.json) and [supervision](../../../artifacts/project0/20261020T163936979Z-webgpu-g5d-timing-headed/supervision.json).

## 6. Visible-output evidence (development, not qualification)

These captures are **development evidence at `9caa8c9`**. They are separate from the final `f754534` qualification campaign: the run is `campaign: dev` and `experiment: true`, and it used the `attempt1` launch arguments, without `--enable-webgpu-developer-features`. They establish neither qualified timing nor visual validation for the final campaign.

- **Record and measurements:** the [record](../../../artifacts/project0/20261019T214811701Z-dev-visible-headed/visible-captures-20261019T214811701Z-dev-visible-headed.json) and its [raw counts](../../../artifacts/project0/20261019T214811701Z-dev-visible-headed/visible-captures-20261019T214811701Z-dev-visible-headed.raw.json).
- **Captures:** [Sphere](../../../artifacts/project0/20261019T214811701Z-dev-visible-headed/visible-captures-20261019T214811701Z-dev-visible-headed.20261019T214811701Z-dev-visible-headed-presented-sphere.png), [Bulb overview](../../../artifacts/project0/20261019T214811701Z-dev-visible-headed/visible-captures-20261019T214811701Z-dev-visible-headed.20261019T214811701Z-dev-visible-headed-presented-bulb-overview.png) and [Bulb stress](../../../artifacts/project0/20261019T214811701Z-dev-visible-headed/visible-captures-20261019T214811701Z-dev-visible-headed.20261019T214811701Z-dev-visible-headed-presented-bulb-stress.png).
- **Diagnostic colours** ([spec A.5](../../superpowers/specs/2026-10-18-project0-space-qualification-design.md#a5-shading-draft-and-settled)):
  - unresolved rays are magenta (1, 0, 1);
  - numerical failures are red (1, 0, 0);
  - unavailable-normal hits are mid-grey (0.5);
  - the background is (0.02, 0.02, 0.03).

  None of these statuses is ever shaded as a surface.

The table counts the 640 × 360 = 230,400 stored samples:

| View | Hit | Miss | Unresolved | Unavailable normal, subset of hits | Failure |
|---|---:|---:|---:|---:|---:|
| sphere | 58,700 | 171,700 | 0 | **0** | 0 |
| bulb-overview | 64,051 | 166,348 | 1 | **10** | 0 |
| bulb-stress | 80,742 | 0 | **149,658** | **2** | 0 |

These are status-buffer counters (`out.<view>.counts`). The storage-image classifier separately counted 268, 226 and 459 mid-grey pixels (`storage.classes.unavailableNormal`). It classifies every RGB (128, 128, 128) pixel that way, so those counts include ordinary shaded pixels and cannot establish normal availability.

- **The stress view is mostly unresolved.** 149,658 of 230,400 samples are unresolved: 149,657 ran out of steps and 1 hit the point budget. The magenta area in that image is unresolved rays, and the image must not be read as a fully resolved surface.
- **Presented frame.** The 1280 × 720 presented frame shows 598,260 unresolved pixels in the stress view.

## 7. Accepted precision result and superseded evidence

T12 is separate from backend qualification. It does not change the mechanical outcome or the E10 basis.

- **Accepted run.** The accepted record is `precision-precision-20261020T181850179Z-precision-precision-headed`, at implementation `4465b3c`. Its `spikes/` tree (`ee18e264…`) is identical to the approved `ab6c5e9`, as verified with `git rev-parse`. It ran headed, with the same launch hash as the final campaign (`cee46f33…`).
  - **Files:** [record](../../../artifacts/project0/20261020T181850179Z-precision-precision-headed/precision-precision-20261020T181850179Z-precision-precision-headed.json), [raw](../../../artifacts/project0/20261020T181850179Z-precision-precision-headed/precision-precision-20261020T181850179Z-precision-precision-headed.raw.json), [launch](../../../artifacts/project0/20261020T181850179Z-precision-precision-headed/precision-precision-20261020T181850179Z-precision-precision-headed.launch.json) and [chrome://gpu](../../../artifacts/project0/20261020T181850179Z-precision-precision-headed/precision-precision-20261020T181850179Z-precision-precision-headed.chrome-gpu.txt).
  - **Run state:** all 160 supervision windows completed, with no execution invalidations.
  - **Related documents:** [precision.json](precision.json), [precision-interpretation.md](precision-interpretation.md) and [t12-validation-prereg.md](t12-validation-prereg.md).
- **Validation.** Compensation is validated for the tested primitives and the sampled kernel sites only:
  - six frozen and six supplemental primitive cases passed;
  - 7,104 capture sites were checked (mul 3,072, origin addition 3,072, t addition 960), with no failures;
  - the discriminating sites (2,880, 3,072 and 788) exceed the minimums (64, 64 and 32).
- **The result.**
  - Both implementations first exceed the discrepancy criterion at **10⁻⁵**.
  - **10⁻⁴** is the last tested distance within it.
  - No intermediate distances were tested.
  - Compensation improves some classifications but does not extend the observed precision range.

**Superseded ff11b35 evidence.** It is listed in the generated report and is not used.
- **What it is.** The run at `ff11b35` is **superseded, user-directed historical evidence**. It was collected while Codex's review was pending.
- **The accounting omission.** Its driver did not record `captureStorageBytes` or `captureStagingBytes`. Its compensated peak omits the 8,192 B persistent capture storage. Its summary's `extraBytes` (−65,888, or −66,272 at 10⁻⁴) is therefore wrong.
- **Why its metrics are not reinterpreted.** Its bytes are preserved unchanged. The fixed readers refuse its raw ("capture storage bytes must be a nonnegative integer"). The report tool therefore only hash-verifies its three artefacts and never recomputes them.
- **Files:** [precision-ff11b35-superseded.json](precision-ff11b35-superseded.json), [precision-ff11b35-superseded.md](precision-ff11b35-superseded.md), and the preserved [record](../../../artifacts/project0/20261020T175447161Z-precision-precision-headed/precision-precision-20261020T175447161Z-precision-precision-headed.json), [raw](../../../artifacts/project0/20261020T175447161Z-precision-precision-headed/precision-precision-20261020T175447161Z-precision-precision-headed.raw.json) and [launch](../../../artifacts/project0/20261020T175447161Z-precision-precision-headed/precision-precision-20261020T175447161Z-precision-precision-headed.launch.json).

## 8. Precision sampling, exclusions and interpretation

**Sampling** ([spec A.10](../../superpowers/specs/2026-10-18-project0-space-qualification-design.md#a10-precision-baseline); `fixtures.json` `precision`):
- **Rays.** The central **64 × 64 rays**, columns 608–671 and rows 328–391 of a 1280 × 720 frame.
- **Distances.** Eight camera distances d = 10⁻¹ … 10⁻⁸, with the camera at A − d·D looking at A. The frozen anchor is A = (0.6570552405982646, −0.49279143044869844, 0.23955138980145063), with direction D = (−0.768, 0.576, −0.28).
- **Profiles.** 128 field iterations and 512 marching steps. The primary tolerance is `0.005·α·t` (profile `precision`); the tighter reference is `0.0005·α·t` (`precisionTight`). There is no absolute floor. α = 0.0016037507477489603.
- **Per-distance inputs.** `fixtures.json` `precision.results[]` holds the actual camera origin, its f32-rounded form (`roundedOrigin`), its high/low pairs (`originPairs`, `pairOrigin`) and the nominal pixel footprint at the anchor. The footprint is about 1.60 × 10⁻⁷ at 10⁻⁴ and 1.60 × 10⁻⁸ at 10⁻⁵.
- **Per-ray inputs.** `precision.results[].rows[]` holds each ray's pixel, requested and effective directions, CPU traces, eligibility and reasons ([fixtures.json](../../../spikes/project0/fixtures.json)).

**Requested-input and actual-input comparisons.**
- **Two comparisons per implementation.** Each GPU implementation is compared with the CPU reference at the requested inputs, and separately with the CPU reference at its own actual inputs: f32-rounded for the baseline, pair-encoded for the compensated implementation.
- **At 10⁻⁵:**
  - against the requested inputs, the baseline has 415 status disagreements and 1,016 large depth errors;
  - against its actual rounded inputs, the baseline still has **412 status disagreements and 936 large depth errors**, so input conversion alone does not explain the discrepancy;
  - the compensated actual-input comparison (164 / 978) equals its requested-input comparison.
- **At every distance.** The compensated requested-input and actual-input comparisons are equal at every tested distance, as the results JSON rows show.

**Reference-eligibility exclusions.** The CPU reference marks a ray ineligible in three cases:
- **`depth`:** the primary and tighter CPU traces both hit, but their depths differ by more than 10⁻³ relative, or a depth is non-positive;
- **`primary-unresolved-steps` / `tighter-unresolved-steps`:** that CPU trace was still unresolved after the 512-step budget;
- **`resolved-status`:** the two traces resolve to different statuses.

`resolved-status` exists but did not occur. One ray can have more than one reason, so the reason counts can sum to more than the number of excluded rays. The exclusions per reference variant are:

| Distance | Requested and compensated-input exclusions / 4096 | Baseline-input exclusions / 4096 |
|---|---:|---:|
| 10⁻¹ | 86 — 2.10% | 86 — 2.10% |
| 10⁻² | 139 — 3.39% | 138 — 3.37% |
| 10⁻³ | 163 — 3.98% | 165 — 4.03% |
| 10⁻⁴ | 159 — 3.88% | 156 — 3.81% |
| 10⁻⁵ | 413 — 10.08% | 420 — 10.25% |
| 10⁻⁶ | 238 — 5.81% | 167 — 4.08% |
| 10⁻⁷ | 140 — 3.42% | 257 — 6.27% |
| 10⁻⁸ | 124 — 3.03% | 187 — 4.57% |

At 10⁻⁵, for example, the requested variant's reasons are `depth` 144, `primary-unresolved-steps` 105 and `tighter-unresolved-steps` 269. They total 518 across 413 excluded rays. The per-ray IDs and reasons are in `fixtures.json` at `precision.results[].rows[]`.

**Arithmetic-fixture exclusions.** These are frozen sensitivity-screen exclusions (spec A.3) and are separate from both of the above:
- **`bulb-samples`:** 124 of 4,096 excluded (3.03%). Every one involves a `logR` change; 78 involve a DE change and 18 a status or index change.
- **`qjulia-plane`:** 412 of 4,096 excluded (10.06%). Every one involves a `logR` change; 8 involve a status or index change.
- **G5-D's S3 band** is a different thing: 64 screen-ineligible cases measured as a non-gating diagnostic under E9 (§5).

**Thresholds.** E is the set of reference-eligible rays, and H is the set of CPU hits in E with positive depth.
- A set exceeds the threshold when status disagreements are more than 5% of E, or when GPU hits with relative depth error above 10⁻² are more than 5% of H.
- Every row is `interpreted: yes`.
- No stopping rule was reached: `firstStop: null`, and every row has empty `stopReasons`.
- Missing GPU hits count as status disagreements. Where status disagreement is total (10⁻⁷ compensated, 10⁻⁸ both), zero depth errors do not mean the depths are accurate.

**Local scope.**
- **What A.11 protects.** A.11 protects coordinate construction and recurrence addition. Substantial field computation stays f32: the nonlinear power map, radius and angles, derivative, estimator and directions.
- **Field precision.** Field-evaluation precision is a leading remaining bottleneck, but its share of the error is not quantified.
- **What the result is not.** The result is neither a universal zoom floor nor a validation of Plane's bitwise splitting: T12 tests arithmetic splitting with 4097.

## 9. Timing methods, readback and allocation costs

Each saved timing record carries a `timingMethod` descriptor.
- **G6.** Page clock, `observedMs`. Its 30 s window opens at the start of the measured path; publications and intervalP95 come from publish events, each recorded after its counts readback.
- **G7.** Page clock. Latency runs from a request's `render()` entry to its final publish event, after its counts readback. The window is anchored at the burst schedule origin.
- **Precision (T12).** Page clock, `costProtocolMs` (5,388.8 ms in this run), with the nested `workMs` and `readMs` samples as the cost evidence.
- **Readback.** All of these are page-clock measurements, and `readbackIncluded` is true in all of them.
- **GPU timestamps.** Gate metrics use the page clock; their `timestampQueriesUsed: false` descriptors refer to those metrics. GPU timestamp queries were used separately for band diagnostics: the nine G6 raws and G7/0 each retain eight samples. These diagnostics do not enter gate verdicts. G7/1 contains no saved timestamp diagnostics. T12 used no GPU timestamps. Publication remains distinct from physical scanout.
- **Queue-completion warning.** [G6/bulb-overview/0](../../../artifacts/project0/20261020T163936979Z-webgpu-g5d-timing-headed/G6-bulb-overview_0-20261020T163936979Z-webgpu-g5d-timing-headed.raw.json) also records a maximum queue-completion band duration of 149.8 ms, exceeding the 30 ms diagnostic warning. This session-level summary includes warm-up bands (5,092 samples against 4,509 measured publications) and does not locate that maximum within the measured window. It is not isolated shader time and does not change the gate classification.

**T12 cost protocol** (`fixtures.json` `costProtocol: {warmups: 3, measured: 10}`):
- **Runs.** Three unrecorded warm-ups, then ten measured runs, alternating baseline and then compensated. Batch sizes adapt per run and differ between the implementations.
- **`workMs`.** Measures host submission through queue completion (`onSubmittedWorkDone`), without readback. It is not an isolated shader-instruction timing.
- **Instrumentation.** The capture writes are inside the measured kernel.
- **`readMs`.** Measured separately: staging allocation, copy, `mapAsync`, and copy-out.
- **`costProtocolMs`.** Includes every warm-up, every readback and the host work between runs, so it only bounds the samples.

The medians, with ranges, from the results JSON:

| d | work base | work comp | read base | read comp |
|---|---|---|---|---|
| 10⁻⁴ | 6.15 [4.90–11.50] | 7.15 [7.10–**163.00**] | 2.50 [0.40–2.60] | 2.50 [0.40–2.60] |
| 10⁻⁵ | 11.45 [10.50–20.10] | 47.35 [44.10–50.50] | 2.50 [0.40–2.60] | 1.45 [0.40–2.50] |
| 10⁻⁶ | 11.40 [10.30–11.80] | 50.05 [46.80–51.40] | 0.55 [0.30–2.60] | 0.70 [0.40–2.90] |
| 10⁻⁷ | 6.00 [5.90–11.70] | 44.65 [42.10–46.20] | 2.50 [0.30–2.60] | 0.50 [0.40–2.60] |
| 10⁻⁸ | 49.25 [47.10–52.20] | 11.50 [11.40–39.60] | 0.50 [0.40–2.70] | 0.50 [0.30–2.40] |

(ms, 10 samples each. The rows for 10⁻¹–10⁻³ are in the results JSON.)

- **Work ratios.** The compensated/baseline work ratios are about **4.14×**, **4.39×** and **7.44×** at 10⁻⁵, 10⁻⁶ and 10⁻⁷.
- **10⁻⁸.** The timing order reverses (49.25 vs 11.50 ms), and the cause is undetermined. Both outputs are entirely unresolved.
- **The 163 ms outlier.** The 163 ms compensated sample at 10⁻⁴ is kept in the range.
- **Allocation.** **−57,696 B** is the difference between the two explicit allocation peaks (204,848 B compensated, 262,544 B baseline). It is not an inherent saving from compensation.
  - The compensated peak includes the 8,192 B persistent capture storage and the 16 B barrier uniform.
  - The separate 8,192 B diagnostic staging allocation is disclosed in `bytes.captureStagingBytes`.

These are costs of the instrumented prototype. See the precision record's `timingMethod`, the raw (`sets[]`) and [precision-interpretation.md](precision-interpretation.md).

## 10. Carry-forward and handoff

- **Into Project 1:** the timing limitation (G6, G7 and G9 not qualified; cause unknown), the headless limitation (E7) and the amended G5 scope (E8 and E9; S3 not validated).
- **Timer requirements for Project 1's performance harness** ([platform-decision.md](platform-decision.md)):
  - round positive waits upward;
  - keep absolute targets rather than accumulating relative delays;
  - save rearm counts and long-task evidence, including on failure.
- **Projects 1a/1b** follow the E10 selection, which confirms E6's provisional assumption.
- **Precision research** belongs to Project 1c, through the fractal iteration itself, such as perturbation against a high-precision reference orbit.
- **Not to be drawn from this evidence:** 10⁻⁵ must not become a universal camera clamp, and A.11 must not be enabled generally.
- **Next steps:** after the joint review of this report with Codex, the verbatim exchanges are archived in `docs/codesign/conversation-log.md` and `docs/codesign/plan-log.md`, and the planned handoff to the user follows.
