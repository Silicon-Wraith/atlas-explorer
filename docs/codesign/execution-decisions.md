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

## E2 — G5 off-plane failure under FMA contraction (joint: Claude + Codex, Codex run 20261019T175943Z-a363)

The headed development check of G5 at ce798d2 (`artifacts/project0/20261019T175713064Z-dev-g5-headed`)
reports an off-plane componentRatio of **2.75**, against a limit of 1. The plane set passes at 0.274.

Two independent reproductions agree on the cause. With multiply-adds fused at the contraction sites
(`fma(x, x, -y²)`, `fma(2x, y|z|w, C)`), an f32 model matches the GPU on 32 of 32 components;
Codex's model used exact BigInt FMA. Unfused f32 matches only 11 of 32, with a maximum ratio of 0.650.
The error comes from cancellation in iterate 7's x component (ratio 2.47), carried into iterate 8's y
component (ratio 2.75). The double-precision reference matches the frozen reference exactly.

**Classification: a true G5 failure of the current implementation on this backend.**
- WGSL permits fusion and has no portable way to prevent it in compute shaders. Splitting the
  expression into temporaries is not a legitimate fix.
- The approved spec does not say that G5 measures only unfused arithmetic, so the tolerance,
  reference, orbit and exclusions remain binding and are not edited.
- The WGSL stays unchanged for the rerun, and no search over expression variants is made. The
  failure goes to T10's decision procedure.
- Diagnosis consumes no remediation. Any shader, compiler or launch workaround aimed at this
  failure would be the backend's single remediation under spec §6, even under the `dev` label.
- G3, G4 and the G5 plane set remain valid comparisons, because each is within its threshold.
- Relaxing the tolerance, changing the reference or orbit, adding an exclusion, or excusing
  contraction would be a user decision. Neither author recommends any of them.

## E3 — Accidental RED-test browser runs during T9 fix round 3 (Codex run 20261019T211158Z-ed18)

While stubbed failing tests were being run, the old `integrity-preflight.mjs` ignored its injected
fakes. It started the real harness server and a real headed Chrome. The page never touches
`navigator.gpu`, so no GPU adapter or device was requested, and no process or port was left behind.

The runs left two records, `artifacts/project0/20261019T2103*-dev-integrity-preflight-headed`.

**Disposition:** these were accidental RED-test browser runs, and the records are failed
development diagnostics. They are excluded from the passing-preflight evidence and from T10's
qualification inputs, and are kept unchanged. No fixture reset or remediation follows from them.

## E4 — T9 development campaign dispositions (joint: Claude + Codex, Codex run 20261019T220140Z-2319)

1. **Timing invocation `20261019T214231975Z`.** G7/0 request 141 was issued 7.90 ms late, against
   the 4 ms limit. Earlier callbacks ran a steady ~3.3–3.5 ms late, so timer scheduling (the
   early-callback rearm path) is the diagnostic target. The cause is recorded as **unknown**.
   - The run is accepted as incomplete development evidence. There is no ad hoc rerun: any rerun
     goes through T10's remediation rules.
   - The limit is not relaxed, and the late request is not reclassified as external interference.
   - G7/1, G7/2 and G9 remain outstanding.
2. **G6 records.** The nine G6 records keep the invocation-level invalidation, as `finalise`
   propagates it by design. They are described as "completed observations carrying a later
   invocation failure", and they are not qualifying evidence in any case.
3. **G12 `bindGroups`.** The count is cumulative bind-group creations (alloc.js increments it on
   creation and never decrements it), so its growth is not a leak. The only claim made is that the
   tracked bytes, textures and buffers returned to baseline.
4. **G1.** Headed remains inconclusive (E-T9 ruling). The headless run is a `requestDevice` failure
   ("A valid external Instance reference no longer exists"), recorded as "no usable device/probe"
   with the exact error. Both limitations carry into T10.
5. **G2 `preparationVisible`.** The sensor is defective: it uses `offsetParent` on the
   fixed-position `#status` element. It must be repaired and reviewed before the qualifying GPU
   campaign. The existing G2 development evidence is kept unchanged.

## E5 — User decisions on platform and remediation (user, 2026-10-19)

1. **Browser requirement.** "Runs in the browser is a firm requirement until it can't be." It stays
   the requirement until keeping it would compromise the design or lose features. At that point it
   is escalated to the user again. Native or workstation rendering is not pursued while the browser
   path remains viable.
2. **Approved WebGPU remediation plan:**
   - **G5-A:** compensated evaluation of the cancellation-prone quaternion sums of products. The form
     is chosen by error analysis that is preregistered before any GPU result for it exists, and it is
     validated independently.
   - **G1-A:** headed G1 identity is corroborated through a Dawn/Vulkan diagnostic bound to the same
     browser process and run.
   - **G1-C:** the headless `requestDevice` failure is diagnosed, capped at half a day.

   Together these form WebGPU's single documented remediation cycle (spec §6), run through T10
   Step 7 after the `webgpu-1` campaign. Diagnosis consumes no remediation.

Source: Codex open consult, run 20261019T230539Z-9cfe (`codex-T10-consult-r1-findings.md`).
