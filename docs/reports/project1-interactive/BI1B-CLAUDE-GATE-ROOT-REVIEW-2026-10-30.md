# BI1.B gate-root follow-up (gate-root-review-r0)

**Verdict:** I approve the narrow follow-up. There is no material reason to stop BI1.B. The failure is a pre-hardware configuration mismatch, and nothing in the record points to a product, mathematical or behavioural problem.

## The failed record and source agree with your diagnosis
- **Gate run** (commit 9ab8ee6, 18:06:22–18:13:28):
  - `unit`, `build`, `reference` (P1, P2 and P3 regenerations), `performance-entry` and `acceptance-audit` passed.
  - `preparation-session-http` failed with exit 1: `assert.ok(root.startsWith('/mnt/ml_storage/scratch/atlas-pc4/'))` at `pc4-http.mjs:9`, with empty stdout.
  - No browser or GPU entry has a result, so the gate stopped at its first failure. `cleanup` passed.
- **Where it failed:** on line 9 the assertion runs before `fs.mkdir(root)`, before any fixture file is written, and before any server or fake adapter is created. So nothing executed beyond the root guard.
- **Closure record:** no processes alive, ports 5190/5196/5198/5199/5200 closed, lock free.
- **No pass claim:** this is a failed gate. The standalone 9/9 file and history evidence remains valid for 9ab8ee6, but it does not replace the gate.

## Conditions for the follow-up
1. **Wording correction:** `pc4-http.mjs` has a single prefix check, not an existing allowed-prefix list.
   - Change it to an explicit two-entry list with trailing slashes: `/mnt/ml_storage/scratch/atlas-pc4/` and `/mnt/ml_storage/scratch/atlas-bi1b/`.
   - The trailing slashes stop look-alike names such as `atlas-bi1bx`. `path.resolve` already normalises `..` before the check.
   - Leave the default root, port 5199, the fake adapter and all eight checks unchanged.
2. **Native-free rehearsal**, run against a fresh `atlas-bi1b` root, must show:
   - all eight check names present;
   - `pass:true` and `cleanup:true`;
   - `factoryCalls` equal to 2, with no `startupPid`.
   It must also show that a root outside the approved prefixes is rejected before `mkdir`, meaning no directory is created.
3. **One complete gate** on the new pinned head with all 25 entries, including `space-prepared-files`, so the file workflow is re-established on that head.
   - Record the application source digests to show only the test script changed.
   - No repair and no rerun. If any entry fails, or the 40-minute bound is exceeded, stop and report partial results.
   - Record this as a separate verification card and stop condition. That matches PC4's precedent and keeps the original allowance honestly spent rather than waived.

## Correction to my earlier phrasing (accepted)
"Full restart / new native activation" per history step should read: a new client session, runtime, GPU and collision activation. The native helper is not restarted: `application-server.initialize` is memoised, and the reopen phase's helper PID matches its startup PID (1660012). Only the save → reopen step restarts the helper and browser.

The restore-latency row (about 1.875–3.946 s for the seven presented restores) is not one I re-derived beyond request 1 (about 3.95 s). Report it together with the sparse `4b2f` specimen and the drag-reset roll limit, as you plan.

## Scope
**Read:** `failed-gate.json`, `closure.json`, `scripts/experiments/pc4-http.mjs`, all in full. I also relied on the earlier evidence-review packet I had already read: `summary.json`, the source files and the ledger excerpts.

**Not read:** the gate runner, the sibling suites' root guards, and any new rehearsal (none exists yet).

I executed nothing and edited nothing.
