// spikes/project0/gpu/renderer.js — WebGPU viewport. Every submission that can overlap replacement rendering — trace bands and the
// shade/blit finish — takes credit from the one session Ledger; a Planner per generation.
import { Ledger, Planner } from './scheduler.js';
import { upload, profileWords, source, compile, dispatchOnce, mapWithin } from './webgpu.js';
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

const RING = 3, QUERY_PAIRS = 8, QUERY_STRIDE = 256;   // resolveQuerySet destinationOffset must be a multiple of 256
const noAbort = { aborted: false };

export class Renderer {
  constructor({ device, viewport, canvas, fixtures, events, alloc, watchdog, abort = noAbort, epoch = currentEpoch, timestamps = device.features.has('timestamp-query') }) {
    Object.assign(this, { device, viewport, canvas, fixtures, events, alloc, watchdog, abort, epoch, alive: true, seq: 0, generation: 0, batchSeq: 0, job: null, carry: null, pendingFinish: null, handlers: new Set() });
    // A renderer belongs to the device epoch it was constructed in (Codex T7 r1, finding 3): after that epoch retires it refuses new
    // requests, and a replacement device needs a replacement renderer.
    this.deviceEpoch = epoch();
    this.ledger = new Ledger({ max: 2 });
    this.waiters = [];                                                                    // timestamp copies waiting for ledger credit
    this.bands = []; this.submits = 0;
    this.context = canvas.getContext('webgpu');
    this.context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
    this.ring = Array.from({ length: RING }, () => ({ buf: alloc.buffer(device, { size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), owner: null }));
    this.counts = alloc.buffer(device, { size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    this.timestamps = timestamps ? { set: device.createQuerySet({ type: 'timestamp', count: 2 * QUERY_PAIRS }), resolve: alloc.buffer(device, { size: QUERY_STRIDE * QUERY_PAIRS, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }), next: 0 } : null;
    this.targets = null; this.retired = [];
  }

  onPublish(handler) { this.handlers.add(handler); return () => this.handlers.delete(handler); }
  // `submits` counts every queue submission, timestamp readback copies included; rendered work is described by `bands` and the events.
  stats() { return { outstandingMax: this.ledger.maxObserved(), submits: this.submits, bands: this.bands.slice(), planner: this.job?.planner.stats() ?? null }; }
  epochLive() { return this.alive && !this.abort.aborted && this.epoch() === this.deviceEpoch; }
  live(job) { return this.epochLive() && job.epoch === this.deviceEpoch; }
  current(job) { return this.job === job && this.live(job); }

  // Every submission's completion settles its own credit, watchdog registration and resources exactly once, whether the completion
  // promise fulfils or rejects (Codex T7 r1, finding 4); then exactly one of onDone or onFail runs.
  settle(completion, ticket, done, cleanup, onDone, onFail) {
    let settled = false;
    const once = () => { if (settled) return false; settled = true; done(); cleanup(); this.ledger.release(ticket); return true; };
    completion.then(() => { if (once()) onDone(); }, error => { if (once()) onFail(error); });
  }
  // A rejected completion of the current generation ends the experiment (the waiting driver is woken); retired work is only recorded.
  failed(job, kind, error) {
    const current = this.current(job), message = error?.message ?? String(error);
    this.events.mark('submission-failed', { requestId: job.requestId, generation: job.generation, epoch: job.epoch, kind, current, message });
    if (current && this.abort.abort) this.abort.abort({ kind: 'submission-failed', message: `${kind} completion rejected: ${message}` });
    return current;
  }

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
    if (this.epoch() !== this.deviceEpoch) throw new Error(`renderer device epoch ${this.deviceEpoch} has retired (current epoch ${this.epoch()}): a replacement device needs a replacement renderer`);
    if (Object.keys(override).some(k => !['W', 'H'].includes(k))) throw new Error('render override may only set W and H');
    const fx = this.fixtures, v = fx.views[view], p = { ...fx.profiles[profile], ...(v.traceOverrides || {}), ...override };
    const cam = camera || v.camera;
    const f = norm(cam.target.map((x, i) => x - cam.origin[i])), r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
    const camWords = new Float32Array(24), camU = new Uint32Array(camWords.buffer);
    [cam.origin, f, r, u].forEach((vec, i) => camWords.set(vec, 4 * i)); camU.set([p.W, p.H, 0, 0], 16);
    this.job = { requestId, generation: ++this.generation, epoch: this.deviceEpoch, label, view, W: p.W, H: p.H, profile: p,
      pipeline: view === 'sphere' ? this.viewport.sphere : this.viewport.bulb, camWords, targets: this.targetsFor(p.W, p.H),
      planner: new Planner({ rows: p.H, cols: p.W, carry: this.carry }), counted: false };
    this.pendingFinish = null;
    this.pump();
    return requestId;
  }

  // Called on every credit or reservation release and every new request: waiting timestamp copies first, then a waiting finish, then the
  // current generation's bands.
  pump() {
    this.serveWaiters();
    const job = this.job;
    if (!job || !this.live(job) || this.watchdog.stopped) return;
    if (this.pendingFinish === job) {
      // A finish is admitted only with both a credit and a readback reservation (Codex T7 r1, finding 1), so it never publishes without counts.
      const slot = this.ledger.available() ? this.ring.find(s => s.owner === null) : null;
      if (slot) { this.pendingFinish = null; this.finish(job, slot); }
      return;
    }
    while (this.ledger.available()) {
      const band = job.planner.next(); if (!band) return;
      if (!job.counted) { job.counted = true; this.device.queue.writeBuffer(this.counts, 0, new Uint32Array(8)); }
      const ticket = this.ledger.take({ epoch: job.epoch, generation: job.generation, requestId: job.requestId, kind: 'band' });
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
      if (ts !== null) enc.resolveQuerySet(this.timestamps.set, 2 * ts, 2, this.timestamps.resolve, QUERY_STRIDE * ts);
      const row = { requestId: job.requestId, generation: job.generation, epoch: job.epoch, batch, band, submitMs: null, doneMs: null, gpuMs: null, ts };
      const done = this.watchdog.submitted(`band:${batch}`, { requestId: job.requestId, generation: job.generation, epoch: job.epoch });
      this.device.queue.submit([enc.finish()]); this.submits++;
      row.submitMs = performance.now(); this.bands.push(row);
      this.events.mark('submit', { requestId: job.requestId, generation: job.generation, epoch: job.epoch, batch, kind: 'band' });
      this.settle(this.device.queue.onSubmittedWorkDone(), ticket, done, () => { prof.destroy(); camB.destroy(); dummy.destroy(); this.drained(t); }, () => {
        row.doneMs = performance.now();                                                   // its own credit is released even if obsolete
        const current = this.current(job);
        this.events.mark(current ? 'band-done' : 'stale-band', { requestId: job.requestId, generation: job.generation, batch });
        if (current) {
          job.planner.completed(band, row.doneMs - row.submitMs); this.carry = job.planner.carry();
          if (job.planner.done()) this.pendingFinish = job;
        }
        this.pump();
      }, error => { this.failed(job, 'band', error); this.pump(); });
    }
  }

  finish(job, slot) {
    if (!this.current(job)) return;
    const { device } = this, t = job.targets; t.users++;
    const ticket = this.ledger.take({ epoch: job.epoch, generation: job.generation, requestId: job.requestId, kind: 'finish' });
    slot.owner = job;                                                                     // reserved before the copy is encoded
    // Only the reservation's owner releases it, on every outcome; a freed slot wakes a waiting finish, or is destroyed after destroy().
    const release = () => { if (slot.owner !== job) return; slot.owner = null; if (this.alive) this.pump(); else slot.buf.destroy(); };
    const dstB = upload(device, this.alloc, new Float32Array([this.canvas.width, this.canvas.height, 0, 0]), GPUBufferUsage.UNIFORM);
    const g = this.alloc.bindGroup(device.createBindGroup({ layout: this.viewport.shade.getBindGroupLayout(0), entries: [{ binding: 0, resource: t.status.createView() }, { binding: 1, resource: t.normal.createView() }, { binding: 2, resource: t.display.createView() }, { binding: 3, resource: { buffer: this.counts } }] }));
    const blitGroup = this.alloc.bindGroup(device.createBindGroup({ layout: this.viewport.blit.getBindGroupLayout(0), entries: [{ binding: 0, resource: t.display.createView() }, { binding: 1, resource: { buffer: dstB } }] }));
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(this.viewport.shade); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(t.W / 8), Math.ceil(t.H / 8)); pass.end();
    enc.copyBufferToBuffer(this.counts, 0, slot.buf, 0, 32);
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }] });
    rp.setPipeline(this.viewport.blit); rp.setBindGroup(0, blitGroup); rp.draw(3); rp.end();
    const done = this.watchdog.submitted(`finish:${job.requestId}`, { requestId: job.requestId, generation: job.generation, epoch: job.epoch });
    device.queue.submit([enc.finish()]); this.submits++;
    this.events.mark('submit', { requestId: job.requestId, generation: job.generation, epoch: job.epoch, batch: ++this.batchSeq, kind: 'finish' });
    const suppressed = () => { this.events.mark('suppressed-publication', { requestId: job.requestId }); };
    this.settle(device.queue.onSubmittedWorkDone(), ticket, done, () => { dstB.destroy(); this.drained(t); }, () => {
      this.events.mark('complete', { requestId: job.requestId });
      this.pump();                                                                        // the released credit may serve a newer request
      if (!this.current(job)) { release(); return suppressed(); }
      const abortRace = this.abort.race ? this.abort : { race: p => p };
      mapWithin(slot.buf, abortRace, this.mapDeadlineMs ?? 5000).then(() => {
        const c = new Uint32Array(slot.buf.getMappedRange().slice(0)); slot.buf.unmap();
        release();
        if (!this.current(job)) return suppressed();
        const counts = { total: c[0], hit: c[1], miss: c[2], point: c[3], steps: c[4], failure: c[5], normalUnavailable: c[6] };
        const e = this.events.mark('publish', { requestId: job.requestId, generation: job.generation, label: job.label, W: job.W, H: job.H, counts });
        for (const h of [...this.handlers]) h({ requestId: job.requestId, generation: job.generation, epoch: job.epoch, label: job.label, view: job.view, W: job.W, H: job.H, counts, publishedMs: e.t });
      }, error => {
        release();                                                                        // the reservation is released on every outcome
        // A current generation's mapping failure ends the experiment and wakes the waiting driver; a retired one stays suppressed.
        if (this.current(job) && this.abort.abort) this.abort.abort({ kind: 'harness', message: error.message });
        else suppressed();
      });
    }, error => { release(); if (!this.failed(job, 'finish', error)) suppressed(); this.pump(); });
  }

  // Timestamp copies wait for ledger credit with priority over bands; once the renderer can no longer submit, they are refused.
  serveWaiters() {
    if (!this.waiters.length) return;
    if (!this.epochLive()) { for (const w of this.waiters.splice(0)) w.reject(new Error('timestamp readback abandoned: the renderer can no longer submit')); return; }
    while (this.waiters.length && this.ledger.available()) this.waiters.shift().resolve(this.ledger.take({ epoch: this.deviceEpoch, kind: 'timestamp-readback' }));
  }

  // Outside measured windows: read the resolved timestamp pairs back. The copy is a submission like any other (Codex T7 r1, finding 2): it
  // takes ledger credit, so it counts towards the two outstanding, and its snapshot's identity is fixed when the copy is encoded: each slot
  // describes the last band submitted before it (queue order), never a band submitted while the readback is still mapping.
  async readTimestamps() {
    if (!this.timestamps || !this.alive) return { method: 'queue-completion', filled: 0 };
    const size = QUERY_STRIDE * QUERY_PAIRS;
    const abort = this.abort.race ? this.abort : { race: p => p, throwIfAborted() {} };
    abort.throwIfAborted();
    const check = () => { if (!this.epochLive()) throw new Error(`timestamp readback abandoned: the renderer was destroyed or aborted, or its device epoch ${this.deviceEpoch} retired`); };
    check();
    const ticket = this.ledger.available() && !this.waiters.length ? this.ledger.take({ epoch: this.deviceEpoch, kind: 'timestamp-readback' })
      : await abort.race(new Promise((resolve, reject) => this.waiters.push({ resolve, reject })));
    let read = null, done = () => {}, submitted = false, settled = false;
    const settle = () => { if (settled) return false; settled = true; done(); this.ledger.release(ticket); return true; };   // no pump here
    try {
      check();
      const owners = Array.from({ length: QUERY_PAIRS }, (_, slot) => this.bands.findLast(b => b.ts === slot) ?? null);
      read = this.alloc.buffer(this.device, { size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const enc = this.device.createCommandEncoder(); enc.copyBufferToBuffer(this.timestamps.resolve, 0, read, 0, size);
      done = this.watchdog.submitted('timestamp-readback', { label: 'timestamp-readback', epoch: this.deviceEpoch });
      this.device.queue.submit([enc.finish()]); this.submits++; submitted = true;
      // Fulfilment and rejection are handled separately (Codex T7 r2, finding 5). A rejection in the live epoch is recorded and latches the
      // session abort *before* anything can pump, so no submission follows it; after destroy() or epoch retirement it only cleans up.
      // Either way the credit and watchdog registration settle exactly once.
      const completion = this.device.queue.onSubmittedWorkDone();
      completion.then(() => { if (settle()) this.pump(); }, error => {
        if (settled) return;
        const current = this.epochLive(), message = error?.message ?? String(error);
        this.events.mark('submission-failed', { epoch: this.deviceEpoch, kind: 'timestamp-readback', current, message });
        if (current && this.abort.abort) this.abort.abort({ kind: 'submission-failed', message: `timestamp-readback completion rejected: ${message}` });
        settle(); this.pump();
      });
      await abort.race(completion);
      check();
      await mapWithin(read, abort, this.mapDeadlineMs ?? 5000);
      check();
      const ns = new BigUint64Array(read.getMappedRange().slice(0)); read.unmap();
      let filled = 0;
      for (let slot = 0; slot < QUERY_PAIRS; slot++) {
        const base = (QUERY_STRIDE / 8) * slot, row = owners[slot];
        if (row && row.doneMs !== null && ns[base + 1] >= ns[base]) { row.gpuMs = Number(ns[base + 1] - ns[base]) / 1e6; filled++; }
      }
      return { method: 'timestamp-query', filled };
    } catch (error) { if (!submitted && settle()) this.pump(); throw error; }
    finally { read?.destroy(); }
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false; this.handlers.clear();
    for (const w of this.waiters.splice(0)) w.reject(new Error('renderer destroyed'));
    if (this.targets) this.retire(this.targets);
    for (const s of this.ring) if (s.owner === null) s.buf.destroy();                    // a reserved slot is destroyed by its owner's release
    this.counts.destroy(); this.timestamps?.set.destroy(); this.timestamps?.resolve.destroy();
  }
}
