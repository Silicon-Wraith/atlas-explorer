# Project 0 carry-forward list

**Purpose:** a tracked archive of what Project 0 hands to Project 1: the known limitations, the deferred minor defects, the test-hygiene notes and the process notes. The sources are the final whole-branch review (Fable, 2026-10-20, verdict READY TO MERGE) and the execution ledger, which is git-ignored (`.superpowers/sdd/`) and is not carried by the merge.

**Companion to:** [2026-10-20-project0-qualification-narrative.md](2026-10-20-project0-qualification-narrative.md), [platform-decision.md](platform-decision.md) and [2026-10-20-project0-qualification.md](2026-10-20-project0-qualification.md).

## 1. Known limitations

All of these are disclosed in the report, the narrative or the platform decision.

- **Timing (G6, G7, G9) is not qualified; the cause is unknown.**
  - The leading diagnostic target is the harness timer defect at `spikes/project0/browser/drivers/timing.js:57`: `setTimeout(fire, target - t)` passes a fractional rearm delay. Browsers truncate it, so a remainder below 1 ms becomes 0, and repeated early callbacks hit the 4 ms nested-timer clamp.
  - **Required in Project 1's performance harness:** round positive waits up; keep absolute targets rather than accumulating relative delays; record rearm counts and long-task entries, including on failure.
  - No WebGPU rendering limitation is demonstrated, and none is excluded either.
- **Headless WebGPU (E7, G1-C).** Chrome 151's GPU process crashes with SIGSEGV at headless startup on this host. Qualification is headed only. Do not plan headless rendering or CI rendering on this host.
- **G5 passes only as amended (E8, E9).**
  - Operational orbits qualify through first escape or 128 updates. Escaping coverage is escape indices 0–11 plus bounded orbits; indices 12–128 are not validated.
  - No validated long-escape (S3) band exists at f32 input precision.
  - The 2.7498 (webgpu-1) and 4.7449 (G5-A) failures stand under their original contracts. Post-escape continuation is not validated.
- **G5-A compensated arithmetic was defeated by compiler reassociation** (the TwoSum residual was eliminated). Compensated binary32 on that path is unavailable without a validated barrier technique. The instrumented T12 tracer, which used a runtime uniform barrier and capture writes, preserved residuals at the validated sampled sites. Their individual effects were not isolated ([precision-interpretation.md](precision-interpretation.md)). This is not a portable WGSL guarantee and does not validate Plane's bitwise splitting.
- **Precision (T12).**
  - The observed disagreement threshold is 10⁻⁵ for this anchor, profile and implementation (10⁻⁴ is the last value within). It is local, not a universal f32 floor.
  - A.11 compensation does not extend the range, at about 4× the work at 10⁻⁵ and 10⁻⁶.
  - Field-evaluation precision is the leading remaining bottleneck, without a quantified attribution.
  - Do not enable A.11 generally, and do not clamp the camera at 10⁻⁵. Deep zoom is Project 1c (perturbation against a high-precision reference orbit).
- **Launch flags.**
  - Both passing qualification G1 launches used `--enable-webgpu-developer-features`, which Chrome documents as exposing the selected adapter's extended `adapterInfo` fields. The headed G1 launch in webgpu-1 omitted it and was invalid/inconclusive with an empty adapter device. Implementation changes between campaigns prevent isolating the flag's effect. An earlier development G1 run (`9caa8c9`, not qualification evidence) also omitted it, with the same invalidation. The flag also disables timestamp quantization.
  - All 124 saved launch command lines carry the launcher's default `--enable-unsafe-swiftshader`. Dependence on it was not tested.
  - Neither flag is claimed as a product runtime requirement; operation without them was not established by these campaigns. Project 1 must not inherit either one silently. `--enable-unsafe-webgpu` was never used.
- **Provenance is bound to commit ids.** The tools resolve `bd978e6`, `448d5ff`, `f754534`, `4465b3c`, `ff11b35`, `31fde5f` and `5638678` in Git. Merge with a merge commit (or fast-forward); never squash or rebase this history.
- **Regeneration needs the local evidence.** The git-ignored `artifacts/project0/` (about 12 MB, local to this host) plus the Git history are both required: the repository holds hashes, not bytes. Without that evidence, 19 tests skip with a stated reason (497 of 516 run); the shared guard (`spikes/project0/tests/evidence-guard.mjs`) rejects a partially present set of webgpu-1/webgpu-remediation run directories, and `report.test.mjs` and `precision-t12.test.mjs` use their own guards on the accepted precision run.

## 2. Deferred minor defects (not fixed in code)

