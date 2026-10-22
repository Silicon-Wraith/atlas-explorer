import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftLadderDriver } from '../support/draft-ladder-driver.mjs';
import { createRendererDeviceDouble } from '../support/renderer-device-double.mjs';
import { productPipelineSet } from '../../src/space/render/webgpu/appearance.js';
import { createSpaceScene } from '../../src/space/scene-adapter.js';
import { DRAFT_RUNGS } from '../../src/space/render/draft-execution.js';

test('B15-REC-G ladder rungs execute distinct admission and ticket boundaries with common shader inputs',async()=>{
  for(const rung of DRAFT_RUNGS){
    const gpu=createRendererDeviceDouble(productPipelineSet(),{limits:{maxComputeWorkgroupsPerDimension:65535}});
    const driver=await createDraftLadderDriver({canvas:gpu.canvas,clock:()=>0,scene:createSpaceScene({model:'sphere'}),rung,acquire:gpu.acquire,loadSource:gpu.loadSource,format:'bgra8unorm'});
    try{
      const result=await driver.submit();assert.equal(result.outcome,'completed',`${rung}: ${JSON.stringify(result)}`);
      const leases=driver.events.filter(e=>e.type==='lease'&&!e.jobId?.includes('prepare'));
      assert.equal(leases.length,rung==='L0'||rung==='L1'?0:rung.endsWith('a')?2:1,rung);
      if(rung==='L0')assert.equal(driver.events.filter(e=>e.type==='ticket').length,0);
      if(rung==='L1')assert.equal(driver.events.filter(e=>e.type==='ticket').length,1);
      if(rung==='L4'||/^L5/.test(rung))assert.equal(driver.events.filter(e=>e.type==='validation').length,1);
    }finally{await driver.destroy();}
  }
});

test('B15-REC-G bounded L0 rejects a third live frame while benchmark fences are held',async()=>{
  const gpu=createRendererDeviceDouble(productPipelineSet(),{limits:{maxComputeWorkgroupsPerDimension:65535}});
  const driver=await createDraftLadderDriver({canvas:gpu.canvas,clock:()=>0,scene:createSpaceScene({model:'sphere'}),rung:'L0',acquire:gpu.acquire,loadSource:gpu.loadSource,format:'bgra8unorm'});
  try{gpu.control.fences.held=true;const a=driver.submit(),b=driver.submit();
    await assert.rejects(driver.submit(),/two live frame slots/);gpu.control.fences.release();
    assert.equal((await a).outcome,'completed');assert.equal((await b).outcome,'completed');
  }finally{await driver.destroy();}
});

test('B15-REC-G the registered ladder freezes targets budgets workload hash and common branch predecessors',async()=>{
  const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
  const {ladderCells,compareLadder}=await import('../support/space-performance-ladder.mjs');
  const manifest=JSON.parse(await readFile('tests/reference/performance-ladder-v1.json'));
  const bytes=await readFile(manifest.workload),workload=JSON.parse(bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.workloadSha256);assert.deepEqual(manifest.targets,workload.targets);
  assert.deepEqual(manifest.rungs,DRAFT_RUNGS);assert.equal(ladderCells(manifest).length,504);
  assert.equal(manifest.unpaced.total,7500);assert.equal(manifest.queue.liveFrames,2);assert.equal(manifest.queue.outstandingSubmissions,2);
  for(const v of 'abcd'){assert.equal(manifest.comparison.previous[`L5${v}`],'L4');assert.equal(manifest.comparison.previous[`L6${v}`],`L5${v}`);}
  assert.equal(manifest.comparison.limits.L2.latency,.05);assert.equal(manifest.comparison.limits.L5a.latency,.25);assert.equal(manifest.comparison.limits.L5d.throughput,.10);
  const results=manifest.order.map((rung,position)=>({cell:{rung,position},metrics:{latencyP95Ms:rung==='L5a'?12:10,benchmarkDraftsPerSecond:100,confirmedDraftsPerSecond:100}}));
  const comparisons=compareLadder(results,manifest).comparisons;
  assert.equal(comparisons.find(c=>c.rung==='L5a').latency,.2);assert.equal(comparisons.find(c=>c.rung==='L5b').latency,0);
  assert.equal(compareLadder(results.slice(1),manifest).state,'incomplete');
});
