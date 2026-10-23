# ATLAS — Claude Code project brief

Read `AGENTS.md` too: it holds the repository guidelines that Codex and Claude share. For tooling
and commands see `README.md` and `package.json`. `HANDOFF.md` records the current worktree handoff and earlier 2D explorer history. Its "do not initialise git" instruction is superseded: git is in use.

**Direction:** ATLAS is evolving into a 3D workbench under the approved charter,
`docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md`.

**Constraints:**
- Scratch files go to `/mnt/ml_storage/scratch`, never `/tmp` (the root drive).
- Never modify the host NVIDIA driver, DKMS or packages.
- Never disable the browser sandbox.

## Space implementation and verification

Space source lives in `src/space/`, with GPU-independent models/numerics/camera code and the WebGPU backend confined to `src/space/render/webgpu/`. `src/space/workspace.js` owns its scene, histories, gestures and recovery; `src/ui/workspace-switcher.js` owns activation between retained Plane and Space workspaces.

`npm run test:space -- --group shell` runs guarded Node units then the headed Space shell suite. Every browser/GPU run takes `flock /mnt/ml_storage/scratch/atlas-gpu.lock` and exactly one handoff/deferral declaration as required by the gate. Acceptance requires installed Chrome headed with the recorded Vulkan/WebGPU profile and confirmed cleanup. Standalone measurements use a private port such as 5195; the gate owns 5190. Cold-prewarm and P3 launches require `ATLAS_COLD_CACHE_ROOT` under scratch. Never substitute software/headless results or diagnostic captures for Space acceptance.

Promote to `main` only through a reviewed PR. The 1b.1 audit uses pinned `main..implementationHead`, with full-gate, typed fast-check, WIP and exception evidence kept distinct. See README for commands and HANDOFF for current acceptance status.

## Claude–Codex Collaboration Protocol

ATLAS is designed and planned by **Claude and Codex as equal peers**. There is no driver and no
reviewer. Both generate ideas, argue, and converge. **Delegated product direction (user,
2026-10-22).** Claude and Codex own product direction: feature scope, priorities, order, design,
specs, plans and implementation. They converge, record each amendment, and act. The user advises and
is kept informed; converged specs and plans no longer wait for user approval. The user is asked only
for what only the user can do (permissions, hardware or browser actions, accounts, merging PRs) or
about the user's own intent. Historical user approvals stay on record. Design and architecture
questions go to the peer, not to the user.

**The two copies.** This section is identical in `AGENTS.md`, which Codex reads, and `CLAUDE.md`,
which Claude reads. Change both together.

### Channel
- Claude talks to Codex through the codex-bridge plugin
  (`/mnt/ml_storage/dev/projects/codex-bridge/bin/codex_bridge.py`). A topic starts with
  `consult`. Every later turn uses `resume --run-id <latest run id>`, so the whole topic lives in
  one shared Codex session with its memory intact.
- Codex runs read-only during design work. While a bridge run is active, nobody edits files in
  the checkout: the bridge's tripwire treats any change as a guard violation.
- Bridge artefacts live under `CODEX_BRIDGE_HOME=/mnt/ml_storage/scratch/codex-bridge`, never on
  the root drive.

### Rounds
1. **Independent positions.** Each peer answers the same brief without seeing the other's answer,
   to avoid anchoring. Claude writes its position to a file before reading Codex's.
2. **Debate.** Each peer reads the other's position and replies to every point: agree, counter,
   or refine. A concession is stated plainly. Every reply ends with an **"Agreed so far"** list
   and a **"Still disputed"** list.
3. **Converge.** Rounds continue until "Still disputed" is empty or trivial.
4. **Draft and review.** One peer drafts the document. The other reviews it **as a co-author**,
   giving concrete replacement text and a verdict: **READY**, or **NOT READY** with the blockers
   listed. Iterate until the verdict is READY.
5. **Verify before applying.** A numerical or factual claim from the peer is reproduced
   independently, by running code or reading the source, before the document relies on it.
   Evidence wins over authority in both directions.
6. **Hand to the user.** The user receives the converged document, a short account of what changed
   and why, and only the questions that genuinely need the user.

### Running log
- Every message in both directions is appended **verbatim**, with sender and timestamp, to
  `/mnt/ml_storage/scratch/atlas-codesign/conversation-log.md` (helper: `log-append.sh` in the
  same directory). The user can read it at any time
  (`tail -f /mnt/ml_storage/scratch/atlas-codesign/conversation-log.md`).
- The log lives outside the repo because of the tripwire. It is archived to
  `docs/codesign/conversation-log.md` at every milestone: a spec or plan ready for the user.

### Where things go
| Artefact | Location |
|---|---|
| Specs | `docs/superpowers/specs/` |
| Plans | `docs/superpowers/plans/` |
| Reports | `docs/reports/` |

The governing document is `docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md`.

### Scope
- **Applies to:** specs, plans, reviews, and the interpretation of experimental results.
- **Implementation:** may be delegated to either peer, as the approved plan's execution method
  says. Every change is reviewed by the other peer before it is called done.
