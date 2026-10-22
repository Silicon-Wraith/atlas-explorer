// The headed Space suite (plan B01; spec §16.1, §16.5, §9.1 "Launch (tests)"). One entry point,
// separately registered groups:
//   node tests/space.mjs --group <name> [--write-spike] [--include-run <report.json>]… [--include-experiment <report.json>]
// Every group launches installed Chrome headed with the complete recorded Project 0 profile on the
// physical GPU (E7: headed only), tests the gate-owned committed source checkout (the unchanged gate
// serves the repository root on its own port; a standalone run must identify the served checkout,
// which the environment entry does by commit, dirty state, server ownership and a byte comparison of
// every tracked application file the server serves), records {name, details} passes to its own report with the requested and effective
// launch arguments, the chrome://gpu identity, the GPU handoff and the source, and is bounded by
// installSuiteDeadline. B01 registers `coexistence` (gated) and `developer-flag-experiment` (a
// separately reported portability experiment, never gated); B06 registers `recovery`; B08 registers
// `numerics` (the field kernels against B04's frozen matrix); B10 registers `rendering` (tracing, normals and
// picking against B04's ray strata and anchors) and B11 adds its shading, accumulation, display and product-set
// checks to that group; B11b adds the six-scene visual acceptance to it (and a diagnostic `visual` group that runs it alone, never
// gated); B14 registers `shell` (the Space workspace in the application: `space-interaction`). The spike document is written only after the run passed, its report was
// persisted and every page, context and browser was drained and closed.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { LIMITS, within, idleWithin, drainGpuWithin, closeWithin, installSuiteDeadline, boundContext, ev, CHROME_TMPDIR, chromeLaunchEnv } from './support/bounded.mjs';
import { cleanupPages } from './support/workflow-cleanup.mjs';
import { PROJECT0_LAUNCH_ARGS, DEVELOPER_FLAG, collectVisibleText, activeGpuIdentity, graphicsFeatureStatus, checkEffectiveArguments, canWriteSpikeDocument, renderSpikeDocument, SPIKE_DOCUMENT_PATH, longTasksByPhase, verifyServedSource, startupSequence } from './support/space-suite.mjs';

export const PREPARATION_BOUND_MS = 60_000; // plan default: preparation is bounded per attempt
export const GROUP_NAMES = Object.freeze(['coexistence', 'developer-flag-experiment', 'recovery', 'numerics', 'numerics-divergence', 'rendering', 'visual', 'shell']);
const PASS_COEXIST = 'WebGL 2 and WebGPU contexts coexist in one page';
const PASS_IDENTITY = 'Adapter identity reports observed or unavailable fields truthfully';
const PASS_PREPARE = 'A representative pipeline set prepares within the bound with progress events';

function parseArgs(argv) {
  const options = { group: null, writeSpike: false, includeRuns: [], includeExperiment: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--group') options.group = argv[++i];
    else if (argv[i] === '--write-spike') options.writeSpike = true;
    else if (argv[i] === '--include-run') options.includeRuns.push(argv[++i]);
    else if (argv[i] === '--include-experiment') options.includeExperiment = argv[++i];
    else if (argv[i] === '--headless') throw new Error('the Space suite is headed only (Project 0 E7); --headless is refused');
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!options.group) throw new Error(`--group is required (one of ${GROUP_NAMES.join(', ')})`);
  if (!GROUP_NAMES.includes(options.group)) throw new Error(`unknown group ${options.group} (one of ${GROUP_NAMES.join(', ')})`);
  return options;
}

const options = parseArgs(process.argv.slice(2));
const { chromium } = await import('playwright');
installSuiteDeadline(`space-${options.group}`);
await mkdir('artifacts/runtime', { recursive: true });
process.env.TMPDIR = resolve('artifacts/runtime');
await mkdir(CHROME_TMPDIR, { recursive: true }); // installed Chrome's socket path must fit (bounded.mjs)
const url = process.env.ATLAS_URL || 'http://127.0.0.1:5173';
const reportPath = `artifacts/space-${options.group}-report.json`;
const report = [], errors = [];
const writeReport = entries => writeFile(reportPath, JSON.stringify(entries, null, 2));
const pass = (name, details = {}) => { report.push({ name, ...details }); console.log(`PASS ${name}`, JSON.stringify(details).slice(0, 400)); };

// Expected-backend bookkeeping for every drain (1a Amendment H carry-forward; the shared
// tests/support/expected-backend.mjs lands with 1a T08's atlas.device and is adopted when 1a merges
// forward). A Plane page opened on WebGL must drain to `complete` with its hardware renderer intact;
// a diagnostic chrome:// page has no WebGL and must drain to `no-webgl`.
const backends = new WeakMap();
const expectBackend = (page, backend) => { if (!['webgl', 'none'].includes(backend)) throw new RangeError(`unknown backend ${backend}`); backends.set(page, backend); return page; };
async function drainExpecting(page, ms = LIMITS.deep) {
  const expected = backends.get(page) ?? 'webgl';
  const snapshot = () => ev(page, () => {
    const gl = globalThis.atlas?.renderer?.gl ?? null;
    return { acceleration: globalThis.atlas?.graphics?.acceleration ?? null, contextLost: gl ? gl.isContextLost() : null };
  }, undefined, 'backend snapshot');
  const before = await snapshot();
  const result = await drainGpuWithin(page, ms);
  const after = await snapshot();
  if (expected === 'webgl') {
    if (before.acceleration !== 'hardware' || after.acceleration !== 'hardware') throw new Error(`drain GPU work: page expected a hardware WebGL backend; the renderer reports ${before.acceleration} then ${after.acceleration}`);
    if (result.status !== 'complete') throw new Error(`drain GPU work: a webgl page drained to ${result.status}`);
    if (after.contextLost) throw new Error('drain GPU work: the WebGL context was lost during the drain');
  } else if (result.status !== 'no-webgl') throw new Error(`drain GPU work: a page without WebGL drained to ${result.status}`);
  return result;
}
// Every page close goes through the drain wrapper; a drain failure is persisted and fails the suite.
async function closeDrained(page, label) {
  const failed = await cleanupPages({ pages: [page], drain: drainExpecting, report, writeReport, closeAll: () => closeWithin(page, label) });
  if (failed) throw new Error(`${label}: GPU drain or report failed`);
}
function watchErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}

// ---- in-page functions (self-contained; Playwright serialises them) --------------------------------

async function acquireInPage() {
  const { acquireDevice } = await import('/src/space/render/webgpu/device.js');
  const spike = { lost: [], uncaptured: [] };
  globalThis.__spaceSpike = spike;
  const result = await acquireDevice({ onLost: event => spike.lost.push(event) });
  result.device.addEventListener('uncapturederror', event => spike.uncaptured.push(String(event.error?.message ?? event.error)));
  Object.assign(spike, result);
  const { device, adapter, ...summary } = result;
  return summary;
}

// A second canvas takes a WebGPU context beside Plane's WebGL 2 canvas, and a one-workgroup compute
// probe writes its invocation ids into a buffer that is read back: the device does work, not just exist.
async function canvasAndProbeInPage() {
  const { device } = globalThis.__spaceSpike;
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('canvas.getContext("webgpu") returned null');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  const texture = context.getCurrentTexture();
  const canvasTexture = { format: texture.format, width: texture.width, height: texture.height };
  const count = 64;
  const module = device.createShaderModule({ code: `
    @group(0) @binding(0) var<storage, read_write> out: array<u32>;
    @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3<u32>) { out[id.x] = id.x; }` });
  const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const buffer = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const staging = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] });
  const started = performance.now();
  const encoder = device.createCommandEncoder();
  const passEncoder = encoder.beginComputePass(); passEncoder.setPipeline(pipeline); passEncoder.setBindGroup(0, bindGroup); passEncoder.dispatchWorkgroups(1); passEncoder.end();
  encoder.copyBufferToBuffer(buffer, 0, staging, 0, count * 4);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const queueCompletionMs = performance.now() - started;
  await staging.mapAsync(GPUMapMode.READ);
  const values = Array.from(new Uint32Array(staging.getMappedRange()));
  staging.unmap();
  const sum = values.reduce((total, value) => total + value, 0);
  const ordered = values.every((value, index) => value === index);
  buffer.destroy(); staging.destroy(); context.unconfigure();
  return { canvasFormat: format, canvasTexture, probe: { count, sum, ordered, queueCompletionMs } };
}

// The representative set: a 512-step × 128-iteration power-8 bulb trace loop, a six-sample normals
// pass and an sRGB display pass into a storage texture. Written inline for the spike; the product
// kernels (B08, B10, B11) are separate, independently identified implementations.
async function prepareInPage({ boundMs, dispatch }) {
  const { device } = globalThis.__spaceSpike;
  // Timer resolution measured, not assumed: the smallest positive performance.now() delta.
  const timer = (() => {
    const samples = 4096, deltas = new Set();
    let resolutionMs = Infinity, last = performance.now();
    for (let i = 0; i < samples; i++) { const now = performance.now(); const delta = now - last; if (delta > 0) { deltas.add(delta); if (delta < resolutionMs) resolutionMs = delta; } last = now; }
    return { resolutionMs: Number.isFinite(resolutionMs) ? resolutionMs : null, samples, distinctDeltas: deltas.size };
  })();
  // Long tasks and scheduled waits are recorded whatever the outcome (plan timer rules). Every
  // long-task entry the page has seen (buffered startup tasks included) is collected; attribution is
  // by interval overlap with the recorded phase boundaries, so startup tasks are labelled separately.
  const entries = [], phases = {}, waits = { preparationBound: { armed: 0, rearmed: 0, fired: false } };
  let observer = null, observerError = null;
  const collect = list => { for (const entry of list.getEntries()) entries.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration }); };
  try { observer = new PerformanceObserver(list => collect(list)); observer.observe({ type: 'longtask', buffered: true }); }
  catch (error) { observerError = String(error?.message ?? error); }
  // A long task is reported only after it ends, so the terminal synchronous work of a phase is captured
  // by yielding to a fresh task before the records are taken.
  const settleTasks = async () => { await new Promise(resolve => setTimeout(resolve, 0)); if (observer) collect({ getEntries: () => observer.takeRecords() }); };
  // Raw entries and phase boundaries leave the page; the suite attributes them (longTasksByPhase).
  const diagnostics = () => ({ timer, longTaskEntries: entries, phases, observerError, waits });
  const STATUS = `
    const RAY_HIT: u32 = 0u; const RAY_MISS: u32 = 1u; const RAY_UNRESOLVED: u32 = 2u; const RAY_NUMERICAL_FAILURE: u32 = 3u;
    const REASON_NONE: u32 = 0u; const REASON_POINT_BUDGET: u32 = 1u; const REASON_RAY_STEP_BUDGET: u32 = 3u;
    fn pack_status(status: u32, reason: u32, steps: u32) -> u32 { return status | (reason << 4u) | (steps << 12u); }`;
  const UNIFORMS = `
    struct Uniforms {
      origin: vec3<f32>, power: f32,
      forward: vec3<f32>, tanHalfFov: f32,
      right: vec3<f32>, pixelAngle: f32,
      up: vec3<f32>, radius: f32,
      width: u32, height: u32, maxSteps: u32, maxIterations: u32,
    };
    @group(0) @binding(0) var<uniform> u: Uniforms;`;
  // Returns (estimate, flag): flag 0 escaped (estimate valid), 1 not escaped within budget, 2 numerical failure.
  const FIELD = `
    override FIELD: u32 = 0u;
    fn bulb_estimate(p: vec3<f32>, power: f32, budget: u32) -> vec2<f32> {
      var z = p; var dr = 1.0; var r = 0.0;
      for (var i = 0u; i < budget; i++) {
        r = length(z);
        if (r > 2.0) { return vec2<f32>(0.5 * log(r) * r / dr, 0.0); }
        if (r < 1e-30) { return vec2<f32>(0.0, 1.0); }
        if (dr > 1e30) { return vec2<f32>(0.0, 2.0); }
        let theta = acos(clamp(z.z / r, -1.0, 1.0));
        let phi = atan2(z.y, z.x);
        let rp = pow(r, power - 1.0);
        dr = rp * power * dr + 1.0;
        let nt = theta * power; let np = phi * power;
        z = rp * r * vec3<f32>(sin(nt) * cos(np), sin(nt) * sin(np), cos(nt)) + p;
      }
      return vec2<f32>(0.0, 1.0);
    }
    fn field_estimate(p: vec3<f32>, power: f32, budget: u32) -> vec2<f32> {
      if (FIELD == 0u) { return bulb_estimate(p, power, budget); }
      return vec2<f32>(length(p) - 1.0, 0.0);
    }`;
  const TRACE = `${STATUS}${UNIFORMS}${FIELD}
    @group(0) @binding(1) var<storage, read_write> depth: array<f32>;
    @group(0) @binding(2) var<storage, read_write> status: array<u32>;
    @compute @workgroup_size(8, 8, 1)
    fn trace(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= u.width || gid.y >= u.height) { return; }
      let index = gid.y * u.width + gid.x;
      let aspect = f32(u.width) / f32(u.height);
      let ndc = vec2<f32>(((f32(gid.x) + 0.5) / f32(u.width) * 2.0 - 1.0) * aspect, 1.0 - (f32(gid.y) + 0.5) / f32(u.height) * 2.0);
      let dir = normalize(u.forward + u.right * (ndc.x * u.tanHalfFov) + u.up * (ndc.y * u.tanHalfFov));
      let b = dot(u.origin, dir); let c = dot(u.origin, u.origin) - u.radius * u.radius;
      let disc = b * b - c;
      if (disc < 0.0) { depth[index] = -1.0; status[index] = pack_status(RAY_MISS, REASON_NONE, 0u); return; }
      let root = sqrt(disc);
      let tExit = -b + root;
      var t = max(-b - root, 0.0);
      var steps = 0u;
      var result = pack_status(RAY_UNRESOLVED, REASON_RAY_STEP_BUDGET, u.maxSteps);
      var hitDepth = -1.0;
      for (var s = 0u; s < u.maxSteps; s++) {
        steps = s + 1u;
        if (t > tExit) { result = pack_status(RAY_MISS, REASON_NONE, steps); break; }
        let p = u.origin + dir * t;
        let estimate = field_estimate(p, u.power, u.maxIterations);
        if (estimate.y == 2.0) { result = pack_status(RAY_NUMERICAL_FAILURE, REASON_NONE, steps); break; }
        if (estimate.y == 1.0) { result = pack_status(RAY_UNRESOLVED, REASON_POINT_BUDGET, steps); break; }
        let tau = max(1e-6, 0.5 * u.pixelAngle * t);
        if (estimate.x < tau) { result = pack_status(RAY_HIT, REASON_NONE, steps); hitDepth = t; break; }
        t = t + 0.9 * estimate.x;
      }
      depth[index] = hitDepth; status[index] = result;
    }`;
  const NORMALS = `${STATUS}${UNIFORMS}${FIELD}
    @group(0) @binding(1) var<storage, read> depth: array<f32>;
    @group(0) @binding(2) var<storage, read> status: array<u32>;
    @group(0) @binding(3) var<storage, read_write> normal: array<vec4<f32>>;
    @compute @workgroup_size(8, 8, 1)
    fn normals(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= u.width || gid.y >= u.height) { return; }
      let index = gid.y * u.width + gid.x;
      if ((status[index] & 15u) != RAY_HIT) { normal[index] = vec4<f32>(0.0, 0.0, 0.0, 0.0); return; }
      let aspect = f32(u.width) / f32(u.height);
      let ndc = vec2<f32>(((f32(gid.x) + 0.5) / f32(u.width) * 2.0 - 1.0) * aspect, 1.0 - (f32(gid.y) + 0.5) / f32(u.height) * 2.0);
      let dir = normalize(u.forward + u.right * (ndc.x * u.tanHalfFov) + u.up * (ndc.y * u.tanHalfFov));
      let p = u.origin + dir * depth[index];
      let h = max(1e-4, 0.5 * u.pixelAngle * depth[index]);
      var g = vec3<f32>(0.0);
      var ok = true;
      for (var axis = 0u; axis < 3u; axis++) {
        var e = vec3<f32>(0.0); if (axis == 0u) { e.x = h; } else if (axis == 1u) { e.y = h; } else { e.z = h; }
        let a = field_estimate(p + e, u.power, u.maxIterations); let b = field_estimate(p - e, u.power, u.maxIterations);
        if (a.y != 0.0 || b.y != 0.0) { ok = false; }
        if (axis == 0u) { g.x = a.x - b.x; } else if (axis == 1u) { g.y = a.x - b.x; } else { g.z = a.x - b.x; }
      }
      let len = length(g);
      if (!ok || !(len > 0.0) || len > 1e30) { normal[index] = vec4<f32>(0.0, 0.0, 0.0, 0.0); return; }
      normal[index] = vec4<f32>(g / len, 1.0);
    }`;
  const DISPLAY = `${STATUS}${UNIFORMS}
    @group(0) @binding(1) var<storage, read> status: array<u32>;
    @group(0) @binding(2) var<storage, read> normal: array<vec4<f32>>;
    @group(0) @binding(3) var display: texture_storage_2d<rgba8unorm, write>;
    fn srgb(c: f32) -> f32 { if (c <= 0.0031308) { return 12.92 * c; } return 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
    @compute @workgroup_size(8, 8, 1)
    fn display_band(@builtin(global_invocation_id) gid: vec3<u32>) {
      if (gid.x >= u.width || gid.y >= u.height) { return; }
      let index = gid.y * u.width + gid.x;
      let word = status[index]; let s = word & 15u;
      var colour = vec3<f32>(0.02, 0.02, 0.03);
      if (s == RAY_UNRESOLVED) { textureStore(display, vec2<i32>(gid.xy), vec4<f32>(1.0, 0.0, 1.0, 1.0)); return; }
      if (s == RAY_NUMERICAL_FAILURE) { textureStore(display, vec2<i32>(gid.xy), vec4<f32>(1.0, 0.0, 0.0, 1.0)); return; }
      if (s == RAY_HIT) {
        let n = normal[index];
        if (n.w == 0.0) { textureStore(display, vec2<i32>(gid.xy), vec4<f32>(0.5, 0.5, 0.5, 1.0)); return; }
        let light = normalize(vec3<f32>(1.0, 0.6, 1.5));
        let shade = 0.15 + 0.85 * max(0.0, dot(n.xyz, light));
        colour = vec3<f32>(0.8, 0.75, 0.7) * shade;
      }
      textureStore(display, vec2<i32>(gid.xy), vec4<f32>(srgb(colour.x), srgb(colour.y), srgb(colour.z), 1.0));
    }`;
  const stages = [
    { id: 'trace', code: TRACE, entryPoint: 'trace', constants: { FIELD: 0 } },
    { id: 'normals', code: NORMALS, entryPoint: 'normals', constants: { FIELD: 0 } },
    { id: 'display', code: DISPLAY, entryPoint: 'display_band', constants: {} },
  ];
  const events = [];
  let invalidated = false;
  async function prepareSet(label) {
    const started = performance.now(), results = [], pipelines = {};
    for (const [index, stage] of stages.entries()) {
      const t0 = performance.now();
      device.pushErrorScope('validation');
      const module = device.createShaderModule({ code: stage.code, label: `${label}-${stage.id}` });
      const t1 = performance.now();
      let pipeline, error = null;
      try { pipeline = await device.createComputePipelineAsync({ label: `${label}-${stage.id}`, layout: 'auto', compute: { module, entryPoint: stage.entryPoint, constants: stage.constants } }); }
      catch (failure) { error = `${failure.name ?? 'Error'}: ${failure.message}${failure.reason ? ` (${failure.reason})` : ''}`; }
      const t2 = performance.now();
      const scope = await device.popErrorScope();
      const messages = (await module.getCompilationInfo()).messages.map(message => ({ type: message.type, line: message.lineNum, text: message.message }));
      if (invalidated) return null; // a late pipeline cannot revive a timed-out attempt
      if (scope) error = `${error ? `${error}; ` : ''}validation: ${scope.message}`;
      if (error) throw new Error(`${stage.id} failed to prepare: ${error}; messages ${JSON.stringify(messages)}`);
      pipelines[stage.id] = pipeline;
      results.push({ id: stage.id, moduleMs: t1 - t0, pipelineMs: t2 - t1, totalMs: t2 - t0, messages });
      events.push({ set: label, stage: stage.id, index: index + 1, total: stages.length, elapsedMs: performance.now() - started });
    }
    events.push({ set: label, stage: 'complete', index: stages.length, total: stages.length, elapsedMs: performance.now() - started });
    return { stages: results, totalMs: performance.now() - started, pipelines };
  }
  let boundTimer;
  // One absolute bound, armed once and never rearmed; a timeout invalidates the attempt and late
  // pipeline promises cannot revive it.
  const timeout = new Promise((_, reject) => { waits.preparationBound.armed++; boundTimer = setTimeout(() => { waits.preparationBound.fired = true; invalidated = true; reject(new Error(`preparation did not finish within ${boundMs} ms`)); }, boundMs); });
  timeout.catch(() => {}); // the race surfaces the rejection; nothing is left unhandled
  let cold, warm;
  try {
    phases.preparation = { start: performance.now(), end: null };
    try { cold = await Promise.race([prepareSet('cold'), timeout]); warm = await Promise.race([prepareSet('warm'), timeout]); }
    catch (error) {
      phases.preparation.end = performance.now(); await settleTasks();
      // Available progress is preserved on failure: the error carries every event and diagnostic so far.
      throw new Error(`${error.message}; progress ${JSON.stringify({ events, ...diagnostics() })}`);
    } finally { clearTimeout(boundTimer); }
    phases.preparation.end = performance.now();
    await settleTasks();
    const result = { boundMs, totalMs: cold.totalMs, stages: cold.stages, events, warm: { totalMs: warm.totalMs, stages: warm.stages.map(({ id, totalMs }) => ({ id, totalMs })) } };
    if (dispatch) {
      phases.dispatch = { start: performance.now(), end: null };
      try { result.dispatch = await dispatchInPage(device, cold.pipelines, dispatch); }
      catch (error) { phases.dispatch.end = performance.now(); await settleTasks(); throw new Error(`dispatch failed: ${error.message}; progress ${JSON.stringify({ events, stages: cold.stages, ...diagnostics() })}`); }
      phases.dispatch.end = performance.now();
      await settleTasks();
    }
    Object.assign(result, diagnostics());
    return result;
  } finally { observer?.disconnect(); }

  // A representative draft-sized dispatch of the prepared set (recorded, never a requirement):
  // the overview camera of the power-8 bulb, 128 iterations, 512 steps.
  async function dispatchInPage(device, pipelines, { width, height }) {
    const pixels = width * height;
    const origin = [1.6, -1.5, 1.1], length = Math.hypot(...origin), scale = 2.5 * 2 / length; // 2.5 × the enclosing radius 2
    const o = origin.map(value => value * scale);
    const norm = v => { const l = Math.hypot(...v); return v.map(value => value / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const forward = norm(o.map(value => -value)), right = norm(cross(forward, [0, 0, 1])), up = cross(right, forward);
    const fov = Math.PI / 3, tanHalfFov = Math.tan(fov / 2), pixelAngle = 2 * tanHalfFov / height;
    const words = new ArrayBuffer(80), f = new Float32Array(words), i = new Uint32Array(words);
    f.set([...o, 8, ...forward, tanHalfFov, ...right, pixelAngle, ...up, 2]); i.set([width, height, 512, 128], 16);
    const uniforms = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniforms, 0, words);
    const depth = device.createBuffer({ size: pixels * 4, usage: GPUBufferUsage.STORAGE });
    const status = device.createBuffer({ size: pixels * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const normal = device.createBuffer({ size: pixels * 16, usage: GPUBufferUsage.STORAGE });
    const display = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC });
    const staging = device.createBuffer({ size: pixels * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const groups = {
      trace: device.createBindGroup({ layout: pipelines.trace.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: { buffer: depth } }, { binding: 2, resource: { buffer: status } }] }),
      normals: device.createBindGroup({ layout: pipelines.normals.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: { buffer: depth } }, { binding: 2, resource: { buffer: status } }, { binding: 3, resource: { buffer: normal } }] }),
      display: device.createBindGroup({ layout: pipelines.display.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: { buffer: status } }, { binding: 2, resource: { buffer: normal } }, { binding: 3, resource: display.createView() }] }),
    };
    device.pushErrorScope('validation');
    const started = performance.now();
    const encoder = device.createCommandEncoder();
    for (const id of ['trace', 'normals', 'display']) {
      const passEncoder = encoder.beginComputePass({ label: id });
      passEncoder.setPipeline(pipelines[id]); passEncoder.setBindGroup(0, groups[id]);
      passEncoder.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8)); passEncoder.end();
    }
    encoder.copyBufferToBuffer(status, 0, staging, 0, pixels * 4);
    device.queue.submit([encoder.finish()]);
    const submissionMs = performance.now() - started;
    await device.queue.onSubmittedWorkDone();
    const queueCompletionMs = performance.now() - started;
    const validation = await device.popErrorScope();
    await staging.mapAsync(GPUMapMode.READ);
    const statuses = new Uint32Array(staging.getMappedRange());
    const counts = { hit: 0, miss: 0, unresolved: 0, numericalFailure: 0 }, reasons = {};
    let maxSteps = 0;
    for (const word of statuses) {
      counts[['hit', 'miss', 'unresolved', 'numericalFailure'][word & 15]]++;
      const reason = (word >>> 4) & 15; if (reason) reasons[reason] = (reasons[reason] ?? 0) + 1;
      maxSteps = Math.max(maxSteps, word >>> 12);
    }
    staging.unmap();
    for (const resource of [uniforms, depth, status, normal, staging, display]) resource.destroy();
    return { width, height, submissionMs, queueCompletionMs, evidence: 'queue-completion', validation: validation ? validation.message : null, counts, reasons, maxSteps };
  }
}

async function destroyInPage() {
  const spike = globalThis.__spaceSpike;
  const waits = { lossObservation: { armed: 1, rearmed: 0, fired: false } };
  spike.device.destroy();
  let timer;
  const lost = await Promise.race([spike.device.lost, new Promise(resolve => { timer = setTimeout(() => { waits.lossObservation.fired = true; resolve(null); }, 5000); })]);
  clearTimeout(timer);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { lost: lost ? { reason: lost.reason, message: lost.message } : null, observer: spike.lost, uncaptured: spike.uncaptured, waits };
}

// ---- the coexistence group --------------------------------------------------------------------------

async function runCoexistence({ context, page, environment }) {
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.operation });
  await idleWithin(page);
  const webgl = await ev(page, () => {
    const gl = atlas.renderer.gl, info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR), version: gl.getParameter(gl.VERSION), contextLost: gl.isContextLost(), acceleration: atlas.graphics.acceleration, mode: atlas.renderer.mode };
  });
  assert.equal(webgl.contextLost, false, 'Plane must hold a live WebGL 2 context');
  assert.equal(webgl.acceleration, 'hardware', `Plane must run on the physical GPU, not ${webgl.acceleration}`);
  assert.match(webgl.version, /WebGL 2/);

  const acquired = await ev(page, acquireInPage, undefined, 'acquireDevice');
  assert.equal(typeof acquired.attemptId, 'string'); assert.ok(acquired.attemptId.length > 0, 'attemptId must be set');
  const afterAcquire = await drainExpecting(page);
  const zoomBefore = await ev(page, () => atlas.view.zoom);
  await within(page.mouse.move(640, 360), LIMITS.operation, 'mouse.move'); await within(page.mouse.wheel(0, -120), LIMITS.operation, 'mouse.wheel');
  await page.waitForTimeout(400); await idleWithin(page);
  const plane = await ev(page, () => ({ zoomAfter: atlas.view.zoom, width: atlas.renderer.canvas.width, height: atlas.renderer.canvas.height, contextLost: atlas.renderer.gl.isContextLost() }));
  assert.ok(plane.zoomAfter > zoomBefore, 'the wheel step must zoom Plane in');
  assert.equal(plane.width, 1280); assert.equal(plane.height, 720); // full resolution at the 1280 × 720 viewport
  assert.equal(plane.contextLost, false);
  const webgpu = await ev(page, canvasAndProbeInPage, undefined, 'WebGPU canvas and probe');
  assert.equal(webgpu.probe.sum, 2016); assert.equal(webgpu.probe.ordered, true, 'the compute probe must write every invocation id');
  const afterWebGpuWork = await drainExpecting(page);
  pass(PASS_COEXIST, { webgl: { renderer: webgl.renderer, vendor: webgl.vendor, version: webgl.version, mode: webgl.mode }, webgpu: { attemptId: acquired.attemptId, ...webgpu }, plane: { zoomBefore, ...plane }, drains: { afterAcquire, afterWebGpuWork } });

  const { identity, isFallbackAdapter, features, limits } = acquired;
  const truthful = field => field === 'unavailable' || (typeof field?.value === 'string' && field.value.trim().length > 0 && field.source === 'adapter.info' && Object.keys(field).length === 2);
  for (const field of ['vendor', 'architecture', 'device', 'description']) assert.ok(truthful(identity[field]), `${field} must be unavailable or {value, source: 'adapter.info'}: ${JSON.stringify(identity[field])}`);
  assert.deepEqual(Object.keys(identity), ['vendor', 'architecture', 'device', 'description']);
  assert.ok(isFallbackAdapter === 'unavailable' || typeof isFallbackAdapter?.value === 'boolean', JSON.stringify(isFallbackAdapter));
  assert.notEqual(isFallbackAdapter?.value, true, 'a fallback adapter is a software device and never satisfies the physical-GPU requirement');
  assert.deepEqual(features.requested, ['timestamp-query']);
  assert.deepEqual(Object.keys(limits), ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxUniformBufferBindingSize', 'maxTextureDimension2D', 'maxComputeWorkgroupsPerDimension', 'maxComputeInvocationsPerWorkgroup', 'maxBindGroups', 'maxStorageBuffersPerShaderStage', 'maxStorageTexturesPerShaderStage']);
  for (const [key, value] of Object.entries(limits)) assert.ok(value === 'unavailable' || (Number.isInteger(value) && value > 0), `${key}: ${value}`);
  const observedFields = Object.values(identity).filter(field => field !== 'unavailable').length;
  const corroborated = { webglRenderer: webgl.renderer, chromeGpu: environment.chromeGpu };
  if (observedFields === 0) assert.ok(environment.chromeGpu?.record, `every identity field is unavailable, so chrome://gpu must corroborate the physical GPU (${JSON.stringify(environment.chromeGpu)})`);
  pass(PASS_IDENTITY, { identity, isFallbackAdapter, features, limits, observedFields, corroboration: corroborated });

  const prepared = await ev(page, prepareInPage, { boundMs: PREPARATION_BOUND_MS, dispatch: { width: 128, height: 128 } }, 'pipeline preparation', LIMITS.deep);
  prepared.longTasks = { ...longTasksByPhase(prepared.longTaskEntries, prepared.phases), observerError: prepared.observerError };
  delete prepared.longTaskEntries; delete prepared.phases; delete prepared.observerError;
  assert.equal(prepared.stages.length, 3);
  assert.ok(prepared.events.filter(event => event.set === 'cold').length >= 3, 'at least three progress events');
  assert.ok(prepared.totalMs < PREPARATION_BOUND_MS, `preparation ${prepared.totalMs} ms exceeds the ${PREPARATION_BOUND_MS} ms bound`);
  for (const stage of prepared.stages) assert.ok(!stage.messages.some(message => message.type === 'error'), `${stage.id}: ${JSON.stringify(stage.messages)}`);
  if (prepared.dispatch) {
    const total = Object.values(prepared.dispatch.counts).reduce((sum, value) => sum + value, 0);
    assert.equal(total, prepared.dispatch.width * prepared.dispatch.height, 'every ray carries a status');
    assert.equal(prepared.dispatch.validation, null, `dispatch validation: ${prepared.dispatch.validation}`);
  }
  pass(PASS_PREPARE, prepared);

  const destroyed = await ev(page, destroyInPage, undefined, 'device.destroy');
  const webglAfterDestroy = await drainExpecting(page);
  assert.equal(destroyed.lost?.reason, 'destroyed', `device.lost after destroy(): ${JSON.stringify(destroyed.lost)}`);
  assert.equal(destroyed.observer.length, 1, 'the onLost observer fires once'); assert.equal(destroyed.observer[0].attemptId, acquired.attemptId);
  assert.deepEqual(destroyed.uncaptured, [], 'no uncaptured WebGPU errors');
  pass('WebGPU device destroyed without disturbing WebGL', { lost: destroyed.lost, observer: destroyed.observer, webglAfterDestroy, waits: destroyed.waits });
}

// ---- the developer-flag experiment (never gated; the flag-absent launch is a portability experiment) ----
// Two fresh-profile launches on the same host, build, driver and source, differing only in
// --enable-webgpu-developer-features; each records its environment, the acquisition, every identity
// field, the fallback flag, features, limits and the compute probe. Nothing is asserted about whether
// identity fields are populated; acquisition, the probe and a clean teardown are asserted.
async function runDeveloperFlagExperiment({ launchProfile }) {
  for (const [launch, args] of [['with-developer-flag', [...PROJECT0_LAUNCH_ARGS]], ['without-developer-flag', PROJECT0_LAUNCH_ARGS.filter(flag => flag !== DEVELOPER_FLAG)]]) {
    const { context, environment } = await launchProfile({ label: launch, args });
    assert.equal(environment.effectiveArguments.developerFeatures, launch === 'with-developer-flag', `the developer flag must be effective only in the flagged launch (${launch})`);
    const page = expectBackend(boundContext(await within(context.newPage(), LIMITS.launch, 'newPage')), 'webgl');
    watchErrors(page);
    await page.goto(url, { timeout: LIMITS.launch });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.operation });
    await idleWithin(page);
    const acquired = await ev(page, acquireInPage, undefined, `acquireDevice (${launch})`);
    const webgpu = await ev(page, canvasAndProbeInPage, undefined, `WebGPU probe (${launch})`);
    assert.equal(webgpu.probe.sum, 2016); assert.equal(webgpu.probe.ordered, true);
    const destroyed = await ev(page, destroyInPage, undefined, `device.destroy (${launch})`);
    assert.equal(destroyed.lost?.reason, 'destroyed'); assert.deepEqual(destroyed.uncaptured, []);
    const name = launch === 'with-developer-flag' ? 'Adapter identity with --enable-webgpu-developer-features' : 'Adapter identity without --enable-webgpu-developer-features (portability experiment; never qualification)';
    pass(name, { launch, attemptId: acquired.attemptId, identity: acquired.identity, isFallbackAdapter: acquired.isFallbackAdapter, features: acquired.features, limits: acquired.limits, probe: webgpu.probe, canvasFormat: webgpu.canvasFormat, lost: destroyed.lost });
    await closeDrained(page, `application page (${launch})`);
  }
}

// ---- the recovery group (plan B06: the WebGPU backend, its allocator, admission and loss) ------------
// Born here with the backend checks; B13 extends it. Every in-page step drives the production backend
// (src/space/render/webgpu/backend.js) through the B00 contract only: leases from createAdmission,
// opaque handles, tickets. The backend's onPhase intervals and every long-task entry leave the page so
// the suite attributes long tasks to backend phases by interval overlap (B01 Q2; B15 enforces P3).
export const RECOVERY_PASSES = Object.freeze([
  'Self-check pipelines prepare asynchronously with progress and the probe readback is ATLS through ordinary admission',
  'A batch completes with queue-completion timing and a 256-row banded readback returns the staged pattern',
  'Presentation renders the display texture to the preferred canvas format at the output size without a second transfer function',
  'A real device loss through the test adapter settles outstanding tickets interrupted, marks the backend unavailable before clients are notified, and reacquisition yields a fresh attempt and a new epoch',
  'Configuration failure keeps the previous target set usable',
  'A 4K target set allocates within the cap at 72 bytes per pixel and is reclaimed after the last ticket retires',
]);

