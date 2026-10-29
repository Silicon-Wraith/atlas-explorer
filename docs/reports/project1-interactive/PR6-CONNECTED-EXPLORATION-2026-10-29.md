# PR6: connected streaming of retained qualified regions

**Free flight now crosses connected prepared regions and returns to the finer starting cove.** Three fixed two-minute replays averaged **46.80 FPS**, with **168 coverage handoffs**, **21 coarse contacts**, **20 fine contacts** and **0 withheld movement steps**. Actual keyboard travel and reversal were checked separately from the guided replay.

This advances the North Star by extending travel beyond one local cube while retaining body-safe contact and scale changes. The five coarse meshes are existing qualified artifacts: readiness includes loading, collision indexing, transfer and publication. This is **not generation of new terrain across the corridor**. The fine cove is the same PR5 specimen, rebuilt at runtime from cold field/RTIN caches at each measured-run start, with caches retained within the run.

## Try it

```bash
/mnt/ml_storage/scratch/atlas-connected-pr6/preview.sh
```

WASD flies; Q/E moves down/up; drag or arrows looks around. Follow the surface through the corridor, reverse and return. The wheel or **Enter finer detail / Grow back** changes body size at the starting cove. Elsewhere the preview explains that fine detail is available at the cove. At smaller scale, grow before travelling beyond the fine cube; retreat from contact before growing. **Guided replay** explicitly resets and demonstrates the measured route. Ordinary free flight does not reposition the visitor.

Close the window or Ctrl+C to stop. The launcher owns installed headed Chrome, the native worker, port 5260 and GPU lock, bounded to fifteen minutes.

## Geometry, preparation and handoff

The old body diameter D is 0.0265625 m. Coarse regions 0–4 have half extent D and centers at tangent offsets 0, 0.75, 1.5, 2.25 and 3 D. The one fine cove has ID10, body diameter D/2 and half extent D/2, with the PR5 frozen center. All artifacts share a single world anchor and level-local coordinate transform. First-screen checks assert stored origins against the expected frame and preserve source hashes. Coarse geometry retains PR3's finite fidelity/overlap qualification; it receives no new broad geometric certification here.

The predictor sees current position and velocity with a two-second horizon, plus current view for fine preparation near the cove. It cannot read future replay turns. At most two browser jobs are pending and three native jobs queued. Browser residency is capped at four regions; source/validation/topology array caches remain 96/32/64 MiB. Evicted geometry is prepared again; persistent evidence on disk is not treated as resident data. Field and topology caches persist within a run, so subsequent fine rebuilds may reuse source arrays. Still-resident revisits issue no preparation job.

Movement keeps the active region while the whole sphere sweep remains inside its prepared cube. Otherwise it selects a ready region of the **same body scale**, covering the start and endpoint and passing outside-solid/clearance checks. Missing prepared coverage withholds that step; outside the finite corridor it visibly refuses travel. The small body uses fine10 collision only. Growing goes to coarse0 after the old body fits; shrinking requires fine10 and its coarse parent0 resident and not retiring. Parent0 stays protected while fine10 is active. This dependency precondition prevents activation during parent retirement. All retiring regions become unavailable before awaiting the GPU drain.

Rendering uses the active coarse region or parent0 plus fine10 context masking. This is whole-region replacement, not joined watertight tiling or continuous distant horizon coverage. Shared active geometry/transforms are an architectural property, not independently established by duplicated active-index logs.

Runtime fine construction retains unknown/nonfinite/sign-order/native validity and the vertex bound. Dense experimental probe loops stay outside readiness. The first-screen runtime fine arrays match the PR5 qualified specimen exactly; every measured geometry output is compared with its qualified specimen afterward. The runtime scene remains native preparation plus browser rendering/navigation, rather than a browser-only generator.

## Full criteria scorecard

