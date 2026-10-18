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

**Authors:** Claude and Codex as peers, following the AGENTS.md/CLAUDE.md collaboration protocol.
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
   an occupied port without the harness identity, a reused profile (including a warm shader
   cache that would falsify G2), or cleanup of processes it does not own. *T0.*
5. **External interference silently changes the timing semantics:** a hidden or unfocused
   window, delayed burst issuance, a device-pixel ratio other than 1, or a mis-sized canvas
   backing. These produce explicit invalidation records, never quiet numbers. *T9.*

---
## Task overview

| Task | Deliverable | Owner | Depends on |
|---|---|---|---|
| T0 | Launcher, server/profile ownership, no-GPU preflight | Claude | — |
| T1 | Evidence contracts, metrics, gate evaluators, decision procedure | Codex | T0 |
| T2 | Independent arithmetic references, exact f32-range policy | Codex | T1 |
| T3 | CPU geometry, tracing, sensitivity screen, precision preparation | Codex | T2 |
| T4 | Fixture generation, audit, reproduction, **freeze commit** | Codex (generator), Claude (runs) | T0–T3 |
| T5 | Evidence identity, WebGPU device module, **first GPU run** (probe) | Claude | T4 |
| T6 | WGSL arithmetic and ray-list kernels; G3–G5 checks; gate runner | Claude | T5 |
| T7 | Band scheduler, camera-mode marcher, shading/coverage, presentation | Claude | T6 |
| T8 | Resource accounting and A.8 verification (G11); loss/recovery (G13) | Claude | T7 |
| T9 | In-page timing drivers (G1, G2, G6–G10, G12) and metric derivation | Claude | T7, T8 |
| T10 | Formal WebGPU campaign, selection manifest, single remediation cycle | Claude runs; joint decisions | T1, T9 |
| T11 | *Conditional:* WebGL API mapping + backend interface; stop for addendum | Joint | WebGPU unqualified after T10 |
| T12 | Precision experiment on the selected backend | Claude (WGSL/driver); joint interpretation | backend selected |
| T13 | Reproducible report, joint review, user handoff | Joint | T10 (and T11/T12 as applicable) |

The plan implements WebGPU qualification and the fallback **planning boundary**; it does not contain the conditional WebGL implementation, which is a separately reviewed and user-approved addendum (T11).

---

### Task T0: Launcher, server ownership and environment preflight (no GPU device)

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).

**Files:**
- Create: `spikes/project0/launch.mjs`, the Node launcher (profile, server ownership, Chrome
  launch, effective command line).
- Create: `spikes/project0/preflight.mjs`, the T0 entry point.
- Create: `spikes/project0/index.html`, the harness page, carrying the identity marker.
- Create: `spikes/project0/browser/main.js`, the page entry. In T0 it handles only
  `?mode=preflight`.
- Test: `spikes/project0/tests/launch.test.mjs`.

**Interfaces:**
- Consumes: nothing.
- Produces, used by T5–T13:
  - `ROOT: string`, the repository root;
  - `ATTEMPT1_ARGS: readonly string[]`;
  - `HARNESS_PATH = '/spikes/project0/index.html'`;
  - `freshProfile(kind: string, opts?) → Promise<string>`: absolute path to a new, empty
    directory `artifacts/runtime/project0-<kind>-<stamp>-<rand>`. It throws if the directory
    already exists or is not empty;
  - `ensureServer({port?, fetchFn?, spawnFn?, readFileFn?}) → Promise<{url, owned, stop()}>`:
    reuses a server only if it serves *this checkout's* `index.html` byte for byte; otherwise
    it throws. `stop()` terminates only a server this call spawned;
  - `launchChrome({headless, args?, profileKind, chromium}) → Promise<{context, profile, requestedArgs, headless}>`:
    always `channel: 'chrome'`, `chromiumSandbox: true`, viewport 1280 × 720,
    `deviceScaleFactor: 1`;
  - `effectiveCommandLine(context) → Promise<string>`, read from `chrome://version`;
  - `assertSandboxed(commandLine: string) → void`: throws if `--no-sandbox` or
    `--disable-gpu-watchdog` is present.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/launch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { ROOT, freshProfile, ensureServer, assertSandboxed, ATTEMPT1_ARGS } from '../launch.mjs';

async function scratchRoot() {
  const base = resolve(ROOT, 'artifacts/runtime');
  await mkdir(base, { recursive: true });
  return mkdtemp(join(base, 'p0-launch-test-'));
}

test('attempt-1 flags are exactly the documented Vulkan set', () => {
  assert.deepEqual([...ATTEMPT1_ARGS], ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']);
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

const okBody = '<!doctype html><meta name="atlas-harness" content="project0">';
const response = body => ({ ok: true, text: async () => body });

test('ensureServer rejects a port that serves anything other than this checkout', async () => {
  await assert.rejects(
    ensureServer({ fetchFn: async () => response('hello'), readFileFn: async () => okBody }),
    /not this checkout/);
});

test('ensureServer reuses a matching server without owning it', async () => {
  let spawned = false;
  const server = await ensureServer({ fetchFn: async () => response(okBody), readFileFn: async () => okBody, spawnFn: () => { spawned = true; } });
  assert.equal(server.owned, false); assert.equal(spawned, false);
  await server.stop();
});

test('ensureServer spawns when nothing listens, and stop() kills only that child', async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), killed: [], kill(sig) { this.killed.push(sig); } });
  let calls = 0;
  const fetchFn = async () => { if (calls++ === 0) throw new Error('ECONNREFUSED'); return response(okBody); };
  const spawnFn = (cmd, args) => { assert.deepEqual(args.slice(0, 1), ['scripts/serve.mjs']); setImmediate(() => child.stdout.emit('data', 'ready')); return child; };
  const server = await ensureServer({ fetchFn, spawnFn, readFileFn: async () => okBody });
  assert.equal(server.owned, true);
  await server.stop();
  assert.deepEqual(child.killed, ['SIGTERM']);
});

test('assertSandboxed rejects a command line without the sandbox or watchdog', () => {
  assert.doesNotThrow(() => assertSandboxed('/opt/google/chrome/chrome --enable-gpu --use-angle=vulkan'));
  assert.throws(() => assertSandboxed('/opt/google/chrome/chrome --no-sandbox --enable-gpu'), /sandbox/);
  assert.throws(() => assertSandboxed('chrome --disable-gpu-watchdog'), /watchdog/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/launch.test.mjs`
Expected: FAIL with `Cannot find module '.../spikes/project0/launch.mjs'`.

- [ ] **Step 3: Implement `launch.mjs`**

```js
// spikes/project0/launch.mjs — Node-side launcher. Never requests a GPU adapter or device.
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ATTEMPT1_ARGS = Object.freeze(['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']);
export const HARNESS_PATH = '/spikes/project0/index.html';

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

export async function ensureServer({ port = 5173, fetchFn = fetch, spawnFn = nodeSpawn, readFileFn = path => readFile(path, 'utf8'), root = ROOT } = {}) {
  const url = `http://127.0.0.1:${port}`;
  const local = await readFileFn(resolve(root, `.${HARNESS_PATH}`));
  const servesThisCheckout = async () => { const res = await fetchFn(url + HARNESS_PATH); return res.ok && (await res.text()) === local; };
  let listening = true;
  try { await fetchFn(url + HARNESS_PATH); } catch { listening = false; }
  if (listening) {
    if (!(await servesThisCheckout())) throw new Error(`port ${port} serves something that is not this checkout's Project 0 harness`);
    return { url, owned: false, stop: async () => {} };
  }
  const child = spawnFn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((done, fail) => {
    child.stdout.once('data', done);
    child.once('error', fail);
    child.once('exit', code => fail(new Error(`server exited (${code})`)));
  });
  if (!(await servesThisCheckout())) { child.kill('SIGTERM'); throw new Error('spawned server is not serving this checkout'); }
  return { url, owned: true, stop: async () => { child.kill('SIGTERM'); } };
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

- [ ] **Step 4: Create the harness page and the preflight-only entry**

```html
<!-- spikes/project0/index.html -->
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="atlas-harness" content="project0">
<title>ATLAS Project 0 harness</title>
<style>html,body{margin:0;background:#050508;color:#ccd;font:13px system-ui}#status{position:fixed;left:8px;top:8px}canvas{display:block;width:1280px;height:720px}</style>
<div id="status">loading…</div>
<canvas id="view" width="1280" height="720"></canvas>
<script type="module" src="./browser/main.js"></script>
</html>
```

```js
// spikes/project0/browser/main.js — T0: preflight mode only. Never touches navigator.gpu methods.
const params = new URLSearchParams(location.search);
const status = document.getElementById('status');
if (params.get('mode') === 'preflight') {
  window.p0Preflight = {
    isSecureContext, hasGpuObject: 'gpu' in navigator, userAgent: navigator.userAgent,
    devicePixelRatio, inner: [innerWidth, innerHeight], visibility: document.visibilityState,
  };
  status.textContent = 'preflight: no GPU device requested';
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/launch.test.mjs`
Expected: PASS, `# pass 6`, `# fail 0`.

- [ ] **Step 6: Write the preflight entry point**

```js
// spikes/project0/preflight.mjs — environment preflight. No adapter, no device, no shaders.
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, HARNESS_PATH, ensureServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';

process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
const record = { kind: 'preflight', at: new Date().toISOString(), node: process.version, checks: [] };
record.playwright = createRequire(import.meta.url)('playwright/package.json').version;
record.chrome = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
const server = await ensureServer();
let failed = false;
try {
  const js = await fetch(`${server.url}/spikes/project0/browser/main.js`);
  record.checks.push({ name: 'module-mime', contentType: js.headers.get('content-type') });
  if (!/^text\/javascript/.test(js.headers.get('content-type') || '')) failed = true;
  for (const headless of [false, true]) {
    const { context, profile, requestedArgs } = await launchChrome({ headless, profileKind: headless ? 'preflight-headless' : 'preflight-headed', chromium });
    try {
      const commandLine = await effectiveCommandLine(context);
      assertSandboxed(commandLine);
      const page = await context.newPage();
      await page.goto(`${server.url}${HARNESS_PATH}?mode=preflight`);
      const env = await page.waitForFunction(() => window.p0Preflight).then(h => h.jsonValue());
      record.checks.push({ name: headless ? 'headless' : 'headed', profile, requestedArgs, commandLine, env });
      if (!env.isSecureContext || env.devicePixelRatio !== 1) failed = true;
    } finally { await context.close(); }
  }
} catch (error) { record.error = error.message; failed = true; }
finally { await server.stop(); }
const dir = resolve(ROOT, 'artifacts/project0/preflight');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, `${record.at.replace(/[-:.]/g, '')}.json`), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record.checks.map(c => ({ name: c.name, ...(c.env ? { hasGpuObject: c.env.hasGpuObject, secure: c.env.isSecureContext } : { contentType: c.contentType }) })), null, 2));
if (failed) { console.error(`PREFLIGHT FAILED${record.error ? `: ${record.error}` : ''}`); process.exitCode = 1; } else console.log('PREFLIGHT OK');
```

- [ ] **Step 7: Run the preflight**

Run: `node spikes/project0/preflight.mjs`
Expected:
- `PREFLIGHT OK`;
- a `module-mime` entry with `text/javascript`;
- `headed` and `headless` entries with `secure: true`;
- a record written under `artifacts/project0/preflight/`.

`hasGpuObject` is recorded as information for T5, not as a pass or fail. If `PREFLIGHT FAILED`
says Chrome could not launch under the available permissions, stop: that is evidence for an
*inconclusive* outcome, not something to work around.

- [ ] **Step 8: Commit** (Claude, after Codex's read-only review of the diff)

```bash
git add spikes/project0/launch.mjs spikes/project0/preflight.mjs spikes/project0/index.html spikes/project0/browser/main.js spikes/project0/tests/launch.test.mjs
git commit -m "Project 0 T0: launcher with server/profile ownership and no-GPU environment preflight"
```

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

### Task T5: WebGPU hardware probe, evidence identity and device lifecycle (first GPU run, after the freeze)

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).
**Precondition:** the T4 freeze commit exists. Step 1 asserts this mechanically.

**Files:**
- Create: `spikes/project0/evidence.mjs` (Node). Builds evidence identities, hashes artefacts
  and writes records in the T1 schema.
- Create: `spikes/project0/gpu/device.js` (browser). Acquires the adapter and device, records
  diagnostics, and owns the loss hook and device epoch.
- Create: `spikes/project0/gpu/probe.wgsl`. A bounded compute dispatch over a non-divisible
  element count.
- Modify: `spikes/project0/browser/main.js`. Adds `?mode=probe`.
- Create: `spikes/project0/probe.mjs` (Node entry point). Runs headed and headless, captures
  `chrome://gpu`, and writes records.
- Test: `spikes/project0/tests/evidence.test.mjs`.

**Interfaces:**
- Consumes:
  - T0: `ensureServer`, `launchChrome`, `effectiveCommandLine`, `assertSandboxed`,
    `HARNESS_PATH`, `ROOT`;
  - T1: `canonical`, the record schema, `ARITH_STATUS`/`RAY_STATUS`;
  - T4: `spikes/project0/fixtures.json` and its freezing commit.
- Produces (used by T6–T13):
  - `sha256(bytes|string) → hex64`;
  - `fixtureIdentity() → {fixtureHash, fixtureCommit, specHash}`. It throws if `fixtures.json`
    has uncommitted changes, or if no commit contains it;
  - `implementationIdentity() → {implementationCommit, implementationHash}`. The hash covers
    every file under `spikes/project0/` except `fixtures*.json` and `tests/`, in sorted path
    order. It throws if any of them has uncommitted changes;
  - `launchIdentity({requestedArgs, mode, commandLine}) → {launchHash, mode}`;
  - `environmentIdentity(chromeGpuText) → {browserVersion, browserExecutable, driver, session}`;
  - `newRunDir(label) → absolute path` of the form `artifacts/project0/<iso>-<label>/`;
  - `writeRecord(runDir, record, artifacts: {name, data}[]) → record`. It writes each artefact,
    fills `record.artifacts` with `{path, sha256}`, then writes `<record.id>.json`.

  In the browser, `gpu/device.js` provides:
  - `acquire({requiredFeatures?}) → Promise<{adapter, device, info, epoch}>`;
  - `onLoss(handler)`;
  - `currentEpoch() → number`;
  - `destroy()`.

  `info` is `{vendor, architecture, device, description, isFallbackAdapter, features: string[], limits: {...}}`.

- [ ] **Step 1: Write the failing evidence tests**

```js
// spikes/project0/tests/evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, launchIdentity, environmentIdentity, fixtureIdentity } from '../evidence.mjs';

test('sha256 is the lowercase hex digest', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('launch identity depends on flags and mode, not on argument order noise', () => {
  const a = launchIdentity({ requestedArgs: ['--enable-gpu', '--use-angle=vulkan'], mode: 'headed', commandLine: 'chrome --enable-gpu --use-angle=vulkan' });
  const b = launchIdentity({ requestedArgs: ['--enable-gpu', '--use-angle=vulkan'], mode: 'headless', commandLine: 'chrome --enable-gpu --use-angle=vulkan --headless' });
  assert.match(a.launchHash, /^[a-f0-9]{64}$/);
  assert.notEqual(a.launchHash, b.launchHash);
});

test('environment identity extracts the driver from chrome://gpu text', () => {
  const text = 'Graphics Feature Status\nWebGPU: Hardware accelerated\nDriver Information\nDriver vendor\tNVIDIA\nDriver version\t580.173.02\nGL_RENDERER\tANGLE (NVIDIA, Vulkan 1.4 (NVIDIA RTX 6000 Ada Generation))';
  const env = environmentIdentity(text, { browserVersion: 'Google Chrome 151.0.7922.108', browserExecutable: '/opt/google/chrome/chrome', session: 'wayland' });
  assert.equal(env.driver, 'NVIDIA 580.173.02');
  assert.throws(() => environmentIdentity('no driver here', { browserVersion: 'x', browserExecutable: 'y', session: 'z' }), /driver/);
});

test('fixture identity refuses a fixture file that is not committed', async () => {
  await assert.rejects(fixtureIdentity({ gitFn: async args => args.includes('--porcelain') ? ' M spikes/project0/fixtures.json\n' : 'a'.repeat(40) }), /uncommitted/);
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

const run = promisify(execFile);
const git = async args => (await run('git', args, { cwd: ROOT })).stdout;
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const SPEC = 'docs/superpowers/specs/2026-10-18-project0-space-qualification-design.md';
const FIXTURES = ['spikes/project0/fixtures.json', 'spikes/project0/fixtures-precision.json'];

export async function fixtureIdentity({ gitFn = git } = {}) {
  if ((await gitFn(['status', '--porcelain', '--', ...FIXTURES, SPEC])).trim()) throw new Error('fixtures or spec have uncommitted changes');
  const fixtureCommit = (await gitFn(['log', '-1', '--format=%H', '--', FIXTURES[0]])).trim();
  if (!/^[a-f0-9]{40}$/.test(fixtureCommit)) throw new Error('fixtures.json has no freezing commit');
  const bytes = await Promise.all(FIXTURES.map(f => readFile(resolve(ROOT, f))));
  return { fixtureHash: sha256(Buffer.concat(bytes)), fixtureCommit, specHash: sha256(await readFile(resolve(ROOT, SPEC))) };
}

async function harnessFiles(dir = resolve(ROOT, 'spikes/project0')) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'tests') out.push(...await harnessFiles(path)); }
    else if (!/^fixtures.*\.json$/.test(entry.name)) out.push(path);
  }
  return out.sort();
}

export async function implementationIdentity({ gitFn = git } = {}) {
  if ((await gitFn(['status', '--porcelain', '--', 'spikes/project0'])).trim()) throw new Error('harness has uncommitted changes');
  const hash = createHash('sha256');
  for (const file of await harnessFiles()) hash.update(relative(ROOT, file)).update('\0').update(await readFile(file)).update('\0');
  return { implementationCommit: (await gitFn(['rev-parse', 'HEAD'])).trim(), implementationHash: hash.digest('hex') };
}

export function launchIdentity({ requestedArgs, mode, commandLine }) {
  return { launchHash: sha256(canonical({ requestedArgs, mode, commandLine })), mode };
}

export function environmentIdentity(chromeGpuText, { browserVersion, browserExecutable, session }) {
  const vendor = /Driver vendor\s+(.+)/.exec(chromeGpuText)?.[1]?.trim();
  const version = /Driver version\s+(.+)/.exec(chromeGpuText)?.[1]?.trim();
  if (!vendor || !version) throw new Error('chrome://gpu has no driver vendor/version');
  return { browserVersion, browserExecutable, driver: `${vendor} ${version}`, session };
}

export async function newRunDir(label) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error(`invalid run label: ${label}`);
  const dir = resolve(ROOT, 'artifacts/project0', `${new Date().toISOString().replace(/[-:.]/g, '')}-${label}`);
  await mkdir(dir, { recursive: false });
  return dir;
}

export async function writeRecord(runDir, record, artifacts) {
  record.artifacts = [];
  for (const { name, data } of artifacts) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`invalid artifact name: ${name}`);
    await writeFile(join(runDir, name), data);
    record.artifacts.push({ path: relative(resolve(ROOT, 'artifacts/project0'), join(runDir, name)), sha256: sha256(data) });
  }
  await writeFile(join(runDir, `${record.id}.json`), canonical(record));
  return record;
}
```

`newRunDir` refuses to reuse a directory: `recursive: false` fails if it exists.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/evidence.test.mjs`
Expected: PASS, `# pass 4`, `# fail 0`.

- [ ] **Step 5: Write the browser device module and the probe kernel**

```js
// spikes/project0/gpu/device.js — the only module that requests an adapter or device.
let state = { adapter: null, device: null, epoch: 0, lossHandlers: [] };
export const currentEpoch = () => state.epoch;
export const onLoss = handler => { state.lossHandlers.push(handler); };

export async function acquire({ requiredFeatures = [] } = {}) {
  if (!('gpu' in navigator)) throw Object.assign(new Error('navigator.gpu is absent'), { code: 'no-api' });
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw Object.assign(new Error('requestAdapter returned null'), { code: 'no-adapter' });
  const features = [...adapter.features].sort();
  const wanted = requiredFeatures.filter(f => adapter.features.has(f));
  const device = await adapter.requestDevice({ requiredFeatures: wanted });
  const epoch = ++state.epoch;
  device.lost.then(info => { if (epoch === state.epoch) for (const h of state.lossHandlers) h({ epoch, reason: info.reason, message: info.message, injected: false }); });
  device.addEventListener('uncapturederror', event => console.error(`uncapturederror: ${event.error.message}`));
  state = { ...state, adapter, device };
  const i = adapter.info;
  const limits = Object.fromEntries(['maxComputeWorkgroupSizeX', 'maxStorageBufferBindingSize', 'maxBufferSize', 'maxTextureDimension2D', 'maxComputeInvocationsPerWorkgroup'].map(k => [k, device.limits[k]]));
  // Record where fallback information came from, if anywhere (Codex's G1 rule); never infer it.
  const fallbackSource = 'isFallbackAdapter' in i ? 'adapter.info.isFallbackAdapter' : 'isFallbackAdapter' in adapter ? 'adapter.isFallbackAdapter' : 'not exposed';
  const isFallbackAdapter = fallbackSource === 'not exposed' ? null : Boolean(fallbackSource.startsWith('adapter.info') ? i.isFallbackAdapter : adapter.isFallbackAdapter);
  return { adapter, device, epoch, info: { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, isFallbackAdapter, fallbackSource, features, grantedFeatures: wanted, limits } };
}

export function destroy() { state.epoch++; state.device?.destroy(); state.device = null; }
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

- [ ] **Step 6: Add the probe mode to `browser/main.js`**

Append to `spikes/project0/browser/main.js`:

```js
if (params.get('mode') === 'probe') {
  const { acquire, destroy } = await import('../gpu/device.js');
  const result = { ok: false };
  try {
    status.textContent = 'probe: acquiring adapter…';
    const { device, info } = await acquire({ requiredFeatures: ['timestamp-query'] });
    result.info = info;
    const n = 1000;  // 15 full workgroups + one partial (1000 = 15*64 + 40)
    const module = device.createShaderModule({ code: await (await fetch('../gpu/probe.wgsl')).text() });
    const compilation = await module.getCompilationInfo();
    result.compilation = compilation.messages.map(m => `${m.type}: ${m.message}`);
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniform, 0, new Uint32Array([n, 0, 0, 0]));
    const out = device.createBuffer({ size: 1024 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(out, 0, new Uint32Array(1024).fill(0xdeadbeef));
    const read = device.createBuffer({ size: 1024 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: out } }] });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(n / 64)); pass.end();
    enc.copyBufferToBuffer(out, 0, read, 0, 1024 * 4);
    device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const values = new Uint32Array(read.getMappedRange().slice(0)); read.unmap();
    result.readback = { mismatches: [...values].filter((v, i) => v !== (i < n ? 3 * i + 1 : 0xdeadbeef)).length, n, length: values.length };
    if (!params.has('headless')) {
      const context = document.getElementById('view').getContext('webgpu');
      context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
      const e2 = device.createCommandEncoder();
      e2.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0.1, g: 0.6, b: 0.2, a: 1 }, storeOp: 'store' }] }).end();
      device.queue.submit([e2.finish()]); await device.queue.onSubmittedWorkDone();
      result.presented = true;
    }
    const lost = device.lost;
    destroy();
    result.lostReason = (await lost).reason;
    result.ok = result.readback.mismatches === 0 && result.compilation.every(m => !m.startsWith('error'));
  } catch (error) { result.error = `${error.code || 'error'}: ${error.message}`; }
  window.p0Probe = result;
  status.textContent = `probe: ${result.ok ? 'ok' : 'failed'}`;
}
```

- [ ] **Step 7: Write the Node probe entry point**

```js
// spikes/project0/probe.mjs — first GPU run. Headed and headless, fresh profiles, attempt-1 flags.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, HARNESS_PATH, ensureServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';
import { fixtureIdentity, implementationIdentity, launchIdentity, environmentIdentity, newRunDir, writeRecord } from './evidence.mjs';