async function recoverySetupInPage() {
  const { createWebGPUBackend } = await import('/src/space/render/webgpu/backend.js');
  const { SELF_CHECK_PIPELINE_SET } = await import('/src/space/render/webgpu/pipelines.js');
  const contract = await import('/src/space/render/backend.js');
  const canvas = document.createElement('canvas');
  canvas.id = 'space-b06-canvas';
  canvas.style.cssText = 'position:fixed;right:0;bottom:0;width:160px;height:90px;z-index:2147483647;pointer-events:none';
  document.body.append(canvas);
  const phases = [], longTasks = [];
  let observerError = null;
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) longTasks.push({ name: e.name, startTime: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true }); }
  catch (error) { observerError = String(error?.message ?? error); }
  const backend = createWebGPUBackend({ canvas, clock: performance, onPhase: entry => phases.push(entry) });
  const b = {
    backend, contract, SELF_CHECK_PIPELINE_SET, canvas, phases, longTasks, observerError,
    identity: jobId => ({ requestId: `request-${jobId}`, jobId, viewId: 'space', generation: { deviceEpoch: backend.currentEpoch(), viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 } }),
    lease: jobId => ({ admission: contract.createAdmission({ epoch: backend.currentEpoch(), jobId }) }),
    batch: (pipelineId, slot, handle, region, jobId = 'probe') => ({ identity: b.identity(jobId), pipelineId, pass: 'probe', region, sample: { sequence: 'atlas-aa-v1', seed: 1, index: 0 },
      bounds: { pixels: region.width * region.height, raySteps: 0, iterations: 0, normalFieldSamples: 0, shadowRays: 0, shadowSteps: 0, aoSamples: 0 },
      inputs: {}, outputs: { [slot]: handle }, uniforms: { origin: [region.x, region.y], size: [region.width, region.height] } }),
    // Sequential ≤ 256-row bands (the annex limit), each through its own lease; tight rows concatenated.
    async readBands(source, width, height, bytesPerTexel, jobId = 'readback') {
      const out = new Uint8Array(width * height * bytesPerTexel), bands = [];
      for (let y = 0; y < height; y += 256) {
        const rows = Math.min(256, height - y);
        const ticket = backend.readback({ identity: b.identity(jobId), source, region: { x: 0, y, width, height: rows }, fields: ['band'] }, b.lease(jobId));
        const done = await ticket.done, result = await ticket.result;
        out.set(result.data, y * width * bytesPerTexel);
        const staging = backend.diagnostics().inventory.filter(item => item.name.startsWith('readback-staging'));
        bands.push({ y, rows, outcome: done.outcome, method: done.timing.method, bytes: result.data.length, staging: staging.map(item => ({ name: item.name, bytes: item.bytes, bytesPerRow: item.bytesPerRow, mappings: item.mappings })) });
      }
      return { data: out, bands };
    },
    async prepareSelfCheck() {
      const events = [], started = performance.now();
      const prepared = await backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: SELF_CHECK_PIPELINE_SET, onProgress: event => events.push({ ...event, atMs: performance.now() - started }) });
      return { prepared, events, preparationMs: performance.now() - started };
    },
    // The canvas is sampled in the task that presented it: once the frame is composited the current
    // texture expires and drawImage would read the replaced (transparent) drawing buffer.
    sampleCanvas() {
      const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
      const context = copy.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
      context.drawImage(canvas, 0, 0);
      return context.getImageData(0, 0, copy.width, copy.height, { colorSpace: 'srgb' }).data;
    },
    // Output pixel (x, y) shows the nearest display texel: floor((2x + 1) · internal / (2 · output)).
    compareCanvas(pixels, display, internal, output) {
      let mismatches = 0, first = null;
      for (let y = 0; y < output.height; y++) for (let x = 0; x < output.width; x++) {
        const sx = Math.min(Math.floor((2 * x + 1) * internal.width / (2 * output.width)), internal.width - 1);
        const sy = Math.min(Math.floor((2 * y + 1) * internal.height / (2 * output.height)), internal.height - 1);
        const o = (y * output.width + x) * 4, s = (sy * internal.width + sx) * 4;
        for (let c = 0; c < 4; c++) if (pixels[o + c] !== display[s + c]) { mismatches++; first ??= { x, y, canvas: [...pixels.subarray(o, o + 4)], display: [...display.subarray(s, s + 4)] }; break; }
      }
      return { mismatches, first, compared: output.width * output.height };
    },
    displayPatternMismatches(display, width, height) {
      let mismatches = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4, expected = [x & 255, y & 255, (x ^ y) & 255, 255];
        if (expected.some((value, c) => display[i + c] !== value)) mismatches++;
      }
      return mismatches;
    },
    // Target handles are caller-owned until release (B06 r1 finding 5).
    releaseSet(targets) { for (const handle of Object.values(targets.handles).flat()) backend.release(handle); },
    async drawDisplay(targets, jobId = 'present') {
      const { width, height } = targets.internalSize;
      const drawn = backend.submitBatch(b.batch('probe-display', 'display', targets.handles.display, { x: 0, y: 0, width, height }, jobId), b.lease(jobId));
      const presented = backend.present({ identity: b.identity(jobId), display: targets.handles.display }, b.lease(jobId));
      const pixels = b.sampleCanvas();
      return { drawn: await drawn.done, presented: await presented.done, pixels };
    },
  };
  globalThis.__b06 = b;
  return { observerError };
}

async function selfCheckInPage() {
  const b = globalThis.__b06, { backend } = b;
  const acquired = await backend.acquire();
  const preparation = await b.prepareSelfCheck();
  const targets = await backend.configureTargets({ epoch: acquired.epoch, layoutId: 'space-targets-v2', internalSize: { width: 1, height: 1 }, outputSize: { width: 1, height: 1 } });
  const probe = b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, width: 1, height: 1 });
  const refusals = {};
  try { backend.submitBatch(probe, {}); } catch (error) { refusals.withoutLease = error.code; }
  const lease = b.lease('probe');
  const ticket = backend.submitBatch(probe, lease);
  try { backend.submitBatch(probe, lease); } catch (error) { refusals.reusedLease = error.code; }
  const done = await ticket.done;
  const read = backend.readback({ identity: b.identity('probe'), source: targets.handles.status, region: { x: 0, y: 0, width: 1, height: 1 }, fields: ['status'] }, b.lease('probe'));
  const readDone = await read.done, result = await read.result;
  const word = new DataView(result.data.buffer, result.data.byteOffset, 4).getUint32(0, true);
  const staging = backend.diagnostics().inventory.filter(item => item.name.startsWith('readback-staging')).map(item => ({ bytes: item.bytes, bytesPerRow: item.bytesPerRow, mappings: item.mappings }));
  return { acquired, ...preparation, targets: { epoch: targets.epoch, layoutId: targets.layoutId, accumulation: targets.descriptions.accumulation }, done, readDone, word, dataLength: result.data.length, staging, refusals };
}

async function bandedInPage() {
  const b = globalThis.__b06, { backend } = b, epoch = backend.currentEpoch();
  const width = 1024, height = 600;
  const targets = await backend.configureTargets({ epoch, layoutId: 'space-targets-v2', internalSize: { width, height }, outputSize: { width, height } });
  // F3 ruling (a): B06 owns resource initialization — both fresh accumulation textures and the flags
  // texture read back as zero through admitted readback (B11 owns sample-0 initialization).
  const zero = {};
  for (const [name, handle, bpt] of [['accumulation-0', targets.handles.accumulation[0], 16], ['accumulation-1', targets.handles.accumulation[1], 16], ['accumulationFlags', targets.handles.accumulationFlags, 4]]) {
    const { data } = await b.readBands(handle, width, height, bpt, 'zero');
    const words = new Uint32Array(data.buffer, data.byteOffset, data.length / 4);
    let nonzero = 0; for (let i = 0; i < words.length; i++) if (words[i] !== 0) nonzero++;
    zero[name] = { bytes: data.length, nonzero };
  }
  const ticket = backend.submitBatch(b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, width, height }), b.lease('probe'));
  const done = await ticket.done;
  const { data, bands } = await b.readBands(targets.handles.status, width, height, 4);
  const words = new Uint32Array(data.buffer, data.byteOffset, width * height);
  let mismatches = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (words[y * width + x] !== ((0x41544c53 ^ ((y << 16) | x)) >>> 0)) mismatches++;
  // An unaligned interior region: 3 texels (12 bytes) in a 256-byte row pitch, padding stripped.
  const narrow = backend.readback({ identity: b.identity('narrow'), source: targets.handles.status, region: { x: 5, y: 7, width: 3, height: 2 }, fields: ['status'] }, b.lease('narrow'));
  const narrowData = new Uint32Array((await narrow.result).data.buffer);
  const narrowExpected = [0, 1].flatMap(dy => [5, 6, 7].map(x => (0x41544c53 ^ (((7 + dy) << 16) | x)) >>> 0));
  // Production allocate (B00 ruling 8): copied, zero-padded initial data; no queue submission, no lease.
  const source = Uint8Array.from([1, 2, 3, 4, 5]);
  const model = backend.allocate({ name: 'model', bytes: 16, usage: 'storage', data: source });
  source[0] = 99; // the copy was taken at creation
  const modelRead = backend.readback({ identity: b.identity('model'), source: model, region: { x: 0, y: 0, width: 16, height: 1 }, fields: ['model'] }, b.lease('model'));
  const modelBytes = [...(await modelRead.result).data];
  const refusals = {};
  for (const [label, desc] of [['texture-shaped', { name: 'image', bytes: 16, width: 2, height: 2 }], ['not divisible by four', { name: 'odd', bytes: 6, usage: 'storage' }],
    ['unknown usage', { name: 'vertex', bytes: 16, usage: 'vertex' }], ['zero bytes', { name: 'empty', bytes: 0, usage: 'uniform' }]]) {
    try { backend.allocate(desc); refusals[label] = 'accepted'; } catch (error) { refusals[label] = error.code; }
  }
  const before = backend.diagnostics().tracked;
  try { backend.allocate({ name: 'uniform-too-large', bytes: globalThis.__b06Limits.maxUniformBufferBindingSize + 4, usage: 'uniform' }); refusals.uniformAboveBindingLimit = 'accepted'; } catch (error) { refusals.uniformAboveBindingLimit = error.code; }
  const trackedUnchanged = backend.diagnostics().tracked === before;
  backend.release(model);
  // A GPU validation failure (B07 ruling (d)): the depth target (r32float) bound where the probe's auto
  // layout expects an r32uint storage texture passes the JS slot checks, fails createBindGroup inside the
  // ticket's error scope, and settles `failed` only after the scopes and the fence — holds released.
  const invalidTicket = backend.submitBatch(b.batch('probe', 'probe_target', targets.handles.depth, { x: 0, y: 0, width: 8, height: 8 }, 'failing'), b.lease('failing'));
  const failed = await invalidTicket.done;
  const depthEntry = backend.diagnostics().inventory.find(item => item.id === targets.handles.depth.id);
  const failedHolds = { depthTickets: depthEntry.tickets, lingeringUniforms: backend.diagnostics().inventory.filter(item => item.name.startsWith('uniforms:')).length, uncaptured: backend.testAdapter.uncapturedErrors().length };
  const afterFailure = await backend.submitBatch(b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, width: 8, height: 8 }), b.lease('probe')).done;
  b.releaseSet(targets);
  return { zero, failed, failedHolds, afterFailure, epochAfterFailure: backend.currentEpoch(), epoch, done, bands, mismatches, pixels: width * height, narrow: { matches: narrowData.every((value, i) => value === narrowExpected[i]), length: narrowData.length }, modelBytes, refusals, trackedUnchanged };
}

async function presentInPage() {
  const b = globalThis.__b06, { backend } = b, epoch = backend.currentEpoch();
  const internal = { width: 320, height: 180 }, output = { width: 640, height: 360 };
  const targets = await backend.configureTargets({ epoch, layoutId: 'space-targets-v2', internalSize: internal, outputSize: output });
  const { pixels, ...drawn } = await b.drawDisplay(targets);
  const { data: display } = await b.readBands(targets.handles.display, internal.width, internal.height, 4);
  b.releaseSet(targets);
  return { drawn, canvas: { width: b.canvas.width, height: b.canvas.height }, displayPattern: b.displayPatternMismatches(display, internal.width, internal.height), comparison: b.compareCanvas(pixels, display, internal, output) };
}

async function lossInPage() {
  const b = globalThis.__b06, { backend } = b;
  const first = { epoch: backend.currentEpoch() };
  const targets = await backend.configureTargets({ epoch: first.epoch, layoutId: 'space-targets-v2', internalSize: { width: 256, height: 256 }, outputSize: { width: 256, height: 256 } });
  const seen = [];
  const unsubscribe = backend.onLoss(event => seen.push({ event, epochInCallback: backend.currentEpoch(), stateInCallback: backend.diagnostics().state, trackedInCallback: backend.diagnostics().tracked }));
  const oldLease = b.lease('probe');
  const tickets = [0, 1, 2].map(() => backend.submitBatch(b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, width: 256, height: 256 }), b.lease('probe')));
  const read = backend.readback({ identity: b.identity('probe'), source: targets.handles.status, region: { x: 0, y: 0, width: 256, height: 256 }, fields: ['status'] }, b.lease('probe'));
  const observedLoss = await backend.testAdapter.destroyDevice();
  const outcomes = await Promise.all([...tickets, read].map(ticket => ticket.done));
  let readResult;
  try { await read.result; readResult = 'resolved'; } catch (error) { readResult = error.code; }
  const after = backend.diagnostics();
  const refusals = {};
  try { backend.submitBatch(b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, width: 1, height: 1 }), oldLease); } catch (error) { refusals.afterLoss = error.code; }
  const second = await backend.acquire();
  try { backend.submitBatch({ ...b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, width: 1, height: 1 }), identity: { ...b.identity('probe'), generation: { ...b.identity('probe').generation, deviceEpoch: first.epoch } } }, oldLease); } catch (error) { refusals.staleEpoch = error.code; }
  await b.prepareSelfCheck();
  const probeTargets = await backend.configureTargets({ epoch: second.epoch, layoutId: 'space-targets-v2', internalSize: { width: 1, height: 1 }, outputSize: { width: 1, height: 1 } });
  try { backend.submitBatch(b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, width: 1, height: 1 }), b.lease('probe')); } catch (error) { refusals.oldHandle = error.code; }
  const probe = await backend.submitBatch(b.batch('probe', 'probe_target', probeTargets.handles.status, { x: 0, y: 0, width: 1, height: 1 }), b.lease('probe')).done;
  const word = new DataView((await backend.readback({ identity: b.identity('probe'), source: probeTargets.handles.status, region: { x: 0, y: 0, width: 1, height: 1 }, fields: ['status'] }, b.lease('probe')).result).data.buffer).getUint32(0, true);
  // The injected notification exercises the same invalidation path.
  const injectedTicket = backend.submitBatch(b.batch('probe', 'probe_target', probeTargets.handles.status, { x: 0, y: 0, width: 1, height: 1 }), b.lease('probe'));
  const injected = backend.testAdapter.injectLoss({ reason: 'unknown', message: 'injected by the recovery suite' });
  const injectedState = { epoch: backend.currentEpoch(), state: backend.diagnostics().state, outcome: await injectedTicket.done };
  const third = await backend.acquire();
  await b.prepareSelfCheck();
  unsubscribe();
  return { first, observedLoss, seen, outcomes, readResult, after: { state: after.state, epoch: after.epoch, tracked: after.tracked, inventory: after.inventory.length }, refusals,
    second: { epoch: second.epoch, attemptId: second.identity.attemptId }, probe, word, injected, injectedState, third: { epoch: third.epoch, attemptId: third.identity.attemptId } };
}

async function configurationFailureInPage() {
  const b = globalThis.__b06, { backend } = b, epoch = backend.currentEpoch();
  const internal = { width: 320, height: 180 }, output = { width: 640, height: 360 };
  const targets = await backend.configureTargets({ epoch, layoutId: 'space-targets-v2', internalSize: internal, outputSize: output });
  await b.drawDisplay(targets);
  const snapshot = () => { const d = backend.diagnostics(); return { tracked: d.tracked, live: d.inventory.filter(item => item.state === 'live').map(item => item.id).sort() }; };
  const before = snapshot(), failures = {};
  try { await backend.configureTargets({ epoch, layoutId: 'space-targets-v2', internalSize: { width: 8192, height: 8192 }, outputSize: { width: 8192, height: 8192 } }); failures.aboveCap = 'accepted'; } catch (error) { failures.aboveCap = error.code; }
  const afterCap = snapshot();
  backend.testAdapter.failNextAllocation();
  try { await backend.configureTargets({ epoch, layoutId: 'space-targets-v2', internalSize: { width: 64, height: 64 }, outputSize: { width: 64, height: 64 } }); failures.injected = 'accepted'; } catch (error) { failures.injected = error.code; }
  const afterInjected = snapshot();
  // The earlier set still presents: redraw and present it, then compare the canvas with its display bytes.
  const { pixels, ...drawn } = await b.drawDisplay(targets);
  const { data: display } = await b.readBands(targets.handles.display, internal.width, internal.height, 4);
  const comparison = b.compareCanvas(pixels, display, internal, output);
  b.releaseSet(targets);
  return { failures, before, afterCap, afterInjected, drawn, canvas: { width: b.canvas.width, height: b.canvas.height }, comparison, displayPattern: b.displayPatternMismatches(display, internal.width, internal.height) };
}

async function fourKInPage() {
  const b = globalThis.__b06, { backend } = b, epoch = backend.currentEpoch();
  const internal = { width: 3840, height: 2160 };
  const targets = await backend.configureTargets({ epoch, layoutId: 'space-targets-v2', internalSize: internal, outputSize: { width: 1920, height: 1080 } });
  const ids = new Set(Object.values(targets.handles).flat().map(handle => handle.id));
  const inventory = () => backend.diagnostics().inventory.filter(item => ids.has(item.id));
  const allocated = inventory().map(({ name, bytes, width, height, format, state }) => ({ name, bytes, width, height, format, state }));
  const targetBytes = allocated.reduce((sum, item) => sum + item.bytes, 0), trackedAtAllocation = backend.diagnostics().tracked;
  const ticket = backend.submitBatch(b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, ...internal }), b.lease('probe'));
  backend.release(targets.handles.status); // released while the ticket still references it
  const whileHeld = { tracked: backend.diagnostics().tracked, retiring: backend.diagnostics().retiring, status: inventory().find(item => item.name === 'status') };
  const done = await ticket.done;
  const afterTicket = { tracked: backend.diagnostics().tracked, retiring: backend.diagnostics().retiring, statusPresent: inventory().some(item => item.name === 'status') };
  const replacement = await backend.configureTargets({ epoch, layoutId: 'space-targets-v2', internalSize: { width: 64, height: 64 }, outputSize: { width: 64, height: 64 } });
  // Caller-owned: the earlier 4K set survives the replacement and its display can still be presented.
  const keptAfterReplacement = inventory().length;
  const previousPresented = await backend.present({ identity: b.identity('present'), display: targets.handles.display }, b.lease('present')).done;
  const retained = { tracked: backend.diagnostics().tracked };
  b.releaseSet(targets);
  const afterReplacement = { tracked: backend.diagnostics().tracked, remaining4K: inventory().length, peak: backend.diagnostics().peak };
  b.releaseSet(replacement);
  return { allocated, targetBytes, trackedAtAllocation, whileHeld, done, afterTicket, keptAfterReplacement, previousPresented, retained, afterReplacement };
}

async function recoveryFinishInPage() {
  const b = globalThis.__b06, { backend } = b;
  await new Promise(resolve => setTimeout(resolve, 0));
  backend.destroy();
  const final = backend.diagnostics();
  let reacquire;
  try { await backend.acquire(); reacquire = 'accepted'; } catch (error) { reacquire = error.code; }
  b.canvas.remove();
  return { phases: b.phases, longTasks: b.longTasks, observerError: b.observerError, uncaptured: backend.testAdapter.uncapturedErrors(), final: { state: final.state, epoch: final.epoch, tracked: final.tracked }, reacquire };
}

async function runRecovery({ page }) {
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.operation });
  await idleWithin(page);
  await ev(page, recoverySetupInPage, undefined, 'recovery setup');
  const cap = 2 ** 30;

  try {
    const selfCheck = await ev(page, selfCheckInPage, undefined, 'self-check preparation and probe', LIMITS.deep);
    await ev(page, limits => { globalThis.__b06Limits = limits; }, selfCheck.acquired.limits, 'record limits');
    const { acquired } = selfCheck;
    assert.ok(acquired.epoch >= 1, `a successful acquisition has a positive epoch (${acquired.epoch})`);
    assert.equal(typeof acquired.identity.attemptId, 'string');
    assert.deepEqual(acquired.requestedLimits, {}, 'no blanket requiredLimits: B06 requests no increase');
    for (const key of ['maxUniformBufferBindingSize', 'maxStorageTexturesPerShaderStage', 'maxStorageBuffersPerShaderStage', 'maxTextureDimension2D']) {
      assert.ok(Number.isInteger(acquired.limits[key]) && Number.isInteger(acquired.adapterLimits[key]) && acquired.adapterLimits[key] >= acquired.limits[key], `${key}: granted ${acquired.limits[key]} / adapter ${acquired.adapterLimits[key]}`);
    }
    assert.ok(['bgra8unorm', 'rgba8unorm'].includes(acquired.canvasFormat));
    assert.deepEqual(selfCheck.prepared.preparedPipelineIds, ['probe', 'probe-display', 'selfcheck-trace', 'present']);
    assert.equal(selfCheck.prepared.epoch, acquired.epoch);
    assert.equal(selfCheck.events[0].stage, 'preparing'); assert.equal(selfCheck.events[0].completed, 0);
    assert.deepEqual(selfCheck.events.map(event => event.completed), [0, 1, 2, 3, 4], 'progress counts every pipeline once');
    assert.ok(selfCheck.events.every(event => event.total === 4));
    assert.ok(selfCheck.preparationMs < PREPARATION_BOUND_MS);
    assert.deepEqual(selfCheck.refusals, { withoutLease: 'no-admission', reusedLease: 'no-admission' });
    assert.equal(selfCheck.done.outcome, 'completed'); assert.equal(selfCheck.done.timing.method, 'queue-completion');
    assert.ok(Number.isFinite(selfCheck.done.timing.elapsedMs) && selfCheck.done.queueCompletedAt !== null);
    assert.equal(selfCheck.readDone.outcome, 'completed');
    assert.equal(selfCheck.word, 0x41544c53, `the probe readback must be ATLS, got 0x${selfCheck.word.toString(16)}`);
    assert.equal(selfCheck.dataLength, 4, 'row padding is stripped on copy-out');
    assert.deepEqual(selfCheck.staging, [{ bytes: 256, bytesPerRow: 256, mappings: 0 }], 'one 256-byte-aligned staging row; mapping ended before the result');
    assert.equal(selfCheck.targets.layoutId, 'space-targets-v2'); assert.equal(selfCheck.targets.accumulation.length, 2);
    pass(RECOVERY_PASSES[0], { acquired, preparationMs: selfCheck.preparationMs, events: selfCheck.events, prepared: selfCheck.prepared, done: selfCheck.done, word: `0x${selfCheck.word.toString(16)}`, refusals: selfCheck.refusals, staging: selfCheck.staging });

    const banded = await ev(page, bandedInPage, undefined, 'banded readback', LIMITS.deep);
    assert.equal(banded.done.outcome, 'completed'); assert.equal(banded.done.timing.method, 'queue-completion'); assert.ok(Number.isFinite(banded.done.timing.elapsedMs));
    assert.deepEqual(banded.bands.map(band => [band.y, band.rows]), [[0, 256], [256, 256], [512, 88]]);
    for (const band of banded.bands) {
      assert.equal(band.outcome, 'completed'); assert.equal(band.bytes, 1024 * 4 * band.rows);
      assert.ok(band.staging.length <= 2 && band.staging.every(item => item.bytesPerRow % 256 === 0 && item.mappings === 0), JSON.stringify(band.staging));
    }
    assert.equal(banded.mismatches, 0, `${banded.mismatches} of ${banded.pixels} texels differ from the staged pattern`);
    assert.deepEqual(banded.narrow, { matches: true, length: 6 });
    assert.deepEqual(banded.modelBytes, [1, 2, 3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'allocate copies initial data at creation and zero-pads');
    assert.deepEqual(banded.refusals, { 'texture-shaped': 'invalid-descriptor', 'not divisible by four': 'invalid-descriptor', 'unknown usage': 'invalid-descriptor', 'zero bytes': 'invalid-descriptor', uniformAboveBindingLimit: 'allocation-failed' });
    assert.equal(banded.trackedUnchanged, true);
    assert.deepEqual(banded.zero, { 'accumulation-0': { bytes: 1024 * 600 * 16, nonzero: 0 }, 'accumulation-1': { bytes: 1024 * 600 * 16, nonzero: 0 }, accumulationFlags: { bytes: 1024 * 600 * 4, nonzero: 0 } }, 'fresh accumulation and flags targets read back zero');
    assert.equal(banded.failed.outcome, 'failed', JSON.stringify(banded.failed));
    assert.equal(banded.failed.queueCompletedAt, null); assert.equal(banded.failed.timing.elapsedMs, null); assert.equal(banded.failed.timing.timestampMs, undefined);
    assert.ok(typeof banded.failed.reason === 'string' && banded.failed.reason.length > 0, 'a failure carries the error message');
    assert.deepEqual(banded.failedHolds, { depthTickets: 0, lingeringUniforms: 0, uncaptured: 0 }, 'a failed ticket is terminal: its holds are released and its scope captured the error');
    assert.equal(banded.afterFailure.outcome, 'completed', 'a failed ticket is not a loss'); assert.equal(banded.epochAfterFailure, banded.epoch);
    pass(RECOVERY_PASSES[1], { done: banded.done, bands: banded.bands, mismatches: banded.mismatches, narrow: banded.narrow, modelBytes: banded.modelBytes, refusals: banded.refusals, zero: banded.zero, failed: banded.failed, failedHolds: banded.failedHolds, afterFailure: banded.afterFailure });

    const presented = await ev(page, presentInPage, undefined, 'presentation', LIMITS.deep);
    assert.equal(presented.drawn.drawn.outcome, 'completed'); assert.equal(presented.drawn.presented.outcome, 'completed');
    assert.deepEqual(presented.canvas, { width: 640, height: 360 }, 'the canvas is at the output size');
    assert.equal(presented.displayPattern, 0, 'the display texture holds the probe-display pattern');
    assert.equal(presented.comparison.mismatches, 0, `canvas differs from the display bytes: ${JSON.stringify(presented.comparison.first)}`);
    pass(RECOVERY_PASSES[2], { canvasFormat: acquired.canvasFormat, ...presented });

    const loss = await ev(page, lossInPage, undefined, 'device loss and reacquisition', LIMITS.deep);
    assert.equal(loss.observedLoss, true);
    assert.equal(loss.seen.length, 2, 'one notification for the real loss and one for the injected loss');
    assert.equal(loss.seen[0].event.epoch, loss.first.epoch); assert.equal(loss.seen[0].event.reason, 'destroyed');
    assert.equal(loss.seen[0].epochInCallback, 0, 'the epoch is invalidated before clients are notified');
    assert.equal(loss.seen[0].stateInCallback, 'unavailable', 'the backend is unavailable before clients are notified');
    assert.equal(loss.seen[0].trackedInCallback, 0, 'resources are released before clients are notified');
    for (const outcome of loss.outcomes) {
      assert.equal(outcome.outcome, 'interrupted', JSON.stringify(outcome));
      assert.equal(outcome.queueCompletedAt, null); assert.equal(outcome.timing.elapsedMs, null); assert.equal(outcome.timing.timestampMs, undefined);
    }
    assert.equal(loss.readResult, 'device-lost');
    assert.deepEqual(loss.after, { state: 'unavailable', epoch: 0, tracked: 0, inventory: 0 });
    assert.deepEqual(loss.refusals, { afterLoss: 'unavailable', staleEpoch: 'stale-epoch', oldHandle: 'invalid-descriptor' });
    assert.ok(loss.second.epoch > loss.first.epoch, 'reacquisition yields a new, larger epoch');
    assert.notEqual(loss.second.attemptId, acquired.identity.attemptId, 'reacquisition is a fresh attempt');
    assert.equal(loss.probe.outcome, 'completed'); assert.equal(loss.word, 0x41544c53);
    assert.equal(loss.injected, true);
    assert.deepEqual({ epoch: loss.injectedState.epoch, state: loss.injectedState.state, outcome: loss.injectedState.outcome.outcome }, { epoch: 0, state: 'unavailable', outcome: 'interrupted' });
    assert.equal(loss.seen[1].epochInCallback, 0); assert.equal(loss.seen[1].event.reason, 'unknown');
    assert.ok(loss.third.epoch > loss.second.epoch); assert.notEqual(loss.third.attemptId, loss.second.attemptId);
    pass(RECOVERY_PASSES[3], loss);

    const configuration = await ev(page, configurationFailureInPage, undefined, 'configuration failure', LIMITS.deep);
    assert.deepEqual(configuration.failures, { aboveCap: 'allocation-failed', injected: 'allocation-failed' });
    assert.deepEqual(configuration.afterCap, configuration.before, 'a refused configuration leaves accounting and the live set unchanged');
    assert.deepEqual(configuration.afterInjected, configuration.before, 'a failed creation rolls back completely');
    assert.equal(configuration.drawn.presented.outcome, 'completed');
    assert.deepEqual(configuration.canvas, { width: 640, height: 360 });
    assert.equal(configuration.displayPattern, 0);
    assert.equal(configuration.comparison.mismatches, 0, `the earlier set no longer presents: ${JSON.stringify(configuration.comparison.first)}`);
    pass(RECOVERY_PASSES[4], configuration);

    const fourK = await ev(page, fourKInPage, undefined, '4K target set', LIMITS.deep);
    const bpp = { depth: 4, status: 4, recovery: 4, normal: 8, sampleColor: 8, lightingStatus: 4, accumulationFlags: 4, 'accumulation-0': 16, 'accumulation-1': 16, display: 4, retained: 4 };
    assert.deepEqual(fourK.allocated.map(item => item.name).sort(), Object.keys(bpp).sort());
    for (const item of fourK.allocated) { assert.equal(item.bytes, 3840 * 2160 * bpp[item.name], item.name); assert.deepEqual([item.width, item.height, item.state], [3840, 2160, 'live']); }
    assert.equal(fourK.targetBytes, 630_374_400, '76 bytes per pixel at 3840 × 2160 (space-targets-v2)'); assert.equal(3840 * 2160 * 76, 630_374_400);
    assert.ok(fourK.trackedAtAllocation <= cap);
    assert.equal(fourK.whileHeld.tracked, fourK.trackedAtAllocation + 16, 'released bytes stay tracked while the ticket holds them (plus its counted 16-byte uniform snapshot)');
    assert.equal(fourK.whileHeld.retiring, 3840 * 2160 * 4 + 16, 'the released status target and the uniform snapshot are retiring'); assert.equal(fourK.whileHeld.status.state, 'retiring'); assert.equal(fourK.whileHeld.status.tickets, 1);
    assert.equal(fourK.done.outcome, 'completed');
    assert.deepEqual(fourK.afterTicket, { tracked: fourK.trackedAtAllocation - 3840 * 2160 * 4, retiring: 0, statusPresent: false }, 'reclaimed once the last ticket retires');
    assert.equal(fourK.keptAfterReplacement, 10, 'reconfiguration keeps the earlier set caller-owned (status was already released)');
    assert.equal(fourK.previousPresented.outcome, 'completed', 'the previous image can still be presented after reconfiguration');
    assert.equal(fourK.afterReplacement.remaining4K, 0, 'the earlier 4K set is reclaimed after its explicit release');
    assert.equal(fourK.afterReplacement.tracked, fourK.trackedAtAllocation - fourK.targetBytes + 64 * 64 * 76);
    pass(RECOVERY_PASSES[5], fourK);
  } finally { await recordRecoveryLongTasks(page); }

  const finish = await ev(page, recoveryFinishInPage, undefined, 'recovery teardown');
  assert.deepEqual(finish.uncaptured, [], `no uncaptured WebGPU errors: ${JSON.stringify(finish.uncaptured)}`);
  assert.deepEqual(finish.final, { state: 'destroyed', epoch: 0, tracked: 0 }); assert.equal(finish.reacquire, 'unavailable', 'destroy() is terminal');
}

// Long tasks attributed to backend phases by interval overlap (B01 Q2; recorded, B15 enforces P3).
// Collected in the group's finally, so failure exits keep their phase and observer evidence.
async function recordRecoveryLongTasks(page) {
  let evidence;
  try { evidence = await ev(page, () => { const b = globalThis.__b06; return b ? { phases: b.phases, longTasks: b.longTasks, observerError: b.observerError } : null; }, undefined, 'long-task evidence'); }
  catch (error) { report.push({ name: 'Long tasks attributed to backend phases (recorded; B15 enforces P3)', unavailable: String(error?.message ?? error) }); return; }
  if (!evidence) return;
  const phases = Object.fromEntries(evidence.phases.map((entry, index) => [`${index}:${entry.phase}`, { start: entry.start, end: entry.end }]));
  const attributed = evidence.observerError ? null : longTasksByPhase(evidence.longTasks, phases);
  const byKind = {}, spans = {}, failures = {};
  if (attributed) for (const [name, tasks] of Object.entries(attributed.byPhase)) if (tasks.length) { const kind = name.slice(name.indexOf(':') + 1); byKind[kind] = (byKind[kind] ?? 0) + tasks.length; }
  for (const entry of evidence.phases) { spans[entry.phase] = Math.max(spans[entry.phase] ?? 0, entry.end - entry.start); if (entry.failed) failures[entry.phase] = (failures[entry.phase] ?? 0) + 1; }
  const summary = { observerError: evidence.observerError, totalLongTasks: evidence.longTasks.length, overlappingBackendPhases: byKind, startup: attributed?.startup.length ?? null, outside: attributed?.outside.length ?? null, phaseCount: evidence.phases.length, failureExits: failures, longestPhaseMs: spans };
  report.push({ name: 'Long tasks attributed to backend phases (recorded; B15 enforces P3)', ...summary, tasks: evidence.longTasks });
  console.log(`long tasks ${JSON.stringify(summary)}`);
}

// ---- the numerics group (plan B08: the WGSL field kernels against B04's frozen matrix, P1) ----------
// Point strata only (B10 owns the ray strata and anchors). The point shards load through the pinned
// index (index, logical matrix, generator and reference hashes pinned; each loaded shard's byte length,
// SHA-256 and declared IDs verified by assembleMatrix) — a partial view, never whole-matrix
// qualification. Every point batch runs through the production backend (B00 contract, B06 ABI): model
// and point buffers from allocate(), one admission lease per submission and readback, results
// prefilled with a sentinel so an unwritten result is a failure. Comparisons are Node-side
// (tests/support/space-numerics.mjs) with the frozen tolerances; nothing is compared bit for bit
// against B03.
export const NUMERICS_PASSES = Object.freeze([
  'Bulb kernels match the frozen references for every power, mandatory stratum and budget',
  'Quaternion kernels match the frozen references across off-plane C, nonzero κ and the boundary strata including every component',
  'κ = ±4 strata report empty slices and initialization escapes exactly',
  'The 20 adversarial point cases give their expected statuses on the GPU',
  'Derivative range safety holds on the GPU beyond update 44',
  'Validation records are registered only for passed mandatory strata',
]);
const NUMERICS_PITCH = { 'bulb-origin': 1, 'bulb-polar': 24, 'bulb-generic': 256, 'quaternion-generic': 256, 'quaternion-boundary': 8, adversarial: 1 };

