# WebGPU remediation

**Original campaign:** `webgpu-1`  
**Baseline implementation:** `bd978e6bf12202119522c3c517418b22a705fecf`  
**Baseline evidence commit:** `93fe8dc`  
**Preregistration:** `docs/reports/project0/webgpu-remediation-prereg.md`, revision 2, READY, commit `44e21fd82fb173d4827c8a7f344836c00d475a74`

## Classification

These classifications describe the evidence from `webgpu-1`, recorded in `webgpu-1-manifest.json` and `webgpu-1-gates.json`. They preserve its gate statuses and overall **inconclusive** decision.

For this baseline classification, **evidence not collectable (inconclusive)** denotes qualifying evidence unavailable within the completed campaign, including collection blocked by its correctness prerequisite. It does not declare permanent hardware incapability or exhaustion of G1-C’s diagnosis allowance. The terminal headless disposition in preregistration §4.4 has not been reached.

| Gate | Recorded status | Classification | Justification |
|---|---|---|---|
| G1 | invalid/inconclusive | **evidence not collectable (inconclusive)** | Headed evidence reports NVIDIA/Lovelace and `isFallbackAdapter: false`, but selected-adapter `device` and `description` are empty, preventing the required identity corroboration. Headless evidence reports `requestAdapter returned null`, with no acquired adapter or completed probe. Neither observation establishes software execution or a demonstrated failure cause. G1-A addresses identity collection; G1-C investigates acquisition. |
| G5 | fail | **implementation defect** | The current quaternion update fails the frozen numerical contract: the clean off-plane record has `componentRatio = 2.7497713106862958`, exceeding 1. This reproduces E2’s observed failure under permitted contraction. The classification concerns the numerical robustness of this implementation; it does not assert compiler nonconformance or that every WebGPU implementation must fail. The plane slot passes, with `logRRatio = 0.27446631787665454`, 3,684 eligible samples and zero status/index errors. G5-A is the preregistered implementation correction. |
| G2 | not run | **evidence not collectable (inconclusive)** | Startup collection was blocked by the G1 correctness-phase stop. No qualifying startup measurement exists for this campaign. |
| G6 | not run | **evidence not collectable (inconclusive)** | Throughput trials were blocked by the G1 correctness-phase stop. No qualifying throughput result exists for this campaign. |
| G7 | not run | **evidence not collectable (inconclusive)** | Motion measurements were blocked by the G1 correctness-phase stop. E4’s development observations do not supply a campaign verdict. |
| G8 | not run | **evidence not collectable (inconclusive)** | Collection was blocked by the G1 correctness-phase stop. Development results cannot replace the missing campaign evidence. |
| G9 | not run | **evidence not collectable (inconclusive)** | The timing invocation and its required companion windows were not run after the G1 stop. No qualifying G9 observation exists. |
| G10 | not run | **evidence not collectable (inconclusive)** | Collection was blocked by the G1 correctness-phase stop. No qualifying result exists for this campaign. |
| G12 | not run | **evidence not collectable (inconclusive)** | The stability sequence was blocked by the G1 correctness-phase stop. Earlier development stability evidence is not selected campaign evidence. |

**G3, G4, G11 and G13 passed and need no failure-classification entry.** Their original results remain preserved, but all four must rerun under the remediation configuration.

All seven correctness invocations completed before the phase decision; no live abort occurred. The stop reason was `correctness gate G1 is invalid/inconclusive`. The seven unattempted gates have no `blockedBy` entry. G5’s measured failure does not convert the missing or invalid evidence into an overall backend failure.

The present headless result is failure at `requestAdapter`, as observed previously in E1. E4’s separate development result failed later at `requestDevice` with “A valid external Instance reference no longer exists”. Preserve that distinction. Preregistration’s teardown hypothesis remains a hypothesis; the current evidence does not establish a launch, lifetime or backend cause.

These classifications agree with the preregistered remedies. E1’s diagnostic rerun exception grants no new retry allowance. E3’s failed preflights and E4’s development evidence remain preserved and excluded from qualification. E2 supplies diagnostic context; the qualifying G5 failure above comes from `webgpu-1` itself. E6’s provisional WebGPU assumption permits parallel Project 1 design without changing this inconclusive Project 0 decision or any mandatory gate.

## Change set

