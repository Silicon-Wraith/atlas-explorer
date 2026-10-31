# MD2.A1 audit-repair review (audit-repair-review-r0)

**Verdict:** the diagnosis is correct and the proposed r2 correction is exact, minimal and proportionate. I see no masked geometry failure in the evidence. I do see one masked validation gap that the replay must close, and one prevention measure is worth adding. Approve r2 with the amendments below. There is no acceptance waiver: r1 stays a failed 27/28 gate.

## Diagnosis checked against source
- **The swallowed import.** Current `scripts/experiments/pc2-audit.py` line 13 reads `# Distance reference resolves from the owned native package.;from check_collision_r0 import distances`.
  - Because the line starts with `#`, the import is part of the comment, so `distances` is never defined.
  - `near()` (line 18) then raises a `NameError` on the first contact prefix, which matches the failed audit traceback.
  - The audit's `runs` list is empty and it took 0.167 s.
- **Fix:** `proposed-pc2-audit.py` lines 13–14 split the comment and the import. Nothing else differs in the portion I compared (lines 1–30).
- **The helper is unchanged:** `check_collision_r0.py` defines `distances` at line 10 and is byte-identical to the original (hash `436bc6e9…`, checked in the earlier review).
- **No similar case elsewhere:** a regex search for a comment followed by `;` and a statement across the packet's `scripts` tree finds only this one line.
- **Reporting bug** (`tests/space-prepared.mjs`, lines 109 and 111):
  - The old line 109 used `error.stderr ?? error.message`. The audit records its traceback in JSON and exits non-zero with empty stderr, so `failure` became `''`.
  - The suite then printed `pass:true` and the "no runtime errors" PASS (line 111). The gate's typed exit 1 still failed correctly (`failed-gate.json`, lines 181–185).
  - Proposed line 109 sets `detail.pass = false` and uses `stderr || stdout || stack || String(error)`, so the failure text is no longer empty and line 111 no longer passes. That is correct.
- **What actually passed** (inference from the code's order): lines 104–107 run qualification input, qualify, buffer audit and then flight audit in sequence, and each `exec` rejects on a non-zero exit. The first three therefore exited 0 before the flight audit failed. Their output files are not in this packet, so I am inferring this, not observing it.

## What was masked (material for the replay)
The flight audit crashed at its first contact, so in r1 **none** of these were evaluated:
- the contact checks;
- the recorded-frame motion checks;
- the revision checks.

The route's "actual flight" correctness on the migrated source is therefore unverified until the replay runs. That is why the unchanged-data replay is the right discriminating test.

**Amendments for the replay:**
1. **Prove it evaluated everything.** Require the replay output to report non-empty `runs` with the recorded entry, contact (30) and checked-frame counts, and assert that the contact count equals the number of contact events in the copied `browser.json`. "No error" alone is not enough.
2. **Same code for replay and gate.** Run the replay with the exact corrected `pc2-audit.py` bytes that will be committed for the fresh gate, and record that hash. Also record:
   - the hashes of the copied `browser.json` and `qualification-input.json`;
   - the hashes of the referenced geometry stems.
3. **The copied input is the post-audit file.** `browser.json` is written at line 100 and again at line 114, so the preserved copy is the second write, with `failure:''` and `pass:true` from the old code. The audit's line 25 assertion `not report.get('failure')` passes on it. State this, so the replay is not mistaken for a re-validation of the browser outcome.
4. **Prevention.** Experiment and audit scripts were edited outside the import-manifest edit ledger, and the pre-hardware preflight never exercised the contact path. Add one guarded static check, run without a GPU, over the relocated scripts:
   - an AST check that every global name used inside functions is bound at module level or is a builtin; or, minimally,
   - an assertion that `distances` is imported at module level and that no statement follows a `#` on the same line.

   This is a test-only addition, not a new acceptance criterion.
5. **On failure, stop.** If the replay finds any real clearance, crossing or identity failure, stop and return it for review. Do not run the browser again.

## Process and bounds
- The r2 bounds are acceptable: 30 minutes of CPU work, up to 1 hour of hardware including one replay of at most 120 s and one fresh 28-entry gate of at most 45 minutes, no repair allowance, and the original process miss recorded.
- The r1 gate (33.78 minutes, cleanup confirmed) stays failed and distinct. The fresh gate must not borrow passes from r1.
- No mathematical, buffer, certificate, target or criterion change follows from this fix.

## Scope
**Read in full:** `owner-position.md`, `r2-proposal.md`, `failed-flight-audit.json` and `failed-gate.json`.

**Partial reads:**
- current and proposed `pc2-audit.py`: lines 1–30
- `proposed-space-prepared.mjs`: lines 96–113, plus a grep of the current and proposed versions at lines 93–114
- `check_collision_r0.py`: grep
- the `scripts` tree: comment-swallow regex

**Not read:** the rest of either `pc2-audit.py`, `generation_paths.py` (read in the prior review), the cards and `source-manifest.json`, and the raw route, qualification and buffer outputs, which are not in this packet.

No images were supplied. I executed nothing and edited nothing.
