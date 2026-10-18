# Project 0 — Space Backend Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the Project 0 qualification evidence, apply the approved decision procedure,
and report one of four outcomes:
- WebGPU selected;
- WebGL 2 selected;
- no-go;
- inconclusive.

The report also includes a separately reported precision experiment.

**Architecture:**
- **CPU side:** independent double-precision references, written by Codex, generate a frozen
  `fixtures.json` before any GPU code runs.
- **Browser side:** a disposable browser harness, written by Claude, runs bounded WebGPU compute
  workloads. Its timing-sensitive gate drivers run in the page.
- **Node side:** a Node Playwright runner owns the browser, the profile and evidence
  persistence. Pure evaluators recompute every gate from saved records, and `decision.js`
  applies the spec's procedure mechanically.

**Tech stack:**
- plain ES modules: browser `.js`, Node entry points `.mjs`;
- WGSL;
- the WebGPU API in installed Google Chrome 151;
- Playwright 1.59.1 (already a dev dependency);
- the Node 20 built-in test runner.

No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-project0-space-qualification-design.md` (rev 3.1),
governed by `docs/superpowers/specs/2026-10-18-atlas-workbench-charter.md`.

**Revision:** 2 (after Codex's blocking review, plan Round 3). **Authors:** Claude and Codex as peers, following the AGENTS.md/CLAUDE.md collaboration protocol.
The record is `docs/codesign/plan-log.md`.
- Codex drafted T1–T4.
- Claude drafted the header and the other tasks.
- Both reviewed the whole.

## Global Constraints

- **Disposable:** everything lives under `spikes/project0/`. Nothing in `src/`, the existing
  `tests/`, `scripts/`, `package.json` or `package-lock.json` changes. Plane is untouched.
- **Fixtures before GPU (spec §3, §11):**
  - `spikes/project0/fixtures.json` is committed (T4) **before any GPU device is requested or
    any shader runs**;
  - T0 may launch browsers but never calls `requestAdapter()` or `requestDevice()`;
  - changing a frozen fixture creates a new fixture version.
- **Gate logic before measurement:** the gate evaluators and the decision function (T1) are
  committed before any measurement code exists. A pass is computed by `gates.js` from saved
  records, never self-awarded by the page.
- **Browser and launch:**
  - installed Chrome via Playwright `channel: 'chrome'` with **`chromiumSandbox: true`**;
  - a fresh empty profile under `artifacts/runtime/project0-*` for every launch;
  - attempt-1 flags are exactly `--enable-gpu --use-angle=vulkan
    --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan`.
- **Never:**
  - disable the sandbox or GPU watchdogs;
  - change drivers, compositor settings or host packages, or run `apt`;
  - force a GPU reset.
- **Remediation:** at most **one documented remediation cycle per backend** (spec §6).
  `--enable-unsafe-webgpu` is admissible only inside that cycle and after diagnosis, and the
  report must state that the selection depends on it.
- **Bounded GPU work:** batches target about 10 ms, with **at most two outstanding**. Batch size
  is adjusted, never iterations, tolerance or resolution.
- **Clocks:** one page clock (`performance.now()`) for request, admission, completion and
  publication. Node timestamps are recorded separately and never subtracted across clock domains.
- **Evidence identity:** every record carries the fixture hash and freezing commit, the
  implementation revision, the backend, browser identity, effective launch command line and the
  timing method. Mixed, missing or truncated evidence never passes.
- **Storage:** scratch goes to `/mnt/ml_storage/scratch`, never `/tmp`, and processes run with
  `TMPDIR=artifacts/runtime`. Raw evidence goes to `artifacts/project0/` (git-ignored), compact
  summaries to `docs/reports/`.
- **Module types:** browser modules use `.js`, because `scripts/serve.mjs` serves `.mjs`
  without a JavaScript MIME type under `nosniff`. Browser code cannot live under a path
  containing `tests`, `scripts` or `artifacts`, which the server refuses.
- **Commit before GPU checks:** each task commits its peer-reviewed implementation *before*
  running any GPU check, because `implementationIdentity()` refuses uncommitted harness files.
  Evidence and interpretation are committed afterwards. Development checks keep the same
  clean-implementation requirement and are labelled development evidence (campaign `dev`),
  which never qualifies.
- **Whole files, no staged edits:** every code step gives a file's complete content. A file
  that a later task changes is given again in full. Gate drivers (`browser/drivers/<gate>.js`)
  and metric derivations (`measure/<group>.mjs`) are separate modules loaded through
  registries created once in T6, so later tasks add modules rather than edit earlier ones.
  Verification assembles the plan by taking the last full version of each file.
- **Module-relative URLs:** browser code fetches with `new URL(path, import.meta.url)` and
  checks `response.ok` before decoding.
- **Owned server:** Project 0 starts its own server on the dedicated port 5180 (`PORT` and
  `--port`). It never adopts an existing listener. An occupied port is reported without
  touching the listener.
- **Live aborts:** every GPU experiment installs a 5-second submission-progress watchdog and an
  unexpected-loss handler *before* submitting work. Node independently bounds browser
  responsiveness and total duration. Every stop finalises the available evidence as an explicit
  incomplete record.
- **Peer handoff (bridge):** Codex never commits.
  1. A Codex task runs as `codex_bridge.py run --mode new-worktree` from a named base commit.
  2. It returns `changes.patch` plus its test evidence.
  3. After the run ends, Claude reviews the patch, applies it in the primary checkout, re-runs
     the task's tests and commits it.
  4. Claude's changes get a Codex read-only review (`codex_bridge.py review --diff <base>`)
     before the task is marked complete.
  5. No edits to the primary checkout while any bridge run is active.
- **Logging:** every peer exchange is appended verbatim to
  `/mnt/ml_storage/scratch/atlas-codesign/plan-log.md` (execution exchanges included) and
  archived at milestones.

## Review Focus

Failure modes the gates do not isolate, most likely first. Each has a concrete test in its
owning task.
1. **Corrupted or mixed evidence produces a false pass:** a missing trial, a duplicate ID, a
   non-finite value, a truncated record, or mismatched fixture or environment identity. All of
   these must fail closed. *T1, T13.*
2. **A late completion crosses a device or generation boundary:** a delayed `mapAsync` or
   completion callback publishes, clears counters or releases resources that belong to the
   replacement job. *T7, T8.*
3. **Partial bands and byte-layout errors escape aggregate checks:** non-divisible ray counts,
   final short bands, padded `bytesPerRow`, and mixed source formats. Exact indices and byte
   offsets must be verified. *T6, T8.*
4. **The launcher attaches to the wrong server, or damages an unrelated process or profile:**
   - any listener on the port, including a foreign server that serves identical HTML with
     different modules;
   - a reused profile, including a warm shader cache that would falsify G2;
   - cleanup of a process it does not own.

   Each of these must be refused. *T0.*
5. **External interference silently changes the timing semantics:** a window that is hidden
   or unfocused at any moment of a trial (not only at its start and end), delayed timer
   issuance, a device-pixel ratio other than 1, or an unexpected canvas backing size. These
   produce explicit invalidation records, never quiet numbers. *T9.*

---
## Task overview

| Task | Deliverable | Owner | Depends on |
|---|---|---|---|
| T0 | Launcher, owned server on port 5180, fresh profiles, complete page entry, no-GPU preflight | Claude | — |
| T1 | Evidence contracts, metrics, gate evaluators, decision procedure | Codex | T0 |
| T2 | Independent arithmetic references, exact f32-range policy | Codex | T1 |
| T3 | CPU geometry, tracing, sensitivity screen, precision preparation | Codex | T2 |
| T4 | Fixture generation, audit, reproduction, **freeze commit** | Codex (generator), Claude (runs) | T0–T3 |
| T5 | Verified evidence identity, WebGPU device module, **first GPU run** (probe) | Claude | T4 |
| T6 | Allocator, watchdog, WGSL arithmetic/ray-list kernels, strict decoding, registries, runner; G3–G5 | Claude | T5 |
| T7 | Submission ledger, band planner, camera marcher, shading/coverage, lifetime-checked renderer | Claude | T6 |
| T8 | A.8 resource verification (G11); loss/recovery on real epochs (G13) | Claude | T7 |
| T9 | Timing drivers (G1, G2, G6–G10, G12), full-interval integrity, visible-output evidence | Claude | T7, T8 |
| T10 | Phased WebGPU campaign, strict manifest, coherence, reuse, single remediation cycle and closure | Claude runs; joint decisions | T1, T9 |
| T11 | *Conditional:* WebGL API mapping + backend interface; stop for the addendum | Joint | WebGPU unqualified after T10 |
| T12 | Precision experiment on the selected configuration | Claude (WGSL/driver); joint interpretation | backend selected |
| T13 | Report CLI that verifies and recomputes; joint review; user handoff | Joint | T10 (and T11/T12 as applicable) |

The plan implements WebGPU qualification and the fallback **planning boundary**; it does not contain the conditional WebGL implementation, which is a separately reviewed and user-approved addendum (T11).

**Planning-time verification (2026-10-18), recorded so reviewers know what has and has not been exercised:** every code file was extracted from this plan text (last full version per path), and all 87 Node tests pass against a **dry-run** `fixtures.json` generated by T4's generator in a scratch repository (351 s with eight workers; audit: 74 coverage frames, eligibility 3,972 / 3,684, no range crossings, no precision stop). All 65 modules resolve their imports. The WGSL guard algorithm matches T2's exact predicate on 300,105 vectors. **No GPU code has run**, as the spec requires before the freeze; All seven WGSL modules, each assembled exactly as the harness concatenates it at runtime (probe; fields+arithmetic; fields+trace; fields+trace+view; present; pattern; fields+trace+compensated), pass the offline `naga` 30.0.1 validator, which runs on the CPU with no device. Chrome's own compiler (Tint) can still differ, and T5–T7 surface any difference through `getCompilationInfo()`. `naga` is a planning-time check only, not a project dependency. The dry-run fixtures are not the frozen fixtures: T4 generates and freezes the real ones.

---

### Task T0: Launcher, owned server and environment preflight (no GPU device)

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).

**Files:**
- Create: `spikes/project0/launch.mjs`, the Node launcher. It provides the owned server on a
  dedicated port, fresh profiles, the Chrome launch and the effective command line.
- Create: `spikes/project0/preflight.mjs`, the T0 entry point.
- Create: `spikes/project0/index.html`, the harness page.
- Create: `spikes/project0/browser/main.js`, the page entry in its **final form**: it dispatches
  `preflight`, `probe` and `gate` modes to modules that later tasks add. A mode whose module
  does not exist yet reports a clean error.
- Test: `spikes/project0/tests/launch.test.mjs`.

**Interfaces:**
- Consumes: nothing.
- Produces (used by T5–T13):
  - `ROOT`, `ATTEMPT1_ARGS`, `HARNESS_PATH = '/spikes/project0/index.html'`, `PORT = 5180`;
  - `freshProfile(kind, opts?) → Promise<string>`, the absolute path of a new, empty
    `artifacts/runtime/project0-<kind>-<stamp>-<rand>`. It throws if the directory already
    exists or is not empty;
  - `startServer({port?, probeFn?, spawnFn?, startMs?, stopMs?}) → Promise<{url, stop()}>`.
    It throws `port <n> is in use` if anything listens on the port, and never adopts a
    listener. It spawns `scripts/serve.mjs` with both `PORT` in the environment and `--port`.
    `stop()` sends SIGTERM, waits up to `stopMs` for the exit, then sends SIGKILL and waits;
  - `launchChrome({headless, args?, profileKind, chromium}) → Promise<{context, profile, requestedArgs, headless}>`.
    It uses `channel: 'chrome'`, `chromiumSandbox: true`, viewport 1280 × 720 and
    `deviceScaleFactor: 1`;
  - `effectiveCommandLine(context) → Promise<string>`, read from `chrome://version`;
  - `assertSandboxed(commandLine) → void`.
- Page contract: when a mode completes, `browser/main.js` sets `window.p0Result` to either
  `{slots, invalidations}` or `{error}`.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/launch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { ROOT, PORT, freshProfile, startServer, assertSandboxed, ATTEMPT1_ARGS } from '../launch.mjs';

async function scratchRoot() {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  return mkdtemp(join(base, 'p0-launch-test-'));
}
function fakeChild({ exitOnTerm = true } = {}) {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), signals: [], exitCode: null });
  child.kill = sig => { child.signals.push(sig); if (sig === 'SIGKILL' || exitOnTerm) setImmediate(() => { child.exitCode = 0; child.emit('exit', 0); }); };
  return child;
}

test('attempt-1 flags are exactly the documented Vulkan set, and the port is dedicated', () => {
  assert.deepEqual([...ATTEMPT1_ARGS], ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']);
  assert.equal(PORT, 5180);
});

test('freshProfile creates a new empty directory and refuses to reuse one', async () => {
  const root = await scratchRoot();
  try {
    const fixed = { root, now: () => new Date('2026-10-18T00:00:00Z'), rand: () => 'abcd' };
    const dir = await freshProfile('headed', fixed);
    assert.ok(dir.startsWith(resolve(root, 'artifacts/runtime/project0-headed-')));
    assert.deepEqual(await readdir(dir), []);
    await assert.rejects(freshProfile('headed', fixed), /profile already exists/);
    await assert.rejects(freshProfile('../evil', fixed), /invalid profile kind/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an occupied port is refused — even a foreign server serving identical HTML — and nothing is spawned', async () => {
  let spawned = false;
  await assert.rejects(startServer({ probeFn: async () => true, spawnFn: () => { spawned = true; } }), /port 5180 is in use/);
  assert.equal(spawned, false);
});

test('the owned server gets PORT in its environment and --port, and stop() awaits its exit', async () => {
  const child = fakeChild(); let seen;
  const spawnFn = (cmd, args, opts) => { seen = { args, env: opts.env }; setImmediate(() => child.stdout.emit('data', 'ATLAS is ready')); return child; };
  const server = await startServer({ probeFn: async () => false, spawnFn });
  assert.deepEqual(seen.args, ['scripts/serve.mjs', '--port', '5180']); assert.equal(seen.env.PORT, '5180');
  assert.equal(server.url, 'http://127.0.0.1:5180');
  await server.stop();
  assert.deepEqual(child.signals, ['SIGTERM']); assert.equal(child.exitCode, 0);
});

test('stop() escalates to SIGKILL when the server ignores SIGTERM', async () => {
  const child = fakeChild({ exitOnTerm: false });
  const server = await startServer({ probeFn: async () => false, spawnFn: () => { setImmediate(() => child.stdout.emit('data', 'ready')); return child; }, stopMs: 50 });
  await server.stop();
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
});

test('a server that never becomes ready is killed and reported', async () => {
  const child = fakeChild();
  await assert.rejects(startServer({ probeFn: async () => false, spawnFn: () => child, startMs: 50 }), /did not become ready/);
  assert.deepEqual(child.signals, ['SIGTERM']);
});

test('assertSandboxed rejects a command line without the sandbox or watchdog', () => {
  assert.doesNotThrow(() => assertSandboxed('/opt/google/chrome/chrome --enable-gpu --use-angle=vulkan'));
  assert.throws(() => assertSandboxed('/opt/google/chrome/chrome --no-sandbox --enable-gpu'), /sandbox/);
  assert.throws(() => assertSandboxed('chrome --disable-gpu-watchdog'), /watchdog/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/launch.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/launch.mjs`.

- [ ] **Step 3: Implement `launch.mjs`**

```js
// spikes/project0/launch.mjs — Node-side launcher. Never requests a GPU adapter or device.
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ATTEMPT1_ARGS = Object.freeze(['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']);
export const HARNESS_PATH = '/spikes/project0/index.html';
export const PORT = 5180;

export async function freshProfile(kind, { root = ROOT, now = () => new Date(), rand = () => randomBytes(4).toString('hex') } = {}) {
  if (!/^[a-z0-9-]+$/.test(kind)) throw new Error(`invalid profile kind: ${kind}`);
  const base = resolve(root, 'artifacts/runtime');
  await mkdir(base, { recursive: true });
  const dir = join(base, `project0-${kind}-${now().toISOString().replace(/[-:.]/g, '')}-${rand()}`);
  try { await mkdir(dir); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`profile already exists: ${dir}`);
    throw error;
  }
  if ((await readdir(dir)).length) throw new Error(`profile not empty: ${dir}`);
  return dir;
}

// true if something accepts TCP connections on 127.0.0.1:port.
export const portInUse = port => new Promise(done => {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); done(true); });
  socket.once('error', () => done(false));
});

const exited = (child, ms) => new Promise(done => {
  if (child.exitCode !== null) return done(true);
  const timer = setTimeout(() => done(false), ms);
  child.once('exit', () => { clearTimeout(timer); done(true); });
});

export async function startServer({ port = PORT, probeFn = portInUse, spawnFn = nodeSpawn, root = ROOT, startMs = 10000, stopMs = 5000 } = {}) {
  if (await probeFn(port)) throw new Error(`port ${port} is in use; Project 0 never adopts an existing listener`);
  const child = spawnFn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = async () => {
    child.kill('SIGTERM');
    if (!(await exited(child, stopMs))) { child.kill('SIGKILL'); await exited(child, stopMs); }
  };
  const ready = await new Promise(done => {
    const timer = setTimeout(() => done(false), startMs);
    child.stdout.once('data', () => { clearTimeout(timer); done(true); });
    child.once?.('error', () => { clearTimeout(timer); done(false); });
    child.once?.('exit', () => { clearTimeout(timer); done(false); });
  });
  if (!ready) { await stop(); throw new Error(`owned server on port ${port} did not become ready within ${startMs} ms`); }
  return { url: `http://127.0.0.1:${port}`, stop };
}

export async function launchChrome({ headless, args = ATTEMPT1_ARGS, profileKind, chromium }) {
  const profile = await freshProfile(profileKind);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', chromiumSandbox: true, headless, args: [...args],
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, timeout: 30000,
  });
  return { context, profile, requestedArgs: [...args], headless };
}

export async function effectiveCommandLine(context) {
  const page = await context.newPage();
  try { await page.goto('chrome://version'); return await page.locator('#command_line').innerText(); }
  finally { await page.close(); }
}

export function assertSandboxed(commandLine) {
  if (/(^|\s)--no-sandbox(\s|$)/.test(commandLine)) throw new Error('Chrome launched without its sandbox');
  if (/--disable-gpu-watchdog/.test(commandLine)) throw new Error('Chrome launched with the GPU watchdog disabled');
}
```

- [ ] **Step 4: Create the harness page and the final page entry**

```html
<!-- spikes/project0/index.html -->
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>ATLAS Project 0 harness</title>
<style>html,body{margin:0;background:#050508;color:#ccd;font:13px system-ui}#status{position:fixed;left:8px;top:8px}canvas{display:block;width:1280px;height:720px}</style>
<div id="status">loading…</div>
<canvas id="view" width="1280" height="720"></canvas>
<script type="module" src="./browser/main.js"></script>
</html>
```

```js
// spikes/project0/browser/main.js — page entry. Dispatches by ?mode=; never touches navigator.gpu in preflight.
// Every mode ends by setting window.p0Result = {slots, invalidations} | {error}. Gate modes start at module
// evaluation, with no Node round-trip, so G2 measures from navigation start.
const params = new URLSearchParams(location.search);
const status = document.getElementById('status');
const say = text => { status.textContent = text; };
const mode = params.get('mode');
const finish = result => { window.p0Result = result; say(`${mode}: ${result.error ? 'error' : 'done'}`); };
const fail = error => finish({ error: `${error.name}: ${error.message}` });

async function loadFixtures() {
  const response = await fetch(new URL('../fixtures.json', import.meta.url));
  if (!response.ok) throw new Error(`fixtures.json: HTTP ${response.status}`);
  return response.json();
}

if (mode === 'preflight') {
  finish({ slots: [{ slot: 'environment', raw: { isSecureContext, hasGpuObject: 'gpu' in navigator, userAgent: navigator.userAgent, devicePixelRatio, inner: [innerWidth, innerHeight], visibility: document.visibilityState } }], invalidations: [] });
} else if (mode === 'probe') {
  import('./probe.js').then(m => m.runProbe(params, say)).then(finish, fail);                                   // T5
} else if (mode === 'gate') {
  Promise.all([loadFixtures(), import('./drivers/index.js')])                                                    // T6
    .then(([fixtures, drivers]) => drivers.runGateDriver(params.get('gate'), fixtures, params, say)).then(finish, fail);
} else {
  fail(new Error(`unknown mode ${mode}`));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/launch.test.mjs`
Expected: PASS, `# pass 7`, `# fail 0`.

- [ ] **Step 6: Write the preflight entry point**

```js
// spikes/project0/preflight.mjs — environment preflight. No adapter, no device, no shaders.
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, HARNESS_PATH, startServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';

process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
const record = { kind: 'preflight', at: new Date().toISOString(), node: process.version, checks: [] };
let failed = false, server;
try {
  record.playwright = createRequire(import.meta.url)('playwright/package.json').version;
  record.chrome = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
  server = await startServer();
  const js = await fetch(`${server.url}/spikes/project0/browser/main.js`);
  record.checks.push({ name: 'module-mime', status: js.status, contentType: js.headers.get('content-type') });
  if (!js.ok || !/^text\/javascript/.test(js.headers.get('content-type') || '')) failed = true;
  for (const headless of [false, true]) {
    let launched;
    try {
      launched = await launchChrome({ headless, profileKind: headless ? 'preflight-headless' : 'preflight-headed', chromium });
      const commandLine = await effectiveCommandLine(launched.context);
      assertSandboxed(commandLine);
      const page = await launched.context.newPage();
      await page.goto(`${server.url}${HARNESS_PATH}?mode=preflight`);
      const result = await page.waitForFunction(() => window.p0Result, null, { timeout: 30000 }).then(h => h.jsonValue());
      const env = result.slots[0].raw;
      record.checks.push({ name: headless ? 'headless' : 'headed', profile: launched.profile, requestedArgs: launched.requestedArgs, commandLine, env });
      if (!env.isSecureContext || env.devicePixelRatio !== 1) failed = true;
    } finally { await launched?.context.close(); }
  }
} catch (error) { record.error = error.message; failed = true; }
finally { await server?.stop(); }
const dir = resolve(ROOT, 'artifacts/project0/preflight');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, `${record.at.replace(/[-:.]/g, '')}.json`), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record.checks.map(c => ({ name: c.name, ...(c.env ? { hasGpuObject: c.env.hasGpuObject, secure: c.env.isSecureContext } : { contentType: c.contentType }) })), null, 2));
if (failed) { console.error(`PREFLIGHT FAILED${record.error ? `: ${record.error}` : ''}`); process.exitCode = 1; } else console.log('PREFLIGHT OK');
```

- [ ] **Step 7: Commit** (Claude, after Codex's read-only review of the diff)

```bash
git add spikes/project0/launch.mjs spikes/project0/preflight.mjs spikes/project0/index.html spikes/project0/browser/main.js spikes/project0/tests/launch.test.mjs
git commit -m "Project 0 T0: owned-server launcher, fresh profiles, sandbox check and no-GPU preflight"
```

- [ ] **Step 8: Run the preflight**

Run: `node spikes/project0/preflight.mjs`
Expected:
- `PREFLIGHT OK`;
- a `module-mime` entry with `text/javascript`;
- `headed` and `headless` entries with `secure: true`;
- a record under `artifacts/project0/preflight/`.

`hasGpuObject` is information for T5, not a pass or fail.

If the output is `port 5180 is in use`, stop and report: Project 0 does not touch other
listeners. If Chrome cannot launch under the available permissions, stop: that is evidence for
an *inconclusive* outcome.

---

### Task T1: Evidence contracts, metrics, gate evaluators and selection

**Owner:** Codex (bridge `run --mode new-worktree`; patch reviewed, applied and committed by Claude).

**Dependencies:** T0’s environment preflight. No browser device acquisition or GPU execution.

**Files:**

- Create `spikes/project0/contract.js`
- Create `spikes/project0/metrics.js`
- Create `spikes/project0/gates.js`
- Create `spikes/project0/decision.js`
- Create `spikes/project0/tests/contract.test.mjs`

**Interfaces:**

- `canonical(value) → string`: deterministic JSON; rejects undefined and nonfinite numbers.
- `percentile(values, p) → number`: nearest-rank percentile.
- `compareArithmetic(expected, actual, tolerances) → metrics`.
- `compareRays(expected, actual, L) → metrics`.
- `throughput(publications, start, end) → metrics`.
- `coverageValid(name, counts) → boolean`.
- `gatePlan(fixtures) → { [gate]: { [slot]: rules } }`.
- `evaluateGate(gate, records, manifest, fixtures) → { gate, status, reasons, evidenceIds }`.
- `decideBackends(webgpu, webgl = null) → { outcome, next }`.

A measurement record has this shape:

```js
{
  schema: 1,
  id: 'unique-trial-id',
  gate: 'G6',
  slot: 'bulb-overview/0',
  identity: {
    backend: 'webgpu',
    fixtureHash: '64 lowercase hexadecimal characters',
    fixtureCommit: '40 lowercase hexadecimal characters',
    specHash: '64 lowercase hexadecimal characters',
    implementationCommit: '40 lowercase hexadecimal characters',
    implementationHash: '64 lowercase hexadecimal characters',
    launchHash: '64 lowercase hexadecimal characters',
    browserVersion: 'recorded installed Chrome version',
    browserExecutable: 'recorded executable path',
    driver: 'recorded driver identity',
    session: 'recorded session identity',
    mode: 'headed'
  },
  invalidations: [],
  artifacts: [{ path: 'run-relative raw evidence path', sha256: '64 lowercase hexadecimal characters' }],
  metrics: {}
}
```

The strings above describe the interface; the executable tests below use concrete values.

`manifest.fixture` contains `fixtureHash`, `fixtureCommit` and `specHash`. `manifest.trials["gate/slot"]` contains the selected record’s `id` and complete `identity`.

The metrics returned by `gatePlan()` are the exact required metric names. T9 computes them from recorded events and readbacks. T13 verifies artifact hashes and recomputes summaries from those artifacts before calling the evaluators. Browser-side “passed” flags are not evidence.

Unknown hardware identity, external interference, incomplete observations and invalid coverage produce `invalid/inconclusive`. A measured threshold violation produces `fail`.

- [ ] **Step 1: Create the failing contract tests.**

Create `spikes/project0/tests/contract.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES, canonical } from '../contract.js';
import {
  percentile, throughput, compareArithmetic, compareRays, coverageValid
} from '../metrics.js';
import { evaluateGate } from '../gates.js';
import { decideBackends } from '../decision.js';

const fixtures = {
  analytic: {
    sphere: { rays: Array(625) },
    box: { rays: Array(651) },
    'menger-1': { rays: Array(1681) },
    'menger-2': { rays: Array(1681) }
  },
  arithmetic: {
    bulb: Array.from({ length: 4096 }, () => ({ eligible: true })),
    plane: Array.from({ length: 4096 }, () => ({ eligible: true }))
  }
};

function throughputEvidence() {
  const identity = {
    backend: 'webgpu',
    fixtureHash: 'a'.repeat(64),
    fixtureCommit: 'b'.repeat(40),
    specHash: 'c'.repeat(64),
    implementationCommit: 'd'.repeat(40),
    implementationHash: 'e'.repeat(64),
    launchHash: 'f'.repeat(64),
    browserVersion: 'test-browser',
    browserExecutable: '/test/chrome',
    driver: 'test-driver',
    session: 'test-session',
    mode: 'headed'
  };
  const manifest = {
    fixture: {
      fixtureHash: identity.fixtureHash,
      fixtureCommit: identity.fixtureCommit,
      specHash: identity.specHash
    },
    trials: {}
  };
  const records = [];
  for (const name of [
    'bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'
  ]) {
    for (let trial = 0; trial < 3; trial++) {
      const slot = `${name}/${trial}`;
      const id = `G6-${records.length}`;
      manifest.trials[`G6/${slot}`] = { id, identity };
      records.push({
        schema: 1, id, gate: 'G6', slot, identity,
        invalidations: [],
        artifacts: [{ path: `${id}.json`, sha256: '1'.repeat(64) }],
        metrics: {
          windowMs: 30000,
          published: 900,
          intervalP95: 50,
          pendingMax: 1,
          coverageErrors: 0,
          outstandingMax: 2
        }
      });
    }
  }
  return { records, manifest };
}

test('nearest rank and G6 count completed distinct publications', () => {
  assert.equal(percentile(Array.from({ length: 20 }, (_, i) => i + 1), .95), 19);
  const rows = Array.from({ length: 900 }, (_, i) => ({
    id: i, time: i * 1000 / 30
  }));
  const result = throughput(rows, 0, 30000);
  assert.equal(result.published, 900);
  assert.ok(result.intervalP95 < 34);
  assert.throws(() => throughput([...rows, rows[0]], 0, 30000), /duplicate/);
  assert.throws(() => canonical({ value: NaN }), /nonfinite/);
});

test('arithmetic exclusions and analytic edge cases keep separate semantics', () => {
  const expected = [
    {
      id: 0, eligible: true,
      reference: { status: 'escaped', index: 2, logR: 2, de: .25 }
    },
    {
      id: 1, eligible: false,
      reference: { status: 'budget', index: null }
    }
  ];
  const actual = [
    { id: 0, status: 'escaped', index: 2, logR: 2, de: .25 },
    { id: 1, status: 'failure', index: null }
  ];
  const comparison = compareArithmetic(expected, actual, { logR: 1e-4, de: 1e-3 });
  assert.equal(comparison.eligible, 1);
  assert.equal(comparison.diagnostics, 1);
  assert.equal(comparison.statusErrors, 0);
  actual[0].index = 3;
  assert.equal(compareArithmetic(expected, actual, { logR: 1e-4 }).indexErrors, 1);

  const rays = [{
    id: 0, reference: { status: 'miss', t: null, excluded: true }
  }];
  assert.equal(compareRays(rays, [{
    id: 0, status: 'unresolved', reason: 'steps', t: null
  }], 1).edgeErrors, 0);
  assert.equal(compareRays(rays, [{
    id: 0, status: 'failure', t: null
  }], 1).edgeErrors, 1);
});

test('coverage cannot pass an empty, incomplete or failed image', () => {
  const counts = { total: 100, hit: 28, miss: 72, point: 0, steps: 0, failure: 0 };
  assert.equal(coverageValid('bulb-overview', counts), true);
  assert.equal(coverageValid('bulb-overview', { ...counts, hit: 0, miss: 100 }), false);
  assert.equal(coverageValid('bulb-overview', { ...counts, failure: 1 }), false);
  assert.equal(coverageValid('sphere', {
    total: 100, hit: 10, miss: 89, point: 0, steps: 1, failure: 0
  }), false);
});

test('gate evaluation rejects missing, mixed, duplicate and invalid evidence', () => {
  const { records, manifest } = throughputEvidence();
  const evaluate = rows => evaluateGate('G6', rows, manifest, fixtures).status;
  assert.equal(evaluate(records), 'pass');

  records[0].metrics.published = 899;
  assert.equal(evaluate(records), 'fail');
  records[0].metrics.published = 900;

  assert.equal(evaluate(records.slice(1)), 'invalid/inconclusive');
  assert.equal(evaluate([...records, records[0]]), 'invalid/inconclusive');

  const mixed = structuredClone(records);
  mixed[0].identity.fixtureHash = '9'.repeat(64);
  assert.equal(evaluate(mixed), 'invalid/inconclusive');

  const corrupt = structuredClone(records);
  corrupt[0].metrics.intervalP95 = NaN;
  assert.equal(evaluate(corrupt), 'invalid/inconclusive');

  const wrongCoverage = structuredClone(records);
  wrongCoverage[0].metrics.coverageErrors = 1;
  assert.equal(evaluate(wrongCoverage), 'invalid/inconclusive');
});

test('selection cannot turn missing evidence into backend failure', () => {
  const passing = {
    remediationClosed: false,
    gates: Object.fromEntries(GATES.map(g => [g, { status: 'pass' }]))
  };
  assert.equal(decideBackends(passing).outcome, 'WebGPU selected');

  const failed = structuredClone(passing);
  failed.gates.G8 = { status: 'fail' };
  failed.remediationClosed = true;
  assert.equal(decideBackends(failed).outcome, 'inconclusive');
  assert.equal(decideBackends(failed, passing).outcome, 'WebGL 2 selected');
  assert.equal(decideBackends(failed, failed).outcome, 'no-go');

  const incomplete = structuredClone(failed);
  incomplete.gates.G12 = { status: 'invalid/inconclusive' };
  assert.equal(decideBackends(incomplete, failed).outcome, 'inconclusive');

  const stopped = structuredClone(failed);
  stopped.gates.G12 = {
    status: 'not run', blockedBy: 'G8', reason: 'Stopped after the measured failure'
  };
  assert.equal(decideBackends(stopped, failed).outcome, 'no-go');
});

test('unknown statuses are invalid even for excluded samples', () => {
  const arithmetic = [{
    id: 0,
    eligible: false,
    reference: { status: 'budget', index: null }
  }];
  assert.throws(
    () => compareArithmetic(arithmetic, [{ id: 0, status: 'typo' }], {}),
    /unknown arithmetic status/
  );

  const rays = [{
    id: 0,
    reference: { status: 'miss', t: null, excluded: true }
  }];
  assert.throws(
    () => compareRays(rays, [{ id: 0, status: 'typo' }], 1),
    /unknown ray status/
  );
  assert.throws(
    () => compareRays(rays, [{
      id: 0, status: 'unresolved', reason: 'typo'
    }], 1),
    /unknown unresolved reason/
  );
});
```

- [ ] **Step 2: Verify the tests fail because the implementation is absent.**

Run:

```bash
node --test spikes/project0/tests/contract.test.mjs
```

Expected: nonzero exit with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/contract.js`.

- [ ] **Step 3: Implement record validation and deterministic serialization.**

Create `spikes/project0/contract.js`:

```js
export const GATES = Array.from({ length: 13 }, (_, i) => `G${i + 1}`);

export function canonical(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('nonfinite JSON number');
  }
  if (value === undefined) throw new TypeError('undefined JSON value');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(
    key => `${JSON.stringify(key)}:${canonical(value[key])}`
  ).join(',')}}`;
}

function validateIdentity(identity) {
  const hex64 = /^[a-f0-9]{64}$/;
  const hex40 = /^[a-f0-9]{40}$/;
  for (const key of ['fixtureHash', 'specHash', 'implementationHash', 'launchHash']) {
    if (!hex64.test(identity[key])) throw new Error(`invalid ${key}`);
  }
  for (const key of ['fixtureCommit', 'implementationCommit']) {
    if (!hex40.test(identity[key])) throw new Error(`invalid ${key}`);
  }
  for (const key of ['browserVersion', 'browserExecutable', 'driver', 'session']) {
    if (typeof identity[key] !== 'string' || !identity[key]) {
      throw new Error(`missing ${key}`);
    }
  }
  if (!['headed', 'headless'].includes(identity.mode)) throw new Error('invalid mode');
  if (!['webgpu', 'webgl2'].includes(identity.backend)) throw new Error('invalid backend');
}

export function validateRecords(records, manifest, plan) {
  const ids = new Set();
  const slots = new Set();
  for (const row of records) {
    if (row.schema !== 1 || typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
      throw new Error('record identity');
    }
    ids.add(row.id);

    const key = `${row.gate}/${row.slot}`;
    const expected = plan[row.gate]?.[row.slot];
    if (!expected || slots.has(key)) throw new Error('trial identity');
    slots.add(key);

    validateIdentity(row.identity);
    const selected = manifest.trials[key];
    if (
      !selected ||
      row.id !== selected.id ||
      canonical(row.identity) !== canonical(selected.identity) ||
      ['fixtureHash', 'fixtureCommit', 'specHash'].some(
        field => row.identity[field] !== manifest.fixture[field]
      )
    ) {
      throw new Error('mixed evidence identity');
    }

    if (
      !Array.isArray(row.invalidations) ||
      row.invalidations.some(reason => typeof reason !== 'string' || !reason) ||
      !Array.isArray(row.artifacts) ||
      row.artifacts.length === 0
    ) {
      throw new Error('missing evidence');
    }
    if (row.artifacts.some(
      artifact => typeof artifact.path !== 'string' ||
        !artifact.path ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256)
    )) {
      throw new Error('artifact identity');
    }

    if (
      canonical(Object.keys(row.metrics).sort()) !==
        canonical(Object.keys(expected).sort()) ||
      Object.values(row.metrics).some(value => !Number.isFinite(value) || value < 0)
    ) {
      throw new Error('invalid metrics');
    }
  }
}

export const ARITH_STATUS = Object.freeze(['escaped', 'budget', 'failure']);
export const RAY_STATUS = Object.freeze(['hit', 'miss', 'unresolved', 'failure']);
export const UNRESOLVED_REASON = Object.freeze(['point', 'steps']);

export function assertArithmeticStatus(row) {
  if (!ARITH_STATUS.includes(row?.status)) {
    throw new TypeError('unknown arithmetic status');
  }
}

export function assertRayStatus(row) {
  if (!RAY_STATUS.includes(row?.status)) {
    throw new TypeError('unknown ray status');
  }
  if (
    row.status === 'unresolved' &&
    !UNRESOLVED_REASON.includes(row.reason)
  ) {
    throw new TypeError('unknown unresolved reason');
  }
  if (row.status !== 'unresolved' && row.reason != null) {
    throw new TypeError('reason on resolved or failed ray');
  }
}
```

- [ ] **Step 4: Implement the pure measurement reductions.**

Create `spikes/project0/metrics.js`:

```js
import {
  assertArithmeticStatus,
  assertRayStatus
} from './contract.js';

export function percentile(values, p) {
  if (
    !values.length || !(p > 0 && p <= 1) ||
    values.some(value => !Number.isFinite(value))
  ) {
    throw new TypeError('finite nonempty sample and percentile in (0,1] required');
  }
  return [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1];
}

export function ratio(actual, reference, tolerance) {
  if (!Number.isFinite(actual)) return Number.MAX_VALUE;
  if (tolerance === 0) return actual === reference ? 0 : Number.MAX_VALUE;
  return Math.min(Number.MAX_VALUE, Math.abs(actual - reference) / tolerance);
}

export function compareArithmetic(expected, actual, tolerances) {
for (const row of actual) assertArithmeticStatus(row);
for (const row of expected) assertArithmeticStatus(row.reference);
  const ids = new Set(actual.map(row => row.id));
  if (
    ids.size !== actual.length || actual.length !== expected.length ||
    expected.some(row => !ids.has(row.id))
  ) {
    throw new Error('arithmetic sample identity mismatch');
  }
  const byId = new Map(actual.map(row => [row.id, row]));
  const result = {
    samples: actual.length, eligible: 0, diagnostics: 0,
    statusErrors: 0, indexErrors: 0
  };
  for (const key of Object.keys(tolerances)) result[`${key}Ratio`] = 0;

  for (const sample of expected) {
    const got = byId.get(sample.id);
    const ref = sample.reference;
    if (!sample.eligible) {
      result.diagnostics++;
      continue;
    }
    result.eligible++;
    result.statusErrors += Number(got.status !== ref.status);
    result.indexErrors += Number(got.index !== ref.index);
    if (got.status === 'escaped' && ref.status === 'escaped') {
      for (const [key, rtol] of Object.entries(tolerances)) {
        result[`${key}Ratio`] = Math.max(
          result[`${key}Ratio`],
          ratio(got[key], ref[key], rtol * Math.abs(ref[key]))
        );
      }
    }
  }
  return result;
}

export function compareRays(expected, actual, L) {
for (const row of actual) assertRayStatus(row);
for (const row of expected) assertRayStatus(row.reference);
  const byId = new Map(actual.map(row => [row.id, row]));
  if (
    byId.size !== actual.length || actual.length !== expected.length ||
    expected.some(row => !byId.has(row.id))
  ) {
    throw new Error('ray identity mismatch');
  }
  const result = { rays: actual.length, statusErrors: 0, edgeErrors: 0, depthRatio: 0 };
  for (const ray of expected) {
    const got = byId.get(ray.id);
    const ref = ray.reference;
    if (ref.excluded) {
      result.edgeErrors += Number(
        !['hit', 'miss'].includes(got.status) &&
        !(got.status === 'unresolved' && got.reason === 'steps')
      );
    } else {
      result.statusErrors += Number(got.status !== ref.status);
      if (got.status === 'hit' && ref.status === 'hit') {
        result.depthRatio = Math.max(
          result.depthRatio, ratio(got.t, ref.t, 1e-4 * L)
        );
      }
    }
  }
  return result;
}

export function throughput(publications, start, end) {
  if (end - start !== 30000) throw new Error('G6 window must be 30000 ms');
  if (publications.some(row => !Number.isFinite(row.time))) {
    throw new Error('invalid publication time');
  }
  if (new Set(publications.map(row => row.id)).size !== publications.length) {
    throw new Error('duplicate publication');
  }
  const rows = publications.filter(row => row.time >= start && row.time < end);
  if (rows.some((row, i) => i > 0 && row.time <= rows[i - 1].time)) {
    throw new Error('publication order');
  }
  return {
    windowMs: end - start,
    published: rows.length,
    intervalP95: rows.length > 1
      ? percentile(rows.slice(1).map((row, i) => row.time - rows[i].time), .95)
      : Number.MAX_VALUE
  };
}

export function coverageValid(name, counts) {
  const keys = ['hit', 'miss', 'point', 'steps', 'failure'];
  if (
    keys.some(key => !Number.isInteger(counts[key]) || counts[key] < 0) ||
    keys.reduce((sum, key) => sum + counts[key], 0) !== counts.total ||
    !(counts.total > 0) ||
    counts.failure !== 0
  ) {
    return false;
  }
  if (name === 'bulb-stress') return counts.steps / counts.total >= .40;
  const hit = counts.hit / counts.total;
  const unresolved = (counts.point + counts.steps) / counts.total;
  if (name === 'sphere') return counts.hit > 0 && unresolved === 0;
  if (name === 'bulb-overview') {
    return hit >= .20 && hit <= .36 && unresolved <= .02;
  }
  if (['bulb-detail-0.05', 'bulb-detail-0.005'].includes(name)) {
    return hit >= .95 && unresolved <= .02;
  }
  throw new Error(`unknown coverage fixture: ${name}`);
}
```

- [ ] **Step 5: Encode all gate slots and thresholds before measurement code exists.**

Create `spikes/project0/gates.js`:

```js
import { validateRecords } from './contract.js';

const eq = value => ['eq', value];
const le = value => ['le', value];
const ge = value => ['ge', value];
const range = (low, high) => ['range', low, high];

export function gatePlan(fixtures) {
  const plan = Object.fromEntries(
    Array.from({ length: 13 }, (_, i) => [`G${i + 1}`, {}])
  );
  const add = (gate, slot, rules) => { plan[gate][slot] = rules; };
  const views = ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'];
  const frame = { coverageErrors: eq(0), outstandingMax: le(2) };

  for (const mode of ['headed', 'headless']) {
    add('G1', mode, { nvidia: eq(1), software: eq(0), corroborated: eq(1) });
  }
  for (let i = 0; i < 3; i++) {
    add('G2', `fresh-${i}`, {
      navigationMs: range(0, 10000),
      emptyProfile: eq(1),
      freshProcess: eq(1),
      preparationVisible: eq(1),
      ...frame
    });
  }
  add('G2', 'warm', {
    navigationMs: ge(0), preparationVisible: eq(1), ...frame
  });

  for (const [name, fixture] of Object.entries(fixtures.analytic)) {
    add('G3', name, {
      rays: eq(fixture.rays.length),
      statusErrors: eq(0), edgeErrors: eq(0), depthRatio: range(0, 1)
    });
  }

  function arithmetic(gate, name, samples, compareDE) {
    const eligible = samples.filter(sample => sample.eligible).length;
    if (samples.length !== 4096 || eligible < .8 * 4096) {
      throw new Error(`invalid frozen arithmetic fixture: ${name}`);
    }
    add(gate, name, {
      samples: eq(4096), eligible: eq(eligible), diagnostics: eq(4096 - eligible),
      statusErrors: eq(0), indexErrors: eq(0), logRRatio: range(0, 1),
      ...(compareDE ? { deRatio: range(0, 1) } : {})
    });
  }
  arithmetic('G4', 'bulb-samples', fixtures.arithmetic.bulb, true);
  arithmetic('G5', 'qjulia-plane', fixtures.arithmetic.plane, false);
  add('G5', 'qjulia-offplane', {
    components: eq(32), componentRatio: range(0, 1)
  });

  for (const name of views) {
    for (let i = 0; i < 3; i++) {
      add('G6', `${name}/${i}`, {
        windowMs: eq(30000), published: ge(900), intervalP95: range(0, 50),
        pendingMax: le(1), ...frame
      });
    }
    add('G10', name, {
      elapsedMs: range(0, 2000), prepared: eq(1), ...frame
    });
  }
  for (let i = 0; i < 3; i++) {
    add('G7', String(i), {
      requests: eq(400), finals: eq(20), latencyP95: range(0, 100), ...frame
    });
  }
  for (let i = 0; i < 10; i++) {
    add('G8', String(i), {
      stressSubmitted: eq(1), latencyMs: range(0, 250),
      stalePublications: eq(0), ...frame
    });
  }

  add('G9', 'warmed', {
    windows: eq(12), applicationOver50: eq(0),
    unattributedOver50: eq(0), harnessRecorded: eq(1)
  });
  add('G11', '4k', {
    tableBytes: eq(405995520),
    peakBytes: range(405995520, 2 ** 30),
    texturesWritten: eq(7), selectedChecks: eq(63), mismatches: eq(0),
    fullBandBytes: eq(3932160), cancelled: eq(1), released: eq(1),
    outstandingMax: le(2)
  });
  add('G12', 'sequence', {
    cycles: eq(60), wallMs: ge(600000), deadlineMisses: eq(0),
    unhandled: eq(0), unplannedLosses: eq(0),
    countDifferences: eq(0), byteRelativeDifference: range(0, .01),
    baselinePrepared: eq(1), returned1280: eq(1),
    outstandingMax: le(2)
  });
  for (const type of ['intentional', 'injected']) {
    add('G13', type, {
      interrupted: eq(1), successes: eq(0), requestPreserved: eq(1),
      latePublications: eq(0), validRecovery: eq(1)
    });
  }
  add('G13', 'repeated', { automaticRetriesAfterRepeat: eq(0) });
  return plan;
}

export function evaluateGate(gate, records, manifest, fixtures) {
  const evidenceIds = records.filter(row => row.gate === gate).map(row => row.id);
  let plan;
  try {
    plan = gatePlan(fixtures);
    validateRecords(records, manifest, plan);
  } catch (error) {
    return {
      gate, status: 'invalid/inconclusive',
      reasons: [error.message], evidenceIds
    };
  }

  const rows = records.filter(row => row.gate === gate);
  const expected = plan[gate];
  if (!expected || rows.length !== Object.keys(expected).length) {
    return {
      gate, status: 'invalid/inconclusive',
      reasons: ['missing required trials'], evidenceIds
    };
  }

  const invalidations = rows.flatMap(row => row.invalidations);
  if (rows.some(row => row.metrics.coverageErrors > 0)) {
    invalidations.push('coverage outside declared range');
  }
  if (rows.some(row => row.metrics.unattributedOver50 > 0)) {
    invalidations.push('unattributed main-thread work');
  }
  if (invalidations.length) {
    return {
      gate, status: 'invalid/inconclusive',
      reasons: invalidations, evidenceIds
    };
  }

  const reasons = [];
  for (const row of rows) {
    for (const [key, [operation, a, b]] of Object.entries(expected[row.slot])) {
      const value = row.metrics[key];
      const passed = operation === 'eq' ? value === a
        : operation === 'le' ? value <= a
        : operation === 'ge' ? value >= a
        : value >= a && value <= b;
      if (!passed) reasons.push(`${row.slot}: ${key}=${value}`);
    }
  }
  return {
    gate, status: reasons.length ? 'fail' : 'pass', reasons, evidenceIds
  };
}
```

**Metric interpretation required of T9/T13:**

- G1 unknown identity adds an invalidation; it is not encoded merely as `nvidia: 0`.
- G2 `freshProcess` and `emptyProfile` come from launcher evidence.
- G3/G4/G5 metrics are recomputed in Node from complete identified readback arrays.
- G5 `componentRatio` is the maximum of `abs(actual-reference)/(1e-6+1e-5*abs(reference))` across all 32 components.
- G7’s percentile uses the 20 final requests’ publication-minus-request times.
- G8 `coverageErrors` includes a missing, incomplete or invalid sphere frame.
- G9’s 12 windows are the nine G6 trials and three G7 trials. Harness attribution is retained, not discarded.
- G11 `selectedChecks` counts 63 texels, with every stored component checked. `texturesWritten` requires evidence of the full write workload.
- G12 byte difference is `abs(final-baseline)/baseline`, after draining and returning to the baseline configuration.
- G13 request preservation compares serialized request data; interruption, success and late-publication metrics come from lifecycle events.
- An aborted or incomplete trial does not acquire fabricated zero-valued metrics. Its gate receives an explicit stopped or inconclusive result.

- [ ] **Step 6: Implement the backend decision procedure.**

Create `spikes/project0/decision.js`:

```js
import { GATES } from './contract.js';

function state(backend) {
  if (!backend || GATES.some(gate => !backend.gates[gate])) return 'incomplete';
  if (GATES.every(gate => backend.gates[gate].status === 'pass')) return 'pass';

  const failures = GATES.filter(gate => backend.gates[gate].status === 'fail');
  const accounted = GATES.every(gate => {
    const result = backend.gates[gate];
    return ['pass', 'fail'].includes(result.status) ||
      (
        result.status === 'not run' &&
        failures.includes(result.blockedBy) &&
        typeof result.reason === 'string' &&
        result.reason.length > 0
      );
  });
  return failures.length && accounted ? 'fail' : 'incomplete';
}

export function decideBackends(webgpu, webgl = null) {
  if (state(webgpu) === 'pass') {
    return { outcome: 'WebGPU selected', next: 'report' };
  }
  if (state(webgpu) !== 'fail') {
    return {
      outcome: 'inconclusive',
      next: 'resolve missing or invalid WebGPU evidence'
    };
  }
  if (!webgpu.remediationClosed) {
    return {
      outcome: 'inconclusive',
      next: 'classify and close the one WebGPU remediation cycle'
    };
  }
  if (!webgl) {
    return {
      outcome: 'inconclusive',
      next: 'T11 addendum approval and WebGL qualification'
    };
  }
  if (state(webgl) === 'pass') {
    return { outcome: 'WebGL 2 selected', next: 'report' };
  }
  if (state(webgl) !== 'fail' || !webgl.remediationClosed) {
    return {
      outcome: 'inconclusive',
      next: 'resolve WebGL evidence or remediation'
    };
  }
  return { outcome: 'no-go', next: 'report limitations' };
}
```

A stopped gate may cite `blockedBy` only when an actual failed gate caused execution to stop. Permissions failures, absent artifacts and unknown hardware identity cannot use this shortcut. The remaining gates stay `not run`; they are never marked passed.

T10/T13 validate the remediation history before setting `remediationClosed`. This boolean does not authorize another remediation.

- [ ] **Step 7: Run the tests.**

Run:

```bash
node --test spikes/project0/tests/contract.test.mjs
```

Expected: six passing tests, zero failures.

- [ ] **Step 8: Peer review and commit after the bridge run ends.**

Codex returns the worktree patch. Claude reviews, applies and reruns Step 7, then runs:

```bash
git add spikes/project0/contract.js spikes/project0/metrics.js spikes/project0/gates.js spikes/project0/decision.js spikes/project0/tests/contract.test.mjs
git commit -m "Add Project 0 evidence contracts and gate evaluators"
```

Expected: a commit containing only the five listed files.


---

### Task T2: Independent arithmetic references and the f32-domain policy

**Owner:** Codex (as T1).

**Dependencies:** T1. No GPU execution.

**Files:**

- Create `spikes/project0/reference/f32.js`
- Create `spikes/project0/reference/bulb.js`
- Create `spikes/project0/reference/complex.js`
- Create `spikes/project0/reference/quaternion.js`
- Create `spikes/project0/tests/reference.test.mjs`

**Interfaces:**

- `nextUp(x)` / `nextDown(x) → number`: adjacent f32 values after converting the input to f32.
- `split(x) → [hi, lo]`: two f32 components encoding a finite CPU double.
- `derivativeFitsF32(grow, dr) → boolean`: proposed exact-real range policy for supplied nonnegative finite f32 operands.
- `bulb(p, cap, visit = () => {}) → result`.
  - Escaped: `{ status: 'escaped', index, logR, de, maxDr }`.
  - Budget exhausted: `{ status: 'budget', index: null, logR: null, de: null, maxDr }`.
  - `visit` receives `{ n, r, grow, dr, nextDr, p }` before the state is updated.
- `complex(q, C, cap) → { status, index, logR }`, testing escape at index zero.
- `quaternionOrbit(q, C, count) → array of count quaternion iterates`.

These modules import no UI, renderer, scheduler or shader code. The raw double reference never calls `derivativeFitsF32`. A failure of the double reference itself aborts preparation; it is not silently converted into an expected shader status.

**Policy:** the exact maximum-range policy agreed in plan Round 2 (`plan-log.md`): `grow·dr + 1 ≤ F32_MAX` evaluated exactly, for nonnegative finite f32 operands; a pre-operation range policy, not IEEE emulation.

- [ ] **Step 1: Create the failing reference tests.**

Create `spikes/project0/tests/reference.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  F32_MAX, nextUp, nextDown, split, derivativeFitsF32
} from '../reference/f32.js';
import { bulb } from '../reference/bulb.js';
import { complex } from '../reference/complex.js';
import { quaternionOrbit } from '../reference/quaternion.js';

test('adjacent f32 values handle binade boundaries, signs and zero', () => {
  assert.equal(nextUp(1), 1 + 2 ** -23);
  assert.equal(nextDown(1), 1 - 2 ** -24);
  assert.equal(nextUp(-1), -1 + 2 ** -24);
  assert.equal(nextDown(-1), -1 - 2 ** -23);
  assert.equal(nextUp(0), 2 ** -149);
  assert.equal(nextDown(0), -(2 ** -149));
  assert.equal(nextUp(F32_MAX), Infinity);
  assert.throws(() => nextUp(Infinity), /finite f32/);

  const value = 1 + 2 ** -25;
  const [hi, lo] = split(value);
  assert.equal(hi, 1);
  assert.equal(lo, 2 ** -25);
  assert.equal(hi + lo, value);
});

test('range policy preserves finite headroom and defines its upper endpoint', () => {
  assert.equal(derivativeFitsF32(2, Math.fround(.375 * F32_MAX)), true);
  assert.equal(derivativeFitsF32(2, nextDown(F32_MAX / 2)), true);
  assert.equal(derivativeFitsF32(2, F32_MAX / 2), false);
  assert.equal(derivativeFitsF32(2, F32_MAX), false);
  assert.equal(derivativeFitsF32(0, F32_MAX), true);
  assert.equal(derivativeFitsF32(1, F32_MAX), false);
  assert.throws(() => derivativeFitsF32(-1, 1), /nonnegative finite f32/);
  assert.throws(() => derivativeFitsF32(1.1, 1), /nonnegative finite f32/);
});

test('bulb uses z0=0, dr0=0, strict bailout and unrestricted double tracing', () => {
  const events = [];
  const origin = bulb([0, 0, 0], 64, event => events.push(event));
  assert.equal(origin.status, 'budget');
  assert.equal(origin.de, null);
  assert.equal(origin.maxDr, 1);
  assert.equal(events.length, 64);
  assert.equal(events[0].dr, 0);
  assert.equal(events[0].nextDr, 1);

  const immediate = bulb([3, 0, 0], 64);
  assert.equal(immediate.status, 'escaped');
  assert.equal(immediate.index, 1);
  assert.equal(immediate.de, .5 * Math.log(3) * 3);

  const boundary = bulb([0, 0, 2], 2);
  assert.equal(boundary.status, 'escaped');
  assert.equal(boundary.index, 2);
  assert.equal(boundary.maxDr, 1025);
  assert.equal(boundary.logR, Math.log(258));
  assert.equal(boundary.de, .5 * Math.log(258) * 258 / 1025);
});

test('independent complex and quaternion recurrences agree on the invariant plane', () => {
  assert.deepEqual(
    quaternionOrbit([.25, .5, .125, -.25], [-.2, .8, 0, 0], 1)[0],
    [-.465625, 1.05, .0625, -.125]
  );

  const C = [Math.fround(-.2), Math.fround(.8), 0, 0];
  for (const start of [[.25, .5], [1.25, -.75], [0, 0], [3, 0]]) {
    const reference = complex(start, C.slice(0, 2), 128);
    let q = [start[0], start[1], 0, 0];
    let index = null;
    let logR = null;
    for (let n = 0; n <= 128; n++) {
      const radius = Math.hypot(...q);
      if (radius > 2) {
        index = n;
        logR = Math.log(radius);
        break;
      }
      if (n === 128) break;
      q = quaternionOrbit(q, C, 1)[0];
      assert.equal(q[2], 0);
      assert.equal(q[3], 0);
    }
    assert.equal(reference.status, index === null ? 'budget' : 'escaped');
    assert.equal(reference.index, index);
    if (index !== null) assert.ok(Math.abs(reference.logR - logR) < 1e-12);
  }
  assert.equal(complex([3, 0], C, 128).index, 0);
});
```

- [ ] **Step 2: Verify the tests fail because the reference modules are absent.**

Run:

```bash
node --test spikes/project0/tests/reference.test.mjs
```

Expected: nonzero exit with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/reference/f32.js`.

- [ ] **Step 3: Implement f32 adjacency, input splitting and the separate range policy.**

Create `spikes/project0/reference/f32.js`:

```js
const bits = new DataView(new ArrayBuffer(4));

export const F32_MAX = 3.4028234663852886e38;

function adjacent(value, direction) {
  const x = Math.fround(value);
  if (!Number.isFinite(x)) throw new RangeError('finite f32 required');
  if (x === 0) return direction * 2 ** -149;
  bits.setFloat32(0, x);
  const integer = bits.getUint32(0);
  bits.setUint32(0, integer + (x > 0 ? direction : -direction));
  return bits.getFloat32(0);
}

export const nextUp = value => adjacent(value, 1);
export const nextDown = value => adjacent(value, -1);

export function split(value) {
  const hi = Math.fround(value);
  if (!Number.isFinite(value) || !Number.isFinite(hi)) {
    throw new RangeError('finite f32-representable high component required');
  }
  return [hi, Math.fround(value - hi)];
}

// A nonnegative f32 represented exactly as integer units of 2^-149.
function units(value) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    Math.fround(value) !== value
  ) {
    throw new RangeError('nonnegative finite f32 required');
  }
  bits.setFloat32(0, value);
  const integer = bits.getUint32(0);
  const exponent = (integer >>> 23) & 255;
  const significand = BigInt(
    (integer & 0x7fffff) | (exponent ? 0x800000 : 0)
  );
  return exponent
    ? significand << BigInt(exponent - 1)
    : significand;
}

// Exact-real grow*dr + 1 <= F32_MAX.
// This is a range policy, not an emulator for rounded f32 arithmetic.
export function derivativeFitsF32(grow, dr) {
  const productAndOne = units(grow) * units(dr) + (1n << 298n);
  const maximum = units(F32_MAX) * (1n << 149n);
  return productAndOne <= maximum;
}
```

The integer scaling follows directly from representing both operands in units of `2^-149`: their product is in units of `2^-298`, so adding one adds `2^298` integer units. It avoids a rounded division near the boundary.

- [ ] **Step 4: Implement the independent double Mandelbulb recurrence.**

Create `spikes/project0/reference/bulb.js`:

```js
export function bulb(p, cap, visit = () => {}) {
  if (
    p.length !== 3 || p.some(value => !Number.isFinite(value)) ||
    !Number.isInteger(cap) || cap < 0
  ) {
    throw new TypeError('finite 3D point and nonnegative integer cap required');
  }

  let x = 0;
  let y = 0;
  let z = 0;
  let dr = 0;
  let maxDr = 0;

  for (let n = 1; n <= cap; n++) {
    const r = Math.hypot(x, y, z);
    const grow = 8 * r ** 7;
    const theta = r
      ? Math.acos(Math.max(-1, Math.min(1, z / r)))
      : 0;
    const phi = x === 0 && y === 0 ? 0 : Math.atan2(y, x);
    const power = r ** 8;
    const nextDr = grow * dr + 1;

    visit({ n, r, grow, dr, nextDr, p });
    dr = nextDr;
    maxDr = Math.max(maxDr, dr);

    x = power * Math.sin(8 * theta) * Math.cos(8 * phi) + p[0];
    y = power * Math.sin(8 * theta) * Math.sin(8 * phi) + p[1];
    z = power * Math.cos(8 * theta) + p[2];

    const R = Math.hypot(x, y, z);
    if (![R, dr].every(Number.isFinite)) {
      throw new RangeError('double reference overflow');
    }
    if (R > 2) {
      return {
        status: 'escaped',
        index: n,
        logR: Math.log(R),
        de: .5 * Math.log(R) * R / dr,
        maxDr
      };
    }
  }

  return {
    status: 'budget',
    index: null,
    logR: null,
    de: null,
    maxDr
  };
}
```

- [ ] **Step 5: Implement the independent complex reference.**

Create `spikes/project0/reference/complex.js`:

```js
export function complex(q, C, cap) {
  if (
    q.length !== 2 || C.length < 2 ||
    [...q, C[0], C[1]].some(value => !Number.isFinite(value)) ||
    !Number.isInteger(cap) || cap < 0
  ) {
    throw new TypeError('finite complex inputs and nonnegative integer cap required');
  }

  let [x, y] = q;
  for (let n = 0; n <= cap; n++) {
    const R = Math.hypot(x, y);
    if (!Number.isFinite(R)) throw new RangeError('double reference overflow');
    if (R > 2) {
      return { status: 'escaped', index: n, logR: Math.log(R) };
    }
    if (n === cap) {
      return { status: 'budget', index: null, logR: null };
    }

    const nextX = x * x - y * y + C[0];
    y = 2 * x * y + C[1];
    x = nextX;
  }
}
```

- [ ] **Step 6: Implement the independent quaternion reference.**

Create `spikes/project0/reference/quaternion.js`:

```js
export function quaternionOrbit(q, C, count) {
  if (
    q.length !== 4 || C.length !== 4 ||
    [...q, ...C].some(value => !Number.isFinite(value)) ||
    !Number.isInteger(count) || count < 0
  ) {
    throw new TypeError('finite quaternion inputs and nonnegative integer count required');
  }

  const orbit = [];
  for (let n = 0; n < count; n++) {
    const [a, b, c, d] = q;
    q = [
      a * a - b * b - c * c - d * d + C[0],
      a * b + b * a + C[1],
      a * c + c * a + C[2],
      a * d + d * a + C[3]
    ];
    if (!q.every(Number.isFinite)) {
      throw new RangeError('double reference overflow');
    }
    orbit.push(q);
  }
  return orbit;
}
```

- [ ] **Step 7: Run the arithmetic and contract tests together.**

Run:

```bash
node --test spikes/project0/tests/contract.test.mjs spikes/project0/tests/reference.test.mjs
```

Expected: ten passing tests, zero failures.

This test command is CPU-only. Do not substitute a browser graphics test before the fixture freeze.

- [ ] **Step 8: Peer review and commit after the bridge run ends.**

Codex returns the worktree patch. Claude reviews, applies and reruns Step 7, then runs:

```bash
git add spikes/project0/reference/f32.js spikes/project0/reference/bulb.js spikes/project0/reference/complex.js spikes/project0/reference/quaternion.js spikes/project0/tests/reference.test.mjs
git commit -m "Add independent Project 0 arithmetic references"
```

Expected: a commit containing only the five listed files.


---

### Task T3: CPU geometry, tracing, sensitivity and precision preparation

**Owner:** Codex (as T1).

**Dependencies:** amended T1 and T2. No GPU execution.

**Files:**

- Create `spikes/project0/reference/camera.js`
- Create `spikes/project0/reference/geometry.js`
- Create `spikes/project0/reference/trace.js`
- Create `spikes/project0/reference/sensitivity.js`
- Create `spikes/project0/reference/preparation.js`
- Create `spikes/project0/tests/geometry.test.mjs`

**Interfaces:**

- `ray(camera,W,H,i,j) → {origin,direction}`: requested double ray.
- `pose(name,time,anchor) → {origin,target}`: prescribed view/path, time in seconds.
- `burstRequests() → 400 requests`: each has `{id,burst,index,offsetMs,camera}`.
- `sphereInterval(o,d,radius) → [entry,exit] | null`.
- `slab(o,d,box) → [entry,exit] | null`.
- `menger(depth) → boxes`: each box is `{c,h}`.
- `unionOracle(o,d,boxes) → {status,t,excluded,intervals}`.
- `analyticFixtures() → fixtures.analytic`.
- `trace(ray,profile,field,range) → {status,t,steps,reason}`.
- `traceBulb(ray,profile,visit?) → ray result`.
- `normalBulb(ray,hit,profile,visit?) → {available,normal}`.
- `sensitivity(input,evaluate,tolerances) → {reference,eligible,reasons}`.
- `rangeAudit() → {data,visit}`.
- `makeAnchor() → anchor`.
- `prepareCoverage(name,profileName,time,anchor) → coverage result`.
- `preparePrecision(distance,anchor) → precision result`.
- `comparePrecision(set,actual,variant?) → discrepancy summary`.

**Numerical conventions:**

- F32 direction conversion is recorded without renormalizing the converted vector.
- Sphere intersection retains the `dot(d,d)` term, so it also supports those slightly nonunit directions.
- A.10 convergence compares against the tighter trace’s depth:
  `abs(primary.t-tighter.t) <= .001*abs(tighter.t)`.
- Discrepancy depth errors use the **primary** CPU depth.
- Range diagnostics never change arithmetic results or eligibility.
- Double-reference exceptions abort preparation. They are not relabelled as expected GPU failures.

- [ ] **Step 1: Write the failing tests**

- [ ] Create `spikes/project0/tests/geometry.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical } from '../contract.js';
import { compareRays, coverageValid } from '../metrics.js';
import { bulb } from '../reference/bulb.js';
import { complex } from '../reference/complex.js';
import { F32_MAX, nextDown, nextUp } from '../reference/f32.js';
import { ray, pose, burstRequests } from '../reference/camera.js';
import {
  sphereInterval, slab, menger, unionOracle, boxDistance,
  analytic, analyticFixtures
} from '../reference/geometry.js';
import {
  profiles, trace, traceBulb, normalBulb
} from '../reference/trace.js';
import { sensitivity } from '../reference/sensitivity.js';
import {
  rangeAudit, makeAnchor, referenceAgreement, precisionStopReasons,
  prepareCoverage, preparePrecision, comparePrecision
} from '../reference/preparation.js';

test('camera handedness, nonunit ray parameters, motion and burst timing', () => {
  const camera = { origin: [0,-4,0], target: [0,0,0] };
  assert.deepEqual(ray(camera, 1, 1, 0, 0).direction, [0,1,0]);
  assert.ok(ray(camera, 3, 3, 2, 0).direction[0] > 0);
  assert.ok(ray(camera, 3, 3, 2, 0).direction[2] > 0);
  assert.deepEqual(sphereInterval([0,-4,0], [0,2,0], 1), [1.5,2.5]);
  assert.throws(
    () => ray({ origin: [0,0,4], target: [0,0,0] }, 1, 1, 0, 0),
    /direction/
  );

  const requests = burstRequests();
  assert.equal(requests.length, 400);
  assert.equal(requests[19].offsetMs, 152);
  assert.equal(requests[20].offsetMs - requests[19].offsetMs, 1000);
  assert.equal(requests[399].offsetMs, 22040);

  const anchor = makeAnchor();
  const start = pose('bulb-detail-0.05', 0, anchor);
  const distance = Math.hypot(...start.origin.map((x,i) => x-anchor.A[i]));
  assert.ok(Math.abs(distance-.05) < 1e-15);
  assert.notDeepEqual(
    pose('bulb-detail-0.05', 2.5, anchor).origin,
    start.origin
  );
});

test('slabs and finite unions remain independent of the distance marcher', () => {
  const cube = { c: [0,0,0], h: [1,1,1] };
  assert.equal(slab([2,-4,0], [0,1,0], cube), null);
  assert.deepEqual(slab([0,-4,0], [0,1,0], cube), [3,5]);
  assert.equal(menger(1).length, 20);
  assert.equal(menger(2).length, 400);
  assert.equal(boxDistance([2,2,0], cube), Math.sqrt(2));

  const boxes = [
    { c: [0,0,0], h: [1,1,1] },
    { c: [0,2,0], h: [1,1,1] }
  ];
  const result = unionOracle([0,-4,0], [0,1,0], boxes);
  assert.deepEqual(result.intervals, [[3,7]]);
  assert.equal(result.excluded, false);
  assert.equal(unionOracle([1,-4,0], [0,1,0], boxes).excluded, true);
});

test('every analytic fixture ray satisfies the independent G3 oracle', () => {
  for (const [name, fixture] of Object.entries(analyticFixtures())) {
    const model = analytic(name, fixture.boxes);
    const actual = fixture.rays.map(r => ({
      id: r.id,
      ...trace(
        r, profiles.g3,
        p => ({ status: 'escaped', de: model.distance(p) }),
        model.bound(r.origin, r.direction)
      )
    }));
    const comparison = compareRays(fixture.rays, actual, fixture.L);
    assert.equal(comparison.statusErrors, 0, name);
    assert.equal(comparison.edgeErrors, 0, name);
    assert.ok(comparison.depthRatio <= 1, name);
  }

  const sphere = prepareCoverage('sphere', 'draft', 0, makeAnchor());
  assert.equal(coverageValid('sphere', sphere.counts), true);
  assert.equal(sphere.counts.normalAvailable, sphere.counts.hit);
});

test('marching keeps point exhaustion, step exhaustion and failure distinct', () => {
  const r = { origin: [0,-4,0], direction: [0,1,0] };
  const profile = { ...profiles.g3, steps: 1 };
  const point = trace(r, profile, () => ({ status: 'budget' }), [0,1]);
  assert.equal(point.status, 'unresolved');
  assert.equal(point.reason, 'point');

  const steps = trace(r, profile, () => ({
    status: 'escaped', de: .5
  }), [0,1]);
  assert.equal(steps.status, 'unresolved');
  assert.equal(steps.reason, 'steps');

  assert.equal(
    trace(r, profile, () => ({ status: 'failure' }), [0,1]).status,
    'failure'
  );
  assert.equal(
    trace(r, profile, () => ({ status: 'escaped', de: 2 }), [0,1]).status,
    'miss'
  );
  assert.equal(
    trace(r, profile, () => { throw Error('must not execute'); }, [-2,-1]).status,
    'miss'
  );
  assert.throws(
    () => trace(r, profile, () => ({ status: 'typo' }), [0,1]),
    /status/
  );
});

test('sensitivity uses adjacent f32 values and reproduces both eligibility counts', () => {
  let bulbEligible = 0;
  let planeEligible = 0;

  for (let z=0; z<16; z++) for (let y=0; y<16; y++) for (let x=0; x<16; x++) {
    const input = [x,y,z].map(i => Math.fround(-1.2+2.4*(i+.5)/16));
    bulbEligible += Number(
      sensitivity(input, p => bulb(p,64), { logR: 1e-4, de: 1e-3 }).eligible
    );
  }
  for (let j=0; j<64; j++) for (let i=0; i<64; i++) {
    const input = [
      -1.5+3*(i+.5)/64, -1.5+3*(j+.5)/64,
      Math.fround(-.2), Math.fround(.8)
    ];
    planeEligible += Number(sensitivity(
      input,
      v => complex(v.slice(0,2), v.slice(2), 128),
      { logR: 1e-5 }
    ).eligible);
  }

  assert.equal(bulbEligible, 3972);
  assert.equal(planeEligible, 3684);

  const seen = [];
  sensitivity([1], v => {
    seen.push(v[0]);
    return { status: 'budget', index: null };
  }, {});
  assert.deepEqual(seen, [1,nextDown(1),nextUp(1)]);
});

test('range diagnostics observe without modifying the reference', () => {
  const audit = rangeAudit();
  const p = [0,0,2];
  assert.deepEqual(bulb(p,2,audit.visit), bulb(p,2));
  assert.equal(audit.data.maxDr, 1025);

  audit.visit({
    n: 1, p: [0,0,0], r: 1,
    grow: 2, dr: Math.fround(.375*F32_MAX), nextDr: .75*F32_MAX
  });
  assert.equal(audit.data.roundedOperandCrossings, 0);

  audit.visit({
    n: 2, p: [0,0,0], r: 1,
    grow: 2, dr: F32_MAX/2, nextDr: F32_MAX
  });
  assert.equal(audit.data.doubleRangeCrossings, 0);
  assert.equal(audit.data.roundedOperandCrossings, 1);

  audit.visit({
    n: 3, p: [0,0,0], r: 1,
    grow: 2, dr: F32_MAX, nextDr: 2*F32_MAX
  });
  assert.equal(audit.data.doubleRangeCrossings, 1);
  assert.doesNotThrow(() => canonical(audit.data));
});

test('anchor reproduces both declared depths with the raw double reference', () => {
  const anchor = makeAnchor();
  assert.ok(Math.abs(anchor.t-1.644459322137676) < 1e-13);
  assert.ok(Math.abs(anchor.tightT-1.6444593221416959) < 1e-13);
  assert.ok(anchor.delta > 0 && anchor.delta < 5e-12);

  const r = { origin: anchor.origin, direction: anchor.D };
  const hit = traceBulb(r, profiles.draft);
  const points = new Set();
  normalBulb(r, hit, profiles.draft, event => {
    points.add(JSON.stringify(event.p));
  });
  assert.equal(points.size, 6);
});

test('precision preparation keeps conversions separate and reproduces 86 exclusions', () => {
  const set = preparePrecision(.1, makeAnchor());
  assert.equal(set.rows.length, 4096);
  assert.equal(set.ineligible, 86);
  assert.deepEqual(set.rows[0].pixel, [608,328]);
  assert.deepEqual(set.rows.at(-1).pixel, [671,391]);
  assert.deepEqual(set.stopReasons, []);

  const actual = set.rows.map(row => ({
    id: row.id, ...row.requested.primary
  }));
  const comparison = comparePrecision(set, actual);
  assert.equal(comparison.eligible, 4010);
  assert.equal(comparison.thresholdExceeded, false);

  for (const row of set.rows) {
    assert.ok(row.effectiveDirection.every(x => Math.fround(x) === x));
  }
});

test('precision convergence, discrepancy and stopping boundaries are explicit', () => {
  const hit = t => ({ status: 'hit', t, reason: null, steps: 1 });
  assert.equal(referenceAgreement(hit(1), hit(1.0010005)).eligible, true);
  assert.deepEqual(precisionStopReasons(2048,.001,1), []);
  assert.deepEqual(
    precisionStopReasons(2049,.001,1),
    ['reference uncertainty']
  );
  assert.deepEqual(
    precisionStopReasons(0,.0011,1),
    ['anchor uncertainty']
  );

  const set = {
    stopReasons: [],
    rows: Array.from({ length: 4096 }, (_,id) => ({
      id, requested: { primary: hit(1), eligible: true }
    }))
  };
  const actual = set.rows.map(row => ({ id: row.id, ...hit(1) }));
  for (let i=0; i<204; i++) actual[i].t = 1.02;
  assert.equal(comparePrecision(set, actual).thresholdExceeded, false);
  actual[204].t = 1.02;
  assert.equal(comparePrecision(set, actual).thresholdExceeded, true);

  for (let i=0; i<205; i++) {
    actual[i] = { id: i, status: 'miss', reason: null, t: null };
  }
  const missing = comparePrecision(set, actual);
  assert.equal(missing.largeDepthErrors, 0);
  assert.equal(missing.statusDisagreements, 205);

  set.stopReasons = ['reference uncertainty'];
  assert.equal(comparePrecision(set, actual).thresholdExceeded, null);
});
```

- [ ] **Step 2: Verify the tests fail**

- [ ] Run:

```bash
node --test spikes/project0/tests/geometry.test.mjs
```

Expected: nonzero exit with `ERR_MODULE_NOT_FOUND` for a T3 reference module.

- [ ] **Step 3: Implement camera and prescribed motion**

- [ ] Create `spikes/project0/reference/camera.js`:

```js
export const add = (a,b) => a.map((v,i) => v+b[i]);
export const scale = (a,k) => a.map(v => v*k);
export const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);

export function norm(a) {
  const length = Math.hypot(...a);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new RangeError('invalid direction');
  }
  return scale(a,1/length);
}

export const cross = (a,b) => [
  a[1]*b[2]-a[2]*b[1],
  a[2]*b[0]-a[0]*b[2],
  a[0]*b[1]-a[1]*b[0]
];

export function checkRay(ray) {
  if (
    [ray.origin,ray.direction].some(v =>
      !Array.isArray(v) || v.length !== 3 ||
      v.some(x => !Number.isFinite(x))
    ) ||
    !(Math.hypot(...ray.direction) > 0)
  ) {
    throw new TypeError('finite ray with nonzero direction required');
  }
}

export function ray(camera,W,H,i,j) {
  if (
    ![W,H].every(n => Number.isInteger(n) && n > 0) ||
    !Number.isInteger(i) || !Number.isInteger(j) ||
    i < 0 || i >= W || j < 0 || j >= H
  ) {
    throw new RangeError('invalid pixel');
  }
  const f = norm(add(camera.target,scale(camera.origin,-1)));
  const r = norm(cross(f,[0,0,1]));
  const u = cross(r,f);
  const h = Math.tan(Math.PI/6);
  const sx = (2*(i+.5)/W-1)*h*W/H;
  const sy = (1-2*(j+.5)/H)*h;
  return {
    origin: [...camera.origin],
    direction: norm(add(f,add(scale(r,sx),scale(u,sy))))
  };
}

export function rotateZ(v,a) {
  return [
    Math.cos(a)*v[0]-Math.sin(a)*v[1],
    Math.sin(a)*v[0]+Math.cos(a)*v[1],
    v[2]
  ];
}

export function pose(name,time,anchor) {
  const base = { origin: [1.92,-1.44,.7], target: [0,0,0] };
  if (name === 'sphere' || (name === 'bulb-overview' && time === 0)) {
    return base;
  }
  if (name === 'bulb-overview') {
    const theta = Math.atan2(-1.44,1.92)+2*Math.PI*time/30;
    return {
      origin: [2.4*Math.cos(theta),2.4*Math.sin(theta),.7],
      target: [0,0,0]
    };
  }

  const distances = {
    'bulb-detail-0.05': .05,
    'bulb-detail-0.005': .005,
    'bulb-stress': .005
  };
  if (!(name in distances)) throw new Error('unknown view');
  const beta = name === 'bulb-stress'
    ? 0
    : Math.PI/18*Math.sin(2*Math.PI*time/10);
  return {
    origin: add(anchor.A,rotateZ(scale(anchor.D,-distances[name]),beta)),
    target: [...anchor.A]
  };
}

export function burstRequests() {
  return Array.from({ length: 400 }, (_,id) => {
    const burst = Math.floor(id/20);
    const index = id%20;
    const theta = Math.atan2(-1.44,1.92)+(id+1)*Math.PI/180;
    return {
      id, burst, index,
      offsetMs: burst*(19*8+1000)+index*8,
      camera: {
        origin: [2.4*Math.cos(theta),2.4*Math.sin(theta),.7],
        target: [0,0,0]
      }
    };
  });
}
```

The last request is scheduled at 22,040 ms. Its final one-second quiet interval ends at 23,040 ms. The timing driver records actual issuance separately; it must not substitute scheduled timestamps for observed request timestamps.

- [ ] **Step 4: Implement independent analytic geometry and ray fixtures**

- [ ] Create `spikes/project0/reference/geometry.js`:

```js
import {
  add, scale, dot, norm, rotateZ, checkRay
} from './camera.js';

export function sphereInterval(o,d,radius) {
  checkRay({ origin: o, direction: d });
  const a = dot(d,d);
  const b = dot(o,d);
  const c = dot(o,o)-radius*radius;
  const disc = b*b-a*c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return [(-b-root)/a,(-b+root)/a];
}

export function slab(o,d,box) {
  let lo = -Infinity;
  let hi = Infinity;
  for (let i=0; i<3; i++) {
    const a = box.c[i]-box.h[i];
    const b = box.c[i]+box.h[i];
    if (d[i] === 0) {
      if (o[i] < a || o[i] > b) return null;
      continue;
    }
    const x = (a-o[i])/d[i];
    const y = (b-o[i])/d[i];
    lo = Math.max(lo,Math.min(x,y));
    hi = Math.min(hi,Math.max(x,y));
    if (lo > hi) return null;
  }
  return [lo,hi];
}

export function boxDistance(p,box) {
  return Math.hypot(...p.map((v,i) =>
    Math.max(Math.abs(v-box.c[i])-box.h[i],0)
  ));
}

export function menger(depth) {
  if (![1,2].includes(depth)) {
    throw new RangeError('fixture depth must be 1 or 2');
  }
  let boxes = [{ c: [0,0,0], h: [1,1,1] }];
  for (let level=0; level<depth; level++) {
    const next = [];
    for (const box of boxes) {
      for (let x=0; x<3; x++) for (let y=0; y<3; y++) for (let z=0; z<3; z++) {
        const index = [x,y,z];
        if (index.filter(i => i === 1).length > 1) continue;
        const h = box.h.map(v => v/3);
        next.push({
          c: box.c.map((v,i) => v+2*h[i]*(index[i]-1)),
          h
        });
      }
    }
    boxes = next;
  }
  return boxes;
}

export function unionOracle(o,d,boxes) {
  checkRay({ origin: o, direction: d });
  const intervals = boxes.map(box => ({
    box, interval: slab(o,d,box)
  })).filter(x =>
    x.interval && x.interval[1] >= Math.max(0,x.interval[0])
  ).sort((a,b) => a.interval[0]-b.interval[0]);

  if (!intervals.length) {
    return { status: 'miss', t: null, excluded: false, intervals: [] };
  }

  const merged = [];
  for (const { interval: [a,b] } of intervals) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1],b);
    else merged.push([a,b]);
  }

  const t = Math.max(0,merged[0][0]);
  const p = add(o,scale(d,t));
  const box = intervals[0].box;
  const nearFaces = p.filter((v,i) =>
    Math.abs(Math.abs(v-box.c[i])-box.h[i]) < 1e-3
  ).length;
  return {
    status: 'hit', t, excluded: nearFaces >= 2, intervals: merged
  };
}

export const boxFixture = { c: [0,0,0], h: [1,.5,.25] };

export function analytic(name,boxes=[]) {
  if (name === 'sphere') {
    return {
      bound: (o,d) => sphereInterval(o,d,2),
      distance: p => Math.hypot(...p)-1
    };
  }
  if (name === 'box') {
    return {
      bound: (o,d) => sphereInterval(o,d,2),
      distance: p => boxDistance(rotateZ(p,-Math.PI/6),boxFixture)
    };
  }
  if (!['menger-1','menger-2'].includes(name) || !boxes.length) {
    throw new Error('unknown analytic fixture');
  }
  return {
    bound: (o,d) => slab(o,d,{ c: [0,0,0], h: [1,1,1] }),
    distance: p => Math.min(...boxes.map(b => boxDistance(p,b)))
  };
}

export function analyticFixtures() {
  const fixtures = {};
  for (const [name,L,nx,ny] of [
    ['sphere',1,25,25],
    ['box',.25,31,21],
    ['menger-1',1/3,41,41],
    ['menger-2',1/9,41,41]
  ]) {
    const boxes = name.startsWith('menger')
      ? menger(Number(name.at(-1)))
      : [];
    const rays = [];

    for (let j=0; j<ny; j++) for (let i=0; i<nx; i++) {
      const u = name === 'sphere' ? (i-12)/10
        : name === 'box' ? (i-15)/10
        : -1.2+2.4*i/40;
      const v = name === 'sphere' ? (j-12)/10
        : name === 'box' ? (j-10)/20
        : -1.2+2.4*j/40;
      const origin = [u,-4,v];
      const direction = name.startsWith('menger')
        ? norm([.3,1,.2])
        : [0,1,0];

      let reference;
      if (name === 'sphere') {
        const r2 = u*u+v*v;
        const hit = r2 < 1;
        reference = {
          status: hit ? 'hit' : 'miss',
          t: hit ? 4-Math.sqrt(1-r2) : null,
          excluded: Math.abs(Math.sqrt(r2)-1) < .02
        };
      } else {
        reference = unionOracle(
          name === 'box' ? rotateZ(origin,-Math.PI/6) : origin,
          name === 'box' ? rotateZ(direction,-Math.PI/6) : direction,
          name === 'box' ? [boxFixture] : boxes
        );
      }

      rays.push({
        id: rays.length,
        origin, direction,
        effectiveOrigin: origin.map(Math.fround),
        effectiveDirection: direction.map(Math.fround),
        reference
      });
    }
    fixtures[name] = { L, boxes, rays };
  }
  return fixtures;
}
```

- [ ] **Step 5: Implement tracing profiles, termination and normals**

- [ ] Create `spikes/project0/reference/trace.js`:

```js
import {
  ARITH_STATUS, RAY_STATUS, UNRESOLVED_REASON, assertArithmeticStatus
} from '../contract.js';
import { add, scale, norm, checkRay } from './camera.js';
import { sphereInterval } from './geometry.js';
import { bulb } from './bulb.js';

const [ESCAPED,BUDGET,ARITH_FAILURE] = ARITH_STATUS;
const [HIT,MISS,UNRESOLVED,FAILURE] = RAY_STATUS;
const [POINT,STEPS] = UNRESOLVED_REASON;

const draft = {
  W: 640, H: 360, iterations: 64, steps: 256,
  k: .9, floor: 1e-6, factor: .5
};
const settled = {
  W: 1280, H: 720, iterations: 128, steps: 512,
  k: .9, floor: 1e-6, factor: .5
};

export const profiles = Object.freeze(Object.fromEntries(Object.entries({
  draft,
  settled,
  stress: { ...draft, k: .25, floor: 1e-7, factor: 0 },
  g3: { ...settled, iterations: 0, k: 1, floor: 1e-6, factor: 0 },
  precision: { ...settled, floor: 0, factor: .005 },
  precisionTight: { ...settled, floor: 0, factor: .0005 },
  anchor: {
    ...settled, iterations: 256, steps: 4096,
    k: .5, floor: 1e-13, factor: 0
  },
  anchorTight: {
    ...settled, iterations: 256, steps: 4096,
    k: .5, floor: 1e-15, factor: 0
  }
}).map(([key,value]) => [key,Object.freeze(value)])));

export const angularPixelSize = profile =>
  2*Math.tan(Math.PI/6)/profile.H;

export const tolerance = (profile,t) =>
  Math.max(profile.floor,profile.factor*angularPixelSize(profile)*t);

const result = (status,t,steps,reason=null) =>
  ({ status, t, steps, reason });

export function trace(ray,profile,field,range) {
  checkRay(ray);
  if (!range || range[1] < Math.max(0,range[0])) {
    return result(MISS,null,0);
  }
  if (!range.every(Number.isFinite)) {
    throw new RangeError('finite tracing interval required');
  }

  let t = Math.max(0,range[0]);
  for (let step=0; step<profile.steps; step++) {
    if (t > range[1]) return result(MISS,null,step);
    const value = field(add(ray.origin,scale(ray.direction,t)));
    assertArithmeticStatus(value);

    if (value.status === BUDGET) return result(UNRESOLVED,t,step+1,POINT);
    if (value.status === ARITH_FAILURE) return result(FAILURE,t,step+1);
    if (!Number.isFinite(value.de)) throw new Error('invalid CPU distance');
    if (value.de < tolerance(profile,t)) return result(HIT,t,step+1);

    t += profile.k*value.de;
    if (!Number.isFinite(t)) throw new Error('double marcher overflow');
  }

  return t > range[1]
    ? result(MISS,null,profile.steps)
    : result(UNRESOLVED,t,profile.steps,STEPS);
}

export function traceBulb(ray,profile,visit) {
  return trace(
    ray, profile,
    p => bulb(p,profile.iterations,visit),
    sphereInterval(ray.origin,ray.direction,1.25)
  );
}

export function normalBulb(ray,hit,profile,visit) {
  if (hit.status !== HIT) return { available: false, normal: null };

  const p = add(ray.origin,scale(ray.direction,hit.t));
  const eps = .5*tolerance(profile,hit.t);
  const gradient = [];
  if (!(eps > 0)) return { available: false, normal: null };

  let available = true;
  for (let axis=0; axis<3; axis++) {
    const a = [...p];
    const b = [...p];
    a[axis] += eps;
    b[axis] -= eps;
    const x = bulb(a,profile.iterations,visit);
    const y = bulb(b,profile.iterations,visit);
    if (x.status !== ESCAPED || y.status !== ESCAPED) {
      available = false;
      gradient.push(0);
    } else {
      gradient.push((x.de-y.de)/(2*eps));
    }
  }

  if (
    !available || !gradient.every(Number.isFinite) ||
    !(Math.hypot(...gradient) > 0)
  ) {
    return { available: false, normal: null };
  }
  return { available: true, normal: norm(gradient) };
}
```

All six normal samples are evaluated during preparation, so range diagnostics cover them even when the final normal is unavailable.

- [ ] **Step 6: Implement the frozen sensitivity screen**

- [ ] Create `spikes/project0/reference/sensitivity.js`:

```js
import { nextDown, nextUp } from './f32.js';
import { assertArithmeticStatus } from '../contract.js';

export function sensitivity(input,evaluate,tolerances) {
  function checked(v) {
    const result = evaluate(v);
    assertArithmeticStatus(result);
    if (result.status === 'failure') {
      throw new Error('CPU reference failed during sensitivity screen');
    }
    if (
      result.status === 'escaped' &&
      Object.keys(tolerances).some(key => !Number.isFinite(result[key]))
    ) {
      throw new Error('nonfinite CPU reference quantity');
    }
    return result;
  }

  const reference = checked(input);
  const reasons = [];

  for (let coordinate=0; coordinate<input.length; coordinate++) {
    for (const [direction,move] of [['down',nextDown],['up',nextUp]]) {
      const neighbour = [...input];
      neighbour[coordinate] = move(neighbour[coordinate]);
      const other = checked(neighbour);
      const changed = [];

      if (other.status !== reference.status || other.index !== reference.index) {
        changed.push('status/index');
      }
      if (other.status === 'escaped' && reference.status === 'escaped') {
        for (const [key,rtol] of Object.entries(tolerances)) {
          if (
            Math.abs(other[key]-reference[key]) >
            .25*rtol*Math.abs(reference[key])
          ) {
            changed.push(key);
          }
        }
      }
      if (changed.length) reasons.push({ coordinate, direction, changed });
    }
  }
  return { reference, eligible: reasons.length === 0, reasons };
}
```

- [ ] **Step 7: Implement preparation and precision comparisons**

- [ ] Create `spikes/project0/reference/preparation.js`:

```js
import { RAY_STATUS, assertRayStatus } from '../contract.js';
import { F32_MAX, derivativeFitsF32, split } from './f32.js';
import { add, scale, norm, ray, pose } from './camera.js';
import { analytic } from './geometry.js';
import {
  profiles, trace, traceBulb, normalBulb, angularPixelSize
} from './trace.js';

const [HIT,MISS,UNRESOLVED,FAILURE] = RAY_STATUS;

export function rangeAudit() {
  const data = {
    updates: 0,
    maxDr: 0,
    doubleRangeCrossings: 0,
    roundedOperandCrossings: 0,
    witness: null
  };

  function visit(event) {
    data.updates++;
    data.maxDr = Math.max(data.maxDr,event.nextDr);
    if (event.nextDr > F32_MAX) data.doubleRangeCrossings++;

    const grow = Math.fround(event.grow);
    const dr = Math.fround(event.dr);
    const operandsFinite = Number.isFinite(grow) && Number.isFinite(dr);

    // Below this fast-path bound, operand rounding cannot approach F32_MAX.
    // Crossing it merely invokes the exact predicate; it never rejects an update.
    const crossing = !operandsFinite ||
      (
        event.nextDr > F32_MAX/4 &&
        !derivativeFitsF32(grow,dr)
      );

    if (crossing) {
      data.roundedOperandCrossings++;
      data.witness ??= {
        ...event,
        roundedGrow: Number.isFinite(grow) ? grow : null,
        roundedDr: Number.isFinite(dr) ? dr : null,
        reason: operandsFinite ? 'update-range' : 'operand-range'
      };
    }
  }

  return { data, visit };
}

export function makeAnchor() {
  const origin = [1.92,-1.44,.7];
  const D = norm(scale(origin,-1));
  const audit = rangeAudit();
  const primary = traceBulb(
    { origin, direction: D }, profiles.anchor, audit.visit
  );
  const tighter = traceBulb(
    { origin, direction: D }, profiles.anchorTight, audit.visit
  );
  if (primary.status !== HIT || tighter.status !== HIT) {
    throw new Error('anchor unresolved');
  }
  return {
    origin, D,
    A: add(origin,scale(D,primary.t)),
    t: primary.t,
    tightT: tighter.t,
    delta: Math.abs(primary.t-tighter.t),
    primary, tighter,
    audit: audit.data
  };
}

export function referenceAgreement(primary,tighter) {
  assertRayStatus(primary);
  assertRayStatus(tighter);
  const reasons = [];

  for (const [label,value] of [['primary',primary],['tighter',tighter]]) {
    if (![HIT,MISS].includes(value.status)) {
      reasons.push(
        label+'-'+value.status+(value.reason ? '-'+value.reason : '')
      );
    }
  }
  if (!reasons.length && primary.status !== tighter.status) {
    reasons.push('resolved-status');
  }
  if (
    !reasons.length && primary.status === HIT &&
    (
      !(primary.t > 0 && tighter.t > 0) ||
      Math.abs(primary.t-tighter.t) > .001*Math.abs(tighter.t)
    )
  ) {
    reasons.push('depth');
  }
  return { primary, tighter, eligible: reasons.length === 0, reasons };
}

export function precisionStopReasons(ineligible,delta,distance) {
  return [
    ...(ineligible > 2048 ? ['reference uncertainty'] : []),
    ...(delta > .001*distance ? ['anchor uncertainty'] : [])
  ];
}

export function prepareCoverage(name,profileName,time,anchor) {
  const source = profiles[profileName];
  if (!source) throw new Error('unknown profile');
  if (name === 'bulb-stress' && profileName !== 'stress') {
    throw new Error('stress profile required');
  }
  if (name === 'sphere' && profileName !== 'draft') {
    throw new Error('rendered sphere uses draft');
  }

  const profile = name === 'sphere' ? { ...source, k: 1 } : source;
  const camera = pose(name,time,anchor);
  const audit = rangeAudit();
  const sphere = analytic('sphere');
  const counts = {
    total: profile.W*profile.H,
    hit: 0, miss: 0, point: 0, steps: 0, failure: 0,
    normalAvailable: 0
  };

  for (let j=0; j<profile.H; j++) for (let i=0; i<profile.W; i++) {
    const r = ray(camera,profile.W,profile.H,i,j);
    const value = name === 'sphere'
      ? trace(
          r, profile,
          p => ({ status: 'escaped', de: sphere.distance(p) }),
          sphere.bound(r.origin,r.direction)
        )
      : traceBulb(r,profile,audit.visit);

    counts[value.status === UNRESOLVED ? value.reason : value.status]++;
    if (
      value.status === HIT &&
      (
        name === 'sphere' ||
        normalBulb(r,value,profile,audit.visit).available
      )
    ) {
      counts.normalAvailable++;
    }
  }

  return {
    name,
    profile: profileName,
    effectiveProfile: { ...profile },
    time, camera, counts,
    audit: audit.data
  };
}

export function preparePrecision(distance,anchor) {
  if (!(distance > 0) || !Number.isFinite(distance)) {
    throw new Error('positive distance required');
  }

  const origin = add(anchor.A,scale(anchor.D,-distance));
  const camera = { origin, target: anchor.A };
  const originPairs = origin.map(split);
  const roundedOrigin = origin.map(Math.fround);
  const pairOrigin = originPairs.map(([hi,lo]) => hi+lo);
  const audit = rangeAudit();
  const rows = [];

  function evaluate(r) {
    return referenceAgreement(
      traceBulb(r,profiles.precision,audit.visit),
      traceBulb(r,profiles.precisionTight,audit.visit)
    );
  }

  for (let j=328; j<=391; j++) for (let i=608; i<=671; i++) {
    const requested = ray(camera,1280,720,i,j);
    const direction = requested.direction.map(Math.fround);
    rows.push({
      id: rows.length,
      pixel: [i,j],
      direction: requested.direction,
      effectiveDirection: direction,
      requested: evaluate(requested),
      directionRounded: evaluate({ origin, direction }),
      baselineInput: evaluate({ origin: roundedOrigin, direction }),
      compensatedInput: evaluate({ origin: pairOrigin, direction })
    });
  }

  const ineligible = rows.filter(row => !row.requested.eligible).length;
  return {
    distance, origin, originPairs, roundedOrigin, pairOrigin,
    angularPixelSize: angularPixelSize(profiles.precision),
    nominalFootprintAtAnchor: angularPixelSize(profiles.precision)*distance,
    primaryProfile: 'precision',
    tighterProfile: 'precisionTight',
    ineligible,
    stopReasons: precisionStopReasons(ineligible,anchor.delta,distance),
    rows,
    audit: audit.data
  };
}

export function comparePrecision(set,actual,variant='requested') {
  if (![
    'requested', 'directionRounded', 'baselineInput', 'compensatedInput'
  ].includes(variant)) {
    throw new Error('unknown precision reference');
  }

  const byId = new Map(actual.map(row => [row.id,row]));
  if (
    byId.size !== actual.length ||
    actual.length !== set.rows.length ||
    set.rows.some(row => !byId.has(row.id))
  ) {
    throw new Error('precision ray identity mismatch');
  }
  for (const got of actual) {
    assertRayStatus(got);
    if (
      got.status === HIT &&
      (!Number.isFinite(got.t) || got.t < 0)
    ) {
      throw new Error('invalid hit depth');
    }
  }

  let eligible = 0;
  let hits = 0;
  let statusDisagreements = 0;
  let largeDepthErrors = 0;

  for (const row of set.rows) {
    const reference = row[variant];
    const got = byId.get(row.id);
    if (!reference.eligible) continue;
    eligible++;
    const cpu = reference.primary;
    statusDisagreements += Number(got.status !== cpu.status);
    if (cpu.status === HIT && cpu.t > 0) {
      hits++;
      if (
        got.status === HIT &&
        Math.abs(got.t-cpu.t) > .01*Math.abs(cpu.t)
      ) {
        largeDepthErrors++;
      }
    }
  }

  const reasons = [...set.stopReasons];
  if (
    set.rows.length-eligible > 2048 &&
    !reasons.includes('reference uncertainty')
  ) {
    reasons.push('reference uncertainty');
  }
  const interpretable = reasons.length === 0 && eligible > 0;

  return {
    variant,
    eligible, hits, statusDisagreements, largeDepthErrors,
    depthAvailable: hits > 0,
    interpretable,
    stopReasons: reasons,
    thresholdExceeded: interpretable
      ? statusDisagreements > .05*eligible ||
        (hits > 0 && largeDepthErrors > .05*hits)
      : null
  };
}
```

The four reference variants have distinct purposes:

| Variant | Origin | Direction | Interpretation |
|---|---|---|---|
| `requested` | Requested double | Requested double | Primary A.10 scene comparison |
| `directionRounded` | Requested double | Effective f32 | Separates direction conversion |
| `baselineInput` | Effective f32 | Effective f32 | Isolates later baseline arithmetic |
| `compensatedInput` | Reconstructed high-plus-low | Effective f32 | Isolates later compensated arithmetic |

The requested-scene eligibility set remains authoritative for the main A.10 result. Supplementary comparisons report their own eligibility and never replace it.

- [ ] **Step 8: Run the complete CPU suite**

- [ ] Run:

```bash
node --test spikes/project0/tests/contract.test.mjs spikes/project0/tests/reference.test.mjs spikes/project0/tests/geometry.test.mjs
```

Expected: **19 passing tests, zero failures**.

This includes all G3 reference rays, the full two arithmetic grids, the rendered sphere coverage check and the 4,096-ray precision preparation at distance 0.1. Full ordinary-view coverage preparation remains T4’s pre-freeze work.

- [ ] **Step 9: Peer review and commit after the bridge run ends**

- [ ] Codex returns the worktree patch. Claude reviews, applies and reruns Step 8, then runs:

```bash
git add spikes/project0/reference/camera.js spikes/project0/reference/geometry.js spikes/project0/reference/trace.js spikes/project0/reference/sensitivity.js spikes/project0/reference/preparation.js spikes/project0/tests/geometry.test.mjs
git commit -m "Add Project 0 geometry and precision references"
```

Expected: a commit containing only the six listed files.


---

### Task T4: Generate, audit and freeze the CPU fixtures

**Owner:** Codex writes the generator (as T1); Claude runs generation and reproduction in the primary checkout after the bridge run ends; both review the candidate before the freeze commit.

**Dependencies:** T1–T3 complete and peer-reviewed. No GPU execution has occurred.

**Files:**

- Create: `spikes/project0/fixture-definition.js`
- Create: `spikes/project0/fixture-audit.js`
- Create: `spikes/project0/fixture-pool.mjs`
- Create: `spikes/project0/fixture-files.mjs`
- Create: `spikes/project0/prepare-worker.mjs`
- Create: `spikes/project0/prepare-fixtures.mjs`
- Create: `spikes/project0/verify-fixtures.mjs`
- Test: `spikes/project0/tests/fixtures.test.mjs`
- Generate and commit separately: `spikes/project0/fixtures.json`

**Interfaces:**

- Consumes the T1 status vocabulary, `canonical(value)` and `coverageValid(name, counts)`.
- Consumes the T2 independent arithmetic references and exact `derivativeFitsF32(grow, dr)` predicate.
- Consumes the T3 camera, geometry, tracing, sensitivity and preparation functions.
- `baseFixtures()` returns the deterministic fixture definition and inexpensive CPU references.
- `preparationJobs(base)` returns **82 numbered jobs**: 72 ordinary moving-view preparations, stress, rendered sphere and eight precision distances.
- `runJobs(jobs, anchor, options)` returns `{id, value}[]` in job order, independently of completion order.
- `assembleFixtures(base, provenance, results)` constructs the complete document.
- `auditFixtures(fixtures, base)` validates definitions, coverage, inputs, derived eligibility and stopping decisions.
- `readVerifiedFile(false)` requires the exact fixture bytes to be committed in the current history. It returns `{bytes, fixtures, identity}`.
- `identity` contains `fixtureHash`, `fixtureCommit` and `specHash`. The fixture’s own hash and freeze commit remain outside the JSON, avoiding self-reference.
- `verify-fixtures.mjs --candidate` validates an uncommitted candidate. It cannot authorize T5.
- `verify-fixtures.mjs --recompute` regenerates all CPU results and requires byte-for-byte equality.
- T5 requires the default verifier to succeed with `status: "FIXTURES OK"` and a non-null `identity.fixtureCommit`.

The schema is version 1:

| JSON path | Consumer contract |
|---|---|
| `provenance` | Spec path/hash, committed generator revision, exact Node version and source-file hashes |
| `statusVocabulary` | Arithmetic, ray and unresolved-reason strings |
| `projection`, `display`, `models`, `shading` | Explicit Appendix A conventions and rendering constants |
| `views[name]` | `{model, camera, profiles, traceOverrides}`; cameras use `{origin, target}` |
| `profiles[name]` | `{W,H,iterations,steps,k,floor,factor}` |
| `anchor` | Full CPU anchor, both traces, convergence difference and range audit |
| `analytic[name]` | `{L,boxes,rays,effectiveOrigins,effectiveDirections}` |
| `analytic[name].rays[i]` | Canonical requested/effective ray vectors and independent intersection reference |
| `arithmetic.bulb`, `arithmetic.plane` | Arrays of `{id,requested,input,reference,eligible,reasons}` |
| `arithmetic.offplane` | Initial quaternion, requested/effective C and eight reference iterates |
| `arithmeticProtocol` | Iteration caps, comparison tolerances and sensitivity policy |
| `derivativePolicy` | `{grow,dr,fits}[]`, evaluated with the exact T2 predicate |
| `motion`, `bursts` | Path constants, preparation phases and all 400 burst requests |
| `resources` | A.8 descriptors, byte accounting and verification pattern |
| `stability` | A.9 cycle timing, phases, backing sizes, maintenance frequency and baseline procedure |
| `coverage` | 74 complete CPU preparations, in manifest order |
| `precision.results` | Eight sets containing all four input-conversion references for each of 4,096 rays |
| `primitives`, `compensated`, `costProtocol` | A.11 vectors, declared dataflow and measurement counts |
| `rangeDiagnostics` | Arithmetic range audit; anchor, coverage and precision audits remain with their results |

Stability cycle indices are zero-based: resize uses `resizeBacking[cycle % 3]`; resource verification runs when `(cycle + 1) % resourceEvery === 0`.

The 12 CPU motion samples are preparation checks. They do not replace coverage validation on every completed GPU frame.

- [ ] **Step 1: Write the failing tests**

Create `spikes/project0/tests/fixtures.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical } from '../contract.js';
import {
  baseFixtures, derivativeVectors, resourceLayout, preparationJobs, assembleFixtures
} from '../fixture-definition.js';
import { auditStatic, auditCoverage, auditPrecision } from '../fixture-audit.js';
import { runJobs } from '../fixture-pool.mjs';
import { encodeFixtures, decodeFixtures, options } from '../fixture-files.mjs';
import { F32_MAX, nextDown } from '../reference/f32.js';
import { prepareCoverage, preparePrecision } from '../reference/preparation.js';

const base = baseFixtures();

test('resource bytes and derivative boundaries are frozen explicitly', () => {
  const layout = resourceLayout();
  assert.equal(layout.tableBytes,405995520);
  assert.equal(layout.entries.length,8);
  assert.equal(layout.entries[7].bytes,7864320);
  assert.equal(layout.entries[7].bytesPerRow%256,0);
  const vectors = derivativeVectors();
  const fits = (grow,dr) => vectors.find(v => v.grow === grow && v.dr === dr)?.fits;
  assert.equal(fits(0,F32_MAX),true);
  assert.equal(fits(2,nextDown(F32_MAX/2)),true);
  assert.equal(fits(2,F32_MAX/2),false);
  assert.equal(fits(1,F32_MAX),false);
  assert.equal(fits(2,Math.fround(.375*F32_MAX)),true);
  assert.equal(fits(2 ** -149,2 ** -149),true);
  assert.equal(fits(F32_MAX,1),false);
});

test('upload arrays preserve effective ray order and static corruption is rejected', () => {
  const candidate = { ...base, provenance: {} };
  assert.deepEqual(auditStatic(candidate,base),{ bulb: 3972, plane: 3684 });
  for (const f of Object.values(base.analytic)) {
    assert.deepEqual(Array.from(new Float32Array(f.effectiveOrigins)),
      f.rays.flatMap(r => r.effectiveOrigin));
    assert.deepEqual(Array.from(new Float32Array(f.effectiveDirections)),
      f.rays.flatMap(r => r.effectiveDirection));
  }
  const bad = structuredClone(candidate);
  bad.analytic.box.effectiveOrigins[0] += 1;
  assert.throws(() => auditStatic(bad,base),/static fixture/);
  const badPolicy = structuredClone(candidate);
  badPolicy.derivativePolicy[0].fits = false;
  assert.throws(() => auditStatic(badPolicy,base),/static fixture/);
});

test('job manifest and assembly cannot lose, duplicate or reorder results', () => {
  const jobs = preparationJobs(base);
  assert.equal(jobs.length,82);
  assert.equal(jobs.filter(j => j.kind === 'coverage').length,74);
  assert.equal(jobs[0].time,0);
  assert.equal(jobs[11].time,27.5);
  assert.equal(jobs[72].name,'bulb-stress');
  assert.equal(jobs[73].name,'sphere');
  const rows = jobs.map(j => ({ id: j.id, value: j }));
  const fixture = assembleFixtures(base,{},rows);
  assert.equal(fixture.coverage.length,74);
  assert.equal(fixture.precision.results.length,8);
  assert.throws(() => assembleFixtures(base,{},rows.slice(1)),/identity/);
  [rows[0],rows[1]] = [rows[1],rows[0]];
  assert.throws(() => assembleFixtures(base,{},rows),/identity/);
});

test('coverage audit checks camera, profile, conservation and normal counts', () => {
  const job = { name: 'sphere', profile: 'draft', time: 0 };
  const row = prepareCoverage(job.name,job.profile,job.time,base.anchor);
  auditCoverage(row,job,base);
  const bad = structuredClone(row);
  bad.counts.miss++;
  assert.throws(() => auditCoverage(bad,job,base),/coverage range/);
  bad.counts.miss--;
  bad.counts.normalAvailable = bad.counts.hit+1;
  assert.throws(() => auditCoverage(bad,job,base),/normal count/);
  const wrong = structuredClone(row);
  wrong.effectiveProfile.k = .9;
  assert.throws(() => auditCoverage(wrong,job,base),/coverage profile/);
});

test('precision audit validates conversions, statuses and derived exclusions', () => {
  const set = preparePrecision(.1,base.anchor);
  auditPrecision(set,.1,base.anchor);
  set.rows[0].requested.eligible = !set.rows[0].requested.eligible;
  assert.throws(() => auditPrecision(set,.1,base.anchor),/precision eligibility/);
  set.rows[0].requested.eligible = !set.rows[0].requested.eligible;
  set.rows[0].requested.primary.status = 'typo';
  assert.throws(() => auditPrecision(set,.1,base.anchor),/status/);
});

const workerURL = body => new URL('data:text/javascript,'+encodeURIComponent(
  "import { parentPort } from 'node:worker_threads';\n"+body
));

test('parallel completion still produces identical ordered bytes', async () => {
  const jobs = Array.from({ length: 5 },(_,id) => ({ id }));
  const worker = workerURL(
    'parentPort.on("message",j=>setTimeout(()=>parentPort.postMessage({id:j.id,value:j.id*j.id}),20-j.id*3));'
  );
  const a = await runJobs(jobs,null,{ workers: 1, workerURL: worker });
  const b = await runJobs(jobs,null,{ workers: 3, workerURL: worker });
  assert.equal(canonical(a),canonical(b));
  assert.deepEqual(b.map(r => r.value),[0,1,4,9,16]);
});

test('worker errors, wrong identities and clean premature exit fail the pool', async () => {
  for (const body of [
    'parentPort.on("message",()=>{throw Error("deliberate");});',
    'parentPort.on("message",()=>process.exit(0));',
    'parentPort.on("message",()=>parentPort.postMessage({id:99,value:0}));'
  ]) {
    await assert.rejects(
      runJobs([{ id: 0 },{ id: 1 }],null,{ workers: 2, workerURL: workerURL(body) })
    );
  }
});

test('canonical file codec and command options fail closed', () => {
  const text = encodeFixtures({ z: [1,2], a: true });
  assert.equal(text,'{"a":true,"z":[1,2]}\n');
  assert.deepEqual(decodeFixtures(Buffer.from(text)),{ a: true, z: [1,2] });
  assert.throws(() => decodeFixtures(Buffer.from('{"z":[1,2],"a":true}\n')),/canonical/);
  assert.throws(() => decodeFixtures(Buffer.from('{"a":true,"a":false}\n')),/canonical/);
  assert.throws(() => encodeFixtures({ x: Infinity }),/nonfinite/);
  assert.equal(options(['--workers=8'],['--workers']).workers,8);
  assert.throws(() => options(['--workers=0'],['--workers']),/workers/);
  assert.throws(() => options(['--force'],['--workers']),/option/);
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
node --test spikes/project0/tests/fixtures.test.mjs
```

Expected: nonzero exit with `ERR_MODULE_NOT_FOUND` for `fixture-definition.js`.

- [ ] **Step 3: Define the deterministic workload**

Create `spikes/project0/fixture-definition.js`:

```js
import { ARITH_STATUS, RAY_STATUS, UNRESOLVED_REASON } from './contract.js';
import { bulb } from './reference/bulb.js';
import { complex } from './reference/complex.js';
import { quaternionOrbit } from './reference/quaternion.js';
import { F32_MAX, nextDown, nextUp, derivativeFitsF32 } from './reference/f32.js';
import { norm, pose, burstRequests } from './reference/camera.js';
import { analyticFixtures } from './reference/geometry.js';
import { profiles } from './reference/trace.js';
import { sensitivity } from './reference/sensitivity.js';
import { makeAnchor, rangeAudit } from './reference/preparation.js';

export function derivativeVectors() {
  const tiny = 2 ** -149;
  return [
    [0,0], [0,F32_MAX], [1,0], [tiny,tiny], [1,tiny],
    [tiny,F32_MAX], [F32_MAX,tiny],
    [1,nextDown(F32_MAX)], [1,F32_MAX],
    [2,nextDown(F32_MAX/2)], [2,F32_MAX/2], [2,nextUp(F32_MAX/2)],
    [2,Math.fround(.375*F32_MAX)], [2,F32_MAX], [F32_MAX,1],
    [nextDown(2 ** -126),F32_MAX], [2 ** -126,F32_MAX]
  ].map(([grow,dr]) => ({ grow, dr, fits: derivativeFitsF32(grow,dr) }));
}

export function resourceLayout() {
  const width = 3840;
  const height = 2160;
  const definitions = [
    ['depth','r32float',4], ['normal','rgba16float',8],
    ['status','r32uint',4], ['orbit','rgba16float',8],
    ['accumulation','rgba32float',16], ['display','rgba8unorm',4],
    ['retained','rgba8unorm',4]
  ];
  const entries = definitions.map(([name,format,bytesPerPixel],index) => ({
    name, kind: 'texture', index, format, bytesPerPixel,
    width, height, count: 1, mipLevelCount: 1, arrayLayerCount: 1,
    sampleCount: 1, bytesEach: width*height*bytesPerPixel,
    bytes: width*height*bytesPerPixel
  }));
  entries.push({
    name: 'staging', kind: 'buffer', format: 'rgba8', bytesPerPixel: 4,
    width, height: 256, count: 2, bytesPerRow: width*4,
    bytesEach: width*256*4, bytes: 2*width*256*4
  });
  return {
    width, height, entries,
    tableBytes: entries.reduce((sum,e) => sum+e.bytes,0),
    capBytes: 2 ** 30,
    pattern: {
      xMultiplier: 13, yMultiplier: 17, modulus: 251,
      floatOffset: .25, unormDivisor: 255, everyChannel: true
    },
    readback: {
      x: [0,1920,3839], y: [0,1080,2159],
      sourceFormat: true,
      fullBand: { width, height: 256, bytesPerRow: 15360 }
    }
  };
}

export function baseFixtures() {
  const anchor = makeAnchor();
  const audit = rangeAudit();
  const arithmetic = { bulb: [], plane: [] };
  for (let z=0; z<16; z++) for (let y=0; y<16; y++) for (let x=0; x<16; x++) {
    const requested = [x,y,z].map(i => -1.2+2.4*(i+.5)/16);
    const input = requested.map(Math.fround);
    arithmetic.bulb.push({
      id: arithmetic.bulb.length, requested, input,
      ...sensitivity(input, p => bulb(p,64,audit.visit), {
        logR: 1e-4, de: 1e-3
      })
    });
  }
  for (let j=0; j<64; j++) for (let i=0; i<64; i++) {
    const requested = [-1.5+3*(i+.5)/64,-1.5+3*(j+.5)/64,-.2,.8];
    const input = requested.map(Math.fround);
    arithmetic.plane.push({
      id: arithmetic.plane.length, requested, input,
      ...sensitivity(
        input,
        v => complex(v.slice(0,2),v.slice(2),128),
        { logR: 1e-5 }
      )
    });
  }
  const q = [.25,.5,.125,-.25];
  const requestedC = [-.2,.8,0,0];
  const C = requestedC.map(Math.fround);
  arithmetic.offplane = { q, requestedC, C, orbit: quaternionOrbit(q,C,8) };

  const analytic = analyticFixtures();
  for (const fixture of Object.values(analytic)) {
    fixture.effectiveOrigins = fixture.rays.flatMap(r => r.effectiveOrigin);
    fixture.effectiveDirections = fixture.rays.flatMap(r => r.effectiveDirection);
  }

  const ordinary = ['bulb-overview','bulb-detail-0.05','bulb-detail-0.005'];
  const views = Object.fromEntries([...ordinary,'bulb-stress','sphere'].map(name => [
    name, {
      model: name === 'sphere' ? 'sphere' : 'bulb',
      camera: pose(name,0,anchor),
      profiles: name === 'bulb-stress' ? ['stress']
        : name === 'sphere' ? ['draft'] : ['draft','settled'],
      traceOverrides: name === 'sphere' ? { k: 1 } : {}
    }
  ]));
  const small = 2 ** -25;
  return {
    schema: 1, version: 1,
    statusVocabulary: {
      arithmetic: ARITH_STATUS,
      ray: RAY_STATUS,
      unresolvedReason: UNRESOLVED_REASON
    },
    projection: {
      verticalFovDegrees: 60, worldUp: [0,0,1], handedness: 'right',
      pixelCentreOffset: [.5,.5], topRow: 0
    },
    display: { width: 1280, height: 720, devicePixelRatio: 1 },
    models: {
      bulb: {
        power: 8, bailout: 2, z0: [0,0,0], dr0: 0,
        boundRadius: 1.25, category: 'heuristic'
      },
      sphere: { radius: 1, centre: [0,0,0], boundRadius: 2 },
      box: {
        halfExtents: [1,.5,.25], rotationZ: Math.PI/6,
        boundRadius: 2, exteriorOnly: true
      },
      'menger-1': {
        depth: 1, boundMin: [-1,-1,-1],
        boundMax: [1,1,1], exteriorOnly: true
      },
      'menger-2': {
        depth: 2, boundMin: [-1,-1,-1],
        boundMax: [1,1,1], exteriorOnly: true
      },
      qjulia: { bailout: 2, requestedC, C, storage: ['a','b','c','d'] }
    },
    views, profiles, anchor, analytic, arithmetic,
    arithmeticProtocol: {
      bulb: { iterations: 64, tolerances: { logR: 1e-4, de: 1e-3 } },
      plane: { iterations: 128, tolerances: { logR: 1e-5 } },
      offplane: {
        iterations: 8, absoluteTolerance: 1e-6, relativeTolerance: 1e-5
      },
      eligibilityFloor: .8, sensitivityFraction: .25
    },
    derivativePolicy: derivativeVectors(),
    shading: {
      normalOffsetFactor: .5, light: norm([1,.6,1.5]),
      ambient: .15, diffuse: .85, background: [.02,.02,.03],
      unresolved: [1,0,1], failure: [1,0,0], unavailableNormal: [.5,.5,.5]
    },
    motion: {
      overview: {
        radius: 2.4, height: .7,
        initialAngle: Math.atan2(-1.44,1.92), periodSeconds: 30
      },
      detail: { periodSeconds: 10, amplitudeRadians: Math.PI/18 },
      preparationPhases: Array.from({ length: 12 },(_,i) => i*2.5)
    },
    bursts: {
      trials: 3, burstCount: 20, requestsPerBurst: 20,
      spacingMs: 8, quietMs: 1000, durationMs: 23040,
      requests: burstRequests()
    },
    resources: resourceLayout(),
    stability: {
      cycleCount: 60, cycleMs: 10000,
      phaseOffsetsMs: [0,3000,4000,7000,10000],
      phases: [
        'bulb-overview','sphere',
        'bulb-detail-0.005','stress-replace-resize'
      ],
      resizeBacking: [[1280,720],[1920,1080],[960,540]],
      resourceEvery: 10, baselineBacking: [1280,720],
      allocationTolerance: .01,
      internalScale: .5, restartMotionEachPhase: true,
      maintenanceDeadline: 'next-cycle-boundary',
      baseline: [
        'prewarm-all','restore-backing','drain','release-transient','record'
      ],
      final: ['restore-backing','drain','release-transient','compare']
    },
    coverage: [],
    precision: {
      distances: [.1,.01,.001,.0001,.00001,.000001,.0000001,.00000001],
      columns: [608,671], rows: [328,391],
      primaryProfile: 'precision', tighterProfile: 'precisionTight',
      convergenceRelative: .001, convergenceDenominator: 'tighter',
      depthRelative: .01, discrepancyFraction: .05,
      maximumIneligibleFraction: .5, anchorRelative: .001,
      results: []
    },
    primitives: [
      {
        op: 'two_sum', args: [1,small], value: 1+small,
        absoluteTolerance: 0, thenAdd: [-1,0], thenValue: small
      },
      {
        op: 'two_sum', args: [1,-1], value: 0, absoluteTolerance: 0
      },
      {
        op: 'add_ff', args: [[1,small],[-1,0]],
        value: small, absoluteTolerance: 0
      },
      {
        op: 'add_ff', args: [[1,small],[-1,small]],
        value: 2*small, absoluteTolerance: 0
      },
      {
        op: 'mul_ff_f32', args: [[1,small],3],
        value: 3+3*small, absoluteTolerance: 0
      },
      {
        op: 'mul_ff_f32', args: [[1,small],0],
        value: 0, absoluteTolerance: 0
      }
    ],
    compensated: {
      pairs: ['origin','t','sample-position','iterate-between-steps'],
      f32: ['ray-direction','power-map','running-derivative','estimator','normals'],
      roundIterateBeforePower: true, addSampleAsPair: true
    },
    costProtocol: { warmups: 3, measured: 10 },
    rangeDiagnostics: { arithmetic: audit.data }
  };
}

export function preparationJobs(base) {
  const jobs = [];
  for (const name of ['bulb-overview','bulb-detail-0.05','bulb-detail-0.005']) {
    for (const profile of ['draft','settled']) {
      for (const time of base.motion.preparationPhases) {
        jobs.push({ kind: 'coverage', name, profile, time });
      }
    }
  }
  jobs.push(
    { kind: 'coverage', name: 'bulb-stress', profile: 'stress', time: 0 },
    { kind: 'coverage', name: 'sphere', profile: 'draft', time: 0 }
  );
  for (const distance of base.precision.distances) {
    jobs.push({ kind: 'precision', distance });
  }
  return jobs.map((job,id) => ({ id, ...job }));
}

export function assembleFixtures(base,provenance,results) {
  const jobs = preparationJobs(base);
  if (
    results.length !== jobs.length ||
    jobs.some((j,i) => results[i]?.id !== j.id)
  ) {
    throw new Error('preparation result identity/order');
  }
  return {
    ...base, provenance,
    coverage: results
      .filter(r => jobs[r.id].kind === 'coverage')
      .map(r => r.value),
    precision: {
      ...base.precision,
      results: results
        .filter(r => jobs[r.id].kind === 'precision')
        .map(r => r.value)
    }
  };
}
```

The first primitive’s `thenAdd` operates on the pair actually returned by `two_sum`. Supplying the known expected pair instead would bypass the mandatory preservation test.

- [ ] **Step 4: Implement the numerical and structural audit**

Create `spikes/project0/fixture-audit.js`:

```js
import { canonical, assertRayStatus } from './contract.js';
import { coverageValid } from './metrics.js';
import { add, scale, pose, ray } from './reference/camera.js';
import { split } from './reference/f32.js';
import { profiles, angularPixelSize } from './reference/trace.js';
import {
  referenceAgreement, precisionStopReasons
} from './reference/preparation.js';
import { baseFixtures, preparationJobs } from './fixture-definition.js';

function requireValue(ok,message) {
  if (!ok) throw new Error(message);
}

function equal(actual,expected,message) {
  requireValue(canonical(actual) === canonical(expected),message);
}

function auditRange(a) {
  requireValue(a && Number.isFinite(a.maxDr) && a.maxDr >= 0,'range maximum');
  for (const key of ['updates','doubleRangeCrossings','roundedOperandCrossings']) {
    requireValue(Number.isSafeInteger(a[key]) && a[key] >= 0,'range count');
  }
  requireValue(
    a.doubleRangeCrossings <= a.updates &&
    a.roundedOperandCrossings <= a.updates,
    'range count exceeds updates'
  );
  requireValue(
    (a.witness === null) === (a.roundedOperandCrossings === 0),
    'range witness'
  );
  canonical(a);
}

export function auditCoverage(row,job,base) {
  equal(
    [row.name,row.profile,row.time],
    [job.name,job.profile,job.time],
    'coverage identity'
  );
  equal(row.camera,pose(job.name,job.time,base.anchor),'coverage camera');
  const expected = {
    ...profiles[job.profile],
    ...base.views[job.name].traceOverrides
  };
  equal(row.effectiveProfile,expected,'coverage profile');
  requireValue(row.counts.total === expected.W*expected.H,'coverage dimensions');
  requireValue(coverageValid(row.name,row.counts),'coverage range');
  requireValue(
    Number.isInteger(row.counts.normalAvailable) &&
    row.counts.normalAvailable >= 0 &&
    row.counts.normalAvailable <= row.counts.hit,
    'normal count'
  );
  auditRange(row.audit);
}

function auditTrace(value) {
  assertRayStatus(value);
  requireValue(
    Number.isInteger(value.steps) &&
    value.steps >= 0 &&
    value.steps <= profiles.precision.steps,
    'reference steps'
  );
  requireValue(
    value.status === 'miss'
      ? value.t === null
      : Number.isFinite(value.t) && value.t >= 0,
    'reference depth'
  );
}

export function auditPrecision(set,distance,anchor) {
  const origin = add(anchor.A,scale(anchor.D,-distance));
  const originPairs = origin.map(split);
  equal(
    {
      distance: set.distance,
      origin: set.origin,
      originPairs: set.originPairs,
      roundedOrigin: set.roundedOrigin,
      pairOrigin: set.pairOrigin,
      angularPixelSize: set.angularPixelSize,
      nominalFootprintAtAnchor: set.nominalFootprintAtAnchor,
      primaryProfile: set.primaryProfile,
      tighterProfile: set.tighterProfile
    },
    {
      distance, origin, originPairs,
      roundedOrigin: origin.map(Math.fround),
      pairOrigin: originPairs.map(([hi,lo]) => hi+lo),
      angularPixelSize: angularPixelSize(profiles.precision),
      nominalFootprintAtAnchor: angularPixelSize(profiles.precision)*distance,
      primaryProfile: 'precision',
      tighterProfile: 'precisionTight'
    },
    'precision inputs'
  );
  requireValue(
    Array.isArray(set.rows) && set.rows.length === 4096,
    'precision ray count'
  );
  const camera = { origin, target: anchor.A };
  let ineligible = 0;
  for (let id=0; id<4096; id++) {
    const row = set.rows[id];
    const pixel = [608+id%64,328+Math.floor(id/64)];
    equal([row.id,row.pixel],[id,pixel],'precision ray identity');
    const direction = ray(camera,1280,720,...pixel).direction;
    equal(row.direction,direction,'requested direction');
    equal(
      row.effectiveDirection,direction.map(Math.fround),
      'effective direction'
    );
    for (const key of [
      'requested','directionRounded','baselineInput','compensatedInput'
    ]) {
      const value = row[key];
      auditTrace(value.primary);
      auditTrace(value.tighter);
      equal(
        value,
        referenceAgreement(value.primary,value.tighter),
        'precision eligibility'
      );
    }
    ineligible += Number(!row.requested.eligible);
  }
  equal(set.ineligible,ineligible,'precision exclusion count');
  equal(
    set.stopReasons,
    precisionStopReasons(ineligible,anchor.delta,distance),
    'precision stop'
  );
  auditRange(set.audit);
}

export function auditStatic(fixtures,base=baseFixtures()) {
  canonical(fixtures);
  const { provenance, ...withoutProvenance } = fixtures;
  equal(
    {
      ...withoutProvenance,
      coverage: [],
      precision: { ...fixtures.precision, results: [] }
    },
    base,
    'static fixture mismatch'
  );
  requireValue(
    provenance && typeof provenance === 'object',
    'missing provenance'
  );
  const eligible = {};
  for (const name of ['bulb','plane']) {
    eligible[name] = fixtures.arithmetic[name].filter(r => r.eligible).length;
    requireValue(eligible[name] >= .8*4096,'eligibility floor');
  }
  return eligible;
}

export function auditFixtures(fixtures,base=baseFixtures()) {
  const eligible = auditStatic(fixtures,base);
  const jobs = preparationJobs(base);
  const coverageJobs = jobs.filter(j => j.kind === 'coverage');
  requireValue(
    fixtures.coverage.length === coverageJobs.length,
    'coverage job count'
  );
  fixtures.coverage.forEach((row,i) => {
    auditCoverage(row,coverageJobs[i],base);
  });
  const distances = base.precision.distances;
  requireValue(
    fixtures.precision.results.length === distances.length,
    'precision job count'
  );
  fixtures.precision.results.forEach((set,i) => {
    auditPrecision(set,distances[i],base.anchor);
  });
  const firstStop = fixtures.precision.results.find(set => set.stopReasons.length);
  const ranges = [
    ['arithmetic',fixtures.rangeDiagnostics.arithmetic],
    ['anchor',fixtures.anchor.audit],
    ...fixtures.coverage.map((r,i) => ['coverage/'+i,r.audit]),
    ...fixtures.precision.results.map((r,i) => ['precision/'+i,r.audit])
  ];
  return {
    coverageFrames: fixtures.coverage.length,
    precisionSets: distances.length,
    arithmeticEligible: eligible,
    firstPrecisionStop: firstStop
      ? { distance: firstStop.distance, reasons: firstStop.stopReasons }
      : null,
    ranges: ranges.map(([id,a]) => ({ id, ...a }))
  };
}
```

This audit recomputes the inexpensive definitions and derived decisions. Full trace regeneration is the separate `--recompute` operation below.

CPU preparation retains all eight precision distances, including any beyond the first stopping point. T12 interpretation still stops at the first applicable uncertainty condition.

- [ ] **Step 5: Implement the ordered worker pool**

Create `spikes/project0/fixture-pool.mjs`:

```js
import { Worker } from 'node:worker_threads';

export async function runJobs(jobs,anchor,{
  workers=8,
  workerURL=new URL('./prepare-worker.mjs',import.meta.url),
  onProgress=()=>{}
}={}) {
  if (!Number.isInteger(workers) || workers < 1 || workers > 16) {
    throw new Error('workers must be an integer in [1,16]');
  }
  if (jobs.some((job,i) => job.id !== i)) {
    throw new Error('job identity/order');
  }
  if (!jobs.length) return [];

  const pool = [];
  const output = new Array(jobs.length);
  let next = 0;
  let completed = 0;
  let settled = false;

  try {
    return await new Promise((resolve,reject) => {
      const fail = error => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      for (let i=0; i<Math.min(workers,jobs.length); i++) {
        const worker = new Worker(workerURL,{ workerData: { anchor } });
        pool.push(worker);
        let active = null;

        const assign = () => {
          if (settled || next === jobs.length) return;
          active = jobs[next++];
          worker.postMessage(active);
        };

        worker.on('error',fail);
        worker.on('exit',code => {
          if (!settled) {
            fail(new Error('preparation worker exited: '+code));
          }
        });
        worker.on('message',message => {
          if (settled) return;
          try {
            if (
              !active ||
              message.id !== active.id ||
              output[message.id]
            ) {
              throw new Error('worker result identity');
            }
            if (message.error) throw new Error(message.error);

            output[message.id] = {
              id: message.id,
              value: message.value
            };
            completed++;
            onProgress({ completed, total: jobs.length, job: active });
            active = null;

            if (completed === jobs.length) {
              settled = true;
              resolve(output);
            } else {
              assign();
            }
          } catch (error) {
            fail(error);
          }
        });
        assign();
      }
    });
  } finally {
    settled = true;
    await Promise.allSettled(pool.map(worker => worker.terminate()));
  }
}
```

Create `spikes/project0/prepare-worker.mjs`:

```js
import { parentPort, workerData } from 'node:worker_threads';
import {
  prepareCoverage, preparePrecision
} from './reference/preparation.js';

parentPort.on('message',job => {
  try {
    const anchor = workerData.anchor;
    let value;
    if (job.kind === 'coverage') {
      value = prepareCoverage(job.name,job.profile,job.time,anchor);
    } else if (job.kind === 'precision') {
      value = preparePrecision(job.distance,anchor);
    } else {
      throw new Error('unknown preparation job');
    }
    parentPort.postMessage({ id: job.id, value });
  } catch (error) {
    parentPort.postMessage({
      id: job.id,
      error: error.stack ?? String(error)
    });
  }
});
```

Worker completion order and progress messages never enter the fixture. A failed worker, unexpected exit or incorrect job identity aborts generation before writing the candidate.

- [ ] **Step 6: Implement file identity and committed-source verification**

Create `spikes/project0/fixture-files.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonical } from './contract.js';

export const ROOT = fileURLToPath(new URL('../../',import.meta.url));
export const SPEC =
  'docs/superpowers/specs/2026-10-18-project0-space-qualification-design.md';
export const FIXTURE = 'spikes/project0/fixtures.json';

export const SOURCE_PATHS = [
  'contract.js','metrics.js','gates.js','decision.js',
  'reference/bulb.js','reference/complex.js','reference/quaternion.js',
  'reference/f32.js','reference/camera.js','reference/geometry.js',
  'reference/trace.js','reference/sensitivity.js','reference/preparation.js',
  'fixture-definition.js','fixture-audit.js','fixture-pool.mjs',
  'fixture-files.mjs','prepare-worker.mjs',
  'prepare-fixtures.mjs','verify-fixtures.mjs',
  'tests/contract.test.mjs','tests/reference.test.mjs',
  'tests/geometry.test.mjs','tests/fixtures.test.mjs'
].map(path => 'spikes/project0/'+path).sort();

export const sha256 = bytes =>
  createHash('sha256').update(bytes).digest('hex');

export function git(...args) {
  return execFileSync('git',['-C',ROOT,...args],{
    maxBuffer: 256*1024*1024
  });
}

export function encodeFixtures(value) {
  return canonical(value)+'\n';
}

export function decodeFixtures(bytes) {
  const text = bytes.toString('utf8');
  const value = JSON.parse(text);
  if (encodeFixtures(value) !== text) {
    throw new Error('noncanonical fixture file');
  }
  return value;
}

export async function provenanceAt(
  commit=git('rev-parse','HEAD').toString().trim()
) {
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('invalid generator commit');
  }
  git('merge-base','--is-ancestor',commit,'HEAD');

  const sources = [];
  for (const path of SOURCE_PATHS) {
    const bytes = await readFile(ROOT+path);
    if (!bytes.equals(git('show',commit+':'+path))) {
      throw new Error('uncommitted or changed frozen source: '+path);
    }
    sources.push({ path, sha256: sha256(bytes) });
  }

  const spec = await readFile(ROOT+SPEC);
  if (!spec.equals(git('show',commit+':'+SPEC))) {
    throw new Error('changed governing spec');
  }
  return {
    specPath: SPEC,
    specHash: sha256(spec),
    generatorCommit: commit,
    nodeVersion: process.version,
    sources
  };
}

export async function readVerifiedFile(candidate=false) {
  const bytes = await readFile(ROOT+FIXTURE);
  const fixtures = decodeFixtures(bytes);
  const expected = await provenanceAt(fixtures.provenance.generatorCommit);

  if (canonical(expected) !== canonical(fixtures.provenance)) {
    throw new Error('fixture provenance mismatch (including Node version)');
  }

  let fixtureCommit = null;
  if (!candidate) {
    fixtureCommit = git(
      'log','-1','--format=%H','HEAD','--',FIXTURE
    ).toString().trim();

    if (
      !/^[a-f0-9]{40}$/.test(fixtureCommit) ||
      !bytes.equals(git('show',fixtureCommit+':'+FIXTURE))
    ) {
      throw new Error('fixture is not frozen in HEAD history');
    }
    git(
      'merge-base','--is-ancestor',
      fixtures.provenance.generatorCommit,fixtureCommit
    );
  }

  return {
    bytes,
    fixtures,
    identity: {
      fixtureHash: sha256(bytes),
      fixtureCommit,
      specHash: fixtures.provenance.specHash
    }
  };
}

export function options(args,allowed) {
  const result = { workers: 8, candidate: false, recompute: false };
  const seen = new Set();

  for (const argument of args) {
    const [key,...rest] = argument.split('=');
    if (!allowed.includes(key) || seen.has(key)) {
      throw new Error('invalid option: '+argument);
    }
    seen.add(key);

    if (key === '--workers') {
      if (
        rest.length !== 1 ||
        !/^(?:[1-9]|1[0-6])$/.test(rest[0])
      ) {
        throw new Error('workers must be an integer in [1,16]');
      }
      result.workers = Number(rest[0]);
    } else {
      if (rest.length) throw new Error('flag takes no value: '+key);
      result[key.slice(2)] = true;
    }
  }
  return result;
}

export function auditSummary(audit) {
  const { ranges, ...rest } = audit;
  return {
    ...rest,
    maximumDr: Math.max(...ranges.map(r => r.maxDr)),
    rangeCrossings: ranges.filter(
      r => r.doubleRangeCrossings || r.roundedOperandCrossings
    )
  };
}
```

The exact Node version is part of reproduction provenance. Changing it requires an explicit fixture-reproduction decision; the verifier does not silently accept a different numerical runtime.

- [ ] **Step 7: Implement candidate generation**

Create `spikes/project0/prepare-fixtures.mjs`:

```js
import { writeFile, lstat } from 'node:fs/promises';
import {
  baseFixtures, preparationJobs, assembleFixtures
} from './fixture-definition.js';
import { auditFixtures } from './fixture-audit.js';
import { runJobs } from './fixture-pool.mjs';
import {
  ROOT, FIXTURE, provenanceAt, encodeFixtures,
  sha256, options, auditSummary
} from './fixture-files.mjs';

const configuration = options(process.argv.slice(2),['--workers']);

try {
  await lstat(ROOT+FIXTURE);
  throw new Error(
    'fixtures.json already exists; never overwrite a frozen workload'
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const provenance = await provenanceAt();
const base = baseFixtures();

const results = await runJobs(preparationJobs(base),base.anchor,{
  workers: configuration.workers,
  onProgress: row => console.error(JSON.stringify(row))
});

const fixtures = assembleFixtures(base,provenance,results);
const audit = auditFixtures(fixtures,base);

if (
  encodeFixtures(provenance) !==
  encodeFixtures(await provenanceAt(provenance.generatorCommit))
) {
  throw new Error('source changed during preparation');
}

const text = encodeFixtures(fixtures);
await writeFile(ROOT+FIXTURE,text,{ flag: 'wx' });

console.log(JSON.stringify({
  status: 'CANDIDATE WRITTEN',
  fixtureHash: sha256(text),
  audit: auditSummary(audit)
}));
```

There is no overwrite or force option. A failed coverage or eligibility audit is resolved with the peer before freezing. It does not trigger automatic camera, tolerance or exclusion changes.

- [ ] **Step 8: Implement candidate and frozen-fixture verification**

Create `spikes/project0/verify-fixtures.mjs`:

```js
import {
  baseFixtures, preparationJobs, assembleFixtures
} from './fixture-definition.js';
import { auditFixtures } from './fixture-audit.js';
import { runJobs } from './fixture-pool.mjs';
import {
  readVerifiedFile, provenanceAt, encodeFixtures, options, auditSummary
} from './fixture-files.mjs';

const configuration = options(
  process.argv.slice(2),
  ['--candidate','--recompute','--workers']
);

const { bytes, fixtures, identity } =
  await readVerifiedFile(configuration.candidate);

const base = baseFixtures();
const audit = auditFixtures(fixtures,base);

if (configuration.recompute) {
  const results = await runJobs(preparationJobs(base),base.anchor,{
    workers: configuration.workers,
    onProgress: row => console.error(JSON.stringify(row))
  });
  const rebuilt = assembleFixtures(base,fixtures.provenance,results);
  auditFixtures(rebuilt,base);

  if (encodeFixtures(rebuilt) !== bytes.toString('utf8')) {
    throw new Error('CPU regeneration differs from fixture bytes');
  }
}

if (
  encodeFixtures(fixtures.provenance) !==
  encodeFixtures(await provenanceAt(fixtures.provenance.generatorCommit))
) {
  throw new Error('source changed during verification');
}

console.log(JSON.stringify({
  status: configuration.candidate ? 'CANDIDATE OK' : 'FIXTURES OK',
  recomputed: configuration.recompute,
  identity,
  audit: auditSummary(audit)
}));
```

- [ ] **Step 9: Run the complete CPU suite**

Run:

```bash
node --test spikes/project0/tests/*.test.mjs
```

Expected:

```text
# tests 27
# pass 27
# fail 0
```

This includes the original 19 tests and eight T4 tests. No browser or GPU is involved.

- [ ] **Step 10: Review and commit the generator before producing fixtures**

Codex hands back the worktree patch. Claude reviews, applies and reruns Step 9. Once the bridge run has ended, Claude commits the source files:

```bash
git add \
  spikes/project0/fixture-definition.js \
  spikes/project0/fixture-audit.js \
  spikes/project0/fixture-pool.mjs \
  spikes/project0/fixture-files.mjs \
  spikes/project0/prepare-worker.mjs \
  spikes/project0/prepare-fixtures.mjs \
  spikes/project0/verify-fixtures.mjs \
  spikes/project0/tests/fixtures.test.mjs
git commit -m "Add deterministic Project 0 fixture preparation"
```

Expected: one source commit; `fixtures.json` does not yet exist.

The source commit must precede generation. Its revision becomes `provenance.generatorCommit`.

- [ ] **Step 11: Generate the candidate using eight workers**

Run outside an active bridge review:

```bash
mkdir -p artifacts/project0/preparation
node spikes/project0/prepare-fixtures.mjs --workers=8 > artifacts/project0/preparation/generation.json
cat artifacts/project0/preparation/generation.json
```

Expected:

- Progress records on stderr, ending with `completed: 82`.
- Exit code 0.
- A newly created `spikes/project0/fixtures.json`.
- Summary status `CANDIDATE WRITTEN`.
- `coverageFrames: 74`.
- `precisionSets: 8`.
- Arithmetic eligibility `{bulb: 3972, plane: 3684}`.
- A computed fixture SHA-256.

Read the range-crossing summary. Any crossing must be examined with its stored witness before the freeze; it is not permission to clamp, rescale or relabel the reference.

- [ ] **Step 12: Reproduce every result using four workers**

Run:

```bash
node spikes/project0/verify-fixtures.mjs --candidate --recompute --workers=4 > artifacts/project0/preparation/audit.json
cat artifacts/project0/preparation/audit.json
```

Expected:

- Exit code 0.
- `status: "CANDIDATE OK"`.
- `recomputed: true`.
- `identity.fixtureCommit: null`.
- The same fixture hash as Step 11.
- All 82 jobs reproduced, with identical serialized bytes.

Different worker counts exercise scheduling independence without altering the mathematical workload. Timestamps, durations and worker identities are deliberately absent from the fixture.

This operation only reads the candidate; it does not replace it.

- [ ] **Step 13: Review the candidate, then make the freeze commit**

Give the peer the candidate, generation summary and reproduction audit for read-only review. Confirm:

- All 74 coverage preparations passed.
- Both arithmetic grids satisfy the 80% floor.
- All exclusions, conversion variants and precision stopping reasons are retained.
- The denominator for convergence is the tighter trace’s depth.
- Resource bytes total 405,995,520.
- Derivative-policy vectors and flat analytic arrays match their canonical sources.
- Any recorded range crossings have been explained.
- No GPU result or performance measurement influenced fixture selection.

After peer acceptance and after the bridge run ends:

```bash
git add spikes/project0/fixtures.json
git commit -m "Freeze Project 0 qualification fixtures v1"
node spikes/project0/verify-fixtures.mjs > artifacts/project0/preparation/frozen.json
cat artifacts/project0/preparation/frozen.json
```

Expected:

- A separate fixture freeze commit.
- Exit code 0.
- `status: "FIXTURES OK"`.
- The unchanged fixture hash.
- A non-null `identity.fixtureCommit` identifying the freeze commit.

**T4 is complete only at this point. T5 may now begin.** Later harness commits may add files, but changing any frozen source, the governing spec or fixture bytes causes verification to fail.


---

---

### Task T5: Evidence identity, the WebGPU device module and the first hardware probe (after the freeze)

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).
**Precondition:** T4 is complete. `node spikes/project0/verify-fixtures.mjs` must report
`FIXTURES OK` with a non-null `identity.fixtureCommit`.

**Files:**
- Create: `spikes/project0/evidence.mjs` (Node). Evidence identities, artefact hashing and
  collision-safe record writing.
- Create: `spikes/project0/gpu/device.js` (browser). The only module that requests an adapter
  or device. It owns the device epoch and the synchronous loss path.
- Create: `spikes/project0/gpu/probe.wgsl`.
- Create: `spikes/project0/browser/probe.js`, the `?mode=probe` driver.
- Create: `spikes/project0/probe.mjs` (Node entry point).
- Test: `spikes/project0/tests/evidence.test.mjs`.

**Interfaces:**
- Consumes:
  - T0: `startServer`, `launchChrome`, `effectiveCommandLine`, `assertSandboxed`, `HARNESS_PATH`, `ROOT`;
  - T1: `canonical`;
  - T4: `readVerifiedFile(false) → {bytes, fixtures, identity: {fixtureHash, fixtureCommit, specHash}}`
    from `fixture-files.mjs`.
- Produces (Node, `evidence.mjs`):
  - `sha256(data) → hex64`;
  - `fixtureIdentity({readVerified?}) → identity`. It is exactly T4's verified identity, and
    verification errors propagate;
  - `implementationIdentity({gitFn?}) → {implementationCommit, implementationHash}`. The hash
    covers every committed file under `spikes/project0/` except `fixtures.json` and `tests/`, in
    sorted path order. It throws if any of them has uncommitted changes;
  - `launchIdentity({requestedArgs, mode, commandLine}) → {launchHash, mode}`;
  - `environmentIdentity(chromeGpuText, {browserVersion, browserExecutable, session}) → {...}`.
    It throws if the driver information is absent;
  - `newRunDir(label) → path`, which refuses an existing directory;
  - `writeRecord(runDir, record, artifacts) → record`. It rejects artefact names that collide
    with each other or with `<record.id>.json`, writes the artefacts, then the record.
- Produces (browser, `gpu/device.js`):
  - `acquire({requiredFeatures?}) → {adapter, device, info, epoch}`. `info` records
    `vendor`, `architecture`, `device` and `description` (empty strings kept), plus
    `isFallbackAdapter` (`null` when not exposed), `fallbackSource`, `features`,
    `grantedFeatures` and `limits`;
  - `onLoss(handler) → unsubscribe`;
  - `currentEpoch() → number`;
  - `injectLoss() → void`;
  - `destroy() → void`.

  Loss handling, real or injected, goes through `signalLoss`, which advances the epoch
  **before** notifying anyone.

- [ ] **Step 1: Write the failing evidence tests**

```js
// spikes/project0/tests/evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { sha256, fixtureIdentity, launchIdentity, environmentIdentity, writeRecord } from '../evidence.mjs';

test('sha256 is the lowercase hex digest', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('fixture identity is exactly T4\'s verified identity, requested in non-candidate mode', async () => {
  const identity = { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) };
  let arg;
  assert.deepEqual(await fixtureIdentity({ readVerified: async candidate => { arg = candidate; return { identity }; } }), identity);
  assert.equal(arg, false);
  await assert.rejects(fixtureIdentity({ readVerified: async () => { throw new Error('fixture bytes differ from the freeze commit'); } }), /freeze commit/);
});

test('launch identity depends on flags, mode and the effective command line', () => {
  const a = launchIdentity({ requestedArgs: ['--enable-gpu'], mode: 'headed', commandLine: 'chrome --enable-gpu' });
  const b = launchIdentity({ requestedArgs: ['--enable-gpu'], mode: 'headless', commandLine: 'chrome --enable-gpu --headless' });
  assert.match(a.launchHash, /^[a-f0-9]{64}$/); assert.notEqual(a.launchHash, b.launchHash);
});

test('environment identity extracts the driver from chrome://gpu text, or refuses', () => {
  const text = 'Driver Information\nDriver vendor\tNVIDIA\nDriver version\t580.173.02\n';
  const env = environmentIdentity(text, { browserVersion: 'Google Chrome 151.0.7922.108', browserExecutable: '/opt/google/chrome/chrome', session: 'wayland' });
  assert.equal(env.driver, 'NVIDIA 580.173.02');
  assert.throws(() => environmentIdentity('nothing', { browserVersion: 'x', browserExecutable: 'y', session: 'z' }), /driver/);
});

test('writeRecord refuses artefact names that collide with each other or with the record', async () => {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'p0-evidence-test-'));
  try {
    const record = { id: 'probe-headed' };
    await assert.rejects(writeRecord(dir, record, [{ name: 'probe-headed.json', data: '{}' }]), /collides with the record/);
    await assert.rejects(writeRecord(dir, record, [{ name: 'a.raw.json', data: '1' }, { name: 'a.raw.json', data: '2' }]), /duplicate artefact/);
    await writeRecord(dir, { id: 'ok' }, [{ name: 'ok.raw.json', data: '{"x":1}' }]);
    assert.deepEqual((await readdir(dir)).sort(), ['ok.json', 'ok.raw.json']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/evidence.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/evidence.mjs`.

- [ ] **Step 3: Implement `evidence.mjs`**

```js
// spikes/project0/evidence.mjs — evidence identity and record persistence (Node only).
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { ROOT } from './launch.mjs';
import { canonical } from './contract.js';
import { readVerifiedFile } from './fixture-files.mjs';

const run = promisify(execFile);
const git = async args => (await run('git', args, { cwd: ROOT })).stdout;
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export async function fixtureIdentity({ readVerified = readVerifiedFile } = {}) {
  const { identity } = await readVerified(false);
  return identity;
}

async function harnessFiles(dir = resolve(ROOT, 'spikes/project0')) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'tests') out.push(...await harnessFiles(path)); }
    else if (entry.name !== 'fixtures.json') out.push(path);
  }
  return out.sort();
}

export async function implementationIdentity({ gitFn = git } = {}) {
  if ((await gitFn(['status', '--porcelain', '--untracked-files=all', '--', 'spikes/project0'])).trim()) throw new Error('harness has uncommitted changes; commit before running GPU checks');
  const hash = createHash('sha256');
  for (const file of await harnessFiles()) hash.update(relative(ROOT, file)).update('\0').update(await readFile(file)).update('\0');
  return { implementationCommit: (await gitFn(['rev-parse', 'HEAD'])).trim(), implementationHash: hash.digest('hex') };
}

export const launchIdentity = ({ requestedArgs, mode, commandLine }) => ({ launchHash: sha256(canonical({ requestedArgs, mode, commandLine })), mode });

export function environmentIdentity(chromeGpuText, { browserVersion, browserExecutable, session }) {
  const vendor = /Driver vendor\s+(.+)/.exec(chromeGpuText)?.[1]?.trim();
  const version = /Driver version\s+(.+)/.exec(chromeGpuText)?.[1]?.trim();
  if (!vendor || !version) throw new Error('chrome://gpu has no driver vendor/version');
  return { browserVersion, browserExecutable, driver: `${vendor} ${version}`, session };
}

export async function newRunDir(label) {
  if (!/^[a-z0-9.-]+$/.test(label)) throw new Error(`invalid run label: ${label}`);
  const parent = resolve(ROOT, 'artifacts/project0');
  await mkdir(parent, { recursive: true });
  const dir = resolve(parent, `${new Date().toISOString().replace(/[-:.]/g, '')}-${label}`);
  await mkdir(dir);                                         // throws EEXIST rather than reusing a directory
  return dir;
}

export async function writeRecord(runDir, record, artifacts) {
  const names = new Set();
  for (const { name } of artifacts) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`invalid artefact name: ${name}`);
    if (name === `${record.id}.json`) throw new Error(`artefact ${name} collides with the record file`);
    if (names.has(name)) throw new Error(`duplicate artefact name: ${name}`);
    names.add(name);
  }
  record.artifacts = [];
  const root = resolve(ROOT, 'artifacts/project0');
  for (const { name, data } of artifacts) {
    await writeFile(join(runDir, name), data, { flag: 'wx' });
    record.artifacts.push({ path: relative(root, join(runDir, name)), sha256: sha256(data) });
  }
  await writeFile(join(runDir, `${record.id}.json`), canonical(record), { flag: 'wx' });
  return record;
}
```

`writeRecord` writes with `flag: 'wx'`, so nothing is ever overwritten. For the T5 test, the
artefact path is resolved relative to `artifacts/project0`. The test directory sits under
`artifacts/runtime`, so its recorded paths begin with `../runtime/`. That is harmless for the
test, and never happens for real run directories.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/evidence.test.mjs`
Expected: PASS, `# pass 5`, `# fail 0`.

- [ ] **Step 5: Write `gpu/device.js` and `gpu/probe.wgsl`**

```js
// spikes/project0/gpu/device.js — the only module that requests an adapter or device.
const state = { device: null, epoch: 0, handlers: new Set() };
export const currentEpoch = () => state.epoch;
export function onLoss(handler) { state.handlers.add(handler); return () => state.handlers.delete(handler); }

// Real and injected losses take the same path. The epoch advances *first*, so every completion still in
// flight already belongs to a retired epoch by the time any listener — or any late callback — runs.
function signalLoss({ reason, message = '', injected }) {
  const lostEpoch = state.epoch;
  state.epoch++;
  for (const handler of [...state.handlers]) handler({ epoch: lostEpoch, reason, message, injected });
}

export async function acquire({ requiredFeatures = [] } = {}) {
  if (!('gpu' in navigator)) throw Object.assign(new Error('navigator.gpu is absent'), { code: 'no-api' });
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw Object.assign(new Error('requestAdapter returned null'), { code: 'no-adapter' });
  const granted = requiredFeatures.filter(f => adapter.features.has(f));
  const device = await adapter.requestDevice({ requiredFeatures: granted });
  const epoch = ++state.epoch;
  state.device = device;
  device.lost.then(info => { if (epoch === state.epoch) signalLoss({ reason: info.reason, message: info.message, injected: false }); });
  device.addEventListener('uncapturederror', event => console.error(`uncapturederror: ${event.error.message}`));
  const i = adapter.info;
  const fallbackSource = 'isFallbackAdapter' in i ? 'adapter.info.isFallbackAdapter' : 'isFallbackAdapter' in adapter ? 'adapter.isFallbackAdapter' : 'not exposed';
  const isFallbackAdapter = fallbackSource === 'not exposed' ? null : Boolean(fallbackSource === 'adapter.info.isFallbackAdapter' ? i.isFallbackAdapter : adapter.isFallbackAdapter);
  const limits = Object.fromEntries(['maxComputeWorkgroupSizeX', 'maxStorageBufferBindingSize', 'maxBufferSize', 'maxTextureDimension2D', 'maxComputeInvocationsPerWorkgroup'].map(k => [k, device.limits[k]]));
  return { adapter, device, epoch, info: { vendor: i.vendor ?? '', architecture: i.architecture ?? '', device: i.device ?? '', description: i.description ?? '', isFallbackAdapter, fallbackSource, features: [...adapter.features].sort(), grantedFeatures: granted, limits } };
}

export function injectLoss() {                     // G13: an unexpected-loss notification through the recovery path
  const device = state.device; state.device = null;
  signalLoss({ reason: 'unknown', message: 'injected by G13', injected: true });
  device?.destroy();
}

export function destroy() {                        // intentional teardown: retire the epoch, then destroy
  const device = state.device; state.device = null;
  state.epoch++;
  device?.destroy();
}
```

```wgsl
// spikes/project0/gpu/probe.wgsl — writes out[i] = 3*i + 1 for i < n; n is deliberately not a multiple of 64.
struct Params { n: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.n) { return; }
  out[id.x] = 3u * id.x + 1u;
}
```

- [ ] **Step 6: Write `browser/probe.js`**

```js
// spikes/project0/browser/probe.js — first GPU run: adapter identity, one bounded dispatch with verified readback,
// canvas presentation (headed), and intentional destruction. Returns raw observations only.
import { acquire, destroy, onLoss } from '../gpu/device.js';

export async function runProbe(params, say) {
  const raw = { ok: false };
  try {
    say('probe: acquiring adapter…');
    const { device, info, epoch } = await acquire({ requiredFeatures: ['timestamp-query'] });
    raw.info = info; raw.epoch = epoch;
    const response = await fetch(new URL('../gpu/probe.wgsl', import.meta.url));
    if (!response.ok) throw new Error(`probe.wgsl: HTTP ${response.status}`);
    const module = device.createShaderModule({ code: await response.text() });
    raw.compilation = (await module.getCompilationInfo()).messages.map(m => `${m.type}: ${m.message}`);
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const n = 1000;                                                // 15 full workgroups plus one partial (40 of 64)
    const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniform, 0, new Uint32Array([n, 0, 0, 0]));
    const out = device.createBuffer({ size: 4096, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(out, 0, new Uint32Array(1024).fill(0xdeadbeef));
    const read = device.createBuffer({ size: 4096, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: out } }] });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(n / 64)); pass.end();
    enc.copyBufferToBuffer(out, 0, read, 0, 4096);
    device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const values = new Uint32Array(read.getMappedRange().slice(0)); read.unmap();
    raw.readback = { mismatches: [...values].filter((v, i) => v !== (i < n ? 3 * i + 1 : 0xdeadbeef)).length, n, length: values.length };
    if (params.get('runMode') === 'headed') {
      const context = document.getElementById('view').getContext('webgpu');
      context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
      const e2 = device.createCommandEncoder();
      e2.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0.1, g: 0.6, b: 0.2, a: 1 }, storeOp: 'store' }] }).end();
      device.queue.submit([e2.finish()]); await device.queue.onSubmittedWorkDone();
      raw.presented = true;
    }
    for (const b of [uniform, out, read]) b.destroy();
    const loss = new Promise(resolve => { const off = onLoss(info => { off(); resolve(info); }); });
    const lost = device.lost;
    destroy();                                                     // intentional: epoch retires before destruction
    raw.lostReason = (await lost).reason;
    raw.lossHandlerFired = await Promise.race([loss.then(() => true), new Promise(r => setTimeout(() => r(false), 1000))]);
    raw.ok = raw.readback.mismatches === 0 && raw.compilation.every(m => !m.startsWith('error'));
  } catch (error) { raw.error = `${error.code || error.name}: ${error.message}`; }
  return { slots: [{ slot: params.get('runMode'), raw }], invalidations: [] };
}
```

After `destroy()`, the epoch has already advanced. `device.lost` therefore resolves with reason
`destroyed`, while the epoch-guarded handler in `acquire` does **not** call `signalLoss`
again. `lossHandlerFired` is expected to be `false` for intentional destruction. That
expectation is part of the evidence.

- [ ] **Step 7: Write the Node probe entry point**

```js
// spikes/project0/probe.mjs — first GPU run. Headed and headless, fresh profiles, attempt-1 flags.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, HARNESS_PATH, startServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';
import { fixtureIdentity, implementationIdentity, launchIdentity, environmentIdentity, newRunDir, writeRecord } from './evidence.mjs';

process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
const fixture = await fixtureIdentity();
const implementation = await implementationIdentity();
const runDir = await newRunDir('probe');
let failures = 0, server;
try {
  server = await startServer();
  for (const mode of ['headed', 'headless']) {
    let launched;
    try {
      launched = await launchChrome({ headless: mode === 'headless', profileKind: `probe-${mode}`, chromium });
      const commandLine = await effectiveCommandLine(launched.context); assertSandboxed(commandLine);
      const page = await launched.context.newPage();
      await page.goto(`${server.url}${HARNESS_PATH}?mode=probe&runMode=${mode}`);
      const result = await page.waitForFunction(() => window.p0Result, null, { timeout: 60000 }).then(h => h.jsonValue());
      const probe = result.error ? { ok: false, error: result.error } : result.slots[0].raw;
      const gpuPage = await launched.context.newPage(); await gpuPage.goto('chrome://gpu'); await gpuPage.waitForTimeout(1500);
      const chromeGpuText = await gpuPage.locator('body').innerText(); await gpuPage.close();
      const browserVersion = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
      const invalidations = []; let env;
      try { env = environmentIdentity(chromeGpuText, { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], session: process.env.XDG_SESSION_TYPE || 'unknown' }); }
      catch (e) { env = { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], driver: 'unknown', session: process.env.XDG_SESSION_TYPE || 'unknown' }; invalidations.push(`environment identity: ${e.message}`); }
      const record = { schema: 1, id: `probe-${mode}`, gate: 'probe', slot: mode, campaign: 'probe', identity: { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity({ requestedArgs: launched.requestedArgs, mode, commandLine }), ...env }, invalidations, metrics: {} };
      await writeRecord(runDir, record, [
        { name: `probe-${mode}.raw.json`, data: JSON.stringify(probe) },
        { name: `probe-${mode}.launch.json`, data: JSON.stringify({ requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile }) },
        { name: `probe-${mode}.chrome-gpu.txt`, data: chromeGpuText }]);
      console.log(`${mode}: ${probe.ok ? 'PROBE OK' : 'PROBE FAILED'} ${probe.error || ''} vendor=${probe.info?.vendor} fallback=${probe.info?.isFallbackAdapter} (${probe.info?.fallbackSource}) mismatches=${probe.readback?.mismatches}`);
      if (!probe.ok) failures++;
    } catch (error) { console.log(`${mode}: PROBE FAILED ${error.message}`); failures++; }
    finally { await launched?.context.close(); }
  }
} finally { await server?.stop(); }
console.log(`evidence: ${runDir}`);
process.exitCode = failures ? 1 : 0;
```

`gate: 'probe'` lies outside `GATES`, so probe records never count as qualification evidence.

- [ ] **Step 8: Commit, after Codex's read-only review, and before any GPU run**

```bash
git add spikes/project0/evidence.mjs spikes/project0/gpu/device.js spikes/project0/gpu/probe.wgsl spikes/project0/browser/probe.js spikes/project0/probe.mjs spikes/project0/tests/evidence.test.mjs
git commit -m "Project 0 T5: verified evidence identity, WebGPU device module with synchronous loss path, hardware probe"
```

- [ ] **Step 9: Run the probe (the first GPU run)**

Run: `node spikes/project0/probe.mjs`

If WebGPU works in both modes, the expected output is:
- `headed: PROBE OK … vendor=nvidia fallback=false (…) mismatches=0`;
- `headless: PROBE OK …`;
- an `evidence:` path.

`PROBE FAILED` is **not** worked around in this task:
- the failure code, `chrome://gpu` and the command line are already saved;
- T6–T9 continue against whichever mode works;
- the classification and the single remediation decision are taken jointly in T10.

A failure to launch Chrome at all is *inconclusive* evidence.

---

### Task T6: Allocator, watchdog, WGSL arithmetic and ray-list kernels, strict decoding, registries and the gate runner (G3–G5)

**Owner:** Claude, with WGSL written from spec A.2–A.4 and the agreed range policy,
independently of `reference/`. **Reviewer:** Codex (read-only `review --diff`). Codex checks
the semantics against the spec, not by line-matching its own CPU code.

**Files:**
- `spikes/project0/gpu/alloc.js`: the session allocator. It checks the cap *before*
  allocating and counts payload bytes, buffers, textures, pipelines and bind groups.
- `spikes/project0/gpu/watchdog.js`: the live submission-progress watchdog, which stops after
  5 s without progress.
- `spikes/project0/gpu/fields.wgsl`, `gpu/arithmetic.wgsl`, `gpu/trace.wgsl`: the kernels.
- `spikes/project0/gpu/webgpu.js`: shader assembly, pipeline preparation, allocator-aware
  helpers, and bounded batched ray lists.
- `spikes/project0/browser/packing.js`: pure packing of fixture data into GPU layouts.
- `spikes/project0/browser/drivers/index.js`: the driver **registry**. It maps every gate name
  to its module, including modules later tasks add.
- `spikes/project0/browser/drivers/checks.js`: the `G3`, `G4`, `G5` and `derivative-policy`
  drivers, which return raw readbacks only.
- `spikes/project0/measure/decode.mjs`: strict readback validation and decoding.
- `spikes/project0/measure/arith.mjs`: the G3–G5 metric derivations.
- `spikes/project0/measure/index.mjs`: the metric **registry**, mapping each gate to its
  derivation module.
- `spikes/project0/run.mjs`: the complete Node runner, in its final form, for every gate and
  experiment.
- Tests: `spikes/project0/tests/alloc.test.mjs`, `watchdog.test.mjs`, `packing.test.mjs`,
  `decode.test.mjs` and `arith-metrics.test.mjs`.

**Interfaces:**
- Consumes:
  - T1: `compareArithmetic`, `compareRays`, `ARITH_STATUS`, `RAY_STATUS`, `UNRESOLVED_REASON`;
  - T4 keys: `analytic[name].{L, boxes, rays, effectiveOrigins, effectiveDirections}`,
    `arithmetic.{bulb, plane, offplane}`, `arithmeticProtocol`, `derivativePolicy`,
    `profiles.g3`;
  - T5: `device.js`, `evidence.mjs`, `launch.mjs`.
- Produces:
  - **GPU status codes**, the order of the T1 arrays:
    - arithmetic: `0 escaped`, `1 budget`, `2 failure`;
    - ray: `0 hit`, `1 miss`, `2 unresolved`, `3 failure`;
    - reason: `0 none`, `1 point`, `2 steps`.
  - `createAllocator({capBytes, onExceed?}) → alloc`, with:
    - `texture(device, desc)` and `buffer(device, desc)`, which throw
      `allocation cap exceeded` *before* allocating if the proposed total would exceed `capBytes`;
    - `pipeline(p)` and `bindGroup(g)`, which count;
    - `inventory() → {bytes, textures, buffers, pipelines, bindGroups, peakBytes}`;
    - `destroyAll()`.

    Every resource's `destroy()` releases its accounting exactly once.
  - `createWatchdog({stallMs = 5000, now?, every?}) → wd`, with:
    - `submitted(id, meta) → done()`;
    - `stopped`, a boolean: once set, no further submissions are allowed;
    - `stall`, either `null` or `{atMs, outstanding: [{id, meta, ageMs}]}`;
    - `check()`;
    - `dispose()`.
  - `prepare(device, alloc, status) → pipelines`, keyed by `bulb_samples`, `qjulia_plane`,
    `qjulia_offplane`, `derivative_policy` and `trace_list/<sphere|box|menger|bulb>`.
  - `upload(device, alloc, data, usage) → GPUBuffer` and
    `readBack(device, alloc, buffer, size) → {bytes: ArrayBuffer, ms}`.
  - `traceList({device, alloc, watchdog, pipelines, field, profile, origins, directions, boxes?, batch = 512}) → {words: Uint32Array, workMs, readMs, batches}`.
    `workMs` covers first submission to last completion and **excludes** readback.
  - `packBoxes(boxes) → Float32Array`, which throws if a box is not cubic;
    `packRows(rows, fn) → Float32Array`; `vec4(flat3) → Float32Array`.
  - `runGateDriver(gate, fixtures, params, status)` in the browser registry. Each driver
    module exports `run(gate, fixtures, params, status) → {slots: [{slot, gate?, raw}], invalidations}`.
  - `metricsFor(gate, slot, raw, fixtures) → Promise<metrics>` in the Node registry. Each
    module exports `metrics(gate, slot, raw, fixtures)`.
  - `decodeTrace(words, rows, {maxSteps})` and `decodeArith(words, rows, {minIndex, cap, de})`,
    which throw on any malformed input.
  - `runSession({gate, mode, args, campaign, experiment?}) → {records, runDir, result}` and
    `runG2({args, campaign})`, used by T9, T10 and T12.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/alloc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAllocator } from '../gpu/alloc.js';
globalThis.GPUTextureUsage ??= { STORAGE_BINDING: 8 };
const device = { createBuffer: d => ({ ...d, destroy() { this.dead = (this.dead || 0) + 1; } }), createTexture: d => ({ ...d, destroy() {} }) };

test('the allocator refuses an allocation that would exceed the cap, before allocating', () => {
  const alloc = createAllocator({ capBytes: 1000 }); let created = 0;
  const counting = { ...device, createBuffer: d => { created++; return device.createBuffer(d); } };
  alloc.buffer(counting, { size: 600 });
  assert.throws(() => alloc.buffer(counting, { size: 600 }), /allocation cap exceeded/);
  assert.equal(created, 1);
  assert.equal(alloc.inventory().bytes, 600);
});

test('payload bytes, counts and the peak are exact; destroy() releases once', () => {
  const alloc = createAllocator({ capBytes: 2 ** 30 });
  const b = alloc.buffer(device, { size: 256 });
  const t = alloc.texture(device, { size: [4, 2], format: 'rgba16float' });
  alloc.pipeline({}); alloc.bindGroup({});
  assert.deepEqual(alloc.inventory(), { bytes: 256 + 64, textures: 1, buffers: 1, pipelines: 1, bindGroups: 1, peakBytes: 320 });
  b.destroy(); b.destroy(); t.destroy();
  assert.equal(b.dead, 1);
  assert.deepEqual(alloc.inventory(), { bytes: 0, textures: 0, buffers: 0, pipelines: 1, bindGroups: 1, peakBytes: 320 });
  assert.throws(() => alloc.texture(device, { size: [1, 1], format: 'bgra8unorm' }), /untracked texture format/);
});
```

```js
// spikes/project0/tests/watchdog.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWatchdog } from '../gpu/watchdog.js';

test('five seconds without progress stops further submissions and names the outstanding work', () => {
  let t = 0; const wd = createWatchdog({ stallMs: 5000, now: () => t, every: null });
  const doneA = wd.submitted('a', { gate: 'G6', generation: 1 }); wd.submitted('b', { gate: 'G6', generation: 1 });
  t = 3000; doneA(); wd.check(); assert.equal(wd.stopped, false);      // progress at 3 s resets the clock
  t = 7999; wd.check(); assert.equal(wd.stopped, false);
  t = 8001; wd.check(); assert.equal(wd.stopped, true);
  assert.deepEqual(wd.stall.outstanding.map(o => o.id), ['b']);
  assert.throws(() => wd.submitted('c', {}), /watchdog stopped/);
});

test('an idle watchdog with nothing outstanding never stalls', () => {
  let t = 0; const wd = createWatchdog({ stallMs: 5000, now: () => t, every: null });
  t = 60000; wd.check(); assert.equal(wd.stopped, false);
});
```

```js
// spikes/project0/tests/packing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { packBoxes, vec4 } from '../browser/packing.js';
import { menger } from '../reference/geometry.js';

test('Menger boxes pack as (centre, half-size) with no NaN, for 20 and 400 boxes', () => {
  for (const [depth, count] of [[1, 20], [2, 400]]) {
    const boxes = menger(depth), packed = packBoxes(boxes);
    assert.equal(packed.length, 4 * count);
    assert.ok(packed.every(Number.isFinite));
    boxes.forEach((b, i) => { assert.deepEqual([...packed.subarray(4 * i, 4 * i + 3)], b.c.map(Math.fround)); assert.equal(packed[4 * i + 3], Math.fround(b.h[0])); });
  }
  assert.throws(() => packBoxes([{ c: [0, 0, 0], h: [1, 0.5, 0.25] }]), /cubic/);
});

test('vec4 pads flat xyz triples', () => {
  assert.deepEqual([...vec4(new Float32Array([1, 2, 3, 4, 5, 6]))], [1, 2, 3, 0, 4, 5, 6, 0]);
});
```

```js
// spikes/project0/tests/decode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTrace, decodeArith } from '../measure/decode.mjs';
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];

test('a well-formed trace decodes onto the T1 vocabulary', () => {
  const words = [0, 0, f32bits(3), 3, 1, 0, 0, 1, 2, 2, f32bits(4), 512, 2, 1, f32bits(1), 7];
  assert.deepEqual(decodeTrace(words, 4, { maxSteps: 512 }), [
    { id: 0, status: 'hit', reason: null, t: 3, steps: 3 }, { id: 1, status: 'miss', reason: null, t: null, steps: 1 },
    { id: 2, status: 'unresolved', reason: 'steps', t: 4, steps: 512 }, { id: 3, status: 'unresolved', reason: 'point', t: 1, steps: 7 }]);
});

test('malformed readback is refused, never compared', () => {
  const ok = [0, 0, f32bits(3), 3];
  assert.throws(() => decodeTrace(ok.slice(0, 3), 1, { maxSteps: 512 }), /readback length/);
  for (const bad of [null, 1.5, -1, 2 ** 32, NaN, '7']) assert.throws(() => decodeTrace([bad, 0, 0, 1], 1, { maxSteps: 512 }), /invalid readback word/);
  assert.throws(() => decodeTrace([7, 0, 0, 1], 1, { maxSteps: 512 }), /unknown ray status code/);
  assert.throws(() => decodeTrace([0, 2, f32bits(3), 3], 1, { maxSteps: 512 }), /reason on a resolved/);
  assert.throws(() => decodeTrace([2, 0, f32bits(3), 3], 1, { maxSteps: 512 }), /unresolved ray without a reason/);
  assert.throws(() => decodeTrace([0, 0, f32bits(3), 513], 1, { maxSteps: 512 }), /steps out of range/);
  assert.throws(() => decodeTrace([0, 0, f32bits(NaN), 3], 1, { maxSteps: 512 }), /non-finite depth/);
  assert.throws(() => decodeTrace([0, 0, f32bits(3), 0], 1, { maxSteps: 512 }), /hit after zero steps/);
});

test('arithmetic decoding checks status, index bounds and value finiteness', () => {
  assert.deepEqual(decodeArith([0, 3, f32bits(1), f32bits(0.5)], 1, { minIndex: 1, cap: 64, de: true }), [{ id: 0, status: 'escaped', index: 3, logR: 1, de: 0.5 }]);
  assert.deepEqual(decodeArith([1, 0, 0, 0], 1, { minIndex: 0, cap: 128, de: false }), [{ id: 0, status: 'budget', index: null, logR: null, de: null }]);
  assert.throws(() => decodeArith([0, 65, f32bits(1), f32bits(1)], 1, { minIndex: 1, cap: 64, de: true }), /escape index out of range/);
  assert.throws(() => decodeArith([0, 3, f32bits(Infinity), 0], 1, { minIndex: 1, cap: 64, de: true }), /non-finite/);
  assert.throws(() => decodeArith([1, 4, 0, 0], 1, { minIndex: 0, cap: 128, de: false }), /budget result carries data/);
  assert.throws(() => decodeArith([9, 0, 0, 0], 1, { minIndex: 0, cap: 128, de: false }), /unknown arithmetic status code/);
});
```

```js
// spikes/project0/tests/arith-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsFor } from '../measure/index.mjs';
import { gatePlan } from '../gates.js';
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];
const eligible = n => Array.from({ length: n }, (_, id) => ({ id, eligible: true, reference: { status: 'budget', index: null, logR: null, de: null } }));
const fixtures = {
  profiles: { g3: { steps: 512 } },
  arithmeticProtocol: { bulb: { iterations: 64, tolerances: { logR: 1e-4, de: 1e-3 } }, plane: { iterations: 128, tolerances: { logR: 1e-5 } }, offplane: { iterations: 8, absoluteTolerance: 1e-6, relativeTolerance: 1e-5 } },
  analytic: { sphere: { L: 1, rays: [{ id: 0, reference: { status: 'hit', t: 3, excluded: false } }, { id: 1, reference: { status: 'miss', t: null, excluded: false } }] } },
  arithmetic: { bulb: eligible(4096), plane: eligible(4096), offplane: { orbit: Array.from({ length: 8 }, (_, n) => [n, -n, 0.5, 0]) } },
};

test('G3 metrics have exactly the gatePlan keys and measure depth error in units of 1e-4·L', async () => {
  const m = await metricsFor('G3', 'sphere', { words: [0, 0, f32bits(3.00001), 4, 1, 0, 0, 1] }, fixtures);
  assert.deepEqual(Object.keys(m).sort(), ['depthRatio', 'edgeErrors', 'rays', 'statusErrors']);
  assert.ok(m.depthRatio > 0.09 && m.depthRatio < 0.11);
});

test('G4/G5 metrics match the plan keys; a short readback is refused', async () => {
  const plan = gatePlan({ analytic: {}, arithmetic: { bulb: eligible(4096), plane: eligible(4096) } });
  const words = Array.from({ length: 4 * 4096 }, (_, i) => (i % 4 === 0 ? 1 : 0));
  assert.deepEqual(Object.keys(await metricsFor('G4', 'bulb-samples', { words }, fixtures)).sort(), Object.keys(plan.G4['bulb-samples']).sort());
  assert.deepEqual(Object.keys(await metricsFor('G5', 'qjulia-plane', { words }, fixtures)).sort(), Object.keys(plan.G5['qjulia-plane']).sort());
  await assert.rejects(metricsFor('G4', 'bulb-samples', { words: words.slice(4) }, fixtures), /readback length/);
});

test('G5 off-plane uses abs + rel tolerance over exactly 32 finite components', async () => {
  const orbit = fixtures.arithmetic.offplane.orbit.flat(), actual = orbit.map((v, i) => (i === 5 ? v + 2e-6 : v));
  const m = await metricsFor('G5', 'qjulia-offplane', { orbit: actual }, fixtures);
  assert.equal(m.components, 32);
  assert.ok(Math.abs(m.componentRatio - 2e-6 / (1e-6 + 1e-5 * 1)) < 1e-9);
  await assert.rejects(metricsFor('G5', 'qjulia-offplane', { orbit: actual.slice(1) }, fixtures), /32 components/);
  await assert.rejects(metricsFor('G5', 'qjulia-offplane', { orbit: actual.map((v, i) => (i ? v : null)) }, fixtures), /finite/);
});

test('an unregistered gate has no derivation', async () => {
  await assert.rejects(metricsFor('G99', 'x', {}, fixtures), /no metric derivation for G99/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/alloc.test.mjs spikes/project0/tests/watchdog.test.mjs spikes/project0/tests/packing.test.mjs spikes/project0/tests/decode.test.mjs spikes/project0/tests/arith-metrics.test.mjs`
Expected: FAIL, with `ERR_MODULE_NOT_FOUND` for `gpu/alloc.js`, `gpu/watchdog.js`,
`browser/packing.js`, `measure/decode.mjs` and `measure/index.mjs`.

- [ ] **Step 3: Implement the pure modules**

```js
// spikes/project0/gpu/alloc.js — every explicit harness buffer and texture goes through this (spec A.8 accounting).
export const BYTES_PER_TEXEL = Object.freeze({ r32float: 4, rgba16float: 8, r32uint: 4, rgba32float: 16, rgba8unorm: 4 });
export function textureBytes({ size: [w, h], format }) {
  if (!(format in BYTES_PER_TEXEL)) throw new Error(`untracked texture format ${format}`);
  return w * h * BYTES_PER_TEXEL[format];
}
export function createAllocator({ capBytes }) {
  const inv = { bytes: 0, textures: 0, buffers: 0, pipelines: 0, bindGroups: 0, peakBytes: 0 };
  const live = new Set();
  function admit(bytes) { if (inv.bytes + bytes > capBytes) throw new Error(`allocation cap exceeded: ${inv.bytes} + ${bytes} > ${capBytes}`); }
  function track(resource, bytes, key) {
    inv.bytes += bytes; inv[key]++; inv.peakBytes = Math.max(inv.peakBytes, inv.bytes); live.add(resource);
    const original = resource.destroy.bind(resource); let alive = true;
    resource.destroy = () => { if (alive) { alive = false; inv.bytes -= bytes; inv[key]--; live.delete(resource); original(); } };
    return resource;
  }
  return {
    texture(device, desc) { const bytes = textureBytes(desc); admit(bytes); return track(device.createTexture(desc), bytes, 'textures'); },
    buffer(device, desc) { admit(desc.size); return track(device.createBuffer(desc), desc.size, 'buffers'); },
    pipeline(p) { inv.pipelines++; return p; },
    bindGroup(g) { inv.bindGroups++; return g; },
    inventory: () => ({ ...inv }),
    destroyAll() { for (const r of [...live]) r.destroy(); },
  };
}
```

```js
// spikes/project0/gpu/watchdog.js — spec §7: 5 s without observable submission progress stops the experiment.
export function createWatchdog({ stallMs = 5000, now = () => performance.now(), every = 250 } = {}) {
  const outstanding = new Map(); let lastProgress = now(), seq = 0, timer = null;
  const wd = {
    stopped: false, stall: null,
    submitted(id, meta = {}) {
      if (wd.stopped) throw new Error('watchdog stopped: no further submissions');
      const key = `${id}#${seq++}`; outstanding.set(key, { id, meta, at: now() });
      if (outstanding.size === 1) lastProgress = now();
      return () => { if (outstanding.delete(key)) lastProgress = now(); };
    },
    check() {
      if (wd.stopped || outstanding.size === 0) return;
      const t = now();
      if (t - lastProgress > stallMs) { wd.stopped = true; wd.stall = { atMs: t, outstanding: [...outstanding.values()].map(o => ({ id: o.id, meta: o.meta, ageMs: t - o.at })) }; }
    },
    dispose() { if (timer) clearInterval(timer); },
  };
  if (every) timer = setInterval(() => wd.check(), every);
  return wd;
}
```

```js
// spikes/project0/browser/packing.js — fixture data → GPU layouts (pure; tested in Node).
export function vec4(flat3) {
  const n = flat3.length / 3, out = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) out.set(flat3.subarray(3 * i, 3 * i + 3), 4 * i);
  return out;
}
export function packBoxes(boxes) {
  return new Float32Array(boxes.flatMap(({ c, h }) => {
    if (h.length !== 3 || !h.every(v => Number.isFinite(v) && v > 0 && v === h[0])) throw new Error('Menger upload requires cubic boxes');
    return [...c, h[0]];
  }));
}
export function packRows(rows, fn) {
  const out = new Float32Array(4 * rows.length);
  rows.forEach((r, i) => { const v = fn(r); if (v.length !== 4) throw new Error('packRows needs four lanes per row'); out.set(v, 4 * i); });
  return out;
}
```

```js
// spikes/project0/measure/decode.mjs — strict readback validation. Malformed evidence throws; it is never compared.
import { ARITH_STATUS, RAY_STATUS, UNRESOLVED_REASON } from '../contract.js';

export function checkedWords(words, expectedRows) {
  if (!(Array.isArray(words) || words instanceof Uint32Array) || words.length !== 4 * expectedRows) throw new Error(`readback length mismatch: ${words?.length} words for ${expectedRows} rows`);
  for (const w of words) if (typeof w !== 'number' || !Number.isInteger(w) || w < 0 || w > 0xffffffff) throw new Error(`invalid readback word: ${w}`);
  return Uint32Array.from(words);
}

export function decodeTrace(words, expectedRows, { maxSteps }) {
  const u = checkedWords(words, expectedRows), f = new Float32Array(u.buffer), rows = [];
  for (let id = 0; id < expectedRows; id++) {
    const code = u[4 * id], reasonCode = u[4 * id + 1], t = f[4 * id + 2], steps = u[4 * id + 3];
    if (!(code < RAY_STATUS.length)) throw new Error(`row ${id}: unknown ray status code ${code}`);
    const status = RAY_STATUS[code];
    if (status === 'unresolved') { if (reasonCode !== 1 && reasonCode !== 2) throw new Error(`row ${id}: unresolved ray without a reason`); }
    else if (reasonCode !== 0) throw new Error(`row ${id}: reason on a resolved or failed ray`);
    if (steps > maxSteps) throw new Error(`row ${id}: steps out of range (${steps} > ${maxSteps})`);
    if (status !== 'miss' && !(Number.isFinite(t) && t >= 0)) throw new Error(`row ${id}: non-finite depth`);
    if (status === 'hit' && steps < 1) throw new Error(`row ${id}: hit after zero steps`);
    rows.push({ id, status, reason: status === 'unresolved' ? UNRESOLVED_REASON[reasonCode - 1] : null, t: status === 'miss' ? null : t, steps });
  }
  return rows;
}

export function decodeArith(words, expectedRows, { minIndex, cap, de }) {
  const u = checkedWords(words, expectedRows), f = new Float32Array(u.buffer), rows = [];
  for (let id = 0; id < expectedRows; id++) {
    const code = u[4 * id];
    if (!(code < ARITH_STATUS.length)) throw new Error(`row ${id}: unknown arithmetic status code ${code}`);
    const status = ARITH_STATUS[code];
    if (status === 'escaped') {
      const index = u[4 * id + 1], logR = f[4 * id + 2], d = f[4 * id + 3];
      if (index < minIndex || index > cap) throw new Error(`row ${id}: escape index out of range (${index})`);
      if (!Number.isFinite(logR) || (de && !(Number.isFinite(d) && d >= 0))) throw new Error(`row ${id}: non-finite escaped value`);
      rows.push({ id, status, index, logR, de: de ? d : null });
    } else if (status === 'budget') {
      if (u[4 * id + 1] || u[4 * id + 2] || u[4 * id + 3]) throw new Error(`row ${id}: budget result carries data`);
      rows.push({ id, status, index: null, logR: null, de: null });
    } else {
      if (u[4 * id + 1] < 1 || u[4 * id + 1] > cap) throw new Error(`row ${id}: failure index out of range`);
      rows.push({ id, status, index: null, logR: null, de: null });
    }
  }
  return rows;
}
```

```js
// spikes/project0/measure/arith.mjs — G3/G4/G5 metrics from raw readbacks and the frozen fixtures.
import { compareArithmetic, compareRays } from '../metrics.js';
import { decodeTrace, decodeArith } from './decode.mjs';

export function metrics(gate, slot, raw, fx) {
  if (gate === 'G3') {
    const fixture = fx.analytic[slot]; if (!fixture) throw new Error(`G3: unknown analytic fixture ${slot}`);
    return compareRays(fixture.rays, decodeTrace(raw.words, fixture.rays.length, { maxSteps: fx.profiles.g3.steps }), fixture.L);
  }
  if (gate === 'G4' && slot === 'bulb-samples') {
    const p = fx.arithmeticProtocol.bulb;
    return compareArithmetic(fx.arithmetic.bulb, decodeArith(raw.words, fx.arithmetic.bulb.length, { minIndex: 1, cap: p.iterations, de: true }), p.tolerances);
  }
  if (gate === 'G5' && slot === 'qjulia-plane') {
    const p = fx.arithmeticProtocol.plane;
    const rows = decodeArith(raw.words, fx.arithmetic.plane.length, { minIndex: 0, cap: p.iterations, de: false }).map(({ id, status, index, logR }) => ({ id, status, index, logR }));
    return compareArithmetic(fx.arithmetic.plane, rows, p.tolerances);
  }
  if (gate === 'G5' && slot === 'qjulia-offplane') {
    const p = fx.arithmeticProtocol.offplane, expected = fx.arithmetic.offplane.orbit.flat();
    if (!Array.isArray(raw.orbit) || raw.orbit.length !== 32 || expected.length !== 32) throw new Error('off-plane orbit must have exactly 32 components');
    if (!raw.orbit.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('off-plane orbit components must be finite numbers');
    let componentRatio = 0;
    raw.orbit.forEach((v, i) => { componentRatio = Math.max(componentRatio, Math.abs(v - expected[i]) / (p.absoluteTolerance + p.relativeTolerance * Math.abs(expected[i]))); });
    return { components: 32, componentRatio };
  }
  throw new Error(`no metric derivation for ${gate}/${slot}`);
}
```

```js
// spikes/project0/measure/index.mjs — the metric registry. Later tasks add the modules it names.
const GROUPS = { G3: './arith.mjs', G4: './arith.mjs', G5: './arith.mjs',
  G11: './resources.mjs', G13: './lifecycle.mjs',                                                  // T8
  G1: './timing.mjs', G2: './timing.mjs', G6: './timing.mjs', G7: './timing.mjs', G8: './timing.mjs', G9: './timing.mjs', G10: './timing.mjs', G12: './timing.mjs' };  // T9
export async function metricsFor(gate, slot, raw, fixtures) {
  const path = GROUPS[gate];
  if (!path) throw new Error(`no metric derivation for ${gate}`);
  return (await import(path)).metrics(gate, slot, raw, fixtures);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command again.
Expected: PASS, `# pass 13`, `# fail 0`.

- [ ] **Step 5: Write `gpu/fields.wgsl`**

```wgsl
// spikes/project0/gpu/fields.wgsl — written from spec A.2–A.4 and the agreed derivative range policy.
const ST_ESCAPED: u32 = 0u;  const ST_BUDGET: u32 = 1u;  const ST_FAILURE: u32 = 2u;   // T1 ARITH_STATUS order
struct Eval { status: u32, index: u32, log_r: f32, de: f32 }

// Range policy: the update grow*dr + 1 is allowed iff its exact real value is <= F32_MAX, for nonnegative finite
// f32 operands. Decided from exponents and an exact 24x24-bit significand product; no operation that could
// overflow is executed.
fn derivative_fits(grow: f32, dr: f32) -> bool {
  if (grow == 0.0 || dr == 0.0) { return true; }
  let g = frexp(grow);  let d = frexp(dr);           // fract in [0.5, 1)
  let e = g.exp + d.exp;                              // product = fract_g * fract_d * 2^e, in [2^(e-2), 2^e)
  if (e <= 127) { return true; }                      // product < 2^127, so +1 stays <= F32_MAX
  if (e >= 130) { return false; }                     // product >= 2^128 > F32_MAX
  let mg = u32(g.fract * 16777216.0);  let md = u32(d.fract * 16777216.0);   // exact 24-bit significands
  let a1 = mg >> 12u;  let a0 = mg & 0xfffu;  let b1 = md >> 12u;  let b0 = md & 0xfffu;
  let mid = a1 * b0 + a0 * b1;                        // < 2^25
  var lo = a0 * b0 + ((mid & 0xfffu) << 12u);
  let hi = a1 * b1 + (mid >> 12u) + (lo >> 24u);      // 48-bit product = hi * 2^24 + lo
  lo = lo & 0xffffffu;
  // F32_MAX = (2^24 - 1) * 2^104, with product = mg*md*2^(e-48):
  if (e == 128) { return hi <= 0xfffffeu; }                          // mg*md <= 2^48 - 2^24 - 1
  return hi < 0x7fffffu || (hi == 0x7fffffu && lo <= 0x7fffffu);     // e == 129: mg*md <= 2^47 - 2^23 - 1
}

// A.2 Mandelbulb: z0 = 0, dr0 = 0, escape when |z| > 2 after an update; the DE is heuristic.
fn bulb_eval(p: vec3f, cap: u32) -> Eval {
  var z = vec3f(0.0);
  var dr: f32 = 0.0;
  for (var n: u32 = 1u; n <= cap; n++) {
    let r = length(z);
    var w = vec3f(0.0);
    var grow: f32 = 0.0;
    if (r > 0.0) {
      let theta = acos(clamp(z.z / r, -1.0, 1.0));
      var phi: f32 = 0.0;
      if (z.x != 0.0 || z.y != 0.0) { phi = atan2(z.y, z.x); }
      let r2 = r * r;  let r4 = r2 * r2;
      grow = 8.0 * r4 * r2 * r;                        // r <= 2 here, so grow <= 1024
      let s = sin(8.0 * theta);
      w = (r4 * r4) * vec3f(s * cos(8.0 * phi), s * sin(8.0 * phi), cos(8.0 * theta));
    }
    // Fast path: grow <= 1024 and dr < 1e34 cannot exceed F32_MAX; otherwise apply the exact policy.
    if (!(dr < 1e34) && !derivative_fits(grow, dr)) { return Eval(ST_FAILURE, n, 0.0, 0.0); }
    dr = grow * dr + 1.0;
    z = w + p;
    let big_r = length(z);
    if (big_r > 2.0) { let lr = log(big_r); return Eval(ST_ESCAPED, n, lr, 0.5 * lr * big_r / dr); }
  }
  return Eval(ST_BUDGET, 0u, 0.0, 0.0);
}

fn qsq(q: vec4f) -> vec4f {   // (a,b,c,d)^2 = (a^2 - b^2 - c^2 - d^2, 2ab, 2ac, 2ad)
  return vec4f(q.x * q.x - q.y * q.y - q.z * q.z - q.w * q.w, 2.0 * q.x * q.y, 2.0 * q.x * q.z, 2.0 * q.x * q.w);
}
fn rot_z(p: vec3f, a: f32) -> vec3f { let c = cos(a); let s = sin(a); return vec3f(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
fn box_distance(p: vec3f, c: vec3f, h: vec3f) -> f32 { return length(max(abs(p - c) - h, vec3f(0.0))); }
fn sphere_distance(p: vec3f) -> f32 { return length(p) - 1.0; }
fn rotated_box_distance(p: vec3f) -> f32 { return box_distance(rot_z(p, -0.52359877559829887), vec3f(0.0), vec3f(1.0, 0.5, 0.25)); }
```

The WGSL guard's algorithm was checked during planning by a line-for-line CPU port against
T2's exact `derivativeFitsF32`: 300,105 vectors, including every boundary class, with 0
mismatches. Step 12 checks the shader itself on the GPU.

- [ ] **Step 6: Write `gpu/arithmetic.wgsl`**

It is prepended with `fields.wgsl` at assembly.

```wgsl
// spikes/project0/gpu/arithmetic.wgsl — G4/G5 sample entry points and the policy readback.
struct Count { n: u32, cap: u32, _a: u32, _b: u32 }
@group(0) @binding(0) var<uniform> count: Count;
@group(0) @binding(1) var<storage, read> inputs: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> outputs: array<vec4u>;

@compute @workgroup_size(64)
fn bulb_samples(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  let e = bulb_eval(inputs[id.x].xyz, count.cap);
  outputs[id.x] = vec4u(e.status, e.index, bitcast<u32>(e.log_r), bitcast<u32>(e.de));
}

// Quaternion recurrence on q0 = (x, y, 0, 0) with C = (Cr, Ci, 0, 0); escape tested at n = 0 .. cap.
@compute @workgroup_size(64)
fn qjulia_plane(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  let s = inputs[id.x];
  var q = vec4f(s.x, s.y, 0.0, 0.0);
  let c = vec4f(s.z, s.w, 0.0, 0.0);
  var out = vec4u(ST_BUDGET, 0u, 0u, 0u);
  for (var n: u32 = 0u; n <= count.cap; n++) {
    let r = length(q);
    if (r > 2.0) { out = vec4u(ST_ESCAPED, n, bitcast<u32>(log(r)), 0u); break; }
    if (n == count.cap) { break; }
    q = qsq(q) + c;                                     // |q| <= 2 here, so no overflow
  }
  outputs[id.x] = out;
}

// inputs[0] = q0, inputs[1] = C; eight iterates written as bitcast vec4f. Statically uses bindings 1 and 2 only.
@compute @workgroup_size(1)
fn qjulia_offplane() {
  var q = inputs[0];
  let c = inputs[1];
  for (var n: u32 = 0u; n < 8u; n++) { q = qsq(q) + c; outputs[n] = bitcast<vec4u>(q); }
}

@compute @workgroup_size(64)
fn derivative_policy(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  outputs[id.x] = vec4u(select(0u, 1u, derivative_fits(inputs[id.x].x, inputs[id.x].y)), 0u, 0u, 0u);
}
```

- [ ] **Step 7: Write `gpu/trace.wgsl`**

It is prepended with `fields.wgsl`, and specialised per field with the `FIELD` override.

```wgsl
// spikes/project0/gpu/trace.wgsl — the A.2 marcher. Step accounting follows the spec: exit test at step start,
// steps = step + 1 when an evaluation terminates the ray.
const RAY_HIT: u32 = 0u;  const RAY_MISS: u32 = 1u;  const RAY_UNRESOLVED: u32 = 2u;  const RAY_FAILURE: u32 = 3u;
const WHY_NONE: u32 = 0u;  const WHY_POINT: u32 = 1u;  const WHY_STEPS: u32 = 2u;
override FIELD: u32 = 3u;   // 0 sphere, 1 rotated box, 2 Menger union (boxes buffer), 3 Mandelbulb

struct Profile { k: f32, floor: f32, factor: f32, alpha: f32, steps: u32, iterations: u32, start: u32, count: u32, box_count: u32, _a: u32, _b: u32, _c: u32 }
struct Trace { status: u32, reason: u32, t: f32, steps: u32 }

@group(0) @binding(0) var<uniform> prof: Profile;
@group(0) @binding(1) var<storage, read> boxes: array<vec4f>;      // (centre.xyz, half-size) per Menger box

fn field(p: vec3f) -> Eval {
  if (FIELD == 0u) { return Eval(ST_ESCAPED, 0u, 0.0, sphere_distance(p)); }
  if (FIELD == 1u) { return Eval(ST_ESCAPED, 0u, 0.0, rotated_box_distance(p)); }
  if (FIELD == 2u) {
    var d: f32 = 3.4028234e38;
    for (var i: u32 = 0u; i < prof.box_count; i++) { let b = boxes[i]; d = min(d, box_distance(p, b.xyz, vec3f(b.w))); }
    return Eval(ST_ESCAPED, 0u, 0.0, d);
  }
  return bulb_eval(p, prof.iterations);
}

// (entry, exit, ok). Sphere radius 2 for sphere/box, 1.25 for the bulb; box [-1,1]^3 for Menger.
fn bound(o: vec3f, d: vec3f) -> vec3f {
  if (FIELD == 2u) {
    var lo = -3.4028234e38;  var hi = 3.4028234e38;
    for (var i: u32 = 0u; i < 3u; i++) {
      if (d[i] == 0.0) { if (o[i] < -1.0 || o[i] > 1.0) { return vec3f(0.0); } continue; }
      let x = (-1.0 - o[i]) / d[i];  let y = (1.0 - o[i]) / d[i];
      lo = max(lo, min(x, y));  hi = min(hi, max(x, y));
      if (lo > hi) { return vec3f(0.0); }
    }
    return vec3f(lo, hi, 1.0);
  }
  let radius = select(2.0, 1.25, FIELD == 3u);
  let a = dot(d, d);  let b = dot(o, d);  let c = dot(o, o) - radius * radius;
  let disc = b * b - a * c;
  if (disc < 0.0) { return vec3f(0.0); }
  let s = sqrt(disc);
  return vec3f((-b - s) / a, (-b + s) / a, 1.0);
}

fn trace_ray(o: vec3f, d: vec3f) -> Trace {
  let iv = bound(o, d);
  if (iv.z == 0.0 || iv.y < max(0.0, iv.x)) { return Trace(RAY_MISS, WHY_NONE, 0.0, 0u); }
  var t = max(0.0, iv.x);
  for (var step: u32 = 0u; step < prof.steps; step++) {
    if (t > iv.y) { return Trace(RAY_MISS, WHY_NONE, 0.0, step); }
    let e = field(o + t * d);
    if (e.status == ST_BUDGET) { return Trace(RAY_UNRESOLVED, WHY_POINT, t, step + 1u); }
    if (e.status == ST_FAILURE) { return Trace(RAY_FAILURE, WHY_NONE, t, step + 1u); }
    if (e.de < max(prof.floor, prof.factor * prof.alpha * t)) { return Trace(RAY_HIT, WHY_NONE, t, step + 1u); }
    t = t + prof.k * e.de;
  }
  if (t > iv.y) { return Trace(RAY_MISS, WHY_NONE, 0.0, prof.steps); }
  return Trace(RAY_UNRESOLVED, WHY_STEPS, t, prof.steps);
}

@group(0) @binding(2) var<storage, read> origins: array<vec4f>;
@group(0) @binding(3) var<storage, read> directions: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> results: array<vec4u>;

@compute @workgroup_size(64)
fn trace_list(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= prof.count) { return; }
  let i = prof.start + id.x;
  let r = trace_ray(origins[i].xyz, directions[i].xyz);
  results[i] = vec4u(r.status, r.reason, bitcast<u32>(r.t), r.steps);
}
```

- [ ] **Step 8: Write `gpu/webgpu.js`**

```js
// spikes/project0/gpu/webgpu.js — WebGPU helpers. Every buffer goes through the session allocator; every batch through the watchdog.
import { vec4 } from '../browser/packing.js';
export const FIELDS = Object.freeze({ sphere: 0, box: 1, menger: 2, bulb: 3 });

export async function source(name) {
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.text();
}
export async function compile(device, code, label) {
  const module = device.createShaderModule({ code, label });
  const errors = (await module.getCompilationInfo()).messages.filter(m => m.type === 'error');
  if (errors.length) throw new Error(`${label}: ${errors.map(e => `${e.lineNum}:${e.linePos} ${e.message}`).join('; ')}`);
  return module;
}

export async function prepare(device, alloc, onStatus = () => {}) {
  const fields = await source('./fields.wgsl');
  const arithmetic = await compile(device, fields + await source('./arithmetic.wgsl'), 'arithmetic');
  const trace = await compile(device, fields + await source('./trace.wgsl'), 'trace');
  const jobs = [
    ...['bulb_samples', 'qjulia_plane', 'qjulia_offplane', 'derivative_policy'].map(e => [e, { module: arithmetic, entryPoint: e }]),
    ...Object.entries(FIELDS).map(([f, id]) => [`trace_list/${f}`, { module: trace, entryPoint: 'trace_list', constants: { FIELD: id } }]),
  ];
  const pipelines = {}; let done = 0;
  await Promise.all(jobs.map(async ([key, compute]) => {
    pipelines[key] = alloc.pipeline(await device.createComputePipelineAsync({ layout: 'auto', compute, label: key }));
    onStatus(`preparing pipelines ${++done}/${jobs.length}`);
  }));
  return pipelines;
}

export function upload(device, alloc, data, usage) {
  const size = Math.max(16, Math.ceil(data.byteLength / 16) * 16);
  const b = alloc.buffer(device, { size, usage: usage | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(b, 0, data.buffer, data.byteOffset, data.byteLength);
  return b;
}

export async function readBack(device, alloc, src, size) {
  const t0 = performance.now();
  const read = alloc.buffer(device, { size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  try {
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(src, 0, read, 0, size); device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const bytes = read.getMappedRange().slice(0); read.unmap();
    return { bytes, ms: performance.now() - t0 };
  } finally { read.destroy(); }
}

export function profileWords({ k, floor, factor, H, steps, iterations }, start, count, boxCount) {
  const words = new ArrayBuffer(48), f = new Float32Array(words), u = new Uint32Array(words);
  f[0] = k; f[1] = floor; f[2] = factor; f[3] = 2 * Math.tan(Math.PI / 6) / H;
  u[4] = steps; u[5] = iterations; u[6] = start; u[7] = count; u[8] = boxCount;
  return new Uint8Array(words);
}

// Bounded batches, at most two outstanding, each registered with the watchdog. workMs excludes readback.
export async function traceList({ device, alloc, watchdog, pipelines, field, profile, origins, directions, boxes = new Float32Array(4), batch = 512, label = field }) {
  const n = origins.length / 3, pipeline = pipelines[`trace_list/${field}`];
  const owned = [];
  const keep = b => { owned.push(b); return b; };
  try {
    const o = keep(upload(device, alloc, vec4(origins), GPUBufferUsage.STORAGE)), d = keep(upload(device, alloc, vec4(directions), GPUBufferUsage.STORAGE));
    const bx = keep(upload(device, alloc, boxes, GPUBufferUsage.STORAGE));
    const results = keep(alloc.buffer(device, { size: Math.max(16, 16 * n), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
    const batches = [], inflight = []; const t0 = performance.now();
    for (let start = 0; start < n; start += batch) {
      while (inflight.length >= 2) await inflight.shift();
      if (watchdog.stopped) throw new Error('no observable progress for 5 s: experiment stopped by the watchdog');
      const count = Math.min(batch, n - start);
      const uniform = upload(device, alloc, profileWords(profile, start, count, boxes.length / 4), GPUBufferUsage.UNIFORM);
      const bind = alloc.bindGroup(device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: bx } },
        { binding: 2, resource: { buffer: o } }, { binding: 3, resource: { buffer: d } }, { binding: 4, resource: { buffer: results } }] }));
      const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
      const row = { start, count, submitMs: performance.now(), doneMs: null };
      const done = watchdog.submitted(`${label}:${start}`, { label, start, count });
      device.queue.submit([enc.finish()]); batches.push(row);
      inflight.push(device.queue.onSubmittedWorkDone().then(() => { row.doneMs = performance.now(); done(); uniform.destroy(); }));
    }
    await Promise.all(inflight);
    const workMs = performance.now() - t0;
    const { bytes, ms } = await readBack(device, alloc, results, 16 * n);
    return { words: new Uint32Array(bytes), workMs, readMs: ms, batches };
  } finally { for (const b of owned) b.destroy(); }
}
```

- [ ] **Step 9: Write the driver registry and `browser/drivers/checks.js`**

```js
// spikes/project0/browser/drivers/index.js — the driver registry. Later tasks add the modules it names.
const DRIVERS = { 'derivative-policy': './checks.js', G3: './checks.js', G4: './checks.js', G5: './checks.js',
  smoke: './smoke.js',                                                                               // T7
  G11: './resources.js', G13: './lifecycle.js',                                                      // T8
  G1: './g1.js', G2: './g2.js', timing: './timing.js', G8: './g8.js', G10: './g10.js', G12: './g12.js', visible: './visible.js',  // T9
  precision: './precision.js' };                                                                     // T12
export async function runGateDriver(gate, fixtures, params, status) {
  const path = DRIVERS[gate];
  if (!path) throw new Error(`no driver for ${gate}`);
  return (await import(path)).run(gate, fixtures, params, status);
}
```

```js
// spikes/project0/browser/drivers/checks.js — G3/G4/G5 and policy drivers: raw readbacks only, never a verdict.
import { acquire, destroy, onLoss } from '../../gpu/device.js';
import { prepare, upload, readBack, traceList } from '../../gpu/webgpu.js';
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog } from '../../gpu/watchdog.js';
import { packBoxes, packRows } from '../packing.js';

export async function arith(device, alloc, watchdog, pipelines, entry, inputs, cap, rows) {
  const n = inputs.length / 4, p = pipelines[entry];
  const owned = [];
  try {
    const uniform = upload(device, alloc, new Uint32Array([n, cap, 0, 0]), GPUBufferUsage.UNIFORM); owned.push(uniform);
    const input = upload(device, alloc, inputs, GPUBufferUsage.STORAGE); owned.push(input);
    const output = alloc.buffer(device, { size: Math.max(16, 16 * rows), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }); owned.push(output);
    // layout 'auto' contains only statically used bindings: qjulia_offplane does not use binding 0.
    const entries = [{ binding: 1, resource: { buffer: input } }, { binding: 2, resource: { buffer: output } }];
    if (entry !== 'qjulia_offplane') entries.unshift({ binding: 0, resource: { buffer: uniform } });
    const bind = alloc.bindGroup(device.createBindGroup({ layout: p.getBindGroupLayout(0), entries }));
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(p); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(entry === 'qjulia_offplane' ? 1 : Math.ceil(n / 64)); pass.end();
    const done = watchdog.submitted(entry, { entry, n });
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone(); done();
    return new Uint32Array((await readBack(device, alloc, output, 16 * rows)).bytes);
  } finally { for (const b of owned) b.destroy(); }
}

export async function run(gate, fx, params, status) {
  const alloc = createAllocator({ capBytes: fx.resources.capBytes }), watchdog = createWatchdog();
  const invalidations = [];
  const off = onLoss(info => invalidations.push(`device lost: ${info.reason}${info.injected ? ' (injected)' : ''}`));
  const { device } = await acquire();
  try {
    const pipelines = await prepare(device, alloc, status), slots = [];
    if (gate === 'G3') {
      for (const [slot, fixture] of Object.entries(fx.analytic)) {
        const field = slot.startsWith('menger') ? 'menger' : slot;
        const boxes = fixture.boxes.length ? packBoxes(fixture.boxes) : new Float32Array(4);
        const { words, workMs } = await traceList({ device, alloc, watchdog, pipelines, field, profile: fx.profiles.g3, origins: Float32Array.from(fixture.effectiveOrigins), directions: Float32Array.from(fixture.effectiveDirections), boxes, label: `G3/${slot}` });
        slots.push({ slot, raw: { words: Array.from(words.subarray(0, 4 * fixture.rays.length)), workMs } });
      }
    } else if (gate === 'G4') {
      const words = await arith(device, alloc, watchdog, pipelines, 'bulb_samples', packRows(fx.arithmetic.bulb, s => [...s.input, 0]), fx.arithmeticProtocol.bulb.iterations, fx.arithmetic.bulb.length);
      slots.push({ slot: 'bulb-samples', raw: { words: Array.from(words) } });
    } else if (gate === 'G5') {
      const plane = await arith(device, alloc, watchdog, pipelines, 'qjulia_plane', packRows(fx.arithmetic.plane, s => s.input), fx.arithmeticProtocol.plane.iterations, fx.arithmetic.plane.length);
      slots.push({ slot: 'qjulia-plane', raw: { words: Array.from(plane) } });
      const { q, C } = fx.arithmetic.offplane;
      const orbit = new Float32Array((await arith(device, alloc, watchdog, pipelines, 'qjulia_offplane', Float32Array.from([...q, ...C]), 0, 8)).buffer);
      slots.push({ slot: 'qjulia-offplane', raw: { orbit: Array.from(orbit) } });
    } else if (gate === 'derivative-policy') {
      const words = await arith(device, alloc, watchdog, pipelines, 'derivative_policy', packRows(fx.derivativePolicy, v => [v.grow, v.dr, 0, 0]), 0, fx.derivativePolicy.length);
      slots.push({ slot: 'vectors', raw: { fits: fx.derivativePolicy.map((_, i) => words[4 * i]) } });
    } else throw new Error(`checks.js has no driver for ${gate}`);
    if (watchdog.stall) invalidations.push(`no observable progress for 5 s: ${JSON.stringify(watchdog.stall.outstanding)}`);
    return { slots, invalidations, alloc: alloc.inventory() };
  } finally { off(); watchdog.dispose(); alloc.destroyAll(); destroy(); }
}
```

The `G4` cap (64) and the `G5` cap (128) are taken from `fixtures.arithmeticProtocol`.
`arithmetic.*.input` already holds the effective f32 values, so the shader's input equals the
oracle's input.

- [ ] **Step 10: Write the complete Node runner, `run.mjs`**

```js
// spikes/project0/run.mjs — node spikes/project0/run.mjs --gate G4 [--mode headed|headless] [--args attempt1|remediation] [--campaign <name>]
// One evidence-finalisation path for every outcome: success, page error, timeout, watchdog stop or launch failure.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { ROOT, HARNESS_PATH, ATTEMPT1_ARGS, startServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';
import { fixtureIdentity, implementationIdentity, launchIdentity, environmentIdentity, newRunDir, writeRecord } from './evidence.mjs';
import { metricsFor } from './measure/index.mjs';

process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
const REMEDIATION = resolve(ROOT, 'spikes/project0/launch-remediation.json');
export const LAUNCH = { attempt1: ATTEMPT1_ARGS, ...(existsSync(REMEDIATION) ? { remediation: JSON.parse(readFileSync(REMEDIATION, 'utf8')) } : {}) };
// Outer deadlines (ms): Node's independent bound on each session, beyond the page's own 5 s watchdog.
export const DEADLINE = { G1: 120000, G3: 300000, G4: 120000, G5: 120000, 'derivative-policy': 120000, smoke: 300000, G11: 300000, G13: 300000, timing: 1200000, G8: 300000, G10: 300000, G12: 1200000, visible: 300000, precision: 3600000 };
const EXPERIMENTS = new Set(['derivative-policy', 'smoke', 'visible', 'precision']);   // not gates: no metric derivation

async function environment(context, commandLine, invalidations) {
  const gpuPage = await context.newPage(); await gpuPage.goto('chrome://gpu'); await gpuPage.waitForTimeout(1500);
  const chromeGpuText = await gpuPage.locator('body').innerText(); await gpuPage.close();
  const browserVersion = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
  const base = { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], session: process.env.XDG_SESSION_TYPE || 'unknown' };
  try { return { chromeGpuText, env: environmentIdentity(chromeGpuText, base) }; }
  catch (e) { invalidations.push(`environment identity: ${e.message}`); return { chromeGpuText, env: { ...base, driver: 'unknown' } }; }
}

async function waitResult(page, gate, runDir, deadlineMs) {
  const start = Date.now(); let checkpoints = 0;
  for (;;) {
    let state;
    try { state = await page.evaluate(n => ({ result: window.p0Result ?? null, checkpoints: (window.p0Checkpoints || []).slice(n) }), checkpoints); }
    catch (e) { return { error: `browser hang or crash: ${e.message}` }; }
    for (const cp of state.checkpoints) await writeFile(resolve(runDir, `checkpoint-${checkpoints++}.json`), JSON.stringify(cp));
    if (state.result) return state.result;
    if (Date.now() - start > deadlineMs) return { error: `browser hang: no result within the ${deadlineMs} ms outer deadline` };
    await new Promise(r => setTimeout(r, gate === 'G12' ? 15000 : 1000));
  }
}

// Writes one record per returned slot — or one incomplete record if the session produced no usable slots.
async function finalise({ gate, mode, campaign, runDir, identity, launchInfo, chromeGpuText, result, invalidations, fixtures, experiment }) {
  const records = [], stamp = runDir.split('/').at(-1);
  const slots = result?.slots?.length ? result.slots : [{ slot: 'incomplete', raw: { error: result?.error ?? 'no result' } }];
  for (const s of slots) {
    const slotGate = s.gate ?? gate;
    const recordInvalidations = [...invalidations, ...(result?.invalidations ?? []), ...(result?.error ? [`page: ${result.error}`] : []), ...(s.slot === 'incomplete' ? ['incomplete: the session produced no result'] : [])];
    const raw = slotGate === 'G1' ? { ...s.raw, chromeGpuText } : s.raw;
    let metrics = {};
    if (!experiment && s.slot !== 'incomplete') { try { metrics = await metricsFor(slotGate, s.slot, raw, fixtures); } catch (e) { recordInvalidations.push(`metrics: ${e.message}`); } }
    const id = `${slotGate}-${s.slot.replace(/[^A-Za-z0-9.-]/g, '_')}-${stamp}`;
    const record = { schema: 1, id, gate: slotGate, slot: s.slot, campaign, mode, experiment: Boolean(experiment), identity, invalidations: recordInvalidations, metrics };
    records.push(await writeRecord(runDir, record, [
      { name: `${id}.raw.json`, data: JSON.stringify(raw) },
      { name: `${id}.launch.json`, data: JSON.stringify(launchInfo) },
      { name: `${id}.chrome-gpu.txt`, data: chromeGpuText ?? '' }]));
  }
  return records;
}

export async function runSession({ gate, mode = 'headless', args = 'attempt1', campaign = 'dev', extra = '' }) {
  if (!LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  if (!/^[a-z0-9-]+$/.test(campaign)) throw new Error('campaign identity required');
  const experiment = EXPERIMENTS.has(gate);
  const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
  const fixture = await fixtureIdentity(), implementation = await implementationIdentity();
  const runDir = await newRunDir(`${campaign}-${gate.toLowerCase()}-${mode}`);
  const invalidations = []; let server, launched, result = null, chromeGpuText = '', identity = null, launchInfo = { args, requestedArgs: LAUNCH[args] };
  try {
    server = await startServer();
    launched = await launchChrome({ headless: mode === 'headless', args: LAUNCH[args], profileKind: `${gate.toLowerCase()}-${mode}`, chromium });
    const commandLine = await effectiveCommandLine(launched.context); assertSandboxed(commandLine);
    launchInfo = { args, requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile };
    const environmentInfo = await environment(launched.context, commandLine, invalidations);
    chromeGpuText = environmentInfo.chromeGpuText;
    identity = { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity({ requestedArgs: launched.requestedArgs, mode, commandLine }), ...environmentInfo.env };
    const page = await launched.context.newPage();
    page.on('pageerror', e => invalidations.push(`page error: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') invalidations.push(`console error: ${m.text()}`); });
    await page.goto(`${server.url}${HARNESS_PATH}?mode=gate&gate=${encodeURIComponent(gate)}&runMode=${mode}${extra}`);
    result = await waitResult(page, gate, runDir, DEADLINE[gate] ?? 900000);
  } catch (error) {
    invalidations.push(`session: ${error.message}`);
  } finally {
    await launched?.context.close().catch(e => invalidations.push(`close: ${e.message}`));
    await server?.stop();
  }
  identity ??= { backend: 'webgpu', ...fixture, ...implementation, launchHash: '0'.repeat(64), mode, browserVersion: 'unknown', browserExecutable: 'unknown', driver: 'unknown', session: 'unknown' };
  const records = await finalise({ gate, mode, campaign, runDir, identity, launchInfo, chromeGpuText, result, invalidations, fixtures, experiment });
  return { records, runDir, result };
}

// G2: three fresh processes with fresh empty profiles; navigation first, chrome://gpu only after the measurement.
export async function runG2({ args = 'attempt1', campaign = 'dev' } = {}) {
  if (!LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
  const fixture = await fixtureIdentity(), implementation = await implementationIdentity();
  const runDir = await newRunDir(`${campaign}-g2-headed`), records = [];
  for (let i = 0; i < 3; i++) {
    const invalidations = []; let server, launched, chromeGpuText = '', identity = null, launchInfo = { args, requestedArgs: LAUNCH[args] };
    const slots = [];
    try {
      server = await startServer();
      launched = await launchChrome({ headless: false, args: LAUNCH[args], profileKind: `g2-fresh-${i}`, chromium });
      const page = await launched.context.newPage();
      page.on('pageerror', e => invalidations.push(`page error: ${e.message}`));
      await page.goto(`${server.url}${HARNESS_PATH}?mode=gate&gate=G2&runMode=headed`);
      const first = await waitResult(page, 'G2', runDir, 60000);
      slots.push({ slot: `fresh-${i}`, raw: { ...(first.slots?.[0]?.raw ?? { error: first.error }), emptyProfile: 1, freshProcess: 1 } });
      if (i === 2) {
        await page.reload();
        const warm = await waitResult(page, 'G2', runDir, 60000);
        slots.push({ slot: 'warm', raw: warm.slots?.[0]?.raw ?? { error: warm.error } });
      }
      const commandLine = await effectiveCommandLine(launched.context); assertSandboxed(commandLine);
      launchInfo = { args, requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile };
      const environmentInfo = await environment(launched.context, commandLine, invalidations);
      chromeGpuText = environmentInfo.chromeGpuText;
      identity = { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity({ requestedArgs: launched.requestedArgs, mode: 'headed', commandLine }), ...environmentInfo.env };
    } catch (error) { invalidations.push(`session: ${error.message}`); }
    finally { await launched?.context.close().catch(() => {}); await server?.stop(); }
    identity ??= { backend: 'webgpu', ...fixture, ...implementation, launchHash: '0'.repeat(64), mode: 'headed', browserVersion: 'unknown', browserExecutable: 'unknown', driver: 'unknown', session: 'unknown' };
    records.push(...await finalise({ gate: 'G2', mode: 'headed', campaign, runDir, identity, launchInfo, chromeGpuText, result: { slots, invalidations: [] }, invalidations, fixtures, experiment: false }));
  }
  return { records, runDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { gate: { type: 'string' }, mode: { type: 'string', default: 'headless' }, args: { type: 'string', default: 'attempt1' }, campaign: { type: 'string', default: 'dev' } } });
  const { records, runDir } = values.gate === 'G2' ? await runG2(values) : await runSession(values);
  for (const r of records) console.log(`${r.gate} ${r.slot}: ${JSON.stringify(r.metrics)}${r.invalidations.length ? ` INVALIDATIONS ${r.invalidations.join('; ')}` : ''}`);
  if (values.gate === 'derivative-policy') {
    const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
    const raw = JSON.parse(await readFile(resolve(ROOT, 'artifacts/project0', records[0].artifacts[0].path), 'utf8'));
    const bad = (raw.fits ?? []).length !== fixtures.derivativePolicy.length ? ['length mismatch'] : fixtures.derivativePolicy.filter((v, i) => Boolean(raw.fits[i]) !== v.fits);
    console.log(`derivative policy: ${bad.length} mismatches of ${fixtures.derivativePolicy.length}`);
    process.exitCode = bad.length || records[0].invalidations.length ? 1 : 0;
  }
  console.log(`evidence: ${runDir}`);
}
```

Every outcome, including a launch failure, a page error, an outer-deadline timeout or a
watchdog stop, ends in `finalise`. It writes a record with explicit invalidations; a session
never ends without a record. The `campaign` is part of the record **before** `writeRecord`
hashes and persists it. The effective command line and the launch configuration are
persisted as a hashed `.launch.json` artefact, not only as `launchHash`.

- [ ] **Step 11: Commit, after Codex's read-only review, before any GPU run in this task**

```bash
git add spikes/project0/gpu/alloc.js spikes/project0/gpu/watchdog.js spikes/project0/gpu/fields.wgsl spikes/project0/gpu/arithmetic.wgsl spikes/project0/gpu/trace.wgsl spikes/project0/gpu/webgpu.js spikes/project0/browser/packing.js spikes/project0/browser/drivers/index.js spikes/project0/browser/drivers/checks.js spikes/project0/measure/decode.mjs spikes/project0/measure/arith.mjs spikes/project0/measure/index.mjs spikes/project0/run.mjs spikes/project0/tests/alloc.test.mjs spikes/project0/tests/watchdog.test.mjs spikes/project0/tests/packing.test.mjs spikes/project0/tests/decode.test.mjs spikes/project0/tests/arith-metrics.test.mjs
git commit -m "Project 0 T6: allocator, watchdog, WGSL arithmetic/ray-list kernels with the exact range guard, strict decoding, registries, runner"
```

- [ ] **Step 12: Verify the policy guard on the GPU first**

Run: `node spikes/project0/run.mjs --gate derivative-policy`
Expected: `derivative policy: 0 mismatches of <N>`, where N is the length of
`fixtures.derivativePolicy`, and exit code 0.

Any mismatch means the WGSL guard disagrees with the frozen policy vectors. Fix the WGSL, then
commit and rerun. **Never edit the vectors.**

- [ ] **Step 13: Run the G4, G5 and G3 development checks**

Run, in order:
- `node spikes/project0/run.mjs --gate G4`
- `node spikes/project0/run.mjs --gate G5`
- `node spikes/project0/run.mjs --gate G3`

Expected:
- **Every run:** one metrics line per slot, with the `gatePlan` keys, and an `evidence:`
  directory.
- **A correct implementation shows:**
  - G4 `statusErrors 0`, `indexErrors 0`, `logRRatio` and `deRatio` ≤ 1;
  - G5 plane errors 0, `logRRatio` ≤ 1, off-plane `componentRatio` ≤ 1;
  - G3 `statusErrors 0`, `edgeErrors 0` and `depthRatio` ≤ 1 per fixture.

**If a ratio exceeds 1, an error count is nonzero, or invalidations appear,** that is a
finding: diagnose it with the raw file and a CPU reproduction on the same effective inputs.
Under spec §7, **tolerances and fixtures are never edited.**

---

### Task T7: Submission ledger, band planner, viewport renderer, shading/coverage and presentation

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).

**Files:**
- `spikes/project0/gpu/scheduler.js`, pure modules:
  - `Ledger`, the device-session submission credits (at most two outstanding across every
    request, generation and resize);
  - `Planner`, the bands of one generation, with adaptive sizing and row-to-range splitting.
- `spikes/project0/gpu/view.wgsl`, the camera-mode marcher entry point, which writes the
  depth, status and normal textures.
- `spikes/project0/gpu/present.wgsl`, the shade pass (display texture plus workgroup-aggregated
  coverage counts) and the blit.
- `spikes/project0/gpu/renderer.js`, the WebGPU viewport: ledger-bound submission, lifetime
  and epoch checks, deferred target retirement, reserved readback slots and timestamp queries.
- `spikes/project0/browser/events.js`, the page-clock event log.
- `spikes/project0/browser/drivers/common.js`, the shared driver helpers: `session()`,
  `renderOnce()` and `sleep()`.
- `spikes/project0/browser/drivers/smoke.js`, the viewport smoke check.
- Tests: `spikes/project0/tests/scheduler.test.mjs` and `spikes/project0/tests/renderer.test.mjs`.
  The renderer test uses a deterministic fake device and asserts the **actual** number of
  `queue.submit` calls.

**Interfaces:**
- Consumes:
  - T5: `acquire`, `currentEpoch`, `onLoss`;
  - T6: `createAllocator`, `createWatchdog`, `upload`, `profileWords`, `source`, `compile`;
  - T4: `fixtures.views`, `fixtures.profiles`, `fixtures.shading`;
  - T3: `reference/camera.js` `norm` and `cross`, pure vector utilities the charter permits sharing.
- Produces:
  - `new Ledger({max = 2})`:
    - `available() → boolean`;
    - `take(meta) → ticket`;
    - `release(ticket) → boolean`, which releases exactly once;
    - `retire(epoch) → number`, which drops the tickets of a retired device epoch;
    - `outstanding() → number`;
    - `maxObserved() → number`.
  - `new Planner({rows, cols, targetMs = 10, initialRows = 8, minRange = 64, carry?})`:
    - `next() → band | null`, where a band is `{row0, rows, col0, cols, area}`;
    - `completed(band, ms)`;
    - `done() → boolean`;
    - `carry() → {rowsPerBand, colsPerBand}`, so that sizing survives into the next
      generation;
    - `stats() → {bandMs, rowsPerBand, splits}`.
  - `new Renderer({device, viewport, canvas, fixtures, events, alloc, watchdog, epoch = currentEpoch, timestamps = device.features.has('timestamp-query')})`:
    - `render({view, profile, camera?, label?, override?: {W, H}}) → requestId`. The request
      event is recorded at function entry. A new request cancels only the previous
      generation's *unsubmitted* bands;
    - `onPublish(handler) → unsubscribe`, where the handler receives
      `{requestId, generation, epoch, label, W, H, counts, publishedMs}`;
    - `stats() → {outstandingMax, submits, bands: [{requestId, generation, epoch, band, submitMs, doneMs, gpuMs}], planner}`;
    - `destroy()`.
  - `events`:
    - `mark(type, fields) → event` with `{type, t, ...}`;
    - `list()` and `clear()`;
    - `harness(fn)`, which brackets harness work with `performance.measure('harness:…')`.

    The renderer records these event types: `request`, `submit` (with `requestId`,
    `generation`, `epoch`, `batch`), `band-done`, `stale-band`, `complete`, `publish` and
    `suppressed-publication`.
  - `session(fixtures, status, {alloc?}) → {device, info, epoch, viewport, renderer, alloc, watchdog, losses, close()}`.
    It installs the unexpected-loss handler and the watchdog *before* the first submission.
    `close()` unsubscribes, disposes the watchdog, destroys the renderer and the device, and
    then the allocator's resources.
  - `renderOnce(renderer, args, {timeoutMs}) → frame`, where a frame is
    `{requestId, label, W, H, counts, t}`. It always unsubscribes.

**Semantics (from Codex's review, adopted):**
- **The ledger:** outstanding-submission accounting belongs to the device session. It survives
  request replacement and changes of dimension.
- **Generations:** a new generation cancels only work not yet submitted.
- **Submitted batches:** every submitted batch keeps its planner, epoch, generation and batch
  identity until it completes or the device is retired. A completion releases its own credit
  even when its generation is obsolete, and then lets the current generation progress.
- **Device epochs:** only an actual device-epoch transition (`retire`) clears the ledger.
- **Lifetime checks:** `pump`, `finish`, mapping callbacks and publication all check the
  renderer's lifetime and the captured device epoch. A destroyed renderer cannot submit, map or
  publish.
- **Retired targets:** these stay accounted until their submitted users have drained.
- **Readback slots:** a slot is reserved *before* its copy is encoded, and only the
  reservation's owner releases it.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/scheduler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, Planner } from '../gpu/scheduler.js';

test('the ledger allows at most two outstanding and releases each ticket once', () => {
  const l = new Ledger({ max: 2 });
  const a = l.take({ g: 1 }), b = l.take({ g: 1 });
  assert.equal(l.available(), false); assert.throws(() => l.take({ g: 2 }), /no submission credit/);
  assert.equal(l.release(a), true); assert.equal(l.release(a), false);
  assert.equal(l.outstanding(), 1); l.take({ g: 2 }); assert.equal(l.maxObserved(), 2);
});

test('retiring a device epoch drops only that epoch\'s tickets', () => {
  const l = new Ledger({ max: 2 });
  l.take({ epoch: 1 }); l.take({ epoch: 1 });
  assert.equal(l.retire(1), 2); assert.equal(l.outstanding(), 0); assert.equal(l.available(), true);
});

test('every row is covered exactly once, and a final short band is exact', () => {
  for (const rows of [360, 37]) {
    const p = new Planner({ rows, cols: 64, initialRows: 8 }); const seen = new Uint8Array(rows); let band;
    while ((band = p.next())) { p.completed(band, 5); if (band.col0 === 0) for (let r = band.row0; r < band.row0 + band.rows; r++) seen[r]++; }
    assert.ok(p.done()); assert.ok(seen.every(v => v === 1));
  }
});

test('slow bands shrink the band, then split a row into column ranges; the sizing carries over', () => {
  const p = new Planner({ rows: 64, cols: 1024, initialRows: 8, targetMs: 10, minRange: 64 }); let band;
  while ((band = p.next())) p.completed(band, 200);
  assert.ok(p.stats().rowsPerBand.at(-1) <= 1); assert.ok(p.stats().splits > 0);
  const q = new Planner({ rows: 64, cols: 1024, carry: p.carry() });
  assert.equal(q.next().rows, 1);
});
```

```js
// spikes/project0/tests/renderer.test.mjs — deterministic fake device: completions and mappings resolve only when the test says so.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.GPUBufferUsage ??= { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128, QUERY_RESOLVE: 512 };
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUMapMode ??= { READ: 1 };
globalThis.navigator ??= {};
globalThis.navigator.gpu ??= { getPreferredCanvasFormat: () => 'bgra8unorm' };
const { Renderer } = await import('../gpu/renderer.js');
const { createAllocator } = await import('../gpu/alloc.js');
const { createWatchdog } = await import('../gpu/watchdog.js');

function fakeDevice() {
  const pending = [], maps = [];
  let submits = 0;
  const pass = () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, draw() {}, end() {} });
  const device = {
    features: new Set(),
    createBuffer: d => ({ size: d.size, destroy() {}, mapAsync: () => new Promise((res, rej) => maps.push({ res, rej })), getMappedRange: () => new ArrayBuffer(d.size), unmap() {} }),
    createTexture: d => ({ ...d, createView: () => ({}), destroy() { this.dead = true; } }),
    createBindGroup: () => ({}), createQuerySet: () => ({ destroy() {} }),
    createCommandEncoder: () => ({ beginComputePass: pass, beginRenderPass: pass, copyBufferToBuffer() {}, resolveQuerySet() {}, finish: () => ({}) }),
    queue: { submit() { submits++; }, writeBuffer() {}, onSubmittedWorkDone: () => new Promise(res => pending.push(res)) },
  };
  return { device, pending, maps, submits: () => submits, completeOne: async () => { pending.shift()?.(); await new Promise(r => setImmediate(r)); }, mapAll: async () => { while (maps.length) maps.shift().res(); await new Promise(r => setImmediate(r)); } };
}
const fixtures = { views: { 'bulb-overview': { camera: { origin: [1.92, -1.44, 0.7], target: [0, 0, 0] } } }, profiles: { draft: { W: 64, H: 64, iterations: 64, steps: 256, k: 0.9, floor: 1e-6, factor: 0.5 } } };
const pipeline = { getBindGroupLayout: () => ({}) };
const viewport = { bulb: pipeline, sphere: pipeline, shade: pipeline, blit: pipeline };
const events = { log: [], mark(type, f = {}) { const e = { type, t: performance.now(), ...f }; this.log.push(e); return e; } };
function make(fake, epoch = () => 1) {
  const canvas = { width: 1280, height: 720, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }), canvas }) };
  return new Renderer({ device: fake.device, viewport, canvas, fixtures, events, alloc: createAllocator({ capBytes: 2 ** 30 }), watchdog: createWatchdog({ every: null }), epoch });
}

test('replacement requests never exceed two submitted bands while nothing completes', async () => {
  const fake = fakeDevice(), r = make(fake);
  for (let i = 0; i < 3; i++) r.render({ view: 'bulb-overview', profile: 'draft' });
  assert.equal(fake.submits(), 2, 'only two band submissions are allowed with no completions');
  await fake.completeOne();                          // a stale band completes: its credit frees one submission for the current generation
  assert.equal(fake.submits(), 3);
  const submitted = events.log.filter(e => e.type === 'submit');
  assert.equal(submitted.at(-1).requestId, 3, 'the freed credit goes to the current request');
});

test('a resize keeps the ledger: dimension changes do not grant fresh credits', async () => {
  const fake = fakeDevice(), r = make(fake);
  r.render({ view: 'bulb-overview', profile: 'draft' });
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 32, H: 32 } });
  assert.equal(fake.submits(), 2);
});

test('a destroyed renderer neither submits nor publishes', async () => {
  const fake = fakeDevice(), r = make(fake); let published = 0;
  r.onPublish(() => published++);
  r.render({ view: 'bulb-overview', profile: 'draft' });
  r.destroy();
  for (let i = 0; i < 10; i++) await fake.completeOne();
  await fake.mapAll();
  assert.equal(fake.submits(), 2); assert.equal(published, 0);
});

test('completions from a retired device epoch never publish', async () => {
  const fake = fakeDevice(); let epoch = 1; const r = make(fake, () => epoch); let published = 0;
  r.onPublish(() => published++);
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });     // one band covers the frame
  epoch = 2;                                                                            // device lost after submission
  for (let i = 0; i < 5; i++) await fake.completeOne();
  await fake.mapAll();
  assert.equal(published, 0);
  assert.ok(events.log.some(e => e.type === 'stale-band' || e.type === 'suppressed-publication'));
});

test('onPublish returns an unsubscribe function', async () => {
  const fake = fakeDevice(), r = make(fake); let calls = 0;
  const off = r.onPublish(() => calls++); off();
  r.render({ view: 'bulb-overview', profile: 'draft', override: { W: 8, H: 8 } });
  for (let i = 0; i < 4; i++) await fake.completeOne();
  await fake.mapAll(); for (let i = 0; i < 4; i++) await fake.completeOne();
  assert.equal(calls, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/scheduler.test.mjs spikes/project0/tests/renderer.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `gpu/scheduler.js` and `gpu/renderer.js`.

- [ ] **Step 3: Implement `gpu/scheduler.js`**

```js
// spikes/project0/gpu/scheduler.js — pure scheduling. The Ledger is per device session; the Planner is per generation.
export class Ledger {
  constructor({ max = 2 } = {}) { this.max = max; this.tickets = new Set(); this.peak = 0; }
  available() { return this.tickets.size < this.max; }
  take(meta) {
    if (!this.available()) throw new Error('no submission credit: the outstanding limit is reached');
    const ticket = { ...meta, live: true }; this.tickets.add(ticket);
    this.peak = Math.max(this.peak, this.tickets.size);
    return ticket;
  }
  release(ticket) { if (!ticket.live || !this.tickets.has(ticket)) return false; ticket.live = false; this.tickets.delete(ticket); return true; }
  retire(epoch) { let n = 0; for (const t of [...this.tickets]) if (t.epoch === epoch) { t.live = false; this.tickets.delete(t); n++; } return n; }
  outstanding() { return this.tickets.size; }
  maxObserved() { return this.peak; }
}

export class Planner {
  constructor({ rows, cols, targetMs = 10, initialRows = 8, minRange = 64, carry = null }) {
    Object.assign(this, { rows, cols, targetMs, minRange });
    this.rowsPerBand = Math.min(rows, carry?.rowsPerBand ?? initialRows);
    this.colsPerBand = Math.min(cols, carry?.colsPerBand ?? cols);
    this.row = 0; this.col = 0; this.remaining = rows * cols;
    this.log = { bandMs: [], rowsPerBand: [], splits: 0 };
  }
  next() {
    if (this.row >= this.rows) return null;
    const rows = Math.min(this.rowsPerBand, this.rows - this.row);
    const split = rows === 1 && this.colsPerBand < this.cols;
    const cols = split ? Math.min(this.colsPerBand, this.cols - this.col) : this.cols;
    const band = { row0: this.row, rows, col0: split ? this.col : 0, cols, area: rows * cols };
    if (split && this.col + cols < this.cols) this.col += cols; else { this.row += rows; this.col = 0; }
    return band;
  }
  // Adapt the work per band towards targetMs: halve when slow; below one row, split the row (not below minRange);
  // grow by 25% (or re-merge ranges) when much faster than the target.
  completed(band, ms) {
    this.log.bandMs.push(ms); this.remaining -= band.area;
    if (ms > this.targetMs) {
      if (this.rowsPerBand > 1) this.rowsPerBand = Math.max(1, Math.floor(this.rowsPerBand / 2));
      else if (this.colsPerBand > this.minRange) { this.colsPerBand = Math.max(this.minRange, Math.floor(this.colsPerBand / 2)); this.log.splits++; }
    } else if (ms < this.targetMs / 2) {
      if (this.colsPerBand < this.cols) this.colsPerBand = Math.min(this.cols, this.colsPerBand * 2);
      else this.rowsPerBand = Math.min(this.rows, Math.ceil(this.rowsPerBand * 1.25));
    }
    this.log.rowsPerBand.push(this.rowsPerBand);
  }
  done() { return this.remaining === 0; }
  carry() { return { rowsPerBand: this.rowsPerBand, colsPerBand: this.colsPerBand }; }
  stats() { return { bandMs: [...this.log.bandMs], rowsPerBand: [...this.log.rowsPerBand], splits: this.log.splits }; }
}
```

- [ ] **Step 4: Write `gpu/view.wgsl` and `gpu/present.wgsl`**

`view.wgsl` is assembled after `fields.wgsl` and `trace.wgsl`, and reuses `trace_ray`,
`field` and `prof`.

```wgsl
// spikes/project0/gpu/view.wgsl — A.1 camera rays for one band; writes depth, status, normal.
struct Camera { origin: vec4f, fwd: vec4f, right: vec4f, up: vec4f, size: vec4u, band: vec4u }   // size = (W, H, 0, 0); band = (row0, rows, col0, cols)
@group(1) @binding(0) var<uniform> cam: Camera;
@group(1) @binding(1) var depth_out: texture_storage_2d<r32float, write>;
@group(1) @binding(2) var status_out: texture_storage_2d<r32uint, write>;
@group(1) @binding(3) var normal_out: texture_storage_2d<rgba16float, write>;
const NORMAL_UNAVAILABLE: u32 = 256u;   // bit 8 of status; bits 0..3 ray status, bits 4..7 reason

fn normal_at(p: vec3f, eps: f32) -> vec4f {
  var g = vec3f(0.0);
  for (var a: u32 = 0u; a < 3u; a++) {
    var o = vec3f(0.0); o[a] = eps;
    let x = field(p + o); let y = field(p - o);
    if (x.status != ST_ESCAPED || y.status != ST_ESCAPED) { return vec4f(0.0); }
    g[a] = (x.de - y.de) / (2.0 * eps);
  }
  let l = length(g);
  if (!(l > 0.0) || l > 3.4e38) { return vec4f(0.0); }
  return vec4f(g / l, 1.0);
}

@compute @workgroup_size(8, 8)
fn view_band(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= cam.band.w || id.y >= cam.band.y) { return; }
  let px = cam.band.z + id.x;  let py = cam.band.x + id.y;
  let w = f32(cam.size.x);  let h = f32(cam.size.y);  let th = 0.57735026918962576;   // tan(30 degrees)
  let sx = (2.0 * (f32(px) + 0.5) / w - 1.0) * th * w / h;
  let sy = (1.0 - 2.0 * (f32(py) + 0.5) / h) * th;
  let d = normalize(cam.fwd.xyz + sx * cam.right.xyz + sy * cam.up.xyz);
  let r = trace_ray(cam.origin.xyz, d);
  var code = r.status | (r.reason << 4u);
  var n = vec4f(0.0);
  if (r.status == RAY_HIT) {
    n = normal_at(cam.origin.xyz + r.t * d, 0.5 * max(prof.floor, prof.factor * prof.alpha * r.t));
    if (n.w == 0.0) { code = code | NORMAL_UNAVAILABLE; }
  }
  let c = vec2u(px, py);
  textureStore(depth_out, c, vec4f(r.t, 0.0, 0.0, 0.0));
  textureStore(status_out, c, vec4u(code, 0u, 0u, 0u));
  textureStore(normal_out, c, n);
}
```

```wgsl
// spikes/project0/gpu/present.wgsl — A.5 shading into rgba8unorm with workgroup-aggregated coverage; and the canvas blit.
struct Counts { total: atomic<u32>, hit: atomic<u32>, miss: atomic<u32>, point: atomic<u32>, steps: atomic<u32>, failure: atomic<u32>, normal_unavailable: atomic<u32>, _pad: u32 }
@group(0) @binding(0) var status_in: texture_2d<u32>;
@group(0) @binding(1) var normal_in: texture_2d<f32>;
@group(0) @binding(2) var display_out: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<storage, read_write> counts: Counts;
var<workgroup> local: array<atomic<u32>, 7>;

@compute @workgroup_size(8, 8)
fn shade(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li < 7u) { atomicStore(&local[li], 0u); }
  workgroupBarrier();
  let size = textureDimensions(status_in);
  if (id.x < size.x && id.y < size.y) {
    let code = textureLoad(status_in, id.xy, 0).x;
    let status = code & 15u;  let reason = (code >> 4u) & 15u;
    var color = vec3f(0.02, 0.02, 0.03);
    if (status == 0u) {
      atomicAdd(&local[1], 1u);
      if ((code & 256u) != 0u) { atomicAdd(&local[6], 1u); color = vec3f(0.5); }
      else { let n = textureLoad(normal_in, id.xy, 0).xyz; color = vec3f(0.15 + 0.85 * max(0.0, dot(n, normalize(vec3f(1.0, 0.6, 1.5))))); }
    } else if (status == 1u) { atomicAdd(&local[2], 1u); }
    else if (status == 2u) { color = vec3f(1.0, 0.0, 1.0); if (reason == 1u) { atomicAdd(&local[3], 1u); } else { atomicAdd(&local[4], 1u); } }
    else { color = vec3f(1.0, 0.0, 0.0); atomicAdd(&local[5], 1u); }
    atomicAdd(&local[0], 1u);
    textureStore(display_out, id.xy, vec4f(color, 1.0));
  }
  workgroupBarrier();
  if (li == 0u) {
    atomicAdd(&counts.total, atomicLoad(&local[0])); atomicAdd(&counts.hit, atomicLoad(&local[1])); atomicAdd(&counts.miss, atomicLoad(&local[2]));
    atomicAdd(&counts.point, atomicLoad(&local[3])); atomicAdd(&counts.steps, atomicLoad(&local[4])); atomicAdd(&counts.failure, atomicLoad(&local[5]));
    atomicAdd(&counts.normal_unavailable, atomicLoad(&local[6]));
  }
}

@group(0) @binding(0) var display_in: texture_2d<f32>;
@group(0) @binding(1) var<uniform> dst: vec4f;        // (canvas width, canvas height, 0, 0)
struct VOut { @builtin(position) pos: vec4f }
@vertex fn blit_vs(@builtin(vertex_index) i: u32) -> VOut {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return VOut(vec4f(xy * 2.0 - 1.0, 0.0, 1.0));
}
@fragment fn blit_fs(v: VOut) -> @location(0) vec4f {
  let src = textureDimensions(display_in);
  let c = vec2u(min(vec2f(src) - 1.0, floor(v.pos.xy * vec2f(src) / dst.xy)));
  return textureLoad(display_in, c, 0);   // nearest neighbour; a draft at half the backing size is shown at exactly 2x
}
```

The shade and blit entry points share bindings 0 and 1 at module scope, but their
entry-point resource interfaces are disjoint, which WGSL permits.

- [ ] **Step 5: Implement `browser/events.js` and `gpu/renderer.js`**

```js
// spikes/project0/browser/events.js — one page clock for every timing event.
const log = [];
export const mark = (type, fields = {}) => { const e = { type, t: performance.now(), ...fields }; log.push(e); return e; };
export const list = () => log.slice();
export const clear = () => { log.length = 0; };
let seq = 0;
export async function harness(fn) {
  const id = `h${seq++}`; performance.mark(`${id}-start`);
  try { return await fn(); } finally { performance.mark(`${id}-end`); performance.measure(`harness:${id}`, `${id}-start`, `${id}-end`); }
}
```

```js
// spikes/project0/gpu/renderer.js — WebGPU viewport. Submission credit comes from the session Ledger; a Planner per generation.
import { Ledger, Planner } from './scheduler.js';
import { upload, profileWords, source, compile } from './webgpu.js';
import { norm, cross } from '../reference/camera.js';
import { currentEpoch } from './device.js';

export async function prepareViewport(device, alloc, onStatus = () => {}) {
  const fields = await source('./fields.wgsl'), trace = await source('./trace.wgsl');
  const view = await compile(device, fields + trace + await source('./view.wgsl'), 'view');
  const present = await compile(device, await source('./present.wgsl'), 'present');
  onStatus('preparing viewport pipelines');
  const [bulb, sphere, shade, blit] = await Promise.all([
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: view, entryPoint: 'view_band', constants: { FIELD: 3 } } }),
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: view, entryPoint: 'view_band', constants: { FIELD: 0 } } }),
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: present, entryPoint: 'shade' } }),
    device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: present, entryPoint: 'blit_vs' }, fragment: { module: present, entryPoint: 'blit_fs', targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }] }, primitive: { topology: 'triangle-list' } }),
  ]);
  return { bulb: alloc.pipeline(bulb), sphere: alloc.pipeline(sphere), shade: alloc.pipeline(shade), blit: alloc.pipeline(blit) };
}

const RING = 3, QUERY_PAIRS = 8;

export class Renderer {
  constructor({ device, viewport, canvas, fixtures, events, alloc, watchdog, epoch = currentEpoch, timestamps = device.features.has('timestamp-query') }) {
    Object.assign(this, { device, viewport, canvas, fixtures, events, alloc, watchdog, epoch, alive: true, seq: 0, generation: 0, batchSeq: 0, job: null, carry: null, handlers: new Set() });
    this.ledger = new Ledger({ max: 2 });
    this.bands = [];
    this.submits = 0;
    this.context = canvas.getContext('webgpu');
    this.context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
    this.ring = Array.from({ length: RING }, () => ({ buf: alloc.buffer(device, { size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), owner: null }));
    this.counts = alloc.buffer(device, { size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    this.timestamps = timestamps ? { set: device.createQuerySet({ type: 'timestamp', count: 2 * QUERY_PAIRS }), resolve: alloc.buffer(device, { size: 16 * QUERY_PAIRS, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }), next: 0 } : null;
    this.targets = null; this.retired = [];
  }

  onPublish(handler) { this.handlers.add(handler); return () => this.handlers.delete(handler); }
  stats() { return { outstandingMax: this.ledger.maxObserved(), submits: this.submits, bands: this.bands.slice(), planner: this.job?.planner.stats() ?? null }; }

  targetsFor(W, H) {
    if (this.targets?.W === W && this.targets?.H === H) return this.targets;
    if (this.targets) this.retire(this.targets);
    const S = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;
    const tex = format => this.alloc.texture(this.device, { size: [W, H], format, usage: S });
    const t = { W, H, users: 0, depth: tex('r32float'), status: tex('r32uint'), normal: tex('rgba16float'), display: tex('rgba8unorm') };
    t.all = [t.depth, t.status, t.normal, t.display];
    return (this.targets = t);
  }
  retire(t) { t.retired = true; if (t.users === 0) t.all.forEach(x => x.destroy()); else this.retired.push(t); }
  drained(t) { if (--t.users === 0 && t.retired) { t.all.forEach(x => x.destroy()); this.retired = this.retired.filter(x => x !== t); } }

  render({ view, profile, camera, label = view, override = {} }) {
    const requestId = ++this.seq;
    this.events.mark('request', { requestId, view, profile, label });                 // at function entry: G7 measures from here
    if (!this.alive) throw new Error('renderer destroyed');
    if (Object.keys(override).some(k => !['W', 'H'].includes(k))) throw new Error('render override may only set W and H');
    const fx = this.fixtures, v = fx.views[view], p = { ...fx.profiles[profile], ...(v.traceOverrides || {}), ...override };
    const cam = camera || v.camera;
    const f = norm(cam.target.map((x, i) => x - cam.origin[i])), r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
    const camWords = new Float32Array(24), camU = new Uint32Array(camWords.buffer);
    [cam.origin, f, r, u].forEach((vec, i) => camWords.set(vec, 4 * i)); camU.set([p.W, p.H, 0, 0], 16);
    this.job = { requestId, generation: ++this.generation, epoch: this.epoch(), label, W: p.W, H: p.H, profile: p,
      pipeline: view === 'sphere' ? this.viewport.sphere : this.viewport.bulb, camWords, targets: this.targetsFor(p.W, p.H),
      planner: new Planner({ rows: p.H, cols: p.W, carry: this.carry }), counted: false };
    this.pump();
    return requestId;
  }

  pump() {
    const job = this.job;
    if (!this.alive || !job || job.epoch !== this.epoch() || this.watchdog.stopped) return;
    while (this.ledger.available()) {
      const band = job.planner.next(); if (!band) return;
      if (!job.counted) { job.counted = true; this.device.queue.writeBuffer(this.counts, 0, new Uint32Array(8)); }
      const ticket = this.ledger.take({ epoch: job.epoch, generation: job.generation, requestId: job.requestId });
      const batch = ++this.batchSeq;
      const camWords = job.camWords.slice(); new Uint32Array(camWords.buffer).set([band.row0, band.rows, band.col0, band.cols], 20);
      const prof = upload(this.device, this.alloc, profileWords(job.profile, 0, 0, 0), GPUBufferUsage.UNIFORM);
      const camB = upload(this.device, this.alloc, camWords, GPUBufferUsage.UNIFORM);
      const dummy = upload(this.device, this.alloc, new Float32Array(4), GPUBufferUsage.STORAGE);
      const pl = job.pipeline, t = job.targets; t.users++;
      const g0 = this.alloc.bindGroup(this.device.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: prof } }, { binding: 1, resource: { buffer: dummy } }] }));
      const g1 = this.alloc.bindGroup(this.device.createBindGroup({ layout: pl.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: camB } }, { binding: 1, resource: t.depth.createView() }, { binding: 2, resource: t.status.createView() }, { binding: 3, resource: t.normal.createView() }] }));
      const ts = this.timestamps ? this.timestamps.next++ % QUERY_PAIRS : null;
      const enc = this.device.createCommandEncoder();
      const pass = enc.beginComputePass(ts === null ? {} : { timestampWrites: { querySet: this.timestamps.set, beginningOfPassWriteIndex: 2 * ts, endOfPassWriteIndex: 2 * ts + 1 } });
      pass.setPipeline(pl); pass.setBindGroup(0, g0); pass.setBindGroup(1, g1); pass.dispatchWorkgroups(Math.ceil(band.cols / 8), Math.ceil(band.rows / 8)); pass.end();
      if (ts !== null) enc.resolveQuerySet(this.timestamps.set, 2 * ts, 2, this.timestamps.resolve, 16 * ts);
      const row = { requestId: job.requestId, generation: job.generation, epoch: job.epoch, batch, band, submitMs: null, doneMs: null, gpuMs: null, ts };
      const done = this.watchdog.submitted(`band:${batch}`, { requestId: job.requestId, generation: job.generation, epoch: job.epoch });
      this.device.queue.submit([enc.finish()]); this.submits++;
      row.submitMs = performance.now(); this.bands.push(row);
      this.events.mark('submit', { requestId: job.requestId, generation: job.generation, epoch: job.epoch, batch });
      this.device.queue.onSubmittedWorkDone().then(() => {
        done(); prof.destroy(); camB.destroy(); dummy.destroy(); this.drained(t);
        row.doneMs = performance.now();
        this.ledger.release(ticket);                                                      // releases its own credit even if obsolete
        const current = this.alive && this.job === job && job.epoch === this.epoch();
        this.events.mark(current ? 'band-done' : 'stale-band', { requestId: job.requestId, generation: job.generation, batch });
        if (current) {
          job.planner.completed(band, row.doneMs - row.submitMs); this.carry = job.planner.carry();
          if (job.planner.done()) return this.finish(job);
        }
        this.pump();                                                                      // the current generation may progress
      });
    }
  }

  finish(job) {
    if (!this.alive || job.epoch !== this.epoch() || this.job !== job) return;
    const { device } = this, t = job.targets; t.users++;
    const slot = this.ring.find(s => s.owner === null);
    if (slot) slot.owner = job;                                                           // reserved before the copy is encoded
    const dstB = upload(device, this.alloc, new Float32Array([this.canvas.width, this.canvas.height, 0, 0]), GPUBufferUsage.UNIFORM);
    const g = this.alloc.bindGroup(device.createBindGroup({ layout: this.viewport.shade.getBindGroupLayout(0), entries: [{ binding: 0, resource: t.status.createView() }, { binding: 1, resource: t.normal.createView() }, { binding: 2, resource: t.display.createView() }, { binding: 3, resource: { buffer: this.counts } }] }));
    const blitGroup = this.alloc.bindGroup(device.createBindGroup({ layout: this.viewport.blit.getBindGroupLayout(0), entries: [{ binding: 0, resource: t.display.createView() }, { binding: 1, resource: { buffer: dstB } }] }));
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(this.viewport.shade); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(t.W / 8), Math.ceil(t.H / 8)); pass.end();
    if (slot) enc.copyBufferToBuffer(this.counts, 0, slot.buf, 0, 32);
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }] });
    rp.setPipeline(this.viewport.blit); rp.setBindGroup(0, blitGroup); rp.draw(3); rp.end();
    const done = this.watchdog.submitted(`finish:${job.requestId}`, { requestId: job.requestId, generation: job.generation, epoch: job.epoch });
    device.queue.submit([enc.finish()]); this.submits++;
    device.queue.onSubmittedWorkDone().then(() => {
      done(); dstB.destroy(); this.drained(t);
      this.events.mark('complete', { requestId: job.requestId });
      const publish = counts => {
        if (slot && slot.owner === job) slot.owner = null;                                 // only the reservation's owner releases
        if (!this.alive || job.epoch !== this.epoch() || this.job !== job) { this.events.mark('suppressed-publication', { requestId: job.requestId }); return; }
        const e = this.events.mark('publish', { requestId: job.requestId, generation: job.generation, label: job.label, W: job.W, H: job.H, counts });
        for (const h of [...this.handlers]) h({ requestId: job.requestId, generation: job.generation, epoch: job.epoch, label: job.label, W: job.W, H: job.H, counts, publishedMs: e.t });
      };
      if (!slot || !this.alive || job.epoch !== this.epoch()) return publish(null);
      slot.buf.mapAsync(GPUMapMode.READ).then(() => {
        const c = new Uint32Array(slot.buf.getMappedRange().slice(0)); slot.buf.unmap();
        publish({ total: c[0], hit: c[1], miss: c[2], point: c[3], steps: c[4], failure: c[5], normalUnavailable: c[6] });
      }, () => publish(null));
    });
  }

  // Outside measured windows: read the resolved timestamp pairs and attach gpuMs to the most recent band in each slot.
  // Without the feature, band timing remains labelled queue-completion.
  async readTimestamps() {
    if (!this.timestamps || !this.alive) return { method: 'queue-completion', filled: 0 };
    const size = 16 * QUERY_PAIRS;
    const read = this.alloc.buffer(this.device, { size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    try {
      const enc = this.device.createCommandEncoder(); enc.copyBufferToBuffer(this.timestamps.resolve, 0, read, 0, size); this.device.queue.submit([enc.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      const ns = new BigUint64Array(read.getMappedRange().slice(0)); read.unmap();
      let filled = 0;
      for (let slot = 0; slot < QUERY_PAIRS; slot++) {
        const row = [...this.bands].reverse().find(b => b.ts === slot && b.doneMs !== null);
        if (row && ns[2 * slot + 1] >= ns[2 * slot]) { row.gpuMs = Number(ns[2 * slot + 1] - ns[2 * slot]) / 1e6; filled++; }
      }
      return { method: 'timestamp-query', filled };
    } finally { read.destroy(); }
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false; this.handlers.clear();
    if (this.targets) this.retire(this.targets);
    for (const s of this.ring) if (s.owner === null) s.buf.destroy();
    this.counts.destroy(); this.timestamps?.set.destroy(); this.timestamps?.resolve.destroy();
  }
}
```

The renderer records band timing from queue completion. `gpuMs` is filled only when
timestamp queries are granted: `readTimestamps()`, called by T9's drivers outside measured
windows, reads the resolved pairs back for the most recent band in each of the `QUERY_PAIRS`
slots. Without the feature, band timing is labelled `queue-completion`. Either way, the query
buffers are allocated through the session allocator. The query set itself is counted
separately: it has no byte size in the A.8 accounting.

- [ ] **Step 6: Write `browser/drivers/common.js` and `browser/drivers/smoke.js`**

```js
// spikes/project0/browser/drivers/common.js — shared driver helpers. The loss handler and watchdog exist before any submission.
import { acquire, destroy, onLoss } from '../../gpu/device.js';
import { prepareViewport, Renderer } from '../../gpu/renderer.js';
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog } from '../../gpu/watchdog.js';
import * as events from '../events.js';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function session(fixtures, status, { alloc = createAllocator({ capBytes: fixtures.resources.capBytes }) } = {}) {
  const watchdog = createWatchdog(), losses = [];
  const off = onLoss(info => losses.push(info));
  const { device, info, epoch } = await acquire({ requiredFeatures: ['timestamp-query'] });
  const viewport = await prepareViewport(device, alloc, status);
  const canvas = document.getElementById('view');
  const renderer = new Renderer({ device, viewport, canvas, fixtures, events, alloc, watchdog });
  let closed = false;
  return {
    device, info, epoch, viewport, renderer, alloc, watchdog, losses, events,
    close() { if (closed) return; closed = true; off(); watchdog.dispose(); renderer.destroy(); destroy(); alloc.destroyAll(); },
  };
}

export function frameOf(p) { return { requestId: p.requestId, label: p.label, W: p.W, H: p.H, counts: p.counts, t: p.publishedMs }; }

export function renderOnce(renderer, args, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let id = null, off = null;
    const timer = setTimeout(() => { off?.(); reject(new Error(`no publication within ${timeoutMs} ms`)); }, timeoutMs);
    off = renderer.onPublish(p => { if (p.requestId === id) { clearTimeout(timer); off(); resolve(frameOf(p)); } });
    id = renderer.render(args);
  });
}
```

```js
// spikes/project0/browser/drivers/smoke.js — development check of the viewport path (not a gate).
import { session, renderOnce } from './common.js';
export async function run(gate, fixtures, params, status) {
  const s = await session(fixtures, status), out = [];
  try {
    for (const [view, profile] of [['sphere', 'draft'], ['bulb-overview', 'draft'], ['bulb-detail-0.05', 'draft'], ['bulb-stress', 'stress']]) {
      const t0 = performance.now(); const frame = await renderOnce(s.renderer, { view, profile });
      out.push({ view, profile, ms: frame.t - t0, frame, stats: { outstandingMax: s.renderer.stats().outstandingMax, submits: s.renderer.stats().submits } });
    }
    return { slots: [{ slot: 'smoke', raw: { out, losses: s.losses, stall: s.watchdog.stall } }], invalidations: [...s.losses.map(l => `device lost: ${l.reason}`), ...(s.watchdog.stall ? ['no observable progress for 5 s'] : [])] };
  } finally { s.close(); }
}
```

- [ ] **Step 7: Run the Node tests to verify they pass**

Run: `node --test spikes/project0/tests/scheduler.test.mjs spikes/project0/tests/renderer.test.mjs`
Expected: PASS, `# pass 9`, `# fail 0`.

- [ ] **Step 8: Commit** (after Codex's read-only review, before the GPU smoke run)

```bash
git add spikes/project0/gpu/scheduler.js spikes/project0/gpu/view.wgsl spikes/project0/gpu/present.wgsl spikes/project0/gpu/renderer.js spikes/project0/browser/events.js spikes/project0/browser/drivers/common.js spikes/project0/browser/drivers/smoke.js spikes/project0/tests/scheduler.test.mjs spikes/project0/tests/renderer.test.mjs
git commit -m "Project 0 T7: device-session submission ledger, band planner, camera marcher, shade/coverage, blit, lifetime-checked renderer"
```

- [ ] **Step 9: Run the viewport smoke check on the GPU**

Run: `node spikes/project0/run.mjs --gate smoke --mode headed`

Expected:
- an `evidence:` directory; `smoke` is an experiment, so its record has no metrics and no
  invalidation for missing metrics;
- in its raw file, four frames with non-null `counts`, each with `counts.total = W × H`
  (230,400 for 640 × 360 drafts);
- `sphere`: `point + steps + failure` = 0;
- `bulb-stress`: `steps / total` ≥ 0.40;
- `outstandingMax` ≤ 2 for every frame.

Coverage outside A.6 is a finding to investigate against `fixtures.coverage`. **Never edit the
ranges.**

---

### Task T8: The A.8 resource verification (G11) and loss/recovery (G13)

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).

**Files:**
- `spikes/project0/gpu/pattern.wgsl`, the A.8 pattern writers, one entry point per storage format.
- `spikes/project0/gpu/lifecycle.js`, the pure loss and recovery policy.
- `spikes/project0/browser/drivers/resources.js`: `prepareResourceCheck()`,
  `exerciseResources()` and the G11 driver.
- `spikes/project0/browser/drivers/lifecycle.js`, the G13 driver.
- `spikes/project0/measure/resources.mjs` and `spikes/project0/measure/lifecycle.mjs`, which
  recompute the G11 and G13 metrics from raw observations.
- Tests: `spikes/project0/tests/lifecycle.test.mjs` and
  `spikes/project0/tests/resources-metrics.test.mjs`.

**Interfaces:**
- Consumes:
  - T6: `createAllocator`, `createWatchdog`, `upload`;
  - T7: `session`, `renderOnce`, `frameOf`, `Renderer`;
  - T5: `acquire`, `injectLoss`, `onLoss`, `currentEpoch`;
  - T4: `fixtures.resources`, `fixtures.views`, `fixtures.profiles`;
  - T1: `coverageValid`.
- Produces:
  - `prepareResourceCheck(device, alloc) → {pipelines: {[format]: GPUComputePipeline}}`, prepared
    once and reused;
  - `exerciseResources(device, alloc, watchdog, fixtures, prepared, status) → raw`. The raw
    result carries every observation the G11 metrics are recomputed from. The function never
    acquires or destroys the device, and it releases everything it allocated, on failure too;
  - `new Lifecycle({epoch, maxAutomaticRecoveries = 1, windowMs = 60000, now})`, with:
    - `begin(request) → job`;
    - `lost(event) → {action: 'recover' | 'stop' | 'ignore', interrupted}`;
    - `recovered(epoch)`;
    - `accept(job, epoch) → boolean`;
    - `succeed(job)`;
    - `stats()`.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/lifecycle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Lifecycle } from '../gpu/lifecycle.js';

test('a loss of the current epoch interrupts the job and preserves its request exactly', () => {
  let t = 0; const lc = new Lifecycle({ epoch: 7, now: () => t });
  const job = lc.begin({ view: 'bulb-overview', profile: 'settled' });
  const r = lc.lost({ epoch: 7, reason: 'destroyed', injected: false });
  assert.equal(r.action, 'recover'); assert.equal(r.interrupted, job); assert.equal(job.state, 'interrupted');
  assert.deepEqual(job.request, { view: 'bulb-overview', profile: 'settled' });
  assert.equal(lc.accept(job, 7), false); assert.equal(lc.accept(job, 8), false);
  lc.recovered(9);
  assert.equal(lc.accept(lc.begin(job.request), 9), true);
});

test('a loss reported for a different epoch is ignored, not treated as the current device', () => {
  const lc = new Lifecycle({ epoch: 3, now: () => 0 });
  lc.begin({ a: 1 });
  assert.equal(lc.lost({ epoch: 2, reason: 'destroyed' }).action, 'ignore');
});

test('a second loss inside the window stops automatic retry; an interrupted job never succeeds', () => {
  let t = 0; const lc = new Lifecycle({ epoch: 1, now: () => t, windowMs: 60000 });
  const job = lc.begin({ a: 1 }); assert.equal(lc.lost({ epoch: 1, injected: true }).action, 'recover');
  assert.throws(() => lc.succeed(job), /interrupted/);
  lc.recovered(3); t = 1000; lc.begin({ a: 1 });
  assert.equal(lc.lost({ epoch: 3, injected: true }).action, 'stop');
  assert.equal(lc.stats().stopped, true);
  assert.throws(() => lc.begin({ a: 1 }), /stopped/);
});
```

```js
// spikes/project0/tests/resources-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsFor } from '../measure/index.mjs';
const fx = { resources: { tableBytes: 405995520, capBytes: 2 ** 30, entries: [{ kind: 'texture' }, { kind: 'texture' }, { kind: 'texture' }, { kind: 'texture' }, { kind: 'texture' }, { kind: 'texture' }, { kind: 'texture' }, { kind: 'buffer', count: 2, bytes: 7864320 }], readback: { x: [0, 1, 2], y: [0, 1, 2], fullBand: { width: 3840, height: 256, bytesPerRow: 15360 } } },
  views: { 'bulb-overview': {} }, profiles: { settled: { W: 1280, H: 720 } } };
const good = { tableBytes: 405995520, before: { bytes: 100, textures: 0, buffers: 1 }, after: { bytes: 100, textures: 0, buffers: 1 }, peakBytes: 406000000,
  written: Array(7).fill(true), checks: Array.from({ length: 63 }, () => ({ ok: true })), bandOk: true, fullBandBytes: 3932160,
  cancel: { before: 2, after: 0 }, outstandingMax: 2, errors: [] };

test('G11 metrics are recomputed from the raw observations', async () => {
  const m = await metricsFor('G11', '4k', good, fx);
  assert.deepEqual(m, { tableBytes: 405995520, peakBytes: 406000000, texturesWritten: 7, selectedChecks: 63, mismatches: 0, fullBandBytes: 3932160, cancelled: 1, released: 1, outstandingMax: 2 });
  assert.equal((await metricsFor('G11', '4k', { ...good, after: { bytes: 0, textures: 0, buffers: 0 } }, fx)).released, 0);
  assert.equal((await metricsFor('G11', '4k', { ...good, cancel: { before: 2, after: 1 } }, fx)).cancelled, 0);
  assert.equal((await metricsFor('G11', '4k', { ...good, bandOk: false }, fx)).mismatches, 1);
  await assert.rejects(metricsFor('G11', '4k', { ...good, errors: ['allocation cap exceeded'] }, fx), /allocation cap exceeded/);
});

const frame = { requestId: 2, label: 'bulb-overview', W: 1280, H: 720, counts: { total: 921600, hit: 250000, miss: 671600, point: 0, steps: 0, failure: 0 } };
const lifecycleRaw = { request: { view: 'bulb-overview', profile: 'settled' }, preserved: { view: 'bulb-overview', profile: 'settled' }, submittedBeforeLoss: { requestId: 1, generation: 1, epoch: 4 }, loss: { epoch: 4, reason: 'destroyed', injected: false }, decision: 'recover', interrupted: true, publicationsOfLost: 0, latePublications: 0, recovery: { epoch: 6, frame } };

test('G13 metrics require the preserved frozen request and a complete, coverage-valid recovery frame', async () => {
  assert.deepEqual(await metricsFor('G13', 'intentional', lifecycleRaw, fx), { interrupted: 1, successes: 0, requestPreserved: 1, latePublications: 0, validRecovery: 1 });
  const partial = structuredClone(lifecycleRaw); partial.recovery.frame.counts.total = 1000;
  assert.equal((await metricsFor('G13', 'intentional', partial, fx)).validRecovery, 0);
  const noSubmit = structuredClone(lifecycleRaw); noSubmit.submittedBeforeLoss = null;
  await assert.rejects(metricsFor('G13', 'intentional', noSubmit, fx), /submission/);
  assert.deepEqual(await metricsFor('G13', 'repeated', { decision: 'stop', acquisitionsBefore: 3, acquisitionsAfter: 3 }, fx), { automaticRetriesAfterRepeat: 0 });
  assert.deepEqual(await metricsFor('G13', 'repeated', { decision: 'recover', acquisitionsBefore: 3, acquisitionsAfter: 4 }, fx), { automaticRetriesAfterRepeat: 2 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/lifecycle.test.mjs spikes/project0/tests/resources-metrics.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `gpu/lifecycle.js` and `measure/resources.mjs`.

- [ ] **Step 3: Implement `gpu/lifecycle.js`, `measure/resources.mjs` and `measure/lifecycle.mjs`**

```js
// spikes/project0/gpu/lifecycle.js — loss/recovery policy (pure). Its epoch always mirrors the real device epoch.
export class Lifecycle {
  constructor({ epoch, maxAutomaticRecoveries = 1, windowMs = 60000, now = () => performance.now() }) {
    if (!Number.isInteger(epoch)) throw new Error('Lifecycle needs the acquired session epoch');
    Object.assign(this, { epoch, maxAutomaticRecoveries, windowMs, now });
    this.current = null; this.recoveryTimes = [];
    this.s = { interruptions: 0, recoveries: 0, stopped: false };
  }
  begin(request) {
    if (this.s.stopped) throw new Error('automatic recovery stopped after a repeated loss');
    this.current = { request: structuredClone(request), epoch: this.epoch, state: 'running' };
    return this.current;
  }
  lost(event) {
    if (event.epoch !== this.epoch) return { action: 'ignore', interrupted: null };
    const interrupted = this.current?.state === 'running' ? this.current : null;
    if (interrupted) { interrupted.state = 'interrupted'; this.s.interruptions++; }
    const t = this.now(); this.recoveryTimes = this.recoveryTimes.filter(x => t - x < this.windowMs);
    if (this.recoveryTimes.length >= this.maxAutomaticRecoveries) { this.s.stopped = true; return { action: 'stop', interrupted }; }
    this.recoveryTimes.push(t);
    return { action: 'recover', interrupted };
  }
  recovered(epoch) { this.epoch = epoch; this.s.recoveries++; }
  accept(job, epoch) { return job.state === 'running' && job.epoch === this.epoch && epoch === this.epoch; }
  succeed(job) { if (job.state !== 'running') throw new Error(`cannot succeed: job is ${job.state}`); job.state = 'succeeded'; }
  stats() { return { ...this.s }; }
}
```

```js
// spikes/project0/measure/resources.mjs — G11 from raw observations; the page never awards itself a pass.
export function metrics(gate, slot, raw, fx) {
  if (gate !== 'G11' || slot !== '4k') throw new Error(`no metric derivation for ${gate}/${slot}`);
  if (raw.errors?.length) throw new Error(raw.errors.join('; '));
  const R = fx.resources, textures = R.entries.filter(e => e.kind === 'texture').length, selected = R.readback.x.length * R.readback.y.length * textures;
  if (!Array.isArray(raw.written) || raw.written.length !== textures) throw new Error('G11: the write workload is incomplete');
  if (!Array.isArray(raw.checks) || raw.checks.length !== selected) throw new Error(`G11: expected ${selected} selected checks`);
  const same = (a, b) => a.bytes === b.bytes && a.textures === b.textures && a.buffers === b.buffers;
  return {
    tableBytes: raw.tableBytes, peakBytes: raw.peakBytes, texturesWritten: raw.written.filter(Boolean).length, selectedChecks: raw.checks.length,
    mismatches: raw.checks.filter(c => !c.ok).length + (raw.bandOk ? 0 : 1), fullBandBytes: raw.fullBandBytes,
    cancelled: raw.cancel.before === 2 && raw.cancel.after === 0 ? 1 : 0, released: same(raw.before, raw.after) ? 1 : 0, outstandingMax: raw.outstandingMax,
  };
}
```

```js
// spikes/project0/measure/lifecycle.mjs — G13 from raw lifecycle observations.
import { coverageValid } from '../metrics.js';
export function metrics(gate, slot, raw, fx) {
  if (gate !== 'G13') throw new Error(`no metric derivation for ${gate}/${slot}`);
  if (slot === 'repeated') {
    if (!['stop', 'recover', 'ignore'].includes(raw.decision)) throw new Error('G13 repeated: no recorded decision');
    return { automaticRetriesAfterRepeat: (raw.decision === 'stop' ? 0 : 1) + Math.max(0, raw.acquisitionsAfter - raw.acquisitionsBefore) };
  }
  if (!['intentional', 'injected'].includes(slot)) throw new Error(`no metric derivation for G13/${slot}`);
  if (!raw.submittedBeforeLoss) throw new Error('G13: the loss was not preceded by an observed submission of the request');
  const p = fx.profiles[raw.request.profile], f = raw.recovery?.frame;
  const complete = f && f.counts && f.W === p.W && f.H === p.H && f.counts.total === p.W * p.H && coverageValid(f.label, f.counts);
  return {
    interrupted: raw.interrupted ? 1 : 0, successes: raw.publicationsOfLost, requestPreserved: JSON.stringify(raw.preserved) === JSON.stringify(raw.request) ? 1 : 0,
    latePublications: raw.latePublications, validRecovery: raw.decision === 'recover' && complete && raw.recovery.epoch > raw.loss.epoch ? 1 : 0,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command again.
Expected: PASS, `# pass 5`, `# fail 0`.

- [ ] **Step 5: Write `gpu/pattern.wgsl`**

```wgsl
// spikes/project0/gpu/pattern.wgsl — A.8 verification pattern k = (13x + 17y + r) mod 251.
// One format per binding: each format has its own variable and entry point; their resource interfaces are disjoint.
struct P { r: u32, row0: u32, rows: u32, width: u32 }
@group(0) @binding(0) var<uniform> p: P;
fn k(x: u32, y: u32) -> u32 { return (13u * x + 17u * y + p.r) % 251u; }
fn inside(id: vec3u) -> bool { return id.x < p.width && id.y < p.rows; }

@group(0) @binding(1) var t_r32float: texture_storage_2d<r32float, write>;
@compute @workgroup_size(16, 16) fn write_r32float(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_r32float, vec2u(id.x, y), vec4f(f32(k(id.x, y)) + 0.25)); }

@group(0) @binding(1) var t_rgba16float: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(16, 16) fn write_rgba16float(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_rgba16float, vec2u(id.x, y), vec4f(f32(k(id.x, y)) + 0.25)); }

@group(0) @binding(1) var t_r32uint: texture_storage_2d<r32uint, write>;
@compute @workgroup_size(16, 16) fn write_r32uint(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_r32uint, vec2u(id.x, y), vec4u(k(id.x, y))); }

@group(0) @binding(1) var t_rgba32float: texture_storage_2d<rgba32float, write>;
@compute @workgroup_size(16, 16) fn write_rgba32float(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_rgba32float, vec2u(id.x, y), vec4f(f32(k(id.x, y)) + 0.25)); }

@group(0) @binding(1) var t_rgba8unorm: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(16, 16) fn write_rgba8unorm(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; } let y = p.row0 + id.y; textureStore(t_rgba8unorm, vec2u(id.x, y), vec4f(f32(k(id.x, y)) / 255.0)); }
```

- [ ] **Step 6: Write `browser/drivers/resources.js`**

```js
// spikes/project0/browser/drivers/resources.js — the A.8 exercise (shared with G12) and the G11 driver. Raw observations only.
import { source, compile, upload } from '../../gpu/webgpu.js';
import { session } from './common.js';

const FORMATS = ['r32float', 'rgba16float', 'r32uint', 'rgba32float', 'rgba8unorm'];
const f16 = h => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15); };

export async function prepareResourceCheck(device, alloc) {
  const module = await compile(device, await source('./pattern.wgsl'), 'pattern');
  const pipelines = {};
  for (const f of FORMATS) pipelines[f] = alloc.pipeline(await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: `write_${f}` } }));
  return { pipelines };
}

export async function exerciseResources(device, alloc, watchdog, fx, prepared, status = () => {}) {
  const R = fx.resources, S = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC;
  const raw = { tableBytes: R.tableBytes, before: alloc.inventory(), errors: [], written: [], checks: [], bandOk: false, fullBandBytes: R.readback.fullBand.width * 4 * R.readback.fullBand.height, cancel: { before: 0, after: 0 }, outstandingMax: 0 };
  const owned = []; let outstanding = [];
  const submit = async (enc, meta) => {
    while (outstanding.length >= 2) await outstanding.shift();
    const done = watchdog.submitted(`g11:${meta}`, { meta });
    device.queue.submit([enc.finish()]);
    const p = device.queue.onSubmittedWorkDone().then(done); outstanding.push(p);
    raw.outstandingMax = Math.max(raw.outstandingMax, outstanding.length);
  };
  const writeRows = (tex, format, r, row0, rows) => {
    const u = upload(device, alloc, new Uint32Array([r, row0, rows, R.width]), GPUBufferUsage.UNIFORM); owned.push(u);
    const pl = prepared.pipelines[format];
    const bind = alloc.bindGroup(device.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: tex.createView() }] }));
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(pl); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(R.width / 16), Math.ceil(rows / 16)); pass.end();
    return enc;
  };
  try {
    const textures = R.entries.filter(e => e.kind === 'texture');
    const staging = R.entries.filter(e => e.kind === 'buffer').flatMap(e => Array.from({ length: e.count }, () => { const b = alloc.buffer(device, { size: e.bytesEach, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }); owned.push(b); return b; }));
    const made = textures.map((e, r) => { const tex = alloc.texture(device, { size: [R.width, R.height], format: e.format, usage: S }); owned.push(tex); return { e, r, tex }; });
    status('G11: writing pattern');
    for (const { e, r, tex } of made) {
      for (let row0 = 0; row0 < R.height; row0 += 256) await submit(writeRows(tex, e.format, r, row0, Math.min(256, R.height - row0)), `${e.name}:${row0}`);
      raw.written.push(true);
    }
    await Promise.all(outstanding); outstanding = [];
    status('G11: verifying');
    const [stage, band] = staging;
    for (const { e, r, tex } of made) {
      const enc = device.createCommandEncoder(); let slot = 0;
      for (const y of R.readback.y) for (const x of R.readback.x) enc.copyTextureToBuffer({ texture: tex, origin: [x, y] }, { buffer: stage, offset: 256 * slot++ }, [1, 1]);
      await submit(enc, `readback:${e.name}`); await Promise.all(outstanding); outstanding = [];
      await stage.mapAsync(GPUMapMode.READ, 0, 256 * 9); const bytes = stage.getMappedRange(0, 256 * 9).slice(0); stage.unmap();
      slot = 0;
      for (const y of R.readback.y) for (const x of R.readback.x) {
        const k = (13 * x + 17 * y + r) % 251, at = 256 * slot++;
        const ok = e.format === 'r32uint' ? new Uint32Array(bytes, at, 1)[0] === k
          : e.format === 'rgba8unorm' ? new Uint8Array(bytes, at, 4).every(v => v === k)
          : e.format === 'rgba16float' ? [...new Uint16Array(bytes, at, 4)].every(h => f16(h) === k + 0.25)
          : [...new Float32Array(bytes, at, e.format === 'r32float' ? 1 : 4)].every(v => v === k + 0.25);
        raw.checks.push({ texture: e.name, x, y, ok });
      }
    }
    const display = made.find(m => m.e.name === 'display');
    { const enc = device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: display.tex }, { buffer: band, bytesPerRow: R.readback.fullBand.bytesPerRow }, [R.readback.fullBand.width, R.readback.fullBand.height]);
      await submit(enc, 'band'); await Promise.all(outstanding); outstanding = [];
      await band.mapAsync(GPUMapMode.READ); const full = new Uint8Array(band.getMappedRange().slice(0)); band.unmap();
      raw.bandOk = true;
      for (let y = 0; y < R.readback.fullBand.height && raw.bandOk; y++) for (let x = 0; x < R.width; x++) if (full[4 * (y * R.width + x)] !== (13 * x + 17 * y + display.r) % 251) { raw.bandOk = false; break; } }
    // Cancellation after verification: a 16-batch rewrite is cancelled once two have been submitted. None may follow.
    let cancel = false;
    for (let i = 0; i < 16; i++) {
      if (cancel) break;
      await submit(writeRows(made[0].tex, made[0].e.format, made[0].r, (i * 128) % R.height, 128), `cancel:${i}`);
      if (cancel) raw.cancel.after++; else raw.cancel.before++;
      if (raw.cancel.before === 2) cancel = true;
    }
    await Promise.all(outstanding); outstanding = [];
    raw.peakBytes = alloc.inventory().peakBytes;
  } catch (error) { raw.errors.push(error.message); }
  finally {
    await Promise.allSettled(outstanding);
    for (const r of owned) r.destroy();
    raw.after = alloc.inventory();
    if (watchdog.stall) raw.errors.push(`no observable progress for 5 s: ${JSON.stringify(watchdog.stall.outstanding)}`);
  }
  return raw;
}

export async function run(gate, fx, params, status) {
  const s = await session(fx, status);
  try {
    const prepared = await prepareResourceCheck(s.device, s.alloc);
    const raw = await exerciseResources(s.device, s.alloc, s.watchdog, fx, prepared, status);
    return { slots: [{ slot: '4k', raw }], invalidations: s.losses.map(l => `device lost: ${l.reason}`) };
  } finally { s.close(); }
}
```

The allocator refuses any allocation that would exceed `capBytes` *before* it is made. The
refusal is recorded in `raw.errors`, which makes the record invalid. T10 treats
`allocation cap exceeded` as a spec §7 abort.

- [ ] **Step 7: Write the G13 driver, `browser/drivers/lifecycle.js`**

```js
// spikes/project0/browser/drivers/lifecycle.js — G13. Real loss events are delivered unchanged; injection happens only
// after the exact request has been observed submitted; recovery happens only on action 'recover'.
import { injectLoss, onLoss } from '../../gpu/device.js';
import { Lifecycle } from '../../gpu/lifecycle.js';
import { session, frameOf, sleep } from './common.js';

const REQUEST = Object.freeze({ view: 'bulb-overview', profile: 'settled' });    // a frozen view/profile pairing (A.6)

async function waitFor(pred, ms, what) { const t0 = performance.now(); while (!pred()) { if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(1); } }

export async function run(gate, fx, params, status) {
  const slots = []; let acquisitions = 0;
  const open = async () => { acquisitions++; return session(fx, status); };
  for (const type of ['intentional', 'injected']) {
    let s = await open();
    const lc = new Lifecycle({ epoch: s.epoch });
    let loss = null, decision = null;
    const off = onLoss(event => { loss = event; decision = lc.lost(event); });     // the original event, unchanged
    const raw = { request: REQUEST, preserved: null, submittedBeforeLoss: null, loss: null, decision: null, interrupted: false, publicationsOfLost: 0, latePublications: 0, recovery: null };
    try {
      const job = lc.begin(REQUEST);
      const lostId = s.renderer.render(REQUEST);
      const offPub = s.renderer.onPublish(p => { if (p.requestId === lostId) { if (lc.accept(job, p.epoch)) raw.publicationsOfLost++; else raw.latePublications++; } });
      await waitFor(() => s.events.list().some(e => e.type === 'submit' && e.requestId === lostId && e.epoch === s.epoch), 10000, 'the request\'s first submission');
      raw.submittedBeforeLoss = s.events.list().find(e => e.type === 'submit' && e.requestId === lostId);
      if (type === 'intentional') s.device.destroy();                              // the browser delivers device.lost (reason 'destroyed')
      else injectLoss();
      await waitFor(() => decision !== null, 10000, 'the loss notification');
      raw.loss = loss; raw.decision = decision.action; raw.interrupted = decision.interrupted === job && job.state === 'interrupted';
      raw.preserved = job.request;
      await s.device.queue.onSubmittedWorkDone().catch(() => {});                  // drain: any late completion arrives against a retired epoch
      offPub(); s.close();
      if (decision.action === 'recover') {
        s = await open(); lc.recovered(s.epoch);
        const again = lc.begin(job.request);
        const frame = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('recovery render did not publish within 30 s')), 30000);
          let id = null; const offR = s.renderer.onPublish(p => { if (p.requestId === id) { clearTimeout(timer); offR(); resolve(frameOf(p)); } });
          id = s.renderer.render(again.request);
        });
        raw.recovery = { epoch: s.epoch, frame };
      }
      slots.push({ slot: type, raw });
      if (type === 'injected' && decision.action === 'recover') {
        // Repeated loss inside the window: the policy must say stop, and no reacquisition may follow.
        const before = acquisitions; decision = null;
        lc.begin(REQUEST);
        injectLoss();
        await waitFor(() => decision !== null, 10000, 'the repeated loss notification');
        const repeated = decision.action;
        if (repeated === 'recover') { s.close(); s = await open(); }             // what a broken policy would do — counted, not hidden
        await sleep(200);
        slots.push({ slot: 'repeated', raw: { decision: repeated, acquisitionsBefore: before, acquisitionsAfter: acquisitions } });
      }
    } catch (error) {
      slots.push({ slot: type, raw: { ...raw, error: error.message } });
    } finally { off(); s.close(); }
  }
  return { slots, invalidations: [] };
}
```

`measure/lifecycle.mjs` recomputes every G13 metric from these raw observations. It requires
the observed pre-loss submission, the preserved frozen request, the `recover` decision, a
recovery epoch later than the lost one, and a recovery frame with `counts.total = W × H` that
passes `coverageValid`. A slot carrying `error` has no recovery and therefore cannot pass.

- [ ] **Step 8: Commit** (after Codex's read-only review, before the GPU runs)

```bash
git add spikes/project0/gpu/pattern.wgsl spikes/project0/gpu/lifecycle.js spikes/project0/browser/drivers/resources.js spikes/project0/browser/drivers/lifecycle.js spikes/project0/measure/resources.mjs spikes/project0/measure/lifecycle.mjs spikes/project0/tests/lifecycle.test.mjs spikes/project0/tests/resources-metrics.test.mjs
git commit -m "Project 0 T8: A.8 resource verification with cap-checked allocation (G11), loss and recovery on real epochs (G13)"
```

- [ ] **Step 9: Run G11 and G13 on the GPU**

Run:
- `node spikes/project0/run.mjs --gate G11 --mode headed`
- `node spikes/project0/run.mjs --gate G13 --mode headed`

Expected:
- **G11:** `tableBytes 405995520`, `peakBytes` at least that and ≤ 1073741824,
  `texturesWritten 7`, `selectedChecks 63`, `mismatches 0`, `cancelled 1`, `released 1`.
- **G13:** for both `intentional` and `injected`, `interrupted 1`, `successes 0`,
  `requestPreserved 1`, `latePublications 0`, `validRecovery 1`. For `repeated`,
  `automaticRetriesAfterRepeat 0`.

A deviation or an invalidation is a finding to diagnose, never a threshold to edit.

---

### Task T9: In-page timing and workload drivers (G1, G2, G6–G10, G12), visible-output evidence and their metric derivation

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).

**Files:**
- `spikes/project0/browser/paths.js`: motion poses and the burst schedule, computed from
  `fixtures.motion`, `fixtures.bursts` and `fixtures.anchor`. This is an independent
  implementation, cross-checked against `reference/camera.js` in Node.
- `spikes/project0/browser/integrity.js`: an integrity observer that covers the whole measured
  interval, the long-task observer, and the refresh-rate estimate.
- `spikes/project0/browser/drivers/g1.js`, `g2.js`, `timing.js` (G6, G7 and G9), `g8.js`,
  `g10.js`, `g12.js` and `visible.js`.
- `spikes/project0/measure/timing.mjs`: G1, G2, G6–G10 and G12 metrics recomputed from raw
  events.
- Tests: `spikes/project0/tests/timing.test.mjs` and `spikes/project0/tests/g1.test.mjs`.

**Interfaces:**
- Consumes:
  - T7: `session`, `renderOnce`, `frameOf`, `sleep`, `events`, `Renderer.stats()`,
    `Renderer.readTimestamps()`;
  - T8: `prepareResourceCheck`, `exerciseResources`;
  - T6: `prepare`, `arith` (from `checks.js`), `packRows`;
  - T1: `throughput`, `percentile`, `coverageValid`;
  - T4: `fixtures.{motion, bursts, anchor, views, profiles, stability, display}`.
- Produces:
  - `posesAt(fixtures, view, seconds) → {origin, target}` and
    `burstSchedule(fixtures) → [{id, burst, index, offsetMs, camera}]`;
  - `observeIntegrity(canvas, {allowedBacking}) → {stop() → {events, violations}}`;
  - `observeLongTasks() → {take(startMs, endMs) → [{ms, kind}]}`;
  - `refreshHz() → Promise<number>`;
  - `g1Metrics({adapterInfo, chromeGpuText, probeOk}) → {metrics, invalidations}`.
  - `measure/timing.mjs` `metrics()` for the slots:
    - `G1/{headed, headless}`;
    - `G2/{fresh-0…2, warm}`;
    - `G6/<view>/<trial>`;
    - `G7/<trial>`;
    - `G8/<rep>`;
    - `G9/warmed`;
    - `G10/<view>`;
    - `G12/sequence`.

    Each returns exactly the `gatePlan` keys. A raw integrity violation, or any malformed
    shape, throws with `invalidation: true`. `run.mjs` records the reason as an invalidation.

**Measurement discipline:**
- **One clock:** every timestamp comes from the page clock.
- **No Node calls in a window:** Node makes no `evaluate()` calls inside a measured window.
  Drivers run their whole schedule and return one result. G12 exposes bounded checkpoints
  between cycles.
- **Continuous integrity:** observation covers each measured interval in full. That includes
  visibility, focus, DPR and the backing size. G12's intentional resizes are allowed by its
  frozen backing list; any other change invalidates the affected trial.
- **Complete frames:** Node requires `counts.total === W × H` at the profile's dimensions before
  applying coverage thresholds.
- **Subscriptions:** every temporary `onPublish` subscription is removed in a `finally`.
- **Request time:** this comes from the renderer's `request` event, recorded at function entry.
  Timer lateness is recorded *before* `render()` is called. It is reported as application
  evidence and is not automatically an interference invalidation.
- **Diagnostics outside windows:** after every trial the driver calls
  `renderer.readTimestamps()` and records the band `gpuMs` (timestamp query) or `submit → done`
  (`queue-completion`). It also records the p99 and maximum band duration, with a warning above
  30 ms. This is a diagnostic, not a gate.

- [ ] **Step 1: Write the failing Node tests**

```js
// spikes/project0/tests/timing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posesAt, burstSchedule } from '../browser/paths.js';
import { pose, burstRequests } from '../reference/camera.js';
import { metricsFor } from '../measure/index.mjs';

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-12);

test('harness paths agree with the independent reference poses at every preparation phase', () => {
  for (const view of ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005', 'bulb-stress', 'sphere'])
    for (const s of [...fixtures.motion.preparationPhases, 0.123, 29.999]) {
      const a = posesAt(fixtures, view, s), b = pose(view, s, fixtures.anchor);
      assert.ok(close(a.origin, b.origin) && close(a.target, b.target), `${view} @ ${s}s`);
    }
  const mine = burstSchedule(fixtures), ref = burstRequests();
  assert.equal(mine.length, 400);
  mine.forEach((r, i) => { assert.equal(r.offsetMs, ref[i].offsetMs); assert.ok(close(r.camera.origin, ref[i].camera.origin)); });
});

const draft = fixtures.profiles.draft, px = draft.W * draft.H;
const frame = (requestId, t, label = 'bulb-overview', total = px) => ({ requestId, t, label, W: draft.W, H: draft.H, counts: { total, hit: Math.round(total * 0.28), miss: total - Math.round(total * 0.28), point: 0, steps: 0, failure: 0 } });

test('G6: completion-driven publications in the 30 s window; incomplete frames are coverage errors', async () => {
  const frames = Array.from({ length: 950 }, (_, i) => frame(i + 1, 1000 + i * 31.5));
  frames[10] = frame(11, frames[10].t, 'bulb-overview', px - 1);                 // an internally consistent partial image
  const m = await metricsFor('G6', 'bulb-overview/0', { windowStart: 1000, frames, pendingMax: 1, outstandingMax: 2, integrity: { violations: [] } }, fixtures);
  assert.deepEqual(Object.keys(m).sort(), ['coverageErrors', 'intervalP95', 'outstandingMax', 'pendingMax', 'published', 'windowMs']);
  assert.equal(m.published, 950);                                                 // last frame at 1000 + 949*31.5 = 30893.5 < 31000
  assert.equal(m.coverageErrors, 1);
  await assert.rejects(metricsFor('G6', 'bulb-overview/0', { windowStart: 1000, frames, pendingMax: 1, outstandingMax: 2, integrity: { violations: ['window blurred at 12000'] } }, fixtures), /blurred/);
});

test('G7: latency from each final request\'s own request event; all 400 issued requests are kept', async () => {
  const issued = Array.from({ length: 400 }, (_, id) => ({ id, burst: Math.floor(id / 20), index: id % 20, requestId: id + 1, requestedMs: 1000 + id * 10, lateByMs: 0.5 }));
  const frames = issued.filter(r => r.index === 19).map((r, b) => frame(r.requestId, r.requestedMs + 40 + b));   // latencies 40..59
  const m = await metricsFor('G7', '0', { issued, frames, outstandingMax: 2, integrity: { violations: [] } }, fixtures);
  assert.equal(m.requests, 400); assert.equal(m.finals, 20);
  assert.equal(m.latencyP95, 58);                                                 // nearest rank: ceil(0.95 * 20) = 19th of 40..59
  await assert.rejects(metricsFor('G7', '0', { issued, frames: frames.slice(1), outstandingMax: 2, integrity: { violations: [] } }, fixtures), /never published/);
});

test('G9 classifies long tasks; unattributed ones are counted separately', async () => {
  const m = await metricsFor('G9', 'warmed', { windows: 12, longTasks: [{ ms: 60, kind: 'application' }, { ms: 51, kind: 'harness' }, { ms: 40, kind: 'application' }, { ms: 70, kind: 'unattributed' }] }, fixtures);
  assert.deepEqual(m, { windows: 12, applicationOver50: 1, unattributedOver50: 1, harnessRecorded: 1 });
});

test('G8: stressSubmitted comes from the exact stress submission event, never a constant', async () => {
  const sphere = frame(2, 1200, 'sphere');
  const ok = { stressRequestId: 1, stressSubmit: { requestId: 1, t: 1000 }, sphereRequested: 1050, sphere, stalePublications: 0, outstandingMax: 2, integrity: { violations: [] } };
  assert.equal((await metricsFor('G8', '0', ok, fixtures)).stressSubmitted, 1);
  assert.equal((await metricsFor('G8', '0', ok, fixtures)).latencyMs, 150);
  assert.equal((await metricsFor('G8', '0', { ...ok, stressSubmit: null }, fixtures)).stressSubmitted, 0);
});
```

```js
// spikes/project0/tests/g1.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { g1Metrics } from '../measure/timing.mjs';

const gpuText = ['Graphics Feature Status', 'WebGPU: Hardware accelerated', 'GPU0\tVENDOR= 0x10de, DEVICE=0x26b1 *ACTIVE*',
  'Driver vendor\tNVIDIA', 'Driver version\t580.173.02'].join('\n');
const nvidia = { vendor: 'nvidia', architecture: 'lovelace', device: '0x26b1', description: 'NVIDIA RTX 6000 Ada Generation', isFallbackAdapter: false, fallbackSource: 'adapter.info.isFallbackAdapter' };

test('an NVIDIA adapter, same-session hardware-accelerated WebGPU and a matching active device corroborate', () => {
  assert.deepEqual(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText, probeOk: true }), { metrics: { nvidia: 1, software: 0, corroborated: 1 }, invalidations: [] });
});
test('a software adapter is software even when an NVIDIA device is listed elsewhere', () => {
  const r = g1Metrics({ adapterInfo: { ...nvidia, vendor: 'google', description: 'SwiftShader Device (Subzero)', isFallbackAdapter: true }, chromeGpuText: gpuText, probeOk: true });
  assert.equal(r.metrics.software, 1); assert.equal(r.metrics.nvidia, 0);
});
test('missing or contradictory evidence invalidates', () => {
  assert.ok(g1Metrics({ adapterInfo: { ...nvidia, vendor: '', description: '' }, chromeGpuText: gpuText, probeOk: true }).invalidations.length > 0);
  assert.equal(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText.replace('Hardware accelerated', 'Software only'), probeOk: true }).metrics.corroborated, 0);
  assert.ok(g1Metrics({ adapterInfo: { ...nvidia, device: '0x2684' }, chromeGpuText: gpuText, probeOk: true }).invalidations.some(r => /contradict/.test(r)));
  assert.ok(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText, probeOk: false }).invalidations.some(r => /probe/.test(r)));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/timing.test.mjs spikes/project0/tests/g1.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `browser/paths.js` and `measure/timing.mjs`.

- [ ] **Step 3: Implement `browser/paths.js` and `measure/timing.mjs`**

```js
// spikes/project0/browser/paths.js — A.7 motion from fixture parameters, written from the spec (not from reference/camera.js).
const rz = (v, a) => [Math.cos(a) * v[0] - Math.sin(a) * v[1], Math.sin(a) * v[0] + Math.cos(a) * v[1], v[2]];
export function posesAt(fx, view, s) {
  const { overview, detail } = fx.motion;
  if (view === 'sphere') return { origin: [1.92, -1.44, 0.7], target: [0, 0, 0] };
  if (view === 'bulb-overview') {
    if (s === 0) return { origin: [1.92, -1.44, 0.7], target: [0, 0, 0] };
    const th = overview.initialAngle + 2 * Math.PI * s / overview.periodSeconds;
    return { origin: [overview.radius * Math.cos(th), overview.radius * Math.sin(th), overview.height], target: [0, 0, 0] };
  }
  const d = { 'bulb-detail-0.05': 0.05, 'bulb-detail-0.005': 0.005, 'bulb-stress': 0.005 }[view];
  if (d === undefined) throw new Error(`unknown view ${view}`);
  const { A, D } = fx.anchor;
  const beta = view === 'bulb-stress' ? 0 : detail.amplitudeRadians * Math.sin(2 * Math.PI * s / detail.periodSeconds);
  const v = rz([-d * D[0], -d * D[1], -d * D[2]], beta);
  return { origin: [A[0] + v[0], A[1] + v[1], A[2] + v[2]], target: [...A] };
}
export function burstSchedule(fx) {
  const b = fx.bursts, { overview } = fx.motion, out = [];
  for (let burst = 0; burst < b.burstCount; burst++) for (let index = 0; index < b.requestsPerBurst; index++) {
    const id = burst * b.requestsPerBurst + index, th = overview.initialAngle + (id + 1) * Math.PI / 180;
    out.push({ id, burst, index, offsetMs: burst * ((b.requestsPerBurst - 1) * b.spacingMs + b.quietMs) + index * b.spacingMs,
      camera: { origin: [overview.radius * Math.cos(th), overview.radius * Math.sin(th), overview.height], target: [0, 0, 0] } });
  }
  return out;
}
```

```js
// spikes/project0/measure/timing.mjs — G1, G2, G6–G10, G12 from raw page events. Shape errors and integrity violations invalidate.
import { throughput, percentile, coverageValid } from '../metrics.js';

const invalid = message => Object.assign(new Error(message), { invalidation: true });
function integrityOk(raw) { if (!raw.integrity || !Array.isArray(raw.integrity.violations)) throw invalid('no integrity observation'); if (raw.integrity.violations.length) throw invalid(raw.integrity.violations.join('; ')); }
function frameOk(f, profile) { return Boolean(f && f.counts && f.W === profile.W && f.H === profile.H && f.counts.total === profile.W * profile.H && coverageValid(f.label, f.counts)); }

export function g1Metrics({ adapterInfo: a, chromeGpuText: text, probeOk }) {
  const invalidations = [];
  if (!a || (!a.vendor && !a.description)) invalidations.push('adapter.info is redacted or empty');
  const desc = `${a?.vendor ?? ''} ${a?.architecture ?? ''} ${a?.description ?? ''}`;
  const software = a?.isFallbackAdapter === true || /swiftshader|llvmpipe|lavapipe|software/i.test(desc) ? 1 : 0;
  const nvidia = !software && /nvidia/i.test(desc) ? 1 : 0;
  const webgpuRow = /^WebGPU:\s*(.+)$/m.exec(text ?? '')?.[1]?.trim();
  if (!webgpuRow) invalidations.push('chrome://gpu has no WebGPU feature-status row');
  const active = /VENDOR\s*=\s*0x([0-9a-f]+),\s*DEVICE\s*=\s*0x([0-9a-f]+)[^\n]*\*ACTIVE\*/i.exec(text ?? '');
  if (!active) invalidations.push('chrome://gpu identifies no active GPU');
  const driver = /Driver vendor\s+(.+)/.test(text ?? '') && /Driver version\s+(.+)/.test(text ?? '');
  if (!driver) invalidations.push('chrome://gpu has no driver information');
  if (active && /^0x[0-9a-f]+$/i.test(a?.device || '') && parseInt(a.device, 16) !== parseInt(active[2], 16)) invalidations.push(`adapter device ${a.device} contradicts the active GPU 0x${active[2]}`);
  if (!probeOk) invalidations.push('probe dispatch did not complete on the selected adapter');
  const corroborated = nvidia && webgpuRow === 'Hardware accelerated' && active && active[1].toLowerCase() === '10de' && driver && probeOk && invalidations.length === 0 ? 1 : 0;
  return { metrics: { nvidia, software, corroborated }, invalidations };
}

export function metrics(gate, slot, raw, fx) {
  const draft = fx.profiles.draft, settled = fx.profiles.settled;
  const coverageErrors = (frames, profile) => frames.filter(f => !frameOk(f, profile)).length;
  if (raw?.error) throw invalid(`driver error: ${raw.error}`);
  switch (gate) {
    case 'G1': { const { metrics: m, invalidations } = g1Metrics(raw); if (invalidations.length) throw invalid(invalidations.join('; ')); return m; }
    case 'G2': {
      integrityOk(raw);
      const prep = raw.statusLog.find(e => e.text.startsWith('preparing'));
      return { navigationMs: raw.navigationMs, ...(slot === 'warm' ? {} : { emptyProfile: raw.emptyProfile, freshProcess: raw.freshProcess }),
        preparationVisible: prep && prep.visible && prep.t < raw.navigationMs ? 1 : 0, coverageErrors: coverageErrors([raw.frame], draft), outstandingMax: raw.outstandingMax };
    }
    case 'G6': {
      integrityOk(raw);
      const t = throughput(raw.frames.map(f => ({ id: f.requestId, time: f.t })), raw.windowStart, raw.windowStart + 30000);
      const inWindow = raw.frames.filter(f => f.t >= raw.windowStart && f.t < raw.windowStart + 30000);
      return { ...t, pendingMax: raw.pendingMax, coverageErrors: coverageErrors(inWindow, draft), outstandingMax: raw.outstandingMax };
    }
    case 'G7': {
      integrityOk(raw);
      if (!Array.isArray(raw.issued) || raw.issued.length !== fx.bursts.burstCount * fx.bursts.requestsPerBurst) throw invalid(`G7 expects ${fx.bursts.burstCount * fx.bursts.requestsPerBurst} issued requests`);
      const finals = raw.issued.filter(r => r.index === fx.bursts.requestsPerBurst - 1);
      const latencies = finals.map((r, i) => {
        const f = raw.frames.find(x => x.requestId === r.requestId);
        if (!f) throw new Error(`final request ${i} was never published`);
        return f.t - r.requestedMs;
      });
      return { requests: raw.issued.length, finals: finals.length, latencyP95: percentile(latencies, 0.95), coverageErrors: coverageErrors(raw.frames, draft), outstandingMax: raw.outstandingMax };
    }
    case 'G8': {
      integrityOk(raw);
      const submitted = raw.stressSubmit && raw.stressSubmit.requestId === raw.stressRequestId && raw.stressSubmit.t <= raw.sphereRequested ? 1 : 0;
      return { stressSubmitted: submitted, latencyMs: raw.sphere ? raw.sphere.t - raw.sphereRequested : Number.MAX_VALUE,
        stalePublications: raw.stalePublications, coverageErrors: raw.sphere ? coverageErrors([raw.sphere], draft) : 1, outstandingMax: raw.outstandingMax };
    }
    case 'G9': {
      const over = kind => raw.longTasks.filter(t => t.kind === kind && t.ms > 50).length;
      return { windows: raw.windows, applicationOver50: over('application'), unattributedOver50: over('unattributed'), harnessRecorded: 1 };
    }
    case 'G10': {
      integrityOk(raw);
      if (!raw.frame) throw new Error(`${slot}: settled frame never published`);
      return { elapsedMs: raw.frame.t - raw.requestedMs, prepared: raw.prepared, coverageErrors: coverageErrors([raw.frame], settled), outstandingMax: raw.outstandingMax };
    }
    case 'G12': {
      integrityOk(raw);
      const failures = raw.maintenance.flatMap(m => m.errors);
      if (failures.length) throw invalid(`resource verification inside G12: ${failures.join('; ')}`);
      const counts = ['textures', 'buffers'].reduce((n, k) => n + Math.abs(raw.final[k] - raw.baseline[k]), 0);
      return { cycles: raw.cycles, wallMs: raw.wallMs, deadlineMisses: raw.deadlineMisses, unhandled: raw.unhandled, unplannedLosses: raw.unplannedLosses,
        countDifferences: counts, byteRelativeDifference: Math.abs(raw.final.bytes - raw.baseline.bytes) / raw.baseline.bytes,
        baselinePrepared: raw.baselinePrepared, returned1280: raw.returned1280, outstandingMax: raw.outstandingMax };
    }
    default: throw new Error(`no metric derivation for ${gate}/${slot}`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command again.
Expected: PASS, `# pass 8`, `# fail 0`.

The paths test reads the frozen `fixtures.json`. A disagreement with `reference/camera.js` is
a harness bug: fix `paths.js`, never the reference or the fixture.

- [ ] **Step 5: Write `browser/integrity.js`**

```js
// spikes/project0/browser/integrity.js — integrity across the whole measured interval, long tasks, refresh rate.
export function observeIntegrity(canvas, { allowedBacking = [[1280, 720]] } = {}) {
  const events = [], violations = [];
  const t = () => performance.now();
  if (document.visibilityState !== 'visible') violations.push(`hidden at start (${document.visibilityState})`);
  if (!document.hasFocus()) violations.push('unfocused at start');
  if (devicePixelRatio !== 1) violations.push(`devicePixelRatio ${devicePixelRatio}`);
  const onVis = () => { events.push({ t: t(), type: 'visibility', value: document.visibilityState }); if (document.visibilityState !== 'visible') violations.push(`hidden at ${t().toFixed(0)}`); };
  const onBlur = () => { events.push({ t: t(), type: 'blur' }); violations.push(`window blurred at ${t().toFixed(0)}`); };
  const onFocus = () => events.push({ t: t(), type: 'focus' });
  const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  const onDpr = () => { events.push({ t: t(), type: 'dpr', value: devicePixelRatio }); violations.push(`devicePixelRatio changed to ${devicePixelRatio}`); };
  document.addEventListener('visibilitychange', onVis); addEventListener('blur', onBlur); addEventListener('focus', onFocus); mq.addEventListener('change', onDpr);
  let running = true, last = `${canvas.width}x${canvas.height}`;
  const allowed = new Set(allowedBacking.map(([w, h]) => `${w}x${h}`));
  const tick = () => {
    if (!running) return;
    const now = `${canvas.width}x${canvas.height}`;
    if (now !== last) { events.push({ t: t(), type: 'backing', value: now }); last = now; }
    if (!allowed.has(now) && !violations.some(v => v.startsWith(`unexpected backing ${now}`))) violations.push(`unexpected backing ${now}`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { stop() { running = false; document.removeEventListener('visibilitychange', onVis); removeEventListener('blur', onBlur); removeEventListener('focus', onFocus); mq.removeEventListener('change', onDpr); return { events, violations }; } };
}

export function observeLongTasks() {
  const tasks = []; new PerformanceObserver(list => tasks.push(...list.getEntries())).observe({ type: 'longtask', buffered: true });
  return {
    take(startMs, endMs) {
      const harness = performance.getEntriesByType('measure').filter(m => m.name.startsWith('harness:'));
      return tasks.filter(x => x.startTime >= startMs && x.startTime < endMs).map(x => {
        const overlapsHarness = harness.some(h => h.startTime < x.startTime + x.duration && x.startTime < h.startTime + h.duration);
        const self = x.attribution?.some(a => a.name === 'self' || a.containerType === 'window');
        return { ms: x.duration, start: x.startTime, kind: overlapsHarness ? 'harness' : self ? 'application' : 'unattributed' };
      });
    },
  };
}

export function refreshHz(samples = 61) {
  return new Promise(resolve => {
    const t = []; const f = now => { t.push(now); if (t.length < samples) requestAnimationFrame(f); else { const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b); resolve(1000 / d[Math.floor(d.length / 2)]); } };
    requestAnimationFrame(f);
  });
}
```

- [ ] **Step 6: Write the drivers**

```js
// spikes/project0/browser/drivers/g1.js — the dispatch runs on the device created from the very adapter whose identity is judged.
import { acquire, destroy } from '../../gpu/device.js';
import { prepare } from '../../gpu/webgpu.js';
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog } from '../../gpu/watchdog.js';
import { arith } from './checks.js';
import { packRows } from '../packing.js';
export async function run(gate, fx, params, status) {
  const alloc = createAllocator({ capBytes: fx.resources.capBytes }), watchdog = createWatchdog();
  const { device, info } = await acquire();
  let probeOk = false, error = null;
  try {
    const pipelines = await prepare(device, alloc, status);
    const words = await arith(device, alloc, watchdog, pipelines, 'bulb_samples', packRows(fx.arithmetic.bulb, s => [...s.input, 0]), fx.arithmeticProtocol.bulb.iterations, fx.arithmetic.bulb.length);
    probeOk = words.length === 4 * fx.arithmetic.bulb.length && [...words].every((w, i) => i % 4 !== 0 || w <= 2);
  } catch (e) { error = e.message; }
  finally { watchdog.dispose(); alloc.destroyAll(); destroy(); }
  return { slots: [{ slot: params.get('runMode'), raw: { adapterInfo: info, probeOk, ...(error ? { probeError: error } : {}) } }], invalidations: [] };
}
```

```js
// spikes/project0/browser/drivers/g2.js — runs at module evaluation via main.js, so navigationMs is measured from navigation start.
import { session, renderOnce } from './common.js';
import { observeIntegrity } from '../integrity.js';
export async function run(gate, fx, params, status) {
  const statusLog = [], canvas = document.getElementById('view'), integrity = observeIntegrity(canvas);
  const say = text => { status(text); statusLog.push({ t: performance.now(), text, visible: document.getElementById('status').offsetParent !== null }); };
  say('preparing: acquiring GPU');
  const s = await session(fx, say);
  try {
    const frame = await renderOnce(s.renderer, { view: 'bulb-overview', profile: 'draft' });
    return { slots: [{ slot: 'pending', raw: { navigationMs: frame.t, statusLog, frame, outstandingMax: s.renderer.stats().outstandingMax, integrity: integrity.stop(), losses: s.losses } }], invalidations: [] };
  } finally { s.close(); }
}
```

```js
// spikes/project0/browser/drivers/timing.js — G6 (9 trials), G7 (3 trials) and G9 (their 12 windows), in one headed session.
import { session, frameOf, sleep } from './common.js';
import { posesAt, burstSchedule } from '../paths.js';
import { observeIntegrity, observeLongTasks, refreshHz } from '../integrity.js';
import * as events from '../events.js';

const VIEWS = ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'];

export async function followPath(renderer, fx, view, profile, seconds, override = {}) {
  const frames = [], t0 = performance.now(); let pending = 0, pendingMax = 0, off = null;
  try {
    await new Promise(resolve => {
      const issue = () => {
        const s = (performance.now() - t0) / 1000;
        if (s >= seconds) return resolve();
        pending++; pendingMax = Math.max(pendingMax, pending);
        renderer.render({ view, profile, camera: posesAt(fx, view, s), label: view, override });
      };
      off = renderer.onPublish(p => { if (p.label === view) { pending--; frames.push(frameOf(p)); issue(); } });
      issue();
    });
  } finally { off?.(); }
  return { windowStart: t0, frames, pendingMax };
}

function bandDiagnostics(stats, method) {
  const ms = stats.bands.map(b => (b.gpuMs ?? (b.doneMs - b.submitMs))).filter(Number.isFinite).sort((a, b) => a - b);
  const p99 = ms.length ? ms[Math.ceil(0.99 * ms.length) - 1] : null, max = ms.at(-1) ?? null;
  return { method, bands: ms.length, p99, max, warning: max !== null && max > 30 ? `band duration ${max.toFixed(1)} ms exceeds the 30 ms warning` : null };
}

export async function run(gate, fx, params, status) {
  const lt = observeLongTasks(), canvas = document.getElementById('view'), slots = [], longTasks = [];
  const hz = await refreshHz(); let windows = 0;
  for (const view of VIEWS) for (let trial = 0; trial < 3; trial++) {
    const s = await session(fx, status);
    try {
      await followPath(s.renderer, fx, view, 'draft', 3);                                        // warm-up, discarded
      const integrity = observeIntegrity(canvas);
      const r = await followPath(s.renderer, fx, view, 'draft', 30);
      const observed = integrity.stop();
      longTasks.push(...lt.take(r.windowStart, r.windowStart + 30000)); windows++;
      const ts = await s.renderer.readTimestamps();
      slots.push({ slot: `${view}/${trial}`, gate: 'G6', raw: { ...r, outstandingMax: s.renderer.stats().outstandingMax, integrity: observed, refreshHz: hz, diagnostics: bandDiagnostics(s.renderer.stats(), ts.method), losses: s.losses } });
    } finally { s.close(); events.clear(); }
  }
  const schedule = burstSchedule(fx);
  for (let trial = 0; trial < 3; trial++) {
    const s = await session(fx, status); let off = null;
    try {
      await followPath(s.renderer, fx, 'bulb-overview', 'draft', 3);
      const frames = []; off = s.renderer.onPublish(p => frames.push(frameOf(p)));
      const integrity = observeIntegrity(canvas), t0 = performance.now() + 50, issued = [];
      await Promise.all(schedule.map(r => new Promise(resolve => setTimeout(() => {
        const firedMs = performance.now(), lateByMs = firedMs - (t0 + r.offsetMs);         // recorded before render()
        const requestId = s.renderer.render({ view: 'bulb-overview', profile: 'draft', camera: r.camera, label: 'bulb-overview' });
        const requestedMs = events.list().findLast(e => e.type === 'request' && e.requestId === requestId).t;   // function-entry time
        issued.push({ id: r.id, burst: r.burst, index: r.index, firedMs, lateByMs, requestId, requestedMs }); resolve();
      }, Math.max(0, t0 + r.offsetMs - performance.now())))));
      await sleep(fx.bursts.quietMs);
      const observed = integrity.stop();
      longTasks.push(...lt.take(t0, performance.now())); windows++;
      const ts = await s.renderer.readTimestamps();
      slots.push({ slot: String(trial), gate: 'G7', raw: { issued: issued.sort((a, b) => a.id - b.id), frames, outstandingMax: s.renderer.stats().outstandingMax, integrity: observed, refreshHz: hz, diagnostics: bandDiagnostics(s.renderer.stats(), ts.method), losses: s.losses } });
    } finally { off?.(); s.close(); events.clear(); }
  }
  slots.push({ slot: 'warmed', gate: 'G9', raw: { windows, longTasks } });
  return { slots, invalidations: [] };
}
```

```js
// spikes/project0/browser/drivers/g8.js — replace in-flight stress work, after its exact submission was observed.
import { session, frameOf, sleep } from './common.js';
import { observeIntegrity } from '../integrity.js';
export async function run(gate, fx, params, status) {
  const slots = [], canvas = document.getElementById('view');
  for (let rep = 0; rep < 10; rep++) {
    const s = await session(fx, status), frames = []; const off = s.renderer.onPublish(p => frames.push(frameOf(p)));
    try {
      const integrity = observeIntegrity(canvas);
      const stressRequestId = s.renderer.render({ view: 'bulb-stress', profile: 'stress', label: 'bulb-stress' });
      const t0 = performance.now(); let stressSubmit = null;
      while (!(stressSubmit = s.events.list().find(e => e.type === 'submit' && e.requestId === stressRequestId && e.epoch === s.epoch)) && performance.now() - t0 < 5000) await sleep(1);
      const sphereRequested = performance.now();
      const sphereId = s.renderer.render({ view: 'sphere', profile: 'draft', label: 'sphere' });
      while (!frames.some(f => f.requestId === sphereId) && performance.now() - sphereRequested < 5000) await sleep(1);
      await s.device.queue.onSubmittedWorkDone();                                            // drain: a stale stress result would publish now
      await sleep(50);
      slots.push({ slot: String(rep), raw: { stressRequestId, stressSubmit: stressSubmit ? { requestId: stressSubmit.requestId, t: stressSubmit.t } : null, sphereRequested, sphere: frames.find(f => f.requestId === sphereId) ?? null, stalePublications: frames.filter(f => f.label === 'bulb-stress').length, outstandingMax: s.renderer.stats().outstandingMax, integrity: integrity.stop(), losses: s.losses } });
    } finally { off(); s.close(); s.events.clear(); }
  }
  return { slots, invalidations: [] };
}
```

```js
// spikes/project0/browser/drivers/g10.js — settled single frames.
import { session, renderOnce } from './common.js';
import { observeIntegrity } from '../integrity.js';
export async function run(gate, fx, params, status) {
  const s = await session(fx, status), slots = [], canvas = document.getElementById('view');
  try {
    for (const view of ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005']) {
      const integrity = observeIntegrity(canvas), requestedMs = performance.now();
      let frame = null; try { frame = await renderOnce(s.renderer, { view, profile: 'settled' }, { timeoutMs: 20000 }); } catch {}
      slots.push({ slot: view, raw: { requestedMs, frame, prepared: 1, outstandingMax: s.renderer.stats().outstandingMax, integrity: integrity.stop(), losses: s.losses } });
    }
  } finally { s.close(); }
  return { slots, invalidations: [] };
}
```

```js
// spikes/project0/browser/drivers/g12.js — the A.9 ten-minute sequence with fixed deadlines and bounded checkpoints.
import { session, renderOnce, sleep } from './common.js';
import { followPath } from './timing.js';
import { prepareResourceCheck, exerciseResources } from './resources.js';
import { observeIntegrity } from '../integrity.js';
import { onLoss } from '../../gpu/device.js';
export async function run(gate, fx, params, status) {
  const cfg = fx.stability, canvas = document.getElementById('view');
  let unplannedLosses = 0, unhandled = 0;
  const offLoss = onLoss(() => { unplannedLosses++; });
  const onErr = () => unhandled++; addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  const s = await session(fx, status);
  const maintenance = [];
  try {
    const setBacking = ([w, h]) => { canvas.width = w; canvas.height = h; };
    const draftAt = () => ({ W: canvas.width * cfg.internalScale, H: canvas.height * cfg.internalScale });
    // Baseline: prepare and cache every pipeline the sequence uses, exercise once, return to 1280x720, drain, record.
    const prepared = await prepareResourceCheck(s.device, s.alloc);
    await followPath(s.renderer, fx, 'bulb-overview', 'draft', 1);
    await renderOnce(s.renderer, { view: 'sphere', profile: 'draft' });
    maintenance.push(await exerciseResources(s.device, s.alloc, s.watchdog, fx, prepared, status));
    setBacking(cfg.baselineBacking); await followPath(s.renderer, fx, 'bulb-overview', 'draft', 1, draftAt());
    await s.device.queue.onSubmittedWorkDone(); await sleep(200);
    const baseline = s.alloc.inventory();
    const integrity = observeIntegrity(canvas, { allowedBacking: [cfg.baselineBacking, ...cfg.resizeBacking] });
    window.p0Checkpoints = [];
    const [, toSphere, toDetail, toMaintenance] = cfg.phaseOffsetsMs;
    const start = performance.now(); let deadlineMisses = 0;
    for (let c = 0; c < cfg.cycleCount; c++) {
      const c0 = start + c * cfg.cycleMs;
      const phase = async (view, untilMs) => { const seconds = Math.max(0, (untilMs - performance.now()) / 1000); if (seconds > 0) await followPath(s.renderer, fx, view, 'draft', seconds, draftAt()); };
      await phase('bulb-overview', c0 + toSphere);
      await phase('sphere', c0 + toDetail);
      await phase('bulb-detail-0.005', c0 + toMaintenance);
      const stressId = s.renderer.render({ view: 'bulb-stress', profile: 'stress', label: 'bulb-stress', override: draftAt() });
      while (!s.events.list().some(e => e.type === 'submit' && e.requestId === stressId)) await sleep(1);
      await renderOnce(s.renderer, { view: 'sphere', profile: 'draft', override: draftAt() });
      setBacking(cfg.resizeBacking[c % cfg.resizeBacking.length]);
      if ((c + 1) % cfg.resourceEvery === 0) maintenance.push(await exerciseResources(s.device, s.alloc, s.watchdog, fx, prepared, status));
      s.events.clear();
      if (performance.now() > c0 + cfg.cycleMs) deadlineMisses++; else await sleep(c0 + cfg.cycleMs - performance.now());
      window.p0Checkpoints.push({ cycle: c, t: performance.now(), deadlineMisses, unhandled, unplannedLosses, inventory: s.alloc.inventory(), maintenanceErrors: maintenance.flatMap(m => m.errors) });
    }
    const wallMs = performance.now() - start;
    setBacking(cfg.baselineBacking); await followPath(s.renderer, fx, 'bulb-overview', 'draft', 1, draftAt());
    await s.device.queue.onSubmittedWorkDone(); await sleep(200);
    const final = s.alloc.inventory();
    return { slots: [{ slot: 'sequence', raw: { cycles: window.p0Checkpoints.length, wallMs, deadlineMisses, unhandled, unplannedLosses, baseline, final, baselinePrepared: 1, returned1280: canvas.width === 1280 && canvas.height === 720 ? 1 : 0, outstandingMax: s.renderer.stats().outstandingMax, integrity: integrity.stop(), maintenance: maintenance.map(m => ({ errors: m.errors, checks: m.checks.length, bandOk: m.bandOk })) } }], invalidations: [] };
  } finally { offLoss(); removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr); s.close(); }
}
```

```js
// spikes/project0/browser/drivers/visible.js — visible-output evidence outside measured windows (not a gate).
import { session, renderOnce } from './common.js';
async function capture(s, frame) {
  const { device, renderer } = s, t = renderer.targets, bytesPerRow = Math.ceil(t.W * 4 / 256) * 256;
  const buf = s.alloc.buffer(device, { size: bytesPerRow * t.H, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  try {
    const enc = device.createCommandEncoder(); enc.copyTextureToBuffer({ texture: t.display }, { buffer: buf, bytesPerRow }, [t.W, t.H]); device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ); const src = new Uint8Array(buf.getMappedRange().slice(0)); buf.unmap();
    const rgba = new Uint8ClampedArray(t.W * t.H * 4); for (let y = 0; y < t.H; y++) rgba.set(src.subarray(y * bytesPerRow, y * bytesPerRow + t.W * 4), y * t.W * 4);
    const classes = { background: 0, unresolved: 0, failure: 0, unavailableNormal: 0, shaded: 0 };
    for (let i = 0; i < rgba.length; i += 4) {
      const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
      if (r === 255 && g === 0 && b === 255) classes.unresolved++; else if (r === 255 && g === 0 && b === 0) classes.failure++;
      else if (r === 128 && g === 128 && b === 128) classes.unavailableNormal++; else if (r <= 6 && g <= 6 && b <= 8) classes.background++; else classes.shaded++;
    }
    const canvas = new OffscreenCanvas(t.W, t.H); canvas.getContext('2d').putImageData(new ImageData(rgba, t.W, t.H), 0, 0);
    const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = ''; for (const x of png) bin += String.fromCharCode(x);
    return { W: t.W, H: t.H, counts: frame.counts, classes, pngBase64: btoa(bin) };
  } finally { buf.destroy(); }
}
export async function run(gate, fx, params, status) {
  const s = await session(fx, status), out = {};
  try {
    for (const [view, profile] of [['sphere', 'draft'], ['bulb-overview', 'draft'], ['bulb-stress', 'stress']]) out[view] = await capture(s, await renderOnce(s.renderer, { view, profile }));
    const ok = out.sphere.classes.shaded > 0 && out.sphere.classes.unresolved === 0 && out.sphere.classes.failure === 0 && out['bulb-overview'].classes.shaded > 0 && out['bulb-stress'].classes.unresolved >= 0.4 * out['bulb-stress'].W * out['bulb-stress'].H;
    return { slots: [{ slot: 'captures', raw: { out, ok } }], invalidations: ok ? [] : ['visible output does not match the expected classes'] };
  } finally { s.close(); }
}
```

The colour classes follow `fixtures.shading`:
- background (0.02, 0.02, 0.03), which quantises to at most (6, 6, 8);
- unresolved magenta;
- failure red;
- unavailable-normal grey (0.5, quantised to 128);
- everything else is a shaded surface.

`visible` is an experiment. Its record has no metrics, and its captures are hashed artefacts
that T13 includes in the report.

- [ ] **Step 7: Commit** (after Codex's read-only review, before any GPU run)

```bash
git add spikes/project0/browser/paths.js spikes/project0/browser/integrity.js spikes/project0/browser/drivers/g1.js spikes/project0/browser/drivers/g2.js spikes/project0/browser/drivers/timing.js spikes/project0/browser/drivers/g8.js spikes/project0/browser/drivers/g10.js spikes/project0/browser/drivers/g12.js spikes/project0/browser/drivers/visible.js spikes/project0/measure/timing.mjs spikes/project0/tests/timing.test.mjs spikes/project0/tests/g1.test.mjs
git commit -m "Project 0 T9: timing drivers with full-interval integrity, exact submission identities, complete-frame coverage, visible-output evidence"
```

- [ ] **Step 8: Run every driver once as a development campaign**

Each run is headed, in the foreground, with no other window covering it:

```bash
node spikes/project0/run.mjs --gate G1 --mode headed && node spikes/project0/run.mjs --gate G1 --mode headless
node spikes/project0/run.mjs --gate G2
node spikes/project0/run.mjs --gate timing --mode headed      # about 6 minutes: 12 warmed 30 s trials
node spikes/project0/run.mjs --gate G8 --mode headed
node spikes/project0/run.mjs --gate G10 --mode headed
node spikes/project0/run.mjs --gate visible --mode headed
node spikes/project0/run.mjs --gate G12 --mode headed         # about 11 minutes, with checkpoints every 15 s
```

Expected:
- every run prints one metrics line per slot with the `gatePlan` keys, or an explicit
  `INVALIDATIONS` list;
- every run writes an `evidence:` directory;
- G12 also writes `checkpoint-*.json` files.

These are development records (campaign `dev`) and never qualify. Do not judge pass or fail
here: T10 runs and evaluates the qualifying campaign.

---

### Task T10: Formal WebGPU qualification campaign, selection manifest and the single remediation cycle

**Owner:** Claude runs it. Classification, the remediation decision and every interpretation
are made **jointly with Codex** under the collaboration protocol, and are logged verbatim.

**Files:**
- `spikes/project0/qualify.mjs`, the pure core:
  - manifest construction and validation;
  - campaign coherence;
  - loading reused records;
  - artefact verification and metric recomputation;
  - gate evaluation and the backend decision.
- `spikes/project0/campaign.mjs`: runs the gates in phases (correctness, then performance,
  then stability), acts on live aborts, and writes the manifest.
- `spikes/project0/close-remediation.mjs`: recomputes the final decision from the closed
  selection and the reviewed remediation history, with no hardware.
- `spikes/project0/launch-remediation.json`: created only if the remediation includes a launch
  change.
- Test: `spikes/project0/tests/qualify.test.mjs`.

**Interfaces:**
- Consumes:
  - T1: `evaluateGate`, `decideBackends`, `GATES`, `canonical`;
  - T5: `sha256`, `fixtureIdentity`;
  - T6/T9: `runSession`, `runG2`, `metricsFor`.
- Produces:
  - `buildManifest({records, fixture, campaign, args, runDirs, notRun, reuse}) → manifest`;
  - `checkCoherence(records, manifest) → void`. It throws on mixed backend, environment or
    launch configuration. Reused records may differ only in implementation identity, and only
    with a stated reason;
  - `loadCampaign(manifestPath, {root}) → {manifest, records}`, which includes the reused
    records from their source manifests;
  - `recompute(records, fixtures, {root}) → records`. Every selected record must have exactly
    one `.raw.json`. All artefacts are re-hashed, and the metrics of every uninvalidated record
    are rederived and must match;
  - `qualify(manifest, records, fixtures, {remediationClosed}) → {backend, decision}`. A pass
    or fail comes **only** from `evaluateGate`, applied to that gate's own selected records. A
    `notRun` entry yields `not run` and never a pass;
  - `validateStops(notRun, trials)`, applied by both `buildManifest` and `qualify`;
  - `ABORTS`, the spec §7 stop conditions detected from record invalidations.

**Rules (from Codex's review, adopted):**
- **`notRun` entries:** a manifest stop entry contains only `status: 'not run'` and a
  `reason`, plus an optional `blockedBy`. It cannot coexist with selected trials for the same
  gate. Its `blockedBy` must name a gate whose selected evidence evaluates to `fail`.
- **Campaign identity:** this is persisted in each record before it is written. A record with
  no campaign, or with campaign `dev`, `probe` or any experiment, cannot be selected.
- **Coherence:** the selected records must share the backend, browser version and executable,
  driver and session, and one launch configuration per mode. Reuse is explicit and justified.
- **Phases:** the correctness gates are evaluated before any performance work starts. A
  correctness failure stops the campaign, and the remaining gates are `not run`.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/qualify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, checkCoherence, qualify, ABORTS } from '../qualify.mjs';
import { GATES } from '../contract.js';

const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode: 'headless' };
const fixture = { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) };
const rec = (gate, slot, extra = {}) => ({ schema: 1, id: `${gate}-${slot}-run`, gate, slot, campaign: 'webgpu-1', experiment: false, identity, invalidations: [], artifacts: [], metrics: {}, ...extra });
const base = { fixture, campaign: 'webgpu-1', args: 'attempt1', runDirs: [] };

test('the manifest selects each slot once and refuses development, missing-campaign, experiment or mixed-fixture evidence', () => {
  const m = buildManifest({ ...base, records: [rec('G4', 'bulb-samples'), rec('G5', 'qjulia-plane')] });
  assert.deepEqual(Object.keys(m.trials).sort(), ['G4/bulb-samples', 'G5/qjulia-plane']);
  assert.throws(() => buildManifest({ ...base, records: [rec('G4', 'bulb-samples'), rec('G4', 'bulb-samples', { id: 'x' })] }), /duplicate/);
  for (const campaign of ['dev', 'probe', undefined]) assert.throws(() => buildManifest({ ...base, records: [rec('G4', 'bulb-samples', { campaign })] }), /campaign/);
  assert.throws(() => buildManifest({ ...base, records: [rec('precision', 'precision', { experiment: true })] }), /experiment/);
  assert.throws(() => buildManifest({ ...base, records: [rec('G4', 'bulb-samples', { identity: { ...identity, fixtureHash: '9'.repeat(64) } })] }), /fixture/);
});

test('a forged stop entry can never produce a pass, and cannot coexist with selected trials', () => {
  const forged = { ...base, records: [], notRun: Object.fromEntries(GATES.map(g => [g, { status: 'pass', reason: 'x' }])) };
  assert.throws(() => buildManifest(forged), /only 'not run'/);
  const ok = buildManifest({ ...base, records: [], notRun: Object.fromEntries(GATES.map(g => [g, { status: 'not run', reason: 'campaign stopped' }])) });
  const { decision, backend } = qualify(ok, [], { analytic: {}, arithmetic: { bulb: [], plane: [] } });
  assert.notEqual(decision.outcome, 'WebGPU selected');
  assert.ok(Object.values(backend.gates).every(g => g.status === 'not run'));
  assert.throws(() => buildManifest({ ...base, records: [rec('G4', 'bulb-samples')], notRun: { G4: { status: 'not run', reason: 'x' } } }), /coexist/);
});

test('blockedBy must name a gate whose evidence failed', () => {
  const m = buildManifest({ ...base, records: [], notRun: { G6: { status: 'not run', reason: 'stopped', blockedBy: 'G4' } } });
  assert.throws(() => qualify(m, [], { analytic: {}, arithmetic: { bulb: [], plane: [] } }), /blockedBy G4 is not a measured failure/);
});

test('coherence: one backend, environment and launch configuration per mode; reuse must be justified', () => {
  const a = rec('G4', 'bulb-samples'), b = rec('G5', 'qjulia-plane', { identity: { ...identity, driver: 'other' } });
  assert.throws(() => checkCoherence([a, b], { reuse: [] }), /driver/);
  const c = rec('G5', 'qjulia-plane', { identity: { ...identity, implementationCommit: '1'.repeat(40) } });
  assert.throws(() => checkCoherence([a, c], { reuse: [] }), /implementation/);
  assert.doesNotThrow(() => checkCoherence([a, c], { reuse: [{ gate: 'G5', slot: 'qjulia-plane', reason: 'unaffected by the remediation change set' }] }));
  const d = rec('G5', 'qjulia-plane', { identity: { ...identity, launchHash: '2'.repeat(64) } });
  assert.throws(() => checkCoherence([a, d], { reuse: [{ gate: 'G5', slot: 'qjulia-plane', reason: 'r' }] }), /launch/);
});

test('abort conditions are detected from record invalidations and metrics', () => {
  const reasons = r => ABORTS.map(f => f(r)).filter(Boolean);
  assert.deepEqual(reasons(rec('G12', 'sequence', { metrics: { unplannedLosses: 1 } })), ['unexpected device loss']);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { invalidations: ['device lost: unknown'] })), ['unexpected device loss']);
  assert.deepEqual(reasons(rec('G11', '4k', { invalidations: ['metrics: allocation cap exceeded: 1 + 2 > 1'] })), ['allocation cap exceeded']);
  assert.deepEqual(reasons(rec('G1', 'headed', { metrics: { nvidia: 0, software: 1, corroborated: 0 } })), ['software execution detected']);
  assert.deepEqual(reasons(rec('G3', 'box', { invalidations: ['no observable progress for 5 s: […]'] })), ['submission stalled for 5 s']);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { invalidations: ['page: browser hang: no result within the 1200000 ms outer deadline'] })), ['browser hang']);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { metrics: { published: 900 } })), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/qualify.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/qualify.mjs`.

- [ ] **Step 3: Implement `qualify.mjs`**

```js
// spikes/project0/qualify.mjs — selection, coherence, artefact verification, recomputation and evaluation (pure, no hardware).
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { canonical, GATES } from './contract.js';
import { evaluateGate } from './gates.js';
import { decideBackends } from './decision.js';
import { sha256 } from './evidence.mjs';
import { metricsFor } from './measure/index.mjs';
import { ROOT } from './launch.mjs';

const NON_QUALIFYING = new Set(['dev', 'probe', 'precision']);

export function buildManifest({ records, fixture, campaign, args, runDirs = [], notRun = {}, reuse = [] }) {
  if (!/^[a-z0-9-]+$/.test(campaign || '') || NON_QUALIFYING.has(campaign)) throw new Error('a qualifying campaign name is required');
  const trials = {};
  for (const r of records) {
    if (r.experiment) throw new Error(`experiment record ${r.id} cannot qualify`);
    const reused = reuse.find(x => x.gate === r.gate && x.slot === r.slot && x.recordId === r.id);
    if (!r.campaign || NON_QUALIFYING.has(r.campaign) || (r.campaign !== campaign && !reused)) throw new Error(`record ${r.id}: campaign ${r.campaign ?? '(none)'} is not selectable here`);
    for (const k of ['fixtureHash', 'fixtureCommit', 'specHash']) if (r.identity[k] !== fixture[k]) throw new Error(`record ${r.id}: fixture identity differs`);
    const key = `${r.gate}/${r.slot}`;
    if (trials[key]) throw new Error(`duplicate selection for ${key}`);
    trials[key] = { id: r.id, identity: r.identity };
  }
  validateStops(notRun, trials);
  for (const x of reuse) if (!x.reason || !x.fromManifest || !x.recordId) throw new Error(`reuse of ${x.gate}/${x.slot} needs fromManifest, recordId and a reason`);
  return { fixture, campaign, args, runDirs, trials, notRun, reuse };
}

// Applied when a manifest is built *and* when one is read back, so an edited manifest file cannot smuggle in a verdict.
export function validateStops(notRun = {}, trials = {}) {
  for (const [gate, entry] of Object.entries(notRun)) {
    if (!GATES.includes(gate)) throw new Error(`notRun.${gate}: unknown gate`);
    const keys = Object.keys(entry).sort().join(',');
    if (entry.status !== 'not run' || !['reason,status', 'blockedBy,reason,status'].includes(keys) || !entry.reason) throw new Error(`notRun.${gate}: only 'not run' with a reason (and optional blockedBy) is allowed`);
    if (Object.keys(trials).some(k => k.startsWith(`${gate}/`))) throw new Error(`notRun.${gate} cannot coexist with selected trials for that gate`);
  }
}

export function checkCoherence(records, manifest) {
  if (!records.length) return;
  const ref = records[0].identity, byMode = {};
  for (const r of records) {
    for (const k of ['backend', 'browserVersion', 'browserExecutable', 'driver', 'session']) if (r.identity[k] !== ref[k]) throw new Error(`incoherent evidence: ${k} differs in ${r.id}`);
    byMode[r.identity.mode] ??= r.identity.launchHash;
    if (byMode[r.identity.mode] !== r.identity.launchHash) throw new Error(`incoherent evidence: launch configuration differs in ${r.id}`);
  }
  const reused = r => manifest.reuse?.some(x => x.gate === r.gate && x.slot === r.slot && x.reason);
  const fresh = records.filter(r => !reused(r));
  const impl = fresh[0]?.identity;
  for (const r of records) if (impl && !reused(r) && (r.identity.implementationCommit !== impl.implementationCommit || r.identity.implementationHash !== impl.implementationHash)) throw new Error(`incoherent evidence: implementation identity differs in ${r.id} without a justified reuse`);
}

export const ABORTS = [
  r => (r.metrics?.unplannedLosses > 0 || r.invalidations.some(x => /device lost/.test(x))) ? 'unexpected device loss' : null,
  r => r.invalidations.some(x => /allocation cap exceeded/.test(x)) ? 'allocation cap exceeded' : null,
  r => (r.metrics?.software === 1 || r.invalidations.some(x => /software adapter/.test(x))) ? 'software execution detected' : null,
  r => r.invalidations.some(x => /browser hang/i.test(x)) ? 'browser hang' : null,
  r => r.invalidations.some(x => /no observable progress for 5 s/.test(x)) ? 'submission stalled for 5 s' : null,
];

async function recordsIn(root, dir) {
  const out = [];
  for (const name of await readdir(join(root, 'artifacts/project0', dir))) {
    if (!name.endsWith('.json') || name.endsWith('.raw.json') || name.endsWith('.launch.json') || name.startsWith('checkpoint-')) continue;
    out.push(JSON.parse(await readFile(join(root, 'artifacts/project0', dir, name), 'utf8')));
  }
  return out;
}

export async function loadCampaign(manifestPath, { root = ROOT } = {}) {
  const manifest = JSON.parse(await readFile(resolve(root, manifestPath), 'utf8'));
  const records = [];
  for (const dir of manifest.runDirs) for (const r of await recordsIn(root, dir)) if (manifest.trials[`${r.gate}/${r.slot}`]?.id === r.id) records.push(r);
  for (const x of manifest.reuse ?? []) {
    const { manifest: source, records: sourceRecords } = await loadCampaign(x.fromManifest, { root });
    const r = sourceRecords.find(y => y.id === x.recordId && source.trials[`${y.gate}/${y.slot}`]?.id === y.id);
    if (!r) throw new Error(`reused record ${x.recordId} is not selected in ${x.fromManifest}`);
    records.push(r);
  }
  for (const key of Object.keys(manifest.trials)) if (!records.some(r => `${r.gate}/${r.slot}` === key)) throw new Error(`selected trial ${key} has no record`);
  return { manifest, records };
}

export async function recompute(records, fixtures, { root = ROOT } = {}) {
  for (const r of records) {
    for (const a of r.artifacts) if (sha256(await readFile(join(root, 'artifacts/project0', a.path))) !== a.sha256) throw new Error(`artefact hash mismatch: ${a.path}`);
    const raws = r.artifacts.filter(a => a.path.endsWith('.raw.json'));
    if (raws.length !== 1) throw new Error(`record ${r.id} must have exactly one raw payload`);
    if (r.invalidations.length) continue;
    const raw = JSON.parse(await readFile(join(root, 'artifacts/project0', raws[0].path), 'utf8'));
    const again = await metricsFor(r.gate, r.slot, raw, fixtures);
    if (canonical(again) !== canonical(r.metrics)) throw new Error(`metrics for ${r.id} do not recompute from its raw payload`);
  }
  return records;
}

export function qualify(manifest, records, fixtures, { remediationClosed = false } = {}) {
  validateStops(manifest.notRun, manifest.trials);
  const gates = {};
  for (const g of GATES) if (!manifest.notRun?.[g]) gates[g] = evaluateGate(g, records.filter(r => r.gate === g), manifest, fixtures);
  for (const [g, entry] of Object.entries(manifest.notRun ?? {})) {
    if (entry.blockedBy && gates[entry.blockedBy]?.status !== 'fail') throw new Error(`notRun.${g}: blockedBy ${entry.blockedBy} is not a measured failure`);
    gates[g] = { gate: g, status: 'not run', reason: entry.reason, ...(entry.blockedBy ? { blockedBy: entry.blockedBy } : {}), reasons: [entry.reason], evidenceIds: [] };
  }
  const backend = { remediationClosed, gates };
  return { backend, decision: decideBackends(backend) };
}
```

`evaluateGate` receives only that gate's selected records, so an invalid record in one gate
cannot change another gate's result. T1's `validateRecords` still applies in full to each
gate's own records.

- [ ] **Step 4: Implement `campaign.mjs` and `close-remediation.mjs`**

```js
// spikes/project0/campaign.mjs — node spikes/project0/campaign.mjs --name webgpu-1 [--args attempt1|remediation] [--gates G1,G4,...] [--reuse <json>]
import { parseArgs } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './launch.mjs';
import { runSession, runG2 } from './run.mjs';
import { fixtureIdentity } from './evidence.mjs';
import { buildManifest, checkCoherence, ABORTS, recompute, qualify, loadCampaign } from './qualify.mjs';
import { evaluateGate } from './gates.js';

const PHASES = [
  ['correctness', [['G1', 'headed'], ['G1', 'headless'], ['G4', 'headless'], ['G5', 'headless'], ['G3', 'headless'], ['G11', 'headed'], ['G13', 'headed']]],
  ['performance', [['G2', 'headed'], ['timing', 'headed'], ['G8', 'headed'], ['G10', 'headed']]],
  ['stability', [['G12', 'headed']]],
];
const gatesOf = g => (g === 'timing' ? ['G6', 'G7', 'G9'] : [g]);
const { values } = parseArgs({ options: { name: { type: 'string' }, args: { type: 'string', default: 'attempt1' }, gates: { type: 'string' }, reuse: { type: 'string', default: '[]' } } });
const only = values.gates?.split(','), reuse = JSON.parse(values.reuse);
const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
const fixture = await fixtureIdentity();
const records = [], runDirs = [], notRun = {}; let stopped = null, blockedBy = null;
const draftManifest = () => buildManifest({ records, fixture, campaign: values.name, args: values.args, runDirs, reuse });
for (const x of reuse) { const { records: rs } = await loadCampaign(x.fromManifest); const r = rs.find(y => y.id === x.recordId); if (!r) throw new Error(`cannot reuse ${x.recordId}`); await recompute([r], fixtures); records.push(r); }
for (const [phase, steps] of PHASES) {
  for (const [gate, mode] of steps) {
    if (only && !gatesOf(gate).some(g => only.includes(g))) continue;
    if (reuse.some(x => gatesOf(gate).includes(x.gate))) continue;
    if (stopped) { for (const g of gatesOf(gate)) notRun[g] ??= { status: 'not run', reason: `campaign stopped: ${stopped}`, ...(blockedBy ? { blockedBy } : {}) }; continue; }
    const out = gate === 'G2' ? await runG2({ args: values.args, campaign: values.name }) : await runSession({ gate, mode, args: values.args, campaign: values.name });
    records.push(...out.records); runDirs.push(out.runDir.split('/').at(-1));
    const abort = out.records.flatMap(r => ABORTS.map(f => f(r)).filter(Boolean));
    if (abort.length) stopped = `${gate}: ${[...new Set(abort)].join(', ')}`;
  }
  if (phase === 'correctness' && !stopped) {
    // Correctness before benchmarking: a numerical or functional failure is diagnosed before performance work.
    const m = draftManifest();
    for (const g of ['G1', 'G3', 'G4', 'G5', 'G11', 'G13']) {
      if (only && !only.includes(g)) continue;
      const r = evaluateGate(g, records.filter(x => x.gate === g), m, fixtures);
      if (r.status !== 'pass') { stopped = `correctness gate ${g} is ${r.status}`; if (r.status === 'fail') blockedBy = g; break; }
    }
  }
}
const manifest = buildManifest({ records, fixture, campaign: values.name, args: values.args, runDirs, notRun, reuse });
checkCoherence(records, manifest);
await recompute(records, fixtures);
const { backend, decision } = qualify(manifest, records, fixtures);
const dir = resolve(ROOT, 'docs/reports/project0'); await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, `${values.name}-manifest.json`), JSON.stringify({ ...manifest, stopped }, null, 2));
await writeFile(resolve(dir, `${values.name}-gates.json`), JSON.stringify({ backend, decision }, null, 2));
for (const [g, r] of Object.entries(backend.gates)) console.log(`${g}: ${r.status}${r.reasons?.length ? ` — ${r.reasons.slice(0, 3).join('; ')}` : ''}`);
console.log(`decision (remediation not yet closed): ${decision.outcome} — next: ${decision.next}${stopped ? `\nSTOPPED: ${stopped}` : ''}`);
```

```js
// spikes/project0/close-remediation.mjs — node spikes/project0/close-remediation.mjs --manifest docs/reports/project0/<campaign>-manifest.json --history docs/reports/project0/webgpu-remediation.md
// Closes the backend's single remediation cycle: verifies and recomputes the final selection, then writes the decision. No hardware.
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './launch.mjs';
import { sha256 } from './evidence.mjs';
import { loadCampaign, checkCoherence, recompute, qualify } from './qualify.mjs';

const { values } = parseArgs({ options: { manifest: { type: 'string' }, history: { type: 'string' } } });
const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
const history = await readFile(resolve(ROOT, values.history), 'utf8');
if (!/^## Classification/m.test(history) || !/^## Change set/m.test(history)) throw new Error('the remediation history must contain "## Classification" and "## Change set" sections (use "none" when no remediation was needed)');
const { manifest, records } = await loadCampaign(values.manifest);
checkCoherence(records, manifest);
await recompute(records, fixtures);
const { backend, decision } = qualify(manifest, records, fixtures, { remediationClosed: true });
const remediationFile = resolve(ROOT, 'spikes/project0/launch-remediation.json');
const unsafeFlag = manifest.args === 'remediation' && existsSync(remediationFile) && JSON.parse(await readFile(remediationFile, 'utf8')).includes('--enable-unsafe-webgpu');
const out = { backend: 'webgpu', manifest: values.manifest, manifestSha256: sha256(await readFile(resolve(ROOT, values.manifest))), history: values.history, historySha256: sha256(history), args: manifest.args, unsafeFlag, decision, gates: backend.gates };
await writeFile(resolve(ROOT, 'docs/reports/project0/webgpu-decision.json'), JSON.stringify(out, null, 2));
console.log(`WebGPU remediation closed: ${decision.outcome}${unsafeFlag ? ' — DEPENDS ON --enable-unsafe-webgpu' : ''}`);
```

- [ ] **Step 5: Run the tests to verify they pass, then the whole suite**

Run: `node --test spikes/project0/tests/qualify.test.mjs`
Expected: PASS, `# pass 5`, `# fail 0`.

Run: `node --test spikes/project0/tests/*.test.mjs`
Expected: every test passes, with `# fail 0`.

- [ ] **Step 6: Commit the campaign tooling, then run the qualifying campaign**

```bash
git add spikes/project0/qualify.mjs spikes/project0/campaign.mjs spikes/project0/close-remediation.mjs spikes/project0/tests/qualify.test.mjs
git commit -m "Project 0 T10: strict selection manifest, coherence, reuse, phased campaign with live aborts, remediation closure"
node spikes/project0/campaign.mjs --name webgpu-1
```

Expected, mechanically:
- one status line per gate, `G1` to `G13`;
- the decision line;
- `docs/reports/project0/webgpu-1-manifest.json` and `webgpu-1-gates.json`.

The plan cannot predict hardware outcomes. Any of `WebGPU selected`, `inconclusive` or
`STOPPED` is a valid result of this step.

- [ ] **Step 7: Joint review and the single remediation cycle**

1. **Send the evidence to Codex.** Send a message (`resume`) containing the gate table, the
   run directories and any `STOPPED` reason. Log the exchange verbatim.
2. **Classify jointly.** Agree on one classification per failed or invalid gate:
   - *implementation defect*;
   - *launch or configuration problem*;
   - *backend limitation or persistent failure*;
   - *evidence not collectable* (inconclusive).

   Write `docs/reports/project0/webgpu-remediation.md` with a `## Classification` section,
   verbatim from the exchange, and a `## Change set` section. If every gate passed, that
   section says "none".
3. **If a change is needed,** make **one documented change set**. It may contain implementation
   and launch corrections together, when both are justified:
   - **code fixes:** each comes with a test that fails without it, and the change set is
     committed;
   - **launch changes:** `spikes/project0/launch-remediation.json` holds the exact flags. For
     example, `["--enable-gpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan", "--enable-unsafe-webgpu"]`.
     `run.mjs` picks it up as `LAUNCH.remediation`.

   This is the backend's only remediation cycle.
4. **Re-run** the affected gates and their dependent correctness checks:
   `node spikes/project0/campaign.mjs --name webgpu-remediation --args <attempt1|remediation> --gates <list> --reuse '<[{gate, slot, fromManifest, recordId, reason}]>'`.
   - A launch change re-runs **every** gate, because the configuration identity changes.
     `checkCoherence` refuses to reuse across launch configurations.
   - Reused trials keep their original identity, are verified and recomputed, and must name a
     reason.
   - The original manifest stays unchanged.
5. **Close the cycle:**
   `node spikes/project0/close-remediation.mjs --manifest docs/reports/project0/<final-campaign>-manifest.json --history docs/reports/project0/webgpu-remediation.md`
   - This writes `docs/reports/project0/webgpu-decision.json` with the recomputed decision.
   - It sets `unsafeFlag` automatically when the selection depends on
     `--enable-unsafe-webgpu`.
   - When no remediation was needed, the final campaign is `webgpu-1`.
6. **Commit:**

```bash
git add docs/reports/project0/
git commit -m "Project 0 T10: WebGPU qualification evidence, remediation record and decision"
```

**Outcomes:**
- **WebGPU selected:** go to T12, then T13.
- **WebGPU unqualified after the cycle:** go to T11 and stop for the addendum.
- **Inconclusive:** go to T13 and report it. It is never converted into a failure.

---

### Task T11: WebGL API mapping and backend interface — the planning boundary

**Owner:** Claude and Codex jointly. This task contains **no WebGL implementation**. It is
executed only if T10 ends with WebGPU unqualified after its remediation cycle.

**Files:**
- `spikes/project0/gpu/backend.js`: the narrow backend interface the gate drivers depend on.
- `spikes/project0/gpu/WEBGL-MAPPING.md`: the frozen API mapping (spec §6 step 3).
- `spikes/project0/tests/backend.test.mjs`: the interface conformance test.

**Interfaces:**
- Produces: `BACKEND_METHODS`, the frozen list
  `['acquire', 'prepare', 'traceList', 'arith', 'prepareViewport', 'createRenderer', 'prepareResourceCheck', 'exerciseResources', 'injectLoss', 'onLoss', 'currentEpoch', 'destroy']`,
  and `assertBackend(obj)`. Today's WebGPU modules (`gpu/device.js`, `gpu/webgpu.js`,
  `gpu/renderer.js`, `browser/drivers/checks.js` and `browser/drivers/resources.js`) provide
  exactly these. The WebGL addendum must provide the same list, with the same semantics: the
  allocator, the watchdog, the ledger, the epochs and the raw-only results.

- [ ] **Step 1: Write the failing conformance test**

```js
// spikes/project0/tests/backend.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKEND_METHODS, assertBackend } from '../gpu/backend.js';
test('the backend interface is frozen and enforced', () => {
  assert.ok(Object.isFrozen(BACKEND_METHODS));
  assert.throws(() => assertBackend({ acquire() {} }), /missing backend method: prepare/);
  assert.doesNotThrow(() => assertBackend(Object.fromEntries(BACKEND_METHODS.map(m => [m, () => {}]))));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test spikes/project0/tests/backend.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `gpu/backend.js`**

```js
// spikes/project0/gpu/backend.js — the only surface gate drivers may depend on once a second backend exists.
export const BACKEND_METHODS = Object.freeze(['acquire', 'prepare', 'traceList', 'arith', 'prepareViewport', 'createRenderer', 'prepareResourceCheck', 'exerciseResources', 'injectLoss', 'onLoss', 'currentEpoch', 'destroy']);
export function assertBackend(obj) {
  for (const m of BACKEND_METHODS) if (typeof obj?.[m] !== 'function') throw new Error(`missing backend method: ${m}`);
  return obj;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test spikes/project0/tests/backend.test.mjs`
Expected: PASS, `# pass 1`.

- [ ] **Step 5: Write `gpu/WEBGL-MAPPING.md`, the frozen API mapping**

Write this table verbatim. Its rows are the spec §6 step 3 list.

| Concern | WebGPU (qualified path) | WebGL 2 equivalent (frozen before fallback qualification) |
|---|---|---|
| Hardware diagnostics | `adapter.info` + same-session `chrome://gpu` | `WEBGL_debug_renderer_info` `UNMASKED_VENDOR/RENDERER` + same-session `chrome://gpu` (WebGL row); same G1 corroboration rule |
| Compilation completion | `createComputePipelineAsync` | `KHR_parallel_shader_compile` `COMPLETION_STATUS_KHR` polling where available; otherwise prewarm all programs and measure the stall inside G2 |
| Tracing | compute `trace_list`/`view_band` into storage textures | fragment-shader marcher into `R32F`/`R32UI`/`RGBA16F` color attachments via MRT, rows bounded by scissor bands |
| GPU completion | `onSubmittedWorkDone` | `fenceSync` + non-blocking `clientWaitSync(…, 0)` polling per band; never `finish()` per measurement |
| Timing | timestamp queries if available, else completion + readback, labelled | `EXT_disjoint_timer_query_webgl2` if available, else fence completion + readback, labelled; optional, not a requirement |
| Readback | `copyTextureToBuffer` + `mapAsync` | `readPixels` into a `PIXEL_PACK_BUFFER` + fence, then `getBufferSubData` after the fence signals |
| Coverage counts | workgroup atomics in the shade pass | a reduction pass into a small texture, read back asynchronously via PBO + fence |
| Resource accounting | `createAllocator` (cap checked before allocation) | the same allocator interface and byte accounting per texture/renderbuffer/buffer; the same 1 GiB cap |
| Submission bounds | `Ledger` (≤ 2 outstanding per device session) + `createWatchdog` (5 s) | the same `Ledger` and watchdog, driven by fence completion |
| Loss and recovery | `device.lost`, `device.destroy()`, injected `signalLoss` (epoch advanced first) | `webglcontextlost`/`restored`, `WEBGL_lose_context.loseContext()`, injected `signalLoss` (epoch advanced first) |

Preserved without change: the mathematical workload, output semantics, fixtures, thresholds,
`gatePlan`, `decideBackends`, and the single remediation cycle.

- [ ] **Step 6: Stop at the boundary**

This is Codex's text, adopted. T11 freezes the WebGL API mapping and the backend interface.
From there:
- Execution stops at this boundary while Claude and Codex draft the conditional
  implementation addendum.
- The user approves that addendum before WebGL implementation begins.
- Until fallback qualification finishes, Project 0 has no selected backend and is not complete.
- Unattempted WebGL gates remain `not run`, and the interim overall outcome is `inconclusive`.

```bash
git add spikes/project0/gpu/backend.js spikes/project0/gpu/WEBGL-MAPPING.md spikes/project0/tests/backend.test.mjs
git commit -m "Project 0 T11: freeze the WebGL API mapping and backend interface; stop for the addendum"
```

Write `docs/reports/project0/interim-outcome.json` as
`{"outcome": "inconclusive", "next": "T11 addendum approval and WebGL qualification"}`. Then
report to the user.

---

---

### Task T12: Precision experiment (A.10/A.11) on the selected backend

**Owner:** Claude writes `compensated.wgsl` and the driver. Codex's T3 references define the
comparison. The interpretation is joint. This task runs only after `webgpu-decision.json`
records `WebGPU selected`. If WebGL 2 is selected instead, the T11 addendum supplies the
adapter. It is **not** a backend gate.

**Files:**
- `spikes/project0/gpu/compensated.wgsl`: the float-float primitives and the compensated bulb
  marcher `trace_ff_list`.
- `spikes/project0/browser/drivers/precision.js`: primitive validation, baseline and
  compensated traces, and the matched cost protocol.
- `spikes/project0/measure/precision.mjs`: `precisionMetrics()`, which recomputes everything
  from raw results and the frozen fixtures.
- `spikes/project0/precision.mjs`: the Node entry point. It uses the **selected**
  configuration and has a dedicated experiment result path.
- Test: `spikes/project0/tests/precision.test.mjs`.

**Interfaces:**
- Consumes:
  - T3/T4: `fixtures.precision.{distances, results[d], …}`, `fixtures.primitives`,
    `fixtures.costProtocol`, `fixtures.profiles.precision`;
  - `comparePrecision(set, actual, variant)` from `reference/preparation.js`, used unchanged;
  - T6: `traceList`, `upload`, `profileWords`, `source`, `compile`, `decodeTrace`;
  - T10: `docs/reports/project0/webgpu-decision.json`.
- Produces `precisionMetrics(fixtures, raw) → {validated, primitiveFailures, rows: [...], observedDisagreementThreshold, firstStop}`.

**Rules:**
- **Primitives:** Node takes primitive identities, arguments, expected values and tolerances
  **only** from `fixtures.primitives`. The page returns one `{hi, lo, thenHi, thenLo}` per
  frozen case, in order. Empty, partial, duplicate or non-finite results invalidate the
  experiment.
- **Matched timing:** both implementations use the same timing boundaries. Completed work
  excludes readback, which is measured separately. All ten measured work and readback samples
  are kept for each implementation, and medians and ranges are reported. The median of ten is
  the mean of the 5th and 6th sorted samples.
- **Incremental bytes:** these are the difference between the two implementations' fully
  accounted allocator peaks. Each is measured with its own allocator, including alignment,
  uniforms, staging and shared resources.
- **Latched stop:** the first A.10 stop latches. Later distances are reported as *not
  interpreted*, even if their local comparison would pass.
- **Configuration:** precision runs on the selected configuration (`args` from
  `webgpu-decision.json`), headed. Unexpected loss, page errors, identity failures or malformed
  evidence prevent interpretation.

**About the barrier.** The uniform-dependent expressions (`* barrier.one`) are an experimental
attempt to preserve the required rounding behaviour. WGSL gives no guarantee that this
construction prevents all harmful reassociation or fusion. Only the frozen GPU primitive checks
establish whether this prototype is validated on the selected configuration.

- [ ] **Step 1: Write the failing Node test**

```js
// spikes/project0/tests/precision.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { precisionMetrics, medianOf } from '../measure/precision.mjs';

const fx = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const f32bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];
const echo = (set, variant) => set.rows.flatMap(r => { const p = r[variant].primary; const code = { hit: 0, miss: 1, unresolved: 2, failure: 3 }[p.status]; return [code, p.status === 'unresolved' ? (p.reason === 'point' ? 1 : 2) : 0, p.status === 'miss' ? 0 : f32bits(p.t), Math.max(1, p.steps)]; });
const goodPrims = () => fx.primitives.map(p => { const v = p.value; const hi = Math.fround(v), lo = Math.fround(v - hi); return { hi, lo, thenHi: p.thenValue ?? 0, thenLo: 0 }; });
const sample = () => Array.from({ length: 10 }, (_, i) => 10 + i);
const raw = () => ({ primitives: goodPrims(), sets: fx.precision.results.map(set => ({ distance: set.distance, baseline: { words: echo(set, 'baselineInput'), workMs: sample(), readMs: sample(), peakBytes: 1000 }, compensated: { words: echo(set, 'compensatedInput'), workMs: sample(), readMs: sample(), peakBytes: 1500 } })) });

test('a perfect echo of the CPU references shows no disagreement at the first distance, with matched costs', () => {
  const m = precisionMetrics(fx, raw());
  assert.equal(m.validated, true);
  assert.equal(m.rows[0].baseline.vsBaselineInput.statusDisagreements, 0);
  assert.equal(m.rows[0].baseline.vsBaselineInput.largeDepthErrors, 0);
  assert.deepEqual(m.rows[0].cost.baseline.workMs, { median: 14.5, min: 10, max: 19, samples: 10 });
  assert.equal(m.rows[0].extraBytes, 500);
});

test('medianOf ten samples is the mean of the 5th and 6th sorted samples', () => {
  assert.equal(medianOf([9, 1, 8, 2, 7, 3, 6, 4, 5, 10]), 5.5);
});

test('primitive results are judged against the frozen fixture cases only', () => {
  const r = raw(); r.primitives[0] = { hi: 1, lo: 0, thenHi: 0, thenLo: 0 };          // a reassociated two_sum loses 2^-25
  assert.equal(precisionMetrics(fx, r).validated, false);
  const partial = raw(); partial.primitives.pop();
  assert.throws(() => precisionMetrics(fx, partial), /one result per frozen primitive case/);
  const nan = raw(); nan.primitives[1].lo = NaN;
  assert.throws(() => precisionMetrics(fx, nan), /finite/);
});

test('the first stop latches: later distances are not interpreted', () => {
  const stopAt = fx.precision.results.findIndex(s => s.stopReasons.length);
  const m = precisionMetrics(fx, raw());
  if (stopAt >= 0) assert.ok(m.rows.slice(stopAt).every(row => row.interpreted === false));
  else assert.equal(m.firstStop, null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test spikes/project0/tests/precision.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `measure/precision.mjs`.

- [ ] **Step 3: Implement `measure/precision.mjs`**

```js
// spikes/project0/measure/precision.mjs — A.10/A.11 interpretation, recomputed from raw results and frozen fixtures only.
import { comparePrecision } from '../reference/preparation.js';
import { decodeTrace } from './decode.mjs';

export function medianOf(xs) { const v = [...xs].sort((a, b) => a - b), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; }
const summary = xs => { if (!Array.isArray(xs) || !xs.length || !xs.every(Number.isFinite)) throw new Error('cost samples must be finite numbers'); return { median: medianOf(xs), min: Math.min(...xs), max: Math.max(...xs), samples: xs.length }; };

export function precisionMetrics(fx, raw) {
  const cases = fx.primitives;
  if (!Array.isArray(raw.primitives) || raw.primitives.length !== cases.length) throw new Error(`expected one result per frozen primitive case (${cases.length})`);
  const primitiveFailures = [];
  raw.primitives.forEach((got, i) => {
    const p = cases[i];
    for (const k of ['hi', 'lo', 'thenHi', 'thenLo']) if (typeof got?.[k] !== 'number' || !Number.isFinite(got[k])) throw new Error(`primitive case ${i}: ${k} must be finite`);
    const value = got.hi + got.lo;
    if (!(Math.abs(value - p.value) <= p.absoluteTolerance)) primitiveFailures.push(`${p.op}(${JSON.stringify(p.args)}): got ${value}, expected ${p.value}`);
    if ('thenAdd' in p && !(Math.abs(got.thenHi + got.thenLo - p.thenValue) <= p.absoluteTolerance)) primitiveFailures.push(`${p.op}: the low component was not retained (then ${got.thenHi + got.thenLo}, expected ${p.thenValue})`);
  });
  const validated = primitiveFailures.length === 0;
  if (!Array.isArray(raw.sets) || raw.sets.length !== fx.precision.results.length) throw new Error('one result set per frozen precision distance is required');
  const steps = fx.profiles.precision.steps; let firstStop = null;
  const rows = raw.sets.map((s, i) => {
    const set = fx.precision.results[i];
    if (s.distance !== set.distance) throw new Error('precision set order differs from the fixture');
    const baseline = decodeTrace(s.baseline.words, set.rows.length, { maxSteps: steps });
    const vsRequested = comparePrecision(set, baseline, 'requested'), vsBaselineInput = comparePrecision(set, baseline, 'baselineInput');
    if (firstStop === null && vsRequested.stopReasons.length) firstStop = { distance: set.distance, reasons: vsRequested.stopReasons };
    const row = { distance: set.distance, interpreted: firstStop === null, baseline: { vsRequested, vsBaselineInput },
      cost: { baseline: { workMs: summary(s.baseline.workMs), readMs: summary(s.baseline.readMs) }, compensated: { workMs: summary(s.compensated.workMs), readMs: summary(s.compensated.readMs) } },
      extraBytes: s.compensated.peakBytes - s.baseline.peakBytes };
    if (validated) { const comp = decodeTrace(s.compensated.words, set.rows.length, { maxSteps: steps }); row.compensated = { vsRequested: comparePrecision(set, comp, 'requested'), vsCompensatedInput: comparePrecision(set, comp, 'compensatedInput') }; }
    return row;
  });
  const threshold = rows.find(r => r.interpreted && r.baseline.vsRequested.thresholdExceeded === true)?.distance ?? null;
  return { validated, primitiveFailures, rows, observedDisagreementThreshold: threshold, firstStop };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test spikes/project0/tests/precision.test.mjs`
Expected: PASS, `# pass 4`, `# fail 0`.

- [ ] **Step 5: Write `gpu/compensated.wgsl`**

It is assembled after `fields.wgsl` and `trace.wgsl`, with `FIELD = 3`. `barrier` lives in
**group 1**, so that the automatic layouts have no empty group.

```wgsl
// spikes/project0/gpu/compensated.wgsl — A.11: pairs for O, t, p and the iterate; everything else ordinary f32.
// The `* barrier.one` factors are an experimental attempt to keep the required rounding; only the primitive checks validate it.
struct Barrier { one: f32, _a: f32, _b: f32, _c: f32 }
@group(1) @binding(0) var<uniform> barrier: Barrier;          // one = 1.0, opaque to the compiler
fn two_sum(a: f32, b: f32) -> vec2f { let s = (a + b) * barrier.one; let bb = (s - a) * barrier.one; return vec2f(s, (a - (s - bb)) + (b - bb)); }
fn quick_two_sum(a: f32, b: f32) -> vec2f { let s = (a + b) * barrier.one; return vec2f(s, b - (s - a) * barrier.one); }
fn split(a: f32) -> vec2f { let t = (4097.0 * a) * barrier.one; let hi = t - (t - a) * barrier.one; return vec2f(hi, a - hi); }
fn two_prod(a: f32, b: f32) -> vec2f {
  let p = (a * b) * barrier.one; let x = split(a); let y = split(b);
  return vec2f(p, ((x.x * y.x - p) + x.x * y.y + x.y * y.x) + x.y * y.y);
}
fn add_ff(a: vec2f, b: vec2f) -> vec2f {
  let s = two_sum(a.x, b.x); let t = two_sum(a.y, b.y);
  let u = quick_two_sum(s.x, s.y + t.x); return quick_two_sum(u.x, u.y + t.y);
}
fn mul_ff_f32(a: vec2f, b: f32) -> vec2f { let p = two_prod(a.x, b); return quick_two_sum(p.x, p.y + a.y * b); }

struct FF3 { x: vec2f, y: vec2f, z: vec2f }
fn bulb_eval_ff(p: FF3, cap: u32) -> Eval {
  var z = FF3(vec2f(0.0), vec2f(0.0), vec2f(0.0));
  var dr: f32 = 0.0;
  for (var n: u32 = 1u; n <= cap; n++) {
    let zf = vec3f(z.x.x + z.x.y, z.y.x + z.y.y, z.z.x + z.z.y);       // round_f32(z^ff)
    let r = length(zf);
    var w = vec3f(0.0); var grow: f32 = 0.0;
    if (r > 0.0) {
      let theta = acos(clamp(zf.z / r, -1.0, 1.0)); var phi: f32 = 0.0;
      if (zf.x != 0.0 || zf.y != 0.0) { phi = atan2(zf.y, zf.x); }
      let r2 = r * r; let r4 = r2 * r2; grow = 8.0 * r4 * r2 * r; let s = sin(8.0 * theta);
      w = (r4 * r4) * vec3f(s * cos(8.0 * phi), s * sin(8.0 * phi), cos(8.0 * theta));
    }
    if (!(dr < 1e34) && !derivative_fits(grow, dr)) { return Eval(ST_FAILURE, n, 0.0, 0.0); }
    dr = grow * dr + 1.0;
    z = FF3(add_ff(vec2f(w.x, 0.0), p.x), add_ff(vec2f(w.y, 0.0), p.y), add_ff(vec2f(w.z, 0.0), p.z));
    let big_r = length(vec3f(z.x.x + z.x.y, z.y.x + z.y.y, z.z.x + z.z.y));
    if (big_r > 2.0) { let lr = log(big_r); return Eval(ST_ESCAPED, n, lr, 0.5 * lr * big_r / dr); }
  }
  return Eval(ST_BUDGET, 0u, 0.0, 0.0);
}

@group(0) @binding(2) var<storage, read> origin_ff: array<vec2f, 3>;        // (hi, lo) per component, from CPU doubles
@group(0) @binding(3) var<storage, read> directions_f: array<vec4f>;          // d_ray, ordinary f32
@group(0) @binding(4) var<storage, read_write> results_ff: array<vec4u>;

@compute @workgroup_size(64)
fn trace_ff_list(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= prof.count) { return; }
  let i = prof.start + id.x; let d = directions_f[i].xyz;
  let o = vec3f(origin_ff[0].x + origin_ff[0].y, origin_ff[1].x + origin_ff[1].y, origin_ff[2].x + origin_ff[2].y);
  let iv = bound(o, d);
  var out = vec4u(RAY_MISS, WHY_NONE, 0u, 0u);
  if (iv.z != 0.0 && iv.y >= max(0.0, iv.x)) {
    var t = vec2f(max(0.0, iv.x), 0.0);
    var done = false;
    for (var step: u32 = 0u; step < prof.steps; step++) {
      if (t.x + t.y > iv.y) { out = vec4u(RAY_MISS, WHY_NONE, 0u, step); done = true; break; }
      let p = FF3(add_ff(origin_ff[0], mul_ff_f32(t, d.x)), add_ff(origin_ff[1], mul_ff_f32(t, d.y)), add_ff(origin_ff[2], mul_ff_f32(t, d.z)));
      let e = bulb_eval_ff(p, prof.iterations);
      let tt = t.x + t.y;
      if (e.status == ST_BUDGET) { out = vec4u(RAY_UNRESOLVED, WHY_POINT, bitcast<u32>(tt), step + 1u); done = true; break; }
      if (e.status == ST_FAILURE) { out = vec4u(RAY_FAILURE, WHY_NONE, bitcast<u32>(tt), step + 1u); done = true; break; }
      if (e.de < max(prof.floor, prof.factor * prof.alpha * tt)) { out = vec4u(RAY_HIT, WHY_NONE, bitcast<u32>(tt), step + 1u); done = true; break; }
      t = add_ff(t, vec2f(prof.k * e.de, 0.0));
    }
    if (!done) { out = select(vec4u(RAY_UNRESOLVED, WHY_STEPS, bitcast<u32>(t.x + t.y), prof.steps), vec4u(RAY_MISS, WHY_NONE, 0u, prof.steps), t.x + t.y > iv.y); }
  }
  results_ff[i] = out;
}

// Primitive validation. Case i: prim_in[2i] = (a.hi, a.lo, b.hi, b.lo), prim_in[2i+1] = (op, then.hi, then.lo, 0);
// op 0 = two_sum(a.hi, b.hi), 1 = add_ff(a, b), 2 = mul_ff_f32(a, b.hi). The produced pair feeds add_ff(r, then).
@group(0) @binding(5) var<storage, read> prim_in: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> prim_out: array<vec4f>;
@compute @workgroup_size(1)
fn primitives(@builtin(workgroup_id) wg: vec3u) {
  let v = prim_in[2u * wg.x]; let c = prim_in[2u * wg.x + 1u]; var r = vec2f(0.0);
  if (c.x == 0.0) { r = two_sum(v.x, v.z); } else if (c.x == 1.0) { r = add_ff(v.xy, v.zw); } else { r = mul_ff_f32(v.xy, v.z); }
  let then = add_ff(r, c.yz);
  prim_out[wg.x] = vec4f(r.x, r.y, then.x, then.y);
}
```

`trace_ff_list` uses group 0 (`prof` at binding 0, and bindings 2–4) and group 1
(`barrier`). `primitives` uses group 0 (bindings 5–6) and group 1. Neither leaves an empty
group in its automatic layout.

- [ ] **Step 6: Write `browser/drivers/precision.js` and `precision.mjs`**

```js
// spikes/project0/browser/drivers/precision.js — raw results only; Node interprets against the frozen fixtures.
import { acquire, destroy, onLoss } from '../../gpu/device.js';
import { prepare, upload, readBack, traceList, profileWords, source, compile } from '../../gpu/webgpu.js';
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog } from '../../gpu/watchdog.js';

const pair = v => (Array.isArray(v) ? v : [v, 0]);
const OP = { two_sum: 0, add_ff: 1, mul_ff_f32: 2 };

async function ffTrace({ device, alloc, watchdog, pipeline, barrier, profile, originPairs, directions, n }) {
  const owned = []; const keep = b => (owned.push(b), b);
  try {
    const o = keep(upload(device, alloc, new Float32Array(originPairs.flat()), GPUBufferUsage.STORAGE));
    const d = keep(upload(device, alloc, directions, GPUBufferUsage.STORAGE));
    const r = keep(alloc.buffer(device, { size: 16 * n, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
    const g1 = alloc.bindGroup(device.createBindGroup({ layout: pipeline.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: barrier } }] }));
    const inflight = []; const t0 = performance.now();
    for (let s0 = 0; s0 < n; s0 += 512) {
      while (inflight.length >= 2) await inflight.shift();
      if (watchdog.stopped) throw new Error('no observable progress for 5 s: experiment stopped by the watchdog');
      const count = Math.min(512, n - s0);
      const u = upload(device, alloc, profileWords(profile, s0, count, 0), GPUBufferUsage.UNIFORM);
      const g0 = alloc.bindGroup(device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 2, resource: { buffer: o } }, { binding: 3, resource: { buffer: d } }, { binding: 4, resource: { buffer: r } }] }));
      const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, g0); pass.setBindGroup(1, g1); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
      const done = watchdog.submitted(`ff:${s0}`, { s0 });
      device.queue.submit([enc.finish()]);
      inflight.push(device.queue.onSubmittedWorkDone().then(() => { done(); u.destroy(); }));
    }
    await Promise.all(inflight);
    const workMs = performance.now() - t0;
    const { bytes, ms } = await readBack(device, alloc, r, 16 * n);
    return { words: new Uint32Array(bytes), workMs, readMs: ms };
  } finally { for (const b of owned) b.destroy(); }
}

export async function run(gate, fx, params, status) {
  const losses = []; const off = onLoss(i => losses.push(i));
  const watchdog = createWatchdog();
  const { device } = await acquire();
  const shared = createAllocator({ capBytes: fx.resources.capBytes });
  try {
    const pipelines = await prepare(device, shared, status);
    const module = await compile(device, (await source('./fields.wgsl')) + (await source('./trace.wgsl')) + (await source('./compensated.wgsl')), 'compensated');
    const ff = shared.pipeline(await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'trace_ff_list', constants: { FIELD: 3 } } }));
    const prim = shared.pipeline(await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'primitives', constants: { FIELD: 3 } } }));
    const barrier = upload(device, shared, new Float32Array([1, 0, 0, 0]), GPUBufferUsage.UNIFORM);
    // 1. Primitive cases, in fixture order.
    const pin = new Float32Array(8 * fx.primitives.length);
    fx.primitives.forEach((c, i) => { const a = pair(c.args[0]), b = pair(c.args[1]), t = c.thenAdd ? pair(c.thenAdd) : [0, 0]; pin.set([a[0], a[1], b[0], b[1], OP[c.op], t[0], t[1], 0], 8 * i); });
    const pinB = upload(device, shared, pin, GPUBufferUsage.STORAGE), poutB = shared.buffer(device, { size: 16 * fx.primitives.length, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    { const enc = device.createCommandEncoder(), pass = enc.beginComputePass(); pass.setPipeline(prim);
      pass.setBindGroup(0, device.createBindGroup({ layout: prim.getBindGroupLayout(0), entries: [{ binding: 5, resource: { buffer: pinB } }, { binding: 6, resource: { buffer: poutB } }] }));
      pass.setBindGroup(1, device.createBindGroup({ layout: prim.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: barrier } }] }));
      pass.dispatchWorkgroups(fx.primitives.length); pass.end(); device.queue.submit([enc.finish()]); }
    const pout = new Float32Array((await readBack(device, shared, poutB, 16 * fx.primitives.length)).bytes);
    const primitives = fx.primitives.map((_, i) => ({ hi: pout[4 * i], lo: pout[4 * i + 1], thenHi: pout[4 * i + 2], thenLo: pout[4 * i + 3] }));
    // 2. Per distance: matched baseline and compensated runs, each with its own allocator for incremental bytes.
    const sets = [];
    for (const set of fx.precision.results) {
      status(`precision d=${set.distance}`);
      const n = set.rows.length;
      const dir3 = new Float32Array(3 * n), dir4 = new Float32Array(4 * n), org3 = new Float32Array(3 * n);
      set.rows.forEach((row, i) => { dir3.set(row.effectiveDirection, 3 * i); dir4.set([...row.effectiveDirection, 0], 4 * i); org3.set(set.roundedOrigin, 3 * i); });
      const result = { distance: set.distance, baseline: { workMs: [], readMs: [] }, compensated: { workMs: [], readMs: [] } };
      const baseAlloc = createAllocator({ capBytes: fx.resources.capBytes }), compAlloc = createAllocator({ capBytes: fx.resources.capBytes });
      for (let k = 0; k < fx.costProtocol.warmups + fx.costProtocol.measured; k++) {
        const b = await traceList({ device, alloc: baseAlloc, watchdog, pipelines, field: 'bulb', profile: fx.profiles.precision, origins: org3, directions: dir3, label: `precision-base:${set.distance}` });
        const c = await ffTrace({ device, alloc: compAlloc, watchdog, pipeline: ff, barrier, profile: fx.profiles.precision, originPairs: set.originPairs, directions: dir4, n });
        if (k >= fx.costProtocol.warmups) { result.baseline.workMs.push(b.workMs); result.baseline.readMs.push(b.readMs); result.compensated.workMs.push(c.workMs); result.compensated.readMs.push(c.readMs); }
        result.baseline.words = Array.from(b.words); result.compensated.words = Array.from(c.words);
      }
      result.baseline.peakBytes = baseAlloc.inventory().peakBytes; result.compensated.peakBytes = compAlloc.inventory().peakBytes;
      sets.push(result);
    }
    return { slots: [{ slot: 'precision', raw: { primitives, sets, losses, stall: watchdog.stall } }], invalidations: [...losses.map(l => `device lost: ${l.reason}`), ...(watchdog.stall ? ['no observable progress for 5 s'] : [])] };
  } finally { off(); watchdog.dispose(); shared.destroyAll(); destroy(); }
}
```

```js
// spikes/project0/precision.mjs — node spikes/project0/precision.mjs ; on the selected configuration, headed.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './launch.mjs';
import { runSession } from './run.mjs';
import { precisionMetrics } from './measure/precision.mjs';

const decision = JSON.parse(await readFile(resolve(ROOT, 'docs/reports/project0/webgpu-decision.json'), 'utf8'));
if (decision.decision.outcome !== 'WebGPU selected') throw new Error(`precision runs only on a selected backend (decision: ${decision.decision.outcome})`);
const fx = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
const { records, runDir } = await runSession({ gate: 'precision', mode: 'headed', args: decision.args, campaign: 'precision' });
const record = records[0];
const out = { record: record.id, runDir: runDir.split('/').at(-1), args: decision.args, invalidations: record.invalidations };
if (record.invalidations.length || record.slot !== 'precision') {
  out.interpretable = false;                                      // loss, page error, identity failure or a stopped watchdog
} else {
  const raw = JSON.parse(await readFile(resolve(ROOT, 'artifacts/project0', record.artifacts.find(a => a.path.endsWith('.raw.json')).path), 'utf8'));
  try { Object.assign(out, { interpretable: true, ...precisionMetrics(fx, raw) }); } catch (e) { out.interpretable = false; out.invalidations = [...out.invalidations, `malformed precision evidence: ${e.message}`]; }
}
await mkdir(resolve(ROOT, 'docs/reports/project0'), { recursive: true });
await writeFile(resolve(ROOT, 'docs/reports/project0/precision.json'), JSON.stringify(out, null, 2));
if (!out.interpretable) console.log(`NOT INTERPRETABLE: ${out.invalidations.join('; ')}`);
else {
  if (!out.validated) console.log(`UNVALIDATED (compensation not interpreted): ${out.primitiveFailures.join('; ')}`);
  for (const r of out.rows) console.log(`d=${r.distance}: ${r.interpreted ? '' : '(not interpreted) '}baseline exceeded=${r.baseline.vsRequested.thresholdExceeded}${r.compensated ? `, compensated exceeded=${r.compensated.vsRequested.thresholdExceeded}` : ''}, work median ms base=${r.cost.baseline.workMs.median.toFixed(2)} ff=${r.cost.compensated.workMs.median.toFixed(2)}, extra bytes ${r.extraBytes}`);
  console.log(`observed disagreement threshold against the CPU reference: ${out.observedDisagreementThreshold ?? 'not reached within tested distances'}${out.firstStop ? `; first stop at d=${out.firstStop.distance} (${out.firstStop.reasons.join(', ')})` : ''}`);
}
```

- [ ] **Step 7: Commit, run, interpret jointly, and commit the result**

```bash
git add spikes/project0/gpu/compensated.wgsl spikes/project0/browser/drivers/precision.js spikes/project0/measure/precision.mjs spikes/project0/precision.mjs spikes/project0/tests/precision.test.mjs
git commit -m "Project 0 T12: compensated prototype and precision experiment with matched costs and fixture-only validation"
node spikes/project0/precision.mjs
```

Expected:
- **`NOT INTERPRETABLE: …`:** recorded as such. Do not invent a result.
- **`UNVALIDATED`:** the compensation is not interpreted, and the baseline is still reported.
- **Otherwise:** one line per distance, then the observed disagreement threshold.

A measured absence of improvement from compensation is a valid outcome.

Send the table to Codex, log the exchange, and agree the wording of the precision section. Then:

```bash
git add docs/reports/project0/precision.json
git commit -m "Project 0 T12: precision experiment results"
```

---

### Task T13: Reproducible report, joint evidence review and user handoff

**Owner:** Claude and Codex jointly.

**Files:**
- `spikes/project0/report.mjs`: `renderReport()` plus an executable CLI. The CLI loads,
  validates and recomputes everything, writes the report, and exits nonzero on any
  inconsistency.
- `docs/reports/<date>-project0-qualification.md` and `docs/reports/<date>-project0-results.json`.
- Test: `spikes/project0/tests/report.test.mjs`. It renders the report, then invokes the CLI
  against a synthetic evidence tree and checks that forged or damaged evidence is rejected.

**Interfaces:**
- Consumes:
  - T10: `loadCampaign`, `checkCoherence`, `recompute`, `qualify`, and the
    `webgpu-decision.json` written by `close-remediation.mjs`;
  - T12: `precision.json` and `precisionMetrics`;
  - T5: `sha256`.
- Produces:
  - `renderReport({decision, backend, precision, unsafeFlag}) → markdown`. It throws if the
    decision does not follow from the gate statuses;
  - `buildReport({root, decisionPath, date}) → {markdown, results}`;
  - the CLI `node spikes/project0/report.mjs --decision <path> [--date YYYY-MM-DD]`. `P0_ROOT`
    overrides the repository root, which the integration test uses.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/report.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../launch.mjs';
import { renderReport } from '../report.mjs';
import { sha256 } from '../evidence.mjs';
import { canonical, GATES } from '../contract.js';

const run = promisify(execFile);
const pass = Object.fromEntries(GATES.map(g => [g, { status: 'pass', reasons: [] }]));

test('the report restates the mechanical decision and refuses inconsistent inputs', () => {
  const md = renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates: pass, remediationClosed: true }, precision: null, unsafeFlag: false });
  assert.match(md, /Outcome: \*\*WebGPU selected\*\*/);
  assert.throws(() => renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates: { ...pass, G8: { status: 'fail', reasons: ['x'] } }, remediationClosed: true } }), /decision does not follow/);
  assert.match(renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates: pass, remediationClosed: true }, unsafeFlag: true }), /depends on `--enable-unsafe-webgpu`/);
});

// A synthetic evidence tree: one valid G4 record; every other gate 'not run'. The honest decision is inconclusive.
async function tree() {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'p0-report-test-'));
  const eligible = () => Array.from({ length: 4096 }, (_, id) => ({ id, eligible: true, reference: { status: 'budget', index: null, logR: null, de: null } }));
  const fixtures = { analytic: {}, arithmetic: { bulb: eligible(), plane: eligible() }, profiles: { g3: { steps: 512 } },
    arithmeticProtocol: { bulb: { iterations: 64, tolerances: { logR: 1e-4, de: 1e-3 } }, plane: { iterations: 128, tolerances: { logR: 1e-5 } } } };
  await mkdir(join(root, 'spikes/project0'), { recursive: true });
  await writeFile(join(root, 'spikes/project0/fixtures.json'), JSON.stringify(fixtures));
  const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode: 'headless' };
  const raw = JSON.stringify({ words: Array.from({ length: 4 * 4096 }, (_, i) => (i % 4 === 0 ? 1 : 0)) });
  await mkdir(join(root, 'artifacts/project0/run1'), { recursive: true });
  await writeFile(join(root, 'artifacts/project0/run1/G4-r.raw.json'), raw);
  const metrics = { samples: 4096, eligible: 4096, diagnostics: 0, statusErrors: 0, indexErrors: 0, logRRatio: 0, deRatio: 0 };
  const record = { schema: 1, id: 'G4-r', gate: 'G4', slot: 'bulb-samples', campaign: 'm', mode: 'headless', experiment: false, identity, invalidations: [], metrics, artifacts: [{ path: 'run1/G4-r.raw.json', sha256: sha256(raw) }] };
  await writeFile(join(root, 'artifacts/project0/run1/G4-r.json'), canonical(record));
  const manifest = { fixture: { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) }, campaign: 'm', args: 'attempt1', runDirs: ['run1'],
    trials: { 'G4/bulb-samples': { id: 'G4-r', identity } }, notRun: Object.fromEntries(GATES.filter(g => g !== 'G4').map(g => [g, { status: 'not run', reason: 'synthetic' }])), reuse: [] };
  await mkdir(join(root, 'docs/reports/project0'), { recursive: true });
  const mText = JSON.stringify(manifest), hText = '## Classification\nnone\n## Change set\nnone\n';
  await writeFile(join(root, 'docs/reports/project0/m-manifest.json'), mText);
  await writeFile(join(root, 'docs/reports/project0/history.md'), hText);
  const decision = { backend: 'webgpu', manifest: 'docs/reports/project0/m-manifest.json', manifestSha256: sha256(mText), history: 'docs/reports/project0/history.md', historySha256: sha256(hText), args: 'attempt1', unsafeFlag: false, decision: { outcome: 'inconclusive' } };
  await writeFile(join(root, 'docs/reports/project0/webgpu-decision.json'), JSON.stringify(decision));
  return { root, decision };
}
const cli = root => run(process.execPath, [resolve(ROOT, 'spikes/project0/report.mjs'), '--decision', 'docs/reports/project0/webgpu-decision.json', '--date', '2026-10-18'], { env: { ...process.env, P0_ROOT: root } });

test('the CLI writes both outputs from verified, recomputed evidence', async () => {
  const { root } = await tree();
  try {
    await cli(root);
    assert.match(await readFile(join(root, 'docs/reports/2026-10-18-project0-qualification.md'), 'utf8'), /Outcome: \*\*inconclusive\*\*/);
    const results = JSON.parse(await readFile(join(root, 'docs/reports/2026-10-18-project0-results.json'), 'utf8'));
    assert.equal(results.gates.G4.status, 'pass'); assert.equal(results.records[0].id, 'G4-r');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the CLI rejects altered artefacts, missing raw evidence, forged stop entries and a decision that does not follow', async () => {
  for (const damage of [
    async ({ root }) => writeFile(join(root, 'artifacts/project0/run1/G4-r.raw.json'), '{"words":[]}'),
    async ({ root }) => { const p = join(root, 'artifacts/project0/run1/G4-r.json'); const r = JSON.parse(await readFile(p, 'utf8')); r.artifacts = []; await writeFile(p, canonical(r)); },
    async ({ root, decision }) => { const p = join(root, 'docs/reports/project0/m-manifest.json'); const m = JSON.parse(await readFile(p, 'utf8')); m.notRun.G5 = { status: 'pass', reason: 'forged' }; const t = JSON.stringify(m); await writeFile(p, t); decision.manifestSha256 = sha256(t); await writeFile(join(root, 'docs/reports/project0/webgpu-decision.json'), JSON.stringify(decision)); },
    async ({ root, decision }) => { decision.decision.outcome = 'WebGPU selected'; await writeFile(join(root, 'docs/reports/project0/webgpu-decision.json'), JSON.stringify(decision)); },
  ]) {
    const t = await tree();
    try { await damage(t); await assert.rejects(cli(t.root)); } finally { await rm(t.root, { recursive: true, force: true }); }
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test spikes/project0/tests/report.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/report.mjs`.

- [ ] **Step 3: Implement `report.mjs`**

```js
// spikes/project0/report.mjs — renders the qualification report from verified, recomputed evidence; exits nonzero on any inconsistency.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { decideBackends } from './decision.js';
import { ROOT } from './launch.mjs';
import { sha256 } from './evidence.mjs';
import { canonical } from './contract.js';
import { loadCampaign, checkCoherence, recompute, qualify } from './qualify.mjs';
import { precisionMetrics } from './measure/precision.mjs';

export function renderReport({ decision, backend, webgl = null, precision = null, unsafeFlag = false }) {
  const again = decideBackends(backend, webgl);
  if (again.outcome !== decision.outcome) throw new Error(`decision does not follow from the gate statuses (${again.outcome} vs ${decision.outcome})`);
  const rows = Object.entries(backend.gates).map(([g, r]) => `| ${g} | ${r.status} | ${(r.reasons || []).join('; ').replace(/\|/g, '\\|') || '—'} |`);
  const precisionText = !precision ? 'Not run: no backend was selected, or the experiment could not run safely (see the decision record).'
    : !precision.interpretable ? `Not interpretable: ${precision.invalidations.join('; ')}`
    : [`Primitive validation: ${precision.validated ? 'passed' : `**failed** — compensation not interpreted (${precision.primitiveFailures.join('; ')})`}.`,
       `Observed disagreement threshold against the CPU reference: ${precision.observedDisagreementThreshold ?? 'not reached within the tested distances'}${precision.firstStop ? `; interpretation stopped at d=${precision.firstStop.distance} (${precision.firstStop.reasons.join(', ')})` : ''}.`,
       '', '| d | interpreted | baseline exceeded | compensated exceeded | work median ms (base / ff) | extra bytes |', '|---|---|---|---|---|---|',
       ...precision.rows.map(r => `| ${r.distance} | ${r.interpreted} | ${r.baseline.vsRequested.thresholdExceeded} | ${r.compensated?.vsRequested.thresholdExceeded ?? '—'} | ${r.cost.baseline.workMs.median.toFixed(2)} / ${r.cost.compensated.workMs.median.toFixed(2)} | ${r.extraBytes} |`)].join('\n');
  return ['# Project 0 — Space Backend Qualification Report', '', `Outcome: **${decision.outcome}**`, '',
    unsafeFlag ? '> **The selection depends on `--enable-unsafe-webgpu`.** Space would require a Chrome flag that ordinary users do not set. This is the user\'s decision to accept or reject.\n' : '',
    '| Gate | Status | Reasons |', '|---|---|---|', ...rows, '', '## Precision experiment (not a backend gate)', '', precisionText, ''].join('\n');
}

export async function buildReport({ root, decisionPath, date }) {
  const decision = JSON.parse(await readFile(resolve(root, decisionPath), 'utf8'));
  if (sha256(await readFile(resolve(root, decision.manifest))) !== decision.manifestSha256) throw new Error('the manifest changed after the decision was recorded');
  if (sha256(await readFile(resolve(root, decision.history))) !== decision.historySha256) throw new Error('the remediation history changed after the decision was recorded');
  const fixtures = JSON.parse(await readFile(resolve(root, 'spikes/project0/fixtures.json'), 'utf8'));
  const { manifest, records } = await loadCampaign(decision.manifest, { root });
  checkCoherence(records, manifest);
  await recompute(records, fixtures, { root });
  const { backend, decision: recomputed } = qualify(manifest, records, fixtures, { remediationClosed: true });
  if (recomputed.outcome !== decision.decision.outcome) throw new Error(`recorded decision ${decision.decision.outcome} does not follow from the evidence (${recomputed.outcome})`);
  let precision = null;
  const precisionPath = resolve(root, 'docs/reports/project0/precision.json');
  if (existsSync(precisionPath)) {
    precision = JSON.parse(await readFile(precisionPath, 'utf8'));
    if (precision.interpretable) {
      const dir = join(root, 'artifacts/project0', precision.runDir);
      const record = JSON.parse(await readFile(join(dir, `${precision.record}.json`), 'utf8'));
      const rawArtifact = record.artifacts.find(a => a.path.endsWith('.raw.json'));
      const bytes = await readFile(join(root, 'artifacts/project0', rawArtifact.path));
      if (sha256(bytes) !== rawArtifact.sha256) throw new Error('precision raw artefact hash mismatch');
      const again = precisionMetrics(fixtures, JSON.parse(bytes));
      if (canonical(again.rows) !== canonical(precision.rows) || again.validated !== precision.validated) throw new Error('precision results do not recompute from their raw evidence');
    }
  }
  const markdown = renderReport({ decision: decision.decision, backend, precision, unsafeFlag: decision.unsafeFlag });
  const results = { date, decision: decision.decision, unsafeFlag: decision.unsafeFlag, args: decision.args, gates: Object.fromEntries(Object.entries(backend.gates).map(([g, r]) => [g, { status: r.status, reasons: r.reasons }])),
    records: records.map(r => ({ id: r.id, gate: r.gate, slot: r.slot, metrics: r.metrics, identity: r.identity, artifacts: r.artifacts })), precision: precision?.interpretable ? { validated: precision.validated, observedDisagreementThreshold: precision.observedDisagreementThreshold, firstStop: precision.firstStop } : null };
  return { markdown, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { decision: { type: 'string' }, date: { type: 'string', default: new Date().toISOString().slice(0, 10) } } });
  const root = process.env.P0_ROOT ? resolve(process.env.P0_ROOT) : ROOT;
  try {
    const { markdown, results } = await buildReport({ root, decisionPath: values.decision, date: values.date });
    await mkdir(resolve(root, 'docs/reports'), { recursive: true });
    await writeFile(resolve(root, `docs/reports/${values.date}-project0-qualification.md`), markdown);
    await writeFile(resolve(root, `docs/reports/${values.date}-project0-results.json`), JSON.stringify(results, null, 2));
    console.log(`report written: docs/reports/${values.date}-project0-qualification.md (${results.decision.outcome})`);
  } catch (error) { console.error(`REPORT REFUSED: ${error.message}`); process.exitCode = 1; }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/report.test.mjs`
Expected: PASS, `# pass 3`, `# fail 0`.

- [ ] **Step 5: Commit the report tool, generate the report, review it jointly, hand it to the user**

```bash
git add spikes/project0/report.mjs spikes/project0/tests/report.test.mjs
git commit -m "Project 0 T13: report CLI that verifies, recomputes and refuses inconsistent evidence"
node spikes/project0/report.mjs --decision docs/reports/project0/webgpu-decision.json
```

Expected:
- `report written: docs/reports/<date>-project0-qualification.md (<outcome>)`;
- or `REPORT REFUSED: …`, which is a finding to resolve, never to bypass.

1. **The narrative sections.** Claude drafts them: the environment, the remediation history,
   the visible-output captures (the `visible` experiment's record), the interpretation and the
   limitations.
2. **Codex reviews** the report as co-author (READY / NOT READY), and the exchange is logged
   verbatim.
3. **Archive** both logs to `docs/codesign/`.
4. **Commit:**

```bash
git add docs/reports/ docs/codesign/
git commit -m "Project 0 T13: qualification report, results summary and co-design log"
```

5. **Present** the outcome to the user:
   - the mechanically derived decision;
   - any dependence on `--enable-unsafe-webgpu`;
   - the precision finding;
   - the next step: the Project 1a/1b specs after a selected backend, or resolving the reported
     limitation after a no-go or inconclusive outcome.
