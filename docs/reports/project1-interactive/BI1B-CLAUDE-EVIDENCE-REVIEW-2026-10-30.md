# BI1.B evidence and source review (evidence-review-r0, candidate 9ab8ee6)

**Verdict:** the source and standalone evidence support the bounded BI1.B file and history experience. I found no material blocker. The only open condition is the full 25-entry gate on 9ab8ee6 and its final performance rows. I am not treating that gate as passed.

## Card corrections, checked in source
- **Restore versus pending host task (my main card finding): resolved.**
  - `mode-host.restart` advances the host generation, cancels the pending task through a new cancellation race, deactivates the child and starts a fresh `select`. The superseded caller now gets `superseded` instead of falling back to the viewer.
  - The pending-task cancel also clears the deadline timer, and the timer only deactivates the child if its task is still the pending one.
  - Leaving Space cancels the pending task too.
- **Success comes only from the current presentation.**
  - `requestRestoration` reports success only if Landscape is active, presented, and its scene request equals the current request (workspace line 63).
  - The host's `activated` is never consulted. A viewer fallback therefore yields "requested scene retained", which the headed unsupported-file case exercises.
- **One history entry per settled gesture; no per-frame world hashing.**
  - Each frame does only an equality check on the camera (`storePose`).
  - `acceptPose`, which builds the world reference with its FNV hash, runs only in `settleNavigation`: on key release, pointer release, a 200 ms quiet period, `clearInput`, scene actions or deactivation.
  - The codec's world check is cached through a set of already-validated world objects. History listeners only update controls, and requests advance only through `restore` or `step`, so there is no restore loop.
- **Requested versus published pose.**
  - `storePose` writes the published pose only when the state has presented and its request is current, so an old runtime cannot overwrite a newer request.
  - The build always admits the requested scene, not the old retained pose.
  - Every await in the build checks the scene request, which fences rapid B→C requests. The workspace unit tests cover the deferred cases; I did not read them.
- **Metadata-first seeding (`scene-history.js`).**
  - Before metadata, only the latest pending request is kept, with no history.
  - Seeding applies that pending request once as a single `restoreScene` edit.
  - The actual reopen shows exactly this: undo depth 1 and camera length 2 after opening the file before any Landscape entry.
- **Exact producer comparison.** `admitPreparedScene` compares the full canonical world record with `setup.world`, and the light direction, before `poseModel.validate`. A re-keyed world fails even though FNV consistency passes in the codec.
- **Sign equivalence.** `equalPreparedCameras` requires exact position, origin, body and FOV, and orientation equal up to sign within 8 ε. Accepting a pose therefore creates no spurious entry against a file quaternion with the opposite sign.
- **File-read fences:**
  - size is checked before the read;
  - reads time out after 5 s;
  - each read is matched against a sequence number before parsing, and cancelled by any newer action or by leaving;
  - a parse failure throws before any mutation.
- **Input permits:** history keyboard shortcuts only fire when the canvas is eligible. History buttons clear input before stepping. Movement still goes through `client.check()`, the existing PC4 path.
- **Retry:** Retry Landscape calls `select('landscape')`, which builds the requested scene. The headed test shows the requested pose (999) survives Retry.

## Roll dataflow (the source-audit correction)
The full path is: file quaternion → `admitPreparedScene` → `poseModel.validate` (sign-normalised) → `runtime.start` → `runtime.frame().pose` → `draw` → renderer basis.
- **`preparedForward`** is R·(0,0,−1), and I checked it against the rotation matrix.
- **`preparedUp`** is the second column of the rotation matrix, R·(0,1,0); that is also correct.
- **`preparedViewBasis`:** right = forward × up and up′ = right × forward. That is right-handed and consistent with the earlier (0,1,0) default, and a quaternion of either sign gives the same matrix.

Two limits to record:
1. The look controls derive yaw and pitch from forward only, so a rolled file's roll is dropped on the first drag, and pitch is clamped to ±1.5. That drag becomes a normal camera entry, and Back restores the rolled pose.
2. No rolled pose was presented in the headed run, so rolled rendering rests on the CPU basis tests.