process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
const fixture = await fixtureIdentity();
const implementation = await implementationIdentity();
const runDir = await newRunDir('probe');
const server = await ensureServer();
let failures = 0;
try {
  for (const mode of ['headed', 'headless']) {
    const { context, requestedArgs } = await launchChrome({ headless: mode === 'headless', profileKind: `probe-${mode}`, chromium });
    try {
      const commandLine = await effectiveCommandLine(context); assertSandboxed(commandLine);
      const gpuPage = await context.newPage(); await gpuPage.goto('chrome://gpu');
      await gpuPage.waitForTimeout(1500);  // chrome://gpu fills its tables asynchronously
      const chromeGpuText = await gpuPage.locator('body').innerText(); await gpuPage.close();
      const page = await context.newPage();
      await page.goto(`${server.url}${HARNESS_PATH}?mode=probe${mode === 'headless' ? '&headless' : ''}`);
      const probe = await page.waitForFunction(() => window.p0Probe, null, { timeout: 60000 }).then(h => h.jsonValue());
      if (mode === 'headed' && probe.ok) await page.screenshot({ path: resolve(runDir, `probe-${mode}.png`) });
      // A persistent context has no Browser object; take the version from `google-chrome --version`
      // and the executable from the first token of chrome://version's command line.
      const browserVersion = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
      const browserExecutable = commandLine.split(/\s+/)[0];
      let env; try { env = environmentIdentity(chromeGpuText, { browserVersion, browserExecutable, session: process.env.XDG_SESSION_TYPE || 'unknown' }); } catch (e) { env = { error: e.message }; }
      const record = { schema: 1, id: `probe-${mode}`, gate: 'probe', slot: mode, identity: { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity({ requestedArgs, mode, commandLine }), ...env }, invalidations: [], metrics: {} };
      await writeRecord(runDir, record, [{ name: `probe-${mode}.json`, data: JSON.stringify({ probe, commandLine }, null, 2) }, { name: `chrome-gpu-${mode}.txt`, data: chromeGpuText }]);
      console.log(`${mode}: ${probe.ok ? 'PROBE OK' : 'PROBE FAILED'} ${probe.error || ''} vendor=${probe.info?.vendor} fallback=${probe.info?.isFallbackAdapter} mismatches=${probe.readback?.mismatches}`);
      if (!probe.ok) failures++;
    } finally { await context.close(); }
  }
} finally { await server.stop(); }
console.log(`evidence: ${runDir}`);
process.exitCode = failures ? 1 : 0;
```

`gate: 'probe'` is outside `GATES`, so `evaluateGate` never counts probe records as
qualification evidence. G1's formal trials run in T10. The probe exists to discover failures
early.

- [ ] **Step 8: Run the probe (the first GPU run)**

Run: `node spikes/project0/probe.mjs`
Expected, if WebGPU works in both modes:
- `headed: PROBE OK … vendor=nvidia fallback=false mismatches=0`;
- `headless: PROBE OK …` with the same fields;
- an `evidence:` path.

**If either mode prints `PROBE FAILED`, do not work around it in this task:**
1. Record the failure: the `no-api` or `no-adapter` code, the `chrome://gpu` text and the
   command line are already saved.
2. Continue the plan. T6–T9 can still be developed against whichever mode works.
3. Take the classification and the single remediation decision to T10, jointly with Codex.

A failure to launch Chrome at all is *inconclusive* evidence, not a backend failure.

- [ ] **Step 9: Commit** (after Codex's read-only review)

```bash
git add spikes/project0/evidence.mjs spikes/project0/gpu/device.js spikes/project0/gpu/probe.wgsl spikes/project0/browser/main.js spikes/project0/probe.mjs spikes/project0/tests/evidence.test.mjs
git commit -m "Project 0 T5: evidence identity, WebGPU device module and first hardware probe"
```

---

### Task T6: GPU arithmetic and ray-list kernels; G3–G5 checks

**Owner:** Claude, with WGSL written from spec A.2–A.4 and the policy text, independently of
`reference/`. **Reviewer:** Codex (read-only `review --diff`). Codex checks semantics against
the spec, not by line-matching its own CPU code.

**Files:**
- `spikes/project0/gpu/fields.wgsl`: status codes, the derivative range policy, the Mandelbulb
  kernel, the analytic and Menger fields, the quaternion square.
- `spikes/project0/gpu/arithmetic.wgsl`: entry points for `bulb_samples`, `qjulia_plane`,
  `qjulia_offplane` and `derivative_policy`.
- `spikes/project0/gpu/trace.wgsl`: bounding intervals, the marcher (`trace_ray`), and the
  ray-list entry point `trace_list`.
- `spikes/project0/gpu/webgpu.js`: shader assembly, asynchronous pipeline preparation, buffer
  helpers, and bounded batched dispatch.
- `spikes/project0/browser/checks.js`: in-page drivers for `G3`, `G4`, `G5` and
  `derivative-policy`. They return raw readbacks only, never a pass.
- `spikes/project0/measure.mjs`: Node; derives gate metrics from raw readbacks and fixtures.
- `spikes/project0/run.mjs`: the Node gate runner (fresh session → driver → metrics → record).
- Modify `spikes/project0/browser/main.js`: adds `?mode=gate`.
- Test: `spikes/project0/tests/measure.test.mjs`.

**Interfaces:**
- Consumes:
  - T1: `compareArithmetic`, `compareRays`, `ARITH_STATUS`, `RAY_STATUS`, `UNRESOLVED_REASON`,
    `evaluateGate`, `gatePlan`;
  - T3/T4 fixture keys: `analytic[name].{L, boxes, rays, effectiveOrigins, effectiveDirections}`,
    `arithmetic.bulb[i].{id, input, reference, eligible}`, `arithmetic.plane[i]` with
    `input = [x, y, C_r, C_i]`, `arithmetic.offplane.{q, C, orbit}`,
    `derivativePolicy[i].{grow, dr, fits}`, `profiles.g3`;
  - T5: `device.js` (`acquire`), `evidence.mjs`, `launch.mjs`.
- Produces:
  - **GPU status codes**, the order of the T1 vocabulary arrays:
    - arithmetic: `0 escaped`, `1 budget`, `2 failure`;
    - ray: `0 hit`, `1 miss`, `2 unresolved`, `3 failure`;
    - reason: `0 none`, `1 point`, `2 steps`.
  - `prepare(device) → Promise<Pipelines>`. It creates every pipeline with
    `createComputePipelineAsync`. Pipelines are keyed `bulb_samples`, `qjulia_plane`,
    `qjulia_offplane`, `derivative_policy`, and `trace_list/<field>` for the fields `sphere`,
    `box`, `menger`, `bulb`.
  - `traceList({device, pipelines, field, profile, origins: Float32Array, directions: Float32Array, boxes?: Float32Array, batch = 512}) → Promise<{words: Uint32Array, batches: {start, count, submitMs, doneMs}[]}>`.
    `words` holds four u32 per ray, `(status, reason, bitcast t, steps)`, which
    `measure.decodeTrace` turns into rows. At most two batches are outstanding.
  - `runGateCheck(gate, fixtures) → Promise<{slots: {slot, raw}[], invalidations: string[]}>`
    in the browser.
  - `metricsFor(gate, slot, raw, fixtures) → metrics` in Node, using exactly the metric names
    `gatePlan` requires for that slot.
  - `runGate({gate, mode, args, campaign?}) → Promise<{records, statuses}>` in Node, used by T9 and T10.

- [ ] **Step 1: Write the failing Node tests for metric derivation**

```js
// spikes/project0/tests/measure.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsFor, decodeTrace, decodeArith } from '../measure.mjs';
import { gatePlan } from '../gates.js';

const fixtures = {
  analytic: { sphere: { L: 1, rays: [
    { id: 0, reference: { status: 'hit', t: 3, excluded: false } },
    { id: 1, reference: { status: 'miss', t: null, excluded: false } },
    { id: 2, reference: { status: 'miss', t: null, excluded: true } }] } },
  arithmetic: {
    bulb: [{ id: 0, eligible: true, reference: { status: 'escaped', index: 3, logR: 1, de: .01 } }],
    plane: [{ id: 0, eligible: true, reference: { status: 'budget', index: null, logR: null } }],
    offplane: { orbit: Array.from({ length: 8 }, (_, n) => [n, -n, .5, 0]) },
  },
};

test('decoders map GPU codes onto the T1 vocabulary', () => {
  const words = new Uint32Array([0, 0, 0, 3, 1, 0, 0, 1, 2, 2, 0, 512]);
  const f = new Float32Array(words.buffer); f[2] = 3;
  assert.deepEqual(decodeTrace(words).slice(0, 3), [
    { id: 0, status: 'hit', reason: null, t: 3, steps: 3 },
    { id: 1, status: 'miss', reason: null, t: null, steps: 1 },
    { id: 2, status: 'unresolved', reason: 'steps', t: 0, steps: 512 }]);
  assert.throws(() => decodeTrace(new Uint32Array([7, 0, 0, 0])), /unknown ray status code/);
  assert.throws(() => decodeArith(new Uint32Array([9, 0, 0, 0])), /unknown arithmetic status code/);
});

test('G3 metrics have exactly the gatePlan keys', () => {
  const words = new Uint32Array([0, 0, 0, 3, 1, 0, 0, 1, 2, 2, 0, 512]);
  new Float32Array(words.buffer)[2] = 3.00001;
  const m = metricsFor('G3', 'sphere', { words: Array.from(words) }, fixtures);
  assert.deepEqual(Object.keys(m).sort(), ['depthRatio', 'edgeErrors', 'rays', 'statusErrors']);
  assert.equal(m.statusErrors, 0); assert.equal(m.edgeErrors, 0);
  assert.ok(m.depthRatio > .09 && m.depthRatio < .11);   // 1e-5 error / (1e-4 * L)
});

test('G5 off-plane metric is the max relative-plus-absolute component ratio over 32 components', () => {
  const orbit = fixtures.arithmetic.offplane.orbit.flat();
  const actual = orbit.map((v, i) => i === 5 ? v + 2e-6 : v);
  const m = metricsFor('G5', 'qjulia-offplane', { orbit: actual }, fixtures);
  assert.equal(m.components, 32);
  assert.ok(Math.abs(m.componentRatio - 2e-6 / (1e-6 + 1e-5 * 1)) < 1e-9);
});

test('G4 and G5 plane metrics match the plan keys', () => {
  const words = new Uint32Array([0, 3, 0, 0]); const f = new Float32Array(words.buffer); f[2] = 1; f[3] = .01;
  const plan = gatePlan({ analytic: {}, arithmetic: { bulb: Array.from({ length: 4096 }, () => ({ eligible: true })), plane: Array.from({ length: 4096 }, () => ({ eligible: true })) } });
  const g4 = metricsFor('G4', 'bulb-samples', { words: Array.from(words) }, fixtures);
  assert.deepEqual(Object.keys(g4).sort(), Object.keys(plan.G4['bulb-samples']).sort());
  const g5 = metricsFor('G5', 'qjulia-plane', { words: [1, 0, 0, 0] }, fixtures);
  assert.deepEqual(Object.keys(g5).sort(), Object.keys(plan.G5['qjulia-plane']).sort());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/measure.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/measure.mjs`.

- [ ] **Step 3: Implement `measure.mjs` (G3–G5 part; T9 extends it)**

```js
// spikes/project0/measure.mjs — Node: raw readbacks + fixtures → gate metrics. No pass/fail here.
import { ARITH_STATUS, RAY_STATUS, UNRESOLVED_REASON } from './contract.js';
import { compareArithmetic, compareRays } from './metrics.js';

const REASON = [null, ...UNRESOLVED_REASON];

export function decodeTrace(words) {
  const u = Uint32Array.from(words), f = new Float32Array(u.buffer);
  const rows = [];
  for (let id = 0; id < u.length / 4; id++) {
    const code = u[4 * id], reason = u[4 * id + 1];
    if (!(code in RAY_STATUS)) throw new Error(`unknown ray status code ${code}`);
    if (!(reason in REASON)) throw new Error(`unknown reason code ${reason}`);
    const status = RAY_STATUS[code];
    rows.push({ id, status, reason: status === 'unresolved' ? REASON[reason] : null, t: status === 'miss' ? null : f[4 * id + 2], steps: u[4 * id + 3] });
  }
  return rows;
}

export function decodeArith(words) {
  const u = Uint32Array.from(words), f = new Float32Array(u.buffer);
  const rows = [];
  for (let id = 0; id < u.length / 4; id++) {
    const code = u[4 * id];
    if (!(code in ARITH_STATUS)) throw new Error(`unknown arithmetic status code ${code}`);
    const status = ARITH_STATUS[code], escaped = status === 'escaped';
    rows.push({ id, status, index: escaped ? u[4 * id + 1] : null, logR: escaped ? f[4 * id + 2] : null, de: escaped ? f[4 * id + 3] : null });
  }
  return rows;
}

export function metricsFor(gate, slot, raw, fixtures) {
  if (gate === 'G3') {
    const fixture = fixtures.analytic[slot];
    return compareRays(fixture.rays, decodeTrace(raw.words), fixture.L);
  }
  if (gate === 'G4' && slot === 'bulb-samples') {
    return compareArithmetic(fixtures.arithmetic.bulb, decodeArith(raw.words), { logR: 1e-4, de: 1e-3 });
  }
  if (gate === 'G5' && slot === 'qjulia-plane') {
    const rows = decodeArith(raw.words).map(({ id, status, index, logR }) => ({ id, status, index, logR }));
    return compareArithmetic(fixtures.arithmetic.plane, rows, { logR: 1e-5 });
  }
  if (gate === 'G5' && slot === 'qjulia-offplane') {
    const expected = fixtures.arithmetic.offplane.orbit.flat();
    if (raw.orbit.length !== 32 || expected.length !== 32) throw new Error('off-plane orbit must have 32 components');
    let componentRatio = 0;
    raw.orbit.forEach((v, i) => {
      const r = Number.isFinite(v) ? Math.abs(v - expected[i]) / (1e-6 + 1e-5 * Math.abs(expected[i])) : Number.MAX_VALUE;
      componentRatio = Math.max(componentRatio, r);
    });
    return { components: 32, componentRatio };
  }
  throw new Error(`no metric derivation for ${gate}/${slot}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/measure.test.mjs`
Expected: PASS, `# pass 4`, `# fail 0`.

- [ ] **Step 5: Write `gpu/fields.wgsl`**

```wgsl
// spikes/project0/gpu/fields.wgsl — written from spec A.2–A.4 and the derivative range policy.
const ST_ESCAPED: u32 = 0u;  const ST_BUDGET: u32 = 1u;  const ST_FAILURE: u32 = 2u;   // T1 ARITH_STATUS order
struct Eval { status: u32, index: u32, log_r: f32, de: f32 }

// Range policy: the update grow*dr + 1 is allowed iff its exact real value is <= F32_MAX, for nonnegative
// finite f32 operands. Decided from exponents and an exact 24x24-bit significand product, so no
// operation that could overflow is ever executed.
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
  // F32_MAX = (2^24 - 1) * 2^104. With product = mg*md*2^(e-48):
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
      grow = 8.0 * r4 * r2 * r;                        // r <= 2, so grow <= 1024
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

- [ ] **Step 6: Write `gpu/arithmetic.wgsl`**

It is prepended with `fields.wgsl` at assembly time.

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

// The quaternion recurrence on q0 = (x, y, 0, 0), C = (Cr, Ci, 0, 0); escape tested at n = 0 .. cap.
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

// inputs[0] = q0, inputs[1] = C; writes eight iterates as bitcast vec4f.
@compute @workgroup_size(1)
fn qjulia_offplane() {
  var q = inputs[0];
  let c = inputs[1];
  for (var n: u32 = 0u; n < 8u; n++) { q = qsq(q) + c; outputs[n] = bitcast<vec4u>(q); }
}

// inputs[i].xy = (grow, dr); outputs[i].x = 1 if the update fits.
@compute @workgroup_size(64)
fn derivative_policy(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= count.n) { return; }
  outputs[id.x] = vec4u(select(0u, 1u, derivative_fits(inputs[id.x].x, inputs[id.x].y)), 0u, 0u, 0u);
}
```

- [ ] **Step 7: Write `gpu/trace.wgsl`**

It is prepended with `fields.wgsl`, and specialised per field with the `FIELD` override.

```wgsl
// spikes/project0/gpu/trace.wgsl — A.2 marcher. Ray status order follows T1 RAY_STATUS.
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

// Returns (entry, exit, ok). Sphere radius: 2 for sphere/box, 1.25 for the bulb. Box [-1,1]^3 for Menger.
fn bound(o: vec3f, d: vec3f) -> vec3f {
  if (FIELD == 2u) {
    var lo = -3.4028234e38;  var hi = 3.4028234e38;
    for (var i: u32 = 0u; i < 3u; i++) {
      if (d[i] == 0.0) { if (o[i] < -1.0 || o[i] > 1.0) { return vec3f(0.0, 0.0, 0.0); } continue; }
      let x = (-1.0 - o[i]) / d[i];  let y = (1.0 - o[i]) / d[i];
      lo = max(lo, min(x, y));  hi = min(hi, max(x, y));
      if (lo > hi) { return vec3f(0.0, 0.0, 0.0); }
    }
    return vec3f(lo, hi, 1.0);
  }
  let radius = select(2.0, 1.25, FIELD == 3u);
  let a = dot(d, d);  let b = dot(o, d);  let c = dot(o, o) - radius * radius;
  let disc = b * b - a * c;
  if (disc < 0.0) { return vec3f(0.0, 0.0, 0.0); }
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

- [ ] **Step 8: Write `gpu/webgpu.js` (preparation, helpers, bounded ray-list dispatch)**

```js
// spikes/project0/gpu/webgpu.js — WebGPU backend helpers behind the harness interface.
const FIELDS = { sphere: 0, box: 1, menger: 2, bulb: 3 };
const source = async name => (await fetch(new URL(name, import.meta.url))).text();

export async function prepare(device, onStatus = () => {}) {
  const fields = await source('./fields.wgsl');
  const modules = { arithmetic: fields + await source('./arithmetic.wgsl'), trace: fields + await source('./trace.wgsl') };
  const compiled = {};
  for (const [name, code] of Object.entries(modules)) {
    const module = device.createShaderModule({ code, label: name });
    const errors = (await module.getCompilationInfo()).messages.filter(m => m.type === 'error');
    if (errors.length) throw new Error(`${name}.wgsl: ${errors.map(e => `${e.lineNum}:${e.linePos} ${e.message}`).join('; ')}`);
    compiled[name] = module;
  }
  const jobs = [
    ...['bulb_samples', 'qjulia_plane', 'qjulia_offplane', 'derivative_policy'].map(entryPoint => [entryPoint, { module: compiled.arithmetic, entryPoint }]),
    ...Object.entries(FIELDS).map(([field, id]) => [`trace_list/${field}`, { module: compiled.trace, entryPoint: 'trace_list', constants: { FIELD: id } }]),
  ];
  const pipelines = {};
  let done = 0;
  await Promise.all(jobs.map(async ([key, compute]) => {
    pipelines[key] = await device.createComputePipelineAsync({ layout: 'auto', compute, label: key });
    onStatus(`preparing pipelines ${++done}/${jobs.length}`);
  }));
  return pipelines;
}

export function buffer(device, data, usage) {
  const bytes = data.byteLength ? data : new Uint8Array(16);
  const b = device.createBuffer({ size: Math.max(16, Math.ceil(bytes.byteLength / 16) * 16), usage: usage | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(b, 0, bytes);
  return b;
}

export async function readBack(device, source, size) {
  const read = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(source, 0, read, 0, size); device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const out = read.getMappedRange().slice(0); read.unmap(); read.destroy();
  return out;
}

const vec4 = flat3 => { const n = flat3.length / 3, out = new Float32Array(4 * n); for (let i = 0; i < n; i++) out.set(flat3.subarray(3 * i, 3 * i + 3), 4 * i); return out; };

export function profileWords({ k, floor, factor, H, steps, iterations }, start, count, boxCount) {
  const words = new ArrayBuffer(48), f = new Float32Array(words), u = new Uint32Array(words);
  f[0] = k; f[1] = floor; f[2] = factor; f[3] = 2 * Math.tan(Math.PI / 6) / H;
  u[4] = steps; u[5] = iterations; u[6] = start; u[7] = count; u[8] = boxCount;
  return words;
}

export async function traceList({ device, pipelines, field, profile, origins, directions, boxes = new Float32Array(4), batch = 512 }) {
  const n = origins.length / 3;
  const pipeline = pipelines[`trace_list/${field}`];
  const o = buffer(device, vec4(origins), GPUBufferUsage.STORAGE), d = buffer(device, vec4(directions), GPUBufferUsage.STORAGE);
  const bx = buffer(device, boxes, GPUBufferUsage.STORAGE);
  const results = device.createBuffer({ size: 16 * n, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const batches = [], inflight = [];
  for (let start = 0; start < n; start += batch) {
    while (inflight.length >= 2) await inflight.shift();            // at most two outstanding
    const count = Math.min(batch, n - start);
    const uniform = buffer(device, new Uint8Array(profileWords(profile, start, count, boxes.length / 4)), GPUBufferUsage.UNIFORM);
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: bx } },
      { binding: 2, resource: { buffer: o } }, { binding: 3, resource: { buffer: d } }, { binding: 4, resource: { buffer: results } }] });
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
    const row = { start, count, submitMs: performance.now(), doneMs: null };
    device.queue.submit([enc.finish()]); batches.push(row);
    inflight.push(device.queue.onSubmittedWorkDone().then(() => { row.doneMs = performance.now(); uniform.destroy(); }));
  }
  await Promise.all(inflight);
  const words = new Uint32Array(await readBack(device, results, 16 * n));
  for (const b of [o, d, bx, results]) b.destroy();
  return { words, batches };
}
```

`buffer()` writes the data's own bytes. Typed-array views are passed as `Uint8Array` where
alignment matters. Stale-result rejection and generations belong to the viewport scheduler
(T7); ray lists are synchronous campaign steps.

- [ ] **Step 9: Write the in-page check drivers, `browser/checks.js`**

```js
// spikes/project0/browser/checks.js — G3/G4/G5 and policy drivers: raw readbacks only, never a verdict.
import { acquire } from '../gpu/device.js';
import { prepare, buffer, readBack, traceList } from '../gpu/webgpu.js';