| Criterion | Frozen target | Result and limits |
|---|---|---|
| Average frame rate | ≥30 FPS overall and during preparation | 46.80 / 47.02 FPS. |
| Full navigation update | p99 ≤2 ms, max ≤8 ms including coverage/scale | Worst normal p99 0.90 ms; max 2.40 ms. |
| Ready before ordinary entry | No necessary-region movement waits | 0 withheld steps, 0.0 ms. Fine desired-to-shrink delay is separate below. |
| Coarse request to ready | Target ≤1 s | 69 retained-artifact readiness events: 69 meet target; range 0.096–0.406 s. Loading/indexing/publication, not generation. |
| Fine request to ready | Target ≤1 s | 24 events: 24 meet target; range 0.328–0.487 s. First acquisition per run has cold fine caches; later evicted rebuilds may hit source cache. |
| Desired fine activation | Report separately from coarse movement waits | Completed cove requests reach shrink in 9.5–21.8 ms after the route requests entry. Early prefetch readiness alone is not activation lateness. |
| First usable neighborhood | ≤5 s | 0.297 s browser preparation; 2.030 s process-start to ready. Retained coarse/reference artifacts; complete cold geometry startup untested. |
| Navigation independence | No mathematical field/mesh investigation in movement | Structural separation: resident Rapier geometry; predictor starts asynchronous jobs. No claim of a measured zero field counter inside movement. |
| Connected travel, reverse and contact | ≥4 coarse entries per run; endpoint and fine contact, growth after retreat | Coverage entries [56, 56, 56]; coarse/fine contacts 21/20. Region indices reached: [[0, 1, 2, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4]]. |
| Actual free input | ≥2 handoffs in each direction, then wheel scale/boundary check | Input check passed: 3 handoffs outbound and 3 on return (cumulative count 6); returned to region0, shrank, refused fine boundary and grew safely. Separate from guided runs. |
| Position/scale safety | No teleport, embedding or unintended crossing; clearance ≥0.501 body diameter | Incoming sampled clearances pass, minimum 0.747942; independent contact prefixes/stops pass. Source retains center through switches. Small body never uses coarse collision. Finite evidence, not universal sweep proof. |
| Contact discrepancy | ≤0.01 current-body diameter | Maximum independent discrepancy 0.00001741. Qualified specimens and observed route only. |
| Unsafe growth | Refuse at contact; grow after retreat | Independent coarse0 distance checks confirm refusal at fine contact and valid later growth. Source asserts unchanged body on refusal. |
| Geometry provenance | Retained hashes, runtime fine identity, all measured outputs match | 135 measured meshes compared; all match. Original PR3/PR5 fidelity limits remain. |
| Resident reuse | No new jobs/index build for still-resident revisits | Request violations 0. Evicted revisits are preparation; resets between runs are explicit. |
| Residency/cache bounds | ≤4 browser regions; declared bounded arrays | Peak browser residency 4. Field/topology cache accounting below. Native descriptor cache ≤4; retirement removes descriptors. |
| Memory | ≤1 GiB attributable region CPU+GPU including overlap/build | Unverified; expanded ledger remains incomplete for ownership and simultaneous peaks. |
| Deliberately late neighbor | Honest wait then recovery | 2.200 s withheld over 107 steps; 0 errors. Waiting is expected fallback and does not pass ordinary readiness. |
| Fast departure | Separate diagnostic at 2 D/s | 0.000 s withheld; 0 errors; navigation maximum **9.80 ms misses the 8 ms target**. Not substituted for ordinary-speed evidence. |
| Distinct finer feature | ≥3 px sampled displacement proxy plus named visual feature | Not established. Proxy maximum 1.67 px; shared contact witness remains. This does not block connected-coverage results. |
| Execution/scope | Fixed bounded hardware runs, cleanup, full reporting | Cleanup confirmed; final review/launcher/host checks appended. Walking/gravity, arbitrary fine placement, unlimited world, watertight LOD seams and browser-only generation remain open. |

## Fixed measurements

One stationary five-second warm-up precedes three 120-second ordinary runs at 0.5 D/s. Each starts coarse0 only, with native fine caches reset. The route traverses to tangent3D, contacts/retreats at coarse4 using the PR3 frozen segment, returns, shrinks at the cove, contacts fine10, refuses unsafe growth, retreats/grows and repeats. Separate twenty-second late and fast diagnostics are preserved. Stationary warm-up can prefetch the fine cove from the current view; caches are cleared before each measured run. No future route is supplied to prediction.

| Run | FPS | Preparation FPS | Update p99 / max | Coarse / fine contacts | Coverage handoffs | Retirements | Withheld |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 46.67 | 47.07 | 0.90 / 2.40 ms | 7 / 7 | 56 | 28 | 0.0 ms |
| 2 | 47.01 | 47.03 | 0.80 / 2.40 ms | 7 / 6 | 56 | 28 | 0.0 ms |
| 3 | 46.73 | 46.95 | 0.90 / 2.30 ms | 7 / 7 | 56 | 28 | 0.0 ms |

Normal-run RAF p95 was about 40 ms and the maximum 40.1 ms; no movement timestep was capped. These are diagnostics rather than additional acceptance gates.

RAF is a presentation proxy, not hardware presentation timestamps. Host field windows are not GPU kernel timestamps. Categories overlap; their durations must not be summed.

| Normal-run subset | Frames | Interval sum | FPS |
|---|---:|---:|---:|
| overall | 16849 | 360.015 s | 46.80 |
| preparation | 1008 | 21.440 s | 47.02 |
| coarse_preparation | 771 | 16.240 s | 47.47 |
| fine_preparation | 422 | 9.040 s | 46.68 |
| source | 30 | 0.600 s | 50.01 |
| initialization | 5 | 0.100 s | 49.95 |
| field | 33 | 0.660 s | 50.00 |

The inherited scalar warm-up field calls are categorized as initialization; dense validation probes do not run inside readiness. Coarse jobs perform no source evaluation. Fine jobs build the same known cove; they do not establish new-world-terrain streaming.

## Memory and geometry limits

