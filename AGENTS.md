# Repository Guidelines

## Project Status & Purpose

This is a new Mandelbrot explorer project. No application code, build system, test framework, or Git workflow has been established. Keep initial decisions explicit and update this guide as the project takes shape.

## Project Structure & Module Organization

When adding the first implementation, organize files around clear responsibilities. A suggested starting layout is:

- `src/`: application source, separating fractal calculations, rendering, and interaction.
- `tests/`: automated tests and small fixtures.
- `assets/`: palettes, images, and other static resources, when needed.
- `README.md`: setup instructions, controls, and supported workflows.

Keep Mandelbrot calculations independent of the interface so numerical behavior can be tested without rendering a screen. Avoid creating empty directories before they are needed.

## Build, Test, and Development Commands

No build, test, or development commands exist yet. When selecting the toolchain, document exact installation, local-run, build, and test commands in `README.md` and update this section. Prefer a small, reproducible workflow over custom automation.

## Coding Style & Naming Conventions

Follow the chosen language's standard conventions and configure its formatter before the codebase grows. Use consistent indentation within each file. Choose descriptive names for complex coordinates, zoom levels, iteration limits, and palette values. Separate mathematical parameters from display settings; document coordinate transforms and numerical precision limits where relevant.

## Testing Guidelines

No testing framework or coverage target is configured. Add focused tests alongside numerical and interaction logic. Cover known interior and escaping points, iteration limits, coordinate mapping, and zoom behavior. Name tests after the behavior they verify. For visual changes, record manual checks and include representative screenshots when useful.

## Commit & Pull Request Guidelines

Git is not in use yet, so there is no commit history or established pull request process. If version control is introduced, use focused commits with descriptive imperative subjects, such as `Add cursor-centered zoom`. Change descriptions should explain behavior, validation performed, and relevant limitations; link issues when available.

## Agent-Specific Instructions

Check existing files before editing and avoid inventing project tooling. For library, framework, SDK, API, CLI, or cloud-service documentation, use Context7: resolve the library ID first unless an exact ID is supplied, then query documentation for each distinct concept. This is unnecessary for general programming, business logic, or routine code review.