export async function arith(device, pipelines, entry, inputs, cap) {
  const n = inputs.length / 4;
  const uniform = buffer(device, new Uint32Array([n, cap, 0, 0]), GPUBufferUsage.UNIFORM);
  const input = buffer(device, inputs, GPUBufferUsage.STORAGE);
  const output = device.createBuffer({ size: Math.max(16, 16 * Math.max(n, 8)), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const p = pipelines[entry];
  const bind = device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: input } }, { binding: 2, resource: { buffer: output } }] });
  const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
  pass.setPipeline(p); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(entry === 'qjulia_offplane' ? 1 : Math.ceil(n / 64)); pass.end();
  device.queue.submit([enc.finish()]);
  const words = new Uint32Array(await readBack(device, output, output.size));
  for (const b of [uniform, input, output]) b.destroy();
  return words;
}

export const pack = (rows, f) => { const out = new Float32Array(4 * rows.length); rows.forEach((r, i) => out.set(f(r), 4 * i)); return out; };

export async function runGateCheck(gate, fixtures, status = () => {}) {
  const { device } = await acquire();
  const pipelines = await prepare(device, status);
  const slots = [];
  if (gate === 'G3') {
    for (const [slot, fixture] of Object.entries(fixtures.analytic)) {
      const field = slot.startsWith('menger') ? 'menger' : slot;
      const boxes = new Float32Array(fixture.boxes.flatMap(b => [...b.c, b.h]));
      const { words } = await traceList({ device, pipelines, field, profile: fixtures.profiles.g3, origins: Float32Array.from(fixture.effectiveOrigins), directions: Float32Array.from(fixture.effectiveDirections), boxes: boxes.length ? boxes : new Float32Array(4) });
      slots.push({ slot, raw: { words: Array.from(words.subarray(0, 4 * fixture.rays.length)) } });
    }
  } else if (gate === 'G4') {
    const words = await arith(device, pipelines, 'bulb_samples', pack(fixtures.arithmetic.bulb, s => [...s.input, 0]), 64);
    slots.push({ slot: 'bulb-samples', raw: { words: Array.from(words.subarray(0, 4 * 4096)) } });
  } else if (gate === 'G5') {
    const plane = await arith(device, pipelines, 'qjulia_plane', pack(fixtures.arithmetic.plane, s => s.input), 128);
    slots.push({ slot: 'qjulia-plane', raw: { words: Array.from(plane.subarray(0, 4 * 4096)) } });
    const { q, C } = fixtures.arithmetic.offplane;
    const orbit = new Float32Array((await arith(device, pipelines, 'qjulia_offplane', Float32Array.from([...q, ...C]), 0)).buffer, 0, 32);
    slots.push({ slot: 'qjulia-offplane', raw: { orbit: Array.from(orbit) } });
  } else if (gate === 'derivative-policy') {
    const words = await arith(device, pipelines, 'derivative_policy', pack(fixtures.derivativePolicy, v => [v.grow, v.dr, 0, 0]), 0);
    slots.push({ slot: 'vectors', raw: { fits: fixtures.derivativePolicy.map((_, i) => words[4 * i]) } });
  } else throw new Error(`no check driver for ${gate}`);
  device.destroy();
  return { slots, invalidations: [] };
}
```

The `G4` cap of 64 and the `G5` cap of 128 come from A.3. `fixtures.arithmetic.*.input`
already holds the effective f32 values, so the shader input equals the oracle input.

- [ ] **Step 10: Add `?mode=gate` to `browser/main.js`**

Append:

```js
if (params.get('mode') === 'gate') {
  const gate = params.get('gate');
  try {
    const fixtures = await (await fetch('../fixtures.json')).json();
    if (['G3', 'G4', 'G5', 'derivative-policy'].includes(gate)) {
      const { runGateCheck } = await import('./checks.js');
      window.p0Result = await runGateCheck(gate, fixtures, text => { status.textContent = text; });
    } else {
      const { runGateDriver } = await import('./drivers.js');      // T9
      window.p0Result = await runGateDriver(gate, fixtures, params, text => { status.textContent = text; });
    }
  } catch (error) { window.p0Result = { error: `${error.name}: ${error.message}` }; }
  status.textContent = `gate ${gate}: ${window.p0Result.error ? 'error' : 'done'}`;
}
```

- [ ] **Step 11: Write the Node gate runner, `run.mjs`**

```js
// spikes/project0/run.mjs — node spikes/project0/run.mjs --gate G4 [--mode headed|headless] [--args attempt1|remediation] [--campaign <name>]
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { ROOT, HARNESS_PATH, ATTEMPT1_ARGS, ensureServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';
import { fixtureIdentity, implementationIdentity, launchIdentity, environmentIdentity, newRunDir, writeRecord } from './evidence.mjs';
import { metricsFor } from './measure.mjs';
import { evaluateGate } from './gates.js';

process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
export const LAUNCH = { attempt1: ATTEMPT1_ARGS };   // T10 adds `remediation` only via a recorded decision

export async function runGate({ gate, mode = 'headless', args = 'attempt1', campaign = 'dev', timeoutMs = 900000 }) {
  if (!LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
  const fixture = await fixtureIdentity(), implementation = await implementationIdentity();
  const runDir = await newRunDir(`${campaign}-${gate.toLowerCase()}-${mode}`);
  const server = await ensureServer();
  const { context, requestedArgs } = await launchChrome({ headless: mode === 'headless', args: LAUNCH[args], profileKind: `${gate.toLowerCase()}-${mode}`, chromium });
  try {
    const commandLine = await effectiveCommandLine(context); assertSandboxed(commandLine);
    const gpuPage = await context.newPage(); await gpuPage.goto('chrome://gpu'); await gpuPage.waitForTimeout(1500);
    const chromeGpuText = await gpuPage.locator('body').innerText(); await gpuPage.close();
    const page = await context.newPage();
    const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message)); page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
    await page.goto(`${server.url}${HARNESS_PATH}?mode=gate&gate=${encodeURIComponent(gate)}`);
    const result = await page.waitForFunction(() => window.p0Result, null, { timeout: timeoutMs, polling: 1000 }).then(h => h.jsonValue());
    const browserVersion = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
    const sessionInvalidations = [];
    let env;
    try { env = environmentIdentity(chromeGpuText, { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], session: process.env.XDG_SESSION_TYPE || 'unknown' }); }
    catch (error) { env = { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], driver: 'unknown', session: process.env.XDG_SESSION_TYPE || 'unknown' }; sessionInvalidations.push(`environment identity: ${error.message}`); }
    const identity = { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity({ requestedArgs, mode, commandLine }), ...env };
    if (result.error) throw new Error(`page: ${result.error}`);
    const records = [];
    for (const { slot, raw, invalidations = [] } of result.slots) {
      const recordInvalidations = [...sessionInvalidations, ...result.invalidations, ...invalidations, ...pageErrors.map(e => `page error: ${e}`)];
      let metrics = {};
      // A decoding failure (an unknown status code, a short readback) is invalid evidence, not a measured failure.
      if (gate !== 'derivative-policy') { try { metrics = metricsFor(gate, slot, raw, fixtures); } catch (error) { recordInvalidations.push(`metrics: ${error.message}`); } }
      const record = { schema: 1, id: `${gate}-${slot.replace(/[^A-Za-z0-9.-]/g, '_')}-${runDir.split('/').at(-1)}`, gate, slot, identity, invalidations: recordInvalidations, metrics };
      records.push(await writeRecord(runDir, record, [{ name: `${record.id}.raw.json`, data: JSON.stringify(raw) }, { name: `${record.id}.chrome-gpu.txt`, data: chromeGpuText }]));
    }
    return { records, runDir, result };
  } finally { await context.close(); await server.stop(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { gate: { type: 'string' }, mode: { type: 'string', default: 'headless' }, args: { type: 'string', default: 'attempt1' }, campaign: { type: 'string', default: 'dev' } } });
  const { records, runDir, result } = await runGate(values);
  if (values.gate === 'derivative-policy') {
    const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
    const got = result.slots[0].raw.fits, bad = fixtures.derivativePolicy.filter((v, i) => Boolean(got[i]) !== v.fits);
    console.log(`derivative policy: ${bad.length} mismatches of ${got.length}`, bad.slice(0, 5));
    process.exitCode = bad.length ? 1 : 0;
  } else {
    for (const r of records) console.log(`${r.gate} ${r.slot}: ${JSON.stringify(r.metrics)}${r.invalidations.length ? ` INVALIDATIONS ${r.invalidations.join('; ')}` : ''}`);
  }
  console.log(`evidence: ${runDir}`);
}
```

The development runner prints metrics, not verdicts. Verdicts come from `evaluateGate` over a
campaign manifest in T10. A development record carries the campaign `dev` and is never
selected for qualification.

- [ ] **Step 12: Verify the policy guard on the GPU first (red, then green)**

Run: `node spikes/project0/run.mjs --gate derivative-policy`
- **Before Steps 5–8 exist:** FAIL with a page error that names the missing module
  (`fields.wgsl` 404, or `p0Result.error`). This is the red step.
- **After:** `derivative policy: 0 mismatches of <N>`.

Any mismatch means the WGSL guard disagrees with the frozen policy vectors. Fix the WGSL; never
edit the vectors.

- [ ] **Step 13: Run the G4, G5 and G3 development checks**

Run, in order:
- `node spikes/project0/run.mjs --gate G4`
- `node spikes/project0/run.mjs --gate G5`
- `node spikes/project0/run.mjs --gate G3`

Expected:
- **Every run:** a printed metrics line per slot, with the `gatePlan` keys, and an `evidence:`
  directory.
- **A correct implementation shows:**
  - G4 `statusErrors 0`, `indexErrors 0`, `logRRatio` and `deRatio` ≤ 1;
  - G5 plane errors 0, `logRRatio` ≤ 1, off-plane `componentRatio` ≤ 1;
  - G3 `statusErrors 0`, `edgeErrors 0`, `depthRatio` ≤ 1 for each fixture.

**A ratio above 1 or a nonzero error count** is a finding. Diagnose it with the raw file, and
reproduce it on the CPU with the same effective inputs, before changing anything. Under
spec §7, a wrong numerical result is not "tuned away", and **tolerances and fixtures are
never edited.**

- [ ] **Step 14: Commit** (after Codex's read-only review)

```bash
git add spikes/project0/gpu/fields.wgsl spikes/project0/gpu/arithmetic.wgsl spikes/project0/gpu/trace.wgsl spikes/project0/gpu/webgpu.js spikes/project0/browser/checks.js spikes/project0/browser/main.js spikes/project0/measure.mjs spikes/project0/run.mjs spikes/project0/tests/measure.test.mjs
git commit -m "Project 0 T6: WGSL arithmetic and ray-list kernels with the exact derivative range guard; G3-G5 development checks"
```

---

### Task T7: Viewport renderer, bounded scheduling, generations and publication

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).

**Files:**
- Create: `spikes/project0/gpu/scheduler.js`, a pure, DOM-free scheduling policy. It manages
  generations, adaptive bands, row-to-range splitting, at most two outstanding batches, and
  stale-completion rejection.
- Create: `spikes/project0/gpu/view.wgsl`, the camera-mode marcher entry point. It writes the
  depth, status and normal storage textures.
- Create: `spikes/project0/gpu/present.wgsl`, holding the shade pass (writes `rgba8unorm`
  display and counts coverage per workgroup) and the blit render pass.
- Create: `spikes/project0/gpu/renderer.js`, the WebGPU viewport. It owns resources, binds the
  scheduler to real queues and publishes frames.
- Create: `spikes/project0/browser/events.js`, the page-clock event log.
- Test: `spikes/project0/tests/scheduler.test.mjs`.

**Interfaces:**
- Consumes:
  - T6: `fields.wgsl`, `trace.wgsl` (`trace_ray`, `Profile`), `prepare()`, `buffer()`,
    `profileWords()`;
  - T3/T4: `fixtures.views[name].{camera, profiles, traceOverrides}`, `fixtures.profiles`,
    `fixtures.display`;
  - T3: `reference/camera.js` `norm`/`cross` for the camera basis. This is a pure vector
    utility that the charter permits sharing. The reference kernels are never imported.
- Produces (used by T8, T9 and T12):
  - **`Scheduler`**:
    - `new Scheduler({rows, cols, targetMs = 10, maxOutstanding = 2, initialRows = 8, minRange = 64})`;
    - `request(scene) → generation` (a number, strictly increasing);
    - `next() → {generation, row0, rows, col0, cols} | null`: the next band to submit for the
      current generation, or `null` if it is complete, already pending, or the outstanding
      limit is reached;
    - `submitted(band, nowMs)`;
    - `completed(band, nowMs, epoch) → 'current' | 'stale'`;
    - `isComplete(generation) → boolean`;
    - `stats() → {outstandingMax, bandMs: number[], rowsPerBand: number[], splits}`;
    - `resetEpoch(epoch)`.
  - **`Renderer`**:
    - `new Renderer({device, viewport, canvas, fixtures, events, alloc?})`, where `alloc` is
      `{texture(device, desc), buffer(device, desc)}`. T8's tracker implements it;
    - `render({view, profile, camera?, label?, override?: {W, H}}) → requestId`. The latest
      request wins, and the previous generation's unsubmitted bands are dropped. `override` may
      only change the internal dimensions;
    - `onPublish(handler)`, where the handler receives
      `{requestId, generation, label, counts: {total, hit, miss, point, steps, failure}, normalUnavailable, publishedMs}`;
    - `destroy()`;
    - `resize({width, height})`.
  - **`events`**:
    - `mark(type, fields) → event` with `{type, t: performance.now(), ...fields}`;
    - `list() → event[]`;
    - `clear()`;
    - `harness(fn)` brackets harness work with `performance.mark`s, so that T9 can attribute
      long tasks.

**Coverage counting** never blocks a frame. The shade pass writes six atomic counters per
generation into a small storage buffer. A three-buffer `MAP_READ` ring copies it after the
generation's last band, `mapAsync` resolves later, and the publication handler receives the
counts. A generation whose counts cannot be read, because its ring slot is still mapped, is
published with `counts: null`. T9 treats that as an invalidated frame, never as a pass.

- [ ] **Step 1: Write the failing scheduler tests (deterministic fake clock)**

```js
// spikes/project0/tests/scheduler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../gpu/scheduler.js';

test('never more than two bands outstanding, and every row covered exactly once', () => {
  const s = new Scheduler({ rows: 360, cols: 640, initialRows: 8 });
  const g = s.request('a'); const seen = new Uint8Array(360); let t = 0;
  const pending = [];
  for (;;) {
    let band; while ((band = s.next())) { s.submitted(band, t); pending.push(band); assert.ok(pending.length <= 2); }
    if (!pending.length) break;
    const done = pending.shift(); t += 5;
    assert.equal(s.completed(done, t, 0), 'current');
    if (done.col0 === 0) for (let r = done.row0; r < done.row0 + done.rows; r++) seen[r]++;
  }
  assert.ok(s.isComplete(g)); assert.ok(seen.every(v => v === 1)); assert.equal(s.stats().outstandingMax, 2);
});

test('a final short band is exact when rows do not divide evenly', () => {
  const s = new Scheduler({ rows: 37, cols: 64, initialRows: 8 });
  s.request('a'); const bands = []; let band;
  for (;;) { while ((band = s.next())) { s.submitted(band, 0); bands.push(band); } if (!bands.some(b => !b.done)) break; const b = bands.find(x => !x.done); b.done = true; s.completed(b, 1, 0); }
  assert.equal(bands.reduce((n, b) => n + (b.col0 === 0 ? b.rows : 0), 0), 37);
  assert.equal(bands.at(-1).row0 + bands.at(-1).rows, 37);
});

test('slow completions shrink bands and eventually split a row into column ranges', () => {
  const s = new Scheduler({ rows: 64, cols: 1024, initialRows: 8, targetMs: 10, minRange: 64 });
  s.request('slow'); let t = 0, band;
  for (let i = 0; i < 40 && !s.isComplete(1); i++) {
    while ((band = s.next())) s.submitted(band, t);
    t += 200;                                   // every band takes 200 ms: 20x the target
    for (const b of s.pendingBands()) s.completed(b, t, 0);
  }
  const { rowsPerBand, splits } = s.stats();
  assert.ok(rowsPerBand.at(-1) <= 1, `rows per band should reach 1, got ${rowsPerBand.at(-1)}`);
  assert.ok(splits > 0, 'a single row must be split into column ranges');
});

test('a new request drops the old generation; its late completions are stale', () => {
  const s = new Scheduler({ rows: 100, cols: 10, initialRows: 10 });
  s.request('a'); const a1 = s.next(); s.submitted(a1, 0); const a2 = s.next(); s.submitted(a2, 0);
  const g2 = s.request('b');
  assert.equal(s.completed(a1, 1, 0), 'stale'); assert.equal(s.completed(a2, 1, 0), 'stale');
  const b1 = s.next(); assert.equal(b1.generation, g2);
});

