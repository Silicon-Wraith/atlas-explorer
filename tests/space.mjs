// The headed Space suite (plan B01; spec §16.1, §16.5, §9.1 "Launch (tests)"). One entry point,
// separately registered groups:  node tests/space.mjs --group <name> [--write-spike] [--include-run <report.json>]…
// Every group launches installed Chrome headed with the complete recorded Project 0 profile on the
// physical GPU (E7: headed only), serves the application, records {name, details} passes to its own
// report with the requested and effective launch arguments and the chrome://gpu identity, and is
// bounded by installSuiteDeadline. B01 registers `coexistence`; later tasks add numerics, rendering,
// recovery and shell.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { LIMITS, within, idleWithin, drainGpuWithin, closeWithin, installSuiteDeadline, boundContext, ev, CHROME_TMPDIR, chromeLaunchEnv } from './support/bounded.mjs';
import { cleanupPages } from './support/workflow-cleanup.mjs';
import { PROJECT0_LAUNCH_ARGS, collectVisibleText, activeGpuIdentity, graphicsFeatureStatus, checkEffectiveArguments, renderSpikeDocument, SPIKE_DOCUMENT_PATH } from './support/space-suite.mjs';

export const PREPARATION_BOUND_MS = 60_000; // plan default: preparation is bounded per attempt
export const GROUP_NAMES = Object.freeze(['coexistence']);
const PASS_COEXIST = 'WebGL 2 and WebGPU contexts coexist in one page';
const PASS_IDENTITY = 'Adapter identity reports observed or unavailable fields truthfully';
const PASS_PREPARE = 'A representative pipeline set prepares within the bound with progress events';

function parseArgs(argv) {
  const options = { group: null, writeSpike: false, includeRuns: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--group') options.group = argv[++i];
    else if (argv[i] === '--write-spike') options.writeSpike = true;
    else if (argv[i] === '--include-run') options.includeRuns.push(argv[++i]);
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
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { invalidated = true; reject(Object.assign(new Error(`preparation did not finish within ${boundMs} ms`), { events })); }, boundMs); });
  timeout.catch(() => {}); // the race surfaces the rejection; nothing is left unhandled
  let cold, warm;
  try { cold = await Promise.race([prepareSet('cold'), timeout]); warm = await Promise.race([prepareSet('warm'), timeout]); }
  finally { clearTimeout(timer); }
  const result = { boundMs, totalMs: cold.totalMs, stages: cold.stages, events, warm: { totalMs: warm.totalMs, stages: warm.stages.map(({ id, totalMs }) => ({ id, totalMs })) } };
  if (dispatch) result.dispatch = await dispatchInPage(device, cold.pipelines, dispatch);
  return result;

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
  spike.device.destroy();
  const lost = await Promise.race([spike.device.lost, new Promise(resolve => setTimeout(() => resolve(null), 5000))]);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { lost: lost ? { reason: lost.reason, message: lost.message } : null, observer: spike.lost, uncaptured: spike.uncaptured };
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
  assert.deepEqual(Object.keys(limits), ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxUniformBufferBindingSize', 'maxTextureDimension2D', 'maxComputeWorkgroupsPerDimension', 'maxComputeInvocationsPerWorkgroup', 'maxBindGroups', 'maxStorageBuffersPerShaderStage']);
  for (const [key, value] of Object.entries(limits)) assert.ok(value === 'unavailable' || (Number.isInteger(value) && value > 0), `${key}: ${value}`);
  const observedFields = Object.values(identity).filter(field => field !== 'unavailable').length;
  const corroborated = { webglRenderer: webgl.renderer, chromeGpu: environment.chromeGpu };
  if (observedFields === 0) assert.ok(environment.chromeGpu?.record, `every identity field is unavailable, so chrome://gpu must corroborate the physical GPU (${JSON.stringify(environment.chromeGpu)})`);
  pass(PASS_IDENTITY, { identity, isFallbackAdapter, features, limits, observedFields, corroboration: corroborated });

  const prepared = await ev(page, prepareInPage, { boundMs: PREPARATION_BOUND_MS, dispatch: { width: 128, height: 128 } }, 'pipeline preparation', LIMITS.deep);
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
  pass('WebGPU device destroyed without disturbing WebGL', { lost: destroyed.lost, observer: destroyed.observer, webglAfterDestroy });
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
    const deadline = performance.now() + LIMITS.operation;
    let reason = 'no snapshot';
    while (performance.now() < deadline) {
      text = await ev(gpuPage, collectVisibleText, undefined, 'chrome://gpu text');
      if (text.includes('Graphics Feature Status')) {
        try { chromeGpu = activeGpuIdentity(text); break; } catch (error) { reason = error.message; }
      } else reason = 'no Graphics Feature Status section yet';
      await new Promise(resolveWait => setTimeout(resolveWait, 250));
    }
    if (!chromeGpu) chromeGpu = { reason, available: false };
  } finally { await closeDrained(gpuPage, 'chrome://gpu'); }
  const webgpuStatus = graphicsFeatureStatus(text, 'WebGPU');
  return { effectiveCommandLine, chromeVersion, userAgent, chromeGpu, webgpuStatus };
}

