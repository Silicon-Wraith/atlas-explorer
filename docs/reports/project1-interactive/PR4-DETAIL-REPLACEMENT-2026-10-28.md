# PR4: safe replacement by finer geometry

**Bounded detail replacement completed.** Three fixed two-minute hardware-browser runs averaged **46.79 FPS**, with **171 fine contacts**, **339 activations** and **0 geometry waits**. This tests changing the approximation of one mathematical surface at a fixed body size and location. It does not yet demonstrate zooming into a world or joining different detail levels along a seam.

The North Star benefit is concrete: movement continues against the existing surface while a finer visible/contact revision prepares. A replacement activates only after whole-body containment, outside-solid and surface-clearance checks. Rendering and collision select the same revision synchronously. An unsafe revision leaves the current geometry and visitor position intact.

## Try it

```bash
/mnt/ml_storage/scratch/atlas-detail-pr4/preview.sh
```

Choose **Prepare finer terrain** or **Delayed preparation**. This is a scripted local motion/contact/retreat experience, bounded to fifteen minutes. The launcher owns hardware Chrome, the native worker, loopback port 5256 and the GPU lock. Close the window or Ctrl+C to stop.

## Frozen scope and construction

The region and body match PR3 region0: body diameter 0.0265625 m, same origin and half extent one body diameter. Coarse geometry has 35,671 real triangles; fine has 113,720. Source grids increase from 513² to 1025² per tile, with physical tile width unchanged, half the sample step and half the RTIN error budget. This is a replacement approximation of the same generator. It is not cumulative subdivision or a change of mathematical world. Both complete revisions coexist until safe activation.

The retained parent reference is unchanged. Fine field results start empty each run. Nine resolution-qualified source tiles are sampled; these are new samples of the same terrain, not nine newly explored world tiles. The native cache reserves 96 MiB source/32 MiB validation/64 MiB topology; source arrays exceed that bound and evictions are retained. Resolution belongs to source/topology identity and probe seeds. The fine graph emitted 1,919,693 vertices before composition. The implementation’s 2 million cap applies to unique chart vertices before floor/cap duplication, so that output count cannot establish closeness to the cap. The bound was unchanged and did not trigger.

The first screen tightened graph/source residual budgets to 0.0025/0.002 body diameters and final sampled fidelity to 0.005. It passed. Mesh-ready lower bound was 5.6515 s, excluding full startup/index/transfer. Fresh held-out reference maximum was 0.00046843 body diameters, versus PR3 coarse 0.00144706; mesh-to-field sufficient upper bound was 0.000024173 m. Samples cover the grandchild floor; other surfaces, topology completeness and all scales remain unqualified.

Independent 512-point comparisons in each direction found coarse/fine displacement maxima 0.001060/0.001149 body diameters. The arrays and triangle counts differ, but the change is visually subtle at fixed body size. The frozen nearest-fine-surface contact point coincides with the coarse nearest point; contact on the fine revision does not establish contact at a newly revealed geometric feature.

Independent checks cover 345 recorded contacts and 345 incoming activation positions across normal and delayed runs. Maximum contact discrepancy is 0.0000000486 body diameters; minimum sampled activation clearance is 0.74466 body diameters, above the 0.501 threshold. Each revision’s first contact per run has 31 prefix samples; later contacts have 3, plus the actual backed-off stop. This is sampled evidence, not a continuous-sweep proof.

The normal route oscillates within ±0.15 diameter while requesting fine at elapsed 1 s. Once ready, it activates at a safe frame, returns to center, approaches/contact/retreats, switches to coarse at center and repeats with both revisions resident. Predictor tests from PR3 are not repeated here. Three 120 s runs follow a 5 s stationary warm-up; one 16 s late control adds 3 s delay. The smoke is separate. Before the full runs only navigation timing instrumentation was broadened to include the complete update and activation work; the smoke source is preserved.

## Measurements

| Run | FPS | Preparation FPS | Full update p99 / max | Fine contacts | Activations | Waits |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 46.91 | 48.42 | 1.20 / 2.70 ms | 57 | 113 | 0 |
| 2 | 46.68 | 48.00 | 1.20 / 1.60 ms | 57 | 113 | 0 |
| 3 | 46.77 | 46.98 | 1.20 / 2.80 ms | 57 | 113 | 0 |

## Full criteria scorecard

| Criterion | Target | Result |
|---|---|---|
| Frame rate | ≥30 FPS overall/preparation | 46.79/47.81 FPS. RAF p95/max remain diagnostics, not extra acceptance gates. |
| Complete movement update | p99≤2 ms/max≤8 ms | Worst normal p99 1.20 ms/max 2.80 ms. Includes scheduling/activation/route and cast synchronous work. |
| Fine ready to safe activation | ≤1 s; every ordinary run activates | Latencies: 16.90 ms, 15.90 ms, 11.50 ms. |
| Request to fine ready | ≤1 s target | 6.304 s, 5.985 s, 5.949 s. A miss remains a miss while coarse movement continues. |
| First usable coarse | ≤5 s | 0.310 s browser preparation; 1.995 s process-start to ready. Coarse artifact and parent reference retained; complete cold start untested. |
| Navigation independence | Zero field/mesh investigation from movement | Movement uses resident Rapier data; preparation asynchronous. Structural evidence, not a zero-valued field-call counter in navigation. |
| Fidelity/contact | Sampled error≤0.005 body diameter | Fresh field/triangle checks pass; independent recorded-contact checks pass. Finite corpus only. |
| Embedding/tunneling and safe activation | None observed; unsafe control defers | All measured entry distance screens pass. Adversarial Rapier solid-overlap control retains old revision and unchanged body. Actual region has ample clearance and does not trigger this hazard. |
| Visible/contact revision | Same revision each draw | Architectural property: rendering and movement read one active revision object with matching real triangles/transforms. The 17,584 log rows write the same active index twice and are not independent verification. Artificial closure only serves solid inclusion. |
| Actual refinement/contact | Different geometry and ≥1 fine contact/run | Different arrays/3.19×real triangle count; fine contacts [57, 57, 57]. Contact witness is shared with coarse; no newly exposed-feature claim. |
| Resident reuse | No repeated field/index rebuild | One fine request per normal run; resident switchbacks reuse both revisions. Reset between runs is explicit preparation. |
| Late preparation | Retain usable coarse and recover | 8.986 s request-to-ready; 0 waits, 3 fine contacts, 0 errors. |
| Memory | ≤1 GiB attributable region CPU+GPU including overlap/build | Unverified. Expanded ledger below; native RSS alone is broader than region ownership. |
| Execution | Fixed runs, bounds, exclusive GPU, cleanup | Fixed replays preserved; hardware/profile in full-r0.json. Cleanup confirmed. Final preview/host checks recorded at closure. |
| Broader scope | Zoom/three scales, LOD seams/openings/intersections, browser-only preparation | Unresolved. This harness still uses native preparation plus browser movement/rendering. No product adoption. |