test('completions from a previous device epoch are stale even for the current generation', () => {
  const s = new Scheduler({ rows: 10, cols: 10, initialRows: 10 });
  s.request('a'); const b = s.next(); s.submitted(b, 0);
  s.resetEpoch(1);
  assert.equal(s.completed(b, 1, 0), 'stale');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/scheduler.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/gpu/scheduler.js`.

- [ ] **Step 3: Implement `gpu/scheduler.js`**

```js
// spikes/project0/gpu/scheduler.js — pure scheduling policy. No DOM, no GPU objects.
export class Scheduler {
  constructor({ rows, cols, targetMs = 10, maxOutstanding = 2, initialRows = 8, minRange = 64 }) {
    Object.assign(this, { rows, cols, targetMs, maxOutstanding, minRange });
    this.rowsPerBand = initialRows; this.colsPerBand = cols;
    this.generation = 0; this.epoch = 0; this.pending = new Set();
    this.log = { outstandingMax: 0, bandMs: [], rowsPerBand: [], splits: 0 };
  }
  request(scene) {
    this.generation++; this.scene = scene; this.row = 0; this.col = 0; this.done = 0;
    return this.generation;
  }
  resetEpoch(epoch) { this.epoch = epoch; this.pending.clear(); }
  pendingBands() { return [...this.pending]; }
  next() {
    if (this.pending.size >= this.maxOutstanding || this.row >= this.rows) return null;
    const rows = Math.min(this.rowsPerBand, this.rows - this.row);
    const cols = rows === 1 ? Math.min(this.colsPerBand, this.cols - this.col) : this.cols;
    const band = { generation: this.generation, epoch: this.epoch, row0: this.row, rows, col0: rows === 1 ? this.col : 0, cols, area: rows * cols };
    if (rows === 1 && this.col + cols < this.cols) this.col += cols; else { this.row += rows; this.col = 0; }
    return band;
  }
  submitted(band, nowMs) {
    band.submitMs = nowMs; this.pending.add(band);
    this.log.outstandingMax = Math.max(this.log.outstandingMax, this.pending.size);
  }
  completed(band, nowMs, epoch) {
    const wasPending = this.pending.delete(band);
    if (!wasPending || band.epoch !== this.epoch || epoch !== this.epoch || band.generation !== this.generation) return 'stale';
    const ms = nowMs - band.submitMs; this.log.bandMs.push(ms);
    // Adapt the work per band towards targetMs: halve on a slow band, grow by 25% on a fast one.
    // Below one row, split the row into column ranges no smaller than minRange.
    if (ms > this.targetMs) {
      if (this.rowsPerBand > 1) this.rowsPerBand = Math.max(1, Math.floor(this.rowsPerBand / 2));
      else if (this.colsPerBand > this.minRange) { this.colsPerBand = Math.max(this.minRange, Math.floor(this.colsPerBand / 2)); this.log.splits++; }
    } else if (ms < this.targetMs / 2) {
      if (this.colsPerBand < this.cols) this.colsPerBand = Math.min(this.cols, this.colsPerBand * 2);
      else this.rowsPerBand = Math.min(this.rows, Math.ceil(this.rowsPerBand * 1.25));
    }
    this.log.rowsPerBand.push(this.rowsPerBand);
    this.done += band.area;
    return 'current';
  }
  isComplete(generation) { return generation === this.generation && this.done === this.rows * this.cols && this.pending.size === 0; }
  stats() { return { ...this.log, bandMs: [...this.log.bandMs], rowsPerBand: [...this.log.rowsPerBand] }; }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/scheduler.test.mjs`
Expected: PASS, `# pass 5`, `# fail 0`.

- [ ] **Step 5: Write `gpu/view.wgsl` (camera mode)**

It is assembled after `fields.wgsl` and `trace.wgsl`, and reuses `trace_ray`, `field` and `prof`.

```wgsl
// spikes/project0/gpu/view.wgsl — A.1 camera rays for one band; writes depth, status, normal.
struct Camera { origin: vec4f, fwd: vec4f, right: vec4f, up: vec4f, size: vec4u, band: vec4u }   // size = (W, H, 0, 0); band = (row0, rows, col0, cols)
@group(1) @binding(0) var<uniform> cam: Camera;
@group(1) @binding(1) var depth_out: texture_storage_2d<r32float, write>;
@group(1) @binding(2) var status_out: texture_storage_2d<r32uint, write>;
@group(1) @binding(3) var normal_out: texture_storage_2d<rgba16float, write>;
const NORMAL_UNAVAILABLE: u32 = 256u;   // bit 8 of status; the low byte is the ray status, bits 4..7 the reason

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
  let w = f32(cam.size.x);  let h = f32(cam.size.y);  let th = 0.57735026918962576;   // tan(30 deg)
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

- [ ] **Step 6: Write `gpu/present.wgsl` (shade with workgroup coverage counts, then blit)**

```wgsl
// spikes/project0/gpu/present.wgsl — A.5 shading into rgba8unorm, with coverage counters; and the canvas blit.
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
  return textureLoad(display_in, c, 0);   // nearest neighbour: a draft at half the backing size is shown at exactly 2x
}
```

The blit's destination size is a uniform: the canvas backing size, which A.9 resizes. T9
asserts the canvas backing size before every trial.

- [ ] **Step 7: Write `browser/events.js` and `gpu/renderer.js`**

```js
// spikes/project0/browser/events.js — one page clock for every timing event.
const log = [];
export const mark = (type, fields = {}) => { const e = { type, t: performance.now(), ...fields }; log.push(e); return e; };
export const list = () => log.slice();
export const clear = () => { log.length = 0; };
let harnessDepth = 0;
export async function harness(fn) {
  const id = `h${log.length}`; performance.mark(`${id}-start`); harnessDepth++;
  try { return await fn(); } finally { harnessDepth--; performance.mark(`${id}-end`); performance.measure(`harness:${id}`, `${id}-start`, `${id}-end`); }
}
```

```js
// spikes/project0/gpu/renderer.js — WebGPU viewport: bands through the Scheduler, publish on completion.
import { Scheduler } from './scheduler.js';
import { profileWords, buffer } from './webgpu.js';
import { norm, cross } from '../reference/camera.js';
import { currentEpoch } from './device.js';

const FIELD = { bulb: 3, sphere: 0 };
const source = async name => (await fetch(new URL(name, import.meta.url))).text();

export async function prepareViewport(device, onStatus = () => {}) {
  const code = (await source('./fields.wgsl')) + (await source('./trace.wgsl')) + (await source('./view.wgsl'));
  const view = device.createShaderModule({ code, label: 'view' });
  const present = device.createShaderModule({ code: await source('./present.wgsl'), label: 'present' });
  for (const m of [view, present]) { const e = (await m.getCompilationInfo()).messages.filter(x => x.type === 'error'); if (e.length) throw new Error(e.map(x => `${x.lineNum}:${x.linePos} ${x.message}`).join('; ')); }
  onStatus('preparing viewport pipelines');
  const [bulb, sphere, shade, blit] = await Promise.all([
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: view, entryPoint: 'view_band', constants: { FIELD: FIELD.bulb } } }),
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: view, entryPoint: 'view_band', constants: { FIELD: FIELD.sphere } } }),
    device.createComputePipelineAsync({ layout: 'auto', compute: { module: present, entryPoint: 'shade' } }),
    device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: present, entryPoint: 'blit_vs' }, fragment: { module: present, entryPoint: 'blit_fs', targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }] }, primitive: { topology: 'triangle-list' } }),
  ]);
  return { bulb, sphere, shade, blit };
}

export class Renderer {
  // alloc: {texture(device, desc), buffer(device, desc)}; T8's tracker satisfies it, so every viewport allocation can be accounted.
  constructor({ device, viewport, canvas, fixtures, events, alloc = { texture: (d, desc) => d.createTexture(desc), buffer: (d, desc) => d.createBuffer(desc) } }) {
    Object.assign(this, { device, viewport, fixtures, events, alloc, handlers: [], requestSeq: 0, ring: [], ringNext: 0, alive: true });
    this.context = canvas.getContext('webgpu');
    this.context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
    for (let i = 0; i < 3; i++) this.ring.push({ buf: alloc.buffer(device, { size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false });
    this.counts = alloc.buffer(device, { size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    this.targets = null;
  }
  onPublish(h) { this.handlers.push(h); }

  ensureTargets(W, H) {
    if (this.targets?.W === W && this.targets?.H === H) return this.targets;
    this.targets?.all.forEach(t => t.destroy());
    const tex = (format, usage) => this.alloc.texture(this.device, { size: [W, H], format, usage });
    const S = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
    const t = { W, H, depth: tex('r32float', S), status: tex('r32uint', S), normal: tex('rgba16float', S), display: tex('rgba8unorm', S) };
    t.all = [t.depth, t.status, t.normal, t.display];
    return (this.targets = t);
  }

  // override: e.g. {W, H} for A.9's backing-size-dependent draft dimensions. It never changes iterations, steps or tolerances.
  render({ view, profile, camera, label = view, override = {} }) {
    if (Object.keys(override).some(k => !['W', 'H'].includes(k))) throw new Error('render override may only set W and H');
    const fx = this.fixtures, v = fx.views[view], p = { ...fx.profiles[profile], ...(v.traceOverrides || {}), ...override };
    const cam = camera || v.camera;
    const requestId = ++this.requestSeq;
    this.events.mark('request', { requestId, view, profile, label });
    const targets = this.ensureTargets(p.W, p.H);
    if (!this.sched || this.sched.rows !== p.H || this.sched.cols !== p.W) this.sched = new Scheduler({ rows: p.H, cols: p.W });
    const generation = this.sched.request({ requestId });
    this.sched.resetEpoch(currentEpoch());
    const f = norm(cam.target.map((x, i) => x - cam.origin[i])), r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
    this.job = { requestId, generation, label, view, profile: p, pipeline: view === 'sphere' ? this.viewport.sphere : this.viewport.bulb, camera: [cam.origin, f, r, u], targets, admitted: false };
    this.device.queue.writeBuffer(this.counts, 0, new Uint32Array(8));
    this.pump();
    return requestId;
  }

  pump() {
    const job = this.job; if (!job || !this.alive) return;
    let band;
    while ((band = this.sched.next())) {
      if (!job.admitted) { job.admitted = true; this.events.mark('admit', { requestId: job.requestId }); }
      const camWords = new Float32Array(24), camU = new Uint32Array(camWords.buffer);
      job.camera.forEach((vec, i) => camWords.set(vec, 4 * i));
      camU.set([job.profile.W, job.profile.H, 0, 0], 16); camU.set([band.row0, band.rows, band.col0, band.cols], 20);
      const prof = buffer(this.device, new Uint8Array(profileWords(job.profile, 0, 0, 0)), GPUBufferUsage.UNIFORM);
      const camB = buffer(this.device, camWords, GPUBufferUsage.UNIFORM);
      const dummy = buffer(this.device, new Float32Array(4), GPUBufferUsage.STORAGE);
      const pl = job.pipeline;
      const g0 = this.device.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: prof } }, { binding: 1, resource: { buffer: dummy } }] });
      const g1 = this.device.createBindGroup({ layout: pl.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: camB } }, { binding: 1, resource: job.targets.depth.createView() }, { binding: 2, resource: job.targets.status.createView() }, { binding: 3, resource: job.targets.normal.createView() }] });
      const enc = this.device.createCommandEncoder(); const pass = enc.beginComputePass();
      pass.setPipeline(pl); pass.setBindGroup(0, g0); pass.setBindGroup(1, g1); pass.dispatchWorkgroups(Math.ceil(band.cols / 8), Math.ceil(band.rows / 8)); pass.end();
      this.device.queue.submit([enc.finish()]);
      this.sched.submitted(band, performance.now());
      const epoch = currentEpoch();
      this.device.queue.onSubmittedWorkDone().then(() => {
        prof.destroy(); camB.destroy(); dummy.destroy();
        const verdict = this.sched.completed(band, performance.now(), epoch);
        if (verdict === 'stale') { this.events.mark('stale-band', { generation: band.generation }); return; }
        if (this.sched.isComplete(job.generation) && this.job === job) this.finish(job); else this.pump();
      });
    }
  }

  finish(job) {
    const { device } = this, t = job.targets;
    const pl = this.viewport.shade;
    const g = device.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: [{ binding: 0, resource: t.status.createView() }, { binding: 1, resource: t.normal.createView() }, { binding: 2, resource: t.display.createView() }, { binding: 3, resource: { buffer: this.counts } }] });
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(pl); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(t.W / 8), Math.ceil(t.H / 8)); pass.end();
    const slot = this.ring[this.ringNext]; this.ringNext = (this.ringNext + 1) % 3;
    const canRead = !slot.busy; if (canRead) enc.copyBufferToBuffer(this.counts, 0, slot.buf, 0, 32);
    const canvas = this.context.canvas;
    const dstB = buffer(device, new Float32Array([canvas.width, canvas.height, 0, 0]), GPUBufferUsage.UNIFORM);
    const blitGroup = device.createBindGroup({ layout: this.viewport.blit.getBindGroupLayout(0), entries: [{ binding: 0, resource: t.display.createView() }, { binding: 1, resource: { buffer: dstB } }] });
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }] });
    rp.setPipeline(this.viewport.blit); rp.setBindGroup(0, blitGroup); rp.draw(3); rp.end();
    device.queue.submit([enc.finish()]);
    const epoch = currentEpoch();
    const complete = () => {
      dstB.destroy();
      this.events.mark('complete', { requestId: job.requestId });
      const publish = counts => {
        if (epoch !== currentEpoch() || this.job !== job) { this.events.mark('suppressed-publication', { requestId: job.requestId }); return; }
        const e = this.events.mark('publish', { requestId: job.requestId, generation: job.generation, label: job.label, counts });
        for (const h of this.handlers) h({ requestId: job.requestId, generation: job.generation, label: job.label, counts, normalUnavailable: counts?.normalUnavailable ?? null, publishedMs: e.t });
      };
      if (!canRead) return publish(null);
      slot.busy = true;
      slot.buf.mapAsync(GPUMapMode.READ).then(() => {
        const c = new Uint32Array(slot.buf.getMappedRange().slice(0)); slot.buf.unmap(); slot.busy = false;
        publish({ total: c[0], hit: c[1], miss: c[2], point: c[3], steps: c[4], failure: c[5], normalUnavailable: c[6] });
      }, () => { slot.busy = false; publish(null); });
    };
    device.queue.onSubmittedWorkDone().then(complete);
  }

  destroy() { this.alive = false; this.targets?.all.forEach(t => t.destroy()); this.ring.forEach(s => s.buf.destroy()); this.counts.destroy(); }
}
```

These are the publication semantics T9 measures:
- `request`: when `render()` is called;
- `admit`: when the first band is submitted;
- `complete`: when the shade-and-blit submission's queue work is done;
- `publish`: when the counts are available and the generation is still current.

For timing, publication is that application event (spec §5). Visible output is verified
separately (T9 Step 6).

- [ ] **Step 8: Add a viewport smoke driver and run it on the GPU**

In `spikes/project0/browser/drivers.js`, create the T9 driver module with a first `smoke` driver:

```js
// spikes/project0/browser/drivers.js — in-page gate drivers (T9 adds G2, G6–G10, G12, G13).
import { acquire } from '../gpu/device.js';
import { prepareViewport, Renderer } from '../gpu/renderer.js';
import * as events from './events.js';

export async function session(fixtures, status) {
  const { device, info } = await acquire({ requiredFeatures: ['timestamp-query'] });
  const viewport = await prepareViewport(device, status);
  const renderer = new Renderer({ device, viewport, canvas: document.getElementById('view'), fixtures, events });
  return { device, info, viewport, renderer };
}

const once = (renderer, args) => new Promise(resolve => { const id = renderer.render(args); renderer.onPublish(p => { if (p.requestId === id) resolve(p); }); });

export async function runGateDriver(gate, fixtures, params, status) {
  if (gate === 'smoke') {
    const { device, renderer } = await session(fixtures, status);
    const out = [];
    for (const [view, profile] of [['sphere', 'draft'], ['bulb-overview', 'draft'], ['bulb-detail-0.05', 'draft'], ['bulb-stress', 'stress']]) {
      const t0 = performance.now(); const p = await once(renderer, { view, profile }); out.push({ view, profile, ms: p.publishedMs - t0, counts: p.counts, stats: renderer.sched.stats() });
    }
    renderer.destroy(); device.destroy();
    return { slots: [{ slot: 'smoke', raw: { out } }], invalidations: [] };
  }
  throw new Error(`no driver for ${gate}`);
}
```

Run: `node spikes/project0/run.mjs --gate smoke --mode headed`

`metricsFor` has no `smoke` derivation. `run.mjs` records the invalidation
`metrics: no metric derivation for smoke/smoke` and still saves the raw file, as intended for
a development check.

Expected:
- an `evidence:` directory whose `smoke.raw.json` holds four entries with non-null `counts`;
- `counts.total` is 230,400 for each 640 × 360 view;
- `sphere` has `point + steps + failure` = 0;
- `bulb-stress` has `steps / total` ≥ 0.40;
- `stats.outstandingMax` ≤ 2.

If the coverage fractions fall outside the A.6 ranges, that is a finding to investigate against
the CPU coverage figures in `fixtures.coverage`. **Never edit the ranges.**

- [ ] **Step 9: Commit** (after Codex's read-only review)

```bash
git add spikes/project0/gpu/scheduler.js spikes/project0/gpu/view.wgsl spikes/project0/gpu/present.wgsl spikes/project0/gpu/renderer.js spikes/project0/browser/events.js spikes/project0/browser/drivers.js spikes/project0/tests/scheduler.test.mjs
git commit -m "Project 0 T7: bounded band scheduler, camera-mode marcher, shade/coverage and blit; viewport smoke check"
```

---

### Task T8: Resource accounting, the A.8 verification, and loss/recovery (G11, G13)

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).

**Files:**
- `spikes/project0/gpu/resources.js`: a tracked allocator. It counts payload bytes, live
  textures and buffers, and the peak, and accounts for every allocation the harness makes.
- `spikes/project0/gpu/lifecycle.js`: the pure loss and recovery policy. It covers interruption,
  request preservation, epoch-guarded late completions, and stopping automatic retry after a
  repeated loss.
- `spikes/project0/gpu/pattern.wgsl`: the A.8 pattern writers, one entry point per storage format.
- Modify `spikes/project0/gpu/device.js` (T5): synchronous `signalLoss`, `injectLoss()` and `clearLossHandlers()`.
- Modify `spikes/project0/browser/drivers.js`: adds the `G11` and `G13` drivers.
- Modify `spikes/project0/measure.mjs`: adds G11/G13 metric derivation.
- Tests: `spikes/project0/tests/resources.test.mjs` and `spikes/project0/tests/lifecycle.test.mjs`.

**Interfaces:**
- Consumes:
  - T7: `Renderer` (constructor option `track`), `session()`, `events`;
  - T5: `acquire`, `destroy`, `onLoss`, `currentEpoch`;
  - T4: `fixtures.resources.{width, height, entries, tableBytes, capBytes, pattern, readback}`.
- Produces:
  - `BYTES_PER_TEXEL: {r32float: 4, rgba16float: 8, r32uint: 4, rgba32float: 16, rgba8unorm: 4}`;
  - `createTracker() → {track(resource, bytes, kind), texture(device, desc), buffer(device, desc), inventory() → {bytes, textures, buffers, peakBytes}, release(resource)}`.
    `track` wraps `destroy()` so that it decrements the counts exactly once;
  - `textureBytes({size: [w, h], format}) → number`, the payload bytes only (spec A.8 accounting);
  - `new Lifecycle({maxAutomaticRecoveries = 1, windowMs = 60000, now})`, with:
    - `begin(request) → job`;
    - `lost({epoch, reason, injected}) → {action: 'recover' | 'stop', interrupted: job | null}`;
    - `recovered(epoch)`;
    - `acceptCompletion(job, epoch) → boolean`;
    - `stats() → {interruptions, recoveries, automaticRetriesAfterRepeat, stopped}`.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/resources.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker, textureBytes, BYTES_PER_TEXEL } from '../gpu/resources.js';

test('A.8 payload bytes match the frozen table', () => {
  const px = 3840 * 2160;
  assert.equal(textureBytes({ size: [3840, 2160], format: 'rgba32float' }), 16 * px);
  const total = ['r32float', 'rgba16float', 'r32uint', 'rgba16float', 'rgba32float', 'rgba8unorm', 'rgba8unorm']
    .reduce((n, f) => n + BYTES_PER_TEXEL[f] * px, 0) + 2 * 3840 * 4 * 256;
  assert.equal(total, 405995520);
});

test('the tracker counts live resources and the peak, and destroy() releases exactly once', () => {
  const tr = createTracker();
  const fake = () => ({ destroyed: 0, destroy() { this.destroyed++; } });
  const a = tr.track(fake(), 100, 'buffer'), b = tr.track(fake(), 50, 'texture');
  assert.deepEqual(tr.inventory(), { bytes: 150, textures: 1, buffers: 1, peakBytes: 150 });
  a.destroy(); a.destroy();
  assert.deepEqual(tr.inventory(), { bytes: 50, textures: 1, buffers: 0, peakBytes: 150 });
  assert.equal(a.destroyed, 1);
  b.destroy();
  assert.deepEqual(tr.inventory(), { bytes: 0, textures: 0, buffers: 0, peakBytes: 150 });
});
```

```js
// spikes/project0/tests/lifecycle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Lifecycle } from '../gpu/lifecycle.js';

test('a loss interrupts the job, preserves its request and rejects late completions from the old epoch', () => {
  let t = 0; const lc = new Lifecycle({ now: () => t });
  const job = lc.begin({ view: 'bulb-stress', profile: 'settled' });
  const r = lc.lost({ epoch: 1, reason: 'destroyed', injected: false });
  assert.equal(r.action, 'recover'); assert.equal(r.interrupted, job);
  assert.equal(job.state, 'interrupted'); assert.deepEqual(job.request, { view: 'bulb-stress', profile: 'settled' });
  assert.equal(lc.acceptCompletion(job, 1), false);
  lc.recovered(2);
  const again = lc.begin(job.request);
  assert.equal(lc.acceptCompletion(again, 2), true);
});

test('a second loss inside the window stops automatic retry', () => {
  let t = 0; const lc = new Lifecycle({ now: () => t, windowMs: 60000 });
  lc.begin({ a: 1 }); assert.equal(lc.lost({ epoch: 1, injected: true }).action, 'recover'); lc.recovered(2);
  t = 1000; lc.begin({ a: 1 });
  assert.equal(lc.lost({ epoch: 2, injected: true }).action, 'stop');
  assert.equal(lc.stats().automaticRetriesAfterRepeat, 0); assert.equal(lc.stats().stopped, true);
});

test('an interrupted job never reports success', () => {
  const lc = new Lifecycle({ now: () => 0 });
  const job = lc.begin({ x: 1 }); lc.lost({ epoch: 1, injected: true });
  assert.throws(() => lc.succeed(job), /interrupted/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/resources.test.mjs spikes/project0/tests/lifecycle.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `gpu/resources.js` and `gpu/lifecycle.js`.

- [ ] **Step 3: Implement `gpu/resources.js` and `gpu/lifecycle.js`**

```js
// spikes/project0/gpu/resources.js — payload-byte accounting for every harness allocation (spec A.8).
export const BYTES_PER_TEXEL = Object.freeze({ r32float: 4, rgba16float: 8, r32uint: 4, rgba32float: 16, rgba8unorm: 4 });
export function textureBytes({ size: [w, h], format }) {
  if (!(format in BYTES_PER_TEXEL)) throw new Error(`untracked texture format ${format}`);
  return w * h * BYTES_PER_TEXEL[format];
}
export function createTracker() {
  const inv = { bytes: 0, textures: 0, buffers: 0, peakBytes: 0 };
  function track(resource, bytes, kind) {
    const key = kind === 'texture' ? 'textures' : 'buffers';
    inv.bytes += bytes; inv[key]++; inv.peakBytes = Math.max(inv.peakBytes, inv.bytes);
    const original = resource.destroy.bind(resource); let live = true;
    resource.destroy = () => { if (live) { live = false; inv.bytes -= bytes; inv[key]--; original(); } };
    return resource;
  }
  return {
    track,
    texture: (device, desc) => track(device.createTexture(desc), textureBytes(desc), 'texture'),
    buffer: (device, desc) => track(device.createBuffer(desc), desc.size, 'buffer'),
    inventory: () => ({ ...inv }),
  };
}
```

```js
// spikes/project0/gpu/lifecycle.js — loss/recovery policy (pure; spec G13 and charter §3.10).
export class Lifecycle {
  constructor({ maxAutomaticRecoveries = 1, windowMs = 60000, now = () => performance.now() } = {}) {
    Object.assign(this, { maxAutomaticRecoveries, windowMs, now });
    this.epoch = 1; this.current = null; this.recoveryTimes = [];
    this.s = { interruptions: 0, recoveries: 0, automaticRetriesAfterRepeat: 0, stopped: false };
  }
  begin(request) {
    if (this.s.stopped) throw new Error('automatic recovery stopped after a repeated loss');
    this.current = { request: structuredClone(request), epoch: this.epoch, state: 'running' };
    return this.current;
  }
  lost({ epoch }) {
    if (epoch !== this.epoch) return { action: 'ignore', interrupted: null };   // loss of an already-replaced device
    const interrupted = this.current && this.current.state === 'running' ? this.current : null;
    if (interrupted) { interrupted.state = 'interrupted'; this.s.interruptions++; }
    this.epoch++;
    const t = this.now(); this.recoveryTimes = this.recoveryTimes.filter(x => t - x < this.windowMs);
    if (this.recoveryTimes.length >= this.maxAutomaticRecoveries) { this.s.stopped = true; return { action: 'stop', interrupted }; }
    this.recoveryTimes.push(t);
    return { action: 'recover', interrupted };
  }
  recovered(epoch) { this.epoch = epoch; this.s.recoveries++; }
  acceptCompletion(job, epoch) { return job.state === 'running' && job.epoch === this.epoch && epoch === this.epoch; }
  succeed(job) { if (job.state !== 'running') throw new Error(`cannot succeed: job is ${job.state}`); job.state = 'succeeded'; }
  stats() { return { ...this.s }; }
}
```

`recovered(epoch)` aligns the policy epoch with `device.js`'s epoch after reacquisition.
`automaticRetriesAfterRepeat` stays 0 because `stop` performs no retry; the G13 driver asserts
that no `acquire()` follows a `stop`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/resources.test.mjs spikes/project0/tests/lifecycle.test.mjs`
Expected: PASS, `# pass 5`, `# fail 0`.