async function numericsSetupInPage() {
  const { createWebGPUBackend } = await import('/src/space/render/webgpu/backend.js');
  const kernels = await import('/src/space/render/webgpu/kernels.js');
  const contract = await import('/src/space/render/backend.js');
  const parameters = await import('/src/space/numerics/parameters.js');
  const canvas = document.createElement('canvas');
  canvas.id = 'space-b08-canvas';
  canvas.style.cssText = 'position:fixed;right:0;bottom:0;width:16px;height:9px;z-index:2147483647;pointer-events:none';
  document.body.append(canvas);
  const backend = createWebGPUBackend({ canvas, clock: performance });
  const acquired = await backend.acquire();
  const events = [], started = performance.now();
  const prepared = await backend.prepare({ epoch: acquired.epoch, pipelineSet: kernels.fieldPipelineSet(), onProgress: event => events.push(event) });
  const preparationMs = performance.now() - started;
  const boxes = {};
  for (const depth of [1, 2]) { const data = kernels.mengerBoxData(depth); boxes[depth] = backend.allocate({ name: `menger-boxes-${depth}`, bytes: data.byteLength, usage: 'storage', data }); }
  const s = { backend, kernels, contract, parameters, canvas, boxes,
    identity: jobId => ({ requestId: `request-${jobId}`, jobId, viewId: 'space-numerics', generation: { deviceEpoch: backend.currentEpoch(), viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 } }),
    lease: jobId => ({ admission: contract.createAdmission({ epoch: backend.currentEpoch(), jobId }) }),
  };
  globalThis.__b08 = s;
  return { acquired: { epoch: acquired.epoch, requestedLimits: acquired.requestedLimits, limits: acquired.limits, canvasFormat: acquired.canvasFormat }, prepared, preparationMs, events,
    implementationHashes: kernels.implementationHashes(), kernelVersion: kernels.KERNEL_VERSION, formulation: kernels.KERNEL_FORMULATION };
}

// One allocate()d points buffer and one sentinel-filled results buffer per call; one batch (one lease)
// per entry over its own row-aligned span; one admitted readback of the results. `raw` encodes points
// without admission and `rawModel` bypasses admitPointModel — used only to exercise in-kernel guards.
async function pointsInPage({ label, pitch, batches, raw = false }) {
  const s = globalThis.__b08, { backend, kernels } = s, jobId = `numerics-${label}`;
  const spans = [], all = [], derivative = batches.some(batch => batch.pipelineId === kernels.DERIVATIVE_PIPELINE_ID);
  let first = 0;
  for (const batch of batches) {
    const rows = Math.ceil(batch.points.length / pitch);
    spans.push({ first, count: batch.points.length, pitch });
    // NaN and Infinity cross the page boundary as string tokens (raw guard points only).
    all.push(...(raw ? batch.points.map(p => p.map(v => (typeof v === 'string' ? Number(v) : v))) : batch.points));
    for (let k = batch.points.length; k < rows * pitch; k++) all.push(derivative ? { grow: 0, add: 0, updates: 0 } : [0, 0, 0]);
    first += rows * pitch;
  }
  const data = derivative ? kernels.encodeDerivativeProbes(all) : raw ? kernels.encodeRawPoints(all) : kernels.encodePoints(all);
  const pointsBuffer = backend.allocate({ name: `points:${label}`, bytes: data.byteLength, usage: 'storage', data });
  const resultsBuffer = backend.allocate({ name: `results:${label}`, bytes: first * kernels.POINT_RESULT_BYTES, usage: 'storage', data: kernels.sentinelResults(first) });
  const started = performance.now(), tickets = [];
  batches.forEach((batch, i) => {
    const model = batch.rawModel ?? kernels.admitPointModel(batch.modelId, batch.effective, batch.cap);
    const pipelineId = batch.pipelineId ?? kernels.pointsPipelineId(batch.modelId), span = spans[i];
    const inputs = { points: pointsBuffer, results: resultsBuffer };
    if (pipelineId !== kernels.DERIVATIVE_PIPELINE_ID) inputs.menger_boxes = s.boxes[model.depth === 2 ? 2 : 1];
    tickets.push(backend.submitBatch({ identity: s.identity(jobId), pipelineId, pass: kernels.POINT_BATCH_PASS, region: kernels.pointRegion(span),
      sample: { sequence: 'atlas-aa-v1', seed: 1, index: 0 }, bounds: kernels.pointBounds(model, span), inputs, outputs: { results: resultsBuffer },
      uniforms: kernels.pointUniforms(model, span) }, s.lease(jobId)));
  });
  const outcomes = await Promise.all(tickets.map(ticket => ticket.done));
  const read = backend.readback({ identity: s.identity(jobId), source: resultsBuffer, region: { x: 0, y: 0, width: first * kernels.POINT_RESULT_BYTES, height: 1 }, fields: ['results'] }, s.lease(jobId));
  const readDone = await read.done;
  let bytes = null, readError = null;
  try { bytes = (await read.result).data; } catch (error) { readError = String(error?.message ?? error); }
  backend.release(pointsBuffer); backend.release(resultsBuffer);
  let binary = '';
  if (bytes) for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const counts = {};
  for (const done of outcomes) counts[done.outcome] = (counts[done.outcome] ?? 0) + 1;
  return { spans, total: first, batches: batches.length, outcomes: counts, failures: outcomes.filter(done => done.outcome !== 'completed').slice(0, 5).map(done => ({ outcome: done.outcome, reason: done.reason })),
    read: { outcome: readDone.outcome, error: readError, bytes: bytes?.length ?? 0 }, wallMs: performance.now() - started,
    queueMs: outcomes.reduce((sum, done) => sum + (done.timing?.elapsedMs ?? 0), 0), base64: btoa(binary) };
}

// Host admission of the five invalid adversarial inputs: refused before any dispatch.
async function invalidAdmissionInPage(cases) {
  const { kernels, parameters } = globalThis.__b08;
  const attempt = fn => { try { fn(); return { admission: 'admitted' }; } catch (error) { return { admission: 'reject', error: `${error?.name}: ${error?.message}` }; } };
  return cases.map(c => {
    const value = c.inputs.invalidValue === 'NaN' ? Number.NaN : c.inputs.invalidValue === 'Infinity' ? Number.POSITIVE_INFINITY : c.inputs.invalidValue;
    switch (c.inputs.interpretation) {
      case 'invalid-bulb-coordinate': return attempt(() => { kernels.admitPointModel('mandelbulb', { power: 8 }, 128); kernels.encodePoints([[value, 0, 0]]); });
      case 'invalid-quaternion-coordinate': return attempt(() => { kernels.admitPointModel('quaternion-julia', { C: [0, 0, 0, 0], kappa: 0 }, 128); kernels.encodePoints([[value, 0, 0]]); });
      case 'invalid-bulb-power': return attempt(() => kernels.admitPointModel('mandelbulb', { power: value }, 128));
      // A requested decimal just outside [-4, 4] rounds to 4 in binary32: B02 refuses it as a decimal.
      case 'invalid-quaternion-parameter': return attempt(() => { const { effective } = parameters.effectiveParameters('quaternion-julia', { C: [value, '0', '0', '0'], kappa: '0' }); kernels.admitPointModel('quaternion-julia', effective, 128); });
      case 'invalid-iteration-budget': return attempt(() => kernels.admitPointModel('mandelbulb', { power: 8 }, value));
      default: return { admission: 'unknown interpretation' };
    }
  });
}

async function numericsFinishInPage() {
  const s = globalThis.__b08, { backend } = s;
  for (const handle of Object.values(s.boxes)) backend.release(handle);
  await new Promise(resolve => setTimeout(resolve, 0));
  const uncaptured = backend.testAdapter?.uncapturedErrors?.() ?? [];
  backend.destroy();
  const final = backend.diagnostics();
  s.canvas.remove();
  return { uncaptured, final: { state: final.state, epoch: final.epoch, tracked: final.tracked } };
}

async function runNumerics({ page }) {
  const { loadPinnedPointStrata, comparePointStratum } = await import('./support/space-numerics.mjs');
  const kernels = await import('../src/space/render/webgpu/kernels.js');
  const { buildArithmeticRecords, createValidationRegistry, ARITHMETIC_RECORD_IDS, requiredStrata, MATRIX_PINS } = await import('../src/space/numerics/validation-records.js');
  const { effectiveParameters, escapeRadius, sliceIsEmpty } = await import('../src/space/numerics/parameters.js');
  const { derivativeUpdate } = await import('./reference/f32.js');
  const view = loadPinnedPointStrata();
  const tol = view.tolerances, strata = view.strata;
  report.push({ name: 'Matrix pins and loaded point shards (partial view; not whole-matrix qualification)', complete: view.complete, pins: MATRIX_PINS, shards: view.shards, strata: strata.length });

  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.operation });
  await idleWithin(page);
  const setup = await ev(page, numericsSetupInPage, undefined, 'numerics setup', LIMITS.deep);
  assert.deepEqual(setup.acquired.requestedLimits, {}, 'no blanket requiredLimits');
  assert.deepEqual(setup.prepared.preparedPipelineIds, kernels.fieldPipelineDescriptors().map(d => d.pipelineId));
  assert.deepEqual(setup.implementationHashes, kernels.implementationHashes(), 'the served kernel metadata is the checkout\'s');
  report.push({ name: 'Field kernels prepared (recorded)', ...setup });

  const decode = (run, batches) => {
    assert.equal(run.read.outcome, 'completed', `readback ${JSON.stringify(run.read)}`);
    const bytes = new Uint8Array(Buffer.from(run.base64, 'base64'));
    return batches.map((batch, i) => {
      const span = run.spans[i], slice = bytes.subarray(span.first * kernels.POINT_RESULT_BYTES, (span.first + span.count) * kernels.POINT_RESULT_BYTES);
      return kernels.decodePointResults(slice, span.count, batch.modelId ?? 'mandelbulb');
    });
  };
  const runs = {}, results = new Map();
  const strataOf = kind => strata.filter(row => row.kind === kind);
  for (const kind of ['bulb-origin', 'bulb-polar', 'bulb-generic', 'quaternion-generic', 'quaternion-boundary']) {
    const rows = strataOf(kind), quaternion = kind.startsWith('quaternion');
    const batches = rows.map(row => ({ modelId: quaternion ? 'quaternion-julia' : 'mandelbulb', cap: row.parameters.cap,
      effective: quaternion ? { C: row.parameters.C, kappa: row.parameters.kappa } : { power: row.parameters.power }, points: row.cases.map(c => c.inputs.effective) }));
    const run = await ev(page, pointsInPage, { label: kind, pitch: NUMERICS_PITCH[kind], batches }, `points ${kind}`, LIMITS.deep);
    const { base64, ...summary } = run; runs[kind] = summary;
    assert.deepEqual(run.outcomes, { completed: rows.length }, `${kind}: every batch completes ${JSON.stringify(run.failures)}`);
    decode(run, batches).forEach((decoded, i) => results.set(rows[i].id, { row: rows[i], decoded }));
  }

  // Adversarial: the GPU evaluates every dispatchable case; the invalid inputs are refused by
  // admission and, written raw, are reported numerical failure by the kernels' own guards.
  const adversarial = strataOf('adversarial-point')[0];
  const dispatchable = adversarial.cases.filter(c => c.inputs.model && !c.inputs.interpretation);
  const advBatches = dispatchable.map(c => c.inputs.model === 'mandelbulb'
    ? { modelId: 'mandelbulb', effective: { power: c.inputs.power }, cap: c.inputs.cap, points: [c.inputs.p.map(Math.fround)] }
    : { modelId: 'quaternion-julia', effective: { C: c.inputs.C.map(Math.fround), kappa: Math.fround(c.inputs.q0[3]) }, cap: c.inputs.cap, points: [c.inputs.q0.slice(0, 3).map(Math.fround)] });
  const advRun = await ev(page, pointsInPage, { label: 'adversarial', pitch: 1, batches: advBatches }, 'points adversarial', LIMITS.deep);
  assert.deepEqual(advRun.outcomes, { completed: advBatches.length });
  const advDecoded = new Map(decode(advRun, advBatches).map((decoded, i) => [dispatchable[i].id, decoded[0]]));
  const invalid = adversarial.cases.filter(c => c.inputs.interpretation);
  const admissions = await ev(page, invalidAdmissionInPage, invalid, 'invalid admission');
  const guardModels = {
    'invalid-bulb-coordinate': { modelId: 'mandelbulb', rawModel: { ...kernels.admitPointModel('mandelbulb', { power: 8 }, 128) }, points: [[Number.NaN, 0, 0]] },
    'invalid-quaternion-coordinate': { modelId: 'quaternion-julia', rawModel: { ...kernels.admitPointModel('quaternion-julia', { C: [0, 0, 0, 0], kappa: 0 }, 128) }, points: [[Number.POSITIVE_INFINITY, 0, 0]] },
    'invalid-bulb-power': { modelId: 'mandelbulb', rawModel: { ...kernels.admitPointModel('mandelbulb', { power: 8 }, 128), power: 9 }, points: [[Math.fround(0.1), 0, 0]] },
    'invalid-iteration-budget': { modelId: 'mandelbulb', rawModel: { ...kernels.admitPointModel('mandelbulb', { power: 8 }, 128), cap: 0 }, points: [[Math.fround(0.1), 0, 0]] },
    'raw C component 4.5 (beyond the supported box)': { modelId: 'quaternion-julia', rawModel: { ...kernels.admitPointModel('quaternion-julia', { C: [0, 0, 0, 0], kappa: 0 }, 128), C: [4.5, 0, 0, 0] }, points: [[0, 0, 0]] },
  };
  // NaN and Infinity do not survive JSON: the raw points are rebuilt in the page from tokens.
  const guardBatches = Object.values(guardModels).map(({ modelId, rawModel, points }) => ({ modelId, rawModel, points: points.map(p => p.map(v => (Number.isFinite(v) ? v : String(v)))) }));
  const guardRun = await ev(page, pointsInPage, { label: 'guards', pitch: 1, batches: guardBatches, raw: true }, 'raw guard points', LIMITS.deep);
  assert.deepEqual(guardRun.outcomes, { completed: guardBatches.length });
  const guardDecoded = new Map(decode(guardRun, guardBatches).map((decoded, i) => [Object.keys(guardModels)[i], decoded[0]]));
  const advResults = adversarial.cases.map(c => {
    if (c.id === 'derivative-update-44') return null; // filled from the derivative probes below
    if (c.inputs.interpretation) {
      const refused = admissions[invalid.indexOf(c)], guarded = guardDecoded.get(c.id);
      const guardOk = c.id === 'invalid-quaternion-parameter' || guarded?.status === 'numerical failure';
      return { status: refused.admission === 'reject' && guardOk ? 'numerical failure' : 'escaped', admission: refused.admission, guard: guarded?.status ?? 'not applicable: binary32 rounds the requested decimal to 4' };
    }
    return advDecoded.get(c.id);
  });

  // Derivative probes: D' = 8D + 1 from the zero state for 1..128 updates, against B04's binary32 reference.
  const probeBatches = [{ modelId: 'mandelbulb', pipelineId: kernels.DERIVATIVE_PIPELINE_ID, rawModel: { ...kernels.admitPointModel('mandelbulb', { power: 8 }, 128) },
    points: Array.from({ length: 128 }, (_, n) => ({ grow: 8, add: 1, updates: n + 1 })) }];
  const probeRun = await ev(page, pointsInPage, { label: 'derivative', pitch: 128, batches: probeBatches }, 'derivative probes', LIMITS.deep);
  assert.deepEqual(probeRun.outcomes, { completed: 1 });
  const probes = decode(probeRun, probeBatches)[0];
  advResults[adversarial.cases.findIndex(c => c.id === 'derivative-update-44')] = probes[43];
  results.set(adversarial.id, { row: adversarial, decoded: advResults });

  // Bulb power-map probes (B08 fix round 1): two updates from z0 = 0 give z2 = P_p(c) + c, compared
  // with binary64 references: identity against the spec formula (atan2 angles) under the component
  // tolerance; polar axis exact; normalization against the scaled complex-power form (|x|, |y| down to 2^-100, where x² + y² underflows in binary32;
  // the mapped transverse values stay above 2^-126, below which WGSL may flush to zero):
  // relative 10^-4 with no absolute floor, so the transverse components are actually tested.
  const { bulbMapTrig, bulbMapComplex } = await import('./support/space-numerics.mjs');
  const mapReference = (c, p, kind) => (kind === 'identity' ? bulbMapTrig : bulbMapComplex)(c, p).map((v, k) => v + c[k]);
  const grid = Array.from({ length: 7 }, (_, i) => Math.fround(-0.9 + 1.8 * (i + 0.5) / 7));
  const mapProbes = {
    identity: grid.flatMap(x => grid.flatMap(y => grid.map(z => [x, y, z]))).filter(([x, y]) => x !== 0 || y !== 0),
    axis: [[0, 0, 0.5], [0, 0, -0.5], [0, 0, 1], [0, 0, -1], [0, 0, 0.25]],
    normalization: [[2 ** -80, 2 ** -80, 0.5], [2 ** -80, -(2 ** -80), -0.5], [-(2 ** -100), 0, 0.75], [0, 2 ** -100, 0.25], [2 ** -70, 2 ** -71, 0.5], [-(2 ** -90), -(2 ** -90), -0.75]],
  };
  const mapBatches = [];
  for (let power = 2; power <= 8; power++) for (const [kind, points] of Object.entries(mapProbes)) mapBatches.push({ kind, power, modelId: 'mandelbulb', effective: { power }, cap: 2, points });
  const mapRun = await ev(page, pointsInPage, { label: 'power-map', pitch: 256, batches: mapBatches.map(({ kind, power, ...batch }) => batch) }, 'bulb power-map probes', LIMITS.deep);
  assert.deepEqual(mapRun.outcomes, { completed: mapBatches.length });
  const mapDecoded = decode(mapRun, mapBatches);

  // Menger applicability probes (fix round 2): a shared seam whose touching boxes cover all eight
  // orthants is union interior (codex-B08-consult2-findings.md); faces, strict interiors and exterior
  // points keep their classes; exterior distances against B04's mengerDistance (analytic tolerance).
  const { mengerDistance } = await import('./reference/menger.js');
  const third = Math.fround(1 / 3), twoThirds = Math.fround(2 / 3);
  const mengerProbes = [
    { depth: 1, c: [-twoThirds, -twoThirds, -third], expected: 'interior' }, { depth: 1, c: [-twoThirds, -third, -twoThirds], expected: 'interior' },
    { depth: 1, c: [Math.fround(0.8), Math.fround(0.8), Math.fround(0.8)], expected: 'interior' }, { depth: 1, c: [1, Math.fround(0.9), Math.fround(0.9)], expected: 'boundary' },
    { depth: 1, c: [1.5, 0, 0], expected: 'exterior' }, { depth: 1, c: [0, 0, 0], expected: 'exterior' }, { depth: 2, c: [Math.fround(-7 / 9), Math.fround(-8 / 9), Math.fround(-8 / 9)], expected: 'interior' },
    { depth: 2, c: [0, 0, 0], expected: 'exterior' },
  ];
  const mengerBatches = mengerProbes.map(({ depth, c }) => ({ modelId: 'menger', effective: { depth }, cap: 1, points: [c] }));
  const mengerRun = await ev(page, pointsInPage, { label: 'menger', pitch: 1, batches: mengerBatches }, 'menger probes', LIMITS.deep);
  assert.deepEqual(mengerRun.outcomes, { completed: mengerBatches.length });
  const mengerDecoded = decode(mengerRun, mengerBatches).map(d => d[0]);

  // Per-stratum qualification table.
  const table = [];
  for (const row of strata) {
    const entry = results.get(row.id);
    const comparison = comparePointStratum(row, entry?.decoded, tol);
    const p = row.parameters ?? {};
    table.push({ ...comparison, model: row.kind.startsWith('bulb') ? 'mandelbulb' : row.kind === 'adversarial-point' ? 'mixed' : 'quaternion-julia', power: p.power, C: p.C, kappa: p.kappa, cap: p.cap });
  }
  report.push({ name: 'Per-stratum point qualification (recorded; joins on matrixSha256 and stratum id)', matrixSha256: view.matrixSha256, runs: { ...runs, adversarial: (({ base64, ...x }) => x)(advRun) },
    rows: table.map(({ failures, ...row }) => ({ ...row, firstFailures: failures.slice(0, 3) })) });
  const failedChecks = [];
  const check = (name, fn) => { try { const details = fn(); pass(name, details); } catch (error) { failedChecks.push(name); report.push({ name: `FAILED ${name}`, error: String(error?.message ?? error).slice(0, 4000) }); console.log(`FAILED ${name}: ${String(error?.message).slice(0, 600)}`); } };
  const byState = rows => rows.reduce((acc, row) => ({ ...acc, [row.state]: (acc[row.state] ?? 0) + 1 }), {});
  const failing = rows => rows.filter(row => !row.passed).map(row => ({ id: row.id, state: row.state, failureCount: row.failureCount, numericalFailures: row.numericalFailures, first: row.failures.slice(0, 3), belowFloor: row.belowFloor }));

  check('Bulb power map: identity, polar axis and normalization (fix round 1; recorded, not a manifest pass)', () => {
    const worst = { identity: 0, normalization: 0 }, failures = [];
    mapBatches.forEach((batch, b) => batch.points.forEach((c, i) => {
      const actual = mapDecoded[b][i], expected = mapReference(c, batch.power, batch.kind);
      if (actual.status === 'numerical failure' || actual.status === 'missing') return failures.push({ kind: batch.kind, power: batch.power, c, status: actual.status });
      expected.forEach((v, k) => {
        const a = actual.value[k];
        if (batch.kind === 'axis') { if (a !== Math.fround(v)) failures.push({ kind: 'axis', power: batch.power, c, k, a, v }); return; }
        const allow = batch.kind === 'identity' ? Math.max(tol.component0.floor, tol.component0.value * Math.abs(v)) : tol.component0.value * Math.abs(v);
        const ratio = v === 0 ? (a === 0 ? 0 : Infinity) : Math.abs(a - v) / allow;
        worst[batch.kind] = Math.max(worst[batch.kind], ratio);
        if (!(ratio <= 1)) failures.push({ kind: batch.kind, power: batch.power, c, k, a, v, ratio });
      });
    }));
    assert.deepEqual(failures.slice(0, 8), [], `${failures.length} power-map failures`);
    return { probes: mapBatches.reduce((n, batch) => n + batch.points.length, 0), worst };
  });
  check('Menger applicability: union-interior seams, faces and exterior distances (fix round 2; recorded, not a manifest pass)', () => {
    const rows = mengerProbes.map((probe, i) => ({ ...probe, actual: mengerDecoded[i].applicability, distance: mengerDecoded[i].distance, reference: mengerDistance(probe.c, probe.depth).distance }));
    for (const row of rows) {
      assert.equal(row.actual, row.expected, `depth ${row.depth} ${JSON.stringify(row.c)}`);
      if (row.expected === 'exterior') assert.ok(Math.abs(row.distance - row.reference) <= Math.max(1e-6, 1e-3 * row.reference), `distance ${row.distance} vs ${row.reference}`);
      else assert.equal(row.distance, 0);
    }
    return { rows };
  });
  check(NUMERICS_PASSES[0], () => {
    const rows = table.filter(row => row.kind.startsWith('bulb'));
    assert.equal(rows.length, 7 * 4 * 3);
    assert.deepEqual(failing(rows), [], 'every bulb stratum passes');
    for (const row of rows.filter(r => r.kind === 'bulb-generic')) assert.ok(row.eligible.continuous >= (row.power === 7 ? 400 : 410), `${row.id} floor`);
    return { byState: byState(rows), worst: Object.fromEntries(['component0', 'component1', 'component2', 'logEscapeRadius', 'log2DE', 'log2Derivative'].map(q => [q, Math.max(0, ...rows.map(r => r.worst[q] ?? 0))])),
      eligible: rows.filter(r => r.kind === 'bulb-generic').map(r => [r.id, r.eligible.continuous]) };
  });
  check(NUMERICS_PASSES[1], () => {
    const rows = table.filter(row => row.kind.startsWith('quaternion'));
    assert.equal(rows.length, 168 + 672);
    assert.deepEqual(failing(rows), [], 'every quaternion stratum passes');
    // Boundary admission, bound and rejection assertions (B02 product admission and outward bound).
    const boundary = strataOf('quaternion-boundary'), bounds = { equal: 0, wider: 0 };
    for (const row of boundary) {
      const decimal = v => String(v);
      const admitted = effectiveParameters('quaternion-julia', { C: row.parameters.C.map(decimal), kappa: decimal(row.parameters.kappa) });
      assert.deepEqual(admitted.effective.C, row.parameters.C); assert.equal(admitted.effective.kappa, row.parameters.kappa);
      const { bound } = escapeRadius(row.parameters.C), raw = Math.max(2, (1 + Math.sqrt(1 + 4 * Math.hypot(...row.parameters.C))) / 2);
      assert.ok(bound >= raw && bound >= row.cases[0].expected.bound, `${row.id}: B02 bound ${bound} is outward of R(C) ${raw} and the reference ${row.cases[0].expected.bound}`);
      bounds[bound === row.cases[0].expected.bound ? 'equal' : 'wider']++;
      for (const c of row.cases) assert.equal(sliceIsEmpty(row.parameters.kappa, bound), c.expected.emptySlice, `${c.id} empty-slice predicate`);
      for (const rejection of row.rejectionCases) {
        const [field, index] = rejection.field.split('.');
        const requested = { C: ['0', '0', '0', '0'], kappa: '0' };
        if (field === 'C') requested.C[Number(index)] = rejection.requested; else requested.kappa = rejection.requested;
        assert.equal(rejection.expected, 'out-of-range');
        assert.throws(() => effectiveParameters('quaternion-julia', requested), /\[-4, 4\]/, `${row.id} ${rejection.field} rejects ${rejection.requested}`);
      }
    }
    return { byState: byState(rows), boundsVsReference: bounds, worst: Object.fromEntries(['component0', 'component1', 'component2', 'component3', 'logEscapeRadius', 'log2DE'].map(q => [q, Math.max(0, ...rows.map(r => r.worst[q] ?? 0))])) };
  });
  check(NUMERICS_PASSES[2], () => {
    const rows = table.filter(row => row.kind.startsWith('quaternion') && Math.abs(row.kappa) === 4);
    assert.equal(rows.length, 6 * 2 * 4 + 24 * 2 * 4);
    let cases = 0;
    for (const row of rows) {
      assert.equal(row.passed, true, `${row.id}: ${JSON.stringify(row.failures.slice(0, 3))}`);
      const { row: source, decoded } = results.get(row.id);
      assert.equal(kernels.admitPointModel('quaternion-julia', { C: source.parameters.C, kappa: source.parameters.kappa }, source.parameters.cap).emptySlice, true, `${row.id} is an empty slice`);
      for (const [i, c] of source.cases.entries()) {
        assert.equal(c.expected.emptySlice, true); assert.equal(decoded[i].status, 'escaped', c.id); assert.equal(decoded[i].escapeIndex, 0, `${c.id} escapes at initialization`);
        cases++;
      }
    }
    return { strata: rows.length, cases };
  });
  check(NUMERICS_PASSES[3], () => {
    const row = table.find(r => r.kind === 'adversarial-point');
    assert.equal(adversarial.cases.length, 20);
    assert.equal(row.passed, true, JSON.stringify(row.failures));
    return { cases: adversarial.cases.map((c, i) => ({ id: c.id, expected: c.expected.status ?? 'derivative', actual: advResults[i]?.status, admission: advResults[i]?.admission, guard: advResults[i]?.guard })), guards: Object.fromEntries([...guardDecoded].map(([k, v]) => [k, v.status])) };
  });
  check(NUMERICS_PASSES[4], () => {
    let reference = { zero: true, mantissa: 0, exponent: 0 }, bitExact = 0;
    const frozen = adversarial.cases.find(c => c.id === 'derivative-update-44').expected.derivative;
    for (let n = 1; n <= 128; n++) {
      reference = derivativeUpdate(reference, 8, 1, 'f32');
      const gpu = probes[n - 1].derivative;
      assert.equal(gpu.zero, false, `update ${n}`);
      assert.ok(gpu.mantissa >= 1 && gpu.mantissa < 2, `update ${n}: normalized mantissa ${gpu.mantissa}`);
      assert.equal(gpu.exponent, reference.exponent, `update ${n}: exponent`);
      assert.equal(gpu.mantissa, reference.mantissa, `update ${n}: exact binary32 state (fix round 2 ruling)`);
      if (n >= 44) assert.ok(gpu.exponent > 127, `update ${n} lies beyond the binary32 scalar range`);
      bitExact += Number(gpu.mantissa === reference.mantissa);
    }
    assert.deepEqual(probes[43].derivative, frozen, 'update 44 equals the frozen reference state');
    return { update44: probes[43].derivative, update128: probes[127].derivative, exactStates: bitExact, of: 128 };
  });
  check(NUMERICS_PASSES[5], () => {
    const { records, withheld } = buildArithmeticRecords({ results: table, implementationHashes: setup.implementationHashes });
    const registry = createValidationRegistry();
    for (const record of records) registry.register(record);
    const passedIds = new Set(table.filter(row => row.passed).map(row => row.id));
    for (const recordId of ARITHMETIC_RECORD_IDS) {
      const covered = requiredStrata(recordId).every(id => passedIds.has(id));
      assert.equal(records.some(r => r.recordId === recordId), covered, `${recordId} is registered iff all its mandatory strata passed`);
    }
    for (const record of registry.list()) {
      const effective = record.modelId === 'mandelbulb' ? { power: record.testedParameters.power[0] } : { C: record.testedParameters.C[0], kappa: record.testedParameters.kappa[0] };
      const query = { modelId: record.modelId, evidenceClass: 'arithmetic', implementationHashes: setup.implementationHashes, profile: 'surface-v1', effective, sampling: { maxIterations: 128 }, domain: record.testedDomain };
      assert.equal(registry.lookup(query)?.recordId, record.recordId);
      assert.equal(registry.lookup({ ...query, implementationHashes: { ...setup.implementationHashes, kernelVersion: 'other' } }), null, 'another kernel never matches');
    }
    return { registered: records.map(r => r.recordId), withheld: withheld.map(w => ({ recordId: w.recordId, failing: w.failing.slice(0, 10), failingCount: w.failing.length })), records };
  });

  const finish = await ev(page, numericsFinishInPage, undefined, 'numerics teardown');
  report.push({ name: 'Numerics teardown (recorded)', ...finish });
  assert.deepEqual(finish.uncaptured, [], `no uncaptured WebGPU errors: ${JSON.stringify(finish.uncaptured)}`);
  assert.deepEqual(failedChecks, [], `numerics checks failed: ${failedChecks.join('; ')}`);
}

// ---- the numerics-divergence diagnostic (B08 fix round 2; test-only, never gated) -----------------
// Runs the served fields.wgsl bulb_power_map through a test-only compute shader that records, per
// update, z_n, |z_n|, and the power map's normalization and complex-product intermediates, so the
// first GPU/CPU-f32 divergence can be attributed to an operation. No production code is involved
// beyond the served kernel source.
const DIVERGENCE_STEPS = 20;
async function divergenceInPage({ cases, intermediates, steps }) {
  const { acquireDevice } = await import('/src/space/render/webgpu/device.js');
  const { wgslConstants } = await import('/src/space/render/status.js');
  const fields = await (await fetch('/src/space/render/webgpu/shaders/fields.wgsl')).text();
  const { device } = await acquireDevice({ onLost: () => {} });
  const code = `${wgslConstants()}\n${fields}\n@group(0) @binding(2) var<storage, read> menger_boxes: array<MengerBox>;
@group(0) @binding(0) var<storage, read> input: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> out: array<vec4<f32>>;
@compute @workgroup_size(1) fn diag(@builtin(global_invocation_id) gid: vec3<u32>) {
  let c = input[gid.x].xyz; let p = u32(input[gid.x].w);
  var z = vec3<f32>(0.0);
  for (var n = 0u; n < ${steps}u; n++) {
    let r = length(z);
    let m = bulb_power_map(z, r, p);
    var a = vec4<f32>(0.0); var b = vec4<f32>(0.0); var wq = vec4<f32>(0.0);
    ${intermediates}
    let base = (gid.x * ${steps}u + n) * 5u;
    z = m.xyz + c;
    out[base] = vec4<f32>(z, length(z)); out[base + 1u] = vec4<f32>(r, a.x, a.y, a.z); out[base + 2u] = b; out[base + 3u] = wq; out[base + 4u] = m;
  }
}`;
  const module = device.createShaderModule({ code });
  const info = (await module.getCompilationInfo()).messages.filter(m => m.type === 'error').map(m => `${m.lineNum}: ${m.message}`);
  if (info.length) return { error: info };
  const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'diag' } });
  const input = device.createBuffer({ size: cases.length * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(input, 0, new Float32Array(cases.flatMap(({ c, p }) => [...c, p])));
  const bytes = cases.length * steps * 5 * 16;
  const out = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const read = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
  pass.setPipeline(pipeline); pass.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: input } }, { binding: 1, resource: { buffer: out } }] }));
  pass.dispatchWorkgroups(cases.length); pass.end();
  encoder.copyBufferToBuffer(out, 0, read, 0, bytes); device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const values = Array.from(new Float32Array(read.getMappedRange().slice(0)));
  read.unmap(); device.destroy();
  return { values };
}
// The intermediates replicate the kernel body under test (a: s, rho_s, rho; b: t, unit; wq: w, q).
export const DIVERGENCE_INTERMEDIATES = {
  'max-scaling': `let s = max(abs(z.x), abs(z.y)); if (s >= SMALLEST_NORMAL) { let t = vec2<f32>(z.x, z.y) / s; let rho_s = length(t); let rho = s * rho_s; let unit = t / rho_s;
    var w = vec2<f32>(1.0, 0.0); var q = vec2<f32>(1.0, 0.0); for (var k = 0u; k < p; k++) { w = complex_mul(w, vec2<f32>(z.z, rho)); q = complex_mul(q, unit); }
    a = vec4<f32>(s, rho_s, rho, 0.0); b = vec4<f32>(t, unit); wq = vec4<f32>(w, q); }`,
  'pow2-scaling': `let s = max(abs(z.x), abs(z.y)); if (s >= SMALLEST_NORMAL) { let e = frexp(s).exp; let t = ldexp(vec2<f32>(z.x, z.y), vec2<i32>(-e)); let h = length(t); let rho = ldexp(h, e); let unit = t / h;
    var w = vec2<f32>(1.0, 0.0); var q = vec2<f32>(1.0, 0.0); for (var k = 0u; k < p; k++) { w = complex_mul(w, vec2<f32>(z.z, rho)); q = complex_mul(q, unit); }
    a = vec4<f32>(s, h, rho, 0.0); b = vec4<f32>(t, unit); wq = vec4<f32>(w, q); }`,
};
async function runNumericsDivergence({ page }) {
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.operation });
  const { readFileSync } = await import('node:fs');
  const a = JSON.parse(readFileSync('tests/reference/space-matrix/bulb-generic.json', 'utf8'));
  const row = a.find(x => x.id === 'bulb/p4/n64/generic');
  const cases = [340, 364].map(i => ({ id: row.cases[i].id, c: row.cases[i].inputs.effective, p: 4 }));
  const variant = process.env.ATLAS_DIVERGENCE_VARIANT ?? 'max-scaling';
  const result = await ev(page, divergenceInPage, { cases, intermediates: DIVERGENCE_INTERMEDIATES[variant], steps: DIVERGENCE_STEPS }, 'divergence probe', LIMITS.deep);
  assert.ok(!result.error, JSON.stringify(result.error));
  report.push({ name: 'Bulb orbit divergence probe (diagnostic; test-only)', variant, cases: cases.map((c, k) => ({ ...c,
    steps: Array.from({ length: DIVERGENCE_STEPS }, (_, n) => { const o = (k * DIVERGENCE_STEPS + n) * 20, v = result.values.slice(o, o + 20);
      return { n: n + 1, z: v.slice(0, 3), norm: v[3], rIn: v[4], s: v[5], rhoS: v[6], rho: v[7], t: v.slice(8, 10), unit: v.slice(10, 12), w: v.slice(12, 14), q: v.slice(14, 16), map: v.slice(16, 19), rp1: v[19] }; }) })) });
  pass('Bulb orbit divergence probe recorded (diagnostic)');
}

