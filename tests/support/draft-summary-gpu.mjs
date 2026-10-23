// Executor-only correctness check: actual production WGSL reduces the same synthetic
// packet decoded by outcome-masks. CPU/reference/double tests never substitute for it.
import { acquireDevice } from '../../src/space/render/webgpu/device.js';
import { productPipelineSet } from '../../src/space/render/webgpu/appearance.js';
import { preparePipelines, packUniforms } from '../../src/space/render/webgpu/pipelines.js';
import { createPipelineSet } from '../../src/space/render/backend.js';
import { createOutcomeMasks } from '../../src/space/render/outcome-masks.js';
import { reduceDraftPacket, validateDraftSummary, draftSummaryBytes } from '../../src/space/render/draft-summary.js';
import { packetFixture } from './draft-summary-fixtures.mjs';
export async function checkGpuDraftSummary(){
  const receipt=await acquireDevice(),device=receipt.device,checks=[];
  const descriptor=productPipelineSet().descriptors.find(d=>d.pipelineId==='reduce_draft_summary');
  const prepared=await preparePipelines({device,pipelineSet:createPipelineSet({id:'rec-g-equivalence-v1',descriptors:[descriptor]}),limits:receipt.limits});
  const pipeline=prepared.pipelines.get(descriptor.pipelineId).pipeline;
  function buffer(bytes,usage,data){const b=device.createBuffer({size:bytes,usage,mappedAtCreation:!!data});if(data){new Uint8Array(b.getMappedRange()).set(data);b.unmap();}return b;}
  try{
    for(const recovery of [false,true])for(const [width,height] of [[1,1],[13,9],[64,17]]){
      const size=draftSummaryBytes(recovery),summary=buffer(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),staging=buffer(size,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
      try{for(const mutation of ['valid','reuse','coverage','status','reason','recovery','stale']){
        if(!recovery&&mutation==='recovery')continue;
        const producerToken=mutation==='reuse'?102:101,options={width,height,recovery,producerToken},packet=packetFixture(options),view=new DataView(packet.buffer);
        if(mutation==='coverage')view.setUint32(4,0,true);
        if(mutation==='status')view.setUint32(0,15,true);
        if(mutation==='reason')view.setUint32(0,0x72,true);
        if(mutation==='recovery')view.setUint32(8,0x411,true);
        if(mutation==='stale')view.setUint32(4,200,true);
        const input=buffer(packet.length,GPUBufferUsage.STORAGE,packet),uniforms=buffer(32,GPUBufferUsage.UNIFORM,packUniforms(descriptor.uniformLayout,{origin:[0,0],size:[width,height],internalSize:[width,height],diagnosticStride:recovery?3:2,producerToken}));
        try{
          device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');
          const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[input,summary].map((b,i)=>({binding:i+1,resource:{buffer:b}})).concat({binding:0,resource:{buffer:uniforms}})});
          const encoder=device.createCommandEncoder();encoder.clearBuffer(summary);const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));pass.end();encoder.copyBufferToBuffer(summary,0,staging,0,size);device.queue.submit([encoder.finish()]);
          const scopes=Promise.all([device.popErrorScope(),device.popErrorScope()]);await device.queue.onSubmittedWorkDone();const errors=await scopes;if(errors.some(Boolean))throw Error(JSON.stringify(errors));
          await staging.mapAsync(GPUMapMode.READ);const gpu=new Uint8Array(staging.getMappedRange()).slice();staging.unmap();
          const reference=reduceDraftPacket(packet,options);if(gpu.some((byte,i)=>byte!==reference[i]))throw Error(`GPU/reference byte mismatch ${mutation}`);
          let full=null,reduced=null,fullError=null,reducedError=null;
          try{const masks=createOutcomeMasks({width,height},{recovery,producerToken}),id={accumulationKey:'same-packet',sample:0};masks.recordDraft(id,{x:0,y:0,width,height},packet);masks.end(id);full=masks.snapshot();}catch(e){fullError=String(e);}
          try{reduced=validateDraftSummary(gpu,{pixels:width*height,recovery,producerToken});}catch(e){reducedError=String(e);}
          if(!!fullError!==!!reducedError)throw Error(`GPU/full decode rejection mismatch ${mutation}`);
          if(full){const{sample,...metrics}=full.samples[0],recover=full.recovery?.samples[0],{sample:unused,...recoveryMetrics}=recover??{};
            if(JSON.stringify(reduced.metrics)!==JSON.stringify(metrics)||JSON.stringify(reduced.reasons)!==JSON.stringify(full.reasons.samples[0])||JSON.stringify(reduced.recovery)!==JSON.stringify(recover?recoveryMetrics:null))throw Error('GPU/full decode aggregate mismatch');}
          checks.push({recovery,width,height,mutation,accepted:!reducedError,bytes:size});
        }finally{input.destroy();uniforms.destroy();}
      }}finally{summary.destroy();staging.destroy();}
    }
    return {checks,identity:receipt.identity,features:receipt.features};
  }finally{device.destroy();}
}
