# PC1 — preparation boundary and native replay

**2026-10-29. Owner: Codex; challenger: Claude. Status: first PC1 CPU slice complete and independently reviewed. Native live wiring remains for WC2.**

The first PC1 slice turns the prepared-region boundary into executable code. It preserves the working world while making view eligibility, interaction readiness, stale-result rejection and resource retirement explicit. A recorded native producer can satisfy spatial requests through this boundary. Application integration and a live native producer using the boundary remain later work; existing ATLAS behavior is unchanged.

Implementation worktree: `/mnt/ml_storage/scratch/atlas-preparation-pc1/worktree`, branch `feat/pc1-preparation-contract`, based on `5604e6230da2ed45a3e81272c5c7e04b35e59d44`. The primary reporting checkout has no PC1 changes under `src/` or `tests/`. That was the CPU-evidence baseline. For PR publication this worktree is based on `docs/browser-world-roadmap`, which includes current main after handoff PR #16; the product source and unit-test inputs are unchanged. The documentation PR is the implementation PR's base. Promotion to main remains the advisor's merge decision.

## Full frozen-card scorecard

| Criterion | Result | Evidence and limit |
|---|---|---|
| Fixed mathematical identity | Pass within replay | All four original artifacts preserve `H1C-surface-child@ee2564d40bda7ef6`. The producer verifies original legacy canonical bytes and six asset digests; portable records separate world from representation/requirements. Portable regeneration is unproved. |
| Spatial and representation fidelity | Pass within replay | Original origins, normalization, actual 3D bounds, declared tolerances and exact binary digests survive. Contained requests return actual larger bounds. Keys include 18 canonical source digests, sampling/approximation policy, payload digests and fine retained-parent dependency; no fixture address. Finite qualification remains empirical. |
| Readiness and eligibility | Pass, CPU protocol | Native `prepared` becomes ready only after a compatible consumer receipt. Coarse/fine/empty-air are interaction-ready; view is view-ready and never interaction-eligible. Full-solid is synthetic contract evidence only. A ready representation does not assert body clearance. |
| Stale and failure safety | Pass, CPU protocol | Focused units reject old runtime/producer epochs and mismatched revisions; cancellation before/during preparation cannot publish; failed/unresolved/cancelled/unsupported states grant no coverage. Four actual unsupported replay requests cover world, coverage, shape and accuracy. |
| Ownership | Pass for explicitly leased CPU resources | Five accepted payload/consumer pairs retire exactly once; live lease count/attributed payload bytes return to zero. Release errors remain visible and stop admission; shutdown/recovery deadlines report unconfirmed ownership. GPU/native-cache/physics ownership is not established by these stand-ins. |
| View-only work | Pass, adapter path | View reads 3,106,728 bytes in two render buffers, reads zero solid buffers and invokes no collision preparation. The original view solid buffer is 2,089,680 bytes. This establishes omitted work at the boundary, not a measured browser speedup. |
| Compatibility and process | Pass for affected CPU scope | 18 focused tests; complete guarded suite 1,242 tests across 69 files, no failures/skips, cleanup confirmed. Six canonical-byte hash vectors match Python/JavaScript. No new dependencies, browser, native GPU worker or service was run. Product acceptance is not claimed. |

## Recorded replay cases

| Case | Returned state | Class | Payload bytes | Declared policy tolerance |
|---|---|---|---:|---:|
| Coarse surface | interaction-ready | surface | 1,207,212 | 0.000265625 m |
| Canonical fine | interaction-ready | surface | 1,556,832 | 0.00006640625 m |
| Constructed air | interaction-ready | empty-air | 0 | 0.000265625 m |
| Distant view | view-ready | surface | 3,106,728 | 0.0010625 m |

The zero-byte air payload has explicit construction classification and 1,024 preserved sampled confirmations. A missing payload never becomes empty space. Fine geometry retains its original parent-reference input by digest. View intent carries no interaction body. Consumer receipts here are CPU stand-ins; no real GPU or collision world is built by this test.

## Established, supported and unresolved

**Established by executable CPU checks:** strict versioned records and owned snapshots; stable semantic/representation separation; exact replay bytes and transforms; eligibility, freshness, cancellation, retirement and bounded cleanup behavior; no collision path for view replay.

**Supported finite findings:** preserved BW1 empirical qualification accompanies the artifacts, original native/source assets match their recorded digests, and the fine retained dependency is now explicit. No new mathematical field or topology verification was run. Python independently hashes canonical UTF-8 bytes; it does not independently canonicalize dictionaries.