// ---- the rendering group (plan B10: tracing, normals and picking against B04's ray strata, P2) -------
// Ray strata and anchors only (B08 owns the point strata). The ray shards load through the pinned index
// (index, logical matrix, generator and reference hashes pinned; each loaded shard's byte length, SHA-256
// and declared IDs verified by assembleMatrix) — a partial view, never whole-matrix qualification. Every
// batch runs through the production backend (B00 contract, B06 ABI): one admission lease per submission
// and readback. Camera strata (overview, ladders, usability, silhouette, normals) run the product
// trace_band/normals_band pipelines with each stratum's own anchored camera; B04's ray-list strata
// (analytic, adversarial) run the validation trace_rays entry, which shares the §11.4 loop. The pick runs
// through the B09 renderer's pick API and pass sequence. Comparisons are Node-side
// (tests/support/space-tracing.mjs) with the frozen tolerances, floors and eligibility rules.
export const RENDERING_PASSES = Object.freeze([
  'Analytic rays trace to the oracle depth with exact statuses',
  'The detail ladders record agreement or exceedance per distance under ladder-v1 as diagnostic evidence',
  'The 12 adversarial ray cases terminate with their expected status and subreason',
  'Every mandatory overview stratum passes under surface-v1',
  'Normals require distinct resolved samples and a finite nonzero gradient, and unavailable normals keep their depth',
  'The sphere silhouette equals the analytic disc except within one pixel of the edge',
  "The quaternion default view's termination distribution matches the independently predicted one within 5 points",
  "A pick returns the pinned sample's depth and reconstructs an anchored hit, and a stale pick is rejected",
  'Product camera classification agrees with the CPU at the resolved budget for every model family',
]);
// Test-only stand-ins for B11's shade/accumulate/display passes, so the B09 pass sequence can publish a
// frame for the pick check. They are injected through the backend's loadSource and never ship.
const RENDERING_FIXTURES = {
  'fixture-shade': `struct U { origin: vec2<u32>, size: vec2<u32> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var status_in: texture_2d<u32>;
@group(0) @binding(2) var normal_in: texture_2d<f32>;
@group(0) @binding(3) var color_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var lighting_out: texture_storage_2d<r32uint, write>;
@compute @workgroup_size(8, 8, 1)
fn shade_band(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = vec2<i32>(u.origin + gid.xy);
  let hit = (textureLoad(status_in, p, 0).x & 15u) == 0u;
  let n = textureLoad(normal_in, p, 0);
  textureStore(color_out, p, select(vec4<f32>(0.0, 0.0, 0.0, 1.0), vec4<f32>(n.xyz * 0.5 + 0.5, 1.0), hit));
  textureStore(lighting_out, p, vec4<u32>(0u, 0u, 0u, 1u));
}`,
  'fixture-accumulate': `struct U { origin: vec2<u32>, size: vec2<u32> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var color_in: texture_2d<f32>;
@group(0) @binding(2) var next_out: texture_storage_2d<rgba32float, write>;
@compute @workgroup_size(8, 8, 1)
fn accumulate_band(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = vec2<i32>(u.origin + gid.xy);
  textureStore(next_out, p, textureLoad(color_in, p, 0));
}`,
  'fixture-display': `struct U { origin: vec2<u32>, size: vec2<u32> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var accumulation_in: texture_2d<f32>;
@group(0) @binding(2) var display_out: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(8, 8, 1)
fn display_band(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = vec2<i32>(u.origin + gid.xy);
  textureStore(display_out, p, vec4<f32>(textureLoad(accumulation_in, p, 0).xyz, 1.0));
}`,
};
const SURFACE_V1 = Object.freeze({ maxIterations: 128, maxSteps: 512, stepMultiplier: 0.9, toleranceFloor: 1e-6, toleranceFactor: 0.5 });
const LADDER_V1 = Object.freeze({ maxIterations: 128, maxSteps: 512, stepMultiplier: 0.9, toleranceFloor: 0, toleranceFactor: 0.005 });

async function renderingSetupInPage({ fixtures }) {
  const { createWebGPUBackend } = await import('/src/space/render/webgpu/backend.js');
  const { loadShaderSource } = await import('/src/space/render/webgpu/shaders.js');
  const passes = await import('/src/space/render/webgpu/passes.js');
  const kernels = await import('/src/space/render/webgpu/kernels.js');
  const contract = await import('/src/space/render/backend.js');
  const canvas = document.createElement('canvas');
  canvas.id = 'space-b10-canvas';
  canvas.style.cssText = 'position:fixed;right:0;bottom:0;width:16px;height:9px;z-index:2147483647;pointer-events:none';
  document.body.append(canvas);
  const loadSource = id => (Object.hasOwn(fixtures, id) ? Promise.resolve(fixtures[id]) : loadShaderSource(id));
  const backend = createWebGPUBackend({ canvas, clock: performance, loadSource });
  const acquired = await backend.acquire();
  const events = [], started = performance.now();
  const product = await backend.prepare({ epoch: acquired.epoch, pipelineSet: passes.tracePipelineSet(), onProgress: event => events.push(event) });
  const preparationMs = performance.now() - started;
  const validation = await backend.prepare({ epoch: acquired.epoch, pipelineSet: passes.validationPipelineSet() });
  const boxes = {};
  for (const depth of [1, 2]) { const data = kernels.mengerBoxData(depth); boxes[depth] = backend.allocate({ name: `menger-boxes-${depth}`, bytes: data.byteLength, usage: 'storage', data }); }
  const targets = new Map();
  const s = { backend, passes, contract, canvas, boxes, targets,
    identity: jobId => ({ requestId: `request-${jobId}`, jobId, viewId: 'space-rendering', generation: { deviceEpoch: backend.currentEpoch(), viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 } }),
    lease: jobId => ({ admission: contract.createAdmission({ epoch: backend.currentEpoch(), jobId }) }),
    async targetsFor(size) {
      const key = `${size.width}x${size.height}`;
      if (!targets.has(key)) targets.set(key, await backend.configureTargets({ epoch: backend.currentEpoch(), layoutId: contract.TARGET_LAYOUT_ID, internalSize: size, outputSize: size }));
      return targets.get(key);
    },
    base64(bytes) { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); },
    // One bounded readback per ≤ 256 rows, one lease each; row padding is stripped by the backend.
    async read(handle, region, field, jobId) {
      const parts = [];
      for (let y = region.y; y < region.y + region.height; y += 256) {
        const chunk = { x: region.x, y, width: region.width, height: Math.min(256, region.y + region.height - y) };
        const ticket = backend.readback({ identity: s.identity(jobId), source: handle, region: chunk, fields: [field] }, s.lease(jobId));
        const done = await ticket.done;
        if (done.outcome !== 'completed') throw new Error(`readback ${field}: ${done.outcome} ${done.reason}`);
        parts.push((await ticket.result).data);
      }
      const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
      let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; }
      return out;
    },
  };
  globalThis.__b10 = s;
  return { acquired: { epoch: acquired.epoch, requestedLimits: acquired.requestedLimits, limits: acquired.limits, canvasFormat: acquired.canvasFormat },
    product, validation, preparationMs, events, implementationHashes: passes.tracingImplementationHashes(), tracingVersion: passes.TRACING_VERSION, bindings: passes.TRACING_BINDINGS };
}

// B11b one-sided stencil probes: fixture-place puts every pixel's hit at parameter t, then the product normals_band
// of the family runs with a test-only normals profile (its ε) and the normals are read back.
async function stencilProbeInPage(spec) {
  const s = globalThis.__b10, { backend, passes } = s, jobId = `b11b-stencil-${spec.label}`, size = spec.size, region = { x: 0, y: 0, ...size };
  if (!globalThis.__b11bPlace) {
    const { createPipelineSet } = await import('/src/space/render/backend.js');
    const b = (slot, type, access) => ({ slot, type, access });
    globalThis.__b11bPlace = await backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: createPipelineSet({ id: 'b11b-place', descriptors: [{ pipelineId: 'fixture-place', kind: 'compute', sourceIds: ['fixture-place'], entryPoint: 'place', constants: {},
      bindings: [b('u', 'uniform-buffer', 'read'), b('depth', 'storage-texture', 'write'), b('status', 'storage-texture', 'write')],
      uniformLayout: { byteLength: 32, fields: [{ name: 'origin', type: 'vec2<u32>', offset: 0 }, { name: 'size', type: 'vec2<u32>', offset: 8 }, { name: 't', type: 'f32', offset: 16 }] } }] }) });
  }
  const targets = await s.targetsFor(size), h = targets.handles, menger = spec.modelId === 'menger' ? { menger_boxes: s.boxes[spec.effective.depth] } : {};
  const zero = { raySteps: 0, iterations: 0, normalFieldSamples: 0, shadowRays: 0, shadowSteps: 0, aoSamples: 0 }, out = [];
  for (const t of spec.depths) {
    const placed = await backend.submitBatch({ identity: s.identity(jobId), pipelineId: 'fixture-place', pass: 'probe', region, sample: { sequence: 'atlas-aa-v1', seed: 0, index: 0 },
      bounds: { pixels: size.width * size.height, ...zero }, inputs: {}, outputs: { depth: h.depth, status: h.status }, uniforms: { origin: [0, 0], size: [size.width, size.height], t } }, s.lease(jobId)).done;
    if (placed.outcome !== 'completed') throw new Error(`place: ${placed.outcome} ${placed.reason}`);
    const done = await backend.submitBatch({ identity: s.identity(jobId), pipelineId: `normals_band:${spec.modelId}`, pass: 'normals', region, sample: { sequence: 'atlas-aa-v1', seed: 0, index: 0 },
      bounds: passes.traceBounds(region, spec.profile, 'normals'), inputs: { depth: h.depth, status: h.status, ...menger }, outputs: { normal: h.normal },
      uniforms: passes.normalsUniforms({ modelId: spec.modelId, camera: spec.camera, effective: spec.effective, region, internalSize: size, sampling: { seed: 0, sampleIndex: 0 }, profile: spec.profile }) }, s.lease(jobId)).done;
    if (done.outcome !== 'completed') throw new Error(`normals: ${done.outcome} ${done.reason}`);
    out.push({ t, normal: s.base64(await s.read(h.normal, region, 'normal', jobId)), depth: s.base64(await s.read(h.depth, region, 'depth', jobId)) });
  }
  return out;
}

// trace_band over `region` in bands of ≤ 32768 pixels (one lease each), then optionally normals_band
// with its own profile; reads depth and status before and after normals, and the normals.
async function traceFrameInPage(spec) {
  const s = globalThis.__b10, { backend, passes } = s, jobId = `rendering-${spec.label}`;
  const targets = await s.targetsFor(spec.internalSize), handles = targets.handles, region = spec.region;
  const menger = spec.modelId === 'menger' ? { menger_boxes: s.boxes[spec.effective.depth] } : {};
  const rows = Math.max(1, Math.floor(32768 / region.width)), bands = [];
  for (let y = region.y; y < region.y + region.height; y += rows) bands.push({ x: region.x, y, width: region.width, height: Math.min(rows, region.y + region.height - y) });
  const submit = (pass, pipelineId, profile, inputs, outputs) => Promise.all(bands.map(band => backend.submitBatch({ identity: s.identity(jobId), pipelineId, pass, region: band,
    sample: { sequence: 'atlas-aa-v1', seed: spec.sampling.seed, index: spec.sampling.sampleIndex }, bounds: passes.traceBounds(band, profile, pass), inputs, outputs,
    uniforms: passes.traceUniforms({ modelId: spec.modelId, camera: spec.camera, effective: spec.effective, region: band, internalSize: spec.internalSize, sampling: spec.sampling, profile }) }, s.lease(jobId)).done));
  const tally = list => list.reduce((acc, done) => ({ ...acc, [done.outcome]: (acc[done.outcome] ?? 0) + 1 }), {});
  const started = performance.now();
  const traced = await submit('trace', spec.traceId ?? `trace_band:${spec.modelId}`, spec.profile, { ...menger }, { depth: handles.depth, status: handles.status, recovery: handles.recovery });
  const out = { bands: bands.length, trace: tally(traced), traceFailures: traced.filter(d => d.outcome !== 'completed').slice(0, 3).map(d => d.reason) };
  out.depth = s.base64(await s.read(handles.depth, region, 'depth', jobId));
  out.status = s.base64(await s.read(handles.status, region, 'status', jobId));
  out.recovery = s.base64(await s.read(handles.recovery, region, 'recovery', jobId)); // B11c
  if (spec.normals) {
    const normalsDone = await submit('normals', spec.normalsId ?? `normals_band:${spec.modelId}`, spec.normalsProfile ?? spec.profile,
      { depth: handles.depth, status: handles.status, ...menger }, { normal: handles.normal });
    out.normals = tally(normalsDone);
    out.normal = s.base64(await s.read(handles.normal, region, 'normal', jobId));
    out.depthAfter = s.base64(await s.read(handles.depth, region, 'depth', jobId));
    out.statusAfter = s.base64(await s.read(handles.status, region, 'status', jobId));
  }
  out.wallMs = performance.now() - started;
  return out;
}

// Validation ray lists: one rays buffer and one sentinel-filled results buffer per batch (one lease per
// submission and readback), the validation trace_rays pipeline of the batch's field.
async function traceRaysInPage({ label, batches }) {
  const s = globalThis.__b10, { backend, passes } = s, jobId = `rendering-rays-${label}`, out = [];
  for (const batch of batches) {
    const data = passes.encodeRays(batch.rays), count = batch.rays.length;
    const rays = backend.allocate({ name: `rays:${label}`, bytes: data.byteLength, usage: 'storage', data });
    const results = backend.allocate({ name: `ray-results:${label}`, bytes: count * passes.TRACE_RESULT_BYTES, usage: 'storage', data: new Uint8Array(count * passes.TRACE_RESULT_BYTES).fill(0xff) });
    const region = { x: 0, y: 0, width: batch.uniforms.size[0], height: batch.uniforms.size[1] };
    const inputs = { rays, results, ...(batch.modelId === 'menger' ? { menger_boxes: s.boxes[batch.depth] } : {}) };
    const done = await backend.submitBatch({ identity: s.identity(jobId), pipelineId: `trace-rays:${batch.modelId}`, pass: 'probe', region,
      sample: { sequence: 'atlas-aa-v1', seed: 0, index: 0 }, bounds: passes.traceBounds(region, batch.uniforms), inputs, outputs: { results }, uniforms: batch.uniforms }, s.lease(jobId)).done;
    let bytes = null;
    if (done.outcome === 'completed') bytes = await s.read(results, { x: 0, y: 0, width: count * passes.TRACE_RESULT_BYTES, height: 1 }, 'results', jobId);
    backend.release(rays); backend.release(results);
    out.push({ outcome: done.outcome, reason: done.reason, base64: bytes ? s.base64(bytes) : null });
  }
  return out;
}

// The B09 renderer on the same backend: probe/present (B06), the product trace and normals pipelines,
// and the shade/accumulate/display stand-ins. Sphere scene, draft profile; picks through renderer.pick.
async function pickInPage() {
  const s = globalThis.__b10, { backend, passes } = s;
  const { createSpaceRenderer } = await import('/src/space/render/renderer.js');
  const { createSpaceScene } = await import('/src/space/scene-adapter.js');
  const { createSpaceRequest } = await import('/src/space/render-adapter.js');
  const { createPipelineSet } = await import('/src/space/render/backend.js');
  const { SELF_CHECK_PIPELINE_SET } = await import('/src/space/render/webgpu/pipelines.js');
  const { KERNEL_VERSION } = await import('/src/space/render/webgpu/kernels.js');
  const layout = { byteLength: 16, fields: [{ name: 'origin', type: 'vec2<u32>', offset: 0 }, { name: 'size', type: 'vec2<u32>', offset: 8 }] };
  const read = slot => ({ slot, type: 'texture', access: 'read' }), write = slot => ({ slot, type: 'storage-texture', access: 'write' });
  const fixture = (id, entryPoint, bindings) => ({ pipelineId: id, kind: 'compute', sourceIds: [id], entryPoint, constants: {}, bindings: [{ slot: 'u', type: 'uniform-buffer', access: 'read' }, ...bindings], uniformLayout: layout });
  const pipelineSet = createPipelineSet({ id: 'b10-pick', descriptors: [...SELF_CHECK_PIPELINE_SET.descriptors.filter(d => ['probe', 'present'].includes(d.pipelineId)),
    ...passes.tracePipelineDescriptors().filter(d => !d.pipelineId.endsWith(':menger')),
    fixture('fixture-shade', 'shade_band', [read('status'), read('normal'), write('sampleColor'), write('lightingStatus')]),
    fixture('fixture-accumulate', 'accumulate_band', [read('sampleColor'), write('next')]), fixture('fixture-display', 'display_band', [read('accumulation'), write('display')])] });
  const versions = { kernelVersion: KERNEL_VERSION, tracingVersion: passes.TRACING_VERSION }, viewId = 'space-b10-pick';
  const renderer = createSpaceRenderer({ backend, clock: () => performance.now(), viewId, versions, pipelineSet });
  const publications = [], reports = [];
  renderer.onPublish(p => publications.push({ requestId: p.requestId, kind: p.kind, rayTermination: p.rayTermination }));
  renderer.onReport(r => reports.push({ requestId: r.requestId, outcome: r.outcome, reason: r.reason }));
  await renderer.prepare();
  const scene = createSpaceScene({ model: 'sphere' });
  const make = n => createSpaceRequest({ scene, purpose: 'interactive', width: 128, height: 72, profile: 'draft',
    generation: { deviceEpoch: backend.currentEpoch(), viewRevision: n, geometryRevision: n, appearanceRevision: n }, viewId, versions });
  const idOf = r => ({ requestId: r.requestId, jobId: r.jobId, viewId: r.viewId, generation: { ...r.generation } });
  const first = make(1), firstDone = await renderer.render(first).done, size = { ...first.quality.internalSize };
  const pick = (request, patch = {}) => renderer.pick({ identity: idOf(request), pixel: [32, 18], dimensions: { ...size }, geometryRevision: request.generation.geometryRevision, sampleIndex: 0, ...patch });
  const fresh = await pick(first), corner = await pick(first, { pixel: [0, 0] });
  const stale = {
    request: await pick(first, { identity: { ...idOf(first), requestId: 'request-not-published' } }),
    epoch: await pick(first, { identity: { ...idOf(first), generation: { ...first.generation, deviceEpoch: first.generation.deviceEpoch + 1 } } }),
    geometryRevision: await pick(first, { identity: { ...idOf(first), generation: { ...first.generation, geometryRevision: 2 } }, geometryRevision: 2 }),
    dimensions: await pick(first, { dimensions: { width: size.width + 1, height: size.height } }),
    sample: await pick(first, { sampleIndex: 1 }),
  };
  const second = make(2), secondDone = await renderer.render(second).done;
  stale.superseded = await pick(first);
  const current = await pick(second);
  renderer.destroy();
  const strip = done => ({ outcome: done.outcome, reason: done.reason ?? null });
  return { first: strip(firstDone), second: strip(secondDone), size, camera: scene.camera, fresh, corner, stale, current, publications, reports };
}

// B09c: the complete product set and real backend, with no synthetic point results.
// CPU expectations are evaluated in Node at the same effective point and resolved cap.
async function classifyCamerasInPage(cases) {
  const { backend } = globalThis.__b10;
  const { createSpaceRenderer } = await import('/src/space/render/renderer.js');
  const { productPipelineSet } = await import('/src/space/render/webgpu/appearance.js');
  const { createSpaceRequest } = await import('/src/space/render-adapter.js');
  const { KERNEL_VERSION } = await import('/src/space/render/webgpu/kernels.js');
  const { TRACING_VERSION } = await import('/src/space/render/webgpu/passes.js');
  const points = [], rows = [], viewId = 'space-b09c-classification';
  const proxy = { ...backend, submitBatch(batch, options) {
    if (batch.pipelineId.startsWith('points-')) points.push({ pipelineId: batch.pipelineId,
      cap: batch.uniforms.cap, iterations: batch.bounds.iterations });
    return backend.submitBatch(batch, options);
  } };
  const renderer = createSpaceRenderer({ backend: proxy, clock: () => performance.now(), viewId,
    versions: { kernelVersion: KERNEL_VERSION, tracingVersion: TRACING_VERSION }, pipelineSet: productPipelineSet() });
  try {
    await renderer.prepare();
    for (const [index, spec] of cases.entries()) {
      const revision = index + 1;
      const request = createSpaceRequest({ scene: spec.scene, purpose: 'interactive', width: 32, height: 18, profile: spec.profile,
        generation: { deviceEpoch: backend.currentEpoch(), viewRevision: revision, geometryRevision: revision, appearanceRevision: revision },
        viewId, versions: { kernelVersion: KERNEL_VERSION, tracingVersion: TRACING_VERSION } });
      const done = await renderer.render(request).done, first = points.length;
      const result = await renderer.classifyEffectiveCamera(request);
      rows.push({ label: spec.label, render: done.outcome, renderReason: done.reason ?? null,
        cap: request.quality.iteration.maxIterations, result, submissions: points.slice(first) });
    }
  } finally { renderer.destroy(); }
  return rows;
}

async function renderingFinishInPage() {
  const s = globalThis.__b10, { backend } = s;
  for (const set of s.targets.values()) for (const handle of Object.values(set.handles).flat()) backend.release(handle);
  for (const handle of Object.values(s.boxes)) backend.release(handle);
  await new Promise(resolve => setTimeout(resolve, 0));
  const uncaptured = backend.testAdapter?.uncapturedErrors?.() ?? [];
  backend.destroy();
  const final = backend.diagnostics();
  s.canvas.remove();
  return { uncaptured, final: { state: final.state, epoch: final.epoch, tracked: final.tracked } };
}

// ---- B11 in the rendering group (plan B11: shading, accumulation, display and the complete product set) ----
// Every batch runs through the production backend (one admission lease per submission and readback). The
// product shade, diagnostic, accumulate and display pipelines execute; three test-only fixtures (injected
// through loadSource, never shipped) write synthetic geometry, poison targets and capture presented images.
export const APPEARANCE_PASSES = Object.freeze([
  'A settled image accumulates eight jittered samples and the result is bit-identical across completion orders',
  'Shadowed samples never enter a direct-light accumulation and the first settled direct-light image precedes full quality',
  'Diagnostic modes show the legend colours exactly for the status words',
  'Secondary-ray failures remain visibly diagnostic and are counted',
  'Diagnostic outcomes survive accumulation',
  'The complete product pipeline set prewarms within the bound and its preparation time is recorded',
  'sample 0 after an appearance reset on poisoned accumulation and flag targets equals a fresh allocation, for subdivided regions and the following samples',
]);
// The synthetic geometry classes of fixture-pattern (4-pixel columns): appearance tests predict each pixel's
// per-sample status word, normal availability and therefore its accumulated flags on the CPU.
export const PATTERN_CLASSES = Object.freeze(['hit', 'miss', 'point-budget', 'estimate-unavailable', 'interior', 'ray-step-budget', 'stagnation-ray',
  'stagnation-field', 'numerical-failure', 'unavailable-normal', 'unresolved-in-one-sample', 'numerical-in-one-sample', 'unavailable-normal-in-one-sample']);
const APPEARANCE_FIXTURES = {
  'fixture-pattern': `struct U { origin: vec2<u32>, size: vec2<u32>, sample_index: u32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var depth_out: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var status_out: texture_storage_2d<r32uint, write>;
@group(0) @binding(3) var normal_out: texture_storage_2d<rgba16float, write>;
fn word(status: u32, reason: u32, subreason: u32, steps: u32) -> u32 { return status | (reason << 4u) | (subreason << 8u) | (steps << 12u); }
@compute @workgroup_size(8, 8, 1)
fn pattern(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = u.origin + gid.xy;
  let kind = (p.x / 4u) % 13u;
  let steps = (p.x * 7u + p.y * 3u) % 512u;
  let mine = (p.y % 8u) == u.sample_index;
  var w = word(0u, 0u, 0u, steps);
  var n = vec4<f32>(0.0, 0.6, 0.8, 1.0);
  let none = vec4<f32>(0.0);
  switch kind {
    case 1u: { w = word(1u, 0u, 0u, steps); n = none; }
    case 2u: { w = word(2u, 1u, 0u, steps); n = none; }
    case 3u: { w = word(2u, 2u, 0u, steps); n = none; }
    case 4u: { w = word(2u, 2u, 1u, steps); n = none; }
    case 5u: { w = word(2u, 3u, 0u, steps); n = none; }
    case 6u: { w = word(2u, 4u, 1u, steps); n = none; }
    case 7u: { w = word(2u, 4u, 2u, steps); n = none; }
    case 8u: { w = word(3u, 0u, 0u, steps); n = none; }
    case 9u: { n = none; }
    case 10u: { if (mine) { w = word(2u, 3u, 0u, steps); n = none; } }
    case 11u: { if (mine) { w = word(3u, 0u, 0u, steps); n = none; } }
    case 12u: { if (mine) { n = none; } }
    default: {}
  }
  textureStore(depth_out, vec2<i32>(p), vec4<f32>(1.5 - 0.01 * f32(kind), 0.0, 0.0, 1.0));
  textureStore(status_out, vec2<i32>(p), vec4<u32>(w, 0u, 0u, 1u));
  textureStore(normal_out, vec2<i32>(p), n);
}`,
  'fixture-poison': `struct U { origin: vec2<u32>, size: vec2<u32> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var acc0: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var acc1: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var flags_out: texture_storage_2d<r32uint, write>;
@compute @workgroup_size(8, 8, 1)
fn poison(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = vec2<i32>(u.origin + gid.xy);
  textureStore(acc0, p, vec4<f32>(1.0e30, -7.0, 3.0e38, 1.0e6));
  textureStore(acc1, p, vec4<f32>(-1.0e30, 9.0, 1.0e-30, 5.0));
  textureStore(flags_out, p, vec4<u32>(0xffffffffu, 0u, 0u, 1u));
}`,
  // B11b: every pixel an approximate hit at the uniform ray parameter t, so normals_band evaluates its stencil at
  // chosen positions (the one-sided fallback probes).
  'fixture-place': `struct U { origin: vec2<u32>, size: vec2<u32>, t: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var depth_out: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var status_out: texture_storage_2d<r32uint, write>;
@compute @workgroup_size(8, 8, 1)
fn place(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = vec2<i32>(u.origin + gid.xy);
  textureStore(depth_out, p, vec4<f32>(u.t, 0.0, 0.0, 1.0));
  textureStore(status_out, p, vec4<u32>(0u, 0u, 0u, 1u));
}`,
  'fixture-capture': `struct U { origin: vec2<u32>, size: vec2<u32>, base: u32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var display_in: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> captured: array<u32>;
@compute @workgroup_size(8, 8, 1)
fn capture(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let p = u.origin + gid.xy;
  let b = vec4<u32>(round(textureLoad(display_in, vec2<i32>(p), 0) * 255.0));
  captured[u.base + p.y * u.size.x + p.x] = b.x | (b.y << 8u) | (b.z << 16u) | (b.w << 24u);
}`,
};

// The complete product set on a fresh backend and device, before any other pipeline in this page is compiled.
async function productPreparationInPage() {
  const { createWebGPUBackend } = await import('/src/space/render/webgpu/backend.js');
  const appearance = await import('/src/space/render/webgpu/appearance.js');
  const { PREPARATION_BOUND_MS } = await import('/src/space/render/webgpu/pipelines.js');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;right:0;bottom:0;width:16px;height:9px;z-index:2147483647;pointer-events:none';
  document.body.append(canvas);
  const backend = createWebGPUBackend({ canvas, clock: performance });
  try {
    const acquired = await backend.acquire(), events = [], set = appearance.productPipelineSet(), started = performance.now();
    const receipt = await backend.prepare({ epoch: acquired.epoch, pipelineSet: set, onProgress: event => events.push({ ...event, atMs: performance.now() - started }) });
    const preparationMs = performance.now() - started;
    const required = appearance.productPipelineDescriptors().map(d => d.pipelineId);
    return { preparationMs, boundMs: PREPARATION_BOUND_MS, pipelineSetId: receipt.pipelineSetId, preparedPipelineIds: receipt.preparedPipelineIds, required, events,
      verify: appearance.verifyPrewarm({ requiredPipelineIds: required, preparedPipelineIds: receipt.preparedPipelineIds }),
      verifyMissing: appearance.verifyPrewarm({ requiredPipelineIds: required, preparedPipelineIds: receipt.preparedPipelineIds.filter(id => id !== 'shade_band:menger') }),
      uncaptured: backend.testAdapter.uncapturedErrors(), implementationHashes: appearance.appearanceImplementationHashes() };
  } finally { backend.destroy(); canvas.remove(); }
}

// The fixtures on the shared rendering backend (__b10); every helper below uses its leases and readbacks.
async function appearanceSetupInPage() {
  const s = globalThis.__b10, { backend } = s;
  const { createPipelineSet } = await import('/src/space/render/backend.js');
  const u = (fields, byteLength = 16) => ({ byteLength, fields: [{ name: 'origin', type: 'vec2<u32>', offset: 0 }, { name: 'size', type: 'vec2<u32>', offset: 8 }, ...fields] });
  const b = (slot, type, access) => ({ slot, type, access });
  const fixture = (pipelineId, entryPoint, bindings, layout) => ({ pipelineId, kind: 'compute', sourceIds: [pipelineId], entryPoint, constants: {}, bindings: [b('u', 'uniform-buffer', 'read'), ...bindings], uniformLayout: layout });
  const set = createPipelineSet({ id: 'b11-fixtures', descriptors: [
    fixture('fixture-pattern', 'pattern', [b('depth', 'storage-texture', 'write'), b('status', 'storage-texture', 'write'), b('normal', 'storage-texture', 'write')], u([{ name: 'sampleIndex', type: 'u32', offset: 16 }], 32)),
    fixture('fixture-poison', 'poison', [b('acc0', 'storage-texture', 'write'), b('acc1', 'storage-texture', 'write'), b('flags', 'storage-texture', 'write')], u([])),
    fixture('fixture-capture', 'capture', [b('display', 'texture', 'read'), b('captured', 'storage-buffer', 'read-write')], u([{ name: 'base', type: 'u32', offset: 16 }], 32)),
  ] });
  const fixtures = await backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: set });
  const appearance = await import('/src/space/render/webgpu/appearance.js');
  const product = await backend.prepare({ epoch: backend.currentEpoch(), pipelineSet: appearance.appearancePipelineSet() });
  const zero = { normalFieldSamples: 0, shadowRays: 0, shadowSteps: 0, aoSamples: 0, raySteps: 0, iterations: 0 };
  globalThis.__b11 = {
    // One fixture batch over `region` (single dispatch), awaited.
    async fixture(jobId, pipelineId, region, inputs, outputs, uniforms) {
      const done = await backend.submitBatch({ identity: s.identity(jobId), pipelineId, pass: 'probe', region, sample: { sequence: 'atlas-aa-v1', seed: 0, index: 0 },
        bounds: { pixels: region.width * region.height, ...zero }, inputs, outputs, uniforms: { origin: [region.x, region.y], size: [region.width, region.height], ...uniforms } }, s.lease(jobId)).done;
      if (done.outcome !== 'completed') throw new Error(`${pipelineId}: ${done.outcome} ${done.reason}`);
    },
    zero,
  };
  return { fixtures: fixtures.preparedPipelineIds, appearance: product.preparedPipelineIds };
}

// The B09 renderer on the shared backend through an instrumented proxy. The proxy (a) keeps every released
// handle alive until the test has read it, (b) optionally poisons each configured target set before the renderer
// sees it, (c) optionally overrides full-stage shade uniforms (a test profile, like B10's ε profiles), (d) copies
// the renderer's own status/normal/lightingStatus readbacks per ordinal, and (e) captures every presented display
// image with a fixture dispatch queued directly behind the presentation, so no later write can precede it.
async function rendererJobInPage(spec) {
  const s = globalThis.__b10, a = globalThis.__b11, { backend } = s;
  const { createSpaceRenderer } = await import('/src/space/render/renderer.js');
  const { createSpaceScene, sceneCodec } = await import('/src/space/scene-adapter.js');
  const { createSpaceRequest } = await import('/src/space/render-adapter.js');
  const { TARGET_LAYOUT } = await import('/src/space/render/backend.js');
  const appearance = await import('/src/space/render/webgpu/appearance.js');
  const { KERNEL_VERSION } = await import('/src/space/render/webgpu/kernels.js');
  const { TRACING_VERSION } = await import('/src/space/render/webgpu/passes.js');
  const W = spec.size.width, H = spec.size.height, pixels = W * H, aux = `b11-aux-${spec.label}`;
  const base = createSpaceScene({ model: spec.model, ...(spec.parameters ? { parameters: spec.parameters } : {}) });
  const scene = sceneCodec.validate({ ...base, appearance: { ...base.appearance, ...spec.appearance }, sampling: { ...base.sampling, ...spec.sampling },
    tracing: { ...base.tracing, ...spec.tracing }, ...(spec.camera ? { camera: spec.camera } : {}) });
  const ordinals = scene.sampling.targetSamples + 1;
  const capture = backend.allocate({ name: `b11-capture-${spec.label}`, bytes: 4 * pixels * ordinals, usage: 'storage' });
  const kept = [], frames = {}, batches = [], captures = [], statuses = [];
  let presents = 0, lastAccumulate = null;
  const poison = async targets => {
    const { width, height } = targets.internalSize, h = targets.handles;
    await a.fixture(aux, 'fixture-poison', { x: 0, y: 0, width, height }, {}, { acc0: h.accumulation[0], acc1: h.accumulation[1], flags: h.accumulationFlags }, {});
  };
  const proxy = Object.freeze({ ...backend,
    async configureTargets(description) { const targets = await backend.configureTargets(description); if (spec.poison) await poison(targets); return targets; },
    release(handle) { kept.push(handle); },
    submitBatch(batch, options) {
      const b = spec.override && batch.pass === 'shade' && batch.uniforms.lightingStage === 1 ? { ...batch, uniforms: { ...batch.uniforms, ...spec.override } } : batch;
      batches.push({ pipelineId: b.pipelineId, pass: b.pass, sample: b.sample.index, region: b.region, ordinal: presents,
        lightingStage: b.uniforms.lightingStage ?? null, shadowSteps: b.uniforms.shadowSteps ?? null, aoSamples: b.uniforms.aoSamples ?? null, shadowRays: b.uniforms.shadowRays ?? null,
        maxIterations: b.uniforms.maxIterations ?? null, toleranceFactor: b.uniforms.toleranceFactor ?? null });
      if (b.pass === 'accumulate') lastAccumulate = { next: b.outputs.next, flags: b.outputs.accumulationFlags };
      return backend.submitBatch(b, options);
    },
    readback(desc, options) {
      const ticket = backend.readback(desc, options), ordinal = presents, field = desc.fields[0];
      if ((spec.captureFields ?? []).includes(field)) {
        ticket.result.then(result => {
          const bpt = TARGET_LAYOUT[field].bytesPerTexel, frame = ((frames[ordinal] ??= {})[field] ??= new Uint8Array(pixels * bpt)), r = desc.region;
          for (let row = 0; row < r.height; row++) frame.set(result.data.subarray(row * r.width * bpt, (row + 1) * r.width * bpt), ((r.y + row) * W + r.x) * bpt);
        }, () => {});
      }
      return ticket;
    },
    present(desc, options) {
      const ticket = backend.present(desc, options);
      if (presents < ordinals) {
        captures.push(backend.submitBatch({ identity: s.identity(aux), pipelineId: 'fixture-capture', pass: 'probe', region: { x: 0, y: 0, width: W, height: H },
          sample: { sequence: 'atlas-aa-v1', seed: 0, index: 0 }, bounds: { pixels, ...a.zero }, inputs: { display: desc.display, captured: capture }, outputs: { captured: capture },
          uniforms: { origin: [0, 0], size: [W, H], base: presents * pixels } }, s.lease(aux)).done);
      }
      presents++;
      return ticket;
    } });
  const versions = { kernelVersion: KERNEL_VERSION, tracingVersion: TRACING_VERSION }, viewId = `space-b11-${spec.label}`;
  const renderer = createSpaceRenderer({ backend: proxy, clock: () => performance.now(), viewId, versions, pipelineSet: appearance.productPipelineSet() });
  const publications = [], reports = [];
  renderer.onPublish(p => publications.push({ kind: p.kind, samples: p.samples, sampleIndex: p.sampleIndex, pending: p.pending, stage: p.quality.lighting.stage,
    shadowSteps: p.quality.lighting.shadowSteps, aoSamples: p.quality.lighting.aoSamples, publishedAt: p.publishedAt, accumulationKey: p.accumulationKey, appearanceKey: p.appearanceKey }));
  renderer.onReport(r => reports.push(JSON.parse(JSON.stringify(r))));
  renderer.onStatus(e => statuses.push({ ...e }));
  try {
    await renderer.prepare();
    const request = createSpaceRequest({ scene, purpose: 'interactive', width: W, height: H, profile: spec.profile ?? 'settled',
      generation: { deviceEpoch: backend.currentEpoch(), viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 }, viewId, versions });
    const job = renderer.render(request);
    if (spec.cancelAfter) renderer.onPublish(() => { if (publications.length === spec.cancelAfter) renderer.cancel(job.jobId); });
    const done = await job.done;
    const captured = await Promise.all(captures);
    if (captured.some(c => c.outcome !== 'completed')) throw new Error(`capture: ${JSON.stringify(captured.filter(c => c.outcome !== 'completed'))}`);
    const out = { outcome: done.outcome, reason: done.reason ?? null, quality: JSON.parse(JSON.stringify(request.quality)), scene: JSON.parse(JSON.stringify(scene)), presents, publications, statuses,
      report: reports.at(-1) ?? null, batches, frames: {} };
    const count = Math.min(presents, ordinals);
    if (count) out.captures = s.base64(await s.read(capture, { x: 0, y: 0, width: 4 * pixels * count, height: 1 }, 'capture', aux));
    if (lastAccumulate) {
      out.accumulation = s.base64(await s.read(lastAccumulate.next, { x: 0, y: 0, width: W, height: H }, 'accumulation', aux));
      out.flags = s.base64(await s.read(lastAccumulate.flags, { x: 0, y: 0, width: W, height: H }, 'accumulationFlags', aux));
    }
    for (const [ordinal, fields] of Object.entries(frames)) out.frames[ordinal] = Object.fromEntries(Object.entries(fields).map(([field, bytes]) => [field, s.base64(bytes)]));
    return out;
  } finally {
    renderer.destroy();
    for (const handle of new Set([...kept, capture])) { try { backend.release(handle); } catch { /* already released */ } }
  }
}

