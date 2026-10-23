// Diagnostic-only native instrumentation. A separate repetition sums pass durations;
// no host mapping interval is included in active GPU work. No clock policy changes.
import { acquireDevice } from '../../src/space/render/webgpu/device.js';
export function timestampAcquisition({ acquire = acquireDevice, onSample = () => {} } = {}) {
  const pending=new Set(), samples=[];let bytes=0,peakBytes=0;
  async function instrument(options){
    const receipt=await acquire(options),device=receipt.device;
    if(!receipt.features.timestampQuery)throw Error('timestamp-query unavailable: instrumented repetition cannot run');
    const originalEncoder=device.createCommandEncoder.bind(device),originalSubmit=device.queue.submit.bind(device.queue),originalFence=device.queue.onSubmittedWorkDone.bind(device.queue);
    // Instrumented repetitions keep their frame/lease slot through timestamp copy-out.
    // This bounds query storage to the same two submissions; its extra synchronization
    // is measurement overhead and is never mixed with plain repetitions.
    device.queue.onSubmittedWorkDone=()=>Promise.all([originalFence(),...pending]).then(()=>undefined);
    const metadata=new WeakMap();
    device.createCommandEncoder=descriptor=>{
      const encoder=originalEncoder(descriptor),querySet=device.createQuerySet({type:'timestamp',count:32});
      const resolve=device.createBuffer({label:'ladder-query-resolve',size:256,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
      const staging=device.createBuffer({label:'ladder-query-map',size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      bytes+=512;peakBytes=Math.max(bytes,peakBytes);let count=0;const passes=[];
      for(const name of ['beginComputePass','beginRenderPass']){
        const begin=encoder[name].bind(encoder);
        encoder[name]=(desc={})=>{if(count>=32)throw Error('timestamp pass bound');const first=count;count+=2;passes.push(desc.label??name);return begin({...desc,timestampWrites:{querySet,beginningOfPassWriteIndex:first,endOfPassWriteIndex:first+1}});};
      }
      const finish=encoder.finish.bind(encoder);
      encoder.finish=()=>{
        if(count){encoder.resolveQuerySet(querySet,0,count,resolve,0);encoder.copyBufferToBuffer(resolve,0,staging,0,count*8);}
        const buffer=finish();metadata.set(buffer,{querySet,resolve,staging,count,passes,label:descriptor?.label});return buffer;
      };return encoder;
    };
    device.queue.submit=buffers=>{
      originalSubmit(buffers);
      for(const buffer of buffers){const m=metadata.get(buffer);if(!m)continue;metadata.delete(buffer);
        const work=(async()=>{try{
          await originalFence();
          if(!m.count)return;
          await m.staging.mapAsync(GPUMapMode.READ);
          const words=new BigUint64Array(m.staging.getMappedRange()).slice(0,m.count);
          m.staging.unmap();const durations=m.passes.map((label,i)=>{const delta=words[2*i+1]-words[2*i];if(delta<0n)throw Error('negative GPU timestamp delta');return {label,ms:Number(delta)/1e6};});
          const sample={label:m.label,passes:durations,activeGpuMs:durations.reduce((sum,p)=>sum+p.ms,0)};samples.push(sample);onSample(sample);
        }catch(error){const sample={label:m.label,error:String(error),activeGpuMs:null};samples.push(sample);onSample(sample);}
        finally{m.querySet.destroy();m.resolve.destroy();m.staging.destroy();bytes-=512;}})();
        pending.add(work);work.finally(()=>pending.delete(work));
      }
    };
    return receipt;
  }
  return {acquire:instrument,samples,async drain(){await Promise.all([...pending]);},diagnostics:()=>({trackedInstrumentationBytes:bytes,peakInstrumentationBytes:peakBytes})};
}