- [ ] **Step 5: Write `gpu/pattern.wgsl`**

```wgsl
// spikes/project0/gpu/pattern.wgsl — A.8 verification pattern k = (13x + 17y + r) mod 251.
// WGSL fixes one storage format per binding, so each format has its own variable and entry point;
// with layout 'auto' each pipeline's bind group contains only the binding its entry point uses.
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

Several module-scope variables share `@group(0) @binding(1)`. That is valid WGSL, because
only variables statically used by one entry point enter that entry point's interface.

- [ ] **Step 5b: Make loss handling synchronous in `gpu/device.js` (modifies T5)**

A late completion must never be able to publish between a loss and the epoch change. In the
`device.lost.then(...)` handler of `acquire`, replace the handler body with one that advances
the epoch **before** notifying listeners. Then add `injectLoss()`, which routes an injected loss
through the same path:

```js
  device.lost.then(info => { if (epoch === state.epoch) signalLoss({ reason: info.reason, message: info.message, injected: false }); });
```

```js
function signalLoss({ reason, message = '', injected }) {
  const lostEpoch = state.epoch;
  state.epoch++;                                   // first: every in-flight completion is now stale
  for (const h of state.lossHandlers) h({ epoch: lostEpoch, reason, message, injected });
}
// G13: an unexpected-loss notification delivered through the application's recovery path.
// The device is then destroyed, so that no late completion can follow (its epoch is already retired).
export function injectLoss() { signalLoss({ reason: 'unknown', message: 'injected by G13', injected: true }); const d = state.device; state.device = null; d?.destroy(); }
export const clearLossHandlers = () => { state.lossHandlers = []; };
```

The T7 `Renderer` suppresses publication when `epoch !== currentEpoch()`, so the first
statement of `signalLoss` closes the race.

- [ ] **Step 6: Add the G11 driver**

Add to `browser/drivers.js`:

```js
import { createTracker } from '../gpu/resources.js';

const half = x => Math.fround(x);   // rgba16float stores k + 0.25 exactly for k < 251 (11-bit significand)
// Shared by G11 and by G12's every-tenth-cycle step. It never acquires or destroys the device itself.
export async function exerciseResources(device, fixtures, status, tr = createTracker()) {
  const R = fixtures.resources, S = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC;
  const code = await (await fetch(new URL('../gpu/pattern.wgsl', import.meta.url))).text();
  const module = device.createShaderModule({ code });
  const textures = R.entries.filter(e => e.kind === 'texture').flatMap(e => Array.from({ length: e.count }, (_, i) => ({ ...e, index: i })));
  const staging = R.entries.filter(e => e.kind === 'buffer').flatMap(e => Array.from({ length: e.count }, () => tr.buffer(device, { size: e.bytes / e.count, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })));
  const before = tr.inventory();     // G12 passes a tracker that already holds the viewport's resources
  const made = textures.map((e, r) => ({ e, r, tex: tr.texture(device, { size: [R.width, R.height], format: e.format, usage: S }) }));
  status('G11: writing pattern');
  let outstanding = [], outstandingMax = 0, written = 0;
  for (const { e, r, tex } of made) {
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: `write_${e.format}` } });
    for (let row0 = 0; row0 < R.height; row0 += 256) {
      while (outstanding.length >= 2) await outstanding.shift();
      const u = tr.buffer(device, { size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(u, 0, new Uint32Array([r, row0, Math.min(256, R.height - row0), R.width]));
      const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: tex.createView() }] });
      const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(R.width / 16), Math.ceil(Math.min(256, R.height - row0) / 16)); pass.end();
      device.queue.submit([enc.finish()]);
      outstanding.push(device.queue.onSubmittedWorkDone().then(() => u.destroy())); outstandingMax = Math.max(outstandingMax, outstanding.length);
    }
    written++;
  }
  await Promise.all(outstanding);
  const peakBytes = tr.inventory().peakBytes;
  status('G11: verifying');
  const xs = [0, Math.floor(R.width / 2), R.width - 1], ys = [0, Math.floor(R.height / 2), R.height - 1];
  let checks = 0, mismatches = 0; const [stage] = staging;
  for (const { e, r, tex } of made) {
    const enc = device.createCommandEncoder(); let slot = 0;
    for (const y of ys) for (const x of xs) enc.copyTextureToBuffer({ texture: tex, origin: [x, y] }, { buffer: stage, offset: 256 * slot++ }, [1, 1]);
    device.queue.submit([enc.finish()]);
    await stage.mapAsync(GPUMapMode.READ, 0, 256 * 9); const bytes = stage.getMappedRange(0, 256 * 9).slice(0); stage.unmap();
    slot = 0;
    for (const y of ys) for (const x of xs) {
      const kk = (13 * x + 17 * y + r) % 251, at = 256 * slot++;
      const ok = e.format === 'r32uint' ? new Uint32Array(bytes, at, 1)[0] === kk
        : e.format === 'rgba8unorm' ? new Uint8Array(bytes, at, 4).every(v => v === kk)
        : e.format === 'rgba16float' ? [...new Uint16Array(bytes, at, 4)].every(h => f16(h) === half(kk + 0.25))
        : [...new Float32Array(bytes, at, e.format === 'r32float' ? 1 : 4)].every(v => v === kk + 0.25);
      checks++; if (!ok) mismatches++;
    }
  }
  // Full 3840 x 256 RGBA8 band from the in-progress display texture (the first rgba8unorm entry).
  const display = made.find(m => m.e.format === 'rgba8unorm');
  const band = staging[1], enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: display.tex }, { buffer: band, bytesPerRow: R.width * 4 }, [R.width, 256]);
  device.queue.submit([enc.finish()]);
  await band.mapAsync(GPUMapMode.READ); const full = new Uint8Array(band.getMappedRange().slice(0)); band.unmap();
  let bandOk = true;
  for (let y = 0; y < 256 && bandOk; y++) for (let x = 0; x < R.width; x++) if (full[4 * (y * R.width + x)] !== (13 * x + 17 * y + display.r) % 251) { bandOk = false; break; }
  if (!bandOk) mismatches++;
  // Cancellation: a 16-batch rewrite of the first texture is requested; after two submissions it is
  // cancelled. Batches already submitted may finish, but none may be submitted after the cancel.
  let cancelFlag = false, submittedAfterCancel = 0, submittedBeforeCancel = 0;
  const first = made[0], firstPipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: `write_${first.e.format}` } });
  const cancelJob = (async () => {
    for (let i = 0; i < 16; i++) {
      while (outstanding.length >= 2) await outstanding.shift();
      if (cancelFlag) return;
      const u = tr.buffer(device, { size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(u, 0, new Uint32Array([first.r, (i * 128) % R.height, 128, R.width]));
      const bind = device.createBindGroup({ layout: firstPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: first.tex.createView() }] });
      const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
      pass.setPipeline(firstPipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(R.width / 16), 8); pass.end();
      device.queue.submit([enc.finish()]);
      if (cancelFlag) submittedAfterCancel++; else submittedBeforeCancel++;
      outstanding.push(device.queue.onSubmittedWorkDone().then(() => u.destroy()));
      outstandingMax = Math.max(outstandingMax, outstanding.length);
      if (submittedBeforeCancel === 2) cancelFlag = true;           // the cancel request
    }
  })();
  await cancelJob; await Promise.all(outstanding); outstanding = [];
  const cancelled = submittedBeforeCancel === 2 && submittedAfterCancel === 0 ? 1 : 0;
  for (const m of made) m.tex.destroy(); for (const s of staging) s.destroy();
  const after = tr.inventory();
  return { slots: [{ slot: '4k', raw: { tableBytes: R.tableBytes, peakBytes, texturesWritten: written, selectedChecks: checks, mismatches, fullBandBytes: R.width * 4 * 256, cancelled, released: after.bytes === before.bytes && after.textures === before.textures && after.buffers === before.buffers ? 1 : 0, outstandingMax } }], invalidations: peakBytes > R.capBytes ? ['allocation cap exceeded'] : [] };
}
async function g11(fixtures, status) {
  const dev = await import('../gpu/device.js'); const { device } = await dev.acquire();
  try { return await exerciseResources(device, fixtures, status); } finally { dev.destroy(); }
}
const f16 = h => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15); };
```

`cancelled = 1` means exactly two batches were submitted before the cancel and none after it.
The cancelled job's remaining fourteen batches were never issued, and its already-submitted
batches were allowed to drain. The cancellation exercise runs after verification, so it cannot
disturb the checked texels.

Exceeding the allocation cap is a spec §7 abort condition. It is recorded as an invalidation
here, and T10 stops the campaign on it.

- [ ] **Step 7: Add the G13 driver**

Add to `browser/drivers.js`:

```js
import { Lifecycle } from '../gpu/lifecycle.js';

async function g13(fixtures, status) {
  const dev = await import('../gpu/device.js');
  const slots = [];
  for (const type of ['intentional', 'injected']) {
    dev.clearLossHandlers();
    const lc = new Lifecycle();
    let decision = null;
    dev.onLoss(info => { decision = lc.lost({ epoch: lc.epoch, reason: info.reason, injected: info.injected }); });   // synchronous
    let s = await session(fixtures, status);
    const request = { view: 'bulb-stress', profile: 'settled' };      // long enough to be in flight when the loss arrives
    const job = lc.begin(request);
    let successes = 0, latePublications = 0;
    const firstId = s.renderer.render(request);
    s.renderer.onPublish(p => { if (p.requestId === firstId) { if (lc.acceptCompletion(job, dev.currentEpoch())) successes++; else latePublications++; } });
    await new Promise(r => setTimeout(r, 50));                         // bands are in flight
    if (type === 'intentional') { s.device.destroy(); await new Promise(r => { const wait = () => decision ? r() : setTimeout(wait, 5); wait(); }); }
    else dev.injectLoss();
    const interrupted = decision?.interrupted === job && job.state === 'interrupted' ? 1 : 0;
    await new Promise(r => setTimeout(r, 500));                        // any late callbacks fire now, against a retired epoch
    s.renderer.destroy();
    s = await session(fixtures, status); lc.recovered(lc.epoch);
    const again = lc.begin(job.request);
    const frame = await new Promise(resolve => { const id = s.renderer.render(again.request); s.renderer.onPublish(p => { if (p.requestId === id) resolve(p); }); });
    slots.push({ slot: type, raw: { interrupted, successes, requestPreserved: JSON.stringify(again.request) === JSON.stringify(request) ? 1 : 0, latePublications, validRecovery: frame.counts && frame.counts.total > 0 && frame.counts.failure === 0 ? 1 : 0 } });
    if (type === 'injected') {
      // The second injected loss lands inside the recovery window, so the policy must say stop, and the driver must not reacquire.
      const acquiresBefore = dev.currentEpoch();
      decision = null; dev.injectLoss();
      let automaticRetriesAfterRepeat = 0;
      if (decision?.action === 'recover') { automaticRetriesAfterRepeat++; }
      await new Promise(r => setTimeout(r, 500));
      if (dev.currentEpoch() !== acquiresBefore + 1) automaticRetriesAfterRepeat++;   // +1 is the loss itself; more would be a reacquire
      slots.push({ slot: 'repeated', raw: { automaticRetriesAfterRepeat } });
      s.renderer.destroy();
    } else { s.renderer.destroy(); s.device.destroy(); }
  }
  return { slots, invalidations: [] };
}
```

The `intentional` case uses a real `device.destroy()`, and therefore the browser's own
`device.lost` (reason `destroyed`). The `injected` case uses `injectLoss()`. Both reach the same
synchronous `signalLoss`. `successes` counts publications of the interrupted request, so it
must be 0.

Then register both drivers in `runGateDriver`: before its final `throw`, insert
`if (gate === 'G11') return g11(fixtures, status);` and
`if (gate === 'G13') return g13(fixtures, status);`.

- [ ] **Step 8: Extend `measure.mjs` for G11 and G13**

The driver's raw values *are* the metrics: counts and flags taken from the page's own
observations. `measure.mjs` validates their shape so that a malformed or partial driver result
can never pass. Insert into `metricsFor`, before the final `throw`:

```js
  if (gate === 'G11' || gate === 'G13') {
    const keys = { G11: ['tableBytes', 'peakBytes', 'texturesWritten', 'selectedChecks', 'mismatches', 'fullBandBytes', 'cancelled', 'released', 'outstandingMax'],
      G13: slot === 'repeated' ? ['automaticRetriesAfterRepeat'] : ['interrupted', 'successes', 'requestPreserved', 'latePublications', 'validRecovery'] }[gate];
    for (const k of keys) if (!Number.isFinite(raw[k])) throw new Error(`${gate}/${slot}: missing ${k}`);
    if (Object.keys(raw).length !== keys.length) throw new Error(`${gate}/${slot}: unexpected fields`);
    return Object.fromEntries(keys.map(k => [k, raw[k]]));
  }
```

- [ ] **Step 9: Run G11 and G13 on the GPU**

Run:
- `node spikes/project0/run.mjs --gate G11 --mode headed`
- `node spikes/project0/run.mjs --gate G13 --mode headed`

Expected:
- **G11:** `tableBytes 405995520`, `peakBytes` at least that and ≤ 1073741824,
  `texturesWritten 7`, `selectedChecks 63`, `mismatches 0`, `released 1`.
- **G13:** for both `intentional` and `injected`, `interrupted 1`, `successes 0`,
  `requestPreserved 1`, `latePublications 0`, `validRecovery 1`. For `repeated`,
  `automaticRetriesAfterRepeat 0`.

Any deviation is a finding to diagnose, never a threshold to edit.

- [ ] **Step 10: Commit** (after Codex's read-only review)

```bash
git add spikes/project0/gpu/resources.js spikes/project0/gpu/lifecycle.js spikes/project0/gpu/pattern.wgsl spikes/project0/gpu/device.js spikes/project0/browser/drivers.js spikes/project0/measure.mjs spikes/project0/tests/resources.test.mjs spikes/project0/tests/lifecycle.test.mjs
git commit -m "Project 0 T8: tracked allocations, A.8 pattern verification (G11), loss and recovery policy (G13)"
```

---

### Task T9: In-page timing and workload drivers (G1, G2, G6–G10, G12) and their metric derivation

**Owner:** Claude. **Reviewer:** Codex (read-only `review --diff`).

**Files:**
- Create `spikes/project0/browser/paths.js`: motion poses and burst schedules computed from
  `fixtures.motion`, `fixtures.bursts` and `fixtures.anchor`. This is an independent
  implementation, cross-checked against `reference/camera.js` `pose()` in Node.
- Create `spikes/project0/browser/integrity.js`: trial-validity checks (visibility, focus, DPR,
  canvas backing size) and the long-task observer.
- Modify `spikes/project0/browser/drivers.js`: adds the drivers `G1`, `G2`, `timing` (G6+G7+G9),
  `G8`, `G10` and `G12`.
- Modify `spikes/project0/browser/main.js`: G2 starts at module evaluation, with no Node round-trip.
- Modify `spikes/project0/measure.mjs`: adds the G1 parser and the timing-metric derivations.
- Modify `spikes/project0/run.mjs`: adds the G2 multi-launch, the `timing` fan-out into
  G6/G7/G9 records, G12 checkpoints, and moves the `chrome://gpu` capture *after* the
  measurement for G2.
- Tests: `spikes/project0/tests/timing.test.mjs` and `spikes/project0/tests/g1.test.mjs`.

**Interfaces:**
- Consumes:
  - T7: `session()`, `Renderer`, `events`, `Scheduler.stats()`;
  - T8: `createTracker`, `exerciseResources`;
  - T1: `throughput`, `percentile`, `coverageValid`, `gatePlan`;
  - T4: `fixtures.{motion, bursts, anchor, views, profiles, stability, display}`.
- Produces:
  - `posesAt(fixtures, view, seconds) → {origin, target}`;
  - `burstSchedule(fixtures) → [{id, burst, index, offsetMs, camera}]`;
  - `trialIntegrity(canvas) → string[]`: the reasons, if any, that a trial is invalid;
  - `observeLongTasks() → {take(startMs, endMs) → {application, harness, unattributed}}`.
  - `metricsFor` gains these slots, with exactly the `gatePlan` keys:
    - `G1/{headed, headless}`;
    - `G2/{fresh-0…2, warm}`;
    - `G6/<view>/<trial>`;
    - `G7/<trial>`;
    - `G8/<rep>`;
    - `G9/warmed`;
    - `G10/<view>`;
    - `G12/sequence`.
  - `g1Metrics({adapterInfo, chromeGpuText, probeOk}) → {metrics: {nvidia, software, corroborated}, invalidations}`.

**Measurement discipline (applies to every driver here):**
- **One clock:** every timestamp comes from the page clock (`events.mark`, `performance.now()`).
- **No harness traffic inside measured windows:** the Node runner makes no `evaluate()` calls
  inside a measured window. Drivers run their whole schedule themselves and return one result.
  G12 is the exception: it exposes bounded checkpoints that Node polls between cycles.
- **Integrity checks:** each trial records `trialIntegrity()` at its start and end. Any
  reason, such as a hidden window, lost focus, `devicePixelRatio !== 1` or a canvas backing
  other than 1280 × 720, becomes an invalidation. It is never a silently accepted number.
- **Frame coverage in Node:** the raw output carries the per-frame `counts`, and Node applies
  T1's `coverageValid`. A frame with `counts: null` counts as a coverage error.

- [ ] **Step 1: Write the failing Node tests**

```js
// spikes/project0/tests/timing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posesAt, burstSchedule } from '../browser/paths.js';
import { pose, burstRequests } from '../reference/camera.js';
import { metricsFor } from '../measure.mjs';

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

const frame = (t, label = 'bulb-overview', hit = 0.28) => ({ t, label, counts: { total: 1000, hit: hit * 1000, miss: 1000 - hit * 1000, point: 0, steps: 0, failure: 0 } });

test('G6 metrics: completion-driven publications in a 30 s window, with coverage errors counted per frame', () => {
  const frames = Array.from({ length: 950 }, (_, i) => frame(1000 + i * 31.5));
  frames[10].counts = null;
  const m = metricsFor('G6', 'bulb-overview/0', { windowStart: 1000, frames, pendingMax: 1, outstandingMax: 2, integrity: [] }, fixtures);
  assert.deepEqual(Object.keys(m).sort(), ['coverageErrors', 'intervalP95', 'outstandingMax', 'pendingMax', 'published', 'windowMs']);
  assert.equal(m.windowMs, 30000); assert.equal(m.published, 950);   // last frame at 1000 + 949*31.5 = 30893.5 < 31000
  assert.equal(m.coverageErrors, 1);
});

test('G7 latency is the publication of each final request minus its own request time', () => {
  const finals = Array.from({ length: 20 }, (_, b) => ({ requestId: b, requestedMs: b * 1152, publishedMs: b * 1152 + 40 + b }));
  const m = metricsFor('G7', '0', { issued: 400, finals, frames: finals.map(f => frame(f.publishedMs)), outstandingMax: 2, integrity: [] }, fixtures);
  assert.equal(m.requests, 400); assert.equal(m.finals, 20); assert.equal(m.latencyP95, 59);
  const missing = structuredClone(finals); missing[3].publishedMs = null;
  assert.throws(() => metricsFor('G7', '0', { issued: 400, finals: missing, frames: [], outstandingMax: 2, integrity: [] }, fixtures), /final request 3 was never published/);
});

test('G9 classifies long tasks as application, harness or unattributed', () => {
  const m = metricsFor('G9', 'warmed', { windows: 12, longTasks: [{ ms: 60, kind: 'application' }, { ms: 51, kind: 'harness' }, { ms: 40, kind: 'application' }] }, fixtures);
  assert.deepEqual(m, { windows: 12, applicationOver50: 1, unattributedOver50: 0, harnessRecorded: 1 });
});
```

```js
// spikes/project0/tests/g1.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { g1Metrics } from '../measure.mjs';

const gpuText = ['Graphics Feature Status', 'WebGPU: Hardware accelerated', 'GPU0\tVENDOR= 0x10de, DEVICE=0x26b1 *ACTIVE*',
  'GL_RENDERER\tANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA RTX 6000 Ada Generation (0x000026B1)), NVIDIA)', 'Driver vendor\tNVIDIA', 'Driver version\t580.173.02'].join('\n');
const nvidia = { vendor: 'nvidia', architecture: 'lovelace', device: '0x26b1', description: 'NVIDIA RTX 6000 Ada Generation', isFallbackAdapter: false, fallbackSource: 'adapter.info.isFallbackAdapter' };

test('NVIDIA adapter + same-session hardware-accelerated WebGPU + matching active device corroborates', () => {
  assert.deepEqual(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText, probeOk: true }), { metrics: { nvidia: 1, software: 0, corroborated: 1 }, invalidations: [] });
});

test('a software adapter is software even when an NVIDIA device is listed elsewhere', () => {
  const r = g1Metrics({ adapterInfo: { ...nvidia, vendor: 'google', description: 'SwiftShader Device (Subzero)', isFallbackAdapter: true }, chromeGpuText: gpuText, probeOk: true });
  assert.equal(r.metrics.software, 1); assert.equal(r.metrics.nvidia, 0);
});

test('missing or contradictory evidence invalidates rather than failing or passing', () => {
  assert.ok(g1Metrics({ adapterInfo: { ...nvidia, vendor: '', description: '' }, chromeGpuText: gpuText, probeOk: true }).invalidations.length > 0);
  assert.ok(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText.replace('Hardware accelerated', 'Software only, hardware acceleration unavailable'), probeOk: true }).metrics.corroborated === 0);
  assert.ok(g1Metrics({ adapterInfo: { ...nvidia, device: '0x2684' }, chromeGpuText: gpuText, probeOk: true }).invalidations.some(r => /contradict/.test(r)));
  assert.ok(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText, probeOk: false }).invalidations.some(r => /probe/.test(r)));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/timing.test.mjs spikes/project0/tests/g1.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `browser/paths.js`, and a `g1Metrics is not a