// The passes driven directly, band by band, in a chosen order: geometry (trace and normals, or the synthetic
// pattern), shading or a diagnostic, accumulation per sample, then display. Fresh targets per call.
async function passesInPage(spec) {
  const s = globalThis.__b10, a = globalThis.__b11, { backend, passes } = s;
  const appearance = await import('/src/space/render/webgpu/appearance.js');
  const jobId = `b11-passes-${spec.label}`, size = spec.internalSize, W = size.width, H = size.height;
  const targets = await backend.configureTargets({ epoch: backend.currentEpoch(), layoutId: s.contract.TARGET_LAYOUT_ID, internalSize: size, outputSize: size });
  const h = targets.handles, menger = spec.modelId === 'menger' ? { menger_boxes: s.boxes[spec.effective.depth] } : {};
  const lighting = spec.lighting, profile = spec.profile;
  const bounds = region => ({ pixels: region.width * region.height, raySteps: profile.maxSteps, iterations: profile.maxIterations, normalFieldSamples: 6,
    shadowRays: lighting.shadowRays, shadowSteps: lighting.shadowSteps, aoSamples: lighting.aoSamples });
  const bandsFor = (pass, sample) => {
    const list = [];
    for (let y = 0; y < H; y += spec.bandRows) list.push({ x: 0, y, width: W, height: Math.min(spec.bandRows, H - y) });
    if (spec.order !== 'permuted') return list;
    // A different completion order per pass and sample: rotate, and reverse on odd samples.
    const k = (pass.length * 7 + sample * 3) % list.length, rotated = [...list.slice(k), ...list.slice(0, k)];
    return sample % 2 ? rotated.reverse() : rotated;
  };
  const run = async (pass, pipelineId, sample, uniformsFor, inputs, outputs) => {
    const tickets = bandsFor(pass, sample).map(region => backend.submitBatch({ identity: s.identity(jobId), pipelineId, pass, region,
      sample: { sequence: 'atlas-aa-v1', seed: spec.seed, index: sample }, bounds: bounds(region), inputs, outputs, uniforms: uniformsFor(region) }, s.lease(jobId)).done);
    const done = await Promise.all(tickets);
    const failed = done.filter(d => d.outcome !== 'completed');
    if (failed.length) throw new Error(`${pipelineId} sample ${sample}: ${failed[0].outcome} ${failed[0].reason}`);
  };
  const out = { perSample: [] };
  try {
    for (let sample = 0; sample < spec.samples; sample++) {
      const sampling = { seed: spec.seed, sampleIndex: sample }, common = { modelId: spec.modelId, camera: spec.camera, effective: spec.effective, internalSize: size, sampling, profile };
      if (spec.geometry === 'pattern') {
        for (const region of bandsFor('pattern', sample)) await a.fixture(jobId, 'fixture-pattern', region, {}, { depth: h.depth, status: h.status, normal: h.normal }, { sampleIndex: sample });
      } else {
        await run('trace', `trace_band:${spec.modelId}`, sample, region => passes.traceUniforms({ ...common, region }), { ...menger }, { depth: h.depth, status: h.status, recovery: h.recovery });
        await run('normals', `normals_band:${spec.modelId}`, sample, region => passes.normalsUniforms({ ...common, region }), { depth: h.depth, status: h.status, ...menger }, { normal: h.normal });
      }
      const geometryIn = { depth: h.depth, status: h.status, normal: h.normal }, sampleOut = { sampleColor: h.sampleColor, lightingStatus: h.lightingStatus };
      if (spec.viewMode === 'shaded') await run('shade', `shade_band:${spec.modelId}`, sample, region => appearance.shadeUniforms({ ...common, region, lighting }), { ...geometryIn, ...menger }, sampleOut);
      else await run('shade', spec.viewMode === 'depth' ? `diagnostic_depth:${spec.modelId}` : `diagnostic_${spec.viewMode}`, sample,
        region => appearance.diagnosticUniforms({ ...common, viewMode: spec.viewMode, region }), geometryIn, sampleOut);
      const previous = h.accumulation[sample & 1], next = h.accumulation[(sample + 1) & 1];
      await run('accumulate', 'accumulate_band', sample, region => appearance.accumulateUniforms({ region, sampleIndex: sample }),
        { status: h.status, normal: h.normal, lightingStatus: h.lightingStatus, sampleColor: h.sampleColor, previous, accumulationFlags: h.accumulationFlags }, { next, accumulationFlags: h.accumulationFlags });
      if (spec.perSample) {
        const full = { x: 0, y: 0, width: W, height: H };
        out.perSample.push({ status: s.base64(await s.read(h.status, full, 'status', jobId)), normal: s.base64(await s.read(h.normal, full, 'normal', jobId)),
          lightingStatus: s.base64(await s.read(h.lightingStatus, full, 'lightingStatus', jobId)) });
      }
    }
    const last = spec.samples - 1, accumulation = h.accumulation[(last + 1) & 1];
    const lightingStage = spec.viewMode === 'shaded' ? appearance.LIGHTING_STAGE_CODES[lighting.stage] : appearance.LIGHTING_STAGE_CODES.diagnostic;
    await run('display', 'display_band', last, region => appearance.displayUniforms({ region, lightingStage, viewMode: appearance.VIEW_MODE_CODES[spec.viewMode] }),
      { accumulation, accumulationFlags: h.accumulationFlags }, { display: h.display });
    const full = { x: 0, y: 0, width: W, height: H };
    out.display = s.base64(await s.read(h.display, full, 'display', jobId));
    out.accumulation = s.base64(await s.read(accumulation, full, 'accumulation', jobId));
    out.flags = s.base64(await s.read(h.accumulationFlags, full, 'accumulationFlags', jobId));
    return out;
  } finally { for (const handle of Object.values(h).flat()) backend.release(handle); }
}

// ---- B11b visual acceptance (plan rev 5.0 B11b; tests/support/visual-acceptance.mjs) -------------------------
// One product settled job of a frozen scene and view through the B09 renderer on the shared backend. Each completed
// status, normal and lightingStatus readback of the renderer is copied, per ordinal, into this page's own bit masks
// (spec.bits, the VA_BITS layout); nothing is taken from the renderer's outcome masks, which are returned separately
// in its report for comparison. Returned: the per-ordinal masks, a SHA-256 of each ordinal's status words (identical
// rays across views), the final presented display, and the final accumulation and flags.
async function visualJobInPage(spec) {
  const s = globalThis.__b10, a = globalThis.__b11, { backend } = s;
  const { createSpaceRenderer } = await import('/src/space/render/renderer.js');
  const { createSpaceScene, sceneCodec } = await import('/src/space/scene-adapter.js');
  const { createSpaceRequest } = await import('/src/space/render-adapter.js');
  const { TARGET_LAYOUT } = await import('/src/space/render/backend.js');
  const appearance = await import('/src/space/render/webgpu/appearance.js');
  const { KERNEL_VERSION } = await import('/src/space/render/webgpu/kernels.js');
  const { TRACING_VERSION } = await import('/src/space/render/webgpu/passes.js');
  const W = spec.size.width, H = spec.size.height, pixels = W * H, aux = `b11b-aux-${spec.label}`, B = spec.bits;
  const base = createSpaceScene({ model: spec.model, parameters: spec.parameters, camera: spec.camera });
  const scene = sceneCodec.validate({ ...base, appearance: { ...base.appearance, ...spec.appearance } });
  const ordinals = scene.appearance.viewMode === 'shaded' && scene.appearance.lightingQuality === 'full' ? scene.sampling.targetSamples + 1 : scene.sampling.targetSamples;
  const capture = backend.allocate({ name: `b11b-capture-${spec.label}`, bytes: 4 * pixels, usage: 'storage' });
  const kept = [], masks = [], statusFrames = [], availability = [], reasonCodes = [], copies = [], recoveryPairs = [];
  // B11b fix round 1: each unresolved outcome's reason, coded as in tests/support/visual-acceptance.mjs (vaReasonCode).
  const reasonCode = (reason, subreason) => (reason >= 1 && reason <= 3 ? reason : reason === 4 && (subreason === 1 || subreason === 2) ? 3 + subreason : 6);
  let presents = 0, lastAccumulate = null, captured = null;
  const ensure = ordinal => {
    if (!masks[ordinal]) { masks[ordinal] = new Uint16Array(pixels); statusFrames[ordinal] = new Uint8Array(pixels * 4); availability[ordinal] = new Uint8Array(pixels); reasonCodes[ordinal] = new Uint16Array(pixels); }
  };
  const proxy = Object.freeze({ ...backend,
    release(handle) { kept.push(handle); },
    submitBatch(batch, options) {
      if (batch.pass === 'accumulate') lastAccumulate = { next: batch.outputs.next, flags: batch.outputs.accumulationFlags };
      return backend.submitBatch(batch, options);
    },
    readback(desc, options) {
      const ticket = backend.readback(desc, options), ordinal = presents, field = desc.fields[0], r = desc.region;
      if (field === 'recovery') {
        // B11c: the raw recovery words of a recovering family, as [pixel, word] pairs of the nonzero words.
        copies.push(ticket.result.then(result => {
          const view = new DataView(result.data.buffer, result.data.byteOffset, result.data.byteLength), list = (recoveryPairs[ordinal] ??= []);
          if (4 * r.width * r.height !== result.data.byteLength) throw new Error('readback length');
          for (let row = 0; row < r.height; row++) for (let col = 0; col < r.width; col++) {
            const word = view.getUint32(4 * (row * r.width + col), true);
            if (word) list.push((r.y + row) * W + r.x + col, word);
          }
        }, () => {}));
      }
      if (['status', 'normal', 'lightingStatus'].includes(field)) {
        copies.push(ticket.result.then(result => {
          ensure(ordinal);
          const view = new DataView(result.data.buffer, result.data.byteOffset, result.data.byteLength), m = masks[ordinal], bpt = TARGET_LAYOUT[field].bytesPerTexel;
          for (let row = 0; row < r.height; row++) for (let col = 0; col < r.width; col++) {
            const i = (r.y + row) * W + r.x + col, k = row * r.width + col;
            if (field === 'status') {
              const word = view.getUint32(4 * k, true); statusFrames[ordinal].set(result.data.subarray(4 * k, 4 * k + 4), 4 * i);
              m[i] |= [B.hit, B.miss, B.unresolved, B.numerical][word & 15];
              if ((word & 15) === 2) reasonCodes[ordinal][i] |= reasonCode((word >>> 4) & 15, (word >>> 8) & 15);
            } else if (field === 'normal') availability[ordinal][i] = (view.getUint16(8 * k + 6, true) & 0x7fff) !== 0 ? 1 : 0;
            else {
              const word = view.getUint32(4 * k, true);
              if (word & 1) m[i] |= ((word >>> 2) & 3) === 3 ? B.shadowNumerical : B.shadowUnresolved;
              if (word & 2) m[i] |= ((word >>> 12) & 3) === 3 ? B.aoNumerical : B.aoUnresolved;
              if ((word & 1) && ((word >>> 2) & 3) === 2) reasonCodes[ordinal][i] |= reasonCode((word >>> 4) & 15, (word >>> 8) & 15) << 3;
              if ((word & 2) && ((word >>> 12) & 3) === 2) reasonCodes[ordinal][i] |= reasonCode((word >>> 14) & 15, (word >>> 18) & 15) << 6;
            }
          }
          if (bpt * r.width * r.height !== result.data.byteLength) throw new Error('readback length');
        }, () => {}));
      }
      return ticket;
    },
    present(desc, options) {
      const ticket = backend.present(desc, options);
      if (presents === ordinals - 1) {
        captured = backend.submitBatch({ identity: s.identity(aux), pipelineId: 'fixture-capture', pass: 'probe', region: { x: 0, y: 0, width: W, height: H },
          sample: { sequence: 'atlas-aa-v1', seed: 0, index: 0 }, bounds: { pixels, ...a.zero }, inputs: { display: desc.display, captured: capture }, outputs: { captured: capture },
          uniforms: { origin: [0, 0], size: [W, H], base: 0 } }, s.lease(aux)).done;
      }
      presents++;
      return ticket;
    } });
  const versions = { kernelVersion: KERNEL_VERSION, tracingVersion: TRACING_VERSION }, viewId = `space-b11b-${spec.label}`;
  const renderer = createSpaceRenderer({ backend: proxy, clock: () => performance.now(), viewId, versions, pipelineSet: appearance.productPipelineSet() });
  const reports = [];
  renderer.onReport(r => reports.push(JSON.parse(JSON.stringify(r))));
  const started = performance.now();
  try {
    await renderer.prepare();
    const request = createSpaceRequest({ scene, purpose: 'interactive', width: W, height: H, profile: 'settled',
      generation: { deviceEpoch: backend.currentEpoch(), viewRevision: 1, geometryRevision: 1, appearanceRevision: 1 }, viewId, versions });
    const done = await (renderer.render(request)).done;
    await Promise.all(copies);
    const capturedDone = captured && await captured;
    if (capturedDone && capturedDone.outcome !== 'completed') throw new Error(`capture: ${capturedDone.outcome}`);
    const out = { outcome: done.outcome, reason: done.reason ?? null, presents, ordinals, wallMs: performance.now() - started, report: reports.at(-1) ?? null,
      quality: JSON.parse(JSON.stringify(request.quality)), masks: [], reasons: [], statusSha256: [],
      recovery: masks.map((_, o) => (recoveryPairs[o] ? s.base64(new Uint8Array(Uint32Array.from(recoveryPairs[o] ?? []).buffer)) : null)) };
    for (let o = 0; o < masks.length; o++) {
      if (!masks[o]) { out.masks.push(null); out.reasons.push(null); out.statusSha256.push(null); continue; }
      const pairs = []; for (let i = 0; i < pixels; i++) if (reasonCodes[o][i]) pairs.push(i, reasonCodes[o][i]);
      out.reasons.push(s.base64(new Uint8Array(Uint32Array.from(pairs).buffer)));
      for (let i = 0; i < pixels; i++) if ((masks[o][i] & B.hit) && !availability[o][i]) masks[o][i] |= B.normalUnavailable;
      out.masks.push(s.base64(new Uint8Array(masks[o].buffer)));
      out.statusSha256.push([...new Uint8Array(await crypto.subtle.digest('SHA-256', statusFrames[o]))].map(b => b.toString(16).padStart(2, '0')).join(''));
    }
    if (captured) out.display = s.base64(await s.read(capture, { x: 0, y: 0, width: 4 * pixels, height: 1 }, 'capture', aux));
    if (lastAccumulate && spec.accumulation) {
      out.accumulation = s.base64(await s.read(lastAccumulate.next, { x: 0, y: 0, width: W, height: H }, 'accumulation', aux));
      out.flags = s.base64(await s.read(lastAccumulate.flags, { x: 0, y: 0, width: W, height: H }, 'accumulationFlags', aux));
    }
    return out;
  } finally {
    renderer.destroy();
    for (const handle of new Set([...kept, capture])) { try { backend.release(handle); } catch { /* already released */ } }
  }
}

// The same frozen rays traced directly with the product trace and normals pipelines, one sample at a time: each
// sample's status SHA-256 (compared with the renderer job's) and its hits as compact records (pixel u32, t f32 and
// the raw rgba16float normal, 16 bytes) for the face-normal comparison on the CPU.
async function visualNormalsInPage(spec) {
  const s = globalThis.__b10, { backend, passes } = s, jobId = `b11b-normals-${spec.label}`, size = spec.size, W = size.width, H = size.height, pixels = W * H;
  const targets = await s.targetsFor(size), h = targets.handles, menger = spec.modelId === 'menger' ? { menger_boxes: s.boxes[spec.effective.depth] } : {};
  const rows = Math.max(1, Math.floor(32768 / W)), bands = [];
  for (let y = 0; y < H; y += rows) bands.push({ x: 0, y, width: W, height: Math.min(rows, H - y) });
  const out = [];
  for (let sample = 0; sample < spec.samples; sample++) {
    const sampling = { seed: spec.seed, sampleIndex: sample }, common = { modelId: spec.modelId, camera: spec.camera, effective: spec.effective, internalSize: size, sampling, profile: spec.profile };
    const submit = async (pass, pipelineId, uniformsFor, inputs, outputs) => {
      const done = await Promise.all(bands.map(band => backend.submitBatch({ identity: s.identity(jobId), pipelineId, pass, region: band,
        sample: { sequence: 'atlas-aa-v1', seed: spec.seed, index: sample }, bounds: passes.traceBounds(band, spec.profile, pass), inputs, outputs, uniforms: uniformsFor(band) }, s.lease(jobId)).done));
      const failed = done.filter(d => d.outcome !== 'completed');
      if (failed.length) throw new Error(`${pipelineId} sample ${sample}: ${failed[0].outcome} ${failed[0].reason}`);
    };
    await submit('trace', `trace_band:${spec.modelId}`, band => passes.traceUniforms({ ...common, region: band }), { ...menger }, { depth: h.depth, status: h.status, recovery: h.recovery });
    await submit('normals', `normals_band:${spec.modelId}`, band => passes.normalsUniforms({ ...common, region: band }), { depth: h.depth, status: h.status, ...menger }, { normal: h.normal });
    const full = { x: 0, y: 0, width: W, height: H };
    const status = await s.read(h.status, full, 'status', jobId), depth = await s.read(h.depth, full, 'depth', jobId), normal = await s.read(h.normal, full, 'normal', jobId);
    const sv = new DataView(status.buffer, status.byteOffset, status.byteLength);
    let hits = 0; for (let i = 0; i < pixels; i++) if ((sv.getUint32(4 * i, true) & 15) === 0) hits++;
    const records = new Uint8Array(hits * 16), rv = new DataView(records.buffer);
    for (let i = 0, k = 0; i < pixels; i++) {
      if ((sv.getUint32(4 * i, true) & 15) !== 0) continue;
      rv.setUint32(16 * k, i, true); records.set(depth.subarray(4 * i, 4 * i + 4), 16 * k + 4); records.set(normal.subarray(8 * i, 8 * i + 8), 16 * k + 8); k++;
    }
    out.push({ sample, hits, statusSha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', status))].map(b => b.toString(16).padStart(2, '0')).join(''), records: s.base64(records) });
  }
  return out;
}

// The six frozen scenes (B11b): four views each through the product renderer with identical rays, independent
// masks, the plan thresholds, the face-normal criterion on analytic scenes and the fixed crops. Returns the scene
// rows; `check` records the required pass. With ATLAS_VISUAL_SCREENSHOTS set, every view and crop is written there
// as PNG (diagnostic only).
async function runVisualAcceptance({ page, check }) {
  const va = await import('./support/visual-acceptance.mjs');
  const appearance = await import('../src/space/render/webgpu/appearance.js');
  const cameraModule = await import('../src/space/camera.js');
  const { sampleJitter } = await import('../src/space/render/backend.js');
  const { effectiveParameters } = await import('../src/space/numerics/parameters.js');
  const { resolveQuality } = await import('../src/space/render/profiles.js');
  const { createSpaceScene } = await import('../src/space/scene-adapter.js');
  const passes = await import('../src/space/render/webgpu/passes.js');
  const { encodePng } = await import('../scripts/png.mjs');
  const fixture = va.loadVisualFixture(), W = fixture.settings.width, H = fixture.settings.height, size = { width: W, height: H }, pixels = W * H;
  const shots = process.env.ATLAS_VISUAL_SCREENSHOTS || null;
  if (shots) await mkdir(shots, { recursive: true });
  const VIEWS = { 'shaded-full': { viewMode: 'shaded', lightingQuality: 'full' }, 'shaded-direct': { viewMode: 'shaded', lightingQuality: 'direct' },
    normals: { viewMode: 'normals' }, termination: { viewMode: 'termination' } };
  const B = va.VA_BITS, F = appearance.ACCUMULATION_FLAGS;
  const bytesOf = b64 => new Uint8Array(Buffer.from(b64, 'base64'));
  const u16 = b64 => { const b = bytesOf(b64); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2); };
  const toAccumulationFlags = v => (v & B.numerical ? F.primaryNumericalFailure : 0) | (v & B.unresolved ? F.primaryUnresolved : 0) | (v & B.normalUnavailable ? F.unavailableNormal : 0)
    | (v & B.shadowUnresolved ? F.shadowUnresolved : 0) | (v & B.shadowNumerical ? F.shadowNumericalFailure : 0) | (v & B.aoUnresolved ? F.aoUnresolved : 0) | (v & B.aoNumerical ? F.aoNumericalFailure : 0);
  const LIGHTING_UNRESOLVED = F.shadowUnresolved | F.aoUnresolved, OTHER = F.primaryNumericalFailure | F.primaryUnresolved | F.unavailableNormal | F.shadowNumericalFailure | F.aoNumericalFailure;
  const strip = (object, key) => { const { [key]: _drop, ...rest } = object; return rest; };
  const png = (rgba, x0, y0, w, h) => {
    const rgb = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x0 + x, k = y * w + x; rgb.set(rgba.subarray(4 * i, 4 * i + 3), 3 * k); }
    return encodePng(w, h, Buffer.from(rgb.buffer));
  };
  const alpha = 2 * Math.tan(Math.PI / 6) / H, rows = [];
  for (const sceneSpec of fixture.scenes) {
    const started = Date.now(), { effective } = effectiveParameters(sceneSpec.model, sceneSpec.parameters);
    const jobs = {};
    for (const view of fixture.views) {
      jobs[view] = await ev(page, visualJobInPage, { label: `${sceneSpec.id}-${view}`, model: sceneSpec.model, parameters: sceneSpec.parameters, camera: sceneSpec.camera,
        appearance: VIEWS[view], size, bits: B, accumulation: view === 'shaded-full' }, `visual ${sceneSpec.id} ${view}`, 3 * LIMITS.deep);
    }
    const row = { id: sceneSpec.id, class: sceneSpec.class, failures: [], wallMs: Object.fromEntries(Object.entries(jobs).map(([v, j]) => [v, Math.round(j.wallMs)])) };
    const fail = message => row.failures.push(message);
    for (const [view, job] of Object.entries(jobs)) {
      if (job.outcome !== 'completed') fail(`${view}: ${job.outcome} ${job.reason}`);
      if (job.report?.samples?.completed !== fixture.settings.targetSamples) fail(`${view}: samples ${JSON.stringify(job.report?.samples)}`);
    }
    // Sample s of the full view is ordinal s + 1 (ordinal 0 is its direct sample); the other views start at 0.
    const ordinalOf = (view, sample) => (view === 'shaded-full' ? sample + 1 : sample);
    const samples = [...Array(fixture.settings.targetSamples).keys()];
    row.identicalRays = samples.every(sample => new Set(fixture.views.map(view => jobs[view].statusSha256[ordinalOf(view, sample)])).size === 1);
    if (!row.identicalRays) fail('the four views do not trace identical rays');
    const full = jobs['shaded-full'], perSample = samples.map(sample => u16(full.masks[ordinalOf('shaded-full', sample)]));
    const union = va.orBits(perSample);
    row.perSample = perSample.map(bits => va.vaMetrics(bits)); row.union = va.vaMetrics(union);
    // Reasons (B11b fix round 1, Codex B11b-F2): per pixel class, per sample and over the union, from the same samples.
    const u32 = b64 => { const b = bytesOf(b64); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
    const reasonLanes = samples.map(sample => va.vaReasonLanes(u32(full.reasons[ordinalOf('shaded-full', sample)]), pixels));
    row.reasons = { union: va.vaReasonMetrics(va.orBits32(reasonLanes)), perSample: reasonLanes.map(va.vaReasonMetrics) };
    // The renderer's own outcome masks (B11b) must equal these independent masks.
    const rendererMasks = full.report?.outcomeMasks;
    // B11c: the recovery diagnostics (spec §11.4 rev 5.1) from the page's own raw recovery readbacks, per sample and over
    // the union of the same samples; a non-recovering family reads none back.
    const recoveryFrames = samples.map(sample => full.recovery?.[ordinalOf('shaded-full', sample)] ?? null);
    row.recovery = recoveryFrames.every(frame => frame === null) ? null : va.vaRecoveryMetrics(recoveryFrames.map(frame => u32(frame ?? '')), pixels);
    row.rendererMasksAgree = !!rendererMasks && isDeepStrictEqual(rendererMasks.samples.map(m => strip(m, 'sample')), row.perSample)
      && isDeepStrictEqual(strip(rendererMasks.union, 'samples'), row.union)
      && isDeepStrictEqual(rendererMasks.reasons, { samples: row.reasons.perSample, union: row.reasons.union })
      && isDeepStrictEqual(rendererMasks.recovery ?? null, row.recovery);
    if ((sceneSpec.model === 'quaternion-julia') !== (row.recovery !== null)) fail(`recovery diagnostics ${row.recovery ? 'present' : 'absent'} for ${sceneSpec.model}`);
    // The shaded-full product report itself (its counts and outcome masks with reasons) is saved with the row.
    row.rendererReport = full.report ?? null;
    if (!row.rendererMasksAgree) fail(`renderer outcome masks disagree: ${JSON.stringify({ union: rendererMasks?.union ?? null, reasons: rendererMasks?.reasons?.union ?? null, recovery: rendererMasks?.recovery?.union ?? null })} vs ${JSON.stringify({ union: row.union, reasons: row.reasons.union, recovery: row.recovery?.union ?? null })}`);
    // Presentation of every flagged pixel in the full shaded image.
    const display = bytesOf(full.display), sums = (() => { const b = bytesOf(full.accumulation); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); })();
    const flags = (() => { const b = bytesOf(full.flags); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4); })();
    let flagMismatch = 0, lightingAsMagenta = 0, lostIndication = 0, tinted = 0;
    const lostExamples = [];
    for (let i = 0; i < pixels; i++) {
      if (flags[i] !== toAccumulationFlags(union[i])) flagMismatch++;
      const f = flags[i]; if (!f) continue;
      const sum = [sums[4 * i], sums[4 * i + 1], sums[4 * i + 2], sums[4 * i + 3]], got = display.subarray(4 * i, 4 * i + 4);
      const expected = appearance.expectedDisplay({ sum, flags: f, lightingStage: appearance.LIGHTING_STAGE_CODES.full, viewMode: appearance.VIEW_MODE_CODES.shaded });
      const lightingOnly = (f & LIGHTING_UNRESOLVED) !== 0 && !(f & OTHER);
      const plain = lightingOnly ? appearance.expectedDisplay({ sum, flags: 0, lightingStage: appearance.LIGHTING_STAGE_CODES.full, viewMode: appearance.VIEW_MODE_CODES.shaded }) : null;
      // Magenta on a lighting-only pixel is counted on its own, as well as a lost indication (Codex B11b-F5).
      const c = va.classifyFlaggedPixel({ got, expected, plain, lightingOnly });
      if (c.magenta) lightingAsMagenta++;
      if (c.tinted) tinted++;
      if (c.lost) { lostIndication++; if (lostExamples.length < 6) lostExamples.push({ pixel: i, flags: f, union: union[i], sum, got: [...got], expected, ...(plain ? { plain } : {}), magenta: c.magenta }); }
    }
    if (flagMismatch) fail(`${flagMismatch} accumulated flags differ from the union of the sample masks`);
    Object.assign(row, { lightingAsMagenta, lostIndication, lightingIndicated: tinted, lostExamples });
    row.thresholds = va.evaluateScene({ sceneClass: sceneSpec.class, union: row.union, lightingAsMagenta, lostIndication });
    if (!row.thresholds.passed) fail(`thresholds: ${row.thresholds.rows.filter(r => !r.passed).map(r => `${r.metric} ${r.numerator}/${r.denominator}`).join(', ')}`);
    // Smooth analytic face interiors: the same rays traced directly, sample by sample.
    const cropIndex = (crop, i) => { const x = i % W, y = Math.floor(i / W); return x >= crop.x && x < crop.x + crop.width && y >= crop.y && y < crop.y + crop.height; };
    const cropTallies = Object.fromEntries(sceneSpec.crops.map(crop => [crop.id, []]));
    if (sceneSpec.class === 'analytic') {
      const scene = createSpaceScene({ model: sceneSpec.model, parameters: sceneSpec.parameters, camera: sceneSpec.camera }), quality = resolveQuality(scene, 'settled', size);
      const traced = await ev(page, visualNormalsInPage, { label: sceneSpec.id, modelId: sceneSpec.model, camera: sceneSpec.camera, effective, size, samples: samples.length,
        seed: fixture.settings.seed, profile: { ...quality.iteration, ...quality.tracing } }, `visual normals ${sceneSpec.id}`, 3 * LIMITS.deep);
      const { forward, right, up } = cameraModule.basis(sceneSpec.camera), hTan = Math.tan(sceneSpec.camera.verticalFovDegrees * Math.PI / 360), origin = sceneSpec.camera.positionLocal;
      const tallies = [];
      for (const t of traced) {
        if (t.statusSha256 !== full.statusSha256[ordinalOf('shaded-full', t.sample)]) fail(`sample ${t.sample}: the direct trace differs from the renderer's rays`);
        const recordsBytes = bytesOf(t.records), view = new DataView(recordsBytes.buffer, recordsBytes.byteOffset, recordsBytes.byteLength), records = [];
        for (let k = 0; k < t.hits; k++) {
          const pixel = view.getUint32(16 * k, true), depth = view.getFloat32(16 * k + 4, true), x = pixel % W, y = Math.floor(pixel / W);
          const halves = [0, 1, 2, 3].map(c => view.getUint16(16 * k + 8 + 2 * c, true));
          const jitter = sampleJitter({ seed: fixture.settings.seed, sampleIndex: t.sample, pixel: [x, y] });
          const sx = (2 * ((x + 0.5 + jitter.dx) / W) - 1) * hTan * (W / H), sy = (1 - 2 * ((y + 0.5 + jitter.dy) / H)) * hTan;
          const dRaw = forward.map((f, a) => f + sx * right[a] + sy * up[a]), dLen = Math.hypot(...dRaw), d = dRaw.map(v => v / dLen);
          const p = origin.map((o, a) => o + depth * d[a]), tau = va.tauAt(depth, alpha, quality.tracing);
          const record = { pixel, sample: t.sample, eligibility: va.faceEligibility(sceneSpec.model, p, va.FACE_MARGIN_TAUS * tau, effective.depth),
            normal: (halves[3] & 0x7fff) === 0 ? null : halves.slice(0, 3).map(passes.halfToNumber) };
          records.push(record);
          for (const crop of sceneSpec.crops) if (cropIndex(crop, pixel)) cropTallies[crop.id].push(record);
        }
        tallies.push(va.faceNormalTally(records));
      }
      row.faces = va.mergeTallies(tallies);
      if (!row.faces.passed) fail(`smooth faces: ${row.faces.unavailable} unavailable of ${row.faces.eligible} eligible, ${(100 * row.faces.fractionWithinLimit).toFixed(3)}% within 1e-3 rad`);
    }
    row.crops = sceneSpec.crops.map(crop => {
      const inside = []; for (let i = 0; i < pixels; i++) if (cropIndex(crop, i)) inside.push(union[i]);
      const metrics = va.vaMetrics(inside), faces = sceneSpec.class === 'analytic' ? va.mergeTallies([va.faceNormalTally(cropTallies[crop.id])]) : null;
      const passed = metrics.unavailableNormals === 0 && (!faces || faces.unavailable === 0);
      if (!passed) fail(`crop ${crop.id}: ${metrics.unavailableNormals} unavailable-normal pixels among ${metrics.hits} hits${faces ? `, ${faces.unavailable} of ${faces.eligible} eligible face hits` : ''}`);
      return { ...crop, metrics, faces: faces && strip(faces, 'worst'), passed };
    });
    if (shots) {
      for (const view of fixture.views) {
        const rgba = bytesOf(jobs[view].display);
        await writeFile(`${shots}/${sceneSpec.id}-${view}.png`, png(rgba, 0, 0, W, H));
        if (view === 'shaded-full' || view === 'normals') for (const crop of sceneSpec.crops) await writeFile(`${shots}/${sceneSpec.id}-${crop.id}-${view}.png`, png(rgba, crop.x, crop.y, crop.width, crop.height));
      }
    }
    row.passed = row.failures.length === 0; row.elapsedMs = Date.now() - started;
    rows.push(row);
    console.log(`VISUAL ${sceneSpec.id}: ${row.passed ? 'pass' : 'FAIL'} ${JSON.stringify({ union: row.union, reasons: row.reasons.union, recovery: row.recovery?.union ?? null, magenta: lightingAsMagenta, lost: lostIndication, faces: row.faces && strip(row.faces, 'worst'), failures: row.failures }).slice(0, 2400)}`);
  }
  report.push({ name: 'Visual acceptance scenes (recorded; plan rev 5.0 B11b)', fixture: fixture.version, settings: fixture.settings, thresholds: va.VISUAL_THRESHOLDS, faceCriterion: va.FACE_NORMAL_CRITERION,
    scenes: rows.map(row => ({ ...row, perSample: row.perSample })) });
  check(va.VISUAL_ACCEPTANCE_PASS, () => {
    for (const row of rows) assert.deepEqual(row.failures, [], `${row.id}: ${row.failures.join('; ')}`);
    return { scenes: rows.map(row => ({ id: row.id, union: row.union, reasons: row.reasons.union, recovery: row.recovery?.union ?? null, thresholds: row.thresholds.rows.map(r => `${r.metric} ${r.numerator}/${r.denominator}`), faces: row.faces && strip(row.faces, 'worst') })) };
  });
  return rows;
}

const VIEW_MODE_LIST = Object.freeze(['shaded', 'normals', 'depth', 'steps', 'termination']);

