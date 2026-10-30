# PC2 experimental producer

PC3/BI1.A1 also reuses this native control behind the actual application through `application-server.mjs` and `npm run dev:world`. The application binds localhost, guards Host/Origin, owns one client, initializes lazily and retires by full request identity. Its worker/physics composition entry is under `src/`; the application static handler continues to block private/test paths. Close/re-entry is explicit; abrupt-client expiry and multi-tab recovery are deferred. See `docs/superpowers/specs/2026-10-29-atlas-bi1-application-integration.md` and the PC3 card/r1 amendment.

This is the local native control for the PC2/WC2 prepared-world experiment. It is not an installed application backend. The spec, workload and acceptance limits live in `docs/superpowers/specs/2026-10-29-atlas-pc2-live-3d-coverage.md` and the PC2 card under `docs/reports/project1-interactive/`.

The wrapper uses the preserved BW1/PR8 mathematical sources, CuPy GPU evaluator, compiled Manifold/PyMartini mesh construction and canonical data under `/mnt/ml_storage/scratch`. It does not copy or modify those mathematical sources. The Python environment is `/mnt/ml_storage/scratch/venvs/gpu/bin/python`; dependency paths and output roots are explicit in the wrapper/controller. Recreating this dependency bundle on another host remains open.

`pc2-server.mjs` serves only the experimental fixture and allowed module paths on private port 5280. Preparation requests use PC1 JSON records. Native paths remain private; binary buffer roles and SHA-256 digests are checked on both sides. One active native job and two queued jobs are allowed. The browser prepares rendering and collision resources before granting readiness. Cancellation uses request identity when the browser has not yet learned a publication token.

Run from the PC2 worktree, with a fresh output directory for every attempt:

```sh
ATLAS_GPU_HANDOFF="Codex, recorded timestamp" DISPLAY=:10.0 \
TMPDIR=/mnt/ml_storage/scratch/atlas-1a-tmp \
flock -n /mnt/ml_storage/scratch/atlas-gpu.lock \
timeout --signal=TERM --kill-after=15s 600s \
node scripts/experiments/pc2.mjs full \
/mnt/ml_storage/scratch/atlas-pc2/browser-full-NEW
```

Modes are `smoke` (20 seconds), `full` (three 90-second flights plus the 20-second late control), `input` (actual keys/mouse/wheel, capped at 60 seconds of input including flight to the fine site) and `control` (20 seconds). Runs require headed installed Chrome, its sandbox, the recorded Vulkan profile and a discrete NVIDIA GPU. The existing policy certificate is a prerequisite, not a proof for every subsequently generated region.

After confirmed hardware cleanup, construct offline inputs and score the actual run:

```sh
node scripts/experiments/pc2-qualification-input.mjs RUN_ROOT browser.json
node scripts/experiments/pc2-score.mjs RUN_ROOT
```

The independent Python checks are `scripts/experiments/pc2-qualify.py RUN_ROOT` and `pc2-audit.py RUN_ROOT`. They run outside navigation timing. Because their immutable dependencies can initialize CUDA, use the same lock, handoff, scratch temporary directory and a bounded command. They test finite mathematical references, actual float32 collision triangles, contact prefixes, body samples at handoffs and recorded movement. Missing references stay explicit. Preserve all input/source hashes, failures and cleanup evidence. Never substitute these checks for headed hardware acceptance.

Other bounded controls are `pc2-native-smoke.mjs`, `pc2-reconstruction.mjs` (opposite order, resident reuse, actual rebuild and epoch rejection), and `pc2-region143-input.mjs` (the original BW1 completeness omission, with unchanged geometry/tolerance).