G5-A, G1-A and any justified G1-C correction form **one combined WebGPU remediation change set** under E5 and specification §6. At this preregistration commit, that implementation remains to be prepared, tested, reviewed and committed.

1. **G5-A — fixed compensated quaternion update.**

   Relevant paths are `spikes/project0/gpu/fields.wgsl`, `spikes/project0/gpu/arithmetic.wgsl`, `spikes/project0/gpu/webgpu.js`, `spikes/project0/browser/drivers/checks.js`, `spikes/project0/measure/arith.mjs` and the nonfrozen qualification integration in `spikes/project0/qualify.mjs`.

   Implement the exact `TwoProductFMA`, `TwoSum` and `CompDot` operation order and component operands in preregistration §2. Replace both `qsq(q) + C` call sites, covering plane and off-plane updates. Compensation remains local to each update; the recurrence state remains one `vec4f`. Mandelbulb arithmetic, escape tests, norm/logarithm evaluation, iteration limits and output layout remain unchanged.

   Before any new-form GPU execution, independently reproduce Models F, U, S, DB and SDB; commit their generators, expected words and hashes, the complete 4,096-sample plane artifact, the primitive grid, discriminating witnesses and 1,024 general quaternion updates. Check the arithmetic range assumptions and CPU plane prerequisite. New models, data and tests belong in separately named nonfrozen remediation files under `spikes/project0/`; preregistration does not prescribe their basenames. Record their exact paths and hashes in the committed change set.

   Validation includes focused CPU tests, arithmetic-metric regression coverage in `spikes/project0/tests/arith-metrics.test.mjs`, and saved GPU readbacks from the supplementary checks. Bind supplementary validation to G5 and recompute it at evidence-read time. The actual off-plane qualification entry point must match all 32 Model F words, and both frozen G5 comparisons must pass.

   The candidate remains conditional on compiled-target validation. A model mismatch or missing validation leaves compensation unvalidated even if a frozen comparison passes. An unsuccessful candidate does not authorize another expression, negative-control fallback or compiler-setting search.

2. **G1-A — selected-adapter Dawn diagnostic and verified probe.**

   Relevant paths are `spikes/project0/gpu/device.js`, `spikes/project0/browser/drivers/g1.js`, `spikes/project0/run.mjs`, `spikes/project0/launch.mjs`, `spikes/project0/evidence.mjs`, `spikes/project0/measure/timing.mjs` and `spikes/project0/qualify.mjs`.

   Under the preregistered developer flag, capture extended information from the exact retained adapter used to create the probe device: vendor, architecture, device, description, fallback status, driver, backend, type and Vulkan driver version, preserving absent fields. Bind before/after acquisition snapshots and any exposed device identity to the campaign, run, owned browser/profile and document/target identities.

   Retain the probe’s raw readback and verify its numerical result using the frozen arithmetic comparison. The existing length/status-range check alone is insufficient. Collect `chrome://gpu` from the same browser instance and apply preregistration’s selected-adapter/unique-ACTIVE-record matching rules. Do not substitute an adapter inventory, another adapter request or a default device ID.

   Extend `spikes/project0/tests/g1.test.mjs`, `spikes/project0/tests/gpu-text.test.mjs` and evidence-validation tests for the prescribed positive cases and rejection of malformed or mismatched IDs, duplicate fields, multiple ACTIVE records, stale bindings, contradictory identities, software adapters and unverified readbacks. Apply the protocol independently to headed and headless G1.

3. **G1-C — bounded headless diagnosis and only a demonstrated correction.**

   Relevant existing paths are `spikes/project0/gpu/device.js`, `spikes/project0/browser/drivers/g1.js`, `spikes/project0/run.mjs`, `spikes/project0/session-utils.mjs` and `spikes/project0/launch.mjs`.

   Start with the original evidence and code. Record acquisition, settlement, cancellation, navigation, document/browser/process lifetime and cleanup events, preserving exact errors and browser stderr. Diagnosis is capped at four hours of active diagnosis and analysis, with timestamped intervals, cumulative active time and wall-clock span; peer-review waiting is recorded separately.

   If necessary, the allowance is at most one instrumented headless acquisition and one headed control, using attempt-1 flags and the preregistered bounded probe. These are excluded diagnostic records. Existing deadlines, watchdogs and stop/report requirements remain binding.

   Apply only a causally justified correction permitted by preregistration §4.3. Each correction needs a test that fails without it; acquisition-lifetime tests must cover success, rejection, cancellation and a late device after abort. Relevant regression suites include `spikes/project0/tests/lifecycle.test.mjs`, `spikes/project0/tests/runners.test.mjs` and `spikes/project0/tests/g1.test.mjs`.

   Record any justified additional launch correction with exact arguments in the same combined change set before its first GPU execution. There is no preliminary GPU rehearsal of the correction or final flag combination.

