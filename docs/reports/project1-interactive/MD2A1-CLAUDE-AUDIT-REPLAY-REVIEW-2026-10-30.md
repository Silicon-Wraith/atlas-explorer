# MD2.A1 r2 replay review (audit-replay-review-r0, head 3d95d79)

**Verdict:** the r2 correction and the replay of the unchanged data support running one fresh 28-entry headed gate on 3d95d79 with the current certificate. I found no blocker. This closes only the missing flight-trace validation. The r1 gate stays failed at 27/28, and nothing from it carries into the new gate.

## Checked
- **Corrected code:** `pc2-audit.py` line 13 is now the comment alone, and line 14 is `from check_collision_r0 import distances`. Its hash `279b285f…` matches both `source-manifest.json` and the replay summary's `correctedAuditSha256`. The original hash `d4fbf67b…` is recorded separately.
- **What changed from 659:** three files that are not documentation: `pc2-audit.py`, `tests/space-prepared.mjs` (`c29e55b0…`) and `check-import.py` (`66ca95d2…`).
- **Prevention** (`static-corrected-r0.json`): the import binding check passes, and the negative control with a swallowed import is rejected. The earlier ownership checks still pass: exact allowed edits, ambient read removed, scratch reads rejected and checkout writes rejected. None of these import GPU modules.
- **Unchanged native sources:** all 36 verified digests in the summary equal the earlier MD2.A1 manifest values. Examples:
  - `h1lib` `c1925c…`, `sampling_r0` `e328…`, `descendant_world` `8ede…`;
  - `generation_paths` `f6d7…`, `native-worker` `14f71dd…`;
  - all 13 inputs and both external package `.so` files.
- **Replay inputs:** `browser.json` (`49ebc8b1…`) and `qualification-input.json` (`e62d6986…`) are exact copies from `application-gate-r0`.
  - Also hashed: 24 binary payloads and 16 geometry-stem files.
  - The post-audit flags `pass:true, failure:''` are preserved and labelled as the old reporting defect, not as evidence.
- **Replay result:** pass with no error in 1.783 s, covering 11 entries, 30 contacts, 857 checked frames and 53 stationary waiting frames, with a maximum step of 0.000531 m.
  - **Entries:** all have 27 air samples. Recorded clearances are 0.7 (the `near()` search cap), null for empty-air regions, and one value of 0.529, all at or above the 0.5 body radius.
  - **Contacts:** all are fine-scale. The minimum prefix is at least 0.5000002, stop clearance about 0.50100, the mathematical crossing 0.0003125 body units, and motion error 0.
- **Fixture consistency:** the fine reference fixture `reference/fine-control.npz` (`85f26916…`) is byte-identical to this run's `job-10/mesh-region10-r0.npz`. That is consistent with the earlier exact same-host fine buffer match.

## Notes for the report (not blockers)
1. **The 30 contacts are not 30 independent samples.** 28 have identical values, from repeated blocked frames pressing against the same fine wall, so there are about three distinct contact configurations. Report the count as recorded contacts, not as distinct coverage.
2. **The 0.7 clearances are the search cap.** They mean no triangle lies within the mask, not a measured 0.7 clearance. Existing semantics, unchanged.
3. **Process miss:** keep the original one-gate plan recorded as missed, and report the costs of r1 and r2 together.

## Conditions for the one fresh gate
1. **Pin and record.** Run exactly 3d95d79 with fresh `atlas-md2a/` trailing-slash roots and the explicit cold-cache and performance report directories. Record source and certificate digests, and confirm the certificate sources key is unchanged (`fnv1a64:13ad585ee91d5b57`).
2. **Full gate, no reuse.** All 28 entries must pass within 45 minutes, with no rerun or repair allowance. The `space-prepared` entry must run its own fresh qualification, buffer audit and flight audit; the replay does not substitute for them.
3. **Report every criterion separately:** FPS, navigation p99 and maximum, readiness, unverified 1 GiB attribution, physical cleanup, ports and lock. Standing misses may remain, with no new targets.
4. **Stop on failure.** Any failure stops acceptance and returns to review with partial findings.

## Scope
**Read in full:** `owner-report.md`, `source-manifest.json`, `audit-replay-summary-r0.json` and `static-corrected-r0.json`.

**Partial read:** `pc2-audit.py`, a grep of lines 13, 14 and 19.

**Not read:**
- `tests/space-prepared.mjs` and `check-import.py` in this packet (I compared only their hashes against the proposal I reviewed earlier);
- `audit-replay-closure-r0.json`;
- the R2 amendment and the review-copy docs.

No images were supplied. I executed nothing and edited nothing.
