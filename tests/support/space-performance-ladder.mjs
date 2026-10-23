import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { environmentValid } from './ladder-control.mjs';
import { spawn } from 'node:child_process';
import { ev, within, LIMITS, idleWithin } from './bounded.mjs';
export const LADDER_MANIFEST='tests/reference/performance-ladder-v1.json';
export function ladderCells(manifest){const cells=[];for(const instrumentation of manifest.instrumentation)for(const scene of manifest.scenes)for(let repetition=1;repetition<=manifest.repetitions;repetition++)for(const mode of manifest.modes)for(const [position,rung] of manifest.order.entries())cells.push({scene,repetition,mode,instrumentation,position,rung});return cells;}
const p95=values=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]:null;
// One browser session runs every selected cell: ATLAS_LADDER_CELLS (a JSON array), the single
// ATLAS_LADDER_CELL, or else all registered cells. Every selected cell must be registered.
export function ladderSelection(manifest,env=process.env){
  const cells=ladderCells(manifest);
  const selected=env.ATLAS_LADDER_CELLS?JSON.parse(env.ATLAS_LADDER_CELLS):env.ATLAS_LADDER_CELL?[JSON.parse(env.ATLAS_LADDER_CELL)]:cells;
  if(!Array.isArray(selected)||!selected.length)throw Error('ladder selection must be a nonempty array of registered cells');
  for(const cell of selected)if(!cells.some(c=>JSON.stringify(c)===JSON.stringify(cell)))throw Error(`not a registered cell: ${JSON.stringify(cell)}`);
  return selected;
}
export function ladderMetrics(events,durationMs,windows={orbit:{start:0,end:durationMs}}){
  const requests=new Map(events.filter(e=>e.type==='request').map(e=>[e.identity.requestId,e]));
  const first=new Map();
  for(const e of events)if(e.type==='presenter-completion'&&requests.has(e.identity.requestId)&&!first.has(e.identity.requestId))first.set(e.identity.requestId,e);
  const confirmed=events.filter(e=>e.type==='confirmed-completion'||e.type==='report'&&e.report.outcome==='completed'&&e.report.requested.quality.profile==='draft'&&e.report.completed?.samples===1);
  const benchmark=events.filter(e=>e.type==='benchmark-completion');
  const id=e=>e.identity?.requestId??e.report.requestId;
  const draft=e=>requests.has(id(e))&&!requests.get(id(e)).settled;
  const inOrbit=e=>draft(e)&&(requests.get(id(e)).phase??'orbit')==='orbit'&&e.at>=windows.orbit.start&&e.at<=windows.orbit.end;
  const seconds=(windows.orbit.end-windows.orbit.start)/1000;
  const phases={};
  for(const phase of Object.keys(windows)) {
    const completions=[...first.values()].filter(e=>(requests.get(id(e)).phase??'orbit')===phase);
    phases[phase]={latencyP95Ms:p95(completions.map(e=>e.queueCompletedAt-requests.get(id(e)).requestedAt)),presenterCompletions:completions.length};
  }
  const orbit=[...first.values()].filter(e=>draft(e)&&(requests.get(id(e)).phase??'orbit')==='orbit'&&e.queueCompletedAt>=windows.orbit.start&&e.queueCompletedAt<=windows.orbit.end).sort((a,b)=>a.queueCompletedAt-b.queueCompletedAt);
  return {latencyP95Ms:p95(orbit.map(e=>e.queueCompletedAt-requests.get(id(e)).requestedAt)),
    consecutiveIntervalP95Ms:p95(orbit.slice(1).map((e,i)=>e.queueCompletedAt-orbit[i].queueCompletedAt)),phases,orbitWindow:windows.orbit,
    confirmedDraftsPerSecond:new Set(confirmed.filter(inOrbit).map(id)).size/seconds,benchmarkDraftsPerSecond:new Set(benchmark.filter(inOrbit).map(id)).size/seconds,
    requested:[...requests.values()].filter(e=>!e.settled).length,presenterCompletions:first.size,confirmed:new Set(confirmed.filter(draft).map(id)).size,benchmark:new Set(benchmark.filter(draft).map(id)).size,
    settledMilestones:events.filter(e=>e.type==='report'&&e.report.requested.quality.profile==='settled').map(e=>({requestId:e.report.requestId,outcome:e.report.outcome,...e.report.milestones})),
    p3Acceptance:'unavailable: diagnostic ladder; run frozen P3 separately on the default product',failures:events.filter(e=>e.type==='failure'||e.type==='report'&&['failed','interrupted','budget-exceeded'].includes(e.report.outcome))};
}
export function classifyLadder(result){
  if(!environmentValid(result.environmentProbe))return {state:'failed-harness',reason:'visibility or idle round-trip check failed',acceptance:false};
  if(result.metrics.confirmed+result.metrics.benchmark===0)return {state:'failed-harness',reason:'zero completed drafts',acceptance:false};
  return {state:result.metrics.failures.length||result.tasks.length?'failed':result.timings.some(t=>t.invalidated)?'inconclusive':'measured',acceptance:false};
}
export function compareLadder(results,manifest){
  if(results.some(r=>r.sessionId)&&new Set(results.map(r=>r.sessionId)).size!==1)return {state:'incomplete',reason:'cells must share one browser session'};
  const keys=results.map(r=>JSON.stringify([r.cell.mode,r.cell.position]));
  if(new Set(keys).size!==keys.length)return {state:'incomplete',reason:'duplicate measurement cells require explicit attempt disposition'};
  if(results.some(r=>r.classification&&r.classification.state!=='measured'))return {state:'incomplete',reason:'failed or timing-invalidated cells cannot establish layer budgets'};
  const pair=(rung,position)=>{
    const find=mode=>results.find(r=>r.cell.rung===rung&&(position===undefined||r.cell.position===position)&&(!r.cell.mode||r.cell.mode===mode));
    const paced=find('paced'),unpaced=find('unpaced');if(!paced||!unpaced)return null;
    return {L:paced.metrics.latencyP95Ms,T:rung==='L0'||/^L[123]$/.test(rung)?unpaced.metrics.benchmarkDraftsPerSecond:unpaced.metrics.confirmedDraftsPerSecond};
  };
  const start=pair('L0',0),end=pair('L0',manifest.order.length-1);
  if(!start||!end)return {state:'incomplete',reason:'paced and unpaced cells for both L0 brackets are required'};
  const L0=(start.L+end.L)/2,T0=(start.T+end.T)/2;
  if(!(L0>0&&T0>0))return {state:'incomplete',reason:'finite positive baseline endpoints required'};
  const comparisons=[];
  for(const [rung,previous] of Object.entries(manifest.comparison.previous)){
    const r=pair(rung),p=pair(previous);if(!r||!p||!Number.isFinite(r.L)||!Number.isFinite(r.T)){comparisons.push({rung,state:'incomplete'});continue;}
    const latency=(r.L-p.L)/L0,throughput=(p.T-r.T)/T0,limits=manifest.comparison.limits[rung];
    comparisons.push({rung,previous,...(rung.startsWith('L6')?{mechanism:'lifecycle'}:{}),L:r.L,T:r.T,latency,throughput,cumulativeLatency:(r.L-L0)/L0,cumulativeThroughput:(T0-r.T)/T0,limits,state:latency<=limits.latency&&throughput<=limits.throughput?'within-budget':'peer-disposition-required'});
  }
  return {state:comparisons.some(c=>c.state==='incomplete')?'incomplete':'measured',L0,T0,comparisons};
}