## Exposure and memory

RAF host-window statistics include the publication interval. These are not hardware presentation or GPU kernel timestamps. Categories overlap.

| Frame subset across normal runs | Frames | Interval sum | FPS |
|---|---:|---:|---:|
| overall | 16845 | 360.031 s | 46.79 |
| preparation | 874 | 18.280 s | 47.81 |
| source | 150 | 3.080 s | 48.70 |
| validation | 259 | 5.420 s | 47.79 |
| field | 397 | 8.240 s | 48.18 |

The source-window sample is nine higher-resolution tiles per run. Its measured duration bounds the contention claim; neither full-run FPS nor whole preparation time implies continuous field-kernel exposure.

| Memory observation | Value |
|---|---:|
| Native process peak RSS | 2521.63 MiB |
| Sampled owned process-tree peak RSS | 3647.82 MiB |
| Source / validation / topology arrays | 84050000 / 33554432 / 64589240 bytes |
| Source / validation evictions | 16 / 884 |
| Recorded native GPU pool | 63018496 bytes |
| Browser mainWasmBytes | 79429632 |
| Browser workerWasmBytes | 72941568 |
| Browser peakGPUBytes | 6405588 |
| Browser peakTransferBytes | 34629398 |
| Browser peakResident | 2 |

Independent peaks cannot be summed as simultaneous use. WASM capacities include reserve, RSS includes runtimes/shared pages, process-tree sampling can miss brief peaks, and the GPU ledger omits driver/compositor allocations. Complete allocation ownership remains unresolved.

## Evidence and decision

Root: `/mnt/ml_storage/scratch/atlas-detail-pr4/`. Frozen `card-r0.md` and `card-amendment-r1.md`; card review 20261029T035407Z-104af3; `preflight-r0/`, `preflight-independent-r0.json`, `displacement-check-r0.json`, `activation-check-r0.json`; `smoke-r0.json`, `full-r0.json`, individual runs, `server-full-r0.json`, `metrics-r0.json`, `geometry-check-r0.json`. Source hashes are embedded in full-r0.json. Verbatim peer exchanges are archived in docs/codesign/project1-log.md.

The card review was useful: it required resolution-qualified provenance, honest cache eviction policy, the vertex bound and narrow visual/scale scope. The maximum RAF interval was 60 ms in one run, causing the 50 ms movement cap to discard 10 ms of simulated movement time; it is preserved as a diagnostic. No geometry tolerance or fixed route was changed to obtain a passing result. No repeated performance run was sought for a cleaner verdict. The stage remains scratch evidence; product source/acceptance is unchanged.

Independent decisive review 20261029T040454Z-26a252 supports closure of fixed-region replacement mechanics and found no invalidating source bug. It confirmed the retirement guard and separate caches. It correctly narrows two claims: draw revision equality is guaranteed by the shared active object rather than independently measured by duplicate-index logs; roughly 1 second of new-resolution source-host windows per normal run is a positive bounded contention sample, not sustained qualification. The 60 ms preparation frame remains recorded.

Next discriminator: change observer scale while a bounded local fine patch arrives. Size the patch relative to the new body instead of growing a fixed 1024-cell domain. Once the body shrinks, the old coarse error bound is larger relative to that body; use coarse geometry only as visual backdrop and restrict movement/contact to prepared fine coverage. Freeze activation against the new radius, rescaled collision units and a newly resolved contact feature before building. This is a reversible experiment direction, not a product representation decision.

The retained-region idea follows established prior art: [Losasso and Hoppe’s geometry clipmaps](https://hhoppe.com/proj/geomclipmap/) retain nested viewer-centered grids and refill them incrementally. PR4 tests one complete replacement revision; it does not implement their full multilevel terrain scheme.


Process accounting: card/review began around 03:54 UTC; first fine build and independent screen completed before 03:57; full hardware suite 03:58:01–04:04:26; final review and launcher checks followed, within the 3 hour bound and 40 min first screen bound. Two reviews were useful: one corrected resolution/cache/scope requirements, the other corrected evidence attribution and the safety constraint for shrinking. Independent geometry checks connect all 9 measured meshes to qualified specimens and verify 345 contacts/entries. No rerun for a cleaner score.


The preview launcher check (`preview-1793246783332.json`) passed on installed hardware Chrome with cleanup confirmed. Host check `cleanup-check-r0.json` found no owned controllers/native workers, no listener on 5256 and the GPU lock free. All recorded source hashes match (`source-check-r0.json`). No experiment remains running.

[Preview screenshot](PR4-detail-2026-10-28.png).
