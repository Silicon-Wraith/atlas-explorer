import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { ev, LIMITS, idleWithin } from './bounded.mjs';

async function measureInPage(scene) {
  const {createWebGPUBackend}=await import('/src/space/render/webgpu/backend.js');
  const {createSpaceRenderer}=await import('/src/space/render/renderer.js');
  const {createSpaceRequest}=await import('/src/space/render-adapter.js');
  const {sceneCodec}=await import('/src/space/scene-adapter.js');
  const {productPipelineSet}=await import('/src/space/render/webgpu/appearance.js');
  const {KERNEL_VERSION}=await import('/src/space/render/webgpu/kernels.js');
  const {TRACING_VERSION}=await import('/src/space/render/webgpu/passes.js');
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const backend=createWebGPUBackend({canvas,clock:performance}),versions={kernelVersion:KERNEL_VERSION,tracingVersion:TRACING_VERSION};
  const snapshots=[],observe=label=>{const d=backend.diagnostics();snapshots.push({label,at:performance.now(),tracked:d.tracked,retiring:d.retiring,peak:d.peak});};
  const proxy={...backend};
  for(const method of ['allocate','release','submitBatch','readback','present'])proxy[method]=(...args)=>{try{return backend[method](...args);}finally{observe(method);}};
  proxy.configureTargets=async(...args)=>{try{return await backend.configureTargets(...args);}finally{observe('configureTargets');}};
  globalThis.__b15MemoryPartial={snapshots,case:'settled retained-image replacement; no forced in-flight overlap'};
  const renderer=createSpaceRenderer({backend:proxy,clock:()=>performance.now(),viewId:'b15-4k',versions,pipelineSet:productPipelineSet()}),reports=[],publications=[];
  Object.assign(__b15MemoryPartial,{reports,publications});
  renderer.onReport(r=>{const{outcomeMasks,...rest}=r;reports.push(rest);});renderer.onPublish(p=>publications.push(p));
  let revision=1;
  const generation=()=>({deviceEpoch:backend.currentEpoch(),viewRevision:revision,geometryRevision:revision,appearanceRevision:1});
  try {
    await renderer.prepare();observe('prepared');
    const request=scene=>createSpaceRequest({scene:sceneCodec.validate(scene),purpose:'interactive',width:3840,height:2160,profile:'settled',generation:generation(),viewId:'b15-4k',versions});
    const first=await renderer.render(request(scene),{currentGeneration:generation}).done;observe('first-settled');
    revision++;
    // Real replacement while the first image/cache are retained. This allocates
    // at 4K; no viewport extrapolation and no sampling of only the settled total.
    const changed=structuredClone(scene);changed.camera.positionLocal[0]+=0.1;
    const second=await renderer.render(request(changed),{currentGeneration:generation}).done;observe('replacement-settled');
    return {case:'settled retained-image replacement; no forced in-flight overlap',peakRetiringObserved:Math.max(0,...snapshots.map(s=>s.retiring)),dimensions:{width:3840,height:2160},layout:'space-targets-v2',layoutBytesPerPixel:76,first:first.outcome,replacement:second.outcome,
      peakConcurrentTracked:backend.diagnostics().peak,snapshots,reports,publications,driverAllocations:'unavailable; allocator tracks application-owned resources only'};
  } finally {renderer.destroy();backend.destroy();canvas.remove();}
}
export async function runMemory({page,url,environment,report,pass}) {
  await page.goto(url);await page.waitForFunction(()=>document.body.dataset.ready==='true');await idleWithin(page);
  const manifest=JSON.parse(await readFile('tests/reference/performance-workload.json','utf8'));
  let measured;
  try {measured=await ev(page,measureInPage,manifest.scenes.find(s=>s.id==='bulb').scene,'4K concurrent allocation measurement',LIMITS.deep);}
  catch(error) {let partial=null;try{partial=await ev(page,()=>globalThis.__b15MemoryPartial??null,undefined,'partial allocation evidence');}catch{} measured={outcome:'inconclusive',error:String(error.stack??error),partial};}
  const result={...measured,environment};
  report.push({name:'4K concurrent tracked allocation',...result});await mkdir('docs/reports/project1b',{recursive:true});
  await writeFile('docs/reports/project1b/1b1-memory-4k.json',JSON.stringify(result,null,2)+'\n');
  assert.equal(result.first,'completed');assert.equal(result.replacement,'completed');assert.ok(result.peakConcurrentTracked<=2**30);
  pass('4K settled replacement measures peak concurrent tracked allocations',result);
}