let server, browser;
const groups = { coexistence: runCoexistence };
try {
  try { await fetch(url, { signal: AbortSignal.timeout(LIMITS.launch) }); } catch {
    const port = new URL(url).port || '80';
    server = spawn(process.execPath, ['scripts/serve.mjs', '--port', port], { cwd: process.cwd(), env: { ...process.env, PORT: port }, stdio: 'pipe' });
    server.stderr.on('data', data => process.stderr.write(data));
    await within(new Promise((resolveReady, reject) => { server.stdout.once('data', resolveReady); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`))); }), LIMITS.launch, 'preview server readiness');
  }
  const requestedArgs = ['--disable-dev-shm-usage', ...PROJECT0_LAUNCH_ARGS];
  const startedAt = new Date().toISOString();
  browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: false, env: chromeLaunchEnv(), timeout: LIMITS.launch, args: requestedArgs });
  const viewport = { width: 1280, height: 720, deviceScaleFactor: 1 };
  const context = boundContext(await within(browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 }), LIMITS.launch, 'newContext'));
  const effective = await readEffectiveEnvironment(context);
  const effectiveArguments = checkEffectiveArguments(effective.effectiveCommandLine, PROJECT0_LAUNCH_ARGS);
  const environment = {
    name: 'environment', group: options.group, startedAt, browser: 'installed Chrome', browserVersion: browser.version(), chromeVersion: effective.chromeVersion,
    userAgent: effective.userAgent,
    headed: true, chromiumSandbox: true, viewport, requestedArgs, effectiveCommandLine: effective.effectiveCommandLine, effectiveArguments,
    chromeGpu: effective.chromeGpu, webgpuStatus: effective.webgpuStatus, display: process.env.DISPLAY ?? null, url,
  };
  report.push(environment);
  assert.deepEqual(effectiveArguments.missing, [], `the recorded Project 0 profile did not reach Chrome: missing ${effectiveArguments.missing.join(' ')}`);
  assert.equal(effectiveArguments.noSandbox, false, 'Chrome launched without its sandbox');
  assert.equal(effectiveArguments.headless, false, 'Chrome launched headless (E7: headed only)');
  assert.equal(effectiveArguments.gpuWatchdogDisabled, false, 'Chrome launched with the GPU watchdog disabled');
  console.log(`environment ${JSON.stringify({ chromeVersion: environment.chromeVersion, effectiveArguments, chromeGpu: environment.chromeGpu, webgpuStatus: environment.webgpuStatus })}`);

  const page = expectBackend(boundContext(await within(context.newPage(), LIMITS.launch, 'newPage')), 'webgl');
  watchErrors(page);
  await groups[options.group]({ context, page, environment });
  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
  await writeReport(report);
  if (options.writeSpike) {
    const runs = [{ label: 'this run', report }];
    for (const path of options.includeRuns) runs.push({ label: path.replace(/^.*\//, ''), report: JSON.parse(await readFile(path, 'utf8')) });
    let commit = 'unknown';
    try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', timeout: 10_000 }).trim(); } catch { /* recorded as unknown */ }
    await mkdir(dirname(SPIKE_DOCUMENT_PATH), { recursive: true });
    await writeFile(SPIKE_DOCUMENT_PATH, renderSpikeDocument(report, { generatedAt: new Date().toISOString(), commit, runs }));
    console.log(`spike document written to ${SPIKE_DOCUMENT_PATH}`);
  }
} catch (error) {
  report.push({ name: 'FAIL', error: error.stack });
  throw error;
} finally {
  // Preserve the original failure if the suite deadline fires while pages are draining.
  try { await writeReport(report); } catch { /* cleanupPages retries after the drains. */ }
  const contexts = browser?.contexts() ?? [];
  const failed = await cleanupPages({
    pages: contexts.flatMap(context => context.pages()), drain: drainExpecting, report, writeReport,
    closeAll: async () => {
      for (const context of contexts) await closeWithin(context, 'context');
      await closeWithin(browser, 'browser'); server?.kill('SIGTERM');
    },
  });
  if (failed) process.exitCode = 1;
}
