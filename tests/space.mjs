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
// `numerics` (the field kernels against B04's frozen matrix); later tasks add rendering and shell. The spike document is written only after the run passed, its report was
// persisted and every page, context and browser was drained and closed.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { LIMITS, within, idleWithin, drainGpuWithin, closeWithin, installSuiteDeadline, boundContext, ev, CHROME_TMPDIR, chromeLaunchEnv } from './support/bounded.mjs';
import { cleanupPages } from './support/workflow-cleanup.mjs';
import { PROJECT0_LAUNCH_ARGS, DEVELOPER_FLAG, collectVisibleText, activeGpuIdentity, graphicsFeatureStatus, checkEffectiveArguments, canWriteSpikeDocument, renderSpikeDocument, SPIKE_DOCUMENT_PATH, longTasksByPhase, verifyServedSource, startupSequence } from './support/space-suite.mjs';

export const PREPARATION_BOUND_MS = 60_000; // plan default: preparation is bounded per attempt
export const GROUP_NAMES = Object.freeze(['coexistence', 'developer-flag-experiment', 'recovery', 'numerics']);
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
  const targets = await backend.configureTargets({ epoch: acquired.epoch, layoutId: 'space-targets-v1', internalSize: { width: 1, height: 1 }, outputSize: { width: 1, height: 1 } });
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
  const targets = await backend.configureTargets({ epoch, layoutId: 'space-targets-v1', internalSize: { width, height }, outputSize: { width, height } });
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
  const targets = await backend.configureTargets({ epoch, layoutId: 'space-targets-v1', internalSize: internal, outputSize: output });
  const { pixels, ...drawn } = await b.drawDisplay(targets);
  const { data: display } = await b.readBands(targets.handles.display, internal.width, internal.height, 4);
  b.releaseSet(targets);
  return { drawn, canvas: { width: b.canvas.width, height: b.canvas.height }, displayPattern: b.displayPatternMismatches(display, internal.width, internal.height), comparison: b.compareCanvas(pixels, display, internal, output) };
}

