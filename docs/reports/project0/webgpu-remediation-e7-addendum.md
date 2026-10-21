# Project 0 — WebGPU remediation preregistration: E7 addendum (headed-only qualification)

**Authority:** execution decision E7, user-approved and recorded at `e3ee2c0` (`docs/codesign/execution-decisions.md`). The mechanism was designed by Codex (run 20261020T042650Z-8f9e) and implemented as written.
**Amends:** `docs/reports/project0/webgpu-remediation-prereg.md`, revision 2 (sha256 `5ceb90f2713df52bea1e104bf3543886f57af9f51ebd496cc993ac9c7dedc39a`). Revision 2 is not rewritten; this record supersedes only the passages listed below.
**Machine-readable amendment:** `spikes/project0/qualification/e7-headed-v1.json`.
- Profile `project0-e7-headed-v1`.
- sha256 `99ea9a3030fd31f68a3cb39cc97b10227fd28afdfc38e55a82119618991d8c51`.
- Pinned in the registry of `spikes/project0/qualification.mjs`.

## Effective qualification contract

The contract is the **unchanged base specification**, plus **E7's amendment** identified by the hash above:
- base specification sha256 `64d82abf00e50c97c72347d7f4fa2d7b9dfd86240e73441b099a31afc8b1c645`;
- fixtures sha256 `ab15af0e527e60168b9cffc6328dadfd0846430da416ba06334fe041907ba0d1`.

The following files are unchanged:
- the 24 frozen sources;
- `fixtures.json` and its provenance;
- `gates.js` and `decision.js`;
- the governing specification.

The recorded `specHash` is not overwritten. Nothing here implies that headed-only evidence satisfies the original two-mode requirement.

**Qualification scope: headed execution only, under E7.**

## Superseded passages of revision 2

E7 supersedes, and only these:
1. **§1 and §3.2.** The two-mode G1 requirement in §1 ("G1 remains mandatory in both headed and headless modes"), and the application of §3.2's procedure to headless G1. G1 is required in headed mode only. Headed G1 identity remains subject to G1-A (§3.1–§3.5) in full.
2. **§4.4.** The statement that "Evidence not collectable" does not make headless G1 optional.
3. **§5.3.** The headless G1 invocation that §5.3 requires ("both G1 modes"). Every other mandatory invocation is still requested, with no reuse.
4. **§5.4.** Escalation under §5.4 **solely because headless evidence is unavailable**. Every other closure and escalation condition stands.

## Unchanged

- **G5-A:** the candidate, the five models and their hashes, the supplementary validation, the frozen tolerances, the closure of the candidate on failure, and the single-cycle restriction.
- **G1-A:** the developer flag, the matching rule and its dispositions.
- **Stops and protections:** the live stops, the supervision, the sandbox and watchdog protections, and the evidence-integrity rules.

## G1-C

G1-C is complete; see `docs/reports/project0/webgpu-g1c-diagnosis.md`.
- **Finding:** in headless mode, the GPU process crashes with SIGSEGV at startup. The first crash precedes any WebGPU request.
- **Classification:** a browser/GPU-process failure.
- **Correction:** none admissible.

The failure is retained as a **known limitation** on the recorded host. The excluded trial and the limitation are recorded as follows:

- **`excludedTrials["G1/headless"]`**: `{disposition: "not-required", authority: "E7", collection: "not-scheduled-in-this-campaign"}`.
  - It is an administrative field: never a gate verdict, never `notRun`, never `pass`, and never a synthetic record.
- **`knownLimitations`**: the entry `g1-headless-gpu-process-crash`. It is bound by hash to three pieces of evidence:
  - the diagnosis record;
  - the original `docs/reports/project0/webgpu-1-manifest.json`;
  - that campaign's headless record `G1-headless-20261019T235719304Z-webgpu-1-g1-headless`, verified through the existing evidence reader.
  - E7 does not excuse a corrupted reference.
- **No further headless run** is scheduled for this remediation.

## Campaign

```bash
node spikes/project0/campaign.mjs --name webgpu-remediation --args remediation --qualification project0-e7-headed-v1 --reuse '[]'
```

`webgpu-remediation` requires this profile. The profile is authenticated, and its limitation evidence verified, before the baseline, the preflight or any browser launch. The schedule is the original one with only `['G1', 'headless']` removed. Historical `webgpu-1` keeps the original rules; E7 is not applied retroactively.

The run follows Codex's review of this implementation and a fresh integrity preflight at the final implementation identity.