Current native process peak RSS is 682.18 MiB, recorded independently of historical RSS in retained coarse metadata. Sampled owned process-tree peak RSS is 2398.57 MiB. Source arrays peak at 16,908,544 bytes, initialization arrays at 40, topology arrays at 8,928,056; source evictions 0. Maximum native GPU pool observed at job end is 0 bytes, after the builder frees its pool; fine mesh metadata records up to 2,127,872 bytes before that cleanup. Neither is a hard peak bound. Browser WASM capacities, transfer payload and live geometry/depth counts are preserved per run in `metrics-r0.json`.

Independent peaks are not simultaneous totals. RSS includes runtime allocations, process-tree samples may miss brief peaks and double-count shared pages, WASM capacities include reserve, and render counts omit driver/compositor allocations. These observations do not establish the complete 1 GiB region-data requirement.

The optional feature screen reuses fixed PR5 samples: 44 coarse-to-fine interior samples and 512 fine-to-coarse samples. Distances are converted from each target level's body units into old-body world units before the projection proxy. At the declared contact distance and focal scale, maxima are 1.24/1.67 px, below 3 px. No threshold, mesh or scale was tuned to obtain a passing visual feature. Numerical displacement alone would not prove a named visible feature even above threshold.

## Evidence and decision

Root: `/mnt/ml_storage/scratch/atlas-connected-pr6/`. Criteria: `card-r0.md`, `card-amendment-r1.md`. Screen: `retained-geometry-provenance-r0.json`, `frame-check-r0.json`, `coverage-check-r0.json`, `coarse-route-check-r0.json`, `runtime-r0/identity-r0.json`, `feature-screen-r0.json`. Browser: `smoke-r0.json`, `input-r0.json`, `full-r0.json`, individual runs, `server-full-r0.json`. Independent analysis: `metrics-r0.json`, `geometry-check-r0.json`. Measured source hashes are embedded in browser reports. Verbatim peer messages are archived in the codesign log.

Claude’s focused decisive review 20261029T150740Z-827503 supports the bounded claim and found no material safety/lifecycle bug in the checked coverage, activation, movement and retirement paths. It checked per-run performance/contact counts and both diagnostics. It did not independently check the numerical geometry results, actual-input artifact, fine identity/CPU controls, readiness ranges, memory ledger or pixel proxy. The owner verified those raw artifacts separately in `owner-verification-r0.json`; this explicitly limits the scope of peer review. Event reconciliation gives 168 coverage plus 39 scale activations, totaling 207 normal activations.

The first review attempt stalled 60 seconds on a status message before inspection. One bounded retry used a 120 second idle allowance and completed a focused review; both attempts are preserved. No measured source changed during review.

Next: an offline screen over a small frozen set of placements inside this qualified corridor, seeking a named feature that finer exploration visibly resolves. Keep the existing 3 px proxy, step and tolerances; build at most one qualifying candidate. If none meets it at factor two, record that finding before considering a separately specified factor-four scale change. This gives shrinking a visible payoff without adding walking or beginning a general optimization campaign. No product source, commit, push or merge is part of this scratch milestone.


Launcher check r0 timed out at Chrome’s 15 second startup cap; its failure and cleanup are preserved. The known Chrome PID was independently confirmed stopped, the listener closed and the GPU lock free before retry. Launcher r1 allows 30 seconds for Chrome startup and routes the controller’s temporary profile into scratch; measured launch flags and application logic are unchanged. Existing measured harness reports preserve their automatically generated `/tmp` profile paths, an inherited temporary-directory deviation; the repaired launcher uses scratch. This launcher repair does not rerun the performance experiment.


**Historical launcher failure during desktop disconnection (resolved below).** The r1 launcher also timed out at browser startup before application code ran. Both launch attempts preserve `cleanup:true`; independent host checks additionally found every recorded experiment/browser PID stopped, port 5260 closed and the GPU lock free. A basic `xdpyinfo` query to inherited display `:10.0` timed out after 5 seconds. The remote-desktop Xorg process and socket exist, but the display does not respond to that query. No further browser/GPU workload was launched after this finding. This is a final launcher/environment limitation alongside valid completed hardware measurements, not a passing manual-launch check. The advisor was asked for the current desktop state while documentation closure continued.

[Recorded replay image](PR6-connected-2026-10-29.png).


Process accounting: card review began 14:46 UTC; provenance, world-frame, route/coverage and fine-identity screens passed before the 14:54 UTC full run. Full hardware measurements 14:54:26–15:01:16; review, launcher failures and environment checks followed, within the three-hour cap. Card review improved parent-lifetime protection and early cove prediction. The focused result review confirmed critical safety paths and narrowed the claim. The final launcher remains an explicitly unresolved environment check; it does not erase completed measurements. All known owned PIDs, port and lock cleanup are independently confirmed.


**Launcher recovery verified.** The advisor confirmed the remote desktop had disconnected. After reconnection, display `:10.0` responded and one bounded hardware preview launch (`preview-1793291319725.json`) succeeded, with readiness and cleanup confirmed. `recovery-cleanup-check-r0.json` independently found all recorded preview process IDs stopped, port 5260 closed and the GPU lock free. The final launcher check is complete; no performance run or application logic was repeated or changed. Earlier failures remain preserved.