**Unresolved:** real WebGPU/collision preparation receipts and safe active-region handoffs; live producer integration; arbitrary 3D coverage; portable generator installation/regeneration; cross-platform numerical/place promises; preparation speed, navigation tails and complete memory ownership. BW1's reported 49.45 FPS, preparation and memory gaps remain unchanged. PC1 introduces no new visual or performance gate.

## Attempts, review and process accounting

The initial identity audit failed because the JS server report changes Python's `64.0` to `64`. The original native metadata reproduces the recorded legacy ID; all six input assets match. The boundary now names its canonical byte identity algorithm explicitly instead of recomputing the legacy hash in JS or claiming JCS compatibility.

The initial inventory guessed `.solid.indices.bin`; inspecting the preserved loader established `.solid.bin`. Both inventory attempts remain preserved. No experimental payload changed.

Initial sandbox unit invocations returned no TAP evidence and are excluded. One diagnostic `--expect-fail` invocation did not establish RED and is not reported as such. The maintained guarded runner outside the sandbox supplied the actual passing TAP evidence. No runner policy was changed.

Code was initially written in the reporting checkout; this was corrected by moving only PC1 source/test changes into the dedicated worktree and restoring the primary manifest. Existing user edits and report work were retained.

Card challenge `20261029T224805Z-659ba4` supports PC1 and supplied seven useful corrections: canonical identity, full representation policy, fine dependency, explicit classification, producer freshness, containment and declared-tolerance comparison. Owner checked source before adopting factual claims. Evidence review `20261029T230131Z-a497ca` confirms closure within the CPU scope and found no material safety, ownership or identity defect. Claude read the contract, lifecycle, adapter, evidence summary and test titles; he did not execute tests or independently recompute the figures, and did not inspect screenshots. His statement about region 143 describes the missing-reference policy in source: region 143 was not one of the four replay specimens and its BW1 completeness gap remains open.

Process cost: roughly twenty-five minutes elapsed including permission/review waits and two peer reviews; the full CPU suite took 7.61 seconds and final replay 121 ms on this run, neither treated as a performance benchmark. No GPU corpus was needed. The card challenge and preserved-byte checks were worthwhile because they exposed real identity/provenance weaknesses before integration.

The evidence review flagged a nonblocking sampling-policy provenance gap. Owner correction r1 reads each preserved `build-result-r1.json`, verifies its content/source digests, derives cells and step from the recorded fields, and verifies tile width plus RTIN tolerance against the recorded builder/graph source AST. All four cases, including the 4D view context, pass. The final adapter consumes this checked policy rather than asserting constants. Replay r1 passes with exactly the same four representation keys as reviewed r0. The original reviewed adapter/results remain unchanged. This bounded provenance correction was CPU-verified by the owner; no additional peer review or full-suite rerun was needed because product source did not change.

## Evidence and reproducible commands

- [Frozen PC1 card](PC1-CARD-2026-10-29.md), [boundary design](../../superpowers/specs/2026-10-29-atlas-preparation-boundary.md), [roadmap](../../superpowers/plans/2026-10-29-atlas-browser-world-move-forward.md).
- Product source in the worktree: `src/space/preparation/contract.js`, `lifecycle.js`; tests: `tests/unit/preparation.test.js`, registered in the unit manifest.
- Scratch producer/replay: `/mnt/ml_storage/scratch/atlas-preparation-pc1/native-replay-adapter-r1.mjs`, `replay-r1.mjs`, `replay-result-r1.json`.
- Policy evidence: `check_policy_r1.py`, `policy-provenance-r1.json`; canonical-byte evidence: `canonical-vectors-r1.json`, `check_canonical_r1.py`, `canonical-check-r1.json`.
- Complete guarded TAP: `/mnt/ml_storage/scratch/atlas-preparation-pc1/units-r1.log`; peer prompts/replies and both evidence manifests are preserved alongside it. Canonical peer log is archived in `docs/codesign/project1-log.md`.

From the implementation worktree, `node scripts/run-unit.mjs tests/unit/preparation.test.js` runs focused guarded units and `node scripts/run-unit.mjs` runs the complete CPU suite. The sandbox in this session suppressed child TAP; actual passing evidence came from approved execution of the same guarded runner outside it. `node /mnt/ml_storage/scratch/atlas-preparation-pc1/replay-r1.mjs` replays immutable native files without starting a GPU worker. The scratch control intentionally requires these producer-side files; browser request records contain neither their paths nor BW1 indices.

## Next owned action

Use this boundary for WC2's bounded three-dimensional preparation experiment. Its card must include live producer wiring, three-axis body/overlap coverage, prediction, throughput/priority and the existing fine formation as a control. Keep existing coverage until safe handoff and publish the complete experience/performance/resource scorecard. BI1 remains the subsequent application integration design/task plan and product acceptance stage.
