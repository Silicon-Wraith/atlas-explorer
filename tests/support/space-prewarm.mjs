import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {ev,LIMITS} from './bounded.mjs';
export function assessColdPrewarm(result) {
  const passed=result.cache?.verifiedEmptyBeforeLaunch===true&&result.firstOperation==='product-prewarm'&&result.outcome==='completed'&&
    Number.isFinite(result.preparationMs)&&result.preparationMs>=0&&result.preparationMs<=result.boundMs&&
    result.required?.length>0&&result.required.every(id=>result.prepared?.includes(id))&&result.uncaptured?.length===0;
  return {passed,reason:passed?'cold first-operation product pipeline set prepared within bound':'missing cold-cache, first-operation, pipeline, error or timing evidence'};
}
async function prepareFirstInPage() {
  const {createWebGPUBackend}=await import('/src/space/render/webgpu/backend.js');
  const {productPipelineSet,productPipelineDescriptors}=await import('/src/space/render/webgpu/appearance.js');
  const {PREPARATION_BOUND_MS}=await import('/src/space/render/webgpu/pipelines.js');
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const backend=createWebGPUBackend({canvas,clock:performance}),events=[];
  const startedAt=performance.now(),result={firstOperation:'product-prewarm',startedAt,boundMs:PREPARATION_BOUND_MS,required:productPipelineDescriptors().map(p=>p.pipelineId),events};
  try {
    const acquired=await backend.acquire();
    const receipt=await backend.prepare({epoch:acquired.epoch,pipelineSet:productPipelineSet(),onProgress:e=>events.push({...e,at:performance.now()})});
    Object.assign(result,{outcome:'completed',prepared:[...receipt.preparedPipelineIds],pipelineSetId:receipt.pipelineSetId,device:acquired.identity});
  } catch(error){Object.assign(result,{outcome:'failed',error:String(error.stack??error)});}
  finally {result.preparationMs=performance.now()-startedAt;result.uncaptured=backend.testAdapter.uncapturedErrors();backend.destroy();canvas.remove();}
  return result;
}
export async function runColdPrewarm({page,url,environment,report,pass}) {
  assert.equal(environment.chromeGpu?.vendorId,0x10de,'physical NVIDIA adapter required');
  assert.match(environment.webgpuStatus,/Hardware accelerated/i);
  // Empty same-origin document: no composition root, Plane shaders, numerical
  // probes, or earlier Space preparation can populate this process's caches.
  const target=`${url}/b15-cold-prewarm`;
  await page.route(target,route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>ATLAS cold preparation measurement</title>'}));
  await page.goto(target,{timeout:LIMITS.launch});
  let result;
  try {result=await ev(page,prepareFirstInPage,undefined,'first-operation cold product prewarm',LIMITS.deep);}
  catch(error){result={outcome:'inconclusive',firstOperation:'product-prewarm',error:String(error.stack??error)};}
  result={schema:'atlas.cold-prewarm',schemaVersion:1,...result,cache:environment.coldCache,environment};
  result.assessment=assessColdPrewarm(result);
  const outputDir=process.env.ATLAS_B15_REPORT_DIR??'docs/reports/project1b';
  await mkdir(outputDir,{recursive:true});await writeFile(`${outputDir}/1b1-cold-prewarm.json`,JSON.stringify(result,null,2)+'\n');
  report.push({name:'Cold product pipeline preparation evidence',...result});
  assert.equal(result.assessment.passed,true,result.assessment.reason);
  pass('Cold first-operation product prewarm completes within the preparation bound',{preparationMs:result.preparationMs,boundMs:result.boundMs});
}
