The scoped enterable-parents feature is ready for a reviewed PR. The scorecard numbers reconcile with the raw summaries, the qualification and certificate chain is unbroken, and nothing in the evidence contradicts the frozen card. I found no material gaps. There are four small report wording points below, none of which needs another run. Nothing was run or edited.

## What I read
- **In full:** the evidence manifest, the final report, the final card, the source summary, the motion audit, the gate JSON, the final closure, the host and entry record, `selected-raw-events.json`, and all four PNG captures (opened as images).
- **Relied on from earlier rounds:** the qualification JSON (same hash as `2949f9…`), the certificate (same hash as `f1ba9ce…`), and the qualifier and adapter sources, which have the same hashes I reviewed then.
- **Not read:**
  - The raw `source-browser.json` (I didn't check that it matches its stated SHA).
  - The raw evidence manifest.
  - The preserved-source and legacy-performance JSON files.
  - The final-units JSON.
  - The changed `pose.js`, `source-worlds.mjs` and `browser-producer.js`.
  - The previous review reports.
- So the pose-arithmetic fix and its property test are taken from your account, not checked by me.

## The decisive chain holds
- **The totals reconcile.**
  - Rendered frames: 1841 + 1838 + 30 + 30 = 3739 over 76.269 s, which is 49.02 FPS.
  - Navigation calls: 1762 + 1765 + 28 + 28 = 3583; p99 is 0.300 ms and the maximum is 1.0 ms.
  - Readiness: 19 + 23 + 5 + 5 = 52 publications, all ready within 257.6 ms.
  - Contacts: 292 + 406 + 224 + 138 = 1060. Audit samples: 190 + 187 + 37 + 38 = 452.
  - Addresses checked: A 51,744 + 208 = 51,952 and B 113,680 + 528 = 114,208.
  - The closure lists 149 PIDs with none alive. Ports 5190/5196/5198/5199 are closed and the GPU lock is free. The gate shows 29/29 passed at the stated head, taking 33 m 41 s.
- **The raw events match what was required.**
  - **Exact positions across scale changes and reopening.** Each shrink happens at exactly the last coarse-contact position. After growing, the saved place reopens at exactly the same coordinates in a new helper (new producer `instanceId`):
    - A: 0.05818595212581588, 80.3556316035471, −0.1758536094969139.
    - B: −0.07766807…, 92.26955…, −0.11687…
  - **Revision keys stay separate.** Each entry's render and collision revision keys agree (that equality isn't independent evidence, as the report already says). Coarse and fine have distinct keys:
    - A: `5bcb…` (coarse) and `71b7…` (fine).
    - B: `0409…` (coarse) and `6186…` (fine).
  - **The boundary fixtures sit where intended.** A's fine fixture is at x = −0.7644701491775 (the envelope minimum plus 1e‑6) and y = bounds max − 0.25. It produces repeated `finite-domain` navigation waits, and the session stays active. B's fixture behaves the same way.
  - **Setup matches what was pinned.** Light and labels are as pinned. `fineBounds` are the global bounds. The axes are X, Z, Y. The producer reports no PID and no child process.
  - **The shared producer buffers add up.** `totalOutputBytes` = 1,004,616 = 2 × (101,400 + 98,304 + 202,752) + 199,704. That is one immutable copy per kind (coarse, fine, view).
- **B's negative source-clearance figure is what the geometry predicts.** In B's recorded contacts, the hit normal (−0.514, 0.377, −0.771) and the motion direction meet at cos θ ≈ 0.32. The 0.001 normalised skin then leaves only 8.1e‑6 m of gap along the normal for a fine body. Subtracting B's 1.03e‑5 m source error bound predicts a lower bound of about −2.2e‑6 m; the measured −1.274e‑6 m is better than that. This is the grazing case that motivated the r2 split. The 8‑ulp mesh stop rule passes, so this is an approximation finding, not penetration.
- **Memory is honestly reported as unverified.** Whole-process RSS isn't a regional measurement, and the report doesn't certify the 1 GiB target.

## The captures
- **A (coarse and fine):** an almost uniform grey surface filling the view, with faint facet diagonals at scale 0.25. That's consistent with a smooth parent seen from very close.
- **B (coarse and fine):** a grey terrain silhouette against a dark sky, with a central apex. The view looks diagonally toward +x+z, so the apex is consistent with the corner of the finite world, but a crest isn't ruled out.
- The scale label correctly reads 1 vs 0.25, and the saved-scene status appears.
- They support the limited claims (renders, scales, saves) and nothing more. I'm not adding any appearance criterion.

## Non-blocking report edits
1. **Hedge the B description.** "B shows the finite terrain edge" should read "a terrain silhouette consistent with the finite domain edge"; the image can't distinguish it from a crest.
2. **Note the shrink label.** The existing UI shows "Enter smaller detail", but in this profile shrinking reveals no new detail. Add one sentence to the limits, or record a later copy change. This isn't an acceptance item.
3. **Label the two GPU-byte figures.** The summary's per-phase `gpuBytes` is 589,984, while the host peak is 8,996,256. Say which accounting each one is.
4. **Close C10.** Record this review and replace the "pending" wording.

With those four edits, the scope is correctly claimed: two qualified parent worlds are enterable end to end, with no exact-surface guarantee, no new mathematical detail on shrink, and A2.2b and A3 still open.
