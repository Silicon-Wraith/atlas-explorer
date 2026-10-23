import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftLadderDriver } from '../support/draft-ladder-driver.mjs';
import { createRendererDeviceDouble } from '../support/renderer-device-double.mjs';
import { productPipelineSet } from '../../src/space/render/webgpu/appearance.js';
import { createSpaceScene } from '../../src/space/scene-adapter.js';
import { DRAFT_RUNGS } from '../../src/space/render/draft-execution.js';

// One test per rung: each rung builds its own device double and driver, and the whole loop
// exceeded the runner's 10 s per-test bound under suite load. The assertions are unchanged.
for(const rung of DRAFT_RUNGS)test(`B15-REC-G ladder rungs execute distinct admission and ticket boundaries with common shader inputs (${rung})`,async()=>{
  {
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
  for (const variant of 'abcd') assert.equal(comparisons.find(c=>c.rung===`L6${variant}`).mechanism, 'lifecycle');
  assert.equal(comparisons.find(c=>c.rung==='L5a').latency,.2);assert.equal(comparisons.find(c=>c.rung==='L5b').latency,0);
  assert.equal(compareLadder(results.slice(1),manifest).state,'incomplete');
});

test('B15 r14 lower ladder drafts reuse the tracked product target pool', async () => {
  const gpu=createRendererDeviceDouble(productPipelineSet(),{limits:{maxComputeWorkgroupsPerDimension:65535}});
  const driver=await createDraftLadderDriver({canvas:gpu.canvas,clock:()=>0,scene:createSpaceScene({model:'sphere'}),rung:'L0',acquire:gpu.acquire,loadSource:gpu.loadSource,format:'bgra8unorm'});
  try {
    await driver.submit(); const count=gpu.control.natives.filter(n=>n.kind==='texture').length;
    await driver.submit();
    assert.equal(gpu.control.natives.filter(n=>n.kind==='texture').length,count);
    assert.ok(driver.backend.diagnostics().tracked>=640*360*76);
  } finally { await driver.destroy(); }
});

test('B15 r14 ladder metrics use orbit window and preserve phase latency', async () => {
  const {ladderMetrics}=await import('../support/space-performance-ladder.mjs');
  const events=[];
  for(const [id,at,latency,phase] of [['a',1000,10,'orbit'],['b',1500,20,'orbit'],['c',31000,200,'interaction']]) {
    const identity={requestId:id};
    events.push({type:'request',identity,requestedAt:at,phase},{type:'presenter-completion',identity,queueCompletedAt:at+latency},{type:'benchmark-completion',identity,at:at+latency});
  }
  const metrics=ladderMetrics(events,68000,{orbit:{start:1000,end:31000},interaction:{start:31000,end:61000}});
  assert.equal(metrics.benchmarkDraftsPerSecond,2/30);
  assert.equal(metrics.latencyP95Ms,20);
  assert.equal(metrics.phases.interaction.latencyP95Ms,200);
});

test('B15 r14 the per-cell environment gate rejects hidden pages and slow idle round trips, and records focus without gating on it', async () => {
  const {environmentValid}=await import('../support/ladder-control.mjs');
  const ok={visibilityState:'visible',hidden:false,hasFocus:false,idleFenceRttP95:.2,idleScopeRttP95:.2};
  assert.equal(environmentValid(ok),true);
  assert.equal(environmentValid({...ok,visibilityState:'hidden',hidden:true}),false);
  assert.equal(environmentValid({...ok,idleFenceRttP95:1.5}),false);
  assert.equal(environmentValid({...ok,idleScopeRttP95:1.5}),false);
  assert.equal(environmentValid({...ok,idleFenceRttP95:undefined}),false);
});

test('B15 r14 unpaced lifecycle cells issue the next pose only after a completion; lower rungs keep two slots busy', async () => {
  const {runUnpaced}=await import('../support/ladder-control.mjs');
  for(const lifecycle of [true,false]){
    let live=0,max=0;const poses=Array.from({length:6},(_,i)=>i);
    await runUnpaced({poses,lifecycle,submit:async()=>{live++;max=Math.max(max,live);await new Promise(r=>setTimeout(r,1));live--;return {outcome:'completed'};}});
    assert.equal(max,lifecycle?1:2,`lifecycle=${lifecycle}`);
  }
  await assert.rejects(runUnpaced({poses:[0,1],lifecycle:true,submit:async()=>({outcome:'superseded'})}),/failed-harness: unpaced draft did not complete \(superseded\)/);
});

test('B15 r14 a ladder cell with zero completed drafts is failed-harness, and comparison requires one browser session', async () => {
  const {classifyLadder,compareLadder}=await import('../support/space-performance-ladder.mjs');
  const env={visibilityState:'visible',hidden:false,hasFocus:true,idleFenceRttP95:.2,idleScopeRttP95:.2};
  const base={environmentProbe:env,metrics:{confirmed:0,benchmark:0,failures:[]},tasks:[],timings:[]};
  assert.equal(classifyLadder(base).state,'failed-harness');
  assert.equal(classifyLadder({...base,metrics:{...base.metrics,benchmark:3}}).state,'measured');
  assert.equal(classifyLadder({...base,environmentProbe:{...env,hidden:true,visibilityState:'hidden'},metrics:{...base.metrics,benchmark:3}}).state,'failed-harness');
  const {readFile}=await import('node:fs/promises');const manifest=JSON.parse(await readFile('tests/reference/performance-ladder-v1.json'));
  const results=manifest.order.map((rung,position)=>({sessionId:position?'a':'b',cell:{rung,position,mode:'paced'},metrics:{latencyP95Ms:10,benchmarkDraftsPerSecond:100,confirmedDraftsPerSecond:100}}));
  assert.equal(compareLadder(results,manifest).state,'incomplete');
  assert.match(compareLadder(results,manifest).reason,/one browser session/);
});

test('B15 r14 several registered cells can be selected for one browser session', async () => {
  const {ladderCells,ladderSelection}=await import('../support/space-performance-ladder.mjs');
  const {readFile}=await import('node:fs/promises');const manifest=JSON.parse(await readFile('tests/reference/performance-ladder-v1.json'));
  const cells=ladderCells(manifest);
  assert.equal(ladderSelection(manifest,{}).length,cells.length);
  assert.deepEqual(ladderSelection(manifest,{ATLAS_LADDER_CELL:JSON.stringify(cells[3])}),[cells[3]]);
  assert.deepEqual(ladderSelection(manifest,{ATLAS_LADDER_CELLS:JSON.stringify([cells[0],cells[6]])}),[cells[0],cells[6]]);
  assert.throws(()=>ladderSelection(manifest,{ATLAS_LADDER_CELLS:JSON.stringify([{...cells[0],rung:'L9'}])}),/registered cell/);
});

test('B15 r14b one failed ladder cell is recorded and isolated; the session continues and reports every failed cell', async () => {
  const {runLadderSession}=await import('../support/space-performance-ladder.mjs');
  const cells=[{position:0,rung:'L0'},{position:1,rung:'L1'},{position:2,rung:'L2'}],attempted=[],report=[];
  await assert.rejects(runLadderSession({cells,report,runCell:async cell=>{attempted.push(cell.rung);if(cell.rung==='L1')throw Error('boom');}}),/1 of 3 ladder cells failed: .*L1/);
  assert.deepEqual(attempted,['L0','L1','L2']);
  const summary=report.find(r=>r.name==='ladder session summary');
  assert.deepEqual(summary.failed.map(f=>f.cell.rung),['L1']);assert.match(summary.failed[0].error,/boom/);
  assert.equal(summary.attempted,3);assert.equal(summary.passed,2);
  const clean=[];await runLadderSession({cells,report:clean,runCell:async()=>{}});
  assert.deepEqual(clean.find(r=>r.name==='ladder session summary').failed,[]);
});