async function runInPage({manifest,workload,cell}){
  const {createDraftLadderDriver}=await import('/tests/support/draft-ladder-driver.mjs');
  const {timestampAcquisition}=await import('/tests/support/ladder-timestamps.mjs');
  const {scheduleAbsolute}=await import('/tests/support/timing.mjs');
  const {runUnpaced}=await import('/tests/support/ladder-control.mjs');
  const selected=workload.scenes.find(s=>s.id===cell.scene),orbit=workload.workloads.orbit.cameraPoses[cell.scene];
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:1280px;height:720px;z-index:10000';document.body.append(canvas);
  const marker=document.createElement('div');marker.textContent='Validating — provisional';marker.style.cssText='position:fixed;top:0;left:0;z-index:10001;background:#000;color:#ffe000;font:bold 20px sans-serif;padding:8px';marker.hidden=true;document.body.append(marker);
  const timestamp=cell.instrumentation==='timestamps'?timestampAcquisition():null;
  const driver=await createDraftLadderDriver({canvas,scene:selected.scene,rung:cell.rung,acquire:timestamp?.acquire,onEvent:e=>{if(e.type==='provisional')marker.hidden=false;if(e.type==='confirmation'&&!e.historical||e.type==='restoration')marker.hidden=true;}});
  const tasks=[],timings=[],issued=[],longTasks=[],committed=[],windows={};let observer,observerError=null;
  try{observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({startTime:e.startTime,duration:e.duration}))));observer.observe({type:'longtask',buffered:true});}catch(error){observerError=String(error);}
  globalThis.__ladderPartial={cell,events:driver.events,issued,timings,longTasks};
  let pending=null;const active=new Set();let phase='warmup';
  function start(scene,index,requestedAt,settled=false,requestPhase=phase){
    issued.push({phase:requestPhase,index,requestedAt,settled,submittedAt:performance.now()});
    const promise=driver.submit(scene,{requestedAt,settled,phase:requestPhase}).then(result=>{if(settled)committed.push(result);if(['failed','interrupted','budget-exceeded'].includes(result.outcome))throw Error(result.reason??result.outcome);return result;}).catch(error=>{tasks.push({error:String(error),phase:requestPhase,index});return {outcome:'failed',reason:String(error)};}).finally(()=>{active.delete(promise);if(pending){const p=pending;pending=null;start(...p);}});active.add(promise);return promise;
  }
  async function drain(){while(active.size||pending)await Promise.all([...active]);await driver.drain();await timestamp?.drain();}
  const sceneAt=camera=>({...structuredClone(selected.scene),camera});
  const issue=(scene,index,requestedAt,settled=false)=>{if(active.size<2)start(scene,index,requestedAt,settled);else{if(pending)issued.push({phase,index:pending[1],requestedAt:pending[2],coalesced:true});pending=[scene,index,requestedAt,settled,phase];}};
  let startTime,endTime;
  try{
    for(let i=0;i<manifest.warmup.poses;i++)await driver.submit(sceneAt(orbit[i].camera));await drain();driver.events.length=0;timestamp?.samples.splice(0);longTasks.length=0;
    startTime=performance.now();
    if(cell.mode==='unpaced'){
      phase='orbit';let index=0;windows.orbit={start:performance.now()};
      await runUnpaced({poses:Array.from({length:manifest.unpaced.copies},()=>orbit).flat(),lifecycle:driver.config.lifecycle,submit:pose=>start(sceneAt(pose.camera),index++,performance.now())});
      await drain();windows.orbit.end=performance.now();
    }else{
      async function cameras(name,poses){
        phase=name;const base=performance.now();windows[name]={start:base,end:base+workload.workloads[name].durationMs};
        timings.push(await scheduleAbsolute({clock:()=>performance.now(),setTimer:setTimeout},poses.map(p=>base+p.requestTimeMs),(time,i)=>issue(sceneAt(poses[i].camera),i,time.issuedAt,i===poses.length-1)));
        phase=`settled-after-${name}`;await drain();
        if(committed.at(-1)?.outcome!=='completed')throw Error(`${name} final settled render did not complete`);
      }
      await cameras('orbit',orbit);
      await cameras('interaction',workload.workloads.interaction.cameraPoses[cell.scene]);
      phase='stress';const stress=workload.workloads.stress,base=performance.now(),alternation=stress.alternations[cell.scene],camera=workload.workloads.interaction.cameraPoses[cell.scene].at(-1).camera;
      windows.stress={start:base,end:base+stress.durationMs};
      timings.push(await scheduleAbsolute({clock:()=>performance.now(),setTimer:setTimeout},Array.from({length:stress.editRule.count},(_,i)=>base+i*stress.editRule.spacingMs),(time,i)=>{const s=sceneAt(camera);s.parameters[alternation.path.split('.')[1]]=i%2?alternation.base:alternation.alternate;issue(s,i,time.issuedAt,true);}));
      await scheduleAbsolute({clock:()=>performance.now(),setTimer:setTimeout},[base+stress.durationMs],()=>{});await drain();
    }
    endTime=performance.now();
    phase='coverage-replay';const checkpoints=[];
    if(cell.mode==='paced')for(const point of workload.coverageCheckpoints.materialized[cell.scene]){const r=await driver.submit(sceneAt(point.camera),{settled:point.kind!=='orbit'});checkpoints.push({kind:point.kind,orbitIndex:point.orbitIndex,outcome:r.outcome,counts:r.summary??r.report?.rayTermination});}
    await drain();observer?.disconnect();
    return {events:driver.events.filter(e=>e.at<=endTime),issued,timings,longTasks,observerError,tasks,checkpoints,startTime,endTime,durationMs:endTime-startTime,windows,timestamps:timestamp?.samples??'unavailable: uninstrumented repetition',instrumentation:timestamp?.diagnostics()??null,allocation:driver.backend.diagnostics().peak,allocationInventory:driver.backend.diagnostics().inventory,receipt:driver.receipt};
  }finally{await driver.destroy();await timestamp?.drain();observer?.disconnect();canvas.remove();marker.remove();}
}
async function runCell({page,url,environment,report,pass,cell,sessionId}){
  const manifestBytes=await readFile(LADDER_MANIFEST),manifest=JSON.parse(manifestBytes);
  assert.ok(ladderCells(manifest).some(c=>JSON.stringify(c)===JSON.stringify(cell)),'registered cell');
  const workloadBytes=await readFile(manifest.workload);assert.equal(createHash('sha256').update(workloadBytes).digest('hex'),manifest.workloadSha256);
  assert.equal(environment.chromeGpu?.vendorId,0x10de);assert.match(environment.webgpuStatus,/Hardware accelerated/i);
  const root=process.env.ATLAS_B15_REPORT_DIR??'/mnt/ml_storage/scratch/b15-r12-ladder';await mkdir(root,{recursive:true});
  const name=`${cell.instrumentation}-${cell.scene}-r${cell.repetition}-${cell.mode}-${cell.position}-${cell.rung}`;
  const clocks=[],clockErrors=[];const monitor=spawn('nvidia-smi',['--query-gpu=timestamp,clocks.gr,clocks.mem,power.draw,temperature.gpu','--format=csv','--loop-ms=1000'],{stdio:['ignore','pipe','pipe']});
  let monitorDone=false;const stopped=new Promise(resolve=>{monitor.once('error',error=>{clockErrors.push(String(error));monitorDone=true;resolve();});monitor.once('exit',(code,signal)=>{monitorDone=true;resolve({code,signal});});});
  monitor.stdout.on('data',data=>clocks.push(String(data)));monitor.stderr.on('data',data=>clockErrors.push(String(data)));
  const result={schema:'atlas.performance-ladder-evidence',schemaVersion:2,cell,sessionId,manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),workloadSha256:manifest.workloadSha256,environment};
  try{await page.goto(url);await page.waitForFunction(()=>document.body.dataset.ready==='true');await idleWithin(page);
    result.environmentProbe=await ev(page,async()=>{const {environmentProbe}=await import('/tests/support/ladder-control.mjs');return environmentProbe();},undefined,'per-cell visibility and idle fence probe');
    if(!environmentValid(result.environmentProbe)){result.classification={state:'failed-harness',reason:'visibility or idle round-trip check failed',acceptance:false};throw Error(result.classification.reason);}
    Object.assign(result,await ev(page,runInPage,{manifest,workload:JSON.parse(workloadBytes),cell},'registered ladder cell',500000));result.metrics=ladderMetrics(result.events,result.durationMs,result.windows);result.classification=classifyLadder(result);
  }catch(error){result.error=String(error.stack??error);try{result.partial=await ev(page,()=>globalThis.__ladderPartial??null,undefined,'partial ladder evidence');}catch{}throw error;
  }finally{if(!monitorDone)monitor.kill('SIGTERM');try{await within(stopped,5000,'clock monitor cleanup');}catch(error){monitor.kill('SIGKILL');result.cleanupFailure=String(error);process.exitCode=1;}
    result.clocks=clocks.join('');result.clockErrors=clockErrors;await writeFile(`${root}/${name}.json`,JSON.stringify(result)+'\n');report.push({name:'ladder evidence',cell,path:`${root}/${name}.json`,metrics:result.metrics,error:result.error});}
  assert.ok(result.allocation+(result.instrumentation?.peakInstrumentationBytes??0)<=2**30,'combined tracked product and instrumentation allocation cap');
  assert.notEqual(result.classification.state,'failed-harness',result.classification.reason);
  assert.equal(result.metrics.failures.length,0);assert.equal(result.tasks.length,0);assert.ok(result.clocks.length,'GPU clocks recorded');
  if(cell.mode==='unpaced'){assert.equal(result.issued.length,7500,'four copies without dropped poses');assert.equal(result.metrics.confirmed+result.metrics.benchmark,7500,'every unpaced pose completed');}
  pass('Registered bounded ladder cell completed',{cell,metrics:result.metrics});
}

export async function runPerformanceLadder(options){
  const manifest=JSON.parse(await readFile(LADDER_MANIFEST));
  const cells=ladderSelection(manifest);
  const sessionId=randomUUID();
  // The headed runner creates this page/browser once. Each cell reloads it, records its own
  // environment probe, and destroys its driver before the next cell begins.
  for(const cell of cells)await runCell({...options,cell,sessionId});
}