function` (or missing export) error.

- [ ] **Step 3: Implement `browser/paths.js` (independent of `reference/camera.js`)**

```js
// spikes/project0/browser/paths.js — A.7 motion from fixture parameters. Written from the spec, not from reference/camera.js.
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

The field names follow T4's `fixture-definition.js`:
`motion.overview.{radius, height, initialAngle, periodSeconds}` and
`motion.detail.{periodSeconds, amplitudeRadians}`.

- [ ] **Step 4: Implement `browser/integrity.js`**

```js
// spikes/project0/browser/integrity.js — trial validity and long-task attribution.
export function trialIntegrity(canvas) {
  const reasons = [];
  if (document.visibilityState !== 'visible') reasons.push(`interference: visibility ${document.visibilityState}`);
  if (!document.hasFocus()) reasons.push('interference: window not focused');
  if (devicePixelRatio !== 1) reasons.push(`interference: devicePixelRatio ${devicePixelRatio}`);
  if (canvas.width !== 1280 || canvas.height !== 720) reasons.push(`interference: canvas backing ${canvas.width}x${canvas.height}`);
  return reasons;
}
export function observeLongTasks() {
  const tasks = []; new PerformanceObserver(list => tasks.push(...list.getEntries())).observe({ type: 'longtask', buffered: true });
  return {
    take(startMs, endMs) {
      const harness = performance.getEntriesByType('measure').filter(m => m.name.startsWith('harness:'));
      return tasks.filter(t => t.startTime >= startMs && t.startTime < endMs).map(t => {
        const overlapsHarness = harness.some(h => h.startTime < t.startTime + t.duration && t.startTime < h.startTime + h.duration);
        const attributed = t.attribution?.some(a => a.containerType === 'window' || a.name === 'self');
        return { ms: t.duration, kind: overlapsHarness ? 'harness' : attributed ? 'application' : 'unattributed' };
      });
    },
  };
}
```

`'self'` attribution means the task ran in this page's own event loop, which makes it
application work unless a harness measure overlaps it. Tasks Chrome cannot attribute to this
frame are `unattributed`, and T1 turns those into invalidations.

- [ ] **Step 5: Add the drivers to `browser/drivers.js`**

```js
import { posesAt, burstSchedule } from './paths.js';
import { trialIntegrity, observeLongTasks } from './integrity.js';
import { createTracker } from '../gpu/resources.js';   // exerciseResources is defined in this module by T8
import { prepare } from '../gpu/webgpu.js';
import { arith, pack } from './checks.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const VIEWS = ['bulb-overview', 'bulb-detail-0.05', 'bulb-detail-0.005'];
const frameOf = p => ({ t: p.publishedMs, label: p.label, requestId: p.requestId, counts: p.counts });

// Completion-driven path: at most one pending request; the next pose is issued when the previous draft publishes.
async function followPath(renderer, fixtures, view, profile, seconds) {
  const frames = []; const t0 = performance.now(); let pending = 0, pendingMax = 0;
  await new Promise(resolve => {
    const issue = () => {
      const s = (performance.now() - t0) / 1000;
      if (s >= seconds) return resolve();
      pending++; pendingMax = Math.max(pendingMax, pending);
      renderer.render({ view, profile, camera: posesAt(fixtures, view, s), label: view });
    };
    renderer.onPublish(p => { if (p.label === view) { pending--; frames.push(frameOf(p)); issue(); } });
    issue();
  });
  return { windowStart: t0, frames, pendingMax };
}

async function timing(fixtures, status) {
  const lt = observeLongTasks(), canvas = document.getElementById('view'), slots = [], longTasks = [];
  let windows = 0;
  for (const view of VIEWS) for (let trial = 0; trial < 3; trial++) {
    const s = await session(fixtures, status);                       // fresh renderer per trial so handlers do not accumulate
    await followPath(s.renderer, fixtures, view, 'draft', 3);          // warm-up, discarded
    const before = trialIntegrity(canvas);
    const run = await followPath(s.renderer, fixtures, view, 'draft', 30);
    const integrity = [...before, ...trialIntegrity(canvas)];
    longTasks.push(...lt.take(run.windowStart, run.windowStart + 30000)); windows++;
    slots.push({ slot: `${view}/${trial}`, gate: 'G6', raw: { ...run, outstandingMax: s.renderer.sched.stats().outstandingMax, integrity } });
    s.renderer.destroy(); s.device.destroy();
  }
  const schedule = burstSchedule(fixtures);
  for (let trial = 0; trial < 3; trial++) {
    const s = await session(fixtures, status);
    await followPath(s.renderer, fixtures, 'bulb-overview', 'draft', 3);
    const before = trialIntegrity(canvas), t0 = performance.now() + 50, issued = [], frames = [];
    s.renderer.onPublish(p => frames.push(frameOf(p)));
    await Promise.all(schedule.map(r => new Promise(resolve => setTimeout(() => {
      const requestId = s.renderer.render({ view: 'bulb-overview', profile: 'draft', camera: r.camera, label: 'bulb-overview' });
      issued.push({ ...r, requestId, requestedMs: performance.now(), lateByMs: performance.now() - (t0 + r.offsetMs) }); resolve();
    }, Math.max(0, t0 + r.offsetMs - performance.now())))));
    await sleep(fixtures.bursts.quietMs);
    const finals = issued.filter(r => r.index === fixtures.bursts.requestsPerBurst - 1)
      .map(r => ({ requestId: r.requestId, requestedMs: r.requestedMs, publishedMs: frames.find(f => f.requestId === r.requestId)?.t ?? null }));
    const late = issued.filter(r => r.lateByMs > 4).length;
    const integrity = [...before, ...trialIntegrity(canvas), ...(late ? [`interference: ${late} burst requests issued >4 ms late`] : [])];
    longTasks.push(...lt.take(t0, performance.now())); windows++;
    slots.push({ slot: String(trial), gate: 'G7', raw: { issued: issued.length, finals, frames, outstandingMax: s.renderer.sched.stats().outstandingMax, integrity } });
    s.renderer.destroy(); s.device.destroy();
  }
  slots.push({ slot: 'warmed', gate: 'G9', raw: { windows, longTasks } });
  return { slots, invalidations: [] };
}

async function g8(fixtures, status) {
  const slots = [];
  for (let rep = 0; rep < 10; rep++) {
    const s = await session(fixtures, status); const frames = [];
    s.renderer.onPublish(p => frames.push(frameOf(p)));
    s.renderer.render({ view: 'bulb-stress', profile: 'stress', label: 'bulb-stress' });
    while (!events.list().some(e => e.type === 'admit')) await sleep(1);   // stress work actually submitted
    const sphereRequested = performance.now();
    const sphereId = s.renderer.render({ view: 'sphere', profile: 'draft', label: 'sphere' });
    while (!frames.some(f => f.requestId === sphereId) && performance.now() - sphereRequested < 5000) await sleep(1);
    await sleep(500);                                                       // any stale stress publication would arrive now
    const sphere = frames.find(f => f.requestId === sphereId);
    slots.push({ slot: String(rep), raw: { stressSubmitted: 1, sphereRequested, sphere: sphere ?? null, stalePublications: frames.filter(f => f.label === 'bulb-stress').length, outstandingMax: s.renderer.sched.stats().outstandingMax } });
    events.clear(); s.renderer.destroy(); s.device.destroy();
  }
  return { slots, invalidations: [] };
}

async function g10(fixtures, status) {
  const s = await session(fixtures, status), slots = [];
  for (const view of VIEWS) {
    const frames = []; s.renderer.onPublish(p => frames.push(frameOf(p)));
    const t0 = performance.now(); const id = s.renderer.render({ view, profile: 'settled', label: view });
    while (!frames.some(f => f.requestId === id) && performance.now() - t0 < 20000) await sleep(2);
    const f = frames.find(x => x.requestId === id);
    slots.push({ slot: view, raw: { requestedMs: t0, frame: f ?? null, prepared: 1, outstandingMax: s.renderer.sched.stats().outstandingMax } });
  }
  s.renderer.destroy(); s.device.destroy();
  return { slots, invalidations: [] };
}
```

- [ ] **Step 6: Add the G1, G2 and G12 drivers, and register them**

```js
// The numerical dispatch runs on the device created from the very adapter whose identity is judged (Codex's G1 rule).
async function g1(fixtures, status, params) {
  const dev = await import('../gpu/device.js');
  const { device, info } = await dev.acquire();
  let probeOk = false;
  try {
    const pipelines = await prepare(device, status);
    const words = await arith(device, pipelines, 'bulb_samples', pack(fixtures.arithmetic.bulb, s => [...s.input, 0]), 64);
    probeOk = words.length >= 4 * 4096 && [...words.subarray(0, 4 * 4096)].every((w, i) => i % 4 !== 0 || w <= 2);
  } catch { probeOk = false; }
  dev.destroy();
  return { slots: [{ slot: params.get('runMode'), raw: { adapterInfo: info, probeOk } }], invalidations: [] };
}

// G2 runs at module evaluation (main.js): this measures from navigation start.
export async function g2(fixtures, status) {
  const statusLog = [];
  const say = text => { status(text); statusLog.push({ t: performance.now(), text, visible: document.getElementById('status').offsetParent !== null }); };
  say('preparing: acquiring GPU');
  const s = await session(fixtures, say);
  const p = await new Promise(resolve => { const id = s.renderer.render({ view: 'bulb-overview', profile: 'draft' }); s.renderer.onPublish(x => { if (x.requestId === id) resolve(x); }); });
  return { slots: [{ slot: 'pending', raw: { navigationMs: p.publishedMs, statusLog, frame: frameOf(p), outstandingMax: s.renderer.sched.stats().outstandingMax } }], invalidations: [] };
}

async function g12(fixtures, status) {
  const dev = await import('../gpu/device.js'), canvas = document.getElementById('view'), cfg = fixtures.stability;
  const tracker = createTracker();
  let unplannedLosses = 0; dev.onLoss(() => { unplannedLosses++; });
  let unhandled = 0; addEventListener('error', () => unhandled++); addEventListener('unhandledrejection', () => unhandled++);
  const s = await session(fixtures, status, tracker);
  const setBacking = ([w, h]) => { canvas.width = w; canvas.height = h; };
  const draftAt = () => ({ W: canvas.width / 2, H: canvas.height / 2 });
  // Baseline: warm every pipeline the sequence uses, then return to 1280x720, drain, release transients.
  await followPath(s.renderer, fixtures, 'bulb-overview', 'draft', 1);
  await exerciseResources(s.device, fixtures, status, tracker);
  setBacking(cfg.baselineBacking); await followPath(s.renderer, fixtures, 'bulb-overview', 'draft', 1);
  await s.device.queue.onSubmittedWorkDone(); await sleep(200);
  const baseline = tracker.inventory();
  window.p0Checkpoints = [];
  const start = performance.now(); let deadlineMisses = 0;
  for (let c = 0; c < cfg.cycleCount; c++) {
    const c0 = start + c * cfg.cycleMs;
    const runFor = async (view, profile, untilMs) => {
      const t0 = performance.now();
      await new Promise(resolve => {
        const issue = () => { if (performance.now() >= untilMs) return resolve(); s.renderer.render({ view, profile, camera: posesAt(fixtures, view, (performance.now() - t0) / 1000), label: view, override: draftAt() }); };
        s.renderer.onPublish(p => { if (p.label === view) issue(); }); issue();
      });
    };
    const [, toSphere, toDetail, toMaintenance] = cfg.phaseOffsetsMs;          // [0, 3000, 4000, 7000, 10000]
    await runFor('bulb-overview', 'draft', c0 + toSphere);
    await runFor('sphere', 'draft', c0 + toDetail);
    await runFor('bulb-detail-0.005', 'draft', c0 + toMaintenance);
    s.renderer.render({ view: 'bulb-stress', profile: 'stress', label: 'bulb-stress', override: draftAt() });
    while (!events.list().some(e => e.type === 'admit')) await sleep(1);
    const sphereId = s.renderer.render({ view: 'sphere', profile: 'draft', label: 'sphere', override: draftAt() });
    await new Promise(resolve => s.renderer.onPublish(p => { if (p.requestId === sphereId) resolve(); }));
    setBacking(cfg.resizeBacking[c % cfg.resizeBacking.length]);
    if ((c + 1) % cfg.resourceEvery === 0) await exerciseResources(s.device, fixtures, status, tracker);
    events.clear();
    if (performance.now() > c0 + cfg.cycleMs) deadlineMisses++;
    else await sleep(c0 + cfg.cycleMs - performance.now());
    window.p0Checkpoints.push({ cycle: c, t: performance.now(), deadlineMisses, unhandled, unplannedLosses, inventory: tracker.inventory() });
  }
  const wallMs = performance.now() - start;
  setBacking(cfg.baselineBacking); await followPath(s.renderer, fixtures, 'bulb-overview', 'draft', 1);
  await s.device.queue.onSubmittedWorkDone(); await sleep(200);
  const final = tracker.inventory();
  const result = { cycles: window.p0Checkpoints.length, wallMs, deadlineMisses, unhandled, unplannedLosses, baseline, final, baselinePrepared: 1, returned1280: canvas.width === 1280 && canvas.height === 720 ? 1 : 0, outstandingMax: s.renderer.sched.stats().outstandingMax };
  s.renderer.destroy(); s.device.destroy();
  return { slots: [{ slot: 'sequence', raw: result }], invalidations: [] };
}
```

`session(fixtures, status, tracker)` gains an optional third parameter. In T7's `session`,
pass `alloc: tracker` to the `Renderer` when it is given:
`new Renderer({ device, viewport, canvas, fixtures, events, ...(tracker ? { alloc: tracker } : {}) })`.

In `runGateDriver`, before the final `throw`, add:
`if (gate === 'timing') return timing(fixtures, status);`,
`if (gate === 'G8') return g8(fixtures, status);`, `if (gate === 'G10') return g10(fixtures, status);`
and `if (gate === 'G12') return g12(fixtures, status);`. `g1` reads `params`, so register it as
`if (gate === 'G1') return g1(fixtures, status, params);`.

In `browser/main.js`, make G2 start immediately at module evaluation, before any other branch.
Insert after the `status` constant:

```js
if (params.get('mode') === 'gate' && params.get('gate') === 'G2') {
  const fixturesPromise = fetch('../fixtures.json').then(r => r.json());
  import('./drivers.js').then(async ({ g2 }) => { window.p0Result = await g2(await fixturesPromise, t => { status.textContent = t; }); })
    .catch(error => { window.p0Result = { error: `${error.name}: ${error.message}` }; });
}
```

The existing `mode=gate` branch must skip `G2`: change its condition to
`params.get('mode') === 'gate' && params.get('gate') !== 'G2'`.

- [ ] **Step 7: Implement the timing derivations and the G1 parser in `measure.mjs`**

Add the imports `throughput`, `percentile` and `coverageValid` from `./metrics.js`. Then insert
before the final `throw` in `metricsFor`:

```js
  const coverageErrors = frames => frames.filter(f => !f.counts || !coverageValid(f.label, f.counts)).length;
  if (gate === 'G6') {
    if (raw.integrity.length) throw Object.assign(new Error(raw.integrity.join('; ')), { invalidation: true });
    const t = throughput(raw.frames.map(f => ({ id: f.requestId, time: f.t })), raw.windowStart, raw.windowStart + 30000);
    const inWindow = raw.frames.filter(f => f.t >= raw.windowStart && f.t < raw.windowStart + 30000);
    return { ...t, pendingMax: raw.pendingMax, coverageErrors: coverageErrors(inWindow), outstandingMax: raw.outstandingMax };
  }
  if (gate === 'G7') {
    if (raw.integrity.length) throw Object.assign(new Error(raw.integrity.join('; ')), { invalidation: true });
    raw.finals.forEach((f, i) => { if (f.publishedMs == null) throw new Error(`final request ${i} was never published`); });
    return { requests: raw.issued, finals: raw.finals.length, latencyP95: percentile(raw.finals.map(f => f.publishedMs - f.requestedMs), 0.95), coverageErrors: coverageErrors(raw.frames), outstandingMax: raw.outstandingMax };
  }
  if (gate === 'G8') {
    return { stressSubmitted: raw.stressSubmitted, latencyMs: raw.sphere ? raw.sphere.t - raw.sphereRequested : Number.MAX_VALUE,
      stalePublications: raw.stalePublications, coverageErrors: raw.sphere ? coverageErrors([raw.sphere]) : 1, outstandingMax: raw.outstandingMax };
  }
  if (gate === 'G9') {
    const over = kind => raw.longTasks.filter(t => t.kind === kind && t.ms > 50).length;
    return { windows: raw.windows, applicationOver50: over('application'), unattributedOver50: over('unattributed'), harnessRecorded: 1 };
  }
  if (gate === 'G10') {
    if (!raw.frame) throw new Error(`${slot}: settled frame never published`);
    return { elapsedMs: raw.frame.t - raw.requestedMs, prepared: raw.prepared, coverageErrors: coverageErrors([raw.frame]), outstandingMax: raw.outstandingMax };
  }
  if (gate === 'G2') {
    const firstPrep = raw.statusLog.find(e => e.text.startsWith('preparing'));
    return { navigationMs: raw.navigationMs, ...(slot === 'warm' ? {} : { emptyProfile: raw.emptyProfile, freshProcess: raw.freshProcess }),
      preparationVisible: firstPrep && firstPrep.visible && firstPrep.t < raw.navigationMs ? 1 : 0, coverageErrors: coverageErrors([raw.frame]), outstandingMax: raw.outstandingMax };
  }
  if (gate === 'G12') {
    const counts = ['textures', 'buffers'].reduce((n, k) => n + Math.abs(raw.final[k] - raw.baseline[k]), 0);
    return { cycles: raw.cycles, wallMs: raw.wallMs, deadlineMisses: raw.deadlineMisses, unhandled: raw.unhandled, unplannedLosses: raw.unplannedLosses,
      countDifferences: counts, byteRelativeDifference: Math.abs(raw.final.bytes - raw.baseline.bytes) / raw.baseline.bytes,
      baselinePrepared: raw.baselinePrepared, returned1280: raw.returned1280, outstandingMax: raw.outstandingMax };
  }
  if (gate === 'G1') {
    const { metrics, invalidations } = g1Metrics(raw);
    if (invalidations.length) throw Object.assign(new Error(invalidations.join('; ')), { invalidation: true });
    return metrics;
  }
```

Then add the G1 parser:

```js
// G1 (Codex's corroboration rule): judge the *selected* adapter, corroborated by the same session's chrome://gpu.
export function g1Metrics({ adapterInfo: a, chromeGpuText: text, probeOk }) {
  const invalidations = [];
  const desc = `${a.vendor} ${a.architecture} ${a.description}`;
  if (!a.vendor && !a.description) invalidations.push('adapter.info is redacted or empty');
  const software = a.isFallbackAdapter === true || /swiftshader|llvmpipe|lavapipe|software/i.test(desc) ? 1 : 0;
  const nvidia = !software && /nvidia/i.test(desc) ? 1 : 0;
  const webgpuRow = /^WebGPU:\s*(.+)$/m.exec(text)?.[1]?.trim();
  if (!webgpuRow) invalidations.push('chrome://gpu has no WebGPU feature-status row');
  const active = /VENDOR\s*=\s*0x([0-9a-f]+),\s*DEVICE\s*=\s*0x([0-9a-f]+)[^\n]*\*ACTIVE\*/i.exec(text);
  if (!active) invalidations.push('chrome://gpu identifies no active GPU');
  const driver = /Driver vendor\s+(.+)/.exec(text) && /Driver version\s+(.+)/.exec(text);
  if (!driver) invalidations.push('chrome://gpu has no driver information');
  if (active && /^0x[0-9a-f]+$/i.test(a.device || '') && parseInt(a.device, 16) !== parseInt(active[2], 16)) invalidations.push(`adapter device ${a.device} contradicts the active GPU 0x${active[2]}`);
  if (!probeOk) invalidations.push('probe dispatch did not complete on the selected adapter');
  const corroborated = nvidia && webgpuRow === 'Hardware accelerated' && active && active[1].toLowerCase() === '10de' && driver && probeOk && invalidations.length === 0 ? 1 : 0;
  return { metrics: { nvidia, software, corroborated }, invalidations };
}
```

`run.mjs` must treat an error carrying `invalidation: true` exactly like any other
`metricsFor` failure: it records the reason as an invalidation. The T6 catch block already
does this.

- [ ] **Step 8: Extend `run.mjs`**

There are four changes:
- (a) **The `timing` fan-out:** each returned slot carries its own `gate` (G6, G7 or G9). The
  record uses `slot.gate ?? gate`.
- (b) **G1:** pass `&runMode=${mode}` in the URL. `raw.chromeGpuText` is the capture from the
  same session, injected by Node before `metricsFor`.
- (c) **G2 needs a fresh browser process per slot:**
  - add `runG2()`, which launches three times, each with `launchChrome` and therefore a new
    empty profile and process;
  - navigate *first*, and capture `chrome://gpu` only after `p0Result`, so the capture cannot
    warm the GPU process before the measurement;
  - set `emptyProfile: 1` and `freshProcess: 1` from launcher facts: `freshProfile` threw if
    the directory existed or was not empty, and `launchPersistentContext` started a new
    process;
  - then `page.reload()` in the last session gives the `warm` slot.
