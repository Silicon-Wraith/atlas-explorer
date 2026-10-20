# Co-design brief — Round 1

You (Codex) and Claude are co-designing, as equal peers, the evolution of ATLAS (this repo: a
2D deep-zoom Mandelbrot explorer, see README.md, HANDOFF.md, src/) into a **3D fractal /
mathematical explorer workbench**. There is no driver and no reviewer: both of you generate
ideas, argue, and converge. The user has delegated the architectural questions to the two of
you and wants a joint proposal back. The user approves the final spec; reserve questions for
the user only for things that are genuinely a matter of taste or intent that neither of you can
reasonably settle (list them separately and keep that list short).

Claude is writing its own independent Round 1 position right now, without seeing yours. After
this round you will each read the other's position and debate the differences.

## Known facts / constraints
- Workstation: NVIDIA RTX 6000 Ada (48 GB), 16 cores/32 threads, Ubuntu 24.04. Chrome reaches the
  GPU only via ANGLE/Vulkan (`npm run dev:gpu`); the default path is llvmpipe.
- ATLAS today: plain JS ES modules, WebGL 2, Web Workers, a tiny Node server; zero runtime
  packages (Playwright is the only dev dependency). Strong verification culture (numerical
  oracles, browser tests on real hardware, measured performance claims).
- Git was just initialised (baseline commit 54aa5f6). Do NOT edit any files in this run.
- AGENTS.md: keep the maths independent of the UI so it is testable without rendering.

## Questions — give a recommendation, the reasoning, alternatives you rejected, and risks
1. Purpose and audience: visual exploration/art, mathematical investigation, or both (which first)?
2. Relationship to the existing 2D explorer: one app with modes, 2D as an instrument inside 3D
   (e.g. slices/parameter planes), or separate apps sharing code?
3. Which fractal families / mathematical objects are in the first version, and which are later?
4. Rendering technology: stay on WebGL 2 or move to WebGPU (compute shaders)? Distance-estimated
   ray marching, path tracing, volumetric, meshing? Progressive refinement strategy?
5. Precision and deep zoom in 3D: what is realistic and worth it (ATLAS's identity is infinite
   2D zoom)?
6. What does "workbench" mean concretely: user-defined formulas (expression language → shader?
   raw shader editing?), parameter panels, node graphs, scripting, reproducible "scenes"?
7. Mathematical instruments worth building (orbit inspection, slices, parameter-space maps,
   measurements, comparisons, ...).
8. Outputs: stills, tiled high-resolution renders, keyframed camera paths/video, mesh export for
   3D printing, shareable scene files.
9. Decomposition: if this is too large for one spec, propose the sub-projects, their order, and
   what exactly is in the first one.
10. Architecture and testing: module boundaries, how to verify a 3D renderer (oracles for distance
    estimators? image regression? performance budgets?).
11. Ideas: what would make this workbench genuinely remarkable rather than another Mandelbulber
    clone? Be generous and concrete here.

Format: Markdown, one section per question, then "Questions for the user (only if essential)".
Be concrete and opinionated; cite repo files where relevant.
