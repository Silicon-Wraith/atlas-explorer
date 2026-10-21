# Repository Guidelines

## Project Status & Purpose

ATLAS is a working 2D deep-zoom Mandelbrot explorer (see `README.md` for tooling and commands). It is evolving into a 3D fractal and mathematical workbench under `docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md`. Some sections below predate the implementation; `README.md` and `package.json` describe the current tooling.

## Project Structure & Module Organization

The layout follows the Project 1 spec (`docs/superpowers/specs/2026-10-19-project1-design.md` §4.1):

- `src/app.js`: the small composition root.
- `src/plane/`: the 2D Plane workspace (coordinates, perturbation, renderers, shaders, places, palettes).
- `src/shared/`: workspace-independent contracts (scenes, commands and histories, render requests and reports, discoveries, persistence). It never holds BigInt coordinates, perturbation or GPU handles.
- `src/ui/`: the shell (dialogs, notifications, icons, styles, the Discoveries control).
- `tests/`: unit tests (`tests/unit/`, listed in `tests/unit.manifest.json`), browser suites (`tests/*.mjs`, listed in `tests/suites.manifest.json`) and test support (`tests/support/`).
- `assets/`: images and other static resources.
- `README.md`: setup instructions, controls, and supported workflows.

Keep Mandelbrot calculations independent of the interface so numerical behavior can be tested without rendering a screen. Avoid creating empty directories before they are needed.

## Build, Test, and Development Commands

`README.md` and `package.json` hold the exact commands. In short: `npm run dev` serves the app; `npm test` runs the Node unit tests through `scripts/run-unit.mjs` (never a browser or GPU); `npm run build` copies the static app into `dist/`; `npm run gate` runs the Plane behaviour gate on a clean commit. The gate needs exactly one of `ATLAS_GPU_HANDOFF="<who, when>"` or `ATLAS_GPU_DEFERRED="<reason>"`, and exits 0 (passed), 2 (pending: GPU suites deferred) or 1 (failed); an owned process tree that cannot be confirmed stopped fails the run and stops further browser or GPU work. Scratch files go to `/mnt/ml_storage/scratch`, never `/tmp`.

## Coding Style & Naming Conventions

Follow the chosen language's standard conventions and configure its formatter before the codebase grows. Use consistent indentation within each file. Choose descriptive names for complex coordinates, zoom levels, iteration limits, and palette values. Separate mathematical parameters from display settings; document coordinate transforms and numerical precision limits where relevant.

## Testing Guidelines

Unit tests use the Node built-in runner through `scripts/run-unit.mjs`; add every new unit test file to `tests/unit.manifest.json`. A RED run uses `--expect-fail "<test name>"` against an importable interface skeleton and passes only if that test fails on an assertion; it never launches a browser or GPU (`--expect-missing` is only the T00 bootstrap). Every wait in a browser suite is bounded (`tests/support/bounded.mjs`). Add focused tests alongside numerical and interaction logic. Cover known interior and escaping points, iteration limits, coordinate mapping, and zoom behavior. Name tests after the behavior they verify. For visual changes, record manual checks and include representative screenshots when useful.

## Commit & Pull Request Guidelines

Git has been in use since 2026-10-18, on branch `main`. This supersedes `HANDOFF.md`'s instruction not to initialise it. Use focused commits with descriptive imperative subjects, such as `Add cursor-centered zoom`. Change descriptions should explain behavior, validation performed, and relevant limitations; link issues when available.

## Agent-Specific Instructions

Check existing files before editing and avoid inventing project tooling. For library, framework, SDK, API, CLI, or cloud-service documentation, use Context7: resolve the library ID first unless an exact ID is supplied, then query documentation for each distinct concept. This is unnecessary for general programming, business logic, or routine code review.

## Claude–Codex Collaboration Protocol

ATLAS is designed and planned by **Claude and Codex as equal peers**. There is no driver and no
reviewer. Both generate ideas, argue, and converge. The **user is the decision-maker**: the user
approves every spec and plan, and settles only genuine questions of taste or intent. Design and
architecture questions go to the peer, not to the user.

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
