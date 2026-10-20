# Project 0 platform decision

## Decision

**Selected backend: WebGPU.**

The user chose WebGPU by explicit override (E10, `docs/codesign/execution-decisions.md`, commit 471fcb2): "Select WebGPU now. That is my decision."

**Status of the decision:**
- The selection is a **user override; timing qualification is incomplete**. It is an explicit exception to the specification §6 rule that selection requires every mandatory gate to pass.
- The mechanical decision computed from the evidence remains **inconclusive** (`webgpu-g5d-decision.json`). It is recorded unchanged and is not overwritten.
- Project 1's provisional WebGPU assumption (E6) is confirmed. Project 0 continues to T12 (the precision experiment) and T13 (the report). Space deep zoom becomes Project 1c.

## Evidence

The evidence is the final campaign, `webgpu-g5d`: implementation f754534, all gates headed, no reuse.

| Gate | Result | Evidence |
|---|---|---|
| G1 GPU identity | pass (headed only, E7) | NVIDIA RTX 6000 Ada, hardware, corroborated |
| G2 cold and warm start | pass | navigation 468–474 ms fresh, 440 ms warm |
| G3 analytic ray marching | pass | worst depthRatio 0.472 |
| G4 Mandelbulb arithmetic | pass | deRatio 0.062, logRRatio 0.790 |
| G5 quaternion arithmetic | pass **as amended (E8, E9)** | operational orbits 223/223, worst componentRatio 0.192; plane logRRatio 0.274 |
| G6 sustained frame rate | **invalid/inconclusive** | all nine windows within limits (interval P95 8.6–9.4 ms), but they share the invalidated timing invocation |
| G7 interaction latency | **invalid/inconclusive** | trial 0 passed (P95 9.6 ms); trial 1 was rejected because a request was issued 4.30 ms late (limit 4 ms); trial 2 was never run |
| G8 stress latency | pass | 16–20 ms |
| G9 main-thread attribution | **invalid/inconclusive** | never produced |
| G10 view preparation | pass | 10–40 ms |
| G11 4K resources | pass | 0 mismatches |
| G12 ten-minute stability | pass | 60 cycles, 0 deadline misses, 0 losses |
| G13 loss and recovery | pass | all cases recovered |

## Limitations carried forward

- **G6, G7 and G9 are not qualified.**
  - One G7 request was issued 0.30 ms beyond its tolerance, and the cause is unknown.
  - No WebGPU limitation is demonstrated. The leading diagnostic target is a harness timer defect (below).
- **Headless execution is not required (E7).** On this host, Chrome 151's GPU process crashes at headless startup before any WebGPU request. That crash remains a known limitation.
- **G5 passes only as amended by E8 and E9.**
  - The qualification covers operational orbits through first escape, for escape indices 0–11, and bounded orbits through 128 updates.
  - Long-escape (S3) orbits are not validated at f32 input precision. They were measured as a diagnostic only.
  - The original failures stand under their own contracts: 2.7498 for the eight-iterate continuation (webgpu-1) and 4.7449 for the G5-A remediation.
- **G5-A compensated arithmetic was defeated by compiler reassociation.** The TwoSum error term was eliminated, so compensated binary32 arithmetic is not available on this path.

## Carry-forward: the harness timer defect

`spikes/project0/browser/drivers/timing.js:57` passes fractional rearm delays to `setTimeout`.
- Browsers truncate these to integers, so a remainder below 1 ms becomes 0.
- Repeated early callbacks then hit the 4 ms nested-timer clamp.
- A CPU simulation reproduced 3.47 ms of lateness with no stall, and 4.47 ms (a rejection) with a 1 ms stall.

**Project 1's performance harness must:**
- round positive waits up;
- keep absolute targets, never accumulating relative delays;
- record rearm counts and long-task entries, including on failure.

## Records

**Decisions:**
- `docs/codesign/execution-decisions.md`, decisions E1–E10.

**Original campaign, webgpu-1:**
- [webgpu-1-manifest.json](webgpu-1-manifest.json)
- [webgpu-1-gates.json](webgpu-1-gates.json)

**Remediation, G5-A and G1-A (E7):**
- [webgpu-remediation-prereg.md](webgpu-remediation-prereg.md)
- [webgpu-remediation.md](webgpu-remediation.md)
- [webgpu-remediation-e7-addendum.md](webgpu-remediation-e7-addendum.md)
- [webgpu-remediation-manifest.json](webgpu-remediation-manifest.json)
- [webgpu-remediation-gates.json](webgpu-remediation-gates.json)
- [webgpu-decision.json](webgpu-decision.json): inconclusive, unchanged.
- [webgpu-g1c-diagnosis.md](webgpu-g1c-diagnosis.md): the headless crash.

**G5-D (E8, E9):**
- [webgpu-g5d-prereg.md](webgpu-g5d-prereg.md)
- [webgpu-g5d-prereg-claude-review.md](webgpu-g5d-prereg-claude-review.md)
- [webgpu-g5d.md](webgpu-g5d.md)
- [webgpu-g5d-manifest.json](webgpu-g5d-manifest.json)
- [webgpu-g5d-gates.json](webgpu-g5d-gates.json)
- [webgpu-g5d-decision.json](webgpu-g5d-decision.json): mechanical outcome inconclusive.

**G5-D profile:**
- `spikes/project0/qualification/g5d-v1.json`
