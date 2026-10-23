import test from 'node:test';
import assert from 'node:assert/strict';
import { createRendererDeviceDouble } from '../support/renderer-device-double.mjs';
import { productPipelineSet } from '../../src/space/render/webgpu/appearance.js';
import { createWebGPUBackend } from '../../src/space/render/webgpu/backend.js';
import { createSpaceRenderer } from '../../src/space/render/renderer.js';
import { createSpaceRequest } from '../../src/space/render-adapter.js';
import { createSpaceScene } from '../../src/space/scene-adapter.js';
const versions={kernelVersion:'fixture',tracingVersion:'fixture'};
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
async function setup(rung='L6a'){
  const pipelineSet=productPipelineSet(),gpu=createRendererDeviceDouble(pipelineSet),batches=[],presents=[],updates=[];
  const real=createWebGPUBackend({canvas:gpu.canvas,clock:performance,acquire:gpu.acquire,loadSource:gpu.loadSource,format:'bgra8unorm',draftExecution:rung});
  const backend={...real,submitBatch(...args){const ticket=real.submitBatch(...args);batches.push({batch:args[0],ticket});return ticket;},present(...args){presents.push(args[0]);return real.present(...args);}};
  const renderer=createSpaceRenderer({backend,clock:()=>performance.now(),viewId:'space',versions,pipelineSet,draftExecution:rung});renderer.onPublicationUpdate(u=>updates.push(u));await renderer.prepare();
  const request=()=>createSpaceRequest({scene:createSpaceScene({model:'quaternion-julia'}),purpose:'interactive',width:26,height:18,profile:'draft',viewId:'space',versions,generation:{deviceEpoch:real.currentEpoch(),viewRevision:1,geometryRevision:1,appearanceRevision:1}});
  return {gpu,real,renderer,batches,presents,updates,request};
}
test('B15-REC-G real backend holds summary and staging through mapping and rejects corrupt evidence before present',async()=>{
  const h=await setup();try{
    h.gpu.control.maps.held=true;const r=h.request(),job=h.renderer.render(r);
    for(let i=0;i<100&&!h.batches.some(b=>b.batch.draft);i++)await flush();
    const item=h.batches.find(b=>b.batch.draft);assert.ok(item);assert.equal((await item.ticket.done).outcome,'completed');
    assert.equal(h.presents.length,0);
    const inventory=h.real.diagnostics().inventory;
    assert.equal(inventory.find(e=>e.id===item.batch.draft.summary.id).mappings,1);
    const staging=h.gpu.control.natives.filter(n=>n.descriptor.label?.startsWith('readback-staging')&&!n.destroyed).at(-1);
    new DataView(staging.data.buffer).setUint32(8,1,true);h.gpu.control.maps.release();
    const result=await job.done;assert.equal(result.outcome,'failed');assert.equal(h.presents.length,0);
    assert.ok(h.real.diagnostics().inventory.every(e=>e.mappings===0));
  }finally{h.renderer.destroy();h.real.destroy();}
});
test('B15-REC-G real backend loss interrupts a pending combined frame and isolates the reacquired epoch',async()=>{
  const h=await setup('L6d');try{
    h.gpu.control.maps.held=true;const first=h.renderer.render(h.request());
    for(let i=0;i<100&&!h.batches.some(b=>b.batch.draft);i++)await flush();
    await h.batches.find(b=>b.batch.draft).ticket.done;await h.real.testAdapter.destroyDevice();
    assert.equal((await first.done).outcome,'interrupted');assert.deepEqual(h.updates.map(u=>u.diagnosticsState),['interrupted']);
    h.gpu.control.maps.release();await h.renderer.prepare();const next=await h.renderer.render(h.request()).done;
    assert.equal(next.outcome,'completed');assert.deepEqual(h.updates.map(u=>u.diagnosticsState),['interrupted','confirmed']);
    assert.ok(h.updates[1].identity.generation.deviceEpoch>h.updates[0].identity.generation.deviceEpoch);
  }finally{h.renderer.destroy();h.real.destroy();}
});
test('B15-REC-G a combined frame rejected before queue entry never creates a presentation record',async()=>{
  const h=await setup('L6d');try{
    const events=[];h.renderer.onPublish(p=>events.push(p));
    const device=h.gpu.control.devices[0],original=device.createCommandEncoder;
    device.createCommandEncoder=options=>{if(options.label==='draft-group')throw Error('encode rejected before submit');return original(options);};
    const result=await h.renderer.render(h.request()).done;
    assert.equal(result.outcome,'failed');assert.deepEqual(events,[]);assert.deepEqual(h.updates,[]);
  }finally{h.renderer.destroy();h.real.destroy();}
});

test('r4-F2 real backend loss emits interrupted before any late renderer summary callback', async () => {
  const h = await setup('L6d');
  try {
    const frames = []; h.renderer.onPublicationRecord(frame => frames.push(frame));
    h.gpu.control.maps.held = true;
    const job = h.renderer.render(h.request());
    for (let i = 0; i < 100 && (!frames.length || !h.real.diagnostics().inventory.some(e => e.mappings)); i++) await flush();
    assert.equal(frames.length, 1);
    assert.ok(h.real.diagnostics().inventory.some(e => e.mappings), 'pending mapping at device loss');
    await h.real.testAdapter.destroyDevice();
    assert.equal((await job.done).outcome, 'interrupted');
    assert.deepEqual(h.updates.map(u => [u.frameId, u.diagnosticsState]), [[frames[0].frameId, 'interrupted']]);
    h.gpu.control.maps.release();
    await h.renderer.prepare();
    assert.equal((await h.renderer.render(h.request()).done).outcome, 'completed');
    assert.deepEqual(h.updates.filter(u => u.frameId === frames[0].frameId).map(u => u.diagnosticsState), ['interrupted']);
    assert.equal(h.updates.at(-1).diagnosticsState, 'confirmed');
    assert.ok(h.updates.at(-1).identity.generation.deviceEpoch > frames[0].identity.generation.deviceEpoch);
  } finally { h.gpu.control.maps.release(); h.renderer.destroy(); h.real.destroy(); }
});

test('B15 r14 unpaced newest-wins cannot accumulate reservations behind a held configure', async () => {
  const h = await setup(), jobs = [];
  const baseline = h.gpu.control.natives.filter(n=>n.kind==='texture').length;
  try {
    h.gpu.control.scopes.held = true;
    for (let i = 0; i < 80; i++) {
      const request = h.request();
      jobs.push(h.renderer.render(request, {currentNavigation:()=>1}).done);
      await flush();
    }
    const textures = h.gpu.control.natives.filter(n => n.kind === 'texture');
    assert.ok(textures.length <= baseline + 11, `bounded configuration lane, saw ${textures.length} native textures`);
    assert.equal(h.real.diagnostics().inventory.filter(e=>e.width && e.state!=='pooled').length, 0, 'superseded configure holds no target reservation');
    h.gpu.control.scopes.release();
    const results = await Promise.all(jobs);
    assert.equal(results.at(-1).outcome, 'completed');
    assert.ok(results.slice(0,-1).every(r=>r.outcome==='superseded'));
  } finally { h.gpu.control.scopes.release(); await Promise.allSettled(jobs); h.renderer.destroy(); h.real.destroy(); }
});