- **`verifyPrecision` skips the sandbox and unsafe-flag checks on the T12 launch.**
  - Where: `spikes/project0/report.mjs:186-189`. It verifies only `launchHash` and `requestedArgs`, whereas `qualify.mjs:344` applies `assertSandboxed` and `qualify.mjs:406` (`unsafeFromLaunches`) covers every qualifying launch.
  - Effect: a precision record whose saved command line carried `--no-sandbox` or `--enable-unsafe-webgpu` would be recomputed and reported without refusal, as long as its identity hash matched. T12 is non-gating, and no recorded result is affected.
  - Recommended fix: in that branch, call `assertSandboxed(launch.commandLine)` (from `launch.mjs`) and throw if `unsafeFromLaunches([launch])` is true.
- **Hard-coded `CHROME_TMPDIR`.**
  - Where: `spikes/project0/launch.mjs:15`, `CHROME_TMPDIR = '/mnt/ml_storage/scratch/atlas-p0-tmp'`. T0 ruling: Chrome's SingletonSocket path exceeds the 107-byte `sun_path` limit under `artifacts/runtime`.
  - Effect: host-specific. The spike is disposable, so this does not block the merge.
  - Recommended fix: Project 1's harness takes it from an environment variable, with a short default.
- **Timer rearm defect** at `spikes/project0/browser/drivers/timing.js:57` (see §1). Not fixed in the spike, because the evidence was collected with it. The fix belongs in Project 1's harness.
- **GPU-record parser truncates a comma-containing driver vendor** (T5). Harmless on this NVIDIA host.
- **The headless no-adapter record carries its reason only in `raw.json`** (T5); its `invalidations` array is empty. The record still cannot pass: it is incomplete, with `probeOk` 0.

## 3. Tests

- **Flaky: `spikes/project0/tests/t9-r3.test.mjs`.** "G12 budgets the checkpoint exchange inside the cycle" and its sibling "Codex reproduction: an exchange that overruns the boundary…" use real `sleep` and `performance.now()` (lines 75–103) and are load-sensitive. They failed 1 in 4 times under load during T13, and passed 4 of 4 in the final review. If one fails in a loaded suite, rerun `t9-r3` alone. If Project 1 inherits the pattern, inject a fake clock, as was done for `t9-r5` in T13.
- **Evidence-dependent tests are guarded.** The final review named two unguarded tests (`qualification-e7.test.mjs`, `g5d-qualification.test.mjs`). A clean-clone run found 13, with the same cause in two shared loaders (the webgpu-1 baseline and the E7 known-limitation record). All 13, in `qualification-e7.test.mjs`, `g5d-qualification.test.mjs` and `remediation-features.test.mjs`, use the shared guard `spikes/project0/tests/evidence-guard.mjs`. When all 13 webgpu-1 and webgpu-remediation run directories are present, the tests run. When none is present, they skip with a stated reason, as `report.test.mjs` and `precision-t12.test.mjs` already did. When only some are present, loading throws "Partial Project 0 evidence" with the missing directories named (Codex pre-PR review run 20261020T214152Z-80df).

## 4. Process notes and errata

- **Plan-text counting erratum (T4).** Step 9's expected "27 tests" omitted T0's `launch.test.mjs`. 37/37 was accepted.
- **Verbatim-logging deviation (T6).** One Codex run launched with a mangled prompt was killed, and its entry was removed from `plan-log.md` before the relaunch.
- **`CHROME_TMPDIR` ruling (T0).** See §2. It was accepted by Codex in T0 r1.
- **Ledger and Codex reports.** The execution ledger (`.superpowers/sdd/2026-10-18-project0-space-qualification-plan/progress.md`) and the Codex `codex-*-findings.md` / task reports it references are untracked. This file archives their carry-forward content.
- **Platform-decision hash.** The pre-PR cleanup edited `platform-decision.md`, so the regenerated results JSON records its new hash (`6317e837…`). `precision.json` and `precision-ff11b35-superseded.json` still record the earlier hash (`08002bd4…`). That is a historical binding, not drift. The precision summaries retain the platform-decision snapshot hash from their own implementation commits, independently confirmed in Git. The current verifier checks decision and manifest bindings but does not authenticate this historical platform hash: `verifyPrecision()` (`spikes/project0/report.mjs`) accepts an arbitrary platform path and hash in the summary. A future verifier should compare the historical reference against the document at the run's implementation commit. Any further edit to `platform-decision.md` requires regenerating the current results hashes again.
- **Repository size.** The merge adds about 41 MB of permanent history (`spikes/project0/fixtures.json` alone is 37.2 MB, as specification §3/§11 mandates). LFS is not an option retroactively, because the provenance checks read bytes with `git show`.
