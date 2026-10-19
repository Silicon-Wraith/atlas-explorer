// spikes/project0/browser/drivers/resources.js — the A.8 exercise (shared with G12) and the G11 driver. Raw observations only.
import { source, compile, upload, mapWithin, MAP_DEADLINE_MS } from '../../gpu/webgpu.js';
import { session, failure } from './common.js';
import { CORRECTNESS_ONLY } from '../../timing-contract.js';   // the timing-method contract: every G11 rule bounds bytes or counts, none a duration

const FORMATS = ['r32float', 'rgba16float', 'r32uint', 'rgba32float', 'rgba8unorm'];
const f16 = h => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15); };

export async function prepareResourceCheck(device, alloc) {
  const module = await compile(device, await source('./pattern.wgsl'), 'pattern');
  const pipelines = {};
  for (const f of FORMATS) pipelines[f] = alloc.pipeline(await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: `write_${f}` } }));
  return { pipelines };
}

export async function exerciseResources(device, alloc, watchdog, abort, fx, prepared, status = () => {}, { mapDeadlineMs = MAP_DEADLINE_MS } = {}) {
  const R = fx.resources, S = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC;
  const raw = { tableBytes: R.tableBytes, before: alloc.inventory(), errors: [], written: [], checks: [], bandOk: false, fullBandBytes: R.readback.fullBand.width * 4 * R.readback.fullBand.height, cancel: { before: 0, after: 0 }, outstandingMax: 0 };
  const owned = []; let outstanding = [];
  const submit = async (enc, meta) => {
    while (outstanding.length >= 2) await abort.race(outstanding.shift());
    abort.throwIfAborted();
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
    await abort.race(Promise.all(outstanding)); outstanding = [];
    status('G11: verifying');
    const [stage, band] = staging;
    for (const { e, r, tex } of made) {
      const enc = device.createCommandEncoder(); let slot = 0;
      for (const y of R.readback.y) for (const x of R.readback.x) enc.copyTextureToBuffer({ texture: tex, origin: [x, y] }, { buffer: stage, offset: 256 * slot++ }, [1, 1]);
      await submit(enc, `readback:${e.name}`); await abort.race(Promise.all(outstanding)); outstanding = [];
      await mapWithin(stage, abort, mapDeadlineMs, 0, 256 * 9); const bytes = stage.getMappedRange(0, 256 * 9).slice(0); stage.unmap();
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
      await submit(enc, 'band'); await abort.race(Promise.all(outstanding)); outstanding = [];
      await mapWithin(band, abort, mapDeadlineMs); const full = new Uint8Array(band.getMappedRange().slice(0)); band.unmap();
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
    await abort.race(Promise.all(outstanding)); outstanding = [];
    raw.peakBytes = alloc.inventory().peakBytes;
  } catch (error) { raw.errors.push(error?.abort && abort.aborted ? abort.invalidation() : error.message); }   // the original error, or the stop that raised it
  finally {
    // T8 fix round 1 (Codex T8 r1, finding 2): the drain races the abort, so a later stop (the watchdog) ends it; after an abort it never
    // waits for GPU promises to settle. Every resource is destroyed whatever the drain does, and a stop latched at any point is kept beside
    // the original error.
    try { if (!abort.aborted) await abort.race(Promise.allSettled(outstanding)); }
    catch { /* the abort ended the drain: recorded below */ }
    finally { for (const r of owned) r.destroy(); }
    const stop = abort.invalidation();
    if (stop && !raw.errors.includes(stop)) raw.errors.push(stop);
    raw.after = alloc.inventory();
  }
  return raw;
}

export async function run(gate, fx, params, status) {
  const s = await session(fx, status);
  try {
    const prepared = await prepareResourceCheck(s.device, s.alloc);
    const raw = await exerciseResources(s.device, s.alloc, s.watchdog, s.abort, fx, prepared, status);
    return { slots: [{ slot: '4k', raw, timingMethod: CORRECTNESS_ONLY }], invalidations: s.abort.aborted ? [s.abort.invalidation()] : [] };
  } catch (error) { return { slots: [], invalidations: [failure(s, error)] }; }
  finally { s.close(); }
}
