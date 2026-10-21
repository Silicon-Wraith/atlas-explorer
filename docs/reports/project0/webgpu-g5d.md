# webgpu-g5d: the single E8 attempt (G5-D)

**Authority:** E7, E8 and E9. Preregistration `webgpu-g5d-prereg.md` (commit 9c59e51), profile `project0-g5d-v1`.

**Implementation:** f754534, approved by Codex in run 20261020T163238Z-d602. The evidence was committed at ae0871d.

**Closure:** `close-g5d.mjs` writes `webgpu-g5d-decision.json`. `webgpu-decision.json`, the earlier remediation closure, is not overwritten.

## Campaign

**Command, run once:**

```
node spikes/project0/campaign.mjs --name webgpu-g5d --args remediation --qualification project0-g5d-v1 --reuse '[]'
```

**Conditions:**
- There was no `--gates` argument, no reuse, no browser rehearsal, no retry and no edit.
- The tree was clean at f754534 / d2dd9e74….
- The campaign ran its own fresh headed integrity preflight, `20261020T163908552Z-dev-integrity-preflight-headed`, at that identity with the pinned remediation launch arguments.
- Every gate ran headed.

**Run:**
- It ran from 16:39:02Z to 16:55:35Z on 2026-10-20.
- Exit code 0, `verificationErrors: []`, no STOP, `notRun` {} and no attempts. Every gate was attempted.

**Reports:**
- `webgpu-g5d-manifest.json`
- `webgpu-g5d-gates.json`

| Gate | Status | Evidence |
|---|---|---|
| G1 | pass | nvidia 1, software 0, corroborated 1 (headed only, E7) |
| G2 | pass | navigation 468.3 / 471.6 / 473.7 ms (fresh), 439.8 ms (warm) |
| G3 | pass | depthRatio box 0.0655, menger-1 0.1565, menger-2 0.4723, sphere 0.0263; 0 status/edge errors |
| G4 | pass | deRatio 0.0621, logRRatio 0.7898, 3972 eligible |
| G5 | pass (as amended by E8, E9) | operational 223/223 qualifying, 0 status/index/numerical failures, componentRatio 0.19243534038149068, logRRatio 0.10932112776388266; plane 0 status/index errors, logRRatio 0.27446631787665454 |
| G6 | invalid/inconclusive | all nine windows within limits (intervalP95 8.6–9.4 ms, published 4419–5018, pendingMax 1), invalidated by the invocation-wide G7 deviation |
| G7 | invalid/inconclusive | G7/0: 400 requests, 20 finals, latencyP95 9.6 ms; G7/1: request 160 issued 4.30 ms late (limit 4 ms); G7/2 never produced |
| G8 | pass | latency 16.1–19.8 ms, 0 stale publications |
| G9 | invalid/inconclusive | missing required trial: never produced |
| G10 | pass | 40.3 / 10.4 / 14.3 ms |
| G11 | pass | 0 mismatches, peak 405,998,736 bytes, cancelled and released |
| G12 | pass | 60 cycles, 600,003 ms, 0 deadline misses, 0 unplanned losses, 0 count or byte differences |
| G13 | pass | interruption, recovery and no retry after repeat |

**Mechanical decision:** `inconclusive — next: resolve missing or invalid WebGPU evidence`.

### G5 detail

**Operational orbits, qualifying bands:**

| Band | Samples | Outside criteria | Status/index disagreements | Worst componentRatio | Worst logRRatio |
|---|---|---|---|---|---|
| S0 with updates | 86 | 0 | 0 | 0.119006 | 0.019807 |
| S0 initial escapes | 8 | 0 | 0 | 0 | 0.002144 |
| S1 | 65 | 0 | 0 | 0.192130 | 0.067240 |
| S2 (escape 8–11) | 32 | 0 | 0 | 0.192435 | 0.109321 |
| SB (128 updates) | 32 | 0 | 0 | 0.187788 | — |

The CPU models predicted every sample would pass, with maxima of 0.219–0.304 for componentRatio and 0.106–0.143 for logRRatio. The GPU's words match none of the four models as a whole. Per case, they agree with F on 81 of 287 cases.

**S3, a non-gating diagnostic under E9:**
- 61 of 64 samples are outside the numerical criteria.
- One escape-index disagreement: U045421, reference 93, GPU 94.
- The models predicted 60–62 samples outside and 0–1 index disagreements.