4. **Retained T10/T9 tooling — reviewed baseline foundation.**

   Retain `spikes/project0/campaign.mjs`, `spikes/project0/qualify.mjs`, `spikes/project0/close-remediation.mjs`, `spikes/project0/integrity-preflight.mjs`, `spikes/project0/gates-checked.js`, `spikes/project0/timing-contract.js`, `spikes/project0/session-utils.mjs` and `spikes/project0/supervision-plan.js`.

   Preserve the reviewed browser integrity and visible-status fixes in `spikes/project0/browser/integrity.js`, `spikes/project0/browser/integrity-preflight.js`, `spikes/project0/browser/visibility.js` and `spikes/project0/browser/drivers/g2.js`.

   Retained guarantees include checked verdicts, exact timing descriptors, artifact and auxiliary hashes, checkpoint validation, source-preflight validation, explicit incomplete attempts, coherence, correctness prerequisites, live stops and failure reporting. Regression coverage includes the `t10`, `qualify`, `timing-contract`, `supervision` and T9 regression suites under `spikes/project0/tests/`. Remediation-specific evidence checks must preserve these guarantees.

5. **Launch configuration, complete campaign request and closure.**

   Create `spikes/project0/launch-remediation.json` initially containing exactly:

   ```json
   [
     "--enable-gpu",
     "--use-angle=vulkan",
     "--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan",
     "--enable-webgpu-developer-features"
   ]
   ```

   Any additional G1-C correction requires recorded causal justification and peer review, and must be frozen in this same file before remediation GPU execution. Preserve sandboxing, watchdogs and adapter-selection settings.

   **The developer flag is a qualification diagnostic dependency and must be disclosed.** Label remediation timestamp values **“browser timestamp quantization disabled”**; do not compare them with attempt-1 timestamp values. Timestamp diagnostics remain outside the frozen timing pass criteria.

   Keep the preregistered feature-request policy unchanged: G1 and arithmetic/checks request no optional features; the common rendering/session path and integrity probe request only available `timestamp-query`. Record available and granted features for every acquisition. Compare granted sets against comparable acquired-device baseline records; a difference invalidates that gate. Where the baseline acquired no device or never ran the gate, record the comparison as unavailable and verify the prescribed request/grant calculation without inventing baseline data.

   Request exactly **G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G11, G12 and G13**, with **no reuse**. The developer flag changes configuration identity, requiring a full rerun. Both G1 modes and both G5 slots are included; G6/G7/G9 run through the complete timing invocation.

   Use:

   ```bash
   node spikes/project0/campaign.mjs --name webgpu-remediation --args remediation --reuse '[]'
   ```

   Thus `--args` is `remediation`, `--reuse` is explicitly empty, and `--gates` is omitted to request every gate. `run.mjs` loads `LAUNCH.remediation` from the committed configuration file.

   Before execution, complete the required diagnosis, CPU preparation, focused tests and peer review, then commit the implementation, expectations, launch configuration and history. Verify the frozen fixtures and clean implementation. The campaign runs a fresh integrity preflight against that final implementation and the actual remediation flags.

   Supplementary compensation validation belongs in the correctness phase, bound to G5 and excluded from performance windows. The first GPU execution of the new form belongs to this single remediation attempt, including any such execution during preflight.

   Full requested coverage remains subject to existing correctness prerequisites and live stops. Do not continue performance after failed correctness or override a stop to fill the table. Preserve every attempted result and every unexecuted gate’s reason.

   Preserve the original `webgpu-1` manifest and artifacts. Record actual validation results, diagnosis intervals, configuration and feature disclosures, artifact hashes and stop reasons in this history. Close through `spikes/project0/close-remediation.mjs` and the frozen decision procedure. All mandatory gates must pass before WebGPU is selected. An unsuccessful remediation closes this cycle and is escalated under E5; E6 remains provisional.