async function lossInPage() {
  const b = globalThis.__b06, { backend } = b;
  const first = { epoch: backend.currentEpoch() };
  const targets = await backend.configureTargets({ epoch: first.epoch, layoutId: 'space-targets-v1', internalSize: { width: 256, height: 256 }, outputSize: { width: 256, height: 256 } });
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
  const probeTargets = await backend.configureTargets({ epoch: second.epoch, layoutId: 'space-targets-v1', internalSize: { width: 1, height: 1 }, outputSize: { width: 1, height: 1 } });
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
  const targets = await backend.configureTargets({ epoch, layoutId: 'space-targets-v1', internalSize: internal, outputSize: output });
  await b.drawDisplay(targets);
  const snapshot = () => { const d = backend.diagnostics(); return { tracked: d.tracked, live: d.inventory.filter(item => item.state === 'live').map(item => item.id).sort() }; };
  const before = snapshot(), failures = {};
  try { await backend.configureTargets({ epoch, layoutId: 'space-targets-v1', internalSize: { width: 8192, height: 8192 }, outputSize: { width: 8192, height: 8192 } }); failures.aboveCap = 'accepted'; } catch (error) { failures.aboveCap = error.code; }
  const afterCap = snapshot();
  backend.testAdapter.failNextAllocation();
  try { await backend.configureTargets({ epoch, layoutId: 'space-targets-v1', internalSize: { width: 64, height: 64 }, outputSize: { width: 64, height: 64 } }); failures.injected = 'accepted'; } catch (error) { failures.injected = error.code; }
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
  const targets = await backend.configureTargets({ epoch, layoutId: 'space-targets-v1', internalSize: internal, outputSize: { width: 1920, height: 1080 } });
  const ids = new Set(Object.values(targets.handles).flat().map(handle => handle.id));
  const inventory = () => backend.diagnostics().inventory.filter(item => ids.has(item.id));
  const allocated = inventory().map(({ name, bytes, width, height, format, state }) => ({ name, bytes, width, height, format, state }));
  const targetBytes = allocated.reduce((sum, item) => sum + item.bytes, 0), trackedAtAllocation = backend.diagnostics().tracked;
  const ticket = backend.submitBatch(b.batch('probe', 'probe_target', targets.handles.status, { x: 0, y: 0, ...internal }), b.lease('probe'));
  backend.release(targets.handles.status); // released while the ticket still references it
  const whileHeld = { tracked: backend.diagnostics().tracked, retiring: backend.diagnostics().retiring, status: inventory().find(item => item.name === 'status') };
  const done = await ticket.done;
  const afterTicket = { tracked: backend.diagnostics().tracked, retiring: backend.diagnostics().retiring, statusPresent: inventory().some(item => item.name === 'status') };
  const replacement = await backend.configureTargets({ epoch, layoutId: 'space-targets-v1', internalSize: { width: 64, height: 64 }, outputSize: { width: 64, height: 64 } });
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
    assert.equal(selfCheck.targets.layoutId, 'space-targets-v1'); assert.equal(selfCheck.targets.accumulation.length, 2);
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
    const bpp = { depth: 4, status: 4, normal: 8, sampleColor: 8, lightingStatus: 4, accumulationFlags: 4, 'accumulation-0': 16, 'accumulation-1': 16, display: 4, retained: 4 };
    assert.deepEqual(fourK.allocated.map(item => item.name).sort(), Object.keys(bpp).sort());
    for (const item of fourK.allocated) { assert.equal(item.bytes, 3840 * 2160 * bpp[item.name], item.name); assert.deepEqual([item.width, item.height, item.state], [3840, 2160, 'live']); }
    assert.equal(fourK.targetBytes, 597_196_800, '72 bytes per pixel at 3840 × 2160'); assert.equal(3840 * 2160 * 72, 597_196_800);
    assert.ok(fourK.trackedAtAllocation <= cap);
    assert.equal(fourK.whileHeld.tracked, fourK.trackedAtAllocation + 16, 'released bytes stay tracked while the ticket holds them (plus its counted 16-byte uniform snapshot)');
    assert.equal(fourK.whileHeld.retiring, 3840 * 2160 * 4 + 16, 'the released status target and the uniform snapshot are retiring'); assert.equal(fourK.whileHeld.status.state, 'retiring'); assert.equal(fourK.whileHeld.status.tickets, 1);
    assert.equal(fourK.done.outcome, 'completed');
    assert.deepEqual(fourK.afterTicket, { tracked: fourK.trackedAtAllocation - 3840 * 2160 * 4, retiring: 0, statusPresent: false }, 'reclaimed once the last ticket retires');
    assert.equal(fourK.keptAfterReplacement, 9, 'reconfiguration keeps the earlier set caller-owned (status was already released)');
    assert.equal(fourK.previousPresented.outcome, 'completed', 'the previous image can still be presented after reconfiguration');
    assert.equal(fourK.afterReplacement.remaining4K, 0, 'the earlier 4K set is reclaimed after its explicit release');
    assert.equal(fourK.afterReplacement.tracked, fourK.trackedAtAllocation - fourK.targetBytes + 64 * 64 * 72);
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
      assert.ok(Math.abs(Math.log2(gpu.mantissa) - Math.log2(reference.mantissa)) <= tol.log2DE.value, `update ${n}: log2 D within 2^-10`);
      if (n >= 44) assert.ok(gpu.exponent > 127, `update ${n} lies beyond the binary32 scalar range`);
      bitExact += Number(gpu.mantissa === reference.mantissa);
    }
    assert.deepEqual(probes[43].derivative, frozen, 'update 44 equals the frozen reference state');
    return { update44: probes[43].derivative, update128: probes[127].derivative, bitExactMantissas: bitExact, of: 128 };
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
const groups = { coexistence: runCoexistence, 'developer-flag-experiment': runDeveloperFlagExperiment, recovery: runRecovery, numerics: runNumerics };
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
  if (['coexistence', 'recovery', 'numerics'].includes(options.group)) {
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