// The visual acceptance alone (a diagnostic convenience for B11b development; never gated: the required pass is the
// rendering group's).
async function runVisualOnly({ page }) {
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.operation });
  await idleWithin(page);
  await ev(page, renderingSetupInPage, { fixtures: { ...RENDERING_FIXTURES, ...APPEARANCE_FIXTURES } }, 'rendering setup', LIMITS.deep);
  await ev(page, appearanceSetupInPage, undefined, 'appearance setup', LIMITS.deep);
  const failedChecks = [];
  const check = (name, fn) => { try { pass(name, fn()); } catch (error) { failedChecks.push(name); report.push({ name: `FAILED ${name}`, error: String(error?.message ?? error).slice(0, 4000) }); console.log(`FAILED ${name}: ${String(error?.message).slice(0, 600)}`); } };
  await runVisualAcceptance({ page, check });
  const finish = await ev(page, renderingFinishInPage, undefined, 'rendering teardown');
  assert.deepEqual(finish.uncaptured, [], `no uncaptured WebGPU errors: ${JSON.stringify(finish.uncaptured)}`);
  assert.deepEqual(failedChecks, [], `visual checks failed: ${failedChecks.join('; ')}`);
}

async function runRendering({ page }) {
  const tracing = await import('./support/space-tracing.mjs');
  const passes = await import('../src/space/render/webgpu/passes.js');
  const records = await import('../src/space/numerics/validation-records.js');
  const camera = await import('../src/space/camera.js');
  const { sampleJitter } = await import('../src/space/render/backend.js');
  const { SPACE_DEFAULTS } = await import('../src/space/scene-adapter.js');
  const view = tracing.loadPinnedRayStrata();
  const tol = view.tolerances, strata = view.strata;
  const usability = JSON.parse(await readFile('tests/reference/quaternion-usability.json', 'utf8'));
  report.push({ name: 'Matrix pins and loaded ray shards (partial view; not whole-matrix qualification)', complete: view.complete, pins: records.MATRIX_PINS, shards: view.shards, strata: strata.length, anchors: view.anchors.length });

  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.operation });
  await idleWithin(page);
  // B11: the complete product set is prepared first, on a fresh device, so its time is not a warm recompilation.
  const productPreparation = await ev(page, productPreparationInPage, undefined, 'product pipeline preparation', LIMITS.deep);
  report.push({ name: 'Complete product pipeline set prepared on a fresh device (recorded)', ...productPreparation });
  const setup = await ev(page, renderingSetupInPage, { fixtures: { ...RENDERING_FIXTURES, ...APPEARANCE_FIXTURES } }, 'rendering setup', LIMITS.deep);
  assert.deepEqual(setup.acquired.requestedLimits, {}, 'no blanket requiredLimits');
  assert.deepEqual(setup.product.preparedPipelineIds, passes.tracePipelineDescriptors().map(d => d.pipelineId));
  assert.deepEqual(setup.validation.preparedPipelineIds, passes.validationPipelineDescriptors().map(d => d.pipelineId));
  assert.deepEqual(setup.implementationHashes, passes.tracingImplementationHashes(), 'the served tracing metadata is the checkout\'s');
  report.push({ name: 'Tracing pipelines prepared (recorded)', ...setup });

  const failedChecks = [], results = [];
  const check = (name, fn) => { try { const details = fn(); pass(name, details); } catch (error) { failedChecks.push(name); report.push({ name: `FAILED ${name}`, error: String(error?.message ?? error).slice(0, 4000) }); console.log(`FAILED ${name}: ${String(error?.message).slice(0, 600)}`); } };
  const bytes = b64 => new Uint8Array(Buffer.from(b64, 'base64'));
  const decodeFrame = (run, count) => {
    const statuses = passes.decodeStatusWords(bytes(run.status)), depths = passes.decodeDepths(bytes(run.depth)), recovery = passes.decodeRecoveryWords(bytes(run.recovery));
    assert.equal(statuses.length, count); assert.equal(recovery.length, count);
    return statuses.map((s, i) => ({ ...s, t: depths[i], recovery: recovery[i] }));
  };
  const frame = async spec => {
    const run = await ev(page, traceFrameInPage, spec, `trace ${spec.label}`, LIMITS.deep);
    assert.deepEqual(run.trace, { completed: run.bands }, `${spec.label}: every trace batch completes ${JSON.stringify(run.traceFailures)}`);
    if (spec.normals) assert.deepEqual(run.normals, { completed: run.bands }, `${spec.label}: every normals batch completes`);
    return run;
  };
  const alpha720 = 2 * Math.tan(Math.PI / 6) / 720;
  const strataOf = kind => strata.filter(row => row.kind === kind);

  // 1. Analytic rays (trace_rays, one batch per stratum and profile). Rev 4.8: both mandatory checks — the
  // surface-v1 expanded-object envelope and analytic-inspection-v1 relative 1e-3 — with exact statuses under
  // both. The inspection profile's floor and factor come from the pinned matrix metadata, never from here.
  const analytic = strataOf('analytic-ray'), inspectionMeta = view.profiles['analytic-inspection-v1'];
  assert.equal(inspectionMeta.toleranceScale, 0.1);
  const INSPECTION = Object.freeze({ ...SURFACE_V1, toleranceFloor: inspectionMeta.toleranceFloor, toleranceFactor: inspectionMeta.toleranceFactor, stepMultiplier: inspectionMeta.stepMultiplier });
  const analyticProfiles = [['surface', SURFACE_V1], ['inspection', INSPECTION]];
  const analyticRuns = await ev(page, traceRaysInPage, { label: 'analytic', batches: analyticProfiles.flatMap(([, profile]) => analytic.map(row => {
    const first = row.cases[0].inputs, pitch = 64;
    return { modelId: first.model, depth: first.effective.depth, rays: row.cases.map(c => c.inputs.ray),
      uniforms: passes.traceRaysUniforms({ modelId: first.model, effective: first.effective, count: row.cases.length, pitch, profile: { ...profile, alpha: alpha720 } }) };
  })) }, 'analytic rays', LIMITS.deep);
  const analyticRows = analytic.map((row, i) => {
    assert.ok(row.cases.every(c => c.inputs.model === row.cases[0].inputs.model && JSON.stringify(c.inputs.effective) === JSON.stringify(row.cases[0].inputs.effective)), `${row.id}: one model per stratum`);
    const decoded = Object.fromEntries(analyticProfiles.map(([name], p) => {
      const run = analyticRuns[p * analytic.length + i];
      assert.equal(run.outcome, 'completed', `${row.id} ${name}: ${run.reason}`);
      return [name, passes.decodeRayResults(bytes(run.base64), row.cases.length)];
    }));
    return tracing.compareAnalyticStratum(row, decoded, tol);
  });
  results.push(...analyticRows);
  report.push({ name: 'Analytic ray strata (recorded, per stratum; surface-v1 envelope and analytic-inspection-v1)', inspectionProfile: INSPECTION, rows: analyticRows.map(tracing.analyticReportRow) });
  check(RENDERING_PASSES[0], () => {
    assert.equal(analyticRows.length, 4);
    for (const row of analyticRows) assert.equal(row.passed, true, `${row.id} ${row.state}: ${JSON.stringify({ belowFloor: row.belowFloor, countMismatch: row.countMismatch, nf: row.numericalFailures, checks: row.checks, failures: row.failures.slice(0, 6) })}`);
    return { rows: analyticRows.map(({ failures, ...row }) => row) };
  });

  // 2. Detail ladders (trace_band with each stratum's camera, ladder-v1, central 32 × 32).
  const ladderRows = [];
  for (const row of strataOf('detail-ladder')) {
    const run = await frame({ label: `ladder-${row.id}`, modelId: row.inputs.model, camera: row.camera, effective: row.inputs.effective, internalSize: { width: 1280, height: 720 },
      region: { x: 624, y: 344, width: 32, height: 32 }, sampling: { seed: 0, sampleIndex: 0 }, profile: LADDER_V1 });
    const decoded = decodeFrame(run, 1024);
    ladderRows.push(tracing.compareLadderStratum(row, row.cases.map(c => decoded[(c.pixel[1] - 344) * 32 + (c.pixel[0] - 624)])));
  }
  check(RENDERING_PASSES[1], () => {
    assert.equal(ladderRows.length, 144);
    const invalid = ladderRows.filter(row => row.outcome === 'invalid');
    assert.deepEqual(invalid.map(row => row.id), [], 'every ladder row decodes');
    for (const anchor of view.anchors) assert.equal(ladderRows.filter(row => row.anchorId === anchor.id).length, 8, `${anchor.id}: one row per distance`);
    const table = view.anchors.map(anchor => ({ anchorId: anchor.id, outcomes: Object.fromEntries(ladderRows.filter(row => row.anchorId === anchor.id).map(row => [row.distance, row.outcome])) }));
    return { byOutcome: ladderRows.reduce((acc, row) => ({ ...acc, [row.outcome]: (acc[row.outcome] ?? 0) + 1 }), {}), table,
      numericalFailures: ladderRows.reduce((n, row) => n + row.numericalFailures, 0), rows: ladderRows };
  });

  // 3. Adversarial rays (trace_rays, one batch per case: each case carries its own model and profile).
  const adversarial = strataOf('adversarial-ray')[0];
  const advBatches = adversarial.cases.map(c => {
    const i = c.inputs, profile = { ...SURFACE_V1, alpha: alpha720, ...(i.profile.maxSteps ? { maxSteps: i.profile.maxSteps } : {}) };
    if (i.profile.tolerance === 0) Object.assign(profile, { toleranceFloor: 0, toleranceFactor: 0, alpha: 0 });
    const modelId = i.model ?? 'constant';
    const effective = modelId === 'constant' ? { distance: Math.fround(i.constantExteriorDistance) } : modelId === 'quaternion-julia' ? { C: i.effective.C.map(Math.fround), kappa: Math.fround(i.effective.kappa) } : i.effective;
    return { modelId, depth: effective.depth, rays: [{ ...i.ray, ...(i.interval ? { interval: i.interval } : {}) }],
      uniforms: passes.traceRaysUniforms({ modelId, effective, count: 1, pitch: 1, profile }) };
  });
  const advRuns = await ev(page, traceRaysInPage, { label: 'adversarial', batches: advBatches }, 'adversarial rays', LIMITS.deep);
  advRuns.forEach((run, i) => assert.equal(run.outcome, 'completed', `${adversarial.cases[i].id}: ${run.reason}`));
  const advRow = tracing.compareAdversarialRays(adversarial, advRuns.map(run => passes.decodeRayResults(bytes(run.base64), 1)[0]));
  results.push(advRow);
  check(RENDERING_PASSES[2], () => {
    assert.equal(adversarial.cases.length, 12);
    assert.equal(advRow.passed, true, `${advRow.state}: ${JSON.stringify(advRow.failures)}`);
    return { rows: advRow.rows };
  });

  // Fix round 1 probes (Codex run 20261021T203032Z-7350; recorded, not manifest passes): an interior
  // camera through the product trace_band keeps `detail: interior` in the status word (B10-F3); Codex's far-origin
  // ray (B10-F1), the tiny slab direction and an ordinary t = 2 advance (B10-F2) through trace_rays.
  const interiorCamera = camera.lookAt({ ...SPACE_DEFAULTS.camera, positionLocal: [0.1, 0.2, 0.05], focusLocal: [1, 0, 0] }, [1, 0, 0]);
  const interiorRows = {};
  for (const modelId of ['sphere', 'box']) {
    const run = await frame({ label: `interior-${modelId}`, modelId, camera: interiorCamera, effective: {}, internalSize: { width: 16, height: 9 }, region: { x: 0, y: 0, width: 16, height: 9 },
      sampling: { seed: 0, sampleIndex: 0 }, profile: SURFACE_V1 });
    interiorRows[modelId] = decodeFrame(run, 16 * 9);
  }
  const probeProfile = { ...SURFACE_V1, alpha: alpha720 };
  const f1 = { origin: [50361504, 29461416, -83167144], direction: [-0.49572083353996277, -0.28999605774879456, 0.8186349272727966] };
  const probeRuns = await ev(page, traceRaysInPage, { label: 'fix1-probes', batches: [
    { modelId: 'sphere', rays: [f1], uniforms: passes.traceRaysUniforms({ modelId: 'sphere', effective: {}, count: 1, pitch: 1, profile: probeProfile }) },
    { modelId: 'menger', depth: 1, rays: [{ origin: [8, -4, 0], direction: [2 ** -126, 1, 0] }], uniforms: passes.traceRaysUniforms({ modelId: 'menger', effective: { depth: 1 }, count: 1, pitch: 1, profile: probeProfile }) },
    { modelId: 'constant', rays: [{ origin: [-3, 0, 0], direction: [1, 0, 0], interval: { enter: 2, exit: 10 } }], uniforms: passes.traceRaysUniforms({ modelId: 'constant', effective: { distance: 1 }, count: 1, pitch: 1, profile: probeProfile }) },
  ] }, 'fix round 1 probes', LIMITS.deep);
  const probes = probeRuns.map(run => { assert.equal(run.outcome, 'completed', run.reason); return passes.decodeRayResults(bytes(run.base64), 1)[0]; });
  check('Fix round 1 probes: interior cameras keep their detail; far-origin, tiny-slab and t = 2 rays (recorded, not manifest passes)', () => {
    for (const [modelId, rows] of Object.entries(interiorRows)) for (const r of rows) assert.deepEqual([r.status, r.reason, r.subreason, r.detail, r.t], ['unresolved', 'estimate-unavailable', null, 'interior', 0], `${modelId} interior camera`);
    const [far, slab, ordinary] = probes;
    assert.ok(!(far.status === 'miss' && far.steps === 0), `the far-origin ray is not an empty-interval miss: ${JSON.stringify(far)}`);
    assert.notEqual(far.status, 'numerical failure');
    assert.deepEqual([slab.status, slab.steps], ['miss', 0], `the tiny slab direction misses the box without failure: ${JSON.stringify(slab)}`);
    assert.deepEqual([ordinary.status, ordinary.reason], ['miss', null], `the t = 2 advance runs to the explicit exit: ${JSON.stringify(ordinary)}`);
    return { interior: Object.fromEntries(Object.entries(interiorRows).map(([k, rows]) => [k, rows[0]])), far, slab, ordinary };
  });

  // 4. Overview strata (trace_band with each stratum's frozen camera over the sample pixels' bounding region).
  const overviewRows = [], overviewRegion = { x: 376, y: 96, width: 528, height: 528 };
  for (const row of strataOf('fractal-overview')) {
    const run = await frame({ label: row.id, modelId: row.inputs.model, camera: row.camera, effective: row.inputs.effective, internalSize: { width: 1280, height: 720 },
      region: overviewRegion, sampling: { seed: 0, sampleIndex: 0 }, profile: SURFACE_V1 });
    const decoded = decodeFrame(run, 528 * 528);
    const caseResults = row.cases.map(c => decoded[(c.pixel[1] - 96) * 528 + (c.pixel[0] - 376)]);
    // B11c: the recovery diagnostics of the stratum's rays (spec §11.4 rev 5.1), kept apart from the terminations.
    const recovery = { attempted: 0, outcomes: {}, stops: {}, midpoints: 0 };
    for (const r of caseResults) if (r.recovery.attempted) {
      recovery.attempted++; recovery.midpoints += r.recovery.midpoints;
      recovery.outcomes[r.recovery.outcome] = (recovery.outcomes[r.recovery.outcome] ?? 0) + 1;
      if (r.recovery.stop !== 'none') recovery.stops[r.recovery.stop] = (recovery.stops[r.recovery.stop] ?? 0) + 1;
    }
    overviewRows.push({ ...tracing.compareOverviewStratum(row, caseResults), wallMs: run.wallMs, terminations: tracing.terminationCounts(caseResults), recovery });
  }
  results.push(...overviewRows);
  check(RENDERING_PASSES[3], () => {
    assert.equal(overviewRows.length, 7 + 42);
    const failing = overviewRows.filter(row => !row.passed).map(({ disagreementsSample, depthMissesSample, ...row }) => ({ ...row, disagreementsSample, depthMissesSample }));
    assert.deepEqual(failing, [], 'every overview stratum passes');
    return { rows: overviewRows.map(({ disagreementsSample, depthMissesSample, ...row }) => row) };
  });

  // B11c (spec §11.4 rev 5.1; plan B11b FU2): the quaternion-primary bounded recovery on the GPU. Every scripted case
  // (tests/support/primary-recovery.mjs: initial-point exclusion, success with each endpoint update, numerical failure,
  // estimate-unavailable, both collapses, cap exhaustion, the midpoint limit and a secondary ray) must equal the binary32
  // mirror exactly, recovery word included; no other family's overview ray attempts recovery. Recorded, not a manifest
  // pass: any failure fails the group.
  const recoveryModule = await import('./support/primary-recovery.mjs');
  const scriptedRuns = await ev(page, traceRaysInPage, { label: 'b11c-recovery', batches: recoveryModule.SCRIPTED_RECOVERY_CASES.map(c => ({ modelId: 'scripted',
    rays: [{ origin: [c.origin, 0, 0], direction: [1, 0, 0], interval: c.interval, secondary: c.secondary === true }],
    uniforms: passes.traceRaysUniforms({ modelId: 'scripted', effective: c.effective, count: 1, pitch: 1, profile: c.profile }) })) }, 'scripted recovery rays', LIMITS.deep);
  check('Quaternion-primary recovery: scripted GPU rays equal the binary32 mirror, and other families never recover (recorded, not a manifest pass)', () => {
    const rows = recoveryModule.SCRIPTED_RECOVERY_CASES.map((c, i) => {
      const run = scriptedRuns[i];
      assert.equal(run.outcome, 'completed', `${c.id}: ${run.reason}`);
      const gpu = passes.decodeRayResults(bytes(run.base64), 1)[0];
      assert.notEqual(gpu.status, 'invalid', `${c.id}: the result decodes`);
      const expected = recoveryModule.comparable(recoveryModule.mirrorCase(c)), actual = recoveryModule.comparable(gpu);
      assert.deepEqual(actual, expected, `${c.id}: the GPU path equals the mirror`);
      return { id: c.id, ...actual };
    });
    const others = overviewRows.filter(row => !row.id.startsWith('overview/quaternion/'));
    for (const row of others) assert.equal(row.recovery.attempted, 0, `${row.id}: a non-quaternion overview ray attempted recovery`);
    return { cases: rows, overview: overviewRows.filter(row => row.recovery.attempted).map(row => ({ id: row.id, ...row.recovery })) };
  });

  // 5–6. Sphere frame (the default camera, 320 × 180): silhouette, then normals; a jittered sample too.
  const sphereCamera = SPACE_DEFAULTS.camera, sphereSize = { width: 320, height: 180 }, full = { x: 0, y: 0, ...sphereSize };
  const origin = camera.encodeOrdinaryOrigin(sphereCamera), worldOrigin = sphereCamera.positionLocal;
  assert.ok(!origin.unavailable && origin.errorBoundLog2 <= -40, `the default camera origin transports as high + low (bound 2^${origin.errorBoundLog2})`);
  const sphereRun = await frame({ label: 'sphere', modelId: 'sphere', camera: sphereCamera, effective: {}, internalSize: sphereSize, region: full, sampling: { seed: 1, sampleIndex: 0 }, profile: SURFACE_V1, normals: true });
  const jitterRun = await frame({ label: 'sphere-jittered', modelId: 'sphere', camera: sphereCamera, effective: {}, internalSize: sphereSize, region: full, sampling: { seed: 1, sampleIndex: 5 }, profile: SURFACE_V1 });
  const silhouette = (run, sampleIndex) => {
    const decoded = decodeFrame(run, sphereSize.width * sphereSize.height);
    const jitter = (i, j) => sampleJitter({ seed: 1, sampleIndex, pixel: [i, j] });
    const mask = tracing.sphereSilhouette({ origin: worldOrigin, width: sphereSize.width, height: sphereSize.height,
      rayDirection: (i, j) => camera.rayDirection(sphereCamera, i, j, sphereSize.width, sphereSize.height, jitter(i, j)),
      centreDirection: (i, j) => camera.rayDirection(sphereCamera, i, j, sphereSize.width, sphereSize.height) });
    let edge = 0, hits = 0, misses = 0;
    const mismatches = [], nonMiss = [];
    decoded.forEach((r, k) => {
      const m = mask[k];
      if (m.edge) { edge++; return; }
      const hit = r.status === 'approximate hit';
      if (hit !== m.hit) mismatches.push({ pixel: [k % sphereSize.width, Math.floor(k / sphereSize.width)], gpu: r.status, analytic: m.hit, marginPixels: (m.theta - m.beta) });
      if (m.hit) hits++; else { misses++; if (r.status !== 'miss') nonMiss.push({ k, status: r.status }); }
    });
    return { decoded, edge, hits, misses, mismatches, nonMiss };
  };
  const centre = silhouette(sphereRun, 0), jittered = silhouette(jitterRun, 5);
  check(RENDERING_PASSES[5], () => {
    for (const [name, s] of Object.entries({ centre, jittered })) {
      assert.deepEqual(s.mismatches.slice(0, 8), [], `${name}: ${s.mismatches.length} hit-mask mismatches away from the edge`);
      assert.deepEqual(s.nonMiss.slice(0, 8), [], `${name}: pixels off the disc are misses`);
      assert.ok(s.hits > 10000, `${name}: the disc covers ${s.hits} pixels`);
    }
    return Object.fromEntries(Object.entries({ centre, jittered }).map(([name, s]) => [name, { hits: s.hits, misses: s.misses, edgeExcluded: s.edge, mismatches: s.mismatches.length }]));
  });

  // Normals: the sphere's exact gradient; ε collapsed below the position resolution; a zero gradient
  // (the constant zero field); unresolved samples (quaternion C = 0, the unit ball); depth preserved.
  const collapsed = await frame({ label: 'sphere-collapsed-epsilon', modelId: 'sphere', camera: sphereCamera, effective: {}, internalSize: sphereSize, region: full, sampling: { seed: 1, sampleIndex: 0 },
    profile: SURFACE_V1, normals: true, normalsProfile: { ...SURFACE_V1, toleranceFloor: 0, toleranceFactor: 2 ** -40 } });
  const zero = await frame({ label: 'constant-zero', modelId: 'constant', camera: sphereCamera, effective: { distance: 0 }, internalSize: { width: 32, height: 18 }, region: { x: 0, y: 0, width: 32, height: 18 },
    sampling: { seed: 1, sampleIndex: 0 }, profile: SURFACE_V1, normals: true, traceId: 'trace_band:constant', normalsId: 'normals_band:constant' });
  // Under surface-v1 a C = 0 hit lies about 2τ outside the unit ball, so ε = 0.5τ samples stay outside
  // (every normal must be available); a test-only normals profile with 8× the hit factor (ε = 4τ) puts
  // samples inside (unavailable). Both are predicted per pixel.
  const BALL_PROFILES = { surface: SURFACE_V1, wide: { ...SURFACE_V1, toleranceFactor: 4 } }, balls = {};
  for (const [name, normalsProfile] of Object.entries(BALL_PROFILES)) balls[name] = await frame({ label: `quaternion-unit-ball-${name}`, modelId: 'quaternion-julia', camera: sphereCamera,
    effective: { C: [0, 0, 0, 0], kappa: 0 }, internalSize: sphereSize, region: full, sampling: { seed: 1, sampleIndex: 0 }, profile: SURFACE_V1, normals: true, normalsProfile });
  // B11b (rev 5.0 one-sided fallback): box and Menger stencils at chosen positions under test-only normals
  // profiles (ε = toleranceFloor / 2), predicted per pixel in binary64 (tests/support/visual-acceptance.mjs).
  const va = await import('./support/visual-acceptance.mjs');
  const probeSize = { width: 64, height: 36 }, sweep = (from, to, n) => Array.from({ length: n }, (_, k) => from + (to - from) * k / (n - 1));
  const tunnelCamera = camera.lookAt({ ...SPACE_DEFAULTS.camera, positionLocal: [0.05, 0.03, 0.95], focusLocal: [0.1, 0.05, -1] }, [0.1, 0.05, -1]);
  const boxCamera = va.loadVisualFixture().scenes.find(x => x.id === 'box').camera, mengerCamera = va.loadVisualFixture().scenes.find(x => x.id === 'menger-1').camera;
  const STENCIL_PROBES = [
    { label: 'box-surface', modelId: 'box', effective: {}, camera: boxCamera, depths: sweep(3.9, 5.1, 25), epsilon: 0.02 },
    { label: 'menger1-surface', modelId: 'menger', effective: { depth: 1 }, camera: mengerCamera, depths: sweep(3.2, 4.6, 29), epsilon: 0.02 },
    { label: 'menger2-surface', modelId: 'menger', effective: { depth: 2 }, camera: mengerCamera, depths: sweep(3.2, 4.6, 29), epsilon: 0.01 },
    { label: 'menger1-tunnel', modelId: 'menger', effective: { depth: 1 }, camera: tunnelCamera, depths: sweep(0.2, 0.9, 8), epsilon: 0.2 },
    { label: 'menger1-tunnel-wide', modelId: 'menger', effective: { depth: 1 }, camera: tunnelCamera, depths: sweep(0.2, 0.9, 8), epsilon: 0.4 },
  ];
  const stencilRuns = [];
  for (const probe of STENCIL_PROBES) {
    const profile = { ...SURFACE_V1, toleranceFloor: 2 * probe.epsilon, toleranceFactor: 0 };
    stencilRuns.push({ probe, runs: await ev(page, stencilProbeInPage, { ...probe, size: probeSize, profile }, `stencil ${probe.label}`, LIMITS.deep) });
  }
  const stencil = { disagreements: [], directionErrors: [], directionErrorCount: 0, worstRadians: 0, modes: {}, expected: { available: 0, unavailable: 0, ambiguous: 0 }, depthChanged: 0 };
  for (const { probe, runs } of stencilRuns) for (const run of runs) {
    const normals = passes.decodeNormals(bytes(run.normal), probeSize.width * probeSize.height), depths = passes.decodeDepths(bytes(run.depth));
    normals.forEach((n, k) => {
      if (depths[k] !== Math.fround(run.t)) stencil.depthChanged++;
      const d = camera.rayDirection(probe.camera, k % probeSize.width, Math.floor(k / probeSize.width), probeSize.width, probeSize.height);
      const p = probe.camera.positionLocal.map((o, axis) => o + Math.fround(run.t) * d[axis]);
      const prediction = va.predictStencilNormal(probe.modelId, p, probe.epsilon, probe.effective.depth);
      stencil.expected[prediction.expected]++;
      if (prediction.expected === 'ambiguous') return;
      const key = prediction.reason ?? prediction.modes.filter(m => m !== 'central').length + '-one-sided';
      stencil.modes[`${probe.modelId}:${key}`] = (stencil.modes[`${probe.modelId}:${key}`] ?? 0) + 1;
      if (n.available !== (prediction.expected === 'available')) { if (stencil.disagreements.length < 8) stencil.disagreements.push({ probe: probe.label, t: run.t, k, expected: prediction, available: n.available }); return; }
      if (!n.available) return;
      // Finite, nonzero components and a finite angle within 1e-3 rad (Codex B11b-F4: NaN fails `angle > limit`).
      const error = va.stencilDirectionError(n.normal, prediction.normal, 1e-3);
      if (!error) stencil.worstRadians = Math.max(stencil.worstRadians, va.angleBetween(n.normal, prediction.normal));
      else { stencil.directionErrorCount++; if (stencil.directionErrors.length < 8) stencil.directionErrors.push({ probe: probe.label, t: run.t, k, ...error, normal: n.normal, expected: prediction.normal }); }
    });
  }
  stencil.positions = stencil.expected.available + stencil.expected.unavailable + stencil.expected.ambiguous;
  stencil.compared = stencil.positions - stencil.expected.ambiguous;
  report.push({ name: 'B11b one-sided normal stencil probes (recorded; part of the normals pass)', probes: STENCIL_PROBES.map(p => ({ ...p, camera: undefined })), ...stencil });

  check(RENDERING_PASSES[4], () => {
    // (e) B11b, rev 5.0: box and Menger normals follow the one-sided stencil — central where both endpoints resolve,
    // one-sided against the resolved centre where exactly one is an analytic interior (edges, corners, tunnel walls),
    // unavailable where both are or the needed centre is interior — in the predicted direction, and depth is kept.
    assert.deepEqual(stencil.disagreements, [], `stencil availability disagrees with the prediction: ${JSON.stringify(stencil.disagreements.slice(0, 3))}`);
    assert.equal(stencil.directionErrorCount, 0, 'every compared one-sided normal is finite and within 1e-3 rad');
    assert.deepEqual(stencil.directionErrors, [], `one-sided normals off the predicted direction: ${JSON.stringify(stencil.directionErrors.slice(0, 3))}`);
    assert.equal(stencil.depthChanged, 0, 'the normals pass leaves every placed depth unchanged');
    for (const key of ['box:1-one-sided', 'menger:1-one-sided', 'menger:2-one-sided', 'menger:both-interior', 'menger:centre-interior', 'box:0-one-sided', 'menger:0-one-sided']) {
      assert.ok((stencil.modes[key] ?? 0) > 0, `stencil case ${key} is exercised: ${JSON.stringify(stencil.modes)}`);
    }
    const preserved = run => { assert.equal(run.depthAfter, run.depth, 'the normals pass leaves depth unchanged'); assert.equal(run.statusAfter, run.status, 'and status unchanged'); };
    [sphereRun, collapsed, zero, ...Object.values(balls)].forEach(preserved);
    const normalsOf = (run, count) => passes.decodeNormals(bytes(run.normal), count);
    // (a) Sphere: within 1e-3 rad of the exact gradient p/|p| on >= 99 % of hits; non-hits unavailable.
    const n = normalsOf(sphereRun, centre.decoded.length);
    let hits = 0, good = 0, worst = 0, unavailableHits = 0;
    centre.decoded.forEach((r, k) => {
      if (r.status !== 'approximate hit') { assert.equal(n[k].available, false, `non-hit pixel ${k} has no normal`); return; }
      hits++;
      if (!n[k].available) { unavailableHits++; return; }
      const d = camera.rayDirection(sphereCamera, k % sphereSize.width, Math.floor(k / sphereSize.width), sphereSize.width, sphereSize.height);
      const p = worldOrigin.map((o, axis) => o + r.t * d[axis]), angle = tracing.angleBetween(n[k].normal, p);
      worst = Math.max(worst, angle); good += Number(angle <= 1e-3);
    });
    assert.ok(100 * good >= 99 * hits, `sphere normals: ${good} of ${hits} hits within 1e-3 rad`);
    // (b) ε below the effective position resolution: every hit keeps its depth and status, no normal.
    const c = normalsOf(collapsed, centre.decoded.length), collapsedFrame = decodeFrame(collapsed, centre.decoded.length);
    const collapsedHits = collapsedFrame.filter(r => r.status === 'approximate hit').length;
    assert.ok(collapsedHits > 10000 && c.every(x => !x.available), 'indistinguishable sample positions make every normal unavailable');
    // (c) A zero gradient: the constant zero field hits at entry, all samples resolve, the gradient is zero.
    const zeroFrame = decodeFrame(zero, 32 * 18), zn = normalsOf(zero, 32 * 18);
    const zeroHits = zeroFrame.filter(r => r.status === 'approximate hit').length;
    assert.ok(zeroHits > 0 && zn.every(x => !x.available), 'a zero gradient makes the normal unavailable');
    // (d) Unresolved samples: for C = 0 the slice κ = 0 is the unit ball and a sample is not escaped iff
    // |q| <= 1. Predicted from the GPU depth in binary64 with a 1e-5 margin; ambiguous pixels are skipped.
    const alpha = 2 * Math.tan(Math.PI / 6) / sphereSize.height, prediction = { unavailable: 0, available: 0, ambiguous: 0, disagreements: [] }, byProfile = {};
    for (const [name, profile] of Object.entries(BALL_PROFILES)) {
      const ballFrame = decodeFrame(balls[name], centre.decoded.length), bn = normalsOf(balls[name], centre.decoded.length), before = { ...prediction };
      ballFrame.forEach((r, k) => {
        if (r.status !== 'approximate hit') return;
        const d = camera.rayDirection(sphereCamera, k % sphereSize.width, Math.floor(k / sphereSize.width), sphereSize.width, sphereSize.height);
        const p = worldOrigin.map((o, axis) => o + r.t * d[axis]), eps = 0.5 * Math.max(profile.toleranceFloor, profile.toleranceFactor * alpha * r.t);
        const radii = [0, 1, 2].flatMap(axis => [1, -1].map(sign => Math.hypot(...p.map((v, i) => v + (i === axis ? sign * eps : 0)))));
        const expected = radii.some(radius => radius < 1 - 1e-5) ? false : radii.every(radius => radius > 1 + 1e-5) ? true : null;
        if (expected === null) { prediction.ambiguous++; return; }
        prediction[expected ? 'available' : 'unavailable']++;
        if (bn[k].available !== expected) prediction.disagreements.push({ profile: name, k, expected, actual: bn[k].available, radii });
      });
      byProfile[name] = { available: prediction.available - before.available, unavailable: prediction.unavailable - before.unavailable, ambiguous: prediction.ambiguous - before.ambiguous };
    }
    assert.deepEqual(prediction.disagreements.slice(0, 5), [], `${prediction.disagreements.length} unit-ball normals disagree with the sample-resolution prediction`);
    assert.ok(prediction.unavailable > 100 && prediction.available > 100, `both outcomes exercised: ${JSON.stringify(byProfile)}`);
    return { sphere: { hits, good, unavailableHits, worstRad: worst }, collapsed: { hits: collapsedHits }, zeroGradient: { hits: zeroHits }, unitBall: { byProfile, disagreements: prediction.disagreements.length },
      oneSided: { modes: stencil.modes, expected: stencil.expected, worstRadians: stencil.worstRadians } };
  });

  // 7. Usability: the quaternion default view at 160 × 90 against B04's binary64 prediction.
  const settings = usability.settings;
  const usabilityRun = await frame({ label: 'usability', modelId: settings.model, camera: settings.camera, effective: settings.effective, internalSize: { width: settings.width, height: settings.height },
    region: { x: 0, y: 0, width: settings.width, height: settings.height }, sampling: { seed: 0, sampleIndex: 0 }, profile: { ...SURFACE_V1, maxIterations: settings.maxIterations, maxSteps: settings.maxSteps } });
  const usabilityResult = tracing.compareUsability(usability, decodeFrame(usabilityRun, settings.width * settings.height));
  results.push({ id: records.USABILITY_STRATUM, kind: 'usability', role: 'mandatory', state: usabilityResult.passed ? 'passed' : 'failed', passed: usabilityResult.passed, ...usabilityResult });
  check(RENDERING_PASSES[6], () => {
    assert.equal(usabilityResult.passed, true, JSON.stringify(usabilityResult.rows));
    return usabilityResult;
  });

  // 8. Pick through the B09 renderer.
  const picked = await ev(page, pickInPage, undefined, 'renderer pick', LIMITS.deep);
  check(RENDERING_PASSES[7], () => {
    assert.equal(picked.first.outcome, 'completed', JSON.stringify(picked.first)); assert.equal(picked.second.outcome, 'completed');
    assert.equal(picked.fresh.status, 'approximate hit', JSON.stringify(picked.fresh));
    const resolved = passes.resolvePick(picked.fresh);
    assert.equal(resolved.status, 'resolved', JSON.stringify(resolved));
    assert.deepEqual(resolved.point.anchor, picked.camera.anchor);
    // The pinned sample's depth against the analytic sphere along the same ray, and the reconstructed hit's distance.
    const { pixel, jitter, dimensions } = picked.fresh.sample;
    const d = camera.rayDirection(picked.camera, pixel[0], pixel[1], dimensions.width, dimensions.height, jitter), o = picked.camera.positionLocal;
    const b = o.reduce((sum, v, i) => sum + v * d[i], 0), c = o.reduce((sum, v) => sum + v * v, 0) - 1, exact = -b - Math.sqrt(b * b - c);
    const tau = Math.max(1e-6, 0.5 * (2 * Math.tan(Math.PI / 6) / dimensions.height) * picked.fresh.depth);
    assert.ok(exact - picked.fresh.depth >= -1e-5 && exact - picked.fresh.depth <= tau + 1e-5, `pick depth ${picked.fresh.depth} vs analytic ${exact} (τ ${tau})`);
    const radius = Math.hypot(...resolved.point.positionLocal);
    assert.ok(radius - 1 >= -1e-5 && radius - 1 <= tau + 1e-5, `reconstructed hit at radius ${radius}`);
    assert.deepEqual(passes.resolvePick(picked.corner), { status: 'unresolved', reason: 'no-hit', rayStatus: 'miss' });
    for (const [why, value] of Object.entries(picked.stale)) assert.deepEqual(value, { stale: true }, `a pick with a mismatched ${why} is rejected`);
    assert.equal(picked.current.status, 'approximate hit', 'the current request picks');
    assert.equal(picked.current.depth, picked.fresh.depth, 'the same geometry gives the same pinned depth');
    return { size: picked.size, fresh: { depth: picked.fresh.depth, exact, tau, radius, pixel, jitter }, stale: Object.keys(picked.stale), publications: picked.publications, reports: picked.reports };
  });

  // ---- B11: shading, accumulation, display and the complete product set ----
  const appearance = await import('../src/space/render/webgpu/appearance.js');
  const status = await import('../src/space/render/status.js');
  const { resolveQuality } = await import('../src/space/render/profiles.js');
  const { createSpaceScene } = await import('../src/space/scene-adapter.js');
  const { effectiveParameters } = await import('../src/space/numerics/parameters.js');
  const appearanceSetup = await ev(page, appearanceSetupInPage, undefined, 'appearance setup', LIMITS.deep);
  report.push({ name: 'Appearance pipelines and fixtures prepared on the rendering backend (recorded)', ...appearanceSetup });

  const { classifyCamera, getModel } = await import('../src/space/models/registry.js');
  const { encodeOrdinaryOrigin } = await import('../src/space/camera.js');
  const far = [1.92, -1.44, 0.7], lateEscape = [-0.15, -0.15, -0.45];
  const classificationCases = [
    { label: 'bulb-inside', model: 'mandelbulb', point: [0.1, 0.1, 0.1], expected: 'unresolved' },
    { label: 'bulb-origin', model: 'mandelbulb', point: [0, 0, 0], expected: 'unresolved' },
    { label: 'bulb-far', model: 'mandelbulb', point: far, expected: 'exterior' },
    { label: 'menger-solid', model: 'menger', point: [0.8, 0.8, 0.8], expected: 'unresolved' },
    { label: 'menger-centre-hole', model: 'menger', point: [0, 0, 0], expected: 'exterior' },
    { label: 'menger-far', model: 'menger', point: far, expected: 'exterior' },
    { label: 'menger-d2-solid', model: 'menger', parameters: { depth: 2 }, point: [0.9, 0.9, 0.9], expected: 'unresolved' },
    { label: 'menger-d2-centre-hole', model: 'menger', parameters: { depth: 2 }, point: [0, 0, 0], expected: 'exterior' },
    { label: 'sphere-inside', model: 'sphere', point: [0, 0, 0.2], expected: 'unresolved' },
    { label: 'sphere-far', model: 'sphere', point: far, expected: 'exterior' },
    { label: 'box-inside', model: 'box', point: [0, 0, 0], expected: 'unresolved' },
    { label: 'box-far', model: 'box', point: far, expected: 'exterior' },
    { label: 'qjulia-inside', model: 'quaternion-julia', point: [0, 0, 0], expected: 'unresolved' },
    { label: 'qjulia-far', model: 'quaternion-julia', point: far, expected: 'exterior' },
    { label: 'bulb-late-escape-draft', model: 'mandelbulb', parameters: { power: '2' }, point: lateEscape, expected: 'unresolved' },
    { label: 'bulb-late-escape-settled', model: 'mandelbulb', parameters: { power: '2' }, point: lateEscape, profile: 'settled', expected: 'exterior' },
  ].map(spec => {
    const base = createSpaceScene({ model: spec.model, ...(spec.parameters ? { parameters: spec.parameters } : {}) });
    const scene = createSpaceScene({ model: spec.model, parameters: base.parameters,
      camera: { ...base.camera, positionLocal: spec.point, focusLocal: spec.point.map((value, axis) => value - (axis === 2 ? 1 : 0)) },
      iteration: { ...base.iteration, maxIterations: 128 }, sampling: { ...base.sampling, targetSamples: 1 },
      appearance: { ...base.appearance, lightingQuality: 'direct' } });
    const profile = spec.profile ?? 'draft', cap = resolveQuality(scene, profile, { width: 32, height: 18 }).iteration.maxIterations;
    const effective = effectiveParameters(spec.model, scene.parameters).effective, point = encodeOrdinaryOrigin(scene.camera).highF32;
    const cpu = classifyCamera(getModel(spec.model, 1), effective, point, cap);
    return { ...spec, scene, profile, cap, point, cpu };
  });
  const classified = await ev(page, classifyCamerasInPage, classificationCases.map(({ label, scene, profile }) => ({ label, scene, profile })),
    'product camera classification', LIMITS.deep);
  check(RENDERING_PASSES[8], () => {
    assert.equal(classified.length, classificationCases.length);
    const rows = classified.map((row, index) => {
      const spec = classificationCases[index];
      assert.equal(row.label, spec.label); assert.equal(row.render, 'completed', `${row.label}: ${row.renderReason}`);
      assert.equal(spec.cpu.status, spec.expected, `${row.label}: the CPU fixture must distinguish exterior from unresolved`);
      assert.equal(row.cap, spec.cap); assert.equal(row.result.stale, undefined, row.label);
      assert.equal(row.result.detail?.error, undefined, `${row.label}: ${JSON.stringify(row.result)}`);
      assert.equal(row.result.status, spec.cpu.status, `${row.label}: ${JSON.stringify(row.result)}`);
      assert.deepEqual(row.submissions, [{ pipelineId: `points-${spec.model}`, cap: spec.cap, iterations: spec.cap }], row.label);
      assert.ok(row.result.detail?.result, `${row.label}: retain the decoded GPU result`);
      return { ...row, model: spec.model, profile: spec.profile, point: spec.point, cpu: spec.cpu };
    });
    return { rows };
  });

  const u32s = b64 => { const b = bytes(b64); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
  const f32s = b64 => { const b = bytes(b64); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
  const normalAvailability = b64 => passes.decodeNormals(bytes(b64), bytes(b64).byteLength / 8);
  const captureOf = (job, ordinal) => { const pixels = job.quality.internalSize.width * job.quality.internalSize.height, all = bytes(job.captures); return all.subarray(4 * pixels * ordinal, 4 * pixels * (ordinal + 1)); };
  const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
  const differing = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  const job = spec => ev(page, rendererJobInPage, spec, `renderer job ${spec.label}`, LIMITS.deep);
  const direct = spec => ev(page, passesInPage, spec, `passes ${spec.label}`, LIMITS.deep);
  const F = appearance.ACCUMULATION_FLAGS, legendOf = name => appearance.legendBytes(status.LEGEND[name]);
  // Per-sample flags from the renderer's own readbacks of one ordinal.
  const ordinalFlags = (run, ordinal) => {
    const frame = run.frames[ordinal], words = u32s(frame.status), lights = u32s(frame.lightingStatus), normals = normalAvailability(frame.normal);
    return Array.from(words, (word, i) => appearance.sampleFlags({ statusWord: word, normalAvailable: normals[i].available, lightingWord: lights[i] }));
  };
  const orFlags = (run, ordinals) => ordinals.map(o => ordinalFlags(run, o)).reduce((acc, list) => acc.map((v, i) => v | list[i]));
  // Every pixel whose accumulated flags name a legend shows that legend's bytes exactly.
  const legendMismatches = (displayBytes, flags, viewMode) => {
    const bad = [];
    for (let i = 0; i < flags.length; i++) {
      const legend = appearance.displayLegend(flags[i], viewMode); if (!legend) continue;
      const got = [...displayBytes.subarray(4 * i, 4 * i + 4)], want = legendOf(legend);
      if (got.join() !== want.join()) bad.push({ pixel: i, legend, got, want });
    }
    return bad;
  };

  // 6 first in time: the product set was prepared on a fresh device before anything else in this page.
  check(APPEARANCE_PASSES[5], () => {
    const p = productPreparation;
    assert.deepEqual(p.preparedPipelineIds, p.required, 'every product pipeline was prepared, in descriptor order');
    assert.deepEqual(p.required, appearance.productPipelineDescriptors().map(d => d.pipelineId), 'the served product set is the checkout\'s');
    assert.equal(p.pipelineSetId, appearance.PRODUCT_PIPELINE_SET_ID);
    assert.deepEqual(p.verify, { ok: true, missing: [] });
    assert.deepEqual(p.verifyMissing, { ok: false, missing: ['shade_band:menger'] }, 'a missing variant is reported');
    assert.ok(p.preparationMs > 0 && p.preparationMs < p.boundMs, `preparation ${p.preparationMs} ms within the ${p.boundMs} ms bound`);
    assert.equal(p.events[0].stage, 'preparing');
    assert.equal(p.events.length, p.required.length + 1, 'one progress event per prepared pipeline');
    assert.deepEqual(p.events.slice(1).map(e => e.completed), p.required.map((_, i) => i + 1));
    assert.deepEqual([...new Set(p.events.slice(1).map(e => e.stage))].sort(), [...p.required].sort());
    assert.deepEqual(p.uncaptured, []);
    assert.deepEqual(p.implementationHashes, appearance.appearanceImplementationHashes(), 'the served appearance metadata is the checkout\'s');
    return { preparationMs: p.preparationMs, boundMs: p.boundMs, pipelines: p.required.length, lastCompletionMs: p.events.at(-1).atMs };
  });

  // Settled full-quality Menger (depth 1; shadows and AO), fresh and on poisoned targets; a direct-only
  // reference; the same samples driven directly in permuted band orders; a job cancelled after its third image.
  const size = { width: 320, height: 180 }, pixels = size.width * size.height, captureFields = ['status', 'normal', 'lightingStatus'];
  const fullA = await job({ label: 'menger-full', model: 'menger', size, captureFields });
  const fullP = await job({ label: 'menger-full-poisoned', model: 'menger', size, captureFields, poison: true });
  const directOnly = await job({ label: 'menger-direct', model: 'menger', size, appearance: { lightingQuality: 'direct' }, sampling: { targetSamples: 1 }, captureFields });
  const cancelled = await job({ label: 'menger-cancelled', model: 'menger', size, cancelAfter: 3 });
  const mengerScene = createSpaceScene({ model: 'menger' }), mengerQuality = resolveQuality(mengerScene, 'settled', size);
  const permuted = await direct({ label: 'menger-permuted', modelId: 'menger', camera: mengerScene.camera, effective: effectiveParameters('menger', mengerScene.parameters).effective,
    internalSize: mengerQuality.internalSize, profile: { ...mengerQuality.iteration, ...mengerQuality.tracing }, lighting: mengerQuality.lighting, viewMode: 'shaded',
    samples: 8, seed: mengerQuality.sampling.seed, geometry: 'trace', bandRows: 37, order: 'permuted' });
  report.push({ name: 'Settled Menger jobs (recorded)', jobs: [fullA, fullP, directOnly, cancelled].map(r => ({ outcome: r.outcome, reason: r.reason, presents: r.presents, publications: r.publications,
    samples: r.report?.samples, milestones: r.report?.milestones, lightingFailures: r.report?.lightingFailures, rayTermination: r.report?.rayTermination,
    accumulateRegionsPerSample: Object.values(r.batches.filter(b => b.pass === 'accumulate').reduce((acc, b) => ({ ...acc, [b.ordinal]: (acc[b.ordinal] ?? 0) + 1 }), {})) })) });

  check(APPEARANCE_PASSES[0], () => {
    assert.equal(fullA.outcome, 'completed', fullA.reason);
    assert.deepEqual(fullA.report.samples, { target: 8, completed: 8 });
    const sums = f32s(fullA.accumulation);
    for (let i = 0; i < pixels; i++) assert.equal(sums[4 * i + 3], 8, `pixel ${i}: eight samples accumulated`);
    // The same eight samples, driven band by band in permuted orders with other band shapes, are bit-identical.
    assert.ok(same(bytes(fullA.accumulation), bytes(permuted.accumulation)), 'accumulation bit-identical across completion orders');
    assert.ok(same(bytes(fullA.flags), bytes(permuted.flags)), 'flags identical across completion orders');
    assert.ok(same(captureOf(fullA, 8), bytes(permuted.display)), 'display identical across completion orders');
    // Seeded jitter: sample 0 is the centre geometry; later samples move the silhouette.
    const hitFrames = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8].map(o => [o, Array.from(u32s(fullA.frames[o].status), w => (w & 15) === 0)])), hits = o => hitFrames[o];
    assert.deepEqual(hits(1), hits(0), 'the full sequence starts from the centre sample');
    const moved = [2, 3, 4, 5, 6, 7, 8].map(o => differing(hits(o), hits(1)));
    assert.ok(moved.every(n => n > 0), `each jittered sample moves the silhouette (${moved})`);
    let mixed = 0;
    for (let i = 0; i < pixels; i++) { const n = [1, 2, 3, 4, 5, 6, 7, 8].filter(o => hits(o)[i]).length; if (n > 0 && n < 8) mixed++; }
    assert.ok(mixed > 0, 'antialiased edge pixels mix hits and misses');
    // A sample count below the target leaves a complete image reported as partial quality, never pending.
    assert.equal(cancelled.outcome, 'cancelled', cancelled.reason);
    assert.equal(cancelled.publications.length, 3);
    assert.ok(cancelled.report.samples.completed < cancelled.report.samples.target, JSON.stringify(cancelled.report.samples));
    assert.equal(cancelled.report.samples.completed, cancelled.publications.at(-1).samples);
    assert.ok([...fullA.publications, ...cancelled.publications].every(p => p.pending === false));
    assert.ok(!cancelled.statuses.some(e => e.pending === true), 'no pending mark for a partial-quality image');
    for (let o = 0; o < Math.min(cancelled.presents, 9); o++) { const image = captureOf(cancelled, o); for (let i = 3; i < image.length; i += 4) assert.equal(image[i], 255, `ordinal ${o}: a complete image`); }
    return { samples: fullA.report.samples, mixedEdgePixels: mixed, silhouetteMovedPerSample: moved, permutedBandRows: 37, cancelled: cancelled.report.samples };
  });

  check(APPEARANCE_PASSES[1], () => {
    const pubs = fullA.publications;
    assert.deepEqual(pubs.map(p => p.kind), ['settled-first', ...Array(8).fill('refinement')]);
    assert.deepEqual(pubs.map(p => p.stage), ['direct', ...Array(8).fill('full')]);
    assert.deepEqual(pubs.map(p => p.samples), [1, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(pubs[0].shadowSteps, 0); assert.equal(pubs[0].aoSamples, 0);
    assert.ok(pubs.slice(1).every(p => p.accumulationKey === pubs[1].accumulationKey) && pubs[0].accumulationKey !== pubs[1].accumulationKey, 'two accumulation identities');
    assert.ok(pubs.every((p, i) => i === 0 || p.publishedAt >= pubs[i - 1].publishedAt));
    assert.ok(fullA.report.milestones.settledFirstImageMs < fullA.report.milestones.fullQualityMs, JSON.stringify(fullA.report.milestones));
    // The direct-light image is the direct-light accumulation alone; no secondary work enters it.
    const shades = fullA.batches.filter(b => b.pass === 'shade');
    assert.ok(shades.filter(b => b.ordinal === 0).every(b => b.lightingStage === 0 && b.shadowSteps === 0 && b.aoSamples === 0 && b.shadowRays === 0));
    assert.ok(shades.filter(b => b.ordinal > 0).every(b => b.lightingStage === 1 && b.shadowSteps === 64 && b.aoSamples === 5 && b.shadowRays === 1));
    assert.ok(u32s(fullA.frames[0].lightingStatus).every(w => w === 0), 'the direct sample has no lighting-failure word');
    assert.ok(same(captureOf(fullA, 0), captureOf(directOnly, 0)), 'the settled-first image equals a direct-only job\'s');
    assert.ok(directOnly.batches.filter(b => b.pass === 'shade').every(b => b.lightingStage === 0 && b.shadowSteps === 0 && b.aoSamples === 0));
    // Full quality: eight full-light samples only (the count is 8, not 9) and visibly different lighting.
    const sums = f32s(fullA.accumulation);
    assert.ok(Array.from({ length: pixels }, (_, i) => sums[4 * i + 3]).every(n => n === 8));
    const darkened = differing(captureOf(fullA, 0), captureOf(fullA, 1));
    assert.ok(darkened > 0, 'shadows and AO change the full-light image');
    return { milestones: fullA.report.milestones, publications: pubs.map(p => `${p.kind}/${p.stage}/${p.samples}`), changedBytesDirectToFull: darkened, lightingFailures: fullA.report.lightingFailures };
  });

  check(APPEARANCE_PASSES[6], () => {
    assert.equal(fullP.outcome, 'completed', fullP.reason);
    const regions = fullA.batches.filter(b => b.pass === 'accumulate' && b.sample === 0);
    assert.ok(regions.filter(b => b.ordinal === 0).length > 1 && regions.filter(b => b.ordinal === 1).length > 1, 'sample 0 is subdivided into several regions');
    for (let o = 0; o < 9; o++) assert.ok(same(captureOf(fullP, o), captureOf(fullA, o)), `ordinal ${o}: the image on poisoned targets equals the fresh one`);
    assert.ok(same(bytes(fullP.accumulation), bytes(fullA.accumulation)), 'final accumulation equals a fresh allocation');
    assert.ok(same(bytes(fullP.flags), bytes(fullA.flags)), 'final flags equal a fresh allocation');
    return { ordinals: 9, sample0Regions: { direct: regions.filter(b => b.ordinal === 0).length, full: regions.filter(b => b.ordinal === 1).length }, poison: 'accumulation (±1e30, …) and flags 0xffffffff' };
  });

  // Synthetic geometry (fixture-pattern) through the product diagnostic, shade, accumulate and display passes.
  const patternSize = { width: 52, height: 16 }, PATTERN = 13;
  const patternSample = (x, y, s) => {
    const kind = Math.floor(x / 4) % PATTERN, steps = (x * 7 + y * 3) % 512, mine = y % 8 === s;
    const table = { 1: [1, 0, 0], 2: [2, 1, 0], 3: [2, 2, 0], 4: [2, 2, 1], 5: [2, 3, 0], 6: [2, 4, 1], 7: [2, 4, 2], 8: [3, 0, 0], 9: [0, 0, 0], 10: mine ? [2, 3, 0] : [0, 0, 0], 11: mine ? [3, 0, 0] : [0, 0, 0], 12: [0, 0, 0] };
    const [st, reason, subreason] = table[kind] ?? [0, 0, 0];
    const available = st === 0 && kind !== 9 && !(kind === 12 && mine);
    return { kind, statusWord: status.packStatus({ status: st, reason, subreason, steps }), normalAvailable: available, steps, hit: st === 0, miss: st === 1 };
  };
  const interior = camera.lookAt({ ...SPACE_DEFAULTS.camera, positionLocal: [0.2, -0.1, 0.1], focusLocal: [1, 0, 0] }, [1, 0, 0]);
  const patternProfile = { maxIterations: 128, maxSteps: 512, stepMultiplier: 0.9, toleranceFloor: 1e-6, toleranceFactor: 0.5 };
  const directLighting = { stage: 'direct', normalFieldSamples: 6, shadowRays: 0, shadowSteps: 0, aoSamples: 0 };
  const patternRuns = {};
  for (const samples of [1, 8]) for (const viewMode of VIEW_MODE_LIST) {
    patternRuns[`${viewMode}/${samples}`] = await direct({ label: `pattern-${viewMode}-${samples}`, modelId: 'sphere', camera: interior, effective: {}, internalSize: patternSize,
      profile: patternProfile, lighting: directLighting, viewMode, samples, seed: 1, geometry: 'pattern', bandRows: 5, order: 'permuted' });
  }
  const expectedPatternFlags = samples => Array.from({ length: patternSize.width * patternSize.height }, (_, i) => {
    const x = i % patternSize.width, y = Math.floor(i / patternSize.width);
    let flags = 0; for (let s = 0; s < samples; s++) flags |= appearance.sampleFlags({ ...patternSample(x, y, s), lightingWord: 0 });
    return flags;
  });

  check(APPEARANCE_PASSES[2], () => {
    const expected = expectedPatternFlags(1), details = {};
    for (const viewMode of VIEW_MODE_LIST) {
      const run = patternRuns[`${viewMode}/1`], display = bytes(run.display), code = appearance.VIEW_MODE_CODES[viewMode];
      assert.deepEqual([...u32s(run.flags)], expected, `${viewMode}: accumulated flags`);
      assert.deepEqual(legendMismatches(display, expected, code), [], `${viewMode}: legend colours`);
      let legend = 0, exact = 0, approx = 0;
      for (let i = 0; i < expected.length; i++) {
        const x = i % patternSize.width, y = Math.floor(i / patternSize.width), p = patternSample(x, y, 0), got = [...display.subarray(4 * i, 4 * i + 4)];
        if (appearance.displayLegend(expected[i], code)) { legend++; continue; }
        assert.equal(got[3], 255);
        if (viewMode === 'termination') { assert.deepEqual(got.slice(0, 3), appearance.TERMINATION_COLOURS[p.hit ? 'hit' : 'miss'], `termination pixel ${x},${y}`); exact++; }
        else if (p.miss && viewMode !== 'steps' && viewMode !== 'shaded') { assert.deepEqual(got.slice(0, 3), appearance.TERMINATION_COLOURS.miss, `${viewMode} miss ${x},${y}`); exact++; }
        else if (viewMode === 'normals') { [0.5, 0.800048828125, 0.89990234375].forEach((v, k) => assert.ok(Math.abs(got[k] - v * 255) <= 1, `normal byte ${got}`)); approx++; }
        else if (viewMode === 'steps') {
          const cost = Math.min(1, p.steps / 512), low = [0.05, 0.08, 0.3], high = [1, 0.85, 0.2];
          low.forEach((l, k) => assert.ok(Math.abs(got[k] - (l + (high[k] - l) * cost) * 255) <= 1, `cost ramp ${x},${y}: ${got}`)); approx++;
        } else if (viewMode === 'depth' && p.hit) {
          // An unavailable normal keeps its depth: a grey value, never the unavailable-normal legend.
          assert.ok(got[0] === got[1] && got[1] === got[2], `depth is grey ${got}`); approx++;
        }
      }
      details[viewMode] = { legend, exact, approx };
    }
    // Every status word reaches its legend: the unresolved reasons and subreasons, numerical failure, the unavailable normal.
    const kinds = viewMode => { const run = patternRuns[`${viewMode}/1`], display = bytes(run.display); return Object.fromEntries(Array.from({ length: PATTERN }, (_, k) => [k, [...display.subarray(4 * 4 * k, 4 * 4 * k + 4)].join()])); };
    for (const viewMode of VIEW_MODE_LIST) {
      const seen = kinds(viewMode);
      for (const k of [2, 3, 4, 5, 6, 7]) assert.equal(seen[k], legendOf('unresolved').join(), `${viewMode}: ${PATTERN_CLASSES[k]} is the unresolved legend`);
      assert.equal(seen[8], legendOf('numericalFailure').join(), `${viewMode}: numerical failure legend`);
      assert.equal(seen[9] === legendOf('unavailableNormal').join(), viewMode === 'shaded' || viewMode === 'normals', `${viewMode}: unavailable-normal legend only where the normal is shown`);
    }
    return details;
  });

  // The product half of the survival check: a bulb whose 40-step budget leaves some rays unresolved in some samples only.
  const survival = await job({ label: 'bulb-steps-40', model: 'mandelbulb', size: { width: 160, height: 90 }, tracing: { maxSteps: 40 }, captureFields });
  check(APPEARANCE_PASSES[4], () => {
    const expected = expectedPatternFlags(8), details = {};
    for (const viewMode of VIEW_MODE_LIST) {
      const run = patternRuns[`${viewMode}/8`], display = bytes(run.display), code = appearance.VIEW_MODE_CODES[viewMode];
      assert.deepEqual([...u32s(run.flags)], expected, `${viewMode}: flags are the OR over eight samples`);
      const accumulated = f32s(run.accumulation);
      assert.ok(Array.from({ length: expected.length }, (_, i) => accumulated[4 * i + 3]).every(n => n === 8));
      assert.deepEqual(legendMismatches(display, expected, code), [], `${viewMode}: a one-sample outcome survives accumulation`);
      for (const k of [10, 11]) for (let y = 0; y < patternSize.height; y++) {
        const i = y * patternSize.width + 4 * k;
        assert.deepEqual([...display.subarray(4 * i, 4 * i + 4)], legendOf(k === 10 ? 'unresolved' : 'numericalFailure'), `${viewMode}: ${PATTERN_CLASSES[k]} row ${y}`);
      }
      details[viewMode] = { pixels: expected.length, flagged: expected.filter(Boolean).length };
    }
    // The renderer: flags equal the OR of every full-light sample's readback; legend pixels are exact.
    assert.equal(survival.outcome, 'completed', survival.reason);
    const ordinals = [1, 2, 3, 4, 5, 6, 7, 8], orred = orFlags(survival, ordinals), flags = [...u32s(survival.flags)];
    assert.deepEqual(flags, orred, 'renderer flags are the OR of the per-sample outcomes');
    assert.deepEqual(legendMismatches(captureOf(survival, 8), flags, appearance.VIEW_MODE_CODES.shaded), []);
    const perSample = ordinals.map(o => ordinalFlags(survival, o));
    const partial = flags.filter((f, i) => f & (F.primaryUnresolved | F.primaryNumericalFailure) && perSample.some(list => !(list[i] & (F.primaryUnresolved | F.primaryNumericalFailure)))).length;
    assert.ok(partial > 0, 'some pixels are unresolved in only some samples, and keep their legend');
    details.renderer = { flagged: flags.filter(Boolean).length, unresolvedInSomeSamplesOnly: partial, rayTermination: survival.report.rayTermination };
    return details;
  });

  // Secondary failures, each forced by a full-stage shade test profile (the primary trace is the product's).
  const lightSize = { width: 160, height: 90 }, lightFields = captureFields;
  const lightJobs = {
    shadowSteps: await job({ label: 'sphere-shadow-1-step', model: 'sphere', size: lightSize, sampling: { targetSamples: 2 }, captureFields: lightFields, override: { shadowSteps: 1 } }),
    iterations: await job({ label: 'bulb-secondary-1-iteration', model: 'mandelbulb', size: lightSize, sampling: { targetSamples: 2 }, captureFields: lightFields, override: { maxIterations: 1 } }),
    numerical: await job({ label: 'sphere-secondary-overflow', model: 'sphere', size: lightSize, sampling: { targetSamples: 2 }, captureFields: lightFields, override: { toleranceFactor: 1e25 } }),
  };
  check(APPEARANCE_PASSES[3], () => {
    const details = {}, sphereBasis = camera.basis(SPACE_DEFAULTS.camera);
    const l = (() => { const v = [0, 1, 2].map(k => -0.45 * sphereBasis.right[k] + 0.6 * sphereBasis.up[k] - 0.66 * sphereBasis.forward[k]); const n = Math.hypot(...v); return v.map(c => c / n); })();
    for (const [name, run] of Object.entries(lightJobs)) {
      assert.equal(run.outcome, 'completed', `${name}: ${run.reason}`);
      const last = 2, words = u32s(run.frames[last].status), lights = u32s(run.frames[last].lightingStatus), normals = normalAvailability(run.frames[last].normal);
      const tally = { shadow: 0, ao: 0, both: 0, shadowOnly: 0, aoOnly: 0 }, reasons = {};
      for (let i = 0; i < lights.length; i++) {
        const { shadow, ao } = status.unpackLightingStatus(lights[i]);
        if (shadow || ao) assert.ok((words[i] & 15) === 0 && normals[i].available, `${name}: a lighting failure only on a lit hit (pixel ${i})`);
        if (shadow) tally.shadow++; if (ao) tally.ao++; if (shadow && ao) tally.both++; if (shadow && !ao) tally.shadowOnly++; if (ao && !shadow) tally.aoOnly++;
        for (const [which, f] of [['shadow', shadow], ['ao', ao]]) if (f) { const key = `${which}:${status.STATUS_LABELS.ray[f.status]}/${status.STATUS_LABELS.reason[f.reason]}/${f.subreason}`; reasons[key] = (reasons[key] ?? 0) + 1; }
        if (name !== 'iterations' && (words[i] & 15) === 0 && normals[i].available) {
          const nl = normals[i].normal.reduce((sum, c, k) => sum + c * l[k], 0);
          if (Math.abs(nl) < 2e-3) continue;
          if (name === 'shadowSteps') {
            assert.equal(!!shadow, nl > 0, `${name}: pixel ${i} (n·l ${nl}) fails its shadow exactly when it faces the light`);
            if (shadow) assert.deepEqual(shadow, { status: status.RAY_STATUS.unresolved, reason: status.UNRESOLVED_REASON.rayStepBudget, subreason: 0 });
            assert.equal(ao, null, `${name}: AO resolves`);
          } else {
            assert.deepEqual(ao, { status: status.RAY_STATUS.numericalFailure, reason: 0, subreason: 0 }, `${name}: AO numerical failure (pixel ${i})`);
            assert.deepEqual(shadow, nl > 0 ? { status: status.RAY_STATUS.numericalFailure, reason: 0, subreason: 0 } : null, `${name}: shadow (pixel ${i}, n·l ${nl})`);
          }
        }
      }
      // Counted: the report's lightingFailures are the last sample's words.
      assert.deepEqual(run.report.lightingFailures, { shadow: tally.shadow, ao: tally.ao, both: tally.both }, `${name}: report counts`);
      // Visibly diagnostic: the accumulated flags are the OR of the full-light samples and every flagged pixel shows its legend.
      const flags = [...u32s(run.flags)];
      assert.deepEqual(flags, orFlags(run, [1, 2]), `${name}: flags`);
      assert.deepEqual(legendMismatches(captureOf(run, 2), flags, appearance.VIEW_MODE_CODES.shaded), [], `${name}: legend pixels`);
      // Rev 5.0 (B11b, user decision 2): a lighting-only unresolved pixel keeps its shaded mean with the faint tint, on
      // every flagged pixel, and never the primary magenta.
      const image = captureOf(run, 2), sums = f32s(run.accumulation), magenta = legendOf('unresolved');
      let tintedPixels = 0;
      flags.forEach((f, i) => {
        if (!(f & (F.shadowUnresolved | F.aoUnresolved)) || appearance.displayLegend(f, appearance.VIEW_MODE_CODES.shaded)) return;
        const got = [...image.subarray(4 * i, 4 * i + 4)], sum = [...sums.subarray(4 * i, 4 * i + 4)];
        const want = appearance.expectedDisplay({ sum, flags: f, lightingStage: appearance.LIGHTING_STAGE_CODES.full, viewMode: appearance.VIEW_MODE_CODES.shaded });
        const plain = appearance.expectedDisplay({ sum, flags: 0, lightingStage: appearance.LIGHTING_STAGE_CODES.full, viewMode: appearance.VIEW_MODE_CODES.shaded });
        assert.ok(want.every((v, k) => Math.abs(v - got[k]) <= 1), `${name}: pixel ${i} shows the tinted mean ${want}, got ${got}`);
        assert.ok(got.slice(0, 3).join() !== magenta.slice(0, 3).join(), `${name}: pixel ${i} is not the primary magenta`);
        assert.ok(Math.max(...plain.map((v, k) => Math.abs(v - got[k]))) >= 2, `${name}: pixel ${i} is visibly marked`);
        tintedPixels++;
      });
      details[name] = { ...tally, reasons, tintedPixels };
    }
    assert.ok(details.shadowSteps.shadow > 0 && details.shadowSteps.ao === 0);
    assert.ok(details.numerical.both > 0 && details.numerical.aoOnly > 0, 'simultaneous numerical failures, and AO alone where the surface faces away');
    assert.ok(details.iterations.both > 0, 'a simultaneous shadow and AO failure');
    assert.ok(details.iterations.tintedPixels > 0 && details.shadowSteps.tintedPixels > 0, 'unresolved shadow and AO failures are shown with the tint');
    // A one-iteration secondary budget leaves orbits unescaped: unresolved (never numerical) failures, with the
    // point budget among the shadow and AO reasons; the distribution is recorded.
    const iterationReasons = Object.keys(details.iterations.reasons);
    assert.ok(iterationReasons.every(key => /^(shadow|ao):unresolved\//.test(key)), JSON.stringify(details.iterations.reasons));
    assert.ok(['shadow', 'ao'].every(which => iterationReasons.includes(`${which}:unresolved/point-budget/0`)), JSON.stringify(details.iterations.reasons));
    return details;
  });

  // B11b: the six frozen scenes (a required pass of this group).
  await runVisualAcceptance({ page, check });

  // Representative images for manual review (recorded only; rgba8 display bytes, base64).
  report.push({ name: 'Representative settled images (recorded, rgba8 base64)', images: [
    { label: 'menger depth 1, settled, full lighting, 8 samples', ...size, rgba: Buffer.from(captureOf(fullA, 8)).toString('base64') },
    { label: 'menger depth 1, settled-first direct light', ...size, rgba: Buffer.from(captureOf(fullA, 0)).toString('base64') },
    { label: 'mandelbulb p8, 40-step budget, full lighting, 8 samples', width: 160, height: 90, rgba: Buffer.from(captureOf(survival, 8)).toString('base64') },
    { label: 'sphere, shadow test profile (1 step): failures shown', width: 160, height: 90, rgba: Buffer.from(captureOf(lightJobs.shadowSteps, 2)).toString('base64') },
  ] });

  // Validation records: tracing per family (only when every covered mandatory stratum passed) and
  // geometric per anchor (the agreeing ladder distances only).
  const tracingRecords = records.buildTracingRecords({ results, implementationHashes: setup.implementationHashes });
  const geometric = records.buildGeometricRecords({ ladders: ladderRows, anchors: view.anchors, implementationHashes: setup.implementationHashes });
  const registry = records.createValidationRegistry();
  for (const record of [...tracingRecords.records, ...geometric.records]) registry.register(record);
  const passedIds = new Set(results.filter(row => row.passed).map(row => row.id));
  for (const recordId of records.TRACING_RECORD_IDS) assert.equal(tracingRecords.records.some(r => r.recordId === recordId), records.requiredTracingStrata(recordId).every(id => passedIds.has(id)), `${recordId} is registered iff its strata passed`);
  report.push({ name: 'Tracing and geometric validation records (recorded; registered iff their strata passed)', registered: registry.list().map(r => r.recordId),
    withheld: [...tracingRecords.withheld, ...geometric.withheld], records: registry.list() });

  const finish = await ev(page, renderingFinishInPage, undefined, 'rendering teardown');
  report.push({ name: 'Rendering teardown (recorded)', ...finish });
  assert.deepEqual(finish.uncaptured, [], `no uncaptured WebGPU errors: ${JSON.stringify(finish.uncaptured)}`);
  assert.deepEqual(failedChecks, [], `rendering checks failed: ${failedChecks.join('; ')}`);
}

// ---- the shell group (plan B14: the Space workspace in the application, `space-interaction`) ---------
// One application page on the physical GPU. The scripted gamepad replaces navigator.getGamepads before
// the application runs (no physical controller is a gate dependency). Each check is recorded; failures
// are collected so later checks still run, and the group fails if any check failed. With
// ATLAS_SHELL_SCREENSHOTS set, representative screenshots are written there (diagnostic only).
export const SHELL_PASSES = Object.freeze({
  prepare: 'The first switch to Space prepares pipelines with visible status and renders the bulb overview',
  families: 'Each family renders with its estimator category shown',
  history: 'Orbit, wheel dolly, focus, overview and flight each produce one camera-history entry',
  undo: 'Undo of a parameter edit restores the scene without moving the camera',
  file: 'A saved scene file reopens to the same scene hash',
  loss: 'A device loss during interaction recovers once and a repeated loss stops automatic retry with the scene intact',
  allocation: 'An allocation failure offers a lower-cost choice and never changes the request',
  inside: 'A camera inside the set shows the unresolved exterior status with overview and reset available',
  exportSwitch: 'Switching during a Plane export does not interrupt the export',
  blur: 'Keyboard focus, capture and flight end on blur and on switching',
  gamepad: 'A scripted gamepad orbits and flies, each run is one camera-history entry, and a disconnect stops flight',
});
const SHELL_IDLE_MS = 180_000;
const SHELL_EXPECTED_ESTIMATORS = { sphere: 'exact distance', box: 'exact distance', menger: 'exact distance', mandelbulb: 'heuristic, exterior-only', 'quaternion-julia': 'heuristic, exterior-only' };

// Installed before the application: a scripted standard-mapping pad, absent until connect().
function scriptedGamepadInit() {
  const buttons = () => Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { id: 'ATLAS scripted standard pad', index: 0, connected: false, mapping: 'standard', axes: [0, 0, 0, 0], buttons: buttons(), timestamp: 0 };
  const fire = type => { const event = new Event(type); Object.defineProperty(event, 'gamepad', { value: pad }); window.dispatchEvent(event); };
  globalThis.__pad = {
    connect() { pad.connected = true; pad.axes = [0, 0, 0, 0]; pad.buttons = buttons(); fire('gamepadconnected'); },
    disconnect() { pad.connected = false; fire('gamepaddisconnected'); },
    axes(values) { pad.axes = [...values]; pad.timestamp = performance.now(); },
    button(index, pressed) { pad.buttons[index] = { pressed, touched: pressed, value: pressed ? 1 : 0 }; pad.timestamp = performance.now(); },
  };
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: function getGamepads() { return [pad.connected ? pad : null, null, null, null]; } });
}

async function shellScreenshot(page, name, clip) {
  const dir = process.env.ATLAS_SHELL_SCREENSHOTS;
  if (!dir) return null;
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `${name}.png`);
  await within(page.screenshot({ path, ...(clip ? { clip } : {}) }), LIMITS.operation, `screenshot ${name}`);
  return path;
}
const spaceIdle = (page, label) => ev(page, ms => atlas.space.whenIdle({ timeoutMs: ms }), SHELL_IDLE_MS - 5000, `${label}: Space idle`, SHELL_IDLE_MS);
const spaceState = page => ev(page, () => ({ state: atlas.space.state, history: atlas.space.history, camera: atlas.space.scene.camera,
  sceneHash: atlas.space.sceneHash, publication: atlas.space.lastPublication }), undefined, 'Space state');
