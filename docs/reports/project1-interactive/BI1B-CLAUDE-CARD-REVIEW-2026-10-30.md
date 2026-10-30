Reading is done; I'm writing up the verdict now.

# BI1.B card challenge (card-review-r0)

**Verdict:** ready to implement, with precise corrections. I found no fatal flaw. One contract conflict must be resolved in the amendment before the workspace and composition work starts: an internal restore currently interacts badly with the mode host's pending-task reuse. Two further corrections matter for correctness and cost.

## 1. Contract conflict: restore versus the host's pending task
In `mode-host.js` `select()`:
- A second `select('landscape')` while Landscape is already pending reuses the same pending promise (lines 12–13).
- If the child returns anything other than `activated`, the host deactivates Landscape and falls back to the viewer (lines 26–27).

The workspace's `activate()` returns `superseded` when its own generation is replaced (workspace lines 100 and 105). It also returns `activated` immediately if it is already active (line 98).

That gives two failures:
- A file or history restore issued while the first Landscape activation is still pending supersedes the workspace's build. The host's original task then resolves `superseded`, the host treats it as failure, and it deactivates Landscape and falls back to the viewer. The restore is killed.
- A restore issued while Landscape is already active cannot simply call `select('landscape')`, because the workspace reports `activated` without restoring.

**Correction:** specify one mechanism and test it. Either:
- (a) give the host a narrow `restart(mode)` that drops the pending task, advances its generation and starts a fresh child activation; or
- (b) have the workspace resolve an internally superseded activation with the outcome of the newest requested activation, never with `superseded`.

Either way, file or history success comes only from the current restore generation's own first presentation. The viewer-fallback `activated` stays exactly as it is for outer callers, as the design already says. The 60 s activation deadline also applies to restores; state that.

## 2. History updates must happen at commit, not every frame
`history.update` calls `reduceCommand`, which runs a full `codec.validate`, and `changedDomains`, which canonicalises every field twice. A `setCamera` scene is a new object, so the codec's WeakMap shortcut never applies.

A prepared codec that checks the definition key will run `createWorldRecord` plus a byte-wise BigInt FNV over the world record. Doing that on every frame, at 50 FPS, on a path whose navigation p99 already misses 2 ms, is avoidable cost and listener churn.

**Correction:**
- The runtime owns the live pose during a gesture.
- History receives exactly one `setCamera` when the gesture settles, as one `apply`, only if the pose changed under prepared equality.
- The world record is validated once per scene identity and cached.

**Restore triggers:** start an asynchronous restore only on these causes: `back`, `forward`, `undo`, `redo`, and an explicit file `restoreScene`. Never on `preview`, `commit` or `cancel`. This rule is decisive for "no restore loop".

## 3. Pre-metadata semantics must be explicit
Without producer metadata there is no canonical origin, so no default scene and no history can exist yet.

**Correction:**
- Before the first metadata, hold only the latest parsed pending request. A later open replaces it and nothing is recorded as an Undo entry. Show Undo/Back as unavailable.
- When metadata arrives, seed the default scene, then apply the pending request once as a single `restoreScene` edit. Undo then returns to the supported default.
- An execution-unsupported pending scene remains current and requested; it is never replaced by the default.

## 4. Portable record and path-freeness
- `createWorldRecord` constrains `id`, `generator`, `assets` (each `{role, sha256}`) and `lineage`, but `world.parameters` is a free-form plain object taken from native `hello.definition`. The schema therefore does not guarantee the record is free of paths.
- **Correction:** add a native-free assertion on the actual record derived from the fixture, and a headed assertion on the downloaded bytes. Neither may contain:
  - absolute paths, scratch/run/bundle roots or native filenames;
  - tokens, runtime IDs, nonces or epochs.
- **Definition key:** the codec's key check proves only internal consistency, since FNV is not authentication. A hand-edited, re-keyed world must fail the producer comparison. The design already places authority there; include that as a test.
- **Admission:** structural parsing promises nothing about admission. That is correctly stated; keep the UI wording to "opened (pending preparation)" until presentation.

## 5. Equality and "exact" return
- `pose.validate` rewrites the quaternion sign so its first nonzero component is positive. A file with a valid negative-sign quaternion will therefore produce a published pose whose serialised identity differs from the requested one.
- **Correction:** define "matches the saved promise" as follows:
  - world, origin, local position, body diameter and FOV equal exactly;
  - orientation equal up to sign.
- Prepared camera equality must use the same rule, so that the first accepted pose does not create a spurious history entry.
- Files produced by ATLAS are already sign-normalised, so the headed route can still require byte-identical re-export.

## 6. Evidence route fairness
- **Unsupported case, headed:** use a deterministic compatibility failure from the existing pose model. Examples: a fine body outside the fine formation, or a pose outside the local domain. Cover body-clearance failure in deferred CPU controls instead. This avoids authoring a new mathematical "occupied" specimen, consistent with the card.
- **Retry:** Retry Landscape (`app.js:49`) must restore the requested scene, not the old retained pose. Test it.
- **Viewer Open given a prepared file:** it should fail as unsupported-model and leave viewer state unchanged. Assert that.
- **Time bounds:** 180 s of interaction and a 360 s hard limit are fair for one save → restart → open → history route with native-free rehearsal first.
- **Gate pin:** the gate plan is adequate if the gate runs on the final head and records application digests, as PC4 did.

## Decisive controls to add or keep
1. Restore while the first activation is pending, and while Landscape is active. The host must not fall back to the viewer, and success must come only from the current generation.
2. A viewer-fallback `activated` result never completes a Landscape file open.
3. Per-cause restore triggering, and exactly one history entry per settled gesture.
4. The pre-metadata pending-replacement rule.
5. Old-runtime `storePose` and deactivate cannot overwrite the requested scene.
6. Sign-equivalence equality.
7. Path-freeness scan of the real record and the downloaded file.
8. A re-keyed world is rejected by the producer comparison.
9. Retry uses the requested scene.

## Scope
**Read (BI1.B packet):**
- Documents: `source-manifest.json`, the BI1.B design, plan and card.
- Source in full: `shared/scene.js`, `shared/history.js`, `shared/commands.js`, `preparation/pose.js`, `space/mode-host.js`, `app.js`.
- Grep extracts only: `contract.js` (world record), `space/scene-adapter.js`, `runtime.js`, `native-adapter.mjs`.
- From earlier PC4 reviews: `workspace.js` and `application-client.js` in full, and `runtime.js` (grep only). Their pinned hashes match the PC4 files I reviewed, but I did not re-read them in this packet.

**Not read:** `gestures.js`, `workspace-switcher.js`, `native-worker.py`, the unit tests (`prepared-workspace`, `history`), `prepared-fixture.mjs`, the BI1 integration spec, the North Star charter and `AGENTS.md`.

I executed nothing and edited nothing.
