# Repository Guidelines

## Project Status & Purpose

ATLAS is a web app for exploring inhabitable worlds derived from fractal mathematics (North Star: "make mathematics somewhere you can go"). It is governed by `docs/superpowers/specs/2026-10-23-atlas-north-star-charter.md`, adopted 2026-10-23, which mostly replaces the 2026-10-18 workbench charter. Today it contains a 2D deep-zoom Mandelbrot explorer (Plane) and a WebGPU 3D fractal viewer (Space); see `README.md` for tooling and commands. Targets: desktop or laptop with a discrete GPU, not mobile. Licence: MIT.

## Project Structure & Module Organization

The layout follows the Project 1 spec (`docs/superpowers/specs/2026-10-19-project1-design.md` §4.1):

- `src/app.js`: the small composition root.
- `src/plane/`: the 2D Plane workspace (coordinates, perturbation, renderers, shaders, places, palettes).
- `src/space/`: the 3D Space workspace, model/numerical/camera contracts, navigation, recovery and WebGPU renderer.
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

## Space implementation and verification

Space source lives in `src/space/`, with GPU-independent models/numerics/camera code and the WebGPU backend confined to `src/space/render/webgpu/`. `src/space/workspace.js` owns its scene, histories, gestures and recovery; `src/ui/workspace-switcher.js` owns activation between retained Plane and Space workspaces.

`npm run test:space -- --group shell` runs guarded Node units then the headed Space shell suite. Every browser/GPU run takes `flock /mnt/ml_storage/scratch/atlas-gpu.lock` and exactly one handoff/deferral declaration as required by the gate. Acceptance requires installed Chrome headed with the recorded Vulkan/WebGPU profile and confirmed cleanup. Standalone measurements use a private port such as 5195; the gate owns 5190. Cold-prewarm and P3 launches require `ATLAS_COLD_CACHE_ROOT` under scratch. Never substitute software/headless results or diagnostic captures for Space acceptance.

Promote to `main` only through a reviewed PR. The 1b.1 audit uses pinned `main..implementationHead`, with full-gate, typed fast-check, WIP and exception evidence kept distinct. See README for commands and HANDOFF for current acceptance status.

## Claude–Codex Collaboration Protocol

**Governing charter:** `docs/superpowers/specs/2026-10-23-atlas-north-star-charter.md` (adopted 2026-10-23), which mostly replaces the 2026-10-18 workbench charter. The advisor holds the product vision. Claude and Codex are engineering peers who own technical decisions, reason together, find workable solutions, recognise dead ends and take responsibility for results.

**The two copies.** This section is identical in `AGENTS.md`, which Codex reads, and `CLAUDE.md`, which Claude reads. Change both together.

### How we work
1. **Start from one observable experience** and the riskiest assumption behind it.
2. **Owner and challenger.** Each initiative has one owner, who designs, builds and measures, and one challenger, who looks for the flaw or the simpler path and independently checks the decisive evidence. Roles are assigned per initiative.
3. **Criteria before building.** A substantial initiative opens with a short card: the experience it enables, the limitation it addresses, the smallest test, the success criteria, a time limit and a stop rule.
4. **Decide by reversibility.** The owner decides reversible choices. For consequential choices, both peers write independent positions first, without anchoring on each other. A disagreement gets the smallest discriminating test, not a longer argument; evidence wins in either direction. Record consequential decisions in a short note: evidence, choice, limits, and what would trigger reconsideration.
5. **Dead ends are findings.** At a stop rule the owner records what was tried, what failed and what comes next. Either peer may abandon an approach; the other may challenge.
6. **Verify before relying.** A peer's factual or numerical claim is checked against source or a preserved run before anything depends on it.
7. **Proportional process.** Scratch experiments need no product acceptance gate, but they keep bounded execution, exclusive GPU use, preserved evidence and confirmed cleanup. Product verification follows behavioural impact. Amend the recorded acceptance policy before replacing its requirements.
8. **Advisor contact.** The advisor gets milestone summaries: what ATLAS can do now, the evidence, what we learned, what's next and why, and any decision needed. We escalate material product-intent changes, expensive commitments, consequential licensing, acceptance of important unresolved risks and necessary external permissions, with a recommendation. Disagreements between the peers are not escalated; they get an experiment. The advisor merges PRs to `main`.

### Channel
- Claude talks to Codex through the codex-bridge plugin (`/mnt/ml_storage/dev/projects/codex-bridge/bin/codex_bridge.py`). Design discussions start with `consult` (read-only). Implementation uses `run --mode new-worktree`, or `run --mode in-place` from an eligible linked worktree. Continue each session with `resume --run-id <latest run id>`. Resume retains the parent's permissions; moving from a read-only discussion to implementation requires a new writable run with the agreed context supplied.
- During a read-only review, nobody edits the reviewed checkout. During implementation, only the assigned bridge worker edits its designated target. Keep the primary checkout, protected refs, and target HEAD/branch unchanged while the run is active; permitted content edits within the write target are not tripwire violations.
- Bridge artefacts live under `CODEX_BRIDGE_HOME=/mnt/ml_storage/scratch/codex-bridge`, never on the root drive.

### Running log
- Every message in both directions is appended **verbatim**, with sender and timestamp, to `/mnt/ml_storage/scratch/atlas-codesign/project1-log.md`. When using `log-append.sh` in that directory, explicitly set `LOG=/mnt/ml_storage/scratch/atlas-codesign/project1-log.md`; the helper otherwise defaults to `conversation-log.md`. This log is the advisor's window into our reasoning.
- The log is archived into `docs/codesign/` at milestones.

### Where things go
| Artefact | Location |
|---|---|
| Charter and specs | `docs/superpowers/specs/` |
| Plans | `docs/superpowers/plans/` |
| Reports and findings | `docs/reports/` |