async function canvasCentre(page) {
  const box = await within(page.locator('#space-canvas').boundingBox(), LIMITS.operation, 'Space canvas box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function runShell({ page }) {
  await page.addInitScript(scriptedGamepadInit);
  await page.goto(url, { timeout: LIMITS.launch });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: LIMITS.deep });
  await idleWithin(page);
  const failedChecks = [];
  async function check(name, fn) {
    try { pass(name, await fn()); }
    catch (error) { failedChecks.push(`${name}: ${error.message}`); report.push({ name: `CHECK FAILED: ${name}`, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
  }

  await check(SHELL_PASSES.prepare, async () => {
    const result = await ev(page, async () => {
      const status = document.querySelector('#space-preparation'), texts = [], screens = [];
      // B14-F2 (spec §15): while preparing, Plane stays on screen and the status is shown over it.
      const screen = () => { const style = getComputedStyle(status);
        return { workspace: document.body.dataset.workspace ?? null, pending: document.body.dataset.workspacePending ?? null,
          plane: getComputedStyle(document.querySelector('#fractal-surface')).display,
          statusShown: !status.hidden && style.display !== 'none' && style.visibility !== 'hidden' && status.getBoundingClientRect().height > 0 }; };
      const observer = new MutationObserver(() => { if (!status.hidden && status.textContent) { texts.push(status.textContent); screens.push(screen()); } });
      observer.observe(status, { childList: true, characterData: true, subtree: true, attributes: true });
      const fresh = { factoryUsed: atlas.space.state.backendCreated, workspace: atlas.workspaces.current() };
      let presents = 0; const unsubscribe = atlas.space.onPresent(() => { presents++; });
      const started = performance.now(), switched = await atlas.workspaces.switchTo('space');
      const atReveal = { presents, published: Boolean(atlas.space.lastPublication) }; unsubscribe();
      const activatedMs = performance.now() - started;
      observer.disconnect();
      return { fresh, switched, activatedMs, texts, screens, prewarm: atlas.space.state.prewarm, eligible: atlas.space.state.eligible, visible: document.body.dataset.workspace,
        pendingAfter: document.body.dataset.workspacePending ?? null, atReveal };
    }, undefined, 'first switch to Space', LIMITS.deep);
    assert.equal(result.fresh.factoryUsed, false, 'a fresh start acquired no Space device');
    assert.equal(result.switched.outcome, 'activated', `Space activated: ${JSON.stringify(result.switched)}`);
    assert.ok(result.texts.some(text => /Preparing/i.test(text)), `preparation status was visible: ${JSON.stringify(result.texts)}`);
    const preparing = result.screens.filter((_, i) => /Preparing/i.test(result.texts[i]));
    assert.ok(preparing.length > 0 && preparing.every(entry => entry.workspace === 'plane' && entry.pending === 'space' && entry.plane !== 'none' && entry.statusShown),
      `Plane stayed on screen with the preparation status shown over it: ${JSON.stringify(preparing)}`);
    assert.deepEqual([result.visible, result.pendingAfter], ['space', null], 'Space is shown once it can present');
    assert.ok(result.atReveal.presents >= 1 && result.atReveal.published, `Space was shown only after its first presentation: ${JSON.stringify(result.atReveal)}`);
    assert.equal(result.prewarm?.ok, true, `the product set prewarmed: ${JSON.stringify(result.prewarm)}`);
    await spaceIdle(page, 'bulb overview');
    const after = await ev(page, async () => {
      const { overview } = await import('/src/space/camera.js'), { getModel } = await import('/src/space/models/registry.js');
      const { effectiveParameters } = await import('/src/space/numerics/parameters.js');
      const scene = atlas.space.scene;
      const expected = overview(getModel('mandelbulb', 1), effectiveParameters('mandelbulb', scene.parameters).effective);
      return { model: scene.model.id, overview: JSON.stringify(expected) === JSON.stringify(scene.camera), publication: atlas.space.lastPublication, sceneHash: atlas.space.sceneHash,
        estimator: document.querySelector('#space-estimator').textContent, report: atlas.space.lastReport && { outcome: atlas.space.lastReport.outcome, samples: atlas.space.lastReport.completed?.samples } };
    }, undefined, 'bulb overview publication');
    assert.equal(after.model, 'mandelbulb'); assert.equal(after.overview, true, 'the camera is overview(bulb)');
    assert.equal(after.publication?.sceneHash, after.sceneHash, 'the publication shows the current scene');
    assert.ok(after.publication.rayTermination.hit > 0, `the surface is hit: ${JSON.stringify(after.publication.rayTermination)}`);
    const screenshot = await shellScreenshot(page, 'bulb-overview');
    return { ...result, texts: [...new Set(result.texts)].slice(0, 6), publication: { kind: after.publication.kind, samples: after.publication.samples, rayTermination: after.publication.rayTermination }, report: after.report, estimator: after.estimator, screenshot };
  });

  await check(SHELL_PASSES.families, async () => {
    const families = {};
    for (const family of Object.keys(SHELL_EXPECTED_ESTIMATORS)) {
      await within(page.selectOption('#space-family', family), LIMITS.operation, `select ${family}`);
      await spaceIdle(page, family);
      const seen = await ev(page, () => ({ model: atlas.space.scene.model.id, estimator: document.querySelector('#space-estimator').textContent,
        published: atlas.space.lastPublication?.sceneHash === atlas.space.sceneHash, hits: atlas.space.lastPublication?.rayTermination.hit ?? 0,
        camera: atlas.space.history.camera, undoDepth: atlas.space.history.undoDepth }), undefined, `family ${family}`);
      assert.equal(seen.model, family); assert.equal(seen.estimator, SHELL_EXPECTED_ESTIMATORS[family], `${family} estimator category`);
      assert.equal(seen.published, true, `${family} rendered`); assert.ok(seen.hits > 0, `${family} surface hit`);
      if (family === 'menger') seen.screenshot = await shellScreenshot(page, 'menger-view');
      families[family] = seen;
    }
    await within(page.selectOption('#space-family', 'mandelbulb'), LIMITS.operation, 'select mandelbulb');
    await spaceIdle(page, 'back to the bulb');
    return { families };
  });

  await check(SHELL_PASSES.history, async () => {
    const entries = {};
    const measure = async (label, action) => {
      const before = await spaceState(page);
      await action();
      await spaceIdle(page, label);
      const after = await spaceState(page);
      entries[label] = { added: after.history.camera.length - before.history.camera.length, undo: after.history.undoDepth - before.history.undoDepth, moved: JSON.stringify(after.camera) !== JSON.stringify(before.camera) };
      assert.deepEqual([entries[label].added, entries[label].undo, entries[label].moved], [1, 0, true], `${label}: ${JSON.stringify(entries[label])}`);
    };
    const { x, y } = await canvasCentre(page);
    await measure('orbit', async () => { await page.mouse.move(x, y); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 12, y + i * 3); await page.mouse.up(); });
    await measure('wheel dolly', async () => { await page.mouse.move(x, y); for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -60); await page.waitForTimeout(30); } await page.waitForTimeout(400); });
    await measure('focus', async () => { await page.mouse.dblclick(x, y); await page.waitForTimeout(500); });
    await measure('overview', async () => { await page.click('#space-overview'); });
    await measure('flight', async () => {
      await page.mouse.click(x, y);
      await page.keyboard.press('KeyF'); await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
      await page.keyboard.press('KeyF');
    });
    return { entries };
  });

  await check(SHELL_PASSES.undo, async () => {
    const before = await spaceState(page);
    await within(page.fill('#space-power', '6'), LIMITS.operation, 'fill power');
    await within(page.press('#space-power', 'Enter'), LIMITS.operation, 'commit power');
    await spaceIdle(page, 'power edit');
    const edited = await ev(page, () => ({ power: atlas.space.scene.parameters.power, history: atlas.space.history }), undefined, 'edited');
    assert.equal(edited.power, '6');
    await page.click('#space-undo');
    await spaceIdle(page, 'undo');
    const after = await spaceState(page);
    const power = await ev(page, () => atlas.space.scene.parameters.power, undefined, 'power after undo');
    assert.equal(after.sceneHash, before.sceneHash, 'undo restores the scene');
    assert.equal(power, '8');
    assert.equal(JSON.stringify(after.camera), JSON.stringify(before.camera), 'the camera did not move');
    assert.deepEqual(after.history.camera, before.history.camera, 'camera history is unchanged');
    // Invalid input is reported inline and never clamped.
    await within(page.fill('#space-power', '11'), LIMITS.operation, 'fill invalid power');
    await within(page.press('#space-power', 'Enter'), LIMITS.operation, 'commit invalid power');
    const invalid = await ev(page, () => ({ error: document.querySelector('#space-parameter-error').textContent, power: atlas.space.scene.parameters.power, undoDepth: atlas.space.history.undoDepth }), undefined, 'invalid power');
    assert.match(invalid.error, /\S/, 'invalid input is reported'); assert.equal(invalid.power, '8', 'invalid input is never clamped');
    assert.equal(invalid.undoDepth, after.history.undoDepth);
    return { edited: edited.history.undoDepth, invalid: invalid.error };
  });

  await check(SHELL_PASSES.file, async () => {
    const dir = resolve('artifacts/runtime/space-shell'); await mkdir(dir, { recursive: true });
    const saved = await spaceState(page);
    const [download] = await within(Promise.all([page.waitForEvent('download', { timeout: LIMITS.operation }), page.click('#space-save-scene')]), LIMITS.operation, 'save scene');
    const path = resolve(dir, 'saved.scene.json'); await within(download.saveAs(path), LIMITS.operation, 'save download');
    await within(page.fill('#space-iterations', '96'), LIMITS.operation, 'fill iterations');
    await within(page.press('#space-iterations', 'Enter'), LIMITS.operation, 'commit iterations');
    await spaceIdle(page, 'iteration edit');
    const changed = await spaceState(page);
    assert.notEqual(changed.sceneHash, saved.sceneHash, 'the scene changed before reopening');
    await within(page.setInputFiles('#space-open-scene', path), LIMITS.operation, 'open scene');
    await page.waitForFunction(hash => atlas.space.sceneHash === hash, saved.sceneHash, { timeout: LIMITS.operation });
    await spaceIdle(page, 'reopened scene');
    const reopened = await spaceState(page);
    assert.equal(reopened.sceneHash, saved.sceneHash, 'the reopened scene has the saved hash');
    assert.equal(reopened.history.undoDepth, changed.history.undoDepth + 1, 'one undo entry');
    assert.equal(download.suggestedFilename().endsWith('.json'), true);
    return { file: download.suggestedFilename(), sceneHash: saved.sceneHash, bytes: (await readFile(path)).byteLength };
  });

  await check(SHELL_PASSES.loss, async () => {
    const before = await spaceState(page);
    const { x, y } = await canvasCentre(page);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y + 5);
    await ev(page, () => atlas.space.injectLoss(), undefined, 'first loss');
    await page.mouse.move(x + 60, y + 10); await page.mouse.up();
    await page.waitForFunction(() => atlas.space.state.phase === 'ready', null, { timeout: LIMITS.deep });
    await spaceIdle(page, 'first recovery');
    const recovered = await spaceState(page);
    assert.equal(recovered.publication?.sceneHash, recovered.sceneHash, 'the current scene is published after recovery');
    assert.ok(recovered.state.deviceEpoch > before.state.deviceEpoch, 'a fresh device epoch');
    assert.equal(recovered.history.camera.length, before.history.camera.length + 1, 'the drag committed once');
    await ev(page, () => atlas.space.injectLoss(), undefined, 'repeated loss');
    await page.waitForFunction(() => atlas.space.state.phase === 'stopped', null, { timeout: LIMITS.operation });
    const stopped = await ev(page, () => ({ sceneHash: atlas.space.sceneHash, retry: !document.querySelector('#space-retry').hidden, status: document.querySelector('#space-recovery').textContent, history: atlas.space.history }), undefined, 'stopped');
    assert.equal(stopped.sceneHash, recovered.sceneHash, 'the scene is intact'); assert.equal(stopped.retry, true, 'retry is offered');
    await page.waitForTimeout(1500);
    const still = await ev(page, () => atlas.space.state.phase, undefined, 'still stopped');
    assert.equal(still, 'stopped', 'no automatic retry after a repeated loss');
    await page.click('#space-retry');
    await page.waitForFunction(() => atlas.space.state.phase === 'ready', null, { timeout: LIMITS.deep });
    await spaceIdle(page, 'explicit retry');
    const retried = await spaceState(page);
    assert.equal(retried.publication?.sceneHash, retried.sceneHash, 'the explicit retry publishes the scene');
    return { epochs: [before.state.deviceEpoch, recovered.state.deviceEpoch, retried.state.deviceEpoch], status: stopped.status };
  });

  await check(SHELL_PASSES.allocation, async () => {
    const before = await spaceState(page);
    const notice = await ev(page, async ms => {
      atlas.space.injectAllocationFailure();
      const camera = atlas.space.scene.camera;
      atlas.space.requestCamera({ ...camera, positionLocal: camera.positionLocal.map(v => v * 1.05) });
      const deadline = performance.now() + ms;
      while (!atlas.space.state.allocationFailure && performance.now() < deadline) await new Promise(done => setTimeout(done, 50));
      return { failure: atlas.space.state.allocationFailure, choices: [...document.querySelectorAll('#space-allocation [data-choice]')].map(b => b.dataset.choice),
        visible: !document.querySelector('#space-allocation').hidden, sceneHash: atlas.space.sceneHash };
    }, 60000, 'allocation failure', LIMITS.deep);
    assert.ok(notice.failure, 'the allocation failure was reported');
    assert.equal(notice.visible, true); assert.ok(notice.choices.includes('lower-resolution'), `choices: ${notice.choices}`);
    const requested = await ev(page, () => atlas.space.state.viewport, undefined, 'viewport');
    assert.deepEqual([notice.failure.request.width, notice.failure.request.height], [requested.width, requested.height], 'the failed request kept its dimensions');
    assert.equal(notice.failure.request.samples, (await ev(page, () => atlas.space.scene.sampling.targetSamples, undefined, 'samples')), 'the failed request kept its samples');
    await page.click('#space-allocation [data-choice="lower-resolution"]');
    await spaceIdle(page, 'lower-cost choice');
    const after = await ev(page, () => ({ sceneHash: atlas.space.sceneHash, publication: atlas.space.lastPublication, cost: atlas.space.state.cost }), undefined, 'after choice');
    assert.equal(after.publication.sceneHash, after.sceneHash, 'the chosen lower-cost request rendered the scene unchanged');
    assert.ok(after.publication.internalSize.width < notice.failure.request.internalWidth, 'the chosen request is smaller');
    await ev(page, () => atlas.space.restoreFullCost(), undefined, 'restore full cost');
    await spaceIdle(page, 'full cost');
    return { failure: notice.failure, choices: notice.choices, chosen: after.publication.internalSize };
  });

  await check(SHELL_PASSES.inside, async () => {
    await ev(page, async () => {
      const { lookAt } = await import('/src/space/camera.js');
      const camera = atlas.space.scene.camera;
      atlas.space.requestCamera(lookAt({ ...camera, positionLocal: [0, 0, 0.05], focusLocal: [0.6, 0.2, 0.05] }, [0.6, 0.2, 0.05]));
    }, undefined, 'camera inside the set');
    await spaceIdle(page, 'inside camera');
    const inside = await ev(page, () => ({ status: document.querySelector('#space-camera-status').textContent, cameraStatus: atlas.space.cameraStatus,
      overview: { hidden: document.querySelector('#space-overview').hidden, disabled: document.querySelector('#space-overview').disabled },
      reset: { hidden: document.querySelector('#space-reset-orientation').hidden, disabled: document.querySelector('#space-reset-orientation').disabled } }), undefined, 'inside status');
    assert.match(inside.status, /camera exterior status unresolved/);
    assert.equal(inside.cameraStatus.status, 'unresolved'); assert.equal(inside.cameraStatus.detail.cpu.status, 'unresolved', 'the CPU classification is unresolved');
    assert.deepEqual([inside.overview.hidden, inside.overview.disabled, inside.reset.hidden, inside.reset.disabled], [false, false, false, false]);
    await page.click('#space-overview');
    await spaceIdle(page, 'overview from inside');
    const out = await ev(page, () => ({ cpu: atlas.space.cameraStatus.detail.cpu.status, status: document.querySelector('#space-camera-status').textContent }), undefined, 'after overview');
    assert.equal(out.cpu, 'exterior', 'overview leaves the set (CPU classification)');
    return { inside: { status: inside.status, cpu: inside.cameraStatus.detail.cpu.detail?.reason }, afterOverview: out };
  });

  await check(SHELL_PASSES.exportSwitch, async () => {
    await ev(page, () => atlas.workspaces.switchTo('plane'), undefined, 'to Plane');
    await idleWithin(page);
    await page.click('#export-button');
    await within(page.selectOption('#export-size', '3840'), LIMITS.operation, 'export size');
    const downloaded = page.waitForEvent('download', { timeout: LIMITS.deep });
    await page.click('#download-image');
    const during = await ev(page, async () => {
      const started = atlas.lastExport?.requestId ?? null;
      const toSpace = await atlas.workspaces.switchTo('space');
      await new Promise(done => setTimeout(done, 300));
      const toPlane = await atlas.workspaces.switchTo('plane');
      return { started, toSpace, toPlane };
    }, undefined, 'switch during export', LIMITS.deep);
    const download = await within(downloaded, LIMITS.deep, 'export download');
    await page.waitForFunction(() => atlas.lastExport?.outcome, null, { timeout: LIMITS.deep });
    const exported = await ev(page, () => atlas.lastExport && { outcome: atlas.lastExport.outcome, reason: atlas.lastExport.reason, width: atlas.lastExport.report?.completed?.width }, undefined, 'export result');
    await page.keyboard.press('Escape');
    assert.equal(exported.outcome, 'completed', `the export completed: ${JSON.stringify(exported)}`);
    assert.equal(exported.width, 3840);
    await ev(page, () => document.querySelector('#capture-dialog').close(), undefined, 'close dialog');
    const switched = await ev(page, () => atlas.workspaces.switchTo('space'), undefined, 'back to Space', LIMITS.deep);
    assert.equal(switched.outcome, 'activated');
    await spaceIdle(page, 'Space after export');
    return { during, exported, file: download.suggestedFilename() };
  });

  await check(SHELL_PASSES.blur, async () => {
    const { x, y } = await canvasCentre(page);
    const start = await spaceState(page);
    await page.mouse.click(x, y);
    await page.keyboard.press('KeyF'); await page.keyboard.down('KeyW'); await page.waitForTimeout(250);
    const flying = await ev(page, () => atlas.space.state.flight, undefined, 'flying');
    await ev(page, () => window.dispatchEvent(new Event('blur')), undefined, 'blur');
    const blurred = await spaceState(page);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(150);
    const still = await spaceState(page);
    assert.equal(flying, true, 'flight started'); assert.equal(blurred.state.flight, false, 'blur stopped flight');
    assert.equal(blurred.history.camera.length, start.history.camera.length + 1, 'the flight run committed once on blur');
    assert.equal(JSON.stringify(still.camera), JSON.stringify(blurred.camera), 'no movement after blur');
    await ev(page, () => window.dispatchEvent(new Event('focus')), undefined, 'focus');
    // A captured drag and keyboard focus end on switching; the drag commits once.
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y);
    const captured = await ev(page, () => ({ capture: document.querySelector('#space-canvas').hasPointerCapture(1), focused: document.activeElement?.id ?? null }), undefined, 'captured');
    const switched = await ev(page, async () => { await atlas.workspaces.switchTo('plane'); return { capture: document.querySelector('#space-canvas').hasPointerCapture(1), focused: document.activeElement?.id ?? null, history: atlas.space.history, gesture: atlas.space.history.gesture }; }, undefined, 'switch while captured');
    await page.mouse.move(x + 80, y); await page.mouse.up();
    const afterUp = await ev(page, () => atlas.space.history, undefined, 'after release');
    assert.equal(captured.capture, true, 'the drag held pointer capture');
    assert.equal(switched.capture, false, 'switching released capture');
    assert.notEqual(switched.focused, 'space-canvas', 'switching released keyboard focus');
    assert.equal(switched.gesture, null);
    assert.equal(switched.history.camera.length, blurred.history.camera.length + 1, 'the drag committed once on switching');
    assert.deepEqual(afterUp.camera, switched.history.camera, 'the later release changes nothing');
    await ev(page, () => atlas.workspaces.switchTo('space'), undefined, 'back to Space', LIMITS.deep);
    await spaceIdle(page, 'after blur checks');
    return { flying, captured, switched: { capture: switched.capture, focused: switched.focused } };
  });

  await check(SHELL_PASSES.gamepad, async () => {
    const statusText = () => ev(page, () => document.querySelector('#space-controller-status').textContent, undefined, 'controller status');
    const waiting = await statusText();
    await ev(page, () => window.__pad.connect(), undefined, 'connect pad');
    await page.waitForFunction(() => /ATLAS scripted standard pad/.test(document.querySelector('#space-controller-status').textContent), null, { timeout: LIMITS.operation });
    await page.waitForTimeout(100); // neutral samples arm the controller
    const before = await spaceState(page);
    await ev(page, () => window.__pad.axes([0.8, 0, 0, 0]), undefined, 'stick');
    await page.waitForTimeout(400);
    await ev(page, () => window.__pad.axes([0, 0, 0, 0]), undefined, 'neutral');
    await page.waitForTimeout(400);
    await spaceIdle(page, 'gamepad orbit');
    const orbited = await spaceState(page);
    assert.match(waiting, /Press a controller button to connect/);
    assert.equal(orbited.history.camera.length, before.history.camera.length + 1, 'the orbit run is one camera-history entry');
    assert.notEqual(JSON.stringify(orbited.camera), JSON.stringify(before.camera), 'the controller orbited');
    await ev(page, () => window.__pad.button(9, true), undefined, 'start press');
    await page.waitForTimeout(80);
    await ev(page, () => window.__pad.button(9, false), undefined, 'start release');
    await page.waitForTimeout(80);
    const flying = await ev(page, () => atlas.space.state.flight, undefined, 'pad flight');
    await ev(page, () => window.__pad.axes([0, -0.8, 0, 0]), undefined, 'forward');
    await page.waitForTimeout(400);
    await ev(page, () => window.__pad.disconnect(), undefined, 'disconnect');
    await page.waitForTimeout(200);
    const disconnected = await spaceState(page);
    await page.waitForTimeout(200);
    const still = await spaceState(page);
    await spaceIdle(page, 'gamepad flight');
    assert.equal(flying, true, 'Start toggled flight');
    assert.equal(disconnected.state.flight, false, 'disconnect stopped flight');
    assert.equal(disconnected.history.camera.length, orbited.history.camera.length + 1, 'the flight run is one camera-history entry');
    assert.equal(JSON.stringify(still.camera), JSON.stringify(disconnected.camera), 'no movement after the disconnect');
    const screenshot = await shellScreenshot(page, 'space-switcher');
    return { waiting, connected: (await statusText()), entries: [before.history.camera.length, orbited.history.camera.length, disconnected.history.camera.length], screenshot };
  });

  // Leave the page on Plane with Space work settled, so the drain sees only Plane's WebGL context.
  await ev(page, () => atlas.workspaces.switchTo('plane'), undefined, 'final switch to Plane', LIMITS.deep);
  await spaceIdle(page, 'final');
  await idleWithin(page);
  const switcherShot = await shellScreenshot(page, 'plane-with-switcher', { x: 0, y: 0, width: 1280, height: 120 });
  report.push({ name: 'Shell screenshots (diagnostic)', dir: process.env.ATLAS_SHELL_SCREENSHOTS ?? null, switcherShot });
  const memory = await ev(page, () => atlas.space.backendDiagnostics && { peak: atlas.space.backendDiagnostics.peak, tracked: atlas.space.backendDiagnostics.tracked, viewport: atlas.space.state.viewport }, undefined, 'memory');
  report.push({ name: 'Space memory at the test viewport (recorded)', ...memory });
  assert.deepEqual(failedChecks, [], `shell checks failed: ${failedChecks.join('; ')}`);
}

