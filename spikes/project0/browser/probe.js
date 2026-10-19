// spikes/project0/browser/probe.js — first GPU run: adapter identity, one bounded dispatch with verified readback,
// canvas presentation (headed), and intentional destruction. Returns raw observations only.
import { acquire, destroy, onLoss } from '../gpu/device.js';
import { createAbort } from '../gpu/abort.js';

// The probe is the first GPU run, before T6's watchdog module exists, so it carries its own minimal 5 s stall guard:
// every wait races an abort that fires if no submitted work completes for 5 s, or on an unexpected loss.
const SOFTWARE = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render/i;
export const softwareReason = info => info.isFallbackAdapter === true ? 'isFallbackAdapter is true'
  : [info.vendor, info.architecture, info.device, info.description].some(v => SOFTWARE.test(v)) ? `adapter identity names a software renderer: ${info.vendor}/${info.architecture}/${info.device}/${info.description}` : null;

export async function runProbe(params, say) {
  const raw = { ok: false }, abort = createAbort(), extra = { invalidations: [], metrics: {} };
  const offLoss = onLoss(info => abort.abort({ kind: 'device-lost', message: info.reason }));
  const stalled = () => abort.abort({ kind: 'stall', outstanding: [{ id: 'probe', ageMs: 5000 }] });
  const guard = async p => { const t = setTimeout(stalled, 5000); try { return await abort.race(p); } finally { clearTimeout(t); } };
  try {
    say('probe: acquiring adapter…');
    const { device, info, epoch } = await guard(acquire({ requiredFeatures: ['timestamp-query'] }));
    raw.info = info; raw.epoch = epoch;
    const software = softwareReason(info);
    if (software || (!info.vendor && !info.architecture && !info.device && !info.description)) {   // software, or an identity too empty to be hardware evidence
      if (software) { extra.invalidations.push(`software adapter: ${software}`); extra.metrics.software = 1; raw.software = software; }
      else raw.error = 'adapter identity unknown: no vendor, architecture, device or description';
      offLoss(); destroy();
      return { slots: [{ slot: params.get('runMode'), raw }], ...extra, invalidations: [...extra.invalidations, ...(abort.aborted ? [abort.invalidation()] : [])] };
    }
    // Every asynchronous preparation step races the abort, so a loss or stall ends the probe even if the browser promise never settles.
    const response = await guard(fetch(new URL('../gpu/probe.wgsl', import.meta.url)));
    if (!response.ok) throw new Error(`probe.wgsl: HTTP ${response.status}`);
    const module = device.createShaderModule({ code: await guard(response.text()) });
    raw.compilation = (await guard(module.getCompilationInfo())).messages.map(m => `${m.type}: ${m.message}`);
    const pipeline = await guard(device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } }));
    abort.throwIfAborted();                                        // nothing is allocated or submitted after a loss
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
    await guard(read.mapAsync(GPUMapMode.READ));
    const values = new Uint32Array(read.getMappedRange().slice(0)); read.unmap();
    raw.readback = { mismatches: [...values].filter((v, i) => v !== (i < n ? 3 * i + 1 : 0xdeadbeef)).length, n, length: values.length };
    if (params.get('runMode') === 'headed') {
      const context = document.getElementById('view').getContext('webgpu');
      context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
      const e2 = device.createCommandEncoder();
      e2.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0.1, g: 0.6, b: 0.2, a: 1 }, storeOp: 'store' }] }).end();
      device.queue.submit([e2.finish()]); await guard(device.queue.onSubmittedWorkDone());
      raw.presented = true;
    }
    for (const b of [uniform, out, read]) b.destroy();
    offLoss();                                                     // the intentional destruction below is not an abort
    const loss = new Promise(resolve => { const off = onLoss(info => { off(); resolve(info); }); });
    const lost = device.lost;
    destroy();                                                     // intentional: epoch retires before destruction
    raw.lostReason = (await guard(lost)).reason;
    raw.lossHandlerFired = await Promise.race([loss.then(() => true), new Promise(r => setTimeout(() => r(false), 1000))]);
    raw.ok = raw.readback.mismatches === 0 && raw.compilation.every(m => !m.startsWith('error'));
  } catch (error) { raw.error = `${error.code || error.name}: ${error.message}`; }
  finally { offLoss(); }
  return { slots: [{ slot: params.get('runMode'), raw }], metrics: extra.metrics, invalidations: [...extra.invalidations, ...(abort.aborted ? [abort.invalidation()] : [])] };
}