- (d) **G12 checkpoints:** while waiting for `p0Result`, poll
  `window.p0Checkpoints?.length` every 15 s. Write any new checkpoints to
  `checkpoint-<n>.json` in the run directory. The poll is a bounded `evaluate` of a small array,
  and G12 has no latency threshold.

```js
// in runGate, replacing the single waitForFunction for p0Result:
let result;
if (gate === 'G12') {
  let written = 0;
  for (;;) {
    result = await page.evaluate(() => window.p0Result ?? null);
    const cps = await page.evaluate(n => (window.p0Checkpoints || []).slice(n), written);
    for (const cp of cps) await writeFile(resolve(runDir, `checkpoint-${written++}.json`), JSON.stringify(cp));
    if (result) break;
    await new Promise(r => setTimeout(r, 15000));
  }
} else result = await page.waitForFunction(() => window.p0Result, null, { timeout: timeoutMs, polling: 1000 }).then(h => h.jsonValue());
// per slot:
const slotGate = slotRow.gate ?? gate;
const raw = slotGate === 'G1' ? { ...slotRow.raw, chromeGpuText } : slotRow.raw;
```

```js
export async function runG2({ args = 'attempt1', campaign = 'dev' } = {}) {
  const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
  const fixture = await fixtureIdentity(), implementation = await implementationIdentity();
  const runDir = await newRunDir(`${campaign}-g2-headed`), server = await ensureServer(), records = [];
  try {
    for (let i = 0; i < 3; i++) {
      const { context, requestedArgs, profile } = await launchChrome({ headless: false, args: LAUNCH[args], profileKind: `g2-fresh-${i}`, chromium });
      try {
        const page = await context.newPage();
        await page.goto(`${server.url}${HARNESS_PATH}?mode=gate&gate=G2`);
        const result = await page.waitForFunction(() => window.p0Result, null, { timeout: 60000 }).then(h => h.jsonValue());
        const slots = [{ slot: `fresh-${i}`, raw: { ...result.slots[0].raw, emptyProfile: 1, freshProcess: 1 } }];
        if (i === 2) {
          await page.reload();
          const warm = await page.waitForFunction(() => window.p0Result, null, { timeout: 60000 }).then(h => h.jsonValue());
          slots.push({ slot: 'warm', raw: warm.slots[0].raw });
        }
        const commandLine = await effectiveCommandLine(context); assertSandboxed(commandLine);   // after the measurement
        const gpuPage = await context.newPage(); await gpuPage.goto('chrome://gpu'); await gpuPage.waitForTimeout(1500);
        const chromeGpuText = await gpuPage.locator('body').innerText();
        const browserVersion = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
        const identity = { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity({ requestedArgs, mode: 'headed', commandLine }),
          ...environmentIdentity(chromeGpuText, { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], session: process.env.XDG_SESSION_TYPE || 'unknown' }) };
        for (const { slot, raw } of slots) {
          const invalidations = []; let metrics = {};
          try { metrics = metricsFor('G2', slot, raw, fixtures); } catch (e) { invalidations.push(`metrics: ${e.message}`); }
          const record = { schema: 1, id: `G2-${slot}-${runDir.split('/').at(-1)}`, gate: 'G2', slot, identity, invalidations, metrics };
          records.push(await writeRecord(runDir, record, [{ name: `${record.id}.raw.json`, data: JSON.stringify({ raw, profile }) }]));
        }
      } finally { await context.close(); }
    }
  } finally { await server.stop(); }
  return { records, runDir };
}
```

Then route the CLI: `if (values.gate === 'G2') await runG2(values)`, else `runGate`.

- [ ] **Step 9: Run the Node tests to verify they pass**

Run: `node --test spikes/project0/tests/timing.test.mjs spikes/project0/tests/g1.test.mjs`
Expected: PASS, `# pass 7`, `# fail 0`.

The paths test reads the frozen `fixtures.json`. A disagreement with `reference/camera.js` is a
harness bug: fix `paths.js`, never the reference or the fixture.

- [ ] **Step 10: Run every driver once, as a development campaign**

Each of these runs headed, in the foreground, with no other window covering it:

```bash
node spikes/project0/run.mjs --gate G1 --mode headed && node spikes/project0/run.mjs --gate G1 --mode headless
node spikes/project0/run.mjs --gate G2
node spikes/project0/run.mjs --gate timing --mode headed      # ~6 min: 12 warmed 30 s trials
node spikes/project0/run.mjs --gate G8 --mode headed
node spikes/project0/run.mjs --gate G10 --mode headed
node spikes/project0/run.mjs --gate G12 --mode headed         # ~11 min
```

Expected:
- every run prints one metrics line per slot with the `gatePlan` keys, or an explicit
  `INVALIDATIONS` list;
- every run writes an `evidence:` directory;
- G12 also writes 60 `checkpoint-*.json` files.

Development runs are campaign `dev` and never qualify. Do not judge pass or fail here. T10
runs the qualifying campaign and evaluates it, and in T10 the numbers are what they are.

- [ ] **Step 11: Commit** (after Codex's read-only review)

```bash
git add spikes/project0/browser/paths.js spikes/project0/browser/integrity.js spikes/project0/browser/drivers.js spikes/project0/browser/main.js spikes/project0/gpu/renderer.js spikes/project0/measure.mjs spikes/project0/run.mjs spikes/project0/tests/timing.test.mjs spikes/project0/tests/g1.test.mjs
git commit -m "Project 0 T9: in-page timing drivers (G1, G2, G6-G10, G12), integrity invalidations and metric derivation"
```

---

### Task T10: Formal WebGPU qualification campaign and the permitted remediation cycle

**Owner:** Claude runs it. Classification, the remediation decision and every interpretation
are made **jointly with Codex** under the collaboration protocol, and are logged verbatim.

**Files:**
- `spikes/project0/qualify.mjs`: loads a campaign, verifies artefact hashes, recomputes every
  metric from raw artefacts, and evaluates every gate.
- `spikes/project0/campaign.mjs`: runs the gates in order under one campaign name and writes
  the selection manifest.
- `spikes/project0/launch-remediation.json`: created only if the remediation is a launch
  change.
- Test: `spikes/project0/tests/qualify.test.mjs`.

**Interfaces:**
- Consumes:
  - T1: `evaluateGate`, `gatePlan`, `decideBackends`, `canonical`;
  - T5: `sha256`, `fixtureIdentity`;
  - T6/T9: `runGate`, `runG2`, `metricsFor`.
- Produces:
  - `buildManifest(records, fixture) → {fixture, trials: {'G/slot': {id, identity}}}`. It
    throws on duplicate slots, mixed fixture identity, or campaign `dev` records;
  - `loadCampaign(manifestPath) → {manifest, records}`;
  - `recompute(records, fixtures, runRoot) → records`. It re-hashes every artefact, rederives
    metrics from `*.raw.json`, and throws on any hash mismatch or metric difference;
  - `qualify(manifest, records, fixtures, {remediationClosed}) → {backend: {remediationClosed, gates: {G1..G13: result}}, decision}`;
  - `ABORTS`, the spec §7 stop conditions. Each is detected from a record as
    `(record) → reason | null`.

**Campaign order.** It runs cheapest first, so that a hard failure stops expensive work early:
1. G1 headed and headless;
2. G4, G5, G3;
3. G11;
4. G2;
5. `timing` (G6, G7, G9);
6. G8;
7. G10;
8. G13;
9. G12.

**Abort conditions (spec §7)** stop the campaign at once. The campaign preserves the smallest
reproducer, which is the record plus its run directory, and reports. It does **not** retry. The
conditions are:
- `unplannedLosses > 0`, or a lost device outside G13;
- a `page.waitForFunction` timeout, meaning a browser hang;
- `peakBytes > capBytes`;
- `software = 1` or an invalidation naming a software adapter;
- a 5-second stall: a band whose `doneMs - submitMs` exceeds 5000 in any `stats().bandMs`.

Gates not yet run become `not run`, with `blockedBy` set **only** when the stop was caused by a
measured `fail` (the T1 decision rule). Every other stop is `invalid/inconclusive`.

- [ ] **Step 1: Write the failing tests**

```js
// spikes/project0/tests/qualify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, ABORTS } from '../qualify.mjs';

const identity = { backend: 'webgpu', fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64), implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64), launchHash: 'f'.repeat(64), browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's', mode: 'headed' };
const fixture = { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) };
const rec = (gate, slot, extra = {}) => ({ schema: 1, id: `${gate}-${slot}-run`, gate, slot, identity, invalidations: [], artifacts: [], metrics: {}, campaign: 'webgpu-1', ...extra });

test('the manifest selects each slot exactly once and refuses development or mixed evidence', () => {
  const m = buildManifest([rec('G4', 'bulb-samples'), rec('G5', 'qjulia-plane')], fixture);
  assert.deepEqual(Object.keys(m.trials).sort(), ['G4/bulb-samples', 'G5/qjulia-plane']);
  assert.throws(() => buildManifest([rec('G4', 'bulb-samples'), rec('G4', 'bulb-samples', { id: 'other' })], fixture), /duplicate/);
  assert.throws(() => buildManifest([rec('G4', 'bulb-samples', { campaign: 'dev' })], fixture), /development/);
  assert.throws(() => buildManifest([rec('G4', 'bulb-samples', { identity: { ...identity, fixtureHash: '9'.repeat(64) } })], fixture), /fixture/);
});

test('abort conditions are detected from records', () => {
  const reasons = r => ABORTS.map(f => f(r)).filter(Boolean);
  assert.deepEqual(reasons(rec('G12', 'sequence', { metrics: { unplannedLosses: 1 } })), ['unexpected device loss']);
  assert.deepEqual(reasons(rec('G11', '4k', { metrics: { peakBytes: 2 ** 31 }, invalidations: ['allocation cap exceeded'] })), ['allocation cap exceeded']);
  assert.deepEqual(reasons(rec('G1', 'headed', { metrics: { nvidia: 0, software: 1, corroborated: 0 } })), ['software execution detected']);
  assert.deepEqual(reasons(rec('G6', 'bulb-overview/0', { metrics: { published: 900 } })), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test spikes/project0/tests/qualify.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `spikes/project0/qualify.mjs`.

- [ ] **Step 3: Implement `qualify.mjs`**

```js
// spikes/project0/qualify.mjs — campaign selection, artefact verification, metric recomputation, gate evaluation.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { canonical, GATES } from './contract.js';
import { evaluateGate } from './gates.js';
import { decideBackends } from './decision.js';
import { sha256 } from './evidence.mjs';
import { metricsFor } from './measure.mjs';
import { ROOT } from './launch.mjs';

export function buildManifest(records, fixture) {
  const trials = {};
  for (const r of records) {
    if (r.campaign === 'dev') throw new Error(`development record ${r.id} cannot qualify`);
    for (const k of ['fixtureHash', 'fixtureCommit', 'specHash']) if (r.identity[k] !== fixture[k]) throw new Error(`record ${r.id}: fixture identity differs`);
    const key = `${r.gate}/${r.slot}`;
    if (trials[key]) throw new Error(`duplicate selection for ${key}`);
    trials[key] = { id: r.id, identity: r.identity };
  }
  return { fixture, trials };
}

export const ABORTS = [
  r => (r.metrics?.unplannedLosses > 0 || r.invalidations.some(x => /device lost/.test(x))) ? 'unexpected device loss' : null,
  r => r.invalidations.some(x => /allocation cap exceeded/.test(x)) ? 'allocation cap exceeded' : null,
  r => (r.metrics?.software === 1 || r.invalidations.some(x => /software adapter/.test(x))) ? 'software execution detected' : null,
  r => r.invalidations.some(x => /browser hang|timeout/i.test(x)) ? 'browser hang' : null,
  r => r.invalidations.some(x => /no observable progress/.test(x)) ? 'submission stalled for 5 s' : null,
];

export async function loadCampaign(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const root = resolve(ROOT, 'artifacts/project0'), records = [];
  for (const dir of manifest.runDirs) for (const name of await readdir(join(root, dir))) {
    if (!name.endsWith('.json') || name.includes('.raw.') || name.startsWith('checkpoint-')) continue;
    const r = JSON.parse(await readFile(join(root, dir, name), 'utf8'));
    if (manifest.trials[`${r.gate}/${r.slot}`]?.id === r.id) records.push(r);
  }
  return { manifest, records };
}

export async function recompute(records, fixtures) {
  const root = resolve(ROOT, 'artifacts/project0');
  for (const r of records) {
    for (const a of r.artifacts) if (sha256(await readFile(join(root, a.path))) !== a.sha256) throw new Error(`artifact hash mismatch: ${a.path}`);
    const rawArtifact = r.artifacts.find(a => a.path.endsWith('.raw.json'));
    if (!rawArtifact || r.invalidations.length) continue;
    const raw = JSON.parse(await readFile(join(root, rawArtifact.path), 'utf8'));
    const again = metricsFor(r.gate, r.slot, raw.raw ?? raw, fixtures);
    if (canonical(again) !== canonical(r.metrics)) throw new Error(`metrics for ${r.id} do not recompute from its raw artefact`);
  }
  return records;
}

export function qualify(manifest, records, fixtures, { remediationClosed = false } = {}) {
  const gates = Object.fromEntries(GATES.map(g => [g, manifest.notRun?.[g] ?? evaluateGate(g, records, manifest, fixtures)]));
  const backend = { remediationClosed, gates };
  return { backend, decision: decideBackends(backend) };
}
```

Both G1 and the evaluator need the raw `chromeGpuText`. `run.mjs` (T9 Step 8b) stores G1's raw
together with that capture, so `recompute` sees exactly what `metricsFor` saw.

- [ ] **Step 4: Implement `campaign.mjs`**

```js
// spikes/project0/campaign.mjs — node spikes/project0/campaign.mjs --name webgpu-1 [--args attempt1|remediation] [--gates G1,G4,...]
import { parseArgs } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './launch.mjs';
import { runGate, runG2 } from './run.mjs';
import { fixtureIdentity } from './evidence.mjs';
import { buildManifest, ABORTS, recompute, qualify } from './qualify.mjs';

const ORDER = [['G1', 'headed'], ['G1', 'headless'], ['G4', 'headless'], ['G5', 'headless'], ['G3', 'headless'], ['G11', 'headed'], ['G2', 'headed'], ['timing', 'headed'], ['G8', 'headed'], ['G10', 'headed'], ['G13', 'headed'], ['G12', 'headed']];
const { values } = parseArgs({ options: { name: { type: 'string' }, args: { type: 'string', default: 'attempt1' }, gates: { type: 'string' }, reuse: { type: 'string' } } });
if (!/^[a-z0-9-]+$/.test(values.name || '') || values.name === 'dev') throw new Error('--name must be a non-dev campaign name');
const only = values.gates?.split(',');
const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
const fixture = await fixtureIdentity();
const records = [], runDirs = [], notRun = {}; let stopped = null;
for (const [gate, mode] of ORDER) {
  if (only && !only.includes(gate)) continue;
  if (stopped) { (gate === 'timing' ? ['G6', 'G7', 'G9'] : [gate]).forEach(g => { notRun[g] = { gate: g, status: 'not run', reason: `campaign stopped: ${stopped}`, evidenceIds: [], reasons: [] }; }); continue; }
  let out;
  try { out = gate === 'G2' ? await runG2({ args: values.args, campaign: values.name }) : await runGate({ gate, mode, args: values.args, campaign: values.name }); }
  catch (error) { stopped = `${gate}: ${/Timeout/.test(error.message) ? 'browser hang' : error.message}`; continue; }
  out.records.forEach(r => { r.campaign = values.name; }); records.push(...out.records); runDirs.push(out.runDir.split('/').at(-1));
  const abort = out.records.flatMap(r => ABORTS.map(f => f(r)).filter(Boolean));
  if (abort.length) stopped = `${gate}: ${abort.join(', ')}`;
}
const manifest = { ...buildManifest(records, fixture), campaign: values.name, args: values.args, runDirs, notRun, stopped, reuse: values.reuse ? JSON.parse(values.reuse) : [] };
await recompute(records, fixtures);
const { backend, decision } = qualify(manifest, records, fixtures);
const dir = resolve(ROOT, 'docs/reports/project0'); await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, `${values.name}-manifest.json`), JSON.stringify(manifest, null, 2));
await writeFile(resolve(dir, `${values.name}-gates.json`), JSON.stringify({ backend, decision }, null, 2));
for (const [g, r] of Object.entries(backend.gates)) console.log(`${g}: ${r.status}${r.reasons?.length ? ` — ${r.reasons.slice(0, 3).join('; ')}` : ''}`);
console.log(`decision (before remediation is closed): ${decision.outcome} — next: ${decision.next}${stopped ? `\nSTOPPED: ${stopped}` : ''}`);
```

For each `notRun` entry the campaign writes `status: 'not run'` but no `blockedBy`. The joint
review in Step 7 adds `blockedBy` only where a recorded measured `fail` caused the stop. That
is a human-reviewed edit, logged and committed, never inferred by the script.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test spikes/project0/tests/qualify.test.mjs`
Expected: PASS, `# pass 2`, `# fail 0`.

Then run the whole Project 0 Node suite:
`node --test spikes/project0/tests/*.test.mjs`
Expected: every test passes, `# fail 0`.

- [ ] **Step 6: Commit the campaign tooling, then run the qualifying campaign**

```bash
git add spikes/project0/qualify.mjs spikes/project0/campaign.mjs spikes/project0/tests/qualify.test.mjs
git commit -m "Project 0 T10: campaign selection manifest, artefact verification and gate qualification"
node spikes/project0/campaign.mjs --name webgpu-1
```

Expected, mechanically:
- one status line per gate, `G1` to `G13`;
- the decision line;
- `docs/reports/project0/webgpu-1-manifest.json` and `webgpu-1-gates.json`.

The plan cannot predict hardware outcomes. Any of `WebGPU selected`, `inconclusive` (pending
remediation) or `STOPPED` is a valid result of this step. The harness implementation must be
committed before the run (Step 6 commits first), because `implementationIdentity()` refuses
uncommitted harness files.

- [ ] **Step 7: Joint review and the single remediation cycle**

1. Archive the plan log, then send Codex a `consult`/`resume` message containing the gate
   table and the run directories. Log it verbatim.
2. **If every gate passed:** review the evidence jointly. Set `remediationClosed: true` with the
   note "no remediation needed", re-run `qualify` (`node -e` over `loadCampaign`/`qualify`, or
   rerun `campaign.mjs` with `--gates` for no gates), record the outcome, and go to T12.
3. **Otherwise:** agree jointly on one classification per failed or invalid gate. The
   classifications are:
   - *implementation defect*;
   - *launch or configuration problem*;
   - *backend limitation or persistent failure*;
   - *evidence not collectable*, which is inconclusive.

   Write the agreed classifications to `docs/reports/project0/webgpu-remediation.md`, verbatim
   from the exchange.
4. **Make one documented change set** addressing the identified failures:
   - **a code fix:** commit it, with a test that fails without it;
   - **or a launch change:** create `spikes/project0/launch-remediation.json` with the exact
     flags. For example `["--enable-gpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan", "--enable-unsafe-webgpu"]`.
     Add `remediation: JSON.parse(readFileSync('spikes/project0/launch-remediation.json'))`
     to `LAUNCH` in `run.mjs`, then commit;
   - **never both, and never twice.**
5. **Re-run the affected gates and their dependent correctness checks:**
   `node spikes/project0/campaign.mjs --name webgpu-remediation --args <attempt1|remediation> --gates <list> --reuse '<json list of {gate, slot, fromCampaign, reason}>'`.
   The original evidence stays.
   - A launch change re-runs **every** gate, because the configuration identity changed.
   - Reused trials keep their original identity and must name a reason.
6. **Close the cycle:**
   - mark `remediationClosed: true` and record the final `decideBackends` outcome in
     `docs/reports/project0/webgpu-decision.json`;
   - if the outcome depends on `--enable-unsafe-webgpu`, write that dependence into the decision
     file in plain words, for the report.
7. **Commit:**

```bash
git add docs/reports/project0/
git commit -m "Project 0 T10: WebGPU qualification evidence, remediation record and decision"
```

**Outcomes:**
- **WebGPU selected:** go to T12, then T13.
- **WebGPU unqualified after the cycle:** go to T11, then stop for the addendum.
- **Inconclusive:** go to T13 and report it. Do not convert it into a failure.

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
  `['acquire', 'info', 'prepare', 'traceList', 'arith', 'createRenderer', 'exerciseResources', 'injectLoss', 'onLoss', 'currentEpoch', 'destroy']`,
  and `assertBackend(obj)`. The WebGPU modules satisfy the interface through
  `gpu/backend-webgpu.js`; the WebGL addendum must satisfy the same list.

- [ ] **Step 1: Write the failing conformance test**

```js
// spikes/project0/tests/backend.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKEND_METHODS, assertBackend } from '../gpu/backend.js';
test('the backend interface is frozen and enforced', () => {
  assert.ok(Object.isFrozen(BACKEND_METHODS));
  assert.throws(() => assertBackend({ acquire() {} }), /missing backend method: info/);
  assert.doesNotThrow(() => assertBackend(Object.fromEntries(BACKEND_METHODS.map(m => [m, () => {}]))));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test spikes/project0/tests/backend.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `gpu/backend.js`**

```js
// spikes/project0/gpu/backend.js — the only surface gate drivers may depend on once a second backend exists.
export const BACKEND_METHODS = Object.freeze(['acquire', 'info', 'prepare', 'traceList', 'arith', 'createRenderer', 'exerciseResources', 'injectLoss', 'onLoss', 'currentEpoch', 'destroy']);
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
| Resource accounting | `createTracker` payload bytes | the same byte accounting per texture/renderbuffer/buffer; the same 1 GiB cap |
| Loss and recovery | `device.lost`, `device.destroy()`, injected `signalLoss` | `webglcontextlost`/`restored`, `WEBGL_lose_context.loseContext()`, injected `signalLoss` |

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

### Task T12: Precision experiment (A.10/A.11) on the selected backend

**Owner:** Claude writes `compensated.wgsl` and the driver. Codex's T3 references define the
comparison. The interpretation is joint. This task runs only after a backend is selected. It is
**not** a backend gate.