// ---- harness ---------------------------------------------------------------------------------------

async function readEffectiveEnvironment(context) {
  const versionPage = expectBackend(boundContext(await within(context.newPage(), LIMITS.launch, 'newPage chrome://version')), 'none');
  let effectiveCommandLine, chromeVersion, userAgent;
  try {
    await versionPage.goto('chrome://version', { timeout: LIMITS.launch });
    await versionPage.waitForFunction(() => document.querySelector('#command_line')?.innerText.trim().length > 0, null, { timeout: LIMITS.operation });
    ({ effectiveCommandLine, chromeVersion, userAgent } = await ev(versionPage, () => ({
      effectiveCommandLine: document.querySelector('#command_line').innerText.trim(),
      chromeVersion: document.querySelector('#version')?.innerText.trim() ?? 'unavailable', userAgent: navigator.userAgent,
    }), undefined, 'chrome://version'));
  } finally { await closeDrained(versionPage, 'chrome://version'); }
  const gpuPage = expectBackend(boundContext(await within(context.newPage(), LIMITS.launch, 'newPage chrome://gpu')), 'none');
  let chromeGpu, text = '';
  try {
    await gpuPage.goto('chrome://gpu', { timeout: LIMITS.launch });
    // Absolute deadline; each 250 ms wait is a fresh arm (recorded as polls), never an accumulated delay.
    const deadline = performance.now() + LIMITS.operation;
    let reason = 'no snapshot', polls = 0;
    while (performance.now() < deadline) {
      polls++;
      text = await ev(gpuPage, collectVisibleText, undefined, 'chrome://gpu text');
      if (text.includes('Graphics Feature Status')) {
        try { chromeGpu = { ...activeGpuIdentity(text), polls }; break; } catch (error) { reason = error.message; }
      } else reason = 'no Graphics Feature Status section yet';
      await new Promise(resolveWait => setTimeout(resolveWait, Math.max(1, Math.min(250, Math.ceil(deadline - performance.now())))));
    }
    if (!chromeGpu) chromeGpu = { reason, available: false, polls };
  } finally { await closeDrained(gpuPage, 'chrome://gpu'); }
  const webgpuStatus = graphicsFeatureStatus(text, 'WebGPU');
  return { effectiveCommandLine, chromeVersion, userAgent, chromeGpu, webgpuStatus };
}

// The served checkout is identified, never assumed: the commit and dirty state of this checkout, and a
// byte comparison of every tracked application file (index.html, src/, assets/ — what build.mjs
// copies) with what the server serves. Called only after server readiness (startupSequence).
async function sourceIdentity() {
  const git = args => { try { return execFileSync('git', args, { encoding: 'utf8', timeout: 10_000 }).trim(); } catch { return null; } };
  const commit = git(['rev-parse', '--short', 'HEAD']) ?? 'unknown';
  const porcelain = git(['status', '--porcelain']);
  const files = (git(['ls-files', '--', 'index.html', 'src', 'assets']) ?? '').split('\n').filter(Boolean);
  const servedSource = await within(verifyServedSource({
    files, readLocal: path => readFile(path),
    fetchServed: async path => { const response = await fetch(`${url}/${path}`, { signal: AbortSignal.timeout(LIMITS.launch) }); return response.ok ? Buffer.from(await response.arrayBuffer()) : null; },
  }), LIMITS.operation, 'served source verification');
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  return { commit, dirty: porcelain === null ? 'unknown' : porcelain.length > 0, servedUrl: url, servedSource, treeSha256: sha256(await Promise.all(files.map(path => readFile(path))).then(buffers => Buffer.concat(buffers))) };
}

// The server: adopt a listener that already answers at ATLAS_URL (the gate's owned server), else
// start one from this checkout on the URL's port and own it.
async function ensureServer() {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); return 'adopted'; } catch { /* nothing listens yet */ }
  const port = new URL(url).port || '80';
  server = spawn(process.execPath, ['scripts/serve.mjs', '--port', port], { cwd: process.cwd(), env: { ...process.env, PORT: port }, stdio: 'pipe' });
  server.stderr.on('data', data => process.stderr.write(data));
  await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  return 'owned';
}

let server;
const launched = []; // every browser launched by this run, closed through the drain wrapper in the finally
const groups = { coexistence: runCoexistence, 'developer-flag-experiment': runDeveloperFlagExperiment, recovery: runRecovery, numerics: runNumerics, 'numerics-divergence': runNumericsDivergence, rendering: runRendering, visual: runVisualOnly, shell: runShell };
const handoff = process.env.ATLAS_GPU_HANDOFF ?? null;
let source = null, serverOwnership = null;

// Launch installed Chrome headed with `args` in a fresh profile, read its effective environment and
// record it. Every launch in a run is recorded with its label; the gated coexistence group launches once.
async function launchProfile({ label, args }) {
  const requestedArgs = ['--disable-dev-shm-usage', ...args];
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: false, env: chromeLaunchEnv(), timeout: LIMITS.launch, args: requestedArgs });
  launched.push(browser);
  const viewport = { width: 1280, height: 720, deviceScaleFactor: 1 };
  const context = boundContext(await within(browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 }), LIMITS.launch, 'newContext'));
  const effective = await readEffectiveEnvironment(context);
  const effectiveArguments = checkEffectiveArguments(effective.effectiveCommandLine, args);
  const environment = {
    name: 'environment', group: options.group, launch: label, startedAt, browser: 'installed Chrome', browserVersion: browser.version(), chromeVersion: effective.chromeVersion,
    userAgent: effective.userAgent,
    headed: true, chromiumSandbox: true, viewport, requestedArgs, effectiveCommandLine: effective.effectiveCommandLine, effectiveArguments,
    chromeGpu: effective.chromeGpu, webgpuStatus: effective.webgpuStatus, display: process.env.DISPLAY ?? null, url, handoff, serverOwnership, source,
  };
  report.push(environment);
  assert.deepEqual(effectiveArguments.missing, [], `the requested profile did not reach Chrome: missing ${effectiveArguments.missing.join(' ')}`);
  assert.equal(effectiveArguments.noSandbox, false, 'Chrome launched without its sandbox');
  assert.equal(effectiveArguments.headless, false, 'Chrome launched headless (E7: headed only)');
  assert.equal(effectiveArguments.gpuWatchdogDisabled, false, 'Chrome launched with the GPU watchdog disabled');
  assert.equal(source?.servedSource?.matches, true, `the served source set does not match this checkout (${JSON.stringify(source)})`);
  console.log(`environment ${JSON.stringify({ launch: label, chromeVersion: environment.chromeVersion, effectiveArguments, chromeGpu: environment.chromeGpu, webgpuStatus: environment.webgpuStatus, handoff, source })}`);
  return { browser, context, environment };
}

let cleanupFailed = true, reportPersisted = false;
try {
  // Server readiness first, then the served source, both before any browser launches.
  ({ serverOwnership, source } = await startupSequence({ ensureServer, identifySource: sourceIdentity }));
  console.log(`source ${JSON.stringify({ serverOwnership, ...source })}`);
  assert.equal(source.servedSource.matches, true, `the served source set does not match this checkout: ${JSON.stringify(source.servedSource)}`);
  if (['coexistence', 'recovery', 'numerics', 'numerics-divergence', 'rendering', 'visual', 'shell'].includes(options.group)) {
    // One launch under the complete profile; the application page is a WebGL (Plane) page, so its close
    // in the finally goes through the local expected-backend drain wrapper (drainExpecting).
    const { context, environment } = await launchProfile({ label: 'profile', args: PROJECT0_LAUNCH_ARGS });
    const page = expectBackend(boundContext(await within(context.newPage(), LIMITS.launch, 'newPage')), 'webgl');
    watchErrors(page);
    await groups[options.group]({ context, page, environment });
  } else await groups[options.group]({ launchProfile });
  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
  await writeReport(report);
  reportPersisted = true;
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  reportPersisted = false;
  throw error;
} finally {
  // Preserve the original failure if the suite deadline fires while pages are draining.
  try { await writeReport(report); } catch { /* cleanupPages retries after the drains. */ }
  const contexts = launched.flatMap(browser => browser.contexts());
  const failed = await cleanupPages({
    pages: contexts.flatMap(context => context.pages()), drain: drainExpecting, report, writeReport,
    closeAll: async () => {
      for (const context of contexts) await closeWithin(context, 'context');
      for (const browser of launched) await closeWithin(browser, 'browser');
      server?.kill('SIGTERM');
    },
  });
  cleanupFailed = failed;
  if (failed) process.exitCode = 1;
}

// Only here — after a passing run, a persisted report and a confirmed cleanup — may the document be written.
if (options.writeSpike) {
  const permitted = canWriteSpikeDocument({ report, cleanupFailed, reportPersisted, exitCode: process.exitCode });
  if (!permitted.ok) { console.error(`spike document not written: ${permitted.reason}`); process.exitCode = 1; }
  else {
    const runs = [{ label: 'this run', report }];
    for (const path of options.includeRuns) runs.push({ label: path.replace(/^.*\//, ''), report: JSON.parse(await readFile(path, 'utf8')) });
    const experiment = options.includeExperiment ? JSON.parse(await readFile(options.includeExperiment, 'utf8')) : null;
    await mkdir(dirname(SPIKE_DOCUMENT_PATH), { recursive: true });
    await writeFile(SPIKE_DOCUMENT_PATH, renderSpikeDocument(report, { generatedAt: new Date().toISOString(), commit: `${source?.commit ?? 'unknown'}${source?.dirty === true ? ' (dirty)' : ''}`, runs, experiment }));
    console.log(`spike document written to ${SPIKE_DOCUMENT_PATH} (${permitted.reason})`);
  }
}
