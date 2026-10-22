import test from 'node:test';
import assert from 'node:assert/strict';
import { createRendererDeviceDouble } from '../support/renderer-device-double.mjs';
import { createFakeClock } from '../support/fake-clock.mjs';
import { createSpaceRenderer } from '../../src/space/render/renderer.js';
import { createWebGPUBackend } from '../../src/space/render/webgpu/backend.js';
import { createAdmission } from '../../src/space/render/backend.js';
import { productPipelineSet } from '../../src/space/render/webgpu/appearance.js';
import { createSpaceScene, sceneCodec } from '../../src/space/scene-adapter.js';
import { createSpaceRequest } from '../../src/space/render-adapter.js';

async function renderDrafts(model, groupDrafts) {
  const pipelineSet = productPipelineSet(), gpu = createRendererDeviceDouble(pipelineSet), clock = createFakeClock();
  const real = createWebGPUBackend({ canvas: gpu.canvas, clock, acquire: gpu.acquire, loadSource: gpu.loadSource, format: 'bgra8unorm' });
  const submissions = [], packets = [], presentations = [];
  const backend = { ...real,
    submitBatch(batch, options) { submissions.push(batch); return real.submitBatch(batch, options); },
    readback(desc, options) {
      const ticket = real.readback(desc, options);
      if (desc.fields[0] === 'draftDiagnostics') ticket.result.then(result => packets.push(result.data.slice()));
      return ticket;
    },
    present(desc, options) { presentations.push(desc); return real.present(desc, options); },
  };
  const renderer = createSpaceRenderer({ backend, clock, pipelineSet, viewId: 'space', groupDrafts,
    versions: { kernelVersion: 'equivalence-fixture-v1', tracingVersion: 'equivalence-fixture-v1' } });
  try {
    await renderer.prepare();
    const base = createSpaceScene({ model }), frames = [];
    for (const revision of [1, 2]) {
      const scene = revision === 1 ? base : sceneCodec.validate({ ...base, appearance: { ...base.appearance, viewMode: 'depth' } });
      const request = createSpaceRequest({ scene, purpose: 'interactive', width: 146, height: 142, profile: 'draft', viewId: 'space',
        generation: { deviceEpoch: real.currentEpoch(), viewRevision: revision, geometryRevision: 1, appearanceRevision: revision },
        versions: { kernelVersion: 'equivalence-fixture-v1', tracingVersion: 'equivalence-fixture-v1' } });
      const result = await renderer.render(request).done;
      assert.equal(result.outcome, 'completed', JSON.stringify(result.report));
      const batches = submissions.filter(batch => batch.identity.jobId === request.jobId);
      assert.ok(batches.length > 1, 'multiple regions exercise distinct origins and a clipped tail');
      assert.equal(batches.every(batch => !!batch.passes === groupDrafts), true, 'the requested grouped/single-pass path must actually run');
      const members = batches.flatMap(batch => batch.passes ?? [batch]);
      const passes = revision === 1 ? ['trace', 'normals', 'shade', 'accumulate', 'display'] : ['shade', 'accumulate', 'display'];
      assert.equal(batches.length, 4 * (groupDrafts ? 1 : passes.length), 'four regions, with one submission per group or pass');
      assert.deepEqual([...new Set(members.map(batch => batch.pass))], passes);
      if (groupDrafts) for (const batch of batches) assert.deepEqual(batch.passes.map(member => member.pass), passes);
      const presentation = presentations.at(-1);
      const ticket = real.readback({ identity: presentation.identity, source: presentation.display,
        region: { x: 0, y: 0, ...request.quality.internalSize }, fields: ['display'] },
      { admission: createAdmission({ epoch: real.currentEpoch(), jobId: request.jobId }) });
      const display = (await ticket.result).data;
      const packet = packets.at(-1), pixels = request.quality.internalSize.width * request.quality.internalSize.height;
      assert.equal(packet.length, pixels * (model === 'quaternion-julia' ? 12 : 8));
      assert.ok(display.some(byte => byte > 0 && byte < 255), 'compare nonempty colour output');
      assert.ok(new Set(display).size > 3, 'spatial variation must survive transport');
      assert.ok(packet.some(byte => byte !== 0), 'compare nonempty diagnostic output');
      if (model === 'quaternion-julia') {
        const words = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
        assert.ok(Array.from({ length: pixels }, (_, i) => words.getUint32(i * 12 + 8, true)).some(word => word !== 0), 'recovery evidence must be nonzero');
      }
      assert.ok(Array.from({ length: pixels }, (_, i) => display[i * 4 + 3]).every(alpha => alpha === 255), 'every display pixel is written');
      frames.push({ display, packet, masks: result.report.outcomeMasks, counts: result.report.rayTermination });
    }
    assert.notDeepEqual(frames[0].display, frames[1].display, 'the reuse request changes appearance');
    return frames;
  } finally { renderer.destroy(); real.destroy(); }
}

test('B15-R11-F4 product renderer grouped and single-pass drafts produce identical bytes including geometry reuse', async () => {
  for (const model of ['sphere', 'quaternion-julia']) {
    const grouped = await renderDrafts(model, true), singles = await renderDrafts(model, false);
    assert.deepEqual(grouped, singles, `${model}: display, packet and diagnostic evidence`);
  }
});