**Files:**
- `spikes/project0/gpu/compensated.wgsl`: the float-float primitives (with the rounding
  barrier) and the compensated bulb marcher `trace_ff_list`.
- `spikes/project0/browser/precision.js`: primitive validation, baseline and compensated
  traces, and the cost protocol.
- Modify `spikes/project0/measure.mjs`: adds `precisionMetrics`.
- `spikes/project0/precision.mjs`: the Node entry point.
- Test: `spikes/project0/tests/precision.test.mjs`.

**Interfaces:**
- Consumes:
  - T3/T4: `fixtures.precision.results[d].{distance, originPairs, roundedOrigin, rows[].effectiveDirection, stopReasons}`,
    `fixtures.primitives`, `fixtures.costProtocol`;
  - `comparePrecision(set, actual, variant)` from `reference/preparation.js`, which is Codex's
    comparison, used unchanged;
  - T6: `traceList`, `profileWords`.
- Produces: per-distance results
  `{distance, baseline: {vsRequested, vsBaselineInput}, compensated: {vsRequested, vsCompensatedInput}, costMs: {baseline: {median, min, max}, compensated: {...}}, readbackMs, extraBytes}`
  plus `primitives: {cases, failures}`.

**Compensated dataflow (A.11, verbatim semantics).**
- **Float-float pairs:** the camera origin O, the ray parameter t, and the sample position
  p = O + t·d_ray, computed in pair arithmetic.
- **The iterate:** the Cartesian iterate is held as pairs between steps. Each step evaluates
  P₈ on `round_f32(z)` in ordinary f32, then performs `add_ff((P₈, 0), p)`.
- **Ordinary f32:** r, θ, φ, the trigonometric evaluation, `dr`, the estimator and the normals.
- **The rounding barrier:** every `two_sum` and `quick_two_sum` multiplies an intermediate by
  `one`, which is read from a uniform the compiler cannot see (`barrier.one = 1.0`). That
  prevents reassociation; WGSL permits reassociation and fusion, so this is required. The
  primitive validation decides whether it worked.

- [ ] **Step 1: Write the failing Node test (decoding + comparison wiring)**

```js
// spikes/project0/tests/precision.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { precisionMetrics } from '../measure.mjs';

const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
test('a perfect GPU echo of the primary CPU result shows no disagreement at the first distance', () => {
  const set = fixtures.precision.results[0];
  const echo = set.rows.map(r => ({ id: r.id, status: r.baselineInput.primary.status, reason: r.baselineInput.primary.reason ?? null, t: r.baselineInput.primary.t }));
  const m = precisionMetrics(set, { baseline: echo, compensated: echo });
  assert.equal(m.baseline.vsBaselineInput.statusDisagreements, 0);
  assert.equal(m.baseline.vsBaselineInput.largeDepthErrors, 0);
});
test('primitive validation fails when the low component is dropped', () => {
  const p = fixtures.primitives.find(x => x.op === 'two_sum' && 'thenAdd' in x);   // two_sum(1, 2^-25), then add (-1, 0)
  const dropped = { hi: 1, lo: 0, thenHi: 0, thenLo: 0 };                           // what a reassociated two_sum would return
  assert.throws(() => precisionMetrics(fixtures.precision.results[0], { primitives: [{ ...p, got: dropped }] }), /primitive two_sum/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test spikes/project0/tests/precision.test.mjs`
Expected: FAIL (`precisionMetrics` is not exported).

- [ ] **Step 3: Implement `precisionMetrics` in `measure.mjs`**

```js
import { comparePrecision } from './reference/preparation.js';
export function precisionMetrics(set, { baseline, compensated, primitives = [] }) {
  // fixtures.primitives: {op, args, value (exact real, as a double), absoluteTolerance, thenAdd?: [hi, lo], thenValue?}.
  // The reconstructed value hi + lo is summed in double precision, which is exact for two f32 components of these magnitudes.
  for (const p of primitives) {
    const got = p.got.hi + p.got.lo;
    if (!(Math.abs(got - p.value) <= p.absoluteTolerance)) throw new Error(`primitive ${p.op}(${JSON.stringify(p.args)}): got ${got}, expected ${p.value}`);
    if ('thenAdd' in p) {
      const then = p.got.thenHi + p.got.thenLo;
      if (!(Math.abs(then - p.thenValue) <= p.absoluteTolerance)) throw new Error(`primitive ${p.op}: the low component was not retained (then ${then}, expected ${p.thenValue})`);
    }
  }
  const out = {};
  if (baseline) out.baseline = { vsRequested: comparePrecision(set, baseline, 'requested'), vsBaselineInput: comparePrecision(set, baseline, 'baselineInput') };
  if (compensated) out.compensated = { vsRequested: comparePrecision(set, compensated, 'requested'), vsCompensatedInput: comparePrecision(set, compensated, 'compensatedInput') };
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test spikes/project0/tests/precision.test.mjs`
Expected: PASS, `# pass 2`.

- [ ] **Step 5: Write `gpu/compensated.wgsl`**

It is assembled after `fields.wgsl` and `trace.wgsl`, with `FIELD = 3`.

```wgsl
// spikes/project0/gpu/compensated.wgsl — A.11: pairs for O, t, p and the iterate; everything else ordinary f32.
struct Barrier { one: f32, _a: f32, _b: f32, _c: f32 }
@group(2) @binding(0) var<uniform> barrier: Barrier;          // one = 1.0, opaque to the compiler
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
  let ofx = vec3f(origin_ff[0].x, origin_ff[1].x, origin_ff[2].x) + vec3f(origin_ff[0].y, origin_ff[1].y, origin_ff[2].y);
  let iv = bound(ofx, d);                                                      // bounding interval in f32 is sufficient
  var out = vec4u(RAY_MISS, WHY_NONE, 0u, 0u);
  if (iv.z != 0.0 && iv.y >= max(0.0, iv.x)) {
    var t = vec2f(max(0.0, iv.x), 0.0);
    var done = false;
    for (var step: u32 = 0u; step < prof.steps && !done; step++) {
      if (t.x > iv.y) { out = vec4u(RAY_MISS, WHY_NONE, 0u, step); done = true; break; }
      let p = FF3(add_ff(origin_ff[0], mul_ff_f32(t, d.x)), add_ff(origin_ff[1], mul_ff_f32(t, d.y)), add_ff(origin_ff[2], mul_ff_f32(t, d.z)));
      let e = bulb_eval_ff(p, prof.iterations);
      if (e.status == ST_BUDGET) { out = vec4u(RAY_UNRESOLVED, WHY_POINT, bitcast<u32>(t.x + t.y), step + 1u); done = true; break; }
      if (e.status == ST_FAILURE) { out = vec4u(RAY_FAILURE, WHY_NONE, bitcast<u32>(t.x + t.y), step + 1u); done = true; break; }
      let tt = t.x + t.y;
      if (e.de < max(prof.floor, prof.factor * prof.alpha * tt)) { out = vec4u(RAY_HIT, WHY_NONE, bitcast<u32>(tt), step + 1u); done = true; break; }
      t = add_ff(t, vec2f(prof.k * e.de, 0.0));
    }
    if (!done) { out = select(vec4u(RAY_UNRESOLVED, WHY_STEPS, bitcast<u32>(t.x + t.y), prof.steps), vec4u(RAY_MISS, WHY_NONE, 0u, prof.steps), t.x > iv.y); }
  }
  results_ff[i] = out;
}

// Primitive validation. Case i uses prim_in[2i] = (a.hi, a.lo, b.hi, b.lo) and prim_in[2i+1] = (op, then.hi, then.lo, 0),
// op 0 = two_sum(a.hi, b.hi), 1 = add_ff(a, b), 2 = mul_ff_f32(a, b.hi). The produced pair is then fed to add_ff(r, then):
// the follow-on consumes the actual produced pair, as the fixture requires. Output: (hi, lo, then.hi, then.lo).
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

The `then` lane implements the mandatory follow-on: `two_sum(1, 2⁻²⁵)` then `add_ff(·, (−1, 0))`
must leave 2⁻²⁵. Cases without `thenAdd` pass `(0, 0)`, and their `then` lane is ignored. The
driver dispatches one workgroup per case (`dispatchWorkgroups(cases)`).

- [ ] **Step 6: Write `browser/precision.js` and `precision.mjs`, then run**

```js
// spikes/project0/browser/precision.js — A.10 baseline, A.11 compensated prototype, primitive validation, cost protocol.
import { acquire } from '../gpu/device.js';
import { prepare, buffer, readBack, traceList, profileWords } from '../gpu/webgpu.js';
import { createTracker } from '../gpu/resources.js';

const src = async n => (await fetch(new URL(`../gpu/${n}`, import.meta.url))).text();

export async function runPrecision(fixtures, status) {
  const { device } = await acquire();
  const pipelines = await prepare(device, status);
  const code = (await src('fields.wgsl')) + (await src('trace.wgsl')) + (await src('compensated.wgsl'));
  const module = device.createShaderModule({ code, label: 'compensated' });
  const errors = (await module.getCompilationInfo()).messages.filter(m => m.type === 'error');
  if (errors.length) throw new Error(`compensated.wgsl: ${errors.map(e => `${e.lineNum}:${e.linePos} ${e.message}`).join('; ')}`);
  const ff = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'trace_ff_list', constants: { FIELD: 3 } } });
  const prim = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'primitives', constants: { FIELD: 3 } } });
  const barrier = buffer(device, new Float32Array([1, 0, 0, 0]), GPUBufferUsage.UNIFORM);

  // 1. Primitives — every case, with the produced pair fed into its follow-on.
  const OP = { two_sum: 0, add_ff: 1, mul_ff_f32: 2 };
  const pair = v => Array.isArray(v) ? v : [v, 0];
  const cases = fixtures.primitives;
  const pin = new Float32Array(8 * cases.length);
  cases.forEach((c, i) => { const a = pair(c.args[0]), b = pair(c.args[1]), t = c.thenAdd ? pair(c.thenAdd) : [0, 0]; pin.set([a[0], a[1], b[0], b[1], OP[c.op], t[0], t[1], 0], 8 * i); });
  const pinB = buffer(device, pin, GPUBufferUsage.STORAGE), poutB = device.createBuffer({ size: 16 * cases.length, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  { const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(prim);
    pass.setBindGroup(0, device.createBindGroup({ layout: prim.getBindGroupLayout(0), entries: [{ binding: 5, resource: { buffer: pinB } }, { binding: 6, resource: { buffer: poutB } }] }));
    pass.setBindGroup(2, device.createBindGroup({ layout: prim.getBindGroupLayout(2), entries: [{ binding: 0, resource: { buffer: barrier } }] }));
    pass.dispatchWorkgroups(cases.length); pass.end(); device.queue.submit([enc.finish()]); }
  const pout = new Float32Array(await readBack(device, poutB, 16 * cases.length));
  const primitives = cases.map((c, i) => ({ ...c, got: { hi: pout[4 * i], lo: pout[4 * i + 1], thenHi: pout[4 * i + 2], thenLo: pout[4 * i + 3] } }));

  // 2. Baseline and compensated traces of the same 4,096 rays per distance, plus 3 warm-ups + 10 timed evaluations each.
  const tracker = createTracker(), sets = [];
  const ffTrace = async (set, directions) => {
    const n = set.rows.length, start = performance.now();
    const o = tracker.track(buffer(device, new Float32Array(set.originPairs.flat()), GPUBufferUsage.STORAGE), 32, 'buffer');
    const d = tracker.track(buffer(device, directions, GPUBufferUsage.STORAGE), directions.byteLength, 'buffer');
    const r = tracker.track(device.createBuffer({ size: 16 * n, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }), 16 * n, 'buffer');
    const inflight = [];
    for (let s0 = 0; s0 < n; s0 += 512) {
      while (inflight.length >= 2) await inflight.shift();
      const u = buffer(device, new Uint8Array(profileWords(fixtures.profiles.precision, s0, Math.min(512, n - s0), 0)), GPUBufferUsage.UNIFORM);
      const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(ff);
      pass.setBindGroup(0, device.createBindGroup({ layout: ff.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 2, resource: { buffer: o } }, { binding: 3, resource: { buffer: d } }, { binding: 4, resource: { buffer: r } }] }));
      pass.setBindGroup(2, device.createBindGroup({ layout: ff.getBindGroupLayout(2), entries: [{ binding: 0, resource: { buffer: barrier } }] }));
      pass.dispatchWorkgroups(Math.ceil(Math.min(512, n - s0) / 64)); pass.end(); device.queue.submit([enc.finish()]);
      inflight.push(device.queue.onSubmittedWorkDone().then(() => u.destroy()));
    }
    await Promise.all(inflight);
    const workMs = performance.now() - start, r0 = performance.now();
    const words = new Uint32Array(await readBack(device, r, 16 * n));
    const readMs = performance.now() - r0;
    for (const b of [o, d, r]) b.destroy();
    return { words, workMs, readMs };
  };
  for (const set of fixtures.precision.results) {
    status(`precision d=${set.distance}`);
    const n = set.rows.length;
    const directions = new Float32Array(4 * n); set.rows.forEach((row, i) => directions.set([...row.effectiveDirection, 0], 4 * i));
    const flatDir = new Float32Array(3 * n); set.rows.forEach((row, i) => flatDir.set(row.effectiveDirection, 3 * i));
    const flatOrigin = new Float32Array(3 * n); for (let i = 0; i < n; i++) flatOrigin.set(set.roundedOrigin, 3 * i);
    const base = async () => { const t0 = performance.now(); const { words } = await traceList({ device, pipelines, field: 'bulb', profile: fixtures.profiles.precision, origins: flatOrigin, directions: flatDir }); return { words, workMs: performance.now() - t0 }; };
    const runs = { baseline: [], compensated: [] }; let baseline, compensated;
    for (let k = 0; k < fixtures.costProtocol.warmups + fixtures.costProtocol.measured; k++) {
      const b = await base(), c = await ffTrace(set, directions);
      if (k >= fixtures.costProtocol.warmups) { runs.baseline.push(b.workMs); runs.compensated.push(c.workMs); }
      baseline = b.words; compensated = c;
    }
    const stats = xs => { const v = [...xs].sort((a, b) => a - b); return { median: v[Math.floor(v.length / 2)], min: v[0], max: v.at(-1) }; };
    sets.push({ distance: set.distance, baseline: Array.from(baseline), compensated: Array.from(compensated.words), costMs: { baseline: stats(runs.baseline), compensated: stats(runs.compensated) }, readbackMs: compensated.readMs, extraBytes: 32 + directions.byteLength + 16 * n });
  }
  barrier.destroy(); device.destroy();
  return { slots: [{ slot: 'precision', raw: { primitives, sets } }], invalidations: [] };
}
```

The driver returns raw words, and Node decodes them with T6's `decodeTrace`. The baseline uses T6's
`traceList`, which includes its own readback inside `workMs`. The report labels
baseline `workMs` as "completed work including readback" and compensated `workMs` as
"completed work, readback separate". It never compares them as if they measured the same
interval. `readbackMs` is reported for the compensated path only.

Register the driver in `runGateDriver`, before the final `throw`:
`if (gate === 'precision') return (await import('./precision.js')).runPrecision(fixtures, status);`.

```js
// spikes/project0/precision.mjs — node spikes/project0/precision.mjs ; headed, on the selected backend.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './launch.mjs';
import { runGate } from './run.mjs';
import { decodeTrace, precisionMetrics } from './measure.mjs';

const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
const { result, runDir } = await runGate({ gate: 'precision', mode: 'headed', campaign: 'precision' });
const { primitives, sets } = result.slots[0].raw;
let primitiveFailure = null;
try { precisionMetrics(fixtures.precision.results[0], { primitives }); } catch (e) { primitiveFailure = e.message; }
const rows = sets.map((s, i) => {
  const set = fixtures.precision.results[i];
  if (set.distance !== s.distance) throw new Error('precision set order mismatch');
  const m = precisionMetrics(set, { baseline: decodeTrace(s.baseline), ...(primitiveFailure ? {} : { compensated: decodeTrace(s.compensated) }) });
  return { distance: s.distance, ...m, costMs: s.costMs, readbackMs: s.readbackMs, extraBytes: s.extraBytes };
});
const threshold = rows.find(r => r.baseline.vsRequested.thresholdExceeded === true)?.distance ?? null;
const out = { validated: !primitiveFailure, primitiveFailure, observedDisagreementThreshold: threshold, rows, runDir };
await mkdir(resolve(ROOT, 'docs/reports/project0'), { recursive: true });
await writeFile(resolve(ROOT, 'docs/reports/project0/precision.json'), JSON.stringify(out, null, 2));
if (primitiveFailure) console.log(`UNVALIDATED: ${primitiveFailure} (compensation not interpreted)`);
for (const r of rows) console.log(`d=${r.distance}: baseline exceeded=${r.baseline.vsRequested.thresholdExceeded} (${r.baseline.vsRequested.stopReasons.join(', ') || 'interpretable'})${r.compensated ? `, compensated exceeded=${r.compensated.vsRequested.thresholdExceeded}` : ''}, median ms base=${r.costMs.baseline.median.toFixed(2)} ff=${r.costMs.compensated.median.toFixed(2)}`);
console.log(`observed disagreement threshold against the CPU reference: ${threshold ?? 'not reached within tested distances'}`);
```

`metricsFor` has no `precision` derivation. `run.mjs` therefore records the invalidation
`metrics: no metric derivation for precision/precision`, which is correct: precision is not a
gate. `precision.mjs` derives its own results from the raw slot.

Run: `node spikes/project0/precision.mjs`
Expected:
- if an `UNVALIDATED: primitive …` line appears, the experiment is **unvalidated**. Record
  that, and do not interpret compensation;
- otherwise there is one line per distance, with the baseline and compensated
  `thresholdExceeded` (or `null` with the stop reasons) and the median costs;
- in both cases a final line names the observed disagreement threshold.

A measured absence of improvement from compensation is a valid outcome.

- [ ] **Step 7: Joint interpretation and commit**

Send the per-distance table to Codex, log it, and agree the wording of the precision section.
Then:

```bash
git add spikes/project0/gpu/compensated.wgsl spikes/project0/browser/precision.js spikes/project0/precision.mjs spikes/project0/measure.mjs spikes/project0/tests/precision.test.mjs docs/reports/project0/precision.json
git commit -m "Project 0 T12: compensated prototype and precision experiment results"
```

---

### Task T13: Reproducible report, joint evidence review and user handoff

**Owner:** Claude and Codex jointly.

**Files:**
- `spikes/project0/report.mjs`
- `docs/reports/<date>-project0-qualification.md`
- `docs/reports/<date>-project0-results.json`
- Test: `spikes/project0/tests/report.test.mjs`

- [ ] **Step 1: Write the failing test (the report recomputes, never trusts)**

```js
// spikes/project0/tests/report.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../report.mjs';
test('the report restates the mechanical decision and refuses inconsistent inputs', () => {
  const gates = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`G${i + 1}`, { status: 'pass', reasons: [] }]));
  const md = renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates, remediationClosed: true }, precision: null, unsafeFlag: false });
  assert.match(md, /Outcome: \*\*WebGPU selected\*\*/);
  assert.throws(() => renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates: { ...gates, G8: { status: 'fail', reasons: ['x'] } }, remediationClosed: true } }), /decision does not follow/);
  assert.match(renderReport({ decision: { outcome: 'WebGPU selected' }, backend: { gates, remediationClosed: true }, unsafeFlag: true }), /depends on `--enable-unsafe-webgpu`/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test spikes/project0/tests/report.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `report.mjs`**

```js
// spikes/project0/report.mjs — renders the qualification report from verified, recomputed evidence.
import { decideBackends } from './decision.js';
export function renderReport({ decision, backend, webgl = null, precision = null, unsafeFlag = false }) {
  const again = decideBackends(backend, webgl);
  if (again.outcome !== decision.outcome) throw new Error(`decision does not follow from the gate statuses (${again.outcome} vs ${decision.outcome})`);
  const rows = Object.entries(backend.gates).map(([g, r]) => `| ${g} | ${r.status} | ${(r.reasons || []).join('; ').replace(/\|/g, '\\|') || '—'} |`);
  return [`# Project 0 — Space Backend Qualification Report`, '', `Outcome: **${decision.outcome}**`, '',
    unsafeFlag ? '> **The selection depends on `--enable-unsafe-webgpu`.** Space would require a Chrome flag that ordinary users do not set. This is the user\'s decision to accept or reject.\n' : '',
    '| Gate | Status | Reasons |', '|---|---|---|', ...rows, '',
    '## Precision experiment (not a backend gate)', '', precision ? precision : 'Not run: no backend was selected, or the experiment could not run safely (see the decision record).', ''].join('\n');
}
```

`node spikes/project0/report.mjs <campaign>` (a CLI wrapper in the same file) does five things:
1. Loads the final manifest with `loadCampaign`.
2. Runs `recompute`, so every artefact hash and metric is verified.
3. Runs `qualify` with the closed remediation flag.
4. Reads `precision.json` and the `unsafe` note from `webgpu-decision.json`.
5. Writes the markdown skeleton and a compact `-results.json`: per-trial metrics, identities
   and artefact hashes, with no raw traces.

The narrative sections are written jointly afterwards: the environment, the remediation
history, the interpretation and the limitations.

- [ ] **Step 4: Run it, review it jointly and hand it to the user**

```bash
node --test spikes/project0/tests/report.test.mjs        # Expected: PASS, # pass 1
node spikes/project0/report.mjs webgpu-remediation        # or webgpu-1 when no remediation ran
```

1. Claude drafts the narrative. Codex reviews it as co-author (READY / NOT READY), and the
   exchange is logged verbatim.
2. Archive both logs to `docs/codesign/`.
3. Commit:

```bash
git add spikes/project0/report.mjs spikes/project0/tests/report.test.mjs docs/reports/ docs/codesign/
git commit -m "Project 0 T13: qualification report, results summary and co-design log"
```

4. Present the outcome to the user:
   - the mechanically derived decision;
   - any dependence on `--enable-unsafe-webgpu`;
   - the precision finding;
   - the next step: the Project 1a/1b specs after a selected backend, or resolving the reported
     limitation after a no-go or inconclusive outcome.