## Evidence checked against the packet
- **Durable restart:** producer instances differ (`31c7a86a` saving, `65e777fd` reopening).
  - The reopened pose deep-equals the saved pose.
  - The requested scene deep-equals the parsed bytes, and the re-exported file is byte-identical.
  - The saved file's SHA-256 is `abbe384b…`.
  - The downloaded bytes pass a regex that excludes `/mnt/`, `scratch`, `bundle`, `.npz`, `runtimeId`, `nonce`, `token`, `epoch` and `producer`.
- **World record:** contains only `id`, `generator`, `assets` (role and digest), `lineage`, mathematical parameters and `definitionKey`. No paths, at least for this world.
- **History checks:**
  - One short key run adds one camera entry and leaves undo depth unchanged.
  - Back and Forward give exact poses with no new entries.
  - The second file open adds one undo entry; Undo and Redo give exact poses.
  - A malformed upload leaves the scene hash and history unchanged.
  - An out-of-domain pose stays requested through the viewer fallback and through Retry; Undo then returns to the saved pose.
  - Viewer Open rejects the prepared file without changing the viewer's scene or history.
- **Publications:** 3 prepared and 3 retired when saving; 14 and 14 on reopen; zero native publications afterwards.
- **Timing and cleanup:** interaction 25.657 s and the whole suite 51.575 s, both within the 180 s and 360 s bounds. External closure shows no processes alive, ports closed and the lock free.
- **Repair:** the test now sets `mode:'files'` on each phase (line 29), consistent with the stated repair. The original 2919f6d attempt is not in this packet, so I cannot verify it.

## Images
`saved-place.png` and `restored-place.png` show the same framing and pose, with "Landscape scene saved." and "Landscape scene opened." respectively. The surface detail differs because different coarse regions were selected:
- The first restore entered the coarse region `4b2f1f5b` (address 0,0,1).
- The original first entry used region `03a17384`; the save phase also prepared `4b2f`.

Note that `4b2f1f5b` is the specimen with only one reference sample. The restored representation's reference-to-mesh fidelity therefore rests on that sparse limit, while its mesh-side check has 512 samples. That should be stated in the report, not treated as a new gate.

## Report gaps to fix before closure (none are blockers)
1. **Restore latency:** the card requires it to be reported separately from flight, and the owner report does not. The ledger allows it to be derived: for example, request 1 went from `restore-requested` at …490363 to `restore-presented` at …494308.7, about 3.95 s, including a new session and native start. Report all seven presented restores.
2. **Sparse specimen at restore:** state that the restored entry used the single-sample coarse specimen.
3. **Roll and Retry semantics:**
   - Roll is dropped on the first drag (and pitch clamped); add this limit.
   - Retry now means "restore the requested scene", which is the last settled pose. That is equivalent to PC4's retained pose because input settles before deactivation. Say so.
4. **Each history step is a full restart** (new session, new native activation): 8 restore requests and 9 sessions on reopen. That is acceptable for this slice, but the latency should be reported as such.

**Smallest next action:** await the 25/25 gate on 9ab8ee6, derive the final normal-route performance rows, and add the restore-latency row and the limits above. No further review round is needed unless the gate fails.

## Scope
**Read (packet):** `source-manifest.json`, `owner-report.md`, `summary.json`.
- **Source and test in full:** `scene-adapter.js`, `scene-history.js`, `mode-host.js`, `workspace.js`, `tests/space-prepared-files.mjs`.
- **Grep or partial reads:**
  - `pose.js`: `preparedForward` and `preparedUp`
  - `prepared-regions.js`: view basis and uniforms
  - `app.js`: lines 35–62
  - `ledger.json`: grep plus lines 1505–1614
- **Images:** both PNGs (`saved-place.png`, `restored-place.png`).

**Not read:**
- **Unit tests:** `prepared-scene`, `prepared-history`, `prepared-workspace`, `space-mode-host`, `prepared-pose`.
- **Docs:** the amendment, the mechanical-repair note, the design/plan revisions, `index.html` and `style.css`, `suites.manifest.json`.
- **Unchanged modules:** `runtime.js`, `contract.js` and the client, producer and lifecycle files (same hashes as in earlier reviews).
- **Run records:** the original failed run, the rehearsal, and the gate in progress.

I executed nothing and edited nothing.
