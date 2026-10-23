// Deterministic pass data for renderer/backend transport tests, not a WGSL interpreter.
// Real product descriptors, uniform packing, bindings, dispatch, copies and tickets run;
// only native device operations and shader arithmetic are doubled. No GPU is opened.
import assert from 'node:assert/strict';
import { createGpuDouble } from './gpu-double.mjs';
import { packStatus } from '../../src/space/render/status.js';
import { reduceDraftPacket } from '../../src/space/render/draft-summary.js';

const texelBytes = { r32float: 4, r32uint: 4, rgba16float: 8, rgba32float: 16, rgba8unorm: 4 };
// One DataView per backing ArrayBuffer (identical to constructing one per access, which
// dominated the per-pixel loops and pushed the ladder unit file past its 10 s bound).
const views = new WeakMap();
const view = resource => { const buffer = resource.data.buffer; let value = views.get(buffer); if (!value) views.set(buffer, value = new DataView(buffer)); return value; };
export function createRendererDeviceDouble(pipelineSet, options = {}) {
  const gpu = createGpuDouble({ limits: { maxComputeWorkgroupsPerDimension: 8, ...options.limits } });
  const descriptors = new Map(pipelineSet.descriptors.map(d => [d.pipelineId, d]));
  const acquire = gpu.acquire;
  gpu.acquire = async options => {
    const result = await acquire(options), device = result.device;
    const createTexture = device.createTexture, createEncoder = device.createCommandEncoder, submit = device.queue.submit;
    device.createTexture = descriptor => {
      const texture = createTexture(descriptor);
      texture.width = descriptor.size[0]; texture.height = descriptor.size[1];
      texture.bpt = texelBytes[descriptor.format];
      assert.ok(texture.bpt, descriptor.format);
      texture.data = new Uint8Array(texture.width * texture.height * texture.bpt).fill(0xcd);
      return texture;
    };
    device.createCommandEncoder = options => {
      const encoder = createEncoder(options), finish = encoder.finish, copies = [], clears = [];
      encoder.clearBuffer = buffer => clears.push(() => buffer.data.fill(0));
      encoder.copyBufferToBuffer = (source, offset, target, dest, bytes) => copies.push(() => target.data.set(source.data.subarray(offset, offset + bytes), dest));
      encoder.copyTextureToBuffer = ({ texture, origin }, { buffer, offset, bytesPerRow }, size) => copies.push(() => {
        for (let y = 0; y < size.height; y++) {
          const start = ((origin.y + y) * texture.width + origin.x) * texture.bpt;
          buffer.data.set(texture.data.subarray(start, start + size.width * texture.bpt), offset + y * bytesPerRow);
        }
      });
      encoder.finish = () => ({ ...finish(), copies, clears });
      return encoder;
    };
    device.queue.submit = buffers => {
      for (const buffer of buffers) {
        for (const clear of buffer.clears) clear();
        for (const command of buffer.commands) execute(command);
        for (const copy of buffer.copies) copy();
      }
      submit(buffers);
    };
    return result;
  };
  function execute(command) {
    const descriptor = descriptors.get(command.pipeline.descriptor.label), resources = {};
    for (const [index, binding] of descriptor.bindings.entries()) {
      const resource = command.group.descriptor.entries.find(e => e.binding === index).resource;
      resources[binding.slot] = resource.buffer ?? resource.texture;
    }
    const u = {}, uniform = view(resources.u);
    for (const field of descriptor.uniformLayout.fields) {
      const count = Number(field.type.match(/^vec(\d)/)?.[1] ?? 1);
      const values = Array.from({ length: count }, (_, i) => uniform[field.type.includes('f32') ? 'getFloat32' : 'getUint32'](field.offset + i * 4, true));
      u[field.name] = count === 1 ? values[0] : values;
    }
    const entry = descriptor.entryPoint;
    assert.deepEqual(command.dimensions, u.size.map(size => Math.ceil(size / 8)));
    if (entry === 'reduce_draft_summary') {
      resources.summary.data.set(reduceDraftPacket(resources.draftDiagnostics.data, { width: u.internalSize[0], height: u.internalSize[1], recovery: u.diagnosticStride === 3, producerToken: u.producerToken }));
      return;
    }
    // Views resolved once per dispatch, not per texel; the arithmetic below is unchanged.
    const V = Object.fromEntries(Object.entries(resources).filter(([, r]) => r?.data).map(([name, r]) => [name, view(r)]));
    for (let dy = 0; dy < u.size[1]; dy++) for (let dx = 0; dx < u.size[0]; dx++) {
      const x = u.origin[0] + dx, y = u.origin[1] + dy;
      const offset = name => (y * resources[name].width + x) * resources[name].bpt;
      const word = name => V[name].getUint32(offset(name), true);
      const put = (name, value) => V[name].setUint32(offset(name), value, true);
      if (entry === 'probe') { put('probe_target', 0x41544c53); continue; }
      if (entry === 'trace_band') {
        const hit = (x + 3 * y) % 5 !== 0;
        put('status', packStatus({ status: hit ? 0 : 1, reason: 0, subreason: 0, steps: 1 + (x + y) % 31 }));
        V.depth.setFloat32(offset('depth'), 1 + x / 128 + y / 256, true);
        put('recovery', hit && descriptor.pipelineId.includes('quaternion') ? 0x111 : 0);
      } else if (entry === 'normals_band') {
        const normal = V.normal, at = offset('normal');
        for (let k = 0; k < 3; k++) normal.setUint16(at + k * 2, 0x3000 + (word('depth') + x + y + k) % 256, true);
        normal.setUint16(at + 6, (word('status') & 15) === 0 ? 0x3c00 : 0, true);
      } else if (entry === 'shade_band' || entry.startsWith('diagnostic_')) {
        const colour = V.sampleColor, at = offset('sampleColor');
        const seed = word('depth') + word('status') + word('normal') + (u.seed ?? 0) + (entry === 'shade_band' ? 0 : 71);
        for (let k = 0; k < 4; k++) colour.setUint16(at + k * 2, 0x3000 + (seed + 19 * k) % 512, true);
        put('lightingStatus', 0);
      } else if (entry === 'accumulate_band') {
        const colour = V.sampleColor, output = V.next;
        for (let k = 0; k < 4; k++) output.setFloat32(offset('next') + k * 4, colour.getUint16(offset('sampleColor') + k * 2, true) / 16384, true);
        put('accumulationFlags', (word('status') & 15) === 0 && !V.normal.getUint16(offset('normal') + 6, true) ? 4 : 0);
      } else if (entry === 'display_band' || entry === 'display_draft_band' || entry === 'display_summary_band') {
        const accumulation = V.accumulation, at = offset('display');
        for (let k = 0; k < 3; k++) resources.display.data[at + k] = Math.round(accumulation.getFloat32(offset('accumulation') + k * 4, true) * 255) ^ word('accumulationFlags');
        resources.display.data[at + 3] = 255;
        if (entry === 'display_band') continue;
        const packet = V.draftDiagnostics, index = (y * resources.display.width + x) * u.diagnosticStride * 4;
        packet.setUint32(index, word('status'), true);
        packet.setUint32(index + 4, (entry === 'display_summary_band' ? u.producerToken * 2 : 0x41540000) | (V.normal.getUint16(offset('normal') + 6, true) ? 1 : 0), true);
        if (u.diagnosticStride === 3) packet.setUint32(index + 8, word('recovery'), true);
      } else assert.fail(`unexpected fixture entry point ${entry}`);
    }
  }
  return gpu;
}
