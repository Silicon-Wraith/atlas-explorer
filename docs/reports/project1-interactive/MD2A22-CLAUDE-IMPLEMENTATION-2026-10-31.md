I see no implementation, metadata, certificate, admission or legacy-path errors that should stop the gate, and the decisive CPU claims check out against the raw JSON and source. One thing to check first: the fine-boundary test in the new browser suite may fail mechanically on a display above about 120 Hz. Nothing was executed or edited.

## What I read
- **In full:** `qualification.json`, `physical-closure.json`, `manifest.json`, `source-world-certificates.json`, `md2a22-qualify.py`, `parent-mesh.js`, `source-bundle.mjs`, `source-adapter.mjs` and `tests/source-worlds.mjs`.
- **Changed parts only:**
  - `application-server.mjs`: lines 1–80.
  - `pose.js`: lines 40–79.
  - `runtime.js`: lines 104–125, plus a search.
  - `scene-adapter.js`: read in full.
  - `contract.js`: the sampling lines.
  - `workspace.js`: searched lines only.
  - `world-preview.mjs`: search only.
  - `suites.manifest.json`: the source and legacy entries.
  - `scripts/generation/README.md`: the lines that set `ATLAS_REFERENCE_PYTHON`.
- **Not read:** HANDOFF, README, the r1/r2/design reports, the preflight and closure reports, `md2a22-preflight.mjs`, `prepared-run-root.*`, the unit test files, `browser-preparer.js`, `check_collision_r0.py`, `native-worker.py`, `config.mjs` and `space-prepared-files.mjs`. I didn't recompute any hashes or check that the manifest matches the frozen head.

## The CPU claims check out
- **Buffer sizes:** 8450×12 = 101400, 8192×12 = 98304 and 16896×12 = 202752. Every kind of A and B matches.
- **Surface error:** A 5.44e‑6 m and B 1.0266e‑5 m, both within 1.25e‑5 m. Each artifact's `maxSurfaceErrorM` agrees with the checker to within 1e‑12. The cell-centre errors on the delivered planes are also within the bound.
- **Volumes fit the bounding boxes:** A is 4.40 m³ against a 1.6²×3.49 ≈ 8.93 m³ box; B is 9.54 m³ against about 19.0 m³.
- **Closure, winding and scaling:** the checker independently confirms the top topology, closed edges (count 2, direction balance 0), upward normals and physical geometry identical across all three normalisations. The side quads in `parent-mesh.js` (b, a, a′) and (b, a′, b′) reverse each boundary edge correctly.
- **Coverage:** the checker confirms both grid envelopes lie inside the bounds, and the reverse condition for coarse bodies. It doesn't enumerate each address, but with axis-aligned grids the envelope is exactly the union of the address cubes, so this is equivalent.
- **The certificate chain is closed:**
  - The certificate's `evidenceId` is the sha256 of `qualification.json`.
  - Its `sourcesKey` equals the one in `physical-closure.json`.
  - Its per-kind buffer digests and definition keys match the qualification rows.
  - The adapter refuses to run unless its live buffer descriptors equal the certified ones, and refuses any other source key, definition or input key.
  - The motion audit's specimen is the same digest-checked preflight output, so browser bytes, certificate and audit all refer to the same buffers.
- **Audit slack** is 8 f32 ulps at the largest normalised coordinate times the scale: 1.53e‑6 m for A and 3.05e‑6 m for B, and it's the same in metres for coarse and fine, as expected. The source-clearance figure is reported separately and is not a stop rule.
- **The reader:** strict NPY v1 header, exact data length, rejects −0 and non-finite values, recomputes the logical SHA, compares the full definition, and refuses files that escape the bundle via realpath.
- **Input-key semantics:** I agree with binding the input key to the definition and logical array, not to provenance. Transport hashes are checked separately, only for internal consistency against `bundle.json`, which matches A2.1's identity rules.

## Legacy paths are untouched as far as I read
- In `contract.js`, the new sampling shape applies only when `method === 'bilinear-grid-v1'`. The legacy key set and its bytes are unchanged.
- The scene labels switch only for the source generator id and version.
- In `application-server.mjs`, the default adapter and certificate path (including the environment-variable default) are unchanged. Source mode always uses the source certificate.
- `/open` now uses `hello.feature ?? feature-r0.json`. That's safe as long as the native worker's hello has no `feature` field. I couldn't confirm that (`native-worker.py` isn't in the packet), but the maintained legacy entries in the gate will exercise it.

## Check before the gate
1. **Fine-boundary test and display refresh.** `boundary()` places the fine body 0.0001 m inside the envelope, then holds W for 600 ms and asserts the position is unchanged. Each frame's step is 0.0125·dt m. That exceeds 0.0001 m only if dt > 8 ms, i.e. below about 125 Hz, and at 120 Hz the margin is about 4%. On a faster display, or with a short frame, the first frame moves inside, the deepEqual fails, and the gate run is wasted.
   - Either confirm the gate display runs at 60 Hz (an earlier gate's FPS record would show this),
   - or change the offset to something like 1e‑6 m, which is still within `supportsPositionM`. This is a test-only change: the certificate's `sourcesKey` doesn't cover test files, so the certificates stay valid, but you'd need a new commit and re-freeze.
2. **Gate environment.** The final required pass needs `ATLAS_REFERENCE_PYTHON` set (a CPU NumPy interpreter). The audit also needs the preserved inputs at the default `/mnt/ml_storage/scratch/atlas-md2a22/preflight-r0`, or `ATLAS_SOURCE_WORLD_INPUTS` pointing to them. Without these, that pass fails for mechanical reasons, not substantive ones.

## Minor, not blocking
- **Possible one-ulp mismatch in the fine check.** `supportsPositionM` tests the absolute position `x` against the fine limits, while `validate` tests `originM + (x − originM)`. These can differ by one ulp. It only matters when the fine limit is the binding constraint, possibly at the top of the y range, and the position lands within about 1e‑14 m of it, so it's practically unreachable. Either use identical arithmetic or wrap `withPositionM` in a try, in a later change.
- **Some assertions are tautological.** In `source-worlds.mjs`, `renderRevision === collisionRevision` compares the same `snapshot.key` with itself, and `displacement === 0` is hard-coded in `runtime.js`. The real evidence is the receipt check and the exact position equality, so the report should say that rather than cite these assertions.
- **Unverified from the packet.** I couldn't check, without B's actual geometry, that the 7 s / 12 s / 14 s pulse durations produce fine contact and a clear grow-back. You say you accounted for grazing on B; if it fails, that's an experimental outcome, not a defect. The suite's estimated runtime (about 220–250 s including the audit) fits within its 360 s limit, but not by a wide margin.

Once item 1 is settled and the environment in item 2 is confirmed, I consider the implementation ready for the single maintained 29-entry headed gate.
