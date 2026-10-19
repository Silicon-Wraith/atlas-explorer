# Project 0 execution decisions

These decisions were made during execution of
`docs/superpowers/plans/2026-10-18-project0-space-qualification-plan.md` (rev 6). Each one
changes or supplements the plan text. The full ledger, with the cost if wrong, is reported to
the user at handoff. Every exchange with Codex is in `docs/codesign/plan-log.md`.

## E1 — T5 probe collection rerun (joint: Claude + Codex, Codex run 20261019T170554Z-7a37)

The first probe run (`artifacts/project0/20261019T170209070Z-probe`) produced two incomplete
records. The cause was a harness defect: the plan's `chrome://gpu` capture read
`body.innerText`, which misses Chrome 151's `<info-view>` shadow roots, and Chrome 151 reports
the driver on a `GPU0 … *ACTIVE*` line rather than in separate rows.

Exception: **after the reviewed capture repair, the probe is rerun exactly once**, under these
conditions:
- the attempt-1 flags, fixtures, workload and browser are unchanged;
- the first run's evidence is preserved;
- the rerun does not consume the per-backend remediation of spec §6, because it repairs only the
  collection of diagnostics for a probe that is excluded from qualification evidence
  (`gate: 'probe'`).

The headless `requestAdapter() → null` result is not addressed by this rerun. It stays open for
T10's single remediation decision.
