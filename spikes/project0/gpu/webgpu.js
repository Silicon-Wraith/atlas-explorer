// spikes/project0/gpu/webgpu.js — WebGPU helpers. Every buffer goes through the session allocator, every batch through the
// watchdog, and every wait races the experiment's abort signal (gpu/abort.js).
import { vec4 } from '../browser/packing.js';
import { ARITHMETIC_ENTRY_POINTS, arithmeticPipelines } from '../remediation/pipeline-config.js';
export const FIELDS = Object.freeze({ sphere: 0, box: 1, menger: 2, bulb: 3 });
const noAbort = { race: p => p, throwIfAborted() {}, aborted: false };

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

// G5-A (prereg rev 2 §2.6): the arithmetic module's exact source and its pipeline descriptors, recorded by the last prepare() so the G5
// driver can bind its supplementary evidence to the module and entry points that produced it.
let arithmeticRecord = null;
export const arithmeticPreparation = () => arithmeticRecord;
export async function prepare(device, alloc, onStatus = () => {}) {
  const fields = await source('./fields.wgsl');
  const arithmeticCode = fields + await source('./arithmetic.wgsl');
  const arithmetic = await compile(device, arithmeticCode, 'arithmetic');
  const trace = await compile(device, fields + await source('./trace.wgsl'), 'trace');
  arithmeticRecord = { code: arithmeticCode, entryPoints: [...ARITHMETIC_ENTRY_POINTS], pipelines: arithmeticPipelines() };
  const jobs = [
    ...ARITHMETIC_ENTRY_POINTS.map(e => [e, { module: arithmetic, entryPoint: e }]),            // G5-D: exactly the recorded configuration
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

export const MAP_DEADLINE_MS = 5000;
const noWatch = { submitted: () => () => {} };
// A mapping that never resolves is a harness/readback timeout, recorded as such — never reported as shader execution time.
export async function mapWithin(buffer, abort, ms = MAP_DEADLINE_MS, ...range) {
  let timer;
  try { await abort.race(Promise.race([buffer.mapAsync(GPUMapMode.READ, ...range), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`harness readback timeout: mapping did not complete within ${ms} ms`)), ms); })])); }
  catch (error) {
    // A JavaScript deadline does not cancel mapAsync(); unmap() does, so a late resolution can never leave a reusable buffer mapped.
    // Every mapping caller, including the renderer's reused readback ring, gets the cancellation from this one place.
    try { buffer.unmap(); } catch { /* an already destroyed buffer has nothing to cancel */ }
    throw error;
  }
  finally { clearTimeout(timer); }
}

// One registered submission: the watchdog sees it before it is submitted, and its completion races the abort.
export async function dispatchOnce(device, watchdog, abort, encode, label) {
  abort.throwIfAborted();
  const enc = device.createCommandEncoder(); encode(enc);
  const done = watchdog.submitted(label, { label });
  device.queue.submit([enc.finish()]);
  await abort.race(device.queue.onSubmittedWorkDone()); done();
}

export async function readBack(device, alloc, src, size, abort = noAbort, watchdog = noWatch, mapDeadlineMs = MAP_DEADLINE_MS) {
  const t0 = performance.now();
  const read = alloc.buffer(device, { size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  try {
    await dispatchOnce(device, watchdog, abort, enc => enc.copyBufferToBuffer(src, 0, read, 0, size), 'readback-copy');
    await mapWithin(read, abort, mapDeadlineMs);
    const bytes = read.getMappedRange().slice(0); read.unmap();
    return { bytes, ms: performance.now() - t0 };
  } finally { read.destroy(); }                                  // destroying a buffer with a pending map is permitted
}

export function profileWords({ k, floor, factor, H, steps, iterations }, start, count, boxCount) {
  const words = new ArrayBuffer(48), f = new Float32Array(words), u = new Uint32Array(words);
  f[0] = k; f[1] = floor; f[2] = factor; f[3] = 2 * Math.tan(Math.PI / 6) / H;
  u[4] = steps; u[5] = iterations; u[6] = start; u[7] = count; u[8] = boxCount;
  return new Uint8Array(words);
}

// What traceList's workMs measures: queue-completion time on the page clock, from before batch preparation (timing-contract.js, which G3's
// expected timing method names exactly).
export { QUEUE_COMPLETION_WORKMS as TRACE_LIST_TIMING } from '../timing-contract.js';
// Bounded batches, at most two outstanding, each registered with the watchdog. workMs excludes readback.
export async function traceList({ device, alloc, watchdog, abort = noAbort, pipelines, field, profile, origins, directions, boxes = new Float32Array(4), batch = 512, label = field }) {
  const n = origins.length / 3, pipeline = pipelines[`trace_list/${field}`];
  const owned = [];
  const keep = b => { owned.push(b); return b; };
  try {
    const o = keep(upload(device, alloc, vec4(origins), GPUBufferUsage.STORAGE)), d = keep(upload(device, alloc, vec4(directions), GPUBufferUsage.STORAGE));
    const bx = keep(upload(device, alloc, boxes, GPUBufferUsage.STORAGE));
    const results = keep(alloc.buffer(device, { size: Math.max(16, 16 * n), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
    const batches = [], inflight = []; const t0 = performance.now();
    for (let start = 0; start < n; start += batch) {
      while (inflight.length >= 2) await abort.race(inflight.shift());
      abort.throwIfAborted();
      const count = Math.min(batch, n - start);
      const uniform = keep(upload(device, alloc, profileWords(profile, start, count, boxes.length / 4), GPUBufferUsage.UNIFORM));
      const bind = alloc.bindGroup(device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: bx } },
        { binding: 2, resource: { buffer: o } }, { binding: 3, resource: { buffer: d } }, { binding: 4, resource: { buffer: results } }] }));
      const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
      const row = { start, count, submitMs: performance.now(), doneMs: null };
      const done = watchdog.submitted(`${label}:${start}`, { label, start, count });
      device.queue.submit([enc.finish()]); batches.push(row);
      inflight.push(device.queue.onSubmittedWorkDone().then(() => { row.doneMs = performance.now(); done(); }));
    }
    await abort.race(Promise.all(inflight));
    const workMs = performance.now() - t0;
    const { bytes, ms } = await readBack(device, alloc, results, 16 * n, abort, watchdog);
    return { words: new Uint32Array(bytes), workMs, readMs: ms, batches };
  } finally { for (const b of owned) b.destroy(); }             // never awaits a drain: safe after an abort
}
