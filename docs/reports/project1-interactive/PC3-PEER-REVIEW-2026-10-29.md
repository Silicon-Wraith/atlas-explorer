<!-- Verbatim Claude evidence review 20261030T033633Z-411dc5; no execution. -->

# PC3 / BI1.A1: decisive evidence review

**Verdict:** bounded closure of BI1.A1 is supported, and moving on to A2 is supported. I found no concrete blocker. One evidence description must be corrected, and three claims need clearer wording.

## What I read and executed
- **Owner report:** `PC3-APPLICATION-ENTRY-2026-10-29.md`.
- **Evidence:** `score.json` (full), `lifecycle-summary.json` (full), and the pass and state fields of `gate.json`.
- **Source:** the request, retire, select and re-entry parts of `src/space/preparation/runtime.js`.
- **Images:** both PNGs, `evidence/fine-inspection.png` and `evidence/application.png`.
- **Not read:** `workspace.js`, `mode-host.js`, the application server, client and policy files, `wasm-memory`, or the launcher, beyond the hashes recorded in the lifecycle summary.
- **I executed nothing.**

## Established or supported (checked against the evidence)
- **Route:**
  - 22.804 s, 867 frames;
  - 730 navigation decisions, broken down as 125 constant, 3 first-surface and 543 steady-surface;
  - 30 contacts, 1 fine entry, 1 growth;
  - revision agreement true; at most 8 interaction regions and 1 view; peak GPU 32.4 MB.
- **Pose observations:**
  - "up" changes local Y by +0.0244 m, about 0.92 D;
  - lateral and reverse change local Z by ∓0.0079 m;
  - the fine contact is at body diameter 0.00664 m, i.e. D/4;
  - return to the home region and body diameter D.

  Every observation carries the original world ID and definition key. The pose is the documented Y-up prepared convention.
- **Lifecycle accounting balances:**
  - client opened 8, closed 8;
  - producer prepared 18, retired 18;
  - 9 cancelled requests, matching 9 `AbortError` HTTP records;
  - deactivated, suspended and resources-released 8 each;
  - no page errors.
- **Pending-response control:** HTTP 200 fetched at …941182 and the client closed 33 ms later (…941215) while the browser lacked the token. All publications still retired, so the lost-token ownership claim holds.
- **First presentations:** 3.84 s initially, then 2.58–2.71 s.
- **Re-entry** requests the home region first, then fine if the pose is fine. It refuses with "Requested pose lacks prepared body clearance" unless the selected region is clear and, for fine, the home region is resident. It then selects the region and requests the view (`runtime.js:83-87`). That is the correct ordering: clearance before publication, and no silent reset.
- **Qualification:** 9 unique representations:
  - home, fine, view and two coarse surfaces, all within tolerance;
  - the fine region at most 6.9 µm against 66.4 µm;
  - 4 empty-air regions with 1,024 samples each.

  The buffer audit covers all 9 with 3 roles each. View work caused 0 interaction-cache evictions. Output was 22 records and 100.9 MB.
- **Gate:** pinned to commit `bb1d528…`, every recorded state "passed", including the P1–P3 numerical regeneration.
- **Scorecard:**
  - frame rate 49.94 / 49.88 FPS for active Landscape: **pass**;
  - navigation p99 4.2 ms: **miss**; maximum 4.8 ms: **pass**;
  - readiness median 1.10 s, maximum 2.45 s: **miss**; wait fraction 6.8%;
  - memory attribution: **unverified**.

  These match the report.

## Images
- **`fine-inspection.png`: supports the claim.** It shows the actual ATLAS shell (Plane/Space switcher, the Fractal viewer/Landscape mode selector with Landscape active, the scale controls panel, and the status line "Landscape · scale 0.25"). The fine relief patch is rendered: faceted relief, the dark diagonal band, rough parent terrain at the upper right. This is prepared fine geometry inside the real application, consistent with PR9 and PC2.
- **`application.png`: does not support a rendered-context claim.** It shows the same shell at "scale 1". The viewport is almost entirely the dark background, with one near-black silhouette at the lower right, which is consistent with unlit, ambient-only terrain seen from its shadowed side.
  - It shows that the application is running in Landscape mode after the controls. It does not visibly corroborate the re-entered geometry, or the view context that `runtime.js:86-87` requests.
  - **Correction:** caption it for what it shows (Landscape shell after the lifecycle controls, mostly empty sky with shadowed terrain), or rely on the pose and receipt records for the re-entry claim. Do not present the image as evidence of terrain after re-entry.

## Claim clarifications (not blockers)
1. **Render/collision agreement holds by construction.** `select()` logs `renderRevision: active.key` and `collisionRevision: active.key` from the same object (`runtime.js:73`). The guarantee is architectural, since a single active region feeds both, so the logged agreement is not independent evidence.
2. **First-surface timing:** 3 warmed samples only, as the owner says. Do not cite it as un-warmed behaviour.
3. **Performance comes from one 22.8 s route.** It is not a repeated workload and not a throughput improvement over PC2. The owner already says this.
4. **Gate bookkeeping:** say "clean commit at gate start; the maintained harness wrote tracked documentation during the run; those files were restored byte-for-byte, with hashes in `output-relocations`". Do not say the run never touched the worktree. The application source and gate outcomes are unaffected.
5. **Sparse-reference limit:** representation `4b2f1f5b` again shows `limits: []` despite having one forward sample. The report states the limit; record it in the qualification record itself when you next touch that tool.

## Unresolved (carried forward)
- the readiness and navigation-p99 targets;
- region-memory attribution;
- whether WASM capacity stays bounded over a long session (main 102.75 MiB, worker 76.6 MiB);
- abrupt client loss and the multi-tab policy (A2);
- saved scenes and history (BI1.B);
- device-loss parity (BI1.C);
- behaviour across all 455 addresses;
- browser-only preparation.

## Recommendation
Close BI1.A1 with the `application.png` caption corrected, and proceed to BI1.A2 as planned.
