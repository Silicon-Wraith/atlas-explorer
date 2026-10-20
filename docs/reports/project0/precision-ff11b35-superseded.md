# T12 precision run at ff11b35: superseded

**Status:** superseded. This is user-directed evidence collected while Codex's review was still pending. It is **not the accepted T12 result.**

**What the run was.** The user directed a run of `node spikes/project0/precision.mjs` at implementation ff11b35, before Codex reviewed that revision. Codex's review (run 20261020T175344Z-8ea2) then required fix round 2 (ab6c5e9), which Codex approved (run 20261020T181323Z-b0b2). The accepted T12 result is the rerun at ab6c5e9.

**Files.**
- **Summary:** [precision-ff11b35-superseded.json](precision-ff11b35-superseded.json) is the summary as the ff11b35 readers wrote it, copied unchanged.
- **Evidence directory:** `artifacts/project0/20261020T175447161Z-precision-precision-headed/` holds the record, raw, launch, chrome-gpu and supervision files. They are kept unchanged, and no raw is retrofitted.

**Why the fixed readers refuse it.** The ab6c5e9 readers refuse this raw: `capture storage bytes must be a nonnegative integer`. The ff11b35 driver had three gaps:
- it did not record `captureStorageBytes` or `captureStagingBytes`;
- its compensated peak excludes the 8,192 B persistent capture storage;
- its `captureBytes` (16,384) mixes the storage with the readback staging.

**The byte figures in the summary are wrong.** It reports `extraBytes` −65,888, or −66,272 at d=1e-4. Those figures omit the capture storage.

**Derived byte figures (DERIVED, not evidence).** The capture storage was live for the whole compensated lifetime: at ff11b35 it was allocated before run 0 and destroyed after the peaks were read. Attributing it to the compensated peak, with staging taken as `captureBytes − 8192`, gives:
- **compensated peak:** 204,848;
- **extraBytes:** −57,696, or −58,080 at d=1e-4;
- **staging:** 8,192.

The derivation is recorded in `.superpowers/sdd/2026-10-18-project0-space-qualification-plan/task-T12-report.md` ("Fix round 2", re-assessment).

**Other checks.** On that derived copy, every other check of the fixed readers passed, and every non-byte figure is unchanged.