**Forced continuation, a diagnostic under E8:**
- componentRatio **2.7497713106862958**.
- It matches Model F bit for bit, the same value as the original webgpu-1 failure.

## Diagnosis of G7/1 request 160 (Codex joint position, run on the authenticated raw evidence)

**Callback lateness before the rejection:**

| Observation | G7/0 | G7/1 before rejection |
|---|---:|---:|
| Requests issued | 400 | 160 |
| Median callback lateness | 3.50 ms | 3.30 ms |
| P95 callback lateness | 3.70 ms | 3.50 ms |

**Request 160:**
- It was scheduled for 338548.5 ms, and its callback entered at 338552.7999997139 ms. It was rejected before the renderer was called.
- The preceding request's frame had been published 989.5 ms before that target.

**The cause is unknown.**

**The leading diagnostic target is harness scheduling.**
- `spikes/project0/browser/drivers/timing.js:57` passes fractional rearm delays (`target - t`) directly to `setTimeout`.
- Browser timer arguments undergo integer conversion, so a positive remainder below 1 ms becomes zero.
- Repeated early callbacks can therefore reach the 4 ms minimum for nested timers.
- This mechanism consumes almost the whole 4 ms issuance allowance before ordinary scheduling jitter occurs.

**CPU simulation.** A CPU-only simulation of the actual `runBursts()` under a browser-style timer model gave these results:
- A fractional target produced **3.47 ms** of lateness with no added stall.
- Adding a 1 ms stall at the clamped wake-up produced **4.47 ms** and a rejection.
- Rounding positive waits upward avoided that chain.

This demonstrates the implementation vulnerability. **It does not prove that request 160 followed that sequence.**

**Missing evidence:**
- Intermediate callbacks and rearm counts were not saved.
- Long-task entries were inspected but discarded when the partial record was saved. The roughly 50 ms threshold of long-task observation cannot exclude a shorter stall in any case.
- There is no contemporaneous trace of CPU scheduling or of X11/the compositor.

**Conclusion:**
- Harness scheduling is the strongest diagnostic target.
- Host load and browser or main-thread interference remain possible.
- X11 causation is unproven.
- **No WebGPU backend limitation is demonstrated.** This was an issuance failure that occurred before the affected rendering request.

## Classification

**G6, G7 and G9: invalid/inconclusive.** The cause classification is "timing evidence incomplete; cause unknown; demonstrated harness scheduling vulnerability".

- **G6:** the nine completed observations meet their limits. They keep the invocation-wide invalidation, as E4 requires.
- **G7:** trial 0 meets its latency limit. Trial 1 violates issuance validity, and trial 2 is missing. This is not a measured failure of rendering latency.
- **G9:** the required twelve-window evidence was never produced. It is not inferred from the absence of a diagnosed long task.

In this record, "evidence not collectable" means only that this invocation cannot yield qualifying evidence. It does not mean evidence is permanently impossible to collect. The lateness is not reclassified as external interference, G6's invalidations are not stripped, and the missing G9 is not treated as a pass.

**All other gates pass.** G5 passes only as amended by E8 and E9. Under prereg §10 this attempt is consumed and closed as it stands.

## Change set
None in this cycle after the reviewed implementation: the campaign ran at f754534 exactly as approved (G5-D implementation da2563a, fix round 1 f754534). No harness, threshold, kernel or launch change was made after execution.

## User decision

E10 (`docs/codesign/execution-decisions.md`, committed at 471fcb2), quoted:

> **The user's decision, verbatim:** "Select WebGPU now. That is my decision."

**WebGPU is selected. The selection was chosen by explicit user override; timing qualification is incomplete.**

**Status of the override:**
- It is an explicit exception to the specification §6 rule that selection requires every mandatory gate to pass.
- It is not a mechanical qualification, and it is never described as one.
- The frozen decision procedure, applied to this evidence, yields **inconclusive**. That mechanical result is recorded unchanged in `webgpu-g5d-decision.json`, and it is not overwritten.
- Neither the earlier `webgpu-decision.json` nor any campaign record is altered.

**Limitations carried into T13:**
- G6, G7 and G9 are not qualified (a harness timer-issuance problem).
- Headless execution is not required (E7). The Chrome 151 headless GPU-process crash remains a known limitation.
- G5 passes only as amended by E8 and E9. S3 long-escape orbits are not validated at f32 input precision. The 2.7498 failure (webgpu-1) and the 4.7449 failure (G5-A) stand.
- The G5-A compensation was defeated by compiler reassociation.
